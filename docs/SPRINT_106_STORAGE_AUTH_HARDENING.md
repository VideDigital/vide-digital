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

`storage-auth-matrix.mjs` preserva as 557 verificações originais e adiciona 100 UPDATE de metadados: 657 verificações com SDK real. Vinte perfis, cinco caminhos, READ/LIST/CREATE/sobrescrita/UPDATE/DELETE, limites, MIME e catch-all. A política esperada não muda entre RED e GREEN. Negativas exigem `storage/unauthorized`; objeto inexistente e erro de infraestrutura não contam como acesso negado.

Outra matriz preserva 279 verificações de owners desconhecidos/sem status, funcionário ausente, tipos inválidos de flag/tenant/permissões, tenant pendente/rejeitado e transição com o mesmo cliente. Acrescenta 55 UPDATE de metadados, totalizando 334. Não há Gemini, produção ou Auth administrativo real. Contextos/claims são sintéticos. Arquivos forenses, logs e snapshots locais não pertencem à PR.

Resultado local: RED da matriz principal com Rules anteriores, 130 divergências em 557; GREEN com a correção, zero divergências em 557 e zero nas 279 verificações adicionais. Os cinco testes preexistentes permanecem verdes. Os logs de execução e o relatório completo são evidências locais, não dados embutidos na PR.

### Correção das lacunas B2 da revisão adversarial

Os resultados 557/279 acima são históricos. O antigo rótulo UPDATE designava sobrescrita com `uploadBytes`: firebase-tools 13.35.1 avalia esse upload como CREATE, mesmo com objeto existente (`storage/files.js`, `uploadObject`). `updateObjectMetadata` usa UPDATE. Não foi atribuída a esse experimento uma causa de produção nem afirmado que versões diferentes tenham a mesma semântica.

Antes de carregar as Rules do produto, um discriminante serial carrega duas políticas temporárias na instância exclusiva do CLI Emulator: CREATE sim/UPDATE não e inversa. Sobrescrita segue CREATE e `updateMetadata` segue UPDATE; bytes/metadados observados distinguem aceitação e negativa. Ambas as políticas são exercitadas antes da matriz; nenhuma Rule temporária é publicada ou carregada em instância compartilhada. Não executar este arquivo contra um Emulator já utilizado por outra suíte. O CLI cria e encerra a instância, e o script `test:rules` executa arquivos sequencialmente.

As cinco famílias atuais compartilham a mesma condição CREATE/UPDATE. A matriz mantém a sobrescrita e acrescenta UPDATE real via `updateMetadata` a todos os 31 perfis, inclusive admin/claim falsa e estados malformados. CREATE exige ausência inicial; sobrescrita e UPDATE exigem objeto existente. Negativa preserva estado completo; sobrescrita permitida altera bytes; UPDATE permitido altera metadado sintético e preserva bytes. A documentação oficial descreve a [atualização de metadados](https://firebase.google.com/docs/storage/web/file-metadata); a classificação foi comprovada no runtime instalado pelo discriminante, não inferida do nome da API.

| Operação na matriz | Principal | Malformados/transição | Total |
|---|---:|---:|---:|
| READ | 100 | 57 | 157 |
| LIST | 100 | 55 | 155 |
| CREATE novo | 100 | 56 | 156 |
| Sobrescrita de bytes, avaliador CREATE | 100 | 55 | 155 |
| UPDATE de metadados, avaliador UPDATE | 100 | 55 | 155 |
| DELETE | 100 | 56 | 156 |
| CREATE tamanho/MIME/catch-all | 57 | 0 | 57 |
| Total de decisões de autorização | 657 | 334 | 991 |

As 836 anteriores permanecem; 155 novas decisões UPDATE não são apenas renomeação. Há também 775 assertions de integridade nas 155 combinações perfil/caminho (cinco por combinação), separadas das decisões: ausência antes de CREATE, estado após CREATE, integridade da sobrescrita e dois checks de UPDATE. Essas contagens não são testes adicionais de `node:test`. O discriminante tem seis decisões de autorização em hook separado (upload novo, sobrescrita e metadata em duas políticas), não incluídas nas 991.

`rules-unit-testing` 4.0.1 `clearStorage` lista apenas `items` na raiz do bucket default `demo-vide-hub`, ignorando `prefixes`. O controle negativo recria exatamente os oito paths históricos em `stores/qaA` e `stores/missing`, inventaria bucket/tamanho/MIME/generation/metageneration e timestamps, chama a biblioteca instalada e comprova oito objetos restantes. A nova limpeza verifica oito ausências por getMetadata, árvore vazia e preservação de um sentinel fora dos prefixos. Repete duas vezes, inclusive passando por assertion falha e finally. A suíte completa pode ser repetida em instância nova para confirmar inicialização limpa.

Nos cenários normais, cada fixture aloca bucket sintético UUID exclusivo, preservando o formato real dos paths. O helper nunca apaga a raiz do bucket: remove recursivamente apenas os prefixos alocados, após guards de projeto `demo-vide-hub`, hosts locais, bucket exato e prefixos próprios. A exceção explícita do controle histórico aceita somente bucket default e os dois prefixos fixos; exige inventário inicialmente vazio. Nenhum bucket de produção é aceito. `afterEach` limpa mesmo em falha; exclusão é seguida de listagem sem items/prefixes e consulta independente de ausência a cada objeto inventariado. Cleanup malsucedido falha o teste. O sentinel sintético é excluído individualmente somente ao terminar sua verificação.

Limites: uma interrupção forçada de processo/OS não executa finally; as instâncias são efêmeras sem export e não se promete cleanup após SIGKILL. A suíte usa reset Firestore global já existente e exige instância exclusiva e execução serial; não é apropriada para conexão paralela a Emulator compartilhado. Não se prova que sobrescrita use o ramo UPDATE em produção: o teste de bytes comprova o upload observado no Emulator; o teste de metadata comprova UPDATE. Nenhuma dependência/timeout/Rule de produto foi alterada para obter verde.

## Limites e implantação futura

Correção não é deploy. As Rules publicadas anteriormente continuam com as lacunas até uma publicação separadamente autorizada; presença dessas cláusulas foi observada na auditoria, mas não se comprovou exploração ou dano real. Não se testou produção nesta implementação.

URLs de download com token são um contrato separado: endurecer autorização do SDK não deve ser apresentado como revogação de links já distribuídos. O helper solicita URL após upload inclusive para PDF, apesar de funcionário não poder ler esse PDF. Esse risco de contrato/distribuição permanece documentado, sem abrir permissões nem alterar tokens/objetos para resolvê-lo nesta PR.

Antes de publicação futura: revisão/QG no HEAD final, merge autorizado e QG da main, inventário atualizado, compatibilidade de consumidores antigos e autorização exclusiva de Storage Rules. Guardar ruleset anterior e critérios de interrupção. Reverter Rules reabre os B1; não recupera identidades nem sincroniza Auth/Firestore. Não limpar flags nem alterar contas como rollback implícito.

O bloqueio RPC/capacidade da #119, dependências WhatsApp, transição entre revisões e NO-GO de deploy da Sprint 106 permanecem independentes. Esta PR não incorpora #116–#119 e não desbloqueia seus workflows. **Sem autorização de merge ou publicação.**
