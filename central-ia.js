export const CONFIG_IA_PADRAO = Object.freeze({
    ativo: false,
    nomeAssistente: "Assistente Virtual",
    mensagemApresentacao: "Olá! Sou a assistente virtual da loja. Como posso ajudar?",
    idioma: "pt-BR",
    personalidade: "amigavel",
    tamanhoResposta: "media",
    instrucoes: "",
    canais: Object.freeze({
        lojaPublica: false,
        sugestoesFuncionarios: false,
        respostasAutomaticas: false,
        criacaoConteudo: false,
        whatsapp: false
    }),
    modoRespostaAutomatica: "nunca",
    mensagemFallback: "Não encontrei essa informação. Vou encaminhar sua pergunta para nossa equipe."
});

export const IDIOMAS_IA = Object.freeze({
    "pt-BR": "Português do Brasil",
    en: "Inglês",
    es: "Espanhol",
    automatico: "Automático"
});

export const PERSONALIDADES_IA = Object.freeze({
    amigavel: "Amigável",
    profissional: "Profissional",
    direta: "Direta",
    consultiva: "Consultiva",
    vendedora: "Vendedora",
    suporte: "Suporte",
    personalizada: "Personalizada"
});

export const TAMANHOS_RESPOSTA_IA = Object.freeze({
    curta: "Curta",
    media: "Média",
    detalhada: "Detalhada"
});

export const MODOS_RESPOSTA_IA = Object.freeze({
    nunca: "Nunca responder automaticamente",
    sempre: "Sempre",
    fora_horario: "Fora do horário de atendimento",
    sem_funcionario: "Quando nenhum funcionário estiver disponível"
});

const CANAIS_IA = Object.freeze(Object.keys(CONFIG_IA_PADRAO.canais));

function texto(value, fallback = "") {
    return typeof value === "string" ? value : fallback;
}

function identificadorPermitido(value, allowed, fallback) {
    return Object.hasOwn(allowed, value) ? value : fallback;
}

export function normalizarConfiguracaoIA(value = {}) {
    const origem = value && typeof value === "object" ? value : {};
    const canais = origem.canais && typeof origem.canais === "object" ? origem.canais : {};

    return {
        ativo: origem.ativo === true,
        nomeAssistente: texto(origem.nomeAssistente, CONFIG_IA_PADRAO.nomeAssistente).trim(),
        mensagemApresentacao: texto(
            origem.mensagemApresentacao,
            CONFIG_IA_PADRAO.mensagemApresentacao
        ).trim(),
        idioma: identificadorPermitido(origem.idioma, IDIOMAS_IA, CONFIG_IA_PADRAO.idioma),
        personalidade: identificadorPermitido(
            origem.personalidade,
            PERSONALIDADES_IA,
            CONFIG_IA_PADRAO.personalidade
        ),
        tamanhoResposta: identificadorPermitido(
            origem.tamanhoResposta,
            TAMANHOS_RESPOSTA_IA,
            CONFIG_IA_PADRAO.tamanhoResposta
        ),
        instrucoes: texto(origem.instrucoes, CONFIG_IA_PADRAO.instrucoes),
        canais: CANAIS_IA.reduce((acc, key) => {
            acc[key] = canais[key] === true;
            return acc;
        }, {}),
        modoRespostaAutomatica: identificadorPermitido(
            origem.modoRespostaAutomatica,
            MODOS_RESPOSTA_IA,
            CONFIG_IA_PADRAO.modoRespostaAutomatica
        ),
        mensagemFallback: texto(
            origem.mensagemFallback,
            CONFIG_IA_PADRAO.mensagemFallback
        ).trim()
    };
}

