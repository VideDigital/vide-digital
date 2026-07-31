# Checklist do webhook

## Configuração externa

- [ ] A Function `whatsappWebhook` está publicada na região configurada.
- [ ] Callback URL HTTPS exata foi cadastrada no app Meta correto.
- [ ] Verify token real existe em `WHATSAPP_WEBHOOK_VERIFY_TOKEN` e nunca foi
  escrito no repositório.
- [ ] Desafio GET foi concluído com sucesso.
- [ ] App está inscrito no WABA correto.
- [ ] Campos/eventos exigidos pelo produto foram assinados.
- [ ] App Secret corresponde ao app e a assinatura de POST é validada antes
  do processamento.

## Testes

- [ ] Assinatura ausente/inválida retorna negação sem gravar dados.
- [ ] Payload válido roteia pelo `phone_number_id`, nunca por dado do cliente.
- [ ] Número sem rota ativa é ignorado com log sanitizado.
- [ ] Evento duplicado não duplica mensagem nem contador.
- [ ] Eventos fora de ordem não fazem status regredir.
- [ ] Texto e placeholders seguros de mídia inbound aparecem no chat.
- [ ] Não há download automático de mídia nesta versão.
- [ ] Log contém correlation ID, sem token, assinatura ou payload integral.

## Operação

- Monitore falhas de assinatura, rota desconhecida, 429 e eventos rejeitados.
- Não imprima `Authorization`, App Secret, verify token ou payload do cliente.
- Ao trocar App Secret/verify token, planeje rotação e teste de verificação
  antes de remover a versão anterior.
- A assinatura do WABA realizada no onboarding não substitui a configuração
  inicial do callback e dos campos no app.

Se o webhook falhar depois de uma liberação, desligue novas conexões por
flag; preserve as conexões/histórico existentes enquanto investiga.
