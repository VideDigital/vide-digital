// Teste estático determinístico do canal de deploy do Beta
// (.github/workflows/firebase-deploy-beta.yml) — não executa o workflow,
// não precisa de credenciais nem de rede; só lê o YAML como texto e
// confirma, por regex, que as garantias de segurança discutidas na
// revisão da PR #58 continuam presentes. Existe pra impedir regressão
// futura (ex.: alguém adicionar uma Function whatsapp* à lista, trocar
// "--only functions:X" por "--only functions" genérico, ou deixar
// storage/indexes/hosting entrarem no stage de Rules) sem precisar rodar
// o workflow de verdade contra um projeto real pra descobrir.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, it } from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOW_PATH = path.resolve(__dirname, "../../.github/workflows/firebase-deploy-beta.yml");
const conteudo = readFileSync(WORKFLOW_PATH, "utf8");

// Pras checagens de AUSÊNCIA de um padrão perigoso (ex.: "--only functions"
// genérico, "firebase login"), ignora linhas de comentário — o arquivo
// documenta de propósito, em comentários, exatamente o que NÃO deve
// aparecer no YAML executável, e um teste ingênuo contra o texto bruto
// acusaria falso positivo nas próprias explicações.
const semComentarios = conteudo
    .split("\n")
    .filter((linha) => !linha.trim().startsWith("#"))
    .join("\n");

const FUNCTIONS_PERMITIDAS = [
    "createEmployee",
    "updateEmployee",
    "enableEmployee",
    "disableEmployee",
    "adminUpdateStoreStatus",
    "createPublicLead",
    "createPublicReview"
];

