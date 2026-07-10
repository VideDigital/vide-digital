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
                            termo === "" ||
                            nomeBotao.includes(termo) ||
                            alvoBotao.includes(termo);

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
