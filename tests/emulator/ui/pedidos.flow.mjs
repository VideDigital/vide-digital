// Estabilização V1 — fluxo profundo atual de Pedidos.
// Valida o modal legado de criação e, depois, a Central de Pedidos V1.0:
// criar pedido, preservar campos editados manualmente, localizar o novo
// pedido na tabela atual, abrir o detalhe e alterar o status.
import assert from "node:assert/strict";
import {
    captureDiagnostics,
    coletarErrosConsole,
    ehErroDeRedeExterno,
    launchBrowser,
    loginReal,
    startStaticServer
} from "./_helpers.mjs";

async function main() {
    const { baseUrl, close } = await startStaticServer();
    const browser = await launchBrowser();
    let falhou = false;

    const page = await browser.newPage({
        viewport: { width: 1440, height: 900 }
    });

    const erros = coletarErrosConsole(page);

    try {
        await loginReal(page, baseUrl, {
            email: "owner.pro@local.test",
            senha: "Local123!pro"
        });

        const ativou = await page.evaluate(() => {
            return typeof window.ativarAba === "function"
                ? window.ativarAba("view-pedidos")
                : false;
        });

        assert.equal(
            ativou,
            true,
            "A view de Pedidos deveria ser ativada"
        );

        await page.waitForSelector(
            "#view-pedidos.active",
            { state: "visible", timeout: 15000 }
        );

        await page.waitForLoadState("networkidle").catch(() => {});

        // Abrir modal de novo pedido.
        await page.evaluate(() => {
            window.abrirModalPedido?.();
        });

        await page.waitForSelector(
            "#pedido-modal",
            { state: "visible", timeout: 10000 }
        );

        // Cliente.
        await page.fill(
            "#ped-cliente",
            "Cliente Playwright QA"
        );

        // Produto seedado.
        await page.fill(
            "#ped-item-busca",
            "Produto Local"
        );

        await page.waitForSelector(
            ".aura-order-item-sugestao",
            { state: "visible", timeout: 10000 }
        );

        await page.click(
            ".aura-order-item-sugestao"
        );

        await page.waitForSelector(
            ".aura-order-item-row",
            { state: "visible", timeout: 10000 }
        );

        const nomeItem = await page.textContent(
            ".aura-order-item-nome"
        );

        assert.match(
            nomeItem || "",
            /Produto Local/,
            "O item deveria mostrar Produto Local"
        );

        // Quantidade 2: subtotal esperado R$ 198,00.
        await page.fill(
            ".aura-order-item-qtd",
            "2"
        );

        await page.dispatchEvent(
            ".aura-order-item-qtd",
            "change"
        );

        await page.waitForFunction(() => {
            const preco = document.querySelector(
                ".aura-order-item-preco"
            );

            return Boolean(
                preco &&
                /198/.test(preco.textContent || "")
            );
        }, { timeout: 10000 });

        const subtotalTexto = await page.textContent(
            "#ped-itens-subtotal"
        );

        assert.match(
            subtotalTexto || "",
            /198/,
            `Subtotal esperado R$ 198,00; obtido: ${subtotalTexto}`
        );

        // Campo de produtos preenchido automaticamente.
        const produtosAuto = await page.inputValue(
            "#ped-produtos"
        );

        assert.match(
            produtosAuto,
            /Produto Local/,
            "O resumo dos itens deveria preencher ped-produtos"
        );

        // Edição manual deve sobreviver ao re-render.
        const resumoManual =
            "2x Produto Local (editado manualmente pelo QA)";

        await page.fill(
            "#ped-produtos",
            resumoManual
        );

        await page.evaluate(() => {
            window.marcarPedidoCampoEditadoManual?.(
                "ped-produtos"
            );
        });

        await page.fill(
            ".aura-order-item-qtd",
            "3"
        );

        await page.dispatchEvent(
            ".aura-order-item-qtd",
            "change"
        );

        await page.waitForTimeout(300);

        assert.equal(
            await page.inputValue("#ped-produtos"),
            resumoManual,
            "O texto manual de produtos foi sobrescrito"
        );

        // Valor manual também deve sobreviver ao re-render.
        await page.fill(
            "#ped-valor",
            "250.00"
        );

        await page.evaluate(() => {
            window.marcarPedidoCampoEditadoManual?.(
                "ped-valor"
            );
        });

        await page.fill(
            ".aura-order-item-qtd",
            "1"
        );

        await page.dispatchEvent(
            ".aura-order-item-qtd",
            "change"
        );

        await page.waitForTimeout(300);

        assert.equal(
            await page.inputValue("#ped-valor"),
            "250.00",
            "O valor manual foi sobrescrito"
        );

        const prazoEntregaISO = new Date(
            Date.now() + 5 * 24 * 60 * 60 * 1000
        ).toISOString().slice(0, 10);

        await page.fill(
            "#ped-prazo-entrega",
            prazoEntregaISO
        );

        // Criar pedido.
        await page.click(
            "[onclick='salvarPedido()']"
        );

        await page.waitForFunction(() => {
            const modal = document.getElementById(
                "pedido-modal"
            );

            if (!modal) return true;

            const estilo = window.getComputedStyle(modal);

            return (
                modal.classList.contains("hidden") ||
                estilo.display === "none" ||
                estilo.visibility === "hidden"
            );
        }, { timeout: 15000 }).catch(() => {});

        // A Central atual mostra a Visão geral em tabela. O teste antigo
        // procurava .aura-order-flow-card e status "aguardando", que pertencem
        // ao layout anterior e não existem na V1.0.
        await page.waitForFunction(() => {
            return Array.from(
                document.querySelectorAll(
                    "[data-open-order]"
                )
            ).some(elemento =>
                (elemento.textContent || "").includes(
                    "Cliente Playwright QA"
                )
            );
        }, { timeout: 20000 });

        const pedidoId = await page.evaluate(() => {
            const elemento = Array.from(
                document.querySelectorAll(
                    "[data-open-order]"
                )
            ).find(item =>
                (item.textContent || "").includes(
                    "Cliente Playwright QA"
                )
            );

            return elemento?.getAttribute(
                "data-open-order"
            ) || null;
        });

        assert.ok(
            pedidoId,
            "Não foi possível localizar o novo pedido na tabela"
        );

        // Abrir o detalhe atual.
        await page.click(
            `[data-open-order="${pedidoId}"]`
        );

        await page.waitForSelector(
            "#aura-orders-v1-detail-status",
            { state: "visible", timeout: 15000 }
        );

        assert.equal(
            await page.inputValue(
                "#aura-orders-v1-detail-status"
            ),
            "novo",
            "O pedido novo deveria iniciar com status novo"
        );

        // Alterar status no detalhe e salvar.
        await page.selectOption(
            "#aura-orders-v1-detail-status",
            "confirmado"
        );

        await page.click(
            '[data-orders-action="save"]'
        );

        await page.waitForFunction(id => {
            const state =
                window.AuraOrdersV1?.getState?.();

            if (!state) return false;

            const select = document.getElementById(
                "aura-orders-v1-detail-status"
            );

            return (
                select &&
                select.value === "confirmado"
            );
        }, pedidoId, { timeout: 20000 });

        // Voltar e confirmar a etiqueta na tabela.
        await page.click(
            '[data-orders-action="back"]'
        );

        await page.waitForFunction(id => {
            const linha = document.querySelector(
                `[data-open-order="${id}"]`
            );

            return Boolean(
                linha &&
                linha.querySelector(
                    '[data-status="confirmado"]'
                )
            );
        }, pedidoId, { timeout: 20000 });

        const errosRelevantes = erros.filter(
            erro => !ehErroDeRedeExterno(erro)
        );

        assert.deepEqual(
            errosRelevantes,
            [],
            `Erros de console no fluxo de Pedidos: ` +
            `${JSON.stringify(errosRelevantes)}`
        );

        console.log(
            "pedidos.flow: OK — criação, itens estruturados, " +
            "subtotal, campos manuais, prazo, tabela atual, detalhe " +
            "e mudança de status validados."
        );
    } catch (error) {
        falhou = true;

        await captureDiagnostics(
            page,
            "pedidos-flow",
            erros.filter(
                erro => !ehErroDeRedeExterno(erro)
            )
        );

        console.error(
            "pedidos.flow: FALHOU —",
            error.message
        );
    } finally {
        await page.close();
        await browser.close();
        await close();
    }

    if (falhou) process.exit(1);
}

await main();
