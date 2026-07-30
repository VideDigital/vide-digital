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

// ---------- Multiconexão (Fase 2) ----------
// Um secret por CONEXÃO (não mais só por tenant): "vide-whatsapp-token-
// <hash ownerUid+connectionId>". O secret legado (tenantSecretId, hash só
// de ownerUid) nunca é apagado nem reescrito por esta função — continua
// existindo em paralelo pro piloto atual, ver resolver.js pra qual dos
// dois é realmente usado em cada operação.
function tenantConnectionSecretId(ownerUid, connectionId) {
  const chave = `${String(ownerUid || "")}:${String(connectionId || "")}`;
  const hash = crypto.createHash("sha256").update(chave).digest("hex").slice(0, 24);
  return `${TENANT_SECRET_PREFIX}${hash}`;
}

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
// Chave = nome completo do recurso da VERSÃO ("projects/…/secrets/…/
// versions/…") — assim accessTenantToken/accessConnectionToken/
// accessTokenByResource nunca colidem nem duplicam cache mesmo quando
// apontam pro mesmo secret físico (mesma versão resolvida = mesma chave).
const cacheTokens = new Map(); // versionResource -> { value, expiresAt }

// Núcleo compartilhado por qualquer secret de tenant/conexão — legado ou
// novo, a mecânica de acesso/cache/erro é idêntica; só o nome do recurso
// da versão muda.
async function acessarTokenPorVersao(versionResource) {
  const agora = Date.now();
  const emCache = cacheTokens.get(versionResource);
  if (emCache && emCache.expiresAt > agora) return emCache.value;

  try {
    const [versao] = await client().accessSecretVersion({ name: versionResource });
    const valor = versao?.payload?.data ? versao.payload.data.toString("utf8") : "";
    if (!valor) throw new Error("empty-secret-payload");
    cacheTokens.set(versionResource, { value: valor, expiresAt: agora + CACHE_TTL_MS });
    return valor;
  } catch (erroOriginal) {
    cacheTokens.delete(versionResource);
    const notFound = erroOriginal?.code === 5; // grpc NOT_FOUND
    const erro = new Error(notFound ? "Conexão WhatsApp não encontrada." : "Não foi possível acessar as credenciais do WhatsApp.");
    erro.code = notFound ? "WHATSAPP_NOT_CONNECTED" : "WHATSAPP_PROVIDER_UNAVAILABLE";
    throw erro;
  }
}

async function accessTenantToken(ownerUid) {
  return acessarTokenPorVersao(secretVersionResource(tenantSecretId(ownerUid)));
}

// Token da conexão NOVA (ownerUid + connectionId) — usado só na hora de
// PROVISIONAR de verdade uma conexão nova com seu próprio secret (fora do
// escopo desta missão). O resolver.js normal usa accessTokenByResource,
// que lê o secret que o próprio documento da conexão já aponta — nunca
// recalcula o nome do secret a partir de ownerUid/connectionId.
async function accessConnectionToken({ ownerUid, connectionId }) {
  return acessarTokenPorVersao(secretVersionResource(tenantConnectionSecretId(ownerUid, connectionId)));
}

// Lê um secret por um resource name explícito (projects/X/secrets/Y,
// com ou sem /versions/N já incluído) — usado pelo resolver.js a partir
// do campo tokenSecretResource já gravado no documento da conexão
// (legada ou nova). Preserva 100% do comportamento de migração: uma
// conexão migrada do piloto legado pode continuar apontando pro MESMO
// secret legado (nunca precisa copiar o valor do token pra isso).
async function accessTokenByResource(resourceName) {
  const recurso = String(resourceName || "");
  if (!recurso) throw Object.assign(new Error("Conexão WhatsApp não encontrada."), { code: "WHATSAPP_NOT_CONNECTED" });
  const versionResource = /\/versions\/[^/]+$/.test(recurso) ? recurso : `${recurso}/versions/latest`;
  return acessarTokenPorVersao(versionResource);
}

// Chamado quando um envio falha por token inválido/revogado, ou quando a
// conexão é desconectada — nunca deixa uma leitura seguinte reusar um
// valor que já sabemos estar ruim.
function limparCacheToken(ownerUid) {
  cacheTokens.delete(secretVersionResource(tenantSecretId(ownerUid)));
}

function limparCacheTokenConexao(ownerUid, connectionId) {
  cacheTokens.delete(secretVersionResource(tenantConnectionSecretId(ownerUid, connectionId)));
}

// Limpa o cache pelo mesmo resource name usado por accessTokenByResource
// — é o que o resolver.js realmente usa no caminho normal (conexão
// legada ou nova, ambas por tokenSecretResource).
function limparCacheTokenPorResource(resourceName) {
  const recurso = String(resourceName || "");
  if (!recurso) return;
  const versionResource = /\/versions\/[^/]+$/.test(recurso) ? recurso : `${recurso}/versions/latest`;
  cacheTokens.delete(versionResource);
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
  tenantConnectionSecretId,
  secretResource,
  accessTenantToken,
  accessConnectionToken,
  accessTokenByResource,
  limparCacheToken,
  limparCacheTokenConexao,
  limparCacheTokenPorResource,
  secretTenantExiste,
  adicionarVersaoTokenTenant,
  desabilitarUltimaVersaoTenant
};
