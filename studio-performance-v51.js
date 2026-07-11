/**
 * Vide Aura — Performance Core + Interface Confortável V5.1
 * Coordenação visual, renderização em lote, painéis inteligentes e diagnóstico.
 * Versão 5.1.0
 */
(function () {
  "use strict";

  const VERSION = "5.1.0";
  const STORAGE = Object.freeze({
    scale: "auraV51UiScale",
    density: "auraV51LibraryDensity",
    focus: "auraV51Focus",
    leftCollapsed: "auraV51LeftCollapsed",
    leftWidth: "auraV51LeftWidth",
    smartInspector: "auraV51SmartInspector",
    coordinated: "auraV51Coordinated"
  });

  const state = {
    initialized: false,
    modalOpen: false,
    scale: localStorage.getItem(STORAGE.scale) || "comfortable",
    density: Number(localStorage.getItem(STORAGE.density) || 3),
    focus: localStorage.getItem(STORAGE.focus) === "true",
    leftCollapsed: localStorage.getItem(STORAGE.leftCollapsed) === "true",
    leftWidth: clamp(Number(localStorage.getItem(STORAGE.leftWidth) || 320), 260, 500),
    smartInspector: localStorage.getItem(STORAGE.smartInspector) !== "false",
    coordinated: localStorage.getItem(STORAGE.coordinated) !== "false",
    renderFrame: 0,
    renderArgs: [],
    renderCount: 0,
    lastRenderMs: 0,
    longestRenderMs: 0,
    lastRenderAt: 0,
    diagnosticsOpen: false,
    settingsOpen: false,
    toolsOpen: false,
    modalObserver: null,
    duplicateTimer: 0,
    diagnosticsTimer: 0,
    resizeCleanup: null,
    originalRender: null
  };

  const ICONS = Object.freeze({
    performance: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 15a8 8 0 1 1 16 0"></path><path d="m12 15 4-5"></path><path d="M7 19h10"></path></svg>`,
    studio: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.2 4.5L19 9.7l-3.5 3.4.8 4.9-4.3-2.3L7.7 18l.8-4.9L5 9.7l4.8-.7L12 3Z"></path><path d="M19 3v4M17 5h4"></path></svg>`,
    focus: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"></path></svg>`,
    panel: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M9 4v16"></path></svg>`,
    inspector: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h7"></path><circle cx="18" cy="12" r="2"></circle><circle cx="14" cy="18" r="2"></circle></svg>`,
    diagnostic: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V9M10 19V5M16 19v-8M22 19H2"></path></svg>`,
    close: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"></path></svg>`,
    chevron: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>`,
    canvas: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M8 9h8M8 13h5"></path></svg>`,
    library: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="8" height="7" rx="2"></rect><rect x="13" y="4" width="8" height="7" rx="2"></rect><rect x="3" y="13" width="8" height="7" rx="2"></rect><rect x="13" y="13" width="8" height="7" rx="2"></rect></svg>`,
    history: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path><path d="M3 3v5h5"></path><path d="M12 7v5l3 2"></path></svg>`,
    media: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"></rect><circle cx="9" cy="10" r="2"></circle><path d="m4 18 5-5 4 4 3-3 4 4"></path></svg>`,
    theme: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><circle cx="8" cy="9" r="1"></circle><circle cx="12" cy="7" r="1"></circle><circle cx="16" cy="9" r="1"></circle></svg>`,
    audit: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11 12 14 22 4"></path><path d="M21 12a9 9 0 1 1-5.3-8.2"></path></svg>`
  });

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || min));
  }

  function getModal() {
    return document.getElementById("lp-editor-modal");
  }

  function isEditorOpen() {
    const modal = getModal();
    return Boolean(modal && !modal.classList.contains("hidden"));
  }

  function idle(callback, timeout = 700) {
    if ("requestIdleCallback" in window) {
      return window.requestIdleCallback(callback, { timeout });
    }

    return window.setTimeout(callback, Math.min(timeout, 120));
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function toast(message, type = "success") {
    if (typeof window.showToast === "function") {
      window.showToast(message, type);
      return;
    }

    console.info(`[Aura Performance V5.1] ${message}`);
  }

  function persist(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch (error) {
      console.warn("[Aura Performance V5.1] Não foi possível salvar a preferência.", error);
    }
  }

  function applySettings() {
    const modal = getModal();
    if (!modal) return;

    modal.classList.add("aura-performance-v51");
    modal.classList.toggle("aura-v51-focus", state.focus);
    modal.classList.toggle("aura-v51-left-collapsed", state.leftCollapsed);
    modal.classList.toggle("aura-v51-coordinated", state.coordinated);
    modal.dataset.auraUiScale = state.scale;
    modal.dataset.auraLibraryDensity = String(state.density);
    modal.style.setProperty("--aura-v51-left-width", `${state.leftWidth}px`);
    modal.style.setProperty("--aura-v51-library-columns", String(state.density));

    const focusButtons = modal.querySelectorAll("[data-v51-action='focus']");
    focusButtons.forEach((button) => {
      button.classList.toggle("is-active", state.focus);
      button.setAttribute("aria-pressed", state.focus ? "true" : "false");
    });

    const collapseButtons = modal.querySelectorAll("[data-v51-action='left']");
    collapseButtons.forEach((button) => {
      button.classList.toggle("is-active", state.leftCollapsed);
      button.setAttribute("aria-pressed", state.leftCollapsed ? "true" : "false");
    });

    modal.querySelectorAll("[data-v51-scale]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.v51Scale === state.scale);
    });

    modal.querySelectorAll("[data-v51-density]").forEach((button) => {
      button.classList.toggle("is-active", Number(button.dataset.v51Density) === state.density);
    });

    const smartInput = modal.querySelector("[data-v51-smart-inspector]");
    if (smartInput) smartInput.checked = state.smartInspector;

    const coordinatedInput = modal.querySelector("[data-v51-coordinated]");
    if (coordinatedInput) coordinatedInput.checked = state.coordinated;

    document.dispatchEvent(new CustomEvent("aura:v51-settings", {
      detail: {
        scale: state.scale,
        density: state.density,
        focus: state.focus,
        leftCollapsed: state.leftCollapsed,
        leftWidth: state.leftWidth,
        smartInspector: state.smartInspector,
        coordinated: state.coordinated
      }
    }));

    scheduleFitCanvas();
    syncSmartInspector();
  }

  function setScale(value) {
    const allowed = new Set(["compact", "comfortable", "large"]);
    state.scale = allowed.has(value) ? value : "comfortable";
    persist(STORAGE.scale, state.scale);
    applySettings();
  }

  function setDensity(value) {
    state.density = clamp(value, 2, 4);
    persist(STORAGE.density, state.density);
    applySettings();
    window.AuraVirtualLibraryV51?.setDensity?.(state.density);
  }

  function toggleFocus(force) {
    state.focus = typeof force === "boolean" ? force : !state.focus;
    persist(STORAGE.focus, state.focus);
    applySettings();

    if (state.focus) {
      closeSettings();
      closeTools();
      toast("Modo foco ativado.");
    }
  }

  function toggleLeftPanel(force) {
    state.leftCollapsed = typeof force === "boolean" ? force : !state.leftCollapsed;
    persist(STORAGE.leftCollapsed, state.leftCollapsed);
    applySettings();
  }

  function setSmartInspector(value) {
    state.smartInspector = Boolean(value);
    persist(STORAGE.smartInspector, state.smartInspector);
    syncSmartInspector(true);
  }

  function setCoordinated(value) {
    state.coordinated = Boolean(value);
    persist(STORAGE.coordinated, state.coordinated);
    applySettings();
  }

  function syncSmartInspector(force = false) {
    const modal = getModal();
    const inspector = document.getElementById("aura-studio-inspector");
    if (!modal || !inspector) return;

    if (!state.smartInspector) {
      modal.classList.remove("aura-v51-inspector-auto-hidden");
      inspector.classList.remove("aura-v51-auto-hidden");
      return;
    }

    let hasSelection = false;

    try {
      const inspectorSelection = window.AuraStudioInspector?.getSelected?.();
      const canvasSelection = window.AuraCanvasV4?.state?.selectedIds;
      hasSelection = Boolean(
        (Number.isInteger(inspectorSelection?.index) && inspectorSelection.index >= 0) ||
        (canvasSelection && canvasSelection.size > 0)
      );
    } catch (error) {
      hasSelection = false;
    }

    if (force && modal.dataset.auraV51ForceInspector === "open") {
      hasSelection = true;
    }

    modal.classList.toggle("aura-v51-inspector-auto-hidden", !hasSelection);
    inspector.classList.toggle("aura-v51-auto-hidden", !hasSelection);

    if (hasSelection) {
      inspector.classList.remove("is-collapsed");
    }

    scheduleFitCanvas();
  }

  function scheduleFitCanvas() {
    window.clearTimeout(scheduleFitCanvas.timer);
    scheduleFitCanvas.timer = window.setTimeout(() => {
      window.AuraStudioPro?.fitCanvas?.();
      window.AuraStudioDeviceHotfix?.sync?.();
    }, 220);
  }

  function installRenderBatcher() {
    const current = window.renderizarEditorBlocos;

    if (typeof current !== "function" || current.__auraV51Batched) {
      return;
    }

    state.originalRender = current;

    const flush = () => {
      if (!state.renderFrame) return;

      window.cancelAnimationFrame(state.renderFrame);
      state.renderFrame = 0;

      const args = state.renderArgs;
      state.renderArgs = [];

      const started = performance.now();
      const result = state.originalRender.apply(window, args);
      const duration = performance.now() - started;

      state.renderCount += 1;
      state.lastRenderMs = Math.round(duration * 10) / 10;
      state.longestRenderMs = Math.max(state.longestRenderMs, state.lastRenderMs);
      state.lastRenderAt = Date.now();

      document.dispatchEvent(new CustomEvent("aura:v51-render-complete", {
        detail: {
          duration: state.lastRenderMs,
          count: state.renderCount
        }
      }));

      scheduleDiagnosticsRefresh();
      return result;
    };

    const wrapped = function (...args) {
      state.renderArgs = args;

      if (!state.renderFrame) {
        state.renderFrame = window.requestAnimationFrame(flush);
      }

      return undefined;
    };

    wrapped.__auraV51Batched = true;
    wrapped.__auraOriginal = current;
    wrapped.flush = flush;

    window.renderizarEditorBlocos = wrapped;

    ["salvarEditorLP", "publicarEditorLP", "abrirPreviewEditorLP"].forEach((name) => {
      const action = window[name];
      if (typeof action !== "function" || action.__auraV51Flush) return;

      const wrappedAction = function (...args) {
        window.renderizarEditorBlocos?.flush?.();
        return action.apply(this, args);
      };

      wrappedAction.__auraV51Flush = true;
      wrappedAction.__auraOriginal = action;
      window[name] = wrappedAction;
    });
  }

  function injectControls() {
    const modal = getModal();
    const topbar = modal?.querySelector(":scope > .aura-lped-topbar");

    if (!modal || !topbar) return;

    if (!document.getElementById("aura-v51-performance-launcher")) {
      const launcher = document.createElement("button");
      launcher.type = "button";
      launcher.id = "aura-v51-performance-launcher";
      launcher.className = "aura-v51-top-button";
      launcher.title = "Interface e desempenho";
      launcher.innerHTML = `${ICONS.performance}<span><small>Interface</small><b>Confortável</b></span>`;
      launcher.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleSettings();
      });

      const actions = topbar.querySelector(".flex.items-center.gap-2.shrink-0") || topbar.lastElementChild;
      if (actions) actions.insertBefore(launcher, actions.firstChild);
      else topbar.appendChild(launcher);
    }

    if (!document.getElementById("aura-v51-studio-launcher")) {
      const launcher = document.createElement("button");
      launcher.type = "button";
      launcher.id = "aura-v51-studio-launcher";
      launcher.className = "aura-v51-top-button aura-v51-studio-launcher";
      launcher.title = "Ferramentas do Studio";
      launcher.innerHTML = `${ICONS.studio}<span><small>Vide Aura</small><b>Studio</b></span>`;
      launcher.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleTools();
      });

      const actions = topbar.querySelector(".flex.items-center.gap-2.shrink-0") || topbar.lastElementChild;
      if (actions) actions.insertBefore(launcher, actions.firstChild);
      else topbar.appendChild(launcher);
    }

    injectSettingsPanel();
    injectToolsPanel();
    injectLeftPanelControls();
    injectBottomControls();
    injectDiagnosticsPanel();
    injectFocusExit();
  }

  function injectSettingsPanel() {
    const modal = getModal();
    if (!modal || document.getElementById("aura-v51-settings")) return;

    const panel = document.createElement("section");
    panel.id = "aura-v51-settings";
    panel.className = "aura-v51-popover hidden";
    panel.setAttribute("aria-label", "Interface e desempenho");
    panel.innerHTML = `
      <header>
        <div>
          <small>Performance Core V5.1</small>
          <h3>Interface confortável</h3>
          <p>Mais espaço para o canvas, controles maiores e renderização coordenada.</p>
        </div>
        <button type="button" data-v51-close="settings" aria-label="Fechar">${ICONS.close}</button>
      </header>

      <div class="aura-v51-section">
        <span>Escala da interface</span>
        <div class="aura-v51-segmented">
          <button type="button" data-v51-scale="compact">Compacta</button>
          <button type="button" data-v51-scale="comfortable">Confortável</button>
          <button type="button" data-v51-scale="large">Grande</button>
        </div>
      </div>

      <div class="aura-v51-section">
        <span>Densidade da biblioteca</span>
        <div class="aura-v51-segmented">
          <button type="button" data-v51-density="2">2 colunas</button>
          <button type="button" data-v51-density="3">3 colunas</button>
          <button type="button" data-v51-density="4">4 colunas</button>
        </div>
      </div>

      <div class="aura-v51-switch-list">
        <label>
          <span>
            ${ICONS.inspector}
            <b>Inspetor inteligente</b>
            <small>Recolhe quando nenhum bloco está selecionado.</small>
          </span>
          <input type="checkbox" data-v51-smart-inspector>
          <i></i>
        </label>

        <label>
          <span>
            ${ICONS.studio}
            <b>Studio coordenado</b>
            <small>Reúne Canvas, MAX e Ultimate em um único menu.</small>
          </span>
          <input type="checkbox" data-v51-coordinated>
          <i></i>
        </label>
      </div>

      <div class="aura-v51-quick-actions">
        <button type="button" data-v51-action="focus">${ICONS.focus}<span>Modo foco</span></button>
        <button type="button" data-v51-action="left">${ICONS.panel}<span>Painel esquerdo</span></button>
        <button type="button" data-v51-action="diagnostics">${ICONS.diagnostic}<span>Diagnóstico</span></button>
      </div>
    `;

    modal.appendChild(panel);

    panel.querySelector("[data-v51-close='settings']")?.addEventListener("click", closeSettings);
    panel.querySelectorAll("[data-v51-scale]").forEach((button) => {
      button.addEventListener("click", () => setScale(button.dataset.v51Scale));
    });
    panel.querySelectorAll("[data-v51-density]").forEach((button) => {
      button.addEventListener("click", () => setDensity(button.dataset.v51Density));
    });
    panel.querySelector("[data-v51-smart-inspector]")?.addEventListener("change", (event) => {
      setSmartInspector(event.target.checked);
    });
    panel.querySelector("[data-v51-coordinated]")?.addEventListener("change", (event) => {
      setCoordinated(event.target.checked);
    });
    panel.querySelector("[data-v51-action='focus']")?.addEventListener("click", () => toggleFocus());
    panel.querySelector("[data-v51-action='left']")?.addEventListener("click", () => toggleLeftPanel());
    panel.querySelector("[data-v51-action='diagnostics']")?.addEventListener("click", openDiagnostics);
  }

  function injectToolsPanel() {
    const modal = getModal();
    if (!modal || document.getElementById("aura-v51-tools")) return;

    const panel = document.createElement("section");
    panel.id = "aura-v51-tools";
    panel.className = "aura-v51-tools hidden";
    panel.setAttribute("aria-label", "Ferramentas do Studio");
    panel.innerHTML = `
      <header>
        <div>
          <small>Vide Aura Studio</small>
          <h3>Central de ferramentas</h3>
        </div>
        <button type="button" data-v51-close="tools" aria-label="Fechar">${ICONS.close}</button>
      </header>

      <div class="aura-v51-tools-grid">
        <button type="button" data-v51-tool="canvas">
          ${ICONS.canvas}
          <span><b>Canvas V4</b><small>Blocos, layout e responsividade</small></span>
        </button>
        <button type="button" data-v51-tool="ultimate">
          ${ICONS.studio}
          <span><b>Studio Ultimate</b><small>Composição e diagnóstico</small></span>
        </button>
        <button type="button" data-v51-tool="max">
          ${ICONS.performance}
          <span><b>Studio MAX</b><small>Gerador, versões e camadas</small></span>
        </button>
        <button type="button" data-v51-tool="library">
          ${ICONS.library}
          <span><b>Biblioteca</b><small>Modelos virtualizados</small></span>
        </button>
        <button type="button" data-v51-tool="history">
          ${ICONS.history}
          <span><b>Histórico</b><small>Desfazer e versões</small></span>
        </button>
        <button type="button" data-v51-tool="components">
          ${ICONS.panel}
          <span><b>Componentes</b><small>Instâncias reutilizáveis</small></span>
        </button>
        <button type="button" data-v51-tool="theme">
          ${ICONS.theme}
          <span><b>Tema global</b><small>Paleta e consistência</small></span>
        </button>
        <button type="button" data-v51-tool="media">
          ${ICONS.media}
          <span><b>Mídia</b><small>Imagens e otimização</small></span>
        </button>
        <button type="button" data-v51-tool="audit">
          ${ICONS.audit}
          <span><b>Auditoria</b><small>SEO e qualidade</small></span>
        </button>
      </div>
    `;

    modal.appendChild(panel);

    panel.querySelector("[data-v51-close='tools']")?.addEventListener("click", closeTools);
    panel.querySelectorAll("[data-v51-tool]").forEach((button) => {
      button.addEventListener("click", () => {
        runTool(button.dataset.v51Tool);
      });
    });
  }

  function runTool(tool) {
    closeTools();

    if (tool === "canvas") window.AuraCanvasV4?.open?.("blocks");
    if (tool === "ultimate") window.AuraStudioUltimate?.open?.("compose");
    if (tool === "max") window.AuraStudioMax?.openHub?.();
    if (tool === "library") {
      if (window.AuraVirtualLibraryV51?.open) window.AuraVirtualLibraryV51.open();
      else window.AuraStudioPro?.openLibrary?.();
    }
    if (tool === "history") window.AuraCanvasV4?.open?.("history");
    if (tool === "components") window.AuraCanvasV4?.open?.("components");
    if (tool === "theme") window.AuraStudioMax?.openPanel?.("theme");
    if (tool === "media") window.AuraStudioMedia?.open?.();
    if (tool === "audit") window.AuraStudioPro?.openAudit?.();
  }

  function injectLeftPanelControls() {
    const modal = getModal();
    const panel = document.getElementById("lped-painel-lateral");
    const header = panel?.querySelector(":scope > .sticky");

    if (!modal || !panel || !header) return;

    if (!document.getElementById("aura-v51-left-toggle")) {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.id = "aura-v51-left-toggle";
      toggle.className = "aura-v51-panel-toggle";
      toggle.dataset.v51Action = "left";
      toggle.title = "Recolher painel esquerdo";
      toggle.setAttribute("aria-label", "Recolher painel esquerdo");
      toggle.innerHTML = ICONS.panel;
      toggle.addEventListener("click", () => toggleLeftPanel());
      header.appendChild(toggle);
    }

    if (!document.getElementById("aura-v51-left-resizer")) {
      const resizer = document.createElement("div");
      resizer.id = "aura-v51-left-resizer";
      resizer.className = "aura-v51-left-resizer";
      resizer.setAttribute("role", "separator");
      resizer.setAttribute("aria-orientation", "vertical");
      resizer.title = "Arraste para redimensionar";
      panel.appendChild(resizer);
      bindLeftResizer(resizer);
    }

    if (!document.getElementById("aura-v51-left-restore")) {
      const restore = document.createElement("button");
      restore.type = "button";
      restore.id = "aura-v51-left-restore";
      restore.className = "aura-v51-left-restore";
      restore.title = "Abrir painel de componentes";
      restore.innerHTML = `${ICONS.panel}<span>Componentes</span>`;
      restore.addEventListener("click", () => toggleLeftPanel(false));
      modal.appendChild(restore);
    }
  }

  function bindLeftResizer(resizer) {
    let startX = 0;
    let startWidth = 0;

    const move = (event) => {
      const delta = event.clientX - startX;
      state.leftWidth = clamp(startWidth + delta, 260, 500);
      getModal()?.style.setProperty("--aura-v51-left-width", `${state.leftWidth}px`);
      scheduleFitCanvas();
    };

    const finish = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", finish);
      document.body.classList.remove("aura-v51-resizing");
      persist(STORAGE.leftWidth, state.leftWidth);
    };

    resizer.addEventListener("pointerdown", (event) => {
      if (state.leftCollapsed || state.focus) return;

      startX = event.clientX;
      startWidth = state.leftWidth;
      document.body.classList.add("aura-v51-resizing");
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", finish, { once: true });
      event.preventDefault();
    });
  }

  function injectBottomControls() {
    const bar = document.getElementById("aura-studio-bottom-bar");
    if (!bar || document.getElementById("aura-v51-focus-button")) return;

    const left = bar.querySelector(".aura-studio-bottom-left") || bar.firstElementChild;
    const focus = document.createElement("button");
    focus.type = "button";
    focus.id = "aura-v51-focus-button";
    focus.dataset.v51Action = "focus";
    focus.title = "Modo foco (Shift + F)";
    focus.innerHTML = `${ICONS.focus}<span>Foco</span>`;
    focus.addEventListener("click", () => toggleFocus());
    left?.appendChild(focus);
  }

  function injectFocusExit() {
    const modal = getModal();
    if (!modal || document.getElementById("aura-v51-focus-exit")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.id = "aura-v51-focus-exit";
    button.className = "aura-v51-focus-exit";
    button.innerHTML = `${ICONS.focus}<span>Sair do foco</span>`;
    button.addEventListener("click", () => toggleFocus(false));
    modal.appendChild(button);
  }

  function injectDiagnosticsPanel() {
    const modal = getModal();
    if (!modal || document.getElementById("aura-v51-diagnostics")) return;

    const root = document.createElement("div");
    root.id = "aura-v51-diagnostics";
    root.className = "aura-v51-diagnostics hidden";
    root.innerHTML = `
      <div class="aura-v51-diagnostics-backdrop" data-v51-close="diagnostics"></div>
      <section class="aura-v51-diagnostics-dialog" role="dialog" aria-modal="true" aria-labelledby="aura-v51-diagnostics-title">
        <header>
          <div>
            <small>Performance Core V5.1</small>
            <h2 id="aura-v51-diagnostics-title">Diagnóstico do editor</h2>
            <p>Métricas locais para identificar excesso de renderização, DOM e imagens.</p>
          </div>
          <button type="button" data-v51-close="diagnostics" aria-label="Fechar">${ICONS.close}</button>
        </header>
        <div id="aura-v51-diagnostics-content"></div>
        <footer>
          <span>Os números são aproximados e medidos somente no navegador atual.</span>
          <button type="button" data-v51-refresh-diagnostics>${ICONS.diagnostic}<span>Atualizar diagnóstico</span></button>
        </footer>
      </section>
    `;

    modal.appendChild(root);
    root.querySelectorAll("[data-v51-close='diagnostics']").forEach((button) => {
      button.addEventListener("click", closeDiagnostics);
    });
    root.querySelector("[data-v51-refresh-diagnostics]")?.addEventListener("click", renderDiagnostics);
  }

  function computeDiagnostics() {
    const modal = getModal();
    const blocks = Array.isArray(window.lpEditorBlocos) ? window.lpEditorBlocos : [];
    const domNodes = modal?.querySelectorAll("*").length || 0;
    const renderedLibraryCards = modal?.querySelectorAll(".aura-studio-template-card, .aura-v4-preset-card").length || 0;
    const imageBytes = estimateImageBytes(blocks);
    const storageBytes = estimateAuraStorage();
    const knownObservers = countKnownObservers();
    const blockListItems = document.getElementById("lped-blocos-lista")?.children.length || 0;
    const previewItems = document.getElementById("lped-preview-canvas")?.children.length || 0;

    return {
      blocks: blocks.length,
      domNodes,
      renderedLibraryCards,
      imageBytes,
      storageBytes,
      knownObservers,
      blockListItems,
      previewItems,
      renderCount: state.renderCount,
      lastRenderMs: state.lastRenderMs,
      longestRenderMs: state.longestRenderMs
    };
  }

  function estimateImageBytes(value) {
    let total = 0;
    const seen = new WeakSet();

    const visit = (item) => {
      if (typeof item === "string") {
        if (item.startsWith("data:image/")) {
          const comma = item.indexOf(",");
          const payload = comma >= 0 ? item.slice(comma + 1) : item;
          total += Math.round(payload.length * 0.75);
        }
        return;
      }

      if (!item || typeof item !== "object") return;
      if (seen.has(item)) return;
      seen.add(item);

      Object.values(item).forEach(visit);
    };

    visit(value);
    return total;
  }

  function estimateAuraStorage() {
    let total = 0;

    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index) || "";
        if (!key.toLowerCase().includes("aura")) continue;

        const value = localStorage.getItem(key) || "";
        total += (key.length + value.length) * 2;
      }
    } catch (error) {
      return 0;
    }

    return total;
  }

  function countKnownObservers() {
    const candidates = [
      window.AuraStudioPro?.state?.previewObserver,
      window.AuraStudioPro?.state?.modalObserver,
      window.AuraCanvasV4?.state?.observer,
      window.AuraStudioUltimate?.state?.observer,
      window.AuraStudioUltimate?.state?.modalObserver,
      window.AuraStudioMax?.state?.observer
    ];

    return candidates.filter(Boolean).length + (state.modalObserver ? 1 : 0);
  }

  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / 1024 ** 2).toFixed(1)} MB`;
  }

  function metricState(type, value) {
    const thresholds = {
      dom: [5000, 10000],
      render: [20, 50],
      images: [5 * 1024 ** 2, 15 * 1024 ** 2],
      storage: [3 * 1024 ** 2, 7 * 1024 ** 2],
      cards: [60, 150],
      observers: [5, 8]
    };

    const [warning, danger] = thresholds[type] || [Infinity, Infinity];
    if (value >= danger) return "danger";
    if (value >= warning) return "warning";
    return "good";
  }

  function renderDiagnostics() {
    const root = document.getElementById("aura-v51-diagnostics-content");
    if (!root) return;

    const data = computeDiagnostics();

    root.innerHTML = `
      <section class="aura-v51-diagnostic-score">
        <div>
          <span>Estado atual</span>
          <strong>${data.lastRenderMs <= 20 && data.domNodes < 7000 ? "Saudável" : data.lastRenderMs <= 50 ? "Atenção" : "Pesado"}</strong>
          <small>Última renderização: ${data.lastRenderMs || 0} ms</small>
        </div>
        <i data-state="${metricState("render", data.lastRenderMs)}"></i>
      </section>

      <section class="aura-v51-diagnostic-grid">
        ${diagnosticCard("Blocos da página", data.blocks, `${data.previewItems} elementos no preview`, "good")}
        ${diagnosticCard("Elementos no editor", data.domNodes.toLocaleString("pt-BR"), `${data.blockListItems} itens no painel`, metricState("dom", data.domNodes))}
        ${diagnosticCard("Cards renderizados", data.renderedLibraryCards, "A biblioteca V5.1 limita o DOM", metricState("cards", data.renderedLibraryCards))}
        ${diagnosticCard("Último render", `${data.lastRenderMs || 0} ms`, `Pior medição: ${data.longestRenderMs || 0} ms`, metricState("render", data.lastRenderMs))}
        ${diagnosticCard("Imagens incorporadas", formatBytes(data.imageBytes), "Estimativa de Base64 nos blocos", metricState("images", data.imageBytes))}
        ${diagnosticCard("Armazenamento Aura", formatBytes(data.storageBytes), "Preferências, versões e rascunhos", metricState("storage", data.storageBytes))}
        ${diagnosticCard("Observadores conhecidos", data.knownObservers, "Módulos expostos ao diagnóstico", metricState("observers", data.knownObservers))}
        ${diagnosticCard("Renderizações em lote", data.renderCount, "Chamadas externas agrupadas por frame", "good")}
      </section>

      <section class="aura-v51-recommendations">
        <h3>Recomendações automáticas</h3>
        ${buildRecommendations(data).map((item) => `
          <article data-state="${item.state}">
            <span></span>
            <div><strong>${escapeHTML(item.title)}</strong><p>${escapeHTML(item.text)}</p></div>
          </article>
        `).join("")}
      </section>
    `;
  }

  function diagnosticCard(label, value, detail, status) {
    return `
      <article data-state="${status}">
        <span>${escapeHTML(label)}</span>
        <strong>${escapeHTML(value)}</strong>
        <small>${escapeHTML(detail)}</small>
      </article>
    `;
  }

  function buildRecommendations(data) {
    const items = [];

    if (data.renderedLibraryCards > 80) {
      items.push({
        state: "warning",
        title: "Biblioteca com muitos cards no DOM",
        text: "Feche e abra novamente pela Central Studio para ativar a biblioteca incremental."
      });
    } else {
      items.push({
        state: "good",
        title: "Biblioteca coordenada",
        text: "Apenas lotes pequenos de modelos permanecem renderizados."
      });
    }

    if (data.imageBytes > 10 * 1024 ** 2) {
      items.push({
        state: "warning",
        title: "Imagens incorporadas estão pesadas",
        text: "Use o Studio de mídia para converter imagens grandes para WebP."
      });
    }

    if (data.domNodes > 9000) {
      items.push({
        state: "danger",
        title: "DOM muito extenso",
        text: "Feche centrais que não estão em uso e mantenha o Inspetor inteligente ativado."
      });
    } else {
      items.push({
        state: "good",
        title: "Quantidade de elementos aceitável",
        text: "O editor está dentro da faixa recomendada para esta interface."
      });
    }

    if (data.lastRenderMs > 35) {
      items.push({
        state: "warning",
        title: "Renderização acima do ideal",
        text: "Evite manter Biblioteca, Ultimate e MAX abertos ao mesmo tempo."
      });
    } else {
      items.push({
        state: "good",
        title: "Renderização em lote ativa",
        text: "Mudanças externas são agrupadas no próximo quadro do navegador."
      });
    }

    return items;
  }

  function openDiagnostics() {
    closeSettings();
    const root = document.getElementById("aura-v51-diagnostics");
    if (!root) return;

    state.diagnosticsOpen = true;
    root.classList.remove("hidden");
    renderDiagnostics();
  }

  function closeDiagnostics() {
    state.diagnosticsOpen = false;
    document.getElementById("aura-v51-diagnostics")?.classList.add("hidden");
  }

  function scheduleDiagnosticsRefresh() {
    if (!state.diagnosticsOpen) return;

    window.clearTimeout(state.diagnosticsTimer);
    state.diagnosticsTimer = window.setTimeout(renderDiagnostics, 220);
  }

  function toggleSettings() {
    const panel = document.getElementById("aura-v51-settings");
    if (!panel) return;

    state.settingsOpen = panel.classList.contains("hidden");
    closeTools();
    panel.classList.toggle("hidden", !state.settingsOpen);
    applySettings();
  }

  function closeSettings() {
    state.settingsOpen = false;
    document.getElementById("aura-v51-settings")?.classList.add("hidden");
  }

  function toggleTools() {
    const panel = document.getElementById("aura-v51-tools");
    if (!panel) return;

    state.toolsOpen = panel.classList.contains("hidden");
    closeSettings();
    panel.classList.toggle("hidden", !state.toolsOpen);
  }

  function closeTools() {
    state.toolsOpen = false;
    document.getElementById("aura-v51-tools")?.classList.add("hidden");
  }

  function dedupeDraftNotices() {
    const modal = getModal();
    if (!modal) return;

    const matches = Array.from(modal.querySelectorAll("div, section, aside"))
      .filter((element) => {
        if (element.children.length > 14) return false;
        const text = String(element.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
        return text.includes("rascunho local encontrado");
      })
      .sort((a, b) => {
        const depthA = getDepth(a);
        const depthB = getDepth(b);
        return depthA - depthB;
      });

    const unique = [];
    for (const element of matches) {
      if (unique.some((parent) => parent.contains(element))) continue;
      unique.push(element);
    }

    unique.forEach((element, index) => {
      element.classList.toggle("aura-v51-duplicate-draft", index > 0);
    });
  }

  function getDepth(element) {
    let depth = 0;
    let current = element;

    while (current?.parentElement) {
      depth += 1;
      current = current.parentElement;
    }

    return depth;
  }

  function scheduleDedupe() {
    window.clearTimeout(state.duplicateTimer);
    state.duplicateTimer = window.setTimeout(dedupeDraftNotices, 90);
  }

  function bindGlobalEvents() {
    document.addEventListener("aura:studio-selection", () => {
      const modal = getModal();
      if (modal) modal.dataset.auraV51ForceInspector = "open";
      syncSmartInspector(true);
      window.setTimeout(() => {
        if (modal) delete modal.dataset.auraV51ForceInspector;
      }, 160);
    });

    document.addEventListener("aura:studio-change", () => {
      scheduleDedupe();
      scheduleDiagnosticsRefresh();
      window.setTimeout(syncSmartInspector, 80);
    });

    document.addEventListener("pointerdown", (event) => {
      if (!isEditorOpen()) return;

      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      if (
        !target.closest("#aura-v51-settings") &&
        !target.closest("#aura-v51-performance-launcher")
      ) {
        closeSettings();
      }

      if (
        !target.closest("#aura-v51-tools") &&
        !target.closest("#aura-v51-studio-launcher")
      ) {
        closeTools();
      }

      if (
        state.smartInspector &&
        (
          target.id === "lped-preview-canvas" ||
          target.id === "lped-browser-frame" ||
          target.closest(".aura-studio-inspector-empty")
        ) &&
        !target.closest("[id^='lped-preview-bloco-']")
      ) {
        const modal = getModal();
        modal?.classList.add("aura-v51-inspector-auto-hidden");
        document.getElementById("aura-studio-inspector")?.classList.add("aura-v51-auto-hidden");
        scheduleFitCanvas();
      }
    }, true);

    document.addEventListener("keydown", (event) => {
      if (!isEditorOpen()) return;

      const target = event.target;
      const editing = target instanceof HTMLElement && (
        target.isContentEditable ||
        /INPUT|TEXTAREA|SELECT/.test(target.tagName)
      );
      const key = String(event.key || "").toLowerCase();

      if (!editing && event.shiftKey && key === "f") {
        event.preventDefault();
        toggleFocus();
      }

      if (!editing && (event.ctrlKey || event.metaKey) && event.altKey && key === "p") {
        event.preventDefault();
        toggleSettings();
      }

      if (key === "escape") {
        if (state.diagnosticsOpen) closeDiagnostics();
        else if (state.settingsOpen) closeSettings();
        else if (state.toolsOpen) closeTools();
        else if (state.focus) toggleFocus(false);
      }
    });

    window.addEventListener("resize", () => {
      window.clearTimeout(bindGlobalEvents.resizeTimer);
      bindGlobalEvents.resizeTimer = window.setTimeout(scheduleFitCanvas, 100);
    });
  }

  function watchModal() {
    const modal = getModal();
    if (!modal || state.modalObserver) return;

    state.modalObserver = new MutationObserver((records) => {
      let classChanged = false;
      let structureChanged = false;

      for (const record of records) {
        if (record.type === "attributes" && record.target === modal) classChanged = true;
        if (record.type === "childList") structureChanged = true;
      }

      if (classChanged) {
        const open = !modal.classList.contains("hidden");

        if (open !== state.modalOpen) {
          state.modalOpen = open;

          if (open) {
            window.setTimeout(() => {
              injectControls();
              applySettings();
              installRenderBatcher();
              syncSmartInspector();
              scheduleDedupe();
            }, 100);
          } else {
            closeSettings();
            closeTools();
            closeDiagnostics();
          }
        }
      }

      if (structureChanged && state.modalOpen) {
        idle(() => {
          injectControls();
          scheduleDedupe();
        }, 240);
      }
    });

    state.modalObserver.observe(modal, {
      attributes: true,
      attributeFilter: ["class"],
      childList: true,
      subtree: false
    });
  }

  function init() {
    if (state.initialized) return;

    const modal = getModal();

    if (
      !modal ||
      !window.AuraStudioPro ||
      typeof window.renderizarEditorBlocos !== "function"
    ) {
      window.setTimeout(init, 160);
      return;
    }

    state.initialized = true;
    state.modalOpen = !modal.classList.contains("hidden");

    injectControls();
    installRenderBatcher();
    bindGlobalEvents();
    watchModal();
    applySettings();
    scheduleDedupe();

    window.AuraPerformanceV51 = {
      version: VERSION,
      state,
      setScale,
      setDensity,
      toggleFocus,
      toggleLeftPanel,
      setSmartInspector,
      setCoordinated,
      openDiagnostics,
      refreshDiagnostics: renderDiagnostics,
      flushRender: () => window.renderizarEditorBlocos?.flush?.(),
      getDiagnostics: computeDiagnostics
    };

    console.info("[Vide Aura Performance Core V5.1] Inicializado", {
      scale: state.scale,
      density: state.density,
      coordinated: state.coordinated,
      version: VERSION
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();

