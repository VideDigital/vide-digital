# Auditoria Centralizada V1

Trilha de auditoria server-side, por tenant, cobrindo as escritas administrativas
reais do Vide Hub. Substitui a ambição original do callable `auditWrite`
(descontinuado nesta missão) por Firestore triggers (Cloud Functions v2 com Auth
Context) que observam as coleções certas e derivam autoria/tenant do próprio
evento — nunca de um payload que o cliente poderia forjar.

**Fase A**: código, triggers, Rules, índices, UI e testes. **Estado atual em
produção**: Rules/índices e os 15 triggers foram publicados com sucesso,
conforme confirmação operacional do usuário após IAM manual. A Auditoria
Centralizada V1 continua **PARCIAL** porque ainda falta o teste manual real em
produção — ver `PUBLICAÇÃO` no fim deste documento.

## Arquitetura

Três camadas, como pedido:

| Camada | Arquivo | Papel |
|---|---|---|
| A. Audit Core | `functions/src/audit/core.js` | Funções puras: diff, sanitização (allowlist + blocklist recursivo de PII), resolução de tenant, eventId determinístico, defaults de ação/risco/resumo, montagem/validação do documento final. Sem Firestore, sem I/O — testável isoladamente. |
| B. Firestore Triggers | `functions/src/audit/triggers.js` | `createAuditTrigger()` (factory) + 15 triggers (`onDocumentWrittenWithAuthContext`, região `southamerica-east1`, `minInstances: 0`, `maxInstances: 10`). `computarEventoAuditoria()` isola toda a decisão (tenant/ruído/ator/sanitização/classificação) do efeito colateral (a escrita em si), o que permite testar as 15 configurações reais sem o Functions Emulator. |
| C. Central de Auditoria | `audit-core-v1.js` (funções puras de UI), `audit-center-v1.js` (controller da view, padrão `criarAuditCenterController` igual a `central-ia.js`/`crm360.js`), `audit-center-v1.css` | View `#view-auditoria` no dashboard — owner-only, consulta paginada sem listener permanente, filtros, drawer, exportação. |

## Coleções auditadas e por quê

Confirmado por grep real em `dashboard-app.js`, `loja.html`, `crm360.js`,
`atendimento.js`, `growth-tracking-v1.js`, `base-conhecimento-ia.js`,
`central-ia.js` e `functions/src/*` antes de implementar — nenhum nome de campo
foi assumido sem checar o código real primeiro.

| Trigger | Documento | Tenant | Módulo/entidade |
|---|---|---|---|
| `auditUsuariosWrite` | `usuarios/{uid}` | id do doc | `loja` — cobre conta (status/plano) **e** configuração privada da loja no mesmo trigger (é o mesmo documento; dois triggers no mesmo caminho geraria dois eventos por escrita) |
| `auditFuncionariosWrite` | `funcionarios/{uid}` | `donoUID` | `funcionarios` |
| `auditPedidosWrite` | `pedidos/{id}` | `criadoPor` | `pedidos` |
| `auditProdutosWrite` | `produtos/{id}` | `criadoPor` | `produtos` |
| `auditClientesWrite` | `clientes/{id}` | `tenantId` | `crm` — só o documento raiz; `clientes/{id}/eventos` e `/observacoes` são a timeline própria do CRM 360, preservada, nunca espelhada aqui |
| `auditLeadsWrite` | `leads/{id}` | `criadoPor` | `leads` |
| `auditChatsWrite` | `chats/{chatId}` | `donoUID` ou `emailDono` (legado guarda o mesmo uid nos dois campos) | `atendimento` — só o documento pai; `mensagens`/`eventos` nunca são auditados aqui |
| `auditTemplatesWrite` | `templates/{id}` | `criadoPor` | `templates` |
| `auditVitrinesWrite` | `vitrines_publicas/{slug}` | `donoUID` | `vitrine` |
| `auditLandingPagesWrite` | `landing_pages/{id}` | `donoUID` | `landing-pages` (privadas) |
| `auditLandingPagesPublicasWrite` | `landing_pages_publicas/{id}` | `donoUID` | `landing-pages` (espelho público) |
| `auditIaConfigWrite` | `configuracoes_ia/{storeUid}` | id do doc | `ia` (configuração da assistente) |
| `auditKnowledgeWrite` | `base_conhecimento_ia/{id}` | `tenantId` | `base-conhecimento-ia` |
| `auditTrackingConfigsWrite` | `tracking_configs/{ownerUid}` | id do doc | `tracking` |
| `auditTrackingLinksWrite` | `tracking_links/{id}` | `criadoPor` | `tracking` |

