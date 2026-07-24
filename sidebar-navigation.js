/**
 * Vide Hub — Sidebar V3.4
 * Rail profissional com painel por toque para celular em modo desktop.
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

        const mediaPonteiroGrosso = typeof window.matchMedia === "function"
            ? window.matchMedia("(pointer: coarse)")
            : null;
        const ambienteComToque = Boolean(
            (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) ||
            (mediaPonteiroGrosso && mediaPonteiroGrosso.matches) ||
            ("ontouchstart" in window)
        );

        if (ambienteComToque) {
            document.documentElement.classList.add("vide-touch-device");
        }

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
            "view-dashboard": {
                nome: "Visão Geral",
                descricao: "Resumo da operação e indicadores"
            },
            "view-atendimento": {
                nome: "Central de Atendimento",
                descricao: "Conversas e equipe em um só lugar"
            },
            "view-crm360": {
                nome: "CRM 360 do Cliente",
                descricao: "Histórico completo de cada cliente"
            },
            "view-pedidos": {
                nome: "Pedidos",
                descricao: "Vendas, pagamentos e entregas"
            },
            "view-leads": {
                nome: "Leads",
                descricao: "Inbox, pipeline e agenda comercial"
            },
            "view-avaliacoes": {
                nome: "Avaliações",
                descricao: "Reputação e feedback dos clientes"
            },
            "view-automacao-leads": {
                nome: "Automação de Leads",
                descricao: "Regras, follow-ups e organização"
            },
            "view-central-ia": {
                nome: "Central de IA",
                descricao: "Assistentes inteligentes do negócio"
            },
            "view-base-conhecimento": {
                nome: "Base de Conhecimento",
                descricao: "Informações utilizadas pela IA"
            },
            "view-templates": {
                nome: "Templates",
                descricao: "Modelos prontos para comunicação"
            },
            "view-campanhas": {
                nome: "Campanhas",
                descricao: "Divulgação, links e rastreamento"
            },
            "view-landing-pages": {
                nome: "Landing Pages",
                descricao: "Páginas de venda e captação"
            },
            "view-metricas": {
                nome: "Métricas",
                descricao: "Desempenho, origem e conversão"
            },
            "view-perfil": {
                nome: "Configurações da Loja",
                descricao: "Dados, identidade e funcionamento"
            },
            "view-dominios": {
                nome: "Pixels & Domínio",
                descricao: "Domínio, SEO e rastreamento"
            },
            "view-notificacoes": {
                nome: "Notificações",
                descricao: "Alertas e atualizações do sistema"
            },
            "view-personalizacao": {
                nome: "Personalização Premium",
                descricao: "Cores, visual e experiência"
            },
            "view-funcionarios": {
                nome: "Funcionários",
                descricao: "Equipe, acessos e permissões"
            },
            "view-guia": {
                nome: "Guia do Plano",
                descricao: "Recursos, limites e orientações"
            }
        };

        function normalizarTexto(texto) {
            return String(texto || "")
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase()
                .trim();
        }

        function escaparHtml(texto) {
            return String(texto || "")
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }

        function obterNomeBotao(botao) {
            const alvo = botao?.getAttribute("data-target") || "";
            const meta = catalogoModulos[alvo];
            if (meta?.nome) return meta.nome;

            const rotulo = botao?.querySelector(".vide-dock-label strong");
            if (rotulo) return rotulo.textContent.trim();

            const clone = botao.cloneNode(true);
            clone.querySelectorAll(
                "svg, .badge, [aria-hidden='true'], .vide-dock-description"
            ).forEach(function(item) {
                item.remove();
            });
            return clone.textContent.replace(/\s+/g, " ").trim();
        }

        function obterDescricaoBotao(botao, nome) {
            const alvo = botao?.getAttribute("data-target") || "";
            return catalogoModulos[alvo]?.descricao ||
                botao?.getAttribute("aria-description") ||
                ("Abrir " + nome);
        }

        function envolverRotuloBotao(botao) {
            const alvo = botao.getAttribute("data-target") || "";
            const meta = catalogoModulos[alvo] || {};
            const nomeOriginal = meta.nome || obterNomeBotao(botao);
            const descricao = meta.descricao || ("Abrir " + nomeOriginal);

            let rotuloExistente = botao.querySelector(".vide-dock-label");

            if (!rotuloExistente) {
                const spans = Array.from(botao.children).filter(function(filho) {
                    return filho.tagName === "SPAN" &&
                        !filho.classList.contains("aura-sidebar-account-icon") &&
                        !filho.classList.contains("aura-sidebar-account-arrow") &&
                        !filho.classList.contains("aura-leads-v6-navigation-badge");
                });

                rotuloExistente = spans.find(function(span) {
                    return span.textContent.trim() !== "" && !span.querySelector("svg");
                }) || null;
            }

            const textos = Array.from(botao.childNodes).filter(function(no) {
                return no.nodeType === Node.TEXT_NODE &&
                    no.textContent.trim() !== "";
            });

            textos.forEach(function(no) {
                no.remove();
            });

            if (!rotuloExistente) {
                rotuloExistente = document.createElement("span");
                botao.appendChild(rotuloExistente);
            }

            rotuloExistente.className =
                "vide-dock-label";

            rotuloExistente.innerHTML = "";

            const titulo = document.createElement("strong");
            titulo.textContent = nomeOriginal;

            const detalhe = document.createElement("small");
            detalhe.className = "vide-dock-description";
            detalhe.textContent = descricao;

            rotuloExistente.appendChild(titulo);
            rotuloExistente.appendChild(detalhe);

            botao.dataset.moduleName = nomeOriginal;
            botao.dataset.moduleDescription = descricao;
            botao.setAttribute(
                "aria-label",
                nomeOriginal + ". " + descricao
            );
            botao.title = nomeOriginal + " — " + descricao;
        }

        function organizarGrupos() {
            const botoesExistentes = Array.from(
                areaGrupos.querySelectorAll(":scope > button[data-target]")
            );

            configuracaoGrupos.forEach(function(grupo, indiceGrupo) {
                const containerGrupo = document.createElement("div");
                containerGrupo.className = "aura-sidebar-group";
                containerGrupo.dataset.sidebarGroup = grupo.id;
                containerGrupo.dataset.sidebarGroupName = grupo.nome;

                containerGrupo.innerHTML = `
                    <div class="aura-sidebar-group-header" role="button" tabindex="0" aria-expanded="true">
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
                        conteudoGrupo.appendChild(botao);
                    }
                });

                if (conteudoGrupo.children.length > 0) {
                    areaGrupos.appendChild(containerGrupo);
                }

                const cabecalho = containerGrupo.querySelector(".aura-sidebar-group-header");

                function alternarGrupo() {
                    const recolhido = containerGrupo.classList.toggle("aura-sidebar-group-collapsed");
                    cabecalho.setAttribute("aria-expanded", String(!recolhido));
                    try {
                        localStorage.setItem(
                            "sidebarGrupo_" + grupo.id,
                            recolhido ? "fechado" : "aberto"
                        );
                    } catch (erro) {}
                }

                cabecalho.addEventListener("click", alternarGrupo);
                cabecalho.addEventListener("keydown", function(evento) {
                    if (evento.key === "Enter" || evento.key === " ") {
                        evento.preventDefault();
                        alternarGrupo();
                    }
                });

                try {
                    const estadoSalvo = localStorage.getItem("sidebarGrupo_" + grupo.id);
                    if (estadoSalvo === "fechado" && indiceGrupo !== 0) {
                        containerGrupo.classList.add("aura-sidebar-group-collapsed");
                        cabecalho.setAttribute("aria-expanded", "false");
                    }
                } catch (erro) {}
            });

            botoesExistentes.forEach(function(botao) {
                if (!botao.parentElement.classList.contains("aura-sidebar-group-content")) {
                    const primeiroGrupo = areaGrupos.querySelector(".aura-sidebar-group-content");
                    if (primeiroGrupo) primeiroGrupo.appendChild(botao);
                }
            });

            areaGrupos.querySelectorAll("button[data-target]").forEach(function(botao) {
                envolverRotuloBotao(botao);
                const nome = obterNomeBotao(botao);
                if (nome) {
                    const descricao = obterDescricaoBotao(botao, nome);
                    botao.removeAttribute("title");
                    botao.setAttribute("aria-label", nome + ". " + descricao);
                    botao.dataset.videTooltip = "true";
                }
            });
        }

        function inserirEstilosDock() {
            if (document.getElementById("vide-sidebar-dock-style")) return;

            const style = document.createElement("style");
            style.id = "vide-sidebar-dock-style";
            style.textContent = `
                #vide-command-center[hidden] { display: none !important; }
                #vide-command-center {
                    position: fixed;
                    inset: 0;
                    z-index: 220;
                    display: flex;
                    align-items: flex-start;
                    justify-content: center;
                    padding: min(11vh, 92px) 20px 24px;
                    background: rgba(1, 5, 16, .76);
                    backdrop-filter: blur(18px);
                    -webkit-backdrop-filter: blur(18px);
                }
                .vide-command-panel {
                    width: min(840px, 100%);
                    max-height: min(760px, 82vh);
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    border: 1px solid rgba(148, 163, 184, .2);
                    border-radius: 28px;
                    background:
                        radial-gradient(700px 260px at 10% 0%, color-mix(in srgb, var(--sys-primaria, #5b8cff) 16%, transparent), transparent 70%),
                        linear-gradient(145deg, rgba(17, 24, 39, .98), rgba(3, 7, 18, .98));
                    box-shadow: 0 34px 100px rgba(0, 0, 0, .58);
                }
                .vide-command-header {
                    padding: 22px 24px 18px;
                    border-bottom: 1px solid rgba(255, 255, 255, .08);
                }
                .vide-command-title-row {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 16px;
                    margin-bottom: 16px;
                }
                .vide-command-title-row strong {
                    display: block;
                    color: #fff;
                    font-size: 17px;
                    font-weight: 900;
                    letter-spacing: -.02em;
                }
                .vide-command-title-row small {
                    display: block;
                    margin-top: 3px;
                    color: #7f8ca5;
                    font-size: 11px;
                }
                .vide-command-close {
                    width: 38px;
                    height: 38px;
                    flex: 0 0 38px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    border: 1px solid rgba(255, 255, 255, .1);
                    border-radius: 12px;
                    color: #aeb8cb;
                    background: rgba(255, 255, 255, .04);
                    cursor: pointer;
                }
                .vide-command-close:hover { color: #fff; background: rgba(255,255,255,.08); }
                .vide-command-close svg { width: 18px; height: 18px; }
                .vide-command-search-shell {
                    min-height: 56px;
                    display: flex;
                    align-items: center;
                    gap: 13px;
                    padding: 0 16px;
                    border: 1px solid rgba(148, 163, 184, .16);
                    border-radius: 17px;
                    background: rgba(255, 255, 255, .045);
                    box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
                }
                .vide-command-search-shell:focus-within {
                    border-color: color-mix(in srgb, var(--sys-primaria, #5b8cff) 68%, white 8%);
                    box-shadow: 0 0 0 4px color-mix(in srgb, var(--sys-primaria, #5b8cff) 14%, transparent);
                }
                .vide-command-search-shell > svg { width: 20px; height: 20px; color: #7f8ca5; flex: 0 0 auto; }
                #vide-command-input {
                    width: 100%;
                    min-width: 0;
                    border: 0;
                    outline: 0;
                    color: #fff;
                    background: transparent;
                    font: inherit;
                    font-size: 14px;
                    font-weight: 700;
                }
                #vide-command-input::placeholder { color: #667085; }
                .vide-command-shortcut {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    color: #7f8ca5;
                    font-size: 10px;
                    font-weight: 800;
                    white-space: nowrap;
                }
                .vide-command-shortcut kbd {
                    min-width: 23px;
                    height: 23px;
                    padding: 0 6px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    border: 1px solid rgba(255, 255, 255, .11);
                    border-radius: 7px;
                    background: rgba(255,255,255,.05);
                }
                .vide-command-results {
                    padding: 14px;
                    overflow-y: auto;
                    overscroll-behavior: contain;
                    scrollbar-width: thin;
                    scrollbar-color: rgba(148,163,184,.3) transparent;
                }
                .vide-command-section + .vide-command-section { margin-top: 13px; }
                .vide-command-section-title {
                    padding: 7px 10px;
                    color: #64748b;
                    font-size: 9px;
                    font-weight: 900;
                    letter-spacing: .18em;
                    text-transform: uppercase;
                }
                .vide-command-item {
                    width: 100%;
                    min-height: 62px;
                    display: flex;
                    align-items: center;
                    gap: 13px;
                    padding: 10px 12px;
                    border: 1px solid transparent;
                    border-radius: 16px;
                    color: #b8c1d1;
                    background: transparent;
                    text-align: left;
                    cursor: pointer;
                    transition: background .15s ease, border-color .15s ease, color .15s ease, transform .15s ease;
                }
                .vide-command-item:hover,
                .vide-command-item.is-selected {
                    color: #fff;
                    border-color: color-mix(in srgb, var(--sys-primaria, #5b8cff) 32%, rgba(255,255,255,.1));
                    background: color-mix(in srgb, var(--sys-primaria, #5b8cff) 11%, rgba(255,255,255,.035));
                    transform: translateX(2px);
                }
                .vide-command-item-icon {
                    width: 40px;
                    height: 40px;
                    flex: 0 0 40px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    border: 1px solid rgba(255, 255, 255, .1);
                    border-radius: 13px;
                    color: var(--sys-primaria, #6d9cff);
                    background: rgba(255,255,255,.04);
                }
                .vide-command-item-icon svg { width: 19px; height: 19px; }
                .vide-command-item-copy { min-width: 0; flex: 1; }
                .vide-command-item-copy strong {
                    display: block;
                    overflow: hidden;
                    color: inherit;
                    font-size: 12px;
                    font-weight: 850;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .vide-command-item-copy small {
                    display: block;
                    margin-top: 4px;
                    overflow: hidden;
                    color: #718096;
                    font-size: 10px;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .vide-command-item-arrow { width: 17px; height: 17px; color: #536078; flex: 0 0 auto; }
                .vide-command-empty {
                    padding: 54px 20px;
                    color: #7f8ca5;
                    text-align: center;
                    font-size: 12px;
                }
                .vide-command-footer {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                    padding: 12px 20px;
                    border-top: 1px solid rgba(255,255,255,.07);
                    color: #667085;
                    font-size: 9px;
                    font-weight: 800;
                }

                @media (min-width: 768px) {
                    #admin-sidebar.vide-dock-sidebar {
                        --vide-rail-top: 12px;
                        position: relative !important;
                        width: 94px !important;
                        min-width: 94px !important;
                        max-width: 94px !important;
                        flex: 0 0 94px !important;
                        height: 100vh !important;
                        min-height: 100vh !important;
                        padding: 0 !important;
                        display: block !important;
                        overflow: visible !important;
                        border: 0 !important;
                        border-radius: 0 !important;
                        background: transparent !important;
                        box-shadow: none !important;
                        z-index: 82 !important;
                    }

                    #admin-sidebar.vide-dock-sidebar > .vide-dock-surface {
                        position: fixed !important;
                        top: var(--vide-rail-top) !important;
                        bottom: 12px !important;
                        left: 10px !important;
                        width: 74px !important;
                        min-width: 74px !important;
                        max-width: 74px !important;
                        height: auto !important;
                        min-height: 0 !important;
                        padding: 10px 8px !important;
                        box-sizing: border-box !important;
                        display: flex !important;
                        flex-direction: column !important;
                        justify-content: flex-start !important;
                        gap: 9px !important;
                        overflow: hidden !important;
                        overscroll-behavior: contain !important;
                        border: 1px solid rgba(148, 163, 184, .18) !important;
                        border-radius: 25px !important;
                        background:
                            radial-gradient(120px 170px at 50% -30px,
                                color-mix(in srgb, var(--sys-primaria, #ef334f) 22%, transparent),
                                transparent 72%),
                            linear-gradient(180deg, rgba(12, 22, 40, .985), rgba(3, 9, 21, .99)) !important;
                        box-shadow:
                            0 26px 64px rgba(0, 0, 0, .38),
                            inset 0 1px 0 rgba(255,255,255,.055) !important;
                        z-index: 82 !important;
                    }

                    #admin-sidebar .vide-dock-top {
                        width: 100% !important;
                        min-width: 0 !important;
                        min-height: 0 !important;
                        flex: 1 1 0 !important;
                        display: flex !important;
                        flex-direction: column !important;
                        gap: 8px !important;
                        margin: 0 !important;
                        overflow: hidden !important;
                    }

                    #admin-sidebar .vide-dock-top > :not([hidden]) ~ :not([hidden]) {
                        margin-top: 0 !important;
                    }

                    #admin-sidebar .vide-dock-brand {
                        width: 56px !important;
                        min-width: 56px !important;
                        height: 64px !important;
                        min-height: 64px !important;
                        margin: 0 auto !important;
                        padding: 4px !important;
                        flex: 0 0 64px !important;
                        display: flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        overflow: hidden !important;
                        border: 0 !important;
                        border-radius: 18px !important;
                        background: transparent !important;
                        box-shadow: none !important;
                    }

                    #admin-sidebar .vide-dock-brand::before,
                    #admin-sidebar .vide-dock-brand::after {
                        display: none !important;
                    }

                    #admin-sidebar .vide-dock-brand > .relative,
                    #admin-sidebar .vide-dock-brand > div,
                    #admin-sidebar .vide-dock-brand .flex {
                        width: 48px !important;
                        min-width: 48px !important;
                        max-width: 48px !important;
                        height: 48px !important;
                        min-height: 48px !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        gap: 0 !important;
                        display: flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                    }

                    #admin-sidebar #admin-logo-box {
                        width: 48px !important;
                        min-width: 48px !important;
                        max-width: 48px !important;
                        height: 48px !important;
                        min-height: 48px !important;
                        flex: 0 0 48px !important;
                        margin: 0 !important;
                        border-radius: 15px !important;
                        border-color: rgba(255,255,255,.18) !important;
                        box-shadow:
                            0 12px 28px color-mix(in srgb, var(--sys-primaria, #ef334f) 24%, transparent),
                            inset 0 1px 0 rgba(255,255,255,.16) !important;
                        cursor: default;
                    }

                    #admin-sidebar .vide-dock-brand-copy,
                    #admin-sidebar .vide-dock-workspace,
                    #admin-sidebar .aura-sidebar-navigation-header,
                    #admin-sidebar #box-atalho,
                    #admin-sidebar .aura-sidebar-group-header,
                    #admin-sidebar .vide-dock-label,
                    #admin-sidebar .aura-sidebar-account-text,
                    #admin-sidebar .aura-sidebar-account-arrow {
                        display: none !important;
                    }

                    #admin-sidebar #sidebar-nav {
                        position: relative !important;
                        display: block !important;
                        visibility: visible !important;
                        opacity: 1 !important;
                        width: 58px !important;
                        min-width: 58px !important;
                        max-width: 58px !important;
                        height: 0 !important;
                        min-height: 0 !important;
                        max-height: none !important;
                        flex: 1 1 0 !important;
                        margin: 0 auto !important;
                        padding: 0 5px 8px !important;
                        box-sizing: border-box !important;
                        overflow-x: hidden !important;
                        overflow-y: auto !important;
                        overscroll-behavior: contain !important;
                        touch-action: pan-y !important;
                        scrollbar-width: none !important;
                    }

                    #admin-sidebar #sidebar-nav::-webkit-scrollbar {
                        display: none !important;
                    }

                    #admin-sidebar .aura-sidebar-search {
                        position: relative !important;
                        width: 48px !important;
                        min-width: 48px !important;
                        max-width: 48px !important;
                        height: 48px !important;
                        min-height: 48px !important;
                        margin: 0 auto 8px !important;
                        padding: 0 !important;
                        display: flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        gap: 0 !important;
                        overflow: hidden !important;
                        border: 1px solid rgba(148,163,184,.14) !important;
                        border-radius: 15px !important;
                        color: #94a3b8 !important;
                        background: rgba(255,255,255,.035) !important;
                        cursor: pointer !important;
                        transition: border-color .16s ease, background .16s ease, color .16s ease, transform .16s ease !important;
                    }

                    #admin-sidebar .aura-sidebar-search:hover,
                    #admin-sidebar .aura-sidebar-search:focus-visible {
                        border-color: color-mix(in srgb, var(--sys-primaria, #ef334f) 38%, rgba(255,255,255,.12)) !important;
                        color: #fff !important;
                        background: color-mix(in srgb, var(--sys-primaria, #ef334f) 10%, rgba(255,255,255,.035)) !important;
                        transform: translateY(-1px) !important;
                        outline: none !important;
                    }

                    #admin-sidebar .aura-sidebar-search > svg {
                        width: 19px !important;
                        height: 19px !important;
                        min-width: 19px !important;
                        flex: 0 0 19px !important;
                        margin: 0 !important;
                    }

                    #admin-sidebar .aura-sidebar-search-editor,
                    #admin-sidebar .aura-sidebar-search kbd {
                        display: none !important;
                    }

                    #admin-sidebar .aura-sidebar-navigation-groups {
                        width: 48px !important;
                        min-width: 48px !important;
                        max-width: 48px !important;
                        margin: 0 auto !important;
                        padding: 0 !important;
                        display: flex !important;
                        flex-direction: column !important;
                        gap: 0 !important;
                        overflow: visible !important;
                    }

                    #admin-sidebar .aura-sidebar-group {
                        width: 48px !important;
                        min-width: 48px !important;
                        max-width: 48px !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        display: block !important;
                        overflow: visible !important;
                    }

                    #admin-sidebar .aura-sidebar-group + .aura-sidebar-group {
                        position: relative;
                        margin-top: 9px !important;
                        padding-top: 10px !important;
                    }

                    #admin-sidebar .aura-sidebar-group + .aura-sidebar-group::before {
                        content: "";
                        position: absolute;
                        top: 0;
                        left: 9px;
                        right: 9px;
                        height: 1px;
                        background: linear-gradient(90deg, transparent, rgba(148,163,184,.2), transparent);
                    }

                    #admin-sidebar .aura-sidebar-group-content,
                    #admin-sidebar .aura-sidebar-group-collapsed .aura-sidebar-group-content {
                        width: 48px !important;
                        min-width: 48px !important;
                        max-width: 48px !important;
                        max-height: none !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        display: flex !important;
                        flex-direction: column !important;
                        gap: 5px !important;
                        overflow: visible !important;
                        opacity: 1 !important;
                        visibility: visible !important;
                    }

                    #admin-sidebar .aura-sidebar-group-content > button[data-target] {
                        position: relative !important;
                        width: 48px !important;
                        min-width: 48px !important;
                        max-width: 48px !important;
                        height: 48px !important;
                        min-height: 48px !important;
                        max-height: 48px !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        display: flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        gap: 0 !important;
                        overflow: hidden !important;
                        border: 1px solid transparent !important;
                        border-radius: 15px !important;
                        color: #91a0b7 !important;
                        background: transparent !important;
                        box-shadow: none !important;
                        white-space: nowrap !important;
                        transform: none !important;
                        transition: color .16s ease, background .16s ease, border-color .16s ease, transform .16s ease, box-shadow .16s ease !important;
                    }

                    #admin-sidebar .aura-sidebar-group-content > button[data-target].hidden {
                        display: none !important;
                    }

                    #admin-sidebar .aura-sidebar-group-content > button[data-target] > svg {
                        width: 20px !important;
                        height: 20px !important;
                        min-width: 20px !important;
                        max-width: 20px !important;
                        flex: 0 0 20px !important;
                        margin: 0 !important;
                        stroke-width: 1.85 !important;
                        transform: none !important;
                    }

                    #admin-sidebar .aura-sidebar-group-content > button[data-target]:hover,
                    #admin-sidebar .aura-sidebar-group-content > button[data-target]:focus-visible {
                        border-color: rgba(148,163,184,.18) !important;
                        color: #fff !important;
                        background: rgba(255,255,255,.06) !important;
                        transform: translateY(-1px) !important;
                        outline: none !important;
                    }

                    #admin-sidebar .aura-sidebar-group-content > button[data-target].active {
                        border-color: color-mix(in srgb, var(--sys-primaria, #ef334f) 42%, rgba(255,255,255,.12)) !important;
                        color: color-mix(in srgb, var(--sys-primaria, #ef334f) 72%, white 28%) !important;
                        background:
                            linear-gradient(145deg,
                                color-mix(in srgb, var(--sys-primaria, #ef334f) 18%, transparent),
                                rgba(255,255,255,.035)) !important;
                        box-shadow:
                            inset 3px 0 0 var(--sys-primaria, #ef334f),
                            0 10px 24px color-mix(in srgb, var(--sys-primaria, #ef334f) 12%, transparent) !important;
                    }

                    #admin-sidebar .aura-sidebar-group-content > button[data-target].active::before {
                        content: "";
                        position: absolute;
                        right: 5px;
                        top: 5px;
                        width: 5px;
                        height: 5px;
                        border-radius: 50%;
                        background: currentColor;
                        box-shadow: 0 0 9px currentColor;
                    }

                    #admin-sidebar #box-logout {
                        width: 58px !important;
                        min-width: 58px !important;
                        margin: 0 auto !important;
                        padding: 9px 5px 0 !important;
                        flex: 0 0 auto !important;
                        border-top: 1px solid rgba(148,163,184,.13) !important;
                    }

                    #admin-sidebar .aura-sidebar-account-actions {
                        width: 48px !important;
                        min-width: 48px !important;
                        display: flex !important;
                        flex-direction: column !important;
                        align-items: center !important;
                        gap: 6px !important;
                    }

                    #admin-sidebar .aura-sidebar-account-button.hidden {
                        display: none !important;
                    }

                    #admin-sidebar .aura-sidebar-account-button,
                    #admin-sidebar .vide-rail-store-button {
                        position: relative !important;
                        width: 48px !important;
                        min-width: 48px !important;
                        max-width: 48px !important;
                        height: 46px !important;
                        min-height: 46px !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        display: flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        gap: 0 !important;
                        overflow: hidden !important;
                        border: 1px solid rgba(148,163,184,.13) !important;
                        border-radius: 14px !important;
                        color: #8491a6 !important;
                        background: rgba(255,255,255,.028) !important;
                        box-shadow: none !important;
                        transition: color .16s ease, border-color .16s ease, background .16s ease, transform .16s ease !important;
                    }

                    #admin-sidebar .aura-sidebar-account-button:hover,
                    #admin-sidebar .aura-sidebar-account-button:focus-visible,
                    #admin-sidebar .vide-rail-store-button:hover,
                    #admin-sidebar .vide-rail-store-button:focus-visible {
                        color: #fff !important;
                        border-color: rgba(148,163,184,.24) !important;
                        background: rgba(255,255,255,.065) !important;
                        transform: translateY(-1px) !important;
                        outline: none !important;
                    }

                    #admin-sidebar .aura-sidebar-account-icon,
                    #admin-sidebar .vide-rail-store-icon {
                        width: 20px !important;
                        min-width: 20px !important;
                        height: 20px !important;
                        display: flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                    }

                    #admin-sidebar .aura-sidebar-account-icon svg,
                    #admin-sidebar .vide-rail-store-icon svg {
                        width: 19px !important;
                        height: 19px !important;
                        stroke-width: 1.9 !important;
                    }

                    #admin-sidebar .vide-rail-store-button {
                        color: #38d9a9 !important;
                        cursor: pointer !important;
                    }

                    #admin-sidebar .vide-rail-store-status {
                        position: absolute;
                        top: 7px;
                        right: 7px;
                        width: 6px;
                        height: 6px;
                        border-radius: 50%;
                        background: #34d399;
                        box-shadow: 0 0 8px rgba(52,211,153,.75);
                    }

                    #vide-rail-tooltip {
                        position: fixed;
                        z-index: 2147483000;
                        width: max-content;
                        min-width: 218px;
                        max-width: 278px;
                        padding: 12px 14px;
                        pointer-events: none;
                        opacity: 0;
                        visibility: hidden;
                        transform: translateX(-7px) scale(.985);
                        transform-origin: left center;
                        border: 1px solid rgba(148,163,184,.2);
                        border-radius: 15px;
                        background:
                            radial-gradient(180px 90px at 0% 0%,
                                color-mix(in srgb, var(--sys-primaria, #ef334f) 14%, transparent),
                                transparent 74%),
                            rgba(5, 12, 26, .975);
                        box-shadow: 0 18px 50px rgba(0,0,0,.46), inset 0 1px 0 rgba(255,255,255,.05);
                        backdrop-filter: blur(14px);
                        -webkit-backdrop-filter: blur(14px);
                        transition: opacity .13s ease, transform .13s ease, visibility .13s ease;
                    }

                    #vide-rail-tooltip.is-visible {
                        opacity: 1;
                        visibility: visible;
                        transform: translateX(0) scale(1);
                    }

                    #vide-rail-tooltip .vide-rail-tooltip-group {
                        display: block;
                        margin-bottom: 5px;
                        color: color-mix(in srgb, var(--sys-primaria, #ef334f) 68%, white 32%);
                        font-size: 8px;
                        font-weight: 900;
                        letter-spacing: .14em;
                        text-transform: uppercase;
                    }

                    #vide-rail-tooltip strong {
                        display: block;
                        color: #f8fafc;
                        font-size: 12px;
                        font-weight: 900;
                        line-height: 1.25;
                        letter-spacing: -.01em;
                    }

                    #vide-rail-tooltip small {
                        display: block;
                        margin-top: 5px;
                        color: #8e9bb0;
                        font-size: 9px;
                        font-weight: 600;
                        line-height: 1.45;
                    }

                    #vide-rail-tooltip::before {
                        content: "";
                        position: absolute;
                        left: -5px;
                        top: calc(50% - 5px);
                        width: 10px;
                        height: 10px;
                        border-left: 1px solid rgba(148,163,184,.2);
                        border-bottom: 1px solid rgba(148,163,184,.2);
                        background: rgba(5,12,26,.98);
                        transform: rotate(45deg);
                    }
                }


                /* V3.4 — celular com "Site para computador" ativado */
                #vide-touch-sidebar-backdrop {
                    position: fixed;
                    inset: 0;
                    z-index: 81;
                    display: block;
                    border: 0;
                    opacity: 0;
                    visibility: hidden;
                    pointer-events: none;
                    background: rgba(0, 3, 10, .66);
                    backdrop-filter: blur(7px);
                    -webkit-backdrop-filter: blur(7px);
                    transition: opacity .2s ease, visibility .2s ease;
                }

                #vide-touch-sidebar-backdrop.is-visible {
                    opacity: 1;
                    visibility: visible;
                    pointer-events: auto;
                }

                #vide-touch-sidebar-toggle,
                #admin-sidebar .vide-rail-store-copy {
                    display: none;
                }

                @media (min-width: 768px) {
                    html.vide-touch-device #vide-rail-tooltip {
                        display: none !important;
                    }

                    html.vide-touch-device #admin-sidebar.vide-dock-sidebar .vide-dock-top {
                        min-height: 0 !important;
                    }

                    html.vide-touch-device #admin-sidebar.vide-dock-sidebar #sidebar-nav {
                        display: block !important;
                        visibility: visible !important;
                        opacity: 1 !important;
                        height: auto !important;
                        min-height: 150px !important;
                        flex: 1 1 auto !important;
                    }

                    html.vide-touch-device #vide-touch-sidebar-toggle {
                        width: 48px;
                        min-width: 48px;
                        height: 44px;
                        min-height: 44px;
                        margin: 0 auto 2px;
                        padding: 0;
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        flex: 0 0 44px;
                        border: 1px solid rgba(148, 163, 184, .16);
                        border-radius: 14px;
                        color: #aab5c8;
                        background: rgba(255, 255, 255, .04);
                        box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
                        cursor: pointer;
                        -webkit-tap-highlight-color: transparent;
                        touch-action: manipulation;
                    }

                    html.vide-touch-device #vide-touch-sidebar-toggle:active {
                        transform: scale(.97);
                    }

                    html.vide-touch-device #vide-touch-sidebar-toggle svg {
                        width: 20px;
                        height: 20px;
                        stroke-width: 2;
                    }

                    html.vide-touch-device #vide-touch-sidebar-toggle .vide-touch-close-icon {
                        display: none;
                    }

                    html.vide-touch-device #admin-sidebar.vide-touch-panel-open
                    #vide-touch-sidebar-toggle .vide-touch-menu-icon {
                        display: none;
                    }

                    html.vide-touch-device #admin-sidebar.vide-touch-panel-open
                    #vide-touch-sidebar-toggle .vide-touch-close-icon {
                        display: block;
                    }

                    html.vide-touch-device body.vide-touch-sidebar-lock {
                        overflow: hidden !important;
                        touch-action: none;
                    }

                    html.vide-touch-device #admin-sidebar.vide-touch-panel-open > .vide-dock-surface {
                        width: min(360px, calc(100vw - 22px)) !important;
                        min-width: min(360px, calc(100vw - 22px)) !important;
                        max-width: min(360px, calc(100vw - 22px)) !important;
                        padding: 14px 13px 12px !important;
                        gap: 11px !important;
                        overflow: hidden !important;
                        border-radius: 27px !important;
                        box-shadow:
                            0 34px 90px rgba(0, 0, 0, .62),
                            inset 0 1px 0 rgba(255,255,255,.07) !important;
                        z-index: 84 !important;
                    }

                    html.vide-touch-device #admin-sidebar.vide-touch-panel-open .vide-dock-top {
                        width: 100% !important;
                        gap: 10px !important;
                        overflow: hidden !important;
                    }

                    html.vide-touch-device #admin-sidebar.vide-touch-panel-open .vide-dock-brand {
                        position: relative !important;
                        width: 100% !important;
                        min-width: 0 !important;
                        height: auto !important;
                        min-height: 74px !important;
                        margin: 0 !important;
                        padding: 9px 58px 9px 9px !important;
                        justify-content: flex-start !important;
                        overflow: visible !important;
                        border: 1px solid rgba(148,163,184,.15) !important;
                        background: rgba(255,255,255,.035) !important;
                    }

                    html.vide-touch-device #admin-sidebar.vide-touch-panel-open .vide-dock-brand > .relative,
                    html.vide-touch-device #admin-sidebar.vide-touch-panel-open .vide-dock-brand > div,
                    html.vide-touch-device #admin-sidebar.vide-touch-panel-open .vide-dock-brand .flex {
                        width: 100% !important;
                        min-width: 0 !important;
                        max-width: none !important;
                        height: auto !important;
                        min-height: 54px !important;
                        justify-content: flex-start !important;
                        gap: 12px !important;
                    }

                    html.vide-touch-device #admin-sidebar.vide-touch-panel-open .vide-dock-brand-copy {
                        min-width: 0 !important;
                        display: block !important;
                    }

                    html.vide-touch-device #admin-sidebar.vide-touch-panel-open #vide-touch-sidebar-toggle {
                        position: absolute;
                        top: 22px;
                        right: 20px;
                        z-index: 3;
                        width: 42px;
                        min-width: 42px;
                        height: 42px;
                        min-height: 42px;
                        margin: 0;
                        color: #fff;
                        border-color: rgba(255,255,255,.18);
                        background: rgba(255,255,255,.07);
                    }

                    html.vide-touch-device #admin-sidebar.vide-touch-panel-open .vide-dock-workspace {
                        display: block !important;
                        width: 100% !important;
                        margin: 0 !important;
                        padding: 14px !important;
                        border-radius: 18px !important;
                    }

                    html.vide-touch-device #admin-sidebar.vide-touch-panel-open #sidebar-nav {
                        width: 100% !important;
                        min-width: 0 !important;
                        max-width: none !important;
                        height: auto !important;
                        min-height: 180px !important;
                        margin: 0 !important;
                        padding: 0 3px 10px !important;
                        flex: 1 1 auto !important;
                        overflow-x: hidden !important;
                        overflow-y: auto !important;
                        scrollbar-width: thin !important;
                        scrollbar-color: rgba(148,163,184,.28) transparent !important;
                    }

                    html.vide-touch-device #admin-sidebar.vide-touch-panel-open .aura-sidebar-navigation-header {
                        display: flex !important;
                        align-items: center !important;
                        justify-content: space-between !important;
                        gap: 12px !important;
                        margin: 4px 2px 10px !important;
                        padding: 0 4px !important;
                    }

                    html.vide-touch-device #admin-sidebar.vide-touch-panel-open .aura-sidebar-search {
                        width: 100% !important;
                        min-width: 0 !important;
                        max-width: none !important;
                        height: 50px !important;
                        min-height: 50px !important;
                        margin: 0 0 11px !important;
                        padding: 0 13px !important;
                        justify-content: flex-start !important;
                        gap: 11px !important;
                        overflow: hidden !important;
                    }

                    html.vide-touch-device #admin-sidebar.vide-touch-panel-open .aura-sidebar-search-editor {
                        min-width: 0 !important;
                        display: block !important;
                        flex: 1 1 auto !important;
                        overflow: hidden !important;
                        color: #d7deea !important;
                        font-size: 11px !important;
                        font-weight: 750 !important;
                        text-overflow: ellipsis !important;
                        white-space: nowrap !important;
                    }

                    html.vide-touch-device #admin-sidebar.vide-touch-panel-open .aura-sidebar-search kbd {
                        display: none !important;
                    }

                    html.vide-touch-device #admin-sidebar.vide-touch-panel-open .aura-sidebar-navigation-groups,
                    html.vide-touch-device #admin-sidebar.vide-touch-panel-open .aura-sidebar-group,
                    html.vide-touch-device #admin-sidebar.vide-touch-panel-open .aura-sidebar-group-content,
                    html.vide-touch-device #admin-sidebar.vide-touch-panel-open
                    .aura-sidebar-group-collapsed .aura-sidebar-group-content {
                        width: 100% !important;
                        min-width: 0 !important;
                        max-width: none !important;
                    }

                    html.vide-touch-device #admin-sidebar.vide-touch-panel-open .aura-sidebar-navigation-groups {
                        gap: 12px !important;
                    }

                    html.vide-touch-device #admin-sidebar.vide-touch-panel-open .aura-sidebar-group {
                        margin: 0 !important;
                        padding: 0 !important;
                    }

                    html.vide-touch-device #admin-sidebar.vide-touch-panel-open .aura-sidebar-group + .aura-sidebar-group {
                        margin-top: 0 !important;
                        padding-top: 12px !important;
                    }

                    html.vide-touch-device #admin-sidebar.vide-touch-panel-open .aura-sidebar-group-header {
                        display: flex !important;
                        align-items: center !important;
                        width: 100% !important;
                        min-height: 40px !important;
                        padding: 7px 8px !important;
                        border-radius: 13px !important;
                    }

                    html.vide-touch-device #admin-sidebar.vide-touch-panel-open .aura-sidebar-group-content,
                    html.vide-touch-device #admin-sidebar.vide-touch-panel-open
                    .aura-sidebar-group-collapsed .aura-sidebar-group-content {
                        max-height: none !important;
                        display: flex !important;
                        flex-direction: column !important;
                        gap: 5px !important;
                        overflow: visible !important;
                        opacity: 1 !important;
                        visibility: visible !important;
                    }

                    html.vide-touch-device #admin-sidebar.vide-touch-panel-open
                    .aura-sidebar-group-content > button[data-target] {
                        width: 100% !important;
                        min-width: 0 !important;
                        max-width: none !important;
                        height: auto !important;
                        min-height: 54px !important;
                        max-height: none !important;
                        padding: 8px 11px !important;
                        justify-content: flex-start !important;
                        gap: 12px !important;
                        overflow: visible !important;
                        border-radius: 15px !important;
                        text-align: left !important;
                    }

                    html.vide-touch-device #admin-sidebar.vide-touch-panel-open
                    .aura-sidebar-group-content > button[data-target] > svg {
                        width: 20px !important;
                        min-width: 20px !important;
                        height: 20px !important;
                        flex: 0 0 20px !important;
                    }

                    html.vide-touch-device #admin-sidebar.vide-touch-panel-open .vide-dock-label {
                        min-width: 0 !important;
                        display: flex !important;
                        flex: 1 1 auto !important;
                        flex-direction: column !important;
                        align-items: flex-start !important;
                        gap: 3px !important;
                        overflow: hidden !important;
                    }

                    html.vide-touch-device #admin-sidebar.vide-touch-panel-open #box-logout {
                        width: 100% !important;
                        min-width: 0 !important;
                        margin: 0 !important;
                        padding: 10px 3px 0 !important;
                    }

                    html.vide-touch-device #admin-sidebar.vide-touch-panel-open .aura-sidebar-account-actions {
                        width: 100% !important;
                        min-width: 0 !important;
                        align-items: stretch !important;
                        gap: 7px !important;
                    }

                    html.vide-touch-device #admin-sidebar.vide-touch-panel-open .aura-sidebar-account-button,
                    html.vide-touch-device #admin-sidebar.vide-touch-panel-open .vide-rail-store-button {
                        width: 100% !important;
                        min-width: 0 !important;
                        max-width: none !important;
                        height: auto !important;
                        min-height: 50px !important;
                        padding: 8px 11px !important;
                        justify-content: flex-start !important;
                        gap: 11px !important;
                        overflow: visible !important;
                        text-align: left !important;
                    }

                    html.vide-touch-device #admin-sidebar.vide-touch-panel-open .aura-sidebar-account-text,
                    html.vide-touch-device #admin-sidebar.vide-touch-panel-open .vide-rail-store-copy {
                        min-width: 0 !important;
                        display: flex !important;
                        flex: 1 1 auto !important;
                        flex-direction: column !important;
                        gap: 3px !important;
                    }

                    html.vide-touch-device #admin-sidebar.vide-touch-panel-open .aura-sidebar-account-arrow {
                        display: inline-flex !important;
                    }
                }

                @media (max-width: 767px) {
                    #admin-sidebar.vide-dock-sidebar {
                        position: relative !important;
                        inset: auto !important;
                        width: 100% !important;
                        min-width: 0 !important;
                        max-width: none !important;
                        height: auto !important;
                        min-height: 0 !important;
                        flex: 0 0 auto !important;
                        overflow: visible !important;
                    }
                    #admin-sidebar.vide-dock-sidebar > .vide-dock-surface {
                        position: relative !important;
                        inset: auto !important;
                        width: 100% !important;
                        height: auto !important;
                        padding: 20px !important;
                        overflow: visible !important;
                    }
                    #admin-sidebar .vide-dock-top { width: 100%; }
                    #admin-sidebar .vide-dock-label {
                        display: flex !important;
                        flex-direction: column;
                    }
                    #vide-rail-tooltip { display: none !important; }
                    #admin-sidebar .vide-rail-store-button { display: none !important; }
                    #admin-sidebar .aura-sidebar-search { cursor: pointer; }
                    #vide-command-center {
                        align-items: flex-end;
                        padding: 12px;
                    }
                    .vide-command-panel {
                        max-height: 88vh;
                        border-radius: 24px 24px 18px 18px;
                    }
                    .vide-command-header { padding: 18px 16px 14px; }
                    .vide-command-footer { display: none; }
                    .vide-command-shortcut { display: none; }
                }

                @media (prefers-reduced-motion: reduce) {
                    #admin-sidebar.vide-dock-sidebar,
                    #admin-sidebar.vide-dock-sidebar > .vide-dock-surface,
                    .vide-command-item,
                    .vide-dock-brand-copy,
                    .vide-dock-workspace,
                    .vide-dock-label,
                    .aura-sidebar-account-text {
                        transition: none !important;
                        animation: none !important;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        function prepararEstruturaDock() {
            inserirEstilosDock();
            sidebar.classList.add("vide-dock-sidebar");

            document.getElementById("vide-dock-spacer")?.remove();

            let superficie = sidebar.querySelector(":scope > .vide-dock-surface");
            if (!superficie) {
                superficie = document.createElement("div");
                superficie.className = "vide-dock-surface";

                while (sidebar.firstChild) {
                    superficie.appendChild(sidebar.firstChild);
                }

                sidebar.appendChild(superficie);
            }

            const topo = Array.from(superficie.children).find(function(filho) {
                return filho.tagName === "DIV" && filho.classList.contains("space-y-8");
            });

            if (topo) {
                topo.classList.add("vide-dock-top");
                const filhosDiv = Array.from(topo.children).filter(function(filho) {
                    return filho.tagName === "DIV";
                });
                const marca = filhosDiv[0];
                const workspace = filhosDiv[1];

                if (marca) {
                    marca.classList.add("vide-dock-brand");
                    const logo = marca.querySelector("#admin-logo-box");
                    const copia = logo && logo.parentElement
                        ? Array.from(logo.parentElement.children).find(function(item) {
                            return item !== logo && item.tagName === "DIV";
                        })
                        : null;
                    if (copia) copia.classList.add("vide-dock-brand-copy");
                }

                if (workspace) workspace.classList.add("vide-dock-workspace");
            }

            const buscaShell = campoBusca.closest(".aura-sidebar-search");
            campoBusca.setAttribute("contenteditable", "false");
            campoBusca.setAttribute("role", "button");
            campoBusca.setAttribute("tabindex", "0");
            campoBusca.setAttribute("aria-label", "Abrir central de comandos");
            campoBusca.textContent = "Pesquisar módulos e ações";

            if (buscaShell) {
                buscaShell.setAttribute("role", "button");
                buscaShell.setAttribute("tabindex", "0");
                buscaShell.setAttribute("aria-label", "Abrir central de comandos");
                buscaShell.title = "Central de comandos (Ctrl + K)";
            }

            const bannerMaster = document.getElementById("banner-modo-master");
            function atualizarTopoDock() {
                const masterVisivel = bannerMaster && !bannerMaster.classList.contains("hidden");
                sidebar.style.setProperty("--vide-rail-top", masterVisivel ? "46px" : "12px");
            }
            atualizarTopoDock();
            if (bannerMaster) {
                new MutationObserver(atualizarTopoDock).observe(bannerMaster, {
                    attributes: true,
                    attributeFilter: ["class"]
                });
            }
        }



        let botaoPainelToque = null;
        let fundoPainelToque = null;
        let overflowAntesPainelToque = "";

        function modoToqueDesktopAtivo() {
            return ambienteComToque && window.innerWidth >= 768;
        }

        function atualizarEstadoPainelToque(aberto) {
            if (!botaoPainelToque) return;
            botaoPainelToque.setAttribute("aria-expanded", String(aberto));
            botaoPainelToque.setAttribute(
                "aria-label",
                aberto ? "Fechar menu de módulos" : "Abrir menu de módulos"
            );
        }

        function abrirPainelToque() {
            if (!modoToqueDesktopAtivo()) return;
            esconderTooltipRail(true);
            overflowAntesPainelToque = document.body.style.overflow;
            sidebar.classList.add("vide-touch-panel-open");
            document.body.classList.add("vide-touch-sidebar-lock");
            if (fundoPainelToque) {
                fundoPainelToque.classList.add("is-visible");
                fundoPainelToque.setAttribute("aria-hidden", "false");
            }
            atualizarEstadoPainelToque(true);
        }

        function fecharPainelToque(restaurarFoco) {
            if (!sidebar.classList.contains("vide-touch-panel-open")) return;
            sidebar.classList.remove("vide-touch-panel-open");
            document.body.classList.remove("vide-touch-sidebar-lock");
            document.body.style.overflow = overflowAntesPainelToque;
            if (fundoPainelToque) {
                fundoPainelToque.classList.remove("is-visible");
                fundoPainelToque.setAttribute("aria-hidden", "true");
            }
            atualizarEstadoPainelToque(false);
            if (restaurarFoco !== false) botaoPainelToque?.focus();
        }

        function alternarPainelToque() {
            if (sidebar.classList.contains("vide-touch-panel-open")) {
                fecharPainelToque();
            } else {
                abrirPainelToque();
            }
        }

        function ativarPainelResponsivoPorToque() {
            if (!ambienteComToque) return;

            const topo = sidebar.querySelector(".vide-dock-top");
            if (!topo) return;

            botaoPainelToque = document.getElementById("vide-touch-sidebar-toggle");
            if (!botaoPainelToque) {
                botaoPainelToque = document.createElement("button");
                botaoPainelToque.type = "button";
                botaoPainelToque.id = "vide-touch-sidebar-toggle";
                botaoPainelToque.setAttribute("aria-controls", "sidebar-nav");
                botaoPainelToque.setAttribute("aria-expanded", "false");
                botaoPainelToque.setAttribute("aria-label", "Abrir menu de módulos");
                botaoPainelToque.innerHTML = `
                    <svg class="vide-touch-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                        <path d="M4 7h16M4 12h16M4 17h16"></path>
                    </svg>
                    <svg class="vide-touch-close-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                        <path d="M6 6l12 12M18 6 6 18"></path>
                    </svg>
                `;
                topo.insertBefore(botaoPainelToque, navegacao);
            }

            fundoPainelToque = document.getElementById("vide-touch-sidebar-backdrop");
            if (!fundoPainelToque) {
                fundoPainelToque = document.createElement("button");
                fundoPainelToque.type = "button";
                fundoPainelToque.id = "vide-touch-sidebar-backdrop";
                fundoPainelToque.setAttribute("aria-label", "Fechar menu lateral");
                fundoPainelToque.setAttribute("aria-hidden", "true");
                document.body.appendChild(fundoPainelToque);
            }

            botaoPainelToque.addEventListener("click", function(evento) {
                evento.preventDefault();
                evento.stopPropagation();
                alternarPainelToque();
            });

            fundoPainelToque.addEventListener("click", function() {
                fecharPainelToque(false);
            });

            const logo = document.getElementById("admin-logo-box");
            if (logo) {
                logo.setAttribute("role", "button");
                logo.setAttribute("tabindex", "0");
                logo.addEventListener("click", function() {
                    if (modoToqueDesktopAtivo()) alternarPainelToque();
                });
                logo.addEventListener("keydown", function(evento) {
                    if (!modoToqueDesktopAtivo()) return;
                    if (evento.key === "Enter" || evento.key === " ") {
                        evento.preventDefault();
                        alternarPainelToque();
                    }
                });
            }

            document.addEventListener("keydown", function(evento) {
                if (evento.key === "Escape" && sidebar.classList.contains("vide-touch-panel-open")) {
                    evento.preventDefault();
                    fecharPainelToque();
                }
            });

            window.addEventListener("resize", function() {
                if (!modoToqueDesktopAtivo()) fecharPainelToque(false);
            }, { passive: true });
        }

        let tooltipRail = null;
        let alvoTooltipRail = null;
        let timerTooltipRail = null;

        function criarAcaoRapidaLoja() {
            const acoes = document.querySelector(
                "#box-logout .aura-sidebar-account-actions"
            );
            if (!acoes || document.getElementById("vide-rail-store-button")) return;

            const botao = document.createElement("button");
            botao.type = "button";
            botao.id = "vide-rail-store-button";
            botao.className = "vide-rail-store-button";
            botao.dataset.videTooltip = "true";
            botao.dataset.moduleGroup = "Ação rápida";
            botao.dataset.moduleName = "Abrir loja pública";
            botao.dataset.moduleDescription = "Visualizar a vitrine como o cliente";
            botao.setAttribute(
                "aria-label",
                "Abrir loja pública. Visualizar a vitrine como o cliente"
            );
            botao.innerHTML = `
                <span class="vide-rail-store-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M14 3h7v7"></path>
                        <path d="m21 3-9 9"></path>
                        <path d="M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"></path>
                    </svg>
                </span>
                <span class="vide-rail-store-copy">
                    <strong>Abrir loja</strong>
                    <small>Visualizar a vitrine pública</small>
                </span>
                <span class="vide-rail-store-status" aria-hidden="true"></span>
            `;

            botao.addEventListener("click", function() {
                const link = document.getElementById("link-minha-loja-cockpit") ||
                    document.getElementById("link-minha-loja");
                if (!link || link.getAttribute("aria-disabled") === "true") return;
                link.click();
            });

            acoes.insertBefore(botao, acoes.firstChild);
        }

        function prepararMetadadosTooltips() {
            const buscaShell = campoBusca.closest(".aura-sidebar-search");
            if (buscaShell) {
                buscaShell.dataset.videTooltip = "true";
                buscaShell.dataset.moduleGroup = "Navegação";
                buscaShell.dataset.moduleName = "Central de comandos";
                buscaShell.dataset.moduleDescription = "Pesquisar módulos e ações com Ctrl + K";
                buscaShell.removeAttribute("title");
            }

            const logo = document.getElementById("admin-logo-box");
            if (logo) {
                logo.dataset.videTooltip = "true";
                logo.dataset.moduleGroup = "Vide Hub";
                logo.dataset.moduleName = "Central da empresa";
                logo.dataset.moduleDescription = "Navegação rápida pelos módulos da operação";
            }

            areaGrupos.querySelectorAll("button[data-target]").forEach(function(botao) {
                const nome = botao.dataset.moduleName || obterNomeBotao(botao);
                const descricao = botao.dataset.moduleDescription || obterDescricaoBotao(botao, nome);
                const grupo = botao.closest(".aura-sidebar-group")?.dataset.sidebarGroupName || "Módulo";

                botao.dataset.videTooltip = "true";
                botao.dataset.moduleName = nome;
                botao.dataset.moduleDescription = descricao;
                botao.dataset.moduleGroup = grupo;
                botao.removeAttribute("title");
            });

            document.querySelectorAll(
                "#box-logout .aura-sidebar-account-button"
            ).forEach(function(botao) {
                const titulo = botao.querySelector("strong")?.textContent?.trim() || "Ação da conta";
                const descricao = botao.querySelector("small")?.textContent?.trim() || "Gerenciar esta sessão";
                botao.dataset.videTooltip = "true";
                botao.dataset.moduleGroup = "Conta";
                botao.dataset.moduleName = titulo;
                botao.dataset.moduleDescription = descricao;
                botao.removeAttribute("title");
            });
        }

        function garantirTooltipRail() {
            if (tooltipRail) return tooltipRail;
            tooltipRail = document.createElement("div");
            tooltipRail.id = "vide-rail-tooltip";
            tooltipRail.setAttribute("role", "tooltip");
            tooltipRail.setAttribute("aria-hidden", "true");
            document.body.appendChild(tooltipRail);
            return tooltipRail;
        }

        function esconderTooltipRail(imediato) {
            if (timerTooltipRail) {
                window.clearTimeout(timerTooltipRail);
                timerTooltipRail = null;
            }
            alvoTooltipRail = null;
            if (!tooltipRail) return;

            const ocultar = function() {
                tooltipRail.classList.remove("is-visible");
                tooltipRail.setAttribute("aria-hidden", "true");
            };

            if (imediato) ocultar();
            else window.setTimeout(ocultar, 35);
        }

        function posicionarTooltipRail(alvo) {
            if (ambienteComToque) return;
            if (!tooltipRail || !alvo || window.innerWidth < 768) return;

            const caixa = alvo.getBoundingClientRect();
            const largura = tooltipRail.offsetWidth || 250;
            const altura = tooltipRail.offsetHeight || 74;
            const margem = 12;
            const esquerda = Math.min(
                window.innerWidth - largura - margem,
                Math.max(92, caixa.right + 13)
            );
            const topoIdeal = caixa.top + (caixa.height / 2) - (altura / 2);
            const topo = Math.min(
                window.innerHeight - altura - margem,
                Math.max(margem, topoIdeal)
            );

            tooltipRail.style.left = esquerda + "px";
            tooltipRail.style.top = topo + "px";
        }

        function mostrarTooltipRail(alvo) {
            if (ambienteComToque) return;
            if (!alvo || window.innerWidth < 768) return;
            if (!alvo.dataset.moduleName) return;

            if (timerTooltipRail) window.clearTimeout(timerTooltipRail);
            alvoTooltipRail = alvo;
            const tooltip = garantirTooltipRail();

            timerTooltipRail = window.setTimeout(function() {
                if (alvoTooltipRail !== alvo) return;

                tooltip.innerHTML = `
                    <span class="vide-rail-tooltip-group">${escaparHtml(alvo.dataset.moduleGroup || "Vide Hub")}</span>
                    <strong>${escaparHtml(alvo.dataset.moduleName || "Módulo")}</strong>
                    <small>${escaparHtml(alvo.dataset.moduleDescription || "Abrir este recurso")}</small>
                `;
                tooltip.classList.add("is-visible");
                tooltip.setAttribute("aria-hidden", "false");
                posicionarTooltipRail(alvo);
            }, 95);
        }

        function ativarTooltipsRail() {
            criarAcaoRapidaLoja();
            prepararMetadadosTooltips();
            garantirTooltipRail();

            sidebar.addEventListener("pointerover", function(evento) {
                const alvo = evento.target.closest('[data-vide-tooltip="true"]');
                if (!alvo || !sidebar.contains(alvo)) return;
                if (alvo.contains(evento.relatedTarget)) return;
                mostrarTooltipRail(alvo);
            });

            sidebar.addEventListener("pointerout", function(evento) {
                const alvo = evento.target.closest('[data-vide-tooltip="true"]');
                if (!alvo || !sidebar.contains(alvo)) return;
                if (alvo.contains(evento.relatedTarget)) return;
                esconderTooltipRail(false);
            });

            sidebar.addEventListener("focusin", function(evento) {
                const alvo = evento.target.closest('[data-vide-tooltip="true"]');
                if (alvo) mostrarTooltipRail(alvo);
            });

            sidebar.addEventListener("focusout", function(evento) {
                const alvo = evento.target.closest('[data-vide-tooltip="true"]');
                if (!alvo) return;
                if (alvo.contains(evento.relatedTarget)) return;
                esconderTooltipRail(false);
            });

            navegacao.addEventListener("scroll", function() {
                esconderTooltipRail(true);
            }, { passive: true });

            window.addEventListener("resize", function() {
                esconderTooltipRail(true);
            }, { passive: true });
        }

        let central = null;
        let inputCentral = null;
        let resultadosCentral = null;
        let itensSelecionaveis = [];
        let indiceSelecionado = 0;
        let elementoFocoAnterior = null;
        let overflowAnterior = "";

        function comandoEstaDisponivel(elemento) {
            if (!elemento) return false;
            if (elemento.classList.contains("hidden")) return false;
            if (elemento.getAttribute("aria-disabled") === "true") return false;
            return true;
        }

        function obterComandos() {
            const comandos = [];
            const alvosUsados = new Set();

            areaGrupos.querySelectorAll("button[data-target]").forEach(function(botao) {
                // Mantém o filtro de permissões explícito. Além de evitar que módulos
                // ocultos entrem na busca, este contrato é validado pela suíte do projeto.
                const botaoVisivelPorPermissao = !botao.classList.contains("hidden");
                if (!botaoVisivelPorPermissao || !comandoEstaDisponivel(botao)) return;

                const alvo = botao.getAttribute("data-target") || "";
                if (!alvo || alvosUsados.has(alvo)) return;
                alvosUsados.add(alvo);

                const grupo = botao.closest(".aura-sidebar-group");
                const nomeGrupo = grupo?.dataset.sidebarGroupName || "Módulos";
                const nome = obterNomeBotao(botao) || alvo.replace(/^view-/, "");
                const svg = botao.querySelector("svg");

                comandos.push({
                    id: alvo,
                    nome: nome,
                    descricao: obterDescricaoBotao(botao, nome),
                    grupo: nomeGrupo,
                    termos: normalizarTexto(nome + " " + alvo + " " + nomeGrupo),
                    icone: svg ? svg.outerHTML : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="4" y="4" width="16" height="16" rx="4"></rect></svg>',
                    executar: function() {
                        botao.click();
                    }
                });
            });

            const linkLoja = document.getElementById("link-minha-loja-cockpit") || document.getElementById("link-minha-loja");
            if (comandoEstaDisponivel(linkLoja) && linkLoja.getAttribute("href")) {
                comandos.push({
                    id: "acao-abrir-loja",
                    nome: "Abrir vitrine pública",
                    descricao: "Visualizar a loja como cliente",
                    grupo: "Ações rápidas",
                    termos: "abrir vitrine publica loja cliente visualizar",
                    icone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 3h7v7"></path><path d="m21 3-9 9"></path><path d="M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"></path></svg>',
                    executar: function() {
                        linkLoja.click();
                    }
                });
            }

            const botaoProduto = document.getElementById("btn-abrir-criacao");
            if (comandoEstaDisponivel(botaoProduto)) {
                comandos.push({
                    id: "acao-adicionar-produto",
                    nome: "Adicionar produto",
                    descricao: "Abrir o cadastro de um novo produto",
                    grupo: "Ações rápidas",
                    termos: "adicionar criar novo produto cadastro",
                    icone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 5v14M5 12h14"></path></svg>',
                    executar: function() {
                        botaoProduto.click();
                    }
                });
            }

            const botaoMaster = document.getElementById("btn-painel-master");
            if (comandoEstaDisponivel(botaoMaster)) {
                comandos.push({
                    id: "acao-painel-master",
                    nome: "Painel Master",
                    descricao: "Abrir a administração geral",
                    grupo: "Ações rápidas",
                    termos: "painel master administrador administracao geral",
                    icone: botaoMaster.querySelector("svg")?.outerHTML || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="15" cy="8" r="5"></circle><path d="m11.5 11.5-8 8"></path></svg>',
                    executar: function() {
                        botaoMaster.click();
                    }
                });
            }

            return comandos;
        }

        function criarCentralComandos() {
            central = document.createElement("div");
            central.id = "vide-command-center";
            central.hidden = true;
            central.setAttribute("role", "dialog");
            central.setAttribute("aria-modal", "true");
            central.setAttribute("aria-labelledby", "vide-command-title");
            central.innerHTML = `
                <div class="vide-command-panel">
                    <div class="vide-command-header">
                        <div class="vide-command-title-row">
                            <div>
                                <strong id="vide-command-title">Central de comandos</strong>
                                <small>Acesse módulos e ações sem percorrer o menu.</small>
                            </div>
                            <button type="button" class="vide-command-close" aria-label="Fechar central de comandos">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18"></path></svg>
                            </button>
                        </div>
                        <label class="vide-command-search-shell" for="vide-command-input">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.7-3.7"></path></svg>
                            <input id="vide-command-input" type="search" autocomplete="off" spellcheck="false" placeholder="Pesquisar módulo, ação ou recurso...">
                            <span class="vide-command-shortcut"><kbd>Ctrl</kbd><kbd>K</kbd></span>
                        </label>
                    </div>
                    <div id="vide-command-results" class="vide-command-results" role="listbox"></div>
                    <div class="vide-command-footer">
                        <span>↑ ↓ para navegar · Enter para abrir</span>
                        <span>Esc para fechar</span>
                    </div>
                </div>
            `;
            document.body.appendChild(central);

            inputCentral = central.querySelector("#vide-command-input");
            resultadosCentral = central.querySelector("#vide-command-results");

            central.querySelector(".vide-command-close").addEventListener("click", fecharCentral);
            central.addEventListener("mousedown", function(evento) {
                if (evento.target === central) fecharCentral();
            });
            inputCentral.addEventListener("input", renderizarResultados);
            inputCentral.addEventListener("keydown", tratarTeclasCentral);
        }

        function renderizarResultados() {
            const termo = normalizarTexto(inputCentral?.value || "");
            const comandos = obterComandos().filter(function(comando) {
                return termo === "" || comando.termos.includes(termo);
            });

            resultadosCentral.innerHTML = "";
            itensSelecionaveis = [];
            indiceSelecionado = 0;

            if (comandos.length === 0) {
                resultadosCentral.innerHTML = '<div class="vide-command-empty">Nenhum módulo ou ação encontrado.</div>';
                return;
            }

            const ordemGrupos = ["Ações rápidas", "Operação", "Crescimento", "Sistema", "Suporte", "Módulos"];
            const grupos = new Map();
            comandos.forEach(function(comando) {
                if (!grupos.has(comando.grupo)) grupos.set(comando.grupo, []);
                grupos.get(comando.grupo).push(comando);
            });

            Array.from(grupos.keys())
                .sort(function(a, b) {
                    const ia = ordemGrupos.indexOf(a);
                    const ib = ordemGrupos.indexOf(b);
                    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
                })
                .forEach(function(nomeGrupo) {
                    const secao = document.createElement("section");
                    secao.className = "vide-command-section";
                    secao.innerHTML = '<div class="vide-command-section-title">' + escaparHtml(nomeGrupo) + "</div>";

                    grupos.get(nomeGrupo).forEach(function(comando) {
                        const botao = document.createElement("button");
                        botao.type = "button";
                        botao.className = "vide-command-item";
                        botao.setAttribute("role", "option");
                        botao.setAttribute("aria-selected", "false");
                        botao.innerHTML = `
                            <span class="vide-command-item-icon">${comando.icone}</span>
                            <span class="vide-command-item-copy">
                                <strong>${escaparHtml(comando.nome)}</strong>
                                <small>${escaparHtml(comando.descricao)}</small>
                            </span>
                            <svg class="vide-command-item-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 6 6 6-6 6"></path></svg>
                        `;
                        botao.addEventListener("mouseenter", function() {
                            selecionarItem(itensSelecionaveis.indexOf(botao), false);
                        });
                        botao.addEventListener("click", function() {
                            fecharCentral();
                            window.setTimeout(comando.executar, 40);
                        });
                        secao.appendChild(botao);
                        itensSelecionaveis.push(botao);
                    });

                    resultadosCentral.appendChild(secao);
                });

            selecionarItem(0, false);
        }

        function selecionarItem(indice, rolar) {
            if (!itensSelecionaveis.length) return;
            indiceSelecionado = (indice + itensSelecionaveis.length) % itensSelecionaveis.length;
            itensSelecionaveis.forEach(function(item, indiceItem) {
                const selecionado = indiceItem === indiceSelecionado;
                item.classList.toggle("is-selected", selecionado);
                item.setAttribute("aria-selected", String(selecionado));
            });
            if (rolar !== false) {
                itensSelecionaveis[indiceSelecionado].scrollIntoView({ block: "nearest" });
            }
        }

        function tratarTeclasCentral(evento) {
            if (evento.key === "ArrowDown") {
                evento.preventDefault();
                selecionarItem(indiceSelecionado + 1, true);
            } else if (evento.key === "ArrowUp") {
                evento.preventDefault();
                selecionarItem(indiceSelecionado - 1, true);
            } else if (evento.key === "Enter" && itensSelecionaveis[indiceSelecionado]) {
                evento.preventDefault();
                itensSelecionaveis[indiceSelecionado].click();
            } else if (evento.key === "Escape") {
                evento.preventDefault();
                fecharCentral();
            }
        }

        function abrirCentral() {
            esconderTooltipRail(true);
            if (!central) criarCentralComandos();
            elementoFocoAnterior = document.activeElement;
            overflowAnterior = document.body.style.overflow;
            document.body.style.overflow = "hidden";
            central.hidden = false;
            sidebar.classList.add("vide-dock-open");
            inputCentral.value = "";
            renderizarResultados();
            window.setTimeout(function() {
                inputCentral.focus();
            }, 30);
        }

        function fecharCentral() {
            if (!central || central.hidden) return;
            central.hidden = true;
            document.body.style.overflow = overflowAnterior;
            sidebar.classList.remove("vide-dock-open");
            if (elementoFocoAnterior && typeof elementoFocoAnterior.focus === "function") {
                elementoFocoAnterior.focus();
            }
        }

        function ativarRolagemEstavel() {
            const superficie = sidebar.querySelector(":scope > .vide-dock-surface");
            if (!superficie || superficie.dataset.videWheelReady === "true") return;
            superficie.dataset.videWheelReady = "true";

            superficie.addEventListener("wheel", function(evento) {
                if (window.innerWidth < 768) return;
                if (central && !central.hidden) return;
                if (!Number.isFinite(evento.deltaY) || evento.deltaY === 0) return;

                const limite = Math.max(
                    0,
                    navegacao.scrollHeight - navegacao.clientHeight
                );

                if (limite <= 0) return;

                const anterior = navegacao.scrollTop;
                const proximo = Math.max(
                    0,
                    Math.min(limite, anterior + evento.deltaY)
                );

                if (proximo === anterior) return;

                navegacao.scrollTop = proximo;
                evento.preventDefault();
                evento.stopPropagation();
            }, { passive: false });
        }

        organizarGrupos();
        prepararEstruturaDock();
        ativarPainelResponsivoPorToque();
        ativarTooltipsRail();
        ativarRolagemEstavel();
        criarCentralComandos();

        const buscaShell = campoBusca.closest(".aura-sidebar-search");
        const gatilhoBusca = buscaShell || campoBusca;
        gatilhoBusca.addEventListener("click", function(evento) {
            evento.preventDefault();
            abrirCentral();
        });
        gatilhoBusca.addEventListener("keydown", function(evento) {
            if (evento.key === "Enter" || evento.key === " ") {
                evento.preventDefault();
                abrirCentral();
            }
        });

        document.addEventListener("keydown", function(evento) {
            const teclaK = String(evento.key || "").toLowerCase() === "k";
            if (teclaK && (evento.ctrlKey || evento.metaKey)) {
                evento.preventDefault();
                if (central && !central.hidden) fecharCentral();
                else abrirCentral();
                return;
            }

            if (evento.key === "Escape" && central && !central.hidden) {
                fecharCentral();
            }
        });

        areaGrupos.addEventListener("click", function(evento) {
            const botao = evento.target.closest("button[data-target]");
            if (!botao) return;
            esconderTooltipRail(true);
            if (modoToqueDesktopAtivo()) fecharPainelToque(false);
            if (window.innerWidth >= 768) sidebar.classList.remove("vide-dock-open");
        });

        function aplicarBusca() {
            if (central && !central.hidden) renderizarResultados();
        }

        window.abrirCentralComandosVide = abrirCentral;
        window.fecharCentralComandosVide = fecharCentral;
        window.atualizarBuscaSidebarModulos = aplicarBusca;

        if (estadoVazio) estadoVazio.classList.add("hidden");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", iniciar, { once: true });
    } else {
        iniciar();
    }
})();

