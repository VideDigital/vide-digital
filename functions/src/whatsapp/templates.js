"use strict";

// WhatsApp Oficial V1 — Templates: sincroniza os templates aprovados na
// Meta (WhatsApp Manager) para whatsapp_templates/{ownerUid}_{metaTemplateId}.
// V1 nunca CRIA template via API (isso continua só no WhatsApp Manager,
// fora daqui) — só lista/espelha o que já existe lá.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { resolveCallerContext } = require("../shared/context");
const { assertRateLimit } = require("../shared/rateLimit");
const { writeAudit } = require("../audit");
const onboardingCore = require("./onboarding-core");
const { readWhatsappPublicConfig } = require("./config");
const { REGION, COLLECTIONS, ERROR_CODES, ERROR_MESSAGES, RATE_LIMITS } = require("./constants");
const resolver = require("./resolver");
const { criarMetaClient } = require("./metaClient");
const { identificadorRateLimit } = require("./validators");
const { normalizeString } = require("../shared/validators");
const { podeGerenciarConexao } = require("./send");

const metaClient = criarMetaClient();

function erroPublico(code) {
  return new HttpsError("failed-precondition", ERROR_MESSAGES[code] || "Erro ao sincronizar templates.", { code });
}

// Deriva um parameterSchema simples (só parâmetros de texto, V1) a partir
// do componente BODY de um template da Meta — um corpo como "Olá {{1}},
// seu pedido {{2}} foi atualizado" vira [{name:"1",...}, {name:"2",...}].
// Mantém a ordem numérica dos marcadores, que é a ordem que a Graph API
// espera ao enviar os parâmetros.
function derivarParameterSchema(components) {
  const body = (Array.isArray(components) ? components : []).find((c) => c?.type === "BODY");
  const texto = String(body?.text || "");
  const marcadores = new Set();
  const regex = /\{\{\s*(\d+)\s*\}\}/g;
  let match = regex.exec(texto);
  while (match !== null) {
    marcadores.add(match[1]);
    match = regex.exec(texto);
  }
  return Array.from(marcadores)
    .sort((a, b) => Number(a) - Number(b))
    .map((nome) => ({ name: nome, type: "text", required: true }));
}

function normalizarTemplateMeta(ownerUid, wabaId, templateMeta) {
  const qualidade = templateMeta.quality_score?.score || templateMeta.quality_score || "";
  return {
    ownerUid,
    wabaId,
    metaTemplateId: String(templateMeta.id || ""),
    name: String(templateMeta.name || "").slice(0, 200),
    language: String(templateMeta.language || "").slice(0, 20),
    category: String(templateMeta.category || "").slice(0, 60),
    status: String(templateMeta.status || "").slice(0, 40),
    components: Array.isArray(templateMeta.components) ? templateMeta.components : [],
    parameterSchema: derivarParameterSchema(templateMeta.components),
    qualityScore: String(qualidade).slice(0, 40),
    syncedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  };
}

const whatsappSyncTemplates = onCall({ region: REGION }, async (request) => {
  const context = await resolveCallerContext(request);
  // Sincronizar templates é uma ação do MÓDULO WhatsApp (Fase 4), não da
  // Central de Atendimento — mesma permissão própria "whatsapp" de
  // podeVerConexao/podeGerenciarConexao em send.js, nunca mais herdada de
  // "atendimento".
  if (!podeGerenciarConexao(context)) throw new HttpsError("permission-denied", "Permissão insuficiente para sincronizar templates.");

  await assertRateLimit({
    scope: "whatsappSyncTemplates",
    identifier: identificadorRateLimit("owner", context.ownerUid),
    max: RATE_LIMITS.TEMPLATE_SYNC_PER_HOUR
  });

  const connectionId = normalizeString(request.data?.connectionId, 200);
  const legacy = Boolean(request.data?.legacy);
  const db = getFirestore();
  const resolvido = await resolver.resolverConexao(db, { ownerUid: context.ownerUid, connectionId, legacy });
  // connectionId/legacy explícitos que não resolveram NUNCA sincronizam a
  // WABA de outra conexão silenciosamente — erro específico, nunca cai
  // no genérico NOT_CONNECTED (que sugeriria "nenhuma conexão existe",
  // quando na verdade existe(m) outra(s), só não a pedida).
  if (resolvido.connectionIdInvalido) throw erroPublico(ERROR_CODES.CONNECTION_MISMATCH);
  if (!resolvido.connection) throw erroPublico(ERROR_CODES.NOT_CONNECTED);
  const conexao = resolvido.connection;
  if (!conexao.wabaId) throw erroPublico(ERROR_CODES.NOT_CONNECTED);

  let resposta;
  try {
    if (readWhatsappPublicConfig().emulator) resposta = { data: [] };
    else {
      const accessToken = await resolver.resolverToken(resolvido);
      resposta = await metaClient.listTemplates({ accessToken, wabaId: conexao.wabaId });
    }
  } catch (erro) {
    throw erroPublico(erro?.code || ERROR_CODES.PROVIDER_UNAVAILABLE);
  }

  const templatesMeta = Array.isArray(resposta?.data) ? resposta.data : [];
  let sincronizados = 0;
  // batch.commit() tem limite de 500 escritas — templates por número
  // costumam ser dezenas, não milhares; se algum dia isso mudar, paginar
  // aqui é a extensão natural.
  const batch = db.batch();
  for (const templateMeta of templatesMeta) {
    if (!templateMeta?.id) continue;
    const ref = db.doc(`${COLLECTIONS.TEMPLATES}/${context.ownerUid}_${templateMeta.id}`);
    batch.set(ref, {
      ...normalizarTemplateMeta(context.ownerUid, conexao.wabaId, templateMeta),
      connectionId: resolvido.connectionId,
      phoneNumberId: conexao.phoneNumberId || ""
    }, { merge: true });
    sincronizados += 1;
  }
  if (sincronizados > 0) await batch.commit();

  const conexaoRef = db.doc(`${COLLECTIONS.CONNECTIONS}/${resolvido.legacy ? context.ownerUid : resolvido.connectionId}`);
  await conexaoRef.set({
    lastTemplateSyncAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: context.authUid
  }, { merge: true });

  await writeAudit({
    ownerUid: context.ownerUid,
    authUid: context.authUid,
    module: "whatsapp",
    targetId: context.ownerUid,
    action: "whatsapp.templates_sincronizados",
    risk: "low",
    summary: `Sincronização manual de templates do WhatsApp (${sincronizados} template(s)).`,
    source: "function",
    correlationId: onboardingCore.createCorrelationId("watemplates"),
    origin: onboardingCore.sanitizeOrigin(request.rawRequest?.headers?.origin),
    code: "SYNCED"
  });

  return { ok: true, sincronizados };
});

module.exports = { whatsappSyncTemplates, derivarParameterSchema, normalizarTemplateMeta };
