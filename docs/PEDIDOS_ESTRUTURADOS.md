# Pedidos Estruturados e Vinculados ao Atendimento (RD3)

Evolui a coleção `pedidos` já existente — `cliente` (texto), `produtos`
(texto), `valor`, `status`, `obs` continuam existindo exatamente como
antes. `itens` (produtos reais do catálogo, com quantidade e preço) e
`prazoEntrega` são campos **novos e opcionais** que passam a acompanhar o
pedido quando a equipe escolhe produtos do catálogo em vez de (ou além de)
digitar tudo em texto livre. Nenhuma coleção nova, nenhuma migração
destrutiva.

## Auditoria: o que existia antes desta etapa

- `pedidos/{id}` (id manual `ped_${Date.now()}`, `dashboard-app.js`):
  `cliente`/`produtos` sempre texto livre, sem nenhuma referência à
  coleção `produtos`. **Não existia função de edição** — só criação,
  mudança de status (`atualizarStatusPedido`/`moverPedidoFluxo`) e
  exclusão física. `clienteId` (do ciclo CRM 360) era o único campo de
  vínculo já existente.
- `produtos/{id}`: além de `nome`/`preco`/`imagemB64`/`statusProduto`, já
  tinha `estoque` (quantidade), `tipo`, `subnicho` — mas nenhuma tela de
  pedido consultava essa coleção.
- **`firestore.rules` não tinha NENHUMA validação de campo em `pedidos`**
  — só checagem de dono/tenant (`canEditTenant`). Um cliente malicioso
  podia gravar qualquer campo extra, `valor` negativo, `status` fora do
  enum — nada disso era bloqueado pelo servidor. Corrigido nesta etapa
  (achado de auditoria, não estava no escopo original do mandato, mas
  era necessário resolver antes de adicionar `itens` com qualquer
  segurança real).
- `crm360.js`'s `calcularResumoComercial()` já tinha uma versão
  "produtos mais comprados", mas só por **correspondência de texto**
  (`produtos.split(",")`, normalizado por caixa/espaço) — nunca por
  `produtoId` real, porque esse dado não existia.
- `templates-atendimento.js`'s `valoresDePedido()` já resolvia
  `numero_pedido`/`status_pedido`/`valor_pedido`/`data_pedido`, mas
  `{{prazo_entrega}}` **sempre ficava pendente** — confirmado por
  auditoria que não existe (nem existia) nenhum campo de prazo de
  entrega em `pedidos`.

## Modelo estruturado

```js
// pedidos/{id} — campos existentes sem mudança de contrato:
{
  cliente: "1–160",        // texto livre, continua sendo o nome digitado
  produtos: "1–2000",      // texto livre — agora pode ser AUTO-GERADO a
                            // partir dos itens escolhidos, mas continua
                            // 100% editável (nunca fica travado)
  valor: number,
  status: "aguardando" | "confirmado" | "pago" | "cancelado",
  obs: "até 2000 (opcional)",
  criadoPor: "{authUid}",  // imutável
  data: number,
  clienteId: "opcional (CRM 360)",
  statusAtualizadoEm: number,  // opcional, gravado por atualizarStatusPedido

  // NOVOS, opcionais:
  itens: [
    { produtoId: "{id em produtos}", nomeSnapshot: "até 160", precoSnapshot: number, quantidade: 1–999 }
  ],  // até 20 itens
  prazoEntrega: number | null  // timestamp opcional
}
```

Cada item é um **snapshot** — `nomeSnapshot`/`precoSnapshot` capturam o
produto no momento da escolha, exatamente como `clientes.produtosInteresse`
já fazia desde o CRM 360. Se o preço do produto mudar depois no catálogo,
pedidos já registrados não mudam retroativamente.

## Interface: seleção de produtos no modal de pedido

Novo campo de busca ("Produtos do catálogo") no modal de "Registrar novo
pedido" (`dashboard.html`/`dashboard-app.js`):

1. A equipe busca por nome entre os produtos ativos do próprio catálogo.
2. Cada resultado clicado vira um item (quantidade inicial 1, editável).
3. Escolher o mesmo produto de novo soma a quantidade — nunca duplica a
   linha.
