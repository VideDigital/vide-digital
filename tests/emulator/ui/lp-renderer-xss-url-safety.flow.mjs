// LP-SEC-AUDIT-001 (Stored XSS / HTML injection) e LP-SEC-AUDIT-002 (URLs/
// protocolos perigosos) — hardening dos renderers ativos de Landing Pages.
//
// Prova, via UI de produção real (não simula em JS puro, mesmo padrão de
// studio-codigo-iframe-sandbox.flow.mjs — PR #62): que um funcionário
// autorizado consegue salvar um payload que antes seria executável (via
// campo comum de bloco, não codigo_iframe), que o preview autenticado do
// dashboard nunca executa esse payload, que a publicação preserva o
// payload como dado (não sanitiza na escrita — a defesa é só no render,
// mesmo contrato de studio-codigo-iframe-sandbox.flow.mjs), que o renderer
// público também nunca executa, que um link javascript: nunca navega, que
// conteúdo legítimo (URL https, imagem https) continua funcionando, e que
// o hotfix da PR #62 (sandbox do codigo_iframe) não regrediu.
import assert from "node:assert/strict";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
    captureDiagnostics,
    coletarErrosConsole,
    ehErroDeRedeExterno,
    launchBrowser,
    loginReal,
    startStaticServer
} from "./_helpers.mjs";

const PROJECT_ID = "demo-vide-hub";
const STORE_UID = "owner-pro";
const STORE_SLUG = "loja-pro-local";
const SUFIXO = Date.now();
const LP_ID = `lp_test_xss_url_safety_${SUFIXO}`;
const BLOCO_TEXTO_ID = `${LP_ID}_texto`;
const BLOCO_NAV_ID = `${LP_ID}_nav`;
const BLOCO_IFRAME_ID = `${LP_ID}_iframe`;

// Payload de texto: fecha a tag <h2>/<p> (se não escapado) e tenta marcar
// uma variável no window do documento onde for inserido. Inofensivo: não
// acessa Firestore, não captura dado nenhum, não faz request externo.
const XSS_TEXT_PAYLOAD = '"><svg onload="window.__lpXssTextMarker=true"><script>window.__lpXssScriptMarker=true;</script>';
// Payload de URL: se não validado, vira um href clicável que executa JS.
const XSS_URL_PAYLOAD = "javascript:window.__lpXssUrlMarker=true";
const URL_LEGITIMA = "https://exemplo.com/promocao";
const IMAGEM_LEGITIMA = "https://exemplo.com/foto.jpg";

// Mesmo payload inofensivo do teste da PR #62 — não deve regredir.
const CODIGO_IFRAME_PAYLOAD_HTML = `<script>
window.__iframeExecutouInternamente = true;
try {
  window.parent.__iframeEscapeProbe = "executed";
  window.__iframeConseguiuEscapar = true;
} catch (err) {
  window.__parentBloqueado = true;
  window.__erroBloqueio = String(err && err.name || err);
}
<\/script>`;

function adminDb() {
    if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
    return getFirestore();
}

async function seedLp(db) {
    await db.collection("landing_pages").doc(LP_ID).set({
        donoUID: STORE_UID, titulo: "LP Seguranca XSS/URL QA", pagina: `lp-xss-url-safety-qa-${SUFIXO}`,
        publicado: false, modoLayout: "empilhado", paginas: [],
        ordemBlocos: [BLOCO_TEXTO_ID, BLOCO_NAV_ID, BLOCO_IFRAME_ID],
        criadoEm: Date.now(), atualizadoEm: Date.now()
    });
    // texto_midia semeado com conteúdo legítimo — o payload de texto é
    // injetado depois via UI REAL do editor (cenário "employee salva
    // conteúdo malicioso"), não via Admin SDK.
    await db.collection("landing_pages_blocos").doc(BLOCO_TEXTO_ID).set({
        lpId: LP_ID, donoUID: STORE_UID, tipo: "texto_midia", paginaId: null, visivel: true,
        props: { titulo: "Titulo original", subtitulo: "Subtitulo original", botaoTexto: "Comprar", botaoLink: URL_LEGITIMA, imagemB64: IMAGEM_LEGITIMA },
        design: {}, x: null, y: null, largura: null, altura: null, zIndex: null
    });
    // navegacao com um link javascript: já persistido — cobre o caso de
    // escrita direta (fora da UI, já que Rules não validam esquema de
    // URL) chegando ao renderer.
    await db.collection("landing_pages_blocos").doc(BLOCO_NAV_ID).set({
        lpId: LP_ID, donoUID: STORE_UID, tipo: "navegacao", paginaId: null, visivel: true,
        props: { logoTexto: "Minha Loja", links: [{ href: XSS_URL_PAYLOAD, label: "Link malicioso" }, { href: URL_LEGITIMA, label: "Link legitimo" }] },
        design: {}, x: null, y: null, largura: null, altura: null, zIndex: null
    });
    await db.collection("landing_pages_blocos").doc(BLOCO_IFRAME_ID).set({
        lpId: LP_ID, donoUID: STORE_UID, tipo: "codigo_iframe", paginaId: null, visivel: true,
        props: { htmlCustom: CODIGO_IFRAME_PAYLOAD_HTML, altura: 200 },
        design: {}, x: null, y: null, largura: null, altura: null, zIndex: null
    });
}

