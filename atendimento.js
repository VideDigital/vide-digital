// Central de Atendimento — evolução das coleções chats/mensagens já
// existentes (widget público da loja + painel de leads). Plano Blaze, mas
// escrita continua direta do cliente protegida pelas Rules: não há
// segredo, integração externa nem privilégio administrativo aqui — só
// autoria real (derivada do login) e transições de status validadas dos
// dois lados (app + firestore.rules).

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

export const CANAIS_CONVERSA = Object.freeze({
    loja_publica: "Loja pública",
    interno: "Interno",
    whatsapp_futuro: "WhatsApp (futuro)"
});

export const CATEGORIAS_TEMPLATE = Object.freeze({
    saudacao: "Saudação",
    orcamento: "Orçamento",
    pagamento: "Pagamento",
    prazo: "Prazo",
    entrega: "Entrega",
    indisponibilidade: "Indisponibilidade",
    suporte: "Suporte",
    encerramento: "Encerramento",
    personalizada: "Personalizada"
});

export const LIMITES_ATENDIMENTO = Object.freeze({
    mensagemMax: 4000,
    tituloTemplateMax: 160,
    conteudoTemplateMax: 2000,
    atalhoMax: 40,
    setorMax: 80,
    observacoesMax: 2000,
    maxTags: 10
});

// Único vocabulário de variáveis que um template pode usar. Qualquer
// outra coisa entre {{ }} passa direto sem virar dado nenhum — nunca é
// avaliada como código, é troca de texto por texto.
export const VARIAVEIS_TEMPLATE_PERMITIDAS = Object.freeze([
    "nome_cliente",
    "nome_loja",
    "nome_funcionario",
    "numero_pedido"
]);

export function substituirVariaveisTemplate(texto, valores = {}) {
    const origem = String(texto || "");
    return origem.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (match, chave) => {
        if (!VARIAVEIS_TEMPLATE_PERMITIDAS.includes(chave)) return match;
        const valor = valores[chave];
        return (valor !== undefined && valor !== null && String(valor).trim() !== "")
            ? String(valor)
            : match;
    });
}

export function validarTemplateAtendimento(item) {
    const titulo = String(item?.titulo || "").trim();
    const mensagem = String(item?.mensagem || "").trim();
    if (titulo.length < 1) return "Informe um título para o template.";
    if (titulo.length > LIMITES_ATENDIMENTO.tituloTemplateMax) {
        return `O título pode ter no máximo ${LIMITES_ATENDIMENTO.tituloTemplateMax} caracteres.`;
    }
    if (!mensagem) return "O conteúdo do template é obrigatório.";
    if (mensagem.length > LIMITES_ATENDIMENTO.conteudoTemplateMax) {
        return `O conteúdo pode ter no máximo ${LIMITES_ATENDIMENTO.conteudoTemplateMax} caracteres.`;
    }
    if (!(item?.categoria in CATEGORIAS_TEMPLATE)) return "Escolha uma categoria válida.";
    if (item?.atalho && String(item.atalho).length > LIMITES_ATENDIMENTO.atalhoMax) {
        return `O atalho pode ter no máximo ${LIMITES_ATENDIMENTO.atalhoMax} caracteres.`;
    }
    return "";
}

export function filtrarTemplates(templates, { busca = "", categoria = "todas", apenasAtivos = false } = {}) {
    const termo = String(busca || "").trim().toLowerCase();
    return (templates || []).filter(item => {
        if (categoria !== "todas" && item.categoria !== categoria) return false;
        if (apenasAtivos && item.ativo === false) return false;
        if (!termo) return true;
        const texto = [item.titulo, item.mensagem, item.atalho, item.categoria].join(" ").toLowerCase();
        return texto.includes(termo);
    });
}

