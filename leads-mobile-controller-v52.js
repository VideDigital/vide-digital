/**
 * Vide Aura — Leads Mobile Controller V5.2
 *
 * Corrige a abertura involuntária do Leads V5 no celular,
 * adiciona um botão de fechar sempre visível e libera a tela.
 *
 * Não altera Firebase, leads, filtros, scoring ou dados.
 */

(function () {
    "use strict";

    const VERSION = "5.2.0";
    const MOBILE_BREAKPOINT = 980;

    const state = {
        initialized: false,
        abortController: null,
        timers: new Set(),
        wasOpenedByUser: false,
        historyAdded: false
    };

    function isMobile() {
        return window.matchMedia(
            `(max-width: ${MOBILE_BREAKPOINT}px)`
        ).matches;
    }

    function getModal() {
        return document.getElementById(
            "aura-leads-v5-modal"
        );
    }

    function getControllerSignal() {
        if (
            !state.abortController ||
            state.abortController.signal.aborted
        ) {
            state.abortController = new AbortController();
        }

        return state.abortController.signal;
    }

    function schedule(callback, delay) {
        const timer = window.setTimeout(function () {
            state.timers.delete(timer);
            callback();
        }, delay);

        state.timers.add(timer);
        return timer;
    }

    function clearScheduledTasks() {
        state.timers.forEach(function (timer) {
            window.clearTimeout(timer);
        });
        state.timers.clear();
    }

    function isModalOpen() {
        const modal = getModal();

        return Boolean(
            modal &&
            modal.classList.contains("is-open") &&
            modal.getAttribute("aria-hidden") !== "true"
        );
    }

    function closeLeads(options = {}) {
        const leadEngine = window.AuraLeadsV5;

        if (typeof leadEngine?.close !== "function") {
            return false;
        }

        leadEngine.close();

        state.wasOpenedByUser = false;

        if (
            options.restoreHistory &&
            state.historyAdded
        ) {
            state.historyAdded = false;
            window.history.back();
        }

        window.dispatchEvent(
            new CustomEvent(
                "aura:leads-mobile-closed"
            )
        );

        return true;
    }

    function createCloseButton() {
        const modal = getModal();

        if (
            !modal ||
            document.getElementById(
                "aura-leads-mobile-close-v52"
            )
        ) {
            return;
        }

        const button = document.createElement("button");

        button.id = "aura-leads-mobile-close-v52";
        button.type = "button";
        button.setAttribute(
            "aria-label",
            "Fechar Leads e voltar ao dashboard"
        );

        button.innerHTML = `
            <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                aria-hidden="true"
            >
                <path
                    d="m6 6 12 12"
                    stroke-width="2.2"
                    stroke-linecap="round"
                ></path>

                <path
                    d="M18 6 6 18"
                    stroke-width="2.2"
                    stroke-linecap="round"
                ></path>
            </svg>

            <span>Fechar</span>
        `;

        button.addEventListener(
            "click",
            function (event) {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();

                closeLeads({
                    restoreHistory: true
                });
            },
            {
                capture: true,
                signal: getControllerSignal()
            }
        );

        modal.appendChild(button);
    }

    function injectStyles() {
        if (
            document.getElementById(
                "aura-leads-mobile-controller-v52-style"
            )
        ) {
            return;
        }

        const style = document.createElement("style");

        style.id =
            "aura-leads-mobile-controller-v52-style";

        style.textContent = `
            #aura-leads-mobile-close-v52 {
                display: none;
            }

            @media (max-width: ${MOBILE_BREAKPOINT}px) {
                #aura-leads-v5-modal {
                    position: fixed !important;
                    inset: 0 !important;
                    z-index: 2147483000 !important;
                    width: 100vw !important;
                    max-width: 100vw !important;
                    height: 100dvh !important;
                    max-height: 100dvh !important;
                    overflow: hidden !important;
                    background: #070b12 !important;
                }

                #aura-leads-v5-modal
                .aura-leads-v5-shell {
                    width: 100vw !important;
                    max-width: 100vw !important;
                    height: 100dvh !important;
                    max-height: 100dvh !important;
                    border-radius: 0 !important;
                    overflow: hidden !important;
                }

                #aura-leads-v5-modal
                .aura-leads-v5-header {
                    padding-right: 92px !important;
                }

                #aura-leads-mobile-close-v52 {
                    position: fixed !important;
                    top:
                        max(
                            12px,
                            env(safe-area-inset-top)
                        ) !important;
                    right: 12px !important;
                    z-index: 2147483646 !important;

                    display: inline-flex !important;
                    min-width: 72px;
                    height: 44px;
                    align-items: center;
                    justify-content: center;
                    gap: 7px;

                    padding: 0 12px;
                    border:
                        1px solid
                        rgba(255, 255, 255, .14);
                    border-radius: 12px;

                    background: #111827;
                    box-shadow:
                        0 10px 30px
                        rgba(0, 0, 0, .35);

                    color: #ffffff;
                    font: inherit;
                    font-size: 12px;
                    font-weight: 800;

                    pointer-events: auto !important;
                    touch-action: manipulation !important;
                    cursor: pointer;
                }

                #aura-leads-mobile-close-v52 svg {
                    width: 18px;
                    height: 18px;
                    flex: 0 0 auto;
                }

                #aura-leads-v5-modal
                .aura-leads-v5-body,
                #aura-leads-v5-modal
                .aura-leads-v5-main {
                    min-height: 0 !important;
                    overflow-y: auto !important;
                    -webkit-overflow-scrolling:
                        touch !important;
                }

                #aura-leads-v5-modal
                .aura-leads-v5-tabs {
                    overflow-x: auto !important;
                    overflow-y: hidden !important;
                    padding-right: 12px !important;
                    scrollbar-width: none !important;
                    -webkit-overflow-scrolling:
                        touch !important;
                }

                #aura-leads-v5-modal
                .aura-leads-v5-tabs::-webkit-scrollbar {
                    display: none !important;
                }

                #aura-leads-v5-modal
                .aura-leads-v5-tabs button {
                    flex: 0 0 auto !important;
                    min-width: max-content !important;
                }
            }
        `;

        document.head.appendChild(style);
    }

    function markOpenByUser() {
        state.wasOpenedByUser = true;

        if (
            isMobile() &&
            !state.historyAdded
        ) {
            state.historyAdded = true;

            window.history.pushState(
                {
                    auraLeadsMobile: true
                },
                "",
                window.location.href
            );
        }
    }

    function handleModalStateChange(event) {
        const open = typeof event?.detail?.open === "boolean"
            ? event.detail.open
            : isModalOpen();

        if (open) {
            createCloseButton();

            if (!state.wasOpenedByUser) {
                markOpenByUser();
            }

            return;
        }

        state.wasOpenedByUser = false;
    }

    function watchOpenButtons() {
        document.addEventListener(
            "pointerdown",
            function (event) {
                const target =
                    event.target instanceof Element
                        ? event.target.closest(
                            "#aura-leads-v5-open, " +
                            "[data-open-leads-v5], " +
                            "[data-action='open-leads-v5']"
                        )
                        : null;

                if (!target) {
                    return;
                }

                state.wasOpenedByUser = true;
            },
            {
                capture: true,
                signal: getControllerSignal()
            }
        );
    }

    function closeOnInitialMobileLoad() {
        if (!isMobile()) {
            return;
        }

        schedule(
            function () {
                if (!state.wasOpenedByUser) {
                    closeLeads();
                }
            },
            80
        );

        schedule(
            function () {
                if (!state.wasOpenedByUser) {
                    closeLeads();
                }
            },
            500
        );

        schedule(
            function () {
                if (!state.wasOpenedByUser) {
                    closeLeads();
                }
            },
            1400
        );
    }

    function initializeModalWhenAvailable() {
        const modal = getModal();

        if (!modal) {
            schedule(
                initializeModalWhenAvailable,
                150
            );
            return;
        }

        createCloseButton();
        handleModalStateChange();
        closeOnInitialMobileLoad();
    }

    function handlePopState() {
        if (isMobile() && isModalOpen()) {
            state.historyAdded = false;
            closeLeads();
        }
    }

    function handlePageShow(event) {
        if (
            isMobile() &&
            (
                event.persisted ||
                !state.wasOpenedByUser
            )
        ) {
            schedule(function () {
                closeLeads();
            }, 50);
        }
    }

    function teardown() {
        clearScheduledTasks();
        state.abortController?.abort();
        state.abortController = null;
        state.wasOpenedByUser = false;
        state.historyAdded = false;
        state.initialized = false;

        document.getElementById(
            "aura-leads-mobile-close-v52"
        )?.remove();
        document.getElementById(
            "aura-leads-mobile-controller-v52-style"
        )?.remove();
    }

    function handlePageHide(event) {
        if (!event.persisted) {
            teardown();
        }
    }

    function initialize() {
        if (state.initialized) {
            return;
        }

        state.initialized = true;
        const signal = getControllerSignal();

        injectStyles();
        watchOpenButtons();
        initializeModalWhenAvailable();

        window.addEventListener(
            "aura:leads-v5-statechange",
            handleModalStateChange,
            { signal }
        );
        window.addEventListener(
            "popstate",
            handlePopState,
            { signal }
        );
        window.addEventListener(
            "pageshow",
            handlePageShow,
            { signal }
        );
        window.addEventListener(
            "pagehide",
            handlePageHide,
            { signal }
        );

        window.AuraLeadsMobileControllerV52 = {
            version: VERSION,

            close: closeLeads,
            destroy: teardown,

            getState: function () {
                return {
                    mobile: isMobile(),
                    open: isModalOpen(),
                    openedByUser:
                        state.wasOpenedByUser,
                    historyAdded:
                        state.historyAdded
                };
            }
        };

        console.info(
            "[Vide Aura Leads Mobile Controller V5.2] Inicializado"
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
