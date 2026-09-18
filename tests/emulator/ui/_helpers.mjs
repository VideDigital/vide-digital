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
// UI-QG-PLAYWRIGHT-CONTEXT-RACE-DIAG-004 — uma sessão CDP de browser
// (Target domain) é compartilhada entre todas as pages do mesmo browser;
// evita abrir mais de uma por processo.
const browsersObservados = new WeakMap();

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

// Reduz o stack do Node a uma única linha útil: o primeiro frame de
// dentro de tests/emulator/ui que não seja este próprio helper — nunca
// serializa a função avaliada nem argumentos (podem conter dados
// sensíveis), só "quem chamou page.evaluate".
function capturarCallSite() {
    const stack = new Error().stack || "";
    const linhas = stack.split("\n").slice(1);
    const relevante = linhas.find((l) => l.includes("tests/emulator/ui") && !l.includes("_helpers.mjs"));
    return (relevante || linhas[2] || "").trim().slice(0, 300);
}

function safeUrl(page) {
    try { return page.url(); } catch (e) { return null; }
}

// Probe CDP read-only, direto num executionContextId específico — nunca
// passa por page.evaluate() (evitaria recursão e misturaria o sinal com
// o próprio mecanismo sob investigação). Expressão trivial, sem tocar
// DOM/estado/produto. Best-effort: qualquer falha vira { ok:false }, nunca
// lança.
async function executarProbeCdp(estado, contextId) {
    if (!estado.cdpInstance || contextId == null) {
        return { ok: false, contextId: contextId ?? null, motivo: "sem sessão CDP ou contextId desconhecido" };
    }
    try {
        const resultado = await estado.cdpInstance.send("Runtime.evaluate", {
            expression: "({href: location.href, readyState: document.readyState})",
            contextId,
            returnByValue: true,
            timeout: 2000
        });
        const ok = !resultado?.exceptionDetails;
        return {
            ok,
            contextId,
            valor: ok ? resultado?.result?.value : undefined,
            excecao: resultado?.exceptionDetails ? String(resultado.exceptionDetails.text || "erro") : undefined
        };
    } catch (err) {
        return { ok: false, contextId, erro: String(err?.message || err) };
    }
}

// Observabilidade best-effort do domínio Target (nível browser, não
// page) — checa a existência de browser.newBrowserCDPSession() antes de
// usar, nunca assume evento não confirmado pela própria API. Uma única
// sessão por browser (WeakMap), reaproveitada entre pages.
async function garantirObservabilidadeTarget(page, estado) {
    try {
        const browser = page.context().browser();
        if (!browser) {
            estado.targetDisponivel = false;
            estado.targetErro = "browser() indisponível (contexto persistente?)";
            return;
        }
        if (browsersObservados.has(browser)) {
            estado.targetDisponivel = true;
            estado.targetSessaoCompartilhada = true;
            return;
        }
        if (typeof browser.newBrowserCDPSession !== "function") {
            estado.targetDisponivel = false;
            estado.targetErro = "browser.newBrowserCDPSession indisponível nesta versão do Playwright";
            return;
        }
        const targetCdp = await browser.newBrowserCDPSession();
        browsersObservados.set(browser, targetCdp);
        estado.targetDisponivel = true;

        await targetCdp.send("Target.setDiscoverTargets", { discover: true }).catch((err) => {
            estado.targetErro = String(err?.message || err);
        });

        const emitirTarget = (evento, detalhe) => {
            registrarEvento(page, "cdp-target", evento, detalhe);
            console.log(`[VIDE-QG-CDP] Target.${evento} ${JSON.stringify(detalhe)}`);
        };
        targetCdp.on("Target.targetCreated", (p) => emitirTarget("targetCreated", {
            targetId: p?.targetInfo?.targetId, type: p?.targetInfo?.type, url: p?.targetInfo?.url, attached: p?.targetInfo?.attached
        }));
        targetCdp.on("Target.targetDestroyed", (p) => emitirTarget("targetDestroyed", { targetId: p?.targetId }));
        targetCdp.on("Target.targetInfoChanged", (p) => emitirTarget("targetInfoChanged", {
            targetId: p?.targetInfo?.targetId, type: p?.targetInfo?.type, url: p?.targetInfo?.url, attached: p?.targetInfo?.attached
        }));
        targetCdp.on("Target.attachedToTarget", (p) => emitirTarget("attachedToTarget", {
            targetId: p?.targetInfo?.targetId, sessionId: p?.sessionId, openerId: p?.targetInfo?.openerId
        }));
        targetCdp.on("Target.detachedFromTarget", (p) => emitirTarget("detachedFromTarget", { sessionId: p?.sessionId, targetId: p?.targetId }));
        // targetCrashed é um evento real do domínio Target, mas pode não
        // ser emitido por esta versão do Chromium — nunca falha o teste.
        targetCdp.on("Target.targetCrashed", (p) => emitirTarget("targetCrashed", { targetId: p?.targetId }));
    } catch (err) {
        estado.targetDisponivel = false;
        estado.targetErro = String(err?.message || err);
        registrarEvento(page, "cdp-target", "target.indisponivel", { erro: estado.targetErro });
    }
}

