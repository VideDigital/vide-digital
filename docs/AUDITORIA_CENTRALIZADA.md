# Auditoria Centralizada V1

Trilha de auditoria server-side, por tenant, cobrindo as escritas administrativas
reais do Vide Hub. Substitui a ambição original do callable `auditWrite`
(descontinuado nesta missão) por Firestore triggers (Cloud Functions v2 com Auth
Context) que observam as coleções certas e derivam autoria/tenant do próprio
evento — nunca de um payload que o cliente poderia forjar.

**Fase A**: código, triggers, Rules, índices, UI e testes. **Estado atual em
produção**: Rules/índices e os 15 triggers foram publicados com sucesso,
conforme confirmação operacional do usuário após IAM manual. Em **17/08/2026**,
um evento real de Produto e um evento real de Pedido apareceram na Central e o
drawer foi usado para inspecionar o snapshot sanitizado. A Auditoria
Centralizada V1 continua **PARCIAL**: essa evidência não confirma, sozinha,
ator/tenant, ausência de PII nem negação cross-tenant — ver `PUBLICAÇÃO` no fim
deste documento.

## Evidência por ambiente (17/08/2026)

- **VALIDADO EM PRODUÇÃO**: evento de alteração de Produto visível; evento de
  Pedido visível; drawer funcional; o evento de Pedido mostrou fielmente o
  documento legado mudando de `status: "pago"` para `status: "confirmado"`.
- **VALIDADO EM EMULADOR**: contrato canônico de Pedido/Pagamento, escrita
  atômica Pedido → Lead, dois eventos sem loop, ator/tenant do owner, UI do
  drawer, filtros, exportação, autorização e responsividade. Os resultados
  exatos desta rodada constam na seção `Testes`.
- **VALIDADO POR TESTE UNITÁRIO**: classificação das alterações de Pedido,
  Pagamento, Lead e Produto; sanitização; diff amigável; labels; filtros; e
  neutralização de fórmulas no CSV.
- **NÃO VALIDADO EM PRODUÇÃO**: as correções locais descritas neste documento,
  a leitura negativa por um segundo tenant e a conferência explícita de
  ator/tenant/PII nos dois eventos reais. Nada nesta rodada foi publicado.

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
   `statusPedido`, `statusPagamento`, `tipoRecebimento`, `subtotal`, `desconto`, `frete`,
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

## Contrato real de status: Pedido, Pagamento e Lead

Os três conceitos são independentes. O campo legado `pedidos.status` misturava
etapa operacional e pagamento e continua sendo gravado somente para manter
dashboards antigos compatíveis; a Central de Pedidos usa os campos canônicos.

| Conceito | Campo canônico | Valores | Compatibilidade |
|---|---|---|---|
| Etapa do Pedido | `pedidos.statusPedido` | `novo`, `confirmado`, `em_producao`, `pronto`, `enviado`, `entregue`, `cancelado` | documento antigo cai em `pedidos.status`; `pago` legado é interpretado como entregue apenas nesse fallback |
| Pagamento | `pedidos.statusPagamento` | `pendente`, `parcial`, `pago`, `reembolsado` | aceita leitura de `pagamentoStatus` antigo e, por último, infere de `pedidos.status` |
| Campo legado do Pedido | `pedidos.status` | `aguardando`, `confirmado`, `pago`, `cancelado` | obrigatório pelas Rules e por relatórios antigos; não é mais fonte canônica da tela V1 |
| Etapa do Lead | `leads.statusLead` (espelhada também em `status` e `pipelineStage`) | `novo`, `em_contato`, `qualificado`, `proposta`, `convertido`, `perdido` | aliases legados são normalizados pelo CRM |
| Pedido no Lead | `leads.pedidoStatus` e `pedidoSnapshot.statusPedido` | mesmos valores da etapa do Pedido | atualizado junto do Pedido quando existe vínculo |
| Pagamento no Lead | `leads.pagamentoStatus` e `pedidoSnapshot.statusPagamento` | mesmos valores de Pagamento | atualizado junto do Pedido quando existe vínculo |

No detalhe e no modal de criação, a UI mostra controles explicitamente
separados: **Status do pedido** e **Status do pagamento**. Ao salvar, o motor
grava os dois campos canônicos e deriva o legado: cancelado prevalece; depois,
pagamento pago vira `status: "pago"`; pedido novo vira `"aguardando"`; as demais
etapas viram `"confirmado"`.

