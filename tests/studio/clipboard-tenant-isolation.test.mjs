import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../../studio-ultimate.js", import.meta.url), "utf8");
const marker = '  if (document.readyState === "loading")';
assert.ok(source.includes(marker));
function browser(storage = new Map(), storeUid = "A") {
  let snapshot = { initialized: true, active: true, storeUid, authUid: "actor" };
  const events = [], reads = [], writes = [], messages = [];
  const listeners = {};
  const window = {
    VideHubContext: { getSnapshot: () => snapshot },
    lpEditorBlocos: [{ id: "source", paginaId: "pg_1", tipo: "texto_midia", props: { titulo: "TENANT-A-SECRET-SYNTHETIC" }, design: { corTexto: "#123456" } }],
    AuraStudioInspector: { getSelected: () => ({ block: window.lpEditorBlocos[0], index: 0 }) },
    showToast: (message, type) => messages.push({ message, type })
  };
  const document = {
    readyState: "loading",
    addEventListener: (name, fn) => { listeners[name] = fn; },
    querySelector: () => null,
    getElementById: id => id === "lp-editor-modal" ? { classList: { contains: () => false } } : null,
    dispatchEvent: event => events.push(event)
  };
  const sandbox = vm.createContext({ window, document, console,
    localStorage: {
      getItem: key => { reads.push(key); return storage.get(key) ?? null; },
      setItem: (key, value) => { writes.push(key); storage.set(key, value); }
    },
    setTimeout: () => 0,
    CustomEvent: function (type, options) { this.type = type; this.detail = options.detail; },
    HTMLInputElement: class {}, HTMLTextAreaElement: class {}, HTMLSelectElement: class {}
  });
  vm.runInContext(source.replace(marker, `  window.testAPI = { copySelectedBlocks, pasteBlocks, copyStyle, pasteStyle, bindKeyboard };\n${marker}`), sandbox);
  const api = window.testAPI;
  return { window, api, storage, reads, writes, events, messages,
    context: value => { snapshot = value; },
    resetBlocks: () => { window.lpEditorBlocos = [{ id: "target", paginaId: "pg_2", tipo: "texto_midia", props: { titulo: "TARGET" }, design: { corTexto: "#abcdef" } }]; },
    key: (key, shiftKey = false) => listeners.keydown({ key, ctrlKey: true, shiftKey, target: {}, preventDefault() {} })
  };
}

test("same tenant block clipboard survives reload; clone gets new ID/current page and emits history", () => {
  const a = browser(); a.api.copySelectedBlocks();
  const reload = browser(a.storage); reload.resetBlocks(); reload.api.pasteBlocks();
  const clone = reload.window.lpEditorBlocos[1];
  assert.equal(clone.props.titulo, "TENANT-A-SECRET-SYNTHETIC");
  assert.notEqual(clone.id, "source"); assert.equal(clone.paginaId, "pg_2");
  assert.deepEqual(reload.events.map(e => e.type), ["aura:studio-change", "aura:studio-history-capture"]);
});

test("same tenant style survives reload and emits change/history", () => {
  const a = browser(); a.api.copyStyle();
  const reload = browser(a.storage); reload.resetBlocks(); reload.api.pasteStyle();
  assert.equal(reload.window.lpEditorBlocos[0].design.corTexto, "#123456");
  assert.deepEqual(reload.events.map(e => e.type), ["aura:studio-change", "aura:studio-history-capture"]);
});

for (const kind of ["block", "style"]) {
  test(`${kind}: context switch A to B without reload cannot read/apply A; returning to A works`, () => {
    const b = browser();
    const copy = kind === "block" ? b.api.copySelectedBlocks : b.api.copyStyle;
    const paste = kind === "block" ? b.api.pasteBlocks : b.api.pasteStyle;
    copy(); const keyA = b.writes[0];
    b.context({ initialized: true, active: true, storeUid: "B" }); b.resetBlocks();
    const before = JSON.stringify(b.window.lpEditorBlocos); paste();
    assert.equal(JSON.stringify(b.window.lpEditorBlocos), before);
    assert.equal(b.reads.includes(keyA), false); assert.equal(b.events.length, 0);
    b.context({ initialized: true, active: true, storeUid: "A" }); paste();
    if (kind === "block") assert.equal(b.window.lpEditorBlocos[1].props.titulo, "TENANT-A-SECRET-SYNTHETIC");
    else assert.equal(b.window.lpEditorBlocos[0].design.corTexto, "#123456");
  });
}

