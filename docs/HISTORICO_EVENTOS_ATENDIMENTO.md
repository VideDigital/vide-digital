# Histórico de Eventos do Atendimento (RD3)

Cria um histórico completo, imutável e auditável de tudo que acontece dentro de
uma conversa da Central de Atendimento — sem criar uma segunda estrutura de
conversas, sem criar uma segunda timeline de cliente e sem duplicar nada que o
CRM 360 já registra. Evolui `chats/{chatId}` (já existente) com uma nova
subcoleção irmã de `mensagens`.

## Fase 1 — Auditoria: o que muda o estado de um `chat` hoje

Levantamento de toda operação de escrita em `chats/{chatId}` (e nas
subcoleções relacionadas) antes desta etapa:

| Operação | Onde | Gerava rastro antes? |
|---|---|---|
| Criar conversa (widget público) | `loja.html` | Não — só o próprio doc `chats` nascia |
| Cliente manda mensagem | `loja.html` | Não |
| Equipe responde | `atendimento.js` (`enviarResposta`) | Não |
| Falha ao enviar resposta | `atendimento.js` | Não existia sinalização nenhuma |
| Mudar status (aberta/aguardando/resolvida/arquivada/reaberta) | `atendimento.js` (`alterarStatus`) | Não — só `statusAtualizadoPor/Em` sobrescritos |
| Assumir/atribuir/transferir/remover responsável | `atendimento.js` (`atribuirResponsavel`) | Não — só `atribuidoPara/Por/Em` sobrescritos |
| Marcar/desmarcar prioridade | Não existia | — |
| Vincular/desvincular cliente, lead, pedido, produto | `crm360.js` | Só em `clientes/{id}/eventos` (escopo do cliente, não da conversa) |
| Usar template numa resposta | `atendimento.js` | Não |
| Observação interna | Campo único sobrescrito (`observacoesInternas`) | Não — trocar o texto perdia o anterior |

Conclusão: **nenhuma dessas operações deixava rastro na própria conversa**
antes desta etapa (o CRM 360 já registra parte disso, mas só do lado do
cliente — `clientes/{id}/eventos` — não do lado da conversa em si, e só
quando a conversa já está vinculada a um cliente identificado). Auditoria,
métricas de atendimento e futuras automações não tinham de onde partir.

## Fase 2/3 — Modelo canônico

Subcoleção nova, mesmo padrão de `chats/{chatId}/mensagens`:

```
chats/{chatId}/eventos/{eventoId}   // id automático, append-only
```

```js
{
  tenantId: "{storeUid}",
  lojaId: "{storeUid}",              // sempre == tenantId hoje (loja única por tenant)
  chatId: "{chatId}",                // sempre == o id do documento pai
  clienteId: "opcional, até 200 — quando a conversa já está vinculada",
  tipo: "um dos 33 valores do enum (ver abaixo)",
  categoria: "mensagens | atendimento | vinculos | alteracoes",
  autorUid: "{authUid} | \"\" (visitante anônimo)",
  autorTipo: "proprietario | funcionario | cliente",   // NUNCA \"ia\"/\"sistema\" nesta etapa
  autorNome: "opcional, até 120 — nunca de um <input>, sempre derivado do contexto autenticado",
  origem: "equipe | cliente",
  resumo: "opcional, até 300 — nunca o corpo completo de uma mensagem",
  criadoEm: "server timestamp (request.time) — nunca Date.now() do cliente",
  versaoSchema: 1,
  dados: "opcional — mapa restrito, ver LIMITES_EVENTO_ATENDIMENTO",
  // campos de contexto por família de evento (todos opcionais, um evento só
  // preenche os que fazem sentido pro próprio tipo):
  statusAnterior, statusNovo,
  responsavelAnteriorUid, responsavelNovoUid, responsavelAnteriorNome, responsavelNovoNome,
  setorAnterior, setorNovo,
  prioridadeAnterior, prioridadeNova,
  templateId, templateTitulo,
  leadId, pedidoId, produtoId, mensagemId,
  correlationId, dedupeKey
}
```

**Nunca guarda o corpo da mensagem.** `mensagem_equipe_enviada`/
`primeira_resposta_equipe`/`template_utilizado` referenciam `mensagemId` (o
id do próprio doc em `chats/{chatId}/mensagens`), nunca o texto — o conteúdo
continua vivendo só na subcoleção de mensagens, sem cópia.

### Enum fechado de tipos (`TIPOS_EVENTO_ATENDIMENTO`, `atendimento.js`)

