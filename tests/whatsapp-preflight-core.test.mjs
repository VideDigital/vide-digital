import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    STATUS,
    criarCheck,
    avaliarNodeVersion,
    avaliarComandoDisponivel,
    avaliarWorktreeLimpo,
    avaliarHeadEsperado,
    avaliarAutenticacaoGoogle,
    avaliarProjetoSelecionado,
    avaliarVersaoGraphApi,
    avaliarApisHabilitadas,
    avaliarSecretGlobal,
    avaliarPapeisIamRuntime,
    avaliarIamPorSecret,
    avaliarFunctionsPublicadas,
    avaliarRulesPublicadas,
    avaliarConexaoMeta,
    resumirResultados,
    calcularCodigoSaida,
    formatarTabelaTexto
} from "../scripts/whatsapp-preflight-core.mjs";

describe("criarCheck", () => {
    it("rejeita status desconhecido", () => {
        assert.throws(() => criarCheck("x", "NAO_EXISTE", "y"));
    });

    it("aceita os 4 status válidos", () => {
        for (const status of Object.values(STATUS)) {
            const check = criarCheck("nome", status, "detalhe");
            assert.equal(check.status, status);
        }
    });
});

describe("avaliarNodeVersion", () => {
    it("PASS em Node 22", () => {
        assert.equal(avaliarNodeVersion("v22.13.0").status, STATUS.PASS);
    });

    it("FAIL abaixo de 22", () => {
        assert.equal(avaliarNodeVersion("v20.10.0").status, STATUS.FAIL);
    });

    it("WARN acima de 22", () => {
        assert.equal(avaliarNodeVersion("v24.1.0").status, STATUS.WARN);
    });

    it("FAIL com valor não numérico", () => {
        assert.equal(avaliarNodeVersion("").status, STATUS.FAIL);
        assert.equal(avaliarNodeVersion(undefined).status, STATUS.FAIL);
    });
});

describe("avaliarComandoDisponivel", () => {
    it("PASS quando disponível", () => {
        assert.equal(avaliarComandoDisponivel("gcloud", true, "v500.0").status, STATUS.PASS);
    });

    it("FAIL quando ausente", () => {
        assert.equal(avaliarComandoDisponivel("gcloud", false).status, STATUS.FAIL);
    });
});

describe("avaliarWorktreeLimpo", () => {
    it("PASS com string vazia", () => {
        assert.equal(avaliarWorktreeLimpo("").status, STATUS.PASS);
        assert.equal(avaliarWorktreeLimpo("   \n  ").status, STATUS.PASS);
    });

    it("BLOCKED com alterações pendentes", () => {
        const check = avaliarWorktreeLimpo(" M firestore.rules\n?? novo.js");
        assert.equal(check.status, STATUS.BLOCKED);
        assert.ok(check.detalhe.includes("2"));
    });
});

describe("avaliarHeadEsperado", () => {
    it("WARN sem HEAD esperado informado", () => {
        assert.equal(avaliarHeadEsperado("abc123", "").status, STATUS.WARN);
    });

    it("PASS quando bate", () => {
        assert.equal(avaliarHeadEsperado("abc123", "abc123").status, STATUS.PASS);
    });

    it("BLOCKED quando diverge", () => {
        assert.equal(avaliarHeadEsperado("abc123", "def456").status, STATUS.BLOCKED);
    });
});

describe("avaliarAutenticacaoGoogle / avaliarProjetoSelecionado", () => {
    it("autenticação: PASS com conta, BLOCKED sem conta", () => {
        assert.equal(avaliarAutenticacaoGoogle("dev@example.com").status, STATUS.PASS);
        assert.equal(avaliarAutenticacaoGoogle("").status, STATUS.BLOCKED);
    });

    it("projeto: PASS só quando bate exatamente com o esperado", () => {
        assert.equal(avaliarProjetoSelecionado("vide-digital-saas", "vide-digital-saas").status, STATUS.PASS);
        assert.equal(avaliarProjetoSelecionado("outro-projeto", "vide-digital-saas").status, STATUS.BLOCKED);
        assert.equal(avaliarProjetoSelecionado("", "vide-digital-saas").status, STATUS.BLOCKED);
    });
});

