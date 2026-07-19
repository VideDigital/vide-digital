# Release Candidate Audit — Vide Hub V1

Data da auditoria: 2026-07-19.

Branch base: `main` após merge do PR #5.

Branch de trabalho: `feat/vide-hub-release-candidate-v1`.

## 1. Situação pós-merge do PR #5

- PR #5 confirmado como `MERGED`.
- Merge commit encontrado na `main`: `f0496fe feat(core): centralize auth tenant and permissions (#5)`.
- Arquivos do core de identidade/segurança presentes na `main`:
  - `core/vide-context.js`
  - `docs/VIDE_CONTEXT_ARCHITECTURE.md`
  - `docs/SECURITY_FINDINGS_PHASE_1.md`
  - `docs/FIREBASE_SECURITY_AUDIT.md`
  - `docs/WRITE_PERMISSION_AUDIT.md`
  - `tests/security-permission-harness.mjs`

## 2. Verificação pós-merge

| Item | Resultado |
|---|---|
| `login.html` importa `core/vide-context.js` | OK: import ESM direto no script module. |
| `dashboard.html` carrega o contexto antes do app | OK por contrato ESM: `dashboard-app.js` importa `core/vide-context.js` no topo antes de executar. |
| `admin.html` importa contexto | OK: importa `VIDE_SUPER_ADMIN_EMAIL` e `getAdminMembership`. |
| `usuarioUID` legado | OK: continua recebendo `contextoVide.effectiveUid || user.uid`. |
| Proprietário | OK por resolvedor: `effectiveUid/storeUid/ownerUid = authUid`. |
| Funcionário | OK por resolvedor: `effectiveUid/storeUid/ownerUid = funcionario.donoUID`. |
| Master | OK por resolvedor: preserva `authUid` e usa `targetUid/masterUID` como tenant operacional. |
| Planos | OK: `temFeature()` delega ao `VidePlanService` após plano real. |
| Landing Pages | OK: módulo canônico `landing-pages`. |
| Configurações x Studio | OK: `configuracoes` não concede `landing-pages` automaticamente. |
| Conflitos Git | Nenhum marcador de conflito encontrado. |
| Imports locais | Nenhum import local quebrado encontrado. |

Observação: há um marcador pendente pré-existente em `index.html` sobre domínio próprio; não foi introduzido nesta fase.

## 3. Inventário por módulo

