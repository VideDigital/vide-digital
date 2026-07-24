(function organizarNavegacaoAura() {
    const navegacao = document.getElementById("sidebar-nav");
    const areaGrupos = document.getElementById("sidebar-navigation-groups");
    const campoBusca = document.getElementById("busca-sidebar-modulos");
    const estadoVazio = document.getElementById("sidebar-navigation-empty");

    if (!navegacao || !areaGrupos || !campoBusca) {
        return;
    }

    const configuracaoGrupos = [
        {
            id: "operacao",
            nome: "Operação",
            descricao: "Rotina da loja",
            icone: `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <rect x="3" y="3" width="7" height="7" rx="2"></rect>
                    <rect x="14" y="3" width="7" height="7" rx="2"></rect>
                    <rect x="3" y="14" width="7" height="7" rx="2"></rect>
                    <rect x="14" y="14" width="7" height="7" rx="2"></rect>
                </svg>
            `,
            alvos: [
                "view-dashboard",
                "view-pedidos",
                "view-leads"
            ]
        },
        {
            id: "crescimento",
            nome: "Crescimento",
            descricao: "Marketing e vendas",
            icone: `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="m4 17 5-5 4 4 7-9"></path>
                    <path d="M15 7h5v5"></path>
                </svg>
            `,
            alvos: [
                "view-automacao-leads",
                "view-central-ia",
                "view-base-conhecimento",
                "view-templates",
                "view-campanhas",
                "view-landing-pages",
                "view-metricas"
            ]
        },
        {
            id: "sistema",
            nome: "Sistema",
            descricao: "Estrutura e ajustes",
            icone: `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.06.06-2.12 2.12-.06-.06a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.1 1.65v.11h-3v-.11a1.8 1.8 0 0 0-1.1-1.65 1.8 1.8 0 0 0-1.98.36l-.06.06-2.12-2.12.06-.06A1.8 1.8 0 0 0 6.6 15a1.8 1.8 0 0 0-1.65-1.1H4.5v-3h.45A1.8 1.8 0 0 0 6.6 9.8a1.8 1.8 0 0 0-.36-1.98l-.06-.06 2.12-2.12.06.06a1.8 1.8 0 0 0 1.98.36 1.8 1.8 0 0 0 1.1-1.65V4.3h3v.11a1.8 1.8 0 0 0 1.1 1.65 1.8 1.8 0 0 0 1.98-.36l.06-.06 2.12 2.12-.06.06a1.8 1.8 0 0 0-.36 1.98 1.8 1.8 0 0 0 1.65 1.1h.45v3h-.45A1.8 1.8 0 0 0 19.4 15Z"></path>
                </svg>
            `,
            alvos: [
                "view-perfil",
                "view-dominios",
                "view-notificacoes",
                "view-personalizacao",
                "view-funcionarios"
            ]
        },
        {
            id: "suporte",
            nome: "Suporte",
            descricao: "Ajuda e recursos",
            icone: `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H12v17H7.5A3.5 3.5 0 0 0 4 22V5.5Z"></path>
                    <path d="M20 5.5A3.5 3.5 0 0 0 16.5 2H12v17h4.5A3.5 3.5 0 0 1 20 22V5.5Z"></path>
                </svg>
            `,
            alvos: [
                "view-guia"
            ]
        }
    ];

    const botoesExistentes =
        Array.from(
            areaGrupos.querySelectorAll(
                ":scope > button[data-target]"
            )
        );

    configuracaoGrupos.forEach(function(grupo, indiceGrupo) {
        const containerGrupo = document.createElement("div");

        containerGrupo.className = "aura-sidebar-group";
        containerGrupo.dataset.sidebarGroup = grupo.id;

        containerGrupo.innerHTML = `
            <div class="aura-sidebar-group-header"
                 role="button"
                 tabindex="0"
                 aria-expanded="true">

                <div class="aura-sidebar-group-title">

                    <span class="aura-sidebar-group-icon">
                        ${grupo.icone}
                    </span>

                    <span>

                        <strong>${grupo.nome}</strong>

                        <small>${grupo.descricao}</small>

                    </span>

                </div>

                <span class="aura-sidebar-group-chevron">

                    <svg viewBox="0 0 24 24"
                         fill="none"
                         stroke="currentColor">

                        <path d="m6 9 6 6 6-6"></path>

                    </svg>

                </span>

            </div>

            <div class="aura-sidebar-group-content"></div>
        `;

        const conteudoGrupo =
            containerGrupo.querySelector(
                ".aura-sidebar-group-content"
            );

        grupo.alvos.forEach(function(alvo) {
            const botao =
                botoesExistentes.find(function(item) {
                    return item.getAttribute("data-target") === alvo;
                });

            if (botao) {
                conteudoGrupo.appendChild(botao);
            }
        });

        if (conteudoGrupo.children.length > 0) {
            areaGrupos.appendChild(containerGrupo);
        }

        const cabecalho =
            containerGrupo.querySelector(
                ".aura-sidebar-group-header"
            );

        function alternarGrupo() {
            const recolhido =
                containerGrupo.classList.toggle(
                    "aura-sidebar-group-collapsed"
                );

            cabecalho.setAttribute(
                "aria-expanded",
                String(!recolhido)
            );

            try {
                localStorage.setItem(
                    "sidebarGrupo_" + grupo.id,
                    recolhido ? "fechado" : "aberto"
                );
            } catch (erro) {}
        }

        cabecalho.addEventListener("click", alternarGrupo);

        cabecalho.addEventListener("keydown", function(evento) {
            if (
                evento.key === "Enter" ||
                evento.key === " "
            ) {
                evento.preventDefault();
                alternarGrupo();
            }
        });

        try {
            const estadoSalvo =
                localStorage.getItem(
                    "sidebarGrupo_" + grupo.id
                );

            if (estadoSalvo === "fechado" && indiceGrupo !== 0) {
                containerGrupo.classList.add(
                    "aura-sidebar-group-collapsed"
                );

                cabecalho.setAttribute(
                    "aria-expanded",
                    "false"
                );
            }
        } catch (erro) {}
    });

    botoesExistentes.forEach(function(botao) {
        if (!botao.parentElement.classList.contains(
            "aura-sidebar-group-content"
        )) {
            const primeiroGrupo =
                areaGrupos.querySelector(
                    ".aura-sidebar-group-content"
                );

            if (primeiroGrupo) {
                primeiroGrupo.appendChild(botao);
            }
        }
    });

    function normalizarTexto(texto) {
        return (texto || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim();
    }

    function aplicarBusca() {
        const termo =
            normalizarTexto(campoBusca.textContent);

        let quantidadeVisivel = 0;

        areaGrupos
            .querySelectorAll(".aura-sidebar-group")
            .forEach(function(grupo) {
                let visiveisNoGrupo = 0;

                grupo
                    .querySelectorAll(
                        ".aura-sidebar-group-content > button[data-target]"
                    )
                    .forEach(function(botao) {
                        const nomeBotao =
                            normalizarTexto(botao.textContent);

                        const alvoBotao =
                            normalizarTexto(
                                botao.getAttribute("data-target")
                            );

                        const encontrado =
                            !botao.classList.contains("hidden") &&
                            (
                                termo === "" ||
                                nomeBotao.includes(termo) ||
                                alvoBotao.includes(termo)
                            );

                        botao.classList.toggle(
                            "aura-sidebar-search-hidden",
                            !encontrado
                        );

                        if (encontrado) {
                            visiveisNoGrupo++;
                            quantidadeVisivel++;
                        }
                    });

                grupo.classList.toggle(
                    "aura-sidebar-search-group-hidden",
                    visiveisNoGrupo === 0
                );

                if (termo !== "" && visiveisNoGrupo > 0) {
                    grupo.classList.remove(
                        "aura-sidebar-group-collapsed"
                    );

                    grupo
                        .querySelector(
                            ".aura-sidebar-group-header"
                        )
                        ?.setAttribute(
                            "aria-expanded",
                            "true"
                        );
                }
            });

        if (estadoVazio) {
            estadoVazio.classList.toggle(
                "hidden",
                quantidadeVisivel > 0
            );
        }
    }

    function limparBuscaSidebar() {
        campoBusca.textContent = "";
        aplicarBusca();
    }

    window.atualizarBuscaSidebarModulos = aplicarBusca;

    campoBusca.addEventListener("input", aplicarBusca);

    document.addEventListener("keydown", function(evento) {
        const teclaBusca =
            String(evento?.key || "").toLowerCase() === "k";

        if (
            teclaBusca &&
            (evento.ctrlKey || evento.metaKey)
        ) {
            evento.preventDefault();

            if (
                window.innerWidth < 768 &&
                navegacao.classList.contains("hidden")
            ) {
                document
                    .getElementById("mobile-menu-toggle")
                    ?.click();
            }

            setTimeout(function() {
                campoBusca.focus();

                const selecao =
                    window.getSelection();

                const intervalo =
                    document.createRange();

                intervalo.selectNodeContents(campoBusca);

                selecao.removeAllRanges();
                selecao.addRange(intervalo);
            }, 80);
        }

        if (
            evento.key === "Escape" &&
            document.activeElement === campoBusca
        ) {
            limparBuscaSidebar();
            campoBusca.blur();
        }
    });

    limparBuscaSidebar();

    window.addEventListener("pageshow", function() {
        setTimeout(limparBuscaSidebar, 100);
    });
})();
/*
 * Central de Comandos Vide Hub
 * Camada independente: não altera largura, posição ou estrutura visual da sidebar.
 */
(function iniciarCentralComandosVideHub() {
    "use strict";

    function iniciar() {
        if (document.getElementById("vide-k-command-center")) return;

        const areaGrupos = document.getElementById("sidebar-navigation-groups");
        if (!areaGrupos) return;

        let itensDisponiveis = [];
        let itensFiltrados = [];
        let indiceSelecionado = 0;
        let focoAnterior = null;
        let overflowAnterior = "";

        function normalizarTexto(texto) {
            return String(texto || "")
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase()
                .trim();
        }

        function obterNomeBotao(botao) {
            const clone = botao.cloneNode(true);

            clone
                .querySelectorAll(
                    "svg, kbd, .badge, .plan-badge, [data-badge], [aria-hidden='true']"
                )
                .forEach(function(elemento) {
                    elemento.remove();
                });

            let nome = clone.textContent.replace(/\s+/g, " ").trim();

            if (!nome) {
                nome = String(botao.getAttribute("aria-label") || "")
                    .replace(/^abrir\s+/i, "")
                    .trim();
            }

            return nome || "Módulo";
        }

        function botaoEstaDisponivel(botao) {
            if (!botao || botao.hidden) return false;
            if (botao.classList.contains("hidden")) return false;
            if (botao.getAttribute("aria-hidden") === "true") return false;
            if (botao.disabled) return false;
            return true;
        }

        function coletarItensDisponiveis() {
            const botoes = Array.from(
                areaGrupos.querySelectorAll("button[data-target]")
            );

            itensDisponiveis = botoes
                .filter(botaoEstaDisponivel)
                .map(function(botao, ordem) {
                    const grupo = botao.closest(".aura-sidebar-group");
                    const nomeGrupo =
                        grupo
                            ?.querySelector(".aura-sidebar-group-title strong")
                            ?.textContent
                            ?.trim() || "Outros";

                    const descricaoGrupo =
                        grupo
                            ?.querySelector(".aura-sidebar-group-title small")
                            ?.textContent
                            ?.trim() || "Recursos do painel";

                    const svg = botao.querySelector("svg");

                    return {
                        botao: botao,
                        nome: obterNomeBotao(botao),
                        grupo: nomeGrupo,
                        descricaoGrupo: descricaoGrupo,
                        alvo: String(botao.getAttribute("data-target") || ""),
                        icone: svg ? svg.outerHTML : "",
                        ordem: ordem
                    };
                });

            return itensDisponiveis;
        }

        const estilo = document.createElement("style");
        estilo.id = "vide-k-command-style";
        estilo.textContent = `
            #vide-k-command-center[hidden] {
                display: none !important;
            }

            #vide-k-command-center {
                position: fixed;
                inset: 0;
                z-index: 260;
                display: flex;
                align-items: flex-start;
                justify-content: center;
                padding: clamp(24px, 9vh, 88px) 20px 24px;
                background: rgba(1, 5, 16, .78);
                backdrop-filter: blur(18px);
                -webkit-backdrop-filter: blur(18px);
                animation: videKBackdropIn .16s ease-out;
            }

            .vide-k-command-panel {
                width: min(860px, 100%);
                max-height: min(760px, calc(100vh - 48px));
                display: flex;
                flex-direction: column;
                overflow: hidden;
                border: 1px solid rgba(148, 163, 184, .22);
                border-radius: 28px;
                color: #e5edf9;
                background:
                    radial-gradient(
                        760px 300px at 12% -8%,
                        rgba(91, 140, 255, .17),
                        transparent 70%
                    ),
                    linear-gradient(
                        145deg,
                        rgba(17, 24, 39, .985),
                        rgba(3, 7, 18, .99)
                    );
                box-shadow:
                    0 38px 110px rgba(0, 0, 0, .62),
                    inset 0 1px 0 rgba(255, 255, 255, .045);
                animation: videKPanelIn .18s ease-out;
            }

            .vide-k-command-header {
                padding: 22px 24px 18px;
                border-bottom: 1px solid rgba(255, 255, 255, .075);
            }

            .vide-k-command-title-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 18px;
                margin-bottom: 16px;
            }

            .vide-k-command-heading {
                min-width: 0;
            }

            .vide-k-command-heading strong {
                display: block;
                color: #fff;
                font-size: 18px;
                line-height: 1.2;
                font-weight: 900;
                letter-spacing: -.025em;
            }

            .vide-k-command-heading small {
                display: block;
                margin-top: 5px;
                color: #8190a9;
                font-size: 11px;
                line-height: 1.45;
            }

            .vide-k-command-close {
                width: 40px;
                height: 40px;
                flex: 0 0 40px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                border: 1px solid rgba(255, 255, 255, .1);
                border-radius: 13px;
                color: #9eabc0;
                background: rgba(255, 255, 255, .045);
                cursor: pointer;
                transition:
                    color .16s ease,
                    border-color .16s ease,
                    background .16s ease;
            }

            .vide-k-command-close:hover,
            .vide-k-command-close:focus-visible {
                color: #fff;
                border-color: rgba(255, 255, 255, .2);
                background: rgba(255, 255, 255, .085);
                outline: none;
            }

            .vide-k-command-close svg {
                width: 18px;
                height: 18px;
                stroke-width: 2;
            }

            .vide-k-command-search-shell {
                min-height: 58px;
                display: flex;
                align-items: center;
                gap: 13px;
                padding: 0 16px;
                border: 1px solid rgba(148, 163, 184, .2);
                border-radius: 17px;
                background: rgba(255, 255, 255, .05);
                box-shadow: inset 0 1px 0 rgba(255, 255, 255, .025);
                transition:
                    border-color .16s ease,
                    background .16s ease,
                    box-shadow .16s ease;
            }

            .vide-k-command-search-shell:focus-within {
                border-color: rgba(91, 140, 255, .62);
                background: rgba(91, 140, 255, .075);
                box-shadow:
                    0 0 0 4px rgba(91, 140, 255, .1),
                    inset 0 1px 0 rgba(255, 255, 255, .035);
            }

            .vide-k-command-search-icon {
                width: 21px;
                height: 21px;
                flex: 0 0 21px;
                color: #8290a7;
            }

            #vide-k-command-input {
                width: 100%;
                min-width: 0;
                border: 0;
                outline: 0;
                color: #f8fafc;
                background: transparent;
                font: inherit;
                font-size: 15px;
                font-weight: 650;
            }

            #vide-k-command-input::placeholder {
                color: #6f7d93;
            }

            .vide-k-command-shortcut {
                flex: 0 0 auto;
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 5px 8px;
                border: 1px solid rgba(255, 255, 255, .1);
                border-radius: 9px;
                color: #8190a7;
                background: rgba(0, 0, 0, .18);
                font-size: 10px;
                font-weight: 800;
                white-space: nowrap;
            }

            .vide-k-command-body {
                flex: 1;
                min-height: 0;
                overflow-y: auto;
                padding: 14px 14px 18px;
                scrollbar-width: thin;
                scrollbar-color: rgba(148, 163, 184, .3) transparent;
            }

            .vide-k-command-body::-webkit-scrollbar {
                width: 8px;
            }

            .vide-k-command-body::-webkit-scrollbar-thumb {
                border: 2px solid transparent;
                border-radius: 999px;
                background: rgba(148, 163, 184, .28);
                background-clip: padding-box;
            }

            .vide-k-command-group + .vide-k-command-group {
                margin-top: 16px;
            }

            .vide-k-command-group-header {
                display: flex;
                align-items: flex-end;
                justify-content: space-between;
                gap: 12px;
                padding: 4px 10px 8px;
            }

            .vide-k-command-group-header strong {
                display: block;
                color: #aab6ca;
                font-size: 10px;
                line-height: 1.2;
                font-weight: 900;
                letter-spacing: .13em;
                text-transform: uppercase;
            }

            .vide-k-command-group-header small {
                display: block;
                margin-top: 3px;
                color: #5f6d83;
                font-size: 9px;
            }

            .vide-k-command-group-count {
                color: #65738a;
                font-size: 9px;
                font-weight: 800;
            }

            .vide-k-command-items {
                display: grid;
                gap: 6px;
            }

            .vide-k-command-item {
                width: 100%;
                min-height: 62px;
                display: grid;
                grid-template-columns: 42px minmax(0, 1fr) auto;
                align-items: center;
                gap: 12px;
                padding: 9px 12px;
                border: 1px solid transparent;
                border-radius: 16px;
                color: #aeb9cb;
                background: transparent;
                text-align: left;
                cursor: pointer;
                transition:
                    border-color .14s ease,
                    color .14s ease,
                    background .14s ease,
                    transform .14s ease;
            }

            .vide-k-command-item:hover,
            .vide-k-command-item[data-active="true"] {
                color: #fff;
                border-color: rgba(91, 140, 255, .27);
                background:
                    linear-gradient(
                        90deg,
                        rgba(91, 140, 255, .14),
                        rgba(255, 255, 255, .045)
                    );
            }

            .vide-k-command-item:focus-visible {
                outline: 2px solid rgba(91, 140, 255, .72);
                outline-offset: 1px;
            }

            .vide-k-command-item[data-active="true"] {
                transform: translateX(2px);
            }

            .vide-k-command-item-icon {
                width: 42px;
                height: 42px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                border: 1px solid rgba(255, 255, 255, .09);
                border-radius: 13px;
                color: #8eb0ff;
                background: rgba(91, 140, 255, .09);
            }

            .vide-k-command-item-icon svg {
                width: 19px;
                height: 19px;
                fill: none;
                stroke: currentColor;
                stroke-width: 2;
                stroke-linecap: round;
                stroke-linejoin: round;
            }

            .vide-k-command-item-copy {
                min-width: 0;
            }

            .vide-k-command-item-copy strong {
                display: block;
                overflow: hidden;
                color: inherit;
                font-size: 12px;
                line-height: 1.35;
                font-weight: 850;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .vide-k-command-item-copy small {
                display: block;
                overflow: hidden;
                margin-top: 3px;
                color: #6f7e95;
                font-size: 10px;
                line-height: 1.35;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .vide-k-command-enter {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                color: #65738a;
                font-size: 9px;
                font-weight: 800;
                white-space: nowrap;
            }

            .vide-k-command-enter kbd {
                padding: 4px 7px;
                border: 1px solid rgba(255, 255, 255, .1);
                border-radius: 7px;
                color: #93a2b9;
                background: rgba(0, 0, 0, .2);
                font: inherit;
            }

            .vide-k-command-empty {
                padding: 56px 24px;
                color: #77859c;
                text-align: center;
            }

            .vide-k-command-empty-icon {
                width: 52px;
                height: 52px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                margin-bottom: 13px;
                border: 1px solid rgba(255, 255, 255, .08);
                border-radius: 17px;
                color: #71809a;
                background: rgba(255, 255, 255, .035);
            }

            .vide-k-command-empty-icon svg {
                width: 22px;
                height: 22px;
                fill: none;
                stroke: currentColor;
                stroke-width: 2;
            }

            .vide-k-command-empty strong {
                display: block;
                color: #c4cfdf;
                font-size: 13px;
            }

            .vide-k-command-empty small {
                display: block;
                margin-top: 5px;
                font-size: 10px;
            }

            .vide-k-command-footer {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 16px;
                padding: 12px 20px;
                border-top: 1px solid rgba(255, 255, 255, .075);
                color: #65738a;
                background: rgba(0, 0, 0, .12);
                font-size: 9px;
                font-weight: 750;
            }

            .vide-k-command-footer-hints {
                display: flex;
                align-items: center;
                flex-wrap: wrap;
                gap: 11px;
            }

            .vide-k-command-footer span {
                display: inline-flex;
                align-items: center;
                gap: 5px;
            }

            .vide-k-command-footer kbd {
                padding: 3px 6px;
                border: 1px solid rgba(255, 255, 255, .09);
                border-radius: 6px;
                color: #8997ad;
                background: rgba(255, 255, 255, .035);
                font: inherit;
            }

            @keyframes videKBackdropIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }

            @keyframes videKPanelIn {
                from {
                    opacity: 0;
                    transform: translateY(-9px) scale(.985);
                }
                to {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
            }

            @media (max-width: 640px) {
                #vide-k-command-center {
                    align-items: stretch;
                    padding: 12px;
                }

                .vide-k-command-panel {
                    width: 100%;
                    max-height: none;
                    height: calc(100dvh - 24px);
                    border-radius: 23px;
                }

                .vide-k-command-header {
                    padding: 18px 16px 15px;
                }

                .vide-k-command-title-row {
                    margin-bottom: 13px;
                }

                .vide-k-command-heading strong {
                    font-size: 16px;
                }

                .vide-k-command-search-shell {
                    min-height: 54px;
                }

                .vide-k-command-shortcut,
                .vide-k-command-enter span {
                    display: none;
                }

                .vide-k-command-body {
                    padding: 10px 9px 14px;
                }

                .vide-k-command-item {
                    grid-template-columns: 40px minmax(0, 1fr) auto;
                    min-height: 60px;
                    padding: 9px 10px;
                }

                .vide-k-command-item-icon {
                    width: 40px;
                    height: 40px;
                }

                .vide-k-command-footer {
                    padding: 11px 14px;
                }

                .vide-k-command-footer > span:last-child {
                    display: none;
                }
            }

            @media (prefers-reduced-motion: reduce) {
                #vide-k-command-center,
                .vide-k-command-panel,
                .vide-k-command-item {
                    animation: none !important;
                    transition: none !important;
                }
            }
        `;
        document.head.appendChild(estilo);

        const central = document.createElement("div");
        central.id = "vide-k-command-center";
        central.hidden = true;
        central.innerHTML = `
            <div
                class="vide-k-command-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="vide-k-command-title"
                aria-describedby="vide-k-command-description"
            >
                <div class="vide-k-command-header">
                    <div class="vide-k-command-title-row">
                        <div class="vide-k-command-heading">
                            <strong id="vide-k-command-title">Central de Comandos</strong>
                            <small id="vide-k-command-description">
                                Encontre e abra rapidamente qualquer módulo disponível no seu painel.
                            </small>
                        </div>

                        <button
                            type="button"
                            class="vide-k-command-close"
                            id="vide-k-command-close"
                            aria-label="Fechar Central de Comandos"
                            title="Fechar"
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <path d="M18 6 6 18"></path>
                                <path d="m6 6 12 12"></path>
                            </svg>
                        </button>
                    </div>

                    <div class="vide-k-command-search-shell">
                        <svg
                            class="vide-k-command-search-icon"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            aria-hidden="true"
                        >
                            <circle cx="11" cy="11" r="7"></circle>
                            <path d="m20 20-3.7-3.7"></path>
                        </svg>

                        <input
                            type="search"
                            id="vide-k-command-input"
                            placeholder="Pesquisar módulos, ações ou configurações..."
                            autocomplete="off"
                            spellcheck="false"
                            aria-label="Pesquisar na Central de Comandos"
                            aria-controls="vide-k-command-results"
                            aria-autocomplete="list"
                        >

                        <span class="vide-k-command-shortcut" aria-hidden="true">
                            Ctrl K
                        </span>
                    </div>
                </div>

                <div
                    class="vide-k-command-body"
                    id="vide-k-command-results"
                    role="listbox"
                    aria-label="Módulos disponíveis"
                ></div>

                <div class="vide-k-command-footer">
                    <div class="vide-k-command-footer-hints">
                        <span><kbd>↑</kbd><kbd>↓</kbd> Navegar</span>
                        <span><kbd>Enter</kbd> Abrir</span>
                        <span><kbd>Esc</kbd> Fechar</span>
                    </div>

                    <span id="vide-k-command-total">0 módulos disponíveis</span>
                </div>
            </div>
        `;
        document.body.appendChild(central);

        const painel = central.querySelector(".vide-k-command-panel");
        const campo = central.querySelector("#vide-k-command-input");
        const resultados = central.querySelector("#vide-k-command-results");
        const botaoFechar = central.querySelector("#vide-k-command-close");
        const total = central.querySelector("#vide-k-command-total");

        function centralEstaAberta() {
            return !central.hidden;
        }

        function atualizarSelecao(rolar) {
            const botoes = Array.from(
                resultados.querySelectorAll(".vide-k-command-item")
            );

            if (botoes.length === 0) {
                campo.removeAttribute("aria-activedescendant");
                return;
            }

            indiceSelecionado = Math.max(
                0,
                Math.min(indiceSelecionado, botoes.length - 1)
            );

            botoes.forEach(function(botao, indice) {
                const ativo = indice === indiceSelecionado;
                botao.dataset.active = String(ativo);
                botao.setAttribute("aria-selected", String(ativo));

                if (ativo) {
                    campo.setAttribute(
                        "aria-activedescendant",
                        botao.id
                    );

                    if (rolar) {
                        botao.scrollIntoView({
                            block: "nearest"
                        });
                    }
                }
            });
        }

        function abrirItem(item) {
            if (!item || !item.botao || !botaoEstaDisponivel(item.botao)) {
                return;
            }

            fecharCentral();

            window.requestAnimationFrame(function() {
                item.botao.click();
            });
        }

        function renderizarResultados() {
            resultados.replaceChildren();

            const termo = normalizarTexto(campo.value);

            itensFiltrados = itensDisponiveis.filter(function(item) {
                const conteudo = normalizarTexto(
                    [
                        item.nome,
                        item.grupo,
                        item.descricaoGrupo,
                        item.alvo
                    ].join(" ")
                );

                return termo === "" || conteudo.includes(termo);
            });

            indiceSelecionado = 0;

            total.textContent =
                itensDisponiveis.length +
                (itensDisponiveis.length === 1
                    ? " módulo disponível"
                    : " módulos disponíveis");

            if (itensFiltrados.length === 0) {
                const vazio = document.createElement("div");
                vazio.className = "vide-k-command-empty";
                vazio.innerHTML = `
                    <span class="vide-k-command-empty-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24">
                            <circle cx="11" cy="11" r="7"></circle>
                            <path d="m20 20-3.7-3.7"></path>
                        </svg>
                    </span>
                    <strong>Nenhum módulo encontrado</strong>
                    <small>Tente pesquisar usando outro nome ou recurso.</small>
                `;
                resultados.appendChild(vazio);
                campo.removeAttribute("aria-activedescendant");
                return;
            }

            const grupos = new Map();

            itensFiltrados.forEach(function(item) {
                if (!grupos.has(item.grupo)) {
                    grupos.set(item.grupo, {
                        descricao: item.descricaoGrupo,
                        itens: []
                    });
                }

                grupos.get(item.grupo).itens.push(item);
            });

            let indiceGlobal = 0;

            grupos.forEach(function(dadosGrupo, nomeGrupo) {
                const secao = document.createElement("section");
                secao.className = "vide-k-command-group";

                const cabecalho = document.createElement("div");
                cabecalho.className = "vide-k-command-group-header";

                const copiaCabecalho = document.createElement("div");
                const tituloGrupo = document.createElement("strong");
                const descricaoGrupo = document.createElement("small");
                const quantidade = document.createElement("span");

                tituloGrupo.textContent = nomeGrupo;
                descricaoGrupo.textContent = dadosGrupo.descricao;
                quantidade.className = "vide-k-command-group-count";
                quantidade.textContent =
                    dadosGrupo.itens.length +
                    (dadosGrupo.itens.length === 1 ? " item" : " itens");

                copiaCabecalho.append(tituloGrupo, descricaoGrupo);
                cabecalho.append(copiaCabecalho, quantidade);

                const lista = document.createElement("div");
                lista.className = "vide-k-command-items";

                dadosGrupo.itens.forEach(function(item) {
                    const indiceAtual = indiceGlobal;
                    const botao = document.createElement("button");
                    botao.type = "button";
                    botao.id = "vide-k-command-option-" + indiceAtual;
                    botao.className = "vide-k-command-item";
                    botao.setAttribute("role", "option");
                    botao.setAttribute("aria-selected", "false");
                    botao.dataset.index = String(indiceAtual);

                    const icone = document.createElement("span");
                    icone.className = "vide-k-command-item-icon";
                    icone.setAttribute("aria-hidden", "true");

                    if (item.icone) {
                        icone.innerHTML = item.icone;
                    } else {
                        icone.innerHTML = `
                            <svg viewBox="0 0 24 24">
                                <rect x="4" y="4" width="16" height="16" rx="4"></rect>
                            </svg>
                        `;
                    }

                    const copia = document.createElement("span");
                    copia.className = "vide-k-command-item-copy";

                    const nome = document.createElement("strong");
                    nome.textContent = item.nome;

                    const descricao = document.createElement("small");
                    descricao.textContent =
                        "Abrir em " + item.grupo;

                    copia.append(nome, descricao);

                    const acao = document.createElement("span");
                    acao.className = "vide-k-command-enter";
                    acao.innerHTML = "<span>Abrir</span><kbd>↵</kbd>";

                    botao.append(icone, copia, acao);

                    botao.addEventListener("mouseenter", function() {
                        indiceSelecionado = indiceAtual;
                        atualizarSelecao(false);
                    });

                    botao.addEventListener("focus", function() {
                        indiceSelecionado = indiceAtual;
                        atualizarSelecao(false);
                    });

                    botao.addEventListener("click", function() {
                        abrirItem(item);
                    });

                    lista.appendChild(botao);
                    indiceGlobal++;
                });

                secao.append(cabecalho, lista);
                resultados.appendChild(secao);
            });

            atualizarSelecao(false);
        }

        function abrirCentral() {
            focoAnterior =
                document.activeElement instanceof HTMLElement
                    ? document.activeElement
                    : null;

            coletarItensDisponiveis();
            campo.value = "";
            renderizarResultados();

            overflowAnterior = document.body.style.overflow;
            document.body.style.overflow = "hidden";

            central.hidden = false;

            window.requestAnimationFrame(function() {
                campo.focus();
                campo.select();
            });
        }

        function fecharCentral() {
            if (!centralEstaAberta()) return;

            central.hidden = true;
            document.body.style.overflow = overflowAnterior;
            campo.value = "";
            itensFiltrados = [];
            indiceSelecionado = 0;
            campo.removeAttribute("aria-activedescendant");

            if (focoAnterior && document.contains(focoAnterior)) {
                focoAnterior.focus();
            }
        }

        function moverSelecao(direcao) {
            if (itensFiltrados.length === 0) return;

            indiceSelecionado =
                (indiceSelecionado + direcao + itensFiltrados.length) %
                itensFiltrados.length;

            atualizarSelecao(true);
        }

        campo.addEventListener("input", renderizarResultados);

        campo.addEventListener("keydown", function(evento) {
            if (evento.key === "ArrowDown") {
                evento.preventDefault();
                moverSelecao(1);
                return;
            }

            if (evento.key === "ArrowUp") {
                evento.preventDefault();
                moverSelecao(-1);
                return;
            }

            if (evento.key === "Home") {
                evento.preventDefault();
                indiceSelecionado = 0;
                atualizarSelecao(true);
                return;
            }

            if (evento.key === "End") {
                evento.preventDefault();
                indiceSelecionado = Math.max(
                    0,
                    itensFiltrados.length - 1
                );
                atualizarSelecao(true);
                return;
            }

            if (evento.key === "Enter") {
                evento.preventDefault();
                abrirItem(itensFiltrados[indiceSelecionado]);
            }
        });

        botaoFechar.addEventListener("click", fecharCentral);

        central.addEventListener("mousedown", function(evento) {
            if (evento.target === central) {
                fecharCentral();
            }
        });

        painel.addEventListener("keydown", function(evento) {
            if (evento.key !== "Tab") return;

            const focaveis = Array.from(
                painel.querySelectorAll(
                    "button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])"
                )
            ).filter(function(elemento) {
                return !elemento.hidden;
            });

            if (focaveis.length === 0) return;

            const primeiro = focaveis[0];
            const ultimo = focaveis[focaveis.length - 1];

            if (evento.shiftKey && document.activeElement === primeiro) {
                evento.preventDefault();
                ultimo.focus();
            } else if (
                !evento.shiftKey &&
                document.activeElement === ultimo
            ) {
                evento.preventDefault();
                primeiro.focus();
            }
        });

        /*
         * Captura Ctrl/Cmd + K antes do listener antigo da busca lateral.
         * O restante do comportamento original do sidebar permanece intacto.
         */
        document.addEventListener(
            "keydown",
            function(evento) {
                const tecla =
                    String(evento.key || "").toLowerCase();

                if (
                    tecla === "k" &&
                    (evento.ctrlKey || evento.metaKey)
                ) {
                    evento.preventDefault();
                    evento.stopImmediatePropagation();

                    if (centralEstaAberta()) {
                        campo.focus();
                        campo.select();
                    } else {
                        abrirCentral();
                    }

                    return;
                }

                if (
                    centralEstaAberta() &&
                    evento.key === "Escape"
                ) {
                    evento.preventDefault();
                    evento.stopImmediatePropagation();
                    fecharCentral();
                }
            },
            true
        );

        window.abrirCentralComandosVideHub = abrirCentral;
        window.fecharCentralComandosVideHub = fecharCentral;
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", iniciar, {
            once: true
        });
    } else {
        iniciar();
    }
})();
