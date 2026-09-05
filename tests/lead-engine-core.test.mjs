// Hardening do Beta — Central Comercial de Leads (CRM-LEAD-001/002/003).
// Lógica pura extraída de lead-engine-v5.js pra lead-engine-core.js
// especificamente pra permitir estes testes sem DOM/Firestore.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
    PIPELINE_STAGES,
    normalizeText,
    resolveLeadResponsible,
    resolveLeadFollowup,
    shouldWriteCanonicalValue,
    normalizeExtraFields,
    extraFieldsSearchText,
    extraFieldKeysForExport,
    csvCell
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

describe("CRM-LEAD-004 — camposExtras normalizados para UI, busca e CSV", () => {
    it("tolera ausente, null, vazio, array e string indevida", () => {
        for (const value of [undefined, null, {}, [], "indevido"]) {
            assert.deepEqual(normalizeExtraFields(value), []);
        }
    });

    it("normaliza escalares históricos, descarta inválidos, ordena e não muta", () => {
        const source = {
            cidade_preferida: " São Paulo ",
            idade: 27,
            aceitaContato: true,
            objeto: { segredo: true },
            vazio: "   ",
            "": "sem chave"
        };
        const before = structuredClone(source);
        assert.deepEqual(normalizeExtraFields(source), [
            { key: "aceitaContato", label: "Aceita Contato", value: "true" },
            { key: "cidade_preferida", label: "Cidade preferida", value: "São Paulo" },
            { key: "idade", label: "Idade", value: "27" }
        ]);
        assert.deepEqual(source, before);
    });

    it("ordem do objeto de entrada não altera a estrutura determinística", () => {
        assert.deepEqual(
            normalizeExtraFields({ zeta: "2", alfa: "1" }),
            normalizeExtraFields({ alfa: "1", zeta: "2" })
        );
    });

    it("texto de busca inclui chave, label e valor com suporte a acentos/case", () => {
        const search = normalizeText(extraFieldsSearchText({ cidade_preferida: "SÃO PAULO", perfil: "Designer" }));
        assert.match(search, /cidade preferida/);
        assert.match(search, /sao paulo/);
        assert.match(search, /designer/);
        assert.equal(extraFieldsSearchText(undefined), "");
    });

    it("união de chaves do CSV é ordenada e ignora extras inválidos/ausentes", () => {
        assert.deepEqual(extraFieldKeysForExport([
            { camposExtras: { segmento: "B2B", cidade: "Recife" } },
            {},
            { camposExtras: { cargo: "CEO", cidade: "Fortaleza" } },
            { camposExtras: [] }
        ]), ["cargo", "cidade", "segmento"]);
    });

    it("escapa aspas e neutraliza formula injection em qualquer célula textual", () => {
        assert.equal(csvCell('texto "seguro"'), '"texto ""seguro"""');
        assert.equal(csvCell("=2+2"), '"\'=2+2"');
        assert.equal(csvCell("+cmd"), '"\'+cmd"');
        assert.equal(csvCell("-1+1"), '"\'-1+1"');
        assert.equal(csvCell("@SUM(A1:A2)"), '"\'@SUM(A1:A2)"');
        assert.equal(csvCell("  =2+2"), '"\'  =2+2"');
    });

    it("payload semelhante a XSS permanece apenas texto na camada normalizada", () => {
        assert.deepEqual(normalizeExtraFields({ observacao: '<img src=x onerror="alert(1)">' }), [
            { key: "observacao", label: "Observacao", value: '<img src=x onerror="alert(1)">' }
        ]);
    });
});

