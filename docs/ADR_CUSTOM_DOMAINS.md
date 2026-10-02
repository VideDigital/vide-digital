# ADR — Arquitetura de domínio: oficial do Vide Hub e domínio próprio por tenant

**Status:** proposta — DECISÃO HUMANA NECESSÁRIA antes de qualquer implementação.
**Escopo:** só arquitetura/decisão. Nenhum DNS real, nenhuma infraestrutura paga, nenhum código de produção foi alterado por este documento.
**Contexto do repositório:** `VideDigital/vide-digital` (Firebase `vide-digital-saas`), frontend hoje publicado em GitHub Pages, backend em Firebase (Auth/Firestore/Storage/Functions, região `southamerica-east1`).

## 1. Dois problemas distintos, tratados separadamente

1. **Domínio oficial do Vide Hub** — o site institucional/app do próprio produto (`videhub.com.br` ou o que o negócio definir), hoje servido por `videdigital.github.io/vide-digital/`. Isso é um domínio único, sob controle da própria empresa — problema simples, não exige arquitetura multi-tenant.
2. **Domínio próprio de cada cliente** — cada tenant conectando seu próprio domínio (ex: `minhaloja.com.br`) apontando pra loja pública/Landing Pages dele dentro do Vide Hub. Isso é o problema real de arquitetura: centenas/milhares de hostnames arbitrários, cada um controlado por um cliente diferente, todos precisando resolver pro tenant correto com HTTPS automático.

Este ADR foca no problema 2. O problema 1 é resolvido registrando o domínio desejado e apontando DNS pra onde o app já estiver hospedado — não exige nenhuma das opções abaixo além da escolhida pro app em si.

## 2. Fato comprovado: o recurso hoje é 0% implementado

Único marcador no código: `index.html:119`, dentro de `resolverLojaPorDominio(hostname)` — a função sempre retorna `null`:

```js
// TODO: quando o recurso de dominio proprio existir, buscar aqui
// a loja dona desse hostname (ex: colecao "dominios_personalizados").
return null;
```

Não existe nenhuma coleção `custom_domains`/`dominios_personalizados` no Firestore, nenhuma Function, nenhuma regra de Rules relacionada. A existência de um campo visual de domínio (se houver) em qualquer tela do dashboard **não** significa que o recurso funciona — hoje ele não resolve nada.

## 3. Por que GitHub Pages (hosting atual) já é o problema central

GitHub Pages serve **um domínio customizado por repositório** (via arquivo `CNAME`), configurado manualmente, sem API de provisionamento, sem verificação de DNS além do que o próprio GitHub já faz pro único domínio configurado, sem certificado HTTPS automático por hostname adicional, e **sem capacidade de rotear por `Host` header pra tenants diferentes** — a mesma origem serve sempre o mesmo conteúdo, não importa qual hostname bateu nela.

Isso significa: **domínio próprio por cliente é estruturalmente impossível no GitHub Pages como está hoje**, independente de qualquer código escrito no app. Qualquer solução real precisa resolver isso na camada de hosting/roteamento, não só no código do frontend.

## 4. Comparação das opções

