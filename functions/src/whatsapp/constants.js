"use strict";

// WhatsApp Oficial V1 — constantes centralizadas. Nenhum outro arquivo
// deste módulo deve hardcodar a versão da Graph API ou os nomes de
// coleção/erro — tudo referencia este arquivo. Ver docs/WHATSAPP_OFICIAL.md
// para a data/fonte da pesquisa que definiu WHATSAPP_GRAPH_VERSION.
// Atualizada de v21.0 para v25.0 em 2026-07-29, e de v25.0 para v26.0 em
// 2026-07-31 — ambas as vezes com confirmação direta do usuário abrindo a
// fonte oficial Meta (developers.facebook.com bloqueado neste ambiente de
// desenvolvimento). Ver docs/WHATSAPP_OFICIAL.md para o histórico completo.
const WHATSAPP_GRAPH_VERSION = "v26.0";
const GRAPH_BASE_URL = "https://graph.facebook.com";

function graphUrl(path) {
  const cleanPath = String(path || "").replace(/^\/+/, "");
  return `${GRAPH_BASE_URL}/${WHATSAPP_GRAPH_VERSION}/${cleanPath}`;
}

const REGION = "southamerica-east1";

// Janela de atendimento gratuito (mensagem livre) da Meta: 24h a partir
// da última mensagem do cliente. Nunca hardcodar o número "24" fora daqui.
const WINDOW_MS = 24 * 60 * 60 * 1000;

const CONNECTION_STATUS = Object.freeze([
  "disconnected",
  "pending_setup",
  "validating",
  "connected",
  "degraded",
  "suspended",
  "revoked"
]);
const CONNECTION_STATUS_SET = new Set(CONNECTION_STATUS);

// ---------- Multiconexão (Fase 2) ----------
// provider é sempre meta_cloud_api nesta missão — nenhum outro provedor
// (WhatsApp Web não oficial, etc.) é ou será suportado, ver
// docs/WHATSAPP_MODULO_MULTICONEXAO.md.
const CONNECTION_PROVIDER = Object.freeze(["meta_cloud_api"]);
const CONNECTION_PROVIDER_SET = new Set(CONNECTION_PROVIDER);

// official_cloud = número dedicado só à Cloud API (piloto atual).
// official_coexistence = número existente também usado no app WhatsApp
// Business normal, via Coexistência oficial da Meta — arquitetura
// preparada nesta missão, fluxo real fica pra uma missão futura (ver
// onboarding.js).
const CONNECTION_PROVIDER_MODE = Object.freeze(["official_cloud", "official_coexistence"]);
const CONNECTION_PROVIDER_MODE_SET = new Set(CONNECTION_PROVIDER_MODE);

// piloto_assistido = como a conexão legada (V1) foi criada, por um
// script administrativo. embedded_signup = fluxo self-service futuro
// (Fase 7 — só contrato, não implementado).
const CONNECTION_ONBOARDING_MODE = Object.freeze(["piloto_assistido", "embedded_signup"]);
const CONNECTION_ONBOARDING_MODE_SET = new Set(CONNECTION_ONBOARDING_MODE);

// connectionVersion distingue o documento legado (1, chave = ownerUid,
// nunca reescrito por esta missão) do modelo novo multiconexão (2, chave
// = connectionId aleatório) — nunca inferido por heurística de formato de
// ID, sempre este campo explícito. Ver resolver.js.
const CONNECTION_VERSION_LEGACY = 1;
const CONNECTION_VERSION_MULTI = 2;

// Limite duro da V1 — central, nunca hardcodado em outro arquivo. Preparo
// consciente pra um limite por plano no futuro (ver
// docs/WHATSAPP_MODULO_MULTICONEXAO.md), mas nenhuma integração de
// cobrança/plano real existe ainda, então o limite é fixo por enquanto.
const MAX_CONNECTIONS_PER_OWNER = 2;

const MESSAGE_STATUS = Object.freeze(["queued", "accepted", "sent", "delivered", "read", "failed"]);
const MESSAGE_STATUS_SET = new Set(MESSAGE_STATUS);
// Ordem de progresso normal — usada por podeAtualizarStatusMensagem() pra
// nunca deixar um status regredir (ex.: "read" chegando fora de ordem
// depois de um "delivered" não pode voltar pra "delivered").
const MESSAGE_STATUS_RANK = Object.freeze({ queued: 0, accepted: 1, sent: 2, delivered: 3, read: 4 });

const CONSENT_STATUS = Object.freeze(["unknown", "granted", "revoked"]);
const CONSENT_STATUS_SET = new Set(CONSENT_STATUS);

