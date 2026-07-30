"use strict";

// WhatsApp Oficial V1 — Send: as Cloud Functions onCall que a equipe usa
// pelo dashboard pra falar com o WhatsApp (texto/template/marcar como
// lida) e consultar/validar a conexão. Nunca aceita broadcast (sempre um
// chatId por chamada) e nunca devolve o token de acesso.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { resolveCallerContext, requireEdit } = require("../shared/context");
const { assertRateLimit } = require("../shared/rateLimit");
const { normalizeString, publicText } = require("../shared/validators");
const { writeAudit } = require("../audit");
const { REGION, COLLECTIONS, ERROR_CODES, ERROR_MESSAGES, RATE_LIMITS } = require("./constants");
const resolver = require("./resolver");
const { criarMetaClient } = require("./metaClient");
const { janelaAberta, identificadorRateLimit, safeWamid, mascararSegredo, validarParametrosTemplate } = require("./validators");

const metaClient = criarMetaClient();

function erroPublico(code, mensagemExtra) {
  const mensagem = mensagemExtra || ERROR_MESSAGES[code] || "Erro ao falar com o WhatsApp.";
  return new HttpsError("failed-precondition", mensagem, { code });
}

function mapearErroMeta(erro) {
  if (erro?.code && ERROR_MESSAGES[erro.code]) return erroPublico(erro.code);
  return erroPublico(ERROR_CODES.PROVIDER_UNAVAILABLE);
}

// Decisão PURA — sem Firestore — testada sem emulador em
// tests/functions/whatsapp-functions.test.mjs. Recebe os dados já lidos
// da conexão e devolve {ok:true} ou {ok:false, code}.
function avaliarConexao(conexao) {
  if (!conexao) return { ok: false, code: ERROR_CODES.NOT_CONNECTED };
  if (conexao.status === "revoked" || conexao.status === "disconnected") return { ok: false, code: ERROR_CODES.NOT_CONNECTED };
  if (conexao.status === "suspended") return { ok: false, code: ERROR_CODES.TOKEN_REVOKED };
  if (!conexao.phoneNumberId) return { ok: false, code: ERROR_CODES.NOT_CONNECTED };
  return { ok: true };
}

// Mesmo padrão para template: aprovado + pertence ao tenant certo.
function avaliarTemplate(template, ownerUid) {
  if (!template) return { ok: false, code: ERROR_CODES.TEMPLATE_REQUIRED };
  if (template.ownerUid !== ownerUid) return { ok: false, code: "CROSS_TENANT" };
  if (template.status !== "APPROVED") return { ok: false, code: ERROR_CODES.TEMPLATE_NOT_APPROVED };
  return { ok: true };
}

// Nunca lê whatsapp_connections/{ownerUid} direto de novo — passa pelo
// resolver.js, que decide entre a conexão explícita do chat (connectionId),
// a conexão default nova, ou o piloto legado (nesta ordem, sem nunca
// escolher aleatoriamente). Devolve a conexão resolvida INTEIRA (não só
// os dados) pra quem chamar poder pedir o token certo depois.
async function carregarConexaoResolvida(db, { ownerUid, connectionId }) {
  const resolvido = await resolver.resolverConexao(db, { ownerUid, connectionId });
  const avaliacao = avaliarConexao(resolvido.connection);
  if (!avaliacao.ok) throw erroPublico(avaliacao.code);
  return resolvido;
}

async function carregarChatDoTenant(db, chatId, ownerUid) {
  const chatRef = db.doc(`chats/${chatId}`);
  const snap = await chatRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "Conversa não encontrada.");
  const chat = snap.data() || {};
  const donoChat = chat.donoUID || chat.emailDono;
  if (donoChat !== ownerUid) throw new HttpsError("permission-denied", "Esta conversa não pertence à sua loja.");
  if (chat.canal !== "whatsapp") throw new HttpsError("failed-precondition", "Esta conversa não é do canal WhatsApp.");
  if (!chat.whatsappWaId) throw erroPublico(ERROR_CODES.INVALID_RECIPIENT);
  return { chatRef, chat };
}

