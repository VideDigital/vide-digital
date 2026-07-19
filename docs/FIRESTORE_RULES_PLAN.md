# Firestore Rules Plan — Vide Hub V1

> PROPOSTA NÃO PRONTA PARA PRODUÇÃO.
> Não publicar antes de Cloud Functions, custom claims, testes no Emulator, migração do frontend e validação autenticada em staging.

## Objetivo

Definir uma proposta revisável para isolamento multi-tenant do Vide Hub. Este plano não altera produção e não substitui testes reais de rules.

## Estado atual

O frontend ainda escreve diretamente em operações que, no modelo final, devem ir para backend:

- `dashboard-app.js` cria/edita/desativa `funcionarios`.
- `admin.html` altera `usuarios.status`, `usuarios.plano` e `usuarios.featuresManuais`.
- `loja.html` e `lp-forms-v5.js` criam leads públicos, métricas e chat.
- uploads principais ainda usam base64 no Firestore.

Portanto, `firebase/firestore.rules.proposed` é intencionalmente restritivo e não é compatível com publicação imediata sem a migração descrita em `docs/FIREBASE_SECURITY_MIGRATION_PLAN.md`.

## Identidade esperada

- `authUid`: usuário autenticado no Firebase Auth.
- `ownerUid`: dono real da loja.
- `storeUid/effectiveUid`: tenant operacional no frontend.
- Funcionário: documento `funcionarios/{authUid}` ativo com `donoUID` e permissões válidas.
- Admin backend: custom claim `videAdmin: true`, emitida por Cloud Functions/Admin SDK.
- `equipe_admin`: fonte administrativa para UX e sincronização futura de claims, não autorização final em rules.

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

1. Owner lê/escreve apenas documentos do próprio tenant.
2. Owner não pode alterar o próprio `status`, `plano`, `featuresManuais`, `role`, campos admin ou tenant.
3. Cadastro inicial de `usuarios/{uid}` deve aceitar somente campos reais de `login.html` e forçar `status: "pendente"`.
4. Funcionário ativo lê/escreve somente módulos permitidos no tenant do `donoUID`.
5. Permissões de funcionário precisam validar shape antes de acessar `permissoes.ver`/`permissoes.editar`.
6. Admin precisa de claim backend; frontend/equipe_admin não concede privilégio em rules.
7. Documentos públicos com `donoUID` não podem trocar tenant em update.
8. Writes públicos diretos de leads, métricas e chat ficam bloqueados até Cloud Functions/App Check/rate limit.
9. `masterUID` é apenas parâmetro de frontend; rules devem validar admin real.

## Campos críticos

| Coleção | Campo de tenant | Regra |
|---|---|---|
| `usuarios` | doc id | owner só altera perfil/loja; admin/backend altera plano/status. |
| `funcionarios` | `donoUID` | writes finais via Cloud Functions. |
| `produtos` | `criadoPor` | update deve preservar `criadoPor`. |
| `pedidos` | `criadoPor` | update deve preservar `criadoPor`. |
| `leads` | `criadoPor` | create público direto bloqueado. |
| `templates` | `criadoPor` | update deve preservar `criadoPor`. |
| `vitrines_publicas` | `donoUID` | update valida `resource.data.donoUID` e preserva dono. |
| `banners_loja` | `donoUID` | update valida `resource.data.donoUID` e preserva dono. |
| `landing_pages*` | `donoUID` / `lpId` | públicas dependem de documento publicado e não podem trocar dono. |
| `notificacoes` | `destinatarios`, `uid`, `lidoPor` | marcação de leitura precisa de modelo mais seguro. |
| `config` | doc id | admin backend only. |
| `equipe_admin` | email/uid | gerenciado por admin backend; não é claim por si só. |

## Dependências antes de produção

- Cloud Functions para operações sensíveis.
- Custom claims sincronizadas por backend.
- Emulator Suite com testes automatizados.
- Migração do frontend para Functions.
- Staging isolado.
- App Check e rate limit para endpoints públicos.
- Índices descritos em `docs/FIREBASE_INDEXES_PLAN.md`.

## Não pronto para produção até

- todos os P0/P1 de rules passarem no Emulator;
- owner/employee/admin/público serem testados;
- writes públicos deixarem de depender de tenant livre vindo do cliente;
- criação/edição de funcionário sair do frontend;
- admin.html deixar de depender de writes diretos para plano/status.
