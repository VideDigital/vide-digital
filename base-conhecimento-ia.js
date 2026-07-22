// Base de Conhecimento da IA — módulo por tenant (plano Spark, escrita
// direta no Firestore protegida por regras). Itens de conhecimento que
// alimentarão a futura assistente: FAQ, dados da empresa, políticas,
// manuais, documentos e catálogo. Nenhum provedor de IA é chamado aqui.

export const TIPOS_CONHECIMENTO = Object.freeze({
    faq: "Pergunta frequente (FAQ)",
    empresa: "Sobre a empresa",
    politica: "Política",
    atendimento: "Atendimento",
    manual: "Manual / instruções",
    produto: "Produto",
    documento: "Documento",
    catalogo: "Catálogo"
});

export const STATUS_CONHECIMENTO = Object.freeze({
    ativo: "Ativo",
    rascunho: "Rascunho",
    arquivado: "Arquivado"
});

export const PRIORIDADES_CONHECIMENTO = Object.freeze({
    baixa: "Baixa",
    normal: "Normal",
    alta: "Alta",
    critica: "Crítica"
});

export const CATEGORIAS_POLITICA = Object.freeze([
    "entrega", "troca", "devolucao", "cancelamento", "pagamento",
    "privacidade", "personalizacao", "prazo", "garantia", "atendimento"
]);

export const LIMITES_CONHECIMENTO = Object.freeze({
    tituloMin: 3,
    tituloMax: 160,
    conteudoMax: 8000,
    resumoMax: 300,
    categoriaMax: 80,
    maxTags: 10,
    tagMax: 40
});

export function normalizarTagsConhecimento(valor) {
    const lista = Array.isArray(valor)
        ? valor
        : String(valor || "").split(",");
    return Array.from(new Set(
        lista
            .map(tag => String(tag || "").trim().toLowerCase().slice(0, LIMITES_CONHECIMENTO.tagMax))
            .filter(Boolean)
    )).slice(0, LIMITES_CONHECIMENTO.maxTags);
}

// Valida um item ANTES de tentar salvar; devolve a primeira mensagem de
// erro em português, ou "" quando o item é válido. As regras do Firestore
// revalidam tudo do lado do servidor — isto aqui é só pra dar feedback
// imediato e legível.
export function validarItemConhecimento(item) {
    const titulo = String(item?.titulo || "").trim();
    const conteudo = String(item?.conteudo || "").trim();
    if (titulo.length < LIMITES_CONHECIMENTO.tituloMin) {
        return `O título precisa ter ao menos ${LIMITES_CONHECIMENTO.tituloMin} caracteres.`;
    }
    if (titulo.length > LIMITES_CONHECIMENTO.tituloMax) {
        return `O título pode ter no máximo ${LIMITES_CONHECIMENTO.tituloMax} caracteres.`;
    }
    if (!conteudo) {
        return "O conteúdo é obrigatório.";
    }
    if (conteudo.length > LIMITES_CONHECIMENTO.conteudoMax) {
        return `O conteúdo pode ter no máximo ${LIMITES_CONHECIMENTO.conteudoMax} caracteres.`;
    }
    if (String(item?.resumo || "").length > LIMITES_CONHECIMENTO.resumoMax) {
        return `O resumo pode ter no máximo ${LIMITES_CONHECIMENTO.resumoMax} caracteres.`;
    }
    if (!(item?.tipo in TIPOS_CONHECIMENTO)) {
        return "Escolha um tipo válido para o conteúdo.";
    }
    if (!(item?.status in STATUS_CONHECIMENTO)) {
        return "Escolha um status válido.";
    }
    if (!(item?.prioridade in PRIORIDADES_CONHECIMENTO)) {
        return "Escolha uma prioridade válida.";
    }
    return "";
}

export function filtrarItensConhecimento(itens, { busca = "", tipo = "todos", status = "todos" } = {}) {
    const termo = String(busca || "").trim().toLowerCase();
    return (itens || []).filter(item => {
        if (tipo !== "todos" && item.tipo !== tipo) return false;
        if (status !== "todos" && item.status !== status) return false;
        if (!termo) return true;
        const texto = [
            item.titulo,
            item.resumo,
            item.conteudo,
            item.categoria,
            ...(Array.isArray(item.tags) ? item.tags : [])
        ].join(" ").toLowerCase();
        return texto.includes(termo);
    });
}

