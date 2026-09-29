// VIDE-HUB-RECOVERY-AUTOMATION-PREP-049A — lógica pura do gate de recovery.
//
// Usado por .github/workflows/recovery-minimal-gate.yml (via
// scripts/recovery-config-check.mjs e scripts/recovery-drill-049.mjs).
// Nenhuma chamada de rede, nenhum process.env aqui: só funções puras,
// testadas em tests/recovery-gate-core.test.mjs.
//
// Tudo é fail-closed por allowlist fixa: projeto, banco, slug do tenant QA,
// coleção e prefixo do documento de drill, campos restauráveis e chaves do
// artefato. Nada aceita wildcard.

export const PROJECT_ID = "vide-digital-saas";
export const DATABASE_ID = "(default)";
export const QA_SLUG = "vide-hub-qa-testes";
export const DRILL_COLLECTION = "recovery_drills";
export const DRILL_ID_PREFIX = "RECOVERY-DRILL-049-";
export const DRILL_PATH_REGEX = /^recovery_drills\/RECOVERY-DRILL-049-\d{13}$/;
export const SHA_REGEX = /^[0-9a-f]{40}$/;

export const STAGES = Object.freeze({
    PREFLIGHT: "preflight",
    ENABLE_AND_DRILL: "enable-and-drill"
});

export const CONFIRMACOES = Object.freeze({
    [STAGES.PREFLIGHT]: "READ_ONLY",
    [STAGES.ENABLE_AND_DRILL]: "ENABLE_RECOVERY_049"
});

export const MARKER_ORIGINAL = "RECOVERY_ORIGINAL";
export const MARKER_MUTATED = "RECOVERY_MUTATED";

// Únicos campos que o write-back pode restaurar a partir do histórico.
export const CAMPOS_RESTAURAVEIS = Object.freeze(["tenantId", "marker", "drillId"]);

export const PITR_ENABLED = "POINT_IN_TIME_RECOVERY_ENABLED";
export const DELETE_PROTECTION_ENABLED = "DELETE_PROTECTION_ENABLED";

// Campos do `gcloud firestore databases describe` que PODEM mudar ao
// habilitar PITR + delete protection. Qualquer outra diferença é drift
// inesperado e bloqueia (type, locationId, concurrencyMode,
// appEngineIntegrationMode, cmekConfig, databaseEdition, etc.).
export const CAMPOS_MUDANCA_PERMITIDA = Object.freeze([
    "pointInTimeRecoveryEnablement",
    "deleteProtectionState",
    "versionRetentionPeriod",
    "earliestVersionTime",
    "updateTime",
    "etag"
]);

export const CHAVES_ARTEFATO = Object.freeze([
    "projectId",
    "databaseId",
    "locationId",
    "pitrBefore",
    "pitrAfter",
    "deleteProtectionBefore",
    "deleteProtectionAfter",
    "versionRetentionPeriod",
    "earliestVersionTime",
    "drillId",
    "historicalReadPassed",
    "writeBackPassed",
    "cleanupPassed",
    "observedRtoMs",
    "startedAt",
    "finishedAt",
    "workflowSha"
]);

export function validarEntradas({ stage, projectId, databaseId, qaSlug, confirmacao, expectedSha }) {
    const erros = [];
    if (!Object.values(STAGES).includes(stage)) erros.push(`stage inválido: ${JSON.stringify(stage)}`);
    if (projectId !== PROJECT_ID) erros.push(`project_id precisa ser exatamente ${PROJECT_ID}`);
    if (databaseId !== DATABASE_ID) erros.push(`database_id precisa ser exatamente ${DATABASE_ID}`);
    if (qaSlug !== QA_SLUG) erros.push(`qa_slug precisa ser exatamente ${QA_SLUG}`);
    if (typeof expectedSha !== "string" || !SHA_REGEX.test(expectedSha)) erros.push("expected_sha precisa ter exatamente 40 caracteres hex minúsculos");
    if (Object.values(STAGES).includes(stage) && confirmacao !== CONFIRMACOES[stage]) {
        erros.push(`confirm_production precisa ser exatamente ${CONFIRMACOES[stage]} para stage=${stage}`);
    }
    return { ok: erros.length === 0, erros };
}

// Extrai o id do banco a partir de "projects/<p>/databases/<id>".
export function databaseIdDoNome(nome) {
    const match = /^projects\/([^/]+)\/databases\/([^/]+)$/.exec(String(nome || ""));
    return match ? { projectId: match[1], databaseId: match[2] } : null;
}

export function estadoProtecoes(describe) {
    return {
        pitr: describe?.pointInTimeRecoveryEnablement === PITR_ENABLED,
        deleteProtection: describe?.deleteProtectionState === DELETE_PROTECTION_ENABLED
    };
}

// Valida o describe ANTES de qualquer escrita: banco certo, projeto certo.
export function validarDescribe(describe) {
    const ids = databaseIdDoNome(describe?.name);
    const erros = [];
    if (!ids) erros.push("describe sem name no formato projects/<p>/databases/<id>");
    else {
        if (ids.projectId !== PROJECT_ID) erros.push(`describe aponta para projeto inesperado ${ids.projectId}`);
        if (ids.databaseId !== DATABASE_ID) erros.push(`describe aponta para banco inesperado ${ids.databaseId}`);
    }
    if (typeof describe?.locationId !== "string" || !describe.locationId) erros.push("describe sem locationId");
    return { ok: erros.length === 0, erros };
}

