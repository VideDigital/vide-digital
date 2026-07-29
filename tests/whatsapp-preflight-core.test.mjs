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

describe("avaliarVersaoGraphApi", () => {
    it("é SEMPRE BLOCKED (Gate Manual obrigatório) — nunca aprova a versão sozinho", () => {
        const check = avaliarVersaoGraphApi("v21.0");
        assert.equal(check.status, STATUS.BLOCKED);
        assert.ok(check.detalhe.includes("v21.0"));
        assert.ok(check.detalhe.toLowerCase().includes("developers.facebook.com"));
    });

    it("nunca muda de status mesmo com outra versão informada — é um gate, não uma validação de formato", () => {
        assert.equal(avaliarVersaoGraphApi("v25.0").status, STATUS.BLOCKED);
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

describe("avaliarFunctionsPublicadas", () => {
    const esperadas = ["whatsappWebhook", "whatsappSendText", "whatsappSendTemplate", "whatsappMarkRead", "whatsappSyncTemplates", "whatsappConnectionStatus", "whatsappValidateConnection"];

    it("WARN quando nenhuma publicada ainda (primeiro deploy)", () => {
        assert.equal(avaliarFunctionsPublicadas(esperadas, []).status, STATUS.WARN);
    });

    it("PASS quando as 7 já publicadas", () => {
        assert.equal(avaliarFunctionsPublicadas(esperadas, esperadas).status, STATUS.PASS);
    });

    it("WARN em deploy parcial", () => {
        const check = avaliarFunctionsPublicadas(esperadas, ["whatsappWebhook", "whatsappSendText"]);
        assert.equal(check.status, STATUS.WARN);
        assert.ok(check.detalhe.includes("2/7"));
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
