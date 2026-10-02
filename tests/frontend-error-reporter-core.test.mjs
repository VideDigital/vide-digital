// VIDE-HUB-FRONTEND-ERROR-TELEMETRY-071 — núcleo do reporter de erros do
// frontend (frontend-error-reporter-core.js). Puro: roda em Node com um
// EventTarget real fazendo o papel de window.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
    CATEGORIES,
    EXPECTED_CODES,
    LIMITS,
    buildTelemetryPayload,
    createFrontendErrorReporter,
    extractErrorFields,
    fingerprintPayload,
    installGlobalErrorHandlers,
    isExpectedError,
    runWithErrorBoundary
} from "../frontend-error-reporter-core.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const servidor = createRequire(path.join(root, "functions", "src", "index.js"))("./telemetry/index.js");

const SENTINELAS = {
    email: "segredo-email@example.test",
    telefone: "+55 (11) 98765-4321",
    bearer: "QA_BEARER_SECRETO_123",
    jwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJxYSJ9.QA_JWT_ASSINATURA",
    apiKey: "AIzaSyQA_API_KEY_SECRETA_1234567890",
    queryToken: "QA_QUERY_TOKEN",
    hashToken: "QA_HASH_TOKEN",
    lead: "LEAD_SECRETO_QA",
    pedido: "PEDIDO_SECRETO_QA"
};

function criar(opcoes = {}) {
    const enviados = [];
    let relogio = opcoes.inicio ?? 1000;
    const reporter = createFrontendErrorReporter({
        send: opcoes.send || (async (payload) => { enviados.push(payload); }),
        now: () => relogio,
        isOnline: opcoes.isOnline || (() => true),
        getRoute: opcoes.getRoute || (() => "/vide-digital/dashboard.html"),
        getRelease: () => "3.3.0-pedidos-executivos",
        ...(opcoes.maxPerPage ? { maxPerPage: opcoes.maxPerPage } : {})
    });
    return { reporter, enviados, avancar: (ms) => { relogio += ms; } };
}
const esperarEnvios = () => new Promise((r) => setTimeout(r, 0));
function erroComStack(mensagem, stack) {
    const e = new Error(mensagem);
    if (stack !== undefined) e.stack = stack;
    return e;
}
function eventoErro(target, props) {
    const evento = new Event("error");
    Object.assign(evento, props);
    return evento;
}
function eventoRejeicao(reason) {
    const evento = new Event("unhandledrejection");
    evento.reason = reason;
    return evento;
}

describe("071 reporter — captura global (window error / unhandledrejection)", () => {
    it("erro global inesperado envia uma vez com tipo error e categoria global", async () => {
        const janela = new EventTarget();
        const { reporter, enviados } = criar();
        assert.equal(installGlobalErrorHandlers(janela, reporter), true);
        janela.dispatchEvent(eventoErro(janela, {
            error: new TypeError("Cannot read properties of undefined (reading 'x')"),
            filename: "https://videdigital.github.io/vide-digital/dashboard-app.js?v=1", lineno: 7140, colno: 20
        }));
        await esperarEnvios();
        assert.equal(enviados.length, 1);
        assert.equal(enviados[0].type, "error");
        assert.equal(enviados[0].category, "global");
        assert.equal(enviados[0].name, "TypeError");
        assert.equal(enviados[0].source, "https://videdigital.github.io/vide-digital/dashboard-app.js");
        assert.equal(enviados[0].line, 7140);
        assert.equal(enviados[0].column, 20);
    });

    it("unhandled rejection envia uma vez com tipo unhandledrejection", async () => {
        const janela = new EventTarget();
        const { reporter, enviados } = criar();
        installGlobalErrorHandlers(janela, reporter);
        janela.dispatchEvent(eventoRejeicao(new Error("bootstrap quebrou")));
        await esperarEnvios();
        assert.equal(enviados.length, 1);
        assert.equal(enviados[0].type, "unhandledrejection");
        assert.equal(enviados[0].message, "bootstrap quebrou");
    });

    it("instalação é única: segunda chamada não duplica listeners nem envios", async () => {
        const janela = new EventTarget();
        const { reporter, enviados } = criar();
        assert.equal(installGlobalErrorHandlers(janela, reporter), true);
        assert.equal(installGlobalErrorHandlers(janela, reporter), false);
        janela.dispatchEvent(eventoRejeicao(new Error("uma vez")));
        await esperarEnvios();
        assert.equal(enviados.length, 1);
    });

    it("resource error (alvo diferente de window), 'Script error.' e ResizeObserver são ignorados", async () => {
        const janela = new EventTarget();
        const { reporter, enviados } = criar();
        installGlobalErrorHandlers(janela, reporter);
        const recurso = eventoErro(janela, { message: "img falhou" });
        Object.defineProperty(recurso, "target", { value: { tagName: "IMG" } });
        janela.dispatchEvent(recurso);
        janela.dispatchEvent(eventoErro(janela, { message: "Script error." }));
        janela.dispatchEvent(eventoErro(janela, { message: "ResizeObserver loop completed with undelivered notifications." }));
        await esperarEnvios();
        assert.equal(enviados.length, 0);
    });
});

