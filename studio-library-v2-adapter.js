(function (root) {
  "use strict";

  const VERSION = "2.0.0";
  const FAVORITES_KEY = "auraStudioLibraryV2:favorites:v1";
  const RECENTS_KEY = "auraStudioLibraryV2:recents:v1";
  const INSERT_COOLDOWN_MS = 650;

  const CATEGORY_ORDER = Object.freeze([
    "Essenciais",
    "Texto",
    "Mídia",
    "Hero",
    "Conteúdo",
    "Produtos",
    "Conversão",
    "Formulários",
    "Social",
    "Prova social",
    "Galerias",
    "Navegação",
    "Layout",
    "Comparativos",
    "FAQ",
    "Rodapés",
    "Seções completas",
    "Páginas completas",
    "Avançados",
    "Legados",
    "Experimentais"
  ]);

  const CATEGORY_ALIASES = Object.freeze({
    estrutura: "Layout",
    cabecalhos: "Navegação",
    navegacao: "Navegação",
    imagens: "Mídia",
    videos: "Mídia",
    depoimentos: "Prova social",
    avaliacoes: "Prova social",
    comparacoes: "Comparativos",
    rodapes: "Rodapés",
    codigo: "Avançados",
    integracoes: "Avançados",
    utilidades: "Essenciais",
    "paginas v4": "Páginas completas",
    "paginas completas": "Páginas completas",
    "secoes v4": "Seções completas",
    "secoes completas": "Seções completas"
  });

  const SOURCE_LABELS = Object.freeze({
    canonical: "Canônico",
    personal: "Meu bloco",
    max: "MAX",
    ultimate: "Ultimate",
    v4: "V4",
    pro: "Pro",
    legacy: "Legado"
  });

  const insertionState = {
    busy: new Set(),
    lastAttempt: new Map()
  };

  function normalizeText(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function compactText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function unique(values) {
    const seen = new Set();
    const result = [];
    (values || []).forEach((value) => {
      const clean = compactText(value);
      const key = normalizeText(clean);
      if (!clean || seen.has(key)) return;
      seen.add(key);
      result.push(clean);
    });
    return result;
  }

  function clone(value) {
    if (value === undefined) return undefined;
    if (typeof structuredClone === "function") {
      try {
        return structuredClone(value);
      } catch (_) {
        // Definitions with functions intentionally fall through to data cloning.
      }
    }
    return JSON.parse(JSON.stringify(value));
  }

  function hashText(value) {
    let hash = 2166136261;
    const text = String(value || "");
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function friendlyCategory(value, fallback) {
    const raw = compactText(value || fallback || "Legados");
    const normalized = normalizeText(raw);
    if (CATEGORY_ALIASES[normalized]) return CATEGORY_ALIASES[normalized];
    if (/^pagina/.test(normalized)) return "Páginas completas";
    if (/^secao/.test(normalized)) return "Seções completas";
    if (/form/.test(normalized)) return "Formulários";
    if (/convers|captura|lead|oferta|venda/.test(normalized)) return "Conversão";
    if (/produto|catalogo|e commerce/.test(normalized)) return "Produtos";
    if (/galeria|portfolio/.test(normalized)) return "Galerias";
    if (/social|depoimento|avaliacao|prova/.test(normalized)) return "Prova social";
    if (/rodape|footer/.test(normalized)) return "Rodapés";
    if (/faq|pergunta/.test(normalized)) return "FAQ";
    if (/nav|menu|cabecalho/.test(normalized)) return "Navegação";
    if (/hero|banner/.test(normalized)) return "Hero";
    if (/texto|artigo/.test(normalized)) return "Texto";
    if (/imagem|video|audio|midia/.test(normalized)) return "Mídia";
    if (/layout|estrutura|container|grid/.test(normalized)) return "Layout";
    return raw || "Legados";
  }

  function sourceFromPreset(preset, personal) {
    if (personal || preset?.tipo === "pessoal" || preset?.source === "personal") return "personal";
    const explicit = normalizeText(preset?.source || preset?.origem);
    const id = normalizeText(preset?.id);
    if (explicit.includes("ultimate") || id.startsWith("ultimate ")) return "ultimate";
    if (explicit === "max" || id.startsWith("max ")) return "max";
    if (explicit === "v4" || id.startsWith("v4 ")) return "v4";
    if (explicit === "pro" || id.startsWith("pro ")) return "pro";
    // Os presets-base são a biblioteca Pro original. Eles continuam sendo
    // itens legados para inserção, mas ganham origem visual específica.
    return explicit === "legacy" ? "legacy" : "pro";
  }

  function safeThumbnail(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw;
    if (/^(?:\.\.\/|\.\/|\/)[^\s]+$/i.test(raw)) return raw;
    if (/^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(raw)) return raw;
    return "";
  }

  function definitionForType(registry, type) {
    if (!registry || typeof registry.get !== "function") return null;
    try {
      return registry.get(type) || null;
    } catch (_) {
      return null;
    }
  }

  function searchableText(item) {
    return normalizeText([
      item.title,
      item.description,
      item.category,
      item.subcategory,
      item.type,
      item.source,
      item.sourceLabel,
      ...(item.tags || []),
      ...(item.aliases || [])
    ].join(" "));
  }

  function canonicalItem(definition, registry) {
    const liveDefinition = definitionForType(registry, definition.type) || definition;
    const capabilities = liveDefinition.capabilities || {};
    const unsafe = capabilities.unsafeContent === true || liveDefinition.type === "codigo_iframe";
    const defaults = clone(liveDefinition.defaults || {
      tipo: liveDefinition.type,
      props: {},
      design: {}
    });
    const id = compactText(liveDefinition.id || `block.${liveDefinition.type}`);
    const item = {
      key: `canonical:${id}`,
      id,
      canonicalId: id,
      type: compactText(liveDefinition.type),
      kind: "canonical",
      source: "canonical",
      sourceLabel: SOURCE_LABELS.canonical,
      sourceRefs: ["registry"],
      title: compactText(liveDefinition.name || liveDefinition.title || liveDefinition.type || "Bloco"),
      description: compactText(liveDefinition.description || "Bloco do sistema."),
      category: friendlyCategory(liveDefinition.category, "Essenciais"),
      originalCategory: compactText(liveDefinition.category),
      subcategory: compactText(liveDefinition.subcategory),
      tags: unique([...(liveDefinition.keywords || []), ...(liveDefinition.tags || [])]),
      aliases: unique(liveDefinition.aliases || []),
      icon: compactText(liveDefinition.icon || "layout-template"),
      thumbnail: safeThumbnail(liveDefinition.thumbnail),
      preview: liveDefinition.preview || "",
      version: Number(liveDefinition.version || 1),
      capabilities: { ...capabilities },
      schema: clone(liveDefinition.schema || {}),
      experimental: liveDefinition.experimental === true,
      deprecated: liveDefinition.deprecated === true,
      unsafe,
      mobileCompatible: capabilities.responsive !== false && !unsafe,
      invalid: !liveDefinition.type || !defaults,
      insertPayload: {
        strategy: "canonical",
        blocks: [defaults]
      }
    };
    item.searchableText = searchableText(item);
    return item;
  }

  function presetSignature(preset) {
    const blocks = Array.isArray(preset?.blocos) ? preset.blocos : [];
    const shape = blocks.map((block) => [
      compactText(block?.tipo || block?.type),
      Object.keys(block?.props || {}).sort().join(",")
    ]);
    return hashText(JSON.stringify([
      normalizeText(preset?.nome),
      normalizeText(preset?.categoria),
      shape
    ]));
  }

  function presetItem(preset, registry, personal) {
    const source = sourceFromPreset(preset, personal);
    const blocks = Array.isArray(preset?.blocos) ? preset.blocos : [];
    const types = unique(blocks.map((block) => block?.tipo || block?.type));
    const definitions = types.map((type) => definitionForType(registry, type)).filter(Boolean);
    const explicitId = compactText(preset?.id);
    const stableId = explicitId || `anonymous-${presetSignature(preset)}`;
    const unsafe = definitions.some((definition) => definition.capabilities?.unsafeContent === true)
      || types.includes("codigo_iframe");
    const category = friendlyCategory(preset?.categoria || definitions[0]?.category, "Legados");
    const title = compactText(preset?.nome || preset?.title || stableId || "Preset legado");
    const objective = compactText(preset?.objetivo || preset?.description);
    const item = {
      key: `preset:${source}:${stableId}`,
      id: stableId,
      legacyPresetId: explicitId,
      type: compactText(preset?.tipo || types[0] || "preset"),
      blockTypes: types,
      kind: "preset",
      source,
      sourceLabel: SOURCE_LABELS[source] || SOURCE_LABELS.legacy,
      sourceRefs: [source],
      title,
      description: objective || `${blocks.length} bloco${blocks.length === 1 ? "" : "s"} pronto${blocks.length === 1 ? "" : "s"} para personalizar.`,
      category,
      originalCategory: compactText(preset?.categoria),
      subcategory: compactText(preset?.subcategoria || preset?.nicho),
      tags: unique([
        ...(preset?.tags || []),
        preset?.objetivo,
        preset?.nicho,
        ...types,
        ...definitions.flatMap((definition) => definition.keywords || [])
      ]),
      aliases: unique(definitions.flatMap((definition) => definition.aliases || [])),
      icon: compactText(preset?.icon || definitions[0]?.icon || "layout-template"),
      thumbnail: safeThumbnail(preset?.thumbnail || preset?.miniaturaUrl || preset?.previewUrl),
      preview: typeof preset?.preview === "string" ? compactText(preset.preview).slice(0, 240) : "",
      version: Number(preset?.version || 1),
      capabilities: { responsive: !unsafe },
      schema: {},
      experimental: preset?.experimental === true || definitions.some((definition) => definition.experimental === true),
      deprecated: preset?.deprecated === true,
      unsafe,
      mobileCompatible: preset?.mobileCompatible !== false && !unsafe,
      invalid: !explicitId || !blocks.length,
      blockCount: blocks.length,
      insertPayload: {
        strategy: "preset",
        presetId: explicitId
      }
    };
    item.searchableText = searchableText(item);
    return item;
  }

  function mergeDuplicate(current, candidate) {
    const preferred = current.kind === "canonical" || candidate.kind !== "canonical" ? current : candidate;
    const secondary = preferred === current ? candidate : current;
    return {
      ...preferred,
      sourceRefs: unique([...(preferred.sourceRefs || []), ...(secondary.sourceRefs || [])]),
      tags: unique([...(preferred.tags || []), ...(secondary.tags || [])]),
      aliases: unique([...(preferred.aliases || []), ...(secondary.aliases || [])]),
      searchableText: normalizeText(`${preferred.searchableText} ${secondary.searchableText}`)
    };
  }

  function deduplicate(items) {
    const byKey = new Map();
    const warnings = [];
    (items || []).forEach((item) => {
      if (!item?.key) return;
      if (!byKey.has(item.key)) {
        byKey.set(item.key, item);
        return;
      }
      byKey.set(item.key, mergeDuplicate(byKey.get(item.key), item));
      warnings.push({ code: "duplicate-item", key: item.key });
    });
    return { items: [...byKey.values()], warnings };
  }

  function categorySort(a, b) {
    const first = CATEGORY_ORDER.indexOf(a);
    const second = CATEGORY_ORDER.indexOf(b);
    if (first !== -1 || second !== -1) {
      return (first === -1 ? 999 : first) - (second === -1 ? 999 : second);
    }
    return a.localeCompare(b, "pt-BR");
  }

  function createCatalog(options = {}) {
    const registry = options.registry || null;
    const presets = Array.isArray(options.presets) ? options.presets : [];
    const personalPresets = Array.isArray(options.personalPresets) ? options.personalPresets : [];
    const rawItems = [];
    const warnings = [];
    let registryAvailable = false;

    if (registry && typeof registry.list === "function") {
      try {
        const definitions = registry.list({ includeDeprecated: true });
        definitions.forEach((definition) => rawItems.push(canonicalItem(definition, registry)));
        registryAvailable = true;
      } catch (error) {
        warnings.push({ code: "registry-unavailable", message: error?.message || "Registry indisponível." });
      }
    }

    presets.forEach((preset) => rawItems.push(presetItem(preset, registry, false)));
    personalPresets.forEach((preset) => rawItems.push(presetItem(preset, registry, true)));

    const deduped = deduplicate(rawItems);
    warnings.push(...deduped.warnings);
    const items = deduped.items
      .filter((item) => item.deprecated !== true)
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "canonical" ? -1 : 1;
        const categoryDifference = categorySort(a.category, b.category);
        return categoryDifference || a.title.localeCompare(b.title, "pt-BR");
      });
    const categories = [...new Set(items.map((item) => item.category).filter(Boolean))].sort(categorySort);

    return {
      version: VERSION,
      registryAvailable,
      items,
      categories,
      warnings,
      stats: {
        total: items.length,
        canonical: items.filter((item) => item.kind === "canonical").length,
        legacy: items.filter((item) => item.kind === "preset").length,
        invalid: items.filter((item) => item.invalid).length
      }
    };
  }

  function scoreItem(item, terms) {
    let score = 0;
    const title = normalizeText(item.title);
    const type = normalizeText(item.type);
    const category = normalizeText(item.category);
    const tags = normalizeText((item.tags || []).join(" "));
    const aliases = normalizeText((item.aliases || []).join(" "));
    const description = normalizeText(item.description);
    for (const term of terms) {
      if (!item.searchableText.includes(term)) return 0;
      if (title === term) score += 40;
      else if (title.startsWith(term)) score += 24;
      else if (title.includes(term)) score += 18;
      if (type === term || aliases.split(" ").includes(term)) score += 14;
      if (tags.includes(term)) score += 9;
      if (category.includes(term)) score += 7;
      if (description.includes(term)) score += 4;
    }
    return score || 1;
  }

  function filterCatalog(items, options = {}) {
    const query = normalizeText(options.query);
    const terms = query.split(/\s+/).filter(Boolean);
    const favorites = options.favorites instanceof Set
      ? options.favorites
      : new Set(options.favorites || []);
    const recents = Array.isArray(options.recents) ? options.recents : [];
    const recentOrder = new Map(recents.map((key, index) => [key, index]));
    const category = options.category || "Todos";
    const filter = options.filter || "all";

    const results = [];
    (items || []).forEach((item) => {
      if (category !== "Todos" && item.category !== category) return;
      if (filter === "system" && item.source === "personal") return;
      if (filter === "canonical" && item.kind !== "canonical") return;
      if (filter === "legacy" && item.kind !== "preset") return;
      if (filter === "favorites" && !favorites.has(item.key)) return;
      if (filter === "recent" && !recentOrder.has(item.key)) return;
      if (filter === "experimental" && item.experimental !== true) return;
      if (filter === "mobile" && item.mobileCompatible !== true) return;
      const score = terms.length ? scoreItem(item, terms) : 0;
      if (terms.length && score === 0) return;
      results.push({ item, score });
    });

    results.sort((a, b) => {
      if (filter === "recent") {
        return (recentOrder.get(a.item.key) ?? 9999) - (recentOrder.get(b.item.key) ?? 9999);
      }
      if (terms.length && a.score !== b.score) return b.score - a.score;
      if (a.item.kind !== b.item.kind) return a.item.kind === "canonical" ? -1 : 1;
      return a.item.title.localeCompare(b.item.title, "pt-BR");
    });
    return results.map((entry) => entry.item);
  }

  function paginate(items, page, pageSize) {
    const safeSize = Math.max(1, Math.min(100, Number(pageSize) || 48));
    const safePage = Math.max(1, Number(page) || 1);
    const visible = (items || []).slice(0, safePage * safeSize);
    return {
      items: visible,
      page: safePage,
      pageSize: safeSize,
      total: (items || []).length,
      hasMore: visible.length < (items || []).length
    };
  }

  function suggestCategories(items, query, limit) {
    const terms = normalizeText(query).split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    const counts = new Map();
    (items || []).forEach((item) => {
      const score = terms.reduce((total, term) => total + (item.searchableText.includes(term) ? 1 : 0), 0);
      if (score) counts.set(item.category, (counts.get(item.category) || 0) + score);
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || categorySort(a[0], b[0]))
      .slice(0, Math.max(1, Number(limit) || 3))
      .map(([category]) => category);
  }

  function createPreferenceStore(storage) {
    let backend = storage;
    if (backend === undefined) {
      try {
        backend = root.localStorage;
      } catch (_) {
        backend = null;
      }
    }
    const memory = new Map();

    function read(key) {
      let raw = memory.get(key) || "[]";
      try {
        const stored = backend?.getItem?.(key);
        if (stored !== null && stored !== undefined) raw = stored;
      } catch (_) {
        // Private mode and blocked storage use the in-memory copy.
      }
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? unique(parsed).slice(0, 300) : [];
      } catch (_) {
        return [];
      }
    }

    function write(key, values, limit) {
      const clean = unique(values).slice(0, limit || 300);
      const serialized = JSON.stringify(clean);
      memory.set(key, serialized);
      try {
        backend?.setItem?.(key, serialized);
      } catch (_) {
        // The current session remains functional in memory.
      }
      return clean;
    }

    return Object.freeze({
      favorites: () => read(FAVORITES_KEY),
      recents: () => read(RECENTS_KEY),
      isFavorite: (key) => read(FAVORITES_KEY).includes(String(key || "")),
      toggleFavorite(key) {
        const value = String(key || "").trim();
        if (!value) return read(FAVORITES_KEY);
        const favorites = read(FAVORITES_KEY).filter((item) => item !== value);
        if (favorites.length === read(FAVORITES_KEY).length) favorites.unshift(value);
        return write(FAVORITES_KEY, favorites, 300);
      },
      recordRecent(key, limit) {
        const value = String(key || "").trim();
        if (!value) return read(RECENTS_KEY);
        const recents = read(RECENTS_KEY).filter((item) => item !== value);
        recents.unshift(value);
        return write(RECENTS_KEY, recents, Math.max(1, Number(limit) || 20));
      },
      clearRecents: () => write(RECENTS_KEY, [], 20),
      keys: Object.freeze({ favorites: FAVORITES_KEY, recents: RECENTS_KEY })
    });
  }

  function containsUnsafeMarkup(value) {
    const html = String(value || "");
    return /<(?:script|iframe|object|embed|link|meta)\b/i.test(html)
      || /\son[a-z]+\s*=/i.test(html)
      || /(?:javascript|vbscript)\s*:/i.test(html)
      || /\bsrcdoc\s*=/i.test(html);
  }

  function createPreview(item, options = {}) {
    if (!item || item.unsafe || item.type === "codigo_iframe" || item.blockTypes?.includes("codigo_iframe")) {
      return {
        kind: "blocked",
        title: "Preview protegido",
        message: "Conteúdo de código ou iframe não é executado na biblioteca."
      };
    }

    const registry = options.registry;
    if (item.kind === "canonical" && registry && typeof registry.get === "function") {
      const definition = definitionForType(registry, item.type);
      const previewRenderer = definition?.previewRenderer;
      const renderer = definition?.renderer;
      const block = clone(item.insertPayload?.blocks?.[0] || definition?.defaults || {});
      const candidate = typeof previewRenderer === "function"
        ? previewRenderer
        : typeof renderer === "function" ? renderer : null;
      if (candidate) {
        try {
          const html = candidate(block, { mode: "library-preview", preview: true });
          if (typeof html === "string" && html.trim() && !containsUnsafeMarkup(html)) {
            return { kind: "trusted-html", html };
          }
        } catch (error) {
          return { kind: "error", message: error?.message || "Não foi possível gerar o preview." };
        }
      }
    }

    if (item.thumbnail) return { kind: "image", src: item.thumbnail, alt: item.title };
    if (item.preview) return { kind: "static", label: compactText(item.preview).slice(0, 160) };
    return { kind: "placeholder", category: item.category, icon: item.icon };
  }

  async function insertLibraryItem(item, dependencies = {}) {
    const key = String(item?.key || "").trim();
    const now = typeof dependencies.now === "function" ? Number(dependencies.now()) : Date.now();
    if (!item || !key || item.invalid || !item.insertPayload) {
      return { ok: false, reason: "invalid-item", error: new Error("Item inválido para inserção.") };
    }
    if (insertionState.busy.has(key) || now - (insertionState.lastAttempt.get(key) || 0) < INSERT_COOLDOWN_MS) {
      return { ok: false, reason: "duplicate-insert" };
    }

    const studio = dependencies.studio || root.AuraStudioPro;
    if (!studio || typeof studio.insertPreset !== "function") {
      return { ok: false, reason: "insertion-unavailable", error: new Error("Mecanismo de inserção indisponível.") };
    }

    insertionState.busy.add(key);
    insertionState.lastAttempt.set(key, now);
    try {
      if (item.insertPayload.strategy === "preset") {
        const presetId = item.insertPayload.presetId || item.legacyPresetId;
        if (!presetId) throw new Error("Preset sem identificador estável.");
        await studio.insertPreset.call(studio, presetId);
      } else if (item.insertPayload.strategy === "canonical") {
        const presets = Array.isArray(dependencies.presets)
          ? dependencies.presets
          : Array.isArray(root.AURA_STUDIO_PRESETS) ? root.AURA_STUDIO_PRESETS : null;
        if (!presets) throw new Error("Catálogo legado indisponível para o adaptador canônico.");
        const temporaryPreset = {
          id: `__aura_library_v2_${hashText(`${key}:${now}`)}`,
          nome: item.title,
          categoria: item.category,
          tipo: "secao",
          objetivo: "Inserção canônica",
          tags: ["canônico", item.type],
          blocos: clone(item.insertPayload.blocks || [])
        };
        presets.push(temporaryPreset);
        try {
          await studio.insertPreset.call(studio, temporaryPreset.id);
        } finally {
          const index = presets.indexOf(temporaryPreset);
          if (index >= 0) presets.splice(index, 1);
        }
      } else {
        throw new Error(`Estratégia de inserção desconhecida: ${item.insertPayload.strategy}.`);
      }

      dependencies.preferences?.recordRecent?.(key, 20);
      return { ok: true, item };
    } catch (error) {
      insertionState.lastAttempt.delete(key);
      return { ok: false, reason: "insertion-error", error };
    } finally {
      insertionState.busy.delete(key);
    }
  }

  function resolveEscapeAction(state) {
    if (state?.previewOpen) return "close-preview";
    if (state?.filtersOpen) return "close-filters";
    if (state?.libraryOpen) return "close-library";
    return "none";
  }

  function isFeatureEnabled(scope) {
    return scope?.AURA_STUDIO_LIBRARY_V2_ENABLED === true;
  }

  const api = Object.freeze({
    version: VERSION,
    categories: CATEGORY_ORDER,
    sourceLabels: SOURCE_LABELS,
    normalizeText,
    friendlyCategory,
    safeThumbnail,
    createCatalog,
    filterCatalog,
    paginate,
    suggestCategories,
    createPreferenceStore,
    createPreview,
    containsUnsafeMarkup,
    insertLibraryItem,
    resolveEscapeAction,
    isFeatureEnabled
  });

  root.AuraStudioLibraryV2Adapter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
