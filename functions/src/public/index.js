"use strict";

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { publicText, normalizeEmail, normalizePhone, normalizeString } = require("../shared/validators");
const { assertPublicRateLimit } = require("../shared/rateLimit");
const { writeAudit } = require("../audit");

const RATE_LIMITS = Object.freeze({
  createPublicLead: 5,
  incrementPublicMetric: 60,
  createPublicChat: 5,
  sendPublicChatMessage: 20,
  createPublicReview: 5
});

const publicOptions = {
  region: "southamerica-east1",
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true"
};

// Todo campo de texto já é truncado individualmente (publicText/normalizeString),
// mas isso por si só não impede um payload hostil (ex.: milhares de campos
// desconhecidos, ou um objeto aninhado gigante) de custar processamento antes
// da truncagem. Corta cedo, antes de qualquer leitura no Firestore.
const MAX_PUBLIC_PAYLOAD_BYTES = 20000;

function assertReasonablePayloadSize(data) {
  let size;
  try {
    size = Buffer.byteLength(JSON.stringify(data || {}) || "", "utf8");
  } catch (error) {
    throw new HttpsError("invalid-argument", "Dados inválidos.");
  }
  if (size > MAX_PUBLIC_PAYLOAD_BYTES) {
    throw new HttpsError("invalid-argument", "Dados enviados excedem o tamanho permitido.");
  }
}

async function assertOwnerActive(ownerUid) {
  const ownerSnap = await getFirestore().doc(`usuarios/${ownerUid}`).get();
  if (!ownerSnap.exists || ownerSnap.data()?.status !== "aprovado") {
    throw new HttpsError("failed-precondition", "Loja indisponível.");
  }
}

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
    const ownerUid = store.donoUID || store.emailDono;
    await assertOwnerActive(ownerUid);
    return {
      ownerUid,
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
    await assertOwnerActive(page.donoUID);
    return {
      ownerUid: page.donoUID,
      publicPageId,
      page,
      sourceType: "landing-page"
    };
  }

  throw new HttpsError("invalid-argument", "Identificador público da loja ou LP é obrigatório.");
}

const TIPOS_CAPTURA = new Set(["checkout_whatsapp", "clique_produto", "formulario_popup", "interesse"]);

function clampNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

// Mesma forma/limites de normalizarItensPedidoPublico() em loja.html — o
// preço aqui é só o que o cliente afirma que pagou (precoSnapshot), NUNCA
// revalidado contra o preço real do produto no servidor. Isso não é novo
// desta migração: o caminho anterior (escrita direta no Firestore) também
// nunca validava preço. Endurecer isso de verdade (recalcular a partir de
// produtos/{id} no servidor) é validação de pedido/checkout, escopo maior
// que "dar rate limit ao lead público" — ver docs/KNOWN_LIMITATIONS.md.
function sanitizeOrderItem(item, index) {
  const quantidade = Math.round(clampNumber(item?.quantidade, 1, 999));
  const preco = clampNumber(item?.precoSnapshot ?? item?.preco, 0, 1000000);
  return {
    produtoId: publicText(item?.produtoId || item?.id || `item_${index + 1}`, 180),
    nomeSnapshot: publicText(item?.nomeSnapshot || item?.nome || "Produto", 160) || "Produto",
    precoSnapshot: preco,
    quantidade,
    subtotal: preco * quantidade
  };
}

function sanitizeOrderSnapshot(bruto, data) {
  if (!bruto || typeof bruto !== "object") return null;
  const itens = (Array.isArray(bruto.itens) ? bruto.itens : []).slice(0, 20).map(sanitizeOrderItem);
  const subtotalCalculado = itens.reduce((total, item) => total + item.subtotal, 0);
  const desconto = clampNumber(bruto.desconto, 0, 1000000);
  const frete = clampNumber(bruto.frete, 0, 1000000);
  const totalInformado = clampNumber(bruto.total, 0, 1000000);
  const total = totalInformado > 0 ? totalInformado : Math.max(0, subtotalCalculado - desconto + frete);
  return {
    numeroPedido: publicText(bruto.numeroPedido || data?.numeroPedido, 80),
    clienteNome: publicText(bruto.clienteNome || data?.nome, 120),
    clienteWhatsapp: publicText(bruto.clienteWhatsapp || data?.whatsapp || data?.telefone, 40),
    tipoRecebimento: bruto.tipoRecebimento === "entrega" ? "entrega" : "retirada",
    cep: publicText(bruto.cep, 20),
    endereco: publicText(bruto.endereco, 220),
    observacoes: publicText(bruto.observacoes, 500),
    itens,
    produtosTexto: publicText(
      bruto.produtosTexto || itens.map((item) => `${item.quantidade}x ${item.nomeSnapshot}`).join(", "),
      2000
    ),
    subtotal: subtotalCalculado,
    desconto,
    frete,
    total,
    moeda: "BRL",
    statusPedido: "novo",
    statusPagamento: "pendente",
    criadoEm: Date.now()
  };
}

