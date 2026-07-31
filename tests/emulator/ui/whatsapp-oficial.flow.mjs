// WhatsApp Oficial V1 — fluxo real: login como owner, view de conexão
// (não configurado -> conectado via seed real + Cloud Function real),
// integração na Central de Atendimento (badge/número mascarado/janela
// de 24h/composer bloqueado quando a janela fecha), e permissão de
// leitura (funcionário com "atendimento" só vê, não valida).
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
const OWNER_UID = "owner-pro";

function adminDb() {
    if (!getApps().length) {
        initializeApp({ projectId: PROJECT_ID });
    }
    return getFirestore();
}

async function ativarView(page, viewId, seletorEspera) {
    const ativou = await page.evaluate(id => {
        if (typeof window.ativarAba !== "function") return false;
        return window.ativarAba(id);
    }, viewId);
    if (ativou) {
        await page.waitForSelector(seletorEspera, { state: "visible", timeout: 15000 });
    }
    return ativou;
}

async function flowNaoConfigurado(page) {
    // Regressão real (2026-07-31): o item "WhatsApp" existia no HTML, no
    // controller e nas permissões, mas sidebar-navigation.js reagrupa os
    // botões da navegação usando uma lista fixa (configuracaoGrupos[].alvos)
    // que nunca tinha sido atualizada com "view-whatsapp-oficial" — o botão
    // era lido do DOM antes do reagrupamento, nunca reanexado a nenhum
    // grupo, e desaparecia silenciosamente (nem CSS "hidden": sumia do DOM
    // de verdade). ativarView()/window.ativarAba() é uma chamada
    // programática que nunca passa pelo botão real, então não pegava esse
    // bug. Aqui clicamos no botão de verdade, do jeito que o owner clicaria.
    const botaoMenu = page.locator('.nav-item[data-target="view-whatsapp-oficial"]');
    await botaoMenu.waitFor({ state: "visible", timeout: 15000 });
    const escondido = await botaoMenu.evaluate((el) => el.classList.contains("hidden"));
    assert.equal(escondido, false, "O item de menu WhatsApp deveria estar visível para o owner");
    await botaoMenu.click();
    await page.waitForSelector("#whatsapp-estado-conteudo", { state: "visible", timeout: 15000 });

    const badge = await page.textContent("#whatsapp-status-badge");
    assert.equal(badge.trim(), "Não configurado", "Sem conexão seedada, o badge deveria mostrar 'Não configurado'");

    const avisoPiloto = await page.locator("#whatsapp-acoes-piloto-nao-conectado").isVisible();
    assert.equal(avisoPiloto, true, "Deveria mostrar o aviso de piloto assistido quando não conectado");

    console.log("whatsapp-oficial.flow: OK (não configurado) — estado inicial sem conexão renderiza certo.");
}

async function flowConectado(page) {
    const db = adminDb();
    await db.doc(`whatsapp_connections/${OWNER_UID}`).set({
        ownerUid: OWNER_UID,
        status: "connected",
        phoneNumberId: "1000000000",
        displayPhoneNumber: "+55 11 90000-0000",
        verifiedName: "Loja Local Teste",
        qualityRating: "GREEN",
        messagingLimitTier: "TIER_1K",
        webhookSubscribed: true,
        graphVersion: "v21.0"
    }, { merge: true });

    await page.click("#whatsapp-btn-atualizar");
    await page.waitForFunction(() => {
        const badge = document.getElementById("whatsapp-status-badge");
        return Boolean(badge) && badge.textContent.trim() === "Conectado";
    }, { timeout: 15000 });

    const numero = await page.textContent("#whatsapp-card-numero-valor");
    assert.equal(numero.trim(), "+55 11 90000-0000");

    const tokenTexto = await page.textContent("#whatsapp-card-conexao-token");
    assert.match(tokenTexto, /••••/, "O token exibido deveria estar sempre mascarado");

    // Nenhum campo de segredo (token, secret, authorization) aparece em
    // nenhum lugar da tela — nem no card, nem em nenhum atributo escondido.
    // Também nunca existe um formulário manual pedindo token/WABA
    // ID/App Secret (Fase 4: onboarding continua só piloto assistido).
    const html = await page.content();
    assert.equal(/EAAG[a-zA-Z0-9]/.test(html), false, "Nenhum token real deveria aparecer no HTML renderizado");
    assert.equal(/tokenSecretResource/i.test(html), false, "O caminho completo do secret nunca deveria aparecer na UI");
    assert.equal(/input[^>]*(waba|access.?token|app.?secret)/i.test(html), false, "Nunca deveria existir um input manual de token/WABA ID/App Secret");

    // Fase 4: "Minhas conexões" mostra a conexão legada migrando como
    // card, marcada como padrão (é o fallback do resolver).
    await page.waitForFunction(() => {
        const lista = document.getElementById("whatsapp-conexoes-lista");
        return Boolean(lista) && lista.textContent.includes("+55 11 90000-0000");
    }, { timeout: 15000 });
    const conexoesTexto = await page.textContent("#whatsapp-conexoes-lista");
    assert.ok(conexoesTexto.includes("Padrão"), "A conexão legada conectada deveria aparecer como padrão em Minhas conexões");

    // Fase 4: "Adicionar conexão" nunca oferece um fluxo real — só CTAs
    // desabilitados com "Configuração em preparação".
    const secaoAdicionar = await page.textContent("#whatsapp-secao-adicionar");
    assert.ok(secaoAdicionar.includes("Configuração em preparação"), "As opções de adicionar conexão deveriam estar marcadas como 'Configuração em preparação'");
    const botoesAdicionarDesabilitados = await page.$$eval("#whatsapp-secao-adicionar button", (botoes) => botoes.every((b) => b.disabled));
    assert.equal(botoesAdicionarDesabilitados, true, "Nenhum botão de adicionar conexão pode estar clicável nesta missão");

    console.log("whatsapp-oficial.flow: OK (conectado) — status real via Cloud Function, token sempre mascarado, módulo separado com Minhas conexões/Adicionar conexão corretos.");
}

