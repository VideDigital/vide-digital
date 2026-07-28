/* =========================================================
   VIDE HUB — CENTRAL DE CRESCIMENTO & RASTREAMENTO V1
   Funções puras: normalização de UTM, construção de URL,
   validação de pixels, decisão de consentimento, mapeamento de
   eventos, remoção de PII e cálculos de métricas. Sem DOM, sem
   Firebase — usado tanto pelo dashboard (growth-tracking-v1.js)
   quanto pela loja pública (public-tracking-v1.js) e testado
   direto pelo Node (tests/tracking-core-v1.test.mjs).
   ========================================================= */

export const LIMITE_TRACKING_LINKS = 100;

export const CONSENTIMENTO_VERSAO_ATUAL = 1;

export const CATEGORIAS_CONSENTIMENTO = Object.freeze([
    "analytics",
    "marketing"
]);

export const PRESETS_UTM = Object.freeze([
    { id: "instagram-bio", nome: "Instagram Bio", source: "instagram", medium: "bio" },
    { id: "instagram-stories", nome: "Instagram Stories", source: "instagram", medium: "stories" },
    { id: "meta-ads", nome: "Meta Ads", source: "meta", medium: "cpc" },
    { id: "google-ads", nome: "Google Ads", source: "google", medium: "cpc" },
    { id: "tiktok", nome: "TikTok", source: "tiktok", medium: "social" },
    { id: "whatsapp", nome: "WhatsApp", source: "whatsapp", medium: "social" },
    { id: "email", nome: "E-mail", source: "email", medium: "email" },
    { id: "afiliado", nome: "Afiliado", source: "afiliado", medium: "referral" },
    { id: "outro", nome: "Outro", source: "", medium: "" }
]);

// Eventos que a loja pública pode disparar pros pixels — nunca inclui
// "purchase": o checkout atual finaliza via WhatsApp e não confirma
// pagamento nenhum, então disparar Purchase seria dado falso.
export const EVENTOS_PERMITIDOS = Object.freeze([
    "page_view",
    "view_content",
    "product_click",
    "add_to_cart",
    "initiate_checkout",
    "lead",
    "contact",
    "chat_started"
]);

// Nomes de campo que nunca podem ir num payload de evento de
// rastreamento, em nenhuma plataforma — dado pessoal identificável.
const CAMPOS_PROIBIDOS_PAYLOAD = Object.freeze([
    "nome",
    "nomeCliente",
    "clienteNome",
    "telefone",
    "clienteTelefone",
    "whatsapp",
    "email",
    "endereco",
    "cep",
    "texto",
    "mensagem",
    "observacoes",
    "observacao",
    "cpf",
    "documento"
]);

function textoSeguro(valor, limite) {
    return String(valor ?? "")
        .replace(/<[^>]*>/g, "")
        .trim()
        .slice(0, limite);
}

export function normalizarUtmValor(valor, limite = 120) {
    return textoSeguro(valor, limite)
        .toLowerCase()
        .replace(/\s+/g, "-");
}

function urlEhSeguraParaBase(valor) {
    if (typeof valor !== "string" || valor.trim() === "") {
        return false;
    }

    let url;

    try {
        url = new URL(valor.trim());
    } catch {
        return false;
    }

    return url.protocol === "http:" || url.protocol === "https:";
}

// Constrói a URL final com os parâmetros utm_*, preservando qualquer
// query string que a baseUrl já tivesse (nunca sobrescreve parâmetros
// que não são utm_*). Só aceita http/https — nunca javascript:/data:
// nem qualquer outro esquema.
export function construirUrlComUtm({
    baseUrl,
    source,
    medium,
    campaign,
    content,
    term
} = {}) {
    if (!urlEhSeguraParaBase(baseUrl)) {
        return { ok: false, erro: "URL base inválida — use http:// ou https://." };
    }

    const source_ = normalizarUtmValor(source);
    const campaign_ = normalizarUtmValor(campaign);

    if (!source_) {
        return { ok: false, erro: "utm_source é obrigatório." };
    }

    if (!campaign_) {
        return { ok: false, erro: "utm_campaign é obrigatório." };
    }

    const url = new URL(baseUrl.trim());

    url.searchParams.set("utm_source", source_);
    url.searchParams.set("utm_campaign", campaign_);

    const medium_ = normalizarUtmValor(medium);
    if (medium_) url.searchParams.set("utm_medium", medium_);

    const content_ = normalizarUtmValor(content);
    if (content_) url.searchParams.set("utm_content", content_);

    const term_ = normalizarUtmValor(term);
    if (term_) url.searchParams.set("utm_term", term_);

    return { ok: true, url: url.toString() };
}

