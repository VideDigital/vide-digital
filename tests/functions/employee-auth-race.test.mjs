// Sprint 106: deterministic interleavings across Firestore and Firebase Auth.
// Auth is fake; the transaction orchestration is real production code.
// The independent Firestore Emulator suite asserts the transaction lock itself.
import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, it } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const srcDir = path.join(root, "functions", "src");
const fnRequire = createRequire(path.join(srcDir, "index.js"));

let state;
const snapshot = (data) => ({ exists: !!data, data: () => data || {} });
const DEL = Symbol("FieldValue.delete");
const FieldValue = {
  increment: (n) => ({ inc: n }),
  serverTimestamp: () => "now",
  delete: () => DEL
};
function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}
const auth = {
  updateUser: async (_uid, patch) => {
    if (state.blockAuthOnDisabled === patch.disabled && state.waitForAuth) {
      const block = state.waitForAuth;
      state.waitForAuth = null;
      block.entered.resolve();
      await block.release.promise;
    }
    if (state.failAuth) {
      throw new Error("falha transitória simulada de Auth");
    }
    state.authDisabled = patch.disabled;
  },
  revokeRefreshTokens: async () => {
    if (state.failRevoke) throw new Error("falha simulada ao revogar tokens");
  }
};
const db = {
  doc: (p) => ({ path: p }),
  collection: (_name) => ({ where: () => ({ where: () => ({ query: true }) }) }),
  runTransaction: async (fn) => {
    const changes = [];
    const tx = {
      get: async (ref) => {
        if (!ref?.path) return { size: state.employee?.status === "ativo" ? 1 : 0 };
        if (ref.path.startsWith("usuarios/")) return snapshot({ status: "aprovado", plano: "pro" });
        if (ref.path.startsWith("funcionarios/")) return snapshot(state.employee);
        return snapshot(state.guard);
      },
      update: (ref, data) => changes.push({ kind: "update", path: ref.path, data }),
      set: (ref, data) => changes.push({ kind: "set", path: ref.path, data }),
      create: (ref, data) => changes.push({ kind: "create", path: ref.path, data }),
      delete: (ref) => changes.push({ kind: "delete", path: ref.path })
    };
    const answer = await fn(tx);
    for (const op of changes) {
      if (op.path.startsWith("funcionarios/")) {
        if (op.kind === "delete") state.employee = null;
        else {
          const merged = { ...(state.employee || {}), ...op.data };
          for (const [k, v] of Object.entries(merged)) if (v === DEL) delete merged[k];
          state.employee = merged;
        }
      } else if (op.path.startsWith("employee_capacity_guards/")) {
        state.guard = { revision: (state.guard?.revision || 0) + 1 };
      }
    }
    return answer;
  }
};
const original = Module._load;
Module._load = function (request, parent, isMain) {
  if (parent?.filename?.startsWith(srcDir + path.sep)) {
    if (request === "firebase-admin/firestore") return { getFirestore: () => db, FieldValue };
    if (request === "firebase-admin/auth") return { getAuth: () => auth };
    if (request.startsWith(".")) {
      const resolved = Module._resolveFilename(request, parent, isMain);
      if (resolved === path.join(srcDir, "shared", "context.js")) {
        return { resolveCallerContext: async () => ({
          authUid: "ownerA", ownerUid: "ownerA", isOwner: true, isAdmin: false
        }) };
      }
      if (resolved === path.join(srcDir, "audit", "index.js")) {
        return { writeAudit: async () => {} };
      }
    }
  }
  return original.apply(this, arguments);
};
const { enableEmployee, disableEmployee } = fnRequire("./employees/index.js");
Module._load = original;

const req = { auth: { uid: "ownerA" }, data: { uid: "employee-A" } };
beforeEach(() => {
  state = {
    employee: { donoUID: "ownerA", status: "inativo",
      permissoes: { ver: ["produtos"], editar: [] } },
    guard: null,
    authDisabled: true,
    blockAuthOnDisabled: null,
    waitForAuth: null,
    failAuth: false,
    failRevoke: false
  };
});

