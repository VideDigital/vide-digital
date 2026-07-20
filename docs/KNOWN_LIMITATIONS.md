# Known Limitations — Vide Hub V1 Hardening

## P1

- O ambiente de produção/staging ainda precisa configurar App Check real antes de publicar Functions públicas.
- Functions declaram runtime Node 20. Codex só tinha Node 24 disponível e não validou com Node 20 real. Auditoria independente (Claude) rodou `test:rules` e `test:frontend:emulator` com Node 20.20.2 real (não só o Emulator avisando sobre a versão) — 14/14 + 5/5 regras e as 15 Functions carregando e executando sem erro. Continua recomendado validar Node 20 também em staging antes do primeiro deploy real, mas deixa de ser bloqueador de teste local.
- Google Login com popup real ainda precisa teste humano no navegador; o smoke automatizado validou login por e-mail/senha no Auth Emulator.

## P2

- Rate limiting das 4 Functions públicas é por IP em janela fixa de 60s, contado em Firestore (`functions/src/shared/rateLimit.js`) — funciona e está testado (`tests/emulator/frontend-emulator-smoke.mjs` prova que a 6ª chamada de `createPublicLead` no mesmo minuto é recusada), mas é uma solução simples: não é distribuída/geo-consciente e não substitui uma camada de rate limit de borda (Cloud Armor, App Check com reCAPTCHA Enterprise) para tráfego real em produção. Limites atuais: `createPublicLead` 5/min, `createPublicChat` 5/min, `sendPublicChatMessage` 20/min, `incrementPublicMetric` 60/min — ajustar conforme uso real observado.
- O app ainda usa base64 no Firestore para imagens antigas e novas em alguns fluxos; Storage seguro está preparado para migração gradual, não migração massiva.
- O modelo de notificações com `lidoPor` agora usa Function para alterar apenas o próprio UID, mas subcoleção por leitura segue como melhoria futura.
- Master Mode permanece centralizado no `VideHubContext`; backend seguro para impersonation completa ainda deve ser expandido em Function dedicada se forem adicionadas ações administrativas mais profundas.
- Chat do dashboard atualmente lê mensagens; envio administrativo pelo dashboard não foi ampliado nesta etapa.

## P3

- Há warnings esperados do Firebase CLI sem login durante uso de `demo-vide-hub`; os testes não usam projeto real.
- O Firebase CLI em Node 24 emite warning deprecatório interno sobre `url.parse()`. Não vem do código do Vide Hub.
