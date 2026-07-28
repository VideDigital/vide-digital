# Central de Crescimento & Rastreamento V1

Substitui o antigo placeholder "Pixels & Domínio" (`view-dominios`, sem lógica real) por
um módulo funcional de crescimento/marketing: KPIs reais, construtor de links UTM,
biblioteca de campanhas, configuração de pixels (Meta/GA4/TikTok) com consentimento
obrigatório, diagnóstico honesto e uma seção não automatizada de preparação de domínio
próprio.

`data-target="view-dominios"` foi preservado — só o rótulo visível mudou (sidebar, hub
card e breadcrumb) para "Central de Crescimento".

## Arquivos

| Arquivo | Papel |
|---|---|
| `tracking-core-v1.js` | Funções puras: UTM, validação de pixels, consentimento, mapeamento de eventos, PII, métricas. Sem DOM, sem Firebase. Testado por `tests/tracking-core-v1.test.mjs`. |
| `growth-tracking-v1.js` | Controller da view `#view-dominios` no dashboard (padrão `criarGrowthTrackingController({db, context, firestore, notify, logger, root, obterSlugAtual})`, igual a `central-ia.js`/`crm360.js`). Lê/grava `tracking_configs`, `tracking_links`, KPIs de `metricas_vitrines`/`leads`. |
| `growth-tracking-v1.css` | Estilos da view, responsivo (desktop/tablet/mobile), tema claro/escuro. |
| `public-tracking-v1.js` | Loja pública (`loja.html`): banner de consentimento, loaders oficiais dos pixels (só depois do consentimento), API `window.VideTrackingV1.track(evento, payload)`. |

## Modelo de dados

### `tracking_configs/{ownerUid}` (privado, dono/admin/editor de `configuracoes`)

```
{
  criadoPor, atualizadoPor: string (uid),
  metaPixel: { id: string, ativo: boolean },
  ga4: { measurementId: string, ativo: boolean },
  tiktokPixel: { id: string, ativo: boolean },
  consentimento: { ativo: boolean, versao: 1 },
  criadoEm, atualizadoEm: timestamp
}
```

Um único documento por loja (mesmo padrão de `campanhas/{ownerUid}` e
`configuracoes_ia/{storeUid}`). Nunca contém PII de clientes — só configuração da
própria loja.

### `tracking_links/{id}` (privado, dono/admin/editor de `configuracoes`)

```
{
  criadoPor: string (uid, imutável após criação),
  nome, baseUrl, source, medium, campaign, content, term, finalUrl: string,
  ativo: boolean,
  criadoEm, atualizadoEm: timestamp
}
```

Limite de 100 links operacionais por loja (`limit(100)` na consulta e checagem antes de
criar/duplicar). "Arquivar" desativa (`ativo:false`) sem apagar; exclusão é definitiva.

### `vitrines_publicas/{slug}.tracking` (subconjunto público, seguro)

Ao salvar pixels no dashboard, `growth-tracking-v1.js` tenta publicar atomicamente
(`writeBatch`) em `tracking_configs/{uid}` **e** no campo `tracking` do documento
público `vitrines_publicas/{slug}` (slug resolvido via `obterSlugAtual()`, injetado por
`dashboard-app.js` a partir da variável `slugAtualSalvo` já existente — nunca lido do
DOM). Se não houver slug salvo ainda, grava só a config privada.

```
tracking: {
  metaPixelId, ga4MeasurementId, tiktokPixelId: string,
  metaPixelAtivo, ga4Ativo, tiktokAtivo: boolean,
  consentimentoAtivo: boolean,
  consentimentoVersao: 1
}
```

Só os IDs e flags — nenhum dado de cliente. Esse é o único ponto de onde `loja.html` lê
configuração de pixels (nunca lê `tracking_configs` diretamente — sem permissão).

## Consultas adicionadas

