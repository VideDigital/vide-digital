// VIDE-HUB-OBSERVABILITY-INVENTORY-PREP-053 — testes puros do inventário
// (scripts/observability-inventory-core.mjs e o leitor de fontes do CLI).
// Sem rede: fixtures "sujas" com e-mail, webhook, token, env vars e
// payload provam que nada disso chega ao artefato.
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
    PROJECT_ID, CONFIRMACAO, CORE_BETA_FUNCTIONS, REGISTRO_SEPARADO, CHAVES_ARTEFATO, METRICAS_DESEJADAS, STATUS,
    FRONTEND_CANDIDATE,
    validarEntradas, construirFontesRest, classificarFonte, mascararEmail, sanitizarTexto, escopoFunction,
    normalizarFunctions, normalizarCloudRun, normalizarAlertPolicies, normalizarNotificationChannels,
    normalizarUptimeChecks, normalizarLogMetrics, normalizarDashboards, normalizarLogSinks, agregarErros,
    agregarRequisicoes, construirInventario, resultado, resumoMarkdown, filtrarArtefato,
    detalharFonte, verificarArtefatoSeguro, CODIGO_SEM_TOKEN
} from "../scripts/observability-inventory-core.mjs";
import { lerFontes } from "../scripts/observability-inventory-cli.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHA = "69f68ac9325f5bad6b93f01df92391f80038df62";
const WEBHOOK = "https://hooks.example.com/services/T000/B000/SEGREDO123";
const EMAIL = "daniel.teste@gmail.com";

const fn = (nome, extra = {}) => ({
    name: `projects/${PROJECT_ID}/locations/southamerica-east1/functions/${nome}`,
    state: "ACTIVE",
    environment: "GEN_2",
    updateTime: "2026-09-01T00:00:00Z",
    buildConfig: { runtime: "nodejs22", environmentVariables: { SEGREDO: "x" } },
    serviceConfig: { serviceAccountEmail: "sa@vide-digital-saas.iam.gserviceaccount.com", environmentVariables: { API_KEY: "chave-secreta" }, uri: "https://x.a.run.app" },
    ...extra
});

