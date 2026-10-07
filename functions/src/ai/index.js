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
const { assertPublicRateLimit } = require("../shared/rateLimit");
const { resolvePublicTenant, publicOptions } = require("../public");
const {
    LIMITES_IA_NEGOCIO,
    contextoParaTexto,
    contextoPublicoParaTexto,
    detectarTentativaInjecao,
    extrairTextoRespostaGemini,
    montarContextoNegocio,
    montarContextoNegocioPublico,
    montarMensagensGemini,
    montarSystemPrompt,
    montarSystemPromptPublico,
    sanitizarPergunta
} = require("./promptBuilder");

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const { createProvider, FUNCTION_TIMEOUT_SECONDS } = require("./provider");
const { chamarGemini, runWithDeadline } = createProvider({ fetch: (...args) => fetch(...args), logger, HttpsError });

const PLANOS_COM_IA_REAL = new Set(["pro", "proplus", "agencia", "enterprise", "premium"]);

function currentPeriodKey(now = new Date()) {
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function assertMonthlyQuota(ownerUid, channel = "private", db = getFirestore(), now = new Date()) {
    if (!["private", "public"].includes(channel)) throw new HttpsError("invalid-argument", "Canal inválido.");
    const periodo = currentPeriodKey(now);
    const ref = db.doc(`ia_negocio_uso/${ownerUid}_${periodo}`);

    const resultado = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.exists ? snap.data() : {};
        const atual = data.count ?? 0;
        // Legado: uso sem atribuição pode ter sido público. Nunca zerar o total.
        const publicCount = data.publicCount ?? atual;
        if (!Number.isSafeInteger(atual) || atual < 0 ||
            !Number.isSafeInteger(publicCount) || publicCount < 0 || publicCount > atual) {
            throw new HttpsError("failed-precondition", "Contador de uso inválido. Contate o suporte.");
        }
        if (atual >= LIMITES_IA_NEGOCIO.usoMensalPadrao ||
            (channel === "public" && publicCount >= LIMITES_IA_NEGOCIO.usoMensalPublico)) {
            return { excedeu: true, atual };
        }
        tx.set(ref, {
            ownerUid,
            periodo,
            count: atual + 1,
            publicCount: publicCount + (channel === "public" ? 1 : 0),
            ultimaPerguntaEm: FieldValue.serverTimestamp()
        }, { merge: true });
        return { excedeu: false, atual: atual + 1 };
    });

    if (resultado.excedeu) {
        throw new HttpsError(
            "resource-exhausted",
            channel === "public"
                ? "Limite mensal da assistente pública atingido. Volta no próximo mês."
                : `Limite mensal de ${LIMITES_IA_NEGOCIO.usoMensalPadrao} mensagens da IA de Negócio atingido. Volta no próximo mês.`
        );
    }

    return { periodo, restante: LIMITES_IA_NEGOCIO.usoMensalPadrao - resultado.atual };
}

