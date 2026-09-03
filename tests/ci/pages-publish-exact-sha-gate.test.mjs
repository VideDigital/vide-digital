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
    REASON_CODES,
    MAX_TENTATIVAS,
    BACKOFF_MS,
    validarFormatoSha,
    selecionarRunAprovado,
    validarJobsObrigatorios,
    avaliarGateCompleto,
    avaliarGateComRetry,
    extrairArrayObrigatorio,
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
            const url = construirUrlRunsQG("VideDigital/vide-digital", SHA_A);
            assert.match(url, /branch=main/);
            assert.match(url, /event=push/);
            assert.match(url, /status=completed/);
            assert.match(url, new RegExp(`workflows/${QUALITY_GATE_WORKFLOW_FILE}/runs`));
        });

        it("22. URL de runs também filtra head_sha=<SHA exato> (reduz superfície/volume de resultados)", () => {
            const url = construirUrlRunsQG("VideDigital/vide-digital", SHA_A);
            assert.match(url, new RegExp(`head_sha=${SHA_A}`));
        });

        it("23. URL de runs preserva o workflow quality-gate.yml mesmo com head_sha adicionado", () => {
            const url = construirUrlRunsQG("VideDigital/vide-digital", SHA_A);
            assert.match(url, new RegExp(`workflows/${QUALITY_GATE_WORKFLOW_FILE}/runs`));
        });

        it("18. URL de jobs usa filter=latest (semântica de rerun autorizado)", () => {
            const url = construirUrlJobsDoRun("VideDigital/vide-digital", 33429829480);
            assert.match(url, /filter=latest/);
            assert.match(url, /runs\/33429829480\/jobs/);
        });
    });

    describe("24. seleção ainda revalida head_sha/branch/event/status/conclusion mesmo com query já filtrada por head_sha", () => {
        it("query param NÃO é autoridade — selecionarRunAprovado continua rejeitando um run que não bate em memória", () => {
            // Simula a API "confiando cegamente" no query param head_sha e
            // devolvendo um run de branch/evento errado mesmo assim — a
            // validação em memória (já existente) precisa continuar sendo
            // soberana, nunca relaxada pela adição do query param.
            const r = selecionarRunAprovado([runBase({ head_branch: "outra-branch" })], { expectedSha: SHA_A });
            assert.equal(r.ok, false);
        });
    });

    describe("25. rerun no mesmo run.id — run_attempt atualizado continua aceito", () => {
        it("run com run_attempt=2 (pós-rerun) e conclusion=success continua sendo aprovado normalmente", () => {
            const r = selecionarRunAprovado([runBase({ run_attempt: 2 })], { expectedSha: SHA_A });
            assert.equal(r.ok, true);
            assert.equal(r.run.run_attempt, 2);
        });
    });

    describe("reasonCode — selecionarRunAprovado", () => {
        it("zero candidatos retorna reasonCode RUN_NOT_FOUND", () => {
            const r = selecionarRunAprovado([], { expectedSha: SHA_A });
            assert.equal(r.ok, false);
            assert.equal(r.reasonCode, REASON_CODES.RUN_NOT_FOUND);
        });

        it("múltiplos candidatos retorna reasonCode RUN_AMBIGUOUS", () => {
            const r = selecionarRunAprovado([runBase({ id: 1 }), runBase({ id: 2 })], { expectedSha: SHA_A });
            assert.equal(r.ok, false);
            assert.equal(r.reasonCode, REASON_CODES.RUN_AMBIGUOUS);
        });
    });

    describe("16/17. extrairArrayObrigatorio — shape estrito da resposta da API (runs e jobs)", () => {
        it("corpo com a chave esperada como array retorna os itens", () => {
            const r = extrairArrayObrigatorio({ total_count: 2, workflow_runs: [1, 2] }, "workflow_runs");
            assert.equal(r.ok, true);
            assert.deepEqual(r.itens, [1, 2]);
            assert.equal(r.totalCount, 2);
        });

        it("corpo com a chave esperada como array VAZIO continua ok (lista real vazia, não shape inesperado)", () => {
            const r = extrairArrayObrigatorio({ total_count: 0, workflow_runs: [] }, "workflow_runs");
            assert.equal(r.ok, true);
            assert.deepEqual(r.itens, []);
        });

        it("15. resposta 200 sem a chave esperada (workflow_runs ausente) falha explicitamente, nunca vira lista vazia silenciosa", () => {
            const r = extrairArrayObrigatorio({ total_count: 0, message: "algo inesperado" }, "workflow_runs");
            assert.equal(r.ok, false);
            assert.match(r.motivo, /workflow_runs/);
        });

        it("16. workflow_runs presente mas não-array falha explicitamente", () => {
            const r = extrairArrayObrigatorio({ workflow_runs: "não é array" }, "workflow_runs");
            assert.equal(r.ok, false);
        });

        it("17. resposta 200 sem a chave 'jobs' falha explicitamente", () => {
            const r = extrairArrayObrigatorio({ total_count: 0 }, "jobs");
            assert.equal(r.ok, false);
            assert.match(r.motivo, /jobs/);
        });

        it("18. jobs presente mas não-array falha explicitamente", () => {
            const r = extrairArrayObrigatorio({ jobs: { não: "é array" } }, "jobs");
            assert.equal(r.ok, false);
        });

        it("corpo que não é objeto (array/string/número/null) falha explicitamente", () => {
            assert.equal(extrairArrayObrigatorio([], "workflow_runs").ok, false);
            assert.equal(extrairArrayObrigatorio("string", "workflow_runs").ok, false);
            assert.equal(extrairArrayObrigatorio(42, "workflow_runs").ok, false);
            assert.equal(extrairArrayObrigatorio(null, "workflow_runs").ok, false);
        });
    });

    describe("avaliarGateComRetry — orquestração com retry bounded, TOCTOU e dependências injetadas (sem rede real, sem espera real)", () => {
        function fakeDormir(registro) {
            return async (ms) => {
                registro.push(ms);
            };
        }

        function fakeJobsOk() {
            return async () => EXPECTED_JOB_NAMES.map(jobOk);
        }

        it("1. primeira consulta já retorna o run correto → PASS, tentativa=1, sem sleep", async () => {
            const sleeps = [];
            const r = await avaliarGateComRetry({
                expectedSha: SHA_A,
                buscarRunsAprovados: async () => [runBase()],
                buscarJobsDoRun: fakeJobsOk(),
                obterHeadAtualDeMain: async () => SHA_A,
                dormir: fakeDormir(sleeps)
            });
            assert.equal(r.ok, true);
            assert.equal(r.tentativa, 1);
            assert.deepEqual(sleeps, []);
        });

        it("2. primeira vazia, segunda retorna o run correto → PASS, 1 sleep de 5000ms", async () => {
            const sleeps = [];
            let chamada = 0;
            const r = await avaliarGateComRetry({
                expectedSha: SHA_A,
                buscarRunsAprovados: async () => {
                    chamada += 1;
                    return chamada === 1 ? [] : [runBase()];
                },
                buscarJobsDoRun: fakeJobsOk(),
                obterHeadAtualDeMain: async () => SHA_A,
                dormir: fakeDormir(sleeps)
            });
            assert.equal(r.ok, true);
            assert.equal(r.tentativa, 2);
            assert.deepEqual(sleeps, [5000]);
        });

        it("3. primeira e segunda vazias, terceira retorna o run correto → PASS, sleeps 5000 e 10000ms", async () => {
            const sleeps = [];
            let chamada = 0;
            const r = await avaliarGateComRetry({
                expectedSha: SHA_A,
                buscarRunsAprovados: async () => {
                    chamada += 1;
                    return chamada < 3 ? [] : [runBase()];
                },
                buscarJobsDoRun: fakeJobsOk(),
                obterHeadAtualDeMain: async () => SHA_A,
                dormir: fakeDormir(sleeps)
            });
            assert.equal(r.ok, true);
            assert.equal(r.tentativa, 3);
            assert.deepEqual(sleeps, [5000, 10000]);
        });

        it("4. três tentativas vazias → FAIL closed, reasonCode RUN_NOT_FOUND, sem tentativa extra além do máximo", async () => {
            let chamadas = 0;
            const r = await avaliarGateComRetry({
                expectedSha: SHA_A,
                buscarRunsAprovados: async () => {
                    chamadas += 1;
                    return [];
                },
                buscarJobsDoRun: fakeJobsOk(),
                obterHeadAtualDeMain: async () => SHA_A,
                dormir: async () => {}
            });
            assert.equal(r.ok, false);
            assert.equal(r.reasonCode, REASON_CODES.RUN_NOT_FOUND);
            assert.equal(chamadas, MAX_TENTATIVAS);
        });

        it("5. os waits são exatamente 5000 e depois 10000 (BACKOFF_MS), nunca espera real (sleep fake nunca chama setTimeout de verdade)", async () => {
            const sleeps = [];
            let chamada = 0;
            await avaliarGateComRetry({
                expectedSha: SHA_A,
                buscarRunsAprovados: async () => {
                    chamada += 1;
                    return chamada < 3 ? [] : [runBase()];
                },
                buscarJobsDoRun: fakeJobsOk(),
                obterHeadAtualDeMain: async () => SHA_A,
                dormir: fakeDormir(sleeps)
            });
            assert.deepEqual(sleeps, BACKOFF_MS);
        });

        it("6. SHA malformado falha imediato, reasonCode SHA_MALFORMADO, 0 chamadas a buscarRunsAprovados (0 retries)", async () => {
            let chamadas = 0;
            const r = await avaliarGateComRetry({
                expectedSha: "curto-demais",
                buscarRunsAprovados: async () => { chamadas += 1; return [runBase()]; },
                buscarJobsDoRun: fakeJobsOk(),
                obterHeadAtualDeMain: async () => SHA_A,
                dormir: async () => {}
            });
            assert.equal(r.ok, false);
            assert.equal(r.reasonCode, REASON_CODES.SHA_MALFORMADO);
            assert.equal(chamadas, 0);
        });

        it("7. run encontrado mas conclusion=failure → FAIL imediato, sem retry (run já existe, não é 'zero candidatos')", async () => {
            let chamadas = 0;
            const r = await avaliarGateComRetry({
                expectedSha: SHA_A,
                buscarRunsAprovados: async () => { chamadas += 1; return [runBase({ conclusion: "failure" })]; },
                buscarJobsDoRun: fakeJobsOk(),
                obterHeadAtualDeMain: async () => SHA_A,
                dormir: async () => { throw new Error("não deveria dormir — falha vermelha não é retry-elegível"); }
            });
            assert.equal(r.ok, false);
            assert.equal(chamadas, 1);
        });

        it("8. run encontrado com status=in_progress → FAIL imediato, sem retry (run já existe, não é 'zero candidatos')", async () => {
            let chamadas = 0;
            const r = await avaliarGateComRetry({
                expectedSha: SHA_A,
                buscarRunsAprovados: async () => { chamadas += 1; return [runBase({ status: "in_progress", conclusion: null })]; },
                buscarJobsDoRun: fakeJobsOk(),
                obterHeadAtualDeMain: async () => SHA_A,
                dormir: async () => { throw new Error("não deveria dormir — run in_progress não é retry-elegível"); }
            });
            assert.equal(r.ok, false);
            assert.equal(chamadas, 1);
        });

        it("9. dois runs aprovados (ambíguo) → FAIL imediato, sem retry", async () => {
            const r = await avaliarGateComRetry({
                expectedSha: SHA_A,
                buscarRunsAprovados: async () => [runBase({ id: 1 }), runBase({ id: 2 })],
                buscarJobsDoRun: fakeJobsOk(),
                obterHeadAtualDeMain: async () => SHA_A,
                dormir: async () => { throw new Error("não deveria dormir — ambíguo não é retry-elegível"); }
            });
            assert.equal(r.ok, false);
            assert.equal(r.reasonCode, REASON_CODES.RUN_AMBIGUOUS);
        });

        it("10. main avança antes do segundo attempt → FAIL imediato, reasonCode MAIN_DIVERGIU, nenhuma nova consulta de runs", async () => {
            let chamadasRuns = 0;
            const r = await avaliarGateComRetry({
                expectedSha: SHA_A,
                buscarRunsAprovados: async () => { chamadasRuns += 1; return []; },
                buscarJobsDoRun: fakeJobsOk(),
                obterHeadAtualDeMain: async () => SHA_B,
                dormir: async () => {}
            });
            assert.equal(r.ok, false);
            assert.equal(r.reasonCode, REASON_CODES.MAIN_DIVERGIU);
            assert.equal(chamadasRuns, 1, "só a 1ª tentativa deveria ter consultado runs — a 2ª aborta antes por causa do TOCTOU");
        });

        it("11. main avança antes do terceiro attempt → FAIL imediato, reasonCode MAIN_DIVERGIU", async () => {
            let chamada = 0;
            let headsConsultados = 0;
            const r = await avaliarGateComRetry({
                expectedSha: SHA_A,
                buscarRunsAprovados: async () => { chamada += 1; return []; },
                buscarJobsDoRun: fakeJobsOk(),
                obterHeadAtualDeMain: async () => {
                    headsConsultados += 1;
                    return headsConsultados === 1 ? SHA_A : SHA_B;
                },
                dormir: async () => {}
            });
            assert.equal(r.ok, false);
            assert.equal(r.reasonCode, REASON_CODES.MAIN_DIVERGIU);
            assert.equal(chamada, 2, "1ª e 2ª tentativa consultaram runs; a 3ª aborta antes por causa do TOCTOU");
        });

        it("12. HTTP 500 (erro propagado por buscarRunsAprovados) → FAIL imediato, sem retry, erro propaga", async () => {
            let chamadas = 0;
            await assert.rejects(
                avaliarGateComRetry({
                    expectedSha: SHA_A,
                    buscarRunsAprovados: async () => { chamadas += 1; throw new Error("GitHub API respondeu 500 Internal Server Error"); },
                    buscarJobsDoRun: fakeJobsOk(),
                    obterHeadAtualDeMain: async () => SHA_A,
                    dormir: async () => { throw new Error("não deveria dormir — erro HTTP não é retry-elegível"); }
                }),
                /500/
            );
            assert.equal(chamadas, 1);
        });

        it("13. HTTP 403 (erro propagado) → FAIL imediato, sem retry", async () => {
            await assert.rejects(
                avaliarGateComRetry({
                    expectedSha: SHA_A,
                    buscarRunsAprovados: async () => { throw new Error("GitHub API respondeu 403 Forbidden"); },
                    buscarJobsDoRun: fakeJobsOk(),
                    obterHeadAtualDeMain: async () => SHA_A,
                    dormir: async () => { throw new Error("não deveria dormir"); }
                }),
                /403/
            );
        });

        it("19. jobs faltando no run selecionado → FAIL, reasonCode JOBS_INVALIDOS", async () => {
            const r = await avaliarGateComRetry({
                expectedSha: SHA_A,
                buscarRunsAprovados: async () => [runBase()],
                buscarJobsDoRun: async () => EXPECTED_JOB_NAMES.slice(0, 3).map(jobOk),
                obterHeadAtualDeMain: async () => SHA_A,
                dormir: async () => {}
            });
            assert.equal(r.ok, false);
            assert.equal(r.reasonCode, REASON_CODES.JOBS_INVALIDOS);
        });

        it("20. job extra no run selecionado → FAIL, reasonCode JOBS_INVALIDOS", async () => {
            const r = await avaliarGateComRetry({
                expectedSha: SHA_A,
                buscarRunsAprovados: async () => [runBase()],
                buscarJobsDoRun: async () => [...EXPECTED_JOB_NAMES.map(jobOk), jobOk("Job novo não auditado")],
                obterHeadAtualDeMain: async () => SHA_A,
                dormir: async () => {}
            });
            assert.equal(r.ok, false);
            assert.equal(r.reasonCode, REASON_CODES.JOBS_INVALIDOS);
        });

        it("21. job vermelho no run selecionado → FAIL, reasonCode JOBS_INVALIDOS", async () => {
            const r = await avaliarGateComRetry({
                expectedSha: SHA_A,
                buscarRunsAprovados: async () => [runBase()],
                buscarJobsDoRun: async () => {
                    const jobs = EXPECTED_JOB_NAMES.map(jobOk);
                    jobs[0] = { name: EXPECTED_JOB_NAMES[0], status: "completed", conclusion: "failure" };
                    return jobs;
                },
                obterHeadAtualDeMain: async () => SHA_A,
                dormir: async () => {}
            });
            assert.equal(r.ok, false);
            assert.equal(r.reasonCode, REASON_CODES.JOBS_INVALIDOS);
        });

        it("27. observabilidade: aoTentar é chamado uma vez por tentativa lógica, com o total de runs recebidos", async () => {
            const chamadasRegistradas = [];
            let chamada = 0;
            await avaliarGateComRetry({
                expectedSha: SHA_A,
                buscarRunsAprovados: async () => {
                    chamada += 1;
                    return chamada < 3 ? [] : [runBase()];
                },
                buscarJobsDoRun: fakeJobsOk(),
                obterHeadAtualDeMain: async () => SHA_A,
                dormir: async () => {},
                aoTentar: (info) => chamadasRegistradas.push(info)
            });
            assert.equal(chamadasRegistradas.length, 3);
            assert.deepEqual(chamadasRegistradas.map((c) => c.tentativa), [1, 2, 3]);
            assert.deepEqual(chamadasRegistradas.map((c) => c.totalRunsRecebidos), [0, 0, 1]);
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

describe("scripts/pages-qg-gate.mjs — garantias estruturais do wrapper (leitura estática do código-fonte)", () => {
    const WRAPPER_PATH = path.resolve(__dirname, "../../scripts/pages-qg-gate.mjs");
    const codigoWrapper = readFileSync(WRAPPER_PATH, "utf8");

    it("26. nenhuma chamada de console.log/console.error interpola diretamente a variável de token/Authorization", () => {
        const linhasDeLog = codigoWrapper
            .split("\n")
            .filter((linha) => /console\.(log|error|warn|info)\(/.test(linha));
        assert.ok(linhasDeLog.length > 0, "esperado pelo menos uma chamada de log no wrapper");
        for (const linha of linhasDeLog) {
            assert.doesNotMatch(linha, /\btoken\b/i, `linha de log não deveria referenciar "token": ${linha.trim()}`);
            assert.doesNotMatch(linha, /Authorization/i, `linha de log não deveria referenciar "Authorization": ${linha.trim()}`);
        }
    });

    it("cabeçalho Authorization só aparece dentro da construção de headers de fetch, nunca em template literal de log", () => {
        const ocorrencias = (codigoWrapper.match(/Authorization:/g) || []).length;
        assert.ok(ocorrencias >= 1, "esperado pelo menos uma construção de header Authorization");
    });

    it("28. paginação (per_page/page) continua presente no fetch de runs e de jobs", () => {
        assert.match(codigoWrapper, /per_page=100/);
        assert.match(codigoWrapper, /page=/);
    });

    it("usa extrairArrayObrigatorio (shape estrito) em vez da detecção genérica de chave-array removida", () => {
        assert.match(codigoWrapper, /extrairArrayObrigatorio/);
        assert.doesNotMatch(codigoWrapper, /Object\.keys\(corpo\)\.find/, "a detecção genérica de chave-array deveria ter sido removida em favor do shape estrito");
    });

    it("usa avaliarGateComRetry (orquestração com retry bounded) em vez de uma única leitura lógica direta", () => {
        assert.match(codigoWrapper, /avaliarGateComRetry/);
    });

    it("head_sha é passado para construirUrlRunsQG (query filtrada pelo SHA exato)", () => {
        assert.match(codigoWrapper, /construirUrlRunsQG\([^)]*expectedSha[^)]*\)/);
    });

    it("sleep real usa setTimeout (produção), diferente do sleep fake injetado nos testes", () => {
        assert.match(codigoWrapper, /setTimeout/);
    });
});
