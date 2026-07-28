// Testa a lógica das 15 configurações de trigger (functions/src/audit/
// triggers.js) sem precisar do Functions Emulator: computarEventoAuditoria()
// recebe before/after/authType/authId já extraídos, exatamente como o
// handler real faria depois de ler o CloudEvent — só sem a escrita em
// Firestore. As 15 configs reais (mesma instância usada nos triggers
// publicados) ficam disponíveis via CONFIGS_POR_COLECAO.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import triggers from "../../functions/src/audit/triggers.js";

const { CONFIGS_POR_COLECAO, computarEventoAuditoria } = triggers;

function config(caminho) {
    const cfg = CONFIGS_POR_COLECAO[caminho];
    assert.ok(cfg, `config não registrada para ${caminho}`);
    return cfg;
}

describe("audit/triggers — registro das 15 coleções", () => {
    it("registra exatamente as coleções esperadas", () => {
        const esperadas = [
            "usuarios/{uid}", "funcionarios/{uid}", "pedidos/{id}", "produtos/{id}",
            "clientes/{id}", "leads/{id}", "chats/{chatId}", "templates/{id}",
            "vitrines_publicas/{slug}", "landing_pages/{id}", "landing_pages_publicas/{id}",
            "configuracoes_ia/{storeUid}", "base_conhecimento_ia/{id}",
            "tracking_configs/{ownerUid}", "tracking_links/{id}"
        ];
        assert.deepEqual(Object.keys(CONFIGS_POR_COLECAO).sort(), esperadas.sort());
    });
});

describe("audit/triggers — pedidos", () => {
    const cfg = config("pedidos/{id}");

    it("owner altera status via SDK cliente — evento criado com ator/tenant corretos", () => {
        const event = computarEventoAuditoria(cfg, {
            operation: "update",
            before: { criadoPor: "ownerA", status: "aguardando" },
            after: { criadoPor: "ownerA", status: "enviado" },
            entityId: "ped1",
            authType: "unknown",
            authId: "uid-dono",
            rawEventId: "evt-1"
        });
        assert.equal(event.ownerUid, "ownerA");
        assert.equal(event.actorUid, "uid-dono");
        assert.equal(event.actorType, "user");
        assert.equal(event.action, "pedido.status_alterado");
        assert.equal(event.risk, "medium");
        assert.equal(event.entityId, "ped1");
    });

    it("nunca inclui cliente/contato/endereço/observações mesmo se presentes no documento bruto", () => {
        const event = computarEventoAuditoria(cfg, {
            operation: "create",
            before: null,
            after: { criadoPor: "ownerA", status: "aguardando", cliente: "João", whatsapp: "5511999999999", observacoes: "entregar de manhã" },
            entityId: "ped2",
            authType: "unknown",
            authId: "uid-dono",
            rawEventId: "evt-2"
        });
        assert.deepEqual(Object.keys(event.after).sort(), ["status"]);
    });

    it("delete usa o before (tenant e dados)", () => {
        const event = computarEventoAuditoria(cfg, {
            operation: "delete",
            before: { criadoPor: "ownerA", status: "cancelado", total: 199 },
            after: null,
            entityId: "ped3",
            authType: "unknown",
            authId: "uid-dono",
            rawEventId: "evt-3"
        });
        assert.equal(event.ownerUid, "ownerA");
        assert.equal(event.action, "pedido.excluido");
        assert.equal(event.risk, "high");
        assert.equal(event.before.status, "cancelado");
    });

    it("mudança apenas de timestamp-only é ignorada (retorna null)", () => {
        const event = computarEventoAuditoria(cfg, {
            operation: "update",
            before: { criadoPor: "ownerA", status: "aguardando", atualizadoEm: 1 },
            after: { criadoPor: "ownerA", status: "aguardando", atualizadoEm: 2 },
            entityId: "ped4",
            authType: "unknown",
            authId: "uid-dono",
            rawEventId: "evt-4"
        });
        assert.equal(event, null);
    });

    it("retry com o mesmo event.id produz o mesmo eventId (idempotência — nunca duplica)", () => {
        const construir = () => computarEventoAuditoria(cfg, {
            operation: "update",
            before: { criadoPor: "ownerA", status: "a" },
            after: { criadoPor: "ownerA", status: "b" },
            entityId: "ped5",
            authType: "unknown",
            authId: "uid-dono",
            rawEventId: "evt-retry-1"
        });
        const primeiro = construir();
        const segundo = construir();
        assert.equal(primeiro.eventId, segundo.eventId);
    });

    it("system actor é classificado corretamente (escrita por Cloud Function/Admin SDK)", () => {
        const event = computarEventoAuditoria(cfg, {
            operation: "update",
            before: { criadoPor: "ownerA", status: "a" },
            after: { criadoPor: "ownerA", status: "b" },
            entityId: "ped6",
            authType: "system",
            authId: undefined,
            rawEventId: "evt-6"
        });
        assert.equal(event.actorType, "system");
        assert.equal(event.actorUid, null);
    });

    it("mudança de tenant num update vira CRITICAL, mesmo que a coleção normalmente seja MEDIUM", () => {
        const event = computarEventoAuditoria(cfg, {
            operation: "update",
            before: { criadoPor: "ownerA", status: "a" },
            after: { criadoPor: "ownerB", status: "a" },
            entityId: "ped7",
            authType: "unknown",
            authId: "uid-x",
            rawEventId: "evt-7"
        });
        assert.equal(event.risk, "critical");
        assert.equal(event.action, "pedidos.tenant_alterado_suspeito");
        assert.equal(event.ownerUid, "ownerA");
    });
});

