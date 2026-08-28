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
import {
    captureDiagnostics,
    coletarErrosConsole,
    ehErroDeRedeExterno,
    launchBrowser,
    loginReal,
    startStaticServer
} from "./_helpers.mjs";

// view -> permissão de módulo esperada (mesma tabela de PERMISSOES_NAV em
// dashboard-app.js). "null" = sem gate de permissão de módulo.
const VIEWS = {
    "view-produtos": "produtos",
    "view-catalogo": "produtos",
    "view-avaliacoes": "produtos",
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
        esperado: Object.fromEntries(
            Object.keys(VIEWS).map(viewId => [viewId, true])
        )
    },
    {
        nome: "editor",
        email: "employee.edit@local.test",
        senha: "Local123!edit",
        esperado: {
            "view-produtos": true,
            "view-catalogo": true,
            "view-avaliacoes": true,
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
        esperado: {
            "view-produtos": true,
            "view-catalogo": true,
            "view-avaliacoes": true,
            "view-pedidos": true,
            "view-leads": true,
            "view-crm360": true,
            "view-atendimento": true,
            "view-central-ia": false,
            "view-base-conhecimento": true,
            "view-funcionarios": false,
            "view-notificacoes": true
        }
    }
];

/**
 * A view de Avaliações é gateada por "produtos", mas também tenta montar um
 * resumo opcional do funil público lendo metricas_vitrines. Funcionários que
 * podem ver Produtos/Avaliações, mas não possuem a permissão separada
 * "metricas", recebem uma negativa legítima das Rules.
 *
 * Essa negativa não impede a abertura nem o uso da view de Avaliações. Por
 * isso ela não deve reprovar o smoke de navegação/permissões. O filtro abaixo
 * é propositalmente estreito: só vale para view-avaliacoes, perfis não-owner,
 * mensagem do funil público e erro de avaliação das Rules. Qualquer outro
 * erro continua reprovando normalmente.
 */
function ehNegativaEsperadaDoFunilPublico({
    erro,
    viewId,
    perfil
}) {
    if (viewId !== "view-avaliacoes") return false;
    if (perfil.nome === "owner") return false;

    const mensagem = String(erro || "");

    return (
        mensagem.includes("[Vide Hub] Erro ao carregar funil público") &&
        mensagem.includes("FirebaseError") &&
        mensagem.includes("evaluation error")
    );
}

/**
 * `networkidle` não é uma condição de prontidão válida neste dashboard:
 * listeners persistentes do Firebase podem manter a rede ocupada mesmo depois
 * de a troca de aba e o gate de permissão terem terminado. O contrato deste
 * smoke é exatamente o estado de navegação/permissão produzido por
 * `ativarAba()`:
 *
 * - acesso permitido: a seção solicitada fica ativa e visível;
 * - acesso negado: a seção solicitada não fica ativa e a aba já ativa não é
 *   removida.
 *
 * Esses são sinais do produto, não uma espera fixa. Eles também são os estados
 * dos quais dependem as asserções de acesso, visibilidade, permissão e
 * navegação realizadas logo abaixo.
 */
async function esperarProntidaoDaView(page, viewId, acessoPermitido) {
    await page.waitForFunction(
        ({ id, permitido }) => {
            const alvo = document.getElementById(id);
            const ativa = document.querySelector(".view-section.active");

            if (!alvo || !ativa) return false;

            if (!permitido) {
                return !alvo.classList.contains("active") && ativa.id !== id;
            }

            const estilo = window.getComputedStyle(alvo);
            return (
                ativa === alvo &&
                alvo.classList.contains("active") &&
                !alvo.hidden &&
                estilo.display !== "none" &&
                estilo.visibility !== "hidden"
            );
        },
        { id: viewId, permitido: acessoPermitido },
        { timeout: 10000 }
    );
}

/**
 * Duas views iniciam carregamentos assíncronos depois que `ativarAba()` já
 * deixou a seção visível. A prontidão de navegação acima continua sendo o
 * contrato principal; este complemento só espera os estados terminais que
 * essas telas já materializam no produto antes de avaliarmos erros de JS.
 *
 * O caminho de erro também é terminal de propósito: ele permite que o smoke
 * prossiga até a asserção normal de console, que deve reprovar a falha em vez
 * de escondê-la atrás de um timeout.
 */