export function validarTrackingLink({
    nome,
    baseUrl,
    source,
    campaign
} = {}) {
    const erros = [];

    if (!textoSeguro(nome, 80)) {
        erros.push("Nome interno da campanha é obrigatório.");
    }

    if (!urlEhSeguraParaBase(baseUrl)) {
        erros.push("URL base inválida — use http:// ou https://.");
    }

    if (!normalizarUtmValor(source)) {
        erros.push("utm_source é obrigatório.");
    }

    if (!normalizarUtmValor(campaign)) {
        erros.push("utm_campaign é obrigatório.");
    }

    return { ok: erros.length === 0, erros };
}

// ===== Pixels =====

export function validarMetaPixelId(valor) {
    const limpo = textoSeguro(valor, 40);
    return /^\d{10,20}$/.test(limpo) ? limpo : null;
}

export function validarGa4MeasurementId(valor) {
    const limpo = textoSeguro(valor, 20).toUpperCase();
    return /^G-[A-Z0-9]{4,16}$/.test(limpo) ? limpo : null;
}

export function validarTiktokPixelId(valor) {
    const limpo = textoSeguro(valor, 40);
    return /^[A-Za-z0-9]{8,32}$/.test(limpo) ? limpo : null;
}

// ===== Consentimento (loja pública) =====

export function chaveConsentimento(storeSlug) {
    return "videTrackingConsentV1:" + String(storeSlug || "");
}

export function normalizarConsentimento(bruto) {
    let dados = bruto;

    if (typeof bruto === "string") {
        try {
            dados = JSON.parse(bruto);
        } catch {
            return null;
        }
    }

    if (!dados || typeof dados !== "object") {
        return null;
    }

    if (dados.version !== CONSENTIMENTO_VERSAO_ATUAL) {
        return null;
    }

    return {
        version: CONSENTIMENTO_VERSAO_ATUAL,
        analytics: Boolean(dados.analytics),
        marketing: Boolean(dados.marketing),
        updatedAt: typeof dados.updatedAt === "number"
            ? dados.updatedAt
            : Date.now()
    };
}

export function consentimentoPermite(consentimento, categoria) {
    if (categoria === "necessarios") {
        return true;
    }

    if (!consentimento) {
        return false;
    }

    return Boolean(consentimento[categoria]);
}

export function decidirCarregarAnalytics(consentimento) {
    return consentimentoPermite(consentimento, "analytics");
}

export function decidirCarregarMarketing(consentimento) {
    return consentimentoPermite(consentimento, "marketing");
}

// ===== Eventos =====

export function eventoPermitido(nome) {
    return EVENTOS_PERMITIDOS.includes(String(nome || ""));
}

// PII nunca sai daqui — remove qualquer campo proibido, mesmo que
// tenha sido passado por engano, em vez de confiar que quem chamou
// track() nunca vai errar.
export function removerCamposProibidos(payload) {
    if (!payload || typeof payload !== "object") {
        return {};
    }

    const limpo = {};

    for (const [chave, valor] of Object.entries(payload)) {
        if (CAMPOS_PROIBIDOS_PAYLOAD.includes(chave)) {
            continue;
        }

        limpo[chave] = valor;
    }

    return limpo;
}

const MAPA_EVENTO_META = Object.freeze({
    page_view: "PageView",
    view_content: "ViewContent",
    product_click: "ViewContent",
    add_to_cart: "AddToCart",
    initiate_checkout: "InitiateCheckout",
    lead: "Lead",
    contact: "Contact",
    chat_started: "Contact"
});

const MAPA_EVENTO_GA4 = Object.freeze({
    page_view: "page_view",
    view_content: "view_item",
    product_click: "select_item",
    add_to_cart: "add_to_cart",
    initiate_checkout: "begin_checkout",
    lead: "generate_lead",
    contact: "contact",
    chat_started: "chat_started"
});

