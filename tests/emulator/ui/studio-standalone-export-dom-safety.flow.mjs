// PR66-CLOSURE-F1 — prova em DOM/parser REAL de navegador (Playwright,
// Chromium) de que o HTML produzido por renderStandaloneBlock()
// (studio-ultimate.js, export "HTML independente" do Studio Ultimate)
// nunca materializa script ativo, handler de evento, href/src javascript:
// nem attribute breakout — complementa
// tests/studio-ultimate-standalone-export-real.test.mjs (que prova o
// mesmo a nível de string) com a prova estrutural que só um parser HTML
// real pode dar: se o navegador realmente cria os nós esperados (e só
// eles), não um attribute breakout disfarçado de string "segura".
//
// Não precisa de Firestore/Auth/Firebase — nenhuma navegação a
// login.html/dashboard.html, nenhum acesso à rede além do necessário pro
// Chromium local (nenhum CDN externo). Injeta o CONTEÚDO REAL de
// lp-render-safety-core.js (módulo inline, sem alteração) e o trecho REAL
// de renderStandaloneBlock() (extraído por texto, nunca reconstruído à
// mão) direto na página, então chama a função real e inspeciona o DOM
// resultante.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { launchBrowser, REPO_ROOT } from "./_helpers.mjs";

function extrairTrecho(fonte, inicioMarcador, fimMarcador) {
    const inicio = fonte.indexOf(inicioMarcador);
    assert.ok(inicio > -1, `não foi possível localizar "${inicioMarcador}"`);
    const fim = fonte.indexOf(fimMarcador, inicio);
    assert.ok(fim > inicio, `não foi possível localizar o fim de "${inicioMarcador}"`);
    return fonte.slice(inicio, fim);
}

