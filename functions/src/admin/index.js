"use strict";

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { requireBackendAdmin } = require("../shared/context");
const { isValidEmail, normalizeEmail, normalizeString, sanitizePermissions } = require("../shared/validators");
const { writeAudit } = require("../audit");

const VALID_STATUS = new Set(["pendente", "aprovado", "rejeitado", "inativo"]);
const VALID_PLANS = new Set(["starter", "basico", "essencial", "negocio", "profissional", "avancado", "pro", "proplus", "agencia", "enterprise", "premium"]);

const createAdminMember = onCall({ region: "southamerica-east1" }, async (request) => {
  const auth = requireBackendAdmin(request);
  const email = normalizeEmail(request.data?.email);
  const password = String(request.data?.password || "");
  const permissoes = Array.isArray(request.data?.permissoes)
    ? request.data.permissoes.map((item) => normalizeString(item, 80)).filter(Boolean)
    : [];
  if (!isValidEmail(email) || password.length < 8 || permissoes.length === 0) {
    throw new HttpsError("invalid-argument", "E-mail, senha forte e permissões são obrigatórios.");
  }

  const adminAuth = getAuth();
  let createdUser = null;
  try {
    try {
      await adminAuth.getUserByEmail(email);
      throw new HttpsError("already-exists", "E-mail já cadastrado.");
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      if (error.code !== "auth/user-not-found") throw error;
    }

    createdUser = await adminAuth.createUser({
      email,
      password,
      disabled: false
    });
    await adminAuth.setCustomUserClaims(createdUser.uid, { videAdmin: true });
    const docId = email.replace(/[^a-z0-9]/g, "_");
    await getFirestore().doc(`equipe_admin/${docId}`).set({
      email,
      uid: createdUser.uid,
      permissoes,
      criadoEm: FieldValue.serverTimestamp(),
      criadoPor: auth.uid,
      claimsSincronizadasEm: FieldValue.serverTimestamp()
    });
    await writeAudit({ authUid: auth.uid, ownerUid: createdUser.uid, module: "admin", action: "createAdminMember", targetId: createdUser.uid });
    return { ok: true, uid: createdUser.uid, email };
  } catch (error) {
    if (createdUser?.uid) await adminAuth.deleteUser(createdUser.uid).catch(() => {});
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "Não foi possível criar membro admin.");
  }
});

const adminUpdateStoreStatus = onCall({ region: "southamerica-east1" }, async (request) => {
  const auth = requireBackendAdmin(request);
  const uid = normalizeString(request.data?.uid, 160);
  const status = normalizeString(request.data?.status, 40);
  if (!uid || !VALID_STATUS.has(status)) {
    throw new HttpsError("invalid-argument", "UID e status válido são obrigatórios.");
  }
  await getFirestore().doc(`usuarios/${uid}`).set({
    status,
    statusAtualizadoEm: FieldValue.serverTimestamp(),
    statusAtualizadoPor: auth.uid
  }, { merge: true });
  await writeAudit({ authUid: auth.uid, ownerUid: uid, module: "admin", action: "adminUpdateStoreStatus", targetId: uid });
  return { ok: true, status };
});

const adminUpdatePlan = onCall({ region: "southamerica-east1" }, async (request) => {
  const auth = requireBackendAdmin(request);
  const uid = normalizeString(request.data?.uid, 160);
  const plano = normalizeString(request.data?.plano, 40);
  if (!uid || !VALID_PLANS.has(plano)) {
    throw new HttpsError("invalid-argument", "UID e plano válido são obrigatórios.");
  }
  const featuresManuais = Array.isArray(request.data?.featuresManuais)
    ? request.data.featuresManuais.map((item) => normalizeString(item, 80)).filter(Boolean)
    : [];
  const anotacaoAdmin = normalizeString(request.data?.anotacaoAdmin, 1000);
  await getFirestore().doc(`usuarios/${uid}`).set({
    plano,
    featuresManuais,
    anotacaoAdmin,
    planoAtualizadoEm: FieldValue.serverTimestamp(),
    planoAtualizadoPor: auth.uid
  }, { merge: true });
  await writeAudit({ authUid: auth.uid, ownerUid: uid, module: "admin", action: "adminUpdatePlan", targetId: uid });
  return { ok: true, plano, featuresManuais };
});

const syncAdminClaims = onCall({ region: "southamerica-east1" }, async (request) => {
  const auth = requireBackendAdmin(request);
  const email = normalizeEmail(request.data?.email);
  const uid = normalizeString(request.data?.uid, 160);
  const enabled = request.data?.enabled !== false;
  const permissoes = Array.isArray(request.data?.permissoes)
    ? request.data.permissoes.map((item) => normalizeString(item, 80)).filter(Boolean)
    : [];
  if (!uid || !isValidEmail(email)) {
    throw new HttpsError("invalid-argument", "UID e e-mail válidos são obrigatórios.");
  }
  if (uid === auth.uid && enabled === false) {
    throw new HttpsError("permission-denied", "Admin não pode remover a própria claim nesta operação.");
  }
  await getAuth().setCustomUserClaims(uid, enabled ? { videAdmin: true } : {});
  await getAuth().revokeRefreshTokens(uid);
  const docId = email.replace(/[^a-z0-9]/g, "_");
  if (enabled) {
    await getFirestore().doc(`equipe_admin/${docId}`).set({
      email,
      uid,
      permissoes,
      claimsSincronizadasEm: FieldValue.serverTimestamp(),
      claimsSincronizadasPor: auth.uid
    }, { merge: true });
  } else {
    await getFirestore().doc(`equipe_admin/${docId}`).set({
      removidoEm: FieldValue.serverTimestamp(),
      removidoPor: auth.uid,
      ativo: false
    }, { merge: true });
  }
  await writeAudit({ authUid: auth.uid, ownerUid: uid, module: "admin", action: "syncAdminClaims", targetId: uid });
  return { ok: true, enabled };
});

module.exports = {
  createAdminMember,
  adminUpdatePlan,
  adminUpdateStoreStatus,
  syncAdminClaims
};
