# Write Permission Audit — PR #5

Este relatório lista as escritas operacionais revisadas na correção do PR #5. Os guards de frontend reduzem risco de uso indevido pela interface ou console, mas não substituem Firestore Rules, Storage Rules nem Cloud Functions para validação autoritativa.

## Módulos e aliases

O módulo canônico de Landing Pages/Studio é `landing-pages`. Os aliases compatíveis normalizados pelo contexto incluem `landing_pages`, `landingPages`, `paginas`, `landing`, `lp` e `studio`.

`configuracoes` continua exclusivo para perfil, aparência, loja pública e personalização da loja. Ter edição em `configuracoes` não concede edição automática no Studio.

## Escritas protegidas

| Módulo | Ação | Arquivo / função | Coleção | Guard |
|---|---|---|---|---|
| funcionários | criar/editar funcionário | `dashboard-app.js` / `salvarFuncionario` | `funcionarios` | `exigirEdicaoModulo("funcionarios")` |
| funcionários | ativar/desativar funcionário | `dashboard-app.js` / `alternarStatusFuncionario` | `funcionarios` | `exigirEdicaoModulo("funcionarios")` |
| layout | salvar layout da aba ativa | `dashboard-app.js` / `salvarLayoutDaAbaAtual`, `restaurarLayoutPadraoDaAbaAtual` | `usuarios` | módulo da aba ativa |
| landing-pages | salvar editor Studio | `dashboard-app.js` / `salvarEditorLP` | `landing_pages`, `landing_pages_blocos`, públicas | `exigirEdicaoModulo("landing-pages")` |
| landing-pages | publicar/despublicar | `dashboard-app.js` / `publicarEditorLP`, `alternarPublicacaoLP` | `landing_pages`, públicas | `exigirEdicaoModulo("landing-pages")` |
| landing-pages | criar/editar LP | `dashboard-app.js` / `salvarLP` | `landing_pages`, `landing_pages_blocos` | `exigirEdicaoModulo("landing-pages")` |
| landing-pages | duplicar LP | `dashboard-app.js` / `duplicarLP` | `landing_pages`, `landing_pages_blocos` | `exigirEdicaoModulo("landing-pages")` |
| landing-pages | excluir LP | `dashboard-app.js` / `excluirLP` | `landing_pages`, `landing_pages_blocos`, públicas | guard antes da confirmação e antes da escrita |
| configurações | salvar perfil/loja pública | `dashboard-app.js` / `executarSalvamento` | `usuarios`, `vitrines_publicas`, `banners_loja` | `exigirEdicaoModulo("configuracoes")` |
| leads | salvar anotação | `dashboard-app.js` / `salvarAnotacaoLead` | `leads` | `exigirEdicaoModulo("leads")` |
| leads | salvar campo de contato/interesse | `dashboard-app.js` / `salvarCampoLead` | `leads` | `exigirEdicaoModulo("leads")` |
| leads | salvar/limpar/concluir follow-up | `dashboard-app.js` / `salvarFollowupLead`, `limparFollowupLead`, `concluirFollowupLead` | `leads` | `exigirEdicaoModulo("leads")` |
| leads | histórico de atividade | `dashboard-app.js` / `registrarAtividadeLead` | `leads` | `exigirEdicaoModulo("leads")` |
| leads | fluxo de template no lead | `dashboard-app.js` / `executarFluxoTemplateNoLead` | `leads` | `exigirEdicaoModulo("leads")` |
| leads | ações em massa | `dashboard-app.js` / ações da automação | `leads` | guard antes e, quando destrutivo, dentro da confirmação |
| produtos | criar/editar produto | `dashboard-app.js` / submit do formulário | `produtos` | `exigirEdicaoModulo("produtos")` |
| produtos | publicar/rascunho/excluir em massa | `dashboard-app.js` / `executarAcaoMassaCatalogo` | `produtos` | guard antes e antes da escrita |
| produtos | excluir produto individual | `dashboard-app.js` / botão excluir produto | `produtos` | guard antes da confirmação e antes da escrita |
| campanhas | salvar campanha | `dashboard-app.js` / `salvarCampanha` | `campanhas`, `campanhas_historico` | `exigirEdicaoModulo("campanhas")` |
| templates | salvar/excluir template | `dashboard-app.js` / `salvarTemplate`, `excluirTemplate` | `templates` | `exigirEdicaoModulo("templates")` |
| pedidos | criar pedido | `dashboard-app.js` / `salvarPedido` | `pedidos` | `exigirEdicaoModulo("pedidos")` |
| pedidos | mover status | `dashboard-app.js` / `moverPedidoFluxo`, `atualizarStatusPedido` | `pedidos` | `exigirEdicaoModulo("pedidos")` |
| pedidos | excluir pedido | `dashboard-app.js` / `excluirPedido` | `pedidos` | guard antes da confirmação e antes da escrita |
| personalização | solicitar customização | `dashboard-app.js` / `enviarSolicitacaoPersonalizacao` | `solicitacoes_customizacao` | `exigirEdicaoModulo("configuracoes")` |

## Exceções justificadas

| Escrita | Motivo |
|---|---|
| `login.html` / criação de `usuarios` em cadastro novo | Fluxo de autenticação/cadastro, não é ação de loja existente. O cadastro Google agora só cria proprietário quando o resolvedor central retorna identidade inexistente segura. |
| `login.html` / recuperação de senha | Preferência/fluxo de autenticação Firebase. |
| `dashboard-app.js` / `marcarNotificacaoLida` | Preferência do usuário autenticado. Usa `authUid` como leitor e só grava notificação que o tenant efetivo pode visualizar. |
| `admin.html` | Superfície administrativa própria. Deve ser protegida por validação administrativa e regras backend; não usa `exigirEdicaoModulo` de loja. |

## Dashboard/cockpit

O cockpit geral pode permanecer visível para funcionário ativo. Métricas e consultas de `pedidos` e `leads` no Dashboard foram condicionadas a `canView("pedidos")` e `canView("leads")`; quando o funcionário não tem permissão, os valores sensíveis são mascarados e a consulta correspondente não é executada.

## Limitações restantes

- Firestore Rules e Storage Rules ainda precisam impor os mesmos contratos no backend.
- Criação/desativação segura de funcionários deve migrar para Cloud Functions antes de escala real.
- `masterUID` continua dependendo de regras backend que impeçam leitura/escrita cross-tenant indevida.
- O harness local simula permissões e aliases; ele não substitui teste autenticado com usuários reais ou em emulador Firebase.
