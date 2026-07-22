import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    LIMITES_CRM,
    STATUS_RELACIONAMENTO,
    adicionarProdutoInteresse,
    adicionarTagCliente,
    calcularResumoComercial,
    categoriaEvento,
    emailValido,
    encontrarCorrespondencias,
    filtrarTimeline,
    normalizarEmail,
    normalizarTelefone,
    ordenarTimeline,
    removerProdutoInteresse,
    removerTagCliente,
    resolverIdentidadeCliente,
    slugTag,
    statusRelacionamentoValido,
    sugerirStatusRelacionamento,
    telefoneValido,
    validarObservacaoCliente,
    validarProdutoInteresse
} from "../crm360.js";

describe("normalização de telefone (espelha lp-forms-v5.js)", () => {
    it("prefixa 55 quando o número tem 10 ou 11 dígitos", () => {
        assert.equal(normalizarTelefone("(11) 99999-8888"), "5511999998888");
        assert.equal(normalizarTelefone("11 3333-4444"), "551133334444");
    });

    it("mantém como está quando já vem com código de país", () => {
        assert.equal(normalizarTelefone("+55 11 99999-8888"), "5511999998888");
    });

    it("trata valor vazio sem lançar erro", () => {
        assert.equal(normalizarTelefone(""), "");
        assert.equal(normalizarTelefone(null), "");
        assert.equal(normalizarTelefone(undefined), "");
    });

    it("telefoneValido aceita 12-13 dígitos e rejeita o resto", () => {
        assert.equal(telefoneValido("5511999998888"), true);
        assert.equal(telefoneValido("551133334444"), true);
        assert.equal(telefoneValido("123"), false);
        assert.equal(telefoneValido(""), false);
    });
});

describe("normalização de e-mail", () => {
    it("normaliza para minúsculas e sem espaços", () => {
        assert.equal(normalizarEmail("  Cliente@Exemplo.COM  "), "cliente@exemplo.com");
    });

    it("emailValido rejeita formato inválido", () => {
        assert.equal(emailValido("cliente@exemplo.com"), true);
        assert.equal(emailValido("nao-e-email"), false);
        assert.equal(emailValido(""), false);
    });
});

describe("identidade canônica: ordem de prioridade", () => {
    it("prioriza clienteId explícito sobre qualquer outro critério", () => {
        const r = resolverIdentidadeCliente({ clienteId: "c1", authUid: "u1", telefoneNormalizado: "5511999998888" });
        assert.deepEqual(r, { estrategia: "clienteId", valor: "c1" });
    });

    it("usa authUid quando não há clienteId", () => {
        const r = resolverIdentidadeCliente({ authUid: "u1", telefoneNormalizado: "5511999998888" });
        assert.equal(r.estrategia, "authUid");
    });

    it("cai para leadId, depois pedidoId, depois telefone, depois email", () => {
        assert.equal(resolverIdentidadeCliente({ leadIdVinculado: "l1", telefoneNormalizado: "5511999998888" }).estrategia, "leadId");
        assert.equal(resolverIdentidadeCliente({ pedidoIdVinculado: "p1", telefoneNormalizado: "5511999998888" }).estrategia, "pedidoId");
        assert.equal(resolverIdentidadeCliente({ telefoneNormalizado: "5511999998888" }).estrategia, "telefone");
        assert.equal(resolverIdentidadeCliente({ emailNormalizado: "a@b.com" }).estrategia, "email");
    });

    it("não usa telefone/email inválidos e retorna 'nenhuma' quando não há nada aproveitável", () => {
        assert.equal(resolverIdentidadeCliente({ telefoneNormalizado: "123" }).estrategia, "nenhuma");
        assert.equal(resolverIdentidadeCliente({}).estrategia, "nenhuma");
    });

    it("nome sozinho nunca é usado como identidade (não existe esse parâmetro na função)", () => {
        // resolverIdentidadeCliente nem aceita "nome" — a única forma de
        // testar isso é confirmar que passar um nome não muda o resultado.
        const r = resolverIdentidadeCliente({ nome: "Maria Silva" });
        assert.equal(r.estrategia, "nenhuma");
    });
});

