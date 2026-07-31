# WhatsApp — Módulo separado + Multiconexão

> **Atualização 2026-07-31:** o Embedded Signup dedicado está implementado,
> assim como reconexão, desligamento seguro e QR oficial. Todos permanecem
> protegidos por flags desligadas em produção até os gates externos da Meta
> e do Firebase. Consulte `docs/meta-whatsapp/README.md`. As seções chamadas
> “preparação” abaixo registram o desenho anterior e foram substituídas pela
> implementação atual.

Evolução do WhatsApp Oficial V1 (`docs/WHATSAPP_OFICIAL.md`) em duas frentes,
executadas juntas nesta missão porque uma depende da outra:

1. **Separação do módulo**: administrar a conexão do WhatsApp deixa de viver
   dentro da Central de Atendimento e ganha uma área própria no dashboard
   ("WhatsApp"), com permissão própria.
2. **Multiconexão**: o modelo de dados passa a suportar até **2 conexões
   oficiais por loja** (`MAX_CONNECTIONS_PER_OWNER`, centralizada em
   `functions/src/whatsapp/constants.js`), mantendo o piloto legado (uma
   conexão por loja, `whatsapp_connections/{ownerUid}`) **100% funcional e
   nunca reescrito**.

**Status desta entrega**: código completo, testado localmente (unit,
functions, Rules, syntax check). Não houve deploy nem alteração em
segredos/IAM/configuração da Meta — ver seção "O que esta missão NÃO fez"
no fim.

**Absoluto de todas as fases**: nenhum código aqui escaneia QR Code nem
imita o WhatsApp Web (nada de whatsapp-web.js/Baileys/Venom/WPPConnect/
open-wa/Puppeteer controlando o WhatsApp Web ou equivalente). A única
alternativa a um número dedicado é a **Coexistência oficial da Meta**
(`providerMode: "official_coexistence"`). O contrato/UI existe, mas a flag
continua desligada até elegibilidade e aprovação externas serem confirmadas.

## Módulo WhatsApp × Central de Atendimento

| | Módulo WhatsApp (`view-whatsapp-oficial`, permissão `whatsapp`) | Central de Atendimento (`view-atendimento`, permissão `atendimento`) |
|---|---|---|
| Propósito | Conectar/administrar/diagnosticar os números oficiais | Ler e responder conversas (WhatsApp + outros canais) |
| Escreve em | `whatsapp_connections` (só via Functions) | `chats`/`chats/*/mensagens`/`chats/*/eventos` |
| Ações | Validar conexão, tornar uma conexão padrão, sincronizar templates oficiais | Responder, atribuir, mudar status, usar templates |
| Nunca faz | Enviar/receber mensagem de cliente | Mostrar token, WABA ID, ou qualquer configuração de conexão |

A permissão `whatsapp` (ver `functions/src/whatsapp/send.js`:
`podeVerConexao`/`podeGerenciarConexao`) é **própria do módulo** — nunca
mais herdada de `atendimento` ou `configuracoes` sozinha. Um funcionário
pode ver/atender conversas sem poder mexer na conexão, e vice-versa.

## Modelo de dados

### Documento legado (V1, connectionVersion 1)

`whatsapp_connections/{ownerUid}` — chave é o próprio `ownerUid`. Criado
por `scripts/provision-whatsapp-pilot.mjs`. **Nunca apagado, nunca
reescrito por esta missão.**

### Documento novo (multiconexão, connectionVersion 2)

`whatsapp_connections/{connectionId}` — `connectionId` é um ID aleatório
(gerado pelo Firestore em qualquer escrita futura real, ou de forma
determinística pelo script de migração — ver abaixo). Campos:

```
ownerUid, connectionId, label, status, provider ("meta_cloud_api"),
providerMode ("official_cloud" | "official_coexistence"),
onboardingMode ("piloto_assistido" | "embedded_signup"),
wabaId, phoneNumberId, displayPhoneNumber, verifiedName, qualityRating,
isDefault, connectionVersion (2), graphVersion, tokenSecretResource,
createdAt, updatedAt, lastValidatedAt, lastErrorCode
```

