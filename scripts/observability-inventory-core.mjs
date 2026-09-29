// VIDE-HUB-OBSERVABILITY-INVENTORY-PREP-053 — núcleo puro do inventário
// de observabilidade (.github/workflows/observability-inventory.yml).
//
// SOMENTE LEITURA. Este módulo não faz rede nem escreve nada: recebe as
// saídas cruas (JSON) que o workflow coletou com comandos de listagem
// (`gcloud ... list`, `gcloud logging read`, GET na API REST) e devolve um
// artefato normalizado por ALLOWLIST de campos. Tudo que não está na
// allowlist é descartado — nunca copia payload de log, mensagem de erro,
// labels de canal (e-mail/webhook), variáveis de ambiente, service account,
// destino de sink ou corpo de requisição.
//
// PII: e-mails viram d***@***.com; URLs viram [url-removida].

export const PROJECT_ID = "vide-digital-saas";
export const CONFIRMACAO = "OBSERVE_ONLY";
export const REGIAO_FUNCTIONS = "southamerica-east1";

// Functions do beta controlado (functions/src/index.js). whatsapp* fica fora
// do escopo de observabilidade do beta; createPublicOrderQuote é registrada
// à parte e só conta como "live" se o inventário a encontrar.
export const CORE_BETA_FUNCTIONS = Object.freeze([
    "createEmployee",
    "updateEmployee",
    "enableEmployee",
    "disableEmployee",
    "adminUpdateStoreStatus",
    "createPublicLead",
    "createPublicReview"
]);
export const REGISTRO_SEPARADO = Object.freeze(["createPublicOrderQuote"]);
export const PREFIXO_FORA_DE_ESCOPO = "whatsapp";

// Candidato de URL para um futuro uptime check: raiz pública do Pages
// (index.html) — nunca rota de tenant/loja. Não é verificado ao vivo aqui.
export const FRONTEND_CANDIDATE = Object.freeze({
    url: "https://videdigital.github.io/vide-digital/",
    alternativa: "https://videdigital.github.io/vide-digital/login.html",
    origem: "código do repositório (index.html/login.html publicados no GitHub Pages)",
    verificadoAoVivo: false
});

export const CHAVES_ARTEFATO = Object.freeze([
    "projectId",
    "workflowSha",
    "functions",
    "cloudRunServices",
    "alertPolicies",
    "notificationChannels",
    "uptimeChecks",
    "logMetrics",
    "dashboards",
    "logSinks",
    "errorCounts24h",
    "metricCapabilities",
    "frontendCandidate",
    "timestamp"
]);

// Fontes coletadas por gcloud (somente list/read). A ordem é a do workflow.
export const FONTES_GCLOUD = Object.freeze([
    "services",
    "functions",
    "runServices",
    "logMetrics",
    "logSinks",
    "errorLogs24h"
]);

// Métricas cuja EXISTÊNCIA (descriptor) o inventário confere.
export const METRICAS_DESEJADAS = Object.freeze([
    "run.googleapis.com/request_count",
    "run.googleapis.com/request_latencies",
    "run.googleapis.com/container/instance_count",
    "cloudfunctions.googleapis.com/function/execution_count",
    "firestore.googleapis.com/document/write_count",
    "logging.googleapis.com/log_entry_count"
]);

export const APIS_RELEVANTES = Object.freeze([
    "monitoring.googleapis.com",
    "logging.googleapis.com",
    "clouderrorreporting.googleapis.com",
    "cloudfunctions.googleapis.com",
    "run.googleapis.com",
    "firestore.googleapis.com"
]);

// Estado explícito de cada fonte. Nenhuma falha vira sucesso silencioso:
// tudo que não é OK aparece no artefato e no Step Summary.
export const STATUS = Object.freeze({
    OK: "OK",
    API_NOT_AVAILABLE: "API_NOT_AVAILABLE",
    PERMISSION_DENIED: "PERMISSION_DENIED",
    NOT_FOUND: "NOT_FOUND",
    COMMAND_ERROR: "COMMAND_ERROR",
    REST_AUTH_UNAVAILABLE: "REST_AUTH_UNAVAILABLE",
    NOT_COLLECTED: "NOT_COLLECTED"
});