const ERROR_CODES = Object.freeze({
  NOT_CONNECTED: "WHATSAPP_NOT_CONNECTED",
  WINDOW_CLOSED: "WHATSAPP_WINDOW_CLOSED",
  TEMPLATE_REQUIRED: "WHATSAPP_TEMPLATE_REQUIRED",
  TEMPLATE_NOT_APPROVED: "WHATSAPP_TEMPLATE_NOT_APPROVED",
  CONSENT_REQUIRED: "WHATSAPP_CONSENT_REQUIRED",
  TOKEN_REVOKED: "WHATSAPP_TOKEN_REVOKED",
  RATE_LIMITED: "WHATSAPP_RATE_LIMITED",
  PROVIDER_UNAVAILABLE: "WHATSAPP_PROVIDER_UNAVAILABLE",
  INVALID_RECIPIENT: "WHATSAPP_INVALID_RECIPIENT",
  MESSAGE_FAILED: "WHATSAPP_MESSAGE_FAILED",
  // Revisão (multiconexão): um connectionId explícito que não existe, não
  // pertence ao tenant, ou uma solicitação explícita de "legada" que não
  // tem documento legado — nunca cai silenciosamente pro default/legado
  // (ver resolver.js). Distinto de NOT_CONNECTED (nenhuma conexão
  // configurada) porque aqui existe pelo menos UMA conexão — só não é a
  // que foi pedida.
  CONNECTION_MISMATCH: "WHATSAPP_CONNECTION_MISMATCH"
});

// Mensagens amigáveis em português — nunca expor detalhe técnico/PII na UI.
const ERROR_MESSAGES = Object.freeze({
  [ERROR_CODES.NOT_CONNECTED]: "O WhatsApp Oficial ainda não está conectado para esta loja.",
  [ERROR_CODES.WINDOW_CLOSED]: "A janela de atendimento de 24h está fechada. Escolha um template aprovado.",
  [ERROR_CODES.TEMPLATE_REQUIRED]: "Fora da janela de 24h é preciso usar um template aprovado.",
  [ERROR_CODES.TEMPLATE_NOT_APPROVED]: "Este template não está aprovado para envio.",
  [ERROR_CODES.CONSENT_REQUIRED]: "É necessário consentimento do contato antes de enviar este template.",
  [ERROR_CODES.TOKEN_REVOKED]: "A conexão com o WhatsApp foi revogada. Reconecte para continuar.",
  [ERROR_CODES.RATE_LIMITED]: "Muitas requisições em pouco tempo. Tente novamente em instantes.",
  [ERROR_CODES.PROVIDER_UNAVAILABLE]: "O WhatsApp está indisponível no momento. Tente novamente em instantes.",
  [ERROR_CODES.INVALID_RECIPIENT]: "Não foi possível identificar o destinatário desta conversa.",
  [ERROR_CODES.CONNECTION_MISMATCH]: "Esta conexão não foi encontrada para esta loja.",
  [ERROR_CODES.MESSAGE_FAILED]: "Não foi possível enviar esta mensagem."
});

// Escopos/permissões Meta necessários — ver docs/WHATSAPP_OFICIAL.md para
// a fonte da pesquisa (alta confiança, estáveis entre versões da API).
const META_PERMISSIONS = Object.freeze(["whatsapp_business_messaging", "whatsapp_business_management"]);

// Coleções novas deste módulo — usadas por Rules, índices e código, nunca
// digitadas soltas em outros arquivos.
const COLLECTIONS = Object.freeze({
  CONNECTIONS: "whatsapp_connections",
  TEMPLATES: "whatsapp_templates",
  MESSAGE_MAP: "whatsapp_message_map",
  WEBHOOK_EVENTS: "whatsapp_webhook_events",
  PHONE_ROUTES: "whatsapp_phone_routes",
  CONTACT_MAP: "whatsapp_contact_map",
  CONSENTS: "whatsapp_consents"
});

const RATE_LIMITS = Object.freeze({
  SEND_TEXT_PER_MIN: 20,
  SEND_TEMPLATE_PER_MIN: 20,
  TEMPLATE_SYNC_PER_HOUR: 6,
  CONNECTION_VALIDATE_PER_MIN: 5,
  MARK_READ_PER_MIN: 60,
  SET_DEFAULT_CONNECTION_PER_MIN: 10
});

// TTL do dedupe leve de eventos de webhook (whatsapp_webhook_events) —
// só precisa sobreviver a reentregas do Meta, não é histórico.
const WEBHOOK_EVENT_TTL_MS = 48 * 60 * 60 * 1000;

module.exports = {
  WHATSAPP_GRAPH_VERSION,
  GRAPH_BASE_URL,
  graphUrl,
  REGION,
  WINDOW_MS,
  CONNECTION_STATUS,
  CONNECTION_STATUS_SET,
  CONNECTION_PROVIDER,
  CONNECTION_PROVIDER_SET,
  CONNECTION_PROVIDER_MODE,
  CONNECTION_PROVIDER_MODE_SET,
  CONNECTION_ONBOARDING_MODE,
  CONNECTION_ONBOARDING_MODE_SET,
  CONNECTION_VERSION_LEGACY,
  CONNECTION_VERSION_MULTI,
  MAX_CONNECTIONS_PER_OWNER,
  MESSAGE_STATUS,
  MESSAGE_STATUS_SET,
  MESSAGE_STATUS_RANK,
  CONSENT_STATUS,
  CONSENT_STATUS_SET,
  ERROR_CODES,
  ERROR_MESSAGES,
  META_PERMISSIONS,
  COLLECTIONS,
  RATE_LIMITS,
  WEBHOOK_EVENT_TTL_MS
};
