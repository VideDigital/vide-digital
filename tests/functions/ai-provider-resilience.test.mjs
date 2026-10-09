import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {memoryDb,seed,loadAi,request,quotaPath,builder} from './helpers/ai-077-harness.mjs';
const require=createRequire(new URL('../../functions/src/ai/index.js',import.meta.url));
const {HttpsError}=require('firebase-functions/v2/https');
const provider=require('./provider');

// Explicit virtual clock, including a watchdog for mutations that remove deadlines.
function clock(schedulingOverhead=0) {
 let time=0,id=0;const timers=new Map();
 return {now:()=>time,schedule:(fn,ms)=>{timers.set(++id,{fn,at:time+ms});time+=schedulingOverhead;return id;},cancel:id=>timers.delete(id),
 async finish(p) {let done=false,result,error;p.then(v=>{done=true;result=v;},e=>{done=true;error=e;});
  for(let n=0;n<100&&!done;n++){for(let i=0;i<30;i++)await Promise.resolve();if(done)break;
   const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!next)throw Error('Operation stuck without deadline');
   time=next[1].at;timers.delete(next[0]);next[1].fn();}
  assert.ok(done,'bounded operation must settle');if(error)throw error;return result;},pending:()=>timers.size};
}
const ok=()=>({ok:true,status:200,json:async()=>({candidates:[{content:{parts:[{text:'ok'}]}}]})});
function setup(sequence,schedulingOverhead=0){const timer=clock(schedulingOverhead),calls=[],logs=[];const api=provider.createProvider({...timer,random:()=>0.5,HttpsError,
 logger:Object.fromEntries(['error','warn','info'].map(level=>[level,(...args)=>logs.push({level,args})])),
 fetch:async(url,options)=>{calls.push({url,options});const step=sequence[Math.min(calls.length-1,sequence.length-1)];
 if(step==='hang')return new Promise(()=>{});
 if(step==='body')return {ok:true,status:200,json:()=>new Promise(()=>{})};
 if(step==='network')throw new TypeError('secret-key question history URL');
 if(step==='json')return {ok:true,status:200,json:async()=>{throw new SyntaxError('secret-key question history');}};
 if(typeof step==='object'){await new Promise(resolve=>timer.schedule(resolve,step.delay));return ok();}
 if(step===200)return ok();return {ok:false,status:step};}});
 const payload=builder.montarMensagensGemini({systemPrompt:'system',contextoTexto:'context',pergunta:'question',historico:[{autor:'dono',texto:'history'}]});
 return {timer,calls,logs,api,run:()=>timer.finish(api.runWithDeadline(signal=>api.chamarGemini(payload,'secret-key','publico',signal),'publico'))};}

