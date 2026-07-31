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

// ---------- Cloud Shell / ADC: flags, modos, gates de confirmação ----------
//
// Achado real (2026-07-31): o script bloqueava incondicionalmente sem
// GOOGLE_APPLICATION_CREDENTIALS, forçando uma chave JSON de service
// account mesmo quando o Admin SDK já aceita Application Default
// Credentials de usuário (gcloud auth application-default login) — o
// caminho recomendado e mais seguro no Cloud Shell. As funções abaixo
// isolam a decisão de "qual modo rodar" e "o projeto está certo?" de
// qualquer I/O, pelo mesmo motivo do resto deste arquivo: testável sem
// Firestore/gcloud, e sem nenhuma chance de vazar segredo numa mensagem.

export const MODOS = Object.freeze({
  DRY_RUN_MIGRACAO: "dry_run_migracao",
  APPLY_MIGRACAO: "apply_migracao",
  DRY_RUN_ROLLBACK: "dry_run_rollback",
  APPLY_ROLLBACK: "apply_rollback",
  BLOQUEADO: "bloqueado"
});

const FLAGS_CONHECIDAS = new Set(["--apply", "--rollback"]);
const CONFIRMACAO_APPLY_ESPERADA = "APPLY_WHATSAPP_MIGRATION";
const CONFIRMACAO_ROLLBACK_ESPERADA = "APPLY_WHATSAPP_ROLLBACK";
const PROJETO_UNICO_SUPORTADO = "vide-digital-saas";

export function interpretarFlags(argv) {
  const lista = Array.isArray(argv) ? argv : [];
  return {
    apply: lista.includes("--apply"),
    rollback: lista.includes("--rollback"),
    flagsDesconhecidas: lista.filter((flag) => !FLAGS_CONHECIDAS.has(flag))
  };
}

export function confirmacaoApplyValida(valor) {
  return String(valor || "") === CONFIRMACAO_APPLY_ESPERADA;
}

export function confirmacaoRollbackValida(valor) {
  return String(valor || "") === CONFIRMACAO_ROLLBACK_ESPERADA;
}

// Nunca escreve nada sozinha — só decide QUAL modo rodar. "apply" sem a
// confirmação certa nunca vira um modo de escrita, sempre BLOQUEADO antes
// de qualquer leitura/escrita real.
export function resolverModo({ apply, rollback, flagsDesconhecidas, confirmApply, confirmRollback } = {}) {
  if ((flagsDesconhecidas || []).length > 0) {
    return { modo: MODOS.BLOQUEADO, motivo: `Flag(s) desconhecida(s): ${flagsDesconhecidas.join(", ")} — abortado por segurança, nenhuma leitura/escrita ocorre.` };
  }

  if (rollback) {
    if (!apply) {
      return { modo: MODOS.DRY_RUN_ROLLBACK, motivo: "ROLLBACK DRY-RUN — apenas relatório, nada será escrito." };
    }
    if (!confirmacaoRollbackValida(confirmRollback)) {
      return {
        modo: MODOS.BLOQUEADO,
        motivo: `--rollback --apply exige WHATSAPP_MIGRATION_CONFIRM_ROLLBACK=${CONFIRMACAO_ROLLBACK_ESPERADA} — confirmação ausente ou incorreta, abortado antes de qualquer escrita.`
      };
    }
    return { modo: MODOS.APPLY_ROLLBACK, motivo: "ROLLBACK APPLY — confirmação validada, escritas serão aplicadas." };
  }

  if (!apply) {
    return { modo: MODOS.DRY_RUN_MIGRACAO, motivo: "DRY-RUN — apenas relatório, nada será escrito." };
  }
  if (!confirmacaoApplyValida(confirmApply)) {
    return {
      modo: MODOS.BLOQUEADO,
      motivo: `--apply exige WHATSAPP_MIGRATION_CONFIRM_APPLY=${CONFIRMACAO_APPLY_ESPERADA} — confirmação ausente ou incorreta, abortado antes de qualquer escrita.`
    };
  }
  return { modo: MODOS.APPLY_MIGRACAO, motivo: "APPLY — confirmação validada, escritas serão aplicadas." };
}

