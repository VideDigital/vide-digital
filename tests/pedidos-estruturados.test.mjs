import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    LIMITES_PEDIDO_ESTRUTURADO,
    validarItemPedido,
    validarItensPedido,
    calcularValorItens,
    resumoTextoItens,
    adicionarItemPedido,
    removerItemPedido,
    atualizarQuantidadeItem,
    contarProdutosMaisComprados,
    produtosInteresseConvertidos,
    LIMITES_EDICAO_PEDIDO,
    criarDraftPedido,
    gerarProdutosTextoSemSobrescreverManual,
    calcularTotaisDraft,
    normalizarDraftPedido,
    validarDraftPedido,
    atualizarPrecoItem,
    compararPedidoComDraft,
    resumirAlteracoesPedido
} from "../pedidos-estruturados.js";

function itemFixture(overrides = {}) {
    return { produtoId: "prod1", nomeSnapshot: "Camiseta P", precoSnapshot: 50, quantidade: 2, ...overrides };
}

function produtoFixture(overrides = {}) {
    return { id: "prod1", nome: "Camiseta P", preco: 50, ...overrides };
}

describe("validação de item de pedido", () => {
    it("aceita um item completo e válido", () => {
        assert.equal(validarItemPedido(itemFixture()), "");
    });

    it("rejeita sem produtoId, sem nomeSnapshot, preço/quantidade inválidos", () => {
        assert.notEqual(validarItemPedido(itemFixture({ produtoId: "" })), "");
        assert.notEqual(validarItemPedido(itemFixture({ nomeSnapshot: "" })), "");
        assert.notEqual(validarItemPedido(itemFixture({ precoSnapshot: -1 })), "");
        assert.notEqual(validarItemPedido(itemFixture({ precoSnapshot: "50" })), "");
        assert.notEqual(validarItemPedido(itemFixture({ quantidade: 0 })), "");
        assert.notEqual(validarItemPedido(itemFixture({ quantidade: 1.5 })), "");
        assert.notEqual(validarItemPedido(itemFixture({ quantidade: 1000 })), "");
    });

    it("rejeita nomeSnapshot acima do limite", () => {
        assert.notEqual(validarItemPedido(itemFixture({ nomeSnapshot: "x".repeat(LIMITES_PEDIDO_ESTRUTURADO.nomeSnapshotMax + 1) })), "");
    });
});

describe("validação da lista de itens", () => {
    it("aceita ausência de itens (pedido em texto livre continua válido)", () => {
        assert.equal(validarItensPedido(undefined), "");
        assert.equal(validarItensPedido(null), "");
        assert.equal(validarItensPedido([]), "");
    });

    it("rejeita mais de 20 itens", () => {
        const itens = Array.from({ length: 21 }, (_, i) => itemFixture({ produtoId: `p${i}` }));
        assert.notEqual(validarItensPedido(itens), "");
    });

    it("rejeita se qualquer item da lista for inválido", () => {
        assert.notEqual(validarItensPedido([itemFixture(), itemFixture({ quantidade: -1 })]), "");
    });
});

describe("cálculo de valor a partir dos itens", () => {
    it("soma preço x quantidade de cada item", () => {
        assert.equal(calcularValorItens([itemFixture({ precoSnapshot: 10, quantidade: 2 }), itemFixture({ produtoId: "p2", precoSnapshot: 5, quantidade: 3 })]), 35);
    });

    it("lista vazia/ausente soma zero", () => {
        assert.equal(calcularValorItens([]), 0);
        assert.equal(calcularValorItens(undefined), 0);
    });
});

describe("resumo em texto (preenche o campo produtos legado)", () => {
    it("mostra quantidade só quando maior que 1", () => {
        assert.equal(resumoTextoItens([itemFixture({ nomeSnapshot: "Camiseta", quantidade: 1 })]), "Camiseta");
        assert.equal(resumoTextoItens([itemFixture({ nomeSnapshot: "Camiseta", quantidade: 3 })]), "Camiseta x3");
    });

    it("junta múltiplos itens com vírgula", () => {
        const itens = [itemFixture({ nomeSnapshot: "A", quantidade: 1 }), itemFixture({ produtoId: "p2", nomeSnapshot: "B", quantidade: 2 })];
        assert.equal(resumoTextoItens(itens), "A, B x2");
    });
});

