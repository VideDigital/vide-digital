# Templates Avançados de Atendimento (RD3)

Evolui a coleção `templates` já existente (mesma usada pelo módulo genérico
"Templates" e pela automação de leads, campo `fluxo`) para um módulo
profissional de respostas prontas dentro da Central de Atendimento — sem
criar uma segunda coleção, sem quebrar o fluxo de automação de leads que já
usa o mesmo dado.

## Auditoria: o que existia antes desta etapa

Levantamento completo antes de qualquer mudança (protocolo obrigatório do
mandato):

- Coleção `templates`, id **client-gerado** (`tpl_${Date.now()}`,
  `dashboard-app.js`) — sem colisão observada em produção, mas previsível e
  com risco teórico de colisão em criação rápida. Novos templates criados
  pela gestão de atendimento passam a usar id automático do Firestore
  (`doc(collection(db,"templates"))`); ids antigos continuam funcionando
  sem migração.
- Campos reais: `titulo`, `mensagem`, `categoria` (texto livre — o
  `<select>` do módulo genérico só oferece `geral/vendas/suporte/followup/
  cobranca`), `fluxo` (automação de leads), `criadoPor`, `criadoEm`,
  `atualizadoEm`. `atalho` e `ativo` já estavam na whitelist das Rules e no
  enum antigo de `atendimento.js`, mas **nenhuma tela jamais os escrevia** —
  campos mortos até esta etapa.
- **Duas sintaxes de variável coexistindo**: o hint do formulário genérico
  sugeria `{nome}` (chave simples), mas o motor de substituição real
  (`atendimento.js`) só reconhecia `{{variavel}}` (chave dupla). Mantivemos
  `{{ }}` (é o que de fato funciona) e não tocamos no formulário legado.
- `validarTemplateAtendimento` (antigo `atendimento.js`) existia, tinha
  testes, mas **nunca era chamada** pelo caminho de escrita real
  (`salvarTemplate` em `dashboard-app.js`) — validação morta do lado do
  cliente; só as Rules validavam de fato.
- **Nenhuma distinção entre template de atendimento e template de automação
  de lead** na mesma coleção — `carregarTemplatesAtendimento` carregava
  tudo do tenant, sem filtro. Resolvido nesta etapa com o campo opcional
  `contexto` (ver abaixo).
- **Achado fora do escopo de templates, mas que bloqueava testar
  "funcionário de atendimento autorizado usa template"**: as permissões
  `atendimento` e `crm` nunca apareciam na tela de gestão de acessos
  (`MODULOS_PERMISSAO`, `dashboard-app.js`) — Rules, `core/vide-context.js`
  e os controllers já suportavam essas permissões desde ciclos anteriores,
  mas nenhum dono conseguia concedê-las a um funcionário pela UI. Corrigido
  nesta etapa (duas linhas adicionadas à lista existente) porque é
  pré-requisito direto para o cenário "funcionário de atendimento pode usar
  template se autorizado" pedido no mandato — não é uma mudança de escopo
  de templates em si.

## Modelo canônico evoluído

Mesma coleção `templates`, campos novos **todos opcionais** — nenhum
documento antigo precisa ser migrado, nenhuma leitura quebra por falta de
campo:

```js
// templates/{id}
{
  // já existentes, sem mudança de contrato:
  titulo: "1–160",
  mensagem: "1–2000",          // campo real de conteúdo (o mandato pediu
                                // "conteudo" — adaptado ao nome real)
  categoria: "texto livre (<=60) por padrão; enum fechado só quando contexto=='atendimento'",
  criadoPor: "{authUid}",       // imutável
  criadoEm: number,
  atualizadoEm: number,
  fluxo: { ativo, statusLead, followupDias, prioridade, anotacao },  // automação de leads, intocado

  // novos, opcionais:
  contexto: "atendimento" | "leads",  // ausente = legado, aparece nos dois lugares (compatibilidade)
  atalho: "até 40, normalizado (minúsculo, sem espaço, [a-z0-9_-])",
  ativo: boolean,                     // default true quando ausente
  favorito: boolean,                  // compartilhado da loja (não é preferência por funcionário — ver decisão abaixo)
  ordem: number,
  usoTotal: number,                   // só cresce por +1, via caminho estreito de Rules
  ultimoUsoEm: number | timestamp,    // == request.time no momento do uso real
  atualizadoPor: "{authUid}",         // sempre == quem está escrevendo
  arquivadoEm: number | null,
  versaoSchema: number,               // 2 nos documentos criados pela gestão nova
  descricaoInterna: "até 300, só a equipe vê",
  tagsBusca: ["até 8 itens"],
  canal: "opcional",
  requerPedido: boolean,
  requerProduto: boolean,
  requerConfirmacao: boolean
}
```

