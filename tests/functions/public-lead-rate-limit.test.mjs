// MISSÃO 075 — rate limit de createPublicLead por tenant resolvido no
// servidor (nunca IP/XFF/auth/payload). Testes puros, com um Firestore em
// memória mínimo; a transação real e o assertRateLimit real ficam em
// tests/functions/emulator/public-lead-rate-limit.test.mjs e no smoke HTTP
// tests/emulator/public-lead-rate-limit.smoke.mjs.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { describe, it } from "node:test";
import { createRequire } from "node:module";
import api from "../../functions/src/public/index.js";

const fnRequire = createRequire(new URL("../../functions/src/index.js", import.meta.url));
const { HttpsError } = fnRequire("firebase-functions/v2/https");

const {
  handleCreatePublicLead,
  leadTenantRateLimitIdentifier,
  createLocalWindowLimiter,
  createLeadIdempotent,
  CREATE_PUBLIC_LEAD_PER_TENANT_PER_MIN,
  CREATE_PUBLIC_LEAD_LOCAL_REQUESTS_PER_MIN
} = api;

const hashTenant = (owner) =>
  `tenant_${crypto.createHash("sha256").update(`createPublicLead|tenant:${owner}`).digest("hex").slice(0, 40)}`;

function seedBase() {
  return {
    "usuarios/owner-a": { status: "aprovado" },
    "usuarios/owner-b": { status: "aprovado" },
    "usuarios/owner-inativo": { status: "bloqueado" },
    "vitrines_publicas/loja-a": { donoUID: "owner-a", nomeLoja: "Loja A" },
    "vitrines_publicas/loja-a-alias": { donoUID: "owner-a", nomeLoja: "Loja A (alias)" },
    "vitrines_publicas/loja-b": { donoUID: "owner-b", nomeLoja: "Loja B" },
    "vitrines_publicas/loja-inativa": { donoUID: "owner-inativo" },
    "landing_pages_publicas/lp-a": { donoUID: "owner-a", publicado: true, titulo: "LP A" },
    "landing_pages_publicas/lp-a-rascunho": { donoUID: "owner-a", publicado: false }
  };
}

// Firestore mínimo: doc/get/collection().doc()/runTransaction com tx.get/tx.set.
function fakeDb(seed = seedBase(), { aoLer } = {}) {
  const docs = new Map(Object.entries(seed));
  const acessos = [];
  let auto = 0;
  const snap = (path) => {
    const data = aoLer ? aoLer(path, docs.get(path)) : docs.get(path);
    return { exists: data !== undefined, id: path.split("/").pop(), data: () => data };
  };
  const ref = (path) => ({
    id: path.split("/").pop(),
    path,
    get: async () => { acessos.push(`get ${path}`); return snap(path); }
  });
  return {
    docs,
    acessos,
    doc: (path) => ref(path),
    collection: (name) => ({ doc: (id) => ref(`${name}/${id || `auto-${++auto}`}`) }),
    runTransaction: async (fn) => fn({
      get: async (r) => { acessos.push(`tx.get ${r.path}`); return snap(r.path); },
      set: (r, data) => { acessos.push(`tx.set ${r.path}`); docs.set(r.path, data); }
    })
  };
}

function espiaoRateLimit() {
  const chamadas = [];
  const fn = async (args) => { chamadas.push(args); };
  fn.chamadas = chamadas;
  return fn;
}

const valvulaFolgada = () => createLocalWindowLimiter({ max: 100000 });

function requisicao(data, { xff, ip, socket, uid, provedor } = {}) {
  const headers = {};
  if (xff !== undefined) headers["x-forwarded-for"] = xff;
  return {
    data,
    rawRequest: { headers, ip, socket: socket ? { remoteAddress: socket } : undefined },
    auth: uid ? { uid, token: { firebase: { sign_in_provider: provedor || "password" } } } : undefined
  };
}

const leadsGravados = (db) => [...db.docs.entries()].filter(([k]) => k.startsWith("leads/"));

