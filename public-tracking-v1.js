/* =========================================================
   VIDE HUB — CENTRAL DE CRESCIMENTO & RASTREAMENTO V1
   Loader público da loja (loja.html): banner de consentimento,
   carregamento condicional de pixels oficiais e API de eventos
   sem PII. Nenhum script de terceiro é carregado antes do
   visitante decidir sobre o banner. Sem eval, sem HTML vindo do
   usuário — só URLs oficiais fixas das próprias plataformas.
   ========================================================= */

import {
    chaveConsentimento,
    consentimentoPermite,
    decidirCarregarAnalytics,
    decidirCarregarMarketing,
    eventoPermitido,
    mapearEventoParaPlataforma,
    normalizarConsentimento,
    removerCamposProibidos,
    CONSENTIMENTO_VERSAO_ATUAL
} from "./tracking-core-v1.js";

const URL_META_PIXEL = "https://connect.facebook.net/en_US/fbevents.js";
const URL_GA4 = "https://www.googletagmanager.com/gtag/js";
const URL_TIKTOK_PIXEL = "https://analytics.tiktok.com/i18n/pixel/events.js";

let estado = null;

function lerConsentimentoSalvo(slug) {
    try {
        const bruto = window.localStorage.getItem(chaveConsentimento(slug));
        return bruto ? normalizarConsentimento(bruto) : null;
    } catch {
        return null;
    }
}

function salvarConsentimento(slug, consentimento) {
    try {
        window.localStorage.setItem(
            chaveConsentimento(slug),
            JSON.stringify(consentimento)
        );
    } catch {
        // localStorage indisponível (modo privado, quota) — segue sem
        // persistir; o banner volta a aparecer na próxima visita.
    }
}

function carregarScriptOficial(src) {
    return new Promise(resolve => {
        if (document.querySelector(`script[src^="${src}"]`)) {
            resolve(true);
            return;
        }

        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.head.appendChild(script);
    });
}

function carregarMetaPixel(id) {
    if (window.fbq) return;

    window._fbq = window._fbq || function fbqStub() {
        (window._fbq.callMethod
            ? window._fbq.callMethod.apply(window._fbq, arguments)
            : window._fbq.queue.push(arguments));
    };
    window.fbq = window.fbq || window._fbq;
    window.fbq.queue = [];
    window.fbq.loaded = true;
    window.fbq.version = "2.0";

    carregarScriptOficial(URL_META_PIXEL).then(ok => {
        if (!ok) return;
        window.fbq("init", id);
        window.fbq("track", "PageView");
    });
}

function carregarGa4(id) {
    if (window.gtag) return;

    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
        window.dataLayer.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("config", id);

    carregarScriptOficial(`${URL_GA4}?id=${encodeURIComponent(id)}`);
}

function carregarTikTokPixel(id) {
    if (window.ttq) return;

    const ttqStub = window.ttq = window.ttq || [];
    if (ttqStub.methods) return;

    ttqStub.methods = [
        "page", "track", "identify", "instances", "debug",
        "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie"
    ];

    ttqStub.setAndDefer = function setAndDefer(t, e) {
        t[e] = function ttqDefer() {
            t.push([e].concat(Array.prototype.slice.call(arguments, 0)));
        };
    };

    ttqStub.methods.forEach(metodo => ttqStub.setAndDefer(ttqStub, metodo));

    ttqStub.instance = function instance() {
        return ttqStub;
    };

    ttqStub.load = function load(pixelId) {
        carregarScriptOficial(`${URL_TIKTOK_PIXEL}?sdkid=${encodeURIComponent(pixelId)}&lib=ttq`);
    };

    ttqStub.load(id);
    ttqStub.page();
}

function carregarPixelsPermitidos() {
    const { tracking, consentimento } = estado;
    if (!tracking) return;

    if (tracking.metaPixelAtivo && tracking.metaPixelId && decidirCarregarMarketing(consentimento)) {
        carregarMetaPixel(tracking.metaPixelId);
    }

    if (tracking.ga4Ativo && tracking.ga4MeasurementId && decidirCarregarAnalytics(consentimento)) {
        carregarGa4(tracking.ga4MeasurementId);
    }

    if (tracking.tiktokAtivo && tracking.tiktokPixelId && decidirCarregarMarketing(consentimento)) {
        carregarTikTokPixel(tracking.tiktokPixelId);
    }
}

// ===== Banner de consentimento =====

