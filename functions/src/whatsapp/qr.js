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
// curto de operação NO PRÓPRIO documento do QR, mantido durante a chamada
// externa e sempre revalidado por token antes da finalização local, com um
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

// A aquisição valida existência, tenant, versão otimista e lock anterior na
// MESMA transação. A chamada externa acontece somente depois do commit.
async function acquireQrDocLock(db, ref, { ownerUid, expectedUpdatedAtMs, operationType, allowMissing = false }) {
  const token = newLockToken();
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      if (allowMissing) return { alreadyDeleted: true, token: "", current: null, baseUpdatedAtMs: 0 };
      throw new HttpsError("not-found", "QR Code não encontrado.");
    }
    const data = snap.data() || {};
    if (data.ownerUid !== ownerUid) throw new HttpsError("not-found", "QR Code não encontrado.");
    const baseUpdatedAtMs = millisOf(data.updatedAt);
    if (Number.isFinite(expectedUpdatedAtMs) && expectedUpdatedAtMs > 0 && baseUpdatedAtMs !== expectedUpdatedAtMs) {
      throw new HttpsError("failed-precondition", "Este QR Code foi alterado em outra sessão. Atualize a página e tente novamente.");
    }
    const lock = data.operationLock;
    if (lock && millisOf(lock.expiresAt) > now) {
      throw new HttpsError("aborted", "Já existe uma operação em andamento para este QR Code. Tente novamente em instantes.");
    }
    tx.set(ref, {
      operationLock: {
        token,
        operationType,
        startedAt: Timestamp.fromMillis(now),
        expiresAt: Timestamp.fromMillis(now + LOCK_TTL_MS),
        baseUpdatedAtMs
      }
    }, { merge: true });
    return { alreadyDeleted: false, token, current: data, baseUpdatedAtMs };
  });
}

async function finalizeQrUpdate(db, ref, { ownerUid, token, patch }) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { applied: false, reason: "not_found" };
    const current = snap.data() || {};
    if (current.ownerUid !== ownerUid) return { applied: false, reason: "owner_mismatch" };
    if (current.operationLock?.token !== token) return { applied: false, reason: "lock_lost" };
    tx.set(ref, { ...patch, operationLock: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { applied: true, reason: "updated" };
  });
}

async function finalizeQrDelete(db, ref, { ownerUid, token }) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { applied: false, reason: "not_found" };
    const current = snap.data() || {};
    if (current.ownerUid !== ownerUid) return { applied: false, reason: "owner_mismatch" };
    if (current.operationLock?.token !== token) return { applied: false, reason: "lock_lost" };
    tx.delete(ref);
    return { applied: true, reason: "deleted" };
  });
}

// Libera somente o próprio token e sempre informa ao chamador se aplicou.
async function releaseQrDocLock(db, ref, token) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { applied: false, reason: "not_found" };
    const current = snap.data() || {};
    if (current.operationLock?.token !== token) return { applied: false, reason: "lock_lost" };
    tx.set(ref, { operationLock: FieldValue.delete() }, { merge: true });
    return { applied: true, reason: "released" };
  });
}

