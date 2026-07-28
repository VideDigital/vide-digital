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
// Com CRM 360 e permissões de Métricas corrigidos, o smoke responsivo volta
// a reprovar qualquer erro de JavaScript relevante encontrado durante a
// matriz de telas e viewports.
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

// Faixa horizontal compacta da identidade da sidebar (topo do
// #admin-sidebar) — confirma card em uma linha só, altura contida e
// visibilidade correta do botão de menu mobile por viewport. Tolerância
// generosa de propósito: o objetivo é travar regressões grandes de
// layout, não exigir pixel exato.
function medirIdentidadeSidebar(page) {
    return page.evaluate(() => {
        const card = document.querySelector(
            "#admin-sidebar .aura-sidebar-identity-compact"
        );

        if (!card) {
            return null;
        }

        const logo = card.querySelector(
            "#admin-logo-box, .aura-sidebar-logo"
        );
        const brand = card.querySelector(
            ".aura-sidebar-brand-name"
        );
        const workspace = card.querySelector(
            ".aura-sidebar-workspace-name"
        );
        const status = card.querySelector(
            ".aura-sidebar-status-pill"
        );
        const toggle = document.getElementById(
            "mobile-menu-toggle"
        );

        const caixa = elemento => elemento
            ? elemento.getBoundingClientRect()
            : null;

        const toggleVisivel = (() => {
            if (!toggle) {
                return null;
            }

            const estilo = getComputedStyle(toggle);
            const box = toggle.getBoundingClientRect();

            return (
                estilo.display !== "none" &&
                estilo.visibility !== "hidden" &&
                box.width > 0 &&
                box.height > 0
            );
        })();

        return {
            card: caixa(card),
            logo: caixa(logo),
            brand: caixa(brand),
            workspace: caixa(workspace),
            status: caixa(status),
            cardScrollHeight: card.scrollHeight,
            cardClientHeight: card.clientHeight,
            toggleVisivel
        };
    });
}

function avaliarIdentidadeSidebar(
    medida,
    viewportNome,
    viewportLargura
) {
    const problemas = [];

    if (!medida || !medida.card) {
        problemas.push(
            `Identidade da sidebar @ ${viewportNome}: ` +
            "cartão .aura-sidebar-identity-compact não encontrado."
        );
        return problemas;
    }

    const {
        card,
        logo,
        brand,
        workspace,
        status,
        cardScrollHeight,
        cardClientHeight,
        toggleVisivel
    } = medida;

    if (card.height > 64) {
        problemas.push(
            `Identidade da sidebar @ ${viewportNome}: altura do ` +
            `cartão ${card.height.toFixed(1)}px acima do limite de 64px.`
        );
    }

    if (cardScrollHeight > cardClientHeight + 4) {
        problemas.push(
            `Identidade da sidebar @ ${viewportNome}: conteúdo ` +
            `transbordando verticalmente (scrollHeight ` +
            `${cardScrollHeight} > clientHeight ${cardClientHeight}).`
        );
    }

    const centrosVerticais = [logo, brand, status]
        .filter(Boolean)
        .map(caixa => caixa.top + caixa.height / 2);

    if (centrosVerticais.length >= 2) {
        const maiorDiferenca =
            Math.max(...centrosVerticais) -
            Math.min(...centrosVerticais);

        if (maiorDiferenca > 18) {
            problemas.push(
                `Identidade da sidebar @ ${viewportNome}: centros ` +
                "verticais de logo/marca/status desalinhados " +
                `(diferença de ${maiorDiferenca.toFixed(1)}px).`
            );
        }
    }

    if (brand && workspace) {
        const diferencaTopo = Math.abs(
            brand.top - workspace.top
        );

        if (diferencaTopo > 12) {
            problemas.push(
                `Identidade da sidebar @ ${viewportNome}: "Vide Hub" ` +
                'e "Minha Empresa" não parecem estar na mesma linha ' +
                `(diferença de topo ${diferencaTopo.toFixed(1)}px).`
            );
        }
    }

    const esperaToggleVisivel = viewportLargura < 768;

    if (
        toggleVisivel !== null &&
        toggleVisivel !== esperaToggleVisivel
    ) {
        problemas.push(
            `Identidade da sidebar @ ${viewportNome}: botão de menu ` +
            `mobile ${toggleVisivel ? "visível" : "oculto"}, ` +
            `esperado ${esperaToggleVisivel ? "visível" : "oculto"} ` +
            `para largura ${viewportLargura}px.`
        );
    }

    return problemas;
}

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

                if (tela.nome === "Hub") {
                    const medidaIdentidade =
                        await medirIdentidadeSidebar(page);

                    problemas.push(
                        ...avaliarIdentidadeSidebar(
                            medidaIdentidade,
                            viewportNome,
                            viewport.width
                        )
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

        // Ctrl+K continua abrindo a Aura Command Center (não foi tocada
        // nesta missão, só a identidade da sidebar) e a sessão de Auth
        // segue intacta depois de toda a matriz de telas/viewports.
        await fecharCamadasAbertas(page);
        await page.setViewportSize(VIEWPORTS["desktop-1440"]);

        await page.evaluate(id => {
            return typeof window.ativarAba === "function"
                ? window.ativarAba(id)
                : false;
        }, "view-dashboard");

        await aguardarRender(page);

        await page.keyboard.press("Control+k");

        const commandCenterAbriu = await page.waitForSelector(
            "#aura-command-modal:not(.hidden)",
            { state: "visible", timeout: 5000 }
        ).then(() => true).catch(() => false);

        if (!commandCenterAbriu) {
            problemas.push(
                "Ctrl+K não abriu a Aura Command Center " +
                "(#aura-command-modal) depois do ajuste na identidade " +
                "da sidebar."
            );
        } else {
            await page.keyboard.press("Escape");
            await aguardarRender(page);
        }

        const authIntacto = await page.evaluate(() => {
            return (
                typeof window.__videHubContextInitialized ===
                    "function" &&
                window.__videHubContextInitialized() === true
            );
        });

        if (!authIntacto || !/dashboard\.html/.test(page.url())) {
            problemas.push(
                "Sessão de Auth não parece mais intacta depois da " +
                "matriz responsiva (esperado continuar em " +
                "dashboard.html com o contexto do tenant inicializado)."
            );
        }

        const errosRelevantes = erros.filter(
            erro => !ehErroDeRedeExterno(erro)
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
