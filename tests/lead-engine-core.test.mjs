// Hardening do Beta — Central Comercial de Leads (CRM-LEAD-001/002/003).
// Lógica pura extraída de lead-engine-v5.js pra lead-engine-core.js
// especificamente pra permitir estes testes sem DOM/Firestore.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    numericValue,
    stageProbability,
    resolveStageProbability,
    resolveProbabilidadeOrigem,
    inferProbabilidadeOrigem,
    suggestedProbabilityOnStatusChange,
    computeScore,
    normalizeStatus,
    PIPELINE_STAGES
} from "../lead-engine-core.js";

describe("CRM-LEAD-001 — numericValue não reinterpreta ponto decimal como milhar", () => {
    it("99.90 -> 99.9 (input type=number, formato US)", () => {
        assert.equal(numericValue("99.90"), 99.9);
    });
    it("99.9 -> 99.9", () => {
        assert.equal(numericValue("99.9"), 99.9);
    });
    it("0.99 -> 0.99", () => {
        assert.equal(numericValue("0.99"), 0.99);
    });
    it("1234.56 -> 1234.56", () => {
        assert.equal(numericValue("1234.56"), 1234.56);
    });
    it('"1.234,56" (formato BR, milhar+decimal) -> 1234.56', () => {
        assert.equal(numericValue("1.234,56"), 1234.56);
    });
    it('"1234,56" (formato BR, só decimal) -> 1234.56', () => {
        assert.equal(numericValue("1234,56"), 1234.56);
    });
    it("0 -> 0 (número já em JS, nunca passa por parsing de string)", () => {
        assert.equal(numericValue(0), 0);
    });
    it('"" (vazio) -> 0', () => {
        assert.equal(numericValue(""), 0);
    });
    it("undefined -> 0", () => {
        assert.equal(numericValue(undefined), 0);
    });
    it('"abc" (inválido) -> 0', () => {
        assert.equal(numericValue("abc"), 0);
    });
    it("número já persistido (Firestore) nunca é reinterpretado destrutivamente", () => {
        // Um valor JÁ NUMÉRICO (como vem do Firestore) retorna direto,
        // sem nunca passar pelo parsing de string — mesmo que o dígito
        // "pareça" formato BR se fosse (re)convertido pra string.
        assert.equal(numericValue(1234.56), 1234.56);
        assert.equal(numericValue(1234), 1234);
    });

    it('achado 8 (revisão adversarial): "1.234" (ambíguo, sem vírgula) é sempre tratado como decimal (1.234), nunca como milhar (1234)', () => {
        // Comportamento OFICIAL e deliberado (documentado no comentário de
        // numericValue): sem vírgula, o ponto SEMPRE é decimal — mesmo
        // quando tem exatamente 3 dígitos depois, o que em outro contexto
        // poderia "parecer" milhar formato BR. Investigado nesta revisão:
        // nenhum writer do repositório persiste esse formato como string
        // (valorOportunidade é sempre number nativo); este teste fixa o
        // comportamento atual pra qualquer mudança futura ser deliberada,
        // não acidental.
        assert.equal(numericValue("1.234"), 1.234);
    });
});

