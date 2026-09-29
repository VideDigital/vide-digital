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

## 5. Status por fonte

`OK` · `API NOT AVAILABLE` · `PERMISSION DENIED` · `NOT FOUND` · `ERROR` ·
`NOT COLLECTED`. Falha de uma fonte não interrompe as outras. O texto de erro
é usado só para classificar — nunca é impresso nem publicado.

`PERMISSION DENIED` significa que a conta de serviço usada não tem o papel de
leitura correspondente (ex.: `roles/monitoring.viewer`,
`roles/logging.viewer`, `roles/errorreporting.viewer`). **Conceder papel é
mudança de IAM e exige autorização separada** — este canal não altera IAM.

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

## 7. Step Summary

`OBSERVABILITY INVENTORY` com Functions live, core beta live N/7, alert
policies, channels, uptime, user log metrics, dashboards, erros 24h e
`Result`: **PASS** (todas as fontes coletadas) ou **PARTIAL** (alguma
indisponível — ver `sources`). Sem inventário (gate/autenticação falhou):
`FAIL`, nada coletado.

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
