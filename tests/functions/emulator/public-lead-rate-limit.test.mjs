// MISSÃO 075 — createPublicLead contra o Firestore Emulator: transação real
// do lead, assertRateLimit real (_rate_limits) e o handler real com
// requisições forjadas (XFF, rawRequest.ip, auth, Anonymous Auth, payload).
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, describe, it } from "node:test";
import { createRequire } from "node:module";
import { initializeApp, getApps, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import api from "../../../functions/src/public/index.js";

assert.match(process.env.FIRESTORE_EMULATOR_HOST || "", /^(127\.0\.0\.1|localhost):\d+$/, "Emulator only; never production");

const fnRequire = createRequire(new URL("../../../functions/src/index.js", import.meta.url));
const { HttpsError } = fnRequire("firebase-functions/v2/https");
const { handleCreatePublicLead, createLocalWindowLimiter, CREATE_PUBLIC_LEAD_PER_TENANT_PER_MIN: MAX } = api;

// assertRateLimit usa getFirestore() do app padrão; o handler recebe o mesmo db.
const app = getApps().length ? getApps()[0] : initializeApp({ projectId: "demo-vide-hub" });
const db = getFirestore(app);
const PREFIXO = `rl075-${Date.now()}`;
const OWNER_A = `${PREFIXO}-owner-a`;
const OWNER_B = `${PREFIXO}-owner-b`;
const SLUG_A = `${PREFIXO}-loja-a`;
const SLUG_A_ALIAS = `${PREFIXO}-loja-a-alias`;
const SLUG_B = `${PREFIXO}-loja-b`;
const LP_A = `${PREFIXO}-lp-a`;
const LP_A_RASCUNHO = `${PREFIXO}-lp-a-rascunho`;
const IPS = /203\.0\.113|198\.51\.100|192\.0\.2|2001:db8|2001_db8/;

const bucket = (owner) =>
  `_rate_limits/createPublicLead_tenant_${crypto.createHash("sha256").update(`createPublicLead|tenant:${owner}`).digest("hex").slice(0, 40)}`;

const deps = () => ({ db, valve: createLocalWindowLimiter({ max: 100000 }) });

function req(data, { xff, ip, uid, provedor } = {}) {
  return {
    data,
    rawRequest: { headers: xff === undefined ? {} : { "x-forwarded-for": xff }, ip },
    auth: uid ? { uid, token: { firebase: { sign_in_provider: provedor || "password" } } } : undefined
  };
}

async function docsLeadRateLimit() {
  const snap = await db.collection("_rate_limits").where("scope", "==", "createPublicLead").get();
  return snap.docs;
}

async function limparBuckets() {
  const snap = await db.collection("_rate_limits").where("scope", "==", "createPublicLead").get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

async function leadsDo(owner) {
  return (await db.collection("leads").where("criadoPor", "==", owner).get()).docs;
}

async function contagem(owner) {
  const snap = await db.doc(bucket(owner)).get();
  return snap.exists ? snap.data().count : 0;
}

before(async () => {
  await db.doc(`usuarios/${OWNER_A}`).set({ status: "aprovado" });
  await db.doc(`usuarios/${OWNER_B}`).set({ status: "aprovado" });
  await db.doc(`vitrines_publicas/${SLUG_A}`).set({ donoUID: OWNER_A, nomeLoja: "Loja A" });
  await db.doc(`vitrines_publicas/${SLUG_A_ALIAS}`).set({ donoUID: OWNER_A, nomeLoja: "Loja A alias" });
  await db.doc(`vitrines_publicas/${SLUG_B}`).set({ donoUID: OWNER_B, nomeLoja: "Loja B" });
  await db.doc(`landing_pages_publicas/${LP_A}`).set({ donoUID: OWNER_A, publicado: true, titulo: "LP A" });
  await db.doc(`landing_pages_publicas/${LP_A_RASCUNHO}`).set({ donoUID: OWNER_A, publicado: false });
});

after(async () => {
  await limparBuckets();
  await deleteApp(app);
});

describe("075 Emulator — createPublicLead com bucket por tenant", () => {
  it("loja e LP legítimas criam lead; mesmo tenant (loja, alias e LP) usa um único bucket", async () => {
    await limparBuckets();
    const r1 = await handleCreatePublicLead(req({ storeSlug: SLUG_A, nome: "Visitante loja" }), deps());
    const r2 = await handleCreatePublicLead(req({ publicPageId: LP_A, nome: "Visitante LP" }), deps());
    const r3 = await handleCreatePublicLead(req({ storeSlug: SLUG_A_ALIAS, nome: "Visitante alias" }), deps());
    for (const r of [r1, r2, r3]) {
      assert.equal(r.ok, true);
      assert.equal((await db.doc(`leads/${r.leadId}`).get()).data().criadoPor, OWNER_A);
    }
    const docs = await docsLeadRateLimit();
    assert.deepEqual(docs.map((d) => `_rate_limits/${d.id}`), [bucket(OWNER_A)]);
    assert.equal(await contagem(OWNER_A), 3);
  });

  it("XFF fixo/rotativo (primeiro, último, cadeia, IPv6, inválido), rawRequest.ip, auth e Anonymous Auth novos: um bucket só", async () => {
    await limparBuckets();
    const variantes = [
      { xff: "198.51.100.20" },
      { xff: "198.51.100.20" },
      { xff: "203.0.113.1, 198.51.100.20" },
      { xff: "203.0.113.2, 198.51.100.20" },
      { xff: "198.51.100.20, 203.0.113.3" },
      { xff: "10.0.0.1, 10.0.0.2, 203.0.113.4" },
      { xff: "2001:db8::5" },
      { xff: "nao-e-ip-6" },
      { xff: ", 203.0.113.7" },
      {},
      { ip: "192.0.2.9" },
      { uid: `${PREFIXO}-email-1` },
      { uid: `${PREFIXO}-email-2` },
      { uid: `${PREFIXO}-anon-${crypto.randomUUID()}`, provedor: "anonymous" },
      { uid: `${PREFIXO}-anon-${crypto.randomUUID()}`, provedor: "anonymous" }
    ];
    for (const v of variantes) await handleCreatePublicLead(req({ storeSlug: SLUG_A, nome: "V" }, v), deps());
    const docs = await docsLeadRateLimit();
    assert.deepEqual(docs.map((d) => `_rate_limits/${d.id}`), [bucket(OWNER_A)], "nenhum bucket por IP/auth");
    assert.equal(await contagem(OWNER_A), variantes.length);
    const bruto = JSON.stringify(docs.map((d) => [d.id, d.data()]));
    assert.doesNotMatch(bruto, IPS, "nenhum IP bruto em _rate_limits");
    assert.ok(!bruto.includes(OWNER_A) && !bruto.includes(PREFIXO), "nenhum ownerUid/uid bruto em _rate_limits");
  });

  it("ownerUid/tenantId/storeUid/criadoPor forjados não mudam bucket nem dono do lead", async () => {
    await limparBuckets();
    const r = await handleCreatePublicLead(req({ storeSlug: SLUG_A, nome: "V", ownerUid: OWNER_B, tenantId: OWNER_B, storeUid: OWNER_B, criadoPor: OWNER_B }), deps());
    assert.equal((await db.doc(`leads/${r.leadId}`).get()).data().criadoPor, OWNER_A);
    assert.equal(await contagem(OWNER_A), 1);
    assert.equal(await contagem(OWNER_B), 0);
  });

  it("DoS do novo bucket: hostis esgotam o tenant A, mas não o B nem criam buckets ilimitados", async () => {
    await limparBuckets();
    const antesA = (await leadsDo(OWNER_A)).length;
    for (let i = 0; i < MAX; i++) {
      const v = i % 2 === 0
        ? { xff: `203.0.113.${(i % 250) + 1}, 198.51.100.20` }
        : { uid: `${PREFIXO}-anon-hostil-${i}`, provedor: "anonymous" };
      await handleCreatePublicLead(req({ storeSlug: SLUG_A, nome: `Hostil ${i}` }, v), deps());
    }
    await assert.rejects(
      () => handleCreatePublicLead(req({ storeSlug: SLUG_A, nome: "Legítimo A" }, { xff: "198.51.100.77" }), deps()),
      (e) => e instanceof HttpsError && e.code === "resource-exhausted",
      "teto do tenant A atingido"
    );
    assert.equal((await leadsDo(OWNER_A)).length - antesA, MAX, "resource-exhausted não grava lead");
    const rB = await handleCreatePublicLead(req({ storeSlug: SLUG_B, nome: "Legítimo B" }, { xff: "203.0.113.1" }), deps());
    assert.equal(rB.ok, true, "tenant B não é afetado pelo esgotamento de A");
    const docs = await docsLeadRateLimit();
    assert.deepEqual(docs.map((d) => `_rate_limits/${d.id}`).sort(), [bucket(OWNER_A), bucket(OWNER_B)].sort(), "2 tenants → 2 docs, não 60+");
    assert.equal(await contagem(OWNER_A), MAX);
    assert.equal(await contagem(OWNER_B), 1);
  });

  it("idempotência: retry com o mesmo dedupeKey não duplica; tokens diferentes criam dois leads", async () => {
    await limparBuckets();
    const base = { storeSlug: SLUG_B, nome: "Idempotência", email: `idem.${PREFIXO}@example.test` };
    const [a, b] = await Promise.all([1, 2].map(() => handleCreatePublicLead(req({ ...base, dedupeKey: "token-1" }), deps())));
    assert.equal(a.leadId, b.leadId, "retry concorrente devolve o mesmo lead");
    const c = await handleCreatePublicLead(req({ ...base, dedupeKey: "token-2" }), deps());
    assert.notEqual(c.leadId, a.leadId);
    const leads = (await leadsDo(OWNER_B)).filter((d) => d.data().email === base.email);
    assert.equal(leads.length, 2);
  });

  it("LP não publicada, tenant inexistente e payload inválido: sem lead e sem bucket", async () => {
    await limparBuckets();
    const antesA = (await leadsDo(OWNER_A)).length;
    await assert.rejects(() => handleCreatePublicLead(req({ publicPageId: LP_A_RASCUNHO, nome: "V" }), deps()), (e) => e.code === "failed-precondition");
    for (let i = 0; i < 10; i++) {
      await assert.rejects(() => handleCreatePublicLead(req({ storeSlug: `${PREFIXO}-fantasma-${i}`, nome: "V" }, { xff: `203.0.113.${i + 1}` }), deps()), (e) => e.code === "not-found");
    }
    await assert.rejects(() => handleCreatePublicLead(req({ storeSlug: SLUG_A }), deps()), (e) => e.code === "invalid-argument");
    assert.equal((await docsLeadRateLimit()).length, 0, "nenhum bucket de alta cardinalidade");
    assert.equal((await leadsDo(OWNER_A)).length, antesA);
  });

  it("válvula local esgotada: resource-exhausted sem escrita no Firestore", async () => {
    await limparBuckets();
    const antesA = (await leadsDo(OWNER_A)).length;
    await assert.rejects(
      () => handleCreatePublicLead(req({ storeSlug: SLUG_A, nome: "V" }), { db, valve: createLocalWindowLimiter({ max: 0 }) }),
      (e) => e instanceof HttpsError && e.code === "resource-exhausted"
    );
    assert.equal((await docsLeadRateLimit()).length, 0);
    assert.equal((await leadsDo(OWNER_A)).length, antesA);
  });

  it("dono trocado entre o rate limit e a transação: falha fechado, sem lead", async () => {
    await assert.rejects(
      () => api.createLeadIdempotent({ storeSlug: SLUG_A, nome: "V" }, db, { expectedOwnerUid: OWNER_B }),
      (e) => e instanceof HttpsError && e.code === "failed-precondition"
    );
  });
});