**Por que 15 triggers e não os 13 "por exemplo" do pedido**: a lista de exports do
pedido original era ilustrativa ("por exemplo") e não incluía `landing pages
privadas/públicas` nem `configuração/base da IA` como exports distintos, mas a
seção "COLEÇÕES AUDITADAS" pede as duas coisas — e são 4 coleções Firestore
fisicamente diferentes (`landing_pages`, `landing_pages_publicas`,
`configuracoes_ia`, `base_conhecimento_ia`), cada uma só pode ter seu próprio
trigger (`onDocumentWrittenWithAuthContext` observa UM caminho por chamada).
Também foi descartado o `auditStoreSettingsWrite` do exemplo: ele apontaria pro
MESMO caminho de `auditUsuariosWrite` (`usuarios/{uid}`), o que geraria dois
eventos pra cada escrita nesse documento — unificado num só trigger com
classificação que diferencia conta vs. configuração pelos `changedFields`.

**Explicitamente NÃO auditado** (alta frequência, conteúdo de conversa, ou
histórico de domínio já existente): `chats/{id}/mensagens`, `chats/{id}/eventos`,
`clientes/{id}/eventos`, `clientes/{id}/observacoes`, `metricas_*`, contadores,
`notificacoes` (nem leitura nem qualquer escrita), sessões, prompts/respostas de
IA, uploads. `pedidoHistorico`, a timeline do CRM e os eventos do Atendimento
continuam existindo exatamente como estavam — a Auditoria Centralizada é uma
trilha administrativa adicional, não substitui esses históricos de domínio.

## Ator (Auth Context)

`event.authType`/`event.authId` do CloudEvent (Firestore Auth Context, disponível
desde `firebase-functions@6.1.0` — confirmado instalado `6.6.0`, sem upgrade
necessário) normalizados em `core.deriveActor()`:

- `authType === "system"` → `actorType: "system"` (escrita feita por uma Cloud
  Function via Admin SDK — ex.: `askBusinessAI` gravando algo, ou uma das
  Functions legadas em `admin/`/`employees/`).
- `authType === "unauthenticated"` → `actorType: "unauthenticated"` (visitante
  público, ex.: lead capturado direto de `loja.html`).
- `authId` presente (mesmo com `authType` técnico não classificado pelo
  Firestore) → `actorType: "user"`, `actorUid: authId` — é o caso comum de
  dono/funcionário escrevendo pelo SDK cliente.
- Nenhum dos anteriores → `actorType: "unknown"`.

Nunca se grava e-mail do ator — só o UID. A UI resolve nome atual por UID usando
dados já autorizados (o dono lendo sua própria loja já tem acesso a
`funcionarios`/perfil, então não precisa de leitura nova).

## Tenant

Nunca aceito do frontend. Resolução por operação em `core.resolveTenant()`:

- **CREATE**: usa o `after`.
- **UPDATE**: usa o `before`; se o `after` tiver um valor DIFERENTE no mesmo
  campo (o que as Rules deveriam impedir, já que esses campos são imutáveis em
  todo módulo — `criadoPorUnchanged()`/`donoUIDUnchanged()` etc.), o evento é
  gravado mesmo assim (usando o tenant do `before`, o dono real do documento),
  mas com `risk: "critical"` e `action: "<module>.tenant_alterado_suspeito"` —
  a mudança de tenant é o cenário mais grave que este sistema detecta sozinho.
- **DELETE**: usa o `before`.
- **`__docId__`**: pra coleções onde o próprio ID do documento é o tenant
  (`usuarios`, `configuracoes_ia`, `tracking_configs`).
- Sem resolução segura (`ownerUid` vazio) → o evento **nunca é gravado**, em
  nenhuma operação.

## Schema