**Por que não existe `tenantId`/`lojaId` novo**: `criadoPor` já cumpre
exatamente esse papel nesta coleção desde sempre; duplicar em dois campos
seria só reescrever sem necessidade.

### Compatibilidade com o módulo genérico "Templates" (automação de leads)

- `categoria` continua **texto livre** por padrão — só é validada contra o
  enum fechado de atendimento quando `contexto == "atendimento"` (é o único
  caso em que a UI nova sempre grava esse valor). O formulário antigo de
  `dashboard-app.js` (`salvarTemplate`) nunca grava `contexto`, então
  continua funcionando exatamente como antes, sem nenhuma mudança de
  comportamento.
- `templateVisivelNoAtendimento(item)` esconde do seletor de atendimento só
  quem tem `contexto === "leads"` explícito — um template sem `contexto`
  (todo o histórico existente) continua aparecendo nos dois lugares, que já
  era o comportamento de antes desta etapa (nunca fica "sumido").
- **Exclusão física continua existindo só no módulo genérico** (`excluirTemplate`,
  `dashboard-app.js`, inalterado) — a gestão nova nunca oferece delete
  físico, só arquivar/restaurar (`arquivadoEm`). As Rules continuam
  permitindo `delete` (não removido) porque o fluxo legado depende disso.

## Categorias fechadas (contexto de atendimento)

`CATEGORIAS_TEMPLATE_ATENDIMENTO` (`templates-atendimento.js`): saudação,
orçamento, pagamento, prazo, entrega, pedido, indisponibilidade, suporte,
acompanhamento, pós-venda, encerramento, personalizada. Categoria
desconhecida (incluindo o vocabulário do módulo genérico —
`geral/vendas/followup/cobranca`) cai em "personalizada" na UI, sem quebrar
a listagem. Validada contra este mesmo enum nas Rules, mas só quando
`contexto == "atendimento"` (ver acima).

## Variáveis

Whitelist evoluiu de 4 para 8, mantendo as originais:

```
{{nome_cliente}}  {{nome_loja}}  {{nome_funcionario}}  {{numero_pedido}}
{{status_pedido}}  {{valor_pedido}}  {{data_pedido}}  {{prazo_entrega}}
```

- Substituição continua **regex determinística, sem eval, sem Function
  dinâmica** (`substituirVariaveisTemplate`) — variável fora da whitelist
  passa direto, nunca vira dado.
- `{{numero_pedido}}` usa o próprio id do documento (`ped_<timestamp>`)
  como identificador — não existe hoje um campo de "número" amigável
  separado em `pedidos` (limitação real, documentada, não inventamos um).
- `{{prazo_entrega}}` **sempre fica pendente** — não existe campo canônico
  de prazo de entrega em `pedidos` hoje (auditado, confirmado). Fica pronta
  pra usar assim que a próxima fase (Pedidos Estruturados) criar esse dado.
- **Pedido só é resolvido quando explicitamente vinculado à conversa
  atual** — nunca escolhido pelo nome do cliente. O vínculo é derivado do
  histórico de eventos (`pedidoVinculadoIdDaConversa`, olha o último
  `pedido_vinculado`/`pedido_desvinculado` em `chats/{id}/eventos`), o
  mesmo padrão já usado para `conversaEstaPriorizada` no ciclo anterior —
  **nenhum campo novo foi adicionado em `chats`**, evitando repetir o teto
  de complexidade de Rules do ciclo passado. O pedido resolvido é revalidado
  contra o tenant atual antes de qualquer variável ser preenchida (nunca
  confia só no id salvo no evento).

