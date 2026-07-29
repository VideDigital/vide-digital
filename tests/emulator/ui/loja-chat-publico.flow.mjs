// Anonymous Auth no Chat Público V1 (docs/ANONYMOUS_AUTH_CHAT_PUBLICO.md).
//
// Fluxo profundo real: visitante anônimo inicia um chat V2 na loja pública,
// troca mensagens, recarrega a página e recupera a MESMA conversa (mesma
// sessão anônima persistida); um segundo visitante (contexto de navegador
// isolado, sem a referência local) nunca herda essa conversa — nem mesmo
// forjando a referência local com o chatId/visitorUid reais do primeiro
// visitante, porque a sessão anônima da SUA PRÓPRIA aba tem outro uid. O
// dono responde pelo painel e a resposta chega em tempo real pro visitante
// original. Confirma via Admin SDK que mensagens/eventos do chat V2 têm
// autoria real (nunca autorUid vazio), diferente do contrato legado V1.
import assert from "node:assert/strict";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
    captureDiagnostics,
    coletarErrosConsole,
    ehErroDeRedeExterno,
    launchBrowser,
    loginReal,
    startStaticServer
} from "./_helpers.mjs";

const PROJECT_ID = "demo-vide-hub";
const STORE_SLUG = "loja-pro-local";
const STORE_UID = "owner-pro";
const NOME_VISITANTE = `Visitante Playwright QA ${Date.now()}`;
const TEMAS_PUBLICOS = ["light", "dark"];
const MATRIZ_VIEWPORTS_PUBLICOS = [
    { width: 1920, height: 1080, zooms: [1, 1.25] },
    { width: 1440, height: 900, zooms: [1, 1.25] },
    { width: 1366, height: 768, zooms: [1, 1.25] },
    { width: 1280, height: 720, zooms: [1, 1.25] },
    { width: 1024, height: 768, zooms: [1] },
    { width: 768, height: 1024, zooms: [1] },
    { width: 430, height: 932, zooms: [1] },
    { width: 390, height: 844, zooms: [1] }
];

function adminDb() {
    if (!getApps().length) {
        initializeApp({ projectId: PROJECT_ID });
    }
    return getFirestore();
}

async function ativarIaPublicaNoEmulator() {
    const db = adminDb();
    await db.collection("usuarios").doc(STORE_UID).set({ iaNegocioPublicaAtiva: true }, { merge: true });
    await db.collection("vitrines_publicas").doc(STORE_SLUG).set({ iaNegocioPublicaAtiva: true }, { merge: true });
    const snap = await db.collection("vitrines_publicas").doc(STORE_SLUG).get();
    assert.equal(snap.data()?.iaNegocioPublicaAtiva, true, "Fixture da loja pública deveria ativar IA pública");
}

async function abrirLojaPublica(page, baseUrl, { tema = "light" } = {}) {
    await page.addInitScript((temaInicial) => {
        window.localStorage.setItem("lovable-theme", temaInicial);
    }, tema);
    await page.goto(`${baseUrl}/loja.html?loja=${STORE_SLUG}&useEmulator=true`, {
        waitUntil: "load",
        timeout: 30000
    });
    await page.waitForSelector("#chat-trigger-btn", { state: "visible", timeout: 20000 });
    await page.waitForFunction(
        () => typeof window.toggleChatWindow === "function" && typeof window.toggleIaNegocioPublicaWindow === "function",
        undefined,
        { timeout: 20000 }
    );
    await page.evaluate(() => {
        document.getElementById("widget-ia-negocio-publica")?.classList.remove("hidden");
    });
    await page.waitForFunction(
        () => !document.getElementById("widget-ia-negocio-publica")?.classList.contains("hidden"),
        undefined,
        { timeout: 20000 }
    );
}

async function abrirEIniciarConversa(page) {
    await page.waitForSelector("#chat-trigger-btn", { state: "visible", timeout: 20000 });
    await page.waitForFunction(
        () => typeof window.toggleChatWindow === "function",
        undefined,
        { timeout: 20000 }
    );
    await page.click("#chat-trigger-btn");
    await esperarChatAberto(page);
    await page.waitForSelector("#chat-client-input", { state: "visible", timeout: 10000 });
}

