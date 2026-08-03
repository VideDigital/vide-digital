// WhatsApp Oficial — fluxo completo no Emulator: sidebar real, onboarding
// oficial mockado, gestão, limite, QR, permissões, inbox e mobile. O mock
// fica exclusivamente no backend quando FUNCTIONS_EMULATOR=true: o
// frontend percorre as mesmas callables e estados usados em produção.
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
const OWNER_UID = "owner-pro";

function adminDb() {
  if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
  return getFirestore();
}

async function ativarView(page, viewId, selector) {
  const active = await page.evaluate((id) => window.ativarAba?.(id) ?? false, viewId);
  if (active && selector) await page.waitForSelector(selector, { state: "visible", timeout: 15000 });
  return active;
}

async function abrirWhatsappPelaSidebar(page) {
  const menu = page.locator('.nav-item[data-target="view-whatsapp-oficial"]');
  await menu.waitFor({ state: "visible", timeout: 15000 });
  assert.equal(await menu.evaluate((element) => element.classList.contains("hidden")), false);
  await menu.click();
  await page.waitForSelector("#whatsapp-estado-conteudo", { state: "visible", timeout: 20000 });
}

async function flowOnboardingOwner(page) {
  await abrirWhatsappPelaSidebar(page);
  assert.equal((await page.textContent("#whatsapp-status-badge")).trim(), "Não configurado");
  const content = await page.textContent("#view-whatsapp-oficial");
  assert.match(content, /Antes de começar/);
  assert.match(content, /custos da Meta são separados/i);
  assert.match(content, /Central de Atendimento/);
  assert.equal(await page.locator("#whatsapp-btn-conectar").isEnabled(), true);

  // Cancelamento antes de abrir a Meta não deixa tentativa nem modal preso.
  await page.click("#whatsapp-btn-conectar");
  await page.waitForSelector("#whatsapp-onboarding-modal", { state: "visible" });
  await page.click("#whatsapp-onboarding-cancelar");
  await page.waitForSelector("#whatsapp-onboarding-modal", { state: "hidden" });

  // Fluxo completo: start -> autorização mockada -> complete -> conexão.
  await page.click("#whatsapp-btn-conectar");
  await page.click("#whatsapp-onboarding-iniciar");
  await page.waitForFunction(() => document.getElementById("whatsapp-status-badge")?.textContent.trim() === "Conectado", null, { timeout: 40000 });
  await page.waitForFunction(() => document.getElementById("whatsapp-onboarding-passos")?.textContent.includes("Concluído"), null, { timeout: 10000 });
  await page.click("#whatsapp-onboarding-cancelar");

  assert.equal((await page.textContent("#whatsapp-card-numero-valor")).trim(), "+55 11 97777-0000");
  assert.match(await page.textContent("#whatsapp-conexoes-lista"), /Atendimento principal|Loja Emulator/);

  const html = await page.content();
  for (const pattern of [/EAAG[A-Za-z0-9]/, /tokenSecretResource/i, /input[^>]*(waba|access.?token|app.?secret)/i]) {
    assert.equal(pattern.test(html), false, `A UI não pode conter ${pattern}`);
  }

  console.log("whatsapp-oficial.flow: OK — onboarding oficial mockado concluiu pela UI e sem credencial no navegador.");
}

async function primeiraConexaoV2() {
  const snap = await adminDb().collection("whatsapp_connections")
    .where("ownerUid", "==", OWNER_UID)
    .where("connectionVersion", "==", 2)
    .get();
  assert.equal(snap.empty, false, "O onboarding deveria criar uma conexão V2");
  const doc = snap.docs.find((item) => item.id.startsWith("wac_"));
  assert.ok(doc);
  return { id: doc.id, ...doc.data() };
}

