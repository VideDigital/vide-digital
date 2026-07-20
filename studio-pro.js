(function () {
  "use strict";

  const state = {
    initialized: false,
    modalOpen: false,
    zoom: Number(localStorage.getItem("auraStudioZoom") || 80),
    device: localStorage.getItem("auraStudioDevice") || "desktop",
    grid: localStorage.getItem("auraStudioGrid") !== "false",
    outline: localStorage.getItem("auraStudioOutline") === "true",
    inspector: localStorage.getItem("auraStudioInspector") !== "false",
    dirty: false,
    activeCategory: "Todos",
    query: "",
    objective: "Todos",
    favoritesOnly: false,
    favoriteKey: "auraStudioFavoritesV1",
    recentKey: "auraStudioRecentsV1",
    personalKey: "auraStudioPersonalBlocksV1",
    previewObserver: null,
    modalObserver: null,
    toolbarObserver: null,
    lastAudit: null,
    modalTimer: null,
    previewTimer: null,
    mobile: {
      media: null,
      mounted: false,
      view: "blocks",
      controller: null,
      raf: 0,
      tap: null,
      scroll: { blocks: 0, preview: 0, properties: 0 },
      listeners: 0,
      observers: 0,
      mountCount: 0,
      unmountCount: 0
    }
  };

  const escapeHTML = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  function getModal() {
    return document.getElementById("lp-editor-modal");
  }

  function getBlocks() {
    return Array.isArray(window.lpEditorBlocos) ? window.lpEditorBlocos : [];
  }

  function toast(message, type) {
    if (typeof window.showToast === "function") window.showToast(message, type);
    else console.log(`[Aura Studio] ${message}`);
  }

  function readList(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? value : [];
    } catch (_) {
      return [];
    }
  }

  function writeList(key, values, limit) {
    localStorage.setItem(key, JSON.stringify(values.slice(0, limit || 100)));
  }

  function getAllPresets() {
    const defaults = Array.isArray(window.AURA_STUDIO_PRESETS) ? window.AURA_STUDIO_PRESETS : [];
    const personal = window.AuraStudioInspector?.readPersonalBlocks?.() || readList(state.personalKey);
    return [...personal, ...defaults];
  }

  function currentPageId() {
    const selected = document.querySelector("#lped-barra-paginas button.bg-\\[\\#FF7A45\\]");
    const onclick = selected?.getAttribute("onclick") || "";
    const match = onclick.match(/trocarPaginaLP\('([^']+)'\)/);
    if (match) return match[1];

    const blocks = getBlocks();
    return blocks.find((block) => block?.paginaId)?.paginaId || "pg_1";
  }

  function markDirty() {
    state.dirty = true;
    updateSaveStatus("unsaved");
  }

  function markSaved() {
    state.dirty = false;
    updateSaveStatus("saved");
  }

  function updateSaveStatus(status) {
    const dot = document.getElementById("aura-studio-save-dot");
    const label = document.getElementById("aura-studio-save-label");
    const root = document.getElementById("aura-studio-save-state");
    if (!dot || !label || !root) return;

    root.dataset.state = status;
    const labels = {
      saved: "Tudo salvo",
      saving: "Salvando...",
      unsaved: "Alterações pendentes",
      error: "Falha ao salvar"
    };
    label.textContent = labels[status] || labels.saved;
  }

  function getWorkspace() {
    const modal = getModal();
    return modal?.querySelector(":scope > .flex-1.flex.overflow-hidden.relative") || null;
  }

  function getStage() {
    return document.querySelector("#lped-browser-frame")?.parentElement || null;
  }

  function getInspector() {
    return document.getElementById("aura-studio-inspector");
  }

  function getMobileArea(view) {
    if (view === "blocks") return document.getElementById("lped-painel-lateral");
    if (view === "preview") return getStage();
    if (view === "properties") return getInspector();
    return null;
  }

  function isEditorOpen() {
    const modal = getModal();
    return Boolean(modal && !modal.classList.contains("hidden"));
  }

  function isMobileViewport() {
    if (!state.mobile.media) state.mobile.media = window.matchMedia("(max-width: 767px)");
    return state.mobile.media.matches;
  }

  function isMobileShellActive() {
    return state.mobile.mounted && isEditorOpen() && isMobileViewport();
  }

  function safeScrollTop(element) {
    return element ? Number(element.scrollTop || 0) : 0;
  }

  function captureMobileScroll(view) {
    const area = getMobileArea(view || state.mobile.view);
    if (area) state.mobile.scroll[view || state.mobile.view] = safeScrollTop(area);
  }

  function restoreMobileScroll(view) {
    const area = getMobileArea(view || state.mobile.view);
    if (!area) return;
    cancelAnimationFrame(state.mobile.raf);
    state.mobile.raf = requestAnimationFrame(() => {
      area.scrollTop = state.mobile.scroll[view || state.mobile.view] || 0;
    });
  }

  function isInteractiveMobileTarget(target) {
    return Boolean(target?.closest?.("button,a,input,select,textarea,label,[contenteditable='true'],[role='button']"));
  }

  function injectMobileShellNav() {
    const modal = getModal();
    const topbar = modal?.querySelector(":scope > .aura-lped-topbar");
    if (!modal || !topbar || document.getElementById("aura-studio-mobile-shell-nav")) return;

    const nav = document.createElement("nav");
    nav.id = "aura-studio-mobile-shell-nav";
    nav.className = "aura-studio-mobile-shell-nav";
    nav.setAttribute("aria-label", "Navegacao mobile do editor");
    nav.innerHTML = `
      <button type="button" data-aura-mobile-view="blocks" aria-controls="lped-painel-lateral">Blocos</button>
      <button type="button" data-aura-mobile-view="preview" aria-controls="lped-browser-frame">Previa</button>
      <button type="button" data-aura-mobile-view="properties" aria-controls="aura-studio-inspector">Propriedades</button>
      <button type="button" data-studio-library-open="true" aria-label="Abrir Biblioteca do Studio">Biblioteca</button>
    `;
    topbar.after(nav);
  }

  function setMobileAreaState(activeView) {
    ["blocks", "preview", "properties"].forEach((view) => {
      const area = getMobileArea(view);
      if (!area) return;
      const active = view === activeView;
      area.dataset.auraMobileArea = view;
      area.dataset.auraMobileActive = String(active);
      area.setAttribute("aria-hidden", active ? "false" : "true");
      if ("inert" in area) area.inert = !active;
    });
    window.AuraCanvasV4?.setMobileInteractionEnabled?.(activeView === "preview");
  }

  function syncMobileNav(activeView) {
    document.querySelectorAll("[data-aura-mobile-view]").forEach((button) => {
      const active = button.dataset.auraMobileView === activeView;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
  }

  function setMobileView(view, options) {
    const nextView = ["blocks", "preview", "properties"].includes(view) ? view : "blocks";
    if (state.mobile.mounted) captureMobileScroll(state.mobile.view);
    state.mobile.view = nextView;

    const modal = getModal();
    if (modal) modal.dataset.auraMobileView = nextView;
    syncMobileNav(nextView);
    if (state.mobile.mounted) {
      setMobileAreaState(nextView);
      restoreMobileScroll(nextView);
      if (nextView === "preview") setTimeout(fitCanvas, 40);
    }

    if (options?.source === "selection" && nextView === "properties") {
      getInspector()?.focus?.({ preventScroll: true });
    }
  }

  function selectMobileBlock(index, options) {
    const blocks = getBlocks();
    if (!blocks[index]) return false;
    if (window.AuraCanvasV4?.selectIndex?.(index, { source: options?.source || "mobile-shell" }) !== false) {
      if (typeof window.renderizarEditorBlocos === "function") window.renderizarEditorBlocos();
      if (options?.openProperties !== false && state.mobile.mounted) setMobileView("properties", { source: "selection" });
      return true;
    }
    window.AuraStudioInspector?.select?.(index);
    if (options?.openProperties !== false && state.mobile.mounted) setMobileView("properties", { source: "selection" });
    return true;
  }

  function syncNativeBlockDrag(enabled) {
    document.querySelectorAll("#lped-blocos-lista [draggable]").forEach((element) => {
      element.setAttribute("draggable", enabled ? "true" : "false");
    });
  }

  function onMobileListPointerDown(event) {
    if (!state.mobile.mounted || state.mobile.view !== "blocks") return;
    if (isInteractiveMobileTarget(event.target)) return;
    const trigger = event.target.closest?.("[data-aura-mobile-card-trigger]");
    const card = trigger?.closest?.("[data-lped-block-index]");
    if (!card) return;
    state.mobile.tap = {
      pointerId: event.pointerId,
      index: Number(card.dataset.lpedBlockIndex),
      x: event.clientX,
      y: event.clientY,
      t: performance.now(),
      moved: false,
      suppressClick: false
    };
  }

  function onMobileListPointerMove(event) {
    const tap = state.mobile.tap;
    if (!tap || tap.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 10) tap.moved = true;
  }

  function finishMobileListTap(event) {
    const tap = state.mobile.tap;
    if (!tap || tap.pointerId !== event.pointerId) return;
    state.mobile.tap = null;
    const elapsed = performance.now() - tap.t;
    if (tap.moved || elapsed > 520) return;
    tap.suppressClick = true;
    event.preventDefault();
    event.stopPropagation();
    selectMobileBlock(tap.index, { source: "blocks" });
  }

  function onMobileListClick(event) {
    if (!state.mobile.mounted || state.mobile.view !== "blocks") return;
    if (isInteractiveMobileTarget(event.target)) return;
    if (event.target.closest?.("[data-aura-mobile-card-trigger]")) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function moveMobileBlock(index, direction) {
    const blocks = getBlocks();
    const next = index + direction;
    if (!blocks[index] || !blocks[next]) return false;
    window.moverBlocoEditor?.(index, direction);
    selectMobileBlock(next, { source: "mobile-reorder", openProperties: false });
    setMobileView("blocks");
    return true;
  }

  function mountMobileShell() {
    const modal = getModal();
    const workspace = getWorkspace();
    if (!modal || !workspace || state.mobile.mounted || !isEditorOpen() || !isMobileViewport()) return;

    injectMobileShellNav();
    state.mobile.mounted = true;
    state.mobile.mountCount += 1;
    state.mobile.controller = new AbortController();
    modal.dataset.auraMobileShell = "true";
    workspace.classList.add("aura-studio-mobile-workspace");

    const signal = state.mobile.controller.signal;
    document.getElementById("aura-studio-mobile-shell-nav")?.addEventListener("click", (event) => {
      const libraryButton = event.target.closest("[data-studio-library-open='true']");
      if (libraryButton) {
        openActiveLibrary();
        return;
      }
      const button = event.target.closest("[data-aura-mobile-view]");
      if (button) setMobileView(button.dataset.auraMobileView);
    }, { signal });

    const list = document.getElementById("lped-blocos-lista");
    list?.addEventListener("pointerdown", onMobileListPointerDown, { signal });
    list?.addEventListener("pointermove", onMobileListPointerMove, { signal });
    list?.addEventListener("pointerup", finishMobileListTap, { signal });
    list?.addEventListener("pointercancel", () => { state.mobile.tap = null; }, { signal });
    list?.addEventListener("click", onMobileListClick, { capture: true, signal });

    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-aura-mobile-back='blocks']");
      if (button) setMobileView("blocks");
    }, { signal });

    document.addEventListener("aura:studio-selection", (event) => {
      const index = Number(event.detail?.index);
      const source = event.detail?.source || "";
      if (!state.mobile.mounted || !Number.isInteger(index) || index < 0) return;
      if (source === "mobile-reorder") return;
      setMobileView("properties", { source: "selection" });
    }, { signal });

    state.mobile.listeners = 8;
    state.mobile.observers = 0;
    syncNativeBlockDrag(false);
    setMobileView(state.mobile.view || "blocks");
  }

  function unmountMobileShell() {
    const modal = getModal();
    const workspace = getWorkspace();
    if (!state.mobile.mounted) return;
    captureMobileScroll(state.mobile.view);
    state.mobile.controller?.abort();
    state.mobile.controller = null;
    state.mobile.tap = null;
    state.mobile.mounted = false;
    state.mobile.unmountCount += 1;
    state.mobile.listeners = 0;
    state.mobile.observers = 0;
    cancelAnimationFrame(state.mobile.raf);
    delete modal?.dataset.auraMobileShell;
    delete modal?.dataset.auraMobileView;
    workspace?.classList.remove("aura-studio-mobile-workspace");
    ["blocks", "preview", "properties"].forEach((view) => {
      const area = getMobileArea(view);
      if (!area) return;
      delete area.dataset.auraMobileArea;
      delete area.dataset.auraMobileActive;
      area.removeAttribute("aria-hidden");
      if ("inert" in area) area.inert = false;
    });
    syncNativeBlockDrag(true);
    window.AuraCanvasV4?.setMobileInteractionEnabled?.(true);
  }

  function syncMobileShell() {
    if (isEditorOpen() && isMobileViewport()) mountMobileShell();
    else unmountMobileShell();
  }

  function injectTopbarEnhancements() {
    const modal = getModal();
    const topbar = modal?.querySelector(":scope > .aura-lped-topbar");
    if (!topbar || document.getElementById("aura-studio-brand")) return;

    const brand = document.createElement("div");
    brand.id = "aura-studio-brand";
    brand.className = "aura-studio-brand";
    brand.innerHTML = `
      <span class="aura-studio-brand-mark">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="m12 3 8 4-8 4-8-4 8-4Z"></path>
          <path d="m4 12 8 4 8-4"></path>
          <path d="m4 17 8 4 8-4"></path>
        </svg>
      </span>
      <div>
        <small>Vide Aura</small>
        <strong>Studio Pro</strong>
      </div>
    `;
    topbar.prepend(brand);

    const saveState = document.createElement("div");
    saveState.id = "aura-studio-save-state";
    saveState.className = "aura-studio-save-state";
    saveState.dataset.state = "saved";
    saveState.innerHTML = `<i id="aura-studio-save-dot"></i><span id="aura-studio-save-label">Tudo salvo</span>`;

    const actionGroup = topbar.lastElementChild;
    actionGroup?.prepend(saveState);
    actionGroup?.classList.add("aura-studio-mobile-actions-group");

    const titleGroup = document.getElementById("lped-titulo")?.parentElement;
    titleGroup?.classList.add("aura-studio-mobile-title-group");
    const closeButton = titleGroup?.querySelector("button[onclick*='fecharEditorLP']");
    closeButton?.classList.add("aura-studio-mobile-close");
    closeButton?.setAttribute("aria-label", "Fechar editor");

    const deviceGroup = document.getElementById("lped-btn-desktop")?.parentElement;
    deviceGroup?.classList.add("aura-studio-mobile-device-group");
    if (deviceGroup && !document.getElementById("aura-studio-btn-tablet")) {
      const tablet = document.createElement("button");
      tablet.type = "button";
      tablet.id = "aura-studio-btn-tablet";
      tablet.className = "aura-studio-device-button";
      tablet.title = "Tablet (2)";
      tablet.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <rect x="5" y="3" width="14" height="18" rx="2"></rect>
          <path d="M10 18h4"></path>
        </svg>
      `;
      tablet.addEventListener("click", () => setDevice("tablet"));
      deviceGroup.insertBefore(tablet, document.getElementById("lped-btn-mobile"));
    }

    const historyGroup = document.getElementById("lped-btn-desfazer")?.parentElement;
    historyGroup?.classList.add("aura-studio-mobile-history-group");

    const libraryButton = document.createElement("button");
    libraryButton.type = "button";
    libraryButton.className = "aura-studio-top-command";
    libraryButton.dataset.studioLibraryOpen = "true";
    libraryButton.setAttribute("aria-label", "Abrir Biblioteca do Studio");
    libraryButton.title = "Biblioteca Pro (B)";
    libraryButton.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <rect x="3" y="4" width="8" height="7" rx="2"></rect>
        <rect x="13" y="4" width="8" height="7" rx="2"></rect>
        <rect x="3" y="13" width="8" height="7" rx="2"></rect>
        <rect x="13" y="13" width="8" height="7" rx="2"></rect>
      </svg>
      <span>Biblioteca</span>
    `;
    libraryButton.addEventListener("click", openActiveLibrary);
    const modeGroup = document.getElementById("lped-btn-modo-empilhado")?.parentElement;
    modeGroup?.classList.add("aura-studio-mobile-mode-group");
    modeGroup?.before(libraryButton);

    actionGroup?.querySelector("button[onclick*='salvarEditorLP']")?.classList.add("aura-studio-mobile-save");
    actionGroup?.querySelector("button[onclick*='abrirPreviewEditorLP']")?.classList.add("aura-studio-mobile-open");
    document.getElementById("lped-btn-publicar")?.classList.add("aura-studio-mobile-publish");
  }

  function injectLeftPanelTools() {
    const panel = document.getElementById("lped-painel-lateral");
    if (!panel || document.getElementById("aura-studio-left-tools")) return;

    const header = panel.querySelector(":scope > .sticky");
    if (!header) return;

    const tools = document.createElement("div");
    tools.id = "aura-studio-left-tools";
    tools.className = "aura-studio-left-tools";
    tools.innerHTML = `
      <button type="button" data-studio-left="library" class="is-active">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="8" height="7" rx="2"></rect><rect x="13" y="4" width="8" height="7" rx="2"></rect><rect x="3" y="13" width="8" height="7" rx="2"></rect><rect x="13" y="13" width="8" height="7" rx="2"></rect></svg>
        Blocos
      </button>
      <button type="button" data-studio-left="layers">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m12 3 8 4-8 4-8-4 8-4Z"></path><path d="m4 12 8 4 8-4"></path><path d="m4 17 8 4 8-4"></path></svg>
        Camadas
      </button>
      <button type="button" data-studio-left="pages">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 3h9l3 3v15H6V3Z"></path><path d="M14 3v4h4"></path></svg>
        Páginas
      </button>
      <button type="button" data-studio-left="audit">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 11 11 13 15 8"></path><path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z"></path></svg>
        Auditoria
      </button>
    `;
    header.appendChild(tools);

    tools.querySelector("[data-studio-left='library']")?.addEventListener("click", openActiveLibrary);
    tools.querySelector("[data-studio-left='layers']")?.addEventListener("click", () => window.alternarPainelCamadas?.());
    tools.querySelector("[data-studio-left='pages']")?.addEventListener("click", () => document.getElementById("lped-barra-paginas")?.scrollIntoView({ behavior: "smooth", block: "center" }));
    tools.querySelector("[data-studio-left='audit']")?.addEventListener("click", openAudit);

    const addButton = panel.querySelector("button.aura-lped-add-block");
    if (addButton) {
      const proButton = document.createElement("button");
      proButton.type = "button";
      proButton.className = "aura-studio-library-launch";
      proButton.innerHTML = `
        <span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 3v18"></path><path d="M3 12h18"></path></svg>
        </span>
        <div><strong>Explorar Biblioteca Pro</strong><small>Mais de 100 estruturas e páginas completas</small></div>
        <b>⌘ B</b>
      `;
      proButton.addEventListener("click", openActiveLibrary);
      addButton.before(proButton);
    }
  }

  function openActiveLibrary() {
    const handler = window.AuraStudioPro?.openLibrary;
    return (typeof handler === "function" ? handler : openLibrary)();
  }

  function injectBottomBar() {
    const modal = getModal();
    if (!modal || document.getElementById("aura-studio-bottom-bar")) return;

    const bar = document.createElement("div");
    bar.id = "aura-studio-bottom-bar";
    bar.className = "aura-studio-bottom-bar";
    bar.innerHTML = `
      <div class="aura-studio-bottom-left">
        <button type="button" data-studio-bottom="grid" class="${state.grid ? "is-active" : ""}" title="Grade (G)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 4h16v16H4z"></path><path d="M4 10h16M10 4v16M16 4v16M4 16h16"></path></svg>
          Grade
        </button>
        <button type="button" data-studio-bottom="outline" class="${state.outline ? "is-active" : ""}" title="Contornos (O)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"></rect><path d="M8 8h8v8H8z"></path></svg>
          Contornos
        </button>
        <button type="button" data-studio-bottom="inspector" class="${state.inspector ? "is-active" : ""}" title="Inspetor (I)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 6h16M4 12h10M4 18h7"></path><circle cx="18" cy="12" r="2"></circle><circle cx="14" cy="18" r="2"></circle></svg>
          Inspetor
        </button>
      </div>
      <div class="aura-studio-bottom-center">
        <span id="aura-studio-canvas-size">1440 × auto</span>
        <i></i>
        <span id="aura-studio-block-count">0 blocos</span>
        <i></i>
        <span id="aura-studio-quality-score">Qualidade —</span>
      </div>
      <div class="aura-studio-zoom">
        <button type="button" data-studio-zoom="out" aria-label="Diminuir zoom">−</button>
        <input id="aura-studio-zoom-range" type="range" min="25" max="180" step="5" value="${state.zoom}">
        <button type="button" id="aura-studio-zoom-label" data-studio-zoom="fit">${state.zoom}%</button>
        <button type="button" data-studio-zoom="in" aria-label="Aumentar zoom">+</button>
      </div>
    `;
    modal.appendChild(bar);

    bar.querySelector("[data-studio-bottom='grid']")?.addEventListener("click", toggleGrid);
    bar.querySelector("[data-studio-bottom='outline']")?.addEventListener("click", toggleOutline);
    bar.querySelector("[data-studio-bottom='inspector']")?.addEventListener("click", toggleInspector);
    bar.querySelector("[data-studio-zoom='out']")?.addEventListener("click", () => setZoom(state.zoom - 10));
    bar.querySelector("[data-studio-zoom='in']")?.addEventListener("click", () => setZoom(state.zoom + 10));
    bar.querySelector("[data-studio-zoom='fit']")?.addEventListener("click", fitCanvas);
    bar.querySelector("#aura-studio-zoom-range")?.addEventListener("input", (event) => setZoom(Number(event.target.value)));
  }

  function injectLibrary() {
    const modal = getModal();
    if (!modal || document.getElementById("aura-studio-library")) return;

    const panel = document.createElement("div");
    panel.id = "aura-studio-library";
    panel.className = "aura-studio-library hidden";
    panel.innerHTML = `
      <div class="aura-studio-library-backdrop" data-library-close></div>
      <section class="aura-studio-library-dialog">
        <header class="aura-studio-library-header">
          <div class="aura-studio-library-title">
            <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="8" height="7" rx="2"></rect><rect x="13" y="4" width="8" height="7" rx="2"></rect><rect x="3" y="13" width="8" height="7" rx="2"></rect><rect x="13" y="13" width="8" height="7" rx="2"></rect></svg></span>
            <div><small>Biblioteca expansível</small><h2>Aura Blocks</h2><p>Seções, combinações e páginas completas prontas para personalizar.</p></div>
          </div>
          <div class="aura-studio-library-stats">
            <div><strong id="aura-library-count">0</strong><span>modelos</span></div>
            <div><strong id="aura-library-category-count">0</strong><span>categorias</span></div>
          </div>
          <button type="button" class="aura-studio-library-close" data-library-close aria-label="Fechar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m6 6 12 12"></path><path d="M18 6 6 18"></path></svg>
          </button>
        </header>
        <div class="aura-studio-library-toolbar">
          <label class="aura-studio-library-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path></svg>
            <input id="aura-library-search" type="search" placeholder="Buscar hero, oferta, formulário, evento...">
            <kbd>⌘ K</kbd>
          </label>
          <select id="aura-library-objective">
            <option value="Todos">Todos os objetivos</option>
          </select>
          <button type="button" id="aura-library-favorites">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"></path></svg>
            Favoritos
          </button>
        </div>
        <div class="aura-studio-library-body">
          <aside id="aura-library-categories" class="aura-studio-library-categories"></aside>
          <main class="aura-studio-library-main">
            <div class="aura-studio-library-main-header">
              <div><small id="aura-library-eyebrow">Todos os modelos</small><h3 id="aura-library-heading">Escolha uma estrutura</h3></div>
              <span id="aura-library-results">0 resultados</span>
            </div>
            <div id="aura-library-grid" class="aura-studio-library-grid"></div>
          </main>
        </div>
      </section>
    `;
    modal.appendChild(panel);

    panel.querySelectorAll("[data-library-close]").forEach((button) => button.addEventListener("click", closeLibrary));
    panel.querySelector("#aura-library-search")?.addEventListener("input", (event) => {
      state.query = event.target.value;
      renderLibrary();
    });
    panel.querySelector("#aura-library-objective")?.addEventListener("change", (event) => {
      state.objective = event.target.value;
      renderLibrary();
    });
    panel.querySelector("#aura-library-favorites")?.addEventListener("click", () => {
      state.favoritesOnly = !state.favoritesOnly;
      panel.querySelector("#aura-library-favorites")?.classList.toggle("is-active", state.favoritesOnly);
      renderLibrary();
    });
  }

  function injectAudit() {
    const modal = getModal();
    if (!modal || document.getElementById("aura-studio-audit")) return;
    const panel = document.createElement("div");
    panel.id = "aura-studio-audit";
    panel.className = "aura-studio-audit hidden";
    panel.innerHTML = `
      <div class="aura-studio-audit-backdrop" data-audit-close></div>
      <aside class="aura-studio-audit-dialog">
        <header>
          <div><small>Diagnóstico em tempo real</small><h2>Auditoria da página</h2><p>SEO, acessibilidade, conversão e estrutura.</p></div>
          <button type="button" data-audit-close><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m6 6 12 12"></path><path d="M18 6 6 18"></path></svg></button>
        </header>
        <div id="aura-audit-content"></div>
      </aside>
    `;
    modal.appendChild(panel);
    panel.querySelectorAll("[data-audit-close]").forEach((button) => button.addEventListener("click", closeAudit));
  }

  function injectCommandPalette() {
    const modal = getModal();
    if (!modal || document.getElementById("aura-studio-command")) return;
    const palette = document.createElement("div");
    palette.id = "aura-studio-command";
    palette.className = "aura-studio-command hidden";
    palette.innerHTML = `
      <div class="aura-studio-command-backdrop" data-command-close></div>
      <section class="aura-studio-command-dialog">
        <label><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path></svg><input id="aura-command-input" type="search" placeholder="Digite uma ação ou recurso..."><kbd>Esc</kbd></label>
        <div id="aura-command-list"></div>
      </section>
    `;
    modal.appendChild(palette);
    palette.querySelectorAll("[data-command-close]").forEach((button) => button.addEventListener("click", closeCommand));
    palette.querySelector("#aura-command-input")?.addEventListener("input", renderCommands);
  }

  function commands() {
    return [
      { id: "library", name: "Abrir Biblioteca Pro", group: "Criar", hint: "B", run: openLibrary },
      { id: "audit", name: "Executar auditoria da página", group: "Qualidade", hint: "A", run: openAudit },
      { id: "desktop", name: "Visualizar em Desktop", group: "Dispositivo", hint: "1", run: () => setDevice("desktop") },
      { id: "tablet", name: "Visualizar em Tablet", group: "Dispositivo", hint: "2", run: () => setDevice("tablet") },
      { id: "mobile", name: "Visualizar em Celular", group: "Dispositivo", hint: "3", run: () => setDevice("mobile") },
      { id: "fit", name: "Ajustar canvas à tela", group: "Canvas", hint: "F", run: fitCanvas },
      { id: "grid", name: state.grid ? "Ocultar grade" : "Mostrar grade", group: "Canvas", hint: "G", run: toggleGrid },
      { id: "outline", name: state.outline ? "Ocultar contornos" : "Mostrar contornos", group: "Canvas", hint: "O", run: toggleOutline },
      { id: "inspector", name: state.inspector ? "Fechar inspetor" : "Abrir inspetor", group: "Painéis", hint: "I", run: toggleInspector },
      { id: "save", name: "Salvar landing page", group: "Arquivo", hint: "Ctrl S", run: () => window.salvarEditorLP?.() },
      { id: "publish", name: "Publicar ou despublicar", group: "Arquivo", hint: "Ctrl Shift P", run: () => window.publicarEditorLP?.() },
      { id: "preview", name: "Abrir pré-visualização", group: "Arquivo", hint: "P", run: () => window.abrirPreviewEditorLP?.() }
    ];
  }

  function openCommand() {
    const root = document.getElementById("aura-studio-command");
    if (!root) return;
    root.classList.remove("hidden");
    const input = document.getElementById("aura-command-input");
    if (input) input.value = "";
    renderCommands();
    setTimeout(() => input?.focus(), 20);
  }

  function closeCommand() {
    document.getElementById("aura-studio-command")?.classList.add("hidden");
  }

  function renderCommands() {
    const query = String(document.getElementById("aura-command-input")?.value || "").toLowerCase().trim();
    const list = document.getElementById("aura-command-list");
    if (!list) return;
    const filtered = commands().filter((command) => `${command.name} ${command.group}`.toLowerCase().includes(query));
    list.innerHTML = filtered.map((command, index) => `
      <button type="button" data-command-id="${command.id}" class="${index === 0 ? "is-first" : ""}">
        <span><small>${escapeHTML(command.group)}</small><strong>${escapeHTML(command.name)}</strong></span>
        <kbd>${escapeHTML(command.hint)}</kbd>
      </button>
    `).join("") || `<p class="aura-studio-command-empty">Nenhuma ação encontrada.</p>`;
    list.querySelectorAll("[data-command-id]").forEach((button) => button.addEventListener("click", () => {
      const command = commands().find((item) => item.id === button.dataset.commandId);
      closeCommand();
      command?.run();
    }));
  }

  function openLibrary() {
    const root = document.getElementById("aura-studio-library");
    if (!root) return;
    state.activeCategory = "Todos";
    state.query = "";
    state.objective = "Todos";
    state.favoritesOnly = false;
    const search = document.getElementById("aura-library-search");
    if (search) search.value = "";
    const favoriteButton = document.getElementById("aura-library-favorites");
    favoriteButton?.classList.remove("is-active");
    root.classList.remove("hidden");
    populateLibraryFilters();
    renderLibrary();
    setTimeout(() => search?.focus(), 30);
  }

  function closeLibrary() {
    document.getElementById("aura-studio-library")?.classList.add("hidden");
  }

  function populateLibraryFilters() {
    const presets = getAllPresets();
    const categories = ["Todos", "Recentes", "Favoritos", ...new Set(presets.map((preset) => preset.categoria).filter(Boolean))];
    const objectives = ["Todos", ...new Set(presets.map((preset) => preset.objetivo).filter(Boolean))];
    const categoryRoot = document.getElementById("aura-library-categories");
    const objectiveRoot = document.getElementById("aura-library-objective");
    if (categoryRoot) {
      categoryRoot.innerHTML = categories.map((category) => {
        const count = category === "Todos" ? presets.length : category === "Recentes" ? readList(state.recentKey).length : category === "Favoritos" ? readList(state.favoriteKey).length : presets.filter((preset) => preset.categoria === category).length;
        return `<button type="button" data-library-category="${escapeHTML(category)}" class="${state.activeCategory === category ? "is-active" : ""}"><span>${escapeHTML(category)}</span><b>${count}</b></button>`;
      }).join("");
      categoryRoot.querySelectorAll("[data-library-category]").forEach((button) => button.addEventListener("click", () => {
        state.activeCategory = button.dataset.libraryCategory;
        state.favoritesOnly = state.activeCategory === "Favoritos";
        document.getElementById("aura-library-favorites")?.classList.toggle("is-active", state.favoritesOnly);
        renderLibrary();
      }));
    }
    if (objectiveRoot) {
      objectiveRoot.innerHTML = objectives.map((objective) => `<option value="${escapeHTML(objective)}">${objective === "Todos" ? "Todos os objetivos" : escapeHTML(objective)}</option>`).join("");
      objectiveRoot.value = state.objective;
    }
    const count = document.getElementById("aura-library-count");
    const categoryCount = document.getElementById("aura-library-category-count");
    if (count) count.textContent = presets.length;
    if (categoryCount) categoryCount.textContent = new Set(presets.map((preset) => preset.categoria)).size;
  }

  function libraryResults() {
    const presets = getAllPresets();
    const favorites = new Set(readList(state.favoriteKey));
    const recents = readList(state.recentKey);
    const recentOrder = new Map(recents.map((id, index) => [id, index]));
    const query = state.query.toLowerCase().trim();
    let result = presets.filter((preset) => {
      if (state.activeCategory === "Favoritos" || state.favoritesOnly) {
        if (!favorites.has(preset.id)) return false;
      } else if (state.activeCategory === "Recentes") {
        if (!recentOrder.has(preset.id)) return false;
      } else if (state.activeCategory !== "Todos" && preset.categoria !== state.activeCategory) {
        return false;
      }
      if (state.objective !== "Todos" && preset.objetivo !== state.objective) return false;
      if (query) {
        const haystack = `${preset.nome} ${preset.categoria} ${preset.objetivo} ${(preset.tags || []).join(" ")}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
    if (state.activeCategory === "Recentes") result.sort((a, b) => (recentOrder.get(a.id) ?? 999) - (recentOrder.get(b.id) ?? 999));
    return result;
  }

  function renderLibrary() {
    const grid = document.getElementById("aura-library-grid");
    if (!grid) return;
    populateLibraryFilters();
    const results = libraryResults();
    const favorites = new Set(readList(state.favoriteKey));
    const heading = document.getElementById("aura-library-heading");
    const eyebrow = document.getElementById("aura-library-eyebrow");
    const total = document.getElementById("aura-library-results");
    if (heading) heading.textContent = state.activeCategory === "Todos" ? "Escolha uma estrutura" : state.activeCategory;
    if (eyebrow) eyebrow.textContent = state.query ? `Pesquisa: ${state.query}` : state.favoritesOnly ? "Sua seleção" : "Biblioteca profissional";
    if (total) total.textContent = `${results.length} resultado${results.length === 1 ? "" : "s"}`;

    grid.innerHTML = results.map((preset) => {
      const blocks = Array.isArray(preset.blocos) ? preset.blocos : [];
      const colors = [preset.accent || "#7C3AED", preset.palette?.accent || "#22D3EE", preset.palette?.bg || "#0F172A"];
      return `
        <article class="aura-studio-template-card" data-preset-id="${escapeHTML(preset.id)}">
          <div class="aura-studio-template-preview" style="--preset-accent:${colors[0]};--preset-secondary:${colors[1]};--preset-bg:${colors[2]};">
            <div class="aura-studio-template-browser"><i></i><i></i><i></i></div>
            <div class="aura-studio-template-visual">
              <span></span><strong></strong><em></em><b></b>
            </div>
            <small>${preset.tipo === "pagina" ? "Página completa" : preset.tipo === "pessoal" ? "Bloco pessoal" : `${blocks.length} bloco${blocks.length === 1 ? "" : "s"}`}</small>
            <button type="button" data-preset-favorite="${escapeHTML(preset.id)}" class="${favorites.has(preset.id) ? "is-active" : ""}" aria-label="Favoritar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"></path></svg>
            </button>
          </div>
          <div class="aura-studio-template-content">
            <small>${escapeHTML(preset.categoria || "Bloco")}</small>
            <h4>${escapeHTML(preset.nome)}</h4>
            <p>${escapeHTML(preset.objetivo || "Personalizar")}</p>
            <div>
              <span>${blocks.length} ${blocks.length === 1 ? "bloco" : "blocos"}</span>
              <button type="button" data-preset-insert="${escapeHTML(preset.id)}">Inserir</button>
            </div>
          </div>
        </article>
      `;
    }).join("") || `
      <div class="aura-studio-library-empty">
        <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path></svg></span>
        <strong>Nenhum modelo encontrado</strong>
        <p>Tente outra categoria, objetivo ou termo de pesquisa.</p>
      </div>
    `;

    grid.querySelectorAll("[data-preset-insert]").forEach((button) => button.addEventListener("click", () => insertPreset(button.dataset.presetInsert)));
    grid.querySelectorAll("[data-preset-favorite]").forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleFavorite(button.dataset.presetFavorite);
    }));
  }

  function toggleFavorite(id) {
    const favorites = readList(state.favoriteKey);
    const index = favorites.indexOf(id);
    if (index >= 0) favorites.splice(index, 1);
    else favorites.unshift(id);
    writeList(state.favoriteKey, favorites, 200);
    renderLibrary();
  }

  function insertPreset(id) {
    const preset = getAllPresets().find((item) => item.id === id);
    if (!preset || !Array.isArray(preset.blocos)) return;
    const blocks = getBlocks();
    const pageId = currentPageId();
    const startIndex = blocks.length;
    const maxZ = Math.max(0, ...blocks.map((block) => Number(block.zIndex || 0)));
    const freeMode = document.getElementById("lped-btn-modo-livre")?.className.includes("bg-[#FF7A45]");
    let y = Math.max(0, ...blocks.map((block) => Number(block.y || 0) + Number(block.altura || 0))) + 24;

    blocks.forEach((block) => { block._colapsado = true; });
    preset.blocos.forEach((template, index) => {
      const clone = JSON.parse(JSON.stringify(template));
      clone.id = `lpb_${Date.now()}_${startIndex + index}_${Math.random().toString(36).slice(2, 6)}`;
      clone.paginaId = pageId;
      clone._aba = clone._aba || "conteudo";
      clone._colapsado = index !== 0;
      clone.visivel = clone.visivel !== false;
      if (freeMode) {
        clone.x = 32 + (index % 2) * 36;
        clone.y = y;
        clone.largura = Number(clone.largura || 760);
        clone.altura = Number(clone.altura || 260);
        clone.zIndex = maxZ + index + 1;
        y += clone.altura + 24;
      } else {
        delete clone.x;
        delete clone.y;
        delete clone.largura;
        delete clone.altura;
        delete clone.zIndex;
      }
      blocks.push(clone);
    });

    if (typeof window.renderizarEditorBlocos === "function") window.renderizarEditorBlocos();
    document.getElementById("lped-blocos-lista")?.dispatchEvent(new Event("input", { bubbles: true }));
    const recents = readList(state.recentKey).filter((item) => item !== id);
    recents.unshift(id);
    writeList(state.recentKey, recents, 30);
    closeLibrary();
    state.dirty = true;
    updateSaveStatus("unsaved");
    updateWorkspaceMeta();
    setTimeout(() => {
      window.AuraStudioInspector?.select?.(startIndex);
      document.getElementById(`lped-preview-bloco-${startIndex}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    toast(`${preset.nome} inserido com ${preset.blocos.length} bloco(s).`);
  }

  function runAudit() {
    const blocks = getBlocks().filter((block) => block?.visivel !== false);
    const issues = [];
    let seo = 100;
    let accessibility = 100;
    let conversion = 100;
    let structure = 100;

    if (!blocks.length) {
      issues.push({ level: "error", title: "Página vazia", text: "Adicione pelo menos uma seção antes de publicar.", area: "Estrutura" });
      structure -= 60;
    }

    const titleBlocks = blocks.filter((block) => String(block?.props?.titulo || "").trim());
    if (!titleBlocks.length) {
      issues.push({ level: "error", title: "Sem título principal", text: "Adicione um título claro na primeira dobra.", area: "SEO" });
      seo -= 30;
    }

    const ctas = blocks.filter((block) => block?.props?.botaoTexto);
    if (!ctas.length) {
      issues.push({ level: "warning", title: "Nenhum CTA identificado", text: "Inclua ao menos um botão para conduzir a próxima ação.", area: "Conversão" });
      conversion -= 28;
    }
    ctas.forEach((block) => {
      if (!block.props.botaoLink || block.props.botaoLink === "#") {
        issues.push({ level: "warning", title: "Botão sem destino", text: `O CTA “${block.props.botaoTexto}” precisa de um link.`, area: "Conversão" });
        conversion -= 7;
      }
    });

    const forms = blocks.filter((block) => block?.tipo === "formulario_captura");
    if (!forms.length && !ctas.some((block) => String(block.props.botaoLink || "").includes("wa.me"))) {
      issues.push({ level: "info", title: "Captação não configurada", text: "Considere adicionar formulário ou botão direto para WhatsApp.", area: "Conversão" });
      conversion -= 12;
    }

    blocks.forEach((block, index) => {
      const d = block.design || {};
      if (d.corFundo && d.corTexto && String(d.corFundo).toLowerCase() === String(d.corTexto).toLowerCase()) {
        issues.push({ level: "error", title: "Contraste insuficiente", text: `O bloco ${index + 1} usa a mesma cor no fundo e no texto.`, area: "Acessibilidade" });
        accessibility -= 18;
      }
      if ((Number(d.paddingTop || 0) < 16 || Number(d.paddingBottom || 0) < 16)) {
        issues.push({ level: "info", title: "Espaçamento reduzido", text: `O bloco ${index + 1} pode ficar apertado em telas pequenas.`, area: "Responsividade" });
        accessibility -= 3;
      }
      if (block.tipo === "texto_midia" && !block.props?.imagemB64) {
        issues.push({ level: "info", title: "Mídia ausente", text: `O bloco ${index + 1} possui espaço de imagem sem conteúdo.`, area: "Conteúdo" });
        structure -= 3;
      }
    });

    const hasFaq = blocks.some((block) => block.tipo === "faq");
    const hasProof = blocks.some((block) => block.tipo === "carrossel_cards" || block.tipo === "galeria_imagens");
    const hasProducts = blocks.some((block) => block.tipo === "carrossel_produtos");
    if (!hasProof) {
      issues.push({ level: "info", title: "Prova social ausente", text: "Depoimentos, avaliações ou resultados podem aumentar a confiança.", area: "Conversão" });
      conversion -= 8;
    }
    if (!hasFaq && blocks.length > 4) {
      issues.push({ level: "info", title: "Objeções não respondidas", text: "Uma seção de FAQ pode reduzir dúvidas antes do contato.", area: "Conversão" });
      conversion -= 5;
    }
    if (hasProducts && !ctas.length) {
      conversion -= 10;
    }

    const clamp = (value) => Math.max(0, Math.min(100, value));
    const scores = {
      seo: clamp(seo),
      accessibility: clamp(accessibility),
      conversion: clamp(conversion),
      structure: clamp(structure)
    };
    const overall = Math.round((scores.seo + scores.accessibility + scores.conversion + scores.structure) / 4);
    state.lastAudit = { overall, scores, issues, blocks: blocks.length, ctas: ctas.length, forms: forms.length };
    updateWorkspaceMeta();
    return state.lastAudit;
  }

  function openAudit() {
    const root = document.getElementById("aura-studio-audit");
    const content = document.getElementById("aura-audit-content");
    if (!root || !content) return;
    const audit = runAudit();
    content.innerHTML = `
      <div class="aura-studio-audit-score">
        <div style="--score:${audit.overall * 3.6}deg"><strong>${audit.overall}</strong><span>/100</span></div>
        <section><small>Qualidade geral</small><h3>${audit.overall >= 85 ? "Página muito bem estruturada" : audit.overall >= 65 ? "Boa base com pontos de melhoria" : "A página precisa de ajustes importantes"}</h3><p>${audit.blocks} blocos · ${audit.ctas} CTAs · ${audit.forms} formulários</p></section>
      </div>
      <div class="aura-studio-audit-metrics">
        ${auditMetric("SEO", audit.scores.seo)}
        ${auditMetric("Acessibilidade", audit.scores.accessibility)}
        ${auditMetric("Conversão", audit.scores.conversion)}
        ${auditMetric("Estrutura", audit.scores.structure)}
      </div>
      <div class="aura-studio-audit-issues">
        <div class="aura-studio-audit-issues-title"><div><small>Recomendações</small><h3>${audit.issues.length ? `${audit.issues.length} ponto(s) identificado(s)` : "Nenhum problema básico"}</h3></div><button type="button" id="aura-audit-refresh">Analisar novamente</button></div>
        ${audit.issues.length ? audit.issues.map((issue) => `<article data-level="${issue.level}"><span>${issue.level === "error" ? "!" : issue.level === "warning" ? "△" : "i"}</span><div><small>${escapeHTML(issue.area)}</small><strong>${escapeHTML(issue.title)}</strong><p>${escapeHTML(issue.text)}</p></div></article>`).join("") : `<div class="aura-studio-audit-perfect"><span>✓</span><div><strong>Ótimo trabalho</strong><p>A análise básica não encontrou problemas críticos.</p></div></div>`}
      </div>
    `;
    content.querySelector("#aura-audit-refresh")?.addEventListener("click", openAudit);
    root.classList.remove("hidden");
  }

  function auditMetric(label, value) {
    return `<div><span><b>${escapeHTML(label)}</b><em>${value}/100</em></span><i><u style="width:${value}%"></u></i></div>`;
  }

  function closeAudit() {
    document.getElementById("aura-studio-audit")?.classList.add("hidden");
  }

  function setZoom(value) {
    state.zoom = Math.max(25, Math.min(180, Math.round(Number(value) / 5) * 5));
    localStorage.setItem("auraStudioZoom", state.zoom);
    const range = document.getElementById("aura-studio-zoom-range");
    const label = document.getElementById("aura-studio-zoom-label");
    if (range) range.value = state.zoom;
    if (label) label.textContent = `${state.zoom}%`;
    applyCanvasTransform();
  }

  function fitCanvas() {
    const frame = document.getElementById("lped-browser-frame");
    const workspace = frame?.parentElement;
    if (!frame || !workspace) return;
    const naturalWidth = state.device === "mobile" ? 390 : state.device === "tablet" ? 768 : 1200;
    const available = Math.max(260, workspace.clientWidth - (isMobileShellActive() ? 24 : 96));
    setZoom(Math.min(100, Math.floor((available / naturalWidth) * 100 / 5) * 5));
  }

  function setDevice(device) {
    state.device = ["desktop", "tablet", "mobile"].includes(device) ? device : "desktop";
    localStorage.setItem("auraStudioDevice", state.device);
    if (state.device === "mobile") window.alternarDispositivoPreview?.("mobile");
    else window.alternarDispositivoPreview?.("desktop");
    updateDeviceButtons();
    applyCanvasTransform();
    updateWorkspaceMeta();
  }

  function updateDeviceButtons() {
    document.getElementById("lped-btn-desktop")?.classList.toggle("aura-device-active", state.device === "desktop");
    document.getElementById("aura-studio-btn-tablet")?.classList.toggle("aura-device-active", state.device === "tablet");
    document.getElementById("lped-btn-mobile")?.classList.toggle("aura-device-active", state.device === "mobile");
  }

  function applyCanvasTransform() {
    const frame = document.getElementById("lped-browser-frame");
    const preview = document.getElementById("lped-preview-canvas");
    if (!frame || !preview) return;
    const width = state.device === "mobile" ? 390 : state.device === "tablet" ? 768 : 1200;
    frame.style.width = `${width}px`;
    frame.style.maxWidth = "none";
    frame.style.transformOrigin = "top center";
    frame.style.transform = `scale(${state.zoom / 100})`;
    frame.style.marginBottom = `${Math.max(0, frame.offsetHeight * (state.zoom / 100 - 1))}px`;
    frame.dataset.device = state.device;
    const size = document.getElementById("aura-studio-canvas-size");
    if (size) size.textContent = `${width} × auto`;
    const workspace = frame.parentElement;
    workspace?.classList.toggle("aura-studio-grid-enabled", state.grid);
    workspace?.classList.toggle("aura-studio-outline-enabled", state.outline);
  }

  function toggleGrid() {
    state.grid = !state.grid;
    localStorage.setItem("auraStudioGrid", String(state.grid));
    document.querySelector("[data-studio-bottom='grid']")?.classList.toggle("is-active", state.grid);
    applyCanvasTransform();
  }

  function toggleOutline() {
    state.outline = !state.outline;
    localStorage.setItem("auraStudioOutline", String(state.outline));
    document.querySelector("[data-studio-bottom='outline']")?.classList.toggle("is-active", state.outline);
    applyCanvasTransform();
  }

  function toggleInspector() {
    state.inspector = !state.inspector;
    localStorage.setItem("auraStudioInspector", String(state.inspector));
    document.getElementById("aura-studio-inspector")?.classList.toggle("is-collapsed", !state.inspector);
    document.querySelector("[data-studio-bottom='inspector']")?.classList.toggle("is-active", state.inspector);
    setTimeout(fitCanvas, 260);
  }

  function updateWorkspaceMeta() {
    const blocks = getBlocks();
    const count = document.getElementById("aura-studio-block-count");
    if (count) count.textContent = `${blocks.length} bloco${blocks.length === 1 ? "" : "s"}`;
    const score = document.getElementById("aura-studio-quality-score");
    if (score) score.textContent = state.lastAudit ? `Qualidade ${state.lastAudit.overall}/100` : "Qualidade —";
  }

  function applyPreviewEnhancements() {
    const preview = document.getElementById("lped-preview-canvas");
    if (!preview) return;
    getBlocks().forEach((block, index) => {
      const wrapper = document.getElementById(`lped-preview-bloco-${index}`);
      if (!wrapper) return;
      const d = block.design || {};
      wrapper.style.borderRadius = `${Number(d.raio || 0)}px`;
      wrapper.style.overflow = Number(d.raio || 0) > 0 ? "hidden" : "visible";
      wrapper.dataset.auraAnimation = d.animacao || "none";
      wrapper.style.setProperty("--aura-animation-duration", `${Number(d.duracaoAnimacao || 600)}ms`);
      wrapper.dataset.auraShadow = d.sombra || "none";
      wrapper.dataset.auraBlockIndex = String(index);
      wrapper.dataset.auraSelectionReady = "true";
    });
    applyCanvasTransform();
    updateWorkspaceMeta();
  }

  function bindDirtyTracking() {
    const modal = getModal();
    if (!modal || modal.dataset.auraDirtyBound === "true") return;
    modal.dataset.auraDirtyBound = "true";
    modal.addEventListener("input", (event) => {
      if (event.target.closest("#aura-studio-library, #aura-studio-command")) return;
      markDirty();
    });
    modal.addEventListener("change", (event) => {
      if (event.target.closest("#aura-studio-library, #aura-studio-command")) return;
      markDirty();
    });
    document.addEventListener("aura:studio-change", markDirty);
  }

  function wrapSaveFunctions() {
    if (window.salvarEditorLP && !window.salvarEditorLP.__auraWrapped) {
      const original = window.salvarEditorLP;
      const wrapped = async function (...args) {
        updateSaveStatus("saving");
        try {
          const result = await original.apply(this, args);
          markSaved();
          return result;
        } catch (error) {
          updateSaveStatus("error");
          throw error;
        }
      };
      wrapped.__auraWrapped = true;
      window.salvarEditorLP = wrapped;
    }

    if (window.publicarEditorLP && !window.publicarEditorLP.__auraWrapped) {
      const original = window.publicarEditorLP;
      const wrapped = async function (...args) {
        updateSaveStatus("saving");
        try {
          const result = await original.apply(this, args);
          markSaved();
          return result;
        } catch (error) {
          updateSaveStatus("error");
          throw error;
        }
      };
      wrapped.__auraWrapped = true;
      window.publicarEditorLP = wrapped;
    }
  }

  function bindKeyboard() {
    document.addEventListener("keydown", (event) => {
      const modal = getModal();
      if (!modal || modal.classList.contains("hidden")) return;
      const target = event.target;
      const typing = target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      const key = String(event.key || "").toLowerCase();

      if ((event.ctrlKey || event.metaKey) && key === "s") {
        event.preventDefault();
        window.salvarEditorLP?.();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === "k") {
        event.preventDefault();
        openCommand();
        return;
      }
      if (event.key === "Escape") {
        closeLibrary();
        closeAudit();
        closeCommand();
        return;
      }
      if (typing) return;
      if (key === "b") openLibrary();
      else if (key === "a") openAudit();
      else if (key === "g") toggleGrid();
      else if (key === "o") toggleOutline();
      else if (key === "i") toggleInspector();
      else if (key === "f") fitCanvas();
      else if (key === "1") setDevice("desktop");
      else if (key === "2") setDevice("tablet");
      else if (key === "3") setDevice("mobile");
      else if (key === "+" || key === "=") setZoom(state.zoom + 10);
      else if (key === "-") setZoom(state.zoom - 10);
    });

    window.addEventListener("beforeunload", (event) => {
      if (!state.dirty || !state.modalOpen) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }

  function watchModal() {
    const modal = getModal();
    if (!modal || state.modalObserver) return;
    state.modalObserver = new MutationObserver(() => {
      const open = !modal.classList.contains("hidden");
      if (open === state.modalOpen) return;
      state.modalOpen = open;
      if (open) {
        clearTimeout(state.modalTimer);
        state.modalTimer = setTimeout(() => {
          wrapSaveFunctions();
          markSaved();
          setDevice(state.device);
          document.getElementById("aura-studio-inspector")?.classList.toggle("is-collapsed", !state.inspector);
          applyPreviewEnhancements();
          fitCanvas();
          updateWorkspaceMeta();
          syncMobileShell();
        }, 180);
      } else {
        clearTimeout(state.modalTimer);
        clearTimeout(state.previewTimer);
        unmountMobileShell();
        closeLibrary();
        closeAudit();
        closeCommand();
      }
    });
    state.modalObserver.observe(modal, { attributes: true, attributeFilter: ["class"] });
  }

  function watchPreview() {
    const preview = document.getElementById("lped-preview-canvas");
    if (!preview || state.previewObserver) return;
    state.previewObserver = new MutationObserver(() => {
      clearTimeout(state.previewTimer);
      state.previewTimer = setTimeout(applyPreviewEnhancements, 35);
    });
    state.previewObserver.observe(preview, { childList: true, subtree: true });
  }

  function init() {
    if (state.initialized) return;
    const modal = getModal();
    if (!modal || !window.lpEditorBlocos || typeof window.renderizarEditorBlocos !== "function") {
      setTimeout(init, 120);
      return;
    }

    state.initialized = true;
    modal.classList.add("aura-studio-pro");
    injectTopbarEnhancements();
    injectMobileShellNav();
    injectLeftPanelTools();
    injectBottomBar();
    injectLibrary();
    injectAudit();
    injectCommandPalette();
    window.AuraStudioInspector?.init?.();
    bindDirtyTracking();
    bindKeyboard();
    watchModal();
    watchPreview();
    wrapSaveFunctions();
    updateDeviceButtons();
    updateWorkspaceMeta();
    state.mobile.media = window.matchMedia("(max-width: 767px)");
    const mediaHandler = () => syncMobileShell();
    if (state.mobile.media.addEventListener) state.mobile.media.addEventListener("change", mediaHandler);
    else state.mobile.media.addListener(mediaHandler);
    syncMobileShell();

    document.addEventListener("aura:personal-library-updated", () => {
      if (!document.getElementById("aura-studio-library")?.classList.contains("hidden")) renderLibrary();
    });

    window.AuraStudioPro = {
      openLibrary,
      closeLibrary,
      openAudit,
      closeAudit,
      openCommand,
      setDevice,
      setZoom,
      fitCanvas,
      setMobileView,
      getMobileView: () => state.mobile.view,
      isMobileShellActive,
      selectBlock: selectMobileBlock,
      moveMobileBlock,
      getMobileDiagnostics: () => ({
        mounted: state.mobile.mounted,
        view: state.mobile.view,
        listeners: state.mobile.listeners,
        observers: state.mobile.observers,
        mountCount: state.mobile.mountCount,
        unmountCount: state.mobile.unmountCount,
        scroll: { ...state.mobile.scroll }
      }),
      runAudit,
      insertPreset,
      renderLibrary,
      markDirty,
      markSaved,
      state
    };

    console.info("[Vide Aura Studio Pro] Inicializado", {
      presets: getAllPresets().length,
      version: window.AURA_STUDIO_LIBRARY_VERSION || "1.0.0"
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
