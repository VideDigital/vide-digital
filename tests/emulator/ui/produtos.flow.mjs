// Fluxo profundo do Catálogo de Produtos (Central Inteligente de Catálogo).
// Cobre os bugs reais relatados: catálogo zerado por autofill de e-mail no
// campo de busca, salto de scroll ao usar os filtros e KPIs incoerentes com
// o cabeçalho. Login real (Firebase Auth Emulator) + Firestore Emulator.
//
// test:ui:flows roda vários fluxos em sequência contra o MESMO Emulator,
// sem reset entre eles — e auditoria.flow.mjs, de propósito, muda o preço
// de produtos/prod-local-1 pra 129.9 pra testar o trigger de auditoria.
// Por isso este fluxo reescreve os dois produtos via Admin SDK logo no
// início (mesmo padrão de auditoria.flow.mjs), garantindo valores
// conhecidos independente da ordem de execução dos outros fluxos.
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

async function main() {
    const { baseUrl, close } = await startStaticServer();
    const browser = await launchBrowser();
    let falhou = false;

    const page = await browser.newPage({
        viewport: { width: 1440, height: 900 }
    });

    const erros = coletarErrosConsole(page);

    try {
        const db = adminDb();
        await db.doc("produtos/prod-local-1").set({
            criadoPor: "owner-pro",
            nome: "Produto Local",
            preco: 99,
            tipo: "fisico",
            estoque: 10,
            statusProduto: "ativo",
            destaque: true,
            ordem: 1
        }, { merge: true });
        await db.doc("produtos/prod-local-2").set({
            criadoPor: "owner-pro",
            nome: "Produto Digital Local",
            descricao: "Segundo produto de teste do catálogo",
            preco: 49,
            precoDe: 70,
            tipo: "digital",
            statusProduto: "ativo",
            ordem: 2
        }, { merge: true });

        await loginReal(page, baseUrl, {
            email: "owner.pro@local.test",
            senha: "Local123!pro"
        });

        // A) Carga real: os dois produtos do tenant aparecem, cabeçalho e
        // Central Inteligente concordam entre si (nunca "2 Ativos" no
        // cabeçalho com "0 produtos visíveis" na Central).
        await page.waitForSelector(
            "#produtos-container .aura-commerce-card",
            { state: "visible", timeout: 20000 }
        );

        await page.waitForFunction(() => {
            return document.querySelectorAll("#produtos-container .aura-commerce-card").length === 2;
        }, { timeout: 15000 });

        // Garante que a UI já carregou os valores de preço reescritos acima
        // (não os de uma execução anterior de outro fluxo).
        await page.waitForFunction(() => {
            const preco = document.getElementById("catalogo-resumo-preco");
            return preco && preco.textContent.includes("74,00");
        }, { timeout: 15000 }).catch(async () => {
            await page.evaluate(() => window.carregarProdutos && window.carregarProdutos());
            await page.waitForFunction(() => {
                const preco = document.getElementById("catalogo-resumo-preco");
                return preco && preco.textContent.includes("74,00");
            }, { timeout: 15000 });
        });

        const contadorInicial = await page.textContent("#contador-produtos");
        assert.match(
            (contadorInicial || "").trim(),
            /2\s*Ativo/,
            `Cabeçalho deveria mostrar 2 Ativo(s), veio: "${contadorInicial}"`
        );

        const resumoTotalInicial = await page.textContent("#catalogo-resumo-total");
        assert.equal(
            (resumoTotalInicial || "").trim(),
            "2",
            "Central Inteligente deveria mostrar 2 produtos visíveis no total, coerente com o cabeçalho"
        );

        const resultadosVisiveisInicial = await page.textContent("#catalogo-resultados-visiveis");
        assert.match(
            resultadosVisiveisInicial || "",
            /2 produtos vis/,
            `Contador de resultados visíveis incoerente: "${resultadosVisiveisInicial}"`
        );

        // Preço médio real: (99 + 49) / 2 = 74.
        const precoMedioInicial = await page.textContent("#catalogo-resumo-preco");
        assert.match(
            precoMedioInicial || "",
            /74,00/,
            `Preço médio deveria ser R$ 74,00, veio: "${precoMedioInicial}"`
        );

        // Campo de busca deve começar vazio — nunca pré-preenchido.
        const valorBuscaInicial = await page.inputValue("#catalogo-busca");
        assert.equal(valorBuscaInicial, "", "O campo de busca deveria começar vazio");

        // B) Autofill: simula o navegador/gerenciador de senhas preenchendo
        // o campo com o e-mail autenticado, SEM nenhum evento de teclado
        // real (autofill nunca dispara keydown) — reproduz o bug relatado.
        await page.evaluate(() => {
            const campo = document.getElementById("catalogo-busca");
            campo.value = "owner.pro@local.test";
            campo.dispatchEvent(new Event("input", { bubbles: true }));
        });

        // A auto-correção roda dentro de aplicarFerramentasCatalogo, disparada
        // pelo listener de "input" (debounce de 90ms) — espera o campo voltar
        // a ficar vazio e os produtos voltarem a aparecer, em vez de ficar
        // zerado como no bug original.
        await page.waitForFunction(() => {
            const campo = document.getElementById("catalogo-busca");
            return campo && campo.value === "";
        }, { timeout: 5000 });

        await page.waitForFunction(() => {
            const total = document.getElementById("catalogo-resumo-total");
            return total && total.textContent.trim() === "2";
        }, { timeout: 5000 });

        const cardsAposAutofill = await page.$$eval(
            "#produtos-container .aura-commerce-card:not(.catalogo-filtrado-oculto)",
            els => els.length
        );
        assert.equal(
            cardsAposAutofill,
            2,
            "Depois do autofill indevido ser limpo, os 2 produtos devem continuar visíveis"
        );

        // Uma busca real digitada (com keydown de verdade) nunca pode ser
        // apagada pela auto-correção, mesmo esvaziando o catálogo visível.
        await page.click("#catalogo-busca");
        await page.locator("#catalogo-busca").pressSequentially("termo sem nenhum produto correspondente", { delay: 10 });
        await page.waitForFunction(() => {
            const total = document.getElementById("catalogo-resumo-total");
            return total && total.textContent.trim() === "0";
        }, { timeout: 5000 });
        const valorBuscaPreservado = await page.inputValue("#catalogo-busca");
        assert.equal(
            valorBuscaPreservado,
            "termo sem nenhum produto correspondente",
            "Uma busca real digitada pelo usuário nunca deve ser apagada automaticamente"
        );
        const avisoBuscaVazia = await page.textContent("#produtos-container").catch(() => "");
        assert.match(
            avisoBuscaVazia || "",
            /Nenhum produto encontrado para esta busca/,
            "Deveria mostrar uma mensagem específica de 'sem resultado pra busca', distinta de catálogo vazio"
        );

        // Busca real que corresponde a um produto.
        await page.fill("#catalogo-busca", "");
        await page.click("#catalogo-busca");
        await page.locator("#catalogo-busca").pressSequentially("Digital", { delay: 10 });
        await page.waitForFunction(() => {
            const total = document.getElementById("catalogo-resumo-total");
            return total && total.textContent.trim() === "1";
        }, { timeout: 5000 });

        // Limpar a busca restaura os 2 produtos.
        await page.click("#catalogo-limpar-busca");
        await page.waitForFunction(() => {
            const total = document.getElementById("catalogo-resumo-total");
            return total && total.textContent.trim() === "2";
        }, { timeout: 5000 });

        // C) Filtros: nunca navegam, nunca mudam URL/hash, nunca jogam a
        // página pro topo — e o resultado é imediato (sem nova leitura ao
        // Firestore por clique). O scroll real acontece dentro do <main>
        // (overflow-y: auto, app shell), não em window/document.
        const urlAntesDosFiltros = page.url();

        await page.evaluate(() => { document.querySelector("main").scrollTop = 600; });
        await page.waitForTimeout(50);
        const scrollAntesDoFiltro = await page.evaluate(() => document.querySelector("main").scrollTop);
        assert.ok(scrollAntesDoFiltro > 0, "Pré-condição: o painel precisa estar rolado antes do clique no filtro");

        // Clique programático (não page.click): evita que o próprio
        // Playwright role a página pra trazer o botão pra viewport antes de
        // clicar, o que mascararia a medição real de scroll do app.
        await page.evaluate(() => document.getElementById("filtro-fisicos").click());
        await page.waitForFunction(() => {
            const contador = document.getElementById("contador-produtos");
            return contador && /1\s*Ativo/.test(contador.textContent || "");
        }, { timeout: 10000 });

        assert.equal(page.url(), urlAntesDosFiltros, "Clicar num filtro nunca deve mudar a URL/hash");

        const ariaFisicos = await page.getAttribute("#filtro-fisicos", "aria-pressed");
        const ariaTodos = await page.getAttribute("#filtro-todos", "aria-pressed");
        assert.equal(ariaFisicos, "true", "O filtro Físicos clicado deve ficar aria-pressed=true");
        assert.equal(ariaTodos, "false", "O filtro Todos deve deixar de estar pressionado");

        await page.waitForTimeout(150);
        const scrollDepoisDoFiltro = await page.evaluate(() => document.querySelector("main").scrollTop);
        assert.ok(
            Math.abs(scrollDepoisDoFiltro - scrollAntesDoFiltro) < 50,
            `O clique no filtro não deveria jogar o painel pro topo (antes: ${scrollAntesDoFiltro}, depois: ${scrollDepoisDoFiltro})`
        );

        await page.evaluate(() => document.getElementById("filtro-digitais").click());
        await page.waitForFunction(() => {
            const contador = document.getElementById("contador-produtos");
            return contador && /1\s*Ativo/.test(contador.textContent || "");
        }, { timeout: 10000 });
        const ariaDigitais = await page.getAttribute("#filtro-digitais", "aria-pressed");
        assert.equal(ariaDigitais, "true");

        await page.evaluate(() => document.getElementById("filtro-rascunhos").click());
        await page.waitForFunction(() => {
            const contador = document.getElementById("contador-produtos");
            return contador && /0\s*Rascunho/.test(contador.textContent || "");
        }, { timeout: 10000 });
        const ariaRascunhos = await page.getAttribute("#filtro-rascunhos", "aria-pressed");
        assert.equal(ariaRascunhos, "true");
        await page.waitForSelector("text=Nenhum rascunho encontrado", { timeout: 10000 });

        await page.evaluate(() => document.getElementById("filtro-todos").click());
        await page.waitForFunction(() => {
            const contador = document.getElementById("contador-produtos");
            return contador && /2\s*Ativo/.test(contador.textContent || "");
        }, { timeout: 10000 });
        const ariaTodosFinal = await page.getAttribute("#filtro-todos", "aria-pressed");
        assert.equal(ariaTodosFinal, "true");

        // D) Navegação: sair da view e voltar não deve duplicar listeners
        // nem deixar o catálogo em loading infinito.
        await page.evaluate(() => window.carregarProdutos && window.carregarProdutos());
        await page.waitForFunction(() => {
            return document.querySelectorAll("#produtos-container .aura-commerce-card").length === 2;
        }, { timeout: 15000 });

        const errosRelevantes = erros.filter(erro => !ehErroDeRedeExterno(erro));
        assert.deepEqual(
            errosRelevantes,
            [],
            `Erros de console no fluxo de Produtos: ${JSON.stringify(errosRelevantes)}`
        );

        console.log(
            "produtos.flow: OK — carga real, autofill de e-mail neutralizado, " +
            "busca real preservada, mensagens de estado vazio corretas, " +
            "filtros sem navegação/salto de scroll, sem erros de console."
        );
    } catch (error) {
        falhou = true;

        await captureDiagnostics(
            page,
            "produtos-flow",
            erros.filter(erro => !ehErroDeRedeExterno(erro))
        );

        console.error("produtos.flow: FALHOU —", error.message);
    } finally {
        await page.close();
        await browser.close();
        await close();
    }

    if (falhou) process.exit(1);
}

await main();
