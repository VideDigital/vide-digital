# Quality Gate — QA autenticado e preparação de release

Este documento explica o gate de qualidade deste projeto: o que ele cobre, como rodar local (Windows e Linux) e no GitHub Actions, quais dados ele usa e quais limitações reais ainda existem — sem maquiar nenhuma delas.

## Objetivo

Confirmar, antes de qualquer release, que:

1. O código está sintaticamente correto (`pnpm run check`).
2. A lógica pura de cada módulo continua correta (`pnpm run test:unit`).
3. As Firestore/Storage Rules continuam protegendo o multi-tenant (`pnpm run test:security`).
4. O app carrega contra o Emulator Suite sem quebrar (`pnpm run test:frontend:emulator`).
5. **Login real, navegação e fluxos críticos funcionam num navegador de verdade** (`pnpm run test:ui:login` / `test:ui:flows` / `test:ui:responsive`) — a parte que faltava antes deste ciclo.

O Quality Gate **nunca faz deploy**. Deploy de produção continua manual, separado, em `.github/workflows/firebase-deploy.yml` ("Deploy Firebase Spark") — só ele publica `firestore.rules`, `storage.rules` e `firestore.indexes.json`, nunca Cloud Functions.

## Como rodar local

Pré-requisitos:

| Ferramenta | Versão | Por quê |
|---|---|---|
| Node.js | ≥ 22.13 | exigência do pnpm 11.9.0 |
| pnpm | 11.9.0 (fixo em `packageManager`) | gerenciador de pacotes do projeto |
| Java | 21 | Firestore Emulator (roda em JVM) |
| Playwright (Chromium) | instalado via `npx playwright install chromium` | testes de UI com login real |

```bash
pnpm install
pnpm exec playwright install chromium   # só na primeira vez / após trocar de máquina
pnpm run check                          # sintaxe
pnpm run test:unit                      # lógica pura, sem emulador
pnpm run test:security                  # Firestore + Storage Rules no Emulator
pnpm run test:frontend:emulator         # smoke via SDK, sem navegador
pnpm run test:ui:login                  # login real + 3 perfis (owner/editor/reader)
pnpm run test:ui:flows                  # Pedidos, Atendimento, Templates, CRM 360, Base de Conhecimento, Central de IA
pnpm run test:ui:responsive             # 5 viewports, telas principais
pnpm run test:all                       # check + unit + security + frontend:emulator (uso do dia a dia)
pnpm run test:release                   # test:all + toda a suíte de UI real (rodar antes de um release)
```

### Windows 10/11

Os testes de UI foram reescritos pra não depender de nada específico de Linux:

- servidor HTTP estático em Node puro (`node:http`), não Python;
- porta escolhida automaticamente pelo SO (`listen(0)`), nunca hardcoded;
- Playwright é devDependency real do projeto — resolve o Chromium via `PLAYWRIGHT_BROWSERS_PATH` (se definida) ou o cache padrão de `npx playwright install`, sem caminho absoluto no código.

No PowerShell/CMD, os mesmos comandos acima funcionam sem alteração (o Firebase CLI e o Node lidam com os caminhos automaticamente). Diferenças conhecidas: os emuladores do Firebase e o Playwright já são multiplataforma; não há nenhum script `.sh` neste gate.

### Linux / macOS

Mesma sequência de comandos acima.

## Como rodar no GitHub Actions

Workflow `.github/workflows/quality-gate.yml` (nome "Quality Gate"), separado do deploy. Dispara em `push` para `main`, em `pull_request` e manualmente (`workflow_dispatch`). Quatro jobs, em parte paralelos:

1. **static-and-unit**: `pnpm run check` + `pnpm run test:unit`.
2. **security**: `pnpm run test:rules` + `pnpm run test:functions` (validadores legados, nenhuma Function publicada).
3. **frontend-emulator**: `pnpm run test:frontend:emulator`.
4. **ui-login**: instala o Chromium (`pnpm exec playwright install --with-deps chromium`) e roda `test:ui:login` + `test:ui:flows` + `test:ui:responsive`. Em caso de falha, publica os diagnósticos (screenshot/HTML/JSON) como artifact `ui-diagnostics`.

