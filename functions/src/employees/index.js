"use strict";

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { mutateEmployeeCapacity } = require("./capacity");
const { resolveCallerContext } = require("../shared/context");
const {
  employeeLimitForPlan,
  isValidEmail,
  normalizeEmail,
  normalizeString,
  sanitizePermissions
} = require("../shared/validators");
const { writeAudit } = require("../audit");

// Gestão de funcionários (criar, editar, ativar/desativar, resetar senha) é
// restrita ao dono/admin — nunca a outro funcionário, mesmo com "funcionarios"
// na própria lista de permissões editáveis. Isso bate com a política real do
// produto (dashboard-app.js bloqueia isso na UI incondicionalmente) — sem
// esta checagem aqui, um funcionário com essa permissão conseguiria chamar
// a Callable direto (bypassando a UI) e gerenciar colegas do próprio tenant.
// capPermissionsToCaller() abaixo continua existindo como segunda camada
// (nunca deixaria um funcionário conceder mais do que possui), mas a
// política atual é mais simples: funcionário não gerencia funcionário.
function requireOwnerOrAdmin(context) {
  if (!context.isOwner && !context.isAdmin) {
    throw new HttpsError("permission-denied", "Apenas o dono da loja pode gerenciar funcionários.");
  }
}

async function assertEmployeeLimit(ownerUid, owner) {
  const limit = employeeLimitForPlan(owner?.plano || "starter");
  if (limit < 0) return;
  const snap = await getFirestore()
    .collection("funcionarios")
    .where("donoUID", "==", ownerUid)
    .where("status", "==", "ativo")
    .get();
  if (snap.size >= limit) {
    throw new HttpsError("failed-precondition", "Limite de funcionários do plano atingido.");
  }
}

async function loadEmployee(uid) {
  const snap = await getFirestore().doc(`funcionarios/${uid}`).get();
  if (!snap.exists) throw new HttpsError("not-found", "Funcionário não encontrado.");
  return { id: snap.id, ...snap.data() };
}

// Um funcionário só pode conceder a outro funcionário permissões que ele
// mesmo possui — evita que "editar funcionarios" vire uma forma indireta
// de se autopromover a acesso total criando/editando um colega com mais
// permissões do que o próprio criador tem.
function capPermissionsToCaller(context, permissoes) {
  if (context.isAdmin || context.isOwner) return permissoes;
  const callerVer = new Set(context.permissions?.ver || []);
  const callerEditar = new Set(context.permissions?.editar || []);
  return {
    ver: permissoes.ver.filter((moduleKey) => callerVer.has(moduleKey)),
    editar: permissoes.editar.filter((moduleKey) => callerEditar.has(moduleKey))
  };
}

const createEmployee = onCall({ region: "southamerica-east1" }, async (request) => {
  const context = await resolveCallerContext(request);
  requireOwnerOrAdmin(context);

  const email = normalizeEmail(request.data?.email);
  const password = String(request.data?.password || "");
  const nome = normalizeString(request.data?.nome, 120);
  const cargo = normalizeString(request.data?.cargo, 120);
  const permissoes = capPermissionsToCaller(context, sanitizePermissions(request.data?.permissoes));

  if (!nome || !isValidEmail(email)) {
    throw new HttpsError("invalid-argument", "Nome e e-mail válidos são obrigatórios.");
  }
  if (password.length < 8) {
    throw new HttpsError("invalid-argument", "Senha inicial deve ter ao menos 8 caracteres.");
  }

  // A quota is enforced INSIDE the Firestore transaction (also on reactivation).
  // The earlier preflight count alone was racy under concurrent requests.
  const auth = getAuth();
  const db = getFirestore();
  let createdUser = null;
  let capacityCommitted = false;
  try {
    try {
      await auth.getUserByEmail(email);
      throw new HttpsError("already-exists", "E-mail já cadastrado.");
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      if (error.code !== "auth/user-not-found") throw error;
    }

    // The Auth identity cannot sign in until capacity has been reserved.
    createdUser = await auth.createUser({
      email,
      password,
      displayName: nome,
      disabled: true
    });

    await mutateEmployeeCapacity({
      db,
      ownerUid: context.ownerUid,
      employeeUid: createdUser.uid,
      operation: "create",
      actorUid: context.authUid,
      payload: {
        nome,
        email,
        cargo,
        senhaTemporaria: true,
        permissoes,
        criadoEm: FieldValue.serverTimestamp(),
        criadoPorAuthUid: context.authUid
      }
    });
    capacityCommitted = true;
    await auth.updateUser(createdUser.uid, { disabled: false });

    // auditFuncionariosWrite observes the real Firestore creation.
    return { ok: true, uid: createdUser.uid, email, nome, cargo, status: "ativo", permissoes };
  } catch (error) {
    // Auth and Firestore cannot share one atomic transaction. Compensate
    // when account enabling fails after a successful Firestore reservation.
    let rollbackComplete = !capacityCommitted;
    if (createdUser && capacityCommitted) {
      try {
        await mutateEmployeeCapacity({
          db,
          ownerUid: context.ownerUid,
          employeeUid: createdUser.uid,
          operation: "rollback-create",
          actorUid: context.authUid
        });
        rollbackComplete = true;
      } catch (rollbackError) {
        logger.error("[Funcionários] Não foi possível liberar a vaga de criação incompleta.", rollbackError, { uid: createdUser.uid });
      }
    }
    if (createdUser?.uid && rollbackComplete) {
      await auth.deleteUser(createdUser.uid).catch((rollbackError) => {
        logger.error("[Funcionários] Rollback falhou ao remover usuário Auth órfão:", rollbackError, { orphanUid: createdUser.uid });
      });
    }
    // If rollback failed, the Auth account remains disabled (fail closed)
    // and the incident must be reconciled before retrying.
    if (error instanceof HttpsError) throw error;
    // O SDK só registra erro não-HttpsError; convertido em "internal" aqui,
    // a causa sumiria da observabilidade sem este log (nunca com dados do
    // request: e-mail, senha, nome ou permissões).
    logger.error("[Funcionários] Falha inesperada ao criar funcionário:", error);
    throw new HttpsError("internal", "Não foi possível criar o funcionário.");
  }
});

