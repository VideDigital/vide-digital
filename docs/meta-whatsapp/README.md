# WhatsApp Oficial: Embedded Signup

Este diretório é o runbook operacional da integração oficial entre a
Vide Hub e a WhatsApp Business Platform da Meta. A implementação usa o
Facebook JavaScript SDK somente para obter um `code` temporário; toda troca
de credenciais, descoberta de ativos e persistência acontece no backend.

## Estado da entrega

- O código do Embedded Signup, reconexão, desconexão, segunda conexão e QR
  Code oficial está implementado.
- O emulador usa um provedor falso e nunca chama a Meta nem o Secret Manager.
- Em produção, todos os recursos novos nascem desligados e exigem liberação
  explícita por ambiente.
- App da Meta, Configuration ID, acesso avançado, App Review, domínios,
  webhook, IAM e secrets são configurações externas. Este repositório não
  as cria e esta entrega não afirma que elas já foram aprovadas.
- Nenhuma biblioteca de WhatsApp Web ou automação não oficial é usada.

## Ordem segura de leitura e liberação

1. [Configurar o Embedded Signup](embedded-signup-setup.md).
2. [Revisar o modelo de segurança](security-model.md).
3. [Preparar usuários e empresas de teste](test-users-and-businesses.md).
4. [Preencher a justificativa de permissões](permissions-justification.md).
5. [Concluir o checklist de webhook](webhook-checklist.md).
6. [Executar o checklist de App Review](app-review-checklist.md).
7. [Validar a prontidão de produção](production-readiness.md).
8. Consultar [troubleshooting](troubleshooting.md) e [rollback](rollback.md)
   quando necessário.

## Superfície publicada

O workflow manual dedicado lista explicitamente 19 Functions: webhook,
envio, templates, leitura, status/validação, conexões, quatro operações de
onboarding, renomear/desconectar e quatro operações de QR Code. Ele nunca
usa `--only functions` de forma ampla.

As regras e os índices são publicados separadamente pelo workflow Spark.
As coleções internas `whatsapp_onboarding_attempts`,
`whatsapp_onboarding_locks` e `whatsapp_qr_codes` não aceitam acesso direto
do cliente; o frontend usa somente callable Functions.

## Fontes oficiais

Antes de cada liberação real, reconfirme na documentação da Meta a versão
da Graph API e os requisitos correntes. O código está centralizado em
`WHATSAPP_GRAPH_VERSION` e usa `v26.0` nesta revisão.

- Meta for Developers: <https://developers.facebook.com/docs/whatsapp/embedded-signup/>
- WhatsApp Cloud API: <https://developers.facebook.com/docs/whatsapp/cloud-api/>
- Webhooks: <https://developers.facebook.com/docs/graph-api/webhooks/>
- QR Codes oficiais: <https://developers.facebook.com/docs/whatsapp/business-management-api/message-qrdls/>

Links e requisitos externos mudam. Uma confirmação feita em outra data não
substitui a validação humana imediatamente antes do deploy/liberação.
