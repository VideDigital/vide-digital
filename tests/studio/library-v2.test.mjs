import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { performance } from "node:perf_hooks";

const rootDir = path.resolve(import.meta.dirname, "../..");

function createContext(options = {}) {
  const context = {
    console: {
      log() {},
      info() {},
      warn() {},
      error() {}
    },
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    document: {
      readyState: "complete",
      addEventListener() {},
      dispatchEvent() {},
      removeEventListener() {},
      getElementById() { return null; }
    },
    localStorage: options.storage,
    setTimeout,
    clearTimeout,
    requestAnimationFrame(callback) { return setTimeout(callback, 0); },
    cancelAnimationFrame(handle) { clearTimeout(handle); },
    structuredClone
  };
  context.window = context;
  context.globalThis = context;
  context.addEventListener = () => {};
  context.removeEventListener = () => {};
  vm.createContext(context);
  return context;
}

function runScript(context, fileName) {
  const code = fs.readFileSync(path.join(rootDir, fileName), "utf8");
  vm.runInContext(code, context, { filename: fileName });
}

function loadLibraryFoundation(options = {}) {
  const context = createContext(options);
  runScript(context, "studio-block-registry.js");
  if (options.withPresets !== false) {
    runScript(context, "studio-library.js");
    runScript(context, "studio-max-library.js");
    runScript(context, "studio-ultimate-library.js");
    runScript(context, "studio-blocks-v4.js");
  }
  runScript(context, "studio-canonical-renderers-v1.js");
  runScript(context, "studio-library-v2-adapter.js");
  return {
    context,
    registry: context.AuraStudioBlockRegistry,
    renderers: context.AuraStudioCanonicalRenderersV1,
    adapter: context.AuraStudioLibraryV2Adapter
  };
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

test("catalog normalizes the registry and all active legacy libraries", () => {
  const { context, registry, adapter } = loadLibraryFoundation();
  const catalog = adapter.createCatalog({
    registry,
    presets: context.AURA_STUDIO_PRESETS
  });

  assert.equal(catalog.registryAvailable, true);
  assert.equal(catalog.stats.canonical, 16);
  assert.ok(catalog.stats.legacy >= 1100);
  assert.ok(catalog.stats.total >= 1116);
  assert.ok(catalog.categories.includes("Páginas completas"));
  assert.ok(catalog.items.some((item) => item.source === "pro"));
  assert.ok(catalog.items.some((item) => item.source === "max"));
  assert.ok(catalog.items.some((item) => item.source === "ultimate"));
  assert.ok(catalog.items.some((item) => item.source === "v4"));
  assert.ok(catalog.items.every((item) => item.key && item.searchableText));
});

test("catalog remains functional when the Block Registry is unavailable", () => {
  const { adapter } = loadLibraryFoundation({ withPresets: false });
  const presets = [{
    id: "legacy-only",
    nome: "Hero legado",
    categoria: "Hero",
    blocos: [{ tipo: "texto_midia", props: {}, design: {} }]
  }];
  const catalog = adapter.createCatalog({ registry: null, presets });

  assert.equal(catalog.registryAvailable, false);
  assert.equal(catalog.stats.total, 1);
  assert.equal(catalog.items[0].insertPayload.strategy, "preset");
});

test("deduplication merges exact source identities and preserves same ids from different sources", () => {
  const { adapter } = loadLibraryFoundation({ withPresets: false });
  const shared = {
    id: "same-id",
    nome: "Mesmo preset",
    categoria: "Hero",
    blocos: [{ tipo: "texto_midia", props: {}, design: {} }]
  };
  const catalog = adapter.createCatalog({
    presets: [
      { ...shared, source: "max", tags: ["primeiro"] },
      { ...shared, source: "max", tags: ["segundo"] },
      { ...shared, source: "v4", tags: ["terceiro"] }
    ]
  });

  assert.equal(catalog.stats.total, 2);
  const max = catalog.items.find((item) => item.source === "max");
  assert.deepEqual([...max.tags].sort(), ["primeiro", "segundo", "texto_midia"].sort());
  assert.ok(catalog.items.some((item) => item.key === "preset:v4:same-id"));
});

test("instant search is accent-insensitive, partial and relevance ordered", () => {
  const { adapter } = loadLibraryFoundation({ withPresets: false });
  const catalog = adapter.createCatalog({
    presets: [
      { id: "generic", nome: "Oferta comum", categoria: "Conversão", tags: ["promoção"], blocos: [{ tipo: "texto_midia" }] },
      { id: "promotion", nome: "Promoção relâmpago", categoria: "Conversão", tags: ["venda"], blocos: [{ tipo: "texto_midia" }] },
      { id: "faq", nome: "Perguntas", categoria: "FAQ", tags: ["dúvidas"], blocos: [{ tipo: "faq" }] }
    ]
  });

  const promotion = adapter.filterCatalog(catalog.items, { query: "promocao", filter: "all" });
  assert.equal(promotion.length, 2);
  assert.equal(promotion[0].id, "promotion");
  assert.equal(adapter.filterCatalog(catalog.items, { query: "duvid", filter: "all" })[0].id, "faq");
  assert.equal(adapter.filterCatalog(catalog.items, { query: "relamp", filter: "all" })[0].id, "promotion");
});

test("filters combine category, source, favorites, recents, experimental and mobile", () => {
  const { context, registry, adapter } = loadLibraryFoundation();
  const catalog = adapter.createCatalog({ registry, presets: context.AURA_STUDIO_PRESETS });
  const canonical = catalog.items.find((item) => item.kind === "canonical" && item.mobileCompatible);
  const legacy = catalog.items.find((item) => item.kind === "preset" && item.category === "Hero");
  const experimental = catalog.items.find((item) => item.experimental);

  assert.ok(adapter.filterCatalog(catalog.items, { filter: "canonical" }).every((item) => item.kind === "canonical"));
  assert.ok(adapter.filterCatalog(catalog.items, { filter: "legacy" }).every((item) => item.kind === "preset"));
  assert.deepEqual([...adapter.filterCatalog(catalog.items, { filter: "favorites", favorites: [canonical.key] })].map((item) => item.key), [canonical.key]);
  assert.deepEqual([...adapter.filterCatalog(catalog.items, { filter: "recent", recents: [legacy.key, canonical.key] }).slice(0, 2)].map((item) => item.key), [legacy.key, canonical.key]);
  assert.ok(adapter.filterCatalog(catalog.items, { filter: "experimental" }).some((item) => item.key === experimental.key));
  assert.ok(adapter.filterCatalog(catalog.items, { filter: "mobile", category: "Hero" }).every((item) => item.mobileCompatible && item.category === "Hero"));
});

test("favorites and recents persist with namespaced keys", () => {
  const storage = memoryStorage();
  const { adapter } = loadLibraryFoundation({ withPresets: false, storage });
  const first = adapter.createPreferenceStore(storage);
  first.toggleFavorite("preset:max:same-id");
  first.toggleFavorite("preset:v4:same-id");
  first.recordRecent("canonical:block.faq", 20);
  first.recordRecent("preset:max:same-id", 20);
  first.recordRecent("canonical:block.faq", 20);

  const second = adapter.createPreferenceStore(storage);
  assert.deepEqual([...second.favorites()], ["preset:v4:same-id", "preset:max:same-id"]);
  assert.deepEqual([...second.recents()], ["canonical:block.faq", "preset:max:same-id"]);
  assert.notEqual(second.keys.favorites, second.keys.recents);
  second.clearRecents();
  assert.deepEqual([...second.recents()], []);
});

test("blocked localStorage falls back to an in-memory session", () => {
  const unavailable = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); }
  };
  const { adapter } = loadLibraryFoundation({ withPresets: false, storage: unavailable });
  const preferences = adapter.createPreferenceStore(unavailable);

  assert.doesNotThrow(() => preferences.toggleFavorite("canonical:block.faq"));
  assert.equal(preferences.isFavorite("canonical:block.faq"), true);
  assert.deepEqual([...preferences.recordRecent("canonical:block.faq", 12)], ["canonical:block.faq"]);
});

