"use strict";

// Telemetria de erros do frontend (VIDE-HUB-FRONTEND-ERROR-TELEMETRY-071).
//
// browser → reporter central sanitizado (frontend-error-reporter-core.js)
//         → reportFrontendError (esta Function) → Cloud Logging / Error Reporting
//
// O cliente sanitiza antes de enviar, mas NÃO é fronteira de segurança: esta
// Function repete toda a sanitização, aceita só a allowlist de campos técnicos
// e nunca loga o payload recebido, o IP nem o objeto de Auth.
//
// Multi-tenant: a identidade vem exclusivamente de request.auth. O schema não
// aceita uid/ownerUid/storeUid/tenantId — qualquer campo fora da allowlist é
// descartado. Nenhum tenant é resolvido aqui: o log não precisa dele.

const crypto = require("node:crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const { assertRateLimit, callerIp } = require("../shared/rateLimit");

const FRONTEND_ERROR_MARKER = "FRONTEND_ERROR";
const RATE_LIMIT_SCOPE = "reportFrontendError";
// Por usuário autenticado ou por IP pseudonimizado, na janela de 60 s do
// assertRateLimit. O cliente já limita a ~10 eventos por página; este teto
// só segura abuso direto do endpoint.
const RATE_LIMIT_MAX = 20;
const MAX_PAYLOAD_BYTES = 8192;

const LIMITS = Object.freeze({
  name: 80,
  code: 80,
  message: 300,
  source: 200,
  route: 200,
  release: 64,
  stackLines: 20,
  stackLine: 300,
  stackTotal: 4000,
  maxLineNumber: 10000000
});

const ALLOWED_FIELDS = Object.freeze([
  "type", "category", "name", "code", "message", "stack",
  "source", "line", "column", "route", "release"
]);
const TYPES = new Set(["error", "unhandledrejection", "operational"]);
const CATEGORIES = new Set([
  "global", "bootstrap", "store-load", "lp-init",
  "orders-listener", "orders-module", "orders-legacy"
]);

// Mesma lista do cliente (frontend-error-reporter-core.js): erros esperados
// de validação, autenticação, permissão, rede/offline, cancelamento e regra
// de negócio nunca viram incidente — repetida aqui porque o cliente não é
// confiável.
const EXPECTED_CODES = new Set([
  "invalid-argument", "invalid-email", "invalid-credential", "invalid-login-credentials",
  "wrong-password", "user-not-found", "weak-password", "email-already-in-use", "user-disabled",
  "popup-closed-by-user", "popup-blocked", "cancelled-popup-request", "too-many-requests",
  "network-request-failed", "permission-denied", "unauthenticated", "unavailable",
  "deadline-exceeded", "resource-exhausted", "already-exists", "failed-precondition",
  "cancelled", "aborted"
]);
const EXPECTED_NAMES = new Set(["AbortError"]);
const EXPECTED_MESSAGE_PATTERNS = [
  /^fetch failed$/i,
  /^failed to fetch$/i,
  /^load failed$/i,
  /^networkerror when attempting to fetch resource\.?$/i,
  /client is offline/i
];

const URL_PATTERN = /\b(?:https?|wss?|file|blob):\/\/[^\s"'<>()]+/gi;
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_CANDIDATE_PATTERN = /\+?\d[\d\s().-]{6,}\d/g;
const SECRET_ASSIGNMENT_PATTERN = /\b(access_token|id_token|refresh_token|token|api[_-]?key|apikey|key|password|senha|secret|authorization|cookie)\b(\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s&;,"']+)/gi;

function stripQueryAndHash(url) {
  const suffix = url.match(/:\d+(?::\d+)?$/);
  const base = suffix ? url.slice(0, -suffix[0].length) : url;
  const cut = base.search(/[?#]/);
  return (cut >= 0 ? base.slice(0, cut) : base) + (suffix ? suffix[0] : "");
}

// Redige tudo o que pode identificar pessoa ou credencial. A ordem importa:
// URLs perdem query/hash antes; segredos com nome antes do e-mail/telefone.
function redactTelemetryText(value) {
  let text = String(value);
  text = text.replace(URL_PATTERN, stripQueryAndHash);
  text = text.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]");
  text = text.replace(/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, "[REDACTED_JWT]");
  text = text.replace(/\bya29\.[A-Za-z0-9._-]+/g, "[REDACTED_TOKEN]");
  text = text.replace(/\bAIza[0-9A-Za-z_-]{20,}/g, "[REDACTED_KEY]");
  text = text.replace(SECRET_ASSIGNMENT_PATTERN, "$1$2[REDACTED]");
  text = text.replace(EMAIL_PATTERN, "[EMAIL]");
  text = text.replace(PHONE_CANDIDATE_PATTERN, (match) => (match.replace(/\D/g, "").length >= 8 ? "[PHONE]" : match));
  return text;
}

// Corta a entrada antes das expressões regulares (custo limitado) e de novo
// depois da redação (tamanho final). O pré-corte é maior que o limite final:
// um trecho parcial cortado no pré-corte fica sempre além do corte final.
function sanitizeTelemetryText(value, max) {
  if (typeof value !== "string") return null;
  const redacted = redactTelemetryText(value.slice(0, max * 4)).replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, " ").trim();
  return redacted ? redacted.slice(0, max) : null;
}

// route/source podem chegar sem esquema (ex.: "/loja.html?x#y"), fora do
// alcance do URL_PATTERN — query e hash saem sempre, antes da redação.
function sanitizeTelemetryLocation(value, max) {
  if (typeof value !== "string") return null;
  return sanitizeTelemetryText(stripQueryAndHash(value.slice(0, max * 4).trim()), max);
}

function sanitizeTelemetryStack(value) {
  if (typeof value !== "string") return null;
  const lines = value
    .slice(0, LIMITS.stackTotal * 4)
    .split("\n")
    .map((line) => sanitizeTelemetryText(line, LIMITS.stackLine))
    .filter(Boolean)
    .slice(0, LIMITS.stackLines);
  const stack = lines.join("\n").slice(0, LIMITS.stackTotal);
  return stack || null;
}

function sanitizeToken(value, max, pattern) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return pattern.test(trimmed) ? trimmed : null;
}

function sanitizeInteger(value) {
  return Number.isInteger(value) && value >= 0 && value <= LIMITS.maxLineNumber ? value : null;
}

function payloadByteLength(data) {
  try {
    return Buffer.byteLength(JSON.stringify(data) || "", "utf8");
  } catch {
    return Infinity;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

// Aceita só a allowlist; campos desconhecidos (inclusive uid/ownerUid/
// tenantId/email…) são descartados de forma determinística. Tipo/categoria
// fora do enum é rejeitado (invalid-argument), sem log.
function normalizeFrontendErrorPayload(data) {
  if (!isPlainObject(data)) {
    throw new HttpsError("invalid-argument", "Payload de telemetria inválido.");
  }
  if (payloadByteLength(data) > MAX_PAYLOAD_BYTES) {
    throw new HttpsError("invalid-argument", "Payload de telemetria excede o tamanho permitido.");
  }
  if (!TYPES.has(data.type) || !CATEGORIES.has(data.category)) {
    throw new HttpsError("invalid-argument", "Tipo ou categoria de telemetria inválidos.");
  }
  const code = sanitizeToken(data.code, LIMITS.code, /^[A-Za-z0-9/_.-]+$/);
  return {
    type: data.type,
    category: data.category,
    name: sanitizeToken(data.name, LIMITS.name, /^[A-Za-z][A-Za-z0-9_$]*$/) || "Error",
    code: code ? code.toLowerCase() : null,
    message: sanitizeTelemetryText(data.message, LIMITS.message) || "(sem mensagem)",
    stack: sanitizeTelemetryStack(data.stack),
    source: sanitizeTelemetryLocation(data.source, LIMITS.source),
    line: sanitizeInteger(data.line),
    column: sanitizeInteger(data.column),
    route: sanitizeTelemetryLocation(data.route, LIMITS.route),
    release: sanitizeToken(data.release, LIMITS.release, /^[A-Za-z0-9._:+-]+$/)
  };
}

function isExpectedFrontendError(normalized) {
  const code = String(normalized.code || "").replace(/^[a-z]+\//, "");
  if (EXPECTED_CODES.has(code)) return true;
  if (EXPECTED_NAMES.has(normalized.name)) return true;
  return EXPECTED_MESSAGE_PATTERNS.some((pattern) => pattern.test(normalized.message));
}

// Identificador do rate limit sem nenhum dado bruto: uid e IP passam por
// SHA-256 em memória; só o hash vai para o documento de _rate_limits. O IP
// nunca é persistido nem logado. (Hash de IP é pseudonimização, não
// anonimização — por isso nunca aparece em log.)
function telemetryRateLimitIdentifier(request) {
  const authUid = String(request?.auth?.uid || "").trim();
  const material = authUid ? `auth:${authUid}` : `ip:${callerIp(request)}`;
  const hash = crypto.createHash("sha256").update(`${RATE_LIMIT_SCOPE}|${material}`).digest("hex").slice(0, 40);
  return `${authUid ? "auth" : "anon"}_${hash}`;
}

// Error sanitizado com marcador estável. O stack é o do navegador (só linhas
// de frame "at …", já sanitizadas); sem frame no formato V8, sintetiza um a
// partir de source:line:column para o evento continuar elegível ao Error
// Reporting e agrupável por origem.
function buildFrontendError(normalized) {
  const message = `${FRONTEND_ERROR_MARKER}: ${normalized.category}: ${normalized.name}: ${normalized.message}`;
  const error = new Error(message);
  const frames = String(normalized.stack || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("at "))
    .map((line) => `    ${line}`);
  if (!frames.length) {
    const where = normalized.source
      ? `${normalized.source}:${normalized.line ?? 0}:${normalized.column ?? 0}`
      : "unknown";
    frames.push(`    at frontend (${where})`);
  }
  error.stack = `Error: ${message}\n${frames.join("\n")}`;
  return error;
}

async function handleReportFrontendError(request, deps = {}) {
  const log = deps.logger || logger;
  const rateLimit = deps.assertRateLimit || assertRateLimit;

  const normalized = normalizeFrontendErrorPayload(request?.data);
  if (isExpectedFrontendError(normalized)) {
    return { ok: true, ignored: "expected" };
  }

  await rateLimit({
    scope: RATE_LIMIT_SCOPE,
    identifier: telemetryRateLimitIdentifier(request),
    max: RATE_LIMIT_MAX
  });

  // Um erro recebido = exatamente um logger.error. Sem throw depois (o SDK
  // registraria de novo como "Unhandled error").
  log.error(`[Frontend] ${FRONTEND_ERROR_MARKER}`, buildFrontendError(normalized), {
    frontendError: {
      type: normalized.type,
      category: normalized.category,
      code: normalized.code,
      route: normalized.route,
      release: normalized.release,
      source: normalized.source,
      line: normalized.line,
      column: normalized.column,
      authenticated: Boolean(request?.auth?.uid)
    }
  });
  return { ok: true };
}

// enforceAppCheck: false pelo mesmo motivo das outras Functions públicas:
// nenhuma página inicializa App Check. maxInstances limita o custo de um
// abuso do endpoint público além do rate limit.
const reportFrontendError = onCall(
  { region: "southamerica-east1", enforceAppCheck: false, maxInstances: 5 },
  (request) => handleReportFrontendError(request)
);

module.exports = {
  ALLOWED_FIELDS,
  CATEGORIES,
  EXPECTED_CODES,
  FRONTEND_ERROR_MARKER,
  LIMITS,
  MAX_PAYLOAD_BYTES,
  RATE_LIMIT_MAX,
  RATE_LIMIT_SCOPE,
  buildFrontendError,
  handleReportFrontendError,
  isExpectedFrontendError,
  normalizeFrontendErrorPayload,
  redactTelemetryText,
  reportFrontendError,
  sanitizeTelemetryStack,
  sanitizeTelemetryText,
  telemetryRateLimitIdentifier
};
