"use strict";

// WhatsApp Oficial — agrega as 9 Functions exportadas deste módulo (7 da
// V1 + whatsappListConnections/whatsappSetDefaultConnection da Fase 4,
// multiconexão). onboarding.js não aparece aqui de propósito: é só
// arquitetura, ainda não liberado como Function real (ver onboarding.js).
const { whatsappWebhook } = require("./webhook");
const {
  whatsappSendText,
  whatsappSendTemplate,
  whatsappMarkRead,
  whatsappConnectionStatus,
  whatsappValidateConnection
} = require("./send");
const { whatsappSyncTemplates } = require("./templates");
const { whatsappListConnections, whatsappSetDefaultConnection } = require("./connections");

module.exports = {
  whatsappWebhook,
  whatsappSendText,
  whatsappSendTemplate,
  whatsappMarkRead,
  whatsappSyncTemplates,
  whatsappConnectionStatus,
  whatsappValidateConnection,
  whatsappListConnections,
  whatsappSetDefaultConnection
};