| Categoria | Tipos |
|---|---|
| **Mensagens** | `mensagem_cliente_recebida`, `mensagem_equipe_enviada`, `mensagem_envio_falhou`, `cliente_respondeu_apos_resolucao`, `primeira_resposta_equipe` |
| **Atendimento** (status + ciclo de vida) | `conversa_criada`, `conversa_aberta`, `conversa_resolvida`, `conversa_reaberta`, `conversa_arquivada`, `conversa_restaurada`, `conversa_priorizada`, `prioridade_removida`, `status_alterado`, `aguardando_cliente`, `aguardando_equipe`, `conversa_assumida`, `responsavel_atribuido`, `conversa_transferida`, `responsavel_removido` |
| **Vínculos** | `cliente_vinculado`, `cliente_desvinculado`, `lead_vinculado`, `lead_desvinculado`, `pedido_vinculado`, `pedido_desvinculado`, `produto_vinculado`, `produto_desvinculado`, `template_utilizado` |
| **Alterações internas** | `setor_alterado`, `tag_adicionada`, `tag_removida`, `observacao_interna_adicionada`, `observacao_interna_atualizada` |

`categoriaEventoAtendimento(tipo)`/`tipoEventoValido(tipo)` são a fonte única
de verdade no frontend; `categoriaEventoAtendimentoEsperada()`/
`tipoEventoAtendimentoValido()` espelham exatamente a mesma tabela em
`firestore.rules` — os dois têm que ficar em sincronia manualmente sempre que
um tipo novo for criado (mesmo modelo já usado para `STATUS_CONVERSA`).

`classificarEventoStatus({statusAnterior, statusNovo})` decide qual tipo
gravar numa mudança de status: `resolvida` → `conversa_resolvida`,
`arquivada` → `conversa_arquivada`, `aguardando_cliente`/`aguardando_equipe`
mapeiam direto, e voltar para `aberta` vira `conversa_restaurada` (vindo de
arquivada), `conversa_reaberta` (vindo de resolvida) ou `conversa_aberta`
(qualquer outro caso) — retorna `null` quando não há transição real (mesmo
status), então nenhum evento vazio é gravado.

`classificarEventoAtribuicao({anteriorUid, novoUid, autorUid})` decide entre
`conversa_assumida` (autor atribuiu a si mesmo), `responsavel_atribuido`
(alguém sem responsável ganhou um), `conversa_transferida` (trocou de um
responsável pra outro) e `responsavel_removido` (ficou sem responsável).

## Fase 4/5 — Escrita atômica + autoria real

`enviarResposta`, `alterarStatus` e `atribuirResponsavel`
(`criarAtendimentoController`) usam `writeBatch(db)` para gravar a mudança de
estado do chat e o(s) evento(s) correspondentes **no mesmo commit atômico**:
nunca fica um chat atualizado sem o evento, nem um evento órfão sem a
mudança real ter acontecido.

```js
// enviarResposta(texto) grava, no mesmo batch:
//   1. chats/{id}/mensagens/{novo}         (mensagem em si)
//   2. chats/{id}                          (merge: ultimaMensagem, status, etc.)
//   3. chats/{id}/eventos/{novo}           mensagem_equipe_enviada { mensagemId }
//   4. (condicional) chats/{id}/eventos/{novo}   primeira_resposta_equipe
//   5. (condicional) chats/{id}/eventos/{novo}   evento de status (classificarEventoStatus)
//   6. (condicional) chats/{id}/eventos/{novo}   template_utilizado
```

Se o `batch.commit()` falhar (ex.: rede), o catch grava um evento
`mensagem_envio_falhou` best-effort **fora** do batch original — sinalizar a
falha é mais importante do que garantir atomicidade da própria sinalização,
e uma falha nesse segundo write só vira `console.error`, nunca trava a UI.

**Autoria nunca vem de input do usuário.** `montarEvento()` sempre deriva
`autorUid`/`autorTipo`/`autorNome` de `context.getSnapshot()` (o mesmo
contexto autenticado usado em toda a base) — o mesmo vale do lado do
servidor: `firestore.rules` exige `data.autorUid == request.auth.uid` e
`data.autorTipo in ["proprietario", "funcionario"]` no caminho da equipe, e
`autorUid == "" && autorTipo == "cliente"` no caminho do visitante anônimo.
**Não existe `autorTipo: "ia"` nem `"sistema"` gravável pelo frontend nesta
etapa** — IA real e automações ficam para um ciclo futuro, com autoria
própria a ser definida quando existirem de fato.

