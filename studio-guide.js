(function () {
  "use strict";

  const STORAGE_KEY = "auraStudioGuideDismissed";
  let injected = false;

  const STEPS = [
    { titulo: "Adicionar blocos", texto: "Clique em “Adicionar Novo Bloco”, na barra lateral, para escolher entre texto, formulário, galeria, FAQ e outros modelos prontos." },
    { titulo: "Ver em desktop ou celular", texto: "Os ícones de computador e celular, no topo, mostram como a página fica em cada tamanho de tela." },
    { titulo: "Organizar com Camadas", texto: "O botão Camadas (atalho Alt+1) mostra todos os blocos da página numa lista, útil para reordenar ou selecionar rapidamente." },
    { titulo: "Desfazer sem medo", texto: "Ctrl+Z desfaz e Ctrl+Y refaz qualquer alteração — experimente à vontade." },
    { titulo: "Salvar vs. Publicar", texto: "Salvar guarda um rascunho só seu. Publicar coloca a página no ar, no link mostrado acima do rascunho." },
    { titulo: "Ferramentas avançadas", texto: "Modelos prontos por nicho, temas de cores, editor de imagem e histórico de versões aparecem no topo assim que o editor termina de carregar (poucos segundos)." }
  ];

  function escapeHTML(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function buildPanel() {
    const panel = document.createElement("div");
    panel.id = "aura-guide-panel";
    panel.className = "hidden fixed right-4 top-20 z-[135] w-80 max-h-[70vh] overflow-y-auto bg-[#14132B] border border-white/10 rounded-2xl shadow-2xl";
    panel.innerHTML =
      '<div class="flex items-center justify-between px-4 py-3 border-b border-white/5 sticky top-0 bg-[#14132B]">' +
        '<p class="text-xs font-bold text-white">Guia rápido</p>' +
        '<button id="aura-guide-close" class="text-gray-400 hover:text-white text-sm leading-none">×</button>' +
      '</div>' +
      '<div class="p-4 space-y-4">' +
        STEPS.map(function (step, i) {
          return (
            '<div class="flex gap-3">' +
              '<span class="shrink-0 w-6 h-6 rounded-full bg-violet-500/15 text-violet-300 text-[11px] font-black flex items-center justify-center">' + (i + 1) + '</span>' +
              '<div>' +
                '<p class="text-xs font-bold text-white">' + escapeHTML(step.titulo) + '</p>' +
                '<p class="text-[11px] text-gray-400 mt-1 leading-5">' + escapeHTML(step.texto) + '</p>' +
              '</div>' +
            '</div>'
          );
        }).join("") +
      '</div>' +
      '<div class="px-4 pb-4">' +
        '<button id="aura-guide-dismiss" class="w-full py-2.5 rounded-xl border border-white/10 bg-white/5 text-[11px] font-bold text-gray-300 hover:bg-white/10 transition-all">Entendi, não mostrar de novo</button>' +
      '</div>';
    document.body.appendChild(panel);
    return panel;
  }

  function buildToggleButton() {
    const group = document.querySelector("#lp-editor-modal .aura-lped-topbar .flex.items-center.gap-1.shrink-0");
    if (!group) return null;
    const btn = document.createElement("button");
    btn.id = "aura-guide-toggle";
    btn.title = "Guia rápido";
    btn.className = "p-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-all duration-300";
    btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.09 9a3 3 0 115.82 1c0 2-3 2-3 4M12 17h.01"></path></svg>';
    group.appendChild(btn);
    return btn;
  }

  function init() {
    if (injected) return;
    if (!document.getElementById("lp-editor-modal")) return;
    injected = true;

    const panel = buildPanel();
    const toggle = buildToggleButton();
    const close = function () { panel.classList.add("hidden"); };

    toggle?.addEventListener("click", function () { panel.classList.toggle("hidden"); });
    panel.querySelector("#aura-guide-close")?.addEventListener("click", close);
    panel.querySelector("#aura-guide-dismiss")?.addEventListener("click", function () {
      try { localStorage.setItem(STORAGE_KEY, "true"); } catch (err) { /* localStorage indisponível, sem problema */ }
      close();
    });

    let jaVisto = false;
    try { jaVisto = localStorage.getItem(STORAGE_KEY) === "true"; } catch (err) { /* localStorage indisponível, sem problema */ }
    if (!jaVisto) panel.classList.remove("hidden");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
