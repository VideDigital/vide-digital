// PR61-REV-002 — teste de regressão obrigatório da revisão adversarial da
// PR #61 (PR60-SMOKE-001).
//
// A revisão comprovou por leitura de código que adicionarCampoPersonalizado()
// empurrava o objeto provisório { name:"", label:"", ... } DIRETO em
// window.lpEditorBlocos (a mesma referência lida por salvarEditorLP()) —
// então fechar o Studio Ultimate sem clicar "Salvar formulário" e salvar a
// Landing Page por outro caminho (o save global do shell do editor) podia
// persistir um campo quebrado. Como a provisoriedade só era rastreada por
// um WeakSet em memória, um reload perdia essa marca e o campo ficava
// quebrado (name vazio) pra sempre, sem nenhuma validação futura conseguir
// corrigi-lo — e a string de erro interna (_erro) também podia vazar pro
// documento persistido.
//
// Corrigido isolando toda edição em andamento num rascunho
// (state.formDraft) que só é copiado pra block.props.campos dentro de
// saveForm(), depois de validar sem erros, com uma reconstrução explícita
// que nunca inclui _novo/_erro.
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
const LP_ID = `lp_test_draft_integrity_${SUFIXO}`;
const BLOCO_ID = `${LP_ID}_form`;

function adminDb() {
    if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
    return getFirestore();
}

