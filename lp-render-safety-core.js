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

// ADV-66-001/002 (revisão adversarial da PR #66): safeImageURL só valida
// ESQUEMA — o corpo de uma URL http(s) é livre. Quando esse valor entra
// dentro de uma string CSS (dentro de url(...)), escapeAttribute (que só
// entende o contexto de ATRIBUTO HTML) não é suficiente sozinho: o
// navegador decodifica entidades HTML do atributo style ANTES de entregar
// o texto pro parser CSS, então uma aspa escapada como entidade HTML volta
// a ser um caractere literal exatamente no momento em que o CSS interpreta
// o valor — o que permite fechar a string CSS e injetar declaração
// adicional (ou, sem NENHUM escaping de atributo por cima — caso do achado
// original —, fechar o próprio atributo style e criar markup ativo).
// Contrato de 3 camadas independentes, cada uma resolvendo só o seu
// contexto (URL VALIDATION -> CSS STRING ENCODING -> HTML ATTRIBUTE
// ENCODING); nenhuma substitui a outra — uso correto:
//   const seguro = escapeAttribute(escapeCSSString(safeImageURL(raw)));
const CSS_STRING_ESCAPE_CODES = buildCssStringEscapeCodes();

function buildCssStringEscapeCodes() {
    const codes = new Set();
    codes.add(92); // backslash
    codes.add(39); // '
    codes.add(34); // "
    for (let c = 0; c <= 31; c += 1) codes.add(c); // controle, inclui NUL/LF/CR/FF
    codes.add(127); // DEL
    return codes;
}

export function escapeCSSString(value) {
    const raw = String(value ?? "");
    let out = "";
    for (let i = 0; i < raw.length; i += 1) {
        const code = raw.charCodeAt(i);
        if (!CSS_STRING_ESCAPE_CODES.has(code)) {
            out += raw[i];
            continue;
        }
        if (code === 92) { out += "\\\\"; continue; }
        if (code === 39) { out += "\\'"; continue; }
        if (code === 34) { out += '\\"'; continue; }
        // Controle (inclui NUL/LF/CR/FF) e DEL: um literal newline/NUL
        // dentro de uma string CSS quoted encerra o token cedo demais
        // ("bad string" — erro de parse) — escape hex padrão do CSS
        // (backslash + hex do codepoint + espaço, pra nunca grudar no
        // próximo dígito hex de um caractere adjacente).
        out += "\\" + code.toString(16) + " ";
    }
    return out;
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

// PR70-REV-001: as cores de design (design.corFundo/corTexto/
// corSobreposicao/corBotaoFundo/corBotaoBorda/corBotaoTexto) são
// interpoladas como VALOR BARE de propriedade CSS dentro do atributo style
// (ex.: `background-color:${valor};`) — um contexto que escapeAttribute
// NÃO cobre: "}" e aspas não têm papel especial aqui, mas ";" sozinho já
// encerra a declaração e abre uma nova dentro do MESMO atributo style
// (ex.: "red;position:fixed;inset:0;z-index:999999" produz uma segunda
// declaração CSS ativa, sem nunca tocar na aspa que delimita o atributo).
// Allowlist, não denylist: só #RRGGBB (6 dígitos hex) é aceito — o único
// formato realmente emitido por qualquer preset/paleta/seletor de cor do
// produto — então nenhum ";", "(", "url(" ou qualquer outro token com
// potencial de injeção jamais atravessa esta função. fallback passa pela
// MESMA validação (nunca é ecoado cru); se nem o valor nem o fallback
// forem hex válidos, retorna "" (produz uma declaração CSS vazia/omitida,
// nunca um valor não confiável). Uso correto (validar ANTES de escapar
// atributo, nunca o contrário, e nunca usar escapeCSSString aqui — esse
// helper é para contexto de STRING CSS quoted, ex. url('...'), não para
// valor bare de propriedade):
//   const seguro = escapeAttribute(safeCSSColor(corBruta, corFallback));
const SAFE_CSS_COLOR = /^#[0-9a-f]{6}$/i;

export function safeCSSColor(value, fallback = "") {
    const candidate = String(value ?? "").trim();
    if (SAFE_CSS_COLOR.test(candidate)) return candidate;
    const fallbackCandidate = String(fallback ?? "").trim();
    if (SAFE_CSS_COLOR.test(fallbackCandidate)) return fallbackCandidate;
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
