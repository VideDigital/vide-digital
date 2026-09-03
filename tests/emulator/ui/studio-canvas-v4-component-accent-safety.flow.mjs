// PR72-FOLLOWUP-REMAINING-COLOR-SINKS-HARDENING — prova em DOM/parser REAL
// de navegador (Playwright/Chromium) de que o painel "Componentes" do
// Studio V4 (studio-canvas-v4.js: renderComponentsPanel(), alimentado por
// studio-components-v4.js: createFromSelection()) nunca aplica uma
// declaração CSS injetada nem materializa um attribute breakout ativo a
// partir de component.accent — mesmo achado documentado no diagnóstico
// read-only PR72-FOLLOWUP-STUDIO-CSS-SINK-AUDIT-001 (mesma sessão).
//
// Sem Firebase/login/CDN externo (mesma técnica de
// studio-standalone-export-dom-safety.flow.mjs): injeta o TEXTO REAL
// (extraído por marcador, nunca reimplementado) de:
//   - studio-inspector.js: controlColor()/bindControls()/updateField()
//     (prova o WRITE PATH real: campo de texto livre ao lado do seletor
//     de cor nativo grava em block.design.corFundo sem validação de
//     formato — não precisa de devtools).
//   - studio-canvas-v4.js: getSelectedBlocks()/renderComponentsPanel().
//   - studio-components-v4.js: createFromSelection()/load()/save().
// Cada função é chamada REAL, na mesma composição que o produto usa
// (window.AuraCanvasV4/window.AuraComponentsV4), nunca reimplementada.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { launchBrowser, REPO_ROOT, startStaticServer } from "./_helpers.mjs";

const CSS_INJECTION_PAYLOAD = "#000000;position:fixed;inset:0;z-index:999999";
const ATTR_BREAKOUT_PAYLOAD = '#000000"><img src=x onerror="window.__remainingColorSinkXss=1">';

function extrair(fonte, inicio, fim) {
    const i = fonte.indexOf(inicio);
    assert.ok(i > -1, `não encontrei "${inicio}"`);
    const f = fonte.indexOf(fim, i);
    assert.ok(f > i, `não encontrei o fim de "${inicio}" (procurando "${fim}")`);
    return fonte.slice(i, f);
}

