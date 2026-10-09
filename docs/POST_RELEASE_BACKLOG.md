# Sprint final de produção — backlog e evidências

## ESTADO FINAL DO RELEASE — 09/10/2026

**CANDIDATO A RELEASE APROVADO NOS FLUXOS CRÍTICOS TESTADOS — PENDENTE REVISÃO E MERGE DOCUMENTAL.**

Não há B0/B1 conhecido não resolvido no perímetro efetivamente auditado e testado abaixo. Não significa ausência universal de bugs ou aceitação de funcionalidades fora desse perímetro. PR #103 permanece OPEN/DRAFT, sem autorização de merge.

### FATO COMPROVADO — código, QG e publicação

| Evidência | Resultado |
|---|---|
| Main | `8d2ba76ca1f82a8303fa193bf45e5f614c0a536a` |
| [QG 37806611706](https://github.com/VideDigital/vide-digital/actions/runs/37806611706) | push/main, SHA exato, attempt 1, 4/4 SUCCESS |
| [Deploy IA 37812607274](https://github.com/VideDigital/vide-digital/actions/runs/37812607274) | SUCCESS no SHA atual; somente askBusinessAI e askPublicBusinessAI |
| [Deploy lead 37497223831](https://github.com/VideDigital/vide-digital/actions/runs/37497223831) | SUCCESS em `64aef85b1ffc1d5080a0812ba25c8cd53de12fa6`; somente createPublicLead |
| Revisões de aceitação | privada `askbusinessai-00017-lug`; pública `askpublicbusinessai-00006-jeg`; lead `createpubliclead-00004-ten` |

**AI-01 resolvido na Sprint 077:** cota pública limitada a 100 dentro do total mensal de 200, preservando reserva privada. Entrada validada antes do débito; transação, isolamento multi-tenant e autorização server-side preservados.

**AI-02 resolvido na Sprint 077:** query pública e allowlist defensiva limitam catálogo a `statusProduto === "ativo"`. Tenant é resolvido pelo servidor; valores enviados pelo visitante não são autoridade. Estados negativos e concorrência são comprovados por testes, não por ataques em produção.

[PR #104](https://github.com/VideDigital/vide-digital/pull/104) integrada em `64aef85b1ffc1d5080a0812ba25c8cd53de12fa6`, HEAD `7a5eebe60150e2cc0e8117e89b6bf4bc1138f903`. [QG pré-merge 37339991204](https://github.com/VideDigital/vide-digital/actions/runs/37339991204) e [QG main 37474589547](https://github.com/VideDigital/vide-digital/actions/runs/37474589547): attempt 1, 4/4 SUCCESS nos respectivos SHAs. Contrato frontend/Function corrigido. Ver [AI_B1_077_RELEASE.md](AI_B1_077_RELEASE.md).

Sprint 081: retry limitado, deadlines, falha persistente `unavailable` e quota debitada uma vez por chamada. [PR #105](https://github.com/VideDigital/vide-digital/pull/105) integrada em `c0c0ad8772270807e2a6726e117704ba75eef449`. Sprint 085: falha real por timeout local de duas tentativas de aproximadamente 20 s, Function HTTP 503 em 41,29 s; status HTTP do Gemini não comprovado. Não reclassificada como flake.

Sprint 086: primário fixo `gemini-3.8-flash`, thinking low, Function 90 s, deadline global 65 s, orçamento primário 35 s; fallback fixo `gemini-3.5-flash-lite`, thinking minimal, até 25 s limitado pelo tempo restante. Máximo de uma tentativa primária e uma de fallback; somente 500/502/503, rede e timeout habilitam fallback, não 400/401/403/404/429 ou JSON inválido. [PR #106](https://github.com/VideDigital/vide-digital/pull/106), HEAD `c365adce3a5c1ba4ec19c4f19a986769470e9021`, integrada no SHA atual. Detalhes: [AI_PROVIDER_RESILIENCE_081.md](AI_PROVIDER_RESILIENCE_081.md), [AI_LATENCY_FALLBACK_086.md](AI_LATENCY_FALLBACK_086.md).

### FATO COMPROVADO — aceitação em produção no QA

Tenant exclusivo: **Vide Hub QA - Testes**, slug `vide-hub-qa-testes`. Evidências de missões anteriores; Sprint 095 não executou novos smokes nem writes.

| Fluxo | Evidência real e limite |
|---|---|
| IA privada — Sprint 089, 08/10 | PASS, HTTP 200, duração Cloud Run 19,82 s; resposta útil e coerente, Gemini primário em uma tentativa, sem fallback. Quota total 4 → 5, pública permaneceu 1. Loading terminou. |
| IA pública — Sprint 093, 08/10 | PASS pelo Firebase JS SDK público anônimo, sem sessão administrativa/header Authorization. Uma pergunta, HTTP 200; cliente 16,16 s, Cloud Run 15,23 s. Resposta coerente com catálogo QA, sem exposição privada observada; primário respondeu, sem fallback. Quota total/pública 5/1 → 6/2. |
| Restauração QA — Sprint 093 | Flags temporárias inicialmente ausentes voltaram a ausentes no finally; comparação tipada confirmou preservação dos campos não relacionados. updateTime mudou como metadado. |
| Lead → CRM — Sprints 079/094 | PASS em produção reaproveitando captura de 06/10 da Sprint 079: HTTP 200, um único lead sintético, propriedade/tenant corretos, persistência e presença na Central Comercial. Sprint 094 não executou novo E2E nem nova captura. |
| Limpeza | Fixture `0mU9HPPhxqrqD5aGaUPt` removida de forma restrita na Sprint 079; GET 404 original e ausência revalidada por GET 404 em 09/10 na Sprint 094. Nenhum lead anterior apagado. |
| Login, painel, loja/LP e pedidos | Aceitações individuais da Sprint 079 no QA, incluindo pedidos em empty state. Não é teste completo de toda gestão. Smoke global da 079 não aprovado por causa da IA então falha. |

Fontes: artefatos locais `sprint-079-report.md`, `SPRINT_089_PRODUCTION_AI_SMOKE.md`, `SPRINT_093_PUBLIC_AI_PRODUCTION_SMOKE.md` e `SPRINT_094_PUBLIC_LEAD_CRM_SMOKE.md`. Resultados reproduzidos aqui; artefatos não versionados nesta PR. CRM visual foi registrado no relatório 079, sem screenshot preservado para revisão independente. Sprints 090–092 diagnosticaram encerramento prematuro do procedimento público e prepararam execução sequencial pelo SDK; bloqueio da ferramenta não demonstrava defeito da Function.

### FATO COMPROVADO apenas por testes automatizados

Contratos, limites de quota, concorrência, validação antes do débito, status do catálogo, isolamento negativo e resiliência/fallback têm cobertura automatizada. Emulator/mocks não provam inferência real ou estado integral de produção. **Fallback não observado em produção:** ambos os smokes aprovados usaram o primário.

### NÃO FOI POSSÍVEL COMPROVAR

- Widget público visual end-to-end por navegador real: SDK valida a Function, não o widget.
- Exclusão prática de produtos inativos na resposta real: QA não tinha produtos inativos; código/testes sustentam o filtro, aquela resposta isolada não o prova.
- Fallback em incidente real, comportamento em todos os tenants/cargas, ausência universal de erros, faturamento/créditos e configurações externas sem inventário específico.
- Decimais no lead real: payload não exercitou esse campo; testes são evidência complementar.

**HIPÓTESE:** latências semelhantes em outras cargas/tenants ou recuperação pelo fallback em incidente futuro; não são fatos de aceitação.

Backlog B2/B3 preservado abaixo, sem iniciar hardening opcional. WhatsApp continua piloto fora do escopo, sem aceitação operacional. Próximo passo: revisão documental e novo QG da PR; merge exige autorização específica. Esta missão não autoriza deploy, Pages ou smoke.

## AUDITORIA HISTÓRICA — 05/10/2026

Causas e evidências abaixo pertencem ao estado anterior às correções. Planos/inputs antigos não são instruções atuais: NÃO EXECUTAR. O estado final acima prevalece.

Data: 2026-10-05. Base auditada: `0ebc271448960105a4004367901fbc2d39602d3b`.
Branch deste documento: `docs/final-production-sprint-audit`.
Escopo: diagnóstico e documentação. Nenhuma correção de aplicação, infraestrutura ou deploy.

## Decisão histórica de release — superada

**Em 05/10, release bloqueado:** dois B1 reproduzidos localmente; ambos corrigidos na Sprint 077 e publicados. Diagnóstico preservado abaixo, sem bloqueadores atuais.
Nenhum B0 foi comprovado nesta auditoria limitada. Isso não equivale a provar ausência universal de falhas.

Classificações:
- **FATO COMPROVADO**: leitura da main, estado GitHub, teste local isolado ou observação direta especificada.
- **HIPÓTESE**: consequência dependente de configuração/estado de produção não inspecionado.
- **NÃO FOI POSSÍVEL COMPROVAR**: falta evidência atual suficiente.

## Missão 076 e preparação da 075

FATO COMPROVADO:
- Base anterior: `c0fbdd3858fbfb7a55237856f4cde8af7d63ad69`.
- PR [#102](https://github.com/VideDigital/vide-digital/pull/102), branch `chore/public-lead-deploy-channel-076`, HEAD `72a1c661cfcc43ba340eae48bc38bd4714ded8d6`.
- Pre-merge: main e HEAD inalterados; quatro arquivos esperados; sem comentários, reviews ou threads pendentes; mergeable.
- QG da PR [37061241252](https://github.com/VideDigital/vide-digital/actions/runs/37061241252): attempt 1, 4/4 SUCCESS no HEAD exato.
- PR marcada Ready e mergeada por merge commit com `expected_head_sha`.
- Merge/main: `0ebc271448960105a4004367901fbc2d39602d3b`.
- QG push/main correspondente: [37316331815](https://github.com/VideDigital/vide-digital/actions/runs/37316331815). Exigir conclusão success e os quatro jobs success antes de autorizar publicação.
- Workflow presente no SHA: `.github/workflows/firebase-deploy-public-lead-075.yml`, nome **Deploy Function — Public Lead 075**.
- Trigger somente manual; projeto fixo `vide-digital-saas`; escopo fixo `functions:createPublicLead`; não publica Pages, IA ou WhatsApp.
- Quatro arquivos da PR: workflow acima, `docs/PUBLIC_LEAD_075_DEPLOY_SMOKE.md`, `package.json`, `tests/ci/firebase-deploy-public-lead-075-workflow.test.mjs`.
- Frontend/Functions/Rules/Storage/indexes/Auth/multi-tenant não tiveram comportamento alterado pela PR #102. Seu impacto é o canal de release e a inclusão dos testes de workflows no QG.
- Deploy e dry-run não executados nesta auditoria.

Inputs históricos de 05/10, não executados naquela auditoria; obsoletos — **NÃO EXECUTAR**:

```text
ref=main
confirmacao=PUBLICAR
sha=0ebc271448960105a4004367901fbc2d39602d3b
```

```powershell
gh workflow run firebase-deploy-public-lead-075.yml --repo VideDigital/vide-digital --ref main -f confirmacao=PUBLICAR -f sha=0ebc271448960105a4004367901fbc2d39602d3b
```

A autorização é separada. Se main avançar, revalidar QG e obter autorização do novo SHA.
O dry-run faz parte da publicação autorizada e pode habilitar APIs; não foi usado como diagnóstico.

## B1 históricos — corrigidos na Sprint 077

### AI-01 — visitante pode consumir a cota da IA privada

**FATO COMPROVADO no código e em execução local isolada.**
`askPublicBusinessAI` e `askBusinessAI` chamam o mesmo `assertMonthlyQuota(ownerUid)`.
A fonte de verdade é `ia_negocio_uso/{ownerUid}_{AAAA-MM UTC}`; limite 200; incremento transacional antes de carregar contexto e chamar Gemini.
Não existe reserva de mensagens para o dono.

Reprodução segura: contador sintético em 199; uma chamada pública; contador em 200; chamada privada recebe `resource-exhausted` antes do provedor.
Também reproduzido: falha do provedor consome a última unidade; `historico: [null]` causa erro interno depois do débito, sem sequer chamar o provedor.
Nenhuma cota real foi consumida e nenhum flood foi executado.

**Impacto:** o visitante consegue indisponibilizar a IA principal daquele tenant até o próximo mês UTC, mesmo sem obter resposta útil.
A transação limita custo de inferência, mas não preserva disponibilidade do dono.
**HIPÓTESE operacional:** alcance em produção depende de versão implantada, plano elegível e toggle público ativo; isso não foi revalidado no backend vivo.

Correção proposta em 05/10, posteriormente implementada na Sprint 077: orçamento público separado ou reserva privada dentro do teto global existente; validação completa do histórico antes do débito; estratégia explícita para falhas/retries sem liberar orçamento ilimitado. Testar concorrência, limite, virada de mês, legado e público esgotado com dono ainda funcional.

### AI-02 — contexto público inclui catálogo privado por status

**FATO COMPROVADO no código e em execução local isolada.**
`carregarProdutosPublicos` consulta produtos por `criadoPor`, sem filtrar status.
`resumirProdutosPublicos` exclui apenas `rascunho`; inclui `arquivado`, status ausente e status desconhecido.
O teste sintético comprovou nome e preço de produto arquivado/sem status no texto do prompt público.
As Rules e seus testes tratam esses produtos como privados e permitem o catálogo público somente em status ativo.

**Impacto:** dados de catálogo não publicados entram no contexto de uma IA acessível ao visitante. O Admin SDK não é restringido pelas Rules.
Não foi demonstrado vazamento cross-tenant nem feita tentativa de extração em produção.
**HIPÓTESE:** Gemini pode reproduzir esses nomes/preços na resposta; a resposta real e os dados de clientes não foram consultados.

Correção proposta em 05/10, posteriormente implementada na Sprint 077: query por `criadoPor` e `statusProduto == "ativo"`, mais allowlist defensiva no builder; testes para ativo/rascunho/arquivado/ausente/desconhecido.
Verificar necessidade de índice sem alterar indexes nesta missão. Se necessário, tratar autorização de infraestrutura separadamente.

### Evidência de execução local

Cinco testes diagnósticos passaram usando o código do SHA auditado em VM, com Firestore, transporte do Gemini, autenticação e resolução do tenant simulados:
1. última unidade pública bloqueia dono;
2. falha do provedor mantém débito;
3. histórico inválido mantém débito sem provedor;
4. catálogo arquivado/sem status entra no prompt público;
5. opções declaradas da IA pública desabilitam App Check e não fixam maxInstances.

Os testes caracterizam falhas existentes; não são testes de correção nem prova de produção.
A aplicação e os testes existentes do repositório não foram modificados.

## Auditoria histórica da IA — estado anterior a 077/081/086

| Aspecto | Evidência e conclusão |
|---|---|
| Rate limit | FATO COMPROVADO: 8 por janela de 60s, transação Firestore, scope askPublicBusinessAI. Identidade é auth.uid quando presente; senão primeiro XFF, depois rawRequest.ip/socket. Não é identidade resistente a rotação. |
| Tenant | FATO COMPROVADO: resolução por documento público da loja/LP; dono aprovado; plano e toggle relidos em usuarios. ownerUid/tenantId fornecidos pelo visitante não são autoridade. |
| Dados | FATO COMPROVADO: query pelo dono; caminho público não lê pedidos/leads e não inclui estoque exato. Defeito de status em AI-02. |
| Cota | FATO COMPROVADO: 200 compartilhadas/mês UTC, contador transacional; escrita de cliente negada pelas Rules da main. Defeito de disponibilidade em AI-01. |
| Gemini/custo | FATO COMPROVADO: alias gemini-flash-latest; máximo de saída configurado em 1024 tokens; pergunta 800 caracteres, histórico até 8 mensagens, contexto até 8000 caracteres. No estado íntegro do contador, até 200 tentativas de inferência/tenant/mês; teto configurado de saída acumulada 204800 tokens. Não inclui entrada, possíveis tokens internos, Functions, Firestore ou rede. |
| Preço real | NÃO FOI POSSÍVEL COMPROVAR: modelo atualmente resolvido pelo alias, tarifa, créditos, faturamento e custo monetário real. Não afirmar que o custo total da plataforma tem teto global. |
| App Check | FATO COMPROVADO no código: enforceAppCheck false na IA pública. Configuração implantada não inspecionada. Não alterar enforcement. |
| Instâncias | FATO COMPROVADO: sem maxInstances explícito nas opções lidas. NÃO FOI POSSÍVEL COMPROVAR limite vivo ou overrides externos. |
| Erros | FATO COMPROVADO: rede/404/outros status retornam unavailable; 429 Gemini retorna resource-exhausted com mensagem de créditos; exceções inesperadas viram internal. 429 nem sempre significa falta de créditos, então mensagem merece melhoria B2. |
| Timeout | FATO COMPROVADO: fetch não tem AbortController/timeout de aplicação explícito. Limite vivo da Function não inspecionado. |
| Idempotência | FATO COMPROVADO: não há chave de tentativa/cache no handler; UI bloqueia envio simultâneo enquanto aguarda. Retry independente volta a consumir orçamento. |
| Execução real | NÃO FOI POSSÍVEL COMPROVAR resposta atual do Gemini. Testes de UI/controllers não substituem inferência real. |

## Matriz histórica dos fluxos críticos — 05/10

A evidência abaixo é cobertura lida na main; o resultado agregado depende do QG desse SHA.
Não extrapolar testes do Emulator para uma revisão de produção desconhecida.

| Fluxos | Testes/evidência |
|---|---|
| Login e dashboard | `tests/emulator/ui/login.smoke.mjs`, `profiles.smoke.mjs`: login Auth Emulator e navegação owner/editor/reader. Tela de login de produção abriu, sem sessão autenticada disponível. |
| Tenant context e permissões | `tests/vide-context.test.mjs`, `tests/security-permission-harness.mjs`, `tests/emulator/firestore-security.test.mjs`: leituras/escritas permitidas e negativas entre tenants. |
| Funcionários | `tests/functions/employees.test.mjs`, `tests/functions/emulator/employee-limit.test.mjs`: autorização, limite, inativos e contagem por tenant. Sem contratação em produção. |
| Loja pública | `loja-chat-publico.flow.mjs`, `produtos.flow.mjs`; loja QA real abriu com produto preexistente de R$ 9,93 e busca sem resultado funcionou. |
| LP pública e publicação | `landing-page-publication.flow.mjs`: publicação/despublicação atômicas e rejeição integral em falhas; testes do renderer/XSS. LP QA viva não identificada nesta sessão. |
| Lead e CRM | `landing-page-leads.flow.mjs`: uma captura, criadoPor/tenantId corretos, fallback/retry, dono bloqueado, página inexistente e cross-tenant. `crm-base-ia.flow.mjs`, testes CRM/lead: fluxo e contratos. Sem nova captura em produção. |
| Rate limit da 075 | Testes unitários, Firestore Emulator e smoke HTTP no QG: bucket por tenant, identidade não forjada, dedupe, corrida de dono, limite e contenção. Deploy ainda pendente em 05/10; publicado posteriormente, conforme seção inicial. |
| Pedidos | `pedidos.flow.mjs`: status/pagamento, sincronização com lead, auditoria, persistência após reload; quote server-side tem testes próprios. |
| Produtos | `produtos.flow.mjs`: permissões, catálogo/gestão, filtros, listeners e reload; Rules negam catálogo privado. |
| IA principal | Testes de controller/prompt/Rules; resposta do Gemini em produção não comprovada; AI-01/AI-02 bloqueavam a conclusão em 05/10; corrigidos e publicados posteriormente. |
| Reload | Coberto em pedidos, produtos e fluxos LP; inspeção pública complementar não equivale a sessão autenticada. |
| Mobile/desktop | `responsive.smoke.mjs`: cinco viewports; LP leads em 390x844; pedidos/produtos em 1440x900. |
| Vazio, erro/loading | Busca vazia real na loja QA; testes produtos sem resultado, LP com falha e retry, chat com erro/busy/recuperação, controllers IA com estado enviando e erro. Não é matriz exaustiva de todas as telas. |

## Backlog B2 — não implementar agora

| ID | Item | Estado/evidência e critério futuro |
|---|---|---|
| B2-01 | Rate limits restantes da 074 | FATO COMPROVADO em shared/rateLimit e KNOWN_LIMITATIONS: review 5/min, order quote 10/min, IA pública 8/min, chat create 5/min, chat send 20/min, métricas 60/min usam XFF/auth descartável. Migrar por risco com testes Emulator. O B1 AI-01 foi corrigido na 077 com público 100 dentro do total 200; hardening da identidade permanece B2. |
| B2-02 | TTL de _rate_limits e dedupes | Campos expiresAt existem; policy viva NÃO FOI POSSÍVEL COMPROVAR. Validar retenção/volume e pedir autorização específica antes de configurar. Incluir lead_dedupes/pedido_quote_dedupes conforme inventário. |
| B2-03 | App Check / Cloud Armor | Proteção de borda pendente; rollout exige cliente compatível e autorização de infraestrutura. Não ligar enforcement de surpresa. |
| B2-04 | Chat público legado | KNOWN_LIMITATIONS registra V2 com Anonymous Auth e legado V1 preservado. Avaliar retirada/migração e autorização das callables antigas sem quebrar legado. Sem nova prova de exploit vivo. |
| B2-05 | Order quote | Preservar preço calculado, isolamento por origem, validade e idempotência; quote não reserva estoque nem processa pagamento. Rate limit/borda/TTL continuam pendentes. |
| B2-06 | Public review | Hardening de abuso, identidade e métricas de moderação; não reintroduzir writer direto. |
| B2-07 | Métricas públicas | Integridade de contagem e abuso; em 05/10, visualizações apareceram indisponíveis na loja QA, sem impedir catálogo. Causa não isolada; não afirmar defeito atual sem reprodução. |
| B2-08 | Limites da 075 | 60/min por tenant pode rejeitar captura legítima sob abuso; válvula 600/min é compartilhada por instância, zera em cold start e não limita o conjunto de instâncias. Ajustar por métricas, não suposição de escritas/s. |
| B2-09 | Robustez adicional da IA | Idempotência de tentativa, mensagem de 429, limites por plano, observabilidade e custo dos modelos fixados. Timeout/deadlines/fallback implementados em 081/086; AI-01/AI-02 corrigidos em 077. Fallback ainda sem exercício real aprovado. |
| B2-10 | Error Reporting automático E2E | Instrumentação/testes não provam geração real de evento e alerta; evidência E2E atual NÃO FOI POSSÍVEL COMPROVAR. Validar com QA autorizado. |
| B2-11 | Revogação/permissões legadas | Revalidar sessão já aberta de dono suspenso e warnings de funcionários/notificações quando houver sintoma atual. Relatos históricos não bastam para chamar regressão. |
| B2-12 | Auditoria limitada e revisões | KPIs com consulta limitada e deep-link incompleto são limitações conhecidas. Divergência histórica dos triggers não foi revalidada ao vivo; não afirmar B1 atual sem inventário. |
| B2-13 | Master Mode / futura impersonation | Ampliações administrativas exigem autorização server-side própria; não ampliar agora. |
| B2-14 | Google OAuth em produção | Login e-mail/senha coberto em Emulator; popup Google real atual não validado nesta sessão. Incluir na validação operacional quando houver sessão QA. |

## Backlog B3 — não implementar agora

| ID | Item | Estado/evidência e critério futuro |
|---|---|---|
| B3-01 | Tailwind / manifest | Warning de CDN Tailwind observado na loja QA em produção. Warning de manifest é histórico/não reproduzido nesta inspeção. Empacotar/revisar em manutenção. |
| B3-02 | Artifact Registry cleanup | Retenção e política viva NÃO FOI POSSÍVEL COMPROVAR; revisar custos e política com autorização específica, sem apagar imagens nesta missão. |
| B3-03 | Studio / base64 | Consolidar gerações e observer residual com caracterização; migrar mídia gradualmente, sem redesign no sprint. |
| B3-04 | UX e nomenclatura | Distinguir IA de Negócio, IA pública, Central de IA e Copiloto; configuração não promete automação. Modal de produto e navegação só merecem correção bloqueante se houver falha atual reproduzida. |
| B3-05 | Notificações / limites silenciosos | Evoluir leitura entre dispositivos e limites client-side de consulta; documentar limites atuais. |
| B3-06 | Documentação / planos | Consolidar histórico, nomes de features e avisos de recursos futuros. Domínio próprio/billing/agenda/relatórios avançados não são parte deste release. |
| B3-07 | CI e runtime | Job de UI longo/serial; avisos do CLI/runtime; otimizar depois sem enfraquecer asserts/timeouts. |
| B3-08 | Piloto WhatsApp | Apenas referência ao backlog existente e gates externos. Nada inspecionado operacionalmente, alterado ou publicado neste sprint. |

Referência complementar: [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).
Fontes antigas de agosto citam bugs posteriormente cobertos/corrigidos (navegação Produtos, checkout, produtos arquivados nas Rules). Não reabrir por documentação antiga sem reprodução.
A falha histórica AI-02 era um caminho Admin SDK distinto da leitura direta nas Rules; corrigido na 077.

## Produção histórica e limites da evidência — 05/10

FATO COMPROVADO: loja QA e login servidos pelo GitHub Pages; nenhuma fixture criada/alterada/apagada; nenhum envio de contato; nenhum probe de flood/XFF; nenhum Gemini real chamado.
Run Pages observado [37026680829](https://github.com/VideDigital/vide-digital/actions/runs/37026680829) concluiu success no SHA `ec7cbd0822dc6a3be731092f2363ab332e30b334`.
Isso comprova aquele deploy, não o inventário completo de todos os recursos vivos.
NÃO FOI POSSÍVEL COMPROVAR: revisão viva atual de cada Function/Rules, maxInstances, créditos Gemini, App Check externo, correspondência integral da produção com a main e smoke final autenticado.

O checkout local preexistente `vide-digital-pr60` estava limpo na branch `fix/qg-profiles-view-readiness`, HEAD `aaeabacce25204493e6313c160825997b1948704`. Não foi usado como main nem alterado.
A auditoria leu o SHA exato pelo conector GitHub. Arquivos em sources foram apenas consultados.

## Plano histórico — quatro etapas e execução posterior delimitada

1. Autorizar e publicar somente createPublicLead pelo canal 075, após QG exato verde e inventário prévio.
2. Corrigir AI-01/AI-02 juntos numa PR pequena, com testes negativos/concorrência e QG; merge depende de autorização própria. A fase 3 desta missão é read-only.
3. Autorizar o deploy correspondente das Functions explicitamente afetadas, depois do QG da main; nenhuma publicação genérica ou de WhatsApp.
4. Smoke final no tenant QA: login/painel → loja/LP → um lead → CRM/pedidos, resposta real da IA, revisão/SHA por recurso, limpeza e observabilidade.

Execução posterior: correção na 077, lead publicado na 079, IA final publicada após 087, aceitações privadas/públicas em 089/093 e lead revalidado em 094. A lista acima é registro histórico, não autorização ou fila de deploys.
Condição histórica: não encerrar com aqueles B1 ou sem deploy/smoke. Correções, publicações e aceitações posteriores constam na seção inicial; revisão e merge documental permanecem pendentes.
