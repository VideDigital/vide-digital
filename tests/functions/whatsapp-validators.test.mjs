import assert from "node:assert/strict";
import crypto from "node:crypto";
import { describe, it } from "node:test";
import validators from "../../functions/src/whatsapp/validators.js";
import constants from "../../functions/src/whatsapp/constants.js";

describe("whatsapp/validators — verificarHandshakeWebhook", () => {
    it("aceita mode/token corretos e devolve o challenge", () => {
        const desafio = validators.verificarHandshakeWebhook(
            { mode: "subscribe", token: "segredo-certo", challenge: "12345" },
            "segredo-certo"
        );
        assert.equal(desafio, "12345");
    });

    it("rejeita token errado", () => {
        const desafio = validators.verificarHandshakeWebhook(
            { mode: "subscribe", token: "token-errado", challenge: "12345" },
            "segredo-certo"
        );
        assert.equal(desafio, null);
    });

    it("rejeita mode diferente de subscribe", () => {
        const desafio = validators.verificarHandshakeWebhook(
            { mode: "unsubscribe", token: "segredo-certo", challenge: "12345" },
            "segredo-certo"
        );
        assert.equal(desafio, null);
    });

    it("rejeita quando não há verify token configurado", () => {
        const desafio = validators.verificarHandshakeWebhook(
            { mode: "subscribe", token: "qualquer", challenge: "12345" },
            ""
        );
        assert.equal(desafio, null);
    });
});

