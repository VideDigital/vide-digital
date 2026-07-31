# Prontidão para produção

Nenhum item desta lista foi automaticamente concluído pela implementação.
O responsável pela liberação deve coletar evidência atual de cada gate.

## Código e qualidade

- [ ] PR aprovado e Quality Gate remoto verde no SHA exato a publicar.
- [ ] `pnpm run check`, `test:functions`, `test:unit`, `test:rules`, smoke do
  frontend, fluxos Playwright e responsividade verdes.
- [ ] Workflow continua apenas `workflow_dispatch`, preso à `main`, ao
  projeto `vide-digital-saas` e à lista explícita das 19 Functions.
- [ ] Regras/índices necessários foram revisados; nenhum índice especulativo.
- [ ] Sem secrets, tokens, PINs ou credenciais no diff e nos artifacts.

## Meta

- [ ] Graph API vigente reconfirmada na documentação oficial.
- [ ] App/Business verificados e Configuration ID correto.
- [ ] Domínios e redirect URIs de produção corretos.
- [ ] Acesso avançado/App Review aprovados para os escopos usados.
- [ ] Webhook verificado, inscrito, assinado e testado.
- [ ] Política de privacidade e exclusão de dados publicadas.
- [ ] Número dedicado testado; coexistência só se elegível e aprovada.

## Firebase/GCP

- [ ] Projeto confirmado como `vide-digital-saas`; qualquer ID contendo
  `demo` continua bloqueado.
- [ ] `WHATSAPP_APP_SECRET` e `WHATSAPP_WEBHOOK_VERIFY_TOKEN` existem e a
  conta de runtime tem somente os acessos necessários.
- [ ] IAM customizado cobre create/add/access/disable de secrets por conexão,
  sem papel Admin.
- [ ] Configuração pública e flags foram aplicadas ao ambiente correto.
- [ ] TTL de `whatsapp_onboarding_attempts.expiresAt` foi configurado.
- [ ] App Check está monitorado; enforcement somente após cliente preparado.
- [ ] Alertas, quotas e retenção de logs foram revisados sem expor payloads.

## Ordem operacional

1. Mantenha as flags desligadas.
2. Publique Rules/Indexes pelo workflow Spark manual, se houver mudança.
3. Publique somente as 19 Functions pelo workflow WhatsApp manual.
4. Valide webhook, status e logs sem enviar dados reais.
5. Libere `audience=testers` e um único UID.
6. Execute o roteiro manual de conexão, mensagem, template, QR, reconexão e
   desconexão com ativos de teste.
7. Amplie o grupo progressivamente; monitore taxa de erro, 429, tokens
   revogados, rotas conflitantes e limpeza de credenciais.
8. Libere `public` somente com autorização formal.

## Roteiro manual de aceite (Daniel)

- entrar como owner de uma loja de teste;
- confirmar que o checklist de segurança aparece antes da conexão;
- conectar um número dedicado e validar WABA/número mascarado;
- enviar mensagem dentro da janela e template aprovado fora dela;
- receber mensagem e marcar leitura;
- criar/editar/baixar/imprimir/excluir QR oficial;
- adicionar segundo número, mudar padrão e confirmar roteamento por chat;
- provar que uma terceira conexão é recusada;
- provar que funcionário sem permissão WhatsApp não vê/não chama a ação;
- desconectar com confirmação tipada e confirmar histórico preservado;
- reconectar e verificar auditoria/correlation ID;
- repetir em celular sem overflow horizontal.

Falha em qualquer gate interrompe a liberação e aciona o
[rollback](rollback.md). Nenhum workflow deve ser executado implicitamente.
