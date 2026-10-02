import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import test from 'node:test';
import {EXPECTED_JOB_NAMES} from '../../scripts/pages-qg-gate-core.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const workflow='.github/workflows/firebase-deploy-public-lead-075.yml';
const yaml=readFileSync(path.join(root,workflow),'utf8').replaceAll('\r\n','\n');
const sha='a'.repeat(40);
const env={EXPECTED_SHA:sha,CONFIRMACAO:'PUBLICAR',PROJECT_ID:'vide-digital-saas',PUBLIC_LEAD_FUNCTIONS:'functions:createPublicLead',GITHUB_WORKSPACE:root};
const names={identity:'Validar identidade antes do checkout',qg:'Exigir Quality Gate oficial da main no SHA exato',preauth:'Revalidar main antes de autenticar',final:'Revalidar main depois do dry-run imediatamente antes do deploy',dry:'Dry-run exclusivo e não interativo',deploy:'Publicar exclusivamente createPublicLead'};
function step(name,text=yaml){const marker=`      - name: ${name}\n`;const start=text.indexOf(marker);assert.ok(start>=0,`Missing ${name}`);const end=text.indexOf('\n      - ',start+marker.length);return text.slice(start,end<0?undefined:end);}
function block(name,key,text=yaml){const s=step(name,text);const lines=s.split('\n');const at=lines.findIndex(line=>line.trim()===`${key}: |`);assert.ok(at>=0,`Missing ${key} in ${name}`);const indent=lines[at].search(/\S/)+2;const out=[];for(const line of lines.slice(at+1)){if(!line.trim()){out.push('');continue;}if(line.search(/\S/)<indent)break;out.push(line.slice(indent));}return out.join('\n');}
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
async function runScript(name,{environment={},contextChange={},main=sha,runs,jobs,text=yaml}={}){
 const context={eventName:'workflow_dispatch',ref:'refs/heads/main',sha,repo:{owner:'VideDigital',repo:'vide-digital'},...contextChange};
 const calls=[];const github={rest:{repos:{getBranch:async args=>{calls.push(args);return {data:{commit:{sha:main}}};}},actions:{listWorkflowRuns:'runs',listJobsForWorkflowRun:'jobs'}},
 paginate:async(kind,args)=>{calls.push({kind,...args});if(kind==='runs')return runs??[{id:7,run_attempt:1,head_sha:sha,head_branch:'main',event:'push',status:'completed',conclusion:'success'}];return jobs??EXPECTED_JOB_NAMES.map(name=>({name,status:'completed',conclusion:'success'}));}};
 const fn=new AsyncFunction('github','context','process','core','require',block(name,'script',text));
 await fn(github,context,{env:{...env,...environment}},{info(){}},createRequire(import.meta.url));return calls;
}
function shell(name,overrides={}){
 const bash=process.env.BASH_PATH||(process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash');
 const prefix='pnpm() { printf "ARG:%s\\n" "$@"; }; git() { printf "%s\\n" "$MOCK_HEAD"; }; grep() { return 0; };\n';
 const result=spawnSync(bash,['--noprofile','--norc','-e','-o','pipefail','-c',prefix+block(name,'run')],{encoding:'utf8',env:{...process.env,...env,MOCK_HEAD:sha,...overrides}});
 assert.ifError(result.error);return {...result,args:(result.stdout||'').split('\n').filter(x=>x.startsWith('ARG:')).map(x=>x.slice(4))};
}

test('only manual dispatch; exactly two required inputs; least scoped metadata',()=>{
 const on=yaml.match(/^on:\n([\s\S]*?)\npermissions:/m)[1];assert.deepEqual([...on.matchAll(/^  (\w+):/gm)].map(x=>x[1]),['workflow_dispatch']);
 assert.deepEqual([...on.matchAll(/^      (\w+):/gm)].map(x=>x[1]),['confirmacao','sha']);
 for(const input of ['confirmacao','sha'])assert.match(on,new RegExp(`${input}:\\n(?:        .*\\n)*?        required: true`));
 assert.match(yaml,/group: firebase-production-functions-deploy/);assert.match(yaml,/cancel-in-progress: false/);
 assert.match(yaml,/ref: \$\{\{ inputs.sha \}\}/);assert.match(yaml,/persist-credentials: false/);
});
test('hardcoded project and exact single scope; no other Functions or Pages',()=>{
 assert.match(yaml,/^  PROJECT_ID: vide-digital-saas$/m);assert.match(yaml,/^  PUBLIC_LEAD_FUNCTIONS: functions:createPublicLead$/m);
 assert.doesNotMatch(yaml,/whatsapp|createAdminMember|reportFrontendError|askBusinessAI|askPublicBusinessAI|functions:\*|actions\/deploy-pages|pages-publish\.yml|upload-pages-artifact/i);
 const targets=[...yaml.matchAll(/functions:([A-Za-z0-9_*]+)/g)].map(x=>x[1]);assert.ok(targets.length>0);assert.ok(targets.every(x=>x==='createPublicLead'));
 const commands=[...yaml.matchAll(/pnpm dlx firebase-tools@([^\s]+) deploy([\s\S]*?)(?=\n\n|$)/g)];assert.equal(commands.length,2);
 for(const [,version,command]of commands){assert.equal(version,'13.35.1');assert.match(command,/--only "\$\{PUBLIC_LEAD_FUNCTIONS\}"/);assert.match(command,/--project "\$\{PROJECT_ID\}"/);assert.match(command,/--non-interactive/);}
 assert.equal((yaml.match(/\bdeploy\s*\\/g)||[]).length,2);assert.doesNotMatch(yaml,/--only\s+["']?functions(?:["'\s]|$)/);
});
test('identity accepts authorized inputs and rejects every changed precondition',async()=>{
 await runScript(names.identity);
 for(const options of [{contextChange:{eventName:'push'}},{contextChange:{ref:'refs/heads/pr'}},{contextChange:{sha:'b'.repeat(40)}},{environment:{CONFIRMACAO:'publicar'}},{environment:{EXPECTED_SHA:'abc'}},{environment:{EXPECTED_SHA:'a'.repeat(39)+'!'}},{main:'b'.repeat(40)},{environment:{PROJECT_ID:'other-project'}},{environment:{PUBLIC_LEAD_FUNCTIONS:'functions'}},{environment:{PUBLIC_LEAD_FUNCTIONS:'functions:createPublicLead,functions:other'}}])await assert.rejects(runScript(names.identity,options));
});
test('official QG: exact SHA, push/main, completed/success and four jobs; PR never accepted',async()=>{
 const calls=await runScript(names.qg);assert.equal(calls[0].workflow_id,'quality-gate.yml');assert.equal(calls[0].event,'push');assert.equal(calls[0].branch,'main');assert.equal(calls[0].head_sha,sha);assert.equal(calls[1].filter,'latest');
 const good={id:7,head_sha:sha,head_branch:'main',event:'push',status:'completed',conclusion:'success'};
 for(const delta of [{head_sha:'b'.repeat(40)},{head_branch:'feature'},{event:'pull_request'},{status:'in_progress'},{conclusion:'failure'},{conclusion:'cancelled'},{conclusion:'skipped'}])await assert.rejects(runScript(names.qg,{runs:[{...good,...delta}]}));
 await assert.rejects(runScript(names.qg,{runs:[]}));await assert.rejects(runScript(names.qg,{runs:[good,good]}));
 await assert.rejects(runScript(names.qg,{jobs:[]}));await assert.rejects(runScript(names.qg,{jobs:EXPECTED_JOB_NAMES.map(name=>({name,status:'completed',conclusion:'failure'}))}));
});
test('QG before auth; main rechecked before auth and after dry-run; fail closed',async()=>{
 assert.ok(yaml.indexOf(names.qg)<yaml.indexOf('google-github-actions/auth'));
 for(const name of [names.preauth,names.final]){await runScript(name);await assert.rejects(runScript(name,{main:'b'.repeat(40)}));}
 assert.ok(yaml.indexOf(names.final)>yaml.indexOf(names.dry));assert.ok(yaml.indexOf(names.final)<yaml.indexOf(names.deploy));
 const between=yaml.slice(yaml.indexOf(names.final),yaml.indexOf(names.deploy));assert.equal((between.match(/- name:/g)||[]).length,1);
 for(const name of [names.identity,names.qg,names.final,names.dry,names.deploy])assert.doesNotMatch(step(name),/continue-on-error|if:\s*always/);
});
test('actual shell blocks produce only exact argv, check scope/project/SHA and stop on errors',()=>{
 const expected=['dlx','firebase-tools@13.35.1','deploy','--only','functions:createPublicLead','--project','vide-digital-saas','--non-interactive'];
 for(const [name,argv]of [[names.deploy,expected],[names.dry,[...expected,'--dry-run']]]){
 const r=shell(name);assert.equal(r.status,0,r.stderr);assert.deepEqual(r.args,argv);
 for(const bad of [{PUBLIC_LEAD_FUNCTIONS:'functions'},{PUBLIC_LEAD_FUNCTIONS:'functions:createPublicLead,functions:other'},{PROJECT_ID:'other'},{MOCK_HEAD:'b'.repeat(40)}]){const result=shell(name,bad);assert.notEqual(result.status,0);assert.deepEqual(result.args,[]);}}
});
test('existing WIF preferred; fallback only configured key; no credentials mutation',()=>{
 assert.match(yaml,/HAS_WIF_PROVIDER.*[\s\S]*HAS_WIF_SA/);assert.match(yaml,/method=wif/);assert.match(yaml,/elif.*HAS_SA_KEY/);
 assert.match(yaml,/GCP_WORKLOAD_IDENTITY_PROVIDER/);assert.match(yaml,/GCP_SERVICE_ACCOUNT/);assert.match(yaml,/FIREBASE_SERVICE_ACCOUNT/);
 assert.match(yaml,/Nenhum método de autenticação configurado; HARD STOP/);
 assert.doesNotMatch(yaml,/FIREBASE_TOKEN|firebase login|secrets:set|gcloud (iam|projects)|continue-on-error/);
});