describe("correspondência entre registros (telefone/email/authUid)", () => {
    const candidatos = [
        { id: "cand1", telefoneNormalizado: "5511999998888", emailNormalizado: "" },
        { id: "cand2", telefoneNormalizado: "", emailNormalizado: "outro@ex.com" },
        { id: "cand3", telefoneNormalizado: "5511777776666", emailNormalizado: "" }
    ];

    it("encontra correspondência única por telefone", () => {
        const r = encontrarCorrespondencias({ telefoneNormalizado: "5511999998888" }, candidatos);
        assert.equal(r.ambiguo, false);
        assert.equal(r.correspondencias.length, 1);
        assert.equal(r.correspondencias[0].id, "cand1");
    });

    it("encontra correspondência única por e-mail", () => {
        const r = encontrarCorrespondencias({ emailNormalizado: "outro@ex.com" }, candidatos);
        assert.equal(r.correspondencias[0].id, "cand2");
    });

    it("detecta ambiguidade quando telefone bate em mais de um candidato distinto", () => {
        const doisComMesmoTel = [
            { id: "a", telefoneNormalizado: "5511999998888" },
            { id: "b", telefoneNormalizado: "5511999998888" }
        ];
        const r = encontrarCorrespondencias({ telefoneNormalizado: "5511999998888" }, doisComMesmoTel);
        assert.equal(r.ambiguo, true);
        assert.equal(r.correspondencias.length, 2);
    });

    it("authUid desempata e nunca é ambíguo mesmo com telefone repetido", () => {
        const lista = [
            { id: "a", authUid: "uidA", telefoneNormalizado: "5511999998888" },
            { id: "b", telefoneNormalizado: "5511999998888" }
        ];
        const r = encontrarCorrespondencias({ authUid: "uidA", telefoneNormalizado: "5511999998888" }, lista);
        assert.equal(r.ambiguo, false);
        assert.equal(r.correspondencias.length, 1);
        assert.equal(r.correspondencias[0].id, "a");
    });

    it("sem nenhum critério batendo, retorna lista vazia sem ambiguidade", () => {
        const r = encontrarCorrespondencias({ telefoneNormalizado: "5500000000000" }, candidatos);
        assert.equal(r.correspondencias.length, 0);
        assert.equal(r.ambiguo, false);
    });
});

describe("status de relacionamento", () => {
    it("valida o enum declarado", () => {
        for (const status of Object.keys(STATUS_RELACIONAMENTO)) {
            assert.equal(statusRelacionamentoValido(status), true);
        }
        assert.equal(statusRelacionamentoValido("outro"), false);
    });

    it("sugere 'cliente' após o primeiro pedido pago", () => {
        const sugestao = sugerirStatusRelacionamento({ statusAtual: "negociacao", pedidosPagos: 1 });
        assert.equal(sugestao.sugestao, "cliente");
    });

    it("sugere 'recorrente' com 2+ pedidos pagos", () => {
        const sugestao = sugerirStatusRelacionamento({ statusAtual: "cliente", pedidosPagos: 2 });
        assert.equal(sugestao.sugestao, "recorrente");
    });

    it("sugere 'inativo' após muitos dias sem interação, só para quem já é cliente", () => {
        const sugestao = sugerirStatusRelacionamento({ statusAtual: "cliente", pedidosPagos: 1, diasDesdeUltimaCompra: 90 });
        assert.equal(sugestao.sugestao, "inativo");
    });

    it("pedido cancelado não sugere 'perdido' automaticamente (função não reage a cancelamento)", () => {
        const sugestao = sugerirStatusRelacionamento({ statusAtual: "negociacao", pedidosPagos: 0 });
        assert.equal(sugestao, null);
    });

    it("nunca sugere nada para quem já está perdido ou inativo", () => {
        assert.equal(sugerirStatusRelacionamento({ statusAtual: "perdido", pedidosPagos: 5 }), null);
        assert.equal(sugerirStatusRelacionamento({ statusAtual: "inativo", pedidosPagos: 5 }), null);
    });
});

describe("tags do cliente", () => {
    it("gera slug estável sem acento, minúsculo, com hífen", () => {
        assert.equal(slugTag("Cliente Recorrente"), "cliente-recorrente");
        assert.equal(slugTag("  VIP  "), "vip");
        assert.equal(slugTag("Orçamento Enviado"), "orcamento-enviado");
    });

    it("trata maiúsculas/espaços como a mesma tag (evita duplicidade)", () => {
        assert.equal(slugTag("vip"), slugTag("VIP"));
        assert.equal(slugTag("Cliente Recorrente"), slugTag("cliente   recorrente"));
    });

    it("adiciona sem duplicar e respeita o limite máximo", () => {
        let tags = adicionarTagCliente([], "vip");
        assert.deepEqual(tags, ["vip"]);
        tags = adicionarTagCliente(tags, "vip");
        assert.deepEqual(tags, ["vip"]);
        let cheias = Array.from({ length: LIMITES_CRM.maxTags }, (_, i) => `tag${i}`);
        assert.equal(adicionarTagCliente(cheias, "nova").length, LIMITES_CRM.maxTags);
    });

    it("remove uma tag existente", () => {
        assert.deepEqual(removerTagCliente(["vip", "suporte"], "vip"), ["suporte"]);
    });
});