### Variáveis pendentes

Quando o template usa uma variável sem dado disponível: o texto entra no
compositor com o placeholder original intacto (`{{numero_pedido}}`, nunca
removido silenciosamente nem substituído por texto incorreto), um aviso
compacto aparece acima do campo de resposta listando cada pendência com a
origem esperada (ex.: "Nenhum pedido vinculado a esta conversa"), e a
equipe pode editar manualmente o texto ou cancelar o envio. **Trava final
antes do envio**: se a mensagem ainda contiver `{{variavel_da_whitelist}}`
literal quando o formulário for submetido, `enviarResposta` bloqueia o
envio com um erro claro — nunca deixa um identificador técnico sair pro
cliente.

## Gestão de templates

Modal próprio (`#atend-gestao-modal`), aberto pelo botão "Gerenciar
templates" dentro do seletor do compositor. Permissão **própria**
(`context.canEdit("templates")`) — diferente de `atendimento` (que só
deixa *usar* um template já existente numa conversa).

- Criar, editar, duplicar (novo id, novo `criadoPor`/`criadoEm` reais,
  `usoTotal` zerado, nunca herda o atalho original), ativar/desativar,
  arquivar/restaurar (nunca delete físico pela gestão nova).
- Busca por título/conteúdo/atalho/categoria; filtro por categoria; toggle
  "mostrar arquivados".
- Impede atalho vazio-de-símbolos, atalho duplicado entre templates ativos
  e não arquivados do mesmo tenant (`atalhoJaEmUso`), título/conteúdo
  vazios, limites de tamanho — tudo validado no cliente
  (`validarTemplateAtendimentoAvancado`) e de novo nas Rules.

### Favoritos: decisão de escopo

`favorito` é um campo **do template, compartilhado pela loja inteira** —
não é uma preferência individual por funcionário. Decisão deliberada: não
existe hoje nenhuma infraestrutura de preferência-por-usuário nesta
coleção (nem em nenhuma outra "resposta pronta" da base), e "respostas
prontas" já é conceitualmente um recurso de equipe, não uma caixa de
entrada pessoal — misturar preferência pessoal com dado canônico sem essa
infraestrutura pronta seria inventar uma segunda semântica no mesmo campo.

## Atalhos (`/`)

Digitar `/` no compositor abre sugestões filtradas pelo prefixo digitado
(`sugerirTemplatesPorAtalho`, só compara contra o que já está carregado em
memória — nunca executa nada). Navegação por `↑`/`↓`, `Enter` insere,
`Esc` fecha, foco volta pro campo de mensagem. Atalho é normalizado
(minúsculo, sem espaço, `[a-z0-9_-]`) tanto na gestão quanto na sugestão.

## Envio atômico e evento `template_utilizado`

`enviarResposta` (`atendimento.js`) já usava `writeBatch` desde o ciclo do
Histórico de Eventos; esta etapa **acrescenta ao mesmo batch**:

```js
// no mesmo commit atômico do envio da mensagem:
batch.update(doc(db, "templates", templateUsadoId), {
    usoTotal: increment(1),
    ultimoUsoEm: serverTimestamp()
});
```

- Só grava `template_utilizado` (evento) e só incrementa `usoTotal` quando
  a mensagem **realmente sai** — inserir e depois apagar/trocar de
  conversa nunca registra uso; falha no envio nunca registra uso (o batch
  inteiro não commita, então nem o evento nem o incremento acontecem).
- `template_utilizado` guarda só `templateId`, `templateTitulo` (snapshot),
  `mensagemId`, `clienteId` — nunca o conteúdo do template.
