// CRM 360 do Cliente — evolui o painel lateral da Central de Atendimento
// (chats) reaproveitando leads/pedidos/produtos já existentes. Plano
// Blaze, escrita direta protegida por Regras: sem IA real, sem WhatsApp,
// sem automação nesta etapa — identidade, relacionamento e histórico de identidade.

import { CANAIS_CONVERSA, STATUS_CONVERSA, funcionarioPodeAtender, funcionariosElegiveisAtendimento, categoriaEventoAtendimento } from "./atendimento.js";
import { contarProdutosMaisComprados, produtosInteresseConvertidos } from "./pedidos-estruturados.js";

exportar {funcionarioPodeAtender};

exportar const STATUS_RELACIONAMENTO = Object.freeze({
    novo: "Novo",
    Liderança: "Liderança",
    qualificado: "Qualificado",
    negociação: "Em negociação",
    cliente: "Cliente",
    recorrente: "Recorrente",
    inativo: "Inativo",
    : "Perdido"
});

exportar const TAGS_SUGERIDAS_CLIENTE = Object.freeze([
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
// leva já gravam telefone/email nesse formato, então use o mesmo
// algoritmo aqui é o que permite comparar sem migrar nada.
export function normalizarTelefone(valor) {
    let digits = String(valor || "").replace(/\D/g, "");
    se (digits.length === 10 || digits.length === 11) {
        dígitos = `55${dígitos}`;
    }
    retornar dígitos;
}

export function normalizarEmail(valor) {
    retornar String(valor || "").trim().toLowerCase();
}

export function telefoneValido(normalizado) {
    return typeof normalizado === "string" && normalizado.length >= 12 && normalizado.length <= 13;
}

função de exportação emailValido(normalizado) {
    return typeof normalizado === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizado);
}

// ---------- Identidade canônica (Fase 2) ----------
// Ordem de prioridade: clienteId explícito > authUid > leadId/pedidoId
// políticas óbvias > telefone normalizado > email normalizado.
// Nunca usei só o nome. Sempre dentro do mesmo locatário (quem chama já filtra
// por inquilino nas consultas — aqui só decidimos a prioridade do match).
função de exportação resolverIdentidadeCliente({ clienteId, authUid, leadIdVinculado, pedidoIdVinculado, telefoneNormalizado, emailNormalizado } = {}) {
    if (clienteId) return { estratégia: "clienteId", valor: clienteId };
    if (authUid) return { estratégia: "authUid", valor: authUid };
    if (leadIdVinculado) return { estratégia: "leadId", valor: leadIdVinculado };
    if (pedidoIdVinculado) return { estratégia: "pedidoId", valor: pedidoIdVinculado };
    if (telefoneNormalizado && telefoneValido(telefoneNormalizado)) return { estratégia: "telefone", valor: telefoneNormalizado };
    if (emailNormalizado && emailValido(emailNormalizado)) return { estratégia: "email", valor: emailNormalizado };
    return { estratégia: "nenhuma", valor: "" };
}

// Encontra candidatos a "mesmo cliente" dentro de uma lista já filtrada
// pelo inquilino (a chamada nunca deve alterar listas de inquilinos diferentes).
// Retorna { correspondências, ambiguo } — ambiguo quando há mais de um
// candidato distinto e nenhum critério forte (clienteId/authUid) desempata.
função de exportação encontrarCorrespondências(referência, candidatos) {
    const lista = Array.isArray(candidatos) ? candidatos: [];
    const telRef = referencia?.telefoneNormalizado || "";
    const emailRef = referencia?.emailNormalizado || "";
    const authUidRef = referencia?.authUid || "";

    const porAuthUid = authUidRef ? lista.filter(c => c.authUid && c.authUid === authUidRef) : [];
    if (porAuthUid.length > 0) return { correspondências: porAuthUid, critério: "authUid", ambiguidade: false };

    const porTelefone = telRef ? lista.filter(c => c.telefoneNormalizado && c.telefoneNormalizado === telRef) : [];
    const porEmail = emailRef? lista.filter(c => c.emailNormalizado && c.emailNormalizado === emailRef) : [];

    const combinados = novo Mapa();
    [...porTelefone, ...porEmail].forEach(c => combinados.set(c.id, c));
    const correspondências = Array.from(combinados.values());

    if (correspondências.length === 0) return { correspondências: [], critério: "nenhum", ambiguo: false };
    if (correspondências.length === 1) {
        return { correspondências, critério: porTelefone.length ? "telefone" : "e-mail", ambiguo: false };
    }
    // Mais de um candidato distinto batendo por telefone/e-mail: ambíguo,
    // decisão fica para um humano (nunca escolhe sozinho).
    return { correspondências, critério: "multiplo", ambiguo: true };
}

// ---------- Status do relacionamento (Fase 4) ----------
export function statusRelatedValido(status) {
    retornar status em STATUS_RELACIONAMENTO;
}

// SÓ SUGERE — uma mudança de status é sempre uma ação explicada da equipe.
função de exportação sugerindoStatusRelacionamento({ statusAtual = "novo", pedidosPagos = 0, diasDesdeUltimaCompra = null } = {}) {
    if (statusAtual === "perdido" || statusAtual === "inativo") return null;
    if (pedidosPagos >= 2 && statusAtual !== "recorrente") {
        return { sugestão: "recorrente", motivo: "Já tem 2 ou mais pedidos pagos." };
    }
    if (pedidosPagos === 1 && !["cliente", "recorrente"].includes(statusAtual)) {
        return { sugestão: "cliente", motivo: "Tem um pedido pago." };
    }
    if (typeof diasDesdeUltimaCompra === "número" && diasDesdeUltimaCompra >= LIMITES_CRM.diasInativoSugestao
        && ["cliente", "recorrente"].includes(statusAtual)) {
        return { sugestão: "inativo", motivo: `Sem interação há ${diasDesdeUltimaCompra} dias.` };
    }
    retornar nulo;
}

// ---------- Tags (Fase 3, seño 7) ----------
export function slugTag(nome) {
    retornar String(nome || "")
        .aparar()
        .paraLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, LIMITES_CRM.tagMax);
}

export function tagJaExiste(slugNovo, tagsExistentes) {
    return (tagsExistentes || []).some(t => (t.slug || slugTag(t.nome)) === slugNovo);
}

função de exportação adicionarTagCliente(tagsAtuais, novaTagSlug) {
    const atuais = Array.isArray(tagsAtuais) ? tagsAtuais : [];
    if (!novaTagSlug || atuais.includes(novaTagSlug)) return atuais;
    if (atuais.length >= LIMITES_CRM.maxTags) return atuais;
    return [...atuais, novaTagSlug];
}

export function removerTagCliente(tagsAtuais, tagSlug) {
    return (Array.isArray(tagsAtuais) ? tagsAtuais : []).filter(t => t !== tagSlug);
}

