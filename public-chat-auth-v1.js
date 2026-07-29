// Anonymous Auth no Chat Público V1 (docs/ANONYMOUS_AUTH_CHAT_PUBLICO.md).
//
// Responsabilidade única deste módulo: dar ao visitante da loja pública uma
// identidade real (Firebase Anonymous Auth) vinculada ao chat que ele cria,
// substituindo "conhecer o id do chat" como única capability. Não modela
// chats/mensagens/eventos (isso continua em loja.html, único dono do
// contrato — este módulo só entrega auth/db prontos e a lógica de
// restaurar/descartar a referência local).
//
// A lógica pura (sem Firebase, testável em Node puro) mora em
// public-chat-auth-core.js e é reexportada abaixo — mesma separação já
// usada em pedidos-estruturados.js/orders-engine-v1.js.
//
// Instância Firebase SECUNDÁRIA e exclusiva: a loja pública pode ser aberta
// no mesmo navegador em que o dono está logado no dashboard (app principal,
// firebase-init.js). Reaproveitar a instância principal aqui derrubaria a
// sessão do dono. Mesmo firebaseConfig, app nomeado à parte — o padrão
// oficial do SDK pra múltiplas instâncias no mesmo processo.
import { initializeApp, getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    browserLocalPersistence,
    connectAuthEmulator,
    getAuth,
    onAuthStateChanged,
    setPersistence,
    signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
    connectFirestoreEmulator,
    doc,
    getDoc,
    getFirestore
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { firebaseConfig, shouldUseVideEmulators } from "./firebase-init.js";
import {
    LIMITE_NOME_VISITANTE_CHAT,
    VERSAO_ACESSO_CHAT_V2,
    chatV2PertenceALoja,
    chatV2ValidoParaRestaurar,
    chavePublicChatV2,
    normalizarErroChatPublico,
    parseReferenciaChatSalva,
    referenciaPertenceAoVisitante,
    sanitizarNomeVisitanteChat,
    serializarReferenciaChat
} from "./public-chat-auth-core.js";

export {
    VERSAO_ACESSO_CHAT_V2,
    LIMITE_NOME_VISITANTE_CHAT,
    chatV2PertenceALoja,
    chatV2ValidoParaRestaurar,
    chavePublicChatV2,
    normalizarErroChatPublico,
    parseReferenciaChatSalva,
    referenciaPertenceAoVisitante,
    sanitizarNomeVisitanteChat,
    serializarReferenciaChat
} from "./public-chat-auth-core.js";

export const PUBLIC_CHAT_APP_NAME = "vide-public-chat";

// ===== Ciclo de vida do app/Auth/Firestore secundários =====

let instancia = null;
let persistenciaPronta = null;
let estadoInicialPromise = null;
let criacaoAnonimaEmAndamento = null;

function obterAppPublico() {
    try {
        return getApp(PUBLIC_CHAT_APP_NAME);
    } catch (erro) {
        // getApp() lança quando o app nomeado ainda não existe — é o
        // caminho esperado na primeira chamada desta sessão.
        return initializeApp(firebaseConfig, PUBLIC_CHAT_APP_NAME);
    }
}

function garantirInstancia() {
    if (instancia) return instancia;

    const app = obterAppPublico();
    const auth = getAuth(app);
    const db = getFirestore(app);

    if (shouldUseVideEmulators() && !window.__videPublicChatEmulatorsConnected) {
        connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
        connectFirestoreEmulator(db, "127.0.0.1", 8080);
        window.__videPublicChatEmulatorsConnected = true;
    }

    instancia = { app, auth, db };
    return instancia;
}

export function obterAuthPublico() {
    return garantirInstancia().auth;
}

export function obterDbPublico() {
    return garantirInstancia().db;
}

// Resolve com o usuário já presente na sessão persistida (localStorage do
// Auth) OU null se não havia nenhum — nunca cria uma conta anônima nova só
// pra checar isso (evita conta descartável em toda visita que nunca abre o
// chat).
function aguardarEstadoInicial(auth) {
    if (!estadoInicialPromise) {
        estadoInicialPromise = new Promise((resolve) => {
            const cancelar = onAuthStateChanged(auth, (user) => {
                cancelar();
                resolve(user || null);
            });
        });
    }
    return estadoInicialPromise;
}

// Lazy no primeiro uso: só cria (ou reutiliza) a conta anônima quando o
// visitante realmente inicia/restaura um chat — nunca no carregamento da
// página. Clique duplicado é seguro: chamadas concorrentes reutilizam a
// mesma promise em andamento em vez de criar duas contas.
export async function garantirVisitanteAnonimo() {
    const { auth } = garantirInstancia();

    if (!persistenciaPronta) {
        persistenciaPronta = setPersistence(auth, browserLocalPersistence).catch((erro) => {
            // Sem persistência local o SDK ainda funciona (memória, dura a
            // aba) — não é motivo pra travar o chat.
            console.warn("[Vide Hub] Chat público: não foi possível definir persistência local.", erro);
        });
    }
    await persistenciaPronta;

    const usuarioInicial = await aguardarEstadoInicial(auth);
    if (usuarioInicial) return usuarioInicial.uid;
    if (auth.currentUser) return auth.currentUser.uid;

    if (!criacaoAnonimaEmAndamento) {
        criacaoAnonimaEmAndamento = signInAnonymously(auth)
            .then((credencial) => credencial.user.uid)
            .finally(() => {
                criacaoAnonimaEmAndamento = null;
            });
    }
    return criacaoAnonimaEmAndamento;
}

function acessarLocalStorage() {
    try {
        return window.localStorage;
    } catch (erro) {
        return null;
    }
}

export function salvarChatAtual(storeUid, chatId, visitorUid) {
    const storage = acessarLocalStorage();
    if (!storage) return;
    try {
        storage.setItem(chavePublicChatV2(storeUid), serializarReferenciaChat({ chatId, visitorUid }));
    } catch (erro) {
        // localStorage indisponível (modo privado, quota) não deve travar
        // o chat — só perde a restauração no próximo reload.
    }
}

export function limparChatSalvo(storeUid) {
    const storage = acessarLocalStorage();
    if (!storage) return;
    try {
        storage.removeItem(chavePublicChatV2(storeUid));
    } catch (erro) {
        // idem acima.
    }
}

// Fluxo completo de restauração (ver "SESSÃO E RESTAURAÇÃO" do mandato):
// 1. obtém o usuário anônimo (existente ou o mesmo já persistido);
// 2. compara o UID salvo localmente com o da sessão atual;
// 3. faz get() do chat pelo Firestore secundário;
// 4-6. confirma visitorUid, donoUID da loja atual e versão;
// 7. só então devolve os dados pra loja.html religar os listeners.
// Qualquer falha nesse caminho remove a referência local e devolve null —
// nunca revela se o chat pertence a outro visitante.
export async function restaurarChatSalvo(storeUid) {
    const storage = acessarLocalStorage();
    const raw = storage ? storage.getItem(chavePublicChatV2(storeUid)) : null;
    const referencia = parseReferenciaChatSalva(raw);
    if (!referencia) return null;

    let visitorUidAtual;
    try {
        visitorUidAtual = await garantirVisitanteAnonimo();
    } catch (erro) {
        return null;
    }

    if (!referenciaPertenceAoVisitante(referencia, visitorUidAtual)) {
        limparChatSalvo(storeUid);
        return null;
    }

    const { db } = garantirInstancia();
    try {
        const snap = await getDoc(doc(db, "chats", referencia.chatId));
        if (!snap.exists()) {
            limparChatSalvo(storeUid);
            return null;
        }
        const dados = snap.data();
        if (!chatV2ValidoParaRestaurar(dados, { visitorUidAtual, storeUid })) {
            limparChatSalvo(storeUid);
            return null;
        }
        return { chatId: referencia.chatId, visitorUid: visitorUidAtual, status: dados.status || "nova" };
    } catch (erro) {
        limparChatSalvo(storeUid);
        return null;
    }
}
