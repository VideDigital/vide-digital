# Sprint 106 — Sincronização segura da equipe entre Firestore e Firebase Auth

## Contrato
As Cloud Functions `createEmployee`, `enableEmployee` e `disableEmployee` operam sobre dois serviços que **não compartilham transação**. A reserva de vaga/status no Firestore é protegida por `employee_capacity_guards/{ownerUid}`, e o documento individual guarda `authSyncPendente: true` e um `authSyncId` aleatório, até o término das chamadas ao Auth.

A Firestore Rule proposta na PR #113 exige funcionário ativo **e** `authSyncPendente != true` (documentos antigos sem flag são compatíveis). Portanto, durante uma operação em trânsito, a equipe não consegue acessar dados privados do tenant. Uma segunda mudança de status da mesma conta falha com `failed-precondition`, mesmo que seja retry ou double-click.

### Fluxos normais
- **Criar:** criar Auth desabilitado → transação de reserva de vaga + pendência → habilitar Auth → completar a pendência por `authSyncId`.
- **Reativar/desativar:** transação muda o status e registra pendência → `updateUser` → `revokeRefreshTokens` → completa pendência.
- **Concorrência:** a segunda chamada recebe erro de operação em andamento. Não tentar forçar sucesso nem reordenar as chamadas ao Auth.
- **Falha na criação antes de tentar habilitar Auth:** excluir primeiro a identidade Auth; somente se a exclusão for confirmada remover a reserva no Firestore. Se a exclusão Auth falhar, manter a pendência (fail closed).
- **Falha depois de enviar a habilitação ao Auth:** não apagar a identidade, pois um timeout pode esconder sucesso no Auth ou commit do Firestore. Manter pendência quando aplicável, sinalizar resultado incerto e exigir reconciliação auditada. Não prometer rollback atômico.
- **Falha na ativação/desativação ou conclusão:** manter `authSyncPendente: true` (fail closed). Logar IDs técnicos, nunca senha nem dados do cliente.

### Incidente: pendência que não foi finalizada
**Não executar script automático para limpar pendências** e não baixar uma flag sem verificar o Auth.

1. Confirmar o projeto `vide-digital-saas`, ambiente e tenant usando fonte confiável; nunca usar cliente real como fixture.
2. Identificar `funcionarios/{uid}`, `donoUID`, `status`, `authSyncPendente`, `authSyncId`, `updateTime`, projeto Auth e histórico de execução da Function.
3. Confirmar que **não há operação concorrente/in-flight** para o UID. Sem essa confirmação, HARD STOP.
4. Ler estado do usuário no Firebase Auth (existente, `disabled`, estado de tokens), status/plano do proprietário, contagem real de funcionários ativos e log da operação que falhou.
5. Elaborar procedimento específico com precondições de versão/identidade: reconciliar o Auth com a intenção aprovada, revogar refresh tokens, verificar contagem/cross-tenant e **só então** encerrar a pendência. É proibido apagar ou recriar registros por nome ou e-mail.
6. Registrar autorização do operador antes de qualquer mudança administrativa fora do fluxo normal, executar no tenant QA quando se tratar de validação e confirmar leituras negativas/positivas no Emulator.
7. Se o estado for ambíguo, manter pendência e escalar. A ausência de um runbook de reconciliação automática é risco operacional residual até implementação dedicada.

### Validação e dependências
- A PR #112 isolada não substitui a proteção de Rules da PR #113.
- A PR #114 integra o escopo, mas é de QA, **não mergear**.
- Exigir Quality Gate no SHA final das PRs individuais e combinadas.
- Ordem recomendada de publicação futura (mediante autorizações separadas): Rules de bloqueio de acesso **antes** das Functions com flag de pendência; nunca publicar Functions genericamente, nem `whatsapp*`.
- **Nenhum deploy/merge está autorizado por este documento.**

## Limitadores de teste
Os testes com Firebase Emulator comprovam as transações de reserva, bloqueio de segunda operação, status da loja e Rules de acesso. Os testes determinísticos das chamadas externas Auth usam mocks para controlar a ordem de execução. Isso **não equivale** a prova de corrida de rede no Auth de produção e deve constar na avaliação GO/NO-GO.
