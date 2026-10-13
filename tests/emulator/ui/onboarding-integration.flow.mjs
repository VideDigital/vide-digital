import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { launchBrowser, loginReal, startStaticServer, coletarErrosConsole, ehErroDeRedeExterno } from './_helpers.mjs';

async function dashboard(page, baseUrl, email='owner.pro@local.test', senha='Local123!pro') {
    await loginReal(page, baseUrl, {email,senha});
    await page.waitForFunction(()=>window.__videSlugAtualSalvo?.()==='loja-pro-local');
    await page.waitForFunction(()=>!document.querySelector('#produtos-container .aura-skel-card'));
    await page.evaluate(()=>window.ativarAba('view-dashboard'));
    await page.locator('.dashboard-launch-toggle').waitFor({state:'visible'});
    if(await page.locator('.dashboard-launch-toggle').getAttribute('aria-expanded')==='false') await page.locator('.dashboard-launch-toggle').click();
}

async function focusSnapshot(page) {
    return page.evaluate(()=>{
        const e=document.activeElement,s=getComputedStyle(e),r=e.getBoundingClientRect();
        const luminance=color=>{
            const rgb=color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)?.slice(1).map(Number);
            if(!rgb)return null;
            const linear=rgb.map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4});
            return linear[0]*0.2126+linear[1]*0.7152+linear[2]*0.0722;
        };
        const outer=luminance(s.outlineColor),inner=luminance(s.boxShadow);
        const contrast=outer===null||inner===null?0:(Math.max(outer,inner)+0.05)/(Math.min(outer,inner)+0.05);
        const clipping=[];
        for(let a=e.parentElement;a;a=a.parentElement){
            const cs=getComputedStyle(a),b=a.getBoundingClientRect();
            if(/hidden|clip|auto|scroll/.test(cs.overflow+cs.overflowX+cs.overflowY) &&
               (r.left<b.left-1||r.right>b.right+1||r.top<b.top-1||r.bottom>b.bottom+1)) clipping.push(a.id||a.tagName);
        }
        return {label:e.querySelector('strong')?.textContent||e.textContent.trim(),tag:e.tagName,
            focusVisible:e.matches(':focus-visible'),style:s.outlineStyle,width:parseFloat(s.outlineWidth),offset:parseFloat(s.outlineOffset),
            color:s.outlineColor,shadow:s.boxShadow,contrast,variable:s.getPropertyValue('--aura-text-primary'),clipping};
    });
}