async function esperarCargaAssincronaDaView(page, viewId, acessoPermitido) {
    if (!acessoPermitido) return;
    if (viewId !== "view-funcionarios" && viewId !== "view-notificacoes") {
        return;
    }

    await page.waitForFunction(
        id => {
            if (id === "view-funcionarios") {
                const lista = document.getElementById("lista-funcionarios");
                const contadores = [
                    document.getElementById("funcionario-total-count"),
                    document.getElementById("funcionario-active-count"),
                    document.getElementById("funcionario-inactive-count")
                ];

                if (lista?.querySelector(".aura-team-error")) return true;

                const contadoresFinais = contadores.every(elemento =>
                    /^\d+$/.test(elemento?.textContent?.trim() || "")
                );
                const listaFinal = lista?.querySelector(
                    ".aura-team-member, .aura-team-empty"
                );

                return contadoresFinais && Boolean(listaFinal);
            }

            const lista = document.getElementById(
                "lista-notificacoes-cliente"
            );
            const estadoFinal = lista?.querySelector(
                ".aura-notification-item, .aura-notifications-empty, " +
                ".aura-notifications-erro"
            );
            const buscaEmVoo = typeof _promiseNotificacoesEmVoo !== "undefined" &&
                _promiseNotificacoesEmVoo !== null;

            return Boolean(estadoFinal) && !buscaEmVoo;
        },
        viewId,
        { timeout: 10000 }
    );
}

async function testarPerfil(browser, baseUrl, perfil) {
    const page = await browser.newPage();
    const erros = coletarErrosConsole(page);
    const falhas = [];

    try {
        await loginReal(page, baseUrl, perfil);

        for (const [viewId, permissao] of Object.entries(VIEWS)) {
            erros.length = 0;

            const ativou = await page.evaluate(id => {
                if (typeof window.ativarAba !== "function") return null;
                return window.ativarAba(id);
            }, viewId);

            const esperado = perfil.esperado[viewId];

            await esperarProntidaoDaView(page, viewId, esperado);
            await esperarCargaAssincronaDaView(page, viewId, esperado);

            if (ativou !== esperado) {
                falhas.push(
                    `${perfil.nome} em ${viewId} (perm ${permissao}): ` +
                    `esperado ativarAba=${esperado}, obteve ${ativou}`
                );
            }

            const errosRelevantes = erros.filter(erro => {
                if (ehErroDeRedeExterno(erro)) return false;

                if (ehNegativaEsperadaDoFunilPublico({
                    erro,
                    viewId,
                    perfil
                })) {
                    console.log(
                        `Perfil ${perfil.nome}: negativa esperada do ` +
                        `funil público ignorada em ${viewId}.`
                    );
                    return false;
                }

                return true;
            });

            if (errosRelevantes.length > 0) {
                falhas.push(
                    `${perfil.nome} em ${viewId}: erros de JS ` +
                    `${JSON.stringify(errosRelevantes)}`
                );
            }
        }
    } catch (error) {
        await captureDiagnostics(
            page,
            `perfil-${perfil.nome}`,
            erros
        );

        falhas.push(
            `${perfil.nome}: exceção — ${error.message}`
        );
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
            const falhas = await testarPerfil(
                browser,
                baseUrl,
                perfil
            );

            if (falhas.length === 0) {
                console.log(
                    `Perfil ${perfil.nome}: OK — navegação e ` +
                    `permissões batem com o esperado.`
                );
            } else {
                console.error(
                    `Perfil ${perfil.nome}: FALHOU`,
                    falhas
                );
            }

            todasFalhas = todasFalhas.concat(falhas);
        }
    } finally {
        await browser.close();
        await close();
    }

    assert.equal(
        todasFalhas.length,
        0,
        `Falhas de navegação/permissão: ` +
        `${JSON.stringify(todasFalhas, null, 2)}`
    );

    console.log(
        "profiles.smoke: OK — 3 perfis, navegação e " +
        "permissões conferidas."
    );
}

await main().catch(error => {
    console.error(
        "profiles.smoke: FALHOU —",
        error.message
    );

    process.exit(1);
});
