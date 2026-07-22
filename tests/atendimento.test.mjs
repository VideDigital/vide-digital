import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    CATEGORIAS_EVENTO_ATENDIMENTO,
    CATEGORIAS_TEMPLATE,
    LIMITES_TIMELINE_ATENDIMENTO,
    STATUS_CONVERSA,
    TIPOS_EVENTO_ATENDIMENTO,
    VARIAVEIS_TEMPLATE_PERMITIDAS,
    calcularContadoresAtendimento,
    calcularMetricasAtendimento,
    categoriaEventoAtendimento,
    classificarEventoAtribuicao,
    classificarEventoStatus,
    conversaEstaPriorizada,
    descreverEventoAtendimento,
    conversaPrecisaResposta,
    filtrarConversas,
    filtrarTemplates,
    funcionarioPodeAtender,
    funcionariosElegiveisAtendimento,
    iniciaisNome,
    mesclarDocumentosTimeline,
    mesclarItensTimeline,
    ordenarConversas,
    podeTransicionarStatus,
    substituirVariaveisTemplate,
    tipoEventoValido,
    validarPayloadDadosEvento,
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

describe("histórico de eventos: enum e categorias", () => {
    it("todo tipo declarado tem rótulo e categoria conhecida", () => {
        for (const tipo of Object.keys(TIPOS_EVENTO_ATENDIMENTO)) {
            assert.equal(typeof TIPOS_EVENTO_ATENDIMENTO[tipo], "string");
            assert.ok(categoriaEventoAtendimento(tipo) in CATEGORIAS_EVENTO_ATENDIMENTO, tipo);
        }
    });

    it("tipoEventoValido rejeita string fora do enum", () => {
        assert.equal(tipoEventoValido("conversa_criada"), true);
        assert.equal(tipoEventoValido("evento_inventado"), false);
        assert.equal(tipoEventoValido(""), false);
    });

    it("categorias batem com o agrupamento esperado pelo filtro da timeline", () => {
        assert.equal(categoriaEventoAtendimento("mensagem_equipe_enviada"), "mensagens");
        assert.equal(categoriaEventoAtendimento("conversa_transferida"), "atendimento");
        assert.equal(categoriaEventoAtendimento("lead_vinculado"), "vinculos");
        assert.equal(categoriaEventoAtendimento("tag_adicionada"), "alteracoes");
    });
});

describe("histórico de eventos: payload de dados restrito", () => {
    it("aceita objeto vazio, undefined ou com chaves conhecidas", () => {
        assert.equal(validarPayloadDadosEvento(undefined), "");
        assert.equal(validarPayloadDadosEvento(null), "");
        assert.equal(validarPayloadDadosEvento({ motivo: "cliente pediu" }), "");
    });

    it("rejeita chave desconhecida, array, tipo errado e payload grande demais", () => {
        assert.notEqual(validarPayloadDadosEvento({ senha: "123" }), "");
        assert.notEqual(validarPayloadDadosEvento([1, 2, 3]), "");
        assert.notEqual(validarPayloadDadosEvento("texto"), "");
        assert.notEqual(validarPayloadDadosEvento({ detalhe: "x".repeat(600) }), "");
    });

    it("rejeita objeto com chaves demais mesmo que todas sejam conhecidas", () => {
        const grande = { quantidade: 1, motivo: "a", canal: "b", duracaoMs: 1, origemDispositivo: "c", detalhe: "d" };
        assert.equal(validarPayloadDadosEvento(grande), "");
        assert.notEqual(validarPayloadDadosEvento({ ...grande, extra: "não existe" }), "");
    });
});

describe("histórico de eventos: classificação de atribuição (assumir/atribuir/transferir/remover)", () => {
    it("sem responsável anterior e autor assume para si mesmo: conversa_assumida", () => {
        assert.equal(classificarEventoAtribuicao({ anteriorUid: "", novoUid: "u1", autorUid: "u1" }), "conversa_assumida");
    });

    it("sem responsável anterior e autor atribui a outra pessoa: responsavel_atribuido", () => {
        assert.equal(classificarEventoAtribuicao({ anteriorUid: "", novoUid: "func1", autorUid: "owner" }), "responsavel_atribuido");
    });

    it("responsável muda de uma pessoa pra outra: conversa_transferida (nunca soma outro evento)", () => {
        assert.equal(classificarEventoAtribuicao({ anteriorUid: "func1", novoUid: "func2", autorUid: "owner" }), "conversa_transferida");
    });

    it("novo responsável vazio: responsavel_removido", () => {
        assert.equal(classificarEventoAtribuicao({ anteriorUid: "func1", novoUid: "", autorUid: "owner" }), "responsavel_removido");
    });

    it("sem mudança real, não classifica nada (null = não gerar evento)", () => {
        assert.equal(classificarEventoAtribuicao({ anteriorUid: "func1", novoUid: "func1", autorUid: "owner" }), null);
        assert.equal(classificarEventoAtribuicao({ anteriorUid: "", novoUid: "", autorUid: "owner" }), null);
    });
});

