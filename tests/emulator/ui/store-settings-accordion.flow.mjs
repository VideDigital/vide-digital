// Bug real reportado: os cards 07 "Layout da Vitrine", 08 "Controle
// de Aparência" e 09 "Links de Rastreamento" apareciam recolhidos e
// não abriam de forma confiável pela seta do próprio card — só
// abriam clicando no botão correspondente no Painel de Configuração
// superior. store-settings-executive-v1.js foi refatorado pra usar
// um único caminho idempotente (definirAreaExpandida) tanto pela seta
// quanto pelo painel superior; este teste garante que os dois
// caminhos sempre terminam no mesmo estado, para as nove áreas, em
// desktop e mobile.
import assert from "node:assert/strict";
import {
    captureDiagnostics,
    coletarErrosConsole,
    ehErroDeRedeExterno,
    launchBrowser,
    loginReal,
    startStaticServer
} from "./_helpers.mjs";

const AREAS = [
    "identidade",
    "banners-config",
    "redes-sociais",
    "links-destaque",
    "carrinho-config",
    "chat-config",
    "layout-vitrine",
    "aparencia-cores",
    "links-utm"
];

async function ativarConfiguracoes(page) {
    const ativou = await page.evaluate(() => {
        return typeof window.ativarAba === "function"
            ? window.ativarAba("view-perfil")
            : false;
    });

    assert.equal(
        ativou,
        true,
        "Não foi possível ativar view-perfil"
    );

    await page.waitForSelector(
        "#view-perfil.active",
        { state: "visible", timeout: 15000 }
    );

    // store-settings-executive-v1.js monta o painel/topbars via
    // polling (até 40 tentativas de 150ms) — espera a última área
    // (a mais sensível ao bug original) ganhar sua topbar antes de
    // interagir com qualquer botão.
    await page.waitForSelector(
        '[data-block-id="links-utm"] .store-settings-section-topbar',
        { state: "attached", timeout: 10000 }
    );
}

function estadoDaArea(page, id) {
    return page.evaluate(areaId => {
        const bloco = document.querySelector(
            `[data-block-id="${areaId}"]`
        );

        const botao = bloco?.querySelector(
            "[data-settings-toggle]"
        );

        const passo = document.querySelector(
            `[data-settings-step="${areaId}"]`
        );

        if (!bloco || !botao) {
            return null;
        }

        return {
            isCollapsed: bloco.classList.contains(
                "is-collapsed"
            ),
            botaoAriaExpanded: botao.getAttribute(
                "aria-expanded"
            ),
            passoAriaExpanded: passo?.getAttribute(
                "aria-expanded"
            ) ?? null,
            blocoTemId: Boolean(bloco.id),
            botaoAriaControls: botao.getAttribute(
                "aria-controls"
            )
        };
    }, id);
}

async function testarArea(page, id, viewportRotulo) {
    const seletorToggle =
        `[data-block-id="${id}"] [data-settings-toggle]`;
    const seletorPasso =
        `[data-settings-step="${id}"]`;

    // 1. Recolher (estado conhecido, não importa o estado atual).
    let estado = await estadoDaArea(page, id);

    assert.ok(
        estado,
        `Área "${id}" @ ${viewportRotulo}: bloco/botão não ` +
        "encontrados no DOM."
    );

    if (!estado.isCollapsed) {
        await page.click(seletorToggle);
        await page.waitForTimeout(120);
    }

    estado = await estadoDaArea(page, id);

    assert.equal(
        estado.isCollapsed,
        true,
        `Área "${id}" @ ${viewportRotulo}: deveria estar recolhida ` +
        `após clicar na seta, mas não está — ${JSON.stringify(estado)}`
    );

    assert.equal(
        estado.botaoAriaExpanded,
        "false",
        `Área "${id}" @ ${viewportRotulo}: aria-expanded deveria ` +
        `ser "false" recolhida — ${JSON.stringify(estado)}`
    );

    // 2. Abrir pela seta do próprio card — o caminho que estava
    // quebrado para 07/08/09.
    await page.click(seletorToggle);
    await page.waitForTimeout(120);

    estado = await estadoDaArea(page, id);

    assert.equal(
        estado.isCollapsed,
        false,
        `Área "${id}" @ ${viewportRotulo}: não abriu pela seta do ` +
        `próprio card — ${JSON.stringify(estado)}`
    );

    assert.equal(
        estado.botaoAriaExpanded,
        "true",
        `Área "${id}" @ ${viewportRotulo}: aria-expanded deveria ` +
        `ser "true" aberta pela seta — ${JSON.stringify(estado)}`
    );

    assert.ok(
        estado.blocoTemId && estado.botaoAriaControls,
        `Área "${id}" @ ${viewportRotulo}: botão sem aria-controls ` +
        `apontando pra um id estável — ${JSON.stringify(estado)}`
    );

    // 3. Recolher de novo pela seta.
    await page.click(seletorToggle);
    await page.waitForTimeout(120);

    estado = await estadoDaArea(page, id);

    assert.equal(
        estado.isCollapsed,
        true,
        `Área "${id}" @ ${viewportRotulo}: não recolheu de volta ` +
        `pela seta — ${JSON.stringify(estado)}`
    );

    // 4. Abrir pelo painel de configuração superior — o caminho que
    // sempre funcionou. Precisa terminar no MESMO estado do passo 2.
    await page.click(seletorPasso);
    await page.waitForTimeout(650);

    estado = await estadoDaArea(page, id);

    assert.equal(
        estado.isCollapsed,
        false,
        `Área "${id}" @ ${viewportRotulo}: painel superior não abriu ` +
        `a área — ${JSON.stringify(estado)}`
    );

    assert.equal(
        estado.botaoAriaExpanded,
        "true",
        `Área "${id}" @ ${viewportRotulo}: aria-expanded do botão ` +
        `local deveria acompanhar o painel superior — ` +
        `${JSON.stringify(estado)}`
    );

    assert.equal(
        estado.passoAriaExpanded,
        "true",
        `Área "${id}" @ ${viewportRotulo}: aria-expanded do passo do ` +
        `painel superior não sincronizou — ${JSON.stringify(estado)}`
    );
}

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

        await ativarConfiguracoes(page);

        for (const id of AREAS) {
            await testarArea(page, id, "desktop-1440");
        }

        await page.setViewportSize({
            width: 390,
            height: 844
        });

        await page.waitForTimeout(300);

        for (const id of ["layout-vitrine", "aparencia-cores", "links-utm"]) {
            await testarArea(page, id, "celular-390");
        }

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
            "store-settings-accordion.flow: OK — nove áreas abrem " +
            "e recolhem de forma consistente pela seta e pelo painel " +
            "superior (desktop e mobile)."
        );
    } catch (error) {
        falhou = true;

        await captureDiagnostics(
            page,
            "store-settings-accordion-flow",
            erros.filter(erro => !ehErroDeRedeExterno(erro))
        );

        console.error(
            "store-settings-accordion.flow: FALHOU —",
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
