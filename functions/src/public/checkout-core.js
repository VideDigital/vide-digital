"use strict";

// SECURITY-CHECKOUT-SERVER-AUTHORITY-001
//
// Fonte de verdade server-side para itens de pedido público. Complementa
// (não substitui) sanitizeOrderItem()/sanitizeOrderSnapshot() em
// functions/src/public/index.js, que continuam servindo o fluxo legado de
// handoff por WhatsApp (o visitante nunca paga dentro do produto hoje — o
// "pedido" ali é só um resumo textual enviado ao dono via WhatsApp, e o
// preço mostrado já veio da própria página pública, renderizada a partir do
// preço real). Este módulo é a FUNDAÇÃO para um fluxo comercial futuro que
// envolva cobrança de verdade (gateway de pagamento) — não é, por si só, um
// checkout funcional: nada aqui está conectado à UI de loja.html ainda, e
// nenhum gateway é integrado. Visitante nunca é autoridade de preço,
// existência, dono, status ou disponibilidade de um produto.
//
// Contrato: o chamador manda SOMENTE produtoId + quantidade por item. Nome,
// preço e subtotal são sempre recalculados aqui a partir do documento real
// em produtos/{id} — qualquer preço/nome enviado pelo visitante é
// completamente ignorado. Quantidade precisa ser um inteiro estrito dentro
// dos limites — nunca arredondada nem "clampada" silenciosamente: um valor
// hostil é rejeitado, nunca corrigido pro chamador.
//
// Estado público canônico de um produto é SOMENTE statusProduto=="ativo"
// (mesmo contrato agora aplicado em firestore.rules — ver
// SECURITY-PRODUCTS-PRIVATE-STATUS-001). Rascunho, arquivado, ausente ou
// qualquer valor desconhecido são todos tratados como indisponíveis aqui,
// fail-closed — nunca uma lista de exclusão.
const { HttpsError } = require("firebase-functions/v2/https");
const { publicText, normalizeString } = require("../shared/validators");

const MAX_ITEMS_PER_ORDER = 20;
const MAX_QUANTITY_PER_ITEM = 999;

// Quantidade precisa chegar como number JS, inteiro, dentro dos limites.
// Nunca aceita string numérica, nunca arredonda 1.5 pra 2, nunca "clampa"
// 1000 pra 999 — qualquer um desses casos é simplesmente inválido.
function parseStrictQuantity(value) {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < 1 || value > MAX_QUANTITY_PER_ITEM) return null;
  return value;
}

// estoque no documento de produto pode ser "" (não rastreado) ou um número.
// Mesma convenção já usada pelo dashboard (ver filtro de estoque baixo em
// catalogo-produtos-core.js) — nunca falha por "não configurado".
function estoqueControlado(produto) {
  const estoque = produto?.estoque;
  return estoque !== "" && estoque !== undefined && estoque !== null && Number.isFinite(Number(estoque));
}

// Preço real do produto convertido pra centavos — representação inteira,
// autoritativa, sem deriva de ponto flutuante. Se o documento tiver mais de
// 2 casas decimais de precisão (o formulário do dashboard usa parseFloat
// num input decimal comum, então isso não deveria acontecer na prática, mas
// documentos legados/importados poderiam teoricamente ter mais precisão),
// a política explícita aqui é arredondar pro centavo mais próximo — nunca
// rejeitar um produto real por causa disso, e nunca truncar silenciosamente
// sem arredondar.
function precoParaCentavos(precoDecimal) {
  return Math.round(precoDecimal * 100);
}

// Resolve UM produtoId (já agregado — ver agregarItensPorProduto) a partir
// só do ID + quantidade total solicitada — carrega o produto real, confirma
// que pertence ao MESMO tenant já resolvido pelo servidor (nunca o que o
// payload afirma), confirma que está no único estado publicamente
// disponível (ativo — fail closed pra qualquer outro valor), confirma
// estoque quando rastreado contra a quantidade JÁ AGREGADA, e recalcula
// preço/subtotal (decimal e em centavos) a partir do documento real.
// Mensagem genérica de "não encontrado" tanto pra produto inexistente
// quanto pra produto de outro tenant — nunca confirma pro chamador que um
// ID pertence a outra loja.
async function resolveOrderItemServerSide(produtoId, quantidade, tenant, read) {
  const snap = await read(`produtos/${produtoId}`);
  if (!snap.exists) {
    throw new HttpsError("not-found", `Produto ${produtoId} não encontrado.`);
  }
  const produto = snap.data() || {};

  if (produto.criadoPor !== tenant.ownerUid) {
    throw new HttpsError("not-found", `Produto ${produtoId} não encontrado.`);
  }
  // Fail closed: só "ativo" é publicamente disponível — nunca uma lista de
  // exclusão (rascunho/arquivado/...). A loja pública só exibe "ativo"
  // (loja.html) e a Rule de produtos agora aplica exatamente esse mesmo
  // contrato (SECURITY-PRODUCTS-PRIVATE-STATUS-001).
  if (produto.statusProduto !== "ativo") {
    throw new HttpsError("failed-precondition", `Produto ${produtoId} não está disponível.`);
  }

  const precoUnitario = Number(produto.preco);
  if (!Number.isFinite(precoUnitario) || precoUnitario < 0) {
    throw new HttpsError("failed-precondition", `Produto ${produtoId} está com preço inválido.`);
  }

  if (estoqueControlado(produto) && quantidade > Number(produto.estoque)) {
    throw new HttpsError(
      "failed-precondition",
      `Estoque insuficiente para ${publicText(produto.nome || produtoId, 160)}.`
    );
  }

  const precoUnitarioCentavos = precoParaCentavos(precoUnitario);
  const subtotalCentavos = precoUnitarioCentavos * quantidade;

  return {
    produtoId,
    nome: publicText(produto.nome || produtoId, 160),
    quantidade,
    // Campos decimais: apresentação/compatibilidade. Derivados dos centavos
    // (nunca o inverso), pra nunca acumular deriva de ponto flutuante.
    precoUnitario: precoUnitarioCentavos / 100,
    subtotal: subtotalCentavos / 100,
    // Campos autoritativos pra qualquer integração futura de pagamento —
    // inteiros, sem ponto flutuante.
    precoUnitarioCentavos,
    subtotalCentavos
  };
}

