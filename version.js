window.VIDE_AURA_BUILD = Object.freeze({
    nome: "Vide Aura OS",
    versao: "3.1.0-dashboard-executivo",
    data: "2026-07-27",
    canal: "main"
});

/* =========================================================
   VIDE HUB — CARREGADOR DA VISÃO GERAL EXECUTIVA V1
   Mantém o código isolado dos arquivos legados do dashboard.
   ========================================================= */

(function carregarVisaoGeralExecutivaVideHub() {
    "use strict";

    if (window.__videDashboardExecutivoLoader) {
        return;
    }

    window.__videDashboardExecutivoLoader = true;

    function adicionarFolhaDeEstilo() {
        if (
            document.getElementById(
                "vide-dashboard-executivo-css"
            )
        ) {
            return;
        }

        var link =
            document.createElement("link");

        link.id =
            "vide-dashboard-executivo-css";

        link.rel =
            "stylesheet";

        link.href =
            "./dashboard-executive-v1.css?v=20260727-1";

        document.head.appendChild(link);
    }

    function adicionarControlador() {
        if (
            document.getElementById(
                "vide-dashboard-executivo-js"
            )
        ) {
            return;
        }

        var script =
            document.createElement("script");

        script.id =
            "vide-dashboard-executivo-js";

        script.src =
            "./dashboard-executive-v1.js?v=20260727-1";

        script.defer =
            true;

        script.onerror =
            function() {
                console.error(
                    "[Vide Hub] Não foi possível carregar a Visão Geral Executiva."
                );
            };

        document.head.appendChild(script);
    }

    function iniciar() {
        if (
            !document.getElementById(
                "view-dashboard"
            )
        ) {
            return;
        }

        adicionarFolhaDeEstilo();
        adicionarControlador();
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
