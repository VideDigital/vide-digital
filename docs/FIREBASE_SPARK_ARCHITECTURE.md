# Arquitetura Firebase Spark (decisão definitiva)

O Vide Digital roda **integralmente no plano Firebase Spark (gratuito)**:

- **não** migra para Blaze;
- **não** depende de Cloud Functions em produção;
- **não** exige cartão nem serviço pago para funcionar;
- toda escrita é **direta do cliente**, protegida por Security Rules rigorosas;
- backend externo gratuito (ex.: Cloudflare Worker) só entrará no futuro quando um segredo (chave de IA) ou uma operação privilegiada realmente exigir.

## Serviços usados

| Serviço | Uso |
|---|---|
| GitHub Pages | Frontend (HTML/CSS/JS puros, sem bundler) |
| Firebase Authentication | Login de donos, funcionários e admins |
| Cloud Firestore | Todos os dados (multi-tenant) |
| Firebase Storage | Imagens (regras próprias em `storage.rules`) |
| Security Rules | Toda a autorização — publicadas pelo workflow "Deploy Firebase Spark" |

## Modelo de identidade e tenant (canônico — não criar outro)

- **Dono**: conta de Auth cujo uid é o **tenant** (`storeUid`). Documento `usuarios/{uid}`.
- **Funcionário**: conta de Auth própria + vínculo `funcionarios/{authUid}` com `donoUID`, `status` ("ativo"/"inativo") e `permissoes { ver: [...], editar: [...] }`. Editar implica ver.
- **Backend admin**: claim `videAdmin: true` no token (concedida externamente — ver abaixo). `equipe_admin/` é só UX do painel master, nunca fonte de privilégio nas Rules.
- Campos de tenant nos documentos: `criadoPor` (produtos/leads/avaliações), `donoUID` (chats/LPs/vitrines), `tenantId` + `lojaId` (família IA). O contexto autenticado resolve tudo em `core/vide-context.js` (`VideHubContext`).

## O que substituiu cada Cloud Function

| Function antiga | Substituição Spark |
|---|---|
| `incrementPublicMetric` | Escrita direta em `metricas_landing_pages` / `metricas_vitrines` / `metricas_produtos`, validada por `metrica*Valida()` (documento público real precisa existir; só chaves de métrica; sem zerar/substituir dados) |
| `createPublicLead` | Escrita direta em `leads` (`leadPublicoValido()`): `criadoPor` precisa apontar para um dono real, status nasce "novo". Usada por loja.html, lp-forms-v5.js e lp-public-v4.js |
| `createPublicChat` / `sendPublicChatMessage` | Escrita direta em `chats` + `chats/{id}/mensagens`; o id aleatório do chat é a capability do visitante |
| `sendAdminChatMessage` (dono/funcionário responde) | Escrita direta da mensagem "admin" validada por `mensagemAdminValida()` (só dono/funcionário do tenant) |
| `markNotificationRead` | Escrita direta em `notificacoes/{id}.lidoPor` (`leituraNotificacaoPropriaValida()`: cada pessoa só adiciona/remove o próprio uid) |
| `createEmployee` / `updateEmployee` / `enable/disableEmployee` | App Firebase **secundário** no navegador cria a conta de Auth do funcionário (sessão do dono intacta); vínculo `funcionarios/{uid}` é escrita direta autorizada **só para o dono** do tenant. Desativar muda `status` — o funcionário inativo até autentica, mas as Rules negam qualquer dado |
| `adminUpdateStoreStatus` / `adminUpdatePlan` | Escrita direta em `usuarios/{uid}` autorizada pela claim `videAdmin` |
| `createAdminMember` / `syncAdminClaims` | **Etapa externa**: `scripts/set-admin-claim.mjs` rodado localmente com Admin SDK (ver abaixo) |
| `resetEmployeePassword` | Não há UI que a use; caminho futuro é `sendPasswordResetEmail` do próprio Auth |

O diretório `functions/` permanece como **legado/referência** (o contrato antigo e os validadores puros testados em `tests/functions/`). Nenhuma página de produção importa `core/vide-functions.js` e o workflow **nunca** publica Functions.

## Diferenças conscientes vs. o modelo com Functions (riscos residuais)

- **Sem rate limit de servidor** nas escritas públicas (leads/métricas/chat). As Rules prendem cada escrita a conteúdo público real e a chaves específicas, então o alcance de abuso fica restrito ao próprio documento — mas um bot pode inflar contadores/criar leads em volume. Mitigação futura: App Check + Worker.
- **"Capping" de permissões de funcionários**: a Function impedia que um funcionário concedesse a colegas mais permissões do que ele próprio tinha. Rules não expressam isso com segurança equivalente, então a gestão de funcionários é **exclusiva do dono** (funcionário com "funcionarios: editar" recebe mensagem clara).
- **Desativar funcionário não desativa a conta de Auth** (exigiria Admin SDK) — mas sem `status == "ativo"` no vínculo, as Rules negam tudo; o login vira uma sessão inútil.
- **Auditoria centralizada (writeAudit)** deixou de existir nas operações migradas.

## Bootstrap do admin master (uma única vez, externa)

A claim `videAdmin` não pode nascer do navegador (seria privilégio auto-concedido). O dono da plataforma roda localmente:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/caminho/chave.json \
  node scripts/set-admin-claim.mjs admin@exemplo.com          # conceder
  node scripts/set-admin-claim.mjs admin@exemplo.com --remove # revogar
```

Requer a chave JSON da conta de serviço (a mesma usada no deploy). Depois de conceder, sair e entrar de novo. Sem essa claim, o painel `admin.html` autentica mas as escritas administrativas são negadas pelas Rules.

## Deploy (Rules + Storage + índices)

Workflow **"Deploy Firebase Spark"** (`.github/workflows/firebase-deploy.yml`): manual (`workflow_dispatch`), branch `main`, `project_id` exato `vide-digital-saas`, confirmação literal `DEPLOY`, toda a suíte de testes antes de autenticar, e publica **apenas** `firestore:rules`, `storage` e `firestore:indexes`, nesta ordem. Autenticação: Workload Identity Federation (`GCP_WORKLOAD_IDENTITY_PROVIDER` + `GCP_SERVICE_ACCOUNT`) ou chave `FIREBASE_SERVICE_ACCOUNT`; sem nenhum dos dois o job falha com instrução clara.

Deploy manual equivalente:

```bash
firebase login
firebase use vide-digital-saas
firebase deploy --only firestore:rules,firestore:indexes,storage
```

## Versões exigidas

| Ferramenta | Versão |
|---|---|
| Node.js | 22 (>= 22.13.0 — exigência do pnpm 11.9.0) |
| pnpm | 11.9.0 (fixo, `packageManager`) |
| Java | 21 (Firestore Emulator nos testes) |

## Camada futura de IA (contratos, sem implementação de provedor)

Nenhuma chave de IA no frontend nem no Firestore. Quando a assistente real for conectada, a chamada sairá de um backend externo gratuito (Cloudflare Worker) com contrato:

```
generateReply({ storeUid, conversationId, userMessage, knowledgeContext, assistantConfig })
```

Interfaces previstas: `AiProvider`, `KnowledgeRepository` (lê `base_conhecimento_ia` do tenant), `ConversationRepository` (lê/escreve `chats`), `UsageLimiter` (rate limit por loja) e `AuditLogger`. O Worker guarda a chave em secret binding, valida o token Firebase do chamador, resolve o tenant pelo token (nunca por parâmetro solto), aplica CORS restrito ao domínio da plataforma e registra auditoria. Nada disso é publicado sem credenciais reais.
