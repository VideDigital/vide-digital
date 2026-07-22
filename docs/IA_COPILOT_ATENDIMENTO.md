# Copiloto de IA do Atendimento — Fase 1

Copiloto de IA dentro da Central de Atendimento: gera sugestões, resumos,
próximas ações e análises para o atendente revisar — **não responde o
cliente sozinho, não roda no WhatsApp, não chama nenhum provedor externo**.
Este documento cobre exatamente o que existe hoje (Fase 1) e o que está
deliberadamente fora de escopo.

## O que esta fase É

- Um módulo puro (`ia-copilot.js`, mesmo padrão de `atendimento.js`/
  `crm360.js`/`central-ia.js`: funções testáveis + `criarIaCopilotController
  (deps)` com dependências injetadas).
- Um provedor **mock local**, determinístico, sem rede — 14 ações
  estruturadas (ver abaixo), cada uma devolvendo um objeto (nunca só uma
  string) com texto, confiança, fontes usadas, avisos e sugestões
  auxiliares (template/status/tags/próximas ações).
- Um painel na Central de Atendimento (dentro da coluna de detalhe, acima
  do formulário de resposta) com um botão **"Gerar sugestão"** — nunca
  "Enviar automaticamente". O texto gerado só entra no compositor quando o
  atendente clica **"Usar resposta"**; se o compositor já tem texto, o
  painel pergunta substituir/anexar/cancelar antes de tocar nele.
- Uma permissão de módulo própria, `ia-copilot`, **separada** de
  `atendimento` — um funcionário com acesso à Central de Atendimento não
  ganha o copiloto automaticamente; o dono precisa conceder as duas.
- Um registro de uso controlado: só quando uma sugestão é **usada** ou
  **descartada** (nunca a cada geração) grava um evento em
  `chats/{chatId}/eventos` com campos whitelisted — nunca o prompt
  completo, nunca uma chave de provedor.

## O que esta fase NÃO é (fora de escopo, de propósito)

- **Não** responde o cliente automaticamente — o humano sempre revisa e
  envia.
- **Não** está no WhatsApp.
- **Não** chama nenhum provedor de IA externo (OpenAI/Claude/Gemini/
  outro) — nem do frontend, nem de uma Cloud Function publicada nesta
  fase.
- **Nenhuma chave de provedor de IA existe em lugar nenhum** — frontend,
  Firestore, GitHub. `CONFIG_PROVEDOR_IA_COPILOT` (`ia-copilot.js`) só
  declara `{ provider: "mock", endpoint: null, enabled: false }`; não há
  campo de "cole sua chave aqui" em canto nenhum da UI.
