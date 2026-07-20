/**
 * Vide Aura — Mobile Click Recovery V1
 *
 * Recupera cliques do dashboard e abertura das Landing Pages.
 * Não altera Firebase, IDs, dados, salvamento ou publicação.
 */
(function () {
    "use strict";

    const VERSION = "1.0.0";

    const state = {
        initialized: false,
        attempts: 0
    };

    function normalizeText(value) {
        return String(value || "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

    function resetGlobalInteraction() {
        // Só escreve quando o valor realmente precisa mudar: o observer abaixo
        // escuta mutações de "style" no body, então uma escrita incondicional
        // aqui (mesmo pra "") reativa o próprio observer e nunca para.
        if (document.documentElement.style.pointerEvents) document.documentElement.style.pointerEvents = "";
        if (document.documentElement.style.overflow) document.documentElement.style.overflow = "";

        if (document.body) {
            if (document.body.style.pointerEvents) document.body.style.pointerEvents = "";
            if (document.body.style.touchAction) document.body.style.touchAction = "";
            if (document.body.style.overflowX) document.body.style.overflowX = "";
        }
    }

    function removeBrokenWorkspaceState() {
        const editor = document.getElementById("lp-editor-modal");

        if (editor) {
            editor.classList.remove(
                "aura-workspace-clean-v61",
                "aura-v61-focus-mode",
                "aura-v61-left-collapsed",
                "aura-workspace-v61-focus",
                "aura-workspace-v61-left-collapsed",
                "aura-v51-focus",
                "aura-v51-left-collapsed",
                "aura-v51-inspector-auto-hidden"
            );

            editor.style.pointerEvents = "";
            editor.style.overflow = "";
        }

        [
            "aura-v61-tools",
            "aura-v61-trigger",
            "aura-v61-focus",
            "aura-v61-left-toggle",
            "aura-v61-left-restore",
            "aura-workspace-v61-tools",
            "aura-workspace-v61-tools-trigger",
            "aura-workspace-v61-focus-button",
            "aura-workspace-v61-left-toggle",
            "aura-workspace-v61-left-restore"
        ].forEach(function (id) {
            document.getElementById(id)?.remove();
        });

        document
            .querySelectorAll(".aura-v61-original-hidden")
            .forEach(function (element) {
                element.classList.remove(
                    "aura-v61-original-hidden"
                );
            });

        document
            .querySelectorAll(
                ".aura-workspace-v61-original-hidden"
            )
            .forEach(function (element) {
                element.classList.remove(
                    "aura-workspace-v61-original-hidden"
                );
            });
    }

    function normalizeModalInteraction() {
        // O Lead Engine V5 é a única autoridade sobre o lifecycle do seu modal.
        // Mantê-lo fora deste recovery evita reativar um overlay fechado.
        document
            .querySelectorAll(
                "#lp-editor-modal, #lp-modal, " +
                "#aura-studio-library"
            )
            .forEach(function (modal) {
                const hidden =
                    modal.classList.contains("hidden") ||
                    modal.hidden === true;

                const desired = hidden ? "none" : "auto";
                // Mesma lógica do resetGlobalInteraction: só escreve se for
                // realmente mudar, senão o observer de mutação nunca sossega.
                if (modal.style.pointerEvents !== desired) {
                    modal.style.pointerEvents = desired;
                }
            });
    }

    function openNewLandingPage() {
        if (typeof window.abrirModalLP === "function") {
            window.abrirModalLP();
            return true;
        }

        const modal = document.getElementById("lp-modal");

        if (modal) {
            modal.classList.remove("hidden");
            modal.style.pointerEvents = "auto";

            window.setTimeout(function () {
                document
                    .getElementById("lp-titulo")
                    ?.focus();
            }, 80);

            return true;
        }

        return false;
    }

    function bindLandingPageButtons() {
        document
            .querySelectorAll(
                "button, a, [role='button']"
            )
            .forEach(function (button) {
                if (button.dataset.auraRecoveryBound === "true") {
                    return;
                }

                const text = normalizeText(button.textContent);
                const onclick = String(
                    button.getAttribute("onclick") || ""
                );

                const isNewLandingButton =
                    text === "nova landing page" ||
                    text === "criar landing page" ||
                    onclick.includes("abrirModalLP");

                if (!isNewLandingButton) {
                    return;
                }

                button.dataset.auraRecoveryBound = "true";
                button.style.pointerEvents = "auto";
                button.style.touchAction = "manipulation";

                button.addEventListener(
                    "click",
                    function (event) {
                        event.preventDefault();
                        event.stopPropagation();

                        openNewLandingPage();
                    },
                    true
                );
            });
    }

    function installClickFallback() {
        document.addEventListener(
            "click",
            function (event) {
                const target =
                    event.target instanceof Element
                        ? event.target.closest(
                            "button, a, [role='button']"
                        )
                        : null;

                if (!target) {
                    return;
                }

                const text = normalizeText(
                    target.textContent
                );

                if (
                    text === "nova landing page" ||
                    text === "criar landing page"
                ) {
                    event.preventDefault();
                    event.stopPropagation();

                    openNewLandingPage();
                }
            },
            true
        );
    }

    function observeInterface() {
        const observer = new MutationObserver(function () {
            resetGlobalInteraction();
            normalizeModalInteraction();
            bindLandingPageButtons();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: [
                "class",
                "hidden",
                "style"
            ]
        });
    }

    function initialize() {
        if (state.initialized) {
            return;
        }

        state.attempts += 1;

        if (
            !document.body ||
            typeof window.abrirModalLP !== "function"
        ) {
            if (state.attempts < 100) {
                window.setTimeout(initialize, 150);
            }

            return;
        }

        state.initialized = true;

        resetGlobalInteraction();
        removeBrokenWorkspaceState();
        normalizeModalInteraction();
        bindLandingPageButtons();
        installClickFallback();
        observeInterface();

        window.AuraMobileClickRecoveryV1 = {
            version: VERSION,

            reset: function () {
                resetGlobalInteraction();
                removeBrokenWorkspaceState();
                normalizeModalInteraction();
                bindLandingPageButtons();
            },

            openLandingPage: openNewLandingPage
        };

        console.info(
            "[Vide Aura Mobile Click Recovery V1] Inicializado"
        );
    }

    window.addEventListener("pageshow", function () {
        resetGlobalInteraction();
        removeBrokenWorkspaceState();
        normalizeModalInteraction();
        bindLandingPageButtons();
    });

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            initialize,
            { once: true }
        );
    } else {
        initialize();
    }
})();
