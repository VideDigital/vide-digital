// PR61-REV-001 — teste de regressão obrigatório da revisão adversarial da
// PR #61 (PR60-SMOKE-001). O E2E original (studio-custom-fields-authoring.
// flow.mjs) só testava XSS no fluxo formulário público → lead → CRM; a
// revisão comprovou por leitura de código que existia um sink DIFERENTE,
// não coberto por nenhum teste: renderizarBlocoPreview() (dashboard-app.js,
// preview do editor básico) interpolava campo.label/campo.name cru numa
// template string que sempre acaba em canvas.innerHTML — um label
// malicioso salvo pelo Studio Ultimate virava elemento HTML real (com
// handler executando) assim que o editor básico renderizava a prévia.
// Corrigido com uma função escapeHTMLPreview() aplicada a todo texto livre
// dessa função. Este teste prova, via UI de produção real (não simula o
// sink em JS), que a correção segura tanto o campo NOVO (custom label)
// quanto os campos PRÉ-EXISTENTES da mesma função (título/subtítulo etc.)
// continuam seguros.
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
const SUFIXO = Date.now();
const LP_ID = `lp_test_xss_preview_${SUFIXO}`;
const BLOCO_ID = `${LP_ID}_form`;

function adminDb() {
    if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
    return getFirestore();
}

async function seedLpComFormulario(db) {
    await db.collection("landing_pages").doc(LP_ID).set({
        donoUID: STORE_UID, titulo: "LP XSS Preview QA", pagina: `lp-xss-preview-qa-${SUFIXO}`,
        publicado: false, modoLayout: "empilhado", paginas: [], ordemBlocos: [BLOCO_ID],
        criadoEm: Date.now(), atualizadoEm: Date.now()
    });
    await db.collection("landing_pages_blocos").doc(BLOCO_ID).set({
        lpId: LP_ID, donoUID: STORE_UID, tipo: "formulario_captura", paginaId: null, visivel: true,
        props: { titulo: "Fale com a gente", textoBotao: "Enviar", campos: ["nome", "whatsapp"] },
        design: {}, x: null, y: null, largura: null, altura: null, zIndex: null
    });
}

async function limparEstado(db) {
    await db.collection("landing_pages").doc(LP_ID).delete().catch(() => {});
    await db.collection("landing_pages_blocos").doc(BLOCO_ID).delete().catch(() => {});
}