- `growth-tracking-v1.js`: `getDoc(metricas_vitrines/{uid})`, `getDocs(leads where criadoPor==uid limit 500)`, `getDoc(tracking_configs/{uid})`, `getDocs(tracking_links where criadoPor==uid limit 100)`.
- KPIs de sessão/tempo/cliques usam `metricas_vitrines.porDia` (já existente, chave `YYYY-MM-DD`) filtrado pelo período selecionado (7/30/90/tudo) via `somarMetricasPorDia()`.

## Regras e permissões (`firestore.rules`)

- `tracking_configs/{ownerUid}`: leitura exige `canViewTenant(ownerUid, "configuracoes")`; criação/edição exigem `canEditTenant` + validação de formato de cada campo (`trackingIntegracaoValida`, `trackingConsentimentoValido`); delete sempre negado (histórico de configuração não se apaga, só se limpa os IDs).
- `tracking_links/{id}`: leitura por `canViewTenant(resource.data.criadoPor, "configuracoes")`; criação/edição exigem `canEditTenant` + `criadoPorUnchanged()` + validação de campos (`validTrackingLinkData`); delete por quem edita.
- `vitrines_publicas/{slug}`: `"tracking"` entrou na whitelist de `publicStoreFields()` e é validado (`trackingPublicoValido()`) na mesma branch de update já usada para o resto do perfil público — não abre nenhuma permissão nova, só estende o payload que quem já podia editar "configuracoes" podia mandar.
- Sem alteração de acesso entre papéis: dono/admin sempre têm acesso total; funcionário só se tiver `"configuracoes"` em `permissoes.ver`/`permissoes.editar`; nenhum acesso cross-tenant.
- Testado em `tests/emulator/firestore-security.test.mjs` (13 casos novos, positivos e negativos, incluindo funcionário sem a permissão e tentativa de acessar tenant alheio).

## Como a publicação pública funciona

1. Dono configura pixels em "Central de Crescimento" → `salvarPixels()`.
2. Grava `tracking_configs/{uid}` (fonte da verdade, privada) e, se a loja já tem slug
   salvo, atualiza `vitrines_publicas/{slug}.tracking` no mesmo `writeBatch` (atômico —
   nunca fica um sem o outro).
3. `loja.html` lê `vitrines_publicas/{slug}` normalmente (já é público) e agora também
   recebe o campo `tracking`.

## Como o consentimento impede carregamento antecipado

- `public-tracking-v1.js` só chama `initTracking({slug, tracking})` depois que
  `loja.html` já carregou o documento público. Se `tracking.consentimentoAtivo` for
  `false` ou nenhum pixel estiver configurado/ativo, a função retorna sem fazer nada —
  nenhum script de terceiro é sequer considerado.
