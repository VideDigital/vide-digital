// Copiloto de IA da Central de Atendimento — Fase 1.
//
// Regras inegociáveis desta fase, cumpridas neste arquivo inteiro:
// - NUNCA chama um provedor de IA externo. Todo texto sugerido vem de um
//   provedor mock local, determinístico e sem rede (gerarSugestaoMock),
//   que só lê dados já carregados no navegador (conversa, cliente,
//   pedidos, templates, Base de Conhecimento) — nenhuma chave de IA
//   existe neste arquivo, neste módulo ou em qualquer lugar do frontend.
// - NUNCA envia mensagem sozinho. O controller devolve sugestões; quem
//   decide inserir no compositor e enviar é sempre o humano.
// - NUNCA duplica dados: reaproveita funções puras já existentes em
//   atendimento.js, crm360.js, templates-atendimento.js,
//   pedidos-estruturados.js e base-conhecimento-ia.js em vez de
//   reimplementar filtros/cálculos que já existem.
// - Segue o mesmo padrão de módulo do projeto: funções puras testáveis +
//   um criarIaCopilotController(deps) que recebe dependências por
//   injeção, sem importar Firebase diretamente.

import { filtrarItensConhecimento } from "./base-conhecimento-ia.js";
import { filtrarTemplatesAtendimento, templatesMaisUsados } from "./templates-atendimento.js";
import { resumoTextoItens } from "./pedidos-estruturados.js";

// ---------- Ações do copiloto ----------
// 14 ações estruturadas. Cada uma devolve um objeto (nunca só uma
// string) com o mesmo formato — ver gerarSugestaoMock().
export const ACOES_IA_COPILOT = Object.freeze({
    resumir_conversa: "Resumir conversa",
    sugerir_resposta: "Sugerir resposta",
    sugerir_proxima_acao: "Sugerir próxima ação",
    detectar_intencao: "Detectar intenção do cliente",
    sugerir_template: "Sugerir template",
    sugerir_tags: "Sugerir tags",
    sugerir_status: "Sugerir status da conversa",
    identificar_pedido_relacionado: "Identificar pedido relacionado",
    analisar_sentimento: "Analisar sentimento do cliente",
    sugerir_produtos_relacionados: "Sugerir produtos relacionados",
    verificar_duvida_frequente: "Verificar dúvida frequente (FAQ)",
    sinalizar_reclamacao: "Sinalizar possível reclamação",
    sugerir_encaminhamento: "Sugerir encaminhamento",
    gerar_resumo_pos_atendimento: "Gerar resumo pós-atendimento"
});

export const LIMITES_IA_COPILOT = Object.freeze({
    maxMensagensContexto: 12,
    maxEventosContexto: 10,
    maxCaracteresPorMensagem: 400,
    maxCaracteresContextoTotal: 6000,
    maxConhecimentoRelevante: 5,
    maxTemplatesRelevantes: 5,
    maxPedidosContexto: 5,
    maxCaracteresTextoSugestao: 1200,
    maxFontesUsadas: 6,
    maxHistoricoSugestoes: 20
});

// Contrato documentado — NÃO implementado nesta fase. Nenhum código deste
// projeto chama este endpoint; existe só como referência para quando um
// backend externo real (Cloud Function ou serviço próprio, nunca o
// frontend) for construído. A chave do provedor (OpenAI/Claude/Gemini/
// outro) ficaria SOMENTE nesse backend, nunca em variável de frontend,
// Firestore ou repositório.
export const CONTRATO_BACKEND_IA_FUTURO = Object.freeze({
    metodo: "POST",
    rota: "/ai/copilot/suggest",
    autenticacao: "Bearer <ID token do Firebase Auth do funcionário/dono>, validado no backend",
    requestBody: Object.freeze({
        tenantId: "string — obrigatório, sempre o storeUid do tenant autenticado",
        chatId: "string — obrigatório",
        action: "string — uma das chaves de ACOES_IA_COPILOT",
        contexto: "objeto — o mesmo formato produzido por construirContextoIA() deste arquivo",
        idioma: "string — ex.: pt-BR"
    }),
    responseBody: Object.freeze({
        action: "string",
        text: "string",
        confidence: "number entre 0 e 1",
        usedSources: "array de strings curtas (ex.: 'Pedido #1042', 'FAQ: Prazo de entrega')",
        warnings: "array de strings (ex.: 'Preço não confirmado no contexto')",
        suggestedTemplateId: "string | null",
        suggestedStatus: "string | null",
        suggestedTags: "array de strings",
        nextActions: "array de strings curtas"
    }),
    observacoes: [
        "O backend NUNCA recebe a chave do funcionário/dono como identidade — só o ID token, validado pelo Admin SDK.",
        "O backend é responsável por aplicar rate limit e nunca por confiar em 'contexto' sem revalidar tamanho/formato.",
        "Nenhum dado deste contrato foi implementado nesta fase — só o mock local em gerarSugestaoMock()."
    ]
});

