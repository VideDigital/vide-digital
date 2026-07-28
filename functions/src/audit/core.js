"use strict";

// Audit Core — funções PURAS da Auditoria Centralizada V1. Sem Firestore,
// sem Admin SDK, sem I/O de nenhum tipo: recebe dados já carregados e
// devolve dados. Isso existe pra ser testável sem emulador (ver
// tests/functions/audit-core.test.mjs) e pra manter functions/src/audit/
// triggers.js (o lado com efeito, Cloud Functions v2 + Auth Context) fino.
//
// Ver docs/AUDITORIA_CENTRALIZADA.md para o desenho completo.

const SCHEMA_VERSION = 1;

const OPERATIONS = new Set(["create", "update", "delete", "action"]);
const RISK_LEVELS = new Set(["low", "medium", "high", "critical"]);
const ACTOR_TYPES = new Set(["user", "system", "unauthenticated", "unknown"]);
const SOURCES = new Set([
  "firestore-trigger",
  "function",
  "ai-function",
  "admin-function",
  "public-function",
  "system"
]);

// Campos técnicos que não representam uma mudança que interesse a um
// dono lendo a Central de Auditoria — nunca geram evento sozinhos.
const NOISE_FIELDS = new Set([
  "atualizadoEm",
  "updatedAt",
  "lastSeen",
  "ultimaAtividade",
  "atualizadoPor",
  "atualizadoPorAuthUid",
  "statusAtualizadoEm",
  "statusAtualizadoPor",
  "planoAtualizadoEm",
  "planoAtualizadoPor",
  "leituraAtualizadaEm",
  "leituraAtualizadaPor",
  "seedAtualizadoEm",
  "claimsSincronizadasEm",
  "claimsSincronizadasPor",
  "naoLidasLoja",
  "naoLidasCliente",
  "totalSessoes",
  "totalTempoTela",
  "totalCliques",
  "totalVisualizacoes",
  "usoTotal",
  "ultimoUsoEm",
  "porDia",
  "produtosInteresse",
  "ultimaMensagem",
  "ultimaInteracaoEm"
]);

// Bloqueio recursivo — aplicado a QUALQUER campo que sobreviver ao
// allowlist de cada coleção (defesa em profundidade: mesmo que um campo
// sensível um dia entre no allowlist por engano, ele nunca sai daqui com
// o valor original). Comparação por chave normalizada (minúsculo, só
// alfanumérico), com correspondência exata OU substring.
const PII_BLOCKLIST = [
  "email",
  "telefone",
  "phone",
  "whatsapp",
  "cpf",
  "cnpj",
  "endereco",
  "address",
  "cep",
  "senha",
  "password",
  "token",
  "secret",
  "apikey",
  "mensagem",
  "message",
  "texto",
  "conteudo",
  "content",
  "prompt",
  "response",
  "resposta",
  "observacoes",
  "observacao",
  "notes",
  "customernotes",
  "internalnotes"
];

const MAX_DEPTH = 3;
const MAX_FIELDS_PER_LEVEL = 40;
const MAX_STRING_LEN = 200;
const MAX_ARRAY_LEN = 20;
const MAX_CHANGED_FIELDS = 40;
const MAX_SUMMARY_LEN = 400;

function normalizeKey(key) {
  return String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isBlockedKey(key) {
  const normalized = normalizeKey(key);
  if (!normalized) return false;
  return PII_BLOCKLIST.some((term) => normalized === term || normalized.includes(term));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// Aceita tanto Date quanto o formato { toDate(): Date } do
// firebase-admin/firestore Timestamp, sem importar o tipo (core.js não
// depende do Admin SDK).
function toIsoIfTimestampLike(value) {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value.toDate === "function") {
    try {
      return value.toDate().toISOString();
    } catch {
      return null;
    }
  }
  return undefined;
}

function sanitizeValue(value, depth) {
  if (value === null || value === undefined) return null;

  const asTimestamp = toIsoIfTimestampLike(value);
  if (asTimestamp !== undefined) return asTimestamp;

  if (depth > MAX_DEPTH) return "[omitido]";

  const type = typeof value;
  if (type === "string") {
    return value.length > MAX_STRING_LEN ? `${value.slice(0, MAX_STRING_LEN)}…` : value;
  }
  if (type === "number" || type === "boolean") return value;

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_LEN).map((item) => sanitizeValue(item, depth + 1));
  }

  if (isPlainObject(value)) {
    const out = {};
    let count = 0;
    for (const key of Object.keys(value)) {
      if (count >= MAX_FIELDS_PER_LEVEL) break;
      if (isBlockedKey(key)) continue;
      out[key] = sanitizeValue(value[key], depth + 1);
      count += 1;
    }
    return out;
  }

  return "[omitido]";
}

