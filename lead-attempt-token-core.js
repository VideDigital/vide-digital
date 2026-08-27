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
// Mantém UM MAPA de tentativas pendentes, uma entrada por fingerprint —
// não um único slot solto. Isso importa porque um mesmo rastreador é
// compartilhado por VÁRIOS pontos de captura na mesma página (em
// loja.html: checkout do carrinho, clique em produto, popup de
// captura). Com um único slot, uma tentativa pendente do checkout (erro
// ambíguo, ainda não resolvida) seria APAGADA se o visitante, antes de
// tentar de novo, interagisse com outro formulário (fingerprint
// diferente) — o retry do checkout então ganharia um token novo por
// engano, exatamente o tipo de duplicação que o achado B1-A corrigiu.
// Com o mapa, cada fingerprint tem sua própria entrada, independente de
// quantas outras tentativas (de outros formulários) estejam pendentes
// ao mesmo tempo.
//
// getToken(fingerprint) só reaproveita o token pendente DAQUELE
// fingerprint — retry real da MESMA tentativa, inclusive um double-click
// síncrono (ambas as chamadas calculam o mesmo fingerprint e reaproveitam
// o mesmo token ANTES de qualquer chamada de rede terminar, então a
// transação do servidor as trata como uma tentativa só). Fingerprint
// diferente sempre gera um token novo, numa entrada própria — nunca cai
// de volta num bloqueio de conteúdo. complete(fingerprint) encerra
// AQUELA tentativa depois de um sucesso, pra que a PRÓXIMA chamada com o
// mesmo fingerprint (ex.: o mesmo visitante manda o mesmo interesse de
// novo, de propósito) comece do zero com um token novo.
export function createLeadAttemptTracker(gerarToken) {
    const pending = new Map(); // fingerprint -> token
    const criarToken = gerarToken || defaultRandomToken;

    return {
        getToken(fingerprint) {
            if (pending.has(fingerprint)) {
                return pending.get(fingerprint);
            }
            const token = criarToken();
            pending.set(fingerprint, token);
            return token;
        },
        complete(fingerprint) {
            pending.delete(fingerprint);
        },
        // Exposto só pra inspeção/teste — não é necessário no uso normal.
        peek(fingerprint) {
            return pending.has(fingerprint) ? { token: pending.get(fingerprint), fingerprint } : null;
        }
    };
}

