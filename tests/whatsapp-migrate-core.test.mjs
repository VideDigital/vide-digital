import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    STATUS_MIGRACAO,
    STATUS_ROLLBACK,
    MODOS,
    gerarConnectionIdMigracao,
    validarOwnerUid,
    validarPhoneNumberId,
    validarGraphVersionAtual,
    construirPlanoMigracao,
    construirPlanoRollback,
    formatarRelatorio,
    interpretarFlags,
    confirmacaoApplyValida,
    confirmacaoRollbackValida,
    resolverModo,
    deveExecutarEscrita,
    validarProjeto,
    montarConfiguracaoSegura,
    formatarInstrucaoErroAutenticacao
} from "../scripts/whatsapp-migrate-core.mjs";

// LEGADO_OK.graphVersion ("v25.0") representa deliberadamente uma versão
// DIFERENTE de GRAPH_VERSION_ATUAL_TESTE ("v26.0") — exatamente o cenário
// real encontrado no dry-run (2026-07-31): legado registrado com uma
// versão antiga da Graph API, e o código atual (functions/src/whatsapp/
// constants.js) já em outra. A conexão V2 nunca deve copiar
// legado.graphVersion; sempre usa a versão atual passada pelo chamador.
const GRAPH_VERSION_ATUAL_TESTE = "v26.0";

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
        const plano = construirPlanoMigracao({ ownerUid: "owner-1", legado: null, rota: null, novoExistente: false, graphVersionAtual: GRAPH_VERSION_ATUAL_TESTE });
        assert.equal(plano.status, STATUS_MIGRACAO.SEM_LEGADO);
        assert.deepEqual(plano.acoes, []);
    });

    it("ownerUid inválido -> status invalida, nenhuma ação", () => {
        const plano = construirPlanoMigracao({ ownerUid: "", legado: LEGADO_OK, rota: null, novoExistente: false, graphVersionAtual: GRAPH_VERSION_ATUAL_TESTE });
        assert.equal(plano.status, STATUS_MIGRACAO.INVALIDA);
        assert.deepEqual(plano.acoes, []);
    });

    it("ownerUid do documento legado divergente -> invalida, nunca migra dado incerto", () => {
        const legadoDivergente = { ...LEGADO_OK, ownerUid: "owner-OUTRO" };
        const plano = construirPlanoMigracao({ ownerUid: "owner-1", legado: legadoDivergente, rota: null, novoExistente: false, graphVersionAtual: GRAPH_VERSION_ATUAL_TESTE });
        assert.equal(plano.status, STATUS_MIGRACAO.INVALIDA);
    });

    it("connectionVersion inesperado no legado -> invalida", () => {
        const legadoErrado = { ...LEGADO_OK, connectionVersion: 2 };
        const plano = construirPlanoMigracao({ ownerUid: "owner-1", legado: legadoErrado, rota: null, novoExistente: false, graphVersionAtual: GRAPH_VERSION_ATUAL_TESTE });
        assert.equal(plano.status, STATUS_MIGRACAO.INVALIDA);
    });

    it("phoneNumberId inválido no legado -> invalida", () => {
        const legadoSemFone = { ...LEGADO_OK, phoneNumberId: "" };
        const plano = construirPlanoMigracao({ ownerUid: "owner-1", legado: legadoSemFone, rota: null, novoExistente: false, graphVersionAtual: GRAPH_VERSION_ATUAL_TESTE });
        assert.equal(plano.status, STATUS_MIGRACAO.INVALIDA);
    });

    it("sem tokenSecretResource -> invalida, nunca infere/copia token", () => {
        const legadoSemToken = { ...LEGADO_OK, tokenSecretResource: "" };
        const plano = construirPlanoMigracao({ ownerUid: "owner-1", legado: legadoSemToken, rota: null, novoExistente: false, graphVersionAtual: GRAPH_VERSION_ATUAL_TESTE });
        assert.equal(plano.status, STATUS_MIGRACAO.INVALIDA);
    });

    it("conexão nova já existe -> ja_migrada, idempotente, nenhuma ação", () => {
        const plano = construirPlanoMigracao({ ownerUid: "owner-1", legado: LEGADO_OK, rota: null, novoExistente: true, graphVersionAtual: GRAPH_VERSION_ATUAL_TESTE });
        assert.equal(plano.status, STATUS_MIGRACAO.JA_MIGRADA);
        assert.deepEqual(plano.acoes, []);
        assert.ok(plano.connectionId);
    });

    it("rota de outro ownerUid -> invalida, abortado por segurança", () => {
        const rotaAlheia = { ownerUid: "owner-INVASOR", connectionStatus: "connected" };
        const plano = construirPlanoMigracao({ ownerUid: "owner-1", legado: LEGADO_OK, rota: rotaAlheia, novoExistente: false, graphVersionAtual: GRAPH_VERSION_ATUAL_TESTE });
        assert.equal(plano.status, STATUS_MIGRACAO.INVALIDA);
    });

    it("caminho feliz -> pronta, com as 2 ações esperadas, nunca inclui valor de token", () => {
        const plano = construirPlanoMigracao({ ownerUid: "owner-1", legado: LEGADO_OK, rota: null, novoExistente: false, graphVersionAtual: GRAPH_VERSION_ATUAL_TESTE });
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
        const plano = construirPlanoMigracao({ ownerUid: "owner-1", legado: LEGADO_OK, rota: rotaExistente, novoExistente: false, graphVersionAtual: GRAPH_VERSION_ATUAL_TESTE });
        assert.equal(plano.status, STATUS_MIGRACAO.PRONTA);
    });

    it("rota já aponta pra outro connectionId -> aviso de sobrescrita, mas ainda pronta", () => {
        const rotaComOutroId = { ownerUid: "owner-1", connectionId: "conn-outro", connectionStatus: "connected" };
        const plano = construirPlanoMigracao({ ownerUid: "owner-1", legado: LEGADO_OK, rota: rotaComOutroId, novoExistente: false, graphVersionAtual: GRAPH_VERSION_ATUAL_TESTE });
        assert.equal(plano.status, STATUS_MIGRACAO.PRONTA);
        assert.ok(plano.avisos.some((a) => a.includes("connectionId diferente")));
    });

    it("rodar duas vezes sobre o mesmo legado sempre produz o mesmo connectionId (idempotência)", () => {
        const plano1 = construirPlanoMigracao({ ownerUid: "owner-1", legado: LEGADO_OK, rota: null, novoExistente: false, graphVersionAtual: GRAPH_VERSION_ATUAL_TESTE });
        const plano2 = construirPlanoMigracao({ ownerUid: "owner-1", legado: LEGADO_OK, rota: null, novoExistente: false, graphVersionAtual: GRAPH_VERSION_ATUAL_TESTE });
        assert.equal(plano1.connectionId, plano2.connectionId);
    });
});

