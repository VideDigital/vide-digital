// Diagnóstico opt-in de testes: somente metadados aprovados, nunca payloads.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const STAGES = new Set(['browser-initialized','login','atendimento-open','conversation-selection','conversation-reply','conversation-status','template-apply','template-management','template-form','template-submit','list-updated','persistence-confirmed','final-assertion','test-failure']);
const METHODS = new Set(['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS']);
const RESOURCES = new Set(['document','stylesheet','image','media','font','script','xhr','fetch','websocket','other']);
const HOSTS = new Set(['fonts.googleapis.com','fonts.gstatic.com','www.gstatic.com','cdn.tailwindcss.com','cdn.jsdelivr.net','identitytoolkit.googleapis.com','securetoken.googleapis.com','firestore.googleapis.com']);
const FILES = new Set(['/login.html','/dashboard.html','/firebase-init.js','/dashboard-app.js','/dashboard-executive-v1.js','/dashboard-executive-v1.css','/atendimento.js','/atendimento.css','/templates-atendimento.js','/core/vide-context.js','/favicon.ico']);
const AUTH = new Set(['signInWithPassword','lookup','signUp','update','signOut']);
const TRANSPORT = ['net::ERR_ABORTED','net::ERR_FAILED','net::ERR_CONNECTION_RESET','net::ERR_CONNECTION_REFUSED','net::ERR_NAME_NOT_RESOLVED','net::ERR_TIMED_OUT','net::ERR_CERT_AUTHORITY_INVALID'];

export function sanitizeHttpLocation(value, baseUrl) {
    try {
        const u=new URL(value),base=new URL(baseUrl);
        const local=['localhost','127.0.0.1','[::1]'].includes(u.hostname);
        let origin='external',source=HOSTS.has(u.hostname)?u.hostname:'redacted',path='/:redacted';
        if(!['http:','https:'].includes(u.protocol)) return {origin:'other',source:'redacted',path:'/:redacted'};
        if(local){
            source='loopback';
            origin=u.port==='9099'?'auth-emulator':u.port==='8080'?'firestore-emulator':u.port==='5001'?'functions-emulator':u.origin===base.origin?'local-application':'other-local';
        }
        const account=u.pathname.match(/^\/(?:identitytoolkit\.googleapis\.com\/)?v1\/accounts:([A-Za-z]+)$/);
        if(account&&AUTH.has(account[1]))path='/v1/accounts:'+account[1];
        else if(/^\/(?:securetoken\.googleapis\.com\/)?v1\/token$/.test(u.pathname))path='/v1/token';
        else if(['/google.firestore.v1.Firestore/Listen/channel','/google.firestore.v1.Firestore/Write/channel','/css2','/css'].includes(u.pathname))path=u.pathname;
        else if(/^\/v1\/projects\/[^/]+\/databases\/[^/]+\/documents(?:\/.*)?$/.test(u.pathname))path='/v1/projects/:project/databases/:database/documents/:document';
        else if(origin==='functions-emulator'&&/^\/[^/]+\/southamerica-east1\/reportFrontendError$/.test(u.pathname))path='/:project/southamerica-east1/reportFrontendError';
        else if(source==='fonts.gstatic.com'&&u.pathname.startsWith('/s/'))path='/s/:font/:version/:asset';
        else if(source==='www.gstatic.com'&&u.pathname.startsWith('/firebasejs/'))path='/firebasejs/:version/:asset';
        else if(origin==='local-application'&&FILES.has(u.pathname))path=u.pathname;
        return {origin,source,path}; // Nunca retorna query, fragment, userinfo ou host arbitrário.
    } catch { return {origin:'other',source:'redacted',path:'/:redacted'}; }
}

export function collectHttpDiagnostics(page,{baseUrl}) {
    const started=performance.now(),events=[],milestones=[],ids=new WeakMap();
    let step='browser-initialized',nextId=0,droppedEvents=0,successfulResponses=0;
    const now=()=>Math.round(performance.now()-started);
    const id=request=>{if(!ids.has(request))ids.set(request,++nextId);return ids.get(request)};
    const add=data=>{if(events.length<128)events.push({relativeMs:now(),step,...data});else droppedEvents++};
    const requestData=request=>({requestId:id(request),method:METHODS.has(request.method())?request.method():'other',resourceType:RESOURCES.has(request.resourceType())?request.resourceType():'other',...sanitizeHttpLocation(request.url(),baseUrl)});
    const response=r=>{if(r.status()>=400)add({event:'response',status:r.status(),...requestData(r.request())});else if(r.status()>=200&&r.status()<300)successfulResponses=Math.min(100000,successfulResponses+1)};
    const failed=r=>{const text=r.failure()?.errorText||'';add({event:'requestfailed',transport:TRANSPORT.find(code=>text.startsWith(code))||'other',...requestData(r)})};
    const consoleError=msg=>{if(msg.type()==='error')add({event:'console-error',...sanitizeHttpLocation(msg.location()?.url,baseUrl)})};
    const pageError=()=>add({event:'pageerror'}); // Não lê mensagem/stack, que podem conter dados.
    page.on('response',response);page.on('requestfailed',failed);page.on('console',consoleError);page.on('pageerror',pageError);
    const api={
        mark(value){if(!STAGES.has(value))throw new Error('Etapa de diagnóstico não permitida');step=value;if(milestones.length<32)milestones.push({relativeMs:now(),step})},
        snapshot(){return {schemaVersion:1,successfulResponses,droppedEvents,events:events.map(e=>({...e})),milestones:milestones.map(e=>({...e}))}},
        async save(directory){
            const json=JSON.stringify(api.snapshot(),null,2);
            if(Buffer.byteLength(json)>65536)throw new Error('Diagnóstico excedeu limite de 64 KiB');
            await mkdir(directory,{recursive:true});
            const name=`atendimento-templates-http-${Date.now()}.json`;
            await writeFile(join(directory,name),json,'utf8');return name;
        },
        dispose(){page.off('response',response);page.off('requestfailed',failed);page.off('console',consoleError);page.off('pageerror',pageError)}
    };
    api.mark('browser-initialized');return api;
}
