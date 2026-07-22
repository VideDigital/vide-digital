// Concede (ou revoga) a claim videAdmin a uma conta — a única etapa do
// modelo Spark que exige Admin SDK, rodada LOCALMENTE pelo dono da
// plataforma (nunca em CI, nunca no navegador).
//
// Pré-requisito: uma chave JSON de conta de serviço do projeto
// vide-digital-saas (a mesma usada no deploy). NUNCA commitá-la.
//
// Uso:
//   GOOGLE_APPLICATION_CREDENTIALS=/caminho/para/chave.json \
//     node scripts/set-admin-claim.mjs admin@exemplo.com
//
//   # revogar:
//   GOOGLE_APPLICATION_CREDENTIALS=/caminho/para/chave.json \
//     node scripts/set-admin-claim.mjs admin@exemplo.com --remove
//
// Depois de conceder, a pessoa precisa SAIR e ENTRAR de novo (o token
// só carrega a claim nova no próximo login).

import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const email = process.argv[2];
const remove = process.argv.includes("--remove");

if (!email || !email.includes("@")) {
  console.error("Uso: node scripts/set-admin-claim.mjs <email> [--remove]");
  process.exit(1);
}

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error("Defina GOOGLE_APPLICATION_CREDENTIALS apontando para a chave JSON da conta de serviço.");
  console.error("(Para testar no Emulator, defina FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 e GCLOUD_PROJECT=demo-vide-hub.)");
  process.exit(1);
}

if (!getApps().length) {
  initializeApp(
    process.env.FIREBASE_AUTH_EMULATOR_HOST
      ? { projectId: process.env.GCLOUD_PROJECT || "demo-vide-hub" }
      : { credential: applicationDefault() }
  );
}

const auth = getAuth();
const user = await auth.getUserByEmail(email);
await auth.setCustomUserClaims(user.uid, remove ? {} : { videAdmin: true });
await auth.revokeRefreshTokens(user.uid);

console.log(
  remove
    ? `Claim videAdmin REMOVIDA de ${email} (uid ${user.uid}).`
    : `Claim videAdmin CONCEDIDA a ${email} (uid ${user.uid}).`
);
console.log("A pessoa precisa sair e entrar de novo para o token refletir a mudança.");
process.exit(0);