// Revisão (2026-07-31): achado do dry-run real — a conexão V2 estava
// sendo criada com graphVersion="v25.0" (copiado de legado.graphVersion)
// mesmo com o código já em WHATSAPP_GRAPH_VERSION="v26.0". A V2 nunca deve
// copiar a versão do legado; sempre usa a versão atual, passada pelo
// chamador via graphVersionAtual. Nenhum apply foi autorizado nesse
// dry-run — por isso este é o único ajuste desta missão.
describe("construirPlanoMigracao — graphVersion vem sempre da versão atual, nunca do legado", () => {
    it("legado v25.0 + atual v26.0 -> V2 usa v26.0 (nunca copia do legado)", () => {
        const plano = construirPlanoMigracao({ ownerUid: "owner-1", legado: LEGADO_OK, rota: null, novoExistente: false, graphVersionAtual: GRAPH_VERSION_ATUAL_TESTE });
        assert.equal(plano.status, STATUS_MIGRACAO.PRONTA);
        const acaoConexao = plano.acoes.find((a) => a.tipo === "criarConexao");
        assert.equal(acaoConexao.dados.graphVersion, GRAPH_VERSION_ATUAL_TESTE);
        assert.notEqual(acaoConexao.dados.graphVersion, LEGADO_OK.graphVersion);
    });

    it("legado e atual divergentes -> aviso seguro, sem UID, IDs ou token", () => {
        const plano = construirPlanoMigracao({ ownerUid: "owner-1", legado: LEGADO_OK, rota: null, novoExistente: false, graphVersionAtual: GRAPH_VERSION_ATUAL_TESTE });
        const aviso = plano.avisos.find((a) => a.includes("Graph API"));
        assert.ok(aviso, "esperava um aviso de divergência de versão");
        assert.match(aviso, /v25\.0/);
        assert.match(aviso, /v26\.0/);
        assert.match(aviso, /inalterado/);
        assert.ok(!aviso.includes("owner-1"));
        assert.ok(!aviso.includes(LEGADO_OK.phoneNumberId));
        assert.ok(!aviso.includes(LEGADO_OK.tokenSecretResource));
    });

    it("legado v26.0 + atual v26.0 -> V2 v26.0, sem aviso de divergência (mesma versão)", () => {
        const legadoMesmaVersao = { ...LEGADO_OK, graphVersion: GRAPH_VERSION_ATUAL_TESTE };
        const plano = construirPlanoMigracao({ ownerUid: "owner-1", legado: legadoMesmaVersao, rota: null, novoExistente: false, graphVersionAtual: GRAPH_VERSION_ATUAL_TESTE });
        assert.equal(plano.status, STATUS_MIGRACAO.PRONTA);
        const acaoConexao = plano.acoes.find((a) => a.tipo === "criarConexao");
        assert.equal(acaoConexao.dados.graphVersion, GRAPH_VERSION_ATUAL_TESTE);
        assert.ok(!plano.avisos.some((a) => a.includes("Graph API")));
    });

    it("legado sem graphVersion + atual v26.0 -> V2 v26.0, sem aviso, não bloqueia", () => {
        const legadoSemVersao = { ...LEGADO_OK };
        delete legadoSemVersao.graphVersion;
        const plano = construirPlanoMigracao({ ownerUid: "owner-1", legado: legadoSemVersao, rota: null, novoExistente: false, graphVersionAtual: GRAPH_VERSION_ATUAL_TESTE });
        assert.equal(plano.status, STATUS_MIGRACAO.PRONTA);
        const acaoConexao = plano.acoes.find((a) => a.tipo === "criarConexao");
        assert.equal(acaoConexao.dados.graphVersion, GRAPH_VERSION_ATUAL_TESTE);
        assert.ok(!plano.avisos.some((a) => a.includes("Graph API")));
    });

    it("graphVersionAtual ausente -> invalida, zero ações", () => {
        const plano = construirPlanoMigracao({ ownerUid: "owner-1", legado: LEGADO_OK, rota: null, novoExistente: false });
        assert.equal(plano.status, STATUS_MIGRACAO.INVALIDA);
        assert.deepEqual(plano.acoes, []);
    });

    it("graphVersionAtual em formato inválido -> invalida, zero ações", () => {
        for (const invalida of ["", "26.0", "v26", "vX.Y", "v26.0.1", null, undefined, 26]) {
            const plano = construirPlanoMigracao({ ownerUid: "owner-1", legado: LEGADO_OK, rota: null, novoExistente: false, graphVersionAtual: invalida });
            assert.equal(plano.status, STATUS_MIGRACAO.INVALIDA, `esperava invalida para graphVersionAtual=${JSON.stringify(invalida)}`);
            assert.deepEqual(plano.acoes, []);
        }
    });

    it("documento legado nunca sofre mutação (mesmo estando congelado)", () => {
        const antes = JSON.stringify(LEGADO_OK);
        construirPlanoMigracao({ ownerUid: "owner-1", legado: LEGADO_OK, rota: null, novoExistente: false, graphVersionAtual: GRAPH_VERSION_ATUAL_TESTE });
        assert.equal(JSON.stringify(LEGADO_OK), antes);
    });
});

