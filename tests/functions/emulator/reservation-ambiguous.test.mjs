import assert from 'node:assert/strict';
import {test,beforeEach,after,mock} from 'node:test';
import Module,{createRequire} from 'node:module';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||'')||!(process.env.GCLOUD_PROJECT||'').startsWith('demo-'))throw Error('Emulator-only');
const app=initializeApp({projectId:process.env.GCLOUD_PROJECT});const db=getFirestore();
let identity,deleted,failDelete,enabled,createError,enableError;
// Deterministic external Auth boundary. Firestore and its SDK retries below
// remain real; this does not simulate production Auth network behavior.
const fakeAuth={
 getUserByEmail:async()=>{if(identity)return identity;throw Object.assign(new Error('absent'),{code:'auth/user-not-found'})},
 createUser:async data=>{if(createError)throw createError;if(identity)throw Object.assign(Error('email exists'),{code:'auth/email-already-exists'});return identity={uid:'reservation-ambiguous-staff',disabled:data.disabled}},
 updateUser:async(_uid,patch)=>{enabled.push(patch);if(enableError)throw enableError;identity={...identity,...patch}},
 deleteUser:async uid=>{deleted.push(uid);if(failDelete)throw Error('delete failed');identity=null},revokeRefreshTokens:async()=>{}
};
const originalLoad=Module._load;
Module._load=function(p,parent,...rest){if(p==='firebase-admin/auth'&&parent?.filename?.includes('functions'))return{getAuth:()=>fakeAuth};return originalLoad.call(this,p,parent,...rest)};
const require=createRequire(import.meta.url);let f;
try{f=require('../../../functions/src/employees/index.js')}finally{Module._load=originalLoad}
const uid='reservation-ambiguous-staff',owner='reservation-ambiguous-owner';
const req={auth:{uid:owner,token:{}},data:{nome:'Synthetic',email:'reservation@qa.invalid',password:'Synthetic123!'}};
const active=()=>db.collection('funcionarios').where('donoUID','==',owner).where('status','==','ativo').get();
beforeEach(async()=>{identity=null;deleted=[];failDelete=false;enabled=[];createError=null;enableError=null;await db.doc('funcionarios/'+uid).delete();await db.doc('funcionarios/reservation-occupied').delete();await db.doc('usuarios/'+owner).set({status:'aprovado',plano:'pro'})});
after(async()=>{for(const p of ['funcionarios/'+uid,'funcionarios/reservation-occupied','usuarios/'+owner,'employee_capacity_guards/'+owner])await db.doc(p).delete();await deleteApp(app)});
test('committed reservation with response lost preserves identity, lock and quota',async()=>{
 const original=db.runTransaction.bind(db);let calls=0;
 db.runTransaction=async fn=>{const value=await original(fn);if(++calls===1)throw Error('commit accepted; response lost');return value;};
 try{await assert.rejects(()=>f.createEmployee.run(req),e=>e.code==='internal')}finally{db.runTransaction=original}
 assert.deepEqual(deleted,[]);assert.equal(identity.disabled,true);
 const saved=(await db.doc('funcionarios/'+uid).get()).data();assert.equal(saved.authSyncPendente,true);assert.equal(saved.status,'ativo');assert.ok(saved.authSyncId);assert.equal((await active()).size,1);
 await assert.rejects(()=>f.createEmployee.run(req),e=>e.code==='already-exists');assert.deepEqual(deleted,[]);
 await assert.rejects(()=>f.enableEmployee.run({auth:req.auth,data:{uid}}),e=>e.code==='failed-precondition');
});
test('unknown failure before commit preserves disabled identity, no quota claimed',async()=>{const original=db.runTransaction;db.runTransaction=async()=>{throw Error('unknown RPC result')};try{await assert.rejects(()=>f.createEmployee.run(req),e=>e.code==='internal')}finally{db.runTransaction=original}assert.deepEqual(deleted,[]);assert.equal(identity.disabled,true);assert.equal((await active()).size,0)});
test('definitive capacity rejection safely removes only newly disabled Auth account',async()=>{await db.doc('funcionarios/reservation-occupied').set({donoUID:owner,status:'ativo'});await assert.rejects(()=>f.createEmployee.run(req),e=>e.code==='failed-precondition');assert.deepEqual(deleted,[uid]);assert.equal(identity,null);assert.equal((await active()).size,1)});
test('failed deletion on definitive rejection preserves identity and occupied quota',async()=>{await db.doc('funcionarios/reservation-occupied').set({donoUID:owner,status:'ativo'});failDelete=true;await assert.rejects(()=>f.createEmployee.run(req),e=>e.code==='failed-precondition');assert.equal(identity.disabled,true);assert.equal((await active()).size,1);assert.equal((await db.doc('funcionarios/'+uid).get()).exists,false)});

