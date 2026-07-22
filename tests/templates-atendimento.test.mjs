import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    CATEGORIAS_TEMPLATE_ATENDIMENTO,
    LIMITES_TEMPLATE_ATENDIMENTO,
    VARIAVEIS_TEMPLATE_ATENDIMENTO,
    ROTULO_STATUS_PEDIDO,
    categoriaTemplateAtendimento,
    rotuloCategoriaTemplate,
    substituirVariaveisTemplate,
    variaveisUsadasNoTexto,
    contemVariavelNaoResolvida,
    valoresDePedido,
    resolverVariaveisTemplate,
    pedidoVinculadoIdDaConversa,
    normalizarAtalho,
    validarTemplateAtendimentoAvancado,
    templateVisivelNoAtendimento,
    filtrarTemplatesAtendimento,
    ordenarTemplatesAtendimento,
    templatesRecentementeUsados,
    templatesMaisUsados,
    sugerirTemplatesPorAtalho,
    atalhoJaEmUso
} from "../templates-atendimento.js";

function templateFixture(overrides = {}) {
    return {
        id: "tpl1",
        titulo: "Saudação inicial",
        mensagem: "Olá {{nome_cliente}}, tudo bem?",
        categoria: "saudacao",
        atalho: "ola",
        ativo: true,
        favorito: false,
        usoTotal: 0,
        ...overrides
    };
}

describe("categorias fechadas de template de atendimento", () => {
    it("tem exatamente as 12 categorias do mandato", () => {
        assert.deepEqual(Object.keys(CATEGORIAS_TEMPLATE_ATENDIMENTO).sort(), [
            "acompanhamento", "encerramento", "entrega", "indisponibilidade", "orcamento",
            "pagamento", "personalizada", "pedido", "pos_venda", "prazo", "saudacao", "suporte"
        ].sort());
    });

    it("categoria conhecida mantém o próprio valor", () => {
        assert.equal(categoriaTemplateAtendimento("prazo"), "prazo");
    });

    it("categoria desconhecida (incluindo o vocabulário do módulo genérico Templates) cai em personalizada — nunca quebra a listagem", () => {
        assert.equal(categoriaTemplateAtendimento("vendas"), "personalizada");
        assert.equal(categoriaTemplateAtendimento("followup"), "personalizada");
        assert.equal(categoriaTemplateAtendimento(undefined), "personalizada");
        assert.equal(categoriaTemplateAtendimento(""), "personalizada");
    });

    it("rótulo em português, nunca o slug técnico", () => {
        assert.equal(rotuloCategoriaTemplate("pos_venda"), "Pós-venda");
        assert.equal(rotuloCategoriaTemplate("categoria-invalida"), "Personalizada");
    });
});

