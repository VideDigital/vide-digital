# Checkpoint — Embedded Signup WhatsApp em produção (hardening final)

> Este arquivo é o mecanismo de acompanhamento vivo desta missão. Atualizado
> após cada etapa importante. Se o contexto acabar antes da conclusão, este
> arquivo (mais o relatório entregue no chat) é a fonte da verdade para
> retomar o trabalho.

## Revisão independente reaberta — 2026-07-31

- **Branch**: `feat/whatsapp-embedded-signup-production`.
- **HEAD inicial desta sessão**: `d7271044c719a958224f6145a101604dd9ef7760`
  (confirmado igual ao remoto depois de `fetch` + `pull --ff-only`).
- **PR**: [#41](https://github.com/VideDigital/vide-digital/pull/41), aberto
  como Draft para `main` no HEAD inicial acima.
- **Worktree inicial**: limpo; nenhuma operação Git em andamento.
- **Stashes**: os três stashes locais existentes foram identificados e não
  serão aplicados, removidos ou modificados nesta missão.

### Bloqueadores reabertos

1. **Resultado ambíguo de `registerPhone`**: timeout, falha de transporte,
   erro 5xx ou erro sem status confiável podem acontecer depois de a Meta ter
   registrado o número. Nesses casos, a versão pendente do PIN deve ser
   preservada, a tentativa deve virar `requires_action` e nenhuma repetição
   automática de `registerPhone` pode ocorrer.
2. **Concorrência e consistência do QR Code**: a versão esperada precisa ser
   validada na mesma transação que adquire o lock; update/delete só podem
   finalizar se ainda possuírem o token; criação local e consolidação do lock
   precisam ser atômicas; perda do lock ou falha de compensação nunca pode
   retornar sucesso falso.

### Arquivos previstos nesta revisão

- `functions/src/whatsapp/onboarding.js`
- `functions/src/whatsapp/onboarding-core.js`
- `functions/src/whatsapp/metaClient.js` (somente se a classificação exigir
  metadados de erro adicionais)
- `functions/src/whatsapp/qr.js`
- `tests/functions/whatsapp-onboarding-core.test.mjs`
- `tests/functions/whatsapp-management-qr-security.test.mjs`
- `tests/emulator/whatsapp-hardening.smoke.mjs`
- `docs/meta-whatsapp/IMPLEMENTATION_CHECKPOINT.md`
- documentação de segurança diretamente relacionada, somente se necessário.

### Testes planejados

- Testes focados do core de onboarding e do hardening do QR.
- `pnpm run check` e lint das Functions.
- `pnpm run test:functions`, `pnpm run test:unit`, `pnpm run test:rules` e
  `pnpm run test:frontend:emulator`.
- `pnpm run test:ui:login`, `pnpm run test:ui:flows` e
  `pnpm run test:ui:responsive`.
- `pnpm run test:release`, se disponível e aplicável.
- `git diff --check`, parsing de YAML, varredura de credenciais, conferência
  dos exports e das 19 Functions WhatsApp.

**Estado desta revisão**: implementação e validação local concluídas. O push
e a validação do Quality Gate remoto no novo HEAD ainda estão pendentes.

### Etapa 1 — resultado ambíguo de `registerPhone`: implementada localmente

- Criada a decisão pura `decideRegisterPhoneFailureRecovery()` com os
  resultados `disable_pin_confirmed_not_registered` e
  `preserve_pin_registration_unknown`.
- `registerPhone` não executa retry automático. Timeout, rede, 5xx, auth,
  rate limit e erros sem resposta confiável preservam o PIN pendente.
- Somente resposta 4xx recebida e marcada pelo adaptador da Meta como
  rejeição definitiva permite desabilitar a nova versão temporária.
- Resultado ambíguo grava apenas `registrationOutcome: "unknown"`,
  `recoveryRequired: true`, IDs operacionais e código de suporte; nunca PIN,
  token ou caminho de segredo em resposta pública/log.
- A tentativa passa para `requires_action`; o lock do tenant permanece com
  `recoveryRequired: true`, impedindo novo onboarding/reexecução silenciosa.
- Conclusão confirmada limpa apenas a referência pendente da tentativa e
  mantém a versão ativa ligada à conexão.
- Se uma etapa posterior falhar depois de registro confirmado, o código
  `REGISTERED_CONNECTION_INCOMPLETE` também mantém `requires_action` e o lock
  de recuperação; novo PIN/onboarding não é liberado silenciosamente.
- Teste focado: `node --test tests/functions/whatsapp-onboarding-core.test.mjs`
  — **28/28 aprovados**.
- Lint/syntax das Functions: aprovado.
- `git diff --check`: aprovado.

Próxima etapa: fechar as janelas de concorrência/finalização/compensação de
QR antes de executar as suítes completas.

### Etapa 2 — concorrência e consistência do QR: implementada localmente

- `expectedUpdatedAtMs` passou para a mesma transação que adquire o lock.
- Locks de update/delete contêm token, `operationType`, início, expiração e
  `baseUpdatedAtMs`; somente o token atual pode finalizar ou liberar.
- Finalização de update e delete retorna `{ applied, reason }`. Perda do lock
  não altera o estado local, não remove o lock novo e retorna erro controlado.
- Criação grava QR e lock `active` na mesma transação. Estados remotos
  ambíguos não são reclamados automaticamente com a mesma idempotency key.
- Falha local após criação remota tenta compensação; falha da compensação
  preserva `remoteCodePendingCleanup` em `whatsapp_qr_locks`.
- Divergência Meta/Firestore gera reconciliação privada sanitizada, sem token,
  PIN, segredo ou header de autorização.
- Escritas QR no Meta Client não executam retry automático.
- Testes focados de Functions: **37/37 aprovados**.
- `pnpm run test:frontend:emulator`: aprovado, incluindo criação atômica,
  versão dentro do lock, lock perdido, update concorrente, lock expirado,
  delete com lock perdido, delete idempotente, tenant diferente e conexão
  desconectada. Nenhuma chamada à Meta real.

Próxima etapa: revisão final do diff e execução de todas as suítes obrigatórias.

### Etapa 3 — validação local final: concluída

- `pnpm run test:release`: **aprovado com exit 0**. O comando executou
  `check`, todas as suítes unitárias e de segurança, smoke de frontend e
  hardening, login, perfis, dez fluxos Playwright e responsividade.
- `pnpm run test:functions`: **245/245 aprovados**.
- `pnpm run test:rules`: **241/241 Firestore + 5/5 Storage aprovados** com
  Java 21 ativo somente no ambiente local de testes.
- `pnpm run test:frontend:emulator`: aprovado; o hardening validou criação
  QR+lock atômica, versão dentro da aquisição, perda de token, concorrência,
  lock expirado, isolamento entre lojas e delete idempotente.
- `pnpm run test:ui:login`: aprovado; login real no emulador e três perfis
  com navegação/permissões corretas.
- `pnpm run test:ui:flows`: aprovado dentro do `test:release`, incluindo o
  fluxo oficial do WhatsApp de ponta a ponta e o fluxo de produtos.
- `pnpm run test:ui:responsive`: **5 telas x 5 viewports**, sem overflow
  horizontal.
- Uma primeira execução isolada de `test:ui:flows` excedeu o timeout de
  carregamento do WhatsApp porque o callable local `whatsappListQrCodes`
  ficou pendente por mais de 20 segundos após oito fluxos pesados. O mesmo
  fluxo passou isoladamente e voltou a passar na execução completa do
  `test:release`, com resposta em menos de meio segundo. Nenhum timeout ou
  asserção foi enfraquecido.
- Nenhuma chamada à Meta real, deploy, migração, alteração de IAM/secrets
  ou ativação de feature flag ocorreu.

### Commits locais desta revisão até aqui

- `cf8838b` — `fix(whatsapp): preserve PIN on ambiguous registration result`
- `dadfaaa` — `fix(whatsapp): close QR concurrency windows`
- `fd654c4` — `test(whatsapp): cover recovery and lost-lock scenarios`
- `6ae9a88` — `docs(whatsapp): document ambiguous outcomes and reconciliation`
- `44e9323` — `fix(whatsapp): keep incomplete registrations locked`

O push ainda não foi feito. As suítes locais completas estão verdes; o
Quality Gate remoto ainda está pendente e este documento não autoriza merge.

## Histórico da sessão anterior (não representa o estado atual)

As seções abaixo preservam o relatório que acompanhou o HEAD `d7271044`,
antes da revisão independente reaberta no início deste documento. Onde houver
divergência, prevalecem as etapas 1 e 2 acima e os resultados do HEAD atual.

### Branch e estado recebido naquela sessão

- **Branch**: `feat/whatsapp-embedded-signup-production`
- **Base esperada (confirmada)**: `8ff652d5d564c4bcdd3b1d4fc9466511008a76af`
  (= HEAD da `main` no fim da missão anterior, "Fase 1 — visibilidade do
  módulo WhatsApp").
- **SHA do commit WIP recebido (confirmado)**: `e07188b2e280d908c4bddbee7340d80a311e972c`
  — mensagem: `wip(whatsapp): checkpoint embedded signup before final
  hardening`. Exatamente 1 commit à frente da base, 0 atrás — branch limpa,
  sem divergência.
- **Worktree no início desta sessão**: limpo (`git status` sem alterações,
  sem arquivo não rastreado, sem `MERGE_HEAD`/`rebase-merge`/`rebase-apply`/
  `CHERRY_PICK_HEAD` em andamento).
- **Stashes mencionados na missão** (`codex-whatsapp-review-local-before-embedded-signup-2026-07-31`,
  `codex-quality-gate-wip-before-whatsapp-review-2026-07-30`,
  `codex-quality-gate-wip-before-sync-2026-07-23`): **não existem em
  `git stash list` neste ambiente** (lista vazia). Presumivelmente
  pertencem a uma sessão local separada (Codex, fora deste sandbox remoto).
  Nenhuma ação foi ou será tentada sobre eles aqui — não há nada para
  preservar ou tocar neste ambiente.
- **Diff total do commit WIP vs. a base**: 52 arquivos, +3454/-1076 linhas.
  Inclui `functions/src/whatsapp/onboarding.js` (541 linhas),
  `onboarding-core.js` (196), `qr.js` (179), `management.js` (106),
  `config.js` (108), `secrets.js` (331 — reescrito), `docs/meta-whatsapp/*`
  (10 arquivos), `whatsapp-oficial-v1.js` reescrito (867 linhas) e
  `whatsapp-oficial-v1.css` (+100).

## Riscos conhecidos (do prompt da missão, a validar/corrigir)

1. **Bloqueador 1 — ciclo do PIN**: risco de o número ser registrado na Meta
   antes do PIN estar persistido de forma segura no Secret Manager; falha
   no meio pode registrar o número e perder o PIN.
2. **Bloqueador 2 — QR Code**: (a) Meta cria o QR remoto mas a gravação
   local falha → recurso remoto órfão; (b) update/delete concorrentes podem
   se sobrescrever.
3. **Bloqueador 3 — assinatura da WABA**: inscrição acontece antes da
   conclusão local da conexão; falta estratégia seguro para falha
   posterior (não fazer unsubscribe destrutivo sem prova de exclusividade).

## Plano de etapas

1. [em andamento] Ler `onboarding.js`/`onboarding-core.js`/`secrets.js`
   por completo e mapear a ordem real das operações do PIN.
2. Corrigir o ciclo do PIN conforme o contrato da missão (gerar só no
   backend, nunca enviar ao navegador, criar versão temporária antes de
   registrar, promover/destruir conforme resultado, idempotência).
3. Ler `qr.js` por completo e mapear criação/update/delete.
4. Implementar estado operacional + compensação + concorrência no QR.
5. Ler a inscrição da WABA em `onboarding.js` e decidir estratégia segura
   (documentar em `docs/meta-whatsapp/`).
6. Auditar o restante da conclusão do onboarding (token exchange, scopes,
   descoberta de WABA/número, limite de 2 conexões, idempotência, estados).
7. Confirmar feature flags de produção continuam desligadas.
8. Revisar frontend (`whatsapp-oficial-v1.js`/`.css`) contra o checklist.
9. Escrever/ajustar testes cobrindo os 3 bloqueadores.
10. Rodar suíte completa local.
11. Varredura de segredos, revisão do diff.
12. Organizar commits, push, PR Draft, Quality Gate remoto até verde.
13. Relatório final no chat.

## Testes locais (resultado final na diff atual)

- [x] `pnpm run check` — todos os `node --check` passam.
- [x] lint das Functions (`functions && npm run lint`) — passa.
- [x] `pnpm run test:functions` — 234/234 passam, 0 falhas.
- [x] `pnpm run test:unit` — 20/20 no último subteste da cadeia, exit 0,
      0 `not ok` em toda a saída (todas as sub-suítes encadeadas).
- [x] `pnpm run test:rules` — 246/246 (241 Firestore + 5 Storage), 0
      falhas.
- [x] `pnpm run test:frontend:emulator` — inclui o novo
      `whatsapp-hardening.smoke.mjs`; exit 0, todas as asserções passam.
- [ ] `pnpm run test:ui:login` / `test:ui:flows` / `test:ui:responsive` —
      **FALHAM neste sandbox por limitação de ambiente, não por defeito
      de código**: o Playwright não consegue abrir `login.html` através
      do proxy da rede deste ambiente remoto (`net::ERR_TUNNEL_CONNECTION_FAILED`
      em todo recurso externo). Esta é a MESMA limitação já documentada em
      missões anteriores desta mesma sessão (ver histórico) — validação
      real dessas suítes historicamente precisa rodar no GitHub Actions
      (que tem egress real), não neste sandbox. Não é um item pendente
      desta revisão, é um gate externo ao ambiente de desenvolvimento.
- [x] `git diff --check` (contra a base `8ff652d...`) — sem erros de
      whitespace.
- [x] Parsing YAML dos workflows alterados — OK.
- [x] Varredura de credenciais no diff completo vs. a base — nenhum
      padrão real de segredo encontrado (o único hit foi o placeholder
      de teste pré-existente `"EAAG"`/`"EAAG2"` em
      `whatsapp-management-qr-security.test.mjs`, mesmo padrão usado em
      `whatsapp-functions.test.mjs` com `"token-fake"` — nunca um token
      real).
- [x] Verificação das 19 Functions exportadas por
      `functions/src/whatsapp/index.js` — confere exatamente com a lista
      esperada (mesma do teste `whatsapp/index — exporta somente as 19
      Functions do módulo`).
- [x] Nenhum arquivo não rastreado (`git status --untracked-files=all`
      vazio).

## Status atual (atualizado após os 3 bloqueadores)

### Bloqueador 1 — ciclo do PIN: CORRIGIDO

Causa raiz confirmada em `functions/src/whatsapp/onboarding.js`
(`whatsappCompleteOnboarding`): o PIN era gerado em memória e usado em
`provider.registerPhone(...)` **antes** de `adicionarVersaoPinConexao(...)`
ser chamado (isso só acontecia depois, na etapa `saving_secret`). Uma
falha entre as duas chamadas registrava o número na Meta e perdia o PIN
pra sempre.

Correção: PIN gerado -> versão criada no Secret Manager -> referência
exata gravada no documento da tentativa (`pinSecretResourcePending`,
nunca o valor) -> só então `registerPhone`. Se `registerPhone` falhar, a
versão é desabilitada e a referência pendente é limpa (nenhum segredo
órfão). Se `registerPhone` tiver sucesso mas uma etapa **posterior**
falhar, o PIN **nunca** é desabilitado (o número já está registrado de
verdade) — vira log estruturado
`whatsapp.onboarding.phone_registered_connection_incomplete` pra
recuperação administrativa, nunca destruição do segredo. Documentado em
`docs/meta-whatsapp/security-model.md` (seção "Ciclo seguro do PIN de
registro").

**Limitação conhecida e documentada**: não há retomada automática de uma
tentativa que morreu no meio (crash do processo, não erro JS capturável)
— uma nova chamada com o mesmo `attemptId` é rejeitada
(`"já foi processada"`), o que impede duplo registro mas exige nova
tentativa + recuperação administrativa via log. Resumibilidade completa
exigiria transformar `whatsappCompleteOnboarding` numa máquina de estados
resumível — avaliado como fora do escopo seguro desta correção.

### Bloqueador 2 — compensação e concorrência do QR: CORRIGIDO

Causa raiz confirmada em `functions/src/whatsapp/qr.js`: `whatsappCreateQrCode`
gravava o documento local só DEPOIS de criar o QR na Meta, sem nenhuma
compensação se a gravação falhasse (recurso remoto órfão). `whatsappUpdateQrCode`/
`whatsappDeleteQrCode` não tinham lock nem versão otimista — duas
operações concorrentes podiam se sobrescrever silenciosamente. `delete`
de um QR já removido retornava erro em vez de sucesso idempotente.

Correção:
- Criação: lock de idempotência (`whatsapp_qr_locks/create_<hash>`) com
  estados `preparing -> creating_remote -> saving_local -> active`, ou
  `failed`/`compensation_pending`. Uma criação repetida com a mesma
  `idempotencyKey` (agora enviada pelo frontend) nunca chama a Meta de
  novo — reaproveita o resultado ativo ou é rejeitada enquanto a
  primeira ainda está em andamento. Se a gravação local falhar depois da
  criação remota, tenta excluir o QR na Meta; se não conseguir confirmar,
  marca `compensation_pending` com log estruturado (nunca oculta o órfão).
- Update/Delete: lock curto por documento (`operationLock`, com TTL,
  nunca em torno da chamada externa — só protege leitura/escrita local),
  rejeitando operação concorrente explicitamente (`aborted`). Update
  aceita opcionalmente `expectedUpdatedAtMs` (versão otimista via
  `updatedAt` existente, sem inventar contador novo) — edição baseada em
  leitura desatualizada é rejeitada. Delete de um QR já ausente retorna
  `{ ok: true, alreadyDeleted: true }` (idempotente).
- Firestore Rules: nova coleção `whatsapp_qr_locks` bloqueada por padrão
  (`allow read, write: if false`), mesmo padrão das demais coleções
  administradas só por callables.
- Frontend (`whatsapp-oficial-v1.js`): `submitQr` agora gera
  `idempotencyKey` (via `crypto.randomUUID`) na criação e envia
  `expectedUpdatedAtMs` (do último `state.qrCodes` carregado) na edição.

### Bloqueador 3 — assinatura da WABA: DECISÃO TOMADA E DOCUMENTADA (sem mudança destrutiva)

Decisão: tratar `subscribeWaba` como operação idempotente da plataforma,
**nunca** desfeita automaticamente por falha posterior — não há como
provar com segurança que a inscrição foi criada exclusivamente por uma
tentativa específica (WABA pode ser compartilhada entre conexões), e a
documentação oficial vigente não garante um sinal de exclusividade
utilizável. Nenhum `unsubscribe` automático foi adicionado. Documentado
em `docs/meta-whatsapp/security-model.md` (seção "Assinatura da WABA
(webhook)"), com comentário inline no código apontando pra essa seção.
Nenhum código precisou ser revertido — o comportamento atual (nunca
desinscrever) já era o padrão antes desta revisão; a mudança real foi
decidir e documentar isso deliberadamente, não uma correção de bug.

## Testes escritos para os 3 bloqueadores (atualizado)

### PIN (Bloqueador 1)

Extraída a decisão pura de limpeza do PIN pra `onboarding-core.js`
(`decidePinSecretCleanup({ pinSecretVersion, phoneRegistered })`, mesmo
espírito de `avaliarConexao`/`decidirAtualizacaoStatus` já usados no
projeto) e `onboarding.js` passou a chamá-la em vez da lógica inline.
Testada em `tests/functions/whatsapp-onboarding-core.test.mjs` (3 casos
novos, os 19 testes do arquivo passam):
- sem versão de PIN (falha antes do registro) -> `"none"`.
- registerPhone nunca teve sucesso -> `"disable"` (desabilita a versão
  temporária).
- registerPhone teve sucesso, falha posterior -> `"preserve_pending_recovery"`
  (nunca desabilita).

**Lacuna documentada honestamente**: não existe um teste de integração
que force `registerPhone` a lançar de verdade (a chamada "durante o
registro" que dispara a limpeza inline logo abaixo dela). `emulatorMeta()`
não tem um hook de falha injetável e `metaClient` (usado fora do Emulator)
não é injetável a partir de `onboarding.js` — só o é dentro de
`metaClient.js` via `fetchImpl`, que `onboarding.js` não expõe. Construir
esse hook exigiria uma nova costura de injeção de dependência só para
teste, o que foi avaliado como desproporcional para esta revisão (ver
instrução da missão contra arquitetura excessiva). Essa parte específica
(o `try/catch` ao redor de `provider.registerPhone` que desabilita a
versão e limpa `pinSecretResourcePending` antes de relançar) é simples o
bastante (sem ramificação condicional) para ficar coberta por revisão de
código + `node --check`, mas não por um teste automatizado nesta entrega.
"Reconexão preservando a credencial anterior" já tinha teste pré-existente
(`supersededCredentialVersions`), não duplicado.

### QR Code (Bloqueador 2)

Novo `tests/emulator/whatsapp-hardening.smoke.mjs`, adicionado à cadeia
de `pnpm run test:frontend:emulator` (Functions+Firestore Emulator local,
sem Playwright, mesmo estilo de `frontend-emulator-smoke.mjs`). Rodado
localmente com sucesso (`Script exited successfully (code 0)`), cobre:
onboarding mockado cria conexão -> criação de QR idempotente (mesma
`idempotencyKey` nunca chama a Meta duas vezes, `reused: true` na
segunda) -> update com `expectedUpdatedAtMs` desatualizado rejeitado
(`failed-precondition`) -> lock de operação em andamento rejeita update
concorrente (`aborted`) -> lock expirado é reclamado normalmente (não
trava o recurso pra sempre) -> delete idempotente (segunda exclusão
devolve `alreadyDeleted: true`) -> update depois de delete rejeitado
(`not-found`).

**Decisão de design do teste de concorrência**: a primeira tentativa
(duas chamadas HTTP disparadas via `Promise.allSettled`) se mostrou
não-determinística — as duas terminaram tarde o bastante pra nunca
colidirem de verdade no mesmo lock (2 sucessos em vez de 1+1). Corrigido
simulando o lock diretamente via Admin SDK (grava `operationLock` como o
próprio `acquireQrDocLock` gravaria, ignorando Rules) antes de chamar a
callable — testa a garantia real ("lock ativo rejeita") de forma
determinística, sem depender de vencer uma corrida de rede local.

**Lacunas documentadas honestamente**: (1) falha do Firestore *depois* da
criação remota (caminho de compensação) não é exercida por teste
automatizado — forçar essa falha exigiria injetar uma falha no SDK do
Firestore, não tentado nesta revisão; protegido só por revisão de código
do `try/catch` em `whatsappCreateQrCode` (compensa via
`deleteMessageQrCode`, marca `compensation_pending` se não conseguir
confirmar). (2) QR de outro tenant e conexão desconectada não têm teste
dedicado nesta revisão — a validação (`ownerUid` no doc, `resolvedConnection`
exigindo `status === "connected"`) é a mesma já validada por
`whatsapp-management-qr-security.test.mjs`/Rules pré-existentes para o
restante do módulo; não widened aqui por proporcionalidade, mas é um alvo
razoável para uma revisão futura se o QR crescer em uso.

### WABA (Bloqueador 3)

Nenhum teste novo necessário — a decisão foi não adicionar nenhum código
de `unsubscribe`, então não há comportamento novo pra exercitar. Os
testes de frontend/segredos pré-existentes (`whatsapp-management-qr-security.test.mjs`,
seção "ausência de credenciais") continuam válidos e passam.

## Auditoria do restante da conclusão do onboarding (ponto 7 da missão)

Revisão completa de `whatsappStartOnboarding`, `whatsappCompleteOnboarding`,
`whatsappGetOnboardingStatus` e `whatsappCancelOnboarding` além dos 3
bloqueadores — nenhum gap novo encontrado, tudo já correto (trabalho
pré-existente do checkpoint recebido):
- Token exchange/scopes/App ID validados via `debugToken` (`is_valid`,
  `app_id` == config.appId, todos os `META_PERMISSIONS` presentes).
- WABA/número: descoberta 100% server-side (`extractWabaTargets` a partir
  de `granular_scopes`), hints do frontend só usados como desempate
  quando já pertencem ao conjunto verificado (`selectVerifiedAsset`).
- Conflito de `phoneNumberId` global: checado 2x — pré-checagem fora da
  transação e checagem real dentro da MESMA transação atômica que escreve
  a rota (`whatsapp_phone_routes`), por isso livre de corrida entre duas
  contas tentando o mesmo número ao mesmo tempo.
- Limite de 2 conexões: checado 2x (no início e de novo dentro da
  transação final) — mesma proteção contra corrida.
- Tentativa repetida: bloqueada por `attempt.status !== "awaiting_meta"`
  em `whatsappCompleteOnboarding` (nunca reprocessa uma tentativa já
  concluída/em andamento).
- Lock expirado: reclamável (`lock.expiresAt` comparado com `now`).
- Sync de templates: falha vira `templateWarning`/`templateSyncStatus:
  "failed"` recuperável — nunca desfaz a conexão já commitada.
- Correlation ID propagado em logs/auditoria/erro público; nenhuma
  mensagem crua da Meta ou stack chega ao cliente (`core.publicError`).
- `whatsappCancelOnboarding` só permite cancelar em `starting`/
  `awaiting_meta` (nunca depois de `connected`), sempre tenant-scoped.
- `whatsappGetOnboardingStatus` sempre valida `ownerUid`/`initiatedByUid`
  antes de devolver qualquer dado (nunca cross-tenant).

## Feature flags e checklist do frontend (confirmado, sem gaps)

- `functions/src/whatsapp/config.js`: todas as flags de produção
  (`embeddedSignup`, `coexistence`, `secondConnection`, `qrCodes`,
  `reconnect`, `disconnect`) e `shouldEnforceAppCheck()` continuam com
  fallback `false` fora do Emulator — nada foi alterado neste arquivo
  nesta revisão. `docs/meta-whatsapp/production-readiness.md` já orienta
  "Mantenha as flags desligadas".
- Revisão completa de `whatsapp-oficial-v1.js` contra o checklist de 18
  itens da missão — nenhum gap encontrado, nenhuma mudança necessária:
  botão de conectar desabilitado quando a plataforma não está disponível;
  popup só abre depois de `whatsappStartOnboarding` confirmar
  disponibilidade (revalidada no backend); polling de status limitado a
  ~24s sem loop infinito; cancelamento bloqueado durante a "zona crítica"
  (`state.onboardingAtual.critical`, inclusive intercepta o Esc do
  `<dialog>`); popup bloqueado tratado com mensagem específica;
  listener `message` sempre limpo (`cleanup()`) em todos os caminhos;
  nenhum ID técnico cru exibido (só campos mascarados em
  `adminDiagnostics`, e esse bloco só existe na resposta quando
  `context.isAdmin`, ver `send.js:415`); nenhum segredo no frontend
  (confirmado pelo teste existente); funcionário sem permissão nunca vê
  botões de ação (`podeGerenciar()`); reconectar só aparece pra conexões
  `disconnected`/`revoked`, nunca pra uma já `connected`; limite físico
  de conexões vem direto do backend (que já exclui `disconnected`/
  `revoked` da contagem); cancelar depois de concluído nunca chama o
  backend (attemptId já foi limpo nesse ponto).

## Estado final

Todas as etapas do plano foram concluídas. PR Draft #41 aberto em
`VideDigital/vide-digital` (`feat/whatsapp-embedded-signup-production`
-> `main`), Quality Gate remoto **verde nos 4 jobs**
(https://github.com/VideDigital/vide-digital/actions/runs/30666817828).
Nenhum merge, nenhum deploy foi realizado. Ver relatório final entregue
no chat para o detalhamento completo (git state / implementação / testes
/ Quality Gate / segurança / pendências externas).
