// VIDE-HUB-FRONTEND-ERROR-TELEMETRY-071 — ligação do reporter central nos
// pontos dos gaps B1 da auditoria 070 recuperada (FE-OBS-001/002/003) e
// escopo deliberadamente fora (FE-OBS-004/005, Atendimento). Lê o código
// como texto: o comportamento das peças está coberto em
// tests/frontend-error-reporter-core.test.mjs, tests/pedidos-estruturados.test.mjs,
// tests/functions/frontend-error-telemetry.test.mjs e no flow
// tests/emulator/ui/frontend-error-telemetry.flow.mjs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (arquivo) => readFileSync(path.join(root, arquivo), "utf8");

function blocoEntre(texto, inicio, fim) {
    const i = texto.indexOf(inicio);
    assert.ok(i >= 0, `trecho não encontrado: ${inicio}`);
    const j = texto.indexOf(fim, i + inicio.length);
    assert.ok(j > i, `fim não encontrado depois de: ${inicio}`);
    return texto.slice(i, j + fim.length);
}

describe("071 — FE-OBS-001: bootstrap do painel com fronteira", () => {
    const painel = ler("dashboard-app.js");

    it("importa e instala o reporter central uma única vez", () => {
        assert.match(painel, /import \{ installFrontendErrorTelemetry, reportFrontendError, runWithFrontendErrorBoundary \} from "\.\/frontend-error-telemetry\.js";/);
        assert.equal(painel.match(/installFrontendErrorTelemetry\(\);/g)?.length, 1);
    });

    it("o callback de onAuthStateChanged roda dentro da fronteira com categoria bootstrap e estado de erro visível", () => {
        assert.match(painel, /onAuthStateChanged\(auth, \(user\) => runWithFrontendErrorBoundary\(async \(\) => \{/);
        assert.match(painel, /\}, \{ category: "bootstrap", onFailure: mostrarFalhaBootstrapPainel \}\)\);/);
        assert.doesNotMatch(painel, /onAuthStateChanged\(auth, async \(user\) =>/, "nenhum callback de bootstrap assíncrono sem fronteira");
    });

    it("o estado de erro do bootstrap é persistente (role=alert), com ação de recarregar, e nunca lança", () => {
        const aviso = blocoEntre(painel, "function mostrarFalhaBootstrapPainel() {", "// CARGA DO USUÁRIO E PERSISTÊNCIA DOS CAMPOS ORIGINAIS");
        assert.match(aviso, /setAttribute\("role", "alert"\)/);
        assert.match(aviso, /Não foi possível carregar o painel/);
        assert.match(aviso, /window\.location\.reload\(\)/);
        assert.match(aviso, /catch \(_erroAviso\)/);
    });
});

describe("071 — FE-OBS-002: loja e Landing Page", () => {
    const loja = ler("loja.html");
    const lp = ler("index.html");

    it("loja instala o reporter e, na falha da vitrine, troca o esqueleto por estado de erro e reporta store-load", () => {
        assert.match(loja, /import \{ installFrontendErrorTelemetry, reportFrontendError \} from "\.\/frontend-error-telemetry\.js";/);
        assert.match(loja, /installFrontendErrorTelemetry\(\);/);
        const captura = blocoEntre(loja, 'console.error("Erro ao carregar vitrine:", err);', 'reportFrontendError(err, { category: "store-load" });');
        assert.match(captura, /const vitrineFalha = document\.getElementById\("vitrine-container"\);\n\s+if \(vitrineFalha\) \{\n\s+vitrineFalha\.innerHTML = '<div[^']*data-vitrine-estado="erro"/,
            "o container da vitrine é efetivamente substituído pelo estado de erro");
        assert.match(captura, /role="alert"/);
        assert.doesNotMatch(captura, /nomeLoja|dados\.|todosProdutos/, "nenhum conteúdo da loja no estado de erro nem no reporte");
    });

    it("LP pública preserva a mensagem existente e acrescenta só a telemetria lp-init, com import isolado", () => {
        assert.match(lp, /const telemetriaPronta = import\(base \+ "frontend-error-telemetry\.js"\)/);
        assert.match(lp, /\.catch\(\(\) => null\);/);
        const captura = blocoEntre(lp, 'console.error("Erro ao carregar landing page:", erro);', 'category: "lp-init" }));');
        assert.match(captura, /lp-container"\)\.innerHTML = '<p class="text-red-400 text-xs px-6 text-center">Erro: ' \+ erro\.message \+ '<\/p>';/);
        assert.match(captura, /telemetria\?\.reportFrontendError\(erro, \{ category: "lp-init" \}\)/);
    });

    it("lp-public-v4.js (não carregado por nenhuma página) não foi alterado para telemetria", () => {
        assert.doesNotMatch(ler("lp-public-v4.js"), /reportFrontendError|VideFrontendTelemetry/);
    });
});

describe("071 — FE-OBS-003: Pedidos com estado de erro distinto de vazio", () => {
    const engine = ler("orders-engine-v1.js");

    it("falha do listener marca legacyError, reporta orders-listener e reconstrói a lista", () => {
        const erro = blocoEntre(engine, "}, (error) => {\n        state.legacyReady = true;", "rebuildOrders();\n    });");
        assert.match(erro, /state\.legacyError = true;/);
        assert.match(erro, /window\.VideFrontendTelemetry\?\.report\(error, \{ category: "orders-listener" \}\)/);
        assert.match(engine, /state\.legacyError = false;\n {4}state\.unsubscribeLegacy = onSnapshot/, "reinício limpa o estado de erro");
    });

    it("renderTable decide pelo estado puro (erro tem precedência sobre vazio); sem texto de vazio fixo no engine", () => {
        const tabela = blocoEntre(engine, "function renderTable(orders) {", "\n}");
        assert.match(tabela, /estadoListaPedidos\(\{ total: orders\.length, falhaCarregamento: state\.legacyError \}\)/);
        assert.match(tabela, /htmlEstadoListaPedidos\(estadoLista, \{ icone: icons\.box \}\)/);
        assert.ok(!engine.includes("Nenhum pedido encontrado"), "o texto de lista vazia vive só em pedidos-estruturados.js");
    });

    it("abas sem tabela (ou com pedidos parciais) ganham o aviso de erro; badge não diz 'Sincronizado' com falha", () => {
        assert.match(engine, /const avisoFalha = state\.legacyError && \(abaSemTabela \|\| state\.orders\.length > 0\)/);
        assert.match(engine, /content\.innerHTML = avisoFalha \+ renderAbaAtiva\(\);/);
        assert.match(engine, /state\.legacyError \? "Falha ao sincronizar"/);
    });

    it("falha de import do módulo de Pedidos reporta orders-module", () => {
        const leadEngine = ler("lead-engine-v5.js");
        const captura = blocoEntre(leadEngine, 'import("./orders-engine-v1.js?v=100").catch((error) => {', "});");
        assert.match(captura, /window\.VideFrontendTelemetry\?\.report\(error, \{ category: "orders-module" \}\)/);
    });

    it("caminho legado do painel: falha mostra erro na tabela (nunca 'Nenhum pedido ainda.') e reporta orders-legacy", () => {
        const painel = ler("dashboard-app.js");
        const captura = blocoEntre(painel, "const tbodyFalha = document.getElementById(\"pedidos-table-body\");", 'reportFrontendError(err, { category: "orders-legacy" });');
        assert.match(captura, /data-pedidos-estado="erro"/);
        assert.match(captura, /Não foi possível carregar os pedidos/);
        assert.doesNotMatch(captura, /Nenhum pedido ainda/);
    });
});

describe("071 — escopo fora desta PR", () => {
    it("Atendimento: mensagem_envio_falhou continua só como trilha de negócio, sem duplicar no reporter", () => {
        const atendimento = ler("atendimento.js");
        assert.match(atendimento, /montarEvento\(conversa\.id, "mensagem_envio_falhou", \{/);
        assert.doesNotMatch(atendimento, /reportFrontendError|VideFrontendTelemetry|frontend-error-telemetry/);
    });

    it("FE-OBS-004/005 deferidos: Leads e formulários/popup públicos não foram ligados ao reporter", () => {
        for (const arquivo of ["lp-forms-v5.js", "crm360.js"]) {
            assert.doesNotMatch(ler(arquivo), /reportFrontendError|VideFrontendTelemetry/, arquivo);
        }
        const leadEngine = ler("lead-engine-v5.js");
        assert.equal(leadEngine.match(/VideFrontendTelemetry/g)?.length, 1, "lead-engine só reporta a falha do import de Pedidos");
        const loja = ler("loja.html");
        assert.equal(loja.match(/reportFrontendError\(/g)?.length, 1, "loja só reporta a falha da vitrine (popup/pedido deferidos)");
    });

    it("error-boundary.js (diagnóstico local) foi preservado", () => {
        const boundary = ler("error-boundary.js");
        assert.match(boundary, /videAuraErrosRecentes/);
        assert.match(boundary, /window\.VideAuraDiagnostics/);
    });
});