describe("adicionar/remover/atualizar item", () => {
    it("adiciona um produto novo à lista", () => {
        const itens = adicionarItemPedido([], produtoFixture(), 1);
        assert.equal(itens.length, 1);
        assert.equal(itens[0].produtoId, "prod1");
        assert.equal(itens[0].precoSnapshot, 50);
    });

    it("adicionar o mesmo produto de novo soma a quantidade, não duplica a linha", () => {
        let itens = adicionarItemPedido([], produtoFixture(), 1);
        itens = adicionarItemPedido(itens, produtoFixture(), 2);
        assert.equal(itens.length, 1);
        assert.equal(itens[0].quantidade, 3);
    });

    it("não ultrapassa o máximo de 20 itens distintos", () => {
        let itens = [];
        for (let i = 0; i < 20; i++) itens = adicionarItemPedido(itens, produtoFixture({ id: `p${i}` }), 1);
        itens = adicionarItemPedido(itens, produtoFixture({ id: "p20" }), 1);
        assert.equal(itens.length, 20);
    });

    it("remove um item pelo produtoId", () => {
        const itens = adicionarItemPedido([], produtoFixture(), 1);
        assert.deepEqual(removerItemPedido(itens, "prod1"), []);
    });

    it("atualiza quantidade de um item existente, respeitando limites", () => {
        const itens = adicionarItemPedido([], produtoFixture(), 1);
        const atualizado = atualizarQuantidadeItem(itens, "prod1", 5);
        assert.equal(atualizado[0].quantidade, 5);
        const limitado = atualizarQuantidadeItem(itens, "prod1", 9999);
        assert.equal(limitado[0].quantidade, LIMITES_PEDIDO_ESTRUTURADO.quantidadeMax);
        const minimo = atualizarQuantidadeItem(itens, "prod1", 0);
        assert.equal(minimo[0].quantidade, LIMITES_PEDIDO_ESTRUTURADO.quantidadeMin);
    });

    it("snapshot de preço não muda mesmo que o preço do produto seja diferente numa segunda chamada", () => {
        let itens = adicionarItemPedido([], produtoFixture({ preco: 50 }), 1);
        itens = adicionarItemPedido(itens, produtoFixture({ preco: 999 }), 1);
        assert.equal(itens[0].precoSnapshot, 50);
    });
});

describe("produtos mais comprados (precisos com itens, best-effort sem)", () => {
    it("usa produtoId quando o pedido tem itens estruturados", () => {
        const pedidos = [
            { itens: [itemFixture({ produtoId: "p1", nomeSnapshot: "Camiseta", quantidade: 2 })] },
            { itens: [itemFixture({ produtoId: "p1", nomeSnapshot: "Camiseta", quantidade: 1 })] }
        ];
        const resultado = contarProdutosMaisComprados(pedidos);
        assert.equal(resultado.length, 1);
        assert.equal(resultado[0].total, 3);
        assert.equal(resultado[0].preciso, true);
        assert.equal(resultado[0].produtoId, "p1");
    });

    it("cai no texto livre (best-effort) para pedidos sem itens — nunca descarta o pedido", () => {
        const pedidos = [{ produtos: "Camiseta P, Boné" }, { produtos: "Camiseta P" }];
        const resultado = contarProdutosMaisComprados(pedidos);
        const camiseta = resultado.find(r => r.nome === "Camiseta P");
        assert.equal(camiseta.total, 2);
        assert.equal(camiseta.preciso, false);
        assert.equal(camiseta.produtoId, null);
    });

    it("mistura pedidos com e sem itens estruturados na mesma contagem", () => {
        const pedidos = [
            { itens: [itemFixture({ produtoId: "p1", nomeSnapshot: "Camiseta P", quantidade: 1 })] },
            { produtos: "Boné" }
        ];
        const resultado = contarProdutosMaisComprados(pedidos);
        assert.equal(resultado.length, 2);
    });

    it("respeita o limite pedido", () => {
        const pedidos = Array.from({ length: 10 }, (_, i) => ({ produtos: `Produto ${i}` }));
        assert.equal(contarProdutosMaisComprados(pedidos, 3).length, 3);
    });
});