export function validarConfiguracaoIA(value) {
    const config = normalizarConfiguracaoIA(value);
    const errors = {};

    if (config.nomeAssistente.length < 2) {
        errors.nomeAssistente = "Informe um nome com pelo menos 2 caracteres.";
    } else if (config.nomeAssistente.length > 40) {
        errors.nomeAssistente = "O nome pode ter no máximo 40 caracteres.";
    }

    if (config.mensagemApresentacao.length > 300) {
        errors.mensagemApresentacao = "A mensagem pode ter no máximo 300 caracteres.";
    }

    if (config.instrucoes.length > 5000) {
        errors.instrucoes = "As instruções podem ter no máximo 5.000 caracteres.";
    }

    if (!config.mensagemFallback) {
        errors.mensagemFallback = "Informe a mensagem de fallback.";
    } else if (config.mensagemFallback.length > 300) {
        errors.mensagemFallback = "A mensagem pode ter no máximo 300 caracteres.";
    }

    if (!Object.hasOwn(IDIOMAS_IA, config.idioma)) errors.idioma = "Selecione um idioma válido.";
    if (!Object.hasOwn(PERSONALIDADES_IA, config.personalidade)) errors.personalidade = "Selecione uma personalidade válida.";
    if (!Object.hasOwn(TAMANHOS_RESPOSTA_IA, config.tamanhoResposta)) errors.tamanhoResposta = "Selecione um tamanho válido.";
    if (!Object.hasOwn(MODOS_RESPOSTA_IA, config.modoRespostaAutomatica)) errors.modoRespostaAutomatica = "Selecione um modo válido.";

    if (CANAIS_IA.some(key => typeof config.canais[key] !== "boolean")) {
        errors.canais = "Os locais de uso precisam ter valores válidos.";
    }

    return { valid: Object.keys(errors).length === 0, errors, config };
}

export function configuracaoIaTemAlteracoes(current, persisted) {
    return JSON.stringify(normalizarConfiguracaoIA(current)) !==
        JSON.stringify(normalizarConfiguracaoIA(persisted));
}

export function criarPayloadConfiguracaoIA(config, identity, timestamp, existing = false) {
    const normalized = normalizarConfiguracaoIA(config);
    const storeUid = String(identity?.storeUid || "").trim();
    const authUid = String(identity?.authUid || "").trim();

    if (!storeUid || !authUid) {
        throw new Error("Identidade autenticada inválida para a configuração de IA.");
    }

    const payload = {
        ...normalized,
        tenantId: storeUid,
        lojaId: storeUid,
        atualizadoEm: timestamp,
        atualizadoPor: authUid
    };

    if (!existing) {
        payload.criadoEm = timestamp;
        payload.criadoPor = authUid;
    }

    return payload;
}