const fontesSujas = () => ({
    services: { status: STATUS.OK, dados: [{ config: { name: "logging.googleapis.com" } }, { config: { name: "run.googleapis.com" } }, { config: { name: "cloudfunctions.googleapis.com" } }, { config: { name: "firestore.googleapis.com" } }] },
    functions: { status: STATUS.OK, dados: [...CORE_BETA_FUNCTIONS.map((n) => fn(n)), fn("whatsappWebhook"), fn("auditLeadsWrite", { eventTrigger: { eventType: "google.cloud.firestore.document.v1.written" } })] },
    runServices: { status: STATUS.OK, dados: [{ metadata: { name: "createpubliclead", labels: { "cloud.googleapis.com/location": "southamerica-east1", "goog-managed-by": "cloudfunctions" } }, spec: { template: { spec: { serviceAccountName: EMAIL, containers: [{ env: [{ name: "K", value: "v" }] }] } } }, status: { conditions: [{ type: "Ready", status: "True" }], url: "https://createpubliclead-x.a.run.app" } }] },
    logMetrics: { status: STATUS.OK, dados: [{ name: "lead_errors", filter: `jsonPayload.email="${EMAIL}" AND httpRequest.requestUrl="${WEBHOOK}"`, metricDescriptor: { metricKind: "DELTA", valueType: "INT64" } }] },
    logSinks: { status: STATUS.OK, dados: [{ name: "_Default", destination: "logging.googleapis.com/projects/vide-digital-saas/locations/global/buckets/_Default", writerIdentity: `serviceAccount:${EMAIL}`, filter: "NOT LOG_ID(x)" }] },
    errorLogs24h: { status: STATUS.OK, dados: [
        { resource: { type: "cloud_run_revision", labels: { service_name: "createpubliclead" } }, severity: "ERROR", textPayload: `falhou para ${EMAIL}`, httpRequest: { requestUrl: WEBHOOK } },
        { resource: { type: "cloud_run_revision", labels: { service_name: "createpubliclead" } }, severity: "ERROR", jsonPayload: { body: { telefone: "11999999999" } } },
        { resource: { type: "cloud_run_revision", labels: { service_name: "whatsappwebhook" } }, severity: "CRITICAL" }
    ] },
    alertPolicies: { status: STATUS.OK, dados: { alertPolicies: [{ displayName: `Alerta ${EMAIL}`, enabled: true, documentation: { content: `ver ${WEBHOOK}` }, notificationChannels: ["projects/p/notificationChannels/1"], conditions: [{ displayName: "5xx", conditionThreshold: { filter: 'metric.type="run.googleapis.com/request_count" resource.type="cloud_run_revision"' } }] }] } },
    notificationChannels: { status: STATUS.OK, dados: { notificationChannels: [
        { type: "email", displayName: `Dono ${EMAIL}`, labels: { email_address: EMAIL }, enabled: true, verificationStatus: "VERIFIED" },
        { type: "webhook_tokenauth", displayName: "Hook", labels: { url: WEBHOOK }, enabled: true },
        { type: "slack", displayName: "Slack", labels: { channel_name: "#ops", auth_token: "xoxb-SEGREDO" }, sensitiveLabels: { auth_token: "xoxb-SEGREDO" } }
    ] } },
    uptimeChecks: { status: STATUS.OK, dados: { uptimeCheckConfigs: [{ displayName: "Pages", monitoredResource: { type: "uptime_url", labels: { host: "videdigital.github.io", project_id: PROJECT_ID } }, httpCheck: { useSsl: true, path: "/vide-digital/loja-do-cliente", headers: { Authorization: "Bearer SEGREDO" } }, period: "300s" }] } },
    dashboards: { status: STATUS.OK, dados: { dashboards: [{ displayName: "Beta", mosaicLayout: { tiles: [{}, {}, {}] } }] } },
    errorGroups24h: { status: STATUS.OK, dados: { errorGroupStats: [{ group: { groupId: "g1" }, count: "4", affectedServices: [{ service: "createpubliclead" }], representative: { message: `Error: ${EMAIL} ${WEBHOOK}` } }] } },
    requestCount24h: { status: STATUS.OK, dados: { timeSeries: [
        { resource: { labels: { service_name: "createpubliclead" } }, metric: { labels: { response_code_class: "2xx" } }, points: [{ value: { int64Value: "10" } }, { value: { int64Value: "5" } }] },
        { resource: { labels: { service_name: "createpubliclead" } }, metric: { labels: { response_code_class: "5xx" } }, points: [{ value: { int64Value: "2" } }] }
    ] } },
    ...Object.fromEntries(METRICAS_DESEJADAS.map((_, i) => [`metricDescriptor${i}`, { status: i === 3 ? STATUS.NOT_FOUND : STATUS.OK, dados: { name: "descriptor", description: "texto" } }]))
});

describe("entradas", () => {
    it("exige projeto fixo, SHA de 40 hex e OBSERVE_ONLY exato", () => {
        assert.equal(validarEntradas({ projectId: PROJECT_ID, expectedSha: SHA, confirmacao: CONFIRMACAO }).ok, true);
        assert.equal(CONFIRMACAO, "OBSERVE_ONLY");
        for (const ruim of [
            { projectId: "outro-projeto" },
            { projectId: "vide-digital-saas " },
            { expectedSha: SHA.slice(0, 39) },
            { expectedSha: SHA.toUpperCase() },
            { expectedSha: `${SHA};rm -rf /` },
            { confirmacao: "observe_only" },
            { confirmacao: "READ_ONLY" },
            { confirmacao: "" }
        ]) {
            const r = validarEntradas({ projectId: PROJECT_ID, expectedSha: SHA, confirmacao: CONFIRMACAO, ...ruim });
            assert.equal(r.ok, false, JSON.stringify(ruim));
        }
    });
});

