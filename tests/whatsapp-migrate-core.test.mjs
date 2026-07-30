import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    STATUS_MIGRACAO,
    STATUS_ROLLBACK,
    gerarConnectionIdMigracao,
    validarOwnerUid,
    validarPhoneNumberId,
    construirPlanoMigracao,
    construirPlanoRollback,
    formatarRelatorio
} from "../scripts/whatsapp-migrate-core.mjs";

const LEGADO_OK = Object.freeze({
    ownerUid: "owner-1",
    status: "connected",
    phoneNumberId: "123456789",
    displayPhoneNumber: "+55 11 90000-0000",
    verifiedName: "Loja Teste",
    qualityRating: "GREEN",
    wabaId: "987654321",
    graphVersion: "v25.0",
    tokenSecretResource: "projects/p/secrets/vide-whatsapp-token-abc",
    connectionVersion: 1
});

describe("gerarConnectionIdMigracao", () => {
    it("é determinístico — mesmo ownerUid+phoneNumberId sempre gera o mesmo id", () => {
        const a = gerarConnectionIdMigracao("owner-1", "123456789");
        const b = gerarConnectionIdMigracao("owner-1", "123456789");
        assert.equal(a, b);
    });

    it("nunca colide entre tenants diferentes", () => {
        const a = gerarConnectionIdMigracao("owner-1", "123456789");
        const b = gerarConnectionIdMigracao("owner-2", "123456789");
        assert.notEqual(a, b);
    });

    it("sempre começa com o prefixo mig-", () => {
        assert.match(gerarConnectionIdMigracao("owner-1", "123456789"), /^mig-[a-f0-9]{20}$/);
    });
});

describe("validarOwnerUid / validarPhoneNumberId", () => {
    it("aceita ownerUid alfanumérico razoável", () => {
        assert.equal(validarOwnerUid("owner-1"), true);
        assert.equal(validarOwnerUid("AbC123_xyz"), true);
    });

    it("rejeita ownerUid vazio, curto demais ou com caracteres perigosos", () => {
        assert.equal(validarOwnerUid(""), false);
        assert.equal(validarOwnerUid("ab"), false);
        assert.equal(validarOwnerUid("owner/../etc"), false);
    });

    it("aceita só phoneNumberId numérico", () => {
        assert.equal(validarPhoneNumberId("123456789"), true);
        assert.equal(validarPhoneNumberId("abc123"), false);
        assert.equal(validarPhoneNumberId(""), false);
    });
});