O job `ui-login` está marcado `continue-on-error: true` — ver "Limitações reais" abaixo pra entender exatamente por quê, e o que fazer quando confirmar que ele passa de verdade em CI.

## Perfis seedados (`scripts/seed-emulator.mjs`)

Rodado automaticamente antes de cada suíte que usa o Emulator (`node scripts/seed-emulator.mjs --local-defaults`). Nunca toca produção: recusa rodar se `projectId` não for exatamente `demo-vide-hub`.

| Papel | E-mail | Senha | Permissões relevantes |
|---|---|---|---|
| Owner | `owner.pro@local.test` | `Local123!pro` | Tudo (dono do tenant `owner-pro`) |
| Editor | `employee.edit@local.test` | `Local123!edit` | ver+editar: produtos, leads, funcionarios, central-ia, atendimento, crm, pedidos, base-conhecimento-ia |
| Leitor | `employee.read@local.test` | `Local123!read` | só ver: os mesmos módulos do editor, sem editar |
| Funcionário inativo | `employee.inactive@local.test` | `Local123!inactive` | login não deve funcionar de verdade (status inativo) |
| Admin com claim | `admin.claim@local.test` | `Local123!admin` | `videAdmin: true` |
| Admin sem claim | `admin.doc.only@local.test` | `Local123!doc` | só documento, sem claim — não deve operar no painel master |

Dados seedados de apoio pros fluxos profundos: `clientes/cliente-local-1` (CRM), `chats/chat-local-1` com mensagem+evento (Atendimento), `templates/tpl-local-1` (Templates), `base_conhecimento_ia/kb-local-1` e `kb-local-2` (FAQ + produto por referência), `configuracoes_ia/owner-pro` (Central de IA), `pedidos/pedido-local-1` com itens estruturados.

## Estrutura dos testes de UI (`tests/emulator/ui/`)

- `_helpers.mjs` — servidor HTTP estático em Node puro, launch do Chromium, captura de diagnóstico (screenshot + HTML + texto visível + JSON com erros de console e URL), login real por seletor/URL/estado (nunca `waitForTimeout` como mecanismo principal de espera), presets de viewport.
- `login.smoke.mjs` — login do owner, dashboard carrega sem erro de JS.
- `profiles.smoke.mjs` — 3 perfis × 9 views principais, valida `ativarAba()` (o gate real de permissão do app) em vez de só olhar se o botão de menu está visível.
- `pedidos.flow.mjs` — fluxo completo de criação de pedido: cliente, busca de produto, item estruturado, quantidade, subtotal, edição manual de texto livre e valor não sobrescrita, prazo de entrega, criação, status inicial, mudança de status.
- `atendimento-templates.flow.mjs` — selecionar conversa, responder, mudar status, usar template, gestão de templates (criar).
- `crm-base-ia.flow.mjs` — CRM 360 (busca, drawer, observação, tag, status), Base de Conhecimento (FAQ e produto por referência), Central de IA (salvar config, confirmar persistência após reload, seletor de modo de resposta).
- `responsive.smoke.mjs` — 5 viewports (1440×900, 1366×768, 768×1024, 390×844, 360×640) × 5 telas, checando overflow horizontal e a coluna de mensagens do Atendimento rolando internamente (regressão do bug real corrigido na Fase 21 de `docs/HISTORICO_EVENTOS_ATENDIMENTO.md`).

## Como depurar uma falha de login/UI

Toda falha nos testes de `tests/emulator/ui/` grava em `test-results/ui-diagnostics/` (ignorado pelo git):

- `<label>-<timestamp>.png` — screenshot de tela cheia no momento da falha;
- `<label>-<timestamp>.html` — HTML completo da página no momento da falha;
- `<label>-<timestamp>.json` — URL atual, erros de console capturados, texto visível na página e timestamp.

