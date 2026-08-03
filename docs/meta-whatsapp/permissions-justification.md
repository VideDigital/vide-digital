# Justificativa de permissões Meta

Adapte o texto à tela real submetida e confirme os requisitos atuais da
Meta. Não solicite escopo que o produto não usa.

## `whatsapp_business_management`

A Vide Hub permite que o administrador de uma loja conecte sua conta
oficial da WhatsApp Business Platform por Embedded Signup, escolha um ativo
ao qual já tem acesso, sincronize modelos aprovados e gerencie QR Codes
oficiais de atendimento. O backend usa a permissão para descobrir e validar
WABAs/números retornados pelo fluxo autorizado, assinar o WABA ao app e
executar as operações de gerenciamento solicitadas pelo próprio tenant.

O navegador nunca recebe o token. A Vide Hub não descobre empresas fora do
consentimento, não muda billing, não cria campanhas em massa e não usa
bibliotecas não oficiais.

Evidência sugerida: conexão via SDK, retorno com número mascarado,
sincronização de templates e criação/remoção de QR oficial.

## `whatsapp_business_messaging`

A Vide Hub fornece uma caixa de atendimento para conversas que clientes
iniciam ou consentem em receber. A permissão é usada para enviar texto na
janela de atendimento permitida, enviar template aprovado quando exigido,
receber mensagens por webhook e marcar mensagens como lidas.

O produto explica a janela de 24 horas, exige template aprovado fora dela,
aplica rate limit e registra auditoria. Não há broadcast nem envio para uma
lista de destinatários; cada chamada trata um chat autorizado.

Evidência sugerida: inbound do número de teste, resposta dentro da janela,
template de teste fora da janela e status entregue/lido.

## Dados e retenção

Declare na submissão a finalidade, base de consentimento, retenção e fluxo
de exclusão reais da Vide Hub. Tokens ficam no Secret Manager; Firestore
mantém apenas metadados operacionais e histórico necessário ao atendimento.
Desconectar preserva histórico comercial, mas desabilita a credencial exata.

## Não afirmar sem evidência

Não escreva que App Review, acesso avançado, coexistência, verificação da
empresa ou uso em produção estão aprovados até confirmar no painel Meta.
