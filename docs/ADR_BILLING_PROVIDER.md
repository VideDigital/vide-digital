# ADR — Provedor de cobrança para assinaturas do Vide Hub

**Status:** proposta — DECISÃO HUMANA NECESSÁRIA antes de qualquer integração.
**Escopo:** só pesquisa/recomendação. Nenhum gateway foi integrado, nenhuma cobrança real foi criada, nenhum Secret foi adicionado.
**Contexto:** Vide Hub é um SaaS multi-tenant brasileiro (frontend/backend em português, Functions na região `southamerica-east1`, planos já existentes no código — `starter`/`basico`/`essencial`/`negocio`/`profissional`/`avancado`/`pro`/`proplus`/`agencia`/`enterprise`/`premium`, ver `functions/src/shared/validators.js`) que hoje **não tem nenhum gateway de pagamento integrado** — o checkout de produtos da loja pública também não move dinheiro de verdade (handoff por WhatsApp). Este ADR é especificamente sobre cobrar o PRÓPRIO Vide Hub dos seus clientes (assinatura SaaS), não sobre o checkout de produtos dentro da loja de cada cliente (esse é um problema arquiteturalmente separado, com sua própria fundação em `functions/src/public/checkout-core.js`).

**Ressalva geral:** esta sessão não tem acesso de rede externo pra consultar documentação/preços atuais dos provedores. As comparações abaixo refletem características e posicionamento de mercado geralmente conhecidos e estáveis, não tabelas de preço exatas — **qualquer decisão final precisa confirmar termos, taxas e disponibilidade de recursos direto com cada provedor antes de assinar contrato**.

## 1. Critérios de avaliação

Assinatura recorrente · PIX · cartão · boleto · webhook · idempotência · chargeback · retries · portal do cliente (self-service) · API/documentação · integração com Firebase/backend Node · custo · complexidade operacional.

## 2. Comparação

| Critério | Stripe | Mercado Pago | Asaas | Pagar.me |
|---|---|---|---|---|
| Alcance | Global, líder de mercado internacional | Dominante no Brasil/LatAm | Brasil, focado em SaaS/recorrência | Brasil (grupo Stone), forte em adquirência local |
| Assinatura recorrente | Motor de subscriptions muito maduro (planos, trials, proration, upgrade/downgrade nativo) | Suporta assinaturas, mas historicamente menos flexível/maduro que o motor da Stripe | Posicionado especificamente pra cobrança recorrente de SaaS — ponto forte declarado do produto | Suporta recorrência via API, maduro para operação brasileira |
| PIX | Suportado, mas cobertura/maturidade de PIX historicamente atrás dos provedores brasileiros nativos — **verificar estado atual** | **Nativo e maduro** — PIX é um dos métodos mais usados na plataforma | **Nativo**, um dos principais métodos para assinatura recorrente no Brasil hoje | **Nativo** |
| Cartão | Sim, líder em UX de checkout | Sim | Sim | Sim |
| Boleto | Suportado de forma mais limitada | Nativo | Nativo | Nativo |
| Webhooks | Padrão-ouro do mercado (assinatura de payload, retries automáticos, documentação exemplar) | Existe, funcional, documentação historicamente menos completa que a da Stripe | Existe, documentado para o caso de uso de SaaS | Existe, maduro |
| Idempotência | Suporte nativo de primeira classe (`Idempotency-Key` no header, é parte central do design da API) | Suporte existe, menos central no design da API | Suporte existe | Suporte existe |
| Chargeback/disputas | Ferramentas robustas de gestão de disputa nativas no dashboard | Ferramentas existem, cartão via Mercado Pago | Depende do adquirente por trás; geralmente tooling mais simples que Stripe | Ferramentas de gestão de disputa, dado o grupo Stone por trás |
| Customer Portal (self-service upgrade/downgrade/cancelamento) | **Sim, produto pronto** (Stripe Billing Customer Portal) | Não é um produto pronto equivalente — precisa construir a UI própria sobre a API | Não é um produto pronto equivalente | Não é um produto pronto equivalente |
| API/documentação | Referência de mercado | Boa, mas historicamente menos completa/consistente que Stripe | Documentação orientada a SaaS brasileiro, mais enxuta | Documentação boa, orientada ao mercado local |
| Integração Firebase/Node | Excelente SDK oficial Node, exemplos abundantes de integração com Cloud Functions | SDK Node oficial existe, integração viável | SDK/API REST, integração viável via Functions | SDK/API REST, integração viável via Functions |
| Custo/taxas | Competitivo globalmente, mas **liquidação/repasse local no Brasil e emissão fiscal (NF-e) tendem a ser mais trabalhosos** de operacionalizar do que com um provedor brasileiro nativo | Taxas competitivas no mercado brasileiro | Historicamente com planos/taxas voltados a favorecer volume de SaaS recorrente — **confirmar tabela atual** | Taxas competitivas, adquirência própria (grupo Stone) |
| Split de pagamento (se necessário no futuro) | Suporta (Stripe Connect) | Suporta | Suporte mais limitado | **Suporta nativamente**, é um dos pontos fortes históricos do produto |
| Nota fiscal (NF-e) | Não é nativo — precisa de integração própria/terceiro | Não é o foco do produto | Muitos provedores brasileiros de "billing para SaaS" (incluindo Asaas) oferecem integração ou parceria pra NF-e — **confirmar** | Não é o foco do produto em si, mas o ecossistema Stone frequentemente oferece isso via parceiros |

