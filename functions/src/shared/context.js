"use strict";

const { HttpsError } = require("firebase-functions/v2/https");
const { getFirestore } = require("firebase-admin/firestore");
const { normalizeEmail } = require("./validators");

const SUPER_ADMIN_EMAIL = normalizeEmail(process.env.VIDE_SUPER_ADMIN_EMAIL || "");

function requireAuth(request) {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sessão obrigatória.");
  }
  return request.auth;
}

function isBackendAdmin(auth) {
  return auth?.token?.videAdmin === true
    || (SUPER_ADMIN_EMAIL
      && auth?.token?.email_verified === true
      && normalizeEmail(auth?.token?.email) === SUPER_ADMIN_EMAIL);
}

async function loadOwner(ownerUid) {
  const snap = await getFirestore().doc(`usuarios/${ownerUid}`).get();
  if (!snap.exists) {
    throw new HttpsError("failed-precondition", "Loja não encontrada.");
  }
  return { id: snap.id, ...snap.data() };
}

async function resolveCallerContext(request) {
  const auth = requireAuth(request);
  const db = getFirestore();

  if (isBackendAdmin(auth)) {
    return {
      authUid: auth.uid,
      authEmail: normalizeEmail(auth.token.email),
      ownerUid: auth.uid,
      role: "admin",
      isAdmin: true,
      isOwner: false,
      isEmployee: false,
      permissions: { ver: ["*"], editar: ["*"] }
    };
  }

  const ownerSnap = await db.doc(`usuarios/${auth.uid}`).get();
  if (ownerSnap.exists) {
    const owner = { id: auth.uid, ...ownerSnap.data() };
    if (owner.status !== "aprovado") {
      throw new HttpsError("permission-denied", "Loja ainda não aprovada.");
    }
    return {
      authUid: auth.uid,
      authEmail: normalizeEmail(auth.token.email),
      ownerUid: auth.uid,
      role: "owner",
      isAdmin: false,
      isOwner: true,
      isEmployee: false,
      owner,
      permissions: { ver: ["*"], editar: ["*"] }
    };
  }

  const employeeSnap = await db.doc(`funcionarios/${auth.uid}`).get();
  if (!employeeSnap.exists) {
    throw new HttpsError("permission-denied", "Perfil não encontrado.");
  }

  const employee = { id: employeeSnap.id, ...employeeSnap.data() };
  if (employee.status !== "ativo" || !employee.donoUID) {
    throw new HttpsError("permission-denied", "Funcionário inativo ou sem loja vinculada.");
  }

  const owner = await loadOwner(employee.donoUID);
  if (owner.status !== "aprovado") {
    throw new HttpsError("permission-denied", "Loja vinculada inativa.");
  }

  return {
    authUid: auth.uid,
    authEmail: normalizeEmail(auth.token.email),
    ownerUid: employee.donoUID,
    role: "employee",
    isAdmin: false,
    isOwner: false,
    isEmployee: true,
    employee,
    owner,
    permissions: employee.permissoes || { ver: [], editar: [] }
  };
}

function canEdit(context, moduleKey) {
  if (context.isAdmin || context.isOwner) return true;
  return Array.isArray(context.permissions?.editar)
    && context.permissions.editar.includes(moduleKey);
}

function requireEdit(context, moduleKey) {
  if (!canEdit(context, moduleKey)) {
    throw new HttpsError("permission-denied", "Permissão insuficiente.");
  }
}

function requireBackendAdmin(request) {
  const auth = requireAuth(request);
  if (!isBackendAdmin(auth)) {
    throw new HttpsError("permission-denied", "Admin backend obrigatório.");
  }
  return auth;
}

module.exports = {
  canEdit,
  isBackendAdmin,
  loadOwner,
  requireAuth,
  requireBackendAdmin,
  requireEdit,
  resolveCallerContext
};
