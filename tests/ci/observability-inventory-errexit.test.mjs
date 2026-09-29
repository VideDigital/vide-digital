// VIDE-HUB-OBSERVABILITY-INVENTORY-FIX-057 — executa os blocos `run:` REAIS
// de .github/workflows/observability-inventory.yml sob o mesmo shell do
// runner (`bash --noprofile --norc -e -o pipefail`), com `gcloud` e `curl`
// simulados no PATH. Nenhuma rede, nenhuma credencial.
//
// Cobre a classe de bug que derrubou o run 36617755341: com errexit ativo, um
// comando de leitura com exit != 0 abortava o passo inteiro e as fontes
// seguintes nunca rodavam.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const YAML = readFileSync(path.join(RAIZ, ".github/workflows/observability-inventory.yml"), "utf8");
const TOKEN = "ya29.MOCK-SECRET-TOKEN-057";
const EMAIL_SA = "sa-secreta@vide-digital-saas.iam.gserviceaccount.com";
const FONTES_GCLOUD = ["services", "functions", "runServices", "logMetrics", "logSinks", "errorLogs24h"];

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

const GCLOUD_MOCK = `#!/usr/bin/env bash
echo "gcloud $*" >> "$MOCK_LOG"
case "$*" in
  "version"*) echo "Google Cloud SDK 568.0.0" ;;
  "auth print-access-token"*)
    if [ -n "\${MOCK_TOKEN_FAIL:-}" ]; then echo "ERROR: (gcloud.auth.print-access-token) no credentials for ${EMAIL_SA}" >&2; exit 1; fi
    echo "${TOKEN}" ;;
  "services list"*) echo '[{"config":{"name":"monitoring.googleapis.com"}},{"config":{"name":"run.googleapis.com"}}]' ;;
  "functions list"*)
    if [ -n "\${MOCK_FUNCTIONS_INVALID:-}" ]; then echo '{json quebrado'; exit 0; fi
    echo '[{"name":"projects/vide-digital-saas/locations/southamerica-east1/functions/createPublicLead","state":"ACTIVE","environment":"GEN_2"}]' ;;
  "run services list"*) echo '[]' ;;
  "logging metrics list"*)
    if [ -n "\${MOCK_LOGMETRICS_FAIL:-}" ]; then echo "ERROR: (gcloud.logging.metrics.list) PERMISSION_DENIED: Permission denied for ${EMAIL_SA}" >&2; exit 1; fi
    echo '[]' ;;
  "logging sinks list"*) echo '[]' ;;
  "logging read"*) echo '[]' ;;
  *) echo "gcloud mock: comando inesperado" >&2; exit 97 ;;
esac
`;

const CURL_MOCK = `#!/usr/bin/env bash
out=""; url=""; hdr=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    -H) hdr="$2"; shift 2 ;;
    -w|--max-time) shift 2 ;;
    -sS) shift ;;
    -*) echo "curl mock: flag inesperada $1" >&2; exit 98 ;;
    *) url="$1"; shift ;;
  esac
done
case "$hdr" in @*) [ -s "\${hdr#@}" ] || { echo "curl mock: header vazio" >&2; exit 99; } ;; *) echo "curl mock: header fora de arquivo" >&2; exit 99 ;; esac
echo "curl $url" >> "$MOCK_LOG"
case "$url" in
  *alertPolicies*)
    [ -n "\${MOCK_ALERT_DISABLED:-}" ] || { echo '{}' > "$out"; printf 200; exit 0; }
    echo '{"error":{"status":"PERMISSION_DENIED","details":[{"reason":"SERVICE_DISABLED"}]}}' > "$out"; printf 403 ;;
  *) echo '{}' > "$out"; printf 200 ;;
esac
`;

function ambiente(extra = {}) {
    const dir = mkdtempSync(path.join(tmpdir(), "obs-057-"));
    const bin = path.join(dir, "bin");
    mkdirSync(bin);
    writeFileSync(path.join(bin, "gcloud"), GCLOUD_MOCK);
    writeFileSync(path.join(bin, "curl"), CURL_MOCK);
    chmodSync(path.join(bin, "gcloud"), 0o755);
    chmodSync(path.join(bin, "curl"), 0o755);
    const workDir = path.join(dir, "work");
    const env = {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        WORK_DIR: workDir,
        PROJECT_ID: "vide-digital-saas",
        WORKFLOW_SHA: "94751e3dc2b24deea4fd2d5b5aa435eaf94b29b5",
        MOCK_LOG: path.join(dir, "chamadas.log"),
        GITHUB_STEP_SUMMARY: path.join(dir, "summary.md"),
        GITHUB_OUTPUT: path.join(dir, "output.txt"),
        ...extra
    };
    const rodar = (script) => {
        const arquivo = path.join(dir, `passo-${Math.random().toString(36).slice(2)}.sh`);
        writeFileSync(arquivo, script);
        // Exatamente o shell que o GitHub usa para `shell: bash`.
        return spawnSync("bash", ["--noprofile", "--norc", "-e", "-o", "pipefail", arquivo], { cwd: RAIZ, env, encoding: "utf8" });
    };
    const ler = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null);
    return { dir, workDir, raw: path.join(workDir, "raw"), env, rodar, ler, limpar: () => rmSync(dir, { recursive: true, force: true }) };
}

