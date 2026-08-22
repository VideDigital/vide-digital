# Beta Fechado — Readiness

> Gerado na missão "Reta final do Beta + hardening das escritas públicas"
> (22/ago/2026). Reflete o estado real do código nesta data — não o estado
> de produção, que continua inalterado (nenhum merge, nenhum deploy).
> Relatório visual equivalente: ver artifact publicado na sessão.

## Pronto (merge pendente, sem bloqueador de código)

- **PR #49** — Separação Produtos/Catálogo. CI 4/4 verde, `mergeable: clean`, Ready for review.
- **PR #50** — Limite de funcionários por plano + revogação de acesso ao bloquear loja + funcionário desativado perdendo acesso a notificações. CI 4/4 verde, `mergeable: clean`, Ready for review (movido de Draft nesta missão).
- **PR #51** — Fecha enumeração global de `vitrines_publicas` via `list()`. CI 4/4 verde, `mergeable: clean`, Ready for review.
- **PR #52** — Leads públicos migrados de escrita direta para `createPublicLead` (rate limit 5/min, tenant resolvido no servidor). CI 3/4 verde no momento da observação, Playwright ainda em andamento. Draft.
- **PR #53** — Avaliações públicas migradas para `createPublicReview` (rate limit 5/min, tenant resolvido no servidor a partir do produto real). CI 3/4 verde no momento da observação, Playwright ainda em andamento. Draft.

## Bloqueado (precisa decisão antes de código)

- **Métricas públicas continuam com escrita direta no Firestore** — decisão deliberada, não descuido: Cloud Functions só rodam no plano Blaze, e forçar métricas por `incrementPublicMetric` quebraria silenciosamente qualquer loja num plano sem billing. Precisa de uma decisão de produto (Vide Hub exige Blaze para todo tenant?) antes de qualquer mudança de código.
- **Enumeração cross-tenant de `produtos` via `list()` filtrado por status** — corrigir de verdade exige mudança de schema (ex.: subcoleção por loja) ou um proxy via Function; nenhuma correção pontual nas Rules fecha isso sem quebrar o catálogo público legítimo. Cinco opções comparadas (A–E) no relatório da missão; nenhuma implementada ainda — decisão de arquitetura pendente.

## Aceito como risco (para este beta, não escondido)

- **Owner bloqueado mantém acesso pelo próprio ID token por até ~1h** — `isOwner()` nas Rules nunca checa `usuarios.status`; `revokeRefreshTokens` (PR #50) impede nova sessão mas não invalida um token já emitido. Para um beta convidado/conhecido, a janela é estreita (exige bloqueio decidido no exato momento de uma sessão viva) e o acesso residual fica restrito aos próprios dados do dono bloqueado. Reforço recomendado antes do lançamento público: listener `onSnapshot` client-side em `usuarios/{uid}` forçando logout ao detectar mudança de status — não implementado nesta missão (toca todo fluxo de sessão, não é um PR pequeno).
- **Chat público sem rate limit** — identidade (Anonymous Auth) e tenant já são validados com rigor pelas Rules; o gap é só volume. Migração para Function é maior que a de Leads/Avaliações (precisa replicar um `writeBatch` atômico de 3 documentos + preservar `onSnapshot` em tempo real). Plano entregue no relatório da missão; não implementado.
- **Limite de produtos/rascunhos sem enforcement server-side** — observável e controlável manualmente no volume atual de um beta pequeno; construir enforcement completo agora é esforço desproporcional ao risco.
- **Schema de `produtos/{id}` sem validação nas Rules / base64 sem limite dedicado** — escrita sempre feita pelo próprio dono/funcionário autenticado no próprio tenant (nunca por visitante público); risco auto-inflingido, limitado pelo teto de 1MB/documento do Firestore.
- **App Check não configurado em produção** — todas as Functions públicas (existentes e as duas novas desta missão) usam `enforceAppCheck: false` porque nenhuma página pública chama `initializeAppCheck()`. Mitigação real de abuso é rate limit por IP em todas elas. Item de infraestrutura, não de código.

## Pós-beta (fora de escopo desta missão, feature freeze mantido)

- WhatsApp Oficial (dependência externa dos gates da Meta).
- Pagamento integrado.
- Domínio próprio.
- Push notifications.

## Números

| | % pronto | Justificativa |
|---|---|---|
| **Beta fechado** | 85% | Os dois B0 reais corrigidos e testados; os B1 de maior impacto (leads, enumeração de lojas, avaliações) resolvidos em PRs verdes/quase-verdes. Falta mergear os 5 PRs e aceitar formalmente os 3 riscos B2 documentados acima. |
| **Lançamento público** | 58% | Os mesmos B2 (chat sem rate limit, janela de sessão do owner bloqueado, enumeração de produtos, App Check real) deixam de ser aceitáveis em escala aberta e adversarial — nenhum é uma religação simples de código existente; todos exigem trabalho novo. |
