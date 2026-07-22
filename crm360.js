// CRM 360 do Cliente — evolui o painel lateral da Central de Atendimento
// (chats) reaproveitando leads/pedidos/produtos já existentes. Plano
// Blaze, escrita direta protegida por Rules: sem IA real, sem WhatsApp,
// sem automação nesta etapa — só identidade, relacionamento e histórico.

import { funcionarioPodeAtender } from "./atendimento.js";

export { funcionarioPodeAtender };

export const STATUS_RELACIONAMENTO = Object.freeze({
    novo: "Novo",
    lead: "Lead",
    qualificado: "Qualificado",
    negociacao: "Em negociação",
    cliente: "Cliente",
    recorrente: "Recorrente",
    inativo: "Inativo",
    perdido: "Perdido"
});

export const TAGS_SUGERIDAS_CLIENTE = Object.freeze([
    "lead quente", "cliente recorrente", "orcamento enviado", "aguardando pagamento",
    "vip", "suporte", "pos-venda"
]);

export const LIMITES_CRM = Object.freeze({
    observacaoMax: 2000,
    tagMax: 40,
    maxTags: 15,
    maxProdutosInteresse: 20,
    diasInativoSugestao: 60
});

// ---------- Normalização (Fase 2) ----------
// Espelha EXATAMENTE normalizePhone()/normalizeEmail() de lp-forms-v5.js —
// leads já gravam telefone/email nesse formato, então usar o mesmo
// algoritmo aqui é o que permite comparar sem migrar nada.
export function normalizarTelefone(valor) {
    let digits = String(valor || "").replace(/\D/g, "");
    if (digits.length === 10 || digits.length === 11) {
        digits = `55${digits}`;
    }
    return digits;
}

export function normalizarEmail(valor) {
    return String(valor || "").trim().toLowerCase();
}

export function telefoneValido(normalizado) {
    return typeof normalizado === "string" && normalizado.length >= 12 && normalizado.length <= 13;
}

export function emailValido(normalizado) {
    return typeof normalizado === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizado);
}

// ---------- Identidade canônica (Fase 2) ----------
// Ordem de prioridade: clienteId explícito > authUid > leadId/pedidoId
// vinculados explicitamente > telefone normalizado > email normalizado.
// Nunca usa só o nome. Sempre dentro do mesmo tenant (quem chama já filtra
// por tenant nas queries — aqui só decidimos a prioridade do match).
export function resolverIdentidadeCliente({ clienteId, authUid, leadIdVinculado, pedidoIdVinculado, telefoneNormalizado, emailNormalizado } = {}) {
    if (clienteId) return { estrategia: "clienteId", valor: clienteId };
    if (authUid) return { estrategia: "authUid", valor: authUid };
    if (leadIdVinculado) return { estrategia: "leadId", valor: leadIdVinculado };
    if (pedidoIdVinculado) return { estrategia: "pedidoId", valor: pedidoIdVinculado };
    if (telefoneNormalizado && telefoneValido(telefoneNormalizado)) return { estrategia: "telefone", valor: telefoneNormalizado };
    if (emailNormalizado && emailValido(emailNormalizado)) return { estrategia: "email", valor: emailNormalizado };
    return { estrategia: "nenhuma", valor: "" };
}

// Encontra candidatos a "mesmo cliente" dentro de uma lista já filtrada
// pelo tenant (a chamada nunca deve misturar listas de tenants diferentes).
// Retorna { correspondencias, ambiguo } — ambiguo quando há mais de um
// candidato distinto e nenhum critério forte (clienteId/authUid) desempata.
export function encontrarCorrespondencias(referencia, candidatos) {
    const lista = Array.isArray(candidatos) ? candidatos : [];
    const telRef = referencia?.telefoneNormalizado || "";
    const emailRef = referencia?.emailNormalizado || "";
    const authUidRef = referencia?.authUid || "";

    const porAuthUid = authUidRef ? lista.filter(c => c.authUid && c.authUid === authUidRef) : [];
    if (porAuthUid.length > 0) return { correspondencias: porAuthUid, criterio: "authUid", ambiguo: false };

    const porTelefone = telRef ? lista.filter(c => c.telefoneNormalizado && c.telefoneNormalizado === telRef) : [];
    const porEmail = emailRef ? lista.filter(c => c.emailNormalizado && c.emailNormalizado === emailRef) : [];

    const combinados = new Map();
    [...porTelefone, ...porEmail].forEach(c => combinados.set(c.id, c));
    const correspondencias = Array.from(combinados.values());

    if (correspondencias.length === 0) return { correspondencias: [], criterio: "nenhum", ambiguo: false };
    if (correspondencias.length === 1) {
        return { correspondencias, criterio: porTelefone.length ? "telefone" : "email", ambiguo: false };
    }
    // Mais de um candidato distinto batendo por telefone/e-mail: ambíguo,
    // decisão fica para um humano (nunca escolhe sozinho).
    return { correspondencias, criterio: "multiplo", ambiguo: true };
}

