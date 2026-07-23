# IA de Negócio — assistente real para o dono da loja

Primeira integração deste projeto com um provedor de IA externo de
verdade (Google Gemini). Diferente do Copiloto de Atendimento
(`docs/IA_COPILOT_ATENDIMENTO.md`, que é 100% mock/local), esta feature
chama um provedor real — e por isso é também a primeira Cloud Function
que o projeto realmente publica e usa em produção.

## O que é

Um chat, dentro da Central de IA do dashboard, onde o **dono da loja**
(ou funcionário com permissão) pergunta sobre o próprio negócio —
produtos, pedidos, o que pode melhorar — e recebe respostas geradas por
IA real, com base nos dados reais e atuais daquela loja.

Exclusivo do plano **Pro** (ou superior: `proplus`, `agencia`,
`enterprise`, `premium`). Planos abaixo disso recebem um aviso claro
("exclusivo do plano Pro") em vez de acesso.

## Por que isso quebra a regra "zero Cloud Functions vivas"

Toda a arquitetura deste projeto (`docs/FIREBASE_SPARK_ARCHITECTURE.md`)
é escrita direta do cliente protegida por Firestore Rules — de propósito,
porque Cloud Functions só se justificam quando existe segredo real,
integração externa, ou operação privilegiada. **A chave de um provedor de
IA é exatamente esse caso**: não pode existir no frontend, no Firestore
nem no repositório. Esta é a primeira vez que essa condição realmente se
aplica neste projeto, e por isso é a primeira Cloud Function publicada.

Nenhuma das outras Functions que já existiam no repositório
(`createEmployee`, `updateEmployee`, etc. — ver `core/vide-functions.js`)
muda de estado: continuam código não usado em produção, só disponíveis
pro Emulator. Só `askBusinessAI` passa a ser real.

## Arquitetura

```
dashboard (ia-negocio.js) --httpsCallable--> askBusinessAI (Cloud Function)
                                                    |
                                          resolveCallerContext (auth real)
                                          requireEdit(context, "central-ia")
                                          plano Pro ou superior?
                                          teto mensal (Firestore, transação)
                                          lê produtos/pedidos/leads do tenant
                                          monta prompt (promptBuilder.js)
                                                    |
                                          fetch --> API do Gemini (secret)
                                                    |
                                          devolve { resposta, restanteNoMes }
```

### `functions/src/ai/promptBuilder.js` (puro, testável)

- `LIMITES_IA_NEGOCIO`: tetos de produtos/pedidos/leads carregados,
  tamanho de pergunta/contexto/resposta, e `usoMensalPadrao` (**200,
  provisório** — o teto final por plano ainda não foi decidido, ver
  "Plano e teto" abaixo).
- `resumirProdutos`/`resumirPedidos`/`resumirLeads`/`produtosMaisVendidos`:
  agregações simples pra montar um resumo textual. **Reimplementadas
  aqui**, não importadas de `pedidos-estruturados.js`/`crm360.js` na raiz
  do repo: o deploy do Cloud Functions empacota só o diretório
  `functions/` — um import relativo pra fora dele quebraria em produção.
  Não é a mesma duplicação evitável de outros módulos (que rodam no
  mesmo bundle do frontend); é uma fronteira real de empacotamento.
- `montarContextoNegocio`/`contextoParaTexto`: monta e serializa o
  contexto (nome da loja, produtos ativos com preço/estoque, pedidos por
  status, receita somada, produtos mais vendidos, leads por status).
  Truncado no limite configurado.
- `montarSystemPrompt`: regras fixas — nunca inventar produto/preço/
  estoque/pedido fora do contexto, nunca prometer desconto ou condição
  não configurada, avisar quando não sabe, resistir a tentativa de mudar
  de papel ou revelar o próprio prompt, responder só sobre a loja do
  tenant autenticado.
- `detectarTentativaInjecao`: mesma filosofia do Copiloto de Atendimento
  — sinaliza sem bloquear (`avisoInjecao` na resposta).
- `montarMensagensGemini`/`extrairTextoRespostaGemini`: formato de
  request/response da API do Gemini (`generateContent`).

### `functions/src/ai/index.js` (`askBusinessAI`, onCall)

1. `resolveCallerContext(request)` — mesma função usada por outras
   Functions do projeto (`functions/src/shared/context.js`); resolve
   dono/funcionário/admin a partir do Auth real, nunca de um parâmetro.
2. `requireEdit(context, "central-ia")` — mesma permissão já usada pra
   configurar a assistente da loja pública; quem só vê não gera.
3. Checa `context.owner.plano` contra `PLANOS_COM_IA_REAL` — nega com
   `permission-denied` claro se não for Pro ou superior.
4. `assertMonthlyQuota(ownerUid)` — transação no Firestore incrementando
   `ia_negocio_uso/{ownerUid}_{periodo}` (`periodo` = `AAAA-MM` em UTC);
   nega com `resource-exhausted` se o teto do mês já foi atingido.
