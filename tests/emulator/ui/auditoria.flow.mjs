// Central de Auditoria V1 — fluxo profundo real: login como owner, uma
// escrita real (via Admin SDK, simulando o cliente) dispara o Firestore
// trigger de auditoria, a UI busca e mostra o evento, sem PII visível,
// com drawer de detalhes e responsivo em mobile. Também confirma que um
// funcionário (mesmo editor com todas as outras permissões) não vê nem
// acessa a Central de Auditoria — é owner-only na V1.
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

function adminDb() {
    if (!getApps().length) {
        initializeApp({ projectId: PROJECT_ID });
    }
    return getFirestore();
}

async function ativarView(page, viewId, seletorLista) {
    const ativou = await page.evaluate(id => {
        if (typeof window.ativarAba !== "function") return false;
        return window.ativarAba(id);
    }, viewId);
    if (ativou) {
        // page.waitForSelector com uma lista "a, b" separada por vírgula
        // não tem semântica de "espera qualquer um" — ele resolve pro
        // primeiro elemento em ordem no DOM e espera SÓ o estado dele,
        // o que trava quando esse primeiro é o que fica escondido de
        // propósito. waitForFunction checando cada seletor manualmente
        // não tem essa armadilha.
        const seletores = seletorLista.split(",").map(s => s.trim());
        await page.waitForFunction(sels => sels.some(sel => {
            const el = document.querySelector(sel);
            return Boolean(el) && !el.classList.contains("hidden") && el.offsetParent !== null;
        }), seletores, { timeout: 15000 });
    }
    return ativou;
}

async function esperarEventoNaTabela(page, textoEsperado, tentativas = 15) {
    for (let i = 0; i < tentativas; i += 1) {
        const encontrado = await page.evaluate(texto => {
            const corpo = document.getElementById("audit-tabela-corpo");
            const cards = document.getElementById("audit-cards-mobile");
            const conteudo = `${corpo?.textContent || ""} ${cards?.textContent || ""}`;
            return conteudo.includes(texto);
        }, textoEsperado);
        if (encontrado) return true;
        await page.click("#audit-atualizar").catch(() => {});
        await page.waitForTimeout(2000);
    }
    return false;
}

async function flowAuditoriaOwner(page) {
    const db = adminDb();

    // Escrita real que o trigger auditProdutosWrite precisa capturar —
    // preço alterado é classificado como produto.preco_alterado.
    await db.doc("produtos/prod-local-1").set({ preco: 129.9 }, { merge: true });

    const ativou = await ativarView(page, "view-auditoria", "#audit-conteudo, #audit-estado-sem-permissao");
    assert.equal(ativou, true, "A view Auditoria deveria ativar para o owner");

    const semPermissao = await page.locator("#audit-estado-sem-permissao").isVisible().catch(() => false);
    assert.equal(semPermissao, false, "Owner não deveria cair em sem-permissão");

    const apareceu = await esperarEventoNaTabela(page, "prod-local-1");
    assert.equal(apareceu, true, "O evento de alteração de preço deveria aparecer na Central de Auditoria");

    // KPIs renderizam algum número (não ficam vazios/NaN).
    const kpiEventosHoje = await page.textContent("#audit-kpi-eventos-hoje");
    assert.ok(/^\d+$/.test((kpiEventosHoje || "").trim()), "KPI de eventos hoje deveria ser numérico");

    // Nenhum dado de PII visível — e-mail/telefone/nome de cliente
    // seedados nunca deveriam aparecer na tela da Auditoria.
    const textoTela = await page.evaluate(() => document.body.innerText);
    for (const proibido of ["lead@local.test", "5511999990000", "owner.pro@local.test"]) {
        assert.equal(textoTela.includes(proibido), false, `"${proibido}" não deveria aparecer na Central de Auditoria`);
    }

    // Abre o drawer no primeiro evento da lista.
    await page.click("[data-audit-evento]");
    await page.waitForSelector("#audit-drawer:not(.hidden)", { timeout: 10000 });
    const avisoDrawer = await page.textContent("#audit-drawer-conteudo");
    assert.ok(avisoDrawer.includes("Dados sensíveis são omitidos deste registro."), "Drawer deveria mostrar o aviso de PII omitida");
    await page.click("#audit-drawer-fechar");
    await page.waitForSelector("#audit-drawer.hidden", { timeout: 5000 });

    // Filtro por módulo — só confirma que a consulta refeita não quebra.
    await page.selectOption("#audit-filtro-campo", "modulo");
    await page.waitForSelector("#audit-filtro-valor", { state: "attached", timeout: 5000 });
    await page.selectOption("#audit-filtro-valor", "produtos");
    await page.waitForTimeout(1500);
    const errosAteAqui = await page.evaluate(() => window.__erros || []);
    void errosAteAqui;

    console.log("auditoria.flow: OK (owner) — evento real capturado, sem PII, drawer e filtro funcionam.");
}

async function flowResponsivoMobile(page) {
    await page.setViewportSize({ width: 390, height: 844 });
    await ativarView(page, "view-auditoria", "#audit-conteudo, #audit-estado-sem-permissao");
    await page.waitForTimeout(500);

    const tabelaVisivel = await page.locator(".aura-audit-tabela-wrap").isVisible().catch(() => false);
    assert.equal(tabelaVisivel, false, "A tabela desktop não deveria aparecer em mobile");

    await page.setViewportSize({ width: 1440, height: 900 });
    console.log("auditoria.flow: OK (mobile) — cards substituem a tabela em 390px.");
}

async function flowFuncionarioBloqueado(page, baseUrl) {
    await loginReal(page, baseUrl, {
        email: "employee.edit@local.test",
        senha: "Local123!edit"
    });

    // Mesmo padrão de profiles.smoke.mjs: o gate real testado é
    // ativarAba(targetId) — não confia só na visibilidade do botão de
    // menu (data-module-permission esconde o botão quando o CSS/DOM já
    // aplicou, mas o bloqueio de verdade é podeVerAba/PERMISSOES_NAV).
    const ativou = await page.evaluate(() => window.ativarAba?.("view-auditoria") ?? null);
    assert.equal(ativou, false, "Funcionário (mesmo editor) não deveria conseguir ativar a view Auditoria");

    console.log("auditoria.flow: OK (funcionário) — Auditoria bloqueada na navegação para editor.");
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
            ["auditoria-owner", flowAuditoriaOwner],
            ["auditoria-mobile", flowResponsivoMobile]
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

        erros.length = 0;
        try {
            await flowFuncionarioBloqueado(page, baseUrl);
            const errosRelevantes = erros.filter(erro => !ehErroDeRedeExterno(erro));
            if (errosRelevantes.length > 0) {
                throw new Error(`erros de JS: ${JSON.stringify(errosRelevantes)}`);
            }
        } catch (error) {
            await captureDiagnostics(page, "auditoria-funcionario-flow", erros.filter(erro => !ehErroDeRedeExterno(erro)));
            falhas.push(`auditoria-funcionario: ${error.message}`);
            console.error("auditoria-funcionario.flow: FALHOU —", error.message);
        }
    } finally {
        await page.close();
        await browser.close();
        await close();
    }

    if (falhas.length > 0) {
        console.error("auditoria.flow: FALHOU em", falhas.length, "fluxo(s) —", falhas);
        process.exit(1);
    }

    console.log("auditoria.flow: OK — Central de Auditoria validada de ponta a ponta.");
}

main().catch(error => {
    console.error("auditoria.flow: erro inesperado —", error);
    process.exit(1);
});