- Se há pixel configurado e o dono ativou o consentimento: primeiro verifica
  `localStorage["videTrackingConsentV1:<slug>"]` (chave por loja, versionada por
  `CONSENTIMENTO_VERSAO_ATUAL`). Sem consentimento válido salvo, mostra o banner
  (Necessários sempre ligado, Análise/Marketing como checkboxes) — **nenhum `<script>`
  de pixel é criado antes de o visitante decidir** ("Só necessários" / "Salvar
  preferências" / "Aceitar tudo").
- Só depois da decisão (salva no `localStorage`) é que `carregarPixelsPermitidos()` roda,
  e mesmo assim cada pixel só carrega se a categoria correspondente (`analytics` → GA4,
  `marketing` → Meta/TikTok) foi permitida.
- Os loaders (`carregarMetaPixel`/`carregarGa4`/`carregarTikTokPixel`) usam só as URLs
  oficiais fixas das plataformas (`connect.facebook.net`, `googletagmanager.com`,
  `analytics.tiktok.com`) — nunca `eval`, nunca HTML vindo de configuração do usuário.

## Eventos implementados

`tracking-core-v1.js` define 8 eventos permitidos e seus mapeamentos por plataforma
(Meta/GA4/TikTok): `page_view`, `view_content`, `product_click`, `add_to_cart`,
`initiate_checkout`, `lead`, `contact`, `chat_started`. **`purchase` foi deliberadamente
excluído** — o checkout desta loja finaliza redirecionando pro WhatsApp e não confirma
pagamento nenhum, então disparar Purchase seria dado falso pro anunciante.

Wiring real em `loja.html` (via `window.VideTrackingV1.track()`, importado como
`trackCrescimento`):

- `page_view` — ao carregar os dados públicos da loja.
- `product_click` — no CTA de produto (`irParaOferta`), junto da métrica interna já
  existente.
- `lead` — no ponto único `capturarLeadPublico()` (cobre popup de captura, CTA de
  produto e qualquer outro formulário que já usa essa função), com `value`/`currency`
  quando é um pedido.
- `contact` — ao abrir o WhatsApp a partir do CTA de produto.
- `chat_started` — ao abrir a janela do chat ao vivo.

`view_content` e `initiate_checkout` estão mapeados e disponíveis via
`trackCrescimento("view_content"/"initiate_checkout", ...)`, mas **não foram
conectados a um gatilho de UI específico nesta entrega** — ficou fora do escopo dado o
tempo disponível. Não bloqueia nada: a API já existe e pode ser chamada de qualquer
ponto futuro sem mudança de contrato.

## Garantia de ausência de PII

`removerCamposProibidos()` roda em **todo** payload passado pra `track()`, antes de
qualquer envio pra qualquer plataforma — remove `nome`, `nomeCliente`, `clienteNome`,
`telefone`, `clienteTelefone`, `whatsapp`, `email`, `endereco`, `cep`, `texto`,
`mensagem`, `observacoes`, `observacao`, `cpf`, `documento`, mesmo que alguém passe por
engano. É defesa em profundidade: além disso, os pontos de chamada em `loja.html` só
passam `produtoId`, `utmSource/Medium/Campaign`, `value`/`currency` — nunca dado de
cliente. Testado em `tests/tracking-core-v1.test.mjs`.

## Limitações de domínio próprio

A seção "Domínio próprio" é **informativa e assistida**, não automatizada:

- Mostra o endereço atual (subdomínio Vide Hub) e um checklist de pré-requisitos.
- O campo de "simular domínio" só valida formato (`host.tld`) — não consulta DNS, não
  verifica disponibilidade real, não altera nada.
- O botão "Preparar solicitação de domínio" só copia um checklist de texto pra área de
  transferência — **não conecta domínio nenhum, não emite certificado, não marca nada
  como ativo**. A conexão real continua sendo feita manualmente pelo suporte Vide Hub.

## Testes

- `tests/tracking-core-v1.test.mjs` — 41 testes unitários (UTM, validação de pixel,
  consentimento, eventos, PII, métricas, agrupamento por origem, limite de 100 links).
- `tests/emulator/firestore-security.test.mjs` — 13 testes de Rules novos
  (`tracking_configs`, `tracking_links`, publicação segura de `tracking` em
  `vitrines_publicas`).
- `pnpm run check` cobre `node --check` de `tracking-core-v1.js`,
  `tests/tracking-core-v1.test.mjs` e (indiretamente, via `dashboard-app.js`)
  `growth-tracking-v1.js`.

## Notas de implementação

- `growth-tracking-v1.js` segue o padrão de controller injetado usado por
  `central-ia.js`/`crm360.js` (nunca importa Firebase direto).
- `public-tracking-v1.js` é standalone (só depende de `tracking-core-v1.js`), sem
  acoplamento ao dashboard.
- Nenhuma lógica de rastreamento vive dentro de `dashboard.html`/`loja.html` além dos
  pontos de chamada — funções puras, UI do dashboard, loader público e persistência
  ficam em arquivos separados, como pedido.
