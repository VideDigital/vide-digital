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
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
    captureDiagnostics,
    coletarErrosConsole,
    ehErroDeRedeExterno,
    launchBrowser,
    loginReal,
    REPO_ROOT,
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

        // A verificação de overflow usa a LINHA (.aura-sidebar-identity-row),
        // não o cartão inteiro: o cartão contém o glow decorativo
        // (.aura-sidebar-identity-glow), que é position:absolute e se
        // projeta de propósito para fora da área visível (efeito de
        // brilho) — isso infla scrollHeight mesmo com o cartão
        // visualmente compacto e sem nenhum conteúdo real transbordando.
        // A linha não contém o glow (são irmãos, ambos filhos do
        // cartão), então mede só o que realmente precisa caber numa
        // linha só.
        const row = card.querySelector(
            ".aura-sidebar-identity-row"
        );
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
            rowScrollHeight: row ? row.scrollHeight : null,
            rowClientHeight: row ? row.clientHeight : null,
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
        rowScrollHeight,
        rowClientHeight,
        toggleVisivel
    } = medida;

    if (card.height > 64) {
        problemas.push(
            `Identidade da sidebar @ ${viewportNome}: altura do ` +
            `cartão ${card.height.toFixed(1)}px acima do limite de 64px.`
        );
    }

    if (
        rowScrollHeight !== null &&
        rowScrollHeight > rowClientHeight + 4
    ) {
        problemas.push(
            `Identidade da sidebar @ ${viewportNome}: conteúdo da ` +
            "linha transbordando verticalmente (scrollHeight " +
            `${rowScrollHeight} > clientHeight ${rowClientHeight}).`
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

// Overlay mobile do menu (#admin-sidebar.aura-sidebar-mobile-aberto):
// o overlay em si já ocupava 100% da tela, mas nada garantia que os
// blocos internos (identidade, navegação, Status da loja, rodapé de
// conta) esticassem até essa largura — sobrava uma faixa vazia à
// direita. Mede a largura útil real (largura do próprio #admin-sidebar
// menos o padding lateral) e a fração que cada bloco principal ocupa
// dela.
async function medirLargurasSidebarMobile(page) {
    const abriu = await page.evaluate(() => {
        const botao = document.getElementById("mobile-menu-toggle");
        const sidebar = document.getElementById("admin-sidebar");

        if (!botao || !sidebar) {
            return false;
        }

        botao.click();

        return sidebar.classList.contains(
            "aura-sidebar-mobile-aberto"
        );
    });

    if (!abriu) {
        return null;
    }

    await page.waitForTimeout(250);

    const medida = await page.evaluate(() => {
        const sidebar = document.getElementById("admin-sidebar");
        const wrapper = sidebar.querySelector(":scope > div:first-child");
        const identity = sidebar.querySelector(
            ".aura-sidebar-identity-compact"
        );
        const nav = document.getElementById("sidebar-nav");
        const status = document.getElementById("box-atalho");
        const account = document.getElementById("box-logout");

        const estiloSidebar = getComputedStyle(sidebar);
        const paddingLeft = parseFloat(estiloSidebar.paddingLeft) || 0;
        const paddingRight = parseFloat(estiloSidebar.paddingRight) || 0;
        const sidebarBox = sidebar.getBoundingClientRect();
        const usableWidth =
            sidebar.clientWidth - paddingLeft - paddingRight;
        const usableLeft = sidebarBox.left + paddingLeft;
        const usableRight = sidebarBox.right - paddingRight;

        const medirBloco = elemento => {
            if (!elemento) {
                return null;
            }

            const estilo = getComputedStyle(elemento);
            const visivel =
                estilo.display !== "none" &&
                estilo.visibility !== "hidden";

            if (!visivel) {
                return { visivel: false };
            }

            const box = elemento.getBoundingClientRect();

            return {
                visivel: true,
                width: box.width,
                left: box.left,
                right: box.right,
                ratio: usableWidth > 0 ? box.width / usableWidth : null,
                folgaEsquerda: box.left - usableLeft,
                folgaDireita: usableRight - box.right
            };
        };

        return {
            viewportWidth: window.innerWidth,
            sidebarWidth: sidebarBox.width,
            usableWidth,
            paddingLeft,
            paddingRight,
            wrapper: medirBloco(wrapper),
            identity: medirBloco(identity),
            nav: medirBloco(nav),
            status: medirBloco(status),
            account: medirBloco(account)
        };
    });

    return medida;
}

function avaliarLargurasSidebarMobile(medida, viewportNome) {
    const problemas = [];

    if (!medida) {
        problemas.push(
            `Sidebar mobile @ ${viewportNome}: não foi possível abrir ` +
            "o overlay do menu para medir as larguras internas."
        );
        return problemas;
    }

    const blocos = [
        ["wrapper (identidade)", medida.wrapper],
        ["identidade", medida.identity],
        ["navegação", medida.nav],
        ["Status da loja", medida.status],
        ["rodapé de conta", medida.account]
    ];

    for (const [nome, bloco] of blocos) {
        if (!bloco || bloco.visivel === false) {
            continue;
        }

        if (bloco.ratio !== null && bloco.ratio < 0.92) {
            problemas.push(
                `Sidebar mobile @ ${viewportNome}: ${nome} ocupa ` +
                `${(bloco.ratio * 100).toFixed(0)}% da largura útil; ` +
                "esperado >= 92%."
            );
        }

        if (bloco.folgaEsquerda > 12) {
            problemas.push(
                `Sidebar mobile @ ${viewportNome}: ${nome} deixa ` +
                `${bloco.folgaEsquerda.toFixed(1)}px de folga à ` +
                "esquerda da largura útil (esperado <= 12px)."
            );
        }

        if (bloco.folgaDireita > 12) {
            problemas.push(
                `Sidebar mobile @ ${viewportNome}: ${nome} deixa ` +
                `${bloco.folgaDireita.toFixed(1)}px de folga à ` +
                "direita da largura útil (esperado <= 12px) — faixa " +
                "vazia estrutural."
            );
        }
    }

    return problemas;
}

// Trilho interno da sidebar no desktop (>=768px, onde
// dashboard-modules.css transforma #admin-sidebar em display:grid).
// Sem abrir overlay nenhum — no desktop a sidebar já fica visível o
// tempo todo. Mede a mesma coisa que a versão mobile (largura útil
// real vs. largura de cada bloco principal), mas para o layout de
// grid de desktop, que tem uma causa estrutural diferente do overlay.
async function medirLargurasSidebarDesktop(page) {
    return page.evaluate(() => {
        const sidebar = document.getElementById("admin-sidebar");

        if (!sidebar) {
            return null;
        }

        const wrapper = sidebar.querySelector(":scope > div:first-child");
        const identity = sidebar.querySelector(
            ".aura-sidebar-identity-compact"
        );
        const nav = document.getElementById("sidebar-nav");
        const status = document.getElementById("box-atalho");
        const account = document.getElementById("box-logout");

        const estiloSidebar = getComputedStyle(sidebar);
        const paddingLeft = parseFloat(estiloSidebar.paddingLeft) || 0;
        const paddingRight = parseFloat(estiloSidebar.paddingRight) || 0;
        const sidebarBox = sidebar.getBoundingClientRect();
        const usableWidth =
            sidebar.clientWidth - paddingLeft - paddingRight;
        const usableLeft = sidebarBox.left + paddingLeft;
        const usableRight = sidebarBox.right - paddingRight;

        const medirBloco = elemento => {
            if (!elemento) {
                return null;
            }

            const estilo = getComputedStyle(elemento);
            const visivel =
                estilo.display !== "none" &&
                estilo.visibility !== "hidden";

            if (!visivel) {
                return { visivel: false };
            }

            const box = elemento.getBoundingClientRect();

            return {
                visivel: true,
                width: box.width,
                height: box.height,
                left: box.left,
                right: box.right,
                ratio: usableWidth > 0 ? box.width / usableWidth : null,
                folgaEsquerda: box.left - usableLeft,
                folgaDireita: usableRight - box.right
            };
        };

        return {
            viewportWidth: window.innerWidth,
            sidebarDisplay: estiloSidebar.display,
            sidebarWidth: sidebarBox.width,
            usableWidth,
            paddingLeft,
            paddingRight,
            wrapper: medirBloco(wrapper),
            identity: medirBloco(identity),
            nav: medirBloco(nav),
            status: medirBloco(status),
            account: medirBloco(account)
        };
    });
}

function avaliarLargurasSidebarDesktop(medida, viewportNome) {
    const problemas = [];

    if (!medida) {
        problemas.push(
            `Sidebar desktop @ ${viewportNome}: #admin-sidebar não ` +
            "encontrado."
        );
        return problemas;
    }

    const blocos = [
        ["wrapper (identidade)", medida.wrapper],
        ["identidade", medida.identity],
        ["navegação", medida.nav],
        ["Status da loja", medida.status],
        ["rodapé de conta", medida.account]
    ];

    const larguras = [];

    for (const [nome, bloco] of blocos) {
        if (!bloco || bloco.visivel === false) {
            continue;
        }

        larguras.push(bloco.width);

        if (bloco.ratio !== null && bloco.ratio < 0.94) {
            problemas.push(
                `Sidebar desktop @ ${viewportNome}: ${nome} ocupa ` +
                `${(bloco.ratio * 100).toFixed(0)}% da largura útil; ` +
                "esperado >= 94%."
            );
        }

        if (bloco.folgaEsquerda > 12) {
            problemas.push(
                `Sidebar desktop @ ${viewportNome}: ${nome} deixa ` +
                `${bloco.folgaEsquerda.toFixed(1)}px de folga à ` +
                "esquerda da largura útil (esperado <= 12px)."
            );
        }

        if (bloco.folgaDireita > 12) {
            problemas.push(
                `Sidebar desktop @ ${viewportNome}: ${nome} deixa ` +
                `${bloco.folgaDireita.toFixed(1)}px de folga à ` +
                "direita da largura útil (esperado <= 12px) — faixa " +
                "vazia estrutural."
            );
        }
    }

    if (larguras.length >= 2) {
        const diferenca = Math.max(...larguras) - Math.min(...larguras);

        if (diferenca > 16) {
            problemas.push(
                `Sidebar desktop @ ${viewportNome}: diferença de ` +
                `${diferenca.toFixed(1)}px entre as larguras dos ` +
                "blocos principais (esperado <= 16px) — trilho " +
                "desalinhado."
            );
        }
    }

    if (medida.identity && medida.identity.visivel !== false) {
        if (medida.identity.height > 64) {
            problemas.push(
                `Sidebar desktop @ ${viewportNome}: identidade com ` +
                `${medida.identity.height.toFixed(1)}px de altura, ` +
                "acima do limite de 64px."
            );
        }
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
                    tela.nome === "Hub" &&
                    viewportNome === "celular-390"
                ) {
                    const medidaLarguras =
                        await medirLargurasSidebarMobile(page);

                    const diagDir = path.join(
                        REPO_ROOT,
                        "test-results",
                        "ui-diagnostics"
                    );
                    await mkdir(diagDir, { recursive: true });

                    await page.screenshot({
                        path: path.join(
                            diagDir,
                            "sidebar-mobile-390.png"
                        ),
                        fullPage: false
                    }).catch(() => {});

                    await writeFile(
                        path.join(
                            diagDir,
                            "sidebar-mobile-widths.json"
                        ),
                        JSON.stringify(medidaLarguras, null, 2),
                        "utf8"
                    ).catch(() => {});

                    problemas.push(
                        ...avaliarLargurasSidebarMobile(
                            medidaLarguras,
                            viewportNome
                        )
                    );

                    // Fecha o overlay de volta pra não interferir nas
                    // próximas telas/viewports do loop principal.
                    await page.evaluate(() => {
                        const botao = document.getElementById(
                            "mobile-menu-toggle"
                        );
                        const sidebar = document.getElementById(
                            "admin-sidebar"
                        );

                        if (
                            botao &&
                            sidebar?.classList.contains(
                                "aura-sidebar-mobile-aberto"
                            )
                        ) {
                            botao.click();
                        }
                    });

                    await aguardarRender(page);
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

        // Trilho interno da sidebar em desktop largo (768px+, onde
        // dashboard-modules.css liga display:grid no #admin-sidebar):
        // confirma que identidade, navegação, Status da loja e rodapé
        // preenchem a largura útil, não uma coluna implícita estreita
        // com uma faixa vazia sobrando à direita.
        {
            const VIEWPORTS_DESKTOP = {
                "notebook-1366": VIEWPORTS["notebook-1366"],
                "desktop-1440": VIEWPORTS["desktop-1440"],
                "desktop-1920": { width: 1920, height: 900 }
            };

            const diagDir = path.join(
                REPO_ROOT,
                "test-results",
                "ui-diagnostics"
            );
            await mkdir(diagDir, { recursive: true });

            const diagnosticoDesktop = {};

            await fecharCamadasAbertas(page);

            await page.evaluate(id => {
                return typeof window.ativarAba === "function"
                    ? window.ativarAba(id)
                    : false;
            }, "view-dashboard");

            for (const [viewportNome, viewport] of Object.entries(
                VIEWPORTS_DESKTOP
            )) {
                await page.setViewportSize(viewport);
                await aguardarRender(page);

                const medidaDesktop =
                    await medirLargurasSidebarDesktop(page);

                diagnosticoDesktop[viewportNome] = medidaDesktop;

                await page.screenshot({
                    path: path.join(
                        diagDir,
                        `sidebar-desktop-${viewport.width}.png`
                    ),
                    fullPage: false
                }).catch(() => {});

                problemas.push(
                    ...avaliarLargurasSidebarDesktop(
                        medidaDesktop,
                        viewportNome
                    )
                );
            }

            await writeFile(
                path.join(diagDir, "sidebar-desktop-widths.json"),
                JSON.stringify(diagnosticoDesktop, null, 2),
                "utf8"
            ).catch(() => {});

            await page.setViewportSize(VIEWPORTS["desktop-1440"]);
            await aguardarRender(page);
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
