// PAGES-EXACT-SHA-QUALITY-GATE-IMPLEMENTATION
//
// Cobre os 30 casos mínimos exigidos pela missão de implementação:
// funções puras de scripts/pages-qg-gate-core.mjs testadas diretamente
// (sem mock de rede — fixtures em memória), e as garantias estruturais do
// próprio workflow (.github/workflows/pages-publish.yml) verificadas por
// leitura estática do YAML como texto, seguindo o mesmo padrão já
// estabelecido em tests/ci/firebase-deploy-beta-workflow.test.mjs — só
// regex/parsing pra garantias que são inerentemente de contexto do
// GitHub Actions (github.sha, API da branch), que não têm como virar
// função pura sem mockar toda a runtime do Actions.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, it } from "node:test";
import {
    SHA_REGEX,
    EXPECTED_JOB_NAMES,
    QUALITY_GATE_WORKFLOW_FILE,
    validarFormatoSha,
    selecionarRunAprovado,
    validarJobsObrigatorios,
    avaliarGateCompleto,
    construirUrlRunsQG,
    construirUrlJobsDoRun
} from "../../scripts/pages-qg-gate-core.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOW_PATH = path.resolve(__dirname, "../../.github/workflows/pages-publish.yml");
const conteudoWorkflow = readFileSync(WORKFLOW_PATH, "utf8");

const semComentarios = conteudoWorkflow
    .split("\n")
    .filter((linha) => !linha.trim().startsWith("#"))
    .join("\n");

// Dois SHAs de 40 hex chars fixos e determinísticos pros testes (não
// precisam ser reais/existentes — só distintos e bem-formados).
const SHA_A = "2ff1ec35f6ffe6a1f0707b306fdeb18afd0bb806";
const SHA_B = "31b7ebc39ebc3debf460a9a86bd805b9f5eb7111";
assert.equal(SHA_A.length, 40);
assert.equal(SHA_B.length, 40);

function jobOk(nome) {
    return { name: nome, status: "completed", conclusion: "success" };
}

function runBase(overrides = {}) {
    return {
        id: 111,
        run_attempt: 1,
        head_sha: SHA_A,
        head_branch: "main",
        event: "push",
        status: "completed",
        conclusion: "success",
        ...overrides
    };
}

