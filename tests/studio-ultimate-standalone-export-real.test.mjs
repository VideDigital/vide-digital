// PR66-CLOSURE-F1 — hardening do export "HTML independente" do Studio
// Ultimate (studio-ultimate.js -> exportStandaloneHTML(), ligado ao botão
// real #aura-ultimate-export-html). Executa a implementação REAL de
// renderStandaloneBlock() (e blockLabel()/blockTitle(), definidas antes
// dela no arquivo), extraída por texto — mesma técnica de
// tests/lp-renderer-real-execution.test.mjs (renderizarBloco de
// index.html) — contra payloads de XSS/URL perigosa em cada sink.
//
// Puro (node --test), sem browser: verifica o HTML produzido como STRING.
// A prova em DOM/parser real de navegador fica em
// tests/emulator/ui/studio-standalone-export-dom-safety.flow.mjs.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { escapeHTML, escapeAttribute, escapeCSSString, safeLinkURL, safeImageURL } from "../lp-render-safety-core.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Extrai renderStandaloneBlock() (e blockLabel()/blockTitle(), que ela
// chama no branch default) de studio-ultimate.js por texto — nunca por
// reconstrução manual. Se o branch real de qualquer tipo de bloco quebrar,
// mudar de nome ou perder o escaping, este teste falha porque está
// executando o código real, não uma cópia.
async function carregarRenderStandaloneBlockReal() {
    const fonte = await readFile(path.join(REPO_ROOT, "studio-ultimate.js"), "utf8");

    function extrairTrecho(inicioMarcador, fimMarcador, apartirDe = 0) {
        const inicio = fonte.indexOf(inicioMarcador, apartirDe);
        assert.ok(inicio > apartirDe - 1, `não foi possível localizar "${inicioMarcador}" em studio-ultimate.js`);
        const fim = fonte.indexOf(fimMarcador, inicio);
        assert.ok(fim > inicio, `não foi possível localizar o fim de "${inicioMarcador}" (procurando "${fimMarcador}")`);
        return fonte.slice(inicio, fim);
    }

    const blockLabelSrc = extrairTrecho("function blockLabel(block) {", "function blockTitle(block) {");
    const blockTitleSrc = extrairTrecho("function blockTitle(block) {", "function injectLauncher() {");
    const renderStandaloneBlockSrc = extrairTrecho(
        "function renderStandaloneBlock(block, safety) {",
        "async function standaloneHTMLDocument() {"
    );

    const fonteCompleta = `${blockLabelSrc}\n${blockTitleSrc}\nfunction renderStandaloneBlock(block, safety) {${renderStandaloneBlockSrc.slice(renderStandaloneBlockSrc.indexOf("{") + 1)}\nreturn renderStandaloneBlock;`;
    const factory = new Function("escapeHTML", fonteCompleta);
    return factory(escapeHTML);
}

const safety = Object.freeze({ escapeAttribute, escapeCSSString, safeLinkURL, safeImageURL });

const SCRIPT_PAYLOAD = "<script>window.__standaloneXssMarker=1<\/script>";
const IMG_ONERROR_PAYLOAD = '<img src=x onerror="window.__standaloneXssMarker=1">';
const ATTR_BREAKOUT_PAYLOAD = '"><svg onload="window.__standaloneXssMarker=1">';
const JS_URL_PAYLOAD = "javascript:window.__standaloneXssMarker=1";
const DATA_HTML_PAYLOAD = "data:text/html,<script>window.__standaloneXssMarker=1<\/script>";
const DATA_SVG_PAYLOAD = "data:image/svg+xml,<svg onload=\"window.__standaloneXssMarker=1\"></svg>";
const PROTOCOL_RELATIVE_PAYLOAD = "//evil.exemplo.invalid/x.png";

