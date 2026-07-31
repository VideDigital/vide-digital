"use strict";

const crypto = require("crypto");

const ATTEMPT_TTL_MS = 15 * 60 * 1000;
const MAX_CODE_LENGTH = 4096;
const ONBOARDING_STATUSES = Object.freeze([
  "starting",
  "awaiting_meta",
  "processing",
  "discovering_assets",
  "registering",
  "subscribing_webhook",
  "saving_secret",
  "creating_route",
  "validating",
  "syncing_templates",
  "connected",
  "failed",
  "cancelled",
  "expired",
  "requires_action"
]);
const TERMINAL_STATUSES = new Set(["connected", "failed", "cancelled", "expired", "requires_action"]);
const SENSITIVE_KEY = /(token|secret|authorization|app.?secret|pin|code(?!$))/i;

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function createCorrelationId(prefix = "wa") {
  const safePrefix = String(prefix || "wa").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 16) || "wa";
  return `${safePrefix}_${crypto.randomBytes(12).toString("hex")}`;
}

function sanitizeOrigin(value) {
  try {
    const parsed = new URL(String(value || ""));
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.origin.slice(0, 240) : "";
  } catch {
    return "";
  }
}

function hmac(secret, value) {
  return crypto.createHmac("sha256", String(secret || "")).update(String(value || ""), "utf8").digest("base64url");
}