### Caso observado `pago → pendente`

Classificação: **A + C**. A UI alterou o controle de pagamento de `pago` para
`pendente` (**C**), mas o documento antigo tinha somente `status: "pago"`.
Ao salvar os dois conceitos, a compatibilidade derivou `status:
"confirmado"`; portanto o snapshot `pago → confirmado` registrado pelo trigger
era o que realmente foi persistido (**A**). Não há evidência de snapshot
incorreto (**não B**) nem Function reescrevendo o pedido (**não D**). Para
documentos novos/atualizados, `statusPedido`/`statusPagamento` eliminam a perda
semântica e permitem classificar pagamento como `pedido.pagamento_alterado`.

### Fluxo Pedido → Lead

`orders-engine-v1.js` trata a alteração e executa um único `writeBatch`:

1. grava `pedidos/{pedidoId}` com etapa, pagamento, legado e histórico;
2. se houver `leadId`, grava `leads/{leadId}` com `pedidoStatus`,
   `pagamentoStatus`, `pedidoSnapshot`, `pedidoHistorico` e timestamps;
3. ajusta a etapa do Lead somente quando a etapa do Pedido exige isso (por
   exemplo, entregue → convertido; cancelado → perdido);
4. confirma o batch de modo atômico.

Não foi encontrado fluxo inverso Lead → Pedido nem Cloud Function que regrave
esses documentos. Cada documento escrito dispara seu próprio trigger: por isso
um evento de Pedido e um de Lead são esperados, sem loop. O custo intencional é
de duas escritas de domínio, duas invocações de trigger e duas escritas de
auditoria para uma alteração vinculada.

**Dependência de publicação**: enquanto esta correção estiver apenas local, o
frontend que envia `statusPedido`/`statusPagamento` não deve ser publicado
sozinho; as Rules opcionais correspondentes precisam ser publicadas na mesma
janela controlada. Esta rodada não fez deploy nem migração.

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
- **Lacuna documentada**: `createAdminMember` e `syncAdminClaims` não informam
  `risk`, portanto hoje recebem o fallback `medium` do helper. A trilha existe
  e preserva ator/tenant, mas a classificação dessas duas ações de identidade
  administrativa deve ser revisada em uma mudança própria antes de tratá-las
  como cobertura sensível concluída; esta rodada não reclassificou Functions
  administrativas sem um contrato/teste dedicado.
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
`ownerUid` não vaza outro tenant) — **242/242** Firestore + **5/5** Storage.

## Índices (`firestore.indexes.json`)

A consulta atual da Central usa somente `ownerUid + createdAt`. Os índices
históricos `ownerUid + module/risk/operation/actorUid + createdAt` continuam
preservados no repositório, mas a UI não depende mais deles: módulo, operação,
risco, origem, ator, entidade, ação e busca são combinados localmente sobre a
janela já carregada. Assim é possível combinar colunas sem criar uma matriz de
índices compostos de 4+ campos e sem alterar Rules ou schema.

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
- **Filtros**: período (hoje/7/30/90/personalizado) aplicado no servidor e
  filtros combináveis de módulo, operação, risco, origem, ator, entidade e
  ação. A busca livre e todos os filtros de coluna são locais sobre os eventos
  carregados (50 por página), fato explicado ao lado dos controles. Alterar um
  filtro preserva os demais; chips e contador mostram o estado ativo; "Limpar
  filtros" restaura a janela padrão de 7 dias. Os módulos reais `whatsapp` e
  `admin` também aparecem com rótulos próprios.
- **Listagem**: tabela no desktop, cards no mobile (`<767px`), sem listener
  permanente — `getDocs()` com `limit(50)` + `startAfter()`, botão "Ver mais".
- **Drawer**: ação/entidade/campos com rótulos de negócio e os identificadores
  técnicos preservados, summary, badges de operação/risco, IDs completos e
  copiáveis do evento/ator/entidade, horário, módulo e origem. A seção
  **Alterações** deriva somente dos snapshots já sanitizados e destaca antes →
  depois, com suporte a string, número, boolean, `null`, arrays e objetos. Os
  JSONs técnicos permanecem abaixo em `<details>`; quando a sanitização não
  deixa valores comparáveis, a UI informa isso e não inventa dado. O drawer é
  modal, fecha com Escape, prende o foco e devolve-o ao item que o abriu. Link "Abrir em
  Pedidos/CRM 360/Atendimento/Produtos" quando a entidade ainda existe
  (checado com um `getDoc()`); "Entidade não está mais disponível." quando
  não. **Limitação honesta**: o link troca de VIEW, não faz deep-link pro item
  específico — os controllers de destino (`pedidos-estruturados.js`,
  `crm360.js`, `atendimento.js`) não expõem hoje um "abrir por ID" uniforme, e
  criar esse contrato pros quatro seria um escopo maior que esta missão.