async function esperarChatAberto(page) {
    await page.waitForFunction(
        () => !document.getElementById("chat-window")?.classList.contains("hidden"),
        undefined,
        { timeout: 10000 }
    );
}

async function esperarChatFechado(page) {
    await page.waitForFunction(
        () => document.getElementById("chat-window")?.classList.contains("hidden"),
        undefined,
        { timeout: 10000 }
    );
}

async function esperarIaAberta(page) {
    await page.waitForFunction(
        () => {
            const janela = document.getElementById("ia-negocio-publica-window");
            const widget = document.getElementById("widget-ia-negocio-publica");
            if (!janela || !widget || janela.classList.contains("hidden")) return false;
            const estiloJanela = window.getComputedStyle(janela);
            const estiloWidget = window.getComputedStyle(widget);
            const rect = janela.getBoundingClientRect();
            return estiloJanela.display !== "none"
                && estiloJanela.visibility !== "hidden"
                && estiloWidget.visibility !== "hidden"
                && estiloWidget.pointerEvents !== "none"
                && rect.width > 0
                && rect.height > 0;
        },
        undefined,
        { timeout: 10000 }
    );
}

async function esperarIaFechada(page) {
    await page.waitForFunction(
        () => document.getElementById("ia-negocio-publica-window")?.classList.contains("hidden"),
        undefined,
        { timeout: 10000 }
    );
}

async function esperarChatConectado(page, timeout = 20000) {
    await page.waitForFunction(
        () => document.getElementById("chat-client-input")?.placeholder === "Escreva sua mensagem...",
        undefined,
        { timeout }
    );
}

async function obterEstadoWidgetsPublicos(page) {
    return page.evaluate(() => {
        function visivel(el) {
            if (!el || el.classList.contains("hidden")) return false;
            const estilo = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return estilo.display !== "none"
                && estilo.visibility !== "hidden"
                && Number(estilo.opacity || 1) !== 0
                && rect.width > 0
                && rect.height > 0;
        }

        function estadoBotaoEnviar() {
            const botao = document.getElementById("chat-send-btn");
            if (!botao) return { existe: false };
            const rect = botao.getBoundingClientRect();
            const centro = {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2
            };
            const topo = document.elementFromPoint(centro.x, centro.y);
            const pilha = document.elementsFromPoint(centro.x, centro.y).slice(0, 5).map((el) => ({
                tag: el.tagName,
                id: el.id || "",
                className: typeof el.className === "string" ? el.className : ""
            }));
            return {
                existe: true,
                disabled: botao.disabled,
                rect: {
                    left: rect.left,
                    top: rect.top,
                    right: rect.right,
                    bottom: rect.bottom,
                    width: rect.width,
                    height: rect.height
                },
                totalmenteVisivel: rect.left >= 0
                    && rect.top >= 0
                    && rect.right <= window.innerWidth
                    && rect.bottom <= window.innerHeight,
                centroRecebeClique: topo === botao || botao.contains(topo),
                topo: topo ? {
                    tag: topo.tagName,
                    id: topo.id || "",
                    className: typeof topo.className === "string" ? topo.className : ""
                } : null,
                pilha
            };
        }

        const widgetIa = document.getElementById("widget-ia-negocio-publica");
        const botaoIa = document.getElementById("ia-negocio-publica-trigger");
        const janelaIa = document.getElementById("ia-negocio-publica-window");
        const janelaChat = document.getElementById("chat-window");
        const inputChat = document.getElementById("chat-client-input");
        const botaoChat = document.getElementById("chat-send-btn");

        return {
            tema: document.documentElement.getAttribute("data-theme"),
            chatVisivel: visivel(janelaChat),
            chatAriaBusy: janelaChat?.getAttribute("aria-busy") || "",
            inputChatDisabled: !!inputChat?.disabled,
            botaoChatDisabled: !!botaoChat?.disabled,
            iaWidgetVisivel: visivel(widgetIa),
            iaJanelaVisivel: visivel(janelaIa),
            iaSuprimida: widgetIa?.getAttribute("data-public-widget-suppressed") || "",
            iaWidgetPointerEvents: widgetIa ? window.getComputedStyle(widgetIa).pointerEvents : "",
            iaBotaoPointerEvents: botaoIa ? window.getComputedStyle(botaoIa).pointerEvents : "",
            iaBotaoDisabled: !!botaoIa?.disabled,
            iaBotaoTabIndex: botaoIa?.tabIndex ?? null,
            iaBotaoAriaHidden: widgetIa?.getAttribute("aria-hidden") || "",
            iaBotaoAcessivelPorTeclado: !!botaoIa && !botaoIa.disabled && botaoIa.tabIndex >= 0,
            botaoEnviar: estadoBotaoEnviar(),
            larguraDocumento: document.documentElement.scrollWidth,
            larguraViewport: document.documentElement.clientWidth
        };
    });
}