function defaultRandomToken() {
    if (typeof globalThis.crypto?.randomUUID === "function") {
        return globalThis.crypto.randomUUID();
    }
    return "tent_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

// ==========================================================================
// Fingerprint canônico de uma tentativa de captura pública de lead.
//
// ÚLTIMO B1 (revisão adversarial final da PR #59, terceira passada): o
// fingerprint da Loja tratava contato como whatsapp/telefone OU email
// (o que existisse primeiro) — se ambos fossem enviados, só o
// whatsapp/telefone entrava de fato. Corrigir só o e-mail depois de um
// erro ambíguo não mudava o fingerprint, então o retry reaproveitava o
// token da tentativa anterior — o servidor tratava como idempotência de
// retry e devolvia o lead já criado, com o e-mail antigo (o novo nunca
// era persistido). Mesma classe de problema no checkout: o fingerprint
// do pedido só considerava numeroPedido+total+itens (produtoId+
// quantidade), ignorando clienteNome/tipoRecebimento/cep/endereco/
// observacoes — corrigir o endereço ou as observações depois de um erro
// também reaproveitava o token e os dados corrigidos podiam se perder.
//
// Estas funções tornam a lógica REAL usada por loja.html testável sem
// DOM (mesmo padrão de lead-engine-core.js). O objetivo do fingerprint é
// só decidir "isto é uma retentativa da MESMA intenção comercial, ou uma
// nova intenção?" — nunca inclui campos voláteis/de telemetria
// (timestamps, cliques, tempoRetencao) que mudam sozinhos entre um
// clique e o retry técnico do mesmo clique, o que faria um retry
// legítimo virar uma "tentativa nova" por engano e quebraria a
// idempotência real (CRM-LEAD-008).
// ==========================================================================

function normalizeFingerprintText(value, max) {
    return String(value ?? "").trim().toLowerCase().slice(0, max || 300);
}

function normalizeFingerprintPhone(value) {
    return String(value ?? "").replace(/\D/g, "");
}

// Contato = whatsapp/telefone E email, cada um participando de forma
// INDEPENDENTE — nunca um fallback "usa o que tiver primeiro". Dois
// campos de contato diferentes descrevem duas formas de a loja
// encontrar o cliente; mudar qualquer um dos dois é uma correção real
// que precisa virar um lead/tentativa novo se o anterior já tiver sido
// criado no servidor.
export function fingerprintContato({ whatsapp, telefone, email }) {
    return [
        normalizeFingerprintPhone(whatsapp || telefone),
        normalizeFingerprintText(email, 160)
    ].join("|");
}

// Representação canônica e ESTÁVEL de um pedidoSnapshot (ver
// normalizarSnapshotPedidoPublico em loja.html) — só os campos
// comercialmente relevantes. NUNCA inclui criadoEm nem qualquer outro
// timestamp: normalizarSnapshotPedidoPublico grava criadoEm a cada
// chamada (Date.now()), então usar o objeto inteiro faria até um retry
// idêntico gerar um fingerprint novo a cada tentativa, quebrando a
// idempotência real. Itens são ordenados por produtoId antes de
// serializar, pra o fingerprint não depender de uma ordem de array
// incidental (duas chamadas com os mesmos itens, em ordens diferentes
// por acaso, continuam sendo a MESMA intenção comercial).
export function fingerprintPedido(pedidoSnapshot) {
    if (!pedidoSnapshot || typeof pedidoSnapshot !== "object") return "";
    const itens = Array.isArray(pedidoSnapshot.itens) ? pedidoSnapshot.itens : [];
    const itensCanonicos = itens
        .map((item) => ({
            produtoId: normalizeFingerprintText(item?.produtoId, 180),
            quantidade: Number(item?.quantidade) || 0,
            preco: Number(item?.precoSnapshot ?? item?.preco) || 0
        }))
        .sort((a, b) => a.produtoId.localeCompare(b.produtoId))
        .map((item) => `${item.produtoId}:${item.quantidade}:${item.preco}`)
        .join(",");

    return [
        normalizeFingerprintText(pedidoSnapshot.numeroPedido, 80),
        normalizeFingerprintText(pedidoSnapshot.clienteNome, 120),
        normalizeFingerprintPhone(pedidoSnapshot.clienteWhatsapp),
        normalizeFingerprintText(pedidoSnapshot.tipoRecebimento, 20),
        normalizeFingerprintText(pedidoSnapshot.cep, 20),
        normalizeFingerprintText(pedidoSnapshot.endereco, 220),
        normalizeFingerprintText(pedidoSnapshot.observacoes, 500),
        itensCanonicos,
        Number(pedidoSnapshot.desconto) || 0,
        Number(pedidoSnapshot.frete) || 0,
        Number(pedidoSnapshot.total) || 0
    ].join("|");
}

// camposExtras (lp-forms-v5.js): campos customizados que o dono da
// Landing Page adiciona ao formulário (AuraFormsV5) — dados comerciais
// preenchidos manualmente pelo visitante (ex.: "empresa", "orçamento",
// "mensagem"), não cobertos pelos campos fixos (nome/whatsapp/email).
// Corrigir um desses campos depois de um erro ambíguo é a MESMA classe
// de bug do contato/pedido acima — precisa entrar no fingerprint.
export function fingerprintCamposExtras(camposExtras) {
    if (!camposExtras || typeof camposExtras !== "object") return "";
    return Object.keys(camposExtras)
        .sort()
        .map((key) => `${normalizeFingerprintText(key, 60)}=${normalizeFingerprintText(camposExtras[key], 500)}`)
        .join("&");
}

// Fingerprint completo de uma tentativa de captura pública na Loja —
// identidade + intenção comercial completa (contato, produto,
// formulário, pedido quando aplicável). leadRequest é o mesmo objeto
// montado por capturarLeadPublico (loja.html) antes de dedupeKey ser
// preenchido.
export function fingerprintLeadAttempt(leadRequest) {
    return [
        leadRequest.tipoCaptura || "",
        leadRequest.formularioId || leadRequest.paginaOrigem || "",
        leadRequest.produtoId || leadRequest.produtoInteresse || "",
        normalizeFingerprintText(leadRequest.nome, 160),
        fingerprintContato(leadRequest),
        fingerprintPedido(leadRequest.pedidoSnapshot)
    ].join("|");
}
