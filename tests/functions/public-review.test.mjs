import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reviewPayload, assertReasonablePayloadSize } from "../../functions/src/public/index.js";

const product = { id: "prodA", ownerUid: "ownerA" };

describe("reviewPayload — tenant e produto sempre resolvidos pelo servidor, nunca pelo visitante", () => {
  it("visitante válido gera uma avaliação completa, sempre com status novo", () => {
    const payload = reviewPayload({ nome: "Cliente Real", nota: 5, comentario: "Gostei." }, product);
    assert.equal(payload.produtoId, "prodA");
    assert.equal(payload.criadoPor, "ownerA");
    assert.equal(payload.nome, "Cliente Real");
    assert.equal(payload.nota, 5);
    assert.equal(payload.status, "novo");
  });

  it("criadoPor/produtoId arbitrário enviado pelo visitante é sempre ignorado — vem só do produto resolvido", () => {
    const payload = reviewPayload({
      nome: "Ataque",
      nota: 5,
      criadoPor: "attacker",
      produtoId: "prodAtacante"
    }, product);
    assert.equal(payload.criadoPor, "ownerA");
    assert.equal(payload.produtoId, "prodA");
  });

  it("nome vazio é rejeitado com invalid-argument", () => {
    assert.throws(() => reviewPayload({ nota: 5 }, product), (error) => {
      assert.equal(error.code, "invalid-argument");
      return true;
    });
  });

  it("nota fora do intervalo 1-5 é rejeitada", () => {
    assert.throws(() => reviewPayload({ nome: "Cliente", nota: 0 }, product), (error) => {
      assert.equal(error.code, "invalid-argument");
      return true;
    });
    assert.throws(() => reviewPayload({ nome: "Cliente", nota: 6 }, product), (error) => {
      assert.equal(error.code, "invalid-argument");
      return true;
    });
  });

  it("nota decimal é rejeitada (não é arredondada silenciosamente)", () => {
    assert.throws(() => reviewPayload({ nome: "Cliente", nota: 4.5 }, product), (error) => {
      assert.equal(error.code, "invalid-argument");
      return true;
    });
  });

  it("status/moderadoPor enviados pelo visitante nunca aparecem no payload — sempre \"novo\" e sem campo de moderação", () => {
    const payload = reviewPayload({
      nome: "Cliente",
      nota: 5,
      status: "publicada",
      moderadoPor: "attacker"
    }, product);
    assert.equal(payload.status, "novo");
    assert.equal(payload.moderadoPor, undefined);
  });

  it("comentário acima do limite é truncado, nunca rejeitado silenciosamente sem limite", () => {
    const payload = reviewPayload({ nome: "Cliente", nota: 5, comentario: "x".repeat(5000) }, product);
    assert.ok(payload.comentario.length <= 1000);
  });
});

describe("assertReasonablePayloadSize — corta payload hostil antes de tocar o Firestore", () => {
  it("aceita um payload normal de avaliação", () => {
    assert.doesNotThrow(() => assertReasonablePayloadSize({ nome: "Cliente", nota: 5, comentario: "Gostei." }));
  });

  it("rejeita payload muito grande com invalid-argument", () => {
    assert.throws(() => assertReasonablePayloadSize({ nome: "Cliente", lixo: "x".repeat(50000) }), (error) => {
      assert.equal(error.code, "invalid-argument");
      return true;
    });
  });
});
