/* =========================================================
   VIDE HUB — VISÃO GERAL EXECUTIVA V1
   Arquivo independente.
   Não realiza novas consultas ao Firebase.
   ========================================================= */

(function prepararVisaoGeralExecutivaVideHub() {
    "use strict";

    if (
        window.__videVisaoGeralExecutivaV1
    ) {
        return;
    }

    window.__videVisaoGeralExecutivaV1 =
        true;

    var dashboard =
        null;

    var observador =
        null;

    var quadroAgendado =
        0;

    var contextoLoja =
        new URLSearchParams(
            window.location.search
        ).get("masterUID") ||
        "own";

    var CHAVE_IMPLANTACAO =
        "videDashboardImplantacaoRecolhida_" +
        contextoLoja;

    function numeroDoElemento(elemento) {
        var valor =
            String(
                elemento?.textContent ||
                ""
            ).replace(
                /[^\d-]/g,
                ""
            );

        var numero =
            Number(valor);

        return Number.isFinite(numero)
            ? numero
            : 0;
    }

    function definirTexto(
        elemento,
        texto
    ) {
        if (
            elemento &&
            elemento.textContent !== texto
        ) {
            elemento.textContent =
                texto;
        }
    }

    function lerEstadoImplantacao() {
        try {
            var valor =
                localStorage.getItem(
                    CHAVE_IMPLANTACAO
                );

            if (valor === null) {
                return null;
            }

            return valor === "true";
        } catch (erro) {
            return null;
        }
    }

    function salvarEstadoImplantacao(
        recolhido
    ) {
        try {
            localStorage.setItem(
                CHAVE_IMPLANTACAO,
                String(recolhido)
            );
        } catch (erro) {
            /* O botão continua funcionando
               mesmo sem localStorage. */
        }
    }

    function aplicarEstadoImplantacao(
        painel,
        recolhido
    ) {
        if (!painel) {
            return;
        }

        painel.classList.toggle(
            "dashboard-launch-is-collapsed",
            recolhido
        );

        var botao =
            painel.querySelector(
                ".dashboard-launch-toggle"
            );

        if (!botao) {
            return;
        }

        botao.setAttribute(
            "aria-expanded",
            String(!recolhido)
        );

        botao.setAttribute(
            "aria-label",
            recolhido
                ? "Mostrar etapas da implantação"
                : "Recolher etapas da implantação"
        );

        definirTexto(
            botao.querySelector(
                "[data-launch-toggle-label]"
            ),
            recolhido
                ? "Ver etapas"
                : "Recolher"
        );
    }

    function criarBotaoImplantacao(
        painel
    ) {
        var cabecalho =
            painel?.querySelector(
                ".dashboard-launch-header"
            );

        if (!cabecalho) {
            return null;
        }

        var botao =
            cabecalho.querySelector(
                ".dashboard-launch-toggle"
            );

        if (botao) {
            return botao;
        }

        botao =
            document.createElement(
                "button"
            );

        botao.type =
            "button";

        botao.className =
            "dashboard-launch-toggle";

        botao.innerHTML = `
            <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                aria-hidden="true"
            >
                <path d="m6 9 6 6 6-6"></path>
            </svg>

            <span data-launch-toggle-label>
                Recolher
            </span>
        `;

        botao.addEventListener(
            "click",
            function(evento) {
                evento.preventDefault();
                evento.stopPropagation();

                var recolhido =
                    !painel.classList.contains(
                        "dashboard-launch-is-collapsed"
                    );

                aplicarEstadoImplantacao(
                    painel,
                    recolhido
                );

                salvarEstadoImplantacao(
                    recolhido
                );
            }
        );

        cabecalho.appendChild(
            botao
        );

        return botao;
    }

    function prepararImplantacao(
        painel
    ) {
        if (!painel) {
            return;
        }

        painel.classList.add(
            "dashboard-executive-onboarding"
        );

        criarBotaoImplantacao(
            painel
        );

        var percentual =
            numeroDoElemento(
                painel.querySelector(
                    ".dashboard-launch-score strong"
                )
            );

        var estadoSalvo =
            lerEstadoImplantacao();

        var recolhido =
            estadoSalvo === null
                ? percentual >= 100
                : estadoSalvo;

        aplicarEstadoImplantacao(
            painel,
            recolhido
        );
    }

    function prepararCentralHoje(
        painel
    ) {
        if (!painel) {
            return;
        }

        painel.classList.add(
            "dashboard-executive-today"
        );

        var alertas =
            Array.from(
                painel.querySelectorAll(
                    ".dashboard-ops-alert"
                )
            );

        var pendencias =
            alertas
                .filter(
                    function(alerta) {
                        return (
                            !alerta.classList
                                .contains(
                                    "is-success"
                                )
                        );
                    }
                )
                .reduce(
                    function(
                        total,
                        alerta
                    ) {
                        return (
                            total +
                            numeroDoElemento(
                                alerta.querySelector(
                                    "strong"
                                )
                            )
                        );
                    },
                    0
                );

        painel.dataset.pendingCount =
            String(pendencias);

        var titulo =
            painel.querySelector(
                ".dashboard-ops-title"
            );

        definirTexto(
            titulo?.querySelector(
                "small"
            ),
            "Hoje"
        );

        definirTexto(
            titulo?.querySelector(
                "h3"
            ),
            pendencias > 0
                ? "O que precisa da sua atenção"
                : "Sua operação está em dia"
        );

        definirTexto(
            titulo?.querySelector(
                "p"
            ),
            pendencias > 0
                ? (
                    pendencias +
                    " pendência(s) identificada(s) na operação."
                )
                : "Nenhuma ação urgente foi identificada agora."
        );

        var secoes =
            painel.querySelectorAll(
                ".dashboard-ops-grid > " +
                ".dashboard-ops-section"
            );

        var atividade =
            secoes[0];

        var atalhos =
            secoes[1];

        if (atividade) {
            atividade.classList.add(
                "dashboard-executive-activity"
            );

            definirTexto(
                atividade.querySelector(
                    ".dashboard-ops-section-header small"
                ),
                "Atividade"
            );

            definirTexto(
                atividade.querySelector(
                    ".dashboard-ops-section-header h4"
                ),
                "Últimos acontecimentos"
            );
        }

        if (atalhos) {
            atalhos.classList.add(
                "dashboard-executive-shortcuts"
            );

            definirTexto(
                atalhos.querySelector(
                    ".dashboard-ops-section-header small"
                ),
                "Atalhos"
            );

            definirTexto(
                atalhos.querySelector(
                    ".dashboard-ops-section-header h4"
                ),
                "Ações rápidas"
            );
        }
    }

    function prepararResultados() {
        var resumo =
            document.getElementById(
                "resumo-semana-container"
            );

        resumo?.classList.add(
            "dashboard-executive-results"
        );
    }

    function prepararHubSecundario() {
        var hub =
            dashboard?.querySelector(
                '[data-block-id="hub-modulos"]'
            );

        hub?.classList.add(
            "dashboard-executive-hub-secondary"
        );
    }

    function esconderBlocosDuplicados(
        central,
        implantacao
    ) {
        if (central) {
            document
                .getElementById(
                    "alertas-atencao-container"
                )
                ?.classList.add(
                    "dashboard-executive-legacy-hidden"
                );

            document
                .getElementById(
                    "atividade-recente-container"
                )
                ?.classList.add(
                    "dashboard-executive-legacy-hidden"
                );
        }

        if (implantacao) {
            document
                .getElementById(
                    "primeiros-passos-container"
                )
                ?.classList.add(
                    "dashboard-executive-legacy-hidden"
                );
        }
    }

    function posicionarCentralHoje(
        central
    ) {
        if (
            !central ||
            central.dataset
                .executivePositioned ===
                "true"
        ) {
            return;
        }

        var ancora =
            document.getElementById(
                "alertas-atencao-container"
            ) ||
            document.getElementById(
                "primeiros-passos-container"
            ) ||
            document.getElementById(
                "resumo-semana-container"
            ) ||
            dashboard.querySelector(
                '[data-block-id="hub-modulos"]'
            );

        if (
            ancora &&
            central.nextElementSibling !==
                ancora
        ) {
            dashboard.insertBefore(
                central,
                ancora
            );
        }

        central.dataset
            .executivePositioned =
            "true";
    }

    function posicionarImplantacao(
        implantacao
    ) {
        if (
            !implantacao ||
            implantacao.dataset
                .executivePositioned ===
                "true"
        ) {
            return;
        }

        var resumo =
            document.getElementById(
                "resumo-semana-container"
            );

        var central =
            document.getElementById(
                "dashboard-central-operacional"
            );

        if (resumo) {
            resumo.insertAdjacentElement(
                "afterend",
                implantacao
            );
        } else if (central) {
            central.insertAdjacentElement(
                "afterend",
                implantacao
            );
        }

        implantacao.dataset
            .executivePositioned =
            "true";
    }

    function reaplicarLayoutPersonalizado() {
        if (
            typeof window
                .aplicarLayoutSalvoDaAba !==
            "function"
        ) {
            return;
        }

        window.setTimeout(
            function() {
                try {
                    window
                        .aplicarLayoutSalvoDaAba(
                            "view-dashboard"
                        );
                } catch (erro) {
                    console.warn(
                        "[Vide Hub] Não foi possível reaplicar o layout salvo.",
                        erro
                    );
                }
            },
            80
        );
    }

    function organizarVisaoGeral() {
        dashboard =
            document.getElementById(
                "view-dashboard"
            );

        if (!dashboard) {
            return;
        }

        dashboard.classList.add(
            "dashboard-executive-view"
        );

        var central =
            document.getElementById(
                "dashboard-central-operacional"
            );

        var implantacao =
            document.getElementById(
                "dashboard-launch-center"
            );

        var centralAindaNaoPosicionada =
            Boolean(
                central &&
                central.dataset
                    .executivePositioned !==
                    "true"
            );

        var implantacaoAindaNaoPosicionada =
            Boolean(
                implantacao &&
                implantacao.dataset
                    .executivePositioned !==
                    "true"
            );

        posicionarCentralHoje(
            central
        );

        posicionarImplantacao(
            implantacao
        );

        prepararCentralHoje(
            central
        );

        prepararImplantacao(
            implantacao
        );

        prepararResultados();
        prepararHubSecundario();

        esconderBlocosDuplicados(
            central,
            implantacao
        );

        if (
            centralAindaNaoPosicionada ||
            implantacaoAindaNaoPosicionada
        ) {
            reaplicarLayoutPersonalizado();
        }
    }

    function agendarOrganizacao() {
        window.cancelAnimationFrame(
            quadroAgendado
        );

        quadroAgendado =
            window.requestAnimationFrame(
                organizarVisaoGeral
            );
    }

    function iniciar() {
        dashboard =
            document.getElementById(
                "view-dashboard"
            );

        if (!dashboard) {
            return;
        }

        agendarOrganizacao();

        observador =
            new MutationObserver(
                agendarOrganizacao
            );

        observador.observe(
            dashboard,
            {
                childList: true,
                subtree: true
            }
        );

        window.addEventListener(
            "pageshow",
            agendarOrganizacao
        );

        window.addEventListener(
            "resize",
            agendarOrganizacao
        );

        window.setTimeout(
            agendarOrganizacao,
            400
        );

        window.setTimeout(
            agendarOrganizacao,
            1200
        );

        window.setTimeout(
            agendarOrganizacao,
            2400
        );
    }

    if (
        document.readyState ===
        "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            iniciar,
            { once: true }
        );
    } else {
        iniciar();
    }
})();
