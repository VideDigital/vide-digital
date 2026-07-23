# IA de Negócio — assistente real, pro dono e (opcionalmente) pra loja pública

Primeira integração deste projeto com um provedor de IA externo de
verdade (Google Gemini). Diferente do Copiloto de Atendimento
(`docs/IA_COPILOT_ATENDIMENTO.md`, que é 100% mock/local), esta feature
chama um provedor real — e por isso é também a primeira (e agora
segunda) Cloud Function que o projeto realmente publica e usa em
produção.

## O que é

Dois assistentes, dois públicos, duas Cloud Functions — nunca
misturados:

1. **`askBusinessAI`** — um chat dentro da Central de IA do dashboard,
   onde o **dono da loja** (ou funcionário com permissão) pergunta sobre
   o próprio negócio — produtos, pedidos, o que pode melhorar — e recebe
   respostas geradas por IA real, com base em TODOS os dados da loja
   (produtos, pedidos, leads). Exclusivo do plano **Pro** (ou superior:
   `proplus`, `agencia`, `enterprise`, `premium`).
2. **`askPublicBusinessAI`** — um widget de chat na loja pública
   (`loja.html`), onde um **visitante sem login** pergunta sobre o
   catálogo. Só existe se o dono ativar explicitamente um toggle na
   Central de IA (dashboard) — desligado por padrão, mesmo em planos
   elegíveis. Contexto restrito a produtos ativos: nunca pedidos, leads,
   receita ou qualquer dado interno. Ver seção "IA de Negócio pública"
   abaixo pro desenho completo.

Planos abaixo do Pro recebem um aviso claro ("exclusivo do plano Pro")
em vez de acesso, nos dois casos.

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
vale calcular o custo real: o modelo escolhido (`gemini-flash-latest` —
alias mantido pelo Google, não precisa mais confirmar nome fixo a cada
deploy, ver seção "Modelo descontinuado" abaixo) tem custo por token
muito baixo; a conta de "custo máximo por loja por mês" fica simples
multiplicando o teto pelo custo médio por mensagem. O teto é
**compartilhado** entre o uso do dono no dashboard e o uso público (ver
abaixo) — um único orçamento por loja, não importa quem pergunta.

## UI (dono, no dashboard)

Dentro de `#view-central-ia`, um painel "Converse com a IA sobre o seu
negócio": histórico de mensagens (dono à direita, IA à esquerda),
contador "restam N mensagens este mês", estado bloqueado explicando a
exigência do plano Pro quando o tenant não tem acesso — o painel inteiro
fica visualmente apagado e não interativo nesse caso
(`.ia-negocio-painel.is-locked`), nunca abre pra digitar e só depois
recusar no servidor. Animação de "pensando" (blob que pulsa e muda de
forma) enquanto espera a resposta. `ia-negocio.js` (frontend) faz uma
checagem de plano só pra UX (evitar uma chamada que sabidamente vai
falhar) — quem decide de verdade é sempre o servidor.

## IA de Negócio pública (visitante da loja, sem login)

