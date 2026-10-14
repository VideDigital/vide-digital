"use strict";

// A guard document shared by every capacity-changing transaction serializes
// concurrent creates/reactivations per tenant. Only the Admin SDK writes it.
const { HttpsError } = require("firebase-functions/v2/https");
const { FieldValue } = require("firebase-admin/firestore");
const { employeeLimitForPlan } = require("../shared/validators");

const OPERATIONS = new Set(["create", "enable", "disable", "rollback-create"]);

async function mutateEmployeeCapacity({ db, ownerUid, employeeUid, operation, payload = null, actorUid = "" }) {
  if (!db || !ownerUid || !employeeUid || !OPERATIONS.has(operation)) {
    throw new HttpsError("invalid-argument", "Operação de funcionário inválida.");
  }

  const ownerRef = db.doc(`usuarios/${ownerUid}`);
  const employeeRef = db.doc(`funcionarios/${employeeUid}`);
  const guardRef = db.doc(`employee_capacity_guards/${ownerUid}`);
  const activeQuery = db.collection("funcionarios")
    .where("donoUID", "==", ownerUid)
    .where("status", "==", "ativo");

  return db.runTransaction(async (tx) => {
    // Read all documents/queries before writing.
    const [ownerSnap, , employeeSnap, activeSnap] = await Promise.all([
      tx.get(ownerRef),
      tx.get(guardRef),
      tx.get(employeeRef),
      tx.get(activeQuery)
    ]);
    const current = employeeSnap.exists ? employeeSnap.data() : null;

    // Compensating rollback after Auth activation failure, allowed even
    // when a store became inactive during the operation.
    if (operation === "rollback-create") {
      if (!current || current.donoUID !== ownerUid ||
          current.criadoPorAuthUid !== actorUid || current.status !== "ativo") {
        throw new HttpsError("failed-precondition", "Rollback requer funcionário criado por esta operação.");
      }
      tx.delete(employeeRef);
    } else {
      if (!ownerSnap.exists || ownerSnap.data().status !== "aprovado") {
        throw new HttpsError("permission-denied", "Loja não aprovada ou inativa.");
      }
      if (operation === "create") {
        if (current || !payload) {
          throw new HttpsError("already-exists", "Funcionário já cadastrado.");
        }
      } else if (!current) {
        throw new HttpsError("not-found", "Funcionário não encontrado.");
      } else if (current.donoUID !== ownerUid) {
        throw new HttpsError("permission-denied", "Funcionário pertence a outro tenant.");
      }

      const nextActive = operation === "create" || operation === "enable";
      const isActive = current?.status === "ativo";
      if (operation !== "create" && isActive === nextActive) {
        return { changed: false, status: nextActive ? "ativo" : "inativo" };
      }

      if (nextActive) {
        const limit = employeeLimitForPlan(ownerSnap.data().plano || "starter");
        if (limit >= 0 && activeSnap.size >= limit) {
          throw new HttpsError("failed-precondition", "Limite de funcionários do plano atingido.");
        }
      }

      if (operation === "create") {
        tx.create(employeeRef, { ...payload, donoUID: ownerUid, status: "ativo" });
      } else {
        tx.update(employeeRef, {
          status: nextActive ? "ativo" : "inativo",
          atualizadoEm: FieldValue.serverTimestamp(),
          atualizadoPorAuthUid: actorUid
        });
      }
    }

    // Both concurrent transactions read then change the same guard doc;
    // the loser retries and recounts before it can reserve the final slot.
    tx.set(guardRef, {
      revision: FieldValue.increment(1),
      atualizadoEm: FieldValue.serverTimestamp()
    }, { merge: true });

    return { changed: true, status: operation === "disable" ? "inativo" : "ativo" };
  });
}

module.exports = { mutateEmployeeCapacity };
