// VIDE-HUB-SERVER-ERROR-INSTRUMENTATION-067 — prova que os caminhos de
// erro operacional de createEmployee, createAdminMember, askBusinessAI e
// askPublicBusinessAI deixam a causa (Error com stack) no logger sem mudar
// o contrato devolvido ao cliente e sem levar dados sensíveis pro log.
//
// Sem emulador e sem rede: firebase-admin, contexto de auth, auditoria,
// rate limit e resolução de tenant público são substituídos por fakes
// SOMENTE para requires feitos de dentro de functions/src (o SDK do
// firebase-functions continua real — o HttpsError e o logger testados são
// os de produção). fetch é injetado via globalThis; nunca chama o Gemini.
import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import path from "node:path";
import { inspect, format } from "node:util";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const srcDir = path.join(root, "functions", "src");
const src = (rel) => path.join(srcDir, rel);
const fnRequire = createRequire(src("index.js"));

const { logger } = fnRequire("firebase-functions");
const { HttpsError } = fnRequire("firebase-functions/v2/https");

// Valores sentinela: nenhum deles pode aparecer em argumento de log.
const SENTINELAS = {
    email: "segredo-email@example.test",
    password: "SenhaUltraSecreta!123",
    nome: "Nome Sensível QA",
    cargo: "CARGO_SENSIVEL_QA",
    permissao: "PERMISSAO_SENSIVEL_QA",
    ownerUid: "OWNER_TENANT_QA",
    pergunta: "PERGUNTA_SECRETA_QA",
    historico: "HISTORICO_SECRETO_QA",
    apiKey: "API_KEY_SECRETA_QA",
    corpoProvedor: "CORPO_SECRETO_GEMINI_QA",
    respostaProvedor: "RESPOSTA_SECRETA_QA",
    lojaNome: "LOJA_SECRETA_QA",
    storeSlug: "SLUG_SECRETO_QA"
};
const UID_CRIADO = "uid-criado-qa";

// ---------- Fakes (estado reiniciado a cada teste) ----------
let estado;
function novoEstado() {
    return {
        contexto: { isOwner: true, isAdmin: false, ownerUid: SENTINELAS.ownerUid, authUid: "auth-dono-qa", owner: { plano: "pro" } },
        getUserByEmail: async () => {
            const erro = new Error("There is no user record corresponding to the provided identifier.");
            erro.code = "auth/user-not-found";
            throw erro;
        },
        createUser: async () => ({ uid: UID_CRIADO }),
        setCustomUserClaims: async () => {},
        deleteUser: async () => {},
        deleteCalls: [],
        docSet: async () => {},
        docGet: async () => ({ exists: true, data: () => ({ nomeLoja: SENTINELAS.lojaNome, plano: "pro", iaNegocioPublicaAtiva: true }) })
    };
}

const fakeAuth = {
    getUserByEmail: (...a) => estado.getUserByEmail(...a),
    createUser: (...a) => estado.createUser(...a),
    setCustomUserClaims: (...a) => estado.setCustomUserClaims(...a),
    deleteUser: async (uid) => {
        estado.deleteCalls.push(uid);
        return estado.deleteUser(uid);
    }
};
const consulta = { where: () => consulta, limit: () => consulta, get: async () => ({ size: 0, docs: [] }) };
const fakeFirestore = {
    doc: (caminho) => ({ set: (dados) => estado.docSet(caminho, dados), get: () => estado.docGet(caminho) }),
    collection: () => consulta,
    runTransaction: async (fn) => fn({ get: async () => ({ exists: false, data: () => ({}) }), set: () => {} })
};
const FieldValue = {
    serverTimestamp: () => "ts",
    increment: (n) => n,
    arrayUnion: (...v) => v,
    arrayRemove: (...v) => v
};

const mocksPorPacote = new Map([
    ["firebase-admin/auth", { getAuth: () => fakeAuth }],
    ["firebase-admin/firestore", { getFirestore: () => fakeFirestore, FieldValue, Timestamp: { fromMillis: (ms) => ms } }]
]);
const mocksPorArquivo = new Map([
    [src("shared/context.js"), {
        resolveCallerContext: async () => estado.contexto,
        requireEdit: () => {},
        requireBackendAdmin: () => ({ uid: "admin-qa" })
    }],
    [src("audit/index.js"), { writeAudit: async () => {} }],
    [src("shared/rateLimit.js"), { assertPublicRateLimit: async () => {} }],
    [src("public/index.js"), {
        resolvePublicTenant: async () => ({ ownerUid: SENTINELAS.ownerUid, storeSlug: SENTINELAS.storeSlug }),
        publicOptions: { region: "southamerica-east1" }
    }]
]);

