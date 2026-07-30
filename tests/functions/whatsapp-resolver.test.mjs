// Testa resolver.js (Fase 2 — multiconexão) SEM Firestore Emulator: um
// Firestore fake mínimo (doc/collection/where/limit/get), determinístico,
// só o suficiente pra exercitar a ordem de resolução real. Mesmo espírito
// dos outros testes deste diretório — nunca infraestrutura real.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import resolverModule from "../../functions/src/whatsapp/resolver.js";

const { resolverConexao, resolverToken } = resolverModule;

// dados: { whatsapp_connections: { [docId]: {...campos} } }
function criarFakeDb(dados) {
    return {
        doc(caminho) {
            const partes = caminho.split("/");
            const colecao = partes[0];
            const id = partes[1];
            return {
                async get() {
                    const registro = dados[colecao]?.[id];
                    return { exists: Boolean(registro), id, data: () => registro };
                }
            };
        },
        collection(nomeColecao) {
            const filtros = [];
            const query = {
                where(campo, _operador, valor) {
                    filtros.push([campo, valor]);
                    return query;
                },
                limit() {
                    return query;
                },
                async get() {
                    const todos = Object.entries(dados[nomeColecao] || {});
                    const filtrados = todos.filter(([, registro]) =>
                        filtros.every(([campo, valor]) => registro[campo] === valor)
                    );
                    return {
                        empty: filtrados.length === 0,
                        docs: filtrados.map(([id, registro]) => ({ id, data: () => registro }))
                    };
                }
            };
            return query;
        }
    };
}

