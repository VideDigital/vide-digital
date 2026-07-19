# Cloud Functions Plan — Vide Hub V1

## Objetivo

Definir a arquitetura futura para operações sensíveis que não devem depender apenas do frontend.

## Funções prioritárias

| Função | Objetivo | Motivo |
|---|---|---|
| `createEmployee` | Criar usuário Auth e `funcionarios/{uid}` atomicamente | Evitar sessão secundária no browser e Auth órfão. |
| `disableEmployee` | Desativar funcionário em Firestore e Auth | Funcionário inativo não deve conseguir login. |
| `resetEmployeePassword` | Reset seguro de senha | Não revelar senha temporária indefinidamente. |
| `updateEmployeePermissions` | Alterar permissões com validação owner/admin | Impedir autoelevação. |
| `validatePlanLimit` | Validar limites de plano em writes críticos | LocalStorage/frontend não autoriza plano. |
| `adminUpdateStoreStatus` | Aprovar/rejeitar/suspender lojas | Centralizar auditoria admin. |
| `auditWrite` | Registrar ação, `authUid`, `ownerUid`, módulo e origem | Observabilidade e investigação. |

## Custos e deploy

- Cloud Functions pode exigir billing ativo.
- Deploy deve ser feito fora deste PR após validação.
- Não criar dependência obrigatória imediata para o frontend atual.

## Segurança

- Todas as funções devem validar `context.auth.uid`.
- Admin deve ser confirmado por custom claim ou leitura segura server-side.
- Nunca aceitar `ownerUid` livre do cliente sem validar vínculo.
- Logs não devem conter senha, token ou dados sensíveis.