- Deduplicação: como o incremento e o evento vivem no mesmo `writeBatch`
  que a própria mensagem, um retry de rede refaz o batch inteiro (nova
  mensagem, novo evento, novo +1) — não existe hoje um mecanismo de
  idempotência de rede nesse nível (mesma limitação, aliás, de qualquer
  outro envio de mensagem desta Central; não é específica de templates).

### Integridade de `usoTotal` — caminho estreito nas Rules

Quem só tem permissão `atendimento` (não `templates`) precisa conseguir
completar o batch de envio, mesmo sem poder editar o conteúdo do template.
Solução: um segundo caminho de `update` nas Rules, só para esse uso
específico —

```
allow update: if criadoPorUnchanged() && (
    (canEditTenant(resource.data.criadoPor, "templates") && validTemplateData(request.resource.data))
    || (podeUsarTemplateAtendimento(resource.data.criadoPor) && templateUsoValido())
);
```

`templateUsoValido()` exige que a única mudança seja `usoTotal`+1 exato e
`ultimoUsoEm == request.time` — nada mais pode mudar nesse caminho (mesmo
padrão já usado para `naoLidasLoja` em `chats`). Isso é integridade real,
não segurança fingida: o valor é garantido pelo servidor, não por
confiança no cliente.

## Integração com CRM, pedidos e produtos

- Nome do cliente vem da conversa já identificada — nunca funde registros
  pelo nome, nunca expõe observação interna do CRM no texto do template.
- Pedido só é usado quando explicitamente vinculado (ver seção de
  variáveis acima); nunca escolhido por adivinhação.
- Produto de interesse/snapshot não entrou como variável nesta etapa (não
  havia um caso de uso claro pedido no mandato além do que já existe no
  CRM 360) — fica registrado como possível extensão futura.
- Nome da loja vem do contexto atual (`VideHubContext`); nome do
  funcionário vem do login autenticado — nunca de um campo de formulário.

## Permissões

| Ação | Permissão exigida |
|---|---|
| Ver/usar template numa conversa | `atendimento` (ver) **e** `templates` (ver) — a leitura da coleção `templates` já exigia isso antes desta etapa |
| Enviar mensagem com template (registra uso) | `atendimento` (editar) **ou** `leads` (editar) — caminho estreito, não precisa de `templates` (editar) |
| Criar/editar/duplicar/arquivar template | `templates` (editar) |
| Automação de leads (módulo genérico, campo `fluxo`) | `templates` (editar), inalterado |

Aliases inalterados: `atendimento` continua aceitando `conversas`,
`atendimento_chat`, `templates_atendimento`; `templates` continua sem
alias. Corrigido nesta etapa: `atendimento` e `crm` agora aparecem na tela
de gestão de acessos (`MODULOS_PERMISSAO`), então um dono finalmente
consegue conceder essas permissões a um funcionário pela UI — antes, só o
dono e o admin de backend alcançavam esses módulos na prática, mesmo com
Rules e controllers já prontos para funcionários.

## Firestore Rules

