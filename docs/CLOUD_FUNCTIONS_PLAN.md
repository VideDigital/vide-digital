# Cloud Functions Plan — Vide Hub V1

## Objetivo

Definir o backend obrigatório para remover operações sensíveis do frontend antes de publicar Firestore/Storage Rules restritivas.

## Contrato comum

- Região sugerida: `southamerica-east1` ou região final validada pelo projeto.
- Preferência: Callable Functions para dashboard/admin autenticados; HTTP Functions apenas para entradas públicas que precisem App Check/CORS explícito.
- Autenticação: `context.auth.uid` obrigatório em funções privadas.
- App Check: obrigatório para `createPublicLead`, `incrementPublicMetric`, `createPublicChat` e `sendPublicChatMessage`.
- Auditoria: gravar `authUid`, `ownerUid`, módulo, ação, origem, data e resultado.
- Logs: nunca registrar senha, token, payload sensível completo ou dados de cartão.
- Rate limit: obrigatório em endpoints públicos.
- Idempotência: usar chave de requisição quando houver risco de duplicidade.
- Transações: usar em plano/limites, contadores e criação de Auth + Firestore.

## Functions mínimas

| Função | Tipo | Auth/App Check | Validação | Saída |
|---|---|---|---|---|
| `createEmployee` | callable | owner/admin | plano, limite, e-mail, tenant, permissões | uid e dados sanitizados |
| `updateEmployee` | callable | owner/admin | tenant, permissões, sem autoelevação | status de atualização |
| `disableEmployee` | callable | owner/admin | tenant, idempotência | funcionário inativo |
| `resetEmployeePassword` | callable | owner/admin | tenant e e-mail | envio/reset seguro |
| `syncAdminClaims` | callable/admin job | admin backend | `equipe_admin` → custom claims | claims sincronizadas |
| `adminUpdateStoreStatus` | callable | `videAdmin` | status permitido | loja aprovada/rejeitada/inativa |
| `adminUpdatePlan` | callable | `videAdmin` | plano/features permitidas | plano atualizado |
| `createPublicLead` | HTTP/callable | App Check | loja/LP publicada, campos, rate limit | lead criado |
| `incrementPublicMetric` | HTTP/callable | App Check | loja/produto publicado, incremento permitido | métrica incrementada |
| `createPublicChat` | HTTP/callable | App Check | tenant, cliente, rate limit | chat criado |
| `sendPublicChatMessage` | HTTP/callable | App Check | sender cliente, chat válido | mensagem criada |
| `auditWrite` | backend/internal | service account | payload de auditoria | log registrado |

## Fluxo `createEmployee`

1. Validar caller owner/admin.
2. Confirmar tenant real pelo Auth/claim, não por campo livre do cliente.
3. Validar plano e limite de subcontas.
4. Normalizar e validar e-mail.
5. Verificar duplicidade em Auth/Firestore.
6. Criar usuário Auth.
7. Criar `funcionarios/{uid}` com `donoUID`, status e permissões.
8. Se Firestore falhar, desativar/remover Auth criado quando possível.
9. Registrar auditoria.
10. Retornar somente dados sanitizados.

## Fluxo `disableEmployee`

- validar owner/admin do tenant;
- impedir funcionário desativar a si mesmo;
- atualizar Firestore;
- desativar Auth;
- chamar `revokeRefreshTokens`;
- registrar auditoria;
- ser idempotente para funcionário já inativo.

## Admin claims

- `videAdmin: true` autoriza rules administrativas.
- `videSupport: true` pode ser criado depois para suporte limitado.
- `equipe_admin` pode ser origem administrativa, mas a autorização final em rules deve vir de custom claim.
- Após alterar claims, revogar refresh tokens e orientar renovação de sessão.
- Super admin por e-mail hardcoded é legado de UX e deve ser removido futuramente.

## Erros, custo e rollback

- Respostas devem usar códigos previsíveis: `permission-denied`, `failed-precondition`, `invalid-argument`, `already-exists`.
- Monitorar leituras/escritas, invocações, cold start e rejeições por App Check.
- Versionar Functions e manter plano de reimplantação anterior.
- Não tornar Functions dependência obrigatória do frontend atual antes da migração coordenada.
