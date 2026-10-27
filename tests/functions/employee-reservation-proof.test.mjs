import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../functions/package.json',import.meta.url));
const {HttpsError}=require('firebase-functions/v2/https');
const {mutateEmployeeCapacity:mutate,isDefinitiveCreateRejection:proven}=require('./src/employees/capacity.js');
const operation={ownerUid:'proof-owner',employeeUid:'proof-staff',syncId:'proof-operation'};
function fixture(){
 let plan='starter',current=null;
 const db={doc:path=>({path}),collection:()=>({where:()=>({where:()=>({query:true})})})};
 const tx={get:async ref=>ref.query?{size:0}:ref.path.startsWith('usuarios/')?{exists:true,data:()=>({status:'aprovado',plano:plan})}:ref.path.startsWith('funcionarios/')?{exists:!!current,data:()=>current}:{exists:false,data:()=>({})},create(){},set(){}};
 db.runTransaction=async callback=>callback(tx);
 return {db,tx,setPlan:p=>{plan=p},setCurrent:c=>{current=c},run:()=>mutate({db,...operation,operation:'create',actorUid:operation.ownerUid,payload:{nome:'Synthetic'}})};
}
test('safe rejection evidence is private and bound to UID, tenant and operation',async()=>{
 const f=fixture();let rejected;
 await assert.rejects(f.run(),error=>{rejected=error;return error.code==='failed-precondition'});
 assert.equal(proven(rejected,operation),true);
 for(const field of Object.keys(operation))assert.equal(proven(rejected,{...operation,[field]:'another'}),false);
 assert.equal(proven(new HttpsError('failed-precondition','same code'),operation),false);
 assert.equal(proven(rejected),false);assert.equal(proven(null,operation),false);
});
test('write evidence accumulates even when an uncommitted callback is retried',async()=>{
 const f=fixture();f.setPlan('pro');
 f.db.runTransaction=async callback=>{await callback(f.tx);f.setPlan('starter');return callback(f.tx)};
 await assert.rejects(f.run(),error=>{assert.equal(error.code,'failed-precondition');assert.equal(proven(error,operation),false);return true});
});
test('observing another reservation never authorizes identity deletion',async()=>{
 const f=fixture();f.setPlan('pro');f.setCurrent({donoUID:'foreign',status:'ativo',authSyncPendente:true,authSyncId:'different'});
 await assert.rejects(f.run(),error=>{assert.equal(error.code,'already-exists');assert.equal(proven(error,operation),false);return true});
});
test('unexpected RPC failures are not definitive even before callback execution',async()=>{
 const f=fixture();f.db.runTransaction=async()=>{throw Error('unknown transport result')};
 await assert.rejects(f.run(),error=>{assert.equal(proven(error,operation),false);return true});
});
test('a reused error cannot carry old safe evidence past a later write attempt',async()=>{
 const f=fixture();const error=new HttpsError('failed-precondition','synthetic dependency rejection');
 f.db.runTransaction=async()=>{throw error};
 await assert.rejects(f.run());assert.equal(proven(error,operation),true);
 f.setPlan('pro');f.db.runTransaction=async callback=>{await callback(f.tx);throw error};
 await assert.rejects(f.run());assert.equal(proven(error,operation),false);
});
