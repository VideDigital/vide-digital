// WhatsApp Oficial V1 — Fase B: preflight de produção. Roda uma checagem
// segura ANTES do deploy real (.github/workflows/firebase-deploy-whatsapp.yml).
//
// Modo padrão: SOMENTE LEITURA. Nunca cria secret, nunca altera Firestore,
// nunca provisiona, nunca faz deploy, nunca assina webhook. Nunca imprime
// o VALOR de um segredo — só metadados (existe/não existe, quantidade de
// versões, nomes de papel IAM).
//
// Uso local:
//   node scripts/whatsapp-production-preflight.mjs
//
// Com checagem de projeto/GCP (precisa de `gcloud` autenticado):
//   WHATSAPP_PREFLIGHT_PROJECT=vide-digital-saas \
//     node scripts/whatsapp-production-preflight.mjs
//
// Gate Manual da versão da Graph API: sempre BLOCKED nesta execução a menos
// que você mesmo tenha acabado de abrir a fonte oficial da Meta e confirme
// explicitamente, só para esta rodada (nunca persistido em arquivo/commit):
//   WHATSAPP_PREFLIGHT_CONFIRMED_GRAPH_VERSION=v26.0 \
//     node scripts/whatsapp-production-preflight.mjs
//
// Com validação real de conexão com a Meta (opcional, só quando você já
// tem IDs e um token à mão — nunca obrigatório):
//   WHATSAPP_PREFLIGHT_PROJECT=vide-digital-saas \
//   WHATSAPP_PREFLIGHT_RUN_META=true \
//   WHATSAPP_PREFLIGHT_PHONE_NUMBER_ID=1234567890 \
//     node scripts/whatsapp-production-preflight.mjs
//   (o script pede o token por prompt oculto — nunca por env var/argv)
//
// Saída: tabela PASS/WARN/BLOCKED/FAIL, sem nenhum segredo. Código de
// saída: 0 = pronto; 1 = bloqueado; 2 = falha técnica.
import { execFileSync } from "node:child_process";
import {
    avaliarApisHabilitadas,
    avaliarAutenticacaoGoogle,
    avaliarComandoDisponivel,
    avaliarConexaoMeta,
    avaliarFunctionsPublicadas,
    avaliarHeadEsperado,
    avaliarIamPorSecret,
    avaliarNodeVersion,
    avaliarProjetoSelecionado,
    avaliarRulesPublicadas,
    avaliarSecretGlobal,
    avaliarVersaoGraphApi,
    avaliarWorktreeLimpo,
    calcularCodigoSaida,
    criarCheck,
    formatarTabelaTexto,
    STATUS
} from "./whatsapp-preflight-core.mjs";
import { WHATSAPP_GRAPH_VERSION } from "../functions/src/whatsapp/constants.js";

const PROJETO_ESPERADO = "vide-digital-saas";
const APIS_NECESSARIAS = [
    "secretmanager.googleapis.com",
    "cloudfunctions.googleapis.com",
    "firestore.googleapis.com",
    "run.googleapis.com"
];
const SECRETS_GLOBAIS = ["WHATSAPP_APP_SECRET", "WHATSAPP_WEBHOOK_VERIFY_TOKEN"];
const FUNCTIONS_ESPERADAS = [
    "whatsappWebhook",
    "whatsappSendText",
    "whatsappSendTemplate",
    "whatsappMarkRead",
    "whatsappSyncTemplates",
    "whatsappConnectionStatus",
    "whatsappValidateConnection",
    "whatsappListConnections",
    "whatsappSetDefaultConnection",
    "whatsappStartOnboarding",
    "whatsappCompleteOnboarding",
    "whatsappGetOnboardingStatus",
    "whatsappCancelOnboarding",
    "whatsappRenameConnection",
    "whatsappDisconnectConnection",
    "whatsappListQrCodes",
    "whatsappCreateQrCode",
    "whatsappUpdateQrCode",
    "whatsappDeleteQrCode"
];