for (const invalid of [null, {}, { initialized: false, active: true, storeUid: "A" }, { initialized: true, active: false, storeUid: "A" }, { initialized: true, active: true, storeUid: "" }, { initialized: true, active: true, storeUid: 42 }]) {
  test(`untrusted context fails closed for all four actions: ${JSON.stringify(invalid)}`, () => {
    const b = browser(); b.context(invalid);
    const before = JSON.stringify(b.window.lpEditorBlocos);
    b.api.copySelectedBlocks(); b.api.pasteBlocks(); b.api.copyStyle(); b.api.pasteStyle();
    assert.equal(b.reads.length, 0); assert.equal(b.writes.length, 0);
    assert.equal(JSON.stringify(b.window.lpEditorBlocos), before);
    assert.equal(b.events.length, 0);
    assert.equal(b.messages.length, 4); assert.ok(b.messages.every(m => m.type === "error"));
  });
}

test("missing context service fails closed", () => {
  const b = browser(); delete b.window.VideHubContext;
  b.api.copySelectedBlocks(); b.api.pasteBlocks(); b.api.copyStyle(); b.api.pasteStyle();
  assert.equal(b.reads.length + b.writes.length, 0); assert.equal(b.events.length, 0);
});

test("legacy ambiguous clipboard remains unread and unchanged", () => {
  const storage = new Map([
    ["auraUltimateBlockClipboard", JSON.stringify([{ tipo: "texto_midia", props: { titulo: "FOREIGN" } }])],
    ["auraUltimateStyleClipboard", JSON.stringify({ corTexto: "#000000" })]
  ]);
  const before = [...storage]; const b = browser(storage); b.resetBlocks();
  const blocks = JSON.stringify(b.window.lpEditorBlocos);
  b.api.pasteBlocks(); b.api.pasteStyle();
  assert.equal(JSON.stringify(b.window.lpEditorBlocos), blocks);
  assert.deepEqual([...storage], before);
  assert.ok(b.reads.every(k => !before.some(([legacy]) => legacy === k)));
});

for (const actor of ["employee", "master-admin"]) {
  test(`${actor} uses resolved storeUid, not authenticated actor UID`, () => {
    const b = browser(); b.api.copySelectedBlocks(); b.api.copyStyle(); const keys = [...b.writes];
    assert.ok(keys.every(k => k.includes(":tenant:A:")));
    b.context({ initialized: true, active: true, storeUid: "A", authUid: actor, role: actor });
    b.resetBlocks(); b.api.pasteBlocks(); b.api.pasteStyle();
    assert.deepEqual(b.reads, keys);
    assert.equal(b.window.lpEditorBlocos[1].props.titulo, "TENANT-A-SECRET-SYNTHETIC");
    assert.equal(b.window.lpEditorBlocos[0].design.corTexto, "#123456");
  });
}

test("encoded tenant IDs cannot collide, for either clipboard type", () => {
  const b = browser();
  for (const storeUid of ["A:B", "A%3AB", "A/B", "A%2FB"]) {
    b.context({ initialized: true, active: true, storeUid });
    b.api.copySelectedBlocks(); b.api.copyStyle();
  }
  assert.equal(new Set(b.writes).size, 8);
});

test("keyboard shortcuts enforce tenant isolation and keep same-tenant behavior", () => {
  const b = browser(); b.api.bindKeyboard(); b.key("c"); b.key("c", true);
  b.context({ initialized: true, active: true, storeUid: "B" }); b.resetBlocks();
  const before = JSON.stringify(b.window.lpEditorBlocos);
  b.key("v"); b.key("v", true);
  assert.equal(JSON.stringify(b.window.lpEditorBlocos), before);
  b.context({ initialized: true, active: true, storeUid: "A" });
  b.key("v"); b.key("v", true);
  assert.equal(b.window.lpEditorBlocos[1].props.titulo, "TENANT-A-SECRET-SYNTHETIC");
  assert.equal(b.window.lpEditorBlocos[0].design.corTexto, "#123456");
});

test("UI buttons bind to the same guarded handlers", () => {
  for (const [id, fn] of [["copy-blocks", "copySelectedBlocks"], ["copy-style", "copyStyle"], ["paste-style", "pasteStyle"]]) {
    assert.ok(source.includes(`$("#aura-ultimate-${id}", state.modal)?.addEventListener("click", ${fn})`));
  }
});
