// Testa a lógica das Cloud Functions do WhatsApp Oficial V1 sem
// Functions Emulator e SEM NUNCA chamar a Graph API real — metaClient.js
// é injetável (fetchImpl), então usamos um adapter fake determinístico
// (mesmo espírito de computarEventoAuditoria em audit/triggers.js:
// funções puras testadas com dados já resolvidos, sem I/O real).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { criarMetaClient } from "../../functions/src/whatsapp/metaClient.js";
import webhook from "../../functions/src/whatsapp/webhook.js";
import send from "../../functions/src/whatsapp/send.js";
import templates from "../../functions/src/whatsapp/templates.js";
import connections from "../../functions/src/whatsapp/connections.js";
import whatsappIndex from "../../functions/src/whatsapp/index.js";
import { ERROR_CODES } from "../../functions/src/whatsapp/constants.js";

// ---------- Fake Meta adapter (nunca a Graph API real) ----------
function fakeFetch(respostas) {
    let chamada = 0;
    const chamadas = [];
    const fetchImpl = async (url, options) => {
        chamadas.push({ url, options });
        const resposta = respostas[Math.min(chamada, respostas.length - 1)];
        chamada += 1;
        return {
            ok: resposta.status >= 200 && resposta.status < 300,
            status: resposta.status,
            json: async () => resposta.body
        };
    };
    fetchImpl.chamadas = chamadas;
    return fetchImpl;
}