`connectionVersion` é o discriminador — necessário porque o documento
legado **também** tem um campo `ownerUid` (mesma chave/campo), então uma
query ingênua por `ownerUid` sozinho colidiria com o legado. Toda query do
modelo novo sempre filtra `connectionVersion == 2` também.

O limite de 2 conexões por loja é aplicado nas Functions que criam
conexões novas (fora do escopo real desta missão — só o Fase 3 de
migração escreve uma conexão nova, e sempre no máximo 1 por execução,
nunca ultrapassando o limite por construção). `MAX_CONNECTIONS_PER_OWNER`
está preparado para um limite por plano no futuro, mas hoje é fixo — não
existe nenhuma integração de cobrança/plano real associada.

### Rota `whatsapp_phone_routes/{phoneNumberId}`

Evoluída para incluir `connectionId` além de `ownerUid`/`connectionStatus`.
**Nunca confiável a partir do payload da Meta** — o webhook sempre lê este
documento pra decidir o tenant, nunca usa o `phone_number_id` do payload
como prova de identidade.

### Chats

Um chat do canal `whatsapp` grava, só na **criação**:
`whatsappPhoneNumberId`, `whatsappDisplayPhoneNumber` (número da loja, vem
do próprio `metadata` do payload da Meta — nunca de uma leitura extra em
`whatsapp_connections`) e `whatsappConnectionId` (só quando a conexão é do
modelo novo — omitido, nunca gravado como string vazia, quando é a
legada). **Uma conversa nunca troca de conexão depois de criada** — nem
`whatsappConnectionId` nem `whatsappDisplayPhoneNumber` são reescritos em
mensagens seguintes, mesmo que a conexão padrão da loja mude depois.

## Resolver — retrocompatibilidade central

`functions/src/whatsapp/resolver.js` é o **único** lugar do código que
decide qual conexão (e qual secret) usar. `webhook.js`, `send.js`,
`templates.js` e `connections.js` nunca leem `whatsapp_connections`
direto pelo `ownerUid` de novo — todos passam por `resolverConexao()`.

Ordem de resolução (nunca aleatória, nunca mistura tokens entre
tenants):

1. `connectionId` explícito (do chat ou da rota) **e que realmente
   pertence a este `ownerUid`** → `whatsapp_connections/{connectionId}`.
2. Sem `connectionId` (ou não encontrado) → a conexão **default** do
   modelo novo (`isDefault: true`, mesmo `ownerUid`).
3. Nada no modelo novo → o documento **legado**.
4. Nada em lugar nenhum → `null` (`WHATSAPP_NOT_CONNECTED`).

O token sempre vem do campo `tokenSecretResource` da conexão **já
resolvida** — nunca recalculado a partir de `ownerUid`/`connectionId`. Uma
conexão migrada do piloto legado pode continuar apontando pro **mesmo**
secret físico do piloto, sem nunca copiar o valor do token.

## Secrets

- Legado: `vide-whatsapp-token-<hash sha256(ownerUid)>` (inalterado).
- Novo, por conexão: `vide-whatsapp-token-<hash sha256(ownerUid:connectionId)>`
  (`tenantConnectionSecretId`, `functions/src/whatsapp/secrets.js`).
- O token **nunca** é colocado em Firestore, no navegador, em HTML, em
  logs, em testes, em variável pública ou em commit — em nenhuma das
  fases desta missão. O que aparece em Firestore/API/UI é sempre só o
  **caminho do recurso** (`tokenSecretResource`, ex.:
  `projects/x/secrets/vide-whatsapp-token-abc`), nunca o valor.
- `whatsappConnectionStatus`/`whatsappListConnections` nunca devolvem
  `tokenSecretResource` — só metadados seguros (status, número, qualidade
  etc.).

## Migração (Fase 3) — `scripts/migrate-whatsapp-multiconexao.mjs`

Script administrativo, roda só localmente ou no Cloud Shell por um humano,
nunca em CI, nunca chamado pelo dashboard. Lógica pura testável separada
em `scripts/whatsapp-migrate-core.mjs`.

- **Dry-run por padrão** — só relatório, nenhuma escrita. Migração real
  exige `--apply` **e** `WHATSAPP_MIGRATION_CONFIRM_APPLY=APPLY_WHATSAPP_MIGRATION`
  simultaneamente; sem os dois juntos, continua dry-run ou bloqueia antes
  de qualquer escrita.
