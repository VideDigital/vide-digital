// VIDE-HUB-FRONTEND-ERROR-TELEMETRY-071 — reportFrontendError (servidor).
//
// O servidor é a barreira de segurança real: allowlist, tipos, tamanho,
// redação de PII/segredos, rate limit com identificador pseudonimizado e
// exatamente um logger.error com Error sanitizado. Sem emulador: o
// firebase-admin/firestore usado pelo rate limit real é substituído por um
// Firestore em memória só para requires feitos de dentro de functions/src.
import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import path from "node:path";
import { inspect, format } from "node:util";
import { beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const srcDir = path.join(root, "functions", "src");
const fnRequire = createRequire(path.join(srcDir, "index.js"));
const { HttpsError } = fnRequire("firebase-functions/v2/https");

// ---------- Firestore em memória (só o que assertRateLimit usa) ----------
const documentos = new Map();
const fakeFirestore = {
    collection: (nome) => ({ doc: (id) => ({ path: `${nome}/${id}`, id }) }),
    runTransaction: async (fn) => fn({
        get: async (ref) => ({ exists: documentos.has(ref.path), data: () => documentos.get(ref.path) }),
        set: (ref, dados, opcoes) => {
            documentos.set(ref.path, opcoes?.merge ? { ...(documentos.get(ref.path) || {}), ...dados } : { ...dados });
        }
    })
};
const firestoreFalso = {
    getFirestore: () => fakeFirestore,
    FieldValue: { serverTimestamp: () => "ts" },
    Timestamp: { fromMillis: (ms) => ({ toMillis: () => ms }) }
};
const loadOriginal = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === "firebase-admin/firestore" && parent?.filename?.startsWith(srcDir + path.sep)) return firestoreFalso;
    return loadOriginal.apply(this, arguments);
};
const telemetry = fnRequire("./telemetry/index.js");
const { assertRateLimit } = fnRequire("./shared/rateLimit.js");
Module._load = loadOriginal;

const {
    handleReportFrontendError, normalizeFrontendErrorPayload, telemetryRateLimitIdentifier,
    RATE_LIMIT_MAX, RATE_LIMIT_SCOPE, MAX_PAYLOAD_BYTES, LIMITS, ALLOWED_FIELDS
} = telemetry;

const SENTINELAS = {
    email: "segredo-email@example.test",
    telefone: "+55 (11) 98765-4321",
    bearer: "Bearer QA_BEARER_SECRETO_123",
    jwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJxYSJ9.QA_JWT_ASSINATURA",
    googleToken: "ya29.QA_GOOGLE_TOKEN_SECRETO",
    apiKey: "AIzaSyQA_API_KEY_SECRETA_1234567890",
    senha: "SenhaUltraSecreta123",
    queryToken: "QA_QUERY_TOKEN",
    hashToken: "QA_HASH_TOKEN",
    ip: "203.0.113.77",
    uid: "UID_SECRETO_QA",
    ownerUid: "OWNER_TENANT_QA",
    tenantId: "TENANT_QA",
    prompt: "PROMPT_SECRETO_QA",
    pedido: "PEDIDO_SECRETO_QA"
};

let chamadasLog;
let chamadasRateLimit;
const loggerFalso = {};
for (const nivel of ["error", "warn", "info", "log", "debug", "write"]) {
    loggerFalso[nivel] = (...args) => chamadasLog.push({ nivel, args });
}
const rateLimitEspiao = async (opcoes) => { chamadasRateLimit.push(opcoes); };

beforeEach(() => {
    chamadasLog = [];
    chamadasRateLimit = [];
    documentos.clear();
});

function requisicao(data, { uid = null, ip = SENTINELAS.ip } = {}) {
    return {
        data,
        auth: uid ? { uid, token: { email: SENTINELAS.email } } : undefined,
        rawRequest: { headers: { "x-forwarded-for": ip }, ip }
    };
}
function payloadValido(extra = {}) {
    return {
        type: "error",
        category: "global",
        name: "TypeError",
        code: null,
        message: "Cannot read properties of undefined (reading 'x')",
        stack: "TypeError: Cannot read properties of undefined (reading 'x')\n    at carregar (https://videdigital.github.io/vide-digital/dashboard-app.js?v=1:7140:20)\n    at async x (https://videdigital.github.io/vide-digital/core/vide-context.js:442:9)",
        source: "https://videdigital.github.io/vide-digital/dashboard-app.js?v=1",
        line: 7140,
        column: 20,
        route: "/vide-digital/dashboard.html",
        release: "3.3.0-pedidos-executivos",
        ...extra
    };
}
function serializarLogs() {
    return chamadasLog.map(({ args }) => `${format(...args)}\n${inspect(args, { depth: 10, showHidden: true })}`).join("\n");
}
function assertSemSentinelas(texto = serializarLogs()) {
    for (const [nome, valor] of Object.entries(SENTINELAS)) {
        assert.ok(!texto.includes(valor), `vazou ${nome}`);
    }
}
async function reportar(data, opcoes) {
    return handleReportFrontendError(requisicao(data, opcoes), { logger: loggerFalso, assertRateLimit: rateLimitEspiao });
}
const ehInvalidArgument = (e) => e instanceof HttpsError && e.code === "invalid-argument";

