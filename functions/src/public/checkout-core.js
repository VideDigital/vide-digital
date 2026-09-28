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

// estoque no documento de produto pode ser "" (não rastreado), ausente
// (null/undefined — mesmo contrato de não rastreado), ou um valor numérico
// (rastreado). Mesma convenção já usada pelo dashboard (ver filtro de
// estoque baixo em catalogo-produtos-core.js) — nunca falha por "não
// configurado". Qualquer OUTRO valor ("abc", NaN, Infinity, -Infinity — dado
// corrompido, nunca enviável pelo visitante, só possível por escrita direta
// ao Firestore fora do formulário do dashboard) NÃO é "não rastreado": é
// tratado como corrompido em resolveOrderItemServerSide, fail-closed, nunca
// silenciosamente deixado passar sem limite algum.
function estoqueNaoRastreado(produto) {
  const estoque = produto?.estoque;
  return estoque === "" || estoque === undefined || estoque === null;
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

// SECURITY-CHECKOUT-COUPON-PARITY-036
//
// Cupom automático por produto (configurado no dashboard: cupomAtivo,
// cupomDesconto em %, cupomValidade opcional; cupomCodigo é só o nome
// exibido e NUNCA participa do cálculo). Contrato decidido pelo
// proprietário, não copiado cegamente da regra atual do navegador em
// loja.html (que usa o fuso do visitante e float sem arredondamento):
//
// - Ativação: SOMENTE cupomAtivo === true. "true", 1, etc. não ativam.
//   Cupom não ativo → preço base, mesmo com campos antigos malformados.
// - Com cupom ativo, cupomDesconto precisa ser number inteiro 1..90 (mesma
//   faixa do formulário do dashboard; string numérica não é aceita) e
//   cupomValidade precisa ser "" (sem validade) ou "YYYY-MM-DD" de uma data
//   real do calendário. Qualquer outra coisa: failed-precondition genérico —
//   nunca um preço imprevisível.
// - Validade: o cupom vale durante TODO o dia informado, inclusive, no fuso
//   IANA America/Sao_Paulo (nunca um offset fixo -03:00 hardcoded). Deixa de
//   valer no primeiro instante do dia seguinte nesse fuso.
// - Arredondamento: preço base → centavos; aplica o percentual; arredonda o
//   preço UNITÁRIO promocional para o centavo (meio para cima) com
//   aritmética inteira; só então multiplica pela quantidade. O preço
//   unitário em centavos é a autoridade.
// - Quote originada de landing page NÃO aplica cupom (a LP exibe o preço
//   base e o recurso é "desconto automático na loja"). A origem vem do
//   tenant resolvido pelo servidor (resolvePublicTenant), nunca do payload.
const CUPOM_TIMEZONE = "America/Sao_Paulo";
const CUPOM_DESCONTO_MIN = 1;
const CUPOM_DESCONTO_MAX = 90;
const DATA_CUPOM_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const HORA_MS = 60 * 60 * 1000;
const formatadorDataCupom = new Intl.DateTimeFormat("en-US", {
  timeZone: CUPOM_TIMEZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric"
});

function produtoIndisponivel() {
  return new HttpsError("failed-precondition", "Produto indisponível no momento.");
}

function chaveData(ano, mes, dia) {
  return ano * 10000 + mes * 100 + dia;
}

// "YYYY-MM-DD" estrito e existente no calendário (rejeita 2026-02-30,
// 2026-9-30, datetime ISO, Timestamp, number...). Retorna a chave numérica
// AAAAMMDD ou null.
function parseDataCupom(valor) {
  if (typeof valor !== "string") return null;
  const match = DATA_CUPOM_REGEX.exec(valor);
  if (!match) return null;
  const ano = Number(match[1]);
  const mes = Number(match[2]);
  const dia = Number(match[3]);
  const data = new Date(0);
  data.setUTCFullYear(ano, mes - 1, dia);
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) {
    return null;
  }
  return chaveData(ano, mes, dia);
}

// Data civil (chave AAAAMMDD) de um instante no fuso do cupom.
function dataLocalCupom(instanteMillis) {
  const partes = {};
  for (const { type, value } of formatadorDataCupom.formatToParts(instanteMillis)) {
    partes[type] = Number(value);
  }
  return chaveData(partes.year, partes.month, partes.day);
}

// Primeiro instante (ms) em que a data civil no fuso do cupom passa a ser
// posterior a `chaveValidade` — ou seja, o fim exclusivo do último dia de
// validade. Busca binária pelo próprio banco de fusos (Intl/IANA), sem
// assumir offset nem ausência de horário de verão. Qualquer fuso real fica
// entre -12h e +14h, então o intervalo inicial sempre contém a virada.
function fimValidadeCupomMillis(chaveValidade) {
  const ano = Math.floor(chaveValidade / 10000);
  const mes = Math.floor(chaveValidade / 100) % 100;
  const dia = chaveValidade % 100;
  const meiaNoiteUtcDiaSeguinte = new Date(0);
  meiaNoiteUtcDiaSeguinte.setUTCFullYear(ano, mes - 1, dia + 1);
  let antes = meiaNoiteUtcDiaSeguinte.getTime() - 15 * HORA_MS;
  let depois = meiaNoiteUtcDiaSeguinte.getTime() + 13 * HORA_MS;
  while (depois - antes > 1) {
    const meio = Math.floor((antes + depois) / 2);
    if (dataLocalCupom(meio) > chaveValidade) depois = meio;
    else antes = meio;
  }
  return depois;
}

