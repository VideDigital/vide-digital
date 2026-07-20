(function (root) {
  "use strict";

  const VERSION = "1.0.0";
  const SOURCE = "canonical-renderers-v1";

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

  function safeURL(value, fallback) {
    const raw = String(value || "").trim();
    const safeFallback = fallback === undefined ? "#" : fallback;
    if (!raw) return safeFallback;
    if (/^(?:https?:\/\/|mailto:|tel:)/i.test(raw)) return raw;
    if (/^(?:#|\/|\.\/|\.\.\/)/.test(raw) && !/^\/\//.test(raw)) return raw;
    return safeFallback;
  }

  function safeImage(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw;
    if (/^(?:\/|\.\/|\.\.\/)[^\s]+$/i.test(raw) && !/^\/\//.test(raw)) return raw;
    if (/^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(raw)) return raw;
    return "";
  }

  function propsOf(block) {
    return block?.props && typeof block.props === "object" ? block.props : (block || {});
  }

  function arrayOf(value) {
    return Array.isArray(value) ? value : [];
  }

  function textMediaRenderer(block) {
    const props = propsOf(block);
    const image = safeImage(props.imagemB64 || props.imagem || props.image || props.foto);
    const link = safeURL(props.botaoLink || props.link || "#");
    return `
      <section class="aura-canonical-block aura-canonical-hero" data-aura-block-type="texto_midia">
        <div class="aura-canonical-container aura-canonical-hero-grid">
          <div class="aura-canonical-copy">
            ${props.etiqueta ? `<span class="aura-canonical-eyebrow">${escapeHTML(props.etiqueta)}</span>` : ""}
            <h2>${escapeHTML(props.titulo || "Título da seção")}</h2>
            ${props.subtitulo || props.texto ? `<p>${escapeHTML(props.subtitulo || props.texto)}</p>` : ""}
            ${props.botaoTexto ? `<a class="aura-canonical-button" href="${escapeAttribute(link)}">${escapeHTML(props.botaoTexto)}</a>` : ""}
          </div>
          ${image ? `<figure class="aura-canonical-media"><img src="${escapeAttribute(image)}" alt="${escapeAttribute(props.imagemAlt || props.titulo || "Imagem da seção")}" loading="lazy" decoding="async"></figure>` : `<div class="aura-canonical-media aura-canonical-media-placeholder" aria-hidden="true"><span></span><span></span><span></span></div>`}
        </div>
      </section>
    `;
  }

  function faqRenderer(block) {
    const props = propsOf(block);
    const items = arrayOf(props.itens || props.items || props.faqs);
    const safeItems = items.length ? items : [
      { pergunta: "Como este bloco funciona?", resposta: "Edite as perguntas e respostas no painel de propriedades." },
      { pergunta: "Posso adicionar mais itens?", resposta: "Sim. O conteúdo é repetível e responsivo." }
    ];
    return `
      <section class="aura-canonical-block aura-canonical-faq" data-aura-block-type="faq">
        <div class="aura-canonical-container">
          <div class="aura-canonical-heading"><span>Perguntas frequentes</span><h2>${escapeHTML(props.titulo || "Perguntas frequentes")}</h2></div>
          <div class="aura-canonical-faq-list">
            ${safeItems.map((item, index) => `
              <details ${index === 0 ? "open" : ""}>
                <summary>${escapeHTML(item?.pergunta || item?.titulo || `Pergunta ${index + 1}`)}<span aria-hidden="true">+</span></summary>
                <p>${escapeHTML(item?.resposta || item?.texto || "Adicione uma resposta.")}</p>
              </details>
            `).join("")}
          </div>
        </div>
      </section>
    `;
  }

  function cardListRenderer(block) {
    const props = propsOf(block);
    const items = arrayOf(props.itens || props.cards || props.items);
    const safeItems = items.length ? items : [
      { titulo: "Benefício principal", texto: "Explique de forma curta o valor entregue." },
      { titulo: "Experiência simples", texto: "Mostre por que a solução é fácil de usar." },
      { titulo: "Resultado claro", texto: "Conecte o recurso ao objetivo do cliente." }
    ];
    return `
      <section class="aura-canonical-block aura-canonical-cards" data-aura-block-type="lista_cards">
        <div class="aura-canonical-container">
          <div class="aura-canonical-heading"><span>Conteúdo em destaque</span><h2>${escapeHTML(props.titulo || "Destaques")}</h2></div>
          <div class="aura-canonical-card-grid">
            ${safeItems.map((item, index) => {
              const image = safeImage(item?.imagemB64 || item?.imagem || item?.image);
              return `
                <article>
                  ${image ? `<img src="${escapeAttribute(image)}" alt="${escapeAttribute(item?.imagemAlt || item?.titulo || `Imagem ${index + 1}`)}" loading="lazy" decoding="async">` : `<span class="aura-canonical-card-index" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>`}
                  <h3>${escapeHTML(item?.titulo || `Destaque ${index + 1}`)}</h3>
                  <p>${escapeHTML(item?.texto || item?.descricao || "Personalize este conteúdo.")}</p>
                </article>
              `;
            }).join("")}
          </div>
        </div>
      </section>
    `;
  }

  function galleryRenderer(block) {
    const props = propsOf(block);
    const images = arrayOf(props.imagens || props.images);
    const renderedImages = images.map((item, index) => {
      const source = safeImage(typeof item === "string" ? item : item?.imagemB64 || item?.url || item?.src);
      if (!source) return "";
      const alt = typeof item === "object" ? item?.alt || item?.titulo : props.titulo;
      return `<figure><img src="${escapeAttribute(source)}" alt="${escapeAttribute(alt || `Imagem ${index + 1}`)}" loading="lazy" decoding="async"></figure>`;
    }).filter(Boolean);
    return `
      <section class="aura-canonical-block aura-canonical-gallery" data-aura-block-type="galeria_imagens">
        <div class="aura-canonical-container">
          <div class="aura-canonical-heading"><span>Seleção visual</span><h2>${escapeHTML(props.titulo || "Galeria")}</h2></div>
          <div class="aura-canonical-gallery-grid">
            ${renderedImages.length ? renderedImages.join("") : [0, 1, 2, 3].map((index) => `<div class="aura-canonical-gallery-placeholder" aria-label="Espaço reservado para imagem ${index + 1}"><span></span></div>`).join("")}
          </div>
        </div>
      </section>
    `;
  }

  function normalizeField(field, index) {
    const value = typeof field === "string" ? { name: field } : (field || {});
    const name = String(value.name || value.nome || `campo_${index + 1}`).toLowerCase().replace(/[^a-z0-9_]+/g, "_");
    const labels = {
      nome: "Nome",
      email: "E-mail",
      whatsapp: "WhatsApp",
      telefone: "Telefone",
      empresa: "Empresa",
      mensagem: "Mensagem"
    };
    const allowedTypes = new Set(["text", "email", "tel", "number", "date", "textarea"]);
    let type = String(value.type || value.tipo || (name === "email" ? "email" : /whatsapp|telefone/.test(name) ? "tel" : name === "mensagem" ? "textarea" : "text")).toLowerCase();
    if (!allowedTypes.has(type)) type = "text";
    return {
      name,
      label: compactLabel(value.label || value.rotulo || labels[name] || name),
      type,
      required: value.required !== false && value.obrigatorio !== false
    };
  }

  function compactLabel(value) {
    const clean = String(value || "Campo").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  }

  function formRenderer(block, context) {
    const props = propsOf(block);
    const fields = arrayOf(props.campos).length ? arrayOf(props.campos) : ["nome", "email", "whatsapp"];
    const preview = context?.preview === true || context?.mode === "library-preview";
    return `
      <section class="aura-canonical-block aura-canonical-form-section" data-aura-block-type="formulario_captura">
        <div class="aura-canonical-container aura-canonical-form-grid">
          <div class="aura-canonical-copy"><span class="aura-canonical-eyebrow">Vamos conversar</span><h2>${escapeHTML(props.titulo || "Receba novidades")}</h2><p>${escapeHTML(props.subtitulo || "Preencha seus dados e entraremos em contato.")}</p></div>
          <form class="aura-canonical-form" data-aura-canonical-form novalidate>
            ${fields.map((field, index) => {
              const normalized = normalizeField(field, index);
              const id = `aura-field-${escapeAttribute(normalized.name)}-${index}`;
              return `<label for="${id}"><span>${escapeHTML(normalized.label)}</span>${normalized.type === "textarea" ? `<textarea id="${id}" name="${escapeAttribute(normalized.name)}" ${normalized.required ? "required" : ""}></textarea>` : `<input id="${id}" name="${escapeAttribute(normalized.name)}" type="${escapeAttribute(normalized.type)}" ${normalized.required ? "required" : ""}>`}</label>`;
            }).join("")}
            <button type="${preview ? "button" : "submit"}" class="aura-canonical-button">${escapeHTML(props.botaoTexto || "Enviar")}</button>
          </form>
        </div>
      </section>
    `;
  }

  function footerRenderer(block) {
    const props = propsOf(block);
    const links = arrayOf(props.links || props.itens);
    const copyright = props.textoCopyright || props.texto || "Todos os direitos reservados.";
    return `
      <footer class="aura-canonical-block aura-canonical-footer" data-aura-block-type="rodape">
        <div class="aura-canonical-container aura-canonical-footer-grid">
          <div><strong>${escapeHTML(props.marca || props.logoTexto || "Sua marca")}</strong><p>${escapeHTML(copyright)}</p></div>
          ${links.length ? `<nav aria-label="Links do rodapé">${links.map((link) => `<a href="${escapeAttribute(safeURL(link?.href || link?.link || "#"))}">${escapeHTML(link?.label || link?.texto || "Link")}</a>`).join("")}</nav>` : `<nav aria-label="Links do rodapé"><a href="#">Início</a><a href="#">Contato</a></nav>`}
        </div>
      </footer>
    `;
  }

  const renderers = Object.freeze({
    texto_midia: textMediaRenderer,
    faq: faqRenderer,
    lista_cards: cardListRenderer,
    galeria_imagens: galleryRenderer,
    formulario_captura: formRenderer,
    rodape: footerRenderer
  });

  const upgrades = Object.freeze({
    texto_midia: {
      defaults: { tipo: "texto_midia", props: { etiqueta: "Novidade", titulo: "Transforme sua ideia em resultado", subtitulo: "Apresente sua proposta com clareza e uma chamada objetiva.", botaoTexto: "Saiba mais", botaoLink: "#" }, design: {} }
    },
    faq: {
      defaults: { tipo: "faq", props: { titulo: "Perguntas frequentes", itens: [{ pergunta: "Como funciona?", resposta: "Explique aqui o funcionamento da sua oferta." }, { pergunta: "Quais são os próximos passos?", resposta: "Oriente o visitante com uma resposta simples." }] }, design: {} }
    },
    lista_cards: {
      schema: { props: { titulo: { type: "text", label: "Título" }, itens: { type: "repeater", label: "Cards" } } },
      defaults: { tipo: "lista_cards", props: { titulo: "Destaques", itens: [{ titulo: "Benefício principal", texto: "Explique o valor entregue." }, { titulo: "Experiência simples", texto: "Mostre por que é fácil usar." }, { titulo: "Resultado claro", texto: "Conecte o recurso ao objetivo." }] }, design: {} }
    },
    galeria_imagens: {
      defaults: { tipo: "galeria_imagens", props: { titulo: "Galeria", imagens: [] }, design: {} }
    },
    formulario_captura: {
      defaults: { tipo: "formulario_captura", props: { titulo: "Receba novidades", subtitulo: "Preencha seus dados para continuar.", botaoTexto: "Enviar", campos: ["nome", "email", "whatsapp"] }, design: {} }
    },
    rodape: {
      schema: { props: { marca: { type: "text", label: "Marca" }, texto: { type: "text", label: "Copyright" }, links: { type: "repeater", label: "Links" } } },
      defaults: { tipo: "rodape", props: { marca: "Sua marca", texto: "Todos os direitos reservados.", links: [{ label: "Início", href: "#" }, { label: "Contato", href: "#" }] }, design: {} }
    }
  });

  function install(registry) {
    const target = registry || root.AuraStudioBlockRegistry;
    if (!target || typeof target.get !== "function" || typeof target.register !== "function") {
      return { ok: false, reason: "registry-unavailable", installed: [] };
    }
    const installed = [];
    const errors = [];
    Object.entries(renderers).forEach(([type, renderer]) => {
      const current = target.get(type);
      if (!current) {
        errors.push({ type, reason: "definition-missing" });
        return;
      }
      const upgrade = upgrades[type] || {};
      const result = target.register({
        ...current,
        ...upgrade,
        renderer,
        previewRenderer: renderer,
        capabilities: {
          ...(current.capabilities || {}),
          canonicalRenderer: true,
          safePreview: true
        },
        source: SOURCE
      }, { replace: true, source: SOURCE });
      if (result.ok) installed.push(type);
      else errors.push({ type, reason: "registration-failed", details: result.errors });
    });
    return { ok: errors.length === 0, installed, errors };
  }

  const api = Object.freeze({
    version: VERSION,
    source: SOURCE,
    types: Object.freeze(Object.keys(renderers)),
    renderers,
    safeURL,
    safeImage,
    install
  });

  root.AuraStudioCanonicalRenderersV1 = api;
  const result = install();
  if (!result.ok && root.console?.warn) {
    root.console.warn("[Studio Canonical Renderers] Inicialização parcial; o fallback legado foi preservado.", result);
  }
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