// Único ponto que decide "esta execução pode chamar as funções de escrita?"
// — usado tanto pela migração quanto pelo rollback. Nunca true em modo
// dry-run, mesmo que o plano esteja "pronto"; nunca true se o plano não
// estiver no status pronta/pronto, mesmo com apply autorizado.
export function deveExecutarEscrita(modo, statusPlano) {
  if (modo === MODOS.APPLY_MIGRACAO) return statusPlano === STATUS_MIGRACAO.PRONTA;
  if (modo === MODOS.APPLY_ROLLBACK) return statusPlano === STATUS_ROLLBACK.PRONTO;
  return false;
}

// Confirmação de projeto: OBRIGATÓRIA mesmo em dry-run (nenhuma leitura ao
// Firestore ocorre sem ela). Nunca aceita outro valor — nem "demo-vide-hub"
// (emulador), nem um projeto de staging hipotético. GOOGLE_CLOUD_PROJECT/
// GCLOUD_PROJECT/CLOUDSDK_CORE_PROJECT podem existir no ambiente (o Cloud
// Shell às vezes os define sozinho) — nunca escolhem o projeto, só são
// checados quanto a divergência explícita, como camada extra de segurança.
export function validarProjeto({ projetoExplicito, diagnosticosEnv } = {}) {
  const explicito = String(projetoExplicito || "").trim();
  if (!explicito) {
    return {
      ok: false,
      motivo: `Defina WHATSAPP_MIGRATION_PROJECT=${PROJETO_UNICO_SUPORTADO} antes de rodar — nenhuma leitura ao Firestore ocorre sem essa confirmação explícita, nem em dry-run.`
    };
  }
  if (explicito !== PROJETO_UNICO_SUPORTADO) {
    return {
      ok: false,
      motivo: `WHATSAPP_MIGRATION_PROJECT="${explicito}" diverge do único projeto suportado (${PROJETO_UNICO_SUPORTADO}) — abortado, este script nunca roda contra outro projeto.`
    };
  }

  for (const [nomeVar, valor] of Object.entries(diagnosticosEnv || {})) {
    const v = String(valor || "").trim();
    if (v && v !== PROJETO_UNICO_SUPORTADO) {
      return {
        ok: false,
        motivo: `${nomeVar}="${v}" diverge de ${PROJETO_UNICO_SUPORTADO} — abortado por segurança (variáveis de ambiente do gcloud nunca escolhem o projeto desta migração).`
      };
    }
  }

  return { ok: true, motivo: `Projeto confirmado: ${PROJETO_UNICO_SUPORTADO}.`, projeto: PROJETO_UNICO_SUPORTADO };
}

// Resumo seguro pra log/auditoria antes de qualquer leitura — nunca inclui
// caminho de credencial, token, nem qualquer valor de env var além do
// projeto (que já é público/não-secreto).
export function montarConfiguracaoSegura({ projeto, modo, ownerUidPresente } = {}) {
  return {
    projeto: projeto || "",
    modo: modo || "",
    ownerUidPresente: Boolean(ownerUidPresente),
    credencial: "Application Default Credentials (ADC) — nunca chave de service account neste fluxo."
  };
}

// Nunca inclui o valor de um token, um caminho de arquivo de credencial, ou
// qualquer coisa que pareça um access token — só a instrução segura e
// oficial pra reautenticar via ADC. NUNCA recomenda criar/baixar uma chave
// de service account (isso seria reintroduzir o problema original).
export function formatarInstrucaoErroAutenticacao() {
  return [
    "Falha ao autenticar com Application Default Credentials (ADC) ou ao acessar o Firestore com a credencial atual.",
    "Nunca crie nem baixe uma chave JSON de service account para isso — não é necessário.",
    "No Cloud Shell (ou localmente com gcloud instalado e autenticado), rode:",
    "  gcloud auth application-default login",
    `  gcloud auth application-default set-quota-project ${PROJETO_UNICO_SUPORTADO}`,
    "Depois rode este script de novo."
  ].join("\n");
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
