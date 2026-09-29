// VIDE-HUB-RECOVERY-AUTOMATION-PREP-049A — teste estático do workflow
// .github/workflows/recovery-minimal-gate.yml. Não executa nada nem usa
// rede: lê o YAML e prova as garantias de segurança do canal de recovery.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, it } from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const conteudo = readFileSync(path.resolve(__dirname, "../../.github/workflows/recovery-minimal-gate.yml"), "utf8");
const executavel = conteudo.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");

// Bloco `on:` até `permissions:`.
const blocoOn = executavel.slice(executavel.indexOf("\non:"), executavel.indexOf("\npermissions:"));

// Passos do job como blocos de texto ("- name: ...").
const passos = executavel.split(/\n\s{6}- name: /).slice(1).map((b) => ({ nome: b.split("\n")[0], corpo: b }));
const passo = (trecho) => {
    const achado = passos.find((p) => p.nome.includes(trecho));
    assert.ok(achado, `passo "${trecho}" não encontrado`);
    return achado;
};
const indice = (trecho) => passos.findIndex((p) => p.nome.includes(trecho));

describe("recovery-minimal-gate.yml — gatilho, permissões e concorrência", () => {
    it("somente workflow_dispatch (nunca push/pull_request/schedule)", () => {
        assert.match(blocoOn, /workflow_dispatch:/);
        assert.doesNotMatch(blocoOn, /\bpush:|pull_request|schedule:|workflow_run|repository_dispatch/);
    });

    it("stage é choice com exatamente preflight e enable-and-drill; demais inputs obrigatórios", () => {
        assert.match(blocoOn, /stage:[\s\S]*?type: choice[\s\S]*?options:\s*\n\s*- preflight\s*\n\s*- enable-and-drill\s*\n/);
        for (const input of ["project_id", "database_id", "expected_sha", "confirm_production", "qa_slug"]) {
            assert.match(blocoOn, new RegExp(`${input}:[\\s\\S]*?required: true`), input);
        }
    });

    it("permissões mínimas: contents read, id-token write, actions read — nunca contents write", () => {
        assert.match(executavel, /permissions:\s*\n\s*contents: read\s*\n\s*id-token: write\s*\n\s*actions: read/);
        assert.doesNotMatch(executavel, /contents: write|pull-requests: write|packages: write/);
    });

    it("concorrência única sem cancelamento", () => {
        assert.match(executavel, /concurrency:\s*\n\s*group: vide-hub-recovery-production\s*\n\s*cancel-in-progress: false/);
    });
});

describe("gates antes de autenticar", () => {
    it("main, SHA exato (github.sha == expected_sha == HEAD de main), entradas e Quality Gate vêm antes da autenticação", () => {
        const auth = indice("Detectar método de autenticação");
        assert.ok(auth > 0);
        for (const gate of ["Bloquear execução fora da main", "Validar identidade do SHA", "Confirmar SHA do checkout", "Validar entradas", "Exigir Quality Gate completo"]) {
            const i = indice(gate);
            assert.ok(i >= 0 && i < auth, `${gate} precisa vir antes da autenticação`);
        }
        assert.match(passo("Validar identidade do SHA").corpo, /context\.sha !== expectedSha/);
        assert.match(passo("Validar identidade do SHA").corpo, /getBranch\([\s\S]*branch: "main"/);
        assert.match(passo("Exigir Quality Gate completo").corpo, /node scripts\/pages-qg-gate\.mjs/);
        assert.match(passo("Validar entradas").corpo, /node scripts\/recovery-gate-cli\.mjs inputs/);
    });

    it("inputs nunca são interpolados diretamente em scripts shell/JS", () => {
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
        assert.doesNotMatch(executavel, /gcloud iam|add-iam-policy-binding|service-accounts (create|keys)|gcloud auth print-access-token/);
    });
});

describe("escritas: só PITR + delete protection, só no stage autorizado", () => {
    // Invocações reais do CLI (`gcloud <grupo>`), fora mensagens de erro e o `--help` de checagem de sintaxe.
    const gcloudLinhas = executavel.split("\n").filter((l) => /(^|[\s"($])gcloud [a-z]/.test(l) && !l.includes("::error::") && !/--help/.test(l));

    it("o único comando gcloud de escrita é databases update, e só no stage enable-and-drill", () => {
        const escritas = gcloudLinhas.filter((l) => !/\b(describe|list|du|version)\b/.test(l));
        assert.equal(escritas.length, 1, `comandos gcloud não-leitura: ${escritas.join(" | ")}`);
        assert.match(escritas[0], /gcloud firestore databases update --database="\$DATABASE_ID" --project="\$PROJECT_ID" "\$\{ARGS\[@\]\}" --quiet/);
        const update = passo("Habilitar delete protection e PITR");
        assert.match(update.corpo, /if: inputs\.stage == 'enable-and-drill' && steps\.plan\.outputs\.needs_update == 'true'/);
        assert.match(update.corpo, /--delete-protection\|--enable-pitr\) ARGS\+=/);
    });

    it("nenhum no-*/disable, deploy, backup schedule, Storage, Functions, Rules, índices ou WhatsApp", () => {
        assert.doesNotMatch(executavel, /--no-enable-pitr|--no-delete-protection|firebase deploy|backups schedules (create|delete|update)|backups delete|databases (delete|restore|clone|create)|gcloud firestore (export|import)|storage buckets update|gsutil|storage rm|functions deploy|firestore:rules|firestore:indexes|terraform|whatsapp/i);
    });

    it("todo passo de escrita/drill está condicionado a enable-and-drill; preflight só lê", () => {
        for (const trecho of ["Exigir billing", "Confirmar sintaxe GA", "Planejar escrita", "Revalidar que main", "Habilitar delete protection", "Verificar estado final", "Instalar dependências", "Drill seletivo"]) {
            assert.match(passo(trecho).corpo, /if: inputs\.stage == 'enable-and-drill'/, trecho);
        }
        const preflight = passo("Preflight somente leitura").corpo;
        assert.doesNotMatch(preflight, /\bupdate\b|recovery-drill-049/);
        assert.doesNotMatch(preflight, /if: inputs\.stage/);
    });

    it("billing, sintaxe GA, revalidação de main e plano idempotente vêm antes do update; verificação e drill depois", () => {
        const update = indice("Habilitar delete protection");
        for (const antes of ["Preflight somente leitura", "Exigir billing", "Confirmar sintaxe GA", "Planejar escrita", "Revalidar que main"]) {
            assert.ok(indice(antes) < update, antes);
        }
        assert.ok(indice("Verificar estado final") > update);
        assert.ok(indice("Drill seletivo") > indice("Verificar estado final"));
        assert.match(passo("Verificar estado final").corpo, /recovery-gate-cli\.mjs post/);
        assert.match(passo("Drill seletivo").corpo, /node scripts\/recovery-drill-049\.mjs/);
    });

    it("artefato recovery-gate-049 publicado sem segredo (só o JSON allowlisted)", () => {
        const art = passo("Publicar artefato").corpo;
        assert.match(art, /name: recovery-gate-049/);
        assert.match(art, /path: \$\{\{ runner\.temp \}\}\/recovery-gate\/recovery-gate-049\.json/);
    });
});
