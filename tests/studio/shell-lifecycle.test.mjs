import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const rootDir = path.resolve(import.meta.dirname, "../..");
const dashboardApp = fs.readFileSync(path.join(rootDir, "dashboard-app.js"), "utf8");
const dashboardHtml = fs.readFileSync(path.join(rootDir, "dashboard.html"), "utf8");

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