// Config do provedor — hoje sempre "mock". O shape já existe para quando
// um provedor externo for plugado, mas não há campo de chave em lugar
// nenhum do frontend: a chave, se um dia existir, mora só no backend.
export const CONFIG_PROVEDOR_IA_COPILOT = Object.freeze({
    provider: "mock",
    endpoint: null,
    enabled: false
});

// ---------- Sanitização e defesa contra prompt injection ----------

const PADROES_INJECAO = [
    /ignor[ae]\s+(as\s+)?instru[cç][õo]es/i,
    /esque[çc]a\s+(as\s+)?regras/i,
    /aja\s+como\s+(admin|administrador|sistema|dono)/i,
    /fale\s+como\s+(admin|administrador|sistema)/i,
    /finja\s+que\s+voc[eê]/i,
    /voc[eê]\s+(agora\s+)?[eé]\s+(admin|administrador|o\s+sistema)/i,
    /mostre\s+(os\s+)?dados\s+(de\s+)?(outro|outra)\s+(cliente|loja|tenant|empresa)/i,
    /me\s+d[eê]\s+(um\s+)?desconto/i,
    /desconto\s+especial\s+sem\s+autoriza[çc][aã]o/i,
    /revele\s+(informa[çc][õo]es|dados)\s+internas?/i,
    /prompt\s+(do\s+)?sistema/i,
    /system\s+prompt/i,
    /qual\s+[eé]\s+(sua|a)\s+instru[çc][aã]o/i
];

export function detectarTentativaInjecao(texto) {
    const alvo = String(texto || "");
    const motivos = PADROES_INJECAO
        .filter(padrao => padrao.test(alvo))
        .map(padrao => padrao.source);
    return { suspeita: motivos.length > 0, motivos };
}

// Remove caracteres de controle (exceto quebra de linha/tab) e caracteres
// invisíveis usados em tentativas de injeção via unicode — nunca altera o
// texto que o cliente vê no chat, só o que entra no contexto da IA.
export function sanitizarTextoCliente(texto, maxCaracteres = LIMITES_IA_COPILOT.maxCaracteresPorMensagem) {
    const CONTROLE_E_INVISIVEIS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\uFEFF]/g;
    const limpo = String(texto || "")
        .replace(CONTROLE_E_INVISIVEIS, "")
        .replace(/\s+/g, " ")
        .trim();
    return limpo.length > maxCaracteres ? `${limpo.slice(0, maxCaracteres)}…` : limpo;
}

// ---------- Identificação de intenção ----------

const PALAVRAS_INTENCAO = Object.freeze({
    orcamento: ["orçamento", "orcamento", "quanto custa", "preço", "preco", "valor do", "quanto fica", "quanto é", "cotação", "cotacao"],
    prazo: ["prazo", "quando chega", "demora quanto", "tempo de entrega", "vai demorar", "data de entrega"],
    pagamento: ["pagamento", "pagar", "boleto", "pix", "cartão", "cartao", "parcelar", "parcela"],
    entrega: ["entrega", "frete", "rastreio", "rastreamento", "endereço", "endereco", "correio", "transportadora"],
    // "defeito" sozinho fica de fora daqui de propósito: "veio com
    // defeito"/"veio errado" já são frases mais específicas em pos_venda,
    // e a palavra solta faria qualquer reclamação pós-venda cair aqui.
    suporte: ["não funciona", "nao funciona", "problema com", "erro no", "ajuda com", "como uso", "como usar"],
    reclamacao: ["reclamação", "reclamacao", "insatisfeito", "péssimo", "pessimo", "cancelar compra", "quero meu dinheiro", "processar", "reembolso"],
    pos_venda: ["troca", "devolução", "devolucao", "garantia", "veio errado", "veio com defeito", "avaria"],
    personalizacao: ["personalizado", "sob medida", "gravação", "gravacao", "cor específica", "cor especifica", "tamanho especial"]
});

