# Central de Notificações

## Objetivo

O sino no topo do painel e a tela "Notificações" mostram, num só lugar:

- **avisos do admin** (documentos reais na coleção `notificacoes`, criados em `admin.html`);
- **eventos reais do negócio da própria loja**, calculados na hora (não são documentos "notificacoes"):
  - novo lead recebido;
  - pedido aguardando confirmação;
  - avaliação pendente de moderação.

Não depende de Cloud Functions — o projeto está no plano Spark (gratuito), que não executa Functions. Toda leitura é feita por consultas diretas do cliente autenticado às suas próprias coleções, e toda escrita de "marcar como lida" é uma escrita direta no Firestore, autorizada por regra de segurança (não por uma Function).

## Arquivos envolvidos

- `dashboard-app.js`: toda a lógica (busca, cache, filtros, contadores, marcação de leitura, eventos de negócio) e a renderização da tela `view-notificacoes` e do modal do sino.
- `dashboard.html`: botão do sino (`#btn-notificacoes`), badge (`#badge-notif-count`), modal compacto (`#notif-modal`) e a seção completa `#view-notificacoes` (cartões de resumo, filtros, lista, botões "Marcar todas como lidas" e "Atualizar").
- `business-modules.css`: estilos da central (cartões, filtros, itens da lista, esqueleto de carregamento, prioridade).
- `firestore.rules`: leitura/escrita da coleção `notificacoes`; leads/pedidos/avaliações usam as regras já existentes dessas coleções (a central só lê, nunca escreve nelas).
- `tests/emulator/firestore-security.test.mjs`: testes de regra da coleção `notificacoes` (leitura por destinatário, marcar/desmarcar como lida, isolamento entre contas).
- `core/vide-functions.js`: **não é mais usado** pela central — `markNotificationRead` continua definida ali (e em `functions/src/notifications/index.js`) só por compatibilidade histórica; não é chamada em lugar nenhum do frontend.

## Coleção `notificacoes` (avisos do admin)

Documento por aviso, criado em `admin.html`:

```js
{
  titulo: "...",
  mensagem: "...",
  foto: "" | "data:image/...", // opcional
  destinatarios: "todos" | ["uid1", "uid2", ...], // quem recebe
  uid: "ownerUid", // formato alternativo/legado — um único destinatário
  lidoPor: ["uid1", ...], // quem já marcou como lida
  leituraAtualizadaEm: serverTimestamp(), // atualizado a cada marcação
  criadoEm: Date.now() // milissegundos — nunca serverTimestamp() aqui
}
```

`criadoEm` **precisa** ser um número em milissegundos (`Date.now()`), não um `serverTimestamp()`. A tela lê e ordena por esse campo comparando números diretamente; um `Timestamp` do Firestore nesse campo quebraria o tempo relativo ("há 55 anos" em vez de "há 2 min") porque `Timestamp.valueOf()` retorna uma string em segundos pensada só pra comparação, não milissegundos. `dashboard-app.js` normaliza qualquer um dos dois formatos ao carregar (`normalizarTimestampMs`), então um documento legado não quebra a tela — mas todo código novo que grave nessa coleção deve continuar usando `Date.now()`.

### Regras de acesso

```
match /notificacoes/{id} {
  allow read: if signedIn() && notificacaoVisivelPara(resource.data);
  allow create, delete: if isBackendAdmin();
  allow update: if isBackendAdmin() || leituraNotificacaoPropriaValida();
}
```

- `notificacaoVisivelPara(dados)`: admin vê tudo; qualquer usuário autenticado vê um aviso se `destinatarios == "todos"`, se seu uid está no array `destinatarios`, ou se `dados.uid` é o próprio uid.
- `leituraNotificacaoPropriaValida()`: permite que o **próprio destinatário** marque a notificação como lida/não lida sem passar por admin — só pode alterar os campos `lidoPor` e `leituraAtualizadaEm`, e só pode adicionar ou remover o **próprio** uid do array `lidoPor` (nunca o de outra pessoa). A validação compara tamanho antes/depois do array e garante que o conjunto de elementos não mudou além do próprio uid — sem isso, a única alternativa seria uma subcoleção `notificacoes/{id}/leituras/{uid}` ou uma Cloud Function dedicada (indisponível no plano Spark).
- Criar e apagar avisos continua exclusivo do admin (`admin.html`).

## Eventos de negócio (não são documentos "notificacoes")

`carregarEventosNegocioNotificacoes()` (em `dashboard-app.js`) monta, a cada carregamento da central, até 10 eventos de cada tipo:

| Tipo | Fonte | Condição | Abre |
|---|---|---|---|
| `lead` | coleção `leads`, `where("criadoPor","==",uid)` | mais recentes primeiro | `view-leads` |
| `pedido` | coleção `pedidos`, `where("criadoPor","==",uid)` | só `status == "aguardando"` | `view-pedidos` |
| `avaliacao` | coleção `avaliacoes`, `where("criadoPor","==",uid)` | só `status == "novo"` | `view-avaliacoes` |

Cada consulta usa **uma única igualdade** (`where("criadoPor","==",uid)`) — de propósito, sem `orderBy` — porque uma igualdade combinada com `orderBy`/desigualdade em outro campo exige índice composto no Firestore; a ordenação e o corte para os 10 mais recentes acontecem no cliente, depois da leitura. Cada consulta tem `limit(200)` como teto de leitura (não é "os 200 mais recentes", já que não há `orderBy` — é só um limite de segurança pra não escanear uma coleção enorme; não afeta lojas reais, que têm bem menos que 200 leads/pedidos/avaliações pendentes).

