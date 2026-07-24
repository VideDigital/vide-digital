/**
 * Vide Aura — Leads & Formulários V5
 * Central comercial completa: inbox, pipeline, agenda, histórico,
 * responsáveis, WhatsApp, receita, relatórios, duplicidades e automações.
 * Versão 5.8.0
 */
import { db, auth } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    setDoc,
    where,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const VERSION = "5.8.0";
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
    runOnRefresh: false
});

const state = {
    user: null,
    ownerUid: "",
    actorName: "",
    canEdit: false,
    accessLoaded: false,
    team: [],
    leads: [],
    filtered: [],
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
    slaMinutes: 30,
    duplicateGroups: [],
    sourceGroups: [],
    formGroups: [],
    automation: { ...DEFAULT_AUTOMATIONS },
    searchTimer: null,
    automationRunning: false
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
    history: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 109-9 9 9 0 00-7.4 3.9L3 9"></path><path d="M3 4v5h5M12 7v5l3 2"></path></svg>`
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

function normalizeLead(lead) {
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
        _timestamp: leadTimestamp(lead),
        _status: status,
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
            lead.produtoInteresse, lead.paginaOrigem,
            lead.formularioNome, lead.formularioId,
            lead.blocoOrigem, lead.anotacao,
            lead.etiqueta, lead.responsavelNome
        ].filter(Boolean).join(" "))
    };
}

function ownerUidFromContext(user) {
    const params = new URLSearchParams(window.location.search);
    return params.get("masterUID") || user?.uid || "";
}