## Fase 3 (continuação) — Widget público (`loja.html`)

O chat da loja pública, sem autenticação, só pode gravar 4 tipos (whitelist
estreita nas Rules — ver Fase 12):

- `conversa_criada` — ao registrar o nome e criar o chat.
- `mensagem_cliente_recebida` — a cada mensagem enviada pelo visitante.
- `aguardando_equipe` — quando o status muda para isso (qualquer mensagem
  que não vem logo depois de uma resolução).
- `cliente_respondeu_apos_resolucao` — quando o status **antes** do envio
  era `resolvida` (rastreado num listener próprio no chat, `chatStatusAtual`,
  sem leitura extra por mensagem).

`autorUid` é sempre `""` e `autorTipo` sempre `"cliente"` — o visitante
público não tem uid real (Anonymous Auth continua não ativado, ver
`docs/ROADMAP_RD3_STATUS.md`), então forjar qualquer outro autor é
impossível pelas Rules, não só por convenção no frontend.

## Fase 6/7 — Timeline visual + paginação

`renderTimelineConversa()` mescla `state.mensagens` e `state.eventos` num
único feed ordenado por horário (`criadoEm`/`timestamp`), sem duplicar dados
nem criar uma coleção nova — mensagens continuam balões, eventos viram
linhas compactas visualmente distintas (`.atend-evento-linha`, formato
pílula tracejada, sem nenhum id/uid técnico exposto —
`descreverEventoAtendimento()` só gera frases em português).

Controles do usuário (`#atend-timeline-filtro`, `#atend-timeline-mostrar-eventos`):
- Filtro por categoria (mensagens/atendimento/vínculos/alterações) ou "todos".
- Toggle "mostrar histórico de eventos" — some com os eventos sem afetar as
  mensagens.
- Ambos persistem só em `localStorage` (`vh_atend_timeline_categoria`,
  `vh_atend_mostrar_eventos`) — **nunca** no documento do chat (Fase 6 do
  mandato original: preferência de visualização não é dado de negócio).

**Paginação**: cada conversa carrega uma janela inicial menor e mais barata
de até 50 mensagens e 50 eventos recentes (`limit()` nas duas queries) e
exibe o botão **"Carregar histórico anterior"** quando ainda pode haver itens
mais antigos. Mensagens e eventos mantêm cursores independentes (`startAfter`)
e continuam mesclados no frontend por horário, sem feed global duplicado e
sem criar `collectionGroup`.

**Resiliência**: mensagens e eventos usam dois `onSnapshot` independentes —
se a subcoleção `eventos` falhar por qualquer motivo (regra, rede, doc
antigo), a UI mostra um aviso isolado (`.atend-evento-erro`, com botão
"Tentar novamente") sem nunca bloquear a exibição das mensagens.

## Fase 9 — Métricas preparatórias (decisão de arquitetura)

**Tentativa original**: adicionar campos agregados (`primeiraRespostaMs`,
`quantidadeTransferencias`, `quantidadeReaberturas`, `prioridade`, etc.)
diretamente em `chats/{chatId}`, validados por Rules (mesmo padrão write-once
já usado em outros campos administrativos).

**Por que foi revertida**: ao somar essa validação às regras já grandes de
`chatAdminUpdateValido()`/`chatUpdatePublicoValido()` (acumuladas de três
mandatos: Central de Atendimento, CRM 360, Histórico de Eventos), o
Firestore passou a recusar a escrita com `"Unable to evaluate the expression
as the maximum of 1000 expressions to evaluate has been reached"` — um teto
real de complexidade de avaliação por regra (não é o limite conhecido de 10
`get()`/`exists()`; é complexidade cumulativa de toda a árvore de expressões
da regra `update` de `chats/{chatId}`, que já chama `podeResponderChat` →
`canEditTenant` → `employeeCanEdit` → `employeeHasModulePermission`,
`atribuicaoChatValida`, `clienteIdValidoParaTenant`, etc.). Confirmado por
bisseção empírica: 1 condição nova ainda passava, 2 já estourava o teto —
não era `let`, não era indexação dinâmica de mapa, não era a função auxiliar
em si, era só o tamanho total acumulado da regra.

**Solução adotada**: nenhum agregado novo em `chats`. `calcularMetricasAtendimento(eventos)`
e `conversaEstaPriorizada(eventos)` (`atendimento.js`) **derivam tudo em
runtime, no cliente, a partir do próprio histórico já carregado**:

