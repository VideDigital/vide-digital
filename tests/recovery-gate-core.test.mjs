// VIDE-HUB-RECOVERY-AUTOMATION-PREP-049A — testes puros do gate de recovery
// (scripts/recovery-gate-core.mjs) e das premissas de código do drill.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
    PROJECT_ID, DATABASE_ID, QA_SLUG, DRILL_COLLECTION, MARKER_ORIGINAL, MARKER_MUTATED,
    CAMPOS_RESTAURAVEIS, CHAVES_ARTEFATO,
    validarEntradas, validarDescribe, databaseIdDoNome, estadoProtecoes, planejarEscrita,
    avaliarDrift, exigirProtecoesHabilitadas, resolverTenantQa, criarDrillId, caminhoDrill,
    validarCaminhoDrill, construirFixtureOriginal, selecionarCamposRestauraveis,
    avaliarProvaCritica, compararColecaoDrill, construirArtefato
} from "../scripts/recovery-gate-core.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHA = "e45dc9d250682af1dba70a5983117608b1f2f555";
const entradasValidas = (extra = {}) => ({
    stage: "preflight", projectId: PROJECT_ID, databaseId: DATABASE_ID, qaSlug: QA_SLUG,
    confirmacao: "READ_ONLY", expectedSha: SHA, ...extra
});
const describeBase = (extra = {}) => ({
    name: "projects/vide-digital-saas/databases/(default)",
    locationId: "southamerica-east1",
    type: "FIRESTORE_NATIVE",
    concurrencyMode: "PESSIMISTIC",
    appEngineIntegrationMode: "DISABLED",
    pointInTimeRecoveryEnablement: "POINT_IN_TIME_RECOVERY_DISABLED",
    deleteProtectionState: "DELETE_PROTECTION_DISABLED",
    versionRetentionPeriod: "3600s",
    earliestVersionTime: "2026-09-29T10:00:00Z",
    updateTime: "2026-01-01T00:00:00Z",
    ...extra
});

describe("validarEntradas — projeto, banco, slug, SHA e confirmação por stage", () => {
    it("aceita preflight/READ_ONLY e enable-and-drill/ENABLE_RECOVERY_049", () => {
        assert.equal(validarEntradas(entradasValidas()).ok, true);
        assert.equal(validarEntradas(entradasValidas({ stage: "enable-and-drill", confirmacao: "ENABLE_RECOVERY_049" })).ok, true);
    });
    for (const [nome, extra] of [
        ["projeto errado", { projectId: "outro-projeto" }],
        ["banco errado", { databaseId: "qa" }],
        ["slug de outro tenant", { qaSlug: "loja-real" }],
        ["SHA curto", { expectedSha: "e45dc9d" }],
        ["SHA maiúsculo", { expectedSha: SHA.toUpperCase() }],
        ["stage desconhecido", { stage: "restore" }],
        ["confirmação de escrita no preflight", { confirmacao: "ENABLE_RECOVERY_049" }],
        ["confirmação de leitura no enable", { stage: "enable-and-drill", confirmacao: "READ_ONLY" }]
    ]) {
        it(`rejeita ${nome}`, () => assert.equal(validarEntradas(entradasValidas(extra)).ok, false));
    }
});