async function flowGestaoQrELimite(page, consoleErrors) {
  const db = adminDb();
  const first = await primeiraConexaoV2();

  // Validação e sincronização percorrem callables reais com provider fake no Emulator.
  await page.locator(`[data-connection-card="${first.id}"] [data-acao="validar"]`).click();
  await page.waitForTimeout(300);
  await page.click("#whatsapp-btn-sincronizar-templates");
  await page.waitForTimeout(300);

  // Renomear sem prompt/alert do navegador.
  await page.locator(`[data-connection-card="${first.id}"] [data-acao="renomear"]`).click();
  await page.fill("#whatsapp-acao-label", "Atendimento da loja");
  await page.click('#whatsapp-acao-form button[type="submit"]');
  await page.waitForFunction(() => document.getElementById("whatsapp-conexoes-lista")?.textContent.includes("Atendimento da loja"));

  // QR oficial de atendimento (não é pareamento de WhatsApp Web).
  await page.click("#whatsapp-btn-novo-qr");
  await page.fill("#whatsapp-qr-label", "Balcão da loja");
  await page.fill("#whatsapp-qr-mensagem", "Olá! Gostaria de receber atendimento.");
  await page.click('#whatsapp-qr-form button[type="submit"]');
  await page.waitForFunction(() => document.getElementById("whatsapp-qr-lista")?.textContent.includes("Balcão da loja"));
  const qrText = await page.textContent("#whatsapp-qr-lista");
  assert.match(qrText, /Copiar link/);
  assert.match(qrText, /Abrir link/);
  assert.equal(/WhatsApp Web/i.test(qrText), false);

  const qrId = await page.locator("#whatsapp-qr-lista [data-qr-acao='excluir']").getAttribute("data-qr-id");
  await page.locator(`#whatsapp-qr-lista [data-qr-id="${qrId}"][data-qr-acao="excluir"]`).click();
  await page.click('#whatsapp-acao-form button[type="submit"]');
  await page.waitForFunction(() => !document.getElementById("whatsapp-qr-lista")?.textContent.includes("Balcão da loja"));

  // Segunda conexão fixture é metadado seguro, sem credencial real. Permite
  // testar default, limite, preservação de chat e desconexão.
  const secondId = "wac_second_emulator";
  await db.doc(`whatsapp_connections/${secondId}`).set({
    ownerUid: OWNER_UID,
    tenantId: OWNER_UID,
    connectionId: secondId,
    connectionVersion: 2,
    schemaVersion: 3,
    provider: "meta_cloud_api",
    providerMode: "official_cloud",
    label: "Segundo número",
    status: "connected",
    isDefault: false,
    wabaId: "900000000091",
    phoneNumberId: "900000000099",
    displayPhoneNumber: "+55 11 96666-0000",
    verifiedName: "Loja Emulator 2",
    qualityRating: "GREEN",
    graphVersion: "v26.0",
    tokenSecretResource: `projects/demo-vide-hub/secrets/vide-whatsapp-token-${"b".repeat(24)}/versions/1`
  });
  await db.doc("chats/chat-whatsapp-sticky").set({
    donoUID: OWNER_UID,
    emailDono: OWNER_UID,
    clienteNome: "Cliente fixo",
    canal: "whatsapp",
    whatsappConnectionId: first.id,
    status: "aberta",
    statusAdmin: "pendente",
    timestamp: Date.now()
  });

  await page.click("#whatsapp-btn-atualizar");
  await page.waitForSelector(`[data-connection-card="${secondId}"]`);
  assert.equal(await page.locator("#whatsapp-btn-conectar").isDisabled(), true, "Duas conexões devem bloquear a terceira");

  const backendLimit = await page.evaluate(async () => {
    const { VideFunctions } = await import("./core/vide-functions.js");
    try {
      await VideFunctions.whatsappStartOnboarding({ providerMode: "official_cloud", idempotencyKey: "third_connection_attempt_123456789" });
      return { rejected: false };
    } catch (error) {
      return { rejected: true, code: error?.code || "" };
    }
  });
  assert.equal(backendLimit.rejected, true, "O backend também deve bloquear a terceira conexão");
  // A resposta 429 é intencional neste ponto e já foi validada acima; não
  // deve contaminar a checagem de erros inesperados do restante do fluxo.
  consoleErrors.length = 0;

  await page.locator(`[data-connection-card="${secondId}"] [data-acao="tornar-padrao"]`).click();
  await page.waitForFunction((id) => document.querySelector(`[data-connection-card="${id}"]`)?.textContent.includes("Padrão"), secondId);
  const sticky = (await db.doc("chats/chat-whatsapp-sticky").get()).data();
  assert.equal(sticky.whatsappConnectionId, first.id, "Trocar padrão nunca pode migrar chat antigo");

  // O primeiro número originou o chat fixo e é o ativo devolvido pelo
  // provider fake. Desconectá-lo prova preservação do chat e permite
  // exercitar uma reconexão coerente do mesmo ativo.
  await page.locator(`[data-connection-card="${first.id}"] [data-acao="desconectar"]`).click();
  await page.fill("#whatsapp-acao-confirmacao", "DESCONECTAR");
  await page.click('#whatsapp-acao-form button[type="submit"]');
  await page.waitForFunction((id) => document.querySelector(`[data-connection-card="${id}"]`)?.textContent.includes("Não configurado"), first.id);
  assert.equal((await db.doc("chats/chat-whatsapp-sticky").get()).exists, true, "Desconectar nunca apaga histórico");

  // Reconexão renova a mesma conexão no Emulator e não cria terceira rota.
  await page.locator(`[data-connection-card="${first.id}"] [data-acao="reconectar"]`).click();
  await page.click("#whatsapp-onboarding-iniciar");
  await page.waitForFunction(() => document.getElementById("whatsapp-onboarding-mensagem")?.textContent.includes("Conexão concluída"), null, { timeout: 40000 });
  await page.click("#whatsapp-onboarding-cancelar");

  console.log("whatsapp-oficial.flow: OK — validar, templates, renomear, QR, limite, padrão, reconexão e desconexão.");
}

