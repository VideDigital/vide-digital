# Runbook — Inventário de Observabilidade (somente leitura)

Status: **preparado, ainda não executado.** Este canal **não configura
monitoramento, não cria alertas e não altera produção.** Ele só descobre o
estado real, para que o próximo passo (desenho de alertas/uptime) parta de
fatos e não de suposições. Executar exige autorização separada.

## 1. O que é

Workflow `Observability Inventory — Read Only`
(`.github/workflows/observability-inventory.yml`), **somente
`workflow_dispatch`**, projeto fixo `vide-digital-saas`. Lógica pura e
testada em `scripts/observability-inventory-core.mjs`; CLI em
`scripts/observability-inventory-cli.mjs`.

## 2. Como executar (quando autorizado)

Actions → *Observability Inventory — Read Only* → *Run workflow* na `main`:

| Input | Valor |
|---|---|
| `project_id` | `vide-digital-saas` (exato) |
| `expected_sha` | SHA completo (40 hex) do HEAD atual de `main` |
| `confirm_read_only` | `OBSERVE_ONLY` (exato) |

## 3. Gates (antes de autenticar, falham fechado)

1. Disparo a partir de `refs/heads/main`.
2. `github.sha == expected_sha == HEAD atual de main` (github-script, sem checkout).
3. Checkout explícito do SHA e conferência `git rev-parse HEAD`.
4. `project_id` e `confirm_read_only` exatos (`observability-inventory-cli.mjs inputs`).
5. Quality Gate push/main do SHA `completed/success` com os 4 jobs
   (`scripts/pages-qg-gate.mjs`, o mesmo gate do Pages).

Autenticação: mesmo padrão dos workflows Firebase — WIF se
`GCP_WORKLOAD_IDENTITY_PROVIDER` + `GCP_SERVICE_ACCOUNT` existirem, senão a
chave `FIREBASE_SERVICE_ACCOUNT` (situação atual). Nenhuma credencial ou IAM é
criada.

## 4. O que é lido (e só isso)

| Fonte | Comando / endpoint (somente leitura) |
|---|---|
| APIs habilitadas | `gcloud services list --enabled` |
| Functions | `gcloud functions list` |
| Cloud Run | `gcloud run services list` |
| Log-based metrics | `gcloud logging metrics list` |
| Log sinks | `gcloud logging sinks list` |
| Erros 24h | `gcloud logging read 'severity>=ERROR …' --freshness=1d --limit=1000` — só `resource.type`, nome do serviço/Function e severidade (**sem payload**) |
| Alert policies | `GET monitoring v3 …/alertPolicies` |
| Notification channels | `GET monitoring v3 …/notificationChannels` |
| Uptime checks | `GET monitoring v3 …/uptimeCheckConfigs` |
| Dashboards | `GET monitoring v1 …/dashboards` |
| Error Reporting | `GET clouderrorreporting v1beta1 …/groupStats?timeRange.period=PERIOD_1_DAY` |
| Requisições 24h | `GET monitoring v3 …/timeSeries` de `run.googleapis.com/request_count`, agregado por serviço e classe de resposta |
| Capacidades de métrica | `GET monitoring v3 …/metricDescriptors/<tipo>` (6 tipos fixos) |

As URLs REST são geradas pelo core (lista fechada, testada) e o workflow
recusa qualquer host fora de Monitoring/Error Reporting. `curl` sem método,
corpo ou upload. O access token fica num arquivo de header `0600`, mascarado e
apagado no fim do passo. Prompts do gcloud desligados
(`CLOUDSDK_CORE_DISABLE_PROMPTS=1`,
`CLOUDSDK_CORE_SHOULD_PROMPT_TO_ENABLE_API=false`): **API desabilitada nunca é
habilitada** — vira `API NOT AVAILABLE`.

## 5. Status por fonte e controle de fluxo

| Status | Significado |
|---|---|
| `OK` | fonte lida |
| `PERMISSION_DENIED` | a conta não tem o papel de leitura (403 / `PERMISSION_DENIED`) |
| `API_NOT_AVAILABLE` | API desabilitada (`SERVICE_DISABLED`) — **nunca habilitada** |
| `NOT_FOUND` | recurso inexistente (em `metricDescriptor*` é resposta válida) |
| `COMMAND_ERROR` | outro exit ≠ 0 / HTTP ≠ 200 / falha de rede do curl |
| `REST_AUTH_UNAVAILABLE` | sem access token: os GETs REST não foram feitos |
| `NOT_COLLECTED` | a fonte não chegou a rodar |

No artefato cada fonte vira `{ status, exitCode, httpStatus }` — **nunca** o
texto do erro. O stderr / corpo de erro fica só em `$WORK_DIR/raw`, alimenta
padrões fixos de classificação e é apagado depois do build.

