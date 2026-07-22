// Smoke de login real (Playwright + Firebase Auth Emulator). Substitui o
// antigo tests/emulator/frontend-ui-login-smoke.mjs — reescrito 100%
// portátil (sem /opt, sem Python, Playwright como devDependency real).
//
// Roda dentro de `firebase emulators:exec` (script pnpm run test:ui:login,
// que já roda scripts/seed-emulator.mjs antes). Nunca conecta à produção:
// exige ?useEmulator=true na primeira navegação (ver firebase-init.js).
//
// LIMITAÇÃO DE AMBIENTE CONHECIDA (não é bug do app): o dashboard importa
// o SDK do Firebase direto de um CDN (https://www.gstatic.com/firebasejs).
// Em qualquer ambiente cujo egress bloqueie esse host — confirmado nesta
// sessão de desenvolvimento via `curl -x $HTTPS_PROXY https://www.gstatic.com`
// retornando 403 de política, não timeout — o app não termina de carregar
// e este teste falha na etapa de login, SEMPRE, independente do código do
// teste. Se isso acontecer, confirme primeiro que o ambiente alcança
// www.gstatic.com antes de investigar o Playwright.
import assert from "node:assert/strict";
import { captureDiagnostics, coletarErrosConsole, ehErroDeRedeExterno, launchBrowser, loginReal, startStaticServer } from "./_helpers.mjs";

const PERFIS = {
    owner: { email: "owner.pro@local.test", senha: "Local123!pro" }
};

async function main() {
    const { baseUrl, close } = await startStaticServer();
    const browser = await launchBrowser();
    let falhou = false;
    try {
        const page = await browser.newPage();
        const erros = coletarErrosConsole(page);

        try {
            await loginReal(page, baseUrl, PERFIS.owner);
        } catch (error) {
            await captureDiagnostics(page, "login-falhou", erros);
            throw error;
        }

        const errosRelevantes = erros.filter(e => !ehErroDeRedeExterno(e));
        if (errosRelevantes.length > 0) {
            await captureDiagnostics(page, "login-erros-js", errosRelevantes);
        }
        assert.equal(errosRelevantes.length, 0, `Erros de JS após login: ${JSON.stringify(errosRelevantes)}`);

        console.log("Login real: OK — owner.pro autenticou e o dashboard carregou sem erros de JS.");
    } catch (error) {
        falhou = true;
        console.error("Login real: FALHOU —", error.message);
    } finally {
        await browser.close();
        await close();
    }
    if (falhou) process.exit(1);
}

await main();
