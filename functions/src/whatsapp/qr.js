"use strict";

const crypto = require("crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
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

// Estado operacional persistido (revisão 2026-07-31 — compensação e
// concorrência do QR Code): a criação passa por um lock de idempotência
// (chave = hash de ownerUid+idempotencyKey do cliente) que registra o
// progresso preparing -> creating_remote -> saving_local -> active, ou
// failed/compensation_pending em caso de erro. Update/delete usam um lock
// curto de operação NO PRÓPRIO documento do QR (nunca em torno da chamada
// externa — só protege a leitura/escrita local), com expiração, e um
// checkpoint opcional de versão otimista via updatedAt.
const LOCK_TTL_MS = 2 * 60 * 1000;

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

function millisOf(value) {
  if (typeof value?.toMillis === "function") return value.toMillis();
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function newLockToken() {
  return crypto.randomBytes(12).toString("hex");
}

// Lock curto DENTRO de uma transação (nunca em torno de uma chamada
// externa) — só serializa quem pode ler/escrever o documento local a
// seguir. Se já houver um lock ativo e não expirado, rejeita
// explicitamente em vez de aceitar a segunda operação silenciosamente.
async function acquireQrDocLock(db, ref, ownerUid) {
  const token = newLockToken();
  const now = Date.now();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "QR Code não encontrado.");
    const data = snap.data() || {};
    if (data.ownerUid !== ownerUid) throw new HttpsError("not-found", "QR Code não encontrado.");
    const lock = data.operationLock;
    if (lock && millisOf(lock.expiresAt) > now) {
      throw new HttpsError("aborted", "Já existe uma operação em andamento para este QR Code. Tente novamente em instantes.");
    }
    tx.set(ref, { operationLock: { token, expiresAt: Timestamp.fromMillis(now + LOCK_TTL_MS) } }, { merge: true });
  });
  return token;
}