```
auditoria/{eventId}

{
  schemaVersion: 1,
  eventId: string,
  ownerUid: string,
  actorUid: string | null,
  actorType: "user" | "system" | "unauthenticated" | "unknown",
  module: string,
  entityType: string,
  entityId: string,
  operation: "create" | "update" | "delete" | "action",
  action: string,           // ex.: "pedido.status_alterado"
  risk: "low" | "medium" | "high" | "critical",
  summary: string,
  changedFields: string[],
  before: object,           // sanitizado (allowlist + blocklist)
  after: object,            // sanitizado (allowlist + blocklist)
  source: "firestore-trigger" | "function" | "ai-function" | "admin-function" | "public-function" | "system",
  ok: boolean,
  createdAt: Timestamp      // FieldValue.serverTimestamp()
}
```

`operation: "action"` é reservado pro helper interno `writeAudit()` — ações que
não são uma mutation observável (ver seção seguinte).

## Sanitização / PII

Duas camadas, sempre as duas:

1. **Allowlist por coleção** (`allowedFields` de cada trigger) — só os campos
   listados sobrevivem no `before`/`after`. Ex.: pedidos mantém `status`,
   `statusPagamento`, `tipoRecebimento`, `subtotal`, `desconto`, `frete`,
   `total`/`valor`, `prazoEntrega` — nunca `cliente`, `clienteWhatsapp`,
   `clienteEmail`, `endereco`, `cep`, `observacoesCliente`. Clientes/leads
   mantêm `statusRelacionamento`/`statusLead`, `responsavelUid`/
   `funcionarioResponsavel`, `tags`/`etiqueta`, `origem` — nunca nome, telefone,
   e-mail ou texto de formulário. Chats mantêm `status`, `atribuidoPara`,
   `setor`, `canal` — nunca `clienteNome` nem `ultimaMensagem`. IA/Base de
   Conhecimento mantêm `ativo`/`status`/`tipo`/`categoria`/`produtoIds` — nunca
   `titulo`, `conteudo`, prompt ou resposta.
2. **Blocklist recursiva** (`core.PII_BLOCKLIST`, aplicada em
   `sanitizeValue()`) — mesmo que um campo sensível um dia entre no allowlist
   por engano, `email`/`telefone`/`whatsapp`/`cpf`/`cnpj`/`endereco`/`cep`/
   `senha`/`token`/`secret`/`apiKey`/`mensagem`/`texto`/`conteudo`/`prompt`/
   `response`/`observacoes`/`notes` (e variações) nunca saem com o valor
   original — são simplesmente omitidos.

Limites adicionais: profundidade máxima 3, até 40 campos por nível, strings
truncadas em 200 caracteres, arrays truncados em 20 itens — nunca o documento
bruto inteiro.

**Limitação honesta**: os IDs de pixel salvos em `tracking_configs`/
`vitrines_publicas.tracking` aparecem por inteiro no evento sanitizado (não são
mascarados como "só os últimos 4 dígitos" sugerido no pedido) — são a
configuração do próprio dono, visível só pra ele/admin (nunca PII de cliente),
e mascarar exigiria uma terceira camada de transformação por campo que não
coube no tempo desta entrega. Não é um vazamento de dado de terceiro, só uma
polidez que ficou de fora do V1.

## Ação e risco

Cada trigger tem seu próprio `classify({operation, before, after, changedFields,
entityId})`, retornando `{action, risk, summary?}`. Exemplos reais implementados:
`pedido.status_alterado` (medium), `pedido.pagamento_alterado` (high),
`pedido.valores_alterados` (high), `funcionario.permissoes_alteradas` (high),
`funcionario.desativado` (high), `loja.plano_alterado` (critical),
`loja.status_alterado` (critical), `produto.preco_alterado` (medium),
`cliente.etapa_alterada` (medium), `chat.atribuicao_alterada` (medium),
`tracking.pixel_alterado` (high), `tracking.campanha_criada` (low),
`ia.configuracao_alterada` (high quando mexe em `canais`/`ativo`, medium caso
contrário). Sem classificação específica, cai no default por operação
(`create` → low, `update` → medium, `delete` → high) — nunca fica sem
`action`/`risk`. Mudança de tenant sempre vence e vira `critical`.

## Ruído ignorado