async function validarEstadoChatFechadoIaVisivel(page, contexto) {
    await page.waitForFunction(
        () => {
            const widget = document.getElementById("widget-ia-negocio-publica");
            const botao = document.getElementById("ia-negocio-publica-trigger");
            if (!widget || !botao) return false;
            const estilo = window.getComputedStyle(widget);
            return !widget.classList.contains("hidden")
                && !widget.hasAttribute("data-public-widget-suppressed")
                && estilo.pointerEvents !== "none"
                && estilo.visibility !== "hidden"
                && !botao.disabled
                && botao.tabIndex >= 0;
        },
        undefined,
        { timeout: 3000 }
    );
    const estado = await obterEstadoWidgetsPublicos(page);
    assert.equal(estado.chatVisivel, false, `${contexto}: chat deveria estar fechado`);
    assert.equal(estado.iaJanelaVisivel, false, `${contexto}: janela da IA deveria estar fechada`);
    assert.equal(estado.iaWidgetVisivel, true, `${contexto}: botão flutuante da IA deveria estar visível`);
    assert.equal(estado.iaSuprimida, "", `${contexto}: IA não deveria estar suprimida`);
    assert.notEqual(estado.iaWidgetPointerEvents, "none", `${contexto}: widget da IA deveria aceitar pointer-events`);
    assert.equal(estado.iaBotaoDisabled, false, `${contexto}: botão da IA não deveria estar disabled`);
    assert.equal(estado.iaBotaoAcessivelPorTeclado, true, `${contexto}: botão da IA deveria estar acessível por teclado`);
}

async function validarEstadoChatAbertoIaOculta(page, contexto) {
    await page.waitForFunction(
        () => {
            const widget = document.getElementById("widget-ia-negocio-publica");
            if (!widget) return false;
            const estilo = window.getComputedStyle(widget);
            return widget.getAttribute("data-public-widget-suppressed") === "chat-open"
                && estilo.pointerEvents === "none"
                && estilo.visibility === "hidden";
        },
        undefined,
        { timeout: 3000 }
    );
    const estado = await obterEstadoWidgetsPublicos(page);
    assert.equal(estado.chatVisivel, true, `${contexto}: chat deveria estar aberto`);
    assert.equal(estado.iaJanelaVisivel, false, `${contexto}: janela da IA deveria estar fechada`);
    assert.equal(estado.iaWidgetVisivel, false, `${contexto}: botão flutuante da IA deveria estar oculto`);
    assert.equal(estado.iaSuprimida, "chat-open", `${contexto}: widget da IA deveria estar suprimido pelo chat`);
    assert.equal(estado.iaWidgetPointerEvents, "none", `${contexto}: widget da IA deveria sair do hit-test`);
    assert.equal(estado.iaBotaoDisabled, true, `${contexto}: botão da IA deveria ficar disabled`);
    assert.equal(estado.iaBotaoTabIndex, -1, `${contexto}: botão da IA deveria sair da tabulação`);
    assert.equal(estado.botaoEnviar.existe, true, `${contexto}: botão enviar deveria existir`);
    assert.equal(estado.botaoEnviar.disabled, false, `${contexto}: botão enviar deveria estar clicável`);
    assert.equal(estado.botaoEnviar.totalmenteVisivel, true, `${contexto}: botão enviar deveria estar totalmente visível`);
    assert.equal(estado.botaoEnviar.centroRecebeClique, true, `${contexto}: centro do botão enviar deveria receber o clique; topo=${JSON.stringify(estado.botaoEnviar.topo)} pilha=${JSON.stringify(estado.botaoEnviar.pilha)}`);
}