test('SDK retry after a committed reservation never deletes its disabled identity',async()=>{
 const original=db.runTransaction.bind(db);let attempts=0,lost=false;
 const {logger}=require('firebase-functions');const logs=[];
 const loggerMock=mock.method(logger,'error',(...args)=>logs.push(args));
 db.runTransaction=callback=>original(async tx=>{
  attempts++;
  if(attempts===1){const commit=tx.commit.bind(tx);tx.commit=async()=>{await commit();if(!lost){lost=true;throw Object.assign(Error('response lost after real commit'),{code:14})}}}
  return callback(tx);
 });
 try{await assert.rejects(()=>f.createEmployee.run(req),e=>e.code==='already-exists')}finally{db.runTransaction=original;loggerMock.mock.restore()}
 assert.equal(lost,true);assert.equal(attempts,2);
 const saved=(await db.doc('funcionarios/'+uid).get()).data();
 assert.equal(saved.status,'ativo');assert.equal(saved.authSyncPendente,true);assert.ok(saved.authSyncId);
 const event=logs.find(args=>/Reserva com resultado incerto/.test(args[0]));
 assert.deepEqual(event?.[1],{uid,syncId:saved.authSyncId});
 for(const privateValue of [req.data.email,req.data.password,req.data.nome])assert.equal(JSON.stringify(logs).includes(privateValue),false);
 assert.notEqual(identity,null,'a final business error is not proof that earlier attempts never committed');
 assert.equal(identity.disabled,true);assert.deepEqual(deleted,[]);assert.equal((await active()).size,1);
 await assert.rejects(()=>f.createEmployee.run(req),e=>e.code==='already-exists');
 assert.deepEqual(deleted,[]);
 await assert.rejects(()=>f.enableEmployee.run({auth:req.auth,data:{uid}}),e=>e.code==='failed-precondition');
 await assert.rejects(()=>f.disableEmployee.run({auth:req.auth,data:{uid}}),e=>e.code==='failed-precondition');
 assert.equal((await db.doc('funcionarios/'+uid).get()).data().authSyncId,saved.authSyncId);
});

test('normal creation enables only after confirmed reservation and completes its lock',async()=>{
 const answer=await f.createEmployee.run({...req,data:{...req.data,ownerUid:'foreign',donoUID:'foreign',syncId:'client-controlled'}});
 assert.equal(answer.ok,true);assert.equal(identity.disabled,false);assert.deepEqual(enabled,[{disabled:false}]);assert.deepEqual(deleted,[]);
 const saved=(await db.doc('funcionarios/'+uid).get()).data();assert.equal(saved.donoUID,owner);assert.equal(saved.status,'ativo');assert.equal(saved.authSyncPendente,false);assert.equal(saved.authSyncId,undefined);assert.equal((await active()).size,1);
});

test('Auth failure before creation never deletes a preexisting identity or reserves quota',async()=>{
 createError=Error('Auth create failed');await assert.rejects(()=>f.createEmployee.run(req),e=>e.code==='internal');
 assert.equal(identity,null);assert.deepEqual(deleted,[]);assert.equal((await active()).size,0);
 identity={uid:'preexisting-identity',disabled:false};createError=null;
 await assert.rejects(()=>f.createEmployee.run(req),e=>e.code==='already-exists');assert.equal(identity.uid,'preexisting-identity');assert.equal(identity.disabled,false);assert.deepEqual(deleted,[]);
});

test('an observed document from another operation is never resumed or overwritten',async()=>{
 const saved={donoUID:owner,status:'ativo',authSyncPendente:true,authSyncId:'other-operation',criadoPorAuthUid:owner};
 await db.doc('funcionarios/'+uid).set(saved);
 await assert.rejects(()=>f.createEmployee.run(req),e=>e.code==='already-exists');
 assert.equal(identity.disabled,true);assert.deepEqual(enabled,[]);assert.deepEqual(deleted,[]);assert.deepEqual((await db.doc('funcionarios/'+uid).get()).data(),saved);assert.equal((await active()).size,1);
});

test('foreign tenant document and missing Auth remain untouched, never treated as this retry',async()=>{
 const saved={donoUID:'foreign-tenant',status:'ativo',authSyncPendente:true,authSyncId:'foreign-operation'};
 await db.doc('funcionarios/'+uid).set(saved);
 await assert.rejects(()=>f.createEmployee.run(req),e=>e.code==='already-exists');
 assert.equal(identity.disabled,true);assert.deepEqual(enabled,[]);assert.deepEqual(deleted,[]);assert.deepEqual((await db.doc('funcionarios/'+uid).get()).data(),saved);assert.equal((await active()).size,0);
});