// Instala listeners Playwright + CDP + lifecycle de browser numa page.
// Idempotente por page (WeakMap) — chamar mais de uma vez na mesma page
// é seguro e não duplica listeners. Pensada pra ser chamada de dentro de
// loginReal(), antes do primeiro goto(), sem exigir mudança de
// assinatura em nenhum flow existente.
export async function garantirObservabilidadePagina(page) {
    if (paginasObservadas.has(page)) return paginasObservadas.get(page);

    const estado = {
        inicio: Date.now(), eventos: [], cdpDisponivel: false, cdpDominios: [], cdpErro: null,
        // UI-QG-PLAYWRIGHT-CONTEXT-RACE-DIAG-004 — estado de context-generation.
        cdpInstance: null,
        mainFrameId: null,
        contextGeneration: 0,
        currentDefaultContextId: null,
        currentDefaultContextGeneration: null,
        currentDefaultContextCreatedAt: null,
        destroyedContexts: [],
        lastMainFrameStoppedLoadingAt: null,
        evaluateSeq: 0,
        targetDisponivel: false,
        targetErro: null
    };
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
        estado.cdpInstance = cdp;

        await cdp.send("Page.enable").then(() => estado.cdpDominios.push("Page")).catch(() => {});
        await cdp.send("Runtime.enable").then(() => estado.cdpDominios.push("Runtime")).catch(() => {});
        // Semente inicial de mainFrameId — sem isso, o primeiro
        // Runtime.executionContextCreated (antes de qualquer
        // Page.frameNavigated observado) não teria como saber se é do
        // main frame.
        await cdp.send("Page.getFrameTree").then((tree) => {
            estado.mainFrameId = tree?.frameTree?.frame?.id || estado.mainFrameId;
        }).catch(() => {});

        cdp.on("Runtime.executionContextsCleared", () => {
            estado.contextGeneration += 1;
            estado.currentDefaultContextId = null;
            registrarEvento(page, "cdp", "Runtime.executionContextsCleared", { generation: estado.contextGeneration });
            console.log(`[VIDE-QG-CDP] Runtime.executionContextsCleared generation=${estado.contextGeneration}`);
        });
        cdp.on("Runtime.executionContextDestroyed", (params) => {
            const id = params?.executionContextId;
            estado.destroyedContexts.push({ id, generation: estado.contextGeneration, ts: Date.now() });
            if (estado.destroyedContexts.length > 50) estado.destroyedContexts.shift();
            if (estado.currentDefaultContextId === id) estado.currentDefaultContextId = null;
            registrarEvento(page, "cdp", "Runtime.executionContextDestroyed", { executionContextId: id, generation: estado.contextGeneration });
            console.log(`[VIDE-QG-CDP] Runtime.executionContextDestroyed id=${id} generation=${estado.contextGeneration}`);
        });
        cdp.on("Runtime.executionContextCreated", (params) => {
            const id = params?.context?.id;
            const isDefault = params?.context?.auxData?.isDefault === true;
            const frameId = params?.context?.auxData?.frameId;
            const isMainFrame = frameId != null && (estado.mainFrameId == null || frameId === estado.mainFrameId);
            registrarEvento(page, "cdp", "Runtime.executionContextCreated", {
                executionContextId: id, isDefault, frameId, generation: estado.contextGeneration
            });
            if (isDefault && isMainFrame) {
                estado.currentDefaultContextId = id;
                estado.currentDefaultContextGeneration = estado.contextGeneration;
                estado.currentDefaultContextCreatedAt = Date.now();
                console.log(`[VIDE-QG-CDP] Runtime.executionContextCreated DEFAULT id=${id} generation=${estado.contextGeneration}`);
            }
        });
        cdp.on("Page.frameNavigated", (params) => {
            const url = params?.frame?.url;
            const isMain = !params?.frame?.parentId;
            if (isMain) estado.mainFrameId = params?.frame?.id;
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
            if (params?.frameId && params.frameId === estado.mainFrameId) {
                estado.lastMainFrameStoppedLoadingAt = Date.now();
            }
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

        // Target domain — nível browser, paralelo/best-effort, nunca
        // bloqueia nem derruba a instrumentação de Page/Runtime acima.
        await garantirObservabilidadeTarget(page, estado);
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

    // UI-QG-PLAYWRIGHT-CONTEXT-RACE-DIAG-004 — wrapper diagnóstico de
    // page.evaluate(). Preserva args/retorno/exceção exatos, NUNCA faz
    // retry, NUNCA transforma falha em sucesso, NUNCA repete a operação
    // de produto (o post-probe roda via CDP direto, não via novo
    // page.evaluate()). Um FAIL entra e sai FAIL, bit-a-bit.
    const evaluateOriginal = page.evaluate.bind(page);
    page.evaluate = async function evaluateInstrumentado(...args) {
        const seq = ++estado.evaluateSeq;
        const inicioTs = Date.now();
        const generationInicio = estado.contextGeneration;
        const contextIdInicio = estado.currentDefaultContextId;
        const msDesdeFrameStoppedLoading = estado.lastMainFrameStoppedLoadingAt != null
            ? inicioTs - estado.lastMainFrameStoppedLoadingAt
            : null;
        const callSite = capturarCallSite();

        registrarEvento(page, "evaluate", "evaluate.start", {
            seq, generation: generationInicio, defaultContextId: contextIdInicio,
            msDesdeFrameStoppedLoading, url: safeUrl(page), callSite
        });
        console.log(`[VIDE-QG-NAV] evaluate.start seq=${seq} generation=${generationInicio} contextId=${contextIdInicio} msDesdeFrameStoppedLoading=${msDesdeFrameStoppedLoading}`);

        // Pre-probe: só dentro da janela de 3000ms após um
        // Page.frameStoppedLoading do main frame — read-only, expressão
        // trivial, roda direto via CDP no contextId atual, nunca via
        // page.evaluate() (evitaria recursão e misturaria o sinal).
        let preProbe = null;
        if (contextIdInicio != null && msDesdeFrameStoppedLoading != null
            && msDesdeFrameStoppedLoading >= 0 && msDesdeFrameStoppedLoading <= 3000) {
            preProbe = await executarProbeCdp(estado, contextIdInicio);
            registrarEvento(page, "evaluate", "evaluate.cdpPreProbe", { seq, ...preProbe });
            console.log(`[VIDE-QG-NAV] evaluate.cdpPreProbe seq=${seq} ok=${preProbe.ok} contextId=${preProbe.contextId}`);
        }

        try {
            const resultado = await evaluateOriginal(...args);
            registrarEvento(page, "evaluate", "evaluate.success", { seq });
            return resultado;
        } catch (error) {
            const erroTs = Date.now();
            const generationErro = estado.contextGeneration;
            const contextIdErro = estado.currentDefaultContextId;
            const mensagem = String(error?.message || error);
            const contextsClearedDuranteCall = generationErro !== generationInicio;
            const contextDestroyedDuranteCall = estado.destroyedContexts.some((d) => d.ts >= inicioTs && d.ts <= erroTs);

            // Post-probe: só quando o próprio erro é o sinal-alvo — nunca
            // repete a chamada de produto original, só cross-checa via
            // CDP se o contexto default ATUAL (pós-falha) responde.
            let postProbe = null;
            if (/Execution context was destroyed/i.test(mensagem)) {
                postProbe = await executarProbeCdp(estado, estado.currentDefaultContextId);
            }

            registrarEvento(page, "evaluate", "evaluate.error", {
                seq, mensagem,
                generationInicio, generationErro,
                defaultContextIdInicio: contextIdInicio, defaultContextIdErro: contextIdErro,
                contextsClearedDuranteCall, contextDestroyedDuranteCall,
                msDesdeFrameStoppedLoading,
                preProbe, postProbe
            });
            console.log(`[VIDE-QG-NAV] evaluate.error seq=${seq} mensagem=${JSON.stringify(mensagem)} generationInicio=${generationInicio} generationErro=${generationErro} contextIdInicio=${contextIdInicio} contextIdErro=${contextIdErro} contextsClearedDuranteCall=${contextsClearedDuranteCall} contextDestroyedDuranteCall=${contextDestroyedDuranteCall} preProbe=${JSON.stringify(preProbe)} postProbe=${JSON.stringify(postProbe)}`);

            // Repropaga o MESMO erro, sem alterar — o teste precisa
            // continuar FAIL exatamente como falharia sem instrumentação.
            throw error;
        }
    };

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