// Revisão: este fluxo reusava a MESMA página do owner (que acabara de
// navegar pra view-atendimento em flowInboxWhatsapp). loginReal navega
// pra login.html -> dashboard.html na mesma página/contexto, sem limpar
// localStorage — a última aba ativa (view-atendimento) ficava salva e a
// restauração assíncrona dela concorria com o ativarView() programático
// logo em seguida, causando um timeout intermitente esperando
// #whatsapp-estado-conteudo. Um contexto de navegador ISOLADO (própria
// aba, cookies e localStorage do zero) elimina a corrida — mesmo padrão
// já usado em loja-chat-publico.flow.mjs pra simular usuários diferentes.
async function flowFuncionarioLeitura(browser, baseUrl) {
    const contexto = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await contexto.newPage();
    const erros = coletarErrosConsole(page);
    try {
        await loginReal(page, baseUrl, {
            email: "employee.read@local.test",
            senha: "Local123!read"
        });

        const ativou = await ativarView(page, "view-whatsapp-oficial", "#whatsapp-estado-conteudo");
        assert.equal(ativou, true, "Funcionário com permissão de ver 'whatsapp' deveria conseguir abrir a tela");

        const btnValidar = page.locator("#whatsapp-btn-validar");
        await page.waitForSelector("#whatsapp-btn-validar", { state: "attached", timeout: 10000 });
        const desabilitado = await btnValidar.isDisabled();
        assert.equal(desabilitado, true, "Só o dono pode validar a conexão — funcionário deveria ver o botão desabilitado");

        const errosRelevantes = erros.filter(erro => !ehErroDeRedeExterno(erro));
        if (errosRelevantes.length > 0) {
            throw new Error(`erros de JS: ${JSON.stringify(errosRelevantes)}`);
        }

        console.log("whatsapp-oficial.flow: OK (funcionário leitor) — vê o status, não pode validar.");
    } catch (error) {
        await captureDiagnostics(page, "whatsapp-funcionario-flow", erros.filter(erro => !ehErroDeRedeExterno(erro)));
        throw error;
    } finally {
        await page.close();
        await contexto.close();
    }
}

