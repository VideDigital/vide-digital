# CRM 360 do Cliente (RD3)

Evolui a Central de Atendimento (coleção canônica `chats`) e reaproveita `leads`,
`pedidos` e `produtos` já existentes para dar à equipe uma visão 360° do cliente
dentro do painel de conversa — sem duplicar coleções, sem inventar dado e sem
mover nada de forma destrutiva.

## Fase 1 — Auditoria: o que já existe

### `chats/{chatId}` (id automático — ver `docs/CENTRAL_ATENDIMENTO.md`)

Campos hoje: `donoUID`, `emailDono`, `clienteNome`, `statusAdmin`, `status`, `canal`,
`setor`, `atribuidoPara`, `atribuidoPor`, `atribuidoEm`, `statusAtualizadoPor`,
`statusAtualizadoEm`, `observacoesInternas`, `tags`, `naoLidasLoja`, `naoLidasCliente`,
`timestamp`, `criadoEm`, `ultimaMensagem`, `atualizadoEm`.

**Não existe** telefone, e-mail nem qualquer id de cliente no chat — o widget público
(`loja.html`) só pede o nome. Isso é o motivo real de precisar de uma identidade
canônica (Fase 2): hoje não há nenhuma chave para cruzar uma conversa com um lead
ou pedido automaticamente.

### `chats/{chatId}/mensagens/{msgId}`

`texto`, `sender` (`cliente`/`admin`), `timestamp`, `criadoEm`, `autorTipo`, `autorUid`,
`autorNome`. Sem PII do cliente além do texto em si.

### `leads/{leadId}` (id automático, `lp-forms-v5.js` + `lead-engine-v5.js`)

Campos relevantes para o CRM: `criadoPor` (= tenant/`donoUID`), `nome`, `whatsapp`,
`telefone` (mesmo valor de `whatsapp`, **já normalizado** por `normalizePhone()` —
dígitos, com `55` prefixado quando o número tem 10/11 dígitos), `email` (**já
normalizado** — `trim().toLowerCase()`), `origem`, `produtoInteresse`, `statusLead`
(`novo|contato|convertido|perdido` — funil do lead, conceito **diferente** do
`statusRelacionamento` do cliente que este ciclo introduz), `prioridadeLead`,
`paginaOrigem`, `lojaOrigem`, `formularioId`, `data`/`criadoEm`, `utm*`, `leadScore`,
`temperaturaLead`, e campos mutáveis do painel: `funcionarioResponsavel`, `anotacao`,
`arquivado`, `lixeira`, `etiqueta`, `lembreteData`, `proximoContatoEm`.

Rule de update (`match /leads/{id}`) **não tem whitelist de campos** — só exige
`criadoPorUnchanged()` + `canEditTenant(..., "leads")`. Ou seja, adicionar um campo
novo (`clienteId`) num lead existente já é permitido pela regra atual, sem precisar
alterá-la.

### `pedidos/{id}` (id manual `ped_${Date.now()}`, `dashboard-app.js`)

Campos: `cliente` (**texto livre, não é FK**), `produtos` (**texto livre, não
referencia a coleção `produtos`**), `valor` (number), `status`
(`aguardando|confirmado|pago|cancelado`), `obs`, `criadoPor`, `data`.

Mesma observação da rule de `leads`: `update` não tem whitelist de campos, só
`criadoPorUnchanged()` + `canEditTenant(..., "pedidos")`.

**Achado importante**: como `cliente` e `produtos` são texto livre digitado à mão
no painel, não existe hoje NENHUMA chave (id, telefone, e-mail) que ligue um
pedido a um lead ou a uma conversa. Vínculo pedido↔cliente só pode ser manual
(busca por nome + confirmação humana) — é exatamente o que a Fase 3 pede.

### `produtos/{id}` (id automático)

`criadoPor`, `nome`, `preco`, `imagemB64`, `statusProduto` (`ativo|rascunho|...`).
Usado para "produtos de interesse" com snapshot (nome/preço no momento do vínculo).