4. O subtotal dos itens é somado automaticamente.
5. **O campo de texto livre "Produtos ou serviços" e o campo "Valor" se
   pré-preenchem a partir dos itens — mas continuam editáveis.** Assim
   que a equipe edita manualmente qualquer um dos dois, o preenchimento
   automático para de sobrescrever (`marcarPedidoCampoEditadoManual`) —
   nunca apaga o que a pessoa acabou de digitar.
6. Um pedido pode ser criado só com texto livre (como sempre foi), só com
   itens do catálogo, ou os dois juntos.
7. Campo novo "Prazo de entrega" (opcional, seletor de data) — alimenta
   `{{prazo_entrega}}` nos templates de atendimento.

**Não existe edição de pedido** nesta etapa (também não existia antes —
só criação, mudança de status e exclusão). Ficou fora de escopo: o
mandato pedia estruturar `itens`/`produtoId`, não construir um fluxo de
edição que nunca existiu.

## Vínculo automático com o CRM 360

### "Produtos mais comprados" preciso

`contarProdutosMaisComprados()` (`pedidos-estruturados.js`) agora agrupa
por `produtoId` real quando o pedido tem `itens` — e continua caindo no
texto livre (best-effort) para pedidos antigos sem `itens`. As duas
fontes convivem na mesma contagem, sem descartar nenhum pedido:

```js
{ nome, total, produtoId: "prod123", preciso: true }   // via itens
{ nome, total, produtoId: null, preciso: false }        // via texto (legado)
```

### "Produto de interesse → pedido real" (conversão)

`produtosInteresseConvertidos()` compara os `produtoId` dos itens de
pedidos de um cliente contra a lista `clientes.produtosInteresse` (CRM
360) — quando batem, o produto de interesse ganha o selo "Convertido em
pedido" no drawer do CRM. Só funciona pra pedidos com `itens` (dado
estruturado); pedidos antigos em texto livre não geram esse selo (não há
como saber com certeza sem o produtoId real — não inventamos).

## Integração com templates de atendimento

`{{prazo_entrega}}` agora resolve de verdade quando o pedido explicitamente
vinculado à conversa (mesmo mecanismo do ciclo anterior — último evento
`pedido_vinculado`/`pedido_desvinculado` no histórico da conversa, nunca
escolhido pelo nome do cliente) tem `prazoEntrega` preenchido. Sem essa
data, a variável continua pendente (nunca inventa uma data) — mesmo
comportamento de antes, só que agora tem um caminho real pra deixar de
acontecer.

## Firestore Rules

`pedidos` não tinha nenhuma validação de campo antes desta etapa — corrigido
com `validPedidoData` (whitelist fechada, tipos, limites, enum de status).
`itens` é validado **de forma rasa** nas Rules (`is list && size() <= 20`)
— a validação profunda de cada item (produtoId/nomeSnapshot/precoSnapshot/
quantidade) acontece no cliente (`validarItemPedido`, chamada antes de
qualquer escrita) e não nas Rules, por uma razão técnica real: o Firestore
não itera elementos de lista de forma barata, e a lição do ciclo do
histórico de eventos (teto de "1000 expressões" numa regra grande) pesou
na decisão de não tentar validar cada item individualmente aqui. Isso é
documentado como uma decisão explícita, não uma omissão — quem precisar de
auditoria confiável sobre o que aconteceu com um pedido tem o histórico de
eventos da conversa (`chats/{id}/eventos`, tipo `pedido_vinculado`) como
fonte de verdade, não o conteúdo bruto de `itens`.

Bloqueado: campo fora da whitelist, `status` fora do enum, `valor`
negativo, `cliente`/`produtos` vazios, mais de 20 itens, `itens` que não
seja lista, `prazoEntrega` que não seja number/null.

