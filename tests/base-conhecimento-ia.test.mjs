import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    CRITERIOS_PRONTIDAO,
    LIMITES_CONHECIMENTO,
    PRIORIDADES_CONHECIMENTO,
    STATUS_CONHECIMENTO,
    TIPOS_CONHECIMENTO,
    calcularProntidaoIA,
    classificarProntidao,
    filtrarItensConhecimento,
    montarConteudoProdutoRefs,
    normalizarProdutoRefs,
    normalizarTagsConhecimento,
    validarItemConhecimento
} from "../base-conhecimento-ia.js";

function itemValido(overrides = {}) {
    return {
        titulo: "Qual o prazo de entrega?",
        conteudo: "Enviamos em até 3 dias úteis para todo o Brasil.",
        resumo: "Prazo padrão de entrega.",
        tipo: "faq",
        status: "ativo",
        prioridade: "normal",
        tags: ["entrega", "prazo"],
        ativo: true,
        ...overrides
    };
}

describe("validação de item de conhecimento", () => {
    it("aceita um item completo e válido", () => {
        assert.equal(validarItemConhecimento(itemValido()), "");
    });

    it("rejeita título curto, longo ou ausente", () => {
        assert.notEqual(validarItemConhecimento(itemValido({ titulo: "ab" })), "");
        assert.notEqual(validarItemConhecimento(itemValido({ titulo: "" })), "");
        assert.notEqual(validarItemConhecimento(itemValido({ titulo: "x".repeat(LIMITES_CONHECIMENTO.tituloMax + 1) })), "");
    });

    it("rejeita conteúdo vazio ou acima do limite", () => {
        assert.notEqual(validarItemConhecimento(itemValido({ conteudo: "   " })), "");
        assert.notEqual(validarItemConhecimento(itemValido({ conteudo: "x".repeat(LIMITES_CONHECIMENTO.conteudoMax + 1) })), "");
    });

    it("rejeita enums fora das opções fechadas", () => {
        assert.notEqual(validarItemConhecimento(itemValido({ tipo: "outro" })), "");
        assert.notEqual(validarItemConhecimento(itemValido({ status: "publicado" })), "");
        assert.notEqual(validarItemConhecimento(itemValido({ prioridade: "urgente" })), "");
    });

    it("todos os tipos, status e prioridades declarados são aceitos", () => {
        for (const tipo of Object.keys(TIPOS_CONHECIMENTO)) {
            assert.equal(validarItemConhecimento(itemValido({ tipo })), "", tipo);
        }
        for (const status of Object.keys(STATUS_CONHECIMENTO)) {
            assert.equal(validarItemConhecimento(itemValido({ status })), "", status);
        }
        for (const prioridade of Object.keys(PRIORIDADES_CONHECIMENTO)) {
            assert.equal(validarItemConhecimento(itemValido({ prioridade })), "", prioridade);
        }
    });
});

describe("normalização de tags", () => {
    it("divide por vírgula, remove vazios/duplicados e limita a 10", () => {
        assert.deepEqual(
            normalizarTagsConhecimento("Entrega, PRAZO , entrega,, frete"),
            ["entrega", "prazo", "frete"]
        );
        const muitas = Array.from({ length: 15 }, (_, i) => `tag${i}`).join(",");
        assert.equal(normalizarTagsConhecimento(muitas).length, LIMITES_CONHECIMENTO.maxTags);
    });

    it("aceita array direto e corta tags longas", () => {
        const [unica] = normalizarTagsConhecimento(["x".repeat(100)]);
        assert.equal(unica.length, LIMITES_CONHECIMENTO.tagMax);
    });
});

describe("filtros e busca", () => {
    const itens = [
        itemValido({ id: "1", tipo: "faq", status: "ativo", titulo: "Prazo de entrega" }),
        itemValido({ id: "2", tipo: "politica", status: "rascunho", titulo: "Política de troca", tags: ["troca"] }),
        itemValido({ id: "3", tipo: "empresa", status: "arquivado", titulo: "Nossa história" })
    ];

    it("filtra por tipo e por status", () => {
        assert.deepEqual(filtrarItensConhecimento(itens, { tipo: "politica" }).map(i => i.id), ["2"]);
        assert.deepEqual(filtrarItensConhecimento(itens, { status: "arquivado" }).map(i => i.id), ["3"]);
    });

    it("busca em título, conteúdo e tags, sem diferenciar maiúsculas", () => {
        assert.deepEqual(filtrarItensConhecimento(itens, { busca: "TROCA" }).map(i => i.id), ["2"]);
        assert.deepEqual(filtrarItensConhecimento(itens, { busca: "história" }).map(i => i.id), ["3"]);
        assert.equal(filtrarItensConhecimento(itens, { busca: "inexistente" }).length, 0);
    });
});