Primeiro passo sempre: abrir o `.json` e ler `erros` — se aparecer `net::ERR_TUNNEL_CONNECTION_FAILED` ou similar apontando pra `gstatic.com`/`googleapis.com`, é bloqueio de rede do próprio ambiente, não bug do app (ver seção seguinte).

## Como confirmar que não conectou à produção

- `seed-emulator.mjs` recusa rodar fora de `projectId === "demo-vide-hub"`.
- `firebase-init.js#shouldUseVideEmulators()` só conecta ao Emulator se `?useEmulator=true` (ou `localStorage.videUseEmulator`) **E** o hostname for `localhost`/`127.0.0.1`/`::1` — nunca em produção (domínio real).
- Os testes de UI sempre navegam pro servidor local (`http://localhost:<porta livre>`) com `?useEmulator=true` na primeira carga.
- Nenhum teste referencia `vide-digital-saas` (projeto de produção) em nenhum momento.

## Limitações reais (sem maquiar)

- **`test:ui:login` / `test:ui:flows` / `test:ui:responsive` foram escritos e revisados linha por linha contra os seletores reais do código-fonte, mas NÃO foram confirmados passando de ponta a ponta na sessão em que foram escritos.** O motivo é específico e documentado: o sandbox de desenvolvimento usado bloqueia por política de egress o host `www.gstatic.com` (confirmado via `curl -x $HTTPS_PROXY https://www.gstatic.com` retornando `403` de política, não timeout) — e o app carrega o SDK do Firebase direto desse CDN. Sem esse host acessível, a tela de login nem chega a inicializar o listener do formulário, então qualquer teste que dependa de autenticação real falha ali, sempre, não importa o que o teste faça. Isso foi confirmado, não é suposição: o harness (servidor Node, Playwright, Emulators, seed) funciona corretamente até esse ponto exato — os diagnósticos capturados mostram a página de login renderizada normalmente, só sem o SDK carregado.
- **O que isso significa na prática**: rode `pnpm run test:ui:login` num ambiente que alcance `www.gstatic.com` livremente (qualquer runner GitHub Actions padrão, qualquer máquina de desenvolvimento sem proxy corporativo bloqueando CDNs do Google) antes de confiar no resultado. Se passar lá, os seletores estavam certos; se falhar por outro motivo, é um bug real pra corrigir — e agora existe diagnóstico completo (screenshot + HTML + erros de console) pra isso.
- **`ui-login` no workflow está com `continue-on-error: true`** justamente por essa incerteza — ele não bloqueia o merge sozinho até ser confirmado verde pelo menos uma vez em CI real. Depois de confirmado, trocar `continue-on-error: true` por `false` no `.github/workflows/quality-gate.yml` é a única mudança necessária pra torná-lo bloqueante.
- **Não existe edição completa de um pedido já criado** — só criação (modal) e mudança de status (select no card / drag-and-drop). `pedidos.flow.mjs` não testa "editar pedido" porque essa funcionalidade não existe; documentado aqui em vez de fingido como testado.
- Os fluxos profundos (Fase 8-12 do mandato original) cobrem o núcleo de cada módulo, não literalmente cada sub-passo listado no mandato — profundidade real, mas escopo deliberadamente contido pra caber num ciclo de trabalho.
- Testes de UI ainda não cobrem tenant cruzado via navegador (isso já é coberto, com mais precisão, pela suíte de Rules em `tests/emulator/firestore-security.test.mjs` — testar "não lê dado de outro tenant" via Rules diretamente é mais confiável do que tentar simular via UI).

## Diferença entre `test:all` e `test:release`

- `test:all`: sintaxe + testes unitários + Rules + smoke de frontend (SDK). Rápido o suficiente pro dia a dia.
- `test:release`: tudo do `test:all` **mais** a suíte completa de UI com login real (login, perfis, fluxos profundos, responsividade). Rodar antes de qualquer release — é mais lento e depende de reachability real do Firebase CDN (ver limitações acima).
