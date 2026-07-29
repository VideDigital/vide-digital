// Anonymous Auth no Chat Público V1 — lógica PURA (docs/ANONYMOUS_AUTH_CHAT_PUBLICO.md).
//
// Nenhum import de Firebase aqui de propósito: mesmo padrão já usado em
// pedidos-estruturados.js/atendimento.js — a parte que decide "isso é
// válido?"/"isso pertence a quem?" fica testável em Node puro, sem rede.
// public-chat-auth-v1.js reexporta tudo daqui e adiciona só a parte
// acoplada ao SDK (app secundário, Auth, Firestore, emulators).

export const VERSAO_ACESSO_CHAT_V2 = 2;
export const LIMITE_NOME_VISITANTE_CHAT = 120;

export function chavePublicChatV2(storeUid) {
    return `videPublicChatV2:${String(storeUid || "")}`;
}

export function serializarReferenciaChat({ chatId, visitorUid }) {
    return JSON.stringify({
        chatId: String(chatId || ""),
        visitorUid: String(visitorUid || ""),
        version: VERSAO_ACESSO_CHAT_V2
    });
}

// Nunca confia cegamente no que está salvo — só devolve uma referência com
// o formato exato esperado; qualquer divergência vira null (descartar, não
// tentar "consertar" o dado local).
export function parseReferenciaChatSalva(raw) {
    if (!raw || typeof raw !== "string") return null;
    let dados;
    try {
        dados = JSON.parse(raw);
    } catch (erro) {
        return null;
    }
    if (!dados || typeof dados !== "object" || Array.isArray(dados)) return null;
    if (typeof dados.chatId !== "string" || !dados.chatId) return null;
    if (typeof dados.visitorUid !== "string" || !dados.visitorUid) return null;
    if (dados.version !== VERSAO_ACESSO_CHAT_V2) return null;
    return { chatId: dados.chatId, visitorUid: dados.visitorUid, version: VERSAO_ACESSO_CHAT_V2 };
}

// O localStorage NUNCA concede acesso sozinho — só decide o que TENTAR
// restaurar. A referência só é aceita se o visitorUid salvo bater com o uid
// da sessão anônima atual (nunca um valor vindo de input/URL).
export function referenciaPertenceAoVisitante(referencia, visitorUidAtual) {
    return !!referencia && !!visitorUidAtual && referencia.visitorUid === visitorUidAtual;
}

export function chatV2PertenceALoja(chatData, storeUid) {
    if (!chatData || typeof chatData !== "object") return false;
    const donoUID = chatData.donoUID || chatData.emailDono || "";
    return !!storeUid && donoUID === storeUid;
}

// Confirmação final antes de religar qualquer listener: visitorUid bate,
// versão é V2, e o chat pertence à MESMA loja que está sendo visitada agora
// (nunca reutiliza chat entre lojas diferentes).
export function chatV2ValidoParaRestaurar(chatData, { visitorUidAtual, storeUid }) {
    if (!chatData || typeof chatData !== "object") return false;
    if (chatData.visitorUid !== visitorUidAtual) return false;
    if (chatData.versaoAcesso !== VERSAO_ACESSO_CHAT_V2) return false;
    return chatV2PertenceALoja(chatData, storeUid);
}

export function sanitizarNomeVisitanteChat(nomeBruto) {
    return String(nomeBruto || "").trim().slice(0, LIMITE_NOME_VISITANTE_CHAT);
}

// Nunca expõe UID, mensagem técnica de SDK, nem stack — só as mensagens
// previstas em "ERROS" do mandato, sempre em português, sempre recuperável.
export function normalizarErroChatPublico(error) {
    const codigo = String(error?.code || "");
    if (codigo === "auth/operation-not-allowed") {
        return "Não foi possível conectar o chat agora. Atualize a página e tente novamente.";
    }
    if (codigo === "auth/network-request-failed" || codigo === "unavailable") {
        return "Sem conexão no momento. Verifique sua internet e tente novamente.";
    }
    if (codigo === "permission-denied") {
        return "Sua conversa anterior não está mais disponível. Inicie uma nova.";
    }
    return "Não foi possível conectar o chat. Atualize a página e tente novamente.";
}