// Agrega itens repetidos pelo MESMO produtoId ANTES de qualquer validação
// de estoque — sem isso, duas linhas pedindo 3 unidades cada do mesmo
// produto com estoque=5 validariam cada uma isoladamente contra o estoque
// total (5 >= 3, 5 >= 3) e deixariam passar um pedido de 6 unidades contra
// só 5 em estoque. Quantidade de cada linha já chega validada (inteiro
// estrito, 1..MAX_QUANTITY_PER_ITEM) antes de somar; o TOTAL agregado por
// produto também precisa respeitar o mesmo teto, senão duas linhas válidas
// isoladamente poderiam somar um total fora do limite.
function agregarItensPorProduto(itensSolicitados) {
  const ordem = [];
  const quantidadePorProduto = new Map();

  for (const rawItem of itensSolicitados) {
    const produtoId = normalizeString(rawItem?.produtoId ?? rawItem?.id, 180);
    if (!produtoId) {
      throw new HttpsError("invalid-argument", "Produto é obrigatório.");
    }
    const quantidade = parseStrictQuantity(rawItem?.quantidade);
    if (quantidade === null) {
      throw new HttpsError("invalid-argument", `Quantidade inválida para o produto ${produtoId}.`);
    }

    if (quantidadePorProduto.has(produtoId)) {
      const total = quantidadePorProduto.get(produtoId) + quantidade;
      if (total > MAX_QUANTITY_PER_ITEM) {
        throw new HttpsError("invalid-argument", `Quantidade total excede o permitido para o produto ${produtoId}.`);
      }
      quantidadePorProduto.set(produtoId, total);
    } else {
      quantidadePorProduto.set(produtoId, quantidade);
      ordem.push(produtoId);
    }
  }

  return ordem.map((produtoId) => ({ produtoId, quantidade: quantidadePorProduto.get(produtoId) }));
}

// itensSolicitados: array de { produtoId, quantidade } vindo do visitante,
// sem nenhum outro campo confiável. read: (path) => Promise<DocSnapshot>,
// injetável para permitir tanto tx.get() (dentro de transação) quanto
// leitura direta (fora dela) e teste unitário com mock, sem Emulator.
async function resolvePublicOrderServerSide({ tenant, itensSolicitados, read }) {
  if (!tenant?.ownerUid) {
    throw new HttpsError("failed-precondition", "Tenant não resolvido.");
  }
  if (!Array.isArray(itensSolicitados) || itensSolicitados.length === 0) {
    throw new HttpsError("invalid-argument", "O pedido precisa ter ao menos um item.");
  }
  if (itensSolicitados.length > MAX_ITEMS_PER_ORDER) {
    throw new HttpsError("invalid-argument", "Número de itens do pedido excede o permitido.");
  }

  const itensAgregados = agregarItensPorProduto(itensSolicitados);

  const itens = [];
  for (const { produtoId, quantidade } of itensAgregados) {
    itens.push(await resolveOrderItemServerSide(produtoId, quantidade, tenant, read));
  }

  const subtotalCentavos = itens.reduce((total, item) => total + item.subtotalCentavos, 0);

  return {
    itens,
    subtotal: subtotalCentavos / 100,
    total: subtotalCentavos / 100,
    subtotalCentavos,
    totalCentavos: subtotalCentavos
  };
}

module.exports = {
  MAX_ITEMS_PER_ORDER,
  MAX_QUANTITY_PER_ITEM,
  parseStrictQuantity,
  precoParaCentavos,
  agregarItensPorProduto,
  resolveOrderItemServerSide,
  resolvePublicOrderServerSide
};
