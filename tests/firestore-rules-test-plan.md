# Firestore Rules Test Plan — Vide Hub V1

## Objetivo

Validar `firebase/firestore.rules.proposed` em emulador antes de qualquer publicação.

## Perfis fake

- `ownerA`
- `ownerB`
- `employeeARead`
- `employeeAEdit`
- `employeeInactive`
- `admin`
- `anonymous`

## Casos mínimos

| Caso | Esperado |
|---|---|
| `ownerA` lê/escreve `produtos` de `ownerA` | permitir |
| `ownerA` lê/escreve `produtos` de `ownerB` | negar |
| `employeeARead` lê produtos de `ownerA` | permitir |
| `employeeARead` escreve produtos de `ownerA` | negar |
| `employeeAEdit` escreve produtos de `ownerA` | permitir |
| `employeeInactive` lê/escreve qualquer tenant | negar |
| usuário comum usa `masterUID` no frontend | rules não devem depender de `masterUID` |
| admin lê/altera loja alvo | permitir apenas com claim/admin real |
| público lê `vitrines_publicas/{slug}` | permitir |
| público cria lead | permitir somente formato mínimo validado |
| público altera produto/pedido | negar |
| usuário marca notificação como lida com próprio uid | permitir |
| usuário altera `lidoPor` de outro uid | negar |

## Ferramentas recomendadas

- Firebase Emulator Suite.
- `@firebase/rules-unit-testing`.
- Dados seed por tenant.

## Critério

Nenhuma regra proposta deve ser publicada antes de todos os casos P0/P1 passarem no emulador.