describe("scripts/pages-qg-gate-core.mjs — funções puras do gate exact-SHA", () => {
    describe("validarFormatoSha", () => {
        it("aceita um SHA de 40 hex chars minúsculos", () => {
            assert.equal(validarFormatoSha(SHA_A).ok, true);
        });

        it("3. SHA malformado bloqueia — curto demais", () => {
            const r = validarFormatoSha("2ff1ec3");
            assert.equal(r.ok, false);
        });

        it("3. SHA malformado bloqueia — maiúsculas", () => {
            const r = validarFormatoSha(SHA_A.toUpperCase());
            assert.equal(r.ok, false);
        });

        it("3. SHA malformado bloqueia — caracteres não-hex / tentativa de injeção", () => {
            const r = validarFormatoSha("2ff1ec35f6ffe6a1f0707b306fdeb18afd0bb80'; rm -rf /");
            assert.equal(r.ok, false);
        });

        it("3. SHA malformado bloqueia — ausente/undefined/null", () => {
            assert.equal(validarFormatoSha(undefined).ok, false);
            assert.equal(validarFormatoSha(null).ok, false);
            assert.equal(validarFormatoSha("").ok, false);
        });
    });

    describe("selecionarRunAprovado", () => {
        it("13 (parcial). run correto (push/main/completed/success/sha exato) é selecionado", () => {
            const r = selecionarRunAprovado([runBase()], { expectedSha: SHA_A });
            assert.equal(r.ok, true);
            assert.equal(r.run.head_sha, SHA_A);
        });

        it("6. run QG ausente bloqueia (lista vazia)", () => {
            const r = selecionarRunAprovado([], { expectedSha: SHA_A });
            assert.equal(r.ok, false);
        });

        it("6. run QG ausente bloqueia (nenhum candidato bate)", () => {
            const r = selecionarRunAprovado([runBase({ head_sha: SHA_B })], { expectedSha: SHA_A });
            assert.equal(r.ok, false);
        });

        it("7. run com SHA diferente bloqueia (SHA anterior)", () => {
            const r = selecionarRunAprovado([runBase({ head_sha: SHA_B })], { expectedSha: SHA_A });
            assert.equal(r.ok, false);
        });

        it("8. run de pull_request bloqueia", () => {
            const r = selecionarRunAprovado([runBase({ event: "pull_request" })], { expectedSha: SHA_A });
            assert.equal(r.ok, false);
        });

        it("8. run de workflow_dispatch bloqueia (não é push)", () => {
            const r = selecionarRunAprovado([runBase({ event: "workflow_dispatch" })], { expectedSha: SHA_A });
            assert.equal(r.ok, false);
        });

        it("9. run de branch diferente bloqueia", () => {
            const r = selecionarRunAprovado([runBase({ head_branch: "hotfix/algo" })], { expectedSha: SHA_A });
            assert.equal(r.ok, false);
        });

        it("10. run incomplete (status != completed) bloqueia", () => {
            const r = selecionarRunAprovado([runBase({ status: "in_progress", conclusion: null })], { expectedSha: SHA_A });
            assert.equal(r.ok, false);
        });

        it("11. run failure bloqueia", () => {
            const r = selecionarRunAprovado([runBase({ conclusion: "failure" })], { expectedSha: SHA_A });
            assert.equal(r.ok, false);
        });

        it("11. run neutral/cancelled/skipped bloqueiam", () => {
            for (const conclusion of ["neutral", "cancelled", "skipped", "timed_out", "action_required"]) {
                const r = selecionarRunAprovado([runBase({ conclusion })], { expectedSha: SHA_A });
                assert.equal(r.ok, false, `conclusion=${conclusion} deveria bloquear`);
            }
        });

        it("12. múltiplos runs ambíguos compatíveis com o mesmo SHA bloqueiam", () => {
            const r = selecionarRunAprovado(
                [runBase({ id: 1 }), runBase({ id: 2 })],
                { expectedSha: SHA_A }
            );
            assert.equal(r.ok, false);
            assert.ok(r.candidatos && r.candidatos.length === 2);
        });

        it("não escolhe silenciosamente 'o mais recente' entre ambíguos — sempre falha fechado", () => {
            const r = selecionarRunAprovado(
                [runBase({ id: 1, run_attempt: 1 }), runBase({ id: 1, run_attempt: 2 })],
                { expectedSha: SHA_A }
            );
            assert.equal(r.ok, false);
        });

        it("runs de outro SHA não interferem na seleção do SHA correto", () => {
            const r = selecionarRunAprovado(
                [runBase({ id: 9, head_sha: SHA_B }), runBase({ id: 10, head_sha: SHA_A })],
                { expectedSha: SHA_A }
            );
            assert.equal(r.ok, true);
            assert.equal(r.run.id, 10);
        });
    });

    describe("validarJobsObrigatorios", () => {
        const quatroJobsOk = () => EXPECTED_JOB_NAMES.map(jobOk);

        it("13. os 4 jobs exatos, todos success, aprova", () => {
            const r = validarJobsObrigatorios(quatroJobsOk());
            assert.equal(r.ok, true);
            assert.equal(r.jobs.length, 4);
        });

        it("14. job faltando bloqueia", () => {
            const jobs = quatroJobsOk().slice(0, 3);
            const r = validarJobsObrigatorios(jobs);
            assert.equal(r.ok, false);
        });

        it("15. job extra (não reconhecido) bloqueia", () => {
            const jobs = [...quatroJobsOk(), jobOk("Job novo não auditado")];
            const r = validarJobsObrigatorios(jobs);
            assert.equal(r.ok, false);
        });

        it("16. job duplicado bloqueia", () => {
            const jobs = [...quatroJobsOk(), jobOk(EXPECTED_JOB_NAMES[0])];
            const r = validarJobsObrigatorios(jobs);
            assert.equal(r.ok, false);
        });

        it("17. qualquer job com conclusion vermelha bloqueia", () => {
            const jobs = quatroJobsOk();
            jobs[3] = { name: EXPECTED_JOB_NAMES[3], status: "completed", conclusion: "failure" };
            const r = validarJobsObrigatorios(jobs);
            assert.equal(r.ok, false);
        });

        it("17. job cancelled bloqueia", () => {
            const jobs = quatroJobsOk();
            jobs[1] = { name: EXPECTED_JOB_NAMES[1], status: "completed", conclusion: "cancelled" };
            const r = validarJobsObrigatorios(jobs);
            assert.equal(r.ok, false);
        });

        it("17. job skipped bloqueia", () => {
            const jobs = quatroJobsOk();
            jobs[2] = { name: EXPECTED_JOB_NAMES[2], status: "completed", conclusion: "skipped" };
            const r = validarJobsObrigatorios(jobs);
            assert.equal(r.ok, false);
        });

        it("17. job ainda in_progress (status != completed) bloqueia", () => {
            const jobs = quatroJobsOk();
            jobs[0] = { name: EXPECTED_JOB_NAMES[0], status: "in_progress", conclusion: null };
            const r = validarJobsObrigatorios(jobs);
            assert.equal(r.ok, false);
        });

        it("lista vazia de jobs bloqueia (4 ausentes)", () => {
            const r = validarJobsObrigatorios([]);
            assert.equal(r.ok, false);
        });
    });

    describe("avaliarGateCompleto — orquestração ponta a ponta com fixtures", () => {
        it("13. caminho feliz completo: SHA válido + run correto + 4 jobs success aprova", () => {
            const runs = [runBase()];
            const jobsPorRunId = { 111: EXPECTED_JOB_NAMES.map(jobOk) };
            const r = avaliarGateCompleto({ expectedSha: SHA_A, runs, jobsPorRunId });
            assert.equal(r.ok, true);
            assert.equal(r.run.head_sha, SHA_A);
            assert.equal(r.jobs.length, 4);
        });

        it("SHA malformado bloqueia antes mesmo de olhar os runs", () => {
            const r = avaliarGateCompleto({ expectedSha: "curto", runs: [runBase()], jobsPorRunId: {} });
            assert.equal(r.ok, false);
        });

        it("run correto mas jobs faltando bloqueia mesmo com run aprovado", () => {
            const runs = [runBase()];
            const jobsPorRunId = { 111: EXPECTED_JOB_NAMES.slice(0, 3).map(jobOk) };
            const r = avaliarGateCompleto({ expectedSha: SHA_A, runs, jobsPorRunId });
            assert.equal(r.ok, false);
        });
    });

    describe("construirUrlRunsQG / construirUrlJobsDoRun", () => {
        it("18. URL de runs filtra branch=main, event=push, status=completed no workflow certo", () => {
            const url = construirUrlRunsQG("VideDigital/vide-digital");
            assert.match(url, /branch=main/);
            assert.match(url, /event=push/);
            assert.match(url, /status=completed/);
            assert.match(url, new RegExp(`workflows/${QUALITY_GATE_WORKFLOW_FILE}/runs`));
        });

        it("18. URL de jobs usa filter=latest (semântica de rerun autorizado)", () => {
            const url = construirUrlJobsDoRun("VideDigital/vide-digital", 33429829480);
            assert.match(url, /filter=latest/);
            assert.match(url, /runs\/33429829480\/jobs/);
        });
    });

    it("SHA_REGEX é exatamente 40 hex chars minúsculos, nem mais nem menos", () => {
        assert.ok(SHA_REGEX.test("a".repeat(40)));
        assert.ok(!SHA_REGEX.test("a".repeat(39)));
        assert.ok(!SHA_REGEX.test("a".repeat(41)));
        assert.ok(!SHA_REGEX.test("A".repeat(40)));
    });
});