test('stable primary/fallback and deadlines fit the explicit 90s function budget',()=>{
 assert.equal(provider.MODEL,'gemini-3.8-flash');assert.equal(provider.FALLBACK_MODEL,'gemini-3.5-flash-lite');assert.equal(provider.FUNCTION_TIMEOUT_SECONDS,90);
 assert.equal(provider.FALLBACK_TIMEOUT_MS,25000);assert.equal(provider.MAX_ATTEMPTS,2);assert.equal(provider.ATTEMPT_TIMEOUT_MS,35000);assert.equal(provider.REQUEST_TIMEOUT_MS,65000);
 assert.ok(provider.ATTEMPT_TIMEOUT_MS+provider.FALLBACK_TIMEOUT_MS+500<provider.REQUEST_TIMEOUT_MS);
 assert.ok(provider.REQUEST_TIMEOUT_MS<=provider.FUNCTION_TIMEOUT_SECONDS*1000-10000);
 const ai=loadAi(memoryDb(seed()));assert.equal(ai.askBusinessAI.options.timeoutSeconds,90);assert.equal(ai.askPublicBusinessAI.options.timeoutSeconds,90);
});
for(const [steps,count,success] of [[[200],1,true],[[503,200],2,true],[[503,503],2,false],[['hang',200],2,true],[['hang','hang'],2,false],[['body',200],2,true],[['network',200],2,true],[[500,200],2,true],[[502,200],2,true]])
test('bounded provider '+JSON.stringify(steps),async()=>{const s=setup(steps);
 if(success)assert.ok(await s.run());else await assert.rejects(s.run(),e=>e.code==='unavailable');
 assert.equal(s.calls.length,count);assert.ok(s.timer.now()<65000);assert.equal(s.timer.pending(),0);
 assert.ok(s.calls[0].url.includes('/gemini-3.8-flash:generateContent'));
 if(count===2)assert.ok(s.calls[1].url.includes('/gemini-3.5-flash-lite:generateContent'));
 if(steps[0]==='hang'||steps[0]==='body')assert.equal(s.calls[0].options.signal.aborted,true);
 assert.equal(s.logs.filter(l=>l.level==='error').length,success?0:1);
 assert.equal(s.logs.filter(l=>l.level==='warn').length,count===2?(success?2:1):0);
 const logged=JSON.stringify(s.logs,(k,v)=>v instanceof Error?{message:v.message,stack:v.stack}:v);
 assert.doesNotMatch(logged,/secret-key|question|history|generateContent\?key/);
 for(const log of s.logs){const f=log.args.at(-1);assert.equal(f.caminho,'publico');assert.ok([1,2].includes(f.attempt));assert.equal(f.model,f.attempt===1?'gemini-3.8-flash':'gemini-3.5-flash-lite');assert.equal(f.stage,f.attempt===1?'primary':'fallback');assert.ok(f.durationMs>=0);
 assert.deepEqual(Object.keys(f).sort(),['model','attempt','stage','caminho','kind','geminiStatus','durationMs'].sort());}
 const bodies=s.calls.map(c=>JSON.parse(c.options.body));
 assert.deepEqual(bodies[0].generationConfig,{maxOutputTokens:2048,thinkingConfig:{thinkingLevel:'low'}});
 if(count===2){assert.deepEqual(bodies[1].generationConfig,{maxOutputTokens:2048,thinkingConfig:{thinkingLevel:'minimal'}});assert.deepEqual(bodies[1].contents,bodies[0].contents);assert.deepEqual(bodies[1].systemInstruction,bodies[0].systemInstruction);}
});
for(const delay of [1000,21000,34000])test('healthy primary at '+delay+'ms succeeds without premature abort or fallback',async()=>{
 const s=setup([{delay},503]);assert.ok(await s.run());assert.equal(s.calls.length,1);
 assert.equal(s.calls[0].options.signal.aborted,false);assert.equal(s.logs.length,1);assert.equal(s.logs[0].level,'info');
 assert.equal(s.logs[0].args.at(-1).durationMs,delay);assert.equal(s.timer.pending(),0);
});

test('fallback can complete after 20s within its own budget',async()=>{
 const s=setup(['hang',{delay:24000}]);assert.ok(await s.run());assert.equal(s.calls.length,2);
 assert.equal(s.timer.now(),59375);assert.equal(s.calls[1].options.signal.aborted,false);assert.equal(s.timer.pending(),0);
});
test('invalid provider JSON does not trigger fallback and remains sanitized',async()=>{
 const s=setup(['json',200]);await assert.rejects(s.run(),e=>e.code==='unavailable');assert.equal(s.calls.length,1);
 assert.equal(s.logs[0].args.at(-1).kind,'response');assert.doesNotMatch(s.logs[0].args[1].message,/secret-key|question|history/);
});
for(const status of [400,401,403,404,429])test('no retry for '+status,async()=>{
 const s=setup([status,200]);await assert.rejects(s.run(),e=>e.code===(status===429?'resource-exhausted':'unavailable'));
 assert.equal(s.calls.length,1);assert.equal(s.logs.filter(l=>l.level==='error').length,1);
});
test('retry wait tolerates scheduling overhead and preserves the final error log',async()=>{
 const s=setup(['network','network'],2);
 await assert.rejects(s.run(),e=>e.code==='unavailable');
 assert.equal(s.calls.length,2);assert.equal(s.logs.filter(l=>l.level==='error').length,1);
 assert.equal(s.timer.pending(),0);
});

