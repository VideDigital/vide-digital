# Anonymous Auth no Chat Público (RD3)

Substitui o modelo antigo — "conhecer o id aleatório do documento `chats/{id}`
é a única capability" — por uma identidade real de visitante (Firebase
Anonymous Auth), vinculada ao chat via `visitorUid`. Evolui a coleção
`chats`/`mensagens`/`eventos` já existente (mesmo modelo da Central de
Atendimento, ver `docs/CENTRAL_ATENDIMENTO.md`) — não cria uma central, um
modal ou uma coleção nova. Rollout em **duas fases** para nunca derrubar o
chat público durante a migração; este documento cobre o estado ao final da
**Fase A**.

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

Funções novas em `firestore.rules` (todas puramente aditivas na Fase A —
nenhuma removida):

| Função | Papel |
|---|---|
| `isAnonymousAuth()` | `request.auth != null` e `token.firebase.sign_in_provider == "anonymous"` |
| `chatTemAcessoV2(chatData)` | o documento tem `visitorUid` (string não vazia) e `versaoAcesso == 2` |
| `chatLegadoSemVisitor(chatData)` | o inverso — qualquer doc sem o par completo conta como V1 |
| `visitantePodeAcessarChat(chatData)` | anônimo + `chatTemAcessoV2` + `visitorUid == request.auth.uid` |
| `chatPublicoV2CreateValido()` | create de `chats/{id}` pelo visitante anônimo (whitelist fechada, `visitorUid == request.auth.uid`, `versaoAcesso == 2`) |
| `chatPublicoV2UpdateValido()` | update público (mensagem do cliente) só por quem tem a identidade |
| `mensagemClienteV2Valida(chatId)` | mensagem do cliente com `autorUid`/`autorTipo` reais e obrigatórios |
| `eventoClienteV2Valido(chatId)` | evento do cliente com `autorUid` real (nunca vazio) |

**Ponto crítico de segurança, já ativo na Fase A** (não esperar a Fase B):
assim que um chat nasce V2, os caminhos LEGADOS de update/mensagem/evento
(`chatUpdatePublicoValido`, `mensagemClienteValida`,
`eventoAtendimentoClientePublicoValido`) passam a exigir
`chatLegadoSemVisitor(chatData)` — ou seja, **um chat V2 nunca mais aceita
escrita pública sem identidade**, mesmo que o atacante conheça o id. Sem
essa trava, o rollout ficaria pior que o modelo antigo: coexistiriam DOIS
caminhos de escrita pública pro mesmo chat (com e sem identidade).

Leitura: `chats/{chatId}` ganhou `|| visitantePodeAcessarChat(resource.data)`
no `allow read` (get, nunca list — o visitante continua sem listar chats).
`mensagens/{msgId}` ganhou o mesmo `||` no ramo autenticado. `eventos/{id}`
**não muda**: o visitante nunca lê a timeline administrativa, V1 ou V2 —
contrato preservado.

`visitorUid`/`versaoAcesso` são **imutáveis**: nenhuma whitelist de update
(pública ou administrativa) inclui essas chaves — nem o próprio dono
consegue alterá-las depois da criação.

## Compatibilidade com chats legados (V1)

- Chats criados antes desta etapa (sem `visitorUid`) continuam funcionando
  pelo contrato antigo — `chatPublicoValido()`, `chatUpdatePublicoValido()`,
  `mensagemClienteValida()`, `eventoAtendimentoClientePublicoValido()` não
  mudaram de comportamento pra eles.
- **Fase A ainda permite criar chat legado novo** — é o fallback transitório
  (ver abaixo). Isso só termina na Fase B.
- Equipe (dono/funcionário) continua lendo e respondendo chats V1 e V2 pela
  mesma regra de sempre (`podeVerChat`/`podeResponderChat` nunca olham pra
  `visitorUid`).

## Fallback transitório (Fase A)

`loja.html#iniciarConversa()` tenta o caminho V2 primeiro
(`garantirVisitanteAnonimo()` + `criarChatV2()`). Se falhar com
`auth/operation-not-allowed` (Anonymous ainda não habilitado no Firebase
Console) **ou** `permission-denied` (Rules antigas ainda em produção — o
código novo publicado antes do deploy de Rules), cai pro caminho legado
(`criarChatLegado()`, idêntico ao comportamento anterior a esta missão) —
com `console.warn` claro, sem nenhuma mensagem técnica pro visitante, e
comentário `TRANSITÓRIO` marcando os dois pontos do código
(`public-chat-auth-core.js#erroIndicaFallbackTransitorio`,
`loja.html#iniciarConversa`).

**Este fallback existe só para a Fase A não derrubar o chat durante o
rollout.** Ele deve ser removido na Fase B, depois de confirmar em produção
que Anonymous está ativo e as Rules V2 estão publicadas — ver checklist em
`docs/HANDOFF_2026-07-28.md`.

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
- Nenhum deploy nesta etapa — ver "Passos externos" em
  `docs/HANDOFF_2026-07-28.md`.

## Limitações conhecidas desta fase

- O fallback legado da Fase A significa que, até o passo externo (Anonymous
  habilitado + Rules publicadas) ser confirmado em produção, **novos chats
  em produção continuam nascendo V1** — a proteção V2 só é real localmente/
  no CI até lá. Isso é esperado e documentado, não escondido.
- `restaurarChatSalvo()` não distingue "chat arquivado" de "chat não
  encontrado"/"sessão diferente" na resposta ao chamador — todos viram
  `null` (mesma UI: inicia uma conversa nova). É intencional (não revelar
  detalhes de por que a restauração falhou), mas significa que um visitante
  cujo chat foi arquivado pela equipe simplesmente começa um novo, sem
  aviso específico "sua conversa foi encerrada".
