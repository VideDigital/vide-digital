// IA Copilot do Atendimento — Fase 1: validação profunda no navegador.
// Cobre: geração de sugestão (mock local, sem rede externa), "Usar
// resposta" inserindo no compositor (nunca enviando sozinho), descarte,
// e o gate de permissão (funcionário sem "ia-copilot" nunca vê o
// toggle do painel, mesmo tendo acesso ao Atendimento).
//
// Mesma limitação de rede documentada em login.smoke.mjs se aplica aqui
// (SDK do Firebase carregado de www.gstatic.com).
import assert from "node:assert/strict";
import { captureDiagnostics, coletarErrosConsole, ehErroDeRedeExterno, launchBrowser, loginReal, startStaticServer } from "./_helpers.mjs";

async function abrirPrimeiraConversa(page) {
    await page.evaluate(() => window.ativarAba("view-atendimento"));
    await page.waitForSelector("#atend-lista-conversas", { state: "visible", timeout: 10000 });
    await page.waitForSelector("[data-atend-conversa-id]", { state: "visible", timeout: 15000 });
    await page.click("[data-atend-conversa-id]");
    await page.waitForSelector("#atend-resposta-input", { state: "visible", timeout: 10000 });
}

async function main() {
    const { baseUrl, close } = await startStaticServer();
    const browser = await launchBrowser();
    let falhou = false;
    let page = await browser.newPage();
    let erros = coletarErrosConsole(page);
    try {
        // ===== Dono: vê o painel, gera sugestão, usa e descarta =====
        await loginReal(page, baseUrl, { email: "owner.pro@local.test", senha: "Local123!pro" });
        await abrirPrimeiraConversa(page);

        await page.waitForSelector("#ia-copilot-toggle-linha:not([hidden])", { timeout: 10000 });
        await page.click("#ia-copilot-toggle");
        await page.waitForSelector("#ia-copilot-painel:not([hidden])", { timeout: 10000 });

        await page.selectOption("#ia-copilot-acao", "sugerir_resposta");
        await page.click("#ia-copilot-gerar");
        await page.waitForSelector("#ia-copilot-resultado:not([hidden])", { timeout: 10000 });
        const textoSugestao = (await page.textContent("#ia-copilot-texto"))?.trim();
        assert.ok(textoSugestao && textoSugestao.length > 0, "o copiloto deveria gerar um texto de sugestão");

        // Compositor vazio: "Usar resposta" insere direto, sem pedir confirmação.
        const composerAntes = (await page.inputValue("#atend-resposta-input")).trim();
        assert.equal(composerAntes, "", "compositor deveria começar vazio para este teste");
        await page.click("#ia-copilot-usar");
        await page.waitForFunction(() => {
            const val = document.getElementById("atend-resposta-input")?.value || "";
            return val.length > 0;
        }, { timeout: 10000 });
        const composerDepois = await page.inputValue("#atend-resposta-input");
        assert.ok(composerDepois.length > 0, "\"Usar resposta\" deveria preencher o compositor");
        // Nunca envia sozinho: o texto fica só no textarea, aguardando o clique em "Enviar".
        const enviouSozinho = await page.evaluate(() => {
            return Array.from(document.querySelectorAll("#atend-mensagens *"))
                .some(el => (el.textContent || "").includes(document.getElementById("atend-resposta-input").value));
        });
        assert.equal(enviouSozinho, false, "o copiloto nunca deve enviar a mensagem sozinho");

        // Compositor já tem texto: gerar de novo e usar deve pedir confirmação.
        await page.click("#ia-copilot-gerar");
        await page.waitForSelector("#ia-copilot-resultado:not([hidden])", { timeout: 10000 });
        await page.click("#ia-copilot-usar");
        await page.waitForSelector("#ia-copilot-confirmar:not([hidden])", { timeout: 10000 });
        await page.click("#ia-copilot-cancelar-uso");

        // Descartar sugestão limpa o painel de volta ao estado vazio.
        await page.click("#ia-copilot-gerar");
        await page.waitForSelector("#ia-copilot-resultado:not([hidden])", { timeout: 10000 });
        await page.click("#ia-copilot-descartar");
        await page.waitForSelector("#ia-copilot-vazio:not([hidden])", { timeout: 10000 });

        console.log("ia-copilot.flow (owner): OK — gerar, usar (com e sem confirmação) e descartar validados.");

        // ===== Funcionário com atendimento mas SEM ia-copilot: não vê o toggle =====
        await page.close();
        page = await browser.newPage();
        erros = coletarErrosConsole(page);
        await loginReal(page, baseUrl, { email: "employee.read@local.test", senha: "Local123!read" });
        await abrirPrimeiraConversa(page);
        const toggleVisivel = await page.isVisible("#ia-copilot-toggle-linha").catch(() => false);
        assert.equal(toggleVisivel, false, "funcionário sem a permissão dedicada 'ia-copilot' não deveria ver o toggle do copiloto");

        console.log("ia-copilot.flow (employee.read): OK — toggle do copiloto corretamente oculto sem a permissão dedicada.");

        // ===== Funcionário com atendimento + ia-copilot concedidos: vê o toggle =====
        await page.close();
        page = await browser.newPage();
        erros = coletarErrosConsole(page);
        await loginReal(page, baseUrl, { email: "employee.edit@local.test", senha: "Local123!edit" });
        await abrirPrimeiraConversa(page);
        await page.waitForSelector("#ia-copilot-toggle-linha:not([hidden])", { timeout: 10000 });

        console.log("ia-copilot.flow (employee.edit): OK — toggle do copiloto visível com a permissão dedicada concedida.");
    } catch (error) {
        falhou = true;
        await captureDiagnostics(page, "ia-copilot-flow", erros.filter(e => !ehErroDeRedeExterno(e)));
        console.error("ia-copilot.flow: FALHOU —", error.message);
    } finally {
        await page.close();
        await browser.close();
        await close();
    }
    if (falhou) process.exit(1);
}

await main();
