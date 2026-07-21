(function () {
  "use strict";

  // Todos os arquivos do Editor de Landing Pages (Aura Studio). A ordem importa:
  // cada geração (Pro, MAX, Ultimate, V4...) envolve/estende funções globais
  // definidas pela anterior (ex.: salvarEditorLP, renderizarEditorBlocos).
  // Antes esses scripts carregavam de forma fixa em toda página do painel;
  // agora só carregam quando o dono da loja realmente abre o editor.
  // Scripts cuja falha de carregamento não deve derrubar o restante da fila:
  // o registro é uma fundação opcional (lp-public-v4.js e a Fase 2 já tratam
  // sua ausência), então uma falha aqui não pode impedir Pro/MAX/Ultimate/V4
  // de carregar.
  const OPTIONAL_SCRIPTS = new Set([
    "./studio-block-registry.js",
    "./studio-canonical-renderers-v1.js",
    "./studio-library-v2-adapter.js",
    "./studio-library-v2.js?v=203"
  ]);

  // A integração local opta pela V2. Definir explicitamente como false antes
  // de abrir o Studio restaura a biblioteca anterior sem alterar dados.
  if (typeof window.AURA_STUDIO_LIBRARY_V2_ENABLED === "undefined") {
    window.AURA_STUDIO_LIBRARY_V2_ENABLED = true;
  }

  const STUDIO_SCRIPTS = [
    "./studio-block-registry.js",
    "./studio-library.js",
    "./studio-max-library.js",
    "./studio-inspector.js",
    "./studio-pro.js?v=203",
    "./studio-desktop-shell-v1.js?v=100",
    "./studio-max-media.js",
    "./studio-max.js",
    "./studio-ultimate-library.js",
    "./studio-ultimate-assets.js",
    "./studio-ultimate.js",
    "./studio-device-hotfix.js",
    "./studio-blocks-v4.js",
    "./studio-history-v4.js",
    "./studio-responsive-v4.js",
    "./studio-components-v4.js",
    "./studio-canvas-v4.js",
    "./studio-library-clean-v53.js?v=530",
    "./studio-canonical-renderers-v1.js",
    "./studio-library-v2-adapter.js",
    "./studio-library-v2.js?v=203",
    "./studio-guide.js"
  ];

  let loadingPromise = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Falha ao carregar " + src));
      document.head.appendChild(script);
    });
  }

  const yieldToBrowser = () => new Promise((resolve) => setTimeout(resolve, 0));

  window.carregarEditorLandingPages = function () {
    if (!loadingPromise) {
      loadingPromise = (async () => {
        for (const src of STUDIO_SCRIPTS) {
          try {
            await loadScript(src);
          } catch (err) {
            if (!OPTIONAL_SCRIPTS.has(src)) throw err;
            console.warn("[Studio Loader] " + err.message + " — seguindo sem esse recurso opcional.");
          }
          // Dá um respiro pro navegador entre cada geração (MutationObservers,
          // timers de inicialização) em vez de injetar as 17 de uma vez só.
          await yieldToBrowser();
        }
      })();
    }
    return loadingPromise;
  };
})();
