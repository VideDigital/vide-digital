// LP-SEC-AUDIT-001/002 — hardening dos renderers de Landing Page. Executa
// a implementação REAL de renderizarBloco() (index.html), extraída por
// texto e nunca reconstruída à mão — mesma técnica de
// tests/emulator/ui/studio-codigo-iframe-sandbox.flow.mjs (PR62-REV-001) —
// contra payloads de XSS/URL perigosa em cada tipo de bloco ativo, e
// comprova que o HTML produzido nunca contém uma tag/handler ativo nem um
// esquema de URL perigoso intacto.
//
// Puro (node --test), sem browser/emulador: verifica o HTML como STRING
// (o mesmo nível de evidência que comprovou os achados originais via PoC
// local). A verificação de isolamento real do navegador (Same-Origin
// Policy, sandbox do iframe) continua exclusiva do teste E2E dedicado —
// aqui o alvo é exclusivamente escaping/validação de URL na origem.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { escapeHTML, escapeAttribute, safeLinkURL, safeImageURL, safeIframeURL } from "../lp-render-safety-core.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Extrai renderizarBloco() (e as duas funções auxiliares que ela chama,
// definidas antes dela no arquivo) de index.html por texto — nunca por
// reconstrução manual. Se o branch real de qualquer tipo de bloco quebrar,
// mudar de nome ou perder o escaping, este teste falha porque está
// executando o código real, não uma cópia.
async function carregarRenderizarBlocoReal() {
    const indexSource = await readFile(path.join(REPO_ROOT, "index.html"), "utf8");

    function extrairTrecho(inicioMarcador, fimMarcador, apartirDe = 0) {
        const inicio = indexSource.indexOf(inicioMarcador, apartirDe);
        assert.ok(inicio > apartirDe - 1, `não foi possível localizar "${inicioMarcador}" em index.html`);
        const fim = indexSource.indexOf(fimMarcador, inicio);
        assert.ok(fim > inicio, `não foi possível localizar o fim de "${inicioMarcador}" (procurando "${fimMarcador}")`);
        return indexSource.slice(inicio, fim);
    }

    const helpersFormulario = extrairTrecho(
        "function escaparAtributoFormulario(value) {",
        "function camposExtrasDoFormulario(form) {"
    );
    const envolverCarrossel = extrairTrecho(
        "function envolverCarrossel(idUnico, slidesHtml) {",
        "async function renderizarBloco(bloco, modoLayout) {"
    );
    const renderizarBlocoSrc = extrairTrecho(
        "async function renderizarBloco(bloco, modoLayout) {",
        "function mostrarErro() {"
    );

    // Stub mínimo de Firestore, só o suficiente pro branch carrossel_produtos
    // (que chama getDoc(doc(db, "produtos", pid))) rodar sem precisar de
    // rede/emulador — devolve o payload malicioso como se fosse um produto
    // real, pra provar que o escaping também cobre dados vindos daqui.
    const produtoFake = { nome: "<script>window.__lpXssProduto=1<\/script>", preco: 'javascript:alert(1)"><b>', imagemB64: "javascript:alert(1)" };
    const doc = (_db, _colecao, id) => ({ id });
    const getDoc = async () => ({ exists: () => true, data: () => produtoFake });
    const db = {};

    const fonteCompleta = `${helpersFormulario}\n${envolverCarrossel}\n${renderizarBlocoSrc}\nreturn renderizarBloco;`;
    const factory = new Function(
        "escapeHTML", "escapeAttribute", "safeLinkURL", "safeImageURL", "safeIframeURL", "doc", "getDoc", "db",
        fonteCompleta
    );
    return factory(escapeHTML, escapeAttribute, safeLinkURL, safeImageURL, safeIframeURL, doc, getDoc, db);
}

const SCRIPT_PAYLOAD = "<script>window.__lpXssMarker=1<\/script>";
const IMG_ONERROR_PAYLOAD = '<img src=x onerror="window.__lpXssMarker=1">';
const ATTR_BREAKOUT_PAYLOAD = '"><svg onload="window.__lpXssMarker=1">';
const TAG_BREAKOUT_PAYLOAD = '"></a><script>window.__lpXssMarker=1<\/script>';
const JS_URL_PAYLOAD = "javascript:window.__lpXssMarker=1";

