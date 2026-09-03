// LP-SEC-AUDIT-001/002 — hardening dos renderers de Landing Page. Testa os
// helpers puros de escaping/sanitização (lp-render-safety-core.js) isolados
// de DOM/Firestore. Ver renderizarBloco() (index.html) e
// renderizarBlocoPreview()/renderAbaConteudo()/renderAbaDesign()
// (dashboard-app.js) para o uso real em produção.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    escapeHTML,
    escapeAttribute,
    escapeTextareaContent,
    escapeCSSString,
    safeCSSColor,
    safeLinkURL,
    safeImageURL,
    safeIframeURL
} from "../lp-render-safety-core.js";

describe("escapeHTML — caracteres especiais e valores vazios", () => {
    it("escapa <, >, &, \", '", () => {
        assert.equal(escapeHTML(`<>&"'`), "&lt;&gt;&amp;&quot;&#039;");
    });
    it("null/undefined viram string vazia, nao 'null'/'undefined'", () => {
        assert.equal(escapeHTML(null), "");
        assert.equal(escapeHTML(undefined), "");
    });
    it("numero e coagido pra string sem quebrar", () => {
        assert.equal(escapeHTML(19.9), "19.9");
    });
    it("texto normal passa intacto (sem falso positivo)", () => {
        assert.equal(escapeHTML("Compre agora e ganhe 10% de desconto!"), "Compre agora e ganhe 10% de desconto!");
    });
});

describe("escapeAttribute — igual a escapeHTML mais backtick", () => {
    it("escapa backtick além do conjunto padrão", () => {
        assert.equal(escapeAttribute("`x`"), "&#096;x&#096;");
    });
    it("fecha o vetor de fuga de atributo (aspas duplas)", () => {
        const malicioso = `x" onmouseover="alert(1)`;
        const escapado = escapeAttribute(malicioso);
        assert.ok(!escapado.includes('"'), "nao pode sobrar aspas dupla literal");
    });
});

describe("escapeTextareaContent — fecha a sequencia de fechamento do textarea", () => {
    it("um payload com </textarea> nao produz a sequencia de fechamento literal", () => {
        const payload = "texto</textarea><img src=x onerror=alert(1)>";
        const escapado = escapeTextareaContent(payload);
        assert.ok(!escapado.includes("</textarea>"), "a sequencia de fechamento nao pode sobreviver intacta");
    });
});

