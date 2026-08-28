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
        await db.doc("produtos/prod-local-draft").set({
            criadoPor: "owner-pro",
            nome: "Rascunho Fisico Local",
            descricao: "Produto fisico salvo como rascunho para o fluxo de catalogo",
            preco: 39,
            tipo: "fisico",
            statusProduto: "rascunho",
            ordem: 3
        }, { merge: true });

        await loginReal(page, baseUrl, {
            email: "owner.pro@local.test",
            senha: "Local123!pro"
        });

        // A) Produtos e Catálogo são views distintas, com a mesma permissão e
        // o mesmo workspace/dados. Começamos na gestão operacional.
        assert.equal(await page.evaluate(() => window.ativarAba?.("view-produtos")), true);
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

        assert.equal(await page.locator("#view-produtos .aura-product-toolbar").isVisible(), true);
        assert.equal(await page.locator("#view-produtos .btn-gerenciar").first().isVisible(), true);

        const idsNaGestao = await page.$$eval("#produtos-container .aura-commerce-card", cards => cards.map(card => card.dataset.produtoId).sort());
        assert.equal(await page.evaluate(() => window.ativarAba?.("view-catalogo")), true);
        await page.waitForSelector("#view-catalogo #catalogo-busca", { state: "visible", timeout: 15000 });
        await page.waitForFunction(() => document.querySelectorAll("#produtos-container .aura-commerce-card").length === 2);
        const idsNoCatalogo = await page.$$eval("#produtos-container .aura-commerce-card", cards => cards.map(card => card.dataset.produtoId).sort());
        assert.deepEqual(idsNoCatalogo, idsNaGestao, "Produtos e Catálogo devem reutilizar exatamente a mesma fonte de dados");
        assert.equal(await page.locator("#view-catalogo .btn-gerenciar").first().isVisible(), false, "Catálogo deve ser somente leitura");
        assert.equal(await page.locator("#catalogo-selection-toggle").isVisible(), false, "Catálogo não deve expor seleção em massa");

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
        const semanticaBusca = await page.locator("#catalogo-busca").evaluate(campo => ({
            type: campo.type,
            name: campo.name,
            role: campo.getAttribute("role"),
            autocomplete: campo.getAttribute("autocomplete"),
            ariaLabel: campo.getAttribute("aria-label")
        }));
        assert.deepEqual(semanticaBusca, {
            type: "search",
            name: "catalog_search_query",
            role: "searchbox",
            autocomplete: "off",
            ariaLabel: "Buscar produtos no catálogo"
        });

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

        // Voltar à gestão operacional limpa a busca analítica e restaura os
        // controles de CRUD, sem criar outro conjunto de cards.
        assert.equal(await page.evaluate(() => window.ativarAba?.("view-produtos")), true);
        await page.waitForSelector("#view-produtos .aura-product-toolbar", { state: "visible", timeout: 10000 });
        assert.equal(await page.inputValue("#catalogo-busca"), "");
        assert.equal(await page.locator("#catalogo-selection-toggle").isVisible(), true);

        // C) Filtros: nunca navegam, nunca mudam URL/hash, nunca jogam a
        // página pro topo — e o resultado é imediato (sem nova leitura ao
        // Firestore por clique). O scroll real acontece dentro do <main>
        // (overflow-y: auto, app shell), não em window/document.
        const urlAntesDosFiltros = page.url();

        // <main> não tem scroll-behavior:smooth (confirmado — nenhuma regra
        // de CSS do app shell aplica isso a este elemento), então atribuir
        // scrollTop é síncrono; o que não é síncrono é o layout do painel
        // ficar alto o suficiente pra ser rolável logo após o
        // ativarAba("view-produtos") acima. Um waitForTimeout(50) fixo
        // apostava que o layout já tinha assentado nesse intervalo — flaky
        // por natureza (falhava, e sempre com scrollAntesDoFiltro === 0,
        // em pontos diferentes da CI real). Espera determinística pela
        // condição observável real (scrollHeight > clientHeight) antes de
        // medir, sem precisar de nenhuma pausa fixa depois.
        await page.waitForFunction(() => {
            const main = document.querySelector("main");
            return !!main && main.scrollHeight > main.clientHeight;
        }, { timeout: 5000 });
        await page.evaluate(() => { document.querySelector("main").scrollTop = 600; });
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
            return contador && /1\s*Rascunho/.test(contador.textContent || "");
        }, { timeout: 10000 });
        const ariaRascunhos = await page.getAttribute("#filtro-rascunhos", "aria-pressed");
        assert.equal(ariaRascunhos, "true");
        const ariaDigitaisAposRascunhos = await page.getAttribute("#filtro-digitais", "aria-pressed");
        const ariaFisicosAposRascunhos = await page.getAttribute("#filtro-fisicos", "aria-pressed");
        assert.equal(ariaDigitaisAposRascunhos, "false", "Rascunhos deve desligar visualmente o filtro Digitais");
        assert.equal(ariaFisicosAposRascunhos, "false", "Rascunhos deve desligar visualmente o filtro Fisicos");

        const cardsRascunhoAposDigitais = await page.$$eval(
            "#produtos-container .aura-commerce-card:not(.catalogo-filtrado-oculto)",
            cards => cards.map(card => ({ nome: card.dataset.nome, status: card.dataset.status }))
        );
        assert.deepEqual(
            cardsRascunhoAposDigitais,
            [{ nome: "Rascunho Fisico Local", status: "rascunho" }],
            "Digitais -> Rascunhos deve mostrar o rascunho fisico, sem manter o filtro de tipo invisivel"
        );

        await page.evaluate(() => document.getElementById("filtro-todos").click());
        await page.waitForFunction(() => {
            const contador = document.getElementById("contador-produtos");
            return contador && /2\s*Ativo/.test(contador.textContent || "");
        }, { timeout: 10000 });
        const ariaTodosFinal = await page.getAttribute("#filtro-todos", "aria-pressed");
        assert.equal(ariaTodosFinal, "true");
        assert.equal(await page.getAttribute("#filtro-rascunhos", "aria-pressed"), "false");
        assert.equal(await page.getAttribute("#filtro-digitais", "aria-pressed"), "false");
        assert.equal(await page.getAttribute("#filtro-fisicos", "aria-pressed"), "false");

        // Uma busca textual do Catálogo não pode atravessar silenciosamente a
        // navegação para Produtos nem esconder o único rascunho físico.
        assert.equal(await page.evaluate(() => window.ativarAba?.("view-catalogo")), true);
        await page.waitForSelector("#catalogo-busca", { state: "visible", timeout: 10000 });
        await page.fill("#catalogo-busca", "Produto Digital Local");
        await page.waitForFunction(() => {
            const total = document.getElementById("catalogo-resumo-total");
            return total && total.textContent.trim() === "1";
        }, { timeout: 5000 });

        // Voltar à gestão operacional limpa novamente a busca analítica.
        assert.equal(await page.evaluate(() => window.ativarAba?.("view-produtos")), true);
        await page.waitForSelector("#view-produtos .aura-product-toolbar", { state: "visible", timeout: 10000 });
        assert.equal(await page.inputValue("#catalogo-busca"), "");
        assert.equal(await page.locator("#catalogo-selection-toggle").isVisible(), true);

        await page.evaluate(() => document.getElementById("filtro-rascunhos").click());
        await page.waitForFunction(() => {
            const busca = document.getElementById("catalogo-busca");
            const contador = document.getElementById("contador-produtos");
            const cards = document.querySelectorAll("#produtos-container .aura-commerce-card:not(.catalogo-filtrado-oculto)");
            return busca?.value === "" && /1\s*Rascunho/.test(contador?.textContent || "") && cards.length === 1;
        }, { timeout: 10000 });
        assert.equal(await page.inputValue("#catalogo-busca"), "", "Rascunhos deve limpar a busca textual ativa");
        assert.equal(await page.getAttribute("#filtro-rascunhos", "aria-pressed"), "true");
        assert.equal(
            await page.getAttribute("#produtos-container .aura-commerce-card", "data-nome"),
            "Rascunho Fisico Local"
        );

        // Voltar a Todos restaura os dois ativos e sincroniza o estado visual.
        await page.evaluate(() => document.getElementById("filtro-todos").click());
        await page.waitForFunction(() => {
            const contador = document.getElementById("contador-produtos");
            return contador && /2\s*Ativo/.test(contador.textContent || "");
        }, { timeout: 10000 });
        assert.equal(await page.getAttribute("#filtro-todos", "aria-pressed"), "true");
        assert.equal(await page.getAttribute("#filtro-rascunhos", "aria-pressed"), "false");

        // D) Produtos → Catálogo → Produtos: o workspace é único, a busca
        // não atravessa views e um único input dispara um único listener.
        const idsAntesDaNavegacao = await page.$$eval("#produtos-container .aura-commerce-card", cards => cards.map(card => card.dataset.produtoId).sort());
        assert.equal(await page.evaluate(() => window.ativarAba?.("view-catalogo")), true);
        await page.waitForFunction(() => {
            return document.querySelectorAll("#produtos-container .aura-commerce-card").length === 2;
        }, { timeout: 15000 });
        assert.equal(await page.inputValue("#catalogo-busca"), "");
        assert.equal(await page.locator("#produtos-workspace").count(), 1, "Não pode existir workspace duplicado");
        const idsDepoisDaNavegacao = await page.$$eval("#produtos-container .aura-commerce-card", cards => cards.map(card => card.dataset.produtoId).sort());
        assert.deepEqual(idsDepoisDaNavegacao, idsAntesDaNavegacao);

        await page.waitForTimeout(250);
        await page.evaluate(() => {
            const original = window.aplicarFerramentasCatalogo;
            window.__catalogoAplicacoesPorInput = 0;
            window.aplicarFerramentasCatalogo = (...args) => {
                window.__catalogoAplicacoesPorInput += 1;
                return original(...args);
            };
            const campo = document.getElementById("catalogo-busca");
            campo.value = "Produto";
            campo.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await page.waitForTimeout(250);
        assert.equal(await page.evaluate(() => window.__catalogoAplicacoesPorInput), 1, "A busca deve ter somente um listener ativo");

        // Um autofill indevido não pode ser restaurado por troca de view.
        await page.evaluate(() => {
            document.getElementById("catalogo-busca").value = "owner.pro@local.test";
            window.ativarAba("view-produtos");
            window.ativarAba("view-catalogo");
        });
        await page.waitForFunction(() => document.getElementById("catalogo-busca")?.value === "");

        // Recarga real: a sessão permanece autenticada e o Catálogo volta com
        // busca vazia, sem recuperar e-mail ou termo anterior.
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => window.__videHubContextInitialized?.() === true, null, { timeout: 20000 });
        assert.equal(await page.evaluate(() => window.ativarAba?.("view-catalogo")), true);
        await page.waitForSelector("#view-catalogo #catalogo-busca", { state: "visible", timeout: 15000 });
        assert.equal(await page.inputValue("#catalogo-busca"), "", "A recarga não deve restaurar autofill ou busca anterior");
        await page.waitForFunction(() => document.querySelectorAll("#produtos-container .aura-commerce-card").length === 2, null, { timeout: 15000 });

        // PRODUTOS-MOBILE-001B — instrumentação DIAGNÓSTICA (read-only em
        // relação ao próprio app): não altera nenhum comportamento de
        // produto, não enfraquece a assertion original abaixo (continua
        // sendo uma única chamada a isVisible(), comparada com true, sem
        // polling/retry/sleep) — só captura evidência estruturada em volta
        // dela. Ver PRODUTOS-MOBILE-001/001A para o contexto do finding.
        await page.evaluate(() => {
            window.__diagCatalogoMutations = [];
            const alvos = [
                ["view-catalogo", document.getElementById("view-catalogo")],
                ["produtos-workspace", document.getElementById("produtos-workspace")],
                ["aura-catalog-tools", document.querySelector("#view-catalogo .aura-catalog-tools")],
                ["aura-catalog-search", document.querySelector("#view-catalogo .aura-catalog-search")],
                ["catalogo-busca", document.getElementById("catalogo-busca")]
            ];
            window.__diagCatalogoObservers = alvos
                .filter(([, el]) => el)
                .map(([nome, el]) => {
                    const observer = new MutationObserver((mutations) => {
                        for (const m of mutations) {
                            window.__diagCatalogoMutations.push({
                                alvo: nome,
                                atributo: m.attributeName,
                                valorAntigo: m.oldValue,
                                valorNovo: el.getAttribute(m.attributeName),
                                timestamp: performance.now()
                            });
                        }
                    });
                    observer.observe(el, {
                        attributes: true,
                        attributeOldValue: true,
                        attributeFilter: ["class", "style", "hidden", "data-produtos-mode"]
                    });
                    return observer;
                });
            window.__diagCatalogoRafLog = [];
            const registrarRaf = () => {
                window.__diagCatalogoRafLog.push(performance.now());
                if (window.__diagCatalogoRafLog.length < 5) requestAnimationFrame(registrarRaf);
            };
            requestAnimationFrame(registrarRaf);
        });

        const capturarSnapshotCatalogoDiag = () => {
            function retangulo(el) {
                if (!el) return null;
                const r = el.getBoundingClientRect();
                return { x: r.x, y: r.y, width: r.width, height: r.height };
            }
            function estiloBasico(el) {
                if (!el) return null;
                const cs = getComputedStyle(el);
                return { display: cs.display, visibility: cs.visibility, opacity: cs.opacity };
            }
            const viewCatalogo = document.getElementById("view-catalogo");
            const workspace = document.getElementById("produtos-workspace");
            const tools = document.querySelector("#view-catalogo .aura-catalog-tools");
            const search = document.querySelector("#view-catalogo .aura-catalog-search");
            const busca = document.getElementById("catalogo-busca");
            const activeView = document.querySelector(".view-section.active");
            return {
                timestamp: performance.now(),
                viewport: { width: window.innerWidth, height: window.innerHeight },
                documentReadyState: document.readyState,
                fontsStatus: (document.fonts && document.fonts.status) || null,
                activeElementTag: document.activeElement ? document.activeElement.tagName : null,
                activeViewId: activeView ? activeView.id : null,
                catalogoBuscaDuplicateCount: document.querySelectorAll("#catalogo-busca").length,
                viewCatalogo: viewCatalogo ? { className: viewCatalogo.className, ...estiloBasico(viewCatalogo), rect: retangulo(viewCatalogo) } : null,
                produtosWorkspace: workspace ? {
                    parentId: workspace.parentElement ? workspace.parentElement.id : null,
                    produtosMode: workspace.dataset.produtosMode || null,
                    ...estiloBasico(workspace),
                    rect: retangulo(workspace)
                } : null,
                auraCatalogTools: tools ? {
                    ...estiloBasico(tools),
                    gridTemplateColumns: getComputedStyle(tools).gridTemplateColumns,
                    flexDirection: getComputedStyle(tools).flexDirection,
                    rect: retangulo(tools)
                } : null,
                auraCatalogSearch: search ? {
                    ...estiloBasico(search),
                    width: getComputedStyle(search).width,
                    minWidth: getComputedStyle(search).minWidth,
                    maxWidth: getComputedStyle(search).maxWidth,
                    rect: retangulo(search)
                } : null,
                catalogoBusca: busca ? {
                    ...estiloBasico(busca),
                    clientWidth: busca.clientWidth,
                    clientHeight: busca.clientHeight,
                    offsetWidth: busca.offsetWidth,
                    offsetHeight: busca.offsetHeight,
                    rect: retangulo(busca)
                } : null
            };
        };
        const capturarCadeiaAncestrais = () => {
            const alvo = document.querySelector("#view-catalogo #catalogo-busca");
            if (!alvo) return null;
            const cadeia = [];
            let el = alvo;
            while (el && el.nodeType === 1) {
                const cs = getComputedStyle(el);
                const r = el.getBoundingClientRect();
                cadeia.push({
                    tag: el.tagName,
                    id: el.id || null,
                    classes: el.className || null,
                    display: cs.display,
                    visibility: cs.visibility,
                    opacity: cs.opacity,
                    width: r.width,
                    height: r.height
                });
                el = el.parentElement;
            }
            return cadeia;
        };

        const snapshotAntesResize = await page.evaluate(capturarSnapshotCatalogoDiag);

        await page.setViewportSize({ width: 390, height: 844 });

        const snapshotDepoisResize = await page.evaluate(capturarSnapshotCatalogoDiag);

        const overflowCatalogoMobile = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(overflowCatalogoMobile <= 1, `Catálogo não deve criar overflow horizontal no mobile (${overflowCatalogoMobile}px)`);

        // Assertion original: uma única chamada a isVisible(), comparada
        // com true — sem polling, sem retry, sem espera. O diagnóstico
        // abaixo só LÊ o resultado já obtido, nunca o recalcula.
        const catalogoBuscaVisivelAposResize = await page.locator("#view-catalogo #catalogo-busca").isVisible();
        const snapshotNaAssercao = await page.evaluate(capturarSnapshotCatalogoDiag);
        const cadeiaAncestraisNaAssercao = await page.evaluate(capturarCadeiaAncestrais);
        const mutationsRegistradas = await page.evaluate(() => window.__diagCatalogoMutations || []);
        const rafLog = await page.evaluate(() => window.__diagCatalogoRafLog || []);

        console.log("[DIAG PRODUTOS-MOBILE-001B] " + JSON.stringify({
            resultado: catalogoBuscaVisivelAposResize ? "PASS" : "FAIL",
            snapshotAntesResize,
            snapshotDepoisResize,
            snapshotNaAssercao,
            cadeiaAncestraisNaAssercao,
            mutationsRegistradas,
            rafLog
        }));

        assert.equal(catalogoBuscaVisivelAposResize, true);
        assert.equal(await page.evaluate(() => window.ativarAba?.("view-produtos")), true);
        assert.equal(await page.locator("#view-produtos .aura-product-toolbar").isVisible(), true);
        const colunasProdutosMobile = await page.locator("#produtos-container").evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length);
        assert.equal(colunasProdutosMobile, 1, "Produtos deve usar uma coluna no mobile");
        await page.setViewportSize({ width: 1440, height: 900 });

        const errosRelevantes = erros.filter(erro => !ehErroDeRedeExterno(erro));
        assert.deepEqual(
            errosRelevantes,
            [],
            `Erros de console no fluxo de Produtos: ${JSON.stringify(errosRelevantes)}`
        );

        console.log(
            "produtos.flow: OK — carga real, autofill de e-mail neutralizado, " +
            "busca real preservada, mensagens de estado vazio corretas, " +
            "views Produtos/Catálogo separadas, listener único e recarga segura."
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
