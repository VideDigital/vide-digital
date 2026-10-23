// Isolated diagnostic: must only use local Firestore Emulator.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {getApps,initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import capacity from '../../functions/src/employees/capacity.js';

const project='demo-vide-hub';
assert.match(process.env.FIRESTORE_EMULATOR_HOST||'',/^(127\.0\.0\.1|localhost):8080$/);
assert.equal(process.env.GCLOUD_PROJECT||project,project);
assert.equal(process.env.GOOGLE_CLOUD_PROJECT||project,project);
assert.equal(process.env.GOOGLE_APPLICATION_CREDENTIALS||'','');
const mode=process.argv[2];
assert.ok(['A','B','B-trace'].includes(mode));
function log(event,details={}){console.log('S106_RPC_DIAG '+JSON.stringify({time:new Date().toISOString(),event,...details}));}
function err(e){return {code:e?.code??null,message:String(e?.message??e),stack:String(e?.stack??'').split('\n').slice(0,6)};}
if(mode==='B'){
  const files=['tests/emulator/firestore-security.test.mjs',
    'tests/emulator/banner-replacement-integrity.test.mjs',
    'tests/emulator/storage-security.test.mjs',
    'tests/functions/emulator/employee-limit.test.mjs'];
  let fail=false;
  for(const file of files){
    log('suite-start',{file});
    const r=spawnSync(process.execPath,['--test',file],{stdio:'inherit',env:process.env});
    log('suite-result',{file,code:r.status,signal:r.signal});
    if(r.status!==0){fail=true;break;}
  }
  const trace=spawnSync(process.execPath,['scripts/diagnostics/s106-employee-rpc-linux.mjs','B-trace'],
    {stdio:'inherit',env:process.env});
  log('trace-result',{code:trace.status,signal:trace.signal});
  process.exitCode=(fail||trace.status!==0)?1:0;
}else{
  if(!getApps().length)initializeApp({projectId:project});
  const db=getFirestore();
  const owner='s106-linux-diag-'+mode.toLowerCase();
  const uids=['s106-linux-'+mode.toLowerCase()+'-a','s106-linux-'+mode.toLowerCase()+'-b'];
  const refs=uids.map(uid=>db.doc('funcionarios/'+uid));
  const guard=db.doc('employee_capacity_guards/'+owner);
  const own=db.doc('usuarios/'+owner);
  function tracked(op){
    let attempt=0;
    return new Proxy(db,{get(t,key){
      if(key==='runTransaction')return (fn,...opts)=>{
        const p=t.runTransaction(async tx=>{
          const n=++attempt;log('tx-begin',{op,attempt:n});
          const traced=new Proxy(tx,{get(t2,k,receiver){
            if(['get','set','update','create','delete'].includes(k))return (...args)=>{
              const resource=args[0]?.path||args[0]?._queryOptions?.collectionId||'query';
              log('tx-operation',{op,attempt:n,kind:k,resource});
              try{
                const v=t2[k](...args);
                if(k==='get')return Promise.resolve(v).then(
                  s=>{log('tx-read-ok',{op,attempt:n,resource,exists:s.exists??null,size:s.size??null});return s;},
                  e=>{log('tx-read-error',{op,attempt:n,resource,error:err(e)});throw e;});
                log('tx-write-scheduled-not-committed',{op,attempt:n,kind:k,resource});
                return v===t2?receiver:v;
              }catch(e){log('tx-operation-error',{op,attempt:n,kind:k,error:err(e)});throw e;}
            };
            const v=Reflect.get(t2,k,t2);
            return typeof v==='function'?v.bind(t2):v;
          }});
          try{
            const v=await fn(traced);
            log('callback-returned-not-committed',{op,attempt:n});
            return v;
          }catch(e){log('callback-error',{op,attempt:n,error:err(e)});throw e;}
        },...opts);
        return p.then(v=>{log('transaction-resolved-commit-confirmed',{op,attempts:attempt});return v;},
          e=>{log('transaction-rejected',{op,attempts:attempt,error:err(e)});throw e;});
      };
      const v=Reflect.get(t,key,t);return typeof v==='function'?v.bind(t):v;
    }});
  }
  async function enable(uid){
    const r=await capacity.mutateEmployeeCapacity({db:tracked('enable:'+uid),
      ownerUid:owner,employeeUid:uid,operation:'enable',actorUid:owner});
    await capacity.mutateEmployeeCapacity({db:tracked('complete:'+uid),
      ownerUid:owner,employeeUid:uid,operation:'complete-auth-sync',
      actorUid:owner,syncId:r.syncId});
    return {changed:r.changed,status:r.status};
  }
  async function snapshot(){
    const [o,g,a,b,active]=await Promise.all([own.get(),guard.get(),refs[0].get(),refs[1].get(),
      db.collection('funcionarios').where('donoUID','==',owner).where('status','==','ativo').get()]);
    const employees=[a,b].map(s=>({id:s.id,status:s.data()?.status??null,
      donoUID:s.data()?.donoUID??null,authSyncPendente:s.data()?.authSyncPendente??null,
      hasAuthSyncId:!!s.data()?.authSyncId}));
    const result={ownerExists:o.exists,plan:o.data()?.plano??null,guardExists:g.exists,
      revision:g.data()?.revision??null,activeCount:active.size,employees};
    log('snapshot-before-cleanup',result);return result;
  }
  let failure=null;
  try{
    await db.batch().delete(refs[0]).delete(refs[1]).delete(guard)
      .set(own,{plano:'pro',status:'aprovado'}).commit();
    await db.batch().set(refs[0],{donoUID:owner,status:'inativo'})
      .set(refs[1],{donoUID:owner,status:'inativo'}).commit();
    log('fixtures-created',{mode,owner,uids});
    const results=await Promise.allSettled(uids.map(enable));
    log('operations-settled',{results:results.map((v,i)=>({
      uid:uids[i],status:v.status,...(v.status==='rejected'?{error:err(v.reason)}:{value:v.value})}))});
    const s=await snapshot();
    assert.equal(results.filter(v=>v.status==='fulfilled').length,1);
    assert.equal(results.filter(v=>v.status==='rejected').length,1);
    assert.match(String(results.find(v=>v.status==='rejected').reason),/Limite de funcionários/);
    assert.equal(s.activeCount,1);
    assert.equal(s.employees.filter(v=>v.status==='ativo').length,1);
    assert.ok(s.employees.every(v=>v.donoUID===owner&&v.authSyncPendente!==true));
    log('assertions-pass',{mode});
  }catch(e){
    failure=e;log('diagnostic-failure',{mode,error:err(e)});
    try{await snapshot();}catch(e2){log('snapshot-error',{error:err(e2)});}
  }finally{
    try{
      await db.batch().delete(refs[0]).delete(refs[1]).delete(guard).delete(own).commit();
      const reads=await Promise.all([refs[0].get(),refs[1].get(),guard.get(),own.get()]);
      const clean=reads.every(s=>!s.exists);log('cleanup-verified',{mode,clean});
      assert.ok(clean,'All fixtures must be removed');
    }catch(e){log('cleanup-error',{error:err(e)});if(!failure)failure=e;}
  }
  if(failure)process.exitCode=1;
}
