/**
 * Vide Aura — Biblioteca Virtual V5.1
 * Renderização incremental para bibliotecas com centenas ou milhares de modelos.
 * Versão 5.1.0
 */
(function () {
  "use strict";

  const VERSION = "5.1.0";
  const KEYS = Object.freeze({
    favorites: "auraStudioFavoritesV1",
    recents: "auraStudioRecentsV1",
    personal: "auraStudioPersonalBlocksV1",
    density: "auraV51LibraryDensity"
  });

  const state = {
    initialized: false,
    active: false,
    query: "",
    category: "Todos",
    objective: "Todos",
    favoritesOnly: false,
    results: [],
    rendered: 0,
    batch: 24,
    density: clamp(Number(localStorage.getItem(KEYS.density) || 3), 2, 4),
    searchTimer: 0,
    loadObserver: null,
    rootObserver: null,
    suppressRootObserver: false,
    lastSignature: ""
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || min));
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getRoot() {
    return document.getElementById("aura-studio-library");
  }

  function getGrid() {
    return document.getElementById("aura-library-grid");
  }

  function readList(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? value : [];
    } catch (error) {
      return [];
    }
  }

  function writeList(key, values, limit = 200) {
    try {
      localStorage.setItem(key, JSON.stringify(values.slice(0, limit)));
    } catch (error) {
      console.warn("[Aura Virtual Library V5.1] Não foi possível salvar a preferência.", error);
    }
  }

  function getPresets() {
    const defaults = Array.isArray(window.AURA_STUDIO_PRESETS)
      ? window.AURA_STUDIO_PRESETS
      : [];
    const personal = window.AuraStudioInspector?.readPersonalBlocks?.() || readList(KEYS.personal);

    return [...personal, ...defaults];
  }

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function filteredResults() {
    const presets = getPresets();
    const favorites = new Set(readList(KEYS.favorites));
    const recents = readList(KEYS.recents);
    const recentOrder = new Map(recents.map((id, index) => [id, index]));
    const term = normalize(state.query.trim());

    let results = presets.filter((preset) => {
      if (state.category === "Favoritos" || state.favoritesOnly) {
        if (!favorites.has(preset.id)) return false;
      } else if (state.category === "Recentes") {
        if (!recentOrder.has(preset.id)) return false;
      } else if (state.category !== "Todos" && preset.categoria !== state.category) {
        return false;
      }

      if (state.objective !== "Todos" && preset.objetivo !== state.objective) {
        return false;
      }

      if (term) {
        const haystack = normalize([
          preset.nome,
          preset.categoria,
          preset.objetivo,
          preset.nicho,
          preset.estilo,
          ...(preset.tags || [])
        ].filter(Boolean).join(" "));

        if (!haystack.includes(term)) return false;
      }

      return true;
    });

    if (state.category === "Recentes") {
      results = results.sort((a, b) => {
        return (recentOrder.get(a.id) ?? 9999) - (recentOrder.get(b.id) ?? 9999);
      });
    }

    return results;
  }

  function open(options = {}) {
    const root = getRoot();
    if (!root) return;

    state.active = true;
    state.query = options.preserve ? state.query : "";
    state.category = options.preserve ? state.category : "Todos";
    state.objective = options.preserve ? state.objective : "Todos";
    state.favoritesOnly = options.preserve ? state.favoritesOnly : false;

    const proState = window.AuraStudioPro?.state;
    if (proState) {
      proState.query = state.query;
      proState.activeCategory = state.category;
      proState.objective = state.objective;
      proState.favoritesOnly = state.favoritesOnly;
    }

    root.dataset.auraV51Owned = "true";
    root.classList.remove("hidden");
    root.classList.add("aura-v51-library-virtual");

    const search = document.getElementById("aura-library-search");
    if (search) search.value = state.query;

    const favoriteButton = document.getElementById("aura-library-favorites");
    favoriteButton?.classList.toggle("is-active", state.favoritesOnly);

    renderFilters();
    render(true);

    window.setTimeout(() => search?.focus(), 30);
  }

  function close() {
    state.active = false;
    getRoot()?.classList.add("hidden");
    disconnectLoadObserver();
  }

  function setDensity(value) {
    state.density = clamp(value, 2, 4);
    localStorage.setItem(KEYS.density, String(state.density));
    getRoot()?.style.setProperty("--aura-v51-library-columns", String(state.density));
  }

  function renderFilters() {
    const presets = getPresets();
    const categories = [
      "Todos",
      "Recentes",
      "Favoritos",
      ...Array.from(new Set(presets.map((preset) => preset.categoria).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b, "pt-BR"))
    ];
    const objectives = [
      "Todos",
      ...Array.from(new Set(presets.map((preset) => preset.objetivo).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b, "pt-BR"))
    ];
    const favorites = readList(KEYS.favorites);
    const recents = readList(KEYS.recents);
    const categoryRoot = document.getElementById("aura-library-categories");
    const objectiveRoot = document.getElementById("aura-library-objective");

    if (categoryRoot) {
      categoryRoot.innerHTML = categories.map((category) => {
        const count = category === "Todos"
          ? presets.length
          : category === "Recentes"
            ? recents.length
            : category === "Favoritos"
              ? favorites.length
              : presets.reduce((total, preset) => total + (preset.categoria === category ? 1 : 0), 0);

        return `
          <button
            type="button"
            data-library-category="${escapeHTML(category)}"
            class="${state.category === category ? "is-active" : ""}"
          >
            <span>${escapeHTML(category)}</span>
            <b>${count}</b>
          </button>
        `;
      }).join("");
    }

    if (objectiveRoot) {
      objectiveRoot.innerHTML = objectives.map((objective) => `
        <option value="${escapeHTML(objective)}">
          ${objective === "Todos" ? "Todos os objetivos" : escapeHTML(objective)}
        </option>
      `).join("");
      objectiveRoot.value = state.objective;
    }

    const count = document.getElementById("aura-library-count");
    const categoryCount = document.getElementById("aura-library-category-count");

    if (count) count.textContent = String(presets.length);
    if (categoryCount) {
      categoryCount.textContent = String(
        new Set(presets.map((preset) => preset.categoria).filter(Boolean)).size
      );
    }
  }

  function render(reset = false) {
    const grid = getGrid();
    if (!grid) return;

    getRoot()?.style.setProperty("--aura-v51-library-columns", String(state.density));
    state.results = filteredResults();

    const signature = JSON.stringify([
      state.query,
      state.category,
      state.objective,
      state.favoritesOnly,
      state.results.length
    ]);

    if (reset || signature !== state.lastSignature) {
      state.rendered = 0;
      state.lastSignature = signature;
      disconnectLoadObserver();

      state.suppressRootObserver = true;
      grid.innerHTML = "";
      state.suppressRootObserver = false;
    }

    updateHeader();
    appendBatch();

    if (!state.results.length) {
      state.suppressRootObserver = true;
      grid.innerHTML = `
        <div class="aura-studio-library-empty aura-v51-library-empty">
          <span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7"></circle>
              <path d="m20 20-4-4"></path>
            </svg>
          </span>
          <strong>Nenhum modelo encontrado</strong>
          <p>Tente outra categoria, objetivo ou termo de pesquisa.</p>
        </div>
      `;
      state.suppressRootObserver = false;
    }
  }

  function appendBatch() {
    const grid = getGrid();
    if (!grid || state.rendered >= state.results.length) {
      disconnectLoadObserver();
      return;
    }

    grid.querySelector("[data-v51-library-sentinel]")?.remove();

    const start = state.rendered;
    const end = Math.min(state.results.length, start + state.batch);
    const favorites = new Set(readList(KEYS.favorites));
    const html = state.results.slice(start, end).map((preset) => cardHTML(preset, favorites)).join("");

    state.suppressRootObserver = true;
    grid.insertAdjacentHTML("beforeend", html);
    state.rendered = end;

    if (state.rendered < state.results.length) {
      grid.insertAdjacentHTML("beforeend", `
        <div
          class="aura-v51-library-sentinel"
          data-v51-library-sentinel
          aria-hidden="true"
        >
          <span></span>
          Carregando mais modelos
        </div>
      `);
    }

    state.suppressRootObserver = false;
    updateRenderedCounter();
    observeSentinel();
  }

  function cardHTML(preset, favorites) {
    const blocks = Array.isArray(preset.blocos) ? preset.blocos : [];
    const colors = [
      preset.accent || "#7C3AED",
      preset.palette?.accent || "#22D3EE",
      preset.palette?.bg || "#0F172A"
    ];
    const typeLabel = preset.tipo === "pagina"
      ? "Página completa"
      : preset.tipo === "pessoal"
        ? "Bloco pessoal"
        : `${blocks.length} bloco${blocks.length === 1 ? "" : "s"}`;

    return `
      <article
        class="aura-studio-template-card aura-v51-template-card"
        data-preset-id="${escapeHTML(preset.id)}"
      >
        <div
          class="aura-studio-template-preview"
          style="--preset-accent:${escapeHTML(colors[0])};--preset-secondary:${escapeHTML(colors[1])};--preset-bg:${escapeHTML(colors[2])};"
        >
          <div class="aura-studio-template-browser"><i></i><i></i><i></i></div>
          <div class="aura-studio-template-visual">
            <span></span><strong></strong><em></em><b></b>
          </div>
          <small>${escapeHTML(typeLabel)}</small>
          <button
            type="button"
            data-preset-favorite="${escapeHTML(preset.id)}"
            class="${favorites.has(preset.id) ? "is-active" : ""}"
            aria-label="Favoritar"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"></path>
            </svg>
          </button>
        </div>
        <div class="aura-studio-template-content">
          <small>${escapeHTML(preset.categoria || "Bloco")}</small>
          <h4>${escapeHTML(preset.nome || "Sem nome")}</h4>
          <p>${escapeHTML(preset.objetivo || "Personalizar")}</p>
          <div>
            <span>${blocks.length} ${blocks.length === 1 ? "bloco" : "blocos"}</span>
            <button type="button" data-preset-insert="${escapeHTML(preset.id)}">Inserir</button>
          </div>
        </div>
      </article>
    `;
  }

  function updateHeader() {
    const heading = document.getElementById("aura-library-heading");
    const eyebrow = document.getElementById("aura-library-eyebrow");
    const total = document.getElementById("aura-library-results");

    if (heading) {
      heading.textContent = state.category === "Todos"
        ? "Escolha uma estrutura"
        : state.category;
    }

    if (eyebrow) {
      eyebrow.textContent = state.query
        ? `Pesquisa: ${state.query}`
        : state.favoritesOnly
          ? "Sua seleção"
          : "Biblioteca profissional";
    }

    if (total) {
      total.textContent = `${state.results.length} resultado${state.results.length === 1 ? "" : "s"}`;
    }

    updateRenderedCounter();
  }

  function updateRenderedCounter() {
    let counter = document.getElementById("aura-v51-rendered-counter");
    const header = document.querySelector(".aura-studio-library-main-header");

    if (!counter && header) {
      counter = document.createElement("small");
      counter.id = "aura-v51-rendered-counter";
      counter.className = "aura-v51-rendered-counter";
      header.appendChild(counter);
    }

    if (counter) {
      counter.textContent = `${Math.min(state.rendered, state.results.length)} no navegador`;
    }
  }

  function observeSentinel() {
    disconnectLoadObserver();

    const sentinel = document.querySelector("[data-v51-library-sentinel]");
    const main = document.querySelector(".aura-studio-library-main");

    if (!sentinel) return;

    state.loadObserver = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        appendBatch();
      }
    }, {
      root: main || null,
      rootMargin: "500px 0px",
      threshold: 0
    });

    state.loadObserver.observe(sentinel);
  }

  function disconnectLoadObserver() {
    state.loadObserver?.disconnect();
    state.loadObserver = null;
  }

  function toggleFavorite(id) {
    const favorites = readList(KEYS.favorites);
    const index = favorites.indexOf(id);

    if (index >= 0) favorites.splice(index, 1);
    else favorites.unshift(id);

    writeList(KEYS.favorites, favorites, 300);

    const button = document.querySelector(`[data-preset-favorite="${CSS.escape(id)}"]`);
    button?.classList.toggle("is-active", favorites.includes(id));

    if (state.category === "Favoritos" || state.favoritesOnly) {
      renderFilters();
      render(true);
    }
  }

  function insertPreset(id) {
    if (!id) return;

    const recents = readList(KEYS.recents).filter((item) => item !== id);
    recents.unshift(id);
    writeList(KEYS.recents, recents, 40);

    window.AuraStudioPro?.insertPreset?.(id);
    state.active = false;
    disconnectLoadObserver();
  }

  function bindEvents() {
    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const openTrigger = target.closest([
        ".aura-studio-top-command",
        ".aura-studio-library-launch",
        "[data-studio-left='library']",
        "[data-command-id='library']"
      ].join(","));

      if (openTrigger && document.getElementById("lp-editor-modal")?.contains(openTrigger)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        open();
        return;
      }

      const category = target.closest("[data-library-category]");
      if (category && getRoot()?.contains(category)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        state.category = category.dataset.libraryCategory || "Todos";
        state.favoritesOnly = state.category === "Favoritos";

        const proState = window.AuraStudioPro?.state;
        if (proState) {
          proState.activeCategory = state.category;
          proState.favoritesOnly = state.favoritesOnly;
        }

        document.getElementById("aura-library-favorites")?.classList.toggle(
          "is-active",
          state.favoritesOnly
        );

        renderFilters();
        render(true);
        return;
      }

      const favoriteFilter = target.closest("#aura-library-favorites");
      if (favoriteFilter) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        state.favoritesOnly = !state.favoritesOnly;
        state.category = state.favoritesOnly ? "Favoritos" : "Todos";
        favoriteFilter.classList.toggle("is-active", state.favoritesOnly);
        renderFilters();
        render(true);
        return;
      }

      const favorite = target.closest("[data-preset-favorite]");
      if (favorite && getRoot()?.contains(favorite)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        toggleFavorite(favorite.dataset.presetFavorite);
        return;
      }

      const insert = target.closest("[data-preset-insert]");
      if (insert && getRoot()?.contains(insert)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        insertPreset(insert.dataset.presetInsert);
      }
    }, true);

    document.addEventListener("input", (event) => {
      const target = event.target;

      if (!(target instanceof HTMLInputElement) || target.id !== "aura-library-search") {
        return;
      }

      event.stopPropagation();
      event.stopImmediatePropagation();

      state.query = target.value;
      const proState = window.AuraStudioPro?.state;
      if (proState) proState.query = state.query;

      window.clearTimeout(state.searchTimer);
      state.searchTimer = window.setTimeout(() => render(true), 170);
    }, true);

    document.addEventListener("change", (event) => {
      const target = event.target;

      if (!(target instanceof HTMLSelectElement) || target.id !== "aura-library-objective") {
        return;
      }

      event.stopPropagation();
      event.stopImmediatePropagation();

      state.objective = target.value || "Todos";
      const proState = window.AuraStudioPro?.state;
      if (proState) proState.objective = state.objective;

      render(true);
    }, true);

    document.addEventListener("keydown", (event) => {
      const modal = document.getElementById("lp-editor-modal");
      if (!modal || modal.classList.contains("hidden")) return;

      const target = event.target;
      const editing = target instanceof HTMLElement && (
        target.isContentEditable ||
        /INPUT|TEXTAREA|SELECT/.test(target.tagName)
      );

      if (!editing && String(event.key || "").toLowerCase() === "b") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        open();
      }
    }, true);

    document.addEventListener("aura:v51-settings", (event) => {
      if (event.detail?.density) setDensity(event.detail.density);
    });
  }

  function watchRoot() {
    const root = getRoot();
    if (!root || state.rootObserver) return;

    state.rootObserver = new MutationObserver((records) => {
      if (state.suppressRootObserver) return;

      const becameVisible = records.some((record) => {
        return record.type === "attributes" &&
          record.attributeName === "class" &&
          !root.classList.contains("hidden");
      });

      if (becameVisible && !root.dataset.auraV51Owned) {
        window.setTimeout(() => open({ preserve: true }), 0);
      }

      const grid = getGrid();
      const tooManyCards = grid?.querySelectorAll(".aura-studio-template-card").length > 80;

      if (
        !root.classList.contains("hidden") &&
        tooManyCards &&
        root.dataset.auraV51Owned === "true"
      ) {
        window.setTimeout(() => render(true), 0);
      }
    });

    state.rootObserver.observe(root, {
      attributes: true,
      attributeFilter: ["class"],
      childList: true,
      subtree: true
    });
  }

  function init() {
    if (state.initialized) return;

    if (
      !getRoot() ||
      !window.AuraStudioPro ||
      !Array.isArray(window.AURA_STUDIO_PRESETS)
    ) {
      window.setTimeout(init, 180);
      return;
    }

    state.initialized = true;
    getRoot().dataset.auraV51Owned = "true";
    getRoot().classList.add("aura-v51-library-virtual");
    getRoot().style.setProperty("--aura-v51-library-columns", String(state.density));

    bindEvents();
    watchRoot();

    window.AuraVirtualLibraryV51 = {
      version: VERSION,
      open,
      close,
      render: () => render(true),
      setDensity,
      getState: () => ({
        active: state.active,
        totalResults: state.results.length,
        rendered: state.rendered,
        density: state.density,
        category: state.category,
        objective: state.objective
      })
    };

    console.info("[Vide Aura Biblioteca Virtual V5.1] Inicializada", {
      presets: getPresets().length,
      batch: state.batch,
      density: state.density,
      version: VERSION
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();