// Sanitiza um documento aplicando primeiro o ALLOWLIST da coleção (só os
// campos explicitamente considerados seguros entram) e depois o
// blocklist recursivo em cada um deles. Nunca retorna o documento bruto.
function sanitizeDocument(data, allowedFields) {
  const out = {};
  if (!isPlainObject(data) || !Array.isArray(allowedFields)) return out;
  for (const field of allowedFields) {
    if (!(field in data)) continue;
    if (isBlockedKey(field)) continue;
    const value = sanitizeValue(data[field], 0);
    if (value !== null) out[field] = value;
  }
  return out;
}

function shallowEqual(a, b) {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

// Diff raso (nível superior só) entre before/after, ignorando ruído.
// Suficiente pro schema (changedFields: string[]) — não precisamos de
// diff profundo pra decidir "algo relevante mudou aqui".
function diffFields(before, after) {
  const beforeObj = isPlainObject(before) ? before : {};
  const afterObj = isPlainObject(after) ? after : {};
  const keys = new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]);
  const changed = [];
  for (const key of keys) {
    if (NOISE_FIELDS.has(key)) continue;
    if (!shallowEqual(beforeObj[key], afterObj[key])) changed.push(key);
  }
  return changed.sort().slice(0, MAX_CHANGED_FIELDS);
}

// Campos "alterados" numa criação = todo campo presente (menos ruído);
// numa exclusão não há diff (o snapshot `before` sanitizado já mostra o
// que existia).
function changedFieldsForOperation(operation, before, after) {
  if (operation === "create") {
    return Object.keys(isPlainObject(after) ? after : {})
      .filter((key) => !NOISE_FIELDS.has(key))
      .sort()
      .slice(0, MAX_CHANGED_FIELDS);
  }
  if (operation === "delete") return [];
  return diffFields(before, after);
}

// update sem nenhum campo relevante alterado (só ruído) não gera evento.
function shouldSkipEvent({ operation, changedFields }) {
  return operation === "update" && Array.isArray(changedFields) && changedFields.length === 0;
}

function detectOperation(beforeExists, afterExists) {
  if (!beforeExists && afterExists) return "create";
  if (beforeExists && !afterExists) return "delete";
  return "update";
}

// AuthType real do Firestore Auth Context é um dos 5 valores técnicos
// (service_account/api_key/system/unauthenticated/unknown) — a mission
// pede a normalização pro vocabulário de negócio: user/system/
// unauthenticated/unknown. `authId` presente é o sinal confiável de
// "houve um usuário real" (dono/funcionário via SDK cliente), mesmo
// quando o Firestore ainda não classifica esse authType como algo mais
// específico que "unknown".
function deriveActor({ authType, authId } = {}) {
  if (authType === "system") return { actorType: "system", actorUid: null };
  if (authType === "unauthenticated") return { actorType: "unauthenticated", actorUid: null };
  if (authId) return { actorType: "user", actorUid: String(authId) };
  return { actorType: "unknown", actorUid: null };
}

function resolveTenantValue(source, tenantField) {
  if (!isPlainObject(source)) return null;
  if (Array.isArray(tenantField)) {
    for (const field of tenantField) {
      const value = source[field];
      if (value) return String(value);
    }
    return null;
  }
  const value = source[tenantField];
  return value ? String(value) : null;
}

