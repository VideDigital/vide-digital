# Handoff — Vide Digital (Vide Hub), sessão de 2026-07-22

Resumo objetivo pra contextualizar outra IA (ChatGPT ou outro Claude/Codex)
sem precisar reler o histórico inteiro do repositório.

## O que é este projeto

`VideDigital/vide-digital` — SaaS multi-tenant "Vide Hub" em Firebase
(Firestore + Storage + Auth, plano **Blaze**, mas **zero Cloud Functions
vivas** por decisão de arquitetura: escrita direta do cliente protegida por
Firestore Rules). Ver `docs/FIREBASE_SPARK_ARCHITECTURE.md` pro contrato
completo dessa decisão.

Documento-mestre do projeto: **`docs/ROADMAP_RD3_STATUS.md`** — sempre ler
esse arquivo primeiro. Ele tem três seções (CONCLUÍDO / PARCIAL / NÃO
INICIADO) e uma lista de "Próximas prioridades reais" no fim, que é
literalmente a lista de próximos passos sugeridos.

## Estado atual (fim desta sessão)

Tudo commitado e empurrado para `main` (branch de produção real deste
projeto — os agentes deste projeto trabalham direto em `main`, não em PRs).
GitHub Pages faz deploy automático do frontend a cada push em `main`
(workflow `pages-build-deployment`). As Firestore Rules só vão pra produção
via um segundo workflow, manual: **"Deploy Firebase Spark"**
(`.github/workflows/firebase-deploy.yml`), que exige dois inputs exatos
(`project_id: vide-digital-saas`, `confirm_production: DEPLOY`) — já está
configurado com o secret `FIREBASE_SERVICE_ACCOUNT` e funcionando (últimos
deploys confirmados com sucesso).

Nesta sessão, **6 entregas reais** foram concluídas, testadas (suíte de
Rules no emulador, testes unitários, Playwright, smoke com emulador) e
deployadas:

1. **CRM 360 — navegação própria**: entrada de menu dedicada
   ("CRM 360 do Cliente", `#view-crm360`) com lista de todos os clientes do
   tenant, busca/filtro/ordenação. Corrigiu de quebra um **bug real de
   permissão**: `core/vide-context.js` tratava `"crm"` como alias de
   `"leads"` no frontend, enquanto `firestore.rules` sempre tratou `"crm"`
   como permissão própria — funcionário só com "leads" parecia ter acesso
   ao CRM 360 na tela (Rules bloqueavam certo, mas a UI mentia). Corrigido
   extraindo a tabela de aliases pra `core/vide-module-aliases.js` (módulo
   puro, sem import de Firebase — existiam DUAS cópias manuais da mesma
   tabela que já tinham divergido).
2. **Notificação "conversa atribuída a você"**: tentativa original usava
   `collectionGroup("eventos")` + índice composto novo. **Testado de
   verdade contra o emulador e revertido** — as Rules de
   `chats/{id}/eventos` usam `get()` no documento pai, e um `list` via
   collectionGroup precisa provar a regra pro grupo de coleção inteiro; a
   tentativa esbarrou primeiro no catch-all de Rules, depois (reescrita no
   formato `{path=**}`, a forma "correta" documentada) no **teto de 1000
   expressões** das Firestore Rules. Entregue sem índice novo, reaproveitando
   campos que já existiam no chat (`atribuidoPara`/`atribuidoPor`/
   `atribuidoEm`). Decisão documentada em
   `docs/HISTORICO_EVENTOS_ATENDIMENTO.md` (Fase 19) — **importante pra
   quem for mexer em `collectionGroup` neste repo de novo**.
3. **Produtos por referência na IA**: a Base de Conhecimento (tipo
   "produto") agora referencia produtos reais do catálogo por ID
   (`produtoIds`), sem copiar cadastro — o texto que a IA vai ler é
   remontado do catálogo atual a cada salvamento.
4. **Onboarding ampliado**: checklist "primeiros passos" foi de 4 pra 8
   etapas, todas derivadas de dado real (nunca de um clique que só marca
   como "visto"): loja, produto, LP criada, LP publicada, 1ª conversa no
   Atendimento, IA ativa, 1ª FAQ, 1º funcionário.
5. **Bug real encontrado e corrigido**: conversas de alto volume (100+
   mensagens) na Central de Atendimento faziam a **página inteira** crescer
   sem limite em vez da coluna de mensagens rolar internamente — CSS
   (`.atend-layout`) só tinha `min-height`, nunca um `height` de fato
   limitado. Achado via Playwright (150 mensagens sintéticas injetadas na
   estrutura DOM real, mobile 375×667 e desktop 1440×900:
   `scrollHeight` da página passava de 10.000px). Corrigido e reconfirmado
   com o mesmo teste.
6. **Decisão registrada, sem código**: métricas do Atendimento
   (`calcularMetricasAtendimento`) continuam calculadas em runtime — já
   rodam só sobre os 50 eventos paginados por conversa (nunca o histórico
   bruto), custo desprezível; migrar pra Cloud Function não traria ganho
   real na escala atual.

## Lições/armadilhas específicas deste repo (vale saber antes de mexer)