describe("firebase-deploy-beta.yml — garantias de segurança do canal de deploy do Beta", () => {
    it("BETA_FUNCTIONS contém exatamente as 7 Functions permitidas, nenhuma a mais nem a menos", () => {
        const match = conteudo.match(/BETA_FUNCTIONS:\s*"([^"]+)"/);
        assert.ok(match, "env BETA_FUNCTIONS não encontrada no workflow");
        const entradas = match[1].split(",").map((s) => s.trim());
        const nomes = entradas.map((entrada) => {
            const partes = entrada.split(":");
            assert.equal(partes[0], "functions", `entrada "${entrada}" deveria começar com "functions:"`);
            return partes[1];
        });
        assert.deepEqual(
            [...nomes].sort(),
            [...FUNCTIONS_PERMITIDAS].sort(),
            "BETA_FUNCTIONS deveria conter exatamente as 7 Functions do release do Beta"
        );
    });

    it("nenhuma entrada de BETA_FUNCTIONS começa com whatsapp", () => {
        const match = conteudo.match(/BETA_FUNCTIONS:\s*"([^"]+)"/);
        const entradas = match[1].split(",").map((s) => s.trim().toLowerCase());
        const comWhatsapp = entradas.filter((entrada) => entrada.includes("whatsapp"));
        assert.deepEqual(comWhatsapp, [], "BETA_FUNCTIONS não pode conter nenhuma Function whatsapp*");
    });

    it("nenhuma Function whatsapp* aparece em lugar nenhum do comando de deploy", () => {
        assert.doesNotMatch(semComentarios, /functions:whatsapp/i, "nenhuma referência a functions:whatsapp* deveria existir no workflow");
    });

    it("nunca usa \"--only functions\" genérico (sempre filtrado por nome)", () => {
        // Aceita "--only \"${BETA_FUNCTIONS}\"" e "--only firestore:rules" —
        // rejeita qualquer "--only functions" sem ":" logo em seguida (o
        // que publicaria TODAS as Functions do projeto, inclusive whatsapp*).
        assert.doesNotMatch(
            semComentarios,
            /--only\s+"?functions"?(?!:)(?=[\s"\\]|$)/m,
            '"--only functions" genérico não pode aparecer no workflow'
        );
    });

    it("o stage firestore-rules publica somente firestore:rules", () => {
        assert.match(conteudo, /--only\s+firestore:rules\b/, "o stage firestore-rules deveria publicar --only firestore:rules");
    });

    it("nunca publica Storage", () => {
        assert.doesNotMatch(semComentarios, /--only\s+"?storage"?/i, "o workflow não pode publicar Storage");
    });

    it("nunca publica indexes do Firestore", () => {
        assert.doesNotMatch(semComentarios, /firestore:indexes/i, "o workflow não pode publicar firestore:indexes");
    });

    it("nunca publica Hosting", () => {
        assert.doesNotMatch(semComentarios, /--only\s+"?hosting"?/i, "o workflow não pode publicar Hosting");
    });

    it("expected_sha continua obrigatório", () => {
        const bloco = conteudo.match(/expected_sha:\s*\n([\s\S]*?)(?=\n\s{6}\S|\n\s{4}\S)/);
        assert.ok(bloco, "input expected_sha não encontrado");
        assert.match(bloco[1], /required:\s*true/, "expected_sha precisa ser required: true");
    });

    it("confirm_production continua obrigatório e diferenciado por stage", () => {
        const bloco = conteudo.match(/confirm_production:\s*\n([\s\S]*?)(?=\n\s{6}\S|\n\s{4}\S|$)/);
        assert.ok(bloco, "input confirm_production não encontrado");
        assert.match(bloco[1], /required:\s*true/, "confirm_production precisa ser required: true");
        assert.match(conteudo, /CONFIRM_PRODUCTION\}"\s*!=\s*"DEPLOY_FUNCTIONS"/, "validação de DEPLOY_FUNCTIONS ausente");
        assert.match(conteudo, /CONFIRM_PRODUCTION\}"\s*!=\s*"DEPLOY_RULES"/, "validação de DEPLOY_RULES ausente");
    });

    it("project_id só aceita vide-digital-saas e rejeita IDs com 'demo'", () => {
        assert.match(conteudo, /PROJECT_ID\}"\s*!=\s*"vide-digital-saas"/, "validação exata de vide-digital-saas ausente");
        assert.match(conteudo, /NORMALIZED_PROJECT_ID\}"\s*==\s*\*demo\*/, "rejeição de project_id contendo 'demo' ausente");
    });

    it("dispara só por workflow_dispatch e só a partir de main", () => {
        assert.match(conteudo, /^on:\s*\n\s+workflow_dispatch:/m, "workflow deveria disparar só por workflow_dispatch");
        assert.match(conteudo, /GITHUB_REF\}"\s*!=\s*"refs\/heads\/main"/, "validação de branch main ausente");
    });

    it("pré-flight de dry-run roda com --non-interactive antes do deploy real de Functions", () => {
        const preflightIdx = conteudo.indexOf("Pré-flight seguro: dry-run não-interativo");
        const deployIdx = conteudo.indexOf('name: "Publicar as 7 Functions do Beta');
        assert.ok(preflightIdx > -1, "step de pré-flight (dry-run) não encontrado");
        assert.ok(deployIdx > -1, "step de deploy real das Functions não encontrado");
        assert.ok(preflightIdx < deployIdx, "o pré-flight de dry-run precisa vir ANTES do deploy real");
        const blocoPreflight = conteudo.slice(preflightIdx, deployIdx);
        assert.match(blocoPreflight, /--dry-run/, "o pré-flight precisa usar --dry-run");
        assert.match(blocoPreflight, /--non-interactive/, "o pré-flight precisa usar --non-interactive");
    });

    it("nunca usa firebase login nem FIREBASE_TOKEN", () => {
        assert.doesNotMatch(semComentarios, /firebase login\b/, "não pode usar firebase login");
        assert.doesNotMatch(semComentarios, /FIREBASE_TOKEN/, "não pode usar FIREBASE_TOKEN");
    });

    it("suporta WIF e o fallback FIREBASE_SERVICE_ACCOUNT, e falha sem nenhum dos dois", () => {
        assert.match(conteudo, /GCP_WORKLOAD_IDENTITY_PROVIDER/);
        assert.match(conteudo, /GCP_SERVICE_ACCOUNT/);
        assert.match(conteudo, /FIREBASE_SERVICE_ACCOUNT/);
        assert.match(conteudo, /Nenhum método de autenticação configurado/);
    });

    it("aviso de janela de compatibilidade de Landing Pages aparece nos dois stages", () => {
        assert.match(conteudo, /janela de compatibilidade de Landing Pages \(abertura\)/i);
        assert.match(conteudo, /janela de compatibilidade de Landing Pages \(fechamento\)/i);
        assert.match(conteudo, /GITHUB_STEP_SUMMARY/);
    });

    it("lembrete da claim videAdmin está presente", () => {
        assert.match(conteudo, /videAdmin/);
    });
});
