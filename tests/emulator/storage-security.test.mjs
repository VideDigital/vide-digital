import assert from "node:assert/strict";
import fs from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";

const PROJECT_ID = "demo-vide-hub";
let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync("firestore.rules", "utf8")
    },
    storage: {
      rules: fs.readFileSync("storage.rules", "utf8")
    }
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "funcionarios", "employeeProducts"), {
      donoUID: "ownerA",
      status: "ativo",
      permissoes: { ver: ["produtos"], editar: ["produtos"] }
    });
    await setDoc(doc(context.firestore(), "funcionarios", "employeeReadOnly"), {
      donoUID: "ownerA",
      status: "ativo",
      permissoes: { ver: ["produtos"], editar: [] }
    });
  });
});

after(async () => {
  await testEnv.cleanup();
});

function storage(uid, token = {}) {
  return uid
    ? testEnv.authenticatedContext(uid, token).storage()
    : testEnv.unauthenticatedContext().storage();
}

function blob(type, size = 32) {
  return new Blob([new Uint8Array(size)], { type });
}

describe("storage tenant upload rules", () => {
  it("owner uploads valid product image", async () => {
    await assertSucceeds(uploadBytes(ref(storage("ownerA"), "stores/ownerA/products/prodA/a.png"), blob("image/png")));
  });

  it("blocks cross-tenant and public upload", async () => {
    await assertFails(uploadBytes(ref(storage("ownerB"), "stores/ownerA/products/prodA/a.png"), blob("image/png")));
    await assertFails(uploadBytes(ref(storage(null), "stores/ownerA/products/prodA/a.png"), blob("image/png")));
  });

  it("employee with module edit can upload and read-only employee cannot", async () => {
    await assertSucceeds(uploadBytes(ref(storage("employeeProducts"), "stores/ownerA/products/prodA/a.webp"), blob("image/webp")));
    await assertFails(uploadBytes(ref(storage("employeeReadOnly"), "stores/ownerA/products/prodA/a.webp"), blob("image/webp")));
  });

  it("blocks SVG, HTML and JavaScript MIME types", async () => {
    await assertFails(uploadBytes(ref(storage("ownerA"), "stores/ownerA/products/prodA/a.svg"), blob("image/svg+xml")));
    await assertFails(uploadBytes(ref(storage("ownerA"), "stores/ownerA/products/prodA/a.html"), blob("text/html")));
    await assertFails(uploadBytes(ref(storage("ownerA"), "stores/ownerA/products/prodA/a.js"), blob("application/javascript")));
  });

  it("allows only PDF as digital product in this proposal", async () => {
    await assertSucceeds(uploadBytes(ref(storage("ownerA"), "stores/ownerA/digital-products/prodA/a.pdf"), blob("application/pdf")));
    await assertFails(uploadBytes(ref(storage("ownerA"), "stores/ownerA/digital-products/prodA/a.zip"), blob("application/zip")));
  });
});
