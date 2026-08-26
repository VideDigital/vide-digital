// Hardening do Beta — Central Comercial de Leads / captura pública.
// Testa o rastreador de tentativa de idempotência (createLeadAttemptTracker)
// isolado de DOM/Firestore — achados B1-A/B1-B da revisão adversarial
// final da PR #59. Ver lead-attempt-token-core.js.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createLeadAttemptTracker } from "../lead-attempt-token-core.js";

function sequentialTokenGenerator() {
    let n = 0;
    return () => `token-${++n}`;
}

describe("createLeadAttemptTracker — B1-A/B1-B (revisão adversarial da PR #59)", () => {
    it("cenário 1 — retry real da MESMA tentativa: mesmo fingerprint reaproveita o mesmo token", () => {
        const tracker = createLeadAttemptTracker(sequentialTokenGenerator());
        const fingerprint = "loja-x|contato-a|produto-1";

        const tokenA = tracker.getToken(fingerprint);
        // Simula: servidor criou o lead, resposta caiu (erro ambíguo) —
        // não chama complete(). O app tenta de novo com o MESMO payload.
        const tokenRetry = tracker.getToken(fingerprint);

        assert.equal(tokenRetry, tokenA, "retry do mesmo fingerprint deveria reaproveitar o token, resultando em 1 lead no servidor");
    });

    it("cenário 2 — payload mudou após erro: fingerprint diferente gera token novo (2 intenções independentes)", () => {
        const tracker = createLeadAttemptTracker(sequentialTokenGenerator());
        const fingerprintOriginal = "loja-x|contato-a|produto-1";
        const fingerprintEditado = "loja-x|contato-a|produto-2"; // usuário trocou o produto

        const tokenA = tracker.getToken(fingerprintOriginal);
        // Erro ambíguo, sem complete(). Usuário edita os dados relevantes
        // (produto) e tenta de novo — fingerprint muda.
        const tokenB = tracker.getToken(fingerprintEditado);

        assert.notEqual(tokenB, tokenA, "payload alterado depois de um erro deveria ganhar um token novo, não reaproveitar a tentativa anterior");
    });

    it("cenário 3 — formulário/operação diferente: não reutiliza token da tentativa anterior indevidamente", () => {
        const tracker = createLeadAttemptTracker(sequentialTokenGenerator());
        const fingerprintCheckout = "loja-x|checkout_carrinho|contato-a";
        const fingerprintPopup = "loja-x|popup_captura|contato-a";

        const tokenCheckout = tracker.getToken(fingerprintCheckout);
        // Erro no checkout, sem complete(). Visitante interage com outro
        // formulário/operação (popup de captura) na mesma sessão.
        const tokenPopup = tracker.getToken(fingerprintPopup);

        assert.notEqual(tokenPopup, tokenCheckout, "uma captura em outro formulário/operação nunca deveria herdar o token de uma tentativa pendente de outro formulário");
    });

    it("cenário 3b (achado da autorrevisão) — duas tentativas pendentes SIMULTÂNEAS (formulários diferentes) não se atrapalham: retry da primeira continua reaproveitando seu próprio token", () => {
        // capturarLeadPublico (loja.html) é compartilhado por checkout,
        // clique em produto e popup — todos usam o MESMO tracker. Um
        // design de "um único slot pendente" perderia a tentativa do
        // checkout assim que o popup gerasse seu próprio token. O tracker
        // precisa manter as duas tentativas pendentes ao mesmo tempo, cada
        // uma na sua própria entrada (por fingerprint).
        const tracker = createLeadAttemptTracker(sequentialTokenGenerator());
        const fingerprintCheckout = "loja-x|checkout_carrinho|contato-a";
        const fingerprintPopup = "loja-x|popup_captura|contato-b";

        const tokenCheckout1 = tracker.getToken(fingerprintCheckout);
        // Erro ambíguo no checkout — token continua pendente.
        const tokenPopup = tracker.getToken(fingerprintPopup);
        // Visitante volta e tenta o checkout de novo (mesmo fingerprint).
        const tokenCheckout2 = tracker.getToken(fingerprintCheckout);

        assert.equal(
            tokenCheckout2,
            tokenCheckout1,
            "a tentativa pendente do checkout não pode ser perdida só porque outra tentativa (popup, fingerprint diferente) também ficou pendente nesse meio-tempo"
        );
        assert.notEqual(tokenPopup, tokenCheckout1, "o popup continua com seu próprio token, independente do checkout");
    });

    it("cenário 4 — segunda submissão comercial legítima idêntica: token novo depois de um sucesso, não bloqueada por dedupe antigo", () => {
        const tracker = createLeadAttemptTracker(sequentialTokenGenerator());
        const fingerprint = "loja-x|contato-a|produto-1";

        const tokenPrimeiraSubmissao = tracker.getToken(fingerprint);
        tracker.complete(fingerprint); // sucesso: createPublicLead respondeu ok

        // Mais tarde, o MESMO visitante decide mandar o mesmo interesse de
        // novo, de propósito — conteúdo idêntico, intenção nova.
        const tokenSegundaSubmissao = tracker.getToken(fingerprint);

        assert.notEqual(
            tokenSegundaSubmissao,
            tokenPrimeiraSubmissao,
            "uma segunda submissão legítima e deliberada, mesmo com conteúdo idêntico, precisa de um token novo — nunca reaproveitar uma tentativa já concluída"
        );
    });

    it("cenário 4b — complete() de UMA tentativa não apaga outra tentativa pendente diferente", () => {
        const tracker = createLeadAttemptTracker(sequentialTokenGenerator());
        const fingerprintA = "loja-x|contato-a|produto-1";
        const fingerprintB = "loja-x|contato-b|produto-2";

        const tokenA = tracker.getToken(fingerprintA);
        const tokenB1 = tracker.getToken(fingerprintB);
        tracker.complete(fingerprintA); // só a tentativa A termina
        const tokenB2 = tracker.getToken(fingerprintB); // B continua pendente (retry)

        assert.equal(tokenB2, tokenB1, "completar a tentativa A não pode afetar a tentativa B, que continua pendente");
    });

    it("cenário 5 — double-click / concorrência: duas chamadas síncronas com o mesmo fingerprint reaproveitam o mesmo token", () => {
        const tracker = createLeadAttemptTracker(sequentialTokenGenerator());
        const fingerprint = "loja-x|contato-a|produto-1";

        // Simula um double-click: duas chamadas de getToken ANTES de
        // qualquer resposta de rede (nenhuma delas chamou complete()
        // ainda) — o mesmo padrão que ocorre quando dois cliques disparam
        // capturarLeadPublico/handleSubmit em sequência síncrona.
        const tokenClique1 = tracker.getToken(fingerprint);
        const tokenClique2 = tracker.getToken(fingerprint);

        assert.equal(tokenClique2, tokenClique1, "dois cliques da mesma tentativa (mesmo fingerprint, nenhum resolvido ainda) precisam reaproveitar o mesmo token — o servidor então garante 1 lead via transação");
    });

    it("peek(fingerprint) reflete a tentativa pendente daquele fingerprint e complete(fingerprint) limpa só ela", () => {
        const tracker = createLeadAttemptTracker(sequentialTokenGenerator());
        assert.equal(tracker.peek("fp-1"), null);

        const token = tracker.getToken("fp-1");
        assert.deepEqual(tracker.peek("fp-1"), { token, fingerprint: "fp-1" });
        assert.equal(tracker.peek("fp-2"), null, "peek de um fingerprint sem tentativa pendente continua null");

        tracker.complete("fp-1");
        assert.equal(tracker.peek("fp-1"), null);
    });

    it("gerador de token default produz valores não vazios e diferentes entre tentativas concluídas", () => {
        const tracker = createLeadAttemptTracker(); // usa o gerador default (crypto.randomUUID ou fallback)
        const tokenA = tracker.getToken("fp-a");
        assert.ok(typeof tokenA === "string" && tokenA.length > 0);
        tracker.complete("fp-a");
        const tokenB = tracker.getToken("fp-a");
        assert.notEqual(tokenB, tokenA);
    });
});