describe("validarGraphVersionAtual", () => {
    it("aceita o formato vMAJOR.MINOR", () => {
        assert.equal(validarGraphVersionAtual("v26.0"), true);
        assert.equal(validarGraphVersionAtual("v3.1"), true);
    });

    it("rejeita ausente, vazio ou formato divergente", () => {
        assert.equal(validarGraphVersionAtual(undefined), false);
        assert.equal(validarGraphVersionAtual(""), false);
        assert.equal(validarGraphVersionAtual("26.0"), false);
        assert.equal(validarGraphVersionAtual("v26"), false);
        assert.equal(validarGraphVersionAtual("v26.0.1"), false);
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
        const plano = construirPlanoMigracao({ ownerUid: "owner-1", legado: LEGADO_OK, rota: null, novoExistente: false, graphVersionAtual: GRAPH_VERSION_ATUAL_TESTE });
        const relatorio = formatarRelatorio(plano, { modo: "migracao", apply: false });
        assert.match(relatorio, /dry-run/);
        assert.match(relatorio, /tokenSecretResource=\(recurso preservado, valor nunca lido\)/);
        assert.ok(!relatorio.includes("EAAG")); // formato típico de token de acesso Meta — nunca deveria aparecer
    });

    it("relatório de aplicação real diz APLICANDO", () => {
        const plano = construirPlanoMigracao({ ownerUid: "owner-1", legado: LEGADO_OK, rota: null, novoExistente: false, graphVersionAtual: GRAPH_VERSION_ATUAL_TESTE });
        const relatorio = formatarRelatorio(plano, { modo: "migracao", apply: true });
        assert.match(relatorio, /APLICANDO/);
    });

    it("plano sem ações relata 'Nenhuma ação a executar'", () => {
        const plano = construirPlanoMigracao({ ownerUid: "owner-1", legado: null, rota: null, novoExistente: false, graphVersionAtual: GRAPH_VERSION_ATUAL_TESTE });
        const relatorio = formatarRelatorio(plano, { modo: "migracao", apply: false });
        assert.match(relatorio, /Nenhuma ação a executar/);
    });
});