- **Autenticação via Application Default Credentials (ADC)** — achado
  corrigido em 2026-07-31: o script bloqueava incondicionalmente sem
  `GOOGLE_APPLICATION_CREDENTIALS`, forçando uma chave JSON de service
  account mesmo quando o Admin SDK já aceita ADC de usuário (`gcloud auth
  application-default login`), o caminho recomendado e mais seguro no
  Cloud Shell. Agora `GOOGLE_APPLICATION_CREDENTIALS` continua funcionando
  se já existir, mas nunca é exigida nem recomendada.
- **Projeto sempre fixo** em `vide-digital-saas` — `WHATSAPP_MIGRATION_PROJECT`
  precisa confirmar isso explicitamente antes de qualquer leitura, mesmo em
  dry-run; nunca aceita outro valor. `GOOGLE_CLOUD_PROJECT`/`GCLOUD_PROJECT`/
  `CLOUDSDK_CORE_PROJECT` podem existir no ambiente (o Cloud Shell às vezes
  os define sozinho) mas nunca escolhem o projeto — se definidas e
  divergentes de `vide-digital-saas`, bloqueiam por segurança.
- `connectionId` de uma migração é **determinístico**:
  `mig-<hash sha256("migracao:" + ownerUid + ":" + phoneNumberId)>` —
  rodar de novo sobre um tenant já migrado não duplica nada (idempotente).
- Nunca lê nem imprime o **valor** de um token — só copia a **string**
  `tokenSecretResource` do documento legado pra conexão nova, que passa a
  apontar pro mesmo secret físico.
- O documento e o secret **legados nunca são apagados nem reescritos**.
- `--rollback` (também dry-run por padrão) reverte só o que a própria
  migração criou — identificado pelo campo `migratedFromLegacyOwnerUid`,
  gravado só por este script. Nunca reverte uma conexão que não tenha
  esse campo (recusa por segurança). Rollback real exige `--rollback
  --apply` **e** `WHATSAPP_MIGRATION_CONFIRM_ROLLBACK=APPLY_WHATSAPP_ROLLBACK`
  simultaneamente — uma confirmação própria, nunca a mesma da migração.
- Validação de tenant/IDs antes de qualquer plano: `ownerUid` e
  `phoneNumberId` no formato esperado, `ownerUid` do documento legado
  batendo com o solicitado, rota (se existir) pertencendo ao mesmo tenant.
- **`graphVersion` da conexão V2 vem sempre da versão atual centralizada**
  em `functions/src/whatsapp/constants.js` (`WHATSAPP_GRAPH_VERSION`),
  importada pelo orquestrador — **nunca** copiada de `legado.graphVersion`.
  `graphVersionAtual` é obrigatória em `construirPlanoMigracao` (formato
  `vMAJOR.MINOR`); ausente ou inválida bloqueia com status `invalida` e
  zero ações, mesmo em dry-run. Se o legado tiver uma versão diferente da
  atual, o relatório mostra um aviso seguro (sem UID/IDs/token) — o legado
  nunca é alterado por causa disso. Achado real (2026-07-31): o primeiro
  dry-run real no Cloud Shell mostrou a conexão V2 seria criada com
  `graphVersion="v25.0"` (copiado do legado) enquanto o código já estava em
  `v26.0` — por isso nenhum `--apply` foi autorizado; corrigido nesta
  missão.
- Falha de autenticação nunca imprime token, caminho de credencial nem
  recomenda criar/baixar uma chave JSON — só instrui `gcloud auth
  application-default login` e `set-quota-project vide-digital-saas`.
- Testado com 70 testes unitários da lógica pura e do orquestrador (planos
  de migração/rollback, geração de `connectionId`, validação, relatório
  nunca expõe token, flags/modos/gates de confirmação, prova de que
  dry-run nunca invoca escrita, `graphVersion` sempre da versão atual)
  — `pnpm run test:whatsapp-migrate`.
- **Nenhum dry-run real, `--apply` ou `--rollback` foi executado nesta
  missão** — só a correção do `graphVersion` e os testes locais/CI. A
  repetição do dry-run real no Cloud Shell fica para uma autorização
  explícita separada.