// Marcador gravado pelo workflow em <fonte>.code quando não há access token.
export const CODIGO_SEM_TOKEN = "auth:unavailable";

const HOST_MONITORING = "https://monitoring.googleapis.com";
const HOST_ERROR_REPORTING = "https://clouderrorreporting.googleapis.com";

// ===== Entradas =====

export function validarEntradas({ projectId, expectedSha, confirmacao } = {}) {
    const erros = [];
    if (projectId !== PROJECT_ID) erros.push(`project_id precisa ser exatamente ${PROJECT_ID}.`);
    if (!/^[0-9a-f]{40}$/.test(expectedSha || "")) erros.push("expected_sha precisa ter exatamente 40 caracteres hex minúsculos.");
    if (confirmacao !== CONFIRMACAO) erros.push(`confirm_read_only precisa ser exatamente ${CONFIRMACAO}.`);
    return { ok: erros.length === 0, erros };
}

// ===== Fontes REST (somente GET de list/get) =====

function url(host, caminho, params = []) {
    const qs = params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
    return `${host}${caminho}${qs ? `?${qs}` : ""}`;
}

// Lista fechada de GETs que o workflow executa. Nenhuma URL de escrita:
// o workflow só chama curl sem -X/-d, e o teste confere cada caminho.
export function construirFontesRest({ projectId = PROJECT_ID, agora = new Date() } = {}) {
    if (projectId !== PROJECT_ID) throw new Error("projectId fora da allowlist.");
    const p = `projects/${projectId}`;
    const fim = new Date(agora);
    const inicio = new Date(fim.getTime() - 24 * 60 * 60 * 1000);
    const fontes = [
        { fonte: "alertPolicies", url: url(HOST_MONITORING, `/v3/${p}/alertPolicies`, [["pageSize", "1000"]]) },
        { fonte: "notificationChannels", url: url(HOST_MONITORING, `/v3/${p}/notificationChannels`, [["pageSize", "1000"]]) },
        { fonte: "uptimeChecks", url: url(HOST_MONITORING, `/v3/${p}/uptimeCheckConfigs`, [["pageSize", "100"]]) },
        { fonte: "dashboards", url: url(HOST_MONITORING, `/v1/${p}/dashboards`, [["pageSize", "1000"]]) },
        { fonte: "errorGroups24h", url: url(HOST_ERROR_REPORTING, `/v1beta1/${p}/groupStats`, [["timeRange.period", "PERIOD_1_DAY"], ["pageSize", "100"]]) },
        {
            fonte: "requestCount24h",
            url: url(HOST_MONITORING, `/v3/${p}/timeSeries`, [
                ["filter", 'metric.type = "run.googleapis.com/request_count"'],
                ["interval.startTime", inicio.toISOString()],
                ["interval.endTime", fim.toISOString()],
                ["aggregation.alignmentPeriod", "86400s"],
                ["aggregation.perSeriesAligner", "ALIGN_SUM"],
                ["aggregation.crossSeriesReducer", "REDUCE_SUM"],
                ["aggregation.groupByFields", "resource.label.service_name"],
                ["aggregation.groupByFields", "metric.label.response_code_class"]
            ])
        }
    ];
    METRICAS_DESEJADAS.forEach((tipo, i) => {
        fontes.push({ fonte: `metricDescriptor${i}`, url: `${HOST_MONITORING}/v3/${p}/metricDescriptors/${tipo}` });
    });
    return fontes;
}

// ===== Classificação de falha (nunca devolve o texto do erro) =====
//
// <fonte>.code gravado pelo workflow:
//   "<n>"               exit code do gcloud
//   "http:<status>"     resposta HTTP do GET (curl terminou com 0)
//   "curl:<n>"          curl falhou antes de ter resposta (rede/timeout)
//   "auth:unavailable"  sem access token: GET não executado
// O texto (stderr/corpo de erro) só alimenta padrões fixos abaixo.

