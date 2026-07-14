/**
 * Vide Aura — Studio Mobile Stable V6.4
 *
 * Corrige o editor de Landing Page no celular sem remover funções.
 * - Desativa arraste nativo dos cards apenas no mobile.
 * - Separa "Blocos" e "Prévia" em duas telas.
 * - Remove camadas invisíveis que interceptam toques.
 * - Mantém salvar, publicar, dispositivos e ferramentas.
 * - Não altera Firebase, dados, blocos ou publicação.
 */
(function () {
    "use strict";

    const VERSION = "6.4.0";
    const BREAKPOINT = 780;
    const EDITOR_ID = "lp-editor-modal";
    const LIST_ID = "lped-blocos-lista";
    const LEFT_ID = "lped-painel-lateral";
    const INSPECTOR_ID = "aura-studio-inspector";

    const state = {
        initialized: false,
        view: "blocks",
        observer: null,
        touchStart: null,
        scheduled: false
    };

    function isMobile() {
        return window.matchMedia(
            "(max-width: " + BREAKPOINT + "px)"
        ).matches;
    }

    function editor() {
        return document.getElementById(EDITOR_ID);
    }

    function list() {
        return document.getElementById(LIST_ID);
    }

    function leftPanel() {
        return document.getElementById(LEFT_ID);
    }

    function inspector() {
        return document.getElementById(INSPECTOR_ID);
    }

    function canvasStage() {
        return (
            document.querySelector(
                "#" + EDITOR_ID + " .aura-lped-stage"
            ) ||
            document.querySelector(
                "#" + EDITOR_ID + " .aura-lped-canvas-scroll"
            ) ||
            document.getElementById("lped-browser-frame")
        );
    }

    function injectStyles() {
        if (
            document.getElementById(
                "aura-mobile-stable-v64-style"
            )
        ) {
            return;
        }

        const style = document.createElement("style");
        style.id = "aura-mobile-stable-v64-style";

        style.textContent = `
            @media (max-width: ${BREAKPOINT}px) {
                #${EDITOR_ID}.aura-mobile-stable-v64 {
                    --aura-v64-top: 318px;
                    --aura-v64-tabs: 56px;
                    --aura-v64-bottom: 68px;
                    width: 100vw !important;
                    max-width: 100vw !important;
                    height: 100dvh !important;
                    overflow: hidden !important;
                }

                #${EDITOR_ID}.aura-mobile-stable-v64
                > .aura-lped-topbar {
                    position: fixed !important;
                    inset: 0 0 auto 0 !important;
                    z-index: 500 !important;
                    display: flex !important;
                    width: 100vw !important;
                    min-height: var(--aura-v64-top) !important;
                    max-height: var(--aura-v64-top) !important;
                    align-items: flex-start !important;
                    align-content: flex-start !important;
                    flex-wrap: wrap !important;
                    gap: 8px !important;
                    padding: 10px !important;
                    overflow-x: auto !important;
                    overflow-y: auto !important;
                    border-bottom:
                        1px solid rgba(255,255,255,.08) !important;
                    background: #080d16 !important;
                    box-shadow: none !important;
                    pointer-events: auto !important;
                    touch-action: pan-x pan-y !important;
                    -webkit-overflow-scrolling: touch;
                }

                #${EDITOR_ID}.aura-mobile-stable-v64
                > .aura-lped-topbar > * {
                    flex: 0 0 auto !important;
                    min-width: 0 !important;
                    pointer-events: auto !important;
                }

                #${EDITOR_ID}.aura-mobile-stable-v64
                > .aura-lped-topbar button,
                #${EDITOR_ID}.aura-mobile-stable-v64
                > .aura-lped-topbar input,
                #${EDITOR_ID}.aura-mobile-stable-v64
                > .aura-lped-topbar select {
                    min-height: 44px !important;
                    pointer-events: auto !important;
                    touch-action: manipulation !important;
                }

                #${EDITOR_ID}.aura-mobile-stable-v64
                #aura-studio-brand {
                    display: none !important;
                }

                #${EDITOR_ID}.aura-mobile-stable-v64
                .aura-mobile-v64-tabs {
                    position: fixed !important;
                    top: var(--aura-v64-top) !important;
                    right: 0 !important;
                    left: 0 !important;
                    z-index: 510 !important;
                    display: grid !important;
                    grid-template-columns: 1fr 1fr;
                    height: var(--aura-v64-tabs) !important;
                    padding: 7px 10px !important;
                    gap: 8px !important;
                    border-bottom:
                        1px solid rgba(255,255,255,.08);
                    background: #090e17;
                    pointer-events: auto !important;
                }

                #${EDITOR_ID}.aura-mobile-stable-v64
                .aura-mobile-v64-tabs button {
                    min-width: 0 !important;
                    min-height: 42px !important;
                    border:
                        1px solid rgba(255,255,255,.09);
                    border-radius: 11px;
                    background: rgba(255,255,255,.025);
                    color: #8793a6;
                    font: inherit;
                    font-size: 12px;
                    font-weight: 850;
                    pointer-events: auto !important;
                    touch-action: manipulation !important;
                }

                #${EDITOR_ID}.aura-mobile-stable-v64
                .aura-mobile-v64-tabs button.is-active {
                    border-color: rgba(99,141,245,.44);
                    background: rgba(99,141,245,.14);
                    color: #ffffff;
                }

                #${EDITOR_ID}.aura-mobile-stable-v64
                .aura-lped-workspace,
                #${EDITOR_ID}.aura-mobile-stable-v64
                .aura-lped-main,
                #${EDITOR_ID}.aura-mobile-stable-v64
                .aura-lped-content {
                    position: fixed !important;
                    top:
                        calc(
                            var(--aura-v64-top) +
                            var(--aura-v64-tabs)
                        ) !important;
                    right: 0 !important;
                    bottom: var(--aura-v64-bottom) !important;
                    left: 0 !important;
                    display: block !important;
                    width: 100vw !important;
                    min-width: 0 !important;
                    max-width: 100vw !important;
                    height: auto !important;
                    min-height: 0 !important;
                    overflow: hidden !important;
                }

                #${EDITOR_ID}.aura-mobile-stable-v64
                #${LEFT_ID},
                #${EDITOR_ID}.aura-mobile-stable-v64
                .aura-lped-stage {
                    position: absolute !important;
                    inset: 0 !important;
                    width: 100vw !important;
                    min-width: 0 !important;
                    max-width: 100vw !important;
                    height: 100% !important;
                    max-height: 100% !important;
                    margin: 0 !important;
                    transform: none !important;
                    overflow-x: hidden !important;
                    overflow-y: auto !important;
                    pointer-events: auto !important;
                    -webkit-overflow-scrolling: touch;
                }

                #${EDITOR_ID}.aura-mobile-stable-v64
                #${LEFT_ID} {
                    border-right: 0 !important;
                    background: #090e17 !important;
                    padding-bottom: 28px !important;
                    touch-action: pan-y !important;
                }

                #${EDITOR_ID}.aura-mobile-stable-v64
                #${LEFT_ID} > .sticky {
                    position: sticky !important;
                    top: 0 !important;
                    z-index: 5 !important;
                    background: #090e17 !important;
                }

                #${EDITOR_ID}.aura-mobile-stable-v64
                #${LIST_ID} {
                    width: 100% !important;
                    max-width: 100% !important;
                    touch-action: pan-y !important;
                }

                #${EDITOR_ID}.aura-mobile-stable-v64
                #${LIST_ID} > * {
                    width: 100% !important;
                    max-width: 100% !important;
                    min-height: 58px !important;
                    touch-action: pan-y !important;
                    user-select: none !important;
                    -webkit-user-select: none !important;
                    pointer-events: auto !important;
                    content-visibility: auto;
                    contain-intrinsic-size: 58px;
                }

                #${EDITOR_ID}.aura-mobile-stable-v64
                #${LIST_ID} button,
                #${EDITOR_ID}.aura-mobile-stable-v64
                #${LIST_ID} input,
                #${EDITOR_ID}.aura-mobile-stable-v64
                #${LIST_ID} select,
                #${EDITOR_ID}.aura-mobile-stable-v64
                #${LIST_ID} textarea,
                #${EDITOR_ID}.aura-mobile-stable-v64
                #${LIST_ID} label {
                    pointer-events: auto !important;
                    touch-action: manipulation !important;
                    user-select: auto !important;
                    -webkit-user-select: auto !important;
                }

                #${EDITOR_ID}.aura-mobile-stable-v64
                #${LIST_ID} input,
                #${EDITOR_ID}.aura-mobile-stable-v64
                #${LIST_ID} select,
                #${EDITOR_ID}.aura-mobile-stable-v64
                #${LIST_ID} textarea {
                    font-size: 16px !important;
                }

                #${EDITOR_ID}.aura-mobile-stable-v64
                .aura-lped-stage {
                    padding: 10px !important;
                    background: #070b12 !important;
                    touch-action: pan-x pan-y !important;
                }

                #${EDITOR_ID}.aura-mobile-stable-v64
                #lped-browser-frame,
                #${EDITOR_ID}.aura-mobile-stable-v64
                #lped-preview-canvas {
                    width: 100% !important;
                    min-width: 0 !important;
                    max-width: 100% !important;
                    margin: 0 auto !important;
                }

                #${EDITOR_ID}.aura-mobile-stable-v64
                #${INSPECTOR_ID} {
                    display: none !important;
                    pointer-events: none !important;
                }

                #${EDITOR_ID}.aura-mobile-stable-v64
                #aura-max-dock,
                #${EDITOR_ID}.aura-mobile-stable-v64
                #aura-ultimate-rail {
                    display: none !important;
                    pointer-events: none !important;
                }

                #${EDITOR_ID}.aura-mobile-stable-v64
                #aura-studio-bottom-bar,
                #${EDITOR_ID}.aura-mobile-stable-v64
                .aura-v4-toolbar {
                    position: fixed !important;
                    right: 0 !important;
                    bottom: 0 !important;
                    left: 0 !important;
                    z-index: 520 !important;
                    display: flex !important;
                    width: 100vw !important;
                    min-height: var(--aura-v64-bottom) !important;
                    align-items: center !important;
                    justify-content: flex-start !important;
                    gap: 4px !important;
                    padding:
                        7px 8px
                        calc(7px + env(safe-area-inset-bottom))
                        !important;
                    overflow-x: auto !important;
                    overflow-y: hidden !important;
                    border: 0 !important;
                    border-top:
                        1px solid rgba(255,255,255,.08)
                        !important;
                    border-radius: 0 !important;
                    background: #080d16 !important;
                    box-shadow: none !important;
                    pointer-events: auto !important;
                    touch-action: pan-x !important;
                    scrollbar-width: none !important;
                }

                #${EDITOR_ID}.aura-mobile-stable-v64
                #aura-studio-bottom-bar::-webkit-scrollbar,
                #${EDITOR_ID}.aura-mobile-stable-v64
                .aura-v4-toolbar::-webkit-scrollbar {
                    display: none !important;
                }

                #${EDITOR_ID}.aura-mobile-stable-v64
                #aura-studio-bottom-bar button,
                #${EDITOR_ID}.aura-mobile-stable-v64
                .aura-v4-toolbar button {
                    flex: 0 0 auto !important;
                    min-width: 62px !important;
                    min-height: 44px !important;
                    pointer-events: auto !important;
                    touch-action: manipulation !important;
                }

                #${EDITOR_ID}.aura-mobile-stable-v64
                .aura-v64-hidden {
                    display: none !important;
                    pointer-events: none !important;
                }

                #${EDITOR_ID}.aura-mobile-stable-v64
                .aura-v64-visible {
                    display: block !important;
                    pointer-events: auto !important;
                }
            }

            @media (max-width: 430px) {
                #${EDITOR_ID}.aura-mobile-stable-v64 {
                    --aura-v64-top: 320px;
                }
            }
        `;

        document.head.appendChild(style);
    }

    function createTabs() {
        const root = editor();

        if (
            !root ||
            document.getElementById(
                "aura-mobile-v64-tabs"
            )
        ) {
            return;
        }

        const tabs = document.createElement("nav");
        tabs.id = "aura-mobile-v64-tabs";
        tabs.className = "aura-mobile-v64-tabs";

        const blocks = document.createElement("button");
        blocks.type = "button";
        blocks.dataset.auraV64View = "blocks";
        blocks.textContent = "Blocos";

        const preview = document.createElement("button");
        preview.type = "button";
        preview.dataset.auraV64View = "preview";
        preview.textContent = "Prévia";

        tabs.append(blocks, preview);

        tabs.addEventListener(
            "click",
            function (event) {
                const button =
                    event.target.closest(
                        "[data-aura-v64-view]"
                    );

                if (!button) {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();

                setView(
                    button.dataset.auraV64View
                );
            }
        );

        root.appendChild(tabs);
    }

    function setView(view) {
        state.view =
            view === "preview"
                ? "preview"
                : "blocks";

        const panel = leftPanel();
        const stage = canvasStage();

        if (panel) {
            panel.classList.toggle(
                "aura-v64-hidden",
                state.view !== "blocks"
            );
            panel.classList.toggle(
                "aura-v64-visible",
                state.view === "blocks"
            );
        }

        if (stage) {
            stage.classList.toggle(
                "aura-v64-hidden",
                state.view !== "preview"
            );
            stage.classList.toggle(
                "aura-v64-visible",
                state.view === "preview"
            );
        }

        document
            .querySelectorAll(
                "[data-aura-v64-view]"
            )
            .forEach(function (button) {
                button.classList.toggle(
                    "is-active",
                    button.dataset.auraV64View ===
                        state.view
                );
            });

        if (state.view === "preview") {
            window.setTimeout(
                function () {
                    window.AuraStudioPro
                        ?.fitCanvas?.();

                    window.AuraStudioDeviceHotfix
                        ?.sync?.();
                },
                100
            );
        }
    }

    function disableNativeDrag() {
        if (!isMobile()) {
            return;
        }

        const box = list();

        if (!box) {
            return;
        }

        box
            .querySelectorAll("[draggable]")
            .forEach(function (element) {
                element.draggable = false;
                element.setAttribute(
                    "draggable",
                    "false"
                );
            });
    }

    function getBlockIndex(element) {
        const indexed = element.closest(
            "[data-index], [data-bloco-index]"
        );

        if (indexed) {
            const raw =
                indexed.getAttribute("data-index") ??
                indexed.getAttribute(
                    "data-bloco-index"
                );

            const value = Number(raw);

            if (Number.isInteger(value)) {
                return value;
            }
        }

        const clickable = element.closest(
            "[onclick*='alternarColapsoBloco']"
        );

        if (clickable) {
            const onclick =
                clickable.getAttribute("onclick") || "";

            const match = onclick.match(
                /alternarColapsoBloco\s*\(\s*(\d+)\s*\)/
            );

            if (match) {
                return Number(match[1]);
            }
        }

        return null;
    }

    function isInteractive(element) {
        return Boolean(
            element.closest(
                "button, a, input, select, textarea, " +
                "label, [contenteditable='true'], " +
                "[onclick*='remover'], " +
                "[onclick*='trocarAba'], " +
                "[onclick*='moverBloco']"
            )
        );
    }

    function installTapSupport() {
        const box = list();

        if (!box || box.dataset.auraV64Tap === "true") {
            return;
        }

        box.dataset.auraV64Tap = "true";

        box.addEventListener(
            "pointerdown",
            function (event) {
                if (!isMobile()) {
                    return;
                }

                state.touchStart = {
                    id: event.pointerId,
                    x: event.clientX,
                    y: event.clientY,
                    time: Date.now(),
                    target: event.target
                };
            },
            {
                passive: true
            }
        );

        box.addEventListener(
            "pointerup",
            function (event) {
                if (
                    !isMobile() ||
                    !state.touchStart ||
                    state.touchStart.id !==
                        event.pointerId
                ) {
                    return;
                }

                const start = state.touchStart;
                state.touchStart = null;

                const distance = Math.hypot(
                    event.clientX - start.x,
                    event.clientY - start.y
                );

                const duration =
                    Date.now() - start.time;

                if (
                    distance > 10 ||
                    duration > 650
                ) {
                    return;
                }

                const target =
                    event.target instanceof Element
                        ? event.target
                        : null;

                if (!target || isInteractive(target)) {
                    return;
                }

                const index = getBlockIndex(target);

                if (
                    index === null ||
                    typeof window
                        .alternarColapsoBloco !==
                        "function"
                ) {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();

                window.alternarColapsoBloco(index);
            },
            true
        );

        box.addEventListener(
            "dragstart",
            function (event) {
                if (!isMobile()) {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();
            },
            true
        );
    }

    function clearBlockingLayers() {
        if (!isMobile()) {
            return;
        }

        const root = editor();

        if (!root) {
            return;
        }

        root.style.pointerEvents = "auto";

        root
            .querySelectorAll(
                "[aria-hidden='true'], .hidden"
            )
            .forEach(function (element) {
                if (
                    element === root ||
                    element.contains(leftPanel()) ||
                    element.contains(canvasStage())
                ) {
                    return;
                }

                const style =
                    getComputedStyle(element);

                if (
                    style.position === "fixed" ||
                    style.position === "absolute"
                ) {
                    element.style.pointerEvents =
                        "none";
                }
            });

        const emptyInspector = inspector();

        if (emptyInspector) {
            emptyInspector.style.pointerEvents =
                "none";
        }
    }

    function apply() {
        const root = editor();

        if (!root || !isMobile()) {
            return;
        }

        root.classList.add(
            "aura-mobile-stable-v64"
        );

        createTabs();
        disableNativeDrag();
        installTapSupport();
        clearBlockingLayers();
        setView(state.view);
    }

    function scheduleApply() {
        if (state.scheduled) {
            return;
        }

        state.scheduled = true;

        requestAnimationFrame(function () {
            state.scheduled = false;
            apply();
        });
    }

    function observe() {
        if (state.observer || !document.body) {
            return;
        }

        state.observer = new MutationObserver(
            scheduleApply
        );

        state.observer.observe(
            document.body,
            {
                childList: true,
                subtree: true
            }
        );
    }

    function initialize() {
        if (state.initialized) {
            return;
        }

        state.initialized = true;

        injectStyles();
        apply();
        observe();

        window.addEventListener(
            "resize",
            scheduleApply
        );

        window.addEventListener(
            "pageshow",
            scheduleApply
        );

        window.AuraStudioMobileStableV64 = {
            version: VERSION,

            showBlocks: function () {
                setView("blocks");
            },

            showPreview: function () {
                setView("preview");
            },

            refresh: scheduleApply,

            getState: function () {
                return {
                    mobile: isMobile(),
                    view: state.view
                };
            }
        };

        console.info(
            "[Vide Aura Studio Mobile Stable V6.4] Inicializado"
        );
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            initialize,
            {
                once: true
            }
        );
    } else {
        initialize();
    }
})();

