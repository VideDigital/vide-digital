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

// OBSERVABILIDADE DE LIFECYCLE/NAVEGAÇÃO — UI-QG-EXECUTION-CONTEXT-
// OBSERVABILITY-003. Só diagnóstico: nunca altera location, DOM
// funcional, Auth, Storage ou Firebase, nunca faz retry/timeout maior/
// espera artificial. Objetivo único é responder, com evidência de baixo
// nível, se uma falha "Execution context was destroyed" foi acompanhada
// de navegação/reload/detach/crash observável — ou não.
const MAX_EVENTOS_OBSERVADOS = 400;
const paginasObservadas = new WeakMap();

function registrarEvento(page, origem, evento, detalhe = {}) {
    const estado = paginasObservadas.get(page);
    if (!estado) return null;
    const linha = {
        ts: new Date().toISOString(),
        elapsedMs: Date.now() - estado.inicio,
        origem,
        evento,
        ...detalhe
    };
    estado.eventos.push(linha);
    if (estado.eventos.length > MAX_EVENTOS_OBSERVADOS) estado.eventos.shift();
    return linha;
}

// Instala listeners Playwright + CDP + lifecycle de browser numa page.
// Idempotente por page (WeakMap) — chamar mais de uma vez na mesma page
// é seguro e não duplica listeners. Pensada pra ser chamada de dentro de
// loginReal(), antes do primeiro goto(), sem exigir mudança de
// assinatura em nenhum flow existente.
export async function garantirObservabilidadePagina(page) {
    if (paginasObservadas.has(page)) return paginasObservadas.get(page);

    const estado = { inicio: Date.now(), eventos: [], cdpDisponivel: false, cdpDominios: [], cdpErro: null };
    paginasObservadas.set(page, estado);

    page.on("framenavigated", frame => {
        const isMain = frame === page.mainFrame();
        registrarEvento(page, "playwright", "framenavigated", { isMainFrame: isMain, url: frame.url() });
        if (isMain) console.log(`[VIDE-QG-NAV] framenavigated main-frame url=${frame.url()}`);
    });
    page.on("frameattached", frame => {
        registrarEvento(page, "playwright", "frameattached", { isMainFrame: frame === page.mainFrame(), url: frame.url() });
    });
    page.on("framedetached", frame => {
        const isMain = frame === page.mainFrame();
        registrarEvento(page, "playwright", "framedetached", { isMainFrame: isMain, url: frame.url() });
        if (isMain) console.log("[VIDE-QG-NAV] framedetached main-frame");
    });
    page.on("load", () => registrarEvento(page, "playwright", "load", { url: page.url() }));
    page.on("domcontentloaded", () => registrarEvento(page, "playwright", "domcontentloaded", { url: page.url() }));
    page.on("crash", () => {
        registrarEvento(page, "playwright", "crash", {});
        console.log("[VIDE-QG-NAV] crash");
    });
    page.on("close", () => registrarEvento(page, "playwright", "close", {}));
    page.on("request", req => {
        if (!req.isNavigationRequest()) return;
        const linha = registrarEvento(page, "playwright", "request.navigation", {
            url: req.url(),
            method: req.method(),
            frame: req.frame() === page.mainFrame() ? "main" : "sub"
        });
        console.log(`[VIDE-QG-NAV] navigation request url=${req.url()} method=${req.method()} frame=${linha?.frame}`);
    });
    page.on("requestfailed", req => {
        if (!req.isNavigationRequest()) return;
        registrarEvento(page, "playwright", "requestfailed.navigation", { url: req.url(), erro: req.failure()?.errorText });
    });

    // CDP — best-effort. Se um domínio/evento não existir nesta versão do
    // Chromium do projeto, ignora e segue: instrumentação nunca pode
    // derrubar ou alterar o resultado do teste.
    try {
        const cdp = await page.context().newCDPSession(page);
        estado.cdpDisponivel = true;

        await cdp.send("Page.enable").then(() => estado.cdpDominios.push("Page")).catch(() => {});
        await cdp.send("Runtime.enable").then(() => estado.cdpDominios.push("Runtime")).catch(() => {});

        cdp.on("Runtime.executionContextsCleared", () => {
            registrarEvento(page, "cdp", "Runtime.executionContextsCleared", {});
            console.log("[VIDE-QG-CDP] Runtime.executionContextsCleared");
        });
        cdp.on("Runtime.executionContextDestroyed", (params) => {
            registrarEvento(page, "cdp", "Runtime.executionContextDestroyed", { executionContextId: params?.executionContextId });
            console.log(`[VIDE-QG-CDP] Runtime.executionContextDestroyed id=${params?.executionContextId}`);
        });
        cdp.on("Runtime.executionContextCreated", (params) => {
            registrarEvento(page, "cdp", "Runtime.executionContextCreated", {
                executionContextId: params?.context?.id,
                isDefault: params?.context?.auxData?.isDefault,
                frameId: params?.context?.auxData?.frameId
            });
        });
        cdp.on("Page.frameNavigated", (params) => {
            const url = params?.frame?.url;
            const isMain = !params?.frame?.parentId;
            registrarEvento(page, "cdp", "Page.frameNavigated", { isMainFrame: isMain, url, frameId: params?.frame?.id });
            if (isMain) console.log(`[VIDE-QG-CDP] Page.frameNavigated main-frame url=${url}`);
        });
        cdp.on("Page.frameDetached", (params) => {
            registrarEvento(page, "cdp", "Page.frameDetached", { frameId: params?.frameId, reason: params?.reason });
            console.log(`[VIDE-QG-CDP] Page.frameDetached frameId=${params?.frameId} reason=${params?.reason}`);
        });
        cdp.on("Page.frameStartedLoading", (params) => {
            registrarEvento(page, "cdp", "Page.frameStartedLoading", { frameId: params?.frameId });
        });
        cdp.on("Page.frameStoppedLoading", (params) => {
            registrarEvento(page, "cdp", "Page.frameStoppedLoading", { frameId: params?.frameId });
        });
        cdp.on("Page.lifecycleEvent", (params) => {
            registrarEvento(page, "cdp", "Page.lifecycleEvent", { name: params?.name, frameId: params?.frameId });
        });

        // Inspector.targetCrashed exige o domínio Inspector, que pode não
        // existir/ser permitido nesta versão — nunca falha o teste por
        // isso, só registra a indisponibilidade.
        await cdp.send("Inspector.enable").then(() => {
            estado.cdpDominios.push("Inspector");
            cdp.on("Inspector.targetCrashed", () => {
                registrarEvento(page, "cdp", "Inspector.targetCrashed", {});
                console.log("[VIDE-QG-CDP] Inspector.targetCrashed");
            });
        }).catch((err) => {
            registrarEvento(page, "cdp", "Inspector.enable.indisponivel", { erro: String(err?.message || err) });
        });
    } catch (err) {
        estado.cdpDisponivel = false;
        estado.cdpErro = String(err?.message || err);
        registrarEvento(page, "cdp", "cdp.indisponivel", { erro: estado.cdpErro });
    }

    // Lifecycle do lado do browser, instalado ANTES de qualquer
    // navegação real (addInitScript reexecuta em todo documento/reload).
    // Só observa e envia console.log com prefixo reservado — nunca
    // previne default nem altera propagação, nunca toca em
    // location/DOM/Auth/Storage/Firebase, nunca registra token/senha/
    // cookie/dado sensível.
    await page.addInitScript(() => {
        const emitir = (evento, detalhe) => {
            try {
                console.log("[VIDE-QG-LIFECYCLE]" + JSON.stringify({
                    evento,
                    href: location.href,
                    visibilityState: document.visibilityState,
                    timeOrigin: performance.timeOrigin,
                    ...detalhe
                }));
            } catch (e) { /* nunca deixa o log quebrar o fluxo real */ }
        };
        ["pageshow", "pagehide", "beforeunload", "visibilitychange", "unload"].forEach((nome) => {
            window.addEventListener(nome, (ev) => {
                emitir(nome, { persisted: ev && typeof ev.persisted === "boolean" ? ev.persisted : undefined });
            }, { capture: true });
        });
    });
    page.on("console", msg => {
        const texto = msg.text();
        if (!texto.startsWith("[VIDE-QG-LIFECYCLE]")) return;
        try {
            const payload = JSON.parse(texto.slice("[VIDE-QG-LIFECYCLE]".length));
            registrarEvento(page, "lifecycle", payload.evento, payload);
            if (payload.evento === "beforeunload" || payload.evento === "pagehide") {
                console.log(`[VIDE-QG-NAV] lifecycle ${payload.evento} href=${payload.href}`);
            }
        } catch (e) { /* payload malformado nunca derruba o teste */ }
    });

    return estado;
}