describe("describe / plano / drift", () => {
    it("extrai projeto e banco do name e rejeita outro banco/projeto", () => {
        assert.deepEqual(databaseIdDoNome("projects/vide-digital-saas/databases/(default)"), { projectId: "vide-digital-saas", databaseId: "(default)" });
        assert.equal(validarDescribe(describeBase()).ok, true);
        assert.equal(validarDescribe(describeBase({ name: "projects/vide-digital-saas/databases/outro" })).ok, false);
        assert.equal(validarDescribe(describeBase({ name: "projects/outro/databases/(default)" })).ok, false);
        assert.equal(validarDescribe(describeBase({ locationId: "" })).ok, false);
    });

    it("plano idempotente: só flags pendentes, nunca --no-*", () => {
        assert.deepEqual(planejarEscrita(describeBase()), ["--delete-protection", "--enable-pitr"]);
        assert.deepEqual(planejarEscrita(describeBase({ deleteProtectionState: "DELETE_PROTECTION_ENABLED" })), ["--enable-pitr"]);
        const ambos = describeBase({ deleteProtectionState: "DELETE_PROTECTION_ENABLED", pointInTimeRecoveryEnablement: "POINT_IN_TIME_RECOVERY_ENABLED" });
        assert.deepEqual(planejarEscrita(ambos), []);
        assert.ok(planejarEscrita(describeBase()).every((f) => !f.startsWith("--no-")));
    });

    it("drift: só PITR/delete protection/retenção/earliest/updateTime podem mudar", () => {
        const depois = describeBase({
            pointInTimeRecoveryEnablement: "POINT_IN_TIME_RECOVERY_ENABLED",
            deleteProtectionState: "DELETE_PROTECTION_ENABLED",
            versionRetentionPeriod: "604800s",
            earliestVersionTime: "2026-09-29T10:05:00Z",
            updateTime: "2026-09-29T10:05:00Z"
        });
        const ok = avaliarDrift(describeBase(), depois);
        assert.equal(ok.ok, true);
        for (const campo of ["type", "locationId", "concurrencyMode", "appEngineIntegrationMode", "cmekConfig", "databaseEdition"]) {
            const r = avaliarDrift(describeBase(), { ...depois, [campo]: "MUDOU" });
            assert.equal(r.ok, false, campo);
            assert.ok(r.mudancasInesperadas.includes(campo));
        }
        assert.equal(exigirProtecoesHabilitadas(depois).ok, true);
        assert.equal(exigirProtecoesHabilitadas(describeBase()).ok, false);
        assert.deepEqual(estadoProtecoes(depois), { pitr: true, deleteProtection: true });
    });
});

describe("drill — allowlists de tenant, path, campos e artefato", () => {
    it("tenant QA só a partir do donoUID da vitrine oficial", () => {
        assert.equal(resolverTenantQa(true, { donoUID: "uid-qa" }), "uid-qa");
        assert.throws(() => resolverTenantQa(false, {}));
        assert.throws(() => resolverTenantQa(true, { donoUID: "" }));
        assert.throws(() => resolverTenantQa(true, { donoUID: "a/b" }));
        assert.throws(() => resolverTenantQa(true, { emailDono: "x" }));
    });

    it("path: só recovery_drills/RECOVERY-DRILL-049-<13 dígitos>", () => {
        const id = criarDrillId(1790700000000);
        assert.equal(caminhoDrill(id), `recovery_drills/RECOVERY-DRILL-049-1790700000000`);
        for (const ruim of [
            "recovery_drills", "recovery_drills/*", "recovery_drills/RECOVERY-DRILL-049-",
            "recovery_drills/RECOVERY-DRILL-050-1790700000000", "produtos/RECOVERY-DRILL-049-1790700000000",
            "recovery_drills/RECOVERY-DRILL-049-1790700000000/sub/x", "../recovery_drills/RECOVERY-DRILL-049-1790700000000", null
        ]) {
            assert.throws(() => validarCaminhoDrill(ruim), undefined, String(ruim));
        }
        assert.throws(() => criarDrillId(123));
    });

    it("fixture mínima sem PII: só tenantId, marker e drillId", () => {
        assert.deepEqual(Object.keys(construirFixtureOriginal({ tenantId: "t", drillId: "d" })).sort(), ["drillId", "marker", "tenantId"]);
    });

    it("write-back seletivo: só a allowlist, só do mesmo tenant/drill/original", () => {
        const hist = { tenantId: "t", drillId: "d", marker: MARKER_ORIGINAL, createdAt: "x", extra: "nunca" };
        assert.deepEqual(selecionarCamposRestauraveis(hist, { tenantId: "t", drillId: "d" }), { tenantId: "t", marker: MARKER_ORIGINAL, drillId: "d" });
        assert.deepEqual(CAMPOS_RESTAURAVEIS, ["tenantId", "marker", "drillId"]);
        assert.throws(() => selecionarCamposRestauraveis({ ...hist, tenantId: "outro" }, { tenantId: "t", drillId: "d" }));
        assert.throws(() => selecionarCamposRestauraveis({ ...hist, drillId: "outro" }, { tenantId: "t", drillId: "d" }));
        assert.throws(() => selecionarCamposRestauraveis({ ...hist, marker: MARKER_MUTATED }, { tenantId: "t", drillId: "d" }));
        assert.throws(() => selecionarCamposRestauraveis(null, { tenantId: "t", drillId: "d" }));
    });

    it("prova crítica exige atual MUTATED e histórico ORIGINAL ao mesmo tempo", () => {
        assert.equal(avaliarProvaCritica({ atual: { marker: MARKER_MUTATED }, historico: { marker: MARKER_ORIGINAL } }).ok, true);
        assert.equal(avaliarProvaCritica({ atual: { marker: MARKER_ORIGINAL }, historico: { marker: MARKER_ORIGINAL } }).ok, false);
        assert.equal(avaliarProvaCritica({ atual: { marker: MARKER_MUTATED }, historico: { marker: MARKER_MUTATED } }).ok, false);
        assert.equal(avaliarProvaCritica({ atual: { marker: MARKER_MUTATED }, historico: null }).ok, false);
    });

    it("isolamento: qualquer outro documento de recovery_drills que mude reprova", () => {
        const antes = { a: "t1", b: "t2" };
        assert.equal(compararColecaoDrill(antes, { a: "t1", b: "t2", d: "t9" }, "d").ok, true);
        assert.deepEqual(compararColecaoDrill(antes, { a: "t1", b: "t3" }, "d").alterados, ["b"]);
        assert.deepEqual(compararColecaoDrill(antes, { a: "t1" }, "d").alterados, ["b"]);
        assert.deepEqual(compararColecaoDrill(antes, { a: "t1", b: "t2", z: "t0" }, "d").alterados, ["z"]);
    });

    it("artefato: só chaves permitidas, só primitivos, sem conteúdo/tenant", () => {
        const art = construirArtefato({ projectId: PROJECT_ID, drillId: "d", tenantId: "nunca", conteudo: "nunca" });
        assert.deepEqual(Object.keys(art), [...CHAVES_ARTEFATO]);
        assert.ok(!("tenantId" in art) && !("conteudo" in art));
        assert.throws(() => construirArtefato({ drillId: { secreto: true } }));
    });
});

