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
Em falha antes do commit, a compensação desabilita as versões recém-criadas.
Após uma reconexão confirmada e gravada, as versões exatas substituídas são
desabilitadas; falhas nessa limpeza geram `credentialCleanupPending` sem
invalidar a nova conexão.
Ao desconectar, apenas as versões exatas daquela conexão são desabilitadas;
se a limpeza falhar, a conexão fica marcada para intervenção, sem apagar o
histórico.

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