### Fluxo seguro no Cloud Shell

```bash
cd ~/vide-digital
git fetch origin
git switch main
git reset --hard origin/main

gcloud auth login
gcloud auth application-default login
gcloud auth application-default set-quota-project vide-digital-saas
gcloud config set project vide-digital-saas

export CLOUDSDK_CORE_PROJECT="vide-digital-saas"
export GOOGLE_CLOUD_PROJECT="vide-digital-saas"
export WHATSAPP_MIGRATION_PROJECT="vide-digital-saas"
export WHATSAPP_OWNER_UID="COLOCAR_UID_REAL_SEM_COMPARTILHAR"

unset GOOGLE_APPLICATION_CREDENTIALS
unset WHATSAPP_MIGRATION_CONFIRM_APPLY
unset WHATSAPP_MIGRATION_CONFIRM_ROLLBACK

node scripts/migrate-whatsapp-multiconexao.mjs
```

- `gcloud auth login` autentica a **CLI** (`gcloud`) — não é usado pelo
  script em si.
- `gcloud auth application-default login` autentica as **bibliotecas
  cliente** (Admin SDK) via Application Default Credentials — é isso que o
  script usa (`applicationDefault()`), sem precisar de chave JSON.
- Sem `--apply`, o comando acima é **sempre dry-run**: só leitura e
  relatório, nenhuma escrita.
- Nunca compartilhe `WHATSAPP_OWNER_UID` em logs externos, capturas de
  tela ou qualquer lugar fora do seu próprio terminal.
- Nunca compartilhe token de acesso, App Secret, Verify Token, ou o
  arquivo/local de ADC gerado pelo `gcloud auth application-default
  login`.
- Não rode `--apply` sem antes revisar o relatório do dry-run com atenção
  — o relatório lista exatamente quais documentos serão criados/alterados
  antes de qualquer confirmação real ser exigida.

## Segurança (Rules e Functions)

- `firestore.rules`: `whatsapp_connections` permite leitura só a
  `canViewTenant(resource.data.ownerUid, "whatsapp")` (dono ou funcionário
  com a permissão própria) — escrita sempre `false` (só Admin SDK).
- Toda query de listagem (`whatsappListConnections`) é sempre filtrada por
  `context.ownerUid` resolvido do **contexto autenticado**, nunca de um
  parâmetro vindo do cliente.
- `whatsappSetDefaultConnection` só aceita `connectionId` do modelo novo
  (`connectionVersion == 2`) pertencente ao próprio tenant — nunca a
  conexão legada (que não tem conceito de `isDefault`; ela já é o
  fallback natural do resolver quando nenhuma conexão nova é default) e
  nunca de outro `ownerUid`.
- Nenhuma Function aceita token/credencial vindo do cliente.
- Auditoria (`writeAudit`) grava `connectionId` como `targetId` quando
  relevante — nunca o token, nunca `tokenSecretResource` completo.

## Status de entrega (sent/delivered/read)

Auditoria confirmou que `podeAtualizarStatusMensagem`
(`functions/src/whatsapp/validators.js`) e `decidirAtualizacaoStatus`
(`functions/src/whatsapp/webhook.js`) já tratam corretamente toda a cadeia
`queued → accepted → sent → delivered → read`, incluindo:

- `read` chegando **fora de ordem** (direto de `sent`/`accepted`, sem
  `delivered` ter passado antes) — a Meta não garante a ordem de entrega
  dos webhooks de status, e o código aceita qualquer avanço de rank, não
  só o próximo da fila.
- Reentrega idempotente (o mesmo status duas vezes nunca é tratado como
  regressão).
- Regressão nunca é aplicada (`read → delivered` é sempre rejeitado).
- `failed` é terminal e nunca sobrescreve `delivered`/`read`.

A UI (`atendimento.js`) já renderizava os 5 estados com tooltip/legenda em
português (`rotuloStatusEntregaWhatsapp`) e nunca simula/promove um status
por tempo — só reflete `providerStatus` como veio do backend.

