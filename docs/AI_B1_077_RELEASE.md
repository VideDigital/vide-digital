# Sprint 077 — IA pública, reserva privada e canal de release

Base: `0ebc271448960105a4004367901fbc2d39602d3b`.
Branch: `fix/ai-public-release-blockers-077`.
Escopo: apenas AI-01, AI-02, testes e canal manual de IA. Sem merge ou deploy.

## AI-01: orçamento global com reserva privada

FATO COMPROVADO: ambos os handlers debitavam apenas count em
`ia_negocio_uso/{ownerUid}_{AAAA-MM UTC}`. Visitantes podiam consumir todo o orçamento privado.

O total continua **200 tentativas por mês/tenant**.
`LIMITES_IA_NEGOCIO.usoMensalPublico = 100` limita as tentativas públicas;
as 100 restantes ficam protegidas contra consumo público em um mês novo.
O dono pode usar todo o total de 200 quando não houver uso público.
Não são dois orçamentos de 200. Uso privado anterior também conta no teto global.

Não foi encontrada decisão anterior para a divisão em docs/IA_NEGOCIO.md,
configuração de planos ou testes. A divisão 100/100 é um default provisório,
conservador quanto à disponibilidade privada, não derivado de métricas reais.
Calibrar com uso real mantendo público < total e autorização de produto.

Na mesma transação Firestore: ler count/publicCount, validar contadores, negar
se total >= 200 ou público >= 100, gravar count+1 e publicCount+(público ? 1 : 0).
Duas instâncias não podem decidir sobre snapshots antigos sem retry transacional.
Contadores inválidos falham fechado, sem reset.

### Legado

count mantém o significado de total e nunca é resetado.
Quando publicCount está ausente, o count existente é tratado conservadoramente
como potencial uso público; a primeira chamada aceita persiste essa atribuição.
Documento novo começa em zero. Não há migração em produção.

Exemplos:
- count=30 sem publicCount: público pode ir a total=31/publicCount=31.
- count=150 sem publicCount: público é negado; privado pode chegar a 151/150.
- count=200: ambos continuam bloqueados até o novo mês; não se recupera
  retroativamente o orçamento já consumido antes da correção.
- No novo período, documento independente começa sem uso.

O objetivo é impedir NOVO esgotamento público do orçamento privado; não prometer
100 mensagens adicionais num mês legado já consumido.

### Validação e falhas

Pergunta deve ser string não vazia de até 800 caracteres. Histórico opcional:
array de até oito objetos, autor dono/ia no privado ou visitante/ia no público,
texto string não vazio de até 4001 caracteres. O +1 preserva a elipse que o
builder existente acrescenta ao truncar respostas em 4000 caracteres.
O builder continua limitando cada entrada ao tamanho usado no prompt.
Null, tipos errados, autor inválido e limites excedidos falham ANTES da cota mensal.
A infraestrutura do rate limit público existente permanece anterior à validação;
este contrato trata da cota mensal, não do bucket de requisições.

A reserva é anterior ao Gemini e não sofre reembolso automático.
Sucesso, HTTP 429/404/5xx, rede, timeout/cancelamento e resposta vazia mantêm débito.
Não é possível inferir ausência de custo apenas pela falha de transporte.
Retries são novas tentativas e continuam limitados pelo total e subteto.
Não foi adicionado timeout nem mecanismo de reembolso/idempotência nesta missão.

## AI-02: catálogo explicitamente ativo

Causa: Admin SDK consultava produtos por dono e o builder excluía somente rascunho,
incluindo arquivados, status ausente/vazio/desconhecido.

Query final:
```js
db.collection("produtos")
  .where("criadoPor", "==", ownerUid)
  .where("statusProduto", "==", "ativo")
  .limit(LIMITES_IA_NEGOCIO.maxProdutosContexto)
```

Defesa independente no builder:
`produto?.statusProduto === "ativo"`.
Só nome/preço/disponibilidade do catálogo ativo entram no contexto público;
pedidos/leads/estoque exato continuam excluídos.

Índice adicional: **NÃO**. O composto produtos/criadoPor ASC/statusProduto ASC
já consta de firestore.indexes.json; nenhuma edição ou publicação de index.
Query executada com sucesso no Emulator. Emulator não comprova implantação
de índices na produção; preflight operacional futuro deve conferir se necessário.

Resolução pública permanece server-side por loja/LP e dono aprovado.
Teste usa resolver real, dados sintéticos A/B e ownerUid/tenantId forjados:
somente o catálogo ativo de A e a cota de A são usados.

## Validação

