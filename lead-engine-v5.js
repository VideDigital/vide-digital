/**
 * Vide Aura — Leads & Formulários V5
 * Central operacional de leads, scoring, SLA, formulários, origens e duplicidades.
 * Versão 5.0.0
 */
import { db, auth } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
    collection,
    doc,
    getDocs,
    query,
    setDoc,
    where,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const VERSION = "5.0.0";
const STORAGE_PREFIX = "aura_leads_v5_";
const STATUS_LABELS = Object.freeze({
    novo: "Novo",
    em_contato: "Em contato",
    "em contato": "Em contato",
    contato: "Em contato",
    convertido: "Convertido",
    perdido: "Perdido"
});
const TEMPERATURES = Object.freeze({
    hot: { label: "Quente", min: 75 },
    warm: { label: "Morno", min: 45 },
    cold: { label: "Frio", min: 0 }
});

const state = {
    user: null,
    ownerUid: "",
    leads: [],
    filtered: [],
    selectedLeadId: "",
    activeTab: "inbox",
    status: "all",
    temperature: "all",
    origin: "all",
    campaign: "all",
    loading: false,
    initialized: false,
    modalOpen: false,
    lifecycleController: null,
    previouslyFocusedElement: null,
    slaMinutes: 30,
    duplicateGroups: [],
    sourceGroups: [],
    formGroups: []
};

function getLifecycleSignal() {
    if (
        !state.lifecycleController ||
        state.lifecycleController.signal.aborted
    ) {
        state.lifecycleController = new AbortController();
    }

    return state.lifecycleController.signal;
}

function dispatchModalState(open) {
    window.dispatchEvent(
        new CustomEvent("aura:leads-v5-statechange", {
            detail: { open }
        })
    );
}

function applyModalState(modal, open, options = {}) {
    if (!modal) {
        return;
    }

    const changed = state.modalOpen !== open;
    state.modalOpen = open;
    modal.classList.toggle("is-open", open);
    modal.setAttribute("aria-hidden", open ? "false" : "true");
    modal.style.pointerEvents = open ? "auto" : "none";

    if (open) {
        modal.removeAttribute("inert");
    } else {
        modal.setAttribute("inert", "");
    }

    if (changed && options.emit !== false) {
        dispatchModalState(open);
    }
}

function focusModal(modal) {
    window.requestAnimationFrame(() => {
        if (!state.modalOpen) {
            return;
        }

        const target = modal.querySelector(
            "button[data-aura-close]"
        );

        target?.focus({ preventScroll: true });
    });
}

function restorePreviousFocus() {
    const target = state.previouslyFocusedElement;
    state.previouslyFocusedElement = null;

    if (!(target instanceof HTMLElement) || !target.isConnected) {
        return;
    }

    window.requestAnimationFrame(() => {
        if (!state.modalOpen && target.isConnected) {
            target.focus({ preventScroll: true });
        }
    });
}

function teardownModalLifecycle() {
    closeModal({ restoreFocus: false });
    state.lifecycleController?.abort();
    state.lifecycleController = null;
    state.previouslyFocusedElement = null;
}

const svg = {
    spark: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3z"></path><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z"></path></svg>`,
    close: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>`,
    refresh: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 10-2.3 5.7"></path><path d="M20 4v7h-7"></path></svg>`,
    export: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12"></path><path d="M7 10l5 5 5-5"></path><path d="M5 21h14"></path></svg>`,
    search: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4-4"></path></svg>`,
    user: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0116 0"></path></svg>`,
    clock: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>`,
    form: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h14v18H5z"></path><path d="M8 7h8M8 11h8M8 15h5"></path></svg>`,
    source: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V9M10 19V5M16 19v-8M22 19H2"></path></svg>`,
    duplicate: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"></rect><path d="M16 8V5a2 2 0 00-2-2H5a2 2 0 00-2 2v9a2 2 0 002 2h3"></path></svg>`,
    whatsapp: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a8 8 0 01-11.8 7L4 20l1.4-4A8 8 0 1120 11.5z"></path><path d="M9 8.5c.3 2.4 2.1 4.2 4.5 4.7"></path></svg>`,
    chevron: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6"></path></svg>`,
    save: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h12l2 2v16H5z"></path><path d="M8 3v6h8V3M8 21v-7h8v7"></path></svg>`,
    merge: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v5a4 4 0 004 4h6"></path><path d="M7 21v-5a4 4 0 014-4"></path><path d="M14 9l3 3-3 3"></path></svg>`
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

    if (digits.length === 10 || digits.length === 11) {
        digits = `55${digits}`;
    }

    return digits;
}

function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

function leadTimestamp(lead) {
    const values = [
        lead?.data,
        lead?.criadoEm,
        lead?.createdAt,
        lead?.timestamp
    ];

    for (const value of values) {
        if (!value) {
            continue;
        }

        if (typeof value?.toMillis === "function") {
            return value.toMillis();
        }

        if (typeof value?.seconds === "number") {
            return value.seconds * 1000;
        }

        if (typeof value === "number") {
            return value < 100000000000 ? value * 1000 : value;
        }

        const parsed = new Date(value).getTime();
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return 0;
}

function formatDate(timestamp, includeTime = true) {
    if (!timestamp) {
        return "—";
    }

    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
        return "—";
    }

    return date.toLocaleString("pt-BR", includeTime
        ? {
            dateStyle: "short",
            timeStyle: "short"
        }
        : {
            dateStyle: "short"
        }
    );
}

function formatRelative(timestamp) {
    if (!timestamp) {
        return "Sem data";
    }

    const delta = Date.now() - timestamp;
    const minutes = Math.max(0, Math.floor(delta / 60000));

    if (minutes < 1) {
        return "Agora";
    }

    if (minutes < 60) {
        return `${minutes} min`;
    }

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return `${hours} h`;
    }

    const days = Math.floor(hours / 24);
    return `${days} d`;
}

