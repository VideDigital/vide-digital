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
    const dedupeHashExpirado = api.computeOrderQuoteDedupeHash({ ownerUid: ownerA, sourceType: "store", storeSlug: storeSlugA }, "tentativa-expirada");
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

// SECURITY-CHECKOUT-COUPON-PARITY-036 — cupom automático na quote real
// (transação + dedupe no Emulator). `now` é injetado só pelo teste; a
// callable pública nunca o repassa.
test("public order quote: cupom server-side, origem loja vs LP, expiresAt limitado pelo cupom e dedupe respeitando expiresAt real", async () => {
  const app = initializeApp({ projectId: "demo-vide-hub" }, "astra-order-quote-coupon");
  const db = getFirestore(app);
  const prefix = `astra-cupom-${Date.now()}`;
  const owner = `${prefix}-owner`;
  const storeSlug = `${prefix}-loja`;
  const pageId = `${prefix}__lp`;
  const produtoCupom = `${prefix}-prod-cupom`;
  const produtoValidade = `${prefix}-prod-validade`;
  const produtoMalformado = `${prefix}-prod-malformado`;
  const DEZ_MIN = 10 * 60 * 1000;

  try {
    await db.doc(`usuarios/${owner}`).set({ status: "aprovado" });
    await db.doc(`vitrines_publicas/${storeSlug}`).set({ donoUID: owner });
    await db.doc(`landing_pages_publicas/${pageId}`).set({ donoUID: owner, publicado: true });
    await db.doc(`produtos/${produtoCupom}`).set({
      criadoPor: owner, nome: "Com cupom", preco: 19.9, statusProduto: "ativo",
      cupomAtivo: true, cupomDesconto: 15, cupomValidade: "", cupomCodigo: "BEMVINDO"
    });
    await db.doc(`produtos/${produtoValidade}`).set({
      criadoPor: owner, nome: "Cupom até 30/09", preco: 19.9, statusProduto: "ativo",
      cupomAtivo: true, cupomDesconto: 15, cupomValidade: "2026-09-30"
    });
    await db.doc(`produtos/${produtoMalformado}`).set({
      criadoPor: owner, nome: "Cupom quebrado", preco: 10, statusProduto: "ativo",
      cupomAtivo: true, cupomDesconto: "abc", cupomValidade: ""
    });

    // ===== Loja: preço promocional em centavos, calculado no servidor =====
    const agora = Date.parse("2026-09-28T15:00:00Z");
    const quoteLoja = await api.createOrderQuoteIdempotent({
      storeSlug, itens: [{ produtoId: produtoCupom, quantidade: 2, preco: 0.01, cupomDesconto: 90 }]
    }, db, agora);
    assert.equal(quoteLoja.sourceType, "store");
    assert.equal(quoteLoja.itens[0].precoBaseCentavos, 1990);
    assert.equal(quoteLoja.itens[0].descontoCentavos, 298);
    assert.equal(quoteLoja.itens[0].precoUnitarioCentavos, 1692);
    assert.equal(quoteLoja.totalCentavos, 3384);
    assert.equal(quoteLoja.expiresAt.toMillis(), agora + DEZ_MIN, "cupom sem validade: expiresAt continua agora + 10min");
    const persistida = (await db.doc(`pedidos_publicos_quotes/${quoteLoja.quoteId}`).get()).data();
    assert.equal(persistida.totalCentavos, 3384);
    assert.equal(persistida.naoReservaEstoque, true);

    // ===== LP: nunca aplica cupom, e o payload não consegue se passar por loja =====
    const quoteLp = await api.createOrderQuoteIdempotent({
      publicPageId: pageId, sourceType: "store", cupomAtivo: true,
      itens: [{ produtoId: produtoCupom, quantidade: 2 }, { produtoId: produtoMalformado, quantidade: 1 }]
    }, db, agora);
    assert.equal(quoteLp.sourceType, "landing-page");
    assert.equal(quoteLp.itens[0].precoUnitarioCentavos, 1990);
    assert.equal(quoteLp.totalCentavos, 1990 * 2 + 1000, "LP ignora cupom (inclusive o malformado)");

    // ===== Cupom ativo malformado na loja: fail-closed genérico =====
    await assert.rejects(
      api.createOrderQuoteIdempotent({ storeSlug, itens: [{ produtoId: produtoMalformado, quantidade: 1 }] }, db, agora),
      (e) => e.code === "failed-precondition" && e.message === "Produto indisponível no momento."
    );

    // ===== D4: cupom vence dentro da janela → expiresAt = fim do cupom =====
    // 23:55 de 30/09/2026 em São Paulo; o cupom acaba 00:00 SP (03:00Z).
    const fimCupom = Date.parse("2026-10-01T03:00:00.000Z");
    const criadaEm = Date.parse("2026-10-01T02:55:00Z");
    const tokenD4 = { storeSlug, itens: [{ produtoId: produtoValidade, quantidade: 1 }], dedupeKey: `${prefix}-d4` };
    const quotePromo = await api.createOrderQuoteIdempotent(tokenD4, db, criadaEm);
    assert.equal(quotePromo.totalCentavos, 1692);
    assert.equal(quotePromo.expiresAt.toMillis(), fimCupom, "quote promocional nunca vale além do fim do cupom");

    // Retry ANTES do fim: mesma quote (snapshot), sem recalcular.
    const retryAntes = await api.createOrderQuoteIdempotent(tokenD4, db, fimCupom - 1);
    assert.equal(retryAntes.quoteId, quotePromo.quoteId);
    assert.equal(retryAntes.totalCentavos, 1692);

    // Retry DEPOIS do fim (só 6min após a criação — ainda dentro dos 10min
    // da dedupe): a quote expirada NÃO é devolvida; uma nova é recalculada
    // com preço base e a dedupe passa a apontar pra ela.
    const retryDepois = await api.createOrderQuoteIdempotent(tokenD4, db, criadaEm + 6 * 60 * 1000);
    assert.notEqual(retryDepois.quoteId, quotePromo.quoteId);
    assert.equal(retryDepois.totalCentavos, 1990);
    assert.equal(retryDepois.expiresAt.toMillis(), criadaEm + 6 * 60 * 1000 + DEZ_MIN);
    const dedupeHash = api.computeOrderQuoteDedupeHash({ ownerUid: owner, sourceType: "store", storeSlug }, `${prefix}-d4`);
    assert.equal((await db.doc(`pedido_quote_dedupes/${dedupeHash}`).get()).data().quoteId, retryDepois.quoteId);
    const antiga = (await db.doc(`pedidos_publicos_quotes/${quotePromo.quoteId}`).get()).data();
    assert.equal(antiga.totalCentavos, 1692, "a quote antiga nunca é reescrita");

    // Retries concorrentes depois do fim do cupom: uma única quote nova.
    const tokenConcorrente = { storeSlug, itens: [{ produtoId: produtoValidade, quantidade: 1 }], dedupeKey: `${prefix}-d4-concorrente` };
    const promoConcorrente = await api.createOrderQuoteIdempotent(tokenConcorrente, db, criadaEm);
    const aposFim = criadaEm + 7 * 60 * 1000;
    const concorrentes = await Promise.all([1, 2].map(() => api.createOrderQuoteIdempotent(tokenConcorrente, db, aposFim)));
    assert.equal(concorrentes[0].quoteId, concorrentes[1].quoteId, "duas chamadas concorrentes após expirar produzem uma única quote nova");
    assert.notEqual(concorrentes[0].quoteId, promoConcorrente.quoteId);
    assert.equal(concorrentes[0].totalCentavos, 1990);

    // ===== Fase 13: mudar preço/cupom do produto não reescreve quote válida =====
    const tokenSnapshot = { storeSlug, itens: [{ produtoId: produtoCupom, quantidade: 1 }], dedupeKey: `${prefix}-snapshot` };
    const snapshot = await api.createOrderQuoteIdempotent(tokenSnapshot, db, agora);
    assert.equal(snapshot.totalCentavos, 1692);
    await db.doc(`produtos/${produtoCupom}`).update({ preco: 99, cupomDesconto: 50 });
    const retrySnapshot = await api.createOrderQuoteIdempotent(tokenSnapshot, db, agora + 60 * 1000);
    assert.equal(retrySnapshot.quoteId, snapshot.quoteId);
    assert.equal(retrySnapshot.totalCentavos, 1692, "quote ainda válida é devolvida como snapshot");
    const semToken = await api.createOrderQuoteIdempotent({ storeSlug, itens: [{ produtoId: produtoCupom, quantidade: 1 }] }, db, agora + 60 * 1000);
    assert.equal(semToken.totalCentavos, 4950, "quote nova relê o produto atualizado (9900 com 50%)");
  } finally {
    await deleteApp(app);
  }
});