describe("whatsapp/validators — verificarAssinaturaWebhook (HMAC)", () => {
    const segredo = "app-secret-de-teste";
    const corpo = JSON.stringify({ entry: [{ id: "1" }] });
    function assinar(body, secret) {
        return `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
    }

    it("aceita assinatura válida", () => {
        const assinatura = assinar(corpo, segredo);
        assert.equal(validators.verificarAssinaturaWebhook(corpo, assinatura, segredo), true);
    });

    it("rejeita assinatura inválida (corpo alterado)", () => {
        const assinatura = assinar(corpo, segredo);
        assert.equal(validators.verificarAssinaturaWebhook(corpo + "x", assinatura, segredo), false);
    });

    it("rejeita quando o segredo usado pra assinar é outro", () => {
        const assinatura = assinar(corpo, "outro-segredo");
        assert.equal(validators.verificarAssinaturaWebhook(corpo, assinatura, segredo), false);
    });

    it("rejeita header sem o prefixo sha256=", () => {
        const semPrefixo = crypto.createHmac("sha256", segredo).update(corpo).digest("hex");
        assert.equal(validators.verificarAssinaturaWebhook(corpo, semPrefixo, segredo), false);
    });

    it("rejeita quando faltam parâmetros", () => {
        assert.equal(validators.verificarAssinaturaWebhook(corpo, "", segredo), false);
        assert.equal(validators.verificarAssinaturaWebhook(corpo, "sha256=abc", ""), false);
        assert.equal(validators.verificarAssinaturaWebhook("", "sha256=abc", segredo), false);
    });

    it("comparação é resistente a tamanhos diferentes (timing-safe não lança)", () => {
        assert.doesNotThrow(() => validators.timingSafeEqualStrings("curto", "um-valor-bem-mais-longo-que-o-outro"));
        assert.equal(validators.timingSafeEqualStrings("curto", "um-valor-bem-mais-longo-que-o-outro"), false);
        assert.equal(validators.timingSafeEqualStrings("igual", "igual"), true);
    });
});

describe("whatsapp/validators — identificadores", () => {
    it("normalizarWaId remove tudo que não é dígito", () => {
        assert.equal(validators.normalizarWaId("+55 (11) 99999-0000"), "5511999990000");
    });

    it("waIdValido rejeita muito curto/longo", () => {
        assert.equal(validators.waIdValido("551199990000"), true);
        assert.equal(validators.waIdValido("123"), false);
        assert.equal(validators.waIdValido("1".repeat(20)), false);
    });

    it("safeWamid é determinístico e nunca contém caracteres inválidos de doc ID", () => {
        const a = validators.safeWamid("wamid.HBgLNTU5MTE5OTk5MDAwMBUCABIYFjNBMEExRUYy==");
        const b = validators.safeWamid("wamid.HBgLNTU5MTE5OTk5MDAwMBUCABIYFjNBMEExRUYy==");
        assert.equal(a, b);
        assert.equal(/^[a-f0-9]+$/.test(a), true);
        assert.equal(validators.safeWamid(""), "");
    });

    it("hashContato nunca expõe o wa_id cru e é estável por tenant", () => {
        const h1 = validators.hashContato("owner-1", "551199990000");
        const h2 = validators.hashContato("owner-1", "551199990000");
        const h3 = validators.hashContato("owner-2", "551199990000");
        assert.equal(h1, h2);
        assert.notEqual(h1, h3);
        assert.equal(h1.includes("551199990000"), false);
    });

    it("hashEventoWebhook muda se qualquer campo mudar", () => {
        const base = { ownerUid: "o1", eventType: "mensagem", providerId: "wamid.1", providerTimestamp: 1000 };
        const h1 = validators.hashEventoWebhook(base);
        const h2 = validators.hashEventoWebhook({ ...base, providerTimestamp: 2000 });
        assert.notEqual(h1, h2);
    });
});

describe("whatsapp/validators — janela de 24h", () => {
    it("calcula expiração 24h após a última mensagem do cliente", () => {
        const base = 1_700_000_000_000;
        assert.equal(validators.calcularExpiracaoJanela(base), base + constants.WINDOW_MS);
    });

    it("janela aberta quando ainda não expirou", () => {
        assert.equal(validators.janelaAberta(Date.now() + 60_000, Date.now()), true);
    });

    it("janela fechada quando já expirou", () => {
        assert.equal(validators.janelaAberta(Date.now() - 1000, Date.now()), false);
    });

    it("janela fechada quando o valor é inválido/ausente", () => {
        assert.equal(validators.janelaAberta(undefined, Date.now()), false);
        assert.equal(validators.janelaAberta(0, Date.now()), false);
    });
});

describe("whatsapp/validators — podeAtualizarStatusMensagem (nunca regride)", () => {
    it("progride normalmente na ordem esperada", () => {
        assert.equal(validators.podeAtualizarStatusMensagem(undefined, "queued"), true);
        assert.equal(validators.podeAtualizarStatusMensagem("queued", "accepted"), true);
        assert.equal(validators.podeAtualizarStatusMensagem("accepted", "sent"), true);
        assert.equal(validators.podeAtualizarStatusMensagem("sent", "delivered"), true);
        assert.equal(validators.podeAtualizarStatusMensagem("delivered", "read"), true);
    });

    it("rejeita regressão (read chegando depois não volta pra delivered)", () => {
        assert.equal(validators.podeAtualizarStatusMensagem("read", "delivered"), false);
        assert.equal(validators.podeAtualizarStatusMensagem("delivered", "sent"), false);
    });

    it("aceita repetição do mesmo status (reentrega idempotente)", () => {
        assert.equal(validators.podeAtualizarStatusMensagem("delivered", "delivered"), true);
    });

    it("Fase 6: aceita 'read' chegando fora de ordem, direto de 'sent' (a Meta não garante 'delivered' antes)", () => {
        assert.equal(validators.podeAtualizarStatusMensagem("sent", "read"), true);
        assert.equal(validators.podeAtualizarStatusMensagem("accepted", "read"), true);
    });

    it("Fase 6: 'read' repetido (reentrega do webhook) nunca é tratado como regressão", () => {
        assert.equal(validators.podeAtualizarStatusMensagem("read", "read"), true);
    });

    it("aceita failed antes de delivered/read, rejeita depois", () => {
        assert.equal(validators.podeAtualizarStatusMensagem("sent", "failed"), true);
        assert.equal(validators.podeAtualizarStatusMensagem("delivered", "failed"), false);
        assert.equal(validators.podeAtualizarStatusMensagem("read", "failed"), false);
    });

    it("failed é terminal — nada sai dele", () => {
        assert.equal(validators.podeAtualizarStatusMensagem("failed", "sent"), false);
        assert.equal(validators.podeAtualizarStatusMensagem("failed", "failed"), true);
    });

    it("rejeita valor de status desconhecido", () => {
        assert.equal(validators.podeAtualizarStatusMensagem("queued", "bogus"), false);
    });
});

describe("whatsapp/validators — segurança de logs (sem PII)", () => {
    it("sanitizarErroParaLog só devolve campos técnicos", () => {
        const resultado = validators.sanitizarErroParaLog({
            code: "WHATSAPP_MESSAGE_FAILED",
            funcao: "whatsappSendText",
            providerStatus: 400,
            correlationId: "abc123"
        });
        assert.deepEqual(Object.keys(resultado).sort(), ["code", "correlationId", "funcao", "providerStatus"]);
    });

    it("removerCamposSensiveis oculta chaves conhecidas recursivamente", () => {
        const limpo = validators.removerCamposSensiveis({
            texto: "mensagem do cliente",
            waId: "551199990000",
            aninhado: { token: "abc", ok: true }
        });
        assert.equal(limpo.texto, "[omitido]");
        assert.equal(limpo.waId, "[omitido]");
        assert.equal(limpo.aninhado.token, "[omitido]");
        assert.equal(limpo.aninhado.ok, true);
    });

    it("mascararSegredo nunca revela tamanho/valor real", () => {
        assert.equal(validators.mascararSegredo(), "•••••••• conectado");
    });
});

describe("whatsapp/validators — identificadorRateLimit", () => {
    it("junta partes normalizadas de forma estável", () => {
        const chave = validators.identificadorRateLimit("owner", "abc-123", "sendText");
        assert.equal(chave, "owner_abc-123_sendText");
    });

    it("nunca deixa caracteres fora de [a-zA-Z0-9_-]", () => {
        const chave = validators.identificadorRateLimit("owner", "uid com espaço!");
        assert.equal(/^[a-zA-Z0-9_-]+$/.test(chave), true);
    });
});

describe("whatsapp/validators — extrairEventosDoPayload (parsing do payload da Meta)", () => {
    it("extrai mensagem de texto inbound", () => {
        const payload = {
            entry: [{
                changes: [{
                    field: "messages",
                    value: {
                        metadata: { phone_number_id: "1000" },
                        contacts: [{ profile: { name: "Fulano" }, wa_id: "5511999990000" }],
                        messages: [{
                            id: "wamid.ABC",
                            from: "5511999990000",
                            timestamp: "1700000000",
                            type: "text",
                            text: { body: "Olá!" }
                        }]
                    }
                }]
            }]
        };
        const eventos = validators.extrairEventosDoPayload(payload);
        assert.equal(eventos.length, 1);
        assert.equal(eventos[0].categoria, "mensagem");
        assert.equal(eventos[0].messageType, "text");
        assert.equal(eventos[0].texto, "Olá!");
        assert.equal(eventos[0].waId, "5511999990000");
        assert.equal(eventos[0].profileName, "Fulano");
    });

    it("extrai displayPhoneNumber do metadata (sem precisar consultar whatsapp_connections)", () => {
        const payload = {
            entry: [{
                changes: [{
                    field: "messages",
                    value: {
                        metadata: { phone_number_id: "1000", display_phone_number: "5511900000000" },
                        contacts: [{ profile: { name: "Fulano" }, wa_id: "5511999990000" }],
                        messages: [{ id: "wamid.DISP", from: "5511999990000", timestamp: "1700000009", type: "text", text: { body: "oi" } }]
                    }
                }]
            }]
        };
        const eventos = validators.extrairEventosDoPayload(payload);
        assert.equal(eventos[0].displayPhoneNumber, "5511900000000");
    });

    it("extrai status de mensagem outbound", () => {
        const payload = {
            entry: [{
                changes: [{
                    field: "messages",
                    value: {
                        metadata: { phone_number_id: "1000" },
                        statuses: [{ id: "wamid.XYZ", status: "delivered", timestamp: "1700000001" }]
                    }
                }]
            }]
        };
        const eventos = validators.extrairEventosDoPayload(payload);
        assert.equal(eventos.length, 1);
        assert.equal(eventos[0].categoria, "status");
        assert.equal(eventos[0].providerStatus, "delivered");
    });

    it("tipo de mensagem desconhecido vira placeholder não-quebrante", () => {
        const payload = {
            entry: [{
                changes: [{
                    field: "messages",
                    value: {
                        metadata: { phone_number_id: "1000" },
                        contacts: [{ profile: { name: "Fulano" }, wa_id: "5511999990000" }],
                        messages: [{ id: "wamid.NEW", from: "5511999990000", timestamp: "1700000002", type: "algum_tipo_futuro_da_meta" }]
                    }
                }]
            }]
        };
        const eventos = validators.extrairEventosDoPayload(payload);
        assert.equal(eventos.length, 1);
        assert.equal(eventos[0].messageType, "unknown");
        assert.equal(eventos[0].tipoOriginal, "algum_tipo_futuro_da_meta");
    });

    it("ignora changes que não são do campo messages", () => {
        const payload = { entry: [{ changes: [{ field: "outro_campo", value: {} }] }] };
        assert.deepEqual(validators.extrairEventosDoPayload(payload), []);
    });

    it("payload vazio/malformado nunca lança — devolve lista vazia", () => {
        assert.deepEqual(validators.extrairEventosDoPayload({}), []);
        assert.deepEqual(validators.extrairEventosDoPayload(null), []);
        assert.deepEqual(validators.extrairEventosDoPayload(undefined), []);
    });

    it("extrai metadados seguros de mensagem de mídia sem baixar nada", () => {
        const payload = {
            entry: [{
                changes: [{
                    field: "messages",
                    value: {
                        metadata: { phone_number_id: "1000" },
                        contacts: [{ profile: { name: "Fulano" }, wa_id: "5511999990000" }],
                        messages: [{
                            id: "wamid.MEDIA",
                            from: "5511999990000",
                            timestamp: "1700000003",
                            type: "image",
                            image: { id: "media-123", mime_type: "image/jpeg", caption: "foto" }
                        }]
                    }
                }]
            }]
        };
        const eventos = validators.extrairEventosDoPayload(payload);
        assert.equal(eventos[0].messageType, "image");
        assert.equal(eventos[0].mediaMetadata.providerMediaId, "media-123");
        assert.equal(eventos[0].mediaMetadata.mimeType, "image/jpeg");
    });
});

describe("whatsapp/validators — validarParametrosTemplate", () => {
    it("aceita quando todos os parâmetros obrigatórios estão presentes", () => {
        const schema = [{ name: "1", type: "text", required: true }, { name: "2", type: "text", required: true }];
        const resultado = validators.validarParametrosTemplate(schema, { 1: "João", 2: "12345" });
        assert.equal(resultado.valido, true);
    });

    it("rejeita quando falta um parâmetro obrigatório", () => {
        const schema = [{ name: "1", type: "text", required: true }];
        const resultado = validators.validarParametrosTemplate(schema, {});
        assert.equal(resultado.valido, false);
        assert.ok(resultado.erros.length > 0);
    });

    it("schema vazio é sempre válido (template sem parâmetros)", () => {
        assert.equal(validators.validarParametrosTemplate([], {}).valido, true);
        assert.equal(validators.validarParametrosTemplate(undefined, undefined).valido, true);
    });
});

describe("whatsapp/constants — versão centralizada da Graph API", () => {
    it("graphUrl usa sempre a mesma versão centralizada", () => {
        const url = constants.graphUrl("123456/messages");
        assert.equal(url, `https://graph.facebook.com/${constants.WHATSAPP_GRAPH_VERSION}/123456/messages`);
    });

    it("graphUrl remove barra inicial duplicada", () => {
        const url = constants.graphUrl("/123456");
        assert.equal(url, `https://graph.facebook.com/${constants.WHATSAPP_GRAPH_VERSION}/123456`);
    });
});
