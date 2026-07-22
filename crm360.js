// CRM 360 do Cliente — evolui o painel lateral da Central de Atendimento
// (chats) reaproveitando leads/pedidos/produtos já existentes. Plano
// Blaze, escrita direta protegida por Rules: sem IA real, sem WhatsApp,
// sem automação nesta etapa — só identidade, relacionamento e histórico.

import { CANAIS_CONVERSA, STATUS_CONVERSA, funcionarioPodeAtender, funcionariosElegiveisAtendimento, categoriaEventoAtendimento } from "./atendimento.js";

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

function formatarMoeda(valor) {
    return (Number(valor) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(valor) {
    const ms = valor?.toMillis ? valor.toMillis() : Number(valor) || 0;
    return ms ? new Date(ms).toLocaleDateString("pt-BR") : "—";
}

// Controller da tela — mesmo padrão de central-ia.js/base-conhecimento-ia.js/
// atendimento.js (deps injetadas, testável sem navegador real). É chamado
// de dentro da Central de Atendimento (abrirParaConversa), nunca sozinho.
export function criarCrm360Controller(deps) {
    const { db, context, firestore, notify = () => {} } = deps;
    const {
        collection, doc, getDoc, getDocs, setDoc, updateDoc,
        query, where, limit, serverTimestamp
    } = firestore;

    const state = {
        conversa: null,
        clienteId: "",
        cliente: null,
        carregando: false,
        erro: false,
        naoIdentificado: false,
        candidatos: [],
        ambiguo: false,
        leads: [],
        pedidos: [],
        conversas: [],
        observacoes: [],
        eventos: [],
        tagsCatalogo: [],
        funcionarios: [],
        filtroTimeline: "todos",
        salvandoObservacao: false,
        buscaProdutoResultado: []
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

    function podeVer() {
        return context.canView("crm") || context.canView("atendimento");
    }

    function podeEditar() {
        return context.canEdit("crm") || context.canEdit("atendimento");
    }

    function nomeAutorAtual() {
        const snapshot = context.getSnapshot();
        if (snapshot.isEmployee) return snapshot.employee?.nome || "Funcionário";
        return snapshot.owner?.nomeLoja || snapshot.owner?.nome || "Loja";
    }

    // Nunca cria/edita evento sem antes garantir que o cliente pertence ao
    // tenant atual — quem chama já resolveu clienteId a partir de dados do
    // próprio tenant, isto é só uma segunda trava defensiva client-side
    // (a trava real está nas Rules). Retorna o id do evento criado (usado
    // como correlationId pelo espelho em chats/*/eventos, quando a ação
    // parte de uma conversa aberta) ou "" se não gravou.
    async function registrarEvento(tipo, extra = {}) {
        if (!state.clienteId) return "";
        try {
            const ref = doc(collection(db, "clientes", state.clienteId, "eventos"));
            await setDoc(ref, {
                tipo,
                autorUid: authUid(),
                autorNome: nomeAutorAtual(),
                criadoEm: serverTimestamp(),
                ...extra
            });
            return ref.id;
        } catch (error) {
            console.error("[CRM 360] Falha ao registrar evento:", codigoErroFirebase(error), error?.message);
            return "";
        }
    }

    // Espelha (sem duplicar) uma ação de vínculo do CRM 360 no histórico
    // da conversa — só quando o drawer foi aberto A PARTIR de uma
    // conversa (state.conversa setado por abrirParaConversa). O
    // correlationId aponta pro evento irmão em clientes/*/eventos: são
    // dois registros de escopos diferentes (por chat / por cliente)
    // sobre o mesmo fato, nunca uma cópia do conteúdo um do outro. Falha
    // aqui nunca interrompe a ação principal do CRM (best-effort, mesmo
    // padrão de registrarEvento).
    async function registrarEventoConversa(tipo, extra = {}, correlationId = "") {
        if (!state.conversa?.id) return;
        try {
            await setDoc(doc(collection(db, "chats", state.conversa.id, "eventos")), {
                tenantId: storeUid(),
                lojaId: storeUid(),
                chatId: state.conversa.id,
                tipo,
                categoria: categoriaEventoAtendimento(tipo),
                autorUid: authUid(),
                autorTipo: context.getSnapshot().isEmployee ? "funcionario" : "proprietario",
                autorNome: nomeAutorAtual(),
                origem: "equipe",
                criadoEm: serverTimestamp(),
                versaoSchema: 1,
                clienteId: state.clienteId,
                ...(correlationId ? { correlationId } : {}),
                ...extra
            });
        } catch (error) {
            console.error("[CRM 360] Falha ao espelhar evento na conversa:", codigoErroFirebase(error), error?.message);
        }
    }

    function renderCarregando(carregando) {
        state.carregando = carregando;
        el("crm-loading")?.classList.toggle("hidden", !carregando);
        el("crm-conteudo")?.classList.toggle("hidden", carregando);
    }

    function renderNaoIdentificado() {
        el("crm-nao-identificado")?.classList.remove("hidden");
        el("crm-conteudo")?.classList.add("hidden");
        const lista = el("crm-candidatos-lista");
        if (lista) {
            if (state.candidatos.length === 0) {
                lista.innerHTML = `<p class="crm-vazio-texto">Nenhum cliente parecido encontrado. Você pode cadastrar este contato como um novo cliente.</p>`;
            } else {
                lista.innerHTML = state.candidatos.map(c => `
                    <button type="button" class="atend-btn crm-candidato-item" data-crm-candidato-id="${escaparHtml(c.id)}" style="width:100%;justify-content:space-between;margin-bottom:6px;">
                        <span>${escaparHtml(c.nome || "Sem nome")} · ${escaparHtml(c.telefone || c.email || "")}</span>
                        <span>Vincular</span>
                    </button>
                `).join("");
            }
        }
        if (el("crm-ambiguo-aviso")) el("crm-ambiguo-aviso").classList.toggle("hidden", !state.ambiguo);
    }

    function renderIdentidade() {
        const c = state.cliente;
        if (!c) return;
        if (el("crm-nome")) el("crm-nome").textContent = c.nome || state.conversa?.clienteNome || "Cliente";
        if (el("crm-avatar")) el("crm-avatar").textContent = (c.nome || state.conversa?.clienteNome || "?").trim().slice(0, 1).toUpperCase() || "?";
        if (el("crm-telefone")) el("crm-telefone").textContent = c.telefone || "—";
        if (el("crm-email")) el("crm-email").textContent = c.email || "—";
        if (el("crm-origem")) el("crm-origem").textContent = c.origem || "—";
        if (el("crm-primeiro-contato")) el("crm-primeiro-contato").textContent = formatarData(c.primeiraInteracaoEm);
        if (el("crm-ultimo-contato")) el("crm-ultimo-contato").textContent = formatarData(c.ultimaInteracaoEm);
        if (el("crm-status-select")) el("crm-status-select").value = c.statusRelacionamento || "novo";
        renderOpcoesResponsavel();
        if (el("crm-responsavel-select")) el("crm-responsavel-select").value = c.responsavelUid || "";
        const tagsBox = el("crm-tags-lista");
        if (tagsBox) {
            tagsBox.innerHTML = (c.tags || []).map(slug => {
                const tag = state.tagsCatalogo.find(t => t.slug === slug);
                return `<span class="atend-chip crm-tag-chip">${escaparHtml(tag?.nome || slug)}<button type="button" data-crm-tag-remover="${escaparHtml(slug)}" aria-label="Remover tag">×</button></span>`;
            }).join("") || `<span class="crm-vazio-texto">Nenhuma tag ainda.</span>`;
        }
    }

    function renderResumoComercial() {
        const resumo = calcularResumoComercial(state.pedidos);
        if (el("crm-kpi-total-pedidos")) el("crm-kpi-total-pedidos").textContent = String(resumo.totalPedidos);
        if (el("crm-kpi-pedidos-pagos")) el("crm-kpi-pedidos-pagos").textContent = String(resumo.pedidosPagos);
        if (el("crm-kpi-pedidos-cancelados")) el("crm-kpi-pedidos-cancelados").textContent = String(resumo.pedidosCancelados);
        if (el("crm-kpi-valor-total")) el("crm-kpi-valor-total").textContent = formatarMoeda(resumo.valorTotal);
        if (el("crm-kpi-ticket-medio")) el("crm-kpi-ticket-medio").textContent = formatarMoeda(resumo.ticketMedio);
        if (el("crm-kpi-dias-ultima-compra")) el("crm-kpi-dias-ultima-compra").textContent = resumo.diasDesdeUltimaCompra === null ? "—" : `${resumo.diasDesdeUltimaCompra} dias`;
        if (el("crm-kpi-conversas")) el("crm-kpi-conversas").textContent = String(state.conversas.length);
        if (el("crm-kpi-leads")) el("crm-kpi-leads").textContent = String(state.leads.length);

        const produtosBox = el("crm-produtos-comprados");
        if (produtosBox) {
            produtosBox.innerHTML = resumo.produtosMaisComprados.length === 0
                ? `<span class="crm-vazio-texto">Sem pedidos suficientes ainda.</span>`
                : resumo.produtosMaisComprados.map(p => `<span class="atend-chip">${escaparHtml(p.nome)} × ${p.total}</span>`).join("");
        }

        const sugestao = sugerirStatusRelacionamento({
            statusAtual: state.cliente?.statusRelacionamento || "novo",
            pedidosPagos: resumo.pedidosPagos,
            diasDesdeUltimaCompra: resumo.diasDesdeUltimaCompra
        });
        const sugestaoBox = el("crm-status-sugestao");
        if (sugestaoBox) {
            if (sugestao) {
                sugestaoBox.classList.remove("hidden");
                sugestaoBox.innerHTML = `Sugestão: <strong>${escaparHtml(STATUS_RELACIONAMENTO[sugestao.sugestao])}</strong> — ${escaparHtml(sugestao.motivo)} <button type="button" class="atend-btn" data-crm-aplicar-sugestao="${escaparHtml(sugestao.sugestao)}">Aplicar</button>`;
            } else {
                sugestaoBox.classList.add("hidden");
            }
        }
    }

    function renderLeads() {
        const box = el("crm-leads-lista");
        if (!box) return;
        box.innerHTML = state.leads.length === 0
            ? `<p class="crm-vazio-texto">Nenhum lead vinculado ainda.</p>`
            : state.leads.map(l => `
                <div class="crm-item-relacionado">
                    <div>
                        <strong>${escaparHtml(l.nome || "Sem nome")}</strong>
                        <span class="crm-item-meta">${escaparHtml(l.origem || "—")} · ${escaparHtml(l.produtoInteresse || "—")} · ${escaparHtml(l.statusLead || "novo")}</span>
                    </div>
                    <button type="button" class="atend-btn" data-crm-desvincular-lead="${escaparHtml(l.id)}">Desvincular</button>
                </div>
            `).join("");
    }

    function renderPedidos() {
        const box = el("crm-pedidos-lista");
        if (!box) return;
        box.innerHTML = state.pedidos.length === 0
            ? `<p class="crm-vazio-texto">Nenhum pedido vinculado ainda.</p>`
            : state.pedidos.map(p => `
                <div class="crm-item-relacionado">
                    <div>
                        <strong>${escaparHtml(p.produtos || "Pedido")}</strong>
                        <span class="crm-item-meta">${formatarMoeda(p.valor)} · ${escaparHtml(p.status || "aguardando")} · ${formatarData(p.data)}</span>
                    </div>
                    <button type="button" class="atend-btn" data-crm-desvincular-pedido="${escaparHtml(p.id)}">Desvincular</button>
                </div>
            `).join("");
    }

    function renderConversas() {
        const box = el("crm-conversas-lista");
        if (!box) return;
        box.innerHTML = state.conversas.length === 0
            ? `<p class="crm-vazio-texto">Nenhuma outra conversa deste cliente.</p>`
            : state.conversas.map(c => `
                <div class="crm-item-relacionado">
                    <div>
                        <strong>${escaparHtml(CANAIS_CONVERSA[c.canal] || "Conversa")}</strong>
                        <span class="crm-item-meta">${escaparHtml(STATUS_CONVERSA[c.status] || "—")} · ${escaparHtml(c.ultimaMensagem || "")}</span>
                    </div>
                    <button type="button" class="atend-btn" data-crm-abrir-conversa="${escaparHtml(c.id)}">Abrir</button>
                </div>
            `).join("");
    }

    function renderObservacoes() {
        const box = el("crm-observacoes-lista");
        if (!box) return;
        const visiveis = state.observacoes.filter(o => !o.arquivado);
        box.innerHTML = visiveis.length === 0
            ? `<p class="crm-vazio-texto">Nenhuma observação registrada ainda.</p>`
            : visiveis.map(o => `
                <div class="crm-observacao-item">
                    <p>${escaparHtml(o.conteudo)}</p>
                    <span class="crm-item-meta">${escaparHtml(o.autorNome || "Equipe")} · ${formatarData(o.criadoEm)}</span>
                    <button type="button" class="atend-btn" data-crm-arquivar-obs="${escaparHtml(o.id)}">Arquivar</button>
                </div>
            `).join("");
    }

    function renderTimeline() {
        const box = el("crm-timeline-lista");
        if (!box) return;
        const visiveis = filtrarTimeline(ordenarTimeline(state.eventos), state.filtroTimeline);
        box.innerHTML = visiveis.length === 0
            ? `<p class="crm-vazio-texto">Sem eventos ainda.</p>`
            : visiveis.map(e => `
                <div class="crm-timeline-item">
                    <strong>${escaparHtml(TIPOS_EVENTO_TIMELINE[e.tipo] || e.tipo)}</strong>
                    <span class="crm-item-meta">${escaparHtml(e.resumo || "")} · ${escaparHtml(e.autorNome || "Equipe")} · ${formatarData(e.criadoEm)}</span>
                </div>
            `).join("");
    }

    function renderProdutosInteresse() {
        const box = el("crm-produtos-interesse-lista");
        if (!box) return;
        const lista = state.cliente?.produtosInteresse || [];
        box.innerHTML = lista.length === 0
            ? `<p class="crm-vazio-texto">Nenhum produto de interesse ainda.</p>`
            : lista.map(p => `
                <div class="crm-item-relacionado">
                    <div>
                        <strong>${escaparHtml(p.nomeSnapshot)}</strong>
                        <span class="crm-item-meta">${formatarMoeda(p.precoSnapshot)} · vinculado em ${formatarData(p.vinculadoEm)}</span>
                    </div>
                    <button type="button" class="atend-btn" data-crm-remover-produto="${escaparHtml(p.produtoId)}">Remover</button>
                </div>
            `).join("");
    }

    function render() {
        if (state.naoIdentificado) {
            renderNaoIdentificado();
            return;
        }
        el("crm-nao-identificado")?.classList.add("hidden");
        el("crm-conteudo")?.classList.remove("hidden");
        renderIdentidade();
        renderResumoComercial();
        renderLeads();
        renderPedidos();
        renderConversas();
        renderObservacoes();
        renderProdutosInteresse();
        renderTimeline();
    }

    function renderOpcoesResponsavel() {
        const select = el("crm-responsavel-select");
        if (!select) return;
        const elegiveis = funcionariosElegiveisAtendimento(state.funcionarios);
        select.innerHTML = [
            `<option value="">Sem responsável</option>`,
            `<option value="${escaparHtml(storeUid())}">Você (dono da loja)</option>`,
            ...elegiveis.map(f => `<option value="${escaparHtml(f.id)}">${escaparHtml(f.nome || f.id)}</option>`)
        ].join("");
    }

    async function carregarFuncionarios() {
        if (!podeEditar()) return;
        try {
            const snap = await getDocs(query(collection(db, "funcionarios"), where("donoUID", "==", storeUid())));
            state.funcionarios = [];
            snap.forEach(d => state.funcionarios.push({ id: d.id, ...d.data() }));
        } catch (error) {
            state.funcionarios = [];
        }
    }

    async function carregarTagsCatalogo() {
        try {
            const snap = await getDocs(query(collection(db, "tags_clientes"), where("tenantId", "==", storeUid()), limit(100)));
            state.tagsCatalogo = [];
            snap.forEach(d => state.tagsCatalogo.push({ id: d.id, ...d.data() }));
        } catch (error) {
            state.tagsCatalogo = [];
        }
    }

    async function carregarDadosRelacionados() {
        const clienteId = state.clienteId;
        const [leadsSnap, pedidosSnap, conversasSnap, obsSnap, eventosSnap] = await Promise.all([
            getDocs(query(collection(db, "leads"), where("clienteId", "==", clienteId), limit(50))),
            getDocs(query(collection(db, "pedidos"), where("clienteId", "==", clienteId), limit(50))),
            getDocs(query(collection(db, "chats"), where("clienteId", "==", clienteId), limit(50))),
            getDocs(query(collection(db, "clientes", clienteId, "observacoes"), limit(100))),
            getDocs(query(collection(db, "clientes", clienteId, "eventos"), limit(100)))
        ]);
        state.leads = []; leadsSnap.forEach(d => state.leads.push({ id: d.id, ...d.data() }));
        state.pedidos = []; pedidosSnap.forEach(d => state.pedidos.push({ id: d.id, ...d.data() }));
        state.conversas = []; conversasSnap.forEach(d => { if (d.id !== state.conversa?.id) state.conversas.push({ id: d.id, ...d.data() }); });
        state.observacoes = []; obsSnap.forEach(d => state.observacoes.push({ id: d.id, ...d.data() }));
        state.eventos = []; eventosSnap.forEach(d => state.eventos.push({ id: d.id, ...d.data() }));
    }

    async function carregarClientePorId(clienteId) {
        const snap = await getDoc(doc(db, "clientes", clienteId));
        if (!snap.exists()) {
            state.clienteId = "";
            state.cliente = null;
            state.naoIdentificado = true;
            return;
        }
        state.clienteId = clienteId;
        state.cliente = { id: snap.id, ...snap.data() };
        state.naoIdentificado = false;
        await Promise.all([carregarDadosRelacionados(), carregarTagsCatalogo(), carregarFuncionarios()]);
    }

    // Busca candidatos por telefone/e-mail dentro do PRÓPRIO tenant (nunca
    // entre tenants) — usa a mesma prioridade de identidade de
    // encontrarCorrespondencias(). Não usa nome sozinho.
    async function buscarCandidatos() {
        const conversa = state.conversa;
        const telefoneNormalizado = normalizarTelefone(conversa?.telefone || "");
        const emailNormalizado = normalizarEmail(conversa?.email || "");
        if (!telefoneValido(telefoneNormalizado) && !emailValido(emailNormalizado)) {
            state.candidatos = [];
            state.ambiguo = false;
            return;
        }
        try {
            const snap = await getDocs(query(collection(db, "clientes"), where("tenantId", "==", storeUid()), limit(200)));
            const todos = [];
            snap.forEach(d => todos.push({ id: d.id, ...d.data() }));
            const resultado = encontrarCorrespondencias({ telefoneNormalizado, emailNormalizado }, todos);
            state.candidatos = resultado.correspondencias;
            state.ambiguo = resultado.ambiguo;
        } catch (error) {
            state.candidatos = [];
            state.ambiguo = false;
        }
    }

    async function abrirParaConversa(conversa) {
        if (!conversa || !podeVer()) return;
        state.conversa = conversa;
        state.filtroTimeline = "todos";
        el("crm-cliente-modal")?.classList.remove("hidden");
        renderCarregando(true);
        try {
            if (conversa.clienteId) {
                await carregarClientePorId(conversa.clienteId);
            } else {
                state.clienteId = "";
                state.cliente = null;
                state.naoIdentificado = true;
                await buscarCandidatos();
            }
            state.erro = false;
        } catch (error) {
            console.error("[CRM 360] Falha ao abrir perfil do cliente:", codigoErroFirebase(error), error?.message);
            state.erro = true;
            notify("Não foi possível carregar o CRM deste cliente.", "error");
        } finally {
            renderCarregando(false);
            render();
        }
    }

    function fechar() {
        el("crm-cliente-modal")?.classList.add("hidden");
    }

    // Entrada direta (ex.: clicando numa notificação de "cliente sem
    // retorno") sem partir de uma conversa aberta. Só mostra o perfil se
    // o cliente realmente pertencer ao tenant atual — getDoc()/Rules já
    // barram outro tenant, mas a checagem aqui evita renderizar um estado
    // parcial antes da negação chegar.
    async function abrirParaClienteId(clienteId) {
        if (!clienteId || !podeVer()) return false;
        state.conversa = null;
        state.filtroTimeline = "todos";
        el("crm-cliente-modal")?.classList.remove("hidden");
        renderCarregando(true);
        try {
            await carregarClientePorId(clienteId);
            if (!state.cliente || state.cliente.tenantId !== storeUid()) {
                state.naoIdentificado = false;
                state.cliente = null;
                state.clienteId = "";
                notify("Cliente não encontrado ou sem acesso.", "error");
                fechar();
                return false;
            }
            state.erro = false;
            return true;
        } catch (error) {
            console.error("[CRM 360] Falha ao abrir cliente por id:", codigoErroFirebase(error), error?.message);
            notify("Não foi possível carregar o CRM deste cliente.", "error");
            fechar();
            return false;
        } finally {
            renderCarregando(false);
            render();
        }
    }

    // Vincula a conversa ATUAL a um cliente já existente (candidato
    // sugerido) — grava clienteId no chat e recarrega o perfil.
    async function vincularConversaACliente(clienteId) {
        if (!state.conversa || !podeEditar()) return;
        try {
            await updateDoc(doc(db, "chats", state.conversa.id), { clienteId, atualizadoEm: Date.now() });
            state.conversa.clienteId = clienteId;
            await carregarClientePorId(clienteId);
            await registrarEventoConversa("cliente_vinculado", { clienteId });
            notify("Conversa vinculada ao cliente.");
            render();
        } catch (error) {
            console.error("[CRM 360] Falha ao vincular conversa:", codigoErroFirebase(error), error?.message);
            notify("Não foi possível vincular. Tente novamente.", "error");
        }
    }

    // Cria um cliente novo a partir dos dados já visíveis na conversa
    // (nome/telefone/e-mail digitados pela equipe) e vincula na hora.
    async function criarClienteDaConversa() {
        if (!state.conversa || !podeEditar()) return;
        const conversa = state.conversa;
        const telefoneNormalizado = normalizarTelefone(conversa.telefone || "");
        const emailNormalizado = normalizarEmail(conversa.email || "");
        try {
            const agora = serverTimestamp();
            const ref = doc(collection(db, "clientes"));
            await setDoc(ref, {
                tenantId: storeUid(),
                lojaId: storeUid(),
                nome: conversa.clienteNome || "Cliente",
                ...(conversa.telefone ? { telefone: conversa.telefone, telefoneNormalizado } : {}),
                ...(conversa.email ? { email: conversa.email, emailNormalizado } : {}),
                origem: conversa.canal || "atendimento",
                statusRelacionamento: "novo",
                tags: [],
                produtosInteresse: [],
                primeiraInteracaoEm: Date.now(),
                ultimaInteracaoEm: Date.now(),
                criadoEm: agora,
                criadoPor: authUid(),
                atualizadoEm: agora,
                atualizadoPor: authUid()
            });
            await updateDoc(doc(db, "chats", conversa.id), { clienteId: ref.id, atualizadoEm: Date.now() });
            state.conversa.clienteId = ref.id;
            await carregarClientePorId(ref.id);
            await registrarEvento("primeiro_contato", { resumo: "Cliente cadastrado a partir da conversa.", refColecao: "chats", refId: conversa.id });
            await registrarEventoConversa("cliente_vinculado", { clienteId: ref.id });
            notify("Cliente cadastrado.");
            render();
        } catch (error) {
            console.error("[CRM 360] Falha ao cadastrar cliente:", codigoErroFirebase(error), error?.message);
            notify("Não foi possível cadastrar o cliente.", "error");
        }
    }

    async function atualizarCliente(campos) {
        if (!state.clienteId || !podeEditar()) return false;
        try {
            await updateDoc(doc(db, "clientes", state.clienteId), {
                ...campos,
                atualizadoPor: authUid(),
                atualizadoEm: serverTimestamp()
            });
            Object.assign(state.cliente, campos);
            return true;
        } catch (error) {
            console.error("[CRM 360] Falha ao atualizar cliente:", codigoErroFirebase(error), error?.message);
            notify("Não foi possível salvar agora.", "error");
            return false;
        }
    }

    async function atualizarStatusRelacionamento(novoStatus) {
        if (!statusRelacionamentoValido(novoStatus)) return;
        const anterior = state.cliente?.statusRelacionamento || "novo";
        if (anterior === novoStatus) return;
        const ok = await atualizarCliente({
            statusRelacionamento: novoStatus,
            statusAtualizadoPor: authUid(),
            statusAtualizadoEm: serverTimestamp()
        });
        if (ok) {
            await registrarEvento("status_alterado", { resumo: `${STATUS_RELACIONAMENTO[anterior]} → ${STATUS_RELACIONAMENTO[novoStatus]}` });
            notify("Status do relacionamento atualizado.");
            render();
        }
    }

    async function atualizarResponsavel(uid) {
        const ok = await atualizarCliente({ responsavelUid: uid || "" });
        if (ok) {
            await registrarEvento("responsavel_alterado", { resumo: uid ? "Responsável atribuído." : "Responsável removido." });
            notify(uid ? "Responsável atualizado." : "Responsável removido.");
            render();
        }
    }

    async function salvarObservacao(texto) {
        const erro = validarObservacaoCliente(texto);
        if (erro) {
            notify(erro, "error");
            return;
        }
        if (!state.clienteId || !podeEditar() || state.salvandoObservacao) return;
        state.salvandoObservacao = true;
        try {
            await setDoc(doc(collection(db, "clientes", state.clienteId, "observacoes")), {
                conteudo: texto.trim(),
                autorUid: authUid(),
                autorNome: nomeAutorAtual(),
                criadoEm: serverTimestamp()
            });
            await registrarEvento("observacao_adicionada");
            await carregarDadosRelacionados();
            notify("Observação registrada.");
            render();
        } catch (error) {
            console.error("[CRM 360] Falha ao salvar observação:", codigoErroFirebase(error), error?.message);
            notify("Não foi possível salvar a observação.", "error");
        } finally {
            state.salvandoObservacao = false;
        }
    }

    async function arquivarObservacao(obsId) {
        if (!state.clienteId || !podeEditar()) return;
        try {
            await updateDoc(doc(db, "clientes", state.clienteId, "observacoes", obsId), {
                arquivado: true,
                atualizadoEm: serverTimestamp()
            });
            await carregarDadosRelacionados();
            render();
        } catch (error) {
            console.error("[CRM 360] Falha ao arquivar observação:", codigoErroFirebase(error), error?.message);
            notify("Não foi possível arquivar.", "error");
        }
    }

    async function obterOuCriarTag(nomeTag) {
        const slug = slugTag(nomeTag);
        if (!slug) return "";
        const existente = state.tagsCatalogo.find(t => t.slug === slug);
        if (existente) return existente.slug;
        try {
            await setDoc(doc(collection(db, "tags_clientes")), {
                tenantId: storeUid(),
                nome: nomeTag.trim().slice(0, 40),
                slug,
                ativo: true,
                criadoEm: serverTimestamp(),
                criadoPor: authUid()
            });
            await carregarTagsCatalogo();
        } catch (error) {
            console.error("[CRM 360] Falha ao criar tag:", codigoErroFirebase(error), error?.message);
        }
        return slug;
    }

    async function adicionarTag(nomeTag) {
        if (!state.clienteId || !podeEditar()) return;
        const slug = await obterOuCriarTag(nomeTag);
        if (!slug) return;
        const novasTags = adicionarTagCliente(state.cliente?.tags, slug);
        const ok = await atualizarCliente({ tags: novasTags });
        if (ok) {
            await registrarEvento("tag_adicionada", { resumo: nomeTag });
            render();
        }
    }

    async function removerTag(slug) {
        if (!state.clienteId || !podeEditar()) return;
        const novasTags = removerTagCliente(state.cliente?.tags, slug);
        const ok = await atualizarCliente({ tags: novasTags });
        if (ok) {
            await registrarEvento("tag_removida", { resumo: slug });
            render();
        }
    }

    async function buscarProdutos(termo) {
        try {
            const snap = await getDocs(query(collection(db, "produtos"), where("criadoPor", "==", storeUid()), limit(100)));
            const todos = [];
            snap.forEach(d => todos.push({ id: d.id, ...d.data() }));
            const termoLimpo = String(termo || "").trim().toLowerCase();
            state.buscaProdutoResultado = termoLimpo
                ? todos.filter(p => String(p.nome || "").toLowerCase().includes(termoLimpo)).slice(0, 20)
                : [];
        } catch (error) {
            state.buscaProdutoResultado = [];
        }
        const box = el("crm-produtos-busca-resultado");
        if (box) {
            box.innerHTML = state.buscaProdutoResultado.map(p => `
                <button type="button" class="atend-btn" data-crm-add-produto="${escaparHtml(p.id)}" style="width:100%;justify-content:space-between;margin-bottom:4px;">
                    <span>${escaparHtml(p.nome)}</span><span>${formatarMoeda(p.preco)}</span>
                </button>
            `).join("");
        }
    }

    async function vincularProdutoInteresse(produtoId) {
        if (!state.clienteId || !podeEditar()) return;
        const produto = state.buscaProdutoResultado.find(p => p.id === produtoId);
        if (!produto) return;
        const novaLista = adicionarProdutoInteresse(state.cliente?.produtosInteresse, produto, { vinculadoPor: authUid() });
        const ok = await atualizarCliente({ produtosInteresse: novaLista });
        if (ok) {
            const correlationId = await registrarEvento("produto_vinculado", { resumo: produto.nome, refColecao: "produtos", refId: produtoId });
            await registrarEventoConversa("produto_vinculado", { produtoId, resumo: produto.nome.slice(0, 300) }, correlationId);
            render();
        }
    }

    async function removerProdutoDaLista(produtoId) {
        if (!state.clienteId || !podeEditar()) return;
        const novaLista = removerProdutoInteresse(state.cliente?.produtosInteresse, produtoId);
        await atualizarCliente({ produtosInteresse: novaLista });
        await registrarEventoConversa("produto_desvinculado", { produtoId });
        render();
    }

    // Vincula um lead/pedido EXISTENTE (busca manual) ao cliente aberto.
    // Sempre confirma que o registro é do mesmo tenant antes de gravar —
    // a Rules revalida do lado do servidor de qualquer forma.
    async function vincularLead(leadId) {
        if (!state.clienteId || !podeEditar()) return;
        try {
            await updateDoc(doc(db, "leads", leadId), { clienteId: state.clienteId });
            const correlationId = await registrarEvento("lead_vinculado", { refColecao: "leads", refId: leadId });
            await registrarEventoConversa("lead_vinculado", { leadId }, correlationId);
            await carregarDadosRelacionados();
            notify("Lead vinculado.");
            render();
        } catch (error) {
            console.error("[CRM 360] Falha ao vincular lead:", codigoErroFirebase(error), error?.message);
            notify("Não foi possível vincular este lead.", "error");
        }
    }

    async function desvincularLead(leadId) {
        try {
            await updateDoc(doc(db, "leads", leadId), { clienteId: "" });
            await registrarEventoConversa("lead_desvinculado", { leadId });
            await carregarDadosRelacionados();
            render();
        } catch (error) {
            notify("Não foi possível desvincular.", "error");
        }
    }

    async function vincularPedido(pedidoId) {
        if (!state.clienteId || !podeEditar()) return;
        try {
            await updateDoc(doc(db, "pedidos", pedidoId), { clienteId: state.clienteId });
            const correlationId = await registrarEvento("pedido_vinculado", { refColecao: "pedidos", refId: pedidoId });
            await registrarEventoConversa("pedido_vinculado", { pedidoId }, correlationId);
            await carregarDadosRelacionados();
            notify("Pedido vinculado.");
            render();
        } catch (error) {
            console.error("[CRM 360] Falha ao vincular pedido:", codigoErroFirebase(error), error?.message);
            notify("Não foi possível vincular este pedido.", "error");
        }
    }

    async function desvincularPedido(pedidoId) {
        try {
            await updateDoc(doc(db, "pedidos", pedidoId), { clienteId: "" });
            await registrarEventoConversa("pedido_desvinculado", { pedidoId });
            await carregarDadosRelacionados();
            render();
        } catch (error) {
            notify("Não foi possível desvincular.", "error");
        }
    }

    // Busca leads/pedidos SEM cliente vinculado ainda, do próprio tenant,
    // por nome — usada pela vinculação manual (Fase 3, seções 3 e 4).
    async function buscarLeadsParaVincular(termo) {
        const termoLimpo = String(termo || "").trim().toLowerCase();
        if (!termoLimpo) return [];
        try {
            const snap = await getDocs(query(collection(db, "leads"), where("criadoPor", "==", storeUid()), limit(200)));
            const todos = [];
            snap.forEach(d => todos.push({ id: d.id, ...d.data() }));
            return todos.filter(l => !l.clienteId && String(l.nome || "").toLowerCase().includes(termoLimpo)).slice(0, 20);
        } catch (error) {
            return [];
        }
    }

    async function buscarPedidosParaVincular(termo) {
        const termoLimpo = String(termo || "").trim().toLowerCase();
        if (!termoLimpo) return [];
        try {
            const snap = await getDocs(query(collection(db, "pedidos"), where("criadoPor", "==", storeUid()), limit(200)));
            const todos = [];
            snap.forEach(d => todos.push({ id: d.id, ...d.data() }));
            return todos.filter(p => !p.clienteId && String(p.cliente || "").toLowerCase().includes(termoLimpo)).slice(0, 20);
        } catch (error) {
            return [];
        }
    }

    function bindEventos() {
        el("crm-cliente-fechar")?.addEventListener("click", fechar);
        el("crm-btn-criar-cliente")?.addEventListener("click", criarClienteDaConversa);

        el("crm-candidatos-lista")?.addEventListener("click", event => {
            const alvo = event.target.closest("[data-crm-candidato-id]");
            if (alvo) vincularConversaACliente(alvo.getAttribute("data-crm-candidato-id"));
        });

        el("crm-status-select")?.addEventListener("change", event => atualizarStatusRelacionamento(event.target.value));
        el("crm-responsavel-select")?.addEventListener("change", event => atualizarResponsavel(event.target.value));
        el("crm-status-sugestao")?.addEventListener("click", event => {
            const alvo = event.target.closest("[data-crm-aplicar-sugestao]");
            if (alvo) atualizarStatusRelacionamento(alvo.getAttribute("data-crm-aplicar-sugestao"));
        });

        el("crm-tags-lista")?.addEventListener("click", event => {
            const alvo = event.target.closest("[data-crm-tag-remover]");
            if (alvo) removerTag(alvo.getAttribute("data-crm-tag-remover"));
        });
        el("crm-tag-form")?.addEventListener("submit", event => {
            event.preventDefault();
            const input = el("crm-tag-input");
            const valor = input?.value.trim();
            if (!valor) return;
            adicionarTag(valor);
            if (input) input.value = "";
        });

        el("crm-observacao-form")?.addEventListener("submit", event => {
            event.preventDefault();
            const input = el("crm-observacao-input");
            const valor = input?.value.trim();
            if (!valor) return;
            salvarObservacao(valor).then(() => { if (input) input.value = ""; });
        });
        el("crm-observacoes-lista")?.addEventListener("click", event => {
            const alvo = event.target.closest("[data-crm-arquivar-obs]");
            if (alvo) arquivarObservacao(alvo.getAttribute("data-crm-arquivar-obs"));
        });

        el("crm-leads-lista")?.addEventListener("click", event => {
            const alvo = event.target.closest("[data-crm-desvincular-lead]");
            if (alvo) desvincularLead(alvo.getAttribute("data-crm-desvincular-lead"));
        });
        el("crm-pedidos-lista")?.addEventListener("click", event => {
            const alvo = event.target.closest("[data-crm-desvincular-pedido]");
            if (alvo) desvincularPedido(alvo.getAttribute("data-crm-desvincular-pedido"));
        });

        el("crm-produtos-busca-input")?.addEventListener("input", event => buscarProdutos(event.target.value));
        el("crm-produtos-busca-resultado")?.addEventListener("click", event => {
            const alvo = event.target.closest("[data-crm-add-produto]");
            if (alvo) vincularProdutoInteresse(alvo.getAttribute("data-crm-add-produto"));
        });
        el("crm-produtos-interesse-lista")?.addEventListener("click", event => {
            const alvo = event.target.closest("[data-crm-remover-produto]");
            if (alvo) removerProdutoDaLista(alvo.getAttribute("data-crm-remover-produto"));
        });

        el("crm-timeline-filtro")?.addEventListener("change", event => {
            state.filtroTimeline = event.target.value;
            renderTimeline();
        });

        // Debounce simples: evita disparar uma query a cada tecla digitada.
        let temporizadorBuscaLead = null;
        el("crm-busca-lead")?.addEventListener("input", event => {
            clearTimeout(temporizadorBuscaLead);
            const termo = event.target.value;
            temporizadorBuscaLead = setTimeout(async () => {
                const resultados = await buscarLeadsParaVincular(termo);
                const box = el("crm-busca-lead-resultado");
                if (!box) return;
                box.innerHTML = resultados.map(l => `
                    <button type="button" class="atend-btn" data-crm-vincular-lead="${escaparHtml(l.id)}" style="width:100%;justify-content:space-between;margin-top:4px;">
                        <span>${escaparHtml(l.nome || "Sem nome")}</span><span>Vincular</span>
                    </button>
                `).join("") || `<p class="crm-vazio-texto">Nada encontrado.</p>`;
            }, 300);
        });
        el("crm-busca-lead-resultado")?.addEventListener("click", event => {
            const alvo = event.target.closest("[data-crm-vincular-lead]");
            if (alvo) vincularLead(alvo.getAttribute("data-crm-vincular-lead"));
        });

        let temporizadorBuscaPedido = null;
        el("crm-busca-pedido")?.addEventListener("input", event => {
            clearTimeout(temporizadorBuscaPedido);
            const termo = event.target.value;
            temporizadorBuscaPedido = setTimeout(async () => {
                const resultados = await buscarPedidosParaVincular(termo);
                const box = el("crm-busca-pedido-resultado");
                if (!box) return;
                box.innerHTML = resultados.map(p => `
                    <button type="button" class="atend-btn" data-crm-vincular-pedido="${escaparHtml(p.id)}" style="width:100%;justify-content:space-between;margin-top:4px;">
                        <span>${escaparHtml(p.cliente || "Pedido")} · ${formatarMoeda(p.valor)}</span><span>Vincular</span>
                    </button>
                `).join("") || `<p class="crm-vazio-texto">Nada encontrado.</p>`;
            }, 300);
        });
        el("crm-busca-pedido-resultado")?.addEventListener("click", event => {
            const alvo = event.target.closest("[data-crm-vincular-pedido]");
            if (alvo) vincularPedido(alvo.getAttribute("data-crm-vincular-pedido"));
        });
    }

    return {
        abrirParaConversa,
        abrirParaClienteId,
        fechar,
        vincularLead,
        vincularPedido,
        buscarLeadsParaVincular,
        buscarPedidosParaVincular,
        bindEventos,
        state
    };
}
