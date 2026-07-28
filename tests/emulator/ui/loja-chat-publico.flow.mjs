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

function adminDb() {
    if (!getApps().length) {
        initializeApp({ projectId: PROJECT_ID });
    }
    return getFirestore();
}

async function abrirEIniciarConversa(page) {
    await page.waitForSelector("#chat-trigger-btn", { state: "visible", timeout: 20000 });
    await page.click("#chat-trigger-btn");
    await page.waitForSelector("#chat-window:not(.hidden)", { state: "visible", timeout: 10000 });
    await page.waitForSelector("#chat-client-input", { state: "visible", timeout: 10000 });
}

async function esperarChatConectado(page, timeout = 20000) {
    await page.waitForFunction(
        () => document.getElementById("chat-client-input")?.placeholder === "Escreva sua mensagem...",
        { timeout }
    );
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
        // ===== Visitante A: inicia o chat, nasce V2 =====
        await paginaA.goto(`${baseUrl}/loja.html?loja=${STORE_SLUG}&useEmulator=true`, {
            waitUntil: "load",
            timeout: 30000
        });

        await abrirEIniciarConversa(paginaA);

        // Botão desabilitado + aria-busy enquanto autentica/cria (estado
        // "Conectando com a loja...").
        await paginaA.fill("#chat-client-input", NOME_VISITANTE);
        await paginaA.click("#chat-send-btn");

        await esperarChatConectado(paginaA);

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
        await esperarChatConectado(paginaA);

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

        console.log(
            "loja-chat-publico.flow: OK — chat V2 criado com Anonymous Auth, " +
            "autoria real em mensagens/eventos, restauração pela mesma sessão, " +
            "visitante B isolado (mesmo forjando a referência local), " +
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
