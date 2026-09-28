// VIDE-HUB-PLAYWRIGHT-PROMISE-RETENTION-044 — prova isolada (sem Firebase,
// sem Emulator) do helper executarOperacaoPaginaAsync de _helpers.mjs.
// Roda num Chromium real com uma página estática, então não depende de
// egress pro gstatic.com. Cobre: resolve, rejeição, função inexistente,
// { ok:false } devolvido intacto, cleanup do registry, ausência de retry,
// referência forte enquanto pending (inclusive sob GC forçado via CDP) e
// timeout explícito. Também documenta a assinatura original: uma Promise
// pendente inalcançável aguardada direto por page.evaluate vira
// "Execution context was destroyed" depois de um GC, sem navegação.
import assert from "node:assert/strict";
import {
    launchBrowser,
    iniciarOperacaoPagina,
    aguardarOperacaoPagina,
    executarOperacaoPaginaAsync
} from "./_helpers.mjs";

const REGISTRY = "__videHubPlaywrightAsyncOps";

async function tamanhoRegistry(page) {
    return page.evaluate((nome) => Object.keys(window[nome] || {}).length, REGISTRY);
}

async function main() {
    const browser = await launchBrowser();
    const page = await browser.newPage();
    const cdp = await page.context().newCDPSession(page);
    const coletarLixo = () => cdp.send("HeapProfiler.collectGarbage");
    try {
        await page.setContent("<!doctype html><html><body>helper</body></html>");
        await page.evaluate(() => {
            window.__chamadas = 0;
            window.operacaoOk = async (valor) => {
                window.__chamadas += 1;
                await new Promise((r) => setTimeout(r, 20));
                return { ok: true, valor };
            };
            window.operacaoFalhaControlada = async () => {
                window.__chamadas += 1;
                return { ok: false, motivo: "slug-em-uso" };
            };
            window.operacaoRejeita = async () => {
                window.__chamadas += 1;
                throw new TypeError("falha real da página");
            };
        });

        // 1. resolve → devolve o resultado, uma única chamada, registry limpo
        const ok = await executarOperacaoPaginaAsync(page, async (v) => window.operacaoOk(v), "abc", { rotulo: "operacaoOk" });
        assert.deepEqual(ok, { ok: true, valor: "abc" });
        assert.equal(await page.evaluate(() => window.__chamadas), 1, "a operação roda exatamente uma vez");
        assert.equal(await tamanhoRegistry(page), 0, "registry limpo depois de fulfilled");

        // 4. { ok:false } é devolvido intacto — a asserção é do teste, não do helper
        const falhaControlada = await executarOperacaoPaginaAsync(page, async () => window.operacaoFalhaControlada());
        assert.deepEqual(falhaControlada, { ok: false, motivo: "slug-em-uso" });

        // 2. rejeição → o helper FALHA, com nome/mensagem/stack da página, sem retry
        await page.evaluate(() => { window.__chamadas = 0; });
        await assert.rejects(
            executarOperacaoPaginaAsync(page, async () => window.operacaoRejeita(), undefined, { rotulo: "operacaoRejeita" }),
            (e) => /operacaoRejeita" rejeitou: TypeError: falha real da página/.test(e.message) &&
                e.erroPagina?.name === "TypeError" && typeof e.erroPagina?.stack === "string"
        );
        assert.equal(await page.evaluate(() => window.__chamadas), 1, "rejeição nunca dispara retry");
        assert.equal(await tamanhoRegistry(page), 0, "registry limpo depois de rejected");

        // 3. função inexistente → falha clara (TypeError da página), nunca sucesso
        await assert.rejects(
            executarOperacaoPaginaAsync(page, async () => window.funcaoQueNaoExiste(), undefined, { rotulo: "inexistente" }),
            (e) => /"inexistente" rejeitou: TypeError: .*funcaoQueNaoExiste/.test(e.message)
        );

        // 8. enquanto pending, a Promise real fica fortemente referenciada no
        // registry — inclusive depois de GC forçado — e então assenta normal.
        const chave = await iniciarOperacaoPagina(page, async () => {
            const resultado = await new Promise((resolve) => { window.__liberar = resolve; });
            return { ok: resultado };
        });
        await coletarLixo();
        const enquantoPendente = await page.evaluate(({ nome, chave }) => {
            const entrada = window[nome][chave];
            return { status: entrada.status, temPromise: entrada.promise instanceof Promise };
        }, { nome: REGISTRY, chave });
        assert.deepEqual(enquantoPendente, { status: "pending", temPromise: true });
        await page.evaluate(() => window.__liberar(true));
        assert.deepEqual(await aguardarOperacaoPagina(page, chave, { rotulo: "liberada" }), { ok: true });
        assert.equal(await tamanhoRegistry(page), 0);

        // Operação alcançável sob GC forçado no meio: assenta normalmente.
        const chaveGc = await iniciarOperacaoPagina(page, async () => {
            await new Promise((r) => setTimeout(r, 300));
            return { ok: true };
        });
        await coletarLixo();
        assert.deepEqual(await aguardarOperacaoPagina(page, chaveGc, { rotulo: "gc-no-meio" }), { ok: true });

        // Assinatura original documentada: page.evaluate aguardando direto uma
        // Promise pendente inalcançável + GC → Playwright reporta
        // "Execution context was destroyed", sem navegação alguma.
        const urlAntes = page.url();
        const direto = page.evaluate(async () => { return await new Promise(() => {}); })
            .then(() => "resolveu", (e) => e.message);
        await new Promise((r) => setTimeout(r, 100));
        await coletarLixo();
        const mensagemDireta = await Promise.race([direto, new Promise((r) => setTimeout(() => r("pendente"), 5000))]);
        assert.match(String(mensagemDireta), /Execution context was destroyed/);
        assert.equal(page.url(), urlAntes, "nenhuma navegação ocorreu");

        // 5/6/timeout: a MESMA operação nunca-assentável pelo helper falha como
        // timeout explícito da operação — jamais como sucesso — e não repete.
        await page.evaluate(() => { window.__chamadas = 0; });
        await assert.rejects(
            executarOperacaoPaginaAsync(page, async () => {
                window.__chamadas += 1;
                return await new Promise(() => {});
            }, undefined, { rotulo: "nunca-assenta", timeoutMs: 500 }),
            (e) => /"nunca-assenta" .* não assentou em 500ms \(status=pending\)/.test(e.message)
        );
        assert.equal(await page.evaluate(() => window.__chamadas), 1, "timeout nunca dispara retry");
        assert.equal(await tamanhoRegistry(page), 0, "registry não cresce depois de timeout");

        // Registry perdido (página realmente recarregou) → falha explícita.
        const chaveRecarga = await iniciarOperacaoPagina(page, async () => new Promise(() => {}));
        await page.reload();
        await assert.rejects(
            aguardarOperacaoPagina(page, chaveRecarga, { rotulo: "recarga" }),
            (e) => /sumiu do registry/.test(e.message)
        );

        // Argumento não serializável é recusado antes de tocar a página.
        await assert.rejects(iniciarOperacaoPagina(page, async (x) => x, () => {}), TypeError);

        console.log("page-async-operation.flow: OK — resolve, rejeição, inexistente, {ok:false}, cleanup, sem retry, referência forte sob GC, timeout, recarga; assinatura original reproduzida (GC + evaluate direto → 'Execution context was destroyed' sem navegação).");
    } finally {
        await browser.close();
    }
}

main().catch((erro) => {
    console.error("page-async-operation.flow: FALHOU —", erro);
    process.exitCode = 1;
});
