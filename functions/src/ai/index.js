"use strict";

// IA de Negócio — assistente real (provedor externo, Google Gemini) que o
// DONO da loja usa pra conversar sobre o próprio negócio: produtos, pedidos,
// o que melhorar. Ver docs/IA_NEGOCIO.md para o desenho completo.
//
// Regras que este arquivo cumpre:
// - A chave do provedor (GEMINI_API_KEY) só existe aqui, como secret do
//   Firebase Functions — nunca no frontend, Firestore ou repositório.
// - Só quem tem permissão de editar "central-ia" no tenant (dono sempre;
//   funcionário só se concedido) pode chamar esta função.
// - Só tenants no plano "pro" usam a IA real (ver PLAN_LIMITS/decisão do
//   negócio) — outros planos recebem erro claro, não uma cobrança oculta.
// - Teto mensal de mensagens por loja, reforçado no servidor via
//   transação no Firestore — nunca confiável só no cliente.
// - O contexto enviado ao provedor é montado aqui, a partir de dados já
//   filtrados pelo tenant autenticado — nunca aceita um "contexto" vindo
//   do cliente.
// - Não grava a pergunta/resposta completa em nenhum lugar — só o
//   contador de uso mensal (ver ia_negocio_uso/{ownerUid}_{periodo}).

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { logger } = require("firebase-functions");
const { resolveCallerContext, requireEdit } = require("../shared/context");
const {
    LIMITES_IA_NEGOCIO,
    contextoParaTexto,
    detectarTentativaInjecao,
    extrairTextoRespostaGemini,
    montarContextoNegocio,
    montarMensagensGemini,
    montarSystemPrompt,
    sanitizarPergunta
} = require("./promptBuilder");

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
// Nome do modelo "Flash" mais recente disponível — confira em
// ai.google.dev/gemini-api/docs/models antes do primeiro deploy real,
// nomes de modelo mudam com frequência nesse mercado.
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const PLANOS_COM_IA_REAL = new Set(["pro", "proplus", "agencia", "enterprise", "premium"]);

function currentPeriodKey() {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function assertMonthlyQuota(ownerUid) {
    const db = getFirestore();
    const periodo = currentPeriodKey();
    const ref = db.doc(`ia_negocio_uso/${ownerUid}_${periodo}`);

    const resultado = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const atual = snap.exists ? Number(snap.data().count || 0) : 0;
        if (atual >= LIMITES_IA_NEGOCIO.usoMensalPadrao) {
            return { excedeu: true, atual };
        }
        tx.set(ref, {
            ownerUid,
            periodo,
            count: FieldValue.increment(1),
            ultimaPerguntaEm: FieldValue.serverTimestamp()
        }, { merge: true });
        return { excedeu: false, atual: atual + 1 };
    });

    if (resultado.excedeu) {
        throw new HttpsError(
            "resource-exhausted",
            `Limite mensal de ${LIMITES_IA_NEGOCIO.usoMensalPadrao} mensagens da IA de Negócio atingido. Volta no próximo mês.`
        );
    }

    return { periodo, restante: LIMITES_IA_NEGOCIO.usoMensalPadrao - resultado.atual };
}

async function carregarDadosLoja(ownerUid) {
    const db = getFirestore();
    const [lojaSnap, produtosSnap, pedidosSnap, leadsSnap] = await Promise.all([
        db.doc(`usuarios/${ownerUid}`).get(),
        db.collection("produtos").where("criadoPor", "==", ownerUid).limit(LIMITES_IA_NEGOCIO.maxProdutosContexto).get(),
        db.collection("pedidos").where("criadoPor", "==", ownerUid).limit(LIMITES_IA_NEGOCIO.maxPedidosContexto).get(),
        db.collection("leads").where("criadoPor", "==", ownerUid).limit(LIMITES_IA_NEGOCIO.maxLeadsContexto).get()
    ]);

    return {
        loja: lojaSnap.exists ? lojaSnap.data() : {},
        produtos: produtosSnap.docs.map((d) => d.data()),
        pedidos: pedidosSnap.docs.map((d) => d.data()),
        leads: leadsSnap.docs.map((d) => d.data())
    };
}

async function chamarGemini(payload, apiKey) {
    let resposta;
    try {
        resposta = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
    } catch (error) {
        logger.error("[IA de Negócio] Falha de rede ao chamar o Gemini:", error);
        throw new HttpsError("unavailable", "Não foi possível falar com a IA agora. Tente novamente em instantes.");
    }

    if (!resposta.ok) {
        const corpoErro = await resposta.text().catch(() => "");
        logger.error("[IA de Negócio] Erro do Gemini:", { status: resposta.status, corpoErro });
        // 429 do próprio Gemini (créditos/faturamento esgotados no projeto da
        // API key, ver ai.studio/projects) é um estado operacional real, não
        // uma falha transitória — merece mensagem própria em vez do genérico
        // "tente novamente".
        if (resposta.status === 429) {
            throw new HttpsError(
                "resource-exhausted",
                "O provedor de IA está sem créditos disponíveis no momento. Avise o administrador da plataforma."
            );
        }
        throw new HttpsError("unavailable", "A IA não conseguiu responder agora. Tente novamente em instantes.");
    }

    return resposta.json();
}

const askBusinessAI = onCall({ region: "southamerica-east1", secrets: [GEMINI_API_KEY] }, async (request) => {
    const context = await resolveCallerContext(request);
    requireEdit(context, "central-ia");

    // Admin backend (claim videAdmin) nunca tem context.owner — mesma regra
    // usada em canEdit/canView e em VideHubContext.hasFeature no frontend:
    // admin sempre passa, sem checar plano.
    if (!context.isAdmin) {
        const plano = String(context.owner?.plano || "starter").trim().toLowerCase();
        if (!PLANOS_COM_IA_REAL.has(plano)) {
            throw new HttpsError(
                "permission-denied",
                "A IA de Negócio é exclusiva do plano Pro (ou superior). Faça upgrade do plano para usar."
            );
        }
    }

    const pergunta = sanitizarPergunta(request.data?.pergunta);
    if (!pergunta) {
        throw new HttpsError("invalid-argument", "Digite uma pergunta.");
    }

    const historico = Array.isArray(request.data?.historico) ? request.data.historico.slice(-LIMITES_IA_NEGOCIO.maxHistoricoMensagens) : [];

    const { periodo, restante } = await assertMonthlyQuota(context.ownerUid);

    const dados = await carregarDadosLoja(context.ownerUid);
    const contextoNegocio = montarContextoNegocio(dados);
    const contextoTexto = contextoParaTexto(contextoNegocio);
    const systemPrompt = montarSystemPrompt(contextoNegocio.nomeLoja);
    const suspeitaInjecao = detectarTentativaInjecao(pergunta);

    const payload = montarMensagensGemini({ systemPrompt, contextoTexto, historico, pergunta });
    const respostaBruta = await chamarGemini(payload, GEMINI_API_KEY.value());
    const texto = extrairTextoRespostaGemini(respostaBruta);

    if (!texto) {
        throw new HttpsError("internal", "A IA não devolveu uma resposta válida. Tente novamente.");
    }

    return {
        resposta: texto,
        periodo,
        restanteNoMes: restante,
        avisoInjecao: suspeitaInjecao
    };
});

module.exports = { askBusinessAI };