describe("avaliarVersaoGraphApi (Gate Manual explícito por variável de ambiente)", () => {
    it("BLOCKED sem nenhuma confirmação informada (gate ausente)", () => {
        const check = avaliarVersaoGraphApi("v26.0", "");
        assert.equal(check.status, STATUS.BLOCKED);
        assert.ok(check.detalhe.includes("v26.0"));
        assert.ok(check.detalhe.includes("WHATSAPP_PREFLIGHT_CONFIRMED_GRAPH_VERSION"));
    });

    it("BLOCKED com undefined (mesmo contrato de ausência)", () => {
        assert.equal(avaliarVersaoGraphApi("v26.0", undefined).status, STATUS.BLOCKED);
    });

    it("PASS quando a confirmação bate exatamente com a versão do código", () => {
        const check = avaliarVersaoGraphApi("v26.0", "v26.0");
        assert.equal(check.status, STATUS.PASS);
        assert.ok(check.detalhe.includes("v26.0"));
    });

    it("BLOCKED quando a confirmação diverge da versão do código", () => {
        const check = avaliarVersaoGraphApi("v26.0", "v25.0");
        assert.equal(check.status, STATUS.BLOCKED);
        assert.ok(check.detalhe.includes("v26.0"));
        assert.ok(check.detalhe.includes("v25.0"));
    });

    it("BLOCKED com valor inválido/lixo — nunca aceita algo que não seja exatamente a versão do código", () => {
        assert.equal(avaliarVersaoGraphApi("v26.0", "qualquer-coisa").status, STATUS.BLOCKED);
        assert.equal(avaliarVersaoGraphApi("v26.0", "   ").status, STATUS.BLOCKED);
    });

    it("é dinâmico — funciona igual pra qualquer versão futura do código, nunca hardcoded", () => {
        assert.equal(avaliarVersaoGraphApi("v99.0", "v99.0").status, STATUS.PASS);
        assert.equal(avaliarVersaoGraphApi("v99.0", "v98.0").status, STATUS.BLOCKED);
    });
});

describe("avaliarApisHabilitadas", () => {
    it("PASS quando todas habilitadas", () => {
        const check = avaliarApisHabilitadas(["a", "b"], ["a", "b", "c"]);
        assert.equal(check.status, STATUS.PASS);
    });

    it("BLOCKED listando as que faltam", () => {
        const check = avaliarApisHabilitadas(["a", "b"], ["a"]);
        assert.equal(check.status, STATUS.BLOCKED);
        assert.ok(check.detalhe.includes("b"));
    });
});

describe("avaliarSecretGlobal", () => {
    it("BLOCKED se não existe", () => {
        assert.equal(avaliarSecretGlobal("WHATSAPP_APP_SECRET", { existe: false }).status, STATUS.BLOCKED);
    });

    it("BLOCKED se existe mas sem versão habilitada", () => {
        assert.equal(avaliarSecretGlobal("WHATSAPP_APP_SECRET", { existe: true, versoesHabilitadas: 0 }).status, STATUS.BLOCKED);
    });

    it("PASS se existe com versão habilitada, e nunca inclui valor no detalhe", () => {
        const check = avaliarSecretGlobal("WHATSAPP_APP_SECRET", { existe: true, versoesHabilitadas: 1 });
        assert.equal(check.status, STATUS.PASS);
        assert.ok(!/segredo-real|token-real/i.test(check.detalhe));
    });
});

describe("avaliarPapeisIamRuntime", () => {
    it("BLOCKED sem secretAccessor", () => {
        assert.equal(avaliarPapeisIamRuntime([]).status, STATUS.BLOCKED);
        assert.equal(avaliarPapeisIamRuntime(["roles/viewer"]).status, STATUS.BLOCKED);
    });

    it("PASS com secretAccessor e nada amplo demais", () => {
        assert.equal(avaliarPapeisIamRuntime(["roles/secretmanager.secretAccessor"]).status, STATUS.PASS);
    });

    it("WARN quando tem secretAccessor mas também papel amplo demais (Owner/Editor/Secret Manager Admin)", () => {
        const check = avaliarPapeisIamRuntime(["roles/secretmanager.secretAccessor", "roles/editor"]);
        assert.equal(check.status, STATUS.WARN);
        assert.ok(check.detalhe.includes("roles/editor"));
    });
});