function normalizarMs(valor) {
    if (!valor) return 0;
    if (typeof valor.toMillis === "function") return valor.toMillis();
    if (typeof valor.seconds === "number") return valor.seconds * 1000;
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : 0;
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

// Controller da tela — recebe dependências (db, contexto autenticado,
// funções do SDK e notificador) pra ficar testável sem navegador real,
// no mesmo formato de central-ia.js / base-conhecimento-ia.js.
export function criarAtendimentoController(deps) {
    const { db, context, firestore, notify = () => {} } = deps;
    const {
        collection, doc, getDoc, getDocs, setDoc, query, where, orderBy, limit,
        serverTimestamp, onSnapshot
    } = firestore;

    const state = {
        conversas: [],
        carregado: false,
        carregando: false,
        erro: false,
        conversaSelecionadaId: "",
        mensagens: [],
        mensagensCarregando: false,
        mensagensErro: false,
        funcionarios: [],
        templates: [],
        filtro: { busca: "", status: "todas", canal: "todos", apenasMinhas: false, apenasSemResponsavel: false },
        enviando: false,
        unsubscribeMensagens: null,
        // Navegação em etapas no mobile (a mesma marcação de 3 colunas do
        // desktop; no mobile só uma etapa fica visível por vez via CSS).
        etapaMobile: "lista"
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

    function nomeResponsavel(uid) {
        if (!uid) return "Sem responsável";
        if (uid === storeUid()) return "Você (dono da loja)";
        const funcionario = state.funcionarios.find(f => f.id === uid);
        return funcionario?.nome || "Funcionário removido";
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
        renderPainelCliente(conversa);
    }

    // Painel de dados do cliente: mostra o que já existe na própria
    // conversa (nome, canal, setor, responsável, notas internas, tags).
    // Não cruza com pedidos/leads ainda — limitação registrada na doc.
    function renderPainelCliente(conversa) {
        if (el("atend-cliente-nome")) el("atend-cliente-nome").textContent = conversa.clienteNome || "Cliente";
        if (el("atend-cliente-canal")) el("atend-cliente-canal").textContent = CANAIS_CONVERSA[conversa.canal] || "—";
        if (el("atend-cliente-setor")) el("atend-cliente-setor").textContent = conversa.setor || "Sem setor";
        if (el("atend-cliente-responsavel")) el("atend-cliente-responsavel").textContent = nomeResponsavel(conversa.atribuidoPara);
        if (el("atend-cliente-notas")) el("atend-cliente-notas").value = conversa.observacoesInternas || "";
        if (el("atend-cliente-tags")) el("atend-cliente-tags").value = Array.isArray(conversa.tags) ? conversa.tags.join(", ") : "";
    }

    function abrirPainelCliente() {
        el("atend-cliente-modal")?.classList.remove("hidden");
    }

    function fecharPainelCliente() {
        el("atend-cliente-modal")?.classList.add("hidden");
    }

    async function salvarNotasCliente() {
        const conversa = conversaSelecionada();
        if (!conversa || !podeResponder()) return;
        const notas = (el("atend-cliente-notas")?.value || "").trim().slice(0, LIMITES_ATENDIMENTO.observacoesMax);
        const tags = (el("atend-cliente-tags")?.value || "")
            .split(",").map(t => t.trim()).filter(Boolean).slice(0, LIMITES_ATENDIMENTO.maxTags);
        try {
            await setDoc(doc(db, "chats", conversa.id), {
                observacoesInternas: notas,
                tags,
                atualizadoEm: Date.now()
            }, { merge: true });
            conversa.observacoesInternas = notas;
            conversa.tags = tags;
            notify("Dados do cliente atualizados.");
            fecharPainelCliente();
        } catch (error) {
            console.error("[Atendimento] Falha ao salvar dados do cliente:", codigoErroFirebase(error), error?.message);
            notify("Não foi possível salvar agora.", "error");
        }
    }

    function renderMensagens() {
        const box = el("atend-mensagens");
        if (!box) return;

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

        if (state.mensagens.length === 0) {
            box.innerHTML = `<div class="atend-vazio"><p>Nenhuma mensagem ainda.</p></div>`;
            return;
        }

        box.innerHTML = state.mensagens.map(msg => {
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
        }).join("");
        box.scrollTop = box.scrollHeight;
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
            renderMensagens();
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

    async function selecionarConversa(id) {
        if (!id || id === state.conversaSelecionadaId) return;
        pararEscutaMensagens();
        state.conversaSelecionadaId = id;
        state.mensagens = [];
        state.mensagensErro = false;
        state.mensagensCarregando = true;
        state.etapaMobile = "conversa";
        await render();

        try {
            const mensagensQuery = query(
                collection(db, "chats", id, "mensagens"),
                orderBy("timestamp", "asc"),
                limit(200)
            );
            state.unsubscribeMensagens = onSnapshot(mensagensQuery, snap => {
                state.mensagens = [];
                snap.forEach(d => state.mensagens.push({ id: d.id, ...d.data() }));
                state.mensagensCarregando = false;
                renderMensagens();
            }, error => {
                console.error("[Atendimento] Falha ao ouvir mensagens:", codigoErroFirebase(error), error?.message);
                state.mensagensErro = true;
                state.mensagensCarregando = false;
                renderMensagens();
            });
        } catch (error) {
            console.error("[Atendimento] Falha ao abrir conversa:", codigoErroFirebase(error), error?.message);
            state.mensagensErro = true;
            state.mensagensCarregando = false;
            renderMensagens();
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
        state.enviando = true;
        try {
            const agora = Date.now();
            await setDoc(doc(collection(db, "chats", conversa.id, "mensagens")), {
                texto: mensagem,
                sender: "admin",
                timestamp: agora,
                autorUid: authUid(),
                autorTipo: tipoAutorAtual(),
                autorNome: nomeAutorAtual()
            });
            await setDoc(doc(db, "chats", conversa.id), {
                ultimaMensagem: mensagem,
                statusAdmin: "respondido",
                status: "aguardando_cliente",
                statusAtualizadoPor: authUid(),
                statusAtualizadoEm: agora,
                atualizadoEm: agora
            }, { merge: true });
            conversa.ultimaMensagem = mensagem;
            conversa.status = "aguardando_cliente";
            conversa.atualizadoEm = agora;
            await render();
        } catch (error) {
            console.error("[Atendimento] Falha ao enviar resposta:", codigoErroFirebase(error), error?.message);
            notify("Não foi possível enviar a resposta agora. Tente de novo.", "error");
        } finally {
            state.enviando = false;
        }
    }

    async function alterarStatus(novoStatus) {
        const conversa = conversaSelecionada();
        if (!conversa || !podeResponder()) return;
        if (!podeTransicionarStatus(conversa.status, novoStatus)) {
            notify("Essa mudança de status não é permitida a partir do status atual.", "error");
            return;
        }
        try {
            const agora = Date.now();
            await setDoc(doc(db, "chats", conversa.id), {
                status: novoStatus,
                statusAtualizadoPor: authUid(),
                statusAtualizadoEm: agora,
                atualizadoEm: agora
            }, { merge: true });
            conversa.status = novoStatus;
            notify("Status atualizado.");
            await render();
        } catch (error) {
            console.error("[Atendimento] Falha ao mudar status:", codigoErroFirebase(error), error?.message);
            notify("Não foi possível atualizar o status.", "error");
        }
    }

    async function atribuirResponsavel(uidResponsavel) {
        const conversa = conversaSelecionada();
        if (!conversa || !podeResponder()) return;
        const alvo = String(uidResponsavel || "").trim();
        const valido = alvo === "" || alvo === storeUid()
            || funcionarioPodeAtender(state.funcionarios.find(f => f.id === alvo));
        if (!valido) {
            notify("Não é possível atribuir a este responsável.", "error");
            return;
        }
        try {
            const agora = Date.now();
            await setDoc(doc(db, "chats", conversa.id), {
                atribuidoPara: alvo,
                atribuidoPor: authUid(),
                atribuidoEm: agora,
                atualizadoEm: agora
            }, { merge: true });
            conversa.atribuidoPara = alvo;
            notify(alvo ? "Conversa atribuída." : "Responsável removido.");
            await render();
        } catch (error) {
            console.error("[Atendimento] Falha ao atribuir conversa:", codigoErroFirebase(error), error?.message);
            notify("Não foi possível atualizar o responsável.", "error");
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

        el("atend-btn-dados-cliente")?.addEventListener("click", abrirPainelCliente);
        el("atend-cliente-fechar")?.addEventListener("click", fecharPainelCliente);
        el("atend-cliente-salvar")?.addEventListener("click", salvarNotasCliente);

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
    }

    return {
        load,
        bindEventos,
        selecionarConversa,
        abrirConversaPorId,
        enviarResposta,
        alterarStatus,
        atribuirResponsavel,
        state
    };
}