Essas fontes são independentes: se uma falhar (permissão, rede, feature do plano desligada), as outras continuam funcionando — cada uma tem seu próprio `try/catch`. `avaliacao` e `pedido`/`lead` só são consultados se o plano da loja tiver a feature correspondente (`avaliacoes`, `hub`, `leads`).

### Leitura dos eventos de negócio: "visto até"

Eventos de negócio não são documentos próprios — não faz sentido um `lidoPor` por item. Em vez disso, `dashboard-app.js` guarda no `localStorage` (por uid, chave `vh_notif_visto_{uid}`) o instante em que a central foi aberta pela última vez. Qualquer evento com `criadoEm` mais antigo que esse instante conta como "lido"; mais novo, conta como "não lido". Abrir a central (pelo sino ou pela aba "Notificações") atualiza esse instante para agora — então, na próxima vez que a central for aberta, tudo que já existia passa a contar como lido.

Essa marca é **por dispositivo/navegador** (não sincroniza entre aparelhos, já que é `localStorage`) — uma limitação aceita conscientemente pra não precisar de mais uma escrita no Firestore a cada abertura da central.

## Estados e componentes da tela

- **Cartões de resumo**: total, não lidas, já visualizadas (`#notif-total-count`, `#notif-unread-count`, `#notif-read-count`).
- **Filtros** (`#notif-filtros-container`): Todas, Não lidas, Lidas, Leads, Pedidos, Avaliações, Sistema — cada um com contador. Filtrar **não** busca de novo no Firestore, só re-renderiza a partir do cache já carregado (`_cacheNotificacoes`).
- **Esqueleto de carregamento**: aparece só na primeira carga da sessão (cache vazio) — atualizações de fundo não fazem a lista inteira "piscar".
- **Estado de erro**: se a busca falhar, mostra uma mensagem com botão "Tentar novamente" (`recarregarNotificacoes()`), em vez de deixar a lista girando pra sempre ou silenciosamente vazia.
- **Estado vazio**: mensagem diferente se não há nenhuma notificação vs. se o filtro atual não tem resultado.
- **Prioridade**: pedido aguardando é "alta"; lead e avaliação pendente são "média" — um ponto colorido discreto, com rótulo acessível via `title`/`aria-label`. Avisos do admin não têm prioridade (são só informativos).
- **"Marcar todas como lidas"**: escreve `lidoPor` em cada aviso do admin ainda não lido e marca a "visita" (evento de negócio) — tudo numa única ação, com proteção contra duplo clique.
- **"Atualizar"**: força uma nova busca no Firestore (mesma função usada no "Tentar novamente" do estado de erro).

### Concorrência

`carregarNotificacoes()` usa uma *promise* compartilhada em vez de um simples booleano de "já está carregando": se duas partes do código chamarem a função quase ao mesmo tempo (ex.: abrir a central pelo sino logo depois de ela já ter começado a carregar em segundo plano), as duas recebem a **mesma** promise e esperam o mesmo resultado — em vez de uma delas desistir silenciosamente e seguir em frente como se tivesse dados atualizados sem realmente ter. Isso evita tanto uma segunda leitura desnecessária no Firestore quanto um estado inconsistente na tela (ex.: contador dizendo "0 não lidas" enquanto a lista ainda mostra itens como novos).

## Segurança

- Cada usuário só pode alterar a **própria** marcação de leitura (`leituraNotificacaoPropriaValida()`); nunca a de outra pessoa, mesmo que os dois compartilhem uma notificação "todos".
- Eventos de negócio herdam a segurança das coleções de origem (`leads`, `pedidos`, `avaliacoes`) — a central nunca lê dados de outro tenant, porque toda consulta já filtra por `criadoPor == uid do dono logado`.
- Nenhuma escrita da central aceita campos fora da lista permitida (`hasOnly(["lidoPor", "leituraAtualizadaEm"])` na regra) — testado explicitamente (`tests/emulator/firestore-security.test.mjs`, suíte "notificacoes: marcar como lida/não lida sem Cloud Function").
- O botão "Ver" de um evento de negócio sempre executa uma ação fixa e conhecida (`ativarAba('view-leads')`, etc. — strings definidas no próprio `dashboard-app.js`, nunca vindas de dados do usuário). Um aviso do admin com um campo `destino` reconhecido (lista fixa em `DESTINOS_NOTIFICACAO_ADMIN`) também pode navegar direto; qualquer valor fora dessa lista é ignorado — não existe navegação para uma URL/aba arbitrária vinda de um documento do Firestore.

## Como testar

```bash
# Regras (inclui a suíte de notificações)
pnpm run test:rules

# Suíte completa
pnpm run test:all
```

Para verificação visual manual: suba o Emulator (`pnpm run emulators`), rode `node scripts/seed-emulator.mjs --local-defaults`, sirva os arquivos estáticos (`python3 -m http.server 8899`) e acesse `login.html?useEmulator=true` com uma conta semeada (ex.: `owner.pro@local.test` / `Local123!pro`).

## Limitações conhecidas

- Leitura de eventos de negócio é por dispositivo (`localStorage`), não sincroniza entre aparelhos do mesmo dono.
- Sem Cloud Functions (plano Spark), não há push/e-mail quando um evento novo chega — a central só atualiza quando o painel é aberto ou recarregado.
- `admin.html` hoje só grava `destinatarios`; o campo opcional `destino` (navegação direta de um aviso) é suportado na leitura, mas não tem interface de criação ainda.
