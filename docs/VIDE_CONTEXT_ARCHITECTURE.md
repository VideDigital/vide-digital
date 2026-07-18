# Vide Hub Context Architecture

## Objetivo

Esta fase introduz `window.VideHubContext` como base central e compatível para autenticação, tenant, permissões, planos e modo Master.

O objetivo não é substituir todos os fluxos antigos de uma vez. O Dashboard ainda preserva variáveis globais como `usuarioUID` por compatibilidade, mas o contexto passa a manter identidades separadas.

## Identidades

- `authUid`: UID real autenticado no Firebase Authentication.
- `authEmail`: e-mail real autenticado.
- `ownerUid`: UID do proprietário da loja.
- `effectiveUid`: UID usado temporariamente pelos fluxos legados para consultar dados da loja.
- `storeUid`: UID canônico da loja/tenant.
- `targetUid`: UID alvo quando o modo Master está ativo.

## Tipos de usuário

- `guest`: sem sessão válida.
- `owner`: documento em `usuarios/{authUid}` com `status: "aprovado"`.
- `employee`: documento em `funcionarios/{authUid}`, `status: "ativo"` e `donoUID` válido apontando para proprietário aprovado.
- `admin`: super admin ou membro de `equipe_admin`.

## Funcionário

Funcionário mantém:

- `authUid` como UID do funcionário;
- `ownerUid/effectiveUid/storeUid` como `funcionarios/{authUid}.donoUID`;
- `employee` com os dados do documento `funcionarios/{authUid}`;
- permissões interpretadas a partir de `permissoes.ver` e `permissoes.editar`.

`editar` implica `ver`.

## Modo Master

O parâmetro `masterUID` continua existindo.

Somente administrador principal ou membro de `equipe_admin` pode ativar modo Master. O contexto valida:

- usuário autenticado;
- permissão administrativa;
- existência de `usuarios/{masterUID}`;
- status aprovado da loja alvo.

Funcionários não podem usar `masterUID`.

## Permissões

API pública:

- `VideHubContext.canView(moduleKey)`
- `VideHubContext.canEdit(moduleKey)`

Módulos reais mapeados nesta fase:

- `produtos`
- `pedidos`
- `leads`
- `templates`
- `campanhas`
- `metricas`
- `configuracoes`

Proprietários e administradores têm acesso amplo no frontend, respeitando plano e regras existentes. Funcionários dependem dos arrays em `funcionarios/{uid}.permissoes`.

## Planos

`window.VidePlanService` centraliza o plano real depois que o Firestore carrega:

- `setPlan(plan, features, limits)`
- `getPlan()`
- `hasFeature(key)`
- `getLimits()`
- `getSnapshot()`

`plan-preflight.js` permanece apenas como otimização visual de carregamento. `localStorage` não concede funcionalidade.

## Evento

Ao inicializar, o contexto dispara:

```text
videhub:context-ready
```

O detalhe do evento contém snapshot imutável do estado.

## Compatibilidade com legado

Durante a migração:

- `usuarioUID` continua recebendo `effectiveUid`;
- `usuarioEmail` continua recebendo `authEmail`;
- consultas existentes continuam usando os contratos atuais;
- o novo contexto mantém `authUid` separado para auditoria futura.

## Migração futura

Próximas etapas recomendadas:

1. Migrar criação/desativação de funcionários para Cloud Functions.
2. Remover dependência de `usuarioUID` global nas escritas.
3. Adicionar auditoria com `authUid`, `ownerUid` e ação executada.
4. Publicar regras Firestore/Storage compatíveis após validação no Firebase Console.
5. Substituir validações de frontend por validações de backend para operações sensíveis.
