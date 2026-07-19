# Deployment Guide — Vide Hub V1

## Estado atual

O Vide Hub é publicado como site estático via GitHub Pages. Esta branch não publica Firebase Rules, Storage Rules nem Cloud Functions.

## Deploy do frontend

1. Revisar e aprovar Pull Request.
2. Fazer squash merge em `main`.
3. Aguardar GitHub Pages publicar.
4. Testar:
   - `https://videdigital.github.io/vide-digital/dashboard.html`
   - `https://videdigital.github.io/vide-digital/login.html`
   - `https://videdigital.github.io/vide-digital/admin.html`
   - `https://videdigital.github.io/vide-digital/loja.html?loja={slug}`

## Dependências

- GitHub Pages ativo.
- Firebase Project existente.
- Firebase Auth configurado.
- Firestore configurado.
- Regras Firebase atuais no Console.
- CDNs externos acessíveis.

## O que não publicar automaticamente

- `firebase/firestore.rules.proposed`
- `firebase/storage.rules.proposed`
- qualquer Cloud Function futura

Esses arquivos são propostas revisáveis e exigem validação separada.

## Checklist pós-deploy

- Login owner.
- Login funcionário.
- Login admin.
- Modo Master.
- Produtos.
- Pedidos.
- Leads.
- Landing Pages.
- Loja pública.
- Console sem erro novo.
- GitHub Pages concluído.

## Custos possíveis

- Cloud Functions pode exigir plano Firebase compatível com billing.
- Firestore/Storage podem gerar custos por leitura, escrita e armazenamento.
- Regras mal configuradas podem aumentar leituras negadas e ruído operacional.