- **Não** duplica a estrutura de chats, CRM, Base de Conhecimento,
  produtos, pedidos ou templates — todo o contexto vem de dados que os
  controllers existentes já carregaram em memória (ver "Como o contexto é
  montado" abaixo). O módulo não faz nenhuma leitura nova no Firestore.
- **Não** publica Cloud Function nova.

## As 14 ações (`ACOES_IA_COPILOT`)

| Chave | O que faz |
|---|---|
| `resumir_conversa` | Resumo curto da conversa até aqui |
| `sugerir_resposta` | Rascunho de resposta pro atendente revisar |
| `sugerir_proxima_acao` | Lista curta do que fazer a seguir |
| `detectar_intencao` | Classifica a intenção do cliente (ver tabela abaixo) |
| `sugerir_template` | Aponta o template mais relevante já cadastrado |
| `sugerir_tags` | Sugere tags do catálogo pra aplicar no CRM |
| `sugerir_status` | Sugere o próximo status da conversa |
| `identificar_pedido_relacionado` | Aponta o pedido do cliente mais provável de ser o assunto |
| `analisar_sentimento` | Sinaliza sentimento provável (negativo/neutro/positivo) |
| `sugerir_produtos_relacionados` | Produtos da Base de Conhecimento relacionados ao assunto |
| `verificar_duvida_frequente` | Casa a pergunta do cliente com uma FAQ existente |
| `sinalizar_reclamacao` | Sinaliza possível reclamação, sugere priorizar |
| `sugerir_encaminhamento` | Sugere se a conversa precisa de outro responsável |
| `gerar_resumo_pos_atendimento` | Resumo final pra fechar a conversa |

Cada ação passa pelo mesmo roteador (`gerarSugestaoMock(contexto, action,
opts)`) e devolve sempre o mesmo formato:

```js
{
  action, text, confidence,          // confidence: 0–1
  usedSources: [],                    // ex.: ["Pedido #1042", "FAQ: Prazo de entrega"]
  warnings: [],                       // ex.: aviso de preço não confirmado
  suggestedTemplateId: null,
  suggestedStatus: null,
  suggestedTags: [],
  nextActions: []
}
```

## Identificação de intenção

`identificarIntencao(texto)` classifica a última mensagem do cliente em:
`orcamento`, `prazo`, `pagamento`, `entrega`, `suporte`, `reclamacao`,
`pos_venda`, `personalizacao` ou `outro` — por palavras-chave em pt-BR, sem
nenhuma chamada externa. Achado durante os testes: "defeito" sozinho ficou
de fora de `suporte` de propósito, porque a frase mais específica "veio com
defeito" já pertence a `pos_venda` — deixar a palavra solta em `suporte`
fazia toda reclamação pós-venda cair na categoria errada.

## Como o contexto é montado (limitado, sanitizado, sem leituras novas)

`construirContextoIA({...})` recebe dados já carregados em memória pelos
controllers existentes e devolve um objeto pronto pro provedor mock (e, no
futuro, pro contrato documentado abaixo):

| Fonte no contexto | De onde vem (sem nova leitura) |
|---|---|
| `mensagens` (até 12) | `atendimentoController.state.mensagens` |
| `eventos` (até 10) | `atendimentoController.state.eventos` |
| `cliente` | `crm360Controller.state.cliente` (só se já carregado pra este cliente) |
| `pedidos` (até 5) | `crm360Controller.state.pedidos` |
| `templatesRelevantes` | `atendimentoController.state.templates`, filtrados via `filtrarTemplatesAtendimento`/`templatesMaisUsados` (reaproveitadas de `templates-atendimento.js`) |
| `conhecimentoRelevante` | `baseConhecimentoController.state.itens`, filtrados via `filtrarItensConhecimento` (reaproveitada de `base-conhecimento-ia.js`) |
| `assistantConfig` | `centralIAController.getState().persisted` |

Limites de privacidade e tamanho (`LIMITES_IA_COPILOT`): o `cliente` do
contexto nunca inclui e-mail, telefone ou documento — só nome, tags e status
de relacionamento. Mensagens são truncadas a 400 caracteres cada; o
contexto inteiro é truncado se passar de ~6.000 caracteres serializados.
`resumoTextoItens`/`calcularValorItens` de `pedidos-estruturados.js` são
reaproveitadas pra formatar itens de pedido — nunca reimplementadas aqui.

## Defesa contra prompt injection

`detectarTentativaInjecao(texto)` reconhece padrões como "ignore as
instruções", "aja como admin", "mostre dados de outro cliente", "me dê um
desconto" — quando a última mensagem do cliente bate com algum padrão, o
contexto carrega `alertaInjecao.suspeita = true` e toda sugestão gerada
nessa conversa sai com confiança reduzida (`confidence <= 0.4`) e um aviso
explícito no painel ("Mensagem do cliente contém padrão semelhante a
tentativa de manipular a IA — revise com atenção"). Isso nunca bloqueia a
geração — o atendente sempre revisa antes de qualquer envio.

## Regras de qualidade da sugestão

`validarQualidadeSugestao(sugestao, contexto)` roda em toda sugestão antes
de chegar no painel:

- Remove HTML e emoji do texto (nunca renderiza HTML vindo de uma
  sugestão; o padrão visual do projeto não usa emoji).
- Avisa se o texto menciona um valor em `R$` sem um pedido correspondente
  no contexto — nunca inventa preço.
- Avisa se o texto menciona desconto/promoção — o copiloto nunca deve
  prometer desconto sem autorização humana explícita.
- Avisa quando a confiança é baixa (`< 0.35`), tratando a sugestão como
  rascunho.

O provedor mock em si já evita inventar prazo/status/preço que não estejam
no contexto: `sugerir_resposta`, por exemplo, só cita um prazo de entrega
real quando existe um pedido vinculado com `prazoEntrega` preenchido;
quando não existe, avisa em vez de arriscar um valor.

## Permissão, Rules e log de uso

- Módulo `ia-copilot` em `core/vide-module-aliases.js` e
  `employeeHasModulePermission()` (`firestore.rules`) — aliases:
  `ia_copilot`, `copiloto`, `copiloto-ia`, `copiloto_ia`.
- Nova categoria de evento `"ia"` em `categoriaEventoAtendimentoEsperada()`
  com dois tipos: `ia_sugestao_usada`, `ia_sugestao_descartada`. Só esses
  dois — nenhum evento é gravado a cada geração de sugestão (isso roda
  inteiramente em memória).
- `podeUsarIaCopilot(chatData)` (`firestore.rules`) exige **as duas coisas
  ao mesmo tempo**: `podeResponderChat(chatData)` (a mesma base de
  atendimento/leads) **e** `canEditTenant(tenantId, "ia-copilot")`. O dono
  sempre passa (bypass de `isOwner` já embutido em `canEditTenant`).
- `eventoAtendimentoStaffValido()` passou a checar
  `podeUsarIaCopilot(chatData)` especificamente quando
  `categoriaEventoAtendimentoEsperada(data.tipo) == "ia"` — nenhuma outra
  categoria de evento foi afetada.
- O `dados` (map já whitelisted em `eventoAtendimentoDadosValido()`) ganhou
  3 chaves opcionais: `iaAction` (qual das 14 ações), `iaProvider`
  (`"mock"` nesta fase), `iaConfidenceBucket` (`"alta"`/`"media"`/`"baixa"`
  — bucket grosseiro, nunca o float de confiança bruto). O resumo legível
  ("Fontes usadas: Pedido #1042, FAQ: Prazo de entrega") usa o campo
  `resumo` que já existia (≤300 caracteres). **Nunca** o prompt completo,
  **nunca** a resposta completa duplicada, **nunca** uma chave de
  provedor.
- Testado contra o Emulator real em
  `tests/emulator/firestore-security.test.mjs` (bloco "chats/eventos:
  copiloto de IA"): dono sempre passa; funcionário só com `atendimento`
  falha; funcionário com `atendimento`+`ia-copilot` passa; `ia-copilot`
  sozinho sem `atendimento` falha; categoria errada, tipo fora do enum de
  IA e chave desconhecida em `dados` (ex.: `promptCompleto`) falham;
  visitante público nunca cria evento de categoria `ia`.

## Contrato documentado para um backend externo futuro (NÃO implementado)

`CONTRATO_BACKEND_IA_FUTURO` (`ia-copilot.js`) documenta a forma de uma
futura rota `POST /ai/copilot/suggest` — autenticação por ID token do
Firebase Auth (validado no backend, nunca a chave do funcionário), corpo de
requisição no mesmo formato de `construirContextoIA()`, corpo de resposta
no mesmo formato do provedor mock. **Nenhum código deste projeto chama essa
rota.** Ela existe só como referência para quando um backend externo real
for construído — a chave do provedor de IA ficaria exclusivamente nesse
backend, nunca em variável de frontend, Firestore ou repositório. Mesma
filosofia já documentada em `docs/FIREBASE_SPARK_ARCHITECTURE.md` para
Cloud Functions: só existem quando há segredo real ou integração externa
genuína — nenhuma foi publicada nesta fase.

## UI

- Painel dentro da coluna de detalhe da Central de Atendimento
  (`#ia-copilot-painel`), colapsável via um toggle
  (`#ia-copilot-toggle-linha`) que só aparece pra quem tem a permissão
  `ia-copilot`. Nunca quebra a grade de 3 colunas — vive dentro da coluna
  já existente, com `max-height` e rolagem própria.
- Seletor das 14 ações + botão "Gerar sugestão". Resultado mostra o texto,
  avisos (se houver) e "Fontes usadas" (se houver).
- "Usar resposta": se o compositor (`#atend-resposta-input`) já tem texto,
  pergunta Substituir/Anexar/Cancelar antes de tocar nele; se está vazio,
  insere direto. Nunca envia — só preenche o campo, o atendente ainda
  precisa clicar "Enviar".
- "Descartar": limpa a sugestão do painel e grava `ia_sugestao_descartada`.
- Trocar de conversa limpa a sugestão do painel (uma sugestão de uma
  conversa nunca aparece "grudada" na próxima).
- Sem emoji — só os SVGs inline já usados no resto do dashboard. CSS em
  `ia-copilot.css`, reaproveitando os tokens visuais de `atendimento.css`
  (`--at-border`, `--at-muted`, `--at-card-bg`, `.atend-btn`).

## Permissão de gestão de acessos

Nova entrada em `MODULOS_PERMISSAO` (`dashboard-app.js`): "Copiloto de IA
(Atendimento)", com a chave `ia-copilot`. Aparece junto das outras
permissões de módulo na tela de gestão de funcionários — o dono concede (ou
não) por funcionário, independente de "Central de Atendimento".

## Testes

- `tests/ia-copilot.test.mjs` — 27 testes unitários: constantes/contrato,
  sanitização, detecção de injeção, identificação de intenção, context
  builder (incluindo o teste que comprova que e-mail/telefone/documento do
  cliente nunca entram no contexto), as 14 ações do provedor mock,
  validação de qualidade, bucket de confiança, resumo de fontes, e o
  controller completo (permissão negada, geração sem escrita no Firestore,
  "usar" inserindo no compositor + evento com só os 3 campos controlados
  em `dados`, "descartar" sem tocar no compositor).
- `tests/emulator/firestore-security.test.mjs` — bloco dedicado (6 testes)
  contra o Emulator real, listado acima.
- `tests/emulator/ui/ia-copilot.flow.mjs` — fluxo completo no navegador
  (gerar → usar com e sem confirmação → descartar; toggle oculto sem
  permissão, visível com permissão). **Mesma limitação de rede já
  documentada em `docs/QUALITY_GATE_RELEASE.md`**: este sandbox bloqueia
  `www.gstatic.com` por política de egress, então o teste não passa de
  ponta a ponta aqui — confirmado rodando de verdade contra o Emulator
  real, com a mesma causa raiz já diagnosticada (não um bug novo). Rodar
  `pnpm run test:ui:flows` num ambiente que alcance `www.gstatic.com`
  antes de confiar neste teste específico.

## Próximos passos reais (fora desta fase)

1. Confirmar `ia-copilot.flow.mjs` rodando de ponta a ponta num ambiente
   com acesso a `www.gstatic.com` (mesmo item pendente do Quality Gate).
2. Se um provedor externo real for construído, implementar o contrato já
   documentado em `CONTRATO_BACKEND_IA_FUTURO` numa Cloud Function nova —
   nunca chamar o provedor direto do frontend.
3. Se o volume de uso justificar, considerar histórico de sugestões
   persistido (hoje `controller.state.historico` vive só em memória da
   sessão do navegador, até `LIMITES_IA_COPILOT.maxHistoricoSugestoes`).