function assertHtmlSeguro(html, contexto) {
    assert.ok(!html.includes("<script"), `${contexto}: HTML não pode conter <script literal — produzido: ${html}`);
    assert.ok(!/on[a-z]+\s*=\s*"[^"]*window\.__lpXssMarker/i.test(html), `${contexto}: nenhum handler de evento pode conter o marcador — produzido: ${html}`);
    assert.ok(!html.includes('href="javascript:'), `${contexto}: href não pode apontar pra javascript: — produzido: ${html}`);
    assert.ok(!html.includes('src="javascript:'), `${contexto}: src não pode apontar pra javascript: — produzido: ${html}`);
}

const design = {};

describe("renderizarBloco() real (index.html) — LP-SEC-AUDIT-001 (stored XSS) por tipo de bloco", () => {
    const casos = [
        ["texto_midia", { titulo: SCRIPT_PAYLOAD, subtitulo: IMG_ONERROR_PAYLOAD, botaoTexto: TAG_BREAKOUT_PAYLOAD, botaoLink: JS_URL_PAYLOAD, imagemB64: JS_URL_PAYLOAD, design }],
        ["formulario_captura", { titulo: SCRIPT_PAYLOAD, textoBotao: IMG_ONERROR_PAYLOAD, campos: [], design }],
        ["faq", { titulo: SCRIPT_PAYLOAD, itens: [{ pergunta: IMG_ONERROR_PAYLOAD, resposta: TAG_BREAKOUT_PAYLOAD }], design }],
        ["galeria_imagens", { titulo: SCRIPT_PAYLOAD, imagens: [JS_URL_PAYLOAD], design }],
        ["lista_cards", { titulo: SCRIPT_PAYLOAD, cards: [{ icone: IMG_ONERROR_PAYLOAD, titulo: TAG_BREAKOUT_PAYLOAD, texto: SCRIPT_PAYLOAD }], design }],
        ["tabela_comparativo", { titulo: SCRIPT_PAYLOAD, coluna1: IMG_ONERROR_PAYLOAD, coluna2: TAG_BREAKOUT_PAYLOAD, linhas: [{ label: SCRIPT_PAYLOAD, valor1: IMG_ONERROR_PAYLOAD, valor2: TAG_BREAKOUT_PAYLOAD }], design }],
        ["texto_rico", { titulo: SCRIPT_PAYLOAD, conteudo: `${SCRIPT_PAYLOAD}\n\n${IMG_ONERROR_PAYLOAD}`, design }],
        ["carrossel_banners", { banners: [{ link: JS_URL_PAYLOAD, imagemB64: JS_URL_PAYLOAD }], design }],
        ["carrossel_produtos", { titulo: SCRIPT_PAYLOAD, produtosIds: ["fake-id"], design }],
        ["carrossel_cards", { titulo: SCRIPT_PAYLOAD, estiloImagem: "lado", cards: [{ titulo: TAG_BREAKOUT_PAYLOAD, texto: SCRIPT_PAYLOAD, imagemB64: JS_URL_PAYLOAD }], design }],
        ["carrossel_cards (fundo)", { titulo: SCRIPT_PAYLOAD, estiloImagem: "fundo", cards: [{ titulo: TAG_BREAKOUT_PAYLOAD, texto: SCRIPT_PAYLOAD, imagemB64: JS_URL_PAYLOAD }], design }, "carrossel_cards"],
        ["navegacao", { logoTexto: SCRIPT_PAYLOAD, links: [{ href: JS_URL_PAYLOAD, label: IMG_ONERROR_PAYLOAD }], design }],
        ["rodape", { textoCopyright: SCRIPT_PAYLOAD, links: [{ href: JS_URL_PAYLOAD, label: IMG_ONERROR_PAYLOAD }], design }],
        ["seletor_cores", { titulo: SCRIPT_PAYLOAD, opcoes: [{ hex: ATTR_BREAKOUT_PAYLOAD, nome: IMG_ONERROR_PAYLOAD }], design }],
        ["breadcrumb", { itens: [{ href: JS_URL_PAYLOAD, label: IMG_ONERROR_PAYLOAD }], design }],
        ["forma", { largura: ATTR_BREAKOUT_PAYLOAD, altura: ATTR_BREAKOUT_PAYLOAD, cor: ATTR_BREAKOUT_PAYLOAD, tipoForma: "retangulo", design }]
    ];

    for (const [nomeCaso, props, tipoReal] of casos) {
        it(`${nomeCaso}: payload malicioso nunca produz elemento/handler ativo`, async () => {
            const renderizarBloco = await carregarRenderizarBlocoReal();
            const bloco = { tipo: tipoReal || nomeCaso, props, design };
            const html = await renderizarBloco(bloco, "empilhado");
            assertHtmlSeguro(html, nomeCaso);
        });
    }

    it("idSecao/animacao maliciosos no design não quebram o atributo do <section>", async () => {
        const renderizarBloco = await carregarRenderizarBlocoReal();
        const bloco = {
            tipo: "texto_midia",
            props: { titulo: "Título normal", subtitulo: "Subtítulo normal" },
            design: { idSecao: ATTR_BREAKOUT_PAYLOAD, animacao: ATTR_BREAKOUT_PAYLOAD }
        };
        const html = await renderizarBloco(bloco, "empilhado");
        assertHtmlSeguro(html, "idSecao/animacao");
    });

    it("cores de design maliciosas (corFundo/corBotaoFundo/corTexto) não quebram o atributo style", async () => {
        const renderizarBloco = await carregarRenderizarBlocoReal();
        const bloco = {
            tipo: "texto_midia",
            props: { titulo: "Título normal", botaoTexto: "Comprar", botaoLink: "https://loja.exemplo.com" },
            design: {
                corFundo: ATTR_BREAKOUT_PAYLOAD,
                corBotaoFundo: ATTR_BREAKOUT_PAYLOAD,
                corBotaoBorda: ATTR_BREAKOUT_PAYLOAD,
                corBotaoTexto: ATTR_BREAKOUT_PAYLOAD,
                corTexto: ATTR_BREAKOUT_PAYLOAD,
                corSobreposicao: ATTR_BREAKOUT_PAYLOAD,
                imagemFundoB64: JS_URL_PAYLOAD
            }
        };
        const html = await renderizarBloco(bloco, "empilhado");
        assertHtmlSeguro(html, "cores de design");
    });
});

