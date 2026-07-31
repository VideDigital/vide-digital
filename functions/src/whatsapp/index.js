"use strict";

// WhatsApp Oficial — ponto único de exportação do módulo. O fluxo de
// Embedded Signup permanece protegido por feature flag e App Check; a
// simples presença das Functions não libera onboarding em produção.
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
const {
  whatsappStartOnboarding,
  whatsappCompleteOnboarding,
  whatsappGetOnboardingStatus,
  whatsappCancelOnboarding
} = require("./onboarding");
const { whatsappRenameConnection, whatsappDisconnectConnection } = require("./management");
const { whatsappListQrCodes, whatsappCreateQrCode, whatsappUpdateQrCode, whatsappDeleteQrCode } = require("./qr");

module.exports = {
  whatsappWebhook,
  whatsappSendText,
  whatsappSendTemplate,
  whatsappMarkRead,
  whatsappSyncTemplates,
  whatsappConnectionStatus,
  whatsappValidateConnection,
  whatsappListConnections,
  whatsappSetDefaultConnection,
  whatsappStartOnboarding,
  whatsappCompleteOnboarding,
  whatsappGetOnboardingStatus,
  whatsappCancelOnboarding,
  whatsappRenameConnection,
  whatsappDisconnectConnection,
  whatsappListQrCodes,
  whatsappCreateQrCode,
  whatsappUpdateQrCode,
  whatsappDeleteQrCode
};