// ---------- Status do relacionamento (Fase 4) ----------
export function statusRelacionamentoValido(status) {
    return status in STATUS_RELACIONAMENTO;
}

// Só SUGERE — a mudança de status é sempre uma ação explícita da equipe.
export function sugerirStatusRelacionamento({ statusAtual = "novo", pedidosPagos = 0, diasDesdeUltimaCompra = null } = {}) {
    if (statusAtual === "perdido" || statusAtual === "inativo") return null;
    if (pedidosPagos >= 2 && statusAtual !== "recorrente") {
        return { sugestao: "recorrente", motivo: "Já tem 2 ou mais pedidos pagos." };
    }
    if (pedidosPagos === 1 && !["cliente", "recorrente"].includes(statusAtual)) {
        return { sugestao: "cliente", motivo: "Tem um pedido pago." };
    }
    if (typeof diasDesdeUltimaCompra === "number" && diasDesdeUltimaCompra >= LIMITES_CRM.diasInativoSugestao
        && ["cliente", "recorrente"].includes(statusAtual)) {
        return { sugestao: "inativo", motivo: `Sem interação há ${diasDesdeUltimaCompra} dias.` };
    }
    return null;
}

// ---------- Tags (Fase 3, seção 7) ----------
export function slugTag(nome) {
    return String(nome || "")
        .trim()
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, LIMITES_CRM.tagMax);
}

export function tagJaExiste(slugNovo, tagsExistentes) {
    return (tagsExistentes || []).some(t => (t.slug || slugTag(t.nome)) === slugNovo);
}

export function adicionarTagCliente(tagsAtuais, novaTagSlug) {
    const atuais = Array.isArray(tagsAtuais) ? tagsAtuais : [];
    if (!novaTagSlug || atuais.includes(novaTagSlug)) return atuais;
    if (atuais.length >= LIMITES_CRM.maxTags) return atuais;
    return [...atuais, novaTagSlug];
}

export function removerTagCliente(tagsAtuais, tagSlug) {
    return (Array.isArray(tagsAtuais) ? tagsAtuais : []).filter(t => t !== tagSlug);
}

// ---------- Resumo comercial (Fase 3, seção 2) ----------
// Recebe SÓ os pedidos já filtrados por cliente (quem chama faz a query
// restrita — nunca carregar o tenant inteiro pra calcular isto).
export function calcularResumoComercial(pedidosDoCliente) {
    const pedidos = Array.isArray(pedidosDoCliente) ? pedidosDoCliente : [];
    const pagos = pedidos.filter(p => p.status === "pago");
    const cancelados = pedidos.filter(p => p.status === "cancelado");
    const valorTotal = pagos.reduce((soma, p) => soma + (Number(p.valor) || 0), 0);
    const ordenadosPorData = [...pedidos].sort((a, b) => (Number(b.data) || 0) - (Number(a.data) || 0));
    const ultimoPedido = ordenadosPorData[0] || null;
    const diasDesdeUltimaCompra = ultimoPedido?.data
        ? Math.floor((Date.now() - Number(ultimoPedido.data)) / 86400000)
        : null;

    // "Produtos mais comprados": pedidos.produtos é texto livre (não é FK),
    // então isto é uma contagem best-effort por texto idêntico após
    // normalizar espaços/caixa — não uma contagem por produtoId real.
    const contagemProdutos = new Map();
    pedidos.forEach(p => {
        String(p.produtos || "").split(",").map(s => s.trim()).filter(Boolean).forEach(nome => {
            const chave = nome.toLowerCase();
            contagemProdutos.set(chave, { nome, total: (contagemProdutos.get(chave)?.total || 0) + 1 });
        });
    });
    const produtosMaisComprados = Array.from(contagemProdutos.values())
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);

    return {
        totalPedidos: pedidos.length,
        pedidosPagos: pagos.length,
        pedidosCancelados: cancelados.length,
        valorTotal,
        ticketMedio: pagos.length > 0 ? valorTotal / pagos.length : 0,
        ultimoPedido,
        diasDesdeUltimaCompra,
        produtosMaisComprados
    };
}

