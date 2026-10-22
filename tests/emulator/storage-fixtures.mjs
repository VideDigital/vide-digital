import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { deleteObject, getBytes, getMetadata, listAll, ref } from "firebase/storage";

export function requireStorageEmulators() {
  assert.equal(process.env.GCLOUD_PROJECT, "demo-vide-hub");
  assert.match(process.env.FIRESTORE_EMULATOR_HOST || "", /^(127\.0\.0\.1|localhost):8080$/);
  assert.match(process.env.FIREBASE_STORAGE_EMULATOR_HOST || "", /^(127\.0\.0\.1|localhost):9199$/);
}

async function walk(storage, prefix) {
  const listing = await listAll(ref(storage, prefix));
  const paths = listing.items.map(item => item.fullPath);
  for (const child of listing.prefixes) paths.push(...await walk(storage, child.fullPath));
  return paths.sort();
}

// A private synthetic bucket per scenario preserves the Rules' real path shape.
// Cleanup owns only these explicit prefixes, never the bucket root.
export function storageFixture(env, prefixes = ["stores/", "usuarios/ownerA/", "products/p/"], legacyDefaultBucket = false) {
  requireStorageEmulators();
  assert.equal(env.projectId, "demo-vide-hub");
  const bucket = legacyDefaultBucket ? "demo-vide-hub" : `demo-vide-hub-storage-${randomUUID()}`;
  const owned = [...prefixes];
  assert(owned.length > 0);
  for (const prefix of owned) assert.match(prefix, /^(stores\/|usuarios\/ownerA\/|products\/p\/)([a-zA-Z0-9_/-]*\/)?$/);
  if (legacyDefaultBucket) assert.deepEqual(owned, ["stores/qaA/", "stores/missing/"]);
  function guard(storage, path) {
    requireStorageEmulators();
    assert.equal(ref(storage).bucket, bucket);
    assert(legacyDefaultBucket ? bucket === "demo-vide-hub" : /^demo-vide-hub-storage-[0-9a-f-]{36}$/.test(bucket));
    assert(owned.some(prefix => path === prefix.slice(0, -1) || path.startsWith(prefix)), `Unowned fixture: ${path}`);
  }
  const bind = context => ({
    firestore: (...args) => context.firestore(...args),
    storage: () => context.storage(`gs://${bucket}`)
  });
  const scoped = {
    authenticatedContext: (...args) => bind(env.authenticatedContext(...args)),
    unauthenticatedContext: () => bind(env.unauthenticatedContext()),
    withSecurityRulesDisabled: callback => env.withSecurityRulesDisabled(context => callback(bind(context)))
  };
  async function privileged(callback) {
    let value;
    await scoped.withSecurityRulesDisabled(async context => { value = await callback(context.storage()); });
    return value;
  }
  async function inventory() {
    return privileged(async storage => {
      const result = [];
      for (const prefix of owned) {
        guard(storage, prefix);
        for (const path of await walk(storage, prefix)) {
          guard(storage, path);
          const metadata = await getMetadata(ref(storage, path));
          assert.equal(metadata.bucket, bucket);
          result.push({ path, bucket: metadata.bucket, size: metadata.size, contentType: metadata.contentType,
            generation: metadata.generation, metageneration: metadata.metageneration,
            timeCreated: metadata.timeCreated, updated: metadata.updated });
        }
      }
      return result;
    });
  }
  async function cleanup() {
    const before = await inventory();
    await privileged(async storage => {
      for (const item of before) { guard(storage, item.path); await deleteObject(ref(storage, item.path)); }
      // Independent point reads, not just a successful DELETE or an empty listing.
      for (const item of before) {
        await assert.rejects(getMetadata(ref(storage, item.path)), { code: "storage/object-not-found" });
      }
      for (const prefix of owned) {
        const listing = await listAll(ref(storage, prefix));
        assert.equal(listing.items.length, 0, `Residual items: ${prefix}`);
        assert.equal(listing.prefixes.length, 0, `Residual subfolders: ${prefix}`);
      }
    });
    console.log(JSON.stringify({ name: "storage-fixture-cleanup", bucket, prefixes: owned,
      deleted: before.length, independentAbsence: before.length, remaining: 0 }));
    return before;
  }
  return { env: scoped, bucket, privileged, inventory, cleanup };
}

export async function objectState(env, path) {
  let state;
  await env.withSecurityRulesDisabled(async context => {
    const target = ref(context.storage(), path);
    const metadata = await getMetadata(target); // Missing object is a test error.
    state = { metadata, bytes: Array.from(new Uint8Array(await getBytes(target))) };
  });
  return state;
}

export async function assertObjectAbsent(env, path) {
  await env.withSecurityRulesDisabled(async context => {
    await assert.rejects(getMetadata(ref(context.storage(), path)), { code: "storage/object-not-found" });
  });
}