describe("whatsapp/metaClient — nunca chama a Graph API real (fetch injetado)", () => {
    it("sendText monta a URL/corpo certos e devolve o messages[] em sucesso", async () => {
        const fetchImpl = fakeFetch([{ status: 200, body: { messages: [{ id: "wamid.NOVO" }] } }]);
        const client = criarMetaClient({ fetchImpl });
        const resposta = await client.sendText({ accessToken: "token-fake", phoneNumberId: "1000", to: "5511999990000", body: "Olá" });
        assert.equal(resposta.messages[0].id, "wamid.NOVO");
        const chamada = fetchImpl.chamadas[0];
        assert.ok(chamada.url.includes("/1000/messages"));
        assert.ok(chamada.url.includes("graph.facebook.com"));
        assert.equal(chamada.options.headers.Authorization, "Bearer token-fake");
        const corpo = JSON.parse(chamada.options.body);
        assert.equal(corpo.type, "text");
        assert.equal(corpo.to, "5511999990000");
    });

    it("401 vira TOKEN_REVOKED sem retry", async () => {
        const fetchImpl = fakeFetch([{ status: 401, body: { error: { code: 190, type: "OAuthException" } } }]);
        const client = criarMetaClient({ fetchImpl });
        await assert.rejects(
            () => client.sendText({ accessToken: "x", phoneNumberId: "1000", to: "5511999990000", body: "oi" }),
            (erro) => erro.code === ERROR_CODES.TOKEN_REVOKED
        );
        assert.equal(fetchImpl.chamadas.length, 1);
    });

    it("429 vira RATE_LIMITED sem retry", async () => {
        const fetchImpl = fakeFetch([{ status: 429, body: { error: { code: 4 } } }]);
        const client = criarMetaClient({ fetchImpl });
        await assert.rejects(
            () => client.sendText({ accessToken: "x", phoneNumberId: "1000", to: "5511999990000", body: "oi" }),
            (erro) => erro.code === ERROR_CODES.RATE_LIMITED
        );
        assert.equal(fetchImpl.chamadas.length, 1);
    });

    it("400 (destinatário/parâmetro inválido) vira MESSAGE_FAILED sem retry", async () => {
        const fetchImpl = fakeFetch([{ status: 400, body: { error: { code: 131026, error_user_title: "Recipient not on WhatsApp" } } }]);
        const client = criarMetaClient({ fetchImpl });
        await assert.rejects(
            () => client.sendText({ accessToken: "x", phoneNumberId: "1000", to: "0000", body: "oi" }),
            (erro) => erro.code === ERROR_CODES.MESSAGE_FAILED
        );
        assert.equal(fetchImpl.chamadas.length, 1);
    });

    it("500 é retentável e eventualmente vira PROVIDER_UNAVAILABLE após esgotar tentativas", async () => {
        const fetchImpl = fakeFetch([
            { status: 500, body: {} },
            { status: 500, body: {} },
            { status: 500, body: {} }
        ]);
        const client = criarMetaClient({ fetchImpl, timeoutMs: 1000 });
        await assert.rejects(
            () => client.sendText({ accessToken: "x", phoneNumberId: "1000", to: "5511999990000", body: "oi" }),
            (erro) => erro.code === ERROR_CODES.PROVIDER_UNAVAILABLE
        );
        assert.equal(fetchImpl.chamadas.length, 3); // 1 original + 2 retries
    });

    it("500 seguido de sucesso é recuperado pelo retry", async () => {
        const fetchImpl = fakeFetch([
            { status: 500, body: {} },
            { status: 200, body: { messages: [{ id: "wamid.RETRY_OK" }] } }
        ]);
        const client = criarMetaClient({ fetchImpl });
        const resposta = await client.sendText({ accessToken: "x", phoneNumberId: "1000", to: "5511999990000", body: "oi" });
        assert.equal(resposta.messages[0].id, "wamid.RETRY_OK");
    });

    it("token nunca aparece em nenhuma mensagem de erro lançada", async () => {
        const fetchImpl = fakeFetch([{ status: 401, body: { error: { code: 190 } } }]);
        const client = criarMetaClient({ fetchImpl });
        try {
            await client.sendText({ accessToken: "SEGREDO_QUE_NUNCA_PODE_VAZAR", phoneNumberId: "1000", to: "551199990000", body: "oi" });
            assert.fail("deveria ter lançado");
        } catch (erro) {
            assert.equal(String(erro.message).includes("SEGREDO_QUE_NUNCA_PODE_VAZAR"), false);
            assert.equal(JSON.stringify(erro).includes("SEGREDO_QUE_NUNCA_PODE_VAZAR"), false);
        }
    });

    it("sendTemplate monta type=template com language/components", async () => {
        const fetchImpl = fakeFetch([{ status: 200, body: { messages: [{ id: "wamid.TPL" }] } }]);
        const client = criarMetaClient({ fetchImpl });
        await client.sendTemplate({
            accessToken: "x", phoneNumberId: "1000", to: "5511999990000",
            templateName: "boas_vindas", languageCode: "pt_BR",
            components: [{ type: "body", parameters: [{ type: "text", text: "João" }] }]
        });
        const corpo = JSON.parse(fetchImpl.chamadas[0].options.body);
        assert.equal(corpo.type, "template");
        assert.equal(corpo.template.name, "boas_vindas");
        assert.equal(corpo.template.language.code, "pt_BR");
        assert.equal(corpo.template.components[0].parameters[0].text, "João");
    });

    it("markRead monta o payload de status=read", async () => {
        const fetchImpl = fakeFetch([{ status: 200, body: { success: true } }]);
        const client = criarMetaClient({ fetchImpl });
        await client.markRead({ accessToken: "x", phoneNumberId: "1000", messageId: "wamid.LIDA" });
        const corpo = JSON.parse(fetchImpl.chamadas[0].options.body);
        assert.equal(corpo.status, "read");
        assert.equal(corpo.message_id, "wamid.LIDA");
    });
});