function assertHtmlSeguro(html, contexto) {
    assert.ok(!html.includes("<script"), `${contexto}: HTML não pode conter <script literal — produzido: ${html}`);
    assert.ok(!/on[a-z]+\s*=\s*"[^"]*__standaloneXssMarker/i.test(html), `${contexto}: nenhum handler de evento pode conter o marcador — produzido: ${html}`);
    assert.ok(!html.includes('href="javascript:'), `${contexto}: href não pode apontar pra javascript: — produzido: ${html}`);
    assert.ok(!html.includes('src="javascript:'), `${contexto}: src não pode apontar pra javascript: — produzido: ${html}`);
    assert.ok(!/url\(&#039;javascript:/i.test(html) && !html.includes("url('javascript:"), `${contexto}: background-image não pode apontar pra javascript: — produzido: ${html}`);
}

describe("renderStandaloneBlock() real (studio-ultimate.js) — PR66-CLOSURE-F1: href sem validação de esquema", () => {
    it("1. CTA (texto_midia.botaoLink) javascript: vira fallback seguro", async () => {
        const renderStandaloneBlock = await carregarRenderStandaloneBlockReal();
        const bloco = { tipo: "texto_midia", props: { titulo: "T", botaoTexto: "Comprar", botaoLink: JS_URL_PAYLOAD }, design: {} };
        const html = renderStandaloneBlock(bloco, safety);
        assertHtmlSeguro(html, "texto_midia CTA");
        assert.match(html, /href="#"/, "fallback esperado é href=\"#\"");
    });

    it("2. navegação (links[].href) javascript: vira fallback seguro", async () => {
        const renderStandaloneBlock = await carregarRenderStandaloneBlockReal();
        const bloco = { tipo: "navegacao", props: { logoTexto: "Loja", links: [{ href: JS_URL_PAYLOAD, label: "Link" }] }, design: {} };
        const html = renderStandaloneBlock(bloco, safety);
        assertHtmlSeguro(html, "navegacao");
        assert.match(html, /href="#"/);
    });

    it("3. rodapé (links[].href) javascript: vira fallback seguro", async () => {
        const renderStandaloneBlock = await carregarRenderStandaloneBlockReal();
        const bloco = { tipo: "rodape", props: { links: [{ href: JS_URL_PAYLOAD, label: "Link" }] }, design: {} };
        const html = renderStandaloneBlock(bloco, safety);
        assertHtmlSeguro(html, "rodape");
        assert.match(html, /href="#"/);
    });
});

describe("renderStandaloneBlock() real (studio-ultimate.js) — PR66-CLOSURE-F1: imagens sem escaping/validação", () => {
    it("4. texto_midia.imagemB64 com attribute breakout não cria elemento ativo", async () => {
        const renderStandaloneBlock = await carregarRenderStandaloneBlockReal();
        const payload = `https://x.exemplo.invalid/x.png${ATTR_BREAKOUT_PAYLOAD}`;
        const bloco = { tipo: "texto_midia", props: { titulo: "T", imagemB64: payload }, design: {} };
        const html = renderStandaloneBlock(bloco, safety);
        assertHtmlSeguro(html, "texto_midia imagemB64");
        const imgMatch = html.match(/<img[^>]*\bsrc="([^"]*)"/);
        assert.ok(imgMatch, "precisa existir um <img src=\"...\"> bem-formado");
        assert.ok(!html.includes("<svg"), "nenhum <svg> real pode ter sido injetado como elemento irmão");
    });

    it("5. galeria_imagens com imagem maliciosa não cria elemento ativo", async () => {
        const renderStandaloneBlock = await carregarRenderStandaloneBlockReal();
        const payload = `https://x.exemplo.invalid/x.png${ATTR_BREAKOUT_PAYLOAD}`;
        const bloco = { tipo: "galeria_imagens", props: { titulo: "G", imagens: [payload] }, design: {} };
        const html = renderStandaloneBlock(bloco, safety);
        assertHtmlSeguro(html, "galeria_imagens");
        assert.ok(!html.includes("<svg"), "nenhum <svg> real pode ter sido injetado como elemento irmão");
    });

    it("6. carrossel_cards com imagem maliciosa não cria elemento ativo", async () => {
        const renderStandaloneBlock = await carregarRenderStandaloneBlockReal();
        const payload = `https://x.exemplo.invalid/x.png${ATTR_BREAKOUT_PAYLOAD}`;
        const bloco = { tipo: "carrossel_cards", props: { titulo: "C", cards: [{ titulo: "c", texto: "t", imagemB64: payload }] }, design: {} };
        const html = renderStandaloneBlock(bloco, safety);
        assertHtmlSeguro(html, "carrossel_cards");
        assert.ok(!html.includes("<svg"), "nenhum <svg> real pode ter sido injetado como elemento irmão");
    });

    it("7. carrossel_banners com imagem maliciosa não cria elemento ativo", async () => {
        const renderStandaloneBlock = await carregarRenderStandaloneBlockReal();
        const payload = `https://x.exemplo.invalid/x.png${ATTR_BREAKOUT_PAYLOAD}`;
        const bloco = { tipo: "carrossel_banners", props: { banners: [{ imagemB64: payload }] }, design: {} };
        const html = renderStandaloneBlock(bloco, safety);
        assertHtmlSeguro(html, "carrossel_banners");
        assert.ok(!html.includes("<svg"), "nenhum <svg> real pode ter sido injetado como elemento irmão");
    });
});