describe("CRM-LEAD-002 — probabilidade sincroniza com a etapa (sem sobrescrever valor manual)", () => {
    it("Novo -> Em contato = 25 (primeira troca, sem probabilidade anterior)", () => {
        const resolved = resolveStageProbability({
            currentProbability: stageProbability("novo"),
            probabilidadeOrigem: "automatic",
            nextStage: "em_contato"
        });
        assert.equal(resolved.probability, 25);
        assert.equal(resolved.probabilidadeOrigem, "automatic");
    });

    it("Em contato -> Qualificado = 50 (achado original: antes continuava 25)", () => {
        const resolved = resolveStageProbability({
            currentProbability: 25,
            probabilidadeOrigem: "automatic",
            nextStage: "qualificado"
        });
        assert.equal(resolved.probability, 50);
    });

    it("Qualificado -> Proposta = 70", () => {
        const resolved = resolveStageProbability({
            currentProbability: 50,
            probabilidadeOrigem: "automatic",
            nextStage: "proposta"
        });
        assert.equal(resolved.probability, 70);
    });

    it("Proposta -> Convertido = 100", () => {
        const resolved = resolveStageProbability({
            currentProbability: 70,
            probabilidadeOrigem: "automatic",
            nextStage: "convertido"
        });
        assert.equal(resolved.probability, 100);
        assert.equal(resolved.probabilidadeOrigem, "automatic");
    });

    it("Proposta -> Perdido = 0", () => {
        const resolved = resolveStageProbability({
            currentProbability: 70,
            probabilidadeOrigem: "automatic",
            nextStage: "perdido"
        });
        assert.equal(resolved.probability, 0);
        assert.equal(resolved.probabilidadeOrigem, "automatic");
    });

    it("probabilidade manual é preservada ao trocar de etapa (não sobrescreve silenciosamente)", () => {
        // Usuário setou manualmente 80% em "Em contato" (fora do default 25).
        const resolved = resolveStageProbability({
            currentProbability: 80,
            probabilidadeOrigem: "manual",
            nextStage: "qualificado"
        });
        assert.equal(resolved.probability, 80, "valor manual precisa ser preservado, não o default (50) da nova etapa");
        assert.equal(resolved.probabilidadeOrigem, "manual");
    });

    it("convertido/perdido sempre forçam 100/0 mesmo com probabilidade manual", () => {
        const paraConvertido = resolveStageProbability({
            currentProbability: 80,
            probabilidadeOrigem: "manual",
            nextStage: "convertido"
        });
        assert.equal(paraConvertido.probability, 100);
        assert.equal(paraConvertido.probabilidadeOrigem, "automatic");

        const paraPerdido = resolveStageProbability({
            currentProbability: 80,
            probabilidadeOrigem: "manual",
            nextStage: "perdido"
        });
        assert.equal(paraPerdido.probability, 0);
        assert.equal(paraPerdido.probabilidadeOrigem, "automatic");
    });

    it("resolveProbabilidadeOrigem: valor igual ao default da etapa continua automático", () => {
        assert.equal(resolveProbabilidadeOrigem({ status: "qualificado", probability: 50 }), "automatic");
    });

    it("resolveProbabilidadeOrigem: valor diferente do default da etapa vira manual", () => {
        assert.equal(resolveProbabilidadeOrigem({ status: "qualificado", probability: 90 }), "manual");
    });

    it("resolveProbabilidadeOrigem: convertido/perdido sempre automático, mesmo com 100/0 explícitos", () => {
        assert.equal(resolveProbabilidadeOrigem({ status: "convertido", probability: 100 }), "automatic");
        assert.equal(resolveProbabilidadeOrigem({ status: "perdido", probability: 0 }), "automatic");
    });

    it("PIPELINE_STAGES continua com o mapeamento de probabilidade esperado", () => {
        const map = Object.fromEntries(PIPELINE_STAGES.map((s) => [s.id, s.probability]));
        assert.deepEqual(map, {
            novo: 10,
            em_contato: 25,
            qualificado: 50,
            proposta: 70,
            convertido: 100,
            perdido: 0
        });
    });
});

