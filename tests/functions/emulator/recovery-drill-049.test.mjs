// VIDE-HUB-RECOVERY-AUTOMATION-PREP-049A — o executor REAL do drill
// (scripts/recovery-drill-049.mjs) contra o Firestore Emulator: original →
// mutado → leitura histórica (read-only transaction com readTime, suportada
// pelo Emulator) → write-back seletivo → original → cleanup. Também prova
// as barreiras: prova crítica falha sem write-back, tenant ausente não
// escreve nada, isolamento detecta outro documento alterado e o drill
// nunca sobrescreve nem apaga documento que não criou.
import assert from "node:assert/strict";
import { test } from "node:test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { executarDrill, drillPassou } from "../../../scripts/recovery-drill-049.mjs";

assert.match(process.env.FIRESTORE_EMULATOR_HOST || "", /^(127\.0\.0\.1|localhost):\d+$/, "Emulator only; never production");

const silencioso = () => {};
const serverTimestamp = () => FieldValue.serverTimestamp();

test("drill 049 no Emulator: recovery seletivo, barreiras e cleanup restrito", async () => {
    const app = initializeApp({ projectId: "demo-vide-hub" }, "recovery-drill-049");
    const db = getFirestore(app);
    const vitrine = db.doc("vitrines_publicas/vide-hub-qa-testes");
    const sentinela = db.doc("recovery_drills/RECOVERY-DRILL-049-1111111111111");
    const outroTenant = db.doc("produtos/recovery-drill-sentinela-outro-tenant");

    try {
        await vitrine.set({ donoUID: "qa-uid-drill-049" });
        await sentinela.set({ marker: "SENTINELA", tenantId: "qa-uid-drill-049", drillId: "RECOVERY-DRILL-049-1111111111111" });
        await outroTenant.set({ criadoPor: "outro-tenant", nome: "não tocar" });
        const sentinelaAntes = (await sentinela.get()).updateTime.toMillis();
        const outroAntes = (await outroTenant.get()).updateTime.toMillis();

        // ===== Caminho feliz =====
        const ok = await executarDrill({ db, serverTimestamp, log: silencioso });
        assert.equal(ok.erro, null);
        assert.equal(ok.historicalReadPassed, true, "leitura histórica @T0 devolveu o ORIGINAL");
        assert.equal(ok.writeBackPassed, true);
        assert.equal(ok.isolationPassed, true);
        assert.equal(ok.cleanupPassed, true);
        assert.equal(drillPassou(ok), true);
        assert.ok(Number.isInteger(ok.observedRtoMs) && ok.observedRtoMs >= 0);
        assert.match(ok.drillId, /^RECOVERY-DRILL-049-\d{13}$/);
        assert.equal((await db.doc(`recovery_drills/${ok.drillId}`).get()).exists, false, "fixture removida no cleanup");
        assert.equal((await sentinela.get()).updateTime.toMillis(), sentinelaAntes, "outro documento de recovery_drills intacto");
        assert.equal((await outroTenant.get()).updateTime.toMillis(), outroAntes, "documento de outro tenant intacto");

        // ===== Prova crítica falha → NENHUM write-back, cleanup mesmo assim =====
        let historicoConsultado = false;
        const falhaProva = await executarDrill({
            db, serverTimestamp, log: silencioso,
            lerHistorico: async (ref) => { historicoConsultado = true; return (await ref.get()).data(); } // devolve o atual (MUTATED)
        });
        assert.equal(historicoConsultado, true);
        assert.equal(falhaProva.historicalReadPassed, false);
        assert.equal(falhaProva.writeBackPassed, false);
        assert.match(falhaProva.erro, /Prova crítica falhou/);
        assert.equal(falhaProva.cleanupPassed, true);
        assert.equal((await db.doc(`recovery_drills/${falhaProva.drillId}`).get()).exists, false);
        assert.equal(drillPassou(falhaProva), false);

        // ===== Isolamento: outro documento de recovery_drills alterado durante o drill =====
        const falhaIsolamento = await executarDrill({
            db, serverTimestamp, log: silencioso,
            antesDaMutacao: () => sentinela.update({ marker: "SENTINELA-ALTERADA" })
        });
        assert.equal(falhaIsolamento.isolationPassed, false);
        assert.match(falhaIsolamento.erro, /Outros documentos de recovery_drills mudaram/);
        assert.equal(falhaIsolamento.cleanupPassed, true);
        assert.equal((await sentinela.get()).exists, true, "cleanup nunca apaga documento que o drill não criou");

        // ===== Colisão de id: nunca sobrescreve nem apaga documento pré-existente =====
        const colisao = await executarDrill({ db, serverTimestamp, log: silencioso, agoraMs: () => 1111111111111 });
        assert.ok(colisao.erro, "create() recusa id existente");
        assert.equal(colisao.cleanupPassed, false, "nada criado → nada limpo");
        assert.equal((await sentinela.get()).data().marker, "SENTINELA-ALTERADA", "documento pré-existente não sobrescrito");

        // ===== Tenant QA ausente → nenhuma escrita =====
        await vitrine.delete();
        const antesTenant = (await db.collection("recovery_drills").select().get()).size;
        const semTenant = await executarDrill({ db, serverTimestamp, log: silencioso });
        assert.match(semTenant.erro, /Tenant QA .* não resolvido/);
        assert.equal(semTenant.drillId, null);
        assert.equal((await db.collection("recovery_drills").select().get()).size, antesTenant, "nenhum documento criado sem tenant QA");
    } finally {
        await sentinela.delete().catch(() => {});
        await outroTenant.delete().catch(() => {});
        await vitrine.delete().catch(() => {});
        await deleteApp(app);
    }
});
