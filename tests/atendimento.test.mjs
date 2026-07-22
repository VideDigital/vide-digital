import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    CATEGORIAS_TEMPLATE,
    STATUS_CONVERSA,
    VARIAVEIS_TEMPLATE_PERMITIDAS,
    calcularContadoresAtendimento,
    conversaPrecisaResposta,
    filtrarConversas,
    filtrarTemplates,
    funcionarioPodeAtender,
    funcionariosElegiveisAtendimento,
    iniciaisNome,
    ordenarConversas,
    podeTransicionarStatus,
    substituirVariaveisTemplate,
    validarTemplateAtendimento
} from "../atendimento.js";

describe("transições de status da conversa", () => {
    it("aceita as transições declaradas no fluxo de atendimento", () => {
        assert.equal(podeTransicionarStatus("nova", "aberta"), true);
        assert.equal(podeTransicionarStatus("aberta", "aguardando_cliente"), true);
        assert.equal(podeTransicionarStatus("aberta", "aguardando_equipe"), true);
        assert.equal(podeTransicionarStatus("aguardando_equipe", "aguardando_cliente"), true);
        assert.equal(podeTransicionarStatus("aguardando_cliente", "aguardando_equipe"), true);
        assert.equal(podeTransicionarStatus("resolvida", "aberta"), true);
        assert.equal(podeTransicionarStatus("arquivada", "aberta"), true);
    });

    it("rejeita transições fora do fluxo", () => {
        assert.equal(podeTransicionarStatus("nova", "resolvida"), false);
        assert.equal(podeTransicionarStatus("arquivada", "aguardando_cliente"), false);
        assert.equal(podeTransicionarStatus("resolvida", "nova"), false);
    });

    it("rejeita status desconhecido e transição pro mesmo estado", () => {
        assert.equal(podeTransicionarStatus("aberta", "inexistente"), false);
        assert.equal(podeTransicionarStatus("aberta", "aberta"), false);
    });

    it("todo status declarado tem rótulo", () => {
        for (const status of Object.keys(STATUS_CONVERSA)) {
            assert.equal(typeof STATUS_CONVERSA[status], "string");
        }
    });
});

describe("variáveis de template (whitelist)", () => {
    it("substitui só as variáveis permitidas", () => {
        const resultado = substituirVariaveisTemplate(
            "Olá {{nome_cliente}}, aqui é {{nome_funcionario}} da {{nome_loja}}. Pedido {{numero_pedido}}.",
            { nome_cliente: "Maria", nome_funcionario: "João", nome_loja: "Loja X", numero_pedido: "123" }
        );
        assert.equal(resultado, "Olá Maria, aqui é João da Loja X. Pedido 123.");
    });

    it("mantém o placeholder original se a variável não veio preenchida", () => {
        const resultado = substituirVariaveisTemplate("Olá {{nome_cliente}}!", {});
        assert.equal(resultado, "Olá {{nome_cliente}}!");
    });

    it("não substitui variável fora da whitelist (nem executa nada)", () => {
        const resultado = substituirVariaveisTemplate("{{variavel_invasora}} {{nome_cliente}}", { nome_cliente: "Ana", variavel_invasora: "hackeado" });
        assert.equal(resultado, "{{variavel_invasora}} Ana");
    });

    it("não interpreta HTML nem código dentro do valor substituído", () => {
        const resultado = substituirVariaveisTemplate("Olá {{nome_cliente}}", { nome_cliente: "<script>alert(1)</script>" });
        assert.equal(resultado, "Olá <script>alert(1)</script>");
        assert.equal(typeof resultado, "string");
    });

    it("a whitelist tem exatamente as 4 variáveis definidas pelo escopo", () => {
        assert.deepEqual([...VARIAVEIS_TEMPLATE_PERMITIDAS].sort(), ["nome_cliente", "nome_funcionario", "nome_loja", "numero_pedido"].sort());
    });
});

function templateValido(overrides = {}) {
    return {
        titulo: "Saudação inicial",
        mensagem: "Olá {{nome_cliente}}, tudo bem?",
        categoria: "saudacao",
        atalho: "ola",
        ativo: true,
        ...overrides
    };
}

describe("validação de template de atendimento", () => {
    it("aceita um template completo e válido", () => {
        assert.equal(validarTemplateAtendimento(templateValido()), "");
    });

    it("rejeita título e mensagem vazios", () => {
        assert.notEqual(validarTemplateAtendimento(templateValido({ titulo: "" })), "");
        assert.notEqual(validarTemplateAtendimento(templateValido({ mensagem: "   " })), "");
    });

    it("rejeita categoria fora do vocabulário fechado", () => {
        assert.notEqual(validarTemplateAtendimento(templateValido({ categoria: "outra" })), "");
    });

    it("todas as categorias declaradas são aceitas", () => {
        for (const categoria of Object.keys(CATEGORIAS_TEMPLATE)) {
            assert.equal(validarTemplateAtendimento(templateValido({ categoria })), "", categoria);
        }
    });

    it("rejeita mensagem acima do limite", () => {
        assert.notEqual(validarTemplateAtendimento(templateValido({ mensagem: "x".repeat(2001) })), "");
    });
});

describe("filtro de templates", () => {
    const templates = [
        templateValido({ titulo: "Saudação", categoria: "saudacao", ativo: true }),
        templateValido({ titulo: "Orçamento padrão", categoria: "orcamento", ativo: true }),
        templateValido({ titulo: "Encerramento antigo", categoria: "encerramento", ativo: false })
    ];

    it("filtra por categoria", () => {
        assert.equal(filtrarTemplates(templates, { categoria: "orcamento" }).length, 1);
    });

    it("filtra por busca no título", () => {
        assert.equal(filtrarTemplates(templates, { busca: "saudação" }).length, 1);
    });

    it("filtra apenas ativos quando solicitado", () => {
        assert.equal(filtrarTemplates(templates, { apenasAtivos: true }).length, 2);
    });
});

