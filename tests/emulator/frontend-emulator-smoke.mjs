import assert from "node:assert/strict";
import { initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  signOut,
  signInWithEmailAndPassword
} from "firebase/auth";
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  where
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

// CRM-LEAD-008: duas chamadas concorrentes com o mesmo escopo de dedupe
// (mesmo dedupeKey + mesmo visitante/formulário/produto) devem resultar em
// exatamente 1 lead criado — a versão anterior usava só
// collection("leads").add(...) sem nenhuma verificação, então duas
// chamadas simultâneas (ex.: um retry de rede sem esperar a resposta
// anterior) criavam 2 leads. A dedupe real (createLeadIdempotent, ver
// functions/src/public/index.js) usa uma transação do Firestore, então as
// duas chamadas devem devolver o MESMO leadId.
const dedupeConcurrentPayload = {
  storeSlug: "loja-pro-local",
  nome: "Lead Concorrente",
  email: "lead.concorrente@local.test",
  visitorId: "visitor-dedupe-smoke",
  sessionId: "visitor-dedupe-smoke",
  formularioId: "captura_concorrencia",
  dedupeKey: "dedupe-smoke-key"
};
const [concurrentA, concurrentB] = await Promise.all([
  createPublicLead(dedupeConcurrentPayload),
  createPublicLead(dedupeConcurrentPayload)
]);
assert.equal(concurrentA.data.ok, true);
assert.equal(concurrentB.data.ok, true);
assert.equal(
  concurrentA.data.leadId,
  concurrentB.data.leadId,
  "duas chamadas concorrentes com o mesmo dedupeKey deveriam retornar o mesmo leadId"
);

// firestore.rules só consegue validar a rule de "leads" (baseada em
// criadoPor) numa query de list se o próprio filtro incluir criadoPor —
// sem isso, o motor de regras não tem como provar a condição pra query
// como um todo e recusa com "Property criadoPor is undefined on object.".
const dedupeLeadsSnap = await getDocs(
  query(
    collection(db, "leads"),
    where("criadoPor", "==", "owner-pro"),
    where("email", "==", "lead.concorrente@local.test")
  )
);
assert.equal(
  dedupeLeadsSnap.size,
  1,
  "deveria existir exatamente 1 lead persistido, mesmo com 2 chamadas concorrentes com o mesmo dedupe"
);

console.log("Idempotência de createPublicLead validada (2 chamadas concorrentes -> 1 lead).");

// CRM-LEAD-008 (achado 5 da revisão adversarial): mesmo contato e mesmo
// formulário, mas dedupeKeys (tokens de tentativa) DIFERENTES, precisam
// SEMPRE gerar dois leads — a versão anterior usava contato/sessão como
// parte da identidade de dedupe, então uma segunda submissão legítima do
// mesmo visitante (dados idênticos, intenção nova) era descartada
// silenciosamente e devolvia o leadId da primeira.
const sameContactDifferentTokensBase = {
  storeSlug: "loja-pro-local",
  nome: "Lead Mesmo Contato",
  email: "lead.mesmo.contato@local.test",
  formularioId: "captura_mesmo_form"
};
const attemptOne = await createPublicLead({ ...sameContactDifferentTokensBase, dedupeKey: "attempt-token-1" });
const attemptTwo = await createPublicLead({ ...sameContactDifferentTokensBase, dedupeKey: "attempt-token-2" });
assert.equal(attemptOne.data.ok, true);
assert.equal(attemptTwo.data.ok, true);
assert.notEqual(
  attemptOne.data.leadId,
  attemptTwo.data.leadId,
  "mesmo contato/formulário com tokens de tentativa diferentes deveria criar dois leads, não deduplicar"
);

const sameContactLeadsSnap = await getDocs(
  query(
    collection(db, "leads"),
    where("criadoPor", "==", "owner-pro"),
    where("email", "==", "lead.mesmo.contato@local.test")
  )
);
assert.equal(
  sameContactLeadsSnap.size,
  2,
  "deveriam existir exatamente 2 leads — uma segunda submissão legítima do mesmo contato nunca pode ser descartada como duplicata"
);

console.log("CRM-LEAD-008 (achado 5): mesmo contato + tokens diferentes -> 2 leads, validado.");

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

const createPublicReview = httpsCallable(functions, "createPublicReview");
const reviewResult = await createPublicReview({
  produtoId: "prod-local-1",
  nome: "Cliente Smoke",
  nota: 5,
  comentario: "Muito bom, chegou rápido."
});
assert.equal(reviewResult.data.ok, true);
assert.ok(reviewResult.data.avaliacaoId);

const reviewSnap = await getDoc(doc(db, "avaliacoes", reviewResult.data.avaliacaoId));
assert.equal(reviewSnap.exists(), true);
assert.equal(reviewSnap.data().criadoPor, "owner-pro", "avaliação deveria herdar o dono real do produto, não um valor do cliente");
assert.equal(reviewSnap.data().status, "novo");

let reviewFailedForMissingProduct = false;
try {
  await createPublicReview({ produtoId: "produto-que-nao-existe", nome: "Cliente Smoke", nota: 5 });
} catch (error) {
  reviewFailedForMissingProduct = true;
  assert.equal(error.code, "functions/not-found", `esperava not-found, recebeu ${error.code}`);
}
assert.equal(reviewFailedForMissingProduct, true, "createPublicReview deveria recusar produto inexistente");

console.log("createPublicReview validado (produto real + produto inexistente recusado).");

// createPublicLead permite 5 chamadas/minuto por IP; a chamada de smoke
// inicial (1) + o par concorrente do teste de dedupe (2) + o par de
// tokens diferentes do teste de mesmo contato (2) já consumiram as 5
// chamadas permitidas (cada chamada conta pro rate limit independente do
// resultado do dedupe). A 6ª chamada no total deve ser recusada com
// resource-exhausted.
// Nota: rateLimit.js usa janela fixa por minuto do relógio real, então este
// teste tem uma chance pequena (só no exato cruzamento de minuto) de falhar
// por flake — se falhar isoladamente sem nenhuma outra mudança, rode de novo
// antes de investigar como regressão real.
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
