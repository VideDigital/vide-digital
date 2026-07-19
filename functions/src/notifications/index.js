"use strict";

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { requireAuth, isBackendAdmin } = require("../shared/context");
const { normalizeString } = require("../shared/validators");
const { writeAudit } = require("../audit");

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
  await writeAudit({ authUid: auth.uid, ownerUid: data.uid || null, module: "notificacoes", action: "markNotificationRead", targetId: id });
  return { ok: true };
});

module.exports = { markNotificationRead };