const MAPA_EVENTO_TIKTOK = Object.freeze({
    page_view: "PageView",
    view_content: "ViewContent",
    product_click: "ViewContent",
    add_to_cart: "AddToCart",
    initiate_checkout: "InitiateCheckout",
    lead: "SubmitForm",
    contact: "Contact",
    chat_started: "Contact"
});

const MAPAS_POR_PLATAFORMA = Object.freeze({
    meta: MAPA_EVENTO_META,
    ga4: MAPA_EVENTO_GA4,
    tiktok: MAPA_EVENTO_TIKTOK
});

export function mapearEventoParaPlataforma(nomeEvento, plataforma) {
    if (!eventoPermitido(nomeEvento)) {
        return null;
    }

    const mapa = MAPAS_POR_PLATAFORMA[plataforma];
    return mapa ? (mapa[nomeEvento] ?? null) : null;
}

// ===== Métricas / cálculos (KPIs da Central) =====

export function calcularConversaoAproximada(leads, sessoes) {
    const totalLeads = Number(leads) || 0;
    const totalSessoes = Number(sessoes) || 0;

    if (totalSessoes <= 0) {
        return null;
    }

    return (totalLeads / totalSessoes) * 100;
}

export function calcularTempoMedioSegundos(totalTempoTela, totalSessoes) {
    const tempo = Number(totalTempoTela) || 0;
    const sessoes = Number(totalSessoes) || 0;

    if (sessoes <= 0) {
        return null;
    }

    return tempo / sessoes;
}

function timestampParaMillis(valor) {
    if (valor == null) return null;
    if (typeof valor === "number") return valor;
    if (valor instanceof Date) return valor.getTime();
    if (typeof valor.toMillis === "function") return valor.toMillis();
    if (typeof valor.seconds === "number") return valor.seconds * 1000;
    return null;
}

export function filtrarLeadsPorPeriodo(leads, periodoDias, agora = Date.now()) {
    const lista = Array.isArray(leads) ? leads : [];

    if (!periodoDias) {
        return lista;
    }

    const limite = agora - (periodoDias * 24 * 60 * 60 * 1000);

    return lista.filter(lead => {
        const millis = timestampParaMillis(
            lead?.criadoEm ?? lead?.timestamp
        );

        return millis != null && millis >= limite;
    });
}

// porDia vem de metricas_vitrines/{ownerUid}.porDia — mapa
// { "YYYY-MM-DD": { sessoes, cliques, tempo, visualizacoes } }
// (ver functions/src/public/index.js#incrementPublicMetric). Soma só
// os dias dentro do período, sem reprocessar o total inteiro sempre
// que o período muda.
export function datasDoPeriodo(periodoDias, agora = Date.now()) {
    if (!periodoDias) {
        return null;
    }

    const datas = [];

    for (let i = 0; i < periodoDias; i += 1) {
        const data = new Date(agora - (i * 24 * 60 * 60 * 1000));
        datas.push(data.toISOString().slice(0, 10));
    }

    return datas;
}

export function somarMetricasPorDia(porDia, periodoDias, agora = Date.now()) {
    const dias = porDia && typeof porDia === "object" ? porDia : {};
    const datas = datasDoPeriodo(periodoDias, agora);

    const chaves = datas || Object.keys(dias);

    let sessoes = 0;
    let cliques = 0;
    let tempo = 0;
    const serie = [];

    for (const dataChave of chaves) {
        const dia = dias[dataChave] || {};
        sessoes += Number(dia.sessoes) || 0;
        cliques += Number(dia.cliques) || 0;
        tempo += Number(dia.tempo) || 0;

        serie.push({
            data: dataChave,
            sessoes: Number(dia.sessoes) || 0,
            cliques: Number(dia.cliques) || 0
        });
    }

    serie.sort((a, b) => a.data.localeCompare(b.data));

    return { sessoes, cliques, tempo, serie };
}

export function agruparLeadsPorOrigem(leads) {
    const contagem = new Map();

    for (const lead of Array.isArray(leads) ? leads : []) {
        const origem = textoSeguro(
            lead?.utmSource,
            60
        ) || "Direto / outros";

        contagem.set(origem, (contagem.get(origem) || 0) + 1);
    }

    return Array.from(contagem.entries())
        .map(([origem, total]) => ({ origem, total }))
        .sort((a, b) => b.total - a.total);
}
