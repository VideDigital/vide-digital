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
  let capacity = null;
  let authEnableAttempted = false;
  try {
    try {
      await auth.getUserByEmail(email);
      throw new HttpsError("already-exists", "E-mail já cadastrado.");
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      if (error.code !== "auth/user-not-found") throw error;
    }

    // Account is disabled until Firestore capacity AND Auth synchronization
    // finish. The Rules deny access while authSyncPendente is true.
    createdUser = await auth.createUser({
      email, password, displayName: nome, disabled: true
    });
    capacity = await mutateEmployeeCapacity({
      db, ownerUid: context.ownerUid, employeeUid: createdUser.uid,
      operation: "create", actorUid: context.authUid,
      payload: { nome, email, cargo, senhaTemporaria: true, permissoes,
        criadoEm: FieldValue.serverTimestamp(), criadoPorAuthUid: context.authUid }
    });
    // A resposta da chamada externa pode se perder após o Auth aplicar a
    // mudança. A partir daqui, excluir o usuário num catch é inseguro.
    authEnableAttempted = true;
    await auth.updateUser(createdUser.uid, { disabled: false });
    await mutateEmployeeCapacity({
      db, ownerUid: context.ownerUid, employeeUid: createdUser.uid,
      operation: "complete-auth-sync", actorUid: context.authUid,
      syncId: capacity.syncId
    });
    return { ok: true, uid: createdUser.uid, email, nome, cargo, status: "ativo", permissoes };
  } catch (error) {
    // Só é seguro apagar Auth quando NENHUMA tentativa de habilitação foi
    // enviada. Se updateUser/complete-auth-sync tiver resultado ambíguo,
    // pode haver um commit já concluído; não apagar uma conta válida.
    // Manter a pendência e exigir reconciliação auditada (fail closed).
    let authDeleted = false;
    if (createdUser?.uid && !authEnableAttempted) {
      try {
        await auth.deleteUser(createdUser.uid);
        authDeleted = true;
      } catch (rollbackError) {
        logger.error("[Funcionários] Rollback falhou ao remover usuário Auth órfão:", rollbackError,
          { orphanUid: createdUser.uid });
      }
    }
    if (createdUser?.uid && authEnableAttempted) {
      logger.error("[Funcionários] Criação Auth/Firestore com resultado incerto; reconciliação necessária.",
        { uid: createdUser.uid, syncId: capacity?.syncId || null });
    }
    if (authDeleted && capacity?.syncId) {
      try {
        await mutateEmployeeCapacity({
          db, ownerUid: context.ownerUid, employeeUid: createdUser.uid,
          operation: "rollback-create", actorUid: context.authUid,
          syncId: capacity.syncId
        });
      } catch (rollbackError) {
        logger.error("[Funcionários] Falha ao limpar reserva de vaga após rollback Auth.",
          rollbackError, { uid: createdUser.uid });
      }
    }
    if (error instanceof HttpsError) throw error;
    // Never log name, email, password or requested permissions.
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
  // Transaction marks authSyncPendente=true before ANY Auth request.
  // A concurrent enable/disable fails closed rather than reordering Auth
  // updates past the Firestore status transition.
  const mutation = await mutateEmployeeCapacity({
    db, ownerUid: context.ownerUid, employeeUid,
    operation: enabled ? "enable" : "disable", actorUid: context.authUid
  });
  try {
    await auth.updateUser(employeeUid, { disabled: !enabled });
    await auth.revokeRefreshTokens(employeeUid);
    await mutateEmployeeCapacity({
      db, ownerUid: context.ownerUid, employeeUid,
      operation: "complete-auth-sync", actorUid: context.authUid,
      syncId: mutation.syncId
    });
  } catch (error) {
    // Do not undo another successful operation: leave pending flag set
    // and block this account in Rules until an audited reconciliation.
    // A retry must never overlap a request whose Auth response is unknown.
    logger.error("[Funcionários] Falha ao sincronizar status do Firebase Auth.", error,
      { employeeUid, syncId: mutation.syncId });
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
