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
import {
    EXPECTED_JOB_NAMES,
    validarFormatoSha,
    selecionarRunAprovado,
    validarJobsObrigatorios,
    construirUrlRunsQG,
    construirUrlJobsDoRun
} from "./pages-qg-gate-core.mjs";

const MAX_PAGINAS = 20;

async function fetchAllPages(url, token) {
    const resultados = [];
    let pagina = 1;
    while (pagina <= MAX_PAGINAS) {
        const separador = url.includes("?") ? "&" : "?";
        const resposta = await fetch(`${url}${separador}per_page=100&page=${pagina}`, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28"
            }
        });
        if (!resposta.ok) {
            const corpoErro = await resposta.text().catch(() => "");
            throw new Error(`GitHub API respondeu ${resposta.status} ${resposta.statusText} para ${url} — ${corpoErro.slice(0, 500)}`);
        }
        const corpo = await resposta.json();
        const chaveArray = Object.keys(corpo).find((chave) => Array.isArray(corpo[chave]));
        const itensDaPagina = chaveArray ? corpo[chaveArray] : [];
        resultados.push(...itensDaPagina);
        if (itensDaPagina.length < 100) return resultados;
        pagina += 1;
    }
    throw new Error(`paginação excedeu o limite de segurança de ${MAX_PAGINAS} páginas em ${url} — resposta inesperada da API`);
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

    const runsUrl = construirUrlRunsQG(repo);
    const runs = await fetchAllPages(runsUrl, token);

    const selecao = selecionarRunAprovado(runs, { expectedSha, expectedBranch: "main" });
    if (!selecao.ok) {
        throw new Error(selecao.motivo + (selecao.candidatos ? ` — candidatos: ${JSON.stringify(selecao.candidatos)}` : ""));
    }

    console.log(`[pages-qg-gate] run do Quality Gate selecionado: id=${selecao.run.id} attempt=${selecao.run.run_attempt} head_sha=${selecao.run.head_sha}`);

    const jobsUrl = construirUrlJobsDoRun(repo, selecao.run.id);
    const jobs = await fetchAllPages(jobsUrl, token);

    const validacaoJobs = validarJobsObrigatorios(jobs, { nomesEsperados: EXPECTED_JOB_NAMES });
    if (!validacaoJobs.ok) throw new Error(validacaoJobs.motivo);

    for (const job of validacaoJobs.jobs) {
        console.log(`[pages-qg-gate] job OK: "${job.name}" = ${job.status}/${job.conclusion}`);
    }

    console.log(`[pages-qg-gate] APROVADO — Quality Gate completo (4/4) e verde pra sha=${expectedSha} (run ${selecao.run.id}, attempt ${selecao.run.run_attempt}).`);
}

main().catch((erro) => {
    console.error("[pages-qg-gate] BLOQUEADO —", erro && erro.message ? erro.message : erro);
    process.exit(1);
});
