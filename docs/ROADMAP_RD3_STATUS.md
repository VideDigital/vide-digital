# Status do RD3

Atualizado no ciclo que terminou no merge deste documento. Legenda: CONCLUÍDO · PARCIAL · NÃO INICIADO.

> **Plano Firebase**: o projeto migrou de Spark para **Blaze** neste ciclo. Isso não muda a arquitetura:
> a maior parte da escrita continua direta do cliente, protegida pelas Rules. Cloud Functions ficam
> reservadas para quando existir segredo, integração externa (IA/WhatsApp), operação administrativa
> privilegiada, rate limit confiável ou processamento assíncrono real — nada disso foi introduzido
> neste ciclo. Ver `docs/CENTRAL_ATENDIMENTO.md` e `docs/FIREBASE_SPARK_ARCHITECTURE.md`.

## CONCLUÍDO

| Entrega | Onde |
|---|---|
| CRM 360 do cliente (identidade canônica, hub `clientes/{id}`, resumo comercial, leads/pedidos/conversas relacionados, produtos de interesse, observações, tags, timeline, notificações) | `docs/CRM_360_CLIENTE.md`, `crm360.js`, `firestore.rules` |
| Central de Atendimento nativa completa (3 colunas + mobile em etapas, status, atribuição, templates, notificações, painel do cliente) | `docs/CENTRAL_ATENDIMENTO.md`, `atendimento.js`, `atendimento.css`, `firestore.rules` |
| Histórico de eventos do atendimento (`chats/{id}/eventos` append-only, escrita atômica, timeline visual mesclada, métricas derivadas, espelho no CRM 360) | `docs/HISTORICO_EVENTOS_ATENDIMENTO.md`, `atendimento.js`, `crm360.js`, `loja.html`, `firestore.rules` |
| Templates Avançados de Atendimento (categorias fechadas, 8 variáveis com pendência/confirmação, gestão completa, atalhos, favoritos, uso atômico com integridade real via Rules) | `docs/TEMPLATES_ATENDIMENTO_AVANCADOS.md`, `templates-atendimento.js`, `atendimento.js`, `firestore.rules` |
| Pedidos Estruturados e Vinculados ao Atendimento (`pedidos.itens`/`produtoId`, seleção de produtos do catálogo no modal, "produtos mais comprados" e "produto de interesse → pedido real" precisos no CRM 360, `{{prazo_entrega}}` resolvendo de verdade, Rules validando `pedidos` pela primeira vez) | `docs/PEDIDOS_ESTRUTURADOS.md`, `pedidos-estruturados.js`, `dashboard-app.js`, `crm360.js`, `firestore.rules` |
| CRM 360 — navegação própria (entrada de menu e Hub dedicadas, lista de todos os clientes do tenant com busca/filtro/ordenação, permissão `crm` isolada de `leads` também no client — corrige achado de auditoria) | `docs/CRM_360_CLIENTE.md`, `crm360.js`, `dashboard.html`, `dashboard-app.js`, `core/vide-module-aliases.js` |
| Notificação "conversa atribuída a você" (aviso real de atribuição/transferência, sem índice novo nem risco de Rules — ver decisão em `docs/HISTORICO_EVENTOS_ATENDIMENTO.md`, Fase 19) | `dashboard-app.js` |
| Produtos por referência para a IA (tipo `produto` referencia produtos reais do catálogo por ID, `conteudo` remontado do catálogo atual ao salvar, nada duplicado permanentemente) | `docs/RD3_BASE_CONHECIMENTO_IA.md`, `base-conhecimento-ia.js`, `dashboard.html`, `firestore.rules` |
| Onboarding ampliado (8 passos, todos derivados de dado real, nunca de clique: loja, produto, LP criada, LP publicada, 1ª conversa no Atendimento, IA ativa, 1ª FAQ na Base, 1º funcionário) | `dashboard-app.js` (`renderizarPrimeirosPassos`) |
| Migração definitiva para Spark, depois para Blaze sem reintroduzir Functions (zero dependência viva) | `docs/FIREBASE_SPARK_ARCHITECTURE.md` |
| Correção do bug real: formulários das LPs V4 chamavam Function inexistente (todo envio falhava) | `lp-public-v4.js` |
| Gestão de funcionários sem Functions (app secundário + regras dono-only) | `dashboard-app.js`, `firestore.rules` |
| Painel master (status/plano) por escrita direta com claim videAdmin + script de bootstrap | `admin.html`, `scripts/set-admin-claim.mjs` |
| Workflow "Deploy Firebase Spark" (só rules+storage+indexes; WIF ou chave; falha clara sem auth) | `.github/workflows/firebase-deploy.yml` |
| Base de Conhecimento da IA completa (CRUD, filtros, prontidão, permissões, testes) | `docs/RD3_BASE_CONHECIMENTO_IA.md` |
| Jornada de 4 etapas na Central de IA (com resumo real da Base) | `dashboard.html`, `central-ia.css` |
| Dependência do modo de resposta automática da IA explicada na UI (nunca ativa sozinha) | `dashboard.html`, `central-ia.js` |
| Central de IA por loja (config da assistente) — ciclo anterior | `docs/CENTRAL_IA.md` |
| Central de Notificações com eventos reais + leitura segura — ciclo anterior | `docs/CENTRAL_NOTIFICACOES.md` |
| Chat da loja pública (widget) + resposta do dono/funcionário pelo painel — ciclo anterior | `loja.html`, `firestore.rules` (chats) |

