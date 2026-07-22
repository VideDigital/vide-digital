"use strict";

const MODULES = new Set([
  "hub",
  "produtos",
  "pedidos",
  "leads",
  "templates",
  "campanhas",
  "metricas",
  "funcionarios",
  "configuracoes",
  "central-ia",
  "landing-pages"
]);

const PLAN_LIMITS = {
  starter: { employees: 0, products: 3, landingPages: 0 },
  basico: { employees: 0, products: 5, landingPages: 0 },
  essencial: { employees: 0, products: 10, landingPages: 0 },
  negocio: { employees: 0, products: 20, landingPages: 0 },
  profissional: { employees: 0, products: 35, landingPages: 0 },
  avancado: { employees: 0, products: 50, landingPages: 1 },
  pro: { employees: 1, products: -1, landingPages: -1 },
  proplus: { employees: 3, products: -1, landingPages: -1 },
  agencia: { employees: 10, products: -1, landingPages: -1 },
  enterprise: { employees: -1, products: -1, landingPages: -1 },
  premium: { employees: -1, products: -1, landingPages: -1 }
};

function normalizeString(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function normalizeEmail(value) {
  return normalizeString(value, 254).toLowerCase();
}

function normalizePhone(value) {
  return normalizeString(value, 32).replace(/\D/g, "").slice(0, 20);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function sanitizePermissionList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => normalizeString(item, 60)).filter((item) => MODULES.has(item)))];
}

function sanitizePermissions(value) {
  const ver = sanitizePermissionList(value?.ver);
  const editar = sanitizePermissionList(value?.editar);
  return {
    ver: [...new Set([...ver, ...editar])],
    editar
  };
}

function employeeLimitForPlan(plan) {
  const limits = PLAN_LIMITS[normalizeString(plan, 40)] || PLAN_LIMITS.starter;
  return limits.employees;
}

function publicText(value, max = 1000) {
  return normalizeString(value, max).replace(/\s+/g, " ");
}

module.exports = {
  MODULES,
  PLAN_LIMITS,
  employeeLimitForPlan,
  isValidEmail,
  normalizeEmail,
  normalizePhone,
  normalizeString,
  publicText,
  sanitizePermissions
};
