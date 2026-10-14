// Sprint 106: o Admin SDK contorna Firestore Rules. O resolvedor compartilhado
// deve negar funcionários com Auth em sincronização antes de qualquer Callable.
import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, it } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const srcDir = path.join(root, "functions", "src");
const contextPath = path.join(srcDir, "shared", "context.js");
const requireFromFunctions = createRequire(path.join(srcDir, "index.js"));
let records = new Map();
const fakeDb = {
  doc: (docPath) => ({
    get: async () => ({
      exists: records.has(docPath),
      data: () => records.get(docPath)
    })
  })
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "firebase-admin/firestore" && parent?.filename === contextPath) {
    return { getFirestore: () => fakeDb };
  }
  return originalLoad.apply(this, arguments);
};
let resolveCallerContext;
try {
  ({ resolveCallerContext } = requireFromFunctions("./shared/context.js"));
} finally {
  Module._load = originalLoad;
}
const staffRequest = { auth: { uid: "staff-qa", token: { email: "staff@example.test" } } };
beforeEach(() => {
  records = new Map([
    ["usuarios/owner-qa", { status: "aprovado", plano: "pro" }],
    ["funcionarios/staff-qa", {
      donoUID: "owner-qa", status: "ativo",
      permissoes: { ver: ["leads"], editar: [] }
    }]
  ]);
});

describe("SPRINT-106-FUNCTIONS — bloqueio de Auth pendente no contexto server-side", () => {
  it("permite funcionário legado ativo, sem flag", async () => {
    const result = await resolveCallerContext(staffRequest);
    assert.equal(result.ownerUid, "owner-qa");
    assert.equal(result.isEmployee, true);
  });

  it("permite funcionário ativo com authSyncPendente false", async () => {
    records.set("funcionarios/staff-qa", {
      ...records.get("funcionarios/staff-qa"), authSyncPendente: false
    });
    const result = await resolveCallerContext(staffRequest);
    assert.equal(result.isEmployee, true);
  });

  it("nega funcionário ativo com authSyncPendente true, inclusive com token antigo válido", async () => {
    records.set("funcionarios/staff-qa", {
      ...records.get("funcionarios/staff-qa"), authSyncPendente: true,
      authSyncId: "qa-operacao-pendente"
    });
    await assert.rejects(() => resolveCallerContext(staffRequest),
      (error) => error.code === "permission-denied");
  });

  it("nega funcionário com tenant inativo mesmo quando flag não existe", async () => {
    records.set("usuarios/owner-qa", { status: "inativo", plano: "pro" });
    await assert.rejects(() => resolveCallerContext(staffRequest),
      (error) => error.code === "permission-denied");
  });
});
