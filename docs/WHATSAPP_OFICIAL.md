# WhatsApp Oficial V1

Integração com o WhatsApp Business Cloud API oficial da Meta, dobrada por
inteiro dentro da Central de Atendimento já existente (`chats/{chatId}`,
`chats/{chatId}/mensagens`, `chats/{chatId}/eventos`, CRM 360, atribuição,
status, notificações, permissões) — nunca um segundo modelo de
chat/CRM/atendimento. O placeholder reservado `canal: "whatsapp_futuro"`
vira `canal: "whatsapp"` real; `loja_publica`/`interno`/`whatsapp_futuro`
continuam funcionando sem alteração.

**Status desta entrega (Fase A)**: código completo, testado localmente e em
CI real. Conexão real com a Meta depende de configuração externa (Fase B,
fora deste repositório) — ver checklist no fim deste documento.

## Fontes oficiais consultadas

`developers.facebook.com` retornou 403 Forbidden a `WebFetch` neste
ambiente de desenvolvimento (duas tentativas: `/docs/graph-api/changelog`
e `/docs/graph-api/guides/versioning/`) — um bloqueio de rede do sandbox,
não uma indisponibilidade real da Meta. A versão da Graph API usada aqui
(`v21.0`, centralizada em `functions/src/whatsapp/constants.js` como
`WHATSAPP_GRAPH_VERSION`) foi determinada por busca indireta (`WebSearch`),
com evidência razoável de que é uma versão corrente, mas **sem
confirmação direta na documentação oficial**. Antes de qualquer deploy
real (Fase B), reconfirme a versão vigente em
`https://developers.facebook.com/docs/graph-api/changelog` e ajuste
`WHATSAPP_GRAPH_VERSION` se necessário — é a única constante que precisa
mudar.

Permissões usadas (`whatsapp_business_messaging`, `whatsapp_business_management`)
são escopos estáveis e amplamente documentados há várias versões da API —
alta confiança mesmo sem acesso direto à doc nesta sessão.

## Arquitetura

```
functions/src/whatsapp/
  constants.js   — versão da Graph API, enums, coleções, rate limits
  validators.js  — funções puras (HMAC, janela 24h, idempotência, parsing)
  metaClient.js  — adapter puro da Graph API (fetch injetável, nunca real em teste)
  secrets.js     — segredos globais (defineSecret) + tokens por tenant (Secret Manager)
  webhook.js     — whatsappWebhook (GET verify + POST eventos)
  send.js        — whatsappSendText/SendTemplate/MarkRead/ConnectionStatus/ValidateConnection
  templates.js   — whatsappSyncTemplates + normalização dos templates da Meta
  onboarding.js  — só arquitetura do Embedded Signup (não liberado)
  index.js       — agrega as 7 Functions exportadas
```

Mesmo padrão pure-function-first da Auditoria Centralizada
(`functions/src/audit/core.js`/`triggers.js`): decisões puras (o que
gravar, se aplicar um status, se uma conexão está válida) ficam isoladas
de I/O (Firestore, Secret Manager, Graph API), o que permite testar a
lógica de verdade sem emulador — ver `tests/functions/whatsapp-*.test.mjs`.

No frontend: `whatsapp-oficial-v1.js`/`.css` (view de conexão, nova) e
extensões pontuais em `atendimento.js`/`.css` (badge, número mascarado,
janela de 24h, ticks de entrega, picker de templates).

## Modelo multi-tenant

`whatsapp_connections/{ownerUid}` — só metadados, nunca segredo:

```
{
  ownerUid, status, onboardingMode, metaAppId, businessPortfolioId,
  wabaId, phoneNumberId, displayPhoneNumber, verifiedName, qualityRating,
  messagingLimitTier, webhookSubscribed, tokenSecretResource,
  connectionVersion, graphVersion, lastValidatedAt, lastWebhookAt,
  lastTemplateSyncAt, lastErrorCode, lastErrorAt, createdAt, updatedAt, updatedBy
}
```

`status`: `disconnected | pending_setup | validating | connected | degraded | suspended | revoked`.

`tokenSecretResource` é só o **nome do recurso** do Secret Manager (ex.
`projects/.../secrets/vide-whatsapp-token-<hash>`) — nunca o valor do
token. `whatsappConnectionStatus` (callable) nunca devolve esse campo ao
cliente; o dashboard só mostra `"•••••••• conectado"`.