async function main() {
    const relatorio = {};
    let falhou = false;
    const { baseUrl, close } = await startStaticServer();
    const browser = await launchBrowser();
    const page = await browser.newPage();
    const pageerrors = [];
    page.on("pageerror", (e) => pageerrors.push(String(e && e.stack ? e.stack : e)));

    try {
        // Origem HTTP real (não about:blank) — localStorage exige origem
        // não-opaca. Navega pra um caminho inexistente (404 do próprio
        // servidor estático) só pra estabelecer a origem — evita carregar
        // qualquer script real de produção (index.html dispararia imports
        // do Firebase, que falham por bloqueio de rede do CDN e podem
        // gerar pageerror assíncrono não relacionado a este teste).
        await page.goto(`${baseUrl}/__origin_only_no_product_script__`, { waitUntil: "load" });
        await page.setContent("<!doctype html><html><body></body></html>");

        const inspectorSrc = await readFile(path.join(REPO_ROOT, "studio-inspector.js"), "utf8");
        const canvasSrc = await readFile(path.join(REPO_ROOT, "studio-canvas-v4.js"), "utf8");
        const componentsSrc = await readFile(path.join(REPO_ROOT, "studio-components-v4.js"), "utf8");

        const inspectorHeader = extrair(inspectorSrc, "const state = {", "function renderEmpty() {");
        const inspectorControlColor = extrair(inspectorSrc, "function controlColor(label, path, value, fallback) {", "function controlRange(label, path, value, min, max, unit) {");
        const inspectorBindControls = extrair(inspectorSrc, "function bindControls() {", "function runAction(action) {");
        await page.addScriptTag({
            content: `
                window.__inspectorReal = (function () {
                    ${inspectorHeader}
                    ${inspectorControlColor}
                    ${inspectorBindControls}
                    function render() {} // stub: só o efeito colateral em design.corFundo importa aqui
                    return { state, updateField, controlColor, bindControls, ensureDesign, getSelectedBlock };
                })();
            `
        });

        const canvasHeader = extrair(canvasSrc, "const $ = (selector, root)", "function getModal() {");
        const canvasSelection = extrair(canvasSrc, "function getBlocks() {", "function isEditorOpen() {");
        const canvasPanelHeading = extrair(canvasSrc, "function panelHeading(eyebrow, title, text) {", "function libraryResults() {");
        const canvasEscapeHTML = extrair(canvasSrc, "function escapeHTML(value) {", "function bindCanvas() {");
        const canvasRenderComponentsPanel = extrair(canvasSrc, "function renderComponentsPanel(root) {", "function renderHistoryPanel(root) {");
        await page.addScriptTag({
            content: `
                window.__canvasV4Real = (function () {
                    ${canvasHeader}
                    ${canvasSelection}
                    ${canvasPanelHeading}
                    ${canvasEscapeHTML}
                    ${canvasRenderComponentsPanel}
                    function closePanel() {} // stub: só clicado em "Inserir", não exercido aqui
                    return { state, getSelectedBlocks, renderComponentsPanel };
                })();
            `
        });

        const componentsBody = extrair(componentsSrc, "const KEY = \"aura_studio_components_v4\";", "function selectedPageId() {");
        await page.addScriptTag({
            content: `
                window.__componentsV4Real = (function () {
                    ${componentsBody}
                    return { state, createFromSelection, load };
                })();
            `
        });

        await page.evaluate(() => {
            window.lpEditorBlocos = [{
                id: "b1", lpId: "lp_diag", donoUID: "owner-pro", tipo: "texto_midia", paginaId: null, visivel: true,
                props: { titulo: "Bloco diagnóstico" },
                design: {},
                x: 20, y: 40, largura: 600, altura: 220, zIndex: 1
            }];
            // Ponte real: selectedEntries() em studio-components-v4.js lê
            // window.AuraCanvasV4.getSelectedBlocks() — mesmo contrato do
            // produto, apontando pra função REAL extraída.
            window.AuraCanvasV4 = { getSelectedBlocks: window.__canvasV4Real.getSelectedBlocks };
            // renderComponentsPanel() lê window.AuraComponentsV4.list() —
            // mesmo contrato do produto (init() em studio-components-v4.js).
            window.AuraComponentsV4 = { list: () => window.__componentsV4Real.state.components };
        });

        // ===== RED 1 (CSS injection) — WRITE PATH real (Inspector, campo de
        // texto livre) -> SOURCE->SINK real (createFromSelection) -> SINK
        // real (renderComponentsPanel), prova via getComputedStyle(). =====
        const html1 = await page.evaluate(() => window.__inspectorReal.controlColor("Fundo", "design.corFundo", "", "#111827"));
        await page.evaluate((html) => {
            const container = document.createElement("div");
            container.innerHTML = html;
            document.body.appendChild(container);
            window.__inspectorReal.state.root = container;
            window.__inspectorReal.state.selectedIndex = 0;
            window.__inspectorReal.bindControls();
        }, html1);

        const seletorTexto = 'input[type="text"][data-studio-path="design.corFundo"]';
        await page.fill(seletorTexto, CSS_INJECTION_PAYLOAD);
        await page.dispatchEvent(seletorTexto, "input");
        const corFundoDepois = await page.evaluate(() => window.lpEditorBlocos[0].design.corFundo);
        assert.equal(corFundoDepois, CSS_INJECTION_PAYLOAD, "write path real (Inspector) deveria ter gravado o payload sem validação de formato");

        await page.evaluate(() => { window.__canvasV4Real.state.selectedIds = new Set(["b1"]); });
        const componenteCriado = await page.evaluate(() => window.__componentsV4Real.createFromSelection("Componente Diagnóstico"));
        assert.ok(componenteCriado, "createFromSelection deveria ter criado um componente real");
        relatorio.componenteCriado = { id: componenteCriado.id, accent: componenteCriado.accent };

        const provaCss = await page.evaluate(() => {
            const root = document.createElement("main");
            document.body.appendChild(root);
            window.__canvasV4Real.renderComponentsPanel(root);
            const article = root.querySelector(".aura-v4-components-grid article");
            const computado = article ? getComputedStyle(article) : null;
            return {
                existeArticle: !!article,
                styleAttr: article?.getAttribute("style") || null,
                position: computado?.position || null,
                zIndex: computado?.zIndex || null
            };
        });
        relatorio.provaCssInjection = provaCss;
        console.log("studio-canvas-v4-component-accent-safety.flow: CSS injection:", JSON.stringify(provaCss));
        assert.equal(provaCss.existeArticle, true);
        assert.notEqual(provaCss.position, "fixed", `position:fixed NÃO pode ter sido aplicado como declaração CSS real no <article> — produzido: ${provaCss.styleAttr}`);
        assert.notEqual(provaCss.zIndex, "999999", `z-index:999999 NÃO pode ter sido aplicado como declaração CSS real no <article> — produzido: ${provaCss.styleAttr}`);

        // ===== RED 2 (attribute breakout) — payload separado, componente
        // separado, com execução real de JS via onerror. =====
        await page.evaluate((payload) => {
            window.__remainingColorSinkXss = 0;
            window.lpEditorBlocos[0].design.corFundo = payload;
        }, ATTR_BREAKOUT_PAYLOAD);
        const componenteBreakout = await page.evaluate(() => window.__componentsV4Real.createFromSelection("Componente Breakout"));
        assert.ok(componenteBreakout);
        relatorio.componenteBreakoutCriado = { id: componenteBreakout.id, accent: componenteBreakout.accent };

        const provaBreakout = await page.evaluate(() => {
            const root = document.createElement("main");
            document.body.appendChild(root);
            window.__canvasV4Real.renderComponentsPanel(root);
            const grid = root.querySelector(".aura-v4-components-grid");
            const imgs = grid ? [...grid.querySelectorAll("img")] : [];
            const comMarcador = imgs.filter((img) => (img.getAttribute("onerror") || "").includes("__remainingColorSinkXss"));
            return { totalImgsComOnerrorMarcador: comMarcador.length };
        });
        relatorio.provaAttributeBreakout = provaBreakout;
        console.log("studio-canvas-v4-component-accent-safety.flow: attribute breakout:", JSON.stringify(provaBreakout));

        if (provaBreakout.totalImgsComOnerrorMarcador > 0) {
            await page.waitForFunction(() => window.__remainingColorSinkXss === 1, { timeout: 3000 }).catch(() => {});
        }
        const markerFinal = await page.evaluate(() => window.__remainingColorSinkXss);
        relatorio.markerFinal = markerFinal;
        assert.equal(provaBreakout.totalImgsComOnerrorMarcador, 0, "nenhum <img> real com onerror do payload pode ter sido criado por attribute breakout");
        assert.equal(markerFinal, 0, "o payload não pode ter executado JavaScript real");

        // ===== RED 3 (persistência legada) — reload real (destrói todo o
        // estado JS em memória) + load() real de novo: dado JÁ persistido
        // ANTES do fix (localStorage aura_studio_components_v4) precisa
        // ficar INERTE ao ser renderizado de novo, não apenas dado NOVO. =====
        await page.reload({ waitUntil: "load" });
        await page.addScriptTag({
            content: `
                window.__componentsV4Real = (function () {
                    ${componentsBody}
                    return { state, createFromSelection, load };
                })();
            `
        });
        await page.addScriptTag({
            content: `
                window.__canvasV4Real = (function () {
                    ${canvasHeader}
                    ${canvasSelection}
                    ${canvasPanelHeading}
                    ${canvasEscapeHTML}
                    ${canvasRenderComponentsPanel}
                    function closePanel() {}
                    return { state, getSelectedBlocks, renderComponentsPanel };
                })();
            `
        });
        await page.evaluate(() => {
            // A navegação real (reload) destrói TODO o estado JS em memória
            // — window.lpEditorBlocos precisa ser reconstruído do zero,
            // exatamente como editarLP() faria numa reabertura real do
            // editor (o bloco em si não é o alvo deste teste, só um
            // veículo pra selecionar e criar um componente novo depois).
            window.lpEditorBlocos = [{
                id: "b1", lpId: "lp_diag", donoUID: "owner-pro", tipo: "texto_midia", paginaId: null, visivel: true,
                props: { titulo: "Bloco diagnóstico" },
                design: {},
                x: 20, y: 40, largura: 600, altura: 220, zIndex: 1
            }];
            window.AuraCanvasV4 = { getSelectedBlocks: window.__canvasV4Real.getSelectedBlocks };
            window.AuraComponentsV4 = { list: () => window.__componentsV4Real.state.components };
        });

        const aposReload = await page.evaluate(() => {
            window.__remainingColorSinkXss = 0;
            const lista = window.__componentsV4Real.load();
            const root = document.createElement("main");
            document.body.appendChild(root);
            window.__canvasV4Real.renderComponentsPanel(root);
            const articles = [...root.querySelectorAll(".aura-v4-components-grid article")];
            const algumFixed = articles.some((el) => getComputedStyle(el).position === "fixed");
            const grid = root.querySelector(".aura-v4-components-grid");
            const imgsComMarcador = grid ? [...grid.querySelectorAll("img")].filter((img) => (img.getAttribute("onerror") || "").includes("__remainingColorSinkXss")).length : 0;
            return { totalComponentesLegados: lista.length, algumFixed, imgsComMarcador };
        });
        await page.waitForTimeout(50);
        const markerAposReload = await page.evaluate(() => window.__remainingColorSinkXss);
        relatorio.aposReload = { ...aposReload, markerAposReload };
        console.log("studio-canvas-v4-component-accent-safety.flow: dados legados após reload:", JSON.stringify(relatorio.aposReload));
        assert.equal(aposReload.totalComponentesLegados, 2, "os 2 componentes maliciosos persistidos ANTES do fix precisam continuar existindo (o fix não migra/apaga localStorage do usuário)");
        assert.equal(aposReload.algumFixed, false, "dado legado malicioso não pode aplicar position:fixed real ao ser renderizado de novo, mesmo tendo sido criado antes do fix");
        assert.equal(aposReload.imgsComMarcador, 0, "dado legado malicioso não pode materializar attribute breakout ao ser renderizado de novo");
        assert.equal(markerAposReload, 0, "dado legado malicioso não pode executar JavaScript ao ser renderizado de novo");

        // ===== Compatibilidade: cor legítima continua aplicada. =====
        await page.evaluate(() => { window.lpEditorBlocos[0].design.corFundo = "#7C3AED"; window.__canvasV4Real.state.selectedIds = new Set(["b1"]); });
        const componenteLegitimo = await page.evaluate(() => window.__componentsV4Real.createFromSelection("Componente Legítimo"));
        assert.equal(componenteLegitimo.accent, "#7C3AED", "createFromSelection não deveria alterar um valor já legítimo");
        const provaLegitima = await page.evaluate(() => {
            const root = document.createElement("main");
            document.body.appendChild(root);
            window.__canvasV4Real.renderComponentsPanel(root);
            const article = [...root.querySelectorAll(".aura-v4-components-grid article")].find((el) => (el.getAttribute("style") || "").includes("7C3AED") || (el.getAttribute("style") || "").includes("7c3aed"));
            return { existe: !!article, background: article ? getComputedStyle(article).getPropertyValue("--accent").trim() : null };
        });
        relatorio.provaLegitima = provaLegitima;
        console.log("studio-canvas-v4-component-accent-safety.flow: compatibilidade cor legítima:", JSON.stringify(provaLegitima));
        assert.equal(provaLegitima.existe, true, "componente com cor legítima deveria continuar sendo renderizado com --accent correto");

        relatorio.pageerrors = pageerrors;
        console.log("studio-canvas-v4-component-accent-safety.flow: todos os casos OK.");
    } catch (erro) {
        falhou = true;
        console.error("studio-canvas-v4-component-accent-safety.flow: FALHOU —", erro);
        console.log("studio-canvas-v4-component-accent-safety.flow: RELATORIO_PARCIAL:", JSON.stringify(relatorio, null, 2));
    } finally {
        if (pageerrors.length > 0) {
            falhou = true;
            console.error("studio-canvas-v4-component-accent-safety.flow: pageerror inesperado:", pageerrors);
        }
        await browser.close();
        await close();
    }

    if (falhou) {
        process.exitCode = 1;
    }
}

main();
