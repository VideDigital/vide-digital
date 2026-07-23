// IA de Negócio PÚBLICA — um visitante da loja (sem login) conversa com
// uma IA real (Google Gemini, via Cloud Function askPublicBusinessAI)
// sobre o catálogo da loja. Ver docs/IA_NEGOCIO.md.
//
// Este módulo NUNCA chama o provedor de IA diretamente — só a Cloud
// Function faz isso. A Function nunca expõe pedidos/leads/receita nesse
// modo (ver functions/src/ai/promptBuilder.js,
// montarContextoNegocioPublico) — só o catálogo de produtos ativos.
//
// Deliberadamente um módulo PRÓPRIO, não uma extensão de ia-negocio.js:
// aquele é pro DONO autenticado (com plano/permissão/contexto de sessão);
// este é pro visitante anônimo, sem nada disso — misturar os dois
// contextos num só controller criaria um lugar fácil de vazar dado
// interno pro público por engano.

import { sanitizarPerguntaUI, LIMITES_IA_NEGOCIO_UI } from "./ia-negocio.js";

export { sanitizarPerguntaUI, LIMITES_IA_NEGOCIO_UI };

// Mesmo formato mínimo de ia-negocio.js (construirHistoricoParaEnvio),
// mas pro autor "visitante" em vez de "dono" — a Cloud Function só
// distingue "ia" do resto, então o nome exato do outro autor não importa
// pra ela, mas importa pra UI (bolhas alinhadas certas).
export function construirHistoricoPublicoParaEnvio(mensagens) {
    return (Array.isArray(mensagens) ? mensagens : [])
        .filter((m) => m.autor === "visitante" || m.autor === "ia")
        .slice(-LIMITES_IA_NEGOCIO_UI.maxHistoricoEnviado)
        .map((m) => ({ autor: m.autor, texto: String(m.texto || "") }));
}

function mensagemErroAmigavelPublica(error) {
    const codigo = String(error?.code || "").replace(/^functions\//, "");
    if (codigo === "unauthenticated") {
        return "Sessão expirada. Recarregue a página e tente novamente.";
    }
    // A Function sempre lança HttpsError com mensagem já pronta em
    // português (ver functions/src/ai/index.js, askPublicBusinessAI) —
    // preferir sempre essa mensagem real a um texto fixo genérico.
    return error?.message || "Não foi possível falar com a assistente agora. Tente novamente.";
}

export function criarIaNegocioPublicaController({
    storeSlug,
    chamarAskPublicBusinessAI,
    notify = () => {},
    logger = console
}) {
    const state = {
        mensagens: [],
        enviando: false,
        erro: ""
    };

    // Mesmo motivo de ia-negocio.js: sem isso, a UI só atualizaria depois
    // que a resposta (ou erro) já tivesse chegado, porque o await da
    // Cloud Function suspende a função inteira antes de qualquer outro
    // render acontecer.
    let aoAtualizar = () => {};

    function definirOuvinte(fn) {
        aoAtualizar = typeof fn === "function" ? fn : () => {};
    }

    async function enviarPergunta(textoBruto) {
        if (state.enviando) return null;
        const pergunta = sanitizarPerguntaUI(textoBruto);
        if (!pergunta) return null;
        if (!storeSlug) {
            notify("Não foi possível identificar esta loja.", "error");
            return null;
        }

        const historico = construirHistoricoPublicoParaEnvio(state.mensagens);
        state.mensagens.push({ autor: "visitante", texto: pergunta, quando: Date.now() });
        state.mensagens = state.mensagens.slice(-LIMITES_IA_NEGOCIO_UI.maxMensagensExibidas);
        state.enviando = true;
        state.erro = "";
        aoAtualizar();

        try {
            const resultado = await chamarAskPublicBusinessAI({ storeSlug, pergunta, historico });
            state.mensagens.push({ autor: "ia", texto: resultado?.resposta || "", quando: Date.now() });
            state.mensagens = state.mensagens.slice(-LIMITES_IA_NEGOCIO_UI.maxMensagensExibidas);
            return resultado;
        } catch (error) {
            logger.error("[IA de Negócio pública] Erro ao perguntar:", error);
            const mensagem = mensagemErroAmigavelPublica(error);
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

    return {
        enviarPergunta,
        limparConversa,
        definirOuvinte,
        state
    };
}
