// Onboarding do piloto assistido do WhatsApp Oficial V1 — roda LOCALMENTE
// por um humano com acesso de administrador ao projeto Firebase/GCP.
// NUNCA roda em CI, nunca é chamado pelo dashboard (V1 não tem Embedded
// Signup liberado — ver functions/src/whatsapp/onboarding.js). Testa a
// conexão com a Graph API ANTES de gravar qualquer coisa; se falhar,
// nada é escrito.
//
// Pré-requisitos:
//   - GOOGLE_APPLICATION_CREDENTIALS apontando pra chave JSON da conta
//     de serviço do projeto vide-digital-saas.
//   - GOOGLE_CLOUD_PROJECT=vide-digital-saas (usado pelo Secret Manager
//     pra montar o nome do recurso).
//
// Uso:
//   GOOGLE_APPLICATION_CREDENTIALS=/caminho/chave.json \
//   GOOGLE_CLOUD_PROJECT=vide-digital-saas \
//   WHATSAPP_OWNER_UID=uid-da-loja \
//   WHATSAPP_WABA_ID=1234567890 \
//   WHATSAPP_PHONE_NUMBER_ID=1234567890 \
//   WHATSAPP_DISPLAY_NUMBER="+55 11 90000-0000" \
//   [WHATSAPP_META_APP_ID=...] [WHATSAPP_BUSINESS_PORTFOLIO_ID=...] \
//     node scripts/provision-whatsapp-pilot.mjs
//
// O token de acesso é pedido num prompt oculto (nunca por env var/argv,
// pra não ficar no histórico do shell nem em `ps`) e nunca é impresso,
// logado ou salvo em texto — só o valor vai para o Secret Manager.
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { adicionarVersaoTokenTenant } from "../functions/src/whatsapp/secrets.js";
import { criarMetaClient } from "../functions/src/whatsapp/metaClient.js";
import { WHATSAPP_GRAPH_VERSION } from "../functions/src/whatsapp/constants.js";
import { writeAudit } from "../functions/src/audit/index.js";

function mascarar(valor) {
  const str = String(valor || "");
  if (str.length <= 4) return "••••";
  return `${str.slice(0, 2)}••••${str.slice(-2)}`;
}

function validarFormatoId(nome, valor) {
  if (!/^\d{5,32}$/.test(String(valor || ""))) {
    throw new Error(`${nome} inválido — esperado um ID numérico da Meta. Recebido: "${mascarar(valor)}"`);
  }
}

// Lê o token sem ecoar no terminal — evita que apareça em prints de
// tela/gravação de sessão por engano.
function lerTokenOculto(pergunta) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      reject(new Error("Terminal não interativo — rode este script direto num terminal (não via pipe)."));
      return;
    }
    let valor = "";
    process.stdout.write(pergunta);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (char) => {
      const c = char.toString();
      if (c === "\n" || c === "\r" || c === "\u0004") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(valor);
        return;
      }
      if (c === "\u0003") { process.exit(1); } // Ctrl+C
      if (c === "\u007f") { valor = valor.slice(0, -1); return; } // backspace
      valor += c;
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const ownerUid = String(process.env.WHATSAPP_OWNER_UID || "").trim();
  const wabaId = String(process.env.WHATSAPP_WABA_ID || "").trim();
  const phoneNumberId = String(process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim();
  const displayNumber = String(process.env.WHATSAPP_DISPLAY_NUMBER || "").trim();
  const metaAppId = String(process.env.WHATSAPP_META_APP_ID || "").trim();
  const businessPortfolioId = String(process.env.WHATSAPP_BUSINESS_PORTFOLIO_ID || "").trim();

  if (!ownerUid || !wabaId || !phoneNumberId || !displayNumber) {
    console.error("Defina WHATSAPP_OWNER_UID, WHATSAPP_WABA_ID, WHATSAPP_PHONE_NUMBER_ID e WHATSAPP_DISPLAY_NUMBER.");
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

  try {
    validarFormatoId("WHATSAPP_WABA_ID", wabaId);
    validarFormatoId("WHATSAPP_PHONE_NUMBER_ID", phoneNumberId);
  } catch (erro) {
    console.error(erro.message);
    process.exit(1);
  }

  if (!getApps().length) initializeApp({ credential: applicationDefault() });
  const db = getFirestore();

  const ownerSnap = await db.doc(`usuarios/${ownerUid}`).get();
  if (!ownerSnap.exists) {
    console.error(`Loja ${ownerUid} não encontrada em usuarios/.`);
    process.exit(1);
  }

  const token = await lerTokenOculto("Token de acesso do WhatsApp (system user — não será exibido): ");
  if (!token || token.length < 20) {
    console.error("Token vazio ou muito curto — nada foi gravado.");
    process.exit(1);
  }

  console.log("Testando a conexão com a Graph API antes de gravar qualquer coisa...");
  const metaClient = criarMetaClient();
  let dadosNumero;
  try {
    dadosNumero = await metaClient.validateConnection({ accessToken: token, phoneNumberId });
  } catch (erro) {
    console.error(`Falha ao validar a conexão com a Meta (${erro.code || "erro desconhecido"}). Nada foi gravado.`);
    process.exit(1);
  }
  console.log(`Conexão validada: ${dadosNumero.verified_name || "(sem nome verificado)"} — ${dadosNumero.display_phone_number || displayNumber}`);

  console.log("Gravando o token no Secret Manager...");
  const secretVersionName = await adicionarVersaoTokenTenant(ownerUid, token);
  console.log(`Token gravado (nome do recurso: ${secretVersionName} — nunca o valor).`);

  console.log("Gravando metadados da conexão (nunca o token) em whatsapp_connections...");
  await db.doc(`whatsapp_connections/${ownerUid}`).set({
    ownerUid,
    status: "connected",
    onboardingMode: "piloto_assistido",
    ...(metaAppId ? { metaAppId } : {}),
    ...(businessPortfolioId ? { businessPortfolioId } : {}),
    wabaId,
    phoneNumberId,
    displayPhoneNumber: dadosNumero.display_phone_number || displayNumber,
    verifiedName: dadosNumero.verified_name || "",
    qualityRating: dadosNumero.quality_rating || "",
    tokenSecretResource: secretVersionName.replace(/\/versions\/\d+$/, ""),
    connectionVersion: 1,
    graphVersion: WHATSAPP_GRAPH_VERSION,
    lastValidatedAt: FieldValue.serverTimestamp(),
    lastErrorCode: "",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: "provision-whatsapp-pilot-script"
  }, { merge: true });

  console.log("Registrando o roteamento phone_number_id -> ownerUid...");
  await db.doc(`whatsapp_phone_routes/${phoneNumberId}`).set({ ownerUid, connectionStatus: "connected" });

  await writeAudit({
    ownerUid,
    targetId: ownerUid,
    module: "atendimento",
    action: "whatsapp.conexao_provisionada",
    risk: "high",
    summary: "Conexão do WhatsApp Oficial provisionada via script de piloto assistido.",
    source: "system"
  });

  console.log("");
  console.log("Piloto provisionado com sucesso.");
  console.log(`Rollback, se precisar: WHATSAPP_OWNER_UID=${ownerUid} WHATSAPP_PHONE_NUMBER_ID=${phoneNumberId} node scripts/disconnect-whatsapp-pilot.mjs`);
  process.exit(0);
}

main().catch((erro) => {
  console.error("Erro inesperado:", erro?.message || erro);
  process.exit(1);
});