- **`collectionGroup` + Rules com `get()`/`exists()` + catch-all
  `match /{document=**} { allow read, write: if false; }`**: não funciona
  neste ruleset sem estourar o teto de 1000 expressões. Se precisar de
  verdade, a Fase 19 do `docs/HISTORICO_EVENTOS_ATENDIMENTO.md` sugere
  achatar um campo no documento pai em vez de tentar de novo com
  `collectionGroup`.
- **CSS de layout com `min-height` sem `height`**: em qualquer grid/flex
  aninhado com `overflow-y: auto` num filho, `min-height` sozinho NÃO
  limita o container — o filho scrollável só funciona se o ancestral tiver
  altura de fato definida (`height`, não `min-height`). Vale checar outras
  telas do dashboard com o mesmo padrão se aparecer bug parecido.
- **"Teto de 1000 expressões" das Firestore Rules** é uma restrição real
  já mencionada em `docs/SECURITY_MODEL.md` — várias decisões de validação
  rasa (client valida fundo, Rules só valida forma/tamanho de listas) vêm
  disso, ex.: `pedidos.itens`, `base_conhecimento_ia.produtoIds`.
- **Padrão de módulo**: cada feature grande vira um arquivo próprio
  (`crm360.js`, `atendimento.js`, `templates-atendimento.js`,
  `pedidos-estruturados.js`, `base-conhecimento-ia.js`) exportando funções
  puras testáveis + um `criarXController(deps)` que recebe `db`/`context`/
  `firestore`/`notify` por injeção (nunca importa Firebase direto, EXCETO
  `core/vide-context.js`, que importa do CDN do gstatic e por isso não pode
  ser testado com `node --test` diretamente — testes usam
  `core/vide-module-aliases.js`, a parte pura extraída dele).
- Cada módulo tem checklist: pure functions testadas (`tests/*.test.mjs`),
  Rules testadas (`tests/emulator/firestore-security.test.mjs`), doc próprio
  em `docs/`, entrada no `ROADMAP_RD3_STATUS.md`.

## Como rodar tudo localmente

```bash
pnpm run check        # node --check em todos os arquivos-fonte + testes
pnpm run test:rules   # suíte de segurança no emulador (154 testes hoje)
pnpm run test:frontend:emulator  # smoke com emulador real (auth+firestore+functions)
pnpm run test:all      # tudo junto (demora mais)
```

## Não bloqueado, mas fica registrado pro próximo ciclo

Ver a seção "Próximas prioridades reais" no fim de
`docs/ROADMAP_RD3_STATUS.md` — resumo: confirmar `pnpm run test:ui:*`
rodando de ponta a ponta num ambiente com acesso a `www.gstatic.com`
(ver próxima seção); reavaliar `collectionGroup` só se um campo achatado
não resolver; busca server-side no catálogo de produtos se algum tenant
passar de ~300 produtos ativos.

## Addendum — Quality Gate (ciclo seguinte a este handoff)

Depois deste handoff, um ciclo de "Gate de Qualidade, QA autenticado e
preparação de release" foi executado. Resumo essencial pra quem continuar:

- **Documentação Spark/Blaze corrigida**: `docs/FIREBASE_SPARK_ARCHITECTURE.md`
  dizia "não migra para Blaze", contradizendo a realidade (e este próprio
  handoff). Corrigido — o nome do arquivo ficou (é referenciado em outros
  lugares), o conteúdo agora reflete Blaze de verdade, com a razão real
  (Storage em produção passou a exigir faturamento) e deixa claro que
  Blaze **não** significa usar Functions pra tudo.
- **Testes de UI com login real tornados 100% portáteis**: `playwright` virou
  devDependency real do projeto (antes dependia de um Chromium global em
  `/opt`); o servidor estático que serve o app pros testes agora é Node
  puro (`node:http`), não Python; a porta é escolhida automaticamente.
  Estrutura nova em `tests/emulator/ui/` (login, 3 perfis, fluxos
  profundos de Pedidos/Atendimento/Templates/CRM/Base de
  Conhecimento/Central de IA, responsividade em 5 viewports).
- **Achado crítico**: o sandbox onde isso foi escrito bloqueia por
  política de rede o host `www.gstatic.com` (confirmado via
  `curl -x $HTTPS_PROXY https://www.gstatic.com` → `403` de política, não
  timeout). Como o app carrega o SDK do Firebase direto desse CDN, a
  suíte de UI **não pôde ser validada rodando de verdade** nesse sandbox
  — o harness em si (servidor, Playwright, Emulators, seed) foi
  confirmado funcionando até esse ponto exato. **Antes de confiar nesses
  testes, rode `pnpm run test:ui:login` num ambiente que alcance
  `www.gstatic.com`** (qualquer runner GitHub Actions padrão) e corrija o
  que não bater. Detalhe completo em `docs/QUALITY_GATE_RELEASE.md`.
- **Workflow novo**: `.github/workflows/quality-gate.yml` — nunca faz
  deploy, só valida (check, unit, Rules, frontend:emulator, UI real). O
  deploy continua manual e separado em `firebase-deploy.yml`.
- `scripts/seed-emulator.mjs` evoluído: `employee-edit`/`employee-read`
  agora têm permissão em atendimento/crm/pedidos/base-conhecimento-ia
  (antes só produtos/leads), e há dados de apoio pros fluxos profundos
  (cliente, chat com mensagem+evento, template, 2 itens de base de
  conhecimento, config de IA, pedido com itens estruturados).
