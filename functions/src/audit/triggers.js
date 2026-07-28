"use strict";

// Auditoria Centralizada V1 — lado com efeito (Cloud Functions v2,
// Firestore triggers com Auth Context). Toda a lógica pura (diff,
// sanitização, tenant, eventId, defaults de risco/ação/resumo) vive em
// ./core.js — este arquivo só resolve o evento do Firestore, monta a
// config por coleção e escreve em auditoria/{eventId}.
//
// Ver docs/AUDITORIA_CENTRALIZADA.md para o desenho completo, incluindo
// por que a lista de exports aqui é maior que a lista "por exemplo" do
// pedido original (landing pages privadas/públicas e configuração/base
// da IA são coleções fisicamente distintas, cada uma com seu próprio
// trigger).

const { onDocumentWrittenWithAuthContext } = require("firebase-functions/v2/firestore");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { logger } = require("firebase-functions");
const core = require("./core");

const REGION = "southamerica-east1";

// Toda a lógica de decisão (resolver tenant, diferenciar ruído, derivar
// ator, sanitizar, classificar) fica aqui, isolada de Firestore/Admin
// SDK — recebe before/after/authType/authId já extraídos do CloudEvent
// e devolve o documento pronto pra gravar, ou null se o evento deve ser
// descartado. Isso é o que permite testar as 13 configurações de
// coleção sem precisar do Functions Emulator (ver
// tests/functions/audit-triggers.test.mjs).
function computarEventoAuditoria(config, { operation, before, after, entityId, authType, authId, rawEventId }) {
  const { module, entityType, tenantField, allowedFields, classify } = config;

  const { ownerUid, tenantMismatch } = core.resolveTenant({
    operation,
    before,
    after,
    tenantField,
    entityId
  });

  // Sem tenant resolvido com segurança, o evento NUNCA é gravado — evita
  // um registro de auditoria acessível ao tenant errado (ou órfão).
  if (!ownerUid) return null;

  const changedFields = core.changedFieldsForOperation(operation, before, after);
  if (core.shouldSkipEvent({ operation, changedFields })) return null;

  const { actorUid, actorType } = core.deriveActor({ authType, authId });

  const beforeSafe = core.sanitizeDocument(before, allowedFields);
  const afterSafe = core.sanitizeDocument(after, allowedFields);

  const classified = classify({ operation, before, after, changedFields, entityId }) || {};
  let action = classified.action || core.defaultAction({ module, operation });
  let risk = classified.risk || core.defaultRiskForOperation(operation);
  let summary = classified.summary || core.defaultSummary({ entityType, entityId, operation });

  // CRITICAL sempre vence qualquer classificação de coleção — troca de
  // tenant num campo que deveria ser imutável é o cenário mais grave que
  // este sistema consegue detectar sozinho.
  if (tenantMismatch) {
    action = `${module}.tenant_alterado_suspeito`;
    risk = "critical";
    summary = `Campo de tenant de ${entityType} ${entityId} mudou inesperadamente numa atualização.`;
  }

  const eventId = core.safeEventId(rawEventId);
  if (!eventId) return null;

  return core.buildAuditEvent({
    eventId,
    ownerUid,
    actorUid,
    actorType,
    module,
    entityType,
    entityId,
    operation,
    action,
    risk,
    summary,
    changedFields,
    before: beforeSafe,
    after: afterSafe,
    source: "firestore-trigger"
  });
}

// Registro config por caminho de documento — só existe pra os testes
// unitários conseguirem chamar computarEventoAuditoria() com a MESMA
// config de cada coleção real, sem precisar do Functions Emulator (ver
// tests/functions/audit-triggers.test.mjs).
const CONFIGS_POR_COLECAO = {};

