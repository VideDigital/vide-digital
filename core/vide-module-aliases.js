// Mapa canônico de permissões de módulo — usado por core/vide-context.js
// (runtime real) e pelos testes (tests/security-permission-harness.mjs,
// tests/vide-context.test.mjs). Extraído como módulo puro, sem import de
// Firebase, porque core/vide-context.js importa direto de um CDN
// (https://www.gstatic.com/...), o que o runtime de testes do Node não
// consegue carregar (ERR_UNSUPPORTED_ESM_URL_SCHEME). Antes desta extração
// existiam DUAS cópias manuais desta tabela (uma em core/vide-context.js,
// outra duplicada em tests/security-permission-harness.mjs) e elas já
// haviam divergido de verdade: "crm" virou alias de "leads" só na cópia
// de produção, contradizendo firestore.rules (employeeHasModulePermission
// sempre tratou "crm" como permissão própria). Uma única fonte elimina
// essa classe de bug.
export const MODULE_ALIASES = Object.freeze({
    dashboard: ["dashboard", "cockpit"],
    produtos: ["produtos", "catalogo", "catálogo"],
    pedidos: ["pedidos", "hub"],
    leads: ["leads", "automacao-leads", "automacao_leads", "automacaoLeads"],
    templates: ["templates"],
    campanhas: ["campanhas"],
    metricas: ["metricas", "métricas"],
    configuracoes: ["configuracoes", "configurações", "personalizacao", "personalização"],
    "landing-pages": ["landing-pages", "landing_pages", "landingPages", "paginas", "páginas", "landing", "lp", "studio"],
    funcionarios: ["funcionarios", "funcionários", "subcontas", "equipe"],
    "central-ia": ["central-ia", "central_ia", "gerenciar_ia", "ia", "inteligencia-artificial"],
    "base-conhecimento-ia": ["base-conhecimento-ia", "base_conhecimento_ia", "conhecimento-ia", "conhecimento_ia", "knowledge-base", "base-ia"],
    atendimento: ["atendimento", "conversas", "atendimento_chat", "templates_atendimento"],
    // "crm" é permissão própria e independente de "leads" — espelha
    // exatamente os aliases que firestore.rules já reconhecia.
    crm: ["crm", "clientes", "crm-360", "crm_360", "observacoes_clientes", "tags_clientes"]
});

const MODULE_ALIAS_LOOKUP = Object.freeze(
    Object.entries(MODULE_ALIASES).reduce((acc, [canonical, aliases]) => {
        aliases.forEach(alias => {
            acc[String(alias).trim().toLowerCase()] = canonical;
        });
        acc[String(canonical).trim().toLowerCase()] = canonical;
        return acc;
    }, {})
);

export function normalizeModuleKey(moduleKey) {
    const key = String(moduleKey || "").trim();
    if (!key) return "";
    return MODULE_ALIAS_LOOKUP[key.toLowerCase()] || key;
}

export function normalizeModuleList(list) {
    return Array.from(new Set((Array.isArray(list) ? list : []).map(normalizeModuleKey).filter(Boolean)));
}