### `funcionarios/{authUid}` / `usuarios/{authUid}`

Sem mudança neste ciclo — reaproveitados como já documentado em
`docs/VIDE_CONTEXT_ARCHITECTURE.md`: `donoUID`, `status`, `permissoes.{ver,editar}`
para funcionário; `status`, `plano`, `nomeLoja` para o dono/loja.

### Identificadores por coleção (resumo)

| Coleção | id do doc | tenant | pessoa (cliente) |
|---|---|---|---|
| `chats` | auto | `donoUID`/`emailDono` | só `clienteNome` (sem telefone/e-mail hoje) |
| `leads` | auto (`leadId`) | `criadoPor` | `nome`, `telefone`/`whatsapp` (normalizado), `email` (normalizado) |
| `pedidos` | `ped_<timestamp>` | `criadoPor` | `cliente` (texto livre, sem id) |
| `produtos` | auto | `criadoPor` | não aplicável |
| `funcionarios` | `authUid` | `donoUID` | não aplicável (é a equipe, não o cliente) |

### Conclusão da auditoria

Não existe hoje nenhuma chave compartilhada entre `chats`, `leads` e `pedidos` —
são três ilhas de dado. Ligar as três par-a-par (chat↔lead, chat↔pedido,
lead↔pedido) exigiria 3 tipos de vínculo bidirecional. Por isso a Fase 8 decidiu
criar uma coleção canônica mínima `clientes/{clienteId}` como HUB: cada registro
(chat/lead/pedido) ganha um campo opcional `clienteId` apontando para o mesmo hub,
em vez de uma malha de links cruzados. Ver detalhes na seção "Identidade canônica"
abaixo.

## Fase 2 — Identidade canônica

`crm360.js` implementa a ordem de prioridade exigida, nunca usando só o nome:

```
clienteId explícito > authUid > leadId vinculado > pedidoId vinculado
  > telefoneNormalizado > emailNormalizado > "nenhuma" (sem correspondência)
```

`normalizarTelefone()`/`normalizarEmail()` **espelham exatamente**
`normalizePhone()`/`normalizeEmail()` de `lp-forms-v5.js` — é por isso que dá pra
comparar contra `leads.telefone`/`leads.whatsapp`/`leads.email` sem precisar
migrar nenhum lead existente (eles já foram gravados nesse formato).

`encontrarCorrespondencias()` busca candidatos por `authUid` primeiro (desempate
forte); se não achar, tenta telefone/e-mail normalizados. Se mais de um candidato
distinto bater por telefone/e-mail, o resultado vem marcado `ambiguo: true` — a
UI mostra os candidatos e pede confirmação humana, nunca escolhe sozinha.

### Por que `pedidos` quase nunca casa automaticamente

`pedidos.cliente` é texto livre (achado da Fase 1) — não tem telefone nem e-mail
hoje. Por isso a vinculação de pedido é sempre **manual** (busca por nome +
confirmação), nunca automática. Documentado como limitação conhecida abaixo.

## Fase 8 — Coleção `clientes/{clienteId}` (decisão)

Criada porque não havia nenhuma chave compartilhada entre `chats`/`leads`/`pedidos`
(Fase 1). Id automático. Nenhum dado existente foi movido ou apagado — a coleção
só passa a existir quando a equipe abre o CRM de uma conversa pela primeira vez
(criação lazy) ou vincula algo manualmente.