// Revisão (2026-07-31): Cloud Shell/ADC — flags, modos, gates de
// confirmação, projeto fixo e mensagens de erro seguras. Achado real: o
// script bloqueava incondicionalmente sem GOOGLE_APPLICATION_CREDENTIALS,
// forçando uma chave JSON mesmo quando applicationDefault() já aceita ADC
// de usuário (gcloud auth application-default login) — o caminho
// recomendado e mais seguro no Cloud Shell.
describe("interpretarFlags", () => {
    it("sem flags -> nem apply nem rollback, sem desconhecidas", () => {
        const r = interpretarFlags([]);
        assert.equal(r.apply, false);
        assert.equal(r.rollback, false);
        assert.deepEqual(r.flagsDesconhecidas, []);
    });

    it("reconhece --apply e --rollback juntos", () => {
        const r = interpretarFlags(["--rollback", "--apply"]);
        assert.equal(r.apply, true);
        assert.equal(r.rollback, true);
        assert.deepEqual(r.flagsDesconhecidas, []);
    });

    it("flag desconhecida é listada, nunca silenciosamente ignorada", () => {
        const r = interpretarFlags(["--apply", "--bogus"]);
        assert.deepEqual(r.flagsDesconhecidas, ["--bogus"]);
    });
});

describe("confirmacaoApplyValida / confirmacaoRollbackValida", () => {
    it("só aceita exatamente a string esperada", () => {
        assert.equal(confirmacaoApplyValida("APPLY_WHATSAPP_MIGRATION"), true);
        assert.equal(confirmacaoApplyValida("apply_whatsapp_migration"), false);
        assert.equal(confirmacaoApplyValida(""), false);
        assert.equal(confirmacaoApplyValida(undefined), false);
        assert.equal(confirmacaoApplyValida("APPLY_WHATSAPP_MIGRATION "), false);
    });

    it("rollback tem sua PRÓPRIA confirmação, nunca aceita a de apply", () => {
        assert.equal(confirmacaoRollbackValida("APPLY_WHATSAPP_ROLLBACK"), true);
        assert.equal(confirmacaoRollbackValida("APPLY_WHATSAPP_MIGRATION"), false);
        assert.equal(confirmacaoRollbackValida(""), false);
    });
});

