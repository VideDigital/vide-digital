import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {memoryDb,seed,loadAi,request,quotaPath} from './helpers/ai-077-harness.mjs';
const require=createRequire(new URL('../../functions/src/ai/index.js',import.meta.url));
const {HttpsError}=require('firebase-functions/v2/https');
const provider=require('./provider');

// Explicit virtual clock, including a watchdog for mutations that remove deadlines.
function clock() {
 let time=0,id=0;const timers=new Map();
 return {now:()=>time,schedule:(fn,ms)=>{timers.set(++id,{fn,at:time+ms});return id;},cancel:id=>timers.delete(id),
 async finish(p) {let done=false,result,error;p.then(v=>{done=true;result=v;},e=>{done=true;error=e;});
  for(let n=0;n<100&&!done;n++){for(let i=0;i<30;i++)await Promise.resolve();if(done)break;
   const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!next)throw Error('Operation stuck without deadline');
   time=next[1].at;timers.delete(next[0]);next[1].fn();}
  assert.ok(done,'bounded operation must settle');if(error)throw error;return result;},pending:()=>timers.size};
}
const ok=()=>({ok:true,status:200,json:async()=>({candidates:[{content:{parts:[{text:'ok'}]}}]})});
function setup(sequence){const timer=clock(),calls=[],logs=[];const api=provider.createProvider({...timer,random:()=>0.5,HttpsError,
 logger:Object.fromEntries(['error','warn'].map(level=>[level,(...args)=>logs.push({level,args})])),
 fetch:async(url,options)=>{calls.push({url,options});const step=sequence[Math.min(calls.length-1,sequence.length-1)];
 if(step==='hang')return new Promise(()=>{});
 if(step==='body')return {ok:true,status:200,json:()=>new Promise(()=>{})};
 if(step==='network')throw new TypeError('secret-key question history URL');
 if(step===200)return ok();return {ok:false,status:step};}});
 return {timer,calls,logs,api,run:()=>timer.finish(api.runWithDeadline(signal=>api.chamarGemini({question:'question',history:'history'},'secret-key','publico',signal),'publico'))};}

test('stable model and deadlines fit the explicit 60s function budget',()=>{
 assert.equal(provider.MODEL,'gemini-3.8-flash');assert.equal(provider.FUNCTION_TIMEOUT_SECONDS,60);
 assert.equal(provider.MAX_ATTEMPTS,2);assert.ok(provider.ATTEMPT_TIMEOUT_MS*2+500<provider.REQUEST_TIMEOUT_MS);
 assert.ok(provider.REQUEST_TIMEOUT_MS<=provider.FUNCTION_TIMEOUT_SECONDS*1000-10000);
 const ai=loadAi(memoryDb(seed()));assert.equal(ai.askBusinessAI.options.timeoutSeconds,60);assert.equal(ai.askPublicBusinessAI.options.timeoutSeconds,60);
});
for(const [steps,count,success] of [[[200],1,true],[[503,200],2,true],[[503,503],2,false],[['hang',200],2,true],[['hang','hang'],2,false],[['body',200],2,true],[['network',200],2,true],[[500,200],2,true],[[502,200],2,true]])
test('bounded provider '+JSON.stringify(steps),async()=>{const s=setup(steps);
 if(success)assert.ok(await s.run());else await assert.rejects(s.run(),e=>e.code==='unavailable');
 assert.equal(s.calls.length,count);assert.ok(s.timer.now()<50000);assert.equal(s.timer.pending(),0);
 assert.ok(s.calls.every(c=>c.url.includes('/gemini-3.8-flash:generateContent')));
 if(steps[0]==='hang'||steps[0]==='body')assert.equal(s.calls[0].options.signal.aborted,true);
 assert.equal(s.logs.filter(l=>l.level==='error').length,success?0:1);
 assert.equal(s.logs.filter(l=>l.level==='warn').length,count-1);
 const logged=JSON.stringify(s.logs,(k,v)=>v instanceof Error?{message:v.message,stack:v.stack}:v);
 assert.doesNotMatch(logged,/secret-key|question|history|generateContent\?key/);
 for(const log of s.logs){const f=log.args.at(-1);assert.equal(f.caminho,'publico');assert.equal(f.model,'gemini-3.8-flash');assert.ok([1,2].includes(f.attempt));assert.ok(f.durationMs>=0);}
});
for(const status of [400,401,403,404,429])test('no retry for '+status,async()=>{
 const s=setup([status,200]);await assert.rejects(s.run(),e=>e.code===(status===429?'resource-exhausted':'unavailable'));
 assert.equal(s.calls.length,1);assert.equal(s.logs.filter(l=>l.level==='error').length,1);
});
test('overall deadline bounds pre-provider waits and prevents late provider calls',async()=>{
 const s=setup([200]);let release;const gate=new Promise(resolve=>release=resolve);
 await assert.rejects(s.timer.finish(s.api.runWithDeadline(async signal=>{await gate;return s.api.chamarGemini({},'key','privado',signal);},'privado')),e=>e.code==='unavailable');
 assert.equal(s.timer.now(),50000);release();for(let n=0;n<30;n++)await Promise.resolve();assert.equal(s.calls.length,0);
 assert.equal(s.logs.filter(l=>l.level==='error').length,1);
});
test('deadline during transport cancels and logs only once',async()=>{
 const s=setup(['hang']);await assert.rejects(s.timer.finish(s.api.runWithDeadline(async signal=>{
 await new Promise(r=>s.timer.schedule(r,40000));return s.api.chamarGemini({},'key','privado',signal);
 },'privado')),e=>e.code==='unavailable');
 assert.equal(s.timer.now(),50000);assert.equal(s.calls.length,1);assert.equal(s.calls[0].options.signal.aborted,true);
 assert.equal(s.logs.filter(l=>l.level==='error').length,1);
});
for(const channel of ['askBusinessAI','askPublicBusinessAI'])test(channel+' retries debit once and preserve payload',async()=>{
 const timer=clock(),db=memoryDb(seed());const ai=loadAi(db,{providerOptions:{...timer,random:()=>0},transport:async(_u,_o,n)=>n===1?{ok:false,status:503}:ok()});
 await timer.finish(ai[channel](request()));assert.equal(ai.calls.length,2);assert.deepEqual(ai.calls[0],ai.calls[1]);
 assert.equal(db.docs.get(quotaPath()).count,1);assert.equal(db.docs.get(quotaPath()).publicCount,channel==='askPublicBusinessAI'?1:0);
});
test('final timeout is unavailable at handler and reserves only once',async()=>{
 const timer=clock(),db=memoryDb(seed());const ai=loadAi(db,{providerOptions:{...timer,random:()=>0},transport:()=>new Promise(()=>{})});
 await assert.rejects(timer.finish(ai.askPublicBusinessAI(request())),e=>e.code==='unavailable');
 assert.equal(ai.calls.length,2);assert.equal(db.docs.get(quotaPath()).count,1);assert.equal(db.docs.get(quotaPath()).publicCount,1);
});
