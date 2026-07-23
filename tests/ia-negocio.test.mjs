import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    LIMITES_IA_NEGOCIO_UI,
    construirHistoricoParaEnvio,
    criarIaNegocioController,
    planoTemIaReal,
    sanitizarPerguntaUI
} from "../ia-negocio.js";

describe("ia-negocio: funções puras", () => {
    it("planoTemIaReal reconhece só planos Pro ou superiores", () => {
        assert.equal(planoTemIaReal("pro"), true);
        assert.equal(planoTemIaReal("PROPLUS"), true);
        assert.equal(planoTemIaReal("starter"), false);
        assert.equal(planoTemIaReal(""), false);
    });

    it("sanitiza e trunca a pergunta", () => {
        assert.equal(sanitizarPerguntaUI("  quais   produtos vendem mais?  "), "quais produtos vendem mais?");
        const longa = "a".repeat(2000);
        assert.equal(sanitizarPerguntaUI(longa).length, LIMITES_IA_NEGOCIO_UI.maxCaracteresPergunta);
    });

    it("constrói o histórico limitado no formato esperado pela Cloud Function", () => {
        const mensagens = Array.from({ length: 20 }, (_, i) => ({
            autor: i % 2 === 0 ? "dono" : "ia",
            texto: `msg ${i}`,
            quando: i
        }));
        const historico = construirHistoricoParaEnvio(mensagens);
        assert.ok(historico.length <= LIMITES_IA_NEGOCIO_UI.maxHistoricoEnviado);
        assert.deepEqual(Object.keys(historico[0]).sort(), ["autor", "texto"]);
        assert.equal(historico.at(-1).texto, "msg 19");
    });

    it("ignora mensagens de sistema/erro ao montar o histórico", () => {
        const historico = construirHistoricoParaEnvio([
            { autor: "dono", texto: "oi" },
            { autor: "sistema", texto: "não deveria ir" }
        ]);
        assert.equal(historico.length, 1);
    });
});

function criarContextFake({ active = true, canEdit = true, plan = "pro" } = {}) {
    return {
        getSnapshot: () => ({ active, plan }),
        canEdit: () => canEdit
    };
}

describe("ia-negocio: criarIaNegocioController", () => {
    it("nega o envio quando o plano não tem IA real", async () => {
        const notificacoes = [];
        const controller = criarIaNegocioController({
            context: criarContextFake({ plan: "starter" }),
            chamarAskBusinessAI: async () => { throw new Error("não deveria chamar"); },
            notify: (msg, tipo) => notificacoes.push({ msg, tipo })
        });
        const resultado = await controller.enviarPergunta("quais meus produtos mais vendidos?");
        assert.equal(resultado, null);
        assert.equal(notificacoes.length, 1);
        assert.equal(notificacoes[0].tipo, "error");
        assert.equal(controller.state.mensagens.length, 0);
    });

    it("nega quando o funcionário não tem permissão de editar central-ia", async () => {
        const controller = criarIaNegocioController({
            context: criarContextFake({ canEdit: false }),
            chamarAskBusinessAI: async () => { throw new Error("não deveria chamar"); },
            notify: () => {}
        });
        const resultado = await controller.enviarPergunta("oi");
        assert.equal(resultado, null);
    });

    it("envia a pergunta, adiciona a resposta da IA e atualiza o restante do mês", async () => {
        const chamadas = [];
        const controller = criarIaNegocioController({
            context: criarContextFake(),
            chamarAskBusinessAI: async (payload) => {
                chamadas.push(payload);
                return { resposta: "Seu produto mais vendido é a Caneca.", restanteNoMes: 199 };
            }
        });
        const resultado = await controller.enviarPergunta("qual meu produto mais vendido?");
        assert.equal(resultado.resposta, "Seu produto mais vendido é a Caneca.");
        assert.equal(controller.state.mensagens.length, 2);
        assert.equal(controller.state.mensagens[0].autor, "dono");
        assert.equal(controller.state.mensagens[1].autor, "ia");
        assert.equal(controller.state.restanteNoMes, 199);
        assert.equal(chamadas[0].pergunta, "qual meu produto mais vendido?");
    });

    it("trata erro da Cloud Function com mensagem amigável e mantém a pergunta no histórico", async () => {
        const notificacoes = [];
        const controller = criarIaNegocioController({
            context: criarContextFake(),
            chamarAskBusinessAI: async () => {
                const erro = new Error("Limite mensal atingido.");
                erro.code = "functions/resource-exhausted";
                throw erro;
            },
            notify: (msg, tipo) => notificacoes.push({ msg, tipo })
        });
        const resultado = await controller.enviarPergunta("oi");
        assert.equal(resultado, null);
        assert.equal(controller.state.mensagens.length, 1);
        assert.equal(controller.state.erro, "Limite mensal atingido.");
        assert.equal(notificacoes[0].tipo, "error");
    });

    it("definirOuvinte dispara no instante em que 'enviando' vira true, antes da resposta chegar", async () => {
        let resolverChamada;
        const estadosNoOuvinte = [];
        const controller = criarIaNegocioController({
            context: criarContextFake(),
            chamarAskBusinessAI: () => new Promise((resolve) => { resolverChamada = resolve; })
        });
        controller.definirOuvinte(() => {
            estadosNoOuvinte.push({ enviando: controller.state.enviando, mensagens: controller.state.mensagens.length });
        });

        const promessa = controller.enviarPergunta("oi");
        // Nesse ponto a Cloud Function ainda não respondeu (a Promise segue pendente),
        // mas o ouvinte já deve ter disparado com o estado "enviando".
        assert.equal(estadosNoOuvinte.length, 1);
        assert.equal(estadosNoOuvinte[0].enviando, true);
        assert.equal(estadosNoOuvinte[0].mensagens, 1);

        resolverChamada({ resposta: "ok", restanteNoMes: 100 });
        await promessa;
    });

    it("limparConversa esvazia o histórico", async () => {
        const controller = criarIaNegocioController({
            context: criarContextFake(),
            chamarAskBusinessAI: async () => ({ resposta: "ok", restanteNoMes: 100 })
        });
        await controller.enviarPergunta("oi");
        assert.ok(controller.state.mensagens.length > 0);
        controller.limparConversa();
        assert.equal(controller.state.mensagens.length, 0);
    });
});