describe("CRM-LEAD-005 — precedência explícita de responsável legado", () => {
    it("somente canônico", () => {
        assert.deepEqual(resolveLeadResponsible({ responsavelUid: "employee-a", responsavelNome: "Ana" }),
            { uid: "employee-a", name: "Ana", source: "canonical" });
    });
    it("somente legado", () => {
        assert.deepEqual(resolveLeadResponsible({ funcionarioResponsavel: "employee-old" }),
            { uid: "employee-old", name: "", source: "legacy" });
    });
    it("ambos iguais: canônico vence", () => {
        assert.equal(resolveLeadResponsible({ responsavelUid: "same", funcionarioResponsavel: "same" }).source, "canonical");
    });
    it("ambos divergentes: canônico vence", () => {
        assert.equal(resolveLeadResponsible({ responsavelUid: "canonical", funcionarioResponsavel: "legacy" }).uid, "canonical");
    });
    it("canônico vazio bloqueia fallback válido", () => {
        assert.deepEqual(resolveLeadResponsible({ responsavelUid: "", funcionarioResponsavel: "legacy" }),
            { uid: "", name: "", source: "canonical" });
    });
    it("canônico null bloqueia fallback válido", () => {
        assert.deepEqual(resolveLeadResponsible({ responsavelUid: null, funcionarioResponsavel: "legacy" }),
            { uid: "", name: "", source: "canonical" });
    });
    it("sem nenhum campo resulta em vazio sem inventar autoridade", () => {
        assert.deepEqual(resolveLeadResponsible({}), { uid: "", name: "", source: "none" });
    });
    it("salvar outro campo não materializa canônico no lead somente legado", () => {
        const lead = { funcionarioResponsavel: "employee-old" };
        assert.equal(shouldWriteCanonicalValue({
            record: lead, canonicalField: "responsavelUid",
            previousResolved: "employee-old", nextValue: "employee-old"
        }), false);
        assert.equal(shouldWriteCanonicalValue({
            record: lead, canonicalField: "responsavelUid",
            previousResolved: "employee-old", nextValue: ""
        }), true, "limpeza deliberada deve criar canônico vazio autoritativo");
    });
});

describe("CRM-LEAD-005 — precedência explícita de follow-up legado", () => {
    const canonical = "2026-09-01T12:00:00.000Z";
    const timestampLegacy = "2026-09-02T12:00:00.000Z";
    const dateLegacy = "2026-09-03";

    it("somente proximoContatoEm", () => {
        assert.equal(resolveLeadFollowup({ proximoContatoEm: canonical }).source, "canonical");
    });
    it("somente lembreteTimestamp", () => {
        assert.equal(resolveLeadFollowup({ lembreteTimestamp: timestampLegacy }).source, "lembreteTimestamp");
    });
    it("somente lembreteData", () => {
        const resolved = resolveLeadFollowup({ lembreteData: dateLegacy });
        assert.equal(resolved.source, "lembreteData");
        assert.equal(resolved.timestamp, new Date(`${dateLegacy}T00:00:00`).getTime(),
            "data legada deve preservar o dia no fuso local");
    });
    it("datas divergentes respeitam a ordem canônico > timestamp > data", () => {
        const all = resolveLeadFollowup({ proximoContatoEm: canonical, lembreteTimestamp: timestampLegacy, lembreteData: dateLegacy });
        assert.equal(all.timestamp, Date.parse(canonical));
        assert.equal(all.source, "canonical");
        assert.equal(resolveLeadFollowup({ lembreteTimestamp: timestampLegacy, lembreteData: dateLegacy }).timestamp, Date.parse(timestampLegacy));
    });
    it("proximoContatoEm null bloqueia todos os fallbacks", () => {
        assert.deepEqual(resolveLeadFollowup({ proximoContatoEm: null, lembreteTimestamp: timestampLegacy, lembreteData: dateLegacy }),
            { timestamp: 0, source: "canonical" });
    });
    it("nenhum campo resulta em zero", () => {
        assert.deepEqual(resolveLeadFollowup({}), { timestamp: 0, source: "none" });
    });
    it("salvar outro campo preserva semanticamente follow-up somente legado", () => {
        const lead = { lembreteData: dateLegacy };
        assert.equal(shouldWriteCanonicalValue({
            record: lead, canonicalField: "proximoContatoEm",
            previousResolved: "2026-09-03T00:00", nextValue: "2026-09-03T00:00"
        }), false);
    });
});

