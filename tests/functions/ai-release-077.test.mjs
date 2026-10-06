import assert from "node:assert/strict";
import test from "node:test";
import {builder,memoryDb,seed,loadAi,request,quotaPath,quotaError} from "./helpers/ai-077-harness.mjs";

test("077 exact global and public budgets preserve a private reserve",()=>{
 assert.equal(builder.LIMITES_IA_NEGOCIO.usoMensalPadrao,200);
 assert.equal(builder.LIMITES_IA_NEGOCIO.usoMensalPublico,100);
});
test("private and public handlers use the same total and distinct public usage",async()=>{
 const db=memoryDb(seed()), ai=loadAi(db);
 const result=await ai.askBusinessAI(request());
 assert.equal(result.restanteNoMes,199);
 await ai.askPublicBusinessAI(request());
 assert.equal(db.docs.get(quotaPath()).count,2);
 assert.equal(db.docs.get(quotaPath()).publicCount,1);
 assert.equal(ai.calls.length,2);
});
test("100 public calls stop; all 100 reserved private units remain usable",async()=>{
 const db=memoryDb(seed()), ai=loadAi(db);
 for(let i=0;i<100;i++)await ai.askPublicBusinessAI(request());
 await assert.rejects(ai.askPublicBusinessAI(request()),quotaError);
 for(let i=0;i<100;i++)await ai.askBusinessAI(request());
 await assert.rejects(ai.askBusinessAI(request()),quotaError);
 await assert.rejects(ai.askPublicBusinessAI(request()),quotaError);
 assert.equal(db.docs.get(quotaPath()).count,200);
 assert.equal(db.docs.get(quotaPath()).publicCount,100);
 assert.equal(ai.calls.length,200);
});
test("private can use all 200 when public is unused; public never bypasses total",async()=>{
 const db=memoryDb({...seed(),[quotaPath()]:{count:199,publicCount:0}}), ai=loadAi(db);
 await ai.askBusinessAI(request());
 await assert.rejects(ai.askPublicBusinessAI(request()),quotaError);
 assert.equal(db.docs.get(quotaPath()).count,200);
});
test("legacy count is preserved and conservatively attributed; missing publicCount is safe",async()=>{
 for(const count of [0,30,99,100,199,200]) {
  const db=memoryDb({...seed(),[quotaPath()]:{count}}), ai=loadAi(db);
  if(count<100) {
   await ai.askPublicBusinessAI(request());
   assert.equal(db.docs.get(quotaPath()).publicCount,count+1);
  } else await assert.rejects(ai.askPublicBusinessAI(request()),quotaError);
  const current=db.docs.get(quotaPath()).count;
  if(current<200)await ai.askBusinessAI(request());
  else await assert.rejects(ai.askBusinessAI(request()),quotaError);
  assert.equal(db.docs.get(quotaPath()).count,Math.min(current+1,200));
 }
});
test("invalid counters fail closed without reset",async()=>{
 for(const data of [{count:-1},{count:"10"},{count:1.5},{count:NaN},{count:3,publicCount:4}]) {
  const db=memoryDb({...seed(),[quotaPath()]:data}), ai=loadAi(db);
  await assert.rejects(ai.askBusinessAI(request()),e=>e.code==="failed-precondition");
  assert.equal(ai.calls.length,0);
 }
});
test("concurrent public and mixed reservations respect both ceilings",async()=>{
 const db=memoryDb(seed()), a=loadAi(db), b=loadAi(db);
 const pub=await Promise.allSettled(Array.from({length:110},(_,i)=>(i%2?a:b).assertMonthlyQuota("owner-a","public",db)));
 assert.equal(pub.filter(r=>r.status==="fulfilled").length,100);
 const mixed=await Promise.allSettled(Array.from({length:110},(_,i)=>(i%2?a:b).assertMonthlyQuota("owner-a",i%2?"public":"private",db)));
 assert.equal(mixed.filter(r=>r.status==="fulfilled").length,55);
 assert.equal(db.docs.get(quotaPath()).count,155);
});
test("month rollover and tenant budgets are independent",async()=>{
 const db=memoryDb(), ai=loadAi(db);
 for(const [owner,date] of [["owner-a","2026-01-31T23:59:59Z"],["owner-a","2026-02-01T00:00:00Z"],["owner-b","2026-02-01T00:00:00Z"]])
  await ai.assertMonthlyQuota(owner,"public",db,new Date(date));
 assert.equal(db.docs.size,3);
 for(const data of db.docs.values()){assert.equal(data.count,1);assert.equal(data.publicCount,1);}
});
for(const invalid of [
 {pergunta:null},{pergunta:123},{pergunta:{}},{pergunta:" "},{pergunta:"x".repeat(801)},
 {historico:null},{historico:{}},{historico:[null]},{historico:[[]]},
 {historico:[{autor:"sistema",texto:"oi"}]},{historico:[{autor:"ia",texto:42}]},
 {historico:[{autor:"ia",texto:" "}]},{historico:[{autor:"ia",texto:"x".repeat(4002)}]},
 {historico:Array.from({length:9},()=>({autor:"ia",texto:"oi"}))}
]) test("invalid payload consumes no monthly quota: "+JSON.stringify(invalid).slice(0,80),async()=>{
 const db=memoryDb(seed()), ai=loadAi(db);
 for(const handler of [ai.askBusinessAI,ai.askPublicBusinessAI])
  await assert.rejects(handler(request(invalid)),e=>e.code==="invalid-argument");
 assert.equal(db.docs.has(quotaPath()),false);assert.equal(ai.calls.length,0);
});
test("existing private/public history contracts stay valid",async()=>{
 const db=memoryDb(seed()), ai=loadAi(db);
 await ai.askBusinessAI(request({historico:[{autor:"dono",texto:"oi"},{autor:"ia",texto:"x".repeat(4000)+"…"}]}));
 await ai.askPublicBusinessAI(request({historico:[{autor:"visitante",texto:"oi"},{autor:"ia",texto:"resposta"}]}));
 assert.equal(ai.calls.length,2);
});
for(const mode of [429,404,500,"network","timeout"]) test("provider "+mode+" retains atomic reservation; retries stay bounded",async()=>{
 const db=memoryDb({...seed(),[quotaPath()]:{count:99,publicCount:99}});
 const ai=loadAi(db,typeof mode==="number"?{status:mode}:{failure:Object.assign(new Error("synthetic"),{name:mode==="timeout"?"AbortError":"Error"})});
 await assert.rejects(ai.askPublicBusinessAI(request()),e=>e.code===(mode===429?"resource-exhausted":"unavailable"));
 await assert.rejects(ai.askPublicBusinessAI(request()),quotaError);
 assert.equal(db.docs.get(quotaPath()).count,100);assert.equal(ai.calls.length,1);
 const healthy=loadAi(db);await healthy.askBusinessAI(request());assert.equal(db.docs.get(quotaPath()).count,101);
});
test("catalog query, builder and final provider text only include active products of resolved tenant",async()=>{
 const products={};
 for(const [name,status] of [["active","ativo"],["draft","rascunho"],["archived","arquivado"],["missing",undefined],["empty",""],["unknown","other"]])
  products["produtos/"+name]={criadoPor:"owner-a",nome:name,preco:1,...(status===undefined?{}:{statusProduto:status})};
 products["produtos/tenant-b"]={criadoPor:"owner-b",nome:"TENANT_B",statusProduto:"ativo"};
 const db=memoryDb({...seed(),...seed("owner-b","loja-b"),...products}), ai=loadAi(db);
 const loaded=await ai.carregarProdutosPublicos("owner-a",db);
 assert.deepEqual(loaded.produtos.map(p=>p.nome),["active"]);
 const normalized=builder.montarContextoNegocioPublico({loja:{},produtos:Object.values(products).filter(p=>p.criadoPor==="owner-a")});
 assert.deepEqual(normalized.produtos.map(p=>p.nome),["active"]);
 await ai.askPublicBusinessAI(request({ownerUid:"owner-b",tenantId:"owner-b",criadoPor:"owner-b"}));
 const text=ai.calls[0].systemInstruction.parts[0].text;
 assert.match(text,/active/);assert.doesNotMatch(text,/draft|archived|missing|empty|unknown|TENANT_B/);
 assert.equal(db.docs.has(quotaPath("owner-b")),false);
 assert.equal(db.docs.get(quotaPath()).count,1);
});

