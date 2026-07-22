// Central de Atendimento — evolução das coleções chats/mensagens já
// existentes (widget público da loja + painel de leads). Plano Blaze, mas
// escrita continua direta do cliente protegida pelas Rules: não há
// segredo, integração externa nem privilégio administrativo aqui — só
// autoria real (derivada do login) e transições de status validadas dos
// dois lados (app + firestore.rules).

import {
    CATEGORIAS_TEMPLATE_ATENDIMENTO, LIMITES_TEMPLATE_ATENDIMENTO, VARIAVEIS_TEMPLATE_ATENDIMENTO,
    categoriaTemplateAtendimento, rotuloCategoriaTemplate, normalizarAtalho, atalhoJaEmUso,
    substituirVariaveisTemplate, resolverVariaveisTemplate, validarTemplateAtendimentoAvancado,
    filtrarTemplatesAtendimento, ordenarTemplatesAtendimento, templatesRecentementeUsados,
    templatesMaisUsados, sugerirTemplatesPorAtalho, pedidoVinculadoIdDaConversa,
    variaveisUsadasNoTexto, contemVariavelNaoResolvida
} from "./templates-atendimento.js";

export const STATUS_CONVERSA = Object.freeze({
    nova: "Nova",
    aberta: "Aberta",
    aguardando_cliente: "Aguardando cliente",
    aguardando_equipe: "Aguardando equipe",
    resolvida: "Resolvida",
    arquivada: "Arquivada"
});

// Espelha as transições aceitas por statusConversaValido()/chatAdminUpdateValido()
// em firestore.rules — a rule só valida o ENUM final, quem garante que o
// CAMINHO faz sentido é o app dos dois lados (aqui e no controller).
export const TRANSICOES_STATUS = Object.freeze({
    nova: Object.freeze(["aberta", "arquivada"]),
    aberta: Object.freeze(["aguardando_cliente", "aguardando_equipe", "resolvida", "arquivada"]),
    aguardando_cliente: Object.freeze(["aguardando_equipe", "aberta", "resolvida", "arquivada"]),
    aguardando_equipe: Object.freeze(["aguardando_cliente", "aberta", "resolvida", "arquivada"]),
    resolvida: Object.freeze(["aberta", "arquivada"]),
    arquivada: Object.freeze(["aberta"])
});

export function podeTransicionarStatus(statusAtual, novoStatus) {
    if (!(novoStatus in STATUS_CONVERSA)) return false;
    if (!statusAtual) return true;
    if (statusAtual === novoStatus) return false;
    return (TRANSICOES_STATUS[statusAtual] || []).includes(novoStatus);
}

// ===== Histórico de eventos da conversa (chats/{chatId}/eventos) =====
// Enum fechado — nunca dois eventos equivalentes para a mesma ação (ex.:
// uma transferência gera só "conversa_transferida", não também
// "responsavel_atribuido"). Cada tipo pertence a exatamente uma categoria,
// usada pelo filtro da timeline (Fase 6: mensagens/atendimento/vinculos/alteracoes).
export const TIPOS_EVENTO_ATENDIMENTO = Object.freeze({
    conversa_criada: "Conversa criada",
    conversa_aberta: "Conversa aberta",
    conversa_resolvida: "Conversa resolvida",
    conversa_reaberta: "Conversa reaberta",
    conversa_arquivada: "Conversa arquivada",
    conversa_restaurada: "Conversa restaurada",
    conversa_priorizada: "Conversa marcada como prioridade",
    prioridade_removida: "Prioridade removida",
    mensagem_cliente_recebida: "Mensagem do cliente recebida",
    mensagem_equipe_enviada: "Resposta da equipe enviada",
    mensagem_envio_falhou: "Falha ao enviar mensagem",
    cliente_respondeu_apos_resolucao: "Cliente respondeu após a resolução",
    primeira_resposta_equipe: "Primeira resposta da equipe",
    status_alterado: "Status alterado",
    aguardando_cliente: "Aguardando resposta do cliente",
    aguardando_equipe: "Aguardando resposta da equipe",
    conversa_assumida: "Conversa assumida",
    responsavel_atribuido: "Responsável atribuído",
    conversa_transferida: "Conversa transferida",
    responsavel_removido: "Responsável removido",
    setor_alterado: "Setor alterado",
    tag_adicionada: "Tag adicionada",
    tag_removida: "Tag removida",
    observacao_interna_adicionada: "Observação interna adicionada",
    observacao_interna_atualizada: "Observação interna atualizada",
    cliente_vinculado: "Cliente vinculado",
    cliente_desvinculado: "Cliente desvinculado",
    lead_vinculado: "Lead vinculado",
    lead_desvinculado: "Lead desvinculado",
    pedido_vinculado: "Pedido vinculado",
    pedido_desvinculado: "Pedido desvinculado",
    produto_vinculado: "Produto de interesse vinculado",
    produto_desvinculado: "Produto de interesse desvinculado",
    template_utilizado: "Template utilizado",
    // Copiloto de IA (ia-copilot.js): só regista uso ou descarte de uma
    // sugestão — nunca cada geração (isso roda em memória, sem escrita).
    ia_sugestao_usada: "Sugestão de IA usada",
    ia_sugestao_descartada: "Sugestão de IA descartada"
});

const CATEGORIA_POR_TIPO_EVENTO = Object.freeze({
    mensagem_cliente_recebida: "mensagens",
    mensagem_equipe_enviada: "mensagens",
    mensagem_envio_falhou: "mensagens",
    cliente_respondeu_apos_resolucao: "mensagens",
    primeira_resposta_equipe: "mensagens",
    conversa_criada: "atendimento",
    conversa_aberta: "atendimento",
    conversa_resolvida: "atendimento",
    conversa_reaberta: "atendimento",
    conversa_arquivada: "atendimento",
    conversa_restaurada: "atendimento",
    conversa_priorizada: "atendimento",
    prioridade_removida: "atendimento",
    status_alterado: "atendimento",
    aguardando_cliente: "atendimento",
    aguardando_equipe: "atendimento",
    conversa_assumida: "atendimento",
    responsavel_atribuido: "atendimento",
    conversa_transferida: "atendimento",
    responsavel_removido: "atendimento",
    cliente_vinculado: "vinculos",
    cliente_desvinculado: "vinculos",
    lead_vinculado: "vinculos",
    lead_desvinculado: "vinculos",
    pedido_vinculado: "vinculos",
    pedido_desvinculado: "vinculos",
    produto_vinculado: "vinculos",
    produto_desvinculado: "vinculos",
    template_utilizado: "vinculos",
    setor_alterado: "alteracoes",
    tag_adicionada: "alteracoes",
    tag_removida: "alteracoes",
    observacao_interna_adicionada: "alteracoes",
    observacao_interna_atualizada: "alteracoes",
    ia_sugestao_usada: "ia",
    ia_sugestao_descartada: "ia"
});

export const CATEGORIAS_EVENTO_ATENDIMENTO = Object.freeze({
    mensagens: "Mensagens",
    atendimento: "Atendimento",
    vinculos: "Vínculos",
    alteracoes: "Alterações internas",
    ia: "Copiloto de IA"
});

export function categoriaEventoAtendimento(tipo) {
    return CATEGORIA_POR_TIPO_EVENTO[tipo] || "alteracoes";
}

export function tipoEventoValido(tipo) {
    return tipo in TIPOS_EVENTO_ATENDIMENTO;
}

export const LIMITES_EVENTO_ATENDIMENTO = Object.freeze({
    resumoMax: 300,
    dadosChavesMax: 6,
    dadosTamanhoMax: 500,
    VERSAO_SCHEMA: 1
});

// Só as chaves conhecidas — "dados" nunca vira um payload arbitrário nem
// substitui os campos principais do evento.
const CHAVES_DADOS_PERMITIDAS = Object.freeze([
    "quantidade", "motivo", "canal", "duracaoMs", "origemDispositivo", "detalhe"
]);

export function validarPayloadDadosEvento(dados) {
    if (dados === undefined || dados === null) return "";
    if (typeof dados !== "object" || Array.isArray(dados)) return "O campo dados precisa ser um objeto simples.";
    const chaves = Object.keys(dados);
    if (chaves.length > LIMITES_EVENTO_ATENDIMENTO.dadosChavesMax) return "O campo dados tem chaves demais.";
    if (chaves.some(chave => !CHAVES_DADOS_PERMITIDAS.includes(chave))) return "O campo dados só aceita chaves conhecidas.";
    if (JSON.stringify(dados).length > LIMITES_EVENTO_ATENDIMENTO.dadosTamanhoMax) return "O campo dados é grande demais.";
    return "";
}

// Uma transferência gera só "conversa_transferida" (nunca também
// "responsavel_atribuido") — ver Fase 3. "Assumir" (autor vira o próprio
// responsável) é distinto de "atribuir a outra pessoa".
export function classificarEventoAtribuicao({ anteriorUid = "", novoUid = "", autorUid = "" } = {}) {
    const anterior = String(anteriorUid || "").trim();
    const novo = String(novoUid || "").trim();
    if (anterior === novo) return null;
    if (!novo) return "responsavel_removido";
    if (!anterior) return novo === autorUid ? "conversa_assumida" : "responsavel_atribuido";
    return "conversa_transferida";
}

// Cada transição de status mapeia pra exatamente um tipo específico —
// não existe também um "status_alterado" genérico pras mesmas transições
// (ver Fase 11: escolhido o padrão de eventos específicos; "status_alterado"
// fica só como fallback pra uma transição que não se encaixe em nenhum caso).
export function classificarEventoStatus({ statusAnterior = "", statusNovo = "" } = {}) {
    if (statusAnterior === statusNovo) return null;
    if (statusNovo === "resolvida") return "conversa_resolvida";
    if (statusNovo === "arquivada") return "conversa_arquivada";
    if (statusNovo === "aguardando_cliente") return "aguardando_cliente";
    if (statusNovo === "aguardando_equipe") return "aguardando_equipe";
    if (statusNovo === "aberta") {
        if (statusAnterior === "arquivada") return "conversa_restaurada";
        if (statusAnterior === "resolvida") return "conversa_reaberta";
        return "conversa_aberta";
    }
    return "status_alterado";
}

// ===== Métricas preparatórias (Fase 9) =====
// Derivadas do histórico de eventos já carregado — não são campos
// agregados gravados no chat. O documento chats/{chatId} já tem uma regra
// de update grande (acumulada de 3 fases), e adicionar mais campos
// validados nela esbarra no limite real de complexidade de avaliação do
// Firestore Rules ("maximum of 1000 expressions to evaluate", confirmado
// empiricamente). Calcular a partir dos eventos evita essa fragilidade e
// mantém uma única fonte de verdade (o histórico bruto).
function eventoMs(evento) {
    const valor = evento?.criadoEm;
    if (valor?.toMillis) return valor.toMillis();
    if (typeof valor?.seconds === "number") return valor.seconds * 1000;
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : 0;
}

