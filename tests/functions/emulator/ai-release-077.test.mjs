import assert from "node:assert/strict";
import {after,test} from "node:test";
import {initializeApp,deleteApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import api from "../../../functions/src/ai/index.js";
import {loadAi,request,quotaError} from "../helpers/ai-077-harness.mjs";
assert.match(process.env.FIRESTORE_EMULATOR_HOST || "", /^(127\.0\.0\.1|localhost):\d+$/, "Emulator only");
const app=initializeApp({projectId:"demo-vide-hub"},"ai-077-"+Date.now());
const app2=initializeApp({projectId:"demo-vide-hub"},"ai-077-second-"+Date.now());
const db=getFirestore(app), db2=getFirestore(app2);
const prefix="ai077-"+Date.now();
const refs=new Set();
const now=new Date("2026-10-05T12:00:00Z");
const refFor=owner=>db.doc("ia_negocio_uso/"+owner+"_2026-10");
async function put(path,data){refs.add(path);await db.doc(path).set(data);}
after(async()=>{await Promise.all([...refs].map(p=>db.doc(p).delete()));await Promise.all([deleteApp(app),deleteApp(app2)]);});
test("077 Emulator: concurrent public calls across clients cannot cross public ceiling",async()=>{
 const owner=prefix+"-public";await put(refFor(owner).path,{count:98,publicCount:98});
 const results=await Promise.allSettled(Array.from({length:6},(_,i)=>api.assertMonthlyQuota(owner,"public",i%2?db:db2,now)));
 assert.equal(results.filter(r=>r.status==="fulfilled").length,2);
 for(const r of results.filter(r=>r.status==="rejected"))assert.equal(r.reason.code,"resource-exhausted");
 assert.equal((await refFor(owner).get()).data().count,100);
 assert.equal((await refFor(owner).get()).data().publicCount,100);
 await api.assertMonthlyQuota(owner,"private",db,now);
 assert.equal((await refFor(owner).get()).data().count,101);
});
test("077 Emulator: mixed concurrent clients stop at 200, retries cannot exceed total",async()=>{
 const owner=prefix+"-mixed";await put(refFor(owner).path,{count:198,publicCount:90});
 const results=await Promise.allSettled(Array.from({length:6},(_,i)=>api.assertMonthlyQuota(owner,i%2?"public":"private",i%2?db:db2,now)));
 assert.equal(results.filter(r=>r.status==="fulfilled").length,2);
 for(const r of results.filter(r=>r.status==="rejected"))assert.equal(r.reason.code,"resource-exhausted");
 const data=(await refFor(owner).get()).data();assert.equal(data.count,200);assert.ok(data.publicCount<=92);
 await assert.rejects(api.assertMonthlyQuota(owner,"private",db,now),quotaError);
 await assert.rejects(api.assertMonthlyQuota(owner,"public",db2,now),quotaError);
 assert.equal((await refFor(owner).get()).data().count,200);
});
test("077 Emulator: legacy, new month and independent tenant without migration",async()=>{
 const owner=prefix+"-legacy", other=prefix+"-other";
 await put(refFor(owner).path,{count:150});
 await assert.rejects(api.assertMonthlyQuota(owner,"public",db,now),quotaError);
 await api.assertMonthlyQuota(owner,"private",db,now);
 assert.equal((await refFor(owner).get()).data().count,151);
 assert.equal((await refFor(owner).get()).data().publicCount,150);
 refs.add("ia_negocio_uso/"+owner+"_2026-11");
 refs.add(refFor(other).path);
 await api.assertMonthlyQuota(owner,"public",db,new Date("2026-11-01T00:00:00Z"));
 await api.assertMonthlyQuota(other,"public",db,now);
 assert.equal((await refFor(other).get()).data().count,1);
});
test("077 Emulator: indexed query and real public tenant resolver isolate active catalog through final prompt",async()=>{
 const owner=prefix+"-catalog", other=prefix+"-catalog-b", slug=prefix+"-store";
 await put("usuarios/"+owner,{status:"aprovado",plano:"pro",iaNegocioPublicaAtiva:true});
 await put("vitrines_publicas/"+slug,{donoUID:owner});
 for(const [name,status] of [["ACTIVE","ativo"],["DRAFT","rascunho"],["ARCHIVED","arquivado"],["MISSING",undefined],["EMPTY",""],["UNKNOWN","other"]])
  await put("produtos/"+prefix+name,{criadoPor:owner,nome:name,preco:1,...(status===undefined?{}:{statusProduto:status})});
 await put("produtos/"+prefix+"OTHER",{criadoPor:other,nome:"OTHER_TENANT",statusProduto:"ativo"});
 const loaded=await api.carregarProdutosPublicos(owner,db);
 assert.deepEqual(loaded.produtos.map(p=>p.nome),["ACTIVE"]);
 const ai=loadAi(db);
 const period=api.currentPeriodKey();refs.add("ia_negocio_uso/"+owner+"_"+period);
 await ai.askPublicBusinessAI(request({storeSlug:slug,ownerUid:other,tenantId:other}));
 const text=ai.calls[0].systemInstruction.parts[0].text;
 assert.match(text,/ACTIVE/);assert.doesNotMatch(text,/DRAFT|ARCHIVED|MISSING|EMPTY|UNKNOWN|OTHER_TENANT/);
});