async function flowInboxWhatsapp(page) {
    const db = adminDb();
    const agora = Date.now();

    const chatAbertoRef = db.collection("chats").doc();
    await chatAbertoRef.set({
        donoUID: OWNER_UID,
        emailDono: OWNER_UID,
        clienteNome: "Cliente WhatsApp Aberto",
        canal: "whatsapp",
        status: "aguardando_equipe",
        statusAdmin: "pendente",
        naoLidasLoja: 1,
        whatsappWaId: "5511999990000",
        whatsappUltimaMensagemClienteEm: agora,
        whatsappJanelaAtendimentoAte: agora + 12 * 60 * 60 * 1000,
        ultimaMensagem: "Olá, preciso de ajuda",
        timestamp: agora,
        criadoEm: new Date(agora)
    });

    const chatFechadoRef = db.collection("chats").doc();
    await chatFechadoRef.set({
        donoUID: OWNER_UID,
        emailDono: OWNER_UID,
        clienteNome: "Cliente WhatsApp Fechado",
        canal: "whatsapp",
        status: "aguardando_equipe",
        statusAdmin: "pendente",
        naoLidasLoja: 1,
        whatsappWaId: "5511888880000",
        whatsappUltimaMensagemClienteEm: agora - 30 * 60 * 60 * 1000,
        whatsappJanelaAtendimentoAte: agora - 6 * 60 * 60 * 1000,
        ultimaMensagem: "Mensagem antiga",
        timestamp: agora - 30 * 60 * 60 * 1000,
        criadoEm: new Date(agora - 30 * 60 * 60 * 1000)
    });

    const ativou = await ativarView(page, "view-atendimento", "#atend-lista-conversas");
    assert.equal(ativou, true, "A view Atendimento deveria ativar para o owner");

    await page.click("#atend-btn-atualizar").catch(() => {});
    await page.waitForFunction(() => {
        const lista = document.getElementById("atend-lista-conversas");
        return Boolean(lista) && lista.textContent.includes("Cliente WhatsApp Aberto");
    }, { timeout: 15000 });

    const textoLista = await page.textContent("#atend-lista-conversas");
    assert.ok(textoLista.includes("WhatsApp"), "O chip de canal WhatsApp deveria aparecer na lista");
    assert.ok(textoLista.includes("0000"), "O número mascarado (últimos 4 dígitos) deveria aparecer na lista");
    assert.equal(textoLista.includes("5511999990000"), false, "O número completo NUNCA deveria aparecer na lista");

    // Conversa com janela aberta: composer normal visível.
    await page.click(`[data-atend-conversa-id="${chatAbertoRef.id}"]`);
    await page.waitForSelector("#atend-form-resposta", { state: "visible", timeout: 10000 });
    const janelaAbertaTexto = await page.textContent("#atend-detalhe-janela-whatsapp");
    assert.ok(janelaAbertaTexto.includes("Janela aberta"), "Deveria mostrar 'Janela aberta' pra essa conversa");

    // Conversa com janela fechada: composer escondido, picker de template visível.
    await page.click(`[data-atend-conversa-id="${chatFechadoRef.id}"]`);
    await page.waitForSelector("#atend-whatsapp-template-picker", { state: "visible", timeout: 10000 });
    const formVisivel = await page.locator("#atend-form-resposta").isVisible();
    assert.equal(formVisivel, false, "Com a janela de 24h fechada, o compositor de texto livre nunca pode ficar visível");
    const janelaFechadaTexto = await page.textContent("#atend-detalhe-janela-whatsapp");
    assert.ok(janelaFechadaTexto.includes("Janela encerrada"), "Deveria mostrar 'Janela encerrada' pra essa conversa");
    await page.waitForFunction(() => {
        const picker = document.getElementById("atend-whatsapp-template-picker");
        return Boolean(picker) && picker.textContent.trim().length > 0;
    }, { timeout: 10000 });
    const pickerTexto = await page.textContent("#atend-whatsapp-template-picker");
    assert.ok(/janela|template/i.test(pickerTexto), "O picker deveria explicar a janela fechada ou pedir um template");

    console.log("whatsapp-oficial.flow: OK (inbox) — badge, número mascarado e bloqueio de composer fora da janela.");
}

async function main() {
    const { baseUrl, close } = await startStaticServer();
    const browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const erros = coletarErrosConsole(page);
    const falhas = [];

    try {
        await loginReal(page, baseUrl, {
            email: "owner.pro@local.test",
            senha: "Local123!pro"
        });

        const fluxos = [
            ["whatsapp-nao-configurado", flowNaoConfigurado],
            ["whatsapp-conectado", flowConectado],
            ["whatsapp-inbox", flowInboxWhatsapp]
        ];

        for (const [nome, fluxo] of fluxos) {
            erros.length = 0;
            try {
                await fluxo(page);
                const errosRelevantes = erros.filter(erro => !ehErroDeRedeExterno(erro));
                if (errosRelevantes.length > 0) {
                    throw new Error(`erros de JS: ${JSON.stringify(errosRelevantes)}`);
                }
            } catch (error) {
                await captureDiagnostics(page, `${nome}-flow`, erros.filter(erro => !ehErroDeRedeExterno(erro)));
                falhas.push(`${nome}: ${error.message}`);
                console.error(`${nome}.flow: FALHOU —`, error.message);
            }
        }

        // Contexto/página ISOLADOS do owner (ver comentário em
        // flowFuncionarioLeitura) — não reusa `page`/`erros` daqui.
        try {
            await flowFuncionarioLeitura(browser, baseUrl);
        } catch (error) {
            falhas.push(`whatsapp-funcionario: ${error.message}`);
            console.error("whatsapp-funcionario.flow: FALHOU —", error.message);
        }
    } finally {
        await page.close();
        await browser.close();
        await close();
    }

    if (falhas.length > 0) {
        console.error("whatsapp-oficial.flow: FALHOU em", falhas.length, "fluxo(s) —", falhas);
        process.exit(1);
    }

    console.log("whatsapp-oficial.flow: OK — WhatsApp Oficial validado de ponta a ponta.");
}

main().catch(error => {
    console.error("whatsapp-oficial.flow: erro inesperado —", error);
    process.exit(1);
});