export function calcularMetricasAtendimento(eventos) {
    const lista = Array.isArray(eventos) ? eventos : [];
    const ordenados = [...lista].sort((a, b) => eventoMs(a) - eventoMs(b));

    const primeiraMensagemCliente = ordenados.find(e => e.tipo === "mensagem_cliente_recebida");
    const primeiraRespostaEquipe = ordenados.find(e => e.tipo === "primeira_resposta_equipe" || e.tipo === "mensagem_equipe_enviada");
    const ultimaResolucao = [...ordenados].reverse().find(e => e.tipo === "conversa_resolvida");

    const primeiraMensagemClienteEm = primeiraMensagemCliente ? eventoMs(primeiraMensagemCliente) : null;
    const primeiraRespostaEquipeEm = primeiraRespostaEquipe ? eventoMs(primeiraRespostaEquipe) : null;
    const primeiraRespostaMs = (primeiraMensagemClienteEm && primeiraRespostaEquipeEm && primeiraRespostaEquipeEm >= primeiraMensagemClienteEm)
        ? primeiraRespostaEquipeEm - primeiraMensagemClienteEm
        : null;

    return {
        primeiraMensagemClienteEm,
        primeiraRespostaEquipeEm,
        primeiraRespostaMs,
        resolvidaEm: ultimaResolucao ? eventoMs(ultimaResolucao) : null,
        quantidadeTransferencias: ordenados.filter(e => e.tipo === "conversa_transferida").length,
        quantidadeReaberturas: ordenados.filter(e => e.tipo === "conversa_reaberta" || e.tipo === "conversa_restaurada").length,
        quantidadeMensagensCliente: ordenados.filter(e => e.tipo === "mensagem_cliente_recebida").length,
        quantidadeMensagensEquipe: ordenados.filter(e => e.tipo === "mensagem_equipe_enviada").length,
        templatesUtilizados: ordenados.filter(e => e.tipo === "template_utilizado").length
    };
}

// "Prioridade" também é derivada do último evento conversa_priorizada/
// prioridade_removida — sem campo próprio no chat (mesma razão acima).
export function conversaEstaPriorizada(eventos) {
    const lista = Array.isArray(eventos) ? eventos : [];
    const relevantes = lista.filter(e => e.tipo === "conversa_priorizada" || e.tipo === "prioridade_removida");
    if (relevantes.length === 0) return false;
    const ultimo = [...relevantes].sort((a, b) => eventoMs(a) - eventoMs(b)).pop();
    return ultimo?.tipo === "conversa_priorizada";
}

// Frase pronta pra exibir na timeline — nunca mostra id técnico, só nome
// derivado da autoria real e, quando existir, o rótulo do que mudou.
export function descreverEventoAtendimento(evento) {
    const autor = evento?.autorNome || "Alguém";
    switch (evento?.tipo) {
        case "conversa_criada": return "Conversa criada.";
        case "conversa_aberta": return "Conversa aberta.";
        case "conversa_resolvida": return `Conversa resolvida por ${autor}.`;
        case "conversa_reaberta": return "Cliente respondeu após a resolução. A conversa foi reaberta.";
        case "conversa_arquivada": return `Conversa arquivada por ${autor}.`;
        case "conversa_restaurada": return `Conversa restaurada por ${autor}.`;
        case "conversa_priorizada": return `${autor} marcou esta conversa como prioridade.`;
        case "prioridade_removida": return `${autor} removeu a prioridade desta conversa.`;
        case "mensagem_cliente_recebida": return "Cliente enviou uma mensagem.";
        case "mensagem_equipe_enviada": return `${autor} respondeu.`;
        case "mensagem_envio_falhou": return "Falha ao enviar uma mensagem.";
        case "cliente_respondeu_apos_resolucao": return "Cliente respondeu após a resolução.";
        case "primeira_resposta_equipe": return `${autor} deu a primeira resposta.`;
        case "status_alterado": return `Status alterado de ${STATUS_CONVERSA[evento.statusAnterior] || evento.statusAnterior} para ${STATUS_CONVERSA[evento.statusNovo] || evento.statusNovo}.`;
        case "aguardando_cliente": return "Conversa aguardando resposta do cliente.";
        case "aguardando_equipe": return "Conversa aguardando resposta da equipe.";
        case "conversa_assumida": return `${autor} assumiu esta conversa.`;
        case "responsavel_atribuido": return `${autor} atribuiu a conversa para ${evento.responsavelNovoNome || "alguém"}.`;
        case "conversa_transferida": return `${autor} transferiu a conversa${evento.responsavelAnteriorNome ? ` de ${evento.responsavelAnteriorNome}` : ""} para ${evento.responsavelNovoNome || "alguém"}.`;
        case "responsavel_removido": return `${autor} removeu o responsável desta conversa.`;
        case "setor_alterado": return `Setor alterado${evento.setorAnterior ? ` de ${evento.setorAnterior}` : ""} para ${evento.setorNovo || "—"}.`;
        case "tag_adicionada": return `${autor} adicionou uma tag.`;
        case "tag_removida": return `${autor} removeu uma tag.`;
        case "observacao_interna_adicionada": return `${autor} adicionou uma observação interna.`;
        case "observacao_interna_atualizada": return `${autor} atualizou uma observação interna.`;
        case "cliente_vinculado": return `${autor} vinculou esta conversa a um cliente do CRM.`;
        case "cliente_desvinculado": return `${autor} desvinculou o cliente desta conversa.`;
        case "lead_vinculado": return `${autor} vinculou um lead.`;
        case "lead_desvinculado": return `${autor} desvinculou um lead.`;
        case "pedido_vinculado": return `${autor} vinculou um pedido.`;
        case "pedido_desvinculado": return `${autor} desvinculou um pedido.`;
        case "produto_vinculado": return `${autor} vinculou um produto de interesse.`;
        case "produto_desvinculado": return `${autor} desvinculou um produto de interesse.`;
        case "template_utilizado": return `Template "${evento.templateTitulo || "sem título"}" utilizado por ${autor}.`;
        case "ia_sugestao_usada": return `${autor} usou uma sugestão do copiloto de IA${evento.resumo ? ` (${evento.resumo})` : ""}.`;
        case "ia_sugestao_descartada": return `${autor} descartou uma sugestão do copiloto de IA.`;
        default: return TIPOS_EVENTO_ATENDIMENTO[evento?.tipo] || "Evento registrado.";
    }
}

export const CANAIS_CONVERSA = Object.freeze({
    loja_publica: "Loja pública",
    interno: "Interno",
    whatsapp_futuro: "WhatsApp (futuro)"
});

// Modelo, categorias, variáveis e validação de templates evoluíram pra um
// módulo próprio (Fase "Templates Avançados de Atendimento") — ver
// templates-atendimento.js. CATEGORIAS_TEMPLATE/VARIAVEIS_TEMPLATE_PERMITIDAS/
// substituirVariaveisTemplate/validarTemplateAtendimento/filtrarTemplates
// (o vocabulário de 4 variáveis e 9 categorias original) saíram daqui —
// nada mais neste repositório os importava além deste próprio arquivo e
// seus testes, então a evolução ficou só no módulo novo, sem duplicar.

export const LIMITES_ATENDIMENTO = Object.freeze({
    mensagemMax: 4000,
    setorMax: 80,
    observacoesMax: 2000,
    maxTags: 10
});

function normalizarMs(valor) {
    if (!valor) return 0;
    if (typeof valor.toMillis === "function") return valor.toMillis();
    if (typeof valor.seconds === "number") return valor.seconds * 1000;
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : 0;
}

export const LIMITES_TIMELINE_ATENDIMENTO = Object.freeze({
    paginaMensagens: 50,
    paginaEventos: 50
});

export function mesclarDocumentosTimeline(atuais, novos) {
    const mapa = new Map();
    for (const item of atuais || []) {
        if (item?.id) mapa.set(item.id, item);
    }
    for (const item of novos || []) {
        if (item?.id) mapa.set(item.id, item);
    }
    return Array.from(mapa.values());
}

export function mesclarItensTimeline({
    mensagens = [],
    eventos = [],
    mostrarEventos = true,
    filtroCategoria = "todos"
} = {}) {
    const eventosVisiveis = mostrarEventos
        ? (eventos || []).filter(e => filtroCategoria === "todos" || categoriaEventoAtendimento(e.tipo) === filtroCategoria)
        : [];
    return [
        ...(mensagens || []).map(m => ({ tipoItem: "mensagem", ms: normalizarMs(m.timestamp), dado: m })),
        ...eventosVisiveis.map(e => ({ tipoItem: "evento", ms: eventoMs(e), dado: e }))
    ].sort((a, b) => a.ms - b.ms);
}

export function timestampConversaMs(conversa) {
    return normalizarMs(conversa?.atualizadoEm || conversa?.timestamp || conversa?.criadoEm);
}

export function conversaPrecisaResposta(conversa) {
    return conversa?.status === "nova" || conversa?.status === "aguardando_equipe"
        || (Number(conversa?.naoLidasLoja) || 0) > 0;
}

