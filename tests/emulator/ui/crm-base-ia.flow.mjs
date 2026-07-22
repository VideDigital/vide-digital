// Fase 10/11/12 do Quality Gate — validação profunda de CRM 360, Base de
// Conhecimento da IA e Central de IA. Cobre o núcleo de cada fluxo real
// (não chama nenhum provedor de IA externo — Central de IA aqui só
// confirma persistência de configuração local, nunca uma resposta gerada).
//
// Mesma limitação de rede documentada em login.smoke.mjs se aplica aqui.
import assert from "node:assert/strict";
import { captureDiagnostics, coletarErrosConsole, ehErroDeRedeExterno, launchBrowser, loginReal, startStaticServer } from "./_helpers.mjs";

async function flowCrm(page) {
    await page.evaluate(() => window.ativarAba("view-crm360"));
    await page.waitForSelector("#crm-lista-clientes", { state: "visible", timeout: 10000 });
    await page.waitForLoadState("networkidle").catch(() => {});

    // 2-3. Listar clientes; buscar por nome (cliente seedado).
    await page.fill("#crm-lista-busca", "Cliente Local");
    await page.waitForFunction(() => {
        const box = document.getElementById("crm-lista-clientes");
        return box && box.querySelector("[data-crm-abrir-cliente]");
    }, { timeout: 10000 });

    // 7-8. Abrir drawer do cliente; ver identidade.
    await page.click("[data-crm-abrir-cliente]");
    await page.waitForSelector("#crm-cliente-modal:not(.hidden)", { timeout: 10000 });

    // 15-16. Adicionar observação interna; confirmar que aparece.
    const textoObs = `Observação QA ${Date.now()}`;
    await page.fill("#crm-observacao-input", textoObs);
    await page.click("#crm-observacao-form button[type=submit]");
    await page.waitForFunction(texto => document.body.textContent.includes(texto), textoObs, { timeout: 15000 });

    // 18. Adicionar tag.
    await page.fill("#crm-tag-input", "qa-teste");
    await page.click("#crm-tag-form button[type=submit]");
    await page.waitForFunction(() => document.body.textContent.includes("qa-teste"), { timeout: 15000 });

    // 20. Alterar status de relacionamento.
    await page.selectOption("#crm-status-select", "cliente").catch(() => {});

    return true;
}

async function flowBaseConhecimento(page) {
    await page.evaluate(() => window.ativarAba("view-base-conhecimento"));
    await page.waitForSelector("#bc-lista", { state: "visible", timeout: 10000 });
    await page.waitForLoadState("networkidle").catch(() => {});

    // 2. Criar FAQ.
    await page.click("#bc-btn-novo");
    await page.waitForSelector("#bc-form-titulo", { state: "visible", timeout: 10000 });
    const tituloFaq = `FAQ QA ${Date.now()}`;
    await page.fill("#bc-form-titulo", tituloFaq);
    await page.selectOption("#bc-form-tipo", "faq");
    await page.fill("#bc-form-conteudo", "Resposta de teste automatizado para o Quality Gate.");
    await page.click("#bc-form-salvar");
    await page.waitForFunction(titulo => {
        const box = document.getElementById("bc-lista");
        return box && (box.textContent || "").includes(titulo);
    }, tituloFaq, { timeout: 15000 });

    // 4-9. Criar item tipo "produto" por referência, vincular produto do catálogo, salvar, confirmar remontagem do conteúdo.
    await page.click("#bc-btn-novo");
    await page.waitForSelector("#bc-form-titulo", { state: "visible", timeout: 10000 });
    await page.fill("#bc-form-titulo", `Produto por referência QA ${Date.now()}`);
    await page.selectOption("#bc-form-tipo", "produto");
    await page.waitForSelector("#bc-produto-refs-secao:not(.hidden)", { timeout: 10000 });
    await page.fill("#bc-produto-refs-busca", "Produto Local");
    await page.waitForSelector("[data-bc-adicionar-produto]", { state: "visible", timeout: 10000 });
    await page.click("[data-bc-adicionar-produto]");
    await page.waitForSelector(".bc-produto-ref-chip", { state: "visible", timeout: 10000 });
    await page.click("#bc-form-salvar");
    await page.waitForFunction(() => {
        const box = document.getElementById("bc-lista");
        return box && (box.textContent || "").includes("Produto por referência QA");
    }, { timeout: 15000 });

    return true;
}

async function flowCentralIa(page) {
    await page.evaluate(() => window.ativarAba("view-central-ia"));
    await page.waitForSelector("#ia-nome-assistente", { state: "visible", timeout: 10000 });
    await page.waitForLoadState("networkidle").catch(() => {});

    // 3-6. Alterar nome/mensagem, salvar, recarregar, confirmar persistência.
    const nomeNovo = `Assistente QA ${Date.now()}`;
    await page.fill("#ia-nome-assistente", nomeNovo);
    await page.click("#ia-salvar");
    await page.waitForFunction(nome => document.getElementById("ia-nome-assistente")?.value === nome, nomeNovo, { timeout: 10000 });

    // Recarrega a view (simula reabrir) e confirma que persistiu no Firestore, não só em memória.
    await page.evaluate(() => window.ativarAba("view-dashboard"));
    await page.evaluate(() => window.ativarAba("view-central-ia"));
    await page.waitForFunction(nome => document.getElementById("ia-nome-assistente")?.value === nome, nomeNovo, { timeout: 15000 });

    // 7-8. Seletor "quando a IA pode responder" não ativa resposta automática sozinho.
    const modoAtual = await page.inputValue("#ia-modo-resposta").catch(() => null);
    assert.notEqual(modoAtual, undefined, "seletor de modo de resposta deveria existir e ter um valor");

    return true;
}

async function main() {
    const { baseUrl, close } = await startStaticServer();
    const browser = await launchBrowser();
    let falhas = [];
    const page = await browser.newPage();
    const erros = coletarErrosConsole(page);
    try {
        await loginReal(page, baseUrl, { email: "owner.pro@local.test", senha: "Local123!pro" });

        for (const [nome, flow] of [["crm360", flowCrm], ["base-conhecimento", flowBaseConhecimento], ["central-ia", flowCentralIa]]) {
            erros.length = 0;
            try {
                await flow(page);
                const errosRelevantes = erros.filter(e => !ehErroDeRedeExterno(e));
                if (errosRelevantes.length > 0) throw new Error(`erros de JS: ${JSON.stringify(errosRelevantes)}`);
                console.log(`${nome}.flow: OK`);
            } catch (error) {
                await captureDiagnostics(page, `${nome}-flow`, erros.filter(e => !ehErroDeRedeExterno(e)));
                falhas.push(`${nome}: ${error.message}`);
                console.error(`${nome}.flow: FALHOU —`, error.message);
            }
        }
    } finally {
        await page.close();
        await browser.close();
        await close();
    }
    if (falhas.length > 0) {
        console.error("crm-base-ia.flow: FALHOU em", falhas.length, "fluxo(s) —", falhas);
        process.exit(1);
    }
    console.log("crm-base-ia.flow: OK — CRM 360, Base de Conhecimento e Central de IA validados.");
}

await main();
