VIDE HUB — SIDEBAR PC V3.8 (DESKTOP EXPANSÍVEL MELHORADA)

OBJETIVO
- No PC, deixar a sidebar profissional, compacta por padrão e expansível ao passar o mouse.
- Não esmagar o conteúdo principal.
- Manter mobile estável.
- Preservar grupos recolhíveis, busca com Ctrl+K, permissões e módulos ocultos.
- Melhorar em relação ao modelo simples de rail com ícones soltos.

==================================================
1) ARQUIVO: foundation.css
AÇÃO: cole este bloco NO FINAL do arquivo.
==================================================

/* =========================================================
   VIDE HUB — SIDEBAR DESKTOP EXPANSÍVEL V3.8
   Cola no FINAL de foundation.css
   ========================================================= */

@media (min-width: 1024px) {
  #admin-body {
    align-items: stretch;
  }

  #admin-sidebar {
    width: 92px !important;
    min-width: 92px !important;
    max-width: 92px !important;
    padding: 14px 10px !important;
    transition:
      width .28s cubic-bezier(.22,1,.36,1),
      min-width .28s cubic-bezier(.22,1,.36,1),
      max-width .28s cubic-bezier(.22,1,.36,1),
      padding .28s cubic-bezier(.22,1,.36,1),
      box-shadow .28s ease,
      border-color .28s ease;
    overflow: hidden !important;
  }

  #admin-sidebar.vide-sidebar-expanded,
  #admin-sidebar.vide-sidebar-pinned {
    width: 318px !important;
    min-width: 318px !important;
    max-width: 318px !important;
    padding: 18px 16px !important;
  }

  #admin-sidebar::after {
    content: "";
    position: absolute;
    top: 18px;
    right: 0;
    bottom: 18px;
    width: 1px;
    background: linear-gradient(to bottom, transparent, rgba(255,255,255,.08), transparent);
    pointer-events: none;
    opacity: .8;
  }

  #admin-sidebar > div:first-child {
    gap: 14px !important;
  }

  /* Bloco superior */
  #admin-sidebar .relative.overflow-hidden.rounded-3xl {
    min-height: 78px;
    transition: min-height .25s ease, padding .25s ease, border-radius .25s ease;
  }

  #admin-sidebar:not(.vide-sidebar-expanded):not(.vide-sidebar-pinned) .relative.overflow-hidden.rounded-3xl {
    padding: 12px !important;
    border-radius: 24px !important;
    min-height: 86px;
  }

  #admin-sidebar:not(.vide-sidebar-expanded):not(.vide-sidebar-pinned) #admin-logo-box {
    width: 52px !important;
    height: 52px !important;
    min-width: 52px !important;
    margin: 0 auto;
    border-radius: 16px !important;
    font-size: 28px !important;
  }

  #admin-sidebar:not(.vide-sidebar-expanded):not(.vide-sidebar-pinned) .relative.overflow-hidden.rounded-3xl .flex.items-center.gap-4 {
    width: 100%;
    justify-content: center;
  }

  #admin-sidebar:not(.vide-sidebar-expanded):not(.vide-sidebar-pinned) .relative.overflow-hidden.rounded-3xl .flex.items-center.gap-4 > div:last-child,
  #admin-sidebar:not(.vide-sidebar-expanded):not(.vide-sidebar-pinned) .glass-card.rounded-2xl,
  #admin-sidebar:not(.vide-sidebar-expanded):not(.vide-sidebar-pinned) .aura-sidebar-navigation-header,
  #admin-sidebar:not(.vide-sidebar-expanded):not(.vide-sidebar-pinned) .aura-sidebar-search,
  #admin-sidebar:not(.vide-sidebar-expanded):not(.vide-sidebar-pinned) #box-atalho,
  #admin-sidebar:not(.vide-sidebar-expanded):not(.vide-sidebar-pinned) #box-logout {
    opacity: 0;
    transform: translateX(-8px);
    pointer-events: none;
  }

  #admin-sidebar.vide-sidebar-expanded .relative.overflow-hidden.rounded-3xl .flex.items-center.gap-4 > div:last-child,
  #admin-sidebar.vide-sidebar-pinned .relative.overflow-hidden.rounded-3xl .flex.items-center.gap-4 > div:last-child,
  #admin-sidebar.vide-sidebar-expanded .glass-card.rounded-2xl,
  #admin-sidebar.vide-sidebar-pinned .glass-card.rounded-2xl,
  #admin-sidebar.vide-sidebar-expanded .aura-sidebar-navigation-header,
  #admin-sidebar.vide-sidebar-pinned .aura-sidebar-navigation-header,
  #admin-sidebar.vide-sidebar-expanded .aura-sidebar-search,
  #admin-sidebar.vide-sidebar-pinned .aura-sidebar-search,
  #admin-sidebar.vide-sidebar-expanded #box-atalho,
  #admin-sidebar.vide-sidebar-pinned #box-atalho,
  #admin-sidebar.vide-sidebar-expanded #box-logout,
  #admin-sidebar.vide-sidebar-pinned #box-logout {
    opacity: 1;
    transform: translateX(0);
    pointer-events: auto;
  }

  #admin-sidebar .relative.overflow-hidden.rounded-3xl .flex.items-center.gap-4 > div:last-child,
  #admin-sidebar .glass-card.rounded-2xl,
  #admin-sidebar .aura-sidebar-navigation-header,
  #admin-sidebar .aura-sidebar-search,
  #admin-sidebar #box-atalho,
  #admin-sidebar #box-logout {
    transition: opacity .18s ease, transform .22s ease;
  }

  #admin-sidebar:not(.vide-sidebar-expanded):not(.vide-sidebar-pinned) #mobile-menu-toggle {
    display: none !important;
  }

  /* Navegação compacta */
  #admin-sidebar .aura-sidebar-navigation {
    padding-right: 4px !important;
  }

  #admin-sidebar:not(.vide-sidebar-expanded):not(.vide-sidebar-pinned) .aura-sidebar-navigation {
    padding: 0 2px 10px 2px !important;
    overflow-y: auto !important;
    min-height: 0 !important;
  }

  #admin-sidebar:not(.vide-sidebar-expanded):not(.vide-sidebar-pinned) .aura-sidebar-navigation-groups {
    gap: 10px !important;
  }

  #admin-sidebar:not(.vide-sidebar-expanded):not(.vide-sidebar-pinned) .aura-sidebar-group {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  #admin-sidebar:not(.vide-sidebar-expanded):not(.vide-sidebar-pinned) .aura-sidebar-group-header {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 56px;
    min-height: 56px;
    padding: 0 !important;
    border-radius: 18px !important;
    background: rgba(255,255,255,.025);
    border: 1px solid rgba(255,255,255,.06);
  }

  #admin-sidebar:not(.vide-sidebar-expanded):not(.vide-sidebar-pinned) .aura-sidebar-group-title {
    justify-content: center;
    gap: 0 !important;
    width: 100%;
  }

  #admin-sidebar:not(.vide-sidebar-expanded):not(.vide-sidebar-pinned) .aura-sidebar-group-title > span:last-child,
  #admin-sidebar:not(.vide-sidebar-expanded):not(.vide-sidebar-pinned) .aura-sidebar-group-chevron,
  #admin-sidebar:not(.vide-sidebar-expanded):not(.vide-sidebar-pinned) .aura-sidebar-navigation-empty {
    display: none !important;
  }

  #admin-sidebar:not(.vide-sidebar-expanded):not(.vide-sidebar-pinned) .aura-sidebar-group-icon {
    width: 26px !important;
    height: 26px !important;
    border: 0 !important;
    background: transparent !important;
    color: var(--aura-primary, var(--sys-primaria)) !important;
  }

  #admin-sidebar:not(.vide-sidebar-expanded):not(.vide-sidebar-pinned) .aura-sidebar-group-content {
    display: flex !important;
    flex-direction: column;
    gap: 8px;
    max-height: none !important;
    overflow: visible !important;
    padding: 8px 0 0 !important;
    opacity: 1 !important;
  }

  #admin-sidebar:not(.vide-sidebar-expanded):not(.vide-sidebar-pinned) .aura-sidebar-group-content > button {
    position: relative;
    width: 56px !important;
    min-width: 56px !important;
    min-height: 56px !important;
    padding: 0 !important;
    margin: 0 !important;
    justify-content: center !important;
    gap: 0 !important;
    border-radius: 18px !important;
    background: rgba(255,255,255,.03) !important;
    border: 1px solid rgba(255,255,255,.06) !important;
    overflow: visible;
  }

  #admin-sidebar:not(.vide-sidebar-expanded):not(.vide-sidebar-pinned) .aura-sidebar-group-content > button:hover {
    transform: translateX(0) scale(1.03) !important;
    background: rgba(255,255,255,.06) !important;
  }

  #admin-sidebar:not(.vide-sidebar-expanded):not(.vide-sidebar-pinned) .aura-sidebar-group-content > button svg {
    width: 19px !important;
    height: 19px !important;
  }

  #admin-sidebar:not(.vide-sidebar-expanded):not(.vide-sidebar-pinned) .aura-sidebar-group-content > button > span:not(.badge):not(.cadeado-badge),
  #admin-sidebar:not(.vide-sidebar-expanded):not(.vide-sidebar-pinned) .aura-sidebar-group-content > button > strong,
  #admin-sidebar:not(.vide-sidebar-expanded):not(.vide-sidebar-pinned) .aura-sidebar-group-content > button > small,
  #admin-sidebar:not(.vide-sidebar-expanded):not(.vide-sidebar-pinned) .vide-dock-label {
    display: none !important;
  }

  #admin-sidebar:not(.vide-sidebar-expanded):not(.vide-sidebar-pinned) .aura-sidebar-group-content > button::after {
    content: attr(data-module-name);
    position: absolute;
    left: calc(100% + 12px);
    top: 50%;
    transform: translateY(-50%) translateX(-6px);
    white-space: nowrap;
    background: rgba(24,24,31,.96);
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    line-height: 1;
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,.08);
    box-shadow: 0 16px 40px rgba(0,0,0,.35);
    opacity: 0;
    pointer-events: none;
    z-index: 25;
    transition: opacity .18s ease, transform .18s ease;
  }

  #admin-sidebar:not(.vide-sidebar-expanded):not(.vide-sidebar-pinned) .aura-sidebar-group-content > button:hover::after,
  #admin-sidebar:not(.vide-sidebar-expanded):not(.vide-sidebar-pinned) .aura-sidebar-group-content > button:focus-visible::after {
    opacity: 1;
    transform: translateY(-50%) translateX(0);
  }

  #admin-sidebar:not(.vide-sidebar-expanded):not(.vide-sidebar-pinned) .nav-item.active::before {
    left: auto !important;
    right: -6px !important;
    top: 16px !important;
    bottom: 16px !important;
  }

  /* Botão fixar */
  .vide-sidebar-pin-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,.08);
    background: rgba(255,255,255,.04);
    color: var(--aura-text-secondary, #d6d6dd);
    cursor: pointer;
    transition: all .2s ease;
  }

  .vide-sidebar-pin-button:hover {
    background: rgba(255,255,255,.08);
    color: #fff;
  }

  .vide-sidebar-pin-button svg {
    width: 15px;
    height: 15px;
    stroke-width: 2;
  }

  #admin-sidebar.vide-sidebar-pinned .vide-sidebar-pin-button {
    color: var(--sys-destaque) !important;
    border-color: color-mix(in srgb, var(--sys-destaque) 35%, rgba(255,255,255,.08));
    background: color-mix(in srgb, var(--sys-destaque) 14%, transparent);
  }
}

@media (max-width: 1023px) {
  #admin-sidebar,
  #admin-sidebar.vide-sidebar-expanded,
  #admin-sidebar.vide-sidebar-pinned {
    width: 100% !important;
    min-width: 100% !important;
    max-width: 100% !important;
  }

  .vide-sidebar-pin-button {
    display: none !important;
  }
}

==================================================
2) ARQUIVO: sidebar-navigation.js
AÇÃO: substitua TODO o conteúdo por este.
==================================================

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

==================================================
3) COMO FICA
==================================================

NO PC
- Menu começa compacto, bonito e funcional.
- Ao passar o mouse, ele abre completo.
- Pode fixar aberto pelo botão de pin no topo.
- Mostra tooltip dos módulos no modo compacto.
- Não destrói o conteúdo do dashboard.
- Mantém o card principal da loja, status e logout quando expandido.

NO CELULAR/TABLET
- Continua cheio, estável, sem rail estreito.

==================================================
4) DEPOIS DE COLAR
==================================================

- Salve os arquivos.
- Faça Ctrl + F5.
- Se continuar carregando antigo, abra em guia anônima.