describe("071 reportFrontendError — payload válido", () => {
    it("gera exatamente um logger.error com Error sanitizado, marcador estável e stack do navegador", async () => {
        const r = await reportar(payloadValido());
        assert.deepEqual(r, { ok: true });
        assert.equal(chamadasLog.length, 1, "exatamente um log");
        const [{ nivel, args }] = chamadasLog;
        assert.equal(nivel, "error");
        assert.equal(args[0], "[Frontend] FRONTEND_ERROR");
        const erro = args[1];
        assert.ok(erro instanceof Error);
        assert.match(erro.message, /^FRONTEND_ERROR: global: TypeError: Cannot read properties/);
        assert.match(erro.stack, /^Error: FRONTEND_ERROR: global/);
        assert.match(erro.stack, /\n {4}at carregar \(https:\/\/videdigital\.github\.io\/vide-digital\/dashboard-app\.js:7140:20\)/);
        assert.ok(!erro.stack.includes("?v=1"), "query removida do frame");
        assert.deepEqual(Object.keys(args[2]), ["frontendError"]);
        assert.deepEqual(Object.keys(args[2].frontendError).sort(),
            ["authenticated", "category", "code", "column", "line", "release", "route", "source", "type"]);
        assert.equal(args[2].frontendError.source, "https://videdigital.github.io/vide-digital/dashboard-app.js");
        assert.equal(args[2].frontendError.authenticated, false);
    });

    it("sem frame no formato V8 sintetiza um frame a partir de source:line:column", async () => {
        await reportar(payloadValido({ stack: "carregar@https://x.test/a.js:10:5", source: "https://x.test/a.js?q=1#h" }));
        assert.match(chamadasLog[0].args[1].stack, /\n {4}at frontend \(https:\/\/x\.test\/a\.js:7140:20\)$/);
    });
});

describe("071 reportFrontendError — allowlist, tipos e tamanho", () => {
    it("campos desconhecidos (uid/ownerUid/tenantId/email/prompt/pedido/documento) são descartados", async () => {
        await reportar(payloadValido({
            uid: SENTINELAS.uid, ownerUid: SENTINELAS.ownerUid, storeUid: SENTINELAS.ownerUid, tenantId: SENTINELAS.tenantId,
            email: SENTINELAS.email, prompt: SENTINELAS.prompt, pedido: { id: SENTINELAS.pedido },
            documento: { nome: SENTINELAS.pedido }, headers: { Authorization: SENTINELAS.bearer }
        }));
        assert.equal(chamadasLog.length, 1);
        assertSemSentinelas();
        const normalizado = normalizeFrontendErrorPayload(payloadValido({ uid: "x", extra: 1 }));
        assert.deepEqual(Object.keys(normalizado).sort(), [...ALLOWED_FIELDS].sort());
    });

    it("payload que não é objeto simples é rejeitado sem log", async () => {
        for (const ruim of [null, "texto", 42, [payloadValido()], new Date()]) {
            await assert.rejects(() => reportar(ruim), ehInvalidArgument);
        }
        assert.equal(chamadasLog.length, 0);
        assert.equal(chamadasRateLimit.length, 0);
    });

    it("type/category fora do enum são rejeitados sem log", async () => {
        await assert.rejects(() => reportar(payloadValido({ type: "warning" })), ehInvalidArgument);
        await assert.rejects(() => reportar(payloadValido({ category: "qualquer" })), ehInvalidArgument);
        await assert.rejects(() => reportar(payloadValido({ type: ["error"] })), ehInvalidArgument);
        assert.equal(chamadasLog.length, 0);
    });

    it("tipos inválidos viram null/padrão e nunca são serializados (objeto arbitrário em message/stack)", async () => {
        await reportar(payloadValido({
            message: { texto: SENTINELAS.prompt }, stack: [SENTINELAS.pedido], name: { n: 1 },
            code: 123, line: "7140", column: -1, route: { path: SENTINELAS.tenantId }, release: { v: 1 }, source: 99
        }));
        const meta = chamadasLog[0].args[2].frontendError;
        assert.equal(meta.line, null);
        assert.equal(meta.column, null);
        assert.equal(meta.route, null);
        assert.equal(meta.release, null);
        assert.equal(meta.code, null);
        assert.match(chamadasLog[0].args[1].message, /: Error: \(sem mensagem\)$/);
        assertSemSentinelas();
    });

    it("payload acima do limite é rejeitado sem log", async () => {
        await assert.rejects(() => reportar(payloadValido({ stack: "x".repeat(MAX_PAYLOAD_BYTES + 1) })), ehInvalidArgument);
        assert.equal(chamadasLog.length, 0);
    });

    it("limita o número de linhas do stack", async () => {
        const stack = Array.from({ length: 60 }, (_, i) => `    at f${i} (https://x.test/a.js:${i}:1)`).join("\n");
        await reportar(payloadValido({ stack }));
        const frames = chamadasLog[0].args[1].stack.split("\n").filter((l) => l.startsWith("    at "));
        assert.equal(frames.length, LIMITS.stackLines);
    });

    it("limita o tamanho de cada linha do stack e da mensagem", async () => {
        const stack = Array.from({ length: 10 }, (_, i) => `    at f${i} (https://x.test/a.js:${i}:1) ${"y".repeat(500)}`).join("\n");
        await reportar(payloadValido({ message: "m".repeat(2000), stack }));
        const erro = chamadasLog[0].args[1];
        const frames = erro.stack.split("\n").filter((l) => l.startsWith("    at "));
        assert.equal(frames.length, 10);
        assert.ok(frames.every((l) => l.length <= LIMITS.stackLine + 4));
        assert.equal(erro.message.length, "FRONTEND_ERROR: global: TypeError: ".length + LIMITS.message);
    });
});

