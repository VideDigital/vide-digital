// PAGES-EXACT-SHA-QUALITY-GATE-IMPLEMENTATION
//
// Lógica pura e testável do gate que substitui a execução duplicada de
// `pnpm run test:release` dentro de .github/workflows/pages-publish.yml.
//
// Contexto: uma auditoria read-only anterior (mesma sessão) comprovou por
// comparação literal de scripts que os 4 jobs do Quality Gate
// (.github/workflows/quality-gate.yml) executam coletivamente exatamente
// os mesmos 8 comandos que `pnpm run test:release` expande — nenhum teste
// a mais, nenhum a menos. A fonte de aprovação passa a ser o Quality Gate
// oficial da main, no SHA exato solicitado, não uma segunda execução
// duplicada (que já sofreu duas intermitências reais nesta mesma sessão,
// bloqueando releases sem indicar nenhuma regressão real de produto).
//
// Este módulo não faz nenhuma chamada de rede e não lê nenhuma variável
// de ambiente — só funções puras, fáceis de testar com fixtures. O
// wrapper de CLI (scripts/pages-qg-gate.mjs) é quem lê env/faz fetch.

// SHA completo do Git: exatamente 40 caracteres hexadecimais minúsculos.
export const SHA_REGEX = /^[0-9a-f]{40}$/;

// Nomes EXATOS dos 4 jobs do Quality Gate (.github/workflows/quality-gate.yml)
// — precisam ficar sincronizados manualmente com o `name:` de cada job lá.
// Se o Quality Gate ganhar, perder ou renomear um job no futuro sem essa
// lista ser atualizada conscientemente, o gate deve falhar fechado (job
// ausente ou job extra), nunca aprovar silenciosamente uma cobertura
// diferente da que foi auditada.
export const EXPECTED_JOB_NAMES = Object.freeze([
    "Sintaxe e testes unitários",
    "Firestore Rules, Storage Rules e Functions legadas",
    "Smoke de frontend (SDK direto, sem navegador)",
    "UI com login real (Playwright + Auth Emulator)"
]);

export const QUALITY_GATE_WORKFLOW_FILE = "quality-gate.yml";

// URLs da API do GitHub como funções puras (recebem `repo` já resolvido,
// nunca leem env/fazem fetch aqui) — testáveis diretamente, sem mock de
// rede, garantindo que os filtros corretos (branch=main, event=push,
// status=completed, filter=latest) sempre fazem parte da própria
// requisição, não só da revalidação em avaliarGateCompleto().
export function construirUrlRunsQG(repo) {
    return `https://api.github.com/repos/${repo}/actions/workflows/${QUALITY_GATE_WORKFLOW_FILE}/runs?branch=main&event=push&status=completed`;
}

export function construirUrlJobsDoRun(repo, runId) {
    return `https://api.github.com/repos/${repo}/actions/runs/${runId}/jobs?filter=latest`;
}

export function validarFormatoSha(sha) {
    if (typeof sha !== "string" || !SHA_REGEX.test(sha)) {
        return { ok: false, motivo: `sha malformado: esperado exatamente 40 caracteres hex minúsculos, recebido ${JSON.stringify(sha)}` };
    }
    return { ok: true };
}

