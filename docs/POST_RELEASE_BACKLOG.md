# Sprint final de produção — backlog e evidências

Data: 2026-10-05. Base auditada: `0ebc271448960105a4004367901fbc2d39602d3b`.
Branch deste documento: `docs/final-production-sprint-audit`.
Escopo: diagnóstico e documentação. Nenhuma correção de aplicação, infraestrutura ou deploy.

## Decisão de release

**Ainda não recomendar release final:** dois B1 foram reproduzidos localmente no código da IA pública. Eles não são B2/B3 e não devem ser escondidos no backlog pós-release.
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

Inputs preparados, **não executados**:

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

## B1 — bloqueadores reais no código

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

Correção mínima proposta, não implementada: orçamento público separado ou reserva privada dentro do teto global existente; validação completa do histórico antes do débito; estratégia explícita para falhas/retries sem liberar orçamento ilimitado. Testar concorrência, limite, virada de mês, legado e público esgotado com dono ainda funcional.

### AI-02 — contexto público inclui catálogo privado por status

**FATO COMPROVADO no código e em execução local isolada.**
`carregarProdutosPublicos` consulta produtos por `criadoPor`, sem filtrar status.
`resumirProdutosPublicos` exclui apenas `rascunho`; inclui `arquivado`, status ausente e status desconhecido.
O teste sintético comprovou nome e preço de produto arquivado/sem status no texto do prompt público.
As Rules e seus testes tratam esses produtos como privados e permitem o catálogo público somente em status ativo.

**Impacto:** dados de catálogo não publicados entram no contexto de uma IA acessível ao visitante. O Admin SDK não é restringido pelas Rules.
Não foi demonstrado vazamento cross-tenant nem feita tentativa de extração em produção.
**HIPÓTESE:** Gemini pode reproduzir esses nomes/preços na resposta; a resposta real e os dados de clientes não foram consultados.

Correção mínima proposta, não implementada: query por `criadoPor` e `statusProduto == "ativo"`, mais allowlist defensiva no builder; testes para ativo/rascunho/arquivado/ausente/desconhecido.
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

## Auditoria rápida da IA

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

## Matriz dos fluxos críticos

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
| Rate limit da 075 | Testes unitários, Firestore Emulator e smoke HTTP no QG: bucket por tenant, identidade não forjada, dedupe, corrida de dono, limite e contenção. Deploy pendente. |
| Pedidos | `pedidos.flow.mjs`: status/pagamento, sincronização com lead, auditoria, persistência após reload; quote server-side tem testes próprios. |
| Produtos | `produtos.flow.mjs`: permissões, catálogo/gestão, filtros, listeners e reload; Rules negam catálogo privado. |
| IA principal | Testes de controller/prompt/Rules; resposta do Gemini em produção não comprovada; AI-01/AI-02 bloqueiam conclusão. |
| Reload | Coberto em pedidos, produtos e fluxos LP; inspeção pública complementar não equivale a sessão autenticada. |
| Mobile/desktop | `responsive.smoke.mjs`: cinco viewports; LP leads em 390x844; pedidos/produtos em 1440x900. |
| Vazio, erro/loading | Busca vazia real na loja QA; testes produtos sem resultado, LP com falha e retry, chat com erro/busy/recuperação, controllers IA com estado enviando e erro. Não é matriz exaustiva de todas as telas. |

## Backlog B2 — não implementar agora

| ID | Item | Estado/evidência e critério futuro |
|---|---|---|
| B2-01 | Rate limits restantes da 074 | FATO COMPROVADO em shared/rateLimit e KNOWN_LIMITATIONS: review 5/min, order quote 10/min, IA pública 8/min, chat create 5/min, chat send 20/min, métricas 60/min usam XFF/auth descartável. Migrar por risco com testes Emulator. O impacto mensal da IA é B1 separado. |
| B2-02 | TTL de _rate_limits e dedupes | Campos expiresAt existem; policy viva NÃO FOI POSSÍVEL COMPROVAR. Validar retenção/volume e pedir autorização específica antes de configurar. Incluir lead_dedupes/pedido_quote_dedupes conforme inventário. |
| B2-03 | App Check / Cloud Armor | Proteção de borda pendente; rollout exige cliente compatível e autorização de infraestrutura. Não ligar enforcement de surpresa. |
| B2-04 | Chat público legado | KNOWN_LIMITATIONS registra V2 com Anonymous Auth e legado V1 preservado. Avaliar retirada/migração e autorização das callables antigas sem quebrar legado. Sem nova prova de exploit vivo. |
| B2-05 | Order quote | Preservar preço calculado, isolamento por origem, validade e idempotência; quote não reserva estoque nem processa pagamento. Rate limit/borda/TTL continuam pendentes. |
| B2-06 | Public review | Hardening de abuso, identidade e métricas de moderação; não reintroduzir writer direto. |
| B2-07 | Métricas públicas | Integridade de contagem e abuso; na loja QA, visualizações aparecem como indisponíveis, sem impedir catálogo. Causa viva não isolada. |
| B2-08 | Limites da 075 | 60/min por tenant pode rejeitar captura legítima sob abuso; válvula 600/min é compartilhada por instância, zera em cold start e não limita o conjunto de instâncias. Ajustar por métricas, não suposição de escritas/s. |
| B2-09 | Robustez adicional da IA | Idempotência de tentativa, timeout do provedor, mensagem de 429, limites por plano, observabilidade e custo do alias. Não absorve AI-01/AI-02. |
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
A falha AI-02 é um caminho Admin SDK distinto da leitura direta já corrigida nas Rules.

## Produção e limites da evidência

FATO COMPROVADO: loja QA e login servidos pelo GitHub Pages; nenhuma fixture criada/alterada/apagada; nenhum envio de contato; nenhum probe de flood/XFF; nenhum Gemini real chamado.
Run Pages observado [37026680829](https://github.com/VideDigital/vide-digital/actions/runs/37026680829) concluiu success no SHA `ec7cbd0822dc6a3be731092f2363ab332e30b334`.
Isso comprova aquele deploy, não o inventário completo de todos os recursos vivos.
NÃO FOI POSSÍVEL COMPROVAR: revisão viva atual de cada Function/Rules, maxInstances, créditos Gemini, App Check externo, correspondência integral da produção com a main e smoke final autenticado.

O checkout local preexistente `vide-digital-pr60` estava limpo na branch `fix/qg-profiles-view-readiness`, HEAD `aaeabacce25204493e6313c160825997b1948704`. Não foi usado como main nem alterado.
A auditoria leu o SHA exato pelo conector GitHub. Arquivos em sources foram apenas consultados.

## Plano final — quatro etapas

1. Autorizar e publicar somente createPublicLead pelo canal 075, após QG exato verde e inventário prévio.
2. Corrigir AI-01/AI-02 juntos numa PR pequena, com testes negativos/concorrência e QG; merge depende de autorização própria. A fase 3 desta missão é read-only.
3. Autorizar o deploy correspondente das Functions explicitamente afetadas, depois do QG da main; nenhuma publicação genérica ou de WhatsApp.
4. Smoke final no tenant QA: login/painel → loja/LP → um lead → CRM/pedidos, resposta real da IA, revisão/SHA por recurso, limpeza e observabilidade.

As etapas 1 e 2 podem ser reordenadas para reduzir rodadas; atualizar o SHA do deploy se main mudar.
Não encerrar o produto como pronto enquanto houver os B1 acima ou faltarem as evidências de deploy/smoke.