describe("produtos de interesse convertidos em pedido real", () => {
    it("detecta interesse que virou compra (mesmo produtoId)", () => {
        const interesse = [{ produtoId: "p1", nomeSnapshot: "Camiseta" }, { produtoId: "p2", nomeSnapshot: "Boné" }];
        const itensPedido = [itemFixture({ produtoId: "p1" })];
        const convertidos = produtosInteresseConvertidos(interesse, itensPedido);
        assert.equal(convertidos.length, 1);
        assert.equal(convertidos[0].produtoId, "p1");
    });

    it("sem correspondência retorna lista vazia", () => {
        assert.deepEqual(produtosInteresseConvertidos([{ produtoId: "p9" }], [itemFixture({ produtoId: "p1" })]), []);
    });
});

// ===== Edição Completa de Pedido Existente V1 =====

function orderFixture(overrides = {}) {
    return {
        customer: "Fulano de Tal",
        whatsapp: "5511999998888",
        email: "fulano@exemplo.com",
        delivery: "retirada",
        cep: "",
        address: "",
        customerNotes: "",
        items: [itemFixture()],
        productsText: "Camiseta P x2",
        subtotal: 100,
        discount: 0,
        freight: 0,
        total: 100,
        status: "novo",
        payment: "pendente",
        responsibleUid: "",
        responsibleName: "",
        dueDate: 0,
        internalNotes: "",
        ...overrides
    };
}

describe("criarDraftPedido: espelha o pedido normalizado", () => {
    it("copia todos os campos editáveis, sem referência compartilhada nos itens", () => {
        const order = orderFixture();
        const draft = criarDraftPedido(order);
        assert.equal(draft.customer, order.customer);
        assert.equal(draft.items.length, 1);
        assert.notEqual(draft.items, order.items);
        assert.equal(draft.productsTextManual, false);
    });

    it("aplica um padrão seguro quando o pedido é vazio/ausente", () => {
        const draft = criarDraftPedido(undefined);
        assert.equal(draft.customer, "");
        assert.deepEqual(draft.items, []);
        assert.equal(draft.delivery, "não informado");
    });
});

describe("gerarProdutosTextoSemSobrescreverManual", () => {
    it("gera o texto a partir dos itens quando não editado manualmente", () => {
        const draft = { items: [itemFixture({ nomeSnapshot: "Camiseta", quantidade: 3 })], productsText: "", productsTextManual: false };
        assert.equal(gerarProdutosTextoSemSobrescreverManual(draft), "Camiseta x3");
    });

    it("preserva o texto manual mesmo com itens presentes", () => {
        const draft = { items: [itemFixture()], productsText: "Texto digitado à mão", productsTextManual: true };
        assert.equal(gerarProdutosTextoSemSobrescreverManual(draft), "Texto digitado à mão");
    });

    it("sem itens, mantém o texto livre existente (nunca fica vazio à toa)", () => {
        const draft = { items: [], productsText: "Serviço combinado por telefone", productsTextManual: false };
        assert.equal(gerarProdutosTextoSemSobrescreverManual(draft), "Serviço combinado por telefone");
    });
});

describe("calcularTotaisDraft", () => {
    it("subtotal vem dos itens quando existem", () => {
        const draft = { items: [itemFixture({ precoSnapshot: 10, quantidade: 2 })], subtotal: 999, discount: 0, freight: 0 };
        assert.equal(calcularTotaisDraft(draft).subtotal, 20);
    });

    it("total nunca fica negativo mesmo com desconto maior que o subtotal", () => {
        const draft = { items: [itemFixture({ precoSnapshot: 10, quantidade: 1 })], discount: 999, freight: 0 };
        assert.equal(calcularTotaisDraft(draft).total, 0);
    });

    it("soma o frete normalmente", () => {
        const draft = { items: [itemFixture({ precoSnapshot: 10, quantidade: 1 })], discount: 2, freight: 5 };
        assert.equal(calcularTotaisDraft(draft).total, 13);
    });
});

