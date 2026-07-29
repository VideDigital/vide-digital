"use strict";

// WhatsApp Oficial V1 — Validators: só funções PURAS (sem Firestore, sem
// fetch, sem Admin SDK). Mesmo o HMAC/crypto aqui é síncrono e determinístico
// (nenhum I/O), o que permite testar tudo isto sem emulador — ver
// tests/functions/whatsapp-validators.test.mjs. Efeitos colaterais (ler
// segredo, gravar Firestore, chamar a Graph API) ficam em webhook.js/
// send.js/secrets.js/metaClient.js. Mesmo padrão de functions/src/audit/core.js.
const crypto = require("crypto");
const { WINDOW_MS, MESSAGE_STATUS_RANK } = require("./constants");

// ---------- Webhook: verify handshake (GET) ----------
// Comparação em tempo constante — mesmo tamanho sempre, nunca deixa o
// tempo de resposta vazar quantos caracteres bateram (timing attack).
function timingSafeEqualStrings(a, b) {
  const bufA = Buffer.from(String(a ?? ""), "utf8");
  const bufB = Buffer.from(String(b ?? ""), "utf8");
  if (bufA.length !== bufB.length) {
    // Ainda assim compara contra si mesma pra manter tempo ~constante,
    // em vez de retornar imediatamente por tamanho diferente.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

// GET /webhook?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
// Retorna o challenge (string) se válido, ou null se inválido — nunca
// loga o verify_token recebido nem o esperado.
function verificarHandshakeWebhook({ mode, token, challenge }, verifyTokenEsperado) {
  const modoValido = mode === "subscribe";
  const tokenValido = Boolean(verifyTokenEsperado) && timingSafeEqualStrings(token, verifyTokenEsperado);
  if (!modoValido || !tokenValido) return null;
  const desafio = String(challenge ?? "");
  return desafio.length > 0 ? desafio : null;
}

// ---------- Webhook: assinatura (POST) ----------
// appSecret nunca aparece em erro/log. rawBody precisa ser o corpo cru
// (Buffer/string), nunca o JSON já reserializado (reserialização pode
// mudar espaçamento e quebrar a assinatura).
function verificarAssinaturaWebhook(rawBody, signatureHeader, appSecret) {
  if (!appSecret || !signatureHeader || !rawBody) return false;
  const prefixo = "sha256=";
  const header = String(signatureHeader);
  if (!header.startsWith(prefixo)) return false;
  const assinaturaRecebida = header.slice(prefixo.length);
  let assinaturaEsperada;
  try {
    assinaturaEsperada = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  } catch {
    return false;
  }
  return timingSafeEqualStrings(assinaturaRecebida, assinaturaEsperada);
}

// ---------- Identificadores ----------
// wa_id da Meta já vem só com dígitos (formato E.164 sem "+"), mas
// normalizamos do mesmo jeito pra nunca confiar cegamente no payload.
function normalizarWaId(valor) {
  return String(valor ?? "").replace(/\D/g, "").slice(0, 20);
}

function waIdValido(waId) {
  return typeof waId === "string" && waId.length >= 8 && waId.length <= 15;
}

// wamid real (ex.: "wamid.HBgLNTU...==") tem caracteres inválidos como ID
// de documento Firestore (".", "/", tamanho variável). Um hash determinístico
// resolve isso sem perder a propriedade de idempotência: o mesmo wamid
// sempre produz o mesmo safeWamid.
function safeWamid(wamid) {
  const valor = String(wamid ?? "").trim();
  if (!valor) return "";
  return crypto.createHash("sha256").update(valor).digest("hex");
}

// Hash de contato — nunca usar wa_id cru como ID de documento (é PII
// operacional). Inclui ownerUid pra nunca colidir entre tenants diferentes.
function hashContato(ownerUid, waId) {
  const chave = `${String(ownerUid ?? "")}:${normalizarWaId(waId)}`;
  return crypto.createHash("sha256").update(chave).digest("hex").slice(0, 40);
}

// Dedupe leve de reentrega de webhook — determinístico a partir de
// campos não sensíveis do evento (nunca do payload completo).
function hashEventoWebhook({ ownerUid, eventType, providerId, providerTimestamp }) {
  const chave = [ownerUid, eventType, providerId, providerTimestamp].map((v) => String(v ?? "")).join("|");
  return crypto.createHash("sha256").update(chave).digest("hex").slice(0, 40);
}

// ---------- Janela de atendimento de 24h ----------
// Nunca confiar no relógio do navegador — quem chama esta função sempre
// passa "agoraMs" vindo de Date.now() do servidor (Cloud Function).
function calcularExpiracaoJanela(ultimaMensagemClienteEmMs) {
  const base = Number(ultimaMensagemClienteEmMs);
  if (!Number.isFinite(base) || base <= 0) return 0;
  return base + WINDOW_MS;
}

function janelaAberta(janelaAtendimentoAteMs, agoraMs = Date.now()) {
  const ate = Number(janelaAtendimentoAteMs);
  return Number.isFinite(ate) && ate > agoraMs;
}

// ---------- Status de entrega (nunca regride) ----------
// queued -> accepted -> sent -> delivered -> read é a ordem normal.
// "failed" é aceito a qualquer momento ANTES de delivered/read (depois
// disso a mensagem já chegou/foi lida — um "failed" tardio e fora de
// ordem não pode apagar isso). Repetir o mesmo status é sempre permitido
// (idempotência de reentrega do webhook).
function podeAtualizarStatusMensagem(atual, novo) {
  if (!(novo in MESSAGE_STATUS_RANK) && novo !== "failed") return false;
  if (!atual) return true;
  if (atual === novo) return true;
  if (atual === "failed") return false; // terminal
  if (novo === "failed") return atual !== "delivered" && atual !== "read";
  if (!(atual in MESSAGE_STATUS_RANK)) return true;
  return MESSAGE_STATUS_RANK[novo] > MESSAGE_STATUS_RANK[atual];
}

// ---------- Segurança de logs/erros ----------
const PADROES_SENSIVEIS = [
  /token/i, /secret/i, /senha/i, /password/i, /authorization/i,
  /\bwa_?id\b/i, /telefone/i, /phone/i, /\btexto\b/i, /\bmessage\b/i,
  /profile.?name/i, /display_phone/i
];

function chaveSensivel(chave) {
  return PADROES_SENSIVEIS.some((padrao) => padrao.test(String(chave)));
}

// Reduz qualquer objeto de erro/contexto a só {code, funcao, providerStatus,
// correlationId} — nunca token/telefone/texto/nome/payload cru. Usado antes
// de qualquer console.error/logger deste módulo.
function sanitizarErroParaLog({ code, funcao, providerStatus, correlationId } = {}) {
  return {
    code: typeof code === "string" ? code.slice(0, 80) : "WHATSAPP_UNKNOWN_ERROR",
    funcao: typeof funcao === "string" ? funcao.slice(0, 80) : "",
    providerStatus: Number.isFinite(Number(providerStatus)) ? Number(providerStatus) : null,
    correlationId: typeof correlationId === "string" ? correlationId.slice(0, 120) : ""
  };
}

// Remove recursivamente qualquer chave sensível de um objeto simples —
// última linha de defesa antes de logar algo vindo de fora (payload Meta).
function removerCamposSensiveis(valor, profundidade = 0) {
  if (profundidade > 4 || valor === null || typeof valor !== "object") return valor;
  if (Array.isArray(valor)) return valor.map((item) => removerCamposSensiveis(item, profundidade + 1));
  const resultado = {};
  for (const [chave, val] of Object.entries(valor)) {
    if (chaveSensivel(chave)) {
      resultado[chave] = "[omitido]";
      continue;
    }
    resultado[chave] = removerCamposSensiveis(val, profundidade + 1);
  }
  return resultado;
}

// Máscara de exibição — nunca revela nem o tamanho real do segredo.
function mascararSegredo() {
  return "•••••••• conectado";
}

// ---------- Identificador de rate limit ----------
// Junta partes já normalizadas num identifier estável pra assertRateLimit()
// (functions/src/shared/rateLimit.js) — nunca usa dado bruto do payload.
function identificadorRateLimit(...partes) {
  return partes
    .map((parte) => String(parte ?? "").trim().replace(/[^a-zA-Z0-9_-]/g, "_"))
    .filter(Boolean)
    .join("_")
    .slice(0, 200);
}

// ---------- Parsing do payload do webhook (Meta -> forma normalizada) ----------
// Formato oficial: { entry: [{ changes: [{ field: "messages", value: {
//   metadata: { phone_number_id, display_phone_number },
//   contacts: [{ profile: { name }, wa_id }],
//   messages: [...], statuses: [...]
// } }] }] }
// Nunca confia em wabaId/phoneNumberId do payload pra decidir o tenant —
// só extrai; a resolução de ownerUid é responsabilidade de webhook.js via
// whatsapp_phone_routes.
function extrairEventosDoPayload(body) {
  const entradas = Array.isArray(body?.entry) ? body.entry : [];
  const eventos = [];
  for (const entrada of entradas) {
    const mudancas = Array.isArray(entrada?.changes) ? entrada.changes : [];
    for (const mudanca of mudancas) {
      if (mudanca?.field !== "messages") continue;
      const valor = mudanca?.value || {};
      const phoneNumberId = String(valor?.metadata?.phone_number_id || "");
      const contato = Array.isArray(valor?.contacts) ? valor.contacts[0] : null;
      const profileName = typeof contato?.profile?.name === "string" ? contato.profile.name.slice(0, 120) : "";
      const waIdContato = normalizarWaId(contato?.wa_id);

      for (const msg of Array.isArray(valor?.messages) ? valor.messages : []) {
        eventos.push(normalizarMensagemInbound(msg, { phoneNumberId, profileName, waIdContato }));
      }
      for (const status of Array.isArray(valor?.statuses) ? valor.statuses : []) {
        eventos.push(normalizarStatusOutbound(status, { phoneNumberId }));
      }
    }
  }
  return eventos;
}

const TIPOS_MIDIA_CONHECIDOS = new Set(["image", "document", "audio", "video", "sticker", "location", "contacts"]);

function normalizarMensagemInbound(msg, { phoneNumberId, profileName, waIdContato }) {
  const wamid = String(msg?.id || "");
  const waIdRemetente = normalizarWaId(msg?.from) || waIdContato;
  const timestampSegundos = Number(msg?.timestamp);
  const providerTimestamp = Number.isFinite(timestampSegundos) ? timestampSegundos * 1000 : Date.now();
  const tipo = String(msg?.type || "unknown");
  const replyToId = typeof msg?.context?.id === "string" ? msg.context.id : "";

  const base = {
    categoria: "mensagem",
    phoneNumberId,
    waId: waIdRemetente,
    profileName,
    wamid,
    providerTimestamp,
    replyToId,
    messageType: tipo
  };

  if (tipo === "text") {
    return { ...base, texto: String(msg?.text?.body || "").slice(0, 4096) };
  }
  if (tipo === "reaction") {
    return { ...base, messageType: "reaction", emoji: String(msg?.reaction?.emoji || "").slice(0, 8), reactedToId: String(msg?.reaction?.message_id || "") };
  }
  if (TIPOS_MIDIA_CONHECIDOS.has(tipo)) {
    const bloco = msg?.[tipo] || {};
    return {
      ...base,
      messageType: tipo,
      mediaMetadata: {
        mimeType: typeof bloco.mime_type === "string" ? bloco.mime_type.slice(0, 100) : "",
        providerMediaId: typeof bloco.id === "string" ? bloco.id.slice(0, 200) : "",
        caption: typeof bloco.caption === "string" ? bloco.caption.slice(0, 500) : ""
      }
    };
  }
  // Tipo desconhecido/futuro: placeholder não-quebrante, nunca derruba o
  // webhook por causa de um tipo novo que a Meta introduza depois.
  return { ...base, messageType: "unknown", tipoOriginal: tipo };
}

function normalizarStatusOutbound(status, { phoneNumberId }) {
  const timestampSegundos = Number(status?.timestamp);
  const providerTimestamp = Number.isFinite(timestampSegundos) ? timestampSegundos * 1000 : Date.now();
  const erro = Array.isArray(status?.errors) ? status.errors[0] : null;
  return {
    categoria: "status",
    phoneNumberId,
    wamid: String(status?.id || ""),
    providerStatus: String(status?.status || ""),
    providerTimestamp,
    codigoErro: erro ? String(erro.code || "") : "",
    tituloErroSeguro: erro ? String(erro.title || "").slice(0, 200) : ""
  };
}

// ---------- Templates: preenchimento/validação de parâmetros ----------
// parameterSchema é uma lista simples [{ name, type: "text", required }]
// derivada do components salvo em whatsapp_templates. V1 só suporta
// parâmetros de texto (sem mídia em componente de template).
function validarParametrosTemplate(parameterSchema, valores) {
  const schema = Array.isArray(parameterSchema) ? parameterSchema : [];
  const mapaValores = valores && typeof valores === "object" ? valores : {};
  const erros = [];
  for (const campo of schema) {
    const nome = String(campo?.name || "");
    if (!nome) continue;
    const valor = mapaValores[nome];
    if (campo.required && (valor === undefined || valor === null || String(valor).trim() === "")) {
      erros.push(`Parâmetro obrigatório ausente: ${nome}`);
      continue;
    }
    if (valor !== undefined && String(valor).length > 1000) {
      erros.push(`Parâmetro muito longo: ${nome}`);
    }
  }
  return { valido: erros.length === 0, erros };
}

module.exports = {
  timingSafeEqualStrings,
  verificarHandshakeWebhook,
  verificarAssinaturaWebhook,
  normalizarWaId,
  waIdValido,
  safeWamid,
  hashContato,
  hashEventoWebhook,
  calcularExpiracaoJanela,
  janelaAberta,
  podeAtualizarStatusMensagem,
  sanitizarErroParaLog,
  removerCamposSensiveis,
  mascararSegredo,
  identificadorRateLimit,
  extrairEventosDoPayload,
  normalizarMensagemInbound,
  normalizarStatusOutbound,
  validarParametrosTemplate
};