async function limparEstado(db) {
    await db.collection("landing_pages").doc(LP_ID).delete().catch(() => {});
    for (const id of [BLOCO_TEXTO_ID, BLOCO_NAV_ID, BLOCO_IFRAME_ID]) {
        await db.collection("landing_pages_blocos").doc(id).delete().catch(() => {});
        await db.collection("landing_pages_blocos_publicas").doc(id).delete().catch(() => {});
    }
    await db.collection("landing_pages_publicas").doc(`${STORE_SLUG}__lp-xss-url-safety-qa-${SUFIXO}`.toLowerCase()).delete().catch(() => {});
}

async function localizarFrameDoIframeCustom(page) {
    await page.waitForFunction(
        () => Array.from(document.querySelectorAll("iframe")).some((f) => f.getAttribute("sandbox") !== null),
        undefined,
        { timeout: 15000 }
    );
    const handle = await page.waitForSelector("iframe[sandbox]", { state: "attached", timeout: 15000 });
    const frame = await handle.contentFrame();
    assert.ok(frame, "o iframe do bloco codigo_iframe precisa ter um frame de conteúdo acessível");
    return frame;
}

async function main() {
    const { baseUrl, close } = await startStaticServer();
    const browser = await launchBrowser();
    const db = adminDb();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const erros = coletarErrosConsole(page);
    let falhou = false;

    try {
        await seedLp(db);
        await loginReal(page, baseUrl, { email: "owner.pro@local.test", senha: "Local123!pro" });

        // ===== 1/2/3/4) Employee/owner autorizado salva payload malicioso
        // via UI real do editor; preview autenticado nunca executa =====
        await page.evaluate((lpId) => window.editarLP(lpId), LP_ID);
        await page.waitForSelector("#lped-preview-canvas", { state: "attached", timeout: 15000 });

        // Localiza o bloco texto_midia na lista lateral e edita o título
        // pelo textarea/input REAL do painel de propriedades (não seta
        // props direto em JS) — mesmo padrão de studio-custom-fields-
        // authoring.flow.mjs (usa a UI de produção, não bypassa).
        const indiceBlocoTexto = await page.evaluate(() => window.lpEditorBlocos.findIndex((b) => b.tipo === "texto_midia"));
        assert.ok(indiceBlocoTexto >= 0, "bloco texto_midia semeado precisa existir em lpEditorBlocos");
        const cardBloco = page.locator(`[data-lped-block-index="${indiceBlocoTexto}"]`);
        await cardBloco.locator('[data-aura-mobile-card-trigger], .cursor-pointer').first().click();
        const inputTitulo = cardBloco.locator('input[placeholder="Titulo"]').first();
        await inputTitulo.waitFor({ state: "visible", timeout: 10000 });
        await inputTitulo.fill(XSS_TEXT_PAYLOAD);
        // Dispara o oninput real (fill já dispara input, mas o handler é
        // "this.value" — precisamos garantir que o estado em memória
        // (lpEditorBlocos) foi atualizado antes de salvar).
        await inputTitulo.dispatchEvent("input");
        await page.waitForFunction(
            (idx, payload) => window.lpEditorBlocos[idx]?.props?.titulo === payload,
            [indiceBlocoTexto, XSS_TEXT_PAYLOAD],
            { timeout: 5000 }
        );

        // Nenhum marcador pode ter disparado no documento do dashboard
        // enquanto o payload só existe em memória/preview.
        const marcadoresAntesDoSave = await page.evaluate(() => ({
            svg: window.__lpXssTextMarker === true,
            script: window.__lpXssScriptMarker === true
        }));
        assert.deepEqual(marcadoresAntesDoSave, { svg: false, script: false }, "payload não pode executar no documento do dashboard nem durante a digitação/preview");

        // Preview do canvas mostra o payload como TEXTO (escapado), não
        // como marcação ativa — confirmado direto no DOM real.
        const previewTexto = await page.locator("#lped-preview-canvas").innerText();
        assert.ok(previewTexto.includes(XSS_TEXT_PAYLOAD) || previewTexto.includes('svg onload="window.__lpXssTextMarker=true"'), "o texto do payload precisa aparecer como conteúdo visível (dado), não desaparecer silenciosamente");
        const previewTemSvgAtivo = await page.locator("#lped-preview-canvas svg[onload]").count();
        assert.equal(previewTemSvgAtivo, 0, "o preview não pode ter criado um <svg onload> real no DOM");
        const previewTemScriptInjetado = await page.locator("#lped-preview-canvas script").count();
        assert.equal(previewTemScriptInjetado, 0, "o preview não pode ter criado uma tag <script> real no DOM a partir do payload");

        // ===== 5) Publicar =====
        const resultadoPublicar = await page.evaluate((lpId) => window.alternarPublicacaoLP(lpId, true), LP_ID);
        assert.equal(resultadoPublicar?.ok, true, "LP com payload malicioso precisa publicar normalmente (a defesa é no render, não na escrita)");

        // Confirma que a escrita pública preservou o dado bruto (sem
        // sanitização na escrita) — a defesa tem que estar 100% no render.
        const blocoPublicoTexto = (await db.collection("landing_pages_blocos_publicas").doc(BLOCO_TEXTO_ID).get()).data();
        assert.equal(blocoPublicoTexto?.props?.titulo, XSS_TEXT_PAYLOAD, "o payload de texto precisa ter sido publicado sem sanitização na escrita");
        const blocoPublicoNav = (await db.collection("landing_pages_blocos_publicas").doc(BLOCO_NAV_ID).get()).data();
        assert.equal(blocoPublicoNav?.props?.links?.[0]?.href, XSS_URL_PAYLOAD, "o link javascript: precisa ter sido publicado sem sanitização na escrita");

        await page.evaluate(() => window.fecharEditorLP?.());

        // ===== 6/7/8/9) Renderer público — executa a função REAL
        // renderizarBloco() de index.html (mesma técnica de
        // studio-codigo-iframe-sandbox.flow.mjs) contra os blocos
        // efetivamente publicados =====
        await page.goto(`${baseUrl}/index.html?p=${STORE_SLUG}/lp-xss-url-safety-qa-${SUFIXO}&useEmulator=true`, { waitUntil: "load", timeout: 30000 });
        await page.waitForFunction(
            () => (document.getElementById("lp-container")?.textContent || "").includes("Pagina nao encontrada"),
            undefined,
            { timeout: 20000 }
        );

        const { readFile } = await import("node:fs/promises");
        const path = await import("node:path");
        const { REPO_ROOT } = await import("./_helpers.mjs");
        const indexSource = await readFile(path.join(REPO_ROOT, "index.html"), "utf8");
        const startFn = indexSource.indexOf("async function renderizarBloco(bloco, modoLayout) {");
        assert.ok(startFn > 0, "não foi possível localizar renderizarBloco em index.html");
        const endFn = indexSource.indexOf("function mostrarErro() {", startFn);
        assert.ok(endFn > startFn, "não foi possível localizar o fim de renderizarBloco em index.html");
        const rendererSource = indexSource.slice(startFn, endFn);
        assert.match(rendererSource, /bloco\.tipo === "texto_midia"/, "o trecho extraído precisa conter o branch texto_midia");
        assert.match(rendererSource, /bloco\.tipo === "navegacao"/, "o trecho extraído precisa conter o branch navegacao");

        const blocosParaRender = [blocoPublicoTexto, blocoPublicoNav].map((b) => JSON.parse(JSON.stringify({ tipo: b.tipo, props: b.props, design: b.design || {} })));
        const htmlProduzido = await page.evaluate(async ({ rendererSource: src, blocos }) => {
            const renderizarBlocoReal = new Function(`${src}; return renderizarBloco;`)();
            let html = "";
            for (const bloco of blocos) html += await renderizarBlocoReal(bloco, "empilhado");
            return html;
        }, { rendererSource, blocos: blocosParaRender });

        assert.ok(!htmlProduzido.includes("<script"), "renderer público: HTML não pode conter <script literal");
        assert.ok(!/<svg\s+onload=/i.test(htmlProduzido), "renderer público: nenhum <svg onload> real pode sobreviver");
        assert.ok(!htmlProduzido.includes('href="javascript:'), "renderer público: href não pode apontar pra javascript:");
        assert.ok(htmlProduzido.includes(`href="${URL_LEGITIMA}"`), "renderer público: link legítimo (https) precisa continuar funcionando");
        assert.ok(htmlProduzido.includes(`src="${IMAGEM_LEGITIMA}"`), "renderer público: imagem legítima (https) precisa continuar renderizando");

        // Insere o HTML de verdade no DOM da página (mesmo padrão de
        // produção: container.insertAdjacentHTML) e confirma no navegador
        // REAL que nenhum marcador dispara e nenhum link javascript:
        // aparece clicável no DOM vivo.
        await page.evaluate((html) => {
            document.getElementById("lp-container").innerHTML = "";
            document.getElementById("lp-container").insertAdjacentHTML("beforeend", html);
        }, htmlProduzido);
        const marcadoresRendererPublico = await page.evaluate(() => ({
            svg: window.__lpXssTextMarker === true,
            script: window.__lpXssScriptMarker === true,
            url: window.__lpXssUrlMarker === true
        }));
        assert.deepEqual(marcadoresRendererPublico, { svg: false, script: false, url: false }, "nenhum marcador pode disparar no documento público real");
        const linkMaliciosoNoDom = await page.locator('a[href^="javascript:"]').count();
        assert.equal(linkMaliciosoNoDom, 0, "nenhum <a href=\"javascript:...\"> pode existir no DOM público real");
        const linkLegitimoVisivel = await page.locator(`a[href="${URL_LEGITIMA}"]`).count();
        assert.ok(linkLegitimoVisivel > 0, "o link legítimo precisa continuar presente e clicável no DOM");

        // ===== 10) codigo_iframe.htmlCustom — regressão da PR #62 =====
        const blocoPublicoIframe = (await db.collection("landing_pages_blocos_publicas").doc(BLOCO_IFRAME_ID).get()).data();
        const htmlIframe = await page.evaluate(async ({ rendererSource: src, bloco }) => {
            const renderizarBlocoReal = new Function(`${src}; return renderizarBloco;`)();
            return renderizarBlocoReal(bloco, "empilhado");
        }, { rendererSource, bloco: JSON.parse(JSON.stringify({ tipo: blocoPublicoIframe.tipo, props: blocoPublicoIframe.props, design: {} })) });
        assert.match(htmlIframe, /sandbox="allow-forms allow-popups allow-presentation allow-scripts"/);
        assert.ok(!htmlIframe.includes("allow-same-origin"), "codigo_iframe: sandbox NUNCA pode incluir allow-same-origin (regressão da PR #62)");

        await page.evaluate((html) => {
            document.getElementById("lp-container").innerHTML = "";
            document.getElementById("lp-container").insertAdjacentHTML("beforeend", html);
        }, htmlIframe);
        const frameIframe = await localizarFrameDoIframeCustom(page);
        await frameIframe.waitForFunction(() => window.__iframeExecutouInternamente === true, undefined, { timeout: 10000 });
        const resultadoIframe = await frameIframe.evaluate(() => ({
            parentBloqueado: window.__parentBloqueado === true,
            conseguiuEscapar: window.__iframeConseguiuEscapar === true
        }));
        assert.equal(resultadoIframe.conseguiuEscapar, false, "codigo_iframe: script do iframe NUNCA pode conseguir marcar window.parent");
        assert.equal(resultadoIframe.parentBloqueado, true, "codigo_iframe: catch precisa ter capturado o SecurityError (isolamento real do navegador ainda funcionando)");

        const errosRelevantes = erros.filter((erro) => !ehErroDeRedeExterno(erro));
        assert.deepEqual(errosRelevantes, [], `Erros de console: ${JSON.stringify(errosRelevantes)}`);
        console.log("lp-renderer-xss-url-safety.flow: OK — payload de texto/URL neutralizado no editor e no renderer público, conteúdo legítimo preservado, sandbox do codigo_iframe (PR #62) sem regressão.");
    } catch (error) {
        falhou = true;
        await captureDiagnostics(page, "lp-renderer-xss-url-safety", erros.filter((erro) => !ehErroDeRedeExterno(erro))).catch(() => {});
        console.error("lp-renderer-xss-url-safety.flow: FALHOU —", error);
    } finally {
        await limparEstado(db);
        await page.close();
        await browser.close();
        await close();
    }

    if (falhou) process.exit(1);
}

await main();
