import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../index.html", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const start = source.indexOf("window.enviarFormularioLP = async function(event)");
const end = source.indexOf("async function renderizarLandingPage(", start);
assert.ok(start >= 0 && end > start);

function harness(callable, pageId = "tenant__lp") {
  const controls = [{ value: "Ana", placeholder: "nome" }, { value: "ACME", placeholder: "empresa" }];
  const button = { disabled: false };
  let status;
  let replaced = false;
  let completed = 0;
  const form = {
    querySelectorAll: (selector) => selector === "input" ? controls : [button],
    querySelector: () => status,
    appendChild: (node) => { status = node; },
    set innerHTML(value) { replaced = true; },
  };
  const window = { lpPublicPageIdAtual: pageId, location: { href: "https://example.invalid" } };
  const document = { title: "QA", referrer: "", createElement: () => ({ setAttribute() {}, textContent: "" }) };
  const execute = new Function("window", "document", "FormData", "obterCreatePublicLeadCallable", "camposExtrasDoFormulario", "leadAttemptTrackerLP", "fingerprintTentativaLeadPublicoLP", "console",
    `${source.slice(start, end)}; return window.enviarFormularioLP;`);
  const submit = execute(window, document, class { entries() { return [["nome", "Ana"], ["empresa", "ACME"]]; } },
    () => callable, () => ({ empresa: "ACME" }), { getToken: () => "stable-attempt", complete: () => completed++ }, () => "fingerprint", { error() {} });
  return { submit: () => submit({ preventDefault() {}, target: form }), controls, button,
    get status() { return status; }, get replaced() { return replaced; }, get completed() { return completed; } };
}

test("CRM-014: failure preserves controls, values and retry token", async () => {
  const requests = [];
  const h = harness(async (request) => { requests.push(request); if (requests.length === 1) throw new Error("network failure"); return { data: { ok: true } }; });
  const firstControl = h.controls[0];
  await h.submit();
  assert.equal(h.replaced, false);
  assert.equal(h.controls[0], firstControl);
  assert.equal(h.controls[1].value, "ACME");
  assert.equal(h.button.disabled, false);
  assert.match(h.status.textContent, /Erro ao enviar/);
  assert.equal(h.completed, 0);
  await h.submit();
  assert.equal(requests[0].dedupeKey, requests[1].dedupeKey);
  assert.equal(h.completed, 1);
});

test("CRM-014: missing public identity preserves filled form", async () => {
  const h = harness(() => assert.fail("must not send"), "");
  await h.submit();
  assert.equal(h.replaced, false);
  assert.match(h.status.textContent, /vinculada/);
});

test("CRM-014: concurrent submit dispatches only once and unlocks after rejection", async () => {
  let reject;
  let calls = 0;
  const h = harness(() => { calls++; return new Promise((_, fail) => { reject = fail; }); });
  const pending = h.submit();
  const duplicate = h.submit();
  assert.equal(calls, 1);
  assert.equal(h.button.disabled, true);
  reject(new Error("offline"));
  await Promise.all([pending, duplicate]);
  assert.equal(h.button.disabled, false);
  assert.equal(h.replaced, false);
});