describe("SPRINT-106-AUTH-RACE — operação externa Auth serializada pela guarda Firestore", () => {
  it("ENABLE travado não permite DISABLE ultrapassar e inverter estado de Auth", async () => {
    const blocked = { entered: deferred(), release: deferred() };
    state.blockAuthOnDisabled = false;
    state.waitForAuth = blocked;
    const first = enableEmployee.run(req);
    await blocked.entered.promise;
    assert.equal(state.employee.status, "ativo");
    assert.equal(state.employee.authSyncPendente, true);
    try {
      await assert.rejects(
        () => disableEmployee.run(req),
        (err) => err.code === "failed-precondition"
      );
    } finally {
      blocked.release.resolve();
    }
    const result = await first;
    assert.equal(result.status, "ativo");
    assert.equal(state.authDisabled, false);
    assert.equal(state.employee.status, "ativo");
    assert.equal(state.employee.authSyncPendente, false);
  });

  it("DISABLE travado não permite ENABLE ultrapassar e inverter estado de Auth", async () => {
    state.employee.status = "ativo";
    state.authDisabled = false;
    const blocked = { entered: deferred(), release: deferred() };
    state.blockAuthOnDisabled = true;
    state.waitForAuth = blocked;
    const first = disableEmployee.run(req);
    await blocked.entered.promise;
    assert.equal(state.employee.status, "inativo");
    assert.equal(state.employee.authSyncPendente, true);
    try {
      await assert.rejects(
        () => enableEmployee.run(req),
        (err) => err.code === "failed-precondition"
      );
    } finally {
      blocked.release.resolve();
    }
    await first;
    assert.equal(state.authDisabled, true);
    assert.equal(state.employee.status, "inativo");
    assert.equal(state.employee.authSyncPendente, false);
  });

  it("falha inesperada de Auth mantém pendência fail-closed e bloqueia nova operação", async () => {
    state.failAuth = true;
    await assert.rejects(() => enableEmployee.run(req), (err) => err.code === "internal");
    assert.equal(state.employee.status, "ativo");
    assert.equal(state.employee.authSyncPendente, true);
    await assert.rejects(() => disableEmployee.run(req),
      (err) => err.code === "failed-precondition");
  });

  it("falha em revokeRefreshTokens deixa Auth-sync pendente para reconciliação", async () => {
    state.failRevoke = true;
    await assert.rejects(() => enableEmployee.run(req), (err) => err.code === "internal");
    assert.equal(state.authDisabled, false);
    assert.equal(state.employee.authSyncPendente, true);
    await assert.rejects(() => disableEmployee.run(req),
      (err) => err.code === "failed-precondition");
  });

  it("falha na finalização não libera lock nem admite retry após Auth habilitado", async () => {
    const originalTx = db.runTransaction;
    let calls = 0;
    db.runTransaction = async fn => {
      if (++calls === 2) throw new Error('commit completion failed');
      return originalTx(fn);
    };
    try {
      await assert.rejects(() => enableEmployee.run(req), e => e.code === 'internal');
      assert.equal(state.authDisabled, false);
      assert.equal(state.employee.authSyncPendente, true);
      await assert.rejects(() => enableEmployee.run(req), e => e.code === 'failed-precondition');
    } finally { db.runTransaction = originalTx; }
  });

  it("double-click ENABLE não dispara segunda mutação externa", async () => {
    const blocked = {entered: deferred(), release: deferred()};
    state.blockAuthOnDisabled = false;
    state.waitForAuth = blocked;
    const first = enableEmployee.run(req);
    await blocked.entered.promise;
    try { await assert.rejects(() => enableEmployee.run(req), e => e.code === 'failed-precondition'); }
    finally { blocked.release.resolve(); }
    await first;
    assert.equal(state.authDisabled, false);
    assert.equal(state.employee.authSyncPendente, false);
  });
});