describe("071 reportFrontendError — redação de PII e segredos", () => {
    it("e-mail, telefone, Bearer, JWT, token Google, API key, senha, query e hash nunca chegam ao log", async () => {
        const sujo = [
            `Falha para ${SENTINELAS.email} tel ${SENTINELAS.telefone}`,
            `Authorization: ${SENTINELAS.bearer}`,
            `jwt ${SENTINELAS.jwt} google ${SENTINELAS.googleToken} key ${SENTINELAS.apiKey}`,
            `password=${SENTINELAS.senha}`,
            `GET https://videdigital.github.io/vide-digital/loja.html?token=${SENTINELAS.queryToken}&email=${SENTINELAS.email}#access_token=${SENTINELAS.hashToken}`
        ].join(" | ");
        await reportar(payloadValido({
            message: sujo,
            stack: `Error: ${sujo}\n    at f (https://x.test/a.js?key=${SENTINELAS.apiKey}#${SENTINELAS.hashToken}:1:2)`,
            source: `https://x.test/a.js?token=${SENTINELAS.queryToken}#${SENTINELAS.hashToken}`,
            route: `/vide-digital/loja.html?email=${SENTINELAS.email}#${SENTINELAS.hashToken}`
        }));
        assert.equal(chamadasLog.length, 1);
        assertSemSentinelas();
        const texto = serializarLogs();
        for (const marcador of ["[EMAIL]", "[PHONE]", "Authorization: [REDACTED]", "[REDACTED_JWT]", "[REDACTED_TOKEN]", "[REDACTED_KEY]", "password=[REDACTED]"]) {
            assert.ok(texto.includes(marcador), `marcador ausente: ${marcador}`);
        }
    });

    it("payload cru nunca é logado (nenhum argumento é o objeto recebido)", async () => {
        const data = payloadValido({ extraCru: SENTINELAS.prompt });
        await reportar(data);
        for (const arg of chamadasLog[0].args) assert.notEqual(arg, data);
        assertSemSentinelas();
    });
});

describe("071 reportFrontendError — erros esperados não viram incidente", () => {
    for (const code of ["functions/permission-denied", "auth/network-request-failed", "unavailable", "deadline-exceeded",
        "resource-exhausted", "already-exists", "invalid-argument", "auth/invalid-credential", "auth/popup-closed-by-user",
        "failed-precondition", "auth/too-many-requests", "cancelled"]) {
        it(`código ${code} é ignorado sem log e sem rate limit`, async () => {
            const r = await reportar(payloadValido({ code }));
            assert.deepEqual(r, { ok: true, ignored: "expected" });
            assert.equal(chamadasLog.length, 0);
            assert.equal(chamadasRateLimit.length, 0);
        });
    }
    it("AbortError e mensagens de rede/offline são ignorados", async () => {
        await reportar(payloadValido({ name: "AbortError" }));
        await reportar(payloadValido({ message: "Failed to fetch" }));
        await reportar(payloadValido({ message: "fetch failed" }));
        await reportar(payloadValido({ message: "Failed to get document because the client is offline." }));
        assert.equal(chamadasLog.length, 0);
    });
});

