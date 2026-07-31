# Usuários e empresas de teste

Use ativos exclusivos de teste. Nunca use uma loja, WABA, número ou conversa
real para preparar App Review ou validar um deploy inicial.

## Matriz mínima

| Papel | Objetivo |
| --- | --- |
| Owner de teste | onboarding, gestão, QR e desconexão |
| Funcionário com `whatsapp: editar` | operações autorizadas |
| Funcionário com `whatsapp: ver` | leitura sem gestão |
| Funcionário sem permissão | provar negação no UI e backend |
| Admin de teste | diagnóstico mascarado e suporte |
| Cliente/número destinatário | janela de 24 h, template e inbound |

## Ativos Meta

- Crie/associe uma empresa de teste conforme os recursos atuais oferecidos
  pela Meta e mantenha-a separada da empresa de produção.
- Use WABA e números fornecidos ou aprovados para teste.
- Cadastre somente destinatários que consentiram com o teste.
- Use template de teste aprovado; não falsifique status de aprovação.
- Não reutilize PIN, token ou screenshot entre ambientes.

## Rollout interno

Configure `WHATSAPP_EMBEDDED_SIGNUP_AUDIENCE=testers` e informe apenas UIDs
Firebase de teste em `WHATSAPP_EMBEDDED_SIGNUP_TESTER_UIDS`. Admins também
são aceitos nesse modo; isso não substitui a autorização por tenant.

O Emulator Suite usa IDs sintéticos (`owner-pro`, `employee-edit` etc.) e um
provider fake. Esses testes validam produto e segurança do repositório, mas
não comprovam configuração real da Meta, conectividade nem aprovação.

## Limpeza

Ao terminar, desconecte pelo produto, confirme a desabilitação das versões
de credencial, remova usuários do rollout e revogue ativos temporários no
painel Meta. Preserve somente auditoria necessária e não exporte dados de
teste com tokens ou payloads brutos.