describe("071 reporter — erros esperados não são telemetrados", () => {
    for (const code of ["auth/invalid-credential", "auth/user-not-found", "auth/weak-password", "auth/popup-closed-by-user",
        "auth/popup-blocked", "auth/too-many-requests", "auth/network-request-failed", "permission-denied",
        "functions/permission-denied", "unavailable", "deadline-exceeded", "resource-exhausted", "functions/resource-exhausted",
        "already-exists", "functions/failed-precondition", "invalid-argument", "cancelled"]) {
        it(`código ${code}`, async () => {
            const { reporter, enviados } = criar();
            const erro = Object.assign(new Error("esperado"), { code });
            assert.equal(reporter.report(erro, { category: "bootstrap" }), "expected");
            await esperarEnvios();
            assert.equal(enviados.length, 0);
        });
    }
    it("AbortError, fetch failed, Failed to fetch e cliente offline do Firestore", async () => {
        const { reporter, enviados } = criar();
        const abort = new Error("aborted"); abort.name = "AbortError";
        assert.equal(reporter.report(abort), "expected");
        assert.equal(reporter.report(new TypeError("Failed to fetch")), "expected");
        assert.equal(reporter.report(new TypeError("fetch failed")), "expected");
        assert.equal(reporter.report(new Error("Failed to get document because the client is offline.")), "expected");
        await esperarEnvios();
        assert.equal(enviados.length, 0);
    });
    it("lista de esperados do cliente é idêntica à do servidor", () => {
        assert.deepEqual([...EXPECTED_CODES].sort(), [...servidor.EXPECTED_CODES].sort());
        assert.deepEqual([...CATEGORIES].sort(), [...servidor.CATEGORIES].sort());
    });
});