describe("fontes REST: somente GET de list/get em Monitoring e Error Reporting", () => {
    const fontes = construirFontesRest({ agora: new Date("2026-09-29T12:00:00Z") });

    it("todas as URLs são https nos hosts permitidos e em caminhos de leitura do projeto fixo", () => {
        const caminhos = [
            /^\/v3\/projects\/vide-digital-saas\/(alertPolicies|notificationChannels|uptimeCheckConfigs|timeSeries)$/,
            /^\/v3\/projects\/vide-digital-saas\/metricDescriptors\/[a-z.]+\.googleapis\.com\/[a-z_/]+$/,
            /^\/v1\/projects\/vide-digital-saas\/dashboards$/,
            /^\/v1beta1\/projects\/vide-digital-saas\/groupStats$/
        ];
        for (const { fonte, url } of fontes) {
            const u = new URL(url);
            assert.equal(u.protocol, "https:");
            assert.ok(["monitoring.googleapis.com", "clouderrorreporting.googleapis.com"].includes(u.host), url);
            assert.ok(caminhos.some((re) => re.test(u.pathname)), `${fonte}: ${u.pathname}`);
            assert.doesNotMatch(u.pathname, /:/, "sem métodos customizados (:verify, :sendVerificationCode…)");
        }
        assert.deepEqual(fontes.map((f) => f.fonte).slice(0, 6), ["alertPolicies", "notificationChannels", "uptimeChecks", "dashboards", "errorGroups24h", "requestCount24h"]);
        assert.equal(fontes.length, 6 + METRICAS_DESEJADAS.length);
    });

    it("série de requisições cobre exatamente as últimas 24h, agregada (sem payload)", () => {
        const u = new URL(fontes.find((f) => f.fonte === "requestCount24h").url);
        assert.equal(u.searchParams.get("interval.endTime"), "2026-09-29T12:00:00.000Z");
        assert.equal(u.searchParams.get("interval.startTime"), "2026-09-28T12:00:00.000Z");
        assert.equal(u.searchParams.get("aggregation.crossSeriesReducer"), "REDUCE_SUM");
        assert.deepEqual(u.searchParams.getAll("aggregation.groupByFields"), ["resource.label.service_name", "metric.label.response_code_class"]);
    });

    it("recusa outro projeto", () => {
        assert.throws(() => construirFontesRest({ projectId: "outro" }), /allowlist/);
    });
});

describe("classificação de falha", () => {
    it("OK, API_NOT_AVAILABLE, PERMISSION_DENIED, NOT_FOUND, COMMAND_ERROR, REST_AUTH_UNAVAILABLE e NOT_COLLECTED", () => {
        assert.equal(classificarFonte({ codigo: "0" }), STATUS.OK);
        assert.equal(classificarFonte({ codigo: "http:200" }), STATUS.OK);
        assert.equal(classificarFonte({ codigo: "" }), STATUS.NOT_COLLECTED);
        assert.equal(classificarFonte({ codigo: "http:403", texto: '{"error":{"status":"PERMISSION_DENIED","details":[{"reason":"SERVICE_DISABLED"}]}}' }), STATUS.API_NOT_AVAILABLE);
        assert.equal(classificarFonte({ codigo: "1", texto: "ERROR: API [monitoring.googleapis.com] not enabled on project [123]." }), STATUS.API_NOT_AVAILABLE);
        assert.equal(classificarFonte({ codigo: "http:403", texto: '{"error":{"status":"PERMISSION_DENIED"}}' }), STATUS.PERMISSION_DENIED);
        assert.equal(classificarFonte({ codigo: "1", texto: "PERMISSION_DENIED: Permission denied for sa@x.iam.gserviceaccount.com" }), STATUS.PERMISSION_DENIED);
        assert.equal(classificarFonte({ codigo: "http:404" }), STATUS.NOT_FOUND);
        assert.equal(classificarFonte({ codigo: "http:500" }), STATUS.COMMAND_ERROR);
        assert.equal(classificarFonte({ codigo: "curl:28" }), STATUS.COMMAND_ERROR);
        assert.equal(classificarFonte({ codigo: "2", texto: "ERROR: (gcloud) unrecognized arguments" }), STATUS.COMMAND_ERROR);
        assert.equal(classificarFonte({ codigo: CODIGO_SEM_TOKEN }), STATUS.REST_AUTH_UNAVAILABLE);
    });

    it("detalhe numérico sem nenhum texto do erro", () => {
        const texto = `PERMISSION_DENIED: Permission denied for ${EMAIL}`;
        assert.deepEqual(detalharFonte({ codigo: "1", texto }), { status: STATUS.PERMISSION_DENIED, exitCode: 1, httpStatus: null });
        assert.deepEqual(detalharFonte({ codigo: "http:403", texto: '{"error":{"details":[{"reason":"SERVICE_DISABLED"}]}}' }), { status: STATUS.API_NOT_AVAILABLE, exitCode: null, httpStatus: 403 });
        assert.deepEqual(detalharFonte({ codigo: "curl:6" }), { status: STATUS.COMMAND_ERROR, exitCode: 6, httpStatus: null });
        assert.deepEqual(detalharFonte({ codigo: CODIGO_SEM_TOKEN }), { status: STATUS.REST_AUTH_UNAVAILABLE, exitCode: null, httpStatus: null });
        assert.doesNotMatch(JSON.stringify(detalharFonte({ codigo: "1", texto })), /daniel|Permission denied/);
    });
});