`validTemplateData` cresceu para aceitar os campos novos (todos opcionais,
`hasOnly`/`hasAny` — mesmo padrão de todo o resto da base), mais duas
funções pequenas: `categoriaTemplateAtendimentoValida` (enum fechado) e
`templateUsoValido`/`podeUsarTemplateAtendimento` (caminho estreito de
uso). Nenhuma mudança na regra de `chats` — a lição do ciclo anterior
("Unable to evaluate the expression as the maximum of 1000 expressions to
evaluate has been reached") foi levada a sério: a regra de `/templates/{id}`
era pequena e isolada antes desta etapa (confirmado por auditoria) e
continua pequena — 147/147 testes da suíte de Rules passando confirma que
não há sinal de regressão de performance/complexidade.

Bloqueado explicitamente: categoria fora do enum quando `contexto ==
"atendimento"`; `contexto` fora de `["atendimento","leads"]`;
`atualizadoPor` diferente de `request.auth.uid`; incremento de `usoTotal`
diferente de +1 exato; `ultimoUsoEm` que não seja `request.time`; qualquer
campo fora da whitelist junto do caminho de uso.

## Índices

**Nenhum índice novo foi necessário.** "Recentes" e "mais usados" são
derivados ordenando em memória os templates já carregados por
`criadoPor == tenant` (`ultimoUsoEm`/`usoTotal`, campos que já vivem no
próprio documento) — não precisam de `collectionGroup` nem de índice
composto. `firestore.indexes.json` não foi alterado.

## Interface

Modal de seleção no compositor: abas (Todos/Favoritos/Recentes/Mais
usados), busca, filtro de categoria, indicador de variáveis usadas por
template, indicador de atalho. Modal de gestão: lista com ações por item
(editar/duplicar/ativar-desativar/arquivar/restaurar/favoritar), formulário
com pré-visualização das variáveis suportadas no placeholder do textarea.
Mesma linguagem visual das outras centrais (escuro, sem emoji, ícones SVG).
Mobile: modais em tela cheia via o mesmo `.atend-cliente-modal` já usado
pelo painel de dados do cliente, sem overflow horizontal. Acessibilidade:
`aria-label`/`role="dialog"`/`role="tablist"`, `Escape` fecha os modais,
navegação por teclado nas sugestões de atalho.

## Testes

- `tests/templates-atendimento.test.mjs` (novo): **57 testes** — categorias,
  substituição de variáveis, valores de pedido, resolução + pendências,
  pedido vinculado derivado do histórico, atalhos, validação, visibilidade
  por contexto, filtro/ordenação, recentes/mais usados.
- `tests/atendimento.test.mjs`: 43 testes (era 56; os 13 testes de
  template antigos migraram para o arquivo novo, sem perda de cobertura).
- `tests/emulator/firestore-security.test.mjs`: **147 testes** (era 135) —
  12 novos cobrindo campos avançados, categoria fechada por contexto, e o
  caminho estreito de uso (incremento exato, autoria, bloqueio de outros
  campos, cross-tenant).
- `pnpm run check`: limpo. Suítes de regressão completas (central-ia 27,
  base-conhecimento 14, crm360 38, studio 34, functions 5, storage 5) —
  todas passando, sem nenhuma quebrada por esta etapa.
- Validação visual: Chromium headless (Playwright) confirmando presença de
  todos os elementos novos no DOM e zero erros de JavaScript próprios
  (erros de rede pro CDN do Firebase são esperados no ambiente isolado de
  teste, não relacionados ao código). Sem login Firebase real disponível
  neste ambiente — não é uma validação autenticada completa, registrado
  como limitação (mesmo padrão já usado nos ciclos anteriores).

## Limitações reais

- **Deduplicação de uso depende só da atomicidade do batch**, não de um
  mecanismo de idempotência de rede — um retry manual do usuário após um
  erro de rede específico (commit que teve sucesso no servidor mas cuja
  confirmação não chegou ao cliente) poderia, em teoria, contar duas vezes.
  Isso é uma limitação genérica de escrita otimista sem idempotency key,
  não específica de templates — mesma exposição que qualquer outro envio
  de mensagem desta Central já tinha antes desta etapa.
- **Favoritos são da loja, não por funcionário** (decisão documentada
  acima) — se um ciclo futuro precisar de preferência individual, vai
  exigir uma subestrutura nova (`templates/{id}/favoritos/{uid}` ou
  equivalente), não reaproveitar este campo.
- **`{{prazo_entrega}}` nunca resolve** até `pedidos` ganhar um campo
  canônico de prazo — depende da próxima fase (Pedidos Estruturados).
- **`{{numero_pedido}}` usa o id técnico do documento**, não um número
  amigável — não existe hoje um campo separado para isso.
- Sem teste de UI autenticado (Playwright + login Firebase real) neste
  ambiente — mesma limitação já registrada nos ciclos anteriores.

## Próxima fase

**Pedidos Estruturados e Vinculados ao Atendimento** — não implementada
neste ciclo, por instrução explícita do mandato.
