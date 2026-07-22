# Status do RD3 — ciclo "Spark Release"

Atualizado no ciclo que terminou no merge deste documento. Legenda: CONCLUÍDO · PARCIAL · NÃO INICIADO.

## CONCLUÍDO

| Entrega | Onde |
|---|---|
| Migração definitiva para Spark (zero dependência viva de Cloud Functions) | `docs/FIREBASE_SPARK_ARCHITECTURE.md` |
| Correção do bug real: formulários das LPs V4 chamavam Function inexistente (todo envio falhava) | `lp-public-v4.js` |
| Gestão de funcionários sem Functions (app secundário + regras dono-only) | `dashboard-app.js`, `firestore.rules` |
| Painel master (status/plano) por escrita direta com claim videAdmin + script de bootstrap | `admin.html`, `scripts/set-admin-claim.mjs` |
| Workflow "Deploy Firebase Spark" (só rules+storage+indexes; WIF ou chave; falha clara sem auth) | `.github/workflows/firebase-deploy.yml` |
| Base de Conhecimento da IA completa (CRUD, filtros, prontidão, permissões, testes) | `docs/RD3_BASE_CONHECIMENTO_IA.md` |
| Jornada de 4 etapas na Central de IA (com resumo real da Base) | `dashboard.html`, `central-ia.css` |
| Central de IA por loja (config da assistente) — ciclo anterior | `docs/CENTRAL_IA.md` |
| Central de Notificações com eventos reais + leitura segura — ciclo anterior | `docs/CENTRAL_NOTIFICACOES.md` |
| Chat da loja pública (widget) + resposta do dono/funcionário pelo painel — ciclo anterior | `loja.html`, `firestore.rules` (chats) |

## PARCIAL

| Entrega | Estado | Próximo passo |
|---|---|---|
| Central de Atendimento dedicada | O fluxo existe (widget público cria `chats`, painel responde), mas não há tela própria com 3 colunas, status de conversa (nova/aberta/resolvida...), atribuição a funcionário e contadores de não lidas | Evoluir o modelo `chats` existente (NÃO criar segunda coleção de conversas); adicionar campos status/atribuidoPara/naoLidas com regras próprias |
| Templates de atendimento | Existe o módulo "Templates" legado (mensagens de WhatsApp) | Integrar inserção de template na resposta do chat; variáveis permitidas ({{nome_cliente}}, {{nome_loja}}, {{nome_funcionario}}, {{numero_pedido}}) sem executar HTML |
| Produtos por referência para a IA | Tipo `produto`/`catalogo` manual na Base | Configuração incluir/excluir IDs sem copiar produtos |
| Onboarding (checklist "primeiros passos") | Existe versão do ciclo anterior no dashboard (4 etapas derivadas de dados reais) | Ampliar critérios (atendimento, IA, FAQ, funcionário) mantendo conclusão derivada de dados, nunca de clique |

## NÃO INICIADO

| Entrega | Observação |
|---|---|
| Anonymous Auth no chat público | Hoje a capability é o id aleatório do chat. Ativar Firebase Anonymous Auth é etapa EXTERNA (console); depois, vincular `visitorUid` ao `request.auth.uid` nas regras |
| Cloudflare Worker (IA real) | Contrato documentado em `docs/FIREBASE_SPARK_ARCHITECTURE.md`; nenhum provedor chamado |
| WhatsApp oficial | Depende do backend externo |
| Auditoria centralizada pós-Functions | `writeAudit` deixou de existir nas operações migradas |

## Bloqueios externos (fora do repositório)

1. **Secret de deploy ausente**: o job de deploy falha (com instrução clara) até existir `FIREBASE_SERVICE_ACCOUNT` ou o par `GCP_WORKLOAD_IDENTITY_PROVIDER`/`GCP_SERVICE_ACCOUNT` nos secrets do repositório.
2. **Claim videAdmin**: precisa ser concedida uma vez via `scripts/set-admin-claim.mjs` (Admin SDK local) para o painel master operar em produção.
3. **Regras em produção**: até o deploy das Rules atuais, os recursos novos (funcionários, base de conhecimento) ficam bloqueados em produção (as regras antigas negam as escritas).

## Próximas três prioridades reais

1. Publicar as Rules em produção (configurar secret → rodar o workflow) e conceder a claim videAdmin.
2. Central de Atendimento sobre o modelo `chats` existente (status, atribuição, não lidas, templates inseríveis).
3. Onboarding ampliado + configuração de produtos por referência para a IA.