function leadPayload(data, tenant) {
  const nome = publicText(data?.nome || data?.name, 120);
  const whatsapp = normalizePhone(data?.whatsapp || data?.telefone || data?.phone);
  const email = normalizeEmail(data?.email);
  if (!nome && !whatsapp && !email) {
    throw new HttpsError("invalid-argument", "Informe ao menos um dado de contato.");
  }

  const tipoCaptura = TIPOS_CAPTURA.has(data?.tipoCaptura) ? data.tipoCaptura : "interesse";
  const pedidoSnapshot = sanitizeOrderSnapshot(data?.pedidoSnapshot, data);

  const payload = {
    criadoPor: tenant.ownerUid,
    tenantId: tenant.ownerUid,
    lojaId: tenant.ownerUid,
    nome,
    whatsapp,
    telefone: whatsapp,
    email,
    origem: publicText(data?.origem || data?.utmSource || "Público", 120),
    produtoInteresse: publicText(data?.produtoInteresse || tenant.page?.titulo || tenant.store?.nomeLoja || "Interesse geral", 160),
    produtoId: publicText(data?.produtoId, 180),
    statusLead: "novo",
    status: "novo",
    pipelineStage: "novo",
    prioridadeLead: "normal",
    canal: "loja_publica",
    tipoCaptura,
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
    sessionId: publicText(data?.sessionId || data?.sessaoId || "", 120),
    visitorId: publicText(data?.visitorId || "", 120),
    dedupeKey: publicText(data?.dedupeKey || "", 200),
    cliques: Math.round(clampNumber(data?.cliques, 0, 10000)),
    tempoRetencao: Math.round(clampNumber(data?.tempoRetencao, 0, 86400)),
    consentimentoContato: data?.consentimentoContato !== false,
    data: Date.now(),
    criadoEm: FieldValue.serverTimestamp(),
    capturadoEmBackend: FieldValue.serverTimestamp(),
    versaoCaptura: publicText(data?.versaoCaptura || "function-v1", 40)
  };

  if (pedidoSnapshot) {
    const numeroPedido = pedidoSnapshot.numeroPedido || publicText(data?.pedidoId, 100);
    Object.assign(payload, {
      tipoRegistro: "pedido",
      pedidoId: numeroPedido,
      numeroPedido,
      pedidoStatus: "novo",
      pagamentoStatus: "pendente",
      pedidoCriadoEm: Date.now(),
      pedidoAtualizadoEm: Date.now(),
      pedidoSnapshot,
      pedidoHistorico: [{
        titulo: "Pedido registrado na loja",
        detalhe: `${pedidoSnapshot.produtosTexto} · ${pedidoSnapshot.total}`,
        timestamp: Date.now(),
        autorNome: "Loja online"
      }],
      valorOportunidade: pedidoSnapshot.total,
      probabilidade: 70
    });
  }

  return payload;
}

// enforceAppCheck: false — publicOptions liga isso em produção, mas
// loja.html (nem nenhuma outra página pública) chama initializeAppCheck().
// Herdar o padrão faria toda chamada real cair com "unauthenticated" antes
// de rodar — mesmo bug já documentado e corrigido em askPublicBusinessAI
// (functions/src/ai/index.js). A mitigação de abuso real aqui é o rate
// limit por IP (assertPublicRateLimit abaixo), igual às outras Functions
// públicas.
const createPublicLead = onCall({ ...publicOptions, enforceAppCheck: false }, async (request) => {
  await assertPublicRateLimit(request, "createPublicLead", RATE_LIMITS.createPublicLead);
  assertReasonablePayloadSize(request.data);
  const tenant = await resolvePublicTenant(request.data || {});
  const payload = leadPayload(request.data || {}, tenant);
  const ref = await getFirestore().collection("leads").add(payload);
  // Sem writeAudit() aqui: auditLeadsWrite (trigger em leads/{id}) já
  // audita a criação, com actorType "unknown"/"unauthenticated" derivado
  // do Auth Context real da escrita (esta Function não passa por auth de
  // usuário — visitante público sempre foi anônimo aqui).
  return { ok: true, leadId: ref.id };
});

