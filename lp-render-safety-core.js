// Helpers puros de escaping/sanitização usados pelos renderers de blocos de
// Landing Page — extraídos pra permitir testes reais via `node --test`
// (mesmo padrão de lead-attempt-token-core.js/catalogo-produtos-core.js).
// Usado por index.html (renderer público) e dashboard-app.js (preview do
// editor básico e painel de propriedades).
//
// LP-SEC-AUDIT-001/002 (diagnóstico read-only anterior, mesma sessão):
// nenhum dos dois renderers ativos escapava campo comum de bloco (título,
// subtítulo, texto, CTA, cards, FAQ, tabela, navegação, rodapé etc.) nem
// validava esquema de URL em href/src/iframe src — comprovado por PoC local
// (execução real de renderizarBloco()) produzindo <script> e
// href="javascript:..." intactos no HTML. Este módulo fecha os dois vetores
// na origem, por contexto (não "escape tudo cegamente"):
//   - TEXT/ATTRIBUTE: escapeHTML/escapeAttribute.
//   - URL: validar esquema PRIMEIRO (safeLinkURL/safeImageURL/
//     safeIframeURL), só depois escapar o valor já validado como atributo.
//
// codigo_iframe.htmlCustom continua INTOCADO por este módulo — já isolado
// pelo sandbox da PR #62 (allow-forms allow-popups allow-presentation
// allow-scripts, sem allow-same-origin) e existe justamente pra permitir
// HTML/script arbitrário do dono dentro desse isolamento.
export function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Mesmo contrato de escapeHTML, mais o backtick — irrelevante para HTML em
// si, mas fecha o caso de o valor escapado ser reaproveitado dentro de uma
// template string JS em algum outro ponto (defesa em profundidade barata).
export function escapeAttribute(value) {
    return escapeHTML(value).replace(/`/g, "&#096;");
}

// Textarea usa um estado de tokenizer diferente de tag/atributo comum: o
// parser HTML só procura a sequência literal "</textarea" pra fechar o
// elemento — não decodifica entidades nesse meio-tempo. escapeHTML já
// escapa "<", suficiente pra impedir a sequência de fechamento aparecer
// intacta (";" também escapado por padrão, sem efeito colateral: o
// navegador decodifica de volta ao exibir o valor pro usuário).
export function escapeTextareaContent(value) {
    return escapeHTML(value);
}

const RESERVED_URL_PREFIX = /^[\s\x00-\x1f]*([a-z][a-z0-9+.-]*):/i;

// Extrai o esquema real de uma URL ignorando espaço em branco/control chars
// no início (técnica clássica de bypass: " javascript:", "\tjavascript:",
// "java\tscript:" não passam aqui porque a regex exige o nome do esquema
// contíguo logo após os espaços iniciais — um "java\tscript:" não bate
// com [a-z][a-z0-9+.-]* de jeito nenhum, cai no fallback de URL relativa e
// portanto é tratado como caminho, nunca como esquema perigoso disfarçado).
function extrairEsquema(raw) {
    const m = RESERVED_URL_PREFIX.exec(raw);
    return m ? m[1].toLowerCase() : null;
}

// Política de link (href de CTA, navegação, rodapé, breadcrumb, banner):
// http(s) sempre; mailto:/tel: só quando o contexto de fato permite (nunca
// por padrão); caminho relativo (#, /, ./, ../) sempre, exceto
// protocol-relative "//" (que na prática resolve pro esquema da página
// atual — comportamento surpreendente, sem uso legítimo conhecido nos
// campos de LP, bloqueado por segurança). Qualquer outro esquema
// (javascript:, vbscript:, file:, data:, etc.) cai no fallback.
export function safeLinkURL(value, options) {
    const opts = options || {};
    const raw = String(value ?? "").trim();
    const fallback = opts.fallback !== undefined ? opts.fallback : "#";
    if (!raw) return fallback;
    if (/^\/\//.test(raw)) return fallback;
    const esquema = extrairEsquema(raw);
    if (esquema === null) {
        if (/^[#/.]/.test(raw)) return raw;
        return fallback;
    }
    if (esquema === "http" || esquema === "https") return raw;
    if (esquema === "mailto" && opts.allowMailto) return raw;
    if (esquema === "tel" && opts.allowTel) return raw;
    return fallback;
}

// Política de imagem: http(s), caminho relativo, ou data:image/(png|jpg|
// jpeg|webp|gif);base64 — a MESMA allowlist restrita já usada como
// referência em studio-canonical-renderers-v1.js (safeImage), reaproveitada
// aqui como ideia, não como módulo conectado. Exclui deliberadamente
// data:image/svg+xml (SVG pode carregar <script>/handlers) e qualquer
// data:text/* ou data:application/*.
export function safeImageURL(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    if (/^\/\//.test(raw)) return "";
    const esquema = extrairEsquema(raw);
    if (esquema === null) {
        if (/^[/.]/.test(raw)) return raw;
        return "";
    }
    if (esquema === "http" || esquema === "https") return raw;
    if (esquema === "data") {
        return /^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(raw) ? raw : "";
    }
    return "";
}

// Política de iframe src (codigo_iframe SEM htmlCustom — bloco.props.url):
// deliberadamente MAIS restrita que safeLinkURL — nunca reutiliza mailto:/
// tel:/data: (não fazem sentido como destino de iframe e ampliariam a
// superfície à toa). Só http(s) e caminho relativo.
export function safeIframeURL(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    if (/^\/\//.test(raw)) return "";
    const esquema = extrairEsquema(raw);
    if (esquema === null) {
        if (/^[#/.]/.test(raw)) return raw;
        return "";
    }
    if (esquema === "http" || esquema === "https") return raw;
    return "";
}
