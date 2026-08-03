"use strict";

// writeAudit() é o único ponto desta pasta que ainda escreve em
// auditoria/{eventId} fora de um Firestore trigger (./triggers.js) —
// reservado para ações que não são uma mutation observável em nenhuma
// coleção auditada: criação de membro admin (grava em equipe_admin,
// fora da lista de coleções auditadas), sincronização de custom claims
// (não é uma escrita de documento) e redefinição de senha de
// funcionário (só gera um link do Auth, não toca Firestore). Nunca
// chamado por uma mutation já coberta por um trigger — evitaria dois
// eventos pra mesma escrita real.
//
// O callable público `auditWrite` que existia aqui foi REMOVIDO nesta
// missão: aceitava um `ownerUid` vindo do payload do cliente, o que o
// tornava inutilizável como fonte de verdade (qualquer chamador
// autenticado podia alegar ser qualquer tenant). Não havia consumidor
// de produção — nenhuma página chamava VideFunctions.auditWrite. Ver
// docs/AUDITORIA_CENTRALIZADA.md.

const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { normalizeString } = require("../shared/validators");
const core = require("./core");
const triggers = require("./triggers");

async function writeAudit(entry) {
  const ownerUid = normalizeString(entry.ownerUid, 160);
  const targetId = normalizeString(entry.targetId, 160);
  if (!ownerUid || !targetId) return;

  const module = normalizeString(entry.module, 80) || "sistema";
  const action = normalizeString(entry.action, 120) || `${module}.acao`;
  const actorUid = entry.authUid ? normalizeString(entry.authUid, 160) : null;

  const db = getFirestore();
  const eventId = core.safeEventId(db.collection("auditoria").doc().id);
  if (!eventId) return;

  const auditEvent = core.buildAuditEvent({
    eventId,
    ownerUid,
    actorUid,
    actorType: actorUid ? "user" : "system",
    module,
    entityType: module,
    entityId: targetId,
    operation: "action",
    action,
    risk: core.RISK_LEVELS.has(entry.risk) ? entry.risk : "medium",
    summary: entry.summary || `Ação "${action}" executada.`,
    changedFields: [],
    before: {},
    after: {},
    source: core.SOURCES.has(entry.source) ? entry.source : "function"
  });

  await db.doc(`auditoria/${eventId}`).set({
    ...auditEvent,
    ok: entry.ok !== false,
    operationalContext: {
      correlationId: normalizeString(entry.correlationId, 80),
      origin: normalizeString(entry.origin, 240),
      resultCode: normalizeString(entry.code, 80)
    },
    createdAt: FieldValue.serverTimestamp()
  });
}

module.exports = { writeAudit, ...triggers };
