import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    rotuloRisco,
    rotuloModulo,
    rotuloOperacao,
    rotuloAtor,
    rotuloOrigem,
    rotuloAcaoAuditoria,
    rotuloCampoAuditoria,
    rotuloEntidadeAuditoria,
    formatarValorAuditoria,
    derivarAlteracoesAuditoria,
    protegerFormulaCsv,
    truncarUid,
    formatarDataHora,
    filtrarEventosLocal,
    filtrarEventosPorFiltros,
    contarFiltrosAtivos,
    criarFiltrosAuditoriaPadrao,
    eventosParaCsv,
    eventosParaJson,
    calcularKpis,
    ehMesmoDia,
    LIMITE_EXPORTACAO
} from "../audit-core-v1.js";

describe("audit-core-v1 — rótulos", () => {
    it("rotuloRisco cobre os 4 níveis e cai num fallback pra desconhecido", () => {
        assert.equal(rotuloRisco("low"), "Baixo");
        assert.equal(rotuloRisco("critical"), "Crítico");
        assert.equal(rotuloRisco("xyz"), "xyz");
    });
    it("rotuloModulo e rotuloOperacao têm fallback honesto", () => {
        assert.equal(rotuloModulo("pedidos"), "Pedidos");
        assert.equal(rotuloModulo("whatsapp"), "WhatsApp Oficial");
        assert.equal(rotuloModulo("admin"), "Administração");
        assert.equal(rotuloModulo("modulo-novo"), "modulo-novo");
        assert.equal(rotuloOperacao("delete"), "Exclusão");
        assert.equal(rotuloOrigem("admin-function"), "Função administrativa");
    });
    it("rotuloAtor nunca lança pra tipo desconhecido", () => {
        assert.equal(rotuloAtor("user"), "Usuário");
        assert.equal(rotuloAtor(undefined), "Desconhecido");
    });

    it("humaniza ação, campo e entidade sem alterar os valores técnicos", () => {
        assert.equal(rotuloAcaoAuditoria("pedido.status_alterado"), "Status do pedido alterado");
        assert.equal(rotuloAcaoAuditoria("lead.atualizado"), "Lead atualizado");
        assert.equal(rotuloCampoAuditoria("pagamentoStatus"), "Status do pagamento");
        assert.equal(rotuloCampoAuditoria("pedidoAtualizadoEm"), "Pedido atualizado em");
        assert.equal(rotuloEntidadeAuditoria("landing_page_publica"), "Landing Page pública");
        assert.equal(rotuloAcaoAuditoria("modulo.acao_nova"), "Acao nova");
    });
});

describe("audit-core-v1 — diff amigável somente de snapshots sanitizados", () => {
    it("suporta string, number, boolean, null, array, objeto e campo removido", () => {
        const diff = derivarAlteracoesAuditoria({
            statusPedido: "confirmado",
            estoque: 25,
            freteGratis: false,
            observacaoSegura: null,
            tags: ["a"],
            config: { ativo: true },
            removido: "antes",
            igual: "mesmo"
        }, {
            statusPedido: "em_producao",
            estoque: 21,
            freteGratis: true,
            observacaoSegura: "ok",
            tags: ["a", "b"],
            config: { ativo: false },
            igual: "mesmo"
        });
        assert.deepEqual(diff.map((item) => item.campo), [
            "statusPedido", "estoque", "freteGratis", "observacaoSegura", "tags", "config", "removido"
        ]);
        assert.equal(diff[0].antesFormatado, "Confirmado");
        assert.equal(diff[0].depoisFormatado, "Em produção");
        assert.equal(diff[1].antesFormatado, "25");
        assert.equal(diff[2].depoisFormatado, "Sim");
        assert.equal(diff[3].antesFormatado, "Nulo");
        assert.equal(diff[4].depoisFormatado, '["a","b"]');
        assert.equal(diff[5].depoisFormatado, '{"ativo":false}');
        assert.equal(diff[6].depoisFormatado, "Ausente");
    });

    it("não inventa campo que não está nos snapshots sanitizados", () => {
        const diff = derivarAlteracoesAuditoria(
            { status: "pago" },
            { status: "confirmado" }
        );
        assert.deepEqual(diff.map((item) => item.campo), ["status"]);
        assert.equal(diff.some((item) => item.campo === "clienteEmail"), false);
        assert.equal(formatarValorAuditoria(undefined), "Ausente");
    });
});

