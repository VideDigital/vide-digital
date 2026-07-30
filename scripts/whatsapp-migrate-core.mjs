// WhatsApp Oficial — Fase 3 (multiconexão): lógica PURA da migração do
// piloto legado (whatsapp_connections/{ownerUid}, connectionVersion 1)
// para o modelo novo (whatsapp_connections/{connectionId}, connectionVersion
// 2). Nenhum I/O aqui (sem Firestore, sem Secret Manager, sem fetch) — só a
// decisão de QUAIS escritas fazer, dado o estado já lido por fora. Mesmo
// padrão pure-function-first de scripts/whatsapp-preflight-core.mjs e
// functions/src/whatsapp/validators.js.
//
// Contrato de segurança: nenhuma função aqui aceita ou devolve o VALOR de
// um token — só tokenSecretResource, que é uma STRING de CAMINHO do Secret
// Manager (ex.: "projects/x/secrets/vide-whatsapp-token-abc"), nunca o
// segredo em si. A conexão migrada aponta pro MESMO recurso do piloto
// legado — nenhum secret novo é criado, nenhum valor é lido/copiado.
//
// Estratégia de connectionId (documentada, nunca aleatória): hash
// determinístico sha256("migracao:<ownerUid>:<phoneNumberId>"), truncado
// e prefixado com "mig-". Determinístico = rodar a migração de novo pro
// mesmo tenant sempre aponta pro mesmo connectionId, o que é a base da
// idempotência (ver construirPlanoMigracao: se o documento já existe,
// o plano vira "ja_migrada", sem nenhuma escrita nova).
import crypto from "node:crypto";

export const STATUS_MIGRACAO = Object.freeze({
  PRONTA: "pronta",
  JA_MIGRADA: "ja_migrada",
  SEM_LEGADO: "sem_legado",
  INVALIDA: "invalida"
});

export const STATUS_ROLLBACK = Object.freeze({
  PRONTO: "pronto",
  NADA_A_REVERTER: "nada_a_reverter",
  INVALIDO: "invalido"
});

const CONNECTION_VERSION_LEGACY = 1;
const CONNECTION_VERSION_MULTI = 2;

export function gerarConnectionIdMigracao(ownerUid, phoneNumberId) {
  const chave = `migracao:${String(ownerUid || "")}:${String(phoneNumberId || "")}`;
  const hash = crypto.createHash("sha256").update(chave).digest("hex").slice(0, 20);
  return `mig-${hash}`;
}

export function validarOwnerUid(ownerUid) {
  return typeof ownerUid === "string" && /^[A-Za-z0-9_-]{6,128}$/.test(ownerUid);
}

export function validarPhoneNumberId(phoneNumberId) {
  return typeof phoneNumberId === "string" && /^\d{5,32}$/.test(phoneNumberId);
}

// legado/rota/novoExistente já lidos por fora (Admin SDK) — esta função só
// decide, nunca escreve. Devolve sempre { status, motivo, connectionId?,
// acoes: [...], avisos: [...] }. "acoes" é uma lista pequena e explícita de
// operações Firestore que o script chamador deve executar (só se --apply).
export function construirPlanoMigracao({ ownerUid, legado, rota, novoExistente }) {
  const avisos = [];

  if (!validarOwnerUid(ownerUid)) {
    return { status: STATUS_MIGRACAO.INVALIDA, motivo: `ownerUid inválido: "${ownerUid}".`, acoes: [], avisos };
  }
  if (!legado) {
    return {
      status: STATUS_MIGRACAO.SEM_LEGADO,
      motivo: `Nenhum documento legado whatsapp_connections/${ownerUid} encontrado — nada a migrar para este tenant.`,
      acoes: [],
      avisos
    };
  }
  if (legado.ownerUid !== ownerUid) {
    return {
      status: STATUS_MIGRACAO.INVALIDA,
      motivo: "Documento legado tem ownerUid divergente do esperado — abortado por segurança (nunca migrar dado de tenant incerto).",
      acoes: [],
      avisos
    };
  }
  if (legado.connectionVersion !== undefined && legado.connectionVersion !== CONNECTION_VERSION_LEGACY) {
    return {
      status: STATUS_MIGRACAO.INVALIDA,
      motivo: `connectionVersion inesperado no documento legado (${legado.connectionVersion}) — esperado ${CONNECTION_VERSION_LEGACY} ou ausente.`,
      acoes: [],
      avisos
    };
  }

  const phoneNumberId = String(legado.phoneNumberId || "");
  if (!validarPhoneNumberId(phoneNumberId)) {
    return {
      status: STATUS_MIGRACAO.INVALIDA,
      motivo: `phoneNumberId inválido no documento legado: "${phoneNumberId}".`,
      acoes: [],
      avisos
    };
  }
  if (!legado.tokenSecretResource) {
    return {
      status: STATUS_MIGRACAO.INVALIDA,
      motivo: "Documento legado sem tokenSecretResource — nenhum token pode ser inferido/copiado, migração abortada.",
      acoes: [],
      avisos
    };
  }

  const connectionId = gerarConnectionIdMigracao(ownerUid, phoneNumberId);

  if (novoExistente) {
    return {
      status: STATUS_MIGRACAO.JA_MIGRADA,
      motivo: `Conexão nova já existe em whatsapp_connections/${connectionId} — nada a fazer (idempotente).`,
      connectionId,
      acoes: [],
      avisos
    };
  }

  if (rota && rota.ownerUid && rota.ownerUid !== ownerUid) {
    return {
      status: STATUS_MIGRACAO.INVALIDA,
      motivo: `whatsapp_phone_routes/${phoneNumberId} pertence a outro ownerUid — abortado por segurança.`,
      acoes: [],
      avisos
    };
  }
  if (!rota) {
    avisos.push(`whatsapp_phone_routes/${phoneNumberId} não existe ainda — será criada apontando para o connectionId migrado.`);
  } else if (rota.connectionId && rota.connectionId !== connectionId) {
    avisos.push(`whatsapp_phone_routes/${phoneNumberId} já tinha um connectionId diferente (${rota.connectionId}) — será atualizado para ${connectionId}.`);
  }

  const novaConexao = {
    ownerUid,
    connectionId,
    label: String(legado.label || "Piloto (migrado)").slice(0, 120),
    status: legado.status || "connected",
    provider: "meta_cloud_api",
    providerMode: legado.providerMode || "official_cloud",
    onboardingMode: legado.onboardingMode || "piloto_assistido",
    wabaId: String(legado.wabaId || ""),
    phoneNumberId,
    displayPhoneNumber: String(legado.displayPhoneNumber || ""),
    verifiedName: String(legado.verifiedName || ""),
    qualityRating: String(legado.qualityRating || ""),
    isDefault: true,
    connectionVersion: CONNECTION_VERSION_MULTI,
    graphVersion: String(legado.graphVersion || ""),
    tokenSecretResource: legado.tokenSecretResource,
    lastErrorCode: "",
    migratedFromLegacyOwnerUid: ownerUid
  };

  const acoes = [
    { tipo: "criarConexao", colecao: "whatsapp_connections", id: connectionId, dados: novaConexao },
    {
      tipo: "atualizarRota",
      colecao: "whatsapp_phone_routes",
      id: phoneNumberId,
      dados: { ownerUid, connectionId, connectionStatus: novaConexao.status }
    }
  ];

  return { status: STATUS_MIGRACAO.PRONTA, motivo: "Pronta para migrar — documento legado será preservado sem alteração.", connectionId, acoes, avisos };
}

