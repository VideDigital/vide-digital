// Núcleo do reporter central de erros do frontend
// (VIDE-HUB-FRONTEND-ERROR-TELEMETRY-071). Puro: sem DOM, sem Firebase —
// testável em Node. A cola com o navegador e com a Function
// reportFrontendError fica em frontend-error-telemetry.js.
//
// Regras:
// - só falhas inesperadas viram telemetria (lista de esperados abaixo);
// - nunca serializa objetos: extrai só name/code/message/stack quando são
//   strings, e sanitiza antes do fingerprint e antes do envio;
// - dedupe por fingerprint com cooldown, teto por carregamento de página,
//   guarda de reentrância, nada quando offline, sem retry e sem fila;
// - falha do próprio reporter é abandonada em silêncio, nunca reportada.
//
// A sanitização é a mesma de functions/src/telemetry/index.js (teste de
// paridade em tests/frontend-error-reporter-core.test.mjs). O servidor
// repete tudo: o cliente não é fronteira de segurança.

export const LIMITS = Object.freeze({
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

export const TYPES = Object.freeze(["error", "unhandledrejection", "operational"]);
export const CATEGORIES = Object.freeze([
    "global", "bootstrap", "store-load", "lp-init",
    "orders-listener", "orders-module", "orders-legacy"
]);
export const DEFAULT_COOLDOWN_MS = 60000;
export const DEFAULT_MAX_PER_PAGE = 10;

// Validação, credencial, permissão esperada, rede/offline, cancelamento e
// regra de negócio (limite de plano/IA, rate limit, duplicidade).
export const EXPECTED_CODES = Object.freeze([
    "invalid-argument", "invalid-email", "invalid-credential", "invalid-login-credentials",
    "wrong-password", "user-not-found", "weak-password", "email-already-in-use", "user-disabled",
    "popup-closed-by-user", "popup-blocked", "cancelled-popup-request", "too-many-requests",
    "network-request-failed", "permission-denied", "unauthenticated", "unavailable",
    "deadline-exceeded", "resource-exhausted", "already-exists", "failed-precondition",
    "cancelled", "aborted"
]);
const EXPECTED_CODE_SET = new Set(EXPECTED_CODES);
const EXPECTED_NAMES = new Set(["AbortError"]);
const EXPECTED_MESSAGE_PATTERNS = [
    /^fetch failed$/i,
    /^failed to fetch$/i,
    /^load failed$/i,
    /^networkerror when attempting to fetch resource\.?$/i,
    /client is offline/i
];
// Ruído de navegador sem valor operacional.
const IGNORED_GLOBAL_MESSAGES = [
    /^script error\.?$/i,
    /^resizeobserver loop/i
];
const REPORTER_FILES = /frontend-error-(reporter-core|telemetry)\.js/;

const URL_PATTERN = /\b(?:https?|wss?|file|blob):\/\/[^\s"'<>()]+/gi;
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_CANDIDATE_PATTERN = /\+?\d[\d\s().-]{6,}\d/g;
const SECRET_ASSIGNMENT_PATTERN = /\b(access_token|id_token|refresh_token|token|api[_-]?key|apikey|key|password|senha|secret|authorization|cookie)\b(\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s&;,"']+)/gi;

export function stripQueryAndHash(url) {
    const suffix = url.match(/:\d+(?::\d+)?$/);
    const base = suffix ? url.slice(0, -suffix[0].length) : url;
    const cut = base.search(/[?#]/);
    return (cut >= 0 ? base.slice(0, cut) : base) + (suffix ? suffix[0] : "");
}

export function redactTelemetryText(value) {
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

export function sanitizeTelemetryText(value, max) {
    if (typeof value !== "string") return null;
    const redacted = redactTelemetryText(value.slice(0, max * 4)).replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, " ").trim();
    return redacted ? redacted.slice(0, max) : null;
}

export function sanitizeTelemetryLocation(value, max) {
    if (typeof value !== "string") return null;
    return sanitizeTelemetryText(stripQueryAndHash(value.slice(0, max * 4).trim()), max);
}

export function sanitizeTelemetryStack(value) {
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

function stringOrNull(value) {
    return typeof value === "string" ? value : null;
}

// Nunca serializa o valor: lê apenas name/code/message/stack quando são
// strings. Entende o erro normalizado de core/vide-functions.js
// ({ code, message, original }), cujo stack fica em original.
export function extractErrorFields(value) {
    if (value === null || value === undefined) {
        return { name: null, code: null, message: null, stack: null };
    }
    const tipo = typeof value;
    if (tipo === "string" || tipo === "number" || tipo === "boolean") {
        return { name: null, code: null, message: String(value), stack: null };
    }
    if (tipo !== "object") {
        return { name: null, code: null, message: null, stack: null };
    }
    let name = null, code = null, message = null, stack = null;
    try {
        name = stringOrNull(value.name);
        code = stringOrNull(value.code);
        message = stringOrNull(value.message);
        stack = stringOrNull(value.stack);
        const original = value.original;
        if (original && typeof original === "object") {
            name = name || stringOrNull(original.name);
            code = code || stringOrNull(original.code);
            stack = stack || stringOrNull(original.stack);
        }
    } catch {
        // getter hostil: fica com o que já foi lido
    }
    return { name, code, message, stack };
}

export function isExpectedError(fields) {
    const code = String(fields?.code || "").toLowerCase().replace(/^[a-z]+\//, "");
    if (EXPECTED_CODE_SET.has(code)) return true;
    if (EXPECTED_NAMES.has(fields?.name)) return true;
    const message = String(fields?.message || "");
    return EXPECTED_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
}

export function buildTelemetryPayload({ type, category, fields, source, line, column, route, release }) {
    if (!TYPES.includes(type) || !CATEGORIES.includes(category)) return null;
    const code = sanitizeToken(fields?.code, LIMITS.code, /^[A-Za-z0-9/_.-]+$/);
    return {
        type,
        category,
        name: sanitizeToken(fields?.name, LIMITS.name, /^[A-Za-z][A-Za-z0-9_$]*$/) || "Error",
        code: code ? code.toLowerCase() : null,
        message: sanitizeTelemetryText(fields?.message, LIMITS.message) || "(sem mensagem)",
        stack: sanitizeTelemetryStack(fields?.stack),
        source: sanitizeTelemetryLocation(source, LIMITS.source),
        line: sanitizeInteger(line),
        column: sanitizeInteger(column),
        route: sanitizeTelemetryLocation(route, LIMITS.route),
        release: sanitizeToken(release, LIMITS.release, /^[A-Za-z0-9._:+-]+$/)
    };
}

// FNV-1a 32 bits sobre campos já sanitizados (nunca sobre dado bruto).
export function fingerprintPayload(payload) {
    const firstFrame = String(payload.stack || "").split("\n").find((l) => l.trim().startsWith("at ")) || "";
    const material = [payload.type, payload.category, payload.name, payload.code, payload.message, firstFrame.trim(), payload.source].join("|");
    let hash = 0x811c9dc5;
    for (let i = 0; i < material.length; i++) {
        hash ^= material.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
}

export function createFrontendErrorReporter({
    send,
    now = () => Date.now(),
    isOnline = () => true,
    getRoute = () => null,
    getRelease = () => null,
    cooldownMs = DEFAULT_COOLDOWN_MS,
    maxPerPage = DEFAULT_MAX_PER_PAGE
} = {}) {
    const ultimoEnvio = new Map();
    let enviados = 0;
    let ativo = false;

    function report(value, { type = "operational", category = "global", source, line, column } = {}) {
        if (ativo) return "reentrant";
        ativo = true;
        try {
            const fields = extractErrorFields(value);
            // Só o frame do topo decide: erros que apenas passam pela
            // fronteira (runWithErrorBoundary) têm um frame deste arquivo
            // mais abaixo e continuam sendo reportados.
            const topo = String(fields.stack || "").split("\n").find((l) => /^\s*at\s|^\S*@\S+:\d+:\d+/.test(l)) || "";
            if (REPORTER_FILES.test(topo) || REPORTER_FILES.test(String(source || ""))) return "self";
            if (isExpectedError(fields)) return "expected";
            if (type !== "operational" && IGNORED_GLOBAL_MESSAGES.some((p) => p.test(String(fields.message || "")))) return "ignored";
            if (!isOnline()) return "offline";
            if (enviados >= maxPerPage) return "limit";
            const payload = buildTelemetryPayload({
                type, category, fields, source, line, column,
                route: getRoute(), release: getRelease()
            });
            if (!payload) return "invalid";
            const fingerprint = fingerprintPayload(payload);
            const agora = now();
            const anterior = ultimoEnvio.get(fingerprint);
            if (anterior !== undefined && agora - anterior < cooldownMs) return "duplicate";
            ultimoEnvio.set(fingerprint, agora);
            enviados += 1;
            // Sem retry, sem fila: qualquer falha do envio é abandonada.
            Promise.resolve()
                .then(() => send(payload))
                .catch(() => {});
            return "sent";
        } catch {
            return "error";
        } finally {
            ativo = false;
        }
    }

    return Object.freeze({
        report,
        stats: () => ({ enviados, fingerprints: ultimoEnvio.size })
    });
}

// Instalação única dos handlers globais. Resource errors (img/script/link)
// não borbulham até window na fase de bolha usada aqui, então nunca entram;
// "Script error." de terceiros e ruído do ResizeObserver são ignorados no
// report().
export function installGlobalErrorHandlers(target, reporter, { flag = "__videFrontendErrorHandlersInstalled" } = {}) {
    if (!target || !reporter || target[flag]) return false;
    target[flag] = true;
    target.addEventListener("error", (event) => {
        try {
            if (event?.target && event.target !== target) return;
            reporter.report(event?.error ?? event?.message, {
                type: "error",
                category: "global",
                source: event?.filename,
                line: event?.lineno,
                column: event?.colno
            });
        } catch {
            // nunca deixa o handler global falhar
        }
    });
    target.addEventListener("unhandledrejection", (event) => {
        try {
            reporter.report(event?.reason, { type: "unhandledrejection", category: "global" });
        } catch {
            // idem
        }
    });
    return true;
}

// Fronteira para fluxos assíncronos já capturados em catch: executa fn; na
// falha chama onFailure (estado visível ao usuário) e reporta a categoria
// (o reporter descarta erros esperados). Nunca relança.
export async function runWithErrorBoundary(fn, { reporter, category, onFailure }) {
    try {
        return await fn();
    } catch (error) {
        try { onFailure?.(error); } catch { /* UI de erro nunca derruba a fronteira */ }
        try { reporter?.report(error, { type: "operational", category }); } catch { /* idem */ }
        return undefined;
    }
}
