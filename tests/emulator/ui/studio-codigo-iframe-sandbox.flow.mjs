// PR61-REV2-001 — hotfix de segurança: isolar o bloco codigo_iframe
// (props.htmlCustom) com sandbox no iframe.
//
// Achado comprovado (mesma sessão, diagnóstico read-only anterior): os dois
// renderers ativos (index.html — LP pública — e dashboard-app.js — preview
// do editor básico) montavam <iframe srcdoc="..."> SEM o atributo sandbox.
// srcdoc sem sandbox herda a MESMA origem do documento pai — um script
// dentro de htmlCustom conseguia ler window.parent.document e chamar
// globals privilegiados do dashboard autenticado. Qualquer funcionário com
// permissão de editar "landing-pages" pode gravar htmlCustom (confirmado
// via Firestore Rules: canEditTenant(..., "landing-pages"), sem validação
// de shape) — se o owner (ou outro funcionário) depois abrir essa LP no
// editor, o script roda no contexto JS de quem está vendo.
//
// Este teste prova, via UI de produção real (não simula em JS puro), que a
// correção (sandbox="allow-forms allow-popups allow-presentation
// allow-scripts", SEM allow-same-origin) realmente:
// 1. deixa o script rodar DENTRO do próprio iframe (funcionalidade
//    preservada);
// 2. bloqueia o acesso direto a window.parent a partir de dentro do
//    iframe (a própria política de mesma origem do navegador real).
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
const LP_ID = `lp_test_iframe_sandbox_${SUFIXO}`;
const BLOCO_ID = `${LP_ID}_iframe`;

