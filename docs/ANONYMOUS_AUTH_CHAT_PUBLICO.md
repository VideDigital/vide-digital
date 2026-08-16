# Anonymous Auth no Chat Público (RD3)

Substitui o modelo antigo — "conhecer o id aleatório do documento `chats/{id}`
é a única capability" — por uma identidade real de visitante (Firebase
Anonymous Auth), vinculada ao chat via `visitorUid`. Evolui a coleção
`chats`/`mensagens`/`eventos` já existente (mesmo modelo da Central de
Atendimento, ver `docs/CENTRAL_ATENDIMENTO.md`) — não cria uma central, um
modal ou uma coleção nova. Rollout em **duas fases** para nunca derrubar o
chat público durante a migração; este documento cobre o estado ao final da
**Fase B**.

**Status atual: Fase B integrada à `main` e ativa em produção.** O Firebase
Anonymous Auth está habilitado, as Rules necessárias ao fluxo V2 estão
efetivas e o caminho real visitante anônimo → criação de chat foi validado
com sucesso. Novos chats não possuem fallback V1; o contrato legado abaixo
permanece somente para chats criados antes da Fase B.

## Por que

Antes desta etapa:

- o widget da loja criava o chat sem nenhuma autenticação;
- o id aleatório do documento era, ao mesmo tempo, o identificador do chat E
  a única prova de que quem está lendo/escrevendo é o visitante certo;
- mensagens e eventos do cliente gravavam `autorUid` vazio — nenhuma
  autoria real do lado do visitante;
- o próprio `onSnapshot(doc(db, "chats", id))` que o widget usa pra
  acompanhar o status do chat já falhava silenciosamente por permissão
  (a regra de leitura de `chats/{chatId}` sempre exigiu `signedIn()`, e o
  visitante nunca tinha sessão) — descoberto ao auditar o contrato atual
  para esta missão, não introduzido por ela.

## Arquitetura: instância Firebase secundária

A loja pública pode ser aberta no MESMO navegador em que o dono está logado
no dashboard (`firebase-init.js`, app principal). Autenticar o visitante
como anônimo na instância principal derrubaria a sessão do dono. Por isso:

- **`public-chat-auth-v1.js`** inicializa (ou reaproveita, `getApp`/
  `initializeApp`) um app Firebase **nomeado** `"vide-public-chat"`, com o
  **mesmo `firebaseConfig`** de `firebase-init.js` (nenhuma configuração
  duplicada) — Auth e Firestore próprios, isolados do app principal.
- Conecta aos Emulators (Auth `127.0.0.1:9099`, Firestore `127.0.0.1:8080`)
  só quando `shouldUseVideEmulators()` (reexportado de `firebase-init.js`)
  for `true`, com o mesmo guard de conexão única (`window.__videPublicChat­EmulatorsConnected`) usado no app principal.
- `loja.html` usa o Firestore **secundário** (`obterDbPublico()`) pra tudo
  que envolve identidade do visitante (criar chat V2, mandar mensagem,
  eventos, restaurar) — o token da sessão anônima só é válido nesse app. As
  leituras públicas normais da loja (produtos, avaliações, vitrine)
  continuam na instância **principal** (`db`, `firebase-init.js`), sem
  mudança.
- `pedidos-estruturados.js` é o único paralelo direto no projeto: lógica
  pura sem import de Firebase, separada da orquestração acoplada ao SDK.
  Aqui o mesmo padrão vira **dois arquivos**: `public-chat-auth-core.js`
  (puro, testável em Node puro, sem rede) e `public-chat-auth-v1.js`
  (reexporta o core + acopla ao SDK/app secundário).

## Modelo V2 do chat

Campos novos em `chats/{chatId}` quando o chat nasce por este caminho:

```js
{
  // ...todos os campos já existentes (donoUID, emailDono, clienteNome,
  // statusAdmin, status, canal, utmSource, timestamp, naoLidasLoja, ...)
  visitorUid: "{uid da sessão Anonymous Auth}",  // imutável
  versaoAcesso: 2                                 // imutável
}
```

`mensagens/{msgId}` do cliente (V2) ganham autoria real:

```js
{
  texto: "...", sender: "cliente", timestamp: number,
  autorUid: "{visitorUid}",   // nunca vazio num chat V2
  autorTipo: "cliente"
}
```

`eventos/{eventoId}` do cliente (V2) idem — `autorUid` sempre o uid real,
nunca `""` (o contrato V1 legado gravava sempre vazio, porque não havia
identidade nenhuma pra gravar).

Chats sem `visitorUid`/`versaoAcesso == 2` (documentos antigos, ou qualquer
tentativa de gravar só um dos dois) contam como **legado** — ver
`chatLegadoSemVisitor()` abaixo.

## Firestore Rules

Funções em `firestore.rules` (criadas na Fase A, ajustadas na Fase B):

