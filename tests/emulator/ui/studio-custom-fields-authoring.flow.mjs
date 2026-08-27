// PR60-SMOKE-001 — autoria produtiva de campos personalizados em
// formulários de Landing Page.
//
// O diagnóstico read-only anterior comprovou que o pipeline (renderer
// público, createPublicLead, CRM) já sabia processar camposExtras, mas
// nenhuma superfície produtiva permitia CRIAR um campo personalizado —
// só objetos montados diretamente em JS/Firestore pelos próprios testes.
// Este arquivo é a prova exigida de que a torneira (autoria real, via
// Studio Ultimate) e o encanamento (tudo que a PR #60 já tinha corrigido)
// funcionam JUNTOS, ponta a ponta, contra o Firestore/Auth Emulator real
// — sem montar props.campos em JS nem semear camposExtras via Admin SDK.
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
const STORE_UID = "owner-pro";
const STORE_SLUG = "loja-pro-local";
const SUFIXO = Date.now();
const LP_ID = `lp_test_custom_fields_${SUFIXO}`;
const LP_SLUG = `lp-custom-fields-qa-${SUFIXO}`;
const BLOCO_ID = `${LP_ID}_form`;
const DOC_ID_PUBLICO = `${STORE_SLUG}__${LP_SLUG}`.toLowerCase();

function adminDb() {
    if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
    return getFirestore();
}

async function seedLpComFormulario(db) {
    // modoLayout "empilhado" (o padrão/simples) em vez de "livre" — evita
    // o canvas de largura fixa (1440px) e posicionamento absoluto do modo
    // Livre, que não tem precedente comprovado de interação real via
    // Playwright neste repositório; "empilhado" é o fluxo mais comum e
    // documentado de publicação real usado pelos outros testes de LP.
    await db.collection("landing_pages").doc(LP_ID).set({
        donoUID: STORE_UID, titulo: "LP Campos Personalizados QA", pagina: LP_SLUG,
        publicado: false, modoLayout: "empilhado", paginas: [], ordemBlocos: [BLOCO_ID],
        criadoEm: Date.now(), atualizadoEm: Date.now()
    });
    await db.collection("landing_pages_blocos").doc(BLOCO_ID).set({
        lpId: LP_ID, donoUID: STORE_UID, tipo: "formulario_captura", paginaId: null, visivel: true,
        props: { titulo: "Fale com a gente", textoBotao: "Enviar", campos: ["nome", "whatsapp"] },
        design: {}, x: null, y: null, largura: null, altura: null, zIndex: null
    });
}

async function limparEstado(db, leadIds = []) {
    await db.collection("landing_pages").doc(LP_ID).delete().catch(() => {});
    await db.collection("landing_pages_publicas").doc(DOC_ID_PUBLICO).delete().catch(() => {});
    await db.collection("landing_pages_blocos").doc(BLOCO_ID).delete().catch(() => {});
    await db.collection("landing_pages_blocos_publicas").doc(BLOCO_ID).delete().catch(() => {});
    for (const leadId of leadIds) {
        await db.collection("leads").doc(leadId).delete().catch(() => {});
    }
}

async function abrirEditor(page) {
    await page.evaluate((lpId) => window.editarLP(lpId), LP_ID);
    await page.waitForFunction(() => typeof window.AuraStudioUltimate?.open === "function", undefined, { timeout: 20000 });
    await page.evaluate(() => window.AuraStudioUltimate.open("forms"));
    await page.waitForSelector("#aura-ultimate-form-editor", { state: "visible", timeout: 15000 });
    // O bloco formulario_captura seedado é o único da página — precisa
    // ficar selecionado automaticamente ao abrir a aba Formulários.
    await page.waitForSelector('[data-custom-fields-section]', { state: "visible", timeout: 15000 });
}

async function fecharEditor(page) {
    await page.evaluate(() => window.AuraStudioUltimate?.close?.());
    await page.evaluate(() => window.fecharEditorLP?.());
}

async function adicionarCampoPelaUI(page, { label, tipo, obrigatorio }) {
    await page.click("#aura-ultimate-form-add-field");
    const linha = page.locator("[data-custom-field-row]").last();
    await linha.locator("[data-custom-field-label]").fill(label);
    if (tipo) await linha.locator("[data-custom-field-type]").selectOption(tipo);
    if (obrigatorio) await linha.locator("[data-custom-field-required]").check();
    return linha;
}