**Compatibilidade com pedidos já em produção**: como a validação é nova
(não existia antes), toda atualização futura de um pedido antigo (ex.:
mudar status) agora passa pela whitelist completa — auditei todos os
pontos de escrita do repositório (criação, mudança de status, vínculo de
`clienteId`) e o whitelist cobre exatamente os campos que cada um grava
(`cliente, produtos, valor, status, obs, criadoPor, data, clienteId,
statusAtualizadoEm, itens, prazoEntrega`). Não há visibilidade sobre dados
já gravados em produção fora desses caminhos de código — se algum pedido
muito antigo tiver um campo fora dessa lista, sua próxima atualização
falharia até esse campo ser removido; nenhum sinal disso foi encontrado na
auditoria do código-fonte.

## Índices

**Nenhum índice novo necessário.** "Produtos mais comprados" e o selo de
conversão são calculados em memória a partir dos pedidos já carregados
por `clienteId`/`criadoPor` (queries de igualdade simples, já existentes).
`firestore.indexes.json` não foi alterado. O índice composto
`pedidos(criadoPor, data, status)` continua só planejado (não construído),
sem relação com esta etapa — documentado em `docs/FIREBASE_INDEXES_PLAN.md`.

## Testes

- `tests/pedidos-estruturados.test.mjs` (novo): **22 testes** — validação
  de item/lista de itens, cálculo de valor, resumo em texto,
  adicionar/remover/atualizar item (sem duplicar, respeitando limites),
  produtos mais comprados (precisos com itens, best-effort sem),
  produtos de interesse convertidos.
- `tests/templates-atendimento.test.mjs`: +2 testes (`{{prazo_entrega}}`
  resolvendo de verdade quando o pedido tem `prazoEntrega`).
- `tests/crm360.test.mjs`: 38 testes, sem regressão (a troca de
  `calcularResumoComercial` pela função nova do módulo de pedidos mantém
  exatamente o mesmo contrato de retorno, só mais preciso).
- `tests/emulator/firestore-security.test.mjs`: **+6 testes** — criação
  válida com/sem itens, rejeição de campo extra/status inválido/valor
  negativo/cliente-produtos vazios, limite de 20 itens, `prazoEntrega`
  number/null, compatibilidade (pedido legado sem itens continua tendo o
  status atualizado normalmente), permissão.
- `pnpm run check` limpo. Suíte de regressão completa (atendimento,
  templates avançados, central-ia, base-conhecimento, studio, functions,
  storage) — todas passando.
- Validação visual: Chromium headless confirmando presença de todos os
  elementos novos no DOM (busca de produto, lista de itens, subtotal,
  prazo de entrega) e zero erros de JavaScript próprios.

## Limitações reais

- **Sem edição de pedido** — nunca existiu antes desta etapa; só
  criação/status/exclusão. Ficou fora do escopo pedido.
- **Validação de `itens` nas Rules é rasa** (lista + tamanho), não
  profunda — decisão técnica explícita pra não repetir o teto de
  complexidade de expressões já visto num ciclo anterior. A validação
  profunda acontece no cliente antes do envio.
- **Vínculo automático de pedido↔cliente por telefone/e-mail continua não
  existindo** — `pedidos.cliente` continua sendo só um nome digitado, sem
  telefone/e-mail estruturado. O que foi resolvido nesta etapa foi
  "produto de interesse ↔ pedido real" (via `produtoId`), não
  "cliente-por-contato" (que exigiria um campo novo em `pedidos`, fora do
  escopo anunciado).
- **"Produtos mais comprados" só fica 100% preciso pra pedidos novos**
  (criados com itens do catálogo) — pedidos antigos continuam contando
  pelo texto livre, como sempre foi.
- Sem teste de UI autenticado (Playwright + login Firebase real) neste
  ambiente — mesma limitação já registrada nos ciclos anteriores.

## Próximas prioridades reais

1. Entrada de navegação própria para o CRM 360 (ainda pendente, ciclos
   anteriores).
2. Índice composto em `chats/*/eventos` pra notificações mais precisas
   por tipo de evento (ainda pendente, ciclo do Histórico de Eventos).
3. Se o volume de pedidos com `itens` crescer muito, avaliar mover
   "produtos mais comprados" pra um agregado por Cloud Function em vez de
   recalcular em memória a cada abertura do CRM — hoje o volume não
   justifica essa complexidade.