describe("audit-core-v1 — filtros combináveis", () => {
    const eventos = [
        { module: "produtos", operation: "update", risk: "medium", source: "firestore-trigger", actorUid: "owner-1", actorType: "user", entityType: "produto", entityId: "prod-1", action: "produto.preco_alterado", summary: "Preço alterado" },
        { module: "whatsapp", operation: "action", risk: "high", source: "admin-function", actorUid: "admin-2", actorType: "user", entityType: "conexao", entityId: "wa-2", action: "whatsapp.reconectado", summary: "Conexão reconectada" },
        { module: "admin", operation: "update", risk: "high", source: "admin-function", actorUid: "admin-2", actorType: "user", entityType: "loja", entityId: "store-3", action: "admin.plano_alterado", summary: "Plano alterado" }
    ];

    it("combina módulo e risco sem descartar um dos filtros", () => {
        const resultado = filtrarEventosPorFiltros(eventos, { module: "whatsapp", risk: "high" });
        assert.deepEqual(resultado.map((evento) => evento.entityId), ["wa-2"]);
    });

    it("combina ator, entidade, ação, operação e origem", () => {
        const resultado = filtrarEventosPorFiltros(eventos, {
            actor: "admin-2", entity: "store", action: "plano", operation: "update", source: "admin-function"
        });
        assert.deepEqual(resultado.map((evento) => evento.module), ["admin"]);
    });

    it("busca e filtro de ação também reconhecem rótulos amigáveis", () => {
        const evento = [{ action: "pedido.status_alterado", entityType: "pedido", entityId: "ped-1" }];
        assert.equal(filtrarEventosPorFiltros(evento, { action: "Status do pedido" }).length, 1);
        assert.equal(filtrarEventosPorFiltros(evento, { busca: "Status do pedido alterado" }).length, 1);
        assert.equal(filtrarEventosPorFiltros(evento, { entity: "Pedido" }).length, 1);
    });

    it("limpar volta ao estado padrão e o indicador conta filtros ativos", () => {
        const padrao = criarFiltrosAuditoriaPadrao();
        assert.equal(contarFiltrosAtivos(padrao), 0);
        assert.equal(contarFiltrosAtivos({ ...padrao, module: "produtos", risk: "medium", busca: "preço" }), 3);
        assert.equal(filtrarEventosPorFiltros(eventos, padrao).length, 3);
    });
});

describe("audit-core-v1 — truncarUid", () => {
    it("trunca UIDs longos preservando início e fim", () => {
        assert.equal(truncarUid("abcdefghijklmnop"), "abcdef…mnop");
    });
    it("mantém UIDs curtos intactos", () => {
        assert.equal(truncarUid("abc123"), "abc123");
    });
    it("nunca lança para valores vazios", () => {
        assert.equal(truncarUid(null), "—");
        assert.equal(truncarUid(""), "—");
    });
});

describe("audit-core-v1 — formatarDataHora", () => {
    it("aceita Date nativo", () => {
        const texto = formatarDataHora(new Date("2026-01-15T10:30:00Z"));
        assert.notEqual(texto, "—");
    });
    it("aceita objeto Firestore-Timestamp-like (toDate())", () => {
        const fakeTimestamp = { toDate: () => new Date("2026-01-15T10:30:00Z") };
        const texto = formatarDataHora(fakeTimestamp);
        assert.notEqual(texto, "—");
    });
    it("valor inválido nunca lança, devolve travessão", () => {
        assert.equal(formatarDataHora(undefined), "—");
        assert.equal(formatarDataHora("não é data"), "—");
    });
});

