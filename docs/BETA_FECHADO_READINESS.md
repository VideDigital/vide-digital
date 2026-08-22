# Beta Fechado — Readiness

> Gerado na missão "Reta final do Beta + hardening das escritas públicas"
> (22/ago/2026), atualizado ao final da missão "Missão cirúrgica — corrigir
> flake do teste de Produtos e finalizar #53/#54" (22/ago/2026). Reflete o
> estado real do código na `main` nesta data — não o estado de produção, que
> continua inalterado (nenhum deploy realizado nestas duas missões).
> Relatório visual da primeira missão: ver artifact publicado na sessão.

## Mergeados nesta reta final

- **PR #51** — Fecha enumeração global de `vitrines_publicas` via `list()`. Merge squash, CI 4/4.
- **PR #50** — Limite de funcionários por plano + revogação de acesso ao bloquear loja + funcionário desativado perdendo acesso a notificações. Merge squash, CI 4/4.
- **PR #49** — Separação Produtos/Catálogo. Merge squash, CI 4/4.
- **PR #52** — Leads públicos migrados de escrita direta para `createPublicLead` (rate limit 5/min por IP, tenant resolvido no servidor). Merge squash, CI 4/4.
- **PR #55** — Correção determinística do flake de `tests/emulator/ui/produtos.flow.mjs` (precondição de scroll do painel de Produtos trocou `waitForTimeout` fixo por `page.waitForFunction` condicionado a `scrollHeight > clientHeight`). Não é feature nem hardening de produto — estabilização de teste, PR isolado sobre `main`. Merge squash, CI 4/4.
- **PR #53** — Avaliações públicas migradas para `createPublicReview` (rate limit 5/min por IP, tenant resolvido no servidor a partir do produto real, nunca do payload do visitante). Merge squash, CI 4/4 (incluindo o job de UI/Playwright, agora estável graças ao #55).

Todos os cinco PRs de hardening/organização (#49, #50, #51, #52, #53) e o PR de estabilização de teste (#55) estão na `main`. Quality Gate da `main` 4/4 verde confirmado após cada merge, inclusive no SHA final desta reta.

## B0 (bloqueador crítico de beta)

**0 itens em aberto.** Os dois B0 reais identificados na missão anterior (bypass do limite de funcionários; enumeração global de lojas via `list()`) foram corrigidos e testados nos PRs #50 e #51, já mergeados.

## B1 (alto impacto, sem bloquear o beta)

**0 itens em aberto** dos já classificados como B1 nesta reta. Os três B1 identificados — leads públicos sem rate limit, avaliações públicas sem rate limit, e o flake de CI em `produtos.flow.mjs` bloqueando o merge de #53 — foram resolvidos e mergeados (#52, #53, #55, respectivamente).

## B2 (risco aceito para este beta, não escondido)

- **Chat público sem rate limit** — identidade (Anonymous Auth) e tenant já são validados com rigor pelas Rules; o gap é só volume. Migração para Function é maior que a de Leads/Avaliações (precisa replicar um `writeBatch` atômico de 3 documentos + preservar `onSnapshot` em tempo real). Não implementado nesta reta.
- **Métricas públicas sem rate limit** — continuam com escrita direta no Firestore por decisão deliberada, não descuido: Cloud Functions só rodam no plano Blaze, e forçar métricas por `incrementPublicMetric` quebraria silenciosamente qualquer loja num plano sem billing. Precisa de decisão de produto (Vide Hub exige Blaze para todo tenant?) antes de qualquer mudança de código.
- **Owner bloqueado mantém acesso pelo próprio ID token por até ~1h** — `isOwner()` nas Rules nunca checa `usuarios.status`; `revokeRefreshTokens` (PR #50) impede nova sessão mas não invalida um token já emitido. Para um beta convidado/conhecido, a janela é estreita e o acesso residual fica restrito aos próprios dados do dono bloqueado. Reforço recomendado antes do lançamento público: listener `onSnapshot` client-side em `usuarios/{uid}` forçando logout ao detectar mudança de status — não implementado (toca todo fluxo de sessão, não é um PR pequeno).
- **Enumeração cross-tenant de `produtos` via `list()` filtrado por status** — corrigir de verdade exige mudança de schema (ex.: subcoleção por loja) ou um proxy via Function; nenhuma correção pontual nas Rules fecha isso sem quebrar o catálogo público legítimo. Cinco opções comparadas (A–E) no relatório da missão anterior; nenhuma implementada ainda — decisão de arquitetura pendente.

## Outros itens documentados (infraestrutura / risco baixo, não B2)

- **Limite de produtos/rascunhos sem enforcement server-side** — observável e controlável manualmente no volume atual de um beta pequeno; construir enforcement completo agora é esforço desproporcional ao risco.
- **Schema de `produtos/{id}` sem validação nas Rules / base64 sem limite dedicado** — escrita sempre feita pelo próprio dono/funcionário autenticado no próprio tenant (nunca por visitante público); risco auto-inflingido, limitado pelo teto de 1MB/documento do Firestore.
- **App Check não configurado em produção** — todas as Functions públicas usam `enforceAppCheck: false` porque nenhuma página pública chama `initializeAppCheck()`. Mitigação real de abuso é rate limit por IP em todas elas. Item de infraestrutura, não de código.

## Histórico de Quality Gate (reta final)

- `produtos.flow.mjs` chegou a falhar de forma intermitente no job "UI com login real" durante o CI de #53, em pontos diferentes do arquivo a cada tentativa — sintoma de uma precondição de scroll timing-frágil (`waitForTimeout(50)` fixo antes de ler `scrollTop`), não de um defeito no código de #53 (que não toca `produtos.flow.mjs` nem `dashboard-app.js`). Root cause confirmado (layout do `<main>` nem sempre termina de crescer alto o suficiente para ser rolável dentro dos 50ms fixos) e corrigido de forma determinística no PR #55 (`page.waitForFunction` aguardando `scrollHeight > clientHeight` antes de medir). Validado com CI real 4/4, incluindo o próprio job antes intermitente, agora verde de forma consistente. **Não é mais um risco do produto** — item de estabilização de teste, resolvido.

## Pós-beta (fora de escopo desta e da missão anterior, feature freeze mantido)

- WhatsApp Oficial (dependência externa dos gates da Meta).
- Pagamento integrado.
- Domínio próprio.
- Push notifications.

## Números

| | % pronto | Justificativa |
|---|---|---|
| **Beta fechado** | 100% | B0 = 0, B1 = 0. Os cinco PRs de hardening/organização e o PR de estabilização de CI estão mergeados na `main`, com Quality Gate 4/4 verde confirmado após cada merge e no SHA final. Os quatro riscos B2 permanecem documentados e aceitos deliberadamente para este beta (não escondidos), sem bloquear o fechamento técnico da fila. |
| **Lançamento público** | 58% | Os mesmos quatro B2 (chat sem rate limit, métricas sem rate limit, janela de sessão do owner bloqueado, enumeração de produtos) deixam de ser aceitáveis em escala aberta e adversarial — nenhum é uma religação simples de código existente; todos exigem trabalho novo. App Check real também seria esperado antes de escala pública. |