```js
calcularMetricasAtendimento(eventos) // →
{
  primeiraMensagemClienteEm, primeiraRespostaEquipeEm, primeiraRespostaMs,
  resolvidaEm,                  // conversa_resolvida mais recente
  quantidadeTransferencias,     // conta conversa_transferida
  quantidadeReaberturas,        // conta conversa_reaberta + conversa_restaurada
  quantidadeMensagensCliente, quantidadeMensagensEquipe,
  templatesUtilizados
}

conversaEstaPriorizada(eventos) // → bool, olhando só o ÚLTIMO
  // conversa_priorizada/prioridade_removida por criadoEm — nunca um campo
  // próprio no chat
```

Isso não é só um workaround: é uma fonte única de verdade sem risco de
agregados divergirem do histórico bruto (o problema clássico de cache
desatualizado em campo calculado). O preço é reprocessar o array a cada
render — aceitável no volume paginado atual; eventos antigos entram sob
demanda quando o atendente carrega páginas anteriores.

**Se essas métricas precisarem ficar mais baratas ou virar KPI agregado
entre conversas (não só por conversa aberta)**, o caminho correto é migrar
para uma Cloud Function (trigger `onWrite` em `chats/{chatId}/eventos`
gravando um agregado num documento separado, fora do caminho crítico das
Rules de `chats`) — não tentar espremer mais validação na regra já no teto.
Isso é uma decisão explícita de não fingir segurança nem performance que o
frontend sozinho não consegue garantir hoje.

## Fase 8 — Notificações mais precisas

A Central de Notificações já não usa um log de eventos (nem antes, nem
agora) — ela deriva "eventos de negócio" direto do estado atual de
leads/pedidos/chats/clientes/avaliações a cada carregamento
(`carregarEventosNegocioNotificacoes()`, `dashboard-app.js`), sem coleção
`notificacoes` própria para esses itens. O estado `aguardando_equipe` já
cobria "cliente respondeu depois de resolvida" mesmo antes desta etapa (o
comentário original do código já dizia isso) — confirmado agora que o
widget público também registra esse exato caso como
`cliente_respondeu_apos_resolucao` no histórico da conversa.

Melhoria real desta etapa, sem custo extra de leitura: a notificação de
"conversa aguardando resposta" agora mostra quantas mensagens estão sem
resposta (`naoLidasLoja`, campo que já vinha junto no mesmo documento).