export function identificarIntencao(texto) {
    const alvo = sanitizarTextoCliente(texto, 2000).toLowerCase();
    if (!alvo) return "outro";

    for (const [intencao, palavras] of Object.entries(PALAVRAS_INTENCAO)) {
        if (palavras.some(palavra => alvo.includes(palavra))) return intencao;
    }
    return "outro";
}

const ROTULOS_INTENCAO = Object.freeze({
    orcamento: "Orçamento",
    prazo: "Prazo",
    pagamento: "Pagamento",
    entrega: "Entrega",
    suporte: "Suporte",
    reclamacao: "Reclamação",
    pos_venda: "Pós-venda",
    personalizacao: "Personalização",
    outro: "Outro"
});

// ---------- Context builder (limitado, sanitizado, sem novas leituras) ----------
// Todas as funções abaixo recebem dados já carregados em memória por
// atendimentoController.state / crm360Controller.state / configuração já
// carregada da Central de IA / Base de Conhecimento / Templates — nenhuma
// delas faz `getDoc`/`getDocs` nova. Isso é o que garante "não criar uma
// segunda estrutura de dados": o copiloto só lê o que já existe.

function timestampMs(valor) {
    if (!valor) return 0;
    if (typeof valor.toMillis === "function") return valor.toMillis();
    if (typeof valor.seconds === "number") return valor.seconds * 1000;
    return typeof valor === "number" ? valor : 0;
}

export function construirContextoMensagens(mensagens = [], limite = LIMITES_IA_COPILOT.maxMensagensContexto) {
    return (Array.isArray(mensagens) ? mensagens : [])
        .slice(-limite)
        .map(mensagem => ({
            remetente: mensagem?.sender === "cliente" ? "cliente" : "equipe",
            texto: sanitizarTextoCliente(mensagem?.texto),
            quandoMs: timestampMs(mensagem?.timestamp || mensagem?.criadoEm)
        }))
        .filter(item => item.texto.length > 0);
}

export function construirContextoEventos(eventos = [], limite = LIMITES_IA_COPILOT.maxEventosContexto) {
    return (Array.isArray(eventos) ? eventos : [])
        .slice(-limite)
        .map(evento => ({
            tipo: String(evento?.tipo || ""),
            resumo: sanitizarTextoCliente(evento?.resumo, 200),
            quandoMs: timestampMs(evento?.criadoEm)
        }))
        .filter(item => item.tipo);
}

// Só o essencial pro copiloto — nunca documento (CPF/CNPJ), telefone ou
// e-mail bruto entram no contexto da IA, mesmo sendo um provedor local.
// Isso estabelece o limite certo desde já, pra quando existir provedor
// externo de verdade o contrato não mudar.
export function construirContextoCliente(cliente) {
    if (!cliente || typeof cliente !== "object") return null;
    return {
        nome: sanitizarTextoCliente(cliente.nome, 120) || "Cliente",
        statusRelacionamento: String(cliente.statusRelacionamento || cliente.status || "") || null,
        tags: Array.isArray(cliente.tags) ? cliente.tags.slice(0, 10).map(String) : []
    };
}

export function construirContextoPedidos(pedidos = [], limite = LIMITES_IA_COPILOT.maxPedidosContexto) {
    return (Array.isArray(pedidos) ? pedidos : [])
        .slice(0, limite)
        .map(pedido => ({
            id: String(pedido?.id || ""),
            numero: pedido?.numero || pedido?.id || "",
            status: String(pedido?.status || ""),
            resumoItens: Array.isArray(pedido?.itens) && pedido.itens.length
                ? resumoTextoItens(pedido.itens)
                : sanitizarTextoCliente(pedido?.produtos, 200),
            prazoEntrega: pedido?.prazoEntrega ? String(pedido.prazoEntrega) : null
        }))
        .filter(item => item.id);
}