// Reverte só o que a PRÓPRIA migração criou: a conexão nova (identificada
// pelo campo migratedFromLegacyOwnerUid, gravado só por este script) e o
// connectionId da rota, se ainda apontar pra ela. Nunca toca no documento
// legado, nunca apaga o secret (o rollback é só de metadados Firestore).
export function construirPlanoRollback({ ownerUid, connectionId, novo, rota }) {
  if (!novo) {
    return {
      status: STATUS_ROLLBACK.NADA_A_REVERTER,
      motivo: `Conexão whatsapp_connections/${connectionId} não existe — nada a reverter.`,
      acoes: []
    };
  }
  if (novo.ownerUid !== ownerUid) {
    return {
      status: STATUS_ROLLBACK.INVALIDO,
      motivo: "Esta conexão não pertence ao ownerUid informado — abortado por segurança.",
      acoes: []
    };
  }
  if (!novo.migratedFromLegacyOwnerUid) {
    return {
      status: STATUS_ROLLBACK.INVALIDO,
      motivo: "Esta conexão não tem migratedFromLegacyOwnerUid — não foi criada por este script, rollback recusado por segurança.",
      acoes: []
    };
  }

  const acoes = [{ tipo: "removerConexao", colecao: "whatsapp_connections", id: connectionId }];
  if (rota && rota.connectionId === connectionId) {
    acoes.push({ tipo: "limparConnectionIdRota", colecao: "whatsapp_phone_routes", id: novo.phoneNumberId });
  }

  return { status: STATUS_ROLLBACK.PRONTO, motivo: "Pronto para reverter — documento legado e secret nunca são tocados.", acoes };
}

// Formata um relatório em texto simples — nunca imprime o VALOR de um
// token, só nomes de recurso (caminho) do Secret Manager, mesmo padrão já
// usado em scripts/provision-whatsapp-pilot.mjs ("nome do recurso: ...
// nunca o valor").
export function formatarRelatorio(plano, { modo = "migracao", apply = false } = {}) {
  const linhas = [];
  linhas.push(`Modo: ${modo === "rollback" ? "rollback" : "migração"} (${apply ? "APLICANDO" : "dry-run — nada será escrito"})`);
  linhas.push(`Status: ${plano.status}`);
  linhas.push(`Motivo: ${plano.motivo}`);
  if (plano.connectionId) linhas.push(`connectionId: ${plano.connectionId}`);
  for (const aviso of plano.avisos || []) linhas.push(`Aviso: ${aviso}`);
  if ((plano.acoes || []).length === 0) {
    linhas.push("Nenhuma ação a executar.");
  } else {
    linhas.push(`Ações ${apply ? "executadas" : "planejadas"}:`);
    for (const acao of plano.acoes) {
      const resumoDados = acao.dados
        ? Object.keys(acao.dados)
            .map((chave) => (chave === "tokenSecretResource" ? `${chave}=(recurso preservado, valor nunca lido)` : `${chave}=${JSON.stringify(acao.dados[chave])}`))
            .join(", ")
        : "";
      linhas.push(`  - ${acao.tipo}: ${acao.colecao}/${acao.id}${resumoDados ? ` { ${resumoDados} }` : ""}`);
    }
  }
  return linhas.join("\n");
}
