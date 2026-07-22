// Templates Avançados de Atendimento — evolui a coleção `templates` já
// existente (mesma usada pelo módulo genérico "Templates" e pela automação
// de leads, campo `fluxo`). Não cria uma segunda coleção: só acrescenta
// campos opcionais, todos com fallback seguro para documentos antigos que
// nunca vão ganhá-los. Lógica pura aqui (testável sem DOM/Firestore); o
// controller de UI mora em `atendimento.js` (`criarAtendimentoController`),
// mesmo padrão de `crm360.js`.

// ---------- Categorias fechadas (Fase 5 do mandato) ----------
// Vocabulário NOVO, específico de atendimento — não é o mesmo enum usado
// pelo módulo genérico "Templates" (geral/vendas/suporte/followup/cobranca,
// dashboard.html). Os dois convivem na mesma coleção porque `categoria` é
// só texto livre nas Rules (`validTemplateData`); um template com uma
// categoria fora deste enum (incluindo as do módulo genérico) é tratado
// como "personalizada" pela UI de atendimento, nunca quebra a listagem.
export const CATEGORIAS_TEMPLATE_ATENDIMENTO = Object.freeze({
    saudacao: "Saudação",
    orcamento: "Orçamento",
    pagamento: "Pagamento",
    prazo: "Prazo",
    entrega: "Entrega",
    pedido: "Pedido",
    indisponibilidade: "Indisponibilidade",
    suporte: "Suporte",
    acompanhamento: "Acompanhamento",
    pos_venda: "Pós-venda",
    encerramento: "Encerramento",
    personalizada: "Personalizada"
});

export function categoriaTemplateAtendimento(categoria) {
    return categoria in CATEGORIAS_TEMPLATE_ATENDIMENTO ? categoria : "personalizada";
}

export function rotuloCategoriaTemplate(categoria) {
    return CATEGORIAS_TEMPLATE_ATENDIMENTO[categoriaTemplateAtendimento(categoria)];
}

export const LIMITES_TEMPLATE_ATENDIMENTO = Object.freeze({
    tituloMax: 160,
    conteudoMax: 2000,
    atalhoMax: 40,
    descricaoInternaMax: 300,
    tagsBuscaMax: 8,
    tagBuscaMax: 30,
    VERSAO_SCHEMA: 2
});

// ---------- Variáveis (Fase 6) ----------
// Mantém as 4 originais + evolui pra whitelist oficial de 8. Nenhuma tem
// eval/Function dinâmica — troca de texto por texto via regex, igual ao
// motor original. "opcionais" (telefone_cliente/produto_interesse) não
// entram nesta etapa por falta de dado canônico seguro pra origem deles
// hoje (ver docs — decisão explícita, não esquecimento).
export const VARIAVEIS_TEMPLATE_ATENDIMENTO = Object.freeze([
    "nome_cliente",
    "nome_loja",
    "nome_funcionario",
    "numero_pedido",
    "status_pedido",
    "valor_pedido",
    "data_pedido",
    "prazo_entrega"
]);

export const ROTULO_STATUS_PEDIDO = Object.freeze({
    aguardando: "Aguardando",
    confirmado: "Confirmado",
    pago: "Pago",
    cancelado: "Cancelado"
});

// Nunca eval/Function — troca determinística por regex. Variável fora da
// whitelist passa direto (nunca vira dado, nunca é removida). Variável
// sem valor resolvido (undefined/null/"") também passa o placeholder
// adiante — quem decide o que fazer com a pendência é resolverVariaveisTemplate
// abaixo, não este substituidor (mantido simples e determinístico).
export function substituirVariaveisTemplate(texto, valores = {}) {
    const origem = String(texto || "");
    return origem.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (match, chave) => {
        if (!VARIAVEIS_TEMPLATE_ATENDIMENTO.includes(chave)) return match;
        const valor = valores[chave];
        return (valor !== undefined && valor !== null && String(valor).trim() !== "")
            ? String(valor)
            : match;
    });
}

