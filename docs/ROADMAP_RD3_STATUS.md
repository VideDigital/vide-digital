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

| Entrega | Estado | Próximo passo |
|---|---|---|
| CRM 360 — navegação própria | Só é alcançável de dentro de uma conversa da Central de Atendimento; a permissão `atendimento`/`crm` já pode ser concedida pela tela de acessos desde o ciclo "Templates Avançados" (achado de auditoria corrigido), mas ainda não existe entrada de menu própria | Entrada de menu dedicada pro CRM 360 |
| Produtos por referência para a IA | Tipo `produto`/`catalogo` manual na Base | Configuração incluir/excluir IDs sem copiar produtos |
| Onboarding (checklist "primeiros passos") | Existe versão do ciclo anterior no dashboard (4 etapas derivadas de dados reais) | Ampliar critérios (atendimento, IA, FAQ, funcionário) mantendo conclusão derivada de dados, nunca de clique |

## NÃO INICIADO

| Entrega | Observação |
|---|---|
| Anonymous Auth no chat público | Hoje a capability é o id aleatório do chat. Ativar Firebase Anonymous Auth é etapa EXTERNA (console); depois, vincular `visitorUid` ao `request.auth.uid` nas regras |
| Cloudflare Worker (IA real) | Contrato documentado em `docs/FIREBASE_SPARK_ARCHITECTURE.md`; nenhum provedor chamado |
| WhatsApp oficial | Depende do backend externo |
| Auditoria centralizada pós-Functions | `writeAudit` deixou de existir nas operações migradas |

## Bloqueios externos (fora do repositório)

1. **Deploy das Rules deste ciclo**: as Rules de `chats`/`chats/eventos`/`mensagens`/`templates`/`pedidos`/`clientes`/`tags_clientes` reforçadas nos últimos ciclos (Atendimento + CRM 360 + Histórico de Eventos + Templates Avançados + Pedidos Estruturados) só valem depois de o workflow de deploy publicar `firestore.rules` em produção. **Tentativa de publicação automática feita neste ciclo e ainda sem sucesso**: falta configurar em Settings → Secrets and variables → Actions do repositório GitHub UM dos dois métodos de autenticação do workflow "Deploy Firebase Spark" — `GCP_WORKLOAD_IDENTITY_PROVIDER` + `GCP_SERVICE_ACCOUNT`, ou `FIREBASE_SERVICE_ACCOUNT` (chave JSON da conta de serviço) — sem isso, o workflow falha de propósito (nunca finge sucesso) na etapa de autenticação. Até essa configuração externa acontecer, produção continua na versão anterior das Rules.
2. **Claim videAdmin**: precisa ser concedida uma vez via `scripts/set-admin-claim.mjs` (Admin SDK local) para o painel master operar em produção, caso ainda não tenha sido.
3. **IA real / WhatsApp oficial**: dependem de segredo de provedor externo — nenhuma chave foi ou deve ser colocada no frontend; ficam para quando uma Cloud Function for realmente necessária.

## Próximas três prioridades reais

1. Configurar a autenticação do workflow "Deploy Firebase Spark" (ver bloqueio externo #1 acima) — é o único passo que falta para as Rules dos últimos cinco ciclos valerem em produção.
2. Entrada de navegação própria para o CRM 360 (hoje só alcançável de dentro de uma conversa do Atendimento) — a permissão em si já pode ser concedida pela tela de acessos.
3. Índice composto em `chats/*/eventos` (`collectionGroup`, `tenantId`+`criadoEm`) pra notificações mais precisas por tipo de evento — já registrado em `docs/HISTORICO_EVENTOS_ATENDIMENTO.md`.