describe("PII", () => {
    it("e-mail mascarado como d***@***.com", () => {
        assert.equal(mascararEmail("daniel@gmail.com"), "d***@***.com");
        assert.equal(mascararEmail(EMAIL), "d***@***.com");
        assert.equal(mascararEmail("sa@vide-digital-saas.iam.gserviceaccount.com"), "s***@***.com");
    });

    it("texto livre sem e-mail nem URL (webhook)", () => {
        const t = sanitizarTexto(`Avisar ${EMAIL} em ${WEBHOOK} agora`);
        assert.equal(t, "Avisar d***@***.com em [url-removida] agora");
        assert.equal(sanitizarTexto(null), null);
        assert.ok(sanitizarTexto("x".repeat(500)).length <= 121);
    });
});

describe("normalizadores por allowlist", () => {
    it("functions: nome/região/estado/runtime/gatilho/escopo — sem env, service account ou URL", () => {
        const [f] = normalizarFunctions([fn("createPublicLead")]);
        assert.deepEqual(Object.keys(f).sort(), ["environment", "name", "region", "runtime", "scope", "state", "trigger", "updateTime"]);
        assert.equal(f.region, "southamerica-east1");
        assert.equal(f.scope, "core-beta");
        assert.equal(normalizarFunctions([fn("x", { eventTrigger: {} })])[0].trigger, "event");
        assert.doesNotMatch(JSON.stringify(normalizarFunctions([fn("createPublicLead")])), /chave-secreta|SEGREDO|gserviceaccount|run\.app/);
    });

    it("escopo: 7 core beta, whatsapp* fora, createPublicOrderQuote separada", () => {
        assert.deepEqual([...CORE_BETA_FUNCTIONS], ["createEmployee", "updateEmployee", "enableEmployee", "disableEmployee", "adminUpdateStoreStatus", "createPublicLead", "createPublicReview"]);
        for (const n of CORE_BETA_FUNCTIONS) assert.equal(escopoFunction(n), "core-beta");
        assert.equal(escopoFunction("whatsappWebhook"), "fora-de-escopo-whatsapp");
        assert.equal(escopoFunction("createPublicOrderQuote"), "registro-separado");
        assert.equal(escopoFunction("askBusinessAI"), "outra");
    });

    it("canais: só tipo/nome mascarado/estado — nunca labels (e-mail, webhook, token)", () => {
        const canais = normalizarNotificationChannels(fontesSujas().notificationChannels.dados);
        const json = JSON.stringify(canais);
        assert.doesNotMatch(json, /daniel|hooks\.example|SEGREDO|xoxb|labels|#ops/);
        assert.equal(canais[0].displayName, "Dono d***@***.com");
        assert.deepEqual(canais.map((c) => c.type), ["email", "webhook_tokenauth", "slack"]);
    });

    it("alert policies: condições e métricas, sem documentação", () => {
        const [a] = normalizarAlertPolicies(fontesSujas().alertPolicies.dados);
        assert.deepEqual(a.metricTypes, ["run.googleapis.com/request_count"]);
        assert.deepEqual(a.conditionTypes, ["conditionThreshold"]);
        assert.equal(a.notificationChannelCount, 1);
        assert.doesNotMatch(JSON.stringify(a), /daniel|hooks\.example|documentation/);
    });

    it("uptime: só host (nunca path de tenant nem headers)", () => {
        const [u] = normalizarUptimeChecks(fontesSujas().uptimeChecks.dados);
        assert.deepEqual(u, { displayName: "Pages", protocol: "https", resourceType: "uptime_url", host: "videdigital.github.io", period: "300s" });
    });

    it("sinks: só tipo de destino (nunca caminho nem writerIdentity)", () => {
        const [s] = normalizarLogSinks(fontesSujas().logSinks.dados);
        assert.deepEqual(s, { name: "_Default", destinationType: "logging-bucket", disabled: false, hasFilter: true, hasExclusions: false });
    });

    it("log metrics com filtro sanitizado; dashboards contam widgets; Cloud Run sem env/URL", () => {
        const [m] = normalizarLogMetrics(fontesSujas().logMetrics.dados);
        assert.doesNotMatch(m.filter, /daniel|hooks\.example/);
        assert.equal(normalizarDashboards(fontesSujas().dashboards.dados)[0].widgetCount, 3);
        const run = normalizarCloudRun(fontesSujas().runServices.dados);
        assert.deepEqual(run, [{ name: "createpubliclead", region: "southamerica-east1", ready: true, managedByFunctions: true }]);
    });

    it("erros 24h: contagem por serviço, gen2 mapeado para a Function core — sem payload", () => {
        const f = fontesSujas();
        const e = agregarErros({ logEntries: f.errorLogs24h.dados, errorGroups: f.errorGroups24h.dados, statusLogs: STATUS.OK, statusErrorReporting: STATUS.OK });
        assert.equal(e.total, 3);
        assert.equal(e.truncated, false);
        assert.deepEqual(e.byService, { createpubliclead: 2, whatsappwebhook: 1 });
        assert.equal(e.coreBeta.createPublicLead, 2);
        assert.equal(e.errorReporting.occurrences, 4);
        assert.doesNotMatch(JSON.stringify(e), /daniel|hooks\.example|11999999999|Payload|message/);
        const indisponivel = agregarErros({ statusLogs: STATUS.PERMISSION_DENIED, statusErrorReporting: STATUS.API_NOT_AVAILABLE });
        assert.equal(indisponivel.total, null);
        assert.equal(indisponivel.errorReporting.status, STATUS.API_NOT_AVAILABLE);
        assert.equal(agregarErros({ logEntries: Array(1000).fill({}), statusLogs: STATUS.OK }).truncated, true);
    });

    it("requisições 24h somadas por serviço e classe", () => {
        assert.deepEqual(agregarRequisicoes(fontesSujas().requestCount24h.dados), { createpubliclead: { "2xx": 15, "5xx": 2 } });
    });
});

describe("artefato", () => {
    it("chaves exatamente na allowlist e nenhum dado sensível na serialização", () => {
        const inv = construirInventario({ fontes: fontesSujas(), workflowSha: SHA, agora: new Date("2026-09-29T12:00:00Z") });
        assert.deepEqual(Object.keys(inv), [...CHAVES_ARTEFATO]);
        assert.deepEqual([...CHAVES_ARTEFATO], ["projectId", "workflowSha", "functions", "cloudRunServices", "alertPolicies", "notificationChannels", "uptimeChecks", "logMetrics", "dashboards", "logSinks", "errorCounts24h", "metricCapabilities", "frontendCandidate", "timestamp"]);
        const json = JSON.stringify(inv);
        assert.doesNotMatch(json, /daniel|hooks\.example|SEGREDO|xoxb|chave-secreta|gserviceaccount|11999999999|Bearer|a\.run\.app|loja-do-cliente/);
        assert.doesNotMatch(json, /[A-Za-z0-9._%+-]{2,}@/, "nenhum e-mail sem máscara");
        assert.equal(inv.projectId, PROJECT_ID);
        assert.equal(inv.workflowSha, SHA);
        assert.equal(inv.timestamp, "2026-09-29T12:00:00.000Z");
        assert.deepEqual(inv.frontendCandidate, { ...FRONTEND_CANDIDATE });
        assert.equal(inv.metricCapabilities.coreBeta.live.length, 7);
        assert.deepEqual(inv.metricCapabilities.coreBeta.separateRegistration, { createPublicOrderQuote: "NÃO ENCONTRADA" });
        assert.equal(inv.metricCapabilities.coreBeta.whatsappOutOfScopeCount, 1);
        assert.equal(inv.metricCapabilities.metricDescriptors["cloudfunctions.googleapis.com/function/execution_count"], false);
        assert.equal(inv.metricCapabilities.apis["monitoring.googleapis.com"], STATUS.API_NOT_AVAILABLE);
        assert.equal(inv.metricCapabilities.createPublicLeadSignal.functionLive, true);
        assert.deepEqual(inv.metricCapabilities.createPublicLeadSignal.requests24hByClass, { "2xx": 15, "5xx": 2 });
        assert.equal(resultado(inv), "PASS");
    });

    it("fonte esperada ausente (passo não rodou) nunca vira PASS", () => {
        const f = fontesSujas();
        delete f.requestCount24h;
        assert.equal(resultado(construirInventario({ fontes: f })), "PARTIAL");
        assert.equal(resultado(construirInventario({ fontes: {} })), "PARTIAL");
    });

    it("invariante de sanitização: vazamento lança e bloqueia o artefato (fail-closed)", () => {
        const base = construirInventario({ fontes: fontesSujas(), workflowSha: SHA });
        assert.doesNotThrow(() => verificarArtefatoSeguro(base));
        const comEmail = { ...base, functions: [{ name: "x", owner: EMAIL }] };
        assert.throws(() => verificarArtefatoSeguro(comEmail), /e-mail sem máscara/);
        const comUrl = { ...base, dashboards: [{ displayName: WEBHOOK }] };
        assert.throws(() => verificarArtefatoSeguro(comUrl), /URL fora da allowlist/);
        const comToken = { ...base, logSinks: [{ name: "Bearer abc" }] };
        assert.throws(() => verificarArtefatoSeguro(comToken), /credencial\/token/);
        const comChave = { ...base, extra: 1 };
        assert.throws(() => verificarArtefatoSeguro(comChave), /chaves fora da allowlist/);
    });

    it("filtrarArtefato descarta chaves extras", () => {
        assert.deepEqual(Object.keys(filtrarArtefato({ projectId: "x", segredo: "y", raw: {} })), [...CHAVES_ARTEFATO]);
    });

    it("fonte indisponível vira status (PARTIAL), nunca falha nem inventa dado", () => {
        const f = fontesSujas();
        f.alertPolicies = { status: STATUS.API_NOT_AVAILABLE, dados: null };
        f.functions = { status: STATUS.PERMISSION_DENIED, dados: null };
        const inv = construirInventario({ fontes: f, workflowSha: "nao-sha" });
        assert.deepEqual(inv.alertPolicies, []);
        assert.equal(inv.workflowSha, null);
        assert.deepEqual(inv.metricCapabilities.sources.alertPolicies, { status: STATUS.API_NOT_AVAILABLE, exitCode: null, httpStatus: null });
        assert.equal(inv.metricCapabilities.coreBeta.missing, null, "sem lista de Functions não conclui ausência");
        assert.equal(inv.metricCapabilities.coreBeta.separateRegistration.createPublicOrderQuote, STATUS.PERMISSION_DENIED);
        assert.equal(resultado(inv), "PARTIAL");
        const md = resumoMarkdown(inv);
        assert.match(md, /\| Alert policies \| API_NOT_AVAILABLE \| — \|/);
        assert.match(md, /\| Functions live \| PERMISSION_DENIED \| — \|/);
        assert.match(md, /\| \*\*Inventory result\*\* \| \*\*PARTIAL\*\* \|/);
    });

    it("Step Summary com todas as linhas exigidas", () => {
        const md = resumoMarkdown(construirInventario({ fontes: fontesSujas(), workflowSha: SHA }));
        assert.match(md, /^## OBSERVABILITY INVENTORY$/m);
        for (const linha of [
            /\| Functions live \| OK \| 9 \|/, /\| Core beta functions live \| OK \| 7\/7 \|/, /\| Cloud Run services \| OK \| 1 \|/,
            /\| Alert policies \| OK \| 1 \|/, /\| Notification channels \| OK \| 3 \|/, /\| Uptime checks \| OK \| 1 \|/,
            /\| Log metrics \| OK \| 1 \|/, /\| Dashboards \| OK \| 1 \|/, /\| Log sinks \| OK \| 1 \|/,
            /\| Errors 24h \(logs\) \| OK \| 3 \|/, /\| Error Reporting 24h \| OK \| 4 \|/, /\| Metric descriptors \| 7\/7 respondidos \|/,
            /\| \*\*Inventory result\*\* \| \*\*PASS\*\* \|/
        ]) {
            assert.match(md, linha);
        }
    });
});

describe("CLI: leitura das saídas cruas", () => {
    it("classifica cada fonte e nunca carrega stderr/corpo de erro no resultado", async () => {
        const dir = mkdtempSync(path.join(tmpdir(), "obs-053-"));
        try {
            writeFileSync(path.join(dir, "functions.code"), "0\n");
            writeFileSync(path.join(dir, "functions.json"), JSON.stringify([fn("createPublicLead")]));
            writeFileSync(path.join(dir, "functions.err"), "");
            writeFileSync(path.join(dir, "logMetrics.code"), "0\n");
            writeFileSync(path.join(dir, "logMetrics.json"), "");
            writeFileSync(path.join(dir, "logSinks.code"), "1\n");
            writeFileSync(path.join(dir, "logSinks.json"), "");
            writeFileSync(path.join(dir, "logSinks.err"), `PERMISSION_DENIED for ${EMAIL}`);
            writeFileSync(path.join(dir, "alertPolicies.code"), "http:403\n");
            writeFileSync(path.join(dir, "alertPolicies.json"), '{"error":{"message":"Cloud Monitoring API has not been used in project","details":[{"reason":"SERVICE_DISABLED"}]}}');
            writeFileSync(path.join(dir, "dashboards.code"), "curl:28\n");
            writeFileSync(path.join(dir, "uptimeChecks.code"), `${CODIGO_SEM_TOKEN}\n`);
            const fontes = await lerFontes(dir);
            assert.equal(fontes.functions.status, STATUS.OK);
            assert.deepEqual(fontes.logMetrics, { status: STATUS.OK, exitCode: 0, httpStatus: null, dados: [] });
            assert.deepEqual(fontes.logSinks, { status: STATUS.PERMISSION_DENIED, exitCode: 1, httpStatus: null, dados: null });
            assert.deepEqual(fontes.alertPolicies, { status: STATUS.API_NOT_AVAILABLE, exitCode: null, httpStatus: 403, dados: null });
            assert.deepEqual(fontes.dashboards, { status: STATUS.COMMAND_ERROR, exitCode: 28, httpStatus: null, dados: null });
            assert.equal(fontes.uptimeChecks.status, STATUS.REST_AUTH_UNAVAILABLE);
            const json = JSON.stringify(construirInventario({ fontes }));
            assert.doesNotMatch(json, /daniel|has not been used|SERVICE_DISABLED|Permission/);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("fonte OK com JSON inválido é erro estrutural (lança; nada vira status silencioso)", async () => {
        const dir = mkdtempSync(path.join(tmpdir(), "obs-057-"));
        try {
            writeFileSync(path.join(dir, "dashboards.code"), "http:200\n");
            writeFileSync(path.join(dir, "dashboards.json"), "{não é json");
            await assert.rejects(lerFontes(dir), /dashboards: resposta OK com JSON inválido/);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

describe("premissas de código", () => {
    const indexFunctions = readFileSync(path.join(RAIZ, "functions/src/index.js"), "utf8");

    it("as 7 Functions core e createPublicOrderQuote existem no código; whatsapp* tem prefixo", () => {
        for (const n of [...CORE_BETA_FUNCTIONS, ...REGISTRO_SEPARADO]) {
            assert.match(indexFunctions, new RegExp(`^exports\\.${n} = `, "m"), n);
        }
        const whatsapp = [...indexFunctions.matchAll(/^exports\.(\w+) = whatsapp\./gm)].map((m) => m[1]);
        assert.ok(whatsapp.length > 0);
        for (const n of whatsapp) assert.equal(escopoFunction(n), "fora-de-escopo-whatsapp", n);
    });

    it("candidato de frontend é a raiz pública do Pages (existe index.html e login.html)", () => {
        assert.equal(FRONTEND_CANDIDATE.url, "https://videdigital.github.io/vide-digital/");
        assert.equal(FRONTEND_CANDIDATE.verificadoAoVivo, false);
        readFileSync(path.join(RAIZ, "index.html"));
        readFileSync(path.join(RAIZ, "login.html"));
    });
});
