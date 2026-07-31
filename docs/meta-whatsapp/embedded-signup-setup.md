# Configuração do Embedded Signup

## Pré-requisitos externos

No painel Meta for Developers, um administrador deve confirmar:

- app do tipo adequado à integração comercial;
- produto WhatsApp adicionado;
- Embedded Signup configurado e um Configuration ID criado;
- domínios reais da Vide Hub permitidos para o JavaScript SDK;
- URI de redirecionamento OAuth exata, com HTTPS;
- WABA e números de teste disponíveis;
- permissões `whatsapp_business_messaging` e
  `whatsapp_business_management` no nível exigido para o público-alvo;
- URLs públicas de política de privacidade e exclusão de dados;
- webhook verificado e inscrito nos eventos usados pela aplicação.

Não coloque valores reais neste documento, no Git, no HTML ou no
JavaScript. Use os mecanismos de configuração do ambiente de Functions.

## Configuração pública por ambiente

O backend lê estas variáveis. App ID e Configuration ID são identificadores
públicos, mas ainda devem ser controlados por ambiente:

| Variável | Valor inicial seguro | Finalidade |
| --- | --- | --- |
| `WHATSAPP_EMBEDDED_SIGNUP_APP_ID` | vazio | App ID enviado ao SDK |
| `WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID` | vazio | Configuration ID do fluxo |
| `WHATSAPP_EMBEDDED_SIGNUP_ALLOWED_ORIGINS` | vazio | origens HTTPS exatas do dashboard, separadas por vírgula; obrigatórias para liberar o fluxo |
| `WHATSAPP_EMBEDDED_SIGNUP_AUDIENCE` | `disabled` | `disabled`, `testers` ou `public` |
| `WHATSAPP_EMBEDDED_SIGNUP_TESTER_UIDS` | vazio | UIDs Firebase separados por vírgula |
| `VIDE_ENVIRONMENT` | `production` | rótulo operacional do ambiente |

Flags independentes, todas desligadas por padrão em produção:

| Variável | Recurso |
| --- | --- |
| `WHATSAPP_EMBEDDED_SIGNUP_ENABLED` | iniciar Embedded Signup |
| `WHATSAPP_COEXISTENCE_ENABLED` | oferecer modo de coexistência |
| `WHATSAPP_SECOND_CONNECTION_ENABLED` | permitir segunda conexão ativa |
| `WHATSAPP_QR_CODES_ENABLED` | gerenciar QR Codes oficiais |
| `WHATSAPP_RECONNECT_ENABLED` | iniciar reconexão |
| `WHATSAPP_DISCONNECT_ENABLED` | desconectar preservando histórico |
| `WHATSAPP_ENFORCE_APP_CHECK` | exigir token App Check nas callables de onboarding |

Ative App Check somente depois que o frontend estiver inicializado, os
tokens forem validados no ambiente de teste e o monitoramento não mostrar
clientes legítimos bloqueados. O código está preparado, mas a flag nasce
desligada para impedir uma indisponibilidade acidental.

## Secrets

- `WHATSAPP_APP_SECRET`: secret global ligado somente às Functions de
  onboarding em produção. Nunca vai ao navegador.
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`: secret global usado pelo webhook.
- Tokens e PINs de cada conexão: criados como secrets separados pelo
  backend, com o resource name e a versão exata guardados no Firestore.

O `code` temporário obtido pelo SDK é trocado no backend. O navegador não
recebe token, App Secret, PIN ou resource name do Secret Manager.

## Liberação progressiva

1. Mantenha `audience=disabled` e todas as flags desligadas no primeiro
   deploy do código.
2. Configure App/Configuration ID e secrets fora do repositório.
3. Use `audience=testers` com a menor lista possível de UIDs.
4. Ative apenas Embedded Signup; valide conexão dedicada ponta a ponta.
5. Ative QR, reconexão e desconexão individualmente.
6. Ative a segunda conexão somente depois dos testes de roteamento.
7. Coexistência depende de elegibilidade/aprovação da Meta e permanece
   desligada até confirmação explícita.
8. Passe para `audience=public` somente depois do checklist de produção.

## Comportamento do fluxo

A tentativa expira em 15 minutos, é vinculada ao tenant, usuário, origem HTTPS presente na allowlist e
state HMAC, aceita idempotência e bloqueia replay/conclusão concorrente. O
backend troca o code, valida scopes e App ID, descobre WABA/número no
servidor, registra o número quando aplicável, assina o WABA no app, grava
credenciais por versão e cria conexão/rota em transação.

Tentativas carregam `expiresAt`. Configure uma política TTL externa para
`whatsapp_onboarding_attempts.expiresAt` antes da liberação pública; isso
é uma tarefa operacional e não é executado por este repositório. O lock é
um único documento sobrescrito por owner e é liberado ao terminar.
