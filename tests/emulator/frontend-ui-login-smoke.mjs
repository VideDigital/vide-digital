// Smoke de UI com LOGIN REAL (Playwright + Firebase Auth Emulator) — ao
// contrário dos outros smokes deste projeto (frontend-emulator-smoke.mjs
// só usa o SDK, sem navegador; validações de layout anteriores injetavam
// dado sintético no DOM sem autenticar), este entra pela tela de login de
// verdade, autentica contra o Auth Emulator com uma conta seedada
// (scripts/seed-emulator.mjs) e navega pelas views principais do
// dashboard, checando ausência de erros de JS (não relacionados a rede) em
// cada uma. Roda por cima do mesmo `firebase emulators:exec` usado pelos
// outros testes de emulador — precisa do Chromium pré-instalado do
// ambiente (ver PLAYWRIGHT_BROWSERS_PATH) e de um servidor HTTP estático
// local servindo o repositório (localhost é exigido por
// firebase-init.js#shouldUseVideEmulators).
//
// Nota honesta (22/07/2026): escrito e com sintaxe/lógica verificadas, mas
// NÃO validado ponta a ponta na sessão que o criou — o sandbox de
// desenvolvimento usado forçava todo tráfego HTTP por um proxy corporativo
// que rejeitava tanto o CDN do Firebase (gstatic.com) quanto, mesmo com
// `proxy.bypass` configurado, o próprio servidor HTTP local (localhost e
// 127.0.0.1 continuavam sendo roteados pro proxy como requisição HTTP
// simples, que o relay recusa por só aceitar CONNECT). Isso é uma
// particularidade DESSE sandbox, não um bug do app — em CI ou máquina de
// desenvolvimento sem esse proxy interceptando localhost, o teste deve
// rodar normalmente. Se for reativar isso, comece confirmando que
// `curl http://localhost:8935` funciona no ambiente ANTES de depurar o
// Playwright.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

// Playwright não é devDependency deste projeto (evita inflar node_modules
// só por causa de testes manuais) — o ambiente de desenvolvimento usado
// nesta base já traz um Chromium + Playwright globais pré-instalados (ver
// PLAYWRIGHT_BROWSERS_PATH). Em outro ambiente, rode
// `pnpm add -D playwright` e troque este import por "playwright" puro.
const PLAYWRIGHT_MODULE_PATH = process.env.VIDE_PLAYWRIGHT_MODULE || "/opt/node22/lib/node_modules/playwright/index.js";
const pkg = (await import(PLAYWRIGHT_MODULE_PATH)).default;
const { chromium } = pkg;
const HTTP_PORT = 8935;
const BASE_URL = `http://localhost:${HTTP_PORT}`;

function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function iniciarHttpServer() {
    const proc = spawn("python3", ["-m", "http.server", String(HTTP_PORT)], {
        cwd: process.cwd(),
        stdio: "ignore"
    });
    await esperar(800);
    return proc;
}

