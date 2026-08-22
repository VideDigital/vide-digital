import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  leadPayload,
  sanitizeOrderSnapshot,
  assertReasonablePayloadSize
} from "../../functions/src/public/index.js";

const tenant = { ownerUid: "ownerA", storeSlug: "loja-a", store: { nomeLoja: "Loja A" } };

describe("leadPayload — tenant sempre resolvido pelo servidor, nunca pelo payload do visitante", () => {
  it("visitante válido com nome gera um lead completo, atribuído ao tenant resolvido", () => {
    const payload = leadPayload({ nome: "Maria", origem: "instagram", produtoId: "prod1" }, tenant);
    assert.equal(payload.criadoPor, "ownerA");
    assert.equal(payload.tenantId, "ownerA");
    assert.equal(payload.lojaId, "ownerA");
    assert.equal(payload.nome, "Maria");
    assert.equal(payload.statusLead, "novo");
    assert.equal(payload.status, "novo");
    assert.equal(payload.canal, "loja_publica");
  });

  it("visitante válido com só whatsapp ou só email também é aceito (não exige os 3)", () => {
    assert.equal(leadPayload({ whatsapp: "11999998888" }, tenant).criadoPor, "ownerA");
    assert.equal(leadPayload({ email: "cliente@example.com" }, tenant).criadoPor, "ownerA");
  });

  it("ownerUid/criadoPor/tenantId arbitrário enviado pelo visitante é sempre ignorado", () => {
    const payload = leadPayload({
      nome: "Ataque",
      ownerUid: "attacker",
      criadoPor: "attacker",
      tenantId: "attacker",
      lojaId: "attacker"
    }, tenant);
    assert.equal(payload.criadoPor, "ownerA");
    assert.equal(payload.tenantId, "ownerA");
    assert.equal(payload.lojaId, "ownerA");
  });

  it("campo inválido (sem nenhum dado de contato) é rejeitado com invalid-argument", () => {
    assert.throws(() => leadPayload({ produtoId: "prod1" }, tenant), (error) => {
      assert.equal(error.code, "invalid-argument");
      return true;
    });
  });

  it("tipoCaptura desconhecido cai no default seguro (interesse), não quebra nem aceita valor livre", () => {
    const payload = leadPayload({ nome: "Maria", tipoCaptura: "algo_nao_mapeado" }, tenant);
    assert.equal(payload.tipoCaptura, "interesse");
  });

  it("todo campo de texto é sempre string truncada — nunca objeto, array ou HTML/script cru sem limite", () => {
    const scriptPayload = "<script>alert(1)</script>".repeat(50);
    const payload = leadPayload({ nome: "Maria", origem: scriptPayload }, tenant);
    assert.equal(typeof payload.origem, "string");
    assert.ok(payload.origem.length <= 120);
  });

  it("não vaza nenhum campo extra desconhecido enviado pelo visitante (allowlist fechada de campos)", () => {
    const payload = leadPayload({ nome: "Maria", campoInventado: "qualquer coisa", __proto__: { poluido: true } }, tenant);
    assert.equal(payload.campoInventado, undefined);
    assert.equal(payload.poluido, undefined);
  });

  it("pedidoSnapshot presente marca tipoRegistro pedido e carrega valorOportunidade a partir do total sanitizado", () => {
    const payload = leadPayload({
      nome: "Maria",
      pedidoSnapshot: { itens: [{ nome: "Produto X", quantidade: 2, preco: 50 }] }
    }, tenant);
    assert.equal(payload.tipoRegistro, "pedido");
    assert.equal(payload.valorOportunidade, 100);
    assert.equal(payload.pedidoStatus, "novo");
  });
});

describe("sanitizeOrderSnapshot — nunca confia em preço/quantidade/tamanho arbitrário do visitante", () => {
  it("quantidade e preço são sempre grampeados (clamp) a um intervalo seguro", () => {
    const snapshot = sanitizeOrderSnapshot({
      itens: [{ nome: "Produto X", quantidade: -5, preco: -100 }]
    }, {});
    assert.equal(snapshot.itens[0].quantidade, 1);
    assert.equal(snapshot.itens[0].precoSnapshot, 0);
  });

  it("nunca aceita mais de 20 itens, mesmo se o visitante enviar uma lista gigante", () => {
    const itensGigantes = Array.from({ length: 5000 }, (_, i) => ({ nome: `Item ${i}`, quantidade: 1, preco: 1 }));
    const snapshot = sanitizeOrderSnapshot({ itens: itensGigantes }, {});
    assert.equal(snapshot.itens.length, 20);
  });

  it("retorna null quando não há pedidoSnapshot (lead comum, sem pedido)", () => {
    assert.equal(sanitizeOrderSnapshot(undefined, {}), null);
    assert.equal(sanitizeOrderSnapshot("string maliciosa", {}), null);
  });
});

describe("assertReasonablePayloadSize — corta payload hostil antes de tocar o Firestore", () => {
  it("aceita um payload normal de lead (poucos campos de texto)", () => {
    assert.doesNotThrow(() => assertReasonablePayloadSize({ nome: "Maria", whatsapp: "11999998888" }));
  });

  it("rejeita um payload muito grande (ex.: array gigante ou string enorme) com invalid-argument", () => {
    const payloadGigante = { nome: "Maria", lixo: "x".repeat(50000) };
    assert.throws(() => assertReasonablePayloadSize(payloadGigante), (error) => {
      assert.equal(error.code, "invalid-argument");
      return true;
    });
  });
});
