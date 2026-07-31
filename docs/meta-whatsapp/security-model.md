# Modelo de segurança

## Fronteiras de confiança

O navegador é uma origem não confiável. Ele recebe somente configuração
pública, identificadores seguros, status e mensagens de erro sanitizadas.
O backend é a única camada que fala com a Graph API usando credenciais.

- O `postMessage` do SDK é aceito somente de origens oficiais da Meta.
- State, identidade da tentativa e idempotency key são protegidos por HMAC.
- Tentativas são vinculadas a `ownerUid`, `authUid`, origem e expiração.
- Em produção, o início exige correspondência exata com uma origem HTTPS de
  `WHATSAPP_EMBEDDED_SIGNUP_ALLOWED_ORIGINS`; a conclusão precisa chegar da
  mesma origem registrada na tentativa.
- O code de autorização não é persistido nem logado.
- Tokens/PINs não entram em Firestore, resposta HTTP, DOM, localStorage ou
  sessionStorage.
- Logs e auditorias usam correlation ID e códigos sanitizados, nunca payload
  bruto da Meta ou cabeçalho de autorização.
- Rate limits existem para iniciar/concluir onboarding e gerenciar conexões
  e QR Codes.
- Firestore Rules negam acesso direto a tentativas, locks e QR Codes.

## Autorização e isolamento por tenant

O owner sempre gerencia sua loja. Funcionários precisam da permissão
explícita de edição do módulo `whatsapp`; permissões de atendimento, CRM ou
configurações não são herdadas. Cada Function resolve o contexto no backend
e compara `ownerUid` antes de ler ou alterar uma conexão.

Rotas de telefone têm unicidade global. A conclusão rejeita um número já
vinculado a outro owner e aplica limite de duas conexões físicas ativas por
loja. Conexões `disconnected` ou `revoked` preservam histórico, mas não
consomem o limite ativo.

## Secret Manager e IAM mínimo

A conta de runtime precisa ler a versão exata das credenciais usadas e, para
o Embedded Signup/desconexão, precisa das operações mínimas equivalentes a:

- `secretmanager.secrets.create`;
- `secretmanager.versions.add`;
- `secretmanager.versions.access`;
- `secretmanager.versions.disable`;
- leitura de metadados estritamente necessária para localizar a versão.

Conceda isso por uma função IAM customizada de menor privilégio, escopada ao
projeto/recursos corretos. Não conceda Secret Manager Admin. A concessão,
validação e revisão de IAM são tarefas externas pendentes; nenhum workflow
desta entrega modifica IAM.

## Ciclo de vida de credenciais

Cada conexão nova recebe secrets determinísticos por hash opaco e uma nova
versão. O Firestore guarda somente resource names validados e versões exatas.
Em falha antes do commit, a compensação desabilita as versões recém-criadas
— **exceto o PIN quando o número foi registrado ou o resultado da chamada é
ambíguo** (ver seção seguinte). Após uma reconexão confirmada e gravada, as versões exatas
substituídas são desabilitadas; falhas nessa limpeza geram
`credentialCleanupPending` sem invalidar a nova conexão.
Ao desconectar, apenas as versões exatas daquela conexão são desabilitadas;
se a limpeza falhar, a conexão fica marcada para intervenção, sem apagar o
histórico.

### Ciclo seguro do PIN de registro (revisão 2026-07-31)

Quando `registerPhone` exige PIN de dois fatores, a ordem das operações é
estrita e nunca invertida:

1. o PIN é gerado exclusivamente no backend (`crypto.randomInt`), nunca
   enviado ao navegador, nunca incluído em resposta de callable, log ou
   mensagem de erro;
2. uma versão protegida é criada no Secret Manager **antes** de qualquer
   chamada à Meta;
3. a referência exata dessa versão (nunca o valor do PIN) é registrada no
   documento da tentativa (`pinSecretResourcePending`) — isso permite
   auditoria/recuperação administrativa mesmo se a Function cair logo
   depois;
4. só então o número é registrado na Meta com esse PIN.

`registerPhone` não recebe retry automático. Timeout, falha de rede, resposta
5xx, auth/rate limit ou erro sem `providerStatus` confiável não provam que a
Meta deixou de aplicar o registro. Nesses casos:

- a versão e `pinSecretResourcePending` são preservadas;
- a tentativa fica `requires_action`, com `registrationOutcome: "unknown"`
  e `recoveryRequired: true`;
- o lock do tenant impede novo onboarding e novo PIN até intervenção
  administrativa;
- retorno público, erro e logs contêm somente código de suporte e metadados
  operacionais sanitizados — nunca o PIN ou caminho do segredo.

Somente uma resposta 4xx recebida diretamente da Meta e marcada pelo
adaptador como rejeição definitiva (`confirmed_not_registered`) permite
desabilitar a nova versão temporária e limpar a referência pendente. Uma
falha antes de a chamada começar também é segura para limpeza. Em qualquer
dúvida, o comportamento é preservar.

