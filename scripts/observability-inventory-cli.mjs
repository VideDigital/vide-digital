// VIDE-HUB-OBSERVABILITY-INVENTORY-PREP-053 — CLI do workflow
// .github/workflows/observability-inventory.yml. Só lê env e arquivos
// locais (saídas cruas já coletadas) e aplica as funções puras de
// scripts/observability-inventory-core.mjs. Nenhuma chamada de rede.
//
// Subcomandos:
//   inputs                     valida PROJECT_ID/EXPECTED_SHA/CONFIRMACAO
//   rest-urls                  imprime "fonte<TAB>url" dos GETs REST permitidos
//   build <rawDir> <saida.json> classifica cada fonte (<fonte>.code/.err/.json)
//                              e grava o artefato allowlisted
//   summary <artefato.json>    Step Summary + output result=PASS|PARTIAL
//
// O texto de erro (.err) só é usado para classificar a falha — nunca é
// impresso nem copiado para o artefato.
import { readFile, writeFile, appendFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
    validarEntradas,
    construirFontesRest,
    classificarFonte,
    construirInventario,
    resumoMarkdown,
    resultado,
    STATUS
} from "./observability-inventory-core.mjs";

async function lerOu(caminho, padrao = "") {
    try {
        return await readFile(caminho, "utf8");
    } catch {
        return padrao;
    }
}

function falhar(mensagens) {
    for (const m of mensagens) console.error(`::error::${m}`);
    process.exit(1);
}

export async function lerFontes(dir) {
    const nomes = (await readdir(dir)).filter((n) => n.endsWith(".code")).map((n) => n.slice(0, -".code".length));
    const fontes = {};
    for (const nome of nomes.sort()) {
        const codigo = (await lerOu(path.join(dir, `${nome}.code`))).trim();
        const bruto = await lerOu(path.join(dir, `${nome}.json`));
        let status = classificarFonte({ codigo, texto: `${await lerOu(path.join(dir, `${nome}.err`))}\n${codigo === "0" ? "" : bruto}` });
        let dados = null;
        if (status === STATUS.OK) {
            try {
                dados = bruto.trim() ? JSON.parse(bruto) : [];
            } catch {
                status = STATUS.ERROR;
            }
        }
        fontes[nome] = { status, dados };
    }
    return fontes;
}

async function main() {
    const [comando, arg1, arg2] = process.argv.slice(2);
    if (comando === "inputs") {
        const r = validarEntradas({
            projectId: process.env.PROJECT_ID,
            expectedSha: process.env.EXPECTED_SHA,
            confirmacao: process.env.CONFIRMACAO
        });
        if (!r.ok) falhar(r.erros);
        console.log("Entradas validadas (somente leitura).");
    } else if (comando === "rest-urls") {
        for (const { fonte, url } of construirFontesRest({ projectId: process.env.PROJECT_ID })) {
            console.log(`${fonte}\t${url}`);
        }
    } else if (comando === "build") {
        const inventario = construirInventario({ fontes: await lerFontes(arg1), workflowSha: process.env.WORKFLOW_SHA });
        await writeFile(arg2, JSON.stringify(inventario, null, 2));
        for (const [fonte, status] of Object.entries(inventario.metricCapabilities.sources)) console.log(`${fonte}: ${status}`);
    } else if (comando === "summary") {
        const inventario = JSON.parse(await readFile(arg1, "utf8"));
        const md = resumoMarkdown(inventario);
        console.log(md);
        if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, md);
        if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `result=${resultado(inventario)}\n`);
    } else {
        falhar([`Subcomando desconhecido: ${comando}`]);
    }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    await main();
}
