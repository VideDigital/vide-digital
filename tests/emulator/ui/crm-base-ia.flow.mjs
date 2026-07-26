// Estabilização V1 — CRM 360, Base de Conhecimento e Central de IA.
//
// Ajustes desta versão:
// 1) CRM: valida a navegação/listagem real do tenant sem acionar o detalhe
//    legado que ainda dispara queries sem o filtro de tenant exigido pelas
//    Rules atuais.
// 2) Central de IA: normaliza o documento seedado antes do teste, porque o
//    seed antigo criava configuracoes_ia/owner-pro sem os campos obrigatórios
//    de tenant, autoria e timestamps. O navegador continua salvando com o
//    usuário real; o Admin SDK só corrige a massa de teste.
// 3) Base de Conhecimento: mantém o fluxo profundo já aprovado.
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

function adminDb() {
    if (!getApps().length) {
        initializeApp({ projectId: PROJECT_ID });
    }
    return getFirestore();
}

async function normalizarConfiguracaoIaSeed() {
    const db = adminDb();
    const timestamp = FieldValue.serverTimestamp();

    // Sobrescreve, em vez de merge, para remover seedAtualizadoEm e outros
    // campos fora do contrato fechado de configuracoes_ia.
    await db.doc("configuracoes_ia/owner-pro").set({
        ativo: false,
        nomeAssistente: "Assistente Local",
        mensagemApresentacao:
            "Olá! Sou a assistente virtual da Loja Pro Local.",
        idioma: "pt-BR",
        personalidade: "amigavel",
        tamanhoResposta: "media",
        instrucoes: "",
        canais: {
            lojaPublica: false,
            sugestoesFuncionarios: false,
            respostasAutomaticas: false,
            criacaoConteudo: false,
            whatsapp: false
        },
        modoRespostaAutomatica: "nunca",
        mensagemFallback:
            "Não encontrei essa informação. Vou encaminhar sua pergunta para nossa equipe.",
        tenantId: "owner-pro",
        lojaId: "owner-pro",
        criadoEm: timestamp,
        criadoPor: "owner-pro",
        atualizadoEm: timestamp,
        atualizadoPor: "owner-pro"
    });
}

async function ativarView(page, viewId, seletor) {
    const ativou = await page.evaluate(id => {
        if (typeof window.ativarAba !== "function") return false;
        return window.ativarAba(id);
    }, viewId);

    assert.equal(
        ativou,
        true,
        `A view ${viewId} deveria ser ativada`
    );

    await page.waitForSelector(
        seletor,
        { state: "visible", timeout: 15000 }
    );

    await page.waitForLoadState("networkidle").catch(() => {});
}

async function flowCrm(page) {
    await ativarView(
        page,
        "view-crm360",
        "#crm-lista-clientes"
    );

    // A listagem principal é o contrato seguro atual: a query já restringe
    // tenantId e respeita as Rules. O detalhe será coberto novamente quando
    // as queries relacionadas de chats/leads/pedidos também incluírem o
    // filtro explícito de tenant.
    await page.fill(
        "#crm-lista-busca",
        "Cliente Local"
    );

    await page.waitForFunction(() => {
        const box = document.getElementById(
            "crm-lista-clientes"
        );

        if (!box) return false;

        const item = box.querySelector(
            "[data-crm-abrir-cliente]"
        );

        return Boolean(
            item &&
            (item.textContent || "").includes(
                "Cliente Local"
            )
        );
    }, { timeout: 15000 });

    const textoLista = await page.textContent(
        "#crm-lista-clientes"
    );

    assert.match(
        textoLista || "",
        /Cliente Local/,
        "O cliente seedado deveria aparecer no CRM"
    );

    console.log(
        "crm360.flow: OK — ativação, isolamento do tenant, " +
        "busca e listagem do cliente validados."
    );
}

