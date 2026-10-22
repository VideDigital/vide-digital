import assert from "node:assert/strict";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteObject, getMetadata, ref, updateMetadata, uploadBytes } from "firebase/storage";
import { assertObjectAbsent, objectState, requireStorageEmulators, storageFixture } from "./storage-fixtures.mjs";

// Run BEFORE loading product Rules, in the serial test process on an exclusive
// Emulator instance. Each temporary policy is destroyed before product tests.
export async function verifyOperationDiscriminant() {
  requireStorageEmulators();
  for (const create of [true, false]) {
    const rules = `rules_version = '2'; service firebase.storage {
      match /b/{bucket}/o { match /stores/{path=**} {
        allow read, delete: if true;
        allow create: if ${create}; allow update: if ${!create};
      } }
    }`;
    const env = await initializeTestEnvironment({ projectId: "demo-vide-hub", storage: { rules } });
    const fixture = storageFixture(env, ["stores/discriminant/"]);
    try {
      const newPath = "stores/discriminant/new.bin";
      await assertObjectAbsent(fixture.env, newPath);
      const newTarget = ref(fixture.env.unauthenticatedContext().storage(), newPath);
      const createNew = () => uploadBytes(newTarget, new Uint8Array([3]), { contentType: "image/png" });
      if (create) {
        await createNew();
        assert.deepEqual((await objectState(fixture.env, newPath)).bytes, [3]);
      } else {
        await assert.rejects(createNew(), { code: "storage/unauthorized" });
        await assertObjectAbsent(fixture.env, newPath);
      }
      const path = "stores/discriminant/existing.bin";
      await fixture.env.withSecurityRulesDisabled(c => uploadBytes(ref(c.storage(), path), new Uint8Array([1]),
        { contentType: "image/png", customMetadata: { proof: "before" } }));
      const target = ref(fixture.env.unauthenticatedContext().storage(), path);
      const before = await objectState(fixture.env, path);
      const overwrite = () => uploadBytes(target, new Uint8Array([2]), { contentType: "image/png", customMetadata: { proof: "before" } });
      if (create) await overwrite();
      else await assert.rejects(overwrite(), { code: "storage/unauthorized" });
      const afterOverwrite = await objectState(fixture.env, path);
      assert.deepEqual(afterOverwrite.bytes, create ? [2] : before.bytes);
      if (!create) assert.deepEqual(afterOverwrite, before);
      const update = () => updateMetadata(target, { customMetadata: { proof: "updated" } });
      if (create) await assert.rejects(update(), { code: "storage/unauthorized" });
      else await update();
      const afterUpdate = await objectState(fixture.env, path);
      assert.deepEqual(afterUpdate.bytes, afterOverwrite.bytes);
      if (create) assert.deepEqual(afterUpdate, afterOverwrite);
      else assert.equal(afterUpdate.metadata.customMetadata.proof, "updated");
      console.log(JSON.stringify({ name: "storage-operation-discriminant", bucket: fixture.bucket, rules,
        createAllowed: create, updateAllowed: !create, newUploadAllowed: create, overwriteAllowed: create, metadataUpdateAllowed: !create }));
    } finally {
      try { await fixture.cleanup(); } finally { await env.cleanup(); }
    }
  }
}

export async function verifyRecursiveCleanup(env) {
  requireStorageEmulators();
  const paths = ["stores/qaA/products/p/probe.bin", "stores/qaA/profile/probe.bin",
    "stores/qaA/banners/probe.bin", "stores/qaA/landing-pages/lp/probe.bin",
    "stores/qaA/digital-products/p/probe.bin", "stores/qaA/digital-products/p/token.pdf",
    "stores/qaA/digital-products/p/write-only.pdf", "stores/missing/digital-products/p/admin.pdf"];
  const fixture = storageFixture(env, ["stores/qaA/", "stores/missing/"], true);
  const sentinel = "other-suite/protected.bin";
  // Exact historical bucket/paths, only on a fresh, exclusive Emulator. Reject
  // pre-existing data rather than claiming it or deleting an unknown fixture.
  assert.deepEqual(await fixture.inventory(), []);
  await env.withSecurityRulesDisabled(async c => {
    await assert.rejects(getMetadata(ref(c.storage(), sentinel)), { code: "storage/object-not-found" });
  });
  try {
    await env.withSecurityRulesDisabled(c => uploadBytes(ref(c.storage(), sentinel), new Uint8Array([99])));
    const sentinelBefore = await objectState(fixture.env, sentinel);
    for (let run = 1; run <= 2; run++) {
      assert.deepEqual(await fixture.inventory(), []);
      const createdAt = new Date().toISOString();
      await fixture.env.withSecurityRulesDisabled(async c => {
        for (const path of paths) await uploadBytes(ref(c.storage(), path), new Uint8Array([1, 2, 3]),
          { contentType: path.endsWith("pdf") || path.includes("digital-products") ? "application/pdf" : "image/png" });
      });
      const before = await fixture.inventory();
      assert.equal(before.length, 8);
      const clearAt = new Date().toISOString();
      await env.clearStorage(); // The actual installed library, default bucket.
      const afterOldCleanup = await fixture.inventory();
      assert.deepEqual(afterOldCleanup, before, "Old root-only cleanup must leave all nested files");
      console.log(JSON.stringify({ name: "storage-cleanup-negative-control", project: "demo-vide-hub", bucket: fixture.bucket,
        run, createdAt, clearAt, observedAt: new Date().toISOString(), before, afterOldCleanup }));
      // Exercise cleanup through a real failed assertion, without failing suite.
      await assert.rejects(async () => {
        try { assert.fail("injected assertion to exercise finally"); }
        finally { await fixture.cleanup(); }
      }, { message: "injected assertion to exercise finally" });
      assert.deepEqual(await fixture.inventory(), []);
      assert.deepEqual(await objectState(fixture.env, sentinel), sentinelBefore,
        "Unowned sentinel bytes and metadata must survive both cleanup methods");
    }
  } finally {
    try { await fixture.cleanup(); }
    finally {
      await env.withSecurityRulesDisabled(async c => {
        // Only the single sentinel created above; no root/global deletion.
        requireStorageEmulators();
        assert.equal(ref(c.storage(), sentinel).bucket, "demo-vide-hub");
        try { await deleteObject(ref(c.storage(), sentinel)); }
        catch (error) { assert.equal(error.code, "storage/object-not-found"); }
        await assert.rejects(getMetadata(ref(c.storage(), sentinel)), { code: "storage/object-not-found" });
      });
    }
  }
}