// Preço efetivo de UMA unidade, só a partir do documento real do produto e
// de um instante controlado pelo servidor. Nada aqui vem do visitante.
// `aplicarCupom` é derivado da origem resolvida no servidor (loja vs LP).
// Retorna centavos inteiros e, se o preço promocional tiver prazo,
// `precoValidoAteMillis` (fim exclusivo da validade do cupom).
function calcularPrecoEfetivoCentavos(produto, agora, { aplicarCupom = true } = {}) {
  if (!Number.isFinite(agora)) {
    throw new TypeError("agora precisa ser um instante em milissegundos.");
  }
  const precoBase = Number(produto?.preco);
  if (!Number.isFinite(precoBase) || precoBase < 0) throw produtoIndisponivel();
  const precoBaseCentavos = precoParaCentavos(precoBase);

  const precoBaseSemCupom = {
    precoBaseCentavos,
    descontoCentavos: 0,
    precoUnitarioCentavos: precoBaseCentavos,
    precoValidoAteMillis: null
  };
  if (!aplicarCupom || produto.cupomAtivo !== true) return precoBaseSemCupom;

  const desconto = produto.cupomDesconto;
  if (typeof desconto !== "number" || !Number.isInteger(desconto) ||
      desconto < CUPOM_DESCONTO_MIN || desconto > CUPOM_DESCONTO_MAX) {
    throw produtoIndisponivel();
  }

  let precoValidoAteMillis = null;
  if (produto.cupomValidade !== "") {
    const chaveValidade = parseDataCupom(produto.cupomValidade);
    if (chaveValidade === null) throw produtoIndisponivel();
    if (dataLocalCupom(agora) > chaveValidade) return precoBaseSemCupom;
    precoValidoAteMillis = fimValidadeCupomMillis(chaveValidade);
  }

  // round-half-up inteiro: floor((base × (100 − %) + 50) / 100).
  const precoUnitarioCentavos = Math.floor((precoBaseCentavos * (100 - desconto) + 50) / 100);
  return {
    precoBaseCentavos,
    descontoCentavos: precoBaseCentavos - precoUnitarioCentavos,
    precoUnitarioCentavos,
    precoValidoAteMillis
  };
}

// Resolve UM produtoId (já agregado — ver agregarItensPorProduto) a partir
// só do ID + quantidade total solicitada — carrega o produto real, confirma
// que pertence ao MESMO tenant já resolvido pelo servidor (nunca o que o
// payload afirma), confirma que está no único estado publicamente
// disponível (ativo — fail closed pra qualquer outro valor), confirma
// estoque quando rastreado contra a quantidade JÁ AGREGADA, e recalcula
// preço/subtotal (decimal e em centavos) a partir do documento real — com o
// cupom automático do próprio produto quando a origem é a loja (ver
// calcularPrecoEfetivoCentavos). Mensagem genérica de "não encontrado" tanto pra produto inexistente
// quanto pra produto de outro tenant — nunca confirma pro chamador que um
// ID pertence a outra loja.
async function resolveOrderItemServerSide(produtoId, quantidade, tenant, read, agora = Date.now()) {
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

  if (!estoqueNaoRastreado(produto)) {
    const estoqueNumerico = Number(produto.estoque);
    if (!Number.isFinite(estoqueNumerico)) {
      throw new HttpsError("failed-precondition", `Produto ${produtoId} não está disponível.`);
    }
    if (quantidade > estoqueNumerico) {
      throw new HttpsError(
        "failed-precondition",
        `Estoque insuficiente para ${publicText(produto.nome || produtoId, 160)}.`
      );
    }
  }

  const { precoBaseCentavos, descontoCentavos, precoUnitarioCentavos, precoValidoAteMillis } =
    calcularPrecoEfetivoCentavos(produto, agora, { aplicarCupom: tenant.sourceType === "store" });
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
    // inteiros, sem ponto flutuante. precoUnitarioCentavos já é o preço
    // efetivo (com cupom, quando aplicável); descontoCentavos é por unidade.
    precoBaseCentavos,
    descontoCentavos,
    precoUnitarioCentavos,
    subtotalCentavos,
    precoValidoAteMillis
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
// agora: instante server-side (ms) usado pra validade do cupom — injetável
// pra teste determinístico; nunca vem do payload.
async function resolvePublicOrderServerSide({ tenant, itensSolicitados, read, agora = Date.now() }) {
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
  // Menor prazo entre os preços promocionais do pedido (null = nenhum preço
  // do pedido tem prazo). A quote nunca pode valer além disso.
  let precoValidoAteMillis = null;
  for (const { produtoId, quantidade } of itensAgregados) {
    const { precoValidoAteMillis: validoAte, ...item } =
      await resolveOrderItemServerSide(produtoId, quantidade, tenant, read, agora);
    if (validoAte !== null && (precoValidoAteMillis === null || validoAte < precoValidoAteMillis)) {
      precoValidoAteMillis = validoAte;
    }
    itens.push(item);
  }

  const subtotalCentavos = itens.reduce((total, item) => total + item.subtotalCentavos, 0);

  return {
    itens,
    subtotal: subtotalCentavos / 100,
    total: subtotalCentavos / 100,
    subtotalCentavos,
    totalCentavos: subtotalCentavos,
    precoValidoAteMillis
  };
}

module.exports = {
  MAX_ITEMS_PER_ORDER,
  MAX_QUANTITY_PER_ITEM,
  parseStrictQuantity,
  precoParaCentavos,
  CUPOM_TIMEZONE,
  CUPOM_DESCONTO_MIN,
  CUPOM_DESCONTO_MAX,
  calcularPrecoEfetivoCentavos,
  agregarItensPorProduto,
  resolveOrderItemServerSide,
  resolvePublicOrderServerSide
};
