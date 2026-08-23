// B1 (fila de hardening das escritas públicas): leads públicos de Landing
// Page migraram de escrita direta no Firestore (setDoc) para createPublicLead
// (Cloud Function, tenant resolvido no servidor) em três lugares — o handler
// principal (lp-forms-v5.js / AuraFormsV5) e o fallback legado inline
// (enviarFormularioLP em index.html). lp-public-v4.js também foi migrado,
// mas não está conectado a nenhuma página pública hoje (ver
// docs/STUDIO_BLOCK_REGISTRY.md), então não tem um caminho de UI real pra
// testar aqui — coberto só pelos testes unitários de leadPayload.
//
// Este teste atravessa o caminho REAL de formulário pros dois writers
// conectados: markup real (mesmo HTML que index.html/renderizarBloco()
// produz pro bloco "formulario_captura"), JS real (lp-forms-v5.js e
// enviarFormularioLP sem nenhum mock), Firestore Emulator real
// (loadPageMeta() lê landing_pages_publicas de verdade) e Functions
// Emulator real (createPublicLead roda de verdade, grava em leads/{id}).
//
// Limitação documentada: index.html só renderiza automaticamente uma LP
// pública quando window.location.hostname === "videdigital.github.io"
// (rota fixa do domínio do GitHub Pages) — mecanismo pré-existente, não
// relacionado a este B1. Não há como reproduzir isso com segurança num
// host de teste local: forjar o hostname enganaria também
// shouldUseVideEmulators() (que exige localhost/127.0.0.1/::1), apontando
// o SDK pro Firebase de produção real dentro de um teste — inaceitável.
// Por isso o teste navega com ?p=<lojaSlug>/<paginaSlug> (mesma técnica que
// o 404.html real do GitHub Pages usa) pra deixar window.location.pathname
// correto — o que faz lp-forms-v5.js resolver a rota certa sozinho — e
// injeta o form real diretamente em #lp-container, no lugar de depender da
// rota de domínio fixo do index.html (que hoje mostra "página não
// encontrada" em qualquer host que não seja videdigital.github.io). Tudo
// que roda a partir da injeção do form é código real, não mockado.
import assert from "node:assert/strict";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp as initializeClientApp } from "firebase/app";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import {
    captureDiagnostics,
    coletarErrosConsole,
    ehErroDeRedeExterno,
    launchBrowser,
    startStaticServer
} from "./_helpers.mjs";

const PROJECT_ID = "demo-vide-hub";
const STORE_UID = "owner-pro";
const LOJA_SLUG = "loja-pro-local";
const SUFIXO_TESTE = Date.now();
const PAGINA_SLUG = `lp-leads-qa-${SUFIXO_TESTE}`;
const PUBLIC_PAGE_ID = `${LOJA_SLUG}__${PAGINA_SLUG}`.toLowerCase();

function adminDb() {
    if (!getApps().length) {
        initializeApp({ projectId: PROJECT_ID });
    }
    return getFirestore();
}

function markupFormularioCaptura() {
    // Mesmo HTML que index.html/renderizarBloco() produz pro bloco
    // "formulario_captura" — inputs só com placeholder, sem name/id (é
    // esse o único bloco de captura conectado a uma página pública real
    // hoje). Reproduzido aqui literalmente, não reinventado.
    return `
        <div class="max-w-md mx-auto px-6 text-left">
            <h2 class="text-2xl font-bold mb-6">Fale com a gente</h2>
            <form class="space-y-3 text-left" onsubmit="return enviarFormularioLP(event)">
                <input type="text" placeholder="nome" class="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white">
                <input type="tel" inputmode="numeric" maxlength="11" placeholder="whatsapp" oninput="this.value=this.value.replace(/[^0-9]/g,'').slice(0,11)" class="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white">
                <input type="text" placeholder="email" class="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white">
                <button type="submit" class="w-full font-bold py-3 rounded-xl bg-white text-black">Enviar</button>
            </form>
        </div>
    `;
}

async function seedLandingPage() {
    const db = adminDb();
    await db.collection("landing_pages_publicas").doc(PUBLIC_PAGE_ID).set({
        donoUID: STORE_UID,
        titulo: "LP QA Leads",
        publicado: true
    });
}