async function validarAlternanciaChatIa(page, contexto) {
    await abrirEIniciarConversa(page);
    await validarEstadoChatAbertoIaOculta(page, `${contexto} / chat aberto`);

    await page.click("#chat-trigger-btn");
    await esperarChatFechado(page);
    await validarEstadoChatFechadoIaVisivel(page, `${contexto} / chat fechado`);

    await abrirEIniciarConversa(page);
    await page.evaluate(() => window.toggleIaNegocioPublicaWindow(true));
    await esperarChatFechado(page);
    await esperarIaAberta(page);
    let estado = await obterEstadoWidgetsPublicos(page);
    assert.equal(estado.chatVisivel, false, `${contexto}: abrir IA deveria fechar o chat`);
    assert.equal(estado.iaJanelaVisivel, true, `${contexto}: IA deveria abrir`);

    await page.evaluate(() => window.toggleChatWindow(true));
    await esperarIaFechada(page);
    await esperarChatAberto(page);
    estado = await obterEstadoWidgetsPublicos(page);
    assert.equal(estado.chatVisivel, true, `${contexto}: abrir chat deveria fechar a IA`);
    assert.equal(estado.iaJanelaVisivel, false, `${contexto}: IA deveria ficar fechada ao abrir chat`);

    await page.click("#chat-trigger-btn");
    await esperarChatFechado(page);
}

async function atrasarCadastroAnonimoParaValidarLoading(page) {
    await page.evaluate(() => {
        if (window.__videTesteFetchComDelay) return;
        const fetchOriginal = window.fetch.bind(window);
        window.__videTesteFetchComDelay = true;
        window.fetch = (...args) => {
            const destino = String(args[0]?.url || args[0] || "");
            if (destino.includes("accounts:signUp")) {
                return new Promise((resolve, reject) => {
                    window.setTimeout(() => {
                        fetchOriginal(...args).then(resolve, reject);
                    }, 500);
                });
            }
            return fetchOriginal(...args);
        };
    });
}

async function esperarEstadoConectando(page, contexto) {
    await page.waitForFunction(
        () => {
            const janela = document.getElementById("chat-window");
            const input = document.getElementById("chat-client-input");
            const botao = document.getElementById("chat-send-btn");
            return janela?.getAttribute("aria-busy") === "true" && input?.disabled === true && botao?.disabled === true;
        },
        undefined,
        { timeout: 5000 }
    );
    const estado = await obterEstadoWidgetsPublicos(page);
    assert.equal(estado.chatAriaBusy, "true", `${contexto}: aria-busy deveria estar true`);
    assert.equal(estado.inputChatDisabled, true, `${contexto}: input deveria ficar disabled`);
    assert.equal(estado.botaoChatDisabled, true, `${contexto}: botão deveria ficar disabled`);
}

async function validarRestauracaoTransitoriaOuLiberada(page, contexto) {
    try {
        await esperarEstadoConectando(page, contexto);
    } catch (erro) {
        await validarComposerLiberado(page, `${contexto} já finalizada`);
    }
}

async function validarComposerLiberado(page, contexto) {
    const estado = await obterEstadoWidgetsPublicos(page);
    assert.equal(estado.chatAriaBusy, "false", `${contexto}: aria-busy deveria voltar para false`);
    assert.equal(estado.inputChatDisabled, false, `${contexto}: input deveria ser liberado`);
    assert.equal(estado.botaoChatDisabled, false, `${contexto}: botão deveria ser liberado`);
}