## 3. Recomendação

Dado que o Vide Hub é um SaaS **brasileiro, com PIX historicamente sendo o método de pagamento recorrente dominante nesse mercado**, e que a operação (equipe, suporte, CI/CD, região de Functions) já é inteiramente brasileira:

- **Se a prioridade é robustez de motor de assinatura + portal self-service pronto** e o time aceita o trabalho adicional de liquidação/fiscalidade local: **Stripe**. É a opção mais madura tecnicamente para o modelo de billing recorrente em si (proration, upgrade/downgrade, trials, portal do cliente pronto), mas exige confirmar a maturidade atual do suporte a PIX/boleto e entender a operação de repasse/fiscalidade no Brasil antes de comprometer.
- **Se a prioridade é fit imediato com o mercado brasileiro e cobrança recorrente sem construir portal próprio do zero**: **Asaas** é o mais alinhado ao caso de uso específico (SaaS brasileiro cobrando assinatura recorrente via PIX/boleto/cartão), com menor esforço de integração pro cenário atual do Vide Hub.
- **Se split de pagamento entre partes (ex: comissão por indicação, marketplace futuro) for uma necessidade real no roadmap**, **Pagar.me** se destaca nesse critério específico.
- **Mercado Pago** é uma opção sólida e testada, mas sem um diferencial claro sobre Asaas/Pagar.me para o caso de uso específico de billing recorrente de SaaS (seu ponto forte histórico é mais checkout de e-commerce/marketplace do que assinatura recorrente).

**Recomendação direcional, não final:** começar avaliando **Asaas** como opção primária (melhor fit declarado pra SaaS recorrente brasileiro, menor esforço de integração) e **Stripe** como alternativa se o portal self-service pronto e a robustez internacional do motor de assinatura pesarem mais que o esforço adicional de operação fiscal local. Confirmar taxas, limites e maturidade de PIX/NF-e atuais de cada um antes de decidir.

## 4. Esboço de contrato de dados (rascunho — não implementado, agnóstico de provedor)

```
subscriptions/{tenantId}
  customer: string
  subscription: string (id da assinatura no provedor)
  plan: string (um dos planos já existentes em PLAN_LIMITS)
  status: "trial" | "active" | "past_due" | "canceled" | "suspended"
  period: { start: timestamp, end: timestamp }
  cancelAtPeriodEnd: boolean
  provider: "stripe" | "mercadopago" | "asaas" | "pagarme"
  providerCustomerId: string
  providerSubscriptionId: string
```

**Isto é um rascunho conceitual — não um schema aprovado.** Antes de implementar: revisar contra o schema de `usuarios/{uid}` já existente (`plano`, `status`) pra decidir se billing é uma sub-coleção, um documento próprio referenciando o tenant, ou campos adicionais no próprio documento do usuário — e desenhar as Rules de forma que **nenhum campo de billing seja escrito pelo cliente** (sempre via webhook server-side assinado + Admin SDK, no mesmo padrão de autoridade server-side já usado no restante do projeto).

## 5. Requisitos não-negociáveis para qualquer provedor escolhido (aplicam-se a todos)

- Webhook **sempre server-side, sempre validado por assinatura** — nunca confiar em uma chamada client-side dizendo "pagamento aprovado".
- **Idempotência obrigatória** no processamento de webhook (mesmo evento reentregue não pode duplicar efeito) — mesmo padrão já usado em `createLeadIdempotent`/`createOrderQuoteIdempotent`.
- Estados de assinatura (`trial`/`active`/`past_due`/`canceled`/`suspended`) **nunca bloqueiam dados do tenant de forma destrutiva** — separar acesso/funcionalidade de billing do dado em si (um tenant suspenso continua com seus dados íntegros, só perde acesso/funcionalidade até regularizar).
- Separar claramente **acesso** (pode logar?), **billing** (está pago?) e **status do tenant** (aprovado/bloqueado/rejeitado, já existente em `usuarios/{uid}.status`) como conceitos relacionados mas distintos.

## 6. Decisão humana necessária

- Escolher o provedor final (recomendação direcional acima, não vinculante).
- Confirmar taxas/limites/maturidade de PIX/NF-e atuais diretamente com cada provedor antes de assinar.
- Definir se split de pagamento é um requisito real do roadmap (afeta a escolha).
- Aprovar o modelo de estados de assinatura e a separação acesso/billing/status do tenant antes de qualquer implementação.
- Nenhuma integração real de gateway deve começar sem essa decisão formalizada.