```js
// clientes/{clienteId}
{
  tenantId: "{storeUid}",
  lojaId: "{storeUid}",
  nome: "até 160",
  telefone: "como a equipe digitou (exibição)",
  telefoneNormalizado: "dígitos, formato normalizarTelefone()",
  email: "como a equipe digitou (exibição)",
  emailNormalizado: "formato normalizarEmail()",
  authUid: "opcional — hoje quase nunca preenchido (sem Anonymous Auth ativo)",
  origem: "até 120 (opcional)",
  statusRelacionamento: "novo|lead|qualificado|negociacao|cliente|recorrente|inativo|perdido",
  statusAtualizadoPor: "{authUid}",
  statusAtualizadoEm: number,
  responsavelUid: "{authUid do dono ou funcionário} | \"\"",
  tags: ["slugs, até 15"],
  produtosInteresse: [{ produtoId, nomeSnapshot, precoSnapshot, vinculadoEm, vinculadoPor, origem }], // até 20
  primeiraInteracaoEm: number,
  ultimaInteracaoEm: number,
  criadoEm: number,
  criadoPor: "{authUid}",       // imutável
  atualizadoEm: number,
  atualizadoPor: "{authUid}",
  arquivadoEm: number | null
}
```

Subcoleções (append-only onde faz sentido):

```js
// clientes/{clienteId}/observacoes/{obsId}
{ conteudo: "1–2000", autorUid, autorNome, criadoEm, atualizadoEm, arquivado: bool }

// clientes/{clienteId}/eventos/{eventoId} — timeline, create-only
{ tipo: "...", categoria: "conversas|leads|pedidos|alteracoes", resumo, autorUid,
  autorNome, criadoEm, origem, refColecao, refId }
```

**Vínculo simplificado**: em vez de uma terceira subcoleção `vinculos`, o vínculo
em si é só o campo `clienteId` gravado no doc de origem (`chats`, `leads` ou
`pedidos`). "Reversível" = desvincular é só limpar esse campo (`clienteId: ""`).
Quem vinculou/desvinculou fica registrado como um evento em
`clientes/{clienteId}/eventos` (`lead_vinculado`, `pedido_vinculado`) — isso já
cobre "registrar autor e timestamp" sem duplicar o dado numa terceira coleção.

### Catálogo de tags por loja

```js
// tags_clientes/{tagId}
{ tenantId, nome: "até 40", slug, ativo: bool, criadoEm, criadoPor }
```

`slugTag()` normaliza (minúsculo, sem acento, hífen) antes de comparar — evita
"VIP" e "vip " virarem duas tags diferentes.

## Fase 3 — Perfil 360 (controller)

`criarCrm360Controller()` (mesmo padrão de `atendimento.js`) abre a partir de
uma conversa (`abrirParaConversa(conversa)`) ou direto por id (usado pelas
notificações — `abrirParaClienteId(clienteId)`). Sempre que abre:

1. Se a conversa já tem `clienteId`, carrega o hub e os relacionados.
2. Senão, tenta achar candidatos por telefone/e-mail (se a equipe já os tiver
   preenchido na conversa) via `encontrarCorrespondencias()` — mostra "cliente
   não identificado", com ação de cadastrar novo ou vincular a um candidato.
3. Carrega leads/pedidos/conversas relacionados com `where("clienteId","==",id)`
   (nunca a coleção inteira do tenant), observações e eventos da subcoleção,
   catálogo de tags e funcionários elegíveis para responsável.

Seções 3 e 4 (leads/pedidos) também têm um campo de busca "vincular existente"
com debounce de 300ms, que procura por nome dentro do próprio tenant, limitado
a 200 registros e sem `clienteId` ainda — resultado sempre em memória, sem
nova coleção de índice.

## Fase 4 — Status do relacionamento

`STATUS_RELACIONAMENTO`: `novo → lead → qualificado → negociacao → cliente →
recorrente`, mais `inativo`/`perdido`. Não há grafo de transição obrigatório
(o enum é validado, mas qualquer transição entre estados é permitida) — a
mudança em si sempre é uma ação explícita da equipe (select na seção
Identidade). `sugerirStatusRelacionamento()` só sugere (nunca aplica sozinho):
1+ pedido pago sugere "cliente", 2+ sugere "recorrente", 60+ dias sem
interação (para quem já é cliente/recorrente) sugere "inativo". Pedido
cancelado **não** sugere "perdido" automaticamente. Cada mudança grava
`statusAtualizadoPor`/`statusAtualizadoEm` no próprio `clientes/{id}` e um
evento `status_alterado` na timeline com o resumo "Status anterior → Status
novo".