describe("construirPlanoMigracao", () => {
    it("sem documento legado -> status sem_legado, nenhuma ação", () => {
        const plano = construirPlanoMigracao({ ownerUid: "owner-1", legado: null, rota: null, novoExistente: false });
        assert.equal(plano.status, STATUS_MIGRACAO.SEM_LEGADO);
        assert.deepEqual(plano.acoes, []);
    });

    it("ownerUid inválido -> status invalida, nenhuma ação", () => {
        const plano = construirPlanoMigracao({ ownerUid: "", legado: LEGADO_OK, rota: null, novoExistente: false });
        assert.equal(plano.status, STATUS_MIGRACAO.INVALIDA);
        assert.deepEqual(plano.acoes, []);
    });

    it("ownerUid do documento legado divergente -> invalida, nunca migra dado incerto", () => {
        const legadoDivergente = { ...LEGADO_OK, ownerUid: "owner-OUTRO" };
        const plano = construirPlanoMigracao({ ownerUid: "owner-1", legado: legadoDivergente, rota: null, novoExistente: false });
        assert.equal(plano.status, STATUS_MIGRACAO.INVALIDA);
    });

    it("connectionVersion inesperado no legado -> invalida", () => {
        const legadoErrado = { ...LEGADO_OK, connectionVersion: 2 };
        const plano = construirPlanoMigracao({ ownerUid: "owner-1", legado: legadoErrado, rota: null, novoExistente: false });
        assert.equal(plano.status, STATUS_MIGRACAO.INVALIDA);
    });

    it("phoneNumberId inválido no legado -> invalida", () => {
        const legadoSemFone = { ...LEGADO_OK, phoneNumberId: "" };
        const plano = construirPlanoMigracao({ ownerUid: "owner-1", legado: legadoSemFone, rota: null, novoExistente: false });
        assert.equal(plano.status, STATUS_MIGRACAO.INVALIDA);
    });

    it("sem tokenSecretResource -> invalida, nunca infere/copia token", () => {
        const legadoSemToken = { ...LEGADO_OK, tokenSecretResource: "" };
        const plano = construirPlanoMigracao({ ownerUid: "owner-1", legado: legadoSemToken, rota: null, novoExistente: false });
        assert.equal(plano.status, STATUS_MIGRACAO.INVALIDA);
    });

    it("conexão nova já existe -> ja_migrada, idempotente, nenhuma ação", () => {
        const plano = construirPlanoMigracao({ ownerUid: "owner-1", legado: LEGADO_OK, rota: null, novoExistente: true });
        assert.equal(plano.status, STATUS_MIGRACAO.JA_MIGRADA);
        assert.deepEqual(plano.acoes, []);
        assert.ok(plano.connectionId);
    });

    it("rota de outro ownerUid -> invalida, abortado por segurança", () => {
        const rotaAlheia = { ownerUid: "owner-INVASOR", connectionStatus: "connected" };
        const plano = construirPlanoMigracao({ ownerUid: "owner-1", legado: LEGADO_OK, rota: rotaAlheia, novoExistente: false });
        assert.equal(plano.status, STATUS_MIGRACAO.INVALIDA);
    });

    it("caminho feliz -> pronta, com as 2 ações esperadas, nunca inclui valor de token", () => {
        const plano = construirPlanoMigracao({ ownerUid: "owner-1", legado: LEGADO_OK, rota: null, novoExistente: false });
        assert.equal(plano.status, STATUS_MIGRACAO.PRONTA);
        assert.equal(plano.acoes.length, 2);

        const acaoConexao = plano.acoes.find((a) => a.tipo === "criarConexao");
        assert.equal(acaoConexao.colecao, "whatsapp_connections");
        assert.equal(acaoConexao.id, plano.connectionId);
        assert.equal(acaoConexao.dados.connectionVersion, 2);
        assert.equal(acaoConexao.dados.isDefault, true);
        assert.equal(acaoConexao.dados.ownerUid, "owner-1");
        assert.equal(acaoConexao.dados.tokenSecretResource, LEGADO_OK.tokenSecretResource);
        assert.equal(acaoConexao.dados.migratedFromLegacyOwnerUid, "owner-1");

        const acaoRota = plano.acoes.find((a) => a.tipo === "atualizarRota");
        assert.equal(acaoRota.colecao, "whatsapp_phone_routes");
        assert.equal(acaoRota.id, LEGADO_OK.phoneNumberId);
        assert.equal(acaoRota.dados.connectionId, plano.connectionId);
    });

    it("rota já existente sem connectionId -> sem aviso de conflito, mas atualiza normalmente", () => {
        const rotaExistente = { ownerUid: "owner-1", connectionStatus: "connected" };
        const plano = construirPlanoMigracao({ ownerUid: "owner-1", legado: LEGADO_OK, rota: rotaExistente, novoExistente: false });
        assert.equal(plano.status, STATUS_MIGRACAO.PRONTA);
    });

    it("rota já aponta pra outro connectionId -> aviso de sobrescrita, mas ainda pronta", () => {
        const rotaComOutroId = { ownerUid: "owner-1", connectionId: "conn-outro", connectionStatus: "connected" };
        const plano = construirPlanoMigracao({ ownerUid: "owner-1", legado: LEGADO_OK, rota: rotaComOutroId, novoExistente: false });
        assert.equal(plano.status, STATUS_MIGRACAO.PRONTA);
        assert.ok(plano.avisos.some((a) => a.includes("connectionId diferente")));
    });

    it("rodar duas vezes sobre o mesmo legado sempre produz o mesmo connectionId (idempotência)", () => {
        const plano1 = construirPlanoMigracao({ ownerUid: "owner-1", legado: LEGADO_OK, rota: null, novoExistente: false });
        const plano2 = construirPlanoMigracao({ ownerUid: "owner-1", legado: LEGADO_OK, rota: null, novoExistente: false });
        assert.equal(plano1.connectionId, plano2.connectionId);
    });
});