describe("whatsapp/resolver — resolverConexao (ordem retrocompatível)", () => {
    it("sem ownerUid, nunca resolve nada", async () => {
        const db = criarFakeDb({});
        const resultado = await resolverConexao(db, { ownerUid: "", connectionId: "" });
        assert.equal(resultado.connection, null);
    });

    it("sem nenhuma conexão (nova ou legada), devolve connection null", async () => {
        const db = criarFakeDb({ whatsapp_connections: {} });
        const resultado = await resolverConexao(db, { ownerUid: "owner-1", connectionId: "" });
        assert.equal(resultado.connection, null);
        assert.equal(resultado.legacy, false);
    });

    it("só o documento legado existe -> usa o legado (connectionId vazio)", async () => {
        const db = criarFakeDb({
            whatsapp_connections: {
                "owner-1": { ownerUid: "owner-1", connectionVersion: 1, status: "connected", phoneNumberId: "1000", tokenSecretResource: "projects/p/secrets/legado" }
            }
        });
        const resultado = await resolverConexao(db, { ownerUid: "owner-1", connectionId: "" });
        assert.equal(resultado.legacy, true);
        assert.equal(resultado.connectionId, "");
        assert.equal(resultado.connection.phoneNumberId, "1000");
    });

    it("connectionId explícito e válido (pertence ao tenant) -> usa exatamente essa conexão, mesmo havendo default diferente", async () => {
        const db = criarFakeDb({
            whatsapp_connections: {
                "conn-A": { ownerUid: "owner-1", connectionVersion: 2, isDefault: true, phoneNumberId: "AAA", tokenSecretResource: "projects/p/secrets/a" },
                "conn-B": { ownerUid: "owner-1", connectionVersion: 2, isDefault: false, phoneNumberId: "BBB", tokenSecretResource: "projects/p/secrets/b" }
            }
        });
        const resultado = await resolverConexao(db, { ownerUid: "owner-1", connectionId: "conn-B" });
        assert.equal(resultado.legacy, false);
        assert.equal(resultado.connectionId, "conn-B");
        assert.equal(resultado.connection.phoneNumberId, "BBB");
    });

    // Revisão: um connectionId EXPLÍCITO de outro tenant (ou inexistente)
    // NUNCA mais cai silenciosamente pro default — antes disso era
    // exatamente o achado real da revisão: pedir uma conexão específica
    // que não existia mais fazia o backend operar sobre OUTRA conexão sem
    // avisar. Agora devolve connection:null + connectionIdInvalido:true,
    // e quem chama (send.js/templates.js) transforma isso num erro
    // explícito (WHATSAPP_CONNECTION_MISMATCH), nunca num fallback mudo.
    it("connectionId de OUTRO tenant nunca é aceito — NUNCA cai pro default, vira connectionIdInvalido", async () => {
        const db = criarFakeDb({
            whatsapp_connections: {
                "conn-outro-tenant": { ownerUid: "owner-INVASOR", connectionVersion: 2, isDefault: true, phoneNumberId: "XXX", tokenSecretResource: "projects/p/secrets/x" },
                "conn-A": { ownerUid: "owner-1", connectionVersion: 2, isDefault: true, phoneNumberId: "AAA", tokenSecretResource: "projects/p/secrets/a" }
            }
        });
        const resultado = await resolverConexao(db, { ownerUid: "owner-1", connectionId: "conn-outro-tenant" });
        assert.equal(resultado.connection, null);
        assert.equal(resultado.connectionIdInvalido, true);
    });

    it("sem connectionId, usa a conexão default do modelo novo (nunca a legada, se o modelo novo já existe)", async () => {
        const db = criarFakeDb({
            whatsapp_connections: {
                "owner-1": { ownerUid: "owner-1", connectionVersion: 1, phoneNumberId: "LEGADO", tokenSecretResource: "projects/p/secrets/legado" },
                "conn-A": { ownerUid: "owner-1", connectionVersion: 2, isDefault: true, phoneNumberId: "NOVO", tokenSecretResource: "projects/p/secrets/a" }
            }
        });
        const resultado = await resolverConexao(db, { ownerUid: "owner-1", connectionId: "" });
        assert.equal(resultado.legacy, false);
        assert.equal(resultado.connection.phoneNumberId, "NOVO");
    });

    it("connectionId inexistente NUNCA cai pro default nem pro legado — vira connectionIdInvalido", async () => {
        const db = criarFakeDb({
            whatsapp_connections: {
                "owner-1": { ownerUid: "owner-1", connectionVersion: 1, phoneNumberId: "LEGADO", tokenSecretResource: "projects/p/secrets/legado" },
                "conn-A": { ownerUid: "owner-1", connectionVersion: 2, isDefault: true, phoneNumberId: "NOVO", tokenSecretResource: "projects/p/secrets/a" }
            }
        });
        const resultado = await resolverConexao(db, { ownerUid: "owner-1", connectionId: "conn-que-nao-existe" });
        assert.equal(resultado.connection, null);
        assert.equal(resultado.connectionIdInvalido, true);
    });

    it("sem nenhum alvo explícito (connectionId vazio, legacy ausente) continua caindo no fallback normal — connectionIdInvalido nunca true aqui", async () => {
        const db = criarFakeDb({
            whatsapp_connections: {
                "conn-A": { ownerUid: "owner-1", connectionVersion: 2, isDefault: true, phoneNumberId: "NOVO", tokenSecretResource: "projects/p/secrets/a" }
            }
        });
        const resultado = await resolverConexao(db, { ownerUid: "owner-1", connectionId: "" });
        assert.equal(resultado.connectionIdInvalido, false);
        assert.equal(resultado.connection.phoneNumberId, "NOVO");
    });

    it("legacy:true explícito só aceita o documento legado, nunca a conexão nova default", async () => {
        const db = criarFakeDb({
            whatsapp_connections: {
                "owner-1": { ownerUid: "owner-1", connectionVersion: 1, phoneNumberId: "LEGADO", tokenSecretResource: "projects/p/secrets/legado" },
                "conn-A": { ownerUid: "owner-1", connectionVersion: 2, isDefault: true, phoneNumberId: "NOVO", tokenSecretResource: "projects/p/secrets/a" }
            }
        });
        const resultado = await resolverConexao(db, { ownerUid: "owner-1", legacy: true });
        assert.equal(resultado.legacy, true);
        assert.equal(resultado.connection.phoneNumberId, "LEGADO");
        assert.equal(resultado.connectionIdInvalido, false);
    });

    it("legacy:true sem documento legado nunca inventa/usa a conexão nova — vira connectionIdInvalido", async () => {
        const db = criarFakeDb({
            whatsapp_connections: {
                "conn-A": { ownerUid: "owner-1", connectionVersion: 2, isDefault: true, phoneNumberId: "NOVO", tokenSecretResource: "projects/p/secrets/a" }
            }
        });
        const resultado = await resolverConexao(db, { ownerUid: "owner-1", legacy: true });
        assert.equal(resultado.connection, null);
        assert.equal(resultado.connectionIdInvalido, true);
    });

    it("legacy:true tem prioridade sobre um connectionId eventualmente presente na mesma chamada", async () => {
        const db = criarFakeDb({
            whatsapp_connections: {
                "owner-1": { ownerUid: "owner-1", connectionVersion: 1, phoneNumberId: "LEGADO", tokenSecretResource: "projects/p/secrets/legado" },
                "conn-A": { ownerUid: "owner-1", connectionVersion: 2, isDefault: true, phoneNumberId: "NOVO", tokenSecretResource: "projects/p/secrets/a" }
            }
        });
        const resultado = await resolverConexao(db, { ownerUid: "owner-1", connectionId: "conn-A", legacy: true });
        assert.equal(resultado.legacy, true);
        assert.equal(resultado.connection.phoneNumberId, "LEGADO");
    });

    it("nunca mistura conexões entre dois tenants diferentes no mesmo processo", async () => {
        const db = criarFakeDb({
            whatsapp_connections: {
                "owner-A": { ownerUid: "owner-A", connectionVersion: 1, phoneNumberId: "A", tokenSecretResource: "projects/p/secrets/a" },
                "owner-B": { ownerUid: "owner-B", connectionVersion: 1, phoneNumberId: "B", tokenSecretResource: "projects/p/secrets/b" }
            }
        });
        const resultadoA = await resolverConexao(db, { ownerUid: "owner-A", connectionId: "" });
        const resultadoB = await resolverConexao(db, { ownerUid: "owner-B", connectionId: "" });
        assert.equal(resultadoA.connection.phoneNumberId, "A");
        assert.equal(resultadoB.connection.phoneNumberId, "B");
    });
});

describe("whatsapp/resolver — resolverToken (sempre por tokenSecretResource)", () => {
    it("conexão sem tokenSecretResource nunca finge sucesso — lança WHATSAPP_NOT_CONNECTED", async () => {
        await assert.rejects(
            () => resolverToken({ connection: { phoneNumberId: "1" } }),
            (erro) => erro.code === "WHATSAPP_NOT_CONNECTED"
        );
    });

    it("connection null (nada resolvido) também lança WHATSAPP_NOT_CONNECTED", async () => {
        await assert.rejects(
            () => resolverToken({ connection: null }),
            (erro) => erro.code === "WHATSAPP_NOT_CONNECTED"
        );
    });
});