function permissionListIncludes(list, moduleName) {
    return Array.isArray(list) && (
        list.includes(moduleName) ||
        list.includes("crm") ||
        list.includes("atendimento")
    );
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
    closeModal({ restoreFocus: false });
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
    state.canEdit = user.uid === state.ownerUid;
    state.actorName = user.displayName || user.email || "Equipe";

    if (!state.canEdit) {
        try {
            const employeeSnap = await getDoc(doc(db, "funcionarios", user.uid));
            if (employeeSnap.exists()) {
                const employee = employeeSnap.data();
                const permissions = employee.permissoes || {};
                state.actorName = employee.nome || user.displayName || user.email || "Funcionário";
                state.canEdit = (
                    employee.status === "ativo" &&
                    employee.donoUID === state.ownerUid &&
                    permissionListIncludes(permissions.editar, "leads")
                );
                state.team.push({
                    uid: user.uid,
                    nome: state.actorName,
                    cargo: employee.cargo || "Equipe"
                });
            }
        } catch (error) {
            console.warn("[Aura Leads V5] Permissão não carregada:", error?.message || error);
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
        console.info("[Aura Leads V5] Lista completa da equipe indisponível.");
    }

    state.team = Array.from(team.values())
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

function injectEntryButton() {
    const view = document.getElementById("view-leads");
    if (!view || document.getElementById("aura-leads-v5-entry")) return;

    const entry = document.createElement("section");
    entry.id = "aura-leads-v5-entry";
    entry.className = "aura-leads-v5-entry";
    entry.innerHTML = `
        <div class="aura-leads-v5-entry-copy">
            <span class="aura-leads-v5-kicker">Aura Leads V5.8</span>
            <h2>Pipeline comercial completo em uma única operação</h2>
            <p>Leads, agenda, histórico, responsáveis, mensagens, previsão de receita, relatórios e automações.</p>
        </div>
        <div class="aura-leads-v5-entry-actions">
            <span class="aura-leads-v5-entry-status"><i></i>Motor comercial ativo</span>
            <button type="button" id="aura-leads-v5-open" class="aura-leads-v5-primary">
                ${svg.spark} Abrir Leads V5
            </button>
        </div>
    `;

    const firstCard = view.firstElementChild;
    if (firstCard?.nextSibling) view.insertBefore(entry, firstCard.nextSibling);
    else view.prepend(entry);

    entry.querySelector("#aura-leads-v5-open")?.addEventListener(
        "click", openModal, { signal: getLifecycleSignal() }
    );
}

function renderEmptyDetail() {
    return `
        <div class="aura-leads-v5-empty-detail">
            ${svg.user}
            <h3>Selecione um lead</h3>
            <p>Abra uma oportunidade para atualizar pipeline, agenda, responsável, valor e histórico.</p>
        </div>
    `;
}

function injectModal() {
    const existing = document.getElementById("aura-leads-v5-modal");
    if (existing) {
        applyModalState(existing, state.modalOpen, { emit: false });
        return existing;
    }

    const modal = document.createElement("div");
    modal.id = "aura-leads-v5-modal";
    modal.className = "aura-leads-v5-modal";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
        <div class="aura-leads-v5-backdrop" data-aura-close></div>
        <section class="aura-leads-v5-shell" role="dialog" aria-modal="true" aria-labelledby="aura-leads-v5-title">
            <header class="aura-leads-v5-header">
                <div class="aura-leads-v5-brand">
                    <span class="aura-leads-v5-brand-icon">${svg.spark}</span>
                    <div><span>Aura Operations</span><h2 id="aura-leads-v5-title">Leads & Formulários V5</h2></div>
                </div>
                <div class="aura-leads-v5-header-actions">
                    <span id="aura-leads-v5-access-badge" class="aura-leads-v5-access-badge"></span>
                    <button type="button" class="aura-leads-v5-ghost" data-action="refresh">${svg.refresh} Atualizar</button>
                    <button type="button" class="aura-leads-v5-ghost" data-action="export">${svg.export} Exportar</button>
                    <button type="button" class="aura-leads-v5-icon-button" data-aura-close aria-label="Fechar">${svg.close}</button>
                </div>
            </header>

            <div class="aura-leads-v5-toolbar">
                <nav class="aura-leads-v5-tabs" aria-label="Áreas da central">
                    <button type="button" data-tab="inbox" class="is-active">${svg.user}<span>Inbox</span></button>
                    <button type="button" data-tab="pipeline">${svg.board}<span>Pipeline</span></button>
                    <button type="button" data-tab="agenda">${svg.calendar}<span>Agenda</span></button>
                    <button type="button" data-tab="priority">${svg.spark}<span>Prioridades</span></button>
                    <button type="button" data-tab="forms">${svg.form}<span>Formulários</span></button>
                    <button type="button" data-tab="sources">${svg.source}<span>Origens</span></button>
                    <button type="button" data-tab="reports">${svg.chart}<span>Relatórios</span></button>
                    <button type="button" data-tab="duplicates">${svg.duplicate}<span>Duplicidades</span></button>
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

            <div class="aura-leads-v5-body">
                <main class="aura-leads-v5-main"><div id="aura-leads-v5-content"></div></main>
                <aside id="aura-leads-v5-detail" class="aura-leads-v5-detail" aria-label="Detalhes do lead">${renderEmptyDetail()}</aside>
            </div>
        </section>
    `;

    applyModalState(modal, false, { emit: false });
    document.body.appendChild(modal);
    const signal = getLifecycleSignal();

    modal.querySelectorAll("[data-aura-close]").forEach((button) => {
        button.addEventListener("click", closeModal, { signal });
    });

    modal.querySelector("[data-action='refresh']")?.addEventListener("click", loadLeads, { signal });
    modal.querySelector("[data-action='export']")?.addEventListener("click", exportCSV, { signal });

    modal.querySelectorAll("[data-tab]").forEach((button) => {
        button.addEventListener("click", () => {
            state.activeTab = button.dataset.tab || "inbox";
            updateActiveTabUI();
            closeDetail();
            render();
        }, { signal });
    });

    const sla = modal.querySelector("#aura-leads-v5-sla");
    sla.value = String(state.slaMinutes);
    sla.addEventListener("change", () => saveSLA(sla.value), { signal });

    const content = modal.querySelector("#aura-leads-v5-content");
    content?.addEventListener("click", handleContentClick, { signal });
    content?.addEventListener("change", handleContentChange, { signal });
    content?.addEventListener("input", handleContentInput, { signal });

    const detail = modal.querySelector("#aura-leads-v5-detail");
    detail?.addEventListener("click", handleDetailClick, { signal });
    detail?.addEventListener("change", handleDetailChange, { signal });

    document.addEventListener("keydown", (event) => {
        if (!state.modalOpen) {
            if ((event.ctrlKey || event.metaKey) && event.altKey && event.key.toLowerCase() === "l") {
                event.preventDefault();
                openModal();
            }
            return;
        }

        if (event.key === "Escape") {
            const element = document.getElementById("aura-leads-v5-modal");
            if (element?.classList.contains("is-detail-open")) closeDetail();
            else closeModal();
        }
    }, { signal });

    updateAccessBadge();
    return modal;
}

function updateAccessBadge() {
    const badge = document.getElementById("aura-leads-v5-access-badge");
    if (!badge) return;
    badge.textContent = state.canEdit ? "Edição liberada" : "Somente leitura";
    badge.dataset.mode = state.canEdit ? "edit" : "read";
}

function updateActiveTabUI() {
    document.getElementById("aura-leads-v5-modal")
        ?.querySelectorAll("[data-tab]")
        .forEach((button) => {
            button.classList.toggle("is-active", button.dataset.tab === state.activeTab);
        });
}

function openModal() {
    injectModal();
    const modal = document.getElementById("aura-leads-v5-modal");
    if (!modal) return;

    if (!state.modalOpen && document.activeElement instanceof HTMLElement && !modal.contains(document.activeElement)) {
        state.previouslyFocusedElement = document.activeElement;
    }

    applyModalState(modal, true);
    document.body.classList.add("aura-leads-v5-lock");
    updateAccessBadge();
    updateActiveTabUI();

    if (!state.leads.length && !state.loading) loadLeads();
    else render();

    focusModal(modal);
}

function closeModal(options = {}) {
    const modal = document.getElementById("aura-leads-v5-modal");
    const wasOpen = state.modalOpen;
    closeDetail();
    applyModalState(modal, false);
    document.body.classList.remove("aura-leads-v5-lock");
    if (wasOpen && options.restoreFocus !== false) restorePreviousFocus();
}

function closeDetail() {
    document.getElementById("aura-leads-v5-modal")?.classList.remove("is-detail-open");
    const host = document.getElementById("aura-leads-v5-detail");
    if (host) host.innerHTML = renderEmptyDetail();
    state.selectedLeadId = "";
}

async function loadLeads() {
    if (!state.ownerUid || state.loading) return;
    state.loading = true;
    renderLoading();

    try {
        const snapshot = await getDocs(query(
            collection(db, "leads"),
            where("criadoPor", "==", state.ownerUid)
        ));

        state.leads = snapshot.docs
            .map((item) => normalizeLead({ id: item.id, ...item.data() }))
            .filter((lead) => !lead.lixeira && !lead.arquivado)
            .sort((a, b) => b._timestamp - a._timestamp);

        deriveGroups();

        if (state.automation.runOnRefresh && state.canEdit && !state.automationRunning) {
            await runAutomations({ silent: true, skipRender: true });
        }

        state.loading = false;
        render();

        if (state.selectedLeadId) {
            const exists = state.leads.some((lead) => lead.id === state.selectedLeadId);
            if (exists) renderDetail(state.selectedLeadId);
            else closeDetail();
        }
    } catch (error) {
        state.loading = false;
        console.error("[Aura Leads V5] Falha ao carregar leads:", error);
        renderError("Não foi possível carregar os leads. Verifique suas regras do Firestore.");
    }
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

function render() {
    const content = document.getElementById("aura-leads-v5-content");
    if (!content) return;
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
    content.innerHTML = `${renderMetrics()}${renderFilters()}${renderLeadTable(state.filtered)}`;
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

    return `
        <section class="aura-leads-v5-metrics">
            <article>
                <span>Base ativa</span><strong>${total.toLocaleString("pt-BR")}</strong>
                <small>${open.length} oportunidade(s) em aberto</small>
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
        const lead = state.leads.find((item) =>
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

function renderLeadTable(leads) {
    if (!leads.length) {
        return `<section class="aura-leads-v5-empty">${svg.user}
            <h3>Nenhum lead encontrado</h3>
            <p>Ajuste os filtros ou aguarde novas capturas.</p>
        </section>`;
    }

    return `
        <section class="aura-leads-v5-table-wrap">
            <table class="aura-leads-v5-table">
                <thead><tr>
                    <th>Lead</th><th>Intenção</th><th>Origem</th><th>Pipeline</th>
                    <th>Valor</th><th>Responsável</th><th>Agenda</th><th>Capturado</th><th></th>
                </tr></thead>
                <tbody>${leads.map(renderLeadRow).join("")}</tbody>
            </table>
        </section>
    `;
}

function renderLeadRow(lead) {
    const temp = TEMPERATURES[lead._temperature] || TEMPERATURES.cold;
    const contact = lead.whatsapp || lead.telefone || lead.email || "Sem contato";
    const interest = lead.produtoInteresse || lead.paginaOrigem || "Sem interesse informado";
    const context = lead._campaign !== "Sem campanha"
        ? `${lead._campaign} · ${interest}`
        : interest;
    const followup = anyTimestamp(lead.proximoContatoEm || lead.lembreteTimestamp);

    return `
        <tr data-open-lead="${escapeHTML(lead.id)}"
            class="${state.selectedLeadId === lead.id ? "is-selected" : ""}">
            <td><div class="aura-leads-v5-person">
                <span class="aura-leads-v5-avatar">${escapeHTML((lead.nome || "L").charAt(0).toUpperCase())}</span>
                <div><strong>${escapeHTML(lead.nome || "Lead sem nome")}</strong><small>${escapeHTML(contact)}</small></div>
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

function automationToggle(key, title, description) {
    return `<label class="aura-leads-v5-automation-rule">
        <span><strong>${escapeHTML(title)}</strong><small>${escapeHTML(description)}</small></span>
        <input type="checkbox" data-automation-key="${escapeHTML(key)}"
            ${state.automation[key] ? "checked" : ""} ${state.canEdit ? "" : "disabled"}><i></i>
    </label>`;
}

function renderAutomations() {
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
            </div>
            <aside>${svg.automation}<h4>Execução controlada</h4>
                <p>As regras não criam contatos, não alteram valores e não disparam WhatsApp.</p>
                <button type="button" class="aura-leads-v5-primary" data-action="run-automations"
                    ${state.canEdit && !state.automationRunning ? "" : "disabled"}>
                    ${state.automationRunning ? "Executando..." : "Executar agora"}
                </button>
            </aside>
        </section>`;
}

function openLead(leadId) {
    const lead = state.leads.find((item) => item.id === leadId);
    if (!lead) return;
    state.selectedLeadId = leadId;
    renderDetail(leadId);
    document.getElementById("aura-leads-v5-modal")?.classList.add("is-detail-open");
    document.querySelectorAll("[data-open-lead]").forEach((item) => {
        item.classList.toggle("is-selected", item.dataset.openLead === leadId);
    });
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
    const lead = state.leads.find((item) => item.id === leadId);
    if (!host || !lead) return;

    const temp = TEMPERATURES[lead._temperature] || TEMPERATURES.cold;
    const phone = lead._phone;
    const readOnly = state.canEdit ? "" : "disabled";
    const defaultTemplate = lead._status === "proposta"
        ? "fechamento"
        : lead._status === "em_contato" ? "followup" : "saudacao";

    host.innerHTML = `
        <button type="button" class="aura-leads-v5-detail-close" data-detail-action="close">${svg.close} Voltar</button>
        <div class="aura-leads-v5-detail-head">
            <div class="aura-leads-v5-person">
                <span class="aura-leads-v5-avatar aura-leads-v5-avatar-large">${escapeHTML((lead.nome || "L").charAt(0).toUpperCase())}</span>
                <div><small>Oportunidade selecionada</small><h3>${escapeHTML(lead.nome || "Lead sem nome")}</h3>
                    <p>${escapeHTML(lead.whatsapp || lead.telefone || lead.email || "Sem contato")}</p>
                </div>
            </div>
            <div class="aura-leads-v5-score aura-leads-v5-score-large" data-temperature="${lead._temperature}">
                <span>${lead._score}</span><div><strong>${temp.label}</strong><small>Lead score</small></div>
            </div>
        </div>

        <div class="aura-leads-v5-detail-actions">
            ${phone ? `<button type="button" class="aura-leads-v5-whatsapp" data-detail-action="whatsapp">${svg.whatsapp} Abrir WhatsApp</button>` : ""}
            <button type="button" class="aura-leads-v5-secondary" data-detail-action="contacted" ${readOnly}>${svg.clock} Registrar contato</button>
        </div>

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
            <textarea id="aura-leads-v5-detail-note" rows="4"
                placeholder="Contexto, objeções e próximos passos." ${readOnly}>${escapeHTML(lead.anotacao || "")}</textarea>
        </label>

        ${phone ? `<section class="aura-leads-v5-message-builder">
            <header>${svg.whatsapp}<div><h4>Mensagem de WhatsApp</h4><span>Escolha um modelo e ajuste antes de abrir.</span></div></header>
            <select id="aura-leads-v5-message-template">
                ${Object.entries(WHATSAPP_TEMPLATES).map(([key, template]) => `<option value="${key}" ${key === defaultTemplate ? "selected" : ""}>${escapeHTML(template.label)}</option>`).join("")}
            </select>
            <textarea id="aura-leads-v5-message-text" rows="4">${escapeHTML(buildWhatsappMessage(lead, defaultTemplate))}</textarea>
            <button type="button" class="aura-leads-v5-whatsapp" data-detail-action="whatsapp-message">${svg.whatsapp} Abrir com esta mensagem</button>
        </section>` : ""}

        <section class="aura-leads-v5-context"><h4>Contexto da captura</h4><dl>
            <div><dt>Origem</dt><dd>${escapeHTML(lead._origin)}</dd></div>
            <div><dt>Campanha</dt><dd>${escapeHTML(lead._campaign)}</dd></div>
            <div><dt>Meio</dt><dd>${escapeHTML(lead._medium || "Não informado")}</dd></div>
            <div><dt>Interesse</dt><dd>${escapeHTML(lead.produtoInteresse || "Não informado")}</dd></div>
            <div><dt>Página</dt><dd>${escapeHTML(lead.paginaOrigem || lead.urlPagina || "Não informada")}</dd></div>
            <div><dt>Formulário</dt><dd>${escapeHTML(lead.formularioNome || lead.formularioId || lead.blocoOrigem || "Captura geral")}</dd></div>
            <div><dt>Capturado</dt><dd>${formatDate(lead._timestamp)}</dd></div>
            <div><dt>Previsão</dt><dd>${formatMoney(lead._forecast)}</dd></div>
        </dl></section>

        ${renderHistory(lead)}

        <footer class="aura-leads-v5-detail-footer">
            <span>${state.canEdit ? (lead._overdue ? "Follow-up ou SLA vencido" : `Etapa atual: ${STATUS_LABELS[lead._status]}`) : "Acesso somente para consulta"}</span>
            <button type="button" class="aura-leads-v5-primary" data-detail-action="save" ${readOnly}>${svg.save} Salvar alterações</button>
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

    const payload = { ...updates, atualizadoEm: Date.now() };
    if (event) payload.historicoLead = historyWithEvent(lead, event);

    try {
        await setDoc(doc(db, "leads", lead.id), payload, { merge: true });
        Object.assign(lead, payload);
        Object.assign(lead, normalizeLead(lead));
        deriveGroups();
        return true;
    } catch (error) {
        console.error("[Aura Leads V5] Falha ao atualizar lead:", error);
        toast("Não foi possível atualizar o lead.", "error");
        return false;
    }
}

async function saveLeadDetail() {
    const lead = state.leads.find((item) => item.id === state.selectedLeadId);
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
    const lead = state.leads.find((item) => item.id === leadId);
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
    const lead = state.leads.find((item) => item.id === leadId);
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
    const lead = state.leads.find((item) => item.id === leadId);
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
    for (let index = 0; index < patches.length; index += MAX_BATCH_SIZE) {
        const chunk = patches.slice(index, index + MAX_BATCH_SIZE);
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
        state.leads = state.leads.map(normalizeLead);
        deriveGroups();
        render();
        toast("Scores recalculados.");
    } catch (error) {
        console.error("[Aura Leads V5] Falha ao recalcular scores:", error);
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
            deriveGroups();
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
        console.error("[Aura Leads V5] Falha nas automações:", error);
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
        await loadLeads();
        state.activeTab = "duplicates";
        updateActiveTabUI();
        render();
        toast("Duplicidades mescladas.");
    } catch (error) {
        console.error("[Aura Leads V5] Falha ao mesclar duplicidades:", error);
        toast("Não foi possível mesclar os registros.", "error");
    }
}

function exportCSV() {
    const usesInboxFilters =
        state.activeTab === "inbox" ||
        state.activeTab === "priority";

    const leads = usesInboxFilters
        ? applyFilters(
            state.activeTab === "priority"
                ? state.leads.filter((lead) =>
                    lead._overdue ||
                    lead._temperature === "hot" ||
                    lead.prioridadeLead === "alta"
                )
                : state.leads
        )
        : state.leads;

    if (!leads.length) {
        toast("Não há leads para exportar.", "error");
        return;
    }

    const rows = [[
        "Nome", "WhatsApp", "E-mail", "Origem", "Campanha", "Interesse",
        "Etapa", "Score", "Temperatura", "Prioridade", "Responsável",
        "Valor", "Probabilidade", "Previsão ponderada", "Próximo contato",
        "Fechamento previsto", "SLA vencido", "Página", "Formulário", "Capturado em"
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
        formatDate(lead._timestamp)
    ]));

    const csv = rows
        .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(";"))
        .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `aura_leads_v5_${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast("CSV exportado.");
}

function refreshInboxResults() {
    const baseLeads = state.activeTab === "priority"
        ? state.leads.filter((lead) =>
            lead._overdue ||
            lead._temperature === "hot" ||
            lead.prioridadeLead === "alta"
        )
        : state.leads;

    state.filtered = applyFilters(baseLeads);

    const content = document.getElementById(
        "aura-leads-v5-content"
    );

    const current = content?.querySelector(
        ".aura-leads-v5-table-wrap, " +
        ".aura-leads-v5-empty"
    );

    if (!current) {
        render();
        return;
    }

    const template = document.createElement("template");
    template.innerHTML = renderLeadTable(
        state.filtered
    ).trim();

    const replacement =
        template.content.firstElementChild;

    if (replacement) {
        current.replaceWith(replacement);
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
        saveAutomationPreferences();
        toast("Preferência de automação salva.");
    }
}

function handleContentClick(event) {
    if (event.target.closest("[data-pipeline-move]")) {
        return;
    }

    const openTarget = event.target.closest(
        "[data-open-lead]"
    );

    if (openTarget) {
        event.preventDefault();
        openLead(openTarget.dataset.openLead);
        return;
    }

    const action = event.target.closest("[data-action]");
    if (action?.dataset.action === "recalculate") return recalculateAllScores();
    if (action?.dataset.action === "run-automations") return runAutomations();

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
        const lead = state.leads.find((item) => item.id === state.selectedLeadId);
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
    const lead = state.leads.find((item) => item.id === state.selectedLeadId);

    if (action === "close") return closeDetail();
    if (!lead) return;
    if (action === "save") return saveLeadDetail();
    if (action === "contacted") return registerContact();
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
    state.ownerUid = ownerUidFromContext(user);
    loadSLA();
    loadAutomationPreferences();
    await loadAccessContext(user);
    await loadTeam();
    injectEntryButton();
    injectModal();
    updateAccessBadge();
    state.initialized = true;

    window.addEventListener("pagehide", (event) => {
        if (!event.persisted) teardownModalLifecycle();
    }, { signal: getLifecycleSignal() });

    window.AuraLeadsV5 = {
        version: VERSION,
        open: openModal,
        close: closeModal,
        reload: loadLeads,
        destroy: teardownModalLifecycle,
        runAutomations,
        getState: () => ({
            ownerUid: state.ownerUid,
            total: state.leads.length,
            duplicates: state.duplicateGroups.length,
            slaMinutes: state.slaMinutes,
            modalOpen: state.modalOpen,
            activeTab: state.activeTab,
            canEdit: state.canEdit,
            version: VERSION
        })
    };

    console.info(`[Vide Aura Leads V5] Inicializado — ${state.ownerUid} — v${VERSION}`);
}

onAuthStateChanged(auth, (user) => {
    if (user) initialize(user);
});