describe("075 — configuração dedicada do teto de createPublicLead", () => {
  it("teto por tenant é a configuração dedicada (60/min), não o antigo 5/min por visitante", () => {
    assert.equal(CREATE_PUBLIC_LEAD_PER_TENANT_PER_MIN, 60);
    assert.equal(CREATE_PUBLIC_LEAD_LOCAL_REQUESTS_PER_MIN, 600);
  });

  it("o rate limit recebe exatamente scope createPublicLead, bucket do tenant e o teto dedicado", async () => {
    const db = fakeDb();
    const rl = espiaoRateLimit();
    await handleCreatePublicLead(requisicao({ storeSlug: "loja-a", nome: "Visitante" }), { db, valve: valvulaFolgada(), assertRateLimit: rl });
    assert.deepEqual(rl.chamadas, [{ scope: "createPublicLead", identifier: hashTenant("owner-a"), max: 60 }]);
  });
});

describe("075 — identidade do bucket = tenant pseudonimizado", () => {
  it("formato tenant_<sha256 40 hex>, determinístico, sem o ownerUid bruto", () => {
    const id = leadTenantRateLimitIdentifier("owner-a");
    assert.match(id, /^tenant_[0-9a-f]{40}$/);
    assert.equal(id, hashTenant("owner-a"));
    assert.equal(leadTenantRateLimitIdentifier("owner-a"), id);
    assert.ok(!id.includes("owner-a"));
    assert.notEqual(leadTenantRateLimitIdentifier("owner-b"), id);
  });

  it("ownerUid vazio falha fechado (nunca bucket genérico)", () => {
    assert.throws(() => leadTenantRateLimitIdentifier(""), (e) => e instanceof HttpsError && e.code === "internal");
    assert.throws(() => leadTenantRateLimitIdentifier(undefined), (e) => e instanceof HttpsError && e.code === "internal");
  });

  it("XFF (primeiro/último/cadeia), rawRequest.ip, socket, auth, Anonymous Auth e campos forjados não mudam o bucket", async () => {
    const variantes = [
      requisicao({ storeSlug: "loja-a", nome: "V" }, { xff: "203.0.113.1" }),
      requisicao({ storeSlug: "loja-a", nome: "V" }, { xff: "203.0.113.2, 198.51.100.20" }),
      requisicao({ storeSlug: "loja-a", nome: "V" }, { xff: "198.51.100.20, 203.0.113.3" }),
      requisicao({ storeSlug: "loja-a", nome: "V" }, { xff: "2001:db8::1, 10.0.0.1, 10.0.0.2" }),
      requisicao({ storeSlug: "loja-a", nome: "V" }, { xff: "nao-e-ip" }),
      requisicao({ storeSlug: "loja-a", nome: "V" }, { ip: "192.0.2.10" }),
      requisicao({ storeSlug: "loja-a", nome: "V" }, { socket: "192.0.2.11" }),
      requisicao({ storeSlug: "loja-a", nome: "V" }, { uid: "UID_EMAIL_QA" }),
      requisicao({ storeSlug: "loja-a", nome: "V" }, { uid: "UID_ANON_1", provedor: "anonymous" }),
      requisicao({ storeSlug: "loja-a", nome: "V" }, { uid: "UID_ANON_2", provedor: "anonymous" }),
      requisicao({ storeSlug: "loja-a", nome: "V", ownerUid: "owner-b", tenantId: "owner-b", storeUid: "owner-b", criadoPor: "owner-b", uid: "owner-b" }),
      requisicao({ storeSlug: "loja-a-alias", nome: "V" }),
      requisicao({ publicPageId: "lp-a", nome: "V" })
    ];
    const rl = espiaoRateLimit();
    const db = fakeDb();
    for (const r of variantes) await handleCreatePublicLead(r, { db, valve: valvulaFolgada(), assertRateLimit: rl });
    assert.deepEqual([...new Set(rl.chamadas.map((c) => c.identifier))], [hashTenant("owner-a")]);
    const leads = leadsGravados(db);
    assert.equal(leads.length, variantes.length);
    assert.ok(leads.every(([, lead]) => lead.criadoPor === "owner-a" && lead.tenantId === "owner-a"), "lead sempre do tenant resolvido");
  });

  it("tenants diferentes nunca compartilham bucket", async () => {
    const rl = espiaoRateLimit();
    const db = fakeDb();
    await handleCreatePublicLead(requisicao({ storeSlug: "loja-a", nome: "A" }), { db, valve: valvulaFolgada(), assertRateLimit: rl });
    await handleCreatePublicLead(requisicao({ storeSlug: "loja-b", nome: "B" }), { db, valve: valvulaFolgada(), assertRateLimit: rl });
    assert.deepEqual(rl.chamadas.map((c) => c.identifier), [hashTenant("owner-a"), hashTenant("owner-b")]);
  });
});

