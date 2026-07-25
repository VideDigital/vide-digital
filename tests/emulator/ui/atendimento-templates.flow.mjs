// Estabilização V1 — Quality Gate de Atendimento e Templates.
// O teste valida o fluxo real do owner no Emulator, mas agora diferencia:
// 1) falha ao ativar a view;
// 2) view ativa, porém layout oculto;
// 3) dados seedados não carregados;
// 4) falha funcional dentro da conversa ou dos templates.
import assert from "node:assert/strict";
import {
    captureDiagnostics,
    coletarErrosConsole,
    ehErroDeRedeExterno,
    launchBrowser,
    loginReal,
    startStaticServer
} from "./_helpers.mjs";

async function ativarAtendimento(page) {
    const resultado = await page.evaluate(() => {
        if (typeof window.ativarAba !== "function") {
            return {
                ativou: false,
                motivo: "window.ativarAba não está disponível"
            };
        }

        const ativou = window.ativarAba("view-atendimento");
        const view = document.getElementById("view-atendimento");

        return {
            ativou,
            existe: Boolean(view),
            classes: view?.className || "",
            hidden: Boolean(view?.hidden),
            ariaHidden: view?.getAttribute("aria-hidden")
        };
    });

    assert.equal(
        resultado.ativou,
        true,
        `A Central de Atendimento não foi ativada: ${JSON.stringify(resultado)}`
    );

    await page.waitForFunction(() => {
        const view = document.getElementById("view-atendimento");
        if (!view) return false;

        const estilo = window.getComputedStyle(view);
        return (
            view.classList.contains("active") &&
            !view.hidden &&
            estilo.display !== "none" &&
            estilo.visibility !== "hidden"
        );
    }, { timeout: 15000 });

    await page.waitForFunction(() => {
        const layout = document.getElementById("atend-layout");
        if (!layout) return false;

        // O desktop usa as três colunas; no layout em etapas a abertura
        // inicial correta é sempre a lista de conversas.
        if (window.innerWidth <= 1024) {
            layout.setAttribute("data-atend-etapa", "lista");
        }

        const coluna = document.querySelector(
            "#atend-layout .atend-coluna.atend-col-lista"
        );
        if (!coluna) return false;

        const estilo = window.getComputedStyle(coluna);
        return estilo.display !== "none" && estilo.visibility !== "hidden";
    }, { timeout: 15000 });
}

async function esperarConversaSeedada(page) {
    await page.waitForFunction(() => {
        const lista = document.getElementById("atend-lista-conversas");
        if (!lista) return false;

        const estilo = window.getComputedStyle(lista);
        const visivel =
            estilo.display !== "none" &&
            estilo.visibility !== "hidden" &&
            lista.getClientRects().length > 0;

        if (!visivel) return false;

        return Boolean(
            lista.querySelector("[data-atend-conversa-id]")
        );
    }, { timeout: 20000 }).catch(async () => {
        const diagnostico = await page.evaluate(() => {
            const view = document.getElementById("view-atendimento");
            const layout = document.getElementById("atend-layout");
            const coluna = document.querySelector(
                "#atend-layout .atend-coluna.atend-col-lista"
            );
            const lista = document.getElementById("atend-lista-conversas");

            const resumir = elemento => {
                if (!elemento) return null;
                const estilo = window.getComputedStyle(elemento);
                return {
                    id: elemento.id || "",
                    classes: elemento.className || "",
                    hidden: Boolean(elemento.hidden),
                    display: estilo.display,
                    visibility: estilo.visibility,
                    opacity: estilo.opacity,
                    largura: elemento.getBoundingClientRect().width,
                    altura: elemento.getBoundingClientRect().height,
                    texto: (elemento.textContent || "").trim().slice(0, 300)
                };
            };

            return {
                viewport: {
                    width: window.innerWidth,
                    height: window.innerHeight
                },
                view: resumir(view),
                layout: resumir(layout),
                etapa: layout?.getAttribute("data-atend-etapa") || "",
                coluna: resumir(coluna),
                lista: resumir(lista),
                quantidadeConversas: lista?.querySelectorAll(
                    "[data-atend-conversa-id]"
                ).length || 0,
                contexto: typeof window.VideHubContext?.getSnapshot === "function"
                    ? window.VideHubContext.getSnapshot()
                    : null
            };
        });

        throw new Error(
            `A conversa seedada não ficou visível na Central de Atendimento. ` +
            `Diagnóstico: ${JSON.stringify(diagnostico)}`
        );
    });
}