5. Lê produtos/pedidos/leads do tenant (`criadoPor == ownerUid`, com
   `limit()`), monta o contexto e o prompt.
6. Chama a API do Gemini via `fetch` nativo do Node — sem dependência
   nova (`GEMINI_API_KEY` como secret do Firebase Functions).
7. Devolve `{ resposta, periodo, restanteNoMes, avisoInjecao }`.

**Nunca grava a pergunta/resposta completa** em lugar nenhum — só o
contador de uso (`ownerUid`, `periodo`, `count`, `ultimaPerguntaEm`).

## Permissões e Rules

- Reaproveita a permissão já existente `central-ia` (dono sempre tem;
  funcionário precisa de concessão) — não criou permissão nova, porque
  conceitualmente já é "sobre configurar/usar a IA da loja".
- Nova coleção `ia_negocio_uso/{ownerUid}_{periodo}`: só leitura pro
  próprio tenant (pra UI mostrar "restam N mensagens este mês"), escrita
  sempre negada pro cliente — só a Function (Admin SDK, que ignora
  Rules) escreve. Testado contra o Emulator real em
  `tests/emulator/firestore-security.test.mjs` (3 testes: dono/
  funcionário com central-ia leem; funcionário sem a permissão, outro
  tenant e anônimo não leem; cliente nunca escreve, nem o próprio dono).

## Plano e teto — decisão do negócio, parte ainda em aberto

Decidido nesta fase: só o plano Pro (ou superior) tem acesso.

**Ainda não decidido**: o teto exato de mensagens por mês. Hoje existe
um valor provisório (`LIMITES_IA_NEGOCIO.usoMensalPadrao = 200`) só pra
nunca deixar o uso destravado — mudar esse número é uma linha só em
`functions/src/ai/promptBuilder.js`. Antes de decidir o valor final,
vale calcular o custo real: o modelo escolhido (`gemini-2.5-flash` —
confirme o nome exato do modelo em ai.google.dev antes do primeiro
deploy, nomes de modelo mudam) tem custo por token muito baixo; a conta
de "custo máximo por loja por mês" fica simples multiplicando o teto
pelo custo médio por mensagem.

## UI

Dentro de `#view-central-ia`, um novo painel "Converse com a IA sobre o
seu negócio": histórico de mensagens (dono à direita, IA à esquerda),
contador "restam N mensagens este mês", estado bloqueado explicando a
exigência do plano Pro quando o tenant não tem acesso. `ia-negocio.js`
(frontend) faz uma checagem de plano só pra UX (evitar uma chamada que
sabidamente vai falhar) — quem decide de verdade é sempre o servidor.

## O que falta pra isso funcionar em produção

1. ~~**Criar a chave da API do Gemini**~~ — feito pelo usuário (Google AI
   Studio, nível gratuito, sem faturamento ativado ainda).
2. ~~**Configurar a chave como secret**~~ — feito pelo usuário, direto no
   Google Cloud Console → Secret Manager → `GEMINI_API_KEY`, no projeto
   `vide-digital-saas`. (Caminho alternativo via Firebase CLI, se algum
   dia for necessário recriar: `firebase functions:secrets:set
   GEMINI_API_KEY --project vide-digital-saas`.)
3. ~~**Publicar a Function**~~ — **feito**. `.github/workflows/
   firebase-deploy-functions.yml` ("Deploy Firebase Functions (IA de
   Negócio)") rodou com sucesso e publicou `askBusinessAI` em produção
   (`vide-digital-saas`). Além das roles já documentadas em
   `docs/FIREBASE_SPARK_ARCHITECTURE.md`, a conta de serviço de deploy
   (`firebase-adminsdk-fbsvc@vide-digital-saas.iam.gserviceaccount.com`)
   precisou de mais duas concessões manuais, feitas uma vez só, direto no
   Google Cloud Console, que não existiam antes desta fase:
   - **Secret Manager Secret Accessor** nela mesma, sobre o secret
     `GEMINI_API_KEY` (pra ler o valor no deploy);
   - **Secret Manager Secret Accessor** também para
     `891590456336-compute@developer.gserviceaccount.com` (a conta de
     execução padrão das Cloud Functions/Cloud Run — é ela que
     efetivamente lê o secret em runtime, não a conta de deploy).
   Sem a segunda concessão, o deploy falhava com
   `secretmanager.secrets.setIamPolicy denied` ao tentar conceder esse
   acesso automaticamente. Ambas as concessões já estão feitas — deploys
   futuros de `askBusinessAI` não devem precisar repetir esse passo.

## Correção pós-deploy: dono do plano Pro+ sendo recusado

