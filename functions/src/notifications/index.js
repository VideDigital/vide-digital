"use strict";

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { requireAuth, isBackendAdmin, resolveCallerContext } = require("../shared/context");
const { normalizeString } = require("../shared/validators");

const markNotificationRead = onCall({ region: "southamerica-east1" }, async (request) => {
  const auth = requireAuth(request);
  // Admin SDK bypasses Rules. A recipient UID alone must not restore access
  // to a suspended tenant or a staff account awaiting Auth synchronization.
  // Backend admins retain their explicit administrative exception.
  const id = normalizeString(request.data?.id, 180);
  if (!id) throw new HttpsError("invalid-argument", "Notificação obrigatória.");
  const db = getFirestore();
  const ref = db.doc(`notificacoes/${id}`);
  // Authorization is valid at the Firestore commit serialization point.
  // Every mutable authorization document is read through this transaction.
  // Conflicting revocation retries the callback and recomputes authorization.
  return db.runTransaction(async (tx) => {
  if (!isBackendAdmin(auth)) {
    await resolveCallerContext(request, { readDocument: (document) => tx.get(document) });
  }
  const snap = await tx.get(ref);
  if (!snap.exists) throw new HttpsError("not-found", "Notificação não encontrada.");
  const data = snap.data() || {};
  const destinatarios = Array.isArray(data.destinatarios) ? data.destinatarios : [];
  const canRead = isBackendAdmin(auth)
    || data.uid === auth.uid
    || destinatarios.includes(auth.uid)
    || destinatarios.includes("*");
  if (!canRead) {
    throw new HttpsError("permission-denied", "Notificação pertence a outro destinatário.");
  }
  const read = request.data?.read !== false;
  tx.update(ref, {
    lidoPor: read ? FieldValue.arrayUnion(auth.uid) : FieldValue.arrayRemove(auth.uid),
    leituraAtualizadaEm: FieldValue.serverTimestamp()
  });
  // Notificações de leitura estão na lista explícita de "não auditar"
  // da missão (ruído de alta frequência, sem valor de segurança) — nunca
  // geram evento em auditoria/, nem por writeAudit nem por trigger.
  return { ok: true };
  });
});

module.exports = { markNotificationRead };
