# Known Limitations — Vide Hub V1 Hardening

## P1

- O ambiente de produção/staging ainda precisa configurar App Check real antes de publicar Functions públicas.
- Functions declaram runtime Node 20; neste ambiente Codex só havia Node 24 no host. O Emulator carregou as Functions com warning, mas staging deve validar Node 20 real.
- Google Login com popup real ainda precisa teste humano no navegador; o smoke automatizado validou login por e-mail/senha no Auth Emulator.

## P2

- O app ainda usa base64 no Firestore para imagens antigas e novas em alguns fluxos; Storage seguro está preparado para migração gradual, não migração massiva.
- O modelo de notificações com `lidoPor` agora usa Function para alterar apenas o próprio UID, mas subcoleção por leitura segue como melhoria futura.
- Master Mode permanece centralizado no `VideHubContext`; backend seguro para impersonation completa ainda deve ser expandido em Function dedicada se forem adicionadas ações administrativas mais profundas.
- Chat do dashboard atualmente lê mensagens; envio administrativo pelo dashboard não foi ampliado nesta etapa.

## P3

- Há warnings esperados do Firebase CLI sem login durante uso de `demo-vide-hub`; os testes não usam projeto real.
- O Firebase CLI em Node 24 emite warning deprecatório interno sobre `url.parse()`. Não vem do código do Vide Hub.
