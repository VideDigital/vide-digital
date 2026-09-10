// Diagnostic composition evidence only: PR74 capture -> PR75 real merge -> PR76 Rules.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { initializeTestEnvironment, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, runTransaction } from "firebase/firestore";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import api from "../../../functions/src/public/index.js";
import * as core from "../../../lead-engine-core.js";

assert.match(process.env.FIRESTORE_EMULATOR_HOST || "", /^(127\.0\.0\.1|localhost):\d+$/);
const engine = readFileSync("lead-engine-v5.js", "utf8");
const start = engine.indexOf("async function mergeDuplicateGroup(");
const end = engine.indexOf("function exportCSV(", start);
assert.ok(start >= 0 && end > start);
const noop = () => {};

test("release train: public capture, fresh CRM merge, historical labels and tenant Rules coexist", async () => {
  const env = await initializeTestEnvironment({ projectId: "demo-vide-hub", firestore: { rules: readFileSync("firestore.rules", "utf8") } });
  const app = initializeApp({ projectId: "demo-vide-hub" }, "release-train");
  const admin = getFirestore(app);
  const owner = "train-owner", foreign = "train-foreign";
  const db = env.authenticatedContext(owner).firestore();
  const other = env.authenticatedContext(foreign).firestore();
  try {
    await admin.doc(`usuarios/${owner}`).set({ status: "aprovado" });
    await admin.doc(`usuarios/${foreign}`).set({ status: "aprovado" });
    await admin.doc("landing_pages_publicas/train-page").set({ donoUID: owner, publicado: true, ordemBlocos: ["train-block"] });
    await admin.doc("landing_pages_blocos_publicas/train-block").set({ donoUID: owner, tipo: "formulario_captura", props: { campos: [{ name: "empresa", label: "Empresa original" }] } });
    const request = { publicPageId: "train-page", blocoOrigem: "train-block", nome: "Synthetic", camposExtras: { empresa: "ACME" }, camposExtrasMeta: { empresa: { label: "SPOOF" } }, ownerUid: foreign, tenantId: foreign, dedupeKey: "train-attempt" };
    const ids = await Promise.all([api.createLeadIdempotent(request, admin), api.createLeadIdempotent(request, admin)]);
    assert.equal(ids[0], ids[1]);
    const duplicate = (await admin.doc(`leads/${ids[0]}`).get()).data();
    assert.equal(duplicate.criadoPor, owner);
    assert.equal(duplicate.camposExtrasMeta.empresa.label, "Empresa original");
    await admin.doc("landing_pages_blocos_publicas/train-block").update({ "props.campos": [{ name: "empresa", label: "Renamed" }] });
    await setDoc(doc(db, "leads", "train-primary"), { criadoPor: owner, nome: "Legacy", valorOportunidade: 0.5 });
    const group = { leads: [{ id: "train-primary", criadoPor: owner, valorOportunidade: 0.5 }, { ...duplicate, id: ids[0] }] };
    // Simulate another editor committing after the displayed group was captured.
    await updateDoc(doc(db, "leads", "train-primary"), { valorOportunidade: 99.9 });
    const errors = [];
    const bindings = {
      state: { canEdit: true, ownerUid: owner }, db, doc, runTransaction,
      toast: (message, kind) => { if (kind === "error") errors.push(message); },
      window: { confirm: () => true }, MAX_BATCH_SIZE: 400, MAX_HISTORY: 120,
      anyTimestamp: core.anyTimestamp, numericValue: core.numericValue,
      mergeLeadCommercialFields: core.mergeLeadCommercialFields,
      makeHistoryEvent: () => ({ tipo: "merge", timestamp: Date.now() }),
      loadLeads: noop, updateActiveTabUI: noop, render: noop, console
    };
    const merge = new Function(...Object.keys(bindings), `${engine.slice(start, end)}; return mergeDuplicateGroup;`)(...Object.values(bindings));
    await merge(group);
    assert.deepEqual(errors, [], "actual CRM writes must satisfy composed Rules");
    const merged = (await getDoc(doc(db, "leads", "train-primary"))).data();
    assert.equal(merged.valorOportunidade, 99.9, "transaction uses current record and preserves decimals");
    assert.equal(merged.camposExtras.empresa, "ACME");
    assert.equal(core.normalizeExtraFields(merged.camposExtras, merged.camposExtrasMeta)[0].label, "Empresa original");
    assert.equal((await getDoc(doc(db, "leads", ids[0]))).data().duplicadoDe, "train-primary");
    await merge(group);
    assert.deepEqual(errors, [], "repeating completed merge is harmless");
    assert.deepEqual((await getDoc(doc(db, "leads", "train-primary"))).data(), merged);
    await assertFails(getDoc(doc(other, "leads", "train-primary")));
    await assertFails(updateDoc(doc(other, "leads", "train-primary"), { anotacao: "spoof" }));
    await setDoc(doc(db, "lead_settings", owner), { slaMinutes: 45 });
    await assertFails(getDoc(doc(other, "lead_settings", owner)));
    assert.equal((await getDoc(doc(db, "lead_settings", owner))).data().slaMinutes, 45);
  } finally {
    await env.cleanup();
    await deleteApp(app);
  }
});
