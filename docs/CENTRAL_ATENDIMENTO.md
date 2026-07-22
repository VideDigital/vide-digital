# Central de Atendimento (RD3)

Inbox nativa de atendimento ao cliente. Evolui as coleções `chats`/`mensagens` já
existentes (widget público da loja + painel de leads) — não cria um segundo modelo
de conversa. Plano Blaze, mas a escrita continua direta do cliente protegida pelas
Rules: nenhum segredo, integração externa ou operação administrativa privilegiada
está envolvida aqui.

## Arquivos

- `atendimento.js` — constantes (status, canais), lógica pura testável
  (transições de status, filtros, contadores, elegibilidade de atribuição) e
  o controller da tela (`db`/`context`/`firestore`/`notify` por injeção,
  mesmo padrão de `central-ia.js`/`base-conhecimento-ia.js`). Modelo,
  categorias e variáveis de template moraram aqui até o ciclo "Templates
  Avançados de Atendimento", quando evoluíram para `templates-atendimento.js`
  (companion module, mesmo padrão de `crm360.js`).
- `atendimento.css` — layout de 3 colunas no desktop, navegação em etapas no mobile
  (`data-atend-etapa="filtros|lista|conversa"`), mesma família visual das outras centrais.
- `dashboard.html` — seção `#view-atendimento`, botão da sidebar e card do Hub
  (`data-module-permission="atendimento"`), modal de dados do cliente, modal de
  inserção de template.
- `dashboard-app.js` — instancia o controller, liga a `ativarAba('view-atendimento')`,
  corrige a autoria da resposta do painel de leads (`enviarRespostaChatLead`) e adiciona
  a fonte de notificação "atendimento".
- `loja.html` — o widget público passa a gravar `status`/`canal`/`naoLidasLoja`.
- `firestore.rules` — `statusConversaValido`, `chatPublicoValido/UpdatePublicoValido`,
  `podeResponderChat/podeVerChat`, `mensagemClienteValida/AdminValida`,
  `funcionarioAtivoDoTenant`, `atribuicaoChatValida`, `chatAdminUpdateValido`,
  `validTemplateData` + `match /chats/{chatId}` (e subcoleção `mensagens`).
- `tests/atendimento.test.mjs` — 52 testes unitários de lógica pura (inclui o
  histórico de eventos, ver `docs/HISTORICO_EVENTOS_ATENDIMENTO.md`).
- `tests/emulator/firestore-security.test.mjs` — suítes de chats/mensagens/templates
  para a Central de Atendimento.

## Coleção `chats/{chatId}` (id automático)

```js
{
  donoUID: "{storeUid}",         // ou emailDono (contrato legado, ambos aceitos)
  emailDono: "{storeUid}",
  clienteNome: "até 120",
  statusAdmin: "pendente" | "respondido",   // contrato legado, mantido
  status: "nova" | "aberta" | "aguardando_cliente" | "aguardando_equipe" | "resolvida" | "arquivada",
  canal: "loja_publica" | "interno" | "whatsapp_futuro",
  setor: "até 80 (opcional)",
  atribuidoPara: "{authUid do dono ou funcionário} | \"\"",
  atribuidoPor: "{authUid}",
  atribuidoEm: number,
  statusAtualizadoPor: "{authUid}",
  statusAtualizadoEm: number,
  observacoesInternas: "até 2000 (nunca exposta na loja pública)",
  tags: ["até 10"],
  naoLidasLoja: number,           // incrementado via increment() a cada mensagem do cliente
  naoLidasCliente: number,
  timestamp: number,
  criadoEm: number,
  ultimaMensagem: "string",
  atualizadoEm: number
}
```

### Subcoleção `chats/{chatId}/mensagens/{msgId}` (id automático)

```js
{
  texto: "1–4000 caracteres",
  sender: "cliente" | "admin",
  timestamp: number,
  criadoEm: number,
  autorTipo: "cliente" | "funcionario" | "proprietario",
  autorUid: "{authUid}",          // só em mensagens 'admin'; sempre == request.auth.uid
  autorNome: "até 120 (opcional)" // derivado do funcionário/dono autenticado, nunca de um campo de formulário
}
```

`autorUid`/`autorTipo`/`autorNome` nunca vêm de um `<input>` — o controller e
`enviarRespostaChatLead` sempre os derivam de `VideHubContext.getSnapshot()`.

## Transições de status

```
nova → aberta | arquivada
aberta → aguardando_cliente | aguardando_equipe | resolvida | arquivada
aguardando_cliente → aguardando_equipe | aberta | resolvida | arquivada
aguardando_equipe → aguardando_cliente | aberta | resolvida | arquivada
resolvida → aberta | arquivada
arquivada → aberta   (reabrir é a única saída)
```

`arquivada` nunca recebe mensagem nova (nem de cliente nem de admin) sem reabrir
antes — validado nas Rules (`chatNaoArquivado`) e no controller. `podeTransicionarStatus`
(`atendimento.js`) espelha exatamente esse grafo do lado do app.

## Templates e variáveis

