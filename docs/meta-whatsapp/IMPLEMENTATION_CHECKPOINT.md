# Checkpoint — Embedded Signup WhatsApp em produção (hardening final)

> Este arquivo é o mecanismo de acompanhamento vivo desta missão. Atualizado
> após cada etapa importante. Se o contexto acabar antes da conclusão, este
> arquivo (mais o relatório entregue no chat) é a fonte da verdade para
> retomar o trabalho.

## Branch e estado recebido

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

## Testes ainda necessários (a marcar conforme execução)

- [ ] `pnpm run check`
- [ ] lint das Functions
- [ ] `pnpm run test:functions`
- [ ] `pnpm run test:unit`
- [ ] `pnpm run test:rules`
- [ ] `pnpm run test:frontend:emulator`
- [ ] `pnpm run test:ui:login`
- [ ] `pnpm run test:ui:flows`
- [ ] `pnpm run test:ui:responsive`
- [ ] `git diff --check`
- [ ] varredura de credenciais/segredos
- [ ] verificação das Functions exportadas (index.js)

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

## Próximos passos (em ordem)

1. Auditoria do restante da conclusão do onboarding (token exchange,
   scopes, descoberta WABA/número, idempotência global, estados
   recuperáveis) — verificar se algo mais precisa de ajuste.
2. Confirmar feature flags de produção continuam desligadas
   (`docs/meta-whatsapp/production-readiness.md` / `config.js`).
3. Revisão do frontend contra o checklist da missão (botões, popup,
   cancelamento, permissões, sidebar, limite físico de conexões).
4. Escrever testes cobrindo os 3 bloqueadores (PIN: falha antes/durante/
   depois do registro, repetição, limpeza; QR: criação normal, repetição
   idempotente, falha do Firestore pós-criação remota, compensação
   sucesso/falha, update concorrente, update após delete, dois deletes,
   QR de outro tenant, conexão desconectada).
5. Rodar suíte completa local (`pnpm run check`, `test:functions`,
   `test:unit`, `test:rules`, `test:frontend:emulator`, `test:ui:login`,
   `test:ui:flows`, `test:ui:responsive`).
6. Varredura de segredos no diff final.
7. Organizar commits por responsabilidade, push, PR Draft, Quality Gate
   remoto até verde.
8. Relatório final no chat.
