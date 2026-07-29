import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    VERSAO_ACESSO_CHAT_V2,
    chatV2PertenceALoja,
    chatV2ValidoParaRestaurar,
    chavePublicChatV2,
    normalizarErroChatPublico,
    parseReferenciaChatSalva,
    referenciaPertenceAoVisitante,
    sanitizarNomeVisitanteChat,
    serializarReferenciaChat
} from "../public-chat-auth-core.js";

describe("chavePublicChatV2", () => {
    it("gera uma chave por loja, nunca genérica", () => {
        assert.equal(chavePublicChatV2("owner-pro"), "videPublicChatV2:owner-pro");
        assert.equal(chavePublicChatV2("owner-outro"), "videPublicChatV2:owner-outro");
        assert.notEqual(chavePublicChatV2("owner-pro"), chavePublicChatV2("owner-outro"));
    });

    it("nunca quebra com valor vazio/indefinido", () => {
        assert.equal(chavePublicChatV2(""), "videPublicChatV2:");
        assert.equal(chavePublicChatV2(undefined), "videPublicChatV2:");
    });
});

describe("serializarReferenciaChat / parseReferenciaChatSalva", () => {
    it("faz o ciclo completo ida e volta preservando os dados", () => {
        const serializado = serializarReferenciaChat({ chatId: "chat123", visitorUid: "uidAbc" });
        const parsed = parseReferenciaChatSalva(serializado);
        assert.deepEqual(parsed, { chatId: "chat123", visitorUid: "uidAbc", version: VERSAO_ACESSO_CHAT_V2 });
    });

    it("descarta valor nulo/vazio/não-string", () => {
        assert.equal(parseReferenciaChatSalva(null), null);
        assert.equal(parseReferenciaChatSalva(""), null);
        assert.equal(parseReferenciaChatSalva(undefined), null);
    });

    it("descarta JSON malformado", () => {
        assert.equal(parseReferenciaChatSalva("{isso nao e json"), null);
    });

    it("descarta objeto sem chatId ou visitorUid", () => {
        assert.equal(parseReferenciaChatSalva(JSON.stringify({ visitorUid: "u1", version: 2 })), null);
        assert.equal(parseReferenciaChatSalva(JSON.stringify({ chatId: "c1", version: 2 })), null);
        assert.equal(parseReferenciaChatSalva(JSON.stringify({ chatId: "", visitorUid: "u1", version: 2 })), null);
    });

    it("descarta versão diferente de 2 (referência de um contrato futuro ou legado nunca salvo)", () => {
        assert.equal(parseReferenciaChatSalva(JSON.stringify({ chatId: "c1", visitorUid: "u1", version: 1 })), null);
        assert.equal(parseReferenciaChatSalva(JSON.stringify({ chatId: "c1", visitorUid: "u1", version: 3 })), null);
        assert.equal(parseReferenciaChatSalva(JSON.stringify({ chatId: "c1", visitorUid: "u1" })), null);
    });

    it("descarta array e tipos primitivos serializados", () => {
        assert.equal(parseReferenciaChatSalva(JSON.stringify(["c1", "u1"])), null);
        assert.equal(parseReferenciaChatSalva(JSON.stringify("string solta")), null);
        assert.equal(parseReferenciaChatSalva(JSON.stringify(42)), null);
    });
});

describe("referenciaPertenceAoVisitante", () => {
    it("aceita quando o visitorUid salvo bate com o uid da sessão atual", () => {
        const referencia = { chatId: "c1", visitorUid: "uidAtual", version: 2 };
        assert.equal(referenciaPertenceAoVisitante(referencia, "uidAtual"), true);
    });

    it("nunca aceita quando o uid diverge (sessão anônima diferente/expirada)", () => {
        const referencia = { chatId: "c1", visitorUid: "uidAntigo", version: 2 };
        assert.equal(referenciaPertenceAoVisitante(referencia, "uidNovo"), false);
    });

    it("nunca aceita sem referência ou sem uid atual", () => {
        assert.equal(referenciaPertenceAoVisitante(null, "uid1"), false);
        assert.equal(referenciaPertenceAoVisitante({ chatId: "c1", visitorUid: "u1", version: 2 }, ""), false);
        assert.equal(referenciaPertenceAoVisitante({ chatId: "c1", visitorUid: "u1", version: 2 }, null), false);
    });
});

describe("chatV2PertenceALoja", () => {
    it("aceita donoUID batendo com o storeUid da loja atual", () => {
        assert.equal(chatV2PertenceALoja({ donoUID: "owner-pro" }, "owner-pro"), true);
    });

    it("aceita emailDono como fallback legado do campo de tenant", () => {
        assert.equal(chatV2PertenceALoja({ emailDono: "owner-pro" }, "owner-pro"), true);
    });

    it("nunca reutiliza chat de outra loja", () => {
        assert.equal(chatV2PertenceALoja({ donoUID: "owner-outro" }, "owner-pro"), false);
    });

    it("nunca aceita dado ausente/malformado", () => {
        assert.equal(chatV2PertenceALoja(null, "owner-pro"), false);
        assert.equal(chatV2PertenceALoja({}, "owner-pro"), false);
        assert.equal(chatV2PertenceALoja({ donoUID: "owner-pro" }, ""), false);
    });
});

