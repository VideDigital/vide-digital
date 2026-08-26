// Rastreador de tentativa de captura pública de leads — extraído pra
// permitir testes reais via `node --test` (mesmo padrão de
// lead-engine-core.js/catalogo-produtos-core.js). Usado por loja.html,
// lp-forms-v5.js e index.html: cada um cria sua PRÓPRIA instância
// (createLeadAttemptTracker()) — não é estado compartilhado entre
// arquivos, cada writer cobre um escopo de captura diferente.
//
// CRM-LEAD-008 (achado 5 + achados B1-A/B1-B da revisão adversarial
// final da PR #59): o token de idempotência enviado a createPublicLead
// precisa representar UMA TENTATIVA LÓGICA, não:
//   - um token global solto (achado B1-A: reaproveitado depois de um
//     erro mesmo que o usuário tivesse mudado os dados, o produto, o
//     formulário ou iniciado outra ação — a nova submissão podia ser
//     descartada como se fosse retry da tentativa anterior);
//   - um dedupe de CONTEÚDO com janela longa (achado B1-B: bloqueava uma
//     segunda submissão comercial legítima e deliberada só porque tinha
//     o mesmo contato/formulário/produto).
//
// getToken(fingerprint) só reaproveita o token pendente quando o
// fingerprint da chamada atual bate com o da última tentativa pendente
// — retry real da MESMA tentativa, inclusive um double-click síncrono
// (ambas as chamadas calculam o mesmo fingerprint e reaproveitam o
// mesmo token ANTES de qualquer chamada de rede terminar, então a
// transação do servidor as trata como uma tentativa só). Fingerprint
// diferente sempre gera um token novo — nunca cai de volta num bloqueio
// de conteúdo. complete() encerra a tentativa depois de um sucesso, pra
// que a PRÓXIMA chamada (mesmo com fingerprint idêntico, ex.: o mesmo
// visitante manda o mesmo interesse de novo, de propósito) comece do
// zero com um token novo.
export function createLeadAttemptTracker(gerarToken) {
    let pending = null; // { token, fingerprint }
    const criarToken = gerarToken || defaultRandomToken;

    return {
        getToken(fingerprint) {
            if (pending && pending.fingerprint === fingerprint) {
                return pending.token;
            }
            const token = criarToken();
            pending = { token, fingerprint };
            return token;
        },
        complete() {
            pending = null;
        },
        // Exposto só pra inspeção/teste — não é necessário no uso normal.
        peek() {
            return pending;
        }
    };
}

function defaultRandomToken() {
    if (typeof globalThis.crypto?.randomUUID === "function") {
        return globalThis.crypto.randomUUID();
    }
    return "tent_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}
