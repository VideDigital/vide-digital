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
| Métricas do Atendimento: avaliado, decisão de manter cálculo em runtime (roda só sobre os 50 eventos paginados por conversa — custo desprezível; migrar para Cloud Function não traria ganho real hoje) | `docs/HISTORICO_EVENTOS_ATENDIMENTO.md` (Fase 20) |
| **Bug real corrigido**: conversas de alto volume (100+ mensagens) faziam a página inteira crescer sem limite em vez da coluna de mensagens rolar internamente (`.atend-layout` só tinha `min-height`, nunca `height`) — achado e confirmado via Playwright (150 mensagens sintéticas, mobile e desktop), corrigido e revalidado | `docs/HISTORICO_EVENTOS_ATENDIMENTO.md` (Fase 21), `atendimento.css` |
| Teto de leitura no catálogo de produtos por referência da IA (`limit(300)`, mesmo padrão já usado em outras fontes do app) | `base-conhecimento-ia.js`, `dashboard-app.js` |
| Documentação Firebase alinhada à realidade (Blaze, não Spark puro) — corrige contradição real entre docs; Blaze explicado como requisito do Storage em produção, não decisão de usar Functions | `docs/FIREBASE_SPARK_ARCHITECTURE.md` |
| Quality Gate — infraestrutura de testes de UI portátil (Playwright como devDependency real, servidor HTTP em Node puro, sem `/opt` nem Python), 3 perfis seedados (owner/editor/reader), fluxos profundos escritos para Pedidos/Atendimento/Templates/CRM 360/Base de Conhecimento/Central de IA, responsividade em 5 viewports, workflow CI dedicado (nunca faz deploy) | `docs/QUALITY_GATE_RELEASE.md`, `tests/emulator/ui/*`, `scripts/seed-emulator.mjs`, `.github/workflows/quality-gate.yml` |
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
| Quality Gate — validação da suíte de UI com login real (`test:ui:login`, `test:ui:flows`, `test:ui:responsive`) | Código escrito e revisado linha por linha contra os seletores reais do app, sintaxe verificada (`pnpm run check`), harness confirmado funcionando (servidor Node + Playwright + Emulators + seed) até o exato ponto do bloqueio — **mas não passou de ponta a ponta nesta sessão**. Motivo confirmado, não suposto: o sandbox de desenvolvimento usado bloqueia por política de egress o host `www.gstatic.com` (`curl` via o proxy do ambiente retorna `403` de política, não timeout) — e o app carrega o SDK do Firebase direto desse CDN, então a tela de login nunca inicializa o listener do formulário nesse ambiente específico. Ver `docs/QUALITY_GATE_RELEASE.md`, seção "Limitações reais". | Rodar `pnpm run test:ui:login`/`test:ui:flows`/`test:ui:responsive` num ambiente que alcance `www.gstatic.com` (qualquer runner GitHub Actions padrão serve) e corrigir qualquer seletor que não bater com a realidade — depois trocar `continue-on-error: true` por `false` no job `ui-login` de `quality-gate.yml` |

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

1. **Confirmar a suíte `test:ui:*` rodando de verdade num ambiente com acesso a `www.gstatic.com`** (qualquer runner GitHub Actions padrão) — é o único item PARCIAL deste ciclo, com causa raiz já confirmada (ver seção PARCIAL acima e `docs/QUALITY_GATE_RELEASE.md`).
2. Se um dia `collectionGroup("eventos")` for realmente necessário (ver `docs/HISTORICO_EVENTOS_ATENDIMENTO.md`, Fase 19), vai precisar de um campo achatado no documento do chat em vez de uma regra nova de Rules.
3. Busca server-side no catálogo de produtos (Base de Conhecimento e Pedidos) se algum tenant um dia passar de ~300 produtos ativos — hoje nenhum plano chega perto disso.
