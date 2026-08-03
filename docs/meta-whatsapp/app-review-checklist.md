# Checklist de App Review

Use este checklist no painel Meta. Marque itens somente com evidência real;
o código no GitHub não equivale a aprovação da Meta.

## Produto e identidade

- [ ] App pertence ao Business Manager correto da Vide Hub.
- [ ] Nome, ícone, contato e categoria do app estão completos.
- [ ] Política de privacidade pública, válida e consistente com o produto.
- [ ] Instruções/URL de exclusão de dados públicas e funcionais.
- [ ] Domínios do app e URLs OAuth usam HTTPS e correspondem à produção.
- [ ] WhatsApp está adicionado ao app e o Configuration ID é do ambiente
  correto.

## Permissões solicitadas

- [ ] `whatsapp_business_management`: justificativa mostra conexão,
  descoberta do WABA/número, assinatura, templates e QR Code.
- [ ] `whatsapp_business_messaging`: justificativa mostra envio e recebimento
  no atendimento solicitado pelo cliente.
- [ ] O pedido não inclui permissões desnecessárias.
- [ ] Acesso avançado foi solicitado/obtido quando exigido para empresas que
  não administram o app.

## Evidência de tela

- [ ] Gravação inicia na Vide Hub já autenticada, sem expor dados pessoais.
- [ ] Mostra a área WhatsApp Oficial e o botão “Conectar meu WhatsApp”.
- [ ] Percorre o Embedded Signup da Meta com empresa/número de teste.
- [ ] Retorna à Vide Hub e mostra status conectado/número mascarado.
- [ ] Mostra sincronização de templates e uma conversa de teste autorizada.
- [ ] Mostra o QR oficial, se esse caso de uso fizer parte da submissão.
- [ ] Explica a janela de 24 horas e o uso de templates aprovados.
- [ ] Não exibe token, PIN, App Secret, payload bruto ou IDs sensíveis.

## Instruções ao revisor

Forneça apenas credenciais de um usuário de teste dedicado, o caminho
exato no menu, empresa/número de teste e resultado esperado. Inclua como
repetir o teste e como desconectar. Não forneça secrets de produção.

## Antes de enviar

- [ ] [Justificativas](permissions-justification.md) revisadas por produto e
  privacidade.
- [ ] Teste manual passou em navegador limpo e em viewport móvel.
- [ ] Webhook está verificado, com assinatura e deduplicação validadas.
- [ ] Feature flag está limitada aos UIDs de teste.
- [ ] Screenshots/vídeos não contêm credenciais ou dados reais de clientes.
- [ ] Limitações conhecidas foram declaradas de forma honesta.

Registre ID/data da submissão em um sistema operacional seguro, fora do
repositório se houver dados sensíveis. Se a Meta pedir mudanças, trate a
resposta como novo gate; não ative `audience=public` antes da aprovação.
