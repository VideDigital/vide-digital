import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    normalizarTextoCatalogo,
    produtoCorrespondeBusca,
    calcularResumoCatalogoDeCards,
    valorBuscaCatalogoEhAutofillIndevido,
    buscaCatalogoSemResultados,
    deveRestaurarAbaSalva,
    criarControladorDeCargaSequencial
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

// VIDE-HUB-RECOVERY-011 (reconstrução): a restauração tardia da aba salva
// (dentro de onAuthStateChanged, depois de perfil/banners carregarem) não
// pode reverter uma navegação explícita que já tenha acontecido nesse
// meio-tempo — só "view-dashboard" (o único estado ativo estático do HTML
// antes de qualquer navegação) é seguro para restaurar por cima.
describe("deveRestaurarAbaSalva", () => {
    it("permite restaurar quando a aba ativa ainda é a padrão (nada navegou ainda)", () => {
        assert.equal(deveRestaurarAbaSalva("view-dashboard"), true);
    });

    it("permite restaurar quando não há nenhuma aba ativa detectável (fallback seguro do comportamento original)", () => {
        assert.equal(deveRestaurarAbaSalva(undefined), true);
        assert.equal(deveRestaurarAbaSalva(null), true);
        assert.equal(deveRestaurarAbaSalva(""), true);
    });

    it("bloqueia a restauração quando já houve navegação explícita para Produtos antes da restauração rodar", () => {
        assert.equal(deveRestaurarAbaSalva("view-produtos"), false);
    });

    it("bloqueia a restauração para qualquer outra aba que não seja a padrão", () => {
        assert.equal(deveRestaurarAbaSalva("view-catalogo"), false);
        assert.equal(deveRestaurarAbaSalva("view-pedidos"), false);
    });
});

// VIDE-HUB-RECOVERY-011 (reconstrução): reproduz a race real relatada —
// carregarProdutos disparado de novo (navegação rápida Produtos <-> Catálogo)
// antes da consulta anterior terminar, com a resposta MAIS ANTIGA chegando
// DEPOIS da mais nova (fora de ordem). Sem o token de sequência, a resposta
// antiga sobrescreveria a mais recente já renderizada.
describe("criarControladorDeCargaSequencial", () => {
    it("a única carga em andamento é sempre a mais recente", () => {
        const controlador = criarControladorDeCargaSequencial();
        const carga = controlador.iniciarNovaCarga();
        assert.equal(controlador.ehCargaMaisRecente(carga), true);
    });

    it("uma carga antiga deixa de ser a mais recente assim que uma nova começa — mesmo que a antiga ainda não tenha resolvido", () => {
        const controlador = criarControladorDeCargaSequencial();
        const cargaAntiga = controlador.iniciarNovaCarga(); // navegação 1 (ex.: abre Produtos)
        const cargaNova = controlador.iniciarNovaCarga();   // navegação 2 (ex.: troca rápido pra Catálogo)
        assert.equal(controlador.ehCargaMaisRecente(cargaNova), true, "a carga mais nova precisa continuar válida");
        assert.equal(controlador.ehCargaMaisRecente(cargaAntiga), false, "a carga antiga precisa ser considerada obsoleta");
    });

    it("reproduz a resolução fora de ordem: a resposta antiga chega DEPOIS da nova e deve ser descartada", async () => {
        const controlador = criarControladorDeCargaSequencial();
        const resultadosAplicados = [];

        function simularCarga(nome, atrasoMs) {
            const minhaCarga = controlador.iniciarNovaCarga();
            return new Promise(resolve => {
                setTimeout(() => {
                    if (controlador.ehCargaMaisRecente(minhaCarga)) {
                        resultadosAplicados.push(nome);
                    }
                    resolve();
                }, atrasoMs);
            });
        }

        // "antiga" começa primeiro mas demora mais (ex.: query mais pesada,
        // Emulator sob carga); "nova" começa depois e resolve primeiro —
        // exatamente o cenário relatado pelo Astra.
        const antiga = simularCarga("antiga", 40);
        const nova = simularCarga("nova", 5);
        await Promise.all([antiga, nova]);

        assert.deepEqual(
            resultadosAplicados,
            ["nova"],
            "só a carga mais recente pode aplicar seu resultado ao DOM, mesmo resolvendo fora de ordem"
        );
    });

    it("sem nenhuma navegação concorrente, uma única carga sempre aplica seu resultado", async () => {
        const controlador = criarControladorDeCargaSequencial();
        const resultadosAplicados = [];
        const minhaCarga = controlador.iniciarNovaCarga();
        await new Promise(resolve => setTimeout(resolve, 5));
        if (controlador.ehCargaMaisRecente(minhaCarga)) resultadosAplicados.push("unica");
        assert.deepEqual(resultadosAplicados, ["unica"]);
    });
});
