# Firestore Rules Plan — Vide Hub V1

## Objetivo

Definir uma proposta revisável para isolamento multi-tenant do Vide Hub sem publicar regras em produção nesta fase.

## Identidade esperada

- `authUid`: usuário autenticado no Firebase Auth.
- `ownerUid`: dono real da loja.
- `storeUid/effectiveUid`: tenant operacional.
- Funcionário: documento `funcionarios/{authUid}` ativo com `donoUID`.
- Admin: `VIDE_SUPER_ADMIN_EMAIL` ou membro confirmado em `equipe_admin`.

## Coleções observadas

- `usuarios`
- `funcionarios`
- `produtos`
- `pedidos`
- `leads`
- `templates`
- `campanhas`
- `campanhas_historico`
- `vitrines_publicas`
- `banners_loja`
- `landing_pages`
- `landing_pages_blocos`
- `landing_pages_publicas`
- `landing_pages_blocos_publicas`
- `metricas_vitrines`
- `metricas_produtos`
- `notificacoes`
- `solicitacoes_customizacao`
- `config`
- `equipe_admin`
- `chats`
- `chats/{chatId}/mensagens`

## Regras necessárias

1. Owner lê/escreve documentos do próprio tenant.
2. Funcionário ativo lê/escreve apenas tenant do `donoUID`.
3. Escrita de funcionário depende de `permissoes.editar`.
4. Leitura de funcionário depende de `permissoes.ver` ou `permissoes.editar`.
5. Admin não deve ser concedido por campo enviado pelo cliente.
6. Coleções públicas devem permitir leitura somente de docs publicados/ativos.
7. Writes públicos devem ser mínimos e validados.
8. `masterUID` é apenas parâmetro de frontend; rules devem validar o admin real.

## Campos críticos por coleção

| Coleção | Campo de tenant | Observação |
|---|---|---|
| `usuarios` | doc id | Dono da loja. |
| `funcionarios` | `donoUID` | Funcionário pertence ao owner. |
| `produtos` | `criadoPor` | Deve ser `ownerUid`. |
| `pedidos` | `criadoPor` | Deve ser `ownerUid`. |
| `leads` | `criadoPor` | Deve ser `ownerUid`; leads públicos devem validar origem. |
| `templates` | `criadoPor` | Deve ser `ownerUid`. |
| `landing_pages*` | `donoUID` / `lpId` | Públicas dependem de doc publicado. |
| `vitrines_publicas` | `donoUID` | Leitura pública por slug. |
| `banners_loja` | `donoUID` | Leitura pública se loja ativa. |
| `notificacoes` | `destinatarios`, `lidoPor` | Usuário só marca a própria leitura. |
| `config` | doc id | Admin only. |
| `equipe_admin` | email/uid | Admin only. |

## Dependências

- Definir função/claim admin ou regra segura para `equipe_admin`.
- Emulador Firebase para testes.
- Índices descritos em `docs/FIREBASE_INDEXES_PLAN.md`.

## Não pronto para produção até

- Testar owner/funcionário/admin no emulador.
- Validar writes públicos de leads/métricas/chat contra abuso.
- Migrar criação/desativação de funcionário para Cloud Functions.
