import assert from "node:assert/strict";
import { test } from "node:test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import api from "../../../functions/src/public/index.js";

assert.match(process.env.FIRESTORE_EMULATOR_HOST || "", /^(127\.0\.0\.1|localhost):\d+$/, "Emulator only; never production");

// SECURITY-CHECKOUT-SERVER-AUTHORITY-001 — transação real (não mock),
// concorrência real, e resolução de tenant contra documentos reais no
// Emulator. Complementa (não repete) tests/functions/public-checkout.test.mjs
// (mocks, sem Emulator, foco na lógica pura de preço/estoque/agregação).
test("public order quote: idempotência concorrente, expiração de token e resolução de tenant server-side", async () => {
  const app = initializeApp({ projectId: "demo-vide-hub" }, "astra-order-quote");
  const db = getFirestore(app);
  const prefix = `astra-quote-${Date.now()}`;
  const ownerA = `${prefix}-ownerA`;
  const ownerB = `${prefix}-ownerB`;
  const ownerBlocked = `${prefix}-owner-blocked`;
  const storeSlugA = `${prefix}-loja-a`;
  const storeSlugB = `${prefix}-loja-b`;
  const storeSlugBlocked = `${prefix}-loja-bloqueada`;
  const storeSlugInconsistente = `${prefix}-loja-sem-dono`;
  const pageId = `${prefix}__lp`;
  const produtoA = `${prefix}-prod-a`;

  try {
    await db.doc(`usuarios/${ownerA}`).set({ status: "aprovado" });
    await db.doc(`usuarios/${ownerB}`).set({ status: "aprovado" });
    await db.doc(`usuarios/${ownerBlocked}`).set({ status: "bloqueado" });
    await db.doc(`vitrines_publicas/${storeSlugA}`).set({ donoUID: ownerA });
    await db.doc(`vitrines_publicas/${storeSlugB}`).set({ donoUID: ownerB });
    await db.doc(`vitrines_publicas/${storeSlugBlocked}`).set({ donoUID: ownerBlocked });
    // "tenant inconsistente": vitrine pública sem donoUID nem emailDono.
    await db.doc(`vitrines_publicas/${storeSlugInconsistente}`).set({ nomeLoja: "Sem dono" });
    await db.doc(`landing_pages_publicas/${pageId}`).set({ donoUID: ownerA, publicado: true });
    await db.doc(`produtos/${produtoA}`).set({ criadoPor: ownerA, nome: "Produto A", preco: 10, statusProduto: "ativo" });

    // ===== Resolução de tenant server-side: ownerUid nunca vem do payload,
    // sempre da fonte pública resolvida =====
    const quoteViaStoreSlug = await api.createOrderQuoteIdempotent({
      storeSlug: storeSlugA,
      ownerUid: "attacker-controlled-uid", // deliberadamente ignorado
      itens: [{ produtoId: produtoA, quantidade: 1 }]
    }, db);
    assert.equal(quoteViaStoreSlug.tenantId, ownerA, "tenantId precisa vir da vitrine pública resolvida, nunca do payload");

    const quoteViaPage = await api.createOrderQuoteIdempotent({
      publicPageId: pageId,
      itens: [{ produtoId: produtoA, quantidade: 1 }]
    }, db);
    assert.equal(quoteViaPage.tenantId, ownerA);
    assert.equal(quoteViaPage.sourceType, "landing-page");

    // ===== Idempotência concorrente: MESMO tenant + MESMO token → uma
    // única quote autoritativa, mesmo com duas chamadas simultâneas (mesma
    // race que createLeadIdempotent já cobre) =====
    const request = { storeSlug: storeSlugA, itens: [{ produtoId: produtoA, quantidade: 2 }], dedupeKey: "tentativa-concorrente" };
    const results = await Promise.all([1, 2].map(() => api.createOrderQuoteIdempotent(request, db)));
    assert.equal(results[0].quoteId, results[1].quoteId, "duas chamadas concorrentes com o mesmo token produzem uma única quote");

    // ===== Mesmo token, tenant DIFERENTE → quotes independentes (o hash é
    // escopado por tenant, nunca só pelo token) =====
    const quoteTenantB = await api.createOrderQuoteIdempotent({
      storeSlug: storeSlugB, itens: [{ produtoId: produtoA, quantidade: 1 }], dedupeKey: "tentativa-concorrente"
    }, db).catch((e) => e);
    // produtoA pertence a ownerA, não a ownerB — isso precisa falhar por
    // cross-tenant, não por colisão de dedupe.
    assert.equal(quoteTenantB.code, "not-found", "produto de outro tenant continua rejeitado mesmo reaproveitando o mesmo token");

    // ===== Token "expirado": um dedupe antigo (fora da janela de TTL) não
    // é reaproveitado — uma chamada nova cria uma quote NOVA =====
    const dedupeHashExpirado = api.computeOrderQuoteDedupeHash({ ownerUid: ownerA }, "tentativa-expirada");
    const now = Date.now();
    const TTL_ALEM_DO_LIMITE_MS = 11 * 60 * 1000; // ORDER_QUOTE_TTL_MS é 10min
    await db.doc(`pedidos_publicos_quotes/quote-antiga-simulada`).set({
      tenantId: ownerA, itens: [], subtotal: 0, total: 0, moeda: "BRL", status: "quote",
      criadoEm: Timestamp.fromMillis(now - TTL_ALEM_DO_LIMITE_MS), criadoEmMillis: now - TTL_ALEM_DO_LIMITE_MS
    });
    await db.doc(`pedido_quote_dedupes/${dedupeHashExpirado}`).set({
      quoteId: "quote-antiga-simulada", tenantId: ownerA, criadoEmMillis: now - TTL_ALEM_DO_LIMITE_MS,
      expiresAt: Timestamp.fromMillis(now - TTL_ALEM_DO_LIMITE_MS + 1000)
    });
    const quoteNovaAposExpirar = await api.createOrderQuoteIdempotent({
      storeSlug: storeSlugA, itens: [{ produtoId: produtoA, quantidade: 1 }], dedupeKey: "tentativa-expirada"
    }, db);
    assert.notEqual(quoteNovaAposExpirar.quoteId, "quote-antiga-simulada", "token fora da janela de TTL gera quote nova, não reaproveita a antiga");

    // ===== expiresAt / não-reserva de estoque explícitos na quote =====
    assert.equal(quoteViaStoreSlug.naoReservaEstoque, true);
    assert.ok(quoteViaStoreSlug.expiresAt, "quote precisa ter expiresAt");

    // ===== Negativos de resolução de tenant =====
    await assert.rejects(
      api.createOrderQuoteIdempotent({ storeSlug: storeSlugBlocked, itens: [{ produtoId: produtoA, quantidade: 1 }] }, db),
      (e) => e.code === "failed-precondition",
      "owner bloqueado (status != aprovado) precisa falhar"
    );
    await assert.rejects(
      api.createOrderQuoteIdempotent({ storeSlug: `${prefix}-loja-inexistente`, itens: [{ produtoId: produtoA, quantidade: 1 }] }, db),
      (e) => e.code === "not-found",
      "loja inexistente precisa falhar"
    );
    await assert.rejects(
      api.createOrderQuoteIdempotent({ publicPageId: `${prefix}-lp-inexistente`, itens: [{ produtoId: produtoA, quantidade: 1 }] }, db),
      (e) => e.code === "not-found",
      "LP inexistente precisa falhar"
    );
    await assert.rejects(
      api.createOrderQuoteIdempotent({ storeSlug: storeSlugInconsistente, itens: [{ produtoId: produtoA, quantidade: 1 }] }, db),
      (e) => e.code === "failed-precondition",
      "vitrine pública sem donoUID/emailDono (tenant inconsistente) precisa falhar"
    );
  } finally {
    await deleteApp(app);
  }
});