async function checkActionsAndEditor(browser,baseUrl) {
    if(!getApps().length)initializeApp({projectId:'demo-vide-hub'});
    const db=getFirestore(),owner=db.doc('usuarios/owner-pro'),saved=await owner.get();
    assert.ok(saved.exists,'fixture owner deve existir');
    const context=await browser.newContext({viewport:{width:1024,height:768}}),page=await context.newPage();
    try {
        await dashboard(page,baseUrl);
        const links=await page.evaluate(()=>['link-minha-loja','link-minha-loja-cockpit'].map(id=>({id,href:document.getElementById(id).getAttribute('href')})));
        await page.evaluate(()=>{window.__opened102d=[];window.open=(...args)=>{window.__opened102d.push(args);return null}});
        await page.locator('#dashboard-launch-center [data-launch-action="abrir-loja"]').click();
        const opened=await page.evaluate(()=>window.__opened102d);
        assert.equal(opened.length,1);assert.equal(new URL(opened[0][0]).searchParams.get('loja'),'loja-pro-local');
        assert.equal(new URL(opened[0][0]).origin,new URL(baseUrl).origin);
        assert.deepEqual(opened[0].slice(1),['_blank','noopener,noreferrer']);
        for(const invalid of ['','#','javascript:void(0)','http://[']){
            await page.evaluate(value=>{window.__opened102d=[];for(const id of ['link-minha-loja','link-minha-loja-cockpit'])document.getElementById(id).setAttribute('href',value)},invalid);
            await page.locator('#dashboard-launch-center [data-launch-action="abrir-loja"]').click();
            assert.deepEqual(await page.evaluate(()=>window.__opened102d),[],`URL inválida ${invalid} não abre destino`);
        }
        await page.evaluate(values=>values.forEach(({id,href})=>document.getElementById(id).setAttribute('href',href)),links);
        await page.locator('#btn-editar-layout').click();
        assert.equal(await page.locator('#btn-salvar-layout').isVisible(),true);
        assert.equal(await page.locator('#btn-restaurar-layout').isVisible(),true);
        assert.ok(await page.locator('#view-dashboard .layout-block[draggable="true"]').count()>0);
        await page.locator('#btn-salvar-layout').click();
        await page.waitForFunction(()=>document.querySelector('#btn-salvar-layout').classList.contains('hidden'));
        assert.ok(Array.isArray((await owner.get()).data().layoutPorAba['view-dashboard']),'save real no Emulator');
        await page.locator('#btn-editar-layout').click();
        await page.locator('#btn-restaurar-layout').click();
        await page.locator('#confirm-modal').waitFor({state:'visible'});
        const reloaded=page.waitForNavigation();
        await page.locator('#confirm-modal-ok').click();
        await reloaded;
        await page.waitForFunction(()=>window.__videSlugAtualSalvo?.()==='loja-pro-local');
        assert.equal((await owner.get()).data().layoutPorAba?.['view-dashboard'],undefined,'restauração real no Emulator');
        await page.evaluate(()=>window.ativarAba('view-pedidos'));
        assert.equal(await page.locator('#barra-editor-layout').evaluate(e=>e.parentElement.id==='view-dashboard'),false,'outras abas mantêm barra fora do dashboard');
        await page.evaluate(()=>window.ativarAba('view-produtos'));
        assert.equal(await page.locator('#barra-editor-layout').isVisible(),false,'aba sem editor mantém gate');
    }finally{await context.close();await owner.set(saved.data())}
    assert.deepEqual((await owner.get()).data(),saved.data(),'fixture owner restaurada exatamente');
    for(const [email,senha,productPermission] of [['employee.edit@local.test','Local123!edit',true],['employee.read@local.test','Local123!read',false]]){
        const ctx=await browser.newContext({viewport:{width:1024,height:768}}),p=await ctx.newPage();
        try{
            await dashboard(p,baseUrl,email,senha);
            const tasks=p.locator('.dashboard-launch-task');
            assert.equal(await tasks.count(),8);
            assert.equal(await p.locator('.dashboard-launch-task[data-launch-action="novo-produto"]').isEnabled(),productPermission);
            assert.equal(await p.locator('.dashboard-launch-task[data-launch-field="perf-nome-loja"]').isEnabled(),false,'editor sem configurações não contorna permissão');
            if(!productPermission){
                assert.equal(await p.locator('.dashboard-launch-task:enabled').count(),0);
                assert.equal(await p.locator('.dashboard-launch-primary').count(),0);
                assert.equal(await p.locator('#dashboard-launch-center [data-launch-action="abrir-loja"]').isEnabled(),false);
            }else{
                await p.locator('.dashboard-launch-task[data-launch-action="novo-produto"]').click();
                await p.locator('#produto-modal').waitFor({state:'visible'});
            }
            assert.equal(await p.evaluate(()=>window.VideHubContext.getSnapshot().storeUid),'owner-pro');
        }finally{await ctx.close()}
    }
    console.log('onboarding.actions: PASS — URLs válidas/inválidas, save/restore Emulator e editor/reader sem bypass');
}

