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

        // Produto seedado. O catálogo é carregado de forma assíncrona;
        // em runners mais lentos, o primeiro evento de input pode acontecer
        // antes de a lista estar pronta. Repetimos somente a busca, sem
        // mascarar erro: se o produto não aparecer após as tentativas, o
        // teste continua falhando normalmente.
        let encontrouSugestao = false;

        for (let tentativa = 1; tentativa <= 4; tentativa += 1) {
            await page.fill(
                "#ped-item-busca",
                ""
            );

            await page.fill(
                "#ped-item-busca",
                "Produto Local"
            );

            await page.dispatchEvent(
                "#ped-item-busca",
                "input"
            );

            encontrouSugestao = await page
                .waitForSelector(
                    ".aura-order-item-sugestao",
                    { state: "visible", timeout: 5000 }
                )
                .then(() => true)
                .catch(() => false);

            if (encontrouSugestao) break;

            await page.waitForTimeout(750);
        }

        assert.equal(
            encontrouSugestao,
            true,
            "Produto Local não apareceu nas sugestões após o carregamento do catálogo"
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

        // Pedidos Executivos V1 — camada modular carregada de forma
        // assíncrona (version.js). Confirma que os sinais agregados
        // (usados pela faixa "Central Hoje") estão disponíveis via o
        // motor real, sem depender de nenhuma consulta nova.
        await page.waitForFunction(() => {
            const sinais = window.AuraOrdersV1?.getSignals?.();
            return Boolean(sinais) && typeof sinais.total === "number";
        }, { timeout: 20000 });

        await page.waitForSelector(
            "#orders-exec-today",
            { state: "visible", timeout: 20000 }
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

        // No viewport desktop deste teste (1440x900), o detalhe deve virar
        // um painel/drawer lateral, com o fundo esmaecido por um backdrop
        // real (não um overlay invisível preso na tela).
        await page.waitForSelector(
            ".aura-orders-v1-detail.orders-exec-drawer",
            { state: "visible", timeout: 10000 }
        );

        await page.waitForSelector(
            ".orders-exec-backdrop.is-visivel",
            { state: "visible", timeout: 10000 }
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

        // Fechar o drawer precisa devolver o fundo ao normal: sem
        // backdrop visível e sem o scroll da página travado.
        await page.waitForFunction(() => {
            const backdrop = document.querySelector(
                ".orders-exec-backdrop"
            );

            return (
                !backdrop ||
                !backdrop.classList.contains("is-visivel")
            ) && !document.body.classList.contains(
                "orders-exec-drawer-open"
            );
        }, { timeout: 10000 });

        // ===== Edição Completa de Pedido Existente V1 =====
        // Reabre o mesmo pedido e edita os campos que, antes desta etapa,
        // eram só leitura: cliente, recebimento e itens.
        await page.click(
            `[data-open-order="${pedidoId}"]`
        );

        await page.waitForSelector(
            "#aura-orders-v1-edit-open",
            { state: "visible", timeout: 15000 }
        );

        await page.click("#aura-orders-v1-edit-open");

        await page.waitForSelector(
            "#aura-orders-v1-edit-customer",
            { state: "visible", timeout: 10000 }
        );

        // Botão Salvar começa desabilitado — nada foi alterado ainda.
        const salvarDesabilitadoAntes = await page.getAttribute(
            "#aura-orders-v1-edit-save",
            "disabled"
        );

        assert.notEqual(
            salvarDesabilitadoAntes,
            null,
            "Salvar edição deveria começar desabilitado sem alterações"
        );

        // Cliente snapshot.
        await page.fill(
            "#aura-orders-v1-edit-customer",
            "Cliente Playwright QA Editado"
        );

        // Recebimento: tipo, CEP, endereço e observações do cliente.
        await page.selectOption(
            "#aura-orders-v1-edit-delivery",
            "entrega"
        );

        await page.fill(
            "#aura-orders-v1-edit-cep",
            "01310-000"
        );

        await page.fill(
            "#aura-orders-v1-edit-address",
            "Av. Paulista, 1000"
        );

        await page.fill(
            "#aura-orders-v1-edit-customer-notes",
            "Deixar com o porteiro."
        );

        // Busca de produto no catálogo dentro da edição: com o único
        // produto seedado já presente no pedido, a busca deve indicar
        // corretamente que não há produto novo pra adicionar (prova que a
        // busca está funcionando e que itens já presentes não duplicam).
        await page.fill(
            "#aura-orders-v1-edit-item-busca",
            "Produto Local"
        );

        await page.waitForFunction(() => {
            const box = document.getElementById(
                "aura-orders-v1-edit-item-resultados"
            );

            return Boolean(
                box &&
                !box.hidden &&
                /Nenhum produto encontrado/.test(box.textContent || "")
            );
        }, { timeout: 10000 });

        await page.fill("#aura-orders-v1-edit-item-busca", "");

        // Alterar quantidade e preço do item existente — subtotal/total
        // devem recalcular ao vivo, sem depender do valor salvo.
        await page.fill(
            ".aura-orders-v1-edit-item-qtd",
            "4"
        );

        await page.dispatchEvent(
            ".aura-orders-v1-edit-item-qtd",
            "change"
        );

        await page.fill(
            ".aura-orders-v1-edit-item-preco",
            "80"
        );

        await page.dispatchEvent(
            ".aura-orders-v1-edit-item-preco",
            "change"
        );

        // Subtotal esperado: 4 x R$ 80,00 = R$ 320,00.
        await page.waitForFunction(() => {
            const subtotal = document.getElementById(
                "aura-orders-v1-edit-subtotal"
            );

            return Boolean(
                subtotal &&
                /320/.test(subtotal.textContent || "")
            );
        }, { timeout: 10000 });

        // Badge de alterações não salvas visível e Salvar habilitado.
        await page.waitForSelector(
            "#aura-orders-v1-edit-dirty:not([hidden])",
            { state: "visible", timeout: 10000 }
        );

        const salvarHabilitado = await page.getAttribute(
            "#aura-orders-v1-edit-save",
            "disabled"
        );

        assert.equal(
            salvarHabilitado,
            null,
            "Salvar edição deveria habilitar com alterações válidas"
        );

        await page.click("#aura-orders-v1-edit-save");

        // Sucesso: volta pro modo leitura (o botão Editar reaparece) e o
        // total do card na tabela reflete os novos itens/subtotal.
        await page.waitForSelector(
            "#aura-orders-v1-edit-open",
            { state: "visible", timeout: 20000 }
        );

        await page.waitForFunction(() => {
            const nome = document.querySelector(
                ".aura-orders-v1-detail-hero p"
            );

            return Boolean(
                nome &&
                nome.textContent.includes(
                    "Cliente Playwright QA Editado"
                )
            );
        }, { timeout: 20000 });

        // Histórico deve ter o novo evento (sem vazar CEP/endereço no
        // texto do resumo).
        await page.waitForFunction(() => {
            return Array.from(
                document.querySelectorAll(
                    ".aura-orders-v1-history article strong"
                )
            ).some(elemento =>
                (elemento.textContent || "").includes(
                    "Dados do pedido editados"
                )
            );
        }, { timeout: 10000 });

        const historicoTexto = await page.textContent(
            ".aura-orders-v1-history"
        );

        assert.doesNotMatch(
            historicoTexto || "",
            /01310-000|Av\. Paulista/,
            "O histórico não deveria expor o endereço completo"
        );

        // Fechar, reabrir e recarregar a página — a edição precisa
        // persistir depois do listener em tempo real E depois de um
        // reload completo (não só em memória).
        await page.click('[data-orders-action="back"]');

        await page.click(
            `[data-open-order="${pedidoId}"]`
        );

        await page.waitForFunction(() => {
            const nome = document.querySelector(
                ".aura-orders-v1-detail-hero p"
            );

            return Boolean(
                nome &&
                nome.textContent.includes(
                    "Cliente Playwright QA Editado"
                )
            );
        }, { timeout: 15000 });

        await page.reload();

        await page.waitForSelector(
            "#view-pedidos.active",
            { state: "visible", timeout: 20000 }
        );

        await page.waitForFunction(() => {
            return Array.from(
                document.querySelectorAll(
                    "[data-open-order]"
                )
            ).some(elemento =>
                (elemento.textContent || "").includes(
                    "Cliente Playwright QA Editado"
                )
            );
        }, { timeout: 20000 });

        // Segunda edição, agora cancelada — nada deve persistir.
        await page.click(
            `[data-open-order="${pedidoId}"]`
        );

        await page.waitForSelector(
            "#aura-orders-v1-edit-open",
            { state: "visible", timeout: 15000 }
        );

        await page.click("#aura-orders-v1-edit-open");

        await page.waitForSelector(
            "#aura-orders-v1-edit-customer",
            { state: "visible", timeout: 10000 }
        );

        await page.fill(
            "#aura-orders-v1-edit-customer",
            "Nome Que Não Deveria Salvar"
        );

        page.once("dialog", dialog => dialog.accept());

        await page.click("#aura-orders-v1-edit-cancel");

        await page.waitForSelector(
            "#aura-orders-v1-edit-open",
            { state: "visible", timeout: 10000 }
        );

        const nomeAposCancelar = await page.textContent(
            ".aura-orders-v1-detail-hero p"
        );

        assert.doesNotMatch(
            nomeAposCancelar || "",
            /Não Deveria Salvar/,
            "Cancelar a edição não deveria persistir a alteração"
        );

        await page.click('[data-orders-action="back"]');

        // ===== Cenário reader: visualiza, mas não edita nem grava =====
        const readerPage = await browser.newPage({
            viewport: { width: 1440, height: 900 }
        });

        const errosReader = coletarErrosConsole(readerPage);

        await loginReal(readerPage, baseUrl, {
            email: "employee.read@local.test",
            senha: "Local123!read"
        });

        await readerPage.evaluate(() => {
            window.ativarAba?.("view-pedidos");
        });

        await readerPage.waitForSelector(
            "#view-pedidos.active",
            { state: "visible", timeout: 15000 }
        );

        await readerPage.waitForFunction(() => {
            return Array.from(
                document.querySelectorAll(
                    "[data-open-order]"
                )
            ).some(elemento =>
                (elemento.textContent || "").includes(
                    "Cliente Playwright QA Editado"
                )
            );
        }, { timeout: 20000 });

        await readerPage.click(
            `[data-open-order="${pedidoId}"]`
        );

        await readerPage.waitForSelector(
            "#aura-orders-v1-detail-status",
            { state: "visible", timeout: 15000 }
        );

        // Reader vê o pedido, mas não tem o botão de edição completa nem
        // controles de gestão habilitados.
        const temBotaoEditar = await readerPage.$(
            "#aura-orders-v1-edit-open"
        );

        assert.equal(
            temBotaoEditar,
            null,
            "Reader não deveria ver o botão Editar pedido"
        );

        const statusDesabilitadoReader = await readerPage.getAttribute(
            "#aura-orders-v1-detail-status",
            "disabled"
        );

        assert.notEqual(
            statusDesabilitadoReader,
            null,
            "Reader não deveria conseguir editar o status do pedido"
        );

        const errosReaderRelevantes = errosReader.filter(
            erro => !ehErroDeRedeExterno(erro)
        );

        assert.deepEqual(
            errosReaderRelevantes,
            [],
            `Erros de console no cenário reader de Pedidos: ` +
            `${JSON.stringify(errosReaderRelevantes)}`
        );

        await readerPage.close();

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
            "subtotal, campos manuais, prazo, tabela atual, detalhe, " +
            "mudança de status, sinais da Central de hoje, drawer " +
            "de Pedidos Executivos V1, edição completa (cliente, " +
            "recebimento, itens, histórico, persistência após reload, " +
            "cancelamento) e cenário reader validados."
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
