"use strict";

// Sprint 106: serialize staff capacity and keep private access fail-closed
// while Firebase Auth is being synchronized outside the Firestore transaction.
const { randomUUID } = require("node:crypto");
const { HttpsError } = require("firebase-functions/v2/https");
const { FieldValue } = require("firebase-admin/firestore");
const { employeeLimitForPlan } = require("../shared/validators");

const OPERATIONS = new Set(["create", "enable", "disable", "rollback-create", "complete-auth-sync"]);
// Internal evidence, bound to the exact error and creation operation. A caller
// cannot manufacture a safe rollback merely by throwing another HttpsError.
const createRejections = new WeakMap();

function isDefinitiveCreateRejection(error, { ownerUid, employeeUid, syncId } = {}) {
  const evidence = createRejections.get(error);
  return !!evidence && evidence.definitive === true && !!syncId
    && evidence.ownerUid === ownerUid && evidence.employeeUid === employeeUid
    && evidence.syncId === syncId;
}

async function mutateEmployeeCapacity({ db, ownerUid, employeeUid, operation, payload = null, actorUid = "", syncId = "" }) {
  if (!db || !ownerUid || !employeeUid || !OPERATIONS.has(operation)) {
    throw new HttpsError("invalid-argument", "Operação de funcionário inválida.");
  }
  // Generated only once, outside the transaction callback, so retries use
  // the same identity; only the initiating operation may complete/rollback.
  const id = syncId || (["create", "enable", "disable"].includes(operation) ? randomUUID() : "");
  if (!id) throw new HttpsError("invalid-argument", "Identificador de sincronização obrigatório.");

  const ownerRef = db.doc(`usuarios/${ownerUid}`);
  const employeeRef = db.doc(`funcionarios/${employeeUid}`);
  const guardRef = db.doc(`employee_capacity_guards/${ownerUid}`);
  const activeQuery = db.collection("funcionarios")
    .where("donoUID", "==", ownerUid).where("status", "==", "ativo");

  // These flags span ALL SDK callback attempts, not just the last one. Even
  // queued writes can have committed when their response was lost. Never
  // reset the evidence on retry or infer absence from the final error class.
  let writesAttempted = false;
  let existingCreateDocument = false;
  const applyMutation = async (tx) => {
    // Every read precedes every write. The tenant guard serializes capacity
    // mutations; authSyncPendente serializes the EXTERNAL Auth operation.
    const [ownerSnap, , employeeSnap, activeSnap] = await Promise.all([
      tx.get(ownerRef), tx.get(guardRef), tx.get(employeeRef), tx.get(activeQuery)
    ]);
    const current = employeeSnap.exists ? employeeSnap.data() : null;
    if (operation === "create" && employeeSnap.exists) existingCreateDocument = true;
    if (operation === "rollback-create" || operation === "complete-auth-sync") {
      if (!current || current.donoUID !== ownerUid ||
          current.authSyncPendente !== true || current.authSyncId !== id) {
        throw new HttpsError("failed-precondition", "Sincronização de funcionário diferente ou concluída.");
      }
      if (operation === "rollback-create") {
        if (current.criadoPorAuthUid !== actorUid || current.status !== "ativo") {
          throw new HttpsError("failed-precondition", "Rollback restrito à criação pendente original.");
        }
        tx.delete(employeeRef);
      } else {
        tx.update(employeeRef, {
          authSyncPendente: false, authSyncId: FieldValue.delete(),
          atualizadoEm: FieldValue.serverTimestamp()
        });
      }
    } else {
      if (!ownerSnap.exists || ownerSnap.data().status !== "aprovado") {
        throw new HttpsError("permission-denied", "Loja não aprovada ou inativa.");
      }
      if (operation === "create") {
        if (current || !payload) throw new HttpsError("already-exists", "Funcionário já cadastrado.");
      } else if (!current) {
        throw new HttpsError("not-found", "Funcionário não encontrado.");
      } else if (current.donoUID !== ownerUid) {
        throw new HttpsError("permission-denied", "Funcionário pertence a outro tenant.");
      } else if (current.authSyncPendente === true) {
        // Do NOT begin a second Auth request while the first can still
        // complete. A crashed request requires audited admin reconciliation.
        throw new HttpsError("failed-precondition", "Sincronização de acesso em andamento.");
      }

      const nextActive = operation !== "disable";
      const wasActive = current?.status === "ativo";
      const changed = operation === "create" || nextActive !== wasActive;
      if (changed && nextActive) {
        const limit = employeeLimitForPlan(ownerSnap.data().plano || "starter");
        if (limit >= 0 && activeSnap.size >= limit) {
          throw new HttpsError("failed-precondition", "Limite de funcionários do plano atingido.");
        }
      }
      if (operation === "create") {
        writesAttempted = true;
        tx.create(employeeRef, { ...payload, donoUID: ownerUid, status: "ativo",
          authSyncPendente: true, authSyncId: id });
      } else {
        // Lock also no-op transitions: they may still need to repair the
        // Firebase Auth disabled state, and must never race with another op.
        tx.update(employeeRef, {
          status: nextActive ? "ativo" : "inativo",
          authSyncPendente: true, authSyncId: id,
          atualizadoEm: FieldValue.serverTimestamp(),
          atualizadoPorAuthUid: actorUid
        });
      }
      tx.set(guardRef, { revision: FieldValue.increment(1),
        atualizadoEm: FieldValue.serverTimestamp() }, { merge: true });
      return { changed, status: nextActive ? "ativo" : "inativo", syncId: id };
    }

    tx.set(guardRef, { revision: FieldValue.increment(1),
      atualizadoEm: FieldValue.serverTimestamp() }, { merge: true });
    return { changed: true, status: current?.status || "inativo", syncId: id };
  };
  try {
    return await db.runTransaction(applyMutation);
  } catch (error) {
    if (operation === "create" && error && typeof error === "object") {
      createRejections.set(error, {
        ownerUid, employeeUid, syncId: id,
        definitive: error instanceof HttpsError && !writesAttempted && !existingCreateDocument
      });
    }
    throw error;
  }
}

module.exports = { isDefinitiveCreateRejection, mutateEmployeeCapacity };
