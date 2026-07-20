(function () {
    "use strict";

    const DEVICE_IDS = {
        desktop: "lped-btn-desktop",
        tablet: "aura-studio-btn-tablet",
        mobile: "lped-btn-mobile"
    };

    const DEVICE_WIDTHS = {
        desktop: 1200,
        tablet: 768,
        mobile: 390
    };

    let currentDevice =
        localStorage.getItem("auraStudioDevice") ||
        window.AuraStudioPro?.state?.device ||
        "desktop";

    function normalizeDevice(device) {
        return ["desktop", "tablet", "mobile"].includes(device)
            ? device
            : "desktop";
    }

    function getModal() {
        return document.getElementById("lp-editor-modal");
    }

    function updateButtons(device) {
        Object.entries(DEVICE_IDS).forEach(([name, id]) => {
            const button = document.getElementById(id);

            if (!button) {
                return;
            }

            const active = name === device;

            button.classList.remove(
                "bg-[#FF7A45]",
                "text-white",
                "aura-device-active"
            );

            button.classList.toggle(
                "text-gray-400",
                !active
            );

            button.classList.toggle(
                "hover:text-white",
                !active
            );

            if (active) {
                button.classList.remove(
                    "text-gray-400",
                    "hover:text-white"
                );

                button.classList.add(
                    "aura-device-active",
                    "bg-[#FF7A45]",
                    "text-white"
                );
            }

            button.setAttribute(
                "aria-pressed",
                active ? "true" : "false"
            );

            button.dataset.auraDevice =
                name;
        });
    }

    function updateFrame(device) {
        const frame =
            document.getElementById(
                "lped-browser-frame"
            );

        if (!frame) {
            return;
        }

        const width =
            DEVICE_WIDTHS[device];

        frame.classList.remove(
            "max-w-4xl",
            "max-w-[380px]"
        );

        frame.style.width =
            `${width}px`;

        frame.style.maxWidth =
            "none";

        frame.style.transformOrigin =
            "top center";

        frame.dataset.device =
            device;

        const size =
            document.getElementById(
                "aura-studio-canvas-size"
            );

        if (size) {
            size.textContent =
                `${width} × auto`;
        }
    }

    function finishDeviceChange(device) {
        updateButtons(device);
        updateFrame(device);

        requestAnimationFrame(() => {
            window.AuraStudioPro
                ?.fitCanvas?.();

            requestAnimationFrame(() => {
                updateButtons(device);
                updateFrame(device);
            });
        });
    }

    function setDevice(device) {
        const normalized =
            normalizeDevice(device);

        currentDevice =
            normalized;

        localStorage.setItem(
            "auraStudioDevice",
            normalized
        );

        if (
            window.AuraStudioPro &&
            typeof window.AuraStudioPro
                .setDevice === "function"
        ) {
            window.AuraStudioPro
                .setDevice(normalized);
        } else {
            updateFrame(normalized);
        }

        finishDeviceChange(normalized);
    }

    function identifyDevice(button) {
        if (!button) {
            return null;
        }

        if (
            button.id ===
            DEVICE_IDS.desktop
        ) {
            return "desktop";
        }

        if (
            button.id ===
            DEVICE_IDS.tablet
        ) {
            return "tablet";
        }

        if (
            button.id ===
            DEVICE_IDS.mobile
        ) {
            return "mobile";
        }

        return null;
    }

    function handleDeviceClick(event) {
        if (
            !(event.target instanceof Element)
        ) {
            return;
        }

        const button =
            event.target.closest(
                "#lped-btn-desktop, " +
                "#aura-studio-btn-tablet, " +
                "#lped-btn-mobile"
            );

        if (!button) {
            return;
        }

        const modal =
            getModal();

        if (
            !modal ||
            modal.classList.contains(
                "hidden"
            )
        ) {
            return;
        }

        const device =
            identifyDevice(button);

        if (!device) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        setDevice(device);
    }

    function syncCurrentDevice() {
        currentDevice =
            normalizeDevice(
                localStorage.getItem(
                    "auraStudioDevice"
                ) ||
                window.AuraStudioPro
                    ?.state?.device ||
                currentDevice
            );

        finishDeviceChange(
            currentDevice
        );
    }

    function watchEditor() {
        const modal =
            getModal();

        if (!modal) {
            setTimeout(
                watchEditor,
                150
            );

            return;
        }

        let syncTimer = null;

        const observer =
            new MutationObserver(() => {
                if (
                    !modal.classList
                        .contains("hidden")
                ) {
                    // Debounce: sem isso, cada mutação (inclusive as causadas
                    // pelo próprio syncCurrentDevice) empilhava um novo timer,
                    // criando um loop que nunca sossegava.
                    clearTimeout(syncTimer);
                    syncTimer = setTimeout(
                        syncCurrentDevice,
                        120
                    );
                }
            });

        observer.observe(
            modal,
            {
                attributes: true,
                attributeFilter: ["class"],
                childList: true,
                subtree: true
            }
        );

        syncCurrentDevice();
    }

    document.addEventListener(
        "click",
        handleDeviceClick,
        true
    );

    window.addEventListener(
        "resize",
        () => {
            const modal =
                getModal();

            if (
                modal &&
                !modal.classList
                    .contains("hidden")
            ) {
                finishDeviceChange(
                    currentDevice
                );
            }
        }
    );

    window.AuraStudioDeviceHotfix = {
        setDevice,
        sync: syncCurrentDevice,
        getCurrentDevice: () =>
            currentDevice
    };

    if (
        document.readyState ===
        "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            watchEditor,
            {
                once: true
            }
        );
    } else {
        watchEditor();
    }

    console.info(
        "[Vide Aura Studio] Device switch hotfix ativo"
    );
})();
