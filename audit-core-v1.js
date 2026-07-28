/* =========================================================
   VIDE HUB — CENTRAL DE AUDITORIA V1
   Funções puras de apresentação: rótulos, formatação de data/UID,
   filtro local, exportação CSV/JSON e KPIs derivados de uma lista de
   eventos já carregada. Sem Firestore, sem DOM — só transformação de
   dados, testável isoladamente (ver tests/audit-core-v1.test.mjs).
   ========================================================= */

export const RISCOS = ["low", "medium", "high", "critical"];
export const OPERACOES = ["create", "update", "delete", "action"];

export const RISCO_LABEL = Object.freeze({
    low: "Baixo",
    medium: "Médio",
    high: "Alto",
    critical: "Crítico"
});

export const OPERACAO_LABEL = Object.freeze({
    create: "Criação",
    update: "Atualização",
    delete: "Exclusão",
    action: "Ação"
});

export const MODULO_LABEL = Object.freeze({
    loja: "Loja",
    funcionarios: "Funcionários",
    pedidos: "Pedidos",
    produtos: "Produtos",
    crm: "CRM 360",
    leads: "Leads",
    atendimento: "Atendimento",
    templates: "Templates",
    vitrine: "Vitrine pública",
    "landing-pages": "Landing Pages",
    ia: "Central de IA",
    "base-conhecimento-ia": "Base de Conhecimento",
    tracking: "Central de Crescimento"
});

export const ATOR_TIPO_LABEL = Object.freeze({
    user: "Usuário",
    system: "Sistema",
    unauthenticated: "Visitante não autenticado",
    unknown: "Desconhecido"
});

export function rotuloRisco(risk) {
    return RISCO_LABEL[risk] || String(risk || "—");
}

export function rotuloOperacao(operation) {
    return OPERACAO_LABEL[operation] || String(operation || "—");
}

export function rotuloModulo(module) {
    return MODULO_LABEL[module] || String(module || "—");
}

export function rotuloAtor(actorType) {
    return ATOR_TIPO_LABEL[actorType] || "Desconhecido";
}

// Aceita Date, número (ms) ou objeto com toDate() (Firestore Timestamp) —
// nunca lança, devolve "—" se não conseguir interpretar.
export function paraData(valor) {
    if (!valor) return null;
    if (valor instanceof Date) return valor;
    if (typeof valor.toDate === "function") {
        try {
            return valor.toDate();
        } catch {
            return null;
        }
    }
    if (typeof valor === "number") return new Date(valor);
    if (typeof valor === "string") {
        const parsed = new Date(valor);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
}

export function formatarDataHora(valor) {
    const data = paraData(valor);
    if (!data) return "—";
    try {
        return data.toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    } catch {
        return data.toISOString();
    }
}

export function truncarUid(uid) {
    const texto = String(uid || "");
    if (texto.length <= 12) return texto || "—";
    return `${texto.slice(0, 6)}…${texto.slice(-4)}`;
}

function normalizarBusca(texto) {
    return String(texto || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

// Filtro 100% local sobre a página já carregada (nunca substitui a query
// do servidor — é só o campo de busca por texto livre da mission).
export function filtrarEventosLocal(eventos, termo) {
    const alvo = normalizarBusca(termo);
    if (!alvo) return Array.isArray(eventos) ? eventos : [];
    return (Array.isArray(eventos) ? eventos : []).filter((evento) => {
        const campos = [evento?.summary, evento?.entityId, evento?.action, evento?.module, evento?.entityType];
        return campos.some((campo) => normalizarBusca(campo).includes(alvo));
    });
}

function achatarParaCsv(valor) {
    if (valor === null || valor === undefined) return "";
    if (typeof valor === "object") {
        try {
            return JSON.stringify(valor);
        } catch {
            return "";
        }
    }
    return String(valor);
}

function escaparCampoCsv(valor) {
    const texto = achatarParaCsv(valor);
    if (/[",\n;]/.test(texto)) {
        return `"${texto.replace(/"/g, '""')}"`;
    }
    return texto;
}

const COLUNAS_EXPORTACAO = [
    "eventId", "createdAtIso", "module", "entityType", "entityId",
    "operation", "action", "risk", "summary", "actorType", "actorUid",
    "changedFields"
];

// createdAt pode ser Firestore Timestamp — normaliza pra ISO string antes
// de virar linha, tanto no CSV quanto no JSON exportado.
function normalizarEventoParaExportacao(evento) {
    const data = paraData(evento?.createdAt);
    return {
        eventId: evento?.eventId || "",
        createdAtIso: data ? data.toISOString() : "",
        module: evento?.module || "",
        entityType: evento?.entityType || "",
        entityId: evento?.entityId || "",
        operation: evento?.operation || "",
        action: evento?.action || "",
        risk: evento?.risk || "",
        summary: evento?.summary || "",
        actorType: evento?.actorType || "",
        actorUid: evento?.actorUid || "",
        changedFields: Array.isArray(evento?.changedFields) ? evento.changedFields.join("|") : ""
    };
}

export const LIMITE_EXPORTACAO = 1000;

export function eventosParaCsv(eventos) {
    const lista = (Array.isArray(eventos) ? eventos : []).slice(0, LIMITE_EXPORTACAO);
    const linhas = [COLUNAS_EXPORTACAO.join(",")];
    for (const evento of lista) {
        const normalizado = normalizarEventoParaExportacao(evento);
        linhas.push(COLUNAS_EXPORTACAO.map((coluna) => escaparCampoCsv(normalizado[coluna])).join(","));
    }
    return linhas.join("\n");
}

export function eventosParaJson(eventos) {
    const lista = (Array.isArray(eventos) ? eventos : []).slice(0, LIMITE_EXPORTACAO);
    return JSON.stringify(lista.map(normalizarEventoParaExportacao), null, 2);
}

// KPIs derivados de uma janela de eventos já carregada (ex.: eventos do
// dia corrente, limitados). Não é uma agregação de servidor — é uma
// aproximação honesta sobre o que já está na tela/na janela consultada.
export function calcularKpis(eventos) {
    const lista = Array.isArray(eventos) ? eventos : [];
    const atores = new Set();
    const modulos = new Set();
    let altoRisco = 0;
    for (const evento of lista) {
        if (evento?.actorUid) atores.add(evento.actorUid);
        if (evento?.module) modulos.add(evento.module);
        if (evento?.risk === "high" || evento?.risk === "critical") altoRisco += 1;
    }
    return {
        eventosHoje: lista.length,
        altoRisco,
        atoresAtivos: atores.size,
        modulosAlterados: modulos.size
    };
}

export function ehMesmoDia(valor, referencia = new Date()) {
    const data = paraData(valor);
    if (!data) return false;
    return data.getFullYear() === referencia.getFullYear()
        && data.getMonth() === referencia.getMonth()
        && data.getDate() === referencia.getDate();
}