| Função | Papel |
|---|---|
| `isAnonymousAuth()` | `request.auth != null` e `token.firebase.sign_in_provider == "anonymous"` |
| `chatTemAcessoV2(chatData)` | o documento tem `visitorUid` (string não vazia) e `versaoAcesso == 2` |
| `chatLegadoSemVisitor(chatData)` | o inverso — qualquer doc sem o par completo conta como V1 |
| `visitantePodeAcessarChat(chatData)` | anônimo + `chatTemAcessoV2` + `visitorUid == request.auth.uid` |
| `chatPublicoV2CreateValido()` | create de `chats/{id}` pelo visitante anônimo (whitelist fechada, `visitorUid == request.auth.uid`, `versaoAcesso == 2`) — **Fase B: único caminho público de criação** |
| `chatPublicoV2UpdateValido()` | update público (mensagem do cliente) só por quem tem a identidade |
| `mensagemClienteV2Valida(chatId)` | mensagem do cliente com `autorUid`/`autorTipo` reais e obrigatórios |
| `eventoClienteV2Valido(chatId)` | evento do cliente com `autorUid` real (nunca vazio) |

**Fase B: `chatPublicoValido()` foi removida.** Essa função só validava a
CRIAÇÃO de um chat V1 novo (sem Anonymous Auth) — o `allow create` de
`chats/{chatId}` deixou de aceitá-la; agora só `chatPublicoV2CreateValido()`
(visitante) ou a whitelist de conversa interna (equipe autenticada) criam um
chat. **Criar um chat V1 novo pelo caminho público passou a ser sempre
negado.**

Isso NÃO afeta chats V1 que já existiam antes desta etapa: os caminhos de
UPDATE/mensagem/evento legados (`chatUpdatePublicoValido()`,
`mensagemClienteValida()`, `eventoAtendimentoClientePublicoValido()`) **não
foram tocados** — continuam validando exatamente como antes, protegidos por
`chatLegadoSemVisitor(chatData)` (que já garantia, desde a Fase A, que um
chat que nasceu V2 nunca aceita escrita pública sem identidade). Ou seja: a
Fase B fecha a porteira de entrada (criação), nunca a de quem já estava
dentro (chats V1 em andamento).

Leitura: `chats/{chatId}` ganhou `|| visitantePodeAcessarChat(resource.data)`
no `allow read` (get, nunca list — o visitante continua sem listar chats).
`mensagens/{msgId}` ganhou o mesmo `||` no ramo autenticado. `eventos/{id}`
**não muda**: o visitante nunca lê a timeline administrativa, V1 ou V2 —
contrato preservado.

`visitorUid`/`versaoAcesso` são **imutáveis**: nenhuma whitelist de update
(pública ou administrativa) inclui essas chaves — nem o próprio dono
consegue alterá-las depois da criação. Isso vale nos dois sentidos: um chat
V1 existente nunca ganha esses campos (não vira V2 depois de nascer V1), e
um chat V2 nunca os perde.

## Compatibilidade com chats legados (V1)

- Chats criados antes desta etapa (sem `visitorUid`) continuam funcionando
  pelo contrato antigo de leitura/mensagem/evento —
  `chatUpdatePublicoValido()`, `mensagemClienteValida()`,
  `eventoAtendimentoClientePublicoValido()` não mudaram de comportamento
  pra eles, e a equipe continua lendo/respondendo normalmente.
- **A criação de chat V1 novo foi negada na Fase B** (ver acima). Não existe
  mais nenhum caminho, público ou no frontend, que produza um chat sem
  `visitorUid`/`versaoAcesso == 2`.
- Equipe (dono/funcionário) continua lendo e respondendo chats V1 e V2 pela
  mesma regra de sempre (`podeVerChat`/`podeResponderChat` nunca olham pra
  `visitorUid`).
- Um chat V1 existente nunca é apagado nem migrado automaticamente para V2
  — a Fase B não faz nenhuma escrita retroativa nos documentos que já
  existem, só fecha a criação de novos.

## Fallback transitório removido (Fase B)

Na Fase A, `loja.html#iniciarConversa()` tentava o caminho V2 primeiro e,
se falhasse com `auth/operation-not-allowed` (Anonymous ainda não
habilitado no Firebase Console) **ou** `permission-denied` (Rules antigas
ainda em produção), caía pro caminho legado (`criarChatLegado()`) — um
fallback transitório pra não derrubar o chat durante o rollout.

**A Fase B remove esse fallback por completo**: `criarChatLegado()` foi
apagada de `loja.html`, junto com a checagem
`erroIndicaFallbackTransitorio()` (removida de `public-chat-auth-core.js` e
`public-chat-auth-v1.js`, sem consumidor restante). `iniciarConversa()`
agora só chama `criarChatV2()`; qualquer erro (Anonymous desabilitado,
Rules antigas, rede) mostra uma mensagem única, amigável e recuperável via
`normalizarErroChatPublico()`, sem nunca criar um chat V1. O composer
volta a um estado limpo (input/botão liberados, nome digitado preservado)
pra permitir uma nova tentativa controlada.