| Módulo | Arquivos principais | Funções principais | Firestore/Storage | Permissão | Plano/feature | Estado RC |
|---|---|---|---|---|---|---|
| Dashboard/Cockpit | `dashboard.html`, `dashboard-app.js`, `dashboard-modules.css`, `business-modules.css` | `ativarAba`, `carregarCockpitReal`, `renderizarCentralOperacionalDashboard`, `renderizarLaunchCenterDashboard` | `usuarios`, `pedidos`, `leads`, `config/planos` | cockpit geral; métricas por `canView` | `hub`, `metricas` | Funcional com legado global; requer testes autenticados. |
| Produtos | `dashboard-app.js`, `loja.html` | `carregarProdutos`, submit do formulário, `executarAcaoMassaCatalogo` | `produtos`, `metricas_produtos` | `produtos` | limites por plano | CRUD protegido no frontend; duplicação de produto ainda não foi encontrada como função canônica. |
| Pedidos | `dashboard-app.js`, `loja.html` | `carregarPedidos`, `salvarPedido`, `moverPedidoFluxo`, `excluirPedido` | `pedidos`, `leads` indireto na loja pública | `pedidos` | `hub` | Funcional; histórico/arquivamento precisam de validação manual porque nem todas as funções estão explicitamente separadas. |
| Leads/CRM | `dashboard-app.js`, `lead-engine-v5.js`, `lead-engine-v5.css`, `leads-mobile-controller-v52.js`, `mobile-click-recovery-v1.js` | `carregarLeads`, `abrirPainelLead`, `fecharSuperficiesLeadsDashboard`, `moverLeadKanban`, ações em massa | `leads`, `chats`, `templates` | `leads` | `leads` sempre liberado no app atual | Modal V5 permanece autoridade; overlays foram estabilizados em fase anterior. |
| Automações de Leads | `dashboard-app.js` | `carregarAutomacaoLeads`, `aplicarStatusEmMassa`, `arquivarSelecionados`, `excluirPermanentemente` | `leads` | `leads` | `leads` | Ações em massa protegidas; precisa teste real com dados. |
| Campanhas | `dashboard-app.js`, `loja.html` | `salvarCampanha`, `verificarCampanha`, `enviarLeadPopup` | `campanhas`, `campanhas_historico`, `leads` | `campanhas` | `campanhas` | Funcional; popup público grava leads e métricas, depende de rules públicas seguras. |
| Notificações | `dashboard-app.js`, `admin.html` | `carregarNotificacoes`, `marcarNotificacaoLida`, `enviarNotificacao` | `notificacoes` | preferência do usuário / admin | sem feature específica | `lidoPor` usa `authUid`; envio é admin. |
| Funcionários | `dashboard-app.js`, `login.html`, `core/vide-context.js` | `salvarFuncionario`, `alternarStatusFuncionario`, `criarContaFuncionarioAuth` | `funcionarios`, Firebase Auth | `funcionarios` | `subcontas` | Funcional no frontend; criação segura exige Cloud Functions. |
| Configurações/Personalização | `dashboard-app.js`, `profile-prefill.js` | `executarSalvamento`, `montarPayloadCompleto`, `enviarSolicitacaoPersonalizacao` | `usuarios`, `vitrines_publicas`, `banners_loja`, `solicitacoes_customizacao` | `configuracoes` | temas/domínio conforme plano | Salva loja pública; troca de slug já evita remoção antes do novo doc. |
| Landing Pages | `dashboard-app.js`, `lp-public-v4.js`, `lp-public-v4.css` | `salvarLP`, `alternarPublicacaoLP`, `duplicarLP`, `excluirLP`, `render` público | `landing_pages`, `landing_pages_blocos`, públicas | `landing-pages` | `lp`, `lp1` | Permissão separada; renderer público preservado. |
| Studio | `studio-*.js/css`, `dashboard-app.js` | `salvarEditorLP`, `publicarEditorLP`, `renderizarEditorBlocos`, módulos V4/V6 | mesmas coleções de LP | `landing-pages` | `lp` | Funcional, mas tem múltiplos módulos legados ativos; evitar novas camadas. |
| Loja pública | `loja.html`, `lp-public-v4.js`, `lp-forms-v5.js` | `carregarConfiguracoesVitrine`, `irParaOferta`, carrinho, popup, chat | `vitrines_publicas`, `produtos`, `leads`, `metricas_*`, `chats` | público controlado por rules | plano da loja | Depende fortemente de rules para impedir writes indevidos. |
| Planos | `admin.html`, `dashboard-app.js`, `plan-preflight.js`, `core/vide-context.js` | `VidePlanService`, `temFeature`, `salvarConfiguracaoPlanos` | `config/planos`, `usuarios.plano`, `featuresManuais` | admin/config | plano real | Cache visual não autoriza escrita. |
| Métricas | `dashboard-app.js`, `loja.html` | `carregarMetricas`, `carregarCockpitReal`, writes públicos de métrica | `metricas_vitrines`, `metricas_produtos`, `pedidos`, `leads` | `metricas` e canView de fonte | `metricas`, `csv` | Precisa rules específicas para writes públicos limitados. |
| Admin | `admin.html`, `core/vide-context.js` | `getAdminMembership`, `carregarUsuarios`, `aprovarDireto`, `salvarConfiguracaoPlanos` | `usuarios`, `equipe_admin`, `config`, `notificacoes` | admin/equipe_admin | administrativo | Falha-fechada; precisa rules admin reais. |
| Modo Master | `dashboard-app.js`, `admin.html`, `core/vide-context.js` | `resolveVideHubIdentity`, `acessoRapidoMaster`, `copiarLinkMaster` | tenant alvo via `masterUID` | admin confirmado | plano da loja alvo | Preserva `authUid`; backend ainda precisa validar. |

