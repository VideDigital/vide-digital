window.VIDE_AURA_BUILD = Object.freeze({
    nome: "Vide Aura OS",
    versao: "3.3.0-pedidos-executivos",
    data: "2026-07-27",
    canal: "main"
});

/* =========================================================
   VIDE HUB — CARREGADOR DE CAMADAS MODULARES
   ========================================================= */

(function carregarCamadasModularesVideHub() {
    "use strict";

    if (window.__videCamadasModularesLoader) {
        return;
    }

    window.__videCamadasModularesLoader = true;

    function adicionarCSS(id, caminho) {
        if (document.getElementById(id)) {
            return;
        }

        var link =
            document.createElement("link");

        link.id = id;
        link.rel = "stylesheet";
        link.href = caminho;

        document.head.appendChild(link);
    }

    function adicionarJS(
        id,
        caminho,
        mensagemErro
    ) {
        if (document.getElementById(id)) {
            return;
        }

        var script =
            document.createElement("script");

        script.id = id;
        script.src = caminho;
        script.defer = true;

        script.onerror = function() {
            console.error(
                mensagemErro
            );
        };

        document.head.appendChild(
            script
        );
    }

    function carregarDashboardExecutivo() {
        if (
            !document.getElementById(
                "view-dashboard"
            )
        ) {
            return;
        }

        adicionarCSS(
            "vide-dashboard-executivo-css",
            "./dashboard-executive-v1.css?v=20260727-1"
        );

        adicionarJS(
            "vide-dashboard-executivo-js",
            "./dashboard-executive-v1.js?v=20260727-1",
            "[Vide Hub] Não foi possível carregar a Visão Geral Executiva."
        );
    }

    function carregarConfiguracoesExecutivas() {
        if (
            !document.getElementById(
                "view-perfil"
            )
        ) {
            return;
        }

        adicionarCSS(
            "vide-store-settings-executive-css",
            "./store-settings-executive-v1.css?v=20260727-1"
        );

        adicionarJS(
            "vide-store-settings-executive-js",
            "./store-settings-executive-v1.js?v=20260727-1",
            "[Vide Hub] Não foi possível carregar o Painel Executivo de Configurações."
        );
    }

    function carregarPedidosExecutivos() {
        if (
            !document.getElementById(
                "view-pedidos"
            )
        ) {
            return;
        }

        adicionarCSS(
            "vide-orders-executive-css",
            "./orders-executive-v1.css?v=20260727-1"
        );

        adicionarJS(
            "vide-orders-executive-js",
            "./orders-executive-v1.js?v=20260727-1",
            "[Vide Hub] Não foi possível carregar os Pedidos Executivos."
        );
    }

    function carregarIdentidadeCompactaSidebar() {
        if (
            !document.getElementById(
                "admin-sidebar"
            )
        ) {
            return;
        }

        adicionarCSS(
            "vide-sidebar-identity-compact-css",
            "./sidebar-identity-compact-v1.css?v=20260728-5"
        );
    }

    function carregarLarguraDesktopSidebar() {
        if (
            !document.getElementById(
                "admin-sidebar"
            )
        ) {
            return;
        }

        adicionarCSS(
            "vide-sidebar-desktop-width-css",
            "./sidebar-desktop-width-v1.css?v=20260728-1"
        );
    }

    function iniciar() {
        carregarDashboardExecutivo();
        carregarConfiguracoesExecutivas();
        carregarPedidosExecutivos();
        carregarIdentidadeCompactaSidebar();
        carregarLarguraDesktopSidebar();
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
