import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {EXPECTED_JOB_NAMES} from '../../scripts/pages-qg-gate-core.mjs';
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

// Parse real YAML and execute unchanged shell bodies with a pnpm function mock.
// No Firebase process, credentials or Git repository/commit is created here.
const root=fileURLToPath(new URL('../../',import.meta.url));
const localRequire=createRequire(import.meta.url);
const yamlRequire=createRequire(localRequire.resolve('firebase-tools'));
const yamlDocument=yamlRequire('yaml').parseDocument(w,{uniqueKeys:true});
assert.deepEqual(yamlDocument.errors,[]);
const definition=yamlDocument.toJS();
const steps=definition.jobs.deploy.steps;
const dry=steps.find(s=>s.name==='Dry-run exclusivo e não interativo');
const publish=steps.find(s=>s.name==='Publicar exclusivamente etapa autorizada');
const qg=steps.find(s=>s.name==='Exigir Quality Gate oficial da main no SHA exato');
const bash=process.env.BASH_PATH||(process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash');
function shell(step,patch={}) {
  const env={...process.env,...definition.env,EXPECTED_SHA:sha,MOCK_HEAD:sha,
    STAGE:'rules',CONFIRMACAO:'PUBLICAR_RULES',TARGET_SCOPE:'firestore:rules',...patch};
  delete env.BASH_ENV;
  delete env.ENV;
  for(const [key,value] of Object.entries(env)) if(value===undefined) delete env[key];
  const prefix='pnpm() { printf "MOCK_ARG:%s\\n" "$@"; }; git() { printf "%s\\n" "$MOCK_HEAD"; };\n';
  const result=spawnSync(bash,['--noprofile','--norc','-e','-o','pipefail','-c',prefix+step.run],
    {cwd:root,env,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  assert.ifError(result.error);
  assert.ok([0,1].includes(result.status),`Shell infrastructure failed: ${result.status}: ${result.stderr}`);
  return {...result,args:result.stdout.split('\n').filter(l=>l.startsWith('MOCK_ARG:')).map(l=>l.slice(9))};
}
function denied(step,patch,message) {
  const result=shell(step,patch);
  assert.equal(result.status,1,result.stderr);
  assert.match(result.stderr,message);
  assert.deepEqual(result.args,[],'must stop before any CLI invocation');
}
const functionsEnv={STAGE:'functions',CONFIRMACAO:'PUBLICAR_FUNCTIONS',TARGET_SCOPE:scope,FUNCTIONS_RELEASE_READY:'true'};
const expected=['dlx','firebase-tools@13.35.1','deploy','--only','firestore:rules','--project','vide-digital-saas','--non-interactive'];

test('YAML manual-only and permanent false flag; both boundaries receive original inputs',()=>{
  assert.deepEqual(Object.keys(definition.on),['workflow_dispatch']);
  assert.deepEqual(Object.keys(definition.on.workflow_dispatch.inputs),['stage','confirmacao','sha']);
  assert.equal(definition.env.FUNCTIONS_RELEASE_READY,'false');
  for(const step of [dry,publish]){
    assert.equal(step.env.STAGE,'${{ inputs.stage }}');
    assert.equal(step.env.CONFIRMACAO,'${{ inputs.confirmacao }}');
    assert.equal(step.env.EXPECTED_SHA,'${{ inputs.sha }}');
    assert.match(step.run,/readonly expected_scope TARGET_SCOPE\s+pnpm dlx/);
    assert.match(step.run,/--only "\$\{TARGET_SCOPE\}"/);
  }
});
for(const step of [dry,publish]) test(`Bash syntax: ${step.name}`,()=>{
  const result=spawnSync(bash,['--noprofile','--norc','-n','-c',step.run],{encoding:'utf8'});
  assert.ifError(result.error);assert.equal(result.status,0,result.stderr);
});

// Four original failed audit probes, retained as explicit strict regressions.
for(const [label,target] of [['empty',''],['whatsapp','functions:whatsappWebhook'],['multiple-services','firestore:rules,storage'],['literal-shell-input','$(touch INJECTION)']])
  test(`original B2 corruption rejected before CLI: ${label}`,()=>denied(publish,{TARGET_SCOPE:target},/Escopo efetivo inválido/));

test('Rules positive uses only exact validated target, even with Functions flag false',()=>{
  const result=shell(publish);assert.equal(result.status,0,result.stderr);assert.deepEqual(result.args,expected);
});
for(const step of [dry,publish]) test(`future unlocked Functions exact argv (mock only): ${step.name}`,()=>{
  const result=shell(step,functionsEnv);assert.equal(result.status,0,result.stderr);
  assert.deepEqual(result.args,[...expected.slice(0,4),scope,...expected.slice(5),...(step===dry?['--dry-run']:[])]);
});
for(const [label,target] of [['missing',undefined],['unknown','other'],['Functions-during-Rules',scope],['storage','storage'],['indexes','firestore:indexes'],['hosting','hosting'],['generic','functions'],['partial','functions:createEmployee'],['whitespace',' firestore:rules'],['trailing-space','firestore:rules '],['newline','firestore:rules\n'],['wildcard','functions:*']])
  test(`Rules effective target rejects ${label}`,()=>denied(publish,{TARGET_SCOPE:target},/Escopo efetivo inválido/));
for(const step of [dry,publish]) {
  for(const [label,target] of [['empty',''],['missing',undefined],['unknown','other'],['rules','firestore:rules'],['expanded',scope+',storage'],['indexes',scope+',firestore:indexes'],['whatsapp',scope+',functions:whatsappWebhook'],['generic','functions'],['partial','functions:createEmployee'],['altered',scope.replace('askBusinessAI','askPublicBusinessAI')],['whitespace',scope+' '],['shell','$(touch INJECTION)']])
    test(`Functions effective target rejects ${label}: ${step.name}`,()=>denied(step,{...functionsEnv,TARGET_SCOPE:target},/Escopo efetivo inválido/));
  for(const [label,value] of [['false','false'],['missing',undefined],['empty',''],['upper','TRUE'],['space','true '],['numeric','1']])
    test(`Functions flag ${label} blocks CLI: ${step.name}`,()=>denied(step,{...functionsEnv,FUNCTIONS_RELEASE_READY:value},value==='false'?/Functions bloqueadas/:/Trava de Functions inválida/));
  for(const [label,patch,message] of [
    ['wrong-stage',{STAGE:'all'},/Etapa inválida/],
    ['missing-stage',{STAGE:undefined},/Etapa inválida/],
    ['confirmation',{CONFIRMACAO:'PUBLICAR_RULES'},/Confirmação inválida/],
    ['missing-confirmation',{CONFIRMACAO:undefined},/Confirmação inválida/],
    ['project',{PROJECT_ID:'other'},/Projeto inválido/],
    ['missing-project',{PROJECT_ID:undefined},/Projeto inválido/],
    ['short-SHA',{EXPECTED_SHA:'main'},/SHA autorizado inválido/],
    ['missing-SHA',{EXPECTED_SHA:undefined},/SHA autorizado inválido/],
    ['upper-SHA',{EXPECTED_SHA:'A'.repeat(40)},/SHA autorizado inválido/],
    ['wrong-checkout',{MOCK_HEAD:'b'.repeat(40)},/SHA do checkout divergente/],
    ['empty-allowlist',{S106_FUNCTIONS:''},/Allowlist de Functions inválida/],
    ['corrupt-allowlist',{S106_FUNCTIONS:scope+',functions:whatsappWebhook'},/Allowlist de Functions inválida/]
  ]) test(`boundary rejects ${label}: ${step.name}`,()=>denied(step,{...functionsEnv,...patch},message));
}
test('dry-run refuses Rules even if Actions condition were bypassed',()=>denied(dry,{},/Dry-run restrito a Functions/));
for(const value of [undefined,'','TRUE','true ']) test(`Rules rejects missing/invalid flag ${String(value)}`,()=>denied(publish,{FUNCTIONS_RELEASE_READY:value},/Trava de Functions inválida/));
test('Rules confirmation rechecked at CLI boundary',()=>denied(publish,{CONFIRMACAO:'PUBLICAR_FUNCTIONS'},/Confirmação inválida/));
test('Rules cannot turn into Functions while release flag is false',()=>denied(publish,{TARGET_SCOPE:scope},/Escopo efetivo inválido/));
test('matching SHA cannot carry shell syntax into command',()=>denied(publish,{EXPECTED_SHA:'$(printf injected)',MOCK_HEAD:'$(printf injected)'},/SHA autorizado inválido/));

async function gate(runs,jobs=EXPECTED_JOB_NAMES.map(name=>({name,status:'completed',conclusion:'success'}))) {
  const calls=[];
  const github={rest:{actions:{listWorkflowRuns:'runs',listJobsForWorkflowRun:'jobs'}},paginate:async(kind,args)=>{
    calls.push({kind,...args});return kind==='runs'?runs:jobs;
  }};
  await new (Object.getPrototypeOf(async()=>{}).constructor)('github','context','process','core','require',qg.with.script)(github,
    {repo:{owner:'VideDigital',repo:'vide-digital'}},{env:{GITHUB_WORKSPACE:root,EXPECTED_SHA:sha}},{info(){}},localRequire);
  return calls;
}
const good={id:7,run_attempt:1,head_sha:sha,head_branch:'main',event:'push',status:'completed',conclusion:'success'};
test('official QG accepts only exact query and four successful latest jobs',async()=>{
  const calls=await gate([good]);assert.equal(calls[0].workflow_id,'quality-gate.yml');assert.equal(calls[0].branch,'main');
  assert.equal(calls[0].event,'push');assert.equal(calls[0].head_sha,sha);assert.equal(calls[1].filter,'latest');
});
for(const [label,runs] of [['absent',[]],['red',[{...good,conclusion:'failure'}]],['pending',[{...good,status:'in_progress',conclusion:null}]],['wrong-SHA',[{...good,head_sha:'b'.repeat(40)}]],['PR',[{...good,event:'pull_request'}]],['ambiguous',[good,{...good,id:8}]]])
  test(`official QG rejects ${label}`,()=>assert.rejects(()=>gate(runs)));
test('official QG rejects missing, failed or extra jobs',async()=>{
  await assert.rejects(()=>gate([good],[]));
  await assert.rejects(()=>gate([good],EXPECTED_JOB_NAMES.map(name=>({name,status:'completed',conclusion:'failure'}))));
  await assert.rejects(()=>gate([good],[...EXPECTED_JOB_NAMES.map(name=>({name,status:'completed',conclusion:'success'})),{name:'extra',status:'completed',conclusion:'success'}]));
});