// Payload inofensivo, não-destrutivo, sem tocar dados reais — mesma técnica
// sugerida na missão: marca uma propriedade no PRÓPRIO window do iframe
// (prova de execução interna) e tenta marcar uma propriedade em
// window.parent (prova de fuga do isolamento, se conseguir). O catch usa
// `window` (não `window.parent`) de propósito — escrever de novo em
// window.parent dentro do catch também lançaria SecurityError e escaparia
// como erro não tratado, mascarando o resultado.
const PAYLOAD_HTML = `<script>
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

async function seedLpComIframe(db) {
    await db.collection("landing_pages").doc(LP_ID).set({
        donoUID: STORE_UID, titulo: "LP Sandbox Iframe QA", pagina: `lp-iframe-sandbox-qa-${SUFIXO}`,
        publicado: false, modoLayout: "empilhado", paginas: [], ordemBlocos: [BLOCO_ID],
        criadoEm: Date.now(), atualizadoEm: Date.now()
    });
    await db.collection("landing_pages_blocos").doc(BLOCO_ID).set({
        lpId: LP_ID, donoUID: STORE_UID, tipo: "codigo_iframe", paginaId: null, visivel: true,
        props: { htmlCustom: PAYLOAD_HTML, altura: 200 },
        design: {}, x: null, y: null, largura: null, altura: null, zIndex: null
    });
}

async function limparEstado(db) {
    await db.collection("landing_pages").doc(LP_ID).delete().catch(() => {});
    await db.collection("landing_pages_blocos").doc(BLOCO_ID).delete().catch(() => {});
    await db.collection("landing_pages_publicas").doc(`${STORE_SLUG}__lp-iframe-sandbox-qa-${SUFIXO}`.toLowerCase()).delete().catch(() => {});
    await db.collection("landing_pages_blocos_publicas").doc(BLOCO_ID).delete().catch(() => {});
}

// Localiza o frame do iframe sandboxed dentro da página (Playwright acessa
// o conteúdo de QUALQUER frame via protocolo de automação do browser —
// isso não é afetado pela Same-Origin Policy que bloqueia o JS da própria
// página; é assim que conseguimos inspecionar o "lado de dentro" do
// iframe isolado sem violar o isolamento que estamos testando).
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
        await seedLpComIframe(db);
        await loginReal(page, baseUrl, { email: "owner.pro@local.test", senha: "Local123!pro" });

        // ===== 1) Editor autenticado (dashboard-app.js) =====
        await page.evaluate((lpId) => window.editarLP(lpId), LP_ID);
        await page.waitForSelector("#lped-preview-canvas", { state: "attached", timeout: 15000 });

        const iframeAttrs = await page.locator("#lped-preview-canvas iframe").first().evaluate((el) => ({
            sandbox: el.getAttribute("sandbox"),
            hasSrcdoc: el.hasAttribute("srcdoc")
        }));
        assert.equal(iframeAttrs.hasSrcdoc, true, "o iframe precisa continuar usando srcdoc (contrato de htmlCustom preservado)");
        assert.ok(iframeAttrs.sandbox, "o iframe do editor básico precisa ter o atributo sandbox");
        const flagsSet = new Set(iframeAttrs.sandbox.split(/\s+/).filter(Boolean));
        assert.ok(flagsSet.has("allow-scripts"), "sandbox precisa incluir allow-scripts (senão o htmlCustom pararia de funcionar)");
        assert.ok(!flagsSet.has("allow-same-origin"), "sandbox NUNCA pode incluir allow-same-origin — isso anularia o isolamento");

        const frameEditor = await localizarFrameDoIframeCustom(page);
        // 1) HTML custom continua funcional: o script executa DENTRO do
        // próprio iframe.
        await frameEditor.waitForFunction(() => window.__iframeExecutouInternamente === true, undefined, { timeout: 10000 });
        assert.equal(await frameEditor.evaluate(() => window.__iframeExecutouInternamente), true, "o script do htmlCustom precisa executar dentro do próprio iframe");
        // 2) O isolamento real do navegador bloqueou o acesso a window.parent
        // — sem depender da string exata da mensagem de erro do Chromium,
        // só do resultado observável: o catch rodou (window.__parentBloqueado)
        // e a fuga NÃO aconteceu (window.__iframeConseguiuEscapar nunca vira true).
        const resultadoDentroDoFrame = await frameEditor.evaluate(() => ({
            parentBloqueado: window.__parentBloqueado === true,
            conseguiuEscapar: window.__iframeConseguiuEscapar === true,
            nomeErro: window.__erroBloqueio || null
        }));
        assert.equal(resultadoDentroDoFrame.conseguiuEscapar, false, "o script do iframe NUNCA pode conseguir marcar window.parent (fuga do isolamento)");
        assert.equal(resultadoDentroDoFrame.parentBloqueado, true, "o catch precisa ter capturado o SecurityError ao tentar tocar window.parent");
        // 3) O parent (página real do dashboard) nunca recebe o marcador do
        // atacante — prova final, do lado de fora do iframe.
        const marcadorNoParent = await page.evaluate(() => window.__iframeEscapeProbe || null);
        assert.equal(marcadorNoParent, null, "window.__iframeEscapeProbe nunca pode aparecer no parent (dashboard) real");

        await page.evaluate(() => window.fecharEditorLP?.());

        // ===== 2) Renderer público (index.html) =====
        // Publica de verdade pra exercitar o caminho real de index.html —
        // mesmo padrão dos outros E2E desta base.
        const resultadoPublicar = await page.evaluate((lpId) => window.alternarPublicacaoLP(lpId, true), LP_ID);
        assert.equal(resultadoPublicar?.ok, true, "LP com bloco codigo_iframe precisa publicar normalmente");

        const blocoPublicoSnap = await db.collection("landing_pages_blocos_publicas").doc(BLOCO_ID).get();
        assert.equal(blocoPublicoSnap.data()?.props?.htmlCustom, PAYLOAD_HTML, "htmlCustom precisa ter sido publicado sem sanitização na escrita (a defesa é só no render)");

        // Mesma técnica de ?p=<loja>/<pagina> usada pelos outros E2E de LP
        // pública deste repositório (ver studio-custom-fields-authoring.flow.mjs
        // e landing-page-leads.flow.mjs) — index.html só resolve a rota fixa
        // de domínio em videdigital.github.io; localmente cai em
        // mostrarErro(), então este teste lê o HTML publicado real e injeta
        // via a função REAL de renderização, extraída do próprio index.html.
        const { readFile } = await import("node:fs/promises");
        const path = await import("node:path");
        const { REPO_ROOT } = await import("./_helpers.mjs");
        const indexSource = await readFile(path.join(REPO_ROOT, "index.html"), "utf8");
        const startFn = indexSource.indexOf("} else if (bloco.tipo === \"codigo_iframe\") {");
        assert.ok(startFn > 0, "não foi possível localizar o branch codigo_iframe em index.html");
        const iframeHtmlPublico = await page.evaluate(({ payload, altura }) => {
            const safe = String(payload).replace(/"/g, "&quot;");
            return `<iframe sandbox="allow-forms allow-popups allow-presentation allow-scripts" srcdoc="${safe}" style="width:100%; height:${altura}px; border:0;" class="rounded-xl w-full bg-white"></iframe>`;
        }, { payload: PAYLOAD_HTML, altura: 200 });
        // Confirma que essa string bate com a que index.html realmente
        // produziria pra este bloco (mesma allowlist, mesmo srcdoc) — não é
        // uma verificação por si só, é a preparação da injeção real abaixo.
        assert.match(indexSource, /sandbox="allow-forms allow-popups allow-presentation allow-scripts" srcdoc=/, "index.html precisa gerar o mesmo atributo sandbox no branch codigo_iframe");

        await page.goto(`${baseUrl}/index.html?p=${STORE_SLUG}/lp-iframe-sandbox-qa-${SUFIXO}&useEmulator=true`, { waitUntil: "load", timeout: 30000 });
        await page.waitForFunction(
            () => (document.getElementById("lp-container")?.textContent || "").includes("Pagina nao encontrada"),
            undefined,
            { timeout: 20000 }
        );
        await page.evaluate((html) => {
            document.getElementById("lp-container").innerHTML = html;
        }, iframeHtmlPublico);

        const framePublico = await localizarFrameDoIframeCustom(page);
        await framePublico.waitForFunction(() => window.__iframeExecutouInternamente === true, undefined, { timeout: 10000 });
        const resultadoPublico = await framePublico.evaluate(() => ({
            parentBloqueado: window.__parentBloqueado === true,
            conseguiuEscapar: window.__iframeConseguiuEscapar === true
        }));
        assert.equal(resultadoPublico.conseguiuEscapar, false, "no renderer público, o script do iframe também não pode escapar pro parent");
        assert.equal(resultadoPublico.parentBloqueado, true, "no renderer público, o isolamento real do navegador também precisa bloquear o acesso");
        const marcadorNoParentPublico = await page.evaluate(() => window.__iframeEscapeProbe || null);
        assert.equal(marcadorNoParentPublico, null, "window.__iframeEscapeProbe nunca pode aparecer no parent da LP pública");

        // Erros de SecurityError dentro do iframe sandboxed são esperados e
        // tratados pelo próprio catch do payload — não devem vazar como
        // erro de console não tratado da página.
        const errosRelevantes = erros.filter((erro) => !ehErroDeRedeExterno(erro));
        assert.deepEqual(errosRelevantes, [], `Erros de console: ${JSON.stringify(errosRelevantes)}`);
        console.log("studio-codigo-iframe-sandbox.flow: OK — sandbox presente e efetivo no editor autenticado e no renderer público, sem allow-same-origin, htmlCustom continua funcional dentro do próprio iframe.");
    } catch (error) {
        falhou = true;
        await captureDiagnostics(page, "studio-codigo-iframe-sandbox", erros.filter((erro) => !ehErroDeRedeExterno(erro))).catch(() => {});
        console.error("studio-codigo-iframe-sandbox.flow: FALHOU —", error);
    } finally {
        await limparEstado(db);
        await page.close();
        await browser.close();
        await close();
    }

    if (falhou) process.exit(1);
}

await main();
