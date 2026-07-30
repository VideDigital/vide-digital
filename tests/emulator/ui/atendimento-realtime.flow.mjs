// Atendimento: cobertura real da causa raiz corrigida — a lista de
// conversas (chats/*) e as mensagens da conversa aberta agora escutam o
// Firestore em tempo real (onSnapshot), em vez do getDocs pontual que só
// era refeito num reload inteiro da página. Este fluxo escreve direto no
// Firestore Emulator via firebase-admin (nunca pela UI, nunca em
// produção — mesma guarda de host que scripts/seed-emulator.mjs) e prova
// que a Central de Atendimento reflete sozinha, sem nenhum reload,
// nenhum clique em "Atualizar" e nenhum location.reload():
//   1) uma conversa nova aparecendo na lista;
//   2) o status de uma conversa já na lista mudando (chip do card);
//   3) uma mensagem nova aparecendo dentro da conversa aberta;
//   4) trocar de conversa cancela o listener da conversa anterior (uma
//      mensagem escrita na conversa antiga não vaza pra conversa nova
//      selecionada).
import assert from "node:assert/strict";
import { initializeApp, getApps } from "firebase-admin/app";
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

function assertLocalEmulatorHost(name, expectedPort) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} precisa estar definido. Execute via pnpm run test:ui:flows ou configure o Emulator manualmente.`);
    }
    const normalized = value.replace(/^https?:\/\//, "");
    const [host, port] = normalized.split(":");
    const safeHost = host === "127.0.0.1" || host === "localhost" || host === "::1";
    if (!safeHost || port !== expectedPort) {
        throw new Error(`${name} deve apontar para localhost:${expectedPort}. Valor recebido: ${value}`);
    }
}

assertLocalEmulatorHost("FIRESTORE_EMULATOR_HOST", "8080");
if ((process.env.GCLOUD_PROJECT || PROJECT_ID) !== PROJECT_ID) {
    throw new Error("Teste recusado: projectId precisa ser demo-vide-hub.");
}

if (!getApps().length) {
    initializeApp({ projectId: PROJECT_ID });
}
const db = getFirestore();

const CHAT_NOVO_ID = `chat-realtime-qa-${Date.now()}`;
const NOME_CLIENTE_NOVO = `Cliente Realtime QA ${Date.now()}`;

async function ativarAtendimento(page) {
    const resultado = await page.evaluate(() => {
        if (typeof window.ativarAba !== "function") {
            return { ativou: false, motivo: "window.ativarAba não está disponível" };
        }
        return { ativou: window.ativarAba("view-atendimento") };
    });
    assert.equal(resultado.ativou, true, `A Central de Atendimento não foi ativada: ${JSON.stringify(resultado)}`);

    await page.waitForFunction(() => {
        const view = document.getElementById("view-atendimento");
        if (!view) return false;
        const estilo = window.getComputedStyle(view);
        return view.classList.contains("active") && !view.hidden && estilo.display !== "none";
    }, { timeout: 15000 });

    await page.waitForFunction(() => {
        const layout = document.getElementById("atend-layout");
        if (!layout) return false;
        if (window.innerWidth <= 1024) layout.setAttribute("data-atend-etapa", "lista");
        const coluna = document.querySelector("#atend-layout .atend-coluna.atend-col-lista");
        if (!coluna) return false;
        const estilo = window.getComputedStyle(coluna);
        return estilo.display !== "none" && estilo.visibility !== "hidden";
    }, { timeout: 15000 });
}

async function main() {
    const { baseUrl, close } = await startStaticServer();
    const browser = await launchBrowser();
    let falhou = false;

    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const erros = coletarErrosConsole(page);

    try {
        await loginReal(page, baseUrl, { email: "owner.pro@local.test", senha: "Local123!pro" });
        await ativarAtendimento(page);

        // Estado inicial: pelo menos a conversa seedada (chat-local-1) já
        // visível — confirma que o listener inicial entregou o primeiro
        // snapshot antes de qualquer escrita nova acontecer.
        await page.waitForSelector('#atend-lista-conversas [data-atend-conversa-id]', { state: "visible", timeout: 20000 });
        const quantidadeInicial = await page.locator('#atend-lista-conversas [data-atend-conversa-id]').count();

        // 1) Conversa nova, escrita direto no Firestore (nunca pela UI):
        // precisa aparecer sozinha na lista, sem reload e sem clicar em
        // "Atualizar".
        await db.doc(`chats/${CHAT_NOVO_ID}`).set({
            donoUID: "owner-pro",
            emailDono: "owner-pro",
            clienteNome: NOME_CLIENTE_NOVO,
            status: "aberta",
            canal: "loja_publica",
            ultimaMensagem: "Mensagem inicial da conversa em tempo real.",
            atualizadoEm: Date.now(),
            naoLidasLoja: 1,
            atribuidoPara: ""
        });

        await page.waitForFunction(id => {
            return Boolean(document.querySelector(`[data-atend-conversa-id="${id}"]`));
        }, CHAT_NOVO_ID, { timeout: 15000 }).catch(() => {
            throw new Error("A conversa criada direto no Firestore não apareceu na lista sem reload — regressão da causa raiz corrigida (onSnapshot na lista de chats).");
        });

        const quantidadeDepoisDeCriar = await page.locator('#atend-lista-conversas [data-atend-conversa-id]').count();
        assert.equal(
            quantidadeDepoisDeCriar,
            quantidadeInicial + 1,
            `Esperava exatamente +1 conversa na lista (sem duplicar), tinha ${quantidadeInicial} e passou a ter ${quantidadeDepoisDeCriar}`
        );

        // 2) Mudança de status de uma conversa já na lista precisa
        // refletir no chip do card sem reload.
        await db.doc(`chats/${CHAT_NOVO_ID}`).set({ status: "resolvida", atualizadoEm: Date.now() }, { merge: true });
        await page.waitForFunction(id => {
            const item = document.querySelector(`[data-atend-conversa-id="${id}"]`);
            return Boolean(item && item.querySelector(".atend-chip.is-status-resolvida"));
        }, CHAT_NOVO_ID, { timeout: 15000 }).catch(() => {
            throw new Error("A mudança de status escrita direto no Firestore não refletiu no card da lista sem reload.");
        });

        console.log("atendimento-realtime.flow: OK — conversa nova e mudança de status refletem na lista sem reload.");

        // 3) Mensagem nova na conversa ABERTA precisa aparecer sozinha.
        await page.click('#atend-lista-conversas [data-atend-conversa-id="chat-local-1"]');
        await page.waitForSelector("#atend-resposta-input", { state: "visible", timeout: 15000 });

        const textoMensagemAoVivo = `Mensagem ao vivo QA ${Date.now()}`;
        await db.collection("chats/chat-local-1/mensagens").add({
            texto: textoMensagemAoVivo,
            sender: "cliente",
            timestamp: Date.now()
        });

        await page.waitForFunction(texto => {
            return Array.from(document.querySelectorAll("#atend-mensagens *")).some(elemento => (elemento.textContent || "").includes(texto));
        }, textoMensagemAoVivo, { timeout: 15000 }).catch(() => {
            throw new Error("A mensagem escrita direto no Firestore não apareceu na conversa aberta sem reload.");
        });

        console.log("atendimento-realtime.flow: OK — mensagem nova aparece na conversa aberta sem reload.");

        // 4) Trocar de conversa precisa cancelar o listener da anterior:
        // uma mensagem nova escrita em chat-local-1 (agora não mais
        // selecionada) nunca pode vazar pra dentro da conversa nova.
        await page.click(`#atend-lista-conversas [data-atend-conversa-id="${CHAT_NOVO_ID}"]`);
        await page.waitForFunction(id => {
            return document.getElementById("atend-detalhe-nome")?.textContent?.trim().length > 0
                && !document.getElementById("atend-detalhe")?.classList.contains("is-vazio");
        }, CHAT_NOVO_ID, { timeout: 15000 });

        const textoQueNaoDeveVazar = `NAO_DEVE_APARECER_${Date.now()}`;
        await db.collection("chats/chat-local-1/mensagens").add({
            texto: textoQueNaoDeveVazar,
            sender: "cliente",
            timestamp: Date.now()
        });

        // Espera curta e deliberada — não há evento pra aguardar (é uma
        // ausência que queremos confirmar), então dá tempo real pro
        // listener errado vazar a mensagem, se o bug ainda existisse.
        await page.waitForTimeout(2000);
        const vazou = await page.evaluate(texto => {
            return Array.from(document.querySelectorAll("#atend-mensagens *")).some(elemento => (elemento.textContent || "").includes(texto));
        }, textoQueNaoDeveVazar);
        assert.equal(vazou, false, "Uma mensagem da conversa anterior vazou pra dentro da conversa recém-selecionada — o listener antigo não foi cancelado.");

        console.log("atendimento-realtime.flow: OK — trocar de conversa cancela o listener da anterior (sem vazamento de mensagem).");

        const errosRelevantes = erros.filter(erro => !ehErroDeRedeExterno(erro));
        assert.deepEqual(errosRelevantes, [], `Erros de console durante o fluxo: ${JSON.stringify(errosRelevantes)}`);
    } catch (error) {
        falhou = true;
        await captureDiagnostics(page, "atendimento-realtime-flow", erros.filter(erro => !ehErroDeRedeExterno(erro)));
        console.error("atendimento-realtime.flow: FALHOU —", error.message);
    } finally {
        await db.doc(`chats/${CHAT_NOVO_ID}`).delete().catch(() => {});
        await page.close();
        await browser.close();
        await close();
    }

    if (falhou) process.exit(1);
}

await main();