export async function checkOnboardingIntegration(browser,baseUrl) {
    assert.ok(process.env.FIRESTORE_EMULATOR_HOST,'integração exige Emulator');
    const issues=[], evidence=[];
    for(const viewport of [{width:1440,height:900},{width:1024,height:768},{width:390,height:844}]){
        const context=await browser.newContext({viewport});
        const page=await context.newPage(),errors=coletarErrosConsole(page);
        try {
            await dashboard(page,baseUrl);
            assert.equal(await page.locator('.dashboard-launch-task').count(),8);
            assert.equal(await page.locator('.dashboard-launch-group').count(),3);
            for(const light of [false,true]){
                await page.evaluate(value=>document.body.classList.toggle('tema-claro',value),light);
                const summary=page.locator('#dashboard-launch-center summary');
                if(await page.locator('#dashboard-launch-center details').getAttribute('open')!==null) await summary.click();
                // Tab/Shift+Tab reais; focus() só estabelece o início da sequência.
                await page.locator('.dashboard-launch-toggle').focus();
                await page.keyboard.press('Tab');
                await page.keyboard.press('Shift+Tab');
                const focused=[];
                for(let i=0;i<20;i++){
                    const inside=await page.evaluate(()=>document.querySelector('#dashboard-launch-center').contains(document.activeElement));
                    if(!inside) break;
                    const snap=await focusSnapshot(page);focused.push(snap);
                    if(!snap.focusVisible||snap.style!=='solid'||snap.width<3||snap.offset>-3||!snap.shadow.includes('inset')||snap.contrast<3||snap.clipping.length)
                        issues.push(`${viewport.width}/${light?'claro':'escuro'} foco ${snap.label}: ${JSON.stringify(snap)}`);
                    if(snap.tag==='SUMMARY') await page.keyboard.press('Enter');
                    await page.keyboard.press('Tab');
                }
                assert.equal(focused.filter(e=>e.tag==='SUMMARY').length,1,'grupo opcional na ordem de foco');
                assert.equal(focused.length,12,'toggle, oito tarefas, summary e dois CTAs');
                evidence.push({viewport,theme:light?'claro':'escuro',focused});
            }
            await page.evaluate(()=>document.body.classList.remove('tema-claro'));
            if(viewport.width>=768){
                assert.equal(await page.locator('#btn-editar-layout').isVisible(),true);
                const buttons=await page.locator('#dashboard-launch-center button').all();
                for(const button of buttons){
                    if(!await button.isVisible())continue;
                    await button.evaluate(e=>e.scrollIntoView({block:'end'}));
                    const overlap=await button.evaluate(e=>{
                        const a=e.getBoundingClientRect(),b=document.querySelector('#barra-editor-layout').getBoundingClientRect();
                        return Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
                    });
                    if(overlap>0) issues.push(`${viewport.width} toolbar cobre ${await button.textContent()}: ${overlap}px²`);
                }
                const toolbar=await page.locator('#barra-editor-layout').evaluate(e=>({parent:e.parentElement.id,position:getComputedStyle(e).position}));
                evidence.push({viewport,toolbar});
            }else{
                assert.equal(await page.locator('#barra-editor-layout').isVisible(),false,'política mobile existente preservada');
            }
            assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
            if(process.env.ONBOARDING_INTEGRATION_DIAGNOSTICS_DIR){
                await mkdir(process.env.ONBOARDING_INTEGRATION_DIAGNOSTICS_DIR,{recursive:true});
                await page.locator('.dashboard-launch-toggle').focus();await page.keyboard.press('Tab');
                await page.screenshot({path:resolve(process.env.ONBOARDING_INTEGRATION_DIAGNOSTICS_DIR,`onboarding-${viewport.width}.png`)});
            }
            assert.deepEqual(errors.filter(e=>!ehErroDeRedeExterno(e)),[]);
        }finally{await context.close()}
    }
    if(process.env.ONBOARDING_INTEGRATION_DIAGNOSTICS_DIR) await writeFile(resolve(process.env.ONBOARDING_INTEGRATION_DIAGNOSTICS_DIR,'geometry-focus.json'),JSON.stringify({evidence,issues},null,2));
    assert.deepEqual(issues,[],'foco e geometria do dashboard completo');
    await checkActionsAndEditor(browser,baseUrl);
    console.log('onboarding.integration: PASS — foco real nos dois temas e três resoluções, geometria sem sobreposição');
}

if(process.argv[1]===new URL(import.meta.url).pathname.replace(/^\/(\w:)/,'$1').replaceAll('/',process.platform==='win32'?'\\':'/')){
    const {baseUrl,close}=await startStaticServer();const browser=await launchBrowser();
    try{await checkOnboardingIntegration(browser,baseUrl)}finally{await browser.close();await close()}
}
