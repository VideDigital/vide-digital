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

exports.auditWrite = audit.auditWrite;
exports.markNotificationRead = notifications.markNotificationRead;

exports.sendAdminChatMessage = leads.sendAdminChatMessage;

exports.askBusinessAI = ai.askBusinessAI;