describe("renderStandaloneBlock() real (studio-ultimate.js) — PR66-CLOSURE-F1: background-image (ADV-66-001/002 equivalentes)", () => {
    it("8. imagemFundoB64 (ADV-66-001) com corpo tentando fechar o atributo style não cria elemento ativo", async () => {
        const renderStandaloneBlock = await carregarRenderStandaloneBlockReal();
        const payload = `https://x.exemplo.invalid/x.png"><img src=x onerror="window.__standaloneXssMarker=1">`;
        const bloco = { tipo: "texto_midia", props: { titulo: "T" }, design: { imagemFundoB64: payload } };
        const html = renderStandaloneBlock(bloco, safety);
        assertHtmlSeguro(html, "imagemFundoB64 (ADV-66-001)");
        const styleMatch = html.match(/<section[^>]*\bstyle="([^"]*)"/);
        assert.ok(styleMatch, "precisa existir um atributo style bem-formado (aspas balanceadas) no <section>");
        const segundoImg = html.indexOf("<img", styleMatch.index + styleMatch[0].length);
        assert.ok(segundoImg === -1, "nenhum <img> real pode ter sido criado como filho do <section> a partir do payload");
    });

    it("9. imagemFundoB64 (ADV-66-002) com corpo tentando fechar url('...') não injeta declaração CSS", async () => {
        const renderStandaloneBlock = await carregarRenderStandaloneBlockReal();
        const payload = "https://x.exemplo.invalid/y.png');position:fixed;top:0;left:0;z-index:999999;((";
        const bloco = { tipo: "texto_midia", props: { titulo: "T" }, design: { imagemFundoB64: payload } };
        const html = renderStandaloneBlock(bloco, safety);

        const styleMatch = html.match(/\bstyle="([^"]*url\([^"]*)"/);
        assert.ok(styleMatch, "precisa existir um atributo style bem-formado contendo url(...)");
        // Simula o que o navegador faz: decodifica entidades HTML do
        // atributo ANTES do parser CSS interpretar o valor.
        const decodificado = styleMatch[1]
            .replace(/&quot;/g, '"')
            .replace(/&#0?39;/g, "'")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&amp;/g, "&");
        const urlStart = decodificado.indexOf("url('");
        assert.ok(urlStart >= 0, "precisa existir url('...') na declaração CSS decodificada");
        let i = urlStart + "url('".length;
        let barras = 0;
        while (i < decodificado.length) {
            const c = decodificado[i];
            if (c === "\\") { barras += 1; i += 1; continue; }
            if (c === "'" && barras % 2 === 0) break;
            barras = 0;
            i += 1;
        }
        assert.ok(i < decodificado.length, "a string CSS de url('...') nunca terminou — parse quebrado");
        const restoAposString = decodificado.slice(i + 1).trim();
        assert.match(restoAposString, /^\);/, `depois do fim real da string CSS só pode vir ");" — encontrado: ${JSON.stringify(restoAposString.slice(0, 30))}`);
        assert.ok(!/(?:^|;)\s*position\s*:\s*fixed\s*(?:;|$)/.test(restoAposString), "position:fixed não pode aparecer como declaração CSS própria fora da string de url(...)");
    });

    it("10. escapeCSSString real cobre aspas/backslash/LF/CR/NUL/DEL no sink de background-image", async () => {
        const renderStandaloneBlock = await carregarRenderStandaloneBlockReal();
        const corpo = "a'b\"c\\d\ne\rf\x00g\x7Fh";
        const payload = `https://x.exemplo.invalid/${corpo}.png`;
        const bloco = { tipo: "texto_midia", props: { titulo: "T" }, design: { imagemFundoB64: payload } };
        const html = renderStandaloneBlock(bloco, safety);
        const styleMatch = html.match(/\bstyle="([^"]*url\('([^"]*)'\)[^"]*)"/);
        assert.ok(styleMatch, "precisa existir style com url('...') bem-formado");
        // styleMatch[2] é só o CONTEÚDO entre as aspas do wrapper url('...')
        // — os delimitadores em si (as duas aspas simples literais que a
        // própria produção adiciona) ficam de fora, então não geram falso
        // positivo aqui. Dentro do conteúdo, nenhuma aspa simples pode
        // sobreviver sem um backslash de escape (do CSS) imediatamente
        // antes — senão fecharia a string CSS antes da hora.
        assert.doesNotMatch(styleMatch[2], /(?<!\\)'/, "aspa simples não escapada sobrevivendo na string CSS");
        // Nenhum control char (LF/CR/NUL/DEL) pode sobreviver literal — só
        // como escape hex do CSS (\<hex> ).
        assert.doesNotMatch(styleMatch[2], /[\n\r\x00\x7f]/, "control char literal sobrevivendo na string CSS");
    });
});

describe("renderStandaloneBlock() real (studio-ultimate.js) — PR66-CLOSURE-F1: cores de design não quebram o atributo style", () => {
    it("11. corFundo/corBotaoFundo/corBotaoBorda/corBotaoTexto/corTexto maliciosos não quebram o style do <section>/CTA", async () => {
        const renderStandaloneBlock = await carregarRenderStandaloneBlockReal();
        const bloco = {
            tipo: "texto_midia",
            props: { titulo: "T", botaoTexto: "Comprar", botaoLink: "https://loja.exemplo.com" },
            design: {
                corFundo: ATTR_BREAKOUT_PAYLOAD,
                corTexto: ATTR_BREAKOUT_PAYLOAD,
                corBotaoFundo: ATTR_BREAKOUT_PAYLOAD,
                corBotaoBorda: ATTR_BREAKOUT_PAYLOAD,
                corBotaoTexto: ATTR_BREAKOUT_PAYLOAD
            }
        };
        const html = renderStandaloneBlock(bloco, safety);
        assertHtmlSeguro(html, "cores de design");
        assert.ok(!html.includes("<svg"), "nenhum <svg> real pode ter sido injetado a partir de uma cor maliciosa");
    });

    it("12. idSecao malicioso não quebra o atributo id do <section>", async () => {
        const renderStandaloneBlock = await carregarRenderStandaloneBlockReal();
        const bloco = { tipo: "texto_midia", props: { titulo: "T" }, design: { idSecao: ATTR_BREAKOUT_PAYLOAD } };
        const html = renderStandaloneBlock(bloco, safety);
        assertHtmlSeguro(html, "idSecao");
    });
});

describe("renderStandaloneBlock() real (studio-ultimate.js) — políticas de esquema de URL/imagem", () => {
    it("13. protocol-relative (//) é bloqueado em link e imagem", async () => {
        const renderStandaloneBlock = await carregarRenderStandaloneBlockReal();
        const blocoLink = { tipo: "texto_midia", props: { titulo: "T", botaoTexto: "Ir", botaoLink: PROTOCOL_RELATIVE_PAYLOAD }, design: {} };
        assert.match(renderStandaloneBlock(blocoLink, safety), /href="#"/);
        const blocoImg = { tipo: "galeria_imagens", props: { imagens: [PROTOCOL_RELATIVE_PAYLOAD] }, design: {} };
        assert.doesNotMatch(renderStandaloneBlock(blocoImg, safety), /src="\/\//);
    });

    it("14. data:image/svg+xml é bloqueado (pode carregar script)", async () => {
        const renderStandaloneBlock = await carregarRenderStandaloneBlockReal();
        const bloco = { tipo: "galeria_imagens", props: { imagens: [DATA_SVG_PAYLOAD] }, design: {} };
        const html = renderStandaloneBlock(bloco, safety);
        assertHtmlSeguro(html, "data:image/svg+xml");
        assert.doesNotMatch(html, /src="data:image\/svg/);
    });

    it("15. data:text/html é bloqueado", async () => {
        const renderStandaloneBlock = await carregarRenderStandaloneBlockReal();
        const bloco = { tipo: "galeria_imagens", props: { imagens: [DATA_HTML_PAYLOAD] }, design: {} };
        const html = renderStandaloneBlock(bloco, safety);
        assertHtmlSeguro(html, "data:text/html");
        assert.doesNotMatch(html, /src="data:text\/html/);
    });
});

describe("renderStandaloneBlock() real (studio-ultimate.js) — conteúdo legítimo continua funcionando (compatibilidade)", () => {
    it("16. URL https legítima permanece intacta", async () => {
        const renderStandaloneBlock = await carregarRenderStandaloneBlockReal();
        const bloco = { tipo: "texto_midia", props: { titulo: "T", botaoTexto: "Comprar", botaoLink: "https://loja.exemplo.com/produto" }, design: {} };
        const html = renderStandaloneBlock(bloco, safety);
        assert.match(html, /href="https:\/\/loja\.exemplo\.com\/produto"/);
    });

    it("17. imagem https legítima permanece válida", async () => {
        const renderStandaloneBlock = await carregarRenderStandaloneBlockReal();
        const bloco = { tipo: "texto_midia", props: { titulo: "T", imagemB64: "https://cdn.exemplo.com/foto.jpg" }, design: {} };
        const html = renderStandaloneBlock(bloco, safety);
        assert.match(html, /src="https:\/\/cdn\.exemplo\.com\/foto\.jpg"/);
    });

    it("18. data:image/png;base64 legítimo continua permitido", async () => {
        const renderStandaloneBlock = await carregarRenderStandaloneBlockReal();
        const b64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";
        const bloco = { tipo: "texto_midia", props: { titulo: "T", imagemB64: b64 }, design: {} };
        const html = renderStandaloneBlock(bloco, safety);
        assert.match(html, new RegExp(`src="${b64.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    });

    it("19. link mailto: legítimo continua funcionando (navegação/rodapé permitem mailto/tel)", async () => {
        const renderStandaloneBlock = await carregarRenderStandaloneBlockReal();
        const bloco = { tipo: "navegacao", props: { logoTexto: "Loja", links: [{ href: "mailto:contato@loja.com", label: "Fale conosco" }] }, design: {} };
        const html = renderStandaloneBlock(bloco, safety);
        assert.match(html, /href="mailto:contato@loja\.com"/);
    });

    it("20. texto/HTML legítimo com & \" ' continua sendo escapado normalmente (sem falso positivo)", async () => {
        const renderStandaloneBlock = await carregarRenderStandaloneBlockReal();
        const bloco = { tipo: "texto_midia", props: { titulo: 'Compre agora & economize "muito"' }, design: {} };
        const html = renderStandaloneBlock(bloco, safety);
        assert.match(html, /Compre agora &amp; economize &quot;muito&quot;/);
    });

    it("21. imagemFundoB64 https legítima produz background-image válido", async () => {
        const renderStandaloneBlock = await carregarRenderStandaloneBlockReal();
        const bloco = { tipo: "texto_midia", props: { titulo: "T" }, design: { imagemFundoB64: "https://cdn.exemplo.com/fundo.jpg" } };
        const html = renderStandaloneBlock(bloco, safety);
        assert.match(html, /url\('https:\/\/cdn\.exemplo\.com\/fundo\.jpg'\)/);
    });

    it("22. cores de design legítimas continuam aplicadas no style", async () => {
        const renderStandaloneBlock = await carregarRenderStandaloneBlockReal();
        const bloco = { tipo: "texto_midia", props: { titulo: "T" }, design: { corFundo: "#111827", corTexto: "#F8FAFC" } };
        const html = renderStandaloneBlock(bloco, safety);
        assert.match(html, /background:#111827;color:#F8FAFC;/);
    });

    it("23. bloco de tipo desconhecido (default/blockLabel/blockTitle) continua funcionando e escapando", async () => {
        const renderStandaloneBlock = await carregarRenderStandaloneBlockReal();
        const bloco = { tipo: "seletor_cores", props: { titulo: SCRIPT_PAYLOAD }, design: {} };
        const html = renderStandaloneBlock(bloco, safety);
        assertHtmlSeguro(html, "tipo desconhecido (default)");
    });
});
