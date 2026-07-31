// Smoke do Functions+Firestore Emulator para a revisão de hardening do
// Embedded Signup (2026-07-31) — só o que a suíte pura (test:functions) não
// consegue cobrir sem Firestore real: idempotência/concorrência/bloqueio de
// QR Code criados em functions/src/whatsapp/qr.js. Mesmo espírito de
// frontend-emulator-smoke.mjs: chama as callables reais direto (sem
// Playwright), contra o Functions Emulator, nunca a Graph API real (o
// backend usa emulatorQr()/emulatorMeta() quando FUNCTIONS_EMULATOR=true).
import assert from "node:assert/strict";
import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { getApps as getAdminApps, initializeApp as initializeAdminApp } from "firebase-admin/app";
import { getFirestore as getAdminFirestore, Timestamp as AdminTimestamp } from "firebase-admin/firestore";
import qrModule from "../../functions/src/whatsapp/qr.js";

const PROJECT_ID = "demo-vide-hub";

// Firestore via Admin SDK (ignora Rules) — usado só pra simular
// deterministicamente um lock em andamento, sem depender de vencer uma
// corrida de rede entre duas chamadas HTTP (inerentemente não-determinístico
// contra o Functions Emulator local).
function adminDb() {
  if (!getAdminApps().length) initializeAdminApp({ projectId: PROJECT_ID });
  return getAdminFirestore();
}

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
getFirestore(app); // só pra registrar o app antes do connect abaixo
connectFirestoreEmulator(getFirestore(app), "127.0.0.1", 8080);
const functions = getFunctions(app, "southamerica-east1");
connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
connectFunctionsEmulator(functions, "127.0.0.1", 5001);

