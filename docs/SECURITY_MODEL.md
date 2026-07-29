# Modelo de segurança — Vide Hub

Visão geral de como o isolamento multi-tenant e as permissões funcionam hoje,
com foco no que o CRM 360 (RD3) adicionou. Para o detalhe de cada módulo, ver
a documentação específica linkada em cada seção.

## Identidade

- **Dono/tenant** = uid do Firebase Auth do dono da loja (`storeUid`). Todo
  documento pertence a um tenant através de um campo — historicamente
  `criadoPor`/`donoUID` (produtos, leads, pedidos, templates, chats) e, nos
  módulos mais recentes, `tenantId`/`lojaId` explícitos (Base de Conhecimento,
  Central de IA, CRM 360). Nunca há dois tenants lendo/escrevendo o mesmo
  documento.
- **Funcionário** = conta Auth própria + documento `funcionarios/{authUid}`
  com `donoUID` (a quem pertence), `status` (`ativo`/`inativo`) e
  `permissoes.{ver,editar}` (lista de módulos; `editar` implica `ver`).
  Detalhe completo em `docs/VIDE_CONTEXT_ARCHITECTURE.md`.
- **Admin de backend** = claim `videAdmin: true` emitida fora do cliente
  (`scripts/set-admin-claim.mjs`) — nunca derivada de uma coleção
  editável pelo próprio cliente.
- **Visitante público** (loja, LP) — leads/avaliações continuam sempre
  anônimos/não autenticados, validados campo a campo pelas Rules
  (`leadPublicoValido()`, `avaliacaoPublicaValida()`), nunca por confiança no
  cliente. O **chat público** evoluiu (ver
  `docs/ANONYMOUS_AUTH_CHAT_PUBLICO.md`): chats novos passam a exigir
  **Firebase Anonymous Auth** — `visitorUid == request.auth.uid` — em vez de
  só "conhecer o id do documento"; chats criados antes dessa etapa continuam
  pelo contrato legado (`chatPublicoValido()`), mas nunca voltam a aceitar
  escrita pública sem identidade uma vez que nasceram com `visitorUid`.

## Permissões por módulo

Cada módulo tem uma chave canônica (`produtos`, `leads`, `pedidos`,
`templates`, `central-ia`, `base-conhecimento-ia`, `atendimento`, `crm`, ...)
com aliases mapeados em `core/vide-context.js` (frontend) e espelhados em
`employeeHasModulePermission()` (`firestore.rules`) — os dois precisam ficar
em sincronia sempre que um módulo novo é criado. `canViewTenant`/
`canEditTenant` decidem acesso: dono sempre pode, funcionário ativo com
permissão no módulo pode, admin backend sempre pode, qualquer outro caso é
negado.

O CRM 360 reaproveita a permissão `atendimento` (além da dedicada `crm`)
porque hoje só é alcançável de dentro de uma conversa já aberta — ver a
limitação registrada em `docs/CRM_360_CLIENTE.md`.

O Copiloto de IA do Atendimento (`ia-copilot`, ver
`docs/IA_COPILOT_ATENDIMENTO.md`) é o oposto desse padrão de propósito:
NÃO é alias de `atendimento` nem herdado por quem já pode responder
conversas — é uma permissão própria que o dono precisa conceder à parte.
`podeUsarIaCopilot(chatData)` em `firestore.rules` exige as duas coisas ao
mesmo tempo (`podeResponderChat` **e** `canEditTenant(tenantId,
"ia-copilot")`), então um funcionário com atendimento mas sem a concessão
explícita nunca grava um evento `ia_sugestao_usada`/`ia_sugestao_descartada`
— e a UI nem mostra o toggle do painel pra esse funcionário.

Achado do ciclo "Templates Avançados de Atendimento": `atendimento` e `crm`
tinham Rules e controllers prontos há ciclos, mas nunca apareciam na tela
de gestão de acessos do dono (`MODULOS_PERMISSAO`, `dashboard-app.js`) —
nenhum funcionário conseguia receber essas permissões pela UI, só o dono e
o admin de backend alcançavam esses módulos na prática. Corrigido no mesmo
ciclo (a lista de módulos exibidos, não a lógica de permissão em si).
Templates também ganhou um segundo eixo de permissão nesse ciclo: `templates`
(editar) continua exigido pra gerenciar (criar/editar/arquivar), mas
`atendimento` (editar) ou `leads` (editar) já bastam pra *usar* um template
numa conversa e registrar `usoTotal` — via um caminho de Rules estreito que
só aceita esse incremento específico, nunca o conteúdo do template. Ver
`docs/TEMPLATES_ATENDIMENTO_AVANCADOS.md`.