describe("histórico de eventos: classificação de transição de status", () => {
    it("nova/aguardando_cliente/aguardando_equipe/resolvida/arquivada mapeiam pra eventos específicos", () => {
        assert.equal(classificarEventoStatus({ statusAnterior: "nova", statusNovo: "aberta" }), "conversa_aberta");
        assert.equal(classificarEventoStatus({ statusAnterior: "aberta", statusNovo: "aguardando_cliente" }), "aguardando_cliente");
        assert.equal(classificarEventoStatus({ statusAnterior: "aguardando_cliente", statusNovo: "aguardando_equipe" }), "aguardando_equipe");
        assert.equal(classificarEventoStatus({ statusAnterior: "aberta", statusNovo: "resolvida" }), "conversa_resolvida");
        assert.equal(classificarEventoStatus({ statusAnterior: "resolvida", statusNovo: "arquivada" }), "conversa_arquivada");
    });

    it("reabrir depois de resolvida é conversa_reaberta; restaurar depois de arquivada é conversa_restaurada (nunca os dois iguais)", () => {
        assert.equal(classificarEventoStatus({ statusAnterior: "resolvida", statusNovo: "aberta" }), "conversa_reaberta");
        assert.equal(classificarEventoStatus({ statusAnterior: "arquivada", statusNovo: "aberta" }), "conversa_restaurada");
        assert.notEqual(
            classificarEventoStatus({ statusAnterior: "resolvida", statusNovo: "aberta" }),
            classificarEventoStatus({ statusAnterior: "arquivada", statusNovo: "aberta" })
        );
    });

    it("sem mudança real não classifica nada", () => {
        assert.equal(classificarEventoStatus({ statusAnterior: "aberta", statusNovo: "aberta" }), null);
    });
});

function eventoFixture(overrides = {}) {
    return { tipo: "mensagem_cliente_recebida", criadoEm: Date.now(), ...overrides };
}

describe("métricas de atendimento derivadas do histórico de eventos", () => {
    it("calcula primeira mensagem do cliente, primeira resposta e tempo entre elas", () => {
        const eventos = [
            eventoFixture({ tipo: "conversa_criada", criadoEm: 1000 }),
            eventoFixture({ tipo: "mensagem_cliente_recebida", criadoEm: 2000 }),
            eventoFixture({ tipo: "mensagem_equipe_enviada", criadoEm: 5000 })
        ];
        const metricas = calcularMetricasAtendimento(eventos);
        assert.equal(metricas.primeiraMensagemClienteEm, 2000);
        assert.equal(metricas.primeiraRespostaEquipeEm, 5000);
        assert.equal(metricas.primeiraRespostaMs, 3000);
    });

    it("sem mensagem do cliente ainda, tempo de primeira resposta fica nulo", () => {
        const metricas = calcularMetricasAtendimento([eventoFixture({ tipo: "mensagem_equipe_enviada", criadoEm: 5000 })]);
        assert.equal(metricas.primeiraMensagemClienteEm, null);
        assert.equal(metricas.primeiraRespostaMs, null);
    });

    it("resolvidaEm usa a resolução MAIS RECENTE (conversa pode reabrir e resolver de novo)", () => {
        const eventos = [
            eventoFixture({ tipo: "conversa_resolvida", criadoEm: 3000 }),
            eventoFixture({ tipo: "conversa_reaberta", criadoEm: 4000 }),
            eventoFixture({ tipo: "conversa_resolvida", criadoEm: 9000 })
        ];
        assert.equal(calcularMetricasAtendimento(eventos).resolvidaEm, 9000);
    });

    it("conta transferências, reaberturas (reaberta + restaurada) e mensagens de cada lado", () => {
        const eventos = [
            eventoFixture({ tipo: "conversa_transferida" }),
            eventoFixture({ tipo: "conversa_transferida" }),
            eventoFixture({ tipo: "conversa_reaberta" }),
            eventoFixture({ tipo: "conversa_restaurada" }),
            eventoFixture({ tipo: "mensagem_cliente_recebida" }),
            eventoFixture({ tipo: "mensagem_cliente_recebida" }),
            eventoFixture({ tipo: "mensagem_equipe_enviada" }),
            eventoFixture({ tipo: "template_utilizado" })
        ];
        const metricas = calcularMetricasAtendimento(eventos);
        assert.equal(metricas.quantidadeTransferencias, 2);
        assert.equal(metricas.quantidadeReaberturas, 2);
        assert.equal(metricas.quantidadeMensagensCliente, 2);
        assert.equal(metricas.quantidadeMensagensEquipe, 1);
        assert.equal(metricas.templatesUtilizados, 1);
    });

    it("lida com lista vazia sem lançar erro", () => {
        const metricas = calcularMetricasAtendimento([]);
        assert.equal(metricas.primeiraMensagemClienteEm, null);
        assert.equal(metricas.quantidadeTransferencias, 0);
    });
});

