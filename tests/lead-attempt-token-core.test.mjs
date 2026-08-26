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

    it("cenário 4 — segunda submissão comercial legítima idêntica: token novo depois de um sucesso, não bloqueada por dedupe antigo", () => {
        const tracker = createLeadAttemptTracker(sequentialTokenGenerator());
        const fingerprint = "loja-x|contato-a|produto-1";

        const tokenPrimeiraSubmissao = tracker.getToken(fingerprint);
        tracker.complete(); // sucesso: createPublicLead respondeu ok

        // Mais tarde, o MESMO visitante decide mandar o mesmo interesse de
        // novo, de propósito — conteúdo idêntico, intenção nova.
        const tokenSegundaSubmissao = tracker.getToken(fingerprint);

        assert.notEqual(
            tokenSegundaSubmissao,
            tokenPrimeiraSubmissao,
            "uma segunda submissão legítima e deliberada, mesmo com conteúdo idêntico, precisa de um token novo — nunca reaproveitar uma tentativa já concluída"
        );
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

    it("peek() reflete a tentativa pendente e complete() limpa o estado", () => {
        const tracker = createLeadAttemptTracker(sequentialTokenGenerator());
        assert.equal(tracker.peek(), null);

        const token = tracker.getToken("fp-1");
        assert.deepEqual(tracker.peek(), { token, fingerprint: "fp-1" });

        tracker.complete();
        assert.equal(tracker.peek(), null);
    });

    it("gerador de token default produz valores não vazios e diferentes entre tentativas concluídas", () => {
        const tracker = createLeadAttemptTracker(); // usa o gerador default (crypto.randomUUID ou fallback)
        const tokenA = tracker.getToken("fp-a");
        assert.ok(typeof tokenA === "string" && tokenA.length > 0);
        tracker.complete();
        const tokenB = tracker.getToken("fp-a");
        assert.notEqual(tokenB, tokenA);
    });
});