describe("CRM-LEAD-004/005 — contratos dos writers e renderer efetivos", () => {
    const dashboardSource = readFileSync("dashboard-app.js", "utf8");
    const dashboardHtml = readFileSync("dashboard.html", "utf8");
    const indexSource = readFileSync("index.html", "utf8");
    const studioUltimateSource = readFileSync("studio-ultimate.js", "utf8");

    it("renderer público cria name estável e o fallback envia camposExtras", () => {
        assert.match(indexSource, /function renderizarCamposFormulario\(campos\)/);
        assert.match(indexSource, /name="\$\{safeName\}"/);
        assert.match(indexSource, /baseName\.slice\(0, 60 - suffix\.length\)/,
            "sufixo de colisão deve sobreviver mesmo quando a chave-base já tem 60 caracteres");
        assert.match(indexSource, /camposExtras:\s*camposExtrasDoFormulario\(form\)/);
    });

    it("renderer efetivo gera names únicos/estáveis, inclusive em colisão e limite de 60 caracteres", () => {
        const start = indexSource.indexOf("function escaparAtributoFormulario");
        const end = indexSource.indexOf("function camposExtrasDoFormulario");
        assert.ok(start > 0 && end > start);
        const renderer = new Function(`${indexSource.slice(start, end)}; return renderizarCamposFormulario;`)();
        const longField = "campo_" + "x".repeat(80);
        const fields = ["nome", "whatsapp", "Empresa / Setor", "Empresa / Setor", longField, longField];
        const htmlA = renderer(fields);
        const htmlB = renderer(fields);
        const names = Array.from(htmlA.matchAll(/\sname="([^"]+)"/g), (match) => match[1]);
        assert.equal(htmlA, htmlB, "mesma definição deve produzir a mesma identidade");
        assert.equal(names.length, fields.length, "todo input submetível precisa de name");
        assert.equal(new Set(names).size, fields.length, "colisões devem ganhar sufixos únicos");
        assert.ok(names.every((name) => name.length <= 60));
        assert.deepEqual(names.slice(0, 4), ["nome", "whatsapp", "empresa_setor", "empresa_setor_2"]);
    });

    it("PR60-REV-001 — regressão: label que normaliza pro mesmo texto de um sufixo auto-gerado não colide", () => {
        const start = indexSource.indexOf("function escaparAtributoFormulario");
        const end = indexSource.indexOf("function camposExtrasDoFormulario");
        const renderer = new Function(`${indexSource.slice(start, end)}; return renderizarCamposFormulario;`)();

        // Campo 1 "Nome" -> nome; campo 2 "Nome" -> nome_2 (sufixo
        // automático); campo 3 "Nome_2" normaliza literalmente pro MESMO
        // texto "nome_2" que o campo 2 já recebeu — o bug antigo (contador
        // só por baseName) deixava os dois com name="nome_2".
        const htmlUnderscore = renderer(["Nome", "Nome", "Nome_2"]);
        const namesUnderscore = Array.from(htmlUnderscore.matchAll(/\sname="([^"]+)"/g), (m) => m[1]);
        assert.equal(namesUnderscore.length, 3);
        assert.equal(new Set(namesUnderscore).size, 3, "os 3 names finais precisam ser únicos");
        assert.deepEqual(namesUnderscore, ["nome", "nome_2", "nome_2_2"]);

        // Variante com hífen: "Nome-2" preserva o hífen na normalização
        // ([^a-z0-9_-]+ não converte "-" pra "_"), então não colide de fato
        // com o sufixo "_2" (que usa underscore) — mas os 3 names ainda
        // precisam sair únicos e estáveis, sem depender de coincidência.
        const htmlHifen = renderer(["Nome", "Nome", "Nome-2"]);
        const namesHifen = Array.from(htmlHifen.matchAll(/\sname="([^"]+)"/g), (m) => m[1]);
        assert.equal(new Set(namesHifen).size, 3, "os 3 names finais precisam ser únicos mesmo sem colisão literal");
        assert.deepEqual(namesHifen, ["nome", "nome_2", "nome-2"]);

        // Truncamento: dois labels longos que truncam pro MESMO texto de 60
        // caracteres, mais um terceiro cujo baseName (também truncado) já é
        // igual ao que o sufixo do segundo produziria — o Set de names
        // finais precisa resolver a cadeia toda, sempre respeitando o limite
        // de 60 caracteres já incluindo o sufixo.
        const longBase = "campo_muito_longo_" + "x".repeat(50); // > 60 chars antes do slice
        const htmlTruncado = renderer([longBase, longBase, longBase]);
        const namesTruncados = Array.from(htmlTruncado.matchAll(/\sname="([^"]+)"/g), (m) => m[1]);
        assert.equal(new Set(namesTruncados).size, 3, "colisão pós-truncamento também precisa ficar única");
        assert.ok(namesTruncados.every((name) => name.length <= 60), "name final nunca pode passar de 60 caracteres");
        assert.ok(namesTruncados[2].endsWith("_3"), "terceira ocorrência deve receber o próximo sufixo livre, não repetir _2");
    });

    it("PR60-REV-001 — fingerprint da tentativa diferencia alteração em qualquer camposExtras pós-colisão resolvida", () => {
        const fpStart = indexSource.indexOf("function fingerprintTentativaLeadPublicoLP");
        const fpEnd = indexSource.indexOf("\n\n    var caminho", fpStart);
        assert.ok(fpStart > 0 && fpEnd > fpStart, "marcadores de extração da função de fingerprint precisam existir");
        const fingerprint = new Function(`${indexSource.slice(fpStart, fpEnd)}; return fingerprintTentativaLeadPublicoLP;`)();

        const base = { publicPageId: "p1", formularioId: "f1", nome: "Ana", whatsapp: "11988887777", email: "a@a.com" };
        const fpA = fingerprint({ ...base, camposExtras: { nome_2: "valor-2", nome_2_2: "valor-3" } });
        const fpB = fingerprint({ ...base, camposExtras: { nome_2: "valor-2", nome_2_2: "VALOR-DIFERENTE" } });
        const fpC = fingerprint({ ...base, camposExtras: { nome_2_2: "valor-3", nome_2: "valor-2" } });
        assert.notEqual(fpA, fpB, "alterar só o campo resolvido por colisão precisa mudar o fingerprint");
        assert.equal(fpA, fpC, "ordem de inserção das chaves não pode afetar o fingerprint (canonicamente ordenado)");
    });

    function extrairRendererReal() {
        const start = indexSource.indexOf("function escaparAtributoFormulario");
        const end = indexSource.indexOf("function camposExtrasDoFormulario");
        assert.ok(start > 0 && end > start);
        return new Function(`${indexSource.slice(start, end)}; return renderizarCamposFormulario;`)();
    }

    it("PR60-SMOKE-001 — strings legadas continuam type=text (exceto whatsapp) e nunca required", () => {
        const renderer = extrairRendererReal();
        const html = renderer(["nome", "email", "whatsapp", "telefone"]);
        // Comportamento pré-existente, preservado: "email"/"telefone" como
        // string SEMPRE viram type="text" (nunca type="email"/"tel") —
        // só um objeto estruturado pode declarar tipo. Regressão aqui
        // significaria mudar o HTML de toda LP publicada antes desta PR.
        const tipos = Array.from(html.matchAll(/<input type="([^"]+)"/g), (m) => m[1]);
        assert.deepEqual(tipos, ["text", "text", "tel", "text"]);
        assert.doesNotMatch(html, /required/, "string legada nunca pode ganhar required");
    });

    it("PR60-SMOKE-001 — campo personalizado objeto respeita type da allowlist, com fallback text pra tipo inválido", () => {
        const renderer = extrairRendererReal();
        const campos = [
            { name: "empresa", label: "Empresa", type: "text" },
            { name: "email_alt", label: "E-mail alternativo", type: "email" },
            { name: "telefone_extra", label: "Telefone extra", type: "tel" },
            { name: "idade", label: "Idade", type: "number" },
            { name: "nascimento", label: "Nascimento", type: "date" },
            { name: "observacao", label: "Observação", type: "textarea" },
            { name: "invalido", label: "Campo inválido", type: "<script>" }
        ];
        const html = renderer(campos);
        assert.match(html, /<input type="text" name="empresa"/);
        assert.match(html, /<input type="email" name="email_alt"/);
        assert.match(html, /<input type="tel" name="telefone_extra"/);
        assert.doesNotMatch(html, /inputmode="numeric"/, "tel customizado não herda a máscara específica do whatsapp canônico");
        assert.match(html, /<input type="number" name="idade"/);
        assert.match(html, /<input type="date" name="nascimento"/);
        assert.match(html, /<textarea name="observacao"/, "type=textarea precisa virar elemento <textarea> real");
        assert.doesNotMatch(html, /<input[^>]*name="observacao"/, "textarea não pode também virar <input>");
        assert.match(html, /<input type="text" name="invalido"/, "tipo desconhecido cai em text, nunca no valor bruto recebido");
        assert.doesNotMatch(html, /<script>/, "tipo inválido nunca deve ser refletido cru no HTML");
    });

    it("PR60-SMOKE-001 — required só é aplicado quando o objeto declara required:true explicitamente", () => {
        const renderer = extrairRendererReal();
        const html = renderer([
            { name: "obrigatorio", label: "Obrigatório", type: "text", required: true },
            { name: "opcional_false", label: "Opcional explícito", type: "text", required: false },
            { name: "opcional_ausente", label: "Opcional por omissão", type: "text" }
        ]);
        assert.match(html, /name="obrigatorio"[^>]*\srequired/);
        assert.doesNotMatch(html, /name="opcional_false"[^>]*\srequired/);
        assert.doesNotMatch(html, /name="opcional_ausente"[^>]*\srequired/);
    });

    it("PR60-SMOKE-001 — whatsapp canônico preserva tel/numeric/maxlength mesmo se vier como objeto (defesa em profundidade)", () => {
        const renderer = extrairRendererReal();
        // Ninguém pode criar um campo personalizado chamado "whatsapp" pela
        // UI (nome reservado), mas o renderer é a última linha de defesa:
        // mesmo recebendo um objeto cujo name normalize pra "whatsapp",
        // ele precisa continuar como o campo canônico, nunca herdando
        // type/required customizados.
        const html = renderer([{ name: "whatsapp", label: "Whatsapp", type: "textarea", required: true }]);
        assert.match(html, /<input type="tel" name="whatsapp" inputmode="numeric" maxlength="11"/);
        assert.doesNotMatch(html, /<textarea/);
        assert.doesNotMatch(html, /required/);
    });

    it("PR61-REV-004 — outros nomes reservados (não só whatsapp) também não herdam type/required customizado como objeto", () => {
        const renderer = extrairRendererReal();
        // A Studio Ultimate já recusa criar um campo personalizado com
        // esses nomes — isso só importa se um documento chegar aqui fora
        // desse caminho (escrita direta no Firestore). Mesmo assim, um
        // objeto malformado não pode virar um <textarea required> pra um
        // slot reservado como email/nome/telefone/phone/name/website.
        const html = renderer([
            { name: "email", label: "E-mail", type: "textarea", required: true },
            { name: "nome", label: "Nome", type: "number", required: true },
            { name: "telefone", label: "Telefone", type: "date", required: true }
        ]);
        assert.match(html, /<input type="text" name="email"/);
        assert.match(html, /<input type="text" name="nome"/);
        assert.match(html, /<input type="text" name="telefone"/);
        assert.doesNotMatch(html, /<textarea/);
        assert.doesNotMatch(html, /required/);
    });

    function extrairReservaAutoriaReal() {
        const start = studioUltimateSource.indexOf("const NOMES_RESERVADOS_CAMPO_FORM");
        const end = studioUltimateSource.indexOf("function camposPersonalizados");
        assert.ok(start > 0 && end > start, "marcadores de extração da reserva de nomes da autoria precisam existir");
        return new Function(`${studioUltimateSource.slice(start, end)}; return { NOMES_RESERVADOS_CAMPO_FORM, normalizarNomeCampoPersonalizado };`)();
    }

    it("PR61-REV-006 — normalização real do name: \"__proto__\" já vira \"proto\" (underscores nas pontas são removidos); \"prototype\"/\"constructor\" passam intactos", () => {
        const { normalizarNomeCampoPersonalizado } = extrairReservaAutoriaReal();
        // Fato verificado na função real (não é comportamento alterado por
        // esta correção): replace(/^_+|_+$/g, "") remove os underscores das
        // pontas, então um label "__proto__" NUNCA chega em name="__proto__"
        // literal — vira "proto" antes de qualquer checagem de reservado,
        // em ambos os lados (autoria e renderer, que usam o mesmo
        // algoritmo). "prototype" e "constructor" não têm underscore nas
        // pontas, então atravessam a normalização sem qualquer alteração —
        // são o gap real que esta correção fecha.
        assert.equal(normalizarNomeCampoPersonalizado("__proto__"), "proto");
        assert.equal(normalizarNomeCampoPersonalizado("prototype"), "prototype");
        assert.equal(normalizarNomeCampoPersonalizado("constructor"), "constructor");
    });

    it("PR61-REV-006 — autoria recusa __proto__/prototype/constructor como nomes reservados", () => {
        const { NOMES_RESERVADOS_CAMPO_FORM } = extrairReservaAutoriaReal();
        for (const nome of ["__proto__", "prototype", "constructor"]) {
            assert.ok(NOMES_RESERVADOS_CAMPO_FORM.has(nome),
                `"${nome}" precisa estar na lista de nomes reservados da autoria`);
        }
    });

    it("PR61-REV-006 — renderer não deixa \"prototype\"/\"constructor\" herdarem type/required customizado como objeto", () => {
        const renderer = extrairRendererReal();
        // Mesma defesa em profundidade da PR61-REV-004, estendida aos
        // nomes prototype-ish alcançáveis (sem underscore nas pontas, que
        // sobrevivem à normalização de baseName sem alteração).
        const html = renderer([
            { name: "prototype", label: "Prototype", type: "number", required: true },
            { name: "constructor", label: "Constructor", type: "date", required: true }
        ]);
        assert.match(html, /<input type="text" name="prototype"/);
        assert.match(html, /<input type="text" name="constructor"/);
        assert.doesNotMatch(html, /required/);
    });

    it("PR61-REV-006 — __proto__ como name de objeto já é neutralizado pela normalização de baseName do renderer, independente desta correção", () => {
        const renderer = extrairRendererReal();
        // baseName normaliza campo.name/label do MESMO jeito que o lado da
        // autoria — "__proto__" vira "proto" antes de qualquer checagem de
        // reservado, então mesmo um documento malformado com name:"__proto__"
        // nunca produz name="__proto__" no HTML final. Comportamento
        // pré-existente (não alterado por esta correção), registrado aqui
        // pra travar a suposição como regressão futura.
        const html = renderer([{ name: "__proto__", label: "Proto", type: "textarea", required: true }]);
        assert.doesNotMatch(html, /name="__proto__"/);
        assert.match(html, /name="proto"/);
    });

    it("writers legados alcançáveis gravam somente o contrato canônico", () => {
        const responsavelWriter = dashboardSource.match(/window\.aplicarFuncionarioEmMassa[\s\S]*?window\.aplicarEtiquetaEmMassa/)?.[0] || "";
        const lembreteWriter = dashboardSource.match(/window\.aplicarLembreteEmMassa[\s\S]*?window\.copiarWhatsappsSelecionados/)?.[0] || "";
        assert.match(responsavelWriter, /responsavelUid/);
        assert.match(responsavelWriter, /responsavelNome/);
        assert.doesNotMatch(responsavelWriter, /funcionarioResponsavel/);
        assert.match(lembreteWriter, /proximoContatoEm/);
        assert.doesNotMatch(lembreteWriter, /lembreteData\s*:/);
    });

    it("tela legada redireciona pelo mesmo data-target e filtra funcionários ativos", () => {
        assert.match(dashboardHtml, /class="aura-hub-card" data-target="view-automacao-leads"/);
        assert.match(dashboardSource, /funcionario\.status === "ativo"/);
        assert.match(dashboardSource, /funcUID !== usuarioUID && !funcionario/);
    });
});
