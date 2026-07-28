"use strict";

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { requireAuth, isBackendAdmin } = require("../shared/context");
const { normalizeString } = require("../shared/validators");

const markNotificationRead = onCall({ region: "southamerica-east1" }, async (request) => {
  const auth = requireAuth(request);
  const id = normalizeString(request.data?.id, 180);
  if (!id) throw new HttpsError("invalid-argument", "Notificação obrigatória.");
  const ref = getFirestore().doc(`notificacoes/${id}`);
  const snap = await ref.get();
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
  await ref.set({
    lidoPor: read ? FieldValue.arrayUnion(auth.uid) : FieldValue.arrayRemove(auth.uid),
    leituraAtualizadaEm: FieldValue.serverTimestamp()
  }, { merge: true });
  // Notificações de leitura estão na lista explícita de "não auditar"
  // da missão (ruído de alta frequência, sem valor de segurança) — nunca
  // geram evento em auditoria/, nem por writeAudit nem por trigger.
  return { ok: true };
});

module.exports = { markNotificationRead };
