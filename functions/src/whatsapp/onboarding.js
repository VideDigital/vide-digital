"use strict";

// WhatsApp Oficial V1 — Onboarding: SÓ arquitetura, nada disto é exposto
// como Cloud Function nem chamado por functions/src/whatsapp/index.js. O
// onboarding real da Fase A é o piloto assistido via
// scripts/provision-whatsapp-pilot.mjs (um humano roda o script, fora do
// dashboard). Este arquivo documenta em código o formato de dados do
// Embedded Signup da Meta, pra quando uma fase futura ligar um botão real
// no dashboard — sem simular/fingir uma conexão por um clique, como o
// briefing desta missão explicitamente proíbe.
//
// Fluxo real do Embedded Signup (documentado, não implementado aqui):
// 1. Front-end carrega o Facebook JavaScript SDK e chama FB.login() com o
//    config_id do fluxo de Embedded Signup do App da Meta (criado no
//    processo de App Review/Advanced Access — fora do código).
// 2. A Meta devolve um `code` de autorização via postMessage/callback.
// 3. O backend troca esse `code` por um token de sistema de longa duração
//    (endpoint OAuth da Meta, fora do escopo desta Fase A).
// 3. A Meta também envia (via postMessage) o WABA ID e o Phone Number ID
//    escolhidos pelo cliente durante o fluxo assistido de signup.
// 4. O backend assina a WABA no app (subscribeWaba, já implementado em
//    metaClient.js) e grava whatsapp_connections/{ownerUid} + o token no
//    Secret Manager (mesmas funções de secrets.js usadas pelo script de
//    piloto).
// 5. O backend confirma o webhook (a URL é fixa e global — não muda por
//    tenant) e sincroniza os templates iniciais.
//
// Pré-requisitos externos (fora do código, ver docs/WHATSAPP_OFICIAL.md):
// Meta App em modo Business, Business Portfolio verificado, App Review
// aprovado para whatsapp_business_messaging/whatsapp_business_management,
// Advanced Access, Facebook Login for Business configurado com o SDK.

// Formato esperado do callback do Embedded Signup (referência — não
// consumido por nenhuma Function nesta fase).
function formatoEsperadoCallbackEmbeddedSignup() {
  return Object.freeze({
    code: "string — trocado pelo backend por um token de sistema",
    waba_id: "string",
    phone_number_id: "string"
  });
}

// true só documenta a decisão de produto: V1 nunca simula uma conexão —
// o botão "Conectar" na UI (Commit 2) sempre mostra "Piloto assistido" ou
// "Disponível após aprovação da integração", nunca finge sucesso.
const EMBEDDED_SIGNUP_LIBERADO_EM_PRODUCAO = false;

module.exports = {
  EMBEDDED_SIGNUP_LIBERADO_EM_PRODUCAO,
  formatoEsperadoCallbackEmbeddedSignup
};
