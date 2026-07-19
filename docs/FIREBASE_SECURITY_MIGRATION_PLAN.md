# Firebase Security Migration Plan — Vide Hub V1

> PROPOSTA NÃO PRONTA PARA PRODUÇÃO.
> Não publicar Firestore Rules, Storage Rules ou Cloud Functions antes de concluir Cloud Functions, custom claims, testes no Emulator, migração do frontend e validação autenticada.

## Objetivo

Definir a migração segura entre o frontend atual, que ainda escreve diretamente em várias coleções, e um backend restritivo baseado em Cloud Functions, custom claims e rules testadas no Emulator.

## Fase A — Estado atual do frontend

O app atual ainda executa operações sensíveis diretamente do navegador:

- `dashboard-app.js` cria, atualiza e desativa documentos em `funcionarios`.
- `admin.html` altera `usuarios.status`, `usuarios.plano` e `usuarios.featuresManuais`.
- `loja.html` e `lp-forms-v5.js` criam leads públicos e incrementam métricas.
- `loja.html` cria chats e mensagens públicas.
- uploads principais ainda usam base64 no Firestore, não Storage.

Riscos atuais:

- Auth órfão ao criar funcionário no browser.
- tentativa de autoelevação se rules aceitarem campos administrativos vindos do cliente.
- spam em leads, métricas e chat público.
- dependência de validações de frontend para fluxos administrativos.

Nesta fase, não publicar as rules restritivas finais sem migrar o frontend, porque isso quebraria funcionários, leads públicos, métricas públicas e chat.

## Fase B — Backend obrigatório

Implementar Cloud Functions antes de publicar rules restritivas:

- `createEmployee`
- `updateEmployee`
- `disableEmployee`
- `resetEmployeePassword`
- `syncAdminClaims`
- `adminUpdateStoreStatus`
- `adminUpdatePlan`
- `createPublicLead`
- `incrementPublicMetric`
- `createPublicChat`
- `sendPublicChatMessage`
- `auditWrite`

Requisitos:

- usar projeto de staging;
- usar Emulator Suite;
- usar App Check nos endpoints públicos;
- aplicar rate limit em lead, métrica e chat;
- validar tenant no backend;
- registrar auditoria;
- tornar operações críticas idempotentes;
- revogar refresh tokens quando permissões/admin/status mudarem.

## Fase C — Publicação das rules restritivas

Depois da migração:

1. Executar testes unitários de rules no Emulator.
2. Executar testes autenticados owner, employee, admin e público em staging.
3. Fazer backup/export do Firestore.
4. Salvar rules atuais de Firestore e Storage.
5. Publicar Functions primeiro.
6. Atualizar frontend para chamar Functions.
7. Publicar Firestore Rules e Storage Rules restritivas.
8. Validar fluxos críticos.
9. Monitorar erros de permissão e custos.

## Rollback da migração

- reverter frontend por PR controlado;
- restaurar rules anteriores salvas;
- reimplantar versão anterior das Functions quando possível;
- revogar ou reemitir custom claims se necessário;
- registrar janela, autor, impacto e validação pós-rollback.

Índices podem ter propagação e não devem ser tratados como rollback instantâneo.