describe("resumo comercial (Fase 3, seção 2)", () => {
    const pedidos = [
        { status: "pago", valor: 100, data: 3000, produtos: "Camiseta P" },
        { status: "pago", valor: 200, data: 5000, produtos: "Camiseta P, Boné" },
        { status: "cancelado", valor: 50, data: 1000, produtos: "Meia" }
    ];

    it("calcula totais, ticket médio e último pedido", () => {
        const resumo = calcularResumoComercial(pedidos);
        assert.equal(resumo.totalPedidos, 3);
        assert.equal(resumo.pedidosPagos, 2);
        assert.equal(resumo.pedidosCancelados, 1);
        assert.equal(resumo.valorTotal, 300);
        assert.equal(resumo.ticketMedio, 150);
        assert.equal(resumo.ultimoPedido.data, 5000);
    });

    it("lida com lista vazia sem lançar erro", () => {
        const resumo = calcularResumoComercial([]);
        assert.equal(resumo.totalPedidos, 0);
        assert.equal(resumo.ticketMedio, 0);
        assert.equal(resumo.ultimoPedido, null);
        assert.equal(resumo.diasDesdeUltimaCompra, null);
    });

    it("agrupa produtos por texto (best-effort, não é FK)", () => {
        const resumo = calcularResumoComercial(pedidos);
        const camiseta = resumo.produtosMaisComprados.find(p => p.nome.toLowerCase() === "camiseta p");
        assert.equal(camiseta.total, 2);
    });
});

describe("produtos de interesse (Fase 6)", () => {
    it("valida item sem produtoId ou nome", () => {
        assert.notEqual(validarProdutoInteresse({}), "");
        assert.notEqual(validarProdutoInteresse({ produtoId: "p1" }), "");
        assert.equal(validarProdutoInteresse({ produtoId: "p1", nomeSnapshot: "X" }), "");
    });

    it("adiciona com snapshot de nome/preço e não duplica o mesmo produtoId", () => {
        let lista = adicionarProdutoInteresse([], { id: "p1", nome: "Camiseta", preco: 59.9 }, { vinculadoPor: "u1" });
        assert.equal(lista.length, 1);
        assert.equal(lista[0].nomeSnapshot, "Camiseta");
        assert.equal(lista[0].precoSnapshot, 59.9);
        lista = adicionarProdutoInteresse(lista, { id: "p1", nome: "Camiseta" }, { vinculadoPor: "u1" });
        assert.equal(lista.length, 1);
    });

    it("respeita o limite máximo de produtos de interesse", () => {
        let lista = [];
        for (let i = 0; i < LIMITES_CRM.maxProdutosInteresse + 5; i++) {
            lista = adicionarProdutoInteresse(lista, { id: `p${i}`, nome: `Produto ${i}` }, {});
        }
        assert.equal(lista.length, LIMITES_CRM.maxProdutosInteresse);
    });

    it("remove por produtoId", () => {
        const lista = [{ produtoId: "p1" }, { produtoId: "p2" }];
        assert.deepEqual(removerProdutoInteresse(lista, "p1"), [{ produtoId: "p2" }]);
    });
});

describe("observações internas", () => {
    it("rejeita observação vazia ou acima do limite", () => {
        assert.notEqual(validarObservacaoCliente(""), "");
        assert.notEqual(validarObservacaoCliente("   "), "");
        assert.notEqual(validarObservacaoCliente("x".repeat(LIMITES_CRM.observacaoMax + 1)), "");
    });

    it("aceita observação normal", () => {
        assert.equal(validarObservacaoCliente("Cliente prefere contato à tarde."), "");
    });
});

describe("linha do tempo unificada", () => {
    it("categoriza eventos corretamente", () => {
        assert.equal(categoriaEvento("lead_criado"), "leads");
        assert.equal(categoriaEvento("pedido_vinculado"), "pedidos");
        assert.equal(categoriaEvento("tag_adicionada"), "alteracoes");
        assert.equal(categoriaEvento("conversa_criada"), "conversas");
    });

    it("ordena do mais recente para o mais antigo", () => {
        const eventos = [{ criadoEm: 1000 }, { criadoEm: 5000 }, { criadoEm: 3000 }];
        const ordenado = ordenarTimeline(eventos);
        assert.deepEqual(ordenado.map(e => e.criadoEm), [5000, 3000, 1000]);
    });

    it("filtra por categoria", () => {
        const eventos = [
            { tipo: "lead_criado", criadoEm: 1 },
            { tipo: "pedido_criado", criadoEm: 2 },
            { tipo: "tag_adicionada", criadoEm: 3 }
        ];
        assert.equal(filtrarTimeline(eventos, "leads").length, 1);
        assert.equal(filtrarTimeline(eventos, "pedidos").length, 1);
        assert.equal(filtrarTimeline(eventos, "todos").length, 3);
    });
});