// Lista, em ordem de aparição no texto, quais variáveis da whitelist o
// template usa — usada tanto pra pré-visualização quanto pro indicador
// "variáveis necessárias" no seletor.
export function variaveisUsadasNoTexto(texto) {
    const encontradas = [];
    const origem = String(texto || "");
    const regex = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g;
    let match;
    while ((match = regex.exec(origem))) {
        const chave = match[1];
        if (VARIAVEIS_TEMPLATE_ATENDIMENTO.includes(chave) && !encontradas.includes(chave)) {
            encontradas.push(chave);
        }
    }
    return encontradas;
}

// Trava de segurança final antes do envio: nunca deixa um identificador
// técnico ({{numero_pedido}}, etc.) sair pro cliente como texto literal.
// Usado por enviarResposta() pra bloquear o envio (não silenciosamente
// remover nem enviar do jeito que está) enquanto sobrar variável não
// resolvida no texto final.
export function contemVariavelNaoResolvida(texto) {
    return variaveisUsadasNoTexto(texto).length > 0;
}

// Formata um pedido (schema real: valor number, status enum, data
// timestamp — "pedidos.itens"/"produtoId" estruturados ficam pra próxima
// fase, RD3 "Pedidos estruturados") nos 4 valores de variável de pedido.
// `numero_pedido` usa o próprio id do documento (`ped_<timestamp>`) como
// identificador visível — não existe hoje um campo de "número" amigável
// separado (limitação documentada, não inventamos um).
export function valoresDePedido(pedido) {
    if (!pedido) return {};
    const valores = {};
    if (pedido.id) valores.numero_pedido = pedido.id;
    if (pedido.status) valores.status_pedido = ROTULO_STATUS_PEDIDO[pedido.status] || pedido.status;
    if (typeof pedido.valor === "number") {
        valores.valor_pedido = pedido.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    }
    if (pedido.data) {
        const ms = typeof pedido.data === "number" ? pedido.data : null;
        if (ms) valores.data_pedido = new Date(ms).toLocaleDateString("pt-BR");
    }
    // prazo_entrega: não existe campo canônico de prazo de entrega em
    // `pedidos` hoje (auditado — nenhuma referência no repositório) —
    // fica sempre pendente até essa estrutura existir num ciclo futuro.
    return valores;
}

// Resolve o contexto disponível pra um template (cliente/loja/funcionário
// sempre; pedido só quando explicitamente vinculado à conversa — nunca
// escolhido só pelo nome do cliente). Retorna os valores resolvidos e a
// lista de pendências (variável usada pelo template que não tem dado —
// cada pendência diz a origem esperada, pra UI explicar o motivo).
const ORIGEM_PENDENCIA = Object.freeze({
    nome_cliente: "Conversa sem nome de cliente identificado.",
    nome_loja: "Nome da loja não configurado no perfil.",
    nome_funcionario: "Autor não identificado.",
    numero_pedido: "Nenhum pedido vinculado a esta conversa.",
    status_pedido: "Nenhum pedido vinculado a esta conversa.",
    valor_pedido: "Nenhum pedido vinculado a esta conversa.",
    data_pedido: "Nenhum pedido vinculado a esta conversa.",
    prazo_entrega: "Prazo de entrega ainda não é um dado estruturado do pedido."
});

export function resolverVariaveisTemplate(texto, { nomeCliente = "", nomeLoja = "", nomeFuncionario = "", pedido = null } = {}) {
    const usadas = variaveisUsadasNoTexto(texto);
    const valores = {
        nome_cliente: nomeCliente,
        nome_loja: nomeLoja,
        nome_funcionario: nomeFuncionario,
        ...valoresDePedido(pedido)
    };
    const pendentes = usadas.filter(chave => {
        const valor = valores[chave];
        return valor === undefined || valor === null || String(valor).trim() === "";
    }).map(chave => ({ chave, origem: ORIGEM_PENDENCIA[chave] || "Dado não disponível." }));
    return { valores, pendentes, textoResolvido: substituirVariaveisTemplate(texto, valores) };
}