describe("atualizarPrecoItem", () => {
    it("atualiza o preço só do item indicado, sem tocar quantidade", () => {
        const itens = adicionarItemPedido([], produtoFixture(), 3);
        const atualizado = atualizarPrecoItem(itens, "prod1", 75);
        assert.equal(atualizado[0].precoSnapshot, 75);
        assert.equal(atualizado[0].quantidade, 3);
    });

    it("nunca aceita preço negativo", () => {
        const itens = adicionarItemPedido([], produtoFixture(), 1);
        assert.equal(atualizarPrecoItem(itens, "prod1", -50)[0].precoSnapshot, 0);
    });
});

describe("normalizarDraftPedido", () => {
    it("aplica limites de tamanho e recalcula subtotal/total a partir dos itens", () => {
        const draft = criarDraftPedido(orderFixture({ items: [itemFixture({ precoSnapshot: 10, quantidade: 2 })], discount: 1, freight: 1 }));
        const normalizado = normalizarDraftPedido(draft);
        assert.equal(normalizado.subtotal, 20);
        assert.equal(normalizado.total, 20);
    });

    it("recebimento fora do enum vira 'não informado'", () => {
        const normalizado = normalizarDraftPedido({ ...criarDraftPedido(orderFixture()), delivery: "invasor" });
        assert.equal(normalizado.delivery, "não informado");
    });

    it("corta campos de texto acima do limite", () => {
        const draft = { ...criarDraftPedido(orderFixture()), customer: "x".repeat(LIMITES_EDICAO_PEDIDO.clienteMax + 20) };
        assert.equal(normalizarDraftPedido(draft).customer.length, LIMITES_EDICAO_PEDIDO.clienteMax);
    });
});

describe("validarDraftPedido", () => {
    it("aceita um draft válido completo", () => {
        assert.equal(validarDraftPedido(normalizarDraftPedido(criarDraftPedido(orderFixture()))), "");
    });

    it("rejeita cliente vazio", () => {
        const draft = normalizarDraftPedido({ ...criarDraftPedido(orderFixture()), customer: "" });
        assert.notEqual(validarDraftPedido(draft), "");
    });

    it("rejeita e-mail com formato inválido", () => {
        const draft = normalizarDraftPedido({ ...criarDraftPedido(orderFixture()), email: "não-é-email" });
        assert.notEqual(validarDraftPedido(draft), "");
    });

    it("rejeita quando não há itens nem texto de produtos", () => {
        const draft = normalizarDraftPedido({ ...criarDraftPedido(orderFixture()), items: [], productsText: "" });
        assert.notEqual(validarDraftPedido(draft), "");
    });

    it("aceita pedido legado sem itens, desde que tenha texto livre", () => {
        const draft = normalizarDraftPedido(criarDraftPedido(orderFixture({ items: [], productsText: "Bolo de chocolate" })));
        assert.equal(validarDraftPedido(draft), "");
    });

    it("rejeita desconto/frete negativos (checagem de segurança; normalizarDraftPedido já os zera antes)", () => {
        const draftDesconto = { ...criarDraftPedido(orderFixture()), discount: -1 };
        assert.notEqual(validarDraftPedido(draftDesconto), "");
        const draftFrete = { ...criarDraftPedido(orderFixture()), freight: -1 };
        assert.notEqual(validarDraftPedido(draftFrete), "");
    });
});