describe("CRM-LEAD-002 (achado B2 da revisão adversarial final) — probabilidade manual não vira automatic por coincidência", () => {
    it("cenário 6 — manual=50 em em_contato, move pra qualificado (default TAMBÉM 50), salva sem tocar no valor: origem continua manual", () => {
        // saveLeadDetail() carrega o valor já salvo no campo (50, sem
        // handleDetailChange auto-preencher, já que a origem é manual) —
        // probability chega ao save exatamente igual a previousProbability.
        const origemAposSalvar = resolveProbabilidadeOrigem({
            status: "qualificado",
            probability: 50,
            previousProbability: 50,
            previousProbabilidadeOrigem: "manual"
        });
        assert.equal(origemAposSalvar, "manual", "não pode virar automatic só porque 50 coincide com o default de qualificado");
    });

    it("cenário 6 (continuação) — depois de salvar como manual, mover pra proposta preserva o valor (política atual pra manual)", () => {
        const resolved = resolveStageProbability({
            currentProbability: 50,
            probabilidadeOrigem: "manual",
            nextStage: "proposta"
        });
        assert.equal(resolved.probability, 50, "probabilidade manual continua 50 — não avança sozinha pro default de proposta (70)");
        assert.equal(resolved.probabilidadeOrigem, "manual");
    });

    it("cenário 7 — automático continua automático quando o valor realmente muda pra acompanhar a nova etapa", () => {
        // Lead automático em em_contato (25, default). handleDetailChange
        // auto-preenche o campo pro default de qualificado (50) porque a
        // origem é automatic — probability chega ao save DIFERENTE de
        // previousProbability (50 != 25).
        const origemAposSalvar = resolveProbabilidadeOrigem({
            status: "qualificado",
            probability: 50,
            previousProbability: 25,
            previousProbabilidadeOrigem: "automatic"
        });
        assert.equal(origemAposSalvar, "automatic");
    });

    it("cenário 7 (continuação) — sem tocar em nada (mesmo valor, mesma origem automatic), continua automatic", () => {
        const origemAposSalvar = resolveProbabilidadeOrigem({
            status: "em_contato",
            probability: 25,
            previousProbability: 25,
            previousProbabilidadeOrigem: "automatic"
        });
        assert.equal(origemAposSalvar, "automatic");
    });

    it("cenário 8 — convertido/perdido sempre 100/0 automatic no save, mesmo vindo de uma origem manual com valor inalterado", () => {
        const paraConvertido = resolveProbabilidadeOrigem({
            status: "convertido",
            probability: 100,
            previousProbability: 100,
            previousProbabilidadeOrigem: "manual"
        });
        assert.equal(paraConvertido, "automatic");

        const paraPerdido = resolveProbabilidadeOrigem({
            status: "perdido",
            probability: 0,
            previousProbability: 0,
            previousProbabilidadeOrigem: "manual"
        });
        assert.equal(paraPerdido, "automatic");
    });

    it("valor MUDOU de propósito pra coincidir com o default: reclassificado a partir do valor novo (comportamento pré-existente, não B2)", () => {
        // Usuário decide digitar manualmente 50 (o mesmo valor do default
        // de qualificado) — como o valor mudou de verdade (não é o mesmo
        // de antes), a heurística de comparação com o default continua
        // valendo, igual antes do achado B2.
        const origem = resolveProbabilidadeOrigem({
            status: "qualificado",
            probability: 50,
            previousProbability: 80,
            previousProbabilidadeOrigem: "manual"
        });
        assert.equal(origem, "automatic");
    });
});