export function selecionarConhecimentoRelevante(
    textoReferencia,
    itensConhecimento = [],
    limite = LIMITES_IA_COPILOT.maxConhecimentoRelevante
) {
    const termo = sanitizarTextoCliente(textoReferencia, 200);
    const prontos = (Array.isArray(itensConhecimento) ? itensConhecimento : [])
        .filter(item => item?.status === "pronto");
    const filtrados = termo
        ? filtrarItensConhecimento(prontos, { busca: termo })
        : prontos;
    const base = filtrados.length ? filtrados : prontos;
    return base.slice(0, limite).map(item => ({
        id: String(item.id || ""),
        titulo: sanitizarTextoCliente(item.titulo, 120),
        tipo: String(item.tipo || ""),
        trecho: sanitizarTextoCliente(item.resumo || item.conteudo, 300)
    }));
}

export function selecionarTemplatesRelevantes(
    intencao,
    templates = [],
    limite = LIMITES_IA_COPILOT.maxTemplatesRelevantes
) {
    const porCategoria = filtrarTemplatesAtendimento(templates, { busca: ROTULOS_INTENCAO[intencao] || "" });
    const base = porCategoria.length ? porCategoria : templatesMaisUsados(templates, limite);
    return base.slice(0, limite).map(template => ({
        id: String(template.id || ""),
        titulo: sanitizarTextoCliente(template.titulo, 120),
        categoria: String(template.categoria || "")
    }));
}

// Orquestrador único: aplica todos os limites/truncamentos e devolve um
// objeto pronto pra ser lido por gerarSugestaoMock() (e, no futuro, pelo
// contrato documentado em CONTRATO_BACKEND_IA_FUTURO). Sinaliza tentativa
// de injeção na última mensagem do cliente sem bloquear a geração — quem
// decide o que fazer com o aviso é validarQualidadeSugestao()/a UI.
export function construirContextoIA({
    mensagens = [],
    eventos = [],
    cliente = null,
    pedidos = [],
    templates = [],
    conhecimento = [],
    assistantConfig = null
} = {}) {
    const mensagensContexto = construirContextoMensagens(mensagens);
    const ultimaMensagemCliente = [...mensagensContexto].reverse()
        .find(item => item.remetente === "cliente");
    const textoReferencia = ultimaMensagemCliente?.texto || "";
    const intencao = identificarIntencao(textoReferencia);
    const injecao = detectarTentativaInjecao(textoReferencia);

    const contexto = {
        mensagens: mensagensContexto,
        eventos: construirContextoEventos(eventos),
        cliente: construirContextoCliente(cliente),
        pedidos: construirContextoPedidos(pedidos),
        conhecimentoRelevante: selecionarConhecimentoRelevante(textoReferencia, conhecimento),
        templatesRelevantes: selecionarTemplatesRelevantes(intencao, templates),
        intencaoDetectada: intencao,
        assistantConfig: assistantConfig ? {
            nomeAssistente: String(assistantConfig.nomeAssistente || ""),
            personalidade: String(assistantConfig.personalidade || "")
        } : null,
        alertaInjecao: injecao
    };

    const tamanhoAproximado = JSON.stringify(contexto).length;
    if (tamanhoAproximado > LIMITES_IA_COPILOT.maxCaracteresContextoTotal) {
        contexto.mensagens = contexto.mensagens.slice(-4);
        contexto.eventos = contexto.eventos.slice(-3);
        contexto.conhecimentoRelevante = contexto.conhecimentoRelevante.slice(0, 2);
        contexto.templatesRelevantes = contexto.templatesRelevantes.slice(0, 2);
    }

    return contexto;
}

// ---------- Provedor mock (Fase 1 — nenhuma chamada externa) ----------

function ultimoTextoCliente(contexto) {
    const item = [...(contexto.mensagens || [])].reverse().find(m => m.remetente === "cliente");
    return item?.texto || "";
}

