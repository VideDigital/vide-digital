import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";

const root = fileURLToPath(new URL("../../", import.meta.url));
const source = name => process.env.STUDIO_TEST_BASELINE === "1"
  ? execFileSync("git", ["show", `b19e736:${name}`], { cwd: root, encoding: "utf8" })
  : readFileSync(new URL(`../../${name}`, import.meta.url), "utf8");
const exposures = {
  "studio-max.js": "{ state, storageKey, saveDraft, getVersions, createVersion, restoreVersion, restoreDraft, discardDraft, wrapSave }",
  "studio-pro.js": "{ state, wrapSaveFunctions }",
  "studio-history-v4.js": "{ state, pageKey, persistRecovery, recoveryAvailable, loadStored, createVersion, restoreVersion, discardRecovery, undo, redo }"
};
function browser(storage = new Map(), tenant = "A") {
  let context = { initialized: true, active: true, storeUid: tenant, authUid: `actor-${tenant}` };
  const elements = Object.fromEntries(["lped-titulo", "lped-slug", "aura-studio-save-dot", "aura-studio-save-label", "aura-studio-save-state"].map(id => [id, { value: id === "lped-slug" ? "oferta" : "Oferta", dataset: {}, textContent: "", classList: { add() {}, remove() {} } }]));
  const window = { VideHubContext: { getSnapshot: () => context }, lpEditorBlocos: [{ id: "block", paginaId: "pg_1", tipo: "texto_rico", props: { conteudo: `private-${tenant}` } }] };
  const sandbox = vm.createContext({ window,
    document: { readyState: "loading", addEventListener() {}, dispatchEvent() {}, querySelector: () => null, querySelectorAll: () => [], getElementById: id => elements[id] || null },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    console, setTimeout: () => 0, clearTimeout() {}, CustomEvent: function() {} });
  function load(name) {
    const marker = '  if (document.readyState === "loading")';
    const code = source(name);
    assert.ok(code.includes(marker));
    vm.runInContext(code.replace(marker, `  window.audit = ${exposures[name]};\n${marker}`), sandbox, { filename: name });
    return window.audit;
  }
  return { load, window, elements, storage, context: value => { context = value; } };
}

test("MAX: tenants with identical page identity cannot read each other's versions or drafts; same tenant reload works", () => {
  const storage = new Map();
  const a = browser(storage, "A"), ma = a.load("studio-max.js");
  ma.state.modalOpen = true; ma.saveDraft(); ma.createVersion("Private A", "manual");
  const keyA = ma.storageKey("draft");
  const b = browser(storage, "B"), mb = b.load("studio-max.js");
  assert.notEqual(mb.storageKey("draft"), keyA);
  assert.equal(mb.getVersions().length, 0);
  mb.restoreDraft();
  assert.equal(b.window.lpEditorBlocos[0].props.conteudo, "private-B");
  mb.state.modalOpen = true; mb.saveDraft(); mb.createVersion("Private B", "manual");
  assert.equal(ma.getVersions()[0].name, "Private A");
  const reload = browser(storage, "A"), mr = reload.load("studio-max.js");
  assert.equal(storage.get(mr.storageKey("draft")), storage.get(keyA));
  assert.equal(mr.getVersions()[0].blocks[0].props.conteudo, "private-A");
  reload.window.lpEditorBlocos = [];
  mr.restoreDraft();
  assert.equal(reload.window.lpEditorBlocos[0].props.conteudo, "private-A");
});

test("MAX: delayed version confirmation cannot restore another tenant's content", () => {
  const b = browser(), m = b.load("studio-max.js");
  const version = m.createVersion("Private A", "manual");
  let confirm;
  b.window.abrirConfirmacao = (_, callback) => { confirm = callback; };
  m.restoreVersion(version.id);
  b.context({ initialized: true, active: true, storeUid: "B" });
  b.window.lpEditorBlocos[0].props.conteudo = "private-B";
  confirm();
  assert.equal(b.window.lpEditorBlocos[0].props.conteudo, "private-B");
  assert.equal(m.getVersions().length, 0);
});

test("history V4: shared storage is tenant scoped and reload retains own recovery/versions", () => {
  const storage = new Map();
  const a = browser(storage, "A"), ha = a.load("studio-history-v4.js");
  ha.createVersion("Private A");
  const b = browser(storage, "B"), hb = b.load("studio-history-v4.js");
  assert.notEqual(ha.pageKey(), hb.pageKey());
  hb.loadStored(); assert.equal(hb.state.versions.length, 0); assert.equal(hb.recoveryAvailable(), null);
  const reload = browser(storage, "A"), hr = reload.load("studio-history-v4.js");
  reload.window.lpEditorBlocos = [];
  hr.loadStored();
  assert.equal(hr.state.versions[0].label, "Private A");
  assert.equal(hr.recoveryAvailable().blocks[0].props.conteudo, "private-A");
  reload.context({ initialized: true, active: true, storeUid: "B" });
  assert.equal(hr.restoreVersion(hr.state.versions[0].id), false);
  assert.equal(hr.state.versions.length, 0);
});

