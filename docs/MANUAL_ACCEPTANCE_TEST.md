# Manual Acceptance Test — Vide Hub V1

Este roteiro é para validação local/staging. Não use credenciais reais de produção.

## 1. Instalar

1. Abra o repositório.
2. Execute `npm install`.
3. Execute `cd functions`.
4. Execute `npm install`.
5. Volte para a raiz do projeto.

## 2. Iniciar Emulator

1. Execute `npm run emulators`.
2. Abra a Emulator UI em `http://127.0.0.1:4000`.
3. Use o projectId local `demo-vide-hub`.
4. Não conecte ao projeto Firebase real.

## 3. Abrir o sistema local

1. Inicie um servidor estático local para os arquivos HTML.
2. Abra `login.html?useEmulator=true`.
3. Para usar Functions Emulator, mantenha `useEmulator=true` ou defina `localStorage.videUseEmulator = "true"` em localhost.

## 4. Contas de teste locais

Crie no Authentication Emulator:

- owner aprovado;
- owner pendente;
- funcionário leitura;
- funcionário edição;
- funcionário inativo;
- admin com custom claim `videAdmin: true`.

## 5. Owner

1. Criar owner pelo cadastro.
2. Confirmar que nasce como `status: pendente`.
3. Aprovar localmente via admin/seed.
4. Fazer login.
5. Confirmar Dashboard, Produtos, Pedidos, CRM e Configurações.
6. Tentar alterar plano/status via UI normal: não deve existir fluxo de autoelevação.

## 6. Funcionários

1. Como owner, criar funcionário.
2. Confirmar documento `funcionarios/{uid}` com `donoUID` correto.
3. Criar perfil read-only.
4. Confirmar que read-only vê módulos permitidos e não grava.
5. Criar perfil com edição.
6. Confirmar gravação apenas nos módulos permitidos.
7. Desativar funcionário.
8. Confirmar que o login/uso é bloqueado.

## 7. Admin

1. Entrar como usuário com claim `videAdmin: true`.
2. Aprovar, rejeitar e suspender owner local.
3. Alterar plano e features.
4. Sincronizar membro de equipe admin.
5. Confirmar que membro sem claim não tem privilégio backend.

## 8. Master Mode

1. Entrar como admin.
2. Abrir `dashboard.html?masterUID={uidOwner}`.
3. Confirmar banner/estado visual de Master Mode.
4. Confirmar que `authUid` segue admin e `ownerUid/effectiveUid` vira loja alvo.
5. Sair do Master Mode e recarregar.

## 9. Produtos e pedidos

1. Criar produto.
2. Publicar/rascunhar.
3. Excluir produto de teste.
4. Criar pedido manual.
5. Mover status.
6. Excluir pedido de teste.

## 10. CRM e Leads

1. Abrir Leads.
2. Abrir detalhe de lead.
3. Editar anotação, status, follow-up e responsável.
4. Confirmar ausência de overlays invisíveis.
5. Repetir troca de abas 20 vezes.

## 11. Loja pública

1. Abrir `loja.html?loja={slug}&useEmulator=true`.
2. Confirmar produtos.
3. Clicar em oferta.
4. Confirmar lead criado via `createPublicLead`.
5. Confirmar métrica via `incrementPublicMetric`.
6. Testar popup.
7. Testar chat público.
8. Confirmar que sender público é sempre `cliente`.

## 12. Landing Pages e Studio

1. Criar Landing Page.
2. Abrir Studio.
3. Adicionar blocos.
4. Salvar.
5. Publicar.
6. Abrir renderer público.
7. Enviar formulário.
8. Confirmar lead via Function.

## 13. Notificações

1. Enviar notificação como admin.
2. Ler como usuário de destino.
3. Confirmar que usuário não altera conteúdo.
4. Registrar qualquer falha do modelo `lidoPor`; ele está listado como limitação conhecida.

## 14. Erros esperados

- Sem Functions Emulator, chamadas sensíveis retornam erro.
- Sem App Check em produção, endpoints públicos não devem ser publicados.
- Sem custom claim, admin backend deve falhar fechado.

## 15. Como registrar bug

Registre:

- URL;
- conta/perfil usado;
- passos;
- resultado esperado;
- resultado obtido;
- print;
- erro do console;
- horário.

## 16. Parar Emulator

Use `Ctrl+C` no terminal.

## 17. Limpar apenas dados locais

Use a Emulator UI ou reinicie os emuladores sem export/import. Não rode comandos contra produção.