describe("audit-core-v1 — filtrarEventosLocal", () => {
    const eventos = [
        { summary: "Pedido ped1 teve o status alterado", entityId: "ped1", action: "pedido.status_alterado", module: "pedidos", entityType: "pedido" },
        { summary: "Produto prod2 teve o preço alterado", entityId: "prod2", action: "produto.preco_alterado", module: "produtos", entityType: "produto" }
    ];

    it("sem termo devolve tudo", () => {
        assert.equal(filtrarEventosLocal(eventos, "").length, 2);
    });

    it("filtra por trecho do summary, ignorando acento/caixa", () => {
        const resultado = filtrarEventosLocal(eventos, "PREÇO");
        assert.equal(resultado.length, 1);
        assert.equal(resultado[0].entityId, "prod2");
    });

    it("filtra por entityId", () => {
        assert.equal(filtrarEventosLocal(eventos, "ped1").length, 1);
    });

    it("nunca lança em lista vazia/indefinida", () => {
        assert.deepEqual(filtrarEventosLocal(undefined, "x"), []);
        assert.deepEqual(filtrarEventosLocal([], "x"), []);
    });
});

describe("audit-core-v1 — exportação (CSV/JSON, limite 1000)", () => {
    const eventos = [
        {
            eventId: "e1", createdAt: new Date("2026-01-01T00:00:00Z"), module: "pedidos",
            entityType: "pedido", entityId: "p1", operation: "update", action: "pedido.status_alterado",
            risk: "medium", summary: 'Resumo com "aspas", vírgula', actorType: "user", actorUid: "uid1",
            changedFields: ["status", "total"]
        }
    ];

    it("eventosParaCsv escapa aspas/vírgulas e inclui cabeçalho", () => {
        const csv = eventosParaCsv(eventos);
        const linhas = csv.split("\n");
        assert.equal(linhas.length, 2);
        assert.ok(linhas[0].startsWith("ID do evento,"));
        assert.ok(linhas[1].includes('""aspas""'));
        assert.equal(linhas[0].includes("Antes"), false, "Exportação não deve incluir snapshots potencialmente sensíveis");
    });

    it("eventosParaJson normaliza createdAt pra ISO string", () => {
        const json = JSON.parse(eventosParaJson(eventos));
        assert.equal(json[0]["Data/hora (ISO)"], "2026-01-01T00:00:00.000Z");
        assert.equal(json[0]["Campos alterados"], "status|total");
    });

    it("respeita o limite de exportação (máximo 1000)", () => {
        const muitos = Array.from({ length: 1500 }, (_, i) => ({ eventId: `e${i}` }));
        const json = JSON.parse(eventosParaJson(muitos));
        assert.equal(json.length, LIMITE_EXPORTACAO);
    });

    it("neutraliza formula injection no CSV e preserva o valor bruto no JSON", () => {
        const perigosos = ["=SUM(1,1)", "+cmd", "-1+1", "@formula"];
        assert.deepEqual(perigosos.map(protegerFormulaCsv), perigosos.map((valor) => `'${valor}`));

        const lista = perigosos.map((summary, indice) => ({ eventId: `formula-${indice}`, summary }));
        const csv = eventosParaCsv(lista);
        for (const valor of perigosos) assert.ok(csv.includes(`'${valor}`), `${valor} deveria ser texto no CSV`);

        const json = JSON.parse(eventosParaJson(lista));
        assert.deepEqual(json.map((item) => item.Resumo), perigosos, "JSON deve manter os valores brutos");
    });
});

describe("audit-core-v1 — calcularKpis", () => {
    it("conta eventos, alto risco, atores únicos e módulos únicos", () => {
        const eventos = [
            { actorUid: "u1", module: "pedidos", risk: "low" },
            { actorUid: "u1", module: "pedidos", risk: "high" },
            { actorUid: "u2", module: "produtos", risk: "critical" }
        ];
        const kpis = calcularKpis(eventos);
        assert.equal(kpis.eventosHoje, 3);
        assert.equal(kpis.altoRisco, 2);
        assert.equal(kpis.atoresAtivos, 2);
        assert.equal(kpis.modulosAlterados, 2);
    });

    it("lista vazia não lança e devolve zeros", () => {
        assert.deepEqual(calcularKpis([]), { eventosHoje: 0, altoRisco: 0, atoresAtivos: 0, modulosAlterados: 0 });
    });
});

describe("audit-core-v1 — ehMesmoDia", () => {
    it("compara ano/mês/dia, ignorando hora", () => {
        const referencia = new Date("2026-01-15T23:00:00");
        assert.equal(ehMesmoDia(new Date("2026-01-15T01:00:00"), referencia), true);
        assert.equal(ehMesmoDia(new Date("2026-01-14T23:59:00"), referencia), false);
    });
});