## Segredos

Dois tipos, nunca confundidos:

1. **Globais** (`WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`,
   `META_APP_ID` opcional) — `defineSecret()` do Firebase Functions, mesmo
   padrão de `GEMINI_API_KEY` (`functions/src/ai/index.js`). Um valor só,
   fixado no deploy.
2. **Por tenant** (token de acesso) — não cabem em `defineSecret` (é
   global/estático). Ficam no Google Secret Manager sob
   `vide-whatsapp-token-<hash-sha256-do-ownerUid>` (nunca o `ownerUid`
   cru no nome), acessados dinamicamente por
   `functions/src/whatsapp/secrets.js`. Cache curto (5 min) só na
   memória do processo, nunca em disco/Firestore, limpo em qualquer erro
   de autenticação. A service account de runtime das Functions só
   precisa de `roles/secretmanager.secretAccessor` nos segredos que
   realmente usa — nunca Secret Manager Admin. Provisionamento
   (criar/atualizar secret) só acontece nos scripts administrativos, nunca
   em runtime de produção.

`YOUR_META_APP_SECRET`/similares em qualquer exemplo deste repositório
são placeholders óbvios — nunca um valor real, nunca commitado em `.env`.

## Segurança do webhook

- **GET** (`hub.mode`/`hub.verify_token`/`hub.challenge`): comparação do
  verify token em tempo constante (`crypto.timingSafeEqual`), nunca
  logado — nem em sucesso, nem em falha.
- **POST**: `X-Hub-Signature-256` validada com HMAC-SHA256 sobre o
  `rawBody` (nunca o JSON reserializado, que pode mudar espaçamento),
  comparação em tempo constante. Requisição sem assinatura válida nunca
  chega a processar o payload.
- **ACK rápido**: a resposta HTTP (`200 EVENT_RECEIVED`) sai antes do
  processamento real — a Meta espera resposta rápida e desativa
  webhooks lentos.
- **Roteamento nunca confia no payload**: `phone_number_id`/`wa_id`/
  `wabaId` do corpo da requisição nunca decidem o tenant sozinhos —
  sempre resolvidos contra `whatsapp_phone_routes/{phoneNumberId}`
  (coleção só de backend, nunca escaneada, nunca lida pelo cliente).

## Idempotência

Todo evento da Meta carrega um `wamid`. `safeWamid()`
(`functions/src/whatsapp/validators.js`) transforma isso num ID de
documento Firestore seguro e determinístico (hash SHA-256) — o mesmo
`wamid` sempre produz o mesmo ID.

- `whatsapp_message_map/{safeWamid}` — `{ownerUid, chatId, messageId,
  direction, providerStatus, providerTimestamp, lastStatusAt,
  createdAt, updatedAt}`. A criação usa `.create()` (falha atômica se já
  existir) como o portão real de idempotência: uma reentrega do mesmo
  evento nunca duplica a mensagem/chat criados.
- `whatsapp_webhook_events/{eventHash}` — dedupe leve e barato (nunca
  guarda o payload completo), TTL de 48h.

## Status de entrega (nunca regride)

`queued → accepted → sent → delivered → read`, com `failed` como ramo
alternativo aceito antes de `delivered`/`read` (nunca depois — uma
falha tardia e fora de ordem não pode apagar um `delivered`/`read` já
confirmado). `podeAtualizarStatusMensagem()` é a função pura que decide
isso — testada com 7 cenários em
`tests/functions/whatsapp-validators.test.mjs`. `failed` guarda só um
código seguro e um título curto vindo da própria Meta — nunca o payload
de erro cru (pode conter dado do destinatário).

UI: relógio (queued/accepted), um check (sent), dois checks (delivered),
dois checks destacados (read), alerta (failed) — sempre com
`title`/`aria-label`, nunca só cor.

## Janela de atendimento de 24h

Servidor-autoritativa: `chats/{chatId}.whatsappUltimaMensagemClienteEm`
(timestamp da última mensagem real do cliente, vindo do evento da Meta) →
`whatsappJanelaAtendimentoAte = whatsappUltimaMensagemClienteEm + 24h`.

- `whatsappSendText` (onCall) recusa o envio se a janela já fechou
  (`WHATSAPP_WINDOW_CLOSED`) — a UI nunca decide isso sozinha, só reflete
  o estado pra nunca prometer um envio que o servidor vai recusar.
