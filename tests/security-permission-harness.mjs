const MODULE_ALIASES = {
    dashboard: ["dashboard", "cockpit"],
    produtos: ["produtos", "catalogo", "catálogo"],
    pedidos: ["pedidos", "hub"],
    leads: ["leads", "crm", "automacao-leads", "automacao_leads", "automacaoLeads"],
    templates: ["templates"],
    campanhas: ["campanhas"],
    metricas: ["metricas", "métricas"],
    configuracoes: ["configuracoes", "configurações", "personalizacao", "personalização"],
    "landing-pages": ["landing-pages", "landing_pages", "landingPages", "paginas", "páginas", "landing", "lp", "studio"],
    funcionarios: ["funcionarios", "funcionários", "subcontas", "equipe"]
};

const lookup = Object.entries(MODULE_ALIASES).reduce((acc, [canonical, aliases]) => {
    aliases.concat(canonical).forEach(alias => {
        acc[String(alias).trim().toLowerCase()] = canonical;
    });
    return acc;
}, {});

function normalizeModuleKey(moduleKey) {
    const key = String(moduleKey || "").trim();
    if (!key) return "";
    return lookup[key.toLowerCase()] || key;
}

function normalizeList(list) {
    return Array.from(new Set((Array.isArray(list) ? list : []).map(normalizeModuleKey).filter(Boolean)));
}

function buildContext(kind, permissions = {}) {
    const view = normalizeList(permissions.ver);
    const edit = normalizeList(permissions.editar);
    return {
        initialized: kind !== "loading",
        active: kind !== "loading" && kind !== "invalid",
        isOwner: kind === "owner",
        isAdmin: kind === "admin",
        isEmployee: kind === "employee",
        permissions: {
            view: Array.from(new Set([...view, ...edit])),
            edit
        }
    };
}

function canView(context, moduleKey) {
    const module = normalizeModuleKey(moduleKey);
    if (!module) return true;
    if (!context.initialized || !context.active) return false;
    if (context.isOwner || context.isAdmin) return true;
    if (!context.isEmployee) return false;
    return context.permissions.view.includes(module) ||
        context.permissions.edit.includes(module);
}

function canEdit(context, moduleKey) {
    const module = normalizeModuleKey(moduleKey);
    if (!module) return true;
    if (!context.initialized || !context.active) return false;
    if (context.isOwner || context.isAdmin) return true;
    if (!context.isEmployee) return false;
    return context.permissions.edit.includes(module);
}

const scenarios = [
    ["owner can edit products", buildContext("owner"), "produtos", true, true],
    ["employee read products", buildContext("employee", { ver: ["produtos"] }), "produtos", true, false],
    ["employee edit products", buildContext("employee", { editar: ["produtos"] }), "produtos", true, true],
    ["employee read leads", buildContext("employee", { ver: ["leads"] }), "leads", true, false],
    ["employee read orders", buildContext("employee", { ver: ["pedidos"] }), "pedidos", true, false],
    ["settings does not grant landing pages", buildContext("employee", { editar: ["configuracoes"] }), "landing-pages", false, false],
    ["landing alias grants studio", buildContext("employee", { editar: ["landing_pages"] }), "studio", true, true],
    ["common user cannot use store module", buildContext("invalid"), "produtos", false, false],
    ["admin can edit target store", buildContext("admin"), "landing-pages", true, true],
    ["confirmed admin with employee document keeps admin privilege", buildContext("admin", { ver: ["produtos"] }), "funcionarios", true, true],
    ["loading context does not write", buildContext("loading"), "produtos", false, false]
];

let failures = 0;

for (const [name, context, module, expectedView, expectedEdit] of scenarios) {
    const actualView = canView(context, module);
    const actualEdit = canEdit(context, module);
    if (actualView !== expectedView || actualEdit !== expectedEdit) {
        failures += 1;
        console.error(`[FAIL] ${name}: expected view=${expectedView} edit=${expectedEdit}, got view=${actualView} edit=${actualEdit}`);
    } else {
        console.log(`[OK] ${name}`);
    }
}

if (failures > 0) {
    process.exitCode = 1;
}