describe("avaliarIamPorSecret (revisão 2026-07-31: binding direto no secret, não só a política do projeto)", () => {
    const SA = "891590456336-compute@developer.gserviceaccount.com";

    it("PASS quando o binding de secretAccessor está direto no secret (caso confirmado no Cloud Shell)", () => {
        const check = avaliarIamPorSecret("WHATSAPP_APP_SECRET", {
            runtimeSA: SA,
            papeisSecretDireto: ["roles/secretmanager.secretAccessor"],
            papeisProjeto: [],
            erroLeitura: false
        });
        assert.equal(check.status, STATUS.PASS);
        assert.ok(check.detalhe.includes(SA));
    });

    it("achado real: binding direto em AMBOS os secrets nunca é confundido com o achado antigo do projeto vazio", () => {
        for (const nomeSecret of ["WHATSAPP_APP_SECRET", "WHATSAPP_WEBHOOK_VERIFY_TOKEN"]) {
            const check = avaliarIamPorSecret(nomeSecret, {
                runtimeSA: SA,
                papeisSecretDireto: ["roles/secretmanager.secretAccessor"],
                papeisProjeto: [], // política do projeto vazia — o antigo check falso-positivo diria BLOCKED aqui
                erroLeitura: false
            });
            assert.equal(check.status, STATUS.PASS, `${nomeSecret} deveria ser PASS com binding direto, mesmo sem nada no projeto`);
        }
    });

    it("BLOCKED quando falta o binding em um dos secrets (o outro continua PASS)", () => {
        const comBinding = avaliarIamPorSecret("WHATSAPP_APP_SECRET", { runtimeSA: SA, papeisSecretDireto: ["roles/secretmanager.secretAccessor"], papeisProjeto: [], erroLeitura: false });
        const semBinding = avaliarIamPorSecret("WHATSAPP_WEBHOOK_VERIFY_TOKEN", { runtimeSA: SA, papeisSecretDireto: [], papeisProjeto: [], erroLeitura: false });
        assert.equal(comBinding.status, STATUS.PASS);
        assert.equal(semBinding.status, STATUS.BLOCKED);
    });

    it("WARN quando não há binding direto no secret, mas a SA tem secretAccessor a nível de projeto", () => {
        const check = avaliarIamPorSecret("WHATSAPP_APP_SECRET", {
            runtimeSA: SA,
            papeisSecretDireto: [],
            papeisProjeto: ["roles/secretmanager.secretAccessor"],
            erroLeitura: false
        });
        assert.equal(check.status, STATUS.WARN);
    });

    it("WARN quando há papel amplo demais (Owner/Editor/Secret Manager Admin), mesmo com secretAccessor direto presente", () => {
        const check = avaliarIamPorSecret("WHATSAPP_APP_SECRET", {
            runtimeSA: SA,
            papeisSecretDireto: ["roles/secretmanager.secretAccessor", "roles/owner"],
            papeisProjeto: [],
            erroLeitura: false
        });
        assert.equal(check.status, STATUS.WARN);
        assert.ok(check.detalhe.includes("roles/owner"));
    });

    it("WARN (nunca PASS) quando a política não pôde ser lida", () => {
        const check = avaliarIamPorSecret("WHATSAPP_APP_SECRET", { runtimeSA: SA, erroLeitura: true });
        assert.equal(check.status, STATUS.WARN);
        assert.notEqual(check.status, STATUS.PASS);
    });

    it("BLOCKED quando o binding existe, mas pra uma service account DIFERENTE da de runtime", () => {
        // Simula o filtro por membro já ter sido aplicado no chamador (produção
        // real filtra por `serviceAccount:${runtimeSA}` antes de chegar aqui) —
        // papeisSecretDireto vazio representa "nenhum binding para ESTA SA".
        const check = avaliarIamPorSecret("WHATSAPP_APP_SECRET", {
            runtimeSA: SA,
            papeisSecretDireto: [],
            papeisProjeto: [],
            erroLeitura: false
        });
        assert.equal(check.status, STATUS.BLOCKED);
        assert.ok(check.detalhe.includes(SA));
    });

    it("saída nunca inclui valor de secret, token ou credencial — só nomes de papel e e-mail de SA", () => {
        const checks = [
            avaliarIamPorSecret("WHATSAPP_APP_SECRET", { runtimeSA: SA, papeisSecretDireto: ["roles/secretmanager.secretAccessor"], papeisProjeto: [], erroLeitura: false }),
            avaliarIamPorSecret("WHATSAPP_WEBHOOK_VERIFY_TOKEN", { runtimeSA: SA, papeisSecretDireto: [], papeisProjeto: [], erroLeitura: false })
        ];
        for (const check of checks) {
            const texto = `${check.nome} ${check.detalhe}`;
            assert.ok(!/EAAG[a-zA-Z0-9]{20,}/.test(texto));
            assert.ok(!/valor|value=/i.test(texto));
        }
    });
});