test('overall deadline bounds pre-provider waits and prevents late provider calls',async()=>{
 const s=setup([200]);let release;const gate=new Promise(resolve=>release=resolve);
 await assert.rejects(s.timer.finish(s.api.runWithDeadline(async signal=>{await gate;return s.api.chamarGemini({},'key','privado',signal);},'privado')),e=>e.code==='unavailable');
 assert.equal(s.timer.now(),65000);release();for(let n=0;n<30;n++)await Promise.resolve();assert.equal(s.calls.length,0);
 assert.equal(s.logs.filter(l=>l.level==='error').length,1);
});
test('deadline during transport cancels and logs only once',async()=>{
 const s=setup(['hang']);await assert.rejects(s.timer.finish(s.api.runWithDeadline(async signal=>{
 await new Promise(r=>s.timer.schedule(r,55000));return s.api.chamarGemini({},'key','privado',signal);
 },'privado')),e=>e.code==='unavailable');
 assert.equal(s.timer.now(),65000);assert.equal(s.calls.length,1);assert.equal(s.calls[0].options.signal.aborted,true);
 assert.equal(s.logs.filter(l=>l.level==='error').length,1);
 assert.deepEqual(s.logs.at(-1).args.at(-1),{model:'gemini-3.8-flash',attempt:1,stage:'primary',caminho:'privado',kind:'timeout',geminiStatus:null,durationMs:10000});
});
test('fallback receives only remaining global budget after slow pre-provider work',async()=>{
 const s=setup(['hang','hang']);await assert.rejects(s.timer.finish(s.api.runWithDeadline(async signal=>{
 await new Promise(r=>s.timer.schedule(r,20000));return s.api.chamarGemini({},'key','publico',signal);
 },'publico')),e=>e.code==='unavailable');
 assert.equal(s.timer.now(),65000);assert.equal(s.calls.length,2);assert.ok(s.calls.every(c=>c.options.signal.aborted));
 assert.equal(s.logs.filter(l=>l.level==='error').length,1);assert.equal(s.timer.pending(),0);
 assert.deepEqual(s.logs.at(-1).args.at(-1),{model:'gemini-3.5-flash-lite',attempt:2,stage:'fallback',caminho:'publico',kind:'timeout',geminiStatus:null,durationMs:9625});
});
for(const channel of ['askBusinessAI','askPublicBusinessAI'])test(channel+' fallback debits once and preserves authorized content',async()=>{
 const timer=clock(),db=memoryDb(seed());const ai=loadAi(db,{providerOptions:{...timer,random:()=>0},transport:async(_u,_o,n)=>n===1?{ok:false,status:503}:ok()});
 await timer.finish(ai[channel](request()));assert.equal(ai.calls.length,2);assert.deepEqual(ai.calls[0].contents,ai.calls[1].contents);assert.deepEqual(ai.calls[0].systemInstruction,ai.calls[1].systemInstruction);
 assert.equal(ai.calls[0].generationConfig.thinkingConfig.thinkingLevel,'low');assert.equal(ai.calls[1].generationConfig.thinkingConfig.thinkingLevel,'minimal');
 assert.ok(ai.calls.every(p=>p.generationConfig.maxOutputTokens===2048));assert.ok(ai.calls.every(p=>!['temperature','topP','topK','candidateCount'].some(k=>k in p.generationConfig)));
 assert.equal(db.docs.get(quotaPath()).count,1);assert.equal(db.docs.get(quotaPath()).publicCount,channel==='askPublicBusinessAI'?1:0);
});
test('final timeout is unavailable at handler and reserves only once',async()=>{
 const timer=clock(),db=memoryDb(seed());const ai=loadAi(db,{providerOptions:{...timer,random:()=>0},transport:()=>new Promise(()=>{})});
 await assert.rejects(timer.finish(ai.askPublicBusinessAI(request())),e=>e.code==='unavailable');
 assert.equal(ai.calls.length,2);assert.equal(db.docs.get(quotaPath()).count,1);assert.equal(db.docs.get(quotaPath()).publicCount,1);
});

test('public fallback preserves active catalog, server tenant and private data exclusion',async()=>{
 const timer=clock(),db=memoryDb({...seed(),...seed('owner-b','loja-b'),
  'produtos/active':{criadoPor:'owner-a',nome:'QA_ACTIVE',statusProduto:'ativo',preco:10,estoque:987654},
  'produtos/draft':{criadoPor:'owner-a',nome:'QA_DRAFT',statusProduto:'rascunho'},
  'produtos/b':{criadoPor:'owner-b',nome:'QA_TENANT_B',statusProduto:'ativo'},
  'pedidos/private':{criadoPor:'owner-a',status:'QA_PRIVATE_ORDER',valorTotal:12345},
  'leads/private':{criadoPor:'owner-a',status:'QA_PRIVATE_LEAD'}});
 const ai=loadAi(db,{providerOptions:{...timer,random:()=>0},transport:(_u,_o,n)=>n===1?{ok:false,status:503}:ok()});
 await timer.finish(ai.askPublicBusinessAI(request({ownerUid:'owner-b',tenantId:'owner-b',criadoPor:'owner-b'})));
 assert.equal(ai.calls.length,2);
 for(const payload of ai.calls){const text=JSON.stringify(payload);assert.match(text,/QA_ACTIVE/);
  assert.doesNotMatch(text,/QA_DRAFT|QA_TENANT_B|QA_PRIVATE_ORDER|QA_PRIVATE_LEAD|987654|12345/);}
 assert.equal(db.docs.has(quotaPath('owner-b')),false);assert.equal(db.docs.get(quotaPath()).count,1);
 assert.ok(db.queries.every(q=>!['pedidos','leads'].includes(q.name)));
});