function randomIdempotencyKey(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`.padEnd(20, "0").slice(0, 40);
}

async function call(name, data) {
  const fn = httpsCallable(functions, name);
  return (await fn(data)).data;
}

await signInWithEmailAndPassword(auth, "owner.pro@local.test", "Local123!pro");

// ---------- Conecta um número via Embedded Signup mockado (emulator) ----------
const start = await call("whatsappStartOnboarding", {
  providerMode: "official_cloud",
  mode: "new",
  connectionId: "",
  idempotencyKey: randomIdempotencyKey("onboard")
});
assert.equal(start.ok, true);
assert.equal(start.emulatorMock, true);
const complete = await call("whatsappCompleteOnboarding", {
  onboardingAttemptId: start.onboardingAttemptId,
  state: start.state,
  code: "EMULATOR_META_AUTHORIZATION_CODE",
  sessionInfo: { waba_id: "900000000001", phone_number_id: "900000000002", business_id: "900000000003" }
});
assert.equal(complete.ok, true);
assert.equal(complete.status, "connected");
const connectionId = complete.connectionId;
assert.ok(connectionId);
console.log("whatsapp-hardening: conexão criada via onboarding mockado ->", connectionId);

// ---------- QR: criação idempotente (mesma idempotencyKey nunca chama a Meta duas vezes) ----------
const qrKey = randomIdempotencyKey("qr");
const first = await call("whatsappCreateQrCode", { connectionId, label: "Balcão", message: "Olá, chegou!", idempotencyKey: qrKey });
assert.equal(first.ok, true);
assert.equal(first.reused, undefined);
const second = await call("whatsappCreateQrCode", { connectionId, label: "Balcão", message: "Olá, chegou!", idempotencyKey: qrKey });
assert.equal(second.ok, true);
assert.equal(second.reused, true);
assert.equal(second.qrCode.id, first.qrCode.id, "repetir a mesma idempotencyKey deve reaproveitar o QR já criado, nunca criar outro");
console.log("whatsapp-hardening: criação idempotente de QR OK.");

const qrId = first.qrCode.id;
const qrRef = adminDb().doc(`whatsapp_qr_codes/${qrId}`);

// ---------- QR: documento + lock active são consolidados juntos ----------
const createdQrSnap = await qrRef.get();
assert.equal(createdQrSnap.exists, true);
const lockQuery = await adminDb().collection("whatsapp_qr_locks").where("qrId", "==", qrId).get();
const activeCreationLock = lockQuery.docs.find((doc) => doc.data()?.status === "active");
assert.ok(activeCreationLock, "criação consolidada precisa ter lock active com o mesmo qrId");
assert.equal(activeCreationLock.data().remoteCodePendingCleanup || "", "");
console.log("whatsapp-hardening: QR + lock active consolidados atomicamente OK.");

// ---------- QR: versão esperada é verificada dentro da aquisição ----------
const versionBeforeRace = createdQrSnap.data().updatedAt.toMillis();
await qrRef.set({ updatedAt: AdminTimestamp.fromMillis(versionBeforeRace + 1) }, { merge: true });
await assert.rejects(
  qrModule.__test.acquireQrDocLock(adminDb(), qrRef, {
    ownerUid: auth.currentUser.uid,
    expectedUpdatedAtMs: versionBeforeRace,
    operationType: "update"
  }),
  (error) => error?.code === "failed-precondition"
);
assert.equal((await qrRef.get()).data().operationLock, undefined, "versão antiga não pode adquirir lock");
console.log("whatsapp-hardening: expectedUpdatedAtMs validado atomicamente na aquisição OK.");

// ---------- QR: update com expectedUpdatedAtMs desatualizado é rejeitado ----------
let staleRejected = false;
try {
  await call("whatsappUpdateQrCode", { qrId, label: "Balcão renomeado", message: "Nova mensagem", expectedUpdatedAtMs: 1 });
} catch (error) {
  staleRejected = true;
  assert.equal(error.code, "functions/failed-precondition", `esperava failed-precondition, recebeu ${error.code}`);
}
assert.equal(staleRejected, true, "update com expectedUpdatedAtMs desatualizado deveria ser rejeitado");
console.log("whatsapp-hardening: rejeição de versão otimista desatualizada OK.");

// ---------- QR: operação em andamento (lock não expirado) rejeita update concorrente ----------
// Uma corrida real de rede entre duas chamadas HTTP contra o Functions
// Emulator local é inerentemente não-determinística (timing de I/O), então
// simulamos o lock diretamente via Admin SDK (mesmo estado que
// acquireQrDocLock() gravaria) em vez de tentar vencer uma corrida.
await qrRef.set({ operationLock: { token: "lock-simulado-teste", expiresAt: AdminTimestamp.fromMillis(Date.now() + 60000) } }, { merge: true });
let concurrentRejected = false;
try {
  await call("whatsappUpdateQrCode", { qrId, label: "Não deveria passar", message: "Bloqueado pelo lock" });
} catch (error) {
  concurrentRejected = true;
  assert.equal(error.code, "functions/aborted", `esperava aborted, recebeu ${error.code}`);
}
assert.equal(concurrentRejected, true, "update com lock ativo em andamento deveria ser rejeitado, nunca aceito silenciosamente");
console.log("whatsapp-hardening: lock de operação em andamento rejeita update concorrente OK.");

// ---------- QR: operação antiga nunca finaliza depois de perder o token ----------
await qrRef.set({ operationLock: { token: "", expiresAt: AdminTimestamp.fromMillis(0) } }, { merge: true });
const acquiredForLostLock = await qrModule.__test.acquireQrDocLock(adminDb(), qrRef, {
  ownerUid: auth.currentUser.uid,
  expectedUpdatedAtMs: (await qrRef.get()).data().updatedAt.toMillis(),
  operationType: "update"
});
await qrRef.set({
  operationLock: {
    token: "novo-lock-concorrente",
    operationType: "update",
    startedAt: AdminTimestamp.now(),
    expiresAt: AdminTimestamp.fromMillis(Date.now() + 60000),
    baseUpdatedAtMs: acquiredForLostLock.baseUpdatedAtMs
  }
}, { merge: true });
const labelBeforeLostFinish = (await qrRef.get()).data().label;
const lostUpdateFinish = await qrModule.__test.finalizeQrUpdate(adminDb(), qrRef, {
  ownerUid: auth.currentUser.uid,
  token: acquiredForLostLock.token,
  patch: { label: "Operação antiga não pode vencer" }
});
assert.deepEqual(lostUpdateFinish, { applied: false, reason: "lock_lost" });
assert.equal((await qrRef.get()).data().label, labelBeforeLostFinish, "operação antiga não pode alterar o estado local");
const oldRelease = await qrModule.__test.releaseQrDocLock(adminDb(), qrRef, acquiredForLostLock.token);
assert.deepEqual(oldRelease, { applied: false, reason: "lock_lost" });
console.log("whatsapp-hardening: operação que perdeu o token não finaliza nem remove lock novo OK.");

// ---------- QR: lock expirado é reclamável (não trava o recurso pra sempre) ----------
await qrRef.set({ operationLock: { token: "lock-expirado-teste", expiresAt: AdminTimestamp.fromMillis(Date.now() - 1000) } }, { merge: true });
const afterExpiredLock = await call("whatsappUpdateQrCode", { qrId, label: "Depois do lock expirar", message: "Deve funcionar normalmente" });
assert.equal(afterExpiredLock.ok, true, "um lock expirado nunca deveria travar o recurso permanentemente");
console.log("whatsapp-hardening: lock expirado é reclamado normalmente (não trava o recurso pra sempre) OK.");

// ---------- QR: finalização de delete também exige o mesmo token ----------
const deleteLock = await qrModule.__test.acquireQrDocLock(adminDb(), qrRef, {
  ownerUid: auth.currentUser.uid,
  operationType: "delete"
});
await qrRef.set({
  operationLock: {
    token: "delete-lock-substituto",
    operationType: "delete",
    startedAt: AdminTimestamp.now(),
    expiresAt: AdminTimestamp.fromMillis(Date.now() + 60000)
  }
}, { merge: true });
const lostDeleteFinish = await qrModule.__test.finalizeQrDelete(adminDb(), qrRef, {
  ownerUid: auth.currentUser.uid,
  token: deleteLock.token
});
assert.deepEqual(lostDeleteFinish, { applied: false, reason: "lock_lost" });
assert.equal((await qrRef.get()).exists, true, "delete sem o token atual nunca exclui o documento");
console.log("whatsapp-hardening: delete que perdeu o lock não remove o documento local OK.");

// ---------- QR: outro tenant não descobre nem altera o recurso ----------
await qrRef.set({ operationLock: { token: "lock-expirado-tenant", expiresAt: AdminTimestamp.fromMillis(Date.now() - 1000) } }, { merge: true });
await signOut(auth);
await signInWithEmailAndPassword(auth, "owner.basic@local.test", "Local123!basic");
let crossTenantRejected = false;
try {
  await call("whatsappUpdateQrCode", { qrId, label: "Outro tenant", message: "Não deve alterar" });
} catch (error) {
  crossTenantRejected = true;
  assert.ok(["functions/not-found", "functions/permission-denied"].includes(error.code), `tenant diferente recebeu ${error.code}`);
}
assert.equal(crossTenantRejected, true);
await signOut(auth);
await signInWithEmailAndPassword(auth, "owner.pro@local.test", "Local123!pro");
console.log("whatsapp-hardening: isolamento cross-tenant do QR OK.");

// ---------- QR: conexão desconectada rejeita criação antes da Meta ----------
const connectionRef = adminDb().doc(`whatsapp_connections/${connectionId}`);
await connectionRef.set({ status: "disconnected" }, { merge: true });
let disconnectedRejected = false;
try {
  await call("whatsappCreateQrCode", {
    connectionId,
    label: "Conexão inativa",
    message: "Não deve criar",
    idempotencyKey: randomIdempotencyKey("disconnected")
  });
} catch (error) {
  disconnectedRejected = true;
  assert.equal(error.code, "functions/failed-precondition");
}
assert.equal(disconnectedRejected, true);
await connectionRef.set({ status: "connected" }, { merge: true });
console.log("whatsapp-hardening: conexão desconectada rejeitada antes da criação QR OK.");

// ---------- QR: delete é idempotente (segunda exclusão do mesmo QR não falha) ----------
const del1 = await call("whatsappDeleteQrCode", { qrId });
assert.equal(del1.ok, true);
assert.equal(del1.alreadyDeleted, undefined);
const del2 = await call("whatsappDeleteQrCode", { qrId });
assert.equal(del2.ok, true);
assert.equal(del2.alreadyDeleted, true, "excluir um QR já excluído deveria ser idempotente, nunca lançar erro");
console.log("whatsapp-hardening: delete idempotente OK.");

// ---------- QR: update depois de delete falha com not-found, nunca recria silenciosamente ----------
let updateAfterDeleteRejected = false;
try {
  await call("whatsappUpdateQrCode", { qrId, label: "Fantasma", message: "Não deveria existir" });
} catch (error) {
  updateAfterDeleteRejected = true;
  assert.equal(error.code, "functions/not-found", `esperava not-found, recebeu ${error.code}`);
}
assert.equal(updateAfterDeleteRejected, true, "update de um QR já excluído deveria falhar com not-found");
console.log("whatsapp-hardening: update depois de delete rejeitado OK.");

console.log("whatsapp-hardening.smoke concluído.");
await signOut(auth);
process.exit(0);