describe("071 reportFrontendError — auth, multi-tenant e rate limit", () => {
    it("autenticado: identidade só de request.auth; uid/ownerUid/tenantId do payload ignorados; uid nunca no identificador nem no log", async () => {
        await reportar(payloadValido({ uid: "ATACANTE", ownerUid: "OUTRO_TENANT", tenantId: "OUTRO_TENANT" }), { uid: SENTINELAS.uid });
        const [{ scope, identifier, max }] = chamadasRateLimit;
        assert.equal(scope, RATE_LIMIT_SCOPE);
        assert.equal(max, RATE_LIMIT_MAX);
        assert.match(identifier, /^auth_[0-9a-f]{40}$/);
        assert.equal(identifier, telemetryRateLimitIdentifier({ auth: { uid: SENTINELAS.uid } }), "deriva só de request.auth.uid");
        assert.notEqual(identifier, telemetryRateLimitIdentifier({ auth: { uid: "ATACANTE" } }));
        assert.equal(chamadasLog[0].args[2].frontendError.authenticated, true);
        const texto = serializarLogs() + JSON.stringify(chamadasRateLimit);
        assertSemSentinelas(texto);
        assert.ok(!texto.includes("ATACANTE") && !texto.includes("OUTRO_TENANT"));
    });

    it("público: identificador é hash do IP obtido no servidor; IP bruto nunca no identificador nem no log", async () => {
        await reportar(payloadValido());
        const [{ identifier }] = chamadasRateLimit;
        assert.match(identifier, /^anon_[0-9a-f]{40}$/);
        assert.notEqual(identifier, telemetryRateLimitIdentifier(requisicao({}, { ip: "198.51.100.9" })), "IPs diferentes, cotas diferentes");
        assertSemSentinelas(serializarLogs() + JSON.stringify(chamadasRateLimit));
    });

    it("rate limit real: a chamada além do teto falha com resource-exhausted e não loga; nada bruto no documento", async () => {
        const deps = { logger: loggerFalso, assertRateLimit };
        for (let i = 0; i < RATE_LIMIT_MAX; i++) {
            await handleReportFrontendError(requisicao(payloadValido()), deps);
        }
        await assert.rejects(
            () => handleReportFrontendError(requisicao(payloadValido()), deps),
            (e) => e instanceof HttpsError && e.code === "resource-exhausted"
        );
        assert.equal(chamadasLog.length, RATE_LIMIT_MAX, "nenhum log da chamada bloqueada");
        // Outro IP tem cota própria.
        await handleReportFrontendError(requisicao(payloadValido(), { ip: "198.51.100.9" }), deps);
        assert.equal(chamadasLog.length, RATE_LIMIT_MAX + 1);
        const persistido = JSON.stringify([...documentos.entries()]);
        assert.ok(!persistido.includes(SENTINELAS.ip), "IP bruto nunca persistido");
        assert.ok(!persistido.includes("198.51.100.9"));
        assert.ok([...documentos.keys()].every((k) => /^_rate_limits\/reportFrontendError_anon_[0-9a-f]{40}$/.test(k)));
    });

    it("rate limit autenticado não persiste o uid", async () => {
        await handleReportFrontendError(requisicao(payloadValido(), { uid: SENTINELAS.uid }), { logger: loggerFalso, assertRateLimit });
        const persistido = JSON.stringify([...documentos.entries()]);
        assert.ok(!persistido.includes(SENTINELAS.uid));
        assert.ok([...documentos.keys()].every((k) => /^_rate_limits\/reportFrontendError_auth_[0-9a-f]{40}$/.test(k)));
    });

    it("bloqueio do rate limit (espião) impede o log", async () => {
        const bloqueia = async () => { throw new HttpsError("resource-exhausted", "x"); };
        await assert.rejects(
            () => handleReportFrontendError(requisicao(payloadValido()), { logger: loggerFalso, assertRateLimit: bloqueia }),
            (e) => e.code === "resource-exhausted"
        );
        assert.equal(chamadasLog.length, 0);
    });
});

describe("071 reportFrontendError — Function publicada", () => {
    it("é onCall em southamerica-east1, exportada explicitamente e sem App Check obrigatório", () => {
        const indice = fnRequire("./index.js");
        assert.equal(indice.reportFrontendError, telemetry.reportFrontendError);
        const endpoint = telemetry.reportFrontendError.__endpoint;
        assert.ok(endpoint.callableTrigger, "onCall");
        assert.deepEqual(endpoint.region, ["southamerica-east1"]);
        assert.equal(endpoint.maxInstances, 5);
    });
});