`core.NOISE_FIELDS` (`atualizadoEm`, `updatedAt`, `lastSeen`,
`ultimaAtividade`, `*AtualizadoPor`, `*AtualizadoEm`, contadores/métricas
derivados, `porDia`, `ultimaMensagem`, etc.) nunca contam como "campo
alterado". Um `update` cujo único diff é ruído não gera evento nenhum
(`core.shouldSkipEvent`). Se houver uma mudança real JUNTO com ruído, só os
campos relevantes entram em `changedFields`.

## Idempotência

`eventId = core.safeEventId(event.id)` — o `event.id` do CloudEvent, que o
Eventarc reentrega igual numa retry. `set()` determinístico em
`auditoria/{eventId}`, nunca `add()`. A mesma escrita reprocessada sobrescreve o
mesmo documento em vez de duplicar. Nenhum trigger observa a própria coleção
`auditoria` (sem risco de loop).

## `writeAudit()` e o callable `auditWrite`

Auditados todos os usos de `writeAudit`/`auditWrite`/`VideFunctions.auditWrite`
antes de decidir o contrato final:

- O callable público `auditWrite` (`functions/src/audit/index.js`) **foi
  removido** de `functions/src/index.js` e de `core/vide-functions.js`. Ele
  aceitava `ownerUid` do payload do cliente — nunca poderia ser fonte de
  verdade — e não havia nenhum consumidor de produção (nenhuma página chamava
  `VideFunctions.auditWrite`).
- `writeAudit()` **continua existindo**, só como helper interno server-side,
  agora emitindo o schema novo (`schemaVersion: 1`, `operation: "action"`,
  `eventId` gerado localmente via `db.collection("auditoria").doc().id`, sem
  depender de um CloudEvent). Usado só onde não há mutation observável numa
  coleção auditada: `createAdminMember`/`syncAdminClaims` (gravam em
  `equipe_admin`, fora da lista auditada, ou só mexem em custom claims) e
  `resetEmployeePassword` (não toca Firestore, só gera um link do Auth).
- Removido de todo lugar onde a mutation JÁ é coberta por um trigger — evita
  evento duplicado pra mesma escrita: `adminUpdateStoreStatus`/
  `adminUpdatePlan` (usuarios/{uid}), `createEmployee`/`updateEmployee`/
  `disableEmployee`/`enableEmployee` (funcionarios/{uid}), `createPublicLead`
  (leads/{id}), `sendAdminChatMessage` (chats/{id}, coberto pela atualização de
  `statusAdmin` no documento pai).
- `markNotificationRead` **parou de chamar `writeAudit()`** — notificações de
  leitura estão na lista explícita de "não auditar" da missão; não geram
  evento nem pelo trigger (a coleção `notificacoes` não tem trigger) nem pelo
  helper.

## Regras (`firestore.rules`)

```
match /auditoria/{eventId} {
  allow read: if isBackendAdmin()
    || (signedIn() && resource.data.ownerUid == request.auth.uid);
  allow create, update, delete: if false;
}
```

Owner lê o próprio tenant (comparação direta de UID — funcionário nunca tem o
mesmo `auth.uid` do dono, então a condição falha estruturalmente pra ele, sem
depender só da UI escondida). VideAdmin lê tudo. Ninguém (nem o dono) cria,
atualiza ou apaga pelo cliente — toda escrita nasce de um trigger ou do helper
interno, ambos via Admin SDK, que ignora Rules. Testado em
`tests/emulator/firestore-security.test.mjs` (9 casos novos: owner próprio
tenant, owner outro tenant, editor negado, leitor negado, videAdmin,
create/update/delete sempre negados mesmo pro dono e pro admin, consulta por
`ownerUid` não vaza outro tenant) — **219/219** Firestore + **5/5** Storage.

## Índices (`firestore.indexes.json`)

Só o necessário pras consultas reais da Central: `ownerUid + createdAt`,
`ownerUid + module + createdAt`, `ownerUid + risk + createdAt`,
`ownerUid + operation + createdAt`, `ownerUid + actorUid + createdAt`. A UI
nunca combina dois filtros categóricos ao mesmo tempo (módulo E risco juntos,
por exemplo) — só um por vez, junto com o período — exatamente pra não precisar
de índices compostos de 4+ campos.

## Central de Auditoria (UI)

