"use strict";

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { requireEdit, resolveCallerContext } = require("../shared/context");
const {
  employeeLimitForPlan,
  isValidEmail,
  normalizeEmail,
  normalizeString,
  sanitizePermissions
} = require("../shared/validators");
const { writeAudit } = require("../audit");

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
  requireEdit(context, "funcionarios");

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

  await assertEmployeeLimit(context.ownerUid, context.owner || {});

  const auth = getAuth();
  const db = getFirestore();
  let createdUser = null;
  try {
    try {
      await auth.getUserByEmail(email);
      throw new HttpsError("already-exists", "E-mail já cadastrado.");
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      if (error.code !== "auth/user-not-found") throw error;
    }

    createdUser = await auth.createUser({
      email,
      password,
      displayName: nome,
      disabled: false
    });

    await db.doc(`funcionarios/${createdUser.uid}`).set({
      donoUID: context.ownerUid,
      nome,
      email,
      cargo,
      status: "ativo",
      senhaTemporaria: true,
      permissoes,
      criadoEm: FieldValue.serverTimestamp(),
      criadoPorAuthUid: context.authUid
    });

    await writeAudit({
      authUid: context.authUid,
      ownerUid: context.ownerUid,
      module: "funcionarios",
      action: "createEmployee",
      targetId: createdUser.uid
    });

    return { ok: true, uid: createdUser.uid, email, nome, cargo, status: "ativo", permissoes };
  } catch (error) {
    if (createdUser?.uid) {
      await auth.deleteUser(createdUser.uid).catch(() => {});
    }
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "Não foi possível criar o funcionário.");
  }
});

const updateEmployee = onCall({ region: "southamerica-east1" }, async (request) => {
  const context = await resolveCallerContext(request);
  requireEdit(context, "funcionarios");

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

  await writeAudit({
    authUid: context.authUid,
    ownerUid: context.ownerUid,
    module: "funcionarios",
    action: "updateEmployee",
    targetId: employeeUid
  });

  return { ok: true };
});

async function setEmployeeEnabled(request, enabled) {
  const context = await resolveCallerContext(request);
  requireEdit(context, "funcionarios");
  const employeeUid = normalizeString(request.data?.uid, 160);
  if (!employeeUid) throw new HttpsError("invalid-argument", "UID obrigatório.");
  if (employeeUid === context.authUid) {
    throw new HttpsError("permission-denied", "Você não pode alterar o próprio status.");
  }
  const current = await loadEmployee(employeeUid);
  if (current.donoUID !== context.ownerUid) {
    throw new HttpsError("permission-denied", "Funcionário pertence a outro tenant.");
  }
  const status = enabled ? "ativo" : "inativo";
  await getFirestore().doc(`funcionarios/${employeeUid}`).set({
    status,
    atualizadoEm: FieldValue.serverTimestamp(),
    atualizadoPorAuthUid: context.authUid
  }, { merge: true });
  await getAuth().updateUser(employeeUid, { disabled: !enabled });
  await getAuth().revokeRefreshTokens(employeeUid);
  await writeAudit({
    authUid: context.authUid,
    ownerUid: context.ownerUid,
    module: "funcionarios",
    action: enabled ? "enableEmployee" : "disableEmployee",
    targetId: employeeUid
  });
  return { ok: true, status };
}

const disableEmployee = onCall({ region: "southamerica-east1" }, (request) => setEmployeeEnabled(request, false));
const enableEmployee = onCall({ region: "southamerica-east1" }, (request) => setEmployeeEnabled(request, true));

const resetEmployeePassword = onCall({ region: "southamerica-east1" }, async (request) => {
  const context = await resolveCallerContext(request);
  requireEdit(context, "funcionarios");
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
  capPermissionsToCaller,
  createEmployee,
  disableEmployee,
  enableEmployee,
  resetEmployeePassword,
  updateEmployee
};