function timingSafeEqualText(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function normalizeIdempotencyKey(value) {
  const key = String(value || "").trim();
  return /^[A-Za-z0-9_-]{20,120}$/.test(key) ? key : "";
}

function createAttemptIdentity({ appSecret, ownerUid, authUid, idempotencyKey, expiresAt }) {
  const key = normalizeIdempotencyKey(idempotencyKey);
  if (!appSecret || !ownerUid || !authUid || !key || !Number.isFinite(expiresAt)) {
    throw new Error("invalid-onboarding-identity-input");
  }
  const attemptDigest = hmac(appSecret, `attempt:${ownerUid}:${authUid}:${key}`);
  const attemptId = `waon_${attemptDigest.slice(0, 36)}`;
  const state = hmac(appSecret, `state:${attemptId}:${ownerUid}:${authUid}:${expiresAt}`);
  return Object.freeze({ attemptId, state, stateHash: sha256(state), idempotencyHash: sha256(key) });
}

function verifyState(state, expectedHash) {
  const normalized = String(state || "");
  if (normalized.length < 32 || normalized.length > 180) return false;
  return timingSafeEqualText(sha256(normalized), expectedHash);
}

function normalizeNumericId(value) {
  const id = String(value || "").trim();
  return /^\d{5,40}$/.test(id) ? id : "";
}

function sanitizeSessionInfo(value) {
  const source = value && typeof value === "object" ? value : {};
  return Object.freeze({
    wabaIdHint: normalizeNumericId(source.waba_id || source.wabaId),
    phoneNumberIdHint: normalizeNumericId(source.phone_number_id || source.phoneNumberId),
    businessIdHint: normalizeNumericId(source.business_id || source.businessId)
  });
}

function extractWabaTargets(debugToken) {
  const granular = Array.isArray(debugToken?.granular_scopes) ? debugToken.granular_scopes : [];
  const targets = granular
    .filter((scope) => scope?.scope === "whatsapp_business_management")
    .flatMap((scope) => Array.isArray(scope.target_ids) ? scope.target_ids : [])
    .map(normalizeNumericId)
    .filter(Boolean);
  return Array.from(new Set(targets));
}

function selectVerifiedAsset({ candidates, hint, kind }) {
  const ids = Array.from(new Set((Array.isArray(candidates) ? candidates : []).map((candidate) => normalizeNumericId(candidate?.id || candidate)).filter(Boolean)));
  const normalizedHint = normalizeNumericId(hint);
  if (normalizedHint && ids.includes(normalizedHint)) return normalizedHint;
  if (ids.length === 1) return ids[0];
  const error = new Error(ids.length === 0 ? `${kind}_not_found` : `${kind}_ambiguous`);
  error.code = ids.length === 0 ? "ASSET_NOT_FOUND" : "ASSET_AMBIGUOUS";
  throw error;
}

function validateAuthorizationCode(value) {
  const code = String(value || "").trim();
  return code.length >= 8 && code.length <= MAX_CODE_LENGTH && !/[\u0000-\u001f]/.test(code) ? code : "";
}

function sanitizeLabel(value) {
  const label = String(value || "").replace(/[<>\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim();
  return label.length >= 2 && label.length <= 60 ? label : "";
}

function sanitizeQrInput({ label, message } = {}) {
  const safeLabel = sanitizeLabel(label);
  const safeMessage = String(message || "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
  if (!safeLabel) throw Object.assign(new Error("qr_label_invalid"), { code: "INVALID_LABEL" });
  if (safeMessage.length < 1 || safeMessage.length > 320) {
    throw Object.assign(new Error("qr_message_invalid"), { code: "INVALID_MESSAGE" });
  }
  return Object.freeze({ label: safeLabel, message: safeMessage });
}

function sanitizeSupportCode(value) {
  return String(value || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
}

function supersededCredentialVersions(previous = {}, current = {}) {
  const exactVersion = /^projects\/[^/]+\/secrets\/[^/]+\/versions\/\d+$/;
  return [
    [previous.tokenSecretResource, current.tokenSecretResource],
    [previous.pinSecretResource, current.pinSecretResource]
  ]
    .filter(([oldResource, newResource]) => exactVersion.test(String(oldResource || "")) && oldResource !== newResource)
    .map(([oldResource]) => oldResource);
}

// Decisão pura do ciclo seguro do PIN (revisão 2026-07-31): dado que uma
// tentativa de onboarding falhou ANTES da conexão ser commitada, decide o
// que fazer com a versão temporária do PIN no Secret Manager. Extraída
// como função pura (mesmo espírito de avaliarConexao/decidirAtualizacaoStatus
// em send.js/webhook.js) para poder testar a decisão sem precisar de
// Firestore/Secret Manager reais. Nunca decide destruir o segredo quando o
// número já foi registrado na Meta com aquele PIN — só quando o registro
// nunca aconteceu (ou o registro em si já limpou a variável antes de
// chegar aqui, ver whatsappCompleteOnboarding).
const REGISTER_PHONE_FAILURE_RECOVERY = Object.freeze({
  DISABLE_CONFIRMED_NOT_REGISTERED: "disable_pin_confirmed_not_registered",
  PRESERVE_REGISTRATION_UNKNOWN: "preserve_pin_registration_unknown"
});

// A chamada de registro não é idempotente do ponto de vista do PIN. Uma
// exceção de transporte só informa que a resposta não chegou; ela não prova
// que a Meta deixou de aplicar o registro. Por isso, qualquer dúvida preserva
// a versão pendente. A limpeza só é permitida antes de a chamada começar ou
// quando o adaptador da Meta marca explicitamente uma resposta como rejeição
// definitiva e verificada.
function decideRegisterPhoneFailureRecovery({ callStarted = false, error } = {}) {
  const confirmedNotRegistered = error?.registrationOutcome === "confirmed_not_registered"
    && error?.registrationOutcomeVerified === true;
  return !callStarted || confirmedNotRegistered
    ? REGISTER_PHONE_FAILURE_RECOVERY.DISABLE_CONFIRMED_NOT_REGISTERED
    : REGISTER_PHONE_FAILURE_RECOVERY.PRESERVE_REGISTRATION_UNKNOWN;
}

function decidePinSecretCleanup({ pinSecretVersion, registrationOutcome, phoneRegistered }) {
  if (!pinSecretVersion) return "none";
  const outcome = registrationOutcome || (phoneRegistered ? "registered" : "not_started");
  return ["registered", "unknown"].includes(outcome) ? "preserve_pending_recovery" : "disable";
}

function publicError(error) {
  const code = sanitizeSupportCode(error?.code) || "INTERNAL";
  const mapping = {
    ASSET_NOT_FOUND: "A Meta não compartilhou uma conta ou número compatível com esta conexão.",
    ASSET_AMBIGUOUS: "A Meta retornou mais de uma opção e não foi possível confirmar com segurança qual foi escolhida.",
    REGISTRATION_OUTCOME_UNKNOWN: "A Meta não confirmou se o número foi registrado. A tentativa foi preservada para análise segura.",
    ROUTE_CONFLICT: "Este número já está conectado a outra loja.",
    CONNECTION_LIMIT: "Sua loja já possui o limite de duas conexões.",
    TOKEN_REVOKED: "A Meta informou que a autorização não é mais válida.",
    WHATSAPP_RATE_LIMITED: "A Meta limitou temporariamente as solicitações. Tente novamente em alguns minutos.",
    POPUP_CANCELLED: "A conexão foi cancelada antes de terminar. Nenhuma alteração foi feita.",
    PLATFORM_CONFIGURATION_MISSING: "A integração ainda está sendo preparada para novos clientes. Suas conexões atuais continuam funcionando."
  };
  return Object.freeze({
    code,
    message: mapping[code] || "Não foi possível concluir a conexão agora. Tente novamente em alguns minutos."
  });
}

function redactForLog(value, depth = 0) {
  if (depth > 5) return "[TRUNCATED]";
  if (Array.isArray(value)) return value.slice(0, 25).map((item) => redactForLog(item, depth + 1));
  if (!value || typeof value !== "object") return typeof value === "string" ? value.slice(0, 240) : value;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = SENSITIVE_KEY.test(key) ? "[REDACTED]" : redactForLog(item, depth + 1);
  }
  return result;
}

module.exports = {
  ATTEMPT_TTL_MS,
  MAX_CODE_LENGTH,
  ONBOARDING_STATUSES,
  REGISTER_PHONE_FAILURE_RECOVERY,
  TERMINAL_STATUSES,
  createCorrelationId,
  createAttemptIdentity,
  decideRegisterPhoneFailureRecovery,
  decidePinSecretCleanup,
  extractWabaTargets,
  normalizeIdempotencyKey,
  normalizeNumericId,
  publicError,
  redactForLog,
  sanitizeLabel,
  sanitizeOrigin,
  sanitizeQrInput,
  sanitizeSessionInfo,
  sanitizeSupportCode,
  supersededCredentialVersions,
  selectVerifiedAsset,
  sha256,
  validateAuthorizationCode,
  verifyState
};
