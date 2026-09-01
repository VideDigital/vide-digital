// Helpers compartilhados pelos smokes de UI com login real (Playwright +
// Firebase Auth/Firestore Emulator). Escrito pra ser portátil: sem
// caminho absoluto, sem depender de Python, sem depender de Playwright
// instalado globalmente — `playwright` é devDependency real deste
// projeto (ver package.json) e o servidor estático é Node puro.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon"
};

// Sobe um servidor estático mínimo servindo a raiz do repositório, numa
// porta livre escolhida pelo SO (listen(0)) — nunca colide com outro
// processo, funciona igual em Windows/Linux/CI. localhost é exigido por
// firebase-init.js#shouldUseVideEmulators (só conecta ao Emulator se o
// hostname for localhost/127.0.0.1/::1).
export function startStaticServer(rootDir = REPO_ROOT) {
    return new Promise((resolve, reject) => {
        const server = createServer(async (req, res) => {
            try {
                const url = new URL(req.url, "http://localhost");
                let filePath = decodeURIComponent(url.pathname);
                if (filePath === "/") filePath = "/index.html";
                const abs = path.join(rootDir, filePath);
                // nunca servir arquivo fora da raiz do repo (path traversal)
                if (!abs.startsWith(rootDir)) {
                    res.writeHead(403);
                    res.end("Forbidden");
                    return;
                }
                const ext = path.extname(abs);
                const data = await readFile(abs);
                res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
                res.end(data);
            } catch (error) {
                res.writeHead(404);
                res.end("Not found");
            }
        });
        server.on("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const { port } = server.address();
            resolve({
                server,
                port,
                baseUrl: `http://localhost:${port}`,
                close: () => new Promise(r => server.close(r))
            });
        });
    });
}

// Playwright resolve o Chromium via a variável de ambiente padrão
// PLAYWRIGHT_BROWSERS_PATH (ou o cache default de `npx playwright
// install`) — nenhum caminho fica hardcoded aqui.
export async function launchBrowser() {
    return chromium.launch();
}

const DIAG_DIR = path.join(REPO_ROOT, "test-results", "ui-diagnostics");

// Em qualquer falha de fluxo, grava screenshot + HTML + console + URL
// atual + trace (se ativo) num diretório previsível — nunca deixa a falha
// sem contexto pra depurar depois.
export async function captureDiagnostics(page, label, erros = []) {
    await mkdir(DIAG_DIR, { recursive: true });
    const slug = label.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
    const base = path.join(DIAG_DIR, `${slug}-${Date.now()}`);
    const info = {
        label,
        url: page.url(),
        erros,
        capturadoEm: new Date().toISOString()
    };
    try {
        await page.screenshot({ path: `${base}.png`, fullPage: true });
    } catch (e) { info.screenshotErro = String(e.message || e); }
    try {
        const html = await page.content();
        await writeFile(`${base}.html`, html, "utf8");
    } catch (e) { info.htmlErro = String(e.message || e); }
    try {
        const textoVisivel = await page.evaluate(() => document.body.innerText.slice(0, 3000));
        info.textoVisivel = textoVisivel;
    } catch (e) { info.textoVisivelErro = String(e.message || e); }
    await writeFile(`${base}.json`, JSON.stringify(info, null, 2), "utf8");
    console.error(`[diagnóstico] ${label}: ${base}.{png,html,json}`);
    // Também imprime no stdout do job (não só no artefato) — investigação
    // de CI às vezes só tem acesso aos logs do job, sem baixar artefatos.
    console.error(`[diagnóstico-json] ${JSON.stringify(info)}`);
    return base;
}

// Erros de rede pro CDN do Firebase (gstatic.com) são uma condição
// EXTERNA documentada (não um bug do app): alguns ambientes de CI/dev
// bloqueiam ou não alcançam esse host por política de rede. Fora isso,
// nenhum erro de console é filtrado por padrão — cada fluxo decide
// explicitamente o que esperar, em vez de esconder erro real de JS.
export function ehErroDeRedeExterno(mensagem) {
    return /net::ERR_|Failed to load resource.*gstatic\.com|Failed to load resource.*googleapis\.com/i.test(mensagem);
}

export function coletarErrosConsole(page) {
    const erros = [];
    page.on("pageerror", e => erros.push(String(e)));
    page.on("console", msg => {
        if (msg.type() === "error") erros.push(msg.text());
    });
    return erros;
}

