/**
 * Vide Hub — Sidebar V2.0
 * Dock compacto, expansão no hover, descrições por módulo e central de comandos.
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
                    if (botao) conteudoGrupo.appendChild(botao);
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
                    botao.title = nome;
                    botao.setAttribute("aria-label", nome);
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
                        --vide-dock-top: 12px;
                        position: relative !important;
                        width: 96px !important;
                        min-width: 96px !important;
                        max-width: 96px !important;
                        flex: 0 0 96px !important;
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
                        top: var(--vide-dock-top) !important;
                        bottom: 12px !important;
                        left: 12px !important;
                        width: 72px !important;
                        height: auto !important;
                        min-height: 0 !important;
                        padding: 10px !important;
                        box-sizing: border-box !important;
                        display: flex !important;
                        flex-direction: column !important;
                        justify-content: flex-start !important;
                        gap: 10px !important;
                        overflow: hidden !important;
                        border: 1px solid rgba(148, 163, 184, .17) !important;
                        border-radius: 27px !important;
                        background:
                            linear-gradient(180deg, rgba(13, 24, 45, .97), rgba(3, 10, 24, .985)) !important;
                        box-shadow: 0 28px 70px rgba(0, 0, 0, .36), inset 0 1px 0 rgba(255,255,255,.05) !important;
                        transition: width .28s cubic-bezier(.2,.8,.2,1), box-shadow .28s ease, border-color .28s ease !important;
                        z-index: 82 !important;
                    }
                    #admin-sidebar.vide-dock-sidebar:hover > .vide-dock-surface,
                    #admin-sidebar.vide-dock-sidebar:focus-within > .vide-dock-surface,
                    #admin-sidebar.vide-dock-sidebar.vide-dock-open > .vide-dock-surface {
                        width: 300px !important;
                        border-color: rgba(148, 163, 184, .28) !important;
                        box-shadow: 0 32px 90px rgba(0, 0, 0, .5), inset 0 1px 0 rgba(255,255,255,.06) !important;
                    }
                    #admin-sidebar .vide-dock-top {
                        min-height: 0;
                        flex: 1 1 auto;
                        display: flex;
                        flex-direction: column;
                        gap: 12px !important;
                        margin: 0 !important;
                    }
                    #admin-sidebar .vide-dock-brand {
                        min-height: 70px;
                        margin: 0 !important;
                        padding: 10px !important;
                        flex: 0 0 auto;
                        border-radius: 20px !important;
                        overflow: hidden !important;
                    }
                    #admin-sidebar .vide-dock-brand > .relative {
                        min-width: 260px;
                    }
                    #admin-sidebar #admin-logo-box {
                        width: 48px !important;
                        height: 48px !important;
                        flex: 0 0 48px !important;
                        border-radius: 15px !important;
                    }
                    #admin-sidebar .vide-dock-brand-copy {
                        min-width: 150px;
                        transition: opacity .18s ease, transform .22s ease;
                    }
                    #admin-sidebar .vide-dock-workspace {
                        margin: 0 !important;
                        padding: 14px !important;
                        flex: 0 0 auto;
                        transition: opacity .18s ease, transform .22s ease;
                    }
                    #admin-sidebar #sidebar-nav {
                        display: block !important;
                        min-height: 0 !important;
                        flex: 1 1 auto !important;
                        margin: 0 !important;
                        padding: 0 2px 4px !important;
                        overflow-x: hidden !important;
                        overflow-y: auto !important;
                        scrollbar-width: thin;
                        scrollbar-color: rgba(148, 163, 184, .24) transparent;
                    }
                    #admin-sidebar #sidebar-nav::-webkit-scrollbar { width: 4px; }
                    #admin-sidebar #sidebar-nav::-webkit-scrollbar-thumb { background: rgba(148,163,184,.25); border-radius: 999px; }
                    #admin-sidebar .aura-sidebar-navigation-header {
                        margin: 2px 2px 10px !important;
                        transition: opacity .18s ease;
                    }
                    #admin-sidebar .aura-sidebar-search {
                        width: 100%;
                        min-height: 46px;
                        margin: 0 0 10px !important;
                        padding: 0 12px !important;
                        display: flex !important;
                        align-items: center !important;
                        gap: 10px !important;
                        overflow: hidden;
                        cursor: pointer;
                        transition: width .22s ease, background .18s ease, border-color .18s ease;
                    }
                    #admin-sidebar .aura-sidebar-search:hover {
                        border-color: color-mix(in srgb, var(--sys-primaria, #5b8cff) 38%, rgba(255,255,255,.1));
                        background: rgba(255,255,255,.06);
                    }
                    #admin-sidebar .aura-sidebar-search > svg { width: 19px !important; height: 19px !important; flex: 0 0 19px; }
                    #admin-sidebar .aura-sidebar-search-editor {
                        min-width: 0;
                        flex: 1;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                        user-select: none;
                        cursor: pointer;
                    }
                    #admin-sidebar .aura-sidebar-search kbd {
                        margin-left: auto;
                        flex: 0 0 auto;
                    }
                    #admin-sidebar .aura-sidebar-navigation-groups {
                        display: flex;
                        flex-direction: column;
                        gap: 8px;
                    }
                    #admin-sidebar .aura-sidebar-group { margin: 0 !important; }
                    #admin-sidebar .aura-sidebar-group-header {
                        min-height: 42px;
                        margin: 0 0 5px !important;
                        padding: 7px 9px !important;
                        border-radius: 13px !important;
                    }
                    #admin-sidebar .aura-sidebar-group-content {
                        display: flex;
                        flex-direction: column;
                        gap: 4px;
                    }
                    #admin-sidebar .aura-sidebar-group-content > button[data-target] {
                        width: 100% !important;
                        min-height: 54px !important;
                        margin: 0 !important;
                        padding: 0 12px !important;
                        display: flex !important;
                        align-items: center !important;
                        justify-content: flex-start !important;
                        gap: 12px !important;
                        overflow: hidden !important;
                        border: 1px solid transparent;
                        border-radius: 14px !important;
                        white-space: nowrap;
                    }
                    #admin-sidebar .aura-sidebar-group-content > button[data-target].hidden {
                        display: none !important;
                    }
                    #admin-sidebar .aura-sidebar-group-content > button[data-target] > svg {
                        width: 19px !important;
                        height: 19px !important;
                        min-width: 19px !important;
                        flex: 0 0 19px !important;
                    }
                    #admin-sidebar .vide-dock-label {
                        min-width: 0;
                        overflow: hidden;
                        flex: 1;
                        display: flex;
                        flex-direction: column;
                        align-items: flex-start;
                        justify-content: center;
                        opacity: 1;
                        color: inherit;
                        white-space: nowrap;
                        transition: opacity .16s ease, transform .2s ease;
                    }
                    #admin-sidebar .vide-dock-label strong {
                        display: block;
                        max-width: 100%;
                        overflow: hidden;
                        color: inherit;
                        font-size: 11px;
                        font-weight: 800;
                        line-height: 1.2;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                    }
                    #admin-sidebar .vide-dock-label small {
                        display: block;
                        max-width: 100%;
                        margin-top: 3px;
                        overflow: hidden;
                        color: rgba(148, 163, 184, .78);
                        font-size: 8px;
                        font-weight: 650;
                        line-height: 1.25;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                    }
                    #admin-sidebar .aura-sidebar-group-content > button[data-target] {
                        position: relative;
                    }
                    #admin-sidebar .aura-sidebar-group-content > button[data-target]:hover {
                        border-color: rgba(148, 163, 184, .16) !important;
                        background: rgba(255,255,255,.055) !important;
                        color: #fff !important;
                    }
                    #admin-sidebar .aura-sidebar-group-content > button[data-target].active {
                        border-color:
                            color-mix(
                                in srgb,
                                var(--sys-destaque, #5b8cff) 34%,
                                transparent
                            ) !important;
                        background:
                            linear-gradient(
                                135deg,
                                color-mix(
                                    in srgb,
                                    var(--sys-destaque, #5b8cff) 16%,
                                    transparent
                                ),
                                rgba(255,255,255,.035)
                            ) !important;
                        color: #fff !important;
                        box-shadow:
                            inset 3px 0 0
                            var(--sys-destaque, #5b8cff);
                    }
                    #admin-sidebar .aura-sidebar-group-content > button[data-target].active
                    .vide-dock-label small {
                        color: rgba(226, 232, 240, .8);
                    }
                    #admin-sidebar .aura-sidebar-group-content > button[data-target]
                    .aura-leads-v6-navigation-badge {
                        flex: 0 0 auto;
                        margin-left: auto;
                    }
                    #admin-sidebar #box-atalho {
                        flex: 0 0 auto;
                        margin: 0 !important;
                        padding: 0 !important;
                        transition: opacity .18s ease, transform .22s ease;
                    }
                    #admin-sidebar #box-logout {
                        flex: 0 0 auto;
                        margin: auto 0 0 !important;
                        padding: 8px 0 0 !important;
                    }
                    #admin-sidebar .aura-sidebar-account-actions { gap: 6px !important; }
                    #admin-sidebar .aura-sidebar-account-button {
                        min-height: 46px;
                        padding: 8px 10px !important;
                        overflow: hidden;
                    }
                    #admin-sidebar .aura-sidebar-account-icon {
                        width: 30px !important;
                        height: 30px !important;
                        flex: 0 0 30px !important;
                    }
                    #admin-sidebar .aura-sidebar-account-text {
                        min-width: 150px;
                        transition: opacity .16s ease, transform .2s ease;
                    }
                    #admin-sidebar:not(:hover):not(:focus-within):not(.vide-dock-open) .vide-dock-brand-copy,
                    #admin-sidebar:not(:hover):not(:focus-within):not(.vide-dock-open) .vide-dock-workspace,
                    #admin-sidebar:not(:hover):not(:focus-within):not(.vide-dock-open) .aura-sidebar-navigation-header,
                    #admin-sidebar:not(:hover):not(:focus-within):not(.vide-dock-open) .aura-sidebar-group-header,
                    #admin-sidebar:not(:hover):not(:focus-within):not(.vide-dock-open) .vide-dock-label,
                    #admin-sidebar:not(:hover):not(:focus-within):not(.vide-dock-open) .aura-sidebar-search-editor,
                    #admin-sidebar:not(:hover):not(:focus-within):not(.vide-dock-open) .aura-sidebar-search kbd,
                    #admin-sidebar:not(:hover):not(:focus-within):not(.vide-dock-open) #box-atalho,
                    #admin-sidebar:not(:hover):not(:focus-within):not(.vide-dock-open) .aura-sidebar-account-text,
                    #admin-sidebar:not(:hover):not(:focus-within):not(.vide-dock-open) .aura-sidebar-account-arrow {
                        display: none !important;
                    }
                    #admin-sidebar:not(:hover):not(:focus-within):not(.vide-dock-open) .vide-dock-brand {
                        width: 52px !important;
                        min-height: 62px !important;
                        padding: 6px !important;
                        align-self: center;
                    }
                    #admin-sidebar:not(:hover):not(:focus-within):not(.vide-dock-open) .vide-dock-brand > .relative {
                        min-width: 48px !important;
                        justify-content: center !important;
                    }
                    #admin-sidebar:not(:hover):not(:focus-within):not(.vide-dock-open) .aura-sidebar-search {
                        width: 48px !important;
                        height: 48px !important;
                        min-height: 48px !important;
                        margin-left: auto !important;
                        margin-right: auto !important;
                        padding: 0 !important;
                        justify-content: center !important;
                        border-radius: 15px !important;
                    }
                    #admin-sidebar:not(:hover):not(:focus-within):not(.vide-dock-open) .aura-sidebar-navigation-groups {
                        gap: 4px !important;
                    }
                    #admin-sidebar:not(:hover):not(:focus-within):not(.vide-dock-open) .aura-sidebar-group-collapsed .aura-sidebar-group-content {
                        display: flex !important;
                        max-height: none !important;
                        opacity: 1 !important;
                        visibility: visible !important;
                    }
                    #admin-sidebar:not(:hover):not(:focus-within):not(.vide-dock-open)
                    .aura-sidebar-group-content > button[data-target]::after {
                        content: attr(data-module-name);
                        position: fixed;
                        left: 88px;
                        z-index: 2147482000;
                        max-width: 240px;
                        padding: 8px 10px;
                        border: 1px solid rgba(148,163,184,.18);
                        border-radius: 10px;
                        background: rgba(7, 14, 29, .98);
                        box-shadow: 0 14px 36px rgba(0,0,0,.38);
                        color: #f8fafc;
                        font-size: 10px;
                        font-weight: 800;
                        line-height: 1.2;
                        opacity: 0;
                        pointer-events: none;
                        transform: translateX(-5px);
                        transition: opacity .14s ease, transform .14s ease;
                        white-space: nowrap;
                    }
                    #admin-sidebar:not(:hover):not(:focus-within):not(.vide-dock-open)
                    .aura-sidebar-group-content > button[data-target]:hover::after {
                        opacity: 1;
                        transform: translateX(0);
                    }
                    #admin-sidebar:not(:hover):not(:focus-within):not(.vide-dock-open) .aura-sidebar-group-content > button[data-target] {
                        width: 48px !important;
                        min-width: 48px !important;
                        height: 48px !important;
                        min-height: 48px !important;
                        margin-left: auto !important;
                        margin-right: auto !important;
                        padding: 0 !important;
                        justify-content: center !important;
                        gap: 0 !important;
                        border-radius: 15px !important;
                    }
                    #admin-sidebar:not(:hover):not(:focus-within):not(.vide-dock-open) .aura-sidebar-account-actions {
                        align-items: center;
                    }
                    #admin-sidebar:not(:hover):not(:focus-within):not(.vide-dock-open) .aura-sidebar-account-button {
                        width: 48px !important;
                        min-width: 48px !important;
                        height: 46px !important;
                        padding: 7px !important;
                        justify-content: center !important;
                    }
                    #admin-sidebar:not(:hover):not(:focus-within):not(.vide-dock-open) #box-logout {
                        width: 52px;
                        align-self: center;
                    }
                    #admin-sidebar.vide-dock-sidebar:hover .vide-dock-brand-copy,
                    #admin-sidebar.vide-dock-sidebar:focus-within .vide-dock-brand-copy,
                    #admin-sidebar.vide-dock-sidebar.vide-dock-open .vide-dock-brand-copy,
                    #admin-sidebar.vide-dock-sidebar:hover .vide-dock-workspace,
                    #admin-sidebar.vide-dock-sidebar:focus-within .vide-dock-workspace,
                    #admin-sidebar.vide-dock-sidebar.vide-dock-open .vide-dock-workspace {
                        animation: videDockReveal .22s ease both;
                    }
                    @keyframes videDockReveal {
                        from { opacity: 0; transform: translateX(-8px); }
                        to { opacity: 1; transform: translateX(0); }
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
                    #admin-sidebar .vide-dock-label { display: inline !important; }
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
                sidebar.style.setProperty("--vide-dock-top", masterVisivel ? "46px" : "12px");
            }
            atualizarTopoDock();
            if (bannerMaster) {
                new MutationObserver(atualizarTopoDock).observe(bannerMaster, {
                    attributes: true,
                    attributeFilter: ["class"]
                });
            }
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
                if (!comandoEstaDisponivel(botao)) return;

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

        organizarGrupos();
        prepararEstruturaDock();
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
            if (window.innerWidth >= 768) sidebar.classList.remove("vide-dock-open");
        });

        window.abrirCentralComandosVide = abrirCentral;
        window.fecharCentralComandosVide = fecharCentral;
        window.atualizarBuscaSidebarModulos = function() {
            if (central && !central.hidden) renderizarResultados();
        };

        if (estadoVazio) estadoVazio.classList.add("hidden");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", iniciar, { once: true });
    } else {
        iniciar();
    }
})();