async function abrirComFormularioInjetado(page, baseUrl) {
    await page.goto(
        `${baseUrl}/index.html?p=${LOJA_SLUG}/${PAGINA_SLUG}&useEmulator=true`,
        { waitUntil: "load", timeout: 30000 }
    );
    await page.waitForSelector("#lp-container", { state: "attached", timeout: 20000 });

    // A IIFE assíncrona de index.html (import de firebase-init.js/firestore/
    // auth/functions, depois a decisão de rota) ainda pode estar em
    // andamento quando "load" dispara — "load" não espera por promises que
    // um script já em execução está aguardando. Em qualquer host que não
    // seja videdigital.github.io (ver comentário no topo do arquivo), 2
    // segmentos sempre caem no branch `else { mostrarErro() }`, que
    // sobrescreve #lp-container com este texto exato. Espera por ele antes
    // de injetar o form real — senão a IIFE pode terminar DEPOIS da
    // injeção e apagar o form que acabou de ser inserido (achado real:
    // caminho de fallback, com lp-forms-v5.js bloqueado, não tem nenhum
    // outro sinal confiável de "a IIFE terminou").
    await page.waitForFunction(
        () => (document.getElementById("lp-container")?.textContent || "").includes("Pagina nao encontrada"),
        undefined,
        { timeout: 20000 }
    );

    // window.lpPublicPageIdAtual normalmente é setado por
    // renderizarLandingPage() (index.html) — como o teste pula a rota de
    // domínio fixo (ver comentário no topo do arquivo), replica aqui o
    // mesmo valor que ela teria calculado, exatamente do mesmo jeito
    // (lojaSlug.toLowerCase() + "__" + paginaSlug.toLowerCase()).
    await page.evaluate(({ lojaSlug, paginaSlug }) => {
        window.lpPublicPageIdAtual = `${lojaSlug}__${paginaSlug}`.toLowerCase();
    }, { lojaSlug: LOJA_SLUG, paginaSlug: PAGINA_SLUG });
}

async function injetarFormulario(page) {
    await page.evaluate((html) => {
        document.getElementById("lp-container").innerHTML = html;
    }, markupFormularioCaptura());
    await page.waitForSelector("#lp-container form", { state: "visible", timeout: 10000 });
}

async function preencherEEnviar(page, sufixo) {
    const nome = `Lead LP QA ${sufixo}`;
    const whatsapp = "11988887777";
    const email = `lead.lp.qa.${sufixo}.${SUFIXO_TESTE}@local.test`.toLowerCase();

    await page.fill('#lp-container form input[placeholder="nome"]', nome);
    await page.fill('#lp-container form input[placeholder="whatsapp"]', whatsapp);
    await page.fill('#lp-container form input[placeholder="email"]', email);
    await page.click('#lp-container form button[type="submit"]');

    return { nome, whatsapp, email };
}

async function testarCaminhoPrimarioAuraFormsV5(browser, baseUrl, db) {
    const contexto = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await contexto.newPage();
    const erros = coletarErrosConsole(page);

    try {
        await abrirComFormularioInjetado(page, baseUrl);

        // AuraFormsV5 precisa terminar de carregar (módulo assíncrono,
        // ver final de index.html) antes de injetar o form — senão o
        // MutationObserver que chama enhanceForm() ainda não existe.
        await page.waitForFunction(
            () => typeof window.AuraFormsV5 === "object",
            undefined,
            { timeout: 20000 }
        );

        await injetarFormulario(page);

        // Confirma que é REALMENTE o AuraFormsV5 quem vai tratar o
        // submit (enhanceForm() marca o form assim que o
        // MutationObserver/scanForms passa por ele) — não o fallback
        // onsubmit inline.
        await page.waitForFunction(
            () => document.querySelector("#lp-container form")?.dataset.auraFormsV5 === "ready",
            undefined,
            { timeout: 10000 }
        );

        // Anti-spam real de lp-forms-v5.js: exige >= 1200ms entre
        // enhanceForm() (auraStartedAt) e o submit. Não é uma espera pra
        // mascarar timing frágil — é a regra de negócio real que o teste
        // precisa satisfazer pra não ser tratado como bot.
        await page.waitForTimeout(1300);

        const dados = await preencherEEnviar(page, "primario");

        await page.waitForFunction(
            () => {
                const status = document.querySelector("[data-aura-form-status]");
                return !!status && /sucesso/i.test(status.textContent || "");
            },
            undefined,
            { timeout: 15000 }
        );

        const leadsSnap = await db.collection("leads").where("email", "==", dados.email).get();
        assert.equal(leadsSnap.size, 1, "AuraFormsV5 deveria criar exatamente um lead via createPublicLead");
        const lead = leadsSnap.docs[0].data();
        assert.equal(lead.criadoPor, STORE_UID, "Lead deveria herdar o dono real da Landing Page, resolvido no servidor (nunca do cliente)");
        assert.equal(lead.tenantId, STORE_UID);
        assert.equal(lead.nome, dados.nome, "Campo nome deveria ser preservado");
        assert.equal(lead.whatsapp, "5511988887777", "WhatsApp deveria ser normalizado com DDI, igual ao contrato de createPublicLead");
        assert.equal(lead.email, dados.email);
        assert.equal(lead.paginaOrigem, PAGINA_SLUG, "paginaOrigem deveria ser preservado");
        assert.equal(lead.lojaOrigem, LOJA_SLUG, "lojaOrigem deveria ser preservado");
        assert.equal(lead.status, "novo");
        assert.equal(lead.statusLead, "novo");
        assert.equal(lead.canal, "loja_publica");
        assert.equal(lead.origem, "Landing Page", "origem default deveria ser preservada quando não há UTM");

        console.log("landing-page-leads.flow: caminho primário (AuraFormsV5) OK.");
    } catch (erro) {
        await captureDiagnostics(page, "landing-page-leads-primario", coletarErrosConsole(page)).catch(() => {});
        throw erro;
    } finally {
        const errosReais = erros.filter((msg) => !ehErroDeRedeExterno(msg));
        assert.deepEqual(errosReais, [], `Caminho primário: não deveria emitir console.error inesperado: ${errosReais.join("\n")}`);
        await contexto.close();
    }
}