function montarFontes(contexto) {
    const fontes = [];
    (contexto.pedidos || []).slice(0, 2).forEach(pedido => {
        fontes.push(`Pedido #${pedido.numero || pedido.id}`);
    });
    (contexto.conhecimentoRelevante || []).slice(0, 3).forEach(item => {
        fontes.push(`FAQ: ${item.titulo}`);
    });
    return fontes.slice(0, LIMITES_IA_COPILOT.maxFontesUsadas);
}

function baseSugestao(action, contexto) {
    return {
        action,
        text: "",
        confidence: 0.5,
        usedSources: montarFontes(contexto),
        warnings: [],
        suggestedTemplateId: null,
        suggestedStatus: null,
        suggestedTags: [],
        nextActions: []
    };
}

// Router central do provedor mock — todas as 14 ações passam por aqui.
// Nunca inventa preço, prazo ou status que não esteja no contexto
// recebido: quando a informação não existe, a sugestão avisa em
// `warnings` em vez de arriscar um valor.
export function gerarSugestaoMock(contexto, action, opts = {}) {
    if (!Object.hasOwn(ACOES_IA_COPILOT, action)) {
        throw new Error(`Ação de copiloto desconhecida: ${action}`);
    }
    const ctx = contexto && typeof contexto === "object" ? contexto : {};
    const ultimoTexto = ultimoTextoCliente(ctx);
    const nomeCliente = ctx.cliente?.nome || "cliente";
    const sugestao = baseSugestao(action, ctx);

    if (ctx.alertaInjecao?.suspeita) {
        sugestao.warnings.push("Mensagem do cliente contém padrão semelhante a tentativa de manipular a IA — revise com atenção antes de usar.");
        sugestao.confidence = Math.min(sugestao.confidence, 0.4);
    }

    switch (action) {
        case "resumir_conversa": {
            const total = ctx.mensagens?.length || 0;
            sugestao.text = total
                ? `Conversa com ${total} mensagem(ns) recentes. Última mensagem do cliente: "${ultimoTexto || "—"}". Intenção detectada: ${ROTULOS_INTENCAO[ctx.intencaoDetectada] || "Outro"}.`
                : "Ainda não há mensagens suficientes nesta conversa para resumir.";
            sugestao.confidence = total ? 0.7 : 0.3;
            break;
        }
        case "sugerir_resposta": {
            if (!ultimoTexto) {
                sugestao.text = "";
                sugestao.warnings.push("Não há mensagem recente do cliente para basear uma resposta.");
                sugestao.confidence = 0.2;
                break;
            }
            const template = ctx.templatesRelevantes?.[0] || null;
            const abertura = `Olá, ${nomeCliente}! `;
            if (ctx.intencaoDetectada === "prazo" && ctx.pedidos?.length) {
                const pedido = ctx.pedidos[0];
                sugestao.text = pedido.prazoEntrega
                    ? `${abertura}Sobre o pedido #${pedido.numero || pedido.id}, o prazo de entrega informado é ${pedido.prazoEntrega}.`
                    : `${abertura}Vou confirmar o prazo de entrega do pedido #${pedido.numero || pedido.id} e já te retorno.`;
                if (!pedido.prazoEntrega) sugestao.warnings.push("Prazo de entrega não encontrado no contexto — confirme antes de enviar.");
            } else if (ctx.conhecimentoRelevante?.length) {
                sugestao.text = `${abertura}${ctx.conhecimentoRelevante[0].trecho}`;
                sugestao.suggestedTemplateId = template?.id || null;
            } else if (template) {
                sugestao.text = `${abertura}Consegue me dar mais detalhes? Assim consigo te ajudar melhor com isso.`;
                sugestao.suggestedTemplateId = template.id;
            } else {
                sugestao.text = `${abertura}Já estou verificando isso pra você, um momento.`;
                sugestao.warnings.push("Nenhuma fonte específica encontrada — resposta genérica, revise antes de enviar.");
                sugestao.confidence = 0.3;
            }
            break;
        }
        case "sugerir_proxima_acao": {
            const acoes = [];
            if (ctx.intencaoDetectada === "reclamacao") acoes.push("Registrar observação interna com o motivo da reclamação");
            if (ctx.intencaoDetectada === "prazo" || ctx.intencaoDetectada === "entrega") acoes.push("Confirmar status do pedido vinculado");
            if (!ctx.pedidos?.length) acoes.push("Perguntar se o cliente já tem um pedido em andamento");
            if (ctx.templatesRelevantes?.length) acoes.push(`Usar o template "${ctx.templatesRelevantes[0].titulo}"`);
            acoes.push("Responder e aguardar retorno do cliente");
            sugestao.nextActions = acoes.slice(0, 4);
            sugestao.text = sugestao.nextActions.join(" · ");
            break;
        }
        case "detectar_intencao": {
            sugestao.text = ROTULOS_INTENCAO[ctx.intencaoDetectada] || "Outro";
            sugestao.confidence = ctx.intencaoDetectada === "outro" ? 0.3 : 0.7;
            break;
        }
        case "sugerir_template": {
            const template = ctx.templatesRelevantes?.[0] || null;
            sugestao.suggestedTemplateId = template?.id || null;
            sugestao.text = template ? `Template sugerido: "${template.titulo}"` : "Nenhum template relevante encontrado para esta conversa.";
            sugestao.confidence = template ? 0.6 : 0.2;
            break;
        }
        case "sugerir_tags": {
            const tags = new Set();
            if (ctx.intencaoDetectada !== "outro") tags.add(ctx.intencaoDetectada);
            if (ctx.alertaInjecao?.suspeita) tags.add("atencao");
            sugestao.suggestedTags = Array.from(tags).slice(0, 5);
            sugestao.text = sugestao.suggestedTags.length ? sugestao.suggestedTags.join(", ") : "Nenhuma tag sugerida.";
            break;
        }
        case "sugerir_status": {
            if (ctx.intencaoDetectada === "reclamacao") {
                sugestao.suggestedStatus = "aberta";
                sugestao.text = "Sugestão: manter conversa aberta e priorizada — possível reclamação.";
            } else if (ultimoTexto) {
                sugestao.suggestedStatus = "aguardando_equipe";
                sugestao.text = "Sugestão: aguardando equipe (cliente respondeu recentemente).";
            } else {
                sugestao.text = "Sem elementos suficientes para sugerir mudança de status.";
                sugestao.confidence = 0.2;
            }
            break;
        }
        case "identificar_pedido_relacionado": {
            const pedido = ctx.pedidos?.[0] || null;
            sugestao.text = pedido
                ? `Pedido relacionado provável: #${pedido.numero || pedido.id} (status: ${pedido.status || "—"}).`
                : "Nenhum pedido vinculado encontrado no contexto desta conversa.";
            sugestao.confidence = pedido ? 0.6 : 0.2;
            break;
        }
        case "analisar_sentimento": {
            const negativo = /(péssimo|pessimo|horrível|horrivel|absurdo|revoltante|nunca mais|insatisfeit)/i.test(ultimoTexto);
            const positivo = /(obrigad|ótimo|otimo|excelente|adorei|perfeito)/i.test(ultimoTexto);
            sugestao.text = negativo ? "Sentimento provável: negativo" : positivo ? "Sentimento provável: positivo" : "Sentimento provável: neutro";
            sugestao.confidence = negativo || positivo ? 0.6 : 0.3;
            if (negativo) sugestao.warnings.push("Sinal de insatisfação detectado — considere priorizar esta conversa.");
            break;
        }
        case "sugerir_produtos_relacionados": {
            const itensProduto = (ctx.conhecimentoRelevante || []).filter(item => item.tipo === "produto");
            sugestao.text = itensProduto.length
                ? `Produtos relacionados na Base de Conhecimento: ${itensProduto.map(i => i.titulo).join(", ")}`
                : "Nenhum produto relacionado encontrado na Base de Conhecimento para esta conversa.";
            sugestao.confidence = itensProduto.length ? 0.5 : 0.2;
            break;
        }
        case "verificar_duvida_frequente": {
            const faq = (ctx.conhecimentoRelevante || []).find(item => item.tipo === "faq");
            sugestao.text = faq ? `FAQ encontrada: "${faq.titulo}" — ${faq.trecho}` : "Nenhuma FAQ correspondente encontrada na Base de Conhecimento.";
            sugestao.confidence = faq ? 0.65 : 0.2;
            break;
        }
        case "sinalizar_reclamacao": {
            const provavel = ctx.intencaoDetectada === "reclamacao"
                || /(péssimo|pessimo|horrível|horrivel|absurdo|processar|reembolso)/i.test(ultimoTexto);
            sugestao.text = provavel
                ? "Possível reclamação detectada — recomenda-se priorizar e revisar o histórico completo antes de responder."
                : "Nenhum sinal claro de reclamação nesta conversa.";
            sugestao.confidence = provavel ? 0.6 : 0.3;
            if (provavel) sugestao.suggestedStatus = "aberta";
            break;
        }
        case "sugerir_encaminhamento": {
            sugestao.text = ctx.intencaoDetectada === "reclamacao"
                ? "Sugestão: encaminhar para um responsável com alçada para tratar reclamações."
                : "Sem necessidade aparente de encaminhamento — a equipe atual pode seguir com o atendimento.";
            sugestao.confidence = 0.4;
            break;
        }
        case "gerar_resumo_pos_atendimento": {
            const total = ctx.mensagens?.length || 0;
            sugestao.text = `Atendimento com ${total} mensagem(ns) analisadas. Intenção principal: ${ROTULOS_INTENCAO[ctx.intencaoDetectada] || "Outro"}.${ctx.pedidos?.length ? ` Pedido(s) relacionado(s): ${ctx.pedidos.map(p => `#${p.numero || p.id}`).join(", ")}.` : ""}`;
            sugestao.confidence = total ? 0.6 : 0.3;
            break;
        }
        default:
            break;
    }

    sugestao.text = String(sugestao.text || "").slice(0, LIMITES_IA_COPILOT.maxCaracteresTextoSugestao);
    return sugestao;
}