// Validação local antes de qualquer reserva mensal. Mantém o histórico de
// respostas de até 4000 caracteres mais a elipse de truncagem; o builder o trunca para o prompt como antes.
function validarEntrada(data, channel) {
    if (!data || typeof data !== "object" || Array.isArray(data) ||
        typeof data.pergunta !== "string" || data.pergunta.length > LIMITES_IA_NEGOCIO.maxCaracteresPergunta) {
        throw new HttpsError("invalid-argument", "Pergunta inválida ou muito longa.");
    }
    const pergunta = sanitizarPergunta(data.pergunta);
    if (!pergunta) throw new HttpsError("invalid-argument", "Digite uma pergunta.");
    const historico = data.historico === undefined ? [] : data.historico;
    const autores = new Set([channel === "public" ? "visitante" : "dono", "ia"]);
    if (!Array.isArray(historico) || historico.length > LIMITES_IA_NEGOCIO.maxHistoricoMensagens ||
        historico.some(item => !item || typeof item !== "object" || Array.isArray(item) ||
            !autores.has(item.autor) || typeof item.texto !== "string" ||
            !sanitizarPergunta(item.texto) || item.texto.length > LIMITES_IA_NEGOCIO.maxCaracteresResposta + 1)) {
        throw new HttpsError("invalid-argument", "Histórico inválido.");
    }
    return { pergunta, historico: historico.map(({autor, texto}) => ({autor, texto})) };
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

// Versão pro visitante público: só produtos, nunca pedidos/leads — a
// query em si já não busca essas coleções (defesa em profundidade, além
// do contexto que também as filtra).
async function carregarProdutosPublicos(ownerUid, db = getFirestore()) {
    const produtosSnap = await db.collection("produtos")
        .where("criadoPor", "==", ownerUid)
        .where("statusProduto", "==", "ativo")
        .limit(LIMITES_IA_NEGOCIO.maxProdutosContexto)
        .get();
    return { produtos: produtosSnap.docs.map((d) => d.data()) };
}

const askBusinessAI = onCall({ region: "southamerica-east1", timeoutSeconds: FUNCTION_TIMEOUT_SECONDS, secrets: [GEMINI_API_KEY] }, async (request) => runWithDeadline(async (signal) => {
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

    const { pergunta, historico } = validarEntrada(request.data, "private");

    // onCall do Firebase esconde a mensagem real de qualquer exceção não
    // tratada (vira "internal"/"INTERNAL" genérico pro cliente, por
    // segurança) — o stack completo já vai pro Cloud Logging via
    // logger.error, então o dono só recebe um aviso amigável, nunca detalhe
    // interno.
    if (signal.aborted) throw new HttpsError("unavailable", "Tempo de processamento esgotado.");
    try {
        const { periodo, restante } = await assertMonthlyQuota(context.ownerUid);

        const dados = await carregarDadosLoja(context.ownerUid);
        const contextoNegocio = montarContextoNegocio(dados);
        const contextoTexto = contextoParaTexto(contextoNegocio);
        const systemPrompt = montarSystemPrompt(contextoNegocio.nomeLoja);
        const suspeitaInjecao = detectarTentativaInjecao(pergunta);

        const payload = montarMensagensGemini({ systemPrompt, contextoTexto, historico, pergunta });
        const respostaBruta = await chamarGemini(payload, GEMINI_API_KEY.value(), "privado", signal);
        const texto = extrairTextoRespostaGemini(respostaBruta);

        if (!texto) {
            // Sem este log o "internal" abaixo chegaria ao cliente sem
            // nenhuma causa registrada — nunca com a resposta do provedor,
            // a pergunta ou o histórico.
            logger.error(
                "[IA de Negócio] Gemini sem texto utilizável:",
                new Error("GEMINI_EMPTY_RESPONSE: resposta sem texto utilizável"),
                { caminho: "privado" }
            );
            throw new HttpsError("internal", "A IA não devolveu uma resposta válida. Tente novamente.");
        }

        return {
            resposta: texto,
            periodo,
            restanteNoMes: restante,
            avisoInjecao: suspeitaInjecao
        };
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        logger.error("[IA de Negócio] Erro inesperado:", error);
        throw new HttpsError("internal", "Ocorreu um erro inesperado ao falar com a IA. Tente novamente em instantes.");
    }
}, "privado"));

// Igual ao limite de sendPublicChatMessage (functions/src/public/index.js) —
// uma pergunta por IA custa mais caro que uma mensagem de chat comum, por
// isso um teto mais apertado por IP.
const RATE_LIMIT_ASK_PUBLIC_BUSINESS_AI = 8;

// Assistente PÚBLICA — visitante da loja (sem login) conversa sobre o
// catálogo. Diferenças estruturais em relação a askBusinessAI:
// - Sem resolveCallerContext/auth: o tenant vem de storeSlug, resolvido
//   contra vitrines_publicas (mesmo helper das outras Functions públicas).
// - NUNCA confia no espelho público pra autorizar — plano e o toggle
//   "ativar na loja pública" são relidos direto de usuarios/{ownerUid}
//   via Admin SDK, a mesma fonte de verdade que askBusinessAI usa.
// - Contexto só com produtos ativos (nunca pedidos/leads/receita) — ver
//   montarContextoNegocioPublico em promptBuilder.js.
// - Divide o MESMO teto mensal de ia_negocio_uso/{ownerUid}_{periodo} com
//   o uso do dono no dashboard: um único orçamento de custo por loja,
//   não importa quem pergunta — evita que tráfego público estoure o
//   custo sem limite. O público também respeita o subteto de 100;
//   a reserva privada não pode ser consumida por visitantes.
//
// enforceAppCheck: false — publicOptions liga isso em produção, mas
// nenhuma página do projeto (loja.html incluída) chama
// initializeAppCheck(); herdar esse valor faz TODA chamada real cair
// com "unauthenticated" antes mesmo de rodar. Erro real, encontrado
// testando ao vivo. A mitigação de abuso real aqui é o rate limit por
// IP (assertPublicRateLimit acima), igual às outras Functions públicas
// deste arquivo — nenhuma delas exige App Check por engano assim.
const askPublicBusinessAI = onCall({ ...publicOptions, timeoutSeconds: FUNCTION_TIMEOUT_SECONDS, enforceAppCheck: false, secrets: [GEMINI_API_KEY] }, async (request) => runWithDeadline(async (signal) => {
    await assertPublicRateLimit(request, "askPublicBusinessAI", RATE_LIMIT_ASK_PUBLIC_BUSINESS_AI);

    const tenant = await resolvePublicTenant(request.data || {});
    const ownerUid = tenant.ownerUid;

    const ownerSnap = await getFirestore().doc(`usuarios/${ownerUid}`).get();
    const owner = ownerSnap.exists ? ownerSnap.data() : {};
    const plano = String(owner.plano || "starter").trim().toLowerCase();
    if (!PLANOS_COM_IA_REAL.has(plano) || owner.iaNegocioPublicaAtiva !== true) {
        throw new HttpsError("failed-precondition", "A assistente não está disponível para esta loja no momento.");
    }

    const { pergunta, historico } = validarEntrada(request.data, "public");

    if (signal.aborted) throw new HttpsError("unavailable", "Tempo de processamento esgotado.");
    try {
        await assertMonthlyQuota(ownerUid, "public");

        const { produtos } = await carregarProdutosPublicos(ownerUid);
        const contextoNegocio = montarContextoNegocioPublico({ loja: owner, produtos });
        const contextoTexto = contextoPublicoParaTexto(contextoNegocio);
        const systemPrompt = montarSystemPromptPublico(contextoNegocio.nomeLoja);
        const suspeitaInjecao = detectarTentativaInjecao(pergunta);

        const payload = montarMensagensGemini({ systemPrompt, contextoTexto, historico, pergunta });
        const respostaBruta = await chamarGemini(payload, GEMINI_API_KEY.value(), "publico", signal);
        const texto = extrairTextoRespostaGemini(respostaBruta);

        if (!texto) {
            // Mesmo motivo do caminho privado (askBusinessAI).
            logger.error(
                "[IA de Negócio pública] Gemini sem texto utilizável:",
                new Error("GEMINI_EMPTY_RESPONSE: resposta sem texto utilizável"),
                { caminho: "publico" }
            );
            throw new HttpsError("internal", "A assistente não devolveu uma resposta válida. Tente novamente.");
        }

        return { resposta: texto, avisoInjecao: suspeitaInjecao };
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        logger.error("[IA de Negócio pública] Erro inesperado:", error);
        throw new HttpsError("internal", "Ocorreu um erro inesperado ao falar com a assistente. Tente novamente em instantes.");
    }
}, "publico"));

module.exports = { askBusinessAI, askPublicBusinessAI, assertMonthlyQuota, currentPeriodKey, carregarProdutosPublicos, validarEntrada };
