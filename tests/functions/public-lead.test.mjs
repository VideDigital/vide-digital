import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  leadPayload,
  sanitizeOrderSnapshot,
  sanitizeCamposExtras,
  assertReasonablePayloadSize,
  computeLeadDedupeHash
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

describe("leadPayload — tenant de Landing Page (sourceType landing-page)", () => {
  const tenantLandingPage = {
    ownerUid: "ownerB",
    publicPageId: "loja-b__lp-promocao",
    page: { titulo: "Promoção de verão", donoUID: "ownerB" },
    sourceType: "landing-page"
  };

  it("lead de Landing Page é atribuído ao dono real da página, resolvido no servidor", () => {
    const payload = leadPayload({ nome: "Visitante LP" }, tenantLandingPage);
    assert.equal(payload.criadoPor, "ownerB");
    assert.equal(payload.tenantId, "ownerB");
  });

  it("produtoInteresse cai no título da própria Landing Page quando o visitante não informa nenhum", () => {
    const payload = leadPayload({ nome: "Visitante LP" }, tenantLandingPage);
    assert.equal(payload.produtoInteresse, "Promoção de verão");
  });

  it("ownerUid/criadoPor/tenantId forjados pelo visitante continuam ignorados também no tenant de Landing Page", () => {
    const payload = leadPayload({
      nome: "Ataque LP",
      ownerUid: "attacker",
      criadoPor: "attacker",
      tenantId: "attacker"
    }, tenantLandingPage);
    assert.equal(payload.criadoPor, "ownerB");
    assert.equal(payload.tenantId, "ownerB");
  });
});

describe("leadPayload — campos de atribuição/tracking de Landing Page (gclid/fbclid/camposExtras)", () => {
  it("gclid e fbclid são preservados como texto truncado", () => {
    const payload = leadPayload({ nome: "Maria", gclid: "Cj0KCQ_teste", fbclid: "IwAR_teste" }, tenant);
    assert.equal(payload.gclid, "Cj0KCQ_teste");
    assert.equal(payload.fbclid, "IwAR_teste");
  });

  it("gclid/fbclid ausentes viram string vazia, nunca undefined", () => {
    const payload = leadPayload({ nome: "Maria" }, tenant);
    assert.equal(payload.gclid, "");
    assert.equal(payload.fbclid, "");
  });

  it("camposExtras preserva campos customizados legítimos do formulário", () => {
    const payload = leadPayload({
      nome: "Maria",
      camposExtras: { profissao: "Designer", cidade: "São Paulo" }
    }, tenant);
    assert.deepEqual(payload.camposExtras, { profissao: "Designer", cidade: "São Paulo" });
  });

  it("camposExtras que não é objeto (array, string, número) vira objeto vazio, nunca quebra", () => {
    assert.deepEqual(leadPayload({ nome: "Maria", camposExtras: "ataque" }, tenant).camposExtras, {});
    assert.deepEqual(leadPayload({ nome: "Maria", camposExtras: [1, 2, 3] }, tenant).camposExtras, {});
    assert.deepEqual(leadPayload({ nome: "Maria", camposExtras: 42 }, tenant).camposExtras, {});
  });
});

describe("sanitizeCamposExtras — nunca confia em quantidade/tamanho arbitrário do visitante", () => {
  it("corta em no máximo 20 campos, mesmo se o visitante enviar centenas", () => {
    const entradaGigante = {};
    for (let i = 0; i < 500; i += 1) {
      entradaGigante[`campo_${i}`] = `valor_${i}`;
    }
    const resultado = sanitizeCamposExtras(entradaGigante);
    assert.equal(Object.keys(resultado).length, 20);
  });

  it("trunca nome de campo (60) e valor (500) individualmente", () => {
    const resultado = sanitizeCamposExtras({
      [`campo_${"x".repeat(200)}`]: "y".repeat(2000)
    });
    const [nomeCampo, valorCampo] = Object.entries(resultado)[0];
    assert.ok(nomeCampo.length <= 60);
    assert.ok(valorCampo.length <= 500);
  });

  it("ignora entradas com nome ou valor vazio após sanitização", () => {
    const resultado = sanitizeCamposExtras({ "   ": "algo", valido: "   ", outroValido: "ok" });
    assert.deepEqual(resultado, { outroValido: "ok" });
  });

  it("valores não-string (número, objeto, null) são convertidos com segurança, nunca lançam", () => {
    assert.doesNotThrow(() => sanitizeCamposExtras({ idade: 30, endereco: { rua: "X" }, vazio: null }));
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

describe("computeLeadDedupeHash — CRM-LEAD-008: escopo do dedupe nunca confia só no cliente", () => {
  const tenantA = { ownerUid: "ownerA" };
  const tenantB = { ownerUid: "ownerB" };

  function payloadBase(overrides = {}) {
    return {
      tipoCaptura: "interesse",
      formularioId: "captura_geral",
      paginaOrigem: "loja_publica",
      produtoId: "prod1",
      produtoInteresse: "Produto X",
      whatsapp: "5511999998888",
      email: "",
      sessionId: "sess-1",
      visitorId: "visitor-1",
      ...overrides
    };
  }

  it("mesmo payload + mesmo dedupeKey do cliente -> mesmo hash (retentativa legítima)", () => {
    const hash1 = computeLeadDedupeHash(tenantA, payloadBase(), "lead_abc123");
    const hash2 = computeLeadDedupeHash(tenantA, payloadBase(), "lead_abc123");
    assert.equal(hash1, hash2);
    assert.equal(typeof hash1, "string");
    assert.ok(hash1.length > 0);
  });

  it("visitantes diferentes (contato/sessão diferentes) nunca colidem", () => {
    const hashVisitanteA = computeLeadDedupeHash(tenantA, payloadBase({ whatsapp: "5511999998888" }), "");
    const hashVisitanteB = computeLeadDedupeHash(tenantA, payloadBase({ whatsapp: "5511777776666" }), "");
    assert.notEqual(hashVisitanteA, hashVisitanteB);
  });

  it("Landing Pages/formulários diferentes não colidem indevidamente, mesmo com o mesmo visitante", () => {
    const hashFormA = computeLeadDedupeHash(tenantA, payloadBase({ formularioId: "lp_promocao_verao" }), "");
    const hashFormB = computeLeadDedupeHash(tenantA, payloadBase({ formularioId: "lp_promocao_inverno" }), "");
    assert.notEqual(hashFormA, hashFormB);
  });

  it("tenants diferentes NUNCA compartilham chave, mesmo com payload e dedupeKey idênticos", () => {
    const hashTenantA = computeLeadDedupeHash(tenantA, payloadBase(), "lead_mesmo_key");
    const hashTenantB = computeLeadDedupeHash(tenantB, payloadBase(), "lead_mesmo_key");
    assert.notEqual(hashTenantA, hashTenantB);
  });

  it("sem nenhum dado de contato/sessão pra escopar, retorna null (lead sempre criado sem dedupe)", () => {
    const hash = computeLeadDedupeHash(tenantA, payloadBase({ whatsapp: "", email: "", sessionId: "", visitorId: "" }), "");
    assert.equal(hash, null);
  });

  it("hash não vaza nenhum dado sensível em texto plano (é sempre um digest sha256 hex)", () => {
    const hash = computeLeadDedupeHash(tenantA, payloadBase(), "lead_abc123");
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.ok(!hash.includes("999998888"));
    assert.ok(!hash.includes("ownerA"));
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
