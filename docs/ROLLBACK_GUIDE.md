# Rollback Guide — Vide Hub V1

## Rollback antes do merge

Se o Pull Request ainda estiver em Draft ou aberto:

1. Não fazer merge.
2. Fechar o PR ou manter Draft.
3. Não apagar branches antigas até concluir diagnóstico.

## Rollback depois do merge

1. Identificar o commit de squash na `main`.
2. Criar uma branch de rollback a partir da `main`.
3. Executar `git revert <hash-do-squash>`.
4. Rodar testes mínimos.
5. Abrir PR de rollback em Draft.
6. Fazer merge controlado somente após validação.

## Rollback de Firebase

Esta branch não publica regras nem Functions.

Se regras propostas forem aplicadas manualmente em fase futura:

1. Exportar/copiar as regras atuais antes da alteração.
2. Aplicar em ambiente de teste primeiro.
3. Se houver falha, restaurar a versão anterior no Firebase Console.
4. Registrar horário, autor e impacto.

## Sinais de rollback imediato

- Login owner/admin quebrado.
- Loja pública inacessível.
- Cross-tenant visível.
- Escritas críticas negadas para owner aprovado.
- Funcionário leitura conseguindo escrever.
- GitHub Pages com erro global de JS.
