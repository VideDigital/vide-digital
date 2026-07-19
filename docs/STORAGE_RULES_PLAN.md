# Storage Rules Plan — Vide Hub V1

## Objetivo

Planejar regras para arquivos de produto, loja e Landing Pages sem alterar o Firebase Console nesta fase.

## Usos previstos

- Imagens de produtos.
- Logos e fotos de perfil.
- Capas/banners da loja.
- Arquivos digitais de produtos.
- Imagens de Landing Pages/Studio.

## Modelo recomendado de path

> O repositório atual usa muitos dados em base64 no Firestore. Para Storage futuro, usar caminhos com tenant explícito:

```text
stores/{ownerUid}/products/{productId}/{fileName}
stores/{ownerUid}/profile/{fileName}
stores/{ownerUid}/banners/{fileName}
stores/{ownerUid}/landing-pages/{pageId}/{fileName}
stores/{ownerUid}/digital-products/{productId}/{fileName}
```

## Regras necessárias

- Owner escreve apenas em `stores/{auth.uid}`.
- Funcionário escreve em `stores/{donoUID}` somente se ativo e com `canEdit` no módulo correspondente.
- Leitura pública apenas para assets publicados/necessários.
- Validar tamanho máximo.
- Validar content type.
- Bloquear executáveis e HTML arbitrário.
- Separar arquivos digitais privados de imagens públicas.

## Tipos recomendados

- Imagens: `image/jpeg`, `image/png`, `image/webp`, `image/gif`.
- PDF/arquivos digitais: permitir apenas se produto digital exigir e regras privadas existirem.

## Riscos

- Storage público sem path de tenant cria vazamento cross-tenant.
- Base64 no Firestore pode exceder limites e custos.
- Arquivos digitais exigem autorização mais forte do que imagens públicas.
