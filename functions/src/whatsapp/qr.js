"use strict";

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { resolveCallerContext } = require("../shared/context");
const { assertRateLimit } = require("../shared/rateLimit");
const { writeAudit } = require("../audit");
const { COLLECTIONS, RATE_LIMITS, REGION } = require("./constants");
const { readWhatsappPublicConfig, shouldEnforceAppCheck } = require("./config");
const core = require("./onboarding-core");
const resolver = require("./resolver");
const { criarMetaClient } = require("./metaClient");
const { podeGerenciarConexao } = require("./send");
const { identificadorRateLimit } = require("./validators");

const metaClient = criarMetaClient();

function requireQrEnabled(context) {
  if (!podeGerenciarConexao(context)) throw new HttpsError("permission-denied", "Permissão insuficiente para gerenciar QR Codes.");
  if (!readWhatsappPublicConfig().flags.qrCodes) throw new HttpsError("failed-precondition", "QR Codes de atendimento ainda não estão disponíveis.");
}

function safeCode(value) {
  const code = String(value || "").trim();
  return /^[A-Za-z0-9_-]{4,80}$/.test(code) ? code : "";
}

function safeHttpsUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    return parsed.protocol === "https:" && parsed.href.length <= 2048 ? parsed.href : "";
  } catch {
    return "";
  }
}

function safeQrSummary(id, data) {
  const updatedAt = typeof data.updatedAt?.toMillis === "function"
    ? data.updatedAt.toMillis()
    : (Number.isFinite(Number(data.updatedAt)) ? Number(data.updatedAt) : null);
  return {
    id,
    connectionId: String(data.connectionId || ""),
    legacy: Boolean(data.legacy),
    label: String(data.label || "").slice(0, 60),
    message: String(data.message || "").slice(0, 320),
    code: safeCode(data.code),
    deepLinkUrl: safeHttpsUrl(data.deepLinkUrl),
    qrImageUrl: safeHttpsUrl(data.qrImageUrl),
    format: data.format === "PNG" ? "PNG" : "SVG",
    updatedAt
  };
}

async function resolvedConnection(context, data) {
  const db = getFirestore();
  const connectionId = String(data?.connectionId || "").trim().slice(0, 120);
  const legacy = Boolean(data?.legacy);
  const resolved = await resolver.resolverConexao(db, { ownerUid: context.ownerUid, connectionId, legacy });
  if (resolved.connectionIdInvalido || !resolved.connection || resolved.connection.status !== "connected") {
    throw new HttpsError("failed-precondition", "Escolha uma conexão ativa desta loja.");
  }
  const accessToken = readWhatsappPublicConfig().emulator ? "emulator-access-token" : await resolver.resolverToken(resolved);
  return { db, resolved, accessToken };
}

function emulatorQr({ code, message, format }) {
  const safe = code || `EMU${Date.now().toString(36).toUpperCase()}`;
  return {
    code: safe,
    prefilled_message: message,
    deep_link_url: `https://wa.me/message/${safe}`,
    qr_image_url: `https://example.invalid/whatsapp-qr/${safe}.${format === "PNG" ? "png" : "svg"}`
  };
}

const whatsappListQrCodes = onCall({ region: REGION, enforceAppCheck: shouldEnforceAppCheck() }, async (request) => {
  const context = await resolveCallerContext(request);
  requireQrEnabled(context);
  await assertRateLimit({ scope: "whatsappListQrCodes", identifier: identificadorRateLimit("owner", context.ownerUid), max: RATE_LIMITS.QR_CODE_READ_PER_MIN });
  const snap = await getFirestore().collection(COLLECTIONS.QR_CODES).where("ownerUid", "==", context.ownerUid).get();
  return { ok: true, qrCodes: snap.docs.map((doc) => safeQrSummary(doc.id, doc.data() || {})).sort((a, b) => a.label.localeCompare(b.label)) };
});

const whatsappCreateQrCode = onCall({ region: REGION, enforceAppCheck: shouldEnforceAppCheck() }, async (request) => {
  const context = await resolveCallerContext(request);
  requireQrEnabled(context);
  await assertRateLimit({ scope: "whatsappCreateQrCode", identifier: identificadorRateLimit("owner", context.ownerUid), max: RATE_LIMITS.QR_CODE_WRITE_PER_MIN });
  let input;
  try { input = core.sanitizeQrInput(request.data); } catch { throw new HttpsError("invalid-argument", "Informe uma finalidade e uma mensagem de até 320 caracteres."); }
  const format = request.data?.format === "PNG" ? "PNG" : "SVG";
  const { db, resolved, accessToken } = await resolvedConnection(context, request.data);
  const config = readWhatsappPublicConfig();
  const result = config.emulator
    ? emulatorQr({ message: input.message, format })
    : await metaClient.createMessageQrCode({ accessToken, phoneNumberId: resolved.connection.phoneNumberId, message: input.message, format });
  const code = safeCode(result?.code);
  if (!code) throw new HttpsError("unavailable", "A Meta não devolveu um QR Code válido. Tente novamente.");
  const id = `waqr_${core.sha256(`${context.ownerUid}:${code}`).slice(0, 32)}`;
  const data = {
    ownerUid: context.ownerUid,
    tenantId: context.ownerUid,
    connectionId: resolved.connectionId,
    legacy: resolved.legacy,
    label: input.label,
    message: input.message,
    code,
    deepLinkUrl: safeHttpsUrl(result.deep_link_url),
    qrImageUrl: safeHttpsUrl(result.qr_image_url),
    format,
    createdByUid: context.authUid,
    updatedByUid: context.authUid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  };
  await db.doc(`${COLLECTIONS.QR_CODES}/${id}`).set(data, { merge: false });
  const correlationId = core.createCorrelationId("waqrcreate");
  const origin = core.sanitizeOrigin(request.rawRequest?.headers?.origin);
  await writeAudit({ ownerUid: context.ownerUid, authUid: context.authUid, module: "whatsapp", targetId: id, action: "whatsapp.qr_criado", risk: "low", summary: `QR Code de atendimento "${input.label}" criado.`, source: "function", correlationId, origin, code: "CREATED" });
  logger.info("whatsapp.qr.created", { correlationId, ownerUid: context.ownerUid, connectionId: resolved.connectionId, qrId: id });
  return { ok: true, qrCode: safeQrSummary(id, data) };
});