describe("avaliarFunctionsPublicadas", () => {
    // 9 Functions reais do módulo (ver functions/src/whatsapp/index.js): as
    // 7 originais da V1 + as 2 da multiconexão (whatsappListConnections,
    // whatsappSetDefaultConnection). Contagem sempre derivada de
    // nomesEsperados.length — nunca hardcoded — pra nunca voltar a
    // divergir da arquitetura real quando uma Function nova for somada.
    const esperadas = [
        "whatsappWebhook",
        "whatsappSendText",
        "whatsappSendTemplate",
        "whatsappMarkRead",
        "whatsappSyncTemplates",
        "whatsappConnectionStatus",
        "whatsappValidateConnection",
        "whatsappListConnections",
        "whatsappSetDefaultConnection"
    ];

    it("WARN quando nenhuma publicada ainda (primeiro deploy)", () => {
        const check = avaliarFunctionsPublicadas(esperadas, []);
        assert.equal(check.status, STATUS.WARN);
        assert.ok(check.nome.includes("9"));
    });

    it("PASS quando as 9 já publicadas", () => {
        const check = avaliarFunctionsPublicadas(esperadas, esperadas);
        assert.equal(check.status, STATUS.PASS);
        assert.ok(check.detalhe.includes("9"));
    });

    it("WARN em deploy parcial (2/9)", () => {
        const check = avaliarFunctionsPublicadas(esperadas, ["whatsappWebhook", "whatsappSendText"]);
        assert.equal(check.status, STATUS.WARN);
        assert.ok(check.detalhe.includes("2/9"));
    });

    it("nunca menciona '7' em nenhum lugar quando o esperado é 9 (nome, detalhe)", () => {
        for (const check of [
            avaliarFunctionsPublicadas(esperadas, []),
            avaliarFunctionsPublicadas(esperadas, esperadas),
            avaliarFunctionsPublicadas(esperadas, ["whatsappWebhook"])
        ]) {
            assert.ok(!check.nome.includes("7"), `nome não deveria conter "7": ${check.nome}`);
            assert.ok(!check.detalhe.includes("7"), `detalhe não deveria conter "7": ${check.detalhe}`);
        }
    });

    it("prova de ausência de hardcode: funciona com qualquer quantidade, ex. lista artificial de 3", () => {
        const tres = ["fnA", "fnB", "fnC"];
        const semNenhuma = avaliarFunctionsPublicadas(tres, []);
        assert.ok(semNenhuma.nome.includes("3"));

        const todasPublicadas = avaliarFunctionsPublicadas(tres, tres);
        assert.equal(todasPublicadas.status, STATUS.PASS);
        assert.ok(todasPublicadas.detalhe.includes("3"));
        assert.ok(!todasPublicadas.detalhe.includes("9"));

        const parcial = avaliarFunctionsPublicadas(tres, ["fnA"]);
        assert.ok(parcial.detalhe.includes("1/3"));
    });

    it("saída nunca inclui dado sensível (token, secret, credencial) — só nomes de Function", () => {
        const check = avaliarFunctionsPublicadas(esperadas, esperadas.slice(0, 3));
        const textoCompleto = `${check.nome} ${check.detalhe}`;
        assert.ok(!/EAAG[a-zA-Z0-9]{20,}/.test(textoCompleto));
        assert.ok(!/secret|token|credential|password/i.test(textoCompleto));
    });
});

