import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import config from "../../functions/src/whatsapp/config.js";
import core from "../../functions/src/whatsapp/onboarding-core.js";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
});

function productionEnv(overrides = {}) {
  process.env.FUNCTIONS_EMULATOR = "false";
  process.env.GCLOUD_PROJECT = "vide-digital-saas";
  process.env.GOOGLE_CLOUD_PROJECT = "vide-digital-saas";
  for (const key of [
    "WHATSAPP_EMBEDDED_SIGNUP_ENABLED", "WHATSAPP_EMBEDDED_SIGNUP_AUDIENCE",
    "WHATSAPP_EMBEDDED_SIGNUP_APP_ID", "WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID",
    "WHATSAPP_EMBEDDED_SIGNUP_ALLOWED_ORIGINS",
    "WHATSAPP_EMBEDDED_SIGNUP_TESTER_UIDS", "WHATSAPP_SECOND_CONNECTION_ENABLED",
    "WHATSAPP_QR_CODES_ENABLED", "WHATSAPP_RECONNECT_ENABLED",
    "WHATSAPP_DISCONNECT_ENABLED", "WHATSAPP_ENFORCE_APP_CHECK"
  ]) delete process.env[key];
  Object.assign(process.env, overrides);
}

describe("WhatsApp Embedded Signup — state, idempotência e replay", () => {
  const input = {
    appSecret: "segredo-somente-no-servidor",
    ownerUid: "owner-a",
    authUid: "employee-a",
    idempotencyKey: "client_generated_key_1234567890",
    expiresAt: 2_000_000_000_000
  };

  it("gera tentativa/state determinísticos, imprevisíveis e armazena somente hashes", () => {
    const first = core.createAttemptIdentity(input);
    const second = core.createAttemptIdentity(input);
    assert.deepEqual(first, second);
    assert.match(first.attemptId, /^waon_[A-Za-z0-9_-]{36}$/);
    assert.equal(first.attemptId.includes(input.ownerUid), false);
    assert.equal(first.stateHash, core.sha256(first.state));
    assert.equal(first.idempotencyHash, core.sha256(input.idempotencyKey));
  });

  it("vincula state a tenant, usuário e expiração", () => {
    const original = core.createAttemptIdentity(input);
    assert.notEqual(original.state, core.createAttemptIdentity({ ...input, ownerUid: "owner-b" }).state);
    assert.notEqual(original.state, core.createAttemptIdentity({ ...input, authUid: "employee-b" }).state);
    assert.notEqual(original.state, core.createAttemptIdentity({ ...input, expiresAt: input.expiresAt + 1 }).state);
  });

  it("valida state timing-safe e rejeita alteração/replay com state diferente", () => {
    const identity = core.createAttemptIdentity(input);
    assert.equal(core.verifyState(identity.state, identity.stateHash), true);
    assert.equal(core.verifyState(`${identity.state}x`, identity.stateHash), false);
    assert.equal(core.verifyState("curto", identity.stateHash), false);
  });

  it("usa TTL de 15 minutos e vocabulário terminal explícito", () => {
    assert.equal(core.ATTEMPT_TTL_MS, 15 * 60 * 1000);
    for (const status of ["connected", "failed", "cancelled", "expired", "requires_action"]) {
      assert.equal(core.TERMINAL_STATUSES.has(status), true);
      assert.equal(core.ONBOARDING_STATUSES.includes(status), true);
    }
  });

  it("rejeita idempotency key fraca ou manipulada", () => {
    assert.equal(core.normalizeIdempotencyKey("curta"), "");
    assert.equal(core.normalizeIdempotencyKey("../client_generated_key_1234567890"), "");
    assert.equal(core.normalizeIdempotencyKey(input.idempotencyKey), input.idempotencyKey);
  });
});

