
/* Vide Hub — Landing Editor Desktop Shell V1
   Additive enhancement. It does not change Firebase, renderer, saved data or mobile behavior. */
(function () {
  "use strict";

  const state = {
    initialized: false,
    mode: "build",
    modalObserver: null,
    controller: null,
    workspace: null,
    stage: null,
    publishPanel: null
  };

  const icon = {
    build: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M4 5h16v14H4z"></path><path d="M9 5v14"></path><path d="M12 9h5M12 13h5"></path></svg>',
    design: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="m4 20 4-1 10-10a2.8 2.8 0 0 0-4-4L4 15v5Z"></path><path d="m13 6 5 5"></path></svg>',
    publish: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M12 3v12"></path><path d="m7 8 5-5 5 5"></path><path d="M5 14v6h14v-6"></path></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path></svg>',
    preview: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"></path><circle cx="12" cy="12" r="2.5"></circle></svg>',
    save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M5 4h12l2 2v14H5V4Z"></path><path d="M8 4v6h8V4"></path><path d="M9 20v-6h6v6"></path></svg>',
    rocket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M14 5c3-2 5-2 5-2s0 2-2 5l-5 5-4-4 6-4Z"></path><path d="m8 9-4 1 3 3"></path><path d="m12 13-1 4-3-3"></path><path d="M5 19c1-3 3-4 5-4-1 2-2 4-5 5v-1Z"></path></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19 12a7 7 0 0 0-.1-1l2-1-2-4-2 1a7 7 0 0 0-2-1l-.3-2h-5l-.3 2a7 7 0 0 0-2 1l-2-1-2 4 2 1a7 7 0 0 0 0 2l-2 1 2 4 2-1a7 7 0 0 0 2 1l.3 2h5l.3-2a7 7 0 0 0 2-1l2 1 2-4-2-1a7 7 0 0 0 .1-1Z"></path></svg>'
  };

  function isDesktop() {
    return window.matchMedia("(min-width: 768px)").matches;
  }

  function getModal() {
    return document.getElementById("lp-editor-modal");
  }

  function isOpen(modal) {
    return Boolean(modal && !modal.classList.contains("hidden"));
  }

  function getWorkspace(modal) {
    return modal?.querySelector(":scope > .flex-1.flex.overflow-hidden.relative") ||
      modal?.querySelector(":scope > .flex-1") ||
      null;
  }

  function getStage() {
    return document.getElementById("lped-browser-frame")?.parentElement || null;
  }

  function createButton(mode, label, svg) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "vh-editor-modebar__button";
    button.dataset.vhMode = mode;
    button.setAttribute("aria-label", `Abrir modo ${label}`);
    button.setAttribute("title", label);
    button.innerHTML = `${svg}<span>${label}</span>`;
    return button;
  }

  function injectModebar(modal) {
    let bar = modal.querySelector(".vh-editor-modebar");
    if (bar) return bar;

    bar = document.createElement("div");
    bar.className = "vh-editor-modebar";
    bar.innerHTML = `
      <div class="vh-editor-modebar__modes" role="tablist" aria-label="Modos do editor"></div>
      <div class="vh-editor-modebar__context">
        <span class="vh-editor-modebar__status">Editor conectado</span>
      </div>
    `;

    const modes = bar.querySelector(".vh-editor-modebar__modes");
    modes.append(
      createButton("build", "Construção", icon.build),
      createButton("design", "Design", icon.design),
      createButton("publish", "Publicação", icon.publish)
    );

    const topbar = modal.querySelector(":scope > .aura-lped-topbar");
    topbar?.after(bar);
    return bar;
  }

  function injectPanelTools() {
    const panel = document.getElementById("lped-painel-lateral");
    if (!panel || panel.querySelector(".vh-panel-tools")) return;

    const tools = document.createElement("div");
    tools.className = "vh-panel-tools";
    tools.innerHTML = `
      <div class="vh-panel-tools__heading">
        <div>
          <small>Editor de página</small>
          <strong>Biblioteca e estrutura</strong>
        </div>
      </div>
      <div class="vh-panel-tools__tabs" role="tablist" aria-label="Visualização do painel">
        <button type="button" class="vh-panel-tools__tab is-active" data-vh-panel-tab="blocks">Blocos</button>
        <button type="button" class="vh-panel-tools__tab" data-vh-panel-tab="structure">Estrutura</button>
      </div>
      <label class="vh-panel-search">
        ${icon.search}
        <input type="search" id="vh-editor-block-search" placeholder="Buscar bloco na página" autocomplete="off">
      </label>
    `;
    panel.prepend(tools);
  }

  function injectPublishPanel(workspace) {
    let panel = workspace.querySelector(".vh-publish-panel");
    if (panel) return panel;

    panel = document.createElement("section");
    panel.className = "vh-publish-panel";
    panel.setAttribute("aria-label", "Central de publicação");
    panel.innerHTML = `
      <div class="vh-publish-panel__inner">
        <div class="vh-publish-panel__hero">
          <div>
            <small>Central de publicação</small>
            <h2>Revise e coloque sua página no ar</h2>
            <p>As funções atuais de salvar, pré-visualizar e publicar continuam sendo utilizadas. Esta área apenas organiza o fluxo e não altera os dados da Landing Page.</p>
          </div>
        </div>

        <div class="vh-publish-panel__grid">
          <article class="vh-publish-card">
            <div class="vh-publish-card__title">${icon.preview}<span>Pré-visualização</span></div>
            <p>Confira a página em uma nova visualização antes de publicar.</p>
            <button type="button" data-vh-action="preview">${icon.preview}<span>Abrir prévia</span></button>
          </article>

          <article class="vh-publish-card">
            <div class="vh-publish-card__title">${icon.save}<span>Salvar alterações</span></div>
            <p>Registre as últimas mudanças no rascunho atual da Landing Page.</p>
            <button type="button" data-vh-action="save">${icon.save}<span>Salvar agora</span></button>
          </article>

          <article class="vh-publish-card">
            <div class="vh-publish-card__title">${icon.rocket}<span>Publicar página</span></div>
            <p>Utilize o fluxo de publicação já existente no editor.</p>
            <button type="button" data-vh-action="publish">${icon.rocket}<span>Publicar</span></button>
          </article>

          <article class="vh-publish-card">
            <div class="vh-publish-card__title">${icon.settings}<span>Configurações avançadas</span></div>
            <p>SEO, domínio, scripts e integrações continuam disponíveis nos controles atuais do editor.</p>
            <button type="button" data-vh-action="build">${icon.build}<span>Voltar ao editor</span></button>
          </article>
        </div>
      </div>
    `;

    workspace.appendChild(panel);
    return panel;
  }

  function clickExisting(selectors) {
    for (const selector of selectors) {
      const target = document.querySelector(selector);
      if (target && !target.disabled) {
        target.click();
        return true;
      }
    }
    return false;
  }

  function setMode(mode) {
    const modal = getModal();
    if (!modal) return;
    const next = ["build", "design", "publish"].includes(mode) ? mode : "build";
    state.mode = next;
    modal.dataset.vhMode = next;

    modal.querySelectorAll("[data-vh-mode]").forEach((button) => {
      const active = button.dataset.vhMode === next;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });

    if (next === "design") {
      document.getElementById("aura-studio-inspector")?.scrollTo?.({ top: 0, behavior: "smooth" });
    }
  }

  function filterBlocks(value) {
    const query = String(value || "").trim().toLocaleLowerCase("pt-BR");
    const list = document.getElementById("lped-blocos-lista");
    if (!list) return;

    Array.from(list.children).forEach((item) => {
      const text = item.textContent?.toLocaleLowerCase("pt-BR") || "";
      item.classList.toggle("vh-search-hidden", Boolean(query) && !text.includes(query));
    });
  }

  function bind(modal) {
    state.controller?.abort();
    state.controller = new AbortController();
    const { signal } = state.controller;

    modal.querySelector(".vh-editor-modebar")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-vh-mode]");
      if (button) setMode(button.dataset.vhMode);
    }, { signal });

    document.getElementById("vh-editor-block-search")?.addEventListener("input", (event) => {
      filterBlocks(event.target.value);
    }, { signal });

    modal.querySelector(".vh-panel-tools__tabs")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-vh-panel-tab]");
      if (!button) return;
      modal.querySelectorAll("[data-vh-panel-tab]").forEach((item) => {
        item.classList.toggle("is-active", item === button);
      });
      const search = document.getElementById("vh-editor-block-search");
      if (search) {
        search.placeholder = button.dataset.vhPanelTab === "structure"
          ? "Buscar na estrutura da página"
          : "Buscar bloco na página";
        search.focus();
      }
    }, { signal });

    state.publishPanel?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-vh-action]");
      if (!button) return;

      const action = button.dataset.vhAction;
      if (action === "preview") {
        clickExisting([
          "button[onclick*='abrirPreviewEditorLP']",
          "#lped-btn-preview",
          "[data-action='preview']"
        ]);
      } else if (action === "save") {
        clickExisting([
          "button[onclick*='salvarEditorLP']",
          "#lped-btn-salvar",
          "[data-action='save']"
        ]);
      } else if (action === "publish") {
        clickExisting([
          "#lped-btn-publicar",
          "button[onclick*='publicar']",
          "[data-action='publish']"
        ]);
      } else if (action === "build") {
        setMode("build");
      }
    }, { signal });
  }

  function labelExistingButtons(modal) {
    const pairs = [
      ["#lped-btn-desfazer", "Desfazer"],
      ["#lped-btn-refazer", "Refazer"],
      ["#lped-btn-desktop", "Visualização desktop"],
      ["#aura-studio-btn-tablet", "Visualização tablet"],
      ["#lped-btn-mobile", "Visualização mobile"],
      ["#lped-btn-publicar", "Publicar Landing Page"]
    ];

    pairs.forEach(([selector, label]) => {
      const button = modal.querySelector(selector);
      if (!button) return;
      button.setAttribute("aria-label", label);
      if (!button.getAttribute("title")) button.setAttribute("title", label);
    });
  }

  function mount() {
    const modal = getModal();
    if (!modal || !isDesktop() || !isOpen(modal)) return;

    const workspace = getWorkspace(modal);
    const stage = getStage();
    if (!workspace || !stage) return;

    state.workspace = workspace;
    state.stage = stage;

    modal.dataset.vhDesktopShell = "true";
    workspace.classList.add("vh-editor-workspace");
    stage.classList.add("vh-editor-stage");

    injectModebar(modal);
    injectPanelTools();
    state.publishPanel = injectPublishPanel(workspace);
    labelExistingButtons(modal);
    bind(modal);
    setMode(state.mode);
  }

  function unmount() {
    const modal = getModal();
    state.controller?.abort();
    state.controller = null;

    if (!modal) return;
    delete modal.dataset.vhDesktopShell;
    delete modal.dataset.vhMode;
    state.workspace?.classList.remove("vh-editor-workspace");
    state.stage?.classList.remove("vh-editor-stage");
  }

  function sync() {
    const modal = getModal();
    if (modal && isDesktop() && isOpen(modal)) mount();
    else unmount();
  }

  function initialize() {
    if (state.initialized) return;
    state.initialized = true;

    const boot = () => {
      const modal = getModal();
      if (!modal) {
        window.setTimeout(boot, 250);
        return;
      }

      state.modalObserver = new MutationObserver(sync);
      state.modalObserver.observe(modal, {
        attributes: true,
        attributeFilter: ["class"]
      });

      window.matchMedia("(min-width: 768px)").addEventListener?.("change", sync);
      sync();
    };

    boot();

    window.VideLandingEditorShellV1 = {
      setMode,
      getMode: () => state.mode,
      refresh: sync
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