describe("075 — falhas antes do rate limit não consomem cota nem criam bucket", () => {
  const casos = [
    ["slug inexistente", { storeSlug: "loja-fantasma", nome: "V" }, "not-found"],
    ["LP inexistente", { publicPageId: "lp-fantasma", nome: "V" }, "not-found"],
    ["dono inativo", { storeSlug: "loja-inativa", nome: "V" }, "failed-precondition"],
    ["LP não publicada", { publicPageId: "lp-a-rascunho", nome: "V" }, "failed-precondition"],
    ["sem dado de contato", { storeSlug: "loja-a" }, "invalid-argument"],
    ["e-mail inválido", { storeSlug: "loja-a", nome: "V", email: "x@" }, "invalid-argument"],
    ["sem slug nem página", { nome: "V" }, "invalid-argument"],
    ["payload grande demais", { storeSlug: "loja-a", nome: "V", lixo: "x".repeat(25000) }, "invalid-argument"]
  ];
  for (const [rotulo, data, codigo] of casos) {
    it(`${rotulo} → ${codigo}, sem rate limit e sem lead`, async () => {
      const rl = espiaoRateLimit();
      const db = fakeDb();
      await assert.rejects(
        () => handleCreatePublicLead(requisicao(data), { db, valve: valvulaFolgada(), assertRateLimit: rl }),
        (e) => e instanceof HttpsError && e.code === codigo
      );
      assert.equal(rl.chamadas.length, 0);
      assert.equal(leadsGravados(db).length, 0);
    });
  }
});

describe("075 — válvula local por instância", () => {
  it("bloqueia cedo com resource-exhausted sem tocar o Firestore nem o rate limit", async () => {
    const valve = createLocalWindowLimiter({ max: 0 });
    const rl = espiaoRateLimit();
    const dbQueExplode = new Proxy({}, { get() { throw new Error("Firestore não pode ser tocado"); } });
    await assert.rejects(
      () => handleCreatePublicLead(requisicao({ storeSlug: "loja-a", nome: "V" }), { db: dbQueExplode, valve, assertRateLimit: rl }),
      (e) => e instanceof HttpsError && e.code === "resource-exhausted"
    );
    assert.equal(rl.chamadas.length, 0);
  });

  it("conta todas as requisições (até inválidas) e libera de novo só após a janela", async () => {
    let agora = 1000;
    const valve = createLocalWindowLimiter({ max: 2, windowMs: 60000, now: () => agora });
    const db = fakeDb();
    const deps = { db, valve, assertRateLimit: espiaoRateLimit() };
    await assert.rejects(() => handleCreatePublicLead(requisicao({ storeSlug: "loja-fantasma", nome: "V" }), deps), (e) => e.code === "not-found");
    await handleCreatePublicLead(requisicao({ storeSlug: "loja-a", nome: "V" }), deps);
    await assert.rejects(() => handleCreatePublicLead(requisicao({ storeSlug: "loja-a", nome: "V" }), deps), (e) => e.code === "resource-exhausted");
    agora += 59999;
    assert.equal(valve.tryConsume(), false);
    agora += 1;
    assert.equal(valve.tryConsume(), true);
  });

  it("instância nova (cold start) começa do zero; limitador sem timer", () => {
    const a = createLocalWindowLimiter({ max: 1 });
    assert.equal(a.tryConsume(), true);
    assert.equal(a.tryConsume(), false);
    assert.equal(createLocalWindowLimiter({ max: 1 }).tryConsume(), true);
  });
});