async function flowInboxWhatsapp(page) {
  const now = Date.now();
  const db = adminDb();
  const openRef = db.collection("chats").doc();
  await openRef.set({ donoUID: OWNER_UID, emailDono: OWNER_UID, clienteNome: "Cliente WhatsApp Aberto", canal: "whatsapp", status: "aguardando_equipe", statusAdmin: "pendente", naoLidasLoja: 1, whatsappWaId: "5511999990000", whatsappUltimaMensagemClienteEm: now, whatsappJanelaAtendimentoAte: now + 12 * 60 * 60 * 1000, ultimaMensagem: "Olá", timestamp: now });
  const closedRef = db.collection("chats").doc();
  await closedRef.set({ donoUID: OWNER_UID, emailDono: OWNER_UID, clienteNome: "Cliente WhatsApp Fechado", canal: "whatsapp", status: "aguardando_equipe", statusAdmin: "pendente", naoLidasLoja: 1, whatsappWaId: "5511888880000", whatsappUltimaMensagemClienteEm: now - 30 * 60 * 60 * 1000, whatsappJanelaAtendimentoAte: now - 6 * 60 * 60 * 1000, ultimaMensagem: "Mensagem antiga", timestamp: now - 30 * 60 * 60 * 1000 });

  assert.equal(await ativarView(page, "view-atendimento", "#atend-lista-conversas"), true);
  await page.click("#atend-btn-atualizar").catch(() => {});
  await page.waitForFunction(() => document.getElementById("atend-lista-conversas")?.textContent.includes("Cliente WhatsApp Aberto"));
  const listText = await page.textContent("#atend-lista-conversas");
  assert.match(listText, /WhatsApp/);
  assert.equal(listText.includes("5511999990000"), false);

  await page.click(`[data-atend-conversa-id="${closedRef.id}"]`);
  await page.waitForSelector("#atend-whatsapp-template-picker", { state: "visible" });
  assert.equal(await page.locator("#atend-form-resposta").isVisible(), false);
  assert.match(await page.textContent("#atend-detalhe-janela-whatsapp"), /Janela encerrada/);

  console.log("whatsapp-oficial.flow: OK — inbox, máscara e janela de 24 horas preservadas.");
}