describe(".github/workflows/pages-publish.yml — garantias estruturais do gate exact-SHA", () => {
    it("1. input sha obrigatório existe", () => {
        assert.match(semComentarios, /sha:\s*\n\s*description:[^\n]*\n\s*required:\s*true\s*\n\s*type:\s*string/);
    });

    it("2. confirmacao PUBLICAR continua obrigatória", () => {
        assert.match(semComentarios, /confirmacao:\s*\n\s*description:[^\n]*\n\s*required:\s*true/);
        assert.match(semComentarios, /CONFIRMACAO"\s*!=\s*"PUBLICAR"/);
    });

    it("4/5. valida github.sha (context.sha) contra o input sha antes do checkout", () => {
        assert.match(semComentarios, /context\.sha\s*!==\s*expectedSha/);
    });

    it("valida a main atual via API (getBranch) contra o sha, pelo menos 3 vezes (validar/preparar/publicar — TOCTOU)", () => {
        const ocorrencias = (semComentarios.match(/getBranch\(/g) || []).length;
        assert.ok(ocorrencias >= 3, `esperado pelo menos 3 chamadas a getBranch (validar/preparar/publicar), encontrado ${ocorrencias}`);
    });

    it("29. branch main continua obrigatória", () => {
        assert.match(semComentarios, /GITHUB_REF"\s*!=\s*"refs\/heads\/main"/);
    });

    it("19. preparar faz checkout explícito do input SHA, não da branch", () => {
        const jobPreparar = semComentarios.split(/^\s*preparar:/m)[1]?.split(/^\s*publicar:/m)[0] || "";
        assert.match(jobPreparar, /uses:\s*actions\/checkout@v6/);
        assert.match(jobPreparar, /ref:\s*\$\{\{\s*inputs\.sha\s*\}\}/);
    });

    it("checkout de validar também usa o SHA explícito, não a branch default", () => {
        const jobValidar = semComentarios.split(/^\s*validar:/m)[1]?.split(/^\s*preparar:/m)[0] || "";
        assert.match(jobValidar, /uses:\s*actions\/checkout@v6/);
        assert.match(jobValidar, /ref:\s*\$\{\{\s*inputs\.sha\s*\}\}/);
    });

    it("20. publicar revalida main antes de deploy-pages (github-script vem antes do deploy-pages no mesmo job)", () => {
        const jobPublicar = semComentarios.split(/^\s*publicar:/m)[1] || "";
        const idxGithubScript = jobPublicar.indexOf("actions/github-script@v7");
        const idxDeployPages = jobPublicar.indexOf("actions/deploy-pages@v4");
        assert.ok(idxGithubScript >= 0 && idxDeployPages >= 0, "publicar precisa conter tanto github-script quanto deploy-pages");
        assert.ok(idxGithubScript < idxDeployPages, "a revalidação (github-script) precisa vir ANTES do deploy-pages");
    });

    it("publicar não faz checkout do repositório (revalidação é só leitura via API)", () => {
        const jobPublicar = semComentarios.split(/^\s*publicar:/m)[1] || "";
        assert.doesNotMatch(jobPublicar, /actions\/checkout@/);
    });

    it("21. nenhum `pnpm run test:release` permanece executável no workflow do Pages", () => {
        assert.doesNotMatch(semComentarios, /run:\s*pnpm run test:release/);
    });

    it("22. nenhum `firebase deploy` no workflow do Pages", () => {
        assert.doesNotMatch(semComentarios, /firebase deploy/i);
    });

    it("23-26. nenhum deploy de Functions/Rules/Storage/indexes", () => {
        assert.doesNotMatch(semComentarios, /--only\s+functions/i);
        assert.doesNotMatch(semComentarios, /--only\s+firestore/i);
        assert.doesNotMatch(semComentarios, /--only\s+storage/i);
        assert.doesNotMatch(semComentarios, /firestore\.indexes\.json.*deploy/i);
    });

    it("27. actions/deploy-pages@v4 continua sendo o único mecanismo de deploy", () => {
        const ocorrenciasDeploy = (semComentarios.match(/uses:\s*actions\/deploy-pages@v4/g) || []).length;
        assert.equal(ocorrenciasDeploy, 1, "deploy-pages deveria aparecer exatamente uma vez");
        assert.doesNotMatch(semComentarios, /gcloud\s+(?:app|functions|run)\s+deploy/i);
    });

    it("28. validação do pacote público (caminhos proibidos + arquivos essenciais) continua presente", () => {
        assert.match(semComentarios, /caminhos_proibidos=\(/);
        assert.match(semComentarios, /arquivos_essenciais=\(/);
        assert.match(semComentarios, /"firestore\.rules"/);
        assert.match(semComentarios, /"storage\.rules"/);
    });

    it("30. permissões continuam mínimas — sem contents:write nem actions:write em nenhum job", () => {
        assert.doesNotMatch(semComentarios, /contents:\s*write/);
        assert.doesNotMatch(semComentarios, /actions:\s*write/);
    });

    it("30. o job validar declara actions: read (necessário só ali, pra consultar o Quality Gate)", () => {
        const jobValidar = semComentarios.split(/^\s*validar:/m)[1]?.split(/^\s*preparar:/m)[0] || "";
        assert.match(jobValidar, /actions:\s*read/);
    });

    it("30. pages: write e id-token: write continuam exclusivos do job publicar", () => {
        const antesDoPublicar = semComentarios.split(/^\s*publicar:/m)[0];
        assert.doesNotMatch(antesDoPublicar, /pages:\s*write/);
        assert.doesNotMatch(antesDoPublicar, /id-token:\s*write/);
        const jobPublicar = semComentarios.split(/^\s*publicar:/m)[1] || "";
        assert.match(jobPublicar, /pages:\s*write/);
        assert.match(jobPublicar, /id-token:\s*write/);
    });

    it("scripts/pages-qg-gate.mjs é chamado dentro do job validar, depois do checkout confirmado", () => {
        const jobValidar = semComentarios.split(/^\s*validar:/m)[1]?.split(/^\s*preparar:/m)[0] || "";
        assert.match(jobValidar, /node scripts\/pages-qg-gate\.mjs/);
        const idxCheckout = jobValidar.indexOf("actions/checkout@v6");
        const idxGate = jobValidar.indexOf("pages-qg-gate.mjs");
        assert.ok(idxCheckout >= 0 && idxCheckout < idxGate, "o gate do QG precisa rodar depois do checkout do SHA já confirmado");
    });

    it("não interpola inputs.sha diretamente dentro de nenhum bloco `script:` do github-script (evita injeção)", () => {
        // Procura por blocos actions/github-script seguidos de `script: |` e
        // garante que NENHUM deles contém a interpolação direta
        // ${{ inputs.sha }} dentro do próprio texto do script — o valor
        // sempre precisa vir de env/process.env.
        const blocosScript = semComentarios.match(/script:\s*\|[\s\S]*?(?=\n\s{0,6}\S|\n\s*$)/g) || [];
        assert.ok(blocosScript.length > 0, "esperado pelo menos um bloco script: | no workflow");
        for (const bloco of blocosScript) {
            assert.doesNotMatch(bloco, /\$\{\{\s*inputs\.sha\s*\}\}/, `bloco de script não deveria interpolar inputs.sha diretamente: ${bloco.slice(0, 120)}`);
        }
    });
});
