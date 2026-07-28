import assert from "node:assert/strict";
import { describe, it } from "node:test";
import core from "../../functions/src/audit/core.js";

describe("audit/core — detectOperation", () => {
    it("create quando não existia antes e existe depois", () => {
        assert.equal(core.detectOperation(false, true), "create");
    });
    it("delete quando existia antes e não existe depois", () => {
        assert.equal(core.detectOperation(true, false), "delete");
    });
    it("update quando existia nos dois lados", () => {
        assert.equal(core.detectOperation(true, true), "update");
    });
});

describe("audit/core — diffFields / changedFieldsForOperation", () => {
    it("ignora campos de ruído", () => {
        const changed = core.diffFields(
            { status: "a", atualizadoEm: 1 },
            { status: "a", atualizadoEm: 2 }
        );
        assert.deepEqual(changed, []);
    });

    it("detecta campo real alterado junto com ruído ignorado", () => {
        const changed = core.diffFields(
            { status: "a", atualizadoEm: 1 },
            { status: "b", atualizadoEm: 2 }
        );
        assert.deepEqual(changed, ["status"]);
    });

    it("create considera todos os campos presentes (menos ruído)", () => {
        const changed = core.changedFieldsForOperation("create", null, {
            status: "novo",
            atualizadoEm: 1,
            plano: "pro"
        });
        assert.deepEqual(changed.sort(), ["plano", "status"]);
    });

    it("delete não gera changedFields", () => {
        const changed = core.changedFieldsForOperation("delete", { status: "a" }, null);
        assert.deepEqual(changed, []);
    });
});

describe("audit/core — shouldSkipEvent (ruído)", () => {
    it("update sem campo relevante é ignorado", () => {
        assert.equal(core.shouldSkipEvent({ operation: "update", changedFields: [] }), true);
    });
    it("update com campo relevante não é ignorado", () => {
        assert.equal(core.shouldSkipEvent({ operation: "update", changedFields: ["status"] }), false);
    });
    it("create nunca é ignorado mesmo com changedFields vazio", () => {
        assert.equal(core.shouldSkipEvent({ operation: "create", changedFields: [] }), false);
    });
});

describe("audit/core — sanitizeDocument / PII", () => {
    it("remove campos fora do allowlist", () => {
        const out = core.sanitizeDocument({ status: "ativo", telefone: "5511999999999" }, ["status"]);
        assert.deepEqual(out, { status: "ativo" });
    });

    it("bloqueia recursivamente chaves de PII mesmo dentro do allowlist", () => {
        const out = core.sanitizeDocument(
            { tracking: { metaPixelId: "123", clienteEmail: "a@b.com" } },
            ["tracking"]
        );
        assert.equal(out.tracking.metaPixelId, "123");
        assert.equal("clienteEmail" in out.tracking, false);
    });

    it("nunca inclui email/telefone/cpf mesmo se alguém colocar no allowlist por engano", () => {
        const out = core.sanitizeDocument(
            { email: "a@b.com", telefone: "123", cpf: "000" },
            ["email", "telefone", "cpf"]
        );
        assert.deepEqual(out, {});
    });

    it("trunca strings longas e limita arrays", () => {
        const longa = "x".repeat(500);
        const out = core.sanitizeDocument({ tags: Array.from({ length: 50 }, (_, i) => `t${i}`), nome: longa }, ["tags", "nome"]);
        assert.ok(out.tags.length <= 20);
        assert.ok(out.nome.length < 500);
    });

    it("isBlockedKey identifica variações de PII por substring", () => {
        assert.equal(core.isBlockedKey("clienteTelefone"), true);
        assert.equal(core.isBlockedKey("observacoesInternas"), true);
        assert.equal(core.isBlockedKey("statusProduto"), false);
        assert.equal(core.isBlockedKey("responsavelUid"), false);
    });
});

describe("audit/core — deriveActor", () => {
    it("system quando authType é system", () => {
        assert.deepEqual(core.deriveActor({ authType: "system", authId: "sa@x.iam" }), { actorType: "system", actorUid: null });
    });
    it("unauthenticated quando authType é unauthenticated", () => {
        assert.deepEqual(core.deriveActor({ authType: "unauthenticated" }), { actorType: "unauthenticated", actorUid: null });
    });
    it("user quando há authId real, mesmo com authType técnico não classificado", () => {
        assert.deepEqual(core.deriveActor({ authType: "unknown", authId: "uid-dono-1" }), { actorType: "user", actorUid: "uid-dono-1" });
    });
    it("unknown quando não há authId nem tipo reconhecido", () => {
        assert.deepEqual(core.deriveActor({}), { actorType: "unknown", actorUid: null });
    });
});