async function flowFuncionarioLeitor(browser, baseUrl) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  try {
    await loginReal(page, baseUrl, { email: "employee.read@local.test", senha: "Local123!read" });
    assert.equal(await ativarView(page, "view-whatsapp-oficial", "#whatsapp-estado-conteudo"), true);
    assert.equal(await page.locator("#whatsapp-btn-validar").isDisabled(), true);
    assert.equal(await page.locator("#whatsapp-conexoes-lista [data-acao]").count(), 0, "Leitor não recebe ações administrativas");
  } finally {
    await context.close();
  }
}

async function flowFuncionarioSemPermissao(browser, baseUrl) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  try {
    await loginReal(page, baseUrl, { email: "employee.no.whatsapp@local.test", senha: "Local123!nowhatsapp" });
    const menu = page.locator('.nav-item[data-target="view-whatsapp-oficial"]');
    assert.equal(await menu.isVisible(), false, "Funcionário sem whatsapp não vê o item");
    assert.equal(await page.evaluate(() => window.ativarAba?.("view-whatsapp-oficial") ?? false), false, "Ativação programática deve ser bloqueada");
    await page.evaluate(() => document.getElementById("view-whatsapp-oficial")?.classList.remove("hidden"));
    assert.equal((await page.textContent("#whatsapp-conexoes-lista")).trim(), "", "Manipular o DOM não carrega dados");

    const callable = await page.evaluate(async () => {
      const { VideFunctions } = await import("./core/vide-functions.js");
      try {
        await VideFunctions.whatsappListConnections({});
        return { rejected: false };
      } catch (error) {
        return { rejected: true, code: error?.code || "" };
      }
    });
    assert.equal(callable.rejected, true, "Callable administrativa deve rejeitar funcionário sem permissão");
    assert.match(callable.code, /permission-denied/);
  } finally {
    await context.close();
  }
}

async function flowMobile(browser, baseUrl) {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 } });
  const page = await context.newPage();
  try {
    await loginReal(page, baseUrl, { email: "owner.pro@local.test", senha: "Local123!pro" });
    assert.equal(await ativarView(page, "view-whatsapp-oficial", "#whatsapp-estado-conteudo"), true);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 2, `A página mobile não pode ter rolagem horizontal (${overflow}px)`);
    await page.locator("#whatsapp-conexoes-lista [data-acao='renomear']").first().click();
    await page.waitForSelector("#whatsapp-acao-modal", { state: "visible" });
    const modalFits = await page.locator("#whatsapp-acao-modal .aura-whatsapp-modal-card").evaluate((element) => element.getBoundingClientRect().height <= window.innerHeight);
    assert.equal(modalFits, true, "Modal deve caber na viewport mobile");
    await page.click("#whatsapp-acao-cancelar");
  } finally {
    await context.close();
  }
}

async function main() {
  const { baseUrl, close } = await startStaticServer();
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = coletarErrosConsole(page);
  try {
    await loginReal(page, baseUrl, { email: "owner.pro@local.test", senha: "Local123!pro" });
    for (const [name, flow] of [
      ["onboarding", flowOnboardingOwner],
      ["gestao-qr-limite", (currentPage) => flowGestaoQrELimite(currentPage, errors)],
      ["inbox", flowInboxWhatsapp]
    ]) {
      errors.length = 0;
      try {
        await flow(page);
        const relevant = errors.filter((error) => !ehErroDeRedeExterno(error));
        if (relevant.length) throw new Error(`erros de JS: ${JSON.stringify(relevant)}`);
      } catch (error) {
        await captureDiagnostics(page, `whatsapp-${name}-flow`, errors.filter((item) => !ehErroDeRedeExterno(item)));
        throw error;
      }
    }
    await flowFuncionarioLeitor(browser, baseUrl);
    await flowFuncionarioSemPermissao(browser, baseUrl);
    await flowMobile(browser, baseUrl);
  } finally {
    await page.close();
    await browser.close();
    await close();
  }
  console.log("whatsapp-oficial.flow: OK — onboarding, gestão, segurança, inbox e mobile validados de ponta a ponta.");
}

main().catch((error) => {
  console.error("whatsapp-oficial.flow: FALHOU —", error);
  process.exit(1);
});
