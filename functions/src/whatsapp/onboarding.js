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

// ---------- Fase 7 (multiconexão) — só contratos, nada implementado ----------
// Tudo abaixo é documentação executável (constantes/formas de dados) pra
// uma missão FUTURA implementar o Embedded Signup real. Nenhuma função
// aqui faz uma chamada de rede, grava Firestore ou é exportada como Cloud
// Function — ver módulo/index.js (nunca importa este arquivo).

// Estados possíveis de um onboarding em andamento — nunca persistido
// nesta fase (não existe coleção pra isso ainda), só o vocabulário que a
// missão futura vai usar pra rastrear o progresso do fluxo assistido pelo
// usuário no navegador (FB.login() -> troca de code -> descoberta de
// WABA/número -> assinatura -> validação).
const ONBOARDING_STATE = Object.freeze([
  "nao_iniciado",
  "aguardando_facebook_login",
  "trocando_code_por_token",
  "descobrindo_waba",
  "descobrindo_phone_number_id",
  "assinando_waba",
  "validando_conexao",
  "concluido",
  "falhou"
]);
const ONBOARDING_STATE_SET = new Set(ONBOARDING_STATE);

// Contrato de um adapter de provedor — hoje só meta_cloud_api (official_cloud
// e official_coexistence, ver constants.js CONNECTION_PROVIDER_MODE), mas
// desenhado pra nunca acoplar o resto do código a uma implementação
// concreta. Cada método aqui é só a ASSINATURA esperada (nome + parâmetros
// + retorno documentado) — nenhum tem corpo real; um adapter de verdade
// seria implementado numa missão futura e teria que seguir este contrato.
const CONTRATO_PROVIDER_ADAPTER = Object.freeze({
  trocarCodigoPorToken: "async ({ code, redirectUri }) => { tokenSecretResource }",
  descobrirWabaCompartilhada: "async ({ accessToken }) => { wabaId, businessId }",
  descobrirPhoneNumberId: "async ({ accessToken, wabaId }) => { phoneNumberId, displayPhoneNumber, verifiedName }",
  assinarWaba: "async ({ accessToken, wabaId }) => { subscribed: boolean }",
  registrarNumero: "async ({ accessToken, phoneNumberId, pin }) => { registered: boolean }"
});

// Contrato dos onCall futuros (nomes/formato de payload e resposta) —
// documentado aqui pra a missão futura ter um ponto único de referência,
// nunca implementado nem registrado em index.js nesta fase.
const CONTRATO_ONBOARDING_FUNCTIONS = Object.freeze({
  whatsappStartOnboarding: {
    payload: "{ providerMode: 'official_cloud' | 'official_coexistence' }",
    resposta: "{ onboardingId, state: ONBOARDING_STATE[0] }",
    observacao: "Nunca cria whatsapp_connections aqui — só inicia o rastreio do fluxo."
  },
  whatsappCompleteOnboarding: {
    payload: "{ onboardingId, code }",
    resposta: "{ state: 'concluido' | 'falhou', connectionId? }",
    observacao: "Só aqui (numa missão futura) um whatsapp_connections/{connectionId} novo seria criado — sempre respeitando MAX_CONNECTIONS_PER_OWNER."
  }
});

function estadoOnboardingValido(estado) {
  return ONBOARDING_STATE_SET.has(estado);
}

module.exports = {
  EMBEDDED_SIGNUP_LIBERADO_EM_PRODUCAO,
  formatoEsperadoCallbackEmbeddedSignup,
  ONBOARDING_STATE,
  ONBOARDING_STATE_SET,
  CONTRATO_PROVIDER_ADAPTER,
  CONTRATO_ONBOARDING_FUNCTIONS,
  estadoOnboardingValido
};
