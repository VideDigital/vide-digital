"use strict";

const { HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");

const WINDOW_SECONDS = 60;
const WINDOW_MS = WINDOW_SECONDS * 1000;

function callerIp(request) {
  const headers = request?.rawRequest?.headers || {};
  const forwardedHeader = headers["x-forwarded-for"];

  const forwarded = Array.isArray(forwardedHeader)
    ? String(forwardedHeader[0] || "").split(",")[0]
    : String(forwardedHeader || "").split(",")[0];

  const ip =
    forwarded ||
    request?.rawRequest?.ip ||
    request?.rawRequest?.socket?.remoteAddress ||
    "";

  return String(ip || "unknown").trim().slice(0, 100);
}

function callerIdentifier(request) {
  const authUid = String(request?.auth?.uid || "").trim();

  // Chamadas autenticadas recebem uma cota por usuário. Isso deixa o limite
  // estável mesmo quando o Emulator ou um proxy representa o IP de formas
  // diferentes entre requisições. Chamadas públicas sem login continuam
  // limitadas pelo IP de origem.
  if (authUid) {
    return `auth_${authUid}`;
  }

  return `ip_${callerIp(request)}`;
}

function timestampMillis(value) {
  if (value?.toMillis) return value.toMillis();

  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

// Janela de 60 segundos iniciada na primeira chamada do identificador.
//
// Diferentemente de um bucket baseado no minuto do relógio, esta janela não é
// reiniciada só porque o relógio mudou de 10:59:59 para 11:00:00. Assim, uma
// sequência rápida de chamadas não ganha uma cota nova no meio do teste ou de
// uma tentativa de abuso.
//
// A contagem usa transação do Firestore, portanto continua segura quando duas
// instâncias recebem requisições simultâneas.
async function assertRateLimit({ scope, identifier, max }) {
  const safeScope = String(scope || "public").trim() || "public";
  const safeIdentifier = String(identifier || "unknown").trim() || "unknown";

  const key = `${safeScope}_${safeIdentifier}`
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 300);

  const db = getFirestore();
  const ref = db.collection("_rate_limits").doc(key);
  const now = Date.now();

  const exceeded = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() || {} : {};

    const windowStartedAt = timestampMillis(data.windowStartedAt);
    const windowExpired =
      !windowStartedAt ||
      now - windowStartedAt >= WINDOW_MS;

    if (windowExpired) {
      tx.set(
        ref,
        {
          count: 1,
          scope: safeScope,
          windowStartedAt: Timestamp.fromMillis(now),
          updatedAt: FieldValue.serverTimestamp(),
          expiresAt: Timestamp.fromMillis(now + WINDOW_MS * 2)
        },
        { merge: false }
      );

      return false;
    }

    const current = Math.max(0, Number(data.count || 0));

    if (current >= max) {
      return true;
    }

    tx.set(
      ref,
      {
        count: current + 1,
        scope: safeScope,
        updatedAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromMillis(windowStartedAt + WINDOW_MS * 2)
      },
      { merge: true }
    );

    return false;
  });

  if (exceeded) {
    throw new HttpsError(
      "resource-exhausted",
      "Muitas requisições. Tente novamente em instantes."
    );
  }
}

async function assertPublicRateLimit(request, scope, max) {
  await assertRateLimit({
    scope,
    identifier: callerIdentifier(request),
    max
  });
}

module.exports = {
  assertPublicRateLimit,
  assertRateLimit,
  callerIdentifier,
  callerIp
};