async function testarCaminhoFallbackEnviarFormularioLP(browser, baseUrl, db) {
    const contexto = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await contexto.newPage();
    const erros = coletarErrosConsole(page);

    try {
        // Bloqueia lp-forms-v5.js deliberadamente pra forçar o cenário de
        // fallback de forma determinística — não depende de vencer (ou
        // perder) a corrida real de carregamento do módulo, que seria
        // timing-frágil.
        await page.route("**/lp-forms-v5.js*", (route) => route.abort());

        await abrirComFormularioInjetado(page, baseUrl);
        await injetarFormulario(page);

        // Sem lp-forms-v5.js, o form nunca ganha o dataset auraFormsV5 —
        // confirma que estamos mesmo no caminho de fallback.
        const marcadoPeloAura = await page.evaluate(
            () => document.querySelector("#lp-container form")?.dataset.auraFormsV5
        );
        assert.equal(marcadoPeloAura, undefined, "Com lp-forms-v5.js bloqueado, o form não deveria ser marcado pelo AuraFormsV5");

        const dados = await preencherEEnviar(page, "fallback");

        await page.waitForFunction(
            () => (document.querySelector("#lp-container form")?.innerHTML || "").includes("Recebemos seus dados"),
            undefined,
            { timeout: 15000 }
        );

        const leadsSnap = await db.collection("leads").where("email", "==", dados.email).get();
        assert.equal(leadsSnap.size, 1, "Fallback (enviarFormularioLP) deveria criar exatamente um lead via createPublicLead também");
        const lead = leadsSnap.docs[0].data();
        assert.equal(lead.criadoPor, STORE_UID, "Fallback também precisa resolver o tenant no servidor, nunca aceitar do cliente");
        assert.equal(lead.nome, dados.nome);
        assert.equal(lead.status, "novo");
        assert.equal(lead.formularioId, "captura_lp_legado");

        console.log("landing-page-leads.flow: caminho de fallback (enviarFormularioLP) OK.");
    } catch (erro) {
        await captureDiagnostics(page, "landing-page-leads-fallback", coletarErrosConsole(page)).catch(() => {});
        throw erro;
    } finally {
        const errosReais = erros.filter((msg) => !ehErroDeRedeExterno(msg) && !/lp-forms-v5/i.test(msg));
        assert.deepEqual(errosReais, [], `Fallback: não deveria emitir console.error inesperado: ${errosReais.join("\n")}`);
        await contexto.close();
    }
}

function clientCallable() {
    const app = initializeClientApp({
        apiKey: "demo-api-key",
        authDomain: "demo-vide-hub.firebaseapp.com",
        projectId: PROJECT_ID,
        appId: "demo-app-id"
    }, `landing-leads-negativos-${SUFIXO_TESTE}`);
    const functions = getFunctions(app, "southamerica-east1");
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
    return httpsCallable(functions, "createPublicLead");
}

