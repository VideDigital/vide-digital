import assert from "node:assert/strict";
import fs from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc
} from "firebase/firestore";

const PROJECT_ID = "demo-vide-hub";
let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync("firestore.rules", "utf8")
    }
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "usuarios", "ownerA"), { status: "aprovado", plano: "pro", nomeLoja: "A" });
    await setDoc(doc(db, "usuarios", "ownerB"), { status: "aprovado", plano: "pro", nomeLoja: "B" });
    await setDoc(doc(db, "funcionarios", "employeeRead"), {
      donoUID: "ownerA",
      status: "ativo",
      permissoes: { ver: ["produtos"], editar: [] }
    });
    await setDoc(doc(db, "funcionarios", "employeeEdit"), {
      donoUID: "ownerA",
      status: "ativo",
      permissoes: { ver: ["produtos"], editar: ["produtos"] }
    });
    await setDoc(doc(db, "funcionarios", "employeeInactive"), {
      donoUID: "ownerA",
      status: "inativo",
      permissoes: { ver: ["produtos"], editar: ["produtos"] }
    });
    await setDoc(doc(db, "produtos", "prodA"), { criadoPor: "ownerA", statusProduto: "ativo", nome: "Produto A" });
    await setDoc(doc(db, "produtos", "prodPrivate"), { criadoPor: "ownerA", statusProduto: "rascunho", nome: "Produto Privado" });
    await setDoc(doc(db, "vitrines_publicas", "loja-a"), { donoUID: "ownerA", emailDono: "ownerA", nomeLoja: "Loja A" });
  });
});

after(async () => {
  await testEnv.cleanup();
});

function authed(uid, token = {}) {
  return testEnv.authenticatedContext(uid, token).firestore();
}

function anon() {
  return testEnv.unauthenticatedContext().firestore();
}

describe("usuarios", () => {
  it("owner cria cadastro pendente válido", async () => {
    await assertSucceeds(setDoc(doc(authed("newOwner"), "usuarios", "newOwner"), {
      identificador: "nova@example.com",
      nome: "Nova",
      email: "nova@example.com",
      nomeLoja: "Nova Loja",
      urlLoja: "nova-loja",
      status: "pendente",
      criadoEm: "2026-07-19T00:00:00.000Z"
    }));
  });

  it("owner não cria cadastro aprovado nem plano premium", async () => {
    await assertFails(setDoc(doc(authed("newOwner"), "usuarios", "newOwner"), {
      email: "nova@example.com",
      nomeLoja: "Nova Loja",
      urlLoja: "nova-loja",
      status: "aprovado",
      plano: "premium",
      criadoEm: "2026-07-19T00:00:00.000Z"
    }));
  });

  it("owner edita perfil mas não altera plano/status/features", async () => {
    await assertSucceeds(updateDoc(doc(authed("ownerA"), "usuarios", "ownerA"), { nomeLoja: "Loja A+" }));
    await assertFails(updateDoc(doc(authed("ownerA"), "usuarios", "ownerA"), { plano: "premium" }));
    await assertFails(updateDoc(doc(authed("ownerA"), "usuarios", "ownerA"), { status: "inativo" }));
    await assertFails(updateDoc(doc(authed("ownerA"), "usuarios", "ownerA"), { featuresManuais: ["*"] }));
  });
});

describe("tenant isolation", () => {
  it("owner não acessa produto privado de outro tenant", async () => {
    await assertFails(getDoc(doc(authed("ownerB"), "produtos", "prodPrivate")));
  });

  it("employee read-only lê, mas não escreve", async () => {
    await assertSucceeds(getDoc(doc(authed("employeeRead"), "produtos", "prodA")));
    await assertFails(updateDoc(doc(authed("employeeRead"), "produtos", "prodA"), { nome: "Novo" }));
  });

  it("employee edit escreve sem trocar criadoPor", async () => {
    await assertSucceeds(updateDoc(doc(authed("employeeEdit"), "produtos", "prodA"), { nome: "Novo" }));
    await assertFails(updateDoc(doc(authed("employeeEdit"), "produtos", "prodA"), { criadoPor: "ownerB" }));
  });

  it("employee inativo bloqueado", async () => {
    await assertFails(getDoc(doc(authed("employeeInactive"), "produtos", "prodPrivate")));
  });
});

describe("public writes", () => {
  it("público lê vitrine, mas não altera nem cria lead/métrica/chat direto", async () => {
    await assertSucceeds(getDoc(doc(anon(), "vitrines_publicas", "loja-a")));
    await assertFails(updateDoc(doc(anon(), "vitrines_publicas", "loja-a"), { donoUID: "attacker" }));
    await assertFails(setDoc(doc(anon(), "leads", "leadX"), { criadoPor: "ownerA" }));
    await assertFails(setDoc(doc(anon(), "metricas_vitrines", "ownerA"), { totalCliques: 999 }));
    await assertFails(setDoc(doc(anon(), "chats", "chatX"), { donoUID: "ownerA" }));
  });
});

describe("admin claims", () => {
  it("claim videAdmin permite atualizar status; sem claim bloqueia", async () => {
    await assertFails(updateDoc(doc(authed("ownerA"), "usuarios", "ownerB"), { status: "aprovado" }));
    await assertSucceeds(updateDoc(doc(authed("admin", { videAdmin: true }), "usuarios", "ownerB"), { status: "inativo" }));
  });
});