Se o registro tiver sucesso mas uma etapa **posterior** falhar (assinatura do
webhook, gravação da conexão etc.), o PIN também nunca é desabilitado. Esse
caso vira pendência recuperável e exige intervenção administrativa.

**Limitação conhecida**: se a própria invocação da Cloud Function morrer
(crash do processo, não um erro JS capturável) exatamente entre o registro
bem-sucedido e a gravação final da conexão, o fluxo atual não retoma
automaticamente essa tentativa — uma nova chamada de `whatsappCompleteOnboarding`
com o mesmo `attemptId` é rejeitada (`"Esta tentativa já foi processada"`),
  o que impede duplo registro/PIN. O lock com `recoveryRequired` também
  impede iniciar outra tentativa silenciosamente; um administrador precisa
  reconciliar o estado antes de liberar novo onboarding. Retomada automática de uma tentativa parcialmente executada
exigiria transformar `whatsappCompleteOnboarding` numa máquina de estados
resumível — fora do escopo desta correção (evita reescrever o fluxo
inteiro por um risco residual de janela muito estreita, já mitigado pela
ordem seura de escrita e pelo log de recuperação).

## Assinatura da WABA (webhook)

`subscribeWaba` inscreve o app da Vide Hub para receber eventos daquela
WABA (`POST /{waba-id}/subscribed_apps`). Essa chamada é tratada pela
própria Meta como uma operação **idempotente da plataforma**: inscrever um
app já inscrito não duplica nada e não tem efeito colateral adicional.

**Decisão**: este código nunca executa `unsubscribe` automático como
"compensação" de uma tentativa de onboarding que falhou depois de assinar
a WABA. Motivo: uma WABA pode estar compartilhada entre múltiplas
conexões/tentativas da mesma loja, ou (em tese) referenciada por outro
fluxo — não existe, nesta implementação, uma forma de provar com segurança
que a inscrição foi criada exclusivamente por esta tentativa específica
antes de removê-la. Desinscrever incorretamente interromperia mensagens
válidas de uma conexão que já funciona. A documentação oficial vigente da
Meta não garante um sinal de exclusividade utilizável aqui (o endpoint de
assinatura não devolve um identificador de "quem assinou primeiro"), então
o comportamento destrutivo não foi inventado.

- Se `subscribeWaba` em si falhar, isso já cai no tratamento de erro
  padrão da tentativa (nenhuma assinatura foi criada, nada a desfazer).
- Se `subscribeWaba` tiver sucesso mas uma etapa posterior falhar, a
  inscrição permanece — é seguro por construção (idempotente, sem efeito
  colateral em conexões existentes) e nunca é desfeita automaticamente.
- Não existe hoje um mecanismo de `subscriptionCleanupPending` porque não
  há cenário, no fluxo atual, em que a inscrição precise ser desfeita: ela
  nunca é a causa de uma falha, e mantê-la nunca quebra uma conexão
  legítima (múltiplas conexões podem compartilhar a mesma assinatura sem
  conflito).
- Recuperação manual (revisão de assinaturas ativas via Graph API,
  eventual desinscrição deliberada) continua possível fora de banda por um
  administrador, mas nunca automatizada por este código.

## Consistência e reconciliação dos QR Codes

- `expectedUpdatedAtMs` é conferido na mesma transação que valida tenant,
  verifica o lock anterior e grava o novo `operationLock`.
- O lock registra token, tipo da operação, início, expiração e versão-base.
  O TTL é superior ao timeout das escritas do Meta Client, que não fazem
  retry automático.
- Update e delete finalizam em transação separada e só aplicam se o token
  ainda pertencer à operação. Perda do lock retorna `aborted`, nunca sucesso.
- Release também devolve `{ applied, reason }` e nunca remove o token de
  outra operação.
- Depois da criação remota, o documento `whatsapp_qr_codes/{qrId}` e o lock
  `active` com o mesmo `qrId` são gravados na mesma transação.
- Falha de consolidação tenta excluir o QR remoto. Falha dessa compensação
  mantém `compensation_pending` e `remoteCodePendingCleanup` na coleção
  privada `whatsapp_qr_locks`.
- Update/delete com resultado remoto ambíguo ou perda do token registram
  `reconciliation_pending` somente com owner, conexão, QR, operação,
  correlation ID, motivo sanitizado e timestamps. Tokens e segredos nunca
  entram nessa coleção.

## App Check

As callables de onboarding aceitam enforcement de App Check por flag. A
flag deve permanecer desligada até o cliente web estar inicializado e o
rollout de teste comprovar compatibilidade. No emulador ela é sempre
desligada, e o secret global também não é vinculado.

## Incidentes

Em suspeita de vazamento: desligue as flags, revogue o token na Meta,
desabilite a versão exata no Secret Manager, preserve auditoria, identifique
o correlation ID e siga o [rollback](rollback.md). Nunca copie tokens para
issues, PRs, chats ou logs de CI.
