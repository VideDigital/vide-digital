/**
 * Vide Aura — Central Comercial de Leads V6
 * Workspace em página inteira: inbox, pipeline, agenda, histórico,
 * responsáveis, WhatsApp, receita, relatórios, duplicidades e automações.
 * Versão 6.2.0
 */
import { db, auth } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
    query,
    setDoc,
    where,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const VERSION = "6.2.0";
const ASSET_VERSION = "620";
const LEAD_SCHEMA_VERSION = 2;
const STORAGE_PREFIX = "aura_leads_v5_";
const MAX_HISTORY = 35;
const MAX_BATCH_SIZE = 400;

const STATUS_LABELS = Object.freeze({
    novo: "Novo",
    em_contato: "Em contato",
    qualificado: "Qualificado",
    proposta: "Proposta",
    convertido: "Convertido",
    perdido: "Perdido"
});

const PIPELINE_STAGES = Object.freeze([
    { id: "novo", label: "Novos", probability: 10 },
    { id: "em_contato", label: "Em contato", probability: 25 },
    { id: "qualificado", label: "Qualificados", probability: 50 },
    { id: "proposta", label: "Propostas", probability: 70 },
    { id: "convertido", label: "Ganhos", probability: 100 },
    { id: "perdido", label: "Perdidos", probability: 0 }
]);

const TEMPERATURES = Object.freeze({
    hot: { label: "Quente", min: 75 },
    warm: { label: "Morno", min: 45 },
    cold: { label: "Frio", min: 0 }
});

const WHATSAPP_TEMPLATES = Object.freeze({
    saudacao: {
        label: "Primeiro contato",
        text: "Olá, {nome}! Tudo bem? Vi seu interesse em {produto}. Posso te ajudar com mais informações?"
    },
    orcamento: {
        label: "Enviar orçamento",
        text: "Olá, {nome}! Preparei as informações sobre {produto}. Posso te enviar as opções e valores por aqui?"
    },
    followup: {
        label: "Follow-up",
        text: "Olá, {nome}! Passando para saber se conseguiu analisar nossa conversa sobre {produto}. Ficou alguma dúvida?"
    },
    fechamento: {
        label: "Fechamento",
        text: "Olá, {nome}! Estou finalizando os atendimentos de hoje e queria confirmar se seguimos com {produto}."
    },
    pos_venda: {
        label: "Pós-venda",
        text: "Olá, {nome}! Como foi sua experiência com {produto}? Estou à disposição para ajudar no que precisar."
    }
});

const DEFAULT_AUTOMATIONS = Object.freeze({
    hotPriority: true,
    overduePriority: true,
    stageProbability: true,
    runOnRefresh: false,
    newLeadSound: false
});

const state = {
    user: null,
    ownerUid: "",
    actorName: "",
    canView: false,
    canEdit: false,
    isBackendAdmin: false,
    employeeProfile: null,
    accessLoaded: false,
    team: [],
    allLeads: [],
    leads: [],
    archivedLeads: [],
    trashLeads: [],
    filtered: [],
    selectedIds: new Set(),
    selectedLeadId: "",
    activeTab: "inbox",
    search: "",
    status: "all",
    temperature: "all",
    origin: "all",
    campaign: "all",
    responsible: "all",
    loading: false,
    initialized: false,
    modalOpen: false,
    lifecycleController: null,
    previouslyFocusedElement: null,
    unsubscribeLeads: null,
    realtimeReady: false,
    knownLeadIds: new Set(),
    lastSeenTimestamp: 0,
    unreadCount: 0,
    soundUnlocked: false,
    bulkRunning: false,
    slaMinutes: 30,
    duplicateGroups: [],
    sourceGroups: [],
    formGroups: [],
    automation: { ...DEFAULT_AUTOMATIONS },
    searchTimer: null,
    automationRunning: false,
    schemaMigrationRunning: false,
    invalidTenantCount: 0,
    legacyObserver: null,
    navigationBound: false
};

const svg = {
    spark: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3z"></path><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z"></path></svg>`,
    close: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>`,
    refresh: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 10-2.3 5.7"></path><path d="M20 4v7h-7"></path></svg>`,
    export: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12"></path><path d="M7 10l5 5 5-5"></path><path d="M5 21h14"></path></svg>`,
    search: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4-4"></path></svg>`,
    user: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0116 0"></path></svg>`,
    clock: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>`,
    calendar: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M8 3v4M16 3v4M3 10h18"></path></svg>`,
    board: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="5" height="16" rx="1"></rect><rect x="10" y="4" width="5" height="10" rx="1"></rect><rect x="17" y="4" width="4" height="13" rx="1"></rect></svg>`,
    chart: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"></path></svg>`,
    form: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h14v18H5z"></path><path d="M8 7h8M8 11h8M8 15h5"></path></svg>`,
    source: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V9M10 19V5M16 19v-8M22 19H2"></path></svg>`,
    duplicate: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"></rect><path d="M16 8V5a2 2 0 00-2-2H5a2 2 0 00-2 2v9a2 2 0 002 2h3"></path></svg>`,
    whatsapp: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a8 8 0 01-11.8 7L4 20l1.4-4A8 8 0 1120 11.5z"></path><path d="M9 8.5c.3 2.4 2.1 4.2 4.5 4.7"></path></svg>`,
    chevron: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6"></path></svg>`,
    save: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h12l2 2v16H5z"></path><path d="M8 3v6h8V3M8 21v-7h8v7"></path></svg>`,
    merge: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v5a4 4 0 004 4h6"></path><path d="M7 21v-5a4 4 0 014-4"></path><path d="M14 9l3 3-3 3"></path></svg>`,
    automation: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M4 17h16M18 7h2M4 12h4M12 12h8"></path><circle cx="16" cy="7" r="2"></circle><circle cx="10" cy="12" r="2"></circle><circle cx="8" cy="17" r="2"></circle></svg>`,
    history: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 109-9 9 9 0 00-7.4 3.9L3 9"></path><path d="M3 4v5h5M12 7v5l3 2"></path></svg>`,
    archive: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v13H4z"></path><path d="M3 3h18v4H3zM9 11h6"></path></svg>`,
    trash: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"></path></svg>`,
    restore: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8v5h5"></path><path d="M5.5 16a8 8 0 101.2-9.2L4 10"></path></svg>`,
    check: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"></path></svg>`,
    eye: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"></path><circle cx="12" cy="12" r="2.5"></circle></svg>`,
    bell: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 00-12 0c0 6-3 7-3 9h18c0-2-3-3-3-9"></path><path d="M10 21h4"></path></svg>`
};

function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function normalizeText(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function normalizePhone(value) {
    let digits = String(value || "").replace(/\D/g, "");
    if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
    return digits;
}

function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

function ensureAssetVersion() {
    const link = document.querySelector(
        'link[href*="lead-engine-v5.css"]'
    );

    if (link) {
        try {
            const url = new URL(
                link.getAttribute("href") || "./lead-engine-v5.css",
                window.location.href
            );
            if (url.searchParams.get("v") !== ASSET_VERSION) {
                url.searchParams.set("v", ASSET_VERSION);
                link.href = url.href;
            }
        } catch (error) {
            console.info("[Aura Leads V6] O cache visual será renovado na próxima abertura.");
        }
    }

    document.querySelectorAll(
        'link[href*="leads-mobile-hotfix-v51.css"]'
    ).forEach((legacyLink) => {
        legacyLink.disabled = true;
        legacyLink.media = "not all";
        legacyLink.dataset.disabledByAuraLeadsV6 = "true";
    });

    document.documentElement.dataset.auraLeadsVersion = VERSION;
}

function disableLegacyMobileController() {
    const disable = () => {
        try {
            window.AuraLeadsMobileControllerV52?.destroy?.();
        } catch (error) {
            console.info("[Aura Leads V6] Controlador mobile legado já estava inativo.");
        }

        document.getElementById(
            "aura-leads-mobile-controller-v52-style"
        )?.remove();
        document.getElementById(
            "aura-leads-mobile-close-v52"
        )?.remove();
    };

    disable();
    [80, 350, 1200].forEach((delay) => {
        window.setTimeout(disable, delay);
    });
}

function lastSeenStorageKey() {
    return `${STORAGE_PREFIX}last_seen_${state.ownerUid}`;
}

function loadLastSeen() {
    const saved = Number(localStorage.getItem(lastSeenStorageKey()));
    if (Number.isFinite(saved) && saved > 0) {
        state.lastSeenTimestamp = saved;
        return;
    }

    state.lastSeenTimestamp = Date.now();
    localStorage.setItem(
        lastSeenStorageKey(),
        String(state.lastSeenTimestamp)
    );
}

function saveLastSeen(value = Date.now()) {
    state.lastSeenTimestamp = Math.max(
        state.lastSeenTimestamp,
        Number(value) || Date.now()
    );
    localStorage.setItem(
        lastSeenStorageKey(),
        String(state.lastSeenTimestamp)
    );
}

function findLead(leadId) {
    return state.allLeads.find((item) => item.id === leadId) || null;
}

function currentTabCollection() {
    if (state.activeTab === "archived") return state.archivedLeads;
    if (state.activeTab === "trash") return state.trashLeads;
    return state.leads;
}

function currentSelectableCollection() {
    if (state.activeTab === "priority") {
        return state.leads.filter((lead) =>
            lead._overdue ||
            lead._temperature === "hot" ||
            lead.prioridadeLead === "alta"
        );
    }
    return currentTabCollection();
}

function refreshLeadCollections() {
    state.allLeads.sort((a, b) => b._timestamp - a._timestamp);
    state.leads = state.allLeads.filter((lead) => !lead.lixeira && !lead.arquivado);
    state.archivedLeads = state.allLeads.filter((lead) => lead.arquivado && !lead.lixeira);
    state.trashLeads = state.allLeads.filter((lead) => lead.lixeira);
    state.unreadCount = state.leads.filter((lead) => lead._unread).length;

    const validIds = new Set(currentSelectableCollection().map((lead) => lead.id));
    state.selectedIds.forEach((id) => {
        if (!validIds.has(id)) state.selectedIds.delete(id);
    });

    deriveGroups();
    updateUnreadBadges();
    updateActiveTabUI();
}

function updateUnreadBadges() {
    const count = state.unreadCount;
    const targets = [
        document.getElementById("aura-leads-v5-inbox-badge")
    ];

    targets.forEach((badge) => {
        if (!badge) return;
        badge.textContent = count > 99 ? "99+" : String(count);
        badge.hidden = count < 1;
    });

    const leadsNavigationButton = document.querySelector(
        '[data-target="view-leads"]'
    );
    let leadsNavigationBadge = document.getElementById(
        "aura-leads-v6-navigation-badge"
    );

    if (leadsNavigationButton && !leadsNavigationBadge) {
        leadsNavigationBadge = document.createElement("span");
        leadsNavigationBadge.id = "aura-leads-v6-navigation-badge";
        leadsNavigationBadge.className = "aura-leads-v6-navigation-badge";
        leadsNavigationButton.appendChild(leadsNavigationBadge);
    }

    if (leadsNavigationBadge) {
        leadsNavigationBadge.textContent = count > 99 ? "99+" : String(count);
        leadsNavigationBadge.hidden = count < 1;
    }

    const notificationButton = document.getElementById("btn-notificacoes");
    let notificationBadge = document.getElementById(
        "aura-leads-v5-notification-badge"
    );

    if (notificationButton && !notificationBadge) {
        notificationBadge = document.createElement("span");
        notificationBadge.id = "aura-leads-v5-notification-badge";
        notificationBadge.className = "aura-leads-v5-notification-badge";
        notificationButton.appendChild(notificationBadge);
    }

    if (notificationBadge) {
        notificationBadge.textContent = count > 99 ? "99+" : String(count);
        notificationBadge.hidden = count < 1;
    }

    window.dispatchEvent(new CustomEvent("aura:leads-v5-unread", {
        detail: {
            count,
            ownerUid: state.ownerUid,
            version: VERSION
        }
    }));
}

function playNewLeadSound() {
    if (!state.automation.newLeadSound || !state.soundUnlocked) return;

    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const context = new AudioContext();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(740, context.currentTime);
        gain.gain.setValueAtTime(0.0001, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.24);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.25);
        oscillator.addEventListener("ended", () => context.close());
    } catch (error) {
        console.info("[Aura Leads V6] Som de novo lead indisponível.");
    }
}

function notifyNewLeads(leads) {
    if (!leads.length) return;
    const first = leads[0];
    const message = leads.length === 1
        ? `Novo lead: ${first.nome || "Lead sem nome"}`
        : `${leads.length} novos leads recebidos`;
    toast(message);
    playNewLeadSound();
}

function numericValue(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const normalized = String(value || "")
        .replace(/\s/g, "")
        .replace(/\./g, "")
        .replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value) {
    return numericValue(value).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });
}

function anyTimestamp(value) {
    if (!value) return 0;
    if (typeof value?.toMillis === "function") return value.toMillis();
    if (typeof value?.seconds === "number") return value.seconds * 1000;
    if (typeof value === "number") return value < 100000000000 ? value * 1000 : value;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
}

function leadTimestamp(lead) {
    const values = [lead?.data, lead?.criadoEm, lead?.createdAt, lead?.timestamp];
    for (const value of values) {
        const timestamp = anyTimestamp(value);
        if (timestamp) return timestamp;
    }
    return 0;
}

function formatDate(timestamp, includeTime = true) {
    const value = anyTimestamp(timestamp);
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("pt-BR", includeTime
        ? { dateStyle: "short", timeStyle: "short" }
        : { dateStyle: "short" }
    );
}

