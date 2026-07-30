/* =========================================================
   VIDE HUB — MÓDULO WHATSAPP (multiconexão, Fase 4)
   Controller da view #view-whatsapp-oficial — SEPARADO da Central de
   Atendimento: aqui só se administra a(s) conexão(ões) oficial(is) do
   WhatsApp (nunca envia/recebe mensagem de cliente). Mostra o estado da
   conexão (nunca o token nem o tokenSecretResource completo), lista as
   conexões da loja (até 2), permite validar/tornar padrão e sincronizar
   templates oficiais aprovados. Onboarding V1 continua só piloto
   assistido (scripts/provision-whatsapp-pilot.mjs, rodado por um
   administrador) — não existe botão de "conectar" que finja uma conexão
   real, nem formulário manual de token/ID. Padrão de injeção igual a
   audit-center-v1.js/central-ia.js: nunca importa Firebase direto.
   ========================================================= */

const ROTULO_STATUS = Object.freeze({
    disconnected: "Não configurado",
    pending_setup: "Aguardando piloto",
    validating: "Validando",
    connected: "Conectado",
    degraded: "Atenção",
    suspended: "Suspenso",
    revoked: "Revogado"
});

const DESCRICAO_STATUS = Object.freeze({
    disconnected: "Nenhuma conexão do WhatsApp está ativa para esta loja.",
    pending_setup: "Peça a um administrador para provisionar o piloto assistido.",
    validating: "Validação em andamento.",
    connected: "A conexão ativa está pronta para enviar/receber mensagens.",
    degraded: "A última validação encontrou um problema. Valide a conexão novamente.",
    suspended: "A conexão foi suspensa pela Meta ou pelo token revogado.",
    revoked: "A conexão foi desconectada. Peça a um administrador para reconectar."
});

const ROTULO_PROVIDER_MODE = Object.freeze({
    official_cloud: "Número dedicado (Cloud API)",
    official_coexistence: "Coexistência (número compartilhado)"
});

function escaparHtml(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
}

function formatarDataHora(valor) {
    if (!valor) return "—";
    const ms = typeof valor?.toMillis === "function" ? valor.toMillis() : Number(valor);
    if (!Number.isFinite(ms) || ms <= 0) return "—";
    return new Date(ms).toLocaleString("pt-BR");
}

