// VIDE-HUB-RECOVERY-AUTOMATION-PREP-049A — drill seletivo de recovery.
//
// Prova, no tenant QA oficial (vide-hub-qa-testes) e SOMENTE num documento
// técnico recovery_drills/RECOVERY-DRILL-049-<ms>, que o Firestore devolve
// a versão ORIGINAL por leitura histórica (read-only transaction com
// readTime = T0 do servidor) depois de uma mutação controlada, e que o
// write-back seletivo (só tenantId/marker/drillId) restaura o original.
//
// A coleção recovery_drills não existe no produto: nenhuma Rule a libera
// (cai no catch-all `allow read, write: if false`) e nenhum trigger de
// Functions a observa (tests/recovery-gate-core.test.mjs verifica as duas
// coisas no código). Só o Admin SDK acessa.
//
// Nunca apaga coleção, nunca usa wildcard: o cleanup (em finally, mesmo em
// falha) remove apenas o documento criado por ESTA execução.
//
// Uso no workflow (.github/workflows/recovery-minimal-gate.yml), com ADC do
// google-github-actions/auth:
//   PROJECT_ID=... DATABASE_ID=... QA_SLUG=... WORKFLOW_SHA=... \
//   BEFORE_JSON=... AFTER_JSON=... ARTIFACT_PATH=... node scripts/recovery-drill-049.mjs
import { writeFile, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
    PROJECT_ID,
    DATABASE_ID,
    QA_SLUG,
    DRILL_COLLECTION,
    MARKER_ORIGINAL,
    MARKER_MUTATED,
    resolverTenantQa,
    criarDrillId,
    caminhoDrill,
    validarCaminhoDrill,
    construirFixtureOriginal,
    selecionarCamposRestauraveis,
    avaliarProvaCritica,
    compararColecaoDrill,
    estadoProtecoes,
    construirArtefato
} from "./recovery-gate-core.mjs";

// Leitura histórica oficial do Server SDK: transação read-only com readTime.
export async function lerHistoricoFirestore(ref, readTime) {
    const snap = await ref.firestore.runTransaction((tx) => tx.get(ref), { readOnly: true, readTime });
    return snap.exists ? snap.data() : null;
}

// Mapa id → updateTime (ISO) da coleção técnica, sem ler conteúdo (select()).
async function fotografarColecao(db) {
    const snap = await db.collection(DRILL_COLLECTION).select().get();
    return Object.fromEntries(snap.docs.map((d) => [d.id, d.updateTime.toDate().toISOString()]));
}

export async function executarDrill({
    db,
    serverTimestamp,
    agoraMs = () => Date.now(),
    lerHistorico = lerHistoricoFirestore,
    log = (etapa, dados = {}) => console.log(JSON.stringify({ etapa, ...dados })),
    antesDaMutacao = async () => {}
}) {
    const resultado = {
        drillId: null,
        historicalReadPassed: false,
        writeBackPassed: false,
        isolationPassed: false,
        cleanupPassed: false,
        observedRtoMs: null,
        startedAt: new Date(agoraMs()).toISOString(),
        finishedAt: null,
        erro: null
    };
    let ref = null;
    let criado = false;

    try {
        const vitrine = await db.doc(`vitrines_publicas/${QA_SLUG}`).get();
        const tenantId = resolverTenantQa(vitrine.exists, vitrine.data());
        log("tenant-qa", { resolvido: true });

        const colecaoAntes = await fotografarColecao(db);

        const drillId = criarDrillId(agoraMs());
        resultado.drillId = drillId;
        ref = db.doc(caminhoDrill(drillId));
        validarCaminhoDrill(ref.path);

        // ESTADO ORIGINAL — create() falha se o documento já existir.
        await ref.create({ ...construirFixtureOriginal({ tenantId, drillId }), createdAt: serverTimestamp() });
        criado = true;
        const s0 = await ref.get();
        if (s0.data()?.marker !== MARKER_ORIGINAL || s0.data()?.tenantId !== tenantId) throw new Error("Fixture original não confirmada pelo servidor.");
        const t0 = s0.readTime; // readTime do SERVIDOR, nunca relógio do runner
        log("t0", { drillId, t0: t0.toDate().toISOString() });

        await antesDaMutacao();

        // MUTAÇÃO — só este documento, só o marker.
        validarCaminhoDrill(ref.path);
        await ref.update({ marker: MARKER_MUTATED });

        // PROVA CRÍTICA — atual mutado E histórico @T0 original, ambos do Firestore.
        const atual = (await ref.get()).data();
        const historico = await lerHistorico(ref, t0);
        const prova = avaliarProvaCritica({ atual, historico });
        log("prova-critica", { atualMutado: prova.atualMutado, historicoOriginal: prova.historicoOriginal });
        if (!prova.ok) throw new Error("Prova crítica falhou — write-back NÃO executado.");
        resultado.historicalReadPassed = true;

        // RECOVERY SELETIVO — allowlist de campos, lidos do histórico.
        const inicioRecovery = agoraMs();
        const restauravel = selecionarCamposRestauraveis(historico, { tenantId, drillId });
        validarCaminhoDrill(ref.path);
        await ref.update(restauravel);
        const pos = (await ref.get()).data();
        resultado.writeBackPassed = pos?.marker === MARKER_ORIGINAL && pos?.tenantId === tenantId && pos?.drillId === drillId;
        resultado.observedRtoMs = agoraMs() - inicioRecovery;
        log("write-back", { passou: resultado.writeBackPassed, observedRtoMs: resultado.observedRtoMs });
        if (!resultado.writeBackPassed) throw new Error("Estado pós-recovery diferente do original.");

        // ISOLAMENTO — nada mais na coleção técnica mudou.
        const isolamento = compararColecaoDrill(colecaoAntes, await fotografarColecao(db), drillId);
        resultado.isolationPassed = isolamento.ok;
        log("isolamento", { passou: isolamento.ok, alterados: isolamento.alterados.length });
        if (!isolamento.ok) throw new Error("Outros documentos de recovery_drills mudaram durante o drill.");
    } catch (erro) {
        resultado.erro = String(erro?.message || erro);
        log("falha", { erro: resultado.erro });
    } finally {
        // CLEANUP — somente o documento criado por esta execução.
        if (criado && ref) {
            try {
                validarCaminhoDrill(ref.path);
                await ref.delete();
                resultado.cleanupPassed = !(await ref.get()).exists;
            } catch (erroCleanup) {
                resultado.cleanupPassed = false;
                log("cleanup-falhou", { drillId: resultado.drillId, erro: String(erroCleanup?.message || erroCleanup) });
            }
            log("cleanup", { passou: resultado.cleanupPassed, drillId: resultado.drillId });
        }
        resultado.finishedAt = new Date(agoraMs()).toISOString();
    }
    return resultado;
}