async function testarNegativos() {
    const createPublicLead = clientCallable();

    let falhouLandingInexistente = false;
    try {
        await createPublicLead({
            publicPageId: "loja-fantasma__pagina-fantasma",
            nome: "Visitante QA"
        });
    } catch (error) {
        falhouLandingInexistente = true;
        assert.equal(error.code, "functions/not-found", `landing inexistente: esperava not-found, recebeu ${error.code}`);
    }
    assert.equal(falhouLandingInexistente, true, "createPublicLead deveria recusar publicPageId inexistente");

    const db = adminDb();
    await db.collection("usuarios").doc("owner-bloqueado-qa-leads").set({
        status: "bloqueado",
        email: "owner.bloqueado.qa.leads@local.test"
    });
    const publicPageIdBloqueada = `loja-bloqueada-qa-${SUFIXO_TESTE}`;
    await db.collection("landing_pages_publicas").doc(publicPageIdBloqueada).set({
        donoUID: "owner-bloqueado-qa-leads",
        titulo: "LP de loja bloqueada",
        publicado: true
    });

    let falhouLojaBloqueada = false;
    try {
        await createPublicLead({
            publicPageId: publicPageIdBloqueada,
            nome: "Visitante QA"
        });
    } catch (error) {
        falhouLojaBloqueada = true;
        assert.equal(error.code, "functions/failed-precondition", `loja bloqueada: esperava failed-precondition, recebeu ${error.code}`);
    }
    assert.equal(falhouLojaBloqueada, true, "createPublicLead deveria recusar Landing Page cujo dono está bloqueado");

    // Isolamento cross-tenant: duas Landing Pages reais, dois donos reais —
    // enviar o publicPageId da Landing Page C (outro tenant) nunca pode
    // gerar um lead sob o dono da LP A (STORE_UID). Não basta "ignora
    // ownerUid forjado"; aqui o publicPageId em si é legítimo, só de OUTRO
    // tenant. A LP A (PUBLIC_PAGE_ID/STORE_UID) já foi provada correta
    // pelos caminhos primário e de fallback acima — só falta a segunda
    // ponta (LP C nunca vaza pra A), reaproveitando o orçamento de
    // chamadas de createPublicLead (5/min por IP) em vez de duplicar.
    const ownerCUid = "owner-cross-tenant-qa-leads";
    await db.collection("usuarios").doc(ownerCUid).set({
        status: "aprovado",
        email: "owner.cross.tenant.qa.leads@local.test"
    });
    const publicPageIdC = `loja-cross-tenant-qa-${SUFIXO_TESTE}`;
    await db.collection("landing_pages_publicas").doc(publicPageIdC).set({
        donoUID: ownerCUid,
        titulo: "LP do tenant C",
        publicado: true
    });

    const emailCrossC = `cross.c.${SUFIXO_TESTE}@local.test`;
    const resultadoC = await createPublicLead({ publicPageId: publicPageIdC, nome: "Visitante C", email: emailCrossC });
    assert.equal(resultadoC.data.ok, true);
    const leadCSnap = await db.collection("leads").doc(resultadoC.data.leadId).get();
    assert.equal(leadCSnap.data().criadoPor, ownerCUid, "Lead da LP C deveria pertencer ao dono real de C");
    assert.notEqual(leadCSnap.data().criadoPor, STORE_UID, "Lead da LP C nunca poderia vazar pro tenant A");

    console.log("landing-page-leads.flow: negativos (landing inexistente / loja bloqueada / isolamento cross-tenant) OK.");
}

async function main() {
    const { baseUrl, close } = await startStaticServer();
    const browser = await launchBrowser();
    let falhou = false;

    try {
        await seedLandingPage();

        const db = adminDb();
        await testarCaminhoPrimarioAuraFormsV5(browser, baseUrl, db);
        await testarCaminhoFallbackEnviarFormularioLP(browser, baseUrl, db);
        await testarNegativos();

        console.log(
            "landing-page-leads.flow: OK — AuraFormsV5 e o fallback legado (index.html) " +
            "ambos migrados de escrita direta pra createPublicLead, tenant sempre resolvido " +
            "no servidor a partir de publicPageId, UI de sucesso confirmada nos dois caminhos, " +
            "landing inexistente e loja bloqueada recusadas."
        );
    } catch (erro) {
        falhou = true;
        console.error("landing-page-leads.flow: FALHOU —", erro);
    } finally {
        await browser.close();
        await close();
    }

    if (falhou) {
        process.exitCode = 1;
    }
}

main();