async function recordQrReconciliation(db, {
  ownerUid, connectionId, qrId, operationType, status = "reconciliation_pending",
  remoteCodePendingCleanup = "", correlationId, reason
}) {
  const safeReason = core.sanitizeSupportCode(reason) || "LOCAL_FINALIZATION_FAILED";
  const id = `reconcile_${core.sha256(`${ownerUid}:${qrId}:${operationType}:${correlationId}`).slice(0, 40)}`;
  await db.doc(`${COLLECTIONS.QR_LOCKS}/${id}`).set({
    ownerUid,
    connectionId: String(connectionId || "").slice(0, 120),
    qrId: String(qrId || "").slice(0, 80),
    operationType,
    status,
    remoteCodePendingCleanup: safeCode(remoteCodePendingCleanup),
    correlationId: core.sanitizeSupportCode(correlationId),
    reason: safeReason,
    recoveryRequired: status !== "compensated",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return id;
}

async function compensateRemoteQr({ emulator, deleteRemote }) {
  if (emulator) return { compensated: true, status: "failed" };
  try {
    await deleteRemote();
    return { compensated: true, status: "failed" };
  } catch {
    return { compensated: false, status: "compensation_pending" };
  }
}

async function acquireQrCreateLock(db, lockRef, { ownerUid, connectionId, idempotencyKey, correlationId }) {
  const token = newLockToken();
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(lockRef);
    const lock = snap.exists ? snap.data() || {} : {};
    if (snap.exists && lock.ownerUid !== ownerUid) throw new HttpsError("permission-denied", "Solicitação inválida.");
    if (lock.status === "active" && lock.qrId) return { reused: true, qrId: lock.qrId, token: "" };
    if (lock.status === "active") {
      throw new HttpsError("failed-precondition", "O resultado ativo desta criação requer reconciliação.");
    }
    if (["creating_remote", "saving_local", "compensation_pending", "reconciliation_pending"].includes(lock.status)) {
      throw new HttpsError("failed-precondition", "Esta criação de QR Code requer reconciliação antes de ser repetida.");
    }
    if (millisOf(lock.expiresAt) > now) {
      throw new HttpsError("already-exists", "Uma criação de QR Code já está em andamento para esta solicitação.");
    }
    tx.set(lockRef, {
      ownerUid,
      connectionId,
      idempotencyHash: core.sha256(idempotencyKey),
      token,
      operationType: "create",
      status: "preparing",
      qrId: "",
      correlationId,
      recoveryRequired: false,
      remoteCodePendingCleanup: "",
      startedAt: Timestamp.fromMillis(now),
      expiresAt: Timestamp.fromMillis(now + LOCK_TTL_MS),
      createdAt: snap.exists ? lock.createdAt || FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    return { reused: false, qrId: "", token };
  });
}

async function transitionQrCreateLock(db, lockRef, { ownerUid, token, status, patch = {} }) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(lockRef);
    if (!snap.exists) return { applied: false, reason: "not_found" };
    const current = snap.data() || {};
    if (current.ownerUid !== ownerUid) return { applied: false, reason: "owner_mismatch" };
    if (current.token !== token) return { applied: false, reason: "lock_lost" };
    tx.set(lockRef, { ...patch, status, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { applied: true, reason: status };
  });
}

async function finalizeQrCreation(db, { lockRef, qrRef, ownerUid, token, qrId, data }) {
  return db.runTransaction(async (tx) => {
    const [lockSnap, qrSnap] = await Promise.all([tx.get(lockRef), tx.get(qrRef)]);
    if (!lockSnap.exists) return { applied: false, reason: "lock_not_found" };
    const lock = lockSnap.data() || {};
    if (lock.ownerUid !== ownerUid) return { applied: false, reason: "owner_mismatch" };
    if (lock.token !== token) return { applied: false, reason: "lock_lost" };
    if (qrSnap.exists) return { applied: false, reason: "qr_already_exists" };
    tx.set(qrRef, data, { merge: false });
    tx.set(lockRef, {
      status: "active",
      qrId,
      token: "",
      recoveryRequired: false,
      remoteCodePendingCleanup: "",
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    return { applied: true, reason: "created" };
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

  // Identificador interno idempotente: uma tentativa repetida com a MESMA
  // chave só reaproveita um resultado consolidado. Estados remotos ambíguos
  // nunca são reclamados automaticamente.
  const lockId = `create_${core.sha256(`${context.ownerUid}:${idempotencyKey}`).slice(0, 40)}`;
  const lockRef = db.doc(`${COLLECTIONS.QR_LOCKS}/${lockId}`);
  const correlationId = core.createCorrelationId("waqrcreate");
  const acquisition = await acquireQrCreateLock(db, lockRef, {
    ownerUid: context.ownerUid,
    connectionId: resolved.connectionId,
    idempotencyKey,
    correlationId
  });

  if (acquisition.reused) {
    const existingSnap = await db.doc(`${COLLECTIONS.QR_CODES}/${acquisition.qrId}`).get();
    const existing = existingSnap.exists ? existingSnap.data() || {} : null;
    if (existing && existing.ownerUid === context.ownerUid) {
      return { ok: true, qrCode: safeQrSummary(acquisition.qrId, existing), reused: true };
    }
    await recordQrReconciliation(db, {
      ownerUid: context.ownerUid,
      connectionId: resolved.connectionId,
      qrId: acquisition.qrId,
      operationType: "create",
      correlationId,
      reason: "ACTIVE_QR_DOCUMENT_MISSING"
    });
    throw new HttpsError("failed-precondition", "O QR Code requer reconciliação antes de ser criado novamente.");
  }

  const createToken = acquisition.token;
  const remoteStart = await transitionQrCreateLock(db, lockRef, {
    ownerUid: context.ownerUid,
    token: createToken,
    status: "creating_remote"
  });
  if (!remoteStart.applied) throw new HttpsError("aborted", "A criação perdeu o lock antes de chamar a Meta.");

  let result;
  try {
    result = config.emulator
      ? emulatorQr({ message: input.message, format })
      : await metaClient.createMessageQrCode({ accessToken, phoneNumberId: resolved.connection.phoneNumberId, message: input.message, format });
  } catch (error) {
    await Promise.allSettled([
      transitionQrCreateLock(db, lockRef, {
        ownerUid: context.ownerUid,
        token: createToken,
        status: "compensation_pending",
        patch: { recoveryRequired: true, failureReason: "REMOTE_OUTCOME_UNKNOWN" }
      }),
      recordQrReconciliation(db, {
        ownerUid: context.ownerUid,
        connectionId: resolved.connectionId,
        qrId: "",
        operationType: "create",
        status: "compensation_pending",
        correlationId,
        reason: "REMOTE_OUTCOME_UNKNOWN"
      })
    ]);
    logger.error("whatsapp.qr.create_remote_outcome_unknown", {
      correlationId,
      ownerUid: context.ownerUid,
      connectionId: resolved.connectionId,
      code: core.sanitizeSupportCode(error?.code)
    });
    throw new HttpsError("unavailable", "A Meta não confirmou a criação do QR Code. A tentativa foi preservada para análise segura.");
  }
  const code = safeCode(result?.code);
  if (!code) {
    await Promise.allSettled([
      transitionQrCreateLock(db, lockRef, {
        ownerUid: context.ownerUid,
        token: createToken,
        status: "compensation_pending",
        patch: { recoveryRequired: true, failureReason: "REMOTE_CODE_MISSING" }
      }),
      recordQrReconciliation(db, {
        ownerUid: context.ownerUid,
        connectionId: resolved.connectionId,
        qrId: "",
        operationType: "create",
        status: "compensation_pending",
        correlationId,
        reason: "REMOTE_CODE_MISSING"
      })
    ]);
    throw new HttpsError("unavailable", "A Meta não devolveu um QR Code válido. A tentativa requer análise segura.");
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

  const savingLocal = await transitionQrCreateLock(db, lockRef, {
    ownerUid: context.ownerUid,
    token: createToken,
    status: "saving_local",
    patch: { qrId: id, remoteCodePendingCleanup: code, recoveryRequired: true }
  });
  let finalization = { applied: false, reason: savingLocal.reason };
  try {
    if (savingLocal.applied) {
      finalization = await finalizeQrCreation(db, {
        lockRef,
        qrRef: db.doc(`${COLLECTIONS.QR_CODES}/${id}`),
        ownerUid: context.ownerUid,
        token: createToken,
        qrId: id,
        data
      });
    }
  } catch {
    finalization = { applied: false, reason: "transaction_failed" };
  }

  if (!finalization.applied) {
    const compensation = await compensateRemoteQr({
      emulator: config.emulator,
      deleteRemote: () => metaClient.deleteMessageQrCode({
        accessToken,
        phoneNumberId: resolved.connection.phoneNumberId,
        code
      })
    });
    const lockOutcome = await transitionQrCreateLock(db, lockRef, {
      ownerUid: context.ownerUid,
      token: createToken,
      status: compensation.status,
      patch: {
        recoveryRequired: !compensation.compensated,
        remoteCodePendingCleanup: compensation.compensated ? "" : code,
        failureReason: core.sanitizeSupportCode(finalization.reason)
      }
    }).catch(() => ({ applied: false, reason: "lock_write_failed" }));
    await recordQrReconciliation(db, {
      ownerUid: context.ownerUid,
      connectionId: resolved.connectionId,
      qrId: id,
      operationType: "create",
      status: compensation.compensated ? "compensated" : "compensation_pending",
      remoteCodePendingCleanup: compensation.compensated ? "" : code,
      correlationId,
      reason: lockOutcome.applied ? finalization.reason : `${finalization.reason}_LOCK_LOST`
    }).catch(() => "");
    logger.error(compensation.compensated ? "whatsapp.qr.create_local_save_failed_compensated" : "whatsapp.qr.create_orphan_remote_resource", {
      correlationId,
      ownerUid: context.ownerUid,
      connectionId: resolved.connectionId,
      qrId: id,
      finalizationReason: core.sanitizeSupportCode(finalization.reason),
      compensationStatus: compensation.status
    });
    throw new HttpsError(finalization.reason === "lock_lost" ? "aborted" : "internal", "A criação remota não pôde ser consolidada localmente. A tentativa foi preservada para reconciliação.");
  }

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
  const expectedUpdatedAtMs = Number(request.data?.expectedUpdatedAtMs);
  const lock = await acquireQrDocLock(db, ref, {
    ownerUid: context.ownerUid,
    expectedUpdatedAtMs,
    operationType: "update"
  });
  const lockToken = lock.token;
  const current = lock.current;
  const correlationId = core.createCorrelationId("waqrupdate");
  let finalized = false;
  try {
    const code = safeCode(current.code);
    const { resolved, accessToken } = await resolvedConnection(context, current);
    let result;
    try {
      result = readWhatsappPublicConfig().emulator
        ? emulatorQr({ code, message: input.message, format: current.format })
        : await metaClient.updateMessageQrCode({ accessToken, phoneNumberId: resolved.connection.phoneNumberId, code, message: input.message });
    } catch (error) {
      await recordQrReconciliation(db, {
        ownerUid: context.ownerUid,
        connectionId: resolved.connectionId,
        qrId,
        operationType: "update",
        correlationId,
        reason: "REMOTE_OUTCOME_UNKNOWN"
      }).catch(() => "");
      logger.error("whatsapp.qr.update_remote_outcome_unknown", {
        correlationId,
        ownerUid: context.ownerUid,
        connectionId: resolved.connectionId,
        qrId,
        code: core.sanitizeSupportCode(error?.code)
      });
      throw new HttpsError("unavailable", "A Meta não confirmou a atualização. O estado foi preservado para reconciliação.");
    }
    const patch = {
      label: input.label,
      message: input.message,
      deepLinkUrl: safeHttpsUrl(result.deep_link_url) || current.deepLinkUrl || "",
      qrImageUrl: safeHttpsUrl(result.qr_image_url) || current.qrImageUrl || "",
      updatedByUid: context.authUid
    };
    let finish;
    try {
      finish = await finalizeQrUpdate(db, ref, { ownerUid: context.ownerUid, token: lockToken, patch });
    } catch {
      finish = { applied: false, reason: "transaction_failed" };
    }
    if (!finish.applied) {
      await recordQrReconciliation(db, {
        ownerUid: context.ownerUid,
        connectionId: resolved.connectionId,
        qrId,
        operationType: "update",
        correlationId,
        reason: finish.reason
      }).catch(() => "");
      throw new HttpsError("aborted", "A atualização remota terminou, mas o lock local foi perdido. A operação requer reconciliação.");
    }
    finalized = true;
    const origin = core.sanitizeOrigin(request.rawRequest?.headers?.origin);
    await writeAudit({ ownerUid: context.ownerUid, authUid: context.authUid, module: "whatsapp", targetId: qrId, action: "whatsapp.qr_atualizado", risk: "low", summary: `QR Code de atendimento "${input.label}" atualizado.`, source: "function", correlationId, origin, code: "UPDATED" });
    logger.info("whatsapp.qr.updated", { correlationId, ownerUid: context.ownerUid, connectionId: resolved.connectionId, qrId });
    const finalSnap = await ref.get();
    return { ok: true, qrCode: safeQrSummary(qrId, finalSnap.data() || { ...current, ...patch }) };
  } finally {
    if (!finalized) {
      const released = await releaseQrDocLock(db, ref, lockToken).catch(() => ({ applied: false, reason: "release_failed" }));
      if (!released.applied) {
        logger.warn("whatsapp.qr.lock_release_not_applied", {
          correlationId,
          ownerUid: context.ownerUid,
          qrId,
          operationType: "update",
          reason: core.sanitizeSupportCode(released.reason)
        });
      }
    }
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
  const lock = await acquireQrDocLock(db, ref, {
    ownerUid: context.ownerUid,
    operationType: "delete",
    allowMissing: true
  });
  if (lock.alreadyDeleted) return { ok: true, qrId, alreadyDeleted: true };

  const lockToken = lock.token;
  const current = lock.current;
  const correlationId = core.createCorrelationId("waqrdelete");
  let finalized = false;
  try {
    const { resolved, accessToken } = await resolvedConnection(context, current);
    if (!readWhatsappPublicConfig().emulator) {
      try {
        await metaClient.deleteMessageQrCode({ accessToken, phoneNumberId: resolved.connection.phoneNumberId, code: safeCode(current.code) });
      } catch (error) {
        await recordQrReconciliation(db, {
          ownerUid: context.ownerUid,
          connectionId: resolved.connectionId,
          qrId,
          operationType: "delete",
          correlationId,
          reason: "REMOTE_OUTCOME_UNKNOWN"
        }).catch(() => "");
        logger.error("whatsapp.qr.delete_remote_outcome_unknown", {
          correlationId,
          ownerUid: context.ownerUid,
          connectionId: resolved.connectionId,
          qrId,
          code: core.sanitizeSupportCode(error?.code)
        });
        throw new HttpsError("unavailable", "A Meta não confirmou a exclusão. O estado foi preservado para reconciliação.");
      }
    }
    let finish;
    try {
      finish = await finalizeQrDelete(db, ref, { ownerUid: context.ownerUid, token: lockToken });
    } catch {
      finish = { applied: false, reason: "transaction_failed" };
    }
    if (!finish.applied) {
      await recordQrReconciliation(db, {
        ownerUid: context.ownerUid,
        connectionId: resolved.connectionId,
        qrId,
        operationType: "delete",
        correlationId,
        reason: finish.reason
      }).catch(() => "");
      throw new HttpsError("aborted", "A exclusão remota terminou, mas o lock local foi perdido. A operação requer reconciliação.");
    }
    finalized = true;
    const origin = core.sanitizeOrigin(request.rawRequest?.headers?.origin);
    await writeAudit({ ownerUid: context.ownerUid, authUid: context.authUid, module: "whatsapp", targetId: qrId, action: "whatsapp.qr_excluido", risk: "medium", summary: `QR Code de atendimento "${String(current.label || "").slice(0, 60)}" excluído.`, source: "function", correlationId, origin, code: "DELETED" });
    logger.info("whatsapp.qr.deleted", { correlationId, ownerUid: context.ownerUid, connectionId: resolved.connectionId, qrId });
    return { ok: true, qrId };
  } finally {
    if (!finalized) {
      const released = await releaseQrDocLock(db, ref, lockToken).catch(() => ({ applied: false, reason: "release_failed" }));
      if (!released.applied) {
        logger.warn("whatsapp.qr.lock_release_not_applied", {
          correlationId,
          ownerUid: context.ownerUid,
          qrId,
          operationType: "delete",
          reason: core.sanitizeSupportCode(released.reason)
        });
      }
    }
  }
});

module.exports = {
  whatsappListQrCodes,
  whatsappCreateQrCode,
  whatsappUpdateQrCode,
  whatsappDeleteQrCode,
  safeCode,
  safeHttpsUrl,
  safeQrSummary,
  __test: Object.freeze({
    LOCK_TTL_MS,
    acquireQrCreateLock,
    acquireQrDocLock,
    compensateRemoteQr,
    finalizeQrCreation,
    finalizeQrDelete,
    finalizeQrUpdate,
    recordQrReconciliation,
    releaseQrDocLock,
    transitionQrCreateLock
  })
};