describe("WhatsApp Embedded Signup — descoberta server-side e sanitização", () => {
  it("extrai e deduplica somente WABAs do escopo oficial", () => {
    assert.deepEqual(core.extractWabaTargets({ granular_scopes: [
      { scope: "whatsapp_business_management", target_ids: ["12345", "12345", "67890"] },
      { scope: "business_management", target_ids: ["99999"] }
    ] }), ["12345", "67890"]);
  });

  it("seleciona hint apenas quando pertence ao conjunto verificado", () => {
    assert.equal(core.selectVerifiedAsset({ candidates: [{ id: "12345" }, { id: "67890" }], hint: "67890", kind: "phone" }), "67890");
    assert.throws(() => core.selectVerifiedAsset({ candidates: ["12345", "67890"], hint: "99999", kind: "waba" }), { code: "ASSET_AMBIGUOUS" });
    assert.throws(() => core.selectVerifiedAsset({ candidates: [], hint: "99999", kind: "waba" }), { code: "ASSET_NOT_FOUND" });
  });

  it("sanitiza session info sem confiar em campos extras do navegador", () => {
    assert.deepEqual(core.sanitizeSessionInfo({ waba_id: "12345", phone_number_id: "67890", access_token: "nunca", arbitrary: "x" }), {
      wabaIdHint: "12345", phoneNumberIdHint: "67890", businessIdHint: ""
    });
  });

  it("limita nome, mensagem QR, authorization code e origem", () => {
    assert.equal(core.sanitizeLabel("  Atendimento <principal>  "), "Atendimento principal");
    assert.throws(() => core.sanitizeQrInput({ label: "x", message: "Olá" }), { code: "INVALID_LABEL" });
    assert.throws(() => core.sanitizeQrInput({ label: "Balcão", message: "x".repeat(321) }), { code: "INVALID_MESSAGE" });
    assert.deepEqual(core.sanitizeQrInput({ label: "Balcão", message: " Olá\ncliente " }), { label: "Balcão", message: "Olá cliente" });
    assert.equal(core.validateAuthorizationCode("codigo-meta-valido"), "codigo-meta-valido");
    assert.equal(core.validateAuthorizationCode("curto"), "");
    assert.equal(core.sanitizeOrigin("https://app.videhub.com.br/rota?x=1"), "https://app.videhub.com.br");
    assert.equal(core.sanitizeOrigin("javascript:alert(1)"), "");
  });

  it("seleciona somente versões exatas substituídas para desabilitar", () => {
    assert.deepEqual(core.supersededCredentialVersions({
      tokenSecretResource: "projects/projeto/secrets/token/versions/3",
      pinSecretResource: "projects/projeto/secrets/pin/versions/latest"
    }, {
      tokenSecretResource: "projects/projeto/secrets/token/versions/4",
      pinSecretResource: "projects/projeto/secrets/pin/versions/2"
    }), ["projects/projeto/secrets/token/versions/3"]);
    assert.deepEqual(core.supersededCredentialVersions({
      tokenSecretResource: "projects/projeto/secrets/token/versions/4"
    }, {
      tokenSecretResource: "projects/projeto/secrets/token/versions/4"
    }), []);
  });

  it("redige segredos recursivamente e normaliza mensagens leigas", () => {
    const redacted = core.redactForLog({ accessToken: "EAAG_REAL", nested: { authorization: "Bearer x", safe: "ok" } });
    assert.deepEqual(redacted, { accessToken: "[REDACTED]", nested: { authorization: "[REDACTED]", safe: "ok" } });
    assert.match(core.publicError({ code: "ROUTE_CONFLICT" }).message, /já está conectado/i);
    assert.equal(core.publicError({ code: "INVENTADO" }).message.includes("INVENTADO"), false);
  });
});

describe("WhatsApp Embedded Signup — feature flags e App Check progressivo", () => {
  it("mantém tudo desativado por padrão em produção", () => {
    productionEnv();
    const current = config.readWhatsappPublicConfig();
    assert.equal(current.flags.embeddedSignup, false);
    assert.equal(current.flags.secondConnection, false);
    assert.equal(current.flags.qrCodes, false);
    assert.equal(current.flags.reconnect, false);
    assert.equal(current.flags.disconnect, false);
    assert.equal(config.shouldEnforceAppCheck(), false);
  });

  it("libera somente testadores configurados quando app/config estão presentes", () => {
    productionEnv({
      WHATSAPP_EMBEDDED_SIGNUP_ENABLED: "true",
      WHATSAPP_EMBEDDED_SIGNUP_AUDIENCE: "testers",
      WHATSAPP_EMBEDDED_SIGNUP_APP_ID: "123456789",
      WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID: "987654321",
      WHATSAPP_EMBEDDED_SIGNUP_ALLOWED_ORIGINS: "https://app.videhub.com.br",
      WHATSAPP_EMBEDDED_SIGNUP_TESTER_UIDS: "owner-a, owner-b"
    });
    const current = config.readWhatsappPublicConfig();
    assert.equal(config.availabilityForContext({ authUid: "owner-a" }, current).available, true);
    assert.equal(config.availabilityForContext({ authUid: "owner-c" }, current).reason, "not_in_rollout");
  });

  it("exige allowlist HTTPS exata antes de liberar produção", () => {
    productionEnv({
      WHATSAPP_EMBEDDED_SIGNUP_ENABLED: "true",
      WHATSAPP_EMBEDDED_SIGNUP_AUDIENCE: "public",
      WHATSAPP_EMBEDDED_SIGNUP_APP_ID: "123456789",
      WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID: "987654321"
    });
    let current = config.readWhatsappPublicConfig();
    assert.equal(config.availabilityForContext({ authUid: "owner-a" }, current).reason, "allowed_origins_missing");

    process.env.WHATSAPP_EMBEDDED_SIGNUP_ALLOWED_ORIGINS = "https://app.videhub.com.br, http://inseguro.test, https://app.videhub.com.br/rota";
    current = config.readWhatsappPublicConfig();
    assert.deepEqual(current.allowedOrigins, ["https://app.videhub.com.br"]);
    assert.equal(config.originAllowed("https://app.videhub.com.br", current), true);
    assert.equal(config.originAllowed("https://evil.test", current), false);
  });

  it("só exige App Check após opt-in explícito e nunca no Emulator", () => {
    productionEnv({ WHATSAPP_ENFORCE_APP_CHECK: "true" });
    assert.equal(config.shouldEnforceAppCheck(), true);
    process.env.FUNCTIONS_EMULATOR = "true";
    assert.equal(config.shouldEnforceAppCheck(), false);
  });

  it("Emulator usa mocks e nunca exige configuração real da Meta", () => {
    productionEnv();
    process.env.FUNCTIONS_EMULATOR = "true";
    const current = config.readWhatsappPublicConfig();
    assert.equal(current.emulator, true);
    assert.equal(current.flags.embeddedSignup, true);
    assert.equal(current.flags.qrCodes, true);
    assert.equal(config.availabilityForContext({ authUid: "owner-pro", isAdmin: false }, current).available, true);
  });
});
