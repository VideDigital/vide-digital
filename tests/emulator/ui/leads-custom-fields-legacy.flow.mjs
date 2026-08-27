import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
const OWNER_UID = "owner-pro";
const LEAD_EXTRA_ID = "lead-custom-fields-pr60";
const LEAD_LEGACY_ID = "lead-legacy-contract-pr60";
const ACTIVE_UID = "employee-leads-active-pr60";
const INACTIVE_UID = "employee-leads-inactive-pr60";
const REMOVED_UID = "employee-leads-removed-pr60";
const OTHER_TENANT_UID = "employee-leads-other-tenant-pr60";
const LEAD_INACTIVE_ID = "lead-inactive-history-pr60";
const LEAD_REMOVED_ID = "lead-removed-history-pr60";

function adminDb() {
    if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
    return getFirestore();
}

async function seed() {
    const db = adminDb();
    await Promise.all([
        db.doc(`funcionarios/${ACTIVE_UID}`).set({
            donoUID: OWNER_UID,
            nome: "Funcionário Ativo PR60",
            status: "ativo",
            permissoes: { ver: ["leads"], editar: ["leads"] }
        }),
        db.doc(`funcionarios/${INACTIVE_UID}`).set({
            donoUID: OWNER_UID,
            nome: "Funcionário Inativo PR60",
            status: "inativo",
            permissoes: { ver: ["leads"], editar: ["leads"] }
        }),
        db.doc(`funcionarios/${OTHER_TENANT_UID}`).set({
            donoUID: "owner-starter",
            nome: "Funcionário Outro Tenant PR60",
            status: "ativo",
            permissoes: { ver: ["leads"], editar: ["leads"] }
        }),
        db.doc(`leads/${LEAD_EXTRA_ID}`).set({
            criadoPor: OWNER_UID,
            tenantId: OWNER_UID,
            lojaId: OWNER_UID,
            nome: "Lead Extras PR60",
            email: "lead.extras.pr60@local.test",
            whatsapp: "5511988887766",
            origem: "Landing Page",
            status: "novo",
            statusLead: "novo",
            pipelineStage: "novo",
            data: Date.now(),
            formularioId: "form-pr60",
            formularioNome: "Formulário PR60",
            camposExtras: {
                cidade_preferida: "São Luís",
                segmento: "EMPRESARIAL Premium",
                formula: "=2+2",
                xss: '<img data-pr60-xss src=x onerror="alert(1)">'
            }
        }),
        db.doc(`leads/${LEAD_LEGACY_ID}`).set({
            criadoPor: OWNER_UID,
            tenantId: OWNER_UID,
            lojaId: OWNER_UID,
            nome: "Lead Legado PR60",
            email: "lead.legado.pr60@local.test",
            status: "novo",
            statusLead: "novo",
            pipelineStage: "novo",
            data: Date.now() - 1000,
            funcionarioResponsavel: ACTIVE_UID,
            lembreteData: "2026-09-10"
        }),
        db.doc(`leads/${LEAD_INACTIVE_ID}`).set({
            criadoPor: OWNER_UID,
            nome: "Lead Responsável Inativo PR60",
            status: "novo",
            data: Date.now() - 2000,
            responsavelUid: INACTIVE_UID,
            responsavelNome: "Funcionário Inativo PR60"
        }),
        db.doc(`leads/${LEAD_REMOVED_ID}`).set({
            criadoPor: OWNER_UID,
            nome: "Lead Responsável Removido PR60",
            status: "novo",
            data: Date.now() - 3000,
            responsavelUid: REMOVED_UID,
            responsavelNome: "Funcionário Removido PR60"
        })
    ]);
}

async function abrirCentral(page) {
    await page.waitForFunction(() => typeof window.AuraLeadsV6?.openTab === "function", undefined, { timeout: 20000 });
    const activated = await page.evaluate(() => {
        const opened = typeof window.ativarAba === "function" && window.ativarAba("view-leads");
        window.AuraLeadsV6.openTab("inbox");
        return opened;
    });
    assert.equal(activated, true, "view-leads deve ser ativada antes de abrir o workspace");
    await page.waitForSelector("#view-leads.active", { state: "visible", timeout: 15000 });
    await page.waitForSelector("#aura-leads-v5-content", { state: "visible", timeout: 15000 });
    await page.waitForSelector(`[data-open-lead="${LEAD_EXTRA_ID}"]`, { state: "visible", timeout: 20000 });
}

async function esperarDocumento(path, predicate, message) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
        const data = (await adminDb().doc(path).get()).data();
        if (data && predicate(data)) return data;
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(message);
}

