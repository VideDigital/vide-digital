"use strict";

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { publicText, normalizeEmail, normalizePhone, normalizeString } = require("../shared/validators");
const { writeAudit } = require("../audit");

const publicOptions = {
  region: "southamerica-east1",
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true"
};

async function resolvePublicTenant(data) {
  const db = getFirestore();
  const storeSlug = normalizeString(data?.storeSlug || data?.lojaSlug, 160).toLowerCase();
  const publicPageId = normalizeString(data?.publicPageId || data?.pageId, 220);

  if (storeSlug) {
    const snap = await db.doc(`vitrines_publicas/${storeSlug}`).get();
    if (!snap.exists) throw new HttpsError("not-found", "Loja pública não encontrada.");
    const store = { id: snap.id, ...snap.data() };
    if (!store.donoUID && !store.emailDono) {
      throw new HttpsError("failed-precondition", "Loja sem tenant público válido.");
    }
    return {
      ownerUid: store.donoUID || store.emailDono,
      storeSlug,
      store,
      sourceType: "store"
    };
  }

  if (publicPageId) {
    const snap = await db.doc(`landing_pages_publicas/${publicPageId}`).get();
    if (!snap.exists) throw new HttpsError("not-found", "Landing Page pública não encontrada.");
    const page = { id: snap.id, ...snap.data() };
    if (!page.donoUID) throw new HttpsError("failed-precondition", "Landing Page sem tenant.");
    return {
      ownerUid: page.donoUID,
      publicPageId,
      page,
      sourceType: "landing-page"
    };
  }

  throw new HttpsError("invalid-argument", "Identificador público da loja ou LP é obrigatório.");
}

function leadPayload(data, tenant) {
  const nome = publicText(data?.nome || data?.name, 120);
  const whatsapp = normalizePhone(data?.whatsapp || data?.telefone || data?.phone);
  const email = normalizeEmail(data?.email);
  if (!nome && !whatsapp && !email) {
    throw new HttpsError("invalid-argument", "Informe ao menos um dado de contato.");
  }
  return {
    criadoPor: tenant.ownerUid,
    nome,
    whatsapp,
    telefone: whatsapp,
    email,
    origem: publicText(data?.origem || data?.utmSource || "Público", 120),
    produtoInteresse: publicText(data?.produtoInteresse || tenant.page?.titulo || tenant.store?.nomeLoja || "Interesse geral", 160),
    statusLead: "novo",
    status: "novo",
    prioridadeLead: "normal",
    paginaOrigem: publicText(data?.paginaOrigem || data?.pageSlug || "", 160),
    lojaOrigem: tenant.storeSlug || publicText(data?.lojaOrigem || "", 160),
    blocoOrigem: publicText(data?.blocoOrigem || data?.blockId || "", 160),
    formularioId: publicText(data?.formularioId || "captura_publica", 120),
    formularioNome: publicText(data?.formularioNome || "Captura pública", 120),
    urlPagina: publicText(data?.urlPagina || "", 500),
    referrer: publicText(data?.referrer || "", 500),
    utmSource: publicText(data?.utmSource || "", 120),
    utmMedium: publicText(data?.utmMedium || "", 120),
    utmCampaign: publicText(data?.utmCampaign || "", 120),
    utmContent: publicText(data?.utmContent || "", 120),
    utmTerm: publicText(data?.utmTerm || "", 120),
    sessionId: publicText(data?.sessionId || "", 120),
    visitorId: publicText(data?.visitorId || "", 120),
    consentimentoContato: data?.consentimentoContato !== false,
    data: Date.now(),
    criadoEm: FieldValue.serverTimestamp(),
    capturadoEmBackend: FieldValue.serverTimestamp(),
    versaoCaptura: publicText(data?.versaoCaptura || "function-v1", 40)
  };
}

const createPublicLead = onCall(publicOptions, async (request) => {
  const tenant = await resolvePublicTenant(request.data || {});
  const payload = leadPayload(request.data || {}, tenant);
  const ref = await getFirestore().collection("leads").add(payload);
  await writeAudit({
    authUid: null,
    ownerUid: tenant.ownerUid,
    module: "leads",
    action: "createPublicLead",
    targetId: ref.id,
    source: tenant.sourceType
  });
  return { ok: true, leadId: ref.id };
});

