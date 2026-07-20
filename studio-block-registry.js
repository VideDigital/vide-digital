(function (root) {
  "use strict";

  const REGISTRY_VERSION = "1.0.0";
  const LEGACY_PRESET_GLOBAL = "AURA_STUDIO_PRESETS";
  const LEGACY_VERSION_GLOBAL = "AURA_STUDIO_LIBRARY_VERSION";
  const SYSTEM_SOURCE = "system";
  const LEGACY_SOURCE = "legacy-preset";
  const LEGACY_VERSION = 0;

  if (root.AuraStudioBlockRegistry?.version === REGISTRY_VERSION) {
    return;
  }

  const CANONICAL_CATEGORIES = Object.freeze([
    "Estrutura",
    "Cabeçalhos",
    "Navegação",
    "Hero",
    "Conteúdo",
    "Texto",
    "Imagens",
    "Vídeos",
    "Produtos",
    "Serviços",
    "Preços",
    "Vendas",
    "Conversão",
    "Formulários",
    "Contato",
    "WhatsApp",
    "Depoimentos",
    "Prova social",
    "Equipe",
    "Portfólio",
    "Galerias",
    "FAQ",
    "Comparações",
    "Estatísticas",
    "Logos",
    "Parceiros",
    "Cronômetros",
    "Eventos",
    "Agendamentos",
    "Mapas",
    "Redes sociais",
    "Downloads",
    "Cursos",
    "Comunidades",
    "Restaurantes",
    "Saúde e beleza",
    "Profissionais",
    "SaaS",
    "E-commerce",
    "Institucional",
    "Rodapés",
    "Utilidades",
    "Código",
    "Integrações",
    "Componentes globais",
    "Meus blocos",
    "Seções completas",
    "Páginas completas"
  ]);

  const state = {
    definitionsById: new Map(),
    definitionsByType: new Map(),
    definitionsByCategory: new Map(),
    aliases: new Map(),
    searchIndex: new Map(),
    sources: new Map(),
    legacyPresets: [],
    warnings: []
  };

  const systemDefinitions = [
    {
      id: "block.text-media",
      type: "texto_midia",
      version: 1,
      name: "Texto e mídia",
      description: "Seção versátil com título, texto, CTA e imagem.",
      category: "Hero",
      subcategory: "Texto e imagem",
      keywords: ["hero", "banner", "texto", "imagem", "cta", "apresentação"],
      aliases: ["hero", "banner", "texto-imagem", "imagem-texto"],
      icon: "layout-template",
      legacyTypes: ["texto_midia"],
      renderer: "legacy:renderTextMedia",
      capabilities: { responsive: true, form: false, media: true },
      schema: {
        props: {
          titulo: { type: "text", label: "Título" },
          subtitulo: { type: "textarea", label: "Subtítulo" },
          botaoTexto: { type: "text", label: "Texto do botão" },
          botaoLink: { type: "link", label: "Link do botão" },
          imagem: { type: "image", label: "Imagem" }
        }
      },
      defaults: {
        tipo: "texto_midia",
        props: { titulo: "Título da seção", subtitulo: "Texto de apoio", botaoTexto: "Saiba mais", botaoLink: "#" },
        design: {}
      }
    },
    {
      id: "block.capture-form",
      type: "formulario_captura",
      version: 1,
      name: "Formulário de captura",
      description: "Formulário público para capturar leads via backend seguro.",
      category: "Formulários",
      subcategory: "Lead",
      keywords: ["formulário", "lead", "contato", "captura", "newsletter", "orçamento"],
      aliases: ["formulario", "form", "lead-form", "captura"],
      icon: "clipboard-list",
      legacyTypes: ["formulario_captura"],
      renderer: "legacy:renderForm",
      capabilities: { responsive: true, form: true, conversion: true },
      schema: {
        props: {
          titulo: { type: "text", label: "Título" },
          subtitulo: { type: "textarea", label: "Texto de apoio" },
          botaoTexto: { type: "text", label: "Texto do botão" },
          campos: { type: "list", label: "Campos" }
        }
      },
      defaults: {
        tipo: "formulario_captura",
        props: { titulo: "Receba novidades", botaoTexto: "Enviar", campos: ["nome", "email", "whatsapp"] },
        design: {}
      }
    },
    {
      id: "block.faq",
      type: "faq",
      version: 1,
      name: "Perguntas frequentes",
      description: "Lista de perguntas e respostas em formato expansível.",
      category: "FAQ",
      subcategory: "Accordion",
      keywords: ["faq", "perguntas", "dúvidas", "respostas", "accordion"],
      aliases: ["perguntas-frequentes", "duvidas", "accordion"],
      icon: "circle-help",
      legacyTypes: ["faq"],
      renderer: "legacy:renderFAQ",
      capabilities: { responsive: true, accordion: true },
      schema: {
        props: {
          titulo: { type: "text", label: "Título" },
          itens: { type: "repeater", label: "Perguntas" }
        }
      },
      defaults: {
        tipo: "faq",
        props: { titulo: "Perguntas frequentes", itens: [] },
        design: {}
      }
    },
    {
      id: "block.image-gallery",
      type: "galeria_imagens",
      version: 1,
      name: "Galeria de imagens",
      description: "Grade ou coleção visual para fotos, portfólio e produtos.",
      category: "Galerias",
      subcategory: "Grid",
      keywords: ["galeria", "imagem", "fotos", "portfolio", "masonry", "grid"],
      aliases: ["galeria", "fotos", "portfolio"],
      icon: "images",
      legacyTypes: ["galeria_imagens"],
      renderer: "legacy:renderGallery",
      capabilities: { responsive: true, media: true },
      schema: {
        props: {
          titulo: { type: "text", label: "Título" },
          imagens: { type: "image-list", label: "Imagens" }
        }
      },
      defaults: { tipo: "galeria_imagens", props: { titulo: "Galeria", imagens: [] }, design: {} }
    },
    {
      id: "block.card-list",
      type: "lista_cards",
      version: 1,
      name: "Lista de cards",
      description: "Cards para benefícios, serviços, recursos ou etapas.",
      category: "Conteúdo",
      subcategory: "Cards",
      keywords: ["cards", "benefícios", "serviços", "recursos", "etapas", "lista"],
      aliases: ["cards", "beneficios", "servicos", "features"],
      icon: "panel-top",
      legacyTypes: ["lista_cards"],
      renderer: "legacy:renderCardList",
      capabilities: { responsive: true, repeatable: true },
      schema: {
        props: {
          titulo: { type: "text", label: "Título" },
          itens: { type: "repeater", label: "Cards" }
        }
      },
      defaults: { tipo: "lista_cards", props: { titulo: "Destaques", itens: [] }, design: {} }
    },
    {
      id: "block.comparison-table",
      type: "tabela_comparativo",
      version: 1,
      name: "Tabela comparativa",
      description: "Comparação entre planos, serviços ou alternativas.",
      category: "Comparações",
      subcategory: "Tabela",
      keywords: ["comparação", "comparativo", "planos", "tabela", "preços"],
      aliases: ["comparativo", "comparison", "planos"],
      icon: "columns-3",
      legacyTypes: ["tabela_comparativo"],
      renderer: "legacy:renderComparison",
      capabilities: { responsive: true },
      defaults: { tipo: "tabela_comparativo", props: { titulo: "Compare as opções", colunas: [], linhas: [] }, design: {} }
    },
    {
      id: "block.rich-text",
      type: "texto_rico",
      version: 1,
      name: "Texto rico",
      description: "Conteúdo editorial longo com parágrafos e destaque.",
      category: "Texto",
      subcategory: "Editorial",
      keywords: ["texto", "artigo", "conteúdo", "editorial", "parágrafo"],
      aliases: ["rich-text", "artigo", "conteudo"],
      icon: "text",
      legacyTypes: ["texto_rico"],
      renderer: "legacy:renderRichText",
      capabilities: { responsive: true, richText: true },
      defaults: { tipo: "texto_rico", props: { titulo: "Título", conteudo: "Conteúdo" }, design: {} }
    },
    {
      id: "block.custom-iframe",
      type: "codigo_iframe",
      version: 1,
      name: "Código / iframe",
      description: "Bloco legado para embeds controlados. Requer validação de segurança em fases futuras.",
      category: "Código",
      subcategory: "Embed",
      keywords: ["iframe", "embed", "código", "html"],
      aliases: ["codigo", "embed", "html"],
      icon: "code",
      legacyTypes: ["codigo_iframe"],
      renderer: "legacy:renderIframe",
      capabilities: { unsafeContent: true },
      experimental: true,
      defaults: { tipo: "codigo_iframe", props: { codigo: "" }, design: {} }
    },
    {
      id: "block.banner-carousel",
      type: "carrossel_banners",
      version: 1,
      name: "Carrossel de banners",
      description: "Banners promocionais em sequência.",
      category: "Imagens",
      subcategory: "Carrossel",
      keywords: ["banner", "carrossel", "promoção", "campanha"],
      aliases: ["banners", "carrossel-banner"],
      icon: "gallery-horizontal",
      legacyTypes: ["carrossel_banners"],
      renderer: "legacy:renderBannerCarousel",
      defaults: { tipo: "carrossel_banners", props: { banners: [] }, design: {} }
    },
    {
      id: "block.product-carousel",
      type: "carrossel_produtos",
      version: 1,
      name: "Carrossel de produtos",
      description: "Lista visual de produtos conectados ao catálogo.",
      category: "Produtos",
      subcategory: "Carrossel",
      keywords: ["produto", "produtos", "catálogo", "loja", "carrossel", "oferta"],
      aliases: ["produtos", "catalogo", "carrossel-produtos"],
      icon: "shopping-bag",
      legacyTypes: ["carrossel_produtos"],
      renderer: "legacy:renderProductCarousel",
      capabilities: { dynamicData: true, responsive: true },
      defaults: { tipo: "carrossel_produtos", props: { titulo: "Produtos", produtosIds: [] }, design: {} }
    },
    {
      id: "block.card-carousel",
      type: "carrossel_cards",
      version: 1,
      name: "Carrossel de cards",
      description: "Cards em carrossel para depoimentos, provas sociais ou recursos.",
      category: "Depoimentos",
      subcategory: "Carrossel",
      keywords: ["depoimentos", "prova social", "cards", "carrossel", "avaliações"],
      aliases: ["depoimento", "testimonials", "prova-social"],
      icon: "message-square-quote",
      legacyTypes: ["carrossel_cards"],
      renderer: "legacy:renderCardCarousel",
      defaults: { tipo: "carrossel_cards", props: { titulo: "Depoimentos", itens: [] }, design: {} }
    },
    {
      id: "block.navigation",
      type: "navegacao",
      version: 1,
      name: "Navegação",
      description: "Cabeçalho ou navegação por links internos.",
      category: "Navegação",
      subcategory: "Cabeçalho",
      keywords: ["navegação", "menu", "cabeçalho", "links", "âncoras"],
      aliases: ["menu", "header", "cabecalho", "nav"],
      icon: "menu",
      legacyTypes: ["navegacao"],
      renderer: "legacy:renderNavigation",
      defaults: { tipo: "navegacao", props: { links: [] }, design: {} }
    },
    {
      id: "block.footer",
      type: "rodape",
      version: 1,
      name: "Rodapé",
      description: "Rodapé com links, contato e redes sociais.",
      category: "Rodapés",
      subcategory: "Institucional",
      keywords: ["rodapé", "footer", "contato", "links", "redes sociais"],
      aliases: ["footer", "rodape"],
      icon: "panel-bottom",
      legacyTypes: ["rodape"],
      renderer: "legacy:renderFooter",
      defaults: { tipo: "rodape", props: { texto: "" }, design: {} }
    },
    {
      id: "block.color-selector",
      type: "seletor_cores",
      version: 1,
      name: "Seletor de cores",
      description: "Bloco legado para alternar tema visual da página.",
      category: "Utilidades",
      subcategory: "Tema",
      keywords: ["cores", "tema", "seletor", "personalização"],
      aliases: ["seletor-cores", "theme-picker"],
      icon: "palette",
      legacyTypes: ["seletor_cores"],
      renderer: "legacy:renderColorSelector",
      experimental: true,
      defaults: { tipo: "seletor_cores", props: {}, design: {} }
    },
    {
      id: "block.breadcrumb",
      type: "breadcrumb",
      version: 1,
      name: "Breadcrumb",
      description: "Trilha de navegação da página.",
      category: "Navegação",
      subcategory: "Breadcrumb",
      keywords: ["breadcrumb", "trilha", "navegação"],
      aliases: ["breadcrumbs", "trilha"],
      icon: "chevrons-right",
      legacyTypes: ["breadcrumb"],
      renderer: "legacy:renderBreadcrumb",
      defaults: { tipo: "breadcrumb", props: { itens: [] }, design: {} }
    },
    {
      id: "block.shape",
      type: "forma",
      version: 1,
      name: "Forma visual",
      description: "Elemento visual livre para composição no canvas.",
      category: "Estrutura",
      subcategory: "Elemento livre",
      keywords: ["forma", "shape", "visual", "decoração", "elemento"],
      aliases: ["shape", "decoracao"],
      icon: "shapes",
      legacyTypes: ["forma"],
      renderer: "legacy:renderShape",
      capabilities: { freeMode: true },
      defaults: { tipo: "forma", props: {}, design: {} }
    }
  ];

  function normalizeText(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function unique(values) {
    return [...new Set((values || []).filter((value) => value !== undefined && value !== null && String(value).trim() !== "").map(String))];
  }

  function clone(value) {
    if (value === undefined) return undefined;
    if (typeof structuredClone === "function") {
      try {
        return structuredClone(value);
      } catch (_) {
        // JSON fallback below keeps definitions data-only in older browsers.
      }
    }
    return JSON.parse(JSON.stringify(value));
  }

  function pushWarning(code, message, detail) {
    const warning = { code, message, detail: detail || null, createdAt: Date.now() };
    state.warnings.push(warning);
    if (state.warnings.length > 200) state.warnings.shift();
    return warning;
  }

  function normalizeDefinition(definition) {
    const def = { ...(definition || {}) };
    def.id = String(def.id || def.type || "").trim();
    def.type = String(def.type || def.id || "").trim();
    def.version = Number.isInteger(def.version) && def.version >= 1 ? def.version : 1;
    def.name = String(def.name || def.type || def.id || "Bloco").trim();
    def.description = String(def.description || "").trim();
    def.category = String(def.category || "Utilidades").trim();
    def.subcategory = String(def.subcategory || "").trim();
    def.keywords = unique(def.keywords);
    def.aliases = unique([...(def.aliases || []), ...(def.legacyTypes || [])]).filter((alias) => alias !== def.type);
    def.legacyTypes = unique([def.type, ...(def.legacyTypes || [])]);
    def.capabilities = def.capabilities && typeof def.capabilities === "object" ? { ...def.capabilities } : {};
    def.responsiveConfig = def.responsiveConfig && typeof def.responsiveConfig === "object" ? { ...def.responsiveConfig } : {};
    def.accessibilityConfig = def.accessibilityConfig && typeof def.accessibilityConfig === "object" ? { ...def.accessibilityConfig } : {};
    def.schema = def.schema && typeof def.schema === "object" ? clone(def.schema) : {};
    def.defaults = def.defaults && typeof def.defaults === "object" ? clone(def.defaults) : { tipo: def.type, props: {}, design: {} };
    def.deprecated = def.deprecated === true;
    def.experimental = def.experimental === true;
    return def;
  }

  function validateDefinition(definition, options = {}) {
    const errors = [];
    const warnings = [];
    const def = definition || {};
    const id = String(def.id || "").trim();
    const type = String(def.type || "").trim();

    if (!id) errors.push({ code: "missing-id", message: "Definição sem id." });
    if (!type) errors.push({ code: "missing-type", message: "Definição sem type." });
    if (def.version !== undefined && (!Number.isInteger(def.version) || def.version < 1)) {
      errors.push({ code: "invalid-version", message: "version deve ser inteiro positivo." });
    }
    if (def.category && !CANONICAL_CATEGORIES.includes(def.category)) {
      warnings.push({ code: "unknown-category", message: `Categoria não mapeada: ${def.category}.` });
    }
    if (def.schema !== undefined && (typeof def.schema !== "object" || Array.isArray(def.schema) || def.schema === null)) {
      errors.push({ code: "invalid-schema", message: "schema deve ser objeto." });
    }
    if (def.defaults !== undefined && (typeof def.defaults !== "object" || Array.isArray(def.defaults) || def.defaults === null)) {
      errors.push({ code: "invalid-defaults", message: "defaults deve ser objeto." });
    }
    if (def.renderer !== undefined && typeof def.renderer !== "function" && typeof def.renderer !== "string") {
      errors.push({ code: "invalid-renderer", message: "renderer deve ser função ou referência string." });
    }
    if (def.previewRenderer !== undefined && typeof def.previewRenderer !== "function" && typeof def.previewRenderer !== "string") {
      errors.push({ code: "invalid-preview-renderer", message: "previewRenderer deve ser função ou referência string." });
    }
    if (def.validator !== undefined && typeof def.validator !== "function") {
      errors.push({ code: "invalid-validator", message: "validator deve ser função." });
    }
    if (def.migrationHandler !== undefined && typeof def.migrationHandler !== "function") {
      errors.push({ code: "invalid-migration-handler", message: "migrationHandler deve ser função." });
    }

    if (!options.skipConflicts) {
      if (id && state.definitionsById.has(id) && state.definitionsById.get(id).type !== type) {
        errors.push({ code: "duplicate-id", message: `id já registrado: ${id}.` });
      }
      if (type && state.definitionsByType.has(type) && state.definitionsByType.get(type).id !== id) {
        errors.push({ code: "duplicate-type", message: `type já registrado: ${type}.` });
      }
      unique(def.aliases || []).forEach((alias) => {
        const normalized = normalizeText(alias);
        const owner = state.aliases.get(normalized);
        if (owner && owner !== type) {
          errors.push({ code: "alias-conflict", message: `alias em conflito: ${alias}.` });
        }
      });
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  function indexDefinition(def) {
    state.definitionsById.set(def.id, def);
    state.definitionsByType.set(def.type, def);

    if (!state.definitionsByCategory.has(def.category)) {
      state.definitionsByCategory.set(def.category, new Set());
    }
    state.definitionsByCategory.get(def.category).add(def.type);

    def.aliases.forEach((alias) => state.aliases.set(normalizeText(alias), def.type));
    def.legacyTypes.forEach((legacyType) => state.aliases.set(normalizeText(legacyType), def.type));

    const haystack = [
      def.id,
      def.type,
      def.name,
      def.description,
      def.category,
      def.subcategory,
      ...(def.keywords || []),
      ...(def.aliases || []),
      ...(def.legacyTypes || [])
    ].join(" ");
    state.searchIndex.set(def.type, normalizeText(haystack));
  }

  function register(definition, options = {}) {
    const def = normalizeDefinition(definition);
    const validation = validateDefinition(def, { skipConflicts: options.replace === true });
    if (!validation.valid) {
      pushWarning("definition-rejected", "Definição de bloco rejeitada.", { definition: def, errors: validation.errors });
      if (options.throwOnError) {
        throw new Error(validation.errors.map((error) => error.message).join(" "));
      }
      return { ok: false, definition: def, errors: validation.errors, warnings: validation.warnings };
    }

    if (!CANONICAL_CATEGORIES.includes(def.category)) {
      pushWarning("unknown-category", `Categoria não mapeada: ${def.category}.`, { type: def.type });
    }

    indexDefinition(def);
    state.sources.set(def.type, options.source || def.source || SYSTEM_SOURCE);
    return { ok: true, definition: def, errors: [], warnings: validation.warnings };
  }

  function get(typeOrId) {
    const key = String(typeOrId || "").trim();
    if (!key) return null;
    return state.definitionsByType.get(key)
      || state.definitionsById.get(key)
      || state.definitionsByType.get(resolveLegacyType(key))
      || null;
  }

  function has(typeOrId) {
    return Boolean(get(typeOrId));
  }

  function list(filters = {}) {
    let items = [...state.definitionsByType.values()];
    if (filters.category) items = items.filter((definition) => definition.category === filters.category);
    if (filters.includeDeprecated !== true) items = items.filter((definition) => definition.deprecated !== true);
    return items.map((definition) => clone(definition));
  }

  function listByCategory(category) {
    return list({ category });
  }

  function resolveLegacyType(type) {
    const raw = String(type || "").trim();
    if (!raw) return "";
    if (state.definitionsByType.has(raw)) return raw;
    return state.aliases.get(normalizeText(raw)) || raw;
  }

  function search(query, options = {}) {
    const normalized = normalizeText(query);
    const terms = normalized.split(/\s+/).filter(Boolean);
    if (!terms.length) return list(options);

    const results = [];
    state.searchIndex.forEach((haystack, type) => {
      const definition = state.definitionsByType.get(type);
      if (!definition || (definition.deprecated && !options.includeDeprecated)) return;
      let score = 0;
      terms.forEach((term) => {
        if (normalizeText(definition.type) === term) score += 20;
        if (normalizeText(definition.name).includes(term)) score += 12;
        if (normalizeText(definition.category).includes(term)) score += 6;
        if (haystack.includes(term)) score += 3;
      });
      if (score > 0) results.push({ score, definition });
    });

    return results
      .sort((a, b) => b.score - a.score || a.definition.name.localeCompare(b.definition.name))
      .map((item) => clone(item.definition));
  }

  function validateInstance(block) {
    const errors = [];
    const warnings = [];
    if (!block || typeof block !== "object" || Array.isArray(block)) {
      return { valid: false, errors: [{ code: "invalid-instance", message: "Bloco deve ser objeto." }], warnings };
    }
    const type = String(block.tipo || block.type || "").trim();
    if (!type) errors.push({ code: "missing-instance-type", message: "Instância sem tipo." });
    const definition = get(type);
    if (!definition) warnings.push({ code: "unknown-block-type", message: `Tipo sem definição canônica: ${type}.` });
    if (definition?.validator) {
      try {
        const custom = definition.validator(block);
        if (custom?.errors?.length) errors.push(...custom.errors);
        if (custom?.warnings?.length) warnings.push(...custom.warnings);
      } catch (error) {
        errors.push({ code: "validator-failed", message: error.message || "Validator falhou." });
      }
    }
    return { valid: errors.length === 0, errors, warnings, definition: definition ? clone(definition) : null };
  }

  function migrate(block) {
    const validation = validateInstance(block);
    if (!validation.valid && !validation.definition) {
      return { ok: false, block: clone(block), errors: validation.errors, warnings: validation.warnings };
    }

    const definition = get(block?.tipo || block?.type);
    const migrated = clone(block || {});
    const currentVersion = definition?.version || 1;
    const sourceVersion = Number.isInteger(migrated.version) ? migrated.version : LEGACY_VERSION;

    if (!definition) {
      return { ok: true, block: migrated, fromVersion: sourceVersion, toVersion: sourceVersion, warnings: validation.warnings };
    }

    if (!migrated.tipo && migrated.type) migrated.tipo = resolveLegacyType(migrated.type);
    if (!migrated.props || typeof migrated.props !== "object") migrated.props = clone(definition.defaults?.props || {});
    if (!migrated.design || typeof migrated.design !== "object") migrated.design = clone(definition.defaults?.design || {});

    try {
      if (definition.migrationHandler) {
        const result = definition.migrationHandler(clone(migrated), {
          fromVersion: sourceVersion,
          toVersion: currentVersion,
          definition: clone(definition)
        });
        if (result && typeof result === "object") Object.assign(migrated, result);
      }
      migrated.version = currentVersion;
      return { ok: true, block: migrated, fromVersion: sourceVersion, toVersion: currentVersion, warnings: validation.warnings };
    } catch (error) {
      return {
        ok: false,
        block: clone(block),
        fromVersion: sourceVersion,
        toVersion: currentVersion,
        errors: [{ code: "migration-failed", message: error.message || "Migração falhou." }],
        warnings: validation.warnings
      };
    }
  }

  function rendererFor(type) {
    const definition = get(type);
    return definition?.renderer || null;
  }

  function render(block, context = {}, legacyFallback) {
    const definition = get(block?.tipo || block?.type);
    if (definition && typeof definition.renderer === "function") {
      try {
        const rendered = definition.renderer(block, context);
        if (rendered !== null && rendered !== undefined) return rendered;
      } catch (error) {
        pushWarning("renderer-failed", `Renderer canônico falhou para ${definition.type}.`, {
          type: definition.type,
          message: error?.message || "Falha desconhecida."
        });
      }
    }
    if (typeof legacyFallback === "function") {
      return legacyFallback(block, context);
    }
    return null;
  }

  function definitionFromLegacyBlock(block, preset) {
    const type = String(block?.tipo || block?.type || "").trim();
    if (!type || state.definitionsByType.has(type)) return null;
    const category = preset?.categoria || inferCategory(type);
    return {
      id: `legacy.${type}`,
      type,
      version: 1,
      name: humanizeType(type),
      description: `Tipo legado detectado em preset: ${preset?.nome || preset?.id || "sem nome"}.`,
      category,
      subcategory: "Legado",
      keywords: unique([type, preset?.nome, preset?.categoria, ...(preset?.tags || [])]),
      aliases: [type],
      legacyTypes: [type],
      renderer: `legacy:${type}`,
      defaults: {
        tipo: type,
        props: clone(block.props || {}),
        design: clone(block.design || {})
      },
      experimental: true
    };
  }

  function inferCategory(type) {
    if (/produto|catalogo/.test(type)) return "Produtos";
    if (/form/.test(type)) return "Formulários";
    if (/faq/.test(type)) return "FAQ";
    if (/galeria|imagem|banner/.test(type)) return "Galerias";
    if (/rodape/.test(type)) return "Rodapés";
    if (/nav|menu|breadcrumb/.test(type)) return "Navegação";
    if (/texto|hero/.test(type)) return "Texto";
    return "Utilidades";
  }

  function humanizeType(type) {
    return String(type || "Bloco")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function registerLegacyPresets(presets, options = {}) {
    const list = Array.isArray(presets) ? presets : [];
    let registered = 0;
    list.forEach((preset) => {
      const blocks = Array.isArray(preset?.blocos) ? preset.blocos : [];
      blocks.forEach((block) => {
        const def = definitionFromLegacyBlock(block, preset);
        if (!def) return;
        const result = register(def, { source: options.source || LEGACY_SOURCE });
        if (result.ok) registered += 1;
      });
    });
    return { ok: true, presets: list.length, registered };
  }

  function installLegacyPresetAdapter() {
    if (root.__auraBlockRegistryLegacyAdapterInstalled) return;
    root.__auraBlockRegistryLegacyAdapterInstalled = true;

    let backingValue = Array.isArray(root[LEGACY_PRESET_GLOBAL])
      ? root[LEGACY_PRESET_GLOBAL]
      : [];

    Object.defineProperty(root, LEGACY_PRESET_GLOBAL, {
      configurable: true,
      enumerable: true,
      get() {
        return backingValue;
      },
      set(value) {
        backingValue = Array.isArray(value) ? value : [];
        state.legacyPresets = backingValue;
        registerLegacyPresets(backingValue, { source: LEGACY_SOURCE });
      }
    });

    root[LEGACY_PRESET_GLOBAL] = backingValue;
  }

  function legacyPresets() {
    return Array.isArray(state.legacyPresets) ? state.legacyPresets : [];
  }

  function version() {
    return {
      registry: REGISTRY_VERSION,
      legacyLibrary: root[LEGACY_VERSION_GLOBAL] || null,
      definitions: state.definitionsByType.size,
      presets: legacyPresets().length
    };
  }

  const api = Object.freeze({
    version: REGISTRY_VERSION,
    categories: CANONICAL_CATEGORIES,
    register,
    get,
    getById: (id) => state.definitionsById.get(String(id || "").trim()) || null,
    getByType: (type) => get(type),
    has,
    list,
    listByCategory,
    search,
    validateDefinition,
    validateInstance,
    resolveLegacyType,
    migrate,
    getVersion: version,
    getRenderer: rendererFor,
    render,
    registerLegacyPresets,
    legacyPresets,
    installLegacyPresetAdapter,
    warnings: () => state.warnings.slice(),
    _debugSnapshot: () => ({
      ids: [...state.definitionsById.keys()],
      types: [...state.definitionsByType.keys()],
      aliases: [...state.aliases.entries()],
      presets: legacyPresets().length
    })
  });

  root.AuraStudioBlockRegistry = api;
  root.BlockRegistry = api;
  root.AURA_STUDIO_BLOCK_REGISTRY_VERSION = REGISTRY_VERSION;

  systemDefinitions.forEach((definition) => register(definition, { source: SYSTEM_SOURCE }));
  installLegacyPresetAdapter();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