describe("chatV2ValidoParaRestaurar", () => {
    const contexto = { visitorUidAtual: "uidVisitante", storeUid: "owner-pro" };

    it("aceita um chat V2 completo, do visitante certo e da loja certa", () => {
        const chat = { donoUID: "owner-pro", visitorUid: "uidVisitante", versaoAcesso: 2 };
        assert.equal(chatV2ValidoParaRestaurar(chat, contexto), true);
    });

    it("nunca restaura chat de outro visitante", () => {
        const chat = { donoUID: "owner-pro", visitorUid: "outroUid", versaoAcesso: 2 };
        assert.equal(chatV2ValidoParaRestaurar(chat, contexto), false);
    });

    it("nunca restaura chat legado (sem versaoAcesso 2)", () => {
        const chat = { donoUID: "owner-pro", visitorUid: "uidVisitante" };
        assert.equal(chatV2ValidoParaRestaurar(chat, contexto), false);
    });

    it("nunca restaura chat de outra loja", () => {
        const chat = { donoUID: "owner-outro", visitorUid: "uidVisitante", versaoAcesso: 2 };
        assert.equal(chatV2ValidoParaRestaurar(chat, contexto), false);
    });

    it("nunca quebra com dado nulo", () => {
        assert.equal(chatV2ValidoParaRestaurar(null, contexto), false);
    });
});

describe("sanitizarNomeVisitanteChat", () => {
    it("remove espaços das pontas", () => {
        assert.equal(sanitizarNomeVisitanteChat("  Maria Silva  "), "Maria Silva");
    });

    it("limita a 120 caracteres (mesmo limite de clienteNome)", () => {
        const nomeGigante = "A".repeat(200);
        assert.equal(sanitizarNomeVisitanteChat(nomeGigante).length, 120);
    });

    it("nunca quebra com valor ausente", () => {
        assert.equal(sanitizarNomeVisitanteChat(undefined), "");
        assert.equal(sanitizarNomeVisitanteChat(null), "");
    });
});

describe("normalizarErroChatPublico", () => {
    it("nunca expõe código técnico nem stack — sempre texto em português recuperável", () => {
        const mensagens = [
            normalizarErroChatPublico({ code: "auth/operation-not-allowed" }),
            normalizarErroChatPublico({ code: "auth/network-request-failed" }),
            normalizarErroChatPublico({ code: "unavailable" }),
            normalizarErroChatPublico({ code: "permission-denied" }),
            normalizarErroChatPublico({ code: "erro-desconhecido-qualquer" }),
            normalizarErroChatPublico(undefined)
        ];
        mensagens.forEach((mensagem) => {
            assert.equal(typeof mensagem, "string");
            assert.ok(mensagem.length > 0);
            assert.ok(!/auth\/|firebase|stack|uid/i.test(mensagem));
        });
    });

    it("mensagem de sessão diferente/expirada é distinta da de rede", () => {
        const permissao = normalizarErroChatPublico({ code: "permission-denied" });
        const rede = normalizarErroChatPublico({ code: "unavailable" });
        assert.notEqual(permissao, rede);
    });

    // Fase B: sem fallback legado, normalizarErroChatPublico() é o ÚNICO
    // ponto de tradução de erro pro visitante — auth/operation-not-allowed
    // (Anonymous Auth desabilitado) e permission-denied (Rules antigas
    // ainda em produção) não acionam mais nenhum caminho V1, só mostram
    // uma mensagem recuperável.
    it("auth/operation-not-allowed vira uma mensagem recuperável, nunca um fallback silencioso", () => {
        const mensagem = normalizarErroChatPublico({ code: "auth/operation-not-allowed" });
        assert.equal(mensagem, "Não foi possível conectar o chat agora. Atualize a página e tente novamente.");
    });

    it("permission-denied vira uma mensagem recuperável distinta, nunca um fallback silencioso", () => {
        const mensagem = normalizarErroChatPublico({ code: "permission-denied" });
        assert.equal(mensagem, "Sua conversa anterior não está mais disponível. Inicie uma nova.");
    });

    it("é chamada de forma idempotente: repetir o mesmo erro sempre produz a mesma mensagem (nova tentativa não duplica estado)", () => {
        const erro = { code: "permission-denied" };
        assert.equal(normalizarErroChatPublico(erro), normalizarErroChatPublico(erro));
    });
});
