import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveOrderItemServerSide,
  resolvePublicOrderServerSide,
  agregarItensPorProduto,
  parseStrictQuantity,
  precoParaCentavos,
  MAX_ITEMS_PER_ORDER,
  MAX_QUANTITY_PER_ITEM
} from "../../functions/src/public/checkout-core.js";
import { computeOrderQuoteDedupeHash } from "../../functions/src/public/index.js";

const tenant = { ownerUid: "ownerA" };

function fakeRead(produtos) {
  return async (path) => {
    const id = path.replace("produtos/", "");
    const produto = produtos[id];
    return { exists: Boolean(produto), data: () => produto };
  };
}

describe("parseStrictQuantity — inteiro estrito, nunca arredonda nem clampa silenciosamente", () => {
  it("aceita inteiros válidos no limite (1 e MAX_QUANTITY_PER_ITEM)", () => {
    assert.equal(parseStrictQuantity(1), 1);
    assert.equal(parseStrictQuantity(999), 999);
    assert.equal(MAX_QUANTITY_PER_ITEM, 999);
  });

  it("rejeita (não corrige) zero, negativo, decimal, acima do teto, string e null", () => {
    for (const valor of [0, -1, 1.5, 1000, "abc", null, undefined, NaN, Infinity, {}, []]) {
      assert.equal(parseStrictQuantity(valor), null, `esperado null para ${JSON.stringify(valor)}`);
    }
  });

  it("nunca arredonda 1.5 para 2, nunca clampa 1000 para 999", () => {
    assert.notEqual(parseStrictQuantity(1.5), 2);
    assert.equal(parseStrictQuantity(1.5), null);
    assert.notEqual(parseStrictQuantity(1000), 999);
    assert.equal(parseStrictQuantity(1000), null);
  });
});

describe("precoParaCentavos — representação canônica inteira", () => {
  it("converte valores comuns sem deriva de ponto flutuante", () => {
    assert.equal(precoParaCentavos(0.1), 10);
    assert.equal(precoParaCentavos(0.2), 20);
    assert.equal(precoParaCentavos(19.9), 1990);
    assert.equal(precoParaCentavos(29.99), 2999);
  });
});

describe("agregarItensPorProduto — mesmo produtoId em linhas diferentes soma ANTES da validação de estoque", () => {
  it("soma quantidades do mesmo produtoId em uma única linha agregada", () => {
    const resultado = agregarItensPorProduto([
      { produtoId: "p1", quantidade: 2 },
      { produtoId: "p1", quantidade: 3 }
    ]);
    assert.deepEqual(resultado, [{ produtoId: "p1", quantidade: 5 }]);
  });

  it("preserva a ordem de primeira ocorrência entre produtos diferentes", () => {
    const resultado = agregarItensPorProduto([
      { produtoId: "p2", quantidade: 1 },
      { produtoId: "p1", quantidade: 1 },
      { produtoId: "p2", quantidade: 1 }
    ]);
    assert.deepEqual(resultado, [{ produtoId: "p2", quantidade: 2 }, { produtoId: "p1", quantidade: 1 }]);
  });

  it("quantidade inválida em qualquer linha falha antes de agregar", () => {
    assert.throws(() => agregarItensPorProduto([{ produtoId: "p1", quantidade: 1.5 }]),
      (e) => e.code === "invalid-argument");
  });

  it("total agregado acima do teto por produto é rejeitado, não clampado", () => {
    assert.throws(() => agregarItensPorProduto([
      { produtoId: "p1", quantidade: 999 },
      { produtoId: "p1", quantidade: 1 }
    ]), (e) => e.code === "invalid-argument");
  });
});