describe("075 — resultado do rate limit distribuído", () => {
  it("resource-exhausted do bucket é repassado e nenhum lead é gravado", async () => {
    const db = fakeDb();
    const esgotado = async () => { throw new HttpsError("resource-exhausted", "Muitas requisições."); };
    await assert.rejects(
      () => handleCreatePublicLead(requisicao({ storeSlug: "loja-a", nome: "V" }), { db, valve: valvulaFolgada(), assertRateLimit: esgotado }),
      (e) => e instanceof HttpsError && e.code === "resource-exhausted"
    );
    assert.equal(leadsGravados(db).length, 0);
  });

  it("falha da transação do bucket (contenção) vira unavailable tratado, sem lead", async () => {
    const db = fakeDb();
    const contencao = async () => { throw Object.assign(new Error("10 ABORTED: Too much contention"), { code: 10 }); };
    await assert.rejects(
      () => handleCreatePublicLead(requisicao({ storeSlug: "loja-a", nome: "V" }), { db, valve: valvulaFolgada(), assertRateLimit: contencao }),
      (e) => e instanceof HttpsError && e.code === "unavailable"
    );
    assert.equal(leadsGravados(db).length, 0);
  });
});

describe("075 — resolução fora × dentro da transação", () => {
  it("se o dono mudar entre o rate limit e a transação, falha fechado sem gravar lead", async () => {
    let leiturasVitrine = 0;
    const db = fakeDb(seedBase(), {
      aoLer(path, data) {
        if (path !== "vitrines_publicas/loja-a") return data;
        leiturasVitrine += 1;
        return leiturasVitrine === 1 ? data : { ...data, donoUID: "owner-b" };
      }
    });
    const rl = espiaoRateLimit();
    await assert.rejects(
      () => handleCreatePublicLead(requisicao({ storeSlug: "loja-a", nome: "V" }), { db, valve: valvulaFolgada(), assertRateLimit: rl }),
      (e) => e instanceof HttpsError && e.code === "failed-precondition"
    );
    assert.equal(rl.chamadas[0].identifier, hashTenant("owner-a"));
    assert.equal(leadsGravados(db).length, 0);
  });

  it("createLeadIdempotent sem expectedOwnerUid mantém o comportamento anterior", async () => {
    const db = fakeDb();
    const id = await createLeadIdempotent({ storeSlug: "loja-a", nome: "V" }, db);
    assert.equal(db.docs.get(`leads/${id}`).criadoPor, "owner-a");
  });
});

describe("075 — idempotência preservada", () => {
  it("mesmo dedupeKey devolve o mesmo lead; tokens diferentes criam dois leads", async () => {
    const db = fakeDb();
    const deps = { db, valve: valvulaFolgada(), assertRateLimit: espiaoRateLimit() };
    const r1 = await handleCreatePublicLead(requisicao({ storeSlug: "loja-a", nome: "V", dedupeKey: "tentativa-1" }), deps);
    const r2 = await handleCreatePublicLead(requisicao({ storeSlug: "loja-a", nome: "V", dedupeKey: "tentativa-1" }), deps);
    const r3 = await handleCreatePublicLead(requisicao({ storeSlug: "loja-a", nome: "V", dedupeKey: "tentativa-2" }), deps);
    assert.equal(r1.leadId, r2.leadId);
    assert.notEqual(r1.leadId, r3.leadId);
    assert.equal(leadsGravados(db).length, 2);
  });
});
