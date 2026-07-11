/**
 * Vide Aura — Library Performance V5.2
 * Otimização isolada da Biblioteca Pro, sem alterar o layout do editor.
 * Versão 5.2.0
 */
(function () {
    "use strict";

    const VERSION = "5.2.0";
    const BATCH_SIZE = 24;
    const FAVORITE_KEY = "auraStudioFavoritesV1";
    const RECENT_KEY = "auraStudioRecentsV1";
    const PERSONAL_KEY = "auraStudioPersonalBlocksV1";

    const state = {
        initialized: false,
        open: false,
        query: "",
        activeCategory: "Todos",
        objective: "Todos",
        favoritesOnly: false,
        results: [],
        rendered: 0,
        searchTimer: 0,
        loadObserver: null,
        rootObserver: null,
        internalMutation: false,
        originalApi: null
    };

    function getRoot() {
        return document.getElementById("aura-studio-library");
    }

    function getGrid() {
        return document.getElementById("aura-library-grid");
    }

    function getScrollRoot() {
        return (
            document.querySelector("#aura-studio-library .aura-studio-library-main") ||
            document.querySelector("#aura-studio-library [class*='library-main']") ||
            getRoot()
        );
    }

    function escapeHTML(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function normalize(value) {
        return String(value || "")
            .trim()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
    }

    function readList(key) {
        try {
            const parsed = JSON.parse(localStorage.getItem(key) || "[]");
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            return [];
        }
    }

    function writeList(key, values, limit = 200) {
        try {
            localStorage.setItem(
                key,
                JSON.stringify(values.slice(0, limit))
            );
        } catch (error) {
            console.warn(
                "[Aura Library Performance V5.2] Não foi possível salvar a preferência.",
                error
            );
        }
    }

    function getAllPresets() {
        const defaults = Array.isArray(window.AURA_STUDIO_PRESETS)
            ? window.AURA_STUDIO_PRESETS
            : [];
        const personal =
            window.AuraStudioInspector?.readPersonalBlocks?.() ||
            readList(PERSONAL_KEY);

        return [...personal, ...defaults];
    }

    function getFilteredResults() {
        const presets = getAllPresets();
        const favorites = new Set(readList(FAVORITE_KEY));
        const recents = readList(RECENT_KEY);
        const recentOrder = new Map(
            recents.map((id, index) => [id, index])
        );
        const search = normalize(state.query);

        let results = presets.filter((preset) => {
            if (
                state.activeCategory === "Favoritos" ||
                state.favoritesOnly
            ) {
                if (!favorites.has(preset.id)) {
                    return false;
                }
            } else if (state.activeCategory === "Recentes") {
                if (!recentOrder.has(preset.id)) {
                    return false;
                }
            } else if (
                state.activeCategory !== "Todos" &&
                preset.categoria !== state.activeCategory
            ) {
                return false;
            }

            if (
                state.objective !== "Todos" &&
                preset.objetivo !== state.objective
            ) {
                return false;
            }

            if (search) {
                const haystack = normalize([
                    preset.nome,
                    preset.categoria,
                    preset.objetivo,
                    preset.nicho,
                    preset.estilo,
                    ...(Array.isArray(preset.tags) ? preset.tags : [])
                ].filter(Boolean).join(" "));

                if (!haystack.includes(search)) {
                    return false;
                }
            }

            return true;
        });

        if (state.activeCategory === "Recentes") {
            results = results.sort((a, b) => {
                return (
                    (recentOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
                    (recentOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER)
                );
            });
        }

        return results;
    }

    function syncProState() {
        const proState = window.AuraStudioPro?.state;

        if (!proState) {
            return;
        }

        proState.query = state.query;
        proState.activeCategory = state.activeCategory;
        proState.objective = state.objective;
        proState.favoritesOnly = state.favoritesOnly;
    }

    function resetFilters() {
        state.query = "";
        state.activeCategory = "Todos";
        state.objective = "Todos";
        state.favoritesOnly = false;
        syncProState();

        const search = document.getElementById("aura-library-search");
        const objective = document.getElementById(
            "aura-library-objective"
        );
        const favorite = document.getElementById(
            "aura-library-favorites"
        );

        if (search) {
            search.value = "";
        }

        if (objective) {
            objective.value = "Todos";
        }

        favorite?.classList.remove("is-active");
    }

    function populateFilters() {
        const presets = getAllPresets();
        const favorites = readList(FAVORITE_KEY);
        const recents = readList(RECENT_KEY);
        const categories = [
            "Todos",
            "Recentes",
            "Favoritos",
            ...Array.from(
                new Set(
                    presets
                        .map((preset) => preset.categoria)
                        .filter(Boolean)
                )
            ).sort((a, b) => a.localeCompare(b, "pt-BR"))
        ];
        const objectives = [
            "Todos",
            ...Array.from(
                new Set(
                    presets
                        .map((preset) => preset.objetivo)
                        .filter(Boolean)
                )
            ).sort((a, b) => a.localeCompare(b, "pt-BR"))
        ];
        const categoryRoot = document.getElementById(
            "aura-library-categories"
        );
        const objectiveRoot = document.getElementById(
            "aura-library-objective"
        );

        if (categoryRoot) {
            categoryRoot.innerHTML = categories.map((category) => {
                const count =
                    category === "Todos"
                        ? presets.length
                        : category === "Recentes"
                            ? recents.length
                            : category === "Favoritos"
                                ? favorites.length
                                : presets.reduce(
                                    (total, preset) =>
                                        total +
                                        (
                                            preset.categoria === category
                                                ? 1
                                                : 0
                                        ),
                                    0
                                );

                return `
                    <button
                        type="button"
                        data-v52-library-category="${escapeHTML(category)}"
                        class="${state.activeCategory === category ? "is-active" : ""}"
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
                    ${
                        objective === "Todos"
                            ? "Todos os objetivos"
                            : escapeHTML(objective)
                    }
                </option>
            `).join("");
            objectiveRoot.value = state.objective;
        }

        const totalCount = document.getElementById(
            "aura-library-count"
        );
        const categoryCount = document.getElementById(
            "aura-library-category-count"
        );

        if (totalCount) {
            totalCount.textContent = String(presets.length);
        }

        if (categoryCount) {
            categoryCount.textContent = String(
                new Set(
                    presets
                        .map((preset) => preset.categoria)
                        .filter(Boolean)
                ).size
            );
        }
    }

    function createCardHTML(preset, favorites) {
        const blocks = Array.isArray(preset.blocos)
            ? preset.blocos
            : [];
        const typeLabel =
            preset.tipo === "pagina"
                ? "Página completa"
                : preset.tipo === "pessoal"
                    ? "Bloco pessoal"
                    : `${blocks.length} ${
                        blocks.length === 1 ? "bloco" : "blocos"
                    }`;
        const accent =
            preset.accent ||
            preset.palette?.accent ||
            "#7C3AED";
        const secondary =
            preset.palette?.secondary ||
            preset.palette?.accent ||
            "#22D3EE";
        const background =
            preset.palette?.bg ||
            "#0F172A";

        return `
            <article
                class="aura-studio-template-card aura-v52-template-card"
                data-v52-preset-card="${escapeHTML(preset.id)}"
            >
                <div
                    class="aura-studio-template-preview"
                    style="
                        --preset-accent:${escapeHTML(accent)};
                        --preset-secondary:${escapeHTML(secondary)};
                        --preset-bg:${escapeHTML(background)};
                    "
                >
                    <div class="aura-studio-template-browser">
                        <i></i><i></i><i></i>
                    </div>

                    <div class="aura-studio-template-visual">
                        <span></span>
                        <strong></strong>
                        <em></em>
                        <b></b>
                    </div>

                    <small>${escapeHTML(typeLabel)}</small>

                    <button
                        type="button"
                        data-v52-preset-favorite="${escapeHTML(preset.id)}"
                        class="${favorites.has(preset.id) ? "is-active" : ""}"
                        aria-label="Favoritar modelo"
                    >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"></path>
                        </svg>
                    </button>
                </div>

                <div class="aura-studio-template-content">
                    <small>${escapeHTML(preset.categoria || "Bloco")}</small>
                    <h4>${escapeHTML(preset.nome || "Modelo")}</h4>
                    <p>${escapeHTML(preset.objetivo || "Personalizar")}</p>

                    <div>
                        <span>
                            ${blocks.length}
                            ${blocks.length === 1 ? "bloco" : "blocos"}
                        </span>

                        <button
                            type="button"
                            data-v52-preset-insert="${escapeHTML(preset.id)}"
                        >
                            Inserir
                        </button>
                    </div>
                </div>
            </article>
        `;
    }

    function updateHeader() {
        const heading = document.getElementById(
            "aura-library-heading"
        );
        const eyebrow = document.getElementById(
            "aura-library-eyebrow"
        );
        const results = document.getElementById(
            "aura-library-results"
        );

        if (heading) {
            heading.textContent =
                state.activeCategory === "Todos"
                    ? "Escolha uma estrutura"
                    : state.activeCategory;
        }

        if (eyebrow) {
            eyebrow.textContent =
                state.query
                    ? `Pesquisa: ${state.query}`
                    : state.favoritesOnly
                        ? "Sua seleção"
                        : "Biblioteca profissional";
        }

        if (results) {
            results.textContent = `${state.results.length} resultado${
                state.results.length === 1 ? "" : "s"
            }`;
        }
    }

    function updateProgress() {
        const root = getRoot();
        if (!root) {
            return;
        }

        let progress = document.getElementById(
            "aura-v52-library-progress"
        );
        const mainHeader =
            root.querySelector(".aura-studio-library-main-header") ||
            root.querySelector("[class*='library-main-header']");

        if (!progress && mainHeader) {
            progress = document.createElement("span");
            progress.id = "aura-v52-library-progress";
            progress.className = "aura-v52-library-progress";
            mainHeader.appendChild(progress);
        }

        if (progress) {
            progress.textContent =
                `${Math.min(state.rendered, state.results.length)}` +
                ` de ${state.results.length} carregados`;
        }
    }

    function disconnectLoadObserver() {
        state.loadObserver?.disconnect();
        state.loadObserver = null;
    }

    function observeLoadMore() {
        disconnectLoadObserver();

        const loadMore = document.querySelector(
            "[data-v52-load-more]"
        );

        if (!loadMore || state.rendered >= state.results.length) {
            return;
        }

        state.loadObserver = new IntersectionObserver(
            (entries) => {
                if (
                    entries.some((entry) => entry.isIntersecting)
                ) {
                    appendNextBatch();
                }
            },
            {
                root: getScrollRoot(),
                rootMargin: "500px 0px",
                threshold: 0
            }
        );

        state.loadObserver.observe(loadMore);
    }

    function appendNextBatch() {
        const grid = getGrid();

        if (
            !grid ||
            state.rendered >= state.results.length
        ) {
            disconnectLoadObserver();
            return;
        }

        grid.querySelector("[data-v52-load-more]")?.remove();

        const start = state.rendered;
        const end = Math.min(
            state.results.length,
            start + BATCH_SIZE
        );
        const favorites = new Set(readList(FAVORITE_KEY));
        const fragmentHTML = state.results
            .slice(start, end)
            .map((preset) => createCardHTML(preset, favorites))
            .join("");

        state.internalMutation = true;
        grid.insertAdjacentHTML("beforeend", fragmentHTML);
        state.rendered = end;

        if (state.rendered < state.results.length) {
            const remaining =
                state.results.length - state.rendered;
            const nextAmount = Math.min(
                BATCH_SIZE,
                remaining
            );

            grid.insertAdjacentHTML(
                "beforeend",
                `
                    <div
                        class="aura-v52-load-more"
                        data-v52-load-more
                    >
                        <span>
                            ${state.rendered} de
                            ${state.results.length} carregados
                        </span>

                        <button type="button">
                            Carregar mais ${nextAmount}
                        </button>
                    </div>
                `
            );
        }

        state.internalMutation = false;
        updateProgress();
        observeLoadMore();
    }

    function renderLibrary(reset = true) {
        const grid = getGrid();

        if (!grid) {
            return;
        }

        disconnectLoadObserver();
        populateFilters();
        state.results = getFilteredResults();
        state.rendered = 0;
        updateHeader();

        state.internalMutation = true;
        grid.innerHTML = "";
        state.internalMutation = false;

        if (!state.results.length) {
            state.internalMutation = true;
            grid.innerHTML = `
                <div class="aura-studio-library-empty aura-v52-library-empty">
                    <span>
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <circle cx="11" cy="11" r="7"></circle>
                            <path d="m20 20-4-4"></path>
                        </svg>
                    </span>
                    <strong>Nenhum modelo encontrado</strong>
                    <p>
                        Tente outra categoria, objetivo ou
                        termo de pesquisa.
                    </p>
                </div>
            `;
            state.internalMutation = false;
            updateProgress();
            return;
        }

        appendNextBatch();
    }

    function openLibrary() {
        const root = getRoot();

        if (!root) {
            return;
        }

        state.open = true;
        resetFilters();
        root.dataset.auraLibraryPerformance = VERSION;
        root.classList.add("aura-library-performance-v52");
        root.classList.remove("hidden");
        renderLibrary(true);

        window.setTimeout(() => {
            document
                .getElementById("aura-library-search")
                ?.focus();
        }, 30);
    }

    function closeLibrary() {
        state.open = false;
        disconnectLoadObserver();
        getRoot()?.classList.add("hidden");
    }

    function toggleFavorite(id) {
        if (!id) {
            return;
        }

        const favorites = readList(FAVORITE_KEY);
        const index = favorites.indexOf(id);

        if (index >= 0) {
            favorites.splice(index, 1);
        } else {
            favorites.unshift(id);
        }

        writeList(FAVORITE_KEY, favorites, 300);

        if (
            state.activeCategory === "Favoritos" ||
            state.favoritesOnly
        ) {
            populateFilters();
            renderLibrary(true);
            return;
        }

        const button = document.querySelector(
            `[data-v52-preset-favorite="${CSS.escape(id)}"]`
        );

        button?.classList.toggle(
            "is-active",
            favorites.includes(id)
        );

        populateFilters();
    }

    function insertPreset(id) {
        if (!id) {
            return;
        }

        const insert =
            state.originalApi?.insertPreset ||
            window.AuraStudioPro?.insertPreset;

        if (typeof insert !== "function") {
            console.error(
                "[Aura Library Performance V5.2] Função de inserção não encontrada."
            );
            return;
        }

        insert(id);
        closeLibrary();
    }

    function setCategory(category) {
        state.activeCategory = category || "Todos";
        state.favoritesOnly =
            state.activeCategory === "Favoritos";
        syncProState();

        document
            .getElementById("aura-library-favorites")
            ?.classList.toggle(
                "is-active",
                state.favoritesOnly
            );

        populateFilters();
        renderLibrary(true);
    }

    function handleCapturedClick(event) {
        const target =
            event.target instanceof Element
                ? event.target
                : null;

        if (!target) {
            return;
        }

        const modal = document.getElementById(
            "lp-editor-modal"
        );

        if (!modal || modal.classList.contains("hidden")) {
            return;
        }

        const openTrigger = target.closest([
            ".aura-studio-top-command",
            ".aura-studio-library-launch",
            "[data-studio-left='library']",
            "[data-command-id='library']"
        ].join(","));

        if (openTrigger && modal.contains(openTrigger)) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            openLibrary();
            return;
        }

        const category = target.closest(
            "[data-v52-library-category]"
        );

        if (category && getRoot()?.contains(category)) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            setCategory(
                category.dataset.v52LibraryCategory
            );
            return;
        }

        const favoriteFilter = target.closest(
            "#aura-library-favorites"
        );

        if (favoriteFilter && getRoot()?.contains(favoriteFilter)) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            state.favoritesOnly = !state.favoritesOnly;
            state.activeCategory =
                state.favoritesOnly
                    ? "Favoritos"
                    : "Todos";
            syncProState();
            favoriteFilter.classList.toggle(
                "is-active",
                state.favoritesOnly
            );
            populateFilters();
            renderLibrary(true);
            return;
        }

        const favorite = target.closest(
            "[data-v52-preset-favorite]"
        );

        if (favorite && getRoot()?.contains(favorite)) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            toggleFavorite(
                favorite.dataset.v52PresetFavorite
            );
            return;
        }

        const insert = target.closest(
            "[data-v52-preset-insert]"
        );

        if (insert && getRoot()?.contains(insert)) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            insertPreset(
                insert.dataset.v52PresetInsert
            );
            return;
        }

        const loadMore = target.closest(
            "[data-v52-load-more] button"
        );

        if (loadMore && getRoot()?.contains(loadMore)) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            appendNextBatch();
        }
    }

    function handleCapturedInput(event) {
        const target = event.target;

        if (
            !(target instanceof HTMLInputElement) ||
            target.id !== "aura-library-search"
        ) {
            return;
        }

        event.stopPropagation();
        event.stopImmediatePropagation();

        state.query = target.value;
        syncProState();

        window.clearTimeout(state.searchTimer);
        state.searchTimer = window.setTimeout(
            () => renderLibrary(true),
            180
        );
    }

    function handleCapturedChange(event) {
        const target = event.target;

        if (
            !(target instanceof HTMLSelectElement) ||
            target.id !== "aura-library-objective"
        ) {
            return;
        }

        event.stopPropagation();
        event.stopImmediatePropagation();

        state.objective = target.value || "Todos";
        syncProState();
        renderLibrary(true);
    }

    function handleCapturedKeydown(event) {
        const modal = document.getElementById(
            "lp-editor-modal"
        );

        if (!modal || modal.classList.contains("hidden")) {
            return;
        }

        const target = event.target;
        const typing =
            target instanceof HTMLElement &&
            (
                target.isContentEditable ||
                ["INPUT", "TEXTAREA", "SELECT"].includes(
                    target.tagName
                )
            );

        if (
            !typing &&
            String(event.key || "").toLowerCase() === "b"
        ) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            openLibrary();
        }
    }

    function patchPublicApi() {
        const api = window.AuraStudioPro;

        if (!api || api.__libraryPerformanceV52) {
            return;
        }

        state.originalApi = {
            openLibrary: api.openLibrary,
            closeLibrary: api.closeLibrary,
            renderLibrary: api.renderLibrary,
            insertPreset: api.insertPreset
        };

        api.openLibrary = openLibrary;
        api.closeLibrary = closeLibrary;
        api.renderLibrary = renderLibrary;
        api.__libraryPerformanceV52 = true;
    }

    function observeExternalOpening() {
        const root = getRoot();

        if (!root || state.rootObserver) {
            return;
        }

        state.rootObserver = new MutationObserver(
            (records) => {
                if (state.internalMutation) {
                    return;
                }

                const opened = records.some((record) => {
                    return (
                        record.type === "attributes" &&
                        record.attributeName === "class" &&
                        !root.classList.contains("hidden")
                    );
                });

                if (
                    opened &&
                    root.dataset.auraLibraryPerformance !== VERSION
                ) {
                    root.dataset.auraLibraryPerformance = VERSION;
                    root.classList.add(
                        "aura-library-performance-v52"
                    );
                    window.setTimeout(
                        () => renderLibrary(true),
                        0
                    );
                }
            }
        );

        state.rootObserver.observe(root, {
            attributes: true,
            attributeFilter: ["class"]
        });
    }

    function bindEvents() {
        document.addEventListener(
            "click",
            handleCapturedClick,
            true
        );
        document.addEventListener(
            "input",
            handleCapturedInput,
            true
        );
        document.addEventListener(
            "change",
            handleCapturedChange,
            true
        );
        document.addEventListener(
            "keydown",
            handleCapturedKeydown,
            true
        );

        document.addEventListener(
            "aura:personal-library-updated",
            () => {
                if (
                    getRoot() &&
                    !getRoot().classList.contains("hidden")
                ) {
                    populateFilters();
                    renderLibrary(true);
                }
            }
        );
    }

    function init() {
        if (state.initialized) {
            return;
        }

        if (
            !window.AuraStudioPro ||
            !getRoot() ||
            !getGrid() ||
            !Array.isArray(window.AURA_STUDIO_PRESETS)
        ) {
            window.setTimeout(init, 160);
            return;
        }

        state.initialized = true;
        patchPublicApi();
        bindEvents();
        observeExternalOpening();

        const root = getRoot();
        root.dataset.auraLibraryPerformance = VERSION;
        root.classList.add(
            "aura-library-performance-v52"
        );

        window.AuraLibraryPerformanceV52 = {
            version: VERSION,
            open: openLibrary,
            close: closeLibrary,
            render: renderLibrary,
            loadMore: appendNextBatch,
            getState: () => ({
                open: state.open,
                query: state.query,
                category: state.activeCategory,
                objective: state.objective,
                totalResults: state.results.length,
                rendered: state.rendered,
                batchSize: BATCH_SIZE
            })
        };

        console.info(
            "[Vide Aura Library Performance V5.2] Inicializado",
            {
                presets: getAllPresets().length,
                batchSize: BATCH_SIZE,
                version: VERSION
            }
        );
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            init,
            { once: true }
        );
    } else {
        init();
    }
})();