describe("prioridade derivada do último evento (sem campo próprio no chat)", () => {
    it("sem nenhum evento de prioridade, não está priorizada", () => {
        assert.equal(conversaEstaPriorizada([]), false);
    });

    it("último evento decide o estado, mesmo fora de ordem na lista", () => {
        const eventos = [
            eventoFixture({ tipo: "prioridade_removida", criadoEm: 5000 }),
            eventoFixture({ tipo: "conversa_priorizada", criadoEm: 1000 })
        ];
        // Mesmo com "removida" vindo primeiro na lista, o mais RECENTE
        // (criadoEm maior) é quem decide — aqui é a remoção (5000 > 1000).
        assert.equal(conversaEstaPriorizada(eventos), false);
    });

    it("marcar depois de remover deixa priorizada", () => {
        const eventos = [
            eventoFixture({ tipo: "prioridade_removida", criadoEm: 1000 }),
            eventoFixture({ tipo: "conversa_priorizada", criadoEm: 5000 })
        ];
        assert.equal(conversaEstaPriorizada(eventos), true);
    });
});

describe("descrição legível do evento (sem identificador técnico)", () => {
    it("nunca inclui id técnico na frase (só nome de autor e rótulos conhecidos)", () => {
        const frase = descreverEventoAtendimento(eventoFixture({
            tipo: "conversa_transferida", autorNome: "Maria S",
            responsavelAnteriorNome: "João C", responsavelNovoNome: "Ana P"
        }));
        assert.equal(frase, "Maria S transferiu a conversa de João C para Ana P.");
        assert.doesNotMatch(frase, /[a-zA-Z0-9]{15,}/);
    });

    it("monta as frases de exemplo do escopo", () => {
        assert.equal(descreverEventoAtendimento(eventoFixture({ tipo: "conversa_assumida", autorNome: "João C" })), "João C assumiu esta conversa.");
        assert.equal(descreverEventoAtendimento(eventoFixture({ tipo: "conversa_resolvida", autorNome: "João C" })), "Conversa resolvida por João C.");
        assert.equal(
            descreverEventoAtendimento(eventoFixture({ tipo: "template_utilizado", autorNome: "João C", templateTitulo: "Prazo de entrega" })),
            'Template "Prazo de entrega" utilizado por João C.'
        );
        assert.equal(
            descreverEventoAtendimento(eventoFixture({ tipo: "status_alterado", statusAnterior: "aberta", statusNovo: "aguardando_cliente" })),
            "Status alterado de Aberta para Aguardando cliente."
        );
    });

    it("todo tipo do enum tem uma descrição não vazia (nunca cai só no fallback silencioso)", () => {
        for (const tipo of Object.keys(TIPOS_EVENTO_ATENDIMENTO)) {
            const frase = descreverEventoAtendimento(eventoFixture({ tipo, autorNome: "Alguém" }));
            assert.ok(frase && frase.length > 0, tipo);
        }
    });
});

describe("timeline paginada de atendimento", () => {
    it("usa uma janela inicial menor e razoável para mensagens e eventos", () => {
        assert.equal(LIMITES_TIMELINE_ATENDIMENTO.paginaMensagens, 50);
        assert.equal(LIMITES_TIMELINE_ATENDIMENTO.paginaEventos, 50);
    });

    it("deduplica documentos por id ao mesclar listener recente com páginas antigas", () => {
        const resultado = mesclarDocumentosTimeline(
            [{ id: "m1", texto: "antigo" }, { id: "m2", texto: "mantém" }],
            [{ id: "m1", texto: "atualizado" }, { id: "m3", texto: "novo" }]
        );
        assert.deepEqual(resultado.map(item => [item.id, item.texto]), [
            ["m1", "atualizado"],
            ["m2", "mantém"],
            ["m3", "novo"]
        ]);
    });

    it("mescla mensagens e eventos em ordem cronológica crescente", () => {
        const itens = mesclarItensTimeline({
            mensagens: [
                { id: "m2", timestamp: 3000 },
                { id: "m1", timestamp: 1000 }
            ],
            eventos: [
                { id: "e1", tipo: "conversa_aberta", criadoEm: { seconds: 2 } }
            ]
        });
        assert.deepEqual(itens.map(item => `${item.tipoItem}:${item.dado.id}`), [
            "mensagem:m1",
            "evento:e1",
            "mensagem:m2"
        ]);
    });

    it("respeita toggle e filtro de categoria sem apagar dados carregados", () => {
        const eventos = [
            { id: "e1", tipo: "conversa_aberta", criadoEm: 1000 },
            { id: "e2", tipo: "lead_vinculado", criadoEm: 2000 }
        ];
        assert.deepEqual(
            mesclarItensTimeline({ eventos, filtroCategoria: "vinculos" }).map(item => item.dado.id),
            ["e2"]
        );
        assert.deepEqual(
            mesclarItensTimeline({ eventos, mostrarEventos: false }).map(item => item.dado.id),
            []
        );
    });
});