const loadOriginal = Module._load;
Module._load = function (request, parent, isMain) {
    if (parent?.filename?.startsWith(srcDir + path.sep)) {
        if (mocksPorPacote.has(request)) return mocksPorPacote.get(request);
        if (request.startsWith(".")) {
            const resolvido = Module._resolveFilename(request, parent, isMain);
            if (mocksPorArquivo.has(resolvido)) return mocksPorArquivo.get(resolvido);
        }
    }
    return loadOriginal.apply(this, arguments);
};
const { createEmployee } = fnRequire("./employees/index.js");
const { createAdminMember } = fnRequire("./admin/index.js");
const { askBusinessAI, askPublicBusinessAI } = fnRequire("./ai/index.js");
Module._load = loadOriginal;

// ---------- Captura de TODO log emitido pelo logger oficial ----------
let logs;
beforeEach(() => {
    estado = novoEstado();
    logs = {};
    for (const nivel of ["error", "warn", "info", "log", "debug", "write"]) {
        logs[nivel] = mock.method(logger, nivel, () => {}).mock;
    }
    process.env.GEMINI_API_KEY = SENTINELAS.apiKey;
});
afterEach(() => {
    mock.restoreAll();
});

function chamadas(nivel) {
    return logs[nivel].calls.map((c) => c.arguments);
}
function totalLogs() {
    return Object.values(logs).reduce((soma, m) => soma + m.callCount(), 0);
}
// Serializa os argumentos como o SDK faria (util.format) e também de forma
// profunda (inspect: inclui message, stack e campos próprios do Error).
function serializarLogs() {
    return Object.values(logs)
        .flatMap((m) => m.calls.map((c) => c.arguments))
        .map((args) => `${format(...args)}\n${inspect(args, { depth: 10, showHidden: true })}`)
        .join("\n");
}
function assertSemSentinelas(extraPermitido = []) {
    const texto = serializarLogs();
    for (const [nome, valor] of Object.entries(SENTINELAS)) {
        if (extraPermitido.includes(nome)) continue;
        assert.ok(!texto.includes(valor), `log vazou ${nome}`);
    }
}
function assertHttpsError(erro, codigo, status, mensagem) {
    assert.ok(erro instanceof HttpsError, "cliente deve receber HttpsError");
    assert.equal(erro.code, codigo);
    assert.equal(erro.httpErrorCode.status, status);
    if (mensagem) assert.equal(erro.message, mensagem);
    return true;
}

const requestFuncionario = () => ({
    auth: { uid: "auth-dono-qa", token: {} },
    data: {
        email: SENTINELAS.email,
        password: SENTINELAS.password,
        nome: SENTINELAS.nome,
        cargo: SENTINELAS.cargo,
        permissoes: { ver: ["produtos"], editar: ["produtos"] }
    }
});
const requestAdmin = () => ({
    auth: { uid: "admin-qa", token: { videAdmin: true } },
    data: { email: SENTINELAS.email, password: SENTINELAS.password, permissoes: [SENTINELAS.permissao] }
});

