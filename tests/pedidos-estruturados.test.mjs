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
    produtosInteresseConvertidos
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
