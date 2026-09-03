// PAGES-EXACT-SHA-QUALITY-GATE-IMPLEMENTATION — wrapper de CLI.
//
// Uso (dentro do job "validar" de .github/workflows/pages-publish.yml,
// já depois de o SHA ter sido confirmado como a main atual via
// actions/github-script, ANTES de qualquer checkout):
//   EXPECTED_SHA=<40 hex chars> GITHUB_TOKEN=<token> node scripts/pages-qg-gate.mjs
//
// GITHUB_REPOSITORY é injetado automaticamente pelo GitHub Actions
// ("owner/repo") — não precisa ser passado manualmente.
//
// Fail-closed: qualquer erro de rede, resposta inesperada da API, SHA
// ausente/malformado, run do Quality Gate ausente/errado, ou job
// faltando/extra/vermelho encerra o processo com código de saída 1 —
// nunca publica com uma checagem incompleta ou ambígua.
//
// Nunca interpola input do usuário direto em texto de shell/JS — lê tudo
// de process.env, preenchido pelo workflow via `env:` (nunca via
// `${{ inputs.sha }}` dentro de um `script:` de github-script, que seria
// injeção de código).
//
// PAGES-QG-GATE-TRANSIENT-EMPTY-HOTFIX: o run 33736878096 comprovou um
// falso negativo real — o Quality Gate correto (33708630578) existia,
// completed/success, no SHA exato, e esta mesma consulta devolveu vazio
// naquela execução específica (sem nenhum erro HTTP), mas encontrou o
// run correto minutos depois com os mesmos filtros. A causa exata não
// foi comprovável a partir dos logs disponíveis (ver relatório da
// missão PAGES-QG-GATE-TRANSIENT-EMPTY-AUDIT). Este arquivo agora:
//   1. filtra a query de runs também por head_sha=<SHA exato>, além de
//      branch/event/status (reduz volume/superfície de inconsistência —
//      NUNCA substitui a revalidação em memória de
//      selecionarRunAprovado(), que continua soberana);
//   2. exige shape estrito da resposta 200 da API (extrairArrayObrigatorio)
//      — uma chave ausente/errada nunca mais vira "lista vazia" silenciosa;
//   3. faz retry bounded (3 tentativas, backoff 5s/10s) SOMENTE quando a
//      API devolve ZERO runs brutos — nunca quando um run foi encontrado
//      mas rejeitado por um motivo concreto (SHA errado, branch/evento
//      errados, ambíguo, vermelho, incompleto), nem quando a API responde
//      com erro HTTP/shape inesperado — esses continuam falhando fechado
//      imediatamente, sem nenhuma tentativa adicional;
//   4. revalida o HEAD atual de main (TOCTOU) antes de cada retry —
//      fecha a janela aberta pelo próprio retry, sem depender só dos
//      guards que já existem nos jobs preparar/publicar;
//   5. loga observabilidade read-safe (página, status HTTP, total_count,
//      tamanho da página, até 5 runs recebidos com id/head_sha/
//      head_branch/event/status/conclusion/run_attempt) — nunca loga
//      Authorization/GITHUB_TOKEN.
import {
    EXPECTED_JOB_NAMES,
    MAX_TENTATIVAS,
    validarFormatoSha,
    extrairArrayObrigatorio,
    avaliarGateComRetry,
    construirUrlRunsQG,
    construirUrlJobsDoRun
} from "./pages-qg-gate-core.mjs";

const MAX_PAGINAS = 20;

function headersAutenticados(token) {
    return {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
    };
}

// Busca todas as páginas de um endpoint de lista da API do GitHub,
// exigindo shape estrito (extrairArrayObrigatorio) em cada página — uma
// resposta 200 com a chave esperada ausente/não-array falha
// explicitamente, nunca vira lista vazia silenciosa.
async function fetchArrayPaginado(baseUrl, token, chaveEsperada, logPagina) {
    const resultados = [];
    let pagina = 1;
    while (pagina <= MAX_PAGINAS) {
        const separador = baseUrl.includes("?") ? "&" : "?";
        const url = `${baseUrl}${separador}per_page=100&page=${pagina}`;
        const resposta = await fetch(url, { headers: headersAutenticados(token) });
        if (!resposta.ok) {
            const corpoErro = await resposta.text().catch(() => "");
            throw new Error(`GitHub API respondeu ${resposta.status} ${resposta.statusText} para ${baseUrl} — ${corpoErro.slice(0, 500)}`);
        }
        let corpo;
        try {
            corpo = await resposta.json();
        } catch {
            throw new Error(`GitHub API respondeu 200 para ${baseUrl}, mas o corpo não é JSON válido.`);
        }
        const extraido = extrairArrayObrigatorio(corpo, chaveEsperada);
        if (!extraido.ok) {
            throw new Error(`${extraido.motivo} (url: ${baseUrl})`);
        }
        if (typeof logPagina === "function") {
            logPagina({ pagina, status: resposta.status, totalCount: extraido.totalCount, tamanhoPagina: extraido.itens.length });
        }
        resultados.push(...extraido.itens);
        if (extraido.itens.length < 100) return resultados;
        pagina += 1;
    }
    throw new Error(`paginação excedeu o limite de segurança de ${MAX_PAGINAS} páginas em ${baseUrl} — resposta inesperada da API`);
}