Segunda entrega, depois do assistente do dono já estar publicado e
testado. Cobre a segunda metade do pedido original ("os dois, mas tem
que ter um botão no dashboard em que o dono escolhe se quer ativar na
loja pública também").

### Arquitetura

```
loja.html (ia-negocio-publica.js) --httpsCallable--> askPublicBusinessAI (Cloud Function, SEM auth)
                                                              |
                                                    rate limit por IP (8/min)
                                                    resolvePublicTenant(storeSlug) via vitrines_publicas
                                                    relê usuarios/{ownerUid} direto (nunca confia no espelho público)
                                                    plano Pro+ E iaNegocioPublicaAtiva === true?
                                                    teto mensal COMPARTILHADO com o uso do dono
                                                    lê só produtos ativos do tenant (nunca pedidos/leads)
                                                    monta prompt PÚBLICO (promptBuilder.js)
                                                              |
                                                    fetch --> API do Gemini (mesmo secret)
                                                              |
                                                    devolve { resposta, avisoInjecao } (sem restanteNoMes)
```

### Por que é uma Function separada, não um "modo" dentro de `askBusinessAI`

`askBusinessAI` sempre resolve o tenant via `resolveCallerContext`
(sessão autenticada real) — não existe caminho nele pra um chamador sem
login. `askPublicBusinessAI` resolve o tenant de um jeito
estruturalmente diferente (`storeSlug` público, validado contra
`vitrines_publicas`, mesmo `resolvePublicTenant` já usado por
`createPublicLead`/`createPublicChat` em `functions/src/public/index.js`
— reexportado de lá, não duplicado). Compartilha o resto: `chamarGemini`,
`assertMonthlyQuota`, a mesma secret `GEMINI_API_KEY`.

### Autorização — nunca confia no espelho público

`askPublicBusinessAI` **relê `usuarios/{ownerUid}` direto via Admin SDK**
pra decidir se responde — plano Pro+ e o campo `iaNegocioPublicaAtiva`
vêm sempre dessa fonte, nunca do espelho em `vitrines_publicas`. O
espelho existe só pra `loja.html` decidir, sem outra leitura, se mostra
o widget — puramente UX, igual ao padrão já usado no resto do projeto
("quem decide de verdade é sempre o servidor").

### Contexto restrito — nunca pedidos, leads ou receita

`carregarProdutosPublicos` só consulta a coleção `produtos` — as
consultas a `pedidos`/`leads` nem existem nesse caminho de código
(defesa em profundidade: mesmo que o prompt público tentasse pedir esse
dado, ele não está em lugar nenhum pra vazar). `resumirProdutosPublicos`
(`functions/src/ai/promptBuilder.js`) também nunca expõe o número exato
de estoque — só um booleano `disponivel`. `montarSystemPromptPublico`
reforça tudo isso no próprio prompt: nunca finge ser humano, nunca
processa pedido/pagamento (orienta pro carrinho/WhatsApp), nunca fala de
pedidos/leads/receita/estoque exato.

### Toggle "ativar na loja pública" (dashboard)

Painel de IA de Negócio, dentro do mesmo `#ia-negocio-conteudo` (só
aparece pra quem já tem o plano) — switch que grava
`iaNegocioPublicaAtiva` em dois lugares:

1. `usuarios/{uid}` — a fonte de verdade, lida pela Cloud Function;
2. `vitrines_publicas/{slug}` — o espelho público, só pra UX do widget.

Gated por `canEditTenant(ownerUid, "central-ia")` nas Rules dos dois
documentos — **campo isolado** do resto do perfil/loja
(`ownerProfileFields()`/`publicStoreFields()`, gated por "configuracoes")
de propósito: é uma configuração de IA, não de perfil. Rules validam que
só esse campo muda por vez, e que o valor é sempre um booleano estrito
(`payloadIaNegocioPublica` em `ia-negocio.js` centraliza o formato pros
dois lugares que escrevem, pra nunca divergir o nome do campo).

### UI (visitante, na loja pública)

Widget flutuante em `loja.html`, empilhado acima do chat humano
existente (`bottom-24 right-6`, nunca sobrepõe `widget-chat-cliente`) —
só aparece se `vitrines_publicas/{slug}.iaNegocioPublicaAtiva === true`.
Mesma animação de "pensando" do painel do dono, adaptada pro tema da
loja (variáveis CSS `--accent`/`--surface-soft`/etc. já usadas no resto
de `loja.html`, nunca duplica um novo sistema de cor).
`ia-negocio-publica.js` — módulo **separado** de `ia-negocio.js` de
propósito: misturar o controller autenticado do dono com o do visitante
anônimo no mesmo lugar seria um jeito fácil de vazar dado interno pro
público por engano.

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

## Créditos/faturamento da API do Gemini (bloqueio real, fora do código)

Na primeira pergunta real (depois das duas correções acima), a Function
processou tudo certo — plano, quota, contexto, prompt — e chegou até o
Gemini, que respondeu `429 RESOURCE_EXHAUSTED`: *"Your prepayment
credits are depleted. Please go to AI Studio at
https://ai.studio/projects to manage your project and billing."* Ou
seja: `gemini-2.5-flash` é um nome de modelo válido e a chave funciona —
o bloqueio é só o projeto do Google AI Studio associado à
`GEMINI_API_KEY` estar sem crédito/faturamento configurado. Não tem
correção de código pra isso: é preciso abrir
https://ai.studio/projects, achar o projeto da chave usada, e habilitar
faturamento/créditos (ver também ai.google.dev/gemini-api/docs/billing).
Diagnosticado com debug temporário (status HTTP + corpo da resposta do
Gemini exposto na mensagem de erro), já removido — `functions/src/ai/
index.js` agora trata `429` com uma mensagem própria ("provedor sem
créditos disponíveis") em vez do genérico "tente novamente".

Como o dono não podia pagar o faturamento agora, o caminho escolhido foi
trocar a chave: criar uma **API key nova em um projeto novo do Google AI
Studio sem faturamento vinculado** (nível gratuito de verdade, com
limites de uso mais baixos) e atualizar direto a versão do secret
`GEMINI_API_KEY` no Secret Manager — sem precisar de outro deploy, já
que a Cloud Function sempre lê a versão mais recente habilitada do
secret.

## Modelo descontinuado pra chaves novas (`gemini-2.5-flash` → `gemini-flash-latest`)

Com a chave gratuita nova, a próxima tentativa deu `404 NOT_FOUND`:
*"This model models/gemini-2.5-flash is no longer available to new
users. Please update your code to use a newer model..."* — mesmo o
modelo aparecendo na listagem (`ListModels`) da própria chave. Ou seja:
existir na listagem não significa que toda chave pode usá-lo pra gerar
conteúdo; contas/chaves novas perdem acesso a alguns nomes fixos que
contas antigas ainda têm.

Corrigido trocando `GEMINI_MODEL` de `"gemini-2.5-flash"` (nome fixo)
pra `"gemini-flash-latest"` (alias que o próprio Google mantém sempre
apontado pro modelo Flash recomendado do momento) em
`functions/src/ai/index.js` — evita esse tipo de quebra silenciosa se
o Google aposentar outro nome fixo no futuro. Confirmado que o alias
está na lista de modelos da chave nova, com suporte a
`generateContent`.

### Instrumentação de erro permanente (não é mais debug temporário)

Depois de alternar debug por debug a cada camada nova de erro (plano →
admin → créditos → …), a abordagem final foi tornar isso permanente em
vez de temporário: `mensagemErroAmigavel()` (`ia-negocio.js`) agora
sempre mostra a mensagem real vinda da Function quando ela existe — a
Function já escreve todas as mensagens em português, então não tem
motivo pra esconder atrás de um texto fixo genérico. E o erro de
`chamarGemini()` pra status HTTP fora do mapeado (não 429) agora inclui
o número do status na própria mensagem (`"A IA não conseguiu responder
agora (status NNN do provedor)."`), sem expor corpo de resposta nem
stack trace. Qualquer exceção realmente não tratada (bug de código) cai
no catch geral do handler, é logada inteira via `logger.error` (visível
no Cloud Logging) e vira uma mensagem genérica e amigável pro dono —
nunca stack trace na tela. Isso deve cobrir diagnósticos futuros sem
precisar de mais rodadas de debug-then-revert.

## Limitações reais desta fase (sem maquiar)

- **`askBusinessAI` (dono) está publicada, testada ponta a ponta E
  confirmada em produção com resposta real e de qualidade do Gemini** —
  depois de corrigidos os quatro bloqueios reais encontrados nas
  primeiras tentativas (case do plano, admin sem `context.owner`,
  crédito/faturamento da chave antiga, nome de modelo descontinuado pra
  chave nova — ver seções acima), o dono recebeu uma resposta de verdade
  sobre o próprio catálogo. O que FOI testado: as funções puras de
  `promptBuilder.js` (`node --test`), as Rules de `ia_negocio_uso`
  contra o Emulator real, e a conversa real em produção.
- **`askPublicBusinessAI` (visitante) está com o código completo,
  testado e revisado, mas AINDA NÃO DEPLOYADA em produção** no momento
  desta escrita — depende da mesma rodada de deploy que publicou
  `askBusinessAI`, agora publicando as duas juntas
  (`--only functions:askBusinessAI,functions:askPublicBusinessAI`, ver
  `.github/workflows/firebase-deploy-functions.yml`). O que FOI testado
  antes do deploy: as funções puras públicas de `promptBuilder.js`
  (contexto restrito, system prompt), o controller
  `ia-negocio-publica.js` (`node --test`), as Rules do toggle
  `iaNegocioPublicaAtiva` (dono/funcionário/tenant isolation) contra o
  Emulator real, e sintaxe do widget inline em `loja.html`. O que NÃO
  foi testado ainda: uma conversa real de um visitante em produção — só
  confirma abrindo `loja.html` de uma loja Pro+ com o toggle ativado e
  perguntando algo de verdade, depois do deploy.
- **Firestore Rules do toggle público também dependem de deploy
  separado** — `firestore.rules` só vale depois do workflow "Deploy
  Firebase Spark" rodar de novo (workflow diferente do de Functions,
  ver `docs/FIREBASE_SPARK_ARCHITECTURE.md`); sem isso, o switch no
  dashboard vai falhar ao salvar mesmo com o código do toggle já no ar
  via GitHub Pages.
- **Preço exato do provedor** não foi confirmado nesta sessão (a ordem de
  grandeza é estável, o valor exato muda) — confira em
  ai.google.dev/pricing antes de fechar o teto mensal definitivo. Vale
  também acompanhar o uso real do teto compartilhado (dono + público)
  depois que o widget público estiver no ar por algumas semanas.
