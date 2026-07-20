"use strict";

const { HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");

const WINDOW_SECONDS = 60;

function currentWindowBucket() {
  return Math.floor(Date.now() / (WINDOW_SECONDS * 1000));
}

function callerIp(request) {
  const forwarded = request?.rawRequest?.headers?.["x-forwarded-for"];
  const ip = request?.rawRequest?.ip || (forwarded ? String(forwarded).split(",")[0] : "");
  return String(ip || "unknown").trim().slice(0, 100);
}

// Janela fixa por minuto, contada em Firestore com transação (segura contra
// corrida — se dois pedidos concorrentes lerem a mesma contagem, o Firestore
// reexecuta a transação perdedora automaticamente). Não é distribuído nem
// preciso o suficiente para substituir App Check/rate limit de borda em
// produção com tráfego real, mas fecha o abuso trivial de "martelar" uma
// Function pública sem nenhum limite, hoje inexistente.
async function assertRateLimit({ scope, identifier, max }) {
  const bucket = currentWindowBucket();
  const key = `${scope}_${identifier}_${bucket}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 300);
  const ref = getFirestore().collection("_rate_limits").doc(key);

  const exceeded = await getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? Number(snap.data().count || 0) : 0;
    if (current >= max) return true;
    tx.set(ref, {
      count: FieldValue.increment(1),
      scope,
      updatedAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + WINDOW_SECONDS * 2 * 1000)
    }, { merge: true });
    return false;
  });

  if (exceeded) {
    throw new HttpsError("resource-exhausted", "Muitas requisições. Tente novamente em instantes.");
  }
}

async function assertPublicRateLimit(request, scope, max) {
  await assertRateLimit({ scope, identifier: callerIp(request), max });
}

module.exports = { assertPublicRateLimit, assertRateLimit, callerIp };
