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
    rotuloOrigem,
    rotuloAcaoAuditoria,
    rotuloCampoAuditoria,
    rotuloEntidadeAuditoria,
    derivarAlteracoesAuditoria,
    formatarDataHora,
    truncarUid,
    filtrarEventosPorFiltros,
    contarFiltrosAtivos,
    criarFiltrosAuditoriaPadrao,
    eventosParaCsv,
    eventosParaJson,
    calcularKpis,
    LIMITE_EXPORTACAO,
    RISCOS,
    OPERACOES,
    ORIGENS,
    MODULO_LABEL
} from "./audit-core-v1.js";

const PAGE_SIZE = 50;
const EXPORT_SIZE = LIMITE_EXPORTACAO;

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
        filtro: criarFiltrosAuditoriaPadrao(),
        ultimoDoc: null,
        temMais: true,
        carregando: false,
        eventoSelecionadoId: null,
        focoAnterior: null,
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
        return filtrarEventosPorFiltros(state.eventos, state.filtro);
    }

    function linhaTabela(evento) {
        return `
            <tr data-audit-evento="${escaparHtml(evento._docId)}" tabindex="0" role="button" aria-label="Ver detalhes do evento">
                <td>${escaparHtml(formatarDataHora(evento.createdAt))}</td>
                <td>${escaparHtml(rotuloAtor(evento.actorType))}<small>${escaparHtml(truncarUid(evento.actorUid))}</small></td>
                <td>${escaparHtml(rotuloModulo(evento.module))}</td>
                <td>${escaparHtml(rotuloAcaoAuditoria(evento.action))}</td>
                <td>${escaparHtml(rotuloOperacao(evento.operation))}</td>
                <td>${escaparHtml(rotuloEntidadeAuditoria(evento.entityType))} <small>${escaparHtml(truncarUid(evento.entityId))}</small></td>
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
                <strong>${escaparHtml(evento.summary || rotuloAcaoAuditoria(evento.action))}</strong>
                <p>${escaparHtml(rotuloModulo(evento.module))} · ${escaparHtml(rotuloEntidadeAuditoria(evento.entityType))} ${escaparHtml(truncarUid(evento.entityId))}</p>
                <footer>${escaparHtml(rotuloOperacao(evento.operation))} · ${escaparHtml(rotuloAtor(evento.actorType))} <small>${escaparHtml(truncarUid(evento.actorUid))}</small></footer>
            </article>
        `;
    }

    function descricaoFiltrosAtivos() {
        const descricoes = [];
        if (state.filtro.periodo !== "7d") {
            const periodos = { hoje: "Hoje", "30d": "30 dias", "90d": "90 dias", personalizado: "Período personalizado" };
            descricoes.push(periodos[state.filtro.periodo] || state.filtro.periodo);
        }
        if (state.filtro.module) descricoes.push(`Módulo: ${rotuloModulo(state.filtro.module)}`);
        if (state.filtro.operation) descricoes.push(`Operação: ${rotuloOperacao(state.filtro.operation)}`);
        if (state.filtro.risk) descricoes.push(`Risco: ${rotuloRisco(state.filtro.risk)}`);
        if (state.filtro.source) descricoes.push(`Origem: ${rotuloOrigem(state.filtro.source)}`);
        if (state.filtro.actor) descricoes.push(`Ator: ${state.filtro.actor}`);
        if (state.filtro.entity) descricoes.push(`Entidade: ${state.filtro.entity}`);
        if (state.filtro.action) descricoes.push(`Ação: ${state.filtro.action}`);
        if (state.filtro.busca) descricoes.push(`Busca: ${state.filtro.busca}`);
        return descricoes;
    }

    function renderFiltrosAtivos() {
        const total = contarFiltrosAtivos(state.filtro);
        const indicador = byId("audit-filtros-indicador");
        const lista = byId("audit-filtros-ativos");
        if (indicador) {
            indicador.textContent = total ? `${total} filtro(s) ativo(s)` : "Nenhum filtro adicional";
            indicador.classList.toggle("is-active", total > 0);
        }
        if (lista) {
            lista.innerHTML = descricaoFiltrosAtivos()
                .map((texto) => `<span>${escaparHtml(texto)}</span>`)
                .join("");
            lista.classList.toggle("hidden", total === 0);
        }
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
                : `${visiveis.length} de ${state.eventos.length} evento(s) correspondem aos filtros`;
        }

        byId("audit-vazio")?.classList.toggle("hidden", visiveis.length > 0);
        renderFiltrosAtivos();
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

    function linhaIdCopiavel(rotulo, valor) {
        const texto = String(valor || "");
        if (!texto) return linhaChaveValor(rotulo, "—");
        return `<div class="audit-drawer-linha audit-drawer-id"><span>${escaparHtml(rotulo)}</span><code>${escaparHtml(texto)}</code><button type="button" data-audit-copy="${escaparHtml(texto)}" aria-label="Copiar ${escaparHtml(rotulo)}">Copiar</button></div>`;
    }

    function blocoJson(titulo, objeto) {
        const texto = objeto && Object.keys(objeto).length
            ? JSON.stringify(objeto, null, 2)
            : "Nenhum campo sanitizado disponível para esta operação.";
        return `<div class="audit-drawer-bloco"><h4>${escaparHtml(titulo)}</h4><pre></pre></div>`
            .replace("<pre></pre>", `<pre>${escaparHtml(texto)}</pre>`);
    }

    function blocoAlteracoes(evento) {
        const alteracoes = derivarAlteracoesAuditoria(evento.before, evento.after);
        if (!alteracoes.length) {
            return `<section class="audit-drawer-alteracoes"><h4>Alterações</h4><p class="audit-drawer-aviso">Os snapshots sanitizados não permitem mostrar valores alterados neste evento. Nenhum valor foi inferido.</p></section>`;
        }
        return `<section class="audit-drawer-alteracoes"><h4>Alterações</h4><div>${alteracoes.map((alteracao) => `
            <article>
                <header><strong>${escaparHtml(alteracao.rotulo)}</strong><code>${escaparHtml(alteracao.campo)}</code></header>
                <p><span>${escaparHtml(alteracao.antesFormatado)}</span><b aria-hidden="true">→</b><span>${escaparHtml(alteracao.depoisFormatado)}</span></p>
            </article>`).join("")}</div></section>`;
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
        state.focoAnterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;

        conteudo.innerHTML = `
            <p class="audit-drawer-summary">${escaparHtml(evento.summary || evento.action)}</p>
            <div class="audit-drawer-badges">
                <span>${escaparHtml(rotuloAcaoAuditoria(evento.action))}</span>
                <span>${escaparHtml(rotuloOperacao(evento.operation))}</span>
                <span class="audit-badge-risco" data-risco="${escaparHtml(evento.risk)}">${escaparHtml(rotuloRisco(evento.risk))}</span>
            </div>
            ${linhaChaveValor("Ação técnica", evento.action || "—")}
            ${linhaIdCopiavel("ID do evento", evento.eventId || evento._docId)}
            ${linhaChaveValor("Tipo de ator", rotuloAtor(evento.actorType))}
            ${linhaIdCopiavel("UID do ator", evento.actorUid)}
            ${linhaChaveValor("Horário", formatarDataHora(evento.createdAt))}
            ${linhaChaveValor("Módulo", rotuloModulo(evento.module))}
            ${linhaChaveValor("Tipo de entidade", rotuloEntidadeAuditoria(evento.entityType))}
            ${linhaChaveValor("Entidade técnica", evento.entityType || "—")}
            ${linhaIdCopiavel("ID da entidade", evento.entityId)}
            ${linhaChaveValor("Origem", rotuloOrigem(evento.source))}
            <div class="audit-drawer-campos"><span>Campos alterados</span><div>${(evento.changedFields || []).length
                ? evento.changedFields.map((campo) => `<span class="audit-drawer-campo"><strong>${escaparHtml(rotuloCampoAuditoria(campo))}</strong><code>${escaparHtml(campo)}</code></span>`).join("")
                : "<em>Nenhum campo informado</em>"}</div></div>
            ${blocoAlteracoes(evento)}
            <details class="audit-drawer-json">
                <summary>Ver snapshots técnicos sanitizados</summary>
                <div class="audit-drawer-comparacao">
                    ${blocoJson("Antes (sanitizado)", evento.before)}
                    ${blocoJson("Depois (sanitizado)", evento.after)}
                </div>
            </details>
            <p class="audit-drawer-aviso">As alterações e os blocos técnicos usam somente a versão sanitizada. Campos sensíveis podem ter sido removidos por privacidade; a ausência de valores não significa necessariamente ausência de alteração.</p>
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

    function fecharDrawer({ restaurarFoco = true } = {}) {
        const drawer = byId("audit-drawer");
        if (!drawer) return;
        drawer.classList.add("hidden");
        drawer.setAttribute("aria-hidden", "true");
        state.eventoSelecionadoId = null;
        if (restaurarFoco && state.focoAnterior?.isConnected) state.focoAnterior.focus();
        state.focoAnterior = null;
    }

    // ===== Filtros =====

    function populatePeriodoPersonalizado() {
        const bloco = byId("audit-periodo-personalizado");
        if (bloco) bloco.classList.toggle("hidden", state.filtro.periodo !== "personalizado");
    }

    function atualizarBotoesPeriodo() {
        root.querySelectorAll?.("[data-audit-period]").forEach((botao) => {
            const ativo = botao.getAttribute("data-audit-period") === state.filtro.periodo;
            botao.classList.toggle("is-active", ativo);
            botao.setAttribute("aria-pressed", String(ativo));
        });
    }

    function preencherOpcoesFiltros() {
        const preencher = (id, opcoes) => {
            const select = byId(id);
            if (!select || select.dataset.auditOpcoes === "true") return;
            select.insertAdjacentHTML("beforeend", opcoes
                .map(([valor, rotulo]) => `<option value="${escaparHtml(valor)}">${escaparHtml(rotulo)}</option>`)
                .join(""));
            select.dataset.auditOpcoes = "true";
        };
        preencher("audit-filtro-modulo", Object.keys(MODULO_LABEL).map((chave) => [chave, rotuloModulo(chave)]));
        preencher("audit-filtro-operacao", OPERACOES.map((chave) => [chave, rotuloOperacao(chave)]));
        preencher("audit-filtro-risco", RISCOS.map((chave) => [chave, rotuloRisco(chave)]));
        preencher("audit-filtro-origem", ORIGENS.map((chave) => [chave, rotuloOrigem(chave)]));
    }

    function limparFiltros() {
        state.filtro = criarFiltrosAuditoriaPadrao();
        ["module", "operation", "risk", "source", "actor", "entity", "action", "busca"].forEach((campo) => {
            const id = campo === "source" ? "audit-filtro-origem"
                : campo === "busca" ? "audit-busca"
                    : `audit-filtro-${campo === "module" ? "modulo" : campo === "operation" ? "operacao" : campo === "risk" ? "risco" : campo}`;
            const elemento = byId(id);
            if (elemento) elemento.value = "";
        });
        const dataDe = byId("audit-periodo-de");
        const dataAte = byId("audit-periodo-ate");
        if (dataDe) dataDe.value = "";
        if (dataAte) dataAte.value = "";
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
            const eventos = filtrarEventosPorFiltros(snap.docs.map(docParaEvento), state.filtro);
            const carimbo = new Date().toISOString().slice(0, 10);
            if (formato === "csv") {
                baixarArquivo(`auditoria-${carimbo}.csv`, eventosParaCsv(eventos), "text/csv;charset=utf-8");
            } else {
                baixarArquivo(`auditoria-${carimbo}.json`, eventosParaJson(eventos), "application/json;charset=utf-8");
            }
            notify(`Exportação gerada com ${eventos.length} evento(s) correspondente(s) aos filtros, em uma janela máxima de ${EXPORT_SIZE}.`, "sucesso");
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
                renderFiltrosAtivos();
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
            const camposTexto = {
                "audit-busca": "busca",
                "audit-filtro-ator": "actor",
                "audit-filtro-entidade": "entity",
                "audit-filtro-acao": "action"
            };
            const campo = camposTexto[evento.target.id];
            if (campo) {
                state.filtro[campo] = evento.target.value;
                renderTabela();
            }
        });

        view.addEventListener("change", (evento) => {
            const camposSelect = {
                "audit-filtro-modulo": "module",
                "audit-filtro-operacao": "operation",
                "audit-filtro-risco": "risk",
                "audit-filtro-origem": "source"
            };
            const campo = camposSelect[evento.target.id];
            if (campo) {
                state.filtro[campo] = evento.target.value;
                renderTabela();
            }
        });

        byId("audit-drawer-fechar")?.addEventListener("click", fecharDrawer);
        byId("audit-drawer")?.addEventListener("click", (evento) => {
            if (evento.target.id === "audit-drawer") fecharDrawer();
            const copiar = evento.target.closest("[data-audit-copy]");
            if (copiar) {
                const valor = copiar.getAttribute("data-audit-copy") || "";
                navigator.clipboard?.writeText(valor)
                    .then(() => notify("Identificador copiado.", "sucesso"))
                    .catch(() => notify("Não foi possível copiar o identificador.", "erro"));
                return;
            }
            const abrirEntidade = evento.target.closest("#audit-drawer-abrir-entidade");
            if (abrirEntidade) {
                const targetView = abrirEntidade.getAttribute("data-audit-view");
                fecharDrawer({ restaurarFoco: false });
                document.querySelector(`.nav-item[data-target="${targetView}"]`)?.click();
            }
        });
        document.addEventListener("keydown", (evento) => {
            const drawerAtual = byId("audit-drawer");
            if (evento.key === "Escape" && !drawerAtual?.classList.contains("hidden")) {
                fecharDrawer();
                return;
            }
            if (evento.key === "Tab" && drawerAtual && !drawerAtual.classList.contains("hidden")) {
                const focaveis = Array.from(drawerAtual.querySelectorAll(
                    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), details > summary'
                )).filter((elemento) => elemento.offsetParent !== null);
                if (!focaveis.length) return;
                const primeiro = focaveis[0];
                const ultimo = focaveis[focaveis.length - 1];
                if (evento.shiftKey && document.activeElement === primeiro) {
                    evento.preventDefault();
                    ultimo.focus();
                } else if (!evento.shiftKey && document.activeElement === ultimo) {
                    evento.preventDefault();
                    primeiro.focus();
                }
            }
        });
    }

    async function load({ force = false } = {}) {
        preencherOpcoesFiltros();
        renderFiltrosAtivos();
        if (state.carregado && !force) {
            renderTabela();
            return;
        }
        mostrarEstado("carregando");
        await Promise.all([carregarPagina({ reset: true }), carregarKpisDoDia()]);
    }

    return { load, bindEventos, state };
}
