// Central de Auditoria V1 — fluxo profundo real: login como owner, uma
// escrita real (via Admin SDK, simulando o cliente) dispara o Firestore
// trigger de auditoria, a UI busca e mostra o evento, sem PII visível,
// com drawer de detalhes e responsivo em mobile. Também confirma que um
// funcionário (mesmo editor com todas as outras permissões) não vê nem
// acessa a Central de Auditoria — é owner-only na V1.
import assert from "node:assert/strict";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
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
    await Promise.all([
        db.doc("auditoria/ui-whatsapp-event").set({
            schemaVersion: 1,
            eventId: "ui-whatsapp-event",
            ownerUid: "owner-pro",
            actorUid: "admin-2",
            actorType: "user",
            module: "whatsapp",
            entityType: "conexao",
            entityId: "wa-test-2",
            operation: "action",
            action: "whatsapp.reconectado",
            risk: "high",
            summary: "Conexão de teste reconectada",
            changedFields: ["status"],
            before: {},
            after: { status: "active" },
            source: "admin-function",
            ok: true,
            createdAt: Timestamp.now()
        }),
        db.doc("auditoria/ui-admin-event").set({
            schemaVersion: 1,
            eventId: "ui-admin-event",
            ownerUid: "owner-pro",
            actorUid: "admin-2",
            actorType: "user",
            module: "admin",
            entityType: "loja",
            entityId: "owner-pro",
            operation: "update",
            action: "admin.plano_alterado",
            risk: "high",
            summary: "Plano de teste alterado",
            changedFields: ["plano"],
            before: { plano: "starter" },
            after: { plano: "pro" },
            source: "admin-function",
            ok: true,
            createdAt: Timestamp.now()
        })
    ]);

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
    await page.locator("#audit-tabela-corpo tr", { hasText: "prod-local-1" }).first().click();
    await page.waitForSelector("#audit-drawer:not(.hidden)", { timeout: 10000 });
    const avisoDrawer = await page.textContent("#audit-drawer-conteudo");
    assert.ok(avisoDrawer.includes("somente a versão sanitizada"), "Drawer deveria explicar a sanitização e a omissão de PII");
    assert.ok(await page.locator("#audit-drawer [data-audit-copy]").count() >= 2, "Drawer deveria oferecer IDs completos copiáveis");
    assert.match(avisoDrawer, /Campos alterados/i, "Drawer deveria destacar changedFields");
    await page.click("#audit-drawer-fechar");
    // state padrão do waitForSelector é "visible" — aqui o seletor já
    // exige a classe "hidden", então o estado certo a esperar é
    // "attached" (só presente no DOM), nunca "visible" (contradição).
    await page.waitForSelector("#audit-drawer.hidden", { state: "attached", timeout: 5000 });

    // Filtros combináveis: módulo + risco preservam um ao outro e o estado
    // ativo fica explícito. WhatsApp/Admin são módulos reais selecionáveis.
    const modulosDisponiveis = await page.locator("#audit-filtro-modulo option").allTextContents();
    assert.ok(modulosDisponiveis.includes("WhatsApp Oficial"));
    assert.ok(modulosDisponiveis.includes("Administração"));
    await page.selectOption("#audit-filtro-modulo", "whatsapp");
    await page.selectOption("#audit-filtro-risco", "high");
    await page.waitForFunction(() => document.querySelectorAll("#audit-tabela-corpo tr").length === 1);
    assert.match(await page.textContent("#audit-tabela-corpo"), /wa-test-2/);
    assert.match(await page.textContent("#audit-filtros-indicador"), /2 filtro/);
    assert.equal(await page.inputValue("#audit-filtro-modulo"), "whatsapp");

    // Exportação usa exatamente os mesmos filtros e não inclui outro módulo.
    await page.evaluate(() => {
        const original = URL.createObjectURL.bind(URL);
        window.__auditExportBlob = null;
        URL.createObjectURL = blob => {
            window.__auditExportBlob = blob;
            return original(blob);
        };
    });
    await page.click("#audit-exportar-csv");
    await page.waitForFunction(() => Boolean(window.__auditExportBlob), null, { timeout: 10000 });
    const csvFiltrado = await page.evaluate(() => window.__auditExportBlob.text());
    assert.match(csvFiltrado, /wa-test-2/);
    assert.equal(csvFiltrado.includes("ui-admin-event"), false);

    await page.click("#audit-limpar");
    await page.waitForFunction(() => document.getElementById("audit-filtros-indicador")?.textContent.includes("Nenhum filtro"));
    assert.equal(await page.inputValue("#audit-filtro-modulo"), "");
    assert.equal(await page.inputValue("#audit-filtro-risco"), "");

    await page.selectOption("#audit-filtro-modulo", "admin");
    assert.match(await page.textContent("#audit-tabela-corpo"), /owner-pro/);
    await page.click("#audit-limpar");
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
    const colunasFiltro = await page.locator(".aura-audit-filtros-grade").evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length);
    assert.equal(colunasFiltro, 1, "Filtros devem ocupar uma coluna no mobile");
    const larguraOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(larguraOverflow <= 1, `Auditoria não deveria criar overflow horizontal global no mobile (${larguraOverflow}px)`);

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
