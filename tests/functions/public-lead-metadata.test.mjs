import assert from "node:assert/strict";
import { test } from "node:test";
import publicApi from "../../functions/src/public/index.js";
import { normalizeExtraFields, extraFieldsSearchText } from "../../lead-engine-core.js";
import { readFileSync } from "node:fs";
import { escapeHTML } from "../../lp-render-safety-core.js";

test("PR61: CRM uses historical labels, retains legacy fallback and values", () => {
  const values = { empresa_smoke_pr61: "SMOKE-PR61-LEAD-002" };
  const meta = { empresa_smoke_pr61: { label: "Empresa Smoke PR61 Renomeada" } };
  assert.equal(normalizeExtraFields(values, meta)[0].label, "Empresa Smoke PR61 Renomeada");
  assert.equal(normalizeExtraFields(values)[0].label, "Empresa smoke pr61");
  assert.match(extraFieldsSearchText(values, meta), /Renomeada/);
  assert.equal(normalizeExtraFields({ x: 0 }, { x: { label: "Zero" } })[0].value, "0");
});

test("PR61: metadata must come from a structured published form owned by resolved tenant", async () => {
  assert.equal(typeof publicApi.snapshotLeadFieldMetadata, "function");
  const tenant = { ownerUid: "a", publicPageId: "a__lp", sourceType: "landing-page", page: { ordemBlocos: ["form1"] } };
  const records = new Map([["landing_pages_blocos_publicas/form1", {
    donoUID: "a", tipo: "formulario_captura", props: { campos: [{ name: "empresa_smoke_pr61", label: "Empresa Smoke PR61 Renomeada", type: "text", required: true }] }
  }]]);
  const read = async (path) => ({ exists: records.has(path), data: () => records.get(path) });
  const data = { blocoOrigem: "form1", camposExtras: { empresa_smoke_pr61: "value" }, camposExtrasMeta: { empresa_smoke_pr61: { label: "SPOOF" } } };
  const old = await publicApi.snapshotLeadFieldMetadata(data, tenant, read);
  assert.equal(old.empresa_smoke_pr61.label, "Empresa Smoke PR61 Renomeada");
  records.get("landing_pages_blocos_publicas/form1").props.campos[0].label = "New label";
  const next = await publicApi.snapshotLeadFieldMetadata(data, tenant, read);
  assert.equal(next.empresa_smoke_pr61.label, "New label");
  assert.equal(old.empresa_smoke_pr61.label, "Empresa Smoke PR61 Renomeada");
  records.clear();
  assert.deepEqual(await publicApi.snapshotLeadFieldMetadata(data, tenant, read), {});
  assert.equal(normalizeExtraFields(data.camposExtras, old)[0].label, "Empresa Smoke PR61 Renomeada");
  records.set("landing_pages_blocos_publicas/form1", { donoUID: "b", tipo: "formulario_captura", props: { campos: [{ name: "empresa_smoke_pr61", label: "OTHER TENANT" }] } });
  await assert.rejects(publicApi.snapshotLeadFieldMetadata(data, tenant, read), (e) => e.code === "failed-precondition");
});

test("PR61: ambiguous legacy forms, absent fields and hostile keys never invent metadata", async () => {
  assert.equal(typeof publicApi.snapshotLeadFieldMetadata, "function");
  const tenant = { ownerUid: "a", sourceType: "landing-page", page: { ordemBlocos: ["one", "two"] } };
  const read = async (path) => ({ exists: true, data: () => ({ donoUID: "a", tipo: "formulario_captura", props: { campos: [{ name: "x", label: path }, { name: "constructor", label: "bad" }] } }) });
  assert.deepEqual(await publicApi.snapshotLeadFieldMetadata({ camposExtras: { x: "1" } }, tenant, read), {});
  const result = await publicApi.snapshotLeadFieldMetadata({ blocoOrigem: "one", camposExtras: { x: "1", removed: "2", constructor: "bad" } }, tenant, read);
  assert.equal(result.x.label, "landing_pages_blocos_publicas/one");
  assert.equal(Object.hasOwn(result, "removed"), false);
  assert.equal(Object.hasOwn(result, "constructor"), false);
  assert.deepEqual(await publicApi.snapshotLeadFieldMetadata({ blocoOrigem: "outsider", camposExtras: { x: "1" } }, tenant, read), {});
});

test("PR61: actual CRM renderer escapes metadata labels and keeps scalar values", () => {
  const source = readFileSync(new URL("../../lead-engine-v5.js", import.meta.url), "utf8");
  const start = source.indexOf("function renderExtraFields(lead)");
  const end = source.indexOf("function buildWhatsappMessage(", start);
  assert.ok(start >= 0 && end > start);
  const render = new Function("escapeHTML", `${source.slice(start, end)}; return renderExtraFields;`)(escapeHTML);
  const fields = normalizeExtraFields({ x: "value" }, { x: { label: '<img src=x onerror="alert(1)">' } });
  const html = render({ _extraFields: fields });
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;img"));
  assert.ok(html.includes("value"));
  assert.equal(normalizeExtraFields({ x: "value" }, Object.create({ x: { label: "inherited spoof" } }))[0].label, "X");
});