// ---------- Produtos de interesse (Fase 6) ----------
export function validarProdutoInteresse(item) {
    if (!item?.produtoId) return "Selecione um produto.";
    if (!item?.nomeSnapshot) return "Produto sem nome.";
    return "";
}

export function adicionarProdutoInteresse(listaAtual, produto, { vinculadoPor, origem = "manual" } = {}) {
    const atuais = Array.isArray(listaAtual) ? listaAtual : [];
    if (atuais.some(p => p.produtoId === produto.id)) return atuais;
    if (atuais.length >= LIMITES_CRM.maxProdutosInteresse) return atuais;
    return [...atuais, {
        produtoId: produto.id,
        nomeSnapshot: String(produto.nome || "").slice(0, 160),
        precoSnapshot: Number(produto.preco) || 0,
        vinculadoEm: Date.now(),
        vinculadoPor: vinculadoPor || "",
        origem
    }];
}

export function removerProdutoInteresse(listaAtual, produtoId) {
    return (Array.isArray(listaAtual) ? listaAtual : []).filter(p => p.produtoId !== produtoId);
}

// ---------- Observações internas (Fase 3, seção 6) ----------
export function validarObservacaoCliente(texto) {
    const valor = String(texto || "").trim();
    if (!valor) return "A observação não pode ficar vazia.";
    if (valor.length > LIMITES_CRM.observacaoMax) return `A observação pode ter no máximo ${LIMITES_CRM.observacaoMax} caracteres.`;
    return "";
}

// ---------- Linha do tempo (Fase 7) ----------
export const TIPOS_EVENTO_TIMELINE = Object.freeze({
    primeiro_contato: "Primeiro contato",
    conversa_criada: "Conversa criada",
    lead_criado: "Lead criado",
    lead_vinculado: "Lead vinculado",
    pedido_criado: "Pedido criado",
    pedido_vinculado: "Pedido vinculado",
    pagamento_confirmado: "Pagamento confirmado",
    pedido_cancelado: "Pedido cancelado",
    tag_adicionada: "Tag adicionada",
    tag_removida: "Tag removida",
    status_alterado: "Status alterado",
    responsavel_alterado: "Responsável alterado",
    observacao_adicionada: "Observação adicionada",
    produto_vinculado: "Produto de interesse vinculado"
});

const CATEGORIA_POR_TIPO = Object.freeze({
    conversa_criada: "conversas",
    primeiro_contato: "conversas",
    lead_criado: "leads",
    lead_vinculado: "leads",
    pedido_criado: "pedidos",
    pedido_vinculado: "pedidos",
    pagamento_confirmado: "pedidos",
    pedido_cancelado: "pedidos",
    tag_adicionada: "alteracoes",
    tag_removida: "alteracoes",
    status_alterado: "alteracoes",
    responsavel_alterado: "alteracoes",
    observacao_adicionada: "alteracoes",
    produto_vinculado: "alteracoes"
});

export function categoriaEvento(tipo) {
    return CATEGORIA_POR_TIPO[tipo] || "alteracoes";
}

export function ordenarTimeline(eventos) {
    return [...(eventos || [])].sort((a, b) => (Number(b.criadoEm) || 0) - (Number(a.criadoEm) || 0));
}

export function filtrarTimeline(eventos, filtro = "todos") {
    if (filtro === "todos") return eventos || [];
    return (eventos || []).filter(e => categoriaEvento(e.tipo) === filtro);
}