// Libera o lock só se ele ainda pertencer a este token — evita que uma
// operação atrasada (já expirada e reclamada por outra) sobrescreva o
// progresso de quem assumiu depois.
async function releaseQrDocLock(db, ref, token, extra = {}) {
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const current = snap.data() || {};
    if (current.operationLock?.token !== token) return;
    tx.set(ref, { ...extra, operationLock: FieldValue.delete(), updatedAt: extra.updatedAt || FieldValue.serverTimestamp() }, { merge: true });
  });
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
  const idempotencyKey = core.normalizeIdempotencyKey(request.data?.idempotencyKey);
  if (!idempotencyKey) throw new HttpsError("invalid-argument", "Não foi possível criar o QR Code com segurança. Atualize a página e tente novamente.");
  const { db, resolved, accessToken } = await resolvedConnection(context, request.data);
  const config = readWhatsappPublicConfig();

  // Identificador interno idempotente: uma tentativa repetida (duplo
  // clique, retry de rede) com a MESMA idempotencyKey nunca chama a Meta
  // duas vezes — ou reaproveita o resultado já ativo, ou é rejeitada
  // enquanto a primeira tentativa ainda está em andamento.
  const lockId = `create_${core.sha256(`${context.ownerUid}:${idempotencyKey}`).slice(0, 40)}`;
  const lockRef = db.doc(`${COLLECTIONS.QR_LOCKS}/${lockId}`);
  const now = Date.now();
  let reuseQrId = "";
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(lockRef);
    if (snap.exists) {
      const lock = snap.data() || {};
      if (lock.ownerUid !== context.ownerUid) throw new HttpsError("permission-denied", "Solicitação inválida.");
      if (lock.status === "active" && lock.qrId) { reuseQrId = lock.qrId; return; }
      if (millisOf(lock.expiresAt) > now) {
        throw new HttpsError("already-exists", "Uma criação de QR Code já está em andamento para esta solicitação.");
      }
      // Expirado sem concluir (preparing/creating_remote/saving_local) ou
      // marcado failed/compensation_pending — permite reclamar o lock e
      // tentar de novo com uma nova janela de expiração.
    }
    tx.set(lockRef, {
      ownerUid: context.ownerUid,
      idempotencyHash: core.sha256(idempotencyKey),
      status: "preparing",
      qrId: "",
      expiresAt: Timestamp.fromMillis(now + LOCK_TTL_MS),
      createdAt: snap.exists ? snap.data().createdAt || FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  });

  if (reuseQrId) {
    const existingSnap = await db.doc(`${COLLECTIONS.QR_CODES}/${reuseQrId}`).get();
    if (existingSnap.exists) {
      return { ok: true, qrCode: safeQrSummary(reuseQrId, existingSnap.data() || {}), reused: true };
    }
    // Referência ativa aponta pra um doc que não existe mais (ex.: já foi
    // excluído depois) — segue e cria um novo, tratando como se não
    // houvesse reaproveitamento.
  }

  await lockRef.set({ status: "creating_remote", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  const result = config.emulator
    ? emulatorQr({ message: input.message, format })
    : await metaClient.createMessageQrCode({ accessToken, phoneNumberId: resolved.connection.phoneNumberId, message: input.message, format });
  const code = safeCode(result?.code);
  if (!code) {
    await lockRef.set({ status: "failed", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    throw new HttpsError("unavailable", "A Meta não devolveu um QR Code válido. Tente novamente.");
  }
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

  await lockRef.set({ status: "saving_local", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  try {
    await db.doc(`${COLLECTIONS.QR_CODES}/${id}`).set(data, { merge: false });
  } catch (saveError) {
    // A Meta JÁ criou o QR remoto, mas a gravação local falhou — nunca
    // deixa o recurso remoto órfão silenciosamente. Tenta compensar
    // (excluir na Meta); se não conseguir confirmar a exclusão, marca
    // compensation_pending com os dados mínimos pra recuperação
    // administrativa, sem ocultar o problema.
    let compensated = false;
    if (!config.emulator) {
      try {
        await metaClient.deleteMessageQrCode({ accessToken, phoneNumberId: resolved.connection.phoneNumberId, code });
        compensated = true;
      } catch {
        compensated = false;
      }
    } else {
      compensated = true;
    }
    await lockRef.set({
      status: compensated ? "failed" : "compensation_pending",
      remoteCodePendingCleanup: compensated ? "" : code,
      connectionId: resolved.connectionId,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    logger.error(compensated ? "whatsapp.qr.create_local_save_failed_compensated" : "whatsapp.qr.create_orphan_remote_resource", core.redactForLog({
      ownerUid: context.ownerUid,
      connectionId: resolved.connectionId,
      lockId,
      compensated,
      note: compensated ? "" : "QR remoto criado na Meta mas gravacao local e compensacao falharam. Requer recuperacao administrativa (whatsapp_qr_locks)."
    }));
    throw new HttpsError("internal", "Não foi possível salvar o QR Code agora. Tente novamente.");
  }
  await lockRef.set({ status: "active", qrId: id, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

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
  if (!qrId) throw new HttpsError("invalid-argument", "QR Code inválido.");
  const db = getFirestore();
  const ref = db.doc(`${COLLECTIONS.QR_CODES}/${qrId}`);

  const preSnap = await ref.get();
  const preData = preSnap.exists ? preSnap.data() || {} : null;
  if (!preData || preData.ownerUid !== context.ownerUid) throw new HttpsError("not-found", "QR Code não encontrado.");

  // Versão otimista: se o cliente informar o updatedAt que leu, uma
  // edição baseada em dado desatualizado é rejeitada explicitamente em
  // vez de sobrescrever silenciosamente uma alteração mais recente.
  const expectedUpdatedAtMs = Number(request.data?.expectedUpdatedAtMs);
  if (Number.isFinite(expectedUpdatedAtMs) && expectedUpdatedAtMs > 0) {
    const currentUpdatedAtMs = millisOf(preData.updatedAt);
    if (currentUpdatedAtMs && currentUpdatedAtMs !== expectedUpdatedAtMs) {
      throw new HttpsError("failed-precondition", "Este QR Code foi alterado em outra sessão. Atualize a página e tente novamente.");
    }
  }

  const lockToken = await acquireQrDocLock(db, ref, context.ownerUid);
  let released = false;
  try {
    const current = (await ref.get()).data() || {};
    const code = safeCode(current.code);
    const { resolved, accessToken } = await resolvedConnection(context, current);
    const result = readWhatsappPublicConfig().emulator
      ? emulatorQr({ code, message: input.message, format: current.format })
      : await metaClient.updateMessageQrCode({ accessToken, phoneNumberId: resolved.connection.phoneNumberId, code, message: input.message });
    const patch = { label: input.label, message: input.message, deepLinkUrl: safeHttpsUrl(result.deep_link_url) || current.deepLinkUrl || "", qrImageUrl: safeHttpsUrl(result.qr_image_url) || current.qrImageUrl || "", updatedByUid: context.authUid, updatedAt: FieldValue.serverTimestamp() };
    await releaseQrDocLock(db, ref, lockToken, patch);
    released = true;
    const correlationId = core.createCorrelationId("waqrupdate");
    const origin = core.sanitizeOrigin(request.rawRequest?.headers?.origin);
    await writeAudit({ ownerUid: context.ownerUid, authUid: context.authUid, module: "whatsapp", targetId: qrId, action: "whatsapp.qr_atualizado", risk: "low", summary: `QR Code de atendimento "${input.label}" atualizado.`, source: "function", correlationId, origin, code: "UPDATED" });
    logger.info("whatsapp.qr.updated", { correlationId, ownerUid: context.ownerUid, connectionId: resolved.connectionId, qrId });
    return { ok: true, qrCode: safeQrSummary(qrId, { ...current, ...patch }) };
  } finally {
    if (!released) await releaseQrDocLock(db, ref, lockToken);
  }
});

const whatsappDeleteQrCode = onCall({ region: REGION, enforceAppCheck: shouldEnforceAppCheck() }, async (request) => {
  const context = await resolveCallerContext(request);
  requireQrEnabled(context);
  await assertRateLimit({ scope: "whatsappDeleteQrCode", identifier: identificadorRateLimit("owner", context.ownerUid), max: RATE_LIMITS.QR_CODE_WRITE_PER_MIN });
  const qrId = String(request.data?.qrId || "").trim().slice(0, 80);
  if (!qrId) throw new HttpsError("invalid-argument", "QR Code inválido.");
  const db = getFirestore();
  const ref = db.doc(`${COLLECTIONS.QR_CODES}/${qrId}`);

  const preSnap = await ref.get();
  if (!preSnap.exists) return { ok: true, qrId, alreadyDeleted: true }; // idempotente: já não existe
  if (preSnap.data()?.ownerUid !== context.ownerUid) throw new HttpsError("not-found", "QR Code não encontrado.");

  const lockToken = await acquireQrDocLock(db, ref, context.ownerUid);
  let deleted = false;
  try {
    const currentSnap = await ref.get();
    if (!currentSnap.exists) { deleted = true; return { ok: true, qrId, alreadyDeleted: true }; }
    const current = currentSnap.data() || {};
    const { resolved, accessToken } = await resolvedConnection(context, current);
    if (!readWhatsappPublicConfig().emulator) {
      await metaClient.deleteMessageQrCode({ accessToken, phoneNumberId: resolved.connection.phoneNumberId, code: safeCode(current.code) });
    }
    await ref.delete();
    deleted = true;
    const correlationId = core.createCorrelationId("waqrdelete");
    const origin = core.sanitizeOrigin(request.rawRequest?.headers?.origin);
    await writeAudit({ ownerUid: context.ownerUid, authUid: context.authUid, module: "whatsapp", targetId: qrId, action: "whatsapp.qr_excluido", risk: "medium", summary: `QR Code de atendimento "${String(current.label || "").slice(0, 60)}" excluído.`, source: "function", correlationId, origin, code: "DELETED" });
    logger.info("whatsapp.qr.deleted", { correlationId, ownerUid: context.ownerUid, connectionId: resolved.connectionId, qrId });
    return { ok: true, qrId };
  } finally {
    if (!deleted) await releaseQrDocLock(db, ref, lockToken);
  }
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