function rodarComandoSeguro(comando, args) {
    try {
        return execFileSync(comando, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    } catch {
        return null;
    }
}

function ferramentaDisponivel(comando, argVersao) {
    const saida = rodarComandoSeguro(comando, [argVersao]);
    return { disponivel: saida !== null, versao: saida ? saida.split("\n")[0] : "" };
}

// ---------- LOCAL ----------

function checksLocais() {
    const checks = [];
    checks.push(avaliarNodeVersion(process.version));

    const pnpm = ferramentaDisponivel("pnpm", "--version");
    checks.push(avaliarComandoDisponivel("pnpm", pnpm.disponivel, pnpm.versao));

    const firebase = ferramentaDisponivel("firebase", "--version");
    checks.push(avaliarComandoDisponivel("Firebase CLI", firebase.disponivel, firebase.versao));

    const gcloud = ferramentaDisponivel("gcloud", "--version");
    checks.push(avaliarComandoDisponivel("gcloud CLI", gcloud.disponivel, gcloud.versao));

    const java = rodarComandoSeguro("java", ["-version"]);
    checks.push(avaliarComandoDisponivel("Java (Firestore Emulator)", java !== null, "necessário para pnpm run test:rules/test:frontend:emulator."));

    const gitStatus = rodarComandoSeguro("git", ["status", "--porcelain"]);
    checks.push(avaliarWorktreeLimpo(gitStatus || ""));

    const headAtual = rodarComandoSeguro("git", ["rev-parse", "HEAD"]);
    checks.push(avaliarHeadEsperado(headAtual, process.env.WHATSAPP_PREFLIGHT_EXPECTED_HEAD || ""));

    if (gcloud.disponivel) {
        const conta = rodarComandoSeguro("gcloud", ["auth", "list", "--filter=status:ACTIVE", "--format=value(account)"]);
        checks.push(avaliarAutenticacaoGoogle(conta || ""));
    } else {
        checks.push(criarCheck("Autenticação Google (gcloud)", STATUS.BLOCKED, "gcloud indisponível — não foi possível checar."));
    }

    return checks;
}

// ---------- FIREBASE/GCP (só quando WHATSAPP_PREFLIGHT_PROJECT for definido) ----------

function checksFirebaseGcp(habilitado) {
    const checks = [];
    if (!habilitado) {
        checks.push(criarCheck(
            "Firebase/GCP",
            STATUS.WARN,
            `Checagens de projeto real puladas. Defina WHATSAPP_PREFLIGHT_PROJECT=${PROJETO_ESPERADO} para rodar (o projeto é sempre fixo, nunca configurável para outro valor).`
        ));
        return checks;
    }

    // O projeto é sempre o mesmo fixo (vide-digital-saas) — a env var é só
    // um interruptor pra habilitar as checagens reais, nunca um jeito de
    // apontar este preflight para outro projeto por engano.
    const projeto = PROJETO_ESPERADO;
    const projetoAtual = rodarComandoSeguro("gcloud", ["config", "get-value", "project"]);
    checks.push(avaliarProjetoSelecionado(projetoAtual === "(unset)" ? "" : projetoAtual, projeto));
    if (projetoAtual !== projeto) return checks; // sem o projeto certo, nenhum outro check GCP é seguro de rodar

    const apisJson = rodarComandoSeguro("gcloud", ["services", "list", "--enabled", "--project", projeto, "--format=value(config.name)"]);
    const apisHabilitadas = apisJson ? apisJson.split("\n").map((l) => l.trim()).filter(Boolean) : [];
    checks.push(avaliarApisHabilitadas(APIS_NECESSARIAS, apisHabilitadas));

    for (const nomeSecret of SECRETS_GLOBAIS) {
        const existe = rodarComandoSeguro("gcloud", ["secrets", "describe", nomeSecret, "--project", projeto]) !== null;
        let versoesHabilitadas = 0;
        if (existe) {
            const versoesRaw = rodarComandoSeguro("gcloud", ["secrets", "versions", "list", nomeSecret, "--project", projeto, "--filter=state:ENABLED", "--format=value(name)"]);
            versoesHabilitadas = versoesRaw ? versoesRaw.split("\n").filter(Boolean).length : 0;
        }
        checks.push(avaliarSecretGlobal(nomeSecret, { existe, versoesHabilitadas }));
    }

    // Achado real (2026-07-31): checar só a política GERAL do projeto é um
    // falso positivo — o Secret Manager aceita (e recomenda) um binding de
    // IAM DIRETO em cada secret, sem nenhum binding equivalente na política
    // do projeto. Por isso o IAM é checado por secret, individualmente, via
    // `gcloud secrets get-iam-policy` (nunca comando de escrita). A política
    // do projeto ainda é lida, mas só como fallback informativo dentro de
    // avaliarIamPorSecret — nunca a fonte primária da decisão.
    const numeroProjeto = rodarComandoSeguro("gcloud", ["projects", "describe", projeto, "--format=value(projectNumber)"]);
    const runtimeSA = numeroProjeto ? `${numeroProjeto}-compute@developer.gserviceaccount.com` : "";

    let papeisProjeto = [];
    const policyProjetoRaw = rodarComandoSeguro("gcloud", ["projects", "get-iam-policy", projeto, "--format=json"]);
    if (policyProjetoRaw) {
        try {
            const policyProjeto = JSON.parse(policyProjetoRaw);
            papeisProjeto = (policyProjeto.bindings || [])
                .filter((b) => runtimeSA && (b.members || []).includes(`serviceAccount:${runtimeSA}`))
                .map((b) => b.role);
        } catch {
            // Sem política do projeto legível — segue só com o binding direto de cada secret.
        }
    }

    for (const nomeSecret of SECRETS_GLOBAIS) {
        const policySecretRaw = rodarComandoSeguro("gcloud", ["secrets", "get-iam-policy", nomeSecret, "--project", projeto, "--format=json"]);
        let papeisSecretDireto = [];
        let erroLeitura = policySecretRaw === null;
        if (!erroLeitura) {
            try {
                const policySecret = JSON.parse(policySecretRaw);
                papeisSecretDireto = (policySecret.bindings || [])
                    .filter((b) => runtimeSA && (b.members || []).includes(`serviceAccount:${runtimeSA}`))
                    .map((b) => b.role);
            } catch {
                erroLeitura = true;
            }
        }
        checks.push(avaliarIamPorSecret(nomeSecret, { runtimeSA, papeisSecretDireto, papeisProjeto, erroLeitura }));
    }

    const functionsRaw = rodarComandoSeguro("gcloud", ["functions", "list", "--project", projeto, "--regions=southamerica-east1", "--format=value(name)"]);
    const functionsExistentes = functionsRaw
        ? functionsRaw.split("\n").map((l) => l.trim().split("/").pop()).filter(Boolean)
        : [];
    checks.push(avaliarFunctionsPublicadas(FUNCTIONS_ESPERADAS, functionsExistentes));

    checks.push(avaliarRulesPublicadas());

    return checks;
}

// ---------- META (opcional, só com opt-in explícito) ----------

function lerTokenOculto(pergunta) {
    return new Promise((resolve, reject) => {
        const stdin = process.stdin;
        if (!stdin.isTTY) {
            reject(new Error("Terminal não interativo."));
            return;
        }
        let valor = "";
        process.stdout.write(pergunta);
        stdin.setRawMode(true);
        stdin.resume();
        stdin.setEncoding("utf8");
        const onData = (char) => {
            const c = char.toString();
            if (c === "\n" || c === "\r" || c === "\u0004") {
                stdin.setRawMode(false);
                stdin.pause();
                stdin.removeListener("data", onData);
                process.stdout.write("\n");
                resolve(valor);
                return;
            }
            if (c === "\u0003") process.exit(1);
            if (c === "\u007f") { valor = valor.slice(0, -1); return; }
            valor += c;
        };
        stdin.on("data", onData);
    });
}

async function checkOpcionalMeta() {
    if (String(process.env.WHATSAPP_PREFLIGHT_RUN_META || "").toLowerCase() !== "true") {
        return avaliarConexaoMeta(null);
    }
    const phoneNumberId = String(process.env.WHATSAPP_PREFLIGHT_PHONE_NUMBER_ID || "").trim();
    if (!phoneNumberId) {
        return criarCheck("Validação real com a Meta", STATUS.WARN, "WHATSAPP_PREFLIGHT_RUN_META=true mas WHATSAPP_PREFLIGHT_PHONE_NUMBER_ID não definido — pulado.");
    }
    const token = await lerTokenOculto("Token de acesso do WhatsApp para validar (não será exibido, só usado nesta checagem): ");
    if (!token) {
        return criarCheck("Validação real com a Meta", STATUS.WARN, "Token não informado — checagem pulada.");
    }
    const { criarMetaClient } = await import("../functions/src/whatsapp/metaClient.js");
    const metaClient = criarMetaClient();
    try {
        const dados = await metaClient.getPhoneNumber({ accessToken: token, phoneNumberId });
        return avaliarConexaoMeta({ ok: true, verifiedName: dados?.verified_name, displayPhoneNumber: dados?.display_phone_number });
    } catch (erro) {
        return avaliarConexaoMeta({ ok: false, code: erro?.code });
    }
}

async function main() {
    const checks = [];
    checks.push(...checksLocais());
    checks.push(avaliarVersaoGraphApi(WHATSAPP_GRAPH_VERSION, process.env.WHATSAPP_PREFLIGHT_CONFIRMED_GRAPH_VERSION || ""));
    checks.push(...checksFirebaseGcp(String(process.env.WHATSAPP_PREFLIGHT_PROJECT || "").toLowerCase() === PROJETO_ESPERADO));
    checks.push(await checkOpcionalMeta());

    console.log(formatarTabelaTexto(checks));

    const codigo = calcularCodigoSaida(checks);
    console.log("");
    console.log(
        codigo === 0
            ? "PRONTO — nenhum bloqueio técnico encontrado (ainda assim, revise os WARN antes do deploy real)."
            : codigo === 1
                ? "BLOQUEADO — resolva os itens BLOCKED acima antes de prosseguir para o deploy real."
                : "FALHA TÉCNICA — não foi possível concluir uma ou mais checagens essenciais."
    );
    process.exitCode = codigo;
}

main().catch((erro) => {
    console.error("Erro inesperado no preflight:", erro?.message || erro);
    process.exitCode = 2;
});
