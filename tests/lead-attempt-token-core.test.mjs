// Hardening do Beta — Central Comercial de Leads / captura pública.
// Testa o rastreador de tentativa de idempotência (createLeadAttemptTracker)
// isolado de DOM/Firestore — achados B1-A/B1-B da revisão adversarial
// final da PR #59. Ver lead-attempt-token-core.js.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    createLeadAttemptTracker,
    fingerprintContato,
    fingerprintPedido,
    fingerprintCamposExtras,
    fingerprintLeadAttempt
} from "../lead-attempt-token-core.js";

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

// ==========================================================================
// ÚLTIMO B1 (revisão adversarial final da PR #59, terceira passada):
// fingerprintLeadAttempt/fingerprintContato/fingerprintPedido/
// fingerprintCamposExtras são a MESMA lógica real usada por
// capturarLeadPublico (loja.html) e buildLeadRequest (lp-forms-v5.js) —
// loja.html só faz hashLeadPublico(fingerprintLeadAttempt(leadRequest)),
// então testar a string canônica aqui prova diretamente o comportamento
// do app, não uma cópia inventada no teste.
// ==========================================================================

function pedidoSnapshotBase(overrides = {}) {
    // Mesmo formato que normalizarSnapshotPedidoPublico (loja.html)
    // devolve — inclui criadoEm (timestamp), que o fingerprint precisa
    // ignorar.
    return {
        numeroPedido: "PED-260101-ABCDE",
        clienteNome: "Maria Cliente",
        clienteWhatsapp: "5511999998888",
        tipoRecebimento: "retirada",
        cep: "01001-000",
        endereco: "Rua A, 100",
        observacoes: "Entregar de manhã",
        itens: [
            { produtoId: "prod-1", nomeSnapshot: "Produto 1", precoSnapshot: 50, quantidade: 2, subtotal: 100 },
            { produtoId: "prod-2", nomeSnapshot: "Produto 2", precoSnapshot: 30, quantidade: 1, subtotal: 30 }
        ],
        produtosTexto: "2x Produto 1, 1x Produto 2",
        subtotal: 130,
        desconto: 0,
        frete: 0,
        total: 130,
        moeda: "BRL",
        statusPedido: "novo",
        statusPagamento: "pendente",
        criadoEm: Date.now(),
        ...overrides
    };
}

function checkoutLeadRequestBase(overrides = {}) {
    return {
        storeSlug: "loja-x",
        tipoCaptura: "checkout_whatsapp",
        formularioId: "checkout_carrinho",
        paginaOrigem: "checkout_carrinho",
        produtoInteresse: "Pedido pelo carrinho",
        nome: "Maria Cliente",
        whatsapp: "5511999998888",
        telefone: "5511999998888",
        email: "maria@teste.com",
        numeroPedido: "PED-260101-ABCDE",
        pedidoSnapshot: pedidoSnapshotBase(),
        cliques: 1,
        tempoRetencao: 42,
        urlPagina: "https://loja-x.example/produto-1",
        ...overrides
    };
}