- Testes de quota/handler: uso privado/público, subteto, reserva, limite global,
  legado, contadores inválidos, concorrência, mês UTC, tenant independente,
  payload/histórico inválido, histórico válido existente, falhas/retries,
  query, builder e texto final do transporte mockado.
- Firestore Emulator: 4 testes com duas instâncias de cliente e transações reais;
  limite público, total misto, legado/mês/tenant e catálogo/resolver/prompt.
- Testes existentes de instrumentação mantêm todas as assertions. Apenas duas
  fixtures passam a usar autor dono/visitante (contrato emitido pelo frontend)
  em vez de role user, agora rejeitado pela validação explícita.
- Functions local: 560/560.
- Workflow dedicado: 7 grupos passam.
- Sintaxe equivalente local: 165 checks passam; pnpm run check integral
  excede o limite de linha de comando do Windows. Não foi alterado para ocultar isso.
- pnpm run test:ci-workflows e test:unit foram executados localmente;
  testes POSIX preexistentes falham em Windows por resolução de bash/PATH.
  Aprovação integral depende do QG Linux no HEAD da PR.
- QG da PR deve executar os quatro jobs, incluindo novo teste Emulator via test:rules.
- Nenhum teste chama Gemini real, lê Secret real ou usa projeto de produção.

### Mutation testing — 23/23 detectadas

Funcional (12): público com 200; ausência da escrita publicCount; público
usando canal privado; total off-by-one; remoção da transação; payload inválido
debitado antes da validação; arquivado permitido; status ausente permitido;
retorno a != rascunho; remoção do filtro do builder; remoção do filtro de tenant;
remoção do filtro de status na query.

Workflow (11): deploy genérico; terceira Function; lead; WhatsApp; outro projeto;
gate dos jobs ignorado; SHA do despacho ignorado; TOCTOU removido; dry-run removido;
push automático; input livre de Function.

Todas são temporárias, detectadas por falhas das suítes comportamentais;
os originais foram restaurados e comparados por SHA-256 antes do commit.

## Canal de deploy preparado, não executado

Arquivo: `.github/workflows/firebase-deploy-ai-b1-077.yml`.
Nome: **Deploy Functions — AI B1 077**.
Somente workflow_dispatch, inputs confirmacao=PUBLICAR e sha completo.
Projeto fixo: vide-digital-saas.
Escopo hardcoded:
`functions:askBusinessAI,functions:askPublicBusinessAI`.

Main/SHA do despacho antes do checkout; checkout exato sem credenciais persistidas;
exports conferidos; QG oficial push/main no mesmo SHA, quatro jobs success;
autenticação existente WIF preferencial/fallback; reconsulta main antes da auth;
dry-run com mesmo escopo; TOCTOU imediatamente antes do deploy final.
Concurrency group: firebase-production-functions-deploy.
Nenhum input de Function; nenhum deploy de lead, Pages ou WhatsApp.
O dry-run pode habilitar APIs; integra a futura operação de deploy autorizada,
não é usado como leitura pura nesta missão.

Futuro comando, somente depois de merge autorizado, QG da main e nova autorização:
```text
gh workflow run firebase-deploy-ai-b1-077.yml --repo VideDigital/vide-digital --ref main -f confirmacao=PUBLICAR -f sha=<SHA_COMPLETO_DA_MAIN_AUTORIZADO>
```

Antes: inventário das duas Functions/revisões, projeto, região e SHA/QG.
Depois: comprovar somente as duas Functions alteradas; smoke QA separado.
Partial deploy/revisões antigas: não considerar ambos corrigidos até conferir
as duas revisões; não executar rollback/redeploy automaticamente.

## Backlog preservado e limites

B2: identidade frágil do rate limit público (074), App Check/borda, idempotência,
timeout e semântica de reembolso, mensagem genérica de créditos para 429,
métricas de custo/divisão por plano, TTL e maxInstances.
Não houve redesenho do rate limit, enforcement novo ou aumento do teto de custo.

PR #103 permanece DRAFT e inalterada. Após a correção ser integrada e publicada,
atualizar seu estado de AI-01/AI-02 com SHAs/evidências adequados; código em PR não
significa correção em produção.

Canal createPublicLead 075 permanece disponível e inalterado. Na main observada:
```text
confirmacao=PUBLICAR
sha=0ebc271448960105a4004367901fbc2d39602d3b
ref=main
```
Revalidar SHA após qualquer merge. NÃO foi executado.

Produção: inalterada por esta missão. Merge NÃO; deploy IA NÃO; deploy lead NÃO;
Rules/Storage/indexes/Auth/App Check/IAM/Secrets/frontend/WhatsApp: sem alterações.