const METRIC_EVENTS = new Set(["store_session", "store_time", "product_view", "product_click", "lp_view"]);

const incrementPublicMetric = onCall(publicOptions, async (request) => {
  await assertPublicRateLimit(request, "incrementPublicMetric", RATE_LIMITS.incrementPublicMetric);
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

  if (event === "lp_view") {
    if (tenant.sourceType !== "landing-page") {
      throw new HttpsError("failed-precondition", "Evento válido apenas para Landing Pages.");
    }
    await db.doc(`metricas_landing_pages/${tenant.publicPageId}`).set({
      totalVisualizacoes: FieldValue.increment(1),
      [`porDia.${today}.visualizacoes`]: FieldValue.increment(1)
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

// Espelha exatamente a checagem que avaliacaoPublicaValida()/
// produtoPublicadoParaAvaliacao() faziam em firestore.rules antes desta
// migração: produto precisa existir, não pode ser rascunho, e o tenant da
// avaliação é sempre o dono REAL do produto (nunca o que o visitante manda).
async function resolvePublicProduct(produtoId) {
  const id = normalizeString(produtoId, 180);
  if (!id) throw new HttpsError("invalid-argument", "Produto é obrigatório.");
  const snap = await getFirestore().doc(`produtos/${id}`).get();
  if (!snap.exists) throw new HttpsError("not-found", "Produto não encontrado.");
  const produto = snap.data() || {};
  if (produto.statusProduto === "rascunho") {
    throw new HttpsError("failed-precondition", "Produto indisponível para avaliação.");
  }
  if (!produto.criadoPor) {
    throw new HttpsError("failed-precondition", "Produto sem tenant válido.");
  }
  return { id, ownerUid: produto.criadoPor };
}

function reviewPayload(data, product) {
  const nome = publicText(data?.nome || data?.name, 80);
  if (!nome) throw new HttpsError("invalid-argument", "Nome é obrigatório.");
  const notaBruta = Number(data?.nota);
  if (!Number.isInteger(notaBruta) || notaBruta < 1 || notaBruta > 5) {
    throw new HttpsError("invalid-argument", "Nota deve ser um número inteiro de 1 a 5.");
  }
  return {
    produtoId: product.id,
    criadoPor: product.ownerUid,
    nome,
    nota: notaBruta,
    comentario: publicText(data?.comentario, 1000),
    status: "novo",
    data: FieldValue.serverTimestamp(),
    lojaSlug: publicText(data?.lojaSlug, 160)
  };
}

// enforceAppCheck: false — mesma decisão e mesmo motivo de createPublicLead
// (ver comentário lá): nenhuma página pública chama initializeAppCheck().
// Mitigação real de abuso é o rate limit por IP abaixo.
const createPublicReview = onCall({ ...publicOptions, enforceAppCheck: false }, async (request) => {
  await assertPublicRateLimit(request, "createPublicReview", RATE_LIMITS.createPublicReview);
  assertReasonablePayloadSize(request.data);
  const product = await resolvePublicProduct(request.data?.produtoId);
  const payload = reviewPayload(request.data || {}, product);
  const ref = await getFirestore().collection("avaliacoes").add(payload);
  return { ok: true, avaliacaoId: ref.id };
});

const createPublicChat = onCall(publicOptions, async (request) => {
  await assertPublicRateLimit(request, "createPublicChat", RATE_LIMITS.createPublicChat);
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
  await assertPublicRateLimit(request, "sendPublicChatMessage", RATE_LIMITS.sendPublicChatMessage);
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
  createPublicReview,
  incrementPublicMetric,
  sendPublicChatMessage,
  // Reexportados pra askPublicBusinessAI (functions/src/ai/index.js) reusar
  // a mesma resolução de tenant público e as mesmas opções de Function
  // pública, em vez de duplicar — ambos vivem dentro de functions/, sem a
  // fronteira de empacotamento que existe entre functions/ e a raiz do
  // repo (ver comentário em promptBuilder.js).
  resolvePublicTenant,
  publicOptions,
  // Funções puras exportadas só para teste unitário direto (sem emulador)
  // de tests/functions/public-lead.test.mjs e tests/functions/public-review.test.mjs.
  leadPayload,
  sanitizeOrderSnapshot,
  reviewPayload,
  assertReasonablePayloadSize
};
