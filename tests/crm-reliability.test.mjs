import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as core from "../lead-engine-core.js";
const engine = readFileSync(new URL("../lead-engine-v5.js", import.meta.url), "utf8");
const crm = readFileSync(new URL("../crm360.js", import.meta.url), "utf8");
const noop = () => {};
function extract(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a);
  return source.slice(a, b);
}
function real(source, name, bindings) { return new Function(...Object.keys(bindings), `${source}; return ${name};`)(...Object.values(bindings)); }

test("CRM-011: second batch failure applies only confirmed state and leaves pending selection", async () => {
  const leads = Array.from({ length: 401 }, (_, i) => ({ id: String(i), criadoPor: "a" }));
  const state = { ownerUid: "a", selectedIds: new Set(leads.map(l => l.id)) };
  let commits = 0;
  const run = real(extract(engine, "async function commitLeadPatches(", "async function recalculateAllScores("), "commitLeadPatches", {
    state, findLead: id => leads.find(l => l.id === id), MAX_BATCH_SIZE: 400, db: {}, doc: (_db, _c, id) => id,
    normalizeLead: lead => lead, refreshLeadCollections: noop,
    writeBatch: () => ({ set() {}, commit: async () => { if (++commits === 2) throw new Error("injected failure"); } })
  });
  await assert.rejects(run(leads.map(l => ({ id: l.id, data: { arquivado: true } }))));
  assert.equal(leads.filter(l => l.arquivado).length, 400);
  assert.deepEqual([...state.selectedIds], ["400"]);
});

test("CRM-011: invalid tenant patch fails before any write instead of silent filtering", async () => {
  let commits = 0;
  const run = real(extract(engine, "async function commitLeadPatches(", "async function recalculateAllScores("), "commitLeadPatches", {
    state: { ownerUid: "a" }, findLead: id => ({ id, criadoPor: "b" }), MAX_BATCH_SIZE: 400, db: {}, doc: noop,
    normalizeLead: l => l, refreshLeadCollections: noop,
    writeBatch: () => ({ set() {}, commit: async () => { commits++; } })
  });
  await assert.rejects(run([{ id: "foreign", data: { arquivado: true } }]));
  assert.equal(commits, 0);
});

test("CRM-013: related customer beyond first 300 tenant records is returned", async () => {
  const state = { clienteId: "target", conversa: { id: "active" } };
  const docs = Array.from({ length: 601 }, (_, i) => ({ id: String(i), data: () => ({ clienteId: i >= 300 ? "target" : "other", criadoPor: "a" }) }));
  const queriedTenants = [];
  const run = real(extract(crm, "async function carregarDadosRelacionados()", "async function carregarClientePorId("), "carregarDadosRelacionados", {
    state, storeUid: () => "a", db: {}, collection: (_db, ...parts) => parts.join("/"),
    where: (key, op, value) => { queriedTenants.push([key, value]); return { key, value }; }, limit: n => ({ limit: n }), startAfter: d => ({ cursor: Number(d.id) }), query: (...args) => args,
    getDocs: async args => {
      const from = (args.find(a => a?.cursor != null)?.cursor ?? -1) + 1;
      const size = args.find(a => a?.limit)?.limit ?? 300;
      const result = args[0] === "leads" ? docs.slice(from, from + size) : [];
      return { docs: result, size: result.length, forEach: cb => result.forEach(cb) };
    }
  });
  await run();
  assert.equal(state.leads.length, 301);
  assert.ok(queriedTenants.every(([, value]) => value === "a"));
});

test("CRM-007: commercial data and custom values survive merging into a sparse lead", () => {
  const lead = { id: "new", criadoPor: "a" };
  const old = { id: "old", criadoPor: "a", responsavelUid: "employee", responsavelNome: "QA", proximoContatoEm: 1800000000000,
    statusLead: "proposta", status: "proposta", pipelineStage: "proposta", probabilidade: 63.5, probabilidadeOrigem: "manual",
    etiqueta: "VIP", origem: "Evento", utmCampaign: "Launch", camposExtras: { empresa: "ACME", zero: 0 },
    camposExtrasMeta: { empresa: { label: "Empresa histórica" } }, idsMesclados: ["older"] };
  assert.equal(typeof core.mergeLeadCommercialFields, "function");
  const patch = core.mergeLeadCommercialFields([lead, old]);
  assert.equal(patch.responsavelUid, "employee");
  assert.equal(patch.proximoContatoEm, old.proximoContatoEm);
  assert.equal(patch.statusLead, "proposta");
  assert.equal(patch.probabilidade, 63.5);
  assert.equal(patch.etiqueta, "VIP");
  assert.equal(patch.utmCampaign, "Launch");
  assert.equal(patch.camposExtras.empresa, "ACME");
  assert.equal(patch.camposExtras.zero, 0);
  assert.equal(patch.camposExtrasMeta.empresa.label, "Empresa histórica");
  assert.deepEqual(new Set(patch.idsMesclados), new Set(["old", "older"]));
  assert.equal(lead.camposExtras, undefined);
});

test("CRM-007: conflicting commercial values and explicit clears require manual reconciliation", () => {
  assert.equal(typeof core.mergeLeadCommercialFields, "function");
  assert.throws(() => core.mergeLeadCommercialFields([{ responsavelUid: null }, { responsavelUid: "person" }]), /conflitantes/);
  assert.throws(() => core.mergeLeadCommercialFields([{ camposExtras: { x: "a" } }, { camposExtras: { x: "b" } }]), /conflitantes/);
  assert.throws(() => core.mergeLeadCommercialFields([{ status: "convertido" }, { status: "perdido" }]), /conflitantes/);
});

test("CRM-007: actual merge persists exclusive commercial data before archiving duplicate", async () => {
  const records = [{ id: "p", criadoPor: "a", nome: "Ana", _value: 0 }, { id: "d", criadoPor: "a", responsavelUid: "employee", _value: 0 }];
  const writes = [];
  const state = { canEdit: true, ownerUid: "a" };
  const transaction = { get: async id => ({ exists: () => true, id, data: () => records.find(l => l.id === id) }), set: (id, data) => writes.push({ id, data }) };
  const run = real(extract(engine, "async function mergeDuplicateGroup(", "function exportCSV("), "mergeDuplicateGroup", {
    state, toast: noop, window: { confirm: () => true }, anyTimestamp: core.anyTimestamp, MAX_HISTORY: 120, MAX_BATCH_SIZE: 400,
    makeHistoryEvent: () => ({}), db: {}, doc: (_db, _c, id) => id, loadLeads: noop, updateActiveTabUI: noop, render: noop, console: { error() {} },
    mergeLeadCommercialFields: core.mergeLeadCommercialFields, numericValue: core.numericValue,
    runTransaction: async (_db, fn) => fn(transaction),
    writeBatch: () => ({ set: transaction.set, commit: async () => {} })
  });
  await run({ leads: records });
  assert.equal(writes.find(w => w.id === "p")?.data.responsavelUid, "employee");
  assert.equal(writes.find(w => w.id === "d")?.data.arquivado, true);
});