function conversaFixture(overrides = {}) {
    return {
        id: "c1",
        clienteNome: "Cliente Teste",
        status: "aberta",
        canal: "loja_publica",
        ultimaMensagem: "Olá",
        atualizadoEm: Date.now(),
        naoLidasLoja: 0,
        atribuidoPara: "",
        ...overrides
    };
}

describe("filtro e ordenação de conversas", () => {
    it("filtra por status, canal, minhas conversas e sem responsável", () => {
        const conversas = [
            conversaFixture({ id: "c1", status: "nova", atribuidoPara: "" }),
            conversaFixture({ id: "c2", status: "aberta", atribuidoPara: "func1" }),
            conversaFixture({ id: "c3", status: "resolvida", atribuidoPara: "func2" })
        ];
        assert.equal(filtrarConversas(conversas, { status: "nova" }).length, 1);
        assert.equal(filtrarConversas(conversas, { apenasSemResponsavel: true }).length, 1);
        assert.equal(filtrarConversas(conversas, { apenasMinhas: true, authUid: "func1" }).length, 1);
    });

    it("filtra por busca no nome do cliente", () => {
        const conversas = [conversaFixture({ clienteNome: "Maria Silva" }), conversaFixture({ id: "c2", clienteNome: "João Souza" })];
        assert.equal(filtrarConversas(conversas, { busca: "maria" }).length, 1);
    });

    it("ordena por mais recente primeiro", () => {
        const conversas = [
            conversaFixture({ id: "antiga", atualizadoEm: 1000 }),
            conversaFixture({ id: "nova", atualizadoEm: 5000 })
        ];
        const ordenadas = ordenarConversas(conversas);
        assert.equal(ordenadas[0].id, "nova");
    });
});

describe("contadores do topo da Central de Atendimento", () => {
    it("calcula novas, abertas, não lidas, aguardando equipe, minhas e resolvidas hoje", () => {
        const agora = Date.now();
        const conversas = [
            conversaFixture({ id: "1", status: "nova" }),
            conversaFixture({ id: "2", status: "aberta" }),
            conversaFixture({ id: "3", status: "aguardando_equipe" }),
            conversaFixture({ id: "4", naoLidasLoja: 2 }),
            conversaFixture({ id: "5", atribuidoPara: "meuUid" }),
            conversaFixture({ id: "6", status: "resolvida", statusAtualizadoEm: agora })
        ];
        const contadores = calcularContadoresAtendimento(conversas, { authUid: "meuUid" });
        assert.equal(contadores.novas, 1);
        assert.equal(contadores.abertas, 3);
        assert.equal(contadores.aguardandoEquipe, 1);
        assert.equal(contadores.naoLidas, 1);
        assert.equal(contadores.minhasConversas, 1);
        assert.equal(contadores.resolvidasHoje, 1);
    });
});

describe("elegibilidade de atribuição de funcionário", () => {
    it("aceita funcionário ativo com permissão em atendimento ou leads", () => {
        assert.equal(funcionarioPodeAtender({ status: "ativo", permissoes: { ver: ["atendimento"], editar: [] } }), true);
        assert.equal(funcionarioPodeAtender({ status: "ativo", permissoes: { ver: [], editar: ["leads"] } }), true);
    });

    it("rejeita funcionário inativo, sem permissão ou inexistente", () => {
        assert.equal(funcionarioPodeAtender({ status: "inativo", permissoes: { ver: ["atendimento"], editar: [] } }), false);
        assert.equal(funcionarioPodeAtender({ status: "ativo", permissoes: { ver: ["produtos"], editar: [] } }), false);
        assert.equal(funcionarioPodeAtender(null), false);
        assert.equal(funcionarioPodeAtender(undefined), false);
    });

    it("filtra a lista de funcionários elegíveis", () => {
        const funcionarios = [
            { id: "f1", status: "ativo", permissoes: { ver: ["atendimento"], editar: [] } },
            { id: "f2", status: "inativo", permissoes: { ver: ["atendimento"], editar: [] } },
            { id: "f3", status: "ativo", permissoes: { ver: ["produtos"], editar: [] } }
        ];
        const elegiveis = funcionariosElegiveisAtendimento(funcionarios);
        assert.deepEqual(elegiveis.map(f => f.id), ["f1"]);
    });
});

describe("indicador de conversa que precisa de resposta", () => {
    it("marca conversa nova, aguardando equipe ou com não lidas", () => {
        assert.equal(conversaPrecisaResposta(conversaFixture({ status: "nova" })), true);
        assert.equal(conversaPrecisaResposta(conversaFixture({ status: "aguardando_equipe" })), true);
        assert.equal(conversaPrecisaResposta(conversaFixture({ status: "aberta", naoLidasLoja: 1 })), true);
    });

    it("não marca conversa aberta sem pendência ou resolvida", () => {
        assert.equal(conversaPrecisaResposta(conversaFixture({ status: "aberta", naoLidasLoja: 0 })), false);
        assert.equal(conversaPrecisaResposta(conversaFixture({ status: "resolvida" })), false);
    });
});

describe("iniciais do nome do cliente (avatar)", () => {
    it("gera iniciais a partir de nome completo e nome único", () => {
        assert.equal(iniciaisNome("Maria Silva"), "MS");
        assert.equal(iniciaisNome("Maria"), "MA");
        assert.equal(iniciaisNome(""), "?");
        assert.equal(iniciaisNome(null), "?");
    });
});