test("preview uses trusted canonical functions and never executes iframe or preset HTML", () => {
  const { registry, adapter } = loadLibraryFoundation({ withPresets: false });
  const catalog = adapter.createCatalog({ registry, presets: [] });
  const hero = catalog.items.find((item) => item.type === "texto_midia");
  hero.insertPayload.blocks[0].props.titulo = '<script>alert("x")</script>';
  const heroPreview = adapter.createPreview(hero, { registry });

  assert.equal(heroPreview.kind, "trusted-html");
  assert.ok(heroPreview.html.includes("&lt;script&gt;"));
  assert.equal(adapter.containsUnsafeMarkup(heroPreview.html), false);

  const iframe = catalog.items.find((item) => item.type === "codigo_iframe");
  const iframePreview = adapter.createPreview(iframe, { registry });
  assert.equal(iframePreview.kind, "blocked");
  assert.equal(Object.hasOwn(iframePreview, "html"), false);

  const legacy = adapter.createCatalog({ presets: [{
    id: "unsafe-preview",
    nome: "HTML externo",
    categoria: "Avançados",
    preview: "<script>alert(1)</script>",
    blocos: [{ tipo: "texto_midia" }]
  }] }).items[0];
  const legacyPreview = adapter.createPreview(legacy);
  assert.equal(legacyPreview.kind, "static");
  assert.equal(Object.hasOwn(legacyPreview, "html"), false);
});

