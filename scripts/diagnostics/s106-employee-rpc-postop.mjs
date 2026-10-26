// TEMPORARY: only called after the original concurrent Promise.allSettled.
// No Firebase imports, monkey patches, tx.get wrappers, delays or retry changes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const owner = 's106-capacity-owner';
const uids = ['s106-inactive-a', 's106-inactive-b'];
const errorInfo = e => ({ code: e?.code ?? null, message: String(e?.message ?? e), stack: String(e?.stack ?? '') });
let captured;
function guard(db) {
  assert.equal(process.platform, 'linux');
  assert.equal(process.env.GCLOUD_PROJECT, 'demo-vide-hub');
  assert.equal(process.env.GOOGLE_CLOUD_PROJECT, 'demo-vide-hub');
  assert.equal(db.projectId, 'demo-vide-hub');
  assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):8080$/);
  assert.equal(process.env.GOOGLE_APPLICATION_CREDENTIALS || '', '');
  const dir = path.resolve(process.env.S106_ORIGINAL_CAPTURE_DIR || '');
  const expected = path.resolve('artifacts/s106-original/B');
  assert.equal(dir, expected, 'Only the diagnostic B artifact directory is allowed');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function save(dir, file, value) { fs.writeFileSync(path.join(dir, file), JSON.stringify(value, null, 2)); }
const isOwned = p => p === `usuarios/${owner}` || p === `employee_capacity_guards/${owner}` || uids.some(uid => p === `funcionarios/${uid}`);
async function inventory(db) {
  const result = { started: new Date().toISOString(), collections: {} };
  for (const name of ['usuarios', 'funcionarios', 'employee_capacity_guards']) {
    result.collections[name] = (await db.collection(name).get()).docs.map(d => ({
      path: d.ref.path, updateTime: d.updateTime?.toDate().toISOString(), data: d.data()
    }));
  }
  result.finished = new Date().toISOString();
  return result;
}
const unrelated = snapshot => Object.fromEntries(Object.entries(snapshot.collections).map(([c, docs]) => [c, docs.filter(d => !isOwned(d.path))]));
export async function captureOriginalResult(db, results) {
  const dir = guard(db);
  assert.equal(results.length, 2);
  const settledRecordedAt = new Date().toISOString();
  const operations = results.map((r, i) => ({ correlation: `original-enable-${i + 1}`,
    employeeUid: uids[i], ownerUid: owner, operation: 'enable + complete-auth-sync',
    status: r.status, ...(r.status === 'rejected' ? { error: errorInfo(r.reason) } : { value: r.value }) }));
  // Save errors first even if the independent persisted-state reads fail.
  save(dir, 'operation-results.json', { settledRecordedAt, operations });
  const state = await inventory(db);
  captured = state;
  const employees = uids.map(uid => state.collections.funcionarios.find(d => d.path === `funcionarios/${uid}`) ?? { path: `funcionarios/${uid}`, absent: true });
  const active = state.collections.funcionarios.filter(d => d.data.donoUID === owner && d.data.status === 'ativo');
  const o = { settledRecordedAt, ownerUid: owner, operations, state, employees,
    activeCount: active.length, guard: state.collections.employee_capacity_guards.find(d => d.path.endsWith('/' + owner)) ?? null,
    tenant: state.collections.usuarios.find(d => d.path === `usuarios/${owner}`) ?? null };
  save(dir, 'snapshot-before-assertions-and-cleanup.json', o);
  console.log('S106_RPC_ORIGINAL_SNAPSHOT ' + JSON.stringify(o));
  // Original assertions remain in the generated original case, unchanged.
}
export async function cleanupOriginalFixture(db) {
  const dir = guard(db);
  try {
    const before = captured ?? await inventory(db);
    const paths = [...uids.map(uid => `funcionarios/${uid}`), `employee_capacity_guards/${owner}`, `usuarios/${owner}`];
    const batch = db.batch();
    for (const p of paths) { assert(isOwned(p)); batch.delete(db.doc(p)); }
    await batch.commit();
    const remaining = [];
    for (const p of paths) if ((await db.doc(p).get()).exists) remaining.push(p);
    const after = await inventory(db);
    const othersPreserved = JSON.stringify(unrelated(before)) === JSON.stringify(unrelated(after));
    const result = { at: new Date().toISOString(), paths, remaining, othersPreserved };
    save(dir, 'cleanup.json', result);
    console.log('S106_RPC_ORIGINAL_CLEANUP ' + JSON.stringify(result));
    assert.equal(remaining.length, 0, 'Synthetic fixture must really be absent');
    assert(othersPreserved, 'Do not remove or modify unrelated documents');
  } catch (error) {
    save(dir, 'cleanup-error.json', errorInfo(error));
    console.error('S106_RPC_ORIGINAL_CLEANUP_ERROR ' + JSON.stringify(errorInfo(error)));
    throw error;
  }
}
