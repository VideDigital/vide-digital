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
  const state = { ownerUid: "a", canEdit: true, selectedIds: new Set(leads.map(l => l.id)) };
  let commits = 0;
  const run = real(extract(engine, "async function commitLeadPatches(", "async function recalculateAllScores("), "commitLeadPatches", {
    state, findLead: id => leads.find(l => l.id === id), MAX_BATCH_SIZE: 400, db: {}, doc: (_db, _c, id) => id,
    normalizeLead: lead => lead, refreshLeadCollections: noop,
    writeBatch: () => ({ set() {}, commit: async () => { if (++commits === 2) throw new Error("injected failure"); } })
  });
  const bulk = real(extract(engine, "async function applyBulkAction(", "function historyEntries("), "applyBulkAction", {
    state, selectedLeads: () => leads, document: { getElementById: () => null }, window: { confirm: () => true },
    toast: noop, render: noop, makeHistoryEvent: () => ({}), historyWithEvent: () => [], commitLeadPatches: run,
    refreshLeadCollections: noop, loadLeads: noop, leadBatchFailureMessage: () => "", console: { error() {} }
  });
  await bulk("archive");
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

test("CRM review: automation failure reloads once without automatically retrying the rejected write", async () => {
  const state = { canEdit: true, canView: true, ownerUid: "a", automationRunning: false,
    automation: { runOnRefresh: true, stageProbability: true }, realtimeReady: false,
    knownLeadIds: new Set(), lastSeenTimestamp: 0, modalOpen: false };
  const lead = { id: "p", criadoPor: "a", _tenantValid: true, _status: "convertido", _probability: 20 };
  const snapshot = { docs: [{ id: lead.id, data: () => lead }] };
  let failures = 0, subscriptions = 0, handle, load;
  const run = real(extract(engine, "async function runAutomations(", "async function mergeDuplicateGroup("), "runAutomations", {
    state, render: noop, makeHistoryEvent: () => ({}), historyWithEvent: () => [],
    refreshLeadCollections: () => { state.leads = state.allLeads; },
    commitLeadPatches: async () => { failures++; throw new Error("permission-denied"); },
    loadLeads: options => load(options), console: { error() {} }, toast: noop, leadBatchFailureMessage: () => ""
  });
  handle = real(extract(engine, "function handleRealtimeSnapshot(", "function dispatchLeadsBridge("), "handleRealtimeSnapshot", {
    state, normalizeLead: value => value, refreshLeadCollections: () => { state.leads = state.allLeads; },
    updateActiveTabUI: noop, dispatchLeadsBridge: noop, render: noop, findLead: () => lead,
    renderDetail: noop, closeDetail: noop, notifyNewLeads: noop, runAutomations: run, console: { error() {} }
  });
  load = real(extract(engine, "function loadLeads(", "function deriveGroups("), "loadLeads", {
    state, renderAccessDenied: noop, render: noop, renderLoading: noop, renderError: noop,
    query: noop, collection: noop, where: noop, db: {}, handleRealtimeSnapshot: handle,
    onSnapshot: (_query, callback) => {
      subscriptions++;
      // Bound the old failure loop so a regression fails promptly.
      if (subscriptions <= 4) queueMicrotask(() => callback(snapshot));
      return noop;
    }, console: { error() {} }
  });
  load();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(failures, 1, "reconciliation must not retry a rejected automatic write");
  assert.equal(subscriptions, 2, "one initial subscription and one reconciliation");
  assert.equal(state.realtimeReady, true);
  assert.equal(state.leads[0]._probability, 20, "reconciliation preserves the unchanged server record");
  load({ force: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(failures, 2, "a later explicit reload can retry automation once");
  assert.equal(subscriptions, 4);
});

test("CRM review: merge preserves terminal stage probability invariants with sparse legacy records", () => {
  for (const [status, expected] of [["convertido", 100], ["perdido", 0]]) {
    const result = core.mergeLeadCommercialFields([
      { id: "primary", status },
      { id: "duplicate", probabilidade: 70, probabilidadeOrigem: "manual" }
    ]);
    assert.equal(result.statusLead, status);
    assert.equal(result.probabilidade, expected);
    assert.equal(result.probabilidadeOrigem, "automatic");
  }
});

test("CRM review: auxiliary writes preserve the user's bulk selection", async () => {
  const state = { ownerUid: "a", selectedIds: new Set(["p"]) };
  const lead = { id: "p", criadoPor: "a" };
  const run = real(extract(engine, "async function commitLeadPatches(", "async function recalculateAllScores("), "commitLeadPatches", {
    state, findLead: () => lead, MAX_BATCH_SIZE: 400, db: {}, doc: noop, normalizeLead: value => value,
    writeBatch: () => ({ set() {}, commit: async () => {} })
  });
  assert.deepEqual(await run([{ id: "p", data: { leadScore: 42 } }]), ["p"]);
  assert.equal(lead.leadScore, 42);
  assert.deepEqual([...state.selectedIds], ["p"]);
});

test("CRM review: successful bulk clears only its confirmed IDs, preserving newly selected records", async () => {
  const state = { canEdit: true, selectedIds: new Set(["p"]) };
  const run = real(extract(engine, "async function applyBulkAction(", "function historyEntries("), "applyBulkAction", {
    state, selectedLeads: () => [{ id: "p" }], document: { getElementById: () => null },
    window: { confirm: () => true }, toast: noop, render: noop, makeHistoryEvent: () => ({}), historyWithEvent: () => [],
    commitLeadPatches: async () => { state.selectedIds.add("new"); return ["p"]; },
    refreshLeadCollections: noop, loadLeads: noop, leadBatchFailureMessage: () => "", console: { error() {} }
  });
  await run("archive");
  assert.deepEqual([...state.selectedIds], ["new"]);
});

test("CRM review: legacy UTM aliases merge to canonical fields with presence-based conflict rules", () => {
  const aliases = { utm_source: "Source", utm_medium: "Medium", utm_campaign: "Campaign", utm_content: "Content", utm_term: "Term" };
  const result = core.mergeLeadCommercialFields([{ id: "p" }, { id: "d", ...aliases }]);
  for (const [alias, value] of Object.entries(aliases)) {
    const canonical = alias.replace(/_([a-z])/, (_, character) => character.toUpperCase());
    assert.equal(result[canonical], value);
    assert.equal(Object.hasOwn(result, alias), false, "merge must not author new legacy aliases");
    assert.throws(() => core.mergeLeadCommercialFields([{ [canonical]: "" }, { [alias]: value }]), /conflitantes/);
    assert.throws(() => core.mergeLeadCommercialFields([{ [canonical]: null }, { [alias]: value }]), /conflitantes/);
    const explicit = core.mergeLeadCommercialFields([{ [canonical]: "", [alias]: value }]);
    assert.equal(explicit[canonical], "", "canonical presence wins within the same record");
    assert.equal(core.mergeLeadCommercialFields([{ [canonical]: value }, { [alias]: value }])[canonical], value);
  }
});
