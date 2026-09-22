import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveOrderItemServerSide,
  resolvePublicOrderServerSide,
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

describe("resolveOrderItemServerSide — preço/nome/subtotal nunca confiam no visitante", () => {
  it("positivo: recalcula preço/subtotal a partir do produto real, ignora o que o visitante mandou", async () => {
    const read = fakeRead({ p1: { criadoPor: "ownerA", nome: "Produto Real", preco: 50, statusProduto: "ativo" } });
    const item = await resolveOrderItemServerSide({ produtoId: "p1", quantidade: 2, precoSnapshot: 1, nome: "Fake" }, tenant, read);
    assert.equal(item.precoUnitario, 50);
    assert.equal(item.subtotal, 100);
    assert.equal(item.nome, "Produto Real");
  });

  it("produto inexistente: not-found", async () => {
    const read = fakeRead({});
    await assert.rejects(resolveOrderItemServerSide({ produtoId: "p1", quantidade: 1 }, tenant, read),
      (e) => e.code === "not-found");
  });

  it("produto de outro tenant: not-found (mensagem genérica, não revela cross-tenant)", async () => {
    const read = fakeRead({ p1: { criadoPor: "ownerB", preco: 10, statusProduto: "ativo" } });
    await assert.rejects(resolveOrderItemServerSide({ produtoId: "p1", quantidade: 1 }, tenant, read),
      (e) => e.code === "not-found");
  });

  it("preço manipulado pelo visitante é sempre ignorado, mesmo se muito menor", async () => {
    const read = fakeRead({ p1: { criadoPor: "ownerA", preco: 200, statusProduto: "ativo" } });
    const item = await resolveOrderItemServerSide({ produtoId: "p1", quantidade: 1, precoSnapshot: 0.01 }, tenant, read);
    assert.equal(item.precoUnitario, 200);
  });

  it("quantidade inválida (zero, negativa, não numérica): invalid-argument", async () => {
    const read = fakeRead({ p1: { criadoPor: "ownerA", preco: 10, statusProduto: "ativo" } });
    for (const quantidade of [0, -1, "abc", null, undefined, NaN]) {
      await assert.rejects(resolveOrderItemServerSide({ produtoId: "p1", quantidade }, tenant, read),
        (e) => e.code === "invalid-argument", `quantidade=${quantidade}`);
    }
  });

  it("quantidade é limitada ao teto (MAX_QUANTITY_PER_ITEM), nunca lançada livre pelo visitante", async () => {
    const read = fakeRead({ p1: { criadoPor: "ownerA", preco: 1, statusProduto: "ativo" } });
    const item = await resolveOrderItemServerSide({ produtoId: "p1", quantidade: 999999 }, tenant, read);
    assert.equal(item.quantidade, MAX_QUANTITY_PER_ITEM);
  });

  it("produto rascunho: failed-precondition", async () => {
    const read = fakeRead({ p1: { criadoPor: "ownerA", preco: 10, statusProduto: "rascunho" } });
    await assert.rejects(resolveOrderItemServerSide({ produtoId: "p1", quantidade: 1 }, tenant, read),
      (e) => e.code === "failed-precondition");
  });

  it("produto arquivado: failed-precondition", async () => {
    const read = fakeRead({ p1: { criadoPor: "ownerA", preco: 10, statusProduto: "arquivado" } });
    await assert.rejects(resolveOrderItemServerSide({ produtoId: "p1", quantidade: 1 }, tenant, read),
      (e) => e.code === "failed-precondition");
  });

  it("estoque insuficiente (quando rastreado): failed-precondition", async () => {
    const read = fakeRead({ p1: { criadoPor: "ownerA", preco: 10, statusProduto: "ativo", estoque: 2 } });
    await assert.rejects(resolveOrderItemServerSide({ produtoId: "p1", quantidade: 3 }, tenant, read),
      (e) => e.code === "failed-precondition");
  });

  it('estoque não rastreado ("") nunca bloqueia', async () => {
    const read = fakeRead({ p1: { criadoPor: "ownerA", preco: 10, statusProduto: "ativo", estoque: "" } });
    const item = await resolveOrderItemServerSide({ produtoId: "p1", quantidade: 500 }, tenant, read);
    assert.equal(item.quantidade, 500);
  });

  it("preço real inválido no documento (não numérico/negativo): failed-precondition", async () => {
    const read = fakeRead({ p1: { criadoPor: "ownerA", preco: "abc", statusProduto: "ativo" } });
    await assert.rejects(resolveOrderItemServerSide({ produtoId: "p1", quantidade: 1 }, tenant, read),
      (e) => e.code === "failed-precondition");
  });
});

describe("resolvePublicOrderServerSide — pedido completo", () => {
  it("soma corretamente múltiplos itens, com subtotal/total sempre calculados no servidor", async () => {
    const read = fakeRead({
      p1: { criadoPor: "ownerA", nome: "A", preco: 10, statusProduto: "ativo" },
      p2: { criadoPor: "ownerA", nome: "B", preco: 20, statusProduto: "ativo" }
    });
    const resultado = await resolvePublicOrderServerSide({
      tenant, itensSolicitados: [{ produtoId: "p1", quantidade: 2 }, { produtoId: "p2", quantidade: 1 }], read
    });
    assert.equal(resultado.subtotal, 40);
    assert.equal(resultado.total, 40);
    assert.equal(resultado.itens.length, 2);
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

  it("payload excessivo: mais itens que o permitido é rejeitado antes de qualquer leitura", async () => {
    const read = fakeRead({ p1: { criadoPor: "ownerA", preco: 1, statusProduto: "ativo" } });
    const itensSolicitados = Array.from({ length: MAX_ITEMS_PER_ORDER + 1 }, () => ({ produtoId: "p1", quantidade: 1 }));
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
