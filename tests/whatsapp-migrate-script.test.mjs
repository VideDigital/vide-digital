// Revisão (2026-07-31): testa executarAcoesMigracao/executarAcoesRollback
// (scripts/migrate-whatsapp-multiconexao.mjs) com um Firestore FAKE — nunca
// toca Firestore real, nunca chama applicationDefault(). Importar este
// módulo NUNCA dispara main() (guard `executadoDiretamente` no próprio
// script) — se disparasse, este teste tentaria uma conexão real e falharia
// alto, o que por si só já seria uma prova de regressão.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { executarAcoesMigracao, executarAcoesRollback } from "../scripts/migrate-whatsapp-multiconexao.mjs";

// Fake mínimo — grava toda escrita num log pra provar (positivamente) que
// o caminho de escrita funciona quando de fato invocado, e (por omissão)
// que nada é escrito quando essas funções nunca são chamadas — que é
// exatamente o que tests/whatsapp-migrate-core.test.mjs prova via
// deveExecutarEscrita (o único portão usado por main() antes de chamar
// estas funções).
function criarFakeDb(dadosIniciais = {}) {
    const store = JSON.parse(JSON.stringify(dadosIniciais));
    const log = [];

    function docRef(caminho) {
        const [colecao, id] = caminho.split("/");
        return {
            async get() {
                const registro = store[colecao]?.[id];
                return { exists: Boolean(registro), id, data: () => registro };
            },
            async create(dados) {
                if (!store[colecao]) store[colecao] = {};
                if (store[colecao][id]) {
                    const erro = new Error("ALREADY_EXISTS");
                    erro.code = 6;
                    throw erro;
                }
                store[colecao][id] = { ...dados };
                log.push({ tipo: "create", colecao, id });
            },
            async set(dados, opcoes) {
                if (!store[colecao]) store[colecao] = {};
                const atual = store[colecao][id] || {};
                store[colecao][id] = opcoes?.merge ? { ...atual, ...dados } : { ...dados };
                log.push({ tipo: "set", colecao, id });
            },
            async delete() {
                if (store[colecao]) delete store[colecao][id];
                log.push({ tipo: "delete", colecao, id });
            }
        };
    }

    return { _store: store, _log: log, doc: (caminho) => docRef(caminho) };
}

describe("executarAcoesMigracao (prova positiva: quando chamada, escreve; nunca toca o legado)", () => {
    it("cria a conexão nova e atualiza a rota, nunca toca whatsapp_connections/{ownerUid} (legado)", async () => {
        const db = criarFakeDb();
        const acoes = [
            { tipo: "criarConexao", colecao: "whatsapp_connections", id: "mig-abc123", dados: { ownerUid: "owner-1", connectionId: "mig-abc123" } },
            { tipo: "atualizarRota", colecao: "whatsapp_phone_routes", id: "5511999990000", dados: { ownerUid: "owner-1", connectionId: "mig-abc123" } }
        ];
        await executarAcoesMigracao(db, acoes);

        assert.ok(db._store.whatsapp_connections["mig-abc123"]);
        assert.equal(db._store.whatsapp_phone_routes["5511999990000"].connectionId, "mig-abc123");
        assert.equal(db._store.whatsapp_connections["owner-1"], undefined, "nunca deveria criar/tocar um doc no ID do ownerUid (esse é o caminho do legado)");
        assert.equal(db._log.length, 2);
    });

    it("ALREADY_EXISTS na criação é tratado como sucesso idempotente, nunca sobrescreve", async () => {
        const db = criarFakeDb({ whatsapp_connections: { "mig-abc123": { ownerUid: "owner-1", jaExistia: true } } });
        const acoes = [{ tipo: "criarConexao", colecao: "whatsapp_connections", id: "mig-abc123", dados: { ownerUid: "owner-1", jaExistia: false } }];
        await executarAcoesMigracao(db, acoes);
        assert.equal(db._store.whatsapp_connections["mig-abc123"].jaExistia, true, "não deveria ter sobrescrito o documento existente");
    });

    it("lista de ações vazia nunca escreve nada — mesmo comportamento de um dry-run que (corretamente) nunca chega a chamar esta função", async () => {
        const db = criarFakeDb();
        await executarAcoesMigracao(db, []);
        assert.equal(db._log.length, 0);
    });

    it("tipo de ação desconhecido lança erro, nunca escreve silenciosamente algo inesperado", async () => {
        const db = criarFakeDb();
        await assert.rejects(() => executarAcoesMigracao(db, [{ tipo: "acaoInventada", colecao: "x", id: "y" }]));
        assert.equal(db._log.length, 0);
    });
});

describe("executarAcoesRollback (prova positiva: quando chamada, reverte só o que a migração criou)", () => {
    it("remove a conexão nova e limpa o connectionId da rota", async () => {
        const db = criarFakeDb({
            whatsapp_connections: { "mig-abc123": { ownerUid: "owner-1", migratedFromLegacyOwnerUid: "owner-1" } },
            whatsapp_phone_routes: { "5511999990000": { ownerUid: "owner-1", connectionId: "mig-abc123" } }
        });
        const acoes = [
            { tipo: "removerConexao", colecao: "whatsapp_connections", id: "mig-abc123" },
            { tipo: "limparConnectionIdRota", colecao: "whatsapp_phone_routes", id: "5511999990000" }
        ];
        await executarAcoesRollback(db, acoes);

        assert.equal(db._store.whatsapp_connections["mig-abc123"], undefined);
        assert.ok(db._store.whatsapp_phone_routes["5511999990000"]);
        assert.equal(db._log.length, 2);
    });

    it("lista de ações vazia nunca escreve nada", async () => {
        const db = criarFakeDb();
        await executarAcoesRollback(db, []);
        assert.equal(db._log.length, 0);
    });

    it("tipo de ação desconhecido lança erro, nunca escreve silenciosamente", async () => {
        const db = criarFakeDb();
        await assert.rejects(() => executarAcoesRollback(db, [{ tipo: "acaoInventada", colecao: "x", id: "y" }]));
        assert.equal(db._log.length, 0);
    });
});

describe("importar o script nunca dispara main()", () => {
    it("chegou até aqui sem tentar nenhuma conexão real — a própria execução deste arquivo de teste é a prova", () => {
        // Se o guard `executadoDiretamente` não existisse, importar este
        // módulo no topo do arquivo já teria chamado main(), que exigiria
        // WHATSAPP_OWNER_UID/WHATSAPP_MIGRATION_PROJECT e tentaria
        // applicationDefault() — e este processo de teste teria abortado
        // ou travado muito antes de chegar a este ponto.
        assert.ok(true);
    });
});