// createAuditTrigger — factory pedida na missão. Cada coleção auditada
// vira UMA chamada desta função com sua config própria (document,
// module, entityType, tenantField, allowedFields, classify). O handler
// só extrai o CloudEvent e grava — toda decisão vem de
// computarEventoAuditoria() acima.
function createAuditTrigger(config) {
  const { document, module } = config;
  CONFIGS_POR_COLECAO[document] = config;
  return onDocumentWrittenWithAuthContext(
    {
      document,
      region: REGION,
      minInstances: 0,
      maxInstances: 10,
      memory: "256MiB"
    },
    async (event) => {
      try {
        const change = event.data;
        if (!change) return;

        const beforeSnap = change.before;
        const afterSnap = change.after;
        const beforeExists = Boolean(beforeSnap && beforeSnap.exists);
        const afterExists = Boolean(afterSnap && afterSnap.exists);
        if (!beforeExists && !afterExists) return;

        const operation = core.detectOperation(beforeExists, afterExists);
        const before = beforeExists ? beforeSnap.data() : null;
        const after = afterExists ? afterSnap.data() : null;

        const paramValues = Object.values(event.params || {});
        const entityId = String(paramValues[paramValues.length - 1] || "");
        if (!entityId) return;

        const auditEvent = computarEventoAuditoria(config, {
          operation,
          before,
          after,
          entityId,
          authType: event.authType,
          authId: event.authId,
          rawEventId: event.id
        });
        if (!auditEvent) return;

        // set() determinístico — nunca add(). Se o Eventarc reentregar o
        // mesmo event.id (retry), este set() sobrescreve o mesmo
        // documento em vez de duplicar.
        await getFirestore().doc(`auditoria/${auditEvent.eventId}`).set({
          ...auditEvent,
          createdAt: FieldValue.serverTimestamp()
        });
      } catch (error) {
        // Nunca deixa a exceção subir: um bug de classificação não pode
        // virar retry infinito do Eventarc nem derrubar a escrita real
        // que disparou o trigger (essa já aconteceu antes deste código
        // rodar). Só loga pro Cloud Logging.
        logger.error(`[auditoria] Falha ao processar evento de ${module}:`, error);
      }
    }
  );
}

// ===== usuarios/{uid} — conta + configuração privada da loja =====
// Um único trigger cobre os dois aspectos do mesmo documento (nunca dois
// triggers no mesmo caminho, o que geraria dois eventos por escrita).
const auditUsuariosWrite = createAuditTrigger({
  document: "usuarios/{uid}",
  module: "loja",
  entityType: "loja",
  tenantField: "__docId__",
  allowedFields: [
    "status",
    "plano",
    "featuresManuais",
    "nomeLoja",
    "urlLoja",
    "chatAtivo",
    "whatsappCentral",
    "iaNegocioPublicaAtiva"
  ],
  classify({ operation, changedFields }) {
    if (operation === "create") return { action: "loja.criada", risk: "low" };
    if (operation === "delete") return { action: "loja.excluida", risk: "critical" };
    if (changedFields.includes("status")) {
      return { action: "loja.status_alterado", risk: "critical" };
    }
    if (changedFields.includes("plano") || changedFields.includes("featuresManuais")) {
      return { action: "loja.plano_alterado", risk: "critical" };
    }
    return { action: "loja.configuracao_alterada", risk: "medium" };
  }
});

// ===== funcionarios/{uid} =====
const auditFuncionariosWrite = createAuditTrigger({
  document: "funcionarios/{uid}",
  module: "funcionarios",
  entityType: "funcionario",
  tenantField: "donoUID",
  allowedFields: ["status", "cargo", "permissoes"],
  classify({ operation, changedFields, after }) {
    if (operation === "create") return { action: "funcionario.criado", risk: "low" };
    if (operation === "delete") return { action: "funcionario.excluido", risk: "high" };
    if (changedFields.includes("permissoes")) {
      return { action: "funcionario.permissoes_alteradas", risk: "high" };
    }
    if (changedFields.includes("status")) {
      const desativado = after?.status !== "ativo";
      return {
        action: desativado ? "funcionario.desativado" : "funcionario.reativado",
        risk: desativado ? "high" : "medium"
      };
    }
    return { action: "funcionario.atualizado", risk: "low" };
  }
});