async function seedLpComFormulario(db) {
    await db.collection("landing_pages").doc(LP_ID).set({
        donoUID: STORE_UID, titulo: "LP Draft Integrity QA", pagina: `lp-draft-integrity-qa-${SUFIXO}`,
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

async function abrirEditorEFormularios(page) {
    await page.evaluate((lpId) => window.editarLP(lpId), LP_ID);
    await page.waitForFunction(() => typeof window.AuraStudioUltimate?.open === "function", undefined, { timeout: 20000 });
    await page.evaluate(() => window.AuraStudioUltimate.open("forms"));
    await page.waitForSelector("#aura-ultimate-form-editor", { state: "visible", timeout: 15000 });
    await page.waitForSelector('[data-custom-fields-section]', { state: "visible", timeout: 15000 });
}

async function fecharTudo(page) {
    await page.evaluate(() => window.AuraStudioUltimate?.close?.());
    await page.evaluate(() => window.fecharEditorLP?.());
}

async function recarregarEAbrirDashboard(page, baseUrl) {
    await page.reload({ waitUntil: "load", timeout: 30000 });
    await page.waitForFunction(
        () => typeof window.__videHubContextInitialized === "function" && window.__videHubContextInitialized(),
        undefined,
        { timeout: 20000 }
    );
}

async function main() {
    const { baseUrl, close } = await startStaticServer();
    const browser = await launchBrowser();
    const db = adminDb();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const erros = coletarErrosConsole(page);
    let falhou = false;

    try {
        await seedLpComFormulario(db);
        await loginReal(page, baseUrl, { email: "owner.pro@local.test", senha: "Local123!pro" });

        // ===== Cenário adversarial: adicionar campo, NÃO preencher, NÃO
        // clicar "Salvar formulário", fechar o Studio, salvar a LP pelo
        // caminho global, reload, reabrir. =====
        await abrirEditorEFormularios(page);
        await page.click("#aura-ultimate-form-add-field");
        await page.waitForSelector("[data-custom-field-row]", { state: "visible", timeout: 5000 });
        assert.equal(await page.locator("[data-custom-field-row]").count(), 1, "o campo provisório precisa aparecer na UI do Studio (rascunho local)");

        // Fecha o Studio SEM clicar em "Salvar formulário" — o campo
        // provisório existe só no rascunho da aba, nunca em
        // window.lpEditorBlocos.
        await page.evaluate(() => window.AuraStudioUltimate?.close?.());

        // Usa o save GLOBAL real da Landing Page (o mesmo botão/fluxo que
        // um usuário usaria pra salvar qualquer outra mudança no editor
        // básico) — não o "Salvar formulário" do Studio.
        const resultadoSalvarLp = await page.evaluate(() => window.salvarEditorLP());
        assert.equal(resultadoSalvarLp?.ok, true, "salvarEditorLP() precisa confirmar sucesso mesmo com um campo personalizado ainda não confirmado aberto no Studio");

        // ===== A prova em si: nada quebrado pode ter sido persistido =====
        const blocoSalvo1 = await db.collection("landing_pages_blocos").doc(BLOCO_ID).get();
        const camposSalvos1 = blocoSalvo1.data()?.props?.campos || [];
        assert.deepEqual(camposSalvos1, ["nome", "whatsapp"], "nenhum campo personalizado (válido ou provisório) pode ter sido persistido — o rascunho não confirmado nunca deveria ter alcançado block.props.campos");
        const objetosSalvos1 = camposSalvos1.filter((c) => typeof c === "object" && c);
        assert.equal(objetosSalvos1.length, 0, "nenhum objeto de campo personalizado pode existir no documento persistido");
        assert.ok(!camposSalvos1.some((c) => typeof c === "object" && c && c.name === ""), "nenhum campo com name vazio pode ter sido persistido");
        assert.ok(!JSON.stringify(blocoSalvo1.data()).includes("_erro"), "nenhuma propriedade interna _erro pode ter alcançado o documento persistido");
        assert.ok(!JSON.stringify(blocoSalvo1.data()).includes("_novo"), "nenhuma propriedade interna _novo pode ter alcançado o documento persistido");

        await fecharTudo(page);
        await recarregarEAbrirDashboard(page, baseUrl);
        await abrirEditorEFormularios(page);

        // Depois do reload, reabrindo o Studio: nenhum campo quebrado
        // aparece (o rascunho é reconstruído do zero a partir do que está
        // realmente persistido, que continua sendo só nome/whatsapp).
        assert.equal(await page.locator("[data-custom-field-row]").count(), 0, "nenhum campo personalizado (quebrado ou não) pode aparecer depois do reload — o provisório nunca foi persistido");

        // ===== Cenário positivo: campo válido criado, salvo pelo caminho
        // correto (Salvar formulário do Studio), sobrevive a reload com o
        // name idêntico — e continua idêntico mesmo depois de um SEGUNDO
        // ciclo real de edição/salvamento. =====
        await page.click("#aura-ultimate-form-add-field");
        const linha = page.locator("[data-custom-field-row]").last();
        await linha.locator("[data-custom-field-label]").fill("Campo Válido REV002");
        await page.click("#aura-ultimate-form-save");
        await page.waitForFunction(() => !document.querySelector(".aura-ultimate-custom-field-error"), undefined, { timeout: 5000 });
        const nomeGerado = await page.locator("[data-custom-field-row] code").first().textContent();
        assert.ok(nomeGerado && nomeGerado !== "gerado ao salvar", "o name precisa ter sido gerado e exibido depois do Salvar formulário");

        const resultadoSalvarLp2 = await page.evaluate(() => window.salvarEditorLP());
        assert.equal(resultadoSalvarLp2?.ok, true, "salvarEditorLP() precisa confirmar sucesso pro campo válido");

        const blocoSalvo2 = await db.collection("landing_pages_blocos").doc(BLOCO_ID).get();
        const objetoSalvo2 = (blocoSalvo2.data()?.props?.campos || []).find((c) => typeof c === "object" && c);
        assert.ok(objetoSalvo2, "o campo válido precisa ter sido persistido de verdade");
        assert.equal(objetoSalvo2.name, nomeGerado, "o name persistido precisa bater com o exibido na UI");
        assert.deepEqual(
            Object.keys(objetoSalvo2).sort(),
            ["label", "name", "required", "type"],
            "o objeto persistido precisa conter exatamente as 4 chaves do contrato — nunca _novo/_erro"
        );

        await fecharTudo(page);
        await recarregarEAbrirDashboard(page, baseUrl);
        await abrirEditorEFormularios(page);
        const nomeAposReload = await page.locator("[data-custom-field-row] code").first().textContent();
        assert.equal(nomeAposReload, nomeGerado, "o name precisa sobreviver idêntico ao reload");

        // Segundo ciclo real: edita o label de novo e salva de novo pelo
        // caminho correto — o name continua congelado.
        const linhaExistente = page.locator("[data-custom-field-row]").first();
        await linhaExistente.locator("[data-custom-field-label]").fill("Campo Válido REV002 (editado)");
        await page.click("#aura-ultimate-form-save");
        await page.waitForFunction(() => !document.querySelector(".aura-ultimate-custom-field-error"), undefined, { timeout: 5000 });
        await page.evaluate(() => window.salvarEditorLP());
        const nomeAposSegundoCiclo = await page.locator("[data-custom-field-row] code").first().textContent();
        assert.equal(nomeAposSegundoCiclo, nomeGerado, "o name precisa continuar idêntico depois de um segundo ciclo real de edição/salvamento");

        const errosRelevantes = erros.filter((erro) => !ehErroDeRedeExterno(erro));
        assert.deepEqual(errosRelevantes, [], `Erros de console: ${JSON.stringify(errosRelevantes)}`);
        console.log("studio-custom-fields-draft-integrity.flow: OK — rascunho não confirmado nunca persiste, name congelado sobrevive a múltiplos ciclos reais de edição/reload.");
    } catch (error) {
        falhou = true;
        await captureDiagnostics(page, "studio-custom-fields-draft-integrity", erros.filter((erro) => !ehErroDeRedeExterno(erro))).catch(() => {});
        console.error("studio-custom-fields-draft-integrity.flow: FALHOU —", error);
    } finally {
        await limparEstado(db);
        await page.close();
        await browser.close();
        await close();
    }

    if (falhou) process.exit(1);
}

await main();