## Fase 5 — Responsável

Dois responsáveis distintos e independentes, como pedido:
- `chats.atribuidoPara` — responsável **pela conversa** (Central de
  Atendimento, já existia).
- `clientes.responsavelUid` — responsável **comercial pelo cliente** (novo,
  CRM 360).

Mesma validação dos dois lados (Rules + `funcionarioPodeAtender()` reaproveitado
de `atendimento.js`, não duplicado): funcionário precisa estar `ativo`, do
mesmo tenant, com permissão em `atendimento`/`leads`/`crm`. Bloqueia uid
arbitrário, funcionário inativo e funcionário de outro tenant.

## Fase 6 — Produtos de interesse

Array `produtosInteresse` (até 20 itens) direto no `clientes/{id}` — não é
subcoleção nem referencia o pedido. Cada item é um snapshot no momento do
vínculo (`nomeSnapshot`, `precoSnapshot`) — **nunca** usado como preço oficial
de um pedido futuro (o pedido continua com seu próprio campo `valor`). Busca
de produto é por nome, dentro do próprio tenant, com o mesmo padrão de busca
por texto usado em leads/pedidos.

## Fase 7 — Linha do tempo

`clientes/{id}/eventos` é append-only (Rules bloqueiam update/delete). Tipos
registrados nesta etapa: `primeiro_contato`, `lead_vinculado`,
`pedido_vinculado`, `tag_adicionada`, `tag_removida`, `status_alterado`,
`responsavel_alterado`, `observacao_adicionada`, `produto_vinculado`. Cada
evento tem categoria (`conversas`/`leads`/`pedidos`/`alteracoes`) para o
filtro da UI. Não guarda o corpo de mensagens (só um resumo curto) — histórico
de mensagens continua vivendo em `chats/{id}/mensagens`, sem duplicação.

## Fase 9 — Interface

O antigo modal pequeno "Dados do cliente" (nome/canal/setor/notas/tags **da
conversa**, ciclo anterior) virou o drawer do CRM 360 — mesma linguagem
visual das outras centrais, agora um painel lateral amplo (560px, tela cheia
no mobile) com seções: Identidade, Resumo comercial, Leads, Pedidos,
Conversas, Produtos de interesse, Observações internas, Linha do tempo.
Estados cobertos: carregando, cliente não identificado, correspondência
ambígua (aviso amarelo com os candidatos), vazio por seção (nunca
"undefined"), erro de carregamento com toast.

## Fase 10 — Permissões