async function main() {
    const { baseUrl, close } = await startStaticServer();
    const browser = await launchBrowser();
    const db = adminDb();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const erros = coletarErrosConsole(page);
    let falhou = false;
    const leadIdsCriados = [];

    try {
        await seedLpComFormulario(db);
        await loginReal(page, baseUrl, { email: "owner.pro@local.test", senha: "Local123!pro" });
        await page.waitForFunction(
            (slug) => window.__videSlugAtualSalvo?.() === slug,
            STORE_SLUG,
            { timeout: 20000 }
        );

        // ===== 1) Autoria real: criar 2 campos personalizados + testar
        // tipos, obrigatório, nome reservado, colisão e limite =====
        await abrirEditor(page);

        const linhaEmpresa = await adicionarCampoPelaUI(page, { label: "Empresa QA", tipo: "text", obrigatorio: true });
        await adicionarCampoPelaUI(page, { label: "Observação QA", tipo: "textarea" });

        // Nome reservado: "Email" não pode virar campo personalizado —
        // criação precisa ser bloqueada com feedback, não renomeada
        // silenciosamente.
        const linhaReservada = await adicionarCampoPelaUI(page, { label: "Email" });
        await page.click("#aura-ultimate-form-save");
        await page.waitForSelector(".aura-ultimate-custom-field-error", { state: "visible", timeout: 5000 });
        const erroReservado = await page.locator(".aura-ultimate-custom-field-error").first().textContent();
        assert.match(erroReservado || "", /reservado/i, "label 'Email' deveria ser recusada como nome reservado");
        // Corrige pro cenário permitido do enunciado: "Email alternativo".
        await linhaReservada.locator("[data-custom-field-label]").fill("Email alternativo");

        // Colisão: dois campos que normalizam pro mesmo texto precisam
        // gerar names distintos, nunca sobrescrever um ao outro.
        await adicionarCampoPelaUI(page, { label: "Empresa QA" });

        await page.click("#aura-ultimate-form-save");
        await page.waitForFunction(
            () => !document.querySelector(".aura-ultimate-custom-field-error"),
            undefined,
            { timeout: 5000 }
        );

        const nomesAposSalvar = await page.locator("[data-custom-field-row] code").allTextContents();
        assert.equal(new Set(nomesAposSalvar).size, nomesAposSalvar.length, "todos os names finais precisam ser únicos");
        assert.ok(nomesAposSalvar.includes("empresa_qa"), "primeiro 'Empresa QA' deveria virar empresa_qa");
        assert.ok(nomesAposSalvar.some((n) => n !== "empresa_qa" && n.startsWith("empresa_qa")), "segundo 'Empresa QA' deveria colidir com sufixo, nunca sobrescrever o primeiro");
        assert.ok(nomesAposSalvar.includes("email_alternativo"), "'Email alternativo' não é reservado e deveria virar email_alternativo");

        // Limite de 20: preenche até o teto pela UI e confirma bloqueio do 21º.
        for (let n = nomesAposSalvar.length; n < 20; n += 1) {
            await adicionarCampoPelaUI(page, { label: `Extra QA ${n}` });
        }
        await page.click("#aura-ultimate-form-save");
        await page.waitForFunction(() => !document.querySelector(".aura-ultimate-custom-field-error"), undefined, { timeout: 5000 });
        assert.equal(await page.locator("[data-custom-field-row]").count(), 20, "deveria ter exatamente 20 campos personalizados antes do teste de limite");
        // O botão fica disabled no limite — Playwright recusa clicar num
        // elemento desabilitado (checagem de actionability), então o
        // próprio bloqueio já é a prova; não há necessidade (nem como)
        // tentar um 21º clique real.
        assert.equal(await page.isDisabled("#aura-ultimate-form-add-field"), true, "botão Adicionar campo deveria ficar desabilitado no limite de 20");
        assert.equal(await page.locator("[data-custom-field-row]").count(), 20, "contagem de campos personalizados não pode passar de 20");

        // Remove os 16 campos "Extra QA N" (4 + 16 = 20) pra deixar só os
        // 4 relevantes pro restante do teste (empresa_qa, empresa_qa_2,
        // observacao_qa, email_alternativo).
        for (let n = 0; n < 16; n += 1) {
            await page.locator('[data-custom-field-row] [data-custom-field-remove]').last().click();
        }
        assert.equal(await page.locator("[data-custom-field-row]").count(), 4, "deveriam sobrar só os 4 campos relevantes após a remoção em massa");

        // Edição: mudar o label de um campo já salvo NÃO pode mudar o name
        // (contrato explícito da missão — name é gerado uma vez e congelado).
        // Localiza a linha por ÍNDICE, não por texto: o label vive dentro
        // de um <input value="...">, que não conta como texto renderizado
        // pra filter({ hasText }) do Playwright — a remoção em massa acima
        // só tirou linhas do FIM, então a ordem relativa das 4 originais
        // (empresa_qa=0, observacao_qa=1, email_alternativo=2, empresa_qa_2=3)
        // continua intacta.
        const linhaObservacao = page.locator("[data-custom-field-row]").nth(1);
        assert.equal(await linhaObservacao.locator("[data-custom-field-label]").inputValue(), "Observação QA", "linha de índice 1 precisa continuar sendo o campo Observação QA");
        const nomeObservacaoAntes = await linhaObservacao.locator("code").textContent();
        await linhaObservacao.locator("[data-custom-field-label]").fill("Observação sobre a empresa");
        await page.click("#aura-ultimate-form-save");
        await page.waitForFunction(() => !document.querySelector(".aura-ultimate-custom-field-error"), undefined, { timeout: 5000 });
        const nomeObservacaoDepois = await page.locator("[data-custom-field-row]").nth(1).locator("code").textContent();
        assert.equal(nomeObservacaoDepois, nomeObservacaoAntes, "editar o label não pode alterar o name já congelado");

        // Reordenação: move "Empresa QA" (primeiro) pra depois de
        // "Observação sobre a empresa" e confirma que persiste após reload.
        const primeiraLinha = page.locator("[data-custom-field-row]").first();
        await primeiraLinha.locator("[data-custom-field-down]").click();
        await page.click("#aura-ultimate-form-save");
        await page.waitForFunction(() => !document.querySelector(".aura-ultimate-custom-field-error"), undefined, { timeout: 5000 });
        const ordemAposReordenar = await page.locator("[data-custom-field-row] [data-custom-field-label]").evaluateAll((inputs) => inputs.map((i) => i.value));

        // "Salvar formulário" do Studio Ultimate só atualiza o bloco EM
        // MEMÓRIA (window.lpEditorBlocos) — quem persiste no Firestore é o
        // salvarEditorLP() do shell do editor (mesmo contrato usado por
        // landing-page-publication.flow.mjs). Precisa disso ANTES do
        // reload pra realmente provar persistência, não só estado local.
        const resultadoSalvarLp = await page.evaluate(() => window.salvarEditorLP());
        assert.equal(resultadoSalvarLp?.ok, true, "salvarEditorLP() precisa confirmar sucesso antes do teste de reload");

        await fecharEditor(page);
        await page.reload({ waitUntil: "load", timeout: 30000 });
        await page.waitForFunction(
            () => typeof window.__videHubContextInitialized === "function" && window.__videHubContextInitialized(),
            undefined,
            { timeout: 20000 }
        );
        await abrirEditor(page);
        const ordemAposReload = await page.locator("[data-custom-field-row] [data-custom-field-label]").evaluateAll((inputs) => inputs.map((i) => i.value));
        assert.deepEqual(ordemAposReload, ordemAposReordenar, "ordem dos campos personalizados precisa sobreviver ao reload");

        // ===== 2) Editor básico precisa ser lossless: alternar um campo
        // canônico não pode remover os campos personalizados criados
        // acima pelo Studio Ultimate. =====
        await fecharEditor(page);
        const camposAposToggleBasico = await page.evaluate((indiceBloco) => {
            window.alternarCampoFormEditor(indiceBloco, "email", true);
            window.alternarCampoFormEditor(indiceBloco, "email", false);
            return window.lpEditorBlocos[indiceBloco].props.campos;
        }, 0);
        const personalizadosAposToggle = camposAposToggleBasico.filter((c) => typeof c === "object" && c);
        assert.equal(personalizadosAposToggle.length, 4, "os 4 campos personalizados precisam sobreviver ao editor básico alternando um campo canônico");
        assert.ok(personalizadosAposToggle.some((c) => c.name === "empresa_qa"), "empresa_qa precisa sobreviver ao editor básico");

        // ===== 3) Publicar de verdade e testar o formulário público =====
        await page.evaluate((lpId) => window.alternarPublicacaoLP(lpId, true), LP_ID);
        const publicaSnap = await db.collection("landing_pages_publicas").doc(DOC_ID_PUBLICO).get();
        assert.equal(publicaSnap.exists, true, "LP deveria publicar com sucesso");
        const blocoPublicoSnap = await db.collection("landing_pages_blocos_publicas").doc(BLOCO_ID).get();
        const camposPublicados = blocoPublicoSnap.data()?.props?.campos || [];
        assert.equal(camposPublicados.filter((c) => typeof c === "object" && c).length, 4, "os 4 campos personalizados precisam ter sido publicados junto com o bloco");

        await page.goto(`${baseUrl}/${STORE_SLUG}/${LP_SLUG}?useEmulator=true`, { waitUntil: "load", timeout: 30000 });
        await page.waitForSelector('input[name="nome"]', { state: "visible", timeout: 20000 });

        // Confirma no DOM real que o renderer público aplicou type/required
        // corretamente pros campos personalizados publicados.
        const empresaInput = page.locator('input[name="empresa_qa"]');
        await empresaInput.waitFor({ state: "visible", timeout: 10000 });
        assert.equal(await empresaInput.getAttribute("type"), "text");
        assert.equal(await empresaInput.getAttribute("required"), "", "empresa_qa é required=true e precisa ter o atributo required");
        // O name fica congelado como observacao_qa desde a criação, mesmo
        // com o label tendo sido editado depois pra "Observação sobre a
        // empresa" — é exatamente esse contrato que este teste comprova.
        const observacaoField = page.locator('textarea[name="observacao_qa"]');
        await observacaoField.waitFor({ state: "visible", timeout: 5000 });
        const emailAltInput = page.locator('input[name="email_alternativo"]');
        await emailAltInput.waitFor({ state: "visible", timeout: 5000 });
        assert.equal(await emailAltInput.getAttribute("required"), null, "email_alternativo é opcional e não pode ter required");

        // XSS: payload num campo de texto livre precisa virar texto puro,
        // nunca elemento real, do preenchimento até o detalhe do lead.
        const payloadXss = '<img data-pr60-smoke-xss src=x onerror="alert(1)">';
        await page.fill('input[name="nome"]', "PR60 Smoke QA");
        await page.fill('input[name="whatsapp"]', "11988887777");
        await empresaInput.fill("EMPRESA-PR60-QA");
        await observacaoField.fill(payloadXss);
        await emailAltInput.fill("qa-alt@local.test");
        await page.click('button[type="submit"]');

        const leadCriado = await new Promise((resolve, reject) => {
            const inicio = Date.now();
            const checar = async () => {
                const snap = await db.collection("leads").where("nome", "==", "PR60 Smoke QA").limit(1).get();
                if (!snap.empty) return resolve(snap.docs[0]);
                if (Date.now() - inicio > 15000) return reject(new Error("lead não apareceu no Firestore a tempo"));
                setTimeout(checar, 300);
            };
            checar();
        });
        leadIdsCriados.push(leadCriado.id);
        const leadData = leadCriado.data();
        assert.deepEqual(leadData.camposExtras, {
            empresa_qa: "EMPRESA-PR60-QA",
            observacao_qa: payloadXss,
            email_alternativo: "qa-alt@local.test"
        }, "camposExtras do lead precisa conter exatamente os 3 campos livres preenchidos, com os names congelados pela autoria (observacao_qa, não observacao_sobre_a_empresa)");

        // ===== 4) Central Comercial: detalhe, busca, XSS, CSV, reload =====
        // A sessão já está autenticada (login feito uma vez no início) —
        // navega direto pro dashboard em vez de logar de novo, igual a um
        // usuário real trocando de aba dentro do mesmo painel.
        await page.goto(`${baseUrl}/dashboard.html?useEmulator=true`, { waitUntil: "load", timeout: 30000 });
        await page.waitForFunction(
            () => typeof window.__videHubContextInitialized === "function" && window.__videHubContextInitialized(),
            undefined,
            { timeout: 20000 }
        );
        await page.waitForFunction(() => typeof window.AuraLeadsV6?.openTab === "function", undefined, { timeout: 20000 });
        await page.evaluate(() => {
            window.ativarAba("view-leads");
            window.AuraLeadsV6.openTab("inbox");
        });
        await page.waitForSelector(`[data-open-lead="${leadCriado.id}"]`, { state: "visible", timeout: 20000 });
        await page.click(`[data-open-lead="${leadCriado.id}"]`);
        const detailText = await page.locator(".aura-leads-v6-extra-fields").textContent();
        // readableExtraFieldLabel("empresa_qa") -> "Empresa qa" (só a
        // primeira letra maiúscula; não há metadado de label do formulário
        // salvo junto do lead, só a chave).
        assert.match(detailText, /Empresa qa/i);
        assert.match(detailText, /EMPRESA-PR60-QA/);
        assert.equal(await page.locator("[data-pr60-smoke-xss]").count(), 0, "payload XSS nunca pode virar elemento HTML real");
        assert.match(detailText, /<img data-pr60-smoke-xss/, "payload XSS precisa aparecer como texto escapado no detalhe");
        await page.click('[data-detail-action="close"]');

        await page.fill("#aura-leads-v5-search", "empresa-pr60-qa");
        await page.waitForSelector(`[data-open-lead="${leadCriado.id}"]`, { state: "visible", timeout: 10000 });
        await page.fill("#aura-leads-v5-search", "termo-que-nao-existe-em-nenhum-lead-xyz");
        await page.waitForFunction(
            (leadId) => !document.querySelector(`[data-open-lead="${leadId}"]`),
            leadCriado.id,
            { timeout: 10000 }
        );
        await page.fill("#aura-leads-v5-search", "");

        const downloadPromise = page.waitForEvent("download");
        await page.click('[data-action="export"]');
        const download = await downloadPromise;
        const csv = await readFile(await download.path(), "utf8");
        assert.match(csv, /EMPRESA-PR60-QA/);
        assert.match(csv, /Formulário: empresa_qa/);

        await page.reload({ waitUntil: "load", timeout: 30000 });
        await page.waitForFunction(
            () => typeof window.__videHubContextInitialized === "function" && window.__videHubContextInitialized(),
            undefined,
            { timeout: 20000 }
        );
        await page.waitForFunction(() => typeof window.AuraLeadsV6?.openTab === "function", undefined, { timeout: 20000 });
        await page.evaluate(() => {
            window.ativarAba("view-leads");
            window.AuraLeadsV6.openTab("inbox");
        });
        await page.waitForSelector(`[data-open-lead="${leadCriado.id}"]`, { state: "visible", timeout: 20000 });
        await page.click(`[data-open-lead="${leadCriado.id}"]`);
        const detailTextAposReload = await page.locator(".aura-leads-v6-extra-fields").textContent();
        assert.match(detailTextAposReload, /EMPRESA-PR60-QA/, "campos personalizados precisam sobreviver ao reload da Central Comercial");

        const errosRelevantes = erros.filter((erro) => !ehErroDeRedeExterno(erro));
        assert.deepEqual(errosRelevantes, [], `Erros de console: ${JSON.stringify(errosRelevantes)}`);
        console.log("studio-custom-fields-authoring.flow: OK — autoria real, tipos, obrigatório, reservado, colisão, limite, edição, remoção, reordenação, editor básico lossless, publish, submit, CRM detalhe/busca/CSV/reload.");
    } catch (error) {
        falhou = true;
        await captureDiagnostics(page, "studio-custom-fields-authoring", erros.filter((erro) => !ehErroDeRedeExterno(erro))).catch(() => {});
        console.error("studio-custom-fields-authoring.flow: FALHOU —", error);
    } finally {
        await limparEstado(db, leadIdsCriados);
        await page.close();
        await browser.close();
        await close();
    }

    if (falhou) process.exit(1);
}

await main();