O runner executa `bash --noprofile --norc -e -o pipefail`. Cada fonte roda
como condição de `if` (errexit suspenso só para aquele comando) e grava o
próprio exit code, então uma fonte indisponível não derruba as demais. Não há
`set +e` nem `|| true`: qualquer outra falha do passo continua abortando.
Motivo: no run 36617755341 o `gcloud logging metrics list` saiu ≠ 0 e o
errexit abortou a coleta inteira (coberto por
`tests/ci/observability-inventory-errexit.test.mjs`, que executa os blocos
`run:` reais sob esse shell).

`PERMISSION_DENIED` indica papel de leitura faltando (ex.:
`roles/monitoring.viewer`, `roles/logging.viewer`,
`roles/errorreporting.viewer`). **Conceder papel é mudança de IAM e exige
autorização separada** — este canal não altera IAM.

## 6. Artefato `observability-inventory`

JSON (retenção 90 dias) com exatamente as chaves: `projectId`, `workflowSha`,
`functions[]`, `cloudRunServices[]`, `alertPolicies[]`,
`notificationChannels[]`, `uptimeChecks[]`, `logMetrics[]`, `dashboards[]`,
`logSinks[]`, `errorCounts24h`, `metricCapabilities`, `frontendCandidate`,
`timestamp`.

`metricCapabilities` traz: `sources` (status de cada fonte), `apis`,
`metricDescriptors`, `requestCount24hByService`, `createPublicLeadSignal` e
`coreBeta` (7 Functions core esperadas × live, `createPublicOrderQuote` à
parte, contagem de `whatsapp*` fora de escopo).

Proteções (allowlist de campos, testadas com fixtures "sujas"):

- e-mails mascarados como `d***@***.com`; URLs viram `[url-removida]`;
- canais: só tipo, nome mascarado, `enabled`, verificação — **nunca `labels`**
  (e-mail, número, webhook, token);
- sinks: só tipo de destino — nunca caminho nem `writerIdentity`;
- Functions/Cloud Run: nunca variáveis de ambiente, service account ou URL;
- uptime: só host — nunca path (pode apontar tenant) nem headers;
- alertas: nunca `documentation`; Error Reporting: só contagens, nunca mensagem;
- os arquivos crus ficam só no runner e **não** são publicados.

## 7. Resultado e Step Summary

| Resultado | Quando | Job | Artefato |
|---|---|---|---|
| **PASS** | todas as fontes `OK` (descriptor `NOT_FOUND` conta como resposta) | SUCCESS | sim |
| **PARTIAL** | alguma fonte `PERMISSION_DENIED` / `API_NOT_AVAILABLE` / `REST_AUTH_UNAVAILABLE` / `COMMAND_ERROR` / `NOT_COLLECTED`, todas registradas | SUCCESS | sim |
| **FAIL** | gate (main/SHA/QG/entradas), autenticação, core/CLI quebrado, JSON inválido numa fonte `OK`, invariante de sanitização violado | FAILURE | não |

PARTIAL conclui o job com SUCCESS porque é diagnóstico válido, não defeito do
workflow — mas **não autoriza configurar observabilidade**. O Step Summary
lista cada fonte com status e valor (nenhuma some) e termina com
`Inventory result: PASS | PARTIAL`; em FAIL registra que nada foi gerado.

## 8. Escopo das Functions

- Core beta (7): `createEmployee`, `updateEmployee`, `enableEmployee`,
  `disableEmployee`, `adminUpdateStoreStatus`, `createPublicLead`,
  `createPublicReview` (gen2, `southamerica-east1`; serviço Cloud Run = nome
  em minúsculas).
- `createPublicOrderQuote`: registrada à parte; só conta como live se o
  inventário a encontrar.
- `whatsapp*`: fora do escopo de observabilidade do beta (apenas contadas).

## 9. Sinal de `createPublicLead` (desenho, nada criado)

Callable gen2 sem log próprio: erros de validação/rate limit voltam 4xx
(esperados). Sinal proposto: `run.googleapis.com/request_count` do serviço
`createpubliclead` com `response_code_class="5xx"`, complementado por logs
`severity>=ERROR` do mesmo serviço. O inventário informa se a métrica existe
e o volume real por classe nas últimas 24h — base para decidir limiar.

## 10. Frontend (candidato a uptime)

`https://videdigital.github.io/vide-digital/` (alternativa `login.html`) —
raiz pública do Pages, nunca rota de loja/tenant. **Não verificado ao vivo**
por este canal.

## 11. Recovery × observabilidade

PITR e delete protection são conferidos pelo `Recovery Minimal Gate`
(`docs/RECOVERY_RUNBOOK.md`). Hoje não há alerta de falha de recovery nem
backup agendado; o inventário mostra se existe alguma policy/canal que
cubra isso. Qualquer alerta novo é missão separada.

## 12. Próximo passo

Depende do inventário real: com o artefato em mãos, decidir (com
autorização explícita) canais de notificação, alert policies, uptime check e
papéis de leitura faltantes. Nada disso é feito por este workflow.