describe("premissas de código do drill", () => {
    const rules = readFileSync(path.join(RAIZ, "firestore.rules"), "utf8");

    it("firestore.rules não libera recovery_drills e termina com catch-all deny", () => {
        assert.ok(!rules.includes(DRILL_COLLECTION));
        assert.match(rules, /match \/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}\s*\}\s*\}\s*$/);
    });

    it("nenhum trigger de Functions observa recovery_drills nem usa wildcard de coleção raiz", () => {
        const arquivos = [];
        const andar = (dir) => {
            for (const nome of readdirSync(dir)) {
                if (nome === "node_modules") continue;
                const p = path.join(dir, nome);
                if (statSync(p).isDirectory()) andar(p);
                else if (p.endsWith(".js")) arquivos.push(p);
            }
        };
        andar(path.join(RAIZ, "functions", "src"));
        for (const arquivo of arquivos) {
            const fonte = readFileSync(arquivo, "utf8");
            assert.ok(!fonte.includes(DRILL_COLLECTION), `${arquivo} referencia ${DRILL_COLLECTION}`);
            assert.doesNotMatch(fonte, /document:\s*["'`]\{[^}]+\}\//, `${arquivo} tem trigger com coleção wildcard`);
        }
        const triggers = readFileSync(path.join(RAIZ, "functions/src/audit/triggers.js"), "utf8");
        assert.doesNotMatch(triggers, /\{[a-zA-Z]+\}\/\{[a-zA-Z]+\}/, "trigger de auditoria com wildcard de coleção");
    });

    it("o script do drill nunca apaga coleção nem usa wildcard", () => {
        const fonte = readFileSync(path.join(RAIZ, "scripts/recovery-drill-049.mjs"), "utf8");
        assert.doesNotMatch(fonte, /recursiveDelete|listCollections|\.batch\(|BulkWriter|bulkWriter/);
        assert.match(fonte, /validarCaminhoDrill\(ref\.path\);\s*await ref\.delete\(\);/);
        assert.doesNotMatch(fonte, /collection\([^)]*\)\.(doc\(\)\.)?delete/);
    });
});
