# Edição Completa de Pedido Existente V1

Documenta a evolução do detalhe de pedido (`orders-engine-v1.js`, dentro da
Central de Pedidos): antes desta etapa só era possível alterar status,
pagamento, responsável, prazo, desconto, frete e observações internas — o
resto (cliente, contato, recebimento, endereço, observações do cliente,
itens, quantidades, preços e texto livre) era só leitura. Ver
`docs/PEDIDOS_ESTRUTURADOS.md` e `docs/HANDOFF_2026-07-28.md` pra esse
histórico completo.

## O que mudou

A equipe autorizada (`state.canEdit`) agora pode abrir um pedido, clicar em
**"Editar pedido"**, alterar qualquer um dos campos abaixo, revisar
subtotal/total em tempo real e salvar tudo de forma atômica:

- **Cliente do pedido** (snapshot deste pedido, não a identidade canônica
  do CRM): nome, WhatsApp, e-mail.
- **Recebimento**: tipo (retirada/entrega/não informado), CEP, endereço,
  observações do cliente.
- **Itens**: adicionar produto do catálogo, remover item, alterar
  quantidade, alterar preço (snapshot — nunca retroage pro catálogo).
- **Texto livre** ("Produtos ou serviços"): continua existindo pra pedidos
  sem itens estruturados; depois de editado manualmente, mudanças nos itens
  param de sobrescrevê-lo (mesmo princípio já usado no modal de criação via
  `marcarPedidoCampoEditadoManual`).
- **Financeiro**: subtotal (derivado dos itens) e total (subtotal − desconto
  + frete) recalculados ao vivo.

Os campos de **Gestão** (status, pagamento, responsável, prazo, desconto,
frete, observações internas) continuam exatamente como estavam — sempre
visíveis e editáveis no painel "Gestão", com o mesmo botão "Salvar pedido"
de sempre (`data-orders-action="save"`, `saveDetail()`) — não foram movidos
pra dentro do modo de edição. A Edição Completa é um formulário adicional,
não uma substituição.

## Arquitetura

Nenhum estado novo fora do motor. `orders-engine-v1.js` ganhou:

- `state.editingId` / `state.editDraft` / `state.editCatalog` /
  `state.editCatalogLoaded` / `state.editCatalogLoading` /
  `state.editSaving` / `state.editError` — estado transitório, nunca
  persistido; o draft só existe enquanto a edição está aberta.
- `loadEditCatalog()` — carrega `produtos` (tenant atual, `limit(300)`,
  `getDocs` único, sem `onSnapshot`) só na primeira vez que a equipe abre a
  edição na sessão; resultado fica em cache em memória.
- `openEdit(order)` / `cancelEdit(order)` / `saveEdit(order)` — ciclo de
  vida da edição.
- `readGestaoPanelValues()` — lê os 7 campos de gestão sempre visíveis
  (reaproveitado por `saveDetail()` E por `saveEdit()`, pra nunca duplicar
  a lógica).
- `refreshEditItemsUI()` — re-renderiza só o painel de Itens (não o
  `.aura-orders-v1-detail` inteiro) quando um item é adicionado/removido/
  alterado, pra não reacionar sem necessidade a lógica de abertura do
  drawer em `orders-executive-v1.js` (foco, backdrop) a cada clique.
- Campos de texto (cliente/WhatsApp/e-mail/CEP/endereço/observações/texto
  livre) atualizam `state.editDraft` no evento `input`/`change` **sem**
  disparar `render()` — só atualizam o selo de "não salvo" e o preview de
  total via `refreshEditDirtyUI()`. Um `render()` completo a cada tecla
  destruiria o foco/cursor do campo sendo digitado.

Lógica pura de rascunho (nunca DOM, nunca Firestore) mora em
`pedidos-estruturados.js`, ao lado das funções já existentes de itens:

| Função | Papel |
|---|---|
| `criarDraftPedido(order)` | Copia o pedido normalizado pro formato de rascunho |
| `normalizarDraftPedido(draft)` | Aplica limites, recalcula subtotal/total, resolve o texto automático |
| `validarDraftPedido(draft)` | Retorna `""` ou a primeira mensagem de erro |
| `calcularTotaisDraft(draft)` | `{ subtotal, total }`, nunca negativo |
| `compararPedidoComDraft(order, draft)` | Diff por grupo: `{ alterado, grupos: { cliente, recebimento, itens, valores, prazo, gestao } }` |
| `resumirAlteracoesPedido(diff)` | Nomes dos grupos alterados, pro histórico (nunca dado sensível) |
| `atualizarPrecoItem(itens, produtoId, preco)` | Companheira de `atualizarQuantidadeItem`, já existente |
| `gerarProdutosTextoSemSobrescreverManual(draft)` | Resolve o texto automático respeitando edição manual |

## Persistência

`persistOrder()` (já existente) foi expandido, continua sendo o único
caminho de escrita e continua usando `writeBatch` único:

- **Pedido legado** (`pedidos/{id}`): `legacyPayload()` agora também grava,
  quando presentes, `clienteWhatsapp`, `clienteEmail`, `tipoRecebimento`,
  `cep`, `endereco`, `observacoesCliente` e `historico` — nomes alinhados
  ao contrato já usado em `pedidoSnapshot` (leads).
- **Lead vinculado** (`leads/{leadId}`): o patch (já existente, `merge:
  true`) ganhou campos por caminho (`"pedidoSnapshot.clienteNome"`,
  `"pedidoSnapshot.clienteWhatsapp"` etc.) — atualiza só esses subcampos do
  mapa `pedidoSnapshot`, nunca sobrescreve o mapa inteiro nem o resto do
  lead. **Identidade canônica do CRM (`lead.nome`/`lead.email` de topo,
  `clientes/{id}`) nunca é tocada por esse caminho.**
- **Histórico**: um evento `"Dados do pedido editados (grupo1, grupo2...)"`
  é criado só quando `compararPedidoComDraft` detecta alguma mudança real —
  nunca telefone/endereço/observação completa no texto, só os nomes dos
  grupos.

### Bug real encontrado e corrigido nesta etapa: histórico não persistia pra pedidos sem lead

Ao testar a edição completa, ficou claro que **pedidos criados pelo modal
"Novo pedido"** (sem `leadId` — a maioria dos pedidos internos) **nunca
tinham histórico realmente persistido**: `persistOrder()` só construía e
gravava o array `history` dentro do bloco `if (order.leadId)`. Pra qualquer
pedido puramente legado, toda mudança de status/pagamento/edição
completa era descartada silenciosamente — a tela sempre mostrava só o
evento sintético "Pedido registrado" (fallback de `renderHistory()`), nunca
o que realmente aconteceu depois.

Corrigido: o array de histórico agora é calculado **incondicionalmente** em
`persistOrder()` (fora do `if (order.leadId)`) e gravado também no campo
novo `pedidos/{id}.historico` (whitelist em `firestore.rules`, lista com no
máximo 40 entradas — mesmo teto `MAX_HISTORY` já usado pra
`pedidoHistorico`). `normalizeLegacyOrder()` passou a ler esse campo em vez
de sempre devolver `history: []`. Nenhuma migração é necessária: pedidos
antigos sem o campo continuam funcionando (fallback sintético), e passam a
acumular histórico real a partir da primeira edição depois deste commit.

## Modelo de dados (`firestore.rules`)

`validPedidoData()` (coleção `pedidos`) ganhou seis campos opcionais novos,
todos com tipo/tamanho validados, mantendo a whitelist fechada
(`hasOnly`):

| Campo | Tipo | Limite |
|---|---|---|
| `clienteWhatsapp` | string | 30 |
| `clienteEmail` | string | 160 |
| `tipoRecebimento` | string | enum `retirada`/`entrega`/`não informado` |
| `cep` | string | 12 |
| `endereco` | string | 300 |
| `observacoesCliente` | string | 2000 |
| `historico` | list | 40 itens |

