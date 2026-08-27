/**
 * Vide Aura — Captura Pública de Formulários V5
 * Captura segura, UTM, scoring inicial, anti-spam e metadados de conversão.
 * Versão 5.0.0
 */
import { app, db, shouldUseVideEmulators } from "./firebase-init.js";
import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
    connectFunctionsEmulator,
    getFunctions,
    httpsCallable
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";
import { createLeadAttemptTracker, fingerprintCamposExtras } from "./lead-attempt-token-core.js";

const VERSION = "5.0.0";
const SESSION_KEY = "aura_form_v5_session";
const ATTRIBUTION_KEY = "aura_form_v5_attribution";
const VISITOR_KEY = "aura_form_v5_visitor";

const state = {
    base: detectBase(),
    route: parseRoute(),
    meta: null,
    sessionId: getSessionId(),
    visitorId: getVisitorId(),
    startedAt: Date.now(),
    clicks: 0,
    submitting: false,
    enhanced: new WeakSet(),
    observer: null
};

// CRM-LEAD-008 (achado B1-A da revisão adversarial): rastreador de
// tentativa de envio — extraído pra lead-attempt-token-core.js (módulo
// puro, testável via node --test). Compartilhado por TODOS os
// formulários AuraFormsV5 da página, escopado por fingerprint do
// payload (ver fingerprintTentativaLeadPublico/buildLeadRequest).
const leadAttemptTracker = createLeadAttemptTracker();

function detectBase() {
    if (window.location.hostname === "videdigital.github.io") {
        return "/vide-digital/";
    }

    if (window.location.pathname.startsWith("/vide-digital/")) {
        return "/vide-digital/";
    }

    return "/";
}

function parseRoute() {
    let path = decodeURIComponent(window.location.pathname || "/");

    // Não referenciar `state` aqui: parseRoute() roda enquanto o objeto
    // `state` ainda está sendo inicializado (linha `route: parseRoute()`),
    // então `state` está na zona morta temporal e qualquer acesso lança
    // "Cannot access 'state' before initialization", quebrando o módulo
    // inteiro. detectBase() é barato e não depende de `state`.
    const base = detectBase();
    if (path.startsWith(base)) {
        path = path.slice(base.length);
    } else {
        path = path.replace(/^\/+/, "");
    }

    const parts = path
        .split("/")
        .map((part) => part.trim())
        .filter(Boolean)
        .filter((part) => part.toLowerCase() !== "index.html");

    return {
        lojaSlug: sanitizeSlug(parts[0] || ""),
        paginaSlug: sanitizeSlug(parts[1] || "")
    };
}

function sanitizeSlug(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9_-]/g, "");
}

function getSessionId() {
    let value = sessionStorage.getItem(SESSION_KEY);

    if (!value) {
        value = `s_${Date.now().toString(36)}_${cryptoRandom()}`;
        sessionStorage.setItem(SESSION_KEY, value);
    }

    return value;
}

function getVisitorId() {
    let value = localStorage.getItem(VISITOR_KEY);

    if (!value) {
        value = `v_${Date.now().toString(36)}_${cryptoRandom()}`;
        localStorage.setItem(VISITOR_KEY, value);
    }

    return value;
}

function cryptoRandom() {
    const values = new Uint32Array(2);
    crypto.getRandomValues(values);
    return Array.from(values, (value) => value.toString(36)).join("");
}

function normalizePhone(value) {
    let digits = String(value || "").replace(/\D/g, "");

    if (digits.length === 10 || digits.length === 11) {
        digits = `55${digits}`;
    }

    return digits;
}

function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