- Canal WhatsApp **nunca** escreve mensagem direto no Firestore (ao
  contrário do canal legado `interno`/`loja_publica`, que ainda usa
  `writeBatch` direto do cliente) — sempre via
  `whatsappSendText`/`whatsappSendTemplate`, porque só o servidor sabe
  se a janela está aberta e tem acesso ao token.
- Fora da janela, o compositor de texto livre é **substituído** (nunca
  só desabilitado visualmente) pelo picker de templates aprovados —
  `#atend-form-resposta[hidden]` mais `#atend-whatsapp-template-picker`
  visível.
- Nunca hardcoda o valor de cobrança da Meta — só o aviso genérico
  "Mensagens podem gerar cobrança conforme a tabela vigente da Meta.".

## Templates da Meta (distintos dos templates internos)

`whatsapp_templates/{ownerUid}_{metaTemplateId}` —
`{ownerUid, wabaId, metaTemplateId, name, language, category, status,
components, parameterSchema, qualityScore, syncedAt, createdAt, updatedAt}`.

`whatsappSyncTemplates` (onCall, rate limitado) espelha o que já existe
no WhatsApp Manager — **nunca cria template via API nesta V1** (isso
continua um processo manual externo, a UI deixa isso explícito).
`parameterSchema` é derivado automaticamente do componente `BODY`
(`{{1}}`, `{{2}}`, ...) por `derivarParameterSchema()`. Só templates
`APPROVED` e do próprio tenant podem ser enviados — `avaliarTemplate()`
recusa cross-tenant e templates não aprovados.

## Contato e CRM 360

`whatsapp_contact_map/{ownerUid}_{contactHash}` — `wa_id` é PII
operacional: nunca aparece em auditoria, log ou documento público, nunca
é usado sem hash como ID, nunca é devolvido pra outro tenant. O
vínculo com o CRM 360 usa a mesma estratégia de
`crm360.js#encontrarCorrespondencias()` (busca por telefone normalizado
→ match único vincula automaticamente, zero fica candidato sem
auto-criar, múltiplos exige decisão humana) — implementado de forma
independente em `webhook.js#tentarVincularClienteCRM()` porque o módulo
de Functions (CommonJS) e o frontend (ESM) não compartilham import
direto neste projeto.

## Rate limiting

Server-side apenas (`functions/src/shared/rateLimit.js`, mesmo helper
genérico usado pelas Functions públicas), nunca confia em nada vindo do
cliente: texto/min, template/min, sync de templates/hora, validação de
conexão/min — todos por `ownerUid`. Nenhum broadcast, nenhum array de
destinatários — sempre um chat validado por chamada.

## Auditoria (reaproveitada, sem trigger de alta frequência)

Mensagens do WhatsApp **nunca** geram evento de auditoria (alto volume,
conteúdo de conversa — mesma regra que já vale pro chat legado). Só
ações administrativas usam o helper interno `writeAudit()`: conexão
provisionada/validada/revogada, sincronização manual de templates —
nunca o texto da mensagem, `wa_id`, telefone, payload do webhook ou
conteúdo de template com PII. A Central de Auditoria em si segue com o
teste final de produção pendente (Fase B da missão anterior) — este
módulo não altera esse status.

## Rules (`firestore.rules`)

`canal` passa a aceitar `"whatsapp"` nas três validações de escrita de
chat (mantendo `loja_publica`/`interno`/`whatsapp_futuro`). As 7 novas
coleções (`whatsapp_connections`, `whatsapp_templates`,
`whatsapp_message_map`, `whatsapp_webhook_events`,
`whatsapp_phone_routes`, `whatsapp_contact_map`, `whatsapp_consents`)
nunca aceitam escrita do cliente — só o Admin SDK (Cloud Functions)
grava. Leitura: `whatsapp_connections`/`whatsapp_templates` liberada pro
dono e por funcionário com permissão de ver/editar `atendimento` ou
`configuracoes`; as demais (roteamento/mapa/dedupe/contato/consentimento)
nunca são lidas pelo cliente, nem pelo próprio dono — são estado interno
do backend.

## Índices

Nenhum índice composto novo foi necessário nesta fase: a única consulta
nova (`clientes` por `tenantId`+`telefoneNormalizado`, usada pra vincular
o CRM 360) é só igualdade em dois campos, suportada automaticamente pelo
Firestore (zigzag merge de índices de campo único) sem precisar de
índice composto. Se o Commit 2 futuro precisar filtrar
`whatsapp_templates` por `ownerUid`+`status`+ordenação, um índice
composto entra nesse momento — documentado aqui como pendência
observada, não implementado especulativamente.

