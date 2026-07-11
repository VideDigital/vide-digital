/**
 * Vide Aura - Workspace Clean V6.1
 * Organiza ferramentas sem remover funcoes.
 * Preparado para copia por TXT.
 */
(function () {
    "use strict";

    const VERSION = "6.1.0";
    const KEYS = {
        focus: "auraWorkspaceV61Focus",
        left: "auraWorkspaceV61Left"
    };

    const state = {
        ready: false,
        toolsOpen: false,
        focus: localStorage.getItem(KEYS.focus) === "true",
        leftCollapsed: localStorage.getItem(KEYS.left) === "true",
        originals: {},
        attempts: 0
    };

    function editor() {
        return document.getElementById("lp-editor-modal");
    }

    function bar() {
        return editor()?.querySelector(".aura-lped-topbar");
    }

    function panel() {
        return document.getElementById("lped-painel-lateral");
    }

    function node(tag, className, text) {
        const item = document.createElement(tag);
        if (className) item.className = className;
        if (text !== undefined) item.textContent = String(text);
        return item;
    }

    function save(key, value) {
        try {
            localStorage.setItem(key, String(value));
        } catch (error) {
            console.warn("[Aura Workspace Clean V6.1] Preferencia nao salva.", error);
        }
    }

    function findOriginals() {
        state.originals.canvas = document.getElementById("aura-v4-launcher");
        state.originals.ultimate = document.getElementById("aura-ultimate-launcher");
        state.originals.max = document.getElementById("aura-max-launcher");
    }

    function clickOriginal(name) {
        const button = state.originals[name];
        if (button instanceof HTMLElement) button.click();
        closeTools();
    }

    function openLibrary() {
        if (window.AuraLibraryCleanV53?.open) {
            window.AuraLibraryCleanV53.open();
        } else {
            window.AuraStudioPro?.openLibrary?.();
        }
        closeTools();
    }

    function openAudit() {
        if (window.AuraStudioPro?.openAudit) {
            window.AuraStudioPro.openAudit();
        } else {
            document.querySelector("[data-studio-left='audit']")?.click();
        }
        closeTools();
    }

    function openMedia() {
        if (window.AuraStudioMedia?.open) {
            window.AuraStudioMedia.open();
        } else {
            document.querySelector("[data-studio-left='media']")?.click();
        }
        closeTools();
    }

    function menuAction(label, description, action) {
        const button = node("button", "aura-v61-menu-action");
        button.type = "button";

        const copy = node("span", "aura-v61-menu-copy");
        copy.append(
            node("strong", "", label),
            node("small", "", description)
        );

        button.append(copy, node("span", "aura-v61-arrow", "âº"));
        button.addEventListener("click", action);
        return button;
    }

    function injectTools() {
        if (document.getElementById("aura-v61-tools")) return;

        findOriginals();
        const first =
            state.originals.canvas ||
            state.originals.ultimate ||
            state.originals.max;

        if (!first?.parentElement) return;

        const trigger = node("button", "aura-v61-trigger");
        trigger.id = "aura-v61-trigger";
        trigger.type = "button";
        trigger.setAttribute("aria-expanded", "false");
        trigger.append(
            node("span", "aura-v61-trigger-icon", "â"),
            node("span", "aura-v61-trigger-text", "Ferramentas")
        );

        const menu = node("section", "aura-v61-tools");
        menu.id = "aura-v61-tools";
        menu.hidden = true;

        const header = node("header", "aura-v61-menu-header");
        const title = node("div");
        title.append(
            node("small", "", "Vide Aura Studio"),
            node("h3", "", "Ferramentas avanÃ§adas"),
            node("p", "", "Todos os recursos continuam disponÃ­veis.")
        );

        const close = node("button", "aura-v61-close", "Ã");
        close.type = "button";
        close.addEventListener("click", closeTools);
        header.append(title, close);

        const body = node("div", "aura-v61-menu-body");
        body.append(
            menuAction("Canvas V4", "Layout e responsividade", function () {
                clickOriginal("canvas");
            }),
            menuAction("Studio Ultimate", "ComposiÃ§Ã£o avanÃ§ada", function () {
                clickOriginal("ultimate");
            }),
            menuAction("Studio MAX", "GeraÃ§Ã£o e versÃµes", function () {
                clickOriginal("max");
            }),
            menuAction("Biblioteca", "Modelos e pÃ¡ginas prontas", openLibrary),
            menuAction("MÃ­dia", "Imagens e arquivos", openMedia),
            menuAction("Auditoria", "SEO e qualidade", openAudit)
        );

        const footer = node("footer", "aura-v61-menu-footer");
        const focus = node("button", "aura-v61-footer-action", "Modo foco");
        focus.type = "button";
        focus.dataset.v61Footer = "focus";
        focus.addEventListener("click", function () {
            toggleFocus();
            closeTools();
        });

        const left = node("button", "aura-v61-footer-action", "Ocultar painel");
        left.type = "button";
        left.dataset.v61Footer = "left";
        left.addEventListener("click", function () {
            toggleLeft();
            closeTools();
        });

        footer.append(focus, left);
        menu.append(header, body, footer);

        first.parentElement.insertBefore(trigger, first);
        editor()?.append(menu);

        Object.values(state.originals).forEach(function (button) {
            button?.classList.add("aura-v61-original-hidden");
        });

        trigger.addEventListener("click", function (event) {
            event.stopPropagation();
            toggleTools();
        });
    }

    function injectPanelControls() {
        if (document.getElementById("aura-v61-left-toggle")) return;

        const side = panel();
        const header = side?.querySelector(":scope > .sticky") || side?.firstElementChild;
        if (!side || !header) return;

        const toggle = node("button", "aura-v61-left-toggle", "â¹");
        toggle.id = "aura-v61-left-toggle";
        toggle.type = "button";
        toggle.addEventListener("click", function () {
            toggleLeft();
        });
        header.append(toggle);

        const restore = node("button", "aura-v61-left-restore", "Componentes");
        restore.id = "aura-v61-left-restore";
        restore.type = "button";
        restore.addEventListener("click", function () {
            toggleLeft(false);
        });
        editor()?.append(restore);
    }

    function injectFocusButton() {
        if (document.getElementById("aura-v61-focus")) return;

        const library =
            bar()?.querySelector(".aura-studio-top-command") ||
            bar()?.lastElementChild;

        if (!library?.parentElement) return;

        const button = node("button", "aura-v61-focus", "Foco");
        button.id = "aura-v61-focus";
        button.type = "button";
        button.addEventListener("click", function () {
            toggleFocus();
        });

        library.parentElement.insertBefore(button, library);
    }

    function applyState() {
        const root = editor();
        if (!root) return;

        root.classList.toggle("aura-v61-focus-mode", state.focus);
        root.classList.toggle("aura-v61-left-collapsed", state.leftCollapsed);

        const focusButton = document.getElementById("aura-v61-focus");
        if (focusButton) {
            focusButton.classList.toggle("is-active", state.focus);
            focusButton.textContent = state.focus ? "Sair do foco" : "Foco";
        }

        const leftButton = document.getElementById("aura-v61-left-toggle");
        if (leftButton) {
            leftButton.textContent = state.leftCollapsed ? "âº" : "â¹";
        }

        const focusFooter = document.querySelector("[data-v61-footer='focus']");
        if (focusFooter) {
            focusFooter.textContent = state.focus ? "Sair do foco" : "Modo foco";
        }

        const leftFooter = document.querySelector("[data-v61-footer='left']");
        if (leftFooter) {
            leftFooter.textContent = state.leftCollapsed
                ? "Mostrar painel"
                : "Ocultar painel";
        }

        window.setTimeout(function () {
            window.AuraStudioPro?.fitCanvas?.();
            window.AuraStudioDeviceHotfix?.sync?.();
        }, 160);
    }

    function toggleFocus(force) {
        state.focus = typeof force === "boolean" ? force : !state.focus;
        save(KEYS.focus, state.focus);
        applyState();
    }

    function toggleLeft(force) {
        state.leftCollapsed =
            typeof force === "boolean" ? force : !state.leftCollapsed;
        save(KEYS.left, state.leftCollapsed);
        applyState();
    }

    function toggleTools() {
        const menu = document.getElementById("aura-v61-tools");
        const trigger = document.getElementById("aura-v61-trigger");
        if (!menu || !trigger) return;

        state.toolsOpen = !state.toolsOpen;
        menu.hidden = !state.toolsOpen;
        trigger.classList.toggle("is-active", state.toolsOpen);
        trigger.setAttribute(
            "aria-expanded",
            state.toolsOpen ? "true" : "false"
        );
    }

    function closeTools() {
        state.toolsOpen = false;
        const menu = document.getElementById("aura-v61-tools");
        const trigger = document.getElementById("aura-v61-trigger");
        if (menu) menu.hidden = true;
        trigger?.classList.remove("is-active");
        trigger?.setAttribute("aria-expanded", "false");
    }

    function bind() {
        document.addEventListener("pointerdown", function (event) {
            const target = event.target instanceof Element ? event.target : null;
            if (!target) return;

            if (
                !target.closest("#aura-v61-tools") &&
                !target.closest("#aura-v61-trigger")
            ) {
                closeTools();
            }
        });

        document.addEventListener("keydown", function (event) {
            const root = editor();
            if (!root || root.classList.contains("hidden")) return;

            const target = event.target;
            const typing =
                target instanceof HTMLElement &&
                (
                    target.isContentEditable ||
                    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
                );

            if (
                !typing &&
                event.shiftKey &&
                String(event.key || "").toLowerCase() === "f"
            ) {
                event.preventDefault();
                toggleFocus();
            }

            if (String(event.key || "") === "Escape") {
                if (state.toolsOpen) closeTools();
                else if (state.focus) toggleFocus(false);
            }
        });
    }

    function init() {
        if (state.ready) return;

        state.attempts += 1;
        findOriginals();

        if (
            !editor() ||
            !bar() ||
            !panel() ||
            !(
                state.originals.canvas ||
                state.originals.ultimate ||
                state.originals.max
            )
        ) {
            if (80 > state.attempts) {
                window.setTimeout(init, 180);
            }
            return;
        }

        state.ready = true;
        editor().classList.add("aura-workspace-clean-v61");

        injectTools();
        injectPanelControls();
        injectFocusButton();
        bind();
        applyState();

        window.AuraWorkspaceCleanV61 = {
            version: VERSION,
            toggleFocus: toggleFocus,
            toggleLeftPanel: toggleLeft,
            getState: function () {
                return {
                    focus: state.focus,
                    leftCollapsed: state.leftCollapsed,
                    toolsOpen: state.toolsOpen
                };
            }
        };

        console.info(
            "[Vide Aura Workspace Clean V6.1] Inicializado",
            {
                version: VERSION,
                focus: state.focus,
                leftCollapsed: state.leftCollapsed
            }
        );
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();