// ---------- Validação de qualidade (14 regras) ----------
// Nunca bloqueia a exibição da sugestão — sinaliza em `warnings` pra o
// humano decidir. A única exceção é HTML/script, que é neutralizado
// (nunca renderizado como HTML em lugar nenhum da UI).

const PADROES_PRECO_NAO_CONFIRMADO = /\bR\$\s?\d/;
const PADROES_DESCONTO = /desconto|cupom|promo[çc][aã]o\s+especial/i;
const PADROES_HTML = /<\/?[a-z][\s\S]*>/i;
const PADROES_EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

export function validarQualidadeSugestao(sugestao, contexto = {}) {
    const avisos = [];
    const texto = String(sugestao?.text || "");

    if (PADROES_HTML.test(texto)) avisos.push("Sugestão continha marcação HTML — removida por segurança.");
    if (PADROES_EMOJI.test(texto)) avisos.push("Sugestão continha emoji — o padrão visual do painel não usa emoji.");
    if (PADROES_PRECO_NAO_CONFIRMADO.test(texto) && !(contexto.pedidos || []).some(p => texto.includes(String(p.numero || p.id)))) {
        avisos.push("Sugestão menciona valor em R$ sem uma fonte confirmada no contexto — confira antes de enviar.");
    }
    if (PADROES_DESCONTO.test(texto)) {
        avisos.push("Sugestão menciona desconto/promoção — nunca prometa desconto sem autorização explícita.");
    }
    if (!texto.trim()) {
        avisos.push("Sugestão vazia — nada a revisar.");
    }
    if (sugestao?.confidence != null && (sugestao.confidence < 0.35)) {
        avisos.push("Confiança baixa — trate como rascunho, não como resposta pronta.");
    }

    const textoLimpo = texto.replace(PADROES_HTML, "").replace(PADROES_EMOJI, "");
    return {
        valido: true,
        texto: textoLimpo,
        avisos: Array.from(new Set([...(sugestao?.warnings || []), ...avisos]))
    };
}

