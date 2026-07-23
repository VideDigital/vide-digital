// Fase 5/6 do Quality Gate: valida os 3 perfis (owner/editor/reader) e a
// navegação pelas views principais. Login real (Auth Emulator), e o gate
// de permissão testado é o REAL do app: ativarAba(targetId) só marca a
// view como .active se podeVerAba(targetId) permitir — testamos direto por
// aí em vez de confiar só na visibilidade do botão de menu (nem todo botão
// de nav tem data-module-permission; alguns módulos mais antigos deixam o
// botão sempre visível e bloqueiam no clique, o que ativarAba cobre de
// qualquer forma).
//
// Mesma limitação de rede documentada em login.smoke.mjs (bloqueio de
// egress a www.gstatic.com neste sandbox) se aplica aqui.
import assert from "node:assert/strict";
import { captureDiagnostics, coletarErrosConsole, ehErroDeRedeExterno, launchBrowser, loginReal, startStaticServer } from "./_helpers.mjs";

// view -> permissão de módulo esperada (mesma tabela de PERMISSOES_NAV em
// dashboard-app.js). "null" = sem gate de permissão de módulo (sempre
// acessível a qualquer funcionário ativo).
const VIEWS = {
    "view-produtos": "produtos",
    "view-pedidos": "pedidos",
    "view-leads": "leads",
    "view-crm360": "crm",
    "view-atendimento": "atendimento",
    "view-central-ia": "central-ia",
    "view-base-conhecimento": "base-conhecimento-ia",
    "view-funcionarios": "funcionarios",
    "view-notificacoes": null
};

const PERFIS = [
    {
        nome: "owner",
        email: "owner.pro@local.test",
        senha: "Local123!pro",
        // dono vê tudo, sempre.
        esperado: Object.fromEntries(Object.keys(VIEWS).map(v => [v, true]))
    },
    {
        nome: "editor",
        email: "employee.edit@local.test",
        senha: "Local123!edit",
        // ver seed: produtos, leads, funcionarios, central-ia, atendimento, crm, pedidos, base-conhecimento-ia
        esperado: {
            "view-produtos": true,
            "view-pedidos": true,
            "view-leads": true,
            "view-crm360": true,
            "view-atendimento": true,
            "view-central-ia": true,
            "view-base-conhecimento": true,
            "view-funcionarios": true,
            "view-notificacoes": true
        }
    },
    {
        nome: "reader",
        email: "employee.read@local.test",
        senha: "Local123!read",
        // mesmo conjunto de "ver" do editor no seed, mas sem "editar" —
        // aqui validamos só ACESSO à view (ver-só); ações de editar
        // ficam bloqueadas dentro de cada fluxo específico (pedidos.flow,
        // flows.smoke), não nesta checagem de navegação.
        esperado: {
            "view-produtos": true,
            "view-pedidos": true,
            "view-leads": true,
            "view-crm360": true,
            "view-atendimento": true,
            "view-central-ia": true,
            "view-base-conhecimento": true,
            "view-funcionarios": true,
            "view-notificacoes": true
        }
    }
];

async function testarPerfil(browser, baseUrl, perfil) {
    const page = await browser.newPage();
    const erros = coletarErrosConsole(page);
    const falhas = [];
    try {
        await loginReal(page, baseUrl, perfil);
        // loginReal só espera o DOM do dashboard existir, não que
        // VideHubContext termine de inicializar (snapshot assíncrono
        // pós-login) — chamar ativarAba antes disso faz até quem tem
        // acesso de verdade cair no bloqueio de "carregando permissões".
        await page.waitForFunction(
            () => typeof window.__videHubContextInitialized === "function" && window.__videHubContextInitialized(),
            { timeout: 15000 }
        );

        for (const [viewId, permissao] of Object.entries(VIEWS)) {
            erros.length = 0;
            const ativou = await page.evaluate(id => {
                if (typeof window.ativarAba !== "function") return null;
                return window.ativarAba(id);
            }, viewId);
            // Os controllers de cada módulo disparam load() assíncrono
            // (Firestore) ao ativar a aba — espera a rede assentar em vez
            // de um timeout arbitrário, pra dar tempo de qualquer erro de
            // JS assíncrono aparecer antes de checar `erros`.
            await page.waitForLoadState("networkidle").catch(() => {});
            const esperado = perfil.esperado[viewId];
            if (ativou !== esperado) {
                falhas.push(`${perfil.nome} em ${viewId} (perm ${permissao}): esperado ativarAba=${esperado}, obteve ${ativou}`);
            }
            const errosRelevantes = erros.filter(e => !ehErroDeRedeExterno(e));
            if (errosRelevantes.length > 0) {
                falhas.push(`${perfil.nome} em ${viewId}: erros de JS ${JSON.stringify(errosRelevantes)}`);
            }
        }
    } catch (error) {
        await captureDiagnostics(page, `perfil-${perfil.nome}`, erros);
        falhas.push(`${perfil.nome}: exceção — ${error.message}`);
    } finally {
        await page.close();
    }
    return falhas;
}

async function main() {
    const { baseUrl, close } = await startStaticServer();
    const browser = await launchBrowser();
    let todasFalhas = [];
    try {
        for (const perfil of PERFIS) {
            const falhas = await testarPerfil(browser, baseUrl, perfil);
            if (falhas.length === 0) {
                console.log(`Perfil ${perfil.nome}: OK — navegação e permissões batem com o esperado.`);
            } else {
                console.error(`Perfil ${perfil.nome}: FALHOU`, falhas);
            }
            todasFalhas = todasFalhas.concat(falhas);
        }
    } finally {
        await browser.close();
        await close();
    }
    assert.equal(todasFalhas.length, 0, `Falhas de navegação/permissão: ${JSON.stringify(todasFalhas, null, 2)}`);
    console.log("profiles.smoke: OK — 3 perfis, navegação e permissões conferidas.");
}

await main().catch(error => {
    console.error("profiles.smoke: FALHOU —", error.message);
    process.exit(1);
});
