# Troubleshooting

Use o support code/correlation ID exibido na interface para localizar logs.
Nunca peça ao cliente token, PIN, App Secret ou screenshot do painel que
revele credenciais.

| Sintoma | Verificação segura | Ação |
| --- | --- | --- |
| Recurso indisponível | flags, audience, App ID e Configuration ID | manter desligado e corrigir configuração do ambiente |
| Popup/SDK não abre | domínio permitido, CSP, bloqueador e HTTPS | corrigir domínio/CSP; não trocar por SDK não oficial |
| State/origem inválida | tentativa expirou ou mudou de origem | cancelar e iniciar nova tentativa na origem correta |
| Code expirado/replay | idade/status da tentativa | iniciar novamente; nunca reutilizar code |
| Permissões ausentes | scopes e acesso avançado no painel Meta | corrigir App Review/usuário de teste |
| Nenhum WABA/número | ativos autorizados no Embedded Signup | associar ativo de teste e repetir |
| Número em conflito | rota existente por `phone_number_id` | identificar o owner correto; não sobrescrever rota |
| Limite atingido | conexões físicas ativas do owner | desconectar uma conexão ou manter o limite de duas |
| Secret Manager negou | IAM da conta de runtime e projeto do resource | aplicar menor privilégio fora do código |
| Conectou com aviso de templates | status/código sanitizado da sincronização | sincronizar novamente; conexão permanece válida |
| Meta 429 | taxa de chamadas e retry-after | aguardar/backoff; não criar loop de polling |
| Token revogado | status/diagnóstico admin mascarado | usar reconexão oficial |
| Limpeza pendente | `credentialCleanupPending` e versão exata | desabilitar a versão com procedimento administrativo |
| QR não aparece | flag QR, conexão conectada, permissão Meta | corrigir gate; não gerar QR local alternativo |
| App Check bloqueia clientes | inicialização/token no frontend | desligar enforcement e corrigir rollout |

## Emulador

O emulador usa `demo-vide-hub`, provider Meta fake e Java 21. Se a descoberta
das Functions exceder dez segundos em uma máquina lenta, use apenas no
processo atual `FUNCTIONS_DISCOVERY_TIMEOUT=30` e repita. Isso não deve ser
persistido nem levado à produção.

IDs, URLs e imagens `example.invalid` do emulador são sintéticos. Sucesso no
emulador não prova conectividade Meta real.

## Escalonamento

Registre hora, ambiente, SHA, Function, correlation ID, código sanitizado e
passos de reprodução. Remova PII e credenciais. Se houver risco de vazamento,
siga imediatamente o [rollback](rollback.md).