describe("compararPedidoComDraft / resumirAlteracoesPedido", () => {
    it("sem mudanças, alterado é falso e nenhum grupo aparece", () => {
        const order = orderFixture();
        const draft = normalizarDraftPedido(criarDraftPedido(order));
        const diff = compararPedidoComDraft(order, draft);
        assert.equal(diff.alterado, false);
        assert.equal(resumirAlteracoesPedido(diff), "");
    });

    it("detecta mudança isolada no grupo cliente", () => {
        const order = orderFixture();
        const draft = normalizarDraftPedido({ ...criarDraftPedido(order), customer: "Outro Nome" });
        const diff = compararPedidoComDraft(order, draft);
        assert.equal(diff.alterado, true);
        assert.equal(diff.grupos.cliente, true);
        assert.equal(diff.grupos.itens, false);
        assert.equal(resumirAlteracoesPedido(diff), "cliente");
    });

    it("mudança nos itens não é confundida com mudança em valores", () => {
        const order = orderFixture();
        const itensNovos = adicionarItemPedido(order.items, produtoFixture({ id: "prod2", nome: "Boné", preco: 20 }), 1);
        const draft = normalizarDraftPedido({ ...criarDraftPedido(order), items: itensNovos });
        const diff = compararPedidoComDraft(order, draft);
        assert.equal(diff.grupos.itens, true);
        assert.equal(diff.grupos.valores, false);
    });

    it("reordenar/duplicar não altera igualdade de itens de forma incorreta (mesmo conteúdo, mesma ordem = igual)", () => {
        const order = orderFixture();
        const draft = normalizarDraftPedido(criarDraftPedido(order));
        assert.equal(compararPedidoComDraft(order, draft).grupos.itens, false);
    });

    it("junta múltiplos grupos alterados no resumo", () => {
        const order = orderFixture();
        const draft = normalizarDraftPedido({ ...criarDraftPedido(order), customer: "Novo Nome", cep: "01000-000", discount: 10 });
        const diff = compararPedidoComDraft(order, draft);
        assert.equal(resumirAlteracoesPedido(diff), "cliente, recebimento, valores");
    });

    it("bug real encontrado no Quality Gate: mesma data de prazo com horas diferentes (meia-noite vs meio-dia) não deveria marcar dirty", () => {
        // O modal de novo pedido grava prazoEntrega com T00:00:00; o motor
        // reconstrói o valor do <input type=date> na edição completa com
        // T12:00:00 (evita escorregar de dia por fuso/DST) — mesma data,
        // milissegundo diferente. Sem normalizar por dia, o botão Salvar
        // aparecia habilitado (e o selo "Alterações não salvas" visível)
        // assim que a edição era aberta, sem o usuário tocar em nada.
        const meiaNoite = new Date("2026-08-05T00:00:00").getTime();
        const meioDia = new Date("2026-08-05T12:00:00").getTime();
        const order = orderFixture({ dueDate: meiaNoite });
        const draft = normalizarDraftPedido({ ...criarDraftPedido(order), dueDate: meioDia });
        const diff = compararPedidoComDraft(order, draft);
        assert.equal(diff.grupos.prazo, false);
        assert.equal(diff.alterado, false);
    });

    it("bug real encontrado no Quality Gate: texto de produtos customizado (diverge do que os itens gerariam) não deveria marcar dirty ao só abrir a edição", () => {
        // Mesmo cenário do teste de UI que falhou: o pedido nasceu com um
        // item (quantidade 1) mas o texto livre foi editado manualmente
        // pra outra coisa no modal de criação (marcarPedidoCampoEditadoManual).
        // criarDraftPedido() começava sempre com productsTextManual: false,
        // então normalizarDraftPedido() regenerava o texto a partir do
        // item (que dá "Camiseta P", sem sufixo pra quantidade 1) — String
        // diferente do texto customizado original, "alterado" ficava true
        // antes de qualquer clique.
        const order = orderFixture({
            items: [itemFixture({ quantidade: 1 })],
            productsText: "Camiseta P (editada manualmente pelo QA)"
        });
        const draft = criarDraftPedido(order);
        assert.equal(draft.productsTextManual, true);
        const normalizado = normalizarDraftPedido(draft);
        assert.equal(normalizado.productsText, order.productsText);
        assert.equal(compararPedidoComDraft(order, normalizado).alterado, false);
    });

    it("texto consistente com os itens continua não-manual (segue auto-atualizando)", () => {
        const order = orderFixture();
        const draft = criarDraftPedido(order);
        assert.equal(draft.productsTextManual, false);
    });

    it("prazo em dia realmente diferente continua marcando dirty", () => {
        const order = orderFixture({ dueDate: new Date("2026-08-05T00:00:00").getTime() });
        const draft = normalizarDraftPedido({ ...criarDraftPedido(order), dueDate: new Date("2026-08-06T00:00:00").getTime() });
        assert.equal(compararPedidoComDraft(order, draft).grupos.prazo, true);
    });

    it("nunca inclui texto livre de telefone/endereço no resumo — só nomes de grupo", () => {
        const order = orderFixture();
        const draft = normalizarDraftPedido({ ...criarDraftPedido(order), address: "Rua Sigilosa, 123" });
        const resumo = resumirAlteracoesPedido(compararPedidoComDraft(order, draft));
        assert.doesNotMatch(resumo, /Sigilosa/);
        assert.equal(resumo, "recebimento");
    });
});