describe("071 reporter — dedupe, cooldown, limite por página, reentrância, falhas", () => {
    it("duplicado dentro do cooldown é suprimido; depois de 60 s volta a enviar", async () => {
        const { reporter, enviados, avancar } = criar();
        const erro = () => erroComStack("mesmo erro", "Error: mesmo erro\n    at f (https://x.test/a.js:1:2)");
        assert.equal(reporter.report(erro()), "sent");
        assert.equal(reporter.report(erro()), "duplicate");
        avancar(59999);
        assert.equal(reporter.report(erro()), "duplicate");
        avancar(1);
        assert.equal(reporter.report(erro()), "sent");
        await esperarEnvios();
        assert.equal(enviados.length, 2);
    });

    it("no máximo 10 eventos por carregamento de página", async () => {
        const { reporter, enviados } = criar();
        const status = Array.from({ length: 15 }, (_, i) => reporter.report(new Error(`erro distinto ${i}`)));
        assert.equal(status.filter((s) => s === "sent").length, 10);
        assert.deepEqual(status.slice(10), Array(5).fill("limit"));
        await esperarEnvios();
        assert.equal(enviados.length, 10);
    });

    it("reentrância: report chamado durante outro report é descartado", async () => {
        const { reporter, enviados } = criar();
        let interno = null;
        const hostil = {
            get message() { interno = reporter.report(new Error("interno")); return "externo"; }
        };
        assert.equal(reporter.report(hostil), "sent");
        assert.equal(interno, "reentrant");
        await esperarEnvios();
        assert.equal(enviados.length, 1);
        assert.equal(enviados[0].message, "externo");
    });

    it("envio falhando (síncrono ou assíncrono) é abandonado em silêncio, sem retry e sem recursão", async () => {
        let tentativas = 0;
        const rejeicoes = [];
        const ouvinte = (e) => rejeicoes.push(e);
        process.on("unhandledRejection", ouvinte);
        try {
            const sincrono = criar({ send: () => { tentativas++; throw new Error("send quebrou"); } });
            assert.equal(sincrono.reporter.report(new Error("a")), "sent");
            const assincrono = criar({ send: async () => { tentativas++; throw new Error("rede"); } });
            assert.equal(assincrono.reporter.report(new Error("b")), "sent");
            await new Promise((r) => setTimeout(r, 10));
            assert.equal(tentativas, 2, "uma tentativa cada, sem retry");
            assert.equal(rejeicoes.length, 0, "nenhuma rejeição escapa");
        } finally {
            process.off("unhandledRejection", ouvinte);
        }
    });

    it("erro que só passa pela fronteira (frame do core abaixo do topo) continua sendo reportado", async () => {
        const { reporter, enviados } = criar();
        const e = erroComStack("x", "Error: x\n    at carregar (https://x.test/loja.html:4016:1)\n    at runWithErrorBoundary (https://x.test/frontend-error-reporter-core.js:300:1)");
        assert.equal(reporter.report(e), "sent");
        await esperarEnvios();
        assert.equal(enviados.length, 1);
    });

    it("erro vindo do próprio reporter não é reportado", async () => {
        const { reporter, enviados } = criar();
        const proprio = erroComStack("x", "Error: x\n    at report (https://x.test/frontend-error-reporter-core.js:10:1)");
        assert.equal(reporter.report(proprio), "self");
        assert.equal(reporter.report(new Error("y"), { source: "https://x.test/frontend-error-telemetry.js" }), "self");
        await esperarEnvios();
        assert.equal(enviados.length, 0);
    });

    it("falha interna (getRoute quebrado) nunca lança para quem chamou", () => {
        const { reporter } = criar({ getRoute: () => { throw new Error("rota"); } });
        assert.equal(reporter.report(new Error("z")), "error");
    });

    it("offline (navigator.onLine === false) não envia", async () => {
        const { reporter, enviados } = criar({ isOnline: () => false });
        assert.equal(reporter.report(new Error("sem rede")), "offline");
        await esperarEnvios();
        assert.equal(enviados.length, 0);
    });
});

