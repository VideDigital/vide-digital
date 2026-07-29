import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    normalizarTextoCatalogo,
    produtoCorrespondeBusca,
    calcularResumoCatalogoDeCards,
    valorBuscaCatalogoEhAutofillIndevido,
    buscaCatalogoSemResultados
} from "../catalogo-produtos-core.js";

describe("normalizarTextoCatalogo", () => {
    it("remove acentos e normaliza caixa/espaços", () => {
        assert.equal(normalizarTextoCatalogo("  Café Prêmium  "), "cafe premium");
    });

    it("nunca lança em valores ausentes", () => {
        assert.equal(normalizarTextoCatalogo(undefined), "");
        assert.equal(normalizarTextoCatalogo(null), "");
    });
});

describe("produtoCorrespondeBusca", () => {
    const produto = { nome: "Vestido Azul", descricao: "Tecido leve", categoria: "Roupas", tipo: "fisico" };

    it("termo vazio sempre corresponde (mostra tudo)", () => {
        assert.equal(produtoCorrespondeBusca(produto, ""), true);
    });

    it("corresponde por nome, ignorando acento/caixa", () => {
        assert.equal(produtoCorrespondeBusca(produto, normalizarTextoCatalogo("vestido")), true);
    });

    it("corresponde por categoria ou tipo", () => {
        assert.equal(produtoCorrespondeBusca(produto, normalizarTextoCatalogo("roupas")), true);
        assert.equal(produtoCorrespondeBusca(produto, normalizarTextoCatalogo("fisico")), true);
    });

    it("não corresponde a termo estranho, como um e-mail", () => {
        assert.equal(produtoCorrespondeBusca(produto, normalizarTextoCatalogo("danielmarcelino549@gmail.com")), false);
    });
});

describe("calcularResumoCatalogoDeCards", () => {
    it("calcula total, preço médio, estoque baixo e descontos", () => {
        const resumo = calcularResumoCatalogoDeCards([
            { preco: "100", estoque: "3", desconto: "10" },
            { preco: "50", estoque: "20", desconto: "0" }
        ]);
        assert.equal(resumo.total, 2);
        assert.equal(resumo.precoMedio, 75);
        assert.equal(resumo.estoqueBaixo, 1);
        assert.equal(resumo.comDesconto, 1);
    });

    it("lista vazia nunca quebra e devolve tudo zerado", () => {
        assert.deepEqual(calcularResumoCatalogoDeCards([]), { total: 0, precoMedio: 0, estoqueBaixo: 0, comDesconto: 0 });
    });

    it("ignora estoque vazio/indefinido no cálculo de estoque baixo", () => {
        const resumo = calcularResumoCatalogoDeCards([{ preco: "10", estoque: "", desconto: "0" }]);
        assert.equal(resumo.estoqueBaixo, 0);
    });

    it("aceita entrada não-array sem lançar", () => {
        assert.deepEqual(calcularResumoCatalogoDeCards(undefined), { total: 0, precoMedio: 0, estoqueBaixo: 0, comDesconto: 0 });
    });
});

describe("valorBuscaCatalogoEhAutofillIndevido", () => {
    it("detecta autofill do e-mail autenticado antes de qualquer digitação humana", () => {
        const resultado = valorBuscaCatalogoEhAutofillIndevido({
            valorAtual: "danielmarcelino549@gmail.com",
            emailAutenticado: "danielmarcelino549@gmail.com",
            houveDigitacaoHumana: false
        });
        assert.equal(resultado, true);
    });

    it("é insensível a caixa e espaços nas pontas", () => {
        const resultado = valorBuscaCatalogoEhAutofillIndevido({
            valorAtual: "  Daniel@Example.com  ",
            emailAutenticado: "daniel@example.com",
            houveDigitacaoHumana: false
        });
        assert.equal(resultado, true);
    });

    it("nunca apaga uma busca real, mesmo que coincida com o e-mail, se houve digitação humana", () => {
        const resultado = valorBuscaCatalogoEhAutofillIndevido({
            valorAtual: "daniel@example.com",
            emailAutenticado: "daniel@example.com",
            houveDigitacaoHumana: true
        });
        assert.equal(resultado, false);
    });

    it("não mexe em uma busca real digitada que não é o e-mail", () => {
        const resultado = valorBuscaCatalogoEhAutofillIndevido({
            valorAtual: "vestido azul",
            emailAutenticado: "daniel@example.com",
            houveDigitacaoHumana: false
        });
        assert.equal(resultado, false);
    });

    it("campo vazio nunca é considerado autofill indevido", () => {
        const resultado = valorBuscaCatalogoEhAutofillIndevido({
            valorAtual: "",
            emailAutenticado: "daniel@example.com",
            houveDigitacaoHumana: false
        });
        assert.equal(resultado, false);
    });

    it("sem e-mail autenticado conhecido, nunca apaga nada", () => {
        const resultado = valorBuscaCatalogoEhAutofillIndevido({
            valorAtual: "qualquer coisa",
            emailAutenticado: "",
            houveDigitacaoHumana: false
        });
        assert.equal(resultado, false);
    });
});

describe("buscaCatalogoSemResultados", () => {
    it("verdadeiro só quando há cards renderizados, nenhum visível e uma busca ativa", () => {
        assert.equal(buscaCatalogoSemResultados({ totalCardsRenderizados: 2, totalCardsVisiveis: 0, termoBusca: "xpto" }), true);
    });

    it("falso quando não há produtos renderizados (catálogo vazio de verdade)", () => {
        assert.equal(buscaCatalogoSemResultados({ totalCardsRenderizados: 0, totalCardsVisiveis: 0, termoBusca: "xpto" }), false);
    });

    it("falso quando existem cards visíveis", () => {
        assert.equal(buscaCatalogoSemResultados({ totalCardsRenderizados: 2, totalCardsVisiveis: 1, termoBusca: "xpto" }), false);
    });

    it("falso quando não há termo de busca (campo vazio)", () => {
        assert.equal(buscaCatalogoSemResultados({ totalCardsRenderizados: 2, totalCardsVisiveis: 0, termoBusca: "" }), false);
    });
});