// ================= ERR-SRV-001 — createEmployee =================
describe("067 ERR-SRV-001 — createEmployee preserva a causa de erro inesperado", () => {
    const MENSAGEM = "Não foi possível criar o funcionário.";

    it("falha inesperada do Auth createUser: continua internal/500, Error ORIGINAL logado com stack, sem PII", async () => {
        const original = new Error("falha simulada do Auth createUser");
        estado.createUser = async () => { throw original; };

        await assert.rejects(() => createEmployee.run(requestFuncionario()), (e) => assertHttpsError(e, "internal", 500, MENSAGEM));

        const erros = chamadas("error");
        assert.equal(erros.length, 1, "exatamente um logger.error");
        assert.match(erros[0][0], /^\[Funcionários\] Falha inesperada ao criar funcionário/);
        assert.equal(erros[0][1], original, "logger recebe o Error original (mesma instância)");
        assert.match(erros[0][1].stack, /falha simulada do Auth createUser[\s\S]*\n\s+at /);
        assert.equal(estado.deleteCalls.length, 0, "sem usuário criado, sem rollback");
        assert.equal(totalLogs(), 1);
        assertSemSentinelas();
    });

    it("falha inesperada do Firestore set com rollback OK: rollback tentado, um único log, erro original preservado", async () => {
        const original = new Error("falha simulada do Firestore set");
        estado.docSet = async () => { throw original; };

        await assert.rejects(() => createEmployee.run(requestFuncionario()), (e) => assertHttpsError(e, "internal", 500, MENSAGEM));

        assert.deepEqual(estado.deleteCalls, [UID_CRIADO], "rollback continua sendo tentado");
        const erros = chamadas("error");
        assert.equal(erros.length, 1, "rollback bem-sucedido não gera log extra");
        assert.equal(erros[0][1], original);
        assert.equal(totalLogs(), 1);
        assertSemSentinelas();
    });

    it("rollback falha: falha do rollback logada à parte (só uid técnico), erro ORIGINAL continua sendo a causa", async () => {
        const original = new Error("falha simulada do Firestore set");
        const erroRollback = new Error("falha simulada do deleteUser");
        estado.docSet = async () => { throw original; };
        estado.deleteUser = async () => { throw erroRollback; };

        await assert.rejects(() => createEmployee.run(requestFuncionario()), (e) => assertHttpsError(e, "internal", 500, MENSAGEM));

        const erros = chamadas("error");
        assert.equal(erros.length, 2, "um log do rollback + um log da causa principal");
        const [logRollback, logPrincipal] = erros;
        assert.match(logRollback[0], /^\[Funcionários\] Rollback falhou ao remover usuário Auth órfão/);
        assert.equal(logRollback[1], erroRollback);
        assert.match(logRollback[1].stack, /falha simulada do deleteUser/);
        assert.deepEqual(logRollback[2], { orphanUid: UID_CRIADO }, "só o uid técnico do órfão");
        assert.equal(logPrincipal[1], original, "rollback não substitui a causa principal");
        assertSemSentinelas();
    });

    it("erros esperados (permission-denied, invalid-argument, already-exists): zero log, código e mensagem originais", async () => {
        estado.contexto = { ...estado.contexto, isOwner: false, isAdmin: false };
        await assert.rejects(() => createEmployee.run(requestFuncionario()),
            (e) => assertHttpsError(e, "permission-denied", 403, "Apenas o dono da loja pode gerenciar funcionários."));

        estado = novoEstado();
        const semSenha = requestFuncionario();
        semSenha.data.password = "curta";
        await assert.rejects(() => createEmployee.run(semSenha),
            (e) => assertHttpsError(e, "invalid-argument", 400, "Senha inicial deve ter ao menos 8 caracteres."));

        estado.getUserByEmail = async () => ({ uid: "ja-existe" });
        await assert.rejects(() => createEmployee.run(requestFuncionario()),
            (e) => assertHttpsError(e, "already-exists", 409, "E-mail já cadastrado."));

        assert.equal(totalLogs(), 0, "nenhum log para erro de negócio/autorização");
        assert.equal(estado.deleteCalls.length, 0);
    });

    it("sucesso inalterado: mesmo retorno e nenhum log", async () => {
        const resultado = await createEmployee.run(requestFuncionario());
        assert.equal(resultado.ok, true);
        assert.equal(resultado.uid, UID_CRIADO);
        assert.equal(resultado.status, "ativo");
        assert.equal(totalLogs(), 0);
    });
});

// ================= ERR-SRV-001 — createAdminMember =================
describe("067 ERR-SRV-001 — createAdminMember preserva a causa de erro inesperado", () => {
    const MENSAGEM = "Não foi possível criar membro admin.";

    it("falha inesperada ao gravar a claim: internal/500, Error ORIGINAL logado com stack, sem PII", async () => {
        const original = new Error("falha simulada do setCustomUserClaims");
        estado.setCustomUserClaims = async () => { throw original; };

        await assert.rejects(() => createAdminMember.run(requestAdmin()), (e) => assertHttpsError(e, "internal", 500, MENSAGEM));

        assert.deepEqual(estado.deleteCalls, [UID_CRIADO]);
        const erros = chamadas("error");
        assert.equal(erros.length, 1);
        assert.match(erros[0][0], /^\[Admin\] Falha inesperada ao criar membro admin/);
        assert.equal(erros[0][1], original);
        assert.match(erros[0][1].stack, /falha simulada do setCustomUserClaims[\s\S]*\n\s+at /);
        assertSemSentinelas();
    });

    it("rollback falha: log separado com só o uid órfão; erro original preservado", async () => {
        const original = new Error("falha simulada do Firestore set");
        const erroRollback = new Error("falha simulada do deleteUser admin");
        estado.docSet = async () => { throw original; };
        estado.deleteUser = async () => { throw erroRollback; };

        await assert.rejects(() => createAdminMember.run(requestAdmin()), (e) => assertHttpsError(e, "internal", 500, MENSAGEM));

        const erros = chamadas("error");
        assert.equal(erros.length, 2);
        assert.match(erros[0][0], /^\[Admin\] Rollback falhou ao remover usuário Auth órfão/);
        assert.equal(erros[0][1], erroRollback);
        assert.deepEqual(erros[0][2], { orphanUid: UID_CRIADO });
        assert.equal(erros[1][1], original);
        assertSemSentinelas();
    });

    it("erros esperados (invalid-argument, already-exists): zero log", async () => {
        const invalido = requestAdmin();
        invalido.data.permissoes = [];
        await assert.rejects(() => createAdminMember.run(invalido),
            (e) => assertHttpsError(e, "invalid-argument", 400, "E-mail, senha forte e permissões são obrigatórios."));

        estado.getUserByEmail = async () => ({ uid: "ja-existe" });
        await assert.rejects(() => createAdminMember.run(requestAdmin()),
            (e) => assertHttpsError(e, "already-exists", 409, "E-mail já cadastrado."));

        assert.equal(totalLogs(), 0);
        assert.equal(estado.deleteCalls.length, 0);
    });
});

