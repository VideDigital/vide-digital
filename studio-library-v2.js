(function (root) {
  "use strict";

  const VERSION = "2.0.0";
  const PAGE_SIZE = 48;
  const OPENERS = [
    "[data-studio-library-open='true']",
    ".aura-studio-library-launch",
    "[data-studio-left='library']",
    "[data-command-id='library']"
  ].join(",");

  const state = {
    ready: false,
    failed: false,
    open: false,
    query: "",
    category: "Todos",
    filter: "all",
    page: 1,
    pageSize: PAGE_SIZE,
    previewKey: "",
    previewDevice: "desktop",
    filtersOpen: false,
    catalog: null,
    catalogSignature: "",
    results: [],
    busyKey: "",
    searchTimer: 0,
    renderFrame: 0,
    previousFocus: null,
    previewTrigger: null,
    legacy: null,
    preferences: null,
    initAttempts: 0
  };

  const ICONS = Object.freeze({
    library: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="2"></rect><rect x="14" y="3" width="7" height="7" rx="2"></rect><rect x="3" y="14" width="7" height="7" rx="2"></rect><rect x="14" y="14" width="7" height="7" rx="2"></rect></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12"></path><path d="M18 6 6 18"></path></svg>',
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"></path></svg>',
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path><circle cx="12" cy="12" r="2.5"></circle></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>',
    filter: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16"></path><path d="M7 12h10"></path><path d="M10 18h4"></path></svg>',
    chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="m6 7 1 13h10l1-13"></path></svg>',
    mobile: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2" width="10" height="20" rx="2"></rect><path d="M11 18h2"></path></svg>',
    image: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"></rect><circle cx="9" cy="10" r="2"></circle><path d="m4 18 5-5 4 4 3-3 4 4"></path></svg>',
    layout: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M3 10h18"></path><path d="M9 10v10"></path></svg>',
    text: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14"></path><path d="M12 6v12"></path><path d="M8 18h8"></path></svg>',
    form: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"></rect><path d="M8 8h8"></path><path d="M8 12h8"></path><path d="M8 16h4"></path></svg>',
    help: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M9.8 9a2.4 2.4 0 1 1 3.6 2.1c-.9.5-1.4 1-1.4 2"></path><path d="M12 17h.01"></path></svg>',
    warning: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.5 20h19L12 3Z"></path><path d="M12 9v5"></path><path d="M12 17h.01"></path></svg>'
  });

  function adapter() {
    return root.AuraStudioLibraryV2Adapter || null;
  }

  function enabled() {
    return adapter()?.isFeatureEnabled(root) === true && !state.failed;
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function iconFor(item) {
    const value = `${item?.icon || ""} ${item?.category || ""} ${item?.type || ""}`.toLowerCase();
    if (/faq|help|pergunta/.test(value)) return ICONS.help;
    if (/form|captura|lead/.test(value)) return ICONS.form;
    if (/image|imagem|galeria|media|mídia/.test(value)) return ICONS.image;
    if (/text|texto|rich/.test(value)) return ICONS.text;
    return ICONS.layout;
  }

  function getRoot() {
    return document.getElementById("aura-studio-library");
  }

  function getModal() {
    return document.getElementById("lp-editor-modal");
  }

  function isEditorOpen() {
    const modal = getModal();
    return Boolean(modal && !modal.classList.contains("hidden"));
  }

  function toast(message, type) {
    if (typeof root.showToast === "function") root.showToast(message, type);
    else root.console?.[type === "error" ? "error" : "info"]?.(`[Library V2] ${message}`);
  }

  function highlightText(value, query) {
    const source = String(value || "");
    const terms = adapter()?.normalizeText(query).split(/\s+/).filter(Boolean) || [];
    if (!terms.length) return escapeHTML(source);
    let normalized = "";
    const map = [];
    let offset = 0;
    for (const character of source) {
      const folded = character.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const alphanumeric = folded.replace(/[^a-z0-9]/g, "");
      if (alphanumeric) {
        for (const resultCharacter of alphanumeric) {
          normalized += resultCharacter;
          map.push({ start: offset, end: offset + character.length });
        }
      } else if (normalized && !normalized.endsWith(" ")) {
        normalized += " ";
        map.push({ start: offset, end: offset + character.length });
      }
      offset += character.length;
    }
    normalized = normalized.trimEnd();
    const ranges = [];
    terms.forEach((term) => {
      let start = normalized.indexOf(term);
      while (start >= 0) {
        const end = start + term.length;
        if (map[start] && map[end - 1]) ranges.push([map[start].start, map[end - 1].end]);
        start = normalized.indexOf(term, start + term.length);
      }
    });
    if (!ranges.length) return escapeHTML(source);
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [];
    ranges.forEach((range) => {
      const last = merged[merged.length - 1];
      if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
      else merged.push([...range]);
    });
    let cursor = 0;
    let output = "";
    merged.forEach(([start, end]) => {
      output += escapeHTML(source.slice(cursor, start));
      output += `<mark>${escapeHTML(source.slice(start, end))}</mark>`;
      cursor = end;
    });
    return output + escapeHTML(source.slice(cursor));
  }

  function catalogSignature() {
    const presets = Array.isArray(root.AURA_STUDIO_PRESETS) ? root.AURA_STUDIO_PRESETS : [];
    const last = presets[presets.length - 1];
    const registryVersion = root.AuraStudioBlockRegistry?.getVersion?.();
    const personal = root.AuraStudioInspector?.readPersonalBlocks?.() || [];
    return [
      presets.length,
      last?.id || "",
      registryVersion?.definitions || 0,
      registryVersion?.registry || "none",
      personal.length
    ].join(":");
  }

  function createCatalog(force) {
    const signature = catalogSignature();
    if (!force && state.catalog && signature === state.catalogSignature) return state.catalog;
    const presets = Array.isArray(root.AURA_STUDIO_PRESETS) ? root.AURA_STUDIO_PRESETS : [];
    let personalPresets = [];
    try {
      personalPresets = root.AuraStudioInspector?.readPersonalBlocks?.() || [];
    } catch (_) {
      personalPresets = [];
    }
    state.catalog = adapter().createCatalog({
      registry: root.AuraStudioBlockRegistry || null,
      presets,
      personalPresets
    });
    state.catalogSignature = signature;
    return state.catalog;
  }

  function captureLegacyShell() {
    if (state.legacy) return;
    const library = getRoot();
    if (!library) return;
    state.legacy = {
      className: library.className,
      ariaHidden: library.getAttribute("aria-hidden"),
      nodes: Array.from(library.childNodes),
      api: {
        openLibrary: root.AuraStudioPro?.openLibrary,
        closeLibrary: root.AuraStudioPro?.closeLibrary,
        renderLibrary: root.AuraStudioPro?.renderLibrary,
        insertPreset: root.AuraStudioPro?.insertPreset
      }
    };
  }

  function restoreLegacyShell() {
    const library = getRoot();
    if (!library || !state.legacy) return;
    library.replaceChildren(...state.legacy.nodes);
    library.className = state.legacy.className;
    if (state.legacy.ariaHidden === null) library.removeAttribute("aria-hidden");
    else library.setAttribute("aria-hidden", state.legacy.ariaHidden);
  }

  function shellMarkup() {
    return `
      <div class="aura-v2-backdrop" data-v2-action="close"></div>
      <section class="aura-v2-dialog" role="dialog" aria-modal="true" aria-labelledby="aura-v2-title" aria-describedby="aura-v2-description">
        <header class="aura-v2-header">
          <div class="aura-v2-brand">
            <span class="aura-v2-brand-icon">${ICONS.library}</span>
            <div><small>Catálogo profissional</small><h2 id="aura-v2-title">Biblioteca de blocos</h2><p id="aura-v2-description">Encontre, visualize e insira estruturas prontas.</p></div>
          </div>
          <div class="aura-v2-header-stats" aria-live="polite"><strong data-v2-total>0</strong><span>itens</span><i></i><strong data-v2-canonical>0</strong><span>canônicos</span></div>
          <button type="button" class="aura-v2-icon-button aura-v2-close" data-v2-action="close" aria-label="Fechar biblioteca">${ICONS.close}</button>
        </header>

        <div class="aura-v2-toolbar">
          <label class="aura-v2-search">
            <span>${ICONS.search}</span>
            <input type="search" data-v2-search autocomplete="off" placeholder="Buscar banner, preço, WhatsApp, curso, FAQ..." aria-label="Pesquisar blocos">
            <button type="button" data-v2-action="clear-query" aria-label="Limpar pesquisa" hidden>${ICONS.close}</button>
            <kbd>Ctrl K</kbd>
          </label>
          <button type="button" class="aura-v2-mobile-filter" data-v2-action="toggle-filters" aria-expanded="false">${ICONS.filter}<span>Filtros</span></button>
        </div>

        <div class="aura-v2-workspace">
          <aside class="aura-v2-sidebar" aria-label="Categorias">
            <div class="aura-v2-sidebar-head"><strong>Categorias</strong><button type="button" data-v2-action="toggle-filters" aria-label="Fechar filtros">${ICONS.close}</button></div>
            <nav data-v2-categories></nav>
          </aside>

          <main class="aura-v2-main">
            <div class="aura-v2-filterbar" role="toolbar" aria-label="Filtros do catálogo">
              ${[
                ["all", "Todos"],
                ["system", "Sistema"],
                ["canonical", "Canônicos"],
                ["legacy", "Legados"],
                ["favorites", "Favoritos"],
                ["recent", "Recentes"],
                ["experimental", "Experimentais"],
                ["mobile", "Mobile"]
              ].map(([value, label]) => `<button type="button" data-v2-filter="${value}" aria-pressed="${value === "all"}">${value === "favorites" ? ICONS.star : value === "mobile" ? ICONS.mobile : ""}<span>${label}</span></button>`).join("")}
            </div>

            <div class="aura-v2-context">
              <div><small data-v2-eyebrow>Todos os itens</small><h3 data-v2-heading>Escolha uma estrutura</h3></div>
              <div class="aura-v2-result-actions"><span data-v2-results aria-live="polite">Carregando…</span><button type="button" data-v2-action="clear-recents" hidden>${ICONS.trash}<span>Limpar recentes</span></button></div>
            </div>

            <div class="aura-v2-mode" data-v2-mode hidden></div>
            <div class="aura-v2-grid" data-v2-grid role="list" aria-busy="true"></div>
            <div class="aura-v2-pagination" data-v2-pagination hidden><button type="button" data-v2-action="load-more">Carregar mais</button><span data-v2-page-status></span></div>
          </main>
        </div>

        <aside class="aura-v2-preview" data-v2-preview-panel aria-hidden="true" aria-labelledby="aura-v2-preview-title">
          <div class="aura-v2-preview-backdrop" data-v2-action="close-preview"></div>
          <section>
            <header><div><small>Preview seguro</small><h3 id="aura-v2-preview-title" data-v2-preview-title>Visualização</h3></div><button type="button" data-v2-action="close-preview" aria-label="Fechar preview">${ICONS.close}</button></header>
            <div class="aura-v2-preview-devices" role="group" aria-label="Tamanho do preview">
              <button type="button" data-v2-device="desktop" aria-pressed="true">Desktop</button>
              <button type="button" data-v2-device="tablet" aria-pressed="false">Tablet</button>
              <button type="button" data-v2-device="mobile" aria-pressed="false">Mobile</button>
            </div>
            <div class="aura-v2-preview-stage" data-v2-preview-stage data-device="desktop"><div data-v2-preview-content></div></div>
            <div class="aura-v2-preview-info" data-v2-preview-info></div>
            <footer><button type="button" class="aura-v2-secondary" data-v2-action="toggle-favorite-preview">${ICONS.star}<span>Favoritar</span></button><button type="button" class="aura-v2-primary" data-v2-action="insert-preview">${ICONS.plus}<span>Inserir bloco</span></button></footer>
          </section>
        </aside>

        <div class="aura-v2-live" data-v2-live aria-live="polite" aria-atomic="true"></div>
      </section>
    `;
  }

  function buildShell() {
    captureLegacyShell();
    const library = getRoot();
    if (!library) throw new Error("Painel legado da biblioteca não foi encontrado.");
    library.replaceChildren();
    library.innerHTML = shellMarkup();
    library.classList.add("aura-library-v2");
    library.setAttribute("aria-hidden", "true");
  }

  function renderSkeleton() {
    const grid = getRoot()?.querySelector("[data-v2-grid]");
    if (!grid) return;
    grid.setAttribute("aria-busy", "true");
    grid.innerHTML = Array.from({ length: 8 }, () => `
      <div class="aura-v2-card aura-v2-card-skeleton" aria-hidden="true"><div></div><span></span><strong></strong><p></p><p></p></div>
    `).join("");
  }

  function currentFavorites() {
    return state.preferences?.favorites?.() || [];
  }

  function currentRecents() {
    return state.preferences?.recents?.() || [];
  }

  function filteredItems(categoryOverride) {
    return adapter().filterCatalog(state.catalog?.items || [], {
      query: state.query,
      category: categoryOverride === undefined ? state.category : categoryOverride,
      filter: state.filter,
      favorites: new Set(currentFavorites()),
      recents: currentRecents()
    });
  }

  function renderCategories() {
    const container = getRoot()?.querySelector("[data-v2-categories]");
    if (!container || !state.catalog) return;
    const countBase = filteredItems("Todos");
    const counts = new Map();
    countBase.forEach((item) => counts.set(item.category, (counts.get(item.category) || 0) + 1));
    const categories = ["Todos", ...state.catalog.categories];
    container.innerHTML = categories.map((category) => {
      const count = category === "Todos" ? countBase.length : (counts.get(category) || 0);
      return `<button type="button" data-v2-category="${escapeHTML(category)}" aria-pressed="${state.category === category}" class="${state.category === category ? "is-active" : ""}"><span>${escapeHTML(category)}</span><b>${count}</b>${ICONS.chevron}</button>`;
    }).join("");
  }

  function cardVisual(item) {
    if (item.thumbnail) {
      return `<img src="${escapeHTML(item.thumbnail)}" alt="" loading="lazy" decoding="async">`;
    }
    const className = `is-${adapter().normalizeText(item.category).replace(/\s+/g, "-") || "default"}`;
    return `<div class="aura-v2-card-placeholder ${escapeHTML(className)}"><span class="aura-v2-placeholder-icon">${iconFor(item)}</span><i></i><b></b><em></em></div>`;
  }

  function cardMarkup(item, favorites) {
    const favorite = favorites.has(item.key);
    const badges = [
      `<span class="aura-v2-source is-${escapeHTML(item.source)}">${escapeHTML(item.sourceLabel)}</span>`,
      item.experimental ? '<span class="aura-v2-badge is-experimental">Experimental</span>' : "",
      item.kind === "preset" ? '<span class="aura-v2-badge is-legacy">Compatível</span>' : ""
    ].filter(Boolean).join("");
    const count = item.kind === "preset"
      ? `${item.blockCount || 0} bloco${item.blockCount === 1 ? "" : "s"}`
      : `v${item.version || 1}`;
    return `
      <article class="aura-v2-card ${item.invalid ? "is-disabled" : ""} ${state.busyKey === item.key ? "is-loading" : ""}" data-v2-card="${escapeHTML(item.key)}" role="listitem" tabindex="${item.invalid ? "-1" : "0"}" aria-label="${escapeHTML(`${item.title}. ${item.category}. Pressione Enter para inserir.`)}">
        <div class="aura-v2-card-visual">
          ${cardVisual(item)}
          <div class="aura-v2-card-badges">${badges}</div>
          <button type="button" class="aura-v2-favorite ${favorite ? "is-active" : ""}" data-v2-favorite="${escapeHTML(item.key)}" aria-label="${favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}" aria-pressed="${favorite}">${ICONS.star}</button>
          <button type="button" class="aura-v2-quick-preview" data-v2-preview="${escapeHTML(item.key)}" aria-label="Visualizar ${escapeHTML(item.title)}">${ICONS.eye}<span>Preview</span></button>
        </div>
        <div class="aura-v2-card-content">
          <div class="aura-v2-card-meta"><span>${escapeHTML(item.category)}</span><b>${escapeHTML(count)}</b></div>
          <h4>${highlightText(item.title, state.query)}</h4>
          <p>${escapeHTML(item.description)}</p>
          <div class="aura-v2-card-actions"><button type="button" data-v2-preview="${escapeHTML(item.key)}" class="aura-v2-secondary">Detalhes</button><button type="button" data-v2-insert="${escapeHTML(item.key)}" class="aura-v2-primary" ${item.invalid || state.busyKey ? "disabled" : ""}>${state.busyKey === item.key ? "Inserindo…" : `${ICONS.plus}<span>Inserir</span>`}</button></div>
        </div>
      </article>
    `;
  }

  function emptyMarkup() {
    const suggestions = adapter().suggestCategories(state.catalog?.items || [], state.query, 3);
    let title = "Nenhum item encontrado";
    let text = "Tente remover filtros ou usar outro termo de pesquisa.";
    if (state.filter === "favorites") {
      title = "Sua coleção de favoritos está vazia";
      text = "Use a estrela nos cards para guardar os blocos que mais utiliza.";
    } else if (state.filter === "recent") {
      title = "Nenhum item recente";
      text = "Os blocos inseridos aparecerão aqui para acesso rápido.";
    } else if (!state.catalog?.items.length) {
      title = "Catálogo indisponível";
      text = "A biblioteca anterior continua disponível como fallback.";
    }
    return `
      <div class="aura-v2-empty">
        <span>${ICONS.search}</span><h4>${escapeHTML(title)}</h4><p>${escapeHTML(text)}</p>
        ${suggestions.length ? `<div><small>Categorias relacionadas</small>${suggestions.map((category) => `<button type="button" data-v2-category="${escapeHTML(category)}">${escapeHTML(category)}</button>`).join("")}</div>` : ""}
        <button type="button" class="aura-v2-primary" data-v2-action="reset-filters">Limpar filtros</button>
      </div>
    `;
  }

  function renderMode() {
    const mode = getRoot()?.querySelector("[data-v2-mode]");
    if (!mode || !state.catalog) return;
    const messages = [];
    if (!state.catalog.registryAvailable) messages.push(`${ICONS.warning}<span><strong>Modo de compatibilidade</strong> O Block Registry não respondeu; os presets legados continuam disponíveis.</span>`);
    const partialErrors = state.catalog.warnings.filter((warning) => warning.code === "registry-unavailable").length;
    if (partialErrors) messages.push(`${ICONS.warning}<span>Parte do catálogo não pôde ser carregada.</span>`);
    mode.hidden = !messages.length;
    mode.innerHTML = messages.join("");
  }

  function render() {
    if (!state.open || !state.catalog) return;
    const library = getRoot();
    const grid = library?.querySelector("[data-v2-grid]");
    if (!grid) return;
    state.results = filteredItems();
    const page = adapter().paginate(state.results, state.page, state.pageSize);
    const favorites = new Set(currentFavorites());

    renderCategories();
    renderMode();
    library.querySelectorAll("[data-v2-filter]").forEach((button) => {
      const active = button.dataset.v2Filter === state.filter;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const total = library.querySelector("[data-v2-total]");
    const canonical = library.querySelector("[data-v2-canonical]");
    const heading = library.querySelector("[data-v2-heading]");
    const eyebrow = library.querySelector("[data-v2-eyebrow]");
    const results = library.querySelector("[data-v2-results]");
    const clearRecents = library.querySelector("[data-v2-action='clear-recents']");
    if (total) total.textContent = String(state.catalog.stats.total);
    if (canonical) canonical.textContent = String(state.catalog.stats.canonical);
    if (heading) heading.textContent = state.category === "Todos" ? "Escolha uma estrutura" : state.category;
    if (eyebrow) eyebrow.textContent = state.query ? `Pesquisa por “${state.query}”` : state.filter === "all" ? "Todos os itens" : library.querySelector(`[data-v2-filter='${state.filter}'] span`)?.textContent || "Catálogo";
    if (results) results.textContent = `${state.results.length} resultado${state.results.length === 1 ? "" : "s"}`;
    if (clearRecents) clearRecents.hidden = state.filter !== "recent" || !currentRecents().length;

    grid.setAttribute("aria-busy", "false");
    grid.innerHTML = page.items.length ? page.items.map((item) => cardMarkup(item, favorites)).join("") : emptyMarkup();
    const pagination = library.querySelector("[data-v2-pagination]");
    const pageStatus = library.querySelector("[data-v2-page-status]");
    if (pagination) pagination.hidden = !page.hasMore;
    if (pageStatus) pageStatus.textContent = `${page.items.length} de ${page.total}`;
    const clearQuery = library.querySelector("[data-v2-action='clear-query']");
    if (clearQuery) clearQuery.hidden = !state.query;
  }

  function scheduleRender(resetPage) {
    if (resetPage) state.page = 1;
    if (state.renderFrame) cancelAnimationFrame(state.renderFrame);
    state.renderFrame = requestAnimationFrame(() => {
      state.renderFrame = 0;
      render();
    });
  }

  function announce(message) {
    const live = getRoot()?.querySelector("[data-v2-live]");
    if (!live) return;
    live.textContent = "";
    requestAnimationFrame(() => { live.textContent = message; });
  }

  function findItem(key) {
    return state.catalog?.items.find((item) => item.key === key) || null;
  }

  function renderPreview(key) {
    const item = findItem(key);
    const library = getRoot();
    const panel = library?.querySelector("[data-v2-preview-panel]");
    if (!item || !panel) return;
    const preview = adapter().createPreview(item, { registry: root.AuraStudioBlockRegistry || null });
    const content = panel.querySelector("[data-v2-preview-content]");
    const title = panel.querySelector("[data-v2-preview-title]");
    const info = panel.querySelector("[data-v2-preview-info]");
    const stage = panel.querySelector("[data-v2-preview-stage]");
    if (title) title.textContent = item.title;
    if (stage) stage.dataset.device = state.previewDevice;
    panel.querySelectorAll("[data-v2-device]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.v2Device === state.previewDevice)));

    if (content) {
      if (preview.kind === "trusted-html") content.innerHTML = `<div class="aura-v2-trusted-preview">${preview.html}</div>`;
      else if (preview.kind === "image") content.innerHTML = `<img src="${escapeHTML(preview.src)}" alt="${escapeHTML(preview.alt || item.title)}">`;
      else if (preview.kind === "blocked") content.innerHTML = `<div class="aura-v2-preview-message is-warning">${ICONS.warning}<strong>${escapeHTML(preview.title)}</strong><p>${escapeHTML(preview.message)}</p></div>`;
      else if (preview.kind === "error") content.innerHTML = `<div class="aura-v2-preview-message is-error">${ICONS.warning}<strong>Preview indisponível</strong><p>${escapeHTML(preview.message)}</p></div>`;
      else content.innerHTML = `<div class="aura-v2-preview-placeholder"><span>${iconFor(item)}</span><small>${escapeHTML(item.category)}</small><strong>${escapeHTML(preview.label || item.title)}</strong><i></i><b></b></div>`;
    }
    if (info) {
      info.innerHTML = `<div><span class="aura-v2-source is-${escapeHTML(item.source)}">${escapeHTML(item.sourceLabel)}</span><span>${escapeHTML(item.category)}</span>${item.experimental ? '<span class="aura-v2-badge is-experimental">Experimental</span>' : ""}</div><p>${escapeHTML(item.description)}</p><dl><div><dt>Tipo</dt><dd>${escapeHTML(item.type)}</dd></div><div><dt>Versão</dt><dd>${escapeHTML(item.version)}</dd></div><div><dt>Mobile</dt><dd>${item.mobileCompatible ? "Compatível" : "Revisão necessária"}</dd></div></dl>${item.tags.length ? `<ul aria-label="Palavras-chave">${item.tags.slice(0, 8).map((tag) => `<li>${escapeHTML(tag)}</li>`).join("")}</ul>` : ""}`;
    }
    const favorite = state.preferences.isFavorite(item.key);
    const favoriteButton = panel.querySelector("[data-v2-action='toggle-favorite-preview']");
    favoriteButton?.classList.toggle("is-active", favorite);
    favoriteButton?.setAttribute("aria-pressed", String(favorite));
    const favoriteLabel = favoriteButton?.querySelector("span");
    if (favoriteLabel) favoriteLabel.textContent = favorite ? "Favoritado" : "Favoritar";
  }

  function openPreview(key, trigger) {
    const panel = getRoot()?.querySelector("[data-v2-preview-panel]");
    if (!panel || !findItem(key)) return;
    state.previewKey = key;
    state.previewTrigger = trigger || null;
    state.previewDevice = "desktop";
    renderPreview(key);
    panel.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
    setTimeout(() => panel.querySelector("[data-v2-action='close-preview']")?.focus(), 20);
  }

  function closePreview() {
    const panel = getRoot()?.querySelector("[data-v2-preview-panel]");
    panel?.classList.remove("is-open");
    panel?.setAttribute("aria-hidden", "true");
    state.previewKey = "";
    const trigger = state.previewTrigger;
    state.previewTrigger = null;
    if (trigger?.isConnected) setTimeout(() => trigger.focus(), 10);
  }

  function resetState() {
    state.query = "";
    state.category = "Todos";
    state.filter = "all";
    state.page = 1;
    state.previewKey = "";
    state.previewDevice = "desktop";
    state.filtersOpen = false;
    const search = getRoot()?.querySelector("[data-v2-search]");
    if (search) search.value = "";
  }

  function open() {
    if (!enabled()) return state.legacy?.api?.openLibrary?.();
    try {
      if (!getRoot()?.classList.contains("aura-library-v2")) buildShell();
      const library = getRoot();
      state.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      state.open = true;
      resetState();
      library.classList.remove("hidden");
      library.setAttribute("aria-hidden", "false");
      renderSkeleton();
      setTimeout(() => {
        try {
          createCatalog(false);
          render();
          library.querySelector("[data-v2-search]")?.focus();
        } catch (error) {
          failToLegacy(error);
        }
      }, 0);
    } catch (error) {
      failToLegacy(error);
    }
  }

  function close() {
    const library = getRoot();
    if (!library) return;
    closePreview();
    state.open = false;
    state.filtersOpen = false;
    library.classList.remove("is-filter-open");
    library.classList.add("hidden");
    library.setAttribute("aria-hidden", "true");
    if (state.previousFocus?.isConnected) setTimeout(() => state.previousFocus.focus(), 10);
    state.previousFocus = null;
  }

  function failToLegacy(error) {
    root.console?.warn?.("[Studio Library V2] Falha ao ativar; mantendo a biblioteca anterior.", error);
    state.failed = true;
    state.open = false;
    restoreLegacyShell();
    if (root.AuraStudioPro && state.legacy?.api) {
      root.AuraStudioPro.openLibrary = state.legacy.api.openLibrary;
      root.AuraStudioPro.closeLibrary = state.legacy.api.closeLibrary;
      root.AuraStudioPro.renderLibrary = state.legacy.api.renderLibrary;
    }
    state.legacy?.api?.openLibrary?.();
  }

  async function insertItem(key) {
    const item = findItem(key);
    if (!item || state.busyKey) return;
    state.busyKey = key;
    announce(`Inserindo ${item.title}.`);
    render();
    const result = await adapter().insertLibraryItem(item, {
      studio: root.AuraStudioPro,
      presets: Array.isArray(root.AURA_STUDIO_PRESETS) ? root.AURA_STUDIO_PRESETS : [],
      preferences: state.preferences
    });
    state.busyKey = "";
    if (result.ok) {
      announce(`${item.title} inserido.`);
      close();
      return;
    }
    if (result.reason !== "duplicate-insert") {
      const message = result.error?.message || "Não foi possível inserir este item.";
      announce(message);
      toast(message, "error");
      render();
    }
  }

  function toggleFavorite(key) {
    const item = findItem(key);
    if (!item) return;
    const wasFavorite = state.preferences.isFavorite(key);
    state.preferences.toggleFavorite(key);
    announce(wasFavorite ? `${item.title} removido dos favoritos.` : `${item.title} adicionado aos favoritos.`);
    render();
    if (state.previewKey === key) renderPreview(key);
  }

  function stopEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  function captureClick(event) {
    if (!enabled()) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const modal = getModal();
    const opener = target.closest(OPENERS);
    if (opener && modal?.contains(opener)) {
      stopEvent(event);
      root.AuraStudioPro?.closeCommand?.();
      open();
      return;
    }
    const library = getRoot();
    if (!state.open || !library?.contains(target)) return;
    stopEvent(event);

    const action = target.closest("[data-v2-action]")?.dataset.v2Action;
    const category = target.closest("[data-v2-category]")?.dataset.v2Category;
    const filter = target.closest("[data-v2-filter]")?.dataset.v2Filter;
    const favorite = target.closest("[data-v2-favorite]")?.dataset.v2Favorite;
    const preview = target.closest("[data-v2-preview]")?.dataset.v2Preview;
    const insert = target.closest("[data-v2-insert]")?.dataset.v2Insert;
    const device = target.closest("[data-v2-device]")?.dataset.v2Device;

    if (action === "close") close();
    else if (action === "close-preview") closePreview();
    else if (action === "clear-query") {
      state.query = "";
      const search = library.querySelector("[data-v2-search]");
      if (search) search.value = "";
      scheduleRender(true);
      search?.focus();
    } else if (action === "reset-filters") {
      state.query = "";
      state.category = "Todos";
      state.filter = "all";
      const search = library.querySelector("[data-v2-search]");
      if (search) search.value = "";
      scheduleRender(true);
    } else if (action === "load-more") {
      state.page += 1;
      scheduleRender(false);
    } else if (action === "clear-recents") {
      state.preferences.clearRecents();
      announce("Itens recentes removidos.");
      scheduleRender(true);
    } else if (action === "toggle-filters") {
      state.filtersOpen = !state.filtersOpen;
      library.classList.toggle("is-filter-open", state.filtersOpen);
      library.querySelector("[data-v2-action='toggle-filters']")?.setAttribute("aria-expanded", String(state.filtersOpen));
    } else if (action === "toggle-favorite-preview" && state.previewKey) toggleFavorite(state.previewKey);
    else if (action === "insert-preview" && state.previewKey) insertItem(state.previewKey);
    else if (category) {
      state.category = category;
      state.filtersOpen = false;
      library.classList.remove("is-filter-open");
      scheduleRender(true);
    } else if (filter) {
      state.filter = filter;
      scheduleRender(true);
    } else if (favorite) toggleFavorite(favorite);
    else if (preview) openPreview(preview, target.closest("button") || target);
    else if (insert) insertItem(insert);
    else if (device && state.previewKey) {
      state.previewDevice = device;
      renderPreview(state.previewKey);
    } else {
      const card = target.closest("[data-v2-card]");
      if (card) openPreview(card.dataset.v2Card, card);
    }
  }

  function captureInput(event) {
    if (!enabled() || !state.open) return;
    const target = event.target;
    const library = getRoot();
    if (!(target instanceof HTMLInputElement) || !target.matches("[data-v2-search]") || !library?.contains(target)) return;
    stopEvent(event);
    state.query = target.value;
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => scheduleRender(true), 130);
    const clear = library.querySelector("[data-v2-action='clear-query']");
    if (clear) clear.hidden = !state.query;
  }

  function isTyping(target) {
    return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
  }

  function captureKey(event) {
    if (!enabled() || !isEditorOpen()) return;
    const key = String(event.key || "").toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === "k") {
      stopEvent(event);
      if (!state.open) open();
      else getRoot()?.querySelector("[data-v2-search]")?.focus();
      return;
    }
    if (!state.open && !isTyping(event.target) && key === "b") {
      stopEvent(event);
      open();
      return;
    }
    if (!state.open) return;
    if (key === "escape") {
      stopEvent(event);
      const action = adapter().resolveEscapeAction({
        previewOpen: Boolean(state.previewKey),
        filtersOpen: state.filtersOpen,
        libraryOpen: state.open
      });
      if (action === "close-preview") closePreview();
      else if (action === "close-filters") {
        state.filtersOpen = false;
        getRoot()?.classList.remove("is-filter-open");
      } else if (action === "close-library") close();
      return;
    }
    const card = event.target instanceof Element ? event.target.closest("[data-v2-card]") : null;
    if (key === "enter" && card && !event.target.closest("button, a, input")) {
      stopEvent(event);
      insertItem(card.dataset.v2Card);
    }
  }

  function bind() {
    root.addEventListener("click", captureClick, true);
    root.addEventListener("input", captureInput, true);
    root.addEventListener("keydown", captureKey, true);
    document.addEventListener("aura:studio-library-expanded", () => {
      state.catalogSignature = "";
      if (state.open) {
        createCatalog(true);
        scheduleRender(true);
      }
    });
    document.addEventListener("aura:personal-library-updated", () => {
      state.catalogSignature = "";
      if (state.open) {
        createCatalog(true);
        scheduleRender(true);
      }
    });
  }

  function patchApi() {
    const api = root.AuraStudioPro;
    if (!api) throw new Error("AuraStudioPro indisponível.");
    if (api.__auraLibraryV2) return;
    captureLegacyShell();
    api.openLibrary = open;
    api.closeLibrary = close;
    api.renderLibrary = () => scheduleRender(false);
    api.__auraLibraryV2 = true;
  }

  function diagnostics() {
    return {
      version: VERSION,
      enabled: enabled(),
      open: state.open,
      failed: state.failed,
      catalog: state.catalog ? { ...state.catalog.stats, registryAvailable: state.catalog.registryAvailable } : null,
      renderedCards: getRoot()?.querySelectorAll("[data-v2-card]").length || 0,
      results: state.results.length,
      page: state.page,
      pageSize: state.pageSize,
      category: state.category,
      filter: state.filter,
      previewOpen: Boolean(state.previewKey)
    };
  }

  function init() {
    if (state.ready || state.failed || root.AURA_STUDIO_LIBRARY_V2_ENABLED !== true) return;
    if (!adapter() || !root.AuraStudioPro || !getRoot()) {
      state.initAttempts += 1;
      if (state.initAttempts < 40) setTimeout(init, 120);
      else root.console?.warn?.("[Studio Library V2] Dependências indisponíveis; mantendo a biblioteca anterior.");
      return;
    }
    try {
      state.preferences = adapter().createPreferenceStore();
      patchApi();
      bind();
      state.ready = true;
      root.AuraStudioLibraryV2 = Object.freeze({
        version: VERSION,
        open,
        close,
        refresh() {
          state.catalogSignature = "";
          createCatalog(true);
          scheduleRender(true);
        },
        diagnostics,
        isEnabled: enabled
      });
      root.console?.info?.("[Vide Aura Studio] Library V2 pronta.", { version: VERSION });
    } catch (error) {
      failToLegacy(error);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(typeof window !== "undefined" ? window : globalThis);
