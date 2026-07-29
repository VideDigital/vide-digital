// Desconecta um piloto do WhatsApp Oficial V1 — marca a conexão como
// revogada e desabilita a versão ativa do token no Secret Manager. NUNCA
// apaga chats, mensagens, contatos ou qualquer histórico de conversa —
// só desliga o acesso à Meta. Roda LOCALMENTE por um administrador,
// nunca em CI, nunca a partir do dashboard.
//
// Uso:
//   GOOGLE_APPLICATION_CREDENTIALS=/caminho/chave.json \
//   GOOGLE_CLOUD_PROJECT=vide-digital-saas \
//   WHATSAPP_OWNER_UID=uid-da-loja \
//   [WHATSAPP_PHONE_NUMBER_ID=...] \
//     node scripts/disconnect-whatsapp-pilot.mjs
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { desabilitarUltimaVersaoTenant } from "../functions/src/whatsapp/secrets.js";
import { writeAudit } from "../functions/src/audit/index.js";

async function main() {
  const ownerUid = String(process.env.WHATSAPP_OWNER_UID || "").trim();
  const phoneNumberIdForcado = String(process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim();

  if (!ownerUid) {
    console.error("Defina WHATSAPP_OWNER_UID.");
    process.exit(1);
  }
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error("Defina GOOGLE_APPLICATION_CREDENTIALS apontando para a chave JSON da conta de serviço.");
    process.exit(1);
  }
  if (!process.env.GOOGLE_CLOUD_PROJECT && !process.env.GCLOUD_PROJECT) {
    console.error("Defina GOOGLE_CLOUD_PROJECT=vide-digital-saas (necessário para o Secret Manager).");
    process.exit(1);
  }

  if (!getApps().length) initializeApp({ credential: applicationDefault() });
  const db = getFirestore();

  const conexaoRef = db.doc(`whatsapp_connections/${ownerUid}`);
  const snap = await conexaoRef.get();
  if (!snap.exists) {
    console.error(`Nenhuma conexão encontrada para ${ownerUid}.`);
    process.exit(1);
  }
  const conexao = snap.data() || {};
  const phoneNumberId = phoneNumberIdForcado || conexao.phoneNumberId || "";

  console.log("Desabilitando a(s) versão(ões) ativa(s) do token no Secret Manager...");
  const desabilitadas = await desabilitarUltimaVersaoTenant(ownerUid);
  console.log(`${desabilitadas} versão(ões) desabilitada(s).`);

  console.log("Marcando a conexão como revogada — nenhum dado de conversa é apagado...");
  await conexaoRef.set({
    status: "revoked",
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: "disconnect-whatsapp-pilot-script"
  }, { merge: true });

  if (phoneNumberId) {
    await db.doc(`whatsapp_phone_routes/${phoneNumberId}`).set({
      ownerUid,
      connectionStatus: "revoked"
    }, { merge: true });
    console.log(`Roteamento de ${phoneNumberId} marcado como revogado.`);
  } else {
    console.log("Aviso: nenhum phoneNumberId conhecido — o roteamento não foi atualizado (webhook_events já para de encontrar ownerUid assim que o token for revogado).");
  }

  await writeAudit({
    ownerUid,
    targetId: ownerUid,
    module: "atendimento",
    action: "whatsapp.conexao_revogada",
    risk: "high",
    summary: "Conexão do WhatsApp Oficial desconectada via script administrativo.",
    source: "system"
  });

  console.log("");
  console.log("Desconectado. Nenhuma conversa, mensagem ou cliente foi apagado.");
  process.exit(0);
}

main().catch((erro) => {
  console.error("Erro inesperado:", erro?.message || erro);
  process.exit(1);
});