// ===== pedidos/{id} =====
const auditPedidosWrite = createAuditTrigger({
  document: "pedidos/{id}",
  module: "pedidos",
  entityType: "pedido",
  tenantField: "criadoPor",
  allowedFields: [
    "status",
    "statusPagamento",
    "tipoRecebimento",
    "subtotal",
    "desconto",
    "frete",
    "total",
    "valor",
    "prazoEntrega"
  ],
  classify({ operation, changedFields }) {
    if (operation === "create") return { action: "pedido.criado", risk: "low" };
    if (operation === "delete") return { action: "pedido.excluido", risk: "high" };
    if (changedFields.includes("statusPagamento")) {
      return { action: "pedido.pagamento_alterado", risk: "high" };
    }
    if (changedFields.some((f) => ["total", "valor", "subtotal", "desconto", "frete"].includes(f))) {
      return { action: "pedido.valores_alterados", risk: "high" };
    }
    if (changedFields.includes("status")) {
      return { action: "pedido.status_alterado", risk: "medium" };
    }
    return { action: "pedido.atualizado", risk: "medium" };
  }
});

// ===== produtos/{id} =====
const auditProdutosWrite = createAuditTrigger({
  document: "produtos/{id}",
  module: "produtos",
  entityType: "produto",
  tenantField: "criadoPor",
  allowedFields: ["nome", "statusProduto", "tipo", "subnicho", "preco", "estoque", "freteGratis"],
  classify({ operation, changedFields }) {
    if (operation === "create") return { action: "produto.criado", risk: "low" };
    if (operation === "delete") return { action: "produto.excluido", risk: "high" };
    if (changedFields.includes("preco")) {
      return { action: "produto.preco_alterado", risk: "medium" };
    }
    if (changedFields.includes("statusProduto")) {
      return { action: "produto.status_alterado", risk: "medium" };
    }
    return { action: "produto.atualizado", risk: "low" };
  }
});

// ===== clientes/{id} (CRM 360) =====
// Só o documento raiz — clientes/{id}/eventos e /observacoes são a
// timeline própria do CRM (docs/CRM_360_CLIENTE.md), preservada como
// está, nunca espelhada aqui.
const auditClientesWrite = createAuditTrigger({
  document: "clientes/{id}",
  module: "crm",
  entityType: "cliente",
  tenantField: "tenantId",
  allowedFields: ["statusRelacionamento", "responsavelUid", "tags", "origem"],
  classify({ operation, changedFields }) {
    if (operation === "create") return { action: "cliente.criado", risk: "low" };
    if (operation === "delete") return { action: "cliente.excluido", risk: "high" };
    if (changedFields.includes("statusRelacionamento")) {
      return { action: "cliente.etapa_alterada", risk: "medium" };
    }
    if (changedFields.includes("responsavelUid")) {
      return { action: "cliente.responsavel_alterado", risk: "medium" };
    }
    return { action: "cliente.atualizado", risk: "low" };
  }
});

// ===== leads/{id} =====
const auditLeadsWrite = createAuditTrigger({
  document: "leads/{id}",
  module: "leads",
  entityType: "lead",
  tenantField: "criadoPor",
  allowedFields: ["statusLead", "status", "prioridadeLead", "funcionarioResponsavel", "etiqueta", "origem", "arquivado", "lixeira"],
  classify({ operation, changedFields }) {
    if (operation === "create") return { action: "lead.criado", risk: "low" };
    if (operation === "delete") return { action: "lead.excluido", risk: "high" };
    if (changedFields.includes("lixeira")) {
      return { action: "lead.movido_para_lixeira", risk: "high" };
    }
    if (changedFields.includes("funcionarioResponsavel")) {
      return { action: "lead.responsavel_alterado", risk: "medium" };
    }
    if (changedFields.includes("statusLead") || changedFields.includes("status")) {
      return { action: "lead.status_alterado", risk: "medium" };
    }
    if (changedFields.includes("arquivado")) {
      return { action: "lead.arquivado", risk: "medium" };
    }
    return { action: "lead.atualizado", risk: "low" };
  }
});

