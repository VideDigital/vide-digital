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

## Status atual

Investigação em andamento. Nenhuma correção aplicada ainda além deste
checkpoint. Próximo passo imediato: ler `onboarding.js`/`onboarding-core.js`
por completo para mapear o ciclo real do PIN (Bloqueador 1).
