/* =========================================================
   VIDE HUB — CENTRAL DE AUDITORIA V1
   Funções puras de apresentação: rótulos, formatação de data/UID,
   filtro local, exportação CSV/JSON e KPIs derivados de uma lista de
   eventos já carregada. Sem Firestore, sem DOM — só transformação de
   dados, testável isoladamente (ver tests/audit-core-v1.test.mjs).
   ========================================================= */

export const RISCOS = ["low", "medium", "high", "critical"];
export const OPERACOES = ["create", "update", "delete", "action"];
export const ORIGENS = [
    "firestore-trigger",
    "function",
    "ai-function",
    "admin-function",
    "public-function",
    "system"
];

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
    tracking: "Central de Crescimento",
    whatsapp: "WhatsApp Oficial",
    admin: "Administração"
});

export const ORIGEM_LABEL = Object.freeze({
    "firestore-trigger": "Gatilho do Firestore",
    function: "Cloud Function",
    "ai-function": "Função de IA",
    "admin-function": "Função administrativa",
    "public-function": "Função pública",
    system: "Sistema"
});

export const ATOR_TIPO_LABEL = Object.freeze({
    user: "Usuário",
    system: "Sistema",
    unauthenticated: "Visitante não autenticado",
    unknown: "Desconhecido"
});

// Camada exclusivamente visual. Os valores persistidos em `action`,
// `entityType` e `changedFields` continuam intactos e seguem disponíveis no
// drawer/exportação para investigação técnica.
export const ACAO_LABEL = Object.freeze({
    "pedido.criado": "Pedido criado",
    "pedido.excluido": "Pedido excluído",
    "pedido.status_alterado": "Status do pedido alterado",
    "pedido.pagamento_alterado": "Status do pagamento alterado",
    "pedido.valores_alterados": "Valores do pedido alterados",
    "pedido.atualizado": "Pedido atualizado",
    "lead.criado": "Lead criado",
    "lead.excluido": "Lead excluído",
    "lead.status_alterado": "Status do lead alterado",
    "lead.responsavel_alterado": "Responsável pelo lead alterado",
    "lead.arquivado": "Lead arquivado",
    "lead.movido_para_lixeira": "Lead movido para a lixeira",
    "lead.atualizado": "Lead atualizado",
    "produto.criado": "Produto criado",
    "produto.excluido": "Produto excluído",
    "produto.preco_alterado": "Preço do produto alterado",
    "produto.status_alterado": "Status do produto alterado",
    "produto.atualizado": "Produto atualizado",
    "funcionario.permissoes_alteradas": "Permissões do funcionário alteradas",
    "funcionario.desativado": "Funcionário desativado",
    "funcionario.reativado": "Funcionário reativado",
    "cliente.etapa_alterada": "Etapa do cliente alterada",
    "chat.atribuicao_alterada": "Atribuição do atendimento alterada",
    "chat.status_alterado": "Status do atendimento alterado",
    "loja.plano_alterado": "Plano da loja alterado",
    "loja.status_alterado": "Status da loja alterado"
});

export const CAMPO_LABEL = Object.freeze({
    status: "Status",
    statusPedido: "Status do pedido",
    pedidoStatus: "Status do pedido",
    statusPagamento: "Status do pagamento",
    pagamentoStatus: "Status do pagamento",
    statusLead: "Status do lead",
    pipelineStage: "Etapa do pipeline",
    pedidoHistorico: "Histórico do pedido",
    pedidoAtualizadoEm: "Pedido atualizado em",
    historico: "Histórico",
    tipoRecebimento: "Tipo de recebimento",
    statusProduto: "Status do produto",
    freteGratis: "Frete grátis",
    preco: "Preço",
    precoDe: "Preço de referência",
    estoque: "Estoque",
    nome: "Nome",
    tipo: "Tipo",
    subnicho: "Subnicho",
    subtotal: "Subtotal",
    desconto: "Desconto",
    frete: "Frete",
    total: "Total",
    valor: "Valor",
    prazoEntrega: "Prazo de entrega",
    arquivado: "Arquivado",
    lixeira: "Na lixeira",
    ativo: "Ativo",
    publicado: "Publicado"
});