describe("071 reporter — sanitização e payload", () => {
    function payloadDe(valor, extra = {}) {
        return buildTelemetryPayload({ type: "operational", category: "bootstrap", fields: extractErrorFields(valor), ...extra });
    }

    it("query e hash removidos de source, route e URLs da mensagem/stack", () => {
        const p = payloadDe(erroComStack(
            `GET https://x.test/loja.html?token=${SENTINELAS.queryToken}#access_token=${SENTINELAS.hashToken}`,
            `Error: x\n    at f (https://x.test/a.js?v=1#${SENTINELAS.hashToken}:10:5)`
        ), { source: `https://x.test/a.js?token=${SENTINELAS.queryToken}`, route: `/vide-digital/loja.html?loja=a#${SENTINELAS.hashToken}` });
        const texto = JSON.stringify(p);
        assert.ok(!texto.includes(SENTINELAS.queryToken) && !texto.includes(SENTINELAS.hashToken));
        assert.equal(p.source, "https://x.test/a.js");
        assert.equal(p.route, "/vide-digital/loja.html");
        assert.match(p.stack, /at f \(https:\/\/x\.test\/a\.js:10:5\)/);
    });

    it("e-mail, telefone e tokens redigidos", () => {
        const p = payloadDe(new Error(`para ${SENTINELAS.email} tel ${SENTINELAS.telefone} Bearer ${SENTINELAS.bearer} ${SENTINELAS.jwt} key=${SENTINELAS.apiKey}`));
        const texto = JSON.stringify(p);
        for (const valor of [SENTINELAS.email, SENTINELAS.telefone, SENTINELAS.bearer, SENTINELAS.jwt, SENTINELAS.apiKey]) {
            assert.ok(!texto.includes(valor), `vazou ${valor}`);
        }
        assert.match(p.message, /\[EMAIL\]/);
        assert.match(p.message, /\[PHONE\]/);
    });

    it("stack truncada em linhas, tamanho por linha e total", () => {
        const stack = Array.from({ length: 50 }, (_, i) => `    at f${i} (https://x.test/a.js:${i}:1) ${"y".repeat(500)}`).join("\n");
        const p = payloadDe(erroComStack("x", stack));
        const linhas = p.stack.split("\n");
        assert.ok(linhas.length <= LIMITS.stackLines);
        assert.ok(linhas.every((l) => l.length <= LIMITS.stackLine));
        assert.ok(p.stack.length <= LIMITS.stackTotal);
        const curtas = payloadDe(erroComStack("x", Array.from({ length: 50 }, (_, i) => `    at f${i} (https://x.test/a.js:${i}:1)`).join("\n")));
        assert.equal(curtas.stack.split("\n").length, LIMITS.stackLines);
        assert.ok(payloadDe(new Error("m".repeat(5000))).message.length <= LIMITS.message);
    });

    it("objeto arbitrário nunca é serializado; payload tem só a allowlist e valores primitivos", () => {
        const lead = { nome: SENTINELAS.lead, pedido: { id: SENTINELAS.pedido }, toString() { return SENTINELAS.lead; } };
        for (const valor of [lead, { message: { texto: SENTINELAS.lead } }, [SENTINELAS.pedido], new Map([["a", SENTINELAS.lead]])]) {
            const p = payloadDe(valor);
            const texto = JSON.stringify(p);
            assert.ok(!texto.includes(SENTINELAS.lead) && !texto.includes(SENTINELAS.pedido));
            assert.deepEqual(Object.keys(p).sort(), [...servidor.ALLOWED_FIELDS].sort());
            assert.ok(Object.values(p).every((v) => v === null || ["string", "number"].includes(typeof v)));
        }
    });

    it("entende o erro normalizado de core/vide-functions.js ({ code, message, original })", () => {
        const original = erroComStack("INTERNAL", "Error: INTERNAL\n    at callFunction (https://x.test/core/vide-functions.js:34:9)");
        const campos = extractErrorFields({ code: "functions/internal", message: "Não foi possível concluir a operação.", original });
        assert.equal(campos.code, "functions/internal");
        assert.match(campos.stack, /vide-functions\.js:34:9/);
        assert.equal(isExpectedError(campos), false);
    });

    it("fingerprint deriva só de dados sanitizados (e-mails diferentes → mesmo fingerprint)", () => {
        const frames = "\n    at f (https://x.test/a.js:1:2)";
        const a = payloadDe(erroComStack("falha para a@example.test", `Error: falha para a@example.test${frames}`));
        const b = payloadDe(erroComStack("falha para b@example.test", `Error: falha para b@example.test${frames}`));
        assert.equal(fingerprintPayload(a), fingerprintPayload(b));
    });

    it("tipo ou categoria inválidos não geram payload", () => {
        const { reporter } = criar();
        assert.equal(reporter.report(new Error("x"), { category: "inventada" }), "invalid");
        assert.equal(reporter.report(new Error("x"), { type: "warn", category: "global" }), "invalid");
    });
});

