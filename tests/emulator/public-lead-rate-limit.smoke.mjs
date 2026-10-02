// MISSÃO 075 — createPublicLead pela borda HTTP real do Functions Emulator:
// X-Forwarded-For de verdade no request, Anonymous Auth real (Auth Emulator)
// e o _rate_limits real. Prova que o bucket é por tenant resolvido no
// servidor e que nenhuma identidade de chamador abre cota nova.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT_ID = "demo-vide-hub";
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080", "Emulator only; never production");
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9099", "Emulator only; never production");

if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();
const ENDPOINT = `http://127.0.0.1:5001/${PROJECT_ID}/southamerica-east1/createPublicLead`;
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key";
const MAX = 60;
const PREFIXO = `rl075-http-${Date.now()}`;
const OWNER_A = `${PREFIXO}-owner-a`;
const OWNER_B = `${PREFIXO}-owner-b`;
const SLUG_A = `${PREFIXO}-loja-a`;
const SLUG_B = `${PREFIXO}-loja-b`;

const bucketId = (owner) =>
  `createPublicLead_tenant_${crypto.createHash("sha256").update(`createPublicLead|tenant:${owner}`).digest("hex").slice(0, 40)}`;

async function chamar(data, headers = {}) {
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ data })
  });
  const corpo = await r.json().catch(() => ({}));
  return { http: r.status, status: corpo?.error?.status || "OK", leadId: corpo?.result?.leadId };
}

async function tokenAnonimoNovo() {
  const r = await fetch(AUTH, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ returnSecureToken: true }) });
  const j = await r.json();
  assert.ok(j.idToken && j.localId, "Auth Emulator deveria criar um usuário anônimo");
  return j.idToken;
}

async function bucketsDeLead() {
  const snap = await db.collection("_rate_limits").where("scope", "==", "createPublicLead").get();
  return snap.docs.filter((d) => d.id.startsWith("createPublicLead_"));
}

await db.doc(`usuarios/${OWNER_A}`).set({ status: "aprovado" });
await db.doc(`usuarios/${OWNER_B}`).set({ status: "aprovado" });
await db.doc(`vitrines_publicas/${SLUG_A}`).set({ donoUID: OWNER_A, nomeLoja: "Loja A QA 075" });
await db.doc(`vitrines_publicas/${SLUG_B}`).set({ donoUID: OWNER_B, nomeLoja: "Loja B QA 075" });
await Promise.all((await bucketsDeLead()).map((d) => d.ref.delete()));

// 1) Cabeçalhos de origem variados → um bucket só, do tenant A.
const variantes = [
  { "x-forwarded-for": "198.51.100.20" },
  { "x-forwarded-for": "203.0.113.1, 198.51.100.20" },
  { "x-forwarded-for": "203.0.113.2, 198.51.100.20" },
  { "x-forwarded-for": "198.51.100.20, 203.0.113.3" },
  { "x-forwarded-for": "10.0.0.1, 10.0.0.2, 203.0.113.4" },
  { "x-forwarded-for": "2001:db8::5" },
  { "x-forwarded-for": "nao-e-ip" },
  { "x-forwarded-for": ", 203.0.113.8" },
  {}
];
for (const headers of variantes) {
  const r = await chamar({ storeSlug: SLUG_A, nome: "Visitante QA 075" }, headers);
  assert.equal(r.status, "OK", `lead legítimo deveria passar (${JSON.stringify(headers)})`);
}
// 2) Anonymous Auth com uid NOVO a cada chamada → mesmo bucket.
for (let i = 0; i < 3; i++) {
  const r = await chamar({ storeSlug: SLUG_A, nome: "Visitante anônimo QA 075" }, { authorization: `Bearer ${await tokenAnonimoNovo()}`, "x-forwarded-for": `203.0.113.${20 + i}` });
  assert.equal(r.status, "OK");
}
let docs = await bucketsDeLead();
assert.deepEqual(docs.map((d) => d.id), [bucketId(OWNER_A)], "um único bucket do tenant, nenhum ip_/auth_");
assert.equal(docs[0].data().count, variantes.length + 3);
console.log(`createPublicLead 075: ${variantes.length} variações de XFF + 3 uids anônimos novos → 1 bucket (tenant A).`);

// 3) Tenant B tem bucket separado.
assert.equal((await chamar({ storeSlug: SLUG_B, nome: "Visitante B QA 075" }, { "x-forwarded-for": "203.0.113.1" })).status, "OK");

// 4) Esgota A com XFF rotativo; a chamada seguinte de A é recusada e B continua.
for (let i = variantes.length + 3; i < MAX; i++) {
  const r = await chamar({ storeSlug: SLUG_A, nome: `Visitante QA 075 ${i}` }, { "x-forwarded-for": `203.0.113.${(i % 250) + 1}` });
  assert.equal(r.status, "OK", `chamada ${i + 1} de ${MAX} deveria passar`);
}
const excedente = await chamar({ storeSlug: SLUG_A, nome: "Excedente QA 075" }, { "x-forwarded-for": "198.51.100.99" });
assert.equal(excedente.status, "RESOURCE_EXHAUSTED", "a 61ª chamada do tenant A deveria ser recusada");
assert.equal((await chamar({ storeSlug: SLUG_B, nome: "Visitante B2 QA 075" }, { "x-forwarded-for": "198.51.100.99" })).status, "OK", "tenant B não pode ser bloqueado por A");

docs = await bucketsDeLead();
assert.deepEqual(docs.map((d) => d.id).sort(), [bucketId(OWNER_A), bucketId(OWNER_B)].sort());
const bruto = JSON.stringify(docs.map((d) => [d.id, d.data()]));
assert.doesNotMatch(bruto, /203\.0\.113|198\.51\.100|2001:db8|2001_db8|127\.0\.0\.1|nao-e-ip/, "nenhum IP bruto em _rate_limits");
assert.ok(!bruto.includes(OWNER_A) && !bruto.includes(OWNER_B), "nenhum ownerUid bruto em _rate_limits");
const leadsA = await db.collection("leads").where("criadoPor", "==", OWNER_A).get();
assert.equal(leadsA.size, MAX, "exatamente o teto do tenant A virou lead");

await Promise.all(docs.map((d) => d.ref.delete()));
console.log("createPublicLead 075: teto por tenant (60/min), isolamento A×B e ausência de IP/owner bruto validados pela borda HTTP.");
process.exit(0);