async function marcarMensagemFalha(mensagemRef, erro) {
  await mensagemRef.set({
    providerStatus: "failed",
    failedCode: erro?.code || ERROR_CODES.MESSAGE_FAILED,
    failedTitle: erro?.metaErrorTitle || "",
    failedAt: FieldValue.serverTimestamp()
  }, { merge: true }).catch(() => {});
}

const whatsappSendText = onCall({ region: REGION }, async (request) => {
  const context = await resolveCallerContext(request);
  requireEdit(context, "atendimento");

  const chatId = normalizeString(request.data?.chatId, 180);
  const texto = publicText(request.data?.texto, 4000);
  const replyToId = normalizeString(request.data?.replyToId, 200);
  if (!chatId || !texto) throw new HttpsError("invalid-argument", "Conversa e mensagem são obrigatórias.");

  await assertRateLimit({
    scope: "whatsappSendText",
    identifier: identificadorRateLimit("owner", context.ownerUid),
    max: RATE_LIMITS.SEND_TEXT_PER_MIN
  });

  const db = getFirestore();
  const { chatRef, chat } = await carregarChatDoTenant(db, chatId, context.ownerUid);
  // Sempre a conexão de ORIGEM da conversa (chat.whatsappConnectionId) —
  // nunca a conexão default do momento, que pode ter mudado desde que a
  // conversa foi criada (ver docs/WHATSAPP_MODULO_MULTICONEXAO.md).
  const resolvido = await carregarConexaoResolvida(db, { ownerUid: context.ownerUid, connectionId: chat.whatsappConnectionId });
  const conexao = resolvido.connection;

  if (!janelaAberta(chat.whatsappJanelaAtendimentoAte)) throw erroPublico(ERROR_CODES.WINDOW_CLOSED);

  let accessToken;
  try {
    accessToken = await resolver.resolverToken(resolvido);
  } catch (erro) {
    throw mapearErroMeta(erro);
  }

  const mensagemRef = await chatRef.collection("mensagens").add({
    sender: "admin",
    autorTipo: context.isOwner || context.isAdmin ? "proprietario" : "funcionario",
    autorUid: context.authUid,
    canal: "whatsapp",
    direction: "outbound",
    provider: "meta_whatsapp_cloud",
    providerStatus: "queued",
    messageType: "text",
    texto,
    ...(replyToId ? { providerReplyToId: replyToId } : {}),
    timestamp: Date.now(),
    criadoEm: FieldValue.serverTimestamp()
  });

  let resposta;
  try {
    resposta = await metaClient.sendText({
      accessToken,
      phoneNumberId: conexao.phoneNumberId,
      to: chat.whatsappWaId,
      body: texto,
      replyToId
    });
  } catch (erro) {
    await marcarMensagemFalha(mensagemRef, erro);
    if (erro?.code === ERROR_CODES.TOKEN_REVOKED) resolver.limparCacheTokenResolvido(resolvido);
    throw mapearErroMeta(erro);
  }

  const providerMessageId = resposta?.messages?.[0]?.id || "";
  await mensagemRef.set({ providerStatus: "accepted", providerMessageId }, { merge: true });
  if (providerMessageId) {
    await db.doc(`${COLLECTIONS.MESSAGE_MAP}/${safeWamid(providerMessageId)}`).set({
      ownerUid: context.ownerUid,
      chatId,
      messageId: mensagemRef.id,
      direction: "outbound",
      providerStatus: "accepted",
      providerTimestamp: Date.now(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastStatusAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }

  await chatRef.set({
    ultimaMensagem: texto,
    statusAdmin: "respondido",
    atualizadoEm: FieldValue.serverTimestamp()
  }, { merge: true });

  return { ok: true, messageId: mensagemRef.id };
});

const whatsappSendTemplate = onCall({ region: REGION }, async (request) => {
  const context = await resolveCallerContext(request);
  requireEdit(context, "atendimento");

  const chatId = normalizeString(request.data?.chatId, 180);
  const templateId = normalizeString(request.data?.templateId, 200);
  const valores = request.data?.valores && typeof request.data.valores === "object" ? request.data.valores : {};
  if (!chatId || !templateId) throw new HttpsError("invalid-argument", "Conversa e template são obrigatórios.");

  await assertRateLimit({
    scope: "whatsappSendTemplate",
    identifier: identificadorRateLimit("owner", context.ownerUid),
    max: RATE_LIMITS.SEND_TEMPLATE_PER_MIN
  });

  const db = getFirestore();
  const { chatRef, chat } = await carregarChatDoTenant(db, chatId, context.ownerUid);
  const resolvido = await carregarConexaoResolvida(db, { ownerUid: context.ownerUid, connectionId: chat.whatsappConnectionId });
  const conexao = resolvido.connection;

  const templateSnap = await db.doc(`${COLLECTIONS.TEMPLATES}/${templateId}`).get();
  const template = templateSnap.exists ? templateSnap.data() || {} : null;
  const avaliacaoTemplate = avaliarTemplate(template, context.ownerUid);
  if (!avaliacaoTemplate.ok) {
    if (avaliacaoTemplate.code === "CROSS_TENANT") throw new HttpsError("permission-denied", "Este template não pertence à sua loja.");
    throw erroPublico(avaliacaoTemplate.code);
  }

  const validacao = validarParametrosTemplate(template.parameterSchema, valores);
  if (!validacao.valido) throw new HttpsError("invalid-argument", validacao.erros.join(" "));

  const componentesEnvio = montarComponentesEnvio(template, valores);

  let accessToken;
  try {
    accessToken = await resolver.resolverToken(resolvido);
  } catch (erro) {
    throw mapearErroMeta(erro);
  }

  const mensagemRef = await chatRef.collection("mensagens").add({
    sender: "admin",
    autorTipo: context.isOwner || context.isAdmin ? "proprietario" : "funcionario",
    autorUid: context.authUid,
    canal: "whatsapp",
    direction: "outbound",
    provider: "meta_whatsapp_cloud",
    providerStatus: "queued",
    messageType: "template",
    templateName: template.name,
    templateLanguage: template.language,
    timestamp: Date.now(),
    criadoEm: FieldValue.serverTimestamp()
  });

  let resposta;
  try {
    resposta = await metaClient.sendTemplate({
      accessToken,
      phoneNumberId: conexao.phoneNumberId,
      to: chat.whatsappWaId,
      templateName: template.name,
      languageCode: template.language,
      components: componentesEnvio
    });
  } catch (erro) {
    await marcarMensagemFalha(mensagemRef, erro);
    if (erro?.code === ERROR_CODES.TOKEN_REVOKED) resolver.limparCacheTokenResolvido(resolvido);
    throw mapearErroMeta(erro);
  }

  const providerMessageId = resposta?.messages?.[0]?.id || "";
  await mensagemRef.set({ providerStatus: "accepted", providerMessageId }, { merge: true });
  if (providerMessageId) {
    await db.doc(`${COLLECTIONS.MESSAGE_MAP}/${safeWamid(providerMessageId)}`).set({
      ownerUid: context.ownerUid,
      chatId,
      messageId: mensagemRef.id,
      direction: "outbound",
      providerStatus: "accepted",
      providerTimestamp: Date.now(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastStatusAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }

  await chatRef.set({
    ultimaMensagem: `[Template] ${template.name}`,
    statusAdmin: "respondido",
    atualizadoEm: FieldValue.serverTimestamp()
  }, { merge: true });

  return { ok: true, messageId: mensagemRef.id };
});

// Monta o array "components" no formato da Graph API a partir do
// parameterSchema salvo (ver templates.js) e dos valores preenchidos na
// UI — V1 só parâmetros de texto no corpo (sem header de mídia).
function montarComponentesEnvio(template, valores) {
  const schema = Array.isArray(template.parameterSchema) ? template.parameterSchema : [];
  if (schema.length === 0) return [];
  const parametros = schema.map((campo) => ({ type: "text", text: String(valores?.[campo.name] ?? "") }));
  return [{ type: "body", parameters: parametros }];
}

const whatsappMarkRead = onCall({ region: REGION }, async (request) => {
  const context = await resolveCallerContext(request);
  requireEdit(context, "atendimento");

  const chatId = normalizeString(request.data?.chatId, 180);
  const mensagemId = normalizeString(request.data?.mensagemId, 200);
  if (!chatId || !mensagemId) throw new HttpsError("invalid-argument", "Conversa e mensagem são obrigatórias.");

  await assertRateLimit({
    scope: "whatsappMarkRead",
    identifier: identificadorRateLimit("owner", context.ownerUid),
    max: RATE_LIMITS.MARK_READ_PER_MIN
  });

  const db = getFirestore();
  const { chatRef, chat } = await carregarChatDoTenant(db, chatId, context.ownerUid);
  const resolvido = await carregarConexaoResolvida(db, { ownerUid: context.ownerUid, connectionId: chat.whatsappConnectionId });
  const conexao = resolvido.connection;

  const mensagemRef = chatRef.collection("mensagens").doc(mensagemId);
  const mensagemSnap = await mensagemRef.get();
  if (!mensagemSnap.exists) throw new HttpsError("not-found", "Mensagem não encontrada.");
  const mensagem = mensagemSnap.data() || {};
  if (!mensagem.providerMessageId) return { ok: true, skipped: true };

  let accessToken;
  try {
    accessToken = await resolver.resolverToken(resolvido);
  } catch (erro) {
    throw mapearErroMeta(erro);
  }

  try {
    await metaClient.markRead({ accessToken, phoneNumberId: conexao.phoneNumberId, messageId: mensagem.providerMessageId });
  } catch (erro) {
    throw mapearErroMeta(erro);
  }

  await chatRef.set({ naoLidasLoja: 0 }, { merge: true });
  return { ok: true };
});

// Permissão própria do módulo WhatsApp ("whatsapp", ver/editar — mesmo
// padrão de "atendimento"/"crm"). O dono sempre pode; um funcionário
// precisa da permissão explícita, nunca herda de "atendimento" ou
// "configuracoes" mais (separação de propósito desta missão — ver
// docs/WHATSAPP_MODULO_MULTICONEXAO.md). "Ver" mostra metadados seguros;
// só "gerenciar" (editar) pode validar conexão, mudar o padrão ou
// futuramente iniciar/concluir onboarding.
const PERMISSAO_MODULO_WHATSAPP = "whatsapp";

function podeVerConexao(context) {
  if (context.isAdmin || context.isOwner) return true;
  const ver = context.permissions?.ver || [];
  const editar = context.permissions?.editar || [];
  return ver.includes(PERMISSAO_MODULO_WHATSAPP) || editar.includes(PERMISSAO_MODULO_WHATSAPP);
}

function podeGerenciarConexao(context) {
  if (context.isAdmin || context.isOwner) return true;
  const editar = context.permissions?.editar || [];
  return editar.includes(PERMISSAO_MODULO_WHATSAPP);
}

// Ref real do documento resolvido — nunca escreve num id inventado; usa
// exatamente o mesmo documento que resolver.js encontrou (legado por
// ownerUid, ou novo por connectionId).
function refConexaoResolvida(db, resolvido, ownerUid) {
  const id = resolvido.legacy ? ownerUid : resolvido.connectionId;
  return db.doc(`${COLLECTIONS.CONNECTIONS}/${id}`);
}

const whatsappConnectionStatus = onCall({ region: REGION }, async (request) => {
  const context = await resolveCallerContext(request);
  if (!podeVerConexao(context)) throw new HttpsError("permission-denied", "Permissão insuficiente.");

  const connectionId = normalizeString(request.data?.connectionId, 200);
  const db = getFirestore();
  const resolvido = await resolver.resolverConexao(db, { ownerUid: context.ownerUid, connectionId });
  if (!resolvido.connection) return { ok: true, connected: false, status: "disconnected" };

  const dados = resolvido.connection;
  // Nunca devolve tokenSecretResource (nome do recurso do Secret Manager)
  // nem qualquer campo de segredo — só o que a UI precisa mostrar.
  return {
    ok: true,
    connectionId: resolvido.connectionId,
    legacy: resolvido.legacy,
    label: dados.label || "",
    isDefault: resolvido.legacy ? true : Boolean(dados.isDefault),
    providerMode: dados.providerMode || "",
    connected: dados.status === "connected",
    status: dados.status || "disconnected",
    displayPhoneNumber: dados.displayPhoneNumber || "",
    verifiedName: dados.verifiedName || "",
    qualityRating: dados.qualityRating || "",
    messagingLimitTier: dados.messagingLimitTier || "",
    webhookSubscribed: Boolean(dados.webhookSubscribed),
    lastValidatedAt: dados.lastValidatedAt || null,
    lastWebhookAt: dados.lastWebhookAt || null,
    lastTemplateSyncAt: dados.lastTemplateSyncAt || null,
    lastErrorCode: dados.lastErrorCode || "",
    graphVersion: dados.graphVersion || "",
    tokenMasked: mascararSegredo()
  };
});

const whatsappValidateConnection = onCall({ region: REGION }, async (request) => {
  const context = await resolveCallerContext(request);
  if (!podeGerenciarConexao(context)) throw new HttpsError("permission-denied", "Permissão insuficiente para validar a conexão.");

  await assertRateLimit({
    scope: "whatsappValidateConnection",
    identifier: identificadorRateLimit("owner", context.ownerUid),
    max: RATE_LIMITS.CONNECTION_VALIDATE_PER_MIN
  });

  const connectionId = normalizeString(request.data?.connectionId, 200);
  const db = getFirestore();
  const resolvido = await carregarConexaoResolvida(db, { ownerUid: context.ownerUid, connectionId });
  const conexaoRef = refConexaoResolvida(db, resolvido, context.ownerUid);

  let accessToken;
  try {
    accessToken = await resolver.resolverToken(resolvido);
  } catch (erro) {
    throw mapearErroMeta(erro);
  }

  let dadosNumero;
  try {
    dadosNumero = await metaClient.getPhoneNumber({ accessToken, phoneNumberId: resolvido.connection.phoneNumberId });
  } catch (erro) {
    await conexaoRef.set({
      status: erro?.code === ERROR_CODES.TOKEN_REVOKED ? "revoked" : "degraded",
      lastErrorCode: erro?.code || ERROR_CODES.PROVIDER_UNAVAILABLE,
      lastErrorAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: context.authUid
    }, { merge: true });
    throw mapearErroMeta(erro);
  }

  await conexaoRef.set({
    status: "connected",
    displayPhoneNumber: dadosNumero?.display_phone_number || "",
    verifiedName: dadosNumero?.verified_name || "",
    qualityRating: dadosNumero?.quality_rating || "",
    messagingLimitTier: dadosNumero?.messaging_limit_tier || "",
    lastValidatedAt: FieldValue.serverTimestamp(),
    lastErrorCode: "",
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: context.authUid
  }, { merge: true });

  await writeAudit({
    ownerUid: context.ownerUid,
    authUid: context.authUid,
    module: "atendimento",
    targetId: resolvido.legacy ? context.ownerUid : resolvido.connectionId,
    action: "whatsapp.conexao_validada",
    risk: "medium",
    summary: resolvido.legacy
      ? "Conexão do WhatsApp Oficial (piloto legado) validada manualmente."
      : `Conexão do WhatsApp Oficial "${resolvido.connection.label || resolvido.connectionId}" validada manualmente.`,
    source: "function"
  });

  return { ok: true, status: "connected" };
});

module.exports = {
  whatsappSendText,
  whatsappSendTemplate,
  whatsappMarkRead,
  whatsappConnectionStatus,
  whatsappValidateConnection,
  avaliarConexao,
  avaliarTemplate,
  montarComponentesEnvio,
  podeVerConexao,
  podeGerenciarConexao
};