// Últimos N eventos observados de uma page (mais recentes por último).
// Usado por captureDiagnostics() — nunca lança se a page não tiver sido
// instrumentada (retorna array vazio).
export function eventosObservados(page, limite = 150) {
    const estado = paginasObservadas.get(page);
    if (!estado) return [];
    return estado.eventos.slice(-limite);
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
        capturadoEm: new Date().toISOString(),
        // UI-QG-EXECUTION-CONTEXT-OBSERVABILITY-003 — evidência de baixo
        // nível já coletada por garantirObservabilidadePagina(), só
        // leitura, nunca altera o resultado da falha original.
        eventosRecentes: eventosObservados(page, 150),
        paginaFechada: page.isClosed()
    };
    try {
        info.framesFilhos = page.frames().filter(f => f !== page.mainFrame()).map(f => f.url());
    } catch (e) { info.framesErro = String(e.message || e); }
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
    // Read-only, best-effort: se um NOVO execution context já existe
    // depois da falha original, isso não prova que a falha não ocorreu —
    // só ajuda a distinguir "contexto novo já de pé" de "página
    // realmente travada". Falha aqui nunca mascara nem substitui a
    // falha original (erros[]/textoVisivelErro acima continuam intactos).
    try {
        info.estadoPosFalha = await page.evaluate(() => {
            let videHubContextSnapshot = null;
            try {
                const snap = window.VideHubContext?.getSnapshot?.();
                if (snap) {
                    videHubContextSnapshot = {
                        initialized: snap.initialized,
                        active: snap.active,
                        status: snap.status,
                        userType: snap.userType,
                        isOwner: snap.isOwner,
                        isEmployee: snap.isEmployee,
                        isAdmin: snap.isAdmin,
                        isMasterMode: snap.isMasterMode
                    };
                }
            } catch (e) { /* leitura opcional */ }
            let navegacaoResumo = null;
            try {
                navegacaoResumo = performance.getEntriesByType("navigation").map(n => ({
                    type: n.type,
                    startTime: n.startTime,
                    duration: n.duration
                }));
            } catch (e) { /* opcional */ }
            return {
                href: location.href,
                readyState: document.readyState,
                visibilityState: document.visibilityState,
                videHubContextInicializado: typeof window.__videHubContextInitialized === "function"
                    ? window.__videHubContextInitialized()
                    : null,
                videHubContextSnapshot,
                navegacaoResumo
            };
        });
    } catch (e) {
        info.estadoPosFalhaErro = String(e.message || e);
    }
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
    // UI-QG-EXECUTION-CONTEXT-OBSERVABILITY-003: instala a observabilidade
    // ANTES do primeiro goto(), pra nunca perder o framenavigated inicial.
    // Idempotente — chamadas futuras (fora daqui) na mesma page são no-op.
    await garantirObservabilidadePagina(page);
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
