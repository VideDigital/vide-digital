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

    it("pago → pendente no controle de pagamento registra os campos canônicos e prioriza pagamento", () => {
        const event = computarEventoAuditoria(cfg, {
            operation: "update",
            before: { criadoPor: "ownerA", status: "pago" },
            after: {
                criadoPor: "ownerA",
                status: "confirmado",
                statusPedido: "confirmado",
                statusPagamento: "pendente"
            },
            entityId: "ped-pagamento",
            authType: "unknown",
            authId: "uid-dono",
            rawEventId: "evt-pagamento"
        });
        assert.equal(event.action, "pedido.pagamento_alterado");
        assert.equal(event.risk, "high");
        assert.ok(event.changedFields.includes("statusPagamento"));
        assert.equal(event.before.status, "pago");
        assert.equal(event.after.status, "confirmado");
        assert.equal(event.after.statusPedido, "confirmado");
        assert.equal(event.after.statusPagamento, "pendente");
    });

    it("mudança de etapa operacional não é confundida com pagamento", () => {
        const event = computarEventoAuditoria(cfg, {
            operation: "update",
            before: {
                criadoPor: "ownerA", status: "confirmado",
                statusPedido: "confirmado", statusPagamento: "pendente"
            },
            after: {
                criadoPor: "ownerA", status: "confirmado",
                statusPedido: "em_producao", statusPagamento: "pendente"
            },
            entityId: "ped-status",
            authType: "unknown",
            authId: "uid-dono",
            rawEventId: "evt-status"
        });
        assert.equal(event.action, "pedido.status_alterado");
        assert.equal(event.risk, "medium");
        assert.deepEqual(event.changedFields, ["statusPedido"]);
        assert.equal(event.before.statusPagamento, "pendente");
        assert.equal(event.after.statusPagamento, "pendente");
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

describe("audit/triggers — produtos", () => {
    const cfg = config("produtos/{id}");

    it("estoque 25 → 21 preserva before/after sanitizados e ação de atualização", () => {
        const event = computarEventoAuditoria(cfg, {
            operation: "update",
            before: { criadoPor: "ownerA", nome: "Produto A", estoque: 25 },
            after: { criadoPor: "ownerA", nome: "Produto A", estoque: 21 },
            entityId: "prod-estoque",
            authType: "unknown",
            authId: "uid-dono",
            rawEventId: "evt-prod-estoque"
        });
        assert.equal(event.action, "produto.atualizado");
        assert.equal(event.risk, "low");
        assert.deepEqual(event.changedFields, ["estoque"]);
        assert.equal(event.before.estoque, 25);
        assert.equal(event.after.estoque, 21);
    });

    it("nome, status, tipo e frete usam o contrato de risco existente", () => {
        const base = { criadoPor: "ownerA", nome: "A", statusProduto: "ativo", tipo: "fisico", freteGratis: false };
        const cases = [
            ["nome", "B", "produto.atualizado", "low"],
            ["statusProduto", "rascunho", "produto.status_alterado", "medium"],
            ["tipo", "digital", "produto.atualizado", "low"],
            ["freteGratis", true, "produto.atualizado", "low"]
        ];
        for (const [field, value, action, risk] of cases) {
            const event = computarEventoAuditoria(cfg, {
                operation: "update",
                before: base,
                after: { ...base, [field]: value },
                entityId: `prod-${field}`,
                authType: "unknown",
                authId: "uid-dono",
                rawEventId: `evt-prod-${field}`
            });
            assert.equal(event.action, action, field);
            assert.equal(event.risk, risk, field);
            assert.deepEqual(event.changedFields, [field], field);
        }
    });

    it("preço e preço de referência/desconto são auditados como preço alterado", () => {
        for (const field of ["preco", "precoDe"]) {
            const event = computarEventoAuditoria(cfg, {
                operation: "update",
                before: { criadoPor: "ownerA", [field]: 100 },
                after: { criadoPor: "ownerA", [field]: 80 },
                entityId: `prod-${field}`,
                authType: "unknown",
                authId: "uid-dono",
                rawEventId: `evt-prod-${field}`
            });
            assert.equal(event.action, "produto.preco_alterado");
            assert.equal(event.risk, "medium");
            assert.equal(event.before[field], 100);
            assert.equal(event.after[field], 80);
        }
    });
});

describe("audit/triggers — sincronização Pedido → Lead", () => {
    const cfg = config("leads/{id}");

    it("mudança apenas de pagamento/histórico do pedido continua lead.atualizado, sem status falso", () => {
        const event = computarEventoAuditoria(cfg, {
            operation: "update",
            before: {
                criadoPor: "ownerA", statusLead: "em_contato", status: "em_contato",
                pagamentoStatus: "pago", pedidoAtualizadoEm: 1, pedidoHistorico: [{ titulo: "Antes" }]
            },
            after: {
                criadoPor: "ownerA", statusLead: "em_contato", status: "em_contato",
                pagamentoStatus: "pendente", pedidoAtualizadoEm: 2, pedidoHistorico: [{ titulo: "Depois" }]
            },
            entityId: "lead-pedido",
            authType: "unknown",
            authId: "uid-dono",
            rawEventId: "evt-lead-pedido"
        });
        assert.equal(event.action, "lead.atualizado");
        assert.equal(event.risk, "low");
        assert.deepEqual(event.changedFields, ["pagamentoStatus", "pedidoAtualizadoEm", "pedidoHistorico"]);
        assert.deepEqual(event.before, { statusLead: "em_contato", status: "em_contato" });
        assert.deepEqual(event.after, { statusLead: "em_contato", status: "em_contato" });
    });

    it("reconhece responsável canônico sem perder compatibilidade com o alias histórico", () => {
        for (const field of ["responsavelUid", "responsavelNome", "funcionarioResponsavel"]) {
            const event = computarEventoAuditoria(cfg, {
                operation: "update",
                before: { criadoPor: "ownerA", [field]: "antes" },
                after: { criadoPor: "ownerA", [field]: "depois" },
                entityId: `lead-responsavel-${field}`,
                authType: "unknown",
                authId: "uid-dono",
                rawEventId: `evt-lead-responsavel-${field}`
            });
            assert.equal(event.action, "lead.responsavel_alterado", field);
            assert.equal(event.after[field], "depois", field);
        }
    });

    it("reconhece follow-up canônico e aliases apenas para auditoria histórica", () => {
        for (const field of ["proximoContatoEm", "lembreteTimestamp", "lembreteData"]) {
            const event = computarEventoAuditoria(cfg, {
                operation: "update",
                before: { criadoPor: "ownerA", [field]: 1 },
                after: { criadoPor: "ownerA", [field]: 2 },
                entityId: `lead-followup-${field}`,
                authType: "unknown",
                authId: "uid-dono",
                rawEventId: `evt-lead-followup-${field}`
            });
            assert.equal(event.action, "lead.followup_alterado", field);
            assert.equal(event.risk, "low", field);
        }
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
