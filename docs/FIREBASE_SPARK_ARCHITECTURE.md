# Arquitetura Firebase (Spark → Blaze, sem Functions em produção)

> **Nome do arquivo mantido por compatibilidade** (referenciado por outros
> docs e pelo nome do workflow "Deploy Firebase Spark"), mas o conteúdo
> abaixo reflete o estado real: o projeto está no plano **Blaze**. A
> mudança de Spark para Blaze foi necessária porque o **Firebase Storage em
> produção passou a exigir faturamento habilitado** (Google desativou o uso
> de Storage em produção no plano Spark) — não foi uma decisão de arquitetura,
> foi um requisito externo da própria Google para manter Storage funcionando.
> **Blaze não significa "usar Cloud Functions para tudo"**: a arquitetura
> de escrita direta do cliente, protegida por Firestore Rules, continua
> sendo a regra — ver detalhes abaixo.

## O que Blaze muda e o que não muda

- **Muda**: o projeto agora tem uma conta de faturamento vinculada no
  Google Cloud (exigência do Storage em produção). Isso habilita, tecnicamente,
  o uso de Cloud Functions, Cloud Run e outros serviços pagos — **mas nenhum
  workflow atual publica Functions**, e nenhuma delas roda em produção hoje.
- **Não muda**: a maior parte das escritas continua **direta do cliente**
  pro Firestore, protegida por Security Rules — o mesmo modelo desenhado
  para o Spark. **Firestore Rules continuam sendo a principal barreira de
  segurança do produto**, não um segredo de servidor nem uma Cloud Function.
- **Orçamento do Google Cloud é um alerta, não um limite de cobrança**: um
  orçamento configurado no console do Google Cloud dispara e-mail de aviso
  ao ultrapassar um valor, mas **não bloqueia** a cobrança nem interrompe o
  serviço automaticamente — é observabilidade, não um teto físico de gasto.
  Configurar isso é responsabilidade externa (console do Google Cloud), fora
  do escopo deste repositório.

## Quando uma Cloud Function passa a se justificar

> **Atualização**: o primeiro desses cenários deixou de ser hipotético, e
> agora tem duas Functions reais. `askBusinessAI` (`functions/src/ai/`)
> — o dono conversa sobre o próprio negócio — está publicada e
> confirmada em produção com resposta real do Gemini. `askPublicBusinessAI`
> (mesmo diretório) — um visitante da loja pública conversa sobre o
> catálogo, sem login, só se o dono ativar um toggle — tem o código
> completo, testado e revisado, publicada na mesma leva de deploy que
> `askBusinessAI`. Ambas chamam o mesmo provedor de IA real (Google
> Gemini) com a chave guardada como secret do Firebase Functions. Ver
> `docs/IA_NEGOCIO.md`. Nenhum outro cenário abaixo foi implementado.

Cloud Functions ficam reservadas para quando existir uma necessidade real
que a escrita direta do cliente não consegue cobrir com segurança:

- **IA real** (chamada a um provedor externo com chave secreta) —
  implementado e publicado (`askBusinessAI`, `askPublicBusinessAI`);
- **WhatsApp oficial** (integração que exige backend e credenciais próprias);
- **qualquer segredo** que não pode existir no frontend (chave de API,
  token de terceiro);
- **webhooks** (endpoint que um serviço externo chama, não o navegador);
- **rate limit confiável** (Rules não impedem volume de escrita de forma
  server-side real — só restringem o formato/dono de cada escrita);
- **operações privilegiadas** que exigem Admin SDK (ex.: mexer em claims de
  Auth de outra conta, o que o claim `videAdmin` sozinho não cobre);
- **processamento assíncrono real** (algo que precisa rodar depois da
  resposta ao usuário, não durante).

Nenhum desses cenários está implementado ainda. Quando um deles for
implementado de verdade, com credenciais reais, a Function correspondente
some da lista de "legado" abaixo e vira produção — documentar essa
transição neste arquivo quando acontecer.

## Serviços usados

| Serviço | Uso |
|---|---|
| GitHub Pages | Frontend (HTML/CSS/JS puros, sem bundler) |
| Firebase Authentication | Login de donos, funcionários e admins |
| Cloud Firestore | Todos os dados (multi-tenant) |
| Firebase Storage | Imagens (regras próprias em `storage.rules`) — exige Blaze em produção |
| Security Rules | Toda a autorização — publicadas pelo workflow "Deploy Firebase Spark" |

## Modelo de identidade e tenant (canônico — não criar outro)

- **Dono**: conta de Auth cujo uid é o **tenant** (`storeUid`). Documento `usuarios/{uid}`.
- **Funcionário**: conta de Auth própria + vínculo `funcionarios/{authUid}` com `donoUID`, `status` ("ativo"/"inativo") e `permissoes { ver: [...], editar: [...] }`. Editar implica ver.
- **Backend admin**: claim `videAdmin: true` no token (concedida externamente — ver abaixo). `equipe_admin/` é só UX do painel master, nunca fonte de privilégio nas Rules.
- Campos de tenant nos documentos: `criadoPor` (produtos/leads/avaliações), `donoUID` (chats/LPs/vitrines), `tenantId` + `lojaId` (família IA). O contexto autenticado resolve tudo em `core/vide-context.js` (`VideHubContext`).