// VIDE-HUB-CHECKOUT-DEDUPE-SOURCE-ISOLATION-038 — a dedupe é escopada ao
// contexto público CONFIÁVEL (ownerUid + sourceType + storeSlug/publicPageId
// resolvidos no servidor), nunca só ao tenant. Achado da auditoria: Loja e
// LP do mesmo tenant com o mesmo token compartilhavam a quote — e a LP
// recebia o preço com cupom da Loja, violando D3.
test("public order quote: dedupe isolada por origem pública (Loja × LP × LP2 × outro tenant)", async () => {
  const app = initializeApp({ projectId: "demo-vide-hub" }, "astra-order-quote-source");
  const db = getFirestore(app);
  const prefix = `astra-origem-${Date.now()}`;
  const ownerA = `${prefix}-ownerA`;
  const ownerB = `${prefix}-ownerB`;
  const lojaA = `${prefix}-loja-a`;
  const lojaB = `${prefix}-loja-b`;
  const lp1 = `${prefix}__lp1`;
  const lp2 = `${prefix}__lp2`;
  const produtoA = `${prefix}-prod-a`;
  const produtoB = `${prefix}-prod-b`;
  const agora = Date.parse("2026-09-28T15:00:00Z");
  const quote = (data, now = agora) => api.createOrderQuoteIdempotent(data, db, now);
  const itensA = [{ produtoId: produtoA, quantidade: 1 }];

  try {
    await db.doc(`usuarios/${ownerA}`).set({ status: "aprovado" });
    await db.doc(`usuarios/${ownerB}`).set({ status: "aprovado" });
    await db.doc(`vitrines_publicas/${lojaA}`).set({ donoUID: ownerA });
    await db.doc(`vitrines_publicas/${lojaB}`).set({ donoUID: ownerB });
    await db.doc(`landing_pages_publicas/${lp1}`).set({ donoUID: ownerA, publicado: true });
    await db.doc(`landing_pages_publicas/${lp2}`).set({ donoUID: ownerA, publicado: true });
    const comCupom = { nome: "Com cupom", preco: 19.9, statusProduto: "ativo", cupomAtivo: true, cupomDesconto: 15, cupomValidade: "" };
    await db.doc(`produtos/${produtoA}`).set({ criadoPor: ownerA, ...comCupom });
    await db.doc(`produtos/${produtoB}`).set({ criadoPor: ownerB, ...comCupom });

    // ===== Reprodução do achado: Loja com cupom → LP, mesmo tenant e token =====
    const lojaPrimeiro = await quote({ storeSlug: lojaA, itens: itensA, dedupeKey: "t-store-lp" });
    const lpDepois = await quote({ publicPageId: lp1, itens: itensA, dedupeKey: "t-store-lp" });
    assert.equal(lojaPrimeiro.sourceType, "store");
    assert.equal(lojaPrimeiro.totalCentavos, 1692);
    assert.notEqual(lpDepois.quoteId, lojaPrimeiro.quoteId, "LP nunca reutiliza a quote da Loja");
    assert.equal(lpDepois.sourceType, "landing-page");
    assert.equal(lpDepois.publicPageId, lp1);
    assert.equal(lpDepois.totalCentavos, 1990, "LP recebe preço BASE, nunca o cupom da Loja");

    // ===== LP (base) → Loja: a Loja recebe o preço COM cupom =====
    const lpPrimeiro = await quote({ publicPageId: lp1, itens: itensA, dedupeKey: "t-lp-store" });
    const lojaDepois = await quote({ storeSlug: lojaA, itens: itensA, dedupeKey: "t-lp-store" });
    assert.notEqual(lojaDepois.quoteId, lpPrimeiro.quoteId);
    assert.equal(lpPrimeiro.totalCentavos, 1990);
    assert.equal(lojaDepois.sourceType, "store");
    assert.equal(lojaDepois.totalCentavos, 1692);

    // ===== Mesmo contexto continua idempotente =====
    const lojaDeNovo = await quote({ storeSlug: lojaA, itens: itensA, dedupeKey: "t-store-lp" }, agora + 1000);
    assert.equal(lojaDeNovo.quoteId, lojaPrimeiro.quoteId, "Loja → Loja com o mesmo token reutiliza");
    const lpDeNovo = await quote({ publicPageId: lp1, itens: itensA, dedupeKey: "t-store-lp" }, agora + 1000);
    assert.equal(lpDeNovo.quoteId, lpDepois.quoteId, "LP → mesma LP com o mesmo token reutiliza");

    // ===== LP1 → LP2 do mesmo tenant: quotes distintas =====
    const naLp2 = await quote({ publicPageId: lp2, itens: itensA, dedupeKey: "t-store-lp" });
    assert.notEqual(naLp2.quoteId, lpDepois.quoteId);
    assert.equal(naLp2.publicPageId, lp2);

    // ===== Tenant A Loja → Tenant B Loja: quotes distintas =====
    const lojaTenantB = await quote({ storeSlug: lojaB, itens: [{ produtoId: produtoB, quantidade: 1 }], dedupeKey: "t-store-lp" });
    assert.notEqual(lojaTenantB.quoteId, lojaPrimeiro.quoteId);
    assert.equal(lojaTenantB.tenantId, ownerB);

    // ===== Payload hostil não controla a origem =====
    const lpFingindoLoja = await quote({ publicPageId: lp1, sourceType: "store", itens: itensA, dedupeKey: "t-hostil-1" });
    assert.equal(lpFingindoLoja.sourceType, "landing-page");
    assert.equal(lpFingindoLoja.totalCentavos, 1990);
    const lojaFingindoLp = await quote({ storeSlug: lojaA, sourceType: "landing-page", itens: itensA, dedupeKey: "t-hostil-2" });
    assert.equal(lojaFingindoLp.sourceType, "store");
    assert.equal(lojaFingindoLp.totalCentavos, 1692);
    // Mesmo token, requests "fingindo" a outra origem: continuam separadas pela origem REAL.
    const hostilLoja = await quote({ storeSlug: lojaA, sourceType: "landing-page", publicPageId: "ignorado", itens: itensA, dedupeKey: "t-hostil-3" });
    const hostilLp = await quote({ publicPageId: lp1, sourceType: "store", itens: itensA, dedupeKey: "t-hostil-3" });
    assert.notEqual(hostilLp.quoteId, hostilLoja.quoteId);
    assert.equal(hostilLp.totalCentavos, 1990);

    // ===== Concorrência: Loja e LP com o mesmo token em paralelo não colidem,
    // e cada contexto continua idempotente =====
    const concorrentes = await Promise.all([
      quote({ storeSlug: lojaA, itens: itensA, dedupeKey: "t-concorrente" }),
      quote({ publicPageId: lp1, itens: itensA, dedupeKey: "t-concorrente" }),
      quote({ storeSlug: lojaA, itens: itensA, dedupeKey: "t-concorrente" }),
      quote({ publicPageId: lp1, itens: itensA, dedupeKey: "t-concorrente" })
    ]);
    assert.equal(concorrentes[0].quoteId, concorrentes[2].quoteId, "Loja concorrente: uma única quote");
    assert.equal(concorrentes[1].quoteId, concorrentes[3].quoteId, "LP concorrente: uma única quote");
    assert.notEqual(concorrentes[0].quoteId, concorrentes[1].quoteId, "Loja e LP nunca colidem");
    assert.equal(concorrentes[0].totalCentavos, 1692);
    assert.equal(concorrentes[1].totalCentavos, 1990);

    // ===== Dedupe doc registra o contexto técnico (auditoria, sem autoridade) =====
    const hashLoja = api.computeOrderQuoteDedupeHash({ ownerUid: ownerA, sourceType: "store", storeSlug: lojaA }, "t-store-lp");
    const dedupeLoja = (await db.doc(`pedido_quote_dedupes/${hashLoja}`).get()).data();
    assert.equal(dedupeLoja.quoteId, lojaPrimeiro.quoteId);
    assert.equal(dedupeLoja.sourceType, "store");
    assert.equal(dedupeLoja.sourceId, lojaA);

    // ===== Defesa no replay: ponteiro de dedupe adulterado/inconsistente
    // apontando pra quote de OUTRO contexto nunca é devolvido =====
    const hashPonteiro = api.computeOrderQuoteDedupeHash({ ownerUid: ownerA, sourceType: "store", storeSlug: lojaA }, "t-ponteiro");
    await db.doc(`pedido_quote_dedupes/${hashPonteiro}`).set({
      quoteId: lpDepois.quoteId, tenantId: ownerA, criadoEmMillis: agora,
      expiresAt: Timestamp.fromMillis(agora + 20 * 60 * 1000)
    });
    const lojaComPonteiroRuim = await quote({ storeSlug: lojaA, itens: itensA, dedupeKey: "t-ponteiro" }, agora + 1000);
    assert.notEqual(lojaComPonteiroRuim.quoteId, lpDepois.quoteId, "quote da LP nunca é devolvida pra Loja");
    assert.equal(lojaComPonteiroRuim.sourceType, "store");
    assert.equal(lojaComPonteiroRuim.totalCentavos, 1692);
    assert.equal((await db.doc(`pedido_quote_dedupes/${hashPonteiro}`).get()).data().quoteId, lojaComPonteiroRuim.quoteId);

    // ===== Expiry continua valendo dentro do contexto =====
    const depoisDaJanela = await quote({ storeSlug: lojaA, itens: itensA, dedupeKey: "t-store-lp" }, agora + 10 * 60 * 1000);
    assert.notEqual(depoisDaJanela.quoteId, lojaPrimeiro.quoteId, "quote expirada (expiresAt atingido) não volta");
  } finally {
    await deleteApp(app);
  }
});