describe("renderizarBloco() real (index.html) — conteúdo legítimo continua funcionando (compatibilidade)", () => {
    it("texto_midia com título, subtítulo, CTA com link https e imagem https renderiza normalmente", async () => {
        const renderizarBloco = await carregarRenderizarBlocoReal();
        const bloco = {
            tipo: "texto_midia",
            props: {
                titulo: "Compre agora & economize",
                subtitulo: 'A melhor oferta da "temporada"',
                botaoTexto: "Quero comprar",
                botaoLink: "https://loja.exemplo.com/produto",
                imagemB64: "https://cdn.exemplo.com/foto.jpg"
            },
            design: {}
        };
        const html = await renderizarBloco(bloco, "empilhado");
        assert.match(html, /Compre agora &amp; economize/);
        assert.match(html, /href="https:\/\/loja\.exemplo\.com\/produto"/);
        assert.match(html, /src="https:\/\/cdn\.exemplo\.com\/foto\.jpg"/);
        assert.match(html, />Quero comprar</);
    });

    it("texto_rico preserva parágrafos separados por linha em branco", async () => {
        const renderizarBloco = await carregarRenderizarBlocoReal();
        const bloco = { tipo: "texto_rico", props: { conteudo: "Primeiro parágrafo.\n\nSegundo parágrafo." }, design: {} };
        const html = await renderizarBloco(bloco, "empilhado");
        assert.match(html, /<p>Primeiro parágrafo\.<\/p>/);
        assert.match(html, /<p>Segundo parágrafo\.<\/p>/);
    });

    it("navegação com link mailto: legítimo continua funcionando (allowlist inclui mailto/tel nesse contexto)", async () => {
        const renderizarBloco = await carregarRenderizarBlocoReal();
        const bloco = { tipo: "navegacao", props: { logoTexto: "Minha Loja", links: [{ href: "mailto:contato@loja.com", label: "Fale conosco" }] }, design: {} };
        const html = await renderizarBloco(bloco, "empilhado");
        assert.match(html, /href="mailto:contato@loja\.com"/);
    });

    it("codigo_iframe.htmlCustom continua intocado (sandbox real, sem allow-same-origin) — não regride PR #62", async () => {
        const renderizarBloco = await carregarRenderizarBlocoReal();
        const htmlCustom = "<script>document.title='ok'<\/script>";
        const bloco = { tipo: "codigo_iframe", props: { htmlCustom, altura: 300 }, design: {} };
        const html = await renderizarBloco(bloco, "empilhado");
        assert.match(html, /sandbox="allow-forms allow-popups allow-presentation allow-scripts"/);
        assert.ok(!html.includes("allow-same-origin"), "NUNCA pode incluir allow-same-origin");
        assert.ok(html.includes(htmlCustom.replace(/"/g, "&quot;")), "htmlCustom precisa continuar chegando ao srcdoc sem sanitização adicional (isolamento é via sandbox, não escaping)");
    });
});