// Idempotente: devolve só os flags ainda necessários. Nunca "toggle":
// nunca inclui --no-*; se ambos já estiverem habilitados, lista vazia.
export function planejarEscrita(describeAntes) {
    const { pitr, deleteProtection } = estadoProtecoes(describeAntes);
    const flags = [];
    if (!deleteProtection) flags.push("--delete-protection");
    if (!pitr) flags.push("--enable-pitr");
    return flags;
}

function serializar(valor) {
    return JSON.stringify(valor === undefined ? null : valor);
}

// Compara describe antes/depois: toda chave (de qualquer um dos lados)
// cujo valor mudou e que não está na allowlist é drift inesperado.
export function avaliarDrift(antes, depois) {
    const chaves = new Set([...Object.keys(antes || {}), ...Object.keys(depois || {})]);
    const mudancasPermitidas = [];
    const mudancasInesperadas = [];
    for (const chave of [...chaves].sort()) {
        if (serializar(antes?.[chave]) === serializar(depois?.[chave])) continue;
        if (CAMPOS_MUDANCA_PERMITIDA.includes(chave)) mudancasPermitidas.push(chave);
        else mudancasInesperadas.push(chave);
    }
    return { ok: mudancasInesperadas.length === 0, mudancasPermitidas, mudancasInesperadas };
}

export function exigirProtecoesHabilitadas(describeDepois) {
    const { pitr, deleteProtection } = estadoProtecoes(describeDepois);
    const erros = [];
    if (!pitr) erros.push(`pointInTimeRecoveryEnablement != ${PITR_ENABLED}`);
    if (!deleteProtection) erros.push(`deleteProtectionState != ${DELETE_PROTECTION_ENABLED}`);
    return { ok: erros.length === 0, erros };
}

// Tenant QA: somente o donoUID técnico da vitrine pública oficial.
export function resolverTenantQa(vitrineExiste, vitrineData) {
    const tenantId = vitrineExiste ? vitrineData?.donoUID : null;
    if (typeof tenantId !== "string" || !tenantId.trim() || tenantId.includes("/")) {
        throw new Error(`Tenant QA (${QA_SLUG}) não resolvido a partir de vitrines_publicas — drill abortado.`);
    }
    return tenantId;
}

export function criarDrillId(agoraMs) {
    if (!Number.isInteger(agoraMs) || String(agoraMs).length !== 13) throw new Error("agoraMs inválido para drillId");
    return `${DRILL_ID_PREFIX}${agoraMs}`;
}

export function caminhoDrill(drillId) {
    const caminho = `${DRILL_COLLECTION}/${drillId}`;
    validarCaminhoDrill(caminho);
    return caminho;
}

// Única barreira de escrita: qualquer path fora de
// recovery_drills/RECOVERY-DRILL-049-<13 dígitos> é recusado.
export function validarCaminhoDrill(caminho) {
    if (typeof caminho !== "string" || !DRILL_PATH_REGEX.test(caminho)) {
        throw new Error(`Caminho fora da allowlist do drill: ${JSON.stringify(caminho)}`);
    }
    return caminho;
}

export function construirFixtureOriginal({ tenantId, drillId }) {
    return { tenantId, marker: MARKER_ORIGINAL, drillId };
}

// Write-back seletivo: só os campos da allowlist, lidos do histórico, e só
// se pertencerem ao MESMO tenant QA e ao MESMO drill desta execução.
export function selecionarCamposRestauraveis(dadosHistoricos, { tenantId, drillId }) {
    if (!dadosHistoricos || typeof dadosHistoricos !== "object") throw new Error("Snapshot histórico ausente — write-back recusado.");
    if (dadosHistoricos.tenantId !== tenantId) throw new Error("Snapshot histórico de outro tenant — write-back recusado.");
    if (dadosHistoricos.drillId !== drillId) throw new Error("Snapshot histórico de outro drill — write-back recusado.");
    if (dadosHistoricos.marker !== MARKER_ORIGINAL) throw new Error("Snapshot histórico não é o original — write-back recusado.");
    const restauravel = {};
    for (const campo of CAMPOS_RESTAURAVEIS) restauravel[campo] = dadosHistoricos[campo];
    return restauravel;
}

// Prova crítica antes de qualquer write-back.
export function avaliarProvaCritica({ atual, historico }) {
    return {
        atualMutado: atual?.marker === MARKER_MUTATED,
        historicoOriginal: historico?.marker === MARKER_ORIGINAL,
        ok: atual?.marker === MARKER_MUTATED && historico?.marker === MARKER_ORIGINAL
    };
}

// Isolamento: fora do drill desta execução, nenhum documento de
// recovery_drills pode ter surgido, sumido ou mudado de updateTime.
export function compararColecaoDrill(antes, depois, drillId) {
    const semDrill = (mapa) => Object.fromEntries(Object.entries(mapa || {}).filter(([id]) => id !== drillId));
    const a = semDrill(antes);
    const d = semDrill(depois);
    const ids = new Set([...Object.keys(a), ...Object.keys(d)]);
    const alterados = [...ids].filter((id) => a[id] !== d[id]).sort();
    return { ok: alterados.length === 0, alterados };
}

// Artefato: somente as chaves permitidas; valores só primitivos. Nunca
// conteúdo de documento, tenantId, e-mail, credencial ou nome de Secret.
export function construirArtefato(valores) {
    const artefato = {};
    for (const chave of CHAVES_ARTEFATO) {
        const valor = valores?.[chave];
        artefato[chave] = valor === undefined ? null : valor;
        if (artefato[chave] !== null && typeof artefato[chave] === "object") {
            throw new Error(`Valor não primitivo no artefato: ${chave}`);
        }
    }
    return artefato;
}
