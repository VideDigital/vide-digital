import assert from "node:assert/strict";
import { test } from "node:test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import api from "../../../functions/src/public/index.js";
import { normalizeExtraFields } from "../../../lead-engine-core.js";

assert.match(process.env.FIRESTORE_EMULATOR_HOST || "", /^(127\.0\.0\.1|localhost):\d+$/, "Emulator only; never production");

test("public lead metadata: real transaction, historical snapshot, dedupe and tenant isolation", async () => {
  const app = initializeApp({ projectId: "demo-vide-hub" }, "astra-metadata");
  const db = getFirestore(app);
  const prefix = `astra-meta-${Date.now()}`;
  const pageId = `${prefix}__lp`;
  const blockId = `${prefix}-form`;
  const owner = `${prefix}-owner`;
  const extra = { empresa_smoke_pr61: "SMOKE-PR61-LEAD-002" };
  const request = { publicPageId: pageId, nome: "Synthetic QA", camposExtras: extra, blocoOrigem: blockId,
    camposExtrasMeta: { empresa_smoke_pr61: { label: "VISITOR SPOOF" } } };
  const pageRef = db.doc(`landing_pages_publicas/${pageId}`);
  const blockRef = db.doc(`landing_pages_blocos_publicas/${blockId}`);
  try {
    await db.doc(`usuarios/${owner}`).set({ status: "aprovado" });
    await pageRef.set({ donoUID: owner, publicado: true, ordemBlocos: [blockId] });
    const schema = (label, donoUID = owner) => ({ donoUID, tipo: "formulario_captura", props: { campos: [{ name: "empresa_smoke_pr61", label, type: "text", required: true }] } });
    await blockRef.set(schema("Empresa Smoke PR61"));
    const firstId = await api.createLeadIdempotent({ ...request, dedupeKey: "old" }, db);
    await blockRef.set(schema("Empresa Smoke PR61 Renomeada"));
    const results = await Promise.all([1, 2].map(() => api.createLeadIdempotent({ ...request, dedupeKey: "new" }, db)));
    assert.equal(results[0], results[1], "concurrent retry creates exactly one lead");
    const first = (await db.doc(`leads/${firstId}`).get()).data();
    const latest = (await db.doc(`leads/${results[0]}`).get()).data();
    assert.equal(first.camposExtrasMeta.empresa_smoke_pr61.label, "Empresa Smoke PR61");
    assert.equal(latest.camposExtrasMeta.empresa_smoke_pr61.label, "Empresa Smoke PR61 Renomeada");
    assert.deepEqual(latest.camposExtras, extra);
    assert.equal(latest.criadoPor, owner);
    await blockRef.set(schema("Third revision"));
    assert.equal(await api.createLeadIdempotent({ ...request, dedupeKey: "new" }, db), results[0]);
    assert.deepEqual((await db.doc(`leads/${results[0]}`).get()).data().camposExtrasMeta, latest.camposExtrasMeta);

    await blockRef.set(schema("Private other tenant", "other-tenant"));
    await assert.rejects(api.createLeadIdempotent(request, db), (e) => e.code === "failed-precondition");
    await blockRef.set({ donoUID: owner, tipo: "formulario_captura", props: { campos: ["nome"] } });
    const legacyId = await api.createLeadIdempotent(request, db);
    const legacy = (await db.doc(`leads/${legacyId}`).get()).data();
    assert.equal(legacy.camposExtrasMeta, undefined, "removed/missing schema uses legacy fallback");
    assert.equal(normalizeExtraFields(legacy.camposExtras)[0].label, "Empresa smoke pr61");
    await pageRef.update({ publicado: false });
    await assert.rejects(api.createLeadIdempotent(request, db), (e) => e.code === "failed-precondition");
    await pageRef.delete();
    await blockRef.delete();
    await assert.rejects(api.createLeadIdempotent(request, db), (e) => e.code === "not-found");
    assert.equal(normalizeExtraFields(latest.camposExtras, latest.camposExtrasMeta)[0].label, "Empresa Smoke PR61 Renomeada", "historical CRM survives unpublish/delete");
    const all = await db.collection("leads").where("criadoPor", "==", owner).get();
    assert.equal(all.size, 3, "old + new + legacy; rejected calls and retry produce no extra records");
  } finally {
    await deleteApp(app);
  }
});
