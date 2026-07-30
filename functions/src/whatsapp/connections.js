"use strict";

// WhatsApp Oficial — Fase 4 (multiconexão): Functions do módulo separado
// de WhatsApp no dashboard — "Minhas conexões" (listar) e "Equipe e
// roteamento" (trocar a conexão padrão). Nunca a Central de Atendimento:
// aqui é só administração da(s) conexão(ões), nunca envio/recebimento de
// mensagem. Mesmo padrão de permissão de send.js (podeVerConexao/
// podeGerenciarConexao — permissão própria "whatsapp", não mais herdada
// de "atendimento"/"configuracoes").
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { resolveCallerContext } = require("../shared/context");
const { assertRateLimit } = require("../shared/rateLimit");
const { normalizeString } = require("../shared/validators");
const { writeAudit } = require("../audit");
const { REGION, COLLECTIONS, CONNECTION_VERSION_MULTI, MAX_CONNECTIONS_PER_OWNER, RATE_LIMITS } = require("./constants");
const { identificadorRateLimit } = require("./validators");
const { podeVerConexao, podeGerenciarConexao } = require("./send");

// Nunca inclui tokenSecretResource nem qualquer campo de segredo — mesmo
// contrato "seguro" de whatsappConnectionStatus (send.js), só que aqui
// pra uma LISTA de conexões em vez de uma só.
function paraResumoSeguro(id, dados, { legacy = false } = {}) {
  return {
    connectionId: legacy ? "" : id,
    legacy,
    label: dados.label || (legacy ? "Piloto (conexão legada)" : "Conexão"),
    status: dados.status || "disconnected",
    providerMode: dados.providerMode || "official_cloud",
    isDefault: legacy ? true : Boolean(dados.isDefault),
    displayPhoneNumber: dados.displayPhoneNumber || "",
    verifiedName: dados.verifiedName || "",
    qualityRating: dados.qualityRating || "",
    lastValidatedAt: dados.lastValidatedAt || null,
    lastErrorCode: dados.lastErrorCode || ""
  };
}

// Lógica PURA de ordenação/composição da lista — separada do I/O pra ser
// testável sem Firestore (ver tests/functions/whatsapp-connections.test.mjs).
// A conexão default do modelo novo vem primeiro; a legada (quando existe e
// nenhuma conexão nova ainda é default) vai por último, como o "fallback"
// que ela realmente é no resolver.
function montarListaConexoes(conexoesNovas, conexaoLegada) {
  const novas = [...conexoesNovas].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return String(a.connectionId).localeCompare(String(b.connectionId));
  });
  const lista = [...novas];
  if (conexaoLegada) lista.push(conexaoLegada);
  return lista;
}

const whatsappListConnections = onCall({ region: REGION }, async (request) => {
  const context = await resolveCallerContext(request);
  if (!podeVerConexao(context)) throw new HttpsError("permission-denied", "Permissão insuficiente.");

  const db = getFirestore();
  const [novasSnap, legadoSnap] = await Promise.all([
    db.collection(COLLECTIONS.CONNECTIONS)
      .where("ownerUid", "==", context.ownerUid)
      .where("connectionVersion", "==", CONNECTION_VERSION_MULTI)
      .get(),
    db.doc(`${COLLECTIONS.CONNECTIONS}/${context.ownerUid}`).get()
  ]);

  const conexoesNovas = novasSnap.docs.map((doc) => paraResumoSeguro(doc.id, doc.data() || {}));
  const conexaoLegada = legadoSnap.exists ? paraResumoSeguro(legadoSnap.id, legadoSnap.data() || {}, { legacy: true }) : null;

  const lista = montarListaConexoes(conexoesNovas, conexaoLegada);
  return {
    ok: true,
    conexoes: lista,
    total: conexoesNovas.length,
    maxConexoes: MAX_CONNECTIONS_PER_OWNER,
    limiteAtingido: conexoesNovas.length >= MAX_CONNECTIONS_PER_OWNER
  };
});

