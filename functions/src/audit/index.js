"use strict";

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { requireAuth, requireBackendAdmin } = require("../shared/context");
const { normalizeString } = require("../shared/validators");

async function writeAudit(entry) {
  await getFirestore().collection("auditoria").add({
    authUid: entry.authUid || null,
    ownerUid: entry.ownerUid || null,
    module: normalizeString(entry.module, 80),
    action: normalizeString(entry.action, 120),
    targetId: normalizeString(entry.targetId, 160),
    source: normalizeString(entry.source || "function", 80),
    ok: entry.ok !== false,
    createdAt: FieldValue.serverTimestamp()
  });
}

const auditWrite = onCall({ region: "southamerica-east1" }, async (request) => {
  const auth = requireAuth(request);
  if (!request.data?.module || !request.data?.action) {
    throw new HttpsError("invalid-argument", "module e action são obrigatórios.");
  }
  if (request.data.adminOnly) requireBackendAdmin(request);
  await writeAudit({
    authUid: auth.uid,
    ownerUid: normalizeString(request.data.ownerUid, 160),
    module: request.data.module,
    action: request.data.action,
    targetId: request.data.targetId,
    source: "callable"
  });
  return { ok: true };
});

module.exports = { auditWrite, writeAudit };