export function confidenceParaBucket(confidence) {
    const valor = Number(confidence);
    if (!Number.isFinite(valor)) return "baixa";
    if (valor >= 0.65) return "alta";
    if (valor >= 0.4) return "media";
    return "baixa";
}

export function resumoFontesParaEvento(usedSources = [], maxCaracteres = 300) {
    const texto = (Array.isArray(usedSources) ? usedSources : []).join(", ");
    return texto.length > maxCaracteres ? `${texto.slice(0, maxCaracteres - 1)}…` : texto;
}

// ---------- Controller ----------
// obterContexto() é fornecido por quem instancia o controller (dashboard-
// app.js), e deve devolver os dados já carregados pelo
// atendimentoController/crm360Controller/centralIAController/base de
// conhecimento/templates — nenhuma leitura nova é feita aqui.
export function criarIaCopilotController({
    db,
    context,
    firestore,
    notify = () => {},
    logger = console,
    obterContexto,
    inserirNoComposer = () => {}
}) {
    const state = {
        gerando: false,
        sugestaoAtual: null,
        erro: "",
        historico: []
    };

    function podeUsar() {
        const snapshot = context.getSnapshot();
        return Boolean(snapshot.active) && context.canEdit("ia-copilot");
    }

    async function gerarSugestao(action, opts = {}) {
        if (state.gerando) return null;
        if (!podeUsar()) {
            notify("Você não tem permissão para usar o copiloto de IA.", "error");
            return null;
        }
        if (typeof obterContexto !== "function") {
            throw new Error("ia-copilot: obterContexto não foi fornecido ao controller.");
        }

        state.gerando = true;
        state.erro = "";
        try {
            const dadosBrutos = await obterContexto();
            const contexto = construirContextoIA(dadosBrutos || {});
            const sugestaoBruta = gerarSugestaoMock(contexto, action, opts);
            const qualidade = validarQualidadeSugestao(sugestaoBruta, contexto);

            const sugestao = {
                ...sugestaoBruta,
                text: qualidade.texto,
                warnings: qualidade.avisos,
                provider: CONFIG_PROVEDOR_IA_COPILOT.provider,
                geradaEm: Date.now()
            };
            state.sugestaoAtual = sugestao;
            return sugestao;
        } catch (error) {
            logger.error("[IA Copilot] Erro ao gerar sugestão:", error);
            state.erro = "Não foi possível gerar a sugestão agora. Tente novamente.";
            notify(state.erro, "error");
            return null;
        } finally {
            state.gerando = false;
        }
    }

    async function registrarEvento(tipo, sugestao, { chatId, tenantId, lojaId, clienteId, correlationId } = {}) {
        if (!chatId || !tenantId) return;
        try {
            const snapshot = context.getSnapshot();
            const eventoRef = firestore.doc(firestore.collection(db, "chats", chatId, "eventos"));
            const payload = {
                tenantId,
                lojaId: lojaId || tenantId,
                chatId,
                tipo,
                categoria: "ia",
                autorUid: snapshot.authUid,
                autorTipo: snapshot.isOwner ? "proprietario" : "funcionario",
                origem: "equipe",
                criadoEm: firestore.serverTimestamp(),
                versaoSchema: 1,
                resumo: resumoFontesParaEvento(sugestao?.usedSources),
                dados: {
                    iaAction: sugestao?.action || "",
                    iaProvider: sugestao?.provider || CONFIG_PROVEDOR_IA_COPILOT.provider,
                    iaConfidenceBucket: confidenceParaBucket(sugestao?.confidence)
                }
            };
            if (clienteId) payload.clienteId = clienteId;
            if (correlationId) payload.correlationId = correlationId;
            await firestore.setDoc(eventoRef, payload);
            state.historico.unshift({ tipo, sugestao, quando: Date.now() });
            state.historico = state.historico.slice(0, LIMITES_IA_COPILOT.maxHistoricoSugestoes);
        } catch (error) {
            logger.error("[IA Copilot] Erro ao registrar evento:", error);
        }
    }

    // Só é chamado quando o humano clica "Usar resposta" — nunca a cada
    // geração. Insere no compositor (nunca envia sozinho) e loga o uso.
    async function usarSugestao(sugestao, { modo = "substituir", ...chatRefs } = {}) {
        if (!sugestao) return;
        inserirNoComposer(sugestao.text, modo);
        await registrarEvento("ia_sugestao_usada", sugestao, chatRefs);
    }

    async function descartarSugestao(sugestao, chatRefs = {}) {
        if (!sugestao) return;
        await registrarEvento("ia_sugestao_descartada", sugestao, chatRefs);
        if (state.sugestaoAtual === sugestao) state.sugestaoAtual = null;
    }

    return {
        gerarSugestao,
        usarSugestao,
        descartarSugestao,
        state
    };
}