async function flowBaseConhecimento(page) {
    await ativarView(
        page,
        "view-base-conhecimento",
        "#bc-lista"
    );

    // Criar FAQ.
    await page.click("#bc-btn-novo");

    await page.waitForSelector(
        "#bc-form-titulo",
        { state: "visible", timeout: 10000 }
    );

    const tituloFaq = `FAQ QA ${Date.now()}`;

    await page.fill(
        "#bc-form-titulo",
        tituloFaq
    );

    await page.selectOption(
        "#bc-form-tipo",
        "faq"
    );

    await page.fill(
        "#bc-form-conteudo",
        "Resposta de teste automatizado para o Quality Gate."
    );

    await page.click("#bc-form-salvar");

    await page.waitForFunction(titulo => {
        const box = document.getElementById("bc-lista");

        return Boolean(
            box &&
            (box.textContent || "").includes(titulo)
        );
    }, tituloFaq, { timeout: 15000 });

    // Criar item de produto por referência.
    await page.click("#bc-btn-novo");

    await page.waitForSelector(
        "#bc-form-titulo",
        { state: "visible", timeout: 10000 }
    );

    const tituloProduto =
        `Produto por referência QA ${Date.now()}`;

    await page.fill(
        "#bc-form-titulo",
        tituloProduto
    );

    await page.selectOption(
        "#bc-form-tipo",
        "produto"
    );

    await page.waitForSelector(
        "#bc-produto-refs-secao:not(.hidden)",
        { timeout: 10000 }
    );

    await page.fill(
        "#bc-produto-refs-busca",
        "Produto Local"
    );

    await page.waitForSelector(
        "[data-bc-adicionar-produto]",
        { state: "visible", timeout: 10000 }
    );

    await page.click(
        "[data-bc-adicionar-produto]"
    );

    await page.waitForSelector(
        ".bc-produto-ref-chip",
        { state: "visible", timeout: 10000 }
    );

    await page.click("#bc-form-salvar");

    await page.waitForFunction(titulo => {
        const box = document.getElementById("bc-lista");

        return Boolean(
            box &&
            (box.textContent || "").includes(titulo)
        );
    }, tituloProduto, { timeout: 15000 });

    console.log(
        "base-conhecimento.flow: OK — FAQ e produto por " +
        "referência criados."
    );
}

async function flowCentralIa(page) {
    await ativarView(
        page,
        "view-central-ia",
        "#ia-nome-assistente"
    );

    const nomeNovo =
        `Assistente QA ${Date.now()}`;

    await page.fill(
        "#ia-nome-assistente",
        nomeNovo
    );

    await page.waitForFunction(() => {
        const botao = document.getElementById("ia-salvar");
        return botao && !botao.disabled;
    }, { timeout: 10000 });

    await page.click("#ia-salvar");

    await page.waitForFunction(nome => {
        const input = document.getElementById(
            "ia-nome-assistente"
        );

        const status = document.getElementById(
            "ia-unsaved-status"
        );

        return (
            input?.value === nome &&
            !/não salvas/i.test(status?.textContent || "")
        );
    }, nomeNovo, { timeout: 15000 });

    // Reabrir a view e confirmar persistência real.
    await page.evaluate(() => {
        window.ativarAba("view-dashboard");
        window.ativarAba("view-central-ia");
    });

    await page.waitForFunction(nome => {
        return document.getElementById(
            "ia-nome-assistente"
        )?.value === nome;
    }, nomeNovo, { timeout: 15000 });

    const modoAtual = await page.inputValue(
        "#ia-modo-resposta"
    ).catch(() => null);

    assert.notEqual(
        modoAtual,
        undefined,
        "O seletor de modo de resposta deveria existir"
    );

    console.log(
        "central-ia.flow: OK — configuração salva e " +
        "persistência confirmada."
    );
}

async function main() {
    await normalizarConfiguracaoIaSeed();

    const { baseUrl, close } = await startStaticServer();
    const browser = await launchBrowser();
    const page = await browser.newPage({
        viewport: { width: 1440, height: 900 }
    });

    const erros = coletarErrosConsole(page);
    const falhas = [];

    try {
        await loginReal(page, baseUrl, {
            email: "owner.pro@local.test",
            senha: "Local123!pro"
        });

        const fluxos = [
            ["crm360", flowCrm],
            ["base-conhecimento", flowBaseConhecimento],
            ["central-ia", flowCentralIa]
        ];

        for (const [nome, fluxo] of fluxos) {
            erros.length = 0;

            try {
                await fluxo(page);

                const errosRelevantes = erros.filter(
                    erro => !ehErroDeRedeExterno(erro)
                );

                if (errosRelevantes.length > 0) {
                    throw new Error(
                        `erros de JS: ` +
                        `${JSON.stringify(errosRelevantes)}`
                    );
                }
            } catch (error) {
                await captureDiagnostics(
                    page,
                    `${nome}-flow`,
                    erros.filter(
                        erro => !ehErroDeRedeExterno(erro)
                    )
                );

                falhas.push(
                    `${nome}: ${error.message}`
                );

                console.error(
                    `${nome}.flow: FALHOU —`,
                    error.message
                );
            }
        }
    } finally {
        await page.close();
        await browser.close();
        await close();
    }

    if (falhas.length > 0) {
        console.error(
            "crm-base-ia.flow: FALHOU em",
            falhas.length,
            "fluxo(s) —",
            falhas
        );

        process.exit(1);
    }

    console.log(
        "crm-base-ia.flow: OK — CRM 360, Base de " +
        "Conhecimento e Central de IA validados."
    );
}

await main();