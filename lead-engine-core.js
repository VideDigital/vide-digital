// Lógica pura da Central Comercial de Leads (lead-engine-v5.js).
// Sem DOM, sem Firestore — só funções determinísticas, testáveis
// isoladamente (ver tests/lead-engine-core.test.mjs). Extraído do
// arquivo principal durante o hardening do Beta (CRM-LEAD-001/002/003)
// especificamente pra permitir cobertura real via `node --test`, sem
// precisar simular browser/DOM.

export const PIPELINE_STAGES = Object.freeze([
    { id: "novo", label: "Novos", probability: 10 },
    { id: "em_contato", label: "Em contato", probability: 25 },
    { id: "qualificado", label: "Qualificados", probability: 50 },
    { id: "proposta", label: "Propostas", probability: 70 },
    { id: "convertido", label: "Ganhos", probability: 100 },
    { id: "perdido", label: "Perdidos", probability: 0 }
]);

export function normalizeText(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "");
}

export function normalizePhone(value) {
    let digits = String(value || "").replace(/\D/g, "");
    if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
    return digits;
}

export function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

export function normalizeStatus(lead) {
    const raw = normalizeText(
        lead?.statusLead || lead?.pipelineStage || lead?.status || "novo"
    ).replace(/\s+/g, "_");

    if (["em_contato", "contato", "atendimento"].includes(raw)) return "em_contato";
    if (["qualificado", "qualificacao"].includes(raw)) return "qualificado";
    if (["proposta", "negociacao", "orcamento_enviado"].includes(raw)) return "proposta";
    if (["convertido", "ganho", "cliente"].includes(raw)) return "convertido";
    if (["perdido", "cancelado", "descartado"].includes(raw)) return "perdido";
    return "novo";
}

export function anyTimestamp(value) {
    if (!value) return 0;
    if (typeof value?.toMillis === "function") return value.toMillis();
    if (typeof value?.seconds === "number") return value.seconds * 1000;
    if (typeof value === "number") return value < 100000000000 ? value * 1000 : value;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
}

export function leadTimestamp(lead) {
    const values = [lead?.data, lead?.criadoEm, lead?.createdAt, lead?.timestamp];
    for (const value of values) {
        const timestamp = anyTimestamp(value);
        if (timestamp) return timestamp;
    }
    return 0;
}

export function stageProbability(status) {
    return PIPELINE_STAGES.find((stage) => stage.id === status)?.probability ?? 10;
}

// CRM-LEAD-002: única política de resolução de probabilidade ao trocar
// de etapa — usada por moveLeadToStage (drag-and-drop) e pela ação de
// etapa em massa. Convertido/perdido sempre forçam 100/0 e voltam a
// "automatic" (não existe override manual pra um desfecho terminal).
// Fora desses dois casos: só preserva o valor anterior quando ele foi
// explicitamente marcado como "manual" (ver resolveProbabilidadeOrigem,
// chamado no salvamento do detalhe do lead); do contrário, sempre
// aplica o default da nova etapa — nunca herda silenciosamente o valor
// da etapa anterior.
export function resolveStageProbability({ currentProbability, probabilidadeOrigem, nextStage }) {
    if (nextStage === "convertido") return { probability: 100, probabilidadeOrigem: "automatic" };
    if (nextStage === "perdido") return { probability: 0, probabilidadeOrigem: "automatic" };
    if (probabilidadeOrigem === "manual") {
        return { probability: currentProbability, probabilidadeOrigem: "manual" };
    }
    return { probability: stageProbability(nextStage), probabilidadeOrigem: "automatic" };
}

// CRM-LEAD-002: decide se a probabilidade salva no formulário de
// detalhe do lead deve ser tratada como "manual" (o usuário escolheu um
// valor diferente do default da etapa, de propósito) ou "automatic"
// (bate com o default — continua livre pra mudar sozinha nas próximas
// trocas de etapa). Convertido/perdido sempre voltam "automatic".
export function resolveProbabilidadeOrigem({ status, probability }) {
    if (status === "convertido" || status === "perdido") return "automatic";
    return probability === stageProbability(status) ? "automatic" : "manual";
}

// CRM-LEAD-002 (compatibilidade legada — achado da revisão adversarial
// da PR): todo lead criado ANTES desta correção (e leads de pedido, que
// sempre chegam com probabilidade=70 sem o campo — ver leadPayload em
// functions/src/public/index.js) não tem probabilidadeOrigem persistido.
// Tratar "ausente" sempre como automatic perderia uma escolha comercial
// legítima já feita antes do campo existir (ex.: usuário setou 80% à
// mão em "Em contato"). Em vez de migrar produção, isso infere em
// tempo de leitura: se o campo já foi persistido como "manual" ou
// "automatic", confia nele; senão, compara a probabilidade persistida
// com o default da ETAPA ATUAL (não da próxima) — igual ao default
// nunca foi escolhida de propósito (automatic, pode mudar sozinha na
// próxima troca de etapa); diferente foi escolhida de propósito
// (manual, preservada), mesmo sem o campo ter sido gravado na época.
export function inferProbabilidadeOrigem({ currentStage, currentProbability, probabilidadeOrigem }) {
    if (probabilidadeOrigem === "manual" || probabilidadeOrigem === "automatic") {
        return probabilidadeOrigem;
    }
    return currentProbability === stageProbability(currentStage) ? "automatic" : "manual";
}

// CRM-LEAD-002 (achado 4 da revisão adversarial): usada por
// handleDetailChange (lead-engine-v5.js) pra decidir o valor sugerido
// no campo de probabilidade quando o usuário troca o <select> de etapa
// no formulário de detalhe, ANTES de salvar. null significa "não mexer
// no campo" — uma probabilidade de origem manual (persistida ou
// inferida via inferProbabilidadeOrigem) não pode ser sobrescrita só
// por trocar a etapa no formulário; o valor final de verdade só é
// decidido no Salvar (ver resolveProbabilidadeOrigem, chamado por
// saveLeadDetail). Convertido/perdido sempre sugerem 100/0, mesmo com
// origem manual — não existe override manual pra um desfecho terminal.
export function suggestedProbabilityOnStatusChange({ nextStage, probabilidadeOrigem }) {
    if (nextStage === "convertido") return 100;
    if (nextStage === "perdido") return 0;
    if (probabilidadeOrigem === "manual") return null;
    return stageProbability(nextStage);
}

// CRM-LEAD-001: a versão antiga sempre tratava "." como separador de
// milhar (formato BR), então "99.90" virava 9990 — quebrava qualquer
// origem que já entrega ponto decimal (input type=number, valueAsNumber,
// número já em notação JS). Números de verdade (já persistidos no
// Firestore) retornam direto na primeira linha, nunca passam pelo
// parsing de string abaixo — por isso valores antigos nunca são
// reinterpretados. Para strings: vírgula presente = formato BR
// ("1.234,56" ou "1234,56", ponto é milhar opcional); sem vírgula = o
// ponto (se houver) já É o separador decimal.
//
// FORMATOS OFICIALMENTE SUPORTADOS (achado 8 da revisão adversarial):
// número JS (sempre, nunca reinterpretado); string sem vírgula com ponto
// decimal opcional ("1234.56", "99.9", "1234"); string BR com vírgula
// decimal e ponto de milhar opcional ("1.234,56", "1234,56"). Formato
// AMBÍGUO: uma string SEM vírgula com um único ponto seguido de exatos 3
// dígitos ("1.234") é sempre tratada como decimal (1.234), nunca como
// milhar (1234) — essa é a mesma regra "sem vírgula = ponto decimal"
// acima, sem caso especial pra 3 dígitos. Investigado nesta revisão: os
// dois únicos writers que alimentam valorOportunidade (saveLeadDetail via
// valueAsNumber/numericValue, e o payload de pedido em
// functions/src/public/index.js via clampNumber) SEMPRE persistem um
// number nativo, nunca uma string — e a única origem de STRING pra este
// parser é um <input type="number">, cujo .value o próprio browser nunca
// preenche com separador de milhar. NÃO FOI POSSÍVEL COMPROVAR nenhum
// writer, script de migração ou teste no repositório que persista esse
// formato ambíguo como string — por isso nenhuma heurística nova foi
// criada só por hipótese (ver teste dedicado em
// tests/lead-engine-core.test.mjs fixando este comportamento).
export function numericValue(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const raw = String(value ?? "").trim();
    if (!raw) return 0;
    const normalized = raw.includes(",")
        ? raw.replace(/\./g, "").replace(",", ".")
        : raw;
    const parsed = Number(normalized.replace(/\s/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
}

export function formatMoney(value) {
    return numericValue(value).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });
}

// CRM-LEAD-003: fonte única de verdade do score — sempre derivado dos
// campos atuais do lead, nunca lido de um valor persistido (ver
// normalizeLead em lead-engine-v5.js, que não confia mais em
// lead.leadScore). leadScore continua sendo escrito por
// recalculateAllScores só como snapshot histórico; nenhuma leitura do
// próprio CRM depende dele.
export function computeScore(lead) {
    let score = 0;
    const timestamp = leadTimestamp(lead);
    const ageHours = timestamp ? Math.max(0, (Date.now() - timestamp) / 3600000) : 9999;
    const status = normalizeStatus(lead);
    const phone = normalizePhone(lead.whatsapp || lead.telefone);
    const email = normalizeEmail(lead.email);

    if (phone.length >= 12) score += 22;
    if (email.includes("@")) score += 12;
    if (String(lead.nome || "").trim().length >= 3) score += 8;
    if (String(lead.produtoInteresse || "").trim()) score += 12;
    if (String(lead.origem || "").trim()) score += 5;
    if (String(lead.utmSource || lead.utm_source || "").trim()) score += 6;
    if (String(lead.utmCampaign || lead.utm_campaign || "").trim()) score += 6;
    if (Number(lead.cliques || 0) >= 2) score += 7;
    if (Number(lead.cliques || 0) >= 5) score += 5;
    if (Number(lead.tempoRetencao || 0) >= 30) score += 7;
    if (Number(lead.tempoRetencao || 0) >= 90) score += 5;
    if (Number(lead.totalSubmissoes || lead.submissoes || 1) > 1) score += 8;
    if (numericValue(lead.valorOportunidade) > 0) score += 4;
    if (ageHours <= 1) score += 10;
    else if (ageHours <= 24) score += 6;
    else if (ageHours <= 72) score += 3;

    if (status === "em_contato") score += 4;
    if (status === "qualificado") score += 8;
    if (status === "proposta") score += 12;
    if (status === "convertido") score = 100;
    if (status === "perdido") score = Math.min(score, 25);
    return Math.max(0, Math.min(100, Math.round(score)));
}

export function temperatureFor(score, temperatures) {
    const t = temperatures || { hot: { min: 70 }, warm: { min: 40 } };
    if (score >= t.hot.min) return "hot";
    if (score >= t.warm.min) return "warm";
    return "cold";
}
