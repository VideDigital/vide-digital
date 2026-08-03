/* =========================================================
   VIDE HUB — WHATSAPP OFICIAL
   Administração de conexões oficiais da Meta. Nunca recebe token, ID
   técnico ou segredo digitado pelo cliente; toda ação sensível passa por
   callables autenticadas e respostas sanitizadas.
   ========================================================= */

const ROTULO_STATUS = Object.freeze({
    disconnected: "Não configurado", pending_setup: "Preparando", validating: "Validando",
    connected: "Conectado", degraded: "Precisa de atenção", suspended: "Suspenso", revoked: "Desconectado"
});

const DESCRICAO_STATUS = Object.freeze({
    disconnected: "Nenhuma conexão ativa nesta loja.",
    pending_setup: "A conexão ainda está sendo preparada.",
    validating: "Estamos verificando a conexão.",
    connected: "A conexão está pronta para receber e enviar mensagens.",
    degraded: "A conexão continua cadastrada, mas precisa ser validada.",
    suspended: "A Meta suspendeu temporariamente esta conexão.",
    revoked: "A autorização desta conexão não está mais válida."
});

const ROTULO_PROVIDER_MODE = Object.freeze({
    official_cloud: "Número dedicado à Cloud API",
    official_coexistence: "Coexistência oficial"
});

const META_SDK_ID = "vide-meta-jssdk";
let metaSdkPromise = null;
let metaSdkAppId = "";

function escaparHtml(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function formatarDataHora(valor) {
    if (!valor) return "—";
    const ms = typeof valor?.toMillis === "function" ? valor.toMillis() : Number(valor);
    return Number.isFinite(ms) && ms > 0 ? new Date(ms).toLocaleString("pt-BR") : "—";
}

function chaveIdempotencia() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID().replace(/-/g, "");
    const bytes = new Uint8Array(24);
    globalThis.crypto?.getRandomValues?.(bytes);
    return Array.from(bytes, (item) => item.toString(16).padStart(2, "0")).join("");
}

export function carregarMetaSdk({ appId, graphVersion, locale = "pt_BR", documentRef = document, windowRef = window } = {}) {
    if (!appId) return Promise.reject(new Error("Configuração pública da Meta ausente."));
    if (windowRef.FB && metaSdkAppId === appId) return Promise.resolve(windowRef.FB);
    if (metaSdkPromise) return metaSdkPromise;
    metaSdkPromise = new Promise((resolve, reject) => {
        const timeout = windowRef.setTimeout(() => {
            metaSdkPromise = null;
            reject(new Error("Não foi possível carregar a janela da Meta. Verifique bloqueadores de conteúdo e tente novamente."));
        }, 15000);
        const previousInit = windowRef.fbAsyncInit;
        windowRef.fbAsyncInit = () => {
            try {
                previousInit?.();
                windowRef.FB.init({ appId, autoLogAppEvents: false, xfbml: false, version: graphVersion });
                metaSdkAppId = appId;
                windowRef.clearTimeout(timeout);
                resolve(windowRef.FB);
            } catch (error) {
                windowRef.clearTimeout(timeout);
                metaSdkPromise = null;
                reject(error);
            }
        };
        const existing = documentRef.getElementById(META_SDK_ID);
        if (existing) return;
        const script = documentRef.createElement("script");
        script.id = META_SDK_ID;
        script.async = true;
        script.defer = true;
        script.crossOrigin = "anonymous";
        script.src = `https://connect.facebook.net/${encodeURIComponent(locale)}/sdk.js`;
        script.onerror = () => {
            windowRef.clearTimeout(timeout);
            script.remove();
            metaSdkPromise = null;
            reject(new Error("O navegador bloqueou o carregamento da Meta. Libere scripts e popups para a Vide Hub."));
        };
        documentRef.head.appendChild(script);
    });
    return metaSdkPromise;
}