async function main() {
    const httpProc = await iniciarHttpServer();
    // dashboard.html/login.html importam o SDK do Firebase direto de um CDN
    // (gstatic.com) — em ambientes que forçam todo HTTPS por um proxy
    // corporativo (ex.: HTTPS_PROXY), o Chromium recém-lançado do Playwright
    // não herda isso sozinho; sem repassar o proxy explicitamente, o CDN
    // fica inalcançável (ERR_TUNNEL_CONNECTION_FAILED) e o login trava.
    const launchOptions = { executablePath: process.env.VIDE_CHROMIUM_PATH || "/opt/pw-browsers/chromium" };
    if (process.env.HTTPS_PROXY || process.env.https_proxy) {
        // bypass p/ localhost: sem isso, o tráfego pro próprio Emulator/HTTP
        // server local também tentaria passar pelo proxy corporativo.
        launchOptions.proxy = {
            server: process.env.HTTPS_PROXY || process.env.https_proxy,
            bypass: "<-loopback>;localhost;127.0.0.1;::1"
        };
    }
    const browser = await chromium.launch(launchOptions);
    const errosPorView = {};
    try {
        const page = await browser.newPage();
        const erros = [];
        page.on("pageerror", e => erros.push(String(e)));
        page.on("console", msg => {
            if (msg.type() === "error") erros.push(msg.text());
        });

        // ?useEmulator=true persiste em localStorage (ver firebase-init.js) —
        // sem essa query string na PRIMEIRA navegação, o app se conecta ao
        // Firebase de produção mesmo rodando em localhost.
        await page.goto(`${BASE_URL}/login.html?useEmulator=true`, { waitUntil: "load", timeout: 30000 });
        await page.fill("#login-email", "owner.pro@local.test");
        await page.fill("#login-senha", "Local123!pro");
        await page.click("#btn-submit-login");

        try {
            await page.waitForURL(/dashboard\.html/, { timeout: 20000 });
        } catch (waitError) {
            const urlAtual = page.url();
            const feedback = await page.evaluate(() => document.body.innerText.slice(0, 2000));
            console.error("[debug] URL ao falhar:", urlAtual);
            console.error("[debug] erros de console capturados até aqui:", JSON.stringify(erros.slice(0, 10)));
            console.error("[debug] texto visível na página:", feedback.slice(0, 500));
            throw waitError;
        }
        await page.waitForLoadState("networkidle");
        await esperar(1500);

        const relevantes = e => !/net::ERR|Failed to load resource|permission-denied|auth\//i.test(e);
        errosPorView["login+dashboard inicial"] = erros.filter(relevantes).slice();

        const views = [
            ["view-crm360", "crm360Controller?.loadLista"],
            ["view-atendimento", "atendimentoController?.load"],
            ["view-base-conhecimento", "baseConhecimentoController?.load"],
            ["view-pedidos", null],
            ["view-leads", null]
        ];

        for (const [viewId, _label] of views) {
            erros.length = 0;
            await page.evaluate(id => {
                if (typeof window.ativarAba === "function") window.ativarAba(id);
            }, viewId);
            await esperar(1200);
            const visivel = await page.evaluate(id => {
                const el = document.getElementById(id);
                return !!el && el.classList.contains("active");
            }, viewId);
            errosPorView[viewId] = { visivel, erros: erros.filter(relevantes).slice() };
        }

        // Checklist de onboarding: só validar que a função roda sem
        // lançar (o conteúdo real depende do estado seedado da conta).
        erros.length = 0;
        await page.evaluate(async () => {
            if (typeof window.renderizarPrimeirosPassos === "function") {
                await window.renderizarPrimeirosPassos();
            }
        });
        await esperar(500);
        errosPorView["primeirosPassos"] = erros.filter(relevantes).slice();

        await page.close();
    } finally {
        await browser.close();
        httpProc.kill();
    }

    console.log(JSON.stringify(errosPorView, null, 2));

    const login = errosPorView["login+dashboard inicial"];
    assert.equal(login.length, 0, `Erros de JS após login: ${JSON.stringify(login)}`);

    for (const [viewId] of [["view-crm360"], ["view-atendimento"], ["view-base-conhecimento"], ["view-pedidos"], ["view-leads"]]) {
        const resultado = errosPorView[viewId];
        assert.ok(resultado.visivel, `View ${viewId} não ficou visível após ativarAba`);
        assert.equal(resultado.erros.length, 0, `Erros de JS em ${viewId}: ${JSON.stringify(resultado.erros)}`);
    }

    assert.equal(errosPorView["primeirosPassos"].length, 0, `Erros em renderizarPrimeirosPassos: ${JSON.stringify(errosPorView["primeirosPassos"])}`);

    console.log("UI smoke com login real: OK — login, 5 views principais e onboarding sem erros de JS.");
}

await main();
process.exit(0);
