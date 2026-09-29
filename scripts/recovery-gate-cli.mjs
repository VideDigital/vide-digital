// VIDE-HUB-RECOVERY-AUTOMATION-PREP-049A — CLI dos gates do workflow
// .github/workflows/recovery-minimal-gate.yml. Só lê env/arquivos locais
// (saídas JSON do gcloud) e aplica as funções puras de
// scripts/recovery-gate-core.mjs. Nenhuma chamada de rede, nenhuma escrita
// fora de $GITHUB_OUTPUT e do arquivo de artefato pedido.
//
// Subcomandos:
//   inputs                         valida STAGE/PROJECT_ID/DATABASE_ID/QA_SLUG/CONFIRMACAO/EXPECTED_SHA
//   describe-check <describe.json> valida projeto/banco/location do describe
//   plan <antes.json>              flags ainda necessários (idempotente, nunca --no-*)
//   post <antes.json> <depois.json> exige PITR + delete protection e zero drift fora da allowlist
//   preflight-artifact <antes.json> <saida.json>
import { readFile, writeFile, appendFile } from "node:fs/promises";
import {
    validarEntradas,
    validarDescribe,
    estadoProtecoes,
    planejarEscrita,
    exigirProtecoesHabilitadas,
    avaliarDrift,
    construirArtefato,
    PROJECT_ID,
    DATABASE_ID
} from "./recovery-gate-core.mjs";

async function lerJson(caminho) {
    return JSON.parse(await readFile(caminho, "utf8"));
}

async function saida(chave, valor) {
    console.log(`${chave}=${valor}`);
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `${chave}=${valor}\n`);
}

function falhar(mensagens) {
    for (const m of mensagens) console.error(`::error::${m}`);
    process.exit(1);
}

const [comando, arg1, arg2] = process.argv.slice(2);

if (comando === "inputs") {
    const r = validarEntradas({
        stage: process.env.STAGE,
        projectId: process.env.PROJECT_ID,
        databaseId: process.env.DATABASE_ID,
        qaSlug: process.env.QA_SLUG,
        confirmacao: process.env.CONFIRMACAO,
        expectedSha: process.env.EXPECTED_SHA
    });
    if (!r.ok) falhar(r.erros);
    console.log("Entradas validadas.");
} else if (comando === "describe-check") {
    const describe = await lerJson(arg1);
    const r = validarDescribe(describe);
    if (!r.ok) falhar(r.erros);
    const { pitr, deleteProtection } = estadoProtecoes(describe);
    await saida("location", describe.locationId);
    await saida("pitr", pitr ? "ON" : "OFF");
    await saida("delete_protection", deleteProtection ? "ON" : "OFF");
} else if (comando === "plan") {
    const flags = planejarEscrita(await lerJson(arg1));
    await saida("flags", flags.join(" "));
    await saida("needs_update", flags.length > 0 ? "true" : "false");
} else if (comando === "post") {
    const antes = await lerJson(arg1);
    const depois = await lerJson(arg2);
    const erros = [...validarDescribe(depois).erros, ...exigirProtecoesHabilitadas(depois).erros];
    const drift = avaliarDrift(antes, depois);
    console.log(`Mudanças permitidas: ${drift.mudancasPermitidas.join(", ") || "nenhuma"}`);
    if (!drift.ok) erros.push(`Drift inesperado de configuração: ${drift.mudancasInesperadas.join(", ")}`);
    if (erros.length) falhar(erros);
    console.log("PITR e delete protection habilitados, sem drift fora da allowlist.");
} else if (comando === "preflight-artifact") {
    const antes = await lerJson(arg1);
    const { pitr, deleteProtection } = estadoProtecoes(antes);
    const artefato = construirArtefato({
        projectId: PROJECT_ID,
        databaseId: DATABASE_ID,
        locationId: antes.locationId ?? null,
        pitrBefore: pitr,
        deleteProtectionBefore: deleteProtection,
        versionRetentionPeriod: antes.versionRetentionPeriod ?? null,
        earliestVersionTime: antes.earliestVersionTime ?? null,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        workflowSha: process.env.WORKFLOW_SHA || null
    });
    await writeFile(arg2, JSON.stringify(artefato, null, 2));
    console.log("Artefato de preflight gravado.");
} else {
    falhar([`Subcomando desconhecido: ${JSON.stringify(comando)}`]);
}