describe("resolveOrderItemServerSide — preço/nome/subtotal nunca confiam no visitante", () => {
  it("positivo: recalcula preço/subtotal (decimal e centavos) a partir do produto real", async () => {
    const read = fakeRead({ p1: { criadoPor: "ownerA", nome: "Produto Real", preco: 50, statusProduto: "ativo" } });
    const item = await resolveOrderItemServerSide("p1", 2, tenant, read);
    assert.equal(item.precoUnitario, 50);
    assert.equal(item.subtotal, 100);
    assert.equal(item.precoUnitarioCentavos, 5000);
    assert.equal(item.subtotalCentavos, 10000);
    assert.equal(item.nome, "Produto Real");
  });

  it("preço 3x19.90 calcula em centavos sem deriva de ponto flutuante", async () => {
    const read = fakeRead({ p1: { criadoPor: "ownerA", nome: "P", preco: 19.9, statusProduto: "ativo" } });
    const item = await resolveOrderItemServerSide("p1", 3, tenant, read);
    assert.equal(item.subtotalCentavos, 5970);
    assert.equal(item.subtotal, 59.7);
  });

  it("produto inexistente: not-found", async () => {
    const read = fakeRead({});
    await assert.rejects(resolveOrderItemServerSide("p1", 1, tenant, read), (e) => e.code === "not-found");
  });

  it("produto de outro tenant: not-found (mensagem genérica, não revela cross-tenant)", async () => {
    const read = fakeRead({ p1: { criadoPor: "ownerB", preco: 10, statusProduto: "ativo" } });
    await assert.rejects(resolveOrderItemServerSide("p1", 1, tenant, read), (e) => e.code === "not-found");
  });

  it("preço manipulado pelo visitante é sempre ignorado (não existe mais parâmetro de preço)", async () => {
    const read = fakeRead({ p1: { criadoPor: "ownerA", preco: 200, statusProduto: "ativo" } });
    const item = await resolveOrderItemServerSide("p1", 1, tenant, read);
    assert.equal(item.precoUnitario, 200);
  });

  describe("status fail-closed: SOMENTE 'ativo' é aceito, qualquer outro valor falha", () => {
    for (const [status, esperado] of [
      ["ativo", "PASS"],
      ["rascunho", "FAIL"],
      ["arquivado", "FAIL"],
      ["inativo", "FAIL"],
      [undefined, "FAIL"],
      ["status_desconhecido_legado", "FAIL"]
    ]) {
      it(`statusProduto=${JSON.stringify(status)} → ${esperado}`, async () => {
        const produto = { criadoPor: "ownerA", preco: 10 };
        if (status !== undefined) produto.statusProduto = status;
        const read = fakeRead({ p1: produto });
        if (esperado === "PASS") {
          const item = await resolveOrderItemServerSide("p1", 1, tenant, read);
          assert.equal(item.produtoId, "p1");
        } else {
          await assert.rejects(resolveOrderItemServerSide("p1", 1, tenant, read), (e) => e.code === "failed-precondition");
        }
      });
    }
  });

  it("estoque insuficiente (quando rastreado): failed-precondition", async () => {
    const read = fakeRead({ p1: { criadoPor: "ownerA", preco: 10, statusProduto: "ativo", estoque: 2 } });
    await assert.rejects(resolveOrderItemServerSide("p1", 3, tenant, read), (e) => e.code === "failed-precondition");
  });

  it('estoque não rastreado ("") nunca bloqueia', async () => {
    const read = fakeRead({ p1: { criadoPor: "ownerA", preco: 10, statusProduto: "ativo", estoque: "" } });
    const item = await resolveOrderItemServerSide("p1", 500, tenant, read);
    assert.equal(item.quantidade, 500);
  });

  it("preço real inválido no documento (não numérico/negativo): failed-precondition", async () => {
    const read = fakeRead({ p1: { criadoPor: "ownerA", preco: "abc", statusProduto: "ativo" } });
    await assert.rejects(resolveOrderItemServerSide("p1", 1, tenant, read), (e) => e.code === "failed-precondition");
  });
});

