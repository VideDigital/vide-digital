# Firebase Security Audit

## Arquivos de regras

Não foram encontrados no repositório:

- `firestore.rules`
- `storage.rules`
- `firebase.json`
- `.firebaserc`

Portanto, esta fase não publica nem altera regras. As recomendações abaixo precisam ser confirmadas no Firebase Console antes de qualquer deploy.

## Coleções identificadas

- `usuarios`
- `funcionarios`
- `equipe_admin`
- `produtos`
- `pedidos`
- `leads`
- `templates_leads`
- `campanhas`
- `campanhas_historico`
- `landing_pages`
- `landing_pages_blocos`
- `landing_pages_publicas`
- `landing_pages_blocos_publicas`
- `vitrines_publicas`
- `banners_loja`
- `notificacoes`
- `solicitacoes_customizacao`
- `config`

## Campos de tenant observados

- `usuarios/{uid}` como dono da loja.
- `funcionarios/{uid}.donoUID`.
- `criadoPor` em produtos, pedidos, leads, templates e históricos.
- `donoUID` em landing pages/blocos e funcionários.
- `uid` em algumas solicitações.

## Riscos

- Se regras Firestore permitirem leitura/escrita apenas por autenticação genérica, um usuário poderia consultar dados de outro tenant.
- Funcionários precisam ser autorizados por `funcionarios/{auth.uid}.donoUID`, não pelo próprio UID.
- `localStorage` não pode liberar features.
- Modo Master não pode existir como permissão de cliente comum.

## Regras mínimas recomendadas

As regras finais devem validar:

- proprietário acessa dados onde `ownerUid == request.auth.uid`, `donoUID == request.auth.uid` ou `criadoPor == request.auth.uid`;
- funcionário acessa dados do `donoUID` vinculado ao seu documento ativo;
- administrador usa regras próprias e auditáveis;
- coleções públicas leem apenas documentos publicados;
- escritas públicas são bloqueadas;
- plano e permissões de escrita não são decididos por campos enviados pelo cliente.

## Pontos a confirmar no Firebase Console

- Regras atuais do Firestore.
- Regras atuais do Storage.
- Índices exigidos pelas queries existentes.
- Se contas de funcionários inativos continuam habilitadas no Firebase Authentication.

## Plano para Cloud Functions

1. Criar funcionário via função administrativa.
2. Desativar funcionário também no Firebase Authentication.
3. Registrar auditoria de criação, desativação e alteração de permissões.
4. Validar permissões de escrita no backend.
5. Criar endpoint/controlador para modo Master administrativo.

## Atualização de guards frontend do PR #5

As correções do PR #5 adicionam guards de frontend no ponto de escrita para reduzir mutações indevidas pela interface ou console. Isso cobre os principais writes em `produtos`, `pedidos`, `leads`, `templates`, `campanhas`, `usuarios`, `vitrines_publicas`, `banners_loja`, `landing_pages`, coleções públicas de Landing Pages, `funcionarios` e `solicitacoes_customizacao`.

Esses guards não alteram contratos Firebase, coleções, campos, slugs ou URLs públicas. Eles também não substituem regras autoritativas: qualquer regra final precisa validar `auth.uid`, `donoUID`, `criadoPor`, estado de funcionário ativo, arrays de permissão e contexto administrativo real.

`notificacoes.lidoPor` foi mantido como exceção de preferência do usuário autenticado: grava o `authUid` do leitor e só permite alterar notificações visíveis ao tenant efetivo.
