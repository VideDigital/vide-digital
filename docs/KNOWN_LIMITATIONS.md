# Known Limitations — Vide Hub V1 Hardening

## P1

- Firebase CLI/Emulator precisam ser instalados localmente para executar a suíte completa.
- App Check está configurado nas Functions públicas, mas precisa configuração real no Firebase antes de staging/produção.

## P2

- O app ainda usa base64 no Firestore para imagens antigas e novas em alguns fluxos; Storage seguro está preparado para migração gradual, não migração massiva.
- O modelo de notificações com `lidoPor` agora usa Function para alterar apenas o próprio UID, mas subcoleção por leitura segue como melhoria futura.
- Master Mode permanece centralizado no `VideHubContext`; backend seguro para impersonation completa ainda deve ser expandido em Function dedicada se forem adicionadas ações administrativas mais profundas.
- Chat do dashboard atualmente lê mensagens; envio administrativo pelo dashboard não foi ampliado nesta etapa.

## P3

- As regras e Functions foram preparadas para testes locais/staging, mas não devem ser chamadas “prontas para produção” antes de validação manual e Emulator real.
- Algumas mensagens antigas do app aparecem com encoding legado em determinados terminais, sem alteração visual proposital nesta fase.