test('a transport wrapper returning HttpsError after real commit cannot authorize deletion',async()=>{
 const {HttpsError}=require('firebase-functions/v2/https');const original=db.runTransaction.bind(db);
 db.runTransaction=async callback=>{await original(callback);throw new HttpsError('failed-precondition','wrapped lost response')};
 try{await assert.rejects(()=>f.createEmployee.run(req),e=>e.code==='failed-precondition')}finally{db.runTransaction=original}
 assert.equal(identity.disabled,true);assert.deepEqual(deleted,[]);assert.deepEqual(enabled,[]);assert.equal((await active()).size,1);assert.equal((await db.doc('funcionarios/'+uid).get()).data().authSyncPendente,true);
});

test('SDK retry denying a now suspended owner still preserves the earlier commit',async()=>{
 const original=db.runTransaction.bind(db);let attempts=0;
 db.runTransaction=callback=>original(async tx=>{
  attempts++;
  if(attempts===1){const commit=tx.commit.bind(tx);tx.commit=async()=>{await commit();throw Object.assign(Error('committed response lost'),{code:14})}}
  if(attempts===2)await db.doc('usuarios/'+owner).update({status:'inativo'});
  return callback(tx);
 });
 try{await assert.rejects(()=>f.createEmployee.run(req),e=>e.code==='permission-denied')}finally{db.runTransaction=original}
 assert.equal(attempts,2);assert.equal(identity.disabled,true);assert.deepEqual(deleted,[]);assert.deepEqual(enabled,[]);assert.equal((await active()).size,1);assert.equal((await db.doc('funcionarios/'+uid).get()).data().authSyncPendente,true);
});

test('a changed syncId on SDK retry never becomes a successful completion',async()=>{
 const original=db.runTransaction.bind(db);let attempts=0;
 db.runTransaction=callback=>original(async tx=>{
  attempts++;
  if(attempts===1){const commit=tx.commit.bind(tx);tx.commit=async()=>{await commit();throw Object.assign(Error('committed response lost'),{code:14})}}
  if(attempts===2)await db.doc('funcionarios/'+uid).update({authSyncId:'changed-operation'});
  return callback(tx);
 });
 try{await assert.rejects(()=>f.createEmployee.run(req),e=>e.code==='already-exists')}finally{db.runTransaction=original}
 assert.equal(attempts,2);assert.equal(identity.disabled,true);assert.deepEqual(deleted,[]);assert.deepEqual(enabled,[]);const saved=(await db.doc('funcionarios/'+uid).get()).data();assert.equal(saved.authSyncPendente,true);assert.equal(saved.authSyncId,'changed-operation');
});

test('failed completion and pending access remain fail closed, including external retry',async()=>{
 enableError=Error('Auth enable timeout');await assert.rejects(()=>f.createEmployee.run(req),e=>e.code==='internal');
 const saved=(await db.doc('funcionarios/'+uid).get()).data();assert.equal(saved.authSyncPendente,true);assert.equal(identity.disabled,true);assert.deepEqual(deleted,[]);
 const {resolveCallerContext}=require('../../../functions/src/shared/context.js');
 await assert.rejects(()=>resolveCallerContext({auth:{uid,token:{}}}),e=>e.code==='permission-denied');
 await assert.rejects(()=>f.createEmployee.run(req),e=>e.code==='already-exists');assert.equal((await db.doc('funcionarios/'+uid).get()).data().authSyncId,saved.authSyncId);assert.deepEqual(deleted,[]);
});

test('double-click cannot delete the other call identity or exceed quota',async()=>{
 const result=await Promise.allSettled([f.createEmployee.run(req),f.createEmployee.run(req)]);
 assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.filter(r=>r.status==='rejected').length,1);
 assert.equal(identity.disabled,false);assert.deepEqual(deleted,[]);assert.equal((await active()).size,1);assert.equal((await db.doc('funcionarios/'+uid).get()).data().authSyncPendente,false);
});

test('suspended owner and delegated staff never reach Auth creation',async()=>{
 await db.doc('usuarios/'+owner).update({status:'inativo'});await assert.rejects(()=>f.createEmployee.run(req),e=>e.code==='permission-denied');assert.equal(identity,null);
 await db.doc('usuarios/'+owner).update({status:'aprovado'});await db.doc('funcionarios/'+uid).set({donoUID:owner,status:'ativo',permissoes:{ver:['funcionarios'],editar:['funcionarios']}});
 await assert.rejects(()=>f.createEmployee.run({auth:{uid,token:{}},data:req.data}),e=>e.code==='permission-denied');assert.equal(identity,null);assert.deepEqual(deleted,[]);
});
