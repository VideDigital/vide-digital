import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const PROJECT_ID = "demo-vide-hub";
const USE_LOCAL_DEFAULTS = process.argv.includes("--local-defaults");

if (USE_LOCAL_DEFAULTS) {
  process.env.GCLOUD_PROJECT = PROJECT_ID;
  process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT_ID });
  process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";
}

function assertLocalEmulatorHost(name, expectedPort) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} precisa estar definido. Execute via npm run seed:emulator ou configure o Emulator manualmente.`);
  }
  const normalized = value.replace(/^https?:\/\//, "");
  const [host, port] = normalized.split(":");
  const safeHost = host === "127.0.0.1" || host === "localhost" || host === "::1";
  if (!safeHost || port !== expectedPort) {
    throw new Error(`${name} deve apontar para localhost:${expectedPort}. Valor recebido: ${value}`);
  }
}

assertLocalEmulatorHost("FIRESTORE_EMULATOR_HOST", "8080");
assertLocalEmulatorHost("FIREBASE_AUTH_EMULATOR_HOST", "9099");

if ((process.env.GCLOUD_PROJECT || PROJECT_ID) !== PROJECT_ID) {
  throw new Error("Seed recusado: projectId precisa ser demo-vide-hub.");
}

if (!getApps().length) {
  initializeApp({ projectId: PROJECT_ID });
}

const auth = getAuth();
const db = getFirestore();

const users = [
  { uid: "owner-pending", email: "owner.pending@local.test", password: "Local123!pending", displayName: "Owner Pendente" },
  { uid: "owner-basic", email: "owner.basic@local.test", password: "Local123!basic", displayName: "Owner Básico" },
  { uid: "owner-pro", email: "owner.pro@local.test", password: "Local123!pro", displayName: "Owner Pro" },
  { uid: "employee-read", email: "employee.read@local.test", password: "Local123!read", displayName: "Funcionário Leitura" },
  { uid: "employee-edit", email: "employee.edit@local.test", password: "Local123!edit", displayName: "Funcionário Editor" },
  { uid: "employee-inactive", email: "employee.inactive@local.test", password: "Local123!inactive", displayName: "Funcionário Inativo" },
  { uid: "admin-claim", email: "admin.claim@local.test", password: "Local123!admin", displayName: "Admin Claim" },
  { uid: "admin-doc-only", email: "admin.doc.only@local.test", password: "Local123!doc", displayName: "Admin Sem Claim" }
];

async function upsertUser(user) {
  try {
    await auth.getUser(user.uid);
    await auth.updateUser(user.uid, {
      email: user.email,
      password: user.password,
      displayName: user.displayName,
      disabled: false
    });
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
    await auth.createUser(user);
  }
}

async function setDoc(path, data) {
  await db.doc(path).set({ ...data, seedAtualizadoEm: FieldValue.serverTimestamp() }, { merge: true });
}

for (const user of users) {
  await upsertUser(user);
}

await auth.setCustomUserClaims("admin-claim", { videAdmin: true });
await auth.setCustomUserClaims("admin-doc-only", {});

await setDoc("usuarios/owner-pending", {
  email: "owner.pending@local.test",
  nomeLoja: "Loja Pendente Local",
  urlLoja: "loja-pendente-local",
  status: "pendente",
  plano: "basico"
});

await setDoc("usuarios/owner-basic", {
  email: "owner.basic@local.test",
  nomeLoja: "Loja Básica Local",
  urlLoja: "loja-basica-local",
  status: "aprovado",
  plano: "basico"
});

await setDoc("usuarios/owner-pro", {
  email: "owner.pro@local.test",
  nomeLoja: "Loja Pro Local",
  urlLoja: "loja-pro-local",
  status: "aprovado",
  plano: "pro",
  whatsappCentral: "5511999999999",
  chatAtivo: true
});

await setDoc("funcionarios/employee-read", {
  donoUID: "owner-pro",
  email: "employee.read@local.test",
  nome: "Funcionário Leitura",
  status: "ativo",
  cargo: "Atendimento",
  permissoes: { ver: ["dashboard", "produtos", "leads"], editar: [] }
});

await setDoc("funcionarios/employee-edit", {
  donoUID: "owner-pro",
  email: "employee.edit@local.test",
  nome: "Funcionário Editor",
  status: "ativo",
  cargo: "Operação",
  permissoes: { ver: ["dashboard", "produtos", "leads", "funcionarios"], editar: ["produtos", "leads", "funcionarios"] }
});

await setDoc("funcionarios/employee-inactive", {
  donoUID: "owner-pro",
  email: "employee.inactive@local.test",
  nome: "Funcionário Inativo",
  status: "inativo",
  cargo: "Antigo",
  permissoes: { ver: ["dashboard", "produtos"], editar: ["produtos"] }
});

await setDoc("equipe_admin/admin-claim_local_test", {
  uid: "admin-claim",
  email: "admin.claim@local.test",
  nome: "Admin Claim",
  permissoes: ["usuarios", "planos"],
  ativo: true
});

await setDoc("equipe_admin/admin-doc-only_local_test", {
  uid: "admin-doc-only",
  email: "admin.doc.only@local.test",
  nome: "Admin Sem Claim",
  permissoes: ["usuarios"],
  ativo: true
});

await setDoc("vitrines_publicas/loja-pro-local", {
  donoUID: "owner-pro",
  emailDono: "owner-pro",
  nomeLoja: "Loja Pro Local",
  tituloHero: "Vitrine Local",
  subtituloHero: "Dados seguros do Emulator",
  chatAtivo: true
});

await setDoc("produtos/prod-local-1", {
  criadoPor: "owner-pro",
  nome: "Produto Local",
  preco: 99,
  statusProduto: "ativo",
  destaque: true,
  ordem: 1
});

await setDoc("leads/lead-local-1", {
  criadoPor: "owner-pro",
  nome: "Lead Local",
  email: "lead@local.test",
  status: "novo",
  origem: "seed"
});

await setDoc("chats/chat-local-1", {
  donoUID: "owner-pro",
  clienteNome: "Cliente Local",
  statusAdmin: "pending",
  atualizadoEm: FieldValue.serverTimestamp()
});

await setDoc("notificacoes/notif-local-1", {
  uid: "owner-pro",
  titulo: "Notificação local",
  mensagem: "Seed do Emulator ativo",
  lidoPor: [],
  criadoEm: FieldValue.serverTimestamp()
});

console.log("Seed local concluído no Emulator demo-vide-hub.");
console.log("Contas locais:");
for (const user of users) {
  console.log(`- ${user.email} / ${user.password}`);
}
