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

// Sprint 106: quota checks must be atomic (both create AND reactivate).
// All fixtures are scoped to demo-vide-hub Firestore Emulator.
const { mutateEmployeeCapacity } = (await import("../../../functions/src/employees/capacity.js")).default;
const capOwner = "s106-capacity-owner";

async function capFixture(plan = "pro", status = "aprovado") {
  await limparFuncionarios(capOwner);
  await db.doc(`employee_capacity_guards/${capOwner}`).delete();
  await db.doc(`usuarios/${capOwner}`).set({ plano: plan, status });
}
function mutate(employeeUid, operation, extra = {}) {
  return mutateEmployeeCapacity({
    db, ownerUid: capOwner, employeeUid, operation,
    actorUid: capOwner, ...extra
  });
}
function newPayload(email) {
  return { nome: "QA Sprint 106", email, criadoPorAuthUid: capOwner };
}

describe("Sprint 106 — vagas atômicas por tenant", () => {
  beforeEach(async () => capFixture());

  it("duas criações concorrentes não excedem plano pro (limite 1)", async () => {
    const results = await Promise.allSettled([
      mutate("s106-create-a", "create", { payload: newPayload("a@qa.invalid") }),
      mutate("s106-create-b", "create", { payload: newPayload("b@qa.invalid") })
    ]);
    assert.equal(results.filter(x => x.status === "fulfilled").length, 1);
    assert.equal(results.filter(x => x.status === "rejected").length, 1);
    assert.match(String(results.find(x => x.status === "rejected").reason), /Limite de funcionários/);
    const active = await db.collection("funcionarios").where("donoUID", "==", capOwner).where("status", "==", "ativo").get();
    assert.equal(active.size, 1);
  });

  it("reativação nega quando a vaga já está ocupada", async () => {
    await mutate("s106-active", "create", { payload: newPayload("active@qa.invalid") });
    await db.doc("funcionarios/s106-inactive").set({ donoUID: capOwner, status: "inativo" });
    await assert.rejects(() => mutate("s106-inactive", "enable"), /Limite de funcionários/);
    assert.equal((await db.doc("funcionarios/s106-inactive").get()).data().status, "inativo");
  });

  it("reativações concorrentes disputam a mesma última vaga", async () => {
    await db.doc("funcionarios/s106-inactive-a").set({ donoUID: capOwner, status: "inativo" });
    await db.doc("funcionarios/s106-inactive-b").set({ donoUID: capOwner, status: "inativo" });
    const results = await Promise.allSettled([
      mutate("s106-inactive-a", "enable"),
      mutate("s106-inactive-b", "enable")
    ]);
    assert.equal(results.filter(x => x.status === "fulfilled").length, 1);
    assert.equal(results.filter(x => x.status === "rejected").length, 1);
    assert.match(String(results.find(x => x.status === "rejected").reason), /Limite de funcionários/);
  });

  it("desativar libera vaga; reativação repetida é idempotente", async () => {
    await mutate("s106-first", "create", { payload: newPayload("first@qa.invalid") });
    await mutate("s106-first", "disable");
    await mutate("s106-second", "create", { payload: newPayload("second@qa.invalid") });
    await assert.rejects(() => mutate("s106-first", "enable"), /Limite de funcionários/);
    const repeated = await mutate("s106-second", "enable");
    assert.equal(repeated.changed, false);
  });

  it("status de loja não aprovado bloqueia create e enable", async () => {
    await capFixture("pro", "pendente");
    await db.doc("funcionarios/s106-pending").set({ donoUID: capOwner, status: "inativo" });
    await assert.rejects(
      () => mutate("s106-unapproved", "create", { payload: newPayload("pending@qa.invalid") }),
      /Loja não aprovada/
    );
    await assert.rejects(() => mutate("s106-pending", "enable"), /Loja não aprovada/);
  });

  it("não altera funcionário de outro tenant e preserva o outro tenant", async () => {
    await db.doc("funcionarios/s106-other").set({ donoUID: "s106-tenant-other", status: "inativo" });
    await assert.rejects(() => mutate("s106-other", "enable"), /outro tenant/);
    assert.equal((await db.doc("funcionarios/s106-other").get()).data().status, "inativo");
    await db.doc("funcionarios/s106-other").delete();
  });

  it("rollback da criação libera a vaga sem afetar outra conta", async () => {
    await mutate("s106-to-rollback", "create", { payload: newPayload("rollback@qa.invalid") });
    await mutate("s106-to-rollback", "rollback-create");
    assert.equal((await db.doc("funcionarios/s106-to-rollback").get()).exists, false);
    await mutate("s106-reuse", "create", { payload: newPayload("reuse@qa.invalid") });
    assert.equal((await db.doc("funcionarios/s106-reuse").get()).data().status, "ativo");
  });
});