- **Entrada**: grupo "Sistema" na sidebar, item "Auditoria" — `data-target=
  "view-auditoria"`, `data-module-permission="auditoria"` (esconde o botão)
  e `PERMISSOES_NAV["view-auditoria"] = "auditoria"` em `dashboard-app.js`
  (bloqueia `ativarAba()` de verdade, mesmo se alguém acionar a troca de
  view por outro caminho). "auditoria" nunca aparece na lista de permissões
  concedíveis a funcionário (`MODULOS_PERMISSAO`), então nenhum funcionário
  consegue ganhar acesso pela UI de gestão de equipe; mesmo que ganhasse, as
  Rules bloqueiam a leitura de qualquer jeito — três camadas independentes.
- **Hero**: "Auditoria & Segurança", badges "Registro server-side" / "Somente
  leitura" / "Dados sensíveis protegidos".
- **KPIs**: eventos hoje, ações de alto risco, atores ativos, módulos alterados
  — calculados sobre uma consulta própria de "hoje" (limit 200), não sobre a
  paginação principal. É uma aproximação honesta, não uma agregação de
  servidor — documentado no próprio `calcularKpis()`.
- **Filtros**: período (hoje/7/30/90/personalizado), UM campo categórico por
  vez (módulo/operação/risco/ator — ator é UID digitado, os outros são
  `<select>`), busca local por texto (summary/entityId/action/module/
  entityType) sobre a página já carregada.
- **Listagem**: tabela no desktop, cards no mobile (`<767px`), sem listener
  permanente — `getDocs()` com `limit(50)` + `startAfter()`, botão "Ver mais".
- **Drawer**: summary, ator (tipo + UID truncado), horário, módulo, entidade,
  operação, risco, origem, `changedFields`, `before`/`after` sanitizados,
  aviso "Dados sensíveis são omitidos deste registro." Link "Abrir em
  Pedidos/CRM 360/Atendimento/Produtos" quando a entidade ainda existe
  (checado com um `getDoc()`); "Entidade não está mais disponível." quando
  não. **Limitação honesta**: o link troca de VIEW, não faz deep-link pro item
  específico — os controllers de destino (`pedidos-estruturados.js`,
  `crm360.js`, `atendimento.js`) não expõem hoje um "abrir por ID" uniforme, e
  criar esse contrato pros quatro seria um escopo maior que esta missão.
- **Exportação**: CSV/JSON, owner-only, máximo 1000 eventos, dados já
  sanitizados, nome do arquivo inclui a data.
- Nunca usa `innerHTML` com dado do evento sem escapar (`escaparHtml()` em
  todo texto interpolado).

## Consistência (assíncrono, nunca atômico)

A UI mostra: "Os eventos podem levar alguns segundos para aparecer depois de
uma alteração." Nunca afirma atomicidade. Tentativas negadas pelas Rules,
leituras e cliques sem alteração real nunca geram evento (só mutations que
efetivamente aconteceram no Firestore disparam o trigger).

## Testes

- `tests/functions/audit-core.test.mjs` — 34 testes unitários do Audit Core:
  `detectOperation`, diff/ruído, `shouldSkipEvent`, sanitização/PII (allowlist
  + blocklist + limites), `deriveActor` (user/system/unauthenticated/unknown),
  `resolveTenant` (create/update/delete, `__docId__`, array de campos,
  mismatch, sem resolução), `safeEventId` (idempotência), defaults, e
  `buildAuditEvent` (schema completo + validação de risk/operation/ownerUid
  obrigatórios).
- `tests/functions/audit-triggers.test.mjs` — 15 testes exercendo
  `computarEventoAuditoria()` com as configs REAIS das 15 coleções (mesma
  instância publicada), sem precisar do Functions Emulator: owner altera
  pedido → ator/tenant corretos; PII nunca aparece mesmo se presente no
  documento bruto; delete usa `before`; timestamp-only é ignorado; retry com o
  mesmo `event.id` não duplica; `system` actor classificado corretamente;
  chats resolve tenant por `emailDono` quando `donoUID` falta; mudança de
  tenant vira `critical`; produto sem `criadoPor` não gera evento.
- `tests/audit-core-v1.test.mjs` — 19 testes das funções puras de UI
  (rótulos, formatação de data/UID, filtro local, exportação CSV/JSON com
  limite de 1000, KPIs, comparação de dia).
- `tests/emulator/firestore-security.test.mjs` — 9 testes novos de Rules
  (owner, outro tenant, editor, leitor, videAdmin, create/update/delete
  negados sempre, consulta não vaza tenant). **219/219** Firestore + **5/5**
  Storage.