// ---------- Resumo comercial (Fase 3, seção 2) ----------
// Recebe os pedidos já filtrados por cliente (quem chama faz a consulta
// restrito — nunca carregue o locatário inteiro pra calcular isto).
função de exportação calcularResumoComercial(pedidosDoCliente) {
    const pedidos = Array.isArray(pedidosDoCliente) ? pedidosDoCliente : [];
    const pagamentos = pedidos.filter(p => p.status === "pago");
    const cancelados = pedidos.filter(p => p.status === "cancelado");
    const valorTotal = pagos.reduce((soma, p) => soma + (Number(p.valor) || 0), 0);
    const ordenadosPorData = [...pedidos].sort((a, b) => (Number(b.data) || 0) - (Number(a.data) || 0));
    const últimoPedido = ordenadosPorData[0] || nulo;
    const diasDesdeUltimaCompra = últimoPedido?.data
        ? Math.floor((Date.now() - Number(ultimoPedido.data)) / 86400000)
        : nulo;

    // "Produtos mais comprados": desde a etapa "Pedidos Estruturados",
    // pedidos com `itens` (produtoId real) contam com precisão real;
    // pedidos antigos sem `itens` continuam contando pelo texto livre de
    // `produtos` (best-effort) — nunca descarte nenhum pedido, só use o
    // melhor dado disponível em cada um (ver pedidos-estruturados.js).
    const produtosMaisComprados = contarProdutosMaisComprados(pedidos, 5);

    retornar {
        totalPedidos: pedidos.length,
        pedidosPagos: pagos.length,
        pedidos cancelados: cancelados.length,
        valorTotal,
        ticketMedio: pagos.length > 0 ? valorTotal/pagos.length : 0,
        últimoPedido,
        diasDesdeUltimaCompra,
        produtosMaisComprados
    };
}

// ---------- Produtos de interesse (Fase 6) ----------
export function validarProdutoInteresse(item) {
    if (!item?.produtoId) return "Selecione um produto.";
    if (!item?.nomeSnapshot) return "Produto sem nome.";
    retornar "";
}

função de exportação adicionarProdutoInteresse(listaAtual, produto, { vinculadoPor, origem = "manual" } = {}) {
    const atuais = Array.isArray(listaAtual) ? listaAtual : [];
    if (atuais.some(p => p.produtoId === produto.id)) return atuais;
    if (atuais.length >= LIMITES_CRM.maxProdutosInteresse) return atuais;
    retornar [...atuais, {
        produtoId: produto.id,
        nomeSnapshot: String(produto.nome || "").slice(0, 160),
        precoSnapshot: Número(produto.preco) || 0,
        vinculadoEm: Date.now(),
        contratoPor:contratoPor || "",
        sim
    }];
}

export function removerProdutoInteresse(listaAtual, produtoId) {
    return (Array.isArray(listaAtual) ? listaAtual : []).filter(p => p.produtoId !== produtoId);
}

// ---------- Observações internas (Fase 3, sessão 6) ----------
função de exportação validarObservacaoCliente(texto) {
    const valor = String(texto || "").trim();
    if (!valor) return "A observação não pode ficar vazia.";
    if (valor.length > LIMITES_CRM.observacaoMax) return `Uma observação pode ter no máximo ${LIMITES_CRM.observacaoMax} caracteres.`;
    retornar "";
}

// ---------- Linha do tempo (Fase 7) ----------
export const TIPOS_EVENTO_TIMELINE = Object.freeze({
    primeiro_contato: "Primeiro contato",
    conversa_criada: "Conversa criada",
    lead_criado: "Lead criado",
    lead_vinculado: "Lead vinculado",
    pedido_criado: "Pedido criado",
    pedido_vinculado: "Pedido garantido",
    pagamento_confirmado: "Pagamento confirmado",
    pedido_cancelado: "Pedido cancelado",
    tag_adicionada: "Tag adicionada",
    tag_removida: "Tagn",
    status_alterado: "Status alterado",
    responsavel_alterado: "Responsável alterada",
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
    status_alterado: "alterações",
    responsavel_alterado: "alterações",
    observacao_adicionada: "alterações",
    produto_vinculado: "alterações"
});

export function CatEvento(tipo) {
    retornar CATEGORIA_POR_TIPO[tipo] || "alterações";
}

export function ordenarTimeline(eventos) {
    return [...(eventos || [])].sort((a, b) => (Number(b.criadoEm) || 0) - (Number(a.criadoEm) || 0));
}

função de exportação filtrarTimeline(eventos, filtro = "todos") {
    if (filtro === "todos") return eventos || [];
    return (eventos || []).filter(e => categoriaEvento(e.tipo) === filtro);
}

// Lista de clientes do CRM 360 (Fase de navegação própria) — busca por
// nome/telefone/e-mail e filtro por status de relacionamento, tudo em
// memória sobre os clientes já carregados do locatário. Nunca procurei em
// outro locatário (uma consulta que carrega a lista já filtrada por tenantId).
função de exportação filtrarListaClientes(clientes, { busca = "", status = "todos" } = {}) {
    const termo = String(busca || "").trim().toLowerCase();
    return (clientes || []).filter(c => {
        if (status !== "todos" && c.statusRelacionamento !== status) retorna falso;
        se (!termo) retornar verdadeiro;
        const texto = [c.nome, c.telefone, c.email].filter(Boolean).join(" ").toLowerCase();
        retornar texto.includes(termo);
    });
}

export function ordenarListaClientes(clientes, criterio = "recente") {
    const lista = [...(clientes || [])];
    switch (critério) {
        caso "nome":
            return lista.sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
        caso "recente":
        padrão:
            return lista.sort((a, b) => (Number(b.ultimaInteracaoEm) || 0) - (Number(a.ultimaInteracaoEm) || 0));
    }
}