export function criarWhatsappOficialController({
    context, notify = () => {}, logger = console, root = document, db, firestore,
    chamarConnectionStatus, chamarValidateConnection, chamarSyncTemplates, chamarListConnections,
    chamarSetDefaultConnection, chamarStartOnboarding, chamarCompleteOnboarding,
    chamarGetOnboardingStatus, chamarCancelOnboarding, chamarRenameConnection,
    chamarDisconnectConnection, chamarListQrCodes, chamarCreateQrCode,
    chamarUpdateQrCode, chamarDeleteQrCode
} = {}) {
    const state = {
        carregado: false, erro: false, semPermissao: false, conexao: null, conexoes: [],
        totalConexoes: 0, maxConexoes: 2, limiteAtingido: false, templates: [],
        templateFilter: "ALL", qrCodes: [], onboarding: null, onboardingAtual: null,
        validando: false, sincronizando: false, conexaoEmAcao: "", acaoAtual: null
    };

    const byId = (id) => root.getElementById(id);
    const podeGerenciar = () => Boolean(context?.canEdit?.("whatsapp"));

    // Recursos novos permanecem desligados quando o backend antigo não
    // devolve onboarding.flags. Somente o valor booleano true habilita
    // uma funcionalidade e permite chamar sua respectiva Function.
    const recursoHabilitado = (nome) => state.onboarding?.flags?.[nome] === true;
    const onboardingDisponivel = () => state.onboarding?.available === true;

    // O backend novo sempre devolve embeddedSignup como booleano,
    // mesmo quando a funcionalidade está desligada. O backend antigo
    // não devolve onboarding.flags.
    const gerenciamentoNovoDisponivel = () =>
        typeof state.onboarding?.flags?.embeddedSignup === "boolean";

    function mostrarEstado(nome) {
        ["carregando", "erro", "sem-permissao", "conteudo"].forEach((estado) => byId(`whatsapp-estado-${estado}`)?.classList.toggle("hidden", estado !== nome));
    }

    async function load({ force = false, transientRetries = 1 } = {}) {
        if (state.carregado && !force) return mostrarEstado(state.semPermissao ? "sem-permissao" : "conteudo");
        mostrarEstado("carregando");
        try {
            const [status, connections] = await Promise.all([chamarConnectionStatus({}), chamarListConnections({}), carregarTemplates()]);
            state.conexao = status || { status: "disconnected" };
            state.conexoes = Array.isArray(connections?.conexoes) ? connections.conexoes : [];
            state.totalConexoes = Number(connections?.total || 0);
            state.maxConexoes = Number(connections?.maxConexoes || 2);
            state.limiteAtingido = Boolean(connections?.limiteAtingido);
            state.onboarding = connections?.onboarding || status?.onboarding || null;
            await carregarQrCodes();
            state.carregado = true;
            state.erro = false;
            renderTudo();
            mostrarEstado("conteudo");
        } catch (error) {
            if (error?.code === "functions/permission-denied") {
                state.semPermissao = true;
                mostrarEstado("sem-permissao");
            } else if (transientRetries > 0 && ["functions/deadline-exceeded", "functions/unavailable"].includes(error?.code)) {
                logger.warn?.("[WhatsApp] Atualização temporariamente indisponível; repetindo uma vez.", error?.code);
                await new Promise((resolve) => globalThis.setTimeout(resolve, 500));
                return load({ force: true, transientRetries: transientRetries - 1 });
            } else {
                logger.error?.("[WhatsApp] Falha ao carregar módulo:", error?.code, error?.message);
                state.erro = true;
                mostrarEstado("erro");
            }
        }
    }

    async function carregarTemplates() {
        const ownerUid = context?.getOwnerUid?.() || "";
        if (!ownerUid || !firestore?.collection) return;
        try {
            const snap = await firestore.getDocs(firestore.query(firestore.collection(db, "whatsapp_templates"), firestore.where("ownerUid", "==", ownerUid)));
            state.templates = snap.docs.map((doc) => doc.data());
        } catch (error) {
            logger.error?.("[WhatsApp] Falha ao listar templates:", error?.code, error?.message);
            state.templates = [];
        }
    }

    async function carregarQrCodes() {
        if (
            typeof chamarListQrCodes !== "function"
            || !podeGerenciar()
            || !recursoHabilitado("qrCodes")
        ) {
            state.qrCodes = [];
            return;
        }
        try {
            const result = await chamarListQrCodes({});
            state.qrCodes = Array.isArray(result?.qrCodes) ? result.qrCodes : [];
        } catch (error) {
            if (error?.code !== "functions/failed-precondition") logger.error?.("[WhatsApp] Falha ao listar QR Codes:", error?.code, error?.message);
            state.qrCodes = [];
        }
    }

    function conexaoPadrao() { return state.conexoes.find((connection) => connection.isDefault) || null; }
    function conexoesAtivas() { return state.conexoes.filter((connection) => connection.status === "connected"); }

    function renderTudo() {
        renderVisaoGeral();
        renderAdicionar();
        renderConexoes();
        renderTemplates();
        renderDiagnostico();
        renderQrCodes();
    }

    function renderVisaoGeral() {
        const status = state.conexao?.status || "disconnected";
        const badge = byId("whatsapp-status-badge");
        if (badge) { badge.textContent = ROTULO_STATUS[status] || status; badge.className = `aura-whatsapp-badge is-status-${escaparHtml(status)}`; }
        if (byId("whatsapp-status-descricao")) byId("whatsapp-status-descricao").textContent = DESCRICAO_STATUS[status] || "";
        if (byId("whatsapp-visao-total-conexoes")) byId("whatsapp-visao-total-conexoes").textContent = String(state.totalConexoes);
        if (byId("whatsapp-visao-limite")) byId("whatsapp-visao-limite").textContent = String(state.maxConexoes);
        const standard = conexaoPadrao();
        if (byId("whatsapp-visao-padrao-label")) byId("whatsapp-visao-padrao-label").textContent = standard?.label || "Nenhuma";
        if (byId("whatsapp-visao-padrao-numero")) byId("whatsapp-visao-padrao-numero").textContent = standard?.displayPhoneNumber || "Conexão padrão";
        if (byId("whatsapp-visao-ultimo-diagnostico")) byId("whatsapp-visao-ultimo-diagnostico").textContent = formatarDataHora(state.conexao?.lastValidatedAt);
        const warnings = [];
        if (state.limiteAtingido) warnings.push("Sua loja atingiu o limite de duas conexões.");
        if (["degraded", "suspended", "revoked"].includes(status)) warnings.push("A conexão padrão precisa de atenção. Use Validar conexão ou Reconectar.");
        const list = byId("whatsapp-visao-avisos");
        if (list) { list.innerHTML = warnings.map((warning) => `<li>${escaparHtml(warning)}</li>`).join(""); list.classList.toggle("hidden", !warnings.length); }
    }

    function availabilityMessage() {
        if (!podeGerenciar()) {
            return "Seu perfil pode consultar, mas não alterar conexões.";
        }

        if (state.limiteAtingido) {
            return "Limite de duas conexões atingido.";
        }

        if (
            state.totalConexoes > 0
            && !recursoHabilitado("secondConnection")
        ) {
            return "A segunda conexão está em liberação progressiva. Sua conexão atual continua funcionando normalmente.";
        }

        const reason = state.onboarding?.reason;

        if (onboardingDisponivel()) {
            return "A janela oficial da Meta será aberta somente após sua confirmação.";
        }

        if (reason === "platform_configuration_missing") {
            return "A configuração externa da Meta ainda está sendo preparada. Suas conexões atuais continuam funcionando.";
        }

        if (reason === "not_in_rollout") {
            return "O novo fluxo está em liberação progressiva e ainda não está disponível para esta conta.";
        }

        return "Novas conexões estão temporariamente indisponíveis. As conexões atuais continuam funcionando.";
    }

    function renderAdicionar() {
        const button = byId("whatsapp-btn-conectar");

        if (button) {
            button.disabled =
                !podeGerenciar()
                || state.limiteAtingido
                || !onboardingDisponivel()
                || (
                    state.totalConexoes > 0
                    && !recursoHabilitado("secondConnection")
                );

            button.textContent =
                state.totalConexoes === 1
                    ? "Adicionar segundo número"
                    : "Conectar meu WhatsApp";
        }

        if (byId("whatsapp-onboarding-disponibilidade")) {
            byId("whatsapp-onboarding-disponibilidade").textContent =
                availabilityMessage();
        }

        byId("whatsapp-adicionar-limite-aviso")
            ?.classList.toggle("hidden", !state.limiteAtingido);
    }

    function connectionActions(connection) {
        if (!podeGerenciar()) return "";
        const id = connection.legacy ? "" : connection.connectionId;
        const legacy = connection.legacy ? "true" : "false";
        const disabled = state.conexaoEmAcao === (id || "legacy") ? "disabled" : "";
        const connected = connection.status === "connected";
        const operational = ["connected", "degraded", "suspended"].includes(connection.status);
        const disconnected = ["disconnected", "revoked"].includes(connection.status);
        const actions = [
            operational ? `<button type="button" class="aura-whatsapp-btn" data-acao="validar" data-connection-id="${escaparHtml(id)}" data-legacy="${legacy}" ${disabled}>Validar conexão</button>` : "",
            operational && !connection.legacy && !connection.isDefault ? `<button type="button" class="aura-whatsapp-btn" data-acao="tornar-padrao" data-connection-id="${escaparHtml(id)}" ${disabled}>Tornar padrão</button>` : "",
            !connection.legacy && gerenciamentoNovoDisponivel() ? `<button type="button" class="aura-whatsapp-btn" data-acao="renomear" data-connection-id="${escaparHtml(id)}" data-label="${escaparHtml(connection.label || "")}">Renomear</button>` : "",
            disconnected && !connection.legacy && recursoHabilitado("reconnect") ? `<button type="button" class="aura-whatsapp-btn" data-acao="reconectar" data-connection-id="${escaparHtml(id)}">Reconectar</button>` : "",
            connected && recursoHabilitado("qrCodes") ? `<button type="button" class="aura-whatsapp-btn" data-acao="qr" data-connection-id="${escaparHtml(id)}" data-legacy="${legacy}">Criar QR Code</button>` : "",
            !disconnected && !connection.legacy && recursoHabilitado("disconnect") ? `<button type="button" class="aura-whatsapp-btn" data-acao="desconectar" data-connection-id="${escaparHtml(id)}" data-label="${escaparHtml(connection.label || "Conexão")}">Desconectar</button>` : ""
        ];
        return actions.filter(Boolean).join("");
    }

    function renderConexoes() {
        const list = byId("whatsapp-conexoes-lista");
        const empty = byId("whatsapp-conexoes-vazio");
        if (!list) return;
        empty?.classList.toggle("hidden", state.conexoes.length > 0);
        list.innerHTML = state.conexoes.map((connection) => `
<article class="aura-whatsapp-card" data-connection-card="${escaparHtml(connection.connectionId || "legacy")}">
<h3>${escaparHtml(connection.label || (connection.legacy ? "Conexão legada" : "Conexão"))} <span class="aura-whatsapp-badge ${connection.isDefault ? "is-status-connected" : "is-status-disconnected"}">${connection.isDefault ? "Padrão" : "Secundária"}</span></h3>
<p>${escaparHtml(connection.displayPhoneNumber || "Número não informado")}</p>
<p class="aura-whatsapp-card-sub">${escaparHtml(connection.verifiedName || ROTULO_PROVIDER_MODE[connection.providerMode] || "Conexão oficial")}</p>
<p class="aura-whatsapp-card-sub">Status: ${escaparHtml(ROTULO_STATUS[connection.status] || connection.status || "—")} · Última validação: ${formatarDataHora(connection.lastValidatedAt)}</p>
<p class="aura-whatsapp-card-sub">Templates: ${Number(connection.templateCount || 0)} · Última sincronização: ${formatarDataHora(connection.lastTemplateSyncAt)}</p>
<div class="aura-whatsapp-acoes-finais">${connectionActions(connection)}</div>
</article>`).join("");
    }

    function renderTemplates() {
        const counts = state.templates.reduce((acc, item) => { const key = String(item.status || "UNKNOWN").toUpperCase(); acc[key] = (acc[key] || 0) + 1; return acc; }, {});
        const selected = state.templateFilter;
        const filtered = selected === "ALL" ? state.templates : state.templates.filter((item) => String(item.status).toUpperCase() === selected);
        byId("whatsapp-template-filtros")?.querySelectorAll("button").forEach((button) => {
            const filter = button.dataset.templateFilter;
            button.classList.toggle("is-active", filter === selected);
            const base = { ALL: "Todos", APPROVED: "Aprovados", PENDING: "Pendentes", REJECTED: "Rejeitados" }[filter] || filter;
            button.textContent = `${base} (${filter === "ALL" ? state.templates.length : counts[filter] || 0})`;
        });
        if (byId("whatsapp-card-templates-sync")) byId("whatsapp-card-templates-sync").textContent = `Última sincronização: ${formatarDataHora(state.conexao?.lastTemplateSyncAt)}`;
        const sync = byId("whatsapp-btn-sincronizar-templates");
        if (sync) sync.disabled = !podeGerenciar() || !state.conexao?.connected || state.sincronizando;
        const list = byId("whatsapp-templates-lista");
        const empty = byId("whatsapp-templates-vazio");
        if (!list) return;
        empty?.classList.toggle("hidden", filtered.length > 0);
        list.innerHTML = filtered.map((template) => `<article class="aura-whatsapp-card"><h3>${escaparHtml(template.name || "Template")}</h3><p>${escaparHtml(template.language || "Idioma não informado")}</p><p class="aura-whatsapp-card-sub">${escaparHtml(template.category || "Categoria não informada")} · ${escaparHtml(template.status || "—")}</p></article>`).join("");
    }

    function renderDiagnostico() {
        const connection = state.conexao || {};
        const connected = connection.status === "connected";
        if (byId("whatsapp-diag-conexao")) byId("whatsapp-diag-conexao").textContent = connected ? "Sim" : "Não";
        if (byId("whatsapp-diag-webhook")) byId("whatsapp-diag-webhook").textContent = connection.lastWebhookAt ? `Último evento ${formatarDataHora(connection.lastWebhookAt)}` : (connection.webhookSubscribed ? "Configurado; aguardando evento real" : "Ainda não confirmado");
        if (byId("whatsapp-card-numero-valor")) byId("whatsapp-card-numero-valor").textContent = connection.displayPhoneNumber || "—";
        if (byId("whatsapp-card-numero-nome")) byId("whatsapp-card-numero-nome").textContent = connection.verifiedName ? `Nome verificado: ${connection.verifiedName}` : "";
        if (byId("whatsapp-diag-templates")) byId("whatsapp-diag-templates").textContent = connection.lastTemplateSyncAt ? `${state.templates.length} sincronizados` : "Não sincronizados";
        if (byId("whatsapp-card-qualidade-valor")) byId("whatsapp-card-qualidade-valor").textContent = connection.qualityRating || "—";
        if (byId("whatsapp-card-diagnostico-validacao")) byId("whatsapp-card-diagnostico-validacao").textContent = `Última validação: ${formatarDataHora(connection.lastValidatedAt)}`;
        if (byId("whatsapp-card-diagnostico-erro")) byId("whatsapp-card-diagnostico-erro").textContent = connection.lastErrorCode ? "Ação necessária; use Validar conexão." : "Nenhum erro recente";
        if (byId("whatsapp-card-diagnostico-versao")) byId("whatsapp-card-diagnostico-versao").textContent = connection.graphVersion ? `Versão da integração: ${connection.graphVersion}` : "";
        const adminDetails = connection.adminDiagnostics || null;
        byId("whatsapp-diagnostico-admin")?.classList.toggle("hidden", !adminDetails);
        const adminList = byId("whatsapp-diagnostico-admin-lista");
        if (adminList) {
            const fields = adminDetails ? [
                ["Conexão", adminDetails.connectionId || "—"],
                ["Número técnico", adminDetails.phoneNumberIdMasked || "—"],
                ["Conta empresarial", adminDetails.wabaIdMasked || "—"],
                ["Schema", String(adminDetails.schemaVersion || "—")],
                ["Credencial protegida", adminDetails.secretConfigured ? "Sim" : "Não"],
                ["Rota esperada", adminDetails.routeExpected ? "Sim" : "Não"],
                ["Graph API", adminDetails.graphVersion || "—"]
            ] : [];
            adminList.innerHTML = fields.map(([label, value]) => `<div><dt>${escaparHtml(label)}</dt><dd>${escaparHtml(value)}</dd></div>`).join("");
        }
        const validate = byId("whatsapp-btn-validar");
        if (validate) validate.disabled = !podeGerenciar() || !state.conexoes.length || state.validando;
    }

    function renderQrCodes() {
        const active = conexoesAtivas();
        const unavailable = byId("whatsapp-qr-indisponivel");
        unavailable?.classList.toggle("hidden", active.length > 0);
        const newButton = byId("whatsapp-btn-novo-qr");
        if (newButton) {
            newButton.disabled =
                !podeGerenciar()
                || !active.length
                || !recursoHabilitado("qrCodes");
        }
        const list = byId("whatsapp-qr-lista");
        if (!list) return;
        list.innerHTML = state.qrCodes.map((qr) => `<article class="aura-whatsapp-card"><h3>${escaparHtml(qr.label)}</h3>${qr.qrImageUrl ? `<img class="aura-whatsapp-qr-image" src="${escaparHtml(qr.qrImageUrl)}" alt="QR Code ${escaparHtml(qr.label)}">` : ""}<p class="aura-whatsapp-card-sub">${escaparHtml(qr.message)}</p><div class="aura-whatsapp-acoes-finais"><button type="button" class="aura-whatsapp-btn" data-qr-acao="copiar" data-qr-id="${escaparHtml(qr.id)}">Copiar link</button><a class="aura-whatsapp-btn" href="${escaparHtml(qr.deepLinkUrl)}" target="_blank" rel="noopener noreferrer">Abrir link</a>${qr.qrImageUrl ? `<a class="aura-whatsapp-btn" href="${escaparHtml(qr.qrImageUrl)}" download="qr-whatsapp-${escaparHtml(qr.id)}.${qr.format === "PNG" ? "png" : "svg"}">Baixar ${escaparHtml(qr.format || "SVG")}</a>` : ""}<button type="button" class="aura-whatsapp-btn" data-qr-acao="editar" data-qr-id="${escaparHtml(qr.id)}">Editar</button><button type="button" class="aura-whatsapp-btn" data-qr-acao="imprimir" data-qr-id="${escaparHtml(qr.id)}">Imprimir</button><button type="button" class="aura-whatsapp-btn" data-qr-acao="excluir" data-qr-id="${escaparHtml(qr.id)}">Excluir</button></div></article>`).join("");
    }

    function setOnboardingStep(step, message) {
        const order = ["preparing", "meta", "verifying", "configuring", "protecting", "templates", "done"];
        const current = Math.max(0, order.indexOf(step));
        byId("whatsapp-onboarding-passos")?.querySelectorAll("li").forEach((item, index) => {
            item.classList.toggle("is-current", index === current);
            item.classList.toggle("is-done", index < current);
        });
        if (message && byId("whatsapp-onboarding-mensagem")) byId("whatsapp-onboarding-mensagem").textContent = message;
    }

    function onboardingError(message) {
        const box = byId("whatsapp-onboarding-erro");
        if (box) { box.textContent = message; box.classList.remove("hidden"); }
    }

    function mapBackendStep(step) {
        const value = String(step || "");
        if (["starting", "awaiting_meta"].includes(value)) return ["meta", "Aguardando a autorização oficial da Meta."];
        if (["processing", "exchanging_code", "discovering_assets"].includes(value)) return ["verifying", "Confirmando sua autorização e os ativos compartilhados diretamente com a Meta."];
        if (["registering", "subscribing_webhook", "creating_route", "validating"].includes(value)) return ["configuring", "Configurando o número, o recebimento e o roteamento seguro para sua loja."];
        if (value === "saving_secret") return ["protecting", "Protegendo a credencial da conexão fora do navegador e do banco de dados."];
        if (value === "syncing_templates") return ["templates", "Sincronizando os templates oficiais já disponíveis na conta."];
        if (value === "connected") return ["done", "Conexão concluída. Seu número já aparece na Vide Hub."];
        return null;
    }

    async function acompanharOnboarding(attemptId, control) {
        if (!attemptId || typeof chamarGetOnboardingStatus !== "function") return;
        for (let attempt = 0; attempt < 20 && !control.done; attempt += 1) {
            await new Promise((resolve) => window.setTimeout(resolve, 1200));
            if (control.done) return;
            try {
                const current = await chamarGetOnboardingStatus({ onboardingAttemptId: attemptId });
                const mapped = mapBackendStep(current?.step || current?.status);
                if (mapped) setOnboardingStep(mapped[0], mapped[1]);
                if (["connected", "failed", "cancelled", "expired", "requires_action"].includes(current?.status)) return;
            } catch {
                return;
            }
        }
    }

    function openOnboarding({ mode = "new", connectionId = "" } = {}) {
        if (!podeGerenciar() || !onboardingDisponivel()) {
            return notify(availabilityMessage(), "error");
        }

        if (
            mode === "new"
            && state.totalConexoes > 0
            && !recursoHabilitado("secondConnection")
        ) {
            return notify(availabilityMessage(), "error");
        }

        if (mode === "reconnect" && !recursoHabilitado("reconnect")) {
            return notify("A reconexão ainda não está disponível para esta conta.", "error");
        }
        state.onboardingAtual = { mode, connectionId, critical: false, attemptId: "" };
        byId("whatsapp-onboarding-erro")?.classList.add("hidden");
        byId("whatsapp-onboarding-iniciar").disabled = false;
        byId("whatsapp-onboarding-cancelar").disabled = false;
        byId("whatsapp-onboarding-cancelar").textContent = "Cancelar";
        setOnboardingStep("preparing", mode === "reconnect" ? "Vamos renovar a autorização sem interromper a conexão atual." : "Vamos preparar a conexão e abrir uma janela oficial da Meta.");
        byId("whatsapp-onboarding-modal")?.showModal();
    }

    async function requestMetaAuthorization(start) {
        if (start.emulatorMock) return { code: "EMULATOR_META_AUTHORIZATION_CODE", sessionInfo: { waba_id: "900000000001", phone_number_id: "900000000002", business_id: "900000000003" } };
        const FB = await carregarMetaSdk({ appId: start.appId, graphVersion: start.graphVersion, locale: start.locale });
        return new Promise((resolve, reject) => {
            let sessionInfo = {};
            let code = "";
            let settleTimer = null;
            const cleanup = () => { window.removeEventListener("message", onMessage); if (settleTimer) window.clearTimeout(settleTimer); };
            const finish = () => { if (!code) return; cleanup(); resolve({ code, sessionInfo }); };
            const onMessage = (event) => {
                if (!["https://www.facebook.com", "https://web.facebook.com"].includes(event.origin)) return;
                try {
                    const payload = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
                    if (payload?.type !== "WA_EMBEDDED_SIGNUP") return;
                    if (payload.event === "CANCEL") { cleanup(); reject(Object.assign(new Error("A conexão foi cancelada antes de terminar. Nenhuma alteração foi feita."), { cancelled: true })); return; }
                    if (payload.event === "ERROR") { cleanup(); reject(new Error("A Meta não conseguiu concluir esta etapa. Confira sua permissão administrativa e tente novamente.")); return; }
                    if (payload.event === "FINISH") { sessionInfo = payload.data || {}; if (code) finish(); }
                } catch { /* mensagens externas que não são do fluxo são ignoradas */ }
            };
            window.addEventListener("message", onMessage);
            try {
                FB.login((response) => {
                    code = response?.authResponse?.code || "";
                    if (!code) { cleanup(); reject(new Error("A janela da Meta foi fechada ou não concluiu a autorização.")); return; }
                    settleTimer = window.setTimeout(finish, 800);
                    if (sessionInfo.waba_id || sessionInfo.phone_number_id) finish();
                }, { config_id: start.configurationId, response_type: "code", override_default_response_type: true, extras: { version: "v3" } });
            } catch (error) {
                cleanup();
                reject(new Error(error?.message || "Seu navegador bloqueou a janela da Meta. Permita popups e tente novamente."));
            }
        });
    }

    async function startOnboarding() {
        if (!state.onboardingAtual || typeof chamarStartOnboarding !== "function") return;
        const button = byId("whatsapp-onboarding-iniciar");
        let progressControl = null;
        button.disabled = true;
        byId("whatsapp-onboarding-erro")?.classList.add("hidden");
        try {
            const start = await chamarStartOnboarding({ providerMode: "official_cloud", mode: state.onboardingAtual.mode, connectionId: state.onboardingAtual.connectionId, idempotencyKey: chaveIdempotencia() });
            state.onboardingAtual.attemptId = start.onboardingAttemptId;
            setOnboardingStep("meta", "Uma janela oficial da Meta será aberta. Não feche esta página durante o processo.");
            const authorization = await requestMetaAuthorization(start);
            state.onboardingAtual.critical = true;
            byId("whatsapp-onboarding-cancelar").disabled = true;
            setOnboardingStep("verifying", "Autorização recebida. A Vide Hub está confirmando os ativos compartilhados diretamente com a Meta.");
            progressControl = { done: false };
            const progressPromise = acompanharOnboarding(start.onboardingAttemptId, progressControl);
            const result = await chamarCompleteOnboarding({ onboardingAttemptId: start.onboardingAttemptId, state: start.state, code: authorization.code, sessionInfo: authorization.sessionInfo });
            progressControl.done = true;
            await progressPromise;
            setOnboardingStep("done", result.templateWarning ? "Conexão concluída. A sincronização de templates poderá ser repetida pelo painel." : "Conexão concluída. Seu número já aparece na Vide Hub.");
            state.onboardingAtual.critical = false;
            state.onboardingAtual.attemptId = "";
            byId("whatsapp-onboarding-cancelar").disabled = false;
            byId("whatsapp-onboarding-cancelar").textContent = "Fechar";
            notify("WhatsApp conectado com sucesso.", "success");
            await load({ force: true });
        } catch (error) {
            if (progressControl) progressControl.done = true;
            state.onboardingAtual.critical = false;
            byId("whatsapp-onboarding-cancelar").disabled = false;
            button.disabled = false;
            onboardingError(error?.message || "Não foi possível concluir a conexão agora.");
        }
    }

    async function cancelOnboarding() {
        if (state.onboardingAtual?.critical) return;
        if (state.onboardingAtual?.attemptId && typeof chamarCancelOnboarding === "function") {
            try { await chamarCancelOnboarding({ onboardingAttemptId: state.onboardingAtual.attemptId }); } catch { /* tentativa pode já ter terminado */ }
        }
        byId("whatsapp-onboarding-modal")?.close();
        state.onboardingAtual = null;
    }

    async function validarConexao(connectionId = "", legacy = false) {
        if (!podeGerenciar() || state.validando) return;
        state.validando = true;
        state.conexaoEmAcao = connectionId || "legacy";
        renderTudo();
        try { await chamarValidateConnection(legacy ? { legacy: true } : { connectionId }); notify("Conexão validada com sucesso.", "success"); await load({ force: true }); }
        catch (error) { notify(error?.message || "Não foi possível validar esta conexão.", "error"); }
        finally { state.validando = false; state.conexaoEmAcao = ""; renderTudo(); }
    }

    async function tornarPadrao(connectionId) {
        state.conexaoEmAcao = connectionId; renderConexoes();
        try { await chamarSetDefaultConnection({ connectionId }); notify("Conexão padrão atualizada. As conversas antigas permanecem no número original.", "success"); await load({ force: true }); }
        catch (error) { notify(error?.message || "Não foi possível alterar a conexão padrão.", "error"); }
        finally { state.conexaoEmAcao = ""; renderConexoes(); }
    }

    async function sincronizarTemplates() {
        if (state.sincronizando) return;
        state.sincronizando = true; renderTemplates();
        try { const result = await chamarSyncTemplates({}); notify(`Templates sincronizados (${result?.sincronizados || 0}).`, "success"); await load({ force: true }); }
        catch (error) { notify(error?.message || "Não foi possível sincronizar os templates.", "error"); }
        finally { state.sincronizando = false; renderTemplates(); }
    }

    function openActionModal(type, connectionId, label) {
        state.acaoAtual = { type, connectionId };
        const disconnect = type === "disconnect";
        byId("whatsapp-acao-titulo").textContent = disconnect ? "Desconectar WhatsApp" : "Renomear conexão";
        byId("whatsapp-acao-descricao").textContent = disconnect ? `O histórico de "${label}" será preservado, mas novas mensagens deixarão de ser processadas por esta conexão.` : "Use um nome fácil para sua equipe reconhecer este número.";
        byId("whatsapp-acao-label-box").classList.toggle("hidden", disconnect);
        byId("whatsapp-acao-confirmacao-box").classList.toggle("hidden", !disconnect);
        byId("whatsapp-acao-label").value = label || "";
        byId("whatsapp-acao-confirmacao").value = "";
        byId("whatsapp-acao-confirmar").textContent = disconnect ? "Desconectar" : "Salvar nome";
        byId("whatsapp-acao-erro").classList.add("hidden");
        byId("whatsapp-acao-modal").showModal();
    }

    async function submitAction(event) {
        event.preventDefault();
        const action = state.acaoAtual;
        if (!action) return;
        const errorBox = byId("whatsapp-acao-erro");
        try {
            if (action.type === "disconnect") await chamarDisconnectConnection({ connectionId: action.connectionId, confirmation: byId("whatsapp-acao-confirmacao").value.trim() });
            else await chamarRenameConnection({ connectionId: action.connectionId, label: byId("whatsapp-acao-label").value.trim() });
            byId("whatsapp-acao-modal").close();
            notify(action.type === "disconnect" ? "Conexão desconectada. O histórico foi preservado." : "Nome da conexão atualizado.", "success");
            await load({ force: true });
        } catch (error) { errorBox.textContent = error?.message || "Não foi possível concluir esta ação."; errorBox.classList.remove("hidden"); }
    }

    function connectionOptionValue(connection) { return connection.legacy ? "legacy" : connection.connectionId; }
    function openQrModal(qr = null, preferredConnection = "") {
        const select = byId("whatsapp-qr-conexao");
        const active = conexoesAtivas();
        select.innerHTML = active.map((connection) => `<option value="${escaparHtml(connectionOptionValue(connection))}">${escaparHtml(connection.label || connection.displayPhoneNumber || "Conexão")}</option>`).join("");
        const selected = qr ? (qr.legacy ? "legacy" : qr.connectionId) : preferredConnection;
        if (selected) select.value = selected;
        select.disabled = Boolean(qr);
        byId("whatsapp-qr-id").value = qr?.id || "";
        byId("whatsapp-qr-label").value = qr?.label || "";
        byId("whatsapp-qr-mensagem").value = qr?.message || "";
        byId("whatsapp-qr-modal-titulo").textContent = qr ? "Editar QR Code" : "Criar QR Code de atendimento";
        byId("whatsapp-qr-form").querySelector('button[type="submit"]').textContent = qr ? "Salvar alterações" : "Criar QR Code";
        byId("whatsapp-qr-erro").classList.add("hidden");
        byId("whatsapp-qr-modal").showModal();
    }

    async function submitQr(event) {
        event.preventDefault();
        const qrId = byId("whatsapp-qr-id").value;
        const selected = byId("whatsapp-qr-conexao").value;
        const payload = { qrId, connectionId: selected === "legacy" ? "" : selected, legacy: selected === "legacy", label: byId("whatsapp-qr-label").value.trim(), message: byId("whatsapp-qr-mensagem").value.trim(), format: "SVG" };
        const errorBox = byId("whatsapp-qr-erro");
        try {
            if (qrId) {
                // Versão otimista: envia o updatedAt que a tela tinha ao abrir o
                // modal — se outra sessão já alterou este QR nesse meio-tempo, o
                // backend rejeita em vez de sobrescrever silenciosamente.
                const conhecido = state.qrCodes.find((item) => item.id === qrId);
                if (conhecido?.updatedAt) payload.expectedUpdatedAtMs = conhecido.updatedAt;
                await chamarUpdateQrCode(payload);
            } else {
                // Identificador idempotente por tentativa de criação — um duplo
                // clique ou um retry de rede nunca cria dois QR Codes na Meta.
                payload.idempotencyKey = (crypto.randomUUID ? crypto.randomUUID() : `qr-${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "").padEnd(20, "0");
                await chamarCreateQrCode(payload);
            }
            byId("whatsapp-qr-modal").close(); notify(qrId ? "QR Code atualizado." : "QR Code criado.", "success"); await load({ force: true });
        } catch (error) { errorBox.textContent = error?.message || "Não foi possível salvar o QR Code."; errorBox.classList.remove("hidden"); }
    }

    async function qrAction(action, qrId) {
        const qr = state.qrCodes.find((item) => item.id === qrId);
        if (!qr) return;
        if (action === "copiar") return copiar(qr.deepLinkUrl, "Link do QR Code copiado.");
        if (action === "editar") return openQrModal(qr);
        if (action === "imprimir") return window.open(qr.qrImageUrl || qr.deepLinkUrl, "_blank", "noopener,noreferrer");
        if (action === "excluir") {
            state.acaoAtual = { type: "delete-qr", qrId };
            byId("whatsapp-acao-titulo").textContent = "Excluir QR Code";
            byId("whatsapp-acao-descricao").textContent = `O QR Code "${qr.label}" deixará de funcionar. Esta ação não desconecta o WhatsApp.`;
            byId("whatsapp-acao-label-box").classList.add("hidden");
            byId("whatsapp-acao-confirmacao-box").classList.add("hidden");
            byId("whatsapp-acao-confirmar").textContent = "Excluir QR Code";
            byId("whatsapp-acao-modal").showModal();
        }
    }

    function copiar(text, success) {
        if (!text || !navigator.clipboard?.writeText) return notify("Não foi possível copiar automaticamente.", "error");
        navigator.clipboard.writeText(text).then(() => notify(success, "success")).catch(() => notify("Não foi possível copiar automaticamente.", "error"));
    }

    async function submitActionWithQr(event) {
        if (state.acaoAtual?.type !== "delete-qr") return submitAction(event);
        event.preventDefault();
        const qrId = state.acaoAtual.qrId;
        try { await chamarDeleteQrCode({ qrId }); byId("whatsapp-acao-modal").close(); notify("QR Code excluído.", "success"); await load({ force: true }); }
        catch (error) { byId("whatsapp-acao-erro").textContent = error?.message || "Não foi possível excluir o QR Code."; byId("whatsapp-acao-erro").classList.remove("hidden"); }
    }

    function bindEventos() {
        byId("whatsapp-btn-atualizar")?.addEventListener("click", () => load({ force: true }));
        byId("whatsapp-btn-tentar-novamente")?.addEventListener("click", () => load({ force: true }));
        byId("whatsapp-btn-conectar")?.addEventListener("click", () => openOnboarding());
        byId("whatsapp-onboarding-iniciar")?.addEventListener("click", startOnboarding);
        byId("whatsapp-onboarding-cancelar")?.addEventListener("click", cancelOnboarding);
        byId("whatsapp-onboarding-fechar")?.addEventListener("click", cancelOnboarding);
        byId("whatsapp-btn-abrir-atendimento")?.addEventListener("click", () => window.ativarAba?.("view-atendimento"));
        byId("whatsapp-btn-sincronizar-templates")?.addEventListener("click", sincronizarTemplates);
        byId("whatsapp-btn-validar")?.addEventListener("click", () => {
            const standard = conexaoPadrao() || state.conexoes[0];
            if (standard) validarConexao(standard.connectionId || "", Boolean(standard.legacy));
        });
        byId("whatsapp-template-filtros")?.addEventListener("click", (event) => { const button = event.target.closest("button[data-template-filter]"); if (button) { state.templateFilter = button.dataset.templateFilter; renderTemplates(); } });
        byId("whatsapp-conexoes-lista")?.addEventListener("click", (event) => {
            const button = event.target.closest("button[data-acao]"); if (!button) return;
            const action = button.dataset.acao; const connectionId = button.dataset.connectionId || ""; const legacy = button.dataset.legacy === "true"; const label = button.dataset.label || "";
            if (action === "validar") validarConexao(connectionId, legacy);
            if (action === "tornar-padrao") tornarPadrao(connectionId);
            if (action === "renomear") openActionModal("rename", connectionId, label);
            if (action === "reconectar") openOnboarding({ mode: "reconnect", connectionId });
            if (action === "desconectar") openActionModal("disconnect", connectionId, label);
            if (action === "qr") openQrModal(null, legacy ? "legacy" : connectionId);
        });
        byId("whatsapp-acao-form")?.addEventListener("submit", submitActionWithQr);
        ["whatsapp-acao-cancelar", "whatsapp-acao-fechar"].forEach((id) => byId(id)?.addEventListener("click", () => byId("whatsapp-acao-modal")?.close()));
        byId("whatsapp-btn-novo-qr")?.addEventListener("click", () => openQrModal());
        byId("whatsapp-qr-form")?.addEventListener("submit", submitQr);
        ["whatsapp-qr-cancelar", "whatsapp-qr-fechar"].forEach((id) => byId(id)?.addEventListener("click", () => byId("whatsapp-qr-modal")?.close()));
        byId("whatsapp-qr-lista")?.addEventListener("click", (event) => { const button = event.target.closest("[data-qr-acao]"); if (button) qrAction(button.dataset.qrAcao, button.dataset.qrId); });
        byId("whatsapp-onboarding-modal")?.addEventListener("cancel", (event) => { if (state.onboardingAtual?.critical) event.preventDefault(); });
    }

    return { load, bindEventos, openOnboarding };
}
