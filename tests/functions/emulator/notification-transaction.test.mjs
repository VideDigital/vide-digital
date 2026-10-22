import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||'') || !(process.env.GCLOUD_PROJECT||'').startsWith('demo-'))throw Error('Emulator-only');
const app=initializeApp({projectId:process.env.GCLOUD_PROJECT});const db=getFirestore();
const{markNotificationRead}=require('../../../functions/src/notifications/index.js');
const ids={owner:'notification-tx-owner',staff:'notification-tx-staff',notice:'notification-tx-notice'};
async function seed(){await db.doc('usuarios/'+ids.owner).set({status:'aprovado'});await db.doc('funcionarios/'+ids.staff).set({status:'ativo',donoUID:ids.owner,permissoes:{ver:[],editar:[]}});await db.doc('notificacoes/'+ids.notice).set({destinatarios:[ids.staff],lidoPor:[]});}
after(async()=>{for(const p of ['usuarios/'+ids.owner,'funcionarios/'+ids.staff,'notificacoes/'+ids.notice])await db.doc(p).delete();await deleteApp(app)});
test('real Firestore transaction detects revocation after callback read and retries safely',async()=>{
 await seed();let attempts=0;const original=db.runTransaction.bind(db);
 // Inject ABORTED after reads/writes have been queued, before commit. The
 // real Admin SDK retries the real Emulator transaction. Revoke after the
 // first transaction rolls back and before the retry reads authorization.
 db.runTransaction=async callback=>{
   return original(async tx=>{attempts++;
     if(attempts===2)await db.doc('usuarios/'+ids.owner).update({status:'inativo'});
     const result=await callback(tx);
     if(attempts===1){const error=new Error('injected transaction conflict');error.code=10;throw error;}
     return result;
   });
 };
 try{await assert.rejects(()=>markNotificationRead.run({auth:{uid:ids.staff,token:{}},data:{id:ids.notice}}),e=>e.code==='permission-denied');assert.equal(attempts,2);assert.deepEqual((await db.doc('notificacoes/'+ids.notice).get()).data().lidoPor,[])}finally{db.runTransaction=original;}
});
test('real transaction accepts legitimate legacy staff and rejects cross recipient',async()=>{await seed();assert.equal((await markNotificationRead.run({auth:{uid:ids.staff,token:{}},data:{id:ids.notice}})).ok,true);assert.deepEqual((await db.doc('notificacoes/'+ids.notice).get()).data().lidoPor,[ids.staff]);await db.doc('notificacoes/'+ids.notice).update({destinatarios:['foreign'],lidoPor:[]});await assert.rejects(()=>markNotificationRead.run({auth:{uid:ids.staff,token:{}},data:{id:ids.notice}}),e=>e.code==='permission-denied');assert.deepEqual((await db.doc('notificacoes/'+ids.notice).get()).data().lidoPor,[])});