describe("resolverModo", () => {
    it("sem flags = dry-run de migração", () => {
        const r = resolverModo({ apply: false, rollback: false, flagsDesconhecidas: [] });
        assert.equal(r.modo, MODOS.DRY_RUN_MIGRACAO);
        assert.match(r.motivo, /DRY-RUN/);
    });

    it("--apply sem confirmação = bloqueado, nunca vira modo de escrita", () => {
        const r = resolverModo({ apply: true, rollback: false, flagsDesconhecidas: [], confirmApply: "" });
        assert.equal(r.modo, MODOS.BLOQUEADO);
    });

    it("--apply com confirmação correta = permitido pela configuração pura", () => {
        const r = resolverModo({ apply: true, rollback: false, flagsDesconhecidas: [], confirmApply: "APPLY_WHATSAPP_MIGRATION" });
        assert.equal(r.modo, MODOS.APPLY_MIGRACAO);
        assert.match(r.motivo, /APPLY/);
    });

    it("confirmação presente MAS sem --apply = continua dry-run (confirmação sozinha nunca escreve)", () => {
        const r = resolverModo({ apply: false, rollback: false, flagsDesconhecidas: [], confirmApply: "APPLY_WHATSAPP_MIGRATION" });
        assert.equal(r.modo, MODOS.DRY_RUN_MIGRACAO);
    });

    it("--rollback sozinho = rollback dry-run", () => {
        const r = resolverModo({ apply: false, rollback: true, flagsDesconhecidas: [] });
        assert.equal(r.modo, MODOS.DRY_RUN_ROLLBACK);
        assert.match(r.motivo, /ROLLBACK DRY-RUN/);
    });

    it("--rollback --apply sem confirmação PRÓPRIA de rollback = bloqueado", () => {
        const r = resolverModo({ apply: true, rollback: true, flagsDesconhecidas: [], confirmApply: "APPLY_WHATSAPP_MIGRATION" });
        assert.equal(r.modo, MODOS.BLOQUEADO);
    });

    it("--rollback --apply com confirmação correta = permitido pela configuração pura", () => {
        const r = resolverModo({ apply: true, rollback: true, flagsDesconhecidas: [], confirmRollback: "APPLY_WHATSAPP_ROLLBACK" });
        assert.equal(r.modo, MODOS.APPLY_ROLLBACK);
        assert.match(r.motivo, /ROLLBACK APPLY/);
    });

    it("flags desconhecidas = bloqueado, mesmo com confirmações corretas presentes", () => {
        const r = resolverModo({
            apply: true,
            rollback: false,
            flagsDesconhecidas: ["--bogus"],
            confirmApply: "APPLY_WHATSAPP_MIGRATION"
        });
        assert.equal(r.modo, MODOS.BLOQUEADO);
    });
});

describe("deveExecutarEscrita — prova de que dry-run NUNCA escreve", () => {
    it("dry-run de migração nunca escreve, mesmo com status pronta", () => {
        assert.equal(deveExecutarEscrita(MODOS.DRY_RUN_MIGRACAO, STATUS_MIGRACAO.PRONTA), false);
    });

    it("rollback dry-run nunca escreve, mesmo com status pronto", () => {
        assert.equal(deveExecutarEscrita(MODOS.DRY_RUN_ROLLBACK, STATUS_ROLLBACK.PRONTO), false);
    });

    it("modo bloqueado nunca escreve, em nenhuma hipótese", () => {
        assert.equal(deveExecutarEscrita(MODOS.BLOQUEADO, STATUS_MIGRACAO.PRONTA), false);
        assert.equal(deveExecutarEscrita(MODOS.BLOQUEADO, STATUS_ROLLBACK.PRONTO), false);
    });

    it("apply autorizado só escreve quando o plano está realmente pronto", () => {
        assert.equal(deveExecutarEscrita(MODOS.APPLY_MIGRACAO, STATUS_MIGRACAO.PRONTA), true);
        assert.equal(deveExecutarEscrita(MODOS.APPLY_MIGRACAO, STATUS_MIGRACAO.JA_MIGRADA), false);
        assert.equal(deveExecutarEscrita(MODOS.APPLY_MIGRACAO, STATUS_MIGRACAO.SEM_LEGADO), false);
        assert.equal(deveExecutarEscrita(MODOS.APPLY_MIGRACAO, STATUS_MIGRACAO.INVALIDA), false);
    });

    it("rollback apply autorizado só escreve quando o plano está realmente pronto", () => {
        assert.equal(deveExecutarEscrita(MODOS.APPLY_ROLLBACK, STATUS_ROLLBACK.PRONTO), true);
        assert.equal(deveExecutarEscrita(MODOS.APPLY_ROLLBACK, STATUS_ROLLBACK.NADA_A_REVERTER), false);
        assert.equal(deveExecutarEscrita(MODOS.APPLY_ROLLBACK, STATUS_ROLLBACK.INVALIDO), false);
    });
});

