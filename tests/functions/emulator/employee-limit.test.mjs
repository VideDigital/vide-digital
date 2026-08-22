// Regressão do achado de auditoria de beta: a criação de funcionário só é
// segura contra o limite do plano porque createEmployee (Cloud Function,
// Admin SDK) chama assertEmployeeLimit ANTES de escrever — e as Rules agora
// negam create direto em funcionarios/{uid} (ver firestore.rules e
// tests/emulator/firestore-security.test.mjs). Este teste cobre a peça que
// as Rules não conseguem testar: a contagem real do limite, contra um
// Firestore de verdade (emulador via FIRESTORE_EMULATOR_HOST), não um mock.
//
// Roda com: firebase emulators:exec --only firestore "node --test tests/functions/emulator/employee-limit.test.mjs"
import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "demo-vide-hub";

const { getApps, initializeApp } = await import("firebase-admin/app");
const { getFirestore } = await import("firebase-admin/firestore");
const employees = (await import("../../../functions/src/employees/index.js")).default;
const { assertEmployeeLimit } = employees;

if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT });

const db = getFirestore();

// Sufixo aleatório por chamada — chamar seedFuncionarios mais de uma vez
// pro mesmo ownerUid (ex.: "seed 2, depois mais 1") precisa ACRESCENTAR
// documentos, nunca sobrescrever os já criados por uma chamada anterior.
async function seedFuncionarios(ownerUid, quantidadeAtivos, quantidadeInativos = 0) {
  const lote = Math.random().toString(36).slice(2, 8);
  const batch = db.batch();
  for (let i = 0; i < quantidadeAtivos; i += 1) {
    batch.set(db.doc(`funcionarios/${ownerUid}-${lote}-ativo-${i}`), { donoUID: ownerUid, status: "ativo" });
  }
  for (let i = 0; i < quantidadeInativos; i += 1) {
    batch.set(db.doc(`funcionarios/${ownerUid}-${lote}-inativo-${i}`), { donoUID: ownerUid, status: "inativo" });
  }
  if (quantidadeAtivos > 0 || quantidadeInativos > 0) await batch.commit();
}

async function limparFuncionarios(ownerUid) {
  const snap = await db.collection("funcionarios").where("donoUID", "==", ownerUid).get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.forEach((docSnap) => batch.delete(docSnap.ref));
  await batch.commit();
}

describe("assertEmployeeLimit — contagem real contra o Firestore (não mais bypassável)", () => {
  beforeEach(async () => {
    await limparFuncionarios("ownerLimiteA");
    await limparFuncionarios("ownerLimiteB");
  });

  it("plano starter (limite 0): bloqueia a primeira contratação", async () => {
    await assert.rejects(
      () => assertEmployeeLimit("ownerLimiteA", { plano: "starter" }),
      /Limite de funcionários do plano atingido/
    );
  });

  it("plano proplus (limite 3): permite abaixo do limite, bloqueia ao atingir", async () => {
    await seedFuncionarios("ownerLimiteA", 2);
    await assert.doesNotReject(() => assertEmployeeLimit("ownerLimiteA", { plano: "proplus" }));

    await seedFuncionarios("ownerLimiteA", 1);
    await assert.rejects(
      () => assertEmployeeLimit("ownerLimiteA", { plano: "proplus" }),
      /Limite de funcionários do plano atingido/
    );
  });

  it("funcionário inativo não conta para o limite", async () => {
    await seedFuncionarios("ownerLimiteA", 0, 5);
    await assert.doesNotReject(() => assertEmployeeLimit("ownerLimiteA", { plano: "pro" }));
  });

  it("contagem é por tenant — funcionários de outro dono nunca contam", async () => {
    await seedFuncionarios("ownerLimiteB", 10);
    await assert.doesNotReject(() => assertEmployeeLimit("ownerLimiteA", { plano: "pro" }));
  });

  it("plano ilimitado (limite -1) nunca bloqueia, mesmo com muitos funcionários", async () => {
    await seedFuncionarios("ownerLimiteA", 25);
    await assert.doesNotReject(() => assertEmployeeLimit("ownerLimiteA", { plano: "enterprise" }));
  });

  it("plano desconhecido cai no limite do starter (fallback seguro)", async () => {
    await assert.rejects(
      () => assertEmployeeLimit("ownerLimiteA", { plano: "plano-que-nao-existe" }),
      /Limite de funcionários do plano atingido/
    );
  });
});