async function main() {
    const { baseUrl, close } = await startStaticServer();
    const browser = await launchBrowser();
    let falhou = false;

    // Viewport explícito: esse fluxo valida primeiro a experiência desktop
    // de três colunas. A responsividade possui uma suíte própria.
    const page = await browser.newPage({
        viewport: { width: 1440, height: 900 }
    });

    const erros = coletarErrosConsole(page);

    try {
        await loginReal(page, baseUrl, {
            email: "owner.pro@local.test",
            senha: "Local123!pro"
        });

        await ativarAtendimento(page);
        await esperarConversaSeedada(page);
        await page.waitForLoadState("networkidle").catch(() => {});

        // Selecionar a conversa seedada e carregar mensagens/eventos.
        await page.click(
            "#atend-lista-conversas [data-atend-conversa-id]"
        );

        await page.waitForSelector(
            "#atend-resposta-input",
            { state: "visible", timeout: 15000 }
        );

        // Responder a conversa e confirmar a mensagem enviada.
        const textoResposta = `Resposta automatizada QA ${Date.now()}`;

        await page.fill("#atend-resposta-input", textoResposta);
        await page.click("#atend-form-resposta button[type=submit]");

        await page.waitForFunction(texto => {
            return Array.from(
                document.querySelectorAll("#atend-mensagens *")
            ).some(elemento =>
                (elemento.textContent || "").includes(texto)
            );
        }, textoResposta, { timeout: 20000 });

        // Alterar status e confirmar o valor refletido.
        await page.selectOption(
            "#atend-status-select",
            "resolvida"
        ).catch(async () => {
            const opcoes = await page.$$eval(
                "#atend-status-select option",
                elementos => elementos.map(opcao => opcao.value)
            );

            throw new Error(
                `Não consegui selecionar status "resolvida"; ` +
                `opções disponíveis: ${JSON.stringify(opcoes)}`
            );
        });

        await page.waitForFunction(() => {
            return document.getElementById(
                "atend-status-select"
            )?.value === "resolvida";
        }, { timeout: 15000 });

        // Abrir seletor e usar template seedado.
        await page.click("#atend-btn-templates");

        await page.waitForSelector(
            "#atend-templates-modal:not(.hidden)",
            { state: "visible", timeout: 15000 }
        );

        await page.fill(
            "#atend-templates-busca",
            "Saudação"
        );

        await page.waitForSelector(
            "[data-atend-template-id]",
            { state: "visible", timeout: 15000 }
        );

        await page.click("[data-atend-template-id]");

        await page.waitForFunction(() => {
            const valor = document.getElementById(
                "atend-resposta-input"
            )?.value || "";

            return valor.length > 0;
        }, { timeout: 15000 });

        const valorAposTemplate = await page.inputValue(
            "#atend-resposta-input"
        );

        assert.ok(
            valorAposTemplate.length > 0,
            "Usar o template deveria preencher o campo de resposta"
        );

        console.log(
            "atendimento.flow: OK — ativação da view, conversa, " +
            "resposta, status e uso de template validados."
        );

        // Gestão de templates: o seletor fecha após inserir um template,
        // portanto precisa ser aberto novamente.
        await page.click("#atend-btn-templates");

        await page.waitForSelector(
            "#atend-templates-modal:not(.hidden)",
            { state: "visible", timeout: 15000 }
        );

        await page.click("#atend-btn-gerenciar-templates");

        await page.waitForSelector(
            "#atend-gestao-btn-novo",
            { state: "visible", timeout: 15000 }
        );

        // Criar novo template.
        await page.click("#atend-gestao-btn-novo");

        await page.waitForSelector(
            "#atend-tpl-titulo",
            { state: "visible", timeout: 15000 }
        );

        const tituloNovo = `Template QA ${Date.now()}`;

        await page.fill("#atend-tpl-titulo", tituloNovo);
        await page.fill(
            "#atend-tpl-mensagem",
            "Mensagem de teste automatizado, olá {{nome_cliente}}."
        );

        await page.click(
            "#atend-tpl-form button[type=submit]"
        );

        await page.waitForFunction(titulo => {
            const lista = document.getElementById(
                "atend-gestao-tpl-lista"
            );

            return lista && (
                lista.textContent || ""
            ).includes(titulo);
        }, tituloNovo, { timeout: 20000 }).catch(() => {
            throw new Error(
                `Template "${tituloNovo}" não apareceu em ` +
                `#atend-gestao-tpl-lista após salvar`
            );
        });

        const errosRelevantes = erros.filter(
            erro => !ehErroDeRedeExterno(erro)
        );

        assert.deepEqual(
            errosRelevantes,
            [],
            `Erros de console durante o fluxo: ` +
            `${JSON.stringify(errosRelevantes)}`
        );

        console.log(
            "templates.flow: OK — criação de template " +
            "pela gestão validada."
        );
    } catch (error) {
        falhou = true;

        await captureDiagnostics(
            page,
            "atendimento-templates-flow",
            erros.filter(erro => !ehErroDeRedeExterno(erro))
        );

        console.error(
            "atendimento-templates.flow: FALHOU —",
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