describe("fingerprintLeadAttempt/fingerprintContato/fingerprintPedido — ÚLTIMO B1 (revisão adversarial final)", () => {
    it("teste 1 — retry idêntico: mesmo fingerprint, mesmo token, 1 lead", () => {
        const tracker = createLeadAttemptTracker(sequentialTokenGenerator());
        const tentativaA = checkoutLeadRequestBase();
        const retryIdentico = checkoutLeadRequestBase(); // objeto novo, mesmo conteúdo comercial

        const fingerprintA = fingerprintLeadAttempt(tentativaA);
        const fingerprintRetry = fingerprintLeadAttempt(retryIdentico);
        assert.equal(fingerprintRetry, fingerprintA, "payload comercial idêntico deveria gerar o mesmo fingerprint");

        const tokenA = tracker.getToken(fingerprintA);
        const tokenRetry = tracker.getToken(fingerprintRetry);
        assert.equal(tokenRetry, tokenA, "retry idêntico deveria reaproveitar o token (1 lead no servidor)");
    });

    it("teste 2 — muda só o e-mail (mesmo whatsapp): fingerprint e token diferentes", () => {
        const a = checkoutLeadRequestBase({ email: "a@teste.com" });
        const b = checkoutLeadRequestBase({ email: "b@teste.com" });

        const fingerprintA = fingerprintLeadAttempt(a);
        const fingerprintB = fingerprintLeadAttempt(b);
        assert.notEqual(fingerprintA, fingerprintB, "trocar só o e-mail (com o mesmo whatsapp) precisa mudar o fingerprint — antes o whatsapp 'escondia' o e-mail do fingerprint");

        const tracker = createLeadAttemptTracker(sequentialTokenGenerator());
        assert.notEqual(tracker.getToken(fingerprintA), tracker.getToken(fingerprintB));
    });

    it("fingerprintContato: mesmo whatsapp + e-mails diferentes -> fingerprints diferentes; mesmo whatsapp + mesmo e-mail -> igual", () => {
        const base = { whatsapp: "5511999998888", email: "a@teste.com" };
        assert.equal(fingerprintContato(base), fingerprintContato({ ...base }));
        assert.notEqual(fingerprintContato(base), fingerprintContato({ ...base, email: "b@teste.com" }));
        assert.notEqual(fingerprintContato(base), fingerprintContato({ ...base, whatsapp: "5511777776666" }));
    });

    it("teste 3 — muda só o endereço do checkout: fingerprint e token diferentes", () => {
        const a = checkoutLeadRequestBase({ pedidoSnapshot: pedidoSnapshotBase({ endereco: "Rua A, 100" }) });
        const b = checkoutLeadRequestBase({ pedidoSnapshot: pedidoSnapshotBase({ endereco: "Rua B, 200" }) });

        const fingerprintA = fingerprintLeadAttempt(a);
        const fingerprintB = fingerprintLeadAttempt(b);
        assert.notEqual(fingerprintA, fingerprintB, "corrigir o endereço depois de um erro precisa gerar um lead/pedido novo, não reaproveitar o token do endereço antigo");

        const tracker = createLeadAttemptTracker(sequentialTokenGenerator());
        assert.notEqual(tracker.getToken(fingerprintA), tracker.getToken(fingerprintB));
    });

    it("teste 4 — muda só o CEP: fingerprint e token diferentes", () => {
        const a = checkoutLeadRequestBase({ pedidoSnapshot: pedidoSnapshotBase({ cep: "01001-000" }) });
        const b = checkoutLeadRequestBase({ pedidoSnapshot: pedidoSnapshotBase({ cep: "04001-000" }) });

        assert.notEqual(fingerprintLeadAttempt(a), fingerprintLeadAttempt(b));
    });

    it("teste 5 — muda só as observações: fingerprint e token diferentes", () => {
        const a = checkoutLeadRequestBase({ pedidoSnapshot: pedidoSnapshotBase({ observacoes: "Entregar de manhã" }) });
        const b = checkoutLeadRequestBase({ pedidoSnapshot: pedidoSnapshotBase({ observacoes: "Entregar à tarde, portão azul" }) });

        assert.notEqual(fingerprintLeadAttempt(a), fingerprintLeadAttempt(b));
    });

    it("teste 6 — muda só o tipo de recebimento (retirada -> entrega): fingerprint e token diferentes", () => {
        const a = checkoutLeadRequestBase({ pedidoSnapshot: pedidoSnapshotBase({ tipoRecebimento: "retirada" }) });
        const b = checkoutLeadRequestBase({ pedidoSnapshot: pedidoSnapshotBase({ tipoRecebimento: "entrega" }) });

        assert.notEqual(fingerprintLeadAttempt(a), fingerprintLeadAttempt(b));
    });

    it("teste 7 — muda item/quantidade do pedido: fingerprint e token diferentes", () => {
        const a = checkoutLeadRequestBase({
            pedidoSnapshot: pedidoSnapshotBase({
                itens: [{ produtoId: "prod-1", nomeSnapshot: "Produto 1", precoSnapshot: 50, quantidade: 2, subtotal: 100 }]
            })
        });
        const b = checkoutLeadRequestBase({
            pedidoSnapshot: pedidoSnapshotBase({
                itens: [{ produtoId: "prod-1", nomeSnapshot: "Produto 1", precoSnapshot: 50, quantidade: 3, subtotal: 150 }]
            })
        });

        assert.notEqual(fingerprintLeadAttempt(a), fingerprintLeadAttempt(b), "aumentar a quantidade de um item precisa gerar um pedido novo, não reaproveitar o token da quantidade antiga");
    });

    it("fingerprintPedido: ordem dos itens não importa (mesmos itens, ordens diferentes -> mesmo fingerprint)", () => {
        const itensOrdemA = [
            { produtoId: "prod-1", precoSnapshot: 50, quantidade: 2 },
            { produtoId: "prod-2", precoSnapshot: 30, quantidade: 1 }
        ];
        const itensOrdemB = [
            { produtoId: "prod-2", precoSnapshot: 30, quantidade: 1 },
            { produtoId: "prod-1", precoSnapshot: 50, quantidade: 2 }
        ];
        assert.equal(
            fingerprintPedido(pedidoSnapshotBase({ itens: itensOrdemA })),
            fingerprintPedido(pedidoSnapshotBase({ itens: itensOrdemB }))
        );
    });

    it("teste 8 — só campos voláteis mudam (cliques, tempoRetencao, urlPagina, criadoEm do pedido): fingerprint IGUAL, token reaproveitado", () => {
        const tracker = createLeadAttemptTracker(sequentialTokenGenerator());
        const tentativaA = checkoutLeadRequestBase({
            cliques: 1,
            tempoRetencao: 10,
            urlPagina: "https://loja-x.example/produto-1?utm_x=1"
        });
        // "Retry técnico" real: o mesmo clique, mas alguns segundos depois
        // — cliques/tempoRetencao/timestamps sempre mudam entre a
        // primeira tentativa e o retry, mesmo sendo a MESMA intenção.
        const retryTecnico = checkoutLeadRequestBase({
            cliques: 3,
            tempoRetencao: 47,
            urlPagina: "https://loja-x.example/produto-1?utm_x=2",
            pedidoSnapshot: pedidoSnapshotBase({ criadoEm: Date.now() + 5000 })
        });

        const fingerprintA = fingerprintLeadAttempt(tentativaA);
        const fingerprintRetry = fingerprintLeadAttempt(retryTecnico);
        assert.equal(fingerprintRetry, fingerprintA, "campos voláteis/telemetria não podem mudar o fingerprint — senão um retry real vira uma 'tentativa nova' por engano e a idempotência quebra");

        assert.equal(tracker.getToken(fingerprintRetry), tracker.getToken(fingerprintA));
    });

    it("teste 9 — sucesso + nova submissão comercial idêntica: token novo, não bloqueada por dedupe antigo", () => {
        const tracker = createLeadAttemptTracker(sequentialTokenGenerator());
        const payload = checkoutLeadRequestBase();
        const fingerprint = fingerprintLeadAttempt(payload);

        const tokenPrimeiraCompra = tracker.getToken(fingerprint);
        tracker.complete(fingerprint); // sucesso

        // Visitante compra de novo, de propósito, o mesmo pedido — dados
        // comerciais idênticos, intenção nova.
        const fingerprintSegundaCompra = fingerprintLeadAttempt(checkoutLeadRequestBase());
        const tokenSegundaCompra = tracker.getToken(fingerprintSegundaCompra);

        assert.notEqual(tokenSegundaCompra, tokenPrimeiraCompra, "segunda compra legítima e idêntica precisa de um lead novo");
    });

    it("teste 10 — tentativas diferentes pendentes (checkout A + popup B): retry do checkout continua com o token original", () => {
        const tracker = createLeadAttemptTracker(sequentialTokenGenerator());
        const checkoutA = checkoutLeadRequestBase();
        const popupB = {
            tipoCaptura: "formulario_popup",
            formularioId: "popup_captura",
            paginaOrigem: "popup_captura",
            produtoInteresse: "Popup de Captura",
            nome: "Outro Visitante",
            whatsapp: "5511777776666",
            email: ""
        };

        const fingerprintCheckout = fingerprintLeadAttempt(checkoutA);
        const fingerprintPopup = fingerprintLeadAttempt(popupB);

        const tokenCheckout1 = tracker.getToken(fingerprintCheckout);
        // Erro ambíguo no checkout — token continua pendente. Visitante
        // interage com o popup nesse meio-tempo (outra tentativa).
        tracker.getToken(fingerprintPopup);
        // Visitante volta e reenvia o checkout com o MESMO payload comercial.
        const tokenCheckout2 = tracker.getToken(fingerprintLeadAttempt(checkoutLeadRequestBase()));

        assert.equal(tokenCheckout2, tokenCheckout1, "o Map não pode perder a tentativa pendente do checkout só porque outra tentativa (popup) também ficou pendente");
    });
});

describe("fingerprintCamposExtras — ÚLTIMO B1 (lp-forms-v5.js, campos customizados da LP)", () => {
    it("campo customizado alterado depois de um erro muda o fingerprint (mesma classe do e-mail/endereço)", () => {
        const camposA = { empresa: "Acme", orcamento: "5000" };
        const camposB = { empresa: "Acme", orcamento: "8000" }; // visitante corrigiu o orçamento

        assert.notEqual(fingerprintCamposExtras(camposA), fingerprintCamposExtras(camposB));
    });

    it("ordem das chaves não importa (mesmos campos, ordens diferentes -> mesmo fingerprint)", () => {
        const camposOrdemA = { empresa: "Acme", orcamento: "5000" };
        const camposOrdemB = { orcamento: "5000", empresa: "Acme" };

        assert.equal(fingerprintCamposExtras(camposOrdemA), fingerprintCamposExtras(camposOrdemB));
    });

    it("sem camposExtras (undefined/objeto vazio) não quebra e é estável", () => {
        assert.equal(fingerprintCamposExtras(undefined), "");
        assert.equal(fingerprintCamposExtras({}), "");
        assert.equal(fingerprintCamposExtras(null), "");
    });
});
