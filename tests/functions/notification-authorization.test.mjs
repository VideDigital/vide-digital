import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
const root=new URL('../../functions/src/',import.meta.url);
class HttpsError extends Error {constructor(code,message){super(message);this.code=code;}}
function harness({uid='staff',ownerStatus='aprovado',status='ativo',pending,recipient='staff',admin=false,owner=false,missing=false,race}={}) {
  let writes=0; const records=new Map([
    ['usuarios/tenant',{status:ownerStatus}],
    ['notificacoes/n',{destinatarios:recipient==='*'?['*']:[recipient]}]
  ]);
  if(owner) records.set('usuarios/'+uid,{status:ownerStatus});
  else if(!missing) records.set('funcionarios/'+uid,{donoUID:'tenant',status,authSyncPendente:pending,permissoes:{ver:[],editar:[]}});
  let raced=false,attempts=0;
  const snapshot=p=>{const data=records.has(p)?structuredClone(records.get(p)):undefined;
    if(p==='notificacoes/n' && race && !raced){raced=true;race(records);}
    return {exists:data!==undefined,data:()=>data};};
  const db={doc:p=>({path:p,get:async()=>snapshot(p),set:async()=>{writes++;}}),runTransaction:async callback=>{
    for(let i=0;i<3;i++) {attempts++;const versions=new Map(),updates=[];
      const result=await callback({get:async ref=>{versions.set(ref.path,JSON.stringify(records.get(ref.path)));return snapshot(ref.path);},update:(ref,data)=>updates.push([ref.path,data])});
      if([...versions].some(([p,v])=>v!==JSON.stringify(records.get(p))))continue;
      for(const[p,data]of updates){assert.ok(records.has(p));records.set(p,{...records.get(p),...data});writes++;}return result;
    }throw Error('retry limit');
  }};
  let context;
  const load=(rel)=>{const module={exports:{}};vm.runInNewContext(readFileSync(new URL(rel,root),'utf8'),{module,exports:module.exports,process:{env:{}},require:p=>{
    if(p==='firebase-functions/v2/https')return{onCall:(_,fn)=>fn,HttpsError};
    if(p==='firebase-admin/firestore')return{getFirestore:()=>db,FieldValue:{arrayUnion:x=>[x],arrayRemove:x=>[x],serverTimestamp:()=>0}};
    if(p.endsWith('validators'))return{normalizeEmail:x=>String(x||'').toLowerCase(),normalizeString:x=>String(x||'')};
    if(p==='../shared/context')return context;
    throw Error(p);
  }});return module.exports;};
  context=load('shared/context.js');const handler=load('notifications/index.js').markNotificationRead;
  return{run:(request)=>handler(request||{auth:{uid,token:{videAdmin:admin}},data:{id:'n'}}),writes:()=>writes,attempts:()=>attempts};
}
for(const [name,config] of Object.entries({legacy:{},synced:{pending:false},owner:{owner:true},broadcast:{recipient:'*'},admin:{admin:true,missing:true,recipient:'other'}}))test('allows '+name,async()=>{const h=harness(config);assert.equal((await h.run()).ok,true);assert.equal(h.writes(),1)});
for(const [name,config] of Object.entries({pending:{pending:true},inactive:{status:'inativo'},suspended:{ownerStatus:'inativo'},rejected:{ownerStatus:'rejeitado'},unapproved:{ownerStatus:'pendente'},suspendedOwner:{owner:true,ownerStatus:'inativo'},missing:{missing:true},crossTenantRecipient:{recipient:'other'},broadcastPending:{recipient:'*',pending:true}}))test('denies '+name+' before any write',async()=>{const h=harness(config);await assert.rejects(h.run(),e=>e.code==='permission-denied');assert.equal(h.writes(),0)});
const races={owner:r=>r.set('usuarios/tenant',{status:'inativo'}),employee:r=>r.set('funcionarios/staff',{...r.get('funcionarios/staff'),status:'inativo'}),pending:r=>r.set('funcionarios/staff',{...r.get('funcionarios/staff'),authSyncPendente:true}),tenant:r=>r.set('funcionarios/staff',{...r.get('funcionarios/staff'),donoUID:'foreign'}),recipient:r=>r.set('notificacoes/n',{destinatarios:['foreign']}),deleted:r=>r.delete('notificacoes/n')};
for(const[name,race]of Object.entries(races))test('transaction retry rejects concurrent '+name+' revocation',async()=>{const h=harness({race});await assert.rejects(h.run());assert.equal(h.writes(),0);assert.equal(h.attempts(),2)});
test('unauthenticated has no write',async()=>{const h=harness();await assert.rejects(h.run({data:{id:'n'}}),e=>e.code==='unauthenticated');assert.equal(h.writes(),0)});
