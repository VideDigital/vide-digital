(function validarEstruturaVideAura(){
    function executar(){
        const ids = new Map();
        document.querySelectorAll("[id]").forEach(function(elemento){
            const id = elemento.id;
            if(!ids.has(id)) ids.set(id, []);
            ids.get(id).push(elemento);
        });
        const duplicados = [...ids.entries()].filter(([,elementos]) => elementos.length > 1).map(([id,elementos]) => ({id,total:elementos.length}));
        if(duplicados.length) console.warn("[Vide Aura] IDs duplicados detectados:", duplicados);
        window.VideAuraRuntime = Object.freeze({
            iniciadoEm: Date.now(),
            idsDuplicados: duplicados,
            build: window.VIDE_AURA_BUILD || null
        });
        document.documentElement.dataset.videAuraReady = "true";
    }
    if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", executar, {once:true}); else executar();
})();
