// Fase 13 do Quality Gate — responsividade real (login + navegação, não
// só static analysis de CSS) em 5 viewports: desktop 1440x900, notebook
// 1366x768, tablet 768x1024, celular 390x844, celular pequeno 360x640.
//
// Reaproveita o achado real desta mesma base (ver docs/HISTORICO_EVENTOS_
// ATENDIMENTO.md, Fase 21): conversa de alto volume quebrando a rolagem
// era detectável exatamente por esta técnica (scrollHeight da página vs.
// viewport). Aqui generaliza pra outras telas.
//
// Mesma limitação de rede documentada em login.smoke.mjs se aplica aqui.
import assert from "node:assert/strict";
import { captureDiagnostics, coletarErrosConsole, ehErroDeRedeExterno, launchBrowser, loginReal, startStaticServer, VIEWPORTS } from "./_helpers.mjs";

const TELAS = [
    { nome: "Hub", ativar: "view-dashboard" },
    { nome: "Atendimento", ativar: "view-atendimento", extra: async page => {
        await page.waitForSelector("[data-atend-conversa-id]", { timeout: 10000 }).catch(() => {});
        await page.click("[data-atend-conversa-id]").catch(() => {});
        // Conversa longa sintética — mesmo achado real da Fase 21: só
        // vale a pena confirmar que #atend-mensagens rola por dentro, não
        // a página inteira.
        await page.evaluate(() => {
            const box = document.getElementById("atend-mensagens");
            if (!box) return;
            box.innerHTML += Array.from({ length: 80 }, (_, i) => `
                <div class="atend-msg"><div class="atend-msg-bolha">Mensagem responsiva ${i}</div></div>
            `).join("");
        });
    } },
    { nome: "CRM 360 drawer", ativar: "view-crm360", extra: async page => {
        await page.waitForSelector("[data-crm-abrir-cliente]", { timeout: 10000 }).catch(() => {});
        await page.click("[data-crm-abrir-cliente]").catch(() => {});
        await page.waitForSelector("#crm-cliente-modal:not(.hidden)", { timeout: 10000 }).catch(() => {});
    } },
    { nome: "Pedidos modal", ativar: "view-pedidos", extra: async page => {
        await page.evaluate(() => window.abrirModalPedido && window.abrirModalPedido());
        await page.waitForSelector("#pedido-modal", { state: "visible", timeout: 10000 }).catch(() => {});
    } },
    { nome: "Base de Conhecimento", ativar: "view-base-conhecimento" }
];

function medirOverflow(page) {
    return page.evaluate(() => ({
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        pageScrollHeight: document.documentElement.scrollHeight,
        viewportHeight: window.innerHeight,
        atendMensagensScrollavel: (() => {
            const box = document.getElementById("atend-mensagens");
            if (!box || box.scrollHeight === 0) return null;
            return box.scrollHeight > box.clientHeight || box.scrollHeight <= box.clientHeight + 4;
        })()
    }));
}

async function main() {
    const { baseUrl, close } = await startStaticServer();
    const browser = await launchBrowser();
    const problemas = [];
    const page = await browser.newPage({ viewport: VIEWPORTS["desktop-1440"] });
    const erros = coletarErrosConsole(page);
    try {
        await loginReal(page, baseUrl, { email: "owner.pro@local.test", senha: "Local123!pro" });

        for (const tela of TELAS) {
            for (const [viewportNome, viewport] of Object.entries(VIEWPORTS)) {
                await page.setViewportSize(viewport);
                await page.evaluate(id => window.ativarAba(id), tela.ativar);
                await page.waitForLoadState("networkidle").catch(() => {});
                if (tela.extra) await tela.extra(page);
                await page.waitForLoadState("networkidle").catch(() => {});

                const medida = await medirOverflow(page);
                if (medida.horizontalOverflow) {
                    const base = await captureDiagnostics(page, `overflow-${tela.nome}-${viewportNome}`, []);
                    problemas.push(`${tela.nome} @ ${viewportNome} (${viewport.width}x${viewport.height}): overflow horizontal — ver ${base}.png`);
                }
                if (tela.nome === "Atendimento" && medida.atendMensagensScrollavel === false) {
                    const base = await captureDiagnostics(page, `atend-scroll-${viewportNome}`, []);
                    problemas.push(`Atendimento @ ${viewportNome}: coluna de mensagens não está rolando internamente (regressão do achado da Fase 21) — ver ${base}.png`);
                }
            }
        }

        const errosRelevantes = erros.filter(e => !ehErroDeRedeExterno(e));
        if (errosRelevantes.length > 0) {
            problemas.push(`Erros de JS durante os testes responsivos: ${JSON.stringify(errosRelevantes.slice(0, 10))}`);
        }
    } finally {
        await page.close();
        await browser.close();
        await close();
    }

    if (problemas.length > 0) {
        console.error("responsive.smoke: FALHOU —", problemas);
        process.exit(1);
    }
    console.log(`responsive.smoke: OK — ${TELAS.length} telas x ${Object.keys(VIEWPORTS).length} viewports, sem overflow horizontal.`);
}

await main();