## Isolamento entre tenants

Toda leitura/escrita valida o campo de tenant do documento contra o
`request.auth`/contexto do funcionário — nunca contra um valor vindo do
cliente sem checagem. Vínculos entre coleções (ex.: `clienteId` em
`chats`/`leads`/`pedidos`) sempre confirmam, do lado do servidor, que o
documento referenciado pertence ao MESMO tenant antes de aceitar a escrita
(`clienteIdValidoParaTenant()`) — nunca apenas no cliente.

## Autoria e timestamps confiáveis

Onde autoria importa (mensagens de atendimento, observações do CRM, eventos
da timeline, templates, base de conhecimento), a regra exige
`autorUid == request.auth.uid` — nunca um nome/uid vindo de um campo de
formulário. Onde o momento importa para decisões de segurança (criação de
cliente, observação, evento, tag), a regra exige `== request.time` (timestamp
do servidor), não um `Date.now()` do cliente — módulos mais antigos (chats)
usam `Date.now()` do cliente por compatibilidade com o widget existente, uma
escolha registrada em `docs/CENTRAL_ATENDIMENTO.md`.

## Registros imutáveis vs. editáveis vs. append-only

- **Imutável após criação**: `criadoPor`, `criadoEm`, `tenantId`/`lojaId` em
  praticamente todos os módulos novos (checado via `diff().affectedKeys()`).
- **Editável com histórico de quem mudou**: status de conversa, status de
  relacionamento do cliente, atribuição/responsável — sempre gravam
  `...AtualizadoPor`/`...AtualizadoEm` junto com o novo valor.
- **Append-only, sem update/delete**: `clientes/{id}/eventos` (timeline do
  CRM), `chats/{id}/eventos` (histórico da conversa — ver
  `docs/HISTORICO_EVENTOS_ATENDIMENTO.md`) e mensagens de chat
  (`chats/{id}/mensagens`) — nunca se edita o passado, só se acrescenta um
  novo registro.
- **"Exclusão" é sempre lógica**: arquivar observação, arquivar item da base
  de conhecimento, tag `ativo: false` — delete físico é bloqueado
  (`allow delete: if false`) em todas as coleções onde histórico importa.

## Escopo de leitura pública

Só três exceções permitem leitura sem autenticação, todas com escopo
estreito e documentadas: a loja pública (`vitrines_publicas`, `landing_pages_*`),
avaliações publicadas, e a capability de leitura de mensagens de chat **V1
legado** por quem conhece o id aleatório do próprio chat (visitante que
acabou de conversar) — nunca listagem, sempre um documento específico já
conhecido. Chats **V2** (Anonymous Auth, ver
`docs/ANONYMOUS_AUTH_CHAT_PUBLICO.md`) não entram nesta exceção: a leitura
exige `request.auth` real (anônimo) com `visitorUid` batendo — o id sozinho
não abre mais um chat novo.

## O que ainda não está aqui

- IA real (nenhum provedor externo é chamado; nenhuma chave no frontend).
- **WhatsApp Oficial V1 em produção** — o código está pronto (Fase A:
  webhook com assinatura HMAC validada, token por tenant no Secret
  Manager, janela de 24h server-autoritativa, ver
  `docs/WHATSAPP_OFICIAL.md`), mas nenhuma conexão real com a Meta foi
  configurada (Fase B, depende do usuário: App, WABA, secrets, deploy
  dedicado, piloto).
- **Auditoria Centralizada V1 em produção** — o código está pronto (Fase A:
  15 Firestore triggers server-side com Auth Context, Central de Auditoria
  owner-only no dashboard, ver `docs/AUDITORIA_CENTRALIZADA.md`), mas os
  triggers ainda não foram publicados nem testados com dados reais de
  produção (Fase B, depende de confirmação do usuário). Até lá, continua
  valendo o que já existia por escopo: `chats/{id}/eventos` (por conversa) e
  `clientes/{id}/eventos` (por cliente) — nenhum dos dois é um log
  centralizado entre tenants/módulos, que é exatamente a lacuna que a
  Auditoria Centralizada fecha.

Cloud Functions continuam reservadas para quando existir segredo real,
integração externa, operação administrativa privilegiada, rate limit
confiável ou processamento assíncrono — nada disso foi introduzido no ciclo
do CRM 360.
