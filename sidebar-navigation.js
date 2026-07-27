/**
 * Vide Hub — Sidebar V3.8
 * Desktop compacto por padrão, expansão ao passar o mouse e modo fixo opcional.
 */
(function iniciarNavegacaoVideHub() {
    "use strict";

    function iniciar() {
        const sidebar = document.getElementById("admin-sidebar");
        const navegacao = document.getElementById("sidebar-nav");
        const areaGrupos = document.getElementById("sidebar-navigation-groups");
        const campoBusca = document.getElementById("busca-sidebar-modulos");
        const estadoVazio = document.getElementById("sidebar-navigation-empty");

        if (!sidebar || !navegacao || !areaGrupos || !campoBusca) return;
        if (sidebar.dataset.videDockReady === "true") return;
        sidebar.dataset.videDockReady = "true";

        const STORAGE_PREFIXO = "videSidebarV38_";
        const MQ_DESKTOP = window.matchMedia("(min-width: 1024px)");

        const configuracaoGrupos = [
            {
                id: "operacao",
                nome: "Operação",
                descricao: "Rotina da loja",
                icone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="7" height="7" rx="2"></rect><rect x="14" y="3" width="7" height="7" rx="2"></rect><rect x="3" y="14" width="7" height="7" rx="2"></rect><rect x="14" y="14" width="7" height="7" rx="2"></rect></svg>',
                alvos: [
                    "view-dashboard",
                    "view-atendimento",
                    "view-crm360",
                    "view-pedidos",
                    "view-leads",
                    "view-avaliacoes"
                ]
            },
            {
                id: "crescimento",
                nome: "Crescimento",
                descricao: "Marketing e vendas",
                icone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m4 17 5-5 4 4 7-9"></path><path d="M15 7h5v5"></path></svg>',
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
                icone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.06.06-2.12 2.12-.06-.06a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.1 1.65v.11h-3v-.11a1.8 1.8 0 0 0-1.1-1.65 1.8 1.8 0 0 0-1.98.36l-.06.06-2.12-2.12.06-.06A1.8 1.8 0 0 0 6.6 15a1.8 1.8 0 0 0-1.65-1.1H4.5v-3h.45A1.8 1.8 0 0 0 6.6 9.8a1.8 1.8 0 0 0-.36-1.98l-.06-.06 2.12-2.12.06.06a1.8 1.8 0 0 0 1.98.36 1.8 1.8 0 0 0 1.1-1.65V4.3h3v.11a1.8 1.8 0 0 0 1.1 1.65 1.8 1.8 0 0 0 1.98-.36l.06-.06 2.12 2.12-.06.06a1.8 1.8 0 0 0-.36 1.98 1.8 1.8 0 0 0 1.65 1.1h.45v3h-.45A1.8 1.8 0 0 0 19.4 15Z"></path></svg>',
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
                icone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H12v17H7.5A3.5 3.5 0 0 0 4 22V5.5Z"></path><path d="M20 5.5A3.5 3.5 0 0 0 16.5 2H12v17h4.5A3.5 3.5 0 0 1 20 22V5.5Z"></path></svg>',
                alvos: ["view-guia"]
            }
        ];

        const catalogoModulos = {
            "view-dashboard": { nome: "Visão Geral", descricao: "Resumo da operação e indicadores" },
            "view-atendimento": { nome: "Central de Atendimento", descricao: "Conversas e equipe em um só lugar" },
            "view-crm360": { nome: "CRM 360 do Cliente", descricao: "Histórico completo de cada cliente" },
            "view-pedidos": { nome: "Pedidos", descricao: "Vendas, pagamentos e entregas" },
            "view-leads": { nome: "Leads", descricao: "Inbox, pipeline e agenda comercial" },
            "view-avaliacoes": { nome: "Avaliações", descricao: "Reputação e feedback dos clientes" },
            "view-automacao-leads": { nome: "Automação de Leads", descricao: "Regras, follow-ups e organização" },
            "view-central-ia": { nome: "Central de IA", descricao: "Assistentes inteligentes do negócio" },
            "view-base-conhecimento": { nome: "Base de Conhecimento", descricao: "Informações utilizadas pela IA" },
            "view-templates": { nome: "Templates", descricao: "Modelos prontos para comunicação" },
            "view-campanhas": { nome: "Campanhas", descricao: "Divulgação, links e rastreamento" },
            "view-landing-pages": { nome: "Landing Pages", descricao: "Páginas de venda e captação" },
            "view-metricas": { nome: "Métricas", descricao: "Desempenho, origem e conversão" },
            "view-perfil": { nome: "Configurações da Loja", descricao: "Dados, identidade e funcionamento" },
            "view-dominios": { nome: "Pixels & Domínio", descricao: "Domínio, SEO e rastreamento" },
            "view-notificacoes": { nome: "Notificações", descricao: "Alertas e atualizações do sistema" },
            "view-personalizacao": { nome: "Personalização Premium", descricao: "Cores, visual e experiência" },
            "view-funcionarios": { nome: "Funcionários", descricao: "Equipe, acessos e permissões" },
            "view-guia": { nome: "Guia do Plano", descricao: "Recursos, limites e orientações" }
        };

        function normalizarTexto(texto) {
            return String(texto || "")
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase()
                .trim();
        }

        function lerStorage(chave, fallback) {
            try {
                const valor = localStorage.getItem(STORAGE_PREFIXO + chave);
                return valor === null ? fallback : valor;
            } catch (erro) {
                return fallback;
            }
        }

        function salvarStorage(chave, valor) {
            try {
                localStorage.setItem(STORAGE_PREFIXO + chave, valor);
            } catch (erro) {}
        }

        function obterNomeBotao(botao) {
            const alvo = botao?.getAttribute("data-target") || "";
            const meta = catalogoModulos[alvo];
            if (meta?.nome) return meta.nome;

            const clone = botao.cloneNode(true);
            clone.querySelectorAll("svg, .badge, [aria-hidden='true'], .vide-dock-description").forEach(function(item) {
                item.remove();
            });
            return clone.textContent.replace(/\s+/g, " ").trim();
        }

        function obterDescricaoBotao(botao, nome) {
            const alvo = botao?.getAttribute("data-target") || "";
            return catalogoModulos[alvo]?.descricao || botao?.getAttribute("aria-description") || ("Abrir " + nome);
        }

        function enriquecerBotao(botao) {
            const nome = obterNomeBotao(botao);
            const descricao = obterDescricaoBotao(botao, nome);
            botao.dataset.moduleName = nome;
            botao.dataset.moduleDescription = descricao;
            botao.setAttribute("aria-label", nome + ". " + descricao);
            botao.title = nome;

            let rotulo = botao.querySelector(".vide-dock-label");
            if (!rotulo) {
                rotulo = document.createElement("span");
                rotulo.className = "vide-dock-label";
                const textosSoltos = Array.from(botao.childNodes).filter(function(no) {
                    return no.nodeType === Node.TEXT_NODE && no.textContent.trim() !== "";
                });
                textosSoltos.forEach(function(no) { no.remove(); });
                botao.appendChild(rotulo);
            }

            rotulo.innerHTML = "";
            const titulo = document.createElement("strong");
            titulo.textContent = nome;
            const detalhe = document.createElement("small");
            detalhe.className = "vide-dock-description";
            detalhe.textContent = descricao;
            rotulo.appendChild(titulo);
            rotulo.appendChild(detalhe);
        }

        function organizarGrupos() {
            const botoesExistentes = Array.from(areaGrupos.querySelectorAll(":scope > button[data-target]"));
            if (botoesExistentes.length === 0) return;

            // Nunca deixa a lista vazia: se o agrupamento falhar no meio do
            // caminho (erro em qualquer grupo), os botões originais voltam
            // pro lugar sem agrupamento, em vez de sumir de vez — antes,
            // areaGrupos.innerHTML = "" rodava ANTES de reconstruir, então
            // qualquer exceção no meio deixava a sidebar sem nenhum módulo
            // visível pelo resto da sessão.
            try {
                montarGrupos(botoesExistentes);
                if (!areaGrupos.children.length) throw new Error("nenhum grupo montado");
            } catch (erro) {
                console.error("[Sidebar] Falha ao agrupar módulos, restaurando lista simples.", erro);
                areaGrupos.innerHTML = "";
                botoesExistentes.forEach(function(botao) { areaGrupos.appendChild(botao); });
            }
        }

        function montarGrupos(botoesExistentes) {
            areaGrupos.innerHTML = "";

            configuracaoGrupos.forEach(function(grupo, indiceGrupo) {
                const containerGrupo = document.createElement("div");
                containerGrupo.className = "aura-sidebar-group";
                containerGrupo.dataset.sidebarGroup = grupo.id;
                containerGrupo.dataset.sidebarGroupName = grupo.nome;

                containerGrupo.innerHTML = `
                    <div class="aura-sidebar-group-header" role="button" tabindex="0" aria-expanded="true" title="${grupo.nome}">
                        <div class="aura-sidebar-group-title">
                            <span class="aura-sidebar-group-icon">${grupo.icone}</span>
                            <span class="aura-sidebar-group-copy">
                                <strong>${grupo.nome}</strong>
                                <small>${grupo.descricao}</small>
                            </span>
                        </div>
                        <span class="aura-sidebar-group-chevron">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m6 9 6 6 6-6"></path></svg>
                        </span>
                    </div>
                    <div class="aura-sidebar-group-content"></div>
                `;

                const conteudoGrupo = containerGrupo.querySelector(".aura-sidebar-group-content");
                grupo.alvos.forEach(function(alvo) {
                    const botao = botoesExistentes.find(function(item) {
                        return item.getAttribute("data-target") === alvo;
                    });
                    if (botao) {
                        botao.dataset.moduleGroup = grupo.nome;
                        enriquecerBotao(botao);
                        conteudoGrupo.appendChild(botao);
                    }
                });

                if (!conteudoGrupo.children.length) return;
                areaGrupos.appendChild(containerGrupo);

                const cabecalho = containerGrupo.querySelector(".aura-sidebar-group-header");

                function aplicarEstado(recolhido) {
                    containerGrupo.classList.toggle("aura-sidebar-group-collapsed", recolhido);
                    cabecalho.setAttribute("aria-expanded", String(!recolhido));
                    salvarStorage("grupo_" + grupo.id, recolhido ? "fechado" : "aberto");
                }

                function alternarGrupo() {
                    const recolhido = !containerGrupo.classList.contains("aura-sidebar-group-collapsed");
                    aplicarEstado(recolhido);
                }

                cabecalho.addEventListener("click", function() {
                    if (!MQ_DESKTOP.matches || sidebar.classList.contains("vide-sidebar-expanded") || sidebar.classList.contains("vide-sidebar-pinned")) {
                        alternarGrupo();
                    }
                });

                cabecalho.addEventListener("keydown", function(evento) {
                    if (evento.key === "Enter" || evento.key === " ") {
                        evento.preventDefault();
                        alternarGrupo();
                    }
                });

                const estadoSalvo = lerStorage("grupo_" + grupo.id, indiceGrupo === 0 ? "aberto" : "aberto");
                aplicarEstado(estadoSalvo === "fechado");
            });
        }

        function limparBuscaSidebar() {
            campoBusca.textContent = "";
            aplicarBusca();
        }

        function aplicarBusca() {
            const termo = normalizarTexto(campoBusca.textContent);
            let quantidadeVisivel = 0;

            areaGrupos.querySelectorAll(".aura-sidebar-group").forEach(function(grupo) {
                let visiveisNoGrupo = 0;

                grupo.querySelectorAll(".aura-sidebar-group-content > button[data-target]").forEach(function(botao) {
                    const nomeBotao = normalizarTexto(botao.dataset.moduleName || botao.textContent);
                    const alvoBotao = normalizarTexto(botao.getAttribute("data-target"));
                    const descricao = normalizarTexto(botao.dataset.moduleDescription || "");
                    const encontrado = !botao.classList.contains("hidden") && (
                        termo === "" ||
                        nomeBotao.includes(termo) ||
                        alvoBotao.includes(termo) ||
                        descricao.includes(termo)
                    );

                    botao.classList.toggle("aura-sidebar-search-hidden", !encontrado);
                    if (encontrado) {
                        visiveisNoGrupo++;
                        quantidadeVisivel++;
                    }
                });

                grupo.classList.toggle("aura-sidebar-search-group-hidden", visiveisNoGrupo === 0);

                if (termo !== "" && visiveisNoGrupo > 0) {
                    grupo.classList.remove("aura-sidebar-group-collapsed");
                    grupo.querySelector(".aura-sidebar-group-header")?.setAttribute("aria-expanded", "true");
                }
            });

            if (estadoVazio) {
                estadoVazio.classList.toggle("hidden", quantidadeVisivel > 0);
            }
        }

        function garantirEstadoDesktop() {
            const desktop = MQ_DESKTOP.matches;
            sidebar.classList.toggle("vide-sidebar-desktop", desktop);

            if (!desktop) {
                sidebar.classList.remove("vide-sidebar-expanded");
                return;
            }

            const pinned = lerStorage("pinned", "false") === "true";
            sidebar.classList.toggle("vide-sidebar-pinned", pinned);
            sidebar.classList.toggle("vide-sidebar-expanded", pinned);
        }

        function expandirSidebar() {
            if (!MQ_DESKTOP.matches) return;
            sidebar.classList.add("vide-sidebar-expanded");
        }

        function recolherSidebar() {
            if (!MQ_DESKTOP.matches) return;
            if (sidebar.classList.contains("vide-sidebar-pinned")) return;
            if (document.activeElement === campoBusca) return;
            sidebar.classList.remove("vide-sidebar-expanded");
        }

        function alternarPin() {
            if (!MQ_DESKTOP.matches) return;
            const pinned = !sidebar.classList.contains("vide-sidebar-pinned");
            sidebar.classList.toggle("vide-sidebar-pinned", pinned);
            sidebar.classList.toggle("vide-sidebar-expanded", pinned);
            salvarStorage("pinned", pinned ? "true" : "false");
        }

        function inserirBotaoPin() {
            const cardTopo = sidebar.querySelector(".relative.overflow-hidden.rounded-3xl .relative.flex.items-center.justify-between") ||
                sidebar.querySelector(".relative.overflow-hidden.rounded-3xl .relative.flex.items-center.justify-between");
            if (!cardTopo || cardTopo.querySelector(".vide-sidebar-pin-button")) return;

            const botao = document.createElement("button");
            botao.type = "button";
            botao.className = "vide-sidebar-pin-button";
            botao.setAttribute("aria-label", "Fixar ou recolher menu lateral");
            botao.title = "Fixar menu lateral";
            botao.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 17v5"></path><path d="M5 8V3h14v5"></path><path d="M4 8h16l-2 6H6L4 8Z"></path></svg>';
            botao.addEventListener("click", function(evento) {
                evento.preventDefault();
                evento.stopPropagation();
                alternarPin();
            });
            cardTopo.appendChild(botao);
        }

        function conectarEventosDesktop() {
            sidebar.addEventListener("mouseenter", expandirSidebar);
            sidebar.addEventListener("mouseleave", recolherSidebar);
            sidebar.addEventListener("focusin", expandirSidebar);
            sidebar.addEventListener("focusout", function() {
                window.setTimeout(function() {
                    if (!sidebar.contains(document.activeElement)) {
                        recolherSidebar();
                    }
                }, 20);
            });
        }

        function conectarEventosBusca() {
            campoBusca.addEventListener("input", aplicarBusca);
            document.addEventListener("keydown", function(evento) {
                const teclaBusca = String(evento?.key || "").toLowerCase() === "k";

                if (teclaBusca && (evento.ctrlKey || evento.metaKey)) {
                    evento.preventDefault();
                    expandirSidebar();
                    setTimeout(function() {
                        campoBusca.focus();
                        const selecao = window.getSelection();
                        const intervalo = document.createRange();
                        intervalo.selectNodeContents(campoBusca);
                        selecao.removeAllRanges();
                        selecao.addRange(intervalo);
                    }, 80);
                }

                if (evento.key === "Escape" && document.activeElement === campoBusca) {
                    limparBuscaSidebar();
                    campoBusca.blur();
                    recolherSidebar();
                }
            });
        }

        organizarGrupos();
        inserirBotaoPin();
        garantirEstadoDesktop();
        conectarEventosDesktop();
        conectarEventosBusca();
        limparBuscaSidebar();

        window.atualizarBuscaSidebarModulos = aplicarBusca;

        window.addEventListener("pageshow", function() {
            setTimeout(limparBuscaSidebar, 100);
        });

        if (typeof MQ_DESKTOP.addEventListener === "function") {
            MQ_DESKTOP.addEventListener("change", garantirEstadoDesktop);
        } else if (typeof MQ_DESKTOP.addListener === "function") {
            MQ_DESKTOP.addListener(garantirEstadoDesktop);
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", iniciar, { once: true });
    } else {
        iniciar();
    }
})();
