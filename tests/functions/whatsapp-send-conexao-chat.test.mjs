// Revisão (multiconexão): testa send.js — carregarConexaoResolvida /
// carregarConexaoDoChat — SEM Firestore Emulator. Achado real da revisão:
// um alvo explícito (connectionId do chat, ou legacy:true) que não
// resolvia caía silenciosamente pro default/legado, permitindo enviar
// pelo número ERRADO. Estes testes provam que isso agora sempre falha
// com WHATSAPP_CONNECTION_MISMATCH, nunca com sucesso silencioso.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import send from "../../functions/src/whatsapp/send.js";
import { ERROR_CODES } from "../../functions/src/whatsapp/constants.js";

const { carregarConexaoResolvida, carregarConexaoDoChat } = send;

// Mesmo fake mínimo de tests/functions/whatsapp-resolver.test.mjs — doc/
// collection/where/limit/get, o suficiente pra resolver.js funcionar.
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

describe("whatsapp/send — carregarConexaoResolvida (revisão: alvo explícito inválido nunca cai no default)", () => {
    it("connectionId explícito inexistente lança WHATSAPP_CONNECTION_MISMATCH, mesmo havendo um default válido", async () => {
        const db = criarFakeDb({
            whatsapp_connections: {
                "conn-A": { ownerUid: "owner-1", connectionVersion: 2, isDefault: true, status: "connected", phoneNumberId: "AAA", tokenSecretResource: "projects/p/secrets/a" }
            }
        });
        await assert.rejects(
            () => carregarConexaoResolvida(db, { ownerUid: "owner-1", connectionId: "conn-que-nao-existe" }),
            (erro) => erro.details?.code === ERROR_CODES.CONNECTION_MISMATCH
        );
    });

    it("legacy:true sem documento legado lança WHATSAPP_CONNECTION_MISMATCH, nunca usa a conexão nova default", async () => {
        const db = criarFakeDb({
            whatsapp_connections: {
                "conn-A": { ownerUid: "owner-1", connectionVersion: 2, isDefault: true, status: "connected", phoneNumberId: "AAA", tokenSecretResource: "projects/p/secrets/a" }
            }
        });
        await assert.rejects(
            () => carregarConexaoResolvida(db, { ownerUid: "owner-1", legacy: true }),
            (erro) => erro.details?.code === ERROR_CODES.CONNECTION_MISMATCH
        );
    });

    it("connectionId válido resolve normalmente", async () => {
        const db = criarFakeDb({
            whatsapp_connections: {
                "conn-A": { ownerUid: "owner-1", connectionVersion: 2, isDefault: true, status: "connected", phoneNumberId: "AAA", tokenSecretResource: "projects/p/secrets/a" }
            }
        });
        const resolvido = await carregarConexaoResolvida(db, { ownerUid: "owner-1", connectionId: "conn-A" });
        assert.equal(resolvido.connection.phoneNumberId, "AAA");
    });

    it("sem nenhum alvo explícito, nenhuma conexão configurada -> WHATSAPP_NOT_CONNECTED (nunca CONNECTION_MISMATCH)", async () => {
        const db = criarFakeDb({});
        await assert.rejects(
            () => carregarConexaoResolvida(db, { ownerUid: "owner-1" }),
            (erro) => erro.details?.code === ERROR_CODES.NOT_CONNECTED
        );
    });
});

describe("whatsapp/send — carregarConexaoDoChat (revisão: nunca responde por um número diferente do que originou a conversa)", () => {
    it("chat SEM whatsappConnectionId (legado) sempre pede a conexão legada explicitamente — nunca a nova default", async () => {
        const db = criarFakeDb({
            whatsapp_connections: {
                "owner-1": { ownerUid: "owner-1", connectionVersion: 1, status: "connected", phoneNumberId: "LEGADO", tokenSecretResource: "projects/p/secrets/legado" },
                "conn-A": { ownerUid: "owner-1", connectionVersion: 2, isDefault: true, status: "connected", phoneNumberId: "NOVO", tokenSecretResource: "projects/p/secrets/a" }
            }
        });
        const resolvido = await carregarConexaoDoChat(db, { ownerUid: "owner-1", chat: { canal: "whatsapp" } });
        assert.equal(resolvido.legacy, true);
        assert.equal(resolvido.connection.phoneNumberId, "LEGADO");
    });

    it("achado real: chat legado nunca passa a responder pela conexão nova, mesmo depois dela virar default", async () => {
        // Cenário do achado: a loja tinha só o piloto legado quando a
        // conversa começou; depois uma segunda conexão foi criada e virou
        // default. Sem a correção, isso faria o chat legado responder
        // pela conexão NOVA (silenciosamente, porque chat.whatsappConnectionId
        // é undefined e o fallback ia direto pro default).
        const db = criarFakeDb({
            whatsapp_connections: {
                "owner-1": { ownerUid: "owner-1", connectionVersion: 1, status: "connected", phoneNumberId: "LEGADO", tokenSecretResource: "projects/p/secrets/legado" },
                "conn-nova": { ownerUid: "owner-1", connectionVersion: 2, isDefault: true, status: "connected", phoneNumberId: "NOVO", tokenSecretResource: "projects/p/secrets/nova" }
            }
        });
        const resolvido = await carregarConexaoDoChat(db, { ownerUid: "owner-1", chat: { canal: "whatsapp" } });
        assert.equal(resolvido.connection.phoneNumberId, "LEGADO", "nunca deveria responder pela conexão nova");
    });

    it("chat COM whatsappConnectionId pede exatamente essa conexão — falha se ela não existir mais (nunca usa outra)", async () => {
        const db = criarFakeDb({
            whatsapp_connections: {
                "conn-default-atual": { ownerUid: "owner-1", connectionVersion: 2, isDefault: true, status: "connected", phoneNumberId: "OUTRA", tokenSecretResource: "projects/p/secrets/outra" }
            }
        });
        await assert.rejects(
            () => carregarConexaoDoChat(db, { ownerUid: "owner-1", chat: { canal: "whatsapp", whatsappConnectionId: "conn-que-foi-removida" } }),
            (erro) => erro.details?.code === ERROR_CODES.CONNECTION_MISMATCH
        );
    });

    it("chat COM whatsappConnectionId válido resolve exatamente essa conexão, mesmo com um default diferente", async () => {
        const db = criarFakeDb({
            whatsapp_connections: {
                "conn-origem": { ownerUid: "owner-1", connectionVersion: 2, isDefault: false, status: "connected", phoneNumberId: "ORIGEM", tokenSecretResource: "projects/p/secrets/origem" },
                "conn-default-atual": { ownerUid: "owner-1", connectionVersion: 2, isDefault: true, status: "connected", phoneNumberId: "OUTRA", tokenSecretResource: "projects/p/secrets/outra" }
            }
        });
        const resolvido = await carregarConexaoDoChat(db, { ownerUid: "owner-1", chat: { canal: "whatsapp", whatsappConnectionId: "conn-origem" } });
        assert.equal(resolvido.connection.phoneNumberId, "ORIGEM");
    });
});
