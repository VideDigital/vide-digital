import fs from "node:fs";
import vm from "node:vm";
import {createRequire} from "node:module";
import publicApi from "../../../functions/src/public/index.js";
const require = createRequire(new URL("../../../functions/src/ai/index.js", import.meta.url));
export const builder = require("./promptBuilder");
const {HttpsError} = require("firebase-functions/v2/https");
const {FieldValue} = require("firebase-admin/firestore");
export function memoryDb(seed = {}) {
    const docs = new Map(Object.entries(seed));
    const queries = [];
    let queue = Promise.resolve();
    const snapshot = path => ({exists: docs.has(path), id: path.split("/").at(-1), data: () => structuredClone(docs.get(path))});
    const doc = path => ({path, get: async () => snapshot(path), set: async data => docs.set(path, structuredClone(data))});
    function query(name, filters = [], max = Infinity) {
        return {
            where: (field, op, value) => query(name, [...filters, [field, value]], max),
            limit: n => query(name, filters, n),
            get: async () => {
                queries.push({name, filters});
                return {docs: [...docs.entries()].filter(([path, data]) => path.startsWith(name + "/") &&
                    filters.every(([field,value]) => data[field] === value)).slice(0,max).map(([path]) => snapshot(path))};
            }
        };
    }
    return {docs, queries, doc, collection: name => query(name),
        runTransaction(fn) {
            const pending = queue.then(() => fn({
                get: async ref => snapshot(ref.path),
                set: (ref, data) => docs.set(ref.path, {...docs.get(ref.path), ...data})
            }));
            queue = pending.catch(() => {});
            return pending;
        }};
}
export function seed(owner = "owner-a", slug = "loja-a") {
    return {
        [`usuarios/${owner}`]: {status:"aprovado",plano:"pro",iaNegocioPublicaAtiva:true,nomeLoja:slug},
        [`vitrines_publicas/${slug}`]: {donoUID:owner}
    };
}
// Executes the real handler source; only infrastructure and external transport are substituted.
// Public tenant resolution is the real implementation with injected reads, never payload owner.
export function loadAi(db, {status=200, failure, transport, providerOptions={}, ownerUid="owner-a"} = {}) {
    const calls = [];
    const logs = [];
    const module = {exports:{}};
    const deps = {
        "firebase-functions/v2/https": {HttpsError,onCall:(options,handler)=>Object.assign(handler,{options})},
        "firebase-functions/params": {defineSecret:()=>({value:()=>"synthetic-test-key"})},
        "firebase-admin/firestore": {getFirestore:()=>db,FieldValue},
        "firebase-functions": {logger:Object.fromEntries(["error","warn","info"].map(level=>[level,(...args)=>logs.push({level,args})]))},
        "../shared/context": {resolveCallerContext:async()=>({ownerUid,owner:{plano:"pro"}}),requireEdit(){}},
        "../shared/rateLimit": {assertPublicRateLimit:async()=>{}},
        "../public": {publicOptions:publicApi.publicOptions,resolvePublicTenant:data=>publicApi.resolvePublicTenant(data,path=>db.doc(path).get())},
        "./promptBuilder":builder,
        "./provider":{...require("./provider"),createProvider: options=>require("./provider").createProvider({...options,...providerOptions})}
    };
    const globals={
        module,require:id=>{if(!(id in deps))throw new Error("Unexpected dependency: "+id);return deps[id];},
        fetch:async(url,options)=>{calls.push(JSON.parse(options.body));if(transport)return transport(url,options,calls.length);if(failure)throw failure;
            return {ok:status===200,status,json:async()=>({candidates:[{content:{parts:[{text:"Resposta sintética"}]}}]})};},
        Date,Set,encodeURIComponent
    };
    vm.compileFunction(fs.readFileSync(new URL("../../../functions/src/ai/index.js",import.meta.url),"utf8"),Object.keys(globals))(...Object.values(globals));
    return {...module.exports,calls,logs};
}
export const request = (data={}) => ({data:{pergunta:"Produtos?",storeSlug:"loja-a",...data}});
export const quotaPath = (owner="owner-a", date=new Date()) =>
    `ia_negocio_uso/${owner}_${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,"0")}`;
export const quotaError = error => error.code === "resource-exhausted";