function formatPhone(value) {
    const digits = String(value || "").replace(/\D/g, "").slice(0, 13);

    if (digits.length <= 2) {
        return digits;
    }

    if (digits.length <= 7) {
        return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    }

    if (digits.length <= 11) {
        return `(${digits.slice(0, 2)}) ${digits.slice(2, -4)}-${digits.slice(-4)}`;
    }

    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, -4)}-${digits.slice(-4)}`;
}

function readAttribution() {
    const params = new URLSearchParams(window.location.search);
    let stored = {};

    try {
        stored = JSON.parse(sessionStorage.getItem(ATTRIBUTION_KEY) || "{}");
    } catch (error) {
        stored = {};
    }

    const current = {
        utmSource: params.get("utm_source") || stored.utmSource || "",
        utmMedium: params.get("utm_medium") || stored.utmMedium || "",
        utmCampaign: params.get("utm_campaign") || stored.utmCampaign || "",
        utmContent: params.get("utm_content") || stored.utmContent || "",
        utmTerm: params.get("utm_term") || stored.utmTerm || "",
        gclid: params.get("gclid") || stored.gclid || "",
        fbclid: params.get("fbclid") || stored.fbclid || "",
        firstReferrer: stored.firstReferrer || document.referrer || "",
        landingURL: stored.landingURL || window.location.href,
        currentURL: window.location.href
    };

    sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(current));
    return current;
}

async function loadPageMeta() {
    if (state.meta) {
        return state.meta;
    }

    if (!state.route.lojaSlug || !state.route.paginaSlug) {
        return null;
    }

    const publicId = `${state.route.lojaSlug}__${state.route.paginaSlug}`.toLowerCase();

    try {
        const snapshot = await getDoc(doc(db, "landing_pages_publicas", publicId));

        if (snapshot.exists()) {
            state.meta = {
                id: snapshot.id,
                ...snapshot.data()
            };
            return state.meta;
        }
    } catch (error) {
        console.warn("[Aura Forms V5] Metadados públicos não carregados.", error);
    }

    return null;
}

// Mesmo padrão de loja.html (obterCreatePublicLeadCallable): getFunctions()
// é cacheado pelo próprio SDK, só o guard do emulador precisa ser manual.
let createPublicLeadCallable = null;
function obterCreatePublicLeadCallable() {
    if (createPublicLeadCallable) {
        return createPublicLeadCallable;
    }

    const functionsInstance = getFunctions(app, "southamerica-east1");

    if (shouldUseVideEmulators() && !window.__videPublicFunctionsEmulatorConnected) {
        connectFunctionsEmulator(functionsInstance, "127.0.0.1", 5001);
        window.__videPublicFunctionsEmulatorConnected = true;
    }

    createPublicLeadCallable = httpsCallable(functionsInstance, "createPublicLead");
    return createPublicLeadCallable;
}

// CRM-LEAD-008 (achado 5 + achado B1-A da revisão adversarial): antes,
// este arquivo não enviava nenhum dedupeKey — createPublicLead caía no
// fallback de identidade por contato/sessão do servidor, que confundia
// idempotência (retry) com dedupe comercial (mesmo contato reenviando de
// propósito). Depois, um token global solto (achado B1-A) tinha o problema
// oposto: reaproveitado depois de um erro mesmo que o usuário tivesse
// mudado os dados ou submetido outro formulário na mesma página (esta
// função é compartilhada por TODOS os formulários AuraFormsV5 da página).
//
// Agora o token está associado a um FINGERPRINT do payload — só é
// reaproveitado quando o fingerprint da chamada atual bate com o da
// tentativa pendente (retry real da mesma tentativa, inclusive
// double-click síncrono antes da primeira chamada terminar). Fingerprint
// diferente (dado alterado, outro formulário, nova submissão deliberada
// depois de um sucesso anterior) sempre gera um token novo.
//
// ÚLTIMO B1 (revisão adversarial final, terceira passada): buildLeadRequest
// também envia camposExtras — campos customizados que o dono da LP
// adiciona ao formulário (empresa, orçamento, mensagem etc.), dados
// comerciais preenchidos manualmente pelo visitante, não cobertos pelos
// campos fixos acima. Corrigir um desses campos depois de um erro
// ambíguo é a MESMA classe de bug do contato — sem entrar no
// fingerprint, o retry reaproveitava o token e o dado corrigido podia
// nunca ser persistido. fingerprintCamposExtras (lead-attempt-token-core.js)
// serializa de forma determinística (chaves ordenadas).
function fingerprintTentativaLeadPublico(leadRequest) {
    return [
        leadRequest.publicPageId || "",
        leadRequest.formularioId || "",
        leadRequest.produtoInteresse || "",
        String(leadRequest.nome || "").trim().toLowerCase(),
        String(leadRequest.whatsapp || "").replace(/\D/g, ""),
        String(leadRequest.email || "").trim().toLowerCase(),
        fingerprintCamposExtras(leadRequest.camposExtras)
    ].join("|");
}

function addHoneypot(form) {
    if (form.querySelector("[data-aura-honeypot]")) {
        return;
    }

    const field = document.createElement("label");
    field.setAttribute("aria-hidden", "true");
    field.style.cssText = "position:absolute!important;left:-99999px!important;width:1px!important;height:1px!important;overflow:hidden!important;";
    field.innerHTML = `
        Não preencha
        <input
            type="text"
            name="website"
            tabindex="-1"
            autocomplete="off"
            data-aura-honeypot
        >
    `;
    form.appendChild(field);
}

function addPrivacyHint(form) {
    if (form.querySelector("[data-aura-privacy-hint]")) {
        return;
    }

    const hint = document.createElement("p");
    hint.dataset.auraPrivacyHint = "";
    hint.textContent = "Ao enviar, você concorda em receber contato sobre esta solicitação.";
    hint.style.cssText = "margin:0;color:inherit;opacity:.58;font-size:11px;line-height:1.45;";
    const submit = form.querySelector("button[type='submit'], input[type='submit']");
    submit?.insertAdjacentElement("beforebegin", hint);
}

function enhanceForm(form) {
    if (!(form instanceof HTMLFormElement) || state.enhanced.has(form)) {
        return;
    }

    if (!form.closest("#lp-container") && !form.hasAttribute("data-aura-lead-form")) {
        return;
    }

    state.enhanced.add(form);
    form.dataset.auraFormsV5 = "ready";
    form.dataset.auraStartedAt = String(Date.now());
    addHoneypot(form);
    addPrivacyHint(form);

    form.querySelectorAll("input[type='tel'], input[name*='whatsapp' i], input[name*='telefone' i]").forEach((input) => {
        input.addEventListener("input", () => {
            input.value = formatPhone(input.value);
        });
    });
}

function scanForms(root = document) {
    root.querySelectorAll?.("form").forEach(enhanceForm);
}

function getFieldValue(form, names) {
    for (const name of names) {
        const exact = form.elements.namedItem(name);
        if (exact && "value" in exact && String(exact.value || "").trim()) {
            return String(exact.value).trim();
        }

        const fuzzy = Array.from(form.elements).find((field) => {
            const key = String(field.name || field.id || "").toLowerCase();
            return key.includes(name.toLowerCase());
        });

        if (fuzzy && "value" in fuzzy && String(fuzzy.value || "").trim()) {
            return String(fuzzy.value).trim();
        }

        // Fallback pro bloco legado "formulario_captura" (renderizado
        // inline por index.html): <input placeholder="nome">, sem name
        // nem id nenhum. Sem isto, AuraFormsV5 nunca lia os campos do
        // único bloco de captura hoje conectado a uma página pública real
        // (ver docs/STUDIO_BLOCK_REGISTRY.md) — todo envio caía em
        // "Preencha pelo menos um dado de contato", mesmo com os campos
        // visíveis preenchidos.
        const porPlaceholder = Array.from(form.elements).find((field) => {
            const placeholder = String(field.placeholder || "").toLowerCase();
            return placeholder.includes(name.toLowerCase());
        });

        if (porPlaceholder && "value" in porPlaceholder && String(porPlaceholder.value || "").trim()) {
            return String(porPlaceholder.value).trim();
        }
    }

    return "";
}

function getStatusHost(form) {
    let host = form.querySelector(".aura-form-status, [role='status'], [data-aura-form-status]");

    if (!host) {
        host = document.createElement("p");
        host.dataset.auraFormStatus = "";
        host.setAttribute("role", "status");
        host.setAttribute("aria-live", "polite");
        host.style.cssText = "min-height:18px;margin:0;font-size:12px;font-weight:700;";
        form.appendChild(host);
    }

    return host;
}

function setStatus(host, message, type = "neutral") {
    host.textContent = message;
    host.dataset.state = type;
    host.style.color = type === "success"
        ? "#059669"
        : type === "error"
            ? "#dc2626"
            : "inherit";
}

function serializeExtraFields(form) {
    const excluded = new Set([
        "website",
        "nome",
        "name",
        "email",
        "whatsapp",
        "telefone",
        "phone"
    ]);
    const output = {};

    for (const [key, value] of new FormData(form).entries()) {
        const normalized = String(key || "").toLowerCase();

        if (
            excluded.has(normalized) ||
            typeof value !== "string" ||
            !value.trim()
        ) {
            continue;
        }

        output[key] = value.trim().slice(0, 500);
    }

    return output;
}

// Monta o request pra createPublicLead (Cloud Function) — não escreve mais
// direto no Firestore. tenant (ownerUid) nunca é enviado pelo cliente: a
// Function resolve o dono real no servidor a partir de publicPageId
// (landing_pages_publicas/{lojaSlug}__{paginaSlug}), a mesma leitura pública
// que loadPageMeta() já fazia — visitante nunca controla criadoPor/tenantId.
function buildLeadRequest(form, meta) {
    const attribution = readAttribution();
    const nome = getFieldValue(form, ["nome", "name"]);
    const whatsapp = normalizePhone(getFieldValue(form, ["whatsapp", "telefone", "phone"]));
    const email = normalizeEmail(getFieldValue(form, ["email"]));
    const produtoInteresse = getFieldValue(form, [
        "produtoInteresse",
        "interesse",
        "produto",
        "servico"
    ]) || meta?.titulo || state.route.paginaSlug;
    const formId =
        form.dataset.formId ||
        form.dataset.blockId ||
        form.closest("[data-aura-block-id]")?.dataset.auraBlockId ||
        form.id ||
        "captura_geral";
    const tempoRetencao = Math.max(0, Math.round((Date.now() - state.startedAt) / 1000));

    const leadRequest = {
        publicPageId: meta.id,
        nome,
        whatsapp,
        telefone: whatsapp,
        email,
        origem: attribution.utmSource || form.dataset.origem || "Landing Page",
        produtoInteresse,
        paginaOrigem: state.route.paginaSlug,
        lojaOrigem: state.route.lojaSlug,
        blocoOrigem: form.dataset.blockId || "",
        formularioId: formId,
        formularioNome: form.dataset.formName || form.getAttribute("aria-label") || formId,
        urlPagina: window.location.href,
        referrer: document.referrer || "",
        sessionId: state.sessionId,
        visitorId: state.visitorId,
        tempoRetencao,
        cliques: state.clicks,
        utmSource: attribution.utmSource,
        utmMedium: attribution.utmMedium,
        utmCampaign: attribution.utmCampaign,
        utmContent: attribution.utmContent,
        utmTerm: attribution.utmTerm,
        gclid: attribution.gclid,
        fbclid: attribution.fbclid,
        camposExtras: serializeExtraFields(form),
        consentimentoContato: true,
        versaoCaptura: VERSION
    };
    // CRM-LEAD-008 (achado B1-A): token de tentativa associado ao
    // fingerprint deste payload — ver leadAttemptTracker/
    // fingerprintTentativaLeadPublico. Nunca reusa entre submissões com
    // dados diferentes ou de outro formulário.
    leadRequest.dedupeKey = leadAttemptTracker.getToken(fingerprintTentativaLeadPublico(leadRequest));
    return leadRequest;
}

function validatePayload(payload) {
    if (!payload.nome && !payload.whatsapp && !payload.email) {
        return "Preencha pelo menos um dado de contato.";
    }

    if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
        return "Informe um e-mail válido.";
    }

    if (payload.whatsapp && payload.whatsapp.length < 10) {
        return "Informe um WhatsApp válido.";
    }

    return "";
}

async function handleSubmit(event) {
    const form = event.target;

    if (!(form instanceof HTMLFormElement)) {
        return;
    }

    if (!form.closest("#lp-container") && !form.hasAttribute("data-aura-lead-form")) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (state.submitting) {
        return;
    }

    enhanceForm(form);

    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const honeypot = form.querySelector("[data-aura-honeypot]")?.value.trim();
    const elapsed = Date.now() - Number(form.dataset.auraStartedAt || Date.now());

    if (honeypot || elapsed < 1200) {
        console.warn("[Aura Forms V5] Submissão bloqueada pelo anti-spam.");
        return;
    }

    const status = getStatusHost(form);
    const submit = form.querySelector("button[type='submit'], input[type='submit']");
    const original = submit instanceof HTMLInputElement
        ? submit.value
        : submit?.textContent || "Enviar";

    state.submitting = true;
    if (submit) {
        submit.disabled = true;
        if (submit instanceof HTMLInputElement) {
            submit.value = "Enviando...";
        } else {
            submit.textContent = "Enviando...";
        }
    }
    setStatus(status, "Enviando informações...");

    try {
        const meta = await loadPageMeta();

        if (!meta?.donoUID) {
            throw new Error("A página ainda não está vinculada a uma loja publicada.");
        }

        const payload = buildLeadRequest(form, meta);
        const validationError = validatePayload(payload);

        if (validationError) {
            throw new Error(validationError);
        }

        // Não escreve mais direto no Firestore: chama createPublicLead
        // (Cloud Function), que resolve o tenant real a partir de
        // publicPageId no servidor (Admin SDK), aplica rate limit por IP e
        // sanitiza todo o payload antes de gravar. Ver
        // functions/src/public/index.js — mesmo contrato já usado por
        // loja.html desde a migração de leads públicos da Loja.
        const createPublicLeadCallable = obterCreatePublicLeadCallable();
        const resposta = await createPublicLeadCallable(payload);
        const leadId = resposta?.data?.leadId;
        // Sucesso: encerra a tentativa — a PRÓXIMA submissão (mesmo com
        // conteúdo idêntico) recebe um token novo (CRM-LEAD-008). Passa o
        // MESMO fingerprint usado em getToken (recalculado do payload, uma
        // função pura), pra encerrar só ESTA tentativa, não interferir em
        // outras pendentes de outro formulário na mesma página.
        leadAttemptTracker.complete(fingerprintTentativaLeadPublico(payload));
        form.reset();
        form.dataset.auraStartedAt = String(Date.now());
        setStatus(status, form.dataset.successMessage || "Informações enviadas com sucesso.", "success");

        window.dispatchEvent(new CustomEvent("aura:lead-captured", {
            detail: {
                leadId,
                formId: payload.formularioId
            }
        }));

        const redirect = form.dataset.successUrl;
        if (redirect) {
            window.setTimeout(() => {
                window.location.assign(redirect);
            }, 700);
        }
    } catch (error) {
        // Não chama leadAttemptTracker.complete() aqui de propósito: o
        // token de tentativa continua pendente, então se o usuário clicar
        // em enviar de novo (retry da MESMA tentativa), createPublicLead
        // reconhece o mesmo dedupeKey e não duplica o lead.
        console.error("[Aura Forms V5] Falha na captura:", error);
        setStatus(
            status,
            error?.message || "Não foi possível enviar agora. Tente novamente.",
            "error"
        );
    } finally {
        state.submitting = false;
        if (submit) {
            submit.disabled = false;
            if (submit instanceof HTMLInputElement) {
                submit.value = original;
            } else {
                submit.textContent = original;
            }
        }
    }
}

function installObserver() {
    if (state.observer) {
        return;
    }

    state.observer = new MutationObserver((records) => {
        for (const record of records) {
            for (const node of record.addedNodes) {
                if (!(node instanceof Element)) {
                    continue;
                }

                if (node.matches("form")) {
                    enhanceForm(node);
                }

                scanForms(node);
            }
        }
    });

    state.observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });
}

function start() {
    readAttribution();
    scanForms();
    installObserver();

    document.addEventListener("click", () => {
        state.clicks += 1;
    }, {
        capture: true,
        passive: true
    });

    document.addEventListener("submit", handleSubmit, true);

    window.addEventListener("aura:public-renderer-ready", () => {
        scanForms();
    });

    window.AuraFormsV5 = {
        version: VERSION,
        rescan: scanForms,
        getState: () => ({
            route: state.route,
            sessionId: state.sessionId,
            clicks: state.clicks,
            retentionSeconds: Math.round((Date.now() - state.startedAt) / 1000)
        })
    };

    console.info("[Vide Aura Forms V5] Captura pública ativa");
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
    start();
}