describe("071 reporter — paridade de sanitização cliente × servidor", () => {
    const corpus = [
        { message: `para ${SENTINELAS.email} tel ${SENTINELAS.telefone}`, stack: "Error: a\n    at f (https://x.test/a.js?v=2:1:2)" },
        { message: `Authorization: Bearer ${SENTINELAS.bearer} ${SENTINELAS.jwt} ya29.QA password=x key=${SENTINELAS.apiKey}` },
        { message: "https://videdigital.github.io/vide-digital/loja.html?loja=a&email=x@y.zz#h", name: "TypeError", code: "functions/INTERNAL" },
        { message: "m".repeat(3000), stack: Array.from({ length: 40 }, (_, i) => `    at g${i} (https://x.test/b.js:${i}:3)`).join("\n") },
        { message: "Erro em 2026-10-01 linha 12 \u0007 controle", name: "1invalido", code: "c ó d" }
    ];
    for (const [i, fields] of corpus.entries()) {
        it(`caso ${i + 1}: mesmo resultado nos dois lados`, () => {
            const extras = { source: "https://x.test/a.js?x=1#y", line: 10, column: 3, route: "/vide-digital/dashboard.html?masterUID=z", release: "3.3.0" };
            const cliente = buildTelemetryPayload({ type: "error", category: "global", fields, ...extras });
            const servidorNormalizado = servidor.normalizeFrontendErrorPayload({ type: "error", category: "global", ...fields, ...extras });
            assert.deepEqual(cliente, servidorNormalizado);
        });
    }
});

describe("071 reporter — fronteira de fluxos assíncronos (runWithErrorBoundary)", () => {
    it("falha inesperada: mostra estado de erro, reporta a categoria e não relança", async () => {
        const { reporter, enviados } = criar();
        let falhaVista = null;
        const resultado = await runWithErrorBoundary(async () => { throw new TypeError("perfil quebrado"); }, {
            reporter, category: "bootstrap", onFailure: (e) => { falhaVista = e; }
        });
        assert.equal(resultado, undefined);
        assert.match(String(falhaVista), /perfil quebrado/);
        await esperarEnvios();
        assert.equal(enviados.length, 1);
        assert.equal(enviados[0].category, "bootstrap");
        assert.equal(enviados[0].type, "operational");
    });

    it("sucesso: devolve o resultado, sem estado de erro e sem telemetria", async () => {
        const { reporter, enviados } = criar();
        let falhou = false;
        assert.equal(await runWithErrorBoundary(async () => 42, { reporter, category: "bootstrap", onFailure: () => { falhou = true; } }), 42);
        await esperarEnvios();
        assert.equal(falhou, false);
        assert.equal(enviados.length, 0);
    });

    it("erro esperado: usuário vê o estado de erro, mas nada é telemetrado", async () => {
        const { reporter, enviados } = criar();
        let falhou = false;
        await runWithErrorBoundary(async () => { throw Object.assign(new Error("x"), { code: "permission-denied" }); },
            { reporter, category: "bootstrap", onFailure: () => { falhou = true; } });
        await esperarEnvios();
        assert.equal(falhou, true);
        assert.equal(enviados.length, 0);
    });

    it("onFailure quebrado não impede o reporte nem lança", async () => {
        const { reporter, enviados } = criar();
        await runWithErrorBoundary(async () => { throw new Error("falha"); },
            { reporter, category: "store-load", onFailure: () => { throw new Error("ui"); } });
        await esperarEnvios();
        assert.equal(enviados.length, 1);
    });
});
