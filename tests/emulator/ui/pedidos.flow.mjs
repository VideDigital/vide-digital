// Fase 7 do Quality Gate — validação profunda de Pedidos (o gap que o
// Codex deixou explicitamente incompleto: "a tela abre, fica acessível e
// não quebra"). Aqui é fluxo real: abrir modal, buscar produto do
// catálogo, adicionar item, conferir subtotal, confirmar que texto
// livre/valor não são sobrescritos depois de edição manual, prazo de
// entrega, criar, conferir na lista, mudar status.
//
// IMPORTANTE (seguindo a instrução explícita do mandato): este app NÃO
// tem edição completa de um pedido já criado — existe criação (modal) e
// mudança de status (select no card / drag-and-drop), só isso. Este
// arquivo não testa "editar pedido" porque essa funcionalidade não
// existe; testar algo inexistente seria inventar cobertura falsa.
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
        await page.evaluate(() => window.ativarAba("view-pedidos"));
        await page.waitForLoadState("networkidle").catch(() => {});

        // 1-2. Abrir modal de novo pedido.
        await page.evaluate(() => window.abrirModalPedido && window.abrirModalPedido());
        await page.waitForSelector("#pedido-modal", { state: "visible", timeout: 10000 });

        // 3. Preencher cliente.
        await page.fill("#ped-cliente", "Cliente Playwright QA");

        // 4-6. Buscar produto do catálogo (seedado como "Produto Local") e selecionar.
        await page.fill("#ped-item-busca", "Produto Local");
        await page.waitForSelector(".aura-order-item-sugestao", { state: "visible", timeout: 10000 });
        await page.click(".aura-order-item-sugestao");

        // 6-7. Confirmar que o item apareceu na lista.
        await page.waitForSelector(".aura-order-item-row", { state: "visible", timeout: 10000 });
        const nomeItem = await page.textContent(".aura-order-item-nome");
        assert.match(nomeItem || "", /Produto Local/, "item adicionado deveria mostrar o nome do produto do catálogo");

        // 7. Alterar quantidade (2 unidades).
        await page.fill(".aura-order-item-qtd", "2");
        await page.dispatchEvent(".aura-order-item-qtd", "change");
        await page.waitForFunction(() => {
            const preco = document.querySelector(".aura-order-item-preco");
            return preco && /198/.test(preco.textContent);
        }, { timeout: 10000 }).catch(async () => {
            const atual = await page.textContent(".aura-order-item-preco").catch(() => null);
            throw new Error(`preço do item não refletiu quantidade 2 (produto R$99 → esperado conter "198"); valor atual: ${atual}`);
        });

        // 8. Confirmar subtotal (2 x R$99 = R$198).
        const subtotalTexto = await page.textContent("#ped-itens-subtotal");
        assert.match(subtotalTexto || "", /198/, `subtotal deveria refletir 2x R$99, obtido: "${subtotalTexto}"`);

        // 9. Confirmar preenchimento automático do texto livre.
        const produtosAuto = await page.inputValue("#ped-produtos");
        assert.match(produtosAuto, /Produto Local/, "campo de texto livre deveria pré-preencher com o resumo dos itens");

        // 10. Editar manualmente o texto livre e garantir que não é sobrescrito.
        await page.fill("#ped-produtos", "2x Produto Local (editado manualmente pelo QA)");
        await page.evaluate(() => window.marcarPedidoCampoEditadoManual && window.marcarPedidoCampoEditadoManual("ped-produtos"));
        // Mexe de novo na quantidade pra forçar um novo re-render de renderItensPedido()
        // e confirmar que o texto editado manualmente sobrevive.
        await page.fill(".aura-order-item-qtd", "3");
        await page.dispatchEvent(".aura-order-item-qtd", "change");
        await page.waitForTimeout(300);
        const produtosDepois = await page.inputValue("#ped-produtos");
        assert.equal(produtosDepois, "2x Produto Local (editado manualmente pelo QA)", "texto livre editado manualmente foi sobrescrito pelo auto-preenchimento");

        // 11. Editar manualmente o valor e garantir que não é sobrescrito.
        await page.fill("#ped-valor", "250.00");
        await page.evaluate(() => window.marcarPedidoCampoEditadoManual && window.marcarPedidoCampoEditadoManual("ped-valor"));
        await page.fill(".aura-order-item-qtd", "1");
        await page.dispatchEvent(".aura-order-item-qtd", "change");
        await page.waitForTimeout(300);
        const valorDepois = await page.inputValue("#ped-valor");
        assert.equal(valorDepois, "250.00", "valor editado manualmente foi sobrescrito pelo auto-preenchimento");

        // 12. Selecionar prazo de entrega. input[type="date"] só aceita
        // fill() com valor no formato ISO (YYYY-MM-DD) — texto livre como
        // "5 dias úteis" dá "Malformed value" no Playwright.
        const prazoEntregaISO = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        await page.fill("#ped-prazo-entrega", prazoEntregaISO);

        // 13. Criar pedido.
        await page.click("[onclick='salvarPedido()']");
        await page.waitForSelector("#pedido-modal.hidden, #pedido-modal[style*='display: none']", { timeout: 15000 }).catch(() => {});

        // 14-15. Confirmar pedido na lista com status inicial "aguardando".
        await page.waitForFunction(() => {
            return Array.from(document.querySelectorAll(".aura-order-flow-card"))
                .some(card => (card.textContent || "").includes("Cliente Playwright QA"));
        }, { timeout: 15000 });
        const cardAguardando = await page.$('.aura-order-flow-card[data-status="aguardando"]');
        const contemNovoPedido = cardAguardando ? (await cardAguardando.textContent() || "").includes("Cliente Playwright QA") : false;
        assert.ok(contemNovoPedido, "pedido recém-criado deveria aparecer na coluna 'aguardando'");

        // 16-17. Alterar status e confirmar.
        const pedidoId = await page.evaluate(() => {
            const card = Array.from(document.querySelectorAll(".aura-order-flow-card"))
                .find(c => (c.textContent || "").includes("Cliente Playwright QA"));
            return card ? card.getAttribute("data-pedido-id") : null;
        });
        assert.ok(pedidoId, "não consegui localizar o id do pedido recém-criado no DOM");
        await page.evaluate(id => window.moverPedidoFluxo && window.moverPedidoFluxo(id, "confirmado"), pedidoId);
        await page.waitForFunction(id => {
            const card = document.querySelector(`.aura-order-flow-card[data-pedido-id="${id}"]`);
            return card && card.getAttribute("data-status") === "confirmado";
        }, pedidoId, { timeout: 15000 });

        console.log("pedidos.flow: OK — criação, itens estruturados, subtotal, edição manual preservada, prazo de entrega e mudança de status validados de ponta a ponta.");
    } catch (error) {
        falhou = true;
        await captureDiagnostics(page, "pedidos-flow", erros.filter(e => !ehErroDeRedeExterno(e)));
        console.error("pedidos.flow: FALHOU —", error.message);
    } finally {
        await page.close();
        await browser.close();
        await close();
    }
    if (falhou) process.exit(1);
}

await main();
