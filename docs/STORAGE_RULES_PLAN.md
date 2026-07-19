# Storage Rules Plan — Vide Hub V1

> PROPOSTA NÃO PRONTA PARA PRODUÇÃO.
> Não publicar antes de Cloud Functions, custom claims, testes no Emulator, migração de base64 para Storage e validação autenticada em staging.

## Objetivo

Planejar regras futuras para arquivos de produto, loja e Landing Pages sem alterar o Firebase Console nesta fase.

## Estado atual

O repositório atual usa majoritariamente base64 salvo no Firestore:

- produtos: `imagemB64`;
- perfil/loja: `fotoPerfilB64`;
- banners: `banners_loja.imagemB64`;
- Landing Pages: `props.imagemB64`.

Os caminhos `stores/{ownerUid}/...` são arquitetura futura e não representam compatibilidade completa com o frontend atual.

## Modelo futuro de paths

```text
stores/{ownerUid}/products/{productId}/{fileName}
stores/{ownerUid}/profile/{fileName}
stores/{ownerUid}/banners/{fileName}
stores/{ownerUid}/landing-pages/{pageId}/{fileName}
stores/{ownerUid}/digital-products/{productId}/{fileName}
```

## Permissões planejadas

- Owner escreve apenas em `stores/{auth.uid}`.
- Funcionário ativo escreve somente no path do `donoUID` e no módulo correspondente.
- Admin backend escreve somente com custom claim `videAdmin`.
- Público lê apenas assets intencionalmente públicos.
- Público não escreve.

## Tipos e tamanhos

| Categoria | Tipos permitidos | Tamanho |
|---|---|---:|
| Produto | jpeg, png, webp, gif | até 5 MB |
| Perfil/logo | jpeg, png, webp, gif | até 2 MB |
| Banner | jpeg, png, webp, gif | até 6 MB |
| Landing Page | jpeg, png, webp, gif | até 5 MB |
| Produto digital | PDF apenas nesta proposta | até 50 MB |

SVG, HTML, JavaScript, executáveis, MIME genérico e ZIP ficam bloqueados até existir sanitização/validação backend específica.

## Migração base64 → Storage

1. Criar Storage paths em staging.
2. Atualizar frontend para upload real.
3. Migrar imagens antigas gradualmente.
4. Manter fallback para base64 durante janela de migração.
5. Monitorar custo e tamanho dos documentos Firestore.
6. Remover base64 dos novos writes só depois de validação.

## Riscos

- Storage público sem tenant no path cria vazamento cross-tenant.
- Arquivo digital exige autorização por comprador/licença, ainda não implementada.
- Regras publicadas antes da migração não resolvem o problema atual de base64 no Firestore.
- Employee upload depende de Firestore lookup e precisa Emulator antes de produção.
