import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '../../..');
const app = await readFile(resolve(root,'dashboard-app.js'),'utf8');
const renderer = app.slice(app.indexOf('function renderizarCentralImplantacao()'), app.indexOf('window.renderizarCentralImplantacao ='));
const core = (await readFile(resolve(root,'onboarding-state-core.js'),'utf8')).replaceAll('export function','function');
const executive = await readFile(resolve(root,'dashboard-executive-v1.js'),'utf8');
const css = (await Promise.all(['late-overrides.css','dashboard-executive-v1.css'].map(f=>readFile(resolve(root,f),'utf8')))).join('\n');
export async function checkOnboarding(browser) {
    for (const viewport of [{width:1440,height:900},{width:1024,height:768},{width:390,height:844}]) {
        const context = await browser.newContext({viewport});
        try {
            await context.route('**/*',route => route.request().url()==='http://onboarding.invalid/' ? route.fulfill({body:'<!doctype html><html><body><main id="view-dashboard"><div id="primeiros-passos-container">Legado</div></main><section id="view-perfil"></section><button id="btn-abrir-criacao">Novo produto</button></body></html>',contentType:'text/html'}) : route.abort());
            const page=await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
            await page.goto('http://onboarding.invalid/');
            await page.addStyleTag({content:':root{--aura-text-primary:#f5f5f5;--aura-text-secondary:#d1d5db;--aura-border:#666;--aura-primary:#00f2fe;--aura-surface-soft:#16161d;--rd-ease:ease}body{background:#101016;color:#f5f5f5;margin:20px;font-family:Arial}button{font:inherit;cursor:pointer}svg{width:18px}#view-dashboard{max-width:1100px;margin:auto}.hidden{display:none}'+css});
            const bootstrap=core+`
                var usuarioUID='loja1', perfilImplantacaoSalvo={uid:'loja1',dados:{}}, produtosImplantacaoSalvos={uid:'loja1',total:0};
                var ctx={initialized:true,active:true,authUid:'owner',storeUid:'loja1'}, edits=['configuracoes','produtos'];
                window.VideHubContext={getSnapshot:()=>ctx}; var VideHubContext=window.VideHubContext;
                window.__videChaveImplantacao=()=>chavePreferenciaImplantacao(ctx);
                function podeEditarModulo(k){return ctx.active && edits.includes(k)} function podeVerModuloNoContexto(k){return podeEditarModulo(k)}
                function prepararBlocosLayoutEditaveis(){} function obterLinkPublicoValido(){return ''}
                var navegacoes=[], clicks=0;window.ativarAba=id=>{navegacoes.push(id);return true};
                document.querySelector('#btn-abrir-criacao').onclick=()=>clicks++;
            `+renderer+';renderizarCentralImplantacao();';
            await page.addScriptTag({content:bootstrap+executive});
            await page.waitForSelector('.dashboard-launch-toggle');
            assert.equal(await page.locator('.dashboard-launch-task').count(),8);
            assert.equal(await page.locator('.dashboard-launch-score strong').innerText(),'0%');
            assert.equal(await page.locator('.dashboard-launch-primary').getAttribute('data-launch-field'),'perf-nome-loja');
            assert.equal(await page.locator('#primeiros-passos-container').isVisible(),false);
            // Dados digitados não são fonte de conclusão; nem substituem os controles.
            await page.evaluate(()=>{document.querySelector('#view-perfil').innerHTML='<input id="perf-nome-loja" value="Rascunho não salvo">';window.beforeButton=document.querySelector('.dashboard-launch-primary');renderizarCentralImplantacao()});
            assert.equal(await page.evaluate(()=>beforeButton===document.querySelector('.dashboard-launch-primary')),true);
            assert.equal(await page.locator('.dashboard-launch-score strong').innerText(),'0%');
            await page.locator('.dashboard-launch-primary').click();
            await page.waitForFunction(() => document.activeElement?.id === 'perf-nome-loja');
            assert.equal(await page.evaluate(()=>document.activeElement.id),'perf-nome-loja');
            // Todos os destinos de configuração abrem a área e focam seu campo.
            await page.evaluate(()=>{document.querySelector('#view-perfil').innerHTML=['perf-nome-loja','perf-slug','perf-social-whatsapp-central','perf-carrinho-ativo','perf-titulo','perf-social-instagram','perf-cor-destaque'].map(id=>'<input id="'+id+'">').join('');['identidade','redes-sociais','carrinho-config','aparencia-cores'].forEach(id=>{let b=document.createElement('button');b.dataset.settingsStep=id;b.onclick=()=>window.lastArea=id;document.body.append(b)})});
            await page.locator('summary').click();
            for(const field of ['perf-nome-loja','perf-slug','perf-social-whatsapp-central','perf-carrinho-ativo','perf-titulo','perf-social-instagram','perf-cor-destaque']){
                await page.locator('.dashboard-launch-task[data-launch-field="'+field+'"]').click();
                // A ação foca após timers encadeados; aguarda o efeito, não 270 ms de relógio.
                await page.waitForFunction(expected => document.activeElement?.id === expected, field);
                assert.equal(await page.evaluate(()=>document.activeElement.id),field);
            }
            await page.locator('[data-launch-action="novo-produto"]').click();await page.waitForTimeout(220);assert.equal(await page.evaluate(()=>clicks),1);
            await page.evaluate(()=>{perfilImplantacaoSalvo.dados={nomeLoja:'Empresa'};renderizarCentralImplantacao()});
            assert.equal(await page.locator('.dashboard-launch-primary').getAttribute('data-launch-field'),'perf-slug');
            assert.equal(await page.locator('details').getAttribute('open'),'');
            await page.waitForSelector('.dashboard-launch-toggle');await page.locator('.dashboard-launch-toggle').click();
            assert.equal(await page.locator('.dashboard-launch-toggle').getAttribute('aria-expanded'),'false');
            await page.evaluate(()=>{perfilImplantacaoSalvo.dados.urlLoja='empresa';renderizarCentralImplantacao()});
            await page.waitForSelector('.dashboard-launch-toggle');assert.equal(await page.locator('.dashboard-launch-groups').isVisible(),false);
            // Mesmo contexto restaura preferência em componente reconstruído.
            await page.evaluate(()=>{document.querySelector('#dashboard-launch-center').remove();renderizarCentralImplantacao()});await page.waitForSelector('.dashboard-launch-toggle');
            assert.equal(await page.locator('.dashboard-launch-toggle').getAttribute('aria-expanded'),'false');
            // Outro tenant não recebe os dados salvos do anterior nem sua preferência.
            await page.evaluate(()=>{ctx.storeUid='loja2';renderizarCentralImplantacao()});await page.waitForSelector('.dashboard-launch-toggle');
            assert.equal(await page.locator('.dashboard-launch-score strong').innerText(),'0%');
            assert.equal(await page.locator('.dashboard-launch-toggle').getAttribute('aria-expanded'),'true');
            assert.equal(await page.locator('.dashboard-launch-task-action').first().innerText(),'A confirmar');
            await page.evaluate(()=>{ctx.storeUid='loja1';edits=[];renderizarCentralImplantacao()});
            assert.equal(await page.locator('.dashboard-launch-task:not(:disabled)').count(),0);
            assert.equal(await page.locator('.dashboard-launch-primary').count(),0);
            // localStorage indisponível: preferência continua funcionando após rerender.
            await page.evaluate(()=>{ctx.authUid='blocked';edits=['configuracoes','produtos'];Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked')}});renderizarCentralImplantacao()});
            await page.waitForSelector('.dashboard-launch-toggle');await page.locator('.dashboard-launch-toggle').click();
            await page.evaluate(()=>{perfilImplantacaoSalvo.dados.tituloHero='Atualizado';renderizarCentralImplantacao()});await page.waitForSelector('.dashboard-launch-toggle');
            assert.equal(await page.locator('.dashboard-launch-toggle').getAttribute('aria-expanded'),'false');
            await page.locator('.dashboard-launch-toggle').click();
            assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
            await page.waitForTimeout(350);
            assert.equal(await page.locator('.dashboard-launch-task-copy strong').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=14),true);
            if(process.env.ONBOARDING_DIAGNOSTICS_DIR){await mkdir(process.env.ONBOARDING_DIAGNOSTICS_DIR,{recursive:true});await page.locator('#dashboard-launch-center').screenshot({path:resolve(process.env.ONBOARDING_DIAGNOSTICS_DIR,'onboarding-'+viewport.width+'.png')})}
            await page.evaluate(()=>{perfilImplantacaoSalvo.dados={nomeLoja:'Empresa '+ 'nome longo '.repeat(40),urlLoja:'empresa',whatsappCentral:'11999999999',carrinhoAtivo:true,tituloHero:'Título',subtituloHero:'Descrição',instagramUser:'empresa',corDestaque:'#fff',fonteVitrine:'Arial'};produtosImplantacaoSalvos.total=1;renderizarCentralImplantacao()});
            assert.equal(await page.locator('.dashboard-launch-score strong').innerText(),'100%');
            assert.equal(await page.locator('.dashboard-launch-primary').count(),0);
            assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
            assert.equal(await page.locator('#dashboard-launch-center').innerText().then(t=>t.includes('pronta para operar')),false);
            // Reload preserva a preferência salva; migração legada ocorre uma vez.
            await page.reload();
            await page.addStyleTag({content:css});
            await page.addScriptTag({content:bootstrap+executive});
            await page.waitForSelector('.dashboard-launch-toggle');
            assert.equal(await page.locator('.dashboard-launch-toggle').getAttribute('aria-expanded'),'false');
            await page.reload();
            await page.evaluate(()=>{localStorage.removeItem('videDashboardImplantacaoRecolhida_v2_owner_loja1');localStorage.setItem('videDashboardImplantacaoRecolhida_own','true')});
            await page.addStyleTag({content:css});await page.addScriptTag({content:bootstrap+executive});await page.waitForSelector('.dashboard-launch-toggle');
            assert.equal(await page.locator('.dashboard-launch-toggle').getAttribute('aria-expanded'),'false');
            await page.evaluate(()=>{ctx.authUid='outro';renderizarCentralImplantacao()});await page.waitForSelector('.dashboard-launch-toggle');
            assert.equal(await page.locator('.dashboard-launch-toggle').getAttribute('aria-expanded'),'true');
            assert.deepEqual(errors,[]);
            console.log('onboarding PASS '+viewport.width+'x'+viewport.height);
        } finally {await context.close()}
    }
}
if(process.argv[1]===new URL(import.meta.url).pathname.replace(/^\/(\w:)/,'$1').replaceAll('/',process.platform==='win32'?'\\':'/')){
    const browser=await chromium.launch();try{await checkOnboarding(browser)}finally{await browser.close()}
}