// tenantField === "__docId__" cobre coleções cujo próprio ID do documento
// É o tenant (usuarios/{uid}, configuracoes_ia/{storeUid},
// tracking_configs/{ownerUid}). tenantField pode ser um array quando a
// coleção tem mais de um nome legado pro mesmo valor (chats: donoUID OU
// emailDono, ambos guardam o ownerUid — nunca o e-mail real).
function resolveTenant({ operation, before, after, tenantField, entityId }) {
  if (tenantField === "__docId__") {
    return { ownerUid: entityId || null, tenantMismatch: false };
  }
  if (operation === "create") {
    return { ownerUid: resolveTenantValue(after, tenantField), tenantMismatch: false };
  }
  if (operation === "delete") {
    return { ownerUid: resolveTenantValue(before, tenantField), tenantMismatch: false };
  }
  const fromBefore = resolveTenantValue(before, tenantField);
  const fromAfter = resolveTenantValue(after, tenantField);
  const tenantMismatch = Boolean(fromBefore && fromAfter && fromBefore !== fromAfter);
  return { ownerUid: fromBefore || fromAfter || null, tenantMismatch };
}

// Documento auditoria/{eventId} — eventId vem do event.id do CloudEvent
// (Eventarc reentrega o MESMO event.id numa retry), só higienizado pra
// nunca conter "/". set() com esse id é o que garante idempotência —
// nunca use .add() num trigger de auditoria.
function safeEventId(rawId) {
  const cleaned = String(rawId || "").replace(/\//g, "_").trim();
  return cleaned ? cleaned.slice(0, 200) : null;
}

function defaultRiskForOperation(operation) {
  if (operation === "delete") return "high";
  if (operation === "update") return "medium";
  return "low";
}

const OPERATION_LABELS = {
  create: "criado(a)",
  update: "atualizado(a)",
  delete: "excluído(a)",
  action: "alterado(a)"
};

function defaultSummary({ entityType, entityId, operation }) {
  const label = OPERATION_LABELS[operation] || "alterado(a)";
  return `${entityType} ${entityId} foi ${label}`;
}

function defaultAction({ module, operation }) {
  return `${module}.${operation}`;
}

// Monta e valida o documento final antes da escrita. Não inclui
// createdAt (FieldValue.serverTimestamp() só existe no Admin SDK,
// portanto é adicionado em triggers.js, não aqui).
function buildAuditEvent({
  eventId,
  ownerUid,
  actorUid,
  actorType,
  module,
  entityType,
  entityId,
  operation,
  action,
  risk,
  summary,
  changedFields,
  before,
  after,
  source
}) {
  if (!eventId) throw new Error("eventId é obrigatório.");
  if (!ownerUid) throw new Error("ownerUid é obrigatório.");
  if (!module) throw new Error("module é obrigatório.");
  if (!entityType) throw new Error("entityType é obrigatório.");
  if (!entityId) throw new Error("entityId é obrigatório.");
  if (!OPERATIONS.has(operation)) throw new Error(`operation inválida: ${operation}`);
  if (!RISK_LEVELS.has(risk)) throw new Error(`risk inválido: ${risk}`);
  if (!ACTOR_TYPES.has(actorType)) throw new Error(`actorType inválido: ${actorType}`);
  if (!SOURCES.has(source)) throw new Error(`source inválida: ${source}`);

  return {
    schemaVersion: SCHEMA_VERSION,
    eventId,
    ownerUid,
    actorUid: actorUid || null,
    actorType,
    module,
    entityType,
    entityId: String(entityId),
    operation,
    action: String(action || defaultAction({ module, operation })).slice(0, 120),
    risk,
    summary: String(summary || "").slice(0, MAX_SUMMARY_LEN),
    changedFields: Array.isArray(changedFields) ? changedFields.slice(0, MAX_CHANGED_FIELDS) : [],
    before: isPlainObject(before) ? before : {},
    after: isPlainObject(after) ? after : {},
    source,
    ok: true
  };
}

module.exports = {
  SCHEMA_VERSION,
  OPERATIONS,
  RISK_LEVELS,
  ACTOR_TYPES,
  SOURCES,
  NOISE_FIELDS,
  PII_BLOCKLIST,
  isBlockedKey,
  sanitizeValue,
  sanitizeDocument,
  diffFields,
  changedFieldsForOperation,
  shouldSkipEvent,
  detectOperation,
  deriveActor,
  resolveTenant,
  safeEventId,
  defaultRiskForOperation,
  defaultSummary,
  defaultAction,
  buildAuditEvent
};