const whatsappUpdateQrCode = onCall({ region: REGION, enforceAppCheck: shouldEnforceAppCheck() }, async (request) => {
  const context = await resolveCallerContext(request);
  requireQrEnabled(context);
  await assertRateLimit({ scope: "whatsappUpdateQrCode", identifier: identificadorRateLimit("owner", context.ownerUid), max: RATE_LIMITS.QR_CODE_WRITE_PER_MIN });
  let input;
  try { input = core.sanitizeQrInput(request.data); } catch { throw new HttpsError("invalid-argument", "Informe uma finalidade e uma mensagem de até 320 caracteres."); }
  const qrId = String(request.data?.qrId || "").trim().slice(0, 80);
  const db = getFirestore();
  const ref = db.doc(`${COLLECTIONS.QR_CODES}/${qrId}`);
  const snap = await ref.get();
  const current = snap.exists ? snap.data() || {} : null;
  if (!current || current.ownerUid !== context.ownerUid) throw new HttpsError("not-found", "QR Code não encontrado.");
  const code = safeCode(current.code);
  const { resolved, accessToken } = await resolvedConnection(context, current);
  const result = readWhatsappPublicConfig().emulator
    ? emulatorQr({ code, message: input.message, format: current.format })
    : await metaClient.updateMessageQrCode({ accessToken, phoneNumberId: resolved.connection.phoneNumberId, code, message: input.message });
  const patch = { label: input.label, message: input.message, deepLinkUrl: safeHttpsUrl(result.deep_link_url) || current.deepLinkUrl || "", qrImageUrl: safeHttpsUrl(result.qr_image_url) || current.qrImageUrl || "", updatedByUid: context.authUid, updatedAt: FieldValue.serverTimestamp() };
  await ref.set(patch, { merge: true });
  const correlationId = core.createCorrelationId("waqrupdate");
  const origin = core.sanitizeOrigin(request.rawRequest?.headers?.origin);
  await writeAudit({ ownerUid: context.ownerUid, authUid: context.authUid, module: "whatsapp", targetId: qrId, action: "whatsapp.qr_atualizado", risk: "low", summary: `QR Code de atendimento "${input.label}" atualizado.`, source: "function", correlationId, origin, code: "UPDATED" });
  logger.info("whatsapp.qr.updated", { correlationId, ownerUid: context.ownerUid, connectionId: resolved.connectionId, qrId });
  return { ok: true, qrCode: safeQrSummary(qrId, { ...current, ...patch }) };
});

const whatsappDeleteQrCode = onCall({ region: REGION, enforceAppCheck: shouldEnforceAppCheck() }, async (request) => {
  const context = await resolveCallerContext(request);
  requireQrEnabled(context);
  await assertRateLimit({ scope: "whatsappDeleteQrCode", identifier: identificadorRateLimit("owner", context.ownerUid), max: RATE_LIMITS.QR_CODE_WRITE_PER_MIN });
  const qrId = String(request.data?.qrId || "").trim().slice(0, 80);
  const db = getFirestore();
  const ref = db.doc(`${COLLECTIONS.QR_CODES}/${qrId}`);
  const snap = await ref.get();
  const current = snap.exists ? snap.data() || {} : null;
  if (!current || current.ownerUid !== context.ownerUid) throw new HttpsError("not-found", "QR Code não encontrado.");
  const { resolved, accessToken } = await resolvedConnection(context, current);
  if (!readWhatsappPublicConfig().emulator) await metaClient.deleteMessageQrCode({ accessToken, phoneNumberId: resolved.connection.phoneNumberId, code: safeCode(current.code) });
  await ref.delete();
  const correlationId = core.createCorrelationId("waqrdelete");
  const origin = core.sanitizeOrigin(request.rawRequest?.headers?.origin);
  await writeAudit({ ownerUid: context.ownerUid, authUid: context.authUid, module: "whatsapp", targetId: qrId, action: "whatsapp.qr_excluido", risk: "medium", summary: `QR Code de atendimento "${String(current.label || "").slice(0, 60)}" excluído.`, source: "function", correlationId, origin, code: "DELETED" });
  logger.info("whatsapp.qr.deleted", { correlationId, ownerUid: context.ownerUid, connectionId: resolved.connectionId, qrId });
  return { ok: true, qrId };
});

module.exports = {
  whatsappListQrCodes,
  whatsappCreateQrCode,
  whatsappUpdateQrCode,
  whatsappDeleteQrCode,
  safeCode,
  safeHttpsUrl,
  safeQrSummary
};
