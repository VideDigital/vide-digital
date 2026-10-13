import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import { collectHttpDiagnostics, sanitizeHttpLocation } from './http-diagnostics.mjs';
import { coletarErrosConsole, launchBrowser } from './_helpers.mjs';

export async function validateHttpDiagnostics(browser) {
    const canary='SYNTHETIC_PRIVATE_CANARY_102F',received=[];
    const server=createServer((req,res)=>{
        const status=Number(new URL(req.url,'http://localhost').pathname.split('/')[2]);
        if([200,400,403,500].includes(status)){
            let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{
                received.push({status,body,authorization:req.headers.authorization});
                res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify({status}));
            });return;
        }
        res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Controlled HTTP diagnostics</title>');
    });
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const baseUrl=`http://127.0.0.1:${server.address().port}`,context=await browser.newContext(),page=await context.newPage();
    const errors=coletarErrosConsole(page),collector=collectHttpDiagnostics(page,{baseUrl});
    try{
        collector.mark('login');await page.goto(baseUrl);
        const replies=await page.evaluate(async ({canary})=>{
            const result=[];
            for(const status of [200,400,403,500]){
                const response=await fetch(`/status/${status}/${canary}?token=${canary}&api_key=${canary}`,{method:'POST',headers:{Authorization:'Bearer '+canary},body:canary});
                result.push({status:response.status,body:await response.json()});
            }return result;
        },{canary});
        assert.deepEqual(replies,[200,400,403,500].map(status=>({status,body:{status}})),'coletor não altera resultado HTTP');
        assert.ok(received.every(e=>e.body===canary&&e.authorization==='Bearer '+canary),'coletor não altera request');
        collector.mark('template-submit');
        await page.route(baseUrl+'/transport',route=>route.abort('failed'));
        const failure=page.waitForEvent('requestfailed');
        await page.evaluate(()=>fetch('/transport').catch(()=>null));await failure;
        const pageError=page.waitForEvent('pageerror');
        await page.addScriptTag({content:`setTimeout(()=>{throw new Error('${canary}')},0)`});await pageError;
        const evidence=collector.snapshot();
        assert.deepEqual(evidence.events.filter(e=>e.event==='response').map(e=>e.status),[400,403,500]);
        assert.ok(evidence.successfulResponses>=2,'HTTP 200 não vira falha');
        assert.ok(evidence.events.filter(e=>e.event==='response').every(e=>e.method==='POST'&&e.resourceType==='fetch'&&e.origin==='local-application'&&e.step==='login'&&Number.isInteger(e.relativeMs)&&e.requestId>0));
        assert.ok(evidence.events.some(e=>e.event==='requestfailed'&&e.transport==='net::ERR_FAILED'&&e.step==='template-submit'));
        assert.ok(evidence.events.some(e=>e.event==='pageerror'));
        assert.ok(evidence.events.some(e=>e.event==='console-error'));
        assert.equal(JSON.stringify(evidence).includes(canary),false,'query/path/mensagem/header/body sensíveis não exportados');
        assert.throws(()=>assert.deepEqual(errors,[]),'erros inesperados continuam reprovando a assertion original');
    }finally{collector.dispose();await context.close();await new Promise(r=>server.close(r))}

    for(const url of [
        `http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${canary}`,
        `http://localhost:8080/v1/projects/${canary}/databases/${canary}/documents/users/${canary}`,
        `http://localhost:5001/${canary}/southamerica-east1/reportFrontendError?token=${canary}`,
        `https://${canary}.example/${canary}?key=${canary}#${canary}`,
        `https://${canary}:${canary}@fonts.googleapis.com/css2?family=${canary}`
    ])assert.equal(JSON.stringify(sanitizeHttpLocation(url,baseUrl)).includes(canary),false);
    assert.equal(sanitizeHttpLocation('http://localhost:9099/v1/accounts:lookup',baseUrl).origin,'auth-emulator');
    assert.equal(sanitizeHttpLocation('http://localhost:8080/google.firestore.v1.Firestore/Listen/channel',baseUrl).origin,'firestore-emulator');
    assert.equal(sanitizeHttpLocation('http://localhost:5001/secret/southamerica-east1/reportFrontendError',baseUrl).origin,'functions-emulator');

    const fakePage=new EventEmitter(),bounded=collectHttpDiagnostics(fakePage,{baseUrl});
    const request={method:()=> 'POST',resourceType:()=> 'xhr',url:()=>`${baseUrl}/${canary}?key=${canary}`,
        headers(){throw Error('headers não podem ser lidos')},postData(){throw Error('body não pode ser lido')}};
    for(let i=0;i<300;i++)fakePage.emit('response',{status:()=>400,request:()=>request});
    const boundedEvidence=bounded.snapshot();
    assert.equal(boundedEvidence.events.length,128);assert.equal(boundedEvidence.droppedEvents,172);
    assert.ok(Buffer.byteLength(JSON.stringify(boundedEvidence,null,2))<65536);
    assert.equal(JSON.stringify(boundedEvidence).includes(canary),false);
    assert.throws(()=>bounded.mark(canary),/Etapa de diagnóstico não permitida/);
    bounded.dispose();assert.equal(fakePage.listenerCount('response'),0);
    console.log('http-diagnostics.validation: PASS — HTTP 200/400/403/500, transporte, JS, sanitização, limites e assertions');
}

if(process.argv[1]===new URL(import.meta.url).pathname.replace(/^\/(\w:)/,'$1').replaceAll('/',process.platform==='win32'?'\\':'/')){
    const browser=await launchBrowser();try{await validateHttpDiagnostics(browser)}finally{await browser.close()}
}