async function validarErroUnicoDeConexao(browser, baseUrl) {
    const contexto = await browser.newContext({ viewport: { width: 430, height: 932 } });
    const page = await contexto.newPage();
    const erros = coletarErrosConsole(page);
    try {
        await abrirLojaPublica(page, baseUrl, { tema: "light" });
        await abrirEIniciarConversa(page);
        await contexto.setOffline(true);

        for (const nome of ["Visitante Offline 1", "Visitante Offline 2"]) {
            await page.fill("#chat-client-input", nome);
            await page.click("#chat-send-btn");
            await page.waitForFunction(
                () => document.querySelectorAll("[data-chat-connection-error]").length === 1,
                undefined,
                { timeout: 15000 }
            );
            await validarComposerLiberado(page, `erro de conexão / ${nome}`);
        }

        const quantidadeAlertas = await page.evaluate(
            () => document.querySelectorAll("[data-chat-connection-error]").length
        );
        assert.equal(quantidadeAlertas, 1, "Erro de conexão repetido não deveria duplicar alertas");
    } finally {
        await contexto.setOffline(false).catch(() => {});
        const errosInesperados = erros.filter((msg) => !ehErroDeRedeExterno(msg));
        assert.deepEqual(errosInesperados, [], `Erro único de conexão não deveria emitir console.error: ${errosInesperados.join("\n")}`);
        await contexto.close();
    }
}

// Fase B (docs/ANONYMOUS_AUTH_CHAT_PUBLICO.md): sem fallback legado, uma
// falha de Anonymous Auth (aqui simulada como auth/operation-not-allowed,
// interceptando a chamada REST do signInAnonymously) nunca mais cria um
// chat V1 — só mostra um erro único, amigável e recuperável, com o
// composer pronto pra uma nova tentativa controlada.
async function validarFalhaAuthAnonimaSemFallbackV1(browser, baseUrl) {
    const nomeTentativa = `Visitante Sem Auth ${Date.now()}`;
    const contexto = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await contexto.newPage();
    const erros = coletarErrosConsole(page);
    try {
        await abrirLojaPublica(page, baseUrl, { tema: "light" });
        await page.evaluate(() => {
            const fetchOriginal = window.fetch.bind(window);
            window.fetch = (...args) => {
                const destino = String(args[0]?.url || args[0] || "");
                if (destino.includes("accounts:signUp")) {
                    return Promise.resolve(new Response(
                        JSON.stringify({ error: { code: 400, message: "OPERATION_NOT_ALLOWED" } }),
                        { status: 400, headers: { "Content-Type": "application/json" } }
                    ));
                }
                return fetchOriginal(...args);
            };
        });

        await abrirEIniciarConversa(page);
        await page.fill("#chat-client-input", nomeTentativa);
        await page.click("#chat-send-btn");

        await page.waitForFunction(
            () => document.querySelectorAll("[data-chat-connection-error]").length === 1,
            undefined,
            { timeout: 15000 }
        );
        await validarComposerLiberado(page, "Anonymous Auth indisponível");

        const mensagemErro = await page.evaluate(
            () => document.querySelector("[data-chat-connection-error]")?.textContent || ""
        );
        assert.ok(mensagemErro.length > 0, "Deveria mostrar uma mensagem de erro amigável");
        assert.ok(
            !/auth\/|firebase|uid|stack/i.test(mensagemErro),
            `Erro de Anonymous Auth indisponível nunca deveria expor detalhe técnico: ${mensagemErro}`
        );

        const db = adminDb();
        let chatsSnap = await db.collection("chats").where("clienteNome", "==", nomeTentativa).get();
        assert.equal(chatsSnap.size, 0, "Falha de Anonymous Auth nunca deveria criar chat nenhum (nem V1 nem V2) — sem fallback");

        // Retry controlado: recarrega a página (a interceptação foi feita
        // via evaluate, não addInitScript, então some no reload) e tenta de
        // novo — deveria funcionar normalmente e nascer V2, nunca V1.
        await page.reload({ waitUntil: "load", timeout: 30000 });
        await abrirEIniciarConversa(page);
        await page.fill("#chat-client-input", nomeTentativa);
        await page.click("#chat-send-btn");
        await esperarChatConectado(page);
        await validarComposerLiberado(page, "retry após falha de Anonymous Auth");

        chatsSnap = await db.collection("chats").where("clienteNome", "==", nomeTentativa).get();
        assert.equal(chatsSnap.size, 1, "Nova tentativa (retry) deveria criar exatamente um chat");
        assert.equal(chatsSnap.docs[0].data().versaoAcesso, 2, "Retry bem-sucedido deveria nascer V2, nunca cair pra V1");
    } finally {
        const errosInesperados = erros.filter((msg) => !ehErroDeRedeExterno(msg));
        assert.deepEqual(errosInesperados, [], `Falha de Anonymous Auth: não deveria emitir console.error: ${errosInesperados.join("\n")}`);
        await contexto.close();
    }
}

