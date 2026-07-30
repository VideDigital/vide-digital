// Revisão (multiconexão): testa connections.js — aplicarConexaoPadrao
// (whatsappSetDefaultConnection) SEM Firestore Emulator. Achado real da
// revisão: ler o estado atual e escrever num batch SEPARADO tinha uma
// corrida — duas chamadas concorrentes (cada uma escolhendo uma conexão
// default DIFERENTE) podiam terminar com DUAS conexões marcadas como
// isDefault:true. A correção usa uma transação; o Firestore garante que
// transações concorrentes que leem/escrevem os MESMOS documentos são
// serializadas (uma tenta de novo até ver o resultado da outra). Este
// fake não reimplementa esse mecanismo de retry do Firestore (é do
// próprio serviço, fora do escopo testável sem emulador) — ele prova que
// a LÓGICA do corpo da transação está correta sob execução serializada,
// que é exatamente o que o Firestore garante de verdade.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import connections from "../../functions/src/whatsapp/connections.js";

const { aplicarConexaoPadrao } = connections;

// dados: { whatsapp_connections: { [id]: {...} } }
function criarFakeDb(dados) {
    const store = dados;

    function docRef(colecao, id) {
        return {
            id,
            _colecao: colecao,
            async get() {
                const registro = store[colecao]?.[id];
                return { exists: Boolean(registro), id, data: () => registro };
            }
        };
    }

    function criarQuery(colecao, filtros) {
        return {
            _isQuery: true,
            _colecao: colecao,
            _filtros: filtros,
            where(campo, _op, valor) {
                return criarQuery(colecao, [...filtros, [campo, valor]]);
            }
        };
    }

    return {
        doc(caminho) {
            const [colecao, id] = caminho.split("/");
            return docRef(colecao, id);
        },
        collection(nomeColecao) {
            return criarQuery(nomeColecao, []);
        },
        async runTransaction(callback) {
            const tx = {
                async get(refOrQuery) {
                    if (refOrQuery._isQuery) {
                        const todos = Object.entries(store[refOrQuery._colecao] || {});
                        const filtrados = todos.filter(([, registro]) =>
                            refOrQuery._filtros.every(([campo, valor]) => registro[campo] === valor)
                        );
                        return { docs: filtrados.map(([id, registro]) => ({ id, ref: docRef(refOrQuery._colecao, id), data: () => registro })) };
                    }
                    return refOrQuery.get();
                },
                set(ref, valor, opcoes) {
                    if (!store[ref._colecao]) store[ref._colecao] = {};
                    const atual = store[ref._colecao][ref.id] || {};
                    store[ref._colecao][ref.id] = opcoes?.merge ? { ...atual, ...valor } : { ...valor };
                }
            };
            return callback(tx);
        }
    };
}

const OWNER = "owner-1";

describe("whatsapp/connections — aplicarConexaoPadrao (revisão: transação atômica)", () => {
    it("caminho feliz: torna a conexão alvo default e desliga a antiga", async () => {
        const dados = {
            whatsapp_connections: {
                "conn-A": { ownerUid: OWNER, connectionVersion: 2, isDefault: true, status: "connected", label: "A" },
                "conn-B": { ownerUid: OWNER, connectionVersion: 2, isDefault: false, status: "connected", label: "B" }
            }
        };
        const db = criarFakeDb(dados);
        const resultado = await aplicarConexaoPadrao(db, { ownerUid: OWNER, connectionId: "conn-B", authUid: "u1" });
        assert.equal(resultado.label, "B");
        assert.equal(dados.whatsapp_connections["conn-A"].isDefault, false);
        assert.equal(dados.whatsapp_connections["conn-B"].isDefault, true);
    });

    it("rejeita conexão de outro tenant, mesmo com connectionId válido", async () => {
        const dados = { whatsapp_connections: { "conn-alheia": { ownerUid: "owner-OUTRO", connectionVersion: 2, isDefault: true, status: "connected" } } };
        const db = criarFakeDb(dados);
        await assert.rejects(() => aplicarConexaoPadrao(db, { ownerUid: OWNER, connectionId: "conn-alheia", authUid: "u1" }));
    });

    it("rejeita a conexão LEGADA (connectionVersion 1) — ela não tem conceito de isDefault", async () => {
        const dados = { whatsapp_connections: { [OWNER]: { ownerUid: OWNER, connectionVersion: 1, status: "connected" } } };
        const db = criarFakeDb(dados);
        await assert.rejects(() => aplicarConexaoPadrao(db, { ownerUid: OWNER, connectionId: OWNER, authUid: "u1" }));
    });

    it("rejeita conexão desconectada/revogada", async () => {
        const dados = { whatsapp_connections: { "conn-A": { ownerUid: OWNER, connectionVersion: 2, status: "revoked" } } };
        const db = criarFakeDb(dados);
        await assert.rejects(() => aplicarConexaoPadrao(db, { ownerUid: OWNER, connectionId: "conn-A", authUid: "u1" }));
    });

    it("connectionId inexistente é rejeitado", async () => {
        const db = criarFakeDb({ whatsapp_connections: {} });
        await assert.rejects(() => aplicarConexaoPadrao(db, { ownerUid: OWNER, connectionId: "nao-existe", authUid: "u1" }));
    });

    it("sem nenhuma outra conexão default, só marca o alvo — nunca falha por não ter o que desligar", async () => {
        const dados = { whatsapp_connections: { "conn-A": { ownerUid: OWNER, connectionVersion: 2, isDefault: false, status: "connected" } } };
        const db = criarFakeDb(dados);
        await aplicarConexaoPadrao(db, { ownerUid: OWNER, connectionId: "conn-A", authUid: "u1" });
        assert.equal(dados.whatsapp_connections["conn-A"].isDefault, true);
    });

    it("achado real: duas chamadas escolhendo conexões DIFERENTES, executadas em sequência (o que o Firestore garante via serialização de transações concorrentes), nunca deixam duas defaults", async () => {
        const dados = {
            whatsapp_connections: {
                "conn-A": { ownerUid: OWNER, connectionVersion: 2, isDefault: true, status: "connected", label: "A" },
                "conn-B": { ownerUid: OWNER, connectionVersion: 2, isDefault: false, status: "connected", label: "B" },
                "conn-C": { ownerUid: OWNER, connectionVersion: 2, isDefault: false, status: "connected", label: "C" }
            }
        };
        const db = criarFakeDb(dados);

        await aplicarConexaoPadrao(db, { ownerUid: OWNER, connectionId: "conn-B", authUid: "u1" });
        await aplicarConexaoPadrao(db, { ownerUid: OWNER, connectionId: "conn-C", authUid: "u2" });

        const defaults = Object.values(dados.whatsapp_connections).filter((c) => c.isDefault);
        assert.equal(defaults.length, 1, "nunca pode haver mais de uma conexão default");
        assert.equal(defaults[0].label, "C");
    });
});
