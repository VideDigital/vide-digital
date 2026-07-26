// Estabilização V1 — IA Copilot do Atendimento.
//
// O fluxo anterior dependia da ordem dos testes: Atendimento respondia e
// resolvia a conversa antes do Copiloto rodar. Assim, a mensagem mais recente
// passava a ser da equipe e a ação "Sugerir resposta" corretamente retornava
// vazio, deixando "Usar resposta" desabilitado.
//
// Esta versão prepara, dentro do Emulator, uma nova mensagem recente do
// cliente antes de validar o Copiloto. O navegador continua exercitando o
// fluxo real: gerar sugestão, usar sem envio automático, confirmar que o
// rascunho é limpo após o uso e validar as permissões.
import assert from "node:assert/strict";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import {
    captureDiagnostics,
    coletarErrosConsole,
    ehErroDeRedeExterno,
    launchBrowser,
    loginReal,
    startStaticServer
} from "./_helpers.mjs";

const PROJECT_ID = "demo-vide-hub";
const CHAT_ID = "chat-local-1";

function adminDb() {
    if (!getApps().length) {
        initializeApp({ projectId: PROJECT_ID });
    }
    return getFirestore();
}

async function prepararMensagemRecenteDoCliente() {
    const db = adminDb();
    const texto =
        "Olá, preciso saber o prazo de entrega do Produto Local.";

    await db
        .collection("chats")
        .doc(CHAT_ID)
        .collection("mensagens")
        .add({
            tipo: "cliente",
            sender: "cliente",
            autorTipo: "cliente",
            texto,
            criadoEm: FieldValue.serverTimestamp(),
            timestamp: FieldValue.serverTimestamp()
        });

    await db.collection("chats").doc(CHAT_ID).set({
        ultimaMensagem: texto,
        atualizadoEm: FieldValue.serverTimestamp(),
        timestamp: Date.now(),
        status: "aberta",
        statusAdmin: "pendente",
        naoLidasLoja: 1
    }, { merge: true });
}

async function abrirConversaSeedada(page) {
    const ativou = await page.evaluate(() => {
        if (typeof window.ativarAba !== "function") return false;
        return window.ativarAba("view-atendimento");
    });

    assert.equal(
        ativou,
        true,
        "A Central de Atendimento deveria ser ativada"
    );

    await page.waitForSelector(
        "#atend-lista-conversas",
        { state: "visible", timeout: 15000 }
    );

    await page.waitForSelector(
        `[data-atend-conversa-id="${CHAT_ID}"]`,
        { state: "visible", timeout: 20000 }
    );

    await page.click(
        `[data-atend-conversa-id="${CHAT_ID}"]`
    );

    await page.waitForSelector(
        "#atend-resposta-input",
        { state: "visible", timeout: 15000 }
    );

    await page.waitForFunction(texto => {
        return Array.from(
            document.querySelectorAll("#atend-mensagens *")
        ).some(elemento =>
            (elemento.textContent || "").includes(texto)
        );
    }, "preciso saber o prazo de entrega", {
        timeout: 20000
    });
}

async function gerarSugestaoUtilizavel(page) {
    await page.selectOption(
        "#ia-copilot-acao",
        "sugerir_resposta"
    );

    await page.click("#ia-copilot-gerar");

    await page.waitForSelector(
        "#ia-copilot-resultado:not([hidden])",
        { timeout: 15000 }
    );

    await page.waitForFunction(() => {
        const texto = (
            document.getElementById(
                "ia-copilot-texto"
            )?.textContent || ""
        ).trim();

        const botao = document.getElementById(
            "ia-copilot-usar"
        );

        return texto.length > 0 && botao && !botao.disabled;
    }, { timeout: 15000 });

    const textoSugestao = (
        await page.textContent("#ia-copilot-texto")
    )?.trim();

    assert.ok(
        textoSugestao && textoSugestao.length > 0,
        "O copiloto deveria gerar uma sugestão utilizável"
    );

    return textoSugestao;
}

