"use strict";

const crypto = require("crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { resolveCallerContext } = require("../shared/context");
const { assertRateLimit } = require("../shared/rateLimit");
const { writeAudit } = require("../audit");
const {
  COLLECTIONS,
  CONNECTION_VERSION_MULTI,
  MAX_CONNECTIONS_PER_OWNER,
  META_PERMISSIONS,
  RATE_LIMITS,
  REGION,
  WHATSAPP_GRAPH_VERSION
} = require("./constants");
const { WHATSAPP_APP_SECRET, adicionarVersaoPinConexao, adicionarVersaoTokenConexao, desabilitarVersaoRecurso } = require("./secrets");
const { criarMetaClient } = require("./metaClient");
const { podeGerenciarConexao } = require("./send");
const { identificadorRateLimit } = require("./validators");
const { normalizarTemplateMeta } = require("./templates");
const { availabilityForContext, isEmulator, originAllowed, readWhatsappPublicConfig, shouldEnforceAppCheck } = require("./config");
const core = require("./onboarding-core");

const metaClient = criarMetaClient();
const APP_CHECK_OPTIONS = {
  region: REGION,
  enforceAppCheck: shouldEnforceAppCheck(),
  ...(isEmulator() ? {} : { secrets: [WHATSAPP_APP_SECRET] })
};

function requireManage(context) {
  if (!podeGerenciarConexao(context)) {
    throw new HttpsError("permission-denied", "Permissão insuficiente para gerenciar o WhatsApp.");
  }
}

function timestampMillis(value) {
  if (typeof value?.toMillis === "function") return value.toMillis();
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function safeAttemptResponse(data) {
  const registrationOutcome = ["unknown", "registered", "confirmed_not_registered", "not_required"]
    .includes(String(data.registrationOutcome || ""))
    ? String(data.registrationOutcome)
    : "";
  return {
    attemptId: String(data.attemptId || ""),
    status: String(data.status || "starting"),
    step: String(data.step || data.status || "starting"),
    mode: String(data.mode || "new"),
    connectionId: String(data.connectionId || ""),
    expiresAt: timestampMillis(data.expiresAt),
    supportCode: core.sanitizeSupportCode(data.correlationId),
    registrationOutcome,
    recoveryRequired: data.recoveryRequired === true,
    error: data.lastErrorCode ? core.publicError({ code: data.lastErrorCode }) : null
  };
}

function secretValue(config) {
  if (config.emulator) return "emulator-app-secret-not-persisted";
  return String(WHATSAPP_APP_SECRET.value() || "");
}

function buildConnectionId(ownerUid, phoneNumberId) {
  return `wac_${core.sha256(`${ownerUid}:${phoneNumberId}`).slice(0, 32)}`;
}

function randomPin() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

function physicalConnectionCount(newDocs, legacyData) {
  const countsTowardLimit = (entry) => entry && !["disconnected", "revoked"].includes(String(entry.status || ""));
  const activeNewDocs = (newDocs || []).filter(countsTowardLimit);
  const activeLegacy = countsTowardLimit(legacyData) ? legacyData : null;
  const ids = new Set(activeNewDocs.map((entry) => String(entry.phoneNumberId || "")).filter(Boolean));
  if (activeLegacy?.phoneNumberId) ids.add(String(activeLegacy.phoneNumberId));
  return ids.size || activeNewDocs.length + (activeLegacy ? 1 : 0);
}

function emulatorMeta() {
  return {
    async exchangeEmbeddedSignupCode() { return { accessToken: "emulator-access-token", expiresIn: 3600 }; },
    async debugToken() {
      return { data: { is_valid: true, app_id: "emulator-meta-app", scopes: META_PERMISSIONS, granular_scopes: [{ scope: "whatsapp_business_management", target_ids: ["900000000001"] }] } };
    },
    async getWaba({ wabaId }) { return { id: wabaId, name: "WABA Emulator" }; },
    async listPhoneNumbers() {
      return { data: [{ id: "900000000002", display_phone_number: "+55 11 97777-0000", verified_name: "Loja Emulator", quality_rating: "GREEN", status: "CONNECTED", name_status: "APPROVED" }] };
    },
    async getPhoneNumber({ phoneNumberId }) { return { id: phoneNumberId, display_phone_number: "+55 11 97777-0000", verified_name: "Loja Emulator", quality_rating: "GREEN", status: "CONNECTED", name_status: "APPROVED" }; },
    async subscribeWaba() { return { success: true }; },
    async registerPhone() { return { success: true }; },
    async listTemplates() { return { data: [] }; }
  };
}

function emulatorSecrets(ownerUid, connectionId) {
  const tokenId = core.sha256(`${ownerUid}:${connectionId}`).slice(0, 24);
  const pinId = core.sha256(`${ownerUid}:${connectionId}:pin`).slice(0, 24);
  return {
    token: { secretResource: `projects/demo-vide-hub/secrets/vide-whatsapp-token-${tokenId}`, versionResource: `projects/demo-vide-hub/secrets/vide-whatsapp-token-${tokenId}/versions/1` },
    pin: { secretResource: `projects/demo-vide-hub/secrets/vide-whatsapp-pin-${pinId}`, versionResource: `projects/demo-vide-hub/secrets/vide-whatsapp-pin-${pinId}/versions/1` }
  };
}

async function updateAttempt(db, attemptId, patch) {
  await db.doc(`${COLLECTIONS.ONBOARDING_ATTEMPTS}/${attemptId}`).set({
    ...patch,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
}

async function failAttempt(db, attempt, error) {
  const publicFailure = core.publicError(error);
  const requiresAction = ["ASSET_AMBIGUOUS", "REGISTRATION_OUTCOME_UNKNOWN"].includes(publicFailure.code);
  await db.runTransaction(async (tx) => {
    const attemptRef = db.doc(`${COLLECTIONS.ONBOARDING_ATTEMPTS}/${attempt.attemptId}`);
    const lockRef = db.doc(`${COLLECTIONS.ONBOARDING_LOCKS}/${attempt.ownerUid}`);
    tx.set(attemptRef, {
      status: requiresAction ? "requires_action" : "failed",
      step: requiresAction ? "requires_action" : "failed",
      lastErrorCode: publicFailure.code,
      lastErrorMessageSanitized: publicFailure.message,
      recoveryRequired: requiresAction,
      finishedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    tx.set(lockRef, requiresAction
      ? { activeAttemptId: attempt.attemptId, recoveryRequired: true, updatedAt: FieldValue.serverTimestamp() }
      : { activeAttemptId: "", recoveryRequired: false, expiresAt: Timestamp.fromMillis(0), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  logger.error("whatsapp.onboarding.failed", core.redactForLog({
    correlationId: attempt.correlationId,
    attemptId: attempt.attemptId,
    ownerUid: attempt.ownerUid,
    step: attempt.step,
    code: publicFailure.code
  }));
  return publicFailure;
}

const whatsappStartOnboarding = onCall(APP_CHECK_OPTIONS, async (request) => {
  const context = await resolveCallerContext(request);
  requireManage(context);

  await assertRateLimit({
    scope: "whatsappStartOnboarding",
    identifier: identificadorRateLimit("auth", context.authUid),
    max: RATE_LIMITS.ONBOARDING_START_PER_MIN
  });

  const config = readWhatsappPublicConfig();
  const availability = availabilityForContext(context, config);
  if (!availability.available) {
    throw new HttpsError("failed-precondition", core.publicError({ code: "PLATFORM_CONFIGURATION_MISSING" }).message, { reason: availability.reason });
  }
  const requestOrigin = core.sanitizeOrigin(request.rawRequest?.headers?.origin);
  if (!originAllowed(requestOrigin, config)) {
    throw new HttpsError("permission-denied", "Esta origem não está autorizada a iniciar a conexão do WhatsApp.");
  }

  const providerMode = String(request.data?.providerMode || "official_cloud");
  if (providerMode !== "official_cloud" && !(providerMode === "official_coexistence" && config.flags.coexistence)) {
    throw new HttpsError("failed-precondition", "Este tipo de conexão ainda não está disponível.");
  }
  const mode = request.data?.mode === "reconnect" ? "reconnect" : "new";
  const reconnectConnectionId = String(request.data?.connectionId || "").trim().slice(0, 120);
  if (mode === "reconnect" && (!config.flags.reconnect || !reconnectConnectionId)) {
    throw new HttpsError("invalid-argument", "Informe uma conexão válida para reconectar.");
  }
  const idempotencyKey = core.normalizeIdempotencyKey(request.data?.idempotencyKey);
  if (!idempotencyKey) throw new HttpsError("invalid-argument", "Não foi possível iniciar a conexão com segurança. Atualize a página e tente novamente.");

  const db = getFirestore();
  const now = Date.now();
  const expiresAt = now + core.ATTEMPT_TTL_MS;
  const identity = core.createAttemptIdentity({
    appSecret: secretValue(config),
    ownerUid: context.ownerUid,
    authUid: context.authUid,
    idempotencyKey,
    expiresAt
  });
  const attemptRef = db.doc(`${COLLECTIONS.ONBOARDING_ATTEMPTS}/${identity.attemptId}`);
  const lockRef = db.doc(`${COLLECTIONS.ONBOARDING_LOCKS}/${context.ownerUid}`);
  let reused = false;
  let responseIdentity = identity;
  let responseExpiresAt = expiresAt;
  let responseCorrelationId = "";
  await db.runTransaction(async (tx) => {
    const [attemptSnap, lockSnap, newSnap, legacySnap] = await Promise.all([
      tx.get(attemptRef),
      tx.get(lockRef),
      tx.get(db.collection(COLLECTIONS.CONNECTIONS).where("ownerUid", "==", context.ownerUid).where("connectionVersion", "==", CONNECTION_VERSION_MULTI)),
      tx.get(db.doc(`${COLLECTIONS.CONNECTIONS}/${context.ownerUid}`))
    ]);

    if (attemptSnap.exists) {
      const existing = attemptSnap.data() || {};
      if (existing.ownerUid !== context.ownerUid || existing.initiatedByUid !== context.authUid || timestampMillis(existing.expiresAt) <= now || existing.status !== "awaiting_meta") {
        throw new HttpsError("failed-precondition", "Esta tentativa não pode mais ser reutilizada.");
      }
      if (existing.origin !== requestOrigin) throw new HttpsError("permission-denied", "A origem da tentativa não corresponde à página atual.");
      responseExpiresAt = timestampMillis(existing.expiresAt);
      responseCorrelationId = core.sanitizeSupportCode(existing.correlationId);
      responseIdentity = core.createAttemptIdentity({
        appSecret: secretValue(config),
        ownerUid: context.ownerUid,
        authUid: context.authUid,
        idempotencyKey,
        expiresAt: responseExpiresAt
      });
      reused = true;
      return;
    }

    const lock = lockSnap.exists ? lockSnap.data() || {} : {};
    if (lock.activeAttemptId && lock.recoveryRequired === true) {
      throw new HttpsError("failed-precondition", "Existe uma tentativa que requer análise segura antes de iniciar outra conexão.");
    }
    if (lock.activeAttemptId && timestampMillis(lock.expiresAt) > now && lock.activeAttemptId !== identity.attemptId) {
      throw new HttpsError("already-exists", "Já existe uma conexão sendo preparada para esta loja.");
    }

    const newConnections = newSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const legacy = legacySnap.exists && legacySnap.data()?.connectionVersion !== CONNECTION_VERSION_MULTI ? legacySnap.data() || {} : null;
    const currentConnectionCount = physicalConnectionCount(newConnections, legacy);
    if (mode === "new" && currentConnectionCount > 0 && !config.flags.secondConnection) {
      throw new HttpsError("failed-precondition", "A segunda conexão ainda não está disponível para esta loja.");
    }
    if (mode === "new" && currentConnectionCount >= MAX_CONNECTIONS_PER_OWNER) {
      throw new HttpsError("resource-exhausted", core.publicError({ code: "CONNECTION_LIMIT" }).message);
    }
    if (mode === "reconnect") {
      const target = newConnections.find((entry) => entry.id === reconnectConnectionId);
      if (!target) throw new HttpsError("not-found", "Conexão não encontrada para esta loja.");
    }

    const correlationId = core.createCorrelationId();
    responseCorrelationId = correlationId;
    tx.create(attemptRef, {
      attemptId: identity.attemptId,
      ownerUid: context.ownerUid,
      tenantId: context.ownerUid,
      initiatedByUid: context.authUid,
      initiatedByRole: context.role,
      providerMode,
      mode,
      reconnectConnectionId: mode === "reconnect" ? reconnectConnectionId : "",
      status: "awaiting_meta",
      step: "awaiting_meta",
      stateHash: identity.stateHash,
      idempotencyHash: identity.idempotencyHash,
      correlationId,
      origin: requestOrigin,
      flowVersion: 1,
      graphVersion: WHATSAPP_GRAPH_VERSION,
      expiresAt: Timestamp.fromMillis(expiresAt),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    tx.set(lockRef, { activeAttemptId: identity.attemptId, recoveryRequired: false, expiresAt: Timestamp.fromMillis(expiresAt), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });

  const response = {
    ok: true,
    reused,
    onboardingAttemptId: responseIdentity.attemptId,
    state: responseIdentity.state,
    appId: config.appId,
    configurationId: config.configurationId,
    graphVersion: config.graphVersion,
    locale: config.locale,
    providerMode,
    expiresAt: responseExpiresAt,
    emulatorMock: config.emulator
  };
  await writeAudit({ ownerUid: context.ownerUid, authUid: context.authUid, module: "whatsapp", targetId: identity.attemptId, action: "whatsapp.onboarding_iniciado", risk: "high", summary: "Onboarding oficial do WhatsApp iniciado.", source: "function", correlationId: responseCorrelationId, origin: requestOrigin, code: reused ? "REUSED" : "STARTED" });
  return response;
});

const whatsappCompleteOnboarding = onCall(APP_CHECK_OPTIONS, async (request) => {
  const context = await resolveCallerContext(request);
  requireManage(context);
  await assertRateLimit({ scope: "whatsappCompleteOnboarding", identifier: identificadorRateLimit("auth", context.authUid), max: RATE_LIMITS.ONBOARDING_COMPLETE_PER_MIN });

  const attemptId = core.sanitizeSupportCode(request.data?.onboardingAttemptId);
  const state = String(request.data?.state || "");
  const code = core.validateAuthorizationCode(request.data?.code);
  const session = core.sanitizeSessionInfo(request.data?.sessionInfo);
  if (!attemptId || !state || !code) throw new HttpsError("invalid-argument", "A resposta da Meta está incompleta. Inicie novamente.");

  const db = getFirestore();
  const attemptRef = db.doc(`${COLLECTIONS.ONBOARDING_ATTEMPTS}/${attemptId}`);
  let attempt;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(attemptRef);
    if (!snap.exists) throw new HttpsError("not-found", "Tentativa de conexão não encontrada.");
    attempt = { attemptId: snap.id, ...snap.data() };
    if (attempt.ownerUid !== context.ownerUid || (attempt.initiatedByUid !== context.authUid && !context.isAdmin)) throw new HttpsError("permission-denied", "Esta tentativa não pertence ao usuário atual.");
    const completionOrigin = core.sanitizeOrigin(request.rawRequest?.headers?.origin);
    if (attempt.origin && attempt.origin !== completionOrigin) throw new HttpsError("permission-denied", "A origem da tentativa não corresponde à página atual.");
    if (timestampMillis(attempt.expiresAt) <= Date.now()) {
      tx.set(attemptRef, { status: "expired", step: "expired", finishedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      throw new HttpsError("deadline-exceeded", "A tentativa expirou. Inicie novamente.");
    }
    if (attempt.status !== "awaiting_meta") throw new HttpsError("failed-precondition", "Esta tentativa já foi processada.");
    if (!core.verifyState(state, attempt.stateHash)) throw new HttpsError("permission-denied", "A validação de segurança da tentativa falhou.");
    tx.set(attemptRef, { status: "processing", step: "processing", processingAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });

  const config = readWhatsappPublicConfig();
  const provider = config.emulator ? emulatorMeta() : metaClient;
  let tokenSecretVersion = "";
  let pinSecretVersion = "";
  let phoneRegistered = false;
  let phoneRegistrationOutcome = "not_started";
  let connectionCommitted = false;
  let connectionId = "";
  let supersededCredentialVersions = [];
  let credentialCleanupPending = false;
  try {
    const appSecret = secretValue(config);
    await updateAttempt(db, attemptId, { status: "processing", step: "exchanging_code" });
    const tokenResult = await provider.exchangeEmbeddedSignupCode({ appId: config.appId, appSecret, code });
    const accessToken = tokenResult.accessToken;

    await updateAttempt(db, attemptId, { status: "discovering_assets", step: "discovering_assets" });
    const debug = await provider.debugToken({ appId: config.appId, appSecret, accessToken });
    const debugData = debug?.data || {};
    if (!debugData.is_valid) throw Object.assign(new Error("invalid_token"), { code: "TOKEN_REVOKED" });
    if (debugData.app_id && String(debugData.app_id) !== String(config.appId)) throw Object.assign(new Error("wrong_app"), { code: "TOKEN_REVOKED" });
    const scopes = new Set(Array.isArray(debugData.scopes) ? debugData.scopes : []);
    if (!META_PERMISSIONS.every((permission) => scopes.has(permission))) throw Object.assign(new Error("permissions_missing"), { code: "TOKEN_REVOKED" });

    const targetWabas = core.extractWabaTargets(debugData);
    const wabaId = core.selectVerifiedAsset({ candidates: targetWabas.length ? targetWabas : [session.wabaIdHint], hint: session.wabaIdHint, kind: "waba" });
    const waba = await provider.getWaba({ accessToken, wabaId });
    if (String(waba?.id || "") !== wabaId) throw Object.assign(new Error("waba_not_verified"), { code: "ASSET_NOT_FOUND" });
    const phoneList = await provider.listPhoneNumbers({ accessToken, wabaId });
    const phones = Array.isArray(phoneList?.data) ? phoneList.data : [];
    const phoneNumberId = core.selectVerifiedAsset({ candidates: phones, hint: session.phoneNumberIdHint, kind: "phone_number" });
    const phone = phones.find((entry) => String(entry.id) === phoneNumberId) || await provider.getPhoneNumber({ accessToken, phoneNumberId });

    connectionId = attempt.mode === "reconnect" ? attempt.reconnectConnectionId : buildConnectionId(context.ownerUid, phoneNumberId);
    const routeRef = db.doc(`${COLLECTIONS.PHONE_ROUTES}/${phoneNumberId}`);
    const routeSnap = await routeRef.get();
    if (routeSnap.exists) {
      const route = routeSnap.data() || {};
      if (route.ownerUid !== context.ownerUid || (route.connectionId && route.connectionId !== connectionId)) {
        throw Object.assign(new Error("route_conflict"), { code: "ROUTE_CONFLICT" });
      }
    }

    // Ciclo seguro do PIN (achado da revisão 2026-07-31): o número NUNCA é
    // registrado na Meta antes de o PIN já estar persistido no Secret
    // Manager. Ordem: gerar PIN -> criar versão protegida -> registrar
    // internamente a referência exata da versão (nunca o valor) -> só
    // então tentar registerPhone. Se a Meta provar que rejeitou a chamada,
    // a versão temporária pode ser desabilitada. Timeout, rede, 5xx ou erro
    // sem resposta confiável preservam a referência pendente e exigem ação
    // administrativa. Se registerPhone tiver sucesso, a versão
    // NUNCA é desabilitada por uma falha posterior de outra etapa — o
    // número já está de fato registrado na Meta com aquele PIN; descartar
    // o segredo criaria exatamente o cenário que esta correção evita
    // (número registrado, PIN perdido). Uma falha depois do registro vira
    // pendência recuperável (log + auditoria), nunca destruição do PIN.
    const mustRegister = ["PENDING", "UNREGISTERED"].includes(String(phone?.status || "").toUpperCase());
    let pin = "";
    if (mustRegister) {
      await updateAttempt(db, attemptId, { status: "registering", step: "registering" });
      pin = randomPin();
      if (config.emulator) {
        pinSecretVersion = emulatorSecrets(context.ownerUid, connectionId).pin.versionResource;
      } else {
        const pinSecret = await adicionarVersaoPinConexao({ ownerUid: context.ownerUid, connectionId, pin });
        pinSecretVersion = pinSecret.versionResource;
      }
      // Referência da versão registrada ANTES da chamada à Meta — nunca o
      // valor do PIN. Permite auditoria/recuperação administrativa mesmo
      // se a Function cair logo depois do registerPhone.
      await updateAttempt(db, attemptId, { pinSecretResourcePending: pinSecretVersion });
      let registerCallStarted = false;
      try {
        registerCallStarted = true;
        phoneRegistrationOutcome = "unknown";
        await provider.registerPhone({ accessToken, phoneNumberId, pin });
        phoneRegistered = true;
        phoneRegistrationOutcome = "registered";
      } catch (registerError) {
        const recovery = core.decideRegisterPhoneFailureRecovery({ callStarted: registerCallStarted, error: registerError });
        if (recovery === core.REGISTER_PHONE_FAILURE_RECOVERY.DISABLE_CONFIRMED_NOT_REGISTERED) {
          phoneRegistrationOutcome = "confirmed_not_registered";
          if (!config.emulator) await desabilitarVersaoRecurso(pinSecretVersion);
          pinSecretVersion = "";
          await updateAttempt(db, attemptId, {
            pinSecretResourcePending: "",
            registrationOutcome: "confirmed_not_registered",
            recoveryRequired: false
          });
          throw registerError;
        }

        phoneRegistrationOutcome = "unknown";
        const unknownError = Object.assign(new Error("registration_outcome_unknown"), {
          code: "REGISTRATION_OUTCOME_UNKNOWN",
          registrationOutcome: "unknown",
          recoveryRequired: true
        });
        try {
          await updateAttempt(db, attemptId, {
            connectionId,
            phoneNumberId,
            registrationOutcome: "unknown",
            recoveryRequired: true,
            lastErrorCode: "REGISTRATION_OUTCOME_UNKNOWN"
          });
        } catch {
          logger.error("whatsapp.onboarding.registration_recovery_state_write_failed", {
            correlationId: attempt.correlationId,
            attemptId,
            ownerUid: context.ownerUid,
            connectionId
          });
        }
        throw unknownError;
      }
      await updateAttempt(db, attemptId, { registrationOutcome: "registered", recoveryRequired: false });
      pin = ""; // nunca mais precisa do valor em memória depois do registro
    }

    // Decisão (docs/meta-whatsapp/security-model.md#assinatura-da-waba-webhook):
    // subscribeWaba é tratada como operação idempotente da plataforma e
    // NUNCA é desfeita automaticamente por uma falha posterior — uma WABA
    // pode ser compartilhada entre conexões/tentativas e não há como
    // provar exclusividade da inscrição com segurança. Desinscrever aqui
    // arriscaria interromper mensagens válidas de outra conexão.
    await updateAttempt(db, attemptId, { status: "subscribing_webhook", step: "subscribing_webhook" });
    await provider.subscribeWaba({ accessToken, wabaId });

    await updateAttempt(db, attemptId, { status: "saving_secret", step: "saving_secret" });
    if (config.emulator) {
      tokenSecretVersion = emulatorSecrets(context.ownerUid, connectionId).token.versionResource;
    } else {
      const tokenSecret = await adicionarVersaoTokenConexao({ ownerUid: context.ownerUid, connectionId, tokenValue: accessToken });
      tokenSecretVersion = tokenSecret.versionResource;
    }

    await updateAttempt(db, attemptId, { status: "creating_route", step: "creating_route", connectionId });
    await db.runTransaction(async (tx) => {
      const connectionRef = db.doc(`${COLLECTIONS.CONNECTIONS}/${connectionId}`);
      const lockRef = db.doc(`${COLLECTIONS.ONBOARDING_LOCKS}/${context.ownerUid}`);
      const [connectionSnap, currentRouteSnap, allSnap, legacySnap, latestAttemptSnap] = await Promise.all([
        tx.get(connectionRef),
        tx.get(routeRef),
        tx.get(db.collection(COLLECTIONS.CONNECTIONS).where("ownerUid", "==", context.ownerUid).where("connectionVersion", "==", CONNECTION_VERSION_MULTI)),
        tx.get(db.doc(`${COLLECTIONS.CONNECTIONS}/${context.ownerUid}`)),
        tx.get(attemptRef)
      ]);
      const latestAttempt = latestAttemptSnap.data() || {};
      if (!["creating_route", "saving_secret", "subscribing_webhook"].includes(latestAttempt.status)) throw new HttpsError("aborted", "A tentativa mudou de estado durante a conclusão.");
      const currentRoute = currentRouteSnap.exists ? currentRouteSnap.data() || {} : null;
      if (currentRoute && (currentRoute.ownerUid !== context.ownerUid || (currentRoute.connectionId && currentRoute.connectionId !== connectionId))) {
        throw Object.assign(new Error("route_conflict"), { code: "ROUTE_CONFLICT" });
      }
      const all = allSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      const legacy = legacySnap.exists && legacySnap.data()?.connectionVersion !== CONNECTION_VERSION_MULTI ? legacySnap.data() || {} : null;
      if (!connectionSnap.exists && physicalConnectionCount(all, legacy) >= MAX_CONNECTIONS_PER_OWNER) {
        throw Object.assign(new Error("connection_limit"), { code: "CONNECTION_LIMIT" });
      }
      const previous = connectionSnap.exists ? connectionSnap.data() || {} : {};
      if (attempt.mode === "reconnect" && previous.phoneNumberId && previous.phoneNumberId !== phoneNumberId) {
        throw Object.assign(new Error("reconnect_phone_mismatch"), { code: "ASSET_NOT_FOUND" });
      }
      const hasDefault = all.some((entry) => entry.id !== connectionId && entry.isDefault === true);
      supersededCredentialVersions = attempt.mode === "reconnect"
        ? core.supersededCredentialVersions(previous, { tokenSecretResource: tokenSecretVersion, pinSecretResource: pinSecretVersion })
        : [];
      tx.set(connectionRef, {
        ownerUid: context.ownerUid,
        tenantId: context.ownerUid,
        connectionId,
        connectionVersion: CONNECTION_VERSION_MULTI,
        schemaVersion: 3,
        provider: "meta_cloud_api",
        providerMode: attempt.providerMode,
        onboardingMode: "embedded_signup",
        onboardingAttemptId: attemptId,
        label: previous.label || phone?.verified_name || "Atendimento principal",
        status: "connected",
        isDefault: previous.isDefault === true || !hasDefault,
        wabaId,
        phoneNumberId,
        displayPhoneNumber: String(phone?.display_phone_number || "").slice(0, 40),
        verifiedName: String(phone?.verified_name || "").slice(0, 160),
        qualityRating: String(phone?.quality_rating || "").slice(0, 40),
        messagingLimitTier: String(phone?.messaging_limit_tier || "").slice(0, 60),
        nameStatus: String(phone?.name_status || "").slice(0, 60),
        webhookSubscribed: true,
        graphVersion: WHATSAPP_GRAPH_VERSION,
        tokenSecretResource: tokenSecretVersion,
        ...(pinSecretVersion ? { pinSecretResource: pinSecretVersion } : {}),
        createdByUid: previous.createdByUid || context.authUid,
        updatedByUid: context.authUid,
        createdAt: previous.createdAt || FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        lastValidatedAt: FieldValue.serverTimestamp(),
        lastErrorCode: "",
        credentialCleanupPending: false,
        credentialRotatedAt: attempt.mode === "reconnect" ? FieldValue.serverTimestamp() : null
      }, { merge: true });
      tx.set(routeRef, {
        phoneNumberId,
        ownerUid: context.ownerUid,
        tenantId: context.ownerUid,
        connectionId,
        active: true,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: currentRoute?.createdAt || FieldValue.serverTimestamp()
      }, { merge: true });
      tx.set(attemptRef, { status: "syncing_templates", step: "syncing_templates", connectionId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      tx.set(lockRef, { activeAttemptId: "", expiresAt: Timestamp.fromMillis(0), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
    connectionCommitted = true;

    if (!config.emulator && supersededCredentialVersions.length) {
      const cleanup = await Promise.allSettled(supersededCredentialVersions.map((resource) => desabilitarVersaoRecurso(resource)));
      credentialCleanupPending = cleanup.some((result) => result.status === "rejected");
      if (credentialCleanupPending) {
        try {
          await db.doc(`${COLLECTIONS.CONNECTIONS}/${connectionId}`).set({ credentialCleanupPending: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        } catch {
          logger.error("whatsapp.onboarding.credential_cleanup_status_failed", { correlationId: attempt.correlationId, attemptId, ownerUid: context.ownerUid, connectionId });
        }
      }
    }

    let templateWarning = "";
    try {
      const templates = await provider.listTemplates({ accessToken, wabaId });
      const templateItems = Array.isArray(templates?.data) ? templates.data : [];
      const batch = db.batch();
      for (const template of templateItems) {
        if (!template?.id) continue;
        batch.set(
          db.doc(`${COLLECTIONS.TEMPLATES}/${context.ownerUid}_${template.id}`),
          { ...normalizarTemplateMeta(context.ownerUid, wabaId, template), connectionId, phoneNumberId },
          { merge: true }
        );
      }
      if (templateItems.length) await batch.commit();
      const total = templateItems.length;
      await db.doc(`${COLLECTIONS.CONNECTIONS}/${connectionId}`).set({
        templateSyncStatus: "synced",
        templateCount: total,
        lastTemplateSyncAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (error) {
      templateWarning = "template_sync_pending";
      await db.doc(`${COLLECTIONS.CONNECTIONS}/${connectionId}`).set({ templateSyncStatus: "failed", lastTemplateSyncErrorCode: core.sanitizeSupportCode(error?.code), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }

    const credentialWarning = credentialCleanupPending ? "credential_cleanup_pending" : "";
    await updateAttempt(db, attemptId, { status: "connected", step: "connected", connectionId, templateWarning, credentialWarning, finishedAt: FieldValue.serverTimestamp(), lastErrorCode: "", pinSecretResourcePending: "", registrationOutcome: phoneRegistered ? "registered" : "not_required", recoveryRequired: false });
    await writeAudit({ ownerUid: context.ownerUid, authUid: context.authUid, module: "whatsapp", targetId: connectionId, action: attempt.mode === "reconnect" ? "whatsapp.reconexao_concluida" : "whatsapp.onboarding_concluido", risk: "high", summary: attempt.mode === "reconnect" ? "Reconexão oficial do WhatsApp concluída." : "Conexão oficial do WhatsApp concluída.", source: "function", correlationId: attempt.correlationId, origin: attempt.origin, code: credentialWarning || templateWarning || "CONNECTED" });
    logger.info("whatsapp.onboarding.connected", { correlationId: attempt.correlationId, attemptId, ownerUid: context.ownerUid, connectionId, templateWarning, credentialCleanupPending });
    return { ok: true, status: "connected", connectionId, templateWarning, credentialWarning, supportCode: attempt.correlationId };
  } catch (error) {
    if (!connectionCommitted && !config.emulator) {
      // tokenSecretVersion nunca corresponde a uma ação irreversível na
      // Meta — sempre seguro desabilitar se a conexão não foi commitada.
      // pinSecretVersion só é desabilitado aqui se registerPhone NUNCA
      // teve sucesso (o bloco de registro já limpa e zera a variável
      // quando a própria chamada à Meta falha). Se phoneRegistered=true e
      // uma etapa POSTERIOR falhou, o número já está registrado na Meta
      // com aquele PIN — descartar o segredo aqui reproduziria o exato
      // cenário que esta correção evita. Vira pendência recuperável,
      // nunca um segredo destruído.
      const pinCleanup = core.decidePinSecretCleanup({ pinSecretVersion, phoneRegistered, registrationOutcome: phoneRegistrationOutcome });
      const cleanups = [tokenSecretVersion && desabilitarVersaoRecurso(tokenSecretVersion)];
      if (pinCleanup === "disable") cleanups.push(desabilitarVersaoRecurso(pinSecretVersion));
      await Promise.allSettled(cleanups.filter(Boolean));
      if (pinCleanup === "preserve_pending_recovery") {
        logger.error("whatsapp.onboarding.phone_registered_connection_incomplete", core.redactForLog({
          correlationId: attempt.correlationId,
          attemptId,
          ownerUid: context.ownerUid,
          connectionId,
          registrationOutcome: phoneRegistrationOutcome,
          recoveryRequired: true,
          note: "Numero registrado na Meta com PIN preservado, mas a conexao nao foi concluida. Requer recuperacao administrativa (nao reexecutar registerPhone)."
        }));
      }
    }
    const failure = await failAttempt(db, { ...attempt, step: "complete" }, error);
    await writeAudit({ ownerUid: context.ownerUid, authUid: context.authUid, module: "whatsapp", targetId: attemptId, action: "whatsapp.onboarding_falhou", risk: "high", summary: `Onboarding do WhatsApp não concluído (${failure.code}).`, source: "function", ok: false, correlationId: attempt.correlationId, origin: attempt.origin, code: failure.code });
    throw new HttpsError("failed-precondition", failure.message, { code: failure.code, supportCode: attempt.correlationId });
  }
});

const whatsappGetOnboardingStatus = onCall({ region: REGION, enforceAppCheck: shouldEnforceAppCheck() }, async (request) => {
  const context = await resolveCallerContext(request);
  requireManage(context);
  await assertRateLimit({ scope: "whatsappGetOnboardingStatus", identifier: identificadorRateLimit("auth", context.authUid), max: RATE_LIMITS.ONBOARDING_STATUS_PER_MIN });
  const attemptId = core.sanitizeSupportCode(request.data?.onboardingAttemptId);
  const snap = await getFirestore().doc(`${COLLECTIONS.ONBOARDING_ATTEMPTS}/${attemptId}`).get();
  if (!snap.exists) throw new HttpsError("not-found", "Tentativa não encontrada.");
  const data = { attemptId: snap.id, ...snap.data() };
  if (data.ownerUid !== context.ownerUid || (data.initiatedByUid !== context.authUid && !context.isAdmin)) throw new HttpsError("permission-denied", "Tentativa não disponível.");
  return { ok: true, ...safeAttemptResponse(data) };
});

const whatsappCancelOnboarding = onCall({ region: REGION, enforceAppCheck: shouldEnforceAppCheck() }, async (request) => {
  const context = await resolveCallerContext(request);
  requireManage(context);
  const attemptId = core.sanitizeSupportCode(request.data?.onboardingAttemptId);
  const db = getFirestore();
  const attemptRef = db.doc(`${COLLECTIONS.ONBOARDING_ATTEMPTS}/${attemptId}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(attemptRef);
    if (!snap.exists) return;
    const data = snap.data() || {};
    if (data.ownerUid !== context.ownerUid || data.initiatedByUid !== context.authUid) throw new HttpsError("permission-denied", "Tentativa não disponível.");
    if (!["starting", "awaiting_meta"].includes(data.status)) throw new HttpsError("failed-precondition", "Esta tentativa já está sendo processada e não pode ser cancelada agora.");
    tx.set(attemptRef, { status: "cancelled", step: "cancelled", lastErrorCode: "POPUP_CANCELLED", finishedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(db.doc(`${COLLECTIONS.ONBOARDING_LOCKS}/${context.ownerUid}`), { activeAttemptId: "", expiresAt: Timestamp.fromMillis(0), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  await writeAudit({ ownerUid: context.ownerUid, authUid: context.authUid, module: "whatsapp", targetId: attemptId, action: "whatsapp.onboarding_cancelado", risk: "medium", summary: "Onboarding do WhatsApp cancelado antes da conclusão.", source: "function", correlationId: core.createCorrelationId("wacancel"), origin: core.sanitizeOrigin(request.rawRequest?.headers?.origin), code: "CANCELLED" });
  return { ok: true, status: "cancelled" };
});

module.exports = {
  whatsappStartOnboarding,
  whatsappCompleteOnboarding,
  whatsappGetOnboardingStatus,
  whatsappCancelOnboarding,
  buildConnectionId,
  physicalConnectionCount,
  safeAttemptResponse
};