export function drillPassou(resultado) {
    return resultado.historicalReadPassed && resultado.writeBackPassed && resultado.isolationPassed && !resultado.erro;
}

async function main() {
    const { PROJECT_ID: projectId, DATABASE_ID: databaseId, QA_SLUG: qaSlug } = process.env;
    if (projectId !== PROJECT_ID || databaseId !== DATABASE_ID || qaSlug !== QA_SLUG) {
        throw new Error("PROJECT_ID/DATABASE_ID/QA_SLUG fora da allowlist — drill abortado.");
    }
    const { initializeApp, applicationDefault } = await import("firebase-admin/app");
    const { getFirestore, FieldValue } = await import("firebase-admin/firestore");
    const db = getFirestore(initializeApp({ credential: applicationDefault(), projectId }));

    const resultado = await executarDrill({ db, serverTimestamp: () => FieldValue.serverTimestamp() });

    const antes = JSON.parse(await readFile(process.env.BEFORE_JSON, "utf8"));
    const depois = JSON.parse(await readFile(process.env.AFTER_JSON, "utf8"));
    const protecoesAntes = estadoProtecoes(antes);
    const protecoesDepois = estadoProtecoes(depois);
    const artefato = construirArtefato({
        projectId,
        databaseId,
        locationId: depois.locationId,
        pitrBefore: protecoesAntes.pitr,
        pitrAfter: protecoesDepois.pitr,
        deleteProtectionBefore: protecoesAntes.deleteProtection,
        deleteProtectionAfter: protecoesDepois.deleteProtection,
        versionRetentionPeriod: depois.versionRetentionPeriod ?? null,
        earliestVersionTime: depois.earliestVersionTime ?? null,
        drillId: resultado.drillId,
        historicalReadPassed: resultado.historicalReadPassed,
        writeBackPassed: resultado.writeBackPassed && resultado.isolationPassed,
        cleanupPassed: resultado.cleanupPassed,
        observedRtoMs: resultado.observedRtoMs,
        startedAt: resultado.startedAt,
        finishedAt: resultado.finishedAt,
        workflowSha: process.env.WORKFLOW_SHA || null
    });
    await writeFile(process.env.ARTIFACT_PATH, JSON.stringify(artefato, null, 2));

    if (!drillPassou(resultado)) {
        console.error(`DRILL 049: FAIL — ${resultado.erro}`);
        process.exitCode = 1;
    } else if (!resultado.cleanupPassed) {
        console.error(`DRILL 049: RECOVERY PASS, CLEANUP FAIL — fixture órfã ${resultado.drillId}`);
        process.exitCode = 1;
    } else {
        console.log("DRILL 049: RECOVERY PASS + CLEANUP PASS");
    }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    main().catch((erro) => {
        console.error(`DRILL 049: FAIL — ${erro?.message || erro}`);
        process.exitCode = 1;
    });
}