export const ENTIDADE_LABEL = Object.freeze({
    pedido: "Pedido",
    produto: "Produto",
    lead: "Lead",
    cliente: "Cliente",
    funcionario: "Funcionário",
    loja: "Loja",
    chat: "Atendimento",
    template: "Template",
    vitrine_publica: "Vitrine pública",
    landing_page: "Landing Page",
    landing_page_publica: "Landing Page pública",
    configuracao_ia: "Configuração de IA",
    item_conhecimento: "Item de conhecimento",
    tracking_config: "Configuração de tracking",
    tracking_link: "Link de tracking"
});

const CAMPOS_ENUM = new Set([
    "status", "statusPedido", "pedidoStatus", "statusPagamento", "pagamentoStatus",
    "statusLead", "pipelineStage", "statusProduto", "tipoRecebimento", "tipo"
]);

const VALOR_ENUM_LABEL = Object.freeze({
    aguardando: "Aguardando",
    novo: "Novo",
    confirmado: "Confirmado",
    em_producao: "Em produção",
    pronto: "Pronto",
    enviado: "Enviado",
    entregue: "Entregue",
    cancelado: "Cancelado",
    pendente: "Pendente",
    parcial: "Parcial",
    pago: "Pago",
    reembolsado: "Reembolsado",
    em_contato: "Em contato",
    qualificado: "Qualificado",
    proposta: "Proposta",
    convertido: "Convertido",
    perdido: "Perdido",
    ativo: "Ativo",
    rascunho: "Rascunho",
    retirada: "Retirada",
    entrega: "Entrega",
    fisico: "Físico",
    digital: "Digital"
});

function humanizarIdentificador(valor) {
    const texto = String(valor || "").split(".").pop()
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/[_-]+/g, " ")
        .trim();
    return texto ? `${texto.charAt(0).toUpperCase()}${texto.slice(1)}` : "—";
}

export function rotuloAcaoAuditoria(action) {
    return ACAO_LABEL[action] || humanizarIdentificador(action);
}

export function rotuloCampoAuditoria(campo) {
    return CAMPO_LABEL[campo] || humanizarIdentificador(campo);
}

export function rotuloEntidadeAuditoria(entityType) {
    return ENTIDADE_LABEL[entityType] || humanizarIdentificador(entityType);
}

export function formatarValorAuditoria(valor, campo = "") {
    if (valor === undefined) return "Ausente";
    if (valor === null) return "Nulo";
    if (typeof valor === "boolean") return valor ? "Sim" : "Não";
    if (typeof valor === "number") return Number.isFinite(valor) ? String(valor) : "Número inválido";
    if (typeof valor === "string") {
        if (CAMPOS_ENUM.has(campo) && VALOR_ENUM_LABEL[valor]) return VALOR_ENUM_LABEL[valor];
        return valor;
    }
    try {
        return JSON.stringify(valor);
    } catch {
        return "[valor indisponível]";
    }
}

function valoresIguaisAuditoria(antes, depois) {
    if (Object.is(antes, depois)) return true;
    try {
        return JSON.stringify(antes) === JSON.stringify(depois);
    } catch {
        return false;
    }
}

// O diff usa somente `before`/`after` já sanitizados pelo backend. Campos que
// a allowlist/blocklist removeu não podem reaparecer por esta função.
export function derivarAlteracoesAuditoria(before, after) {
    const anterior = before && typeof before === "object" && !Array.isArray(before) ? before : {};
    const posterior = after && typeof after === "object" && !Array.isArray(after) ? after : {};
    const campos = new Set([...Object.keys(anterior), ...Object.keys(posterior)]);
    const alteracoes = [];
    for (const campo of campos) {
        const valorAntes = Object.prototype.hasOwnProperty.call(anterior, campo) ? anterior[campo] : undefined;
        const valorDepois = Object.prototype.hasOwnProperty.call(posterior, campo) ? posterior[campo] : undefined;
        if (valoresIguaisAuditoria(valorAntes, valorDepois)) continue;
        alteracoes.push({
            campo,
            rotulo: rotuloCampoAuditoria(campo),
            antes: valorAntes,
            depois: valorDepois,
            antesFormatado: formatarValorAuditoria(valorAntes, campo),
            depoisFormatado: formatarValorAuditoria(valorDepois, campo)
        });
    }
    return alteracoes;
}

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