describe("CRM-LEAD-002 (achado da revisão adversarial) — inferProbabilidadeOrigem: compatibilidade legada", () => {
    it("campo já persistido como manual/automatic é sempre respeitado, não reinferido", () => {
        assert.equal(inferProbabilidadeOrigem({ currentStage: "em_contato", currentProbability: 999, probabilidadeOrigem: "manual" }), "manual");
        assert.equal(inferProbabilidadeOrigem({ currentStage: "em_contato", currentProbability: 999, probabilidadeOrigem: "automatic" }), "automatic");
    });

    it("legado: em_contato + 80 + sem origem -> infere manual (80 diverge do default 25 de em_contato)", () => {
        assert.equal(inferProbabilidadeOrigem({ currentStage: "em_contato", currentProbability: 80, probabilidadeOrigem: undefined }), "manual");
    });

    it("legado: em_contato + 25 + sem origem -> infere automatic (25 é o default de em_contato)", () => {
        assert.equal(inferProbabilidadeOrigem({ currentStage: "em_contato", currentProbability: 25, probabilidadeOrigem: undefined }), "automatic");
    });

    it("legado: qualificado + 50 + sem origem -> infere automatic (50 é o default de qualificado)", () => {
        assert.equal(inferProbabilidadeOrigem({ currentStage: "qualificado", currentProbability: 50, probabilidadeOrigem: undefined }), "automatic");
    });

    it("pedido: novo + 70 + sem origem -> infere manual (70 diverge do default 10 de novo, nunca reinterpretado como automático)", () => {
        assert.equal(inferProbabilidadeOrigem({ currentStage: "novo", currentProbability: 70, probabilidadeOrigem: undefined }), "manual");
    });

    it("campo com valor inválido/desconhecido (nem manual nem automatic) também é tratado como ausente e reinferido", () => {
        assert.equal(inferProbabilidadeOrigem({ currentStage: "em_contato", currentProbability: 25, probabilidadeOrigem: "lixo" }), "automatic");
    });
});

describe("CRM-LEAD-002 (achado 4 da revisão adversarial) — todos os writers de etapa usam a mesma política", () => {
    it("legado: em_contato + 80 + sem origem -> qualificado -> mantém 80/manual (não é sobrescrito por 50)", () => {
        const origin = inferProbabilidadeOrigem({ currentStage: "em_contato", currentProbability: 80, probabilidadeOrigem: undefined });
        const resolved = resolveStageProbability({ currentProbability: 80, probabilidadeOrigem: origin, nextStage: "qualificado" });
        assert.equal(resolved.probability, 80);
        assert.equal(resolved.probabilidadeOrigem, "manual");
    });

    it("legado: em_contato + 25 + sem origem -> qualificado -> vira 50/automatic", () => {
        const origin = inferProbabilidadeOrigem({ currentStage: "em_contato", currentProbability: 25, probabilidadeOrigem: undefined });
        const resolved = resolveStageProbability({ currentProbability: 25, probabilidadeOrigem: origin, nextStage: "qualificado" });
        assert.equal(resolved.probability, 50);
        assert.equal(resolved.probabilidadeOrigem, "automatic");
    });

    it("legado: qualificado + 50 + sem origem -> proposta -> 70/automatic", () => {
        const origin = inferProbabilidadeOrigem({ currentStage: "qualificado", currentProbability: 50, probabilidadeOrigem: undefined });
        const resolved = resolveStageProbability({ currentProbability: 50, probabilidadeOrigem: origin, nextStage: "proposta" });
        assert.equal(resolved.probability, 70);
        assert.equal(resolved.probabilidadeOrigem, "automatic");
    });

    it("pedido: novo + 70 + sem origem -> em_contato -> mantém 70/manual (não vira 25 nem 10)", () => {
        const origin = inferProbabilidadeOrigem({ currentStage: "novo", currentProbability: 70, probabilidadeOrigem: undefined });
        const resolved = resolveStageProbability({ currentProbability: 70, probabilidadeOrigem: origin, nextStage: "em_contato" });
        assert.equal(resolved.probability, 70);
        assert.equal(resolved.probabilidadeOrigem, "manual");
    });

    it("convertido sempre 100/automatic, mesmo vindo de uma origem manual legada", () => {
        const resolved = resolveStageProbability({ currentProbability: 80, probabilidadeOrigem: "manual", nextStage: "convertido" });
        assert.equal(resolved.probability, 100);
        assert.equal(resolved.probabilidadeOrigem, "automatic");
    });

    it("perdido sempre 0/automatic, mesmo vindo de uma origem manual legada", () => {
        const resolved = resolveStageProbability({ currentProbability: 80, probabilidadeOrigem: "manual", nextStage: "perdido" });
        assert.equal(resolved.probability, 0);
        assert.equal(resolved.probabilidadeOrigem, "automatic");
    });
});

