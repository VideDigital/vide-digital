# Rollback Guide — Vide Hub V1

## Rollback antes do merge

Se o Pull Request ainda estiver em Draft ou aberto:

1. Não fazer merge.
2. Corrigir o PR ou mantê-lo Draft.
3. Não apagar branches antigas até concluir diagnóstico.

## Rollback depois do merge frontend

1. Identificar o commit de squash na `main`.
2. Criar uma branch de rollback a partir da `main`.
3. Executar `git revert <hash-do-squash>`.
4. Rodar testes mínimos.
5. Abrir PR de rollback em Draft.
6. Fazer merge controlado somente após validação.
7. Aguardar GitHub Pages e validar cache/domínio.

## Rollback de Firestore Rules

Esta branch não publica rules.

Se rules forem aplicadas em fase futura:

1. Restaurar a cópia das rules anteriores.
2. Validar login owner/admin/employee.
3. Validar loja pública.
4. Monitorar erros `permission-denied`.
5. Registrar horário, autor e impacto.

## Rollback de Storage Rules

1. Restaurar rules anteriores salvas.
2. Validar leitura pública de imagens.
3. Validar upload owner/employee quando existir.
4. Verificar se deletes ou writes ficaram bloqueados indevidamente.

## Rollback de Cloud Functions

1. Reimplantar versão anterior conhecida.
2. Desativar endpoints novos se estiverem causando abuso.
3. Revogar refresh tokens quando permissões/custom claims forem revertidas.
4. Orientar usuários afetados a renovar sessão.
5. Validar filas/retries/idempotência antes de repetir operações.

## Dados e índices

- Fazer export/backup antes de mudanças Firebase.
- Não apagar dados como rollback primário.
- Índices podem continuar construindo após rollback de código; não prometer reversão instantânea.
- Se houver corrupção de dados, restaurar de backup/export em procedimento separado e aprovado.

## Sinais de rollback imediato

- Login owner/admin quebrado.
- Loja pública inacessível.
- Cross-tenant visível.
- Escritas críticas negadas para owner aprovado.
- Funcionário leitura conseguindo escrever.
- GitHub Pages com erro global de JS.
- Aumento anormal de `permission-denied`, custos ou invocações públicas.