- **Exportação**: CSV/JSON, owner-only, máximo 1000 eventos consultados. A mesma
  função de filtros locais da tela é aplicada antes de gerar o arquivo; as
  colunas têm nomes legíveis e nunca incluem `before`/`after` ou PII. O nome do
  arquivo inclui a data. O CSV neutraliza células iniciadas (inclusive após
  espaços) por `=`, `+`, `-` ou `@` com apóstrofo; o JSON mantém o conteúdo
  original.
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
- `tests/functions/audit-triggers.test.mjs` — 21 testes exercendo
  `computarEventoAuditoria()` com as configs REAIS das 15 coleções (mesma
  instância publicada), sem precisar do Functions Emulator: owner altera
  pedido → ator/tenant corretos; PII nunca aparece mesmo se presente no
  documento bruto; delete usa `before`; timestamp-only é ignorado; retry com o
  mesmo `event.id` não duplica; `system` actor classificado corretamente;
  chats resolve tenant por `emailDono` quando `donoUID` falta; mudança de
  tenant vira `critical`; produto sem `criadoPor` não gera evento.
- `tests/audit-core-v1.test.mjs` — 27 testes das funções puras de UI
  (rótulos inclusive WhatsApp/Admin/origem, formatação de data/UID, busca,
  filtros combináveis, estado ativo/limpeza, exportação CSV/JSON filtrável com
  limite de 1000, KPIs e comparação de dia).
- `tests/emulator/firestore-security.test.mjs` — 9 testes novos de Rules
  (owner, outro tenant, editor, leitor, videAdmin, create/update/delete
  negados sempre, consulta não vaza tenant). **242/242** Firestore + **5/5**
  Storage.
- `tests/emulator/ui/auditoria.flow.mjs` — fluxo real (Playwright + Auth,
  Firestore e Functions Emulators): owner vê apenas os próprios eventos; o
  drawer preserva ação/campos técnicos, mostra rótulos e diff amigáveis, fecha
  por Escape, retém/devolve foco e nunca exibe a PII sanitizada; funcionário
  permanece bloqueado. Passou localmente, inclusive em 320, 375, 390, 768,
  1024, 1366 e 1920 px, sem overflow horizontal global.
- `tests/emulator/ui/pedidos.flow.mjs` — pedido legado `pago` alterado pelo
  controle de pagamento para `pendente`; persiste `statusPedido` e
  `statusPagamento`, sincroniza o Lead no mesmo batch e gera exatamente um
  evento de Pedido e um de Lead, sem loop. Também valida controles separados e
  persistência da etapa operacional após reload. Passou localmente.

## Quality Gate

Verdes localmente nesta rodada: `pnpm run check`, `pnpm run test:unit`,
`pnpm run test:audit-core-v1` (**27/27**),
`pnpm run test:catalogo-produtos` (**20/20**),
`pnpm run test:security` (Firestore **242/242**, Storage **5/5** e Functions
**251/251**), `pnpm run test:frontend:emulator`, os fluxos Playwright de
Pedidos e Auditoria, `pnpm run test:ui:produtos` e
`pnpm run test:ui:responsive` (5 telas × 5 viewports). O emulador local usou o
Node 24 disponível no host e avisou que o runtime declarado das Functions é
Node 22; isso não causou falha, mas o CI/runtime oficial continua sendo a
referência de compatibilidade com Node 22.

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

Em 17/08/2026 foram concluídos os três primeiros passos: um Pedido e um Produto
reais foram alterados e seus eventos foram abertos na Central pelo dono. O caso
do Pedido confirmou o snapshot legado descrito na seção de contrato.

Ainda falta a validação manual real em produção de:

1. confirmar explicitamente ator, tenant e ausência de PII nos dois eventos;
2. confirmar que outro tenant (outra loja de teste) não vê esses eventos;
3. validar, depois de uma publicação autorizada, os campos canônicos de status
   e a apresentação amigável implementados apenas localmente nesta rodada;
4. só então marcar "Auditoria centralizada pós-Functions" como CONCLUÍDO no
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
