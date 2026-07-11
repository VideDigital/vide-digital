/**
 * Vide Aura - Library Performance V5.2.2
 * Copia segura: usa DOM APIs e nao contem HTML em strings.
 */
(function () {
    "use strict";

    const VERSION = "5.2.2";
    const BATCH_SIZE = 24;
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
        results: [],
        rendered: 0,
        searchTimer: 0,
        observer: null,
        rootObserver: null,
        original: null
    };

    function root() {
        return document.getElementById("aura-studio-library");
    }

    function grid() {
        return document.getElementById("aura-library-grid");
    }

    function scrollRoot() {
        return (
            document.querySelector(
                "#aura-studio-library .aura-studio-library-main"
            ) ||
            root()
        );
    }

    function readList(key) {
        try {
            const value = JSON.parse(
                localStorage.getItem(key) || "[]"
            );
            return Array.isArray(value) ? value : [];
        } catch (error) {
            return [];
        }
    }

    function writeList(key, values, limit) {
        try {
            localStorage.setItem(
                key,
                JSON.stringify(
                    values.slice(0, limit || 200)
                )
            );
        } catch (error) {
            console.warn(
                "[Aura Library V5.2.2] Falha ao salvar preferencia.",
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
        const defaults = Array.isArray(
            window.AURA_STUDIO_PRESETS
        )
            ? window.AURA_STUDIO_PRESETS
            : [];

        const personal =
            window.AuraStudioInspector
                ?.readPersonalBlocks?.() ||
            readList(PERSONAL_KEY);

        return personal.concat(defaults);
    }

    function filteredPresets() {
        const presets = allPresets();
        const favorites = new Set(
            readList(FAVORITE_KEY)
        );
        const recents = readList(RECENT_KEY);
        const order = new Map(
            recents.map(function (id, index) {
                return [id, index];
            })
        );
        const term = normalize(state.query);

        const output = presets.filter(function (preset) {
            if (
                state.category === "Favoritos" ||
                state.favoritesOnly
            ) {
                if (!favorites.has(preset.id)) {
                    return false;
                }
            } else if (
                state.category === "Recentes"
            ) {
                if (!order.has(preset.id)) {
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
            output.sort(function (a, b) {
                const first = order.has(a.id)
                    ? order.get(a.id)
                    : Number.MAX_SAFE_INTEGER;
                const second = order.has(b.id)
                    ? order.get(b.id)
                    : Number.MAX_SAFE_INTEGER;
                return first - second;
            });
        }

        return output;
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

    function createCard(preset, favorites) {
        const blocks = Array.isArray(preset.blocos)
            ? preset.blocos
            : [];

        const article = element(
            "article",
            "aura-studio-template-card aura-v52-template-card"
        );
        article.dataset.v522Preset = preset.id;

        const preview = element(
            "div",
            "aura-studio-template-preview"
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
                (
                    blocks.length === 1
                        ? "bloco"
                        : "blocos"
                );
        }

        const type = element("small", "", typeLabel);

        const favorite = element("button");
        favorite.type = "button";
        favorite.dataset.v522Favorite = preset.id;
        favorite.setAttribute(
            "aria-label",
            "Favoritar modelo"
        );
        favorite.textContent = favorites.has(preset.id)
            ? "★"
            : "☆";

        if (favorites.has(preset.id)) {
            favorite.classList.add("is-active");
        }

        preview.append(
            browser,
            visual,
            type,
            favorite
        );

        const content = element(
            "div",
            "aura-studio-template-content"
        );
        const category = element(
            "small",
            "",
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
        const footer = element("div");
        const quantity = element(
            "span",
            "",
            String(blocks.length) +
                " " +
                (
                    blocks.length === 1
                        ? "bloco"
                        : "blocos"
                )
        );
        const insert = element(
            "button",
            "",
            "Inserir"
        );
        insert.type = "button";
        insert.dataset.v522Insert = preset.id;

        footer.append(quantity, insert);
        content.append(
            category,
            title,
            objective,
            footer
        );
        article.append(preview, content);

        return article;
    }

    function clearNode(node) {
        if (node) {
            node.replaceChildren();
        }
    }

    function populateFilters() {
        const presets = allPresets();
        const favorites = readList(FAVORITE_KEY);
        const recents = readList(RECENT_KEY);
        const categories = [
            "Todos",
            "Recentes",
            "Favoritos"
        ].concat(
            Array.from(
                new Set(
                    presets
                        .map(function (preset) {
                            return preset.categoria;
                        })
                        .filter(Boolean)
                )
            ).sort(function (a, b) {
                return a.localeCompare(b, "pt-BR");
            })
        );

        const objectives = ["Todos"].concat(
            Array.from(
                new Set(
                    presets
                        .map(function (preset) {
                            return preset.objetivo;
                        })
                        .filter(Boolean)
                )
            ).sort(function (a, b) {
                return a.localeCompare(b, "pt-BR");
            })
        );

        const categoriesRoot = document.getElementById(
            "aura-library-categories"
        );
        const objectiveRoot = document.getElementById(
            "aura-library-objective"
        );

        if (categoriesRoot) {
            const fragment =
                document.createDocumentFragment();

            categories.forEach(function (category) {
                const button = element("button");
                button.type = "button";
                button.dataset.v522Category = category;

                if (category === state.category) {
                    button.classList.add("is-active");
                }

                const label = element(
                    "span",
                    "",
                    category
                );

                let count = presets.length;

                if (category === "Recentes") {
                    count = recents.length;
                } else if (category === "Favoritos") {
                    count = favorites.length;
                } else if (category !== "Todos") {
                    count = presets.filter(
                        function (preset) {
                            return (
                                preset.categoria === category
                            );
                        }
                    ).length;
                }

                const total = element(
                    "b",
                    "",
                    count
                );
                button.append(label, total);
                fragment.append(button);
            });

            categoriesRoot.replaceChildren(fragment);
        }

        if (objectiveRoot) {
            const fragment =
                document.createDocumentFragment();

            objectives.forEach(function (objective) {
                const option = element("option");
                option.value = objective;
                option.textContent =
                    objective === "Todos"
                        ? "Todos os objetivos"
                        : objective;
                fragment.append(option);
            });

            objectiveRoot.replaceChildren(fragment);
            objectiveRoot.value = state.objective;
        }

        const total = document.getElementById(
            "aura-library-count"
        );
        const categoryTotal = document.getElementById(
            "aura-library-category-count"
        );

        if (total) {
            total.textContent = String(presets.length);
        }

        if (categoryTotal) {
            categoryTotal.textContent = String(
                new Set(
                    presets.map(function (preset) {
                        return preset.categoria;
                    })
                ).size
            );
        }
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
                state.category === "Todos"
                    ? "Escolha uma estrutura"
                    : state.category;
        }

        if (eyebrow) {
            eyebrow.textContent =
                state.query
                    ? "Pesquisa: " + state.query
                    : state.favoritesOnly
                        ? "Sua selecao"
                        : "Biblioteca profissional";
        }

        if (results) {
            results.textContent =
                String(state.results.length) +
                " resultado" +
                (
                    state.results.length === 1
                        ? ""
                        : "s"
                );
        }
    }

    function updateProgress() {
        const library = root();
        if (!library) {
            return;
        }

        let progress = document.getElementById(
            "aura-v522-progress"
        );
        const header =
            library.querySelector(
                ".aura-studio-library-main-header"
            );

        if (!progress && header) {
            progress = element(
                "span",
                "aura-v52-library-progress"
            );
            progress.id = "aura-v522-progress";
            header.append(progress);
        }

        if (progress) {
            progress.textContent =
                String(
                    Math.min(
                        state.rendered,
                        state.results.length
                    )
                ) +
                " de " +
                String(state.results.length) +
                " carregados";
        }
    }

    function stopObserver() {
        if (state.observer) {
            state.observer.disconnect();
            state.observer = null;
        }
    }

    function createLoadMore() {
        const wrapper = element(
            "div",
            "aura-v52-load-more"
        );
        wrapper.dataset.v522LoadMore = "true";

        const remaining =
            state.results.length - state.rendered;
        const nextAmount = Math.min(
            BATCH_SIZE,
            remaining
        );

        const label = element(
            "span",
            "",
            String(state.rendered) +
                " de " +
                String(state.results.length) +
                " carregados"
        );
        const button = element(
            "button",
            "",
            "Carregar mais " + String(nextAmount)
        );
        button.type = "button";
        button.dataset.v522LoadButton = "true";

        wrapper.append(label, button);
        return wrapper;
    }

    function watchLoadMore() {
        stopObserver();

        const loadMore = document.querySelector(
            "[data-v522-load-more]"
        );

        if (
            !loadMore ||
            state.rendered === state.results.length
        ) {
            return;
        }

        state.observer = new IntersectionObserver(
            function (entries) {
                if (
                    entries.some(function (entry) {
                        return entry.isIntersecting;
                    })
                ) {
                    appendBatch();
                }
            },
            {
                root: scrollRoot(),
                rootMargin: "500px 0px",
                threshold: 0
            }
        );

        state.observer.observe(loadMore);
    }

    function appendBatch() {
        const target = grid();

        if (
            !target ||
            state.rendered === state.results.length
        ) {
            stopObserver();
            return;
        }

        target
            .querySelector("[data-v522-load-more]")
            ?.remove();

        const start = state.rendered;
        const end = Math.min(
            state.results.length,
            start + BATCH_SIZE
        );
        const favorites = new Set(
            readList(FAVORITE_KEY)
        );
        const fragment =
            document.createDocumentFragment();

        state.results
            .slice(start, end)
            .forEach(function (preset) {
                fragment.append(
                    createCard(preset, favorites)
                );
            });

        target.append(fragment);
        state.rendered = end;

        if (state.rendered !== state.results.length) {
            target.append(createLoadMore());
        }

        updateProgress();
        watchLoadMore();
    }

    function renderLibrary() {
        const target = grid();

        if (!target) {
            return;
        }

        stopObserver();
        populateFilters();
        state.results = filteredPresets();
        state.rendered = 0;
        updateHeader();
        clearNode(target);

        if (!state.results.length) {
            const empty = element(
                "div",
                "aura-studio-library-empty aura-v52-library-empty"
            );
            empty.append(
                element(
                    "strong",
                    "",
                    "Nenhum modelo encontrado"
                ),
                element(
                    "p",
                    "",
                    "Tente outra categoria, objetivo ou pesquisa."
                )
            );
            target.append(empty);
            updateProgress();
            return;
        }

        appendBatch();
    }

    function resetFilters() {
        state.query = "";
        state.category = "Todos";
        state.objective = "Todos";
        state.favoritesOnly = false;

        const search = document.getElementById(
            "aura-library-search"
        );
        const objective = document.getElementById(
            "aura-library-objective"
        );
        const favorites = document.getElementById(
            "aura-library-favorites"
        );

        if (search) {
            search.value = "";
        }

        if (objective) {
            objective.value = "Todos";
        }

        favorites?.classList.remove("is-active");
    }

    function openLibrary() {
        const library = root();

        if (!library) {
            return;
        }

        state.open = true;
        resetFilters();
        library.classList.add(
            "aura-library-performance-v52"
        );
        library.classList.remove("hidden");
        renderLibrary();

        window.setTimeout(function () {
            document
                .getElementById(
                    "aura-library-search"
                )
                ?.focus();
        }, 30);
    }

    function closeLibrary() {
        state.open = false;
        stopObserver();
        root()?.classList.add("hidden");
    }

    function toggleFavorite(id) {
        const values = readList(FAVORITE_KEY);
        const index = values.indexOf(id);

        if (index === -1) {
            values.unshift(id);
        } else {
            values.splice(index, 1);
        }

        writeList(FAVORITE_KEY, values, 300);

        if (
            state.category === "Favoritos" ||
            state.favoritesOnly
        ) {
            renderLibrary();
            return;
        }

        const button = document.querySelector(
            "[data-v522-favorite='" +
                CSS.escape(id) +
                "']"
        );

        if (button) {
            const active = values.includes(id);
            button.classList.toggle(
                "is-active",
                active
            );
            button.textContent = active
                ? "★"
                : "☆";
        }

        populateFilters();
    }

    function insertPreset(id) {
        const insert =
            state.original?.insertPreset ||
            window.AuraStudioPro?.insertPreset;

        if (typeof insert !== "function") {
            console.error(
                "[Aura Library V5.2.2] Insercao indisponivel."
            );
            return;
        }

        insert.call(window.AuraStudioPro, id);
        closeLibrary();
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

        if (
            !modal ||
            modal.classList.contains("hidden")
        ) {
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
            "[data-v522-category]"
        );

        if (category && root()?.contains(category)) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            state.category =
                category.dataset.v522Category ||
                "Todos";
            state.favoritesOnly =
                state.category === "Favoritos";
            syncProState();
            renderLibrary();
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
            renderLibrary();
            return;
        }

        const favorite = target.closest(
            "[data-v522-favorite]"
        );

        if (favorite && root()?.contains(favorite)) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            toggleFavorite(
                favorite.dataset.v522Favorite
            );
            return;
        }

        const insert = target.closest(
            "[data-v522-insert]"
        );

        if (insert && root()?.contains(insert)) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            insertPreset(
                insert.dataset.v522Insert
            );
            return;
        }

        const load = target.closest(
            "[data-v522-load-button]"
        );

        if (load && root()?.contains(load)) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            appendBatch();
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
            renderLibrary,
            180
        );
    }

    function captureChange(event) {
        const target = event.target;

        if (
            !(target instanceof HTMLSelectElement) ||
            target.id !== "aura-library-objective"
        ) {
            return;
        }

        event.stopPropagation();
        event.stopImmediatePropagation();

        state.objective =
            target.value || "Todos";
        syncProState();
        renderLibrary();
    }

    function captureKey(event) {
        const modal = document.getElementById(
            "lp-editor-modal"
        );

        if (
            !modal ||
            modal.classList.contains("hidden")
        ) {
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
            String(event.key || "")
                .toLowerCase() === "b"
        ) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            openLibrary();
        }
    }

    function patchApi() {
        const api = window.AuraStudioPro;

        if (!api || api.__auraLibraryV522) {
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
        api.renderLibrary = renderLibrary;
        api.__auraLibraryV522 = true;
    }

    function watchExternalOpen() {
        const library = root();

        if (!library || state.rootObserver) {
            return;
        }

        state.rootObserver = new MutationObserver(
            function (records) {
                const opened = records.some(
                    function (record) {
                        return (
                            record.type === "attributes" &&
                            record.attributeName === "class" &&
                            !library.classList.contains(
                                "hidden"
                            )
                        );
                    }
                );

                if (opened && !state.open) {
                    state.open = true;
                    library.classList.add(
                        "aura-library-performance-v52"
                    );
                    window.setTimeout(
                        renderLibrary,
                        0
                    );
                }
            }
        );

        state.rootObserver.observe(library, {
            attributes: true,
            attributeFilter: ["class"]
        });
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
            !Array.isArray(
                window.AURA_STUDIO_PRESETS
            )
        ) {
            window.setTimeout(init, 160);
            return;
        }

        state.ready = true;
        patchApi();
        bind();
        watchExternalOpen();

        root().classList.add(
            "aura-library-performance-v52"
        );

        window.AuraLibraryPerformanceV522 = {
            version: VERSION,
            open: openLibrary,
            close: closeLibrary,
            render: renderLibrary,
            loadMore: appendBatch,
            getState: function () {
                return {
                    open: state.open,
                    totalResults:
                        state.results.length,
                    rendered: state.rendered,
                    batchSize: BATCH_SIZE,
                    category: state.category,
                    objective: state.objective
                };
            }
        };

        console.info(
            "[Vide Aura Library Performance V5.2.2] Inicializado",
            {
                presets: allPresets().length,
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
