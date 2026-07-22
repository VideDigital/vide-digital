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
| Templates de atendimento | Reaproveita o módulo "Templates" legado; inserção na resposta com variáveis seguras já funciona | Categorias dedicadas (saudação/orçamento/pagamento/prazo/entrega/indisponibilidade/suporte/encerramento/personalizada) e ações de duplicar/arquivar no contexto de atendimento |
| CRM 360 — vínculo automático de pedidos | `pedidos.cliente`/`pedidos.produtos` continuam texto livre; vínculo ao cliente é sempre manual (busca por nome) | Estruturar `pedidos.itens`/`produtoId` pra permitir correspondência e "produtos mais comprados" precisos |
| CRM 360 — navegação própria | Só é alcançável de dentro de uma conversa da Central de Atendimento | Entrada de menu dedicada, destravando a permissão `crm` isolada de `atendimento` |
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

1. **Deploy das Rules deste ciclo**: as Rules de `chats`/`mensagens`/`templates`/`clientes`/`tags_clientes` reforçadas nos últimos dois ciclos (Atendimento + CRM 360) só valem depois de o workflow de deploy publicar `firestore.rules` em produção — até lá, produção continua na versão anterior.
2. **Claim videAdmin**: precisa ser concedida uma vez via `scripts/set-admin-claim.mjs` (Admin SDK local) para o painel master operar em produção, caso ainda não tenha sido.
3. **IA real / WhatsApp oficial**: dependem de segredo de provedor externo — nenhuma chave foi ou deve ser colocada no frontend; ficam para quando uma Cloud Function for realmente necessária.

## Próximas três prioridades reais

1. Estruturar `pedidos.itens`/`produtoId` pra permitir vínculo automático e "produtos mais comprados" precisos no CRM 360 (hoje é tudo texto livre).
2. Entrada de navegação própria para o CRM 360 (hoje só alcançável de dentro de uma conversa do Atendimento).
3. Categorias e ações dedicadas (duplicar/arquivar) para templates de atendimento, sem quebrar os templates de automação de leads que já usam a mesma coleção.
