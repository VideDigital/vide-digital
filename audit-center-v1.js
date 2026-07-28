/* =========================================================
   VIDE HUB — CENTRAL DE AUDITORIA V1
   Controller da view #view-auditoria: consulta paginada (sem listener
   permanente) de auditoria/{eventId}, filtros, drawer de detalhes e
   exportação. Padrão de injeção igual a central-ia.js/crm360.js/
   growth-tracking-v1.js — nunca importa Firebase direto.
   ========================================================= */

import {
    rotuloRisco,
    rotuloOperacao,
    rotuloModulo,
    rotuloAtor,
    formatarDataHora,
    truncarUid,
    filtrarEventosLocal,
    eventosParaCsv,
    eventosParaJson,
    calcularKpis,
    LIMITE_EXPORTACAO,
    RISCOS,
    OPERACOES,
    MODULO_LABEL
} from "./audit-core-v1.js";

const PAGE_SIZE = 50;
const EXPORT_SIZE = LIMITE_EXPORTACAO;

// Campo do formulário -> campo real do documento em auditoria/{eventId}.
// Só UM destes fica ativo por vez (junto com o período) — evita precisar
// de índice composto pra cada combinação possível.
const CAMPO_FIRESTORE = {
    modulo: "module",
    operacao: "operation",
    risco: "risk",
    ator: "actorUid"
};

// Navegação "quando seguro" — só troca de view, não faz deep-link pro
// item específico (os controllers de destino não expõem esse hook hoje;
// ver docs/AUDITORIA_CENTRALIZADA.md pra essa limitação honesta).
const ENTIDADE_NAVEGACAO = {
    pedidos: { view: "view-pedidos", colecao: "pedidos", rotulo: "Pedidos" },
    crm: { view: "view-crm360", colecao: "clientes", rotulo: "CRM 360" },
    atendimento: { view: "view-atendimento", colecao: "chats", rotulo: "Atendimento" },
    produtos: { view: "view-produtos", colecao: "produtos", rotulo: "Produtos" }
};

function inicioDoDia(data) {
    const copia = new Date(data);
    copia.setHours(0, 0, 0, 0);
    return copia;
}

function diasAtras(quantidade) {
    const data = new Date();
    data.setDate(data.getDate() - quantidade);
    return inicioDoDia(data);
}