function normalizeStatus(lead) {
    const raw = normalizeText(lead?.statusLead || lead?.status || "novo")
        .replace(/\s+/g, "_");

    if (raw === "em_contato" || raw === "contato") {
        return "em_contato";
    }

    if (raw === "convertido") {
        return "convertido";
    }

    if (raw === "perdido") {
        return "perdido";
    }

    return "novo";
}

function computeScore(lead) {
    let score = 0;
    const timestamp = leadTimestamp(lead);
    const ageHours = timestamp
        ? Math.max(0, (Date.now() - timestamp) / 3600000)
        : 9999;
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
    if (ageHours <= 1) score += 10;
    else if (ageHours <= 24) score += 6;
    else if (ageHours <= 72) score += 3;

    if (status === "em_contato") score += 4;
    if (status === "convertido") score = 100;
    if (status === "perdido") score = Math.min(score, 25);

    return Math.max(0, Math.min(100, Math.round(score)));
}

function temperatureFor(score) {
    if (score >= TEMPERATURES.hot.min) {
        return "hot";
    }

    if (score >= TEMPERATURES.warm.min) {
        return "warm";
    }

    return "cold";
}

function isOverdue(lead) {
    const status = normalizeStatus(lead);

    if (status === "convertido" || status === "perdido") {
        return false;
    }

    const lastContact = Number(
        lead.ultimoContatoEm ||
        lead.contatadoEm ||
        0
    );

    if (lastContact) {
        const followup = Number(
            lead.proximoContatoEm ||
            lead.lembreteTimestamp ||
            0
        );

        return Boolean(followup && followup < Date.now());
    }

    const timestamp = leadTimestamp(lead);
    if (!timestamp) {
        return false;
    }

    return Date.now() - timestamp > state.slaMinutes * 60000;
}

function normalizeLead(lead) {
    const score = Number.isFinite(Number(lead.leadScore))
        ? Number(lead.leadScore)
        : computeScore(lead);
    const temperature = lead.temperaturaLead || temperatureFor(score);
    const origin = String(
        lead.origem ||
        lead.utmSource ||
        lead.utm_source ||
        "Direto"
    ).trim() || "Direto";
    const campaign = String(
        lead.utmCampaign ||
        lead.utm_campaign ||
        "Sem campanha"
    ).trim() || "Sem campanha";

    return {
        ...lead,
        _timestamp: leadTimestamp(lead),
        _status: normalizeStatus(lead),
        _score: Math.max(0, Math.min(100, Math.round(score))),
        _temperature: temperatureFor(score),
        _overdue: isOverdue(lead),
        _phone: normalizePhone(lead.whatsapp || lead.telefone),
        _email: normalizeEmail(lead.email),
        _origin: origin,
        _campaign: campaign,
        _search: normalizeText([
            lead.nome,
            lead.email,
            lead.whatsapp,
            lead.telefone,
            lead.origem,
            lead.utmSource,
            lead.utm_source,
            lead.utmCampaign,
            lead.utm_campaign,
            lead.produtoInteresse,
            lead.paginaOrigem,
            lead.formularioId,
            lead.anotacao
        ].filter(Boolean).join(" "))
    };
}

function ownerUidFromContext(user) {
    const params = new URLSearchParams(window.location.search);
    const masterUid = params.get("masterUID");

    return masterUid || user?.uid || "";
}

function loadSLA() {
    const key = `${STORAGE_PREFIX}sla_${state.ownerUid}`;
    const saved = Number(localStorage.getItem(key));
    state.slaMinutes = Number.isFinite(saved) && saved >= 5
        ? Math.min(1440, saved)
        : 30;
}

