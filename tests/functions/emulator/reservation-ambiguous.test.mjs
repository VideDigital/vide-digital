import assert from 'node:assert/strict';
import {test,beforeEach,after} from 'node:test';
import Module,{createRequire} from 'node:module';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||'')||!(process.env.GCLOUD_PROJECT||'').startsWith('demo-'))throw Error('Emulator-only');
const app=initializeApp({projectId:process.env.GCLOUD_PROJECT});const db=getFirestore();
let identity,deleted,failDelete;
const fakeAuth={getUserByEmail:async()=>{if(identity)return identity;throw Object.assign(new Error('absent'),{code:'auth/user-not-found'})},createUser:async data=>(identity={uid:'reservation-ambiguous-staff',disabled:data.disabled}),updateUser:async(_uid,patch)=>{identity={...identity,...patch}},deleteUser:async uid=>{deleted.push(uid);if(failDelete)throw Error('delete failed');identity=null},revokeRefreshTokens:async()=>{}};
const originalLoad=Module._load;
Module._load=function(p,parent,...rest){if(p==='firebase-admin/auth'&&parent?.filename?.includes('functions'))return{getAuth:()=>fakeAuth};return originalLoad.call(this,p,parent,...rest)};
const require=createRequire(import.meta.url);let f;
try{f=require('../../../functions/src/employees/index.js')}finally{Module._load=originalLoad}
const uid='reservation-ambiguous-staff',owner='reservation-ambiguous-owner';
const req={auth:{uid:owner,token:{}},data:{nome:'Synthetic',email:'reservation@qa.invalid',password:'Synthetic123!'}};
const active=()=>db.collection('funcionarios').where('donoUID','==',owner).where('status','==','ativo').get();
beforeEach(async()=>{identity=null;deleted=[];failDelete=false;await db.doc('funcionarios/'+uid).delete();await db.doc('funcionarios/reservation-occupied').delete();await db.doc('usuarios/'+owner).set({status:'aprovado',plano:'pro'})});
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