const METRIC_EVENTS = new Set(["store_session", "store_time", "product_view", "product_click"]);

const incrementPublicMetric = onCall(publicOptions, async (request) => {
  const data = request.data || {};
  const event = normalizeString(data.event, 40);
  if (!METRIC_EVENTS.has(event)) {
    throw new HttpsError("invalid-argument", "Evento de métrica inválido.");
  }
  const tenant = await resolvePublicTenant(data);
  const db = getFirestore();
  const today = new Date().toISOString().slice(0, 10);

  if (event === "store_session") {
    await db.doc(`metricas_vitrines/${tenant.ownerUid}`).set({
      totalSessoes: FieldValue.increment(1),
      [`porDia.${today}.sessoes`]: FieldValue.increment(1)
    }, { merge: true });
  }

  if (event === "store_time") {
    const seconds = Math.max(0, Math.min(Number(data.seconds || 0), 3600));
    await db.doc(`metricas_vitrines/${tenant.ownerUid}`).set({
      totalTempoTela: FieldValue.increment(seconds),
      [`porDia.${today}.tempo`]: FieldValue.increment(seconds)
    }, { merge: true });
  }

  if (event === "product_view" || event === "product_click") {
    const productId = normalizeString(data.productId, 180);
    if (!productId) throw new HttpsError("invalid-argument", "Produto obrigatório.");
    const productSnap = await db.doc(`produtos/${productId}`).get();
    if (!productSnap.exists || productSnap.data().criadoPor !== tenant.ownerUid) {
      throw new HttpsError("permission-denied", "Produto não pertence à loja pública.");
    }
    const metricPatch = event === "product_view"
      ? { visualizacoes: FieldValue.increment(1) }
      : { cliques: FieldValue.increment(1) };
    await db.doc(`metricas_produtos/${productId}`).set(metricPatch, { merge: true });
    if (event === "product_click") {
      const productName = publicText(data.productName || productSnap.data().nome || productId, 160);
      await db.doc(`metricas_vitrines/${tenant.ownerUid}`).set({
        totalCliques: FieldValue.increment(1),
        [`produtosInteresse.${productName}`]: FieldValue.increment(1),
        [`porDia.${today}.cliques`]: FieldValue.increment(1)
      }, { merge: true });
    }
  }

  return { ok: true };
});

const createPublicChat = onCall(publicOptions, async (request) => {
  const tenant = await resolvePublicTenant(request.data || {});
  const clienteNome = publicText(request.data?.clienteNome || request.data?.nome, 120);
  if (!clienteNome) throw new HttpsError("invalid-argument", "Nome do cliente obrigatório.");
  const chatRef = getFirestore().collection("chats").doc();
  await chatRef.set({
    donoUID: tenant.ownerUid,
    emailDono: tenant.ownerUid,
    clienteNome,
    statusAdmin: "pendente",
    utmSource: publicText(request.data?.utmSource || "", 120),
    timestamp: Date.now(),
    criadoEm: FieldValue.serverTimestamp()
  });
  return { ok: true, chatId: chatRef.id };
});

const sendPublicChatMessage = onCall(publicOptions, async (request) => {
  const chatId = normalizeString(request.data?.chatId, 180);
  const texto = publicText(request.data?.texto, 1000);
  if (!chatId || !texto) throw new HttpsError("invalid-argument", "Chat e mensagem são obrigatórios.");
  const db = getFirestore();
  const chatRef = db.doc(`chats/${chatId}`);
  const chatSnap = await chatRef.get();
  if (!chatSnap.exists) throw new HttpsError("not-found", "Chat não encontrado.");
  await chatRef.collection("mensagens").add({
    texto,
    sender: "cliente",
    timestamp: Date.now(),
    criadoEm: FieldValue.serverTimestamp()
  });
  await chatRef.set({
    ultimaMensagem: texto,
    statusAdmin: "pendente",
    atualizadoEm: FieldValue.serverTimestamp()
  }, { merge: true });
  return { ok: true };
});

module.exports = {
  createPublicChat,
  createPublicLead,
  incrementPublicMetric,
  sendPublicChatMessage
};