async function main() {
    const browser = await launchBrowser();
    let falhou = false;
    const page = await browser.newPage();
    const errosConsole = [];
    page.on("pageerror", (e) => errosConsole.push(String(e)));

    try {
        const lpRenderSafetySrc = await readFile(path.join(REPO_ROOT, "lp-render-safety-core.js"), "utf8");
        const studioUltimateSrc = await readFile(path.join(REPO_ROOT, "studio-ultimate.js"), "utf8");

        const blockLabelSrc = extrairTrecho(studioUltimateSrc, "function blockLabel(block) {", "function blockTitle(block) {");
        const blockTitleSrc = extrairTrecho(studioUltimateSrc, "function blockTitle(block) {", "function injectLauncher() {");
        const renderStandaloneBlockSrc = extrairTrecho(studioUltimateSrc, "function renderStandaloneBlock(block, safety) {", "async function standaloneHTMLDocument() {");

        const escapeHTMLLocalSrc = "const escapeHTML = (value) => String(value ?? \"\").replace(/&/g, \"&amp;\").replace(/</g, \"&lt;\").replace(/>/g, \"&gt;\").replace(/\"/g, \"&quot;\").replace(/'/g, \"&#039;\");";

        // Módulo inline com o TEXTO REAL de lp-render-safety-core.js, sem
        // nenhuma alteração — só uma linha extra no final pra expor os
        // exports em window, já que o restante da página não é module.
        await page.addScriptTag({
            type: "module",
            content: `${lpRenderSafetySrc}\nwindow.__lpRenderSafety = { escapeHTML, escapeAttribute, escapeCSSString, safeLinkURL, safeImageURL, safeIframeURL };`
        });
        await page.waitForFunction(() => !!window.__lpRenderSafety, { timeout: 5000 });

        // Script clássico com o TEXTO REAL de renderStandaloneBlock() (e as
        // duas funções auxiliares que ela chama) extraído de
        // studio-ultimate.js — exposto em window só pro driver do teste
        // conseguir chamar a função real.
        await page.addScriptTag({
            content: `${escapeHTMLLocalSrc}\n${blockLabelSrc}\n${blockTitleSrc}\nfunction renderStandaloneBlock(block, safety) {${renderStandaloneBlockSrc.slice(renderStandaloneBlockSrc.indexOf("{") + 1)}\nwindow.__renderStandaloneBlock = renderStandaloneBlock;`
        });
        await page.waitForFunction(() => typeof window.__renderStandaloneBlock === "function", { timeout: 5000 });

        // ===== Caso 1: CTA javascript: — href real não pode apontar pra
        // javascript:, e nenhum script deve executar quando o HTML entra
        // no DOM via innerHTML (equivalente a como o dono abriria o
        // arquivo .html exportado). =====
        const resultadoCTA = await page.evaluate(() => {
            window.__standaloneXssMarker = false;
            const html = window.__renderStandaloneBlock(
                { tipo: "texto_midia", props: { titulo: "T", botaoTexto: "Comprar", botaoLink: "javascript:window.__standaloneXssMarker=true" }, design: {} },
                window.__lpRenderSafety
            );
            const container = document.createElement("div");
            container.innerHTML = html;
            document.body.appendChild(container);
            const link = container.querySelector("a.btn");
            const resultado = {
                hrefAttribute: link?.getAttribute("href") || null,
                hrefResolved: link ? String(link.href) : null,
                markerAntesDoClick: window.__standaloneXssMarker
            };
            link?.click();
            resultado.markerDepoisDoClick = window.__standaloneXssMarker;
            container.remove();
            return resultado;
        });
        console.log("studio-standalone-export-dom-safety.flow: CTA javascript:", JSON.stringify(resultadoCTA));
        assert.equal(resultadoCTA.hrefAttribute, "#", "href real do CTA deveria ser o fallback seguro \"#\", não javascript:");
        assert.ok(!String(resultadoCTA.hrefResolved || "").startsWith("javascript:"), "href resolvido pelo navegador não pode ser um esquema javascript:");
        assert.equal(resultadoCTA.markerDepoisDoClick, false, "clicar no CTA real não pode executar o payload javascript:");

        // ===== Caso 2: imagem com attribute breakout — precisa existir
        // exatamente UM <img>, com o payload inteiro dentro do atributo
        // src (nunca como <svg onload> irmão real), e o onerror do <img>
        // real (broken src de propósito) não pode conter o marcador. =====
        const resultadoImg = await page.evaluate(() => {
            window.__standaloneXssMarker = false;
            const payload = 'https://x.exemplo.invalid/x.png"><svg onload="window.__standaloneXssMarker=true">';
            const html = window.__renderStandaloneBlock(
                { tipo: "galeria_imagens", props: { titulo: "G", imagens: [payload] }, design: {} },
                window.__lpRenderSafety
            );
            const container = document.createElement("div");
            document.body.appendChild(container);
            container.innerHTML = html;
            const resultado = {
                totalImgs: container.querySelectorAll("img").length,
                totalSvgs: container.querySelectorAll("svg").length,
                marker: window.__standaloneXssMarker
            };
            container.remove();
            return resultado;
        });
        console.log("studio-standalone-export-dom-safety.flow: imagem attribute breakout:", JSON.stringify(resultadoImg));
        assert.equal(resultadoImg.totalSvgs, 0, "nenhum <svg> real pode ter sido criado como elemento irmão via attribute breakout");
        assert.equal(resultadoImg.totalImgs, 1, "deveria existir exatamente 1 <img> (o payload inteiro precisa ter ficado dentro do atributo src)");
        assert.equal(resultadoImg.marker, false, "o payload não pode ter executado");

        // ===== Caso 3 (ADV-66-001 equivalente): imagemFundoB64 tentando
        // fechar o atributo style do <section> — precisa existir
        // exatamente 1 <section>, sem <img> real filho. =====
        const resultadoFundo = await page.evaluate(() => {
            window.__standaloneXssMarker = false;
            const payload = 'https://x.exemplo.invalid/x.png"><img src=x onerror="window.__standaloneXssMarker=true">';
            const html = window.__renderStandaloneBlock(
                { tipo: "texto_midia", props: { titulo: "T" }, design: { imagemFundoB64: payload } },
                window.__lpRenderSafety
            );
            const container = document.createElement("div");
            document.body.appendChild(container);
            container.innerHTML = html;
            const resultado = {
                totalSections: container.querySelectorAll("section").length,
                totalImgsForaDoPlaceholder: container.querySelectorAll("section > img, section > .container > img").length,
                marker: window.__standaloneXssMarker
            };
            container.remove();
            return resultado;
        });
        console.log("studio-standalone-export-dom-safety.flow: imagemFundoB64 (ADV-66-001):", JSON.stringify(resultadoFundo));
        assert.equal(resultadoFundo.totalSections, 1, "deveria existir exatamente 1 <section> (o payload não pode ter fechado o atributo style cedo)");
        assert.equal(resultadoFundo.totalImgsForaDoPlaceholder, 0, "nenhum <img> real pode ter sido criado como filho direto do <section>/.container a partir do payload de background");
        assert.equal(resultadoFundo.marker, false, "o payload não pode ter executado (nenhum onerror real disparado)");

        // ===== Caso 4 (ADV-66-002 equivalente): imagemFundoB64 tentando
        // fechar url('...') e injetar uma declaração CSS — a propriedade
        // computada do <section> tem que continuar sendo a
        // background-image original, nunca a declaração injetada
        // aplicada como position:fixed real no elemento. =====
        const resultadoCss = await page.evaluate(() => {
            const payload = "https://x.exemplo.invalid/y.png');position:fixed;top:0;left:0;z-index:999999;((";
            const html = window.__renderStandaloneBlock(
                { tipo: "texto_midia", props: { titulo: "T" }, design: { imagemFundoB64: payload } },
                window.__lpRenderSafety
            );
            const container = document.createElement("div");
            document.body.appendChild(container);
            container.innerHTML = html;
            const section = container.querySelector("section");
            const computado = section ? getComputedStyle(section) : null;
            const resultado = {
                existeSection: !!section,
                position: computado?.position || null
            };
            container.remove();
            return resultado;
        });
        console.log("studio-standalone-export-dom-safety.flow: imagemFundoB64 (ADV-66-002):", JSON.stringify(resultadoCss));
        assert.equal(resultadoCss.existeSection, true);
        assert.notEqual(resultadoCss.position, "fixed", "position:fixed NÃO pode ter sido aplicado como declaração CSS real no elemento — a tentativa de fechar url('...') precisa continuar presa dentro da string");

        // ===== Caso 5: conteúdo legítimo continua intacto (compatibilidade
        // real, não só a nível de string). =====
        const resultadoLegitimo = await page.evaluate(() => {
            const html = window.__renderStandaloneBlock(
                { tipo: "texto_midia", props: { titulo: "Compre agora", botaoTexto: "Comprar", botaoLink: "https://loja.exemplo.com/produto", imagemB64: "https://cdn.exemplo.com/foto.jpg" }, design: { corFundo: "#111827" } },
                window.__lpRenderSafety
            );
            const container = document.createElement("div");
            document.body.appendChild(container);
            container.innerHTML = html;
            const link = container.querySelector("a.btn");
            const img = container.querySelector("img");
            const section = container.querySelector("section");
            const resultado = {
                href: link?.getAttribute("href"),
                src: img?.getAttribute("src"),
                titulo: container.querySelector("h2")?.textContent,
                backgroundColor: section ? getComputedStyle(section).backgroundColor : null
            };
            container.remove();
            return resultado;
        });
        console.log("studio-standalone-export-dom-safety.flow: conteúdo legítimo:", JSON.stringify(resultadoLegitimo));
        assert.equal(resultadoLegitimo.href, "https://loja.exemplo.com/produto");
        assert.equal(resultadoLegitimo.src, "https://cdn.exemplo.com/foto.jpg");
        assert.equal(resultadoLegitimo.titulo, "Compre agora");
        assert.equal(resultadoLegitimo.backgroundColor, "rgb(17, 24, 39)", "#111827 deveria continuar sendo aplicado normalmente");

        console.log("studio-standalone-export-dom-safety.flow: todos os casos OK — prova em DOM/parser real de navegador.");
    } catch (erro) {
        falhou = true;
        console.error("studio-standalone-export-dom-safety.flow: FALHOU —", erro);
    } finally {
        if (errosConsole.length > 0) {
            falhou = true;
            console.error("studio-standalone-export-dom-safety.flow: pageerror inesperado:", errosConsole);
        }
        await browser.close();
    }

    if (falhou) {
        process.exitCode = 1;
    }
}

main();