describe("whatsapp/webhook — montarPlanoChatInbound", () => {
    it("primeira mensagem de um contato novo cria chat novo", () => {
        const plano = webhook.montarPlanoChatInbound({
            ownerUid: "owner-1", waId: "5511999990000", profileName: "Maria",
            phoneNumberId: "1000", providerTimestamp: 1_700_000_000_000,
            contatoExistente: null, clienteEncontradoId: ""
        });
        assert.equal(plano.novoChat, true);
        assert.equal(plano.chatCreate.canal, "whatsapp");
        assert.equal(plano.chatCreate.status, "nova");
        assert.equal(plano.chatCreate.whatsappWaId, "5511999990000");
        assert.equal(plano.chatCreate.clienteNome, "Maria");
        assert.equal("clienteId" in plano.chatCreate, false);
    });

    it("vincula clienteId quando há match único do CRM 360", () => {
        const plano = webhook.montarPlanoChatInbound({
            ownerUid: "owner-1", waId: "5511999990000", profileName: "Maria",
            phoneNumberId: "1000", providerTimestamp: 1_700_000_000_000,
            contatoExistente: null, clienteEncontradoId: "cliente-abc"
        });
        assert.equal(plano.chatCreate.clienteId, "cliente-abc");
    });

    it("segunda mensagem do mesmo contato reaproveita o chat existente", () => {
        const plano = webhook.montarPlanoChatInbound({
            ownerUid: "owner-1", waId: "5511999990000", profileName: "Maria",
            phoneNumberId: "1000", providerTimestamp: 1_700_000_100_000,
            contatoExistente: { chatId: "chat-existente", profileName: "Maria" }, clienteEncontradoId: ""
        });
        assert.equal(plano.novoChat, false);
        assert.equal(plano.chatId, "chat-existente");
        assert.equal(plano.chatUpdate.status, "aguardando_equipe");
    });

    it("sem nome de perfil, usa um nome derivado do número", () => {
        const plano = webhook.montarPlanoChatInbound({
            ownerUid: "owner-1", waId: "5511999990000", profileName: "",
            phoneNumberId: "1000", providerTimestamp: 1_700_000_000_000,
            contatoExistente: null, clienteEncontradoId: ""
        });
        assert.equal(plano.chatCreate.clienteNome, "WhatsApp 0000");
    });
});

describe("whatsapp/webhook — decidirAtualizacaoStatus", () => {
    it("aplica delivered normalmente vindo de sent", () => {
        const decisao = webhook.decidirAtualizacaoStatus({
            dadosAtuais: { ownerUid: "owner-1", providerStatus: "sent", chatId: "c1", messageId: "m1" },
            ownerUid: "owner-1",
            evento: { providerStatus: "delivered" }
        });
        assert.equal(decisao.aplicar, true);
        assert.equal(decisao.notificarFalha, false);
    });

    it("não regride read -> delivered", () => {
        const decisao = webhook.decidirAtualizacaoStatus({
            dadosAtuais: { ownerUid: "owner-1", providerStatus: "read", chatId: "c1", messageId: "m1" },
            ownerUid: "owner-1",
            evento: { providerStatus: "delivered" }
        });
        assert.equal(decisao.aplicar, false);
    });

    it("mensagem desconhecida não aplica nada", () => {
        const decisao = webhook.decidirAtualizacaoStatus({ dadosAtuais: null, ownerUid: "owner-1", evento: { providerStatus: "sent" } });
        assert.equal(decisao.aplicar, false);
        assert.equal(decisao.motivo, "mensagem_desconhecida");
    });

    it("status de outro tenant nunca é aplicado", () => {
        const decisao = webhook.decidirAtualizacaoStatus({
            dadosAtuais: { ownerUid: "owner-A", providerStatus: "sent" },
            ownerUid: "owner-B",
            evento: { providerStatus: "delivered" }
        });
        assert.equal(decisao.aplicar, false);
        assert.equal(decisao.motivo, "tenant_diferente");
    });

    it("failed pede notificação; sucesso normal não pede", () => {
        const falha = webhook.decidirAtualizacaoStatus({
            dadosAtuais: { ownerUid: "owner-1", providerStatus: "sent" },
            ownerUid: "owner-1",
            evento: { providerStatus: "failed", codigoErro: "131047", tituloErroSeguro: "Re-engagement message" }
        });
        assert.equal(falha.notificarFalha, true);
        assert.equal(falha.mensagemAtualizacao.failedCode, "131047");

        const sucesso = webhook.decidirAtualizacaoStatus({
            dadosAtuais: { ownerUid: "owner-1", providerStatus: "sent" },
            ownerUid: "owner-1",
            evento: { providerStatus: "delivered" }
        });
        assert.equal(sucesso.notificarFalha, false);
    });
});