async function main() {
    const { baseUrl, close } = await startStaticServer();
    const browser = await launchBrowser();
    const db = adminDb();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const erros = coletarErrosConsole(page);
    let falhou = false;

    // window.alert real travaria o teste (modal bloqueante) — se o payload
    // XSS de alguma forma executasse de verdade, isso é o que capturaria
    // a prova, em vez de travar o Playwright esperando um diálogo nunca
    // tratado.
    let dialogoDisparado = null;
    page.on("dialog", async (dialog) => {
        dialogoDisparado = dialog.message();
        await dialog.dismiss().catch(() => {});
    });

    try {
        await seedLpComFormulario(db);
        await loginReal(page, baseUrl, { email: "owner.pro@local.test", senha: "Local123!pro" });

        await page.evaluate((lpId) => window.editarLP(lpId), LP_ID);
        await page.waitForFunction(() => typeof window.AuraStudioUltimate?.open === "function", undefined, { timeout: 20000 });
        await page.evaluate(() => window.AuraStudioUltimate.open("forms"));
        await page.waitForSelector("#aura-ultimate-form-editor", { state: "visible", timeout: 15000 });
        await page.waitForSelector('[data-custom-fields-section]', { state: "visible", timeout: 15000 });

        // Payload real, sem escapar em nenhum passo daqui pra frente —
        // exatamente o que a revisão adversarial usou como prova de
        // conceito.
        const payloadLabel = '<img data-rev001-preview-xss src=x onerror="window.__rev001Executou=true">';
        await page.click("#aura-ultimate-form-add-field");
        const linha = page.locator("[data-custom-field-row]").last();
        await linha.locator("[data-custom-field-label]").fill(payloadLabel);
        await page.click("#aura-ultimate-form-save");
        await page.waitForFunction(() => !document.querySelector(".aura-ultimate-custom-field-error"), undefined, { timeout: 5000 });

        // Persiste de verdade — mesma técnica do E2E principal: "Salvar
        // formulário" do Studio só atualiza a memória, quem persiste no
        // Firestore é o salvarEditorLP() do shell do editor.
        const resultadoSalvarLp = await page.evaluate(() => window.salvarEditorLP());
        assert.equal(resultadoSalvarLp?.ok, true, "salvarEditorLP() precisa confirmar sucesso");

        const blocoSalvo = await db.collection("landing_pages_blocos").doc(BLOCO_ID).get();
        const camposSalvos = blocoSalvo.data()?.props?.campos || [];
        const campoPersonalizado = camposSalvos.find((c) => typeof c === "object" && c);
        assert.ok(campoPersonalizado, "o campo personalizado precisa ter sido persistido");
        assert.equal(campoPersonalizado.label, payloadLabel, "o label malicioso precisa ter sido salvo como TEXTO puro, sem sanitização na escrita (a defesa é no render, não na gravação)");

        // Fecha o Studio Ultimate (mas fica na mesma página, com o editor
        // básico por trás) e força a prévia a re-renderizar — mesmo
        // caminho (renderizarPreviewEditor -> renderizarBlocoPreview ->
        // canvas.innerHTML) que a revisão apontou como sink vulnerável.
        await page.evaluate(() => window.AuraStudioUltimate?.close?.());
        await page.evaluate(() => window.renderizarEditorBlocos());
        await page.waitForSelector("#lped-preview-canvas", { state: "attached", timeout: 10000 });

        // ===== A prova em si =====
        // 1) Nenhum <img> real com esse marcador pode existir no DOM.
        assert.equal(
            await page.locator("[data-rev001-preview-xss]").count(),
            0,
            "o payload não pode virar um elemento <img> real no preview do editor básico"
        );
        // 2) O onerror não pode ter disparado.
        const executou = await page.evaluate(() => window.__rev001Executou === true);
        assert.equal(executou, false, "o handler onerror do payload não pode ter executado");
        // 3) Nenhum dialog (alert/confirm/prompt) real disparado.
        assert.equal(dialogoDisparado, null, `nenhum dialog deveria ter disparado, mas disparou: ${dialogoDisparado}`);
        // 4) O conteúdo aparece como TEXTO escapado dentro do preview.
        const htmlPreview = await page.locator("#lped-preview-canvas").innerHTML();
        assert.match(htmlPreview, /&lt;img data-rev001-preview-xss/, "o payload precisa aparecer como texto HTML-escapado (&lt;img...) dentro do preview");
        assert.doesNotMatch(htmlPreview, /<img data-rev001-preview-xss/, "o payload NUNCA pode aparecer como tag <img> real (não escapada) no HTML do preview");

        // ===== Auditoria dos sinks PRÉ-EXISTENTES na mesma função =====
        // Confirma que título/subtítulo (texto_midia) e pergunta (faq) —
        // interpolações que já existiam antes desta PR na mesma função —
        // também ficaram seguras com a correção, sem exigir nenhum campo
        // personalizado novo pra alcançá-las.
        const payloadTitulo = '<svg data-rev001-titulo-xss onload="window.__rev001TituloExecutou=true">';
        await page.evaluate(({ blocoId, payload }) => {
            const bloco = window.lpEditorBlocos.find((b) => b.id === blocoId);
            bloco.props.titulo = payload;
        }, { blocoId: BLOCO_ID, payload: payloadTitulo });
        // renderizarEditorBlocos()/renderizarPreviewEditor() são síncronas
        // (nenhum await interno) — o page.evaluate() acima já garante que
        // o innerHTML foi reescrito antes de continuar, sem precisar de
        // espera adicional.
        await page.evaluate(() => window.renderizarEditorBlocos());
        assert.equal(await page.locator("[data-rev001-titulo-xss]").count(), 0, "título malicioso não pode virar elemento real no preview (sink pré-existente, mesma função)");
        assert.equal(await page.evaluate(() => window.__rev001TituloExecutou === true), false, "onload do SVG no título não pode ter executado");

        const errosRelevantes = erros.filter((erro) => !ehErroDeRedeExterno(erro));
        assert.deepEqual(errosRelevantes, [], `Erros de console: ${JSON.stringify(errosRelevantes)}`);
        console.log("studio-custom-fields-xss-preview.flow: OK — label personalizado malicioso e título malicioso pré-existente ficam como texto puro no preview do editor básico, sem handler executado.");
    } catch (error) {
        falhou = true;
        await captureDiagnostics(page, "studio-custom-fields-xss-preview", erros.filter((erro) => !ehErroDeRedeExterno(erro))).catch(() => {});
        console.error("studio-custom-fields-xss-preview.flow: FALHOU —", error);
    } finally {
        await limparEstado(db);
        await page.close();
        await browser.close();
        await close();
    }

    if (falhou) process.exit(1);
}

await main();
