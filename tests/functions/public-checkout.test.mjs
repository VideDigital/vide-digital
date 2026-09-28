import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveOrderItemServerSide,
  resolvePublicOrderServerSide,
  agregarItensPorProduto,
  parseStrictQuantity,
  precoParaCentavos,
  calcularPrecoEfetivoCentavos,
  CUPOM_TIMEZONE,
  CUPOM_DESCONTO_MIN,
  CUPOM_DESCONTO_MAX,
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

  it("estoque não rastreado (null) nunca bloqueia", async () => {
    const read = fakeRead({ p1: { criadoPor: "ownerA", preco: 10, statusProduto: "ativo", estoque: null } });
    const item = await resolveOrderItemServerSide("p1", 500, tenant, read);
    assert.equal(item.quantidade, 500);
  });

  it("estoque não rastreado (ausente/undefined) nunca bloqueia", async () => {
    const read = fakeRead({ p1: { criadoPor: "ownerA", preco: 10, statusProduto: "ativo" } });
    const item = await resolveOrderItemServerSide("p1", 500, tenant, read);
    assert.equal(item.quantidade, 500);
  });

  it("estoque numérico exatamente igual à quantidade: PASS", async () => {
    const read = fakeRead({ p1: { criadoPor: "ownerA", preco: 10, statusProduto: "ativo", estoque: 5 } });
    const item = await resolveOrderItemServerSide("p1", 5, tenant, read);
    assert.equal(item.quantidade, 5);
  });

  it("estoque numérico abaixo da quantidade: failed-precondition", async () => {
    const read = fakeRead({ p1: { criadoPor: "ownerA", preco: 10, statusProduto: "ativo", estoque: 5 } });
    await assert.rejects(resolveOrderItemServerSide("p1", 6, tenant, read), (e) => e.code === "failed-precondition");
  });

  it('estoque como string numérica ("5") continua compatível (legado): PASS', async () => {
    const read = fakeRead({ p1: { criadoPor: "ownerA", preco: 10, statusProduto: "ativo", estoque: "5" } });
    const item = await resolveOrderItemServerSide("p1", 5, tenant, read);
    assert.equal(item.quantidade, 5);
  });

  describe("estoque corrompido: fail-closed, NUNCA tratado como não rastreado", () => {
    for (const estoqueCorrompido of ["abc", NaN, Infinity, -Infinity]) {
      it(`estoque=${String(estoqueCorrompido)}: failed-precondition`, async () => {
        const read = fakeRead({ p1: { criadoPor: "ownerA", preco: 10, statusProduto: "ativo", estoque: estoqueCorrompido } });
        await assert.rejects(resolveOrderItemServerSide("p1", 1, tenant, read), (e) => e.code === "failed-precondition");
      });
    }
  });

  it("estoque zero bloqueia qualquer quantidade positiva: failed-precondition", async () => {
    const read = fakeRead({ p1: { criadoPor: "ownerA", preco: 10, statusProduto: "ativo", estoque: 0 } });
    await assert.rejects(resolveOrderItemServerSide("p1", 1, tenant, read), (e) => e.code === "failed-precondition");
  });

  it("estoque negativo bloqueia qualquer quantidade positiva: failed-precondition", async () => {
    const read = fakeRead({ p1: { criadoPor: "ownerA", preco: 10, statusProduto: "ativo", estoque: -1 } });
    await assert.rejects(resolveOrderItemServerSide("p1", 1, tenant, read), (e) => e.code === "failed-precondition");
  });

  describe("estoque decimal (1.5): comportamento atual documentado, NÃO alterado nesta missão (fora de escopo)", () => {
    it("quantidade 1 (<=1.5): PASS", async () => {
      const read = fakeRead({ p1: { criadoPor: "ownerA", preco: 10, statusProduto: "ativo", estoque: 1.5 } });
      const item = await resolveOrderItemServerSide("p1", 1, tenant, read);
      assert.equal(item.quantidade, 1);
    });

    it("quantidade 2 (>1.5): failed-precondition", async () => {
      const read = fakeRead({ p1: { criadoPor: "ownerA", preco: 10, statusProduto: "ativo", estoque: 1.5 } });
      await assert.rejects(resolveOrderItemServerSide("p1", 2, tenant, read), (e) => e.code === "failed-precondition");
    });
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

// SECURITY-CHECKOUT-COUPON-PARITY-036 — cupom automático por produto
// calculado no servidor. Contrato decidido pelo proprietário (D1–D5):
// America/Sao_Paulo (IANA), dia de validade inclusivo, arredondamento do
// preço UNITÁRIO promocional em centavos (meio para cima), cupom só na
// origem "store", cupomAtivo === true estrito, desconto inteiro 1..90.
describe("calcularPrecoEfetivoCentavos — cupom automático server-side", () => {
  // 2026-09-28 12:00 em São Paulo.
  const AGORA = Date.parse("2026-09-28T15:00:00Z");
  const produtoComCupom = (extra = {}) => ({
    preco: 19.9, cupomAtivo: true, cupomDesconto: 15, cupomValidade: "", cupomCodigo: "BEMVINDO", ...extra
  });
  const indisponivel = (e) => e.code === "failed-precondition" && e.message === "Produto indisponível no momento.";

  it("contrato exposto: fuso IANA America/Sao_Paulo e faixa 1..90", () => {
    assert.equal(CUPOM_TIMEZONE, "America/Sao_Paulo");
    assert.equal(CUPOM_DESCONTO_MIN, 1);
    assert.equal(CUPOM_DESCONTO_MAX, 90);
  });

  it("1. produto sem nenhum campo de cupom → preço base", () => {
    assert.deepEqual(calcularPrecoEfetivoCentavos({ preco: 19.9 }, AGORA), {
      precoBaseCentavos: 1990, descontoCentavos: 0, precoUnitarioCentavos: 1990, precoValidoAteMillis: null
    });
  });

  it("2. cupomAtivo=false → preço base, mesmo com campos antigos malformados", () => {
    for (const extra of [
      { cupomAtivo: false },
      { cupomAtivo: false, cupomDesconto: "abc", cupomValidade: "2026-02-30" },
      { cupomAtivo: false, cupomDesconto: 500, cupomValidade: 12345 },
      { cupomAtivo: false, cupomDesconto: NaN, cupomValidade: null }
    ]) {
      const preco = calcularPrecoEfetivoCentavos(produtoComCupom(extra), AGORA);
      assert.equal(preco.precoUnitarioCentavos, 1990, JSON.stringify(extra));
      assert.equal(preco.descontoCentavos, 0);
    }
  });

  it("2b. SOMENTE cupomAtivo === true ativa: \"true\", \"false\", 1, 0, null, undefined → preço base", () => {
    for (const cupomAtivo of ["true", "false", 1, 0, null, undefined, "sim", {}]) {
      const preco = calcularPrecoEfetivoCentavos(produtoComCupom({ cupomAtivo }), AGORA);
      assert.equal(preco.precoUnitarioCentavos, 1990, `cupomAtivo=${JSON.stringify(cupomAtivo)}`);
    }
  });

  it("3. cupom ativo sem validade → desconto aplicado (R$ 19,90 com 15% = 1692 centavos)", () => {
    assert.deepEqual(calcularPrecoEfetivoCentavos(produtoComCupom(), AGORA), {
      precoBaseCentavos: 1990, descontoCentavos: 298, precoUnitarioCentavos: 1692, precoValidoAteMillis: null
    });
  });

  it("3b. cupom ativo com validade futura → desconto aplicado e prazo = início do dia seguinte em São Paulo", () => {
    const preco = calcularPrecoEfetivoCentavos(produtoComCupom({ cupomValidade: "2026-09-30" }), AGORA);
    assert.equal(preco.precoUnitarioCentavos, 1692);
    assert.equal(preco.precoValidoAteMillis, Date.parse("2026-10-01T03:00:00.000Z"));
  });

  it("4. cupom ativo expirado → preço base (sem erro)", () => {
    const preco = calcularPrecoEfetivoCentavos(produtoComCupom({ cupomValidade: "2026-09-27" }), AGORA);
    assert.deepEqual(preco, {
      precoBaseCentavos: 1990, descontoCentavos: 0, precoUnitarioCentavos: 1990, precoValidoAteMillis: null
    });
  });

  describe("5. limites da validade (dia inteiro, inclusivo, em America/Sao_Paulo)", () => {
    const produto = produtoComCupom({ cupomValidade: "2026-09-30" });

    it("primeiro instante do dia (00:00:00.000 SP) → válido", () => {
      assert.equal(calcularPrecoEfetivoCentavos(produto, Date.parse("2026-09-30T03:00:00.000Z")).precoUnitarioCentavos, 1692);
    });

    it("último milissegundo do dia (23:59:59.999 SP) → válido", () => {
      assert.equal(calcularPrecoEfetivoCentavos(produto, Date.parse("2026-10-01T02:59:59.999Z")).precoUnitarioCentavos, 1692);
    });

    it("primeiro instante do dia seguinte (00:00:00.000 SP) → expirado, preço base", () => {
      assert.equal(calcularPrecoEfetivoCentavos(produto, Date.parse("2026-10-01T03:00:00.000Z")).precoUnitarioCentavos, 1990);
    });

    it("usa o relógio de São Paulo, não UTC: 22:00 SP do dia 30 já é dia 01 em UTC e continua válido", () => {
      assert.equal(calcularPrecoEfetivoCentavos(produto, Date.parse("2026-10-01T01:00:00.000Z")).precoUnitarioCentavos, 1692);
    });

    it("usa o banco IANA, não um offset fixo -03:00 (horário de verão histórico, -02:00)", () => {
      const verao = produtoComCupom({ cupomValidade: "2019-01-10" });
      const preco = calcularPrecoEfetivoCentavos(verao, Date.parse("2019-01-10T15:00:00Z"));
      // Fim do dia 10/01/2019 em São Paulo (-02:00) = 02:00Z; com -03:00 fixo seria 03:00Z.
      assert.equal(preco.precoValidoAteMillis, Date.parse("2019-01-11T02:00:00.000Z"));
      assert.equal(calcularPrecoEfetivoCentavos(verao, Date.parse("2019-01-11T02:30:00Z")).precoUnitarioCentavos, 1990,
        "02:30Z já é 00:30 do dia 11 em São Paulo naquela data — expirado");
    });

    it("virada de horário de verão à meia-noite (dia 04/11/2018 sem 00:00) não encurta nem estende o cupom", () => {
      const preco = calcularPrecoEfetivoCentavos(produtoComCupom({ cupomValidade: "2018-11-03" }), Date.parse("2018-11-03T15:00:00Z"));
      assert.equal(preco.precoValidoAteMillis, Date.parse("2018-11-04T03:00:00.000Z"));
    });
  });

  describe("6/7. arredondamento: preço unitário promocional → centavo, meio para cima, inteiro", () => {
    for (const [preco, desconto, esperado] of [
      [10, 10, 900],        // R$ 10,00 com 10% = R$ 9,00
      [9.99, 10, 899],      // 899,1 → 899
      [19.9, 15, 1692],     // 1691,5 → 1692 (meio para cima)
      [29.99, 10, 2699],    // 2699,1 → 2699
      [0.01, 10, 1],        // 0,9 → 1
      [0.01, 50, 1],        // 0,5 → 1 (meio para cima)
      [0.01, 90, 0],        // 0,1 → 0 (nunca negativo)
      [0, 50, 0],           // preço base 0 continua permitido
      [0.29, 50, 15]        // 14,5 → 15
    ]) {
      it(`R$ ${preco} com ${desconto}% → ${esperado} centavos`, () => {
        const resultado = calcularPrecoEfetivoCentavos(produtoComCupom({ preco, cupomDesconto: desconto }), AGORA);
        assert.equal(resultado.precoUnitarioCentavos, esperado);
        assert.ok(Number.isInteger(resultado.precoUnitarioCentavos));
        assert.equal(resultado.precoBaseCentavos - resultado.descontoCentavos, esperado);
      });
    }
  });

  it("9. maior e menor percentual válidos (90 e 1)", () => {
    assert.equal(calcularPrecoEfetivoCentavos(produtoComCupom({ preco: 10, cupomDesconto: 90 }), AGORA).precoUnitarioCentavos, 100);
    assert.equal(calcularPrecoEfetivoCentavos(produtoComCupom({ preco: 10, cupomDesconto: 1 }), AGORA).precoUnitarioCentavos, 990);
  });

  describe("8/10–14. cupom ATIVO com percentual inválido → failed-precondition genérico", () => {
    for (const cupomDesconto of [0, -5, 91, 100, 150, "abc", "10", "", NaN, Infinity, -Infinity, 10.5, null, undefined, true, {}]) {
      it(`cupomDesconto=${typeof cupomDesconto === "number" ? String(cupomDesconto) : JSON.stringify(cupomDesconto)}`, () => {
        assert.throws(() => calcularPrecoEfetivoCentavos(produtoComCupom({ cupomDesconto }), AGORA), indisponivel);
      });
    }
  });

  describe("15. cupom ATIVO com validade malformada → failed-precondition genérico", () => {
    for (const cupomValidade of [
      "2026-02-30", "2026-13-01", "2026-00-10", "2026-09-31", "30/09/2026", "2026-9-30",
      "2026-09-30T23:59:59", "2026-09-30Z", " 2026-09-30", "2026-09-30 ", "abc",
      20260930, null, undefined, { seconds: 1790000000, nanoseconds: 0 }, new Date("2026-09-30")
    ]) {
      it(`cupomValidade=${cupomValidade instanceof Date ? "Date" : JSON.stringify(cupomValidade)}`, () => {
        assert.throws(() => calcularPrecoEfetivoCentavos(produtoComCupom({ cupomValidade }), AGORA), indisponivel);
      });
    }

    it("data real de ano bissexto (2028-02-29) é aceita", () => {
      assert.equal(calcularPrecoEfetivoCentavos(produtoComCupom({ cupomValidade: "2028-02-29" }), AGORA).precoUnitarioCentavos, 1692);
    });

    it("validade malformada é rejeitada mesmo se a data 'pareceria' expirada", () => {
      assert.throws(() => calcularPrecoEfetivoCentavos(produtoComCupom({ cupomValidade: "2020-02-30" }), AGORA), indisponivel);
    });
  });

  it("16. preço base inválido continua fail-closed, com ou sem cupom", () => {
    for (const preco of ["abc", -1, NaN, Infinity, undefined]) {
      assert.throws(() => calcularPrecoEfetivoCentavos(produtoComCupom({ preco }), AGORA), (e) => e.code === "failed-precondition");
      assert.throws(() => calcularPrecoEfetivoCentavos({ preco }, AGORA), (e) => e.code === "failed-precondition");
    }
  });

  it("cupomCodigo não influencia o preço", () => {
    for (const cupomCodigo of ["", "OUTRO", undefined, "90OFF"]) {
      assert.equal(calcularPrecoEfetivoCentavos(produtoComCupom({ cupomCodigo }), AGORA).precoUnitarioCentavos, 1692);
    }
  });

  it("origem sem cupom (aplicarCupom=false) → preço base, sem avaliar campos de cupom", () => {
    assert.equal(calcularPrecoEfetivoCentavos(produtoComCupom(), AGORA, { aplicarCupom: false }).precoUnitarioCentavos, 1990);
    assert.equal(calcularPrecoEfetivoCentavos(produtoComCupom({ cupomDesconto: "abc" }), AGORA, { aplicarCupom: false }).precoUnitarioCentavos, 1990);
  });

  it("instante é obrigatório e controlado pelo servidor (sem Date.now() escondido)", () => {
    for (const agora of [undefined, null, "2026-09-28", NaN]) {
      assert.throws(() => calcularPrecoEfetivoCentavos(produtoComCupom(), agora), TypeError);
    }
  });
});

describe("cupom no pedido server-side (resolveOrderItemServerSide / resolvePublicOrderServerSide)", () => {
  const AGORA = Date.parse("2026-09-28T15:00:00Z");
  const tenantLoja = { ownerUid: "ownerA", sourceType: "store" };
  const tenantLp = { ownerUid: "ownerA", sourceType: "landing-page" };
  const produtoComCupom = (extra = {}) => ({
    criadoPor: "ownerA", nome: "P", preco: 19.9, statusProduto: "ativo",
    cupomAtivo: true, cupomDesconto: 15, cupomValidade: "", ...extra
  });

  it("3/6. loja: preço unitário promocional × quantidade (1692 × 2 = 3384), decimais derivados dos centavos", async () => {
    const item = await resolveOrderItemServerSide("p1", 2, tenantLoja, fakeRead({ p1: produtoComCupom() }), AGORA);
    assert.equal(item.precoBaseCentavos, 1990);
    assert.equal(item.descontoCentavos, 298);
    assert.equal(item.precoUnitarioCentavos, 1692);
    assert.equal(item.subtotalCentavos, 3384);
    assert.equal(item.precoUnitario, 16.92);
    assert.equal(item.subtotal, 33.84);
  });

  it("D3: origem landing page NÃO aplica cupom (preço base), nem falha por cupom malformado", async () => {
    const item = await resolveOrderItemServerSide("p1", 2, tenantLp, fakeRead({ p1: produtoComCupom() }), AGORA);
    assert.equal(item.precoUnitarioCentavos, 1990);
    assert.equal(item.descontoCentavos, 0);
    assert.equal(item.subtotalCentavos, 3980);
    const malformado = await resolveOrderItemServerSide("p1", 1, tenantLp, fakeRead({ p1: produtoComCupom({ cupomDesconto: "abc" }) }), AGORA);
    assert.equal(malformado.precoUnitarioCentavos, 1990);
  });

  it("origem ausente/desconhecida no tenant → nunca aplica cupom (fail-safe)", async () => {
    for (const t of [{ ownerUid: "ownerA" }, { ownerUid: "ownerA", sourceType: "STORE" }]) {
      const item = await resolveOrderItemServerSide("p1", 1, t, fakeRead({ p1: produtoComCupom() }), AGORA);
      assert.equal(item.precoUnitarioCentavos, 1990);
    }
  });

  it("cupom ativo malformado na loja → failed-precondition genérico (não revela o motivo)", async () => {
    await assert.rejects(
      resolveOrderItemServerSide("p1", 1, tenantLoja, fakeRead({ p1: produtoComCupom({ cupomDesconto: 150 }) }), AGORA),
      (e) => e.code === "failed-precondition" && e.message === "Produto indisponível no momento." && !/cupom/i.test(e.message)
    );
  });

  it("16. preço base inválido continua rejeitado com cupom ativo", async () => {
    await assert.rejects(
      resolveOrderItemServerSide("p1", 1, tenantLoja, fakeRead({ p1: produtoComCupom({ preco: "abc" }) }), AGORA),
      (e) => e.code === "failed-precondition"
    );
  });

  it("17. estoque continua validado com cupom ativo", async () => {
    await assert.rejects(
      resolveOrderItemServerSide("p1", 3, tenantLoja, fakeRead({ p1: produtoComCupom({ estoque: 2 }) }), AGORA),
      (e) => e.code === "failed-precondition"
    );
  });

  it("18. produto não ativo continua rejeitado mesmo com cupom válido", async () => {
    await assert.rejects(
      resolveOrderItemServerSide("p1", 1, tenantLoja, fakeRead({ p1: produtoComCupom({ statusProduto: "rascunho" }) }), AGORA),
      (e) => e.code === "failed-precondition"
    );
  });

  it("19. produto de outro tenant com cupom continua not-found genérico (cupom de B nunca vale na loja de A)", async () => {
    await assert.rejects(
      resolveOrderItemServerSide("p1", 1, tenantLoja, fakeRead({ p1: produtoComCupom({ criadoPor: "ownerB", cupomDesconto: 90 }) }), AGORA),
      (e) => e.code === "not-found"
    );
  });

  it("20. duplicatas continuam agregadas antes do estoque, com cupom", async () => {
    const read = fakeRead({ p1: produtoComCupom({ estoque: 5 }) });
    await assert.rejects(resolvePublicOrderServerSide({
      tenant: tenantLoja, itensSolicitados: [{ produtoId: "p1", quantidade: 3 }, { produtoId: "p1", quantidade: 3 }], read, agora: AGORA
    }), (e) => e.code === "failed-precondition");
    const ok = await resolvePublicOrderServerSide({
      tenant: tenantLoja, itensSolicitados: [{ produtoId: "p1", quantidade: 2 }, { produtoId: "p1", quantidade: 3 }], read, agora: AGORA
    });
    assert.equal(ok.itens.length, 1);
    assert.equal(ok.itens[0].subtotalCentavos, 1692 * 5);
  });

  it("21/22. múltiplos itens: subtotal/total somados em centavos inteiros a partir do unitário arredondado", async () => {
    const read = fakeRead({
      p1: produtoComCupom(),
      p2: { criadoPor: "ownerA", nome: "Sem cupom", preco: 10, statusProduto: "ativo" },
      p3: produtoComCupom({ preco: 9.99, cupomDesconto: 10 })
    });
    const resultado = await resolvePublicOrderServerSide({
      tenant: tenantLoja,
      itensSolicitados: [{ produtoId: "p1", quantidade: 2 }, { produtoId: "p2", quantidade: 1 }, { produtoId: "p3", quantidade: 3 }],
      read,
      agora: AGORA
    });
    // 1692×2 + 1000×1 + 899×3 = 3384 + 1000 + 2697 = 7081
    assert.equal(resultado.subtotalCentavos, 7081);
    assert.equal(resultado.totalCentavos, 7081);
    assert.ok(Number.isInteger(resultado.totalCentavos));
    assert.equal(resultado.total, 70.81);
    assert.equal(resultado.precoValidoAteMillis, null);
    for (const item of resultado.itens) {
      assert.equal(Object.hasOwn(item, "precoValidoAteMillis"), false, "prazo interno não é persistido por item");
    }
  });

  it("D4: prazo do pedido = menor prazo entre os cupons aplicados", async () => {
    const read = fakeRead({
      p1: produtoComCupom({ cupomValidade: "2026-10-05" }),
      p2: produtoComCupom({ cupomValidade: "2026-09-30" }),
      p3: produtoComCupom({ cupomValidade: "" })
    });
    const resultado = await resolvePublicOrderServerSide({
      tenant: tenantLoja,
      itensSolicitados: [{ produtoId: "p1", quantidade: 1 }, { produtoId: "p2", quantidade: 1 }, { produtoId: "p3", quantidade: 1 }],
      read,
      agora: AGORA
    });
    assert.equal(resultado.precoValidoAteMillis, Date.parse("2026-10-01T03:00:00.000Z"));
  });

  it("23. nenhum dado de preço/cupom enviado pelo visitante influencia o resultado", async () => {
    const read = fakeRead({
      p1: { criadoPor: "ownerA", nome: "Sem cupom", preco: 50, statusProduto: "ativo" },
      p2: produtoComCupom()
    });
    const resultado = await resolvePublicOrderServerSide({
      tenant: tenantLoja,
      itensSolicitados: [
        { produtoId: "p1", quantidade: 1, preco: 0.01, precoUnitario: 0.01, precoUnitarioCentavos: 1, subtotal: 0.01,
          cupomAtivo: true, cupomDesconto: 90, cupomValidade: "", desconto: 49.99, descontoCentavos: 4999, total: 0.01 },
        { produtoId: "p2", quantidade: 1, cupomDesconto: 90, precoBaseCentavos: 1, agora: 0, sourceType: "store" }
      ],
      read,
      agora: AGORA
    });
    assert.equal(resultado.itens[0].precoUnitarioCentavos, 5000);
    assert.equal(resultado.itens[0].descontoCentavos, 0);
    assert.equal(resultado.itens[1].precoUnitarioCentavos, 1692);
    assert.equal(resultado.totalCentavos, 6692);
  });
});