async function validarMatrizVisualWidgets(browser, baseUrl) {
    for (const viewport of MATRIZ_VIEWPORTS_PUBLICOS) {
        for (const zoom of viewport.zooms) {
            for (const tema of TEMAS_PUBLICOS) {
                const cssViewport = {
                    width: Math.floor(viewport.width / zoom),
                    height: Math.floor(viewport.height / zoom)
                };
                const contexto = await browser.newContext({ viewport: cssViewport });
                const page = await contexto.newPage();
                const erros = coletarErrosConsole(page);
                const rotulo = `${viewport.width}x${viewport.height} zoom ${Math.round(zoom * 100)}% tema ${tema}`;
                try {
                    await abrirLojaPublica(page, baseUrl, { tema });
                    let estado = await obterEstadoWidgetsPublicos(page);
                    assert.equal(estado.tema, tema, `${rotulo}: tema deveria ser aplicado`);
                    assert.equal(estado.larguraDocumento <= estado.larguraViewport + 2, true, `${rotulo}: loja não deveria gerar overflow horizontal`);
                    await validarEstadoChatFechadoIaVisivel(page, `${rotulo} / chat fechado`);

                    await abrirEIniciarConversa(page);
                    await validarEstadoChatAbertoIaOculta(page, `${rotulo} / chat aberto`);

                    await page.evaluate(() => window.toggleIaNegocioPublicaWindow(true));
                    await esperarIaAberta(page);
                    estado = await obterEstadoWidgetsPublicos(page);
                    assert.equal(estado.chatVisivel, false, `${rotulo}: chat deveria fechar ao abrir IA`);
                    assert.equal(estado.iaJanelaVisivel, true, `${rotulo}: janela da IA deveria abrir`);
                } finally {
                    const errosInesperados = erros.filter((msg) => !ehErroDeRedeExterno(msg));
                    assert.deepEqual(errosInesperados, [], `${rotulo}: não deveria emitir console.error: ${errosInesperados.join("\n")}`);
                    await contexto.close();
                }
            }
        }
    }
}

