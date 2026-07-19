# Release Candidate Test Plan — Vide Hub V1

## 1. Smoke documental

Executar a cada rodada de RC:

```powershell
git diff --check
node --check tests/release-candidate-harness.mjs
node tests/release-candidate-harness.mjs
```

Esse harness valida presença de documentos e contratos estáticos por string. Ele não valida:

- Firebase Rules;
- Auth;
- isolamento multi-tenant;
- Storage;
- Cloud Functions;
- UI;
- segurança real.

## 2. Syntax validation

Validar, quando as ferramentas estiverem instaladas:

```powershell
node --check core/vide-context.js
node --check dashboard-app.js
node --check tests/security-permission-harness.mjs
node tests/security-permission-harness.mjs
```

Também validar:

- extração e `node --check` dos scripts module de `login.html` e `admin.html`;
- parser HTML simples em `login.html`, `dashboard.html`, `admin.html`, `loja.html`;
- busca por IDs duplicados;
- imports locais quebrados;
- arquivos referenciados inexistentes;
- marcadores de conflito;
- `debugger`;
- TODO/placeholders introduzidos;
- logs temporários introduzidos fora de harness;
- URLs locais;
- caminhos locais;
- caracteres Unicode de controle perigosos.

## 3. Emulator rules tests

Antes de publicar rules, usar Firebase Emulator Suite com projeto fake, por exemplo `demo-vide-hub`.

Firestore mínimo:

- owner cria cadastro pendente válido;
- owner não cria cadastro aprovado;
- owner não define plano premium;
- owner edita perfil permitido;
- owner não altera `status`, `plano` ou `featuresManuais`;
- employee ativo lê tenant do dono;
- employee inativo é bloqueado;
- employee read-only não escreve;
- employee edit escreve módulo permitido;
- employee não altera `donoUID`;
- employee não altera as próprias permissões;
- employee não acessa outro tenant;
- usuário sem claim admin é bloqueado;
- admin com claim executa ação prevista;
- `equipe_admin` sem claim não recebe privilégio backend;
- público lê vitrine publicada;
- público não altera vitrine;
- público não toma documento mudando `donoUID`;
- público não cria lead diretamente;
- público não incrementa métricas diretamente;
- público não escreve `sender: "admin"`;
- público não acessa dados privados;
- usuário não marca notificação de outro tenant;
- usuário não altera campos de notificação.

Storage mínimo:

- owner envia imagem válida;
- bloqueia tipo inválido;
- bloqueia tamanho excedido;
- bloqueia SVG;
- bloqueia JS/HTML;
- employee autorizado envia apenas path correspondente;
- employee read-only não envia;
- cross-tenant bloqueado;
- público não envia.

## 4. Integração autenticada

Executar em staging com usuários reais ou seeds controlados:

| Cenário | Resultado esperado |
|---|---|
| Owner aprovado | Acessa e edita módulos do próprio tenant conforme plano. |
| Owner pendente/inativo | Login bloqueado com mensagem clara. |
| Funcionário ativo leitura | Visualiza módulos em `permissoes.ver`, não grava. |
| Funcionário ativo edição | Grava apenas módulos em `permissoes.editar`. |
| Funcionário inativo | Login bloqueado. |
| Funcionário sem `donoUID` | Login bloqueado. |
| Admin com claim | Acessa admin e modo Master. |
| Membro `equipe_admin` sem claim | UX pode listar, mas backend não deve conceder privilégio. |
| Usuário comum com `masterUID` | Bloqueado. |
| Funcionário com `masterUID` | Bloqueado. |

## 5. Fluxos manuais por módulo

### Dashboard

1. Abrir dashboard.
2. Confirmar sidebar, cockpit, cards e loader.
3. Recarregar página.
4. Alternar todas as abas e voltar ao Dashboard 20 vezes.
5. Confirmar que aba salva sem permissão não abre.
6. Confirmar que métricas de pedidos/leads somem para funcionário sem permissão.

### Produtos

1. Criar produto físico.
2. Criar produto digital.
3. Editar imagem, preço, estoque, categoria e destino.
4. Salvar como rascunho.
5. Publicar/despublicar via ação em massa.
6. Excluir individual e em massa.
7. Confirmar loja pública atualizada.

### Pedidos

1. Criar pedido manual.
2. Alterar status por botão e drag.
3. Filtrar por período.
4. Excluir.
5. Testar funcionário somente leitura.

### Leads/CRM

1. Abrir lista.
2. Abrir modal Lead V5.
3. Editar anotação/campo/follow-up.
4. Mover Kanban.
5. Executar ações em massa.
6. Arquivar, mover lixeira, restaurar e excluir.
7. Confirmar ausência de overlays duplicados.

### Funcionários

1. Criar funcionário no frontend atual.
2. Alterar permissões.
3. Desativar/reativar.
4. Tentar autoelevação.
5. Validar login com leitura e edição.
6. Repetir após migração para Cloud Functions.

### Landing Pages/Studio

1. Criar LP.
2. Abrir Studio.
3. Adicionar/editar blocos.
4. Salvar.
5. Publicar/despublicar.
6. Duplicar/excluir.
7. Confirmar renderer público.
8. Confirmar que `configuracoes` sem `landing-pages` não edita Studio.

### Loja pública

1. Abrir `loja.html?loja={slug}`.
2. Confirmar produtos, imagens, WhatsApp, carrinho, entrega/retirada e redes.
3. Enviar lead por botão e popup.
4. Testar slug inexistente e loja inativa.
5. Confirmar isolamento entre slugs.
6. Repetir depois que leads/métricas/chat passarem por Functions.

### Admin/Master

1. Entrar no `admin.html`.
2. Aprovar/rejeitar/suspender usuário.
3. Alterar plano.
4. Entrar em modo Master.
5. Sair do modo Master.
6. Confirmar que `authUid` permanece admin e `storeUid` vira loja alvo.
7. Repetir com custom claim `videAdmin`.

## 6. Viewports

- Desktop: 1366x768, 1440x900, 1920x1080.
- Tablet: 768x1024.
- Mobile smoke congelado: 390x844, 430x932.

## 7. Critérios para produção

- Nenhum P0 aberto.
- Nenhuma escrita crítica depende só de frontend.
- Firestore/Storage Rules passam no Emulator.
- Owner/employee/admin passam em staging.
- Loja pública validada contra abuso de writes públicos.
- Rollback testado.
- Backup/export realizado antes de Firebase.