## 4. Bugs e lacunas encontrados

| Prioridade | Item | Impacto | Status nesta fase |
|---|---|---|---|
| P0 | Rules propostas ainda não publicáveis | Isolamento real não comprovável até Emulator/staging | Propostas agora falham fechado e exigem migração. |
| P0 | Criação de funcionários pelo frontend | Rules finais restritivas quebram o fluxo atual sem Cloud Functions | Migração transicional documentada. |
| P0 | Writes públicos de métricas/leads/chat na loja | Tenant livre vindo do cliente cria risco de abuso/cross-tenant | Writes diretos bloqueados na proposta final; Functions obrigatórias. |
| P1 | Admin e Master dependem de backend | `equipe_admin` é UX; rules precisam custom claim real | Contrato `videAdmin` documentado como dependência. |
| P2 | Studio possui múltiplos módulos legados | Risco de regressão se empilhar hotfix | Congelar arquitetura e testar por fluxo. |
| P2 | Alguns recursos citados não têm função canônica clara | Duplicar produto, arquivamento formal de pedidos, histórico completo de pedidos | Mantido como backlog RC. |
| P3 | Marcador pendente pré-existente em domínio próprio | Melhoria futura | Não alterado. |

## 5. Dependências externas

- Firebase Auth.
- Firestore.
- GitHub Pages como hosting estático.
- CDNs de Tailwind, Chart.js, Lucide e Google Fonts.
- WhatsApp via `wa.me`.
- Navegador com suporte a módulos ESM.

## 6. Tabela central observada de planos

Tabela documentada a partir dos arrays presentes em `dashboard-app.js`/`admin.html`. Não altera preço nem regra comercial.

| Plano | Recursos observados | Limites observados | Observação |
|---|---|---|---|
| `starter` | `hub` | produtos padrão do código | plano base/fallback. |
| `basico` | `hub`, `popup` | definido em config ou fallback | início de campanhas/popup. |
| `essencial` | `hub`, `popup`, `carrinho`, `chat` | config ou fallback | loja com atendimento/carrinho. |
| `negocio` | essencial + `templates`, `cupons` | config ou fallback | recursos comerciais. |
| `profissional` | negócio + `campanhas`, `metricas`, `csv` | config ou fallback | marketing e análise. |
| `avancado` | profissional + `lp1`, `qrcode`, `temas` | config ou fallback | inclui LP limitada. |
| `pro` | avançado + `lp`, `chatbot` | config ou fallback | LP/Studio completo conforme feature. |
| `proplus` | pro + `ia`, `avaliacoes`, `agenda` | config ou fallback | automações avançadas. |
| `agencia` | proplus + `mapamental`, `subcontas` | config ou fallback | inclui funcionários/subcontas. |
| `enterprise` | agência + `api`, `relatorios` | config ou fallback | recursos enterprise. |
| `premium` | enterprise + `dominio`, `suporte_vip`, `onboarding` | config ou fallback | plano máximo observado. |

Regras RC:

- `localStorage` pode antecipar visualmente bloqueios, mas não autoriza escrita.
- `VidePlanService` recebe o plano real após Firestore.
- Funcionário herda plano do dono.
- Modo Master usa plano da loja alvo.
- Falha no Firestore deve ser segura e não liberar escrita premium.

## 7. Recomendação de RC

O projeto está apto a seguir como Release Candidate documental/técnico somente se o PR permanecer explícito sobre suas limitações. Ainda não deve ser considerado produção segura sem:

1. Firestore Rules revisadas e testadas.
2. Storage Rules revisadas e testadas.
3. Cloud Functions para operações administrativas sensíveis.
4. Teste autenticado real de owner, employee read-only, employee edit, admin e Master.
5. Validação de loja pública contra abuso de writes públicos.
6. Migração do frontend para remover writes sensíveis diretos.