`criadoPor`/tenant continuam imutáveis (`criadoPorUnchanged()`, já
existente). Nenhuma mudança na whitelist de `leads` — a atualização de
`update` de `leads/{id}` já não tinha whitelist de campos (só
`criadoPorUnchanged` + `canEditTenant` + `clienteIdValidoParaTenant`), então
os novos caminhos `pedidoSnapshot.*` não precisaram de nenhuma regra nova.

## Campos imutáveis (nunca editáveis pela UI)

`id`, `leadId`, `legacyId`, `source`, `number`, `created`, `origin`,
`campaign`, `ownerUid`/tenant, `criadoPor`, `clienteId`,
`pedidoVinculadoId` — nenhum formulário novo expõe esses campos, e
`persistOrder()`/`legacyPayload()` continuam derivando-os do pedido
original, nunca do draft.

## Segurança

- `state.canEdit` na UI (botão "Editar pedido" só aparece com permissão de
  edição; reader nunca vê os controles, confirmado no teste de UI).
- Firestore Rules continuam a barreira real (testes owner/editor/reader/
  outro tenant em `tests/emulator/firestore-security.test.mjs`).
- Nenhum dado de cliente além do necessário é exposto — os grupos do
  histórico são só nomes (`cliente`, `recebimento`, `itens`, `valores`,
  `prazo`, `gestão`), nunca o conteúdo alterado.
- `state.orders` continua privado ao módulo — nada de exposição global,
  mesmo princípio já documentado em `docs/HANDOFF_2026-07-28.md`.

## Responsividade e acessibilidade

- Desktop (drawer): itens em grade compacta, ações (Cancelar/Salvar) fixas
  no rodapé (`position: sticky`) dentro do próprio scroll do drawer.
- Tablet (≤1180px): coluna única.
- Celular (≤560px): campos de item empilham (quantidade/preço/remover em
  linha própria com alvos de 44px), busca de produto e botões de
  ação com altura mínima de 44/48px, nada depende de hover.
- Foco no primeiro campo (`#aura-orders-v1-edit-customer`) ao abrir a
  edição; foco volta pro botão "Editar pedido" ao cancelar — ambos via
  duplo `requestAnimationFrame` pra rodar depois da própria lógica de
  abertura do drawer em `orders-executive-v1.js` (que já agenda seu próprio
  foco no botão "Voltar").
- Sair com alterações não salvas (botão Voltar, clique no backdrop, tecla
  Escape — todos os três acionam o mesmo `[data-orders-action="back"]`)
  pede confirmação nativa (`window.confirm`) antes de descartar.
- Região de erro com `role="alert"`/`aria-live="assertive"` mostra a
  mensagem de validação perto dos botões de ação, além do toast resumido.

## Limitação de cobertura de teste conhecida

O seed do Quality Gate (`scripts/seed-emulator.mjs`) só tem **um** produto
ativo no catálogo (`Produto Local`) e o pedido usado no teste de UI
(`pedidos.flow.mjs`) já nasce com esse produto no carrinho — então o teste
de ponta a ponta não consegue exercer "adicionar um produto novo via busca"
sem alterar o seed compartilhado (risco maior que o benefício aqui). O
teste de UI confirma, em vez disso, que a busca corretamente NÃO mostra um
produto já presente no pedido (`Nenhum produto encontrado`), e a função
pura `adicionarItemPedido` (reaproveitada, não duplicada) já tem cobertura
unitária completa em `tests/pedidos-estruturados.test.mjs`, incluindo o
caso de somar quantidade em vez de duplicar linha.

Da mesma forma, o caminho `pedidoSnapshot.*` (pedidos vinculados a lead) não
tem um teste de UI end-to-end dedicado — o pedido criado pelo fluxo de teste
é sempre um pedido legado puro (criado pelo modal "Novo pedido", sem
`leadId`). Esse caminho está coberto por um teste de Rules dedicado
(merge parcial por dot-path preservando identidade canônica) e por leitura
de código; o CAMPO em si (`pedidoSnapshot.clienteNome`/`clienteWhatsapp`/
etc.) segue o mesmo padrão de merge já usado e testado para
`pedidoDesconto`/`pedidoFrete` desde a feature de Pedidos Executivos V1.
