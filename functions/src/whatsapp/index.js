"use strict";

// WhatsApp Oficial V1 — agrega as 7 Functions exportadas deste módulo.
// onboarding.js não aparece aqui de propósito: é só arquitetura, ainda
// não liberado como Function real (ver onboarding.js).
const { whatsappWebhook } = require("./webhook");
const {
  whatsappSendText,
  whatsappSendTemplate,
  whatsappMarkRead,
  whatsappConnectionStatus,
  whatsappValidateConnection
} = require("./send");
const { whatsappSyncTemplates } = require("./templates");

module.exports = {
  whatsappWebhook,
  whatsappSendText,
  whatsappSendTemplate,
  whatsappMarkRead,
  whatsappSyncTemplates,
  whatsappConnectionStatus,
  whatsappValidateConnection
};
