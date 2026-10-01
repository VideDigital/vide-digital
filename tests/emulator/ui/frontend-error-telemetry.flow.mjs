// VIDE-HUB-FRONTEND-ERROR-TELEMETRY-071 — reporter central no navegador real.
//
// Abre a loja pública (Emulator Suite) e intercepta a chamada à callable
// reportFrontendError para inspecionar o payload que realmente sai do
// navegador. Cobre:
// - captura global real (window error e unhandledrejection), envio único,
//   dedupe, erro esperado ignorado, offline, instalação idempotente e
//   payload só com a allowlist, sanitizado (query/hash, e-mail, token);
// - FE-OBS-002: vitrine com dado malformado (layoutLojaPublica com item
//   nulo → TypeError inesperado) não fica em esqueleto infinito: mostra o
//   estado de erro e reporta store-load, sem conteúdo da loja.
import assert from "node:assert/strict";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { captureDiagnostics, launchBrowser, startStaticServer } from "./_helpers.mjs";

const PROJECT_ID = "demo-vide-hub";
const STORE_SLUG = "loja-pro-local";
const SLUG_MALFORMADO = "loja-telemetria-qa";
const NOME_LOJA_SENTINELA = "LOJA_SECRETA_QA";
const CAMPOS_PERMITIDOS = ["category", "code", "column", "line", "message", "name", "release", "route", "source", "stack", "type"];

function adminDb() {
    if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
    return getFirestore();
}

async function interceptarTelemetria(page) {
    const enviados = [];
    await page.route("**/reportFrontendError", async (route) => {
        const cabecalhos = {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "*",
            "access-control-allow-methods": "POST, OPTIONS"
        };
        if (route.request().method() === "OPTIONS") {
            await route.fulfill({ status: 204, headers: cabecalhos });
            return;
        }
        enviados.push(JSON.parse(route.request().postData() || "{}").data);
        await route.fulfill({ status: 200, contentType: "application/json", headers: cabecalhos, body: JSON.stringify({ result: { ok: true } }) });
    });
    return enviados;
}

async function aguardarQuantidade(enviados, esperado, rotulo) {
    const limite = Date.now() + 10000;
    while (Date.now() < limite && enviados.length < esperado) {
        await new Promise((r) => setTimeout(r, 100));
    }
    assert.equal(enviados.length, esperado, rotulo);
}

async function semNovosEnvios(enviados, esperado, rotulo) {
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(enviados.length, esperado, rotulo);
}

function assertPayloadSeguro(payload) {
    assert.deepEqual(Object.keys(payload).sort(), CAMPOS_PERMITIDOS);
    assert.ok(Object.values(payload).every((v) => v === null || ["string", "number"].includes(typeof v)), "nenhum objeto no payload");
    const texto = JSON.stringify(payload);
    for (const proibido of ["?loja=", "useEmulator", "qa-email@example.test", "QA_TOKEN_SECRETO", NOME_LOJA_SENTINELA]) {
        assert.ok(!texto.includes(proibido), `payload vazou ${proibido}`);
    }
}