// Login real: espera por seletor, preenche, clica, espera por URL E por
// um elemento que só existe depois do dashboard carregar de fato — nunca
// usa waitForTimeout como mecanismo principal de espera.
export async function loginReal(page, baseUrl, { email, senha }) {
    await page.goto(`${baseUrl}/login.html?useEmulator=true`, { waitUntil: "load", timeout: 30000 });
    await page.waitForSelector("#login-email", { state: "visible", timeout: 15000 });
    await page.fill("#login-email", email);
    await page.fill("#login-senha", senha);
    await page.click("#btn-submit-login");
    await page.waitForURL(/dashboard\.html/, { timeout: 20000 });
    // Confirma que a sessão realmente carregou algo do tenant, não só que
    // a URL mudou (a URL pode mudar antes do JS terminar de montar o
    // dashboard).
    await page.waitForSelector("#view-dashboard, #kpi-produtos-valor, .aura-hub-card", { state: "attached", timeout: 20000 });
    // VideHubContext.initialize() é assíncrono (chamado dentro do callback
    // de onAuthStateChanged) e termina DEPOIS do DOM do dashboard existir.
    // Chamar ativarAba() antes disso faz até quem tem acesso de verdade
    // cair no bloqueio de "carregando permissões" — ativarAba() retorna
    // false SILENCIOSAMENTE (só um toast, nunca console.error), a section
    // nunca ganha .active, e tudo dentro dela fica preso em display:none
    // pelo resto do teste (visto pela primeira vez em profiles.smoke.mjs;
    // centralizado aqui porque todo outro teste que chama ativarAba() logo
    // após loginReal() tem a mesma corrida).
    await page.waitForFunction(
        () => typeof window.__videHubContextInitialized === "function" && window.__videHubContextInitialized(),
        { timeout: 15000 }
    );
}

export const VIEWPORTS = Object.freeze({
    "desktop-1440": { width: 1440, height: 900 },
    "notebook-1366": { width: 1366, height: 768 },
    "tablet-768": { width: 768, height: 1024 },
    "celular-390": { width: 390, height: 844 },
    "celular-360": { width: 360, height: 640 }
});

// ===== Telemetria de diagnóstico (RELEASE-GATE-OBSERVABILITY-IMPLEMENTATION) =====
// Estritamente read-only: nunca aguarda nada (nenhum await além do já
// exigido pela própria Playwright API pra registrar um listener),
// nunca decide se um teste passa ou falha, nunca substitui/enfraquece
// nenhuma asserção existente — só observa e imprime, pra investigar as
// duas intermitências documentadas no release gate do GitHub Pages
// (studio-codigo-iframe-sandbox.flow.mjs:153 "Execution context was
// destroyed" e loja-chat-publico.flow.mjs "FIRESTORE INTERNAL ASSERTION
// FAILED"). Usado só pelos dois testes sob investigação.

// Cria uma função de log com timestamp relativo (ms desde a criação) e
// prefixo — só console.log, nunca bloqueia nem espera nada.
export function criarTelemetria(prefixo) {
    const inicio = Date.now();
    return function logTelemetria(marco, extra = {}) {
        const detalhe = Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : "";
        console.log(`[TELEMETRIA:${prefixo}] ${marco} t=${Date.now() - inicio}ms${detalhe}`);
    };
}

// Anexa listeners passivos de ciclo de vida numa page (e, opcionalmente,
// no browser inteiro) — cada listener só imprime quando o evento
// realmente dispara, nunca aguarda nada e nunca aciona nenhuma ação no
// teste. Retorna contadores simples pra telemetria agregada (ex.: contar
// pageerror por iteração da matriz), sem duplicar a lista de erros que
// coletarErrosConsole() já mantém pras asserções existentes.
export function instrumentarCicloDeVida(page, logTelemetria, { browser = null } = {}) {
    const contadores = { pageerror: 0, crash: 0, close: 0 };
    page.on("framenavigated", (frame) => {
        logTelemetria(frame === page.mainFrame() ? "EVENTO_FRAMENAVIGATED_MAINFRAME" : "EVENTO_FRAMENAVIGATED_SUBFRAME", { novaUrl: frame.url() });
    });
    page.on("domcontentloaded", () => logTelemetria("EVENTO_DOMCONTENTLOADED", { url: page.url() }));
    page.on("load", () => logTelemetria("EVENTO_LOAD", { url: page.url() }));
    page.on("close", () => {
        contadores.close += 1;
        logTelemetria("EVENTO_PAGE_CLOSE");
    });
    page.on("crash", () => {
        contadores.crash += 1;
        logTelemetria("EVENTO_PAGE_CRASH");
    });
    page.on("pageerror", (erro) => {
        contadores.pageerror += 1;
        logTelemetria("EVENTO_PAGEERROR", { erro: String(erro) });
    });
    if (browser) {
        browser.on("disconnected", () => logTelemetria("EVENTO_BROWSER_DISCONNECTED"));
    }
    return contadores;
}

// Registra um identificador aleatório de lifecycle em TODO documento novo
// criado nesta page — dispara automaticamente na carga inicial E em
// qualquer navegação/reload subsequente, mesmo pra mesma URL, porque
// addInitScript roda de novo a cada documento novo. Um token novo a cada
// disparo prova, de forma passiva (só via console.log, sem nenhum
// evaluate() adicional no caminho crítico do teste), se um documento novo
// substituiu o anterior — mesmo quando a URL não muda.
export async function instrumentarLifecycleDocumento(page) {
    await page.addInitScript(() => {
        const token = `doc_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        console.log(`[TELEMETRIA:doc-lifecycle] EVENTO_NOVO_DOCUMENT token=${token} url=${location.href}`);
    });
}
