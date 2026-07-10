(function() {
    try {
        var chaveAlvo = new URLSearchParams(window.location.search).get("masterUID") || "own";
        var cache = JSON.parse(localStorage.getItem("ultimoPlanoFeatures_" + chaveAlvo) || "null");
        if (!cache) return;
        var bloqueiosPrecoces = { "view-templates": "templates", "view-campanhas": "campanhas", "view-metricas": "metricas", "view-pedidos": "hub", "view-funcionarios": "subcontas" };
        document.querySelectorAll("#sidebar-nav button[data-target]").forEach(function(btn) {
            var target = btn.getAttribute("data-target");
            var feature = bloqueiosPrecoces[target];
            if (feature && !cache.includes(feature)) btn.classList.add("opacity-40");
        });
    } catch(e) {}
})();
