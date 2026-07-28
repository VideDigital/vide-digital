import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    rotuloRisco,
    rotuloModulo,
    rotuloOperacao,
    rotuloAtor,
    truncarUid,
    formatarDataHora,
    filtrarEventosLocal,
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
        assert.equal(rotuloModulo("modulo-novo"), "modulo-novo");
        assert.equal(rotuloOperacao("delete"), "Exclusão");
    });
    it("rotuloAtor nunca lança pra tipo desconhecido", () => {
        assert.equal(rotuloAtor("user"), "Usuário");
        assert.equal(rotuloAtor(undefined), "Desconhecido");
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
        assert.ok(linhas[0].startsWith("eventId,"));
        assert.ok(linhas[1].includes('""aspas""'));
    });

    it("eventosParaJson normaliza createdAt pra ISO string", () => {
        const json = JSON.parse(eventosParaJson(eventos));
        assert.equal(json[0].createdAtIso, "2026-01-01T00:00:00.000Z");
        assert.equal(json[0].changedFields, "status|total");
    });

    it("respeita o limite de exportação (máximo 1000)", () => {
        const muitos = Array.from({ length: 1500 }, (_, i) => ({ eventId: `e${i}` }));
        const json = JSON.parse(eventosParaJson(muitos));
        assert.equal(json.length, LIMITE_EXPORTACAO);
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
