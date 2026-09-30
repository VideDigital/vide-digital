// VIDE-HUB-SERVER-ERROR-DEPLOY-CHANNEL-068 — garantias do canal de deploy
// .github/workflows/firebase-deploy-server-error-067.yml, sem executar o
// workflow e sem credenciais/rede:
// - checagens estáticas do YAML (gatilho, inputs, lista fixa, ausência de
//   deploy genérico/Rules/Storage/indexes/Hosting/Pages/Secrets);
// - execução dos blocos `run:` REAIS de validação e de deploy sob o shell
//   do runner (`bash --noprofile --norc -e -o pipefail`), com `pnpm`
//   simulado no PATH registrando o argv exato que seria enviado ao
//   Firebase CLI.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WORKFLOW = ".github/workflows/firebase-deploy-server-error-067.yml";
const YAML = readFileSync(path.join(RAIZ, WORKFLOW), "utf8");
const SEM_COMENTARIOS = YAML.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");

const FUNCTIONS_067 = ["createEmployee", "createAdminMember", "askBusinessAI", "askPublicBusinessAI"];
const LISTA_ESPERADA = FUNCTIONS_067.map((n) => `functions:${n}`).join(",");
const SHA_OK = "ec696901111dff92514da0bfd00ef58290f4d8e2";

function listaDoWorkflow() {
    const match = YAML.match(/^\s{2}SERVER_ERROR_067_FUNCTIONS:\s*"([^"]+)"\s*$/m);
    assert.ok(match, "env SERVER_ERROR_067_FUNCTIONS não encontrada");
    return match[1];
}

// Corpo do `run: |` de um passo, sem a indentação do YAML.
function blocoRun(trechoNome) {
    const linhas = YAML.split("\n");
    const i = linhas.findIndex((l) => /^\s{6}- name: /.test(l) && l.includes(trechoNome));
    assert.ok(i >= 0, `passo "${trechoNome}" não encontrado`);
    let j = i + 1;
    while (!/^\s{8}run: \|/.test(linhas[j])) {
        assert.ok(j < linhas.length && !/^\s{6}- name: /.test(linhas[j]), `passo "${trechoNome}" sem run: |`);
        j++;
    }
    const corpo = [];
    for (let k = j + 1; k < linhas.length; k++) {
        const l = linhas[k];
        if (l.trim() === "") corpo.push("");
        else if (l.startsWith(" ".repeat(10))) corpo.push(l.slice(10));
        else break;
    }
    return corpo.join("\n");
}

const tmp = mkdtempSync(path.join(tmpdir(), "deploy-067-"));
after(() => rmSync(tmp, { recursive: true, force: true }));
const PNPM_MOCK = path.join(tmp, "pnpm");
writeFileSync(PNPM_MOCK, '#!/usr/bin/env bash\nprintf "%s\\n" "$@" > "$MOCK_ARGV"\n');
chmodSync(PNPM_MOCK, 0o755);

// Mesmo shell do runner do GitHub Actions para `shell: bash`.
function executar(bloco, env) {
    const argvArquivo = path.join(tmp, `argv-${Math.random().toString(36).slice(2)}`);
    const r = spawnSync("bash", ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", bloco], {
        encoding: "utf8",
        env: { PATH: `${tmp}:${process.env.PATH}`, MOCK_ARGV: argvArquivo, ...env }
    });
    let argv = null;
    try { argv = readFileSync(argvArquivo, "utf8").trimEnd().split("\n"); } catch { /* pnpm não chamado */ }
    return { status: r.status, saida: `${r.stdout}${r.stderr}`, argv };
}

const ENTRADA_VALIDA = {
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REF: "refs/heads/main",
    PROJECT_ID: "vide-digital-saas",
    EXPECTED_SHA: SHA_OK,
    CONFIRM_PRODUCTION: "DEPLOY_SERVER_ERROR_067"
};

