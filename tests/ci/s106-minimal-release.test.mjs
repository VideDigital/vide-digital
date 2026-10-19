import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
const w=readFileSync(new URL('../../.github/workflows/s106-controlled-release.yml',import.meta.url),'utf8');
const script=w.match(/script: \|\n([\s\S]*?)\n      - name:/)[1].split('\n').map(l=>l.slice(12)).join('\n');
const sha='a'.repeat(40);
const scope='functions:createEmployee,functions:updateEmployee,functions:enableEmployee,functions:disableEmployee,functions:askBusinessAI';
async function run(patch={},current=sha){const env={EXPECTED_SHA:sha,STAGE:'rules',CONFIRMACAO:'PUBLICAR_RULES',PROJECT_ID:'vide-digital-saas',S106_FUNCTIONS:scope,FUNCTIONS_RELEASE_READY:'false',...patch};const exported={};await new (Object.getPrototypeOf(async()=>{}).constructor)('process','context','github','core',script)({env},{eventName:'workflow_dispatch',ref:'refs/heads/main',sha,repo:{}},{rest:{repos:{getBranch:async()=>({data:{commit:{sha:current}}})}}},{exportVariable:(k,v)=>{exported[k]=v}});return exported;}
test('rules stage selects only Firestore',async()=>assert.equal((await run()).TARGET_SCOPE,'firestore:rules'));
for(const [label,patch] of Object.entries({invalidSha:{EXPECTED_SHA:'main'},wrongProject:{PROJECT_ID:'other'},wrongConfirmation:{CONFIRMACAO:'PUBLICAR'},invalidStage:{STAGE:'all'},generic:{S106_FUNCTIONS:'functions'},extra:{S106_FUNCTIONS:scope+',functions:createPublicLead'},whatsapp:{S106_FUNCTIONS:'functions:whatsappSendText'}}))test('rejects '+label,()=>assert.rejects(()=>run(patch)));
test('main advancement expires authorization',()=>assert.rejects(()=>run({},'b'.repeat(40))));
test('functions locked before authentication pending dependency resolution',()=>assert.rejects(()=>run({STAGE:'functions',CONFIRMACAO:'PUBLICAR_FUNCTIONS'}),/NO-GO/));
test('manual only, exact checkout, official QG, pinned deps and separate scopes',()=>{assert.match(w,/workflow_dispatch:/);assert.doesNotMatch(w,/^  (push|pull_request|workflow_run):/m);assert.match(w,/ref: \$\{\{ inputs.sha \}\}/);assert.match(w,/selecionarRunAprovado/);assert.match(w,/validarJobsObrigatorios/);assert.match(w,/filter:'latest'/);assert.match(w,/--frozen-lockfile/);assert.match(w,/cancel-in-progress: false/);assert.equal((w.match(/--only "\$\{TARGET_SCOPE\}"/g)||[]).length,2);assert.match(w,/if: inputs.stage == 'functions'/);assert.doesNotMatch(w,/--force|--only functions\s|--only "functions"/);});
test('main checked before preflight and again before publication',()=>{assert.match(w,/Revalidar main antes de qualquer operação Firebase[\s\S]*Dry-run exclusivo[\s\S]*Revalidar main depois do dry-run[\s\S]*Publicar exclusivamente etapa/)});
