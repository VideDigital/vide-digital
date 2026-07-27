/**
 * Vide Hub — Sidebar V3.7 Estável
 *
 * Correção da V3.6:
 * - remove o rail estreito que ficou incompatível com o HTML/CSS atual;
 * - mantém a sidebar completa, legível e fixa no desktop;
 * - deixa somente a navegação com rolagem;
 * - preserva Status da loja, Painel Master e Sair da conta;
 * - usa drawer expansível no celular;
 * - mantém busca, grupos, permissões e atalhos existentes.
 *
 * Substitua TODO o conteúdo de sidebar-navigation.js por este arquivo.
 */
(function iniciarSidebarVideHubV37() {
    "use strict";

    const STYLE_ID = "vide-sidebar-v37-style";
    const READY_KEY = "videSidebarV37Ready";
    const MOBILE_CLASS = "vide-sidebar-mobile-open";

    const gruposConfig = [
        {
            id: "operacao",
            nome: "Operação",
            descricao: "Rotina da loja",
            icone: `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                    <rect x="3" y="3" width="7" height="7" rx="2"></rect>
                    <rect x="14" y="3" width="7" height="7" rx="2"></rect>
                    <rect x="3" y="14" width="7" height="7" rx="2"></rect>
                    <rect x="14" y="14" width="7" height="7" rx="2"></rect>
                </svg>
            `,
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
            icone: `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
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
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
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
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                    <path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H12v17H7.5A3.5 3.5 0 0 0 4 22V5.5Z"></path>
                    <path d="M20 5.5A3.5 3.5 0 0 0 16.5 2H12v17h4.5A3.5 3.5 0 0 1 20 22V5.5Z"></path>
                </svg>
            `,
            alvos: ["view-guia"]
        }
    ];

    const catalogoModulos = {
        "view-dashboard": ["Visão Geral", "Resumo da operação e indicadores"],
        "view-atendimento": ["Central de Atendimento", "Conversas e equipe em um só lugar"],
        "view-crm360": ["CRM 360 do Cliente", "Histórico completo de cada cliente"],
        "view-pedidos": ["Pedidos", "Vendas, pagamentos e entregas"],
        "view-leads": ["Leads", "Inbox, pipeline e agenda comercial"],
        "view-avaliacoes": ["Avaliações", "Reputação e feedback dos clientes"],
        "view-automacao-leads": ["Automação de Leads", "Regras, follow-ups e organização"],
        "view-central-ia": ["Central de IA", "Assistentes inteligentes do negócio"],
        "view-base-conhecimento": ["Base de Conhecimento", "Informações utilizadas pela IA"],
        "view-templates": ["Templates", "Modelos prontos para comunicação"],
        "view-campanhas": ["Campanhas", "Divulgação, links e rastreamento"],
        "view-landing-pages": ["Landing Pages", "Páginas de venda e captação"],
        "view-metricas": ["Métricas", "Desempenho, origem e conversão"],
        "view-perfil": ["Configurações da Loja", "Dados, identidade e funcionamento"],
        "view-dominios": ["Pixels & Domínio", "Domínio, SEO e rastreamento"],
        "view-notificacoes": ["Notificações", "Alertas e atualizações do sistema"],
        "view-personalizacao": ["Personalização Premium", "Cores, visual e experiência"],
        "view-funcionarios": ["Funcionários", "Equipe, acessos e permissões"],
        "view-guia": ["Guia do Plano", "Recursos, limites e orientações"]
    };

    function normalizarTexto(valor) {
        return String(valor || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim();
    }

    function inserirEstilos() {
        document.getElementById(STYLE_ID)?.remove();

        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            :root {
                --vide-sidebar-width: 320px;
                --vide-sidebar-gap: 14px;
                --vide-sidebar-bg: color-mix(in srgb, var(--sys-fundo, #0a0a0f) 88%, #111827 12%);
                --vide-sidebar-border: rgba(255, 255, 255, .09);
                --vide-sidebar-border-strong: rgba(255, 255, 255, .15);
                --vide-sidebar-surface: rgba(255, 255, 255, .038);
                --vide-sidebar-surface-hover: rgba(255, 255, 255, .065);
                --vide-sidebar-text: rgba(255, 255, 255, .94);
                --vide-sidebar-text-2: rgba(255, 255, 255, .67);
                --vide-sidebar-text-3: rgba(255, 255, 255, .42);
                --vide-sidebar-primary: var(--sys-primaria, #7c3aed);
                --vide-sidebar-accent: var(--sys-destaque, #ef334e);
            }

            @media (min-width: 768px) {
                body#admin-body {
                    display: grid !important;
                    grid-template-columns:
                        calc(var(--vide-sidebar-width) + var(--vide-sidebar-gap) * 2)
                        minmax(0, 1fr) !important;
                    align-items: stretch !important;
                }

                #admin-sidebar {
                    position: sticky !important;
                    top: var(--vide-sidebar-gap) !important;
                    width: var(--vide-sidebar-width) !important;
                    min-width: var(--vide-sidebar-width) !important;
                    max-width: var(--vide-sidebar-width) !important;
                    height: calc(100dvh - var(--vide-sidebar-gap) * 2) !important;
                    min-height: 0 !important;
                    margin: var(--vide-sidebar-gap) 0 var(--vide-sidebar-gap) var(--vide-sidebar-gap) !important;
                    padding: 18px !important;
                    display: flex !important;
                    flex-direction: column !important;
                    border-radius: 28px !important;
                    overflow: hidden !important;
                    isolation: isolate;
                    background:
                        radial-gradient(380px 190px at 50% -35px,
                            color-mix(in srgb, var(--vide-sidebar-accent) 20%, transparent),
                            transparent 68%),
                        linear-gradient(180deg,
                            color-mix(in srgb, var(--vide-sidebar-bg) 96%, white 4%),
                            var(--vide-sidebar-bg)) !important;
                    border: 1px solid var(--vide-sidebar-border) !important;
                    box-shadow:
                        0 30px 80px -46px rgba(0, 0, 0, .92),
                        inset 0 1px 0 rgba(255, 255, 255, .045) !important;
                }

                main {
                    min-width: 0 !important;
                    width: auto !important;
                    max-width: none !important;
                    height: 100dvh !important;
                    overflow-y: auto !important;
                }
            }

            #admin-sidebar::before {
                content: "";
                position: absolute;
                inset: 0;
                z-index: -1;
                pointer-events: none;
                background:
                    linear-gradient(180deg,
                        rgba(255, 255, 255, .025),
                        transparent 28%,
                        transparent 78%,
                        rgba(0, 0, 0, .13));
            }

            #admin-sidebar > div:first-child {
                display: flex !important;
                min-height: 0 !important;
                flex: 1 1 auto !important;
                flex-direction: column !important;
                gap: 14px !important;
            }

            #admin-sidebar > div:first-child > :not([hidden]) ~ :not([hidden]) {
                margin-top: 0 !important;
            }

            #admin-sidebar > div:first-child > * {
                margin-bottom: 0 !important;
            }

            #admin-sidebar > div:first-child > div:first-child {
                flex: 0 0 auto !important;
                padding: 16px !important;
                border-radius: 22px !important;
                border-color: var(--vide-sidebar-border) !important;
                background:
                    linear-gradient(145deg,
                        color-mix(in srgb, var(--vide-sidebar-accent) 14%, rgba(255, 255, 255, .055)),
                        rgba(255, 255, 255, .025)) !important;
            }

            #admin-sidebar > div:first-child > .glass-card {
                flex: 0 0 auto !important;
                padding: 14px !important;
                border-radius: 18px !important;
                background: var(--vide-sidebar-surface) !important;
                border-color: var(--vide-sidebar-border) !important;
            }

            #sidebar-nav {
                display: block !important;
                position: relative !important;
                flex: 1 1 auto !important;
                min-height: 130px !important;
                width: 100% !important;
                padding: 2px 5px 16px 2px !important;
                overflow-x: hidden !important;
                overflow-y: auto !important;
                overscroll-behavior: contain;
                scrollbar-gutter: stable;
                mask-image: linear-gradient(to bottom,
                    transparent 0,
                    black 9px,
                    black calc(100% - 14px),
                    transparent 100%);
                -webkit-mask-image: linear-gradient(to bottom,
                    transparent 0,
                    black 9px,
                    black calc(100% - 14px),
                    transparent 100%);
            }

            #sidebar-nav::-webkit-scrollbar {
                width: 5px;
            }

            #sidebar-nav::-webkit-scrollbar-track {
                background: transparent;
            }

            #sidebar-nav::-webkit-scrollbar-thumb {
                border-radius: 999px;
                background: rgba(255, 255, 255, .14);
            }

            #sidebar-nav::-webkit-scrollbar-thumb:hover {
                background: color-mix(in srgb, var(--vide-sidebar-primary) 44%, transparent);
            }

            .aura-sidebar-navigation-header {
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                gap: 12px !important;
                padding: 8px 8px 13px !important;
            }

            .aura-sidebar-navigation-header h3 {
                font-size: 13px !important;
                line-height: 1.2 !important;
            }

            .aura-sidebar-navigation-badge {
                min-width: 38px !important;
                height: 24px !important;
                padding: 0 9px !important;
                border-radius: 999px !important;
                color: var(--vide-sidebar-text-3) !important;
                border: 1px solid var(--vide-sidebar-border) !important;
                background: var(--vide-sidebar-surface) !important;
                font-size: 8px !important;
            }

            .aura-sidebar-search {
                display: flex !important;
                align-items: center !important;
                min-height: 44px !important;
                margin: 0 4px 14px !important;
                border: 1px solid var(--vide-sidebar-border) !important;
                border-radius: 14px !important;
                background: rgba(255, 255, 255, .032) !important;
            }

            .aura-sidebar-search:focus-within {
                border-color: color-mix(in srgb, var(--vide-sidebar-primary) 52%, transparent) !important;
                box-shadow: 0 0 0 3px color-mix(in srgb, var(--vide-sidebar-primary) 12%, transparent) !important;
            }

            .aura-sidebar-search-editor {
                min-height: 42px !important;
                color: var(--vide-sidebar-text) !important;
                font-size: 11px !important;
            }

            .aura-sidebar-navigation-groups {
                display: flex !important;
                flex-direction: column !important;
                gap: 9px !important;
                padding-bottom: 8px !important;
            }

            .aura-sidebar-group {
                display: block !important;
            }

            .aura-sidebar-group-header {
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                min-height: 42px !important;
                padding: 6px 7px !important;
                border-radius: 12px !important;
                cursor: pointer !important;
                user-select: none !important;
                transition: background .2s ease !important;
            }

            .aura-sidebar-group-header:hover,
            .aura-sidebar-group-header:focus-visible {
                background: rgba(255, 255, 255, .035) !important;
                outline: none !important;
            }

            .aura-sidebar-group-title {
                display: flex !important;
                align-items: center !important;
                gap: 10px !important;
                min-width: 0 !important;
            }

            .aura-sidebar-group-copy {
                display: flex !important;
                min-width: 0 !important;
                flex-direction: column !important;
            }

            .aura-sidebar-group-copy strong {
                color: var(--vide-sidebar-text-2) !important;
                font-size: 10px !important;
                line-height: 1.2 !important;
                font-weight: 850 !important;
                letter-spacing: .1em !important;
                text-transform: uppercase !important;
            }

            .aura-sidebar-group-copy small {
                margin-top: 2px !important;
                color: var(--vide-sidebar-text-3) !important;
                font-size: 8px !important;
                line-height: 1.2 !important;
            }

            .aura-sidebar-group-icon {
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                width: 30px !important;
                height: 30px !important;
                min-width: 30px !important;
                border-radius: 10px !important;
                color: var(--vide-sidebar-primary) !important;
                border: 1px solid color-mix(in srgb, var(--vide-sidebar-primary) 22%, transparent) !important;
                background: color-mix(in srgb, var(--vide-sidebar-primary) 8%, transparent) !important;
            }

            .aura-sidebar-group-icon svg {
                width: 15px !important;
                height: 15px !important;
                stroke-width: 1.8 !important;
                stroke-linecap: round;
                stroke-linejoin: round;
            }

            .aura-sidebar-group-chevron {
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                width: 25px !important;
                height: 25px !important;
                min-width: 25px !important;
                color: var(--vide-sidebar-text-3) !important;
                transition: transform .25s ease !important;
            }

            .aura-sidebar-group-chevron svg {
                width: 13px !important;
                height: 13px !important;
            }

            .aura-sidebar-group-content {
                display: block !important;
                max-height: 800px !important;
                padding: 2px 0 5px !important;
                overflow: hidden !important;
                opacity: 1 !important;
                transition: max-height .3s ease, opacity .2s ease, padding .3s ease !important;
            }

            .aura-sidebar-group.is-collapsed .aura-sidebar-group-content {
                max-height: 0 !important;
                padding-top: 0 !important;
                padding-bottom: 0 !important;
                opacity: 0 !important;
                pointer-events: none !important;
            }

            .aura-sidebar-group.is-collapsed .aura-sidebar-group-chevron {
                transform: rotate(-90deg) !important;
            }

            #admin-sidebar .vide-sidebar-item {
                display: grid !important;
                grid-template-columns: 36px minmax(0, 1fr) auto !important;
                align-items: center !important;
                gap: 10px !important;
                width: 100% !important;
                min-height: 54px !important;
                margin-top: 4px !important;
                padding: 8px 10px !important;
                border: 1px solid transparent !important;
                border-radius: 14px !important;
                color: var(--vide-sidebar-text-2) !important;
                background: transparent !important;
                text-align: left !important;
                transform: none !important;
                transition:
                    color .2s ease,
                    background .2s ease,
                    border-color .2s ease,
                    transform .2s ease !important;
            }

            #admin-sidebar .vide-sidebar-item:hover {
                color: var(--vide-sidebar-text) !important;
                background: var(--vide-sidebar-surface-hover) !important;
                border-color: var(--vide-sidebar-border) !important;
                transform: translateX(2px) !important;
            }

            #admin-sidebar .vide-sidebar-item.active {
                color: #fff !important;
                border-color: color-mix(in srgb, var(--vide-sidebar-accent) 35%, transparent) !important;
                background:
                    linear-gradient(90deg,
                        color-mix(in srgb, var(--vide-sidebar-accent) 17%, transparent),
                        color-mix(in srgb, var(--vide-sidebar-accent) 5%, transparent)) !important;
                box-shadow: 0 12px 28px -24px color-mix(in srgb, var(--vide-sidebar-accent) 80%, transparent) !important;
            }

            #admin-sidebar .vide-sidebar-item.active::before {
                content: "" !important;
                position: absolute !important;
                left: -3px !important;
                top: 14px !important;
                bottom: 14px !important;
                width: 3px !important;
                border-radius: 999px !important;
                background: var(--vide-sidebar-accent) !important;
                box-shadow: 0 0 12px color-mix(in srgb, var(--vide-sidebar-accent) 70%, transparent) !important;
            }

            #admin-sidebar .vide-sidebar-item > svg {
                width: 20px !important;
                height: 20px !important;
                margin: 0 auto !important;
                color: currentColor !important;
                stroke-width: 1.8 !important;
            }

            .vide-sidebar-label {
                display: flex !important;
                min-width: 0 !important;
                flex-direction: column !important;
            }

            .vide-sidebar-label strong {
                overflow: hidden !important;
                color: inherit !important;
                font-size: 12px !important;
                line-height: 1.25 !important;
                font-weight: 800 !important;
                text-overflow: ellipsis !important;
                white-space: nowrap !important;
            }

            .vide-sidebar-label small {
                margin-top: 3px !important;
                overflow: hidden !important;
                color: var(--vide-sidebar-text-3) !important;
                font-size: 8.5px !important;
                line-height: 1.25 !important;
                font-weight: 500 !important;
                text-overflow: ellipsis !important;
                white-space: nowrap !important;
            }

            #admin-sidebar .vide-sidebar-item.active .vide-sidebar-label small {
                color: rgba(255, 255, 255, .58) !important;
            }

            #admin-sidebar button.hidden,
            #admin-sidebar .hidden[data-target],
            #admin-sidebar [data-vide-search-hidden="true"] {
                display: none !important;
            }

            .aura-sidebar-group[data-vide-group-hidden="true"] {
                display: none !important;
            }

            #box-atalho,
            #box-logout {
                flex: 0 0 auto !important;
                min-width: 0 !important;
            }

            #box-atalho {
                padding: 0 !important;
                margin-top: 12px !important;
            }

            #box-logout {
                padding: 12px 0 0 !important;
                margin-top: 12px !important;
                border-top: 1px solid var(--vide-sidebar-border) !important;
            }

            #box-atalho .aura-store-status-card {
                padding: 14px !important;
                border-radius: 18px !important;
                border-color: var(--vide-sidebar-border) !important;
                background:
                    linear-gradient(145deg,
                        rgba(255, 255, 255, .047),
                        rgba(255, 255, 255, .022)) !important;
            }

            #box-logout .aura-sidebar-account-actions {
                gap: 7px !important;
            }

            #box-logout .aura-sidebar-account-button {
                min-height: 47px !important;
                border-radius: 13px !important;
            }

            @media (max-width: 767px) {
                body#admin-body {
                    display: block !important;
                    min-height: 100dvh !important;
                }

                #admin-sidebar {
                    position: sticky !important;
                    top: 0 !important;
                    z-index: 105 !important;
                    width: 100% !important;
                    min-width: 0 !important;
                    max-width: none !important;
                    height: auto !important;
                    max-height: 100dvh !important;
                    margin: 0 !important;
                    padding: 12px !important;
                    border: 0 !important;
                    border-bottom: 1px solid var(--vide-sidebar-border) !important;
                    border-radius: 0 0 22px 22px !important;
                    overflow-y: auto !important;
                    background: color-mix(in srgb, var(--sys-fundo, #08080d) 96%, #111827 4%) !important;
                    box-shadow: 0 20px 50px -35px rgba(0, 0, 0, .9) !important;
                }

                #admin-sidebar > div:first-child {
                    display: block !important;
                }

                #admin-sidebar > div:first-child > div:first-child {
                    padding: 12px !important;
                    border-radius: 17px !important;
                }

                #admin-sidebar:not(.${MOBILE_CLASS}) > div:first-child > .glass-card,
                #admin-sidebar:not(.${MOBILE_CLASS}) #sidebar-nav,
                #admin-sidebar:not(.${MOBILE_CLASS}) #box-atalho,
                #admin-sidebar:not(.${MOBILE_CLASS}) #box-logout {
                    display: none !important;
                }

                #admin-sidebar.${MOBILE_CLASS} > div:first-child > .glass-card {
                    display: block !important;
                    margin-top: 12px !important;
                }

                #admin-sidebar.${MOBILE_CLASS} #sidebar-nav {
                    display: block !important;
                    max-height: 55dvh !important;
                    min-height: 180px !important;
                    margin-top: 12px !important;
                    padding-right: 5px !important;
                    overflow-y: auto !important;
                    mask-image: none !important;
                    -webkit-mask-image: none !important;
                }

                #admin-sidebar.${MOBILE_CLASS} #box-atalho,
                #admin-sidebar.${MOBILE_CLASS} #box-logout {
                    display: block !important;
                }

                #admin-sidebar.${MOBILE_CLASS} #box-atalho {
                    margin-top: 12px !important;
                }

                main {
                    width: 100% !important;
                    min-width: 0 !important;
                    height: auto !important;
                    overflow: visible !important;
                }

                .aura-sidebar-navigation-header {
                    padding-top: 3px !important;
                }
            }
        `;

        document.head.appendChild(style);
    }

    function prepararBotao(botao) {
        const alvo = botao.getAttribute("data-target") || "";
        const dados = catalogoModulos[alvo] || [
            String(botao.textContent || "Módulo").replace(/\s+/g, " ").trim(),
            "Abrir módulo"
        ];

        botao.classList.add("vide-sidebar-item");
        botao.dataset.moduleName = dados[0];
        botao.dataset.moduleDescription = dados[1];
        botao.setAttribute("aria-label", `${dados[0]}. ${dados[1]}`);
        botao.title = `${dados[0]} — ${dados[1]}`;

        botao.querySelectorAll(
            ".vide-sidebar-label, .vide-dock-label, .vide-dock-description"
        ).forEach(function(elemento) {
            elemento.remove();
        });

        Array.from(botao.childNodes).forEach(function(no) {
            if (no.nodeType === Node.TEXT_NODE && no.textContent.trim()) {
                no.remove();
            }
        });

        const label = document.createElement("span");
        label.className = "vide-sidebar-label";

        const titulo = document.createElement("strong");
        titulo.textContent = dados[0];

        const descricao = document.createElement("small");
        descricao.textContent = dados[1];

        label.appendChild(titulo);
        label.appendChild(descricao);

        const icone = botao.querySelector(":scope > svg");
        if (icone) {
            icone.insertAdjacentElement("afterend", label);
        } else {
            botao.prepend(label);
        }
    }

    function criarGrupo(config) {
        const grupo = document.createElement("div");
        grupo.className = "aura-sidebar-group";
        grupo.dataset.sidebarGroup = config.id;

        grupo.innerHTML = `
            <div class="aura-sidebar-group-header"
                 role="button"
                 tabindex="0"
                 aria-expanded="true">
                <div class="aura-sidebar-group-title">
                    <span class="aura-sidebar-group-icon">${config.icone}</span>
                    <span class="aura-sidebar-group-copy">
                        <strong>${config.nome}</strong>
                        <small>${config.descricao}</small>
                    </span>
                </div>
                <span class="aura-sidebar-group-chevron">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                        <path d="m6 9 6 6 6-6"></path>
                    </svg>
                </span>
            </div>
            <div class="aura-sidebar-group-content"></div>
        `;

        return grupo;
    }

    function organizarGrupos(areaGrupos) {
        const botoes = Array.from(
            areaGrupos.querySelectorAll("button[data-target]")
        );

        botoes.forEach(prepararBotao);
        areaGrupos.innerHTML = "";

        const usados = new Set();

        gruposConfig.forEach(function(config) {
            const grupo = criarGrupo(config);
            const conteudo = grupo.querySelector(".aura-sidebar-group-content");

            config.alvos.forEach(function(alvo) {
                const botao = botoes.find(function(item) {
                    return item.getAttribute("data-target") === alvo;
                });

                if (botao) {
                    usados.add(botao);
                    conteudo.appendChild(botao);
                }
            });

            if (conteudo.children.length) {
                areaGrupos.appendChild(grupo);
            }
        });

        const restantes = botoes.filter(function(botao) {
            return !usados.has(botao);
        });

        if (restantes.length) {
            const grupoOutros = criarGrupo({
                id: "outros",
                nome: "Outros",
                descricao: "Mais recursos",
                icone: `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                        <circle cx="5" cy="12" r="1"></circle>
                        <circle cx="12" cy="12" r="1"></circle>
                        <circle cx="19" cy="12" r="1"></circle>
                    </svg>
                `
            });

            const conteudo = grupoOutros.querySelector(
                ".aura-sidebar-group-content"
            );

            restantes.forEach(function(botao) {
                conteudo.appendChild(botao);
            });

            areaGrupos.appendChild(grupoOutros);
        }
    }

    function configurarGrupos(areaGrupos) {
        areaGrupos.querySelectorAll(".aura-sidebar-group").forEach(
            function(grupo, indice) {
                const id = grupo.dataset.sidebarGroup || String(indice);
                const header = grupo.querySelector(".aura-sidebar-group-header");
                const chave = `videSidebarGrupo_${id}`;

                function aplicarEstado(recolhido, salvar) {
                    grupo.classList.toggle("is-collapsed", recolhido);
                    header?.setAttribute("aria-expanded", String(!recolhido));

                    if (salvar) {
                        try {
                            localStorage.setItem(
                                chave,
                                recolhido ? "fechado" : "aberto"
                            );
                        } catch (erro) {
                            // Preferência visual não deve interromper a navegação.
                        }
                    }
                }

                let recolhido = false;
                try {
                    recolhido = localStorage.getItem(chave) === "fechado";
                } catch (erro) {
                    recolhido = false;
                }

                aplicarEstado(recolhido, false);

                function alternar() {
                    aplicarEstado(!grupo.classList.contains("is-collapsed"), true);
                }

                header?.addEventListener("click", alternar);
                header?.addEventListener("keydown", function(evento) {
                    if (evento.key === "Enter" || evento.key === " ") {
                        evento.preventDefault();
                        alternar();
                    }
                });
            }
        );
    }

    function iniciar() {
        const sidebar = document.getElementById("admin-sidebar");
        const navegacao = document.getElementById("sidebar-nav");
        const areaGrupos = document.getElementById("sidebar-navigation-groups");
        const campoBusca = document.getElementById("busca-sidebar-modulos");
        const estadoVazio = document.getElementById("sidebar-navigation-empty");
        const mobileToggle = document.getElementById("mobile-menu-toggle");

        if (!sidebar || !navegacao || !areaGrupos || !campoBusca) {
            return;
        }

        if (sidebar.dataset[READY_KEY] === "true") {
            return;
        }

        sidebar.dataset[READY_KEY] = "true";

        document.documentElement.classList.remove(
            "vide-dock-open",
            "vide-dock-pinned",
            "vide-sidebar-open"
        );

        sidebar.classList.remove(
            "vide-dock-open",
            "vide-dock-pinned",
            "vide-sidebar-open",
            "vide-sidebar-expanded"
        );

        inserirEstilos();
        organizarGrupos(areaGrupos);
        configurarGrupos(areaGrupos);

        function botaoDisponivel(botao) {
            return !botao.classList.contains("hidden") &&
                botao.getAttribute("aria-hidden") !== "true";
        }

        function atualizarGruposVisiveis() {
            let total = 0;

            areaGrupos.querySelectorAll(".aura-sidebar-group").forEach(
                function(grupo) {
                    const botoes = Array.from(
                        grupo.querySelectorAll("button[data-target]")
                    );

                    const visiveis = botoes.filter(function(botao) {
                        return botaoDisponivel(botao) &&
                            botao.dataset.videSearchHidden !== "true";
                    });

                    grupo.dataset.videGroupHidden = String(!visiveis.length);
                    total += visiveis.length;
                }
            );

            estadoVazio?.classList.toggle("hidden", total > 0);
        }

        function aplicarBusca() {
            const termo = normalizarTexto(campoBusca.textContent);

            areaGrupos.querySelectorAll("button[data-target]").forEach(
                function(botao) {
                    const texto = normalizarTexto([
                        botao.dataset.moduleName,
                        botao.dataset.moduleDescription,
                        botao.getAttribute("data-target")
                    ].join(" "));

                    const esconder = Boolean(termo) && !texto.includes(termo);
                    botao.dataset.videSearchHidden = String(esconder);
                }
            );

            if (termo) {
                areaGrupos.querySelectorAll(".aura-sidebar-group").forEach(
                    function(grupo) {
                        grupo.classList.remove("is-collapsed");
                        grupo.querySelector(".aura-sidebar-group-header")
                            ?.setAttribute("aria-expanded", "true");
                    }
                );
            }

            atualizarGruposVisiveis();
        }

        function limparBusca() {
            campoBusca.textContent = "";
            aplicarBusca();
        }

        function definirMobileAberto(aberto) {
            sidebar.classList.toggle(MOBILE_CLASS, aberto);
            mobileToggle?.setAttribute("aria-expanded", String(aberto));
            mobileToggle?.setAttribute(
                "aria-label",
                aberto ? "Fechar menu" : "Abrir menu"
            );
        }

        campoBusca.addEventListener("input", aplicarBusca);

        mobileToggle?.addEventListener(
            "click",
            function(evento) {
                if (window.innerWidth >= 768) {
                    return;
                }

                evento.preventDefault();
                evento.stopImmediatePropagation();
                definirMobileAberto(!sidebar.classList.contains(MOBILE_CLASS));
            },
            true
        );

        areaGrupos.addEventListener("click", function(evento) {
            const botao = evento.target.closest("button[data-target]");
            if (botao && window.innerWidth < 768) {
                definirMobileAberto(false);
            }
        });

        document.addEventListener("keydown", function(evento) {
            const teclaK = String(evento.key || "").toLowerCase() === "k";

            if (teclaK && (evento.ctrlKey || evento.metaKey)) {
                evento.preventDefault();

                if (window.innerWidth < 768) {
                    definirMobileAberto(true);
                }

                window.setTimeout(function() {
                    campoBusca.focus();

                    const selecao = window.getSelection();
                    const intervalo = document.createRange();
                    intervalo.selectNodeContents(campoBusca);
                    selecao?.removeAllRanges();
                    selecao?.addRange(intervalo);
                }, 60);
            }

            if (
                evento.key === "Escape" &&
                document.activeElement === campoBusca
            ) {
                limparBusca();
                campoBusca.blur();
            }

            if (
                evento.key === "Escape" &&
                window.innerWidth < 768 &&
                sidebar.classList.contains(MOBILE_CLASS)
            ) {
                definirMobileAberto(false);
            }
        });

        window.addEventListener("resize", function() {
            if (window.innerWidth >= 768) {
                definirMobileAberto(false);
            }
        });

        const observer = new MutationObserver(function(mutacoes) {
            const alterouPermissao = mutacoes.some(function(mutacao) {
                return mutacao.type === "attributes" &&
                    ["class", "aria-hidden", "style"].includes(mutacao.attributeName);
            });

            if (alterouPermissao) {
                window.requestAnimationFrame(atualizarGruposVisiveis);
            }
        });

        areaGrupos.querySelectorAll("button[data-target]").forEach(
            function(botao) {
                observer.observe(botao, {
                    attributes: true,
                    attributeFilter: ["class", "aria-hidden", "style"]
                });
            }
        );

        window.atualizarBuscaSidebarModulos = aplicarBusca;
        window.limparBuscaSidebarModulos = limparBusca;

        limparBusca();
        definirMobileAberto(false);

        window.addEventListener("pageshow", function() {
            window.setTimeout(function() {
                limparBusca();
                atualizarGruposVisiveis();
            }, 80);
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", iniciar, { once: true });
    } else {
        iniciar();
    }
})();
