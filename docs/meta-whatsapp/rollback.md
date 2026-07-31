# Rollback

O rollback preferencial é por feature flags. Ele impede novas operações sem
apagar conexões, mensagens ou auditoria e sem exigir redeploy imediato.

## Interrupção progressiva

1. Mude `WHATSAPP_EMBEDDED_SIGNUP_AUDIENCE` para `disabled`.
2. Desligue `WHATSAPP_EMBEDDED_SIGNUP_ENABLED` para impedir novas conexões.
3. Desligue separadamente QR, reconexão, desconexão, segunda conexão e
   coexistência conforme a área afetada.
4. Se App Check causou indisponibilidade, desligue somente
   `WHATSAPP_ENFORCE_APP_CHECK` enquanto corrige o cliente.
5. Valide que a UI mostra indisponibilidade controlada e que o atendimento
   existente não foi afetado indevidamente.

## Incidente de credencial

1. Desligue novas conexões.
2. Revogue o token afetado no painel Meta.
3. Desabilite somente a versão exata registrada para a conexão.
4. Marque a conexão como exigindo reconexão, sem apagar histórico.
5. Rotacione App Secret/verify token apenas com plano de transição.
6. Preserve logs sanitizados e auditoria para análise.

## Reversão de código

Se flags não forem suficientes, reverta por um novo PR o commit problemático
e execute novamente todo o Quality Gate. Use os workflows manuais somente
após aprovação. Não force-push, não reescreva histórico e não use deploy
amplo de Functions.

Se regras precisarem de rollback, publique `firestore:rules`/índices pelo
workflow Spark manual. O workflow WhatsApp publica somente a lista explícita
das 19 Functions. Nenhum deles deve ser disparado automaticamente.

## O que não fazer

- não apagar chats, auditorias ou conexões para “limpar” o incidente;
- não substituir por WhatsApp Web ou biblioteca não oficial;
- não copiar tokens para logs, PRs ou tickets;
- não revogar secrets de outros tenants/conexões;
- não mudar Meta, IAM, billing ou APIs sem autorização operacional.

Depois da estabilização, documente causa, impacto, intervalo, SHA/ambiente,
correlation IDs e condições objetivas para reativar cada flag.