describe("068 — canal de deploy da missão 067: garantias estáticas", () => {
    it("dispara SOMENTE por workflow_dispatch (sem push, pull_request ou schedule)", () => {
        const blocoOn = YAML.match(/^on:\s*\n([\s\S]*?)^\S/m);
        assert.ok(blocoOn, "bloco on: não encontrado");
        const gatilhos = [...blocoOn[1].matchAll(/^\s{2}([a-z_]+):/gm)].map((m) => m[1]);
        assert.deepEqual(gatilhos, ["workflow_dispatch"]);
        assert.doesNotMatch(SEM_COMENTARIOS, /^\s*(push|pull_request|pull_request_target|schedule|workflow_run|repository_dispatch):/m);
    });

    for (const input of ["project_id", "expected_sha", "confirm_production"]) {
        it(`input ${input} é obrigatório`, () => {
            const bloco = YAML.match(new RegExp(`^\\s{6}${input}:\\s*\\n((?:\\s{8}.*\\n)+)`, "m"));
            assert.ok(bloco, `input ${input} não encontrado`);
            assert.match(bloco[1], /required:\s*true/);
        });
    }

    it("nenhum input permite escolher Functions (lista nunca vem do usuário)", () => {
        const inputs = [...YAML.matchAll(/^\s{6}([a-z_]+):\s*$/gm)].map((m) => m[1]);
        assert.deepEqual(inputs.sort(), ["confirm_production", "expected_sha", "project_id"]);
        assert.doesNotMatch(SEM_COMENTARIOS, /--only\s+"?\$\{\{\s*inputs\./);
    });

    it("a lista fixa contém exatamente as 4 Functions da missão 067", () => {
        const entradas = listaDoWorkflow().split(",");
        assert.equal(entradas.length, 4);
        assert.deepEqual(entradas.map((e) => e.replace(/^functions:/, "")).sort(), [...FUNCTIONS_067].sort());
        for (const e of entradas) assert.match(e, /^functions:[A-Za-z][A-Za-z0-9]*$/, `entrada inválida: ${e}`);
        assert.equal(listaDoWorkflow(), LISTA_ESPERADA);
    });

    it("nenhuma Function whatsapp* na lista nem em qualquer comando", () => {
        assert.ok(!listaDoWorkflow().toLowerCase().includes("whatsapp"));
        assert.doesNotMatch(SEM_COMENTARIOS, /functions:whatsapp/i);
    });

    it("todo --only usa a lista fixa; nunca \"--only functions\" genérico", () => {
        const usos = [...SEM_COMENTARIOS.matchAll(/--only\s+(\S+)/g)].map((m) => m[1]);
        assert.ok(usos.length >= 2, "esperado dry-run + deploy real");
        for (const uso of usos) assert.equal(uso, '"${SERVER_ERROR_067_FUNCTIONS}"');
        assert.doesNotMatch(SEM_COMENTARIOS, /--only\s+"?functions"?(?!:)(?=[\s"\\]|$)/m);
    });

    it("não publica Rules, Storage, indexes, Hosting nem Pages; não mexe em Secrets", () => {
        assert.doesNotMatch(SEM_COMENTARIOS, /firestore:rules|firestore:indexes|--only\s+"?(storage|hosting|firestore)\b/i);
        assert.doesNotMatch(SEM_COMENTARIOS, /pages-publish|actions\/deploy-pages|upload-pages-artifact/i);
        assert.doesNotMatch(SEM_COMENTARIOS, /functions:secrets|secrets:set|secretmanager|gcloud\s+secrets|gcloud\s+(projects|iam)\b/i);
    });

    it("todo comando do Firebase CLI usa a versão fixa 13.35.1 e --non-interactive", () => {
        const comandos = [...SEM_COMENTARIOS.matchAll(/pnpm dlx (firebase-tools@\S+) deploy([\s\S]*?)(?=\n\s*\n|\n\s{6}- name:|$)/g)];
        assert.equal(comandos.length, 2, "esperado exatamente dry-run + deploy real");
        for (const [, versao, resto] of comandos) {
            assert.equal(versao, "firebase-tools@13.35.1");
            assert.match(resto, /--non-interactive/);
            assert.match(resto, /--project "\$\{PROJECT_ID\}"/);
        }
    });

    it("dry-run não-interativo vem antes do deploy real", () => {
        const dry = blocoRun("Pré-flight seguro: dry-run");
        const real = blocoRun("Publicar as 4 Functions da missão 067");
        assert.match(dry, /--dry-run/);
        assert.doesNotMatch(real, /--dry-run/);
        assert.ok(YAML.indexOf("Pré-flight seguro: dry-run") < YAML.indexOf("- name: Publicar as 4 Functions da missão 067"));
    });

    it("SHA validado no job de testes E no job de deploy", () => {
        const jobs = YAML.split(/^\s{2}deploy:\s*$/m);
        assert.equal(jobs.length, 2, "job deploy não encontrado");
        assert.match(jobs[0], /ACTUAL_SHA="\$\(git rev-parse HEAD\)"[\s\S]*ACTUAL_SHA\}" != "\$\{EXPECTED_SHA\}"/);
        assert.match(jobs[1], /ACTUAL_SHA="\$\(git rev-parse HEAD\)"[\s\S]*ACTUAL_SHA\}" != "\$\{EXPECTED_SHA\}"/);
        assert.match(YAML, /needs:\s*validate-and-test/);
    });

    it("roda a suíte exigida antes do deploy", () => {
        const jobTestes = YAML.split(/^\s{2}deploy:\s*$/m)[0];
        for (const cmd of ["pnpm install --frozen-lockfile", "pnpm run check", "pnpm run test:functions", "pnpm run test:unit",
            "pnpm run test:ci-workflows", "pnpm run test:rules", "pnpm run test:frontend:emulator"]) {
            assert.ok(jobTestes.includes(cmd), `faltando no job de testes: ${cmd}`);
        }
    });

    it("autenticação reaproveita o padrão existente (WIF ou FIREBASE_SERVICE_ACCOUNT), sem firebase login/token", () => {
        assert.match(YAML, /GCP_WORKLOAD_IDENTITY_PROVIDER/);
        assert.match(YAML, /FIREBASE_SERVICE_ACCOUNT/);
        assert.match(YAML, /Nenhum método de autenticação configurado/);
        assert.doesNotMatch(SEM_COMENTARIOS, /firebase login\b|FIREBASE_TOKEN/);
    });
});

describe("068 — blocos de validação reais sob o shell do runner", () => {
    const validar = blocoRun("Validar branch, project_id, expected_sha e confirmação");

    it("entrada correta passa", () => {
        const r = executar(validar, ENTRADA_VALIDA);
        assert.equal(r.status, 0, r.saida);
    });

    const invalidas = [
        ["evento push", { GITHUB_EVENT_NAME: "push" }, /somente execução manual/],
        ["branch diferente de main", { GITHUB_REF: "refs/heads/feature" }, /somente a partir da branch main/],
        ["projeto demo", { PROJECT_ID: "demo-vide-hub" }, /'demo'/],
        ["projeto staging", { PROJECT_ID: "vide-digital-staging" }, /exclusivamente no projeto vide-digital-saas/],
        ["projeto vazio", { PROJECT_ID: "" }, /exclusivamente no projeto vide-digital-saas/],
        ["SHA vazio", { EXPECTED_SHA: "" }, /40 caracteres/],
        ["SHA curto", { EXPECTED_SHA: "ec69690" }, /40 caracteres/],
        ["confirmação de outro canal", { CONFIRM_PRODUCTION: "DEPLOY_FUNCTIONS" }, /DEPLOY_SERVER_ERROR_067/],
        ["confirmação em minúsculas", { CONFIRM_PRODUCTION: "deploy_server_error_067" }, /DEPLOY_SERVER_ERROR_067/]
    ];
    for (const [rotulo, mudanca, mensagem] of invalidas) {
        it(`rejeita ${rotulo}`, () => {
            const r = executar(validar, { ...ENTRADA_VALIDA, ...mudanca });
            assert.notEqual(r.status, 0, `deveria falhar: ${rotulo}`);
            assert.match(r.saida, mensagem);
        });
    }

    const validarLista = blocoRun("Validar a lista fixa de Functions");
    it("lista fixa do workflow passa na validação de lista", () => {
        const r = executar(validarLista, { SERVER_ERROR_067_FUNCTIONS: listaDoWorkflow() });
        assert.equal(r.status, 0, r.saida);
    });
    for (const [rotulo, lista] of [
        ["whatsapp adicionada", `${LISTA_ESPERADA},functions:whatsappWebhook`],
        ["Function extra", `${LISTA_ESPERADA},functions:updateEmployee`],
        ["Function faltando", LISTA_ESPERADA.split(",").slice(0, 3).join(",")],
        ["deploy genérico", "functions"],
        ["troca por whatsapp", LISTA_ESPERADA.replace("createAdminMember", "whatsappSendText")]
    ]) {
        it(`validação de lista rejeita: ${rotulo}`, () => {
            const r = executar(validarLista, { SERVER_ERROR_067_FUNCTIONS: lista });
            assert.notEqual(r.status, 0, r.saida);
        });
    }

    const conferirSha = blocoRun("Confirmar novamente o SHA aprovado");
    it("SHA divergente do checkout aborta o job de deploy", () => {
        const repo = path.join(tmp, "repo");
        spawnSync("git", ["init", "-q", repo]);
        spawnSync("git", ["-C", repo, "-c", "user.email=qa@example.test", "-c", "user.name=qa", "commit", "-q", "--allow-empty", "-m", "x"]);
        const head = spawnSync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
        const bloco = `cd "${repo}"\n${conferirSha}`;
        assert.equal(executar(bloco, { EXPECTED_SHA: head }).status, 0);
        const r = executar(bloco, { EXPECTED_SHA: SHA_OK });
        assert.notEqual(r.status, 0);
        assert.match(r.saida, /SHA da main diverge/);
    });
});

describe("068 — comando final enviado ao Firebase CLI (pnpm simulado)", () => {
    const env = { SERVER_ERROR_067_FUNCTIONS: listaDoWorkflow(), PROJECT_ID: "vide-digital-saas" };
    const esperado = ["dlx", "firebase-tools@13.35.1", "deploy", "--only", LISTA_ESPERADA, "--project", "vide-digital-saas", "--non-interactive"];

    it("deploy real equivale exatamente ao comando autorizado", () => {
        const r = executar(blocoRun("Publicar as 4 Functions da missão 067"), env);
        assert.equal(r.status, 0, r.saida);
        assert.deepEqual(r.argv, esperado);
        assert.ok(!r.argv.join(" ").toLowerCase().includes("whatsapp"));
    });

    it("dry-run usa o mesmo escopo + --dry-run", () => {
        const r = executar(blocoRun("Pré-flight seguro: dry-run"), env);
        assert.equal(r.status, 0, r.saida);
        assert.deepEqual(r.argv, [...esperado, "--dry-run"]);
    });
});