// `runs` é o array bruto retornado por
// GET /repos/{owner}/{repo}/actions/workflows/quality-gate.yml/runs
// Esta função NUNCA confia cegamente nos query params já enviados pro
// fetch (branch/event/status) — revalida cada campo aqui de novo, porque
// um parâmetro de query mal formado (ou uma mudança futura de
// comportamento da API) não pode virar um bypass silencioso.
//
// Exige exatamente 1 run correspondente. Zero = QG ausente pra esse SHA
// (fail closed). Mais de 1 = estado ambíguo (fail closed, nunca escolhe
// "o mais recente" silenciosamente).
export function selecionarRunAprovado(runs, { expectedSha, expectedBranch = "main" } = {}) {
    const lista = Array.isArray(runs) ? runs : [];
    const candidatos = lista.filter((run) =>
        run
        && run.head_sha === expectedSha
        && run.head_branch === expectedBranch
        && run.event === "push"
        && run.status === "completed"
        && run.conclusion === "success"
    );

    if (candidatos.length === 0) {
        return {
            ok: false,
            motivo: `nenhum run do Quality Gate encontrado com head_sha=${expectedSha} head_branch=${expectedBranch} event=push status=completed conclusion=success`
        };
    }
    if (candidatos.length > 1) {
        return {
            ok: false,
            motivo: `${candidatos.length} runs do Quality Gate ambíguos encontrados para o mesmo sha — esperado exatamente 1`,
            candidatos: candidatos.map((r) => ({ id: r.id, run_attempt: r.run_attempt }))
        };
    }
    return { ok: true, run: candidatos[0] };
}

// `jobs` é o array já obtido com filter=latest (resolve corretamente o
// caso real desta sessão: run 33429829480 teve attempt 1 com o job "UI
// com login real" vermelho e um rerun explicitamente autorizado que
// deixou o attempt final verde no mesmo SHA — filter=latest reporta só o
// estado do último attempt de cada job).
//
// Exige o conjunto EXATO dos 4 nomes esperados: nenhum ausente, nenhum
// extra, nenhum duplicado, todos completed/success.
export function validarJobsObrigatorios(jobs, { nomesEsperados = EXPECTED_JOB_NAMES } = {}) {
    const lista = Array.isArray(jobs) ? jobs : [];
    const porNome = new Map();
    for (const job of lista) {
        if (!job || typeof job.name !== "string") continue;
        if (porNome.has(job.name)) {
            return { ok: false, motivo: `job duplicado encontrado no run: "${job.name}"` };
        }
        porNome.set(job.name, job);
    }

    const faltando = nomesEsperados.filter((nome) => !porNome.has(nome));
    if (faltando.length > 0) {
        return { ok: false, motivo: `job(s) obrigatório(s) ausente(s) no run: ${faltando.join(", ")}` };
    }

    const extras = [...porNome.keys()].filter((nome) => !nomesEsperados.includes(nome));
    if (extras.length > 0) {
        return { ok: false, motivo: `job(s) inesperado(s) presente(s) no run (Quality Gate mudou sem o gate ser atualizado conscientemente): ${extras.join(", ")}` };
    }

    const naoAprovados = nomesEsperados
        .map((nome) => porNome.get(nome))
        .filter((job) => job.status !== "completed" || job.conclusion !== "success");
    if (naoAprovados.length > 0) {
        return {
            ok: false,
            motivo: `job(s) sem status completed + conclusion success: ${naoAprovados.map((j) => `"${j.name}"=${j.status}/${j.conclusion}`).join(", ")}`
        };
    }

    return {
        ok: true,
        jobs: nomesEsperados.map((nome) => {
            const job = porNome.get(nome);
            return { name: nome, status: job.status, conclusion: job.conclusion };
        })
    };
}

// Orquestra as duas validações acima a partir de dados já buscados
// (nunca faz fetch aqui — mantém esta função pura e testável com
// fixtures, sem mock de rede).
export function avaliarGateCompleto({ expectedSha, runs, jobsPorRunId, expectedBranch = "main", nomesEsperados = EXPECTED_JOB_NAMES }) {
    const formato = validarFormatoSha(expectedSha);
    if (!formato.ok) return formato;

    const selecao = selecionarRunAprovado(runs, { expectedSha, expectedBranch });
    if (!selecao.ok) return selecao;

    const jobs = (jobsPorRunId && jobsPorRunId[selecao.run.id]) || [];
    const validacaoJobs = validarJobsObrigatorios(jobs, { nomesEsperados });
    if (!validacaoJobs.ok) return validacaoJobs;

    return {
        ok: true,
        run: { id: selecao.run.id, run_attempt: selecao.run.run_attempt, head_sha: selecao.run.head_sha },
        jobs: validacaoJobs.jobs
    };
}