## PARCIAL

Nenhum item nesta categoria no momento.

## NÃO INICIADO

| Entrega | Observação |
|---|---|
| Anonymous Auth no chat público | Hoje a capability é o id aleatório do chat. Ativar Firebase Anonymous Auth é etapa EXTERNA (console); depois, vincular `visitorUid` ao `request.auth.uid` nas regras |
| Cloudflare Worker (IA real) | Contrato documentado em `docs/FIREBASE_SPARK_ARCHITECTURE.md`; nenhum provedor chamado |
| WhatsApp oficial | Depende do backend externo |
| Auditoria centralizada pós-Functions | `writeAudit` deixou de existir nas operações migradas |

## Bloqueios externos (fora do repositório)

1. ~~**Deploy das Rules**~~ — **resolvido neste ciclo**: o secret `FIREBASE_SERVICE_ACCOUNT` foi configurado em Settings → Secrets and variables → Actions e o workflow "Deploy Firebase Spark" publicou `firestore.rules` em produção com sucesso. As Rules de `chats`/`chats/eventos`/`mensagens`/`templates`/`pedidos`/`clientes`/`tags_clientes` reforçadas nos últimos ciclos já valem em produção.
2. **Claim videAdmin**: precisa ser concedida uma vez via `scripts/set-admin-claim.mjs` (Admin SDK local) para o painel master operar em produção, caso ainda não tenha sido.
3. **IA real / WhatsApp oficial**: dependem de segredo de provedor externo — nenhuma chave foi ou deve ser colocada no frontend; ficam para quando uma Cloud Function for realmente necessária.

## Próximas prioridades reais

As três prioridades do ciclo anterior (deploy das Rules, navegação própria do CRM 360, índice/notificação de atribuição, produtos por referência na IA, onboarding ampliado) foram todas entregues. Candidatos para o próximo ciclo, nenhum bloqueante:

1. Avaliar, com volume real de uso, se `calcularMetricasAtendimento` precisa migrar para um agregado gravado por Cloud Function (trigger em `chats/*/eventos`) — hoje o cálculo em runtime é suficiente e mais confiável que um campo que pudesse divergir do histórico bruto.
2. Validar a experiência visual autenticada em conversas de alto volume, especialmente no mobile, agora que o carregamento anterior existe.
3. Produtos por referência (Base de Conhecimento) hoje resolve o catálogo do dono inteiro a cada abertura do formulário — considerar paginação/busca server-side se algum tenant tiver um catálogo muito grande.
