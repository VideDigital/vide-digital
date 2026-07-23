// IA de Negócio — o DONO da loja conversa com uma IA real (Google Gemini,
// via Cloud Function askBusinessAI) sobre o próprio negócio: produtos,
// pedidos, o que melhorar. Ver docs/IA_NEGOCIO.md.
//
// Este módulo NUNCA chama o provedor de IA diretamente — só a Cloud
// Function faz isso, com a chave guardada como secret do Firebase
// Functions. Aqui só existe a chamada autenticada (httpsCallable,
// injetada por quem instancia o controller) e a UI de chat.

export const LIMITES_IA_NEGOCIO_UI = Object.freeze({
    maxCaracteresPergunta: 800,
    maxHistoricoEnviado: 8,
    maxMensagensExibidas: 60
});

// Mesma lista de PLANOS_COM_IA_REAL da Cloud Function (functions/src/ai/
// index.js) — duplicada de propósito: o frontend só usa isso pra
// melhorar a experiência (evitar uma chamada que sabidamente vai falhar
// e mostrar a mensagem de upgrade direto); quem decide de verdade é
// sempre o servidor, que valida o plano de novo antes de gastar 1 token.
export const PLANOS_COM_IA_REAL = Object.freeze(["pro", "proplus", "agencia", "enterprise", "premium"]);

export function planoTemIaReal(plano) {
    return PLANOS_COM_IA_REAL.includes(String(plano || "").toLowerCase());
}

export function sanitizarPerguntaUI(texto) {
    const limpo = String(texto || "").trim().replace(/\s+/g, " ");
    return limpo.length > LIMITES_IA_NEGOCIO_UI.maxCaracteresPergunta
        ? limpo.slice(0, LIMITES_IA_NEGOCIO_UI.maxCaracteresPergunta)
        : limpo;
}

// Formato mínimo que a Cloud Function espera — nunca envia o objeto de
// mensagem inteiro (que tem timestamps/ids só de interesse da UI).
export function construirHistoricoParaEnvio(mensagens) {
    return (Array.isArray(mensagens) ? mensagens : [])
        .filter((m) => m.autor === "dono" || m.autor === "ia")
        .slice(-LIMITES_IA_NEGOCIO_UI.maxHistoricoEnviado)
        .map((m) => ({ autor: m.autor, texto: String(m.texto || "") }));
}

function mensagemErroAmigavel(error) {
    const codigo = String(error?.code || "").replace(/^functions\//, "");
    if (codigo === "resource-exhausted") {
        return error?.message || "Limite mensal de mensagens da IA de Negócio atingido.";
    }
    if (codigo === "permission-denied") {
        return error?.message || "A IA de Negócio é exclusiva do plano Pro (ou superior).";
    }
    if (codigo === "unauthenticated") {
        return "Sessão expirada. Recarregue a página e faça login novamente.";
    }
    if (codigo === "unavailable") {
        return "A IA não respondeu a tempo. Tente novamente em instantes.";
    }
    return "Não foi possível falar com a IA agora. Tente novamente.";
}

export function criarIaNegocioController({
    context,
    chamarAskBusinessAI,
    notify = () => {},
    logger = console
}) {
    const state = {
        mensagens: [],
        enviando: false,
        erro: "",
        restanteNoMes: null,
        disponivel: false
    };

    function atualizarDisponibilidade() {
        const snapshot = context.getSnapshot();
        state.disponivel = Boolean(snapshot.active) && context.canEdit("central-ia") && planoTemIaReal(snapshot.plan);
        return state.disponivel;
    }

    async function enviarPergunta(textoBruto) {
        if (state.enviando) return null;
        const pergunta = sanitizarPerguntaUI(textoBruto);
        if (!pergunta) return null;

        if (!atualizarDisponibilidade()) {
            notify("A IA de Negócio é exclusiva do plano Pro (ou superior).", "error");
            return null;
        }

        const historico = construirHistoricoParaEnvio(state.mensagens);
        state.mensagens.push({ autor: "dono", texto: pergunta, quando: Date.now() });
        state.mensagens = state.mensagens.slice(-LIMITES_IA_NEGOCIO_UI.maxMensagensExibidas);
        state.enviando = true;
        state.erro = "";

        try {
            const resultado = await chamarAskBusinessAI({ pergunta, historico });
            state.mensagens.push({ autor: "ia", texto: resultado?.resposta || "", quando: Date.now() });
            state.mensagens = state.mensagens.slice(-LIMITES_IA_NEGOCIO_UI.maxMensagensExibidas);
            state.restanteNoMes = Number.isFinite(resultado?.restanteNoMes) ? resultado.restanteNoMes : state.restanteNoMes;
            return resultado;
        } catch (error) {
            logger.error("[IA de Negócio] Erro ao perguntar:", error);
            const mensagem = mensagemErroAmigavel(error);
            state.erro = mensagem;
            notify(mensagem, "error");
            return null;
        } finally {
            state.enviando = false;
        }
    }

    function limparConversa() {
        state.mensagens = [];
        state.erro = "";
    }

    atualizarDisponibilidade();

    return {
        enviarPergunta,
        limparConversa,
        atualizarDisponibilidade,
        state
    };
}
