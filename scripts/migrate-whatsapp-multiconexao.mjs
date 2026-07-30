// WhatsApp Oficial — Fase 3 (multiconexão): script de migração do piloto
// legado (whatsapp_connections/{ownerUid}) para o modelo novo
// (whatsapp_connections/{connectionId}). Roda LOCALMENTE por um humano com
// acesso de administrador ao projeto Firebase/GCP — NUNCA automático,
// nunca chamado pelo dashboard/Cloud Functions, nunca em CI.
//
// Regras de segurança (ver docs/WHATSAPP_MODULO_MULTICONEXAO.md):
//   - Dry-run por padrão. Só escreve com a flag --apply.
//   - Nunca lê nem imprime o VALOR de um token — só o nome do recurso do
//     Secret Manager (tokenSecretResource), que é apenas um PONTEIRO.
//     A conexão migrada aponta pro MESMO secret físico do piloto legado.
//   - O documento legado NUNCA é apagado nem reescrito por este script.
//   - Idempotente: o connectionId é determinístico (ver
//     whatsapp-migrate-core.mjs); rodar de novo sobre um tenant já migrado
//     não duplica nada.
//   - Rollback disponível via --rollback (some com --apply pra executar de
//     verdade) — reverte só o que a PRÓPRIA migração criou, nunca o legado.
//
// Uso (dry-run, só relatório, nada é escrito):
//   GOOGLE_APPLICATION_CREDENTIALS=/caminho/chave.json \
//   GOOGLE_CLOUD_PROJECT=vide-digital-saas \
//   WHATSAPP_OWNER_UID=uid-da-loja \
//     node scripts/migrate-whatsapp-multiconexao.mjs
//
// Uso (aplicar de verdade):
//   ...mesmas envs... node scripts/migrate-whatsapp-multiconexao.mjs --apply
//
// Uso (rollback — dry-run e depois aplicar):
//   ...mesmas envs... node scripts/migrate-whatsapp-multiconexao.mjs --rollback
//   ...mesmas envs... node scripts/migrate-whatsapp-multiconexao.mjs --rollback --apply
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { construirPlanoMigracao, construirPlanoRollback, formatarRelatorio } from "./whatsapp-migrate-core.mjs";

async function executarAcoesMigracao(db, acoes) {
  for (const acao of acoes) {
    if (acao.tipo === "criarConexao") {
      await db.doc(`${acao.colecao}/${acao.id}`).create({
        ...acao.dados,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        lastValidatedAt: FieldValue.serverTimestamp(),
        updatedBy: "migrate-whatsapp-multiconexao-script"
      });
    } else if (acao.tipo === "atualizarRota") {
      await db.doc(`${acao.colecao}/${acao.id}`).set({ ...acao.dados, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    } else {
      throw new Error(`Tipo de ação desconhecido (migração): ${acao.tipo}`);
    }
  }
}

async function executarAcoesRollback(db, acoes) {
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
  const apply = argv.includes("--apply");
  const rollback = argv.includes("--rollback");
  const ownerUid = String(process.env.WHATSAPP_OWNER_UID || "").trim();

  if (!ownerUid) {
    console.error("Defina WHATSAPP_OWNER_UID.");
    process.exit(1);
  }
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error("Defina GOOGLE_APPLICATION_CREDENTIALS apontando para a chave JSON da conta de serviço.");
    process.exit(1);
  }
  if (!process.env.GOOGLE_CLOUD_PROJECT && !process.env.GCLOUD_PROJECT) {
    console.error("Defina GOOGLE_CLOUD_PROJECT=vide-digital-saas (necessário para resolver o Firestore correto).");
    process.exit(1);
  }

  if (!getApps().length) initializeApp({ credential: applicationDefault() });
  const db = getFirestore();

  if (rollback) {
    const connectionIdArg = String(process.env.WHATSAPP_CONNECTION_ID || "").trim();
    if (!connectionIdArg) {
      console.error("Rollback exige WHATSAPP_CONNECTION_ID (o connectionId gerado pela migração a ser revertida).");
      process.exit(1);
    }
    const novoSnap = await db.doc(`whatsapp_connections/${connectionIdArg}`).get();
    const novo = novoSnap.exists ? { id: novoSnap.id, ...novoSnap.data() } : null;
    const phoneNumberId = novo?.phoneNumberId || "";
    const rotaSnap = phoneNumberId ? await db.doc(`whatsapp_phone_routes/${phoneNumberId}`).get() : null;
    const rota = rotaSnap && rotaSnap.exists ? { id: rotaSnap.id, ...rotaSnap.data() } : null;

    const plano = construirPlanoRollback({ ownerUid, connectionId: connectionIdArg, novo, rota });
    console.log(formatarRelatorio(plano, { modo: "rollback", apply }));

    if (apply && plano.status === "pronto") {
      await executarAcoesRollback(db, plano.acoes);
      console.log("Rollback aplicado.");
    } else if (apply) {
      console.log("Nada aplicado (status não é 'pronto').");
    }
    process.exit(0);
  }

  const legadoSnap = await db.doc(`whatsapp_connections/${ownerUid}`).get();
  const legado = legadoSnap.exists ? legadoSnap.data() : null;

  const phoneNumberId = legado?.phoneNumberId ? String(legado.phoneNumberId) : "";
  const rotaSnap = phoneNumberId ? await db.doc(`whatsapp_phone_routes/${phoneNumberId}`).get() : null;
  const rota = rotaSnap && rotaSnap.exists ? { id: rotaSnap.id, ...rotaSnap.data() } : null;

  // Precisamos saber se a conexão nova já existe ANTES de montar o plano
  // final — mas o connectionId só é conhecido depois de validar o legado.
  // Resolvido em duas etapas: primeiro um plano "seco" (sem novoExistente)
  // só pra obter o connectionId determinístico, depois o plano real.
  const planoParaId = construirPlanoMigracao({ ownerUid, legado, rota, novoExistente: false });
  let novoExistente = false;
  if (planoParaId.connectionId) {
    const novoSnap = await db.doc(`whatsapp_connections/${planoParaId.connectionId}`).get();
    novoExistente = novoSnap.exists;
  }

  const plano = construirPlanoMigracao({ ownerUid, legado, rota, novoExistente });
  console.log(formatarRelatorio(plano, { modo: "migracao", apply }));

  if (apply && plano.status === "pronta") {
    await executarAcoesMigracao(db, plano.acoes);
    console.log("Migração aplicada. Documento legado preservado sem alteração.");
    console.log(`Rollback, se precisar: WHATSAPP_OWNER_UID=${ownerUid} WHATSAPP_CONNECTION_ID=${plano.connectionId} node scripts/migrate-whatsapp-multiconexao.mjs --rollback --apply`);
  } else if (apply) {
    console.log("Nada aplicado (status não é 'pronta').");
  }
  process.exit(0);
}

main().catch((erro) => {
  console.error("Erro inesperado:", erro?.message || erro);
  process.exit(1);
});
