"use strict";

// WhatsApp Oficial V1 — Secrets: dois tipos de segredo bem separados.
//
// 1) Globais (mesmo valor pra todo o projeto): WHATSAPP_APP_SECRET e
//    WHATSAPP_WEBHOOK_VERIFY_TOKEN — usam defineSecret() do Firebase
//    Functions (mesmo padrão de GEMINI_API_KEY em ai/index.js), porque são
//    valores únicos fixados no deploy. Nunca declarar aqui um defineSecret()
//    que nenhuma Function realmente usa em seu array `secrets: [...]` — o
//    Firebase CLI detecta QUALQUER defineSecret() carregado durante a
//    análise do código (mesmo sem uso real) e pede interativamente pra criar
//    o secret, travando um deploy --non-interactive.
//
// 2) Por tenant (um token de acesso diferente por loja conectada): NÃO
//    cabem em defineSecret (que é global/estático). Ficam direto no
//    Google Secret Manager, sob o nome "vide-whatsapp-token-<hash>",
//    acessadas dinamicamente em runtime via este adapter. O valor NUNCA
//    é logado, cacheado em disco ou devolvido para o cliente — só um
//    cache curto em memória do processo, limpo em qualquer erro.
//
// Provisionamento (criar/atualizar/desabilitar secret por tenant) só
// acontece via scripts/provision-whatsapp-pilot.mjs e
// scripts/disconnect-whatsapp-pilot.mjs — nunca por uma Cloud Function
// pública. A concessão de IAM (roles/secretmanager.secretAccessor) para a
// service account de runtime das Functions é administrativa/fora de banda
// (ver docs/WHATSAPP_OFICIAL.md) — este código nunca pede permissão
// Secret Manager Admin em runtime.
const crypto = require("crypto");
const { defineSecret } = require("firebase-functions/params");
const { SecretManagerServiceClient } = require("@google-cloud/secret-manager");

const WHATSAPP_APP_SECRET = defineSecret("WHATSAPP_APP_SECRET");
const WHATSAPP_WEBHOOK_VERIFY_TOKEN = defineSecret("WHATSAPP_WEBHOOK_VERIFY_TOKEN");

const TENANT_SECRET_PREFIX = "vide-whatsapp-token-";
const CACHE_TTL_MS = 5 * 60 * 1000;

let clientSingleton = null;
function client() {
  if (!clientSingleton) clientSingleton = new SecretManagerServiceClient();
  return clientSingleton;
}

function projectId() {
  return process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || "";
}

// Nunca expõe o ownerUid cru no nome do secret — hash determinístico e
// curto, suficiente pra ser único sem virar um identificador legível.
function tenantSecretId(ownerUid) {
  const hash = crypto.createHash("sha256").update(String(ownerUid || "")).digest("hex").slice(0, 24);
  return `${TENANT_SECRET_PREFIX}${hash}`;
}

function secretVersionResource(secretId, version = "latest") {
  return `projects/${projectId()}/secrets/${secretId}/versions/${version}`;
}

function secretResource(secretId) {
  return `projects/${projectId()}/secrets/${secretId}`;
}

// Cache local ao processo — nunca sobrevive a um cold start, nunca é
// escrito em disco/Firestore. Só existe pra evitar uma leitura no Secret
// Manager a cada mensagem enviada dentro da mesma instância "quente".
const cacheTokens = new Map(); // secretId -> { value, expiresAt }

async function accessTenantToken(ownerUid) {
  const secretId = tenantSecretId(ownerUid);
  const agora = Date.now();
  const emCache = cacheTokens.get(secretId);
  if (emCache && emCache.expiresAt > agora) return emCache.value;

  try {
    const [versao] = await client().accessSecretVersion({ name: secretVersionResource(secretId) });
    const valor = versao?.payload?.data ? versao.payload.data.toString("utf8") : "";
    if (!valor) throw new Error("empty-secret-payload");
    cacheTokens.set(secretId, { value: valor, expiresAt: agora + CACHE_TTL_MS });
    return valor;
  } catch (erroOriginal) {
    cacheTokens.delete(secretId);
    const notFound = erroOriginal?.code === 5; // grpc NOT_FOUND
    const erro = new Error(notFound ? "Conexão WhatsApp não encontrada." : "Não foi possível acessar as credenciais do WhatsApp.");
    erro.code = notFound ? "WHATSAPP_NOT_CONNECTED" : "WHATSAPP_PROVIDER_UNAVAILABLE";
    throw erro;
  }
}

// Chamado quando um envio falha por token inválido/revogado, ou quando a
// conexão é desconectada — nunca deixa uma leitura seguinte reusar um
// valor que já sabemos estar ruim.
function limparCacheToken(ownerUid) {
  cacheTokens.delete(tenantSecretId(ownerUid));
}

// ---------- Só para os scripts administrativos (provision/disconnect) ----------
async function secretTenantExiste(ownerUid) {
  try {
    await client().getSecret({ name: secretResource(tenantSecretId(ownerUid)) });
    return true;
  } catch (erro) {
    if (erro?.code === 5) return false;
    throw erro;
  }
}

async function criarSecretTenant(ownerUid) {
  const project = projectId();
  await client().createSecret({
    parent: `projects/${project}`,
    secretId: tenantSecretId(ownerUid),
    secret: { replication: { automatic: {} } }
  });
}

async function adicionarVersaoTokenTenant(ownerUid, tokenValue) {
  const secretId = tenantSecretId(ownerUid);
  const existe = await secretTenantExiste(ownerUid);
  if (!existe) await criarSecretTenant(ownerUid);
  const [versao] = await client().addSecretVersion({
    parent: secretResource(secretId),
    payload: { data: Buffer.from(String(tokenValue || ""), "utf8") }
  });
  limparCacheToken(ownerUid);
  return versao.name;
}

async function desabilitarUltimaVersaoTenant(ownerUid) {
  const secretId = tenantSecretId(ownerUid);
  const [{ versions }] = await client().listSecretVersions({ parent: secretResource(secretId) });
  const ativas = (versions || []).filter((v) => v.state === "ENABLED");
  await Promise.all(ativas.map((v) => client().disableSecretVersion({ name: v.name })));
  limparCacheToken(ownerUid);
  return ativas.length;
}

module.exports = {
  WHATSAPP_APP_SECRET,
  WHATSAPP_WEBHOOK_VERIFY_TOKEN,
  tenantSecretId,
  accessTenantToken,
  limparCacheToken,
  secretTenantExiste,
  adicionarVersaoTokenTenant,
  desabilitarUltimaVersaoTenant
};
