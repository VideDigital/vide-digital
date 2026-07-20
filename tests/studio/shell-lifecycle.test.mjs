import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const rootDir = path.resolve(import.meta.dirname, "../..");
const dashboardApp = fs.readFileSync(path.join(rootDir, "dashboard-app.js"), "utf8");
const dashboardHtml = fs.readFileSync(path.join(rootDir, "dashboard.html"), "utf8");

// As asserções acima só confirmam que os padrões existem no texto-fonte —
// não provam que o comportamento real funciona. mobile-click-recovery-v1.js
// é pequeno e desacoplado o bastante pra rodar de verdade (via vm, igual
// tests/studio/block-registry.test.mjs faz com os arquivos legados do
// Studio), então os testes abaixo executam o arquivo real e verificam o
// comportamento observável — não apenas que certas strings aparecem nele.

function createStyleStub() {
  const values = {};
  return new Proxy(values, {
    get(target, prop) {
      return prop in target ? target[prop] : "";
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    }
  });
}

function createClassListStub(initial) {
  const set = new Set(initial);
  return {
    contains: (name) => set.has(name),
    add: (...names) => names.forEach((n) => set.add(n)),
    remove: (...names) => names.forEach((n) => set.delete(n))
  };
}

function createElementStub({ id, classes = [], hidden = false } = {}) {
  return {
    id,
    hidden,
    style: createStyleStub(),
    dataset: {},
    classList: createClassListStub(classes),
    getAttribute: () => null,
    setAttribute: () => {},
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {}
  };
}

function loadMobileClickRecovery({ editorHidden }) {
  const elements = new Map();
  const htmlEl = createElementStub();
  const bodyEl = createElementStub();
  const editorModal = createElementStub({ id: "lp-editor-modal", classes: editorHidden ? ["hidden"] : [] });
  elements.set("lp-editor-modal", editorModal);

  const documentStub = {
    readyState: "complete",
    documentElement: htmlEl,
    body: bodyEl,
    addEventListener: () => {},
    getElementById: (id) => elements.get(id) || null,
    querySelectorAll: () => []
  };

  let capturedObserverCallback = null;
  class FakeMutationObserver {
    constructor(callback) {
      capturedObserverCallback = callback;
    }
    observe() {}
    disconnect() {}
  }

  const windowStub = {
    document: documentStub,
    MutationObserver: FakeMutationObserver,
    setTimeout,
    clearTimeout,
    console: { info() {}, warn() {}, error() {} },
    abrirModalLP: () => {},
    addEventListener: () => {}
  };
  windowStub.window = windowStub;
  windowStub.globalThis = windowStub;

  const context = vm.createContext(windowStub);
  const code = fs.readFileSync(path.join(rootDir, "mobile-click-recovery-v1.js"), "utf8");
  vm.runInContext(code, context, { filename: "mobile-click-recovery-v1.js" });

  return { htmlEl, bodyEl, editorModal, triggerObserver: () => capturedObserverCallback?.() };
}

test("mobile-click-recovery does not clear documentElement.style.overflow while the Studio shell is open", () => {
  const { htmlEl, triggerObserver } = loadMobileClickRecovery({ editorHidden: false });
  htmlEl.style.overflow = "hidden"; // como abrirShellEditorLP trava o scroll
  triggerObserver();
  assert.equal(htmlEl.style.overflow, "hidden", "o recovery não deveria destravar o scroll com o Studio aberto");
});

test("mobile-click-recovery still clears a stuck documentElement.style.overflow when the Studio shell is closed", () => {
  const { htmlEl, triggerObserver } = loadMobileClickRecovery({ editorHidden: true });
  htmlEl.style.overflow = "hidden"; // estado travado por um bug antigo, sem o editor aberto
  triggerObserver();
  assert.equal(htmlEl.style.overflow, "", "o recovery original ainda deve destravar quando o editor está fechado");
});

test("landing editor shell has one canonical open and close lifecycle", () => {
  assert.match(dashboardApp, /function abrirShellEditorLP\(/);
  assert.match(dashboardApp, /function fecharShellEditorLP\(/);
  assert.match(dashboardApp, /window\.fecharEditorLP\s*=\s*function\s*\(evento\)/);
  assert.match(dashboardApp, /return fecharShellEditorLP\("manual"\)/);
  assert.match(dashboardApp, /abrirShellEditorLP\(\{\s*opener: openerEditorLP\s*\}\)/);
  assert.doesNotMatch(
    dashboardApp,
    /document\.getElementById\("lp-editor-modal"\)\.classList\.remove\("hidden"\)/
  );
});

test("landing editor shell removes transient listeners when closed", () => {
  assert.match(dashboardApp, /new AbortController\(\)/);
  assert.match(dashboardApp, /addEventListener\("keydown",\s*lidarComEscapeShellEditorLP/);
  assert.match(dashboardApp, /capture:\s*true/);
  assert.match(dashboardApp, /abortController\.abort\(\)/);
  assert.match(dashboardApp, /lpEditorShellState\.abortController\s*=\s*null/);
});

test("landing editor shell closes nested surfaces before closing the editor", () => {
  assert.match(dashboardApp, /lped-modal-renomear-pagina/);
  assert.match(dashboardApp, /lped-modal-excluir-pagina/);
  assert.match(dashboardApp, /lp-blocos-panel/);
  assert.match(dashboardApp, /lped-painel-camadas/);
  assert.match(dashboardApp, /lped-menu-contexto/);
  assert.match(dashboardApp, /blocosSelecionadosLivre\.clear\(\)/);
});

test("landing editor shell markup exposes an accessible close control", () => {
  assert.match(dashboardHtml, /id="lp-editor-modal"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-hidden="true"/);
  assert.match(dashboardHtml, /data-lp-editor-shell/);
  assert.match(dashboardHtml, /<button type="button" data-lp-editor-close aria-label="Fechar editor de Landing Page"/);
  assert.doesNotMatch(dashboardHtml, /<button onclick="fecharEditorLP\(\)" class="text-gray-400 hover:text-white text-xl">/);
});