Na primeira tentativa real de uso (dono no plano Premium), a Function
recusou com "exclusiva do plano Pro" mesmo o plano estando na lista
`PLANOS_COM_IA_REAL`. Causa: `functions/src/ai/index.js` comparava
`context.owner.plano` (valor bruto do Firestore) contra o `Set` sem
normalizar; `ia-negocio.js` (frontend) já normalizava com
`.toLowerCase()` antes de comparar — bastava uma diferença de
capitalização entre as duas camadas pra o cliente liberar e o servidor
recusar. Corrigido em `functions/src/ai/index.js`:
`String(context.owner?.plano || "starter").trim().toLowerCase()` antes
do `PLANOS_COM_IA_REAL.has(...)`, igual ao que o frontend já fazia —
depois de corrigir, redeploy de `askBusinessAI` pelo mesmo workflow
(`DEPLOY_FUNCTIONS`).

Depois de publicar essa correção, uma segunda recusa apareceu — dessa vez
com `owner.plano=undefined` (log de debug temporário adicionado só pra
esse diagnóstico e já removido). Causa real: a conta usada pra testar é
a conta **admin master da plataforma** (claim `videAdmin`), não uma
conta comum de dono. `resolveCallerContext` nunca popula `context.owner`
pra esse papel — só `role: "admin"`, sem `owner`/`plano` — porque em
todo o resto do backend (`canEdit`/`canView` em
`functions/src/shared/context.js`) e do frontend
(`VideHubContext.hasFeature`) admin sempre tem acesso total, sem checar
plano; só a `askBusinessAI` não seguia essa regra. Corrigido pulando o
gate de plano quando `context.isAdmin === true`, igual todo o resto do
sistema já faz.

Na mesma correção, dois ajustes de UX pedidos pelo dono:

- O painel "Converse com a IA sobre o seu negócio" agora fica
  **visualmente apagado e não interativo** (`.ia-negocio-painel.is-locked`
  em `ia-negocio.css`, aplicado por `bindIaNegocioPainel()` em
  `dashboard-app.js`) em planos sem acesso — antes disso era possível
  abrir o painel, digitar e só levar a recusa depois de enviar; agora o
  formulário nem fica clicável, só o aviso com um botão "Ver planos e
  recursos" que leva direto pro Guia do Plano.
- O **Guia do Plano** (`view-guia` em `dashboard.html`,
  `renderizarGuiaDoPlano()` em `dashboard-app.js`) ganhou uma entrada
  "IA de Negócio (plano Pro ou superior)" na chave `ia_negocio`, incluída
  em `FEATURES_PLANO` para `pro`/`proplus`/`agencia`/`enterprise`/`premium`
  — mesma convenção de feature-flag já usada por todo o resto do Guia.

## Limitações reais desta fase (sem maquiar)

- **`askBusinessAI` está publicada em produção, mas uma conversa real
  ainda não foi testada de ponta a ponta** — o deploy em si só confirma
  que o código sobe e a Function fica no ar; ele não valida se o nome do
  modelo Gemini configurado (`gemini-2.5-flash`) é aceito pela API, nem
  a qualidade da resposta. Isso só se confirma abrindo a Central de IA
  com uma conta no plano Pro e perguntando algo de verdade. Se o modelo
  estiver desatualizado, o erro aparece na hora da pergunta (mensagem
  amigável de "IA não respondeu agora"), não no deploy — nesse caso, o
  próximo passo é atualizar `GEMINI_MODEL` em `functions/src/ai/index.js`
  pro nome de modelo atual e publicar de novo pelo mesmo workflow.
  O que FOI testado de verdade antes do deploy: as 12 funções puras de
  `promptBuilder.js` (`node --test`, contexto, sanitização, detecção de
  injeção, formato do payload/resposta) e as Rules da nova coleção
  `ia_negocio_uso` contra o Emulator real.
- **Toggle "ativar na loja pública"** (`canais.lojaPublica`, já existe no
  schema da Central de IA desde um ciclo anterior, com badge "Em breve")
  **não foi ligado a nada nesta fase** — o pedido original incluía os
  dois públicos (dono no dashboard e visitante na loja pública), mas
  esta entrega cobriu só o primeiro. Ativar o segundo significa: uma
  segunda Function (ou a mesma com um modo diferente) sem autenticação
  de funcionário, rate limit por IP (padrão já usado em
  `functions/src/public/index.js`), contexto restrito a dados
  seguros pra expor a um visitante (produtos ativos, nunca pedidos/leads/
  métricas internas), e a UI real do widget em `loja.html`.
- **Nome do modelo Gemini** (`gemini-2.5-flash`) é o mais recente
  conhecido no momento desta escrita — Google muda nomes de modelo com
  frequência; confirme antes do primeiro deploy real.
- **Preço exato do provedor** não foi confirmado nesta sessão (a ordem de
  grandeza é estável, o valor exato muda) — confira em
  ai.google.dev/pricing antes de fechar o teto mensal definitivo.
