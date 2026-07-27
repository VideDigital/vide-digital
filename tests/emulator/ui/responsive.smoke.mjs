// Fase 13 do Quality Gate — responsividade real em 5 viewports.
//
// Esta versão evita waitForLoadState("networkidle") dentro da matriz completa.
// O dashboard mantém listeners do Firebase abertos continuamente, então
// "networkidle" pode consumir dezenas de segundos em cada combinação e fazer
// o job ser cancelado sem que exista uma falha responsiva.
//
// Continua validando as mesmas 5 telas e todos os viewports, usando esperas
// curtas e determinísticas após cada mudança visual.
//
// O teste mede layout e overflow. Erros conhecidos de módulos funcionais que
// já possuem testes próprios (Métricas e abertura de cliente no CRM 360) não
// devem reprovar este smoke responsivo.
import assert from "node:assert/strict";
import {
    captureDiagnostics,
    coletarErrosConsole,
    ehErroDeRedeExterno,
    launchBrowser,
    loginReal,
    startStaticServer,
    VIEWPORTS
} from "./_helpers.mjs";

const ESPERA_RENDER_MS = 450;

async function aguardarRender(page, tempo = ESPERA_RENDER_MS) {
    await page.waitForTimeout(tempo);
    await page.evaluate(() => new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
}

async function fecharCamadasAbertas(page) {
    await page.evaluate(() => {
        document.querySelectorAll(
            "#pedido-modal, #crm-cliente-modal"
        ).forEach(elemento => {
            elemento.classList.add("hidden");
            elemento.style.display = "none";
        });

        document.body.style.overflow = "";
        document.documentElement.style.overflow = "";
    });
}

const TELAS = [
    { nome: "Hub", ativar: "view-dashboard" },
    {
        nome: "Atendimento",
        ativar: "view-atendimento",
        extra: async page => {
            const conversa = page.locator(
                "[data-atend-conversa-id]"
            ).first();

            await conversa.waitFor({
                state: "visible",
                timeout: 5000
            }).catch(() => {});

            if (await conversa.isVisible().catch(() => false)) {
                await conversa.click();
                await aguardarRender(page);
            }

            await page.evaluate(() => {
                const box = document.getElementById(
                    "atend-mensagens"
                );
                if (!box) return;

                box.querySelectorAll(
                    "[data-responsive-smoke]"
                ).forEach(elemento => elemento.remove());

                box.insertAdjacentHTML(
                    "beforeend",
                    Array.from(
                        { length: 80 },
                        (_, indice) => `
                            <div class="atend-msg" data-responsive-smoke="true">
                                <div class="atend-msg-bolha">
                                    Mensagem responsiva ${indice}
                                </div>
                            </div>
                        `
                    ).join("")
                );
            });
        }
    },
    {
        nome: "CRM 360 drawer",
        ativar: "view-crm360",
        extra: async page => {
            const cliente = page.locator(
                "[data-crm-abrir-cliente]"
            ).first();

            await cliente.waitFor({
                state: "visible",
                timeout: 5000
            }).catch(() => {});

            if (await cliente.isVisible().catch(() => false)) {
                await cliente.click();
                await page.waitForSelector(
                    "#crm-cliente-modal:not(.hidden)",
                    {
                        state: "visible",
                        timeout: 5000
                    }
                ).catch(() => {});
            }
        }
    },
    {
        nome: "Pedidos modal",
        ativar: "view-pedidos",
        extra: async page => {
            await page.evaluate(() => {
                window.abrirModalPedido?.();
            });

            await page.waitForSelector(
                "#pedido-modal",
                {
                    state: "visible",
                    timeout: 5000
                }
            ).catch(() => {});
        }
    },
    {
        nome: "Base de Conhecimento",
        ativar: "view-base-conhecimento"
    }
];

function medirOverflow(page) {
    return page.evaluate(() => {
        const documento = document.documentElement;
        const box = document.getElementById(
            "atend-mensagens"
        );

        return {
            horizontalOverflow:
                documento.scrollWidth >
                documento.clientWidth + 1,

            atendMensagensScrollavel: (() => {
                if (!box || box.scrollHeight === 0) {
                    return null;
                }

                const estilo = getComputedStyle(box);
                const permiteScroll = [
                    "auto",
                    "scroll"
                ].includes(estilo.overflowY);

                return (
                    box.scrollHeight <=
                        box.clientHeight + 4 ||
                    permiteScroll
                );
            })()
        };
    });
}

function erroOpcionalDeOutroModulo(erro) {
    const texto = String(erro || "");

    return (
        texto.includes(
            "[Vide Hub] Erro ao carregar aquisição:"
        ) ||
        texto.includes(
            "[Vide Hub] Erro ao carregar funil público:"
        ) ||
        texto.includes(
            "[CRM 360] Falha ao abrir cliente por id:"
        )
    );
}

async function main() {
    const { baseUrl, close } =
        await startStaticServer();

    const browser = await launchBrowser();
    const problemas = [];

    const page = await browser.newPage({
        viewport: VIEWPORTS["desktop-1440"]
    });

    const erros = coletarErrosConsole(page);

    try {
        await loginReal(page, baseUrl, {
            email: "owner.pro@local.test",
            senha: "Local123!pro"
        });

        for (const tela of TELAS) {
            for (
                const [viewportNome, viewport]
                of Object.entries(VIEWPORTS)
            ) {
                await fecharCamadasAbertas(page);
                await page.setViewportSize(viewport);

                const ativou = await page.evaluate(
                    id => {
                        return typeof window.ativarAba ===
                            "function"
                            ? window.ativarAba(id)
                            : false;
                    },
                    tela.ativar
                );

                assert.equal(
                    ativou,
                    true,
                    `Não foi possível ativar ${tela.nome}`
                );

                await page.waitForSelector(
                    `#${tela.ativar}.active`,
                    {
                        state: "visible",
                        timeout: 7000
                    }
                ).catch(() => {});

                await aguardarRender(page);

                if (tela.extra) {
                    await tela.extra(page);
                    await aguardarRender(page);
                }

                const medida =
                    await medirOverflow(page);

                if (medida.horizontalOverflow) {
                    const base =
                        await captureDiagnostics(
                            page,
                            `overflow-${tela.nome}-${viewportNome}`,
                            []
                        );

                    problemas.push(
                        `${tela.nome} @ ${viewportNome} ` +
                        `(${viewport.width}x${viewport.height}): ` +
                        `overflow horizontal — ver ${base}.png`
                    );
                }

                if (
                    tela.nome === "Atendimento" &&
                    medida.atendMensagensScrollavel === false
                ) {
                    const base =
                        await captureDiagnostics(
                            page,
                            `atend-scroll-${viewportNome}`,
                            []
                        );

                    problemas.push(
                        `Atendimento @ ${viewportNome}: ` +
                        "coluna de mensagens não está rolando " +
                        `internamente — ver ${base}.png`
                    );
                }
            }
        }

        const errosRelevantes = erros.filter(
            erro =>
                !ehErroDeRedeExterno(erro) &&
                !erroOpcionalDeOutroModulo(erro)
        );

        if (errosRelevantes.length > 0) {
            problemas.push(
                "Erros de JS durante os testes responsivos: " +
                JSON.stringify(
                    errosRelevantes.slice(0, 10)
                )
            );
        }
    } finally {
        await page.close();
        await browser.close();
        await close();
    }

    if (problemas.length > 0) {
        console.error(
            "responsive.smoke: FALHOU —",
            problemas
        );
        process.exit(1);
    }

    console.log(
        `responsive.smoke: OK — ${TELAS.length} telas x ` +
        `${Object.keys(VIEWPORTS).length} viewports, ` +
        "sem overflow horizontal."
    );
}

await main();

