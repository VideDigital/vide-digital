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
        observer: null,
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

    function isModalOpen() {
        const modal = getModal();

        return Boolean(
            modal &&
            modal.classList.contains("is-open") &&
            modal.getAttribute("aria-hidden") !== "true"
        );
    }

    function unlockPage() {
        document.body.classList.remove(
            "aura-leads-v5-lock"
        );

        document.documentElement.style.overflow = "";
        document.documentElement.style.pointerEvents = "";

        document.body.style.overflow = "";
        document.body.style.pointerEvents = "";
        document.body.style.touchAction = "";
    }

    function closeLeads(options = {}) {
        const modal = getModal();

        if (!modal) {
            unlockPage();
            return;
        }

        modal.classList.remove("is-open");
        modal.setAttribute("aria-hidden", "true");
        modal.style.pointerEvents = "none";

        unlockPage();

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
            true
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
            #aura-leads-v5-modal[aria-hidden="true"] {
                visibility: hidden !important;
                opacity: 0 !important;
                pointer-events: none !important;
            }

            #aura-leads-v5-modal.is-open[aria-hidden="false"] {
                visibility: visible !important;
                opacity: 1 !important;
                pointer-events: auto !important;
            }

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

    function observeModal() {
        const modal = getModal();

        if (!modal || state.observer) {
            return;
        }

        state.observer = new MutationObserver(
            function (records) {
                const changed = records.some(
                    function (record) {
                        return (
                            record.type ===
                                "attributes" &&
                            (
                                record.attributeName ===
                                    "class" ||
                                record.attributeName ===
                                    "aria-hidden"
                            )
                        );
                    }
                );

                if (!changed) {
                    return;
                }

                if (isModalOpen()) {
                    modal.style.pointerEvents = "auto";
                    createCloseButton();

                    if (!state.wasOpenedByUser) {
                        markOpenByUser();
                    }
                } else {
                    modal.style.pointerEvents = "none";
                    unlockPage();
                }
            }
        );

        state.observer.observe(modal, {
            attributes: true,
            attributeFilter: [
                "class",
                "aria-hidden"
            ]
        });
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
            true
        );
    }

    function closeOnInitialMobileLoad() {
        if (!isMobile()) {
            return;
        }

        window.setTimeout(
            function () {
                if (!state.wasOpenedByUser) {
                    closeLeads();
                }
            },
            80
        );

        window.setTimeout(
            function () {
                if (!state.wasOpenedByUser) {
                    closeLeads();
                }
            },
            500
        );

        window.setTimeout(
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
            window.setTimeout(
                initializeModalWhenAvailable,
                150
            );
            return;
        }

        createCloseButton();
        observeModal();
        closeOnInitialMobileLoad();
    }

    function initialize() {
        if (state.initialized) {
            return;
        }

        state.initialized = true;

        injectStyles();
        watchOpenButtons();
        initializeModalWhenAvailable();

        window.addEventListener(
            "popstate",
            function () {
                if (
                    isMobile() &&
                    isModalOpen()
                ) {
                    state.historyAdded = false;
                    closeLeads();
                }
            }
        );

        window.addEventListener(
            "pageshow",
            function (event) {
                if (
                    isMobile() &&
                    (
                        event.persisted ||
                        !state.wasOpenedByUser
                    )
                ) {
                    window.setTimeout(
                        function () {
                            closeLeads();
                        },
                        50
                    );
                }
            }
        );

        window.addEventListener(
            "resize",
            function () {
                if (!isMobile()) {
                    unlockPage();
                }
            }
        );

        window.AuraLeadsMobileControllerV52 = {
            version: VERSION,

            close: closeLeads,

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