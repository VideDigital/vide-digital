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