Chave canônica **`crm`**; aliases: `clientes`, `crm-360`, `crm_360`,
`observacoes_clientes`, `tags_clientes`. Como o CRM só é alcançável de dentro
de uma conversa da Central de Atendimento, `podeVerCRM`/`podeEditarCRM`
sempre aceitam quem já tem permissão em `atendimento` OU a permissão dedicada
`crm` — a arquitetura atual não separa "visualizar CRM" de "visualizar
atendimento" na navegação (limitação assumida, ver abaixo). Dentro do CRM já
aberto, o modelo continua ver/editar grosso (não há "ver contato" sem "ver
valores" como permissões distintas — mandato pediu separar "conforme a
arquitetura atual", que hoje é só ver/editar por módulo).

## Fase 12 — Consultas e índices

Todas as queries novas filtram por **um único campo igualdade** (`tenantId`,
`clienteId` ou `criadoPor`) com `limit()` — nenhuma combina `where` em mais de
um campo nem usa `orderBy` num campo diferente do filtro, então **nenhum
índice composto novo foi necessário** (verificado rodando as queries reais
no emulador via `pnpm run test:rules`, que teria acusado "index required" se
precisasse). `firestore.indexes.json` não foi alterado nesta etapa.

## Fase 13 — Notificações

Ver `docs/CENTRAL_ATENDIMENTO.md` (seção Notificações) para o padrão geral.
O CRM adiciona a fonte "cliente sem retorno" (status cliente/recorrente + 60+
dias sem interação), com `criadoEm` fixado no momento exato em que o limite
foi cruzado — não "agora" (senão nunca marcaria como lida) nem a última
interação (senão nasceria como já lida). `ultimaInteracaoEm` é atualizada
quando a equipe responde uma conversa vinculada a um cliente; **não** é
atualizada quando o cliente escreve pela loja pública (o widget não conhece
o CRM) — limitação registrada abaixo.

## Fase 14 — Métricas

Os KPIs do resumo comercial (`calcularResumoComercial`) e os dados por trás da
notificação "sem retorno" já são números reais derivados de pedidos/clientes
do próprio tenant. Não foi criado um dashboard comercial separado nesta etapa
— os números vivem dentro do próprio drawer do CRM, por cliente.

## Fase 10 (ciclo seguinte) — Espelho no histórico da conversa

O ciclo "Histórico de Eventos do Atendimento" adicionou `chats/{chatId}/eventos`
como uma timeline por conversa (independente desta, `clientes/{id}/eventos`,
que continua sendo a timeline por cliente). Quando o CRM 360 é aberto a
partir de uma conversa (`abrirParaConversa`), vincular/desvincular cliente,
lead, pedido ou produto passa a gravar um evento em **ambas** as
subcoleções — ligadas por `correlationId`, nunca uma cópia da outra. Ver
`docs/HISTORICO_EVENTOS_ATENDIMENTO.md` (Fase 10) para o detalhe completo.

## Limitações conhecidas

- **CRM só é alcançável de dentro do Atendimento**: um funcionário com
  permissão `crm` mas sem `atendimento` teoricamente passaria nas Rules, mas
  não tem hoje nenhum botão de UI para chegar lá (o botão "Dados do cliente"
  vive dentro da Central de Atendimento). Corrigir exigiria uma entrada de
  navegação própria para o CRM.
- **`ultimaInteracaoEm` só avança quando a equipe responde pelo painel**;
  mensagens do cliente pela loja pública não atualizam esse campo (o widget
  público não tem noção de `clienteId`/CRM). Isso pode fazer o alerta de
  "sem retorno" disparar cedo demais num cliente que só está esperando
  resposta.
- **Correspondência automática exige telefone/e-mail já digitados na
  conversa**: como o widget da loja não pede telefone/e-mail ao cliente, a
  maioria das conversas novas cai em "cliente não identificado" até a equipe
  preencher esses campos manualmente ou vincular/cadastrar na mão.
- **Vínculo de pedido é sempre manual**: `pedidos.cliente`/`pedidos.produtos`
  continuam texto livre (achado da Fase 1); não há como cruzar
  automaticamente por telefone/e-mail.
- **"Produtos mais comprados"** é uma contagem por texto idêntico do campo
  `pedidos.produtos` (não por `produtoId`) — só fica preciso se a equipe
  digitar o pedido de forma consistente.
- Sem testes de UI automatizados (Playwright) cobrindo o fluxo completo de
  login real neste ciclo (mesma limitação já registrada em
  `docs/CENTRAL_ATENDIMENTO.md`) — verificação foi por 38 testes unitários de
  lógica pura (`tests/crm360.test.mjs`), pela suíte de Rules (121 testes) e
  por inspeção de DOM/console num Chromium headless local.

## Próximas fases sugeridas

1. Estruturar `pedidos.itens`/`pedidos.produtoId` (hoje texto livre) para
   permitir "produtos mais comprados" e "produtos de interesse ↔ pedido real"
   precisos, sem depender de correspondência de texto.
2. Entrada de navegação própria para o CRM (hoje só alcançável de dentro de
   uma conversa), destravando a permissão `crm` isolada de `atendimento`.
3. Ativar Firebase Anonymous Auth no widget público (já listado como bloqueio
   externo em `docs/ROADMAP_RD3_STATUS.md`) para permitir correspondência por
   `authUid` desde o primeiro contato, reduzindo o volume de "cliente não
   identificado".