No estado atual de produção, Anonymous Auth e as Rules V2 já estão ativos e
o fluxo real de criação foi validado. Se Auth, Rules ou rede falharem, o
comportamento continua sendo um erro visível e recuperável — nunca um
degrade silencioso para criar chat V1.

## Sessão e restauração

Referência local por loja (nunca concede acesso sozinha — só decide o que
TENTAR restaurar; Rules + token é quem concede de fato):

```
localStorage["videPublicChatV2:{storeUid}"] = { chatId, visitorUid, version: 2 }
```

Fluxo (`restaurarChatSalvo`, `public-chat-auth-v1.js`):

1. sem referência salva → retorna `null` quase instantaneamente, **sem**
   chamar `garantirVisitanteAnonimo()` — nenhuma conta anônima nova é criada
   pra quem nunca abriu o chat (custo zero pro visitante comum);
2. com referência → obtém o usuário anônimo (existente, reidratado da
   persistência local do Auth — nunca cria um novo se já havia sessão);
3. compara o `visitorUid` salvo com `auth.currentUser.uid` da sessão atual —
   diverge → descarta a referência, nunca revela se o chat pertence a outro
   uid;
4. `getDoc` do chat pelo Firestore **secundário**;
5. confirma `visitorUid`, `donoUID` da loja atual (`chatV2PertenceALoja` —
   nunca reutiliza chat entre lojas diferentes) e `versaoAcesso == 2`;
6. só então devolve os dados pra `loja.html` religar os `onSnapshot`.

Disparado automaticamente quando a vitrine termina de carregar
(`carregarConfiguracoesVitrine`, fire-and-forget) e defensivamente de novo
ao abrir o widget (`toggleChatWindow`) — idempotente via a flag
`tentouRestaurarChat`.

## Estados de UI

- **Conectando com a loja…**: placeholder do input + `input`/botão
  desabilitados + `aria-busy="true"` na janela do chat, enquanto autentica
  e cria o chat.
- **Restaurando sua conversa…**: mostrado no lugar da saudação padrão
  enquanto `restaurarChatSalvo()` está em andamento.
- **Conectado como X.**: banner de sucesso ao criar (mesmo comportamento
  visual de antes desta etapa).
- Erros (`normalizarErroChatPublico`, sempre em português, nunca expõe
  código técnico/uid): `auth/operation-not-allowed` e
  `auth/network-request-failed`/`unavailable` viram mensagens de "atualize a
  página"/"sem conexão"; `permission-denied` vira "sua conversa anterior não
  está mais disponível, inicie uma nova".

## O que NÃO mudou

- Modelo de dados de `mensagens`/`eventos` (campos, limites, enum de tipos)
  — só ganhou autoria real no caminho V2, nada foi removido.
- Painel do dono/funcionário (`atendimento.js`, `atendimento.css`,
  `dashboard.html`) — zero alteração; a Central de Atendimento não sabe (e
  não precisa saber) se um chat é V1 ou V2 pra exibir/responder.
- Nenhuma Cloud Function nova.
- A implementação da fase não adicionou Cloud Function. O rollout externo
  posterior habilitou Anonymous Auth e tornou efetivas as Rules necessárias
  ao fluxo V2.

## Limitações conhecidas desta fase

- Chats V1 existentes continuam pelo contrato legado, mas não são criados
  novos chats V1. Não há migração retroativa automática desses documentos.
- `restaurarChatSalvo()` não distingue "chat arquivado" de "chat não
  encontrado"/"sessão diferente" na resposta ao chamador — todos viram
  `null` (mesma UI: inicia uma conversa nova). É intencional (não revelar
  detalhes de por que a restauração falhou), mas significa que um visitante
  cujo chat foi arquivado pela equipe simplesmente começa um novo, sem
  aviso específico "sua conversa foi encerrada".
- Sem o fallback, um visitante real cujo navegador bloqueia Anonymous Auth
  (extensão de privacidade agressiva, política corporativa) não consegue
  mais iniciar um chat novo — antes, na Fase A, ele caía pro V1. É a troca
  consciente desta fase (ver "Fallback transitório removido" acima); não
  há dado de quantos visitantes reais usam navegadores que bloqueiam esse
  mecanismo. O teste real concluído usou um navegador com Anonymous Auth
  disponível.

## Estado do rollout externo

- Fase B integrada à `main`.
- Anonymous Auth habilitado em produção.
- Rules V2 efetivas no fluxo validado.
- Criação real de chat por visitante anônimo confirmada com sucesso.
- Fallback de criação V1 removido; novos chats usam exclusivamente V2.

O histórico datado das etapas de preparação e publicação permanece nos
handoffs de julho de 2026; ele não representa o estado operacional atual.
