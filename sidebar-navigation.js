/**
 * Vide Hub — Sidebar V5.0
 * Módulos em grade de ícones (biblioteca de ícones): cada módulo é um
 * ícone compacto; passar o mouse (ou focar via teclado) mostra o nome
 * completo e uma mini descrição num tooltip flutuante.
 */
(function iniciarNavegacaoVideHub() {
    "use strict";

    function iniciar() {
        const sidebar = document.getElementById("admin-sidebar");
        const navegacao = document.getElementById("sidebar-nav");
        const areaGrupos = document.getElementById("sidebar-navigation-groups");
        const campoBusca = document.getElementById("busca-sidebar-modulos");
        const estadoVazio = document.getElementById("sidebar-navigation-empty");
        const boxLogout = document.getElementById("box-logout");

        if (!sidebar || !navegacao || !areaGrupos || !campoBusca) return;
        if (sidebar.dataset.videDockReady === "true") return;
        sidebar.dataset.videDockReady = "true";

        const configuracaoGrupos = [
            {
                id: "operacao",
                nome: "Operação",
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

        function obterNomeBotao(botao) {
            const alvo = botao?.getAttribute("data-target") || "";
            const meta = catalogoModulos[alvo];
            if (meta?.nome) return meta.nome;

            const clone = botao.cloneNode(true);
            clone.querySelectorAll("svg, .badge, [aria-hidden='true']").forEach(function(item) {
                item.remove();
            });
            return clone.textContent.replace(/\s+/g, " ").trim();
        }

        function obterDescricaoBotao(botao, nome) {
            const alvo = botao?.getAttribute("data-target") || "";
            return catalogoModulos[alvo]?.descricao || botao?.getAttribute("aria-description") || ("Abrir " + nome);
        }

        // Cada módulo vira um ícone compacto: o texto some do botão (fica
        // só no aria-label, pra leitor de tela) e passa a viver no tooltip
        // flutuante compartilhado, mostrado no hover/foco.
        function enriquecerBotao(botao) {
            const nome = obterNomeBotao(botao);
            const descricao = obterDescricaoBotao(botao, nome);
            botao.dataset.moduleName = nome;
            botao.dataset.moduleDescription = descricao;
            botao.setAttribute("aria-label", nome + ". " + descricao);
            botao.removeAttribute("title");

            // Alguns botões (ex.: Funcionários) trazem o rótulo dentro de um
            // <span> em vez de texto solto direto no botão — remove QUALQUER
            // filho que não seja o ícone, não só nós de texto direto, senão
            // o rótulo continua visível e quebra a grade de ícones.
            Array.from(botao.childNodes).forEach(function(no) {
                if (no.nodeType === Node.ELEMENT_NODE && no.tagName.toLowerCase() === "svg") return;
                no.remove();
            });
        }

        // Painel Master e Sair da conta seguem o mesmo tratamento dos
        // módulos: viram ícones compactos lado a lado, com nome e
        // descrição só no tooltip flutuante (o rótulo já existia em
        // <strong>/<small>, só precisa sair do botão e virar dataset).
        function enriquecerBotaoConta(botao) {
            const nome = botao.querySelector(".aura-sidebar-account-text strong")?.textContent.trim() || "";
            const descricao = botao.querySelector(".aura-sidebar-account-text small")?.textContent.trim() || "";
            if (!nome) return;

            botao.dataset.moduleName = nome;
            botao.dataset.moduleDescription = descricao;
            botao.setAttribute("aria-label", descricao ? (nome + ". " + descricao) : nome);

            Array.from(botao.childNodes).forEach(function(no) {
                const ehIcone = no.nodeType === Node.ELEMENT_NODE &&
                    no.classList.contains("aura-sidebar-account-icon");
                if (ehIcone) return;
                no.remove();
            });
        }

        function organizarGrupos() {
            const botoesExistentes = Array.from(areaGrupos.querySelectorAll(":scope > button[data-target]"));
            if (botoesExistentes.length === 0) return;

            // Nunca deixa a lista vazia: se o agrupamento falhar no meio do
            // caminho (erro em qualquer grupo), os botões originais voltam
            // pro lugar sem agrupamento, em vez de sumir de vez.
            try {
                montarGrupos(botoesExistentes);
                if (!areaGrupos.children.length) throw new Error("nenhum grupo montado");
            } catch (erro) {
                console.error("[Sidebar] Falha ao agrupar módulos, restaurando lista simples.", erro);
                areaGrupos.innerHTML = "";
                botoesExistentes.forEach(function(botao) {
                    enriquecerBotao(botao);
                    areaGrupos.appendChild(botao);
                });
            }
        }

        function montarGrupos(botoesExistentes) {
            areaGrupos.innerHTML = "";

            configuracaoGrupos.forEach(function(grupo) {
                const containerGrupo = document.createElement("div");
                containerGrupo.className = "aura-sidebar-group";
                containerGrupo.dataset.sidebarGroup = grupo.id;

                containerGrupo.innerHTML = `
                    <div class="aura-sidebar-group-header" title="${grupo.nome}">
                        <span class="aura-sidebar-group-icon">${grupo.icone}</span>
                        <span class="aura-sidebar-group-nome">${grupo.nome}</span>
                    </div>
                    <div class="aura-sidebar-group-content"></div>
                `;

                const conteudoGrupo = containerGrupo.querySelector(".aura-sidebar-group-content");
                grupo.alvos.forEach(function(alvo) {
                    const botao = botoesExistentes.find(function(item) {
                        return item.getAttribute("data-target") === alvo;
                    });
                    if (botao) {
                        enriquecerBotao(botao);
                        conteudoGrupo.appendChild(botao);
                    }
                });

                if (!conteudoGrupo.children.length) return;
                areaGrupos.appendChild(containerGrupo);
            });
        }

        // ===== Tooltip flutuante compartilhado =====
        // Fica fora da sidebar (anexado ao body, position:fixed) de
        // propósito: a navegação tem overflow-y:auto pra rolar, e um
        // tooltip preso dentro dela seria cortado pelo clipping do
        // container quando o ícone está perto da borda.
        const tooltip = document.createElement("div");
        tooltip.className = "aura-sidebar-tooltip";
        tooltip.setAttribute("role", "tooltip");
        tooltip.innerHTML = "<strong></strong><small></small>";
        document.body.appendChild(tooltip);

        let tooltipTimer = null;
        let botaoComTooltip = null;

        function posicionarTooltip(botao) {
            const retangulo = botao.getBoundingClientRect();
            const centroVertical = retangulo.top + retangulo.height / 2;
            tooltip.style.top = centroVertical + "px";

            const espacoDireita = window.innerWidth - retangulo.right;
            if (espacoDireita < 260) {
                tooltip.style.left = "";
                tooltip.style.right = (window.innerWidth - retangulo.left + 12) + "px";
                tooltip.classList.add("is-invertido");
            } else {
                tooltip.style.right = "";
                tooltip.style.left = (retangulo.right + 12) + "px";
                tooltip.classList.remove("is-invertido");
            }
        }

        function mostrarTooltip(botao) {
            const nome = botao.dataset.moduleName || botao.getAttribute("aria-label") || "";
            const descricao = botao.dataset.moduleDescription || "";
            if (!nome) return;

            window.clearTimeout(tooltipTimer);
            botaoComTooltip = botao;
            tooltip.querySelector("strong").textContent = nome;
            tooltip.querySelector("small").textContent = descricao;
            posicionarTooltip(botao);
            tooltip.classList.add("is-visivel");
        }

        function esconderTooltip() {
            window.clearTimeout(tooltipTimer);
            tooltipTimer = window.setTimeout(function() {
                tooltip.classList.remove("is-visivel");
                botaoComTooltip = null;
            }, 60);
        }

        // Qualquer botão enriquecido (módulo da grade ou atalho de conta)
        // ganha data-module-name — usa isso como seletor comum em vez de
        // exigir data-target, que só os módulos de navegação têm.
        function conectarTooltipsEm(container) {
            container.addEventListener("mouseover", function(evento) {
                const botao = evento.target.closest("button[data-module-name]");
                if (botao && botao !== botaoComTooltip) mostrarTooltip(botao);
            });
            container.addEventListener("mouseout", function(evento) {
                const botao = evento.target.closest("button[data-module-name]");
                const indoPara = evento.relatedTarget && evento.relatedTarget.closest
                    ? evento.relatedTarget.closest("button[data-module-name]")
                    : null;
                if (botao && botao === botaoComTooltip && indoPara !== botao) esconderTooltip();
            });
            container.addEventListener("focusin", function(evento) {
                const botao = evento.target.closest("button[data-module-name]");
                if (botao) mostrarTooltip(botao);
            });
            container.addEventListener("focusout", function(evento) {
                const botao = evento.target.closest("button[data-module-name]");
                if (botao) esconderTooltip();
            });
        }

        function conectarTooltips() {
            conectarTooltipsEm(areaGrupos);
            if (boxLogout) conectarTooltipsEm(boxLogout);
            navegacao.addEventListener("scroll", function() {
                tooltip.classList.remove("is-visivel");
                botaoComTooltip = null;
            }, { passive: true });
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
            });

            if (estadoVazio) {
                estadoVazio.classList.toggle("hidden", quantidadeVisivel > 0);
            }
        }

        // Ctrl/Cmd+K é atalho global da Central de Comandos (Aura Command
        // Center, dashboard-app.js) — esta busca inline não escuta mais
        // esse atalho (escutava antes, e os dois abriam ao mesmo tempo,
        // um por cima do outro). Reage só a clique/digitação direta.
        function conectarEventosBusca() {
            campoBusca.addEventListener("input", aplicarBusca);
            document.addEventListener("keydown", function(evento) {
                if (evento.key === "Escape" && document.activeElement === campoBusca) {
                    limparBuscaSidebar();
                    campoBusca.blur();
                }
            });
        }

        organizarGrupos();
        if (boxLogout) {
            boxLogout.querySelectorAll(".aura-sidebar-account-button").forEach(enriquecerBotaoConta);
        }
        conectarTooltips();
        conectarEventosBusca();
        limparBuscaSidebar();

        window.atualizarBuscaSidebarModulos = aplicarBusca;

        window.addEventListener("pageshow", function() {
            setTimeout(limparBuscaSidebar, 100);
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", iniciar, { once: true });
    } else {
        iniciar();
    }
})();