const PASSO_GCLOUD = "Coletar via gcloud";
const PASSO_REST = "Coletar via API REST";
const PASSO_BUILD = "Montar inventário sanitizado";
const PASSO_RESUMO = "Resumo do inventário";

describe("reprodução do run 36617755341 (padrão anterior sob bash -e)", () => {
    // Padrão do passo de coleta em 94751e3 (antes desta correção), literal.
    const PADRAO_ANTERIOR = `set -uo pipefail
RAW="$WORK_DIR/raw"; mkdir -p "$RAW"
coletar() {
  local fonte="$1"; shift
  "$@" > "$RAW/$fonte.json" 2> "$RAW/$fonte.err"
  echo "$?" > "$RAW/$fonte.code"
  echo "$fonte: exit $(cat "$RAW/$fonte.code")"
}
coletar services gcloud services list --enabled
coletar functions gcloud functions list
coletar runServices gcloud run services list
coletar logMetrics gcloud logging metrics list
coletar logSinks gcloud logging sinks list
coletar errorLogs24h gcloud logging read x
`;

    it("exit 1 em logMetrics aborta o passo: status não gravado e fontes seguintes nunca rodam", () => {
        const a = ambiente({ MOCK_LOGMETRICS_FAIL: "1" });
        try {
            const r = a.rodar(PADRAO_ANTERIOR);
            assert.notEqual(r.status, 0, "o padrão anterior aborta sob errexit");
            for (const f of ["services", "functions", "runServices"]) assert.equal(a.ler(path.join(a.raw, `${f}.code`)).trim(), "0");
            assert.equal(existsSync(path.join(a.raw, "logMetrics.code")), false, "status de logMetrics perdido");
            const chamadas = a.ler(a.env.MOCK_LOG);
            assert.doesNotMatch(chamadas, /logging sinks list|logging read/, "fontes seguintes nunca rodaram");
        } finally {
            a.limpar();
        }
    });
});

