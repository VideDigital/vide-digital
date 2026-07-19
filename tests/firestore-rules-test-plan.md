# Firestore Rules Test Plan — Vide Hub V1

## Objetivo

Validar `firebase/firestore.rules.proposed` em Emulator antes de qualquer publicação. Este arquivo é plano de teste, não resultado executado.

## Projeto de teste

- Usar projectId fake, por exemplo `demo-vide-hub`.
- Não conectar produção.
- Não usar credenciais reais.
- Rodar com dados seed por tenant.

## Perfis fake

- `ownerA`
- `ownerB`
- `employeeARead`
- `employeeAEdit`
- `employeeInactive`
- `adminWithClaim`
- `adminWithoutClaim`
- `anonymous`

## Casos mínimos

| Área | Caso | Esperado |
|---|---|---|
| Owner | cria `usuarios/{ownerA}` com `status: "pendente"` e campos reais de `login.html` | permitir |
| Owner | cria `usuarios/{ownerA}` com `status: "aprovado"` | negar |
| Owner | cria/atualiza `plano` ou `featuresManuais` | negar |
| Owner | edita campos de perfil/configuração permitidos | permitir |
| Owner | altera `uid`, `donoUID`, `role`, `admin` | negar |
| Employee | ativo lê produtos/leads permitidos do tenant | permitir |
| Employee | inativo lê/escreve qualquer tenant | negar |
| Employee | read-only escreve módulo | negar |
| Employee | edit escreve módulo permitido | permitir |
| Employee | tenta alterar `donoUID`/tenant | negar |
| Employee | tenta alterar próprias permissões/status | negar |
| Admin | sem claim `videAdmin` altera admin-only | negar |
| Admin | com claim `videAdmin` executa ação prevista | permitir |
| Admin | membro `equipe_admin` sem claim recebe privilégio backend | negar |
| Público | lê vitrine/LP pública | permitir |
| Público | altera vitrine pública | negar |
| Público | toma documento mudando `donoUID` | negar |
| Público | cria lead direto | negar |
| Público | incrementa métrica direta | negar |
| Público | cria chat direto | negar |
| Público | escreve mensagem com `sender: "admin"` | negar |
| Notificações | usuário altera campos de notificação | negar |
| Notificações | modelo futuro marca leitura sem sobrescrever terceiros | definir em teste após migração |

## Critério

Nenhuma rule proposta deve ser publicada antes de todos os casos P0/P1 passarem no Emulator e em staging autenticado.