for (const invalid of [null, { initialized: false, active: true, storeUid: "A" }, { initialized: true, active: false, storeUid: "A" }, { initialized: true, active: true, storeUid: "" }]) {
  test(`no trusted context: no local read/write (${JSON.stringify(invalid)})`, () => {
    const b = browser(); b.context(invalid);
    const m = b.load("studio-max.js"), h = b.load("studio-history-v4.js");
    m.state.modalOpen = true;
    m.saveDraft(); m.createVersion("x"); m.discardDraft();
    h.createVersion("x"); h.persistRecovery(); h.discardRecovery();
    assert.equal(b.storage.size, 0);
    assert.equal(m.getVersions().length, 0); assert.equal(h.recoveryAvailable(), null);
  });
}

test("ambiguous legacy keys remain untouched and unread; employee uses canonical storeUid", () => {
  const storage = new Map([
    ["auraStudioMax:versions:oferta:pg_1:Oferta", '[{"name":"foreign"}]'],
    ["auraStudioMax:draft:oferta:pg_1:Oferta", '{"blocks":[{"secret":true}]}'],
    ["aura_v4_history_oferta_Oferta_versions", '[{"label":"foreign"}]']
  ]);
  const before = [...storage];
  const b = browser(storage), m = b.load("studio-max.js"), h = b.load("studio-history-v4.js");
  assert.equal(m.getVersions().length, 0); h.loadStored(); assert.equal(h.state.versions.length, 0);
  m.discardDraft(); h.discardRecovery(); assert.deepEqual([...storage], before);
  const ownerKey = m.storageKey("draft");
  b.context({ initialized: true, active: true, storeUid: "A", authUid: "employee" });
  assert.equal(m.storageKey("draft"), ownerKey);
  b.context({ initialized: true, active: true, storeUid: "A:B" });
  const specialKey = m.storageKey("draft");
  b.context({ initialized: true, active: true, storeUid: "A%3AB" });
  assert.notEqual(m.storageKey("draft"), specialKey);
});

for (const operation of ["salvarEditorLP", "publicarEditorLP"]) {
  for (const outcome of ["false", "missing", "throw", "true"]) {
    test(`${operation}: composed Pro/MAX wrappers preserve contract for ${outcome}`, async () => {
      const b = browser(), pro = b.load("studio-pro.js"), max = b.load("studio-max.js");
      pro.state.dirty = true; max.state.modalOpen = true; max.saveDraft();
      const draftKey = max.storageKey("draft"), draft = b.storage.get(draftKey), oldHash = max.state.lastSavedHash;
      const result = outcome === "missing" ? undefined : { ok: outcome === "true", motivo: "test" };
      const failure = new Error("save rejected");
      const receiver = { receiver: true };
      b.window[operation] = async function (...args) {
        assert.equal(this, receiver); assert.deepEqual(args, ["arg"]);
        if (outcome === "throw") throw failure;
        return result;
      };
      pro.wrapSaveFunctions(); max.wrapSave();
      if (outcome === "throw") await assert.rejects(b.window[operation].call(receiver, "arg"), error => error === failure);
      else assert.equal(await b.window[operation].call(receiver, "arg"), result);
      if (outcome === "true") {
        assert.equal(pro.state.dirty, false);
        assert.equal(b.elements["aura-studio-save-label"].textContent, "Tudo salvo");
        assert.equal(b.storage.has(draftKey), false);
        assert.equal(max.getVersions()[0].name, operation === "salvarEditorLP" ? "Página salva" : "Página publicada");
      } else {
        assert.equal(pro.state.dirty, true);
        assert.notEqual(b.elements["aura-studio-save-label"].textContent, "Tudo salvo");
        assert.equal(b.storage.get(draftKey), draft);
        assert.equal(max.state.lastSavedHash, oldHash);
        assert.equal(max.getVersions().length, 0);
      }
    });
  }
}

test("MAX: completed save cannot clear another tenant's recovery after context switch", async () => {
  const b = browser(), m = b.load("studio-max.js");
  let finish;
  b.window.salvarEditorLP = () => new Promise(resolve => { finish = resolve; });
  m.wrapSave(); m.state.modalOpen = true; m.saveDraft();
  const pending = b.window.salvarEditorLP();
  b.context({ initialized: true, active: true, storeUid: "B" });
  b.window.lpEditorBlocos[0].props.conteudo = "private-B"; m.saveDraft();
  const keyB = m.storageKey("draft"), draftB = b.storage.get(keyB);
  finish({ ok: true }); await pending;
  assert.equal(b.storage.get(keyB), draftB);
  assert.equal(m.getVersions().length, 0);
});
