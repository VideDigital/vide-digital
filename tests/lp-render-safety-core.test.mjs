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
