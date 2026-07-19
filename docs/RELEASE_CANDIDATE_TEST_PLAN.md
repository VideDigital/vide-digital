# Release Candidate Test Plan — Vide Hub V1

## 1. Checks automatizados obrigatórios

Executar a cada rodada de RC:

```powershell
git diff --check
node --check core/vide-context.js
node --check dashboard-app.js
node --check tests/security-permission-harness.mjs
node tests/security-permission-harness.mjs
node tests/release-candidate-harness.mjs
```

Também validar:

- extração e `node --check` dos scripts module de `login.html` e `admin.html`;
- parser HTML simples em `login.html`, `dashboard.html`, `admin.html`, `loja.html`;
- busca por IDs duplicados;
- imports locais quebrados;
- arquivos referenciados inexistentes;
- marcadores de conflito;
- depuradores temporários;
- marcadores pendentes introduzidos;
- logs temporários introduzidos fora de harness;
- URLs locais de desenvolvimento;
- caminhos locais;
- caracteres Unicode de controle perigosos.

## 2. Matriz de identidade/permissão

| Cenário | Resultado esperado |
|---|---|
| Owner aprovado | Acessa e edita todos os módulos da própria loja conforme plano. |
| Owner pendente/inativo | Login bloqueado com mensagem clara. |
| Funcionário ativo leitura | Visualiza módulos em `permissoes.ver`, não grava. |
| Funcionário ativo edição | Grava apenas módulos em `permissoes.editar`. |
| Funcionário inativo | Login bloqueado. |
| Funcionário sem `donoUID` | Login bloqueado. |
| Admin principal | Acessa `admin.html` e modo Master. |
| Membro `equipe_admin` | Acessa áreas admin permitidas. |
| Usuário comum com `masterUID` | Bloqueado. |
| Funcionário com `masterUID` | Bloqueado. |

## 3. Fluxos manuais por módulo

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

1. Criar funcionário.
2. Alterar permissões.
3. Desativar/reativar.
4. Tentar autoelevação.
5. Validar login com leitura e edição.

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

### Admin/Master

1. Entrar no `admin.html`.
2. Aprovar/rejeitar/suspender usuário.
3. Alterar plano.
4. Entrar em modo Master.
5. Sair do modo Master.
6. Confirmar que `authUid` permanece admin e `storeUid` vira loja alvo.

## 4. Viewports

- Desktop: 1366x768, 1440x900, 1920x1080.
- Tablet: 768x1024.
- Mobile smoke: 390x844, 430x932.

## 5. Critérios para produção

- Nenhum P0 aberto.
- Nenhuma escrita crítica sem rule backend planejada/testada.
- Owner/employee/admin testados com usuários reais ou emulador.
- Loja pública validada com slug real e slug inexistente.
- Rollback documentado.