describe("whatsapp/send — avaliarConexao", () => {
    it("sem conexão -> NOT_CONNECTED", () => {
        assert.equal(send.avaliarConexao(null).code, ERROR_CODES.NOT_CONNECTED);
    });
    it("revoked/disconnected -> NOT_CONNECTED", () => {
        assert.equal(send.avaliarConexao({ status: "revoked", phoneNumberId: "1" }).code, ERROR_CODES.NOT_CONNECTED);
        assert.equal(send.avaliarConexao({ status: "disconnected", phoneNumberId: "1" }).code, ERROR_CODES.NOT_CONNECTED);
    });
    it("suspended -> TOKEN_REVOKED", () => {
        assert.equal(send.avaliarConexao({ status: "suspended", phoneNumberId: "1" }).code, ERROR_CODES.TOKEN_REVOKED);
    });
    it("connected com phoneNumberId -> ok", () => {
        assert.equal(send.avaliarConexao({ status: "connected", phoneNumberId: "1" }).ok, true);
    });
    it("connected sem phoneNumberId -> NOT_CONNECTED", () => {
        assert.equal(send.avaliarConexao({ status: "connected" }).code, ERROR_CODES.NOT_CONNECTED);
    });
});

describe("whatsapp/send — avaliarTemplate", () => {
    it("template inexistente -> TEMPLATE_REQUIRED", () => {
        assert.equal(send.avaliarTemplate(null, "owner-1").code, ERROR_CODES.TEMPLATE_REQUIRED);
    });
    it("template de outro tenant é rejeitado (nunca cross-tenant)", () => {
        const resultado = send.avaliarTemplate({ ownerUid: "owner-A", status: "APPROVED" }, "owner-B");
        assert.equal(resultado.ok, false);
        assert.equal(resultado.code, "CROSS_TENANT");
    });
    it("template não aprovado -> TEMPLATE_NOT_APPROVED", () => {
        const resultado = send.avaliarTemplate({ ownerUid: "owner-1", status: "PENDING" }, "owner-1");
        assert.equal(resultado.code, ERROR_CODES.TEMPLATE_NOT_APPROVED);
    });
    it("template próprio e aprovado -> ok", () => {
        assert.equal(send.avaliarTemplate({ ownerUid: "owner-1", status: "APPROVED" }, "owner-1").ok, true);
    });
});

describe("whatsapp/send — montarComponentesEnvio", () => {
    it("sem parameterSchema, não envia components", () => {
        assert.deepEqual(send.montarComponentesEnvio({ parameterSchema: [] }, {}), []);
    });
    it("preenche os parâmetros na ordem do schema", () => {
        const componentes = send.montarComponentesEnvio(
            { parameterSchema: [{ name: "1" }, { name: "2" }] },
            { 1: "João", 2: "#123" }
        );
        assert.equal(componentes[0].type, "body");
        assert.deepEqual(componentes[0].parameters.map((p) => p.text), ["João", "#123"]);
    });
});

describe("whatsapp/send — podeVerConexao / podeGerenciarConexao (permissão própria 'whatsapp')", () => {
    it("dono sempre pode ver e gerenciar", () => {
        assert.equal(send.podeVerConexao({ isOwner: true, permissions: {} }), true);
        assert.equal(send.podeGerenciarConexao({ isOwner: true, permissions: {} }), true);
    });
    it("admin sempre pode ver e gerenciar", () => {
        assert.equal(send.podeVerConexao({ isAdmin: true, permissions: {} }), true);
        assert.equal(send.podeGerenciarConexao({ isAdmin: true, permissions: {} }), true);
    });
    it("funcionário com ver 'whatsapp' pode ver, mas não gerenciar", () => {
        assert.equal(send.podeVerConexao({ permissions: { ver: ["whatsapp"], editar: [] } }), true);
        assert.equal(send.podeGerenciarConexao({ permissions: { ver: ["whatsapp"], editar: [] } }), false);
    });
    it("funcionário com editar 'whatsapp' pode ver e gerenciar", () => {
        assert.equal(send.podeVerConexao({ permissions: { ver: [], editar: ["whatsapp"] } }), true);
        assert.equal(send.podeGerenciarConexao({ permissions: { ver: [], editar: ["whatsapp"] } }), true);
    });
    it("permissão de 'atendimento' sozinha NÃO dá mais acesso ao módulo WhatsApp (separação da Fase 4)", () => {
        assert.equal(send.podeVerConexao({ permissions: { ver: ["atendimento"], editar: ["atendimento"] } }), false);
    });
    it("funcionário sem nenhuma permissão não pode ver nem gerenciar", () => {
        assert.equal(send.podeVerConexao({ permissions: { ver: ["produtos"], editar: [] } }), false);
        assert.equal(send.podeGerenciarConexao({ permissions: { ver: ["produtos"], editar: [] } }), false);
    });
});