## O que substituiu cada Cloud Function (legado, não publicado)

O diretório `functions/` existe como **legado / testes / contrato futuro** —
o código antigo continua ali, com validadores puros testados em
`tests/functions/`, mas **nenhum workflow publica as Functions abaixo**.
Se algum dia uma delas voltar a ser necessária (ver seção acima), o
código de referência já existe; até lá, é histórico. Exceção parcial:
`resolvePublicTenant` (de `functions/src/public/index.js`, usada por
`createPublicLead`/`createPublicChat` abaixo) foi **reexportada e reusada
de verdade** por `askPublicBusinessAI` — o helper em si roda em
produção, mas nenhuma das Functions listadas na tabela abaixo é
publicada por isso.

| Function antiga (legado) | Substituição real em produção |
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

## Diferenças conscientes vs. o modelo com Functions (riscos residuais)

- **Sem rate limit de servidor confiável** nas escritas públicas (leads/métricas/chat). As Rules prendem cada escrita a conteúdo público real e a chaves específicas, então o alcance de abuso fica restrito ao próprio documento — mas um bot pode inflar contadores/criar leads em volume. Mitigação futura: App Check + Worker/Function dedicada a rate limit real.
- **"Capping" de permissões de funcionários**: uma Function impedia que um funcionário concedesse a colegas mais permissões do que ele próprio tinha. Rules não expressam isso com segurança equivalente, então a gestão de funcionários é **exclusiva do dono** (funcionário com "funcionarios: editar" recebe mensagem clara).
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

## Deploy (Rules + Storage + índices — nunca Functions)

Workflow **"Deploy Firebase Spark"** (`.github/workflows/firebase-deploy.yml`, nome mantido por histórico): manual (`workflow_dispatch`), branch `main`, `project_id` exato `vide-digital-saas`, confirmação literal `DEPLOY`, toda a suíte de testes antes de autenticar, e publica **apenas três alvos, nesta ordem**:

1. `firestore.rules` (`firestore:rules`);
2. `storage.rules` (`storage`);
3. `firestore.indexes.json` (`firestore:indexes`).

**Nunca publica Cloud Functions.** Autenticação: Workload Identity Federation (`GCP_WORKLOAD_IDENTITY_PROVIDER` + `GCP_SERVICE_ACCOUNT`) ou chave `FIREBASE_SERVICE_ACCOUNT`; sem nenhum dos dois o job falha com instrução clara — nunca finge sucesso. Nenhuma chave secreta fica no frontend em nenhum momento: as credenciais de deploy só existem como GitHub Secrets, consumidas pelo job de deploy, nunca por código que roda no navegador.

O **Quality Gate** (`.github/workflows/quality-gate.yml`) é um workflow **separado**, disparado em push/PR/dispatch, que só roda testes — nunca faz deploy de nada (ver `docs/QUALITY_GATE_RELEASE.md`).

`askBusinessAI` e `askPublicBusinessAI` (ver acima) são publicadas por
um **workflow separado**, "Deploy Firebase Functions (IA de Negócio)"
(`.github/workflows/firebase-deploy-functions.yml`, confirmação literal
`DEPLOY_FUNCTIONS`) — "Deploy Firebase Spark" continua, por nome e por
escopo, nunca publicando Functions. As duas mudanças em `usuarios/{uid}`
e `vitrines_publicas/{slug}` que o toggle público exige (regras novas em
`firestore.rules`) ainda passam pelo "Deploy Firebase Spark" normal,
como qualquer outra mudança de Rules — os dois workflows são
independentes, e o toggle só funciona de verdade depois que AMBOS
rodarem (Rules pelo Spark, Function pelo dedicado). Nenhum deploy de
Function ou de Rules acontece sem confirmação explícita.

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

Nenhuma chave de IA no frontend nem no Firestore. Quando a assistente real for conectada, a chamada sairá de um backend externo (Cloud Function ou Worker, com o segredo em secret binding — ver seção "Quando uma Cloud Function passa a se justificar" acima) com contrato:

```
generateReply({ storeUid, conversationId, userMessage, knowledgeContext, assistantConfig })
```

Interfaces previstas: `AiProvider`, `KnowledgeRepository` (lê `base_conhecimento_ia` do tenant), `ConversationRepository` (lê/escreve `chats`), `UsageLimiter` (rate limit por loja) e `AuditLogger`. O backend guarda a chave em secret binding, valida o token Firebase do chamador, resolve o tenant pelo token (nunca por parâmetro solto), aplica CORS restrito ao domínio da plataforma e registra auditoria. Nada disso é publicado sem credenciais reais.