test("legacy insertion uses the current Studio mechanism and records recents", async () => {
  const { adapter } = loadLibraryFoundation({ withPresets: false });
  const item = adapter.createCatalog({ presets: [{
    id: "legacy-insert-test",
    nome: "Preset",
    categoria: "Hero",
    blocos: [{ tipo: "texto_midia" }]
  }] }).items[0];
  const calls = [];
  const recent = [];
  const result = await adapter.insertLibraryItem(item, {
    studio: { insertPreset(id) { calls.push(id); } },
    preferences: { recordRecent(key) { recent.push(key); } },
    now: () => 10_000
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["legacy-insert-test"]);
  assert.deepEqual(recent, [item.key]);
});

test("canonical insertion adapts defaults through a temporary legacy preset", async () => {
  const { registry, adapter } = loadLibraryFoundation({ withPresets: false });
  const item = adapter.createCatalog({ registry, presets: [] }).items.find((entry) => entry.type === "faq");
  const presets = [];
  let observed;
  const result = await adapter.insertLibraryItem(item, {
    presets,
    studio: {
      insertPreset(id) {
        observed = presets.find((preset) => preset.id === id);
        assert.ok(observed);
        assert.equal(observed.blocos[0].tipo, "faq");
      }
    },
    now: () => 20_000
  });

  assert.equal(result.ok, true);
  assert.equal(observed.nome, item.title);
  assert.equal(presets.length, 0);
});

test("insertion blocks rapid duplicates and cleans temporary presets on error", async () => {
  const { registry, adapter } = loadLibraryFoundation({ withPresets: false });
  const legacy = adapter.createCatalog({ presets: [{
    id: "double-click-test",
    nome: "Clique",
    categoria: "Hero",
    blocos: [{ tipo: "texto_midia" }]
  }] }).items[0];
  let calls = 0;
  const dependencies = {
    studio: { insertPreset() { calls += 1; } },
    now: () => 30_000
  };
  assert.equal((await adapter.insertLibraryItem(legacy, dependencies)).ok, true);
  const duplicate = await adapter.insertLibraryItem(legacy, dependencies);
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.reason, "duplicate-insert");
  assert.equal(calls, 1);

  const canonical = adapter.createCatalog({ registry, presets: [] }).items.find((item) => item.type === "rodape");
  const presets = [];
  const failed = await adapter.insertLibraryItem(canonical, {
    presets,
    studio: { insertPreset() { throw new Error("test failure"); } },
    now: () => 40_000
  });
  assert.equal(failed.reason, "insertion-error");
  assert.equal(presets.length, 0);
});