export function criarCentralIAController({
    db,
    context,
    firestore,
    notify = () => {},
    logger = console,
    root = document
}) {
    const state = {
        initialized: false,
        loading: false,
        saving: false,
        loadError: false,
        exists: false,
        persisted: normalizarConfiguracaoIA(CONFIG_IA_PADRAO)
    };

    const byId = id => root.getElementById(id);
    const form = () => byId("central-ia-form");

    function collect() {
        const currentForm = form();
        if (!currentForm) return normalizarConfiguracaoIA(CONFIG_IA_PADRAO);

        return normalizarConfiguracaoIA({
            ativo: byId("ia-ativo")?.checked,
            nomeAssistente: byId("ia-nome-assistente")?.value,
            mensagemApresentacao: byId("ia-mensagem-apresentacao")?.value,
            idioma: byId("ia-idioma")?.value,
            personalidade: byId("ia-personalidade")?.value,
            tamanhoResposta: byId("ia-tamanho-resposta")?.value,
            instrucoes: byId("ia-instrucoes")?.value,
            canais: CANAIS_IA.reduce((acc, key) => {
                acc[key] = byId(`ia-canal-${key}`)?.checked === true;
                return acc;
            }, {}),
            modoRespostaAutomatica: byId("ia-modo-resposta")?.value,
            mensagemFallback: byId("ia-mensagem-fallback")?.value
        });
    }

    function setText(id, value) {
        const element = byId(id);
        if (element) element.textContent = value;
    }

    function setSwitchState(input) {
        if (!input) return;
        input.setAttribute("aria-checked", String(input.checked));
        const label = root.querySelector(`[data-switch-state-for="${input.id}"]`);
        if (label) label.textContent = input.checked ? "Ativada" : "Desativada";
    }

    function renderErrors(errors) {
        root.querySelectorAll("[data-ia-error-for]").forEach(element => {
            const key = element.getAttribute("data-ia-error-for");
            element.textContent = errors[key] || "";
            element.classList.toggle("is-visible", Boolean(errors[key]));
        });
    }

    function renderSelectable(group, value) {
        root.querySelectorAll(`[data-ia-option-group="${group}"]`).forEach(button => {
            const selected = button.dataset.value === value;
            button.classList.toggle("is-selected", selected);
            button.setAttribute("aria-pressed", String(selected));
        });
    }

    function renderSummary(config) {
        setText("ia-resumo-nome", config.nomeAssistente || "—");
        setText("ia-resumo-personalidade", PERSONALIDADES_IA[config.personalidade] || "—");
        setText("ia-resumo-idioma", IDIOMAS_IA[config.idioma] || "—");
        setText("ia-resumo-resposta", TAMANHOS_RESPOSTA_IA[config.tamanhoResposta] || "—");
        setText("ia-resumo-status", config.ativo ? "Ativada" : "Desativada");
        setText("ia-resumo-canais", String(Object.values(config.canais).filter(Boolean).length));

        const badge = byId("ia-status-badge");
        if (badge) {
            badge.textContent = config.ativo ? "IA ativa" : "IA desativada";
            badge.classList.toggle("is-active", config.ativo);
        }
    }

    function updateCounters() {
        setText("ia-contador-apresentacao", `${byId("ia-mensagem-apresentacao")?.value.length || 0}/300`);
        setText("ia-contador-instrucoes", `${byId("ia-instrucoes")?.value.length || 0}/5.000`);
        setText("ia-contador-fallback", `${byId("ia-mensagem-fallback")?.value.length || 0}/300`);
    }

    function updateAutomaticModeDependency(config) {
        const select = byId("ia-modo-resposta");
        const hint = byId("ia-modo-resposta-dependencia");
        if (!select) return;
        select.disabled = !config.canais.respostasAutomaticas;
        if (hint) hint.hidden = config.canais.respostasAutomaticas;
    }

    function updateState() {
        const current = collect();
        const validation = validarConfiguracaoIA(current);
        const dirty = configuracaoIaTemAlteracoes(current, state.persisted);
        const snapshot = context.getSnapshot();
        const canEdit = snapshot.active && state.initialized && !state.loadError && context.canEdit("central-ia");
        const saveButton = byId("ia-salvar");

        renderErrors(validation.errors);
        renderSummary(current);
        renderSelectable("personalidade", current.personalidade);
        renderSelectable("tamanhoResposta", current.tamanhoResposta);
        updateCounters();
        updateAutomaticModeDependency(current);
        root.querySelectorAll("#central-ia-form input[type=checkbox]").forEach(setSwitchState);

        setText("ia-unsaved-status", dirty ? "Alterações não salvas" : "Configurações atualizadas");
        byId("ia-unsaved-status")?.classList.toggle("is-dirty", dirty);

        if (saveButton) {
            saveButton.disabled = state.loading || state.saving || !canEdit || !dirty || !validation.valid;
            saveButton.textContent = state.saving ? "Salvando..." : "Salvar configurações";
        }

        return { current, validation, dirty, canEdit };
    }

    function fill(config) {
        const normalized = normalizarConfiguracaoIA(config);
        byId("ia-ativo").checked = normalized.ativo;
        byId("ia-nome-assistente").value = normalized.nomeAssistente;
        byId("ia-mensagem-apresentacao").value = normalized.mensagemApresentacao;
        byId("ia-idioma").value = normalized.idioma;
        byId("ia-personalidade").value = normalized.personalidade;
        byId("ia-tamanho-resposta").value = normalized.tamanhoResposta;
        byId("ia-instrucoes").value = normalized.instrucoes;
        CANAIS_IA.forEach(key => {
            byId(`ia-canal-${key}`).checked = normalized.canais[key];
        });
        byId("ia-modo-resposta").value = normalized.modoRespostaAutomatica;
        byId("ia-mensagem-fallback").value = normalized.mensagemFallback;
        updateState();
    }

    function setLoading(loading) {
        state.loading = loading;
        byId("ia-loading")?.classList.toggle("hidden", !loading);
        byId("ia-content")?.classList.toggle("hidden", loading);
        form()?.setAttribute("aria-busy", String(loading));
        updateState();
    }

    function applyPermission() {
        const snapshot = context.getSnapshot();
        const canEdit = snapshot.active && context.canEdit("central-ia");
        const fieldset = byId("ia-fieldset");
        const notice = byId("ia-readonly-notice");
        if (fieldset) fieldset.disabled = !canEdit;
        if (notice) notice.hidden = canEdit;
        updateState();
    }

    async function load({ force = false } = {}) {
        if ((state.initialized && !force) || state.loading) return;
        const snapshot = context.getSnapshot();
        if (!snapshot.active || !context.canView("central-ia")) return;

        const storeUid = snapshot.storeUid;
        if (!storeUid) return;

        setLoading(true);
        setText("ia-load-error-message", "");
        byId("ia-load-error")?.classList.remove("is-visible");
        try {
            const ref = firestore.doc(db, "configuracoes_ia", storeUid);
            const snap = await firestore.getDoc(ref);
            state.exists = snap.exists();
            state.loadError = false;
            state.persisted = normalizarConfiguracaoIA(
                state.exists ? snap.data() : CONFIG_IA_PADRAO
            );
            fill(state.persisted);
            state.initialized = true;
            applyPermission();
        } catch (error) {
            logger.error("[Central de IA] Erro ao carregar configuração:", error);
            state.loadError = true;
            if (!state.initialized) fill(state.persisted);
            setText("ia-load-error-message", "Não foi possível carregar as configurações.");
            byId("ia-load-error")?.classList.add("is-visible");
            if (byId("ia-fieldset")) byId("ia-fieldset").disabled = true;
        } finally {
            setLoading(false);
        }
    }

    async function save(event) {
        event?.preventDefault?.();
        if (state.saving) return;

        const ui = updateState();
        if (!ui.canEdit) {
            notify("Você tem acesso somente leitura neste módulo.", "error");
            return;
        }
        if (!ui.validation.valid || !ui.dirty) return;

        const snapshot = context.getSnapshot();
        state.saving = true;
        updateState();

        try {
            const timestamp = firestore.serverTimestamp();
            const payload = criarPayloadConfiguracaoIA(
                ui.validation.config,
                { storeUid: snapshot.storeUid, authUid: snapshot.authUid },
                timestamp,
                state.exists
            );
            const ref = firestore.doc(db, "configuracoes_ia", snapshot.storeUid);
            await firestore.setDoc(ref, payload, { merge: true });
            state.exists = true;
            state.persisted = normalizarConfiguracaoIA(ui.validation.config);
            notify("Configurações da IA salvas com sucesso.", "success");
        } catch (error) {
            logger.error("[Central de IA] Erro ao salvar configuração:", error);
            notify("Não foi possível salvar as configurações. Tente novamente.", "error");
        } finally {
            state.saving = false;
            updateState();
        }
    }

    function bind() {
        const currentForm = form();
        if (!currentForm || currentForm.dataset.bound === "true") return;
        currentForm.dataset.bound = "true";
        currentForm.addEventListener("submit", save);
        currentForm.addEventListener("input", updateState);
        currentForm.addEventListener("change", updateState);

        root.querySelectorAll("[data-ia-option-group]").forEach(button => {
            button.addEventListener("click", () => {
                const targetId = button.dataset.iaOptionGroup === "personalidade"
                    ? "ia-personalidade"
                    : "ia-tamanho-resposta";
                byId(targetId).value = button.dataset.value;
                updateState();
            });
        });
    }

    bind();

    return { load, save, collect, fill, updateState, getState: () => ({ ...state }) };
}