export function classificarFonte({ codigo, texto = "" } = {}) {
    const c = String(codigo ?? "").trim();
    if (c === "0" || c === "http:200") return STATUS.OK;
    if (c === "") return STATUS.NOT_COLLECTED;
    if (c === CODIGO_SEM_TOKEN) return STATUS.REST_AUTH_UNAVAILABLE;
    const t = String(texto);
    if (/SERVICE_DISABLED|has not been used in project|is disabled|API_NOT_ENABLED|API has not been enabled|not enabled on project/i.test(t)) return STATUS.API_NOT_AVAILABLE;
    if (c === "http:403" || /PERMISSION_DENIED|does not have permission|permission denied|forbidden/i.test(t)) return STATUS.PERMISSION_DENIED;
    if (c === "http:404" || /NOT_FOUND/.test(t)) return STATUS.NOT_FOUND;
    return STATUS.COMMAND_ERROR;
}

// Status + códigos numéricos (sem texto) para o artefato.
export function detalharFonte({ codigo, texto = "" } = {}) {
    const c = String(codigo ?? "").trim();
    const exit = /^(?:curl:)?(\d+)$/.exec(c);
    const http = /^http:(\d{3})$/.exec(c);
    return {
        status: classificarFonte({ codigo: c, texto }),
        exitCode: exit ? Number(exit[1]) : null,
        httpStatus: http ? Number(http[1]) : null
    };
}

// ===== Sanitização =====

export function mascararEmail(email) {
    const m = /^([^@\s])[^@\s]*@[^@\s]*?(\.[A-Za-z]{2,})?$/.exec(String(email));
    if (!m) return "***";
    return `${m[1]}***@***${m[2] || ""}`;
}

