/* =========================================================
   VIDE HUB — WHATSAPP OFICIAL V1
   Controller da view #view-whatsapp-oficial: mostra o estado da conexão
   (nunca o token), permite validar a conexão e sincronizar templates
   aprovados. Onboarding V1 é só piloto assistido (scripts/provision-
   whatsapp-pilot.mjs, rodado por um administrador) — não existe botão
   de "conectar" que finja uma conexão real. Padrão de injeção igual a
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
    disconnected: "O WhatsApp Oficial ainda não foi conectado a esta loja.",
    pending_setup: "Peça a um administrador para provisionar o piloto assistido.",
    validating: "Validação em andamento.",
    connected: "O número está conectado e pronto para enviar/receber mensagens.",
    degraded: "A última validação encontrou um problema. Valide a conexão novamente.",
    suspended: "A conexão foi suspensa pela Meta ou pelo token revogado.",
    revoked: "A conexão foi desconectada. Peça a um administrador para reconectar."
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
    chamarConnectionStatus,
    chamarValidateConnection,
    chamarSyncTemplates
} = {}) {
    const state = {
        carregado: false,
        carregando: false,
        erro: false,
        semPermissao: false,
        conexao: null,
        validando: false,
        sincronizando: false
    };

    function byId(id) {
        return root.getElementById(id);
    }

    function isOwner() {
        return Boolean(context?.getSnapshot?.().isOwner);
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
            const resultado = await chamarConnectionStatus({});
            state.conexao = resultado || { status: "disconnected" };
            state.carregado = true;
            state.erro = false;
            state.semPermissao = false;
            renderConteudo();
            mostrarEstado("conteudo");
        } catch (erro) {
            if (erro?.code === "functions/permission-denied") {
                state.semPermissao = true;
                mostrarEstado("sem-permissao");
            } else {
                logger.error?.("[WhatsApp Oficial] Falha ao carregar status:", erro?.code, erro?.message);
                state.erro = true;
                mostrarEstado("erro");
            }
        } finally {
            state.carregando = false;
        }
    }

    function renderConteudo() {
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

        const syncEl = byId("whatsapp-card-templates-sync");
        if (syncEl) syncEl.textContent = `Última sincronização: ${formatarDataHora(conexao.lastTemplateSyncAt)}`;

        const diagVersao = byId("whatsapp-card-diagnostico-versao");
        if (diagVersao) diagVersao.textContent = conexao.graphVersion ? `Graph API ${conexao.graphVersion}` : "—";
        const diagErro = byId("whatsapp-card-diagnostico-erro");
        if (diagErro) diagErro.textContent = conexao.lastErrorCode ? `Último erro: ${conexao.lastErrorCode}` : "Nenhum erro recente";
        const diagValidacao = byId("whatsapp-card-diagnostico-validacao");
        if (diagValidacao) diagValidacao.textContent = `Última validação: ${formatarDataHora(conexao.lastValidatedAt)}`;

        const btnValidar = byId("whatsapp-btn-validar");
        if (btnValidar) btnValidar.disabled = !isOwner() || state.validando;
        const btnSync = byId("whatsapp-btn-sincronizar-templates");
        if (btnSync) btnSync.disabled = !conexao.connected || state.sincronizando;

        const acoesPiloto = byId("whatsapp-acoes-piloto-nao-conectado");
        if (acoesPiloto) acoesPiloto.hidden = status === "connected" || status === "degraded";
    }

    async function validarConexao() {
        if (typeof chamarValidateConnection !== "function" || state.validando) return;
        if (!isOwner()) {
            notify("Somente o dono da loja pode validar a conexão.", "error");
            return;
        }
        state.validando = true;
        renderConteudo();
        try {
            await chamarValidateConnection({});
            notify("Conexão validada com sucesso.", "success");
            await load({ force: true });
        } catch (erro) {
            notify(erro?.message || "Não foi possível validar a conexão agora.", "error");
        } finally {
            state.validando = false;
            renderConteudo();
        }
    }

    async function sincronizarTemplates() {
        if (typeof chamarSyncTemplates !== "function" || state.sincronizando) return;
        state.sincronizando = true;
        renderConteudo();
        try {
            const resultado = await chamarSyncTemplates({});
            notify(`Templates sincronizados (${resultado?.sincronizados ?? 0}).`, "success");
            await load({ force: true });
        } catch (erro) {
            notify(erro?.message || "Não foi possível sincronizar os templates agora.", "error");
        } finally {
            state.sincronizando = false;
            renderConteudo();
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
    }

    return { load, bindEventos };
}