export function criarAuditCenterController({
    db,
    context,
    firestore,
    notify = () => {},
    logger = console,
    root = document
}) {
    const {
        collection, doc, getDoc, getDocs, query, where, orderBy, limit, startAfter, Timestamp
    } = firestore;

    const state = {
        eventos: [],
        kpis: { eventosHoje: 0, altoRisco: 0, atoresAtivos: 0, modulosAlterados: 0 },
        filtro: { periodo: "7d", campo: "", valor: "", busca: "", de: "", ate: "" },
        ultimoDoc: null,
        temMais: true,
        carregando: false,
        eventoSelecionadoId: null,
        carregado: false
    };

    function byId(id) {
        return root.getElementById(id);
    }

    function storeUid() {
        return context.getSnapshot?.().storeUid || "";
    }

    function escaparHtml(valor) {
        return String(valor ?? "").replace(/[&<>"']/g, (c) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        }[c]));
    }

    function periodoParaDatas(filtro) {
        if (filtro.periodo === "hoje") return { de: inicioDoDia(new Date()), ate: null };
        if (filtro.periodo === "7d") return { de: diasAtras(7), ate: null };
        if (filtro.periodo === "30d") return { de: diasAtras(30), ate: null };
        if (filtro.periodo === "90d") return { de: diasAtras(90), ate: null };
        if (filtro.periodo === "personalizado") {
            const de = filtro.de ? new Date(`${filtro.de}T00:00:00`) : null;
            const ate = filtro.ate ? new Date(`${filtro.ate}T23:59:59`) : null;
            return { de, ate };
        }
        return { de: null, ate: null };
    }

    function montarQueryBase({ paraExportacao = false } = {}) {
        const uid = storeUid();
        if (!uid) return null;

        const clausulas = [where("ownerUid", "==", uid)];
        const { de, ate } = periodoParaDatas(state.filtro);
        if (de) clausulas.push(where("createdAt", ">=", Timestamp.fromDate(de)));
        if (ate) clausulas.push(where("createdAt", "<=", Timestamp.fromDate(ate)));

        if (state.filtro.campo && state.filtro.valor && CAMPO_FIRESTORE[state.filtro.campo]) {
            clausulas.push(where(CAMPO_FIRESTORE[state.filtro.campo], "==", state.filtro.valor));
        }

        clausulas.push(orderBy("createdAt", "desc"));
        clausulas.push(limit(paraExportacao ? EXPORT_SIZE : PAGE_SIZE));

        return query(collection(db, "auditoria"), ...clausulas);
    }

    function docParaEvento(docSnap) {
        return { ...docSnap.data(), _docId: docSnap.id };
    }

    async function carregarKpisDoDia() {
        const uid = storeUid();
        if (!uid) return;
        try {
            const q = query(
                collection(db, "auditoria"),
                where("ownerUid", "==", uid),
                where("createdAt", ">=", Timestamp.fromDate(inicioDoDia(new Date()))),
                orderBy("createdAt", "desc"),
                limit(200)
            );
            const snap = await getDocs(q);
            state.kpis = calcularKpis(snap.docs.map(docParaEvento));
        } catch (error) {
            logger.warn?.("[auditoria] Falha ao calcular KPIs do dia:", error);
        }
    }

    async function carregarPagina({ reset = true } = {}) {
        const uid = storeUid();
        if (!uid) {
            mostrarEstado("sem-permissao");
            return;
        }

        state.carregando = true;
        atualizarBotaoVerMais();

        try {
            let q = montarQueryBase();
            if (!q) {
                mostrarEstado("sem-permissao");
                return;
            }
            if (!reset && state.ultimoDoc) {
                q = query(q, startAfter(state.ultimoDoc));
            }

            const snap = await getDocs(q);
            const novosEventos = snap.docs.map(docParaEvento);

            state.eventos = reset ? novosEventos : [...state.eventos, ...novosEventos];
            state.ultimoDoc = snap.docs.length ? snap.docs[snap.docs.length - 1] : state.ultimoDoc;
            state.temMais = snap.docs.length === PAGE_SIZE;
            state.carregado = true;

            mostrarEstado(state.eventos.length ? "conteudo" : "vazio");
            renderTabela();
        } catch (error) {
            // permission-denied é esperado pra quem não é dono/videAdmin
            // (Rules bloqueando de propósito) — não é uma falha inesperada
            // da aplicação, então não vira console.error.
            if (String(error?.code || "").includes("permission-denied")) {
                logger.warn?.("[auditoria] Sem permissão para ler eventos (esperado pra não-dono):", error);
                mostrarEstado("sem-permissao");
            } else {
                logger.error?.("[auditoria] Falha ao carregar eventos:", error);
                mostrarEstado("erro");
            }
        } finally {
            state.carregando = false;
            atualizarBotaoVerMais();
        }
    }

    function mostrarEstado(nome) {
        const mapa = {
            carregando: byId("audit-estado-carregando"),
            erro: byId("audit-estado-erro"),
            "sem-permissao": byId("audit-estado-sem-permissao"),
            vazio: byId("audit-vazio"),
            conteudo: byId("audit-conteudo")
        };
        Object.entries(mapa).forEach(([chave, elemento]) => {
            if (!elemento) return;
            const deveMostrar = chave === nome || (nome === "conteudo" && chave === "conteudo");
            elemento.classList.toggle("hidden", !deveMostrar);
        });
        // "vazio" é uma sub-mensagem dentro do conteúdo, não substitui a
        // seção — mostra os dois juntos quando não há eventos.
        if (nome === "vazio") {
            byId("audit-conteudo")?.classList.remove("hidden");
        }
    }

    function renderKpis() {
        const mapa = {
            "audit-kpi-eventos-hoje": state.kpis.eventosHoje,
            "audit-kpi-alto-risco": state.kpis.altoRisco,
            "audit-kpi-atores": state.kpis.atoresAtivos,
            "audit-kpi-modulos": state.kpis.modulosAlterados
        };
        Object.entries(mapa).forEach(([id, valor]) => {
            const elemento = byId(id);
            if (elemento) elemento.textContent = String(valor);
        });
    }

    function eventosVisiveis() {
        return filtrarEventosLocal(state.eventos, state.filtro.busca);
    }

    function linhaTabela(evento) {
        return `
            <tr data-audit-evento="${escaparHtml(evento._docId)}" tabindex="0" role="button" aria-label="Ver detalhes do evento">
                <td>${escaparHtml(formatarDataHora(evento.createdAt))}</td>
                <td>${escaparHtml(rotuloAtor(evento.actorType))}<small>${escaparHtml(truncarUid(evento.actorUid))}</small></td>
                <td>${escaparHtml(rotuloModulo(evento.module))}</td>
                <td>${escaparHtml(evento.action || "—")}</td>
                <td>${escaparHtml(evento.entityType)} <small>${escaparHtml(truncarUid(evento.entityId))}</small></td>
                <td><span class="audit-badge-risco" data-risco="${escaparHtml(evento.risk)}">${escaparHtml(rotuloRisco(evento.risk))}</span></td>
                <td class="audit-col-detalhes"><button type="button" data-audit-evento="${escaparHtml(evento._docId)}">Detalhes</button></td>
            </tr>
        `;
    }

    function cardMobile(evento) {
        return `
            <article class="audit-card-mobile" data-audit-evento="${escaparHtml(evento._docId)}" tabindex="0" role="button" aria-label="Ver detalhes do evento">
                <header>
                    <span class="audit-badge-risco" data-risco="${escaparHtml(evento.risk)}">${escaparHtml(rotuloRisco(evento.risk))}</span>
                    <time>${escaparHtml(formatarDataHora(evento.createdAt))}</time>
                </header>
                <strong>${escaparHtml(evento.summary || evento.action)}</strong>
                <p>${escaparHtml(rotuloModulo(evento.module))} · ${escaparHtml(evento.entityType)} ${escaparHtml(truncarUid(evento.entityId))}</p>
                <footer>${escaparHtml(rotuloAtor(evento.actorType))} <small>${escaparHtml(truncarUid(evento.actorUid))}</small></footer>
            </article>
        `;
    }

    function renderTabela() {
        renderKpis();
        const visiveis = eventosVisiveis();
        const corpo = byId("audit-tabela-corpo");
        const cards = byId("audit-cards-mobile");
        if (corpo) corpo.innerHTML = visiveis.map(linhaTabela).join("");
        if (cards) cards.innerHTML = visiveis.map(cardMobile).join("");

        const contagem = byId("audit-contagem");
        if (contagem) {
            contagem.textContent = visiveis.length === state.eventos.length
                ? `${state.eventos.length} evento(s) carregado(s)`
                : `${visiveis.length} de ${state.eventos.length} evento(s) (filtro de busca ativo)`;
        }

        byId("audit-vazio")?.classList.toggle("hidden", visiveis.length > 0);
        atualizarBotaoVerMais();
    }

    function atualizarBotaoVerMais() {
        const botao = byId("audit-ver-mais");
        if (!botao) return;
        botao.disabled = state.carregando || !state.temMais;
        botao.textContent = state.carregando ? "Carregando…" : (state.temMais ? "Ver mais" : "Não há mais eventos");
    }

    // ===== Drawer de detalhes =====

    function linhaChaveValor(rotulo, valor) {
        return `<div class="audit-drawer-linha"><span>${escaparHtml(rotulo)}</span><strong>${escaparHtml(valor)}</strong></div>`;
    }

    function blocoJson(titulo, objeto) {
        const texto = objeto && Object.keys(objeto).length
            ? JSON.stringify(objeto, null, 2)
            : "Nenhum dado sanitizado disponível.";
        return `<div class="audit-drawer-bloco"><h4>${escaparHtml(titulo)}</h4><pre></pre></div>`
            .replace("<pre></pre>", `<pre>${escaparHtml(texto)}</pre>`);
    }

    async function verificarEntidadeDisponivel(evento) {
        const nav = ENTIDADE_NAVEGACAO[evento.module];
        if (!nav || !evento.entityId) return null;
        try {
            const snap = await getDoc(doc(db, nav.colecao, evento.entityId));
            return { nav, existe: snap.exists() };
        } catch {
            return { nav, existe: false };
        }
    }

    async function abrirDrawer(eventoId) {
        const evento = state.eventos.find((item) => item._docId === eventoId);
        const drawer = byId("audit-drawer");
        const conteudo = byId("audit-drawer-conteudo");
        if (!evento || !drawer || !conteudo) return;

        state.eventoSelecionadoId = eventoId;

        conteudo.innerHTML = `
            <p class="audit-drawer-summary">${escaparHtml(evento.summary || evento.action)}</p>
            ${linhaChaveValor("Ator", `${rotuloAtor(evento.actorType)} (${truncarUid(evento.actorUid)})`)}
            ${linhaChaveValor("Horário", formatarDataHora(evento.createdAt))}
            ${linhaChaveValor("Módulo", rotuloModulo(evento.module))}
            ${linhaChaveValor("Entidade", `${evento.entityType} ${truncarUid(evento.entityId)}`)}
            ${linhaChaveValor("Operação", rotuloOperacao(evento.operation))}
            ${linhaChaveValor("Risco", rotuloRisco(evento.risk))}
            ${linhaChaveValor("Origem", evento.source || "—")}
            ${linhaChaveValor("Campos alterados", (evento.changedFields || []).join(", ") || "—")}
            ${blocoJson("Antes (sanitizado)", evento.before)}
            ${blocoJson("Depois (sanitizado)", evento.after)}
            <p class="audit-drawer-aviso">Dados sensíveis são omitidos deste registro.</p>
            <div id="audit-drawer-entidade"></div>
        `;

        drawer.classList.remove("hidden");
        drawer.setAttribute("aria-hidden", "false");
        byId("audit-drawer-fechar")?.focus();

        const resultado = await verificarEntidadeDisponivel(evento);
        const areaEntidade = byId("audit-drawer-entidade");
        if (!areaEntidade) return;
        if (!resultado) {
            areaEntidade.innerHTML = "";
        } else if (resultado.existe) {
            areaEntidade.innerHTML = `<button type="button" id="audit-drawer-abrir-entidade" data-audit-view="${escaparHtml(resultado.nav.view)}">Abrir em ${escaparHtml(resultado.nav.rotulo)}</button>`;
        } else {
            areaEntidade.innerHTML = `<p class="audit-drawer-aviso">Entidade não está mais disponível.</p>`;
        }
    }

    function fecharDrawer() {
        const drawer = byId("audit-drawer");
        if (!drawer) return;
        drawer.classList.add("hidden");
        drawer.setAttribute("aria-hidden", "true");
        state.eventoSelecionadoId = null;
    }

    // ===== Filtros =====

    function populatePeriodoPersonalizado() {
        const bloco = byId("audit-periodo-personalizado");
        if (bloco) bloco.classList.toggle("hidden", state.filtro.periodo !== "personalizado");
    }

    function atualizarBotoesPeriodo() {
        root.querySelectorAll?.("[data-audit-period]").forEach((botao) => {
            botao.classList.toggle("is-active", botao.getAttribute("data-audit-period") === state.filtro.periodo);
        });
    }

    // O controle de "valor" muda de forma conforme o campo escolhido:
    // <select> com opções conhecidas para módulo/operação/risco, texto
    // livre pra ator (UID) — não dá pra enumerar atores sem outra query.
    function renderFiltroValor() {
        const container = byId("audit-filtro-valor-container");
        if (!container) return;

        if (!state.filtro.campo) {
            container.innerHTML = "";
            return;
        }

        if (state.filtro.campo === "ator") {
            container.innerHTML = `<input type="text" id="audit-filtro-valor" placeholder="UID do ator" aria-label="UID do ator">`;
            return;
        }

        const opcoes = state.filtro.campo === "modulo"
            ? Object.keys(MODULO_LABEL).map((chave) => [chave, rotuloModulo(chave)])
            : state.filtro.campo === "operacao"
                ? OPERACOES.map((chave) => [chave, rotuloOperacao(chave)])
                : RISCOS.map((chave) => [chave, rotuloRisco(chave)]);

        container.innerHTML = `
            <select id="audit-filtro-valor" aria-label="Valor do filtro">
                <option value="">Selecione…</option>
                ${opcoes.map(([valor, rotulo]) => `<option value="${escaparHtml(valor)}">${escaparHtml(rotulo)}</option>`).join("")}
            </select>
        `;
    }

    function limparFiltros() {
        state.filtro = { periodo: "7d", campo: "", valor: "", busca: "", de: "", ate: "" };
        const campoSelect = byId("audit-filtro-campo");
        const busca = byId("audit-busca");
        if (campoSelect) campoSelect.value = "";
        renderFiltroValor();
        if (busca) busca.value = "";
        atualizarBotoesPeriodo();
        populatePeriodoPersonalizado();
        state.ultimoDoc = null;
        state.temMais = true;
        carregarPagina({ reset: true });
        carregarKpisDoDia();
    }

    // ===== Exportação =====

    function baixarArquivo(nome, conteudo, tipo) {
        try {
            const blob = new Blob([conteudo], { type: tipo });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = nome;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch (error) {
            logger.error?.("[auditoria] Falha ao exportar:", error);
            notify("Não foi possível gerar o arquivo de exportação.", "erro");
        }
    }

    async function exportar(formato) {
        const uid = storeUid();
        if (!uid) return;
        try {
            const q = montarQueryBase({ paraExportacao: true });
            if (!q) return;
            const snap = await getDocs(q);
            const eventos = snap.docs.map(docParaEvento);
            const carimbo = new Date().toISOString().slice(0, 10);
            if (formato === "csv") {
                baixarArquivo(`auditoria-${carimbo}.csv`, eventosParaCsv(eventos), "text/csv;charset=utf-8");
            } else {
                baixarArquivo(`auditoria-${carimbo}.json`, eventosParaJson(eventos), "application/json;charset=utf-8");
            }
            notify(`Exportação gerada com ${eventos.length} evento(s) (máximo ${EXPORT_SIZE}).`, "sucesso");
        } catch (error) {
            logger.error?.("[auditoria] Falha ao exportar eventos:", error);
            notify("Não foi possível exportar os eventos agora.", "erro");
        }
    }

    // ===== Eventos =====

    function bindEventos() {
        const view = byId("view-auditoria");
        if (!view || view.dataset.auditEventosLigados === "true") return;
        view.dataset.auditEventosLigados = "true";

        // O drawer nasce dentro do fluxo normal do documento (depois da
        // section da view). Reparentar pro <body> garante que ele participa
        // do stacking context raiz — sem isso, z-index alto sozinho não
        // basta: elementos fixos do chrome global (ex.: o sino de
        // notificações, .aura-notification-orb) podem viver dentro de um
        // ancestor com seu próprio stacking context e continuar
        // interceptando cliques mesmo com z-index menor (achado real via
        // Playwright em CI: clique em #audit-drawer-fechar interceptado
        // pelo sino).
        const drawer = byId("audit-drawer");
        if (drawer && drawer.parentElement !== document.body) {
            document.body.appendChild(drawer);
        }

        view.addEventListener("click", (evento) => {
            const alvoPeriodo = evento.target.closest("[data-audit-period]");
            if (alvoPeriodo) {
                state.filtro.periodo = alvoPeriodo.getAttribute("data-audit-period");
                atualizarBotoesPeriodo();
                populatePeriodoPersonalizado();
                if (state.filtro.periodo !== "personalizado") {
                    state.ultimoDoc = null;
                    state.temMais = true;
                    carregarPagina({ reset: true });
                }
                return;
            }

            const linha = evento.target.closest("[data-audit-evento]");
            if (linha) {
                abrirDrawer(linha.getAttribute("data-audit-evento"));
                return;
            }

            if (evento.target.closest("#audit-atualizar")) {
                state.ultimoDoc = null;
                state.temMais = true;
                carregarPagina({ reset: true });
                carregarKpisDoDia();
                return;
            }

            if (evento.target.closest("#audit-limpar")) {
                limparFiltros();
                return;
            }

            if (evento.target.closest("#audit-ver-mais")) {
                carregarPagina({ reset: false });
                return;
            }

            if (evento.target.closest("#audit-exportar-csv")) {
                exportar("csv");
                return;
            }

            if (evento.target.closest("#audit-exportar-json")) {
                exportar("json");
                return;
            }

            if (evento.target.closest("#audit-aplicar-periodo-personalizado")) {
                state.filtro.de = byId("audit-periodo-de")?.value || "";
                state.filtro.ate = byId("audit-periodo-ate")?.value || "";
                state.ultimoDoc = null;
                state.temMais = true;
                carregarPagina({ reset: true });
                return;
            }
        });

        view.addEventListener("keydown", (evento) => {
            const linha = evento.target.closest?.("[data-audit-evento]");
            if (linha && (evento.key === "Enter" || evento.key === " ")) {
                evento.preventDefault();
                abrirDrawer(linha.getAttribute("data-audit-evento"));
            }
        });

        view.addEventListener("input", (evento) => {
            if (evento.target.id === "audit-busca") {
                state.filtro.busca = evento.target.value;
                renderTabela();
            }
        });

        view.addEventListener("change", (evento) => {
            if (evento.target.id === "audit-filtro-campo") {
                state.filtro.campo = evento.target.value;
                state.filtro.valor = "";
                renderFiltroValor();
                if (!state.filtro.campo) {
                    state.ultimoDoc = null;
                    state.temMais = true;
                    carregarPagina({ reset: true });
                }
                return;
            }
            if (evento.target.id === "audit-filtro-valor") {
                state.filtro.valor = evento.target.value.trim();
                state.ultimoDoc = null;
                state.temMais = true;
                carregarPagina({ reset: true });
            }
        });

        // Campo de UID (ator) é texto livre — aplica com Enter, não a cada tecla.
        view.addEventListener("keydown", (evento) => {
            if (evento.target.id === "audit-filtro-valor" && evento.key === "Enter") {
                evento.preventDefault();
                state.filtro.valor = evento.target.value.trim();
                state.ultimoDoc = null;
                state.temMais = true;
                carregarPagina({ reset: true });
            }
        });

        byId("audit-drawer-fechar")?.addEventListener("click", fecharDrawer);
        byId("audit-drawer")?.addEventListener("click", (evento) => {
            if (evento.target.id === "audit-drawer") fecharDrawer();
            const abrirEntidade = evento.target.closest("#audit-drawer-abrir-entidade");
            if (abrirEntidade) {
                const targetView = abrirEntidade.getAttribute("data-audit-view");
                fecharDrawer();
                document.querySelector(`.nav-item[data-target="${targetView}"]`)?.click();
            }
        });
        document.addEventListener("keydown", (evento) => {
            if (evento.key === "Escape" && !byId("audit-drawer")?.classList.contains("hidden")) {
                fecharDrawer();
            }
        });
    }

    async function load({ force = false } = {}) {
        if (state.carregado && !force) {
            renderTabela();
            return;
        }
        mostrarEstado("carregando");
        await Promise.all([carregarPagina({ reset: true }), carregarKpisDoDia()]);
    }

    return { load, bindEventos, state };
}