const RE_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*(?:\.[A-Za-z]{2,})/g;
const RE_URL = /\b(?:https?|wss?):\/\/[^\s"'<>]+/gi;

export function sanitizarTexto(valor, max = 120) {
    if (valor === undefined || valor === null) return null;
    const limpo = String(valor)
        .replace(RE_URL, "[url-removida]")
        .replace(RE_EMAIL, (e) => mascararEmail(e))
        .replace(/[\r\n\t]+/g, " ")
        .trim();
    return limpo.length > max ? `${limpo.slice(0, max)}…` : limpo;
}

const basename = (nome) => String(nome || "").split("/").pop() || null;
const lista = (v) => (Array.isArray(v) ? v : []);
const numero = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

// ===== Normalizadores (allowlist de campos) =====

export function escopoFunction(nome) {
    if (CORE_BETA_FUNCTIONS.includes(nome)) return "core-beta";
    if (REGISTRO_SEPARADO.includes(nome)) return "registro-separado";
    if (String(nome).startsWith(PREFIXO_FORA_DE_ESCOPO)) return "fora-de-escopo-whatsapp";
    return "outra";
}

export function normalizarFunctions(cru) {
    return lista(cru)
        .map((f) => {
            const partes = String(f?.name || "").split("/");
            const nome = basename(f?.name);
            const regiao = partes.length >= 4 && partes[2] === "locations" ? partes[3] : null;
            const estado = f?.state || f?.status || null;
            const gatilho = f?.eventTrigger ? "event" : "https";
            return {
                name: nome,
                region: regiao,
                state: estado,
                environment: f?.environment || (f?.runtime && !f?.buildConfig ? "GEN_1" : null),
                runtime: f?.buildConfig?.runtime || f?.runtime || null,
                trigger: gatilho,
                updateTime: f?.updateTime || null,
                scope: escopoFunction(nome)
            };
        })
        .filter((f) => f.name)
        .sort((a, b) => a.name.localeCompare(b.name));
}

export function normalizarCloudRun(cru) {
    return lista(cru)
        .map((s) => {
            const labels = s?.metadata?.labels || {};
            const pronto = lista(s?.status?.conditions).find((c) => c?.type === "Ready");
            return {
                name: s?.metadata?.name || null,
                region: labels["cloud.googleapis.com/location"] || null,
                ready: pronto ? pronto.status === "True" : null,
                managedByFunctions: labels["goog-managed-by"] === "cloudfunctions"
            };
        })
        .filter((s) => s.name)
        .sort((a, b) => a.name.localeCompare(b.name));
}

const TIPOS_CONDICAO = ["conditionThreshold", "conditionAbsent", "conditionMatchedLog", "conditionMonitoringQueryLanguage", "conditionPrometheusQueryLanguage", "conditionSql"];

export function normalizarAlertPolicies(cru) {
    return lista(cru?.alertPolicies).map((a) => {
        const condicoes = lista(a?.conditions);
        const metricas = new Set();
        for (const c of condicoes) {
            const filtro = c?.conditionThreshold?.filter || c?.conditionAbsent?.filter || "";
            for (const m of String(filtro).matchAll(/metric\.type\s*=\s*"([^"]+)"/g)) metricas.add(m[1]);
        }
        return {
            displayName: sanitizarTexto(a?.displayName),
            enabled: a?.enabled !== false,
            conditionCount: condicoes.length,
            conditionTypes: [...new Set(condicoes.map((c) => TIPOS_CONDICAO.find((t) => c && t in c) || "outro"))],
            metricTypes: [...metricas].sort(),
            notificationChannelCount: lista(a?.notificationChannels).length
        };
    });
}

// Nunca copia labels (e-mail, número, URL de webhook, token).
export function normalizarNotificationChannels(cru) {
    return lista(cru?.notificationChannels).map((c) => ({
        type: c?.type || null,
        displayName: sanitizarTexto(c?.displayName),
        enabled: c?.enabled !== false,
        verificationStatus: c?.verificationStatus || null
    }));
}

const RE_HOST = /^[a-z0-9.-]+$/i;

export function normalizarUptimeChecks(cru) {
    return lista(cru?.uptimeCheckConfigs).map((u) => {
        const host = u?.monitoredResource?.labels?.host;
        return {
            displayName: sanitizarTexto(u?.displayName),
            protocol: u?.httpCheck ? (u.httpCheck.useSsl ? "https" : "http") : u?.tcpCheck ? "tcp" : "outro",
            resourceType: u?.monitoredResource?.type || null,
            host: typeof host === "string" && RE_HOST.test(host) ? host : null,
            period: u?.period || null
        };
    });
}

export function normalizarLogMetrics(cru) {
    return lista(cru).map((m) => ({
        name: sanitizarTexto(basename(m?.name) || m?.name),
        metricKind: m?.metricDescriptor?.metricKind || null,
        valueType: m?.metricDescriptor?.valueType || null,
        filter: sanitizarTexto(m?.filter, 300),
        disabled: m?.disabled === true
    }));
}

export function normalizarDashboards(cru) {
    return lista(cru?.dashboards).map((d) => {
        const widgets =
            lista(d?.mosaicLayout?.tiles).length ||
            lista(d?.gridLayout?.widgets).length ||
            lista(d?.rowLayout?.rows).reduce((n, r) => n + lista(r?.widgets).length, 0) ||
            lista(d?.columnLayout?.columns).reduce((n, c) => n + lista(c?.widgets).length, 0);
        return { displayName: sanitizarTexto(d?.displayName), widgetCount: widgets };
    });
}

export function tipoDestinoSink(destino) {
    const d = String(destino || "");
    if (d.startsWith("bigquery.googleapis.com/")) return "bigquery";
    if (d.startsWith("storage.googleapis.com/")) return "storage";
    if (d.startsWith("pubsub.googleapis.com/")) return "pubsub";
    if (d.startsWith("logging.googleapis.com/")) return "logging-bucket";
    return d ? "outro" : null;
}

// Só tipo de destino: nunca o caminho, bucket ou writerIdentity.
export function normalizarLogSinks(cru) {
    return lista(cru).map((s) => ({
        name: sanitizarTexto(s?.name),
        destinationType: tipoDestinoSink(s?.destination),
        disabled: s?.disabled === true,
        hasFilter: Boolean(s?.filter),
        hasExclusions: lista(s?.exclusions).length > 0
    }));
}

// Mapa nome de serviço Cloud Run (gen2 usa o nome da Function em minúsculas) → Function.
function funcaoDoServico(servico, nomesFunctions) {
    const s = String(servico || "").toLowerCase();
    return nomesFunctions.find((n) => n.toLowerCase() === s) || null;
}

// Contagens agregadas; nunca payload/mensagem.
export function agregarErros({ logEntries, limite = 1000, errorGroups, statusLogs, statusErrorReporting, nomesFunctions = [] } = {}) {
    const porServico = {};
    let total = 0;
    for (const e of lista(logEntries)) {
        const labels = e?.resource?.labels || {};
        const servico = labels.function_name || labels.service_name || e?.resource?.type || "desconhecido";
        porServico[servico] = (porServico[servico] || 0) + 1;
        total += 1;
    }
    const coreBeta = Object.fromEntries(CORE_BETA_FUNCTIONS.map((n) => [n, 0]));
    for (const [servico, n] of Object.entries(porServico)) {
        const f = funcaoDoServico(servico, [...CORE_BETA_FUNCTIONS, ...nomesFunctions]);
        if (f && f in coreBeta) coreBeta[f] += n;
    }
    const grupos = lista(errorGroups?.errorGroupStats);
    const erPorServico = {};
    for (const g of grupos) {
        for (const s of lista(g?.affectedServices)) {
            if (s?.service) erPorServico[s.service] = (erPorServico[s.service] || 0) + numero(g?.count);
        }
    }
    return {
        source: "Cloud Logging severity>=ERROR (cloud_run_revision, cloud_function), 24h",
        status: statusLogs ?? STATUS.NOT_COLLECTED,
        total: statusLogs === STATUS.OK ? total : null,
        truncated: statusLogs === STATUS.OK ? total >= limite : null,
        byService: statusLogs === STATUS.OK ? porServico : {},
        coreBeta: statusLogs === STATUS.OK ? coreBeta : {},
        errorReporting: {
            status: statusErrorReporting ?? STATUS.NOT_COLLECTED,
            groups: statusErrorReporting === STATUS.OK ? grupos.length : null,
            occurrences: statusErrorReporting === STATUS.OK ? grupos.reduce((n, g) => n + numero(g?.count), 0) : null,
            byService: statusErrorReporting === STATUS.OK ? erPorServico : {}
        }
    };
}

export function agregarRequisicoes(cru) {
    const porServico = {};
    for (const serie of lista(cru?.timeSeries)) {
        const servico = serie?.resource?.labels?.service_name || "desconhecido";
        const classe = serie?.metric?.labels?.response_code_class || "desconhecido";
        const soma = lista(serie?.points).reduce((n, p) => n + numero(p?.value?.int64Value ?? p?.value?.doubleValue), 0);
        porServico[servico] ||= {};
        porServico[servico][classe] = (porServico[servico][classe] || 0) + soma;
    }
    return porServico;
}

export function normalizarApis(cru, status) {
    const habilitadas = new Set(lista(cru).map((s) => s?.config?.name || basename(s?.name)).filter(Boolean));
    return Object.fromEntries(
        APIS_RELEVANTES.map((api) => [api, status === STATUS.OK ? (habilitadas.has(api) ? "ENABLED" : STATUS.API_NOT_AVAILABLE) : status])
    );
}

// Desenho do sinal de createPublicLead (NÃO cria nada): a Function é
// callable gen2 sem log próprio; o sinal viável sai de métrica built-in do
// Cloud Run do serviço `createpubliclead` (5xx) e de logs severity>=ERROR.
export function desenharSinalCreatePublicLead({ functions, requisicoes, metricas }) {
    const f = lista(functions).find((x) => x.name === "createPublicLead");
    const servico = "createpubliclead";
    const req = requisicoes?.[servico] || null;
    return {
        functionLive: f ? f.state === "ACTIVE" : false,
        cloudRunService: servico,
        requestCountMetricAvailable: metricas?.["run.googleapis.com/request_count"] === true,
        requests24hByClass: req,
        proposedSignal:
            'metric.type="run.googleapis.com/request_count" resource.type="cloud_run_revision" resource.label.service_name="createpubliclead" metric.label.response_code_class="5xx"',
        proposedLogFilter: 'resource.type="cloud_run_revision" resource.labels.service_name="createpubliclead" severity>=ERROR',
        note: "Desenho apenas — nenhuma policy/métrica criada. Callable devolve 4xx para erros de validação/rate limit (esperados); só 5xx/ERROR indicam falha."
    };
}

function statusDe(fontes, nome) {
    return fontes?.[nome]?.status ?? STATUS.NOT_COLLECTED;
}

function dadosDe(fontes, nome) {
    return fontes?.[nome]?.status === STATUS.OK ? fontes[nome].dados : null;
}

// fontes: { [fonte]: { status, dados } }
export function construirInventario({ fontes = {}, workflowSha = null, agora = new Date() } = {}) {
    const functions = normalizarFunctions(dadosDe(fontes, "functions"));
    const metricas = Object.fromEntries(
        METRICAS_DESEJADAS.map((tipo, i) => {
            const st = statusDe(fontes, `metricDescriptor${i}`);
            return [tipo, st === STATUS.OK ? true : st === STATUS.NOT_FOUND ? false : st];
        })
    );
    const requisicoes = statusDe(fontes, "requestCount24h") === STATUS.OK ? agregarRequisicoes(dadosDe(fontes, "requestCount24h")) : null;

    const secao = (nome, normalizar) => (statusDe(fontes, nome) === STATUS.OK ? normalizar(dadosDe(fontes, nome)) : []);

    const fonteStatus = Object.fromEntries(
        Object.keys(fontes).sort().map((k) => [k, {
            status: statusDe(fontes, k),
            exitCode: Number.isInteger(fontes[k]?.exitCode) ? fontes[k].exitCode : null,
            httpStatus: Number.isInteger(fontes[k]?.httpStatus) ? fontes[k].httpStatus : null
        }])
    );

    const inventario = {
        projectId: PROJECT_ID,
        workflowSha: /^[0-9a-f]{40}$/.test(workflowSha || "") ? workflowSha : null,
        functions,
        cloudRunServices: secao("runServices", normalizarCloudRun),
        alertPolicies: secao("alertPolicies", normalizarAlertPolicies),
        notificationChannels: secao("notificationChannels", normalizarNotificationChannels),
        uptimeChecks: secao("uptimeChecks", normalizarUptimeChecks),
        logMetrics: secao("logMetrics", normalizarLogMetrics),
        dashboards: secao("dashboards", normalizarDashboards),
        logSinks: secao("logSinks", normalizarLogSinks),
        errorCounts24h: agregarErros({
            logEntries: dadosDe(fontes, "errorLogs24h"),
            errorGroups: dadosDe(fontes, "errorGroups24h"),
            statusLogs: statusDe(fontes, "errorLogs24h"),
            statusErrorReporting: statusDe(fontes, "errorGroups24h"),
            nomesFunctions: functions.map((f) => f.name)
        }),
        metricCapabilities: {
            sources: fonteStatus,
            apis: normalizarApis(dadosDe(fontes, "services"), statusDe(fontes, "services")),
            metricDescriptors: metricas,
            requestCount24hByService: requisicoes,
            createPublicLeadSignal: desenharSinalCreatePublicLead({ functions, requisicoes, metricas }),
            coreBeta: resumoCoreBeta(functions, statusDe(fontes, "functions"))
        },
        frontendCandidate: { ...FRONTEND_CANDIDATE },
        timestamp: new Date(agora).toISOString()
    };
    return verificarArtefatoSeguro(filtrarArtefato(inventario));
}

// Invariante de segurança (fail-closed): se algo escapou da sanitização, o
// build falha e NENHUM artefato é gravado.
const RE_EMAIL_ABERTO = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]+/;
const RE_URL_QUALQUER = /\b(?:https?|wss?):\/\/[^\s"'<>]+/gi;
const RE_TOKEN = /\bya29\.|Bearer\s|-----BEGIN|"private_key"|AIza[0-9A-Za-z_-]{20,}/;

export function verificarArtefatoSeguro(inventario) {
    const json = JSON.stringify(inventario);
    const permitidas = new Set([FRONTEND_CANDIDATE.url, FRONTEND_CANDIDATE.alternativa]);
    const problemas = [];
    if (RE_EMAIL_ABERTO.test(json)) problemas.push("e-mail sem máscara");
    for (const u of json.match(RE_URL_QUALQUER) || []) if (!permitidas.has(u)) problemas.push("URL fora da allowlist");
    if (RE_TOKEN.test(json)) problemas.push("credencial/token");
    if (JSON.stringify(Object.keys(inventario)) !== JSON.stringify(CHAVES_ARTEFATO)) problemas.push("chaves fora da allowlist");
    if (problemas.length) throw new Error(`Invariante de sanitização violada: ${[...new Set(problemas)].join(", ")}. Artefato NÃO gerado.`);
    return inventario;
}

export function resumoCoreBeta(functions, status = STATUS.OK) {
    const porNome = new Map(lista(functions).map((f) => [f.name, f]));
    const live = CORE_BETA_FUNCTIONS.filter((n) => porNome.get(n)?.state === "ACTIVE");
    return {
        status,
        expected: [...CORE_BETA_FUNCTIONS],
        live,
        missing: status === STATUS.OK ? CORE_BETA_FUNCTIONS.filter((n) => !live.includes(n)) : null,
        separateRegistration: Object.fromEntries(
            REGISTRO_SEPARADO.map((n) => [n, status === STATUS.OK ? (porNome.get(n)?.state ?? "NÃO ENCONTRADA") : status])
        ),
        whatsappOutOfScopeCount: lista(functions).filter((f) => f.scope === "fora-de-escopo-whatsapp").length
    };
}

export function filtrarArtefato(obj) {
    return Object.fromEntries(CHAVES_ARTEFATO.map((k) => [k, obj?.[k] ?? null]));
}

// PASS só quando TODAS as fontes esperadas foram coletadas. Descriptor de
// métrica NOT FOUND é resposta válida (a métrica não existe), não falha.
export function fontesEsperadas() {
    return [...FONTES_GCLOUD, ...construirFontesRest().map((f) => f.fonte)];
}

// PASS/PARTIAL descrevem o INVENTÁRIO; FAIL é o job falhar (gate, auth,
// core quebrado, sanitização) e aí não existe artefato.
export function resultado(inventario) {
    const st = inventario?.metricCapabilities?.sources || {};
    const ok = (nome) => st[nome]?.status === STATUS.OK || (nome.startsWith("metricDescriptor") && st[nome]?.status === STATUS.NOT_FOUND);
    return fontesEsperadas().every(ok) ? "PASS" : "PARTIAL";
}

function statusFonte(inventario, fonte) {
    return inventario?.metricCapabilities?.sources?.[fonte]?.status ?? STATUS.NOT_COLLECTED;
}

export function resumoMarkdown(inventario) {
    const st = (f) => statusFonte(inventario, f);
    const n = (chave) => String(lista(inventario?.[chave]).length);
    const linha = (item, fonte, valor) => `| ${item} | ${st(fonte)} | ${st(fonte) === STATUS.OK ? valor : "—"} |`;
    const core = inventario?.metricCapabilities?.coreBeta;
    const erros = inventario?.errorCounts24h;
    const metricas = Object.keys(inventario?.metricCapabilities?.sources || {}).filter((k) => k.startsWith("metricDescriptor") || k === "requestCount24h");
    const metricasOk = metricas.filter((k) => [STATUS.OK, STATUS.NOT_FOUND].includes(st(k))).length;
    const linhas = [
        "## OBSERVABILITY INVENTORY",
        "",
        "| Fonte | Status | Valor |",
        "|---|---|---|",
        linha("Functions live", "functions", String(lista(inventario?.functions).filter((f) => f.state === "ACTIVE").length)),
        linha("Core beta functions live", "functions", `${lista(core?.live).length}/${CORE_BETA_FUNCTIONS.length}`),
        linha("Cloud Run services", "runServices", n("cloudRunServices")),
        linha("APIs habilitadas", "services", "consultadas"),
        linha("Alert policies", "alertPolicies", n("alertPolicies")),
        linha("Notification channels", "notificationChannels", n("notificationChannels")),
        linha("Uptime checks", "uptimeChecks", n("uptimeChecks")),
        linha("Log metrics", "logMetrics", n("logMetrics")),
        linha("Dashboards", "dashboards", n("dashboards")),
        linha("Log sinks", "logSinks", n("logSinks")),
        linha("Errors 24h (logs)", "errorLogs24h", `${erros?.total}${erros?.truncated ? "+ (truncado)" : ""}`),
        linha("Error Reporting 24h", "errorGroups24h", String(erros?.errorReporting?.occurrences)),
        linha("Requests 24h (Cloud Run)", "requestCount24h", "consultadas"),
        `| Metric descriptors | ${metricasOk}/${metricas.length} respondidos | — |`,
        `| **Inventory result** | **${resultado(inventario)}** | — |`
    ];
    return linhas.join("\n") + "\n";
}