describe("validarProjeto", () => {
    it("projeto ausente/vazio bloqueia, mesmo em dry-run", () => {
        assert.equal(validarProjeto({ projetoExplicito: "" }).ok, false);
        assert.equal(validarProjeto({ projetoExplicito: undefined }).ok, false);
    });

    it("projeto explícito correto passa", () => {
        const r = validarProjeto({ projetoExplicito: "vide-digital-saas" });
        assert.equal(r.ok, true);
        assert.equal(r.projeto, "vide-digital-saas");
    });

    it("projeto divergente bloqueia — nunca aceita outro projeto, nem demo/staging", () => {
        assert.equal(validarProjeto({ projetoExplicito: "demo-vide-hub" }).ok, false);
        assert.equal(validarProjeto({ projetoExplicito: "vide-digital-saas-staging" }).ok, false);
        assert.equal(validarProjeto({ projetoExplicito: "outro-projeto" }).ok, false);
    });

    it("env do gcloud (GOOGLE_CLOUD_PROJECT/GCLOUD_PROJECT/CLOUDSDK_CORE_PROJECT) divergente bloqueia quando definida explicitamente", () => {
        const r = validarProjeto({
            projetoExplicito: "vide-digital-saas",
            diagnosticosEnv: { GOOGLE_CLOUD_PROJECT: "outro-projeto" }
        });
        assert.equal(r.ok, false);
    });

    it("env do gcloud ausente ou igual ao projeto não bloqueia", () => {
        const semEnv = validarProjeto({ projetoExplicito: "vide-digital-saas", diagnosticosEnv: {} });
        assert.equal(semEnv.ok, true);
        const envIgual = validarProjeto({
            projetoExplicito: "vide-digital-saas",
            diagnosticosEnv: { GOOGLE_CLOUD_PROJECT: "vide-digital-saas", GCLOUD_PROJECT: "", CLOUDSDK_CORE_PROJECT: "vide-digital-saas" }
        });
        assert.equal(envIgual.ok, true);
    });

    it("a validação de projeto não depende de GOOGLE_APPLICATION_CREDENTIALS de forma alguma — a função nem aceita esse parâmetro", () => {
        // Prova estrutural: passar qualquer coisa a mais não muda o resultado,
        // porque validarProjeto só olha projetoExplicito/diagnosticosEnv.
        const r = validarProjeto({ projetoExplicito: "vide-digital-saas", googleApplicationCredentials: undefined });
        assert.equal(r.ok, true);
    });
});

describe("montarConfiguracaoSegura", () => {
    it("nunca inclui caminho de credencial, token ou qualquer valor de env var além do projeto", () => {
        const config = montarConfiguracaoSegura({ projeto: "vide-digital-saas", modo: MODOS.DRY_RUN_MIGRACAO, ownerUidPresente: true });
        const texto = JSON.stringify(config);
        assert.ok(!/\.json/i.test(texto));
        assert.ok(!/EAAG[a-zA-Z0-9]{20,}/.test(texto));
        assert.equal(config.projeto, "vide-digital-saas");
        assert.equal(config.ownerUidPresente, true);
    });
});

describe("formatarInstrucaoErroAutenticacao", () => {
    it("instrui gcloud auth application-default login, nunca criação de chave JSON, nunca token", () => {
        const texto = formatarInstrucaoErroAutenticacao();
        assert.match(texto, /gcloud auth application-default login/);
        assert.match(texto, /set-quota-project vide-digital-saas/);
        assert.ok(!/\.json/i.test(texto));
        assert.ok(!/EAAG[a-zA-Z0-9]{20,}/.test(texto));
        assert.match(texto, /[Nn]unca crie nem baixe/);
    });
});
