/* =========================================================
   VIDE HUB — CONFIGURAÇÕES DA LOJA EXECUTIVAS V1
   Camada visual e de navegação.
   Não realiza consultas nem gravações no Firebase.
   ========================================================= */

(function prepararConfiguracoesExecutivasVideHub() {
    "use strict";

    if (
        window.__videStoreSettingsExecutiveV1
    ) {
        return;
    }

    window.__videStoreSettingsExecutiveV1 =
        true;

    var view = null;
    var painel = null;
    var observerView = null;
    var observerSecoes = null;
    var atualizacaoPendente = 0;
    var alteracoesPendentes = false;

    var AREAS = [
        {
            id: "identidade",
            numero: "01",
            titulo: "Identidade Primária",
            curto: "Identidade",
            descricao:
                "Logo, favicon, nome, endereço e apresentação principal da loja.",
            categoria: "Marca",
            icone:
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 9 4 4h16l1 5"></path><path d="M4 9v11h16V9"></path><path d="M9 20v-6h6v6"></path></svg>'
        },
        {
            id: "banners-config",
            numero: "02",
            titulo: "Banners Promocionais",
            curto: "Banners",
            descricao:
                "Imagens de destaque e galeria rotativa da vitrine pública.",
            categoria: "Conteúdo",
            icone:
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="3"></rect><circle cx="9" cy="9" r="2"></circle><path d="m21 15-5-5L5 21"></path></svg>'
        },
        {
            id: "redes-sociais",
            numero: "03",
            titulo: "Redes Sociais",
            curto: "Redes",
            descricao:
                "WhatsApp principal, Instagram, TikTok e canal do YouTube.",
            categoria: "Conexões",
            icone:
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><path d="m8.6 13.5 6.8 4"></path><path d="m15.4 6.5-6.8 4"></path></svg>'
        },
        {
            id: "links-destaque",
            numero: "04",
            titulo: "Links Personalizados",
            curto: "Links",
            descricao:
                "Botões extras exibidos em destaque para os visitantes.",
            categoria: "Conteúdo",
            icone:
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 17H7A5 5 0 0 1 7 7h2"></path><path d="M15 7h2a5 5 0 0 1 0 10h-2"></path><path d="M8 12h8"></path></svg>'
        },
        {
            id: "carrinho-config",
            numero: "05",
            titulo: "Carrinho de Compras",
            curto: "Carrinho",
            descricao:
                "Compra de vários produtos com finalização pelo WhatsApp.",
            categoria: "Conversão",
            icone:
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="9" cy="20" r="1"></circle><circle cx="19" cy="20" r="1"></circle><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L21 8H7"></path></svg>'
        },
        {
            id: "chat-config",
            numero: "06",
            titulo: "Chat ao Vivo",
            curto: "Chat",
            descricao:
                "Widget de contato e direcionamento para atendimento.",
            categoria: "Conversão",
            icone:
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"></path></svg>'
        },
        {
            id: "layout-vitrine",
            numero: "07",
            titulo: "Layout da Vitrine",
            curto: "Layout",
            descricao:
                "Ordem e visibilidade das seções da loja pública.",
            categoria: "Experiência",
            icone:
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="3"></rect><path d="M9 3v18"></path><path d="M3 9h6"></path></svg>'
        },
        {
            id: "aparencia-cores",
            numero: "08",
            titulo: "Controle de Aparência",
            curto: "Aparência",
            descricao:
                "Temas, cores, tipografia e identidade visual da vitrine.",
            categoria: "Design",
            icone:
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="13.5" cy="6.5" r="1.5"></circle><circle cx="17.5" cy="10.5" r="1.5"></circle><circle cx="6.5" cy="12.5" r="1.5"></circle><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c1 0 1.6-.6 1.6-1.5 0-.5-.2-.9-.5-1.2-.4-.3-.6-.7-.6-1.2 0-.8.7-1.5 1.5-1.5h2c3.3 0 6-2.7 6-6C22 6 17.5 2 12 2Z"></path></svg>'
        },
        {
            id: "links-utm",
            numero: "09",
            titulo: "Links de Rastreamento",
            curto: "Rastreamento",
            descricao:
                "Endereços identificados por origem para anúncios e campanhas.",
            categoria: "Aquisição",
            icone:
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 19V9"></path><path d="M10 19V5"></path><path d="M16 19v-7"></path><path d="M22 19V2"></path></svg>'
        }
    ];

    function normalizar(texto) {
        return String(texto || "")
            .normalize("NFD")
            .replace(
                /[\u0300-\u036f]/g,
                ""
            )
            .toLowerCase()
            .trim();
    }

    function obterElemento(id) {
        return document.getElementById(id);
    }

    function obterValor(id) {
        return String(
            obterElemento(id)?.value ||
            ""
        ).trim();
    }

    function estaMarcado(id) {
        return Boolean(
            obterElemento(id)?.checked
        );
    }

    function telefoneValido(valor) {
        return String(valor || "")
            .replace(/\D/g, "")
            .length >= 10;
    }

    function buscarArea(id) {
        return AREAS.find(
            function(area) {
                return area.id === id;
            }
        );
    }

    function buscarBloco(id) {
        return view?.querySelector(
            '[data-block-id="' +
            id +
            '"]'
        );
    }

    function temBanner() {
        var galeria =
            obterElemento(
                "banners-galeria-preview"
            );

        return Boolean(
            galeria &&
            galeria.children.length > 0
        );
    }

    function temLinkPersonalizado() {
        var link1 =
            Boolean(
                obterValor(
                    "perf-link1-titulo"
                ) &&
                obterValor(
                    "perf-link1-url"
                )
            );

        var link2 =
            Boolean(
                obterValor(
                    "perf-link2-titulo"
                ) &&
                obterValor(
                    "perf-link2-url"
                )
            );

        return link1 || link2;
    }

    function temRedeSocial() {
        return Boolean(
            telefoneValido(
                obterValor(
                    "perf-social-whatsapp-central"
                )
            ) ||
            obterValor(
                "perf-social-instagram"
            ) ||
            obterValor(
                "perf-social-tiktok"
            ) ||
            obterValor(
                "perf-social-youtube"
            )
        );
    }

    function temLayout() {
        var lista =
            obterElemento(
                "lista-layout-loja"
            );

        return Boolean(
            lista &&
            lista.children.length > 0
        );
    }

    function temAparencia() {
        return Boolean(
            obterValor(
                "perf-fonte-vitrine"
            ) &&
            obterValor(
                "perf-cor-fundo"
            ) &&
            obterValor(
                "perf-cor-destaque"
            )
        );
    }

    function temRastreamento() {
        var box =
            obterElemento(
                "box-links-utm"
            );

        if (!box) {
            return false;
        }

        var texto =
            normalizar(
                box.textContent
            );

        return Boolean(
            obterValor("perf-slug") &&
            !texto.includes(
                "salve seu slug"
            ) &&
            (
                box.querySelector(
                    "a, input, button"
                ) ||
                texto.includes(
                    "utm"
                )
            )
        );
    }

    function identidadeCompleta() {
        return Boolean(
            obterValor(
                "perf-nome-loja"
            ) &&
            obterValor(
                "perf-slug"
            ) &&
            obterValor(
                "perf-titulo"
            ) &&
            obterValor(
                "perf-subtitulo"
            )
        );
    }

    function statusDaArea(id) {
        if (id === "identidade") {
            return {
                pronto:
                    identidadeCompleta(),
                rotulo:
                    identidadeCompleta()
                        ? "Completo"
                        : "Pendente"
            };
        }

        if (id === "banners-config") {
            return {
                pronto: temBanner(),
                rotulo:
                    temBanner()
                        ? "Configurado"
                        : "Opcional"
            };
        }

        if (id === "redes-sociais") {
            return {
                pronto: temRedeSocial(),
                rotulo:
                    temRedeSocial()
                        ? "Conectado"
                        : "Pendente"
            };
        }

        if (id === "links-destaque") {
            return {
                pronto:
                    temLinkPersonalizado(),
                rotulo:
                    temLinkPersonalizado()
                        ? "Configurado"
                        : "Opcional"
            };
        }

        if (id === "carrinho-config") {
            return {
                pronto:
                    estaMarcado(
                        "perf-carrinho-ativo"
                    ),
                rotulo:
                    estaMarcado(
                        "perf-carrinho-ativo"
                    )
                        ? "Ativo"
                        : "Desativado"
            };
        }

        if (id === "chat-config") {
            var chatAtivo =
                estaMarcado(
                    "perf-chat-ativo"
                );

            var chatPronto =
                chatAtivo &&
                telefoneValido(
                    obterValor(
                        "perf-social-whatsapp-chat"
                    )
                );

            return {
                pronto: chatPronto,
                rotulo:
                    chatPronto
                        ? "Ativo"
                        : (
                            chatAtivo
                                ? "Revisar número"
                                : "Desativado"
                        )
            };
        }

        if (id === "layout-vitrine") {
            return {
                pronto: temLayout(),
                rotulo:
                    temLayout()
                        ? "Organizado"
                        : "Carregando"
            };
        }

        if (id === "aparencia-cores") {
            return {
                pronto:
                    temAparencia(),
                rotulo:
                    temAparencia()
                        ? "Configurado"
                        : "Pendente"
            };
        }

        if (id === "links-utm") {
            return {
                pronto:
                    temRastreamento(),
                rotulo:
                    temRastreamento()
                        ? "Disponível"
                        : "Aguardando slug"
            };
        }

        return {
            pronto: false,
            rotulo: "Pendente"
        };
    }

    function calcularProgresso() {
        var etapas = [
            identidadeCompleta(),
            telefoneValido(
                obterValor(
                    "perf-social-whatsapp-central"
                )
            ),
            temAparencia(),
            temLayout()
        ];

        var concluidas =
            etapas.filter(Boolean).length;

        return {
            concluidas: concluidas,
            total: etapas.length,
            percentual:
                Math.round(
                    concluidas /
                    etapas.length *
                    100
                )
        };
    }

    function criarPainel() {
        var cabecalho =
            view.querySelector(
                ".aura-store-settings-header"
            );

        if (!cabecalho) {
            return null;
        }

        painel =
            obterElemento(
                "store-settings-command-v1"
            );

        if (painel) {
            return painel;
        }

        painel =
            document.createElement(
                "section"
            );

        painel.id =
            "store-settings-command-v1";

        painel.className =
            "store-settings-command";

        painel.setAttribute(
            "aria-label",
            "Navegação das configurações da loja"
        );

        painel.innerHTML = `
            <div class="store-settings-command-header">
                <div class="store-settings-command-heading">
                    <span class="store-settings-command-symbol">
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            aria-hidden="true"
                        >
                            <path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z"></path>
                            <path d="m4 7 8 4 8-4"></path>
                            <path d="M12 11v10"></path>
                        </svg>
                    </span>

                    <div>
                        <small>Painel de configuração</small>
                        <h2>Organize sua vitrine por etapas</h2>
                        <p>
                            Localize uma configuração, acompanhe o progresso e abra somente a área necessária.
                        </p>
                    </div>
                </div>

                <div class="store-settings-command-score">
                    <div
                        class="store-settings-command-score-ring"
                        id="store-settings-score-ring"
                    >
                        <strong id="store-settings-score-value">0%</strong>
                    </div>

                    <div>
                        <small>Preparação essencial</small>
                        <strong id="store-settings-score-label">
                            Verificando configurações
                        </strong>
                        <span id="store-settings-score-detail">
                            0 de 4 etapas concluídas
                        </span>
                    </div>
                </div>
            </div>

            <div class="store-settings-command-toolbar">
                <label class="store-settings-command-search">
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        aria-hidden="true"
                    >
                        <circle cx="11" cy="11" r="7"></circle>
                        <path d="m20 20-3.5-3.5"></path>
                    </svg>

                    <input
                        type="search"
                        id="store-settings-search"
                        placeholder="Pesquisar configuração..."
                        autocomplete="off"
                    >

                    <kbd>9 áreas</kbd>
                </label>

                <div class="store-settings-command-actions">
                    <span
                        class="store-settings-change-status"
                        id="store-settings-change-status"
                    >
                        Tudo sincronizado
                    </span>

                    <button
                        type="button"
                        id="store-settings-save-proxy"
                        class="store-settings-save-proxy"
                    >
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            aria-hidden="true"
                        >
                            <path d="M5 4h12l2 2v14H5V4Z"></path>
                            <path d="M8 4v6h8V4"></path>
                            <path d="M9 20v-6h6v6"></path>
                        </svg>

                        Salvar alterações
                    </button>
                </div>
            </div>

            <div
                class="store-settings-command-steps"
                id="store-settings-command-steps"
                role="navigation"
                aria-label="Áreas das configurações"
            ></div>

            <div
                class="store-settings-search-empty hidden"
                id="store-settings-search-empty"
            >
                Nenhuma configuração corresponde à pesquisa.
            </div>
        `;

        cabecalho.insertAdjacentElement(
            "afterend",
            painel
        );

        return painel;
    }

    function criarPassos() {
        var container =
            obterElemento(
                "store-settings-command-steps"
            );

        if (!container) {
            return;
        }

        container.innerHTML =
            AREAS.map(
                function(area) {
                    return `
                        <button
                            type="button"
                            class="store-settings-step"
                            data-settings-step="${area.id}"
                            aria-label="Abrir ${area.titulo}"
                        >
                            <span class="store-settings-step-number">
                                ${area.numero}
                            </span>

                            <span class="store-settings-step-copy">
                                <strong>${area.curto}</strong>
                                <small>${area.categoria}</small>
                            </span>

                            <span
                                class="store-settings-step-status"
                                data-settings-step-status="${area.id}"
                            ></span>
                        </button>
                    `;
                }
            ).join("");

        container.addEventListener(
            "click",
            function(evento) {
                var botao =
                    evento.target.closest(
                        "[data-settings-step]"
                    );

                if (!botao) {
                    return;
                }

                abrirArea(
                    botao.dataset.settingsStep
                );
            }
        );
    }

    // Elementos onde um clique na topbar NÃO deve alternar a seção —
    // a seta continua sendo o controle principal acessível; a topbar
    // clicável é só conveniência de mouse por cima dela.
    var SELETOR_SEM_TOGGLE =
        "button, a, input, select, textarea, " +
        "[data-no-section-toggle]";

    function criarTopbar(
        bloco,
        area
    ) {
        var existente =
            bloco.querySelector(
                ":scope > .store-settings-section-topbar"
            );

        if (existente) {
            return existente;
        }

        bloco.id =
            bloco.id ||
            ("store-settings-panel-" + area.id);

        var idTitulo =
            "store-settings-heading-" + area.id;

        bloco.setAttribute(
            "role",
            "region"
        );

        bloco.setAttribute(
            "aria-labelledby",
            idTitulo
        );

        var topbar =
            document.createElement(
                "div"
            );

        topbar.className =
            "store-settings-section-topbar";

        topbar.innerHTML = `
            <div class="store-settings-section-heading">
                <span class="store-settings-section-number">
                    ${area.numero}
                </span>

                <span class="store-settings-section-icon">
                    ${area.icone}
                </span>

                <div>
                    <small>${area.categoria}</small>
                    <strong id="${idTitulo}">${area.titulo}</strong>
                    <p>${area.descricao}</p>
                </div>
            </div>

            <div class="store-settings-section-controls">
                <span
                    class="store-settings-section-state"
                    data-settings-state="${area.id}"
                >
                    Verificando
                </span>

                <button
                    type="button"
                    class="store-settings-section-toggle"
                    data-settings-toggle="${area.id}"
                    aria-expanded="true"
                    aria-controls="${bloco.id}"
                    aria-label="Recolher ${area.titulo}"
                >
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        aria-hidden="true"
                    >
                        <path d="m6 9 6 6 6-6"></path>
                    </svg>
                </button>
            </div>
        `;

        bloco.insertBefore(
            topbar,
            bloco.firstChild
        );

        // Um único listener de clique cobre a seta E o resto da
        // topbar (área não interativa) — evita duplicar o toggle: o
        // clique na própria seta é sempre resolvido aqui, nunca por
        // um segundo listener direto no botão.
        topbar.addEventListener(
            "click",
            function(evento) {
                var elementoSemToggle =
                    evento.target.closest(
                        SELETOR_SEM_TOGGLE
                    );

                var eBotaoToggle =
                    elementoSemToggle?.hasAttribute(
                        "data-settings-toggle"
                    );

                if (
                    elementoSemToggle &&
                    !eBotaoToggle
                ) {
                    return;
                }

                evento.preventDefault();

                alternarArea(
                    area.id
                );
            }
        );

        return topbar;
    }

    function prepararBloco(
        area
    ) {
        var bloco =
            buscarBloco(area.id);

        if (!bloco) {
            return;
        }

        bloco.classList.add(
            "store-settings-section"
        );

        bloco.dataset.settingsArea =
            area.id;

        bloco.dataset.settingsSearch =
            normalizar(
                area.titulo +
                " " +
                area.curto +
                " " +
                area.descricao +
                " " +
                area.categoria +
                " " +
                bloco.textContent
            );

        criarTopbar(
            bloco,
            area
        );

        var tituloAntigo =
            Array.from(
                bloco.children
            ).find(
                function(filho) {
                    return (
                        filho.tagName === "H3"
                    );
                }
            );

        tituloAntigo?.classList.add(
            "store-settings-legacy-title"
        );
    }

    // Único ponto que decide o estado expandido/recolhido de uma
    // área — tanto a seta do card quanto o botão do painel superior
    // passam por aqui, então os dois caminhos sempre terminam no
    // mesmo estado (classe, aria-expanded, aria-label, botão do
    // painel superior sincronizado). Idempotente: chamar duas vezes
    // com o mesmo `expandida` não faz nada na segunda vez.
    function definirAreaExpandida(
        id,
        expandida,
        opcoes
    ) {
        var bloco =
            buscarBloco(id);

        if (!bloco) {
            return;
        }

        opcoes = opcoes || {};

        var jaExpandida =
            !bloco.classList.contains(
                "is-collapsed"
            );

        if (jaExpandida === expandida) {
            if (opcoes.scroll) {
                bloco.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
            }

            return;
        }

        bloco.classList.toggle(
            "is-collapsed",
            !expandida
        );

        var botao =
            bloco.querySelector(
                "[data-settings-toggle]"
            );

        botao?.setAttribute(
            "aria-expanded",
            String(expandida)
        );

        botao?.setAttribute(
            "aria-label",
            (
                expandida
                    ? "Recolher "
                    : "Expandir "
            ) +
            (
                buscarArea(id)?.titulo ||
                "configuração"
            )
        );

        var passo =
            painel?.querySelector(
                '[data-settings-step="' +
                id +
                '"]'
            );

        passo?.setAttribute(
            "aria-expanded",
            String(expandida)
        );

        if (expandida && opcoes.scroll) {
            bloco.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        }

        if (expandida && opcoes.highlight) {
            bloco.classList.add(
                "store-settings-section-highlight"
            );

            window.setTimeout(
                function() {
                    bloco.classList.remove(
                        "store-settings-section-highlight"
                    );
                },
                1100
            );
        }

        if (!expandida && opcoes.foco) {
            bloco
                .querySelector(
                    "[data-settings-toggle]"
                )
                ?.focus();
        }
    }

    function alternarArea(id) {
        var bloco =
            buscarBloco(id);

        if (!bloco) {
            return;
        }

        var expandidaAgora =
            !bloco.classList.contains(
                "is-collapsed"
            );

        definirAreaExpandida(
            id,
            !expandidaAgora
        );
    }

    function abrirArea(id) {
        definirAreaExpandida(
            id,
            true,
            {
                scroll: true,
                highlight: true
            }
        );
    }

    function recolherArea(id) {
        definirAreaExpandida(
            id,
            false
        );
    }

    function aplicarPesquisa() {
        var input =
            obterElemento(
                "store-settings-search"
            );

        var termo =
            normalizar(
                input?.value
            );

        var visiveis = 0;

        AREAS.forEach(
            function(area) {
                var bloco =
                    buscarBloco(area.id);

                var passo =
                    painel?.querySelector(
                        '[data-settings-step="' +
                        area.id +
                        '"]'
                    );

                if (!bloco) {
                    passo?.classList.add(
                        "hidden"
                    );
                    return;
                }

                var corresponde =
                    !termo ||
                    String(
                        bloco.dataset
                            .settingsSearch ||
                        ""
                    ).includes(termo);

                bloco.classList.toggle(
                    "store-settings-search-hidden",
                    !corresponde
                );

                passo?.classList.toggle(
                    "store-settings-search-muted",
                    Boolean(
                        termo &&
                        !corresponde
                    )
                );

                if (corresponde) {
                    visiveis += 1;
                }
            }
        );

        obterElemento(
            "store-settings-search-empty"
        )?.classList.toggle(
            "hidden",
            visiveis > 0
        );
    }

    function atualizarResumo() {
        var progresso =
            calcularProgresso();

        var ring =
            obterElemento(
                "store-settings-score-ring"
            );

        if (ring) {
            ring.style.setProperty(
                "--settings-progress",
                (
                    progresso.percentual *
                    3.6
                ) + "deg"
            );
        }

        var score =
            obterElemento(
                "store-settings-score-value"
            );

        if (score) {
            score.textContent =
                progresso.percentual +
                "%";
        }

        var rotulo =
            obterElemento(
                "store-settings-score-label"
            );

        if (rotulo) {
            rotulo.textContent =
                progresso.percentual === 100
                    ? "Configuração essencial concluída"
                    : (
                        progresso.percentual >= 50
                            ? "Sua loja está quase pronta"
                            : "Continue preparando sua loja"
                    );
        }

        var detalhe =
            obterElemento(
                "store-settings-score-detail"
            );

        if (detalhe) {
            detalhe.textContent =
                progresso.concluidas +
                " de " +
                progresso.total +
                " etapas concluídas";
        }

        AREAS.forEach(
            function(area) {
                var status =
                    statusDaArea(
                        area.id
                    );

                var badge =
                    view.querySelector(
                        '[data-settings-state="' +
                        area.id +
                        '"]'
                    );

                if (badge) {
                    badge.textContent =
                        status.rotulo;

                    badge.dataset.state =
                        status.pronto
                            ? "ready"
                            : "pending";
                }

                var indicador =
                    painel?.querySelector(
                        '[data-settings-step-status="' +
                        area.id +
                        '"]'
                    );

                if (indicador) {
                    indicador.dataset.state =
                        status.pronto
                            ? "ready"
                            : "pending";

                    indicador.title =
                        status.rotulo;
                }
            }
        );
    }

    function marcarAlteracao() {
        alteracoesPendentes =
            true;

        view.classList.add(
            "has-unsaved-settings"
        );

        var status =
            obterElemento(
                "store-settings-change-status"
            );

        if (status) {
            status.textContent =
                "Alterações não salvas";

            status.dataset.state =
                "dirty";
        }
    }

    function marcarSincronizado() {
        alteracoesPendentes =
            false;

        view.classList.remove(
            "has-unsaved-settings"
        );

        var status =
            obterElemento(
                "store-settings-change-status"
            );

        if (status) {
            status.textContent =
                "Tudo sincronizado";

            status.dataset.state =
                "saved";
        }
    }

    function conectarEventos() {
        var pesquisa =
            obterElemento(
                "store-settings-search"
            );

        pesquisa?.addEventListener(
            "input",
            aplicarPesquisa
        );

        obterElemento(
            "store-settings-save-proxy"
        )?.addEventListener(
            "click",
            function() {
                obterElemento(
                    "btn-salvar-perfil"
                )?.click();
            }
        );

        view.addEventListener(
            "input",
            function(evento) {
                if (
                    evento.target.closest(
                        "#store-settings-command-v1"
                    )
                ) {
                    return;
                }

                if (evento.isTrusted) {
                    marcarAlteracao();
                }

                agendarAtualizacao();
            }
        );

        view.addEventListener(
            "change",
            function(evento) {
                if (
                    evento.target.closest(
                        "#store-settings-command-v1"
                    )
                ) {
                    return;
                }

                if (evento.isTrusted) {
                    marcarAlteracao();
                }

                agendarAtualizacao();
            }
        );

        obterElemento(
            "btn-salvar-perfil"
        )?.addEventListener(
            "click",
            function() {
                var status =
                    obterElemento(
                        "store-settings-change-status"
                    );

                if (status) {
                    status.textContent =
                        "Salvando alterações...";
                    status.dataset.state =
                        "saving";
                }

                window.setTimeout(
                    marcarSincronizado,
                    1700
                );
            }
        );
    }

    function prepararObserverSecoes() {
        if (
            observerSecoes ||
            typeof IntersectionObserver !==
                "function"
        ) {
            return;
        }

        observerSecoes =
            new IntersectionObserver(
                function(entries) {
                    var visivel =
                        entries
                            .filter(
                                function(entry) {
                                    return (
                                        entry.isIntersecting
                                    );
                                }
                            )
                            .sort(
                                function(a, b) {
                                    return (
                                        b.intersectionRatio -
                                        a.intersectionRatio
                                    );
                                }
                            )[0];

                    if (!visivel) {
                        return;
                    }

                    var id =
                        visivel.target.dataset
                            .settingsArea;

                    painel
                        ?.querySelectorAll(
                            "[data-settings-step]"
                        )
                        .forEach(
                            function(botao) {
                                botao.classList.toggle(
                                    "is-active",
                                    botao.dataset
                                        .settingsStep ===
                                        id
                                );
                            }
                        );
                },
                {
                    root: null,
                    rootMargin:
                        "-20% 0px -65% 0px",
                    threshold:
                        [0.1, 0.25, 0.5]
                }
            );

        AREAS.forEach(
            function(area) {
                var bloco =
                    buscarBloco(area.id);

                if (bloco) {
                    observerSecoes.observe(
                        bloco
                    );
                }
            }
        );
    }

    function agendarAtualizacao() {
        window.cancelAnimationFrame(
            atualizacaoPendente
        );

        atualizacaoPendente =
            window.requestAnimationFrame(
                function() {
                    atualizarResumo();
                    aplicarPesquisa();
                }
            );
    }

    function prepararInterface() {
        view =
            obterElemento(
                "view-perfil"
            );

        if (!view) {
            return false;
        }

        view.classList.add(
            "store-settings-executive-view"
        );

        if (!criarPainel()) {
            return false;
        }

        criarPassos();

        AREAS.forEach(
            prepararBloco
        );

        atualizarResumo();
        conectarEventos();
        prepararObserverSecoes();
        marcarSincronizado();

        return true;
    }

    function observarMudancas() {
        if (!view || observerView) {
            return;
        }

        observerView =
            new MutationObserver(
                function() {
                    AREAS.forEach(
                        prepararBloco
                    );

                    agendarAtualizacao();
                }
            );

        observerView.observe(
            view,
            {
                childList: true,
                subtree: true
            }
        );
    }

    function iniciar() {
        var tentativas = 0;

        var intervalo =
            window.setInterval(
                function() {
                    tentativas += 1;

                    if (
                        prepararInterface()
                    ) {
                        window.clearInterval(
                            intervalo
                        );

                        observarMudancas();

                        window.setTimeout(
                            agendarAtualizacao,
                            500
                        );

                        window.setTimeout(
                            agendarAtualizacao,
                            1500
                        );

                        return;
                    }

                    if (tentativas >= 40) {
                        window.clearInterval(
                            intervalo
                        );

                        console.warn(
                            "[Vide Hub] A área de Configurações da Loja não foi encontrada."
                        );
                    }
                },
                150
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