**Por que não foi implementado dedupeKey/consulta pelos eventos**: o campo
`dedupeKey` já existe no schema do evento (reservado para uso futuro) e as
Rules já aceitam, mas não há hoje nenhum lugar que persista notificações a
partir de eventos — dedupe só faz sentido quando existe um documento
persistido pra comparar contra. Ler o histórico de todas as conversas
pendentes para montar notificações mais ricas (ex.: "conversa X foi
transferida para você") exigiria uma consulta `collectionGroup("eventos")`
com índice composto novo (`tenantId` + `criadoEm`) — não implementado nesta
etapa por ser uma mudança de infraestrutura (deploy de índice) fora do
escopo de "não avance para automações amplas"; fica registrado como próxima
prioridade real abaixo.

## Fase 10 — Integração com o CRM 360 (sem duplicar)

`crm360.js` grava eventos em **dois lugares diferentes** para o mesmo fato,
quando a ação de vincular/desvincular parte de uma conversa aberta
(`state.conversa` setado por `abrirParaConversa`):

1. `clientes/{clienteId}/eventos` (já existia, ciclo do CRM 360) — a
   timeline do **cliente**, útil mesmo quando ele tem várias conversas.
2. `chats/{chatId}/eventos` (novo, espelho) — a timeline **da conversa**,
   pro time que está atendendo enxergar o vínculo sem trocar de tela.

Não é duplicação: são dois registros de **escopos diferentes** sobre o mesmo
fato (um por cliente, um por conversa), ligados por `correlationId` (o id do
evento em `clientes/{id}/eventos`, quando disponível) — nunca uma cópia do
conteúdo um do outro. `registrarEventoConversa()` só grava quando existe uma
conversa aberta; fora desse contexto (ex.: CRM aberto direto por notificação
"cliente sem retorno"), só o evento do cliente é gravado, como já acontecia.

Ações cobertas: vincular/desvincular cliente à conversa
(`vincularConversaACliente`, `criarClienteDaConversa`), lead
(`vincularLead`/`desvincularLead`), pedido (`vincularPedido`/
`desvincularPedido`), produto de interesse (`vincularProdutoInteresse`/
`removerProdutoDaLista`).

**Não espelhado de propósito**: `atualizarStatusRelacionamento` (status do
**relacionamento comercial** do cliente: novo/lead/qualificado/cliente/...)
e `atualizarResponsavel` (responsável **comercial** pelo cliente). São
conceitos diferentes do status/responsável **da conversa** (que já tem seus
próprios eventos, gravados por `atendimento.js` desde a Fase 4) — misturar
os dois no mesmo tipo de evento seria inventar um sentido que não existe no
enum atual, então não foi feito.

## Fase 12 — Regras de segurança

`match /chats/{chatId}/eventos/{eventoId}`:

```
allow read:   isBackendAdmin() || (o chat existe e podeVerChat(chat))
allow create: eventoAtendimentoStaffValido(chatId) || eventoAtendimentoClientePublicoValido(chatId)
allow update, delete: false   // sempre — nem o dono edita o passado
```

- **`eventoAtendimentoStaffValido(chatId)`**: exige que o chat exista, que
  quem escreve tenha `podeResponderChat` (mesma checagem de responder
  mensagem), whitelist fechada de chaves, todos os campos obrigatórios,
  `tenantId`/`lojaId` batendo com o dono real do chat, tipo dentro do enum,
  categoria batendo com o tipo esperado, `autorUid == request.auth.uid`,
  `autorTipo in ["proprietario", "funcionario"]`, `origem == "equipe"`,
  `criadoEm == request.time`, `versaoSchema == 1`, e os campos opcionais
  (`resumo`, `autorNome`, `clienteId`, `correlationId`, `dedupeKey`)
  validados por tamanho quando presentes.
- **`eventoAtendimentoClientePublicoValido(chatId)`**: chat existente e não
  arquivado, whitelist ainda mais estreita (sem os campos de contexto da
  equipe), tipo restrito aos 4 valores da Fase 3, `autorUid == ""`,
  `autorTipo == "cliente"`, `origem == "cliente"`.
- **Leitura**: mesma regra de `podeVerChat` já usada em `mensagens` — quem
  pode ver a conversa (ver ou editar `atendimento`/`leads`, do tenant certo,
  ou admin de backend) pode ler o histórico; o visitante público **nunca**
  lê a subcoleção de eventos (só escreve os 4 tipos permitidos) — ele não
  precisa ver o histórico administrativo da própria conversa.
- **Nunca há update/delete**: histórico é fato consumado; "desfazer" uma
  ação sempre gera um evento novo (ex.: `responsavel_removido`), nunca apaga
  o registro de que a atribuição aconteceu.

## Fase 13 — Compatibilidade com conversas antigas

Chats criados antes desta etapa não têm nenhum documento em
`eventos/` — isso é esperado e tratado como estado normal, não como erro:

- `state.eventos` começa vazio; `renderTimelineConversa()` simplesmente
  mostra só as mensagens (a mesma UI de antes desta etapa) até o primeiro
  evento novo ser gravado por uma ação feita depois do deploy.
- `calcularMetricasAtendimento([])` retorna todos os campos `null`/`0` — a
  barra de métricas fica com `hidden` (nenhuma métrica pra mostrar), sem erro
  nem "undefined" na tela.
- `conversaEstaPriorizada([])` retorna `false` — nenhuma conversa antiga
  nasce priorizada por engano.
- Nenhuma migração de dado foi feita nem é necessária: o histórico só passa
  a existir daqui pra frente, por escrita nova.

## Arquivos alterados nesta etapa

- `atendimento.js` — enum, categorias, validação de payload, classificação de
  status/atribuição, métricas derivadas, prioridade derivada, descrição
  legível, escrita atômica (`writeBatch`) em `enviarResposta`/
  `alterarStatus`/`atribuirResponsavel`, `alternarPrioridade`, timeline
  mesclada com filtro/paginação/preferências locais.
- `atendimento.css` — `.atend-timeline-barra`, `.atend-metricas`,
  `.atend-evento-linha/-icone/-texto/-hora/-erro`, estado `.is-priorizada`,
  responsivo (`@media max-width: 720px`).
- `dashboard.html` — botão de prioridade, barra de métricas, filtro de
  categoria e toggle "mostrar eventos" na Central de Atendimento.
- `dashboard-app.js` — `writeBatch` na lista de imports do Firestore e nas
  dependências do `atendimentoController`; notificação de atendimento com
  contagem de mensagens sem resposta.
- `loja.html` — widget público grava `conversa_criada`,
  `mensagem_cliente_recebida`, `aguardando_equipe`,
  `cliente_respondeu_apos_resolucao`.
- `crm360.js` — `registrarEvento` retorna o id (vira `correlationId`);
  `registrarEventoConversa()` novo; vínculo/desvínculo de cliente, lead,
  pedido e produto passam a espelhar na conversa quando aberta a partir dela.
- `firestore.rules` — `mapHasField`, `donoUidDoChat`,
  `categoriaEventoAtendimentoEsperada`, `tipoEventoAtendimentoValido`,
  `eventoAtendimentoDadosValido`, `eventoAtendimentoCamposOpcionaisValidos`,
  `eventoAtendimentoStaffValido`, `eventoAtendimentoClientePublicoValido` +
  `match /chats/{chatId}/eventos/{eventoId}`.
- `tests/atendimento.test.mjs` — 25 testes novos (enum/categorias, payload de
  dados, classificação de atribuição/status, métricas, prioridade derivada,
  descrição legível).
- `tests/emulator/firestore-security.test.mjs` — 14 testes novos (criação
  pela equipe, criação pelo visitante anônimo, leitura restrita/append-only,
  espelho do CRM 360).

## Testes

- `tests/atendimento.test.mjs`: **52 testes** (era 27 antes desta etapa).
- `tests/crm360.test.mjs`: **38 testes** (sem alteração de contagem — só a
  lógica pura já testada; `registrarEventoConversa` é função interna do
  controller, testada pela suíte de Rules, mesmo padrão já usado para o
  resto do controller).
- `tests/emulator/firestore-security.test.mjs`: **135 testes** (121 antes do
  ciclo do CRM 360; 134 já com as Rules de `chats/eventos` desta etapa; 135
  com o teste do espelho do CRM 360 na conversa).
- `tests/emulator/storage-security.test.mjs`: 5 testes, sem alteração.
- `pnpm run check` (sintaxe de todos os módulos + testes): passando.
- Smoke test em Chromium headless (Playwright, via `python3 -m http.server`)
  confirmando presença de `#atend-btn-prioridade`, `#atend-metricas`,
  `#atend-timeline-filtro`, `#atend-timeline-mostrar-eventos`,
  `#atend-mensagens` no DOM e ausência de erros de JavaScript próprios
  (os únicos erros de console observados são de rede — CDN do Firebase
  bloqueado no ambiente de teste isolado, não relacionados ao código).

## Limitações conhecidas (honestas, não escondidas)

- **`dedupeKey` reservado, não usado ainda**: existe no schema e nas Rules,
  mas nada persiste notificações a partir de eventos hoje — não há contra o
  que fazer dedupe. Ver Fase 8.
- **Notificações mais ricas por evento (ex.: "conversa transferida pra
  você") exigiriam um índice composto novo** (`collectionGroup("eventos")`
  por `tenantId`+`criadoEm`) — decisão de infraestrutura fora do escopo
  desta etapa, registrada como próxima prioridade.
- **Métricas são recalculadas a cada render**, não cacheadas — aceitável com
  a janela paginada da conversa aberta; um agregado real por Cloud Function
  só se justifica se isso virar KPI comparado entre conversas.
- **`chats/{chatId}/eventos` não é global**: cada evento pertence a UMA
  conversa. Para ver o histórico combinado de todas as conversas de um
  cliente, a fonte continua sendo `clientes/{id}/eventos` (CRM 360) — as
  duas timelines são complementares, não uma substituta da outra.
- Sem testes de UI automatizados cobrindo login real (mesma limitação já
  registrada em `docs/CENTRAL_ATENDIMENTO.md`/`docs/CRM_360_CLIENTE.md`).

## Próximas três prioridades reais

1. Índice composto em `eventos` (`collectionGroup`, `tenantId`+`criadoEm`)
   para notificações mais precisas por tipo de evento, não só por estado
   atual do chat.
2. Avaliar, com volume real de uso, se `calcularMetricasAtendimento` precisa
   migrar para um agregado gravado por Cloud Function (trigger em
   `chats/*/eventos`) — hoje o cálculo em runtime é suficiente e mais
   confiável que um campo que pudesse divergir do histórico bruto.
3. Validar a experiência visual autenticada em conversas de alto volume,
   especialmente no mobile, agora que o carregamento anterior existe.