export function iniciaisNome(nome) {
    const partes = String(nome || "").trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return "?";
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

export function filtrarConversas(conversas, {
    busca = "",
    status = "todas",
    canal = "todos",
    apenasMinhas = false,
    apenasSemResponsavel = false,
    authUid = ""
} = {}) {
    const termo = String(busca || "").trim().toLowerCase();
    return (conversas || []).filter(conversa => {
        if (status !== "todas" && conversa.status !== status) return false;
        if (canal !== "todos" && conversa.canal !== canal) return false;
        if (apenasMinhas && conversa.atribuidoPara !== authUid) return false;
        if (apenasSemResponsavel && conversa.atribuidoPara) return false;
        if (!termo) return true;
        const texto = [conversa.clienteNome, conversa.ultimaMensagem, conversa.setor].join(" ").toLowerCase();
        return texto.includes(termo);
    });
}

export function ordenarConversas(conversas) {
    return [...(conversas || [])].sort((a, b) => timestampConversaMs(b) - timestampConversaMs(a));
}

export function calcularContadoresAtendimento(conversas, { authUid = "" } = {}) {
    const lista = conversas || [];
    const inicioHoje = new Date();
    inicioHoje.setHours(0, 0, 0, 0);
    const hojeMs = inicioHoje.getTime();

    return {
        novas: lista.filter(c => c.status === "nova").length,
        abertas: lista.filter(c => c.status === "aberta").length,
        naoLidas: lista.filter(c => (Number(c.naoLidasLoja) || 0) > 0).length,
        aguardandoEquipe: lista.filter(c => c.status === "aguardando_equipe").length,
        minhasConversas: authUid ? lista.filter(c => c.atribuidoPara === authUid).length : 0,
        resolvidasHoje: lista.filter(c => c.status === "resolvida" && normalizarMs(c.statusAtualizadoEm) >= hojeMs).length
    };
}

// Pré-checagem client-side (a Rules revalida tudo do lado do servidor):
// só oferece atribuir a um funcionário ativo do próprio tenant com
// permissão em atendimento ou leads — nunca a um uid arbitrário.
export function funcionarioPodeAtender(funcionario) {
    if (!funcionario || funcionario.status !== "ativo") return false;
    const ver = Array.isArray(funcionario.permissoes?.ver) ? funcionario.permissoes.ver : [];
    const editar = Array.isArray(funcionario.permissoes?.editar) ? funcionario.permissoes.editar : [];
    const alias = ["atendimento", "conversas", "atendimento_chat", "templates_atendimento", "leads", "crm"];
    return alias.some(chave => ver.includes(chave) || editar.includes(chave));
}

export function funcionariosElegiveisAtendimento(funcionarios) {
    return (funcionarios || []).filter(funcionarioPodeAtender);
}

function escaparHtml(valor) {
    return String(valor ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function codigoErroFirebase(error) {
    return String(error?.code || "").trim().toLowerCase().replace(/^firestore\//, "");
}

function tempoRelativo(ms) {
    if (!ms) return "";
    const diffSeg = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    if (diffSeg < 60) return "agora";
    const diffMin = Math.floor(diffSeg / 60);
    if (diffMin < 60) return `há ${diffMin} min`;
    const diffHoras = Math.floor(diffMin / 60);
    if (diffHoras < 24) return `há ${diffHoras} h`;
    const diffDias = Math.floor(diffHoras / 24);
    if (diffDias < 7) return `há ${diffDias} d`;
    return new Date(ms).toLocaleDateString("pt-BR");
}

// Preferência só de exibição (filtro/mostrar-ocultar da timeline) — nunca
// vai pro documento do chat, só localStorage do próprio navegador.
function lerPreferenciaLocal(chave, padrao) {
    try {
        const bruto = window.localStorage?.getItem(chave);
        if (bruto === null || bruto === undefined) return padrao;
        return JSON.parse(bruto);
    } catch (e) {
        return padrao;
    }
}

function salvarPreferenciaLocal(chave, valor) {
    try {
        window.localStorage?.setItem(chave, JSON.stringify(valor));
    } catch (e) { /* localStorage indisponível: só não persiste */ }
}

// Controller da tela — recebe dependências (db, contexto autenticado,
// funções do SDK e notificador) pra ficar testável sem navegador real,
// no mesmo formato de central-ia.js / base-conhecimento-ia.js.
export function criarAtendimentoController(deps) {
    const { db, context, firestore, notify = () => {}, onAbrirDadosCliente = () => {} } = deps;
    const {
        collection, doc, getDoc, getDocs, setDoc, query, where, orderBy, limit, startAfter,
        serverTimestamp, onSnapshot, writeBatch, increment
    } = firestore;

    const state = {
        conversas: [],
        eventos: [],
        eventosCarregando: false,
        eventosErro: false,
        eventosCursorAntigo: null,
        temMaisEventos: false,
        unsubscribeEventos: null,
        templateUsadoId: "",
        templateUsadoTitulo: "",
        alterandoStatus: false,
        atribuindo: false,
        carregado: false,
        carregando: false,
        erro: false,
        conversaSelecionadaId: "",
        mensagens: [],
        mensagensCarregando: false,
        mensagensErro: false,
        mensagensCursorAntigo: null,
        temMaisMensagens: false,
        historicoAnteriorCarregando: false,
        historicoAnteriorErro: false,
        funcionarios: [],
        templates: [],
        templatesCarregando: false,
        // Filtro/aba do seletor de templates do compositor (não confundir
        // com o filtro de conversas acima) — só estado de UI, não persiste.
        templatesFiltro: { busca: "", categoria: "todas", aba: "todos" },
        // Pendências da última inserção de template no compositor — usado
        // pro aviso "variável pendente" e pra bloquear o envio enquanto o
        // texto ainda tiver {{variavel}} literal (Fase 7 do mandato).
        templatePendencias: [],
        pedidoVinculadoCache: null,
        pedidoVinculadoCacheId: "",
        atalhoSugestoes: [],
        // Gestão de templates (Fase 8: criar/editar/duplicar/arquivar).
        gestaoTemplates: { aberta: false, editandoId: "", salvando: false, erro: "" },
        filtro: { busca: "", status: "todas", canal: "todos", apenasMinhas: false, apenasSemResponsavel: false },
        enviando: false,
        unsubscribeMensagens: null,
        // Navegação em etapas no mobile (a mesma marcação de 3 colunas do
        // desktop; no mobile só uma etapa fica visível por vez via CSS).
        etapaMobile: "lista",
        // Preferência de exibição da timeline — só local (localStorage),
        // nunca gravada no documento do chat (Fase 6).
        mostrarEventos: lerPreferenciaLocal("vh_atend_mostrar_eventos", true),
        filtroTimelineCategoria: lerPreferenciaLocal("vh_atend_timeline_categoria", "todos")
    };

    function el(id) {
        return document.getElementById(id);
    }

    function storeUid() {
        return context.getSnapshot().storeUid || "";
    }

    function authUid() {
        return context.getSnapshot().authUid || "";
    }

    function podeResponder() {
        return context.canEdit("atendimento");
    }

    function podeVer() {
        return context.canView("atendimento");
    }

    function nomeAutorAtual() {
        const snapshot = context.getSnapshot();
        if (snapshot.isEmployee) return snapshot.employee?.nome || "Funcionário";
        return snapshot.owner?.nomeLoja || snapshot.owner?.nome || "Loja";
    }

    function tipoAutorAtual() {
        return context.getSnapshot().isEmployee ? "funcionario" : "proprietario";
    }

    function conversaSelecionada() {
        return state.conversas.find(c => c.id === state.conversaSelecionadaId) || null;
    }

    function renderContadores() {
        const contadores = calcularContadoresAtendimento(state.conversas, { authUid: authUid() });
        const mapa = {
            "atend-kpi-novas": contadores.novas,
            "atend-kpi-abertas": contadores.abertas,
            "atend-kpi-nao-lidas": contadores.naoLidas,
            "atend-kpi-aguardando-equipe": contadores.aguardandoEquipe,
            "atend-kpi-minhas": contadores.minhasConversas,
            "atend-kpi-resolvidas-hoje": contadores.resolvidasHoje
        };
        Object.entries(mapa).forEach(([id, valor]) => {
            if (el(id)) el(id).textContent = String(valor);
        });
        return contadores;
    }

    function renderListaConversas() {
        const lista = el("atend-lista-conversas");
        if (!lista) return;

        if (state.erro) {
            lista.innerHTML = `
                <div class="atend-vazio">
                    <strong>Não deu pra carregar as conversas</strong>
                    <p>Verifique sua conexão e tente novamente.</p>
                    <button type="button" class="atend-btn atend-btn-primario" data-atend-acao="recarregar">Tentar novamente</button>
                </div>
            `;
            return;
        }

        const visiveis = ordenarConversas(filtrarConversas(state.conversas, { ...state.filtro, authUid: authUid() }));

        if (visiveis.length === 0) {
            const semNada = state.conversas.length === 0;
            lista.innerHTML = `
                <div class="atend-vazio">
                    <strong>${semNada ? "Nenhuma conversa ainda" : "Nada encontrado com estes filtros"}</strong>
                    <p>${semNada ? "Quando um cliente falar com a loja, a conversa aparece aqui." : "Ajuste a busca ou os filtros para ver as demais conversas."}</p>
                </div>
            `;
            return;
        }

        lista.innerHTML = visiveis.map(conversa => {
            const selecionada = conversa.id === state.conversaSelecionadaId;
            const precisaResposta = conversaPrecisaResposta(conversa);
            const naoLidas = Number(conversa.naoLidasLoja) || 0;
            return `
                <button type="button" class="atend-item-conversa ${selecionada ? "is-selecionada" : ""} ${precisaResposta ? "is-precisa-resposta" : ""}" data-atend-conversa-id="${escaparHtml(conversa.id)}">
                    <span class="atend-avatar">${escaparHtml(iniciaisNome(conversa.clienteNome))}</span>
                    <span class="atend-item-corpo">
                        <span class="atend-item-topo">
                            <strong>${escaparHtml(conversa.clienteNome || "Cliente")}</strong>
                            <span class="atend-item-tempo">${tempoRelativo(timestampConversaMs(conversa))}</span>
                        </span>
                        <span class="atend-item-preview">${escaparHtml(conversa.ultimaMensagem || "Sem mensagens ainda")}</span>
                        <span class="atend-item-meta">
                            <span class="atend-chip is-status-${escaparHtml(conversa.status || "aberta")}">${escaparHtml(STATUS_CONVERSA[conversa.status] || "Aberta")}</span>
                            ${conversa.canal ? `<span class="atend-chip is-canal">${escaparHtml(CANAIS_CONVERSA[conversa.canal] || conversa.canal)}</span>` : ""}
                            ${conversa.atribuidoPara ? `<span class="atend-chip is-responsavel">Atribuída</span>` : `<span class="atend-chip is-sem-responsavel">Sem responsável</span>`}
                        </span>
                    </span>
                    ${naoLidas > 0 ? `<span class="atend-badge-nao-lida">${naoLidas > 9 ? "9+" : naoLidas}</span>` : ""}
                </button>
            `;
        }).join("");
    }

    function renderPainelVazio() {
        const painel = el("atend-detalhe");
        if (!painel) return;
        painel.classList.add("is-vazio");
        const corpo = el("atend-detalhe-corpo");
        if (corpo) {
            corpo.innerHTML = `
                <div class="atend-vazio atend-vazio-detalhe">
                    <strong>Selecione uma conversa</strong>
                    <p>Escolha uma conversa na lista ao lado para ver o histórico e responder.</p>
                </div>
            `;
        }
    }

    function renderOpcoesResponsavel() {
        const select = el("atend-responsavel-select");
        if (!select) return;
        const elegiveis = funcionariosElegiveisAtendimento(state.funcionarios);
        select.innerHTML = [
            `<option value="">Sem responsável</option>`,
            `<option value="${escaparHtml(storeUid())}">Você (dono da loja)</option>`,
            ...elegiveis.map(f => `<option value="${escaparHtml(f.id)}">${escaparHtml(f.nome || f.id)}</option>`)
        ].join("");
    }

    function nomeResponsavel(uid) {
        if (!uid) return "";
        if (uid === storeUid()) {
            const snapshot = context.getSnapshot();
            return snapshot.owner?.nomeLoja || snapshot.owner?.nome || "Dono da loja";
        }
        return state.funcionarios.find(f => f.id === uid)?.nome || "";
    }

    // Toda escrita de evento passa por aqui — id novo, tenant/loja/chatId
    // sempre derivados do contexto (nunca de input), autoria sempre real.
    function novoEventoRef(chatId) {
        return doc(collection(db, "chats", chatId, "eventos"));
    }

    function montarEvento(chatId, tipo, extras = {}) {
        return {
            tenantId: storeUid(),
            lojaId: storeUid(),
            chatId,
            tipo,
            categoria: categoriaEventoAtendimento(tipo),
            autorUid: authUid(),
            autorTipo: tipoAutorAtual(),
            autorNome: nomeAutorAtual(),
            origem: "equipe",
            criadoEm: serverTimestamp(),
            versaoSchema: LIMITES_EVENTO_ATENDIMENTO.VERSAO_SCHEMA,
            ...extras
        };
    }

    function renderCabecalhoConversa(conversa) {
        const painel = el("atend-detalhe");
        if (painel) painel.classList.remove("is-vazio");
        if (el("atend-detalhe-nome")) el("atend-detalhe-nome").textContent = conversa.clienteNome || "Cliente";
        if (el("atend-detalhe-avatar")) el("atend-detalhe-avatar").textContent = iniciaisNome(conversa.clienteNome);
        if (el("atend-detalhe-status")) el("atend-detalhe-status").textContent = STATUS_CONVERSA[conversa.status] || "Aberta";
        if (el("atend-detalhe-canal")) el("atend-detalhe-canal").textContent = CANAIS_CONVERSA[conversa.canal] || "—";
        if (el("atend-detalhe-setor")) el("atend-detalhe-setor").textContent = conversa.setor || "Sem setor";
        if (el("atend-detalhe-inicio")) {
            const ms = normalizarMs(conversa.criadoEm) || normalizarMs(conversa.timestamp);
            el("atend-detalhe-inicio").textContent = ms ? new Date(ms).toLocaleString("pt-BR") : "—";
        }
        const selectStatus = el("atend-status-select");
        if (selectStatus) selectStatus.value = conversa.status || "aberta";
        renderOpcoesResponsavel();
        const selectResponsavel = el("atend-responsavel-select");
        if (selectResponsavel) selectResponsavel.value = conversa.atribuidoPara || "";
    }

    // Prioridade e métricas dependem do histórico (eventos), que carrega
    // de forma assíncrona e separada da conversa — atualizadas junto da
    // timeline, não do cabeçalho estático.
    function renderPrioridadeEMetricas() {
        const priorizada = conversaEstaPriorizada(state.eventos);
        const btnPrioridade = el("atend-btn-prioridade");
        if (btnPrioridade) {
            btnPrioridade.classList.toggle("is-priorizada", priorizada);
            btnPrioridade.setAttribute("aria-pressed", String(priorizada));
            btnPrioridade.textContent = priorizada ? "Prioridade" : "Marcar prioridade";
        }
        const metricas = calcularMetricasAtendimento(state.eventos);
        const boxMetricas = el("atend-metricas");
        if (boxMetricas) {
            const partes = [];
            if (metricas.primeiraRespostaMs !== null) {
                const minutos = Math.round(metricas.primeiraRespostaMs / 60000);
                partes.push(`1ª resposta em ${minutos < 1 ? "menos de 1 min" : `${minutos} min`}`);
            }
            if (metricas.quantidadeTransferencias > 0) partes.push(`${metricas.quantidadeTransferencias} transferência(s)`);
            if (metricas.quantidadeReaberturas > 0) partes.push(`${metricas.quantidadeReaberturas} reabertura(s)`);
            boxMetricas.textContent = partes.join(" · ");
            boxMetricas.hidden = partes.length === 0;
        }
    }

    // Reaproveita a coleção "templates" (mesma usada pelo módulo Templates
    // já existente, inclusive templates de automação de leads com o campo
    // "fluxo") — nunca uma segunda coleção. templateVisivelNoAtendimento
    // (templates-atendimento.js) já esconde os templates marcados
    // contexto:"leads"; o resto (sem "contexto", ou "atendimento") aparece.
    async function carregarTemplatesAtendimento() {
        state.templatesCarregando = true;
        try {
            const snap = await getDocs(query(collection(db, "templates"), where("criadoPor", "==", storeUid())));
            state.templates = [];
            snap.forEach(d => state.templates.push({ id: d.id, ...d.data() }));
        } catch (error) {
            state.templates = [];
        } finally {
            state.templatesCarregando = false;
        }
    }

    // Pedido "vinculado à conversa" é derivado do último evento
    // pedido_vinculado/pedido_desvinculado do histórico — nunca um campo
    // novo em chats (evitaria repetir o teto de complexidade das Rules já
    // registrado na Fase 9 do histórico de eventos). Cacheado por
    // pedidoId pra não reler o mesmo pedido a cada tecla digitada.
    async function pedidoVinculadoAtual() {
        const pedidoId = pedidoVinculadoIdDaConversa(state.eventos);
        if (!pedidoId) {
            state.pedidoVinculadoCache = null;
            state.pedidoVinculadoCacheId = "";
            return null;
        }
        if (state.pedidoVinculadoCacheId === pedidoId) return state.pedidoVinculadoCache;
        try {
            const snap = await getDoc(doc(db, "pedidos", pedidoId));
            // Nunca confia só no id salvo no evento: revalida que o pedido
            // pertence ao mesmo tenant antes de usar qualquer dado dele.
            const dados = snap.exists() && snap.data()?.criadoPor === storeUid()
                ? { id: snap.id, ...snap.data() }
                : null;
            state.pedidoVinculadoCache = dados;
            state.pedidoVinculadoCacheId = pedidoId;
            return dados;
        } catch (error) {
            return null;
        }
    }

    function templatesFiltrados() {
        const { busca, categoria, aba } = state.templatesFiltro;
        const base = filtrarTemplatesAtendimento(state.templates, { busca, categoria, apenasAtivos: true });
        if (aba === "favoritos") return base.filter(t => t.favorito);
        if (aba === "recentes") return templatesRecentementeUsados(base, 20);
        if (aba === "mais_usados") return templatesMaisUsados(base, 20);
        return ordenarTemplatesAtendimento(base, "ordem");
    }

    function templateItemHtml(t) {
        const variaveis = variaveisUsadasTemplateHtml(t.mensagem);
        return `
            <button type="button" class="atend-btn atend-template-item" data-atend-template-id="${escaparHtml(t.id)}" style="width:100%;justify-content:flex-start;text-align:left;margin-bottom:6px;flex-direction:column;align-items:flex-start;gap:2px;">
                <span style="display:flex;align-items:center;gap:6px;width:100%;">
                    <strong style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escaparHtml(t.titulo)}</strong>
                    ${t.favorito ? `<span title="Favorito" aria-hidden="true">★</span>` : ""}
                    ${t.atalho ? `<span class="atend-chip">/${escaparHtml(t.atalho)}</span>` : ""}
                </span>
                <span style="color:var(--at-muted);font-size:11.5px;">${escaparHtml(String(t.mensagem || "").slice(0, 90))}</span>
                ${variaveis}
            </button>
        `;
    }

    function variaveisUsadasTemplateHtml(mensagem) {
        const usadas = variaveisUsadasNoTexto(mensagem);
        if (usadas.length === 0) return "";
        return `<span style="font-size:10px;color:var(--sys-destaque,#00d4ff);">Usa: ${usadas.map(escaparHtml).join(", ")}</span>`;
    }

    function renderAbasTemplates() {
        const abas = el("atend-templates-abas");
        if (!abas) return;
        abas.querySelectorAll("[data-atend-template-aba]").forEach(btn => {
            btn.classList.toggle("is-ativa", btn.getAttribute("data-atend-template-aba") === state.templatesFiltro.aba);
        });
        if (el("atend-templates-busca")) el("atend-templates-busca").value = state.templatesFiltro.busca;
        if (el("atend-templates-categoria")) el("atend-templates-categoria").value = state.templatesFiltro.categoria;
    }

    function renderSeletorTemplates() {
        const lista = el("atend-templates-lista");
        if (!lista) return;
        renderAbasTemplates();
        if (state.templatesCarregando) {
            lista.innerHTML = `<div class="atend-mensagens-skel"><span class="aura-skel" style="width:60%;height:32px"></span></div>`;
            return;
        }
        const disponiveis = templatesFiltrados();
        if (disponiveis.length === 0) {
            lista.innerHTML = `<div class="atend-vazio"><p>Nenhum template encontrado. Cadastre um novo em "Gerenciar templates".</p></div>`;
            return;
        }
        lista.innerHTML = disponiveis.map(templateItemHtml).join("");
    }

    function abrirSeletorTemplates() {
        state.templatesFiltro = { busca: "", categoria: "todas", aba: "todos" };
        renderSeletorTemplates();
        el("atend-templates-modal")?.classList.remove("hidden");
    }

    function fecharSeletorTemplates() {
        el("atend-templates-modal")?.classList.add("hidden");
    }

    // Pré-visualização + pendências antes de inserir no compositor — nunca
    // resolve pedido "pelo nome do cliente": só usa o pedido explicitamente
    // vinculado à conversa atual (ou nenhum, se não houver vínculo).
    async function inserirTemplateNaResposta(templateId) {
        const template = state.templates.find(t => t.id === templateId);
        const conversa = conversaSelecionada();
        if (!template) return;
        const snapshot = context.getSnapshot();
        const pedido = await pedidoVinculadoAtual();
        const { textoResolvido, pendentes } = resolverVariaveisTemplate(template.mensagem, {
            nomeCliente: conversa?.clienteNome || "",
            nomeLoja: snapshot.owner?.nomeLoja || snapshot.owner?.nome || "",
            nomeFuncionario: nomeAutorAtual(),
            pedido
        });
        const input = el("atend-resposta-input");
        if (input) {
            input.value = input.value ? `${input.value}\n${textoResolvido}` : textoResolvido;
            input.focus();
        }
        state.templatePendencias = pendentes;
        renderPendenciasTemplate();
        // Só vira evento "template_utilizado" (e só conta usoTotal) se a
        // resposta realmente for enviada em seguida — enviarResposta
        // consome e limpa isto. Inserir e depois apagar/trocar de
        // conversa nunca registra uso (Fase 10/11 do mandato).
        state.templateUsadoId = template.id;
        state.templateUsadoTitulo = template.titulo || "";
        fecharSeletorTemplates();
    }

    // Aviso compacto acima do compositor — nunca bloqueia a digitação,
    // só avisa e explica a origem esperada de cada pendência (Fase 7).
    function renderPendenciasTemplate() {
        const box = el("atend-template-pendencias");
        if (!box) return;
        if (state.templatePendencias.length === 0) {
            box.hidden = true;
            box.innerHTML = "";
            return;
        }
        box.hidden = false;
        box.innerHTML = `
            <strong>Variáveis pendentes:</strong>
            <ul>
                ${state.templatePendencias.map(p => `<li>{{${escaparHtml(p.chave)}}} — ${escaparHtml(p.origem)}</li>`).join("")}
            </ul>
            <span>Edite o texto manualmente ou cancele o envio.</span>
        `;
    }

    // ===== Gestão de templates (Fase 8) =====
    // Permissão própria — diferente de "atendimento" (que só deixa USAR um
    // template já existente numa conversa). Mesmo modelo de permissão por
    // módulo já usado em todo o resto da base (canViewTenant/canEditTenant).
    function podeGerenciarTemplates() {
        return context.canEdit("templates");
    }

    function templateEmEdicao() {
        return state.templates.find(t => t.id === state.gestaoTemplates.editandoId) || null;
    }

    function abrirGestaoTemplates() {
        if (!podeGerenciarTemplates()) {
            notify("Você não tem permissão para gerenciar templates.", "error");
            return;
        }
        state.gestaoTemplates = { aberta: true, editandoId: "", salvando: false, erro: "" };
        renderGestaoTemplates();
        el("atend-gestao-modal")?.classList.remove("hidden");
    }

    function fecharGestaoTemplates() {
        state.gestaoTemplates.aberta = false;
        el("atend-gestao-modal")?.classList.add("hidden");
    }

    function abrirFormularioTemplate(id = "") {
        const template = id ? state.templates.find(t => t.id === id) : null;
        state.gestaoTemplates.editandoId = id || "";
        state.gestaoTemplates.erro = "";
        renderFormularioTemplate(template);
        el("atend-template-form-painel")?.classList.remove("hidden");
    }

    function fecharFormularioTemplate() {
        state.gestaoTemplates.editandoId = "";
        el("atend-template-form-painel")?.classList.add("hidden");
    }

    function renderFormularioTemplate(template) {
        if (el("atend-tpl-titulo")) el("atend-tpl-titulo").value = template?.titulo || "";
        if (el("atend-tpl-mensagem")) el("atend-tpl-mensagem").value = template?.mensagem || "";
        if (el("atend-tpl-categoria")) el("atend-tpl-categoria").value = categoriaTemplateAtendimento(template?.categoria);
        if (el("atend-tpl-atalho")) el("atend-tpl-atalho").value = template?.atalho || "";
        if (el("atend-tpl-favorito")) el("atend-tpl-favorito").checked = !!template?.favorito;
        if (el("atend-tpl-descricao")) el("atend-tpl-descricao").value = template?.descricaoInterna || "";
        if (el("atend-template-form-titulo")) {
            el("atend-template-form-titulo").textContent = template ? "Editar template" : "Novo template";
        }
        const erroBox = el("atend-tpl-erro");
        if (erroBox) {
            erroBox.textContent = state.gestaoTemplates.erro;
            erroBox.hidden = !state.gestaoTemplates.erro;
        }
    }

    // Cria ou edita — nunca reescreve criadoPor/criadoEm num template
    // existente (mesma trava de imutabilidade das Rules, checada aqui
    // primeiro só pra dar erro cedo, sem depender só do servidor negar).
    async function salvarTemplateAtendimento(dadosForm) {
        if (!podeGerenciarTemplates() || state.gestaoTemplates.salvando) return;
        const atalhoNormalizado = normalizarAtalho(dadosForm.atalho);
        const editandoId = state.gestaoTemplates.editandoId;
        const itemValidar = { titulo: dadosForm.titulo, mensagem: dadosForm.mensagem, atalho: atalhoNormalizado, descricaoInterna: dadosForm.descricaoInterna };
        const duplicado = atalhoJaEmUso(state.templates, atalhoNormalizado, { ignorarId: editandoId });
        const erro = validarTemplateAtendimentoAvancado(itemValidar, { atalhoDuplicado: duplicado });
        if (erro) {
            state.gestaoTemplates.erro = erro;
            renderFormularioTemplate(templateEmEdicao());
            return;
        }
        state.gestaoTemplates.salvando = true;
        try {
            const agora = Date.now();
            const categoria = categoriaTemplateAtendimento(dadosForm.categoria);
            const existente = templateEmEdicao();
            const payload = {
                titulo: dadosForm.titulo.trim(),
                mensagem: dadosForm.mensagem.trim(),
                categoria,
                contexto: "atendimento",
                atalho: atalhoNormalizado || "",
                favorito: !!dadosForm.favorito,
                descricaoInterna: String(dadosForm.descricaoInterna || "").trim().slice(0, LIMITES_TEMPLATE_ATENDIMENTO.descricaoInternaMax),
                ativo: existente ? (existente.ativo !== false) : true,
                versaoSchema: LIMITES_TEMPLATE_ATENDIMENTO.VERSAO_SCHEMA,
                atualizadoPor: authUid(),
                atualizadoEm: agora
            };
            if (!atalhoNormalizado) delete payload.atalho;
            const ref = existente ? doc(db, "templates", existente.id) : doc(collection(db, "templates"));
            if (!existente) {
                payload.criadoPor = storeUid();
                payload.criadoEm = agora;
                payload.ordem = state.templates.length;
                payload.usoTotal = 0;
            }
            await setDoc(ref, payload, { merge: true });
            await carregarTemplatesAtendimento();
            notify(existente ? "Template atualizado." : "Template criado.");
            fecharFormularioTemplate();
            renderGestaoTemplates();
            renderSeletorTemplates();
        } catch (error) {
            console.error("[Atendimento] Falha ao salvar template:", codigoErroFirebase(error), error?.message);
            state.gestaoTemplates.erro = "Não foi possível salvar agora. Tente de novo.";
            renderFormularioTemplate(templateEmEdicao());
        } finally {
            state.gestaoTemplates.salvando = false;
        }
    }

    async function duplicarTemplateAtendimento(id) {
        if (!podeGerenciarTemplates()) return;
        const original = state.templates.find(t => t.id === id);
        if (!original) return;
        try {
            const agora = Date.now();
            const ref = doc(collection(db, "templates"));
            await setDoc(ref, {
                titulo: `${original.titulo || "Template"} (cópia)`.slice(0, LIMITES_TEMPLATE_ATENDIMENTO.tituloMax),
                mensagem: original.mensagem || "",
                categoria: categoriaTemplateAtendimento(original.categoria),
                contexto: "atendimento",
                // Cópia nunca herda o atalho original (evitaria duplicidade
                // automática) — quem duplicar define um atalho novo se quiser.
                favorito: false,
                ativo: true,
                usoTotal: 0,
                ordem: state.templates.length,
                versaoSchema: LIMITES_TEMPLATE_ATENDIMENTO.VERSAO_SCHEMA,
                criadoPor: storeUid(),
                criadoEm: agora,
                atualizadoPor: authUid(),
                atualizadoEm: agora
            });
            await carregarTemplatesAtendimento();
            notify("Template duplicado.");
            renderGestaoTemplates();
        } catch (error) {
            notify("Não foi possível duplicar agora.", "error");
        }
    }

    async function alternarAtivoTemplateAtendimento(id) {
        if (!podeGerenciarTemplates()) return;
        const template = state.templates.find(t => t.id === id);
        if (!template) return;
        try {
            await setDoc(doc(db, "templates", id), {
                ativo: template.ativo === false,
                atualizadoPor: authUid(),
                atualizadoEm: Date.now()
            }, { merge: true });
            await carregarTemplatesAtendimento();
            renderGestaoTemplates();
            renderSeletorTemplates();
        } catch (error) {
            notify("Não foi possível atualizar agora.", "error");
        }
    }

    async function alternarFavoritoTemplateAtendimento(id) {
        if (!podeGerenciarTemplates()) return;
        const template = state.templates.find(t => t.id === id);
        if (!template) return;
        try {
            await setDoc(doc(db, "templates", id), {
                favorito: !template.favorito,
                atualizadoPor: authUid(),
                atualizadoEm: Date.now()
            }, { merge: true });
            await carregarTemplatesAtendimento();
            renderGestaoTemplates();
            renderSeletorTemplates();
        } catch (error) {
            notify("Não foi possível atualizar agora.", "error");
        }
    }

    // Arquivar é preferido a excluir (Fase 8): a exclusão física continua
    // permitida nas Rules só pelo módulo genérico "Templates" (legado, não
    // mexido aqui) — a gestão nova nunca oferece delete físico.
    async function arquivarTemplateAtendimento(id, arquivar = true) {
        if (!podeGerenciarTemplates()) return;
        try {
            await setDoc(doc(db, "templates", id), {
                arquivadoEm: arquivar ? Date.now() : null,
                atualizadoPor: authUid(),
                atualizadoEm: Date.now()
            }, { merge: true });
            await carregarTemplatesAtendimento();
            notify(arquivar ? "Template arquivado." : "Template restaurado.");
            renderGestaoTemplates();
            renderSeletorTemplates();
        } catch (error) {
            notify("Não foi possível atualizar agora.", "error");
        }
    }

    function gestaoTemplateItemHtml(t) {
        const arquivado = !!t.arquivadoEm;
        const usoTexto = t.usoTotal ? `${t.usoTotal} uso(s)` : "Nunca usado";
        return `
            <div class="atend-gestao-tpl-item ${arquivado ? "is-arquivado" : ""}">
                <div class="atend-gestao-tpl-info">
                    <strong>${escaparHtml(t.titulo)}</strong>
                    <span>${escaparHtml(rotuloCategoriaTemplate(t.categoria))}${t.atalho ? ` · /${escaparHtml(t.atalho)}` : ""} · ${escaparHtml(usoTexto)}</span>
                </div>
                <div class="atend-gestao-tpl-acoes">
                    <button type="button" class="atend-btn" data-atend-tpl-acao="favorito" data-atend-tpl-id="${escaparHtml(t.id)}" aria-label="${t.favorito ? "Remover dos favoritos" : "Marcar como favorito"}">${t.favorito ? "★" : "☆"}</button>
                    ${arquivado
                        ? `<button type="button" class="atend-btn" data-atend-tpl-acao="restaurar" data-atend-tpl-id="${escaparHtml(t.id)}">Restaurar</button>`
                        : `
                            <button type="button" class="atend-btn" data-atend-tpl-acao="editar" data-atend-tpl-id="${escaparHtml(t.id)}">Editar</button>
                            <button type="button" class="atend-btn" data-atend-tpl-acao="duplicar" data-atend-tpl-id="${escaparHtml(t.id)}">Duplicar</button>
                            <button type="button" class="atend-btn" data-atend-tpl-acao="ativo" data-atend-tpl-id="${escaparHtml(t.id)}">${t.ativo === false ? "Ativar" : "Desativar"}</button>
                            <button type="button" class="atend-btn" data-atend-tpl-acao="arquivar" data-atend-tpl-id="${escaparHtml(t.id)}">Arquivar</button>
                        `}
                </div>
            </div>
        `;
    }

    function renderGestaoTemplates() {
        const lista = el("atend-gestao-tpl-lista");
        if (!lista) return;
        const incluirArquivados = !!el("atend-gestao-mostrar-arquivados")?.checked;
        const busca = el("atend-gestao-busca")?.value || "";
        const categoria = el("atend-gestao-categoria")?.value || "todas";
        const visiveis = filtrarTemplatesAtendimento(state.templates, { busca, categoria, apenasAtivos: false, incluirArquivados });
        if (visiveis.length === 0) {
            lista.innerHTML = `<div class="atend-vazio"><p>Nenhum template encontrado.</p></div>`;
            return;
        }
        lista.innerHTML = ordenarTemplatesAtendimento(visiveis, "recente").map(gestaoTemplateItemHtml).join("");
    }

    // Atalho "/" no compositor — só filtra a lista já carregada em
    // memória, nunca executa nada. Enter insere; Esc fecha; navegação por
    // teclado entre as sugestões (Fase 9).
    function atualizarSugestoesAtalho(valorInput) {
        const ultimaBarra = valorInput.lastIndexOf("/");
        if (ultimaBarra === -1 || /\s/.test(valorInput.slice(ultimaBarra))) {
            state.atalhoSugestoes = [];
            renderSugestoesAtalho();
            return;
        }
        const prefixo = valorInput.slice(ultimaBarra + 1);
        state.atalhoSugestoes = sugerirTemplatesPorAtalho(state.templates.filter(templateVisivelParaAtalho), prefixo);
        renderSugestoesAtalho();
    }

    function templateVisivelParaAtalho(t) {
        return t.contexto !== "leads";
    }

    function renderSugestoesAtalho() {
        const box = el("atend-atalho-sugestoes");
        if (!box) return;
        if (state.atalhoSugestoes.length === 0) {
            box.hidden = true;
            box.innerHTML = "";
            return;
        }
        box.hidden = false;
        box.innerHTML = state.atalhoSugestoes.map((t, i) => `
            <button type="button" class="atend-atalho-sugestao-item" data-atend-atalho-index="${i}" data-atend-template-id="${escaparHtml(t.id)}">
                <strong>/${escaparHtml(t.atalho)}</strong> <span>${escaparHtml(t.titulo)}</span>
            </button>
        `).join("");
    }

    async function inserirTemplatePorAtalho(templateId) {
        const input = el("atend-resposta-input");
        if (input) {
            const ultimaBarra = input.value.lastIndexOf("/");
            if (ultimaBarra !== -1) input.value = input.value.slice(0, ultimaBarra);
        }
        state.atalhoSugestoes = [];
        renderSugestoesAtalho();
        await inserirTemplateNaResposta(templateId);
    }

    function itemMensagemHtml(msg) {
        const doAdmin = msg.sender === "admin";
        const autorLabel = doAdmin
            ? `${escaparHtml(msg.autorNome || "Equipe")} · Resposta do ${msg.autorTipo === "proprietario" ? "dono" : "funcionário"}`
            : "Cliente";
        const horario = new Date(normalizarMs(msg.timestamp) || Date.now()).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        return `
            <div class="atend-mensagem ${doAdmin ? "is-admin" : "is-cliente"}">
                <span class="atend-mensagem-autor">${autorLabel}</span>
                <div class="atend-mensagem-bolha">${escaparHtml(msg.texto)}</div>
                <span class="atend-mensagem-hora" title="Enviada às ${horario}">${horario}</span>
            </div>
        `;
    }

    const ICONE_EVENTO_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 8v4l3 2"></path></svg>';

    // Linha compacta — visualmente distinta dos balões de mensagem, sem
    // nenhum identificador técnico (id/uid) exibido ao usuário.
    function itemEventoHtml(evento) {
        const horario = new Date(eventoMs(evento) || Date.now()).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        return `
            <div class="atend-evento-linha" data-atend-evento-categoria="${escaparHtml(categoriaEventoAtendimento(evento.tipo))}">
                <span class="atend-evento-icone" aria-hidden="true">${ICONE_EVENTO_SVG}</span>
                <span class="atend-evento-texto">${escaparHtml(descreverEventoAtendimento(evento))}</span>
                <span class="atend-evento-hora" title="Registrado às ${horario}">${horario}</span>
            </div>
        `;
    }

    function renderFiltroTimeline() {
        const select = el("atend-timeline-filtro");
        if (select) select.value = state.filtroTimelineCategoria;
        const toggle = el("atend-timeline-mostrar-eventos");
        if (toggle) toggle.checked = state.mostrarEventos;
    }

    // Mensagens e eventos vêm de duas subcoleções (Fase 7: opção 1 — juntar
    // no cliente por criadoEm, sem duplicar dado nem criar um feed novo no
    // Firestore). Preserva a posição do scroll: só desce pro fim sozinho
    // quando o usuário já estava perto do fim (ou é a primeira renderização).
    function renderTimelineConversa() {
        const box = el("atend-mensagens");
        if (!box) return;
        renderPrioridadeEMetricas();

        if (state.mensagensErro) {
            box.innerHTML = `
                <div class="atend-vazio">
                    <strong>Não deu pra carregar o histórico</strong>
                    <button type="button" class="atend-btn" data-atend-acao="recarregar-mensagens">Tentar novamente</button>
                </div>
            `;
            return;
        }

        if (state.mensagensCarregando && state.mensagens.length === 0) {
            box.innerHTML = `<div class="atend-mensagens-skel"><span class="aura-skel" style="width:60%;height:32px"></span><span class="aura-skel" style="width:40%;height:32px"></span></div>`;
            return;
        }

        const itens = mesclarItensTimeline({
            mensagens: state.mensagens,
            eventos: state.eventosErro ? [] : state.eventos,
            mostrarEventos: state.mostrarEventos,
            filtroCategoria: state.filtroTimelineCategoria
        });

        if (itens.length === 0) {
            box.innerHTML = `<div class="atend-vazio"><p>Nenhuma mensagem ainda.</p></div>`;
            return;
        }

        const temMaisHistorico = state.temMaisMensagens || state.temMaisEventos;
        const historicoAnteriorHtml = temMaisHistorico || state.historicoAnteriorCarregando || state.historicoAnteriorErro
            ? `<div class="atend-historico-anterior">
                <button type="button" class="atend-btn" data-atend-acao="carregar-historico-anterior" ${state.historicoAnteriorCarregando ? "disabled" : ""}>
                    ${state.historicoAnteriorCarregando ? "Carregando..." : "Carregar histórico anterior"}
                </button>
                ${state.historicoAnteriorErro ? `<span class="atend-historico-anterior-erro">Não deu pra carregar parte do histórico antigo.</span>` : ""}
              </div>`
            : `<div class="atend-historico-fim" aria-label="Todo o histórico disponível foi carregado">Início do histórico carregado</div>`;

        const eventosErroAviso = (state.eventosErro && state.mostrarEventos)
            ? `<div class="atend-evento-erro">Não deu pra carregar o histórico de eventos. <button type="button" class="atend-btn" data-atend-acao="recarregar-eventos">Tentar novamente</button></div>`
            : "";

        const pertoDoFim = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
        box.innerHTML = historicoAnteriorHtml + eventosErroAviso + itens.map(item => item.tipoItem === "mensagem" ? itemMensagemHtml(item.dado) : itemEventoHtml(item.dado)).join("");
        if (pertoDoFim || !box.dataset.atendJaRenderizou) {
            box.scrollTop = box.scrollHeight;
        }
        box.dataset.atendJaRenderizou = "1";
    }

    function renderFiltros() {
        if (el("atend-busca")) el("atend-busca").value = state.filtro.busca;
        if (el("atend-filtro-status")) el("atend-filtro-status").value = state.filtro.status;
        if (el("atend-filtro-canal")) el("atend-filtro-canal").value = state.filtro.canal;
        if (el("atend-filtro-minhas")) el("atend-filtro-minhas").checked = state.filtro.apenasMinhas;
        if (el("atend-filtro-sem-responsavel")) el("atend-filtro-sem-responsavel").checked = state.filtro.apenasSemResponsavel;
    }

    function aplicarEtapaMobile() {
        const layout = el("atend-layout");
        if (layout) layout.setAttribute("data-atend-etapa", state.etapaMobile);
    }

    async function render() {
        renderContadores();
        renderFiltros();
        renderListaConversas();
        aplicarEtapaMobile();
        const conversa = conversaSelecionada();
        if (conversa) {
            renderCabecalhoConversa(conversa);
            renderFiltroTimeline();
            renderTimelineConversa();
        } else {
            renderPainelVazio();
        }
    }

    async function carregarFuncionarios() {
        if (!podeResponder()) return;
        try {
            const snap = await getDocs(query(collection(db, "funcionarios"), where("donoUID", "==", storeUid())));
            state.funcionarios = [];
            snap.forEach(d => state.funcionarios.push({ id: d.id, ...d.data() }));
        } catch (error) {
            state.funcionarios = [];
        }
    }

    async function load({ force = false } = {}) {
        if (!storeUid() || !podeVer()) return;
        if (state.carregando) return;
        if (state.carregado && !force) {
            await render();
            return;
        }
        state.carregando = true;
        try {
            const [porDono, porEmail] = await Promise.all([
                getDocs(query(collection(db, "chats"), where("donoUID", "==", storeUid()), limit(300))),
                getDocs(query(collection(db, "chats"), where("emailDono", "==", storeUid()), limit(300)))
            ]);
            const mapa = new Map();
            porDono.forEach(d => mapa.set(d.id, { id: d.id, ...d.data() }));
            porEmail.forEach(d => mapa.set(d.id, { id: d.id, ...d.data() }));
            state.conversas = Array.from(mapa.values());
            state.erro = false;
            state.carregado = true;
            await carregarFuncionarios();
            await carregarTemplatesAtendimento();
        } catch (error) {
            console.error("[Atendimento] Falha ao carregar conversas:", codigoErroFirebase(error), error?.message);
            state.erro = true;
        } finally {
            state.carregando = false;
        }
        await render();
    }

    function pararEscutaMensagens() {
        if (typeof state.unsubscribeMensagens === "function") {
            state.unsubscribeMensagens();
        }
        state.unsubscribeMensagens = null;
    }

    function pararEscutaEventos() {
        if (typeof state.unsubscribeEventos === "function") {
            state.unsubscribeEventos();
        }
        state.unsubscribeEventos = null;
    }

    function docsComoItens(snap) {
        const itens = [];
        snap.forEach(d => itens.push({ id: d.id, ...d.data() }));
        return itens;
    }

    function docMaisAntigo(docs, campoTempo) {
        return (docs || []).reduce((maisAntigo, atual) => {
            if (!maisAntigo) return atual;
            const atualMs = normalizarMs(atual.data()?.[campoTempo]);
            const antigoMs = normalizarMs(maisAntigo.data()?.[campoTempo]);
            return atualMs < antigoMs ? atual : maisAntigo;
        }, null);
    }

    function cursorMaisAntigo(cursorAtual, docs, campoTempo) {
        const candidato = docMaisAntigo(docs, campoTempo);
        if (!cursorAtual) return candidato;
        if (!candidato) return cursorAtual;
        return normalizarMs(candidato.data()?.[campoTempo]) < normalizarMs(cursorAtual.data()?.[campoTempo])
            ? candidato
            : cursorAtual;
    }

    function resetarEstadoTimeline() {
        state.mensagens = [];
        state.mensagensErro = false;
        state.mensagensCarregando = true;
        state.mensagensCursorAntigo = null;
        state.temMaisMensagens = false;
        state.eventos = [];
        state.eventosErro = false;
        state.eventosCarregando = true;
        state.eventosCursorAntigo = null;
        state.temMaisEventos = false;
        state.historicoAnteriorCarregando = false;
        state.historicoAnteriorErro = false;
        const box = el("atend-mensagens");
        if (box) delete box.dataset.atendJaRenderizou;
    }

    async function selecionarConversa(id) {
        if (!id || id === state.conversaSelecionadaId) return;
        pararEscutaMensagens();
        pararEscutaEventos();
        state.conversaSelecionadaId = id;
        resetarEstadoTimeline();
        state.etapaMobile = "conversa";
        await render();

        try {
            const mensagensQuery = query(
                collection(db, "chats", id, "mensagens"),
                orderBy("timestamp", "desc"),
                limit(LIMITES_TIMELINE_ATENDIMENTO.paginaMensagens)
            );
            state.unsubscribeMensagens = onSnapshot(mensagensQuery, snap => {
                state.mensagens = mesclarDocumentosTimeline(state.mensagens, docsComoItens(snap));
                state.mensagensCursorAntigo = cursorMaisAntigo(state.mensagensCursorAntigo, snap.docs, "timestamp");
                state.temMaisMensagens = snap.size === LIMITES_TIMELINE_ATENDIMENTO.paginaMensagens;
                state.mensagensCarregando = false;
                renderTimelineConversa();
            }, error => {
                console.error("[Atendimento] Falha ao ouvir mensagens:", codigoErroFirebase(error), error?.message);
                state.mensagensErro = true;
                state.mensagensCarregando = false;
                renderTimelineConversa();
            });
        } catch (error) {
            console.error("[Atendimento] Falha ao abrir conversa:", codigoErroFirebase(error), error?.message);
            state.mensagensErro = true;
            state.mensagensCarregando = false;
            renderTimelineConversa();
        }

        // Eventos: mesma conversa, própria coleção — se falhar, não
        // derruba as mensagens (cada seção trata seu próprio erro).
        try {
            const eventosQuery = query(
                collection(db, "chats", id, "eventos"),
                orderBy("criadoEm", "desc"),
                limit(LIMITES_TIMELINE_ATENDIMENTO.paginaEventos)
            );
            state.unsubscribeEventos = onSnapshot(eventosQuery, snap => {
                state.eventos = mesclarDocumentosTimeline(state.eventos, docsComoItens(snap));
                state.eventosCursorAntigo = cursorMaisAntigo(state.eventosCursorAntigo, snap.docs, "criadoEm");
                state.temMaisEventos = snap.size === LIMITES_TIMELINE_ATENDIMENTO.paginaEventos;
                state.eventosCarregando = false;
                renderTimelineConversa();
            }, error => {
                console.error("[Atendimento] Falha ao ouvir eventos:", codigoErroFirebase(error), error?.message);
                state.eventosErro = true;
                state.eventosCarregando = false;
                renderTimelineConversa();
            });
        } catch (error) {
            console.error("[Atendimento] Falha ao abrir histórico:", codigoErroFirebase(error), error?.message);
            state.eventosErro = true;
            state.eventosCarregando = false;
            renderTimelineConversa();
        }
    }

    // Chamado por notificação/link interno: valida que a conversa
    // pertence ao tenant atual antes de abrir — nunca aceita um id
    // arbitrário sem checar se ela está na lista já carregada do tenant.
    async function abrirConversaPorId(id) {
        if (!state.carregado) await load();
        const pertenceAoTenant = state.conversas.some(c => c.id === id);
        if (!pertenceAoTenant) {
            notify("Conversa não encontrada ou sem acesso.", "error");
            return false;
        }
        await selecionarConversa(id);
        return true;
    }

    async function carregarHistoricoAnterior() {
        const id = state.conversaSelecionadaId;
        if (!id || state.historicoAnteriorCarregando) return;
        if (!state.temMaisMensagens && !state.temMaisEventos) return;
        const box = el("atend-mensagens");
        const scrollAnterior = box ? { top: box.scrollTop, height: box.scrollHeight } : null;
        state.historicoAnteriorCarregando = true;
        state.historicoAnteriorErro = false;
        renderTimelineConversa();

        const carregarMensagens = state.temMaisMensagens && state.mensagensCursorAntigo
            ? getDocs(query(
                collection(db, "chats", id, "mensagens"),
                orderBy("timestamp", "desc"),
                startAfter(state.mensagensCursorAntigo),
                limit(LIMITES_TIMELINE_ATENDIMENTO.paginaMensagens)
            )).then(snap => ({ tipo: "mensagens", snap })).catch(error => ({ tipo: "mensagens", error }))
            : Promise.resolve({ tipo: "mensagens", ignorado: true });

        const carregarEventos = state.temMaisEventos && state.eventosCursorAntigo
            ? getDocs(query(
                collection(db, "chats", id, "eventos"),
                orderBy("criadoEm", "desc"),
                startAfter(state.eventosCursorAntigo),
                limit(LIMITES_TIMELINE_ATENDIMENTO.paginaEventos)
            )).then(snap => ({ tipo: "eventos", snap })).catch(error => ({ tipo: "eventos", error }))
            : Promise.resolve({ tipo: "eventos", ignorado: true });

        const resultados = await Promise.all([carregarMensagens, carregarEventos]);
        for (const resultado of resultados) {
            if (resultado.ignorado) continue;
            if (resultado.error) {
                state.historicoAnteriorErro = true;
                console.error("[Atendimento] Falha ao carregar histÃ³rico antigo:", codigoErroFirebase(resultado.error), resultado.error?.message);
                continue;
            }
            if (resultado.tipo === "mensagens") {
                state.mensagens = mesclarDocumentosTimeline(state.mensagens, docsComoItens(resultado.snap));
                state.mensagensCursorAntigo = cursorMaisAntigo(state.mensagensCursorAntigo, resultado.snap.docs, "timestamp");
                state.temMaisMensagens = resultado.snap.size === LIMITES_TIMELINE_ATENDIMENTO.paginaMensagens;
            }
            if (resultado.tipo === "eventos") {
                state.eventos = mesclarDocumentosTimeline(state.eventos, docsComoItens(resultado.snap));
                state.eventosCursorAntigo = cursorMaisAntigo(state.eventosCursorAntigo, resultado.snap.docs, "criadoEm");
                state.temMaisEventos = resultado.snap.size === LIMITES_TIMELINE_ATENDIMENTO.paginaEventos;
            }
        }

        state.historicoAnteriorCarregando = false;
        renderTimelineConversa();
        if (box && scrollAnterior) {
            box.scrollTop = Math.max(0, box.scrollHeight - scrollAnterior.height + scrollAnterior.top);
        }
    }

    async function enviarResposta(texto) {
        const conversa = conversaSelecionada();
        const mensagem = String(texto || "").trim();
        if (!conversa || !mensagem || state.enviando) return;
        if (!podeResponder()) {
            notify("Você não tem permissão para responder.", "error");
            return;
        }
        if (mensagem.length > LIMITES_ATENDIMENTO.mensagemMax) {
            notify("Mensagem muito longa.", "error");
            return;
        }
        if (conversa.status === "arquivada") {
            notify("Reabra a conversa antes de responder.", "error");
            return;
        }
        // Nunca deixa {{variavel}} sair como texto literal pro cliente —
        // bloqueia o envio (não remove nem envia do jeito que está) até a
        // pendência ser editada manualmente ou o envio ser cancelado.
        if (contemVariavelNaoResolvida(mensagem)) {
            notify("A mensagem ainda tem uma variável pendente entre chaves duplas. Edite antes de enviar.", "error");
            return;
        }
        state.enviando = true;
        const templateUsadoId = state.templateUsadoId;
        const templateUsadoTitulo = state.templateUsadoTitulo;
        const primeiraResposta = !state.mensagens.some(m => m.sender === "admin");
        const statusAnterior = conversa.status;
        const statusEventoTipo = classificarEventoStatus({ statusAnterior, statusNovo: "aguardando_cliente" });
        const clienteId = conversa.clienteId || "";
        let mensagemRef;
        try {
            const agora = Date.now();
            // Escrita atômica: mensagem + resumo do chat + evento(s) do
            // histórico saem juntos ou nenhum sai — nunca fica um estado
            // incompleto (chat mudou mas sem registro no histórico).
            const batch = writeBatch(db);
            mensagemRef = doc(collection(db, "chats", conversa.id, "mensagens"));
            batch.set(mensagemRef, {
                texto: mensagem,
                sender: "admin",
                timestamp: agora,
                autorUid: authUid(),
                autorTipo: tipoAutorAtual(),
                autorNome: nomeAutorAtual()
            });
            batch.set(doc(db, "chats", conversa.id), {
                ultimaMensagem: mensagem,
                statusAdmin: "respondido",
                status: "aguardando_cliente",
                statusAtualizadoPor: authUid(),
                statusAtualizadoEm: agora,
                atualizadoEm: agora
            }, { merge: true });
            // Nunca copia o texto da mensagem pro evento — só o link
            // (mensagemId) pra quem quiser o conteúdo real na subcoleção
            // mensagens, que já tem suas próprias Rules de leitura.
            batch.set(novoEventoRef(conversa.id), montarEvento(conversa.id, "mensagem_equipe_enviada", {
                clienteId, mensagemId: mensagemRef.id
            }));
            if (primeiraResposta) {
                batch.set(novoEventoRef(conversa.id), montarEvento(conversa.id, "primeira_resposta_equipe", {
                    clienteId, mensagemId: mensagemRef.id
                }));
            }
            if (statusEventoTipo) {
                batch.set(novoEventoRef(conversa.id), montarEvento(conversa.id, statusEventoTipo, {
                    statusAnterior, statusNovo: "aguardando_cliente", clienteId
                }));
            }
            if (templateUsadoId) {
                batch.set(novoEventoRef(conversa.id), montarEvento(conversa.id, "template_utilizado", {
                    templateId: templateUsadoId, templateTitulo: templateUsadoTitulo || "", clienteId, mensagemId: mensagemRef.id
                }));
                // usoTotal/ultimoUsoEm no mesmo lote atômico do envio — só
                // conta uso quando a mensagem realmente sai (nunca em
                // preview/inserção). Rules validam o incremento de +1
                // exato (mesmo padrão de naoLidasLoja em chats).
                batch.update(doc(db, "templates", templateUsadoId), {
                    usoTotal: increment(1),
                    ultimoUsoEm: serverTimestamp()
                });
            }
            await batch.commit();
            conversa.ultimaMensagem = mensagem;
            conversa.status = "aguardando_cliente";
            conversa.atualizadoEm = agora;
            state.templateUsadoId = "";
            state.templateUsadoTitulo = "";
            state.templatePendencias = [];
            renderPendenciasTemplate();
            // CRM 360 (best-effort, não trava o envio se falhar): marca a
            // interação mais recente do cliente vinculado, usada pelo
            // alerta de "cliente sem retorno".
            if (clienteId) {
                setDoc(doc(db, "clientes", clienteId), {
                    ultimaInteracaoEm: agora,
                    atualizadoPor: authUid(),
                    atualizadoEm: serverTimestamp()
                }, { merge: true }).catch(() => {});
            }
            await render();
        } catch (error) {
            console.error("[Atendimento] Falha ao enviar resposta:", codigoErroFirebase(error), error?.message);
            notify("Não foi possível enviar a resposta agora. Tente de novo.", "error");
            // Best-effort fora do batch (que já falhou) — se isto também
            // falhar (ex.: sem conexão), sobra só o toast de erro acima;
            // não há como garantir persistência de um evento sobre uma
            // falha causada por falta de conectividade.
            setDoc(novoEventoRef(conversa.id), montarEvento(conversa.id, "mensagem_envio_falhou", {
                resumo: String(error?.code || error?.message || "erro desconhecido").slice(0, 300)
            })).catch(() => {});
        } finally {
            state.enviando = false;
        }
    }

    async function alterarStatus(novoStatus) {
        const conversa = conversaSelecionada();
        if (!conversa || !podeResponder() || state.alterandoStatus) return;
        if (!podeTransicionarStatus(conversa.status, novoStatus)) {
            notify("Essa mudança de status não é permitida a partir do status atual.", "error");
            return;
        }
        const statusAnterior = conversa.status;
        const tipoEvento = classificarEventoStatus({ statusAnterior, statusNovo: novoStatus });
        state.alterandoStatus = true;
        try {
            const agora = Date.now();
            const batch = writeBatch(db);
            batch.set(doc(db, "chats", conversa.id), {
                status: novoStatus,
                statusAtualizadoPor: authUid(),
                statusAtualizadoEm: agora,
                atualizadoEm: agora
            }, { merge: true });
            if (tipoEvento) {
                batch.set(novoEventoRef(conversa.id), montarEvento(conversa.id, tipoEvento, {
                    statusAnterior, statusNovo: novoStatus, clienteId: conversa.clienteId || ""
                }));
            }
            await batch.commit();
            conversa.status = novoStatus;
            notify("Status atualizado.");
            await render();
        } catch (error) {
            console.error("[Atendimento] Falha ao mudar status:", codigoErroFirebase(error), error?.message);
            notify("Não foi possível atualizar o status.", "error");
        } finally {
            state.alterandoStatus = false;
        }
    }

    async function atribuirResponsavel(uidResponsavel) {
        const conversa = conversaSelecionada();
        if (!conversa || !podeResponder() || state.atribuindo) return;
        const alvo = String(uidResponsavel || "").trim();
        const valido = alvo === "" || alvo === storeUid()
            || funcionarioPodeAtender(state.funcionarios.find(f => f.id === alvo));
        if (!valido) {
            notify("Não é possível atribuir a este responsável.", "error");
            return;
        }
        const anterior = conversa.atribuidoPara || "";
        if (anterior === alvo) return;
        const tipoEvento = classificarEventoAtribuicao({ anteriorUid: anterior, novoUid: alvo, autorUid: authUid() });
        state.atribuindo = true;
        try {
            const agora = Date.now();
            const batch = writeBatch(db);
            batch.set(doc(db, "chats", conversa.id), {
                atribuidoPara: alvo,
                atribuidoPor: authUid(),
                atribuidoEm: agora,
                atualizadoEm: agora
            }, { merge: true });
            if (tipoEvento) {
                batch.set(novoEventoRef(conversa.id), montarEvento(conversa.id, tipoEvento, {
                    responsavelAnteriorUid: anterior,
                    responsavelNovoUid: alvo,
                    responsavelAnteriorNome: nomeResponsavel(anterior),
                    responsavelNovoNome: nomeResponsavel(alvo),
                    clienteId: conversa.clienteId || ""
                }));
            }
            await batch.commit();
            conversa.atribuidoPara = alvo;
            notify(alvo ? "Conversa atualizada." : "Responsável removido.");
            await render();
        } catch (error) {
            console.error("[Atendimento] Falha ao atribuir conversa:", codigoErroFirebase(error), error?.message);
            notify("Não foi possível atualizar o responsável.", "error");
        } finally {
            state.atribuindo = false;
        }
    }

    // Prioridade não tem campo próprio no chat (ver calcularMetricasAtendimento
    // no topo do arquivo) — é só um evento, aplicado/lido a partir do
    // histórico já carregado.
    async function alternarPrioridade() {
        const conversa = conversaSelecionada();
        if (!conversa || !podeResponder() || state.alterandoStatus) return;
        const estaPriorizada = conversaEstaPriorizada(state.eventos);
        const tipo = estaPriorizada ? "prioridade_removida" : "conversa_priorizada";
        try {
            await setDoc(novoEventoRef(conversa.id), montarEvento(conversa.id, tipo, {
                clienteId: conversa.clienteId || ""
            }));
            notify(estaPriorizada ? "Prioridade removida." : "Conversa marcada como prioridade.");
        } catch (error) {
            console.error("[Atendimento] Falha ao alternar prioridade:", codigoErroFirebase(error), error?.message);
            notify("Não foi possível atualizar a prioridade.", "error");
        }
    }

    function bindEventos() {
        el("atend-busca")?.addEventListener("input", event => {
            state.filtro.busca = event.target.value;
            renderListaConversas();
        });
        el("atend-filtro-status")?.addEventListener("change", event => {
            state.filtro.status = event.target.value;
            renderListaConversas();
        });
        el("atend-filtro-canal")?.addEventListener("change", event => {
            state.filtro.canal = event.target.value;
            renderListaConversas();
        });
        el("atend-filtro-minhas")?.addEventListener("change", event => {
            state.filtro.apenasMinhas = event.target.checked;
            renderListaConversas();
        });
        el("atend-filtro-sem-responsavel")?.addEventListener("change", event => {
            state.filtro.apenasSemResponsavel = event.target.checked;
            renderListaConversas();
        });
        el("atend-btn-atualizar")?.addEventListener("click", () => load({ force: true }));

        // Navegação em etapas no mobile: mesma marcação de 3 colunas do
        // desktop, só uma etapa visível por vez (ver atendimento.css).
        // Delegado no layout inteiro porque os botões "abrir filtros" e
        // "voltar" existem em mais de uma coluna (filtros e conversa).
        el("atend-layout")?.addEventListener("click", event => {
            if (event.target.closest("[data-atend-acao='abrir-filtros']")) {
                state.etapaMobile = "filtros";
                aplicarEtapaMobile();
            }
            if (event.target.closest("[data-atend-acao='voltar-lista']")) {
                state.etapaMobile = "lista";
                aplicarEtapaMobile();
            }
        });

        el("atend-lista-conversas")?.addEventListener("click", event => {
            const alvo = event.target.closest("[data-atend-conversa-id]");
            if (alvo) selecionarConversa(alvo.getAttribute("data-atend-conversa-id"));
            if (event.target.closest("[data-atend-acao='recarregar']")) load({ force: true });
        });

        el("atend-status-select")?.addEventListener("change", event => alterarStatus(event.target.value));
        el("atend-responsavel-select")?.addEventListener("change", event => atribuirResponsavel(event.target.value));
        el("atend-btn-prioridade")?.addEventListener("click", alternarPrioridade);

        el("atend-timeline-filtro")?.addEventListener("change", event => {
            state.filtroTimelineCategoria = event.target.value;
            salvarPreferenciaLocal("vh_atend_timeline_categoria", state.filtroTimelineCategoria);
            renderTimelineConversa();
        });
        el("atend-timeline-mostrar-eventos")?.addEventListener("change", event => {
            state.mostrarEventos = event.target.checked;
            salvarPreferenciaLocal("vh_atend_mostrar_eventos", state.mostrarEventos);
            renderTimelineConversa();
        });

        // Recarregar mensagens/eventos: reabre a mesma conversa (reassina
        // os dois listeners do zero) sem perder a seleção atual.
        el("atend-mensagens")?.addEventListener("click", event => {
            if (event.target.closest("[data-atend-acao='recarregar-mensagens']") || event.target.closest("[data-atend-acao='recarregar-eventos']")) {
                const idAtual = state.conversaSelecionadaId;
                state.conversaSelecionadaId = "";
                selecionarConversa(idAtual);
            }
            if (event.target.closest("[data-atend-acao='carregar-historico-anterior']")) {
                carregarHistoricoAnterior();
            }
        });

        // O painel de dados do cliente evoluiu pro CRM 360 (crm360.js) —
        // aqui só entrega a conversa selecionada pra quem sabe abri-lo.
        el("atend-btn-dados-cliente")?.addEventListener("click", () => onAbrirDadosCliente(conversaSelecionada()));

        el("atend-btn-templates")?.addEventListener("click", abrirSeletorTemplates);
        el("atend-templates-fechar")?.addEventListener("click", fecharSeletorTemplates);
        el("atend-templates-lista")?.addEventListener("click", event => {
            const alvo = event.target.closest("[data-atend-template-id]");
            if (alvo) inserirTemplateNaResposta(alvo.getAttribute("data-atend-template-id"));
        });
        el("atend-templates-abas")?.addEventListener("click", event => {
            const botao = event.target.closest("[data-atend-template-aba]");
            if (!botao) return;
            state.templatesFiltro.aba = botao.getAttribute("data-atend-template-aba");
            renderSeletorTemplates();
        });
        el("atend-templates-busca")?.addEventListener("input", event => {
            state.templatesFiltro.busca = event.target.value;
            renderSeletorTemplates();
        });
        el("atend-templates-categoria")?.addEventListener("change", event => {
            state.templatesFiltro.categoria = event.target.value;
            renderSeletorTemplates();
        });
        el("atend-btn-gerenciar-templates")?.addEventListener("click", () => {
            fecharSeletorTemplates();
            abrirGestaoTemplates();
        });

        // Gestão de templates (Fase 8): abrir/fechar, criar/editar,
        // filtros da lista e as ações por item (delegadas, mesma lista é
        // reconstruída a cada render).
        el("atend-gestao-fechar")?.addEventListener("click", fecharGestaoTemplates);
        el("atend-gestao-btn-novo")?.addEventListener("click", () => abrirFormularioTemplate());
        el("atend-tpl-form-cancelar")?.addEventListener("click", fecharFormularioTemplate);
        el("atend-gestao-busca")?.addEventListener("input", renderGestaoTemplates);
        el("atend-gestao-categoria")?.addEventListener("change", renderGestaoTemplates);
        el("atend-gestao-mostrar-arquivados")?.addEventListener("change", renderGestaoTemplates);
        el("atend-gestao-tpl-lista")?.addEventListener("click", event => {
            const botao = event.target.closest("[data-atend-tpl-acao]");
            if (!botao) return;
            const id = botao.getAttribute("data-atend-tpl-id");
            const acao = botao.getAttribute("data-atend-tpl-acao");
            if (acao === "editar") abrirFormularioTemplate(id);
            if (acao === "duplicar") duplicarTemplateAtendimento(id);
            if (acao === "ativo") alternarAtivoTemplateAtendimento(id);
            if (acao === "favorito") alternarFavoritoTemplateAtendimento(id);
            if (acao === "arquivar") arquivarTemplateAtendimento(id, true);
            if (acao === "restaurar") arquivarTemplateAtendimento(id, false);
        });
        el("atend-tpl-form")?.addEventListener("submit", event => {
            event.preventDefault();
            salvarTemplateAtendimento({
                titulo: el("atend-tpl-titulo")?.value || "",
                mensagem: el("atend-tpl-mensagem")?.value || "",
                categoria: el("atend-tpl-categoria")?.value || "personalizada",
                atalho: el("atend-tpl-atalho")?.value || "",
                favorito: !!el("atend-tpl-favorito")?.checked,
                descricaoInterna: el("atend-tpl-descricao")?.value || ""
            });
        });
        // Escape fecha os modais de templates (acessibilidade — Fase 16).
        [el("atend-templates-modal"), el("atend-gestao-modal")].forEach(modal => {
            modal?.addEventListener("keydown", event => {
                if (event.key !== "Escape") return;
                fecharSeletorTemplates();
                fecharFormularioTemplate();
                fecharGestaoTemplates();
            });
        });

        const formResposta = el("atend-form-resposta");
        formResposta?.addEventListener("submit", event => {
            event.preventDefault();
            const input = el("atend-resposta-input");
            const texto = input?.value.trim();
            if (!texto) return;
            enviarResposta(texto).then(() => {
                if (input) input.value = "";
            });
        });

        // Atalhos "/" no compositor (Fase 9): digitar "/" abre sugestões;
        // setas navegam; Enter insere; Esc fecha; foco volta pro campo.
        const inputResposta = el("atend-resposta-input");
        let indiceAtalhoAtivo = -1;
        inputResposta?.addEventListener("input", event => {
            atualizarSugestoesAtalho(event.target.value);
            indiceAtalhoAtivo = -1;
        });
        inputResposta?.addEventListener("keydown", event => {
            if (state.atalhoSugestoes.length === 0) return;
            if (event.key === "ArrowDown") {
                event.preventDefault();
                indiceAtalhoAtivo = Math.min(indiceAtalhoAtivo + 1, state.atalhoSugestoes.length - 1);
                destacarSugestaoAtalho(indiceAtalhoAtivo);
            } else if (event.key === "ArrowUp") {
                event.preventDefault();
                indiceAtalhoAtivo = Math.max(indiceAtalhoAtivo - 1, 0);
                destacarSugestaoAtalho(indiceAtalhoAtivo);
            } else if (event.key === "Enter" && indiceAtalhoAtivo >= 0) {
                event.preventDefault();
                const alvo = state.atalhoSugestoes[indiceAtalhoAtivo];
                if (alvo) inserirTemplatePorAtalho(alvo.id).then(() => inputResposta.focus());
            } else if (event.key === "Escape") {
                state.atalhoSugestoes = [];
                renderSugestoesAtalho();
            }
        });
        el("atend-atalho-sugestoes")?.addEventListener("click", event => {
            const alvo = event.target.closest("[data-atend-template-id]");
            if (alvo) inserirTemplatePorAtalho(alvo.getAttribute("data-atend-template-id")).then(() => inputResposta?.focus());
        });
    }

    function destacarSugestaoAtalho(indice) {
        const box = el("atend-atalho-sugestoes");
        if (!box) return;
        box.querySelectorAll("[data-atend-atalho-index]").forEach(item => {
            item.classList.toggle("is-ativa", Number(item.getAttribute("data-atend-atalho-index")) === indice);
        });
    }

    return {
        load,
        bindEventos,
        selecionarConversa,
        abrirConversaPorId,
        carregarHistoricoAnterior,
        enviarResposta,
        alterarStatus,
        atribuirResponsavel,
        state
    };
}