// ================= ERR-SRV-002 / 004 — IA =================
function instalarFetch(resposta) {
    const chamadasFetch = [];
    mock.method(globalThis, "fetch", async (url, opcoes) => {
        chamadasFetch.push({ url, opcoes });
        if (resposta instanceof Error) throw resposta;
        return {
            ok: resposta.status >= 200 && resposta.status < 300,
            status: resposta.status,
            text: async () => JSON.stringify(resposta.body),
            json: async () => resposta.body
        };
    });
    return chamadasFetch;
}
const requestIaPrivada = () => ({
    auth: { uid: "auth-dono-qa", token: {} },
    data: { pergunta: SENTINELAS.pergunta, historico: [{ autor: "dono", texto: SENTINELAS.historico }] }
});
const requestIaPublica = () => ({
    data: { storeSlug: SENTINELAS.storeSlug, pergunta: SENTINELAS.pergunta, historico: [{ autor: "visitante", texto: SENTINELAS.historico }] }
});
const CORPO_ERRO = { error: { message: SENTINELAS.corpoProvedor } };

const casosIa = [
    ["privada (askBusinessAI)", () => askBusinessAI, requestIaPrivada, "privado"],
    ["pública (askPublicBusinessAI)", () => askPublicBusinessAI, requestIaPublica, "publico"]
];

function assertLogGemini(esperadoStatus) {
    const erros = chamadas("error");
    assert.equal(erros.length, 1, "exatamente um logger.error");
    const [mensagem, erro, campos] = erros[0];
    assert.match(mensagem, /Erro do Gemini/);
    assert.ok(erro instanceof Error, "argumento é um Error");
    assert.match(erro.message, new RegExp(`^GEMINI_HTTP_ERROR: provedor respondeu HTTP ${esperadoStatus}$`));
    assert.match(erro.stack, /GEMINI_HTTP_ERROR[\s\S]*\n\s+at /, "stack presente");
    assert.equal(campos.geminiStatus, esperadoStatus);
    assert.equal(campos.model, esperadoStatus === 500 ? "gemini-3.5-flash-lite" : "gemini-3.8-flash");
    assert.equal(campos.stage, esperadoStatus === 500 ? "fallback" : "primary");
    assert.equal(campos.attempt, esperadoStatus === 500 ? 2 : 1);
    assert.ok(["privado","publico"].includes(campos.caminho));
    assert.equal(campos.kind, "http");
    assert.ok(campos.durationMs >= 0);
    assert.equal(totalLogs(), esperadoStatus === 500 ? 2 : 1);
}