describe("construirPlanoRollback", () => {
    it("conexão nova não existe -> nada_a_reverter", () => {
        const plano = construirPlanoRollback({ ownerUid: "owner-1", connectionId: "mig-abc", novo: null, rota: null });
        assert.equal(plano.status, STATUS_ROLLBACK.NADA_A_REVERTER);
        assert.deepEqual(plano.acoes, []);
    });

    it("conexão de outro ownerUid -> invalido, abortado por segurança", () => {
        const novo = { ownerUid: "owner-OUTRO", migratedFromLegacyOwnerUid: "owner-OUTRO", phoneNumberId: "123456789" };
        const plano = construirPlanoRollback({ ownerUid: "owner-1", connectionId: "mig-abc", novo, rota: null });
        assert.equal(plano.status, STATUS_ROLLBACK.INVALIDO);
    });

    it("conexão sem migratedFromLegacyOwnerUid -> invalido, recusa reverter conexão não criada por este script", () => {
        const novo = { ownerUid: "owner-1", phoneNumberId: "123456789" };
        const plano = construirPlanoRollback({ ownerUid: "owner-1", connectionId: "mig-abc", novo, rota: null });
        assert.equal(plano.status, STATUS_ROLLBACK.INVALIDO);
    });

    it("caminho feliz sem rota -> pronto, só remove a conexão", () => {
        const novo = { ownerUid: "owner-1", migratedFromLegacyOwnerUid: "owner-1", phoneNumberId: "123456789" };
        const plano = construirPlanoRollback({ ownerUid: "owner-1", connectionId: "mig-abc", novo, rota: null });
        assert.equal(plano.status, STATUS_ROLLBACK.PRONTO);
        assert.equal(plano.acoes.length, 1);
        assert.equal(plano.acoes[0].tipo, "removerConexao");
    });

    it("caminho feliz com rota apontando pra essa conexão -> também limpa o connectionId da rota", () => {
        const novo = { ownerUid: "owner-1", migratedFromLegacyOwnerUid: "owner-1", phoneNumberId: "123456789" };
        const rota = { ownerUid: "owner-1", connectionId: "mig-abc" };
        const plano = construirPlanoRollback({ ownerUid: "owner-1", connectionId: "mig-abc", novo, rota });
        assert.equal(plano.status, STATUS_ROLLBACK.PRONTO);
        assert.equal(plano.acoes.length, 2);
        assert.ok(plano.acoes.some((a) => a.tipo === "limparConnectionIdRota"));
    });

    it("rota aponta pra OUTRA conexão -> não mexe na rota", () => {
        const novo = { ownerUid: "owner-1", migratedFromLegacyOwnerUid: "owner-1", phoneNumberId: "123456789" };
        const rota = { ownerUid: "owner-1", connectionId: "conn-diferente" };
        const plano = construirPlanoRollback({ ownerUid: "owner-1", connectionId: "mig-abc", novo, rota });
        assert.equal(plano.acoes.length, 1);
    });
});

describe("formatarRelatorio", () => {
    it("nunca inclui o valor de um token — só o resource path, e mesmo assim como string do documento", () => {
        const plano = construirPlanoMigracao({ ownerUid: "owner-1", legado: LEGADO_OK, rota: null, novoExistente: false });
        const relatorio = formatarRelatorio(plano, { modo: "migracao", apply: false });
        assert.match(relatorio, /dry-run/);
        assert.match(relatorio, /tokenSecretResource=\(recurso preservado, valor nunca lido\)/);
        assert.ok(!relatorio.includes("EAAG")); // formato típico de token de acesso Meta — nunca deveria aparecer
    });

    it("relatório de aplicação real diz APLICANDO", () => {
        const plano = construirPlanoMigracao({ ownerUid: "owner-1", legado: LEGADO_OK, rota: null, novoExistente: false });
        const relatorio = formatarRelatorio(plano, { modo: "migracao", apply: true });
        assert.match(relatorio, /APLICANDO/);
    });

    it("plano sem ações relata 'Nenhuma ação a executar'", () => {
        const plano = construirPlanoMigracao({ ownerUid: "owner-1", legado: null, rota: null, novoExistente: false });
        const relatorio = formatarRelatorio(plano, { modo: "migracao", apply: false });
        assert.match(relatorio, /Nenhuma ação a executar/);
    });
});