// Indicador transparente de prontidão (0–100): soma critérios objetivos
// da configuração da assistente + do acervo de conhecimento, e devolve
// também o que falta — nunca uma pontuação arbitrária sem explicação.
export const CRITERIOS_PRONTIDAO = Object.freeze([
    { chave: "identidade", pontos: 10, rotulo: "Nome da assistente definido" },
    { chave: "saudacao", pontos: 10, rotulo: "Mensagem de apresentação" },
    { chave: "fallback", pontos: 10, rotulo: "Mensagem de fallback" },
    { chave: "instrucoes", pontos: 10, rotulo: "Instruções personalizadas" },
    { chave: "canais", pontos: 5, rotulo: "Ao menos um canal habilitado" },
    { chave: "empresa", pontos: 15, rotulo: "Sobre a empresa cadastrado" },
    { chave: "politica", pontos: 15, rotulo: "Ao menos uma política" },
    { chave: "faq", pontos: 15, rotulo: "Ao menos uma FAQ" },
    { chave: "acervo", pontos: 10, rotulo: "3 ou mais conteúdos ativos" }
]);

export function calcularProntidaoIA({ config = null, itens = [] } = {}) {
    const ativos = (itens || []).filter(item => item.status === "ativo" && item.ativo !== false);
    const tem = tipo => ativos.some(item => item.tipo === tipo);
    const canais = config?.canais || {};
    const atendidos = {
        identidade: Boolean(String(config?.nomeAssistente || "").trim()),
        saudacao: Boolean(String(config?.mensagemApresentacao || "").trim()),
        fallback: Boolean(String(config?.mensagemFallback || "").trim()),
        instrucoes: Boolean(String(config?.instrucoes || "").trim()),
        canais: Object.values(canais).some(Boolean),
        empresa: tem("empresa"),
        politica: tem("politica"),
        faq: tem("faq"),
        acervo: ativos.length >= 3
    };
    let pontos = 0;
    const pendentes = [];
    CRITERIOS_PRONTIDAO.forEach(criterio => {
        if (atendidos[criterio.chave]) {
            pontos += criterio.pontos;
        } else {
            pendentes.push(criterio);
        }
    });
    return { pontos, pendentes, atendidos };
}

