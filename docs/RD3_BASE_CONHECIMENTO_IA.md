# Base de Conhecimento da IA (RD3)

Módulo por tenant que guarda o acervo que a futura assistente virtual usará para responder: FAQs, dados da empresa, políticas, manuais, documentos e catálogo. Nenhum provedor de IA é chamado — o módulo é 100% dados + preparação.

## Arquivos

- `base-conhecimento-ia.js` — constantes, validação, filtros, indicador de prontidão e o controller da tela (testável; recebe `db`/`context`/`firestore`/`notify` por injeção).
- `dashboard.html` — seção `#view-base-conhecimento` (header, KPIs, prontidão, busca/filtros, lista, modal), botão da sidebar e card da Central de módulos.
- `central-ia.css` — estilos `bc-*` (mesma família visual da Central de IA) + a jornada `bc-jornada` exibida na Central de IA.
- `core/vide-context.js` — chave canônica `base-conhecimento-ia` e aliases.
- `firestore.rules` — `validConhecimentoData/Create/Update` + `match /base_conhecimento_ia/{id}`.
- `tests/base-conhecimento-ia.test.mjs` — 14 testes unitários.
- `tests/emulator/firestore-security.test.mjs` — suíte "base_conhecimento_ia: multi-tenant e validação".

## Coleção `base_conhecimento_ia/{id}` (id automático)

```js
{
  tenantId: "{storeUid}",      // imutável; == lojaId
  lojaId: "{storeUid}",
  tipo: "faq" | "empresa" | "politica" | "atendimento" | "manual" | "produto" | "documento" | "catalogo",
  titulo: "3–160 caracteres",
  conteudo: "1–8000 caracteres",
  resumo: "até 300 (opcional)",
  categoria: "até 80 (opcional — ex.: entrega, troca)",
  tags: ["até 10, cada uma até 40, minúsculas"],
  prioridade: "baixa" | "normal" | "alta" | "critica",
  status: "ativo" | "rascunho" | "arquivado",
  ativo: bool,                  // derivado de status == "ativo"
  criadoEm: serverTimestamp(),  // imutável
  criadoPor: "{authUid}",       // imutável
  atualizadoEm: serverTimestamp(),
  atualizadoPor: "{authUid}"
}
```

## Permissões

Chave canônica **`base-conhecimento-ia`**; aliases aceitos (frontend e Rules): `base_conhecimento_ia`, `conhecimento-ia`, `conhecimento_ia`, `knowledge-base`, `base-ia`.

| Papel | Acesso |
|---|---|
| Dono | ver + editar |
| Backend admin (claim) | ver + editar |
| Funcionário com "ver" | somente leitura (ações de edição não aparecem) |
| Funcionário com "editar" | ver + editar |
| Funcionário inativo / sem permissão | bloqueado (módulo invisível) |
| Outro tenant / anônimo | bloqueado |

`list()` só funciona com `where("tenantId", "==", storeUid)` — sem filtro é negado (testado).

## Regras (resumo)

- create: `canEditTenant(tenantId, "base-conhecimento-ia")` + validação completa + `criadoPor/atualizadoPor == request.auth.uid` + timestamps `== request.time`.
- update: mesma validação + `tenantId/lojaId/criadoPor/criadoEm` imutáveis.
- delete: **bloqueado** — arquivar (`status: "arquivado"`) é a exclusão lógica.
- Campos extras, enums inválidos, conteúdo acima do limite, timestamp manual e autoria falsa são rejeitados (testados no Emulator).

## Indicador de prontidão (0–100, transparente)

Critérios objetivos e pesos (somam 100): identidade da assistente 10, saudação 10, fallback 10, instruções 10, canal habilitado 5 (da `configuracoes_ia`); empresa 15, política 15, FAQ 15, 3+ conteúdos ativos 10 (do acervo). Faixas: 0–20 Incompleta · 21–50 Inicial · 51–75 Boa · 76–100 Preparada. A tela lista exatamente o que falta e quantos pontos cada pendência vale.

## Produtos para a IA (decisão registrada)

O tipo `produto`/`catalogo` permite descrever produtos manualmente hoje. A configuração **por referência** (usar todos os ativos / incluir/excluir IDs, sem copiar produtos) ficou para a próxima iteração — registrada em `docs/ROADMAP_RD3_STATUS.md` — para não criar uma segunda fonte de verdade sem a camada de leitura da futura IA definida.

## Como testar

```bash
pnpm run test:base-conhecimento   # unitários
pnpm run test:rules               # regras (inclui a suíte multi-tenant)
pnpm run test:all
```
