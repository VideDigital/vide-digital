import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    construirHistoricoPublicoParaEnvio,
    criarIaNegocioPublicaController,
    sanitizarPerguntaUI
} from "../ia-negocio-publica.js";

describe("ia-negocio-publica: funções puras", () => {
    it("constrói o histórico limitado, ignorando qualquer autor que não seja visitante/ia", () => {
        const mensagens = [
            { autor: "visitante", texto: "oi" },
            { autor: "ia", texto: "olá" },
            { autor: "sistema", texto: "não deveria ir" }
        ];
        const historico = construirHistoricoPublicoParaEnvio(mensagens);
        assert.equal(historico.length, 2);
        assert.deepEqual(Object.keys(historico[0]).sort(), ["autor", "texto"]);
    });

    it("reusa a mesma sanitização de pergunta de ia-negocio.js", () => {
        assert.equal(sanitizarPerguntaUI("  quais produtos vocês tem?  "), "quais produtos vocês tem?");
    });
});

function criarChamadaFake(resultado) {
    return async (payload) => {
        criarChamadaFake.ultimoPayload = payload;
        if (resultado instanceof Error) throw resultado;
        return resultado;
    };
}

describe("ia-negocio-publica: criarIaNegocioPublicaController", () => {
    it("envia a pergunta com o storeSlug e adiciona a resposta da IA ao histórico", async () => {
        const chamadas = [];
        const controller = criarIaNegocioPublicaController({
            storeSlug: "loja-teste",
            chamarAskPublicBusinessAI: async (payload) => {
                chamadas.push(payload);
                return { resposta: "Temos canecas e camisetas disponíveis." };
            }
        });
        const resultado = await controller.enviarPergunta("quais produtos vocês tem?");
        assert.equal(resultado.resposta, "Temos canecas e camisetas disponíveis.");
        assert.equal(controller.state.mensagens.length, 2);
        assert.equal(controller.state.mensagens[0].autor, "visitante");
        assert.equal(controller.state.mensagens[1].autor, "ia");
        assert.equal(chamadas[0].storeSlug, "loja-teste");
        assert.equal(chamadas[0].pergunta, "quais produtos vocês tem?");
    });

    it("nega o envio sem storeSlug, sem chamar a Cloud Function", async () => {
        const notificacoes = [];
        const controller = criarIaNegocioPublicaController({
            storeSlug: "",
            chamarAskPublicBusinessAI: async () => { throw new Error("não deveria chamar"); },
            notify: (msg, tipo) => notificacoes.push({ msg, tipo })
        });
        const resultado = await controller.enviarPergunta("oi");
        assert.equal(resultado, null);
        assert.equal(notificacoes.length, 1);
        assert.equal(notificacoes[0].tipo, "error");
        assert.equal(controller.state.mensagens.length, 0);
    });

    it("trata erro da Cloud Function com a mensagem real (failed-precondition: assistente indisponível)", async () => {
        const notificacoes = [];
        const controller = criarIaNegocioPublicaController({
            storeSlug: "loja-teste",
            chamarAskPublicBusinessAI: async () => {
                const erro = new Error("A assistente não está disponível para esta loja no momento.");
                erro.code = "functions/failed-precondition";
                throw erro;
            },
            notify: (msg, tipo) => notificacoes.push({ msg, tipo })
        });
        const resultado = await controller.enviarPergunta("oi");
        assert.equal(resultado, null);
        assert.equal(controller.state.erro, "A assistente não está disponível para esta loja no momento.");
        assert.equal(notificacoes[0].tipo, "error");
    });

    it("definirOuvinte dispara no instante em que 'enviando' vira true, antes da resposta chegar", async () => {
        let resolverChamada;
        const estadosNoOuvinte = [];
        const controller = criarIaNegocioPublicaController({
            storeSlug: "loja-teste",
            chamarAskPublicBusinessAI: () => new Promise((resolve) => { resolverChamada = resolve; })
        });
        controller.definirOuvinte(() => {
            estadosNoOuvinte.push({ enviando: controller.state.enviando, mensagens: controller.state.mensagens.length });
        });

        const promessa = controller.enviarPergunta("oi");
        assert.equal(estadosNoOuvinte.length, 1);
        assert.equal(estadosNoOuvinte[0].enviando, true);
        assert.equal(estadosNoOuvinte[0].mensagens, 1);

        resolverChamada({ resposta: "ok" });
        await promessa;
    });

    it("limparConversa esvazia o histórico", async () => {
        const controller = criarIaNegocioPublicaController({
            storeSlug: "loja-teste",
            chamarAskPublicBusinessAI: async () => ({ resposta: "ok" })
        });
        await controller.enviarPergunta("oi");
        assert.ok(controller.state.mensagens.length > 0);
        controller.limparConversa();
        assert.equal(controller.state.mensagens.length, 0);
    });

    it("ignora chamadas concorrentes enquanto já está enviando", async () => {
        let resolverChamada;
        const controller = criarIaNegocioPublicaController({
            storeSlug: "loja-teste",
            chamarAskPublicBusinessAI: () => new Promise((resolve) => { resolverChamada = resolve; })
        });
        const primeira = controller.enviarPergunta("primeira pergunta");
        const segunda = await controller.enviarPergunta("segunda pergunta");
        assert.equal(segunda, null);
        resolverChamada({ resposta: "ok" });
        await primeira;
    });
});