## Onboarding V1 (piloto assistido, nunca simulado)

Não existe formulário de "Conectar" no dashboard que finja uma conexão —
V1 é assistida por um administrador:

- `scripts/provision-whatsapp-pilot.mjs`: valida a loja, valida o
  formato dos IDs, **testa a conexão real com a Graph API antes de
  gravar qualquer coisa**, grava o token no Secret Manager, grava só
  metadados em `whatsapp_connections`, registra o roteamento, nunca
  imprime/loga o token (prompt oculto no terminal).
- `scripts/disconnect-whatsapp-pilot.mjs`: desabilita a versão do
  secret, marca a conexão como `revoked`, marca o roteamento como
  revogado — **nunca apaga** chat/mensagem/histórico/cliente.

O botão de conexão no dashboard (`view-whatsapp-oficial`) mostra o aviso
de piloto assistido enquanto não conectado — nunca um clique que finge
sucesso.

Embedded Signup (fluxo de auto-conexão real via SDK do Facebook) está
documentado como arquitetura em `functions/src/whatsapp/onboarding.js`
(`EMBEDDED_SIGNUP_LIBERADO_EM_PRODUCAO = false`) — não implementado
nem exposto como Function nesta V1.

## Testes

- **Unitários** (`tests/functions/whatsapp-validators.test.mjs`, 41
  testes): HMAC válido/inválido/tempo constante, handshake do webhook,
  normalização de `wa_id`, hash de contato, `safeWamid` determinístico,
  parsing do payload (texto/status/mídia/tipo desconhecido/payload
  vazio), janela de 24h aberta/fechada, status nunca regride, remoção
  recursiva de campos sensíveis, máscara de segredo, identificador de
  rate limit, URL da Graph API centralizada, validação de parâmetros de
  template.
- **Functions** (`tests/functions/whatsapp-functions.test.mjs`, 36
  testes): `metaClient` com um Meta **falso** (fetch injetado, nunca a
  API real) — sucesso, 401→revogado, 429→rate limit, 400→falha
  definitiva sem retry, 500→retry com backoff, token nunca aparece em
  erro; planos puros do webhook (chat novo vs. existente, vínculo de
  CRM, decisão de atualização de status); decisões puras do `send.js`
  (conexão válida, template aprovado/cross-tenant, montagem dos
  parâmetros do template, permissão de ver a conexão); `templates.js`
  (derivação do schema de parâmetros); `index.js` exporta exatamente as
  7 Functions esperadas.
- **Rules** (`tests/emulator/firestore-security.test.mjs`, 15 cenários
  novos): dono lê a própria conexão, funcionário com permissão lê,
  funcionário sem permissão não lê, outro tenant nunca lê, cliente nunca
  escreve nenhuma das 7 coleções (nem o próprio dono), template
  cross-tenant negado, `wa_id`/roteamento/dedupe nunca lidos pelo
  cliente, anônimo nunca lê nada, canal `"whatsapp"` aceito no caminho
  admin válido de `chats`.
- **UI** (`tests/emulator/ui/whatsapp-oficial.flow.mjs`): estado não
  configurado → conectado via seed real + Cloud Function real (nunca
  mock), token sempre mascarado na tela, funcionário leitor vê mas não
  valida, badge/número mascarado na Central de Atendimento, bloqueio
  real do compositor fora da janela de 24h (achado um bug real de CSS
  neste processo — ver seção de bugs corrigidos abaixo).

Todos os testes rodam com um adapter **falso** da Meta — a Graph API real
nunca é chamada em CI/local, conforme exigido pela missão.

## Bug real encontrado e corrigido

`#atend-form-resposta` já tinha `display: flex` fixado por seletor de ID
em `atendimento.css`. A regra padrão do navegador `[hidden] {
display: none }` tem prioridade de **origem** (user-agent) menor que
qualquer regra de autor, então `form.hidden = true` (usado pra esconder
o compositor de texto livre fora da janela de 24h) mudava o atributo
HTML mas não tinha nenhum efeito visual — o compositor "Enviar"
continuava aparecendo ao lado do picker de templates. Achado por um run
real de CI (nunca localmente — o proxy de rede do sandbox de
desenvolvimento bloqueia `gstatic.com`, então os fluxos de UI com login
real não puderam ser executados neste ambiente; confirmado que o mesmo
bloqueio afeta até o fluxo pré-existente da Auditoria, não é algo
específico deste módulo). Corrigido com
`#atend-form-resposta[hidden] { display: none; }` (especificidade maior
que a regra base).

