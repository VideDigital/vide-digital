# Deployment Guide — Vide Hub V1

## Estado atual

O Vide Hub é publicado como site estático via GitHub Pages. Esta branch não publica Firebase Rules, Storage Rules nem Cloud Functions.

## Deploy do frontend

1. Revisar e aprovar Pull Request.
2. Fazer squash merge em `main`.
3. Aguardar GitHub Pages publicar.
4. Limpar cache quando necessário.
5. Testar:
   - `https://videdigital.github.io/vide-digital/dashboard.html`
   - `https://videdigital.github.io/vide-digital/login.html`
   - `https://videdigital.github.io/vide-digital/admin.html`
   - `https://videdigital.github.io/vide-digital/loja.html?loja={slug}`

## O que não publicar automaticamente

- `firebase/firestore.rules.proposed`
- `firebase/storage.rules.proposed`
- Cloud Functions futuras
- índices ainda não validados

Esses arquivos são propostas revisáveis e exigem migração, Emulator, staging e aprovação separada.

## Deploy futuro de Firebase

Antes de qualquer deploy Firebase:

1. Confirmar projeto Firebase selecionado.
2. Usar staging obrigatório.
3. Rodar Emulator Suite.
4. Executar testes owner, employee, admin e público.
5. Exportar/backup do Firestore.
6. Copiar Firestore Rules atuais.
7. Copiar Storage Rules atuais.
8. Exportar/listar índices atuais.
9. Versionar Functions.
10. Definir janela de mudança.
11. Definir critérios de abortar.

Ordem recomendada para migração:

1. Deploy de Functions em staging.
2. Atualização do frontend para chamar Functions.
3. Testes autenticados.
4. Publicação gradual das rules restritivas.
5. Monitoramento de erros de permissão e custos.

Não executar `firebase deploy` contra produção a partir deste PR.

## Checklist pós-deploy frontend

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
- domínio/cache/CDN sem versão antiga.

## Custos possíveis

- Cloud Functions pode exigir plano Firebase compatível com billing.
- Firestore/Storage geram custo por leitura, escrita e armazenamento.
- Rules mal configuradas podem aumentar leituras negadas e ruído operacional.
- Índices podem demorar a construir e não têm rollback instantâneo.
