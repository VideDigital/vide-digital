"use strict";

// SECURITY-CHECKOUT-SERVER-AUTHORITY-001
//
// Fonte de verdade server-side para itens de pedido público. Complementa
// (não substitui) sanitizeOrderItem()/sanitizeOrderSnapshot() em
// functions/src/public/index.js, que continuam servindo o fluxo legado de
// handoff por WhatsApp (o visitante nunca paga dentro do produto hoje — o
// "pedido" ali é só um resumo textual enviado ao dono via WhatsApp, e o
// preço mostrado já veio da própria página pública, renderizada a partir do
// preço real). Este módulo é a peça que falta para qualquer fluxo FUTURO
// que envolva cobrança de verdade (gateway de pagamento): visitante nunca é
// autoridade de preço, existência, dono ou disponibilidade de um produto.
//
// Contrato: o chamador manda SOMENTE produtoId + quantidade por item. Nome,
// preço e subtotal são sempre recalculados aqui a partir do documento real
// em produtos/{id} — qualquer preço/nome enviado pelo visitante é
// completamente ignorado.
const { HttpsError } = require("firebase-functions/v2/https");
const { publicText, normalizeString } = require("../shared/validators");

const MAX_ITEMS_PER_ORDER = 20;
const MAX_QUANTITY_PER_ITEM = 999;

function clampQuantity(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(MAX_QUANTITY_PER_ITEM, n);
}

// estoque no documento de produto pode ser "" (não rastreado) ou um número.
// Mesma convenção já usada pelo dashboard (ver filtro de estoque baixo em
// catalogo-produtos-core.js) — nunca falha por "não configurado".
function estoqueControlado(produto) {
  const estoque = produto?.estoque;
  return estoque !== "" && estoque !== undefined && estoque !== null && Number.isFinite(Number(estoque));
}

// Resolve UM item a partir só de produtoId+quantidade do visitante — carrega
// o produto real, confirma que pertence ao MESMO tenant já resolvido pelo
// servidor (nunca o que o payload afirma), confirma que está disponível
// (nem rascunho, nem arquivado), confirma estoque quando rastreado, e
// recalcula preço/subtotal a partir do documento real. Mensagem genérica de
// "não encontrado" tanto para produto inexistente quanto para produto de
// outro tenant — nunca confirma pro chamador que um ID pertence a outra
// loja.
async function resolveOrderItemServerSide(rawItem, tenant, read) {
  const produtoId = normalizeString(rawItem?.produtoId ?? rawItem?.id, 180);
  if (!produtoId) {
    throw new HttpsError("invalid-argument", "Produto é obrigatório.");
  }

  const quantidade = clampQuantity(rawItem?.quantidade);
  if (quantidade === null) {
    throw new HttpsError("invalid-argument", `Quantidade inválida para o produto ${produtoId}.`);
  }

  const snap = await read(`produtos/${produtoId}`);
  if (!snap.exists) {
    throw new HttpsError("not-found", `Produto ${produtoId} não encontrado.`);
  }
  const produto = snap.data() || {};

  if (produto.criadoPor !== tenant.ownerUid) {
    throw new HttpsError("not-found", `Produto ${produtoId} não encontrado.`);
  }
  if (produto.statusProduto === "rascunho" || produto.statusProduto === "arquivado") {
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

  return {
    produtoId,
    nome: publicText(produto.nome || produtoId, 160),
    precoUnitario,
    quantidade,
    subtotal: Number((precoUnitario * quantidade).toFixed(2))
  };
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

  const itens = [];
  for (const rawItem of itensSolicitados) {
    itens.push(await resolveOrderItemServerSide(rawItem, tenant, read));
  }

  const subtotal = Number(itens.reduce((total, item) => total + item.subtotal, 0).toFixed(2));

  return { itens, subtotal, total: subtotal };
}

module.exports = {
  MAX_ITEMS_PER_ORDER,
  MAX_QUANTITY_PER_ITEM,
  resolveOrderItemServerSide,
  resolvePublicOrderServerSide
};