describe("substituição de variáveis (whitelist, sem eval)", () => {
    it("substitui só as variáveis permitidas", () => {
        const resultado = substituirVariaveisTemplate(
            "Olá {{nome_cliente}}, aqui é {{nome_funcionario}} da {{nome_loja}}. Pedido {{numero_pedido}} está {{status_pedido}}.",
            { nome_cliente: "Maria", nome_funcionario: "João", nome_loja: "Loja X", numero_pedido: "123", status_pedido: "Pago" }
        );
        assert.equal(resultado, "Olá Maria, aqui é João da Loja X. Pedido 123 está Pago.");
    });

    it("mantém o placeholder original se a variável não veio preenchida", () => {
        assert.equal(substituirVariaveisTemplate("Olá {{nome_cliente}}!", {}), "Olá {{nome_cliente}}!");
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

    it("a whitelist evoluiu das 4 originais para as 8 oficiais, sem perder nenhuma", () => {
        assert.deepEqual([...VARIAVEIS_TEMPLATE_ATENDIMENTO].sort(), [
            "data_pedido", "nome_cliente", "nome_funcionario", "nome_loja",
            "numero_pedido", "prazo_entrega", "status_pedido", "valor_pedido"
        ].sort());
        for (const original of ["nome_cliente", "nome_loja", "nome_funcionario", "numero_pedido"]) {
            assert.ok(VARIAVEIS_TEMPLATE_ATENDIMENTO.includes(original), original);
        }
    });

    it("múltiplas ocorrências da mesma variável são todas substituídas", () => {
        const resultado = substituirVariaveisTemplate("{{nome_cliente}}, {{nome_cliente}}!", { nome_cliente: "Ana" });
        assert.equal(resultado, "Ana, Ana!");
    });

    it("variaveisUsadasNoTexto lista em ordem de aparição, sem repetir", () => {
        assert.deepEqual(variaveisUsadasNoTexto("{{numero_pedido}} — {{nome_cliente}} — {{numero_pedido}}"), ["numero_pedido", "nome_cliente"]);
    });

    it("contemVariavelNaoResolvida detecta placeholder restante e nunca falso-positivo em texto já resolvido", () => {
        assert.equal(contemVariavelNaoResolvida("Olá {{nome_cliente}}"), true);
        assert.equal(contemVariavelNaoResolvida("Olá Maria, tudo bem?"), false);
        assert.equal(contemVariavelNaoResolvida("{{coisa_nao_whitelisted}}"), false);
    });
});

describe("valores de pedido (schema real: valor number, status enum, data timestamp)", () => {
    it("formata número, status, valor e data quando o pedido existe", () => {
        const valores = valoresDePedido({ id: "ped_123", status: "pago", valor: 150.5, data: new Date("2026-01-15").getTime() });
        assert.equal(valores.numero_pedido, "ped_123");
        assert.equal(valores.status_pedido, "Pago");
        assert.equal(valores.valor_pedido, (150.5).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
        assert.equal(valores.data_pedido, new Date("2026-01-15").toLocaleDateString("pt-BR"));
    });

    it("não inclui prazo_entrega quando o pedido não tem prazoEntrega preenchido", () => {
        const valores = valoresDePedido({ id: "ped_1", status: "pago", valor: 10, data: Date.now() });
        assert.equal("prazo_entrega" in valores, false);
    });

    it("resolve prazo_entrega quando o pedido (Pedidos Estruturados) tem prazoEntrega", () => {
        const prazo = new Date("2026-02-10").getTime();
        const valores = valoresDePedido({ id: "ped_1", status: "pago", valor: 10, data: Date.now(), prazoEntrega: prazo });
        assert.equal(valores.prazo_entrega, new Date(prazo).toLocaleDateString("pt-BR"));
    });

    it("pedido ausente retorna objeto vazio (sem inventar dado)", () => {
        assert.deepEqual(valoresDePedido(null), {});
    });

    it("status desconhecido usa o próprio valor como rótulo (nunca undefined)", () => {
        assert.equal(valoresDePedido({ status: "status_novo_desconhecido" }).status_pedido, "status_novo_desconhecido");
    });

    it("rótulos de status cobrem os 4 valores reais do schema de pedidos", () => {
        assert.deepEqual(Object.keys(ROTULO_STATUS_PEDIDO).sort(), ["aguardando", "cancelado", "confirmado", "pago"].sort());
    });
});

describe("resolução de variáveis + pendências (Fase 7)", () => {
    it("resolve tudo quando cliente, loja, funcionário e pedido estão disponíveis", () => {
        const { textoResolvido, pendentes } = resolverVariaveisTemplate(
            "Olá {{nome_cliente}}, seu pedido {{numero_pedido}} está {{status_pedido}}.",
            { nomeCliente: "Ana", nomeLoja: "Loja X", nomeFuncionario: "João", pedido: { id: "ped_1", status: "pago" } }
        );
        assert.equal(textoResolvido, "Olá Ana, seu pedido ped_1 está Pago.");
        assert.deepEqual(pendentes, []);
    });

    it("nunca escolhe pedido implicitamente — sem pedido informado, variáveis de pedido ficam pendentes", () => {
        const { pendentes } = resolverVariaveisTemplate("Pedido {{numero_pedido}}: {{valor_pedido}}", { nomeCliente: "Ana" });
        assert.deepEqual(pendentes.map(p => p.chave).sort(), ["numero_pedido", "valor_pedido"].sort());
    });

    it("{{prazo_entrega}} pendente quando o pedido não tem a data preenchida; nunca remove o texto original silenciosamente", () => {
        const { textoResolvido, pendentes } = resolverVariaveisTemplate("Prazo: {{prazo_entrega}}", {});
        assert.equal(textoResolvido, "Prazo: {{prazo_entrega}}");
        assert.ok(pendentes.some(p => p.chave === "prazo_entrega"));
    });

    it("{{prazo_entrega}} resolve quando o pedido vinculado (Pedidos Estruturados) tem prazoEntrega", () => {
        const prazo = new Date("2026-03-01").getTime();
        const { textoResolvido, pendentes } = resolverVariaveisTemplate("Prazo: {{prazo_entrega}}", { pedido: { id: "ped_1", prazoEntrega: prazo } });
        assert.equal(textoResolvido, `Prazo: ${new Date(prazo).toLocaleDateString("pt-BR")}`);
        assert.equal(pendentes.some(p => p.chave === "prazo_entrega"), false);
    });

    it("{{nome_cliente}} pendente em conversa anônima (sem nome)", () => {
        const { pendentes } = resolverVariaveisTemplate("Olá {{nome_cliente}}", { nomeCliente: "" });
        assert.deepEqual(pendentes.map(p => p.chave), ["nome_cliente"]);
    });

    it("cada pendência explica a origem esperada do dado", () => {
        const { pendentes } = resolverVariaveisTemplate("{{numero_pedido}}", {});
        assert.ok(pendentes[0].origem.length > 0);
    });

    it("nunca produz undefined/null/[object Object] no texto resolvido", () => {
        const { textoResolvido } = resolverVariaveisTemplate("{{nome_cliente}} {{numero_pedido}} {{valor_pedido}}", { nomeCliente: undefined, pedido: null });
        assert.doesNotMatch(textoResolvido, /undefined|null|\[object Object\]/);
    });
});

describe("pedido vinculado à conversa (derivado do histórico, nunca um campo novo em chats)", () => {
    it("nenhum evento de vínculo -> sem pedido vinculado", () => {
        assert.equal(pedidoVinculadoIdDaConversa([]), "");
    });

    it("último evento é pedido_vinculado -> retorna o pedidoId dele", () => {
        const eventos = [
            { tipo: "pedido_vinculado", pedidoId: "ped_1", criadoEm: 1000 },
            { tipo: "pedido_vinculado", pedidoId: "ped_2", criadoEm: 2000 }
        ];
        assert.equal(pedidoVinculadoIdDaConversa(eventos), "ped_2");
    });

    it("último evento é pedido_desvinculado -> sem pedido vinculado, mesmo com um vínculo anterior", () => {
        const eventos = [
            { tipo: "pedido_vinculado", pedidoId: "ped_1", criadoEm: 1000 },
            { tipo: "pedido_desvinculado", pedidoId: "ped_1", criadoEm: 2000 }
        ];
        assert.equal(pedidoVinculadoIdDaConversa(eventos), "");
    });

    it("ignora eventos de outros tipos misturados na mesma lista", () => {
        const eventos = [
            { tipo: "mensagem_equipe_enviada", criadoEm: 3000 },
            { tipo: "pedido_vinculado", pedidoId: "ped_9", criadoEm: 1000 }
        ];
        assert.equal(pedidoVinculadoIdDaConversa(eventos), "ped_9");
    });
});

describe("atalhos", () => {
    it("normaliza: minúsculas, sem espaço, sem barra inicial, só [a-z0-9_-]", () => {
        assert.equal(normalizarAtalho("/Prazo Entrega!!"), "prazoentrega");
        assert.equal(normalizarAtalho("  Pagamento_Pix-1  "), "pagamento_pix-1");
    });

    it("atalho vazio/só símbolos normaliza pra string vazia", () => {
        assert.equal(normalizarAtalho("!!!"), "");
        assert.equal(normalizarAtalho(""), "");
    });

    it("atalhoJaEmUso detecta duplicidade entre templates ativos e não-arquivados do tenant", () => {
        const templates = [
            { id: "a", atalho: "prazo", ativo: true },
            { id: "b", atalho: "pagamento", ativo: true }
        ];
        assert.equal(atalhoJaEmUso(templates, "prazo"), true);
        assert.equal(atalhoJaEmUso(templates, "outro"), false);
    });

    it("atalhoJaEmUso ignora o próprio template ao editar", () => {
        const templates = [{ id: "a", atalho: "prazo", ativo: true }];
        assert.equal(atalhoJaEmUso(templates, "prazo", { ignorarId: "a" }), false);
    });

    it("atalhoJaEmUso ignora templates inativos e arquivados (não bloqueiam reuso)", () => {
        const templates = [
            { id: "a", atalho: "prazo", ativo: false },
            { id: "b", atalho: "prazo", ativo: true, arquivadoEm: Date.now() }
        ];
        assert.equal(atalhoJaEmUso(templates, "prazo"), false);
    });

    it("sugerirTemplatesPorAtalho filtra por prefixo, só ativos/não-arquivados/com atalho, limite de 8", () => {
        const templates = [
            { id: "1", atalho: "prazo", ativo: true },
            { id: "2", atalho: "pagamento", ativo: true },
            { id: "3", atalho: "prazo2", ativo: true },
            { id: "4", atalho: "prazo3", ativo: false },
            { id: "5", atalho: "", ativo: true }
        ];
        const sugestoes = sugerirTemplatesPorAtalho(templates, "pra");
        assert.deepEqual(sugestoes.map(t => t.id), ["1", "3"]);
    });

    it("sugerirTemplatesPorAtalho sem prefixo lista todos os atalhos disponíveis (até o limite)", () => {
        const templates = [{ id: "1", atalho: "a", ativo: true }, { id: "2", atalho: "b", ativo: true }];
        assert.equal(sugerirTemplatesPorAtalho(templates, "").length, 2);
    });
});

describe("validação de template avançado", () => {
    it("aceita um template completo e válido", () => {
        assert.equal(validarTemplateAtendimentoAvancado(templateFixture()), "");
    });

    it("rejeita título e mensagem vazios", () => {
        assert.notEqual(validarTemplateAtendimentoAvancado(templateFixture({ titulo: "" })), "");
        assert.notEqual(validarTemplateAtendimentoAvancado(templateFixture({ mensagem: "   " })), "");
    });

    it("rejeita mensagem acima do limite", () => {
        assert.notEqual(validarTemplateAtendimentoAvancado(templateFixture({ mensagem: "x".repeat(LIMITES_TEMPLATE_ATENDIMENTO.conteudoMax + 1) })), "");
    });

    it("rejeita atalho inválido (só símbolos, normaliza pra vazio)", () => {
        assert.notEqual(validarTemplateAtendimentoAvancado(templateFixture({ atalho: "###" })), "");
    });

    it("rejeita quando o atalho já está em uso por outro template", () => {
        assert.notEqual(validarTemplateAtendimentoAvancado(templateFixture(), { atalhoDuplicado: true }), "");
    });

    it("template sem atalho é válido (atalho é opcional)", () => {
        assert.equal(validarTemplateAtendimentoAvancado(templateFixture({ atalho: "" })), "");
    });

    it("rejeita descrição interna acima do limite", () => {
        assert.notEqual(validarTemplateAtendimentoAvancado(templateFixture({ descricaoInterna: "x".repeat(LIMITES_TEMPLATE_ATENDIMENTO.descricaoInternaMax + 1) })), "");
    });
});

describe("visibilidade no seletor de atendimento (compatibilidade com o módulo genérico Templates)", () => {
    it("template sem contexto (legado) aparece — nunca exige migração dos documentos antigos", () => {
        assert.equal(templateVisivelNoAtendimento({ titulo: "Antigo" }), true);
    });

    it("template contexto:'atendimento' aparece", () => {
        assert.equal(templateVisivelNoAtendimento({ contexto: "atendimento" }), true);
    });

    it("template contexto:'leads' (automação de lead) fica escondido do seletor de atendimento", () => {
        assert.equal(templateVisivelNoAtendimento({ contexto: "leads" }), false);
    });
});

describe("filtro e ordenação de templates", () => {
    const base = [
        templateFixture({ id: "1", titulo: "Saudação", categoria: "saudacao", favorito: true, usoTotal: 5, atualizadoEm: 3000, ordem: 2 }),
        templateFixture({ id: "2", titulo: "Orçamento padrão", categoria: "orcamento", favorito: false, usoTotal: 10, atualizadoEm: 1000, ordem: 1 }),
        templateFixture({ id: "3", titulo: "Encerramento antigo", categoria: "encerramento", ativo: false, atualizadoEm: 2000, ordem: 3 }),
        templateFixture({ id: "4", titulo: "Automação de lead", contexto: "leads", categoria: "vendas" })
    ];

    it("filtra por categoria (usando o enum fechado, categoria fora do enum vira personalizada)", () => {
        assert.deepEqual(filtrarTemplatesAtendimento(base, { categoria: "orcamento" }).map(t => t.id), ["2"]);
    });

    it("filtra por busca no título/mensagem/atalho/categoria", () => {
        assert.deepEqual(filtrarTemplatesAtendimento(base, { busca: "orçamento" }).map(t => t.id), ["2"]);
    });

    it("filtra apenas ativos por padrão", () => {
        assert.equal(filtrarTemplatesAtendimento(base, {}).some(t => t.id === "3"), false);
    });

    it("nunca inclui templates de automação de lead (contexto:'leads')", () => {
        assert.equal(filtrarTemplatesAtendimento(base, { apenasAtivos: false, incluirArquivados: true }).some(t => t.id === "4"), false);
    });

    it("apenasFavoritos filtra corretamente", () => {
        assert.deepEqual(filtrarTemplatesAtendimento(base, { apenasFavoritos: true }).map(t => t.id), ["1"]);
    });

    it("ordena por ordem manual (com desempate alfabético)", () => {
        const ordenados = ordenarTemplatesAtendimento([base[0], base[1]], "ordem");
        assert.deepEqual(ordenados.map(t => t.id), ["2", "1"]);
    });

    it("ordena por mais usado", () => {
        const ordenados = ordenarTemplatesAtendimento([base[0], base[1]], "mais_usado");
        assert.deepEqual(ordenados.map(t => t.id), ["2", "1"]);
    });

    it("ordena por mais recente (atualizadoEm)", () => {
        const ordenados = ordenarTemplatesAtendimento([base[0], base[1]], "recente");
        assert.deepEqual(ordenados.map(t => t.id), ["1", "2"]);
    });

    it("ordena alfabeticamente", () => {
        const ordenados = ordenarTemplatesAtendimento([base[0], base[1]], "alfabetica");
        assert.deepEqual(ordenados.map(t => t.id), ["2", "1"]);
    });
});

describe("recentes e mais usados (Fase 13 — só o que foi realmente enviado)", () => {
    it("templatesRecentementeUsados exige ultimoUsoEm (não considera só abertura/edição)", () => {
        const templates = [
            templateFixture({ id: "1", ultimoUsoEm: 5000 }),
            templateFixture({ id: "2", ultimoUsoEm: 9000 }),
            templateFixture({ id: "3" }) // nunca usado
        ];
        assert.deepEqual(templatesRecentementeUsados(templates).map(t => t.id), ["2", "1"]);
    });

    it("templatesMaisUsados exige usoTotal > 0 e ordena decrescente", () => {
        const templates = [
            templateFixture({ id: "1", usoTotal: 3 }),
            templateFixture({ id: "2", usoTotal: 8 }),
            templateFixture({ id: "3", usoTotal: 0 })
        ];
        assert.deepEqual(templatesMaisUsados(templates).map(t => t.id), ["2", "1"]);
    });

    it("recentes e mais usados nunca incluem inativos, arquivados ou de automação de lead", () => {
        const templates = [
            templateFixture({ id: "1", ativo: false, ultimoUsoEm: 9000, usoTotal: 9 }),
            templateFixture({ id: "2", arquivadoEm: Date.now(), ultimoUsoEm: 9000, usoTotal: 9 }),
            templateFixture({ id: "3", contexto: "leads", ultimoUsoEm: 9000, usoTotal: 9 })
        ];
        assert.deepEqual(templatesRecentementeUsados(templates), []);
        assert.deepEqual(templatesMaisUsados(templates), []);
    });

    it("respeita o limite pedido", () => {
        const templates = Array.from({ length: 10 }, (_, i) => templateFixture({ id: String(i), usoTotal: i + 1 }));
        assert.equal(templatesMaisUsados(templates, 3).length, 3);
    });
});