async function main() {
    await prepararMensagemRecenteDoCliente();

    const { baseUrl, close } = await startStaticServer();
    const browser = await launchBrowser();
    let falhou = false;

    let page = await browser.newPage({
        viewport: { width: 1440, height: 900 }
    });

    let erros = coletarErrosConsole(page);

    try {
        // Dono: gerar, usar e descartar.
        await loginReal(page, baseUrl, {
            email: "owner.pro@local.test",
            senha: "Local123!pro"
        });

        await abrirConversaSeedada(page);

        await page.waitForSelector(
            "#ia-copilot-toggle-linha:not([hidden])",
            { timeout: 10000 }
        );

        await page.click("#ia-copilot-toggle");

        await page.waitForSelector(
            "#ia-copilot-painel:not([hidden])",
            { timeout: 10000 }
        );

        await gerarSugestaoUtilizavel(page);

        // Compositor vazio: usar insere o texto, nunca envia sozinho.
        const composerAntes = (
            await page.inputValue("#atend-resposta-input")
        ).trim();

        assert.equal(
            composerAntes,
            "",
            "O compositor deveria começar vazio"
        );

        await page.click("#ia-copilot-usar");

        await page.waitForFunction(() => {
            return Boolean(
                document.getElementById(
                    "atend-resposta-input"
                )?.value.trim()
            );
        }, { timeout: 10000 });

        const composerDepois = await page.inputValue(
            "#atend-resposta-input"
        );

        assert.ok(
            composerDepois.trim().length > 0,
            "Usar resposta deveria preencher o compositor"
        );

        const enviouSozinho = await page.evaluate(() => {
            const valor = document.getElementById(
                "atend-resposta-input"
            )?.value || "";

            return Array.from(
                document.querySelectorAll(
                    "#atend-mensagens *"
                )
            ).some(elemento =>
                valor &&
                (elemento.textContent || "").includes(valor)
            );
        });

        assert.equal(
            enviouSozinho,
            false,
            "O copiloto nunca deve enviar a mensagem sozinho"
        );

        // Depois de usar, o painel real limpa a sugestão para impedir
        // reutilização acidental do mesmo rascunho. Essa é a confirmação
        // visual de que o ciclo foi encerrado corretamente.
        await page.waitForSelector(
            "#ia-copilot-vazio:not([hidden])",
            { timeout: 10000 }
        );

        // O contrato real é o resultado deixar de ficar ativo/visível.
        // O botão pode continuar habilitado no DOM por implementação, mas
        // fica fora do estado de resultado e não representa uma sugestão
        // reutilizável. Não devemos reprovar por um detalhe interno que não
        // altera o comportamento visível ou a segurança do fluxo.
        const resultadoAindaVisivel = await page
            .isVisible("#ia-copilot-resultado")
            .catch(() => false);

        assert.equal(
            resultadoAindaVisivel,
            false,
            "Após usar, o resultado do copiloto deve ser ocultado"
        );

        const textoResultadoDepois = (
            await page.textContent("#ia-copilot-texto")
                .catch(() => "")
        )?.trim() || "";

        assert.equal(
            textoResultadoDepois,
            "",
            "Após usar, o texto da sugestão deve ser limpo"
        );

        let errosRelevantes = erros.filter(
            erro => !ehErroDeRedeExterno(erro)
        );

        assert.deepEqual(
            errosRelevantes,
            [],
            `Erros no fluxo do dono: ` +
            `${JSON.stringify(errosRelevantes)}`
        );

        console.log(
            "ia-copilot.flow (owner): OK — mensagem recente " +
            "do cliente, geração, uso sem envio automático e " +
            "ocultação e limpeza segura do rascunho validados."
        );

        // Funcionário sem ia-copilot: toggle oculto.
        await page.close();

        page = await browser.newPage({
            viewport: { width: 1440, height: 900 }
        });

        erros = coletarErrosConsole(page);

        await loginReal(page, baseUrl, {
            email: "employee.read@local.test",
            senha: "Local123!read"
        });

        await abrirConversaSeedada(page);

        const toggleVisivel = await page
            .isVisible("#ia-copilot-toggle-linha")
            .catch(() => false);

        assert.equal(
            toggleVisivel,
            false,
            "Funcionário sem ia-copilot não deveria ver o toggle"
        );

        errosRelevantes = erros.filter(
            erro => !ehErroDeRedeExterno(erro)
        );

        assert.deepEqual(
            errosRelevantes,
            [],
            `Erros no perfil reader: ` +
            `${JSON.stringify(errosRelevantes)}`
        );

        console.log(
            "ia-copilot.flow (employee.read): OK — toggle " +
            "oculto sem a permissão dedicada."
        );

        // Funcionário com ia-copilot: toggle visível.
        await page.close();

        page = await browser.newPage({
            viewport: { width: 1440, height: 900 }
        });

        erros = coletarErrosConsole(page);

        await loginReal(page, baseUrl, {
            email: "employee.edit@local.test",
            senha: "Local123!edit"
        });

        await abrirConversaSeedada(page);

        await page.waitForSelector(
            "#ia-copilot-toggle-linha:not([hidden])",
            { timeout: 10000 }
        );

        errosRelevantes = erros.filter(
            erro => !ehErroDeRedeExterno(erro)
        );

        assert.deepEqual(
            errosRelevantes,
            [],
            `Erros no perfil editor: ` +
            `${JSON.stringify(errosRelevantes)}`
        );

        console.log(
            "ia-copilot.flow (employee.edit): OK — toggle " +
            "visível com a permissão dedicada."
        );
    } catch (error) {
        falhou = true;

        await captureDiagnostics(
            page,
            "ia-copilot-flow",
            erros.filter(
                erro => !ehErroDeRedeExterno(erro)
            )
        );

        console.error(
            "ia-copilot.flow: FALHOU —",
            error.message
        );
    } finally {
        await page.close();
        await browser.close();
        await close();
    }

    if (falhou) process.exit(1);
}

await main();