// ===== chats/{chatId} — só o documento pai =====
// mensagens/eventos NUNCA são auditados aqui (alta frequência + conteúdo
// de conversa) — ver docs/HISTORICO_EVENTOS_ATENDIMENTO.md pro histórico
// específico de domínio que já cobre isso.
const auditChatsWrite = createAuditTrigger({
  document: "chats/{chatId}",
  module: "atendimento",
  entityType: "chat",
  tenantField: ["donoUID", "emailDono"],
  allowedFields: ["status", "statusAdmin", "atribuidoPara", "setor", "canal", "arquivado"],
  classify({ operation, changedFields }) {
    if (operation === "create") return { action: "chat.criado", risk: "low" };
    if (operation === "delete") return { action: "chat.excluido", risk: "high" };
    if (changedFields.includes("atribuidoPara")) {
      return { action: "chat.atribuicao_alterada", risk: "medium" };
    }
    if (changedFields.includes("status") || changedFields.includes("statusAdmin")) {
      return { action: "chat.status_alterado", risk: "low" };
    }
    return { action: "chat.atualizado", risk: "low" };
  }
});

// ===== templates/{id} (Templates de Atendimento) =====
const auditTemplatesWrite = createAuditTrigger({
  document: "templates/{id}",
  module: "templates",
  entityType: "template",
  tenantField: "criadoPor",
  allowedFields: ["categoria", "ativo", "favorito", "atalho"],
  classify({ operation, changedFields, after }) {
    if (operation === "create") return { action: "template.criado", risk: "low" };
    if (operation === "delete") return { action: "template.excluido", risk: "medium" };
    if (changedFields.includes("ativo") && after?.ativo === false) {
      return { action: "template.arquivado", risk: "medium" };
    }
    return { action: "template.atualizado", risk: "low" };
  }
});

// ===== vitrines_publicas/{slug} =====
const auditVitrinesWrite = createAuditTrigger({
  document: "vitrines_publicas/{slug}",
  module: "vitrine",
  entityType: "vitrine_publica",
  tenantField: "donoUID",
  allowedFields: ["tracking"],
  classify({ operation, changedFields }) {
    if (operation === "create") return { action: "vitrine.criada", risk: "low" };
    if (operation === "delete") return { action: "vitrine.excluida", risk: "high" };
    if (changedFields.includes("tracking")) {
      return { action: "tracking.pixel_alterado", risk: "high" };
    }
    return { action: "vitrine.atualizada", risk: "medium" };
  }
});

// ===== landing_pages/{id} (privadas) =====
const auditLandingPagesWrite = createAuditTrigger({
  document: "landing_pages/{id}",
  module: "landing-pages",
  entityType: "landing_page",
  tenantField: "donoUID",
  allowedFields: ["publicado", "pagina"],
  classify({ operation, changedFields }) {
    if (operation === "create") return { action: "lp.criada", risk: "low" };
    if (operation === "delete") return { action: "lp.excluida", risk: "medium" };
    if (changedFields.includes("publicado")) {
      return { action: "lp.publicacao_alterada", risk: "medium" };
    }
    return { action: "lp.atualizada", risk: "low" };
  }
});

// ===== landing_pages_publicas/{id} (espelho público) =====
const auditLandingPagesPublicasWrite = createAuditTrigger({
  document: "landing_pages_publicas/{id}",
  module: "landing-pages",
  entityType: "landing_page_publica",
  tenantField: "donoUID",
  allowedFields: [],
  classify({ operation }) {
    if (operation === "create") return { action: "lp.publicada", risk: "medium" };
    if (operation === "delete") return { action: "lp.despublicada", risk: "medium" };
    return { action: "lp.publicacao_atualizada", risk: "low" };
  }
});

