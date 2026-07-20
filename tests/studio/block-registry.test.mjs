import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const rootDir = path.resolve(import.meta.dirname, "../..");
const registryPath = path.join(rootDir, "studio-block-registry.js");

function createBrowserContext() {
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
      addEventListener() {},
      dispatchEvent() {},
      removeEventListener() {}
    },
    setTimeout,
    clearTimeout,
    structuredClone
  };

  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  return context;
}

function runScript(context, fileName) {
  const code = fs.readFileSync(path.join(rootDir, fileName), "utf8");
  vm.runInContext(code, context, { filename: fileName });
}

function loadRegistry() {
  const context = createBrowserContext();
  const code = fs.readFileSync(registryPath, "utf8");
  vm.runInContext(code, context, { filename: "studio-block-registry.js" });
  return { context, registry: context.AuraStudioBlockRegistry };
}

test("registry exposes canonical known block definitions", () => {
  const { registry } = loadRegistry();

  assert.equal(registry.version, "1.0.0");
  assert.equal(registry.has("texto_midia"), true);
  assert.equal(registry.has("block.text-media"), true);
  assert.equal(registry.getByType("formulario_captura").id, "block.capture-form");
  assert.equal(registry.getById("block.faq").type, "faq");
});

test("registry rejects duplicate canonical types without replacing existing entries", () => {
  const { registry } = loadRegistry();

  const result = registry.register({
    id: "block.duplicate-text-media",
    type: "texto_midia",
    version: 1,
    name: "Duplicado",
    category: "Texto"
  });

  assert.equal(result.ok, false);
  assert.equal(registry.getByType("texto_midia").id, "block.text-media");
});

test("aliases, categories and search resolve legacy vocabulary", () => {
  const { registry } = loadRegistry();

  assert.equal(registry.resolveLegacyType("banner"), "texto_midia");
  assert.ok(registry.listByCategory("Produtos").some((definition) => definition.type === "carrossel_produtos"));
  assert.ok(registry.search("formulario").some((definition) => definition.type === "formulario_captura"));
  assert.ok(registry.search("produto").some((definition) => definition.type === "carrossel_produtos"));
});

test("definition and instance validation isolate invalid blocks", () => {
  const { registry } = loadRegistry();

  const invalid = registry.validateDefinition({ id: "", type: "", version: 0 });
  assert.equal(invalid.valid, false);

  const registerResult = registry.register({ id: "", type: "", version: 0 });
  assert.equal(registerResult.ok, false);
  assert.equal(registry.has("faq"), true);

  const validInstance = registry.validateInstance({ tipo: "faq", props: { titulo: "Perguntas" } });
  assert.equal(validInstance.valid, true);

  const unknownInstance = registry.validateInstance({ tipo: "tipo_desconhecido", props: {} });
  assert.equal(unknownInstance.valid, true);
  assert.equal(unknownInstance.warnings.length > 0, true);
});

test("migration preserves unknown data and fills canonical metadata", () => {
  const { registry } = loadRegistry();

  const migrated = registry.migrate({
    tipo: "faq",
    props: { titulo: "Dúvidas" },
    customField: "preservado"
  });

  assert.equal(migrated.ok, true);
  assert.equal(migrated.fromVersion, 0);
  assert.equal(migrated.toVersion, 1);
  assert.equal(migrated.block.version, 1);
  assert.equal(migrated.block.customField, "preservado");
  assert.deepEqual(migrated.block.design, {});
});

test("custom migration handler can upgrade a legacy block", () => {
  const { registry } = loadRegistry();

  const registerResult = registry.register({
    id: "block.test-migration",
    type: "legacy_test",
    version: 2,
    name: "Teste de migração",
    category: "Utilidades",
    migrationHandler(block) {
      return {
        ...block,
        props: {
          ...block.props,
          migrated: true
        }
      };
    }
  });

  assert.equal(registerResult.ok, true);

  const migrated = registry.migrate({ tipo: "legacy_test", props: { original: true }, kept: true });
  assert.equal(migrated.ok, true);
  assert.equal(migrated.fromVersion, 0);
  assert.equal(migrated.toVersion, 2);
  assert.equal(migrated.block.version, 2);
  assert.equal(migrated.block.props.original, true);
  assert.equal(migrated.block.props.migrated, true);
  assert.equal(migrated.block.kept, true);
});

test("renderer contract supports function renderers and legacy fallback", () => {
  const { registry } = loadRegistry();

  const registerResult = registry.register({
    id: "block.function-renderer",
    type: "function_renderer",
    version: 1,
    name: "Renderer de função",
    category: "Utilidades",
    renderer: () => "<section>ok</section>"
  });

  assert.equal(registerResult.ok, true);
  assert.equal(registry.render({ tipo: "function_renderer" }), "<section>ok</section>");
  assert.equal(registry.render({ tipo: "faq" }, {}, () => "<section>legacy</section>"), "<section>legacy</section>");
});

test("legacy preset adapter registers unknown legacy block types without replacing the presets array", () => {
  const { context, registry } = loadRegistry();

  context.AURA_STUDIO_PRESETS = [
    {
      id: "legacy-preset",
      nome: "Preset legado",
      categoria: "Teste",
      tags: ["legado"],
      blocos: [{ tipo: "custom_legacy", props: { titulo: "Legado" }, design: {} }]
    }
  ];

  assert.equal(Array.isArray(context.AURA_STUDIO_PRESETS), true);
  assert.equal(context.AURA_STUDIO_PRESETS.length, 1);
  assert.equal(registry.has("custom_legacy"), true);
  assert.equal(registry.getByType("custom_legacy").id, "legacy.custom_legacy");
});

test("registry remains compatible with active legacy Studio libraries", () => {
  const { context, registry } = loadRegistry();

  runScript(context, "studio-library.js");
  runScript(context, "studio-max-library.js");
  runScript(context, "studio-ultimate-library.js");
  runScript(context, "studio-blocks-v4.js");

  assert.equal(Array.isArray(context.AURA_STUDIO_PRESETS), true);
  assert.ok(context.AURA_STUDIO_PRESETS.length > 0);
  assert.equal(registry.has("texto_midia"), true);
  assert.equal(registry.legacyPresets().length, context.AURA_STUDIO_PRESETS.length);
  assert.ok(registry.search("produto").length > 0);
});