// ---------- Vínculo de pedido derivado do histórico (Fase 12 anterior) ----------
// Mesma técnica de conversaEstaPriorizada() (atendimento.js): nenhum campo
// novo em `chats` (evitaria repetir o teto de complexidade das Rules já
// registrado) — o pedido "vinculado à conversa" é derivado do último
// evento pedido_vinculado/pedido_desvinculado por criadoEm.
function eventoMsTemplates(evento) {
    const valor = evento?.criadoEm;
    if (!valor) return 0;
    if (typeof valor.toMillis === "function") return valor.toMillis();
    if (typeof valor.seconds === "number") return valor.seconds * 1000;
    return typeof valor === "number" ? valor : 0;
}

export function pedidoVinculadoIdDaConversa(eventos) {
    const relevantes = (eventos || [])
        .filter(e => e?.tipo === "pedido_vinculado" || e?.tipo === "pedido_desvinculado")
        .sort((a, b) => eventoMsTemplates(b) - eventoMsTemplates(a));
    const ultimo = relevantes[0];
    if (!ultimo || ultimo.tipo !== "pedido_vinculado") return "";
    return ultimo.pedidoId || "";
}

// ---------- Modelo do documento (Fase 4) ----------
// Campos aceitos na escrita nova (whitelist do app — Rules validam de
// novo do lado do servidor). `mensagem` continua sendo o nome real do
// campo de conteúdo (o mandato pediu "conteudo", mas o modelo real já
// usa "mensagem" — adaptado, sem renomear e quebrar templates antigos).
export const CAMPOS_TEMPLATE_ATENDIMENTO = Object.freeze([
    "titulo", "mensagem", "categoria", "atalho", "ativo", "favorito", "ordem",
    "usoTotal", "ultimoUsoEm", "criadoPor", "atualizadoPor", "criadoEm",
    "atualizadoEm", "arquivadoEm", "versaoSchema", "descricaoInterna",
    "tagsBusca", "canal", "requerPedido", "requerProduto", "requerConfirmacao",
    "contexto", "fluxo"
]);

export function normalizarAtalho(valor) {
    return String(valor || "")
        .trim()
        .toLowerCase()
        .replace(/^\/+/, "")
        .replace(/[^a-z0-9_-]/g, "")
        .slice(0, LIMITES_TEMPLATE_ATENDIMENTO.atalhoMax);
}

// Válido tanto pra criar quanto editar. `atalhoJaExiste` é decidido por
// quem chama (precisa consultar os outros templates do tenant) — mantido
// puro aqui, sem depender de Firestore.
export function validarTemplateAtendimentoAvancado(item, { atalhoDuplicado = false } = {}) {
    const titulo = String(item?.titulo || "").trim();
    const mensagem = String(item?.mensagem || "").trim();
    if (titulo.length < 1) return "Informe um título para o template.";
    if (titulo.length > LIMITES_TEMPLATE_ATENDIMENTO.tituloMax) {
        return `O título pode ter no máximo ${LIMITES_TEMPLATE_ATENDIMENTO.tituloMax} caracteres.`;
    }
    if (!mensagem) return "O conteúdo do template é obrigatório.";
    if (mensagem.length > LIMITES_TEMPLATE_ATENDIMENTO.conteudoMax) {
        return `O conteúdo pode ter no máximo ${LIMITES_TEMPLATE_ATENDIMENTO.conteudoMax} caracteres.`;
    }
    if (item?.atalho) {
        const normalizado = normalizarAtalho(item.atalho);
        if (!normalizado) return "Atalho inválido — use apenas letras, números, hífen ou underscore.";
        if (atalhoDuplicado) return "Já existe um template ativo com esse atalho.";
    }
    if (item?.descricaoInterna && String(item.descricaoInterna).length > LIMITES_TEMPLATE_ATENDIMENTO.descricaoInternaMax) {
        return `A descrição interna pode ter no máximo ${LIMITES_TEMPLATE_ATENDIMENTO.descricaoInternaMax} caracteres.`;
    }
    return "";
}

// ---------- Filtros, busca e ordenação (Fase 8/9/13) ----------
// `contexto` ausente = template legado, continua aparecendo (Fase 18:
// compatibilidade — nunca exige que documentos antigos já tenham o campo
// novo). `contexto: "leads"` explícito é o único caso escondido do
// seletor de atendimento (evita mostrar automação de lead numa conversa).
export function templateVisivelNoAtendimento(item) {
    return item?.contexto !== "leads";
}

