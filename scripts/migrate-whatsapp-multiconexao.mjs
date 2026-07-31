// WhatsApp Oficial — Fase 3 (multiconexão): script de migração do piloto
// legado (whatsapp_connections/{ownerUid}) para o modelo novo
// (whatsapp_connections/{connectionId}). Roda LOCALMENTE (ou no Cloud
// Shell) por um humano com acesso de administrador ao projeto Firebase/GCP
// — NUNCA automático, nunca chamado pelo dashboard/Cloud Functions, nunca
// em CI.
//
// Regras de segurança (ver docs/WHATSAPP_MODULO_MULTICONEXAO.md):
//   - Dry-run por padrão. Só escreve com --apply E a confirmação certa
//     (WHATSAPP_MIGRATION_CONFIRM_APPLY=APPLY_WHATSAPP_MIGRATION).
//   - Rollback real exige --rollback --apply E
//     WHATSAPP_MIGRATION_CONFIRM_ROLLBACK=APPLY_WHATSAPP_ROLLBACK.
//   - Nunca lê nem imprime o VALOR de um token — só o nome do recurso do
//     Secret Manager (tokenSecretResource), que é apenas um PONTEIRO.
//     A conexão migrada aponta pro MESMO secret físico do piloto legado.
//   - O documento legado NUNCA é apagado nem reescrito por este script.
//   - Idempotente: o connectionId é determinístico (ver
//     whatsapp-migrate-core.mjs); rodar de novo sobre um tenant já migrado
//     não duplica nada.
//   - Projeto sempre fixo (vide-digital-saas) — WHATSAPP_MIGRATION_PROJECT
//     precisa confirmar isso explicitamente antes de QUALQUER leitura,
//     inclusive dry-run.
//   - Autenticação via Application Default Credentials (ADC) — nunca exige
//     chave JSON de service account. No Cloud Shell:
//       gcloud auth application-default login
//       gcloud auth application-default set-quota-project vide-digital-saas
//     GOOGLE_APPLICATION_CREDENTIALS continua funcionando normalmente se já
//     estiver definida (ex.: numa máquina com uma chave própria), mas nunca
//     é exigida nem recomendada.
//
// Uso (dry-run, só relatório, nada é escrito):
//   export WHATSAPP_MIGRATION_PROJECT=vide-digital-saas
//   export WHATSAPP_OWNER_UID=uid-da-loja
//   node scripts/migrate-whatsapp-multiconexao.mjs
//
// Uso (aplicar de verdade):
//   ...mesmas envs... WHATSAPP_MIGRATION_CONFIRM_APPLY=APPLY_WHATSAPP_MIGRATION \
//     node scripts/migrate-whatsapp-multiconexao.mjs --apply
//
// Uso (rollback — dry-run e depois aplicar):
//   ...mesmas envs... node scripts/migrate-whatsapp-multiconexao.mjs --rollback
//   ...mesmas envs... WHATSAPP_MIGRATION_CONFIRM_ROLLBACK=APPLY_WHATSAPP_ROLLBACK \
//     node scripts/migrate-whatsapp-multiconexao.mjs --rollback --apply
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import {
  construirPlanoMigracao,
  construirPlanoRollback,
  formatarRelatorio,
  interpretarFlags,
  resolverModo,
  deveExecutarEscrita,
  validarProjeto,
  montarConfiguracaoSegura,
  formatarInstrucaoErroAutenticacao,
  validarOwnerUid,
  MODOS
} from "./whatsapp-migrate-core.mjs";
// Versão atual da Graph API, centralizada em functions/src/whatsapp/
// constants.js — a conexão V2 usa SEMPRE este valor, nunca
// legado.graphVersion (que é só histórico do piloto). Import direto de um
// módulo CJS a partir de ESM (mesmo padrão já usado por
// scripts/provision-whatsapp-pilot.mjs e
// scripts/whatsapp-production-preflight.mjs) — funciona porque
// functions/package.json não declara "type": "module", então o Node
// resolve constants.js como CommonJS e expõe seus exports nomeados via
// interoperabilidade padrão.
import { WHATSAPP_GRAPH_VERSION } from "../functions/src/whatsapp/constants.js";

const PRODUCTION_PROJECT_ID = "vide-digital-saas";
const ALREADY_EXISTS_CODE = 6; // grpc status ALREADY_EXISTS

