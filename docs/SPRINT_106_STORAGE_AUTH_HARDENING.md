# Storage: aprovação do tenant e bloqueio de sincronização

## Problema e comportamento

As Rules anteriores permitiam que um UID proprietário gravasse/excluísse arquivos e lesse PDFs privados sem documento de owner aprovado. Funcionários ativos com permissão mantinham escrita durante `authSyncPendente: true` ou quando o owner estava suspenso/ausente. Firestore Rules e o contexto das Callables já possuem gates de aprovação/sincronização, mas não protegem automaticamente o serviço Storage.

`storage.rules` exige `usuarios/{ownerUid}` existente com `status == "aprovado"` para operações administrativas de owner/funcionário e leitura privada de owner. Funcionário também exige documento existente, status ativo, `donoUID` string idêntico ao caminho e permissão editar no módulo. Ausência da flag é legada e aceita; false é aceito; true e tipos malformados são negados.

Decisão explícita de tipos: Firestore Rules e Functions atuais comparam a flag com true e não rejeitam todos os tipos inesperados. Storage aceita somente ausência ou false. É um endurecimento para documentos malformados, sem mudança em Firestore/Functions, sem migração e sem bloquear documentos legados válidos. Não é uma afirmação de equivalência exata das políticas para dados inválidos.

O bypass existente exige claim booleana `videAdmin: true`; não se criam claims, autoridade por payload/e-mail ou novos perfis. Admin é avaliado antes das consultas de tenant. Os limites de MIME/tamanho continuam aplicados a uploads administrativos.

## Contratos preservados

| Caminho em `stores/{ownerUid}` | Leitura | Edição de funcionário | Limite |
|---|---|---|---|
| products/{productId}/{fileName} | Pública | produtos | 5 MiB, imagem |
| profile/{fileName} | Pública | configuracoes | 2 MiB, imagem |
| banners/{fileName} | Pública | configuracoes | 6 MiB, imagem |
| landing-pages/{pageId}/{fileName} | Pública | landing-pages | 5 MiB, imagem |
| digital-products/{productId}/{fileName} | Owner aprovado/admin | produtos | 50 MiB, PDF |

Imagens: JPEG/PNG/WebP/GIF, nunca SVG/HTML/JS. Tamanho deve ser maior que zero. DELETE não depende de um recurso de upload. Catch-all continua negando acesso. Funcionários/visitantes não recebem leitura privada. Não há implementação de licença/comprador.

`core/vide-storage.js` mantém caminhos e formatos; nenhum consumidor ativo desse helper foi identificado na busca por HTML/JS. O dashboard mantém imagens em base64. Não se alteram UI, Functions, Auth, Firestore Rules ou dados. Isso não certifica consumidores externos/antigos não inventariados.

## Consultas e limites

Owner consulta `usuarios/{ownerUid}`. Funcionário consulta esse owner e `funcionarios/{auth.uid}`: no máximo dois documentos distintos da base default. Não se consulta um terceiro `usuarios/{auth.uid}` para funcionários. Existência precede leitura de data; dados são passados a helpers para evitar repetição de campos via novas buscas. Admin e leituras públicas não dependem desses documentos.

A documentação oficial permite até dois documentos Firestore por avaliação de Storage e informa que leituras contam em quota/cobrança: [condições com Firestore](https://firebase.google.com/docs/storage/security/rules-conditions#enhance_with_firestore). O Emulator valida compilação e comportamento, não mede cobrança real. Sem índice novo: consultas são por ID. A integração cross-service já existe nas Rules anteriores; não se alteram IAM/Secrets nesta PR.

## Regressões reproduzíveis

Somente `demo-vide-hub` e Emulators locais. Com dependências instaladas:

```sh
pnpm run test:rules
pnpm run test:functions
```

O script existente de Rules já executa `storage-security.test.mjs`, que importa o novo helper. Nenhuma edição de workflow/package/timeout é necessária. Os cinco testes anteriores são preservados, acrescentando apenas owner aprovado às fixtures de sucesso.

`storage-auth-matrix.mjs` executa 557 verificações com SDK real: vinte perfis, cinco caminhos, READ/LIST/CREATE/UPDATE/DELETE, limites, MIME e catch-all. São os mesmos 557 casos de autorização da auditoria, consolidados em um teste. A política esperada não muda entre RED e GREEN. Negativas exigem `storage/unauthorized`; objeto inexistente e erro de infraestrutura não contam como acesso negado.

Outra matriz de 279 verificações testa owners desconhecidos/sem status, funcionário ausente, tipos inválidos de flag/tenant/permissões, tenant pendente/rejeitado e transição de suspensão com o mesmo cliente autenticado. Não há chamada Gemini, produção ou Auth administrativo real. Contextos/claims de teste são sintéticos. Arquivos forenses, logs e snapshots locais não pertencem à PR.

Resultado local: RED da matriz principal com Rules anteriores, 130 divergências em 557; GREEN com a correção, zero divergências em 557 e zero nas 279 verificações adicionais. Os cinco testes preexistentes permanecem verdes. Os logs de execução e o relatório completo são evidências locais, não dados embutidos na PR.

## Limites e implantação futura

Correção não é deploy. As Rules publicadas anteriormente continuam com as lacunas até uma publicação separadamente autorizada; presença dessas cláusulas foi observada na auditoria, mas não se comprovou exploração ou dano real. Não se testou produção nesta implementação.

URLs de download com token são um contrato separado: endurecer autorização do SDK não deve ser apresentado como revogação de links já distribuídos. O helper solicita URL após upload inclusive para PDF, apesar de funcionário não poder ler esse PDF. Esse risco de contrato/distribuição permanece documentado, sem abrir permissões nem alterar tokens/objetos para resolvê-lo nesta PR.

Antes de publicação futura: revisão/QG no HEAD final, merge autorizado e QG da main, inventário atualizado, compatibilidade de consumidores antigos e autorização exclusiva de Storage Rules. Guardar ruleset anterior e critérios de interrupção. Reverter Rules reabre os B1; não recupera identidades nem sincroniza Auth/Firestore. Não limpar flags nem alterar contas como rollback implícito.

O bloqueio RPC/capacidade da #119, dependências WhatsApp, transição entre revisões e NO-GO de deploy da Sprint 106 permanecem independentes. Esta PR não incorpora #116–#119 e não desbloqueia seus workflows. **Sem autorização de merge ou publicação.**
