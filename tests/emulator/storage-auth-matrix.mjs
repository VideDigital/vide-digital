import assert from "node:assert/strict";
import { doc, setDoc, updateDoc } from "firebase/firestore";
import { deleteObject, getBytes, listAll, ref, uploadBytes } from "firebase/storage";

const modules = ["produtos", "configuracoes", "landing-pages"];
const categories = [
  { name: "products", suffix: "products/p", mime: "image/png", max: 5 * 1024 * 1024 },
  { name: "profile", suffix: "profile", mime: "image/png", max: 2 * 1024 * 1024 },
  { name: "banners", suffix: "banners", mime: "image/png", max: 6 * 1024 * 1024 },
  { name: "landing-pages", suffix: "landing-pages/lp", mime: "image/png", max: 5 * 1024 * 1024 },
  { name: "digital-products", suffix: "digital-products/p", mime: "application/pdf", max: 50 * 1024 * 1024, private: true }
];

function requireEmulators() {
  assert.equal(process.env.GCLOUD_PROJECT, "demo-vide-hub");
  assert.match(process.env.FIRESTORE_EMULATOR_HOST || "", /^(127\.0\.0\.1|localhost):8080$/);
  assert.match(process.env.FIREBASE_STORAGE_EMULATOR_HOST || "", /^(127\.0\.0\.1|localhost):9199$/);
}

function verifier() {
  const failures = [];
  let checks = 0;
  return {
    async check(label, expected, operation) {
      let allowed = false;
      try {
        await operation();
        allowed = true;
      } catch (error) {
        // Missing objects, timeouts and infrastructure errors are not denials.
        assert.equal(error.code, "storage/unauthorized", `${label}: unexpected ${error.code}`);
      }
      checks++;
      if (allowed !== expected) failures.push({ label, expected, allowed });
    },
    finish(name, expectedChecks) {
      console.log(JSON.stringify({ name, checks, mismatches: failures.length }));
      assert.equal(checks, expectedChecks);
      assert.deepEqual(failures, [], `${name}: unexpected authorization results`);
    }
  };
}

function employee(extra = {}) {
  return { status: "ativo", donoUID: "ownerA", permissoes: { ver: modules, editar: modules }, ...extra };
}

async function seed(env, owners, employees) {
  await env.withSecurityRulesDisabled(async (context) => {
    for (const [uid, data] of owners) await setDoc(doc(context.firestore(), "usuarios", uid), data);
    for (const [uid, data] of employees) await setDoc(doc(context.firestore(), "funcionarios", uid), data);
  });
}

async function verifyRoles(env, roles, v) {
  for (const category of categories) {
    for (const role of roles) {
      const owner = role.owner || "ownerA";
      const prefix = `stores/${owner}/${category.suffix}`;
      const target = `${prefix}/${role.name}.bin`;
      const context = role.uid ? env.authenticatedContext(role.uid, role.token || {}) : env.unauthenticatedContext();
      const storage = context.storage();
      await env.withSecurityRulesDisabled((c) => uploadBytes(ref(c.storage(), target), new Uint8Array([1, 2, 3]), { contentType: category.mime }));
      const label = `${category.name}/${role.name}`;
      const canWrite = !!role.write && (!role.modules || role.modules.includes(category.name));
      await v.check(`${label}/READ`, !category.private || !!role.privateRead, () => getBytes(ref(storage, target)));
      await v.check(`${label}/LIST`, !category.private || !!role.privateRead, () => listAll(ref(storage, prefix)));
      await v.check(`${label}/CREATE`, canWrite, () => uploadBytes(ref(storage, `${prefix}/${role.name}-new.bin`), new Uint8Array([4]), { contentType: category.mime }));
      await v.check(`${label}/UPDATE`, canWrite, () => uploadBytes(ref(storage, target), new Uint8Array([5]), { contentType: category.mime }));
      await v.check(`${label}/DELETE`, canWrite, () => deleteObject(ref(storage, target)));
    }
  }
}

