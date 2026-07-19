# Firebase Indexes Plan — Vide Hub V1

## Objetivo

Separar índices necessários hoje, baseados em queries reais do código, de índices futuros para otimização.

## Índices necessários agora

| Coleção | Campos | Ordem | Query real | Arquivo/linha | Observação |
|---|---|---|---|---|---|
| `landing_pages` | `donoUID`, `pagina` | asc, asc | `where("donoUID", "==", usuarioUID)` + `where("pagina", "==", slug)` | `dashboard-app.js:5383`, `5474`; `lp-public-v4.js:1843-1846` | Composto necessário. |
| `funcionarios` | `donoUID` | asc | funcionários por loja | `dashboard-app.js:696-698`, `15150` | Índice simples automático/console. |
| `produtos` | `criadoPor` | asc | produtos por loja | `dashboard-app.js:5018`, `10013-10015`; `loja.html:625` | Índice simples. |
| `pedidos` | `criadoPor` | asc | pedidos por loja | `dashboard-app.js:13910`, `15692` | Índice simples. |
| `leads` | `criadoPor` | asc | leads por loja | `dashboard-app.js:6298`, `15139`, `15691` | Índice simples. |
| `templates` | `criadoPor` | asc | templates por loja | `dashboard-app.js:7286-7288`, `13127-13129` | Índice simples. |
| `banners_loja` | `donoUID` | asc | banners por loja | `dashboard-app.js:5989`, `6263`; `loja.html:556` | Índice simples. |
| `solicitacoes_customizacao` | `uid` | asc | solicitações do usuário | `dashboard-app.js:14815-14817` | Índice simples. |
| `campanhas_historico` | `criadoPor` | asc | histórico por loja | `dashboard-app.js:13072` | Índice simples. |
| `chats` | `clienteNome` | asc | chat por nome do lead | `dashboard-app.js:7151` | Modelo futuro deve incluir tenant. |
| `chats/{chatId}/mensagens` | `timestamp` | asc | mensagens ordenadas | `loja.html:1056` | Índice simples automático. |
| `landing_pages_blocos` | `lpId` | asc | blocos por LP | `lp-public-v4.js:1783-1785`, `1861-1863` | Índice simples. |

## Índices futuros

| Coleção | Campos | Motivo |
|---|---|---|
| `pedidos` | `criadoPor`, `data`, `status` | mover filtros de data/status do cliente para query. |
| `leads` | `criadoPor`, `data`, `statusLead`, `origem` | funil e relatórios com filtros combinados. |
| `templates` | `criadoPor`, `categoria` | catálogo de templates por categoria. |
| `banners_loja` | `donoUID`, `ordem` | somente se o frontend passar a usar `orderBy("ordem")`. |
| `chats` | `donoUID`, `clienteNome` | corrigir isolamento de tenant no chat. |
| `metricas_*` | tenant + período | relatórios backend por período. |

## Regras

- Não criar índice composto como “atual” quando a query usa apenas `where` simples.
- Validar índices no console/emulador depois de executar os fluxos reais.
- Documentar qualquer link de criação automática gerado pelo Firestore.