describe("CRM-LEAD-002 (achado 4 da revisão adversarial) — suggestedProbabilityOnStatusChange (handleDetailChange)", () => {
    it("origem automatic -> sugere o default da nova etapa (comportamento de antes, preservado)", () => {
        assert.equal(suggestedProbabilityOnStatusChange({ nextStage: "qualificado", probabilidadeOrigem: "automatic" }), 50);
    });

    it("origem manual -> não sugere nada (null), preserva o valor já digitado no campo", () => {
        assert.equal(suggestedProbabilityOnStatusChange({ nextStage: "qualificado", probabilidadeOrigem: "manual" }), null);
    });

    it("sem origem (lead novo, ainda sem lead selecionado) -> trata como automatic, sugere o default", () => {
        assert.equal(suggestedProbabilityOnStatusChange({ nextStage: "em_contato", probabilidadeOrigem: undefined }), 25);
    });

    it("convertido/perdido sempre sugerem 100/0, mesmo com origem manual", () => {
        assert.equal(suggestedProbabilityOnStatusChange({ nextStage: "convertido", probabilidadeOrigem: "manual" }), 100);
        assert.equal(suggestedProbabilityOnStatusChange({ nextStage: "perdido", probabilidadeOrigem: "manual" }), 0);
    });
});

describe("CRM-LEAD-003 — score é sempre derivado (fonte única de verdade)", () => {
    function leadBase(overrides = {}) {
        return {
            nome: "Lead de Teste",
            whatsapp: "5511999998888",
            email: "lead@teste.com",
            produtoInteresse: "Produto QA",
            origem: "landing-page",
            data: Date.now(),
            statusLead: "novo",
            ...overrides
        };
    }

    it("calcula um score inicial coerente pra um lead novo completo", () => {
        const score = computeScore(leadBase());
        assert.ok(score > 0 && score <= 100);
    });

    it("mudar a etapa muda o score corretamente (sem precisar de leadScore persistido)", () => {
        const leadNovo = leadBase({ statusLead: "novo" });
        const scoreNovo = computeScore(leadNovo);

        const leadProposta = leadBase({ statusLead: "proposta" });
        const scoreProposta = computeScore(leadProposta);

        assert.ok(scoreProposta > scoreNovo, "proposta deveria pontuar mais que novo (mesmos outros campos)");
    });

    it("mudar o valor da oportunidade influencia o score (0 -> >0 soma pontos)", () => {
        const semValor = computeScore(leadBase({ valorOportunidade: 0 }));
        const comValor = computeScore(leadBase({ valorOportunidade: 500 }));
        assert.ok(comValor > semValor);
    });

    it("mudar dados de contato (telefone/email válidos) influencia o score", () => {
        const semContato = computeScore(leadBase({ whatsapp: "", email: "" }));
        const comContato = computeScore(leadBase({ whatsapp: "5511999998888", email: "lead@teste.com" }));
        assert.ok(comContato > semContato);
    });

    it("um leadScore persistido obsoleto nunca é usado — computeScore ignora completamente esse campo", () => {
        const lead = leadBase({ statusLead: "novo", leadScore: 999 });
        const score = computeScore(lead);
        assert.notEqual(score, 999, "computeScore não deveria nunca devolver um valor fixo/obsoleto persistido");
        assert.ok(score <= 100);
    });

    it("perdido nunca ultrapassa 25, convertido é sempre 100", () => {
        assert.equal(computeScore(leadBase({ statusLead: "convertido" })), 100);
        assert.ok(computeScore(leadBase({ statusLead: "perdido" })) <= 25);
    });

    it("normalizeStatus reconhece sinônimos usados pelo pipeline", () => {
        assert.equal(normalizeStatus({ statusLead: "contato" }), "em_contato");
        assert.equal(normalizeStatus({ statusLead: "ganho" }), "convertido");
        assert.equal(normalizeStatus({ statusLead: "cancelado" }), "perdido");
        assert.equal(normalizeStatus({}), "novo");
    });
});