describe("avaliarRulesPublicadas", () => {
    it("é sempre WARN — nunca declara Rules publicadas só porque o arquivo local existe", () => {
        const check = avaliarRulesPublicadas();
        assert.equal(check.status, STATUS.WARN);
        assert.ok(check.detalhe.toLowerCase().includes("não é possível confirmar"));
    });
});

describe("avaliarConexaoMeta", () => {
    it("WARN quando não executado (opcional)", () => {
        assert.equal(avaliarConexaoMeta(null).status, STATUS.WARN);
        assert.equal(avaliarConexaoMeta(undefined).status, STATUS.WARN);
    });

    it("PASS com resultado ok", () => {
        const check = avaliarConexaoMeta({ ok: true, verifiedName: "Loja X", displayPhoneNumber: "+55..." });
        assert.equal(check.status, STATUS.PASS);
    });

    it("FAIL com resultado de erro, sem nunca incluir token no detalhe", () => {
        const check = avaliarConexaoMeta({ ok: false, code: "WHATSAPP_TOKEN_REVOKED" });
        assert.equal(check.status, STATUS.FAIL);
        assert.ok(!/bearer|token=/i.test(check.detalhe));
    });
});

describe("resumirResultados / calcularCodigoSaida", () => {
    it("conta corretamente cada status", () => {
        const checks = [
            criarCheck("a", STATUS.PASS, ""),
            criarCheck("b", STATUS.PASS, ""),
            criarCheck("c", STATUS.WARN, ""),
            criarCheck("d", STATUS.BLOCKED, "")
        ];
        const resumo = resumirResultados(checks);
        assert.deepEqual(resumo, { PASS: 2, WARN: 1, BLOCKED: 1, FAIL: 0, total: 4 });
    });

    it("código 0 quando só PASS/WARN", () => {
        const checks = [criarCheck("a", STATUS.PASS, ""), criarCheck("b", STATUS.WARN, "")];
        assert.equal(calcularCodigoSaida(checks), 0);
    });

    it("código 1 quando tem BLOCKED mas nenhum FAIL", () => {
        const checks = [criarCheck("a", STATUS.PASS, ""), criarCheck("b", STATUS.BLOCKED, "")];
        assert.equal(calcularCodigoSaida(checks), 1);
    });

    it("código 2 quando tem FAIL, mesmo com BLOCKED junto (FAIL tem prioridade)", () => {
        const checks = [criarCheck("a", STATUS.BLOCKED, ""), criarCheck("b", STATUS.FAIL, "")];
        assert.equal(calcularCodigoSaida(checks), 2);
    });

    it("lista vazia é código 0 (nada bloqueou)", () => {
        assert.equal(calcularCodigoSaida([]), 0);
    });
});

describe("formatarTabelaTexto", () => {
    it("inclui todos os checks e o resumo final, nunca um valor de segredo plausível", () => {
        const checks = [
            criarCheck("Node.js", STATUS.PASS, "Node 22 confirmado."),
            criarCheck("Secret global: WHATSAPP_APP_SECRET", STATUS.BLOCKED, "Secret não existe.")
        ];
        const texto = formatarTabelaTexto(checks);
        assert.ok(texto.includes("Node.js"));
        assert.ok(texto.includes("PASS"));
        assert.ok(texto.includes("BLOCKED"));
        assert.ok(texto.includes("Resumo:"));
        assert.ok(!/EAAG[a-zA-Z0-9]{20,}/.test(texto)); // formato típico de token da Meta
    });
});