describe("indicador de prontidão", () => {
    it("os pesos dos critérios somam exatamente 100", () => {
        const total = CRITERIOS_PRONTIDAO.reduce((soma, c) => soma + c.pontos, 0);
        assert.equal(total, 100);
    });

    it("sem nada configurado fica em 0, Incompleta, com todos os critérios pendentes", () => {
        const resultado = calcularProntidaoIA({ config: null, itens: [] });
        assert.equal(resultado.pontos, 0);
        assert.equal(resultado.pendentes.length, CRITERIOS_PRONTIDAO.length);
        assert.equal(classificarProntidao(resultado.pontos).rotulo, "Incompleta");
    });

    it("com tudo configurado chega a 100, Preparada, sem pendências", () => {
        const config = {
            nomeAssistente: "Aura",
            mensagemApresentacao: "Olá!",
            mensagemFallback: "Vou encaminhar.",
            instrucoes: "Seja simpática.",
            canais: { lojaPublica: true }
        };
        const itens = [
            itemValido({ tipo: "empresa" }),
            itemValido({ tipo: "politica" }),
            itemValido({ tipo: "faq" })
        ];
        const resultado = calcularProntidaoIA({ config, itens });
        assert.equal(resultado.pontos, 100);
        assert.equal(resultado.pendentes.length, 0);
        assert.equal(classificarProntidao(resultado.pontos).rotulo, "Preparada");
    });

    it("itens arquivados ou inativos não contam", () => {
        const itens = [
            itemValido({ tipo: "faq", status: "arquivado" }),
            itemValido({ tipo: "empresa", ativo: false })
        ];
        const resultado = calcularProntidaoIA({ config: null, itens });
        assert.equal(resultado.atendidos.faq, false);
        assert.equal(resultado.atendidos.empresa, false);
    });

    it("faixas de classificação nos limites", () => {
        assert.equal(classificarProntidao(20).rotulo, "Incompleta");
        assert.equal(classificarProntidao(21).rotulo, "Inicial");
        assert.equal(classificarProntidao(50).rotulo, "Inicial");
        assert.equal(classificarProntidao(51).rotulo, "Boa");
        assert.equal(classificarProntidao(75).rotulo, "Boa");
        assert.equal(classificarProntidao(76).rotulo, "Preparada");
    });
});

describe("produtos por referência (tipo 'produto', sem duplicar cadastro)", () => {
    it("normaliza, remove duplicados e vazios, respeita o teto", () => {
        assert.deepEqual(normalizarProdutoRefs(["p1", "p2", "p1", "", null, "p3"]), ["p1", "p2", "p3"]);
        assert.deepEqual(normalizarProdutoRefs(Array.from({ length: 25 }, (_, i) => `p${i}`)).length, LIMITES_CONHECIMENTO.produtoRefsMax);
    });

    it("valor não-array vira lista vazia, sem lançar erro", () => {
        assert.deepEqual(normalizarProdutoRefs(null), []);
        assert.deepEqual(normalizarProdutoRefs(undefined), []);
        assert.deepEqual(normalizarProdutoRefs("p1"), []);
    });

    it("monta o conteúdo a partir dos produtos reais (nome, preço, descrição)", () => {
        const texto = montarConteudoProdutoRefs([
            { nome: "Caneca azul", preco: 39.9, descricao: "Caneca de cerâmica 300ml" },
            { nome: "Camiseta preta", preco: 59 }
        ]);
        assert.match(texto, /Caneca azul — R\$\s?39,90: Caneca de cerâmica 300ml/);
        assert.match(texto, /Camiseta preta — R\$\s?59,00/);
        assert.equal(texto.split("\n").length, 2);
    });

    it("lista vazia ou inválida vira texto vazio, nunca lança erro", () => {
        assert.equal(montarConteudoProdutoRefs([]), "");
        assert.equal(montarConteudoProdutoRefs(null), "");
    });

    it("produto sem nome usa um rótulo padrão, nunca 'undefined'", () => {
        const texto = montarConteudoProdutoRefs([{ preco: 10 }]);
        assert.match(texto, /^Produto sem nome/);
    });

    it("item de conhecimento tipo 'produto' com conteúdo montado a partir de produtoIds continua válido", () => {
        const produtos = [{ id: "prod1", nome: "Caneca azul", preco: 39.9 }];
        const item = {
            titulo: "Caneca azul — referência de catálogo",
            tipo: "produto",
            status: "ativo",
            prioridade: "normal",
            conteudo: montarConteudoProdutoRefs(produtos),
            produtoIds: normalizarProdutoRefs(["prod1"])
        };
        assert.equal(validarItemConhecimento(item), "");
    });
});