const updateEmployee = onCall({ region: "southamerica-east1" }, async (request) => {
  const context = await resolveCallerContext(request);
  requireOwnerOrAdmin(context);

  const employeeUid = normalizeString(request.data?.uid, 160);
  if (!employeeUid) throw new HttpsError("invalid-argument", "UID obrigatório.");
  if (employeeUid === context.authUid) {
    throw new HttpsError("permission-denied", "Você não pode alterar as próprias permissões.");
  }

  const current = await loadEmployee(employeeUid);
  if (current.donoUID !== context.ownerUid) {
    throw new HttpsError("permission-denied", "Funcionário pertence a outro tenant.");
  }

  const nome = normalizeString(request.data?.nome, 120);
  const cargo = normalizeString(request.data?.cargo, 120);
  const permissoes = capPermissionsToCaller(context, sanitizePermissions(request.data?.permissoes));
  if (!nome) throw new HttpsError("invalid-argument", "Nome obrigatório.");

  await getFirestore().doc(`funcionarios/${employeeUid}`).set({
    nome,
    cargo,
    permissoes,
    atualizadoEm: FieldValue.serverTimestamp(),
    atualizadoPorAuthUid: context.authUid
  }, { merge: true });

  // Sem writeAudit() aqui: auditFuncionariosWrite já cobre esta escrita.

  return { ok: true };
});

async function setEmployeeEnabled(request, enabled) {
  const context = await resolveCallerContext(request);
  requireOwnerOrAdmin(context);
  const employeeUid = normalizeString(request.data?.uid, 160);
  if (!employeeUid) throw new HttpsError("invalid-argument", "UID obrigatório.");
  if (employeeUid === context.authUid) {
    throw new HttpsError("permission-denied", "Você não pode alterar o próprio status.");
  }

  const db = getFirestore();
  const auth = getAuth();
  // Auth first on enable would leave a login-capable account before quota
  // approval. Firestore first keeps Rules in control until Auth is enabled.
  const mutation = await mutateEmployeeCapacity({
    db, ownerUid: context.ownerUid, employeeUid,
    operation: enabled ? "enable" : "disable", actorUid: context.authUid
  });
  try {
    await auth.updateUser(employeeUid, { disabled: !enabled });
    await auth.revokeRefreshTokens(employeeUid);
  } catch (error) {
    // On failed enable, free only the slot newly reserved by this call.
    // If another concurrent call enabled the same account, the employee
    // remains active but Auth state needs a separate reconciliation.
    if (enabled && mutation.changed) {
      try {
        await mutateEmployeeCapacity({
          db, ownerUid: context.ownerUid, employeeUid,
          operation: "disable", actorUid: context.authUid
        });
      } catch (rollbackError) {
        logger.error("[Funcionários] Falha ao compensar reativação no Firestore.", rollbackError, { employeeUid });
      }
    }
    logger.error("[Funcionários] Falha ao sincronizar status do Firebase Auth.", error, { employeeUid });
    throw new HttpsError("internal", "Não foi possível sincronizar o acesso do funcionário.");
  }
  return { ok: true, status: enabled ? "ativo" : "inativo" };
}

const disableEmployee = onCall({ region: "southamerica-east1" }, (request) => setEmployeeEnabled(request, false));
const enableEmployee = onCall({ region: "southamerica-east1" }, (request) => setEmployeeEnabled(request, true));

const resetEmployeePassword = onCall({ region: "southamerica-east1" }, async (request) => {
  const context = await resolveCallerContext(request);
  requireOwnerOrAdmin(context);
  const employeeUid = normalizeString(request.data?.uid, 160);
  const current = await loadEmployee(employeeUid);
  if (current.donoUID !== context.ownerUid) {
    throw new HttpsError("permission-denied", "Funcionário pertence a outro tenant.");
  }
  const link = await getAuth().generatePasswordResetLink(current.email);
  await writeAudit({
    authUid: context.authUid,
    ownerUid: context.ownerUid,
    module: "funcionarios",
    action: "resetEmployeePassword",
    targetId: employeeUid
  });
  return { ok: true, email: current.email, resetLink: link };
});

module.exports = {
  assertEmployeeLimit,
  capPermissionsToCaller,
  createEmployee,
  disableEmployee,
  enableEmployee,
  requireOwnerOrAdmin,
  resetEmployeePassword,
  updateEmployee
};