// ADV-66-001/002 (revisão adversarial da PR #66): safeImageURL só valida
// esquema — o corpo de uma URL http(s) é livre. escapeCSSString fecha o
// contexto de STRING CSS (dentro de url('...')) — camada independente de
// escapeAttribute (contexto de ATRIBUTO HTML). As duas precisam ser
// aplicadas juntas, nessa ordem: escapeAttribute(escapeCSSString(url)).
describe("escapeCSSString — contexto de string CSS (dentro de url('...'))", () => {
    it("escapa backslash", () => {
        assert.equal(escapeCSSString("a\\b"), "a\\\\b");
    });
    it("escapa aspa simples", () => {
        assert.equal(escapeCSSString("a'b"), "a\\'b");
    });
    it('escapa aspa dupla', () => {
        assert.equal(escapeCSSString('a"b'), 'a\\"b');
    });
    it("escapa newline (LF) como escape hex CSS", () => {
        assert.equal(escapeCSSString("a\nb"), "a\\a b");
    });
    it("escapa CR", () => {
        assert.equal(escapeCSSString("a\rb"), "a\\d b");
    });
    it("escapa FF", () => {
        assert.equal(escapeCSSString("a\fb"), "a\\c b");
    });
    it("escapa NUL e outros control chars", () => {
        assert.equal(escapeCSSString("a\x00b"), "a\\0 b");
        assert.equal(escapeCSSString("a\x1fb"), "a\\1f b");
    });
    it("combinação de vários caracteres perigosos numa só chamada: nenhum sobrevive sem escape", () => {
        const entrada = `x');\\'"\n\r\f`;
        const saida = escapeCSSString(entrada);
        // Nenhuma aspa/backslash/control-char pode aparecer na saída sem
        // um backslash de escape imediatamente antes — senão o parser CSS
        // interpretaria como fim da string ou início de outra sequência.
        const semEscapes = saida.replace(/\\./g, "").replace(/\\[0-9a-f]{1,6} ?/g, "");
        assert.ok(!/['"\\\n\r\f\x00-\x1f]/.test(semEscapes), `sobrou caractere perigoso sem escape: ${JSON.stringify(semEscapes)}`);
    });
    it("string vazia/ausente", () => {
        assert.equal(escapeCSSString(""), "");
        assert.equal(escapeCSSString(null), "");
        assert.equal(escapeCSSString(undefined), "");
    });
    it("Unicode legítimo (acentos, emoji) passa intacto", () => {
        assert.equal(escapeCSSString("café ☕ 日本語"), "café ☕ 日本語");
    });
    it("URL normal sem caracteres especiais passa intacta", () => {
        assert.equal(escapeCSSString("https://cdn.exemplo.com/foto.jpg?w=200&h=100"), "https://cdn.exemplo.com/foto.jpg?w=200&h=100");
    });

    describe("composição safeImageURL -> escapeCSSString -> escapeAttribute — nenhuma aspa sobrevive intacta pro navegador decodificar", () => {
        it("ADV-66-001: esquema válido + corpo tentando fechar o atributo style", () => {
            const payload = 'https://x/x.png"><img src=x onerror="pwn()">';
            const seguro = safeImageURL(payload);
            assert.equal(seguro, payload, "sanity: safeImageURL só valida esquema, propaga o corpo inalterado");
            const final = escapeAttribute(escapeCSSString(seguro));
            assert.ok(!final.includes('"'), "nenhuma aspa dupla literal pode sobreviver — precisa virar &quot; (a barra que a precede não protege contra o navegador decodificar a entidade)");
            assert.ok(!final.includes("<") && !final.includes(">"), "< e > também precisam estar como entidade");
        });
        it("ADV-66-002: esquema válido + corpo tentando fechar url('...') e injetar declaração CSS", () => {
            const payload = "https://x/y.png');position:fixed;top:0;left:0;((";
            const seguro = safeImageURL(payload);
            const final = escapeAttribute(escapeCSSString(seguro));
            assert.ok(!final.includes("'"), "nenhuma aspa simples literal pode sobreviver — precisa estar escapada em ambas as camadas (\\&#039; ou equivalente)");
        });
        it("URL legítima sobrevive ao pipeline completo sem alteração", () => {
            const legitima = "https://cdn.exemplo.com/foto.jpg";
            assert.equal(escapeAttribute(escapeCSSString(safeImageURL(legitima))), legitima);
        });
    });
});

// PR70-REV-001: as cores de design (corFundo/corTexto/corSobreposicao/
// corBotaoFundo/corBotaoBorda/corBotaoTexto) são interpoladas como VALOR
// BARE de propriedade CSS dentro do atributo style (ex.:
// `background-color:${valor};`) — um contexto onde escapeAttribute não
// impede que um ";" solto encerre a declaração e injete uma nova, sem
// nunca tocar a aspa que delimita o próprio atributo style. safeCSSColor
// fecha esse vetor na origem com allowlist (#RRGGBB), não denylist.
describe("safeCSSColor — allowlist de cor pra contexto de VALOR BARE de propriedade CSS (style=)", () => {
    it("hex válido de 6 dígitos (minúsculo) é aceito intacto", () => {
        assert.equal(safeCSSColor("#5b3df5"), "#5b3df5");
    });
    it("hex válido de 6 dígitos (maiúsculo) é aceito intacto", () => {
        assert.equal(safeCSSColor("#5B3DF5"), "#5B3DF5");
    });
    it("hex válido com dígitos e letras misturados é aceito", () => {
        assert.equal(safeCSSColor("#a1B2c3"), "#a1B2c3");
    });
    it("espaço em branco ao redor de um hex válido é aparado", () => {
        assert.equal(safeCSSColor("  #ffffff  "), "#ffffff");
    });
    it("payload de injeção de declaração CSS (PR70-REV-001) é rejeitado, nunca ecoado", () => {
        const payload = "red;position:fixed;inset:0;z-index:999999";
        assert.equal(safeCSSColor(payload), "");
    });
    it("payload de injeção via background-image/url(...) é rejeitado", () => {
        const payload = 'red;background-image:url("https://example.invalid/pwn")';
        assert.equal(safeCSSColor(payload), "");
    });
    it("hex de 3 dígitos (#RGB abreviado) é rejeitado — só #RRGGBB é o formato comprovado emitido pelo produto", () => {
        assert.equal(safeCSSColor("#fff"), "");
    });
    it("hex de 8 dígitos (com alpha) é rejeitado", () => {
        assert.equal(safeCSSColor("#ffffffff"), "");
    });
    it("nome de cor CSS (red, currentColor) é rejeitado — fora da allowlist", () => {
        assert.equal(safeCSSColor("red"), "");
        assert.equal(safeCSSColor("currentColor"), "");
    });
    it("rgb()/rgba()/hsl()/var(--x) são rejeitados — abririam parênteses fora da allowlist", () => {
        assert.equal(safeCSSColor("rgb(255,0,0)"), "");
        assert.equal(safeCSSColor("rgba(255,0,0,.5)"), "");
        assert.equal(safeCSSColor("hsl(0,100%,50%)"), "");
        assert.equal(safeCSSColor("var(--cor-perigosa)"), "");
    });
    it("hex sem o # inicial é rejeitado", () => {
        assert.equal(safeCSSColor("5B3DF5"), "");
    });
    it("vazio/ausente sem fallback retorna string vazia", () => {
        assert.equal(safeCSSColor(""), "");
        assert.equal(safeCSSColor(null), "");
        assert.equal(safeCSSColor(undefined), "");
    });
    it("candidato inválido cai pro fallback quando o fallback é um hex válido", () => {
        assert.equal(safeCSSColor("red;position:fixed", "#000000"), "#000000");
        assert.equal(safeCSSColor(null, "#ffffff"), "#ffffff");
    });
    it("fallback também passa pela MESMA allowlist — nunca é ecoado cru", () => {
        assert.equal(safeCSSColor("", "red;position:fixed;inset:0;z-index:999999"), "");
        assert.equal(safeCSSColor(undefined, "javascript:alert(1)"), "");
    });
    it("candidato válido tem prioridade sobre o fallback (fallback só é usado se o candidato falhar)", () => {
        assert.equal(safeCSSColor("#123456", "#000000"), "#123456");
    });
    it("nem candidato nem fallback válidos: retorna string vazia (nunca undefined/null/valor não confiável)", () => {
        assert.equal(safeCSSColor("not-a-color", "also-not-a-color"), "");
    });
});

describe("XSS — payloads clássicos nunca produzem tag/handler ativo depois do escape", () => {
    const payloads = [
        "<script>alert(1)</script>",
        '<img src=x onerror=alert(1)>',
        '"><svg onload=alert(1)>',
        '"></a><script>alert(1)</script>',
        "<body onload=alert(1)>"
    ];
    for (const payload of payloads) {
        it(`escapeHTML neutraliza: ${payload}`, () => {
            const escapado = escapeHTML(payload);
            assert.ok(!escapado.includes("<script"), "nao pode conter <script literal");
            assert.ok(!/<[a-z]/i.test(escapado), "nao pode conter nenhuma tag HTML literal aberta");
        });
    }
});

describe("safeLinkURL — política de link (CTA, navegação, rodapé, breadcrumb, banner)", () => {
    it("http/https sempre permitidos", () => {
        assert.equal(safeLinkURL("https://exemplo.com/promo"), "https://exemplo.com/promo");
        assert.equal(safeLinkURL("http://exemplo.com"), "http://exemplo.com");
    });
    it("caminhos relativos legítimos permitidos: #, /, ./, ../", () => {
        assert.equal(safeLinkURL("#secao"), "#secao");
        assert.equal(safeLinkURL("/loja/produtos"), "/loja/produtos");
        assert.equal(safeLinkURL("./pagina"), "./pagina");
        assert.equal(safeLinkURL("../outra"), "../outra");
    });
    it("mailto:/tel: só quando explicitamente habilitado", () => {
        assert.equal(safeLinkURL("mailto:loja@exemplo.com"), "#");
        assert.equal(safeLinkURL("tel:+5511999999999"), "#");
        assert.equal(safeLinkURL("mailto:loja@exemplo.com", { allowMailto: true }), "mailto:loja@exemplo.com");
        assert.equal(safeLinkURL("tel:+5511999999999", { allowTel: true }), "tel:+5511999999999");
    });
    it("vazio/ausente cai no fallback (# por padrão)", () => {
        assert.equal(safeLinkURL(""), "#");
        assert.equal(safeLinkURL(null), "#");
        assert.equal(safeLinkURL(undefined, { fallback: "" }), "");
    });
    it("bloqueia javascript: em qualquer capitalização", () => {
        assert.equal(safeLinkURL("javascript:alert(1)"), "#");
        assert.equal(safeLinkURL("JaVaScRiPt:alert(1)"), "#");
    });
    it("bloqueia whitespace/control-char prefixado antes do esquema perigoso", () => {
        assert.equal(safeLinkURL("\tjavascript:alert(1)"), "#");
        assert.equal(safeLinkURL("\n\rjavascript:alert(1)"), "#");
        assert.equal(safeLinkURL("   javascript:alert(1)"), "#");
    });
    it("bloqueia vbscript:, file:, data:text/html e esquemas desconhecidos", () => {
        assert.equal(safeLinkURL("vbscript:msgbox(1)"), "#");
        assert.equal(safeLinkURL("file:///etc/passwd"), "#");
        assert.equal(safeLinkURL("data:text/html,<script>alert(1)</script>"), "#");
        assert.equal(safeLinkURL("intent://malicioso"), "#");
    });
    it("bloqueia protocol-relative //", () => {
        assert.equal(safeLinkURL("//evil.example.com/phish"), "#");
    });
});

describe("safeImageURL — allowlist restrita de imagem", () => {
    it("https legítimo permitido", () => {
        assert.equal(safeImageURL("https://cdn.exemplo.com/foto.png"), "https://cdn.exemplo.com/foto.png");
    });
    it("caminho relativo legítimo permitido", () => {
        assert.equal(safeImageURL("/uploads/foto.jpg"), "/uploads/foto.jpg");
    });
    it("data:image raster (png/jpeg/webp/gif) permitido", () => {
        const b64 = "data:image/png;base64,iVBORw0KGgo=";
        assert.equal(safeImageURL(b64), b64);
        assert.equal(safeImageURL("data:image/jpeg;base64,/9j/4AAQ="), "data:image/jpeg;base64,/9j/4AAQ=");
    });
    it("data:image/svg+xml bloqueado (pode carregar script/handler)", () => {
        assert.equal(safeImageURL("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="), "");
    });
    it("data:text/html bloqueado", () => {
        assert.equal(safeImageURL("data:text/html,<script>alert(1)</script>"), "");
    });
    it("javascript: bloqueado", () => {
        assert.equal(safeImageURL("javascript:alert(1)"), "");
    });
    it("vazio/ausente vira string vazia (sem atributo src)", () => {
        assert.equal(safeImageURL(""), "");
        assert.equal(safeImageURL(null), "");
    });
});

describe("safeIframeURL — política própria, mais restrita que link (codigo_iframe.props.url)", () => {
    it("http/https permitidos", () => {
        assert.equal(safeIframeURL("https://exemplo.com/embed"), "https://exemplo.com/embed");
    });
    it("caminho relativo permitido", () => {
        assert.equal(safeIframeURL("/embed/mapa"), "/embed/mapa");
    });
    it("NUNCA reaproveita mailto:/tel: mesmo sem passar allow* (contrato diferente de safeLinkURL)", () => {
        assert.equal(safeIframeURL("mailto:loja@exemplo.com"), "");
        assert.equal(safeIframeURL("tel:+5511999999999"), "");
    });
    it("bloqueia javascript:/data:/vbscript:/file:", () => {
        assert.equal(safeIframeURL("javascript:alert(1)"), "");
        assert.equal(safeIframeURL("data:text/html,<script>alert(1)</script>"), "");
        assert.equal(safeIframeURL("vbscript:msgbox(1)"), "");
        assert.equal(safeIframeURL("file:///etc/passwd"), "");
    });
    it("bloqueia protocol-relative //", () => {
        assert.equal(safeIframeURL("//evil.example.com"), "");
    });
    it("vazio vira string vazia", () => {
        assert.equal(safeIframeURL(""), "");
    });
});