export async function verifyStorageAuthorizationMatrix(env) {
  requireEmulators();
  await seed(env,
    [["ownerA", { status: "aprovado" }], ["ownerB", { status: "aprovado" }], ["ownerSusp", { status: "suspenso" }], ["ownerPending", { status: "pendente" }], ["ownerRejected", { status: "rejeitado" }], ["ownerInactive", { status: "inativo" }]],
    [["staff", employee()], ["legacy", employee()], ["noPerm", employee({ permissoes: { editar: [] } })], ["inactive", employee({ status: "inativo" })], ["pendingSync", employee({ authSyncPendente: true })], ["suspStaff", employee({ donoUID: "ownerSusp" })], ["otherStaff", employee({ donoUID: "ownerB" })], ["explicitFalse", employee({ authSyncPendente: false })], ["missingLinked", employee({ donoUID: "missing" })], ["productsOnly", employee({ permissoes: { editar: ["produtos"] } })]]);
  const roles = [
    { name: "visitor", uid: null },
    { name: "approved", uid: "ownerA", write: true, privateRead: true },
    { name: "suspended", uid: "ownerSusp", owner: "ownerSusp" },
    { name: "pendingOwner", uid: "ownerPending", owner: "ownerPending" },
    { name: "rejectedOwner", uid: "ownerRejected", owner: "ownerRejected" },
    { name: "staff", uid: "staff", write: true },
    { name: "noPermission", uid: "noPerm" },
    { name: "inactive", uid: "inactive" },
    { name: "pendingSync", uid: "pendingSync" },
    { name: "legacy", uid: "legacy", write: true },
    { name: "suspendedTenantStaff", uid: "suspStaff", owner: "ownerSusp" },
    { name: "otherTenant", uid: "ownerB" },
    { name: "otherTenantStaff", uid: "otherStaff" },
    { name: "admin", uid: "backendAdmin", token: { videAdmin: true }, write: true, privateRead: true },
    { name: "missingOwnerDoc", uid: "missing", owner: "missing" },
    { name: "fakeAdminString", uid: "ownerB", token: { videAdmin: "true" } },
    { name: "inactiveOwner", uid: "ownerInactive", owner: "ownerInactive" },
    { name: "explicitFalse", uid: "explicitFalse", write: true },
    { name: "missingLinkedOwner", uid: "missingLinked", owner: "missing" },
    { name: "productsOnly", uid: "productsOnly", write: true, modules: ["products", "digital-products"] }
  ];
  const v = verifier();
  await verifyRoles(env, roles, v);
  const storage = env.authenticatedContext("ownerA").storage();
  for (const category of categories) {
    for (const size of [0, 1, category.max, category.max + 1]) {
      await v.check(`${category.name}/SIZE/${size}`, size > 0 && size <= category.max,
        () => uploadBytes(ref(storage, `stores/ownerA/${category.suffix}/size-${size}.bin`), new Uint8Array(size), { contentType: category.mime }));
    }
    for (const mime of ["image/svg+xml", "text/html", "application/javascript", "application/zip", ...(category.private ? ["image/png"] : ["image/jpeg", "image/webp", "image/gif"])]) {
      await v.check(`${category.name}/MIME/${mime}`, !category.private && ["image/jpeg", "image/webp", "image/gif"].includes(mime),
        () => uploadBytes(ref(storage, `stores/ownerA/${category.suffix}/mime-${mime.replaceAll("/", "-")}.bin`), new Uint8Array([0]), { contentType: mime }));
    }
  }
  for (const path of ["usuarios/ownerA/avatar.png", "products/p/file.png", "stores/ownerA/unknown/file.png", "stores/ownerA/products/nested/extra/file.png"]) {
    await v.check(`UNMATCHED/${path}`, false, () => uploadBytes(ref(storage, path), new Uint8Array([0]), { contentType: "image/png" }));
  }
  v.finish("storage-557", 557);
}

export async function verifyStorageMalformedStates(env) {
  requireEmulators();
  const owners = [["unknownOwner", { status: "desconhecido" }], ["statusMissing", {}], ["ownerA", { status: "aprovado" }], ["ownerPending", { status: "pendente" }], ["ownerRejected", { status: "rejeitado" }]];
  const malformed = [
    ["syncString", { authSyncPendente: "false" }], ["syncNull", { authSyncPendente: null }], ["syncNumber", { authSyncPendente: 0 }],
    ["badTenant", { donoUID: ["ownerA"] }], ["emptyTenant", { donoUID: "" }],
    ["badPermissions", { permissoes: { editar: "produtos" } }], ["pendingTenant", { donoUID: "ownerPending" }], ["rejectedTenant", { donoUID: "ownerRejected" }]
  ];
  await seed(env, owners, malformed.map(([uid, extra]) => [uid, employee(extra)]));
  const roles = [
    { name: "unknownOwner", uid: "unknownOwner", owner: "unknownOwner" },
    { name: "statusMissing", uid: "statusMissing", owner: "statusMissing" },
    { name: "missingEmployee", uid: "missingEmployee" },
    ...malformed.map(([uid, extra]) => ({ name: uid, uid, owner: ["ownerPending", "ownerRejected"].includes(extra.donoUID) ? extra.donoUID : "ownerA" }))
  ];
  const v = verifier();
  await verifyRoles(env, roles, v);
  // Same SDK client remains authenticated while Firestore state changes.
  const storage = env.authenticatedContext("ownerA").storage();
  const target = ref(storage, "stores/ownerA/digital-products/p/transition.pdf");
  await v.check("transition/approved-upload", true, () => uploadBytes(target, new Uint8Array([1]), { contentType: "application/pdf" }));
  await env.withSecurityRulesDisabled((c) => updateDoc(doc(c.firestore(), "usuarios", "ownerA"), { status: "inativo" }));
  await v.check("transition/suspended-read", false, () => getBytes(target));
  await env.withSecurityRulesDisabled((c) => updateDoc(doc(c.firestore(), "usuarios", "ownerA"), { status: "aprovado" }));
  await v.check("transition/restored-read", true, () => getBytes(target));
  await env.withSecurityRulesDisabled((c) => updateDoc(doc(c.firestore(), "usuarios", "ownerA"), { status: "inativo" }));
  await v.check("transition/suspended-delete", false, () => deleteObject(target));
  v.finish("storage-malformed-transition", roles.length * categories.length * 5 + 4);
}
