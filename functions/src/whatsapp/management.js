"use strict";

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { resolveCallerContext } = require("../shared/context");
const { assertRateLimit } = require("../shared/rateLimit");
const { writeAudit } = require("../audit");
const { COLLECTIONS, CONNECTION_VERSION_MULTI, RATE_LIMITS, REGION } = require("./constants");
const { readWhatsappPublicConfig, shouldEnforceAppCheck } = require("./config");
const core = require("./onboarding-core");
const { podeGerenciarConexao } = require("./send");
const { identificadorRateLimit } = require("./validators");
const { desabilitarVersaoRecurso, limparCacheTokenPorResource } = require("./secrets");

function requireManage(context) {
  if (!podeGerenciarConexao(context)) throw new HttpsError("permission-denied", "Permissão insuficiente para gerenciar o WhatsApp.");
}

function safeConnectionId(value) {
  const id = String(value || "").trim();
  return /^[A-Za-z0-9_-]{8,120}$/.test(id) ? id : "";
}

const whatsappRenameConnection = onCall({ region: REGION, enforceAppCheck: shouldEnforceAppCheck() }, async (request) => {
  const context = await resolveCallerContext(request);
  requireManage(context);
  await assertRateLimit({ scope: "whatsappRenameConnection", identifier: identificadorRateLimit("owner", context.ownerUid), max: RATE_LIMITS.CONNECTION_MANAGEMENT_PER_MIN });
  const connectionId = safeConnectionId(request.data?.connectionId);
  const label = core.sanitizeLabel(request.data?.label);
  if (!connectionId || !label) throw new HttpsError("invalid-argument", "Use um nome entre 2 e 60 caracteres.");
  const db = getFirestore();
  const ref = db.doc(`${COLLECTIONS.CONNECTIONS}/${connectionId}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() || {} : null;
    if (!data || data.ownerUid !== context.ownerUid || data.connectionVersion !== CONNECTION_VERSION_MULTI) throw new HttpsError("not-found", "Conexão não encontrada para esta loja.");
    tx.set(ref, { label, updatedByUid: context.authUid, labelUpdatedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  const correlationId = core.createCorrelationId("warename");
  const origin = core.sanitizeOrigin(request.rawRequest?.headers?.origin);
  await writeAudit({ ownerUid: context.ownerUid, authUid: context.authUid, module: "whatsapp", targetId: connectionId, action: "whatsapp.conexao_renomeada", risk: "low", summary: `Conexão do WhatsApp renomeada para "${label}".`, source: "function", correlationId, origin, code: "RENAMED" });
  logger.info("whatsapp.connection.renamed", { correlationId, ownerUid: context.ownerUid, connectionId });
  return { ok: true, connectionId, label };
});

const whatsappDisconnectConnection = onCall({ region: REGION, enforceAppCheck: shouldEnforceAppCheck() }, async (request) => {
  const context = await resolveCallerContext(request);
  requireManage(context);
  const config = readWhatsappPublicConfig();
  if (!config.flags.disconnect) throw new HttpsError("failed-precondition", "A desconexão pelo painel ainda não está disponível.");
  await assertRateLimit({ scope: "whatsappDisconnectConnection", identifier: identificadorRateLimit("owner", context.ownerUid), max: RATE_LIMITS.CONNECTION_MANAGEMENT_PER_MIN });
  const connectionId = safeConnectionId(request.data?.connectionId);
  if (!connectionId || request.data?.confirmation !== "DESCONECTAR") throw new HttpsError("invalid-argument", "Confirme a desconexão digitando DESCONECTAR.");

  const db = getFirestore();
  const ref = db.doc(`${COLLECTIONS.CONNECTIONS}/${connectionId}`);
  let credentialResources = [];
  let label = "Conexão";
  await db.runTransaction(async (tx) => {
    const [snap, alternativesSnap] = await Promise.all([
      tx.get(ref),
      tx.get(db.collection(COLLECTIONS.CONNECTIONS).where("ownerUid", "==", context.ownerUid).where("connectionVersion", "==", CONNECTION_VERSION_MULTI))
    ]);
    const data = snap.exists ? snap.data() || {} : null;
    if (!data || data.ownerUid !== context.ownerUid || data.connectionVersion !== CONNECTION_VERSION_MULTI) throw new HttpsError("not-found", "Conexão não encontrada para esta loja.");
    if (data.status === "disconnected") return;
    label = data.label || label;
    credentialResources = [data.tokenSecretResource, data.pinSecretResource].filter(Boolean);
    const routeRef = data.phoneNumberId ? db.doc(`${COLLECTIONS.PHONE_ROUTES}/${data.phoneNumberId}`) : null;
    if (routeRef) {
      const routeSnap = await tx.get(routeRef);
      const route = routeSnap.exists ? routeSnap.data() || {} : null;
      if (route && route.ownerUid === context.ownerUid && route.connectionId === connectionId) {
        tx.set(routeRef, { active: false, disconnectedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
    }
    tx.set(ref, {
      status: "disconnected",
      isDefault: false,
      disconnectedAt: FieldValue.serverTimestamp(),
      disconnectedByUid: context.authUid,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUid: context.authUid
    }, { merge: true });
    if (data.isDefault) {
      const replacement = alternativesSnap.docs.find((doc) => doc.id !== connectionId && ["connected", "degraded"].includes(doc.data()?.status));
      if (replacement) tx.set(replacement.ref, { isDefault: true, updatedAt: FieldValue.serverTimestamp(), updatedByUid: context.authUid }, { merge: true });
    }
  });

  let credentialCleanupPending = false;
  if (!config.emulator) {
    const cleanup = await Promise.allSettled(credentialResources.map((resource) => desabilitarVersaoRecurso(resource)));
    credentialCleanupPending = cleanup.some((result) => result.status === "rejected");
  }
  credentialResources.forEach((resource) => limparCacheTokenPorResource(resource));
  if (credentialCleanupPending) await ref.set({ credentialCleanupPending: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  const correlationId = core.createCorrelationId("wadisconnect");
  const origin = core.sanitizeOrigin(request.rawRequest?.headers?.origin);
  await writeAudit({ ownerUid: context.ownerUid, authUid: context.authUid, module: "whatsapp", targetId: connectionId, action: "whatsapp.conexao_desconectada", risk: "high", summary: `Conexão "${label}" desconectada; o histórico foi preservado.`, source: "function", correlationId, origin, code: credentialCleanupPending ? "CREDENTIAL_CLEANUP_PENDING" : "DISCONNECTED" });
  logger.info("whatsapp.connection.disconnected", { correlationId, ownerUid: context.ownerUid, connectionId, credentialCleanupPending });
  return { ok: true, connectionId, status: "disconnected", credentialCleanupPending };
});

module.exports = { whatsappRenameConnection, whatsappDisconnectConnection, safeConnectionId };