// Revisão: ler o estado atual e depois escrever num batch separado tem
// uma corrida real — duas chamadas concorrentes (cada uma escolhendo uma
// conexão default DIFERENTE) podem ler o mesmo "quem é default agora"
// antes de qualquer uma escrever, e as duas commitam, deixando DUAS
// conexões com isDefault:true. Uma transação resolve isso: o Firestore
// serializa transações que leem/escrevem os mesmos documentos, então a
// segunda chamada sempre vê o resultado já aplicado pela primeira (ou
// tenta de novo automaticamente). Extraído com "db" injetável (mesmo
// padrão de carregarConexaoResolvida em send.js) pra ser testável com um
// Firestore fake, sem emulador.
async function aplicarConexaoPadrao(db, { ownerUid, connectionId, authUid }) {
  const alvoRef = db.doc(`${COLLECTIONS.CONNECTIONS}/${connectionId}`);

  return db.runTransaction(async (tx) => {
    const alvoSnap = await tx.get(alvoRef);
    const alvo = alvoSnap.exists ? alvoSnap.data() || {} : null;

    // Só aceita uma conexão do MODELO NOVO, deste tenant — nunca a
    // conexão legada (que não tem conceito de isDefault; ela já É o
    // fallback quando nenhuma conexão nova é default, ver resolver.js) e
    // nunca de outro ownerUid, mesmo que o connectionId "pareça" válido.
    if (!alvo || alvo.ownerUid !== ownerUid || alvo.connectionVersion !== CONNECTION_VERSION_MULTI) {
      throw new HttpsError("not-found", "Conexão não encontrada para esta loja.");
    }
    if (alvo.status === "revoked" || alvo.status === "disconnected") {
      throw new HttpsError("failed-precondition", "Não é possível tornar padrão uma conexão desconectada.");
    }

    const outrasDefaultSnap = await tx.get(
      db.collection(COLLECTIONS.CONNECTIONS)
        .where("ownerUid", "==", ownerUid)
        .where("connectionVersion", "==", CONNECTION_VERSION_MULTI)
        .where("isDefault", "==", true)
    );

    for (const doc of outrasDefaultSnap.docs) {
      if (doc.id === connectionId) continue;
      tx.set(doc.ref, { isDefault: false, updatedAt: FieldValue.serverTimestamp(), updatedBy: authUid }, { merge: true });
    }
    tx.set(alvoRef, { isDefault: true, updatedAt: FieldValue.serverTimestamp(), updatedBy: authUid }, { merge: true });

    return { label: alvo.label || connectionId };
  });
}

const whatsappSetDefaultConnection = onCall({ region: REGION }, async (request) => {
  const context = await resolveCallerContext(request);
  if (!podeGerenciarConexao(context)) throw new HttpsError("permission-denied", "Permissão insuficiente para alterar a conexão padrão.");

  await assertRateLimit({
    scope: "whatsappSetDefaultConnection",
    identifier: identificadorRateLimit("owner", context.ownerUid),
    max: RATE_LIMITS.SET_DEFAULT_CONNECTION_PER_MIN
  });

  const connectionId = normalizeString(request.data?.connectionId, 200);
  if (!connectionId) throw new HttpsError("invalid-argument", "Informe a conexão que deve ser a padrão.");

  const db = getFirestore();
  const { label } = await aplicarConexaoPadrao(db, { ownerUid: context.ownerUid, connectionId, authUid: context.authUid });

  // Só muda qual conexão é usada em conversas NOVAS sem connectionId
  // explícito — conversas existentes mantêm chat.whatsappConnectionId
  // (gravado na criação, nunca reescrito), então nada aqui precisa (nem
  // deve) tocar em nenhum chat já existente.
  await writeAudit({
    ownerUid: context.ownerUid,
    authUid: context.authUid,
    module: "whatsapp",
    targetId: connectionId,
    action: "whatsapp.conexao_padrao_alterada",
    risk: "medium",
    summary: `Conexão "${label}" definida como padrão do WhatsApp.`,
    source: "function"
  });

  return { ok: true, connectionId };
});

module.exports = {
  whatsappListConnections,
  whatsappSetDefaultConnection,
  paraResumoSeguro,
  montarListaConexoes,
  aplicarConexaoPadrao
};
