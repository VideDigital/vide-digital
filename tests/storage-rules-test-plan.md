# Storage Rules Test Plan — Vide Hub V1

## Objetivo

Validar `firebase/storage.rules.proposed` em Emulator antes de qualquer publicação. Este arquivo é plano de teste, não resultado executado.

## Projeto de teste

- Usar projectId fake, por exemplo `demo-vide-hub`.
- Não conectar produção.
- Não usar credenciais reais.
- Criar seeds Firestore para owner e funcionários antes dos testes de Storage com lookup.

## Casos mínimos

| Área | Caso | Esperado |
|---|---|---|
| Owner | envia jpeg/png/webp/gif válido para `stores/{ownerUid}/products/...` | permitir |
| Owner | envia imagem acima do limite da categoria | negar |
| Owner | envia SVG | negar |
| Owner | envia HTML/JS/executável | negar |
| Owner | envia PDF como produto digital | permitir |
| Owner | envia ZIP ou MIME genérico como produto digital | negar |
| Employee produtos | funcionário ativo com `produtos` em `permissoes.editar` envia imagem de produto | permitir |
| Employee produtos | funcionário read-only envia imagem de produto | negar |
| Employee configurações | funcionário com `configuracoes` envia banner/perfil | permitir |
| Employee landing-pages | funcionário com `landing-pages` envia asset de LP | permitir |
| Cross-tenant | owner/employee de outro tenant escreve em `stores/{ownerUid}` | negar |
| Público | anônimo escreve qualquer path | negar |
| Delete | owner/employee autorizado remove próprio arquivo | permitir |
| Delete | público ou outro tenant remove arquivo | negar |

## Critério

Nenhuma Storage Rule proposta deve ser publicada antes de passar no Emulator e em staging com os paths reais do frontend migrado.