export function criarWhatsappOficialController({
    context,
    notify = () => {},
    logger = console,
    root = document,
    db,
    firestore,
    chamarConnectionStatus,
    chamarValidateConnection,
    chamarSyncTemplates,
    chamarListConnections,
    chamarSetDefaultConnection
} = {}) {
    const state = {
        carregado: false,
        carregando: false,
        erro: false,
        semPermissao: false,
        conexao: null,
        conexoes: [],
        totalConexoes: 0,
        maxConexoes: 2,
        limiteAtingido: false,
        templates: [],
        carregandoTemplates: false,
        validando: false,
        sincronizando: false,
        conexaoEmAcao: ""
    };

    function byId(id) {
        return root.getElementById(id);
    }

    function podeGerenciar() {
        return Boolean(context?.canEdit?.("whatsapp"));
    }

    function webhookUrl() {
        // A URL do webhook é fixa por projeto (mesma pra todo tenant) —
        // publicada no deploy real, nunca inventada aqui. Placeholder
        // óbvio até o deploy dedicado da Fase B preencher o valor real.
        return "https://southamerica-east1-vide-digital-saas.cloudfunctions.net/whatsappWebhook";
    }

    function mostrarEstado(nome) {
        const estados = ["carregando", "erro", "sem-permissao", "conteudo"];
        estados.forEach((estado) => {
            const elemento = byId(`whatsapp-estado-${estado}`);
            if (elemento) elemento.classList.toggle("hidden", estado !== nome);
        });
    }

    async function load({ force = false } = {}) {
        if (state.carregado && !force) {
            mostrarEstado(state.semPermissao ? "sem-permissao" : "conteudo");
            return;
        }
        if (typeof chamarConnectionStatus !== "function") {
            state.erro = true;
            mostrarEstado("erro");
            return;
        }
        state.carregando = true;
        mostrarEstado("carregando");
        try {
            const [statusResultado] = await Promise.all([
                chamarConnectionStatus({}),
                carregarConexoes(),
                carregarTemplates()
            ]);
            state.conexao = statusResultado || { status: "disconnected" };
            state.carregado = true;
            state.erro = false;
            state.semPermissao = false;
            renderTudo();
            mostrarEstado("conteudo");
        } catch (erro) {
            if (erro?.code === "functions/permission-denied") {
                state.semPermissao = true;
                mostrarEstado("sem-permissao");
            } else {
                logger.error?.("[WhatsApp] Falha ao carregar status:", erro?.code, erro?.message);
                state.erro = true;
                mostrarEstado("erro");
            }
        } finally {
            state.carregando = false;
        }
    }

    async function carregarConexoes() {
        if (typeof chamarListConnections !== "function") return;
        try {
            const resultado = await chamarListConnections({});
            state.conexoes = Array.isArray(resultado?.conexoes) ? resultado.conexoes : [];
            state.totalConexoes = Number(resultado?.total || 0);
            state.maxConexoes = Number(resultado?.maxConexoes || 2);
            state.limiteAtingido = Boolean(resultado?.limiteAtingido);
        } catch (erro) {
            // Nunca derruba a view inteira por causa da lista de conexões
            // — o status principal (chamarConnectionStatus) já garante o
            // essencial (conexão ativa). Só loga.
            logger.error?.("[WhatsApp] Falha ao listar conexões:", erro?.code, erro?.message);
            state.conexoes = [];
        }
    }

    async function carregarTemplates() {
        if (!db || !firestore || typeof firestore.collection !== "function") return;
        const ownerUid = context?.getOwnerUid?.() || "";
        if (!ownerUid) return;
        state.carregandoTemplates = true;
        try {
            const { collection, query, where, getDocs } = firestore;
            const snap = await getDocs(query(
                collection(db, "whatsapp_templates"),
                where("ownerUid", "==", ownerUid),
                where("status", "==", "APPROVED")
            ));
            state.templates = snap.docs.map((d) => d.data());
        } catch (erro) {
            logger.error?.("[WhatsApp] Falha ao listar templates:", erro?.code, erro?.message);
            state.templates = [];
        } finally {
            state.carregandoTemplates = false;
        }
    }

    function renderTudo() {
        renderDiagnostico();
        renderVisaoGeral();
        renderConexoes();
        renderAdicionar();
        renderTemplates();
        renderEquipe();
    }

    function renderDiagnostico() {
        const conexao = state.conexao || { status: "disconnected" };
        const status = conexao.status || "disconnected";

        const badge = byId("whatsapp-status-badge");
        if (badge) {
            badge.textContent = ROTULO_STATUS[status] || status;
            badge.className = `aura-whatsapp-badge is-status-${escaparHtml(status)}`;
        }
        const descricao = byId("whatsapp-status-descricao");
        if (descricao) descricao.textContent = DESCRICAO_STATUS[status] || "";

        const numero = byId("whatsapp-card-numero-valor");
        if (numero) numero.textContent = conexao.displayPhoneNumber || "—";
        const nomeVerificado = byId("whatsapp-card-numero-nome");
        if (nomeVerificado) nomeVerificado.textContent = conexao.verifiedName ? `Nome verificado: ${conexao.verifiedName}` : "";

        const tokenEl = byId("whatsapp-card-conexao-token");
        if (tokenEl) tokenEl.textContent = conexao.connected ? (conexao.tokenMasked || "•••••••• conectado") : "Nenhum token conectado";

        const webhookEl = byId("whatsapp-card-webhook-status");
        if (webhookEl) webhookEl.textContent = conexao.webhookSubscribed ? "Inscrito e recebendo eventos" : "Ainda não confirmado";
        const webhookUltimo = byId("whatsapp-card-webhook-ultimo");
        if (webhookUltimo) webhookUltimo.textContent = `Último evento: ${formatarDataHora(conexao.lastWebhookAt)}`;
        const webhookInput = byId("whatsapp-webhook-url");
        if (webhookInput) webhookInput.value = webhookUrl();

        const qualidadeEl = byId("whatsapp-card-qualidade-valor");
        if (qualidadeEl) qualidadeEl.textContent = conexao.qualityRating || "—";
        const limiteEl = byId("whatsapp-card-qualidade-limite");
        if (limiteEl) limiteEl.textContent = conexao.messagingLimitTier ? `Limite de mensagens: ${conexao.messagingLimitTier}` : "";

        const diagVersao = byId("whatsapp-card-diagnostico-versao");
        if (diagVersao) diagVersao.textContent = conexao.graphVersion ? `Graph API ${conexao.graphVersion}` : "—";
        const diagErro = byId("whatsapp-card-diagnostico-erro");
        if (diagErro) diagErro.textContent = conexao.lastErrorCode ? `Último erro: ${conexao.lastErrorCode}` : "Nenhum erro recente";
        const diagValidacao = byId("whatsapp-card-diagnostico-validacao");
        if (diagValidacao) diagValidacao.textContent = `Última validação: ${formatarDataHora(conexao.lastValidatedAt)}`;

        const btnValidar = byId("whatsapp-btn-validar");
        if (btnValidar) btnValidar.disabled = !podeGerenciar() || state.validando;

        const acoesPiloto = byId("whatsapp-acoes-piloto-nao-conectado");
        if (acoesPiloto) acoesPiloto.hidden = status === "connected" || status === "degraded";
    }

    function conexaoPadrao() {
        return state.conexoes.find((c) => c.isDefault) || null;
    }

    function renderVisaoGeral() {
        const totalEl = byId("whatsapp-visao-total-conexoes");
        if (totalEl) totalEl.textContent = String(state.totalConexoes || (state.conexao?.connected ? 1 : 0));
        const limiteEl = byId("whatsapp-visao-limite");
        if (limiteEl) limiteEl.textContent = String(state.maxConexoes || 2);

        const padrao = conexaoPadrao();
        const padraoLabel = byId("whatsapp-visao-padrao-label");
        if (padraoLabel) padraoLabel.textContent = padrao ? (padrao.label || (padrao.legacy ? "Piloto (conexão legada)" : "Conexão")) : "Nenhuma conexão ativa";
        const padraoNumero = byId("whatsapp-visao-padrao-numero");
        if (padraoNumero) padraoNumero.textContent = padrao?.displayPhoneNumber || "";

        const ultimoDiag = byId("whatsapp-visao-ultimo-diagnostico");
        if (ultimoDiag) ultimoDiag.textContent = formatarDataHora(state.conexao?.lastValidatedAt);

        const avisosEl = byId("whatsapp-visao-avisos");
        if (avisosEl) {
            const avisos = [];
            if (state.conexoes.length === 0 && !state.conexao?.connected) {
                avisos.push("Nenhuma conexão configurada ainda para esta loja.");
            }
            if (state.limiteAtingido) {
                avisos.push(`Limite de ${state.maxConexoes} conexões atingido — não é possível adicionar outra agora.`);
            }
            if (state.conexao?.status === "degraded" || state.conexao?.status === "suspended" || state.conexao?.status === "revoked") {
                avisos.push("A conexão ativa precisa de atenção — veja o Diagnóstico abaixo.");
            }
            avisosEl.innerHTML = avisos.map((a) => `<li>${escaparHtml(a)}</li>`).join("");
            avisosEl.classList.toggle("hidden", avisos.length === 0);
        }
    }

    function renderConexoes() {
        const lista = byId("whatsapp-conexoes-lista");
        const vazio = byId("whatsapp-conexoes-vazio");
        if (!lista) return;

        if (state.conexoes.length === 0) {
            lista.innerHTML = "";
            if (vazio) vazio.classList.remove("hidden");
            return;
        }
        if (vazio) vazio.classList.add("hidden");

        const gerenciar = podeGerenciar();
        lista.innerHTML = state.conexoes.map((c) => {
            const idAcao = c.legacy ? "" : c.connectionId;
            const emAcao = state.conexaoEmAcao === (idAcao || "legacy");
            const botaoValidar = gerenciar
                ? `<button type="button" class="aura-whatsapp-btn" data-acao="validar" data-connection-id="${escaparHtml(idAcao)}" ${emAcao ? "disabled" : ""}>Validar</button>`
                : "";
            const botaoPadrao = (gerenciar && !c.legacy && !c.isDefault)
                ? `<button type="button" class="aura-whatsapp-btn" data-acao="tornar-padrao" data-connection-id="${escaparHtml(idAcao)}" ${emAcao ? "disabled" : ""}>Tornar padrão</button>`
                : "";
            return `
<div class="aura-whatsapp-card">
<h3>${escaparHtml(c.label || (c.legacy ? "Piloto (conexão legada)" : "Conexão"))} ${c.isDefault ? '<span class="aura-whatsapp-badge is-status-connected">Padrão</span>' : '<span class="aura-whatsapp-badge is-status-disconnected">Secundária</span>'}</h3>
<p>${escaparHtml(c.displayPhoneNumber || "—")}</p>
<p class="aura-whatsapp-card-sub">${escaparHtml(ROTULO_PROVIDER_MODE[c.providerMode] || c.providerMode || "—")}</p>
<p class="aura-whatsapp-card-sub">Status: ${escaparHtml(ROTULO_STATUS[c.status] || c.status || "—")}${c.qualityRating ? ` · Qualidade: ${escaparHtml(c.qualityRating)}` : ""}</p>
<p class="aura-whatsapp-card-sub">Última validação: ${formatarDataHora(c.lastValidatedAt)}</p>
<div class="aura-whatsapp-acoes-finais">${botaoValidar}${botaoPadrao}</div>
</div>`;
        }).join("");
    }

    function renderAdicionar() {
        const aviso = byId("whatsapp-adicionar-limite-aviso");
        if (aviso) aviso.classList.toggle("hidden", !state.limiteAtingido);
    }

    function renderTemplates() {
        const syncEl = byId("whatsapp-card-templates-sync");
        if (syncEl) syncEl.textContent = `Última sincronização: ${formatarDataHora(state.conexao?.lastTemplateSyncAt)}`;

        const btnSync = byId("whatsapp-btn-sincronizar-templates");
        if (btnSync) btnSync.disabled = !podeGerenciar() || !state.conexao?.connected || state.sincronizando;

        const lista = byId("whatsapp-templates-lista");
        const vazio = byId("whatsapp-templates-vazio");
        if (!lista) return;
        if (state.templates.length === 0) {
            lista.innerHTML = "";
            if (vazio) vazio.classList.remove("hidden");
            return;
        }
        if (vazio) vazio.classList.add("hidden");
        lista.innerHTML = state.templates.map((t) => `
<div class="aura-whatsapp-card">
<h3>${escaparHtml(t.name || "—")}</h3>
<p class="aura-whatsapp-card-sub">Idioma: ${escaparHtml(t.language || "—")} · Categoria: ${escaparHtml(t.category || "—")}</p>
<p class="aura-whatsapp-card-sub">Status: ${escaparHtml(t.status || "—")}</p>
</div>`).join("");
    }

    function renderEquipe() {
        const padrao = conexaoPadrao();
        const label = byId("whatsapp-equipe-padrao-label");
        if (label) {
            label.textContent = padrao
                ? `${padrao.label || (padrao.legacy ? "Piloto (conexão legada)" : "Conexão")}${padrao.displayPhoneNumber ? ` — ${padrao.displayPhoneNumber}` : ""}`
                : "Nenhuma conexão padrão definida";
        }
    }

    async function validarConexao() {
        if (typeof chamarValidateConnection !== "function" || state.validando) return;
        if (!podeGerenciar()) {
            notify("Você não tem permissão para gerenciar o WhatsApp desta loja.", "error");
            return;
        }
        state.validando = true;
        renderDiagnostico();
        try {
            await chamarValidateConnection({ connectionId: state.conexao?.legacy ? "" : (state.conexao?.connectionId || "") });
            notify("Conexão validada com sucesso.", "success");
            await load({ force: true });
        } catch (erro) {
            notify(erro?.message || "Não foi possível validar a conexão agora.", "error");
        } finally {
            state.validando = false;
            renderDiagnostico();
        }
    }

    async function validarConexaoCartao(connectionId) {
        if (typeof chamarValidateConnection !== "function") return;
        if (!podeGerenciar()) {
            notify("Você não tem permissão para gerenciar o WhatsApp desta loja.", "error");
            return;
        }
        state.conexaoEmAcao = connectionId || "legacy";
        renderConexoes();
        try {
            await chamarValidateConnection({ connectionId: connectionId || "" });
            notify("Conexão validada com sucesso.", "success");
            await load({ force: true });
        } catch (erro) {
            notify(erro?.message || "Não foi possível validar esta conexão agora.", "error");
        } finally {
            state.conexaoEmAcao = "";
            renderConexoes();
        }
    }

    async function tornarPadrao(connectionId) {
        if (typeof chamarSetDefaultConnection !== "function" || !connectionId) return;
        if (!podeGerenciar()) {
            notify("Você não tem permissão para gerenciar o WhatsApp desta loja.", "error");
            return;
        }
        state.conexaoEmAcao = connectionId;
        renderConexoes();
        try {
            await chamarSetDefaultConnection({ connectionId });
            notify("Conexão padrão atualizada.", "success");
            await load({ force: true });
        } catch (erro) {
            notify(erro?.message || "Não foi possível alterar a conexão padrão agora.", "error");
        } finally {
            state.conexaoEmAcao = "";
            renderConexoes();
        }
    }

    async function sincronizarTemplates() {
        if (typeof chamarSyncTemplates !== "function" || state.sincronizando) return;
        if (!podeGerenciar()) {
            notify("Você não tem permissão para gerenciar o WhatsApp desta loja.", "error");
            return;
        }
        state.sincronizando = true;
        renderTemplates();
        try {
            const resultado = await chamarSyncTemplates({});
            notify(`Templates sincronizados (${resultado?.sincronizados ?? 0}).`, "success");
            await load({ force: true });
        } catch (erro) {
            notify(erro?.message || "Não foi possível sincronizar os templates agora.", "error");
        } finally {
            state.sincronizando = false;
            renderTemplates();
        }
    }

    function copiarParaAreaTransferencia(texto, mensagemSucesso) {
        if (!navigator.clipboard?.writeText) {
            notify("Não foi possível copiar automaticamente — selecione o texto manualmente.", "error");
            return;
        }
        navigator.clipboard.writeText(texto)
            .then(() => notify(mensagemSucesso, "success"))
            .catch(() => notify("Não foi possível copiar automaticamente.", "error"));
    }

    function montarChecklist() {
        return [
            "Checklist de configuração do WhatsApp Oficial (Meta):",
            "1. Criar/usar um Meta App em modo Business.",
            "2. Configurar um Business Portfolio verificado.",
            "3. Solicitar Advanced Access para whatsapp_business_messaging e whatsapp_business_management.",
            "4. Criar/associar a WhatsApp Business Account (WABA) e o número de telefone.",
            `5. Configurar o webhook: ${webhookUrl()}`,
            "6. Definir o Verify Token no Secret Manager (WHATSAPP_WEBHOOK_VERIFY_TOKEN).",
            "7. Gerar um token de sistema de longa duração e guardá-lo com segurança.",
            "8. Rodar scripts/provision-whatsapp-pilot.mjs com um administrador."
        ].join("\n");
    }

    function bindEventos() {
        byId("whatsapp-btn-validar")?.addEventListener("click", validarConexao);
        byId("whatsapp-btn-sincronizar-templates")?.addEventListener("click", sincronizarTemplates);
        byId("whatsapp-btn-abrir-atendimento")?.addEventListener("click", () => {
            if (typeof window.ativarAba === "function") window.ativarAba("view-atendimento");
        });
        byId("whatsapp-btn-copiar-webhook")?.addEventListener("click", () => {
            copiarParaAreaTransferencia(webhookUrl(), "URL do webhook copiada.");
        });
        byId("whatsapp-btn-copiar-checklist")?.addEventListener("click", () => {
            copiarParaAreaTransferencia(montarChecklist(), "Checklist copiado.");
        });
        byId("whatsapp-btn-atualizar")?.addEventListener("click", () => load({ force: true }));
        byId("whatsapp-btn-tentar-novamente")?.addEventListener("click", () => load({ force: true }));

        byId("whatsapp-conexoes-lista")?.addEventListener("click", (evento) => {
            const botao = evento.target.closest("button[data-acao]");
            if (!botao) return;
            const acao = botao.getAttribute("data-acao");
            const connectionId = botao.getAttribute("data-connection-id") || "";
            if (acao === "validar") validarConexaoCartao(connectionId);
            if (acao === "tornar-padrao") tornarPadrao(connectionId);
        });
    }

    return { load, bindEventos };
}
