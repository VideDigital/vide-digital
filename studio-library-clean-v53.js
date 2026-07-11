/**
 * Vide Aura - Library Clean V5.3
 * Biblioteca paginada, leve e visualmente limpa.
 * Mantem todos os modelos disponiveis, mas limita o DOM a 18 cards.
 */
(function () {
    "use strict";

    const VERSION = "5.3.0";
    const PAGE_SIZE = 18;
    const FAVORITE_KEY = "auraStudioFavoritesV1";
    const RECENT_KEY = "auraStudioRecentsV1";
    const PERSONAL_KEY = "auraStudioPersonalBlocksV1";

    const state = {
        ready: false,
        open: false,
        query: "",
        category: "Todos",
        objective: "Todos",
        favoritesOnly: false,
        page: 1,
        pageSize: PAGE_SIZE,
        results: [],
        searchTimer: 0,
        renderFrame: 0,
        showAllCategories: false,
        original: null
    };

    function root() {
        return document.getElementById("aura-studio-library");
    }

    function grid() {
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

    function writeList(key, values, limit) {
        try {
            localStorage.setItem(
                key,
                JSON.stringify(values.slice(0, limit || 200))
            );
        } catch (error) {
            console.warn(
                "[Aura Library Clean V5.3] Falha ao salvar preferencia.",
                error
            );
        }
    }

    function normalize(value) {
        return String(value || "")
            .trim()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
    }

    function allPresets() {
        const defaults = Array.isArray(window.AURA_STUDIO_PRESETS)
            ? window.AURA_STUDIO_PRESETS
            : [];

        const personal =
            window.AuraStudioInspector?.readPersonalBlocks?.() ||
            readList(PERSONAL_KEY);

        return personal.concat(defaults);
    }

    function element(tag, className, text) {
        const node = document.createElement(tag);

        if (className) {
            node.className = className;
        }

        if (text !== undefined) {
            node.textContent = String(text);
        }

        return node;
    }

    function clearNode(node) {
        if (node) {
            node.replaceChildren();
        }
    }

    function filterPresets() {
        const presets = allPresets();
        const favorites = new Set(readList(FAVORITE_KEY));
        const recents = readList(RECENT_KEY);
        const recentOrder = new Map(
            recents.map(function (id, index) {
                return [id, index];
            })
        );
        const term = normalize(state.query);

        const filtered = presets.filter(function (preset) {
            if (state.category === "Favoritos" || state.favoritesOnly) {
                if (!favorites.has(preset.id)) {
                    return false;
                }
            } else if (state.category === "Recentes") {
                if (!recentOrder.has(preset.id)) {
                    return false;
                }
            } else if (
                state.category !== "Todos" &&
                preset.categoria !== state.category
            ) {
                return false;
            }

            if (
                state.objective !== "Todos" &&
                preset.objetivo !== state.objective
            ) {
                return false;
            }

            if (term) {
                const searchable = normalize([
                    preset.nome,
                    preset.categoria,
                    preset.objetivo,
                    preset.nicho,
                    preset.estilo,
                    Array.isArray(preset.tags)
                        ? preset.tags.join(" ")
                        : ""
                ].filter(Boolean).join(" "));

                if (!searchable.includes(term)) {
                    return false;
                }
            }

            return true;
        });

        if (state.category === "Recentes") {
            filtered.sort(function (a, b) {
                const first = recentOrder.has(a.id)
                    ? recentOrder.get(a.id)
                    : Number.MAX_SAFE_INTEGER;
                const second = recentOrder.has(b.id)
                    ? recentOrder.get(b.id)
                    : Number.MAX_SAFE_INTEGER;
                return first - second;
            });
        }

        return filtered;
    }

    function getPageCount() {
        return Math.max(
            1,
            Math.ceil(state.results.length / state.pageSize)
        );
    }

    function clampPage() {
        state.page = Math.max(
            1,
            Math.min(state.page, getPageCount())
        );
    }

    function getVisibleResults() {
        clampPage();

        const start = (state.page - 1) * state.pageSize;
        const end = start + state.pageSize;

        return state.results.slice(start, end);
    }

    function syncProState() {
        const proState = window.AuraStudioPro?.state;

        if (!proState) {
            return;
        }

        proState.query = state.query;
        proState.activeCategory = state.category;
        proState.objective = state.objective;
        proState.favoritesOnly = state.favoritesOnly;
    }

    function createCard(preset, favorites) {
        const blocks = Array.isArray(preset.blocos)
            ? preset.blocos
            : [];

        const article = element(
            "article",
            "aura-studio-template-card aura-v53-card"
        );
        article.dataset.v53Card = preset.id;

        const preview = element(
            "div",
            "aura-studio-template-preview aura-v53-preview"
        );

        preview.style.setProperty(
            "--preset-accent",
            preset.accent ||
                preset.palette?.accent ||
                "#7C3AED"
        );
        preview.style.setProperty(
            "--preset-secondary",
            preset.palette?.secondary ||
                preset.palette?.accent ||
                "#22D3EE"
        );
        preview.style.setProperty(
            "--preset-bg",
            preset.palette?.bg ||
                "#0F172A"
        );

        const browser = element(
            "div",
            "aura-studio-template-browser"
        );
        browser.append(
            element("i"),
            element("i"),
            element("i")
        );

        const visual = element(
            "div",
            "aura-studio-template-visual"
        );
        visual.append(
            element("span"),
            element("strong"),
            element("em"),
            element("b")
        );

        let typeLabel = "Bloco pessoal";

        if (preset.tipo === "pagina") {
            typeLabel = "Pagina completa";
        } else if (preset.tipo !== "pessoal") {
            typeLabel =
                String(blocks.length) +
                " " +
                (blocks.length === 1 ? "bloco" : "blocos");
        }

        const type = element(
            "small",
            "aura-v53-preview-label",
            typeLabel
        );

        const favorite = element(
            "button",
            "aura-v53-favorite",
            favorites.has(preset.id) ? "★" : "☆"
        );
        favorite.type = "button";
        favorite.dataset.v53Favorite = preset.id;
        favorite.setAttribute("aria-label", "Favoritar modelo");

        if (favorites.has(preset.id)) {
            favorite.classList.add("is-active");
        }

        preview.append(browser, visual, type, favorite);

        const content = element(
            "div",
            "aura-studio-template-content aura-v53-card-content"
        );
        const category = element(
            "small",
            "aura-v53-category-label",
            preset.categoria || "Bloco"
        );
        const title = element(
            "h4",
            "",
            preset.nome || "Modelo"
        );
        const objective = element(
            "p",
            "",
            preset.objetivo || "Personalizar"
        );
        const footer = element(
            "div",
            "aura-v53-card-footer"
        );
        const quantity = element(
            "span",
            "",
            String(blocks.length) +
                " " +
                (blocks.length === 1 ? "bloco" : "blocos")
        );
        const insert = element(
            "button",
            "aura-v53-insert",
            "Inserir"
        );
        insert.type = "button";
        insert.dataset.v53Insert = preset.id;

        footer.append(quantity, insert);
        content.append(category, title, objective, footer);
        article.append(preview, content);

        return article;
    }

    function renderCards() {
        const target = grid();

        if (!target) {
            return;
        }

        clearNode(target);

        if (!state.results.length) {
            const empty = element(
                "div",
                "aura-studio-library-empty aura-v53-empty"
            );
            empty.append(
                element("strong", "", "Nenhum modelo encontrado"),
                element(
                    "p",
                    "",
                    "Tente outra categoria, objetivo ou termo de pesquisa."
                )
            );
            target.append(empty);
            renderPagination();
            updateHeader();
            return;
        }

        const favorites = new Set(readList(FAVORITE_KEY));
        const fragment = document.createDocumentFragment();

        getVisibleResults().forEach(function (preset) {
            fragment.append(createCard(preset, favorites));
        });

        target.append(fragment);
        renderPagination();
        updateHeader();
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
        const visible = getVisibleResults().length;
        const start = state.results.length
            ? (state.page - 1) * state.pageSize + 1
            : 0;
        const end = state.results.length
            ? start + visible - 1
            : 0;

        if (heading) {
            heading.textContent =
                state.category === "Todos"
                    ? "Escolha uma estrutura"
                    : state.category;
        }

        if (eyebrow) {
            eyebrow.textContent =
                state.query
                    ? "Pesquisa: " + state.query
                    : "Biblioteca profissional";
        }

        if (results) {
            results.textContent =
                String(start) +
                " a " +
                String(end) +
                " de " +
                String(state.results.length);
        }

        let indicator = document.getElementById(
            "aura-v53-page-indicator"
        );
        const mainHeader = root()?.querySelector(
            ".aura-studio-library-main-header"
        );

        if (!indicator && mainHeader) {
            indicator = element(
                "span",
                "aura-v53-page-indicator"
            );
            indicator.id = "aura-v53-page-indicator";
            mainHeader.append(indicator);
        }

        if (indicator) {
            indicator.textContent =
                "Pagina " +
                String(state.page) +
                " de " +
                String(getPageCount()) +
                " - maximo " +
                String(state.pageSize) +
                " cards";
        }
    }

    function renderPagination() {
        let pagination = document.getElementById(
            "aura-v53-pagination"
        );
        const main = root()?.querySelector(
            ".aura-studio-library-main"
        );

        if (!main) {
            return;
        }

        if (!pagination) {
            pagination = element(
                "nav",
                "aura-v53-pagination"
            );
            pagination.id = "aura-v53-pagination";
            pagination.setAttribute(
                "aria-label",
                "Paginacao da biblioteca"
            );
            main.append(pagination);
        }

        clearNode(pagination);

        const pageCount = getPageCount();
        const previous = element(
            "button",
            "aura-v53-page-button",
            "Anterior"
        );
        previous.type = "button";
        previous.dataset.v53PageAction = "previous";
        previous.disabled = state.page === 1;

        const summary = element(
            "span",
            "aura-v53-page-summary",
            "Pagina " +
                String(state.page) +
                " de " +
                String(pageCount)
        );

        const next = element(
            "button",
            "aura-v53-page-button",
            "Proxima"
        );
        next.type = "button";
        next.dataset.v53PageAction = "next";
        next.disabled = state.page === pageCount;

        const jump = element(
            "select",
            "aura-v53-page-select"
        );
        jump.dataset.v53PageSelect = "true";
        jump.setAttribute(
            "aria-label",
            "Escolher pagina"
        );

        const maxVisiblePages = Math.min(pageCount, 120);

        for (
            let page = 1;
            page !== maxVisiblePages + 1;
            page += 1
        ) {
            const option = element(
                "option",
                "",
                "Pagina " + String(page)
            );
            option.value = String(page);
            option.selected = page === state.page;
            jump.append(option);
        }

        pagination.append(
            previous,
            summary,
            jump,
            next
        );
    }

    function categoryData() {
        const presets = allPresets();
        const favorites = readList(FAVORITE_KEY);
        const recents = readList(RECENT_KEY);
        const unique = Array.from(
            new Set(
                presets
                    .map(function (preset) {
                        return preset.categoria;
                    })
                    .filter(Boolean)
            )
        ).sort(function (a, b) {
            return a.localeCompare(b, "pt-BR");
        });

        return {
            presets,
            favorites,
            recents,
            categories: [
                "Todos",
                "Recentes",
                "Favoritos"
            ].concat(unique)
        };
    }

    function populateCategories() {
        const categoryRoot = document.getElementById(
            "aura-library-categories"
        );

        if (!categoryRoot) {
            return;
        }

        const data = categoryData();
        const visibleLimit = state.showAllCategories
            ? data.categories.length
            : 11;
        const fragment = document.createDocumentFragment();

        data.categories
            .slice(0, visibleLimit)
            .forEach(function (category) {
                const button = element(
                    "button",
                    "aura-v53-category-button"
                );
                button.type = "button";
                button.dataset.v53Category = category;

                if (category === state.category) {
                    button.classList.add("is-active");
                }

                let count = data.presets.length;

                if (category === "Recentes") {
                    count = data.recents.length;
                } else if (category === "Favoritos") {
                    count = data.favorites.length;
                } else if (category !== "Todos") {
                    count = data.presets.filter(
                        function (preset) {
                            return preset.categoria === category;
                        }
                    ).length;
                }

                button.append(
                    element("span", "", category),
                    element("b", "", count)
                );
                fragment.append(button);
            });

        if (data.categories.length > 11) {
            const more = element(
                "button",
                "aura-v53-more-categories",
                state.showAllCategories
                    ? "Mostrar menos"
                    : "Mais categorias"
            );
            more.type = "button";
            more.dataset.v53MoreCategories = "true";
            fragment.append(more);
        }

        categoryRoot.replaceChildren(fragment);

        const total = document.getElementById(
            "aura-library-count"
        );
        const categoryTotal = document.getElementById(
            "aura-library-category-count"
        );

        if (total) {
            total.textContent = String(data.presets.length);
        }

        if (categoryTotal) {
            categoryTotal.textContent = String(
                data.categories.length - 3
            );
        }
    }

    function populateObjectives() {
        const objectiveRoot = document.getElementById(
            "aura-library-objective"
        );

        if (!objectiveRoot) {
            return;
        }

        const objectives = ["Todos"].concat(
            Array.from(
                new Set(
                    allPresets()
                        .map(function (preset) {
                            return preset.objetivo;
                        })
                        .filter(Boolean)
                )
            ).sort(function (a, b) {
                return a.localeCompare(b, "pt-BR");
            })
        );
        const fragment = document.createDocumentFragment();

        objectives.forEach(function (objective) {
            const option = element(
                "option",
                "",
                objective === "Todos"
                    ? "Todos os objetivos"
                    : objective
            );
            option.value = objective;
            fragment.append(option);
        });

        objectiveRoot.replaceChildren(fragment);
        objectiveRoot.value = state.objective;
    }

    function scheduleRender(resetPage) {
        if (resetPage) {
            state.page = 1;
        }

        if (state.renderFrame) {
            cancelAnimationFrame(state.renderFrame);
        }

        state.renderFrame = requestAnimationFrame(function () {
            state.renderFrame = 0;
            state.results = filterPresets();
            clampPage();
            populateCategories();
            populateObjectives();
            renderCards();
        });
    }

    function resetFilters() {
        state.query = "";
        state.category = "Todos";
        state.objective = "Todos";
        state.favoritesOnly = false;
        state.page = 1;
        state.showAllCategories = false;

        const search = document.getElementById(
            "aura-library-search"
        );
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
        syncProState();
    }

    function openLibrary() {
        const library = root();

        if (!library) {
            return;
        }

        state.open = true;
        resetFilters();
        library.classList.add(
            "aura-library-clean-v53"
        );
        library.classList.remove("hidden");
        scheduleRender(true);

        window.setTimeout(function () {
            document
                .getElementById("aura-library-search")
                ?.focus();
        }, 30);
    }

    function closeLibrary() {
        state.open = false;
        root()?.classList.add("hidden");
    }

    function toggleFavorite(id) {
        const favorites = readList(FAVORITE_KEY);
        const index = favorites.indexOf(id);

        if (index === -1) {
            favorites.unshift(id);
        } else {
            favorites.splice(index, 1);
        }

        writeList(FAVORITE_KEY, favorites, 300);

        if (
            state.category === "Favoritos" ||
            state.favoritesOnly
        ) {
            scheduleRender(true);
            return;
        }

        const button = document.querySelector(
            "[data-v53-favorite='" +
                CSS.escape(id) +
                "']"
        );

        if (button) {
            const active = favorites.includes(id);
            button.classList.toggle("is-active", active);
            button.textContent = active ? "★" : "☆";
        }

        populateCategories();
    }

    function insertPreset(id) {
        const insert =
            state.original?.insertPreset ||
            window.AuraStudioPro?.insertPreset;

        if (typeof insert !== "function") {
            console.error(
                "[Aura Library Clean V5.3] Insercao indisponivel."
            );
            return;
        }

        const recents = readList(RECENT_KEY)
            .filter(function (item) {
                return item !== id;
            });
        recents.unshift(id);
        writeList(RECENT_KEY, recents, 40);

        insert.call(window.AuraStudioPro, id);
        closeLibrary();
    }

    function changePage(value) {
        state.page = Math.max(
            1,
            Math.min(Number(value) || 1, getPageCount())
        );
        renderCards();

        root()?.querySelector(
            ".aura-studio-library-main"
        )?.scrollTo({
            top: 0,
            behavior: "smooth"
        });
    }

    function captureClick(event) {
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

        const opener = target.closest(
            ".aura-studio-top-command," +
            ".aura-studio-library-launch," +
            "[data-studio-left='library']," +
            "[data-command-id='library']"
        );

        if (opener && modal.contains(opener)) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            openLibrary();
            return;
        }

        const category = target.closest(
            "[data-v53-category]"
        );

        if (category && root()?.contains(category)) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            state.category =
                category.dataset.v53Category || "Todos";
            state.favoritesOnly =
                state.category === "Favoritos";
            syncProState();
            scheduleRender(true);
            return;
        }

        const more = target.closest(
            "[data-v53-more-categories]"
        );

        if (more && root()?.contains(more)) {
            event.preventDefault();
            state.showAllCategories =
                !state.showAllCategories;
            populateCategories();
            return;
        }

        const favoriteFilter = target.closest(
            "#aura-library-favorites"
        );

        if (
            favoriteFilter &&
            root()?.contains(favoriteFilter)
        ) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            state.favoritesOnly =
                !state.favoritesOnly;
            state.category =
                state.favoritesOnly
                    ? "Favoritos"
                    : "Todos";
            favoriteFilter.classList.toggle(
                "is-active",
                state.favoritesOnly
            );
            syncProState();
            scheduleRender(true);
            return;
        }

        const favorite = target.closest(
            "[data-v53-favorite]"
        );

        if (favorite && root()?.contains(favorite)) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            toggleFavorite(favorite.dataset.v53Favorite);
            return;
        }

        const insert = target.closest(
            "[data-v53-insert]"
        );

        if (insert && root()?.contains(insert)) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            insertPreset(insert.dataset.v53Insert);
            return;
        }

        const pageAction = target.closest(
            "[data-v53-page-action]"
        );

        if (pageAction && root()?.contains(pageAction)) {
            event.preventDefault();

            if (
                pageAction.dataset.v53PageAction === "previous"
            ) {
                changePage(state.page - 1);
            } else {
                changePage(state.page + 1);
            }
        }
    }

    function captureInput(event) {
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
            function () {
                scheduleRender(true);
            },
            220
        );
    }

    function captureChange(event) {
        const target = event.target;

        if (
            target instanceof HTMLSelectElement &&
            target.id === "aura-library-objective"
        ) {
            event.stopPropagation();
            event.stopImmediatePropagation();

            state.objective = target.value || "Todos";
            syncProState();
            scheduleRender(true);
            return;
        }

        if (
            target instanceof HTMLSelectElement &&
            target.dataset.v53PageSelect
        ) {
            changePage(target.value);
        }
    }

    function captureKey(event) {
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
                ["INPUT", "TEXTAREA", "SELECT"]
                    .includes(target.tagName)
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

    function patchApi() {
        const api = window.AuraStudioPro;

        if (!api || api.__auraLibraryCleanV53) {
            return;
        }

        state.original = {
            openLibrary: api.openLibrary,
            closeLibrary: api.closeLibrary,
            renderLibrary: api.renderLibrary,
            insertPreset: api.insertPreset
        };

        api.openLibrary = openLibrary;
        api.closeLibrary = closeLibrary;
        api.renderLibrary = function () {
            scheduleRender(false);
        };
        api.__auraLibraryCleanV53 = true;
    }

    function bind() {
        document.addEventListener(
            "click",
            captureClick,
            true
        );
        document.addEventListener(
            "input",
            captureInput,
            true
        );
        document.addEventListener(
            "change",
            captureChange,
            true
        );
        document.addEventListener(
            "keydown",
            captureKey,
            true
        );
    }

    function init() {
        if (state.ready) {
            return;
        }

        if (
            !window.AuraStudioPro ||
            !root() ||
            !grid() ||
            !Array.isArray(window.AURA_STUDIO_PRESETS)
        ) {
            window.setTimeout(init, 160);
            return;
        }

        state.ready = true;
        patchApi();
        bind();

        root().classList.add("aura-library-clean-v53");

        window.AuraLibraryCleanV53 = {
            version: VERSION,
            open: openLibrary,
            close: closeLibrary,
            render: function () {
                scheduleRender(false);
            },
            getState: function () {
                return {
                    open: state.open,
                    totalResults: state.results.length,
                    visibleCards: getVisibleResults().length,
                    page: state.page,
                    pageCount: getPageCount(),
                    pageSize: state.pageSize,
                    category: state.category,
                    objective: state.objective
                };
            }
        };

        console.info(
            "[Vide Aura Library Clean V5.3] Inicializado",
            {
                presets: allPresets().length,
                pageSize: state.pageSize,
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