describe("audit/core — resolveTenant", () => {
    it("__docId__ usa o entityId como tenant, em qualquer operação", () => {
        const result = core.resolveTenant({ operation: "create", before: null, after: { x: 1 }, tenantField: "__docId__", entityId: "owner1" });
        assert.deepEqual(result, { ownerUid: "owner1", tenantMismatch: false });
    });

    it("create resolve pelo after", () => {
        const result = core.resolveTenant({ operation: "create", before: null, after: { criadoPor: "ownerA" }, tenantField: "criadoPor", entityId: "x" });
        assert.equal(result.ownerUid, "ownerA");
        assert.equal(result.tenantMismatch, false);
    });

    it("delete resolve pelo before", () => {
        const result = core.resolveTenant({ operation: "delete", before: { criadoPor: "ownerA" }, after: null, tenantField: "criadoPor", entityId: "x" });
        assert.equal(result.ownerUid, "ownerA");
    });

    it("update sem mudança de tenant não marca mismatch", () => {
        const result = core.resolveTenant({
            operation: "update",
            before: { criadoPor: "ownerA" },
            after: { criadoPor: "ownerA" },
            tenantField: "criadoPor",
            entityId: "x"
        });
        assert.equal(result.ownerUid, "ownerA");
        assert.equal(result.tenantMismatch, false);
    });

    it("update com tenant divergente marca tenantMismatch", () => {
        const result = core.resolveTenant({
            operation: "update",
            before: { criadoPor: "ownerA" },
            after: { criadoPor: "ownerB" },
            tenantField: "criadoPor",
            entityId: "x"
        });
        assert.equal(result.ownerUid, "ownerA");
        assert.equal(result.tenantMismatch, true);
    });

    it("array de campos (chats) usa o primeiro valor presente", () => {
        const result = core.resolveTenant({
            operation: "create",
            before: null,
            after: { emailDono: "ownerA" },
            tenantField: ["donoUID", "emailDono"],
            entityId: "chat1"
        });
        assert.equal(result.ownerUid, "ownerA");
    });

    it("sem tenant resolvível retorna null (evento deve ser descartado)", () => {
        const result = core.resolveTenant({ operation: "create", before: null, after: {}, tenantField: "criadoPor", entityId: "x" });
        assert.equal(result.ownerUid, null);
    });
});

describe("audit/core — safeEventId (idempotência)", () => {
    it("o mesmo event.id sempre produz o mesmo eventId (idempotente)", () => {
        assert.equal(core.safeEventId("abc-123"), core.safeEventId("abc-123"));
    });
    it("higieniza barras (nunca vira sub-caminho)", () => {
        assert.equal(core.safeEventId("a/b/c"), "a_b_c");
    });
    it("vazio retorna null", () => {
        assert.equal(core.safeEventId(""), null);
        assert.equal(core.safeEventId(null), null);
    });
});

describe("audit/core — defaults e buildAuditEvent", () => {
    it("defaultRiskForOperation", () => {
        assert.equal(core.defaultRiskForOperation("create"), "low");
        assert.equal(core.defaultRiskForOperation("update"), "medium");
        assert.equal(core.defaultRiskForOperation("delete"), "high");
    });

    it("buildAuditEvent monta o schema completo", () => {
        const event = core.buildAuditEvent({
            eventId: "e1",
            ownerUid: "ownerA",
            actorUid: "uid1",
            actorType: "user",
            module: "produtos",
            entityType: "produto",
            entityId: "p1",
            operation: "update",
            action: "produto.preco_alterado",
            risk: "medium",
            summary: "Preço alterado",
            changedFields: ["preco"],
            before: { preco: 10 },
            after: { preco: 20 },
            source: "firestore-trigger"
        });
        assert.equal(event.schemaVersion, 1);
        assert.equal(event.ownerUid, "ownerA");
        assert.equal(event.risk, "medium");
        assert.deepEqual(event.changedFields, ["preco"]);
    });

    it("buildAuditEvent rejeita risk inválido", () => {
        assert.throws(() => core.buildAuditEvent({
            eventId: "e1", ownerUid: "o", actorUid: null, actorType: "system",
            module: "m", entityType: "t", entityId: "1", operation: "create",
            action: "a", risk: "gigante", summary: "s", changedFields: [],
            before: {}, after: {}, source: "system"
        }), /risk inválido/);
    });

    it("buildAuditEvent rejeita operation inválida", () => {
        assert.throws(() => core.buildAuditEvent({
            eventId: "e1", ownerUid: "o", actorUid: null, actorType: "system",
            module: "m", entityType: "t", entityId: "1", operation: "patch",
            action: "a", risk: "low", summary: "s", changedFields: [],
            before: {}, after: {}, source: "system"
        }), /operation inválida/);
    });

    it("buildAuditEvent exige ownerUid", () => {
        assert.throws(() => core.buildAuditEvent({
            eventId: "e1", ownerUid: "", actorUid: null, actorType: "system",
            module: "m", entityType: "t", entityId: "1", operation: "create",
            action: "a", risk: "low", summary: "s", changedFields: [],
            before: {}, after: {}, source: "system"
        }), /ownerUid é obrigatório/);
    });
});