function saveSLA(value) {
    const numeric = Math.max(5, Math.min(1440, Number(value) || 30));
    state.slaMinutes = numeric;
    localStorage.setItem(`${STORAGE_PREFIX}sla_${state.ownerUid}`, String(numeric));
    state.leads = state.leads.map(normalizeLead);
    deriveGroups();
    render();
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

function injectEntryButton() {
    const view = document.getElementById("view-leads");

    if (!view || document.getElementById("aura-leads-v5-entry")) {
        return;
    }

    const entry = document.createElement("section");
    entry.id = "aura-leads-v5-entry";
    entry.className = "aura-leads-v5-entry";
    entry.innerHTML = `
        <div class="aura-leads-v5-entry-copy">
            <span class="aura-leads-v5-kicker">Aura Leads V5</span>
            <h2>Priorize oportunidades e responda no momento certo</h2>
            <p>Scoring, SLA, formulários, origens, duplicidades e ações comerciais em uma central única.</p>
        </div>
        <div class="aura-leads-v5-entry-actions">
            <span class="aura-leads-v5-entry-status">
                <i></i>
                Motor operacional ativo
            </span>
            <button type="button" id="aura-leads-v5-open" class="aura-leads-v5-primary">
                ${svg.spark}
                Abrir Leads V5
            </button>
        </div>
    `;

    const firstCard = view.firstElementChild;
    if (firstCard?.nextSibling) {
        view.insertBefore(entry, firstCard.nextSibling);
    } else {
        view.prepend(entry);
    }

    entry.querySelector("#aura-leads-v5-open")?.addEventListener(
        "click",
        openModal,
        { signal: getLifecycleSignal() }
    );
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
                    <div>
                        <span>Aura Operations</span>
                        <h2 id="aura-leads-v5-title">Leads & Formulários V5</h2>
                    </div>
                </div>
                <div class="aura-leads-v5-header-actions">
                    <button type="button" class="aura-leads-v5-ghost" data-action="refresh">
                        ${svg.refresh}
                        Atualizar
                    </button>
                    <button type="button" class="aura-leads-v5-ghost" data-action="export">
                        ${svg.export}
                        Exportar
                    </button>
                    <button type="button" class="aura-leads-v5-icon-button" data-aura-close aria-label="Fechar">
                        ${svg.close}
                    </button>
                </div>
            </header>

            <div class="aura-leads-v5-toolbar">
                <nav class="aura-leads-v5-tabs" aria-label="Áreas da central">
                    <button type="button" data-tab="inbox" class="is-active">${svg.user}<span>Inbox</span></button>
                    <button type="button" data-tab="priority">${svg.spark}<span>Prioridades</span></button>
                    <button type="button" data-tab="forms">${svg.form}<span>Formulários</span></button>
                    <button type="button" data-tab="sources">${svg.source}<span>Origens</span></button>
                    <button type="button" data-tab="duplicates">${svg.duplicate}<span>Duplicidades</span></button>
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
                <main class="aura-leads-v5-main">
                    <div id="aura-leads-v5-content"></div>
                </main>
                <aside id="aura-leads-v5-detail" class="aura-leads-v5-detail" aria-label="Detalhes do lead">
                    <div class="aura-leads-v5-empty-detail">
                        ${svg.user}
                        <h3>Selecione um lead</h3>
                        <p>Abra uma oportunidade para atualizar status, prioridade, agenda e anotação.</p>
                    </div>
                </aside>
            </div>
        </section>
    `;

    applyModalState(modal, false, { emit: false });
    document.body.appendChild(modal);

    const signal = getLifecycleSignal();

    modal.querySelectorAll("[data-aura-close]").forEach((button) => {
        button.addEventListener("click", closeModal, { signal });
    });

    modal.querySelector("[data-action='refresh']")?.addEventListener(
        "click",
        loadLeads,
        { signal }
    );
    modal.querySelector("[data-action='export']")?.addEventListener(
        "click",
        exportCSV,
        { signal }
    );
    modal.querySelectorAll("[data-tab]").forEach((button) => {
        button.addEventListener("click", () => {
            state.activeTab = button.dataset.tab || "inbox";
            modal.querySelectorAll("[data-tab]").forEach((item) => {
                item.classList.toggle("is-active", item === button);
            });
            render();
        }, { signal });
    });

    const sla = modal.querySelector("#aura-leads-v5-sla");
    sla.value = String(state.slaMinutes);
    sla.addEventListener(
        "change",
        () => saveSLA(sla.value),
        { signal }
    );

    document.addEventListener("keydown", (event) => {
        if (!state.modalOpen) {
            if ((event.ctrlKey || event.metaKey) && event.altKey && event.key.toLowerCase() === "l") {
                event.preventDefault();
                openModal();
            }
            return;
        }

        if (event.key === "Escape") {
            closeModal();
        }
    }, { signal });

    return modal;
}

function openModal() {
    injectModal();
    const modal = document.getElementById("aura-leads-v5-modal");
    if (!modal) {
        return;
    }

    if (
        !state.modalOpen &&
        document.activeElement instanceof HTMLElement &&
        !modal.contains(document.activeElement)
    ) {
        state.previouslyFocusedElement = document.activeElement;
    }

    applyModalState(modal, true);
    document.body.classList.add("aura-leads-v5-lock");

    if (!state.leads.length && !state.loading) {
        loadLeads();
    } else {
        render();
    }

    focusModal(modal);
}

function closeModal(options = {}) {
    const modal = document.getElementById("aura-leads-v5-modal");
    const wasOpen = state.modalOpen;

    applyModalState(modal, false);
    document.body.classList.remove("aura-leads-v5-lock");

    if (wasOpen && options.restoreFocus !== false) {
        restorePreviousFocus();
    }
}

async function loadLeads() {
    if (!state.ownerUid || state.loading) {
        return;
    }

    state.loading = true;
    renderLoading();

    try {
        const snapshot = await getDocs(
            query(
                collection(db, "leads"),
                where("criadoPor", "==", state.ownerUid)
            )
        );

        state.leads = snapshot.docs
            .map((item) => normalizeLead({
                id: item.id,
                ...item.data()
            }))
            .filter((lead) => !lead.lixeira)
            .sort((a, b) => b._timestamp - a._timestamp);

        deriveGroups();
        render();

        if (state.selectedLeadId) {
            renderDetail(state.selectedLeadId);
        }
    } catch (error) {
        console.error("[Aura Leads V5] Falha ao carregar leads:", error);
        renderError("Não foi possível carregar os leads. Verifique suas regras do Firestore.");
    } finally {
        state.loading = false;
    }
}

function deriveGroups() {
    state.duplicateGroups = buildDuplicateGroups();
    state.sourceGroups = groupBy(
        state.leads,
        (lead) => String(
            lead.origem ||
            lead.utmSource ||
            lead.utm_source ||
            "Direto"
        ).trim() || "Direto"
    );
    state.formGroups = groupBy(
        state.leads,
        (lead) => String(
            lead.formularioNome ||
            lead.formularioId ||
            lead.blocoOrigem ||
            lead.paginaOrigem ||
            "Captura geral"
        ).trim() || "Captura geral"
    );
}

function groupBy(items, resolver) {
    const map = new Map();

    for (const item of items) {
        const key = resolver(item);
        if (!map.has(key)) {
            map.set(key, []);
        }
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
                : 0
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
            if (!buckets.has(key)) {
                buckets.set(key, new Map());
            }
            buckets.get(key).set(lead.id, lead);
        }
    }

    const groups = [];
    const fingerprint = new Set();

    for (const [key, leadsMap] of buckets.entries()) {
        const leads = Array.from(leadsMap.values());
        if (leads.length < 2) {
            continue;
        }

        const ids = leads.map((lead) => lead.id).sort().join("|");
        if (fingerprint.has(ids)) {
            continue;
        }

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
        if (search && !lead._search.includes(search)) {
            return false;
        }

        if (state.status !== "all" && lead._status !== state.status) {
            return false;
        }

        if (state.temperature !== "all" && lead._temperature !== state.temperature) {
            return false;
        }

        if (state.origin !== "all" && lead._origin !== state.origin) {
            return false;
        }

        if (state.campaign !== "all" && lead._campaign !== state.campaign) {
            return false;
        }

        return true;
    });
}


function render() {
    const content = document.getElementById("aura-leads-v5-content");
    if (!content) {
        return;
    }

    if (state.loading) {
        renderLoading();
        return;
    }

    if (state.activeTab === "forms") {
        content.innerHTML = renderGroupsView("forms");
        bindGroupEvents();
        return;
    }

    if (state.activeTab === "sources") {
        content.innerHTML = renderGroupsView("sources");
        bindGroupEvents();
        return;
    }

    if (state.activeTab === "duplicates") {
        content.innerHTML = renderDuplicates();
        bindDuplicateEvents();
        return;
    }

    const baseLeads = state.activeTab === "priority"
        ? state.leads.filter((lead) => lead._overdue || lead._temperature === "hot")
        : state.leads;

    state.filtered = applyFilters(baseLeads);
    content.innerHTML = `
        ${renderMetrics()}
        ${renderFilters()}
        ${renderLeadTable(state.filtered)}
    `;
    bindInboxEvents();
}

function renderMetrics() {
    const total = state.leads.filter((lead) => !lead.arquivado).length;
    const hot = state.leads.filter((lead) => lead._temperature === "hot" && lead._status !== "convertido").length;
    const overdue = state.leads.filter((lead) => lead._overdue).length;
    const converted = state.leads.filter((lead) => lead._status === "convertido").length;
    const conversion = total ? Math.round((converted / total) * 1000) / 10 : 0;

    return `
        <section class="aura-leads-v5-metrics">
            <article>
                <span>Base ativa</span>
                <strong>${total.toLocaleString("pt-BR")}</strong>
                <small>Leads disponíveis</small>
            </article>
            <article data-state="hot">
                <span>Alta intenção</span>
                <strong>${hot.toLocaleString("pt-BR")}</strong>
                <small>Score igual ou maior que 75</small>
            </article>
            <article data-state="${overdue ? "danger" : "ok"}">
                <span>SLA vencido</span>
                <strong>${overdue.toLocaleString("pt-BR")}</strong>
                <small>Sem primeiro contato no prazo</small>
            </article>
            <article data-state="success">
                <span>Conversão</span>
                <strong>${conversion.toLocaleString("pt-BR")}%</strong>
                <small>${converted} lead(s) convertido(s)</small>
            </article>
        </section>
    `;
}

function renderFilters() {
    const origins = Array.from(
        new Set(
            state.leads
                .map((lead) => lead._origin)
                .filter(Boolean)
        )
    ).sort((a, b) => a.localeCompare(b, "pt-BR"));

    const campaigns = Array.from(
        new Set(
            state.leads
                .map((lead) => lead._campaign)
                .filter((value) => value && value !== "Sem campanha")
        )
    ).sort((a, b) => a.localeCompare(b, "pt-BR"));

    const renderOptions = (values, selected) => values
        .map((value) => `
            <option
                value="${escapeHTML(value)}"
                ${selected === value ? "selected" : ""}
            >
                ${escapeHTML(value)}
            </option>
        `)
        .join("");

    return `
        <section class="aura-leads-v5-filters">
            <label class="aura-leads-v5-search">
                ${svg.search}
                <input
                    id="aura-leads-v5-search"
                    type="search"
                    placeholder="Buscar nome, WhatsApp, origem, campanha ou interesse"
                    value="${escapeHTML(state.search)}"
                >
            </label>

            <select id="aura-leads-v5-status" aria-label="Filtrar por status">
                <option value="all">Todos os status</option>
                <option value="novo" ${state.status === "novo" ? "selected" : ""}>Novos</option>
                <option value="em_contato" ${state.status === "em_contato" ? "selected" : ""}>Em contato</option>
                <option value="convertido" ${state.status === "convertido" ? "selected" : ""}>Convertidos</option>
                <option value="perdido" ${state.status === "perdido" ? "selected" : ""}>Perdidos</option>
            </select>

            <select id="aura-leads-v5-temperature" aria-label="Filtrar por temperatura">
                <option value="all">Todas as temperaturas</option>
                <option value="hot" ${state.temperature === "hot" ? "selected" : ""}>Quentes</option>
                <option value="warm" ${state.temperature === "warm" ? "selected" : ""}>Mornos</option>
                <option value="cold" ${state.temperature === "cold" ? "selected" : ""}>Frios</option>
            </select>

            <select id="aura-leads-v5-origin" aria-label="Filtrar por origem">
                <option value="all">Todas as origens</option>
                ${renderOptions(origins, state.origin)}
            </select>

            <select id="aura-leads-v5-campaign" aria-label="Filtrar por campanha">
                <option value="all">Todas as campanhas</option>
                ${renderOptions(campaigns, state.campaign)}
            </select>

            <button type="button" class="aura-leads-v5-secondary" data-action="recalculate">
                ${svg.spark}
                Recalcular scores
            </button>
        </section>
    `;
}


function renderLeadTable(leads) {
    if (!leads.length) {
        return `
            <section class="aura-leads-v5-empty">
                ${svg.user}
                <h3>Nenhum lead encontrado</h3>
                <p>Ajuste os filtros ou aguarde novas capturas.</p>
            </section>
        `;
    }

    return `
        <section class="aura-leads-v5-table-wrap">
            <table class="aura-leads-v5-table">
                <thead>
                    <tr>
                        <th>Lead</th>
                        <th>Intenção</th>
                        <th>Origem</th>
                        <th>Status</th>
                        <th>SLA</th>
                        <th>Capturado</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    ${leads.map((lead) => renderLeadRow(lead)).join("")}
                </tbody>
            </table>
        </section>
    `;
}

function renderLeadRow(lead) {
    const statusLabel = STATUS_LABELS[lead._status] || "Novo";
    const temp = TEMPERATURES[lead._temperature] || TEMPERATURES.cold;
    const contact = lead.whatsapp || lead.telefone || lead.email || "Sem contato";
    const origin = lead._origin || "Direto";
    const campaign = lead._campaign || "Sem campanha";
    const interest = lead.produtoInteresse || lead.paginaOrigem || "Sem interesse informado";
    const context = campaign !== "Sem campanha"
        ? `${campaign} · ${interest}`
        : interest;

    return `
        <tr data-lead-id="${escapeHTML(lead.id)}" class="${state.selectedLeadId === lead.id ? "is-selected" : ""}">
            <td>
                <div class="aura-leads-v5-person">
                    <span class="aura-leads-v5-avatar">${escapeHTML((lead.nome || "L").charAt(0).toUpperCase())}</span>
                    <div>
                        <strong>${escapeHTML(lead.nome || "Lead sem nome")}</strong>
                        <small>${escapeHTML(contact)}</small>
                    </div>
                </div>
            </td>
            <td>
                <div class="aura-leads-v5-score" data-temperature="${lead._temperature}">
                    <span>${lead._score}</span>
                    <div>
                        <strong>${temp.label}</strong>
                        <i><b style="width:${lead._score}%"></b></i>
                    </div>
                </div>
            </td>
            <td>
                <strong class="aura-leads-v5-origin">${escapeHTML(origin)}</strong>
                <small>${escapeHTML(context)}</small>
            </td>
            <td>
                <span class="aura-leads-v5-status" data-status="${lead._status}">${statusLabel}</span>
            </td>
            <td>
                <span class="aura-leads-v5-sla-state ${lead._overdue ? "is-overdue" : ""}">
                    ${svg.clock}
                    ${lead._overdue ? "Vencido" : "No prazo"}
                </span>
            </td>
            <td>
                <strong>${formatRelative(lead._timestamp)}</strong>
                <small>${formatDate(lead._timestamp)}</small>
            </td>
            <td>
                <button type="button" class="aura-leads-v5-row-open" aria-label="Abrir lead">
                    ${svg.chevron}
                </button>
            </td>
        </tr>
    `;
}

function renderGroupsView(type) {
    const groups = type === "forms" ? state.formGroups : state.sourceGroups;
    const title = type === "forms" ? "Desempenho dos formulários" : "Desempenho das origens";
    const description = type === "forms"
        ? "Compare volume, qualidade e conversão de cada ponto de captura."
        : "Identifique quais canais trazem mais oportunidades e melhor intenção.";

    return `
        ${renderMetrics()}
        <section class="aura-leads-v5-section-heading">
            <div>
                <span>${type === "forms" ? "Captura" : "Aquisição"}</span>
                <h3>${title}</h3>
                <p>${description}</p>
            </div>
        </section>
        <section class="aura-leads-v5-group-grid">
            ${groups.length
                ? groups.map((group, index) => renderGroupCard(group, index, type)).join("")
                : `
                    <div class="aura-leads-v5-empty aura-leads-v5-empty-grid">
                        ${type === "forms" ? svg.form : svg.source}
                        <h3>Sem dados suficientes</h3>
                        <p>As próximas capturas aparecerão agrupadas aqui.</p>
                    </div>
                `
            }
        </section>
    `;
}

function renderGroupCard(group, index, type) {
    const conversion = group.total
        ? Math.round((group.converted / group.total) * 1000) / 10
        : 0;

    return `
        <article class="aura-leads-v5-group-card">
            <header>
                <span>${type === "forms" ? svg.form : svg.source}</span>
                <div>
                    <small>${type === "forms" ? "Formulário" : "Origem"}</small>
                    <h4>${escapeHTML(group.name)}</h4>
                </div>
            </header>
            <div class="aura-leads-v5-group-stats">
                <div><span>Leads</span><strong>${group.total}</strong></div>
                <div><span>Score médio</span><strong>${group.averageScore}</strong></div>
                <div><span>Quentes</span><strong>${group.hot}</strong></div>
                <div><span>Conversão</span><strong>${conversion}%</strong></div>
            </div>
            <div class="aura-leads-v5-group-progress">
                <span style="width:${Math.max(3, group.averageScore)}%"></span>
            </div>
            <button type="button" data-group-index="${index}" data-group-type="${type}">
                Ver ${group.total} lead(s)
                ${svg.chevron}
            </button>
        </article>
    `;
}

function renderDuplicates() {
    return `
        ${renderMetrics()}
        <section class="aura-leads-v5-section-heading">
            <div>
                <span>Qualidade da base</span>
                <h3>Possíveis duplicidades</h3>
                <p>Os grupos abaixo compartilham o mesmo WhatsApp ou e-mail. A mesclagem mantém o registro mais recente e arquiva os demais.</p>
            </div>
        </section>
        <section class="aura-leads-v5-duplicate-list">
            ${state.duplicateGroups.length
                ? state.duplicateGroups.map((group, index) => `
                    <article class="aura-leads-v5-duplicate-card">
                        <header>
                            <div>
                                ${svg.duplicate}
                                <span>
                                    <small>Correspondência</small>
                                    <strong>${escapeHTML(group.key.replace("phone:", "WhatsApp: ").replace("email:", "E-mail: "))}</strong>
                                </span>
                            </div>
                            <span class="aura-leads-v5-count">${group.total} registros</span>
                        </header>
                        <div class="aura-leads-v5-duplicate-people">
                            ${group.leads.map((lead, leadIndex) => `
                                <button type="button" data-open-duplicate-lead="${escapeHTML(lead.id)}" class="${leadIndex === 0 ? "is-primary" : ""}">
                                    <span class="aura-leads-v5-avatar">${escapeHTML((lead.nome || "L").charAt(0).toUpperCase())}</span>
                                    <span>
                                        <strong>${escapeHTML(lead.nome || "Lead sem nome")}</strong>
                                        <small>${formatDate(lead._timestamp)} · score ${lead._score}</small>
                                    </span>
                                    ${leadIndex === 0 ? "<em>Principal</em>" : ""}
                                </button>
                            `).join("")}
                        </div>
                        <footer>
                            <span>Campos complementares serão preservados sempre que possível.</span>
                            <button type="button" class="aura-leads-v5-primary" data-merge-group="${index}">
                                ${svg.merge}
                                Mesclar grupo
                            </button>
                        </footer>
                    </article>
                `).join("")
                : `
                    <div class="aura-leads-v5-empty">
                        ${svg.duplicate}
                        <h3>Nenhuma duplicidade detectada</h3>
                        <p>Sua base está organizada pelos dados atuais.</p>
                    </div>
                `
            }
        </section>
    `;
}

function bindInboxEvents() {
    const search = document.getElementById("aura-leads-v5-search");
    const status = document.getElementById("aura-leads-v5-status");
    const temperature = document.getElementById("aura-leads-v5-temperature");
    const origin = document.getElementById("aura-leads-v5-origin");
    const campaign = document.getElementById("aura-leads-v5-campaign");

    search?.addEventListener("input", () => {
        state.search = search.value;
        state.filtered = applyFilters(
            state.activeTab === "priority"
                ? state.leads.filter((lead) => lead._overdue || lead._temperature === "hot")
                : state.leads
        );

        const currentTable = document.querySelector(
            ".aura-leads-v5-table-wrap, .aura-leads-v5-empty"
        );

        currentTable?.replaceWith(
            htmlToElement(renderLeadTable(state.filtered))
        );

        bindTableRows();
    });

    status?.addEventListener("change", () => {
        state.status = status.value;
        render();
    });

    temperature?.addEventListener("change", () => {
        state.temperature = temperature.value;
        render();
    });

    origin?.addEventListener("change", () => {
        state.origin = origin.value;
        render();
    });

    campaign?.addEventListener("change", () => {
        state.campaign = campaign.value;
        render();
    });

    document.querySelector("[data-action='recalculate']")?.addEventListener(
        "click",
        recalculateAllScores
    );

    bindTableRows();
}


function bindTableRows() {
    document.querySelectorAll(".aura-leads-v5-table tbody tr[data-lead-id]").forEach((row) => {
        row.addEventListener("click", () => {
            state.selectedLeadId = row.dataset.leadId || "";
            renderDetail(state.selectedLeadId);
            document.querySelectorAll(".aura-leads-v5-table tbody tr").forEach((item) => {
                item.classList.toggle("is-selected", item === row);
            });
        });
    });
}

function bindGroupEvents() {
    document.querySelectorAll("[data-group-index]").forEach((button) => {
        button.addEventListener("click", () => {
            const groups = button.dataset.groupType === "forms"
                ? state.formGroups
                : state.sourceGroups;
            const group = groups[Number(button.dataset.groupIndex)];

            if (!group) {
                return;
            }

            state.activeTab = "inbox";
            state.search = "";
            state.status = "all";
            state.temperature = "all";
            state.origin = "all";
            state.campaign = "all";
            state.filtered = group.leads;

            const content = document.getElementById("aura-leads-v5-content");
            content.innerHTML = `
                <section class="aura-leads-v5-back-row">
                    <button type="button" data-back-groups>Voltar</button>
                    <div>
                        <span>Segmento</span>
                        <h3>${escapeHTML(group.name)}</h3>
                    </div>
                </section>
                ${renderLeadTable(group.leads)}
            `;

            content.querySelector("[data-back-groups]")?.addEventListener("click", () => {
                state.activeTab = button.dataset.groupType;
                render();
            });
            bindTableRows();
        });
    });
}

function bindDuplicateEvents() {
    document.querySelectorAll("[data-open-duplicate-lead]").forEach((button) => {
        button.addEventListener("click", () => {
            state.selectedLeadId = button.dataset.openDuplicateLead || "";
            renderDetail(state.selectedLeadId);
        });
    });

    document.querySelectorAll("[data-merge-group]").forEach((button) => {
        button.addEventListener("click", () => {
            const group = state.duplicateGroups[Number(button.dataset.mergeGroup)];
            if (group) {
                mergeDuplicateGroup(group);
            }
        });
    });
}

function htmlToElement(html) {
    const template = document.createElement("template");
    template.innerHTML = html.trim();
    return template.content.firstElementChild;
}

function renderDetail(leadId) {
    const host = document.getElementById("aura-leads-v5-detail");
    const lead = state.leads.find((item) => item.id === leadId);

    if (!host || !lead) {
        return;
    }

    const temp = TEMPERATURES[lead._temperature];
    const phone = lead._phone;
    const statusLabel = STATUS_LABELS[lead._status] || "Novo";

    host.innerHTML = `
        <div class="aura-leads-v5-detail-head">
            <div class="aura-leads-v5-person">
                <span class="aura-leads-v5-avatar aura-leads-v5-avatar-large">${escapeHTML((lead.nome || "L").charAt(0).toUpperCase())}</span>
                <div>
                    <small>Oportunidade selecionada</small>
                    <h3>${escapeHTML(lead.nome || "Lead sem nome")}</h3>
                    <p>${escapeHTML(lead.whatsapp || lead.telefone || lead.email || "Sem contato")}</p>
                </div>
            </div>
            <div class="aura-leads-v5-score aura-leads-v5-score-large" data-temperature="${lead._temperature}">
                <span>${lead._score}</span>
                <div>
                    <strong>${temp.label}</strong>
                    <small>Lead score</small>
                </div>
            </div>
        </div>

        <div class="aura-leads-v5-detail-actions">
            ${phone ? `
                <a href="https://wa.me/${escapeHTML(phone)}" target="_blank" rel="noopener noreferrer" class="aura-leads-v5-whatsapp">
                    ${svg.whatsapp}
                    Abrir WhatsApp
                </a>
            ` : ""}
            <button type="button" class="aura-leads-v5-secondary" data-detail-action="contacted">
                ${svg.clock}
                Registrar contato
            </button>
        </div>

        <div class="aura-leads-v5-detail-grid">
            <label>
                <span>Status</span>
                <select id="aura-leads-v5-detail-status">
                    <option value="novo" ${lead._status === "novo" ? "selected" : ""}>Novo</option>
                    <option value="em_contato" ${lead._status === "em_contato" ? "selected" : ""}>Em contato</option>
                    <option value="convertido" ${lead._status === "convertido" ? "selected" : ""}>Convertido</option>
                    <option value="perdido" ${lead._status === "perdido" ? "selected" : ""}>Perdido</option>
                </select>
            </label>
            <label>
                <span>Prioridade</span>
                <select id="aura-leads-v5-detail-priority">
                    <option value="baixa" ${lead.prioridadeLead === "baixa" ? "selected" : ""}>Baixa</option>
                    <option value="normal" ${!lead.prioridadeLead || lead.prioridadeLead === "normal" ? "selected" : ""}>Normal</option>
                    <option value="alta" ${lead.prioridadeLead === "alta" ? "selected" : ""}>Alta</option>
                </select>
            </label>
            <label>
                <span>Próximo contato</span>
                <input id="aura-leads-v5-detail-followup" type="datetime-local" value="${timestampToLocalInput(lead.proximoContatoEm || lead.lembreteTimestamp)}">
            </label>
            <label>
                <span>Etiqueta</span>
                <input id="aura-leads-v5-detail-tag" type="text" value="${escapeHTML(lead.etiqueta || "")}" placeholder="Ex.: orçamento enviado">
            </label>
        </div>

        <label class="aura-leads-v5-detail-note">
            <span>Anotação comercial</span>
            <textarea id="aura-leads-v5-detail-note" rows="5" placeholder="Registre contexto, objeções e próximos passos.">${escapeHTML(lead.anotacao || "")}</textarea>
        </label>

        <section class="aura-leads-v5-context">
            <h4>Contexto da captura</h4>
            <dl>
                <div><dt>Origem</dt><dd>${escapeHTML(lead.origem || lead.utmSource || lead.utm_source || "Direto")}</dd></div>
                <div><dt>Interesse</dt><dd>${escapeHTML(lead.produtoInteresse || "Não informado")}</dd></div>
                <div><dt>Página</dt><dd>${escapeHTML(lead.paginaOrigem || lead.urlPagina || "Não informada")}</dd></div>
                <div><dt>Formulário</dt><dd>${escapeHTML(lead.formularioNome || lead.formularioId || lead.blocoOrigem || "Captura geral")}</dd></div>
                <div><dt>Campanha</dt><dd>${escapeHTML(lead.utmCampaign || lead.utm_campaign || "Sem campanha")}</dd></div>
                <div><dt>Capturado</dt><dd>${formatDate(lead._timestamp)}</dd></div>
                <div><dt>Retenção</dt><dd>${Number(lead.tempoRetencao || 0)}s</dd></div>
                <div><dt>Cliques</dt><dd>${Number(lead.cliques || 0)}</dd></div>
            </dl>
        </section>

        <footer class="aura-leads-v5-detail-footer">
            <span>${lead._overdue ? "SLA vencido" : `Status atual: ${statusLabel}`}</span>
            <button type="button" class="aura-leads-v5-primary" data-detail-action="save">
                ${svg.save}
                Salvar alterações
            </button>
        </footer>
    `;

    host.querySelector("[data-detail-action='save']")?.addEventListener("click", saveLeadDetail);
    host.querySelector("[data-detail-action='contacted']")?.addEventListener("click", registerContact);
}

function timestampToLocalInput(value) {
    const timestamp = Number(value || 0);
    if (!timestamp) {
        return "";
    }

    const date = new Date(timestamp);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
}

async function saveLeadDetail() {
    const lead = state.leads.find((item) => item.id === state.selectedLeadId);
    if (!lead) {
        return;
    }

    const status = document.getElementById("aura-leads-v5-detail-status")?.value || "novo";
    const priority = document.getElementById("aura-leads-v5-detail-priority")?.value || "normal";
    const followupRaw = document.getElementById("aura-leads-v5-detail-followup")?.value || "";
    const tag = document.getElementById("aura-leads-v5-detail-tag")?.value.trim() || "";
    const note = document.getElementById("aura-leads-v5-detail-note")?.value.trim() || "";
    const followup = followupRaw ? new Date(followupRaw).getTime() : null;
    const updates = {
        statusLead: status,
        status,
        prioridadeLead: priority,
        proximoContatoEm: followup,
        etiqueta: tag,
        anotacao: note,
        atualizadoEm: Date.now()
    };

    try {
        await setDoc(doc(db, "leads", lead.id), updates, { merge: true });
        Object.assign(lead, updates);
        const normalized = normalizeLead(lead);
        Object.assign(lead, normalized);
        deriveGroups();
        render();
        renderDetail(lead.id);
        toast("Lead atualizado.");
    } catch (error) {
        console.error("[Aura Leads V5] Falha ao salvar lead:", error);
        toast("Não foi possível salvar o lead.", "error");
    }
}

async function registerContact() {
    const lead = state.leads.find((item) => item.id === state.selectedLeadId);
    if (!lead) {
        return;
    }

    const updates = {
        ultimoContatoEm: Date.now(),
        statusLead: lead._status === "novo" ? "em_contato" : lead._status,
        status: lead._status === "novo" ? "em_contato" : lead._status,
        atualizadoEm: Date.now()
    };

    try {
        await setDoc(doc(db, "leads", lead.id), updates, { merge: true });
        Object.assign(lead, updates);
        Object.assign(lead, normalizeLead(lead));
        deriveGroups();
        render();
        renderDetail(lead.id);
        toast("Contato registrado.");
    } catch (error) {
        console.error("[Aura Leads V5] Falha ao registrar contato:", error);
        toast("Não foi possível registrar o contato.", "error");
    }
}

async function recalculateAllScores() {
    if (!state.leads.length) {
        return;
    }

    const button = document.querySelector("[data-action='recalculate']");
    if (button) {
        button.disabled = true;
        button.textContent = "Recalculando...";
    }

    try {
        const batch = writeBatch(db);
        const timestamp = Date.now();

        for (const lead of state.leads) {
            const score = computeScore(lead);
            const temperature = temperatureFor(score);
            batch.set(
                doc(db, "leads", lead.id),
                {
                    leadScore: score,
                    temperaturaLead: temperature,
                    scoreAtualizadoEm: timestamp
                },
                { merge: true }
            );
            lead.leadScore = score;
            lead.temperaturaLead = temperature;
        }

        await batch.commit();
        state.leads = state.leads.map(normalizeLead);
        deriveGroups();
        render();
        toast("Scores recalculados.");
    } catch (error) {
        console.error("[Aura Leads V5] Falha ao recalcular scores:", error);
        toast("Não foi possível recalcular os scores.", "error");
    }
}

async function mergeDuplicateGroup(group) {
    if (!group?.leads?.length || group.leads.length < 2) {
        return;
    }

    const confirmed = window.confirm(
        `Mesclar ${group.leads.length} registros? O lead mais recente será mantido e os demais serão arquivados.`
    );

    if (!confirmed) {
        return;
    }

    const [primary, ...duplicates] = group.leads;
    const merged = {
        nome: primary.nome || duplicates.find((lead) => lead.nome)?.nome || "",
        email: primary.email || duplicates.find((lead) => lead.email)?.email || "",
        whatsapp: primary.whatsapp || duplicates.find((lead) => lead.whatsapp)?.whatsapp || "",
        telefone: primary.telefone || duplicates.find((lead) => lead.telefone)?.telefone || "",
        produtoInteresse: primary.produtoInteresse || duplicates.find((lead) => lead.produtoInteresse)?.produtoInteresse || "",
        anotacao: [
            primary.anotacao,
            ...duplicates.map((lead) => lead.anotacao)
        ].filter(Boolean).join("\n\n"),
        totalSubmissoes: group.leads.reduce(
            (total, lead) => total + Number(lead.totalSubmissoes || lead.submissoes || 1),
            0
        ),
        mescladoEm: Date.now(),
        idsMesclados: duplicates.map((lead) => lead.id)
    };

    try {
        const batch = writeBatch(db);
        batch.set(doc(db, "leads", primary.id), merged, { merge: true });

        for (const duplicate of duplicates) {
            batch.set(
                doc(db, "leads", duplicate.id),
                {
                    arquivado: true,
                    duplicadoDe: primary.id,
                    mescladoEm: Date.now()
                },
                { merge: true }
            );
        }

        await batch.commit();
        toast("Duplicidades mescladas.");
        state.selectedLeadId = primary.id;
        await loadLeads();
        state.activeTab = "duplicates";
        render();
        renderDetail(primary.id);
    } catch (error) {
        console.error("[Aura Leads V5] Falha ao mesclar duplicidades:", error);
        toast("Não foi possível mesclar os registros.", "error");
    }
}

function exportCSV() {
    const leads = state.filtered.length ? state.filtered : state.leads;

    if (!leads.length) {
        toast("Não há leads para exportar.", "error");
        return;
    }

    const rows = [[
        "Nome",
        "WhatsApp",
        "E-mail",
        "Origem",
        "Interesse",
        "Status",
        "Score",
        "Temperatura",
        "SLA vencido",
        "Página",
        "Formulário",
        "Campanha",
        "Capturado em"
    ]];

    for (const lead of leads) {
        rows.push([
            lead.nome || "",
            lead.whatsapp || lead.telefone || "",
            lead.email || "",
            lead.origem || lead.utmSource || lead.utm_source || "",
            lead.produtoInteresse || "",
            STATUS_LABELS[lead._status] || lead._status,
            lead._score,
            TEMPERATURES[lead._temperature]?.label || lead._temperature,
            lead._overdue ? "Sim" : "Não",
            lead.paginaOrigem || "",
            lead.formularioNome || lead.formularioId || lead.blocoOrigem || "",
            lead.utmCampaign || lead.utm_campaign || "",
            formatDate(lead._timestamp)
        ]);
    }

    const csv = rows
        .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(";"))
        .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], {
        type: "text/csv;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `aura_leads_v5_${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast("CSV exportado.");
}

function renderLoading() {
    const content = document.getElementById("aura-leads-v5-content");
    if (!content) {
        return;
    }

    content.innerHTML = `
        <section class="aura-leads-v5-loading">
            <span></span>
            <h3>Carregando operação</h3>
            <p>Organizando leads, scores, SLA e origens.</p>
        </section>
    `;
}

function renderError(message) {
    const content = document.getElementById("aura-leads-v5-content");
    if (!content) {
        return;
    }

    content.innerHTML = `
        <section class="aura-leads-v5-empty">
            ${svg.user}
            <h3>Não foi possível carregar</h3>
            <p>${escapeHTML(message)}</p>
            <button type="button" class="aura-leads-v5-primary" data-retry>Repetir</button>
        </section>
    `;
    content.querySelector("[data-retry]")?.addEventListener("click", loadLeads);
}

async function initialize(user) {
    if (!user || state.initialized) {
        return;
    }

    state.user = user;
    state.ownerUid = ownerUidFromContext(user);
    loadSLA();
    injectEntryButton();
    injectModal();
    state.initialized = true;

    window.addEventListener("pagehide", (event) => {
        if (!event.persisted) {
            teardownModalLifecycle();
        }
    }, { signal: getLifecycleSignal() });

    window.AuraLeadsV5 = {
        version: VERSION,
        open: openModal,
        close: closeModal,
        reload: loadLeads,
        destroy: teardownModalLifecycle,
        getState: () => ({
            ownerUid: state.ownerUid,
            total: state.leads.length,
            duplicates: state.duplicateGroups.length,
            slaMinutes: state.slaMinutes,
            modalOpen: state.modalOpen
        })
    };

    console.info(`[Vide Aura Leads V5] Inicializado — ${state.ownerUid}`);
}

onAuthStateChanged(auth, (user) => {
    if (user) {
        initialize(user);
    }
});