test("the six selected canonical blocks have real renderers, defaults, schema and previews", () => {
  const { registry, renderers } = loadLibraryFoundation({ withPresets: false });
  const expected = ["texto_midia", "faq", "lista_cards", "galeria_imagens", "formulario_captura", "rodape"];
  assert.deepEqual([...renderers.types].sort(), expected.sort());

  for (const type of expected) {
    const definition = registry.get(type);
    assert.equal(typeof definition.renderer, "function", type);
    assert.equal(typeof definition.previewRenderer, "function", type);
    assert.equal(typeof definition.defaults, "object", type);
    assert.equal(typeof definition.schema, "object", type);
    const html = registry.render(definition.defaults, { preview: true });
    assert.equal(typeof html, "string", type);
    assert.ok(html.includes(`data-aura-block-type="${type}"`), type);
    assert.equal(/<script|<iframe|\son[a-z]+\s*=/i.test(html), false, type);
  }
});

test("canonical renderer failure falls back to the legacy renderer", () => {
  const { registry } = loadLibraryFoundation({ withPresets: false });
  const current = registry.get("faq");
  const replaced = registry.register({
    ...current,
    renderer() { throw new Error("renderer failed"); }
  }, { replace: true, source: "test" });
  assert.equal(replaced.ok, true);
  assert.equal(registry.render({ tipo: "faq", props: {} }, {}, () => "<section>legacy</section>"), "<section>legacy</section>");
  assert.ok(registry.warnings().some((warning) => warning.code === "renderer-failed"));
});

test("keyboard escape resolves internal surfaces before the library and flag is strict", () => {
  const { adapter } = loadLibraryFoundation({ withPresets: false });
  assert.equal(adapter.resolveEscapeAction({ previewOpen: true, filtersOpen: true, libraryOpen: true }), "close-preview");
  assert.equal(adapter.resolveEscapeAction({ filtersOpen: true, libraryOpen: true }), "close-filters");
  assert.equal(adapter.resolveEscapeAction({ libraryOpen: true }), "close-library");
  assert.equal(adapter.resolveEscapeAction({}), "none");
  assert.equal(adapter.isFeatureEnabled({}), false);
  assert.equal(adapter.isFeatureEnabled({ AURA_STUDIO_LIBRARY_V2_ENABLED: false }), false);
  assert.equal(adapter.isFeatureEnabled({ AURA_STUDIO_LIBRARY_V2_ENABLED: true }), true);
});

test("catalog filtering stays bounded with the full preset set and pagination limits DOM work", () => {
  const { context, registry, adapter } = loadLibraryFoundation();
  const start = performance.now();
  const catalog = adapter.createCatalog({ registry, presets: context.AURA_STUDIO_PRESETS });
  const results = adapter.filterCatalog(catalog.items, { query: "produto", filter: "all" });
  const elapsed = performance.now() - start;
  const firstPage = adapter.paginate(results, 1, 48);

  assert.ok(results.length > 0);
  assert.ok(elapsed < 1000, `catalog operations took ${elapsed.toFixed(1)}ms`);
  assert.ok(firstPage.items.length <= 48);
  assert.equal(firstPage.pageSize, 48);
});

test("Library V2 source does not use dynamic code execution", () => {
  const files = [
    "studio-library-v2-adapter.js",
    "studio-canonical-renderers-v1.js",
    "studio-library-v2.js"
  ];
  for (const file of files) {
    const source = fs.readFileSync(path.join(rootDir, file), "utf8");
    assert.equal(/\beval\s*\(/.test(source), false, file);
    assert.equal(/new\s+Function\s*\(/.test(source), false, file);
  }
});