## Quality Gate

`check` (sintaxe), `test:unit` (inclui os novos testes puros de
`atendimento.js`), `test:functions` (77 testes puros do WhatsApp),
`test:rules` (15 cenários novos + regressão completa), `test:frontend:emulator`
(Functions Emulator real sobe as 7 Functions sem erro) — todos verdes
localmente antes de cada commit. `test:ui:flows` (Playwright) não pôde
rodar localmente (rede do sandbox), mas rodou e passou em CI real após o
fix do bug de CSS acima.

## Deploy (Fase B — não executada nesta entrega)

`.github/workflows/firebase-deploy-whatsapp.yml` — criado, nunca
disparado nesta missão. `workflow_dispatch` manual, projeto fixo
`vide-digital-saas`, `confirm_production` precisa ser exatamente
`DEPLOY_WHATSAPP`, testes locais antes do deploy, `--only` explícito
listando só as 7 Functions do WhatsApp (nunca toca `askBusinessAI`,
`askPublicBusinessAI` nem os 15 triggers de auditoria), Node 22.

## Checklist externo (Fase B, feito depois pelo usuário)

1. Criar/usar um Meta App em modo Business.
2. Configurar um Business Portfolio verificado.
3. Solicitar Advanced Access para `whatsapp_business_messaging` e
   `whatsapp_business_management` (App Review).
4. Reconfirmar a versão vigente da Graph API no changelog oficial e
   ajustar `WHATSAPP_GRAPH_VERSION` se necessário.
5. Criar/associar a WhatsApp Business Account (WABA) e o número de
   telefone.
6. Criar os secrets globais no Secret Manager:
   `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
   (e opcionalmente `META_APP_ID`) — nunca com valor de exemplo.
7. Rodar `.github/workflows/firebase-deploy-whatsapp.yml` com
   `confirm_production=DEPLOY_WHATSAPP`.
8. Configurar o webhook no painel da Meta com a URL publicada e o
   Verify Token do passo 6; confirmar a assinatura de eventos.
9. Gerar um token de sistema de longa duração para o piloto.
10. Rodar `scripts/provision-whatsapp-pilot.mjs` com um administrador
    (`GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_CLOUD_PROJECT=vide-digital-saas`).
11. Enviar/receber uma mensagem real de teste; confirmar status
    `sent`/`delivered`/`read` chegando via webhook.
12. Sincronizar templates reais (`whatsappSyncTemplates`) e enviar um
    template aprovado de teste fora da janela de 24h.
13. Revisar os custos reais na tabela vigente da Meta.
14. Só então atualizar `docs/ROADMAP_RD3_STATUS.md` de PARCIAL para
    CONCLUÍDO.

## Rollback

Reverter os 3 commits desta entrega em ordem inversa é seguro — nenhum
deles altera `askBusinessAI`, `askPublicBusinessAI` ou os triggers de
auditoria. Se já houver deploy real (Fase B): apagar só as 7 Functions
do WhatsApp (nunca as legadas), marcar a conexão como `revoked` via
`scripts/disconnect-whatsapp-pilot.mjs`, desabilitar a versão do secret
— **nunca apagar** `chats`/`mensagens`/`clientes`/histórico de conversa,
mesmo ao desconectar.

## Limitações conhecidas desta V1

- Mídia recebida (imagem/documento/áudio/vídeo/figurinha/localização/
  contato) nunca é baixada automaticamente — só um placeholder seguro no
  lugar do texto (`rotuloTipoMensagemWhatsapp()`); download autenticado
  fica para uma V1.1.
- Sem envio de mídia outbound nesta fase.
- Sem broadcast/lista de destinatários — sempre um chat por chamada.
- Embedded Signup documentado mas não liberado — onboarding V1 é só
  piloto assistido por script.
- Criação de template via API não implementada — só sincronização de
  templates já existentes no WhatsApp Manager.
- A versão da Graph API (`v21.0`) foi determinada por busca indireta,
  não por leitura direta da documentação oficial (bloqueada neste
  ambiente) — reconfirmar antes do deploy real.