function formatRelative(timestamp) {
    const value = anyTimestamp(timestamp);
    if (!value) return "Sem data";
    const delta = Date.now() - value;
    const future = delta < 0;
    const minutes = Math.max(0, Math.floor(Math.abs(delta) / 60000));
    if (minutes < 1) return "Agora";
    if (minutes < 60) return future ? `em ${minutes} min` : `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return future ? `em ${hours} h` : `${hours} h`;
    const days = Math.floor(hours / 24);
    return future ? `em ${days} d` : `${days} d`;
}

function timestampToLocalInput(value) {
    const timestamp = anyTimestamp(value);
    if (!timestamp) return "";
    const date = new Date(timestamp);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
}

function localDateInput(value) {
    const timestamp = anyTimestamp(value);
    if (!timestamp) return "";
    const date = new Date(timestamp);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
}

function normalizeStatus(lead) {
    const raw = normalizeText(
        lead?.statusLead || lead?.pipelineStage || lead?.status || "novo"
    ).replace(/\s+/g, "_");

    if (["em_contato", "contato", "atendimento"].includes(raw)) return "em_contato";
    if (["qualificado", "qualificacao"].includes(raw)) return "qualificado";
    if (["proposta", "negociacao", "orcamento_enviado"].includes(raw)) return "proposta";
    if (["convertido", "ganho", "cliente"].includes(raw)) return "convertido";
    if (["perdido", "cancelado", "descartado"].includes(raw)) return "perdido";
    return "novo";
}

function stageProbability(status) {
    return PIPELINE_STAGES.find((stage) => stage.id === status)?.probability ?? 10;
}

function computeScore(lead) {
    let score = 0;
    const timestamp = leadTimestamp(lead);
    const ageHours = timestamp ? Math.max(0, (Date.now() - timestamp) / 3600000) : 9999;
    const status = normalizeStatus(lead);
    const phone = normalizePhone(lead.whatsapp || lead.telefone);
    const email = normalizeEmail(lead.email);

    if (phone.length >= 12) score += 22;
    if (email.includes("@")) score += 12;
    if (String(lead.nome || "").trim().length >= 3) score += 8;
    if (String(lead.produtoInteresse || "").trim()) score += 12;
    if (String(lead.origem || "").trim()) score += 5;
    if (String(lead.utmSource || lead.utm_source || "").trim()) score += 6;
    if (String(lead.utmCampaign || lead.utm_campaign || "").trim()) score += 6;
    if (Number(lead.cliques || 0) >= 2) score += 7;
    if (Number(lead.cliques || 0) >= 5) score += 5;
    if (Number(lead.tempoRetencao || 0) >= 30) score += 7;
    if (Number(lead.tempoRetencao || 0) >= 90) score += 5;
    if (Number(lead.totalSubmissoes || lead.submissoes || 1) > 1) score += 8;
    if (numericValue(lead.valorOportunidade) > 0) score += 4;
    if (ageHours <= 1) score += 10;
    else if (ageHours <= 24) score += 6;
    else if (ageHours <= 72) score += 3;

    if (status === "em_contato") score += 4;
    if (status === "qualificado") score += 8;
    if (status === "proposta") score += 12;
    if (status === "convertido") score = 100;
    if (status === "perdido") score = Math.min(score, 25);
    return Math.max(0, Math.min(100, Math.round(score)));
}

function temperatureFor(score) {
    if (score >= TEMPERATURES.hot.min) return "hot";
    if (score >= TEMPERATURES.warm.min) return "warm";
    return "cold";
}

function isOverdue(lead) {
    const status = normalizeStatus(lead);
    if (status === "convertido" || status === "perdido") return false;
    const followup = anyTimestamp(lead.proximoContatoEm || lead.lembreteTimestamp);
    if (followup) return followup < Date.now();
    const lastContact = anyTimestamp(lead.ultimoContatoEm || lead.contatadoEm);
    if (lastContact) return false;
    const timestamp = leadTimestamp(lead);
    return Boolean(timestamp && Date.now() - timestamp > state.slaMinutes * 60000);
}

function leadSchemaVersion(lead) {
    const value = Number(lead?.versaoSchema || lead?.schemaVersion || 1);
    return Number.isFinite(value) && value > 0 ? Math.round(value) : 1;
}

function leadMissingFields(lead) {
    const missing = [];
    const tenant = String(lead?.tenantId || lead?.lojaId || "").trim();
    const owner = String(lead?.criadoPor || "").trim();

    if (!tenant || tenant !== owner) missing.push("tenant");
    if (leadSchemaVersion(lead) < LEAD_SCHEMA_VERSION) missing.push("schema");
    if (!String(lead?.origem || lead?.utmSource || "").trim()) missing.push("origem");
    if (!String(lead?.produtoInteresse || "").trim()) missing.push("interesse");
    if (!String(lead?.paginaOrigem || lead?.urlPagina || "").trim()) missing.push("pagina");
    if (!String(lead?.formularioId || lead?.blocoOrigem || "").trim()) missing.push("formulario");
    if (!String(lead?.tipoCaptura || lead?.canal || "").trim()) missing.push("captura");
    return missing;
}

function standardLeadPatch(lead) {
    if (!lead || String(lead.criadoPor || "") !== state.ownerUid) return {};

    const patch = {};
    const origin = String(lead._origin || lead.origem || "Direto").trim() || "Direto";
    const campaign = String(lead._campaign || lead.utmCampaign || "").trim();
    const page = String(
        lead.paginaOrigem ||
        lead.blocoOrigem ||
        (lead.urlPagina ? "loja_publica" : "captura_legada")
    ).trim() || "captura_legada";
    const formId = String(
        lead.formularioId ||
        lead.blocoOrigem ||
        page ||
        "captura_legada"
    ).trim().slice(0, 160);

    if (lead.tenantId !== state.ownerUid) patch.tenantId = state.ownerUid;
    if (lead.lojaId !== state.ownerUid) patch.lojaId = state.ownerUid;
    if (leadSchemaVersion(lead) < LEAD_SCHEMA_VERSION) patch.versaoSchema = LEAD_SCHEMA_VERSION;
    if (!String(lead.origem || "").trim()) patch.origem = origin.slice(0, 120);
    if (!String(lead.utmSource || "").trim()) patch.utmSource = origin.slice(0, 120);
    if (!String(lead.utmMedium || "").trim()) {
        patch.utmMedium = origin === "Direto" ? "Direto" : "Referência";
    }
    if (!String(lead.utmCampaign || "").trim() && campaign !== "Sem campanha") {
        patch.utmCampaign = campaign.slice(0, 120);
    }
    if (!String(lead.produtoInteresse || "").trim()) patch.produtoInteresse = "Interesse geral";
    if (!String(lead.paginaOrigem || "").trim()) patch.paginaOrigem = page.slice(0, 160);
    if (!String(lead.formularioId || "").trim()) patch.formularioId = formId;
    if (!String(lead.formularioNome || "").trim()) {
        patch.formularioNome = formId === "captura_legada" ? "Captura legada" : formId.replace(/[_-]+/g, " ").slice(0, 160);
    }
    if (!String(lead.tipoCaptura || "").trim()) patch.tipoCaptura = "legado";
    if (!String(lead.canal || "").trim()) patch.canal = "loja_publica";
    if (!String(lead.statusLead || "").trim()) patch.statusLead = normalizeStatus(lead);
    if (!String(lead.status || "").trim()) patch.status = normalizeStatus(lead);
    if (!String(lead.pipelineStage || "").trim()) patch.pipelineStage = normalizeStatus(lead);
    return patch;
}

function normalizeLead(lead) {
    const capturedAt = leadTimestamp(lead);
    const score = Number.isFinite(Number(lead.leadScore))
        ? Number(lead.leadScore)
        : computeScore(lead);

    let sourceFromUrl = "";
    let campaignFromUrl = "";
    let mediumFromUrl = "";

    try {
        const rawUrl = String(lead.urlPagina || lead.paginaOrigem || "").trim();
        if (rawUrl) {
            const capturedUrl = new URL(rawUrl, window.location.origin);
            sourceFromUrl = capturedUrl.searchParams.get("utm_source") || "";
            campaignFromUrl = capturedUrl.searchParams.get("utm_campaign") || "";
            mediumFromUrl = capturedUrl.searchParams.get("utm_medium") || "";
        }
    } catch (error) {}

    const origin = String(
        lead.origem || lead.utmSource || lead.utm_source || sourceFromUrl || "Direto"
    ).trim() || "Direto";

    const campaign = String(
        lead.utmCampaign || lead.utm_campaign || campaignFromUrl || "Sem campanha"
    ).trim() || "Sem campanha";

    const status = normalizeStatus(lead);
    const probabilityRaw = Number(lead.probabilidade);
    const probability = Number.isFinite(probabilityRaw)
        ? Math.max(0, Math.min(100, Math.round(probabilityRaw)))
        : stageProbability(status);

    const history = Array.isArray(lead.historicoLead)
        ? lead.historicoLead.filter((item) => item && typeof item === "object").slice(-MAX_HISTORY)
        : [];

    return {
        ...lead,
        _timestamp: capturedAt,
        _status: status,
        _schemaVersion: leadSchemaVersion(lead),
        _tenantValid: String(lead.criadoPor || "") === state.ownerUid,
        _missingFields: leadMissingFields(lead),
        _qualityComplete: leadMissingFields(lead).length === 0,
        _captureType: String(lead.tipoCaptura || lead.canal || "legado"),
        _formId: String(lead.formularioId || lead.blocoOrigem || "captura_legada"),
        _page: String(lead.paginaOrigem || lead.urlPagina || "Não informada"),
        _unread: !anyTimestamp(lead.visualizadoEm) && capturedAt > state.lastSeenTimestamp,
        _score: Math.max(0, Math.min(100, Math.round(score))),
        _temperature: temperatureFor(score),
        _overdue: isOverdue(lead),
        _phone: normalizePhone(lead.whatsapp || lead.telefone),
        _email: normalizeEmail(lead.email),
        _origin: origin,
        _campaign: campaign,
        _medium: String(lead.utmMedium || lead.utm_medium || mediumFromUrl || "").trim(),
        _value: Math.max(0, numericValue(lead.valorOportunidade)),
        _probability: probability,
        _forecast: Math.max(0, numericValue(lead.valorOportunidade)) * probability / 100,
        _responsibleUid: String(lead.responsavelUid || ""),
        _responsibleName: String(lead.responsavelNome || ""),
        _history: history,
        _search: normalizeText([
            lead.nome, lead.email, lead.whatsapp, lead.telefone,
            lead.origem, lead.utmSource, lead.utm_source,
            lead.utmCampaign, lead.utm_campaign,
            sourceFromUrl, campaignFromUrl,
            lead.produtoInteresse, lead.produtoId, lead.paginaOrigem,
            lead.formularioNome, lead.formularioId,
            lead.blocoOrigem, lead.tipoCaptura, lead.canal,
            lead.sessaoId, lead.dedupeKey,
            lead.anotacao, lead.etiqueta, lead.responsavelNome
        ].filter(Boolean).join(" "))
    };
}

function ownerUidFromContext(user) {
    const params = new URLSearchParams(window.location.search);
    let contextUid = "";

    try {
        const snapshot = window.VideHubContext?.getSnapshot?.();
        contextUid = String(
            snapshot?.effectiveUid ||
            snapshot?.ownerUid ||
            snapshot?.tenantId ||
            ""
        ).trim();
    } catch (error) {}

    return String(
        params.get("masterUID") ||
        contextUid ||
        user?.uid ||
        ""
    ).trim();
}

async function resolveOwnerUid(user) {
    const contextual = ownerUidFromContext(user);
    if (contextual && contextual !== user?.uid) return contextual;

    try {
        const employeeSnap = await getDoc(doc(db, "funcionarios", user.uid));
        if (employeeSnap.exists()) {
            const employee = employeeSnap.data();
            state.employeeProfile = employee;
            if (employee.status === "ativo" && employee.donoUID) {
                return String(employee.donoUID).trim();
            }
        }
    } catch (error) {
        console.info("[Aura Leads V6.2] Contexto de funcionário não identificado.");
    }

    return contextual || user?.uid || "";
}

function permissionListIncludes(list, moduleName) {
    return Array.isArray(list) && list.includes(moduleName);
}

function getLifecycleSignal() {
    if (!state.lifecycleController || state.lifecycleController.signal.aborted) {
        state.lifecycleController = new AbortController();
    }
    return state.lifecycleController.signal;
}

function dispatchModalState(open) {
    window.dispatchEvent(new CustomEvent("aura:leads-v5-statechange", {
        detail: { open }
    }));
}

function applyModalState(modal, open, options = {}) {
    if (!modal) return;
    const changed = state.modalOpen !== open;
    state.modalOpen = open;
    modal.classList.toggle("is-open", open);
    modal.setAttribute("aria-hidden", open ? "false" : "true");
    modal.style.pointerEvents = open ? "auto" : "none";
    if (open) modal.removeAttribute("inert");
    else modal.setAttribute("inert", "");
    if (changed && options.emit !== false) dispatchModalState(open);
}

function focusModal(modal) {
    requestAnimationFrame(() => {
        if (state.modalOpen) {
            modal.querySelector("button[data-aura-close]")?.focus({ preventScroll: true });
        }
    });
}

function restorePreviousFocus() {
    const target = state.previouslyFocusedElement;
    state.previouslyFocusedElement = null;
    if (!(target instanceof HTMLElement) || !target.isConnected) return;
    requestAnimationFrame(() => {
        if (!state.modalOpen && target.isConnected) target.focus({ preventScroll: true });
    });
}

function teardownModalLifecycle() {
    closeDetail();
    state.legacyObserver?.disconnect();
    state.legacyObserver = null;
    if (typeof state.unsubscribeLeads === "function") {
        state.unsubscribeLeads();
    }
    state.unsubscribeLeads = null;
    state.lifecycleController?.abort();
    state.lifecycleController = null;
    state.previouslyFocusedElement = null;
    if (state.searchTimer) clearTimeout(state.searchTimer);
}

function loadSLA() {
    const saved = Number(localStorage.getItem(`${STORAGE_PREFIX}sla_${state.ownerUid}`));
    state.slaMinutes = Number.isFinite(saved) && saved >= 5 ? Math.min(1440, saved) : 30;
}

function saveSLA(value) {
    state.slaMinutes = Math.max(5, Math.min(1440, Number(value) || 30));
    localStorage.setItem(`${STORAGE_PREFIX}sla_${state.ownerUid}`, String(state.slaMinutes));
    state.leads = state.leads.map(normalizeLead);
    deriveGroups();
    render();
}

function loadAutomationPreferences() {
    try {
        const saved = JSON.parse(localStorage.getItem(
            `${STORAGE_PREFIX}automation_${state.ownerUid}`
        ) || "{}");
        state.automation = {
            ...DEFAULT_AUTOMATIONS,
            ...(saved && typeof saved === "object" ? saved : {})
        };
    } catch (error) {
        state.automation = { ...DEFAULT_AUTOMATIONS };
    }
}

function saveAutomationPreferences() {
    localStorage.setItem(
        `${STORAGE_PREFIX}automation_${state.ownerUid}`,
        JSON.stringify(state.automation)
    );
}

function toast(message, type = "success") {
    if (typeof window.showToast === "function") {
        window.showToast(message, type);
        return;
    }

    let host = document.getElementById("aura-leads-v5-toast-host");
    if (!host) {
        host = document.createElement("div");
        host.id = "aura-leads-v5-toast-host";
        host.className = "aura-leads-v5-toast-host";
        document.body.appendChild(host);
    }

    const item = document.createElement("div");
    item.className = `aura-leads-v5-toast is-${type}`;
    item.textContent = message;
    host.appendChild(item);
    requestAnimationFrame(() => item.classList.add("is-visible"));
    setTimeout(() => {
        item.classList.remove("is-visible");
        setTimeout(() => item.remove(), 220);
    }, 3200);
}

function actorName() {
    return state.actorName || state.user?.displayName || state.user?.email || "Equipe";
}

async function loadAccessContext(user) {
    state.actorName = user.displayName || user.email || "Equipe";
    state.canView = user.uid === state.ownerUid;
    state.canEdit = user.uid === state.ownerUid;

    try {
        const tokenResult = await user.getIdTokenResult?.();
        state.isBackendAdmin = tokenResult?.claims?.videAdmin === true;
        if (state.isBackendAdmin) {
            state.canView = true;
            state.canEdit = true;
        }
    } catch (error) {
        state.isBackendAdmin = false;
    }

    if (!state.canView || !state.canEdit) {
        try {
            let employee = state.employeeProfile;
            if (!employee) {
                const employeeSnap = await getDoc(doc(db, "funcionarios", user.uid));
                employee = employeeSnap.exists() ? employeeSnap.data() : null;
                state.employeeProfile = employee;
            }

            if (employee) {
                const permissions = employee.permissoes || {};
                const activeForTenant = (
                    employee.status === "ativo" &&
                    employee.donoUID === state.ownerUid
                );

                state.actorName = employee.nome || user.displayName || user.email || "Funcionário";
                state.canView = state.canView || (
                    activeForTenant && (
                        permissionListIncludes(permissions.ver, "leads") ||
                        permissionListIncludes(permissions.editar, "leads")
                    )
                );
                state.canEdit = state.canEdit || (
                    activeForTenant &&
                    permissionListIncludes(permissions.editar, "leads")
                );

                if (state.canView) {
                    state.team.push({
                        uid: user.uid,
                        nome: state.actorName,
                        cargo: employee.cargo || "Equipe"
                    });
                }
            }
        } catch (error) {
            console.warn("[Aura Leads V6.2] Permissão não carregada:", error?.message || error);
        }
    }

    state.accessLoaded = true;
}

async function loadTeam() {
    const team = new Map();

    try {
        const ownerSnap = await getDoc(doc(db, "usuarios", state.ownerUid));
        const ownerData = ownerSnap.exists() ? ownerSnap.data() : {};
        team.set(state.ownerUid, {
            uid: state.ownerUid,
            nome: ownerData.nome || ownerData.nomeLoja || "Proprietário",
            cargo: "Proprietário"
        });
    } catch (error) {
        team.set(state.ownerUid, {
            uid: state.ownerUid,
            nome: "Proprietário",
            cargo: "Proprietário"
        });
    }

    state.team.forEach((person) => {
        if (person?.uid) team.set(person.uid, person);
    });

    try {
        const snapshot = await getDocs(query(
            collection(db, "funcionarios"),
            where("donoUID", "==", state.ownerUid)
        ));
        snapshot.forEach((item) => {
            const employee = item.data();
            if (employee.status !== "ativo") return;
            team.set(item.id, {
                uid: item.id,
                nome: employee.nome || employee.email || "Funcionário",
                cargo: employee.cargo || "Equipe"
            });
        });
    } catch (error) {
        console.info("[Aura Leads V6] Lista completa da equipe indisponível.");
    }

    state.team = Array.from(team.values())
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

function injectEntryButton() {
    return injectModal();
}

function renderEmptyDetail() {
    return "";
}

function wrapLegacyLeadsContent(view) {
    let legacy = view.querySelector(
        ":scope > #aura-leads-v6-legacy"
    );

    if (legacy) return legacy;

    legacy = document.createElement("div");
    legacy.id = "aura-leads-v6-legacy";
    legacy.className = "aura-leads-v6-legacy";
    legacy.hidden = true;
    legacy.setAttribute("aria-hidden", "true");

    while (view.firstChild) {
        legacy.appendChild(view.firstChild);
    }

    view.appendChild(legacy);
    return legacy;
}

function watchLegacyLeadsContent(view, workspace, legacy) {
    state.legacyObserver?.disconnect();

    state.legacyObserver = new MutationObserver((records) => {
        records.forEach((record) => {
            record.addedNodes.forEach((node) => {
                if (
                    node.nodeType !== Node.ELEMENT_NODE ||
                    node === workspace ||
                    node === legacy ||
                    node.parentNode !== view
                ) {
                    return;
                }

                legacy.appendChild(node);
            });
        });
    });

    state.legacyObserver.observe(view, {
        childList: true
    });
}

function activateLeadsWorkspace(tab = state.activeTab) {
    const view = document.getElementById("view-leads");
    const navigationButton = document.querySelector(
        '[data-target="view-leads"]'
    );

    if (tab) state.activeTab = tab;

    if (view?.classList.contains("hidden") && navigationButton) {
        navigationButton.click();
    }

    state.modalOpen = true;
    updateActiveTabUI();
    closeDetail();
    render();

    requestAnimationFrame(() => {
        document.getElementById("aura-leads-v5-modal")
            ?.scrollIntoView({ block: "start" });
    });
}

function bindModuleNavigation() {
    if (state.navigationBound) return;
    state.navigationBound = true;

    document.addEventListener("click", (event) => {
        const trigger = event.target instanceof Element
            ? event.target.closest("[data-target]")
            : null;

        if (!trigger) return;

        if (trigger.dataset.target === "view-automacao-leads") {
            event.preventDefault();
            event.stopImmediatePropagation();
            activateLeadsWorkspace("automations");
            return;
        }

        if (trigger.dataset.target === "view-leads") {
            requestAnimationFrame(() => {
                state.modalOpen = true;
                updateActiveTabUI();
                render();
            });
        }
    }, {
        capture: true,
        signal: getLifecycleSignal()
    });
}

function injectModal() {
    const existing = document.getElementById("aura-leads-v5-modal");
    if (existing) return existing;

    const view = document.getElementById("view-leads");
    if (!view) return null;

    const legacy = wrapLegacyLeadsContent(view);
    const workspace = document.createElement("section");
    workspace.id = "aura-leads-v5-modal";
    workspace.className = "aura-leads-v5-modal aura-leads-v6-inline is-open";
    workspace.setAttribute("aria-hidden", "false");
    workspace.innerHTML = `
        <section class="aura-leads-v5-shell aura-leads-v6-shell" aria-labelledby="aura-leads-v5-title">
            <header class="aura-leads-v5-header">
                <div class="aura-leads-v5-brand">
                    <span class="aura-leads-v5-brand-icon">${svg.spark}</span>
                    <div><span>Aura Operations</span><h2 id="aura-leads-v5-title">Central Comercial de Leads</h2></div>
                </div>
                <div class="aura-leads-v5-header-actions">
                    <span id="aura-leads-v5-access-badge" class="aura-leads-v5-access-badge"></span>
                    <button type="button" class="aura-leads-v5-ghost" data-action="refresh">${svg.refresh} Atualizar</button>
                    <button type="button" class="aura-leads-v5-ghost" data-action="export">${svg.export} Exportar</button>
                </div>
            </header>

            <div class="aura-leads-v5-toolbar">
                <nav class="aura-leads-v5-tabs" aria-label="Áreas da central">
                    <button type="button" data-tab="inbox" class="is-active">${svg.user}<span>Inbox</span><em id="aura-leads-v5-inbox-badge" hidden>0</em></button>
                    <button type="button" data-tab="pipeline">${svg.board}<span>Pipeline</span></button>
                    <button type="button" data-tab="agenda">${svg.calendar}<span>Agenda</span></button>
                    <button type="button" data-tab="priority">${svg.spark}<span>Prioridades</span></button>
                    <button type="button" data-tab="forms">${svg.form}<span>Formulários</span></button>
                    <button type="button" data-tab="sources">${svg.source}<span>Origens</span></button>
                    <button type="button" data-tab="reports">${svg.chart}<span>Relatórios</span></button>
                    <button type="button" data-tab="duplicates">${svg.duplicate}<span>Duplicidades</span></button>
                    <button type="button" data-tab="archived">${svg.archive}<span>Arquivados</span><em>${state.archivedLeads.length}</em></button>
                    <button type="button" data-tab="trash">${svg.trash}<span>Lixeira</span><em>${state.trashLeads.length}</em></button>
                    <button type="button" data-tab="automations">${svg.automation}<span>Automações</span></button>
                </nav>
                <div class="aura-leads-v5-sla">
                    <label for="aura-leads-v5-sla">SLA inicial</label>
                    <select id="aura-leads-v5-sla">
                        <option value="15">15 min</option>
                        <option value="30">30 min</option>
                        <option value="60">1 hora</option>
                        <option value="120">2 horas</option>
                        <option value="240">4 horas</option>
                        <option value="1440">24 horas</option>
                    </select>
                </div>
            </div>

            <div class="aura-leads-v5-body aura-leads-v6-body">
                <main class="aura-leads-v5-main"><div id="aura-leads-v5-content"></div></main>
                <section id="aura-leads-v5-detail" class="aura-leads-v5-detail aura-leads-v6-detail" aria-label="Detalhes do lead" hidden></section>
            </div>
        </section>
    `;

    state.modalOpen = true;
    view.classList.add("aura-leads-v6-host");
    view.prepend(workspace);
    watchLegacyLeadsContent(view, workspace, legacy);
    bindModuleNavigation();
    disableLegacyMobileController();

    const signal = getLifecycleSignal();

    workspace.querySelector("[data-action='refresh']")?.addEventListener(
        "click",
        () => loadLeads({ force: true }),
        { signal }
    );
    workspace.querySelector("[data-action='export']")?.addEventListener(
        "click",
        exportCSV,
        { signal }
    );

    workspace.querySelectorAll("[data-tab]").forEach((button) => {
        button.addEventListener("click", () => {
            state.activeTab = button.dataset.tab || "inbox";
            state.selectedIds.clear();
            updateActiveTabUI();
            closeDetail();
            render();
        }, { signal });
    });

    const sla = workspace.querySelector("#aura-leads-v5-sla");
    sla.value = String(state.slaMinutes);
    sla.addEventListener("change", () => saveSLA(sla.value), { signal });

    const content = workspace.querySelector("#aura-leads-v5-content");
    content?.addEventListener("click", handleContentClick, { signal });
    content?.addEventListener("change", handleContentChange, { signal });
    content?.addEventListener("input", handleContentInput, { signal });

    const detail = workspace.querySelector("#aura-leads-v5-detail");
    detail?.addEventListener("click", handleDetailClick, { signal });
    detail?.addEventListener("change", handleDetailChange, { signal });

    document.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && event.altKey && event.key.toLowerCase() === "l") {
            event.preventDefault();
            activateLeadsWorkspace("inbox");
            return;
        }

        if (event.key === "Escape" && workspace.classList.contains("is-detail-open")) {
            closeDetail();
        }
    }, { signal });

    updateAccessBadge();
    updateUnreadBadges();
    return workspace;
}

function updateAccessBadge() {
    const badge = document.getElementById("aura-leads-v5-access-badge");
    if (!badge) return;

    if (!state.canView) {
        badge.textContent = "Sem acesso";
        badge.dataset.mode = "denied";
        return;
    }

    badge.textContent = state.canEdit ? "Edição liberada" : "Somente leitura";
    badge.dataset.mode = state.canEdit ? "edit" : "read";
}

function updateActiveTabUI() {
    const modal = document.getElementById("aura-leads-v5-modal");
    modal?.querySelectorAll("[data-tab]").forEach((button) => {
        button.classList.toggle("is-active", button.dataset.tab === state.activeTab);
        const count = button.querySelector("em");
        if (!count || count.id === "aura-leads-v5-inbox-badge") return;
        if (button.dataset.tab === "archived") count.textContent = String(state.archivedLeads.length);
        if (button.dataset.tab === "trash") count.textContent = String(state.trashLeads.length);
    });
    updateUnreadBadges();
}

function openModal(options = {}) {
    injectModal();

    const requestedTab = typeof options === "string"
        ? options
        : options?.tab;

    activateLeadsWorkspace(requestedTab || state.activeTab || "inbox");

    if (!state.unsubscribeLeads && !state.loading) {
        loadLeads();
    }
}

function closeModal() {
    closeDetail();
}

function closeDetail() {
    const workspace = document.getElementById("aura-leads-v5-modal");
    const host = document.getElementById("aura-leads-v5-detail");
    const main = workspace?.querySelector(".aura-leads-v5-main");

    workspace?.classList.remove("is-detail-open");
    if (host) {
        host.hidden = true;
        host.innerHTML = "";
    }
    main?.removeAttribute("aria-hidden");
    state.selectedLeadId = "";

    document.querySelectorAll("[data-open-lead].is-selected")
        .forEach((item) => item.classList.remove("is-selected"));

    requestAnimationFrame(() => {
        workspace?.scrollIntoView({ block: "start" });
    });
}

function handleRealtimeSnapshot(snapshot) {
    const wasReady = state.realtimeReady;
    const previousIds = state.knownLeadIds;
    const normalized = snapshot.docs
        .map((item) => normalizeLead({ id: item.id, ...item.data() }));
    const incoming = normalized.filter((lead) => lead._tenantValid);

    state.invalidTenantCount = normalized.length - incoming.length;
    if (state.invalidTenantCount > 0) {
        console.error(
            `[Aura Leads V6.2] ${state.invalidTenantCount} registro(s) fora do tenant foram ignorados.`
        );
    }

    const newIds = new Set(incoming.map((lead) => lead.id));
    const added = wasReady
        ? incoming.filter((lead) =>
            !previousIds.has(lead.id) &&
            lead._timestamp > state.lastSeenTimestamp
        )
        : [];

    state.knownLeadIds = newIds;
    state.realtimeReady = true;
    state.allLeads = incoming;
    state.loading = false;
    refreshLeadCollections();
    updateActiveTabUI();
    dispatchLeadsBridge();

    if (state.modalOpen) {
        render();
        if (state.selectedLeadId) {
            const exists = Boolean(findLead(state.selectedLeadId));
            if (exists) renderDetail(state.selectedLeadId);
            else closeDetail();
        }
    }

    if (added.length) notifyNewLeads(added);

    if (!wasReady && state.automation.runOnRefresh && state.canEdit && !state.automationRunning) {
        runAutomations({ silent: true, skipRender: true });
    }
}

function dispatchLeadsBridge() {
    window.dispatchEvent(new CustomEvent("aura:leads-v6-data", {
        detail: {
            ownerUid: state.ownerUid,
            canView: state.canView,
            canEdit: state.canEdit,
            leads: state.allLeads.slice()
        }
    }));
}

function loadLeads(options = {}) {
    if (!state.ownerUid) return;
    if (!state.canView) {
        state.loading = false;
        renderAccessDenied();
        return;
    }
    const force = options === true || Boolean(options?.force);

    if (state.unsubscribeLeads && !force) {
        state.loading = false;
        if (state.modalOpen) render();
        return;
    }

    if (typeof state.unsubscribeLeads === "function") {
        state.unsubscribeLeads();
    }

    state.unsubscribeLeads = null;
    state.realtimeReady = false;
    state.knownLeadIds = new Set();
    state.loading = true;
    if (state.modalOpen) renderLoading();

    const leadsQuery = query(
        collection(db, "leads"),
        where("criadoPor", "==", state.ownerUid)
    );

    state.unsubscribeLeads = onSnapshot(
        leadsQuery,
        handleRealtimeSnapshot,
        (error) => {
            state.loading = false;
            state.unsubscribeLeads = null;
            console.error("[Aura Leads V6] Falha na sincronização em tempo real:", error);
            if (state.modalOpen) {
                renderError("Não foi possível sincronizar os leads. Verifique suas regras do Firestore.");
            }
        }
    );
}

function deriveGroups() {
    state.duplicateGroups = buildDuplicateGroups();
    state.sourceGroups = groupBy(state.leads, (lead) => lead._origin || "Direto");
    state.formGroups = groupBy(state.leads, (lead) => String(
        lead.formularioNome || lead.formularioId || lead.blocoOrigem ||
        lead.paginaOrigem || "Captura geral"
    ).trim() || "Captura geral");
}

function groupBy(items, resolver) {
    const map = new Map();
    for (const item of items) {
        const key = resolver(item);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(item);
    }

    return Array.from(map.entries())
        .map(([name, leads]) => ({
            name,
            leads,
            total: leads.length,
            converted: leads.filter((lead) => lead._status === "convertido").length,
            hot: leads.filter((lead) => lead._temperature === "hot").length,
            averageScore: leads.length
                ? Math.round(leads.reduce((sum, lead) => sum + lead._score, 0) / leads.length)
                : 0,
            value: leads.reduce((sum, lead) => sum + lead._value, 0)
        }))
        .sort((a, b) => b.total - a.total);
}

function buildDuplicateGroups() {
    const buckets = new Map();

    for (const lead of state.leads) {
        const keys = [];
        if (lead._phone.length >= 10) keys.push(`phone:${lead._phone}`);
        if (lead._email.includes("@")) keys.push(`email:${lead._email}`);
        if (String(lead.dedupeKey || "").trim()) keys.push(`capture:${lead.dedupeKey}`);

        for (const key of keys) {
            if (!buckets.has(key)) buckets.set(key, new Map());
            buckets.get(key).set(lead.id, lead);
        }
    }

    const groups = [];
    const fingerprint = new Set();

    for (const [key, leadsMap] of buckets.entries()) {
        const leads = Array.from(leadsMap.values());
        if (leads.length < 2) continue;
        const ids = leads.map((lead) => lead.id).sort().join("|");
        if (fingerprint.has(ids)) continue;
        fingerprint.add(ids);
        groups.push({
            key,
            leads: leads.sort((a, b) => b._timestamp - a._timestamp),
            total: leads.length
        });
    }

    return groups.sort((a, b) => b.total - a.total);
}

function applyFilters(leads) {
    const search = normalizeText(state.search);
    return leads.filter((lead) => {
        if (search && !lead._search.includes(search)) return false;
        if (state.status !== "all" && lead._status !== state.status) return false;
        if (state.temperature !== "all" && lead._temperature !== state.temperature) return false;
        if (state.origin !== "all" && lead._origin !== state.origin) return false;
        if (state.campaign !== "all" && lead._campaign !== state.campaign) return false;
        if (state.responsible !== "all" && lead._responsibleUid !== state.responsible) return false;
        return true;
    });
}

function activeLeads() {
    return state.leads.filter((lead) => !["convertido", "perdido"].includes(lead._status));
}

function renderAccessDenied() {
    const content = document.getElementById("aura-leads-v5-content");
    if (!content) return;
    content.innerHTML = `<section class="aura-leads-v6-access-denied">
        ${svg.user}
        <span>Acesso protegido</span>
        <h3>Você não possui permissão para visualizar Leads</h3>
        <p>O proprietário da loja precisa liberar a permissão <strong>Leads — visualizar</strong> para esta conta.</p>
    </section>`;
}

function render() {
    const content = document.getElementById("aura-leads-v5-content");
    if (!content) return;
    if (state.accessLoaded && !state.canView) return renderAccessDenied();
    if (state.loading) return renderLoading();

    switch (state.activeTab) {
        case "pipeline":
            content.innerHTML = renderPipeline();
            bindPipelineDrag();
            break;
        case "agenda":
            content.innerHTML = renderAgenda();
            break;
        case "forms":
            content.innerHTML = renderGroupsView("forms");
            break;
        case "sources":
            content.innerHTML = renderGroupsView("sources");
            break;
        case "reports":
            content.innerHTML = renderReports();
            break;
        case "duplicates":
            content.innerHTML = renderDuplicates();
            break;
        case "archived":
            content.innerHTML = renderStoredLeads("archived");
            break;
        case "trash":
            content.innerHTML = renderStoredLeads("trash");
            break;
        case "automations":
            content.innerHTML = renderAutomations();
            break;
        default:
            renderInbox(content);
    }
}

function renderInbox(content) {
    const baseLeads = state.activeTab === "priority"
        ? state.leads.filter((lead) =>
            lead._overdue || lead._temperature === "hot" || lead.prioridadeLead === "alta"
        )
        : state.leads;

    state.filtered = applyFilters(baseLeads);
    content.innerHTML = `${renderMetrics()}${renderFilters()}${renderBulkBar(state.filtered)}${renderLeadTable(state.filtered)}`;
}

function renderMetrics() {
    const total = state.leads.length;
    const due = state.leads.filter((lead) => lead._overdue).length;
    const open = activeLeads();
    const pipelineValue = open.reduce((sum, lead) => sum + lead._value, 0);
    const forecast = open.reduce((sum, lead) => sum + lead._forecast, 0);
    const converted = state.leads.filter((lead) => lead._status === "convertido");
    const convertedValue = converted.reduce((sum, lead) => sum + lead._value, 0);
    const conversion = total ? Math.round((converted.length / total) * 1000) / 10 : 0;
    const standardized = state.leads.filter((lead) => lead._qualityComplete).length;
    const quality = total ? Math.round((standardized / total) * 100) : 100;

    return `
        <section class="aura-leads-v5-metrics">
            <article>
                <span>Base ativa</span><strong>${total.toLocaleString("pt-BR")}</strong>
                <small>${open.length} em aberto · ${state.unreadCount} não lido(s) · ${quality}% padronizada</small>
            </article>
            <article data-state="${due ? "danger" : "ok"}">
                <span>Follow-ups vencidos</span><strong>${due}</strong>
                <small>Contatos que exigem atenção</small>
            </article>
            <article data-state="hot">
                <span>Previsão ponderada</span><strong>${formatMoney(forecast)}</strong>
                <small>Pipeline bruto: ${formatMoney(pipelineValue)}</small>
            </article>
            <article data-state="success">
                <span>Receita ganha</span><strong>${formatMoney(convertedValue)}</strong>
                <small>${conversion.toLocaleString("pt-BR")}% de conversão</small>
            </article>
        </section>
    `;
}

function uniqueValues(selector, exclude = []) {
    return Array.from(new Set(
        state.leads.map(selector).filter((value) => value && !exclude.includes(value))
    )).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function renderOptions(values, selected) {
    return values.map((value) => `
        <option value="${escapeHTML(value)}" ${selected === value ? "selected" : ""}>
            ${escapeHTML(value)}
        </option>
    `).join("");
}

function renderTeamOptions(selected, includeAll = false) {
    const options = [includeAll
        ? `<option value="all">Todos os responsáveis</option>`
        : `<option value="">Sem responsável</option>`
    ];
    const known = new Set();

    state.team.forEach((person) => {
        known.add(person.uid);
        options.push(`
            <option value="${escapeHTML(person.uid)}" ${selected === person.uid ? "selected" : ""}>
                ${escapeHTML(person.nome)}
            </option>
        `);
    });

    if (selected && selected !== "all" && !known.has(selected)) {
        const lead = state.allLeads.find((item) =>
            item._responsibleUid === selected && item._responsibleName
        );
        options.push(`
            <option value="${escapeHTML(selected)}" selected>
                ${escapeHTML(lead?._responsibleName || "Responsável atual")}
            </option>
        `);
    }

    return options.join("");
}

function renderFilters() {
    const origins = uniqueValues((lead) => lead._origin);
    const campaigns = uniqueValues((lead) => lead._campaign, ["Sem campanha"]);

    return `
        <section class="aura-leads-v5-filters">
            <label class="aura-leads-v5-search">
                ${svg.search}
                <input id="aura-leads-v5-search" type="search"
                    placeholder="Buscar nome, WhatsApp, campanha ou interesse"
                    value="${escapeHTML(state.search)}">
            </label>
            <select id="aura-leads-v5-status" aria-label="Filtrar por status">
                <option value="all">Todos os status</option>
                ${PIPELINE_STAGES.map((stage) => `
                    <option value="${stage.id}" ${state.status === stage.id ? "selected" : ""}>${stage.label}</option>
                `).join("")}
            </select>
            <select id="aura-leads-v5-temperature" aria-label="Filtrar por temperatura">
                <option value="all">Todas as temperaturas</option>
                <option value="hot" ${state.temperature === "hot" ? "selected" : ""}>Quentes</option>
                <option value="warm" ${state.temperature === "warm" ? "selected" : ""}>Mornos</option>
                <option value="cold" ${state.temperature === "cold" ? "selected" : ""}>Frios</option>
            </select>
            <select id="aura-leads-v5-origin" aria-label="Filtrar por origem">
                <option value="all">Todas as origens</option>${renderOptions(origins, state.origin)}
            </select>
            <select id="aura-leads-v5-campaign" aria-label="Filtrar por campanha">
                <option value="all">Todas as campanhas</option>${renderOptions(campaigns, state.campaign)}
            </select>
            <select id="aura-leads-v5-responsible" aria-label="Filtrar por responsável">
                ${renderTeamOptions(state.responsible, true)}
            </select>
            <button type="button" class="aura-leads-v5-secondary" data-action="mark-read"
                ${state.unreadCount ? "" : "disabled"}>${svg.eye} Marcar lidos</button>
            <button type="button" class="aura-leads-v5-secondary" data-action="recalculate"
                ${state.canEdit ? "" : "disabled"}>${svg.spark} Recalcular</button>
        </section>
    `;
}

function responsibleLabel(lead) {
    return lead._responsibleName ||
        state.team.find((person) => person.uid === lead._responsibleUid)?.nome ||
        "Sem responsável";
}

function selectedLeads() {
    return Array.from(state.selectedIds)
        .map(findLead)
        .filter(Boolean);
}

function renderBulkBar(leads) {
    if (!state.canEdit || !["inbox", "priority", "archived", "trash"].includes(state.activeTab)) {
        return "";
    }

    const count = selectedLeads().length;
    const disabled = !count || state.bulkRunning ? "disabled" : "";
    const visibleIds = leads.map((lead) => lead.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => state.selectedIds.has(id));
    const activeMode = state.activeTab === "inbox" || state.activeTab === "priority";

    let actions = "";
    if (activeMode) {
        actions = `
            <label><span>Etapa</span><select id="aura-leads-v5-bulk-stage">
                ${PIPELINE_STAGES.map((stage) => `<option value="${stage.id}">${stage.label}</option>`).join("")}
            </select><button type="button" data-bulk-action="stage" ${disabled}>Aplicar</button></label>
            <label><span>Responsável</span><select id="aura-leads-v5-bulk-responsible">
                ${renderTeamOptions("")}
            </select><button type="button" data-bulk-action="responsible" ${disabled}>Aplicar</button></label>
            <label><span>Prioridade</span><select id="aura-leads-v5-bulk-priority">
                <option value="baixa">Baixa</option><option value="normal">Normal</option><option value="alta">Alta</option>
            </select><button type="button" data-bulk-action="priority" ${disabled}>Aplicar</button></label>
            <button type="button" class="is-archive" data-bulk-action="archive" ${disabled}>${svg.archive} Arquivar</button>
            <button type="button" class="is-danger" data-bulk-action="trash" ${disabled}>${svg.trash} Lixeira</button>
        `;
    } else if (state.activeTab === "archived") {
        actions = `
            <button type="button" class="is-restore" data-bulk-action="restore" ${disabled}>${svg.restore} Restaurar</button>
            <button type="button" class="is-danger" data-bulk-action="trash" ${disabled}>${svg.trash} Lixeira</button>
        `;
    } else {
        actions = `<button type="button" class="is-restore" data-bulk-action="restore" ${disabled}>${svg.restore} Restaurar</button>`;
    }

    return `<section class="aura-leads-v5-bulk ${count ? "is-active" : ""}">
        <div class="aura-leads-v5-bulk-summary">
            <button type="button" data-bulk-action="toggle-visible">${svg.check} ${allVisibleSelected ? "Desmarcar visíveis" : "Selecionar visíveis"}</button>
            <strong>${count} selecionado(s)</strong>
            <button type="button" data-bulk-action="clear" ${count ? "" : "disabled"}>Limpar</button>
        </div>
        <div class="aura-leads-v5-bulk-actions">${actions}</div>
    </section>`;
}

function renderStoredLeads(kind) {
    const isTrash = kind === "trash";
    const collection = isTrash ? state.trashLeads : state.archivedLeads;
    state.filtered = applyFilters(collection);

    return `<section class="aura-leads-v5-storage-heading" data-kind="${kind}">
        <div>${isTrash ? svg.trash : svg.archive}<span>
            <small>${isTrash ? "Recuperação" : "Organização"}</small>
            <h3>${isTrash ? "Lixeira de leads" : "Leads arquivados"}</h3>
            <p>${isTrash
                ? "Restaure registros removidos da operação. Nenhum documento é apagado permanentemente nesta etapa."
                : "Consulte registros retirados da operação ativa e restaure quando necessário."}</p>
        </span></div>
        <strong>${collection.length}</strong>
    </section>
    ${renderFilters()}
    ${renderBulkBar(state.filtered)}
    ${renderLeadTable(state.filtered)}`;
}

function renderLeadTable(leads) {
    if (!leads.length) {
        const stored = state.activeTab === "archived" || state.activeTab === "trash";
        return `<section class="aura-leads-v5-empty">${stored ? (state.activeTab === "trash" ? svg.trash : svg.archive) : svg.user}
            <h3>${stored ? "Nenhum registro nesta área" : "Nenhum lead encontrado"}</h3>
            <p>${stored ? "Os registros movidos para cá aparecerão nesta lista." : "Ajuste os filtros ou aguarde novas capturas."}</p>
        </section>`;
    }

    const selectable = state.canEdit && ["inbox", "priority", "archived", "trash"].includes(state.activeTab);
    return `
        <section class="aura-leads-v5-table-wrap">
            <table class="aura-leads-v5-table ${selectable ? "has-selection" : ""}">
                <thead><tr>
                    ${selectable ? "<th class=\"aura-leads-v5-select-cell\"></th>" : ""}
                    <th>Lead</th><th>Intenção</th><th>Origem</th><th>Pipeline</th>
                    <th>Valor</th><th>Responsável</th><th>Agenda</th><th>Capturado</th><th></th>
                </tr></thead>
                <tbody>${leads.map((lead) => renderLeadRow(lead, selectable)).join("")}</tbody>
            </table>
        </section>
    `;
}

function renderLeadRow(lead, selectable = false) {
    const temp = TEMPERATURES[lead._temperature] || TEMPERATURES.cold;
    const contact = lead.whatsapp || lead.telefone || lead.email || "Sem contato";
    const interest = lead.produtoInteresse || lead.paginaOrigem || "Sem interesse informado";
    const context = lead._campaign !== "Sem campanha"
        ? `${lead._campaign} · ${interest}`
        : interest;
    const followup = anyTimestamp(lead.proximoContatoEm || lead.lembreteTimestamp);
    const rowClasses = [
        state.selectedLeadId === lead.id ? "is-selected" : "",
        lead._unread ? "is-unread" : "",
        lead.arquivado ? "is-archived" : "",
        lead.lixeira ? "is-trash" : ""
    ].filter(Boolean).join(" ");

    return `
        <tr data-open-lead="${escapeHTML(lead.id)}" class="${rowClasses}">
            ${selectable ? `<td class="aura-leads-v5-select-cell"><label class="aura-leads-v5-row-check" title="Selecionar lead">
                <input type="checkbox" data-select-lead="${escapeHTML(lead.id)}" ${state.selectedIds.has(lead.id) ? "checked" : ""}>
                <span>${svg.check}</span>
            </label></td>` : ""}
            <td><div class="aura-leads-v5-person">
                <span class="aura-leads-v5-avatar">${escapeHTML((lead.nome || "L").charAt(0).toUpperCase())}</span>
                <div><strong>${escapeHTML(lead.nome || "Lead sem nome")}${lead._unread ? '<em class="aura-leads-v5-new-label">Novo</em>' : ""}</strong><small>${escapeHTML(contact)}</small></div>
            </div></td>
            <td><div class="aura-leads-v5-score" data-temperature="${lead._temperature}">
                <span>${lead._score}</span><div><strong>${temp.label}</strong><i><b style="width:${lead._score}%"></b></i></div>
            </div></td>
            <td><strong class="aura-leads-v5-origin">${escapeHTML(lead._origin)}</strong><small>${escapeHTML(context)}</small></td>
            <td><span class="aura-leads-v5-status" data-status="${lead._status}">${escapeHTML(STATUS_LABELS[lead._status] || "Novo")}</span></td>
            <td><strong>${lead._value ? formatMoney(lead._value) : "—"}</strong><small>${lead._probability}% de probabilidade</small></td>
            <td><strong>${escapeHTML(responsibleLabel(lead))}</strong><small>${lead.prioridadeLead === "alta" ? "Prioridade alta" : "Operação comercial"}</small></td>
            <td><span class="aura-leads-v5-sla-state ${lead._overdue ? "is-overdue" : ""}">
                ${svg.clock}${followup ? formatRelative(followup) : lead._overdue ? "SLA vencido" : "Sem follow-up"}
            </span><small>${followup ? formatDate(followup) : ""}</small></td>
            <td><strong>${formatRelative(lead._timestamp)}</strong><small>${formatDate(lead._timestamp)}</small></td>
            <td><button type="button" class="aura-leads-v5-row-open" aria-label="Abrir lead">${svg.chevron}</button></td>
        </tr>
    `;
}

function renderPipeline() {
    const leads = applyFilters(state.leads);
    return `${renderMetrics()}
        <section class="aura-leads-v5-section-heading"><div>
            <span>Pipeline comercial</span><h3>Kanban de oportunidades</h3>
            <p>Arraste os cards no computador ou use o seletor dentro de cada card no celular.</p>
        </div></section>
        <section class="aura-leads-v5-pipeline">
            ${PIPELINE_STAGES.map((stage) => {
                const stageLeads = leads
                    .filter((lead) => lead._status === stage.id)
                    .sort((a, b) => a._overdue !== b._overdue ? (a._overdue ? -1 : 1) : b._score - a._score);
                const value = stageLeads.reduce((sum, lead) => sum + lead._value, 0);
                return `<section class="aura-leads-v5-pipeline-column" data-drop-stage="${stage.id}">
                    <header><div><span data-stage="${stage.id}"></span><strong>${stage.label}</strong></div><em>${stageLeads.length}</em></header>
                    <p>${formatMoney(value)}</p>
                    <div class="aura-leads-v5-pipeline-list">
                        ${stageLeads.length
                            ? stageLeads.map(renderPipelineCard).join("")
                            : `<div class="aura-leads-v5-pipeline-empty">Solte uma oportunidade aqui</div>`
                        }
                    </div>
                </section>`;
            }).join("")}
        </section>`;
}

function renderPipelineCard(lead) {
    const followup = anyTimestamp(lead.proximoContatoEm || lead.lembreteTimestamp);
    return `<article class="aura-leads-v5-pipeline-card ${lead._overdue ? "is-overdue" : ""}"
        draggable="${state.canEdit ? "true" : "false"}"
        data-drag-lead="${escapeHTML(lead.id)}" data-open-lead="${escapeHTML(lead.id)}">
        <header>
            <span class="aura-leads-v5-avatar">${escapeHTML((lead.nome || "L").charAt(0).toUpperCase())}</span>
            <div><strong>${escapeHTML(lead.nome || "Lead sem nome")}</strong><small>${escapeHTML(lead.produtoInteresse || "Interesse geral")}</small></div>
            <b>${lead._score}</b>
        </header>
        <div class="aura-leads-v5-pipeline-meta"><span>${escapeHTML(lead._origin)}</span><span>${lead._value ? formatMoney(lead._value) : "Sem valor"}</span></div>
        <div class="aura-leads-v5-pipeline-meta"><span>${escapeHTML(responsibleLabel(lead))}</span>
            <span class="${lead._overdue ? "is-danger" : ""}">${followup ? formatRelative(followup) : "Sem follow-up"}</span>
        </div>
        <select data-pipeline-move="${escapeHTML(lead.id)}" aria-label="Mover etapa" ${state.canEdit ? "" : "disabled"}>
            ${PIPELINE_STAGES.map((stage) => `<option value="${stage.id}" ${lead._status === stage.id ? "selected" : ""}>${stage.label}</option>`).join("")}
        </select>
    </article>`;
}

function startOfToday() {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date.getTime();
}

function renderAgenda() {
    const now = Date.now();
    const todayStart = startOfToday();
    const tomorrowStart = todayStart + 86400000;
    const nextWeek = todayStart + 7 * 86400000;

    const scheduled = activeLeads()
        .filter((lead) => anyTimestamp(lead.proximoContatoEm || lead.lembreteTimestamp))
        .sort((a, b) =>
            anyTimestamp(a.proximoContatoEm || a.lembreteTimestamp) -
            anyTimestamp(b.proximoContatoEm || b.lembreteTimestamp)
        );

    const groups = [
        { id: "overdue", label: "Vencidos", description: "Exigem contato imediato",
          leads: scheduled.filter((lead) => anyTimestamp(lead.proximoContatoEm || lead.lembreteTimestamp) < now) },
        { id: "today", label: "Hoje", description: "Compromissos do dia",
          leads: scheduled.filter((lead) => {
              const value = anyTimestamp(lead.proximoContatoEm || lead.lembreteTimestamp);
              return value >= now && value < tomorrowStart;
          }) },
        { id: "week", label: "Próximos 7 dias", description: "Planejamento de follow-up",
          leads: scheduled.filter((lead) => {
              const value = anyTimestamp(lead.proximoContatoEm || lead.lembreteTimestamp);
              return value >= tomorrowStart && value < nextWeek;
          }) },
        { id: "later", label: "Mais adiante", description: "Agenda futura",
          leads: scheduled.filter((lead) => anyTimestamp(lead.proximoContatoEm || lead.lembreteTimestamp) >= nextWeek) }
    ];

    const withoutDate = activeLeads()
        .filter((lead) => !anyTimestamp(lead.proximoContatoEm || lead.lembreteTimestamp))
        .slice(0, 12);

    return `${renderMetrics()}
        <section class="aura-leads-v5-section-heading"><div>
            <span>Agenda comercial</span><h3>Follow-ups e próximos contatos</h3>
            <p>Priorize vencidos, conclua contatos e reprograme oportunidades sem sair da central.</p>
        </div></section>
        <section class="aura-leads-v5-agenda-grid">
            ${groups.map((group) => `<article class="aura-leads-v5-agenda-group" data-group="${group.id}">
                <header><div><span>${group.label}</span><small>${group.description}</small></div><strong>${group.leads.length}</strong></header>
                <div>${group.leads.length ? group.leads.map(renderAgendaCard).join("") : `<p class="aura-leads-v5-agenda-empty">Nenhum follow-up nesta faixa.</p>`}</div>
            </article>`).join("")}
        </section>
        <section class="aura-leads-v5-unscheduled">
            <header><div><span>Sem data definida</span><h3>Oportunidades sem próximo passo</h3></div>
            <strong>${activeLeads().filter((lead) => !anyTimestamp(lead.proximoContatoEm || lead.lembreteTimestamp)).length}</strong></header>
            <div>${withoutDate.length ? withoutDate.map(renderAgendaCard).join("") : `<p class="aura-leads-v5-agenda-empty">Todas as oportunidades abertas possuem agenda.</p>`}</div>
        </section>`;
}

function renderAgendaCard(lead) {
    const followup = anyTimestamp(lead.proximoContatoEm || lead.lembreteTimestamp);
    return `<article class="aura-leads-v5-agenda-card">
        <button type="button" data-open-lead="${escapeHTML(lead.id)}">
            <span class="aura-leads-v5-avatar">${escapeHTML((lead.nome || "L").charAt(0).toUpperCase())}</span>
            <span><strong>${escapeHTML(lead.nome || "Lead sem nome")}</strong><small>${escapeHTML(lead.produtoInteresse || responsibleLabel(lead))}</small></span>
            <em class="${lead._overdue ? "is-danger" : ""}">${followup ? formatDate(followup) : "Sem data"}</em>
        </button>
        ${state.canEdit ? `<footer>
            <button type="button" data-agenda-action="done" data-lead-id="${escapeHTML(lead.id)}">Concluir</button>
            <button type="button" data-agenda-action="snooze1" data-lead-id="${escapeHTML(lead.id)}">+1 dia</button>
            <button type="button" data-agenda-action="snooze3" data-lead-id="${escapeHTML(lead.id)}">+3 dias</button>
        </footer>` : ""}
    </article>`;
}

function renderGroupsView(type) {
    const groups = type === "forms" ? state.formGroups : state.sourceGroups;
    const title = type === "forms" ? "Desempenho dos formulários" : "Desempenho das origens";
    const description = type === "forms"
        ? "Compare volume, qualidade, valor e conversão de cada ponto de captura."
        : "Identifique quais canais trazem oportunidades melhores e mais receita.";

    return `${renderMetrics()}
        <section class="aura-leads-v5-section-heading"><div>
            <span>${type === "forms" ? "Captura" : "Aquisição"}</span><h3>${title}</h3><p>${description}</p>
        </div></section>
        <section class="aura-leads-v5-group-grid">
            ${groups.length ? groups.map((group, index) => renderGroupCard(group, index, type)).join("") :
                `<div class="aura-leads-v5-empty aura-leads-v5-empty-grid">${type === "forms" ? svg.form : svg.source}
                    <h3>Sem dados suficientes</h3><p>As próximas capturas aparecerão agrupadas aqui.</p>
                </div>`}
        </section>`;
}

function renderGroupCard(group, index, type) {
    const conversion = group.total ? Math.round((group.converted / group.total) * 1000) / 10 : 0;
    return `<article class="aura-leads-v5-group-card">
        <header><span>${type === "forms" ? svg.form : svg.source}</span><div>
            <small>${type === "forms" ? "Formulário" : "Origem"}</small><h4>${escapeHTML(group.name)}</h4>
        </div></header>
        <div class="aura-leads-v5-group-stats">
            <div><span>Leads</span><strong>${group.total}</strong></div>
            <div><span>Score médio</span><strong>${group.averageScore}</strong></div>
            <div><span>Quentes</span><strong>${group.hot}</strong></div>
            <div><span>Conversão</span><strong>${conversion}%</strong></div>
        </div>
        <p class="aura-leads-v5-group-value">${formatMoney(group.value)}</p>
        <div class="aura-leads-v5-group-progress"><span style="width:${Math.max(3, group.averageScore)}%"></span></div>
        <button type="button" data-group-index="${index}" data-group-type="${type}">Ver ${group.total} lead(s)${svg.chevron}</button>
    </article>`;
}

function aggregateBy(leads, resolver) {
    const map = new Map();
    leads.forEach((lead) => {
        const key = resolver(lead) || "Não informado";
        if (!map.has(key)) map.set(key, { name: key, total: 0, converted: 0, value: 0, forecast: 0 });
        const item = map.get(key);
        item.total += 1;
        if (lead._status === "convertido") item.converted += 1;
        item.value += lead._value;
        item.forecast += lead._forecast;
    });

    return Array.from(map.values())
        .map((item) => ({
            ...item,
            conversion: item.total ? Math.round(item.converted / item.total * 1000) / 10 : 0
        }))
        .sort((a, b) => b.total - a.total);
}

function renderReportTable(title, rows) {
    return `<article class="aura-leads-v5-report-card">
        <header><h4>${escapeHTML(title)}</h4><span>${rows.length} grupo(s)</span></header>
        <div class="aura-leads-v5-report-table">
            <div class="is-head"><span>Nome</span><span>Leads</span><span>Conversão</span><span>Valor</span></div>
            ${rows.slice(0, 10).map((row) => `<div>
                <strong>${escapeHTML(row.name)}</strong><span>${row.total}</span><span>${row.conversion}%</span><span>${formatMoney(row.value)}</span>
            </div>`).join("") || `<p class="aura-leads-v5-agenda-empty">Sem dados.</p>`}
        </div>
    </article>`;
}

function renderReports() {
    const total = state.leads.length;
    const won = state.leads.filter((lead) => lead._status === "convertido");
    const lost = state.leads.filter((lead) => lead._status === "perdido");
    const revenue = won.reduce((sum, lead) => sum + lead._value, 0);
    const averageTicket = won.length ? revenue / won.length : 0;
    const forecast = activeLeads().reduce((sum, lead) => sum + lead._forecast, 0);
    const origins = aggregateBy(state.leads, (lead) => lead._origin);
    const campaigns = aggregateBy(
        state.leads.filter((lead) => lead._campaign !== "Sem campanha"),
        (lead) => lead._campaign
    );
    const responsibles = aggregateBy(state.leads, (lead) => responsibleLabel(lead));
    const standardized = state.leads.filter((lead) => lead._qualityComplete).length;
    const legacy = total - standardized;
    const quality = total ? Math.round((standardized / total) * 100) : 100;
    const maxStage = Math.max(1, ...PIPELINE_STAGES.map((stage) =>
        state.leads.filter((lead) => lead._status === stage.id).length
    ));

    return `${renderMetrics()}
        <section class="aura-leads-v5-section-heading"><div>
            <span>Inteligência comercial</span><h3>Relatório executivo do pipeline</h3>
            <p>Volume, conversão, previsão, ticket e desempenho por canal e responsável.</p>
        </div></section>
        <section class="aura-leads-v5-report-summary">
            <article><span>Conversão</span><strong>${total ? Math.round(won.length / total * 1000) / 10 : 0}%</strong></article>
            <article><span>Ticket médio</span><strong>${formatMoney(averageTicket)}</strong></article>
            <article><span>Previsão aberta</span><strong>${formatMoney(forecast)}</strong></article>
            <article><span>Perdidos</span><strong>${lost.length}</strong></article>
        </section>
        <section class="aura-leads-v6-quality-card">
            <div>
                <span>Qualidade da captura</span>
                <h4>${quality}% da base padronizada</h4>
                <p>${standardized} lead(s) no schema V${LEAD_SCHEMA_VERSION} · ${legacy} registro(s) legado(s) ou incompleto(s).</p>
            </div>
            <div class="aura-leads-v6-quality-progress"><span style="width:${quality}%"></span></div>
            ${state.canEdit && legacy ? `<button type="button" class="aura-leads-v5-secondary" data-action="normalize-base">Padronizar base antiga</button>` : ""}
        </section>
        <section class="aura-leads-v5-funnel">
            <header><h4>Funil por etapa</h4><span>${total} lead(s)</span></header>
            ${PIPELINE_STAGES.map((stage) => {
                const leads = state.leads.filter((lead) => lead._status === stage.id);
                const value = leads.reduce((sum, lead) => sum + lead._value, 0);
                const width = Math.max(leads.length ? 6 : 0, Math.round(leads.length / maxStage * 100));
                return `<div class="aura-leads-v5-funnel-row">
                    <span>${stage.label}</span><i><b data-stage="${stage.id}" style="width:${width}%"></b></i>
                    <strong>${leads.length}</strong><em>${formatMoney(value)}</em>
                </div>`;
            }).join("")}
        </section>
        <section class="aura-leads-v5-report-grid">
            ${renderReportTable("Origens", origins)}
            ${renderReportTable("Campanhas", campaigns)}
            ${renderReportTable("Responsáveis", responsibles)}
        </section>`;
}

function renderDuplicates() {
    return `${renderMetrics()}
        <section class="aura-leads-v5-section-heading"><div>
            <span>Qualidade da base</span><h3>Possíveis duplicidades</h3>
            <p>A mesclagem mantém o registro mais recente, preserva campos úteis e arquiva os demais.</p>
        </div></section>
        <section class="aura-leads-v5-duplicate-list">
            ${state.duplicateGroups.length ? state.duplicateGroups.map((group, index) => `
                <article class="aura-leads-v5-duplicate-card">
                    <header><div>${svg.duplicate}<span><small>Correspondência</small>
                        <strong>${escapeHTML(group.key.replace("phone:", "WhatsApp: ").replace("email:", "E-mail: "))}</strong>
                    </span></div><span class="aura-leads-v5-count">${group.total} registros</span></header>
                    <div class="aura-leads-v5-duplicate-people">
                        ${group.leads.map((lead, leadIndex) => `<button type="button" data-open-lead="${escapeHTML(lead.id)}" class="${leadIndex === 0 ? "is-primary" : ""}">
                            <span class="aura-leads-v5-avatar">${escapeHTML((lead.nome || "L").charAt(0).toUpperCase())}</span>
                            <span><strong>${escapeHTML(lead.nome || "Lead sem nome")}</strong><small>${formatDate(lead._timestamp)} · score ${lead._score}</small></span>
                            ${leadIndex === 0 ? "<em>Principal</em>" : ""}
                        </button>`).join("")}
                    </div>
                    <footer><span>Campos complementares e histórico serão preservados quando possível.</span>
                        <button type="button" class="aura-leads-v5-primary" data-merge-group="${index}" ${state.canEdit ? "" : "disabled"}>
                            ${svg.merge} Mesclar grupo
                        </button>
                    </footer>
                </article>`).join("") :
                `<div class="aura-leads-v5-empty">${svg.duplicate}<h3>Nenhuma duplicidade detectada</h3><p>Sua base está organizada pelos dados atuais.</p></div>`}
        </section>`;
}

function automationToggle(key, title, description, localOnly = false) {
    const disabled = !localOnly && !state.canEdit ? "disabled" : "";
    return `<label class="aura-leads-v5-automation-rule">
        <span><strong>${escapeHTML(title)}</strong><small>${escapeHTML(description)}</small></span>
        <input type="checkbox" data-automation-key="${escapeHTML(key)}"
            ${state.automation[key] ? "checked" : ""} ${disabled}><i></i>
    </label>`;
}

function renderAutomations() {
    const incomplete = state.allLeads.filter((lead) => !lead._qualityComplete).length;
    return `${renderMetrics()}
        <section class="aura-leads-v5-section-heading"><div>
            <span>Regras seguras</span><h3>Automações comerciais</h3>
            <p>As regras apenas organizam prioridade e probabilidade. Nenhuma mensagem é enviada automaticamente.</p>
        </div></section>
        <section class="aura-leads-v5-automation-panel">
            <div class="aura-leads-v5-automation-list">
                ${automationToggle("hotPriority", "Priorizar leads quentes", "Marca como prioridade alta quando o score chega a 75.")}
                ${automationToggle("overduePriority", "Priorizar follow-ups vencidos", "Eleva a prioridade de oportunidades com contato atrasado.")}
                ${automationToggle("stageProbability", "Sincronizar probabilidade com a etapa", "Convertidos ficam em 100% e perdidos em 0%.")}
                ${automationToggle("runOnRefresh", "Executar ao atualizar", "Aplica as regras habilitadas quando a base é recarregada.")}
                ${automationToggle("newLeadSound", "Som para novo lead", "Emite um aviso curto quando uma nova captura chegar com o painel aberto.", true)}
            </div>
            <aside>${svg.automation}<h4>Execução controlada</h4>
                <p>As regras não criam contatos, não alteram valores e não disparam WhatsApp.</p>
                <button type="button" class="aura-leads-v5-primary" data-action="run-automations"
                    ${state.canEdit && !state.automationRunning ? "" : "disabled"}>
                    ${state.automationRunning ? "Executando..." : "Executar agora"}
                </button>
                <div class="aura-leads-v6-schema-action">
                    <strong>Schema V${LEAD_SCHEMA_VERSION}</strong>
                    <span>${incomplete} registro(s) ainda precisam de padronização.</span>
                    <button type="button" class="aura-leads-v5-secondary" data-action="normalize-base"
                        ${state.canEdit && incomplete && !state.schemaMigrationRunning ? "" : "disabled"}>
                        ${state.schemaMigrationRunning ? "Padronizando..." : "Padronizar base antiga"}
                    </button>
                </div>
            </aside>
        </section>`;
}

function openLead(leadId) {
    const lead = findLead(leadId);
    const workspace = document.getElementById("aura-leads-v5-modal");
    const host = document.getElementById("aura-leads-v5-detail");
    const main = workspace?.querySelector(".aura-leads-v5-main");

    if (!lead || !workspace || !host) return;

    state.selectedLeadId = leadId;
    markLeadViewed(lead);
    host.hidden = false;
    main?.setAttribute("aria-hidden", "true");
    workspace.classList.add("is-detail-open");
    renderDetail(leadId);

    document.querySelectorAll("[data-open-lead]").forEach((item) => {
        item.classList.toggle("is-selected", item.dataset.openLead === leadId);
    });

    requestAnimationFrame(() => {
        workspace.scrollIntoView({ block: "start" });
        host.querySelector("[data-detail-action='close']")
            ?.focus({ preventScroll: true });
    });
}

async function markLeadViewed(lead) {
    if (!lead?._unread) return;
    const viewedAt = Date.now();
    lead.visualizadoEm = viewedAt;
    Object.assign(lead, normalizeLead(lead));
    refreshLeadCollections();

    if (state.modalOpen && ["inbox", "priority"].includes(state.activeTab)) {
        refreshInboxResults();
    }

    if (!state.canEdit) return;
    try {
        await setDoc(doc(db, "leads", lead.id), {
            visualizadoEm: viewedAt,
            visualizadoPorUid: state.user?.uid || "",
            visualizadoPorNome: actorName()
        }, { merge: true });
    } catch (error) {
        console.info("[Aura Leads V6] Visualização mantida apenas neste dispositivo.");
    }
}

async function markAllRead() {
    const unread = state.leads.filter((lead) => lead._unread);
    if (!unread.length) return;
    const viewedAt = Date.now();
    saveLastSeen(viewedAt);

    unread.forEach((lead) => {
        lead.visualizadoEm = viewedAt;
        Object.assign(lead, normalizeLead(lead));
    });
    refreshLeadCollections();
    render();

    if (state.canEdit) {
        try {
            await commitLeadPatches(unread.map((lead) => ({
                id: lead.id,
                data: {
                    visualizadoEm: viewedAt,
                    visualizadoPorUid: state.user?.uid || "",
                    visualizadoPorNome: actorName()
                }
            })));
        } catch (error) {
            console.info("[Aura Leads V6] Leitura salva apenas neste dispositivo.");
        }
    }
    toast("Leads marcados como lidos.");
}

async function moveLeadStorage(lead, action) {
    if (!state.canEdit || !lead) {
        toast("Seu acesso é somente para consulta.", "error");
        return;
    }

    let updates = {};
    let event = null;
    if (action === "archive") {
        updates = { arquivado: true, lixeira: false, arquivadoEm: Date.now() };
        event = makeHistoryEvent("archive", "Lead arquivado", "Removido da operação ativa.");
    } else if (action === "trash") {
        updates = { lixeira: true, arquivado: false, movidoLixeiraEm: Date.now() };
        event = makeHistoryEvent("trash", "Lead movido para a lixeira", "Registro disponível para restauração.");
    } else if (action === "restore") {
        updates = { lixeira: false, arquivado: false, restauradoEm: Date.now() };
        event = makeHistoryEvent("restore", "Lead restaurado", "Registro devolvido à operação ativa.");
    } else {
        return;
    }

    const success = await persistLeadUpdates(lead, updates, event);
    if (!success) return;
    closeDetail();
    render();
    toast(action === "archive" ? "Lead arquivado." : action === "trash" ? "Lead movido para a lixeira." : "Lead restaurado.");
}

async function applyBulkAction(action) {
    if (!state.canEdit || state.bulkRunning) return;
    const leads = selectedLeads();
    if (!leads.length) return toast("Selecione pelo menos um lead.", "error");

    if (action === "trash") {
        const confirmed = window.confirm(`Mover ${leads.length} lead(s) para a lixeira?`);
        if (!confirmed) return;
    }

    const bulkValues = {
        stage: document.getElementById("aura-leads-v5-bulk-stage")?.value || "novo",
        responsible: document.getElementById("aura-leads-v5-bulk-responsible")?.value || "",
        priority: document.getElementById("aura-leads-v5-bulk-priority")?.value || "normal"
    };

    state.bulkRunning = true;
    render();
    const timestamp = Date.now();

    try {
        const patches = leads.map((lead) => {
            let updates = {};
            let detail = "";
            let title = "Atualização em massa";

            if (action === "stage") {
                const stage = bulkValues.stage;
                updates = {
                    statusLead: stage,
                    status: stage,
                    pipelineStage: stage,
                    probabilidade: stage === "convertido" ? 100 : stage === "perdido" ? 0 : stageProbability(stage)
                };
                title = "Etapa alterada em massa";
                detail = STATUS_LABELS[stage] || stage;
            } else if (action === "responsible") {
                const uid = bulkValues.responsible;
                const person = state.team.find((item) => item.uid === uid);
                updates = { responsavelUid: uid, responsavelNome: person?.nome || "" };
                title = "Responsável alterado em massa";
                detail = person?.nome || "Sem responsável";
            } else if (action === "priority") {
                const priority = bulkValues.priority;
                updates = { prioridadeLead: priority };
                title = "Prioridade alterada em massa";
                detail = priority;
            } else if (action === "archive") {
                updates = { arquivado: true, lixeira: false, arquivadoEm: timestamp };
                title = "Lead arquivado";
                detail = "Ação em massa";
            } else if (action === "trash") {
                updates = { lixeira: true, arquivado: false, movidoLixeiraEm: timestamp };
                title = "Lead movido para a lixeira";
                detail = "Ação em massa";
            } else if (action === "restore") {
                updates = { lixeira: false, arquivado: false, restauradoEm: timestamp };
                title = "Lead restaurado";
                detail = "Ação em massa";
            }

            updates.atualizadoEm = timestamp;
            updates.historicoLead = historyWithEvent(
                lead,
                makeHistoryEvent("bulk", title, detail)
            );
            Object.assign(lead, updates);
            Object.assign(lead, normalizeLead(lead));
            return { id: lead.id, data: updates };
        });

        await commitLeadPatches(patches);
        state.selectedIds.clear();
        refreshLeadCollections();
        state.bulkRunning = false;
        render();
        toast(`${patches.length} lead(s) atualizados.`);
    } catch (error) {
        state.bulkRunning = false;
        console.error("[Aura Leads V6] Falha na ação em massa:", error);
        render();
        toast("Não foi possível concluir a ação em massa.", "error");
    }
}

function historyEntries(lead) {
    const entries = [...lead._history].sort((a, b) =>
        anyTimestamp(b.timestamp) - anyTimestamp(a.timestamp)
    );

    if (!entries.length) {
        entries.push({
            tipo: "captura",
            titulo: "Lead capturado",
            detalhe: `${lead._origin} · ${lead.produtoInteresse || "Interesse geral"}`,
            timestamp: lead._timestamp,
            autorNome: "Sistema"
        });
    }

    return entries;
}

function renderHistory(lead) {
    return `<section class="aura-leads-v5-history">
        <header>${svg.history}<div><h4>Histórico do lead</h4><span>${historyEntries(lead).length} evento(s)</span></div></header>
        <div>${historyEntries(lead).map((entry) => `<article>
            <i data-type="${escapeHTML(entry.tipo || "update")}"></i>
            <div><strong>${escapeHTML(entry.titulo || "Atualização")}</strong>
                <p>${escapeHTML(entry.detalhe || "")}</p>
                <span>${formatDate(entry.timestamp)} · ${escapeHTML(entry.autorNome || "Equipe")}</span>
            </div>
        </article>`).join("")}</div>
    </section>`;
}

function buildWhatsappMessage(lead, templateKey) {
    const template = WHATSAPP_TEMPLATES[templateKey] || WHATSAPP_TEMPLATES.saudacao;
    return template.text
        .replaceAll("{nome}", lead.nome || "tudo bem")
        .replaceAll("{produto}", lead.produtoInteresse || "nosso produto");
}

function renderDetail(leadId) {
    const host = document.getElementById("aura-leads-v5-detail");
    const lead = findLead(leadId);
    if (!host || !lead) return;

    const temp = TEMPERATURES[lead._temperature] || TEMPERATURES.cold;
    const phone = lead._phone;
    const stored = Boolean(lead.arquivado || lead.lixeira);
    const readOnly = state.canEdit && !stored ? "" : "disabled";
    const defaultTemplate = lead._status === "proposta"
        ? "fechamento"
        : lead._status === "em_contato" ? "followup" : "saudacao";
    const leadStateLabel = lead.lixeira
        ? "Lead na lixeira"
        : lead.arquivado
            ? "Lead arquivado"
            : lead._unread
                ? "Novo lead"
                : "Oportunidade ativa";

    host.hidden = false;
    host.innerHTML = `
        <header class="aura-leads-v6-detail-topbar">
            <button type="button" class="aura-leads-v5-detail-close aura-leads-v6-detail-back" data-detail-action="close">
                ${svg.chevron}<span>Voltar para Leads</span>
            </button>
            <div class="aura-leads-v6-breadcrumb">
                <span>Central comercial / Detalhes</span>
                <strong>${escapeHTML(lead.nome || "Lead sem nome")}</strong>
            </div>
            <span class="aura-leads-v5-status" data-status="${lead._status}">${escapeHTML(STATUS_LABELS[lead._status] || "Novo")}</span>
        </header>

        <section class="aura-leads-v6-detail-hero">
            <div class="aura-leads-v5-person">
                <span class="aura-leads-v5-avatar aura-leads-v5-avatar-large">${escapeHTML((lead.nome || "L").charAt(0).toUpperCase())}</span>
                <div>
                    <small>${escapeHTML(leadStateLabel)}</small>
                    <h3>${escapeHTML(lead.nome || "Lead sem nome")}</h3>
                    <p>${escapeHTML(lead.whatsapp || lead.telefone || lead.email || "Sem contato informado")}</p>
                </div>
            </div>
            <div class="aura-leads-v5-score aura-leads-v5-score-large" data-temperature="${lead._temperature}">
                <span>${lead._score}</span><div><strong>${temp.label}</strong><small>Lead score</small></div>
            </div>
            <div class="aura-leads-v6-detail-summary">
                <article><span>Origem</span><strong>${escapeHTML(lead._origin)}</strong></article>
                <article><span>Campanha</span><strong>${escapeHTML(lead._campaign)}</strong></article>
                <article><span>Oportunidade</span><strong>${lead._value ? formatMoney(lead._value) : "Sem valor"}</strong></article>
                <article><span>Responsável</span><strong>${escapeHTML(responsibleLabel(lead))}</strong></article>
            </div>
        </section>

        <div class="aura-leads-v6-detail-workspace">
            <div class="aura-leads-v6-detail-primary">
                <div class="aura-leads-v5-detail-actions">
                    ${phone ? `<button type="button" class="aura-leads-v5-whatsapp" data-detail-action="whatsapp">${svg.whatsapp} Abrir WhatsApp</button>` : ""}
                    <button type="button" class="aura-leads-v5-secondary" data-detail-action="contacted" ${readOnly}>${svg.clock} Registrar contato</button>
                </div>

                <section class="aura-leads-v6-panel">
                    <header><span>Gestão comercial</span><h4>Dados e próximos passos</h4></header>
                    <div class="aura-leads-v5-detail-grid">
                        <label><span>Etapa do pipeline</span><select id="aura-leads-v5-detail-status" ${readOnly}>
                            ${PIPELINE_STAGES.map((stage) => `<option value="${stage.id}" ${lead._status === stage.id ? "selected" : ""}>${stage.label}</option>`).join("")}
                        </select></label>
                        <label><span>Prioridade</span><select id="aura-leads-v5-detail-priority" ${readOnly}>
                            <option value="baixa" ${lead.prioridadeLead === "baixa" ? "selected" : ""}>Baixa</option>
                            <option value="normal" ${!lead.prioridadeLead || lead.prioridadeLead === "normal" ? "selected" : ""}>Normal</option>
                            <option value="alta" ${lead.prioridadeLead === "alta" ? "selected" : ""}>Alta</option>
                        </select></label>
                        <label><span>Próximo contato</span><input id="aura-leads-v5-detail-followup" type="datetime-local"
                            value="${timestampToLocalInput(lead.proximoContatoEm || lead.lembreteTimestamp)}" ${readOnly}></label>
                        <label><span>Responsável</span><select id="aura-leads-v5-detail-responsible" ${readOnly}>
                            ${renderTeamOptions(lead._responsibleUid)}
                        </select></label>
                        <label><span>Valor da oportunidade</span><input id="aura-leads-v5-detail-value" type="number" min="0" step="0.01"
                            value="${lead._value || ""}" placeholder="0,00" ${readOnly}></label>
                        <label><span>Probabilidade (%)</span><input id="aura-leads-v5-detail-probability" type="number" min="0" max="100" step="1"
                            value="${lead._probability}" ${readOnly}></label>
                        <label><span>Fechamento previsto</span><input id="aura-leads-v5-detail-close-date" type="date"
                            value="${localDateInput(lead.dataFechamentoPrevista)}" ${readOnly}></label>
                        <label><span>Etiqueta</span><input id="aura-leads-v5-detail-tag" type="text"
                            value="${escapeHTML(lead.etiqueta || "")}" placeholder="Ex.: orçamento enviado" ${readOnly}></label>
                    </div>

                    <label class="aura-leads-v5-detail-note"><span>Anotação comercial</span>
                        <textarea id="aura-leads-v5-detail-note" rows="5"
                            placeholder="Contexto, objeções e próximos passos." ${readOnly}>${escapeHTML(lead.anotacao || "")}</textarea>
                    </label>
                </section>

                ${phone ? `<section class="aura-leads-v5-message-builder aura-leads-v6-panel">
                    <header>${svg.whatsapp}<div><h4>Mensagem de WhatsApp</h4><span>Escolha um modelo e ajuste antes de abrir.</span></div></header>
                    <select id="aura-leads-v5-message-template">
                        ${Object.entries(WHATSAPP_TEMPLATES).map(([key, template]) => `<option value="${key}" ${key === defaultTemplate ? "selected" : ""}>${escapeHTML(template.label)}</option>`).join("")}
                    </select>
                    <textarea id="aura-leads-v5-message-text" rows="5">${escapeHTML(buildWhatsappMessage(lead, defaultTemplate))}</textarea>
                    <button type="button" class="aura-leads-v5-whatsapp" data-detail-action="whatsapp-message">${svg.whatsapp} Abrir com esta mensagem</button>
                </section>` : ""}
            </div>

            <aside class="aura-leads-v6-detail-secondary">
                <section class="aura-leads-v5-context aura-leads-v6-panel"><h4>Contexto da captura</h4><dl>
                    <div><dt>Origem</dt><dd>${escapeHTML(lead._origin)}</dd></div>
                    <div><dt>Campanha</dt><dd>${escapeHTML(lead._campaign)}</dd></div>
                    <div><dt>Meio</dt><dd>${escapeHTML(lead._medium || "Não informado")}</dd></div>
                    <div><dt>Interesse</dt><dd>${escapeHTML(lead.produtoInteresse || "Não informado")}</dd></div>
                    <div><dt>Página</dt><dd>${escapeHTML(lead.paginaOrigem || lead.urlPagina || "Não informada")}</dd></div>
                    <div><dt>Formulário</dt><dd>${escapeHTML(lead.formularioNome || lead.formularioId || lead.blocoOrigem || "Captura geral")}</dd></div>
                    <div><dt>Capturado</dt><dd>${formatDate(lead._timestamp)}</dd></div>
                    <div><dt>Previsão</dt><dd>${formatMoney(lead._forecast)}</dd></div>
                    <div><dt>Schema</dt><dd>V${lead._schemaVersion}</dd></div>
                    <div><dt>Qualidade</dt><dd>${lead._qualityComplete ? "Completa" : `${lead._missingFields.length} campo(s) pendente(s)`}</dd></div>
                    <div><dt>Tipo de captura</dt><dd>${escapeHTML(lead._captureType)}</dd></div>
                    <div><dt>ID do formulário</dt><dd>${escapeHTML(lead._formId)}</dd></div>
                </dl>
                ${!lead._qualityComplete ? `<div class="aura-leads-v6-quality-warning"><strong>Captura legada</strong><span>Alguns campos serão completados sem alterar nome, contato, status ou histórico.</span>${state.canEdit ? `<button type="button" data-detail-action="normalize">Padronizar este lead</button>` : ""}</div>` : ""}
                </section>

                ${renderHistory(lead)}
            </aside>
        </div>

        <footer class="aura-leads-v5-detail-footer aura-leads-v6-detail-footer">
            <span>${state.canEdit ? (lead.lixeira ? "Registro disponível para restauração" : lead.arquivado ? "Registro fora da operação ativa" : lead._overdue ? "Follow-up ou SLA vencido" : `Etapa atual: ${STATUS_LABELS[lead._status]}`) : "Acesso somente para consulta"}</span>
            <div class="aura-leads-v5-detail-footer-actions">
                ${state.canEdit && lead.lixeira ? `<button type="button" class="aura-leads-v5-secondary is-restore" data-detail-action="restore">${svg.restore} Restaurar</button>` : ""}
                ${state.canEdit && lead.arquivado ? `<button type="button" class="aura-leads-v5-secondary is-restore" data-detail-action="restore">${svg.restore} Restaurar</button><button type="button" class="aura-leads-v5-secondary is-danger" data-detail-action="trash">${svg.trash} Lixeira</button>` : ""}
                ${state.canEdit && !stored ? `<button type="button" class="aura-leads-v5-secondary" data-detail-action="archive">${svg.archive} Arquivar</button><button type="button" class="aura-leads-v5-secondary is-danger" data-detail-action="trash">${svg.trash} Lixeira</button><button type="button" class="aura-leads-v5-primary" data-detail-action="save">${svg.save} Salvar alterações</button>` : ""}
            </div>
        </footer>
    `;
}

function makeHistoryEvent(type, title, detail = "") {
    return {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        tipo: String(type || "update").slice(0, 40),
        titulo: String(title || "Atualização").slice(0, 140),
        detalhe: String(detail || "").slice(0, 300),
        timestamp: Date.now(),
        autorUid: state.user?.uid || "",
        autorNome: actorName().slice(0, 120)
    };
}

function historyWithEvent(lead, event) {
    return [
        ...(Array.isArray(lead.historicoLead) ? lead.historicoLead : lead._history || []),
        event
    ].slice(-MAX_HISTORY);
}

async function persistLeadUpdates(lead, updates, event) {
    if (!state.canEdit) {
        toast("Seu acesso é somente para consulta.", "error");
        return false;
    }
    if (!lead || String(lead.criadoPor || "") !== state.ownerUid) {
        console.error("[Aura Leads V6.2] Atualização bloqueada por divergência de tenant.");
        toast("Este registro não pertence à loja atual.", "error");
        return false;
    }

    const payload = { ...updates, atualizadoEm: Date.now() };
    if (event) payload.historicoLead = historyWithEvent(lead, event);

    try {
        await setDoc(doc(db, "leads", lead.id), payload, { merge: true });
        Object.assign(lead, payload);
        Object.assign(lead, normalizeLead(lead));
        refreshLeadCollections();
        return true;
    } catch (error) {
        console.error("[Aura Leads V6] Falha ao atualizar lead:", error);
        toast("Não foi possível atualizar o lead.", "error");
        return false;
    }
}

async function saveLeadDetail() {
    const lead = findLead(state.selectedLeadId);
    if (!lead) return;

    const status = document.getElementById("aura-leads-v5-detail-status")?.value || "novo";
    const priority = document.getElementById("aura-leads-v5-detail-priority")?.value || "normal";
    const followupRaw = document.getElementById("aura-leads-v5-detail-followup")?.value || "";
    const responsibleUid = document.getElementById("aura-leads-v5-detail-responsible")?.value || "";
    const value = Math.max(0, numericValue(document.getElementById("aura-leads-v5-detail-value")?.value));
    let probability = Math.max(0, Math.min(100, Number(document.getElementById("aura-leads-v5-detail-probability")?.value) || 0));
    const closeDateRaw = document.getElementById("aura-leads-v5-detail-close-date")?.value || "";
    const tag = document.getElementById("aura-leads-v5-detail-tag")?.value.trim() || "";
    const note = document.getElementById("aura-leads-v5-detail-note")?.value.trim() || "";

    if (status === "convertido") probability = 100;
    if (status === "perdido") probability = 0;

    const responsible = state.team.find((person) => person.uid === responsibleUid);
    const followup = followupRaw ? new Date(followupRaw).getTime() : null;
    const closeDate = closeDateRaw ? new Date(`${closeDateRaw}T12:00:00`).getTime() : null;

    const updates = {
        statusLead: status,
        status,
        pipelineStage: status,
        prioridadeLead: priority,
        proximoContatoEm: followup,
        responsavelUid: responsibleUid,
        responsavelNome: responsible?.nome || (responsibleUid === lead._responsibleUid ? lead._responsibleName : ""),
        valorOportunidade: value,
        probabilidade: probability,
        dataFechamentoPrevista: closeDate,
        etiqueta: tag,
        anotacao: note
    };

    const detail = [
        STATUS_LABELS[status] || status,
        value ? formatMoney(value) : "",
        responsible?.nome || ""
    ].filter(Boolean).join(" · ");

    const success = await persistLeadUpdates(
        lead, updates,
        makeHistoryEvent("update", "Informações comerciais atualizadas", detail)
    );

    if (!success) return;
    render();
    openLead(lead.id);
    toast("Lead atualizado.");
}

async function registerContact(leadId = state.selectedLeadId) {
    const lead = findLead(leadId);
    if (!lead) return;

    const nextStatus = lead._status === "novo" ? "em_contato" : lead._status;
    const success = await persistLeadUpdates(
        lead,
        {
            ultimoContatoEm: Date.now(),
            statusLead: nextStatus,
            status: nextStatus,
            pipelineStage: nextStatus
        },
        makeHistoryEvent("contact", "Contato registrado", "Interação comercial registrada pela equipe.")
    );

    if (!success) return;
    render();
    openLead(lead.id);
    toast("Contato registrado.");
}

async function moveLeadToStage(leadId, stage) {
    const lead = findLead(leadId);
    if (!lead || !PIPELINE_STAGES.some((item) => item.id === stage) || lead._status === stage) return;

    const probability = stage === "convertido"
        ? 100
        : stage === "perdido"
            ? 0
            : lead.probabilidade === undefined ? stageProbability(stage) : lead._probability;

    const success = await persistLeadUpdates(
        lead,
        { statusLead: stage, status: stage, pipelineStage: stage, probabilidade: probability },
        makeHistoryEvent("pipeline", "Etapa do pipeline alterada",
            `${STATUS_LABELS[lead._status]} → ${STATUS_LABELS[stage]}`)
    );

    if (!success) return;
    render();
    if (state.selectedLeadId === lead.id) renderDetail(lead.id);
    toast(`Lead movido para ${STATUS_LABELS[stage]}.`);
}

async function updateAgenda(leadId, action) {
    const lead = findLead(leadId);
    if (!lead) return;

    if (action === "done") {
        const nextStatus = lead._status === "novo" ? "em_contato" : lead._status;
        const success = await persistLeadUpdates(
            lead,
            {
                ultimoContatoEm: Date.now(),
                proximoContatoEm: null,
                statusLead: nextStatus,
                status: nextStatus,
                pipelineStage: nextStatus
            },
            makeHistoryEvent("followup", "Follow-up concluído", "Contato concluído e removido da agenda.")
        );
        if (success) {
            render();
            toast("Follow-up concluído.");
        }
        return;
    }

    const days = action === "snooze3" ? 3 : 1;
    const base = Math.max(Date.now(), anyTimestamp(lead.proximoContatoEm || lead.lembreteTimestamp));
    const next = base + days * 86400000;
    const success = await persistLeadUpdates(
        lead,
        { proximoContatoEm: next },
        makeHistoryEvent("followup", "Follow-up reagendado", `Novo contato: ${formatDate(next)}`)
    );
    if (success) {
        render();
        toast(`Follow-up adiado por ${days} dia(s).`);
    }
}

async function normalizeSingleLead(lead) {
    if (!state.canEdit || !lead) return false;
    const patch = standardLeadPatch(lead);
    if (!Object.keys(patch).length) {
        toast("Este lead já está padronizado.");
        return true;
    }

    patch.padronizadoEm = Date.now();
    patch.padronizadoPorUid = state.user?.uid || "";
    const success = await persistLeadUpdates(
        lead,
        patch,
        makeHistoryEvent("schema", `Lead padronizado no schema V${LEAD_SCHEMA_VERSION}`, "Campos de captura legados foram completados.")
    );

    if (success) {
        render();
        if (state.selectedLeadId === lead.id) renderDetail(lead.id);
        toast("Lead padronizado.");
    }
    return success;
}

async function normalizeStoredLeads() {
    if (!state.canEdit || state.schemaMigrationRunning) return;
    const candidates = state.allLeads.filter((lead) => (
        lead._tenantValid && Object.keys(standardLeadPatch(lead)).length
    ));

    if (!candidates.length) {
        toast("Toda a base já está padronizada.");
        return;
    }

    const confirmed = window.confirm(
        `Padronizar ${candidates.length} lead(s) antigos? Os dados comerciais existentes serão preservados.`
    );
    if (!confirmed) return;

    state.schemaMigrationRunning = true;
    render();
    const timestamp = Date.now();

    try {
        const patches = candidates.map((lead) => {
            const patch = {
                ...standardLeadPatch(lead),
                padronizadoEm: timestamp,
                padronizadoPorUid: state.user?.uid || ""
            };
            patch.historicoLead = historyWithEvent(
                lead,
                makeHistoryEvent("schema", `Lead padronizado no schema V${LEAD_SCHEMA_VERSION}`, "Campos de captura legados foram completados em lote.")
            );
            return { id: lead.id, data: patch };
        });

        await commitLeadPatches(patches);
        candidates.forEach((lead) => {
            const patch = patches.find((item) => item.id === lead.id)?.data || {};
            Object.assign(lead, patch);
            Object.assign(lead, normalizeLead(lead));
        });
        refreshLeadCollections();
        state.schemaMigrationRunning = false;
        render();
        toast(`${candidates.length} lead(s) padronizados.`);
    } catch (error) {
        state.schemaMigrationRunning = false;
        console.error("[Aura Leads V6.2] Falha ao padronizar base:", error);
        render();
        toast("Não foi possível padronizar toda a base.", "error");
    }
}

function openWhatsapp(lead, message = "") {
    if (!lead?._phone) {
        toast("Este lead não possui WhatsApp válido.", "error");
        return;
    }

    const url = `https://wa.me/${lead._phone}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
    window.open(url, "_blank", "noopener,noreferrer");

    if (state.canEdit) {
        persistLeadUpdates(
            lead, {},
            makeHistoryEvent("whatsapp", "WhatsApp aberto",
                message ? "Mensagem preparada pela central." : "Conversa aberta sem modelo.")
        ).then(() => {
            if (state.selectedLeadId === lead.id) renderDetail(lead.id);
        });
    }
}

