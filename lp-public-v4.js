/**
 * Vide Aura — Renderer Público V4
 * Renderização pública responsiva para Landing Pages criadas no Canvas V4.
 * Versão 4.0.0
 */
(() => {
    "use strict";

    const VERSION = "4.0.0";
    const FIREBASE_VERSION = "10.12.2";
    const DEVICE_BREAKPOINTS = Object.freeze({
        mobile: 640,
        desktop: 1024
    });
    const FREE_STAGE_WIDTHS = Object.freeze({
        desktop: 1440,
        tablet: 768,
        mobile: 390
    });
    const ALLOWED_BLOCK_TYPES = new Set([
        "texto_midia",
        "formulario_captura",
        "faq",
        "galeria_imagens",
        "lista_cards",
        "tabela_comparativo",
        "texto_rico",
        "codigo_iframe",
        "carrossel_banners",
        "carrossel_produtos",
        "carrossel_cards",
        "navegacao",
        "rodape",
        "seletor_cores",
        "breadcrumb",
        "forma"
    ]);

    const state = {
        base: normalizeBase(window.AURA_LP_V4_BASE || detectBase()),
        route: null,
        db: null,
        auth: null,
        firestore: null,
        authModule: null,
        meta: null,
        blocks: [],
        products: new Map(),
        pageIndex: 0,
        device: getDevice(),
        preview: false,
        ready: false,
        rendering: false,
        renderQueued: false,
        containerObserver: null,
        resizeTimer: null
    };

    function normalizeBase(value) {
        const base = String(value || "/").trim() || "/";
        return `${base.startsWith("/") ? base : `/${base}`}${base.endsWith("/") ? "" : "/"}`;
    }

    function detectBase() {
        if (window.location.hostname === "videdigital.github.io") {
            return "/vide-digital/";
        }

        const marker = "/vide-digital/";
        if (window.location.pathname.startsWith(marker)) {
            return marker;
        }

        return "/";
    }

    function getDevice() {
        const width = Math.max(
            document.documentElement.clientWidth || 0,
            window.innerWidth || 0
        );

        if (width < DEVICE_BREAKPOINTS.mobile) {
            return "mobile";
        }

        if (width < DEVICE_BREAKPOINTS.desktop) {
            return "tablet";
        }

        return "desktop";
    }

    function parseRoute() {
        const path = decodeURIComponent(window.location.pathname || "/");
        let clean = path;

        if (clean.startsWith(state.base)) {
            clean = clean.slice(state.base.length);
        } else {
            clean = clean.replace(/^\/+/, "");
        }

        const parts = clean
            .split("/")
            .map((part) => part.trim())
            .filter(Boolean)
            .filter((part) => part.toLowerCase() !== "index.html");

        if (parts.length < 2) {
            return null;
        }

        return {
            lojaSlug: sanitizeSlug(parts[0]),
            paginaSlug: sanitizeSlug(parts[1])
        };
    }

    function sanitizeSlug(value) {
        return String(value || "")
            .trim()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9_-]/g, "");
    }

    function escapeHTML(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function escapeAttribute(value) {
        return escapeHTML(value).replace(/`/g, "&#096;");
    }

    function safeURL(value, options = {}) {
        const raw = String(value || "").trim();

        if (!raw) {
            return options.fallback || "#";
        }

        if (raw.startsWith("#")) {
            return raw.replace(/[^\w\-#:.]/g, "");
        }

        if (raw.startsWith("/") && !raw.startsWith("//")) {
            return raw;
        }

        try {
            const url = new URL(raw, window.location.origin);
            const allowed = new Set([
                "http:",
                "https:",
                "mailto:",
                "tel:"
            ]);

            if (allowed.has(url.protocol)) {
                return url.href;
            }
        } catch (error) {
            console.warn("[Renderer V4] Link ignorado:", raw);
        }

        return options.fallback || "#";
    }

    function safeImage(value) {
        const raw = String(value || "").trim();

        if (!raw) {
            return "";
        }

        if (/^data:image\/(?:png|jpe?g|webp|gif|svg\+xml);/i.test(raw)) {
            return raw;
        }

        if (raw.startsWith("blob:")) {
            return raw;
        }

        try {
            const url = new URL(raw, window.location.origin);
            if (url.protocol === "http:" || url.protocol === "https:") {
                return url.href;
            }
        } catch (error) {
            console.warn("[Renderer V4] Imagem ignorada.");
        }

        return "";
    }

    function sanitizeRichHTML(value) {
        const source = String(value || "");

        if (!source.trim()) {
            return "";
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(`<div>${source}</div>`, "text/html");
        const root = doc.body.firstElementChild;
        const allowedTags = new Set([
            "A", "ABBR", "B", "BLOCKQUOTE", "BR", "CODE", "DIV", "EM",
            "H1", "H2", "H3", "H4", "H5", "H6", "HR", "I", "LI",
            "OL", "P", "PRE", "SMALL", "SPAN", "STRONG", "SUB", "SUP", "U", "UL"
        ]);
        const allowedAttrs = new Set(["href", "target", "rel", "title", "aria-label"]);

        for (const element of Array.from(root.querySelectorAll("*"))) {
            if (!allowedTags.has(element.tagName)) {
                element.replaceWith(...Array.from(element.childNodes));
                continue;
            }

            for (const attribute of Array.from(element.attributes)) {
                if (!allowedAttrs.has(attribute.name.toLowerCase())) {
                    element.removeAttribute(attribute.name);
                }
            }

            if (element.tagName === "A") {
                element.setAttribute("href", safeURL(element.getAttribute("href")));
                element.setAttribute("rel", "noopener noreferrer");
                if (element.getAttribute("target") === "_blank") {
                    element.setAttribute("target", "_blank");
                } else {
                    element.removeAttribute("target");
                }
            }
        }

        return root.innerHTML;
    }

    function deepMerge(base, override) {
        const output = Array.isArray(base)
            ? [...base]
            : { ...(base && typeof base === "object" ? base : {}) };

        if (!override || typeof override !== "object") {
            return output;
        }

        for (const [key, value] of Object.entries(override)) {
            if (
                value &&
                typeof value === "object" &&
                !Array.isArray(value) &&
                output[key] &&
                typeof output[key] === "object" &&
                !Array.isArray(output[key])
            ) {
                output[key] = deepMerge(output[key], value);
            } else if (value !== undefined) {
                output[key] = value;
            }
        }

        return output;
    }

    function resolveResponsiveState(block, device = state.device) {
        const design = block?.design || {};
        const responsive = design.responsiveV4 || {};

        const desktop = deepMerge({}, responsive.desktop || {});
        const tablet = deepMerge(desktop, responsive.tablet || {});
        const mobile = deepMerge(tablet, responsive.mobile || {});
        const selected = device === "mobile"
            ? mobile
            : device === "tablet"
                ? tablet
                : desktop;

        return {
            geometry: {
                x: numberOr(selected?.geometry?.x, block?.x, 0),
                y: numberOr(selected?.geometry?.y, block?.y, 0),
                largura: numberOr(selected?.geometry?.largura, block?.largura, 600),
                altura: numberOr(selected?.geometry?.altura, block?.altura, 240),
                zIndex: numberOr(selected?.geometry?.zIndex, block?.zIndex, 1)
            },
            design: deepMerge(design, selected.design || {}),
            v4: deepMerge(design.v4 || {}, selected.v4 || {}),
            props: deepMerge(block?.props || {}, selected.props || {})
        };
    }

    function numberOr(...values) {
        for (const value of values) {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }

        return 0;
    }

    function px(value, fallback = 0) {
        if (value === null || value === undefined || value === "") {
            return `${fallback}px`;
        }

        if (typeof value === "string" && /(?:px|rem|em|%|vh|vw|clamp|calc)\b/i.test(value)) {
            return value;
        }

        const numeric = Number(value);
        return `${Number.isFinite(numeric) ? numeric : fallback}px`;
    }

    function radiusValue(value) {
        const map = {
            none: "0px",
            sm: "8px",
            md: "14px",
            lg: "22px",
            xl: "32px",
            full: "999px"
        };

        return map[String(value || "").toLowerCase()] || px(value, 18);
    }

    function shadowValue(value) {
        const map = {
            none: "none",
            leve: "0 10px 30px rgba(15, 23, 42, .08)",
            media: "0 18px 48px rgba(15, 23, 42, .14)",
            forte: "0 28px 80px rgba(15, 23, 42, .22)",
            soft: "0 10px 30px rgba(15, 23, 42, .08)",
            medium: "0 18px 48px rgba(15, 23, 42, .14)",
            strong: "0 28px 80px rgba(15, 23, 42, .22)"
        };

        const normalized = String(value || "").toLowerCase();
        if (map[normalized]) {
            return map[normalized];
        }

        if (normalized.includes("rgba") || normalized.includes("rgb") || normalized.includes("#")) {
            return String(value);
        }

        return "none";
    }

    function isBlockVisible(block, responsive) {
        if (block?.visivel === false) {
            return false;
        }

        const design = responsive.design || {};

        if (state.device === "desktop" && design.visivelDesktop === false) {
            return false;
        }

        if (state.device === "tablet" && design.visivelTablet === false) {
            return false;
        }

        if (state.device === "mobile" && design.visivelMobile === false) {
            return false;
        }

        return true;
    }

    function getPageInfo() {
        const pages = Array.isArray(state.meta?.paginas)
            ? state.meta.paginas
            : [];
        const params = new URLSearchParams(window.location.search);
        const requested = Number(params.get("page"));

        state.pageIndex = Number.isFinite(requested) && requested > 0
            ? Math.min(requested - 1, Math.max(0, pages.length - 1))
            : 0;

        const page = pages[state.pageIndex] || pages[0] || null;
        const pageId = page?.id || page?.paginaId || page?.uid || null;

        return {
            pages,
            page,
            pageId
        };
    }

    function sortAndFilterBlocks() {
        const { pageId } = getPageInfo();
        let blocks = state.blocks.filter((block) => ALLOWED_BLOCK_TYPES.has(block.tipo));

        if (pageId) {
            const samePage = blocks.filter((block) => {
                const blockPage = block.paginaId || block.pageId || block.pagina;
                return !blockPage || blockPage === pageId;
            });

            if (samePage.length) {
                blocks = samePage;
            }
        }

        const order = Array.isArray(state.meta?.ordemBlocos)
            ? state.meta.ordemBlocos
            : [];
        const orderMap = new Map(order.map((id, index) => [String(id), index]));

        return [...blocks].sort((a, b) => {
            const orderA = orderMap.has(String(a.id))
                ? orderMap.get(String(a.id))
                : Number.MAX_SAFE_INTEGER;
            const orderB = orderMap.has(String(b.id))
                ? orderMap.get(String(b.id))
                : Number.MAX_SAFE_INTEGER;

            if (orderA !== orderB) {
                return orderA - orderB;
            }

            return numberOr(a.ordem, a.zIndex, 0) - numberOr(b.ordem, b.zIndex, 0);
        });
    }

    function getBlockStyle(block, responsive, mode) {
        const design = responsive.design || {};
        const geometry = responsive.geometry || {};
        const v4 = responsive.v4 || {};
        const styles = [];

        if (design.corFundo) {
            styles.push(`--aura-block-bg:${escapeAttribute(design.corFundo)}`);
        }

        if (design.corTexto) {
            styles.push(`--aura-block-text:${escapeAttribute(design.corTexto)}`);
        }

        if (design.corBotaoFundo) {
            styles.push(`--aura-button-bg:${escapeAttribute(design.corBotaoFundo)}`);
        }

        if (design.corBotaoTexto) {
            styles.push(`--aura-button-text:${escapeAttribute(design.corBotaoTexto)}`);
        }

        if (design.corBotaoBorda) {
            styles.push(`--aura-button-border:${escapeAttribute(design.corBotaoBorda)}`);
        }

        styles.push(`--aura-padding-top:${px(design.paddingTop, 48)}`);
        styles.push(`--aura-padding-bottom:${px(design.paddingBottom, 48)}`);
        styles.push(`--aura-radius:${radiusValue(design.raio)}`);
        styles.push(`--aura-shadow:${shadowValue(design.sombra)}`);
        styles.push(`--aura-opacity:${Math.max(0, Math.min(1, numberOr(design.v4Opacity, 1)))}`);
        styles.push(`--aura-rotation:${numberOr(design.v4Rotation, 0)}deg`);
        styles.push(`--aura-auto-gap:${px(design?.v4AutoLayout?.gap, 16)}`);
        styles.push(`--aura-auto-padding:${px(design?.v4AutoLayout?.padding, 0)}`);
        styles.push(`--aura-auto-columns:${Math.max(1, numberOr(design?.v4AutoLayout?.columns, 3))}`);
        styles.push(`--aura-image-width:${Math.max(10, Math.min(100, numberOr(responsive.props?.imagemLargura, 48)))}%`);

        if (mode === "livre") {
            styles.push(`left:${px(geometry.x)}`);
            styles.push(`top:${px(geometry.y)}`);
            styles.push(`width:${px(Math.max(40, geometry.largura), 600)}`);
            styles.push(`min-height:${px(Math.max(24, geometry.altura), 160)}`);
            styles.push(`z-index:${Math.round(geometry.zIndex)}`);
        }

        return styles.join(";");
    }

    function getAnimationAttributes(block, responsive, index) {
        const design = responsive.design || {};
        const animation = String(
            design.animacao ||
            design.animation ||
            design.v4Animation ||
            ""
        ).toLowerCase();
        const allowed = new Set(["fade", "subir", "esquerda", "direita", "zoom"]);
        const normalized = allowed.has(animation) ? animation : "";
        const duration = Math.max(
            150,
            Math.min(3000, numberOr(
                design.duracaoAnimacao,
                design.animationDuration,
                600
            ))
        );
        const delay = Math.max(
            0,
            Math.min(3000, numberOr(
                design.atrasoAnimacao,
                design.animationDelay,
                index * 40
            ))
        );

        return normalized
            ? `data-aura-animation="${normalized}" data-aura-duration="${duration}" data-aura-delay="${delay}"`
            : "";
    }

    function sectionClasses(block, responsive, mode) {
        const classes = [
            "aura-v4-block",
            `aura-v4-type-${block.tipo}`,
            mode === "livre" ? "aura-v4-free-block" : "aura-v4-stacked-block"
        ];
        const align = String(responsive.design?.alinhamento || "").toLowerCase();
        const imagePosition = String(responsive.props?.posicaoImagem || "").toLowerCase();
        const autoMode = String(responsive.design?.v4AutoLayout?.mode || "").toLowerCase();

        if (["left", "esquerda"].includes(align)) {
            classes.push("aura-align-left");
        } else if (["right", "direita"].includes(align)) {
            classes.push("aura-align-right");
        } else {
            classes.push("aura-align-center");
        }

        if (imagePosition) {
            classes.push(`aura-image-${imagePosition.replace(/[^a-z0-9_-]/g, "")}`);
        }

        if (["vertical", "horizontal", "grid"].includes(autoMode)) {
            classes.push(`aura-auto-${autoMode}`);
        }

        if (responsive.design?.v4Locked) {
            classes.push("aura-v4-locked");
        }

        return classes.join(" ");
    }

    function renderBlock(block, mode, index) {
        const responsive = resolveResponsiveState(block);

        if (!isBlockVisible(block, responsive)) {
            return "";
        }

        const props = responsive.props || {};
        const classes = sectionClasses(block, responsive, mode);
        const style = getBlockStyle(block, responsive, mode);
        const animation = getAnimationAttributes(block, responsive, index);
        const groupId = escapeAttribute(responsive.design?.v4GroupId || "");
        const componentId = escapeAttribute(responsive.design?.v4Component || "");
        const content = renderBlockContent(block, props, responsive);

        return `
            <section
                id="aura-block-${escapeAttribute(block.id)}"
                class="${classes}"
                data-aura-block-id="${escapeAttribute(block.id)}"
                data-aura-block-type="${escapeAttribute(block.tipo)}"
                data-aura-group-id="${groupId}"
                data-aura-component="${componentId}"
                style="${style}"
                ${animation}
            >
                <div class="aura-v4-block-surface">
                    ${content}
                </div>
            </section>
        `;
    }

    function renderBlockContent(block, props, responsive) {
        switch (block.tipo) {
            case "texto_midia":
                return renderTextMedia(props);
            case "formulario_captura":
                return renderForm(block, props);
            case "faq":
                return renderFAQ(props);
            case "galeria_imagens":
                return renderGallery(props);
            case "lista_cards":
                return renderCardList(props);
            case "tabela_comparativo":
                return renderComparison(props);
            case "texto_rico":
                return renderRichText(props);
            case "codigo_iframe":
                return renderIframe(props);
            case "carrossel_banners":
                return renderBannerCarousel(props);
            case "carrossel_produtos":
                return renderProductCarousel(props);
            case "carrossel_cards":
                return renderCardCarousel(props);
            case "navegacao":
                return renderNavigation(props);
            case "rodape":
                return renderFooter(props);
            case "seletor_cores":
                return renderColorSelector(props);
            case "breadcrumb":
                return renderBreadcrumb(props);
            case "forma":
                return renderShape(props, responsive);
            default:
                return "";
        }
    }

    function renderTextMedia(props) {
        const image = safeImage(props.imagemB64 || props.imagem || props.image);
        const title = escapeHTML(props.titulo || "");
        const subtitle = escapeHTML(props.subtitulo || props.texto || "");
        const buttonText = escapeHTML(props.botaoTexto || "");
        const buttonLink = safeURL(props.botaoLink || "#");

        return `
            <div class="aura-section-container aura-text-media">
                <div class="aura-text-media-copy">
                    ${title ? `<h1 class="aura-display-title">${title}</h1>` : ""}
                    ${subtitle ? `<p class="aura-lead">${subtitle}</p>` : ""}
                    ${buttonText ? `
                        <a class="aura-primary-button" href="${escapeAttribute(buttonLink)}">
                            ${buttonText}
                        </a>
                    ` : ""}
                </div>
                ${image ? `
                    <figure class="aura-text-media-visual">
                        <img
                            src="${escapeAttribute(image)}"
                            alt="${escapeAttribute(props.imagemAlt || props.titulo || "Imagem da seção")}"
                            loading="${props.priorizarImagem ? "eager" : "lazy"}"
                            decoding="async"
                        >
                    </figure>
                ` : ""}
            </div>
        `;
    }

    function renderForm(block, props) {
        const fields = Array.isArray(props.campos) && props.campos.length
            ? props.campos
            : ["nome", "whatsapp", "email"];
        const normalizedFields = fields.map((field) => {
            if (typeof field === "string") {
                return { id: field, label: field };
            }

            return {
                id: field.id || field.nome || field.tipo || "campo",
                label: field.label || field.nome || field.tipo || "Campo",
                required: field.required !== false
            };
        });

        const fieldsHTML = normalizedFields.map((field) => {
            const id = String(field.id || "").toLowerCase();
            const type = id.includes("email")
                ? "email"
                : id.includes("telefone") || id.includes("whatsapp")
                    ? "tel"
                    : "text";
            const autocomplete = id.includes("nome")
                ? "name"
                : id.includes("email")
                    ? "email"
                    : id.includes("whatsapp") || id.includes("telefone")
                        ? "tel"
                        : "off";

            return `
                <label class="aura-field">
                    <span>${escapeHTML(formatFieldLabel(field.label || id))}</span>
                    <input
                        type="${type}"
                        name="${escapeAttribute(id)}"
                        autocomplete="${autocomplete}"
                        ${field.required === false ? "" : "required"}
                        ${type === "tel" ? 'inputmode="tel" data-aura-phone' : ""}
                    >
                </label>
            `;
        }).join("");

        return `
            <div class="aura-section-container aura-form-layout">
                <div class="aura-form-copy">
                    <span class="aura-eyebrow">Contato</span>
                    <h2>${escapeHTML(props.titulo || "Fale com nossa equipe")}</h2>
                    ${props.subtitulo ? `<p>${escapeHTML(props.subtitulo)}</p>` : ""}
                </div>
                <form
                    class="aura-lead-form"
                    data-aura-lead-form
                    data-block-id="${escapeAttribute(block.id)}"
                    novalidate
                >
                    ${fieldsHTML}
                    <button class="aura-primary-button aura-form-submit" type="submit">
                        <span>${escapeHTML(props.textoBotao || "Enviar")}</span>
                    </button>
                    <p class="aura-form-status" role="status" aria-live="polite"></p>
                </form>
            </div>
        `;
    }

    function formatFieldLabel(value) {
        const normalized = String(value || "").replace(/[_-]+/g, " ").trim();
        return normalized
            ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
            : "Campo";
    }

    function renderFAQ(props) {
        const items = Array.isArray(props.itens) ? props.itens : [];

        return `
            <div class="aura-section-container aura-faq">
                <div class="aura-section-heading">
                    <span class="aura-eyebrow">Dúvidas frequentes</span>
                    <h2>${escapeHTML(props.titulo || "Perguntas e respostas")}</h2>
                </div>
                <div class="aura-faq-list">
                    ${items.map((item, index) => `
                        <details class="aura-faq-item" ${index === 0 ? "open" : ""}>
                            <summary>
                                <span>${escapeHTML(item.pergunta || `Pergunta ${index + 1}`)}</span>
                                <span class="aura-faq-marker" aria-hidden="true"></span>
                            </summary>
                            <div class="aura-faq-answer">
                                ${sanitizeRichHTML(item.resposta || "")}
                            </div>
                        </details>
                    `).join("")}
                </div>
            </div>
        `;
    }

    function renderGallery(props) {
        const images = Array.isArray(props.imagens) ? props.imagens : [];

        return `
            <div class="aura-section-container">
                ${props.titulo ? `
                    <div class="aura-section-heading">
                        <h2>${escapeHTML(props.titulo)}</h2>
                    </div>
                ` : ""}
                <div class="aura-gallery-grid">
                    ${images.map((item, index) => {
                        const source = safeImage(
                            typeof item === "string"
                                ? item
                                : item.imagemB64 || item.url || item.src
                        );
                        const alt = typeof item === "object"
                            ? item.alt || item.titulo || props.titulo
                            : props.titulo;

                        return source ? `
                            <figure class="aura-gallery-item">
                                <img
                                    src="${escapeAttribute(source)}"
                                    alt="${escapeAttribute(alt || `Imagem ${index + 1}`)}"
                                    loading="lazy"
                                    decoding="async"
                                >
                            </figure>
                        ` : "";
                    }).join("")}
                </div>
            </div>
        `;
    }

    function renderCardList(props) {
        const cards = Array.isArray(props.cards) ? props.cards : [];

        return `
            <div class="aura-section-container">
                ${props.titulo ? `
                    <div class="aura-section-heading">
                        <h2>${escapeHTML(props.titulo)}</h2>
                    </div>
                ` : ""}
                <div class="aura-card-grid">
                    ${cards.map((card) => {
                        const image = safeImage(card.imagemB64 || card.imagem || card.image);

                        return `
                            <article class="aura-content-card">
                                ${image ? `
                                    <img
                                        class="aura-content-card-image"
                                        src="${escapeAttribute(image)}"
                                        alt="${escapeAttribute(card.imagemAlt || card.titulo || "Imagem do card")}"
                                        loading="lazy"
                                        decoding="async"
                                    >
                                ` : ""}
                                <div class="aura-content-card-body">
                                    ${card.icone ? `<span class="aura-card-icon" aria-hidden="true">${escapeHTML(card.icone)}</span>` : ""}
                                    ${card.titulo ? `<h3>${escapeHTML(card.titulo)}</h3>` : ""}
                                    ${card.texto ? `<p>${escapeHTML(card.texto)}</p>` : ""}
                                    ${card.botaoTexto ? `
                                        <a class="aura-text-link" href="${escapeAttribute(safeURL(card.botaoLink || "#"))}">
                                            ${escapeHTML(card.botaoTexto)}
                                        </a>
                                    ` : ""}
                                </div>
                            </article>
                        `;
                    }).join("")}
                </div>
            </div>
        `;
    }

    function renderComparison(props) {
        const rows = Array.isArray(props.linhas) ? props.linhas : [];

        return `
            <div class="aura-section-container">
                ${props.titulo ? `
                    <div class="aura-section-heading">
                        <h2>${escapeHTML(props.titulo)}</h2>
                    </div>
                ` : ""}
                <div class="aura-table-scroll">
                    <table class="aura-comparison-table">
                        <thead>
                            <tr>
                                <th scope="col">Comparativo</th>
                                <th scope="col">${escapeHTML(props.coluna1 || "Opção 1")}</th>
                                <th scope="col">${escapeHTML(props.coluna2 || "Opção 2")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows.map((row) => `
                                <tr>
                                    <th scope="row">${escapeHTML(row.label || "")}</th>
                                    <td>${escapeHTML(row.valor1 || "")}</td>
                                    <td>${escapeHTML(row.valor2 || "")}</td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    function renderRichText(props) {
        return `
            <div class="aura-section-container aura-rich-text">
                ${props.titulo ? `<h2>${escapeHTML(props.titulo)}</h2>` : ""}
                <div class="aura-prose">${sanitizeRichHTML(props.conteudo || props.texto || "")}</div>
            </div>
        `;
    }

    function renderIframe(props) {
        const url = safeURL(props.url || "", { fallback: "" });
        const height = Math.max(180, Math.min(1600, numberOr(props.altura, 500)));
        const customHTML = String(props.htmlCustom || "").trim();

        if (url) {
            return `
                <div class="aura-section-container">
                    <div class="aura-embed-shell" style="--aura-embed-height:${height}px">
                        <iframe
                            src="${escapeAttribute(url)}"
                            title="${escapeAttribute(props.titulo || "Conteúdo incorporado")}"
                            loading="lazy"
                            sandbox="allow-forms allow-popups allow-presentation allow-scripts"
                            referrerpolicy="strict-origin-when-cross-origin"
                        ></iframe>
                    </div>
                </div>
            `;
        }

        if (customHTML) {
            return `
                <div class="aura-section-container">
                    <div class="aura-embed-shell" style="--aura-embed-height:${height}px">
                        <iframe
                            srcdoc="${escapeAttribute(customHTML)}"
                            title="${escapeAttribute(props.titulo || "Conteúdo incorporado")}"
                            loading="lazy"
                            sandbox=""
                        ></iframe>
                    </div>
                </div>
            `;
        }

        return "";
    }

    function renderBannerCarousel(props) {
        const banners = Array.isArray(props.banners) ? props.banners : [];

        return `
            <div class="aura-section-container aura-carousel" data-aura-carousel>
                <div class="aura-carousel-track">
                    ${banners.map((banner, index) => {
                        const image = safeImage(
                            typeof banner === "string"
                                ? banner
                                : banner.imagemB64 || banner.imagem || banner.url
                        );
                        const link = typeof banner === "object"
                            ? safeURL(banner.link || "#")
                            : "#";

                        return image ? `
                            <a class="aura-banner-slide" href="${escapeAttribute(link)}">
                                <img
                                    src="${escapeAttribute(image)}"
                                    alt="${escapeAttribute(banner.alt || banner.titulo || `Banner ${index + 1}`)}"
                                    loading="${index === 0 ? "eager" : "lazy"}"
                                    decoding="async"
                                >
                            </a>
                        ` : "";
                    }).join("")}
                </div>
                ${renderCarouselControls()}
            </div>
        `;
    }

    function renderProductCarousel(props) {
        const ids = Array.isArray(props.produtosIds) ? props.produtosIds : [];
        const products = ids
            .map((id) => state.products.get(String(id)))
            .filter(Boolean);

        return `
            <div class="aura-section-container aura-carousel" data-aura-carousel>
                ${props.titulo ? `
                    <div class="aura-section-heading aura-section-heading-row">
                        <h2>${escapeHTML(props.titulo)}</h2>
                        ${renderCarouselControls(true)}
                    </div>
                ` : ""}
                <div class="aura-carousel-track aura-product-track">
                    ${products.map((product) => renderProductCard(product)).join("")}
                </div>
                ${props.titulo ? "" : renderCarouselControls()}
            </div>
        `;
    }

    function renderProductCard(product) {
        const image = safeImage(
            product.imagemB64 ||
            product.imagem ||
            product.image ||
            product.foto
        );
        const price = formatCurrency(product.preco || product.valor || 0);
        const link = safeURL(product.link || product.url || "#");

        return `
            <article class="aura-product-card">
                ${image ? `
                    <img
                        src="${escapeAttribute(image)}"
                        alt="${escapeAttribute(product.nome || product.titulo || "Produto")}"
                        loading="lazy"
                        decoding="async"
                    >
                ` : ""}
                <div class="aura-product-card-body">
                    <h3>${escapeHTML(product.nome || product.titulo || "Produto")}</h3>
                    ${product.descricao ? `<p>${escapeHTML(product.descricao)}</p>` : ""}
                    <div class="aura-product-card-footer">
                        <strong>${escapeHTML(price)}</strong>
                        <a class="aura-primary-button aura-button-small" href="${escapeAttribute(link)}">
                            Ver produto
                        </a>
                    </div>
                </div>
            </article>
        `;
    }

    function formatCurrency(value) {
        const number = Number(String(value).replace(",", "."));
        if (!Number.isFinite(number)) {
            return String(value || "");
        }

        return new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL"
        }).format(number);
    }

    function renderCardCarousel(props) {
        const cards = Array.isArray(props.cards) ? props.cards : [];

        return `
            <div class="aura-section-container aura-carousel" data-aura-carousel>
                ${props.titulo ? `
                    <div class="aura-section-heading aura-section-heading-row">
                        <h2>${escapeHTML(props.titulo)}</h2>
                        ${renderCarouselControls(true)}
                    </div>
                ` : ""}
                <div class="aura-carousel-track aura-card-track">
                    ${cards.map((card) => {
                        const image = safeImage(card.imagemB64 || card.imagem || card.image);

                        return `
                            <article class="aura-content-card aura-carousel-card">
                                ${image ? `
                                    <img
                                        class="aura-content-card-image"
                                        src="${escapeAttribute(image)}"
                                        alt="${escapeAttribute(card.imagemAlt || card.titulo || "Imagem do card")}"
                                        loading="lazy"
                                        decoding="async"
                                    >
                                ` : ""}
                                <div class="aura-content-card-body">
                                    ${card.titulo ? `<h3>${escapeHTML(card.titulo)}</h3>` : ""}
                                    ${card.texto ? `<p>${escapeHTML(card.texto)}</p>` : ""}
                                </div>
                            </article>
                        `;
                    }).join("")}
                </div>
                ${props.titulo ? "" : renderCarouselControls()}
            </div>
        `;
    }

    function renderCarouselControls(compact = false) {
        return `
            <div class="aura-carousel-controls ${compact ? "aura-carousel-controls-compact" : ""}">
                <button type="button" data-aura-carousel-prev aria-label="Voltar">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M15 18l-6-6 6-6"></path>
                    </svg>
                </button>
                <button type="button" data-aura-carousel-next aria-label="Avançar">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M9 18l6-6-6-6"></path>
                    </svg>
                </button>
            </div>
        `;
    }

    function renderNavigation(props) {
        const links = Array.isArray(props.links) ? props.links : [];

        return `
            <nav class="aura-public-nav" aria-label="Navegação principal">
                <div class="aura-section-container aura-public-nav-inner">
                    <a class="aura-public-brand" href="${escapeAttribute(safeURL(props.logoLink || "#"))}">
                        ${escapeHTML(props.logoTexto || state.meta?.titulo || "Marca")}
                    </a>
                    <button
                        type="button"
                        class="aura-nav-toggle"
                        data-aura-nav-toggle
                        aria-expanded="false"
                        aria-label="Abrir menu"
                    >
                        <span></span><span></span><span></span>
                    </button>
                    <div class="aura-public-nav-links" data-aura-nav-links>
                        ${links.map((link) => `
                            <a href="${escapeAttribute(safeURL(link.href || link.link || "#"))}">
                                ${escapeHTML(link.label || link.texto || "Link")}
                            </a>
                        `).join("")}
                    </div>
                </div>
            </nav>
        `;
    }

    function renderFooter(props) {
        const links = Array.isArray(props.links) ? props.links : [];

        return `
            <footer class="aura-public-footer">
                <div class="aura-section-container aura-public-footer-inner">
                    <p>${escapeHTML(props.textoCopyright || `© ${new Date().getFullYear()} Todos os direitos reservados.`)}</p>
                    <nav aria-label="Links do rodapé">
                        ${links.map((link) => `
                            <a href="${escapeAttribute(safeURL(link.href || link.link || "#"))}">
                                ${escapeHTML(link.label || link.texto || "Link")}
                            </a>
                        `).join("")}
                    </nav>
                </div>
            </footer>
        `;
    }

    function renderColorSelector(props) {
        const options = Array.isArray(props.opcoes) ? props.opcoes : [];

        return `
            <div class="aura-section-container aura-color-selector">
                ${props.titulo ? `<h2>${escapeHTML(props.titulo)}</h2>` : ""}
                <div class="aura-color-options" role="list">
                    ${options.map((option) => `
                        <button
                            type="button"
                            class="aura-color-option"
                            data-color="${escapeAttribute(option.hex || "")}"
                            aria-label="${escapeAttribute(option.nome || option.hex || "Cor")}"
                            title="${escapeAttribute(option.nome || option.hex || "Cor")}"
                        >
                            <span style="background:${escapeAttribute(option.hex || "#ffffff")}"></span>
                            <strong>${escapeHTML(option.nome || option.hex || "Cor")}</strong>
                        </button>
                    `).join("")}
                </div>
            </div>
        `;
    }

    function renderBreadcrumb(props) {
        const items = Array.isArray(props.itens) ? props.itens : [];

        return `
            <nav class="aura-section-container aura-breadcrumb" aria-label="Navegação estrutural">
                <ol>
                    ${items.map((item, index) => `
                        <li>
                            ${index < items.length - 1 ? `
                                <a href="${escapeAttribute(safeURL(item.href || "#"))}">
                                    ${escapeHTML(item.label || "")}
                                </a>
                            ` : `
                                <span aria-current="page">${escapeHTML(item.label || "")}</span>
                            `}
                        </li>
                    `).join("")}
                </ol>
            </nav>
        `;
    }

    function renderShape(props, responsive) {
        const width = Math.max(8, numberOr(props.largura, 160));
        const height = Math.max(8, numberOr(props.altura, 160));
        const color = props.cor || responsive.design?.corFundo || "#ff7a45";
        const type = String(props.tipoForma || "circulo").toLowerCase();
        const safeType = ["circulo", "quadrado", "retangulo", "linha"].includes(type)
            ? type
            : "circulo";

        return `
            <div class="aura-shape-wrap" aria-hidden="true">
                <span
                    class="aura-shape aura-shape-${safeType}"
                    style="width:${width}px;height:${height}px;background:${escapeAttribute(color)}"
                ></span>
            </div>
        `;
    }

    async function loadProducts(blocks) {
        const ids = new Set();

        for (const block of blocks) {
            if (block.tipo !== "carrossel_produtos") {
                continue;
            }

            const responsive = resolveResponsiveState(block);
            for (const id of responsive.props?.produtosIds || []) {
                if (id) {
                    ids.add(String(id));
                }
            }
        }

        if (!ids.size) {
            return;
        }

        const { doc, getDoc } = state.firestore;
        const tasks = Array.from(ids).map(async (id) => {
            try {
                const snapshot = await getDoc(doc(state.db, "produtos", id));
                if (snapshot.exists()) {
                    state.products.set(id, {
                        id,
                        ...snapshot.data()
                    });
                }
            } catch (error) {
                console.warn(`[Renderer V4] Produto ${id} não carregado.`, error);
            }
        });

        await Promise.all(tasks);
    }

    function buildPageHTML(blocks) {
        const mode = String(state.meta?.modoLayout || "empilhado").toLowerCase();
        const normalizedMode = mode === "livre" ? "livre" : "empilhado";
        const content = blocks
            .map((block, index) => renderBlock(block, normalizedMode, index))
            .join("");
        const draft = state.preview
            ? `<div class="aura-preview-banner">Visualização de rascunho</div>`
            : "";
        const skip = `<a class="aura-skip-link" href="#aura-public-main">Pular para o conteúdo</a>`;
        const pages = renderPageNavigation();

        if (normalizedMode === "livre") {
            const stageWidth = FREE_STAGE_WIDTHS[state.device];
            const stageHeight = calculateStageHeight(blocks);

            return `
                <div
                    class="aura-public-v4-root aura-public-v4-free"
                    data-aura-public-v4
                    data-version="${VERSION}"
                    data-device="${state.device}"
                >
                    ${skip}
                    ${draft}
                    <main id="aura-public-main" tabindex="-1">
                        <div class="aura-v4-stage-shell" style="--aura-stage-height:${stageHeight}px">
                            <div
                                class="aura-v4-free-stage"
                                style="width:${stageWidth}px;min-height:${stageHeight}px"
                                data-aura-stage-width="${stageWidth}"
                                data-aura-stage-height="${stageHeight}"
                            >
                                ${content}
                            </div>
                        </div>
                    </main>
                    ${pages}
                </div>
            `;
        }

        return `
            <div
                class="aura-public-v4-root aura-public-v4-stacked"
                data-aura-public-v4
                data-version="${VERSION}"
                data-device="${state.device}"
            >
                ${skip}
                ${draft}
                <main id="aura-public-main" tabindex="-1">
                    ${wrapGroupedBlocks(blocks, normalizedMode)}
                </main>
                ${pages}
            </div>
        `;
    }

    function wrapGroupedBlocks(blocks, mode) {
        const rendered = [];
        let currentGroup = null;
        let groupItems = [];

        const flush = () => {
            if (!groupItems.length) {
                return;
            }

            const html = groupItems
                .map(({ block, index }) => renderBlock(block, mode, index))
                .join("");

            if (currentGroup) {
                rendered.push(`
                    <div class="aura-v4-public-group" data-aura-group="${escapeAttribute(currentGroup)}">
                        ${html}
                    </div>
                `);
            } else {
                rendered.push(html);
            }

            groupItems = [];
        };

        blocks.forEach((block, index) => {
            const responsive = resolveResponsiveState(block);
            const groupId = String(responsive.design?.v4GroupId || "");

            if (groupId !== currentGroup) {
                flush();
                currentGroup = groupId || null;
            }

            groupItems.push({ block, index });
        });

        flush();
        return rendered.join("");
    }

    function calculateStageHeight(blocks) {
        let max = 720;

        for (const block of blocks) {
            const responsive = resolveResponsiveState(block);
            if (!isBlockVisible(block, responsive)) {
                continue;
            }

            const geometry = responsive.geometry;
            max = Math.max(max, geometry.y + geometry.altura + 80);
        }

        return Math.ceil(max);
    }

    function renderPageNavigation() {
        const pages = Array.isArray(state.meta?.paginas)
            ? state.meta.paginas
            : [];

        if (pages.length <= 1) {
            return "";
        }

        return `
            <nav class="aura-page-navigation" aria-label="Páginas da landing page">
                ${pages.map((page, index) => {
                    const active = index === state.pageIndex;
                    const url = new URL(window.location.href);
                    url.searchParams.set("page", String(index + 1));
                    url.searchParams.delete("p");

                    return `
                        <a
                            href="${escapeAttribute(url.href)}"
                            ${active ? 'aria-current="page"' : ""}
                            class="${active ? "is-active" : ""}"
                        >
                            ${escapeHTML(page.nome || page.titulo || `Página ${index + 1}`)}
                        </a>
                    `;
                }).join("")}
            </nav>
        `;
    }

    async function render() {
        const container = document.getElementById("lp-container");

        if (!container || !state.meta || state.rendering) {
            return;
        }

        state.rendering = true;

        try {
            const blocks = sortAndFilterBlocks();
            await loadProducts(blocks);
            container.innerHTML = buildPageHTML(blocks);
            state.ready = true;
            document.documentElement.dataset.auraPublicV4 = "ready";
            document.body.classList.add("aura-public-v4-active");
            updateStageScale();
            installInteractions();
            updateSEO(blocks);
            announceReady();
        } finally {
            state.rendering = false;
        }
    }

    function updateStageScale() {
        const shell = document.querySelector(".aura-v4-stage-shell");
        const stage = document.querySelector(".aura-v4-free-stage");

        if (!shell || !stage) {
            return;
        }

        const logicalWidth = numberOr(stage.dataset.auraStageWidth, FREE_STAGE_WIDTHS[state.device]);
        const logicalHeight = numberOr(stage.dataset.auraStageHeight, 720);
        const viewportWidth = Math.max(280, shell.clientWidth);
        const scale = Math.min(1, viewportWidth / logicalWidth);

        stage.style.transform = `scale(${scale})`;
        shell.style.height = `${Math.ceil(logicalHeight * scale)}px`;
        shell.style.setProperty("--aura-stage-scale", String(scale));
    }

    function installInteractions() {
        installForms();
        installCarousels();
        installNavigation();
        installAnimations();
        installColorSelectors();
    }

    function installForms() {
        document.querySelectorAll("[data-aura-phone]").forEach((input) => {
            input.addEventListener("input", () => {
                input.value = formatPhone(input.value);
            });
        });

        document.querySelectorAll("[data-aura-lead-form]").forEach((form) => {
            form.addEventListener("submit", handleFormSubmit);
        });
    }

    function formatPhone(value) {
        const digits = String(value || "").replace(/\D/g, "").slice(0, 13);

        if (digits.length <= 2) {
            return digits;
        }

        if (digits.length <= 7) {
            return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
        }

        if (digits.length <= 11) {
            return `(${digits.slice(0, 2)}) ${digits.slice(2, -4)}-${digits.slice(-4)}`;
        }

        return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, -4)}-${digits.slice(-4)}`;
    }

    async function handleFormSubmit(event) {
        event.preventDefault();

        const form = event.currentTarget;
        const status = form.querySelector(".aura-form-status");
        const button = form.querySelector("button[type='submit']");
        const blockId = form.dataset.blockId;
        const block = state.blocks.find((item) => String(item.id) === String(blockId));
        const responsive = resolveResponsiveState(block || {});
        const config = responsive.props?._auraForm || {};
        const formData = new FormData(form);
        const values = Object.fromEntries(formData.entries());

        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const originalText = button?.textContent || "Enviar";

        if (button) {
            button.disabled = true;
            button.textContent = "Enviando...";
        }

        if (status) {
            status.textContent = "";
            status.className = "aura-form-status";
        }

        try {
            const source = String(config.origem || "Landing Page").trim() || "Landing Page";
            const name = values.nome || values.name || values["nome completo"] || "";
            const phone = values.whatsapp || values.telefone || values.phone || "";
            const email = values.email || "";
            const campaign = new URLSearchParams(window.location.search);

            const result = await state.functions.createPublicLead({
                publicPageId: `${state.route?.lojaSlug || ""}__${state.route?.paginaSlug || ""}`.toLowerCase(),
                nome: String(name).trim(),
                whatsapp: String(phone).replace(/\D/g, ""),
                email: String(email).trim(),
                origem: source,
                produtoInteresse: state.meta?.titulo || state.route?.paginaSlug || "Landing Page",
                paginaOrigem: state.route?.paginaSlug || "",
                blocoOrigem: blockId || "",
                status: String(config.status || "novo"),
                prioridade: String(config.prioridade || "normal"),
                followupDias: Math.max(0, numberOr(config.followupDias, 0)),
                cliques: 0,
                utmSource: campaign.get("utm_source") || "",
                utmMedium: campaign.get("utm_medium") || "",
                utmCampaign: campaign.get("utm_campaign") || "",
                data: Date.now()
            });

            form.reset();

            if (status) {
                status.textContent = responsive.props?.mensagemSucesso || "Informações enviadas com sucesso.";
                status.classList.add("is-success");
            }
        } catch (error) {
            console.error("[Renderer V4] Falha ao enviar lead:", error);

            if (status) {
                status.textContent = "Não foi possível enviar agora. Tente novamente.";
                status.classList.add("is-error");
            }
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = originalText;
            }
        }
    }

    function installCarousels() {
        document.querySelectorAll("[data-aura-carousel]").forEach((carousel) => {
            const track = carousel.querySelector(".aura-carousel-track");
            const previousButtons = carousel.querySelectorAll("[data-aura-carousel-prev]");
            const nextButtons = carousel.querySelectorAll("[data-aura-carousel-next]");

            if (!track) {
                return;
            }

            const move = (direction) => {
                const amount = Math.max(260, track.clientWidth * 0.78);
                track.scrollBy({
                    left: direction * amount,
                    behavior: "smooth"
                });
            };

            previousButtons.forEach((button) => {
                button.addEventListener("click", () => move(-1));
            });

            nextButtons.forEach((button) => {
                button.addEventListener("click", () => move(1));
            });
        });
    }

    function installNavigation() {
        document.querySelectorAll("[data-aura-nav-toggle]").forEach((button) => {
            const nav = button.closest(".aura-public-nav");
            const links = nav?.querySelector("[data-aura-nav-links]");

            if (!links) {
                return;
            }

            button.addEventListener("click", () => {
                const expanded = button.getAttribute("aria-expanded") === "true";
                button.setAttribute("aria-expanded", expanded ? "false" : "true");
                links.classList.toggle("is-open", !expanded);
            });
        });
    }

    function installAnimations() {
        const elements = document.querySelectorAll("[data-aura-animation]");

        if (!elements.length) {
            return;
        }

        elements.forEach((element) => {
            const duration = Math.max(150, Math.min(3000, numberOr(element.dataset.auraDuration, 600)));
            const delay = Math.max(0, Math.min(3000, numberOr(element.dataset.auraDelay, 0)));
            element.style.setProperty("--aura-animation-duration", `${duration}ms`);
            element.style.setProperty("--aura-animation-delay", `${delay}ms`);
        });

        if (
            window.matchMedia &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ) {
            elements.forEach((element) => element.classList.add("is-visible"));
            return;
        }

        const observer = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting) {
                    entry.target.classList.add("is-visible");
                    observer.unobserve(entry.target);
                }
            }
        }, {
            threshold: 0.12,
            rootMargin: "0px 0px -6% 0px"
        });

        elements.forEach((element) => observer.observe(element));
    }

    function installColorSelectors() {
        document.querySelectorAll(".aura-color-option").forEach((button) => {
            button.addEventListener("click", () => {
                const parent = button.closest(".aura-color-options");
                parent?.querySelectorAll(".aura-color-option").forEach((item) => {
                    item.classList.remove("is-selected");
                    item.setAttribute("aria-pressed", "false");
                });

                button.classList.add("is-selected");
                button.setAttribute("aria-pressed", "true");

                document.dispatchEvent(new CustomEvent("aura:color-selected", {
                    detail: {
                        color: button.dataset.color || "",
                        label: button.getAttribute("aria-label") || ""
                    }
                }));
            });
        });
    }

    function updateSEO(blocks) {
        const title = String(
            state.meta?.titulo ||
            state.route?.paginaSlug ||
            "Landing Page"
        ).trim();
        const description = findDescription(blocks);
        const canonicalURL = new URL(window.location.href);
        canonicalURL.searchParams.delete("preview");
        canonicalURL.searchParams.delete("p");

        document.title = title;

        upsertMeta("name", "description", description);
        upsertMeta("property", "og:title", title);
        upsertMeta("property", "og:description", description);
        upsertMeta("property", "og:type", "website");
        upsertMeta("property", "og:url", canonicalURL.href);

        let canonical = document.querySelector("link[rel='canonical']");
        if (!canonical) {
            canonical = document.createElement("link");
            canonical.rel = "canonical";
            document.head.appendChild(canonical);
        }
        canonical.href = canonicalURL.href;

        document.documentElement.lang = "pt-BR";
    }

    function findDescription(blocks) {
        for (const block of blocks) {
            const responsive = resolveResponsiveState(block);
            const props = responsive.props || {};
            const candidate =
                props.subtitulo ||
                props.texto ||
                stripHTML(props.conteudo || "");

            if (candidate) {
                return String(candidate).replace(/\s+/g, " ").trim().slice(0, 160);
            }
        }

        return `Conheça ${state.meta?.titulo || "esta página"}.`;
    }

    function stripHTML(value) {
        const element = document.createElement("div");
        element.innerHTML = String(value || "");
        return element.textContent || "";
    }

    function upsertMeta(attribute, key, content) {
        let element = document.querySelector(`meta[${attribute}="${key}"]`);

        if (!element) {
            element = document.createElement("meta");
            element.setAttribute(attribute, key);
            document.head.appendChild(element);
        }

        element.setAttribute("content", content);
    }

    function renderLoading() {
        const container = document.getElementById("lp-container");
        if (!container) {
            return;
        }

        container.innerHTML = `
            <div class="aura-public-state" data-aura-public-v4>
                <div class="aura-state-spinner" aria-hidden="true"></div>
                <h1>Carregando página</h1>
                <p>Preparando a experiência.</p>
            </div>
        `;
    }

    function renderError(message) {
        const container = document.getElementById("lp-container");
        if (!container) {
            return;
        }

        container.innerHTML = `
            <div class="aura-public-state aura-public-error" data-aura-public-v4>
                <div class="aura-state-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                        <path d="M12 9v4m0 4h.01M10.3 3.7L2.6 17a2 2 0 001.7 3h15.4a2 2 0 001.7-3L13.7 3.7a2 2 0 00-3.4 0z"></path>
                    </svg>
                </div>
                <h1>Página indisponível</h1>
                <p>${escapeHTML(message || "Não foi possível abrir esta página.")}</p>
            </div>
        `;
        document.documentElement.dataset.auraPublicV4 = "error";
    }

    async function importModules() {
        const firebaseInitURL = new URL("firebase-init.js", `${window.location.origin}${state.base}`).href;
        const videFunctionsURL = new URL("core/vide-functions.js", `${window.location.origin}${state.base}`).href;
        const firestoreURL = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`;
        const authURL = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`;

        const [firebaseInit, firestore, authModule, videFunctions] = await Promise.all([
            import(firebaseInitURL),
            import(firestoreURL),
            import(authURL),
            import(videFunctionsURL)
        ]);

        state.db = firebaseInit.db;
        state.auth = firebaseInit.auth;
        state.firestore = firestore;
        state.authModule = authModule;
        state.functions = videFunctions.VideFunctions;

        if (!state.db) {
            throw new Error("Firebase não foi inicializado.");
        }
    }

    async function loadPublicData() {
        const { doc, getDoc, collection, getDocs, query, where } = state.firestore;
        const publicId = `${state.route.lojaSlug}__${state.route.paginaSlug}`.toLowerCase();
        const metaSnapshot = await getDoc(
            doc(state.db, "landing_pages_publicas", publicId)
        );

        if (!metaSnapshot.exists()) {
            throw new Error("Esta landing page não foi encontrada.");
        }

        const meta = {
            id: metaSnapshot.id,
            ...metaSnapshot.data()
        };

        if (meta.publicado === false) {
            throw new Error("Esta landing page ainda não está publicada.");
        }

        const blockSnapshot = await getDocs(
            query(
                collection(state.db, "landing_pages_blocos_publicas"),
                where("lpId", "==", publicId)
            )
        );

        state.meta = meta;
        state.blocks = blockSnapshot.docs.map((snapshot) => ({
            id: snapshot.id,
            ...snapshot.data()
        }));
    }

    async function waitForAuthenticatedUser() {
        if (!state.auth || !state.authModule?.onAuthStateChanged) {
            return null;
        }

        return new Promise((resolve) => {
            let completed = false;
            const finish = (user) => {
                if (completed) {
                    return;
                }
                completed = true;
                resolve(user || null);
            };

            const unsubscribe = state.authModule.onAuthStateChanged(
                state.auth,
                (user) => {
                    unsubscribe();
                    finish(user);
                },
                () => {
                    unsubscribe();
                    finish(null);
                }
            );

            window.setTimeout(() => {
                try {
                    unsubscribe();
                } catch (error) {
                    // Sem ação.
                }
                finish(state.auth.currentUser || null);
            }, 8000);
        });
    }

    async function loadPreviewData() {
        const user = await waitForAuthenticatedUser();

        if (!user) {
            throw new Error("Entre na sua conta para visualizar o rascunho.");
        }

        const { collection, getDocs, query, where } = state.firestore;
        const pageSnapshot = await getDocs(
            query(
                collection(state.db, "landing_pages"),
                where("donoUID", "==", user.uid),
                where("pagina", "==", state.route.paginaSlug)
            )
        );

        const pageDoc = pageSnapshot.docs[0];

        if (!pageDoc) {
            throw new Error("Rascunho não encontrado para esta conta.");
        }

        const pageData = {
            id: pageDoc.id,
            ...pageDoc.data()
        };
        const blockSnapshot = await getDocs(
            query(
                collection(state.db, "landing_pages_blocos"),
                where("lpId", "==", pageDoc.id)
            )
        );

        state.meta = pageData;
        state.blocks = blockSnapshot.docs
            .map((snapshot) => ({
                id: snapshot.id,
                ...snapshot.data()
            }))
            .filter((block) => !block.donoUID || block.donoUID === user.uid);
    }

    function installContainerGuard() {
        const container = document.getElementById("lp-container");

        if (!container || state.containerObserver) {
            return;
        }

        state.containerObserver = new MutationObserver(() => {
            if (
                state.ready &&
                !state.rendering &&
                !container.querySelector("[data-aura-public-v4]")
            ) {
                queueRender();
            }
        });

        state.containerObserver.observe(container, {
            childList: true
        });
    }

    function queueRender() {
        if (state.renderQueued) {
            return;
        }

        state.renderQueued = true;

        window.setTimeout(() => {
            state.renderQueued = false;
            render().catch((error) => {
                console.error("[Renderer V4] Falha ao restaurar a página:", error);
            });
        }, 80);
    }

    function installResizeHandler() {
        window.addEventListener("resize", () => {
            window.clearTimeout(state.resizeTimer);
            state.resizeTimer = window.setTimeout(() => {
                const nextDevice = getDevice();

                if (nextDevice !== state.device) {
                    state.device = nextDevice;
                    render().catch((error) => {
                        console.error("[Renderer V4] Falha ao ajustar responsividade:", error);
                    });
                } else {
                    updateStageScale();
                }
            }, 120);
        });
    }

    function announceReady() {
        window.dispatchEvent(new CustomEvent("aura:public-renderer-ready", {
            detail: {
                version: VERSION,
                device: state.device,
                preview: state.preview,
                route: state.route
            }
        }));
    }

    async function start() {
        state.route = parseRoute();

        if (!state.route) {
            return;
        }

        state.preview = new URLSearchParams(window.location.search).get("preview") === "1";
        document.documentElement.dataset.auraPublicV4 = "loading";

        renderLoading();
        installContainerGuard();
        installResizeHandler();

        try {
            await importModules();

            if (state.preview) {
                await loadPreviewData();
            } else {
                await loadPublicData();
            }

            await render();

            console.info(
                `[Vide Aura Renderer Público V4] Inicializado — ${state.device}`
            );
        } catch (error) {
            console.error("[Renderer V4] Inicialização interrompida:", error);
            renderError(error?.message || "Não foi possível carregar a página.");
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }

    window.AuraPublicRendererV4 = {
        version: VERSION,
        rerender: render,
        getState: () => ({
            device: state.device,
            preview: state.preview,
            route: state.route,
            pageIndex: state.pageIndex,
            blockCount: state.blocks.length
        })
    };
})();