função escaparHtml(valor) {
    retornar String(valor ?? "")
        .replace(/&/g, "&")
        .replace(/</g, "<")
        .replace(/>/g, ">")
        .replace(/"/g, """)
        .replace(/'/g, "'");
}

função codigoErroFirebase(erro) {
    return String(error?.code || "").trim().toLowerCase().replace(/^firestore\//, "");
}

função formatarMoeda(valor) {
    return (Number(valor) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

função formatarDados(valor) {
    const ms = valor?.toMillis ? valor.toMillis() : Número(valor) || 0;
    retornar ms ? novo Date(ms).toLocaleDateString("pt-BR") : "â--";
}

// Controller da tela — mesmo padrão de central-ia.js/base-conhecimento-ia.js/
// atendimento.js (deps injetados, testável sem navegador real). É chamado
// de dentro da Central de Atendimento (abrirParaConversa), nunca sozinho.
export function criarCrm360Controller(deps) {
    const { db, context, firestore, notify = () => {} } = deps;
    const {
        coleção, documento, obterDocumento, obterDocumentos, definirDocumento, atualizarDocumento,
        consulta, onde, limite, carimbo de data/hora do servidor
    } = firestore;

    const estado = {
        conversa: nulo,
        clienteId: "",
        cliente: nulo,
        carregando: falso,
        erro: falso,
        naoIdentificado: falso,
        candidatos: [],
        ambíguo: falso,
        pistas: [],
        pedidos: [],
        conversas: [],
        observacoes: [],
        eventos: [],
        tagsCatálogo: [],
        funcionários: [],
        filtroTimeline: "todos",
        salvandoObservação: falso,
        buscaProdutoResultado: [],
        // Lista própria de clientes (navegação direta, fora de uma
        // conversa) — mesma coleção `clientes`, nenhum dado duplicado.
        listaClientes: [],
        listaCarregando: false,
        listaErro: falso,
        listaFiltro: { busca: "", status: "todos", ordem: "recente" }
    };

    função el(id) {
        retornar document.getElementById(id);
    }

    função armazenarUid() {
        retornar context.getSnapshot().storeUid || "";
    }

    função authUid() {
        retornar context.getSnapshot().authUid || "";
    }

    função podeVer() {
        retornar contexto.canView("crm") || context.canView("atendimento");
    }

    função podeEditar() {
        retornar contexto.canEdit("crm") || context.canEdit("atendimento");
    }

    função nomeAutorAtual() {
        const snapshot = context.getSnapshot();
        if (snapshot.isEmployee) return snapshot.employee?.nome || "Funcionário";
        retornar snapshot.owner?.nomeLoja || snapshot.owner?.nome || "Loja";
    }

    // Nunca crie/edite evento sem antes garantir que o cliente pertence ao
    // inquilino atual — quem chama já resolveu clienteId a partir de dados do
    // próprio locatário, isto é apenas uma segunda trava defensiva do lado do cliente
    // (a trava real está nas Regras). Retorna o id do evento criado (usado
    // como correlaçãoId pelo espelho em chats/*/eventos, quando a ação
    // parte de uma conversa aberta) ou "" se não gravou.
    função assíncrona registrarEvento(tipo, extra = {}) {
        Se (!state.clienteId) retornar "";
        tentar {
            const ref = doc(collection(db, "clientes", state.clienteId, "eventos"));
            aguarde setDoc(ref, {
                tipo,
                autorUid: authUid(),
                autorNome: nomeAutorAtual(),
                criadoEm: serverTimestamp(),
                ...extra
            });
            retornar ref.id;
        } catch (erro) {
            console.error("[CRM 360] Falha ao registrar evento:", codigoErroFirebase(error), erro?.message);
            retornar "";
        }
    }

    // Espelha (sem duplicar) uma ação de vínculo do CRM 360 no histórico
    // da conversa — só quando a gaveta foi aberta A PARTIR de uma
    // conversa (state.conversa definida para abrirParaConversa). Ó
    // correlaçãoId aponta pro evento irmão em clientes/*/eventos: são
    // dois registros de escopos diferentes (por chat / por cliente)
    // sobre o mesmo fato, nunca uma cópia do conteúdo um do outro. Falha
    // aqui nunca interrompeu a ação principal do CRM (best-effort, mesmo
    // padrão de registradorEvento).
    função assíncrona registrarEventoConversa(tipo, extra = {}, correlationId = "") {
        se (!state.conversa?.id) retorne;
        tentar {
            await setDoc(doc(collection(db, "chats", state.conversa.id, "eventos")), {
                tenantId: storeUid(),
                lojaId: storeUid(),
                chatId: state.conversa.id,
                tipo,
                categoria: categoriaEventoAtendimento(tipo),
                autorUid: authUid(),
                autorTipo: context.getSnapshot().isEmployee ? "funcionario" : "proprietário",
                autorNome: nomeAutorAtual(),
                s: "equipar",
                criadoEm: serverTimestamp(),
                esquemaVerso: 1,
                clienteId: estado.clienteId,
                ...(correlationId ? { correlationId } : {}),
                ...extra
            });
        } catch (erro) {
            console.error("[CRM 360] Falha ao espelhar evento na conversa:", codigoErroFirebase(error), error?.message);
        }
    }

    function renderCarregando(carregando) {
        estado.carregando = carregando;
        el("carregando crm")?.classList.toggle("oculto", !carregando);
        el("crm-conteudo")?.classList.toggle("oculto", carregando);
    }

    função renderizarNaoIdentificado() {
        el("crm-não-identificado")?.classList.remove("oculto");
        el("crm-conteudo")?.classList.add("oculto");
        const lista = el("crm-candidatos-lista");
        se (lista) {
            se (state.candidatos.length === 0) {
                lista.innerHTML = `<p class="crm-vazio-texto">Nenhum cliente parecido encontrado. Você pode cadastrar este contato como um novo cliente.</p>`;
            } outro {
                lista.innerHTML = state.candidatos.map(c => `
                    <button type="button" class="atend-btn crm-candidato-item" data-crm-candidato-id="${escaparHtml(c.id)}" style="width:100%;justify-content:space-between;margin-bottom:6px;">
                        <span>${escaparHtml(c.nome || "Sem nome")} · ${escaparHtml(c.telefone || c.email || "")}</span>
                        <span>Vincular</span>
                    </button>
                `).join("");
            }
        }
        if (el("crm-ambiguo-aviso")) el("crm-ambiguo-aviso").classList.toggle("oculto", !state.ambiguo);
    }

    função renderIdentidade() {
        const c = estado.cliente;
        se (!c) retornar;
        if (el("crm-nome")) el("crm-nome").textContent = c.nome || estado.conversa?.clienteNome || “Cliente”;
        if (el("crm-avatar")) el("crm-avatar").textContent = (c.nome || state.conversa?.clienteNome || "?").trim().slice(0, 1).toUpperCase() || "?";
        if (el("crm-telefone")) el("crm-telefone").textContent = c.telefone || "—";
        if (el("crm-email")) el("crm-email").textContent = c.email || "â--";
        if (el("crm-origem")) el("crm-origem").textContent = c.origem || "—";
        if (el("crm-primeiro-contato")) el("crm-primeiro-contato").textContent = formatarData(c.primeiraInteracaoEm);
        if (el("crm-ultimo-contato")) el("crm-ultimo-contato").textContent = formatarData(c.ultimaInteracaoEm);
        if (el("crm-status-select")) el("crm-status-select").value = c.statusRelacionamento || "novo";
        renderOpcoesResponsavel();
        if (el("crm-responsavel-select")) el("crm-responsavel-select").value = c.responsavelUid || "";
        const tagsBox = el("crm-tags-lista");
        se (tagsBox) {
            tagsBox.innerHTML = (c.tags || []).map(slug => {
                const tag = state.tagsCatalogo.find(t => t.slug === slug);
                return `<span class="atend-chip crm-tag-chip">${escaparHtml(tag?.nome || slug)}<button type="button" data-crm-tag-remover="${escaparHtml(slug)}" aria-label="Remover tag">×—</button></span>`;
            }).join("") || `<span class="crm-vazio-texto">Nenhuma tag ainda.</span>`;
        }
    }

    função renderizarResumoComercial() {
        const resumo = calcularResumoComercial(estado.pedidos);
        if (el("crm-kpi-total-pedidos")) el("crm-kpi-total-pedidos").textContent = String(resumo.totalPedidos);
        if (el("crm-kpi-pedidos-pagos")) el("crm-kpi-pedidos-pagos").textContent = String(resumo.pedidosPagos);
        if (el("crm-kpi-pedidos-cancelados")) el("crm-kpi-pedidos-cancelados").textContent = String(resumo.pedidosCancelados);
        if (el("crm-kpi-valor-total")) el("crm-kpi-valor-total").textContent = formatarMoeda(resumo.valorTotal);
        if (el("crm-kpi-ticket-medio")) el("crm-kpi-ticket-medio").textContent = formatarMoeda(resumo.ticketMedio);
        if (el("crm-kpi-dias-ultima-compra")) el("crm-kpi-dias-ultima-compra").textContent = resumo.diasDesdeUltimaCompra === null ? "—" : `${resumo.diasDesdeUltimaCompra} dias`;
        if (el("crm-kpi-conversas")) el("crm-kpi-conversas").textContent = String(state.conversas.length);
        if (el("crm-kpi-leads")) el("crm-kpi-leads").textContent = String(state.leads.length);

        const produtosBox = el("crm-produtos-comprados");
        se (produtosBox) {
            produtosBox.innerHTML = resumo.produtosMaisComprados.length === 0
                ? `<span class="crm-vazio-texto">Sem pedidos suficientes ainda.</span>`
                : resumo.produtosMaisComprados.map(p => `<span class="atend-chip">${escaparHtml(p.nome)} Ã— ${p.total}</span>`).join("");
        }

        const sugestão = sugerirStatusRelacionamento({
            statusAtual: estado.cliente?.statusRelacionamento || "novo",
            pedidosPagos: resumo.pedidosPagos,
            diasDesdeUltimaCompra: resumo.diasDesdeUltimaCompra
        });
        const sugestãoBox = el("crm-status-sugestao");
        se (sugestaoBox) {
            se (sugestao) {
                sugestaoBox.classList.remove("hidden");
                sugestaoBox.innerHTML = `Sugestão: <strong>${escaparHtml(STATUS_RELACIONAMENTO[sugestao.sugestao])}</strong> — ${escaparHtml(sugestao.motivo)} <button type="button" class="atend-btn" data-crm-aplicar-sugestao="${escaparHtml(sugestao.sugestao)}">Aplicar</button>`;
            } outro {
                sugestaoBox.classList.add("hidden");
            }
        }
    }

    função renderizarLeads() {
        const box = el("crm-leads-lista");
        se (!box) retornar;
        box.innerHTML = state.leads.length === 0
            ? `<p class="crm-vazio-texto">Nenhum lead ainda.</p>`
            : state.leads.map(l => `
                <div class="crm-item-relacionado">
                    <div>
                        <strong>${escaparHtml(l.nome || "Sem nome")}</strong>
                        <span class="crm-item-meta">${escaparHtml(l.origem || "â—")} Â· ${escaparHtml(l.produtoInteresse || "â—")} Â· ${escaparHtml(l.statusLead || "novo")}</span>
                    </div>
                    <button type="button" class="atend-btn" data-crm-desvincular-lead="${escaparHtml(l.id)}">Desvincular</button>
                </div>
            `).join("");
    }

    função renderizarPedidos() {
        const box = el("crm-pedidos-lista");
        se (!box) retornar;
        box.innerHTML = state.pedidos.length === 0
            ? `<p class="crm-vazio-texto">Nenhum pedido estipulado ainda.</p>`
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

    função renderizarConversas() {
        const box = el("crm-conversas-lista");
        se (!box) retornar;
        box.innerHTML = state.conversas.length === 0
            ? `<p class="crm-vazio-texto">Nenhuma outra conversa deste cliente.</p>`
            : state.conversas.map(c => `
                <div class="crm-item-relacionado">
                    <div>
                        <strong>${escaparHtml(CANAIS_CONVERSA[c.canal] || "Conversa")}</strong>
                        <span class="crm-item-meta">${escaparHtml(STATUS_CONVERSA[c.status] || "â—")} Â· ${escaparHtml(c.ultimaMensagem || "")}</span>
                    </div>
                    <button type="button" class="atend-btn" data-crm-abrir-conversa="${escaparHtml(c.id)}">Abrir</button>
                </div>
            `).join("");
    }

    função renderizarObservatórios() {
        const box = el("crm-observacoes-lista");
        se (!box) retornar;
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

    função renderizarTimeline() {
        const box = el("crm-timeline-lista");
        se (!box) retornar;
        const visiveis = filtrarTimeline(ordenarTimeline(state.eventos), state.filtroTimeline);
        box.innerHTML = visiveis.length === 0
            ? `<p class="crm-vazio-texto">Sem eventos ainda.</p>`
            : visiveis.map(e => `
                <div class="crm-timeline-item">
                    <strong>${escaparHtml(TIPOS_EVENTO_TIMELINE[e.tipo] || e.tipo)}</strong>
                    <span class="crm-item-meta">${escaparHtml(e.resumo || "")} Â· ${escaparHtml(e.autorNome || "Equipe")} Â· ${formatarData(e.criadoEm)}</span>
                </div>
            `).join("");
    }

    função renderizarProdutosInteresse() {
        const box = el("crm-produtos-interesse-lista");
        se (!box) retornar;
        const lista = state.cliente?.produtosInteresse || [];
        // "Convertido": o produtoId do interesse aparece nos itens
        // estruturados de algum pedido real deste cliente (Fase de
        // Pedidos Estruturados) — só um selo informativo, não altere
        // nenhum dado; pedidos antigos sem `itens` nunca geram esse selo
        // (não há como saber sem dado estruturado, e não inventamos).
        const todosItens = (state.pedidos || []).flatMap(p => Array.isArray(p.itens) ? p.itens : []);
        const convertidos = new Set(produtosInteresseConvertidos(lista, todosItens).map(p => p.produtoId));
        box.innerHTML = lista.length === 0
            ? `<p class="crm-vazio-texto">Nenhum produto de interesse ainda.</p>`
            : lista.map(p => `
                <div class="crm-item-relacionado">
                    <div>
                        <strong>${escaparHtml(p.nomeSnapshot)}</strong>
                        <span class="crm-item-meta">${formatarMoeda(p.precoSnapshot)} Â· vinculado em ${formatarData(p.vinculadoEm)}</span>
                        ${convertidos.has(p.produtoId) ? `<span class="atend-chip is-status-resolvida">Convertido em pedido</span>` : ""}
                    </div>
                    <button type="button" class="atend-btn" data-crm-remover-produto="${escaparHtml(p.produtoId)}">Remover</button>
                </div>
            `).join("");
    }

    função renderizar() {
        se (state.naoIdentificado) {
            renderNaoIdentificado();
            retornar;
        }
        el("crm-não-identificado")?.classList.add("oculto");
        el("crm-conteudo")?.classList.remove("oculto");
        renderIdentidade();
        renderResumoComercial();
        renderLeads();
        renderPedidos();
        renderConversas();
        renderObservacoes();
        renderProdutosInteresse();
        renderTimeline();
    }

    função renderizarOpcoesResponsavel() {
        const select = el("crm-responsavel-select");
        se (!selecionado) retornar;
        const elegíveis = funcionariosElegíveisAtendimento(estado.funcionarios);
        selecionar.innerHTML = [
            `<option value="">Sem responsabil</option>`,
            `<option value="${escaparHtml(storeUid())}">Você (dono da loja)</option>`,
            ...elegiveis.map(f => `<option value="${escaparHtml(f.id)}">${escaparHtml(f.nome || f.id)}</option>`)
        ].juntar("");
    }

    função assíncrona carregandoFuncionarios() {
        se (!podeEditar()) retornar;
        tentar {
            const snap = await getDocs(query(collection(db, "funcionarios"), where("donoUID", "==", storeUid())));
            estado.funcionarios = [];
            snap.forEach(d => state.funcionarios.push({ id: d.id, ...d.data() }));
        } catch (erro) {
            estado.funcionarios = [];
        }
    }

    função assíncrona carregarCatálogoDeTags() {
        tentar {
            const snap = await getDocs(query(collection(db, "tags_clientes"), where("tenantId", "==", storeUid()), limit(100)));
            state.tagsCatalogo = [];
            snap.forEach(d => state.tagsCatalogo.push({ id: d.id, ...d.data() }));
        } catch (erro) {
            state.tagsCatalogo = [];
        }
    }

    função assíncrona carregarDadosRelacionados() {
        const clienteId = state.clienteId;
        const tenantId = storeUid();

        // As regras de leads/pedidos/chats validam o locatário pelos campos
        // criadoPor/donoUID/emailDono. Consultar apenas por clienteId não
        // permite que o Firestore comprove uma autorização da lista. Por isso como
        // consultas abaixo são limitadas ao inquilino e o clienteId é filtrado
        // em memória. Esse padrão também evita depender de índices compostos.
        const [
            leadsSnap,
            pedidosSnap,
            conversasDonoSnap,
            conversasEmailSnap,
            obsSnap,
            eventosSnap
        ] = await Promise.all([
            obterDocumentos(consulta(
                coleção(db, "leads"),
                where("criadoPor", "==", tenantId),
                limite(300)
            )),
            obterDocumentos(consulta(
                coleção(db, "pedidos"),
                where("criadoPor", "==", tenantId),
                limite(300)
            )),
            obterDocumentos(consulta(
                coleção(db, "chats"),
                onde("donoUID", "==", tenantId),
                limite(300)
            )),
            obterDocumentos(consulta(
                coleção(db, "chats"),
                onde("emailDono", "==", tenantId),
                limite(300)
            )),
            obterDocumentos(consulta(
                coleção(db, "clientes", clienteId, "observações"),
                limite(100)
            )),
            obterDocumentos(consulta(
                coleção(db, "clientes", clienteId, "eventos"),
                limite(100)
            ))
        ]);

        estado.leads = [];
        leadsSnap.forEach(documento => {
            const dados = documento.data();
            if (dados.clienteId === clienteId) {
                state.leads.push({ id: documento.id, ...dados });
            }
        });

        estado.pedidos = [];
        pedidosSnap.forEach(documento => {
            const dados = documento.data();
            if (dados.clienteId === clienteId) {
                state.pedidos.push({ id: documento.id, ...dados });
            }
        });

        const conversasPorId = novo Map();

        [conversasDonoSnap, conversaSnap por e-mail].forEach(snapshot => {
            snapshot.forEach(documento => {
                const dados = documento.data();
                se (
                    dados.clienteId === clienteId &&
                    documento.id !== estado.conversa?.id
                ) {
                    conversasPorId.set(documento.id, {
                        id: documento.id,
                        ...dados
                    });
                }
            });
        });

        estado.conversas = Array.from(conversasPorId.values());

        estado.observações = [];
        obsSnap.forEach(documento => {
            estado.observacoes.push({
                id: documento.id,
                ...documento.dados()
            });
        });

        estado.eventos = [];
        eventosSnap.forEach(documento => {
            estado.eventos.push({
                id: documento.id,
                ...documento.dados()
            });
        });
    }

    função assíncrona carregarClientePorId(clienteId) {
        const snap = await getDoc(doc(db, "clientes", clienteId));
        se (!snap.exists()) {
            state.clienteId = "";
            estado.cliente = nulo;
            state.naoIdentificado = true;
            retornar;
        }
        state.clienteId = clienteId;
        state.cliente = { id: snap.id, ...snap.data() };
        estado.naoIdentificado = falso;
        aguardar Promise.all([carregarDadosRelacionados(), carregarTagsCatalogo(), carregarFuncionarios()]);
    }

    // Busca candidatos por telefone/e-mail dentro do PRÓPRIO inquilino (nunca
    // entre inquilinos) — usa a mesma prioridade de identidade de
    //encontrarCorrespondências(). Não use nome sozinho.
    função assíncrona buscarCandidatos() {
        const conversa = estado.conversa;
        const telefoneNormalizado = normalizarTelefone(conversa?.telefone || "");
        const emailNormalizado = normalizarEmail(conversa?.email || "");
        if (!telefoneValido(telefoneNormalizado) && !emailValido(emailNormalizado)) {
            estado.candidatos = [];
            estado.ambiguo = falso;
            retornar;
        }
        tentar {
            const snap = await getDocs(query(collection(db, "clientes"), where("tenantId", "==", storeUid()), limit(200)));
            const todos = [];
            snap.forEach(d => todos.push({ id: d.id, ...d.data() }));
            const resultado = encontrarCorrespondências({ telefoneNormalizado, emailNormalizado }, todos);
            estado.candidatos = resultado.correspondencias;
            estado.ambiguo = resultado.ambiguo;
        } catch (erro) {
            estado.candidatos = [];
            estado.ambiguo = falso;
        }
    }

    função assíncrona abrirParaConversa(conversa) {
        if (!conversa || !podeVer()) retornar;
        estado.conversa = conversa;
        state.filtroTimeline = "todos";
        el("crm-cliente-modal")?.classList.remove("oculto");
        renderCarregando(true);
        tentar {
            se (conversa.clienteId) {
                aguardar carregarClientePorId(conversa.clienteId);
            } outro {
                state.clienteId = "";
                estado.cliente = nulo;
                state.naoIdentificado = true;
                aguardar buscarCandidatos();
            }
            estado.erro = falso;
        } catch (erro) {
            console.error("[CRM 360] Falha ao abrir perfil do cliente:", codigoErroFirebase(error), error?.message);
            estado.erro = verdadeiro;
            notify("Não foi possível carregar o CRM deste cliente.", "error");
        } finalmente {
            renderCarregando(false);
            renderizar();
        }
    }

    função fechar() {
        el("crm-cliente-modal")?.classList.add("hidden");
    }

    // Entrada direta (ex.: clicar numa notificação de "cliente sem
    // retorno") sem partir de uma conversa aberta. Só mostra o perfil se
    // o cliente realmente pertence ao locatário atual — getDoc()/Rules já
    // barram outro inquilino, mas a verificação aqui evita renderizar um estado
    // parcial antes da negação chegar.
    função assíncrona abrirParaClienteId(clienteId) {
        Se (!clienteId || !podeVer()) retornar falso;
        estado.conversa = nulo;
        state.filtroTimeline = "todos";
        el("crm-cliente-modal")?.classList.remove("oculto");
        renderCarregando(true);
        tentar {
            aguardar carregarClientePorId(clienteId);
            if (!state.cliente || state.cliente.tenantId !== storeUid()) {
                estado.naoIdentificado = falso;
                estado.cliente = nulo;
                state.clienteId = "";
                notify("Cliente não encontrado ou sem acesso.", "error");
                fechar();
                retornar falso;
            }
            estado.erro = falso;
            retornar verdadeiro;
        } catch (erro) {
            console.error("[CRM 360] Falha ao abrir cliente por id:", codigoErroFirebase(error), error?.message);
            notify("Não foi possível carregar o CRM deste cliente.", "error");
            fechar();
            retornar falso;
        } finalmente {
            renderCarregando(false);
            renderizar();
        }
    }

    // ===== Lista própria do CRM 360 (navegação direta, fora do Atendimento) =====
    // Mesma coleção `clientes`, mesma gaveta (abrirParaClienteId) — só uma
    // porta de entrada nova, sem duplicar dado nem estrutura nenhuma.
    função assíncrona carregarListaClientes() {
        se (!podeVer()) retornar;
        estado.listaCarregando = verdadeiro;
        estado.listaErro = falso;
        renderListClientes();
        tentar {
            const snap = await getDocs(query(collection(db, "clientes"), where("tenantId", "==", storeUid()), limit(500)));
            state.listaClientes = [];
            snap.forEach(d => state.listaClientes.push({ id: d.id, ...d.data() }));
        } catch (erro) {
            console.error("[CRM 360] Falha ao carregar lista de clientes:", codigoErroFirebase(error), erro?.message);
            state.listaClientes = [];
            estado.listaErro = verdadeiro;
        } finalmente {
            estado.listaCarregando = false;
            renderListClientes();
        }
    }

    função renderizarListaClientes() {
        const box = el("crm-lista-clientes");
        se (!box) retornar;
        se (!podeVer()) {
            box.innerHTML = `<p class="crm-vazio-texto">Você não tem permissão para ver o CRM 360.</p>`;
            retornar;
        }
        se (estado.listaCarregando) {
            box.innerHTML = `<div class="atend-mensagens-skel"><span class="aura-skel" style="width:60%;height:32px"></span><span class="aura-skel" style="width:40%;height:32px"></span></div>`;
            retornar;
        }
        se (estado.listaErro) {
            box.innerHTML = `<div class="atend-vazio"><strong>Não deu pra carregar os clientes.</strong><button type="button" class="atend-btn" data-crm-lista-acao="recarregar">Tentar novamente</button></div>`;
            retornar;
        }
        const visiveis = ordenarListaClientes(filtrarListaClientes(state.listaClientes, state.listaFiltro), state.listaFiltro.ordem);
        se (visiveis.length === 0) {
            box.innerHTML = state.listaClientes.length === 0
                ? `<p class="crm-vazio-texto">Nenhum cliente identificado ainda — clientes aparecem aqui assim que estão vinculados a uma conversa, lead ou pedido.</p>`
                : `<p class="crm-vazio-texto">Nenhum cliente encontrado com esse filtro.</p>`;
            retornar;
        }
        box.innerHTML = visiveis.map(c => `
            <button type="button" class="crm-lista-item" data-crm-abrir-cliente="${escaparHtml(c.id)}">
                <span class="atend-avatar">${escaparHtml((c.nome || "?").trim().slice(0, 1).toUpperCase())}</span>
                <span class="crm-lista-item-info">
                    <strong>${escaparHtml(c.nome || "Cliente sem nome")}</strong>
                    <span class="crm-item-meta">${escaparHtml(STATUS_RELACIONAMENTO[c.statusRelacionamento] || "Novo")}${c.telefone ? " · " + escaparHtml(c.telefone) : ""}</span>
                </span>
                <span class="crm-lista-item-data">${c.ultimaInteracaoEm ? formatarData(c.ultimaInteracaoEm) : "â--"}</span>
            </button>
        `).join("");
    }

    // Ponto de entrada chamado pelo ativarAba('view-crm360') — mesmo padrão
    // de carregarTemplatesAtendimento/carregarPedidos: só recarrega do
    // zero se ainda não tinha carregado, evitando releitura a cada troca
    // de aba.
    função assíncrona carregarLista({ força = falso } = {}) {
        se (!podeVer()) retornar;
        se (state.listaClientes.length > 0 && !force && !state.listaErro) {
            renderListClientes();
            retornar;
        }
        aguardar carregarListaClientes();
    }

    // Vincula a conversa ATUAL a um cliente já existente (candidato
    // sugerido) — grave clienteId no chat e recarregue o perfil.
    função assíncrona vincularConversaACliente(clienteId) {
        if (!state.conversa || !podeEditar()) return;
        tentar {
            await updateDoc(doc(db, "chats", state.conversa.id), { clienteId, atualizarEm: Date.now() });
            state.conversa.clienteId = clienteId;
            aguardar carregarClientePorId(clienteId);
            aguardar registradorEventoConversa("cliente_vinculado", { clienteId });
            notify("Conversa vinculada ao cliente.");
            renderizar();
        } catch (erro) {
            console.error("[CRM 360] Falha ao vincular conversa:", codigoErroFirebase(error), error?.message);
            notify("Não foi possível vincular. Tente novamente.", "error");
        }
    }

    // Cria um cliente novo a partir dos dados já visíveis na conversa
    // (nome/telefone/e-mail digitado pela equipe) e vinculado na hora.
    função assíncrona criarClienteDaConversa() {
        if (!state.conversa || !podeEditar()) return;
        const conversa = estado.conversa;
        const telefoneNormalizado = normalizarTelefone(conversa.telefone || "");
        const emailNormalizado = normalizarEmail(conversa.email || "");
        tentar {
            const agora = serverTimestamp();
            const ref = doc(collection(db, "clientes"));
            aguarde setDoc(ref, {
                tenantId: storeUid(),
                lojaId: storeUid(),
                nome: conversa.clienteNome || "Cliente",
                ...(conversa.telefone ? { telefone: conversa.telefone, telefoneNormalizado } : {}),
                ...(conversa.email ? { email: conversa.email, emailNormalizado } : {}),
                origem: conversa.canal || "atendimento",
                statusRela fawn: "novo",
                etiquetas: [],
                produtosInteresse: [],
                primeiraInteracaoEm: Date.now(),
                últimaInteraçãoEm: Date.now(),
                criadoEm: agora,
                criadoPor: authUid(),
                Em: agora,
                Por: authUid()
            });
            await updateDoc(doc(db, "chats", conversa.id), { clienteId: ref.id, atualizarEm: Date.now() });
            state.conversa.clienteId = ref.id;
            aguarde carregarClientePorId(ref.id);
            await registrarEvento("primeiro_contato", { resumo: "Cliente cadastrado a partir da conversa.", refColecao: "chats", refId: conversa.id });
            aguardar registradorEventoConversa("cliente_vinculado", { clienteId: ref.id });
            notify("Cliente cadastrado.");
            renderizar();
        } catch (erro) {
            console.error("[CRM 360] Falha ao cadastrar cliente:", codigoErroFirebase(error), error?.message);
            notify("Não foi possível cadastrar o cliente.", "erro");
        }
    }

    função assíncrona atualizarCliente(campos) {
        if (!state.clienteId || !podeEditar()) return false;
        tentar {
            aguardar atualizaçãoDoc(doc(db, "clientes", state.clienteId), {
                ...campos,
                Por: authUid(),
                atualizarEm: serverTimestamp()
            });
            Object.assign(estado.cliente, campos);
            retornar verdadeiro;
        } catch (erro) {
            console.error("[CRM 360] Falha ao atualizar cliente:", codigoErroFirebase(error), erro?.message);
            notify("Não foi possível salvar agora.", "error");
            retornar falso;
        }
    }

    função assíncrona atualizarStatusRelacionamento(novoStatus) {
        se (!statusRelataValido(novoStatus)) retorne;
        const anterior = estado.cliente?.statusRelacionamento || "novo";
        se (anterior === novoStatus) retornar;
        const ok = aguarda atualizaçãoCliente({
            statusRelacionamento: novoStatus,
            statusAtualizadoPor: authUid(),
            statusAtualizadoEm: serverTimestamp()
        });
        se (ok) {
            await registrarEvento("status_alterado", { resumo: `${STATUS_RELACIONAMENTO[anterior]} → ${STATUS_RELACIONAMENTO[novoStatus]}` });
            notify("Status do relacionamento atualizado.");
            renderizar();
        }
    }

    função assíncrona atualizarResponsavel(uid) {
        const ok = aguarda atualizarCliente({ responsavelUid: uid || "" });
        se (ok) {
            await registrarEvento("responsavel_alterado", { resumo: uid ? "Responsável atribuído." : "Responsável removido." });
            notify(uid ? "Responsável atualizado." : "Responsável removido.");
            renderizar();
        }
    }

    função assíncrona salvarObservacao(texto) {
        const erro = validarObservacaoCliente(texto);
        se (erro) {
            notificar(erro, "erro");
            retornar;
        }
        if (!state.clienteId || !podeEditar() || state.salvandoObservacao) return;
        estado.salvandoObservacao = true;
        tentar {
            await setDoc(doc(collection(db, "clientes", state.clienteId, "observacoes")), {
                conteúdo: texto.trim(),
                autorUid: authUid(),
                autorNome: nomeAutorAtual(),
                criadoEm: serverTimestamp()
            });
            aguardar registradorEvento("observacao_adicionada");
            aguardar carregamentoDadosRelacionados();
            notify("Observação registrada.");
            renderizar();
        } catch (erro) {
            console.error("[CRM 360] Falha ao salvar observação:", codigoErroFirebase(error), error?.message);
            notify("Não foi possível salvar uma observação.", "error");
        } finalmente {
            estado.salvandoObservacao = false;
        }
    }

    função assíncrona arquivarObservacao(obsId) {
        if (!state.clienteId || !podeEditar()) return;
        tentar {
            await updateDoc(doc(db, "clientes", state.clienteId, "observacoes", obsId), {
                arquivado: verdadeiro,
                atualizarEm: serverTimestamp()
            });
            aguardar carregamentoDadosRelacionados();
            renderizar();
        } catch (erro) {
            console.error("[CRM 360] Falha ao arquivar observação:", codigoErroFirebase(error), error?.message);
            notify("Não foi possível arquivar.", "error");
        }
    }

    função assíncrona obterOuCriarTag(nomeTag) {
        const slug = slugTag(nomeTag);
        se (!slug) retornar "";
        const existente = state.tagsCatalogo.find(t => t.slug === slug);
        if (existente) return existente.slug;
        tentar {
            await setDoc(doc(collection(db, "tags_clientes")), {
                tenantId: storeUid(),
                nome: nomeTag.trim().slice(0, 40),
                lesma,
                ativo: verdadeiro,
                criadoEm: serverTimestamp(),
                criadoPor: authUid()
            });
            aguarde carregarTagsCatalogo();
        } catch (erro) {
            console.error("[CRM 360] Falha ao criar tag:", codigoErroFirebase(error), erro?.message);
        }
        retornar slug;
    }

    função assíncrona adicionarTag(nomeTag) {
        if (!state.clienteId || !podeEditar()) return;
        const slug = await obterOuCriarTag(nomeTag);
        se (!slug) retornar;
        const novasTags = adicionarTagCliente(state.cliente?.tags, slug);
        const ok = aguarda atualizarCliente({ tags: novasTags });
        se (ok) {
            aguardar registradorEvento("tag_adicionada", { resumo: nomeTag });
            renderizar();
        }
    }

    função assíncrona removerTag(slug) {
        if (!state.clienteId || !podeEditar()) return;
        const novasTags = removerTagCliente(state.cliente?.tags, slug);
        const ok = aguarda atualizarCliente({ tags: novasTags });
        se (ok) {
            aguardar registradorEvento("tag_removida", { resumo: slug });
            renderizar();
        }
    }

    função assíncrona buscarProdutos(termo) {
        tentar {
            const snap = aguarda getDocs(query(collection(db, "produtos"), where("criadoPor", "==", storeUid()), limit(100)));
            const todos = [];
            snap.forEach(d => todos.push({ id: d.id, ...d.data() }));
            const termoLimpo = String(termo || "").trim().toLowerCase();
            state.buscaProdutoResultado = termoLimpo
                ? todos.filter(p => String(p.nome || "").toLowerCase().includes(termoLimpo)).slice(0, 20)
                : [];
        } catch (erro) {
            estado.buscaProdutoResultado = [];
        }
        const box = el("crm-produtos-busca-resultado");
        se (caixa) {
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
        se (!produto) retornar;
        const novaLista = adicionarProdutoInteresse(state.cliente?.produtosInteresse, produto, { vinculadoPor: authUid() });
        const ok = aguarda atualizaçãoCliente({ produtosInteresse: novaLista });
        se (ok) {
            const correlaçãoId = await registrarEvento("produto_vinculado", { resumo: produto.nome, refColecao: "produtos", refId: produtoId });
            aguardar registradorEventoConversa("produto_vinculado", { produtoId, resumo: produto.nome.slice(0, 300) }, correlaçãoId);
            renderizar();
        }
    }

    função assíncrona removerProdutoDaLista(produtoId) {
        if (!state.clienteId || !podeEditar()) return;
        const novaLista = removedorProdutoInteresse(estado.cliente?.produtosInteresse, produtoId);
        aguardar atualizaçãoCliente({ produtosInteresse: novaLista });
        aguardar registradorEventoConversa("produto_desvinculado", { produtoId });
        renderizar();
    }

    // Vincula um lead/pedido EXISTENTE (busca manual) ao cliente aberto.
    // Sempre confirme que o registro é do mesmo inquilino antes de dezembro —
    // a Regras revalidas do lado do servidor de qualquer formato.
    função assíncrona vincularLead(leadId) {
        if (!state.clienteId || !podeEditar()) return;
        tentar {
            await updateDoc(doc(db, "leads", leadId), { clienteId: state.clienteId });
            const correlaçãoId = await registradorEvento("lead_vinculado", { refColecao: "leads", refId: leadId });
            aguardar registradorEventoConversa("lead_vinculado", { leadId }, correlaçãoId);
            aguardar carregamentoDadosRelacionados();
            notificar("Lead vinculado.");
            renderizar();
        } catch (erro) {
            console.error("[CRM 360] Falha ao vincular lead:", codigoErroFirebase(error), error?.message);
            notify("Não foi possível vincular este lead.", "error");
        }
    }

    função assíncrona desvincularLead(leadId) {
        tentar {
            await updateDoc(doc(db, "leads", leadId), { clienteId: "" });
            aguardar registradorEventoConversa("lead_desvinculado", { leadId });
            aguardar carregamentoDadosRelacionados();
            renderizar();
        } catch (erro) {
            notify("Não foi possível desvincular.", "error");
        }
    }

    função assíncrona vincularPedido(pedidoId) {
        if (!state.clienteId || !podeEditar()) return;
        tentar {
            await updateDoc(doc(db, "pedidos", pedidoId), { clienteId: state.clienteId });
            const correlaçãoId = await registrarEvento("pedido_vinculado", { refColecao: "pedidos", refId: pedidoId });
            aguardar registradorEventoConversa("pedido_vinculado", { pedidoId }, correlaçãoId);
            aguardar carregamentoDadosRelacionados();
            notificar("Pedido vinculado.");
            renderizar();
        } catch (erro) {
            console.error("[CRM 360] Falha ao vincular pedido:", codigoErroFirebase(error), error?.message);
            notify("Não foi possível vincular este pedido.", "error");
        }
    }

    função assíncrona desvincularPedido(pedidoId) {
        tentar {
            await updateDoc(doc(db, "pedidos", pedidoId), { clienteId: "" });
            aguardar registradorEventoConversa("pedido_desvinculado", { pedidoId });
            aguardar carregamentoDadosRelacionados();
            renderizar();
        } catch (erro) {
            notify("Não foi possível desvincular.", "error");
        }
    }

    // Busca leads/pedidos SEM cliente garantidos ainda, do próprio locatário,
    // por nome — usado pela vinculação manual (Fase 3, seções 3 e 4).
    função assíncrona buscarLeadsParaVincular(termo) {
        const termoLimpo = String(termo || "").trim().toLowerCase();
        se (!termoLimpo) retorne [];
        tentar {
            const snap = await getDocs(query(collection(db, "leads"), where("criadoPor", "==", storeUid()), limit(200)));
            const todos = [];
            snap.forEach(d => todos.push({ id: d.id, ...d.data() }));
            return todos.filter(l => !l.clienteId && String(l.nome || "").toLowerCase().includes(termoLimpo)).slice(0, 20);
        } catch (erro) {
            retornar [];
        }
    }

    função assíncrona buscarPedidosParaVincular(termo) {
        const termoLimpo = String(termo || "").trim().toLowerCase();
        se (!termoLimpo) retorne [];
        tentar {
            const snap = aguarda getDocs(query(collection(db, "pedidos"), where("criadoPor", "==", storeUid()), limit(200)));
            const todos = [];
            snap.forEach(d => todos.push({ id: d.id, ...d.data() }));
            return todos.filter(p => !p.clienteId && String(p.cliente || "").toLowerCase().includes(termoLimpo)).slice(0, 20);
        } catch (erro) {
            retornar [];
        }
    }

    função bindEventos() {
        el("crm-cliente-fechar")?.addEventListener("clique", fechar);
        el("crm-btn-criar-cliente")?.addEventListener("clique", criarClienteDaConversa);

        // Lista própria (navegação direta pro CRM 360, view-crm360).
        el("crm-lista-clientes")?.addEventListener("clique", evento => {
            const abrir = event.target.closest("[data-crm-abrir-cliente]");
            if (abrir) abrirParaClienteId(abrir.getAttribute("data-crm-abrir-cliente"));
            if (event.target.closest("[data-crm-lista-acao='recarregar']")) loadLista({ force: true });
        });
        el("crm-lista-busca")?.addEventListener("input", event => {
            state.listaFiltro.busca = event.target.value;
            renderListClientes();
        });
        el("crm-lista-filtro-status")?.addEventListener("change", event => {
            state.listaFiltro.status = event.target.value;
            renderListClientes();
        });
        el("crm-lista-ordem")?.addEventListener("alterar", evento => {
            state.listaFiltro.ordem = event.target.value;
            renderListClientes();
        });
        el("crm-lista-atualizar")?.addEventListener("click", () => loadLista({ force: true }));

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
            se (alvo) removerTag(alvo.getAttribute("data-crm-tag-remover"));
        });
        el("crm-tag-form")?.addEventListener("submit", event => {
            evento.prevenirPadrão();
            const input = el("crm-tag-input");
            const valor = input?.value.trim();
            se (!valor) retorne;
            adicionarTag(valor);
            se (entrada) input.value = "";
        });

        el("crm-observacao-form")?.addEventListener("submit", event => {
            evento.prevenirPadrão();
            const input = el("crm-observacao-input");
            const valor = input?.value.trim();
            se (!valor) retorne;
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
        el("crm-pedidos-lista")?.addEventListener("clique", evento => {
            const alvo = event.target.closest("[data-crm-desvincular-pedido]");
            if (alvo)desvincularPedido(alvo.getAttribute("data-crm-desvincular-pedido"));
        });

        el("crm-produtos-busca-input")?.addEventListener("input", event => buscarProdutos(event.target.value));
        el("crm-produtos-busca-resultado")?.addEventListener("click", event => {
            const alvo = event.target.closest("[data-crm-add-produto]");
            if (alvo) vincularProdutoInteresse(alvo.getAttribute("data-crm-add-produto"));
        });
        el("crm-produtos-interesse-lista")?.addEventListener("clique", evento => {
            const alvo = event.target.closest("[data-crm-remover-produto]");
            if (alvo) removedorProdutoDaLista(alvo.getAttribute("data-crm-remover-produto"));
        });

        el("crm-timeline-filtro")?.addEventListener("change", event => {
            state.filtroTimeline = event.target.value;
            renderTimeline();
        });

        // Debounce simples: evita disparar uma consulta a cada tecla digitada.
        let noneBuscaLead = null;
        el("crm-busca-lead")?.addEventListener("input", event => {
            clearTimeout(temporizadorBuscaLead);
            const termo = event.target.value;
            legBuscaLead = setTimeout(async () => {
                const resultados = aguardar buscarLeadsParaVincular(termo);
                const box = el("crm-busca-lead-resultado");
                se (!box) retornar;
                box.innerHTML = resultados.map(l => `
                    <button type="button" class="atend-btn" data-crm-vincular-lead="${escaparHtml(l.id)}" style="width:100%;justify-content:space-between;margin-top:4px;">
                        <span>${escaparHtml(l.nome || "Sem nome")}</span><span>Vincular</span>
                    </button>
                `).join("") || `<p class="crm-vazio-texto">Nada encontrado.</p>`;
            }, 300);
        });
        el("crm-busca-lead-resultado")?.addEventListener("clique", evento => {
            const alvo = event.target.closest("[data-crm-vincular-lead]");
            if (alvo) vincularLead(alvo.getAttribute("data-crm-vincular-lead"));
        });

        deixe temporizadorBuscaPedido = null;
        el("crm-busca-pedido")?.addEventListener("input", event => {
            clearTimeout(temporizadorBuscaPedido);
            const termo = event.target.value;
            boaBuscaPedido = setTimeout(async () => {
                const resultados = aguardar buscarPedidosParaVincular(termo);
                const box = el("crm-busca-pedido-resultado");
                se (!box) retornar;
                box.innerHTML = resultados.map(p => `
                    <button type="button" class="atend-btn" data-crm-vincular-pedido="${escaparHtml(p.id)}" style="width:100%;justify-content:space-between;margin-top:4px;">
                        <span>${escaparHtml(p.cliente || "Pedido")} Â· ${formatarMoeda(p.valor)}</span><span>Vincular</span>
                    </button>
                `).join("") || `<p class="crm-vazio-texto">Nada encontrado.</p>`;
            }, 300);
        });
        el("crm-busca-pedido-resultado")?.addEventListener("clique", evento => {
            const alvo = event.target.closest("[data-crm-vincular-pedido]");
            if (alvo) vincularPedido(alvo.getAttribute("data-crm-vincular-pedido"));
        });
    }

    retornar {
        abrirParaConversa,
        abrirParaClienteId,
        fechar,
        †Líder,
        vincularPedido,
        buscarLeadsParaVincular,
        buscarPedidosParaVincular,
        carregarLista,
        bindEventos,
        estado
    };
}