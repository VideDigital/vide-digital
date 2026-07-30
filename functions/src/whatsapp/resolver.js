"use strict";

// WhatsApp Oficial — Resolver de conexão (Fase 2, multiconexão): único
// ponto do código que decide QUAL documento whatsapp_connections e QUAL
// secret usar pra uma operação (enviar, sincronizar templates, validar).
// webhook.js, send.js e templates.js NUNCA leem whatsapp_connections
// direto pelo ownerUid de novo — todos passam por aqui, pra nunca
// divergir a regra de fallback entre arquivos.
//
// Ordem de resolução (nunca escolhe aleatoriamente, nunca mistura
// tokens entre tenants — ver docs/WHATSAPP_MODULO_MULTICONEXAO.md):
//   1) connectionId explícito (vindo do chat ou da rota) e que realmente
//      pertence a este ownerUid -> whatsapp_connections/{connectionId}
//      (modelo novo, connectionVersion 2).
//   2) sem connectionId (ou connectionId não encontrado) -> a conexão
//      DEFAULT do modelo novo (isDefault:true, mesmo ownerUid).
//   3) nada no modelo novo -> documento legado whatsapp_connections/
//      {ownerUid} (connectionVersion 1, nunca reescrito por esta fase).
//   4) nada em lugar nenhum -> null (NOT_CONNECTED).
//
// O token sempre vem do campo tokenSecretResource do documento
// resolvido — nunca recalculado a partir de ownerUid/connectionId nesta
// função, exatamente pra uma conexão migrada do piloto legado continuar
// funcionando com o MESMO secret físico sem nunca copiar o valor do
// token (ver secrets.js: accessTokenByResource).
const { COLLECTIONS, CONNECTION_VERSION_MULTI } = require("./constants");
const secrets = require("./secrets");

async function buscarConexaoPorId(db, connectionId) {
  if (!connectionId) return null;
  const snap = await db.doc(`${COLLECTIONS.CONNECTIONS}/${connectionId}`).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

async function buscarConexaoDefault(db, ownerUid) {
  const snap = await db.collection(COLLECTIONS.CONNECTIONS)
    .where("ownerUid", "==", ownerUid)
    .where("connectionVersion", "==", CONNECTION_VERSION_MULTI)
    .where("isDefault", "==", true)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function buscarConexaoLegado(db, ownerUid) {
  const snap = await db.doc(`${COLLECTIONS.CONNECTIONS}/${ownerUid}`).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

// Devolve { connection, connectionId, legacy } — connection é null quando
// não há NENHUMA conexão (nem nova nem legada) pra este ownerUid.
// connectionId é "" pra conexão legada (documento não tem um id de
// conexão de verdade, é o próprio ownerUid).
async function resolverConexao(db, { ownerUid, connectionId } = {}) {
  if (!ownerUid) return { connection: null, connectionId: "", legacy: false };

  if (connectionId) {
    const candidata = await buscarConexaoPorId(db, connectionId);
    // Só aceita se pertencer de verdade a este tenant — um connectionId
    // que não bate (ou de outro owner) nunca é usado silenciosamente;
    // cai pro mesmo caminho de "sem connectionId" abaixo.
    if (candidata && candidata.ownerUid === ownerUid) {
      return { connection: candidata, connectionId: candidata.id, legacy: false };
    }
  }

  const defaultNovo = await buscarConexaoDefault(db, ownerUid);
  if (defaultNovo) {
    return { connection: defaultNovo, connectionId: defaultNovo.id, legacy: false };
  }

  const legado = await buscarConexaoLegado(db, ownerUid);
  if (legado) {
    return { connection: legado, connectionId: "", legacy: true };
  }

  return { connection: null, connectionId: "", legacy: false };
}

// Token de acesso da conexão já resolvida — sempre por tokenSecretResource
// (nunca recalcula o nome do secret). Lança WHATSAPP_NOT_CONNECTED se a
// conexão resolvida não tiver um secret associado (dado incompleto).
async function resolverToken(resolvido) {
  const recurso = resolvido?.connection?.tokenSecretResource || "";
  if (!recurso) {
    const erro = new Error("Conexão WhatsApp não encontrada.");
    erro.code = "WHATSAPP_NOT_CONNECTED";
    throw erro;
  }
  return secrets.accessTokenByResource(recurso);
}

function limparCacheTokenResolvido(resolvido) {
  const recurso = resolvido?.connection?.tokenSecretResource || "";
  if (recurso) secrets.limparCacheTokenPorResource(recurso);
}

module.exports = {
  resolverConexao,
  resolverToken,
  limparCacheTokenResolvido
};
