/**
 * Vide Aura — Pedidos & Vendas V1.0
 * Central em página inteira integrada ao checkout público e aos pedidos legados.
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

const VERSION = "1.0.0";
const MAX_HISTORY = 40;

const STAGES = Object.freeze([
    { id: "novo", label: "Novo" },
    { id: "confirmado", label: "Confirmado" },
    { id: "em_producao", label: "Em produção" },
    { id: "pronto", label: "Pronto" },
    { id: "enviado", label: "Enviado" },
    { id: "entregue", label: "Entregue" },
    { id: "cancelado", label: "Cancelado" }
]);

const PAYMENT_LABELS = Object.freeze({
    pendente: "Pendente",
    parcial: "Parcial",
    pago: "Pago",
    reembolsado: "Reembolsado"
});

const state = {
    user: null,
    ownerUid: "",
    canView: false,
    canEdit: false,
    actorName: "Equipe",
    team: [],
    leadRecords: [],
    legacyRecords: [],
    orders: [],
    activeTab: "overview",
    selectedId: "",
    search: "",
    status: "all",
    payment: "all",
    delivery: "all",
    loadingLegacy: true,
    leadsReady: false,
    legacyReady: false,
    unsubscribeLegacy: null,
    searchTimer: null,
    initialized: false
};

const icons = {
    box: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z"></path><path d="m4 7.5 8 4.5 8-4.5M12 12v9"></path></svg>`,
    refresh: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"></path><path d="M20 4v7h-7"></path></svg>`,
    export: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M5 21h14"></path></svg>`,
    search: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path></svg>`,
    board: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="5" height="16" rx="1"></rect><rect x="10" y="4" width="5" height="11" rx="1"></rect><rect x="17" y="4" width="4" height="14" rx="1"></rect></svg>`,
    chart: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"></path></svg>`,
    money: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M15 8.5c-.6-.7-1.6-1-3-1-1.7 0-3 .8-3 2s1.3 2 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.5-.4-3.2-1.2M12 5v14"></path></svg>`,
    truck: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z"></path><circle cx="7" cy="18" r="2"></circle><circle cx="18" cy="18" r="2"></circle></svg>`,
    user: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path></svg>`,
    back: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"></path></svg>`,
    whatsapp: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.4-4A8 8 0 1 1 20 11.5Z"></path><path d="M9 8.5c.3 2.4 2.1 4.2 4.5 4.7"></path></svg>`,
    print: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><path d="M6 14h12v7H6z"></path></svg>`,
    save: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h12l2 2v16H5z"></path><path d="M8 3v6h8V3M8 21v-7h8v7"></path></svg>`
};

function esc(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function normalizeText(value) {
    return String(value || "").trim().toLowerCase().normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function num(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const parsed = Number(String(value || "").replace(/\./g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
}

function ts(value) {
    if (!value) return 0;
    if (typeof value?.toMillis === "function") return value.toMillis();
    if (typeof value?.seconds === "number") return value.seconds * 1000;
    if (typeof value === "number") return value < 100000000000 ? value * 1000 : value;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
    return num(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dateTime(value) {
    const time = ts(value);
    if (!time) return "—";
    return new Date(time).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function dateInput(value) {
    const time = ts(value);
    if (!time) return "";
    const date = new Date(time);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
}

function phone(value) {
    let digits = String(value || "").replace(/\D/g, "");
    if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
    return digits;
}

function stageLabel(value) {
    return STAGES.find((stage) => stage.id === value)?.label || "Novo";
}

function normalizeStage(value) {
    const raw = normalizeText(value).replace(/\s+/g, "_");
    if (["confirmado", "confirmada"].includes(raw)) return "confirmado";
    if (["em_producao", "producao", "produzindo"].includes(raw)) return "em_producao";
    if (["pronto", "pronta"].includes(raw)) return "pronto";
    if (["enviado", "enviada", "despachado"].includes(raw)) return "enviado";
    if (["entregue", "pago"].includes(raw)) return "entregue";
    if (["cancelado", "cancelada"].includes(raw)) return "cancelado";
    return "novo";
}

function normalizePayment(value, legacyStatus = "") {
    const raw = normalizeText(value);
    if (raw === "pago" || normalizeText(legacyStatus) === "pago") return "pago";
    if (raw === "parcial") return "parcial";
    if (raw === "reembolsado") return "reembolsado";
    return "pendente";
}

function normalizeItems(items, fallbackText = "") {
    const valid = Array.isArray(items) ? items.slice(0, 20).map((item, index) => ({
        produtoId: String(item?.produtoId || item?.id || `item_${index + 1}`).slice(0, 180),
        nomeSnapshot: String(item?.nomeSnapshot || item?.nome || "Produto").slice(0, 160),
        precoSnapshot: Math.max(0, num(item?.precoSnapshot ?? item?.preco)),
        quantidade: Math.max(1, Math.min(999, Math.round(num(item?.quantidade) || 1)))
    })) : [];
    if (valid.length) return valid;
    return String(fallbackText || "").split(",").map((name, index) => name.trim()).filter(Boolean).slice(0, 20).map((name, index) => ({
        produtoId: `texto_${index + 1}`,
        nomeSnapshot: name.slice(0, 160),
        precoSnapshot: 0,
        quantidade: 1
    }));
}

function subtotalItems(items) {
    return items.reduce((total, item) => total + item.precoSnapshot * item.quantidade, 0);
}

function orderSearch(order) {
    return normalizeText([
        order.number, order.customer, order.whatsapp, order.email,
        order.productsText, order.origin, order.campaign,
        order.status, order.payment, order.delivery, order.responsibleName
    ].filter(Boolean).join(" "));
}

function historyList(raw) {
    return Array.isArray(raw) ? raw.filter((entry) => entry && typeof entry === "object").slice(-MAX_HISTORY) : [];
}

function normalizeLeadOrder(lead) {
    const snapshot = lead.pedidoSnapshot && typeof lead.pedidoSnapshot === "object" ? lead.pedidoSnapshot : {};
    const items = normalizeItems(snapshot.itens || lead.itensPedido, lead.produtoInteresse);
    const subtotal = Math.max(0, num(snapshot.subtotal) || subtotalItems(items) || num(snapshot.total) || num(lead.valorOportunidade));
    const discount = Math.max(0, num(lead.pedidoDesconto ?? snapshot.desconto));
    const freight = Math.max(0, num(lead.pedidoFrete ?? snapshot.frete));
    const total = Math.max(0, num(lead.valorOportunidade) || num(snapshot.total) || subtotal - discount + freight);
    const status = normalizeStage(lead.pedidoStatus || snapshot.statusPedido || "novo");
    const payment = normalizePayment(lead.pagamentoStatus || snapshot.statusPagamento);
    const created = ts(lead.pedidoCriadoEm || snapshot.criadoEm || lead.criadoEm || lead.data);
    const order = {
        id: lead.id,
        leadId: lead.id,
        legacyId: String(lead.pedidoVinculadoId || ""),
        source: "lead",
        number: String(lead.numeroPedido || snapshot.numeroPedido || `PED-${String(lead.id).slice(-6).toUpperCase()}`),
        customer: String(snapshot.clienteNome || lead.nome || "Cliente"),
        whatsapp: String(snapshot.clienteWhatsapp || lead.whatsapp || lead.telefone || ""),
        email: String(lead.email || ""),
        items,
        productsText: String(snapshot.produtosTexto || lead.produtoInteresse || items.map((item) => `${item.quantidade}x ${item.nomeSnapshot}`).join(", ")),
        subtotal,
        discount,
        freight,
        total,
        status,
        payment,
        delivery: String(snapshot.tipoRecebimento || lead.pedidoTipoRecebimento || "retirada"),
        cep: String(snapshot.cep || ""),
        address: String(snapshot.endereco || ""),
        customerNotes: String(snapshot.observacoes || ""),
        internalNotes: String(lead.pedidoObservacoesInternas || ""),
        responsibleUid: String(lead.pedidoResponsavelUid || ""),
        responsibleName: String(lead.pedidoResponsavelNome || ""),
        dueDate: ts(lead.pedidoPrazoEntrega),
        origin: String(lead.origem || lead.utmSource || "Direto"),
        campaign: String(lead.utmCampaign || "Sem campanha"),
        created,
        updated: ts(lead.pedidoAtualizadoEm || lead.atualizadoEm),
        history: historyList(lead.pedidoHistorico),
        rawLead: lead,
        rawLegacy: null
    };
    order.search = orderSearch(order);
    return order;
}

function normalizeLegacyOrder(raw) {
    const items = normalizeItems(raw.itens, raw.produtos);
    const subtotal = subtotalItems(items) || num(raw.valor);
    const status = normalizeStage(raw.status);
    const payment = normalizePayment(raw.pagamentoStatus, raw.status);
    const order = {
        id: raw.id,
        leadId: "",
        legacyId: raw.id,
        source: "legacy",
        number: String(raw.numeroPedido || `PED-${String(raw.id).slice(-6).toUpperCase()}`),
        customer: String(raw.cliente || "Cliente"),
        whatsapp: String(raw.whatsapp || raw.telefone || ""),
        email: String(raw.email || ""),
        items,
        productsText: String(raw.produtos || items.map((item) => `${item.quantidade}x ${item.nomeSnapshot}`).join(", ")),
        subtotal,
        discount: 0,
        freight: 0,
        total: Math.max(0, num(raw.valor)),
        status,
        payment,
        delivery: String(raw.tipoRecebimento || "não informado"),
        cep: String(raw.cep || ""),
        address: String(raw.endereco || ""),
        customerNotes: String(raw.obs || ""),
        internalNotes: String(raw.obs || ""),
        responsibleUid: "",
        responsibleName: "",
        dueDate: ts(raw.prazoEntrega),
        origin: String(raw.origem || "Cadastro interno"),
        campaign: String(raw.campanha || "Sem campanha"),
        created: ts(raw.data || raw.criadoEm),
        updated: ts(raw.statusAtualizadoEm),
        history: [],
        rawLead: null,
        rawLegacy: raw
    };
    order.search = orderSearch(order);
    return order;
}

function isOrderLead(lead) {
    return Boolean(
        lead?.pedidoSnapshot || lead?.numeroPedido || lead?.tipoRegistro === "pedido" ||
        normalizeText(lead?.tipoCaptura) === "checkout_whatsapp"
    );
}

function rebuildOrders() {
    const map = new Map();
    state.leadRecords.filter(isOrderLead).forEach((lead) => {
        const order = normalizeLeadOrder(lead);
        map.set(order.id, order);
    });
    state.legacyRecords.forEach((raw) => {
        const legacy = normalizeLegacyOrder(raw);
        const existing = map.get(legacy.id);
        if (existing) {
            existing.legacyId = legacy.id;
            existing.rawLegacy = raw;
            if (!existing.items.length) existing.items = legacy.items;
            if (!existing.total) existing.total = legacy.total;
            if (!existing.productsText) existing.productsText = legacy.productsText;
            existing.search = orderSearch(existing);
        } else {
            map.set(legacy.id, legacy);
        }
    });
    state.orders = Array.from(map.values()).sort((a, b) => b.created - a.created);
    render();
}

function ownerUidFromContext(user) {
    const params = new URLSearchParams(window.location.search);
    let contextUid = "";
    try {
        const context = window.VideHubContext?.getSnapshot?.();
        contextUid = String(context?.effectiveUid || context?.ownerUid || context?.tenantId || "").trim();
    } catch (error) {}
    return String(params.get("masterUID") || contextUid || user?.uid || "").trim();
}

async function resolveOwnerUid(user) {
    const contextual = ownerUidFromContext(user);
    if (contextual && contextual !== user.uid) return contextual;
    try {
        const employeeSnap = await getDoc(doc(db, "funcionarios", user.uid));
        if (employeeSnap.exists()) {
            const employee = employeeSnap.data();
            if (employee.status === "ativo" && employee.donoUID) return String(employee.donoUID);
        }
    } catch (error) {}
    return contextual || user.uid;
}

function permissionIncludes(list) {
    return Array.isArray(list) && (list.includes("pedidos") || list.includes("vendas"));
}

async function loadAccess(user) {
    state.canView = user.uid === state.ownerUid;
    state.canEdit = state.canView;
    state.actorName = user.displayName || user.email || "Equipe";
    if (state.canView) return;
    try {
        const snap = await getDoc(doc(db, "funcionarios", user.uid));
        if (!snap.exists()) return;
        const employee = snap.data();
        const permissions = employee.permissoes || {};
        const active = employee.status === "ativo" && employee.donoUID === state.ownerUid;
        state.canView = active && (permissionIncludes(permissions.ver) || permissionIncludes(permissions.editar));
        state.canEdit = active && permissionIncludes(permissions.editar);
        state.actorName = employee.nome || state.actorName;
    } catch (error) {
        console.warn("[Aura Pedidos] Permissão não carregada.", error);
    }
}

async function loadTeam() {
    const map = new Map();
    map.set(state.ownerUid, { uid: state.ownerUid, nome: "Proprietário" });
    try {
        const snapshot = await getDocs(query(collection(db, "funcionarios"), where("donoUID", "==", state.ownerUid)));
        snapshot.forEach((item) => {
            const employee = item.data();
            if (employee.status === "ativo") map.set(item.id, { uid: item.id, nome: employee.nome || employee.email || "Funcionário" });
        });
    } catch (error) {}
    state.team = Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

function ensureView() {
    const view = document.getElementById("view-pedidos");
    if (!view) return null;
    const active = view.classList.contains("active");
    view.className = `view-section aura-orders-v1-view${active ? " active" : ""}`;
    view.innerHTML = `
        <section class="aura-orders-v1-shell">
            <header class="aura-orders-v1-header">
                <div class="aura-orders-v1-brand"><span>${icons.box}</span><div><small>Aura Operations</small><h1>Pedidos & Vendas</h1><p>Operação comercial do pedido ao recebimento.</p></div></div>
                <div class="aura-orders-v1-header-actions">
                    <span id="aura-orders-v1-sync" class="aura-orders-v1-sync"><i></i> Sincronizando</span>
                    <button type="button" data-orders-action="refresh">${icons.refresh}<span>Atualizar</span></button>
                    <button type="button" data-orders-action="export">${icons.export}<span>Exportar</span></button>
                </div>
            </header>
            <nav class="aura-orders-v1-tabs" aria-label="Áreas de pedidos">
                <button type="button" data-orders-tab="overview" class="is-active">Visão geral</button>
                <button type="button" data-orders-tab="all">Todos os pedidos</button>
                <button type="button" data-orders-tab="kanban">Kanban</button>
                <button type="button" data-orders-tab="payments">Pagamentos</button>
                <button type="button" data-orders-tab="deliveries">Entregas</button>
                <button type="button" data-orders-tab="products">Produtos</button>
                <button type="button" data-orders-tab="reports">Relatórios</button>
            </nav>
            <div id="aura-orders-v1-content" class="aura-orders-v1-content"></div>
        </section>`;
    bindView(view);
    return view;
}

function syncBadge() {
    const badge = document.getElementById("aura-orders-v1-sync");
    if (!badge) return;
    const ready = state.leadsReady && state.legacyReady;
    badge.classList.toggle("is-ready", ready);
    badge.innerHTML = `<i></i> ${ready ? "Sincronizado" : "Sincronizando"}`;
}

function metrics() {
    const active = state.orders.filter((order) => order.status !== "cancelado");
    const paid = active.filter((order) => order.payment === "pago");
    const revenue = paid.reduce((sum, order) => sum + order.total, 0);
    const openValue = active.filter((order) => order.payment !== "pago").reduce((sum, order) => sum + order.total, 0);
    const average = paid.length ? revenue / paid.length : 0;
    const pending = active.filter((order) => !["entregue"].includes(order.status)).length;
    return { total: state.orders.length, revenue, openValue, average, pending, paid: paid.length };
}

function renderMetrics() {
    const data = metrics();
    return `<section class="aura-orders-v1-metrics">
        <article><span>Pedidos</span><strong>${data.total}</strong><small>${data.pending} em andamento</small></article>
        <article data-tone="success"><span>Receita recebida</span><strong>${money(data.revenue)}</strong><small>${data.paid} pagamento(s) confirmado(s)</small></article>
        <article data-tone="warning"><span>A receber</span><strong>${money(data.openValue)}</strong><small>Pedidos não cancelados</small></article>
        <article data-tone="info"><span>Ticket médio</span><strong>${money(data.average)}</strong><small>Com base nos pedidos pagos</small></article>
    </section>`;
}

function filteredOrders(base = state.orders) {
    const search = normalizeText(state.search);
    return base.filter((order) => {
        if (search && !order.search.includes(search)) return false;
        if (state.status !== "all" && order.status !== state.status) return false;
        if (state.payment !== "all" && order.payment !== state.payment) return false;
        if (state.delivery !== "all" && order.delivery !== state.delivery) return false;
        return true;
    });
}

function renderFilters() {
    return `<section class="aura-orders-v1-filters">
        <label>${icons.search}<input id="aura-orders-v1-search" type="search" value="${esc(state.search)}" placeholder="Buscar cliente, número, produto ou campanha"></label>
        <select id="aura-orders-v1-status"><option value="all">Todos os status</option>${STAGES.map((item) => `<option value="${item.id}" ${state.status === item.id ? "selected" : ""}>${item.label}</option>`).join("")}</select>
        <select id="aura-orders-v1-payment"><option value="all">Todos os pagamentos</option>${Object.entries(PAYMENT_LABELS).map(([id, label]) => `<option value="${id}" ${state.payment === id ? "selected" : ""}>${label}</option>`).join("")}</select>
        <select id="aura-orders-v1-delivery"><option value="all">Todas as entregas</option><option value="retirada" ${state.delivery === "retirada" ? "selected" : ""}>Retirada</option><option value="entrega" ${state.delivery === "entrega" ? "selected" : ""}>Entrega</option><option value="não informado" ${state.delivery === "não informado" ? "selected" : ""}>Não informado</option></select>
    </section>`;
}

function renderTable(orders) {
    if (!orders.length) return `<section class="aura-orders-v1-empty">${icons.box}<h3>Nenhum pedido encontrado</h3><p>Os pedidos concluídos pela loja aparecerão aqui automaticamente.</p></section>`;
    return `<section class="aura-orders-v1-table-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Produtos</th><th>Total</th><th>Status</th><th>Pagamento</th><th>Recebimento</th><th>Data</th><th></th></tr></thead><tbody>${orders.map((order) => `<tr data-open-order="${esc(order.id)}"><td><strong>${esc(order.number)}</strong><small>${esc(order.origin)}</small></td><td><strong>${esc(order.customer)}</strong><small>${esc(order.whatsapp || order.email || "Sem contato")}</small></td><td><strong>${esc(order.items[0]?.nomeSnapshot || order.productsText || "Pedido")}</strong><small>${order.items.length} item(ns)</small></td><td><strong>${money(order.total)}</strong><small>Subtotal ${money(order.subtotal)}</small></td><td><span class="aura-orders-v1-status" data-status="${order.status}">${stageLabel(order.status)}</span></td><td><span class="aura-orders-v1-payment" data-payment="${order.payment}">${PAYMENT_LABELS[order.payment]}</span></td><td><strong>${esc(order.delivery === "entrega" ? "Entrega" : order.delivery === "retirada" ? "Retirada" : "Não informado")}</strong><small>${esc(order.address || order.cep || "")}</small></td><td><strong>${dateTime(order.created)}</strong><small>${esc(order.campaign)}</small></td><td><button type="button" aria-label="Abrir pedido">›</button></td></tr>`).join("")}</tbody></table></section>`;
}

function renderOverview() {
    const recent = filteredOrders().slice(0, 12);
    return `${renderMetrics()}${renderFilters()}<div class="aura-orders-v1-section-title"><div><small>Operação recente</small><h2>Últimos pedidos</h2></div><button type="button" data-orders-tab-jump="all">Ver todos</button></div>${renderTable(recent)}`;
}

function renderKanban() {
    const orders = filteredOrders();
    return `${renderMetrics()}${renderFilters()}<section class="aura-orders-v1-kanban">${STAGES.map((stage) => {
        const list = orders.filter((order) => order.status === stage.id);
        const value = list.reduce((sum, order) => sum + order.total, 0);
        return `<article class="aura-orders-v1-column" data-drop-status="${stage.id}"><header><div><i data-stage="${stage.id}"></i><strong>${stage.label}</strong></div><span>${list.length}</span></header><p>${money(value)}</p><div>${list.length ? list.map(renderCard).join("") : `<div class="aura-orders-v1-column-empty">Solte um pedido aqui</div>`}</div></article>`;
    }).join("")}</section>`;
}

function renderCard(order) {
    return `<article class="aura-orders-v1-card" draggable="${state.canEdit ? "true" : "false"}" data-drag-order="${esc(order.id)}" data-open-order="${esc(order.id)}"><header><strong>${esc(order.number)}</strong><b>${money(order.total)}</b></header><h3>${esc(order.customer)}</h3><p>${esc(order.items[0]?.nomeSnapshot || order.productsText || "Pedido")}</p><div><span>${PAYMENT_LABELS[order.payment]}</span><span>${order.delivery === "entrega" ? "Entrega" : "Retirada"}</span></div><select data-move-order="${esc(order.id)}" ${state.canEdit ? "" : "disabled"}>${STAGES.map((stage) => `<option value="${stage.id}" ${order.status === stage.id ? "selected" : ""}>${stage.label}</option>`).join("")}</select></article>`;
}

function renderPayments() {
    const orders = filteredOrders();
    return `${renderMetrics()}${renderFilters()}<section class="aura-orders-v1-group-grid">${Object.entries(PAYMENT_LABELS).map(([id, label]) => {
        const list = orders.filter((order) => order.payment === id);
        return `<article><header><span>${label}</span><strong>${list.length}</strong></header><h3>${money(list.reduce((sum, order) => sum + order.total, 0))}</h3><div>${list.slice(0, 8).map((order) => `<button type="button" data-open-order="${esc(order.id)}"><span><strong>${esc(order.number)}</strong><small>${esc(order.customer)}</small></span><b>${money(order.total)}</b></button>`).join("") || `<p>Sem pedidos.</p>`}</div></article>`;
    }).join("")}</section>`;
}

function renderDeliveries() {
    const orders = filteredOrders().filter((order) => order.status !== "cancelado");
    return `${renderMetrics()}${renderFilters()}<section class="aura-orders-v1-delivery-list">${orders.length ? orders.map((order) => `<article data-open-order="${esc(order.id)}"><span>${icons.truck}</span><div><strong>${esc(order.number)} · ${esc(order.customer)}</strong><p>${esc(order.delivery === "entrega" ? order.address || order.cep || "Endereço não informado" : "Retirada no local")}</p></div><em>${stageLabel(order.status)}</em><b>${order.dueDate ? dateTime(order.dueDate) : "Sem prazo"}</b></article>`).join("") : `<div class="aura-orders-v1-empty">${icons.truck}<h3>Nenhuma entrega encontrada</h3></div>`}</section>`;
}

function productRows() {
    const map = new Map();
    state.orders.filter((order) => order.status !== "cancelado").forEach((order) => order.items.forEach((item) => {
        const key = item.produtoId || normalizeText(item.nomeSnapshot);
        const current = map.get(key) || { name: item.nomeSnapshot, quantity: 0, revenue: 0, orders: new Set() };
        current.quantity += item.quantidade;
        current.revenue += item.precoSnapshot * item.quantidade;
        current.orders.add(order.id);
        map.set(key, current);
    }));
    return Array.from(map.values()).sort((a, b) => b.quantity - a.quantity);
}

function renderProducts() {
    const rows = productRows();
    return `${renderMetrics()}<section class="aura-orders-v1-ranking"><header><div><small>Catálogo</small><h2>Produtos mais vendidos</h2></div><span>${rows.length} produto(s)</span></header>${rows.length ? rows.map((row, index) => `<article><b>${index + 1}</b><div><strong>${esc(row.name)}</strong><small>${row.orders.size} pedido(s)</small></div><span>${row.quantity} un.</span><em>${money(row.revenue)}</em></article>`).join("") : `<div class="aura-orders-v1-empty">${icons.box}<h3>Ainda não há itens estruturados</h3></div>`}</section>`;
}

function aggregateBy(resolver) {
    const map = new Map();
    state.orders.forEach((order) => {
        const key = resolver(order) || "Não informado";
        const current = map.get(key) || { name: key, total: 0, revenue: 0, paid: 0 };
        current.total += 1;
        current.revenue += order.total;
        if (order.payment === "pago") current.paid += order.total;
        map.set(key, current);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

function reportTable(title, rows) {
    return `<article class="aura-orders-v1-report"><header><h3>${esc(title)}</h3><span>${rows.length} grupo(s)</span></header><div class="is-head"><span>Nome</span><span>Pedidos</span><span>Total</span><span>Recebido</span></div>${rows.slice(0, 12).map((row) => `<div><strong>${esc(row.name)}</strong><span>${row.total}</span><span>${money(row.revenue)}</span><span>${money(row.paid)}</span></div>`).join("") || `<p>Sem dados.</p>`}</article>`;
}

function renderReports() {
    const byOrigin = aggregateBy((order) => order.origin);
    const byCampaign = aggregateBy((order) => order.campaign);
    const byResponsible = aggregateBy((order) => order.responsibleName || "Sem responsável");
    return `${renderMetrics()}<section class="aura-orders-v1-reports">${reportTable("Origens", byOrigin)}${reportTable("Campanhas", byCampaign)}${reportTable("Responsáveis", byResponsible)}</section>`;
}

function teamOptions(selected) {
    return `<option value="">Sem responsável</option>${state.team.map((person) => `<option value="${esc(person.uid)}" ${selected === person.uid ? "selected" : ""}>${esc(person.nome)}</option>`).join("")}`;
}

function renderHistory(order) {
    const entries = order.history.length ? [...order.history].sort((a, b) => ts(b.timestamp) - ts(a.timestamp)) : [{ titulo: "Pedido registrado", detalhe: `${order.origin} · ${order.campaign}`, timestamp: order.created, autorNome: "Loja online" }];
    return `<section class="aura-orders-v1-history"><header><h3>Histórico do pedido</h3><span>${entries.length} evento(s)</span></header>${entries.map((entry) => `<article><i></i><div><strong>${esc(entry.titulo || "Atualização")}</strong><p>${esc(entry.detalhe || "")}</p><small>${dateTime(entry.timestamp)} · ${esc(entry.autorNome || "Equipe")}</small></div></article>`).join("")}</section>`;
}

function renderDetail(order) {
    const total = Math.max(0, order.subtotal - order.discount + order.freight);
    return `<div class="aura-orders-v1-detail">
        <button type="button" class="aura-orders-v1-back" data-orders-action="back">${icons.back} Voltar para pedidos</button>
        <section class="aura-orders-v1-detail-hero"><div><small>Pedido ativo</small><h2>${esc(order.number)}</h2><p>${esc(order.customer)} · ${esc(order.whatsapp || "Sem WhatsApp")}</p></div><div><span>Total do pedido</span><strong id="aura-orders-v1-total-preview">${money(total)}</strong><em class="aura-orders-v1-status" data-status="${order.status}">${stageLabel(order.status)}</em></div></section>
        <section class="aura-orders-v1-detail-actions"><button type="button" data-orders-action="whatsapp" class="is-whatsapp">${icons.whatsapp} Abrir WhatsApp</button><button type="button" data-orders-action="print">${icons.print} Imprimir comprovante</button></section>
        <div class="aura-orders-v1-detail-grid">
            <main>
                <section class="aura-orders-v1-panel"><header><small>Gestão</small><h3>Status e próximos passos</h3></header><div class="aura-orders-v1-form-grid">
                    <label><span>Status do pedido</span><select id="aura-orders-v1-detail-status" ${state.canEdit ? "" : "disabled"}>${STAGES.map((stage) => `<option value="${stage.id}" ${order.status === stage.id ? "selected" : ""}>${stage.label}</option>`).join("")}</select></label>
                    <label><span>Pagamento</span><select id="aura-orders-v1-detail-payment" ${state.canEdit ? "" : "disabled"}>${Object.entries(PAYMENT_LABELS).map(([id, label]) => `<option value="${id}" ${order.payment === id ? "selected" : ""}>${label}</option>`).join("")}</select></label>
                    <label><span>Responsável</span><select id="aura-orders-v1-detail-responsible" ${state.canEdit ? "" : "disabled"}>${teamOptions(order.responsibleUid)}</select></label>
                    <label><span>Prazo previsto</span><input id="aura-orders-v1-detail-due" type="date" value="${dateInput(order.dueDate)}" ${state.canEdit ? "" : "disabled"}></label>
                    <label><span>Desconto</span><input id="aura-orders-v1-detail-discount" type="number" min="0" step="0.01" value="${order.discount || ""}" ${state.canEdit ? "" : "disabled"}></label>
                    <label><span>Frete</span><input id="aura-orders-v1-detail-freight" type="number" min="0" step="0.01" value="${order.freight || ""}" ${state.canEdit ? "" : "disabled"}></label>
                </div><label class="aura-orders-v1-note"><span>Observações internas</span><textarea id="aura-orders-v1-detail-notes" rows="4" ${state.canEdit ? "" : "disabled"}>${esc(order.internalNotes)}</textarea></label></section>
                <section class="aura-orders-v1-panel"><header><small>Itens</small><h3>Resumo do pedido</h3></header><div class="aura-orders-v1-items">${order.items.map((item) => `<article><div><strong>${item.quantidade}x ${esc(item.nomeSnapshot)}</strong><small>${money(item.precoSnapshot)} por unidade</small></div><b>${money(item.precoSnapshot * item.quantidade)}</b></article>`).join("") || `<p>Itens não estruturados: ${esc(order.productsText)}</p>`}<footer><span>Subtotal</span><strong>${money(order.subtotal)}</strong></footer></div></section>
                ${state.canEdit ? `<button type="button" class="aura-orders-v1-save" data-orders-action="save">${icons.save} Salvar pedido</button>` : ""}
            </main>
            <aside>
                <section class="aura-orders-v1-panel"><header><small>Cliente</small><h3>Dados e recebimento</h3></header><dl><div><dt>Nome</dt><dd>${esc(order.customer)}</dd></div><div><dt>WhatsApp</dt><dd>${esc(order.whatsapp || "—")}</dd></div><div><dt>Recebimento</dt><dd>${esc(order.delivery)}</dd></div><div><dt>CEP</dt><dd>${esc(order.cep || "—")}</dd></div><div><dt>Endereço</dt><dd>${esc(order.address || "—")}</dd></div><div><dt>Observações</dt><dd>${esc(order.customerNotes || "—")}</dd></div></dl></section>
                <section class="aura-orders-v1-panel"><header><small>Atribuição</small><h3>Origem comercial</h3></header><dl><div><dt>Origem</dt><dd>${esc(order.origin)}</dd></div><div><dt>Campanha</dt><dd>${esc(order.campaign)}</dd></div><div><dt>Capturado</dt><dd>${dateTime(order.created)}</dd></div><div><dt>Responsável</dt><dd>${esc(order.responsibleName || "Sem responsável")}</dd></div></dl></section>
                ${renderHistory(order)}
            </aside>
        </div>
    </div>`;
}

function render() {
    const content = document.getElementById("aura-orders-v1-content");
    if (!content) return;
    syncBadge();
    document.querySelectorAll("[data-orders-tab]").forEach((button) => button.classList.toggle("is-active", button.dataset.ordersTab === state.activeTab));
    if (!state.canView) {
        content.innerHTML = `<section class="aura-orders-v1-empty">${icons.user}<h3>Acesso não liberado</h3><p>Esta conta não possui permissão para visualizar Pedidos.</p></section>`;
        return;
    }
    if (!state.leadsReady && !state.legacyReady) {
        content.innerHTML = `<section class="aura-orders-v1-loading"><i></i><h3>Sincronizando pedidos</h3><p>Organizando vendas, pagamentos e entregas.</p></section>`;
        return;
    }
    if (state.selectedId) {
        const order = state.orders.find((item) => item.id === state.selectedId);
        if (order) content.innerHTML = renderDetail(order);
        else state.selectedId = "";
        if (order) return;
    }
    if (state.activeTab === "kanban") content.innerHTML = renderKanban();
    else if (state.activeTab === "payments") content.innerHTML = renderPayments();
    else if (state.activeTab === "deliveries") content.innerHTML = renderDeliveries();
    else if (state.activeTab === "products") content.innerHTML = renderProducts();
    else if (state.activeTab === "reports") content.innerHTML = renderReports();
    else if (state.activeTab === "all") content.innerHTML = `${renderMetrics()}${renderFilters()}${renderTable(filteredOrders())}`;
    else content.innerHTML = renderOverview();
}

function eventEntry(title, detail) {
    return { titulo: title, detalhe: detail, timestamp: Date.now(), autorUid: state.user?.uid || "", autorNome: state.actorName };
}

function legacyStatus(status, payment) {
    if (status === "cancelado") return "cancelado";
    if (payment === "pago") return "pago";
    if (status === "novo") return "aguardando";
    return "confirmado";
}

function legacyPayload(order, patch = {}) {
    const merged = { ...order, ...patch };
    const items = normalizeItems(merged.items, merged.productsText);
    const subtotal = subtotalItems(items) || merged.subtotal;
    const total = Math.max(0, subtotal - num(merged.discount) + num(merged.freight));
    const raw = order.rawLegacy || {};
    const payload = {
        cliente: String(merged.customer || "Cliente").slice(0, 160),
        produtos: String(merged.productsText || items.map((item) => `${item.nomeSnapshot}${item.quantidade > 1 ? ` x${item.quantidade}` : ""}`).join(", ") || "Pedido").slice(0, 2000),
        valor: total,
        status: legacyStatus(merged.status, merged.payment),
        obs: String(merged.internalNotes || merged.customerNotes || "").slice(0, 2000),
        criadoPor: state.ownerUid,
        data: order.created || Date.now(),
        statusAtualizadoEm: Date.now(),
        itens: items,
        prazoEntrega: merged.dueDate || null
    };
    if (raw.clienteId) payload.clienteId = String(raw.clienteId);
    return payload;
}

function leadStageForOrder(status) {
    if (status === "entregue") return "convertido";
    if (status === "cancelado") return "perdido";
    if (["pronto", "enviado"].includes(status)) return "proposta";
    if (["confirmado", "em_producao"].includes(status)) return "em_contato";
    return "novo";
}

async function persistOrder(order, patch, title) {
    if (!state.canEdit) return toast("Acesso somente para consulta.", "error");
    const merged = { ...order, ...patch };
    const teamMember = state.team.find((person) => person.uid === merged.responsibleUid);
    merged.responsibleName = teamMember?.nome || merged.responsibleName || "";
    const itemsSubtotal = subtotalItems(merged.items) || merged.subtotal;
    merged.subtotal = itemsSubtotal;
    merged.total = Math.max(0, itemsSubtotal - num(merged.discount) + num(merged.freight));
    const batch = writeBatch(db);
    const legacyId = order.legacyId || order.id;
    batch.set(doc(db, "pedidos", legacyId), legacyPayload(order, merged));
    if (order.leadId) {
        const history = [...order.history, eventEntry(title, `${stageLabel(merged.status)} · ${PAYMENT_LABELS[merged.payment]} · ${money(merged.total)}`)].slice(-MAX_HISTORY);
        const leadStatus = leadStageForOrder(merged.status);
        const leadPatch = {
            pedidoVinculadoId: legacyId,
            pedidoStatus: merged.status,
            pagamentoStatus: merged.payment,
            pedidoResponsavelUid: merged.responsibleUid || "",
            pedidoResponsavelNome: merged.responsibleName || "",
            pedidoPrazoEntrega: merged.dueDate || null,
            pedidoDesconto: Math.max(0, num(merged.discount)),
            pedidoFrete: Math.max(0, num(merged.freight)),
            pedidoObservacoesInternas: String(merged.internalNotes || "").slice(0, 2000),
            pedidoAtualizadoEm: Date.now(),
            pedidoHistorico: history,
            valorOportunidade: merged.total,
            statusLead: leadStatus,
            status: leadStatus,
            pipelineStage: leadStatus
        };
        if (leadStatus === "convertido") leadPatch.probabilidade = 100;
        if (leadStatus === "perdido") leadPatch.probabilidade = 0;
        batch.set(doc(db, "leads", order.leadId), leadPatch, { merge: true });
    }
    try {
        await batch.commit();
        toast("Pedido atualizado.");
        state.selectedId = order.id;
    } catch (error) {
        console.error("[Aura Pedidos] Falha ao salvar:", error);
        toast("Não foi possível salvar o pedido.", "error");
    }
}

async function saveDetail() {
    const order = state.orders.find((item) => item.id === state.selectedId);
    if (!order) return;
    const responsibleUid = document.getElementById("aura-orders-v1-detail-responsible")?.value || "";
    const dueRaw = document.getElementById("aura-orders-v1-detail-due")?.value || "";
    await persistOrder(order, {
        status: document.getElementById("aura-orders-v1-detail-status")?.value || order.status,
        payment: document.getElementById("aura-orders-v1-detail-payment")?.value || order.payment,
        responsibleUid,
        responsibleName: state.team.find((person) => person.uid === responsibleUid)?.nome || "",
        dueDate: dueRaw ? new Date(`${dueRaw}T12:00:00`).getTime() : 0,
        discount: Math.max(0, num(document.getElementById("aura-orders-v1-detail-discount")?.value)),
        freight: Math.max(0, num(document.getElementById("aura-orders-v1-detail-freight")?.value)),
        internalNotes: document.getElementById("aura-orders-v1-detail-notes")?.value.trim() || ""
    }, "Pedido atualizado");
}

function openOrder(id) {
    state.selectedId = id;
    render();
    document.getElementById("view-pedidos")?.scrollIntoView({ block: "start" });
}

function openWhatsapp(order) {
    const number = phone(order.whatsapp);
    if (!number) return toast("Este pedido não possui WhatsApp válido.", "error");
    const message = `Olá, ${order.customer}! Tudo bem? Estou entrando em contato sobre o pedido ${order.number}. Status atual: ${stageLabel(order.status)}.`;
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
}

function printReceipt(order) {
    const popup = window.open("", "_blank", "width=860,height=900");
    if (!popup) return toast("Permita pop-ups para imprimir o comprovante.", "error");
    popup.document.write(`<!DOCTYPE html><html lang="pt-br"><head><meta charset="UTF-8"><title>${esc(order.number)}</title><style>body{font-family:Arial,sans-serif;color:#111;padding:32px;max-width:760px;margin:auto}h1{margin:0 0 6px}small{color:#666}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{padding:10px;border-bottom:1px solid #ddd;text-align:left}.right{text-align:right}.total{font-size:22px;font-weight:700;margin-top:20px;text-align:right}.box{border:1px solid #ddd;border-radius:12px;padding:16px;margin-top:20px}@media print{button{display:none}}</style></head><body><h1>Comprovante ${esc(order.number)}</h1><small>${dateTime(order.created)}</small><div class="box"><strong>${esc(order.customer)}</strong><br>${esc(order.whatsapp)}<br>${esc(order.delivery)} ${esc(order.address || "")}</div><table><thead><tr><th>Item</th><th>Qtd.</th><th class="right">Valor</th></tr></thead><tbody>${order.items.map((item) => `<tr><td>${esc(item.nomeSnapshot)}</td><td>${item.quantidade}</td><td class="right">${money(item.precoSnapshot * item.quantidade)}</td></tr>`).join("")}</tbody></table><p class="total">Total: ${money(order.total)}</p><div class="box">Status: ${stageLabel(order.status)}<br>Pagamento: ${PAYMENT_LABELS[order.payment]}</div><script>window.onload=()=>window.print()<\/script></body></html>`);
    popup.document.close();
}

function exportCSV() {
    const orders = filteredOrders();
    if (!orders.length) return toast("Não há pedidos para exportar.", "error");
    const rows = [["Pedido", "Cliente", "WhatsApp", "Produtos", "Subtotal", "Desconto", "Frete", "Total", "Status", "Pagamento", "Recebimento", "Origem", "Campanha", "Responsável", "Data"]];
    orders.forEach((order) => rows.push([order.number, order.customer, order.whatsapp, order.productsText, order.subtotal, order.discount, order.freight, order.total, stageLabel(order.status), PAYMENT_LABELS[order.payment], order.delivery, order.origin, order.campaign, order.responsibleName, dateTime(order.created)]));
    const csv = rows.map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `pedidos_${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
}

function toast(message, type = "success") {
    if (typeof window.showToast === "function") return window.showToast(message, type);
    let host = document.getElementById("aura-orders-v1-toast-host");
    if (!host) {
        host = document.createElement("div");
        host.id = "aura-orders-v1-toast-host";
        document.body.appendChild(host);
    }
    const item = document.createElement("div");
    item.className = `aura-orders-v1-toast is-${type}`;
    item.textContent = message;
    host.appendChild(item);
    requestAnimationFrame(() => item.classList.add("is-visible"));
    setTimeout(() => { item.classList.remove("is-visible"); setTimeout(() => item.remove(), 200); }, 3000);
}

function updateTotalPreview() {
    const order = state.orders.find((item) => item.id === state.selectedId);
    const target = document.getElementById("aura-orders-v1-total-preview");
    if (!order || !target) return;
    const discount = Math.max(0, num(document.getElementById("aura-orders-v1-detail-discount")?.value));
    const freight = Math.max(0, num(document.getElementById("aura-orders-v1-detail-freight")?.value));
    target.textContent = money(Math.max(0, order.subtotal - discount + freight));
}

function bindView(view) {
    view.addEventListener("click", (event) => {
        const tab = event.target.closest("[data-orders-tab], [data-orders-tab-jump]");
        if (tab) {
            state.activeTab = tab.dataset.ordersTab || tab.dataset.ordersTabJump || "overview";
            state.selectedId = "";
            render();
            return;
        }
        const open = event.target.closest("[data-open-order]");
        if (open && !event.target.closest("select")) return openOrder(open.dataset.openOrder);
        const action = event.target.closest("[data-orders-action]")?.dataset.ordersAction;
        if (action === "back") { state.selectedId = ""; render(); }
        if (action === "save") saveDetail();
        if (action === "export") exportCSV();
        if (action === "refresh") refreshAll();
        if (action === "whatsapp") {
            const order = state.orders.find((item) => item.id === state.selectedId);
            if (order) openWhatsapp(order);
        }
        if (action === "print") {
            const order = state.orders.find((item) => item.id === state.selectedId);
            if (order) printReceipt(order);
        }
    });
    view.addEventListener("change", (event) => {
        const target = event.target;
        if (target.id === "aura-orders-v1-status") state.status = target.value;
        else if (target.id === "aura-orders-v1-payment") state.payment = target.value;
        else if (target.id === "aura-orders-v1-delivery") state.delivery = target.value;
        else if (target.matches("[data-move-order]")) {
            const order = state.orders.find((item) => item.id === target.dataset.moveOrder);
            if (order) persistOrder(order, { status: target.value }, "Etapa alterada");
            return;
        } else return;
        render();
    });
    view.addEventListener("input", (event) => {
        if (event.target.id === "aura-orders-v1-search") {
            state.search = event.target.value;
            clearTimeout(state.searchTimer);
            state.searchTimer = setTimeout(() => {
                render();
                const input = document.getElementById("aura-orders-v1-search");
                input?.focus();
                input?.setSelectionRange(state.search.length, state.search.length);
            }, 140);
        }
        if (["aura-orders-v1-detail-discount", "aura-orders-v1-detail-freight"].includes(event.target.id)) updateTotalPreview();
    });
    view.addEventListener("dragstart", (event) => {
        const card = event.target.closest("[data-drag-order]");
        if (!card || !state.canEdit) return;
        event.dataTransfer.setData("text/plain", card.dataset.dragOrder);
        card.classList.add("is-dragging");
    });
    view.addEventListener("dragend", (event) => {
        event.target.closest("[data-drag-order]")?.classList.remove("is-dragging");
        view.querySelectorAll("[data-drop-status]").forEach((column) => column.classList.remove("is-drag-over"));
    });
    view.addEventListener("dragover", (event) => {
        const column = event.target.closest("[data-drop-status]");
        if (!column || !state.canEdit) return;
        event.preventDefault();
        column.classList.add("is-drag-over");
    });
    view.addEventListener("dragleave", (event) => event.target.closest("[data-drop-status]")?.classList.remove("is-drag-over"));
    view.addEventListener("drop", (event) => {
        const column = event.target.closest("[data-drop-status]");
        if (!column || !state.canEdit) return;
        event.preventDefault();
        const id = event.dataTransfer.getData("text/plain");
        const order = state.orders.find((item) => item.id === id);
        if (order) persistOrder(order, { status: column.dataset.dropStatus }, "Etapa alterada");
    });
}

function startLegacyListener(force = false) {
    if (!state.canView || !state.ownerUid) return;
    if (state.unsubscribeLegacy && !force) return;
    state.unsubscribeLegacy?.();
    state.legacyReady = false;
    state.unsubscribeLegacy = onSnapshot(query(collection(db, "pedidos"), where("criadoPor", "==", state.ownerUid)), (snapshot) => {
        state.legacyRecords = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        state.legacyReady = true;
        rebuildOrders();
    }, (error) => {
        state.legacyReady = true;
        console.warn("[Aura Pedidos] Pedidos legados indisponíveis:", error?.message || error);
        rebuildOrders();
    });
}

function ingestLeads(detail) {
    if (detail?.ownerUid && state.ownerUid && detail.ownerUid !== state.ownerUid) return;
    state.leadRecords = Array.isArray(detail?.leads) ? detail.leads : [];
    state.leadsReady = true;
    rebuildOrders();
}

function refreshAll() {
    state.leadsReady = false;
    state.legacyReady = false;
    window.AuraLeadsV6?.reload?.({ force: true });
    startLegacyListener(true);
    render();
}

async function initialize(user) {
    if (state.initialized || !user) return;
    state.user = user;
    state.ownerUid = await resolveOwnerUid(user);
    await loadAccess(user);
    if (state.canView) await loadTeam();
    ensureView();
    state.initialized = true;
    window.addEventListener("aura:leads-v6-data", (event) => ingestLeads(event.detail));
    const initialLeads = window.AuraLeadsV6?.getLeads?.();
    if (Array.isArray(initialLeads)) {
        ingestLeads({ ownerUid: state.ownerUid, leads: initialLeads });
    } else {
        window.setTimeout(() => {
            if (state.leadsReady) return;
            const delayedLeads = window.AuraLeadsV6?.getLeads?.();
            if (Array.isArray(delayedLeads)) {
                ingestLeads({ ownerUid: state.ownerUid, leads: delayedLeads });
            } else {
                state.leadsReady = true;
                rebuildOrders();
            }
        }, 2200);
    }
    startLegacyListener();
    render();
    window.AuraOrdersV1 = {
        version: VERSION,
        reload: refreshAll,
        openOrder,
        getState: () => ({ ownerUid: state.ownerUid, total: state.orders.length, canView: state.canView, canEdit: state.canEdit, activeTab: state.activeTab, version: VERSION })
    };
    console.info(`[Vide Aura Pedidos] Inicializado — ${state.ownerUid} — v${VERSION}`);
}

onAuthStateChanged(auth, (user) => { if (user) initialize(user); });