async function commitLeadPatches(patches) {
    const safePatches = patches.filter((patch) => {
        const lead = findLead(patch.id);
        return lead && String(lead.criadoPor || "") === state.ownerUid;
    });

    for (let index = 0; index < safePatches.length; index += MAX_BATCH_SIZE) {
        const chunk = safePatches.slice(index, index + MAX_BATCH_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((patch) => {
            batch.set(doc(db, "leads", patch.id), patch.data, { merge: true });
        });
        await batch.commit();
    }
}

async function recalculateAllScores() {
    if (!state.canEdit) return toast("Seu acesso é somente para consulta.", "error");
    if (!state.leads.length) return;

    const button = document.querySelector("[data-action='recalculate']");
    if (button) {
        button.disabled = true;
        button.textContent = "Recalculando...";
    }

    try {
        const timestamp = Date.now();
        const patches = state.leads.map((lead) => {
            const score = computeScore(lead);
            const temperature = temperatureFor(score);
            lead.leadScore = score;
            lead.temperaturaLead = temperature;
            return {
                id: lead.id,
                data: { leadScore: score, temperaturaLead: temperature, scoreAtualizadoEm: timestamp }
            };
        });

        await commitLeadPatches(patches);
        state.allLeads = state.allLeads.map(normalizeLead);
        refreshLeadCollections();
        render();
        toast("Scores recalculados.");
    } catch (error) {
        console.error("[Aura Leads V6] Falha ao recalcular scores:", error);
        toast("Não foi possível recalcular os scores.", "error");
        render();
    }
}

async function runAutomations(options = {}) {
    if (!state.canEdit || state.automationRunning) return 0;
    state.automationRunning = true;
    if (!options.skipRender) render();

    try {
        const patches = [];

        state.leads.forEach((lead) => {
            const updates = {};
            const reasons = [];

            if (state.automation.hotPriority &&
                lead._temperature === "hot" &&
                !["convertido", "perdido"].includes(lead._status) &&
                lead.prioridadeLead !== "alta") {
                updates.prioridadeLead = "alta";
                reasons.push("lead quente");
            }

            if (state.automation.overduePriority &&
                lead._overdue &&
                !["convertido", "perdido"].includes(lead._status) &&
                lead.prioridadeLead !== "alta") {
                updates.prioridadeLead = "alta";
                reasons.push("follow-up vencido");
            }

            if (state.automation.stageProbability) {
                if (lead._status === "convertido" && lead._probability !== 100) {
                    updates.probabilidade = 100;
                    reasons.push("probabilidade ajustada para ganho");
                }
                if (lead._status === "perdido" && lead._probability !== 0) {
                    updates.probabilidade = 0;
                    reasons.push("probabilidade ajustada para perda");
                }
            }

            if (!Object.keys(updates).length) return;

            updates.atualizadoEm = Date.now();
            updates.historicoLead = historyWithEvent(
                lead,
                makeHistoryEvent("automation", "Automação aplicada", reasons.join(" · "))
            );

            patches.push({ id: lead.id, data: updates });
            Object.assign(lead, updates);
            Object.assign(lead, normalizeLead(lead));
        });

        if (patches.length) {
            await commitLeadPatches(patches);
            refreshLeadCollections();
        }

        state.automationRunning = false;
        if (!options.skipRender) render();
        if (!options.silent) {
            toast(patches.length
                ? `${patches.length} lead(s) organizados.`
                : "Nenhuma automação precisava ser aplicada.");
        }
        return patches.length;
    } catch (error) {
        state.automationRunning = false;
        console.error("[Aura Leads V6] Falha nas automações:", error);
        if (!options.skipRender) render();
        if (!options.silent) toast("Não foi possível executar as automações.", "error");
        return 0;
    }
}

async function mergeDuplicateGroup(group) {
    if (!state.canEdit) return toast("Seu acesso é somente para consulta.", "error");
    if (!group?.leads?.length || group.leads.length < 2) return;

    const confirmed = window.confirm(
        `Mesclar ${group.leads.length} registros? O lead mais recente será mantido e os demais serão arquivados.`
    );
    if (!confirmed) return;

    const [primary, ...duplicates] = group.leads;
    const combinedHistory = group.leads
        .flatMap((lead) => Array.isArray(lead.historicoLead) ? lead.historicoLead : lead._history || [])
        .sort((a, b) => anyTimestamp(a.timestamp) - anyTimestamp(b.timestamp))
        .slice(-MAX_HISTORY + 1);

    combinedHistory.push(makeHistoryEvent(
        "merge", "Registros duplicados mesclados",
        `${duplicates.length} registro(s) arquivado(s).`
    ));

    const merged = {
        nome: primary.nome || duplicates.find((lead) => lead.nome)?.nome || "",
        email: primary.email || duplicates.find((lead) => lead.email)?.email || "",
        whatsapp: primary.whatsapp || duplicates.find((lead) => lead.whatsapp)?.whatsapp || "",
        telefone: primary.telefone || duplicates.find((lead) => lead.telefone)?.telefone || "",
        produtoInteresse: primary.produtoInteresse ||
            duplicates.find((lead) => lead.produtoInteresse)?.produtoInteresse || "",
        anotacao: [primary.anotacao, ...duplicates.map((lead) => lead.anotacao)]
            .filter(Boolean).join("\n\n"),
        valorOportunidade: Math.max(...group.leads.map((lead) => lead._value), 0),
        totalSubmissoes: group.leads.reduce(
            (total, lead) => total + Number(lead.totalSubmissoes || lead.submissoes || 1), 0
        ),
        historicoLead: combinedHistory.slice(-MAX_HISTORY),
        mescladoEm: Date.now(),
        idsMesclados: duplicates.map((lead) => lead.id)
    };

    try {
        const batch = writeBatch(db);
        batch.set(doc(db, "leads", primary.id), merged, { merge: true });
        duplicates.forEach((duplicate) => {
            batch.set(doc(db, "leads", duplicate.id), {
                arquivado: true,
                duplicadoDe: primary.id,
                mescladoEm: Date.now()
            }, { merge: true });
        });
        await batch.commit();
        state.selectedLeadId = "";
        loadLeads({ force: true });
        state.activeTab = "duplicates";
        updateActiveTabUI();
        render();
        toast("Duplicidades mescladas.");
    } catch (error) {
        console.error("[Aura Leads V6] Falha ao mesclar duplicidades:", error);
        toast("Não foi possível mesclar os registros.", "error");
    }
}

function exportCSV() {
    let base = state.leads;
    if (state.activeTab === "priority") {
        base = state.leads.filter((lead) =>
            lead._overdue ||
            lead._temperature === "hot" ||
            lead.prioridadeLead === "alta"
        );
    }
    if (state.activeTab === "archived") base = state.archivedLeads;
    if (state.activeTab === "trash") base = state.trashLeads;
    const leads = applyFilters(base);

    if (!leads.length) {
        toast("Não há leads para exportar.", "error");
        return;
    }

    const rows = [[
        "Nome", "WhatsApp", "E-mail", "Origem", "Campanha", "Interesse",
        "Etapa", "Score", "Temperatura", "Prioridade", "Responsável",
        "Valor", "Probabilidade", "Previsão ponderada", "Próximo contato",
        "Fechamento previsto", "SLA vencido", "Página", "Formulário", "Capturado em", "Arquivado", "Lixeira", "Visualizado em"
    ]];

    leads.forEach((lead) => rows.push([
        lead.nome || "",
        lead.whatsapp || lead.telefone || "",
        lead.email || "",
        lead._origin,
        lead._campaign,
        lead.produtoInteresse || "",
        STATUS_LABELS[lead._status] || lead._status,
        lead._score,
        TEMPERATURES[lead._temperature]?.label || lead._temperature,
        lead.prioridadeLead || "normal",
        responsibleLabel(lead),
        lead._value,
        lead._probability,
        lead._forecast,
        formatDate(lead.proximoContatoEm || lead.lembreteTimestamp),
        formatDate(lead.dataFechamentoPrevista, false),
        lead._overdue ? "Sim" : "Não",
        lead.paginaOrigem || lead.urlPagina || "",
        lead.formularioNome || lead.formularioId || lead.blocoOrigem || "",
        formatDate(lead._timestamp),
        lead.arquivado ? "Sim" : "Não",
        lead.lixeira ? "Sim" : "Não",
        formatDate(lead.visualizadoEm)
    ]));

    const csv = rows
        .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(";"))
        .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `aura_leads_v59_${state.activeTab}_${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast("CSV exportado.");
}

function refreshInboxResults() {
    let baseLeads = state.leads;
    if (state.activeTab === "priority") {
        baseLeads = state.leads.filter((lead) =>
            lead._overdue ||
            lead._temperature === "hot" ||
            lead.prioridadeLead === "alta"
        );
    }
    if (state.activeTab === "archived") baseLeads = state.archivedLeads;
    if (state.activeTab === "trash") baseLeads = state.trashLeads;

    state.filtered = applyFilters(baseLeads);
    const content = document.getElementById("aura-leads-v5-content");
    const currentTable = content?.querySelector(
        ".aura-leads-v5-table-wrap, .aura-leads-v5-empty"
    );
    if (!currentTable) {
        render();
        return;
    }

    const tableTemplate = document.createElement("template");
    tableTemplate.innerHTML = renderLeadTable(state.filtered).trim();
    const replacement = tableTemplate.content.firstElementChild;
    if (replacement) currentTable.replaceWith(replacement);

    const currentBulk = content?.querySelector(".aura-leads-v5-bulk");
    const bulkHTML = renderBulkBar(state.filtered).trim();
    if (currentBulk && bulkHTML) {
        const bulkTemplate = document.createElement("template");
        bulkTemplate.innerHTML = bulkHTML;
        currentBulk.replaceWith(bulkTemplate.content.firstElementChild);
    }
}

function handleContentInput(event) {
    if (event.target.id !== "aura-leads-v5-search") {
        return;
    }

    state.search = event.target.value;
    clearTimeout(state.searchTimer);

    state.searchTimer = setTimeout(
        refreshInboxResults,
        120
    );
}

function handleContentChange(event) {
    const target = event.target;

    if (target.matches("[data-select-lead]")) {
        const id = target.dataset.selectLead;
        if (target.checked) state.selectedIds.add(id);
        else state.selectedIds.delete(id);
        refreshInboxResults();
        return;
    }

    const filterMap = {
        "aura-leads-v5-status": "status",
        "aura-leads-v5-temperature": "temperature",
        "aura-leads-v5-origin": "origin",
        "aura-leads-v5-campaign": "campaign",
        "aura-leads-v5-responsible": "responsible"
    };

    if (filterMap[target.id]) {
        state[filterMap[target.id]] = target.value;
        render();
        return;
    }

    if (target.matches("[data-pipeline-move]")) {
        moveLeadToStage(target.dataset.pipelineMove, target.value);
        return;
    }

    if (target.matches("[data-automation-key]")) {
        const key = target.dataset.automationKey;
        if (!(key in state.automation)) return;
        state.automation[key] = Boolean(target.checked);
        state.soundUnlocked = true;
        saveAutomationPreferences();
        toast("Preferência de automação salva.");
    }
}

function handleContentClick(event) {
    if (event.target.closest(".aura-leads-v5-row-check, [data-select-lead], [data-pipeline-move]")) return;

    const bulk = event.target.closest("[data-bulk-action]");
    if (bulk) {
        const action = bulk.dataset.bulkAction;
        if (action === "clear") {
            state.selectedIds.clear();
            render();
            return;
        }
        if (action === "toggle-visible") {
            const visible = state.filtered.length ? state.filtered : applyFilters(currentSelectableCollection());
            const allSelected = visible.length && visible.every((lead) => state.selectedIds.has(lead.id));
            visible.forEach((lead) => {
                if (allSelected) state.selectedIds.delete(lead.id);
                else state.selectedIds.add(lead.id);
            });
            render();
            return;
        }
        applyBulkAction(action);
        return;
    }

    const openTarget = event.target.closest("[data-open-lead]");
    if (openTarget) {
        event.preventDefault();
        openLead(openTarget.dataset.openLead);
        return;
    }

    const action = event.target.closest("[data-action]");
    if (action?.dataset.action === "recalculate") return recalculateAllScores();
    if (action?.dataset.action === "run-automations") return runAutomations();
    if (action?.dataset.action === "normalize-base") return normalizeStoredLeads();
    if (action?.dataset.action === "mark-read") return markAllRead();

    const agenda = event.target.closest("[data-agenda-action]");
    if (agenda) {
        updateAgenda(agenda.dataset.leadId, agenda.dataset.agendaAction);
        return;
    }

    const groupButton = event.target.closest("[data-group-index]");
    if (groupButton) {
        const groups = groupButton.dataset.groupType === "forms"
            ? state.formGroups : state.sourceGroups;
        const group = groups[Number(groupButton.dataset.groupIndex)];
        if (!group) return;

        state.activeTab = "inbox";
        state.search = groupButton.dataset.groupType === "forms" ? group.name : "";
        state.status = "all";
        state.temperature = "all";
        state.origin = groupButton.dataset.groupType === "sources" ? group.name : "all";
        state.campaign = "all";
        state.responsible = "all";
        state.selectedIds.clear();
        updateActiveTabUI();
        render();
        return;
    }

    const mergeButton = event.target.closest("[data-merge-group]");
    if (mergeButton) {
        const group = state.duplicateGroups[Number(mergeButton.dataset.mergeGroup)];
        if (group) mergeDuplicateGroup(group);
    }
}

function handleDetailChange(event) {
    if (event.target.id === "aura-leads-v5-message-template") {
        const lead = findLead(state.selectedLeadId);
        const textarea = document.getElementById("aura-leads-v5-message-text");
        if (lead && textarea) textarea.value = buildWhatsappMessage(lead, event.target.value);
        return;
    }

    if (event.target.id === "aura-leads-v5-detail-status") {
        const probability = document.getElementById("aura-leads-v5-detail-probability");
        if (probability) probability.value = String(stageProbability(event.target.value));
    }
}

function handleDetailClick(event) {
    const button = event.target.closest("[data-detail-action]");
    if (!button) return;
    const action = button.dataset.detailAction;
    const lead = findLead(state.selectedLeadId);

    if (action === "close") return closeDetail();
    if (!lead) return;
    if (action === "save") return saveLeadDetail();
    if (action === "archive" || action === "trash" || action === "restore") {
        return moveLeadStorage(lead, action);
    }
    if (action === "contacted") return registerContact();
    if (action === "normalize") return normalizeSingleLead(lead);
    if (action === "whatsapp") return openWhatsapp(lead);
    if (action === "whatsapp-message") {
        const message = document.getElementById("aura-leads-v5-message-text")?.value.trim() || "";
        return openWhatsapp(lead, message);
    }
}

function bindPipelineDrag() {
    if (!state.canEdit) return;

    document.querySelectorAll("[data-drag-lead]").forEach((card) => {
        card.addEventListener("dragstart", (event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", card.dataset.dragLead);
            card.classList.add("is-dragging");
        });
        card.addEventListener("dragend", () => {
            card.classList.remove("is-dragging");
            document.querySelectorAll("[data-drop-stage]")
                .forEach((column) => column.classList.remove("is-drag-over"));
        });
    });

    document.querySelectorAll("[data-drop-stage]").forEach((column) => {
        column.addEventListener("dragover", (event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            column.classList.add("is-drag-over");
        });
        column.addEventListener("dragleave", () => column.classList.remove("is-drag-over"));
        column.addEventListener("drop", (event) => {
            event.preventDefault();
            column.classList.remove("is-drag-over");
            moveLeadToStage(event.dataTransfer.getData("text/plain"), column.dataset.dropStage);
        });
    });
}

function renderLoading() {
    const content = document.getElementById("aura-leads-v5-content");
    if (!content) return;
    content.innerHTML = `<section class="aura-leads-v5-loading">
        <span></span><h3>Carregando operação</h3>
        <p>Organizando pipeline, agenda, histórico e resultados.</p>
    </section>`;
}

function renderError(message) {
    const content = document.getElementById("aura-leads-v5-content");
    if (!content) return;
    content.innerHTML = `<section class="aura-leads-v5-empty">${svg.user}
        <h3>Não foi possível carregar</h3><p>${escapeHTML(message)}</p>
        <button type="button" class="aura-leads-v5-primary" data-retry>Repetir</button>
    </section>`;
    content.querySelector("[data-retry]")?.addEventListener("click", loadLeads);
}

async function initialize(user) {
    if (!user || state.initialized) return;
    state.user = user;
    state.ownerUid = await resolveOwnerUid(user);
    ensureAssetVersion();
    disableLegacyMobileController();
    loadLastSeen();
    loadSLA();
    loadAutomationPreferences();
    await loadAccessContext(user);
    if (state.canView) await loadTeam();
    injectModal();
    updateAccessBadge();
    state.initialized = true;
    state.modalOpen = true;
    if (state.canView) loadLeads();
    else renderAccessDenied();

    document.addEventListener("pointerdown", () => {
        state.soundUnlocked = true;
    }, { once: true, signal: getLifecycleSignal() });

    window.addEventListener("pagehide", (event) => {
        if (!event.persisted) teardownModalLifecycle();
    }, { signal: getLifecycleSignal() });

    window.AuraLeadsV5 = {
        version: VERSION,
        open: openModal,
        openTab: (tab) => openModal({ tab }),
        openLead,
        close: closeModal,
        reload: loadLeads,
        destroy: teardownModalLifecycle,
        runAutomations,
        normalizeStoredLeads,
        markAllRead,
        getLeads: () => state.allLeads.slice(),
        getState: () => ({
            ownerUid: state.ownerUid,
            total: state.leads.length,
            duplicates: state.duplicateGroups.length,
            archived: state.archivedLeads.length,
            trash: state.trashLeads.length,
            unread: state.unreadCount,
            realtime: Boolean(state.unsubscribeLeads),
            slaMinutes: state.slaMinutes,
            modalOpen: state.modalOpen,
            inline: true,
            activeTab: state.activeTab,
            selectedLeadId: state.selectedLeadId,
            canView: state.canView,
            canEdit: state.canEdit,
            schemaVersion: LEAD_SCHEMA_VERSION,
            incomplete: state.allLeads.filter((lead) => !lead._qualityComplete).length,
            invalidTenantCount: state.invalidTenantCount,
            version: VERSION
        })
    };
    window.AuraLeadsV6 = window.AuraLeadsV5;

    console.info(`[Vide Aura Leads V6.2] Inicializado — ${state.ownerUid} — v${VERSION}`);
}

function loadOrdersEngineV1() {
    const styleId = "aura-orders-engine-v1-style";
    if (!document.getElementById(styleId)) {
        const link = document.createElement("link");
        link.id = styleId;
        link.rel = "stylesheet";
        link.href = new URL("./orders-engine-v1.css?v=100", import.meta.url).href;
        document.head.appendChild(link);
    }

    import("./orders-engine-v1.js?v=100").catch((error) => {
        console.error("[Aura Pedidos] Não foi possível carregar o módulo:", error);
    });
}

loadOrdersEngineV1();

onAuthStateChanged(auth, (user) => {
    if (user) initialize(user);
});