async function main() {
    const { baseUrl, close } = await startStaticServer();
    const browser = await launchBrowser();
    const db = adminDb();
    let page = null;
    try {
        // ---------- Captura global ----------
        const contexto = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        page = await contexto.newPage();
        const enviados = await interceptarTelemetria(page);
        await page.goto(`${baseUrl}/loja.html?loja=${STORE_SLUG}&useEmulator=true`, { waitUntil: "load" });
        await page.waitForFunction(() => window.__videFrontendTelemetry?.installed === true, null, { timeout: 20000 });
        await page.waitForFunction(() => document.querySelectorAll("#vitrine-container .animate-pulse").length === 0, null, { timeout: 20000 });
        await semNovosEnvios(enviados, 0, "loja saudável não gera telemetria");

        await page.evaluate(() => {
            setTimeout(() => { throw new Error("QA global para qa-email@example.test em https://x.test/a?token=QA_TOKEN_SECRETO#frag"); }, 0);
        });
        await aguardarQuantidade(enviados, 1, "erro global gera exatamente um envio");
        assert.equal(enviados[0].type, "error");
        assert.equal(enviados[0].category, "global");
        assert.match(enviados[0].message, /\[EMAIL\]/);
        assert.match(enviados[0].route, /\/loja\.html$/);
        assertPayloadSeguro(enviados[0]);

        await page.evaluate(() => {
            setTimeout(() => { throw new Error("QA global para qa-email@example.test em https://x.test/a?token=QA_TOKEN_SECRETO#frag"); }, 0);
        });
        await semNovosEnvios(enviados, 1, "mesmo erro dentro do cooldown é suprimido");

        await page.evaluate(() => { Promise.reject(new Error("QA rejeição não tratada")); });
        await aguardarQuantidade(enviados, 2, "unhandledrejection gera um envio");
        assert.equal(enviados[1].type, "unhandledrejection");
        assertPayloadSeguro(enviados[1]);

        await page.evaluate(() => { Promise.reject(Object.assign(new Error("esperado"), { code: "permission-denied" })); });
        await page.evaluate(() => { Promise.reject(Object.assign(new Error("rede"), { code: "unavailable" })); });
        await semNovosEnvios(enviados, 2, "erros esperados não são telemetrados");

        await page.evaluate(() => import("./frontend-error-telemetry.js").then((m) => m.installFrontendErrorTelemetry()));
        await page.evaluate(() => { Promise.reject(new Error("QA depois da reinstalação")); });
        await aguardarQuantidade(enviados, 3, "reinstalar não duplica listeners");
        await semNovosEnvios(enviados, 3, "um único envio por erro após reinstalação");

        await contexto.setOffline(true);
        await page.evaluate(() => { Promise.reject(new Error("QA offline")); });
        await semNovosEnvios(enviados, 3, "offline não envia");
        await contexto.setOffline(false);
        await contexto.close();

        // ---------- FE-OBS-002: falha inesperada na carga da vitrine ----------
        await db.collection("vitrines_publicas").doc(SLUG_MALFORMADO).set({
            nomeLoja: NOME_LOJA_SENTINELA,
            emailDono: "qa-email@example.test",
            layoutLojaPublica: [null]
        });
        const contexto2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        page = await contexto2.newPage();
        const enviados2 = await interceptarTelemetria(page);
        await page.goto(`${baseUrl}/loja.html?loja=${SLUG_MALFORMADO}&useEmulator=true`, { waitUntil: "load" });
        await page.waitForSelector('#vitrine-container [data-vitrine-estado="erro"]', { state: "visible", timeout: 20000 });
        const esqueletos = await page.locator("#vitrine-container .animate-pulse").count();
        assert.equal(esqueletos, 0, "esqueleto infinito substituído pelo estado de erro");
        assert.match(await page.locator('#vitrine-container [data-vitrine-estado="erro"]').innerText(), /Não foi possível carregar a loja agora/);
        await aguardarQuantidade(enviados2, 1, "falha da vitrine gera um envio");
        assert.equal(enviados2[0].type, "operational");
        assert.equal(enviados2[0].category, "store-load");
        assert.equal(enviados2[0].name, "TypeError");
        assert.match(enviados2[0].stack || "", /loja\.html:\d+:\d+/);
        assertPayloadSeguro(enviados2[0]);
        await contexto2.close();

        // ---------- Function real no Functions Emulator (sem interceptação) ----------
        const endpoint = `http://127.0.0.1:5001/${PROJECT_ID}/southamerica-east1/reportFrontendError`;
        const chamar = (data) => fetch(endpoint, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ data })
        });
        const valida = await chamar({ ...enviados2[0], uid: "UID_FORJADO_QA", tenantId: "TENANT_FORJADO_QA" });
        assert.equal(valida.status, 200);
        assert.deepEqual((await valida.json()).result, { ok: true });
        const invalida = await chamar({ type: "inventado", category: "global" });
        assert.equal(invalida.status, 400);
        assert.equal((await invalida.json()).error?.status, "INVALID_ARGUMENT");
        const limites = await db.collection("_rate_limits").get();
        const daTelemetria = limites.docs.filter((d) => d.id.startsWith("reportFrontendError_"));
        assert.ok(daTelemetria.length >= 1, "rate limit real registrado no Firestore Emulator");
        for (const documento of daTelemetria) {
            assert.match(documento.id, /^reportFrontendError_anon_[0-9a-f]{40}$/);
            const bruto = JSON.stringify(documento.data());
            assert.ok(!documento.id.includes("127.0.0.1") && !bruto.includes("127.0.0.1"), "IP bruto nunca persistido");
        }

        console.log("frontend-error-telemetry.flow: OK");
    } catch (erro) {
        if (page) await captureDiagnostics(page, "frontend-error-telemetry", []).catch(() => {});
        console.error("frontend-error-telemetry.flow: FALHOU —", erro?.message || erro);
        process.exitCode = 1;
    } finally {
        await db.collection("vitrines_publicas").doc(SLUG_MALFORMADO).delete().catch(() => {});
        await browser.close();
        await close();
    }
}

await main();
