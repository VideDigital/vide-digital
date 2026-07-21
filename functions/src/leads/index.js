"use strict";

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { resolveCallerContext, requireEdit } = require("../shared/context");
const { normalizeString, publicText } = require("../shared/validators");
const { writeAudit } = require("../audit");

// O dono/funcionário lê o chat público (createPublicChat/sendPublicChatMessage)
// pelo painel há tempos, mas nunca teve como responder: as rules bloqueiam
// escrita em chats/mensagens pra todo mundo (só Cloud Function com Admin SDK
// pode gravar sender "admin"). Esta é essa função que faltava.
const sendAdminChatMessage = onCall({ region: "southamerica-east1" }, async (request) => {
  const context = await resolveCallerContext(request);
  requireEdit(context, "leads");

  const chatId = normalizeString(request.data?.chatId, 180);
  const texto = publicText(request.data?.texto, 1000);
  if (!chatId || !texto) {
    throw new HttpsError("invalid-argument", "Chat e mensagem são obrigatórios.");
  }

  const db = getFirestore();
  const chatRef = db.doc(`chats/${chatId}`);
  const chatSnap = await chatRef.get();
  if (!chatSnap.exists) throw new HttpsError("not-found", "Chat não encontrado.");

  const chat = chatSnap.data() || {};
  const chatOwnerUid = chat.donoUID || chat.emailDono;
  if (chatOwnerUid !== context.ownerUid) {
    throw new HttpsError("permission-denied", "Este chat não pertence à sua loja.");
  }

  await chatRef.collection("mensagens").add({
    texto,
    sender: "admin",
    autorUID: context.authUid,
    timestamp: Date.now(),
    criadoEm: FieldValue.serverTimestamp()
  });
  await chatRef.set({
    ultimaMensagem: texto,
    statusAdmin: "respondido",
    atualizadoEm: FieldValue.serverTimestamp()
  }, { merge: true });

  await writeAudit({
    authUid: context.authUid,
    ownerUid: context.ownerUid,
    module: "leads",
    action: "sendAdminChatMessage",
    targetId: chatId
  });

  return { ok: true };
});

module.exports = { sendAdminChatMessage };