// ===== configuracoes_ia/{storeUid} =====
const auditIaConfigWrite = createAuditTrigger({
  document: "configuracoes_ia/{storeUid}",
  module: "ia",
  entityType: "configuracao_ia",
  tenantField: "__docId__",
  allowedFields: ["ativo", "modoRespostaAutomatica", "idioma", "personalidade", "tamanhoResposta", "canais"],
  classify({ operation, changedFields }) {
    if (operation === "create") return { action: "ia.configuracao_criada", risk: "low" };
    if (operation === "delete") return { action: "ia.configuracao_excluida", risk: "high" };
    if (changedFields.includes("canais") || changedFields.includes("ativo")) {
      return { action: "ia.configuracao_alterada", risk: "high" };
    }
    return { action: "ia.configuracao_alterada", risk: "medium" };
  }
});

// ===== base_conhecimento_ia/{id} =====
const auditKnowledgeWrite = createAuditTrigger({
  document: "base_conhecimento_ia/{id}",
  module: "base-conhecimento-ia",
  entityType: "item_conhecimento",
  tenantField: "tenantId",
  allowedFields: ["tipo", "status", "ativo", "categoria", "prioridade", "produtoIds"],
  classify({ operation, changedFields }) {
    if (operation === "create") return { action: "conhecimento.criado", risk: "low" };
    if (operation === "delete") return { action: "conhecimento.excluido", risk: "medium" };
    if (changedFields.includes("status") || changedFields.includes("ativo")) {
      return { action: "conhecimento.status_alterado", risk: "medium" };
    }
    return { action: "conhecimento.atualizado", risk: "low" };
  }
});

// ===== tracking_configs/{ownerUid} =====
const auditTrackingConfigsWrite = createAuditTrigger({
  document: "tracking_configs/{ownerUid}",
  module: "tracking",
  entityType: "tracking_config",
  tenantField: "__docId__",
  allowedFields: ["metaPixel", "ga4", "tiktokPixel", "consentimento"],
  classify({ operation, changedFields }) {
    if (operation === "create") return { action: "tracking.pixel_configurado", risk: "medium" };
    if (operation === "delete") return { action: "tracking.pixel_removido", risk: "high" };
    if (changedFields.some((f) => ["metaPixel", "ga4", "tiktokPixel"].includes(f))) {
      return { action: "tracking.pixel_alterado", risk: "high" };
    }
    if (changedFields.includes("consentimento")) {
      return { action: "tracking.consentimento_alterado", risk: "medium" };
    }
    return { action: "tracking.configuracao_atualizada", risk: "medium" };
  }
});

// ===== tracking_links/{id} =====
const auditTrackingLinksWrite = createAuditTrigger({
  document: "tracking_links/{id}",
  module: "tracking",
  entityType: "tracking_link",
  tenantField: "criadoPor",
  allowedFields: ["nome", "source", "medium", "campaign", "ativo"],
  classify({ operation, changedFields, after }) {
    if (operation === "create") return { action: "tracking.campanha_criada", risk: "low" };
    if (operation === "delete") return { action: "tracking.campanha_excluida", risk: "medium" };
    if (changedFields.includes("ativo") && after?.ativo === false) {
      return { action: "tracking.campanha_arquivada", risk: "medium" };
    }
    return { action: "tracking.campanha_atualizada", risk: "low" };
  }
});

module.exports = {
  REGION,
  createAuditTrigger,
  computarEventoAuditoria,
  CONFIGS_POR_COLECAO,
  auditUsuariosWrite,
  auditFuncionariosWrite,
  auditPedidosWrite,
  auditProdutosWrite,
  auditClientesWrite,
  auditLeadsWrite,
  auditChatsWrite,
  auditTemplatesWrite,
  auditVitrinesWrite,
  auditLandingPagesWrite,
  auditLandingPagesPublicasWrite,
  auditIaConfigWrite,
  auditKnowledgeWrite,
  auditTrackingConfigsWrite,
  auditTrackingLinksWrite
};