describe("audit/triggers — funcionarios", () => {
    const cfg = config("funcionarios/{uid}");

    it("desativação de funcionário é HIGH", () => {
        const event = computarEventoAuditoria(cfg, {
            operation: "update",
            before: { donoUID: "ownerA", status: "ativo" },
            after: { donoUID: "ownerA", status: "inativo" },
            entityId: "func1",
            authType: "unknown",
            authId: "uid-dono",
            rawEventId: "evt-f1"
        });
        assert.equal(event.action, "funcionario.desativado");
        assert.equal(event.risk, "high");
    });

    it("alteração de permissões é HIGH", () => {
        const event = computarEventoAuditoria(cfg, {
            operation: "update",
            before: { donoUID: "ownerA", status: "ativo", permissoes: { ver: [], editar: [] } },
            after: { donoUID: "ownerA", status: "ativo", permissoes: { ver: ["produtos"], editar: ["produtos"] } },
            entityId: "func2",
            authType: "unknown",
            authId: "uid-dono",
            rawEventId: "evt-f2"
        });
        assert.equal(event.action, "funcionario.permissoes_alteradas");
        assert.equal(event.risk, "high");
    });
});

describe("audit/triggers — chats (só documento pai; mensagens fora deste arquivo)", () => {
    const cfg = config("chats/{chatId}");

    it("metadata do chat (atribuição) é auditada", () => {
        const event = computarEventoAuditoria(cfg, {
            operation: "update",
            before: { donoUID: "ownerA", atribuidoPara: "" },
            after: { donoUID: "ownerA", atribuidoPara: "func1" },
            entityId: "chat1",
            authType: "unknown",
            authId: "uid-dono",
            rawEventId: "evt-c1"
        });
        assert.equal(event.action, "chat.atribuicao_alterada");
    });

    it("resolve tenant por emailDono quando donoUID está ausente (compat legado)", () => {
        const event = computarEventoAuditoria(cfg, {
            operation: "create",
            before: null,
            after: { emailDono: "ownerA", clienteNome: "Cliente X" },
            entityId: "chat2",
            authType: "unauthenticated",
            authId: undefined,
            rawEventId: "evt-c2"
        });
        assert.equal(event.ownerUid, "ownerA");
        assert.equal(event.actorType, "unauthenticated");
        // clienteNome nunca aparece no allowlist de chats.
        assert.equal("clienteNome" in event.after, false);
    });
});

describe("audit/triggers — tracking_configs (__docId__ como tenant)", () => {
    const cfg = config("tracking_configs/{ownerUid}");

    it("create com doc id como ownerUid", () => {
        const event = computarEventoAuditoria(cfg, {
            operation: "create",
            before: null,
            after: { metaPixel: { id: "123", ativo: true } },
            entityId: "ownerA",
            authType: "unknown",
            authId: "uid-dono",
            rawEventId: "evt-t1"
        });
        assert.equal(event.ownerUid, "ownerA");
        assert.equal(event.action, "tracking.pixel_configurado");
    });
});

describe("audit/triggers — base_conhecimento_ia (nunca conteúdo/prompt)", () => {
    const cfg = config("base_conhecimento_ia/{id}");

    it("conteudo/titulo nunca aparecem no evento sanitizado", () => {
        const event = computarEventoAuditoria(cfg, {
            operation: "create",
            before: null,
            after: { tenantId: "ownerA", tipo: "faq", status: "ativo", titulo: "Pergunta?", conteudo: "Resposta longa aqui" },
            entityId: "kb1",
            authType: "unknown",
            authId: "uid-dono",
            rawEventId: "evt-k1"
        });
        assert.equal("titulo" in event.after, false);
        assert.equal("conteudo" in event.after, false);
        assert.equal(event.after.tipo, "faq");
    });
});

describe("audit/triggers — sem tenant resolvível descarta o evento", () => {
    it("produto sem criadoPor não gera evento", () => {
        const cfg = config("produtos/{id}");
        const event = computarEventoAuditoria(cfg, {
            operation: "create",
            before: null,
            after: { nome: "Produto órfão" },
            entityId: "prodOrfao",
            authType: "unknown",
            authId: "uid-x",
            rawEventId: "evt-orfao"
        });
        assert.equal(event, null);
    });
});