**Diagnóstico do caso relatado ("lida" nunca apareceu no teste manual)**:
não foi encontrado nenhum bug de código que explique isso — nem no
webhook, nem na UI. A causa mais provável é **externa**: o destinatário
pode ter desativado as confirmações de leitura nas configurações do
WhatsApp dele (nesse caso a Meta nunca envia o evento `read`, por
desenho), ou o número de teste fornecido pela Meta pode ter limitações
conhecidas de status. Isso é documentado como possibilidade real na
própria seção "Diagnóstico" do módulo (nunca inventando uma causa
específica sem confirmação). Nenhuma "correção" foi aplicada porque não
há nada de errado no código para corrigir.

## Embedded Signup (implementado; liberação externa pendente)

`functions/src/whatsapp/onboarding.js` implementa quatro callables para
iniciar, concluir, consultar e cancelar uma tentativa. A troca do code,
validação do token, descoberta de ativos, registro, assinatura do WABA,
persistência versionada e sincronização inicial ocorrem no backend. App
Review/Advanced Access e a configuração real permanecem gates externos.

As tentativas expiram em 15 minutos, têm state/identidade HMAC,
idempotência, trava por tenant e proteção contra replay. A UI carrega o SDK
oficial de forma tardia e valida a origem das mensagens. Veja o runbook em
`docs/meta-whatsapp/embedded-signup-setup.md`.

## Preparação para a Coexistência (protegida por flag)

`providerMode: "official_coexistence"` já existe no enum
(`CONNECTION_PROVIDER_MODE`) e a UI do módulo ("Adicionar conexão", opção
B) já mostra essa opção — sempre com CTA desabilitado
("Configuração em preparação"), nunca afirmando que está disponível. O
fluxo real de Coexistência (vincular um número já usado no app normal do
WhatsApp Business) depende de endpoints e permissões específicas da Meta
que não foram confirmados numa fonte oficial nesta missão — fica para uma
missão futura, com pesquisa própria antes de qualquer código.

## Rollback

- **Migração (Fase 3)**: `--rollback` no próprio script (ver acima) —
  remove só a conexão nova e limpa o `connectionId` da rota, nunca toca no
  legado.
- **Módulo/UI (Fase 4/5)**: reverter o commit da branch restaura a rota
  `view-whatsapp-oficial` (permissão `atendimento`) e a Central sem o
  filtro por número — nenhuma migração de dado é necessária pra isso, já
  que nenhum dado é apagado ao reverter só código.
- **Resolver/modelo (Fase 2)**: reverter o commit remove o resolver e o
  suporte a `connectionVersion 2`; o piloto legado continua funcionando
  exatamente como antes (nunca dependeu do código novo).

## O que esta missão NÃO fez (gates de segurança respeitados)

- Nenhuma alteração na configuração da Meta (App, Business Portfolio,
  webhooks, permissões).
- Nenhum acesso a um token real, nenhuma criação de secret real.
- Nenhuma mudança de IAM.
- Nenhuma migração real executada (nem dry-run contra um projeto real).
- Nenhum deploy (Functions, Rules, Storage, índices).
- Nenhum documento legado apagado, nenhuma conexão real desconectada.
- Nenhuma versão da Graph API alterada.
- Nenhuma biblioteca não-oficial instalada, nenhum código de scraping do
  WhatsApp Web.
- Nenhuma Rule/Function publicada.

## Limites e riscos conhecidos

- A migração (Fase 3) nunca foi executada contra um projeto real —
  validada só por 27 testes unitários da lógica pura.
- O fluxo de UI completo (Playwright, navegador real) não pôde ser
  executado de ponta a ponta neste ambiente de desenvolvimento por uma
  limitação de rede/proxy do sandbox anterior a esta missão (o próprio
  `login.smoke.mjs`, que não depende de nenhum código do WhatsApp, falha
  do mesmo jeito) — validado por checagem de sintaxe e testes unitários
  das funções puras de renderização/filtro.
- `whatsappListConnections` não tem rate limit (mesmo padrão de
  `whatsappConnectionStatus`, que também não tem — ambos são leituras).
- Rate limit de `whatsappSendText`/`whatsappSendTemplate`/`whatsappMarkRead`
  continua por `ownerUid` (não por `ownerUid+connectionId`) — a mission
  permitia ("pode considerar"), não exigia; ficou como estava por não ser
  necessário para o V1 de 2 conexões.
