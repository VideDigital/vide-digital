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

    it("connectionId de OUTRO tenant nunca é aceito — cai pro default do tenant certo", async () => {
        const db = criarFakeDb({
            whatsapp_connections: {
                "conn-outro-tenant": { ownerUid: "owner-INVASOR", connectionVersion: 2, isDefault: true, phoneNumberId: "XXX", tokenSecretResource: "projects/p/secrets/x" },
                "conn-A": { ownerUid: "owner-1", connectionVersion: 2, isDefault: true, phoneNumberId: "AAA", tokenSecretResource: "projects/p/secrets/a" }
            }
        });
        const resultado = await resolverConexao(db, { ownerUid: "owner-1", connectionId: "conn-outro-tenant" });
        assert.equal(resultado.connectionId, "conn-A");
        assert.notEqual(resultado.connection.phoneNumberId, "XXX");
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

    it("connectionId inexistente cai pro default novo, e não pro legado, quando o modelo novo existe", async () => {
        const db = criarFakeDb({
            whatsapp_connections: {
                "owner-1": { ownerUid: "owner-1", connectionVersion: 1, phoneNumberId: "LEGADO", tokenSecretResource: "projects/p/secrets/legado" },
                "conn-A": { ownerUid: "owner-1", connectionVersion: 2, isDefault: true, phoneNumberId: "NOVO", tokenSecretResource: "projects/p/secrets/a" }
            }
        });
        const resultado = await resolverConexao(db, { ownerUid: "owner-1", connectionId: "conn-que-nao-existe" });
        assert.equal(resultado.connection.phoneNumberId, "NOVO");
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