- `tests/emulator/ui/auditoria.flow.mjs` — fluxo real (Playwright + Auth
  Emulator + Functions Emulator): owner altera um produto de verdade via
  Admin SDK (simulando o cliente), o trigger real dispara, a UI busca e
  mostra o evento, sem PII visível, drawer com o aviso de dados omitidos,
  filtro por módulo, responsivo em mobile (390px, cards substituem a
  tabela), e funcionário editor (com todas as outras permissões) não vê nem
  acessa a Auditoria. Não pôde ser reexecutado neste sandbox (proxy bloqueia
  o CDN do Firebase no navegador — limitação de rede já documentada em
  `docs/QUALITY_GATE_RELEASE.md`), mas o Functions Emulator LOCAL foi
  confirmado carregando e executando os 15 triggers reais sem erro durante
  `pnpm run test:frontend:emulator` — validação final via Quality Gate do CI.

## Quality Gate

`pnpm run check`, `test:unit` (inclui `test:audit-core-v1`), `test:functions`
(inclui os dois arquivos novos de `tests/functions/`), `test:rules`,
`test:frontend:emulator` — todos verdes localmente antes deste commit. O job
"UI com login real" do Quality Gate (`.github/workflows/quality-gate.yml`)
passa a rodar `auditoria.flow.mjs` também, dentro de `test:ui:flows`.

## Deploy separado

`.github/workflows/firebase-deploy-audit.yml` — "Deploy Firebase Functions —
Auditoria". `workflow_dispatch` manual, só a partir de `main`, projeto fixo
`vide-digital-saas`, confirmação exata `DEPLOY_AUDIT`, roda `check`/
`test:functions`/`test:unit`/`test:rules`/`test:frontend:emulator` antes de
publicar, `--only` com a lista explícita dos 15 nomes de trigger (nunca
`--only functions` sozinho), mesmo detector de autenticação (WIF ou
`FIREBASE_SERVICE_ACCOUNT`) dos outros workflows — nenhum secret novo. Nunca
toca `askBusinessAI`/`askPublicBusinessAI` nem qualquer Function legada de
`admin`/`employees`/`public`.

## Publicação e validação final

Deploy Firebase Spark (Rules + índices) e Deploy Firebase Functions — Auditoria
(os 15 triggers) foram concluídos com sucesso, conforme confirmação operacional
do usuário. Não inventamos run ID aqui porque este documento não registra um
identificador confiável do run de deploy.

Ainda falta a validação manual real em produção:

1. Alterar um pedido de teste em produção.
2. Alterar um produto de teste em produção.
3. Abrir a Central de Auditoria como o dono real.
4. Confirmar ator, tenant e ausência de PII nos dois eventos.
5. Confirmar que outro tenant (outra loja de teste) não vê esses eventos.
6. Só então marcar "Auditoria centralizada pós-Functions" como CONCLUÍDO no
   Roadmap — não antes, e sem criar logs retroativos falsos: os registros
   começam a partir da ativação real dos triggers em produção, nunca de
   escritas anteriores a esse momento.

## Rollback

Reverter o commit no Git **não remove** Functions já publicadas em produção —
elas continuam rodando até serem explicitamente excluídas:

```
firebase functions:delete \
  auditUsuariosWrite auditFuncionariosWrite auditPedidosWrite \
  auditProdutosWrite auditClientesWrite auditLeadsWrite auditChatsWrite \
  auditTemplatesWrite auditVitrinesWrite auditLandingPagesWrite \
  auditLandingPagesPublicasWrite auditIaConfigWrite auditKnowledgeWrite \
  auditTrackingConfigsWrite auditTrackingLinksWrite \
  --region southamerica-east1 --project vide-digital-saas
```

Exclui SÓ os triggers de auditoria. Nunca exclui `askBusinessAI`/
`askPublicBusinessAI` nem os documentos já existentes em `auditoria/` (o
histórico gravado continua legível pelo dono/admin mesmo depois do rollback —
só param de nascer eventos novos). Nunca abre escrita cliente na coleção
`auditoria` como alternativa — se os triggers saírem do ar, a Central
simplesmente para de mostrar eventos novos até serem republicados.