export function filtrarTemplatesAtendimento(templates, {
    busca = "", categoria = "todas", apenasAtivos = true, apenasFavoritos = false, incluirArquivados = false
} = {}) {
    const termo = String(busca || "").trim().toLowerCase();
    return (templates || [])
        .filter(templateVisivelNoAtendimento)
        .filter(item => {
            if (!incluirArquivados && item.arquivadoEm) return false;
            if (apenasAtivos && item.ativo === false) return false;
            if (apenasFavoritos && !item.favorito) return false;
            if (categoria !== "todas" && categoriaTemplateAtendimento(item.categoria) !== categoria) return false;
            if (!termo) return true;
            const texto = [item.titulo, item.mensagem, item.atalho, rotuloCategoriaTemplate(item.categoria)]
                .filter(Boolean).join(" ").toLowerCase();
            return texto.includes(termo);
        });
}

export function ordenarTemplatesAtendimento(templates, criterio = "ordem") {
    const lista = [...(templates || [])];
    switch (criterio) {
        case "recente":
            return lista.sort((a, b) => (b.atualizadoEm || 0) - (a.atualizadoEm || 0));
        case "mais_usado":
            return lista.sort((a, b) => (b.usoTotal || 0) - (a.usoTotal || 0));
        case "alfabetica":
            return lista.sort((a, b) => String(a.titulo || "").localeCompare(String(b.titulo || ""), "pt-BR"));
        case "ordem":
        default:
            return lista.sort((a, b) => (a.ordem ?? 9999) - (b.ordem ?? 9999) || String(a.titulo || "").localeCompare(String(b.titulo || ""), "pt-BR"));
    }
}

// "Recentes" = realmente enviados (ultimoUsoEm, atualizado só no envio
// bem-sucedido — nunca em abertura/preview), não os últimos editados.
export function templatesRecentementeUsados(templates, limite = 6) {
    return (templates || [])
        .filter(templateVisivelNoAtendimento)
        .filter(item => item.ativo !== false && !item.arquivadoEm && item.ultimoUsoEm)
        .sort((a, b) => normalizarUsoMs(b.ultimoUsoEm) - normalizarUsoMs(a.ultimoUsoEm))
        .slice(0, Math.max(0, limite));
}

export function templatesMaisUsados(templates, limite = 6) {
    return (templates || [])
        .filter(templateVisivelNoAtendimento)
        .filter(item => item.ativo !== false && !item.arquivadoEm && (item.usoTotal || 0) > 0)
        .sort((a, b) => (b.usoTotal || 0) - (a.usoTotal || 0))
        .slice(0, Math.max(0, limite));
}

function normalizarUsoMs(valor) {
    if (!valor) return 0;
    if (typeof valor.toMillis === "function") return valor.toMillis();
    if (typeof valor.seconds === "number") return valor.seconds * 1000;
    return typeof valor === "number" ? valor : 0;
}

// ---------- Atalhos ("/") ----------
// Usado pelo autocomplete do compositor: usuário digita "/pra" e o menu
// sugere templates cujo atalho comece por "pra" (nunca executa nada —
// só filtra a lista já carregada em memória).
export function sugerirTemplatesPorAtalho(templates, prefixo) {
    const termo = normalizarAtalho(prefixo);
    return (templates || [])
        .filter(templateVisivelNoAtendimento)
        .filter(item => item.ativo !== false && !item.arquivadoEm && item.atalho)
        .filter(item => !termo || normalizarAtalho(item.atalho).startsWith(termo))
        .slice(0, 8);
}

export function atalhoJaEmUso(templates, atalhoNormalizado, { ignorarId = "" } = {}) {
    if (!atalhoNormalizado) return false;
    return (templates || []).some(item =>
        item.id !== ignorarId &&
        item.ativo !== false &&
        !item.arquivadoEm &&
        normalizarAtalho(item.atalho) === atalhoNormalizado
    );
}