function injetarEstilos() {
    if (document.getElementById("vide-tracking-consent-style")) return;

    const style = document.createElement("style");
    style.id = "vide-tracking-consent-style";
    style.textContent = `
        #vide-tracking-consent-banner {
            position: fixed;
            left: 16px;
            right: 16px;
            bottom: 16px;
            z-index: 2147483000;
            max-width: 560px;
            margin: 0 auto;
            background: #14132b;
            color: #fff;
            border: 1px solid rgba(255,255,255,.12);
            border-radius: 14px;
            padding: 16px;
            box-shadow: 0 20px 45px rgba(0,0,0,.35);
            font-family: inherit;
        }
        #vide-tracking-consent-banner .vide-tracking-consent-copy strong { font-size: 14px; }
        #vide-tracking-consent-banner .vide-tracking-consent-copy p { font-size: 12px; color: rgba(255,255,255,.65); margin-top: 6px; }
        #vide-tracking-consent-banner .vide-tracking-consent-opcoes { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 12px; font-size: 12px; color: rgba(255,255,255,.75); }
        #vide-tracking-consent-banner .vide-tracking-consent-opcoes label { display: flex; align-items: center; gap: 6px; }
        #vide-tracking-consent-banner .vide-tracking-consent-acoes { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
        #vide-tracking-consent-banner .vide-tracking-consent-acoes button {
            border: 1px solid rgba(255,255,255,.15);
            background: rgba(255,255,255,.06);
            color: #fff;
            font-size: 12px;
            font-weight: 700;
            padding: 9px 14px;
            border-radius: 10px;
            cursor: pointer;
            min-height: 40px;
        }
        #vide-tracking-consent-banner #vide-tracking-consent-aceitar {
            background: #00d4ff;
            color: #06141c;
            border-color: transparent;
        }
        @media (max-width: 480px) {
            #vide-tracking-consent-banner { left: 8px; right: 8px; bottom: 8px; }
        }
    `;
    document.head.appendChild(style);
}

function montarBanner() {
    injetarEstilos();

    const container = document.createElement("div");
    container.id = "vide-tracking-consent-banner";
    container.setAttribute("role", "dialog");
    container.setAttribute("aria-live", "polite");
    container.setAttribute("aria-label", "Preferências de privacidade");

    container.innerHTML = `
        <div class="vide-tracking-consent-copy">
            <strong>Sua privacidade</strong>
            <p>Usamos cookies necessários para o funcionamento da loja. Com sua permissão, também usamos cookies de análise e marketing para entender visitas e campanhas.</p>
        </div>
        <div class="vide-tracking-consent-opcoes">
            <label><input type="checkbox" checked disabled> Necessários</label>
            <label><input type="checkbox" id="vide-tracking-consent-analytics"> Análise</label>
            <label><input type="checkbox" id="vide-tracking-consent-marketing"> Marketing</label>
        </div>
        <div class="vide-tracking-consent-acoes">
            <button type="button" id="vide-tracking-consent-rejeitar">Só necessários</button>
            <button type="button" id="vide-tracking-consent-salvar">Salvar preferências</button>
            <button type="button" id="vide-tracking-consent-aceitar">Aceitar tudo</button>
        </div>
    `;

    document.body.appendChild(container);

    const concluir = consentimento => {
        estado.consentimento = consentimento;
        salvarConsentimento(estado.slug, consentimento);
        container.remove();
        carregarPixelsPermitidos();
    };

    container.querySelector("#vide-tracking-consent-aceitar").addEventListener("click", () => {
        concluir({ version: CONSENTIMENTO_VERSAO_ATUAL, analytics: true, marketing: true, updatedAt: Date.now() });
    });

    container.querySelector("#vide-tracking-consent-rejeitar").addEventListener("click", () => {
        concluir({ version: CONSENTIMENTO_VERSAO_ATUAL, analytics: false, marketing: false, updatedAt: Date.now() });
    });

    container.querySelector("#vide-tracking-consent-salvar").addEventListener("click", () => {
        const analytics = container.querySelector("#vide-tracking-consent-analytics").checked;
        const marketing = container.querySelector("#vide-tracking-consent-marketing").checked;
        concluir({ version: CONSENTIMENTO_VERSAO_ATUAL, analytics, marketing, updatedAt: Date.now() });
    });
}

// ===== API pública =====

export function initTracking({ slug, tracking } = {}) {
    if (!slug || !tracking || !tracking.consentimentoAtivo) {
        return;
    }

    const algumPixelConfigurado =
        (tracking.metaPixelAtivo && tracking.metaPixelId) ||
        (tracking.ga4Ativo && tracking.ga4MeasurementId) ||
        (tracking.tiktokAtivo && tracking.tiktokPixelId);

    if (!algumPixelConfigurado) {
        return;
    }

    estado = { slug, tracking, consentimento: lerConsentimentoSalvo(slug) };

    if (estado.consentimento) {
        carregarPixelsPermitidos();
        return;
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", montarBanner, { once: true });
    } else {
        montarBanner();
    }
}

export function track(evento, payload) {
    if (!estado || !estado.tracking || !eventoPermitido(evento)) {
        return;
    }

    const dadosLimpos = removerCamposProibidos(payload);
    const { tracking, consentimento } = estado;

    if (
        window.fbq &&
        tracking.metaPixelAtivo &&
        consentimentoPermite(consentimento, "marketing")
    ) {
        const nomeMeta = mapearEventoParaPlataforma(evento, "meta");
        if (nomeMeta) window.fbq("track", nomeMeta, dadosLimpos);
    }

    if (
        window.gtag &&
        tracking.ga4Ativo &&
        consentimentoPermite(consentimento, "analytics")
    ) {
        const nomeGa4 = mapearEventoParaPlataforma(evento, "ga4");
        if (nomeGa4) window.gtag("event", nomeGa4, dadosLimpos);
    }

    if (
        window.ttq &&
        tracking.tiktokAtivo &&
        consentimentoPermite(consentimento, "marketing")
    ) {
        const nomeTiktok = mapearEventoParaPlataforma(evento, "tiktok");
        if (nomeTiktok) window.ttq.track(nomeTiktok, dadosLimpos);
    }
}

window.VideTrackingV1 = Object.freeze({ initTracking, track });