describe("whatsapp/templates — derivarParameterSchema", () => {
    it("extrai marcadores {{1}}, {{2}} do corpo em ordem", () => {
        const schema = templates.derivarParameterSchema([
            { type: "BODY", text: "Olá {{1}}, seu pedido {{2}} foi atualizado." }
        ]);
        assert.deepEqual(schema.map((c) => c.name), ["1", "2"]);
    });
    it("template sem parâmetros devolve schema vazio", () => {
        assert.deepEqual(templates.derivarParameterSchema([{ type: "BODY", text: "Olá, tudo bem?" }]), []);
    });
    it("sem componente BODY, devolve vazio sem lançar", () => {
        assert.deepEqual(templates.derivarParameterSchema([]), []);
        assert.deepEqual(templates.derivarParameterSchema(undefined), []);
    });
});

describe("whatsapp/index — exporta as 9 Functions esperadas", () => {
    it("exporta exatamente os 9 nomes do contrato (7 da V1 + 2 da Fase 4 multiconexão)", () => {
        const esperado = [
            "whatsappWebhook", "whatsappSendText", "whatsappSendTemplate",
            "whatsappMarkRead", "whatsappSyncTemplates", "whatsappConnectionStatus",
            "whatsappValidateConnection", "whatsappListConnections", "whatsappSetDefaultConnection"
        ];
        assert.deepEqual(Object.keys(whatsappIndex).sort(), esperado.sort());
    });
});

describe("whatsapp/connections — montarListaConexoes (ordenação pura)", () => {
    it("conexão default do modelo novo vem primeiro", () => {
        const naoDefault = { connectionId: "b", isDefault: false };
        const padrao = { connectionId: "a", isDefault: true };
        const lista = connections.montarListaConexoes([naoDefault, padrao], null);
        assert.deepEqual(lista.map((c) => c.connectionId), ["a", "b"]);
    });

    it("conexão legada sempre vai por último, atrás de qualquer conexão nova", () => {
        const nova = { connectionId: "a", isDefault: false };
        const legado = { connectionId: "", legacy: true };
        const lista = connections.montarListaConexoes([nova], legado);
        assert.deepEqual(lista.map((c) => c.legacy || false), [false, true]);
    });

    it("sem nenhuma conexão nova nem legada, devolve lista vazia", () => {
        assert.deepEqual(connections.montarListaConexoes([], null), []);
    });

    it("sem nenhuma conexão nova, só a legada, devolve só ela", () => {
        const legado = { connectionId: "", legacy: true };
        assert.deepEqual(connections.montarListaConexoes([], legado), [legado]);
    });
});

describe("whatsapp/connections — paraResumoSeguro (nunca inclui tokenSecretResource)", () => {
    it("nunca inclui tokenSecretResource nem qualquer campo de segredo no resumo", () => {
        const dados = {
            label: "Principal",
            status: "connected",
            tokenSecretResource: "projects/p/secrets/vide-whatsapp-token-abc",
            isDefault: true
        };
        const resumo = connections.paraResumoSeguro("conn-1", dados);
        assert.equal("tokenSecretResource" in resumo, false);
    });

    it("conexão legada sempre aparece como isDefault:true (é o fallback do resolver)", () => {
        const resumo = connections.paraResumoSeguro("owner-1", { status: "connected" }, { legacy: true });
        assert.equal(resumo.isDefault, true);
        assert.equal(resumo.connectionId, "");
        assert.equal(resumo.legacy, true);
    });
});