| Critério | A. Continuar GitHub Pages | B. Firebase Hosting | C. Cloudflare for SaaS (Custom Hostnames) + origem própria | D. Reverse proxy próprio (Caddy/Traefik + Let's Encrypt) |
|---|---|---|---|---|
| Multi-tenant (rotear por Host header) | **Não suportado** — 1 domínio por repo | Múltiplos domínios por site, mas cada um configurado individualmente; roteamento dinâmico por Host header pra "resolver tenant" ainda precisaria de uma camada própria (Function/Hosting rewrite) | **Sim, é o propósito do produto** — Cloudflare resolve o hostname e roteia pra uma origem única, que aí sim identifica o tenant pelo Host header | Sim, mas você opera essa lógica |
| Centenas/milhares de hostnames | Não | Suportado, mas sem uma API de self-service pensada pra esse volume — cada domínio ainda passa por um fluxo de verificação manual/semi-manual | **Sim — API de Custom Hostnames feita exatamente pra isso** (adicionar/verificar/remover programaticamente, em escala) | Sim, mas a automação de emissão de certificado em massa é responsabilidade sua |
| SSL automático por domínio de cliente | Não (só o domínio único do repo) | Sim, por domínio adicionado, mas o fluxo de adição em si não é pensado pra self-service em massa | **Sim, automático, é o núcleo do produto** | Sim, via Let's Encrypt, mas exige orquestração própria (rate limits do Let's Encrypt em escala, renovação, etc.) |
| Verificação de DNS | Manual (CNAME único) | TXT/CNAME por domínio, fluxo manual/via console ou API do Firebase Hosting | CNAME pro hostname de fallback da Cloudflare, com verificação automatizável via API | Você implementa (ex: ACME DNS-01/HTTP-01) |
| API de provisionamento | Não existe | Parcial (Firebase Hosting API existe, mas não é o caso de uso principal do produto) | **Sim, é o caso de uso principal** | Você constrói |
| Wildcard | Não aplicável (não é multi-tenant) | Não é o modelo — cada domínio de cliente é individual, não wildcard | Não precisa de wildcard pros domínios dos clientes (cada um é seu próprio hostname, verificado individualmente) | Possível com certificado wildcard, mas não resolve "domínio arbitrário do cliente" |
| Cache/CDN | CDN da GitHub | CDN da Google (Firebase Hosting já usa) | CDN da Cloudflare, historicamente um dos mais maduros do mercado | Nenhum nativo — precisaria de CDN separado |
| Custo | Grátis | Dentro do plano Firebase existente (Blaze), custo incremental baixo pra hosting | Cloudflare for SaaS é um produto pago (nível Business/Enterprise historicamente; **precisa verificação de preço atual antes de decidir** — não tenho acesso a preços em tempo real nesta sessão) | Custo de infraestrutura (VM/Cloud Run) + tempo de operação |
| Complexidade operacional | Baixa (mas insuficiente) | Média | Média — mais um provedor externo, mas isolado e bem documentado pro caso de uso | Alta — você é o operador do proxy/certificados |
| Integração com Firebase | Nativa (é o próprio ecossistema) | Nativa | Precisa de uma origem própria pra resolver tenant (provavelmente Cloud Run/Functions) que já conversa naturalmente com Firestore | Precisa da mesma integração própria |
| CI/CD | Já existe (`pages-publish.yml`) | Precisaria de novo workflow (`firebase deploy --only hosting`), mas o padrão de fail-closed já usado em `pages-publish.yml` é reaproveitável | A origem (onde o app realmente roda) ainda precisa de CI/CD — Cloudflare só cuida da camada de hostname/SSL na frente | Novo pipeline necessário |
| Rollback | Já existe (`git revert` + republicar) | Similar (Firebase Hosting mantém histórico de releases, rollback nativo via CLI/console) | Rollback da origem é o mesmo problema de B; Cloudflare em si não versiona conteúdo, só a camada de hostname | Você implementa |
| Vendor lock-in | Baixo (GitHub) | Médio (mas já dependemos de Firebase pro backend — não é lock-in adicional relevante) | Adiciona um vendor novo (Cloudflare) especificamente pra essa função | Nenhum vendor, mas todo o risco operacional é interno |

## 5. Recomendação

**Não dá pra resolver domínio próprio por cliente continuando só no GitHub Pages.** Isso não é uma preferência de gosto — é uma limitação estrutural (sem roteamento por Host header, sem API de domínio, sem SSL automático por hostname adicional).

Caminho recomendado, em duas peças complementares:

1. **Migrar o app público (loja/LP/dashboard) pra uma origem que consiga rotear por `Host` header e resolver o tenant a partir dele** — o candidato mais natural, dado que o backend já é 100% Firebase, é **Firebase Hosting** (servindo os arquivos estáticos hoje publicados no GitHub Pages) **combinado com uma Cloud Function/Cloud Run que resolve `Host` → tenant** antes de servir o conteúdo (substituindo o `resolverLojaPorDominio()` hoje stub). Isso já resolve o problema 1 (domínio oficial do Vide Hub) de forma simples.
2. **Para a verificação/provisionamento/SSL automático de centenas ou milhares de domínios de clientes**, o padrão comprovado do mercado é um produto do tipo **Cloudflare for SaaS (Custom Hostnames)** — ou equivalente concorrente, caso exista alternativa técnica e comercialmente melhor — na frente dessa origem: o cliente aponta um CNAME pro hostname de fallback fornecido, a Cloudflare verifica e emite o certificado automaticamente, e a requisição chega na origem (Firebase Hosting/Cloud Function) já com o `Host` header do domínio do cliente, que então resolve o tenant.

Essa combinação evita reinventar emissão de certificado em massa (opção D), evita a limitação estrutural do GitHub Pages (opção A) e evita a complexidade e escopo reduzido do fluxo manual de domínio do Firebase Hosting sozinho (opção B sem C).

**Ressalva explícita:** não tenho acesso a preços/limites atuais do Cloudflare for SaaS nesta sessão (sem acesso de rede externo) — o custo real precisa ser confirmado antes de qualquer compromisso. Se o custo for proibitivo pro estágio atual do produto, a alternativa mínima viável é B sozinho (Firebase Hosting + resolução de tenant por Host header), aceitando um fluxo de adição de domínio mais manual/lento no início, sem self-service instantâneo — ainda assim uma evolução real sobre o estado atual (0% implementado).

## 6. Fluxo funcional esperado (quando implementado — não implementado agora)

```
cliente informa domínio
  → sistema gera instrução/token de verificação
  → cliente configura DNS (CNAME/TXT conforme a opção escolhida)
  → Vide Hub comprova domínio (verificação server-side, nunca confiando em input do browser)
  → certificado HTTPS emitido
  → domínio fica ACTIVE
  → hostname resolve tenant (na origem, nunca no cliente)
  → loja/LP corretas servidas
  → remoção segura (domínio removido, hostname para de resolver, sem deixar rastro órfão)
  → transferência segura (se um domínio precisar mudar de tenant, exige nova verificação — nunca reatribuição implícita)
  → nenhuma possibilidade de domain takeover (um hostname nunca fica "livre" pra outro tenant reivindicar sem prova de propriedade DNS)
```

## 7. Esboço de contrato de dados (rascunho — não implementado, não validado contra a arquitetura completa)

```
custom_domains/{domain}
  hostname: string (o próprio domínio, normalizado, minúsculo)
  tenantId: string (ownerUid — nunca vindo do browser, sempre resolvido/validado server-side no momento da criação)
  status: "pending_verification" | "verifying" | "active" | "failed" | "removed"
  verificationToken: string (gerado pelo servidor, nunca pelo cliente)
  verifiedAt: timestamp | null
  createdAt: timestamp
```

**Isto é um rascunho conceitual, não uma decisão de schema.** Antes de implementar: revisar contra os padrões já usados no restante do Firestore (`donoUID` vs `criadoPor`, convenções de timestamp, etc.), decidir se a chave do documento deve ser o hostname normalizado (simples, mas exige sanitização rigorosa de caracteres válidos em nome de documento Firestore) ou um ID gerado com o hostname como campo indexado, e desenhar as Rules correspondentes — a autoridade sobre `tenantId`/`status`/`verificationToken`/`verifiedAt` deve ser **sempre server-side** (Admin SDK via Cloud Function), nunca escrita direta do cliente, no mesmo padrão já usado por `substituirBannersLoja`/`createPublicOrderQuote`.

## 8. Decisão humana necessária

- Aprovar (ou rejeitar) a migração do app público de GitHub Pages para Firebase Hosting.
- Aprovar (ou não) contratar Cloudflare for SaaS (ou avaliar formalmente uma alternativa) para o provisionamento de domínios de clientes em escala — depende de confirmação de custo atual.
- Definir o domínio oficial do Vide Hub (`videhub...` ou o que o negócio decidir) e adquiri-lo — fora do escopo técnico deste documento.
- Priorizar isso no roadmap: é pré-requisito de self-service real, mas não bloqueia venda assistida atual.