export function rotuloOrigem(source) {
    return ORIGEM_LABEL[source] || String(source || "—");
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

export function criarFiltrosAuditoriaPadrao() {
    return {
        periodo: "7d",
        de: "",
        ate: "",
        busca: "",
        module: "",
        operation: "",
        risk: "",
        source: "",
        actor: "",
        entity: "",
        action: ""
    };
}

function contem(valor, termo) {
    return normalizarBusca(valor).includes(normalizarBusca(termo));
}

// Todos os filtros de coluna e a busca são combinados localmente sobre a
// janela já carregada. A query do servidor continua limitada por tenant e
// período, evitando uma explosão de índices compostos.
export function filtrarEventosPorFiltros(eventos, filtros = {}) {
    const lista = Array.isArray(eventos) ? eventos : [];
    return lista.filter((evento) => {
        if (filtros.module && evento?.module !== filtros.module) return false;
        if (filtros.operation && evento?.operation !== filtros.operation) return false;
        if (filtros.risk && evento?.risk !== filtros.risk) return false;
        if (filtros.source && evento?.source !== filtros.source) return false;
        if (filtros.actor && ![
            evento?.actorUid,
            evento?.actorType,
            rotuloAtor(evento?.actorType)
        ].some((valor) => contem(valor, filtros.actor))) return false;
        if (filtros.entity && ![
            evento?.entityId,
            evento?.entityType,
            rotuloEntidadeAuditoria(evento?.entityType)
        ].some((valor) => contem(valor, filtros.entity))) return false;
        if (filtros.action && ![
            evento?.action,
            rotuloAcaoAuditoria(evento?.action)
        ].some((valor) => contem(valor, filtros.action))) return false;

        const busca = normalizarBusca(filtros.busca);
        if (!busca) return true;
        const campos = [
            evento?.summary,
            evento?.entityId,
            evento?.entityType,
            rotuloEntidadeAuditoria(evento?.entityType),
            evento?.action,
            rotuloAcaoAuditoria(evento?.action),
            evento?.module,
            rotuloModulo(evento?.module),
            evento?.operation,
            rotuloOperacao(evento?.operation),
            evento?.source,
            rotuloOrigem(evento?.source),
            evento?.actorUid
        ];
        return campos.some((campo) => normalizarBusca(campo).includes(busca));
    });
}

export function contarFiltrosAtivos(filtros = {}) {
    const campos = ["module", "operation", "risk", "source", "actor", "entity", "action", "busca"];
    let total = campos.filter((campo) => String(filtros[campo] || "").trim()).length;
    if (filtros.periodo && filtros.periodo !== "7d") total += 1;
    return total;
}

// Compatibilidade com consumidores da busca livre V1.
export function filtrarEventosLocal(eventos, termo) {
    return filtrarEventosPorFiltros(eventos, { busca: termo });
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

// Excel/LibreOffice tratam células iniciadas por =, +, - ou @ como fórmula.
// Prefixar apóstrofo mantém o conteúdo como texto sem alterar o evento bruto.
export function protegerFormulaCsv(valor) {
    const texto = String(valor ?? "");
    return /^\s*[=+\-@]/.test(texto) ? `'${texto}` : texto;
}

function escaparCampoCsv(valor) {
    const texto = protegerFormulaCsv(achatarParaCsv(valor));
    if (/[",\n;]/.test(texto)) {
        return `"${texto.replace(/"/g, '""')}"`;
    }
    return texto;
}

const COLUNAS_EXPORTACAO = [
    "ID do evento", "Data/hora (ISO)", "Módulo", "Tipo de entidade", "ID da entidade",
    "Operação", "Ação", "Risco", "Origem", "Resumo", "Tipo de ator", "UID do ator",
    "Campos alterados"
];

// createdAt pode ser Firestore Timestamp — normaliza pra ISO string antes
// de virar linha, tanto no CSV quanto no JSON exportado.
function normalizarEventoParaExportacao(evento) {
    const data = paraData(evento?.createdAt);
    return {
        "ID do evento": evento?.eventId || evento?._docId || "",
        "Data/hora (ISO)": data ? data.toISOString() : "",
        "Módulo": rotuloModulo(evento?.module),
        "Tipo de entidade": evento?.entityType || "",
        "ID da entidade": evento?.entityId || "",
        "Operação": rotuloOperacao(evento?.operation),
        "Ação": evento?.action || "",
        "Risco": rotuloRisco(evento?.risk),
        "Origem": rotuloOrigem(evento?.source),
        "Resumo": evento?.summary || "",
        "Tipo de ator": rotuloAtor(evento?.actorType),
        "UID do ator": evento?.actorUid || "",
        "Campos alterados": Array.isArray(evento?.changedFields) ? evento.changedFields.join("|") : ""
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
