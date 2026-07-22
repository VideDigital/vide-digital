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
