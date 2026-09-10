import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const source = readFileSync(new URL("../lead-engine-v5.js", import.meta.url), "utf8");
const start = source.indexOf("function loadSLA()");
const code = source.slice(source.lastIndexOf("async ", start) === start - 6 ? start - 6 : start, source.indexOf("function loadAutomationPreferences()", start));
function controller(records, tenant = "a", canEdit = true, fail = false, overrides = {}) {
  const state = { ownerUid: tenant, canView: true, canEdit, slaMinutes: 30, leads: [], allLeads: [] };
  const callbacks = [];
  const errorCallbacks = [];
  let unsubscribeCount = 0;
  const bindings = { state, db: {}, doc: (_db, c, id) => `${c}/${id}`,
    getDoc: async path => { if (fail) throw new Error("offline"); return { exists: () => records.has(path), data: () => records.get(path) }; },
    setDoc: async (path, value) => { if (fail) throw new Error("offline"); records.set(path, value); },
    onSnapshot: (_ref, options, next, error) => {
      assert.deepEqual(options, { includeMetadataChanges: true });
      callbacks.push(next); errorCallbacks.push(error); return () => { unsubscribeCount++; };
    },
    normalizeLead: x => x, deriveGroups() {}, refreshLeadCollections() {}, render() {}, toast() {},
    console: { warn() {}, error() {} }, document: { getElementById: () => null },
    STORAGE_PREFIX: "aura_", localStorage: { getItem: () => null, setItem() { throw new Error("storage denied"); } } };
  Object.assign(bindings, overrides);
  const teardown = source.slice(source.indexOf("function teardownModalLifecycle()"), source.indexOf("async function loadSLA()"));
  bindings.closeDetail = () => {};
  const api = new Function(...Object.keys(bindings), `${teardown}; ${code}; return { loadSLA, saveSLA, teardownModalLifecycle };`)(...Object.values(bindings));
  return { ...api, state, callbacks, errorCallbacks, unsubscribeCount: () => unsubscribeCount };
}
test("CRM-012: SLA saved in browser A is loaded in browser B for the same tenant", async () => {
  const records = new Map();
  const first = controller(records);
  await first.saveSLA(120);
  const second = controller(records);
  await second.loadSLA();
  assert.equal(second.state.slaMinutes, 120);
  const other = controller(records, "b");
  await other.loadSLA();
  assert.equal(other.state.slaMinutes, 30);
});
test("CRM-012: failed save and read-only access never claim a new SLA", async () => {
  const records = new Map();
  const readonly = controller(records, "a", false);
  await readonly.saveSLA(120);
  assert.equal(records.size, 0);
  const offline = controller(records, "a", true, true);
  await offline.saveSLA(120);
  assert.equal(offline.state.slaMinutes, 30);
});
test("CRM-012: subscription follows confirmed remote changes and ignores optimistic writes", async () => {
  const h = controller(new Map([["lead_settings/a", { slaMinutes: 90 }]]));
  await h.loadSLA();
  assert.equal(h.state.slaMinutes, 90);
  h.callbacks[0]({ exists: () => true, data: () => ({ slaMinutes: 120 }), metadata: { hasPendingWrites: true } });
  assert.equal(h.state.slaMinutes, 90);
  h.callbacks[0]({ exists: () => true, data: () => ({ slaMinutes: 120 }), metadata: { fromCache: false } });
  assert.equal(h.state.slaMinutes, 120);
  h.state.ownerUid = "other";
  h.callbacks[0]({ exists: () => true, data: () => ({ slaMinutes: 200 }) });
  assert.equal(h.state.slaMinutes, 120);
});

test("CRM-012: cache confirmation resumes SLA processing without a data change", async () => {
  const h = controller(new Map());
  await h.loadSLA();
  assert.equal(h.callbacks.length, 1);
  const snapshot = fromCache => ({ exists: () => true, data: () => ({ slaMinutes: 90 }), metadata: { fromCache } });
  h.callbacks[0](snapshot(true));
  assert.equal(h.state.slaLoaded, false);
  h.callbacks[0](snapshot(false));
  assert.equal(h.state.slaLoaded, true);
  assert.equal(h.state.slaMinutes, 90);
});

test("CRM-012 review: initial read failure still allows realtime recovery", async () => {
  const h = controller(new Map(), "a", true, false, { getDoc: async () => { throw new Error("unavailable"); } });
  await h.loadSLA();
  assert.equal(h.callbacks.length, 1, "listener must survive failure of the initial one-shot read");
  h.callbacks[0]({ exists: () => true, data: () => ({ slaMinutes: 90 }), metadata: { fromCache: false } });
  assert.equal(h.state.slaMinutes, 90);
  assert.equal(h.state.slaLoaded, true);
});

test("CRM-012 review: teardown invalidates pending reads and queued listener callbacks", async () => {
  let completeRead;
  const h = controller(new Map(), "a", true, false, {
    getDoc: () => new Promise(resolve => { completeRead = resolve; })
  });
  const loading = h.loadSLA();
  h.teardownModalLifecycle();
  const snapshot = { exists: () => true, data: () => ({ slaMinutes: 120 }), metadata: { fromCache: false } };
  completeRead(snapshot);
  await loading;
  h.callbacks.forEach(callback => callback(snapshot));
  assert.equal(h.state.unsubscribeSLA, null, "destroy must not be followed by a resurrected subscription");
  assert.equal(h.state.slaMinutes, 30, "late read/listener must not mutate disposed state");
  assert.equal(h.state.slaLoaded, false);
});

test("CRM-012 review: terminal subscription error clears the retry guard", async () => {
  const h = controller(new Map());
  await h.loadSLA();
  h.errorCallbacks[0](new Error("permission-denied"));
  assert.equal(h.state.unsubscribeSLA, null, "openModal must be allowed to retry a stopped listener");
  assert.equal(h.state.slaLoaded, false);
  if (!h.state.unsubscribeSLA && h.state.canView) await h.loadSLA();
  assert.equal(h.callbacks.length, 2);
});