async function main() {
    const { baseUrl, close } = await startStaticServer();
    const browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const erros = coletarErrosConsole(page);
    let falhou = false;

    try {
        await seed();
        await loginReal(page, baseUrl, {
            email: "owner.pro@local.test",
            senha: "Local123!pro"
        });
        await abrirCentral(page);

        await page.click(`[data-open-lead="${LEAD_EXTRA_ID}"]`);
        const extraSection = page.locator(".aura-leads-v6-extra-fields");
        await extraSection.waitFor({ state: "visible", timeout: 10000 });
        const detailText = await extraSection.textContent();
        assert.match(detailText, /Informações do formulário/);
        assert.match(detailText, /Cidade preferida/);
        assert.match(detailText, /São Luís/);
        assert.match(detailText, /EMPRESARIAL Premium/);
        assert.equal(await page.locator("[data-pr60-xss]").count(), 0, "payload XSS nunca deve virar elemento HTML");
        assert.match(detailText, /<img data-pr60-xss/, "payload XSS deve aparecer somente como texto escapado");
        await page.click('[data-detail-action="close"]');

        await page.fill("#aura-leads-v5-search", "sao luis");
        await page.waitForSelector(`[data-open-lead="${LEAD_EXTRA_ID}"]`, { state: "visible", timeout: 10000 });
        await page.fill("#aura-leads-v5-search", "CIDADE_PREFERIDA");
        await page.waitForSelector(`[data-open-lead="${LEAD_EXTRA_ID}"]`, { state: "visible", timeout: 10000 });
        await page.fill("#aura-leads-v5-search", "");

        await page.click(`[data-open-lead="${LEAD_EXTRA_ID}"]`);
        const optionsNovaAtribuicao = await page.locator("#aura-leads-v5-detail-responsible option").allTextContents();
        assert.equal(await page.locator(`#aura-leads-v5-detail-responsible option[value="${OWNER_UID}"]`).count(), 1,
            "owner deve ser uma opção válida");
        assert.ok(optionsNovaAtribuicao.some((value) => value.includes("Funcionário Ativo PR60")));
        assert.equal(optionsNovaAtribuicao.some((value) => value.includes("Funcionário Inativo PR60")), false,
            "funcionário inativo não pode ser oferecido em nova atribuição");
        assert.equal(optionsNovaAtribuicao.some((value) => value.includes("Funcionário Outro Tenant PR60")), false,
            "funcionário de outro tenant não pode ser oferecido");
        await page.click('[data-detail-action="close"]');

        await page.click(`[data-open-lead="${LEAD_INACTIVE_ID}"]`);
        assert.equal(await page.inputValue("#aura-leads-v5-detail-responsible"), INACTIVE_UID);
        assert.match(await page.locator("#aura-leads-v5-detail-responsible option:checked").textContent(), /Funcionário Inativo PR60/,
            "responsável inativo já salvo deve continuar visível como histórico");
        await page.click('[data-detail-action="close"]');

        await page.click(`[data-open-lead="${LEAD_REMOVED_ID}"]`);
        assert.equal(await page.inputValue("#aura-leads-v5-detail-responsible"), REMOVED_UID);
        assert.match(await page.locator("#aura-leads-v5-detail-responsible option:checked").textContent(), /Funcionário Removido PR60/,
            "responsavelNome histórico deve sobreviver à remoção do funcionário");
        await page.click('[data-detail-action="close"]');

        await page.click(`[data-open-lead="${LEAD_LEGACY_ID}"]`);
        assert.equal(await page.inputValue("#aura-leads-v5-detail-responsible"), ACTIVE_UID,
            "responsável somente legado deve ser exibido");
        assert.match(await page.inputValue("#aura-leads-v5-detail-followup"), /^2026-09-10T00:00$/,
            "lembreteData somente legado deve aparecer como próximo contato");
        await page.fill("#aura-leads-v5-detail-note", "Nota salva sem migrar aliases");
        await page.click('[data-detail-action="save"]');

        const legacyAfterSave = await esperarDocumento(
            `leads/${LEAD_LEGACY_ID}`,
            (data) => data.anotacao === "Nota salva sem migrar aliases",
            "save do lead legado não persistiu a anotação"
        );
        assert.equal(legacyAfterSave.anotacao, "Nota salva sem migrar aliases");
        assert.equal(Object.hasOwn(legacyAfterSave, "responsavelUid"), false,
            "save de outro campo não deve criar responsável canônico vazio/silencioso");
        assert.equal(Object.hasOwn(legacyAfterSave, "proximoContatoEm"), false,
            "save de outro campo não deve criar follow-up canônico vazio/silencioso");
        assert.equal(legacyAfterSave.funcionarioResponsavel, ACTIVE_UID);
        assert.equal(legacyAfterSave.lembreteData, "2026-09-10");

        await page.reload({ waitUntil: "load", timeout: 30000 });
        await page.waitForFunction(
            () => typeof window.__videHubContextInitialized === "function" && window.__videHubContextInitialized(),
            undefined,
            { timeout: 20000 }
        );
        await abrirCentral(page);
        await page.click(`[data-open-lead="${LEAD_LEGACY_ID}"]`);
        assert.equal(await page.inputValue("#aura-leads-v5-detail-responsible"), ACTIVE_UID);
        assert.match(await page.inputValue("#aura-leads-v5-detail-followup"), /^2026-09-10T00:00$/);
        assert.equal(await page.inputValue("#aura-leads-v5-detail-note"), "Nota salva sem migrar aliases");
        await page.click('[data-detail-action="close"]');

        const downloadPromise = page.waitForEvent("download");
        await page.click('[data-action="export"]');
        const download = await downloadPromise;
        const csv = await readFile(await download.path(), "utf8");
        assert.match(csv, /Formulário: cidade_preferida/);
        assert.match(csv, /São Luís/);
        assert.match(csv, /"'=2\+2"/, "valor iniciado por = deve ser neutralizado no CSV");

        const errosRelevantes = erros.filter((erro) => !ehErroDeRedeExterno(erro));
        assert.deepEqual(errosRelevantes, [], `Erros de console: ${JSON.stringify(errosRelevantes)}`);
        console.log("leads-custom-fields-legacy.flow: OK — detalhe, busca, XSS, CSV, legado, save e reload.");
    } catch (error) {
        falhou = true;
        await captureDiagnostics(page, "leads-custom-fields-legacy", erros.filter((erro) => !ehErroDeRedeExterno(erro))).catch(() => {});
        console.error("leads-custom-fields-legacy.flow: FALHOU —", error);
    } finally {
        await page.close();
        await browser.close();
        await close();
    }

    if (falhou) process.exit(1);
}

await main();