async function main() {
    const { baseUrl, close } = await startStaticServer();
    const browser = await launchBrowser();
    let falhou = false;

    const contextoA = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const paginaA = await contextoA.newPage();
    const errosA = coletarErrosConsole(paginaA);

    const contextoB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const paginaB = await contextoB.newPage();
    const errosB = coletarErrosConsole(paginaB);

    const paginaOwner = await browser.newPage();
    const errosOwner = coletarErrosConsole(paginaOwner);

    try {
        await ativarIaPublicaNoEmulator();

        // ===== Visitante A: inicia o chat, nasce V2 =====
        await abrirLojaPublica(paginaA, baseUrl, { tema: "light" });
        await validarEstadoChatFechadoIaVisivel(paginaA, "visitante A inicial");
        await validarAlternanciaChatIa(paginaA, "visitante A alternância inicial");

        await abrirEIniciarConversa(paginaA);
        await atrasarCadastroAnonimoParaValidarLoading(paginaA);

        // Botão desabilitado + aria-busy enquanto autentica/cria (estado
        // "Conectando com a loja...").
        await paginaA.fill("#chat-client-input", NOME_VISITANTE);
        await paginaA.click("#chat-send-btn");
        await esperarEstadoConectando(paginaA, "criação do chat V2");

        await esperarChatConectado(paginaA);
        await validarComposerLiberado(paginaA, "chat V2 conectado");

        const db = adminDb();
        const chatsSnap = await db.collection("chats").where("clienteNome", "==", NOME_VISITANTE).get();
        assert.equal(chatsSnap.size, 1, "Deveria existir exatamente um chat criado pelo visitante");
        const chatDoc = chatsSnap.docs[0];
        const chatId = chatDoc.id;
        const chatData = chatDoc.data();

        assert.equal(chatData.versaoAcesso, 2, "Chat público novo deveria nascer V2 (Anonymous Auth)");
        assert.equal(typeof chatData.visitorUid, "string");
        assert.ok(chatData.visitorUid.length > 0, "visitorUid não deveria ser vazio");
        assert.equal(chatData.donoUID, STORE_UID);

        const visitorUidA = chatData.visitorUid;

        const eventoCriacaoSnap = await db
            .collection("chats").doc(chatId).collection("eventos")
            .where("tipo", "==", "conversa_criada").get();
        assert.equal(eventoCriacaoSnap.size, 1, "Deveria existir o evento conversa_criada");
        assert.equal(
            eventoCriacaoSnap.docs[0].data().autorUid,
            visitorUidA,
            "Evento V2 deveria ter autoria real — nunca autorUid vazio"
        );

        // ===== Visitante A: envia uma mensagem, confirma autoria real =====
        const textoMensagem = "Qual o prazo de entrega?";
        await paginaA.fill("#chat-client-input", textoMensagem);
        await paginaA.click("#chat-send-btn");

        // A UI só deve exibir a mensagem depois da confirmação do
        // Firestore/Emulator; se um snapshot local otimista vazar aqui,
        // a consulta Admin abaixo volta a falhar.
        await paginaA.waitForFunction(
            (texto) => {
                const box = document.getElementById("chat-client-messages");
                return !!box && box.innerText.includes(texto);
            },
            textoMensagem,
            { timeout: 15000 }
        );

        const mensagensSnap = await db
            .collection("chats").doc(chatId).collection("mensagens")
            .where("sender", "==", "cliente").get();
        const mensagemEnviada = mensagensSnap.docs.find((d) => d.data().texto === textoMensagem);
        assert.ok(mensagemEnviada, "Mensagem do visitante deveria estar salva no Firestore");
        assert.equal(mensagemEnviada.data().autorUid, visitorUidA, "Mensagem V2 deveria ter autorUid real");
        assert.equal(mensagemEnviada.data().autorTipo, "cliente");

        // Mobile (390×844): sem overflow horizontal com o widget aberto.
        const overflowMobile = await paginaA.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
        );
        assert.equal(overflowMobile, false, "Chat público não deveria causar overflow horizontal no mobile");

        // ===== Reload: a mesma sessão anônima restaura o MESMO chat =====
        await paginaA.reload({ waitUntil: "load", timeout: 30000 });
        await abrirEIniciarConversa(paginaA);
        await validarRestauracaoTransitoriaOuLiberada(paginaA, "restauração do chat V2");
        await esperarChatConectado(paginaA);
        await validarComposerLiberado(paginaA, "chat V2 restaurado");

        await paginaA.waitForFunction(
            (texto) => {
                const box = document.getElementById("chat-client-messages");
                return !!box && box.innerText.includes(texto);
            },
            textoMensagem,
            { timeout: 15000 }
        );

        // ===== Visitante B, contexto isolado: nunca herda a conversa =====
        await paginaB.goto(`${baseUrl}/loja.html?loja=${STORE_SLUG}&useEmulator=true`, {
            waitUntil: "load",
            timeout: 30000
        });
        await abrirEIniciarConversa(paginaB);

        const placeholderSemForja = await paginaB.getAttribute("#chat-client-input", "placeholder");
        assert.equal(
            placeholderSemForja,
            "Seu nome...",
            "Um visitante novo, sem referência local, nunca deveria vir pré-conectado"
        );

        // Ataque simulado: visitante B forja a referência local com o
        // chatId E o visitorUid REAIS do visitante A (pior caso realista —
        // conhece os dois). A sessão anônima da própria aba B tem outro uid
        // (atribuído pelo Firebase Auth), então restaurarChatSalvo() nunca
        // deveria aceitar — nem chega a ler o chat no Firestore.
        await paginaB.evaluate(
            ({ storeUid, chatId: idForjado, visitorUid }) => {
                window.localStorage.setItem(
                    `videPublicChatV2:${storeUid}`,
                    JSON.stringify({ chatId: idForjado, visitorUid, version: 2 })
                );
            },
            { storeUid: STORE_UID, chatId, visitorUid: visitorUidA }
        );

        await paginaB.reload({ waitUntil: "load", timeout: 30000 });
        await abrirEIniciarConversa(paginaB);

        // Dá tempo da tentativa de restauração (assíncrona) terminar antes
        // de confirmar que NÃO restaurou.
        await paginaB.waitForTimeout(2000);

        const placeholderComForja = await paginaB.getAttribute("#chat-client-input", "placeholder");
        assert.equal(
            placeholderComForja,
            "Seu nome...",
            "Forjar chatId+visitorUid de outro visitante nunca deveria restaurar a conversa alheia"
        );

        const textoMensagensB = await paginaB.evaluate(
            () => document.getElementById("chat-client-messages")?.innerText || ""
        );
        assert.ok(
            !textoMensagensB.includes(textoMensagem),
            "Visitante B nunca deveria ver o conteúdo da conversa do visitante A"
        );

        // ===== Dono responde pelo painel; visitante A recebe em tempo real =====
        await loginReal(paginaOwner, baseUrl, {
            email: "owner.pro@local.test",
            senha: "Local123!pro"
        });

        const ativouAtendimento = await paginaOwner.evaluate(() =>
            typeof window.ativarAba === "function" ? window.ativarAba("view-atendimento") : false
        );
        assert.equal(ativouAtendimento, true, "A view de Atendimento deveria ser ativada");

        await paginaOwner.waitForSelector("#view-atendimento.active", { state: "visible", timeout: 15000 });
        await paginaOwner.waitForLoadState("networkidle").catch(() => {});

        await paginaOwner.fill("#atend-busca", NOME_VISITANTE);

        await paginaOwner.waitForFunction(
            () => document.querySelectorAll("#atend-lista-conversas [data-atend-conversa-id]").length === 1,
            undefined,
            { timeout: 20000 }
        );

        await paginaOwner.click("#atend-lista-conversas [data-atend-conversa-id]");

        await paginaOwner.waitForSelector("#atend-resposta-input", { state: "visible", timeout: 15000 });

        const textoResposta = `Chega amanhã até as 18h, ${NOME_VISITANTE}`;
        await paginaOwner.fill("#atend-resposta-input", textoResposta);
        await paginaOwner.click("#atend-form-resposta button[type=submit]");

        await paginaOwner.waitForFunction(
            (texto) => Array.from(document.querySelectorAll("#atend-mensagens *")).some((el) =>
                (el.textContent || "").includes(texto)
            ),
            textoResposta,
            { timeout: 20000 }
        );

        // O visitante A (aba ainda aberta, listener ligado desde a
        // restauração) recebe a resposta em tempo real, sem recarregar.
        await paginaA.waitForFunction(
            (texto) => {
                const box = document.getElementById("chat-client-messages");
                return !!box && box.innerText.includes(texto);
            },
            textoResposta,
            { timeout: 20000 }
        );

        await validarErroUnicoDeConexao(browser, baseUrl);
        await validarFalhaAuthAnonimaSemFallbackV1(browser, baseUrl);
        await validarMatrizVisualWidgets(browser, baseUrl);

        console.log(
            "loja-chat-publico.flow: OK — chat V2 criado com Anonymous Auth, " +
            "autoria real em mensagens/eventos, restauração pela mesma sessão, " +
            "visitante B isolado (mesmo forjando a referência local), " +
            "falha de Anonymous Auth sem fallback V1 (erro único, recuperável, retry funcional), " +
            "resposta do dono chegando em tempo real."
        );
    } catch (erro) {
        falhou = true;
        const paginas = [
            { page: paginaA, label: "loja-chat-publico-visitanteA" },
            { page: paginaB, label: "loja-chat-publico-visitanteB" },
            { page: paginaOwner, label: "loja-chat-publico-owner" }
        ];
        for (const { page, label } of paginas) {
            try {
                await captureDiagnostics(page, label, coletarErrosConsole(page));
            } catch (erroDiagnostico) {
                console.error(`[diagnóstico] Falha ao capturar ${label}:`, erroDiagnostico);
            }
        }
        console.error("loja-chat-publico.flow: FALHOU —", erro);
    } finally {
        const todosErros = [...errosA, ...errosB, ...errosOwner].filter((msg) => !ehErroDeRedeExterno(msg));
        if (todosErros.length > 0) {
            falhou = true;
            console.error("loja-chat-publico.flow: erros de console inesperados:", todosErros);
        }
        await browser.close();
        await close();
    }

    if (falhou) {
        process.exitCode = 1;
    }
}

main();