for (const [rotulo, fn, req] of casosIa) {
    describe(`067 ERR-SRV-002 — IA ${rotulo}: resposta não-ok do provedor`, () => {
        it("HTTP 429: continua resource-exhausted/429, um Error com stack e marcador, sem corpo/key/pergunta", async () => {
            const chamadasFetch = instalarFetch({ status: 429, body: CORPO_ERRO });
            await assert.rejects(() => fn().run(req()), (e) => assertHttpsError(e, "resource-exhausted", 429,
                "O provedor de IA está sem créditos disponíveis no momento. Avise o administrador da plataforma."));
            assert.equal(chamadasFetch.length, 1);
            assert.ok(chamadasFetch[0].url.includes(SENTINELAS.apiKey), "sanidade: a key existe no request real");
            assertLogGemini(429);
            assertSemSentinelas();
        });

        it("HTTP 404: continua unavailable/503 com a mesma mensagem, log com stack, sem PII", async () => {
            instalarFetch({ status: 404, body: CORPO_ERRO });
            await assert.rejects(() => fn().run(req()), (e) => assertHttpsError(e, "unavailable", 503,
                "A IA não conseguiu responder agora (modelo \"gemini-3.8-flash\" não encontrado pelo provedor). Avise o administrador da plataforma."));
            assertLogGemini(404);
            assertSemSentinelas();
        });

        it("HTTP 500 do provedor: continua unavailable/503, sem duplicação", async () => {
            instalarFetch({ status: 500, body: CORPO_ERRO });
            await assert.rejects(() => fn().run(req()), (e) => assertHttpsError(e, "unavailable", 503,
                "A IA não conseguiu responder agora (status 500 do provedor). Tente novamente em instantes."));
            assertLogGemini(500);
            assertSemSentinelas();
        });

        it("falha de rede: log existente preservado (um único), unavailable/503", async () => {
            const erroRede = new TypeError("fetch failed");
            instalarFetch(erroRede);
            await assert.rejects(() => fn().run(req()), (e) => assertHttpsError(e, "unavailable", 503));
            const erros = chamadas("error");
            assert.equal(erros.length, 1);
            assert.match(erros[0][0], /Erro do Gemini/);
            assert.notEqual(erros[0][1], erroRede, "não vazar erro de transporte original");
            assert.equal(erros[0][1].message, "GEMINI_NETWORK_ERROR");
            assert.equal(erros[0][2].attempt, 2);
            assert.equal(totalLogs(), 2);
            assertSemSentinelas();
        });
    });
}

for (const [rotulo, fn, req, caminho] of casosIa) {
    describe(`067 ERR-SRV-004 — IA ${rotulo}: resposta sem texto utilizável`, () => {
        it("continua internal/500, deixa Error com stack e marcador, sem resposta/pergunta/histórico", async () => {
            instalarFetch({
                status: 200,
                body: { candidates: [{ content: { parts: [{ text: "   " }] }, finishReason: "SAFETY", extra: SENTINELAS.respostaProvedor }] }
            });
            await assert.rejects(() => fn().run(req()), (e) => assertHttpsError(e, "internal", 500));
            const erros = chamadas("error");
            assert.equal(erros.length, 1, "exatamente um log (o catch externo não duplica HttpsError)");
            const [mensagem, erro, campos] = erros[0];
            assert.match(mensagem, /Gemini sem texto utilizável/);
            assert.ok(erro instanceof Error);
            assert.match(erro.message, /^GEMINI_EMPTY_RESPONSE/);
            assert.match(erro.stack, /GEMINI_EMPTY_RESPONSE[\s\S]*\n\s+at /);
            assert.deepEqual(campos, { caminho });
            assert.equal(totalLogs(), 2, "HTTP200 metadata + único erro funcional, sem conteúdo");
            assertSemSentinelas();
        });

        it("sucesso devolve texto e apenas metadados sanitizados da tentativa", async () => {
            instalarFetch({ status: 200, body: { candidates: [{ content: { parts: [{ text: "Resposta ok" }] } }] } });
            const resultado = await fn().run(req());
            assert.equal(resultado.resposta, "Resposta ok");
            assert.equal(totalLogs(), 1);
            assert.equal(chamadas("error").length, 0);
            assert.deepEqual(chamadas("info")[0][1], {model:"gemini-3.8-flash",attempt:1,stage:"primary",caminho,kind:"success",geminiStatus:200,durationMs:chamadas("info")[0][1].durationMs});
            assertSemSentinelas();
        });
    });
}

describe("067 — erro inesperado da IA mantém o log já existente (sem duplicar)", () => {
    it("falha inesperada no Firestore da cota: um único log, internal/500", async () => {
        const original = new Error("falha simulada da transação de cota");
        mock.method(fakeFirestore, "runTransaction", async () => { throw original; });
        await assert.rejects(() => askBusinessAI.run(requestIaPrivada()), (e) => assertHttpsError(e, "internal", 500,
            "Ocorreu um erro inesperado ao falar com a IA. Tente novamente em instantes."));
        const erros = chamadas("error");
        assert.equal(erros.length, 1);
        assert.match(erros[0][0], /Erro inesperado/);
        assert.equal(erros[0][1], original);
        assertSemSentinelas();
    });
});