describe("workflow atual sob bash --noprofile --norc -e -o pipefail", () => {
    it("cenário do run 36617755341: logMetrics falha, demais fontes continuam, REST roda, artefato PARTIAL", () => {
        const a = ambiente({ MOCK_LOGMETRICS_FAIL: "1", MOCK_ALERT_DISABLED: "1" });
        try {
            const g = a.rodar(blocoRun(PASSO_GCLOUD));
            assert.equal(g.status, 0, `passo gcloud deve concluir: ${g.stderr}`);
            for (const f of FONTES_GCLOUD) assert.ok(existsSync(path.join(a.raw, `${f}.code`)), `${f}.code ausente`);
            assert.equal(a.ler(path.join(a.raw, "logMetrics.code")).trim(), "1", "exit code preservado");
            assert.equal(a.ler(path.join(a.raw, "logSinks.code")).trim(), "0");
            assert.equal(a.ler(path.join(a.raw, "errorLogs24h.code")).trim(), "0");
            assert.doesNotMatch(g.stdout + g.stderr, /PERMISSION_DENIED|sa-secreta/, "stderr bruto nunca impresso");

            const rest = a.rodar(blocoRun(PASSO_REST));
            assert.equal(rest.status, 0, `passo REST deve concluir: ${rest.stderr}`);
            assert.equal(a.ler(path.join(a.raw, "alertPolicies.code")).trim(), "http:403");
            assert.equal(a.ler(path.join(a.raw, "dashboards.code")).trim(), "http:200");
            // O único contato do token com o stdout é o comando ::add-mask::,
            // que o runner intercepta (não exibe) e passa a mascarar.
            const comToken = (rest.stdout + rest.stderr).split("\n").filter((l) => l.includes(TOKEN));
            assert.deepEqual(comToken, [`::add-mask::${TOKEN}`], "token só aparece no comando de máscara");
            assert.equal(existsSync(path.join(a.workDir, "auth-header")), false, "arquivo de header removido");

            const b = a.rodar(blocoRun(PASSO_BUILD));
            assert.equal(b.status, 0, `build deve concluir: ${b.stderr}`);
            const artefato = a.ler(path.join(a.workDir, "observability-inventory.json"));
            assert.ok(artefato, "artefato produzido em PARTIAL");
            const inv = JSON.parse(artefato);
            assert.deepEqual(inv.metricCapabilities.sources.logMetrics, { status: "PERMISSION_DENIED", exitCode: 1, httpStatus: null });
            assert.deepEqual(inv.metricCapabilities.sources.alertPolicies, { status: "API_NOT_AVAILABLE", exitCode: null, httpStatus: 403 });
            assert.equal(inv.metricCapabilities.sources.logSinks.status, "OK");
            assert.equal(inv.metricCapabilities.sources.dashboards.status, "OK");
            assert.equal(inv.functions[0].name, "createPublicLead");
            assert.doesNotMatch(artefato + b.stdout, new RegExp(`${TOKEN}|sa-secreta|gserviceaccount|Permission denied|SERVICE_DISABLED`));
            assert.equal(existsSync(a.raw), false, "saídas cruas (stderr incluso) removidas após o build");

            const s = a.rodar(blocoRun(PASSO_RESUMO));
            assert.equal(s.status, 0);
            assert.match(a.ler(a.env.GITHUB_OUTPUT), /^result=PARTIAL$/m);
            const md = a.ler(a.env.GITHUB_STEP_SUMMARY);
            assert.match(md, /OBSERVABILITY INVENTORY/);
            assert.match(md, /\| Log metrics \| PERMISSION_DENIED \|/);
            assert.match(md, /\| Log sinks \| OK \| 0 \|/);
            assert.match(md, /\| Alert policies \| API_NOT_AVAILABLE \|/);
            assert.match(md, /\| \*\*Inventory result\*\* \| \*\*PARTIAL\*\* \|/);

            const chamadas = a.ler(a.env.MOCK_LOG);
            assert.doesNotMatch(chamadas, /\b(create|update|delete|enable|deploy|add-iam|set-iam|write)\b/, "nenhuma escrita");
        } finally {
            a.limpar();
        }
    });

    it("todas as fontes OK → PASS", () => {
        const a = ambiente();
        try {
            for (const p of [PASSO_GCLOUD, PASSO_REST, PASSO_BUILD, PASSO_RESUMO]) {
                const r = a.rodar(blocoRun(p));
                assert.equal(r.status, 0, `${p}: ${r.stderr}`);
            }
            const inv = JSON.parse(a.ler(path.join(a.workDir, "observability-inventory.json")));
            assert.ok(Object.values(inv.metricCapabilities.sources).every((s) => s.status === "OK"));
            assert.match(a.ler(a.env.GITHUB_OUTPUT), /^result=PASS$/m);
        } finally {
            a.limpar();
        }
    });

    it("token indisponível → REST_AUTH_UNAVAILABLE explícito em cada fonte REST, nenhum curl, PARTIAL", () => {
        const a = ambiente({ MOCK_TOKEN_FAIL: "1" });
        try {
            assert.equal(a.rodar(blocoRun(PASSO_GCLOUD)).status, 0);
            const rest = a.rodar(blocoRun(PASSO_REST));
            assert.equal(rest.status, 0, rest.stderr);
            assert.match(rest.stdout, /REST_AUTH_UNAVAILABLE/);
            assert.doesNotMatch(rest.stdout + rest.stderr, /sa-secreta|no credentials/);
            assert.doesNotMatch(a.ler(a.env.MOCK_LOG), /^curl /m, "nenhuma chamada REST sem token");
            assert.equal(a.rodar(blocoRun(PASSO_BUILD)).status, 0);
            const inv = JSON.parse(a.ler(path.join(a.workDir, "observability-inventory.json")));
            for (const f of ["alertPolicies", "notificationChannels", "uptimeChecks", "dashboards", "errorGroups24h", "requestCount24h", "metricDescriptor0"]) {
                assert.equal(inv.metricCapabilities.sources[f].status, "REST_AUTH_UNAVAILABLE", f);
            }
            assert.equal(a.rodar(blocoRun(PASSO_RESUMO)).status, 0);
            assert.match(a.ler(a.env.GITHUB_OUTPUT), /^result=PARTIAL$/m);
        } finally {
            a.limpar();
        }
    });
});

describe("erro estrutural continua FAIL (a correção não ignora qualquer erro)", () => {
    it("JSON inválido numa fonte que respondeu exit 0 → build falha e nenhum artefato é gerado", () => {
        const a = ambiente({ MOCK_FUNCTIONS_INVALID: "1" });
        try {
            assert.equal(a.rodar(blocoRun(PASSO_GCLOUD)).status, 0);
            const b = a.rodar(blocoRun(PASSO_BUILD));
            assert.notEqual(b.status, 0, "build precisa falhar");
            assert.match(b.stderr, /functions/);
            assert.equal(existsSync(path.join(a.workDir, "observability-inventory.json")), false);
        } finally {
            a.limpar();
        }
    });

    it("core quebrando ao gerar as URLs REST (projeto fora da allowlist) → passo REST falha", () => {
        const a = ambiente({ PROJECT_ID: "outro-projeto" });
        try {
            mkdirSync(path.join(a.workDir, "raw"), { recursive: true });
            const r = a.rodar(blocoRun(PASSO_REST));
            assert.notEqual(r.status, 0);
            assert.equal(readdirSync(path.join(a.workDir, "raw")).length, 0, "nenhuma chamada REST feita");
        } finally {
            a.limpar();
        }
    });

    it("diretório de trabalho inutilizável → passo gcloud falha", () => {
        const a = ambiente();
        try {
            writeFileSync(path.join(a.dir, "arquivo"), "x");
            const r = spawnSync("bash", ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", blocoRun(PASSO_GCLOUD)], {
                cwd: RAIZ, env: { ...a.env, WORK_DIR: path.join(a.dir, "arquivo") }, encoding: "utf8"
            });
            assert.notEqual(r.status, 0);
        } finally {
            a.limpar();
        }
    });
});
