// Fase 8/9 do Quality Gate — validação profunda de Atendimento e
// Templates de Atendimento (o gerenciador de templates vive DENTRO da
// Central de Atendimento, num modal — não é uma view própria do
// dashboard). Cobre o núcleo de cada fluxo, não literalmente cada bullet
// do mandato original (ver docs/QUALITY_GATE_RELEASE.md pra escopo exato).
//
// Mesma limitação de rede documentada em login.smoke.mjs se aplica aqui.
import assert from "node:assert/strict";
import { captureDiagnostics, coletarErrosConsole, ehErroDeRedeExterno, launchBrowser, loginReal, startStaticServer } from "./_helpers.mjs";

async function main() {
    const { baseUrl, close } = await startStaticServer();
    const browser = await launchBrowser();
    let falhou = false;
    const page = await browser.newPage();
    const erros = coletarErrosConsole(page);
    try {
        await loginReal(page, baseUrl, { email: "owner.pro@local.test", senha: "Local123!pro" });
        await page.evaluate(() => window.ativarAba("view-atendimento"));
        await page.waitForSelector("#atend-lista-conversas", { state: "visible", timeout: 10000 });
        await page.waitForLoadState("networkidle").catch(() => {});

        // 2-4. Selecionar a conversa seedada, carregar mensagens/eventos.
        await page.waitForSelector("[data-atend-conversa-id]", { state: "visible", timeout: 15000 });
        await page.click("[data-atend-conversa-id]");
        await page.waitForSelector("#atend-resposta-input", { state: "visible", timeout: 10000 });

        // 6-7. Responder a conversa; confirmar mensagem enviada.
        const textoResposta = `Resposta automatizada QA ${Date.now()}`;
        await page.fill("#atend-resposta-input", textoResposta);
        await page.click("#atend-form-resposta button[type=submit]");
        await page.waitForFunction(texto => {
            return Array.from(document.querySelectorAll("#atend-mensagens *"))
                .some(el => (el.textContent || "").includes(texto));
        }, textoResposta, { timeout: 15000 });

        // 9-10. Alterar status; confirmar mudança refletida no select.
        await page.selectOption("#atend-status-select", "resolvida").catch(async () => {
            const opcoes = await page.$$eval("#atend-status-select option", els => els.map(o => o.value));
            throw new Error(`não consegui selecionar status "resolvida"; opções disponíveis: ${JSON.stringify(opcoes)}`);
        });
        await page.waitForFunction(() => document.getElementById("atend-status-select")?.value === "resolvida", { timeout: 10000 });

        // 14. Usar template — abre o seletor, escolhe o template seedado
        // (data-atend-template-id, ver templateItemHtml em atendimento.js).
        await page.click("#atend-btn-templates");
        await page.waitForSelector("#atend-templates-modal:not(.hidden)", { timeout: 10000 });
        await page.fill("#atend-templates-busca", "Saudação");
        await page.waitForSelector("[data-atend-template-id]", { state: "visible", timeout: 10000 });
        await page.click("[data-atend-template-id]");
        // Template seedado tem {{nome_cliente}} — resolve pro nome do cliente vinculado.
        await page.waitForFunction(() => {
            const val = document.getElementById("atend-resposta-input")?.value || "";
            return val.length > 0;
        }, { timeout: 10000 });
        const valorAposTemplate = await page.inputValue("#atend-resposta-input");
        assert.ok(valorAposTemplate.length > 0, "usar o template deveria preencher o campo de resposta");

        console.log("atendimento.flow: OK — seleção de conversa, resposta, mudança de status e uso de template validados.");

        // ===== Templates: gestão (CRUD) — modal próprio #atend-gestao-modal =====
        await page.click("#atend-btn-gerenciar-templates");
        await page.waitForSelector("#atend-gestao-btn-novo", { state: "visible", timeout: 10000 });

        // Criar novo template.
        await page.click("#atend-gestao-btn-novo");
        await page.waitForSelector("#atend-tpl-titulo", { state: "visible", timeout: 10000 });
        const tituloNovo = `Template QA ${Date.now()}`;
        await page.fill("#atend-tpl-titulo", tituloNovo);
        await page.fill("#atend-tpl-mensagem", "Mensagem de teste automatizado, olá {{nome_cliente}}.");
        await page.click("#atend-tpl-form button[type=submit]");
        await page.waitForFunction(titulo => {
            const box = document.getElementById("atend-gestao-tpl-lista");
            return box && (box.textContent || "").includes(titulo);
        }, tituloNovo, { timeout: 15000 }).catch(() => {
            throw new Error(`template "${tituloNovo}" não apareceu em #atend-gestao-tpl-lista após salvar`);
        });

        console.log("templates.flow: OK — criação de template via gestão validada.");
    } catch (error) {
        falhou = true;
        await captureDiagnostics(page, "atendimento-templates-flow", erros.filter(e => !ehErroDeRedeExterno(e)));
        console.error("atendimento-templates.flow: FALHOU —", error.message);
    } finally {
        await page.close();
        await browser.close();
        await close();
    }
    if (falhou) process.exit(1);
}

await main();
