// VIDE-HUB-OBSERVABILITY-INVENTORY-PREP-053 — teste estático do workflow
// .github/workflows/observability-inventory.yml. Não executa nada nem usa
// rede: lê o YAML e prova que o canal é manual, com gates antes de
// autenticar, e estritamente somente leitura.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, it } from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const conteudo = readFileSync(path.resolve(__dirname, "../../.github/workflows/observability-inventory.yml"), "utf8");
const executavel = conteudo.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");

const blocoOn = executavel.slice(executavel.indexOf("\non:"), executavel.indexOf("\npermissions:"));

const passos = executavel.split(/\n\s{6}- name: /).slice(1).map((b) => ({ nome: b.split("\n")[0], corpo: b }));
const passo = (trecho) => {
    const achado = passos.find((p) => p.nome.includes(trecho));
    assert.ok(achado, `passo "${trecho}" não encontrado`);
    return achado;
};
const indice = (trecho) => passos.findIndex((p) => p.nome.includes(trecho));

// Invocações reais do CLI gcloud (fora mensagens de erro/aviso).
const gcloudLinhas = executavel
    .split("\n")
    .filter((l) => /(^|[\s"($])gcloud [a-z]/.test(l) && !/::(error|warning)::/.test(l))
    .map((l) => l.trim());

describe("observability-inventory.yml — gatilho, permissões e concorrência", () => {
    it("nome e somente workflow_dispatch (nunca push/pull_request/schedule)", () => {
        assert.match(executavel, /^name: Observability Inventory — Read Only$/m);
        assert.match(blocoOn, /workflow_dispatch:/);
        assert.doesNotMatch(blocoOn, /\bpush:|pull_request|schedule:|workflow_run|repository_dispatch|workflow_call/);
    });

    it("inputs obrigatórios: project_id, expected_sha, confirm_read_only (e nenhum outro)", () => {
        for (const input of ["project_id", "expected_sha", "confirm_read_only"]) {
            assert.match(blocoOn, new RegExp(`\\n\\s{6}${input}:[\\s\\S]*?required: true`), input);
        }
        const nomes = [...blocoOn.matchAll(/\n\s{6}([a-z_]+):\n/g)].map((m) => m[1]);
        assert.deepEqual(nomes, ["project_id", "expected_sha", "confirm_read_only"]);
        assert.match(blocoOn, /default: vide-digital-saas/);
    });

    it("permissões mínimas: contents read, id-token write, actions read — nada de write", () => {
        assert.match(executavel, /permissions:\s*\n\s*contents: read\s*\n\s*id-token: write\s*\n\s*actions: read\s*\n/);
        assert.doesNotMatch(executavel, /contents: write|pull-requests: write|packages: write|issues: write|deployments: write|pages: write|actions: write/);
    });

    it("concorrência única sem cancelamento", () => {
        assert.match(executavel, /concurrency:\s*\n\s*group: vide-hub-observability-inventory\s*\n\s*cancel-in-progress: false/);
    });
});

describe("gates antes de autenticar", () => {
    it("main, SHA exato, entradas e Quality Gate vêm antes da autenticação", () => {
        const auth = indice("Detectar método de autenticação");
        assert.ok(auth > 0);
        for (const gate of ["Bloquear execução fora da main", "Validar identidade do SHA", "Confirmar SHA do checkout", "Validar entradas", "Exigir Quality Gate completo"]) {
            const i = indice(gate);
            assert.ok(i >= 0 && i < auth, `${gate} precisa vir antes da autenticação`);
        }
        assert.match(passo("Bloquear execução fora da main").corpo, /"\$GITHUB_REF" != "refs\/heads\/main"/);
        assert.match(passo("Validar identidade do SHA").corpo, /\^\[0-9a-f\]\{40\}\$/);
        assert.match(passo("Validar identidade do SHA").corpo, /context\.sha !== expectedSha/);
        assert.match(passo("Validar identidade do SHA").corpo, /getBranch\([\s\S]*branch: "main"[\s\S]*branch\.commit\.sha !== expectedSha/);
        assert.match(passo("Checkout explícito").corpo, /ref: \$\{\{ inputs\.expected_sha \}\}[\s\S]*persist-credentials: false/);
        assert.match(passo("Confirmar SHA do checkout").corpo, /git rev-parse HEAD\)" != "\$EXPECTED_SHA"/);
        assert.match(passo("Validar entradas").corpo, /node scripts\/observability-inventory-cli\.mjs inputs/);
        assert.match(passo("Exigir Quality Gate completo").corpo, /node scripts\/pages-qg-gate\.mjs/);
    });

    it("confirmação e projeto vêm do env (validados pelo CLI), nunca interpolados em run/script", () => {
        assert.match(executavel, /CONFIRMACAO: \$\{\{ inputs\.confirm_read_only \}\}/);
        assert.match(executavel, /PROJECT_ID: \$\{\{ inputs\.project_id \}\}/);
        for (const p of passos) {
            const run = p.corpo.split(/\n\s{8}run: \|?/)[1] || "";
            const script = p.corpo.split(/\n\s{10}script: \|/)[1] || "";
            assert.doesNotMatch(run, /\$\{\{\s*inputs\./, `inputs interpolado no run de "${p.nome}"`);
            assert.doesNotMatch(script, /\$\{\{\s*inputs\./, `inputs interpolado no script de "${p.nome}"`);
        }
    });

    it("autenticação reutiliza o padrão existente (WIF, fallback chave) sem criar credencial/IAM", () => {
        assert.match(executavel, /google-github-actions\/auth@v3/);
        assert.match(executavel, /workload_identity_provider: \$\{\{ secrets\.GCP_WORKLOAD_IDENTITY_PROVIDER \}\}/);
        assert.match(executavel, /credentials_json: \$\{\{ secrets\.FIREBASE_SERVICE_ACCOUNT \}\}/);
        assert.doesNotMatch(executavel, /gcloud iam|add-iam-policy-binding|remove-iam-policy-binding|set-iam-policy|service-accounts (create|keys)|projects add-iam/);
    });
});

describe("somente leitura", () => {
    it("todo comando gcloud está na allowlist de leitura", () => {
        const permitidos = [
            /^gcloud version \| head -1$/,
            /^coletar services gcloud services list --enabled /,
            /^coletar functions gcloud functions list /,
            /^coletar runServices gcloud run services list /,
            /^coletar logMetrics gcloud logging metrics list /,
            /^coletar logSinks gcloud logging sinks list /,
            /^coletar errorLogs24h gcloud logging read /,
            /^TOKEN="\$\(gcloud auth print-access-token 2>\/dev\/null\)"$/
        ];
        assert.ok(gcloudLinhas.length >= 8, `esperado ao menos 8 comandos gcloud, achou ${gcloudLinhas.length}`);
        for (const linha of gcloudLinhas) {
            assert.ok(permitidos.some((re) => re.test(linha)), `comando gcloud fora da allowlist: ${linha}`);
        }
    });

    it("nenhum create/update/delete/enable/deploy de qualquer recurso", () => {
        assert.doesNotMatch(executavel, /gcloud services enable|services enable|\benable-api\b/);
        for (const linha of gcloudLinhas) {
            assert.doesNotMatch(linha, /gcloud [a-z -]*\b(create|update|delete|patch|undelete|deploy|set|remove|disable|enable|write|add|import|restore)\b/, linha);
        }
        assert.doesNotMatch(executavel, /monitoring (policies|channels|uptime|dashboards) (create|update|delete)|logging (metrics|sinks) (create|update|delete)|logging write/);
        assert.doesNotMatch(executavel, /firebase deploy|functions deploy|run deploy|firestore:rules|firestore:indexes|terraform|gsutil/);
    });

    it("não toca WhatsApp", () => {
        assert.doesNotMatch(executavel, /whatsapp/i);
    });

    it("curl só faz GET: sem método explícito, corpo ou upload", () => {
        const curls = executavel.split("\n").filter((l) => /\bcurl\b/.test(l));
        assert.equal(curls.length, 1, "exatamente uma chamada curl (loop de GETs)");
        assert.doesNotMatch(curls[0], /\s-X\b|--request|\s-d\b|--data|\s-F\b|--form|\s-T\b|--upload-file|--json|\bPOST\b|\bPUT\b|\bPATCH\b|\bDELETE\b|-I\b/);
        assert.match(curls[0], /-H @"\$HDR"/, "token via arquivo de header, nunca na linha de comando");
    });

    it("URLs REST vêm do core e são restritas a Monitoring / Error Reporting", () => {
        const rest = passo("Coletar via API REST").corpo;
        assert.match(rest, /node scripts\/observability-inventory-cli\.mjs rest-urls/);
        assert.match(rest, /https:\/\/monitoring\.googleapis\.com\/\*\|https:\/\/clouderrorreporting\.googleapis\.com\/\*\) ;;/);
        assert.match(rest, /\*\) echo "::error::URL fora da allowlist/);
    });

    it("token mascarado, header 0600 e removido; saídas cruas nunca impressas", () => {
        const rest = passo("Coletar via API REST").corpo;
        assert.match(rest, /echo "::add-mask::\$TOKEN"/);
        assert.match(rest, /umask 077/);
        assert.match(rest, /trap 'rm -f "\$HDR"' EXIT/);
        assert.match(rest, /unset TOKEN/);
        assert.doesNotMatch(executavel, /cat "\$RAW\/\$fonte\.(json|err)"|cat "\$RAW\/\$FONTE\.(json|err)"|echo "\$TOKEN"|set -x/);
    });

    it("gcloud nunca oferece habilitar API (prompts desligados)", () => {
        assert.match(executavel, /CLOUDSDK_CORE_DISABLE_PROMPTS: "1"/);
        assert.match(executavel, /CLOUDSDK_CORE_SHOULD_PROMPT_TO_ENABLE_API: "false"/);
    });

    it("logs de erro: só campos de recurso e severidade, nunca payload", () => {
        const linha = gcloudLinhas.find((l) => l.includes("logging read"));
        assert.match(linha, /--freshness=1d --limit=1000/);
        assert.match(linha, /--format="json\(resource\.type,resource\.labels\.service_name,resource\.labels\.function_name,severity\)"/);
        assert.doesNotMatch(linha, /Payload|httpRequest|labels\)|--format=json /);
    });
});

describe("artefato e resumo", () => {
    it("artefato observability-inventory publica só o JSON sanitizado (nunca o diretório raw)", () => {
        const uploads = passos.filter((p) => /actions\/upload-artifact/.test(p.corpo));
        assert.equal(uploads.length, 1);
        assert.match(uploads[0].corpo, /name: observability-inventory\n/);
        assert.match(uploads[0].corpo, /path: \$\{\{ runner\.temp \}\}\/observability-inventory\/observability-inventory\.json\n/);
        assert.doesNotMatch(uploads[0].corpo, /raw|auth-header|rest-urls/);
    });

    it("inventário montado pelo core e resumo com OBSERVABILITY INVENTORY", () => {
        assert.match(passo("Montar inventário sanitizado").corpo, /observability-inventory-cli\.mjs build "\$WORK_DIR\/raw"/);
        assert.match(passo("Resumo do inventário").corpo, /observability-inventory-cli\.mjs summary/);
        assert.match(passo("Resumo do inventário").corpo, /OBSERVABILITY INVENTORY/);
        assert.ok(indice("Coletar via gcloud") > indice("Configurar gcloud"));
        assert.ok(indice("Montar inventário") > indice("Coletar via API REST"));
    });
});
