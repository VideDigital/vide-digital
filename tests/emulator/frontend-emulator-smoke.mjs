import assert from "node:assert/strict";
import { initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  signOut,
  signInWithEmailAndPassword
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore
} from "firebase/firestore";
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable
} from "firebase/functions";

const PROJECT_ID = "demo-vide-hub";

function assertHost(name, expected) {
  assert.equal(process.env[name], expected, `${name} precisa apontar para ${expected}`);
}

assertHost("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8080");
assertHost("FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:9099");

const app = initializeApp({
  apiKey: "demo-api-key",
  authDomain: "demo-vide-hub.firebaseapp.com",
  projectId: PROJECT_ID,
  storageBucket: "demo-vide-hub.appspot.com",
  appId: "demo-app-id"
});

const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, "southamerica-east1");

connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
connectFirestoreEmulator(db, "127.0.0.1", 8080);
connectFunctionsEmulator(functions, "127.0.0.1", 5001);

const credential = await signInWithEmailAndPassword(auth, "owner.pro@local.test", "Local123!pro");
assert.equal(credential.user.uid, "owner-pro");

const ownerSnap = await getDoc(doc(db, "usuarios", "owner-pro"));
assert.equal(ownerSnap.exists(), true);
assert.equal(ownerSnap.data().status, "aprovado");

const createPublicLead = httpsCallable(functions, "createPublicLead");
const leadResult = await createPublicLead({
  storeSlug: "loja-pro-local",
  nome: "Lead Smoke",
  email: "lead.smoke@local.test",
  mensagem: "Smoke local"
});
assert.equal(leadResult.data.ok, true);
assert.ok(leadResult.data.leadId);

const incrementPublicMetric = httpsCallable(functions, "incrementPublicMetric");
const metricResult = await incrementPublicMetric({ storeSlug: "loja-pro-local", event: "store_session" });
assert.equal(metricResult.data.ok, true);

const createPublicChat = httpsCallable(functions, "createPublicChat");
const chatResult = await createPublicChat({ storeSlug: "loja-pro-local", clienteNome: "Cliente Smoke" });
assert.equal(chatResult.data.ok, true);
assert.ok(chatResult.data.chatId);

const sendPublicChatMessage = httpsCallable(functions, "sendPublicChatMessage");
const messageResult = await sendPublicChatMessage({ chatId: chatResult.data.chatId, texto: "Mensagem smoke" });
assert.equal(messageResult.data.ok, true);

// createPublicLead permite 5 chamadas/minuto por IP; a chamada de smoke
// acima já consumiu 1. Mais 4 devem passar (completando o limite) e a 6ª
// chamada no total deve ser recusada com resource-exhausted.
// Nota: rateLimit.js usa janela fixa por minuto do relógio real, então este
// teste tem uma chance pequena (só no exato cruzamento de minuto) de falhar
// por flake — se falhar isoladamente sem nenhuma outra mudança, rode de novo
// antes de investigar como regressão real.
for (let i = 0; i < 4; i += 1) {
  const extra = await createPublicLead({
    storeSlug: "loja-pro-local",
    nome: `Lead Smoke ${i}`,
    email: `lead.smoke.${i}@local.test`
  });
  assert.equal(extra.data.ok, true);
}

let rateLimited = false;
try {
  await createPublicLead({ storeSlug: "loja-pro-local", nome: "Lead Smoke Excedente", email: "lead.excedente@local.test" });
} catch (error) {
  rateLimited = true;
  assert.equal(error.code, "functions/resource-exhausted", `esperava resource-exhausted, recebeu ${error.code}`);
}
assert.equal(rateLimited, true, "createPublicLead deveria recusar a 6ª chamada no mesmo minuto");

console.log("Rate limit de createPublicLead validado (5/min por IP).");

console.log("Frontend emulator smoke concluído.");
await signOut(auth);
process.exit(0);