// Revalidação TOCTOU: lê o HEAD atual de main direto da API (sem
// checkout) — mesmo padrão já usado nos steps "Revalidar que main ainda
// é o SHA autorizado" do workflow, só que aqui é chamado internamente
// pelo orquestrador de retry, antes de cada nova tentativa.
async function getMainSha(repo, token) {
    const resposta = await fetch(`https://api.github.com/repos/${repo}/branches/main`, {
        headers: headersAutenticados(token)
    });
    if (!resposta.ok) {
        const corpoErro = await resposta.text().catch(() => "");
        throw new Error(`GitHub API respondeu ${resposta.status} ${resposta.statusText} ao revalidar main — ${corpoErro.slice(0, 500)}`);
    }
    let corpo;
    try {
        corpo = await resposta.json();
    } catch {
        throw new Error("GitHub API respondeu 200 ao revalidar main, mas o corpo não é JSON válido.");
    }
    if (!corpo || typeof corpo !== "object" || !corpo.commit || typeof corpo.commit.sha !== "string") {
        throw new Error("GitHub API respondeu 200 ao revalidar main, mas shape inesperado (commit.sha ausente).");
    }
    return corpo.commit.sha;
}

function dormirReal(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
    const expectedSha = process.env.EXPECTED_SHA;
    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPOSITORY;

    if (!token) throw new Error("GITHUB_TOKEN ausente no ambiente");
    if (!repo || !repo.includes("/")) throw new Error(`GITHUB_REPOSITORY inválido: ${JSON.stringify(repo)}`);

    const formato = validarFormatoSha(expectedSha);
    if (!formato.ok) throw new Error(formato.motivo);

    console.log(`[pages-qg-gate] validando Quality Gate exato para sha=${expectedSha} repo=${repo}`);

    const resultado = await avaliarGateComRetry({
        expectedSha,
        buscarRunsAprovados: async () => {
            const url = construirUrlRunsQG(repo, expectedSha);
            const runs = await fetchArrayPaginado(url, token, "workflow_runs", ({ pagina, status, totalCount, tamanhoPagina }) => {
                console.log(`[pages-qg-gate] runs: page=${pagina} http=${status} total_count=${totalCount ?? "?"} recebidos_nesta_pagina=${tamanhoPagina}`);
            });
            const amostra = runs.slice(0, 5).map((r) => ({
                id: r.id,
                head_sha: r.head_sha,
                head_branch: r.head_branch,
                event: r.event,
                status: r.status,
                conclusion: r.conclusion,
                run_attempt: r.run_attempt
            }));
            console.log(`[pages-qg-gate] runs recebidos=${runs.length} amostra=${JSON.stringify(amostra)}`);
            return runs;
        },
        buscarJobsDoRun: async (runId) => {
            const url = construirUrlJobsDoRun(repo, runId);
            const jobs = await fetchArrayPaginado(url, token, "jobs", ({ pagina, status, totalCount, tamanhoPagina }) => {
                console.log(`[pages-qg-gate] jobs: page=${pagina} http=${status} total_count=${totalCount ?? "?"} recebidos_nesta_pagina=${tamanhoPagina}`);
            });
            console.log(`[pages-qg-gate] jobs recebidos=${jobs.length} estado=${JSON.stringify(jobs.map((j) => `${j.name}=${j.status}/${j.conclusion}`))}`);
            return jobs;
        },
        obterHeadAtualDeMain: async () => {
            const sha = await getMainSha(repo, token);
            console.log(`[pages-qg-gate] revalidação TOCTOU antes do retry: HEAD atual de main = ${sha}`);
            return sha;
        },
        dormir: dormirReal,
        aoTentar: ({ tentativa, totalRunsRecebidos }) => {
            console.log(`[pages-qg-gate] tentativa ${tentativa}/${MAX_TENTATIVAS}: ${totalRunsRecebidos} run(s) recebido(s) da API para este sha.`);
        }
    });

    if (!resultado.ok) {
        const sufixoReason = resultado.reasonCode ? ` [reasonCode=${resultado.reasonCode}]` : "";
        const sufixoCandidatos = resultado.candidatos ? ` — candidatos: ${JSON.stringify(resultado.candidatos)}` : "";
        throw new Error(`${resultado.motivo}${sufixoReason}${sufixoCandidatos}`);
    }

    console.log(`[pages-qg-gate] run do Quality Gate selecionado: id=${resultado.run.id} attempt=${resultado.run.run_attempt} head_sha=${resultado.run.head_sha} (tentativa lógica ${resultado.tentativa}/${MAX_TENTATIVAS})`);

    for (const job of resultado.jobs) {
        console.log(`[pages-qg-gate] job OK: "${job.name}" = ${job.status}/${job.conclusion}`);
    }

    console.log(`[pages-qg-gate] APROVADO — Quality Gate completo (4/4) e verde pra sha=${expectedSha} (run ${resultado.run.id}, attempt ${resultado.run.run_attempt}).`);
}

main().catch((erro) => {
    console.error("[pages-qg-gate] BLOQUEADO —", erro && erro.message ? erro.message : erro);
    process.exit(1);
});
