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
