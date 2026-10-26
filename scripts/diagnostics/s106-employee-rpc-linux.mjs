// TEMPORARY diagnostic branch only. No SDK/transaction wrappers or fault injection.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const originalFile = 'tests/functions/emulator/employee-limit.test.mjs';
export const originalBlob = '467a056060fe9833c97f49d0a6743f615aa566b7';
export const precedingFiles = ['tests/emulator/firestore-security.test.mjs',
  'tests/emulator/banner-replacement-integrity.test.mjs',
  'tests/emulator/storage-security.test.mjs'];
const caseTitle = 'reativações concorrentes disputam a mesma última vaga';
const sha256 = text => createHash('sha256').update(text).digest('hex');
const gitBlob = text => createHash('sha1').update(Buffer.concat([
  Buffer.from(`blob ${Buffer.byteLength(text)}\0`), Buffer.from(text)
])).digest('hex');
export function instrumentOriginal(source) {
  assert.equal(gitBlob(source), originalBlob, 'Original test differs from approved main');
  const opener = `  it("${caseTitle}", async () => {\n`;
  const start = source.indexOf(opener);
  assert(start >= 0 && source.indexOf(opener, start + 1) < 0);
  const end = source.indexOf('\n  });', start);
  assert(end > start);
  const body = source.slice(start + opener.length, end);
  const allSettled = `    const results = await Promise.allSettled([\n      mutate("s106-inactive-a", "enable"),\n      mutate("s106-inactive-b", "enable")\n    ]);`;
  assert(body.includes(allSettled));
  const assertions = body.split('\n').filter(line => line.includes('assert.'));
  assert.equal(assertions.length, 3);
  const observedBody = body.replace(allSettled, allSettled + '\n    await captureOriginalResult(db, results);');
  const wrapped = opener + '    let originalFailure;\n    try {\n' + observedBody +
    '\n    } catch (error) { originalFailure = error; throw error; }' +
    '\n    finally {\n      try { await cleanupOriginalFixture(db); }' +
    '\n      catch (cleanupError) { if (!originalFailure) throw cleanupError; }\n    }';
  const importLine = 'import { captureOriginalResult, cleanupOriginalFixture } from "../../../scripts/diagnostics/s106-employee-rpc-postop.mjs";\n';
  const generated = importLine + source.slice(0, start) + wrapped + source.slice(end);
  assert.equal(generated.split(allSettled).length, 2);
  for (const line of assertions) assert(generated.includes(line));
  // Reversibility proves that no other source code was changed.
  assert.equal(generated.slice(importLine.length).replace(wrapped, opener + body), source);
  return { generated, proof: { originalBlob, originalSHA256: sha256(source),
    generatedSHA256: sha256(generated), originalAssertions: assertions,
    concurrentBlock: allSettled, reversible: true } };
}
function log(event, fields = {}) { console.log('S106_RPC_ORIGINAL ' + JSON.stringify({ at: new Date().toISOString(), event, ...fields })); }
export function validatePhaseBArtifacts(output, record) {
  const required = ['operation-results.json', 'snapshot-before-assertions-and-cleanup.json', 'cleanup.json'];
  const missing = required.filter(file => !fs.existsSync(path.join(output, file)));
  const issues = [];
  const documents = {};
  if (missing.length) issues.push({ kind: 'missing-artifacts', files: missing });
  else {
    // Never parse a partial evidence set, fabricate a document or replace it with defaults.
    for (const file of required) {
      try { documents[file] = JSON.parse(fs.readFileSync(path.join(output, file), 'utf8')); }
      catch (error) { issues.push({ kind: 'invalid-json', file, message: error.message }); }
    }
    if (!issues.length) {
      try {
        const owner = 's106-capacity-owner';
        const uids = ['s106-inactive-a', 's106-inactive-b'];
        const operations = documents['operation-results.json'].operations;
        const snapshot = documents['snapshot-before-assertions-and-cleanup.json'];
        const cleanup = documents['cleanup.json'];
        assert(Array.isArray(operations) && operations.length === 2, 'Two operation results required');
        assert.deepEqual(operations.map(o => o.employeeUid), uids, 'Unexpected operation UIDs');
        assert(operations.every(o => o.ownerUid === owner), 'Wrong operation tenant');
        assert.equal(operations.filter(o => o.status === 'fulfilled').length, 1, 'One successful operation required');
        assert.equal(operations.filter(o => o.status === 'rejected').length, 1, 'One rejected operation required');
        const rejected = operations.find(o => o.status === 'rejected');
        assert.equal(rejected.error.code, 'failed-precondition', 'Technical RPC must not count as quota');
        assert.match(rejected.error.message, /Limite de funcionários/, 'Quota message required');
        assert.equal(snapshot.ownerUid, owner, 'Wrong snapshot tenant');
        assert.deepEqual(snapshot.operations, operations, 'Operation artifacts disagree');
        assert.equal(snapshot.tenant.path, `usuarios/${owner}`, 'Wrong tenant document');
        assert.equal(snapshot.tenant.data.plano, 'pro', 'Unexpected fixture plan');
        assert.equal(snapshot.tenant.data.status, 'aprovado', 'Tenant must be approved');
        const employees = snapshot.employees;
        assert(Array.isArray(employees) && employees.length === 2, 'Two employee documents required');
        assert.deepEqual(employees.map(d => d.path), uids.map(uid => `funcionarios/${uid}`), 'Unexpected employee paths');
        const active = employees.filter(d => d.data.status === 'ativo');
        const inactive = employees.filter(d => d.data.status === 'inativo');
        assert.equal(snapshot.activeCount, 1, 'Active count must be one');
        assert.equal(active.length, 1, 'Exactly one active employee required');
        assert.equal(inactive.length, 1, 'Exactly one inactive employee required');
        assert(employees.every(d => d.data.donoUID === owner), 'Wrong employee tenant');
        assert.equal(active[0].path, `funcionarios/${operations.find(o => o.status === 'fulfilled').employeeUid}`, 'Winner and active employee disagree');
        assert.equal(active[0].data.authSyncPendente, false, 'Winner Auth sync must be complete');
        assert(inactive[0].data.authSyncPendente !== true, 'Inactive employee must not have pending sync');
        assert(employees.every(d => !('authSyncId' in d.data)), 'Unexpected persisted Auth sync ID');
        assert.equal(snapshot.guard.path, `employee_capacity_guards/${owner}`, 'Wrong guard tenant');
        assert.equal(snapshot.guard.data.revision, 2, 'Guard revision must match reserve and completion');
        assert.deepEqual(cleanup.paths.slice().sort(), [...uids.map(uid => `funcionarios/${uid}`), `employee_capacity_guards/${owner}`, `usuarios/${owner}`].sort(), 'Cleanup scope mismatch');
        assert(Array.isArray(cleanup.remaining) && cleanup.remaining.length === 0, 'Cleanup absence not proven');
        assert.equal(cleanup.othersPreserved, true, 'Unrelated documents not preserved');
      } catch (error) { issues.push({ kind: 'invalid-integrity', message: error.message }); }
    }
  }
  if (fs.existsSync(path.join(output, 'cleanup-error.json'))) issues.push({ kind: 'cleanup-error-artifact' });
  const validation = { required, missing, valid: issues.length === 0, issues };
  record.originalExitCode = record.exitCode;
  record.artifactValidation = validation;
  record.integrityValid = validation.valid;
  record.blockReasons = [...issues];
  if (record.originalExitCode !== 0 || record.signal || record.spawnError) {
    record.blockReasons.push({ kind: 'original-test-failure', exitCode: record.originalExitCode,
      signal: record.signal, ...(record.spawnError !== undefined ? { spawnError: record.spawnError } : {}) });
  }
  if (record.rpc3) record.blockReasons.push({ kind: 'rpc3-observed' });
  record.phaseResult = record.blockReasons.length ? 'FAILURE' : 'PASS';
  if (record.phaseResult === 'FAILURE' && !(Number.isInteger(record.exitCode) && record.exitCode !== 0)) record.exitCode = 1;
  fs.writeFileSync(path.join(output, 'integrity.json'), JSON.stringify(validation, null, 2));
  log('artifact-validation', { ...validation, phaseResult: record.phaseResult, originalExitCode: record.originalExitCode });
  return validation;
}
export function phaseExitCode(results) {
  return results.length === 4 && results.every(x => x.exitCode === 0 && !x.rpc3) ? 0 : 1;
}
export function persistPhaseExecution(output, mode, results) {
  fs.writeFileSync(path.join(output, 'execution.json'), JSON.stringify({ mode,
    node: process.version, platform: process.platform, exitCode: phaseExitCode(results), results }, null, 2));
}
export function runPhase(mode) {
  assert(['A', 'B'].includes(mode));
  assert.equal(process.platform, 'linux', 'Experiments require Linux');
  assert.equal(process.version, 'v22.23.3');
  assert.equal(process.env.GCLOUD_PROJECT, 'demo-vide-hub');
  assert.equal(process.env.GOOGLE_CLOUD_PROJECT, 'demo-vide-hub');
  assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):8080$/);
  assert.match(process.env.FIREBASE_STORAGE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):9199$/);
  assert.equal(process.env.GOOGLE_APPLICATION_CREDENTIALS || '', '');
  assert.equal(process.env.NODE_OPTIONS || '', '', 'No inherited preload/instrumentation');
  const source = fs.readFileSync(originalFile, 'utf8');
  assert.equal(gitBlob(source), originalBlob);
  const output = path.resolve('artifacts/s106-original', mode);
  fs.mkdirSync(output, { recursive: true });
  const temporaryFile = 'tests/functions/emulator/.s106-original-postop.test.mjs';
  assert(!fs.existsSync(temporaryFile), 'Do not overwrite existing local work');
  const results = [];
  try {
    let selected = originalFile;
    if (mode === 'B') {
      const { generated, proof } = instrumentOriginal(source);
      fs.writeFileSync(temporaryFile, generated, { flag: 'wx' });
      fs.writeFileSync(path.join(output, 'instrumentation-proof.json'), JSON.stringify(proof, null, 2));
      fs.writeFileSync(path.join(output, 'instrumented-original-test.mjs.txt'), generated);
      selected = temporaryFile;
    }
    for (const [i, file] of [...precedingFiles, selected].entries()) {
      log('suite-start', { mode, file });
      const filename = path.join(output, `suite-${i + 1}.log`);
      const fd = fs.openSync(filename, 'wx');
      const started = new Date().toISOString();
      const args = ['--test', file];
      const result = spawnSync(process.execPath, args, { env: { ...process.env,
        S106_ORIGINAL_CAPTURE_DIR: output }, stdio: ['ignore', fd, fd] });
      fs.closeSync(fd);
      process.stdout.write(fs.readFileSync(filename));
      const rpc3 = fs.readFileSync(filename, 'utf8').includes('3 INVALID_ARGUMENT: Transaction is invalid or closed.');
      const record = { file, command: [process.execPath, ...args], started,
        finished: new Date().toISOString(), exitCode: result.status,
        signal: result.signal, spawnError: result.error?.message, rpc3 };
      results.push(record);
      if (mode === 'B' && file === selected) validatePhaseBArtifacts(output, record);
      log('suite-result', { mode, ...record });
      // Preserve && semantics. No separate trace/scenario after the original file.
      if (record.exitCode !== 0 || rpc3) break;
    }
    process.exitCode = phaseExitCode(results);
  } finally {
    persistPhaseExecution(output, mode, results);
    if (mode === 'B' && fs.existsSync(temporaryFile)) fs.unlinkSync(temporaryFile);
    assert.equal(fs.readFileSync(originalFile, 'utf8'), source, 'Tracked original must remain untouched');
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runPhase(process.argv[2]);
