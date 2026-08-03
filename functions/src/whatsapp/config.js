"use strict";

const { WHATSAPP_GRAPH_VERSION } = require("./constants");

const AUDIENCES = new Set(["disabled", "testers", "public"]);

function booleanEnv(name, fallback = false) {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw);
}

function listEnv(name) {
  return String(process.env[name] || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizeAllowedOrigin(value) {
  try {
    const raw = String(value || "").trim().replace(/\/$/, "");
    const parsed = new URL(raw);
    return parsed.protocol === "https:" && parsed.origin === raw ? parsed.origin : "";
  } catch {
    return "";
  }
}

function isEmulator() {
  return process.env.FUNCTIONS_EMULATOR === "true"
    || String(process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "").startsWith("demo-");
}

function shouldEnforceAppCheck() {
  return !isEmulator() && booleanEnv("WHATSAPP_ENFORCE_APP_CHECK", false);
}

function readWhatsappPublicConfig() {
  const emulator = isEmulator();
  const requestedAudience = String(process.env.WHATSAPP_EMBEDDED_SIGNUP_AUDIENCE || "disabled").trim().toLowerCase();
  const audience = AUDIENCES.has(requestedAudience) ? requestedAudience : "disabled";
  const appId = String(process.env.WHATSAPP_EMBEDDED_SIGNUP_APP_ID || (emulator ? "emulator-meta-app" : "")).trim();
  const configurationId = String(process.env.WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID || (emulator ? "emulator-embedded-signup" : "")).trim();
  const allowedOrigins = emulator
    ? []
    : Array.from(new Set(listEnv("WHATSAPP_EMBEDDED_SIGNUP_ALLOWED_ORIGINS").map(normalizeAllowedOrigin).filter(Boolean)));

  return Object.freeze({
    environment: emulator ? "emulator" : String(process.env.VIDE_ENVIRONMENT || "production").trim().toLowerCase(),
    emulator,
    audience: emulator ? "testers" : audience,
    appId,
    configurationId,
    allowedOrigins,
    graphVersion: WHATSAPP_GRAPH_VERSION,
    locale: "pt_BR",
    testerUids: emulator ? ["owner-pro", "employee-edit"] : listEnv("WHATSAPP_EMBEDDED_SIGNUP_TESTER_UIDS"),
    flags: Object.freeze({
      embeddedSignup: emulator || booleanEnv("WHATSAPP_EMBEDDED_SIGNUP_ENABLED"),
      coexistence: !emulator && booleanEnv("WHATSAPP_COEXISTENCE_ENABLED"),
      secondConnection: emulator || booleanEnv("WHATSAPP_SECOND_CONNECTION_ENABLED", false),
      qrCodes: emulator || booleanEnv("WHATSAPP_QR_CODES_ENABLED", false),
      reconnect: emulator || booleanEnv("WHATSAPP_RECONNECT_ENABLED", false),
      disconnect: emulator || booleanEnv("WHATSAPP_DISCONNECT_ENABLED", false)
    })
  });
}

function availabilityForContext(context, config = readWhatsappPublicConfig()) {
  const uid = String(context?.authUid || "");
  const audienceAllows = config.audience === "public"
    || (config.audience === "testers" && (context?.isAdmin || config.testerUids.includes(uid)));
  const configured = Boolean(config.appId && config.configurationId && (config.emulator || config.allowedOrigins.length > 0));
  const available = Boolean(config.flags.embeddedSignup && audienceAllows && configured);

  let reason = "available";
  if (!config.flags.embeddedSignup || config.audience === "disabled") reason = "feature_disabled";
  else if (!configured) reason = config.appId && config.configurationId ? "allowed_origins_missing" : "platform_configuration_missing";
  else if (!audienceAllows) reason = "not_in_rollout";

  return Object.freeze({
    available,
    reason,
    graphVersion: config.graphVersion,
    locale: config.locale,
    environment: config.environment,
    flags: config.flags
  });
}

function originAllowed(value, config = readWhatsappPublicConfig()) {
  if (config.emulator) return true;
  const origin = normalizeAllowedOrigin(value);
  return Boolean(origin && config.allowedOrigins.includes(origin));
}

module.exports = {
  AUDIENCES,
  availabilityForContext,
  booleanEnv,
  isEmulator,
  listEnv,
  normalizeAllowedOrigin,
  originAllowed,
  readWhatsappPublicConfig,
  shouldEnforceAppCheck
};