export function classificarProntidao(pontos) {
    if (pontos <= 20) return { nivel: "incompleta", rotulo: "Incompleta" };
    if (pontos <= 50) return { nivel: "inicial", rotulo: "Inicial" };
    if (pontos <= 75) return { nivel: "boa", rotulo: "Boa" };
    return { nivel: "preparada", rotulo: "Preparada" };
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

// Controller da tela. Recebe as dependências (db, contexto autenticado,
// funções do SDK e notificador) pra ficar testável sem navegador real.
export function criarBaseConhecimentoController(deps) {
    const { db, context, firestore, notify } = deps;
    const { collection, doc, getDoc, getDocs, setDoc, query, where, serverTimestamp } = firestore;

    const state = {
        itens: [],
        carregado: false,
        carregando: false,
        erro: false,
        busca: "",
        filtroTipo: "todos",
        filtroStatus: "todos",
        salvando: false,
        editandoId: ""
    };

    function el(id) {
        return document.getElementById(id);
    }

    function storeUid() {
        return context.getSnapshot().storeUid || "";
    }

    function podeEditar() {
        return context.canEdit("base-conhecimento-ia");
    }

    function dataItemMs(item) {
        const valor = item?.atualizadoEm || item?.criadoEm;
        if (valor && typeof valor.toMillis === "function") return valor.toMillis();
        const numero = Number(valor || 0);
        return Number.isFinite(numero) ? numero : 0;
    }

    async function carregarConfigIa() {
        try {
            const snap = await getDoc(doc(db, "configuracoes_ia", storeUid()));
            return snap.exists() ? snap.data() : null;
        } catch (e) {
            return null;
        }
    }

    function renderResumo(configIa) {
        const total = state.itens.filter(item => item.status !== "arquivado").length;
        const ativos = state.itens.filter(item => item.status === "ativo" && item.ativo !== false).length;
        const prontidao = calcularProntidaoIA({ config: configIa, itens: state.itens });
        const classe = classificarProntidao(prontidao.pontos);

        if (el("bc-kpi-total")) el("bc-kpi-total").textContent = String(total);
        if (el("bc-kpi-ativos")) el("bc-kpi-ativos").textContent = String(ativos);
        // Resumo da etapa 2 na jornada exibida dentro da Central de IA.
        if (el("ia-jornada-bc-resumo")) {
            el("ia-jornada-bc-resumo").textContent = total > 0
                ? `${ativos} ativo(s) de ${total} conteúdo(s) · prontidão ${prontidao.pontos}/100`
                : "FAQ, políticas e empresa";
        }
        if (el("bc-kpi-prontidao")) el("bc-kpi-prontidao").textContent = `${prontidao.pontos}`;
        if (el("bc-prontidao-nivel")) el("bc-prontidao-nivel").textContent = classe.rotulo;

        const barra = el("bc-prontidao-barra");
        if (barra) {
            barra.style.width = `${prontidao.pontos}%`;
            barra.className = `bc-prontidao-fill is-${classe.nivel}`;
        }
        const pendentesBox = el("bc-prontidao-pendentes");
        if (pendentesBox) {
            if (prontidao.pendentes.length === 0) {
                pendentesBox.innerHTML = '<span class="bc-pendente is-ok">Tudo pronto para conectar a assistente no futuro.</span>';
            } else {
                pendentesBox.innerHTML = prontidao.pendentes
                    .map(criterio => `<span class="bc-pendente">${escaparHtml(criterio.rotulo)} (+${criterio.pontos})</span>`)
                    .join("");
            }
        }
    }

    function renderLista() {
        const lista = el("bc-lista");
        if (!lista) return;

        if (state.erro) {
            lista.innerHTML = `
                <div class="bc-vazio">
                    <strong>Não deu pra carregar a base de conhecimento</strong>
                    <p>Verifique sua conexão e tente novamente.</p>
                    <button type="button" class="bc-btn bc-btn-primario" data-bc-acao="recarregar">Tentar novamente</button>
                </div>
            `;
            return;
        }

        const visiveis = filtrarItensConhecimento(state.itens, {
            busca: state.busca,
            tipo: state.filtroTipo,
            status: state.filtroStatus
        }).sort((a, b) => dataItemMs(b) - dataItemMs(a));

        if (visiveis.length === 0) {
            const semNada = state.itens.length === 0;
            lista.innerHTML = `
                <div class="bc-vazio">
                    <strong>${semNada ? "Nenhum conteúdo cadastrado ainda" : "Nada encontrado com estes filtros"}</strong>
                    <p>${semNada
                        ? "Comece cadastrando uma FAQ, os dados da empresa ou uma política — é isso que a futura assistente vai usar para responder."
                        : "Ajuste a busca ou os filtros acima para ver os demais conteúdos."}</p>
                    ${semNada && podeEditar() ? '<button type="button" class="bc-btn bc-btn-primario" data-bc-acao="novo">Cadastrar primeiro conteúdo</button>' : ""}
                </div>
            `;
            return;
        }

        const editavel = podeEditar();
        lista.innerHTML = visiveis.map(item => {
            const tags = (Array.isArray(item.tags) ? item.tags : [])
                .map(tag => `<span class="bc-tag">${escaparHtml(tag)}</span>`)
                .join("");
            const resumo = item.resumo || String(item.conteudo || "").slice(0, 180);
            return `
                <article class="bc-item is-${escaparHtml(item.status)}" data-bc-id="${escaparHtml(item.id)}">
                    <div class="bc-item-head">
                        <div class="bc-item-titulo">
                            <span class="bc-chip is-tipo">${escaparHtml(TIPOS_CONHECIMENTO[item.tipo] || item.tipo)}</span>
                            <span class="bc-chip is-status is-${escaparHtml(item.status)}">${escaparHtml(STATUS_CONHECIMENTO[item.status] || item.status)}</span>
                            ${item.prioridade === "alta" || item.prioridade === "critica"
                                ? `<span class="bc-chip is-prioridade is-${escaparHtml(item.prioridade)}">${escaparHtml(PRIORIDADES_CONHECIMENTO[item.prioridade])}</span>`
                                : ""}
                        </div>
                        <h3>${escaparHtml(item.titulo)}</h3>
                        <p>${escaparHtml(resumo)}</p>
                        ${tags ? `<div class="bc-item-tags">${tags}</div>` : ""}
                    </div>
                    ${editavel ? `
                        <div class="bc-item-acoes">
                            <button type="button" class="bc-btn" data-bc-acao="editar" data-bc-id="${escaparHtml(item.id)}">Editar</button>
                            <button type="button" class="bc-btn" data-bc-acao="duplicar" data-bc-id="${escaparHtml(item.id)}">Duplicar</button>
                            ${item.status === "arquivado"
                                ? `<button type="button" class="bc-btn" data-bc-acao="reativar" data-bc-id="${escaparHtml(item.id)}">Reativar</button>`
                                : `
                                    <button type="button" class="bc-btn" data-bc-acao="${item.status === "ativo" ? "pausar" : "ativar"}" data-bc-id="${escaparHtml(item.id)}">
                                        ${item.status === "ativo" ? "Tornar rascunho" : "Ativar"}
                                    </button>
                                    <button type="button" class="bc-btn is-perigo" data-bc-acao="arquivar" data-bc-id="${escaparHtml(item.id)}">Arquivar</button>
                                `}
                        </div>
                    ` : ""}
                </article>
            `;
        }).join("");
    }

    async function render() {
        const configIa = await carregarConfigIa();
        renderResumo(configIa);
        renderLista();
        const btnNovo = el("bc-btn-novo");
        if (btnNovo) btnNovo.classList.toggle("hidden", !podeEditar());
    }

    async function load({ force = false } = {}) {
        if (!storeUid()) return;
        if (state.carregando) return;
        if (state.carregado && !force) {
            await render();
            return;
        }
        state.carregando = true;
        const lista = el("bc-lista");
        if (lista && state.itens.length === 0) {
            lista.innerHTML = `
                <div class="bc-item bc-skel"><span class="aura-skel bc-skel-linha" style="width:35%"></span><span class="aura-skel bc-skel-linha" style="width:85%"></span><span class="aura-skel bc-skel-linha" style="width:60%"></span></div>
                <div class="bc-item bc-skel"><span class="aura-skel bc-skel-linha" style="width:45%"></span><span class="aura-skel bc-skel-linha" style="width:75%"></span><span class="aura-skel bc-skel-linha" style="width:50%"></span></div>
            `;
        }
        try {
            const snap = await getDocs(query(
                collection(db, "base_conhecimento_ia"),
                where("tenantId", "==", storeUid())
            ));
            state.itens = [];
            snap.forEach(d => state.itens.push({ id: d.id, ...d.data() }));
            state.erro = false;
            state.carregado = true;
        } catch (error) {
            console.error("[Base de Conhecimento] Falha ao carregar:", codigoErroFirebase(error), error?.message);
            state.erro = true;
        } finally {
            state.carregando = false;
        }
        await render();
    }

    function preencherFormulario(item) {
        el("bc-form-titulo").value = item?.titulo || "";
        el("bc-form-tipo").value = item?.tipo || "faq";
        el("bc-form-status").value = item?.status || "ativo";
        el("bc-form-prioridade").value = item?.prioridade || "normal";
        el("bc-form-categoria").value = item?.categoria || "";
        el("bc-form-resumo").value = item?.resumo || "";
        el("bc-form-conteudo").value = item?.conteudo || "";
        el("bc-form-tags").value = Array.isArray(item?.tags) ? item.tags.join(", ") : "";
    }

    function abrirModal(item = null) {
        if (!podeEditar()) {
            notify("Sua conta não tem permissão para editar a base de conhecimento.", "error");
            return;
        }
        state.editandoId = item?.id || "";
        preencherFormulario(item);
        if (el("bc-modal-titulo")) {
            el("bc-modal-titulo").textContent = item ? "Editar conteúdo" : "Novo conteúdo";
        }
        el("bc-modal")?.classList.remove("hidden");
        el("bc-form-titulo")?.focus();
    }

    function fecharModal() {
        state.editandoId = "";
        el("bc-modal")?.classList.add("hidden");
    }

    function lerFormulario() {
        return {
            titulo: el("bc-form-titulo").value.trim(),
            tipo: el("bc-form-tipo").value,
            status: el("bc-form-status").value,
            prioridade: el("bc-form-prioridade").value,
            categoria: el("bc-form-categoria").value.trim().slice(0, LIMITES_CONHECIMENTO.categoriaMax),
            resumo: el("bc-form-resumo").value.trim().slice(0, LIMITES_CONHECIMENTO.resumoMax),
            conteudo: el("bc-form-conteudo").value.trim(),
            tags: normalizarTagsConhecimento(el("bc-form-tags").value)
        };
    }

    async function salvar() {
        if (state.salvando) return;
        if (!podeEditar()) return;
        const dados = lerFormulario();
        const erro = validarItemConhecimento(dados);
        if (erro) {
            notify(erro, "error");
            return;
        }
        state.salvando = true;
        const btn = el("bc-form-salvar");
        if (btn) btn.disabled = true;
        try {
            const contexto = context.getSnapshot();
            const agora = serverTimestamp();
            const base = {
                ...dados,
                tenantId: storeUid(),
                lojaId: storeUid(),
                ativo: dados.status === "ativo",
                atualizadoPor: contexto.authUid,
                atualizadoEm: agora
            };
            if (state.editandoId) {
                const atual = state.itens.find(item => item.id === state.editandoId);
                await setDoc(doc(db, "base_conhecimento_ia", state.editandoId), {
                    ...base,
                    criadoPor: atual?.criadoPor || contexto.authUid,
                    criadoEm: atual?.criadoEm || agora
                });
                notify("Conteúdo atualizado.");
            } else {
                const ref = doc(collection(db, "base_conhecimento_ia"));
                await setDoc(ref, {
                    ...base,
                    criadoPor: contexto.authUid,
                    criadoEm: agora
                });
                notify("Conteúdo cadastrado na base de conhecimento.");
            }
            fecharModal();
            await load({ force: true });
        } catch (error) {
            console.error("[Base de Conhecimento] Falha ao salvar:", codigoErroFirebase(error), error?.message);
            notify(codigoErroFirebase(error) === "permission-denied"
                ? "Sem permissão para salvar este conteúdo."
                : "Não foi possível salvar. Tente novamente.", "error");
        } finally {
            state.salvando = false;
            if (btn) btn.disabled = false;
        }
    }

    async function mudarStatus(id, novoStatus) {
        const item = state.itens.find(x => x.id === id);
        if (!item || !podeEditar()) return;
        try {
            const contexto = context.getSnapshot();
            const { id: _ignorado, ...dadosItem } = item;
            await setDoc(doc(db, "base_conhecimento_ia", id), {
                ...dadosItem,
                status: novoStatus,
                ativo: novoStatus === "ativo",
                atualizadoPor: contexto.authUid,
                atualizadoEm: serverTimestamp()
            });
            notify(novoStatus === "arquivado" ? "Conteúdo arquivado." : "Status atualizado.");
            await load({ force: true });
        } catch (error) {
            console.error("[Base de Conhecimento] Falha ao mudar status:", codigoErroFirebase(error), error?.message);
            notify("Não foi possível atualizar o status.", "error");
        }
    }

    function duplicar(id) {
        const item = state.itens.find(x => x.id === id);
        if (!item) return;
        abrirModal({
            ...item,
            id: "",
            titulo: `${item.titulo} (cópia)`.slice(0, LIMITES_CONHECIMENTO.tituloMax),
            status: "rascunho"
        });
        state.editandoId = "";
    }

    function bindEventos() {
        el("bc-busca")?.addEventListener("input", event => {
            state.busca = event.target.value;
            renderLista();
        });
        el("bc-filtro-tipo")?.addEventListener("change", event => {
            state.filtroTipo = event.target.value;
            renderLista();
        });
        el("bc-filtro-status")?.addEventListener("change", event => {
            state.filtroStatus = event.target.value;
            renderLista();
        });
        el("bc-btn-novo")?.addEventListener("click", () => abrirModal());
        el("bc-btn-atualizar")?.addEventListener("click", () => load({ force: true }));
        el("bc-form-salvar")?.addEventListener("click", salvar);
        el("bc-form-cancelar")?.addEventListener("click", fecharModal);
        el("bc-modal-fechar")?.addEventListener("click", fecharModal);

        el("bc-lista")?.addEventListener("click", event => {
            const alvo = event.target.closest("[data-bc-acao]");
            if (!alvo) return;
            const acao = alvo.getAttribute("data-bc-acao");
            const id = alvo.getAttribute("data-bc-id") || "";
            if (acao === "novo") abrirModal();
            if (acao === "recarregar") load({ force: true });
            if (acao === "editar") abrirModal(state.itens.find(x => x.id === id));
            if (acao === "duplicar") duplicar(id);
            if (acao === "arquivar") mudarStatus(id, "arquivado");
            if (acao === "reativar") mudarStatus(id, "ativo");
            if (acao === "ativar") mudarStatus(id, "ativo");
            if (acao === "pausar") mudarStatus(id, "rascunho");
        });
    }

    return { load, bindEventos, state };
}
