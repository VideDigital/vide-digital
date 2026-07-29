"use strict";

const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const employee = require("./employees");
const adminFns = require("./admin");
const publicFns = require("./public");
const audit = require("./audit");
const notifications = require("./notifications");
const leads = require("./leads");
const ai = require("./ai");
const whatsapp = require("./whatsapp");

exports.createEmployee = employee.createEmployee;
exports.updateEmployee = employee.updateEmployee;
exports.disableEmployee = employee.disableEmployee;
exports.enableEmployee = employee.enableEmployee;
exports.resetEmployeePassword = employee.resetEmployeePassword;

exports.syncAdminClaims = adminFns.syncAdminClaims;
exports.createAdminMember = adminFns.createAdminMember;
exports.adminUpdateStoreStatus = adminFns.adminUpdateStoreStatus;
exports.adminUpdatePlan = adminFns.adminUpdatePlan;

exports.createPublicLead = publicFns.createPublicLead;
exports.incrementPublicMetric = publicFns.incrementPublicMetric;
exports.createPublicChat = publicFns.createPublicChat;
exports.sendPublicChatMessage = publicFns.sendPublicChatMessage;

// auditWrite (callable público) foi removido nesta missão — aceitava
// ownerUid do payload do cliente, sem consumidor de produção. writeAudit
// segue como helper interno (não exportado como Function própria); os
// triggers de auditoria abaixo são a fonte real de eventos server-side.
// Ver docs/AUDITORIA_CENTRALIZADA.md.
exports.auditUsuariosWrite = audit.auditUsuariosWrite;
exports.auditFuncionariosWrite = audit.auditFuncionariosWrite;
exports.auditPedidosWrite = audit.auditPedidosWrite;
exports.auditProdutosWrite = audit.auditProdutosWrite;
exports.auditClientesWrite = audit.auditClientesWrite;
exports.auditLeadsWrite = audit.auditLeadsWrite;
exports.auditChatsWrite = audit.auditChatsWrite;
exports.auditTemplatesWrite = audit.auditTemplatesWrite;
exports.auditVitrinesWrite = audit.auditVitrinesWrite;
exports.auditLandingPagesWrite = audit.auditLandingPagesWrite;
exports.auditLandingPagesPublicasWrite = audit.auditLandingPagesPublicasWrite;
exports.auditIaConfigWrite = audit.auditIaConfigWrite;
exports.auditKnowledgeWrite = audit.auditKnowledgeWrite;
exports.auditTrackingConfigsWrite = audit.auditTrackingConfigsWrite;
exports.auditTrackingLinksWrite = audit.auditTrackingLinksWrite;

exports.markNotificationRead = notifications.markNotificationRead;

exports.sendAdminChatMessage = leads.sendAdminChatMessage;

exports.askBusinessAI = ai.askBusinessAI;
exports.askPublicBusinessAI = ai.askPublicBusinessAI;

// WhatsApp Oficial V1 — Fase A (código; conexão real depende de
// configuração externa da Meta, secrets e deploy dedicado). Ver
// docs/WHATSAPP_OFICIAL.md.
exports.whatsappWebhook = whatsapp.whatsappWebhook;
exports.whatsappSendText = whatsapp.whatsappSendText;
exports.whatsappSendTemplate = whatsapp.whatsappSendTemplate;
exports.whatsappMarkRead = whatsapp.whatsappMarkRead;
exports.whatsappSyncTemplates = whatsapp.whatsappSyncTemplates;
exports.whatsappConnectionStatus = whatsapp.whatsappConnectionStatus;
exports.whatsappValidateConnection = whatsapp.whatsappValidateConnection;