export async function executarAcoesMigracao(db, acoes) {
  for (const acao of acoes) {
    if (acao.tipo === "criarConexao") {
      try {
        await db.doc(`${acao.colecao}/${acao.id}`).create({
          ...acao.dados,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          lastValidatedAt: FieldValue.serverTimestamp(),
          updatedBy: "migrate-whatsapp-multiconexao-script"
        });
      } catch (erro) {
        // connectionId é determinístico — duas execuções concorrentes
        // (ou uma reexecução exatamente na janela entre a checagem de
        // "já existe?" e esta escrita) podem colidir aqui. .create()
        // nunca sobrescreve silenciosamente: se o documento já existe,
        // a migração já foi aplicada por outra execução — trata como
        // sucesso idempotente, nunca como erro fatal.
        if (erro?.code === ALREADY_EXISTS_CODE) {
          console.log(`Conexão ${acao.id} já existia (criada por outra execução concorrente) — seguindo sem duplicar.`);
          continue;
        }
        throw erro;
      }
    } else if (acao.tipo === "atualizarRota") {
      await db.doc(`${acao.colecao}/${acao.id}`).set({ ...acao.dados, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    } else {
      throw new Error(`Tipo de ação desconhecido (migração): ${acao.tipo}`);
    }
  }
}

export async function executarAcoesRollback(db, acoes) {
  for (const acao of acoes) {
    if (acao.tipo === "removerConexao") {
      await db.doc(`${acao.colecao}/${acao.id}`).delete();
    } else if (acao.tipo === "limparConnectionIdRota") {
      await db.doc(`${acao.colecao}/${acao.id}`).set({ connectionId: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    } else {
      throw new Error(`Tipo de ação desconhecido (rollback): ${acao.tipo}`);
    }
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const { apply, rollback, flagsDesconhecidas } = interpretarFlags(argv);

  const resolucaoModo = resolverModo({
    apply,
    rollback,
    flagsDesconhecidas,
    confirmApply: process.env.WHATSAPP_MIGRATION_CONFIRM_APPLY,
    confirmRollback: process.env.WHATSAPP_MIGRATION_CONFIRM_ROLLBACK
  });

  if (resolucaoModo.modo === MODOS.BLOQUEADO) {
    console.error(resolucaoModo.motivo);
    process.exit(1);
  }

  const ownerUid = String(process.env.WHATSAPP_OWNER_UID || "").trim();
  if (!ownerUid) {
    console.error("Defina WHATSAPP_OWNER_UID.");
    process.exit(1);
  }
  if (!validarOwnerUid(ownerUid)) {
    console.error(`WHATSAPP_OWNER_UID em formato inválido: "${ownerUid}".`);
    process.exit(1);
  }

  // Confirmação de projeto OBRIGATÓRIA antes de qualquer leitura, mesmo em
  // dry-run — nunca configurável para outro projeto (ver validarProjeto).
  const validacaoProjeto = validarProjeto({
    projetoExplicito: process.env.WHATSAPP_MIGRATION_PROJECT,
    diagnosticosEnv: {
      GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
      GCLOUD_PROJECT: process.env.GCLOUD_PROJECT,
      CLOUDSDK_CORE_PROJECT: process.env.CLOUDSDK_CORE_PROJECT
    }
  });
  if (!validacaoProjeto.ok) {
    console.error(validacaoProjeto.motivo);
    process.exit(1);
  }

  console.log(JSON.stringify(montarConfiguracaoSegura({ projeto: validacaoProjeto.projeto, modo: resolucaoModo.modo, ownerUidPresente: true })));
  console.log(resolucaoModo.motivo);

  // GOOGLE_APPLICATION_CREDENTIALS continua funcionando se já estiver
  // definida (applicationDefault() a usa naturalmente) — nunca exigida
  // nem checada explicitamente aqui. Projeto sempre explícito e fixo,
  // nunca inferido só da credencial.
  if (!getApps().length) {
    initializeApp({ credential: applicationDefault(), projectId: PRODUCTION_PROJECT_ID });
  }
  const db = getFirestore();

  const apply_ = resolucaoModo.modo === MODOS.APPLY_MIGRACAO || resolucaoModo.modo === MODOS.APPLY_ROLLBACK;

  if (rollback) {
    const connectionIdArg = String(process.env.WHATSAPP_CONNECTION_ID || "").trim();
    if (!connectionIdArg) {
      console.error("Rollback exige WHATSAPP_CONNECTION_ID (o connectionId gerado pela migração a ser revertida).");
      process.exit(1);
    }

    let novoSnap;
    try {
      novoSnap = await db.doc(`whatsapp_connections/${connectionIdArg}`).get();
    } catch {
      console.error(formatarInstrucaoErroAutenticacao());
      process.exit(1);
    }
    const novo = novoSnap.exists ? { id: novoSnap.id, ...novoSnap.data() } : null;
    const phoneNumberId = novo?.phoneNumberId || "";
    const rotaSnap = phoneNumberId ? await db.doc(`whatsapp_phone_routes/${phoneNumberId}`).get() : null;
    const rota = rotaSnap && rotaSnap.exists ? { id: rotaSnap.id, ...rotaSnap.data() } : null;

    const plano = construirPlanoRollback({ ownerUid, connectionId: connectionIdArg, novo, rota });
    console.log(formatarRelatorio(plano, { modo: "rollback", apply: apply_ }));

    if (deveExecutarEscrita(resolucaoModo.modo, plano.status)) {
      await executarAcoesRollback(db, plano.acoes);
      console.log("Rollback aplicado.");
    } else if (apply_) {
      console.log("Nada aplicado (status não é 'pronto').");
    }
    process.exit(0);
  }

  let legadoSnap;
  try {
    legadoSnap = await db.doc(`whatsapp_connections/${ownerUid}`).get();
  } catch {
    console.error(formatarInstrucaoErroAutenticacao());
    process.exit(1);
  }
  const legado = legadoSnap.exists ? legadoSnap.data() : null;

  const phoneNumberId = legado?.phoneNumberId ? String(legado.phoneNumberId) : "";
  const rotaSnap = phoneNumberId ? await db.doc(`whatsapp_phone_routes/${phoneNumberId}`).get() : null;
  const rota = rotaSnap && rotaSnap.exists ? { id: rotaSnap.id, ...rotaSnap.data() } : null;

  // Precisamos saber se a conexão nova já existe ANTES de montar o plano
  // final — mas o connectionId só é conhecido depois de validar o legado.
  // Resolvido em duas etapas: primeiro um plano "seco" (sem novoExistente)
  // só pra obter o connectionId determinístico, depois o plano real.
  const planoParaId = construirPlanoMigracao({ ownerUid, legado, rota, novoExistente: false, graphVersionAtual: WHATSAPP_GRAPH_VERSION });
  let novoExistente = false;
  if (planoParaId.connectionId) {
    const novoSnap = await db.doc(`whatsapp_connections/${planoParaId.connectionId}`).get();
    novoExistente = novoSnap.exists;
  }

  const plano = construirPlanoMigracao({ ownerUid, legado, rota, novoExistente, graphVersionAtual: WHATSAPP_GRAPH_VERSION });
  console.log(formatarRelatorio(plano, { modo: "migracao", apply: apply_ }));

  if (deveExecutarEscrita(resolucaoModo.modo, plano.status)) {
    await executarAcoesMigracao(db, plano.acoes);
    console.log("Migração aplicada. Documento legado preservado sem alteração.");
    console.log(`Rollback, se precisar: WHATSAPP_OWNER_UID=${ownerUid} WHATSAPP_CONNECTION_ID=${plano.connectionId} WHATSAPP_MIGRATION_PROJECT=${PRODUCTION_PROJECT_ID} WHATSAPP_MIGRATION_CONFIRM_ROLLBACK=APPLY_WHATSAPP_ROLLBACK node scripts/migrate-whatsapp-multiconexao.mjs --rollback --apply`);
  } else if (apply_) {
    console.log("Nada aplicado (status não é 'pronta').");
  }
  process.exit(0);
}

// Só roda main() quando o arquivo é executado diretamente (node
// scripts/migrate-whatsapp-multiconexao.mjs) — nunca quando importado
// (ex.: pelos testes, que importam executarAcoesMigracao/executarAcoesRollback
// com um Firestore fake, sem nunca disparar uma conexão real).
const executadoDiretamente = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (executadoDiretamente) {
  main().catch((erro) => {
    console.error("Erro inesperado:", erro?.message || erro);
    process.exit(1);
  });
}