A Central de Atendimento reaproveita a coleção `templates` já existente (mesma
usada pelo módulo "Templates" e pelos templates de automação de leads com o
campo `fluxo`). Desde o ciclo "Templates Avançados de Atendimento" isso
evoluiu para um módulo próprio (`templates-atendimento.js`) com categorias
fechadas, atalhos, favoritos, gestão completa (criar/editar/duplicar/
arquivar) e 8 variáveis (`{{nome_cliente}}`, `{{nome_loja}}`,
`{{nome_funcionario}}`, `{{numero_pedido}}`, `{{status_pedido}}`,
`{{valor_pedido}}`, `{{data_pedido}}`, `{{prazo_entrega}}`) com detecção de
pendência e trava contra envio de variável não resolvida — ver
`docs/TEMPLATES_ATENDIMENTO_AVANCADOS.md` para o modelo completo.
Substituição continua por regex determinística, sem `eval`, sem HTML
executado; qualquer `{{variavel}}` fora da whitelist passa direto, sem virar
dado.

## Atribuição

`atribuicaoChatValida()` (Rules) só aceita `atribuidoPara` vazio, o próprio dono,
ou um `funcionarios/{uid}` que seja `status == "ativo"`, do mesmo `donoUID`, e
com permissão `atendimento` ou `leads` (ver ou editar). `funcionarioPodeAtender()`
(`atendimento.js`) faz a mesma checagem no cliente para não oferecer uma opção
que a regra vai recusar.

## Permissões

Chave canônica **`atendimento`**; aliases aceitos (frontend e Rules): `conversas`,
`atendimento_chat`, `templates_atendimento` — além disso, qualquer funcionário com
permissão em `leads` também pode ver/responder chats (o painel de leads e a Central
de Atendimento compartilham o mesmo dado).

| Papel | Acesso |
|---|---|
| Dono | ver + responder + mudar status + atribuir + ver dados do cliente |
| Backend admin (claim) | ver + responder (independente do tenant) |
| Funcionário ativo com "ver" atendimento/leads | lê conversas e mensagens, não responde nem muda status |
| Funcionário ativo com "editar" atendimento/leads | ver + responder + mudar status + atribuir |
| Funcionário inativo / sem permissão | bloqueado (módulo invisível) |
| Outro tenant / anônimo autenticado sem vínculo | bloqueado — só o visitante anônimo que criou o chat lê aquela conversa específica (capability pelo id) |

## Notificações

`carregarEventosNegocioNotificacoes()` (`dashboard-app.js`) ganhou uma fonte
`atendimento`, derivada do estado atual das conversas do tenant (`status == "nova"`
ou `"aguardando_equipe"`) — mesmo padrão usado para leads/pedidos/avaliações, sem
coleção de eventos nem Cloud Function. Clicar chama
`abrirConversaAtendimentoPorNotificacao(id)`, que abre a Central de Atendimento e
só seleciona a conversa depois de confirmar que ela pertence às conversas já
carregadas do tenant atual — nunca aceita um id arbitrário da URL/payload.

## Histórico de eventos

Desde o ciclo "Histórico de Eventos do Atendimento", cada conversa tem uma
subcoleção append-only `chats/{chatId}/eventos` com tudo que acontece nela
(mensagem, mudança de status, atribuição/transferência, prioridade, vínculos,
template usado) — ver `docs/HISTORICO_EVENTOS_ATENDIMENTO.md` para o modelo
completo, o enum de tipos e a decisão de manter métricas derivadas em runtime
em vez de campos agregados em `chats`.

## Limitações conhecidas

- Notificações continuam derivadas do estado atual do chat, não do histórico
  de eventos: "conversa atribuída", "transferência" e "conversa reaberta" não
  geram avisos distintos (ficam cobertos pelo estado geral "precisa de
  resposta"). O histórico de eventos já existe (ver seção acima) mas usá-lo
  pra notificações mais ricas exigiria um índice composto novo — registrado
  como próxima prioridade em `docs/HISTORICO_EVENTOS_ATENDIMENTO.md`.
- ~~O painel de dados do cliente mostra o que já está na própria conversa~~ —
  **resolvido no ciclo do CRM 360**: o botão "Dados do cliente" agora abre o
  drawer completo (identidade, resumo comercial, leads/pedidos/conversas
  relacionados, produtos de interesse, observações e timeline). Ver
  `docs/CRM_360_CLIENTE.md`.
- ~~`{{numero_pedido}}` existe na whitelist mas não é preenchido
  automaticamente~~ — **resolvido no ciclo "Templates Avançados de
  Atendimento"**: quando há um pedido explicitamente vinculado à conversa,
  `{{numero_pedido}}`/`{{status_pedido}}`/`{{valor_pedido}}`/`{{data_pedido}}`
  resolvem de verdade; sem vínculo, ficam pendentes (nunca escondidas nem
  preenchidas com dado incorreto). Ver `docs/TEMPLATES_ATENDIMENTO_AVANCADOS.md`.
- ~~Templates de atendimento continuam sem categorias fechadas nem ações de
  duplicar/arquivar~~ — **resolvido no mesmo ciclo**: categorias fechadas,
  atalhos, favoritos e gestão completa (criar/editar/duplicar/arquivar/
  restaurar), sem quebrar o módulo genérico "Templates" nem a automação de
  leads que compartilha a mesma coleção.
- Testes de UI automatizados (Playwright) não cobrem o fluxo de login real
  neste ciclo (ambiente sem acesso de rede ao Firebase); a verificação de UI
  foi por inspeção de DOM/ausência de erros de console num Chromium headless
  local, mais os 27 testes unitários de lógica pura e as suítes de Rules.
