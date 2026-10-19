import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
const root=new URL('../../functions/src/',import.meta.url);
class HttpsError extends Error {constructor(code,message){super(message);this.code=code;}}
function harness({uid='staff',ownerStatus='aprovado',status='ativo',pending,recipient='staff',admin=false,owner=false,missing=false}={}) {
  let writes=0; const records=new Map([
    ['usuarios/tenant',{status:ownerStatus}],
    ['notificacoes/n',{destinatarios:recipient==='*'?['*']:[recipient]}]
  ]);
  if(owner) records.set('usuarios/'+uid,{status:ownerStatus});
  else if(!missing) records.set('funcionarios/'+uid,{donoUID:'tenant',status,authSyncPendente:pending,permissoes:{ver:[],editar:[]}});
  const db={doc:p=>({get:async()=>({exists:records.has(p),data:()=>records.get(p)}),set:async()=>{writes++;}})};
  let context;
  const load=(rel)=>{const module={exports:{}};vm.runInNewContext(readFileSync(new URL(rel,root),'utf8'),{module,exports:module.exports,process:{env:{}},require:p=>{
    if(p==='firebase-functions/v2/https')return{onCall:(_,fn)=>fn,HttpsError};
    if(p==='firebase-admin/firestore')return{getFirestore:()=>db,FieldValue:{arrayUnion:x=>[x],arrayRemove:x=>[x],serverTimestamp:()=>0}};
    if(p.endsWith('validators'))return{normalizeEmail:x=>String(x||'').toLowerCase(),normalizeString:x=>String(x||'')};
    if(p==='../shared/context')return context;
    throw Error(p);
  }});return module.exports;};
  context=load('shared/context.js');const handler=load('notifications/index.js').markNotificationRead;
  return{run:()=>handler({auth:{uid,token:{videAdmin:admin}},data:{id:'n'}}),writes:()=>writes};
}
for(const [name,config] of Object.entries({legacy:{},synced:{pending:false},owner:{owner:true},broadcast:{recipient:'*'},admin:{admin:true,missing:true,recipient:'other'}}))test('allows '+name,async()=>{const h=harness(config);assert.equal((await h.run()).ok,true);assert.equal(h.writes(),1)});
for(const [name,config] of Object.entries({pending:{pending:true},inactive:{status:'inativo'},suspended:{ownerStatus:'inativo'},rejected:{ownerStatus:'rejeitado'},unapproved:{ownerStatus:'pendente'},suspendedOwner:{owner:true,ownerStatus:'inativo'},missing:{missing:true},crossTenantRecipient:{recipient:'other'},broadcastPending:{recipient:'*',pending:true}}))test('denies '+name+' before any write',async()=>{const h=harness(config);await assert.rejects(h.run(),e=>e.code==='permission-denied');assert.equal(h.writes(),0)});