describe("resolvePublicOrderServerSide — pedido completo, com agregação de duplicados", () => {
  it("soma corretamente múltiplos itens distintos, com subtotal/total/centavos calculados no servidor", async () => {
    const read = fakeRead({
      p1: { criadoPor: "ownerA", nome: "A", preco: 10, statusProduto: "ativo" },
      p2: { criadoPor: "ownerA", nome: "B", preco: 20, statusProduto: "ativo" }
    });
    const resultado = await resolvePublicOrderServerSide({
      tenant, itensSolicitados: [{ produtoId: "p1", quantidade: 2 }, { produtoId: "p2", quantidade: 1 }], read
    });
    assert.equal(resultado.subtotal, 40);
    assert.equal(resultado.total, 40);
    assert.equal(resultado.subtotalCentavos, 4000);
    assert.equal(resultado.totalCentavos, 4000);
    assert.equal(resultado.itens.length, 2);
  });

  it("mesmo produtoId em duas linhas + estoque=5 + 3+3: agregado (6) excede estoque e FALHA", async () => {
    const read = fakeRead({ p1: { criadoPor: "ownerA", nome: "P", preco: 10, statusProduto: "ativo", estoque: 5 } });
    await assert.rejects(resolvePublicOrderServerSide({
      tenant, itensSolicitados: [{ produtoId: "p1", quantidade: 3 }, { produtoId: "p1", quantidade: 3 }], read
    }), (e) => e.code === "failed-precondition");
  });

  it("mesmo produtoId em duas linhas + estoque=5 + 2+3: agregado (5) bate exatamente com estoque e PASSA", async () => {
    const read = fakeRead({ p1: { criadoPor: "ownerA", nome: "P", preco: 10, statusProduto: "ativo", estoque: 5 } });
    const resultado = await resolvePublicOrderServerSide({
      tenant, itensSolicitados: [{ produtoId: "p1", quantidade: 2 }, { produtoId: "p1", quantidade: 3 }], read
    });
    assert.equal(resultado.itens.length, 1);
    assert.equal(resultado.itens[0].quantidade, 5);
  });

  it("um único item de outro tenant no meio de um pedido derruba o pedido inteiro", async () => {
    const read = fakeRead({
      p1: { criadoPor: "ownerA", preco: 10, statusProduto: "ativo" },
      p2: { criadoPor: "ownerB", preco: 20, statusProduto: "ativo" }
    });
    await assert.rejects(resolvePublicOrderServerSide({
      tenant, itensSolicitados: [{ produtoId: "p1", quantidade: 1 }, { produtoId: "p2", quantidade: 1 }], read
    }), (e) => e.code === "not-found");
  });

  it("tenant falso: sem ownerUid resolvido, falha antes de tocar em qualquer produto", async () => {
    const read = fakeRead({});
    await assert.rejects(resolvePublicOrderServerSide({ tenant: {}, itensSolicitados: [{ produtoId: "p1", quantidade: 1 }], read }),
      (e) => e.code === "failed-precondition");
  });

  it("payload excessivo: mais itens (produtoId distintos) que o permitido é rejeitado antes de qualquer leitura", async () => {
    const read = fakeRead({});
    const itensSolicitados = Array.from({ length: MAX_ITEMS_PER_ORDER + 1 }, (_, i) => ({ produtoId: `p${i}`, quantidade: 1 }));
    await assert.rejects(resolvePublicOrderServerSide({ tenant, itensSolicitados, read }),
      (e) => e.code === "invalid-argument");
  });

  it("pedido vazio é rejeitado", async () => {
    const read = fakeRead({});
    await assert.rejects(resolvePublicOrderServerSide({ tenant, itensSolicitados: [], read }),
      (e) => e.code === "invalid-argument");
  });
});

describe("computeOrderQuoteDedupeHash — base da idempotência/retry", () => {
  it("mesmo tenant + mesmo token sempre gera o mesmo hash (retry seguro)", () => {
    const h1 = computeOrderQuoteDedupeHash(tenant, "tentativa-123");
    const h2 = computeOrderQuoteDedupeHash(tenant, "tentativa-123");
    assert.equal(h1, h2);
  });

  it("tenants diferentes nunca compartilham hash, mesmo com o mesmo token", () => {
    const h1 = computeOrderQuoteDedupeHash({ ownerUid: "ownerA" }, "tentativa-123");
    const h2 = computeOrderQuoteDedupeHash({ ownerUid: "ownerB" }, "tentativa-123");
    assert.notEqual(h1, h2);
  });

  it("sem token, retorna null (sem dedupe — cada chamada cria uma quote nova)", () => {
    assert.equal(computeOrderQuoteDedupeHash(tenant, ""), null);
    assert.equal(computeOrderQuoteDedupeHash(tenant, undefined), null);
  });
});
