# Firebase Indexes Plan — Vide Hub V1

## Objetivo

Listar índices prováveis para suportar queries atuais e futuras do Vide Hub.

## Queries observadas

| Coleção | Filtros | Ordenação | Índice provável |
|---|---|---|---|
| `funcionarios` | `donoUID == ownerUid` | ordenação no cliente | simples por `donoUID`. |
| `produtos` | `criadoPor == ownerUid` | ordenação no cliente | simples por `criadoPor`. |
| `pedidos` | `criadoPor == ownerUid` | filtros por data/status no cliente | composto futuro: `criadoPor`, `data`, `status`. |
| `leads` | `criadoPor == ownerUid` | filtros por data/status/origem no cliente | composto futuro: `criadoPor`, `data`, `statusLead`, `origem`. |
| `templates` | `criadoPor == ownerUid` | categoria no cliente | composto futuro: `criadoPor`, `categoria`. |
| `landing_pages` | `donoUID == ownerUid`, `pagina == slug` | não | composto: `donoUID`, `pagina`. |
| `landing_pages_blocos` | `lpId == pageId` | ordem por array externo | simples por `lpId`. |
| `banners_loja` | `donoUID == ownerUid` | `ordem` | composto futuro: `donoUID`, `ordem`. |
| `metricas_produtos` | doc id produto | não | sem índice composto. |
| `chats` | `clienteNome == lead.nome` | não | simples por `clienteNome`; ideal futuro por tenant. |
| `chats/{id}/mensagens` | coleção direta | `orderBy timestamp` | índice simples automático. |

## Recomendações

- Migrar filtros pesados do cliente para queries indexadas por tenant e período.
- Adicionar campo de tenant explícito em chats antes de regras fortes.
- Validar índices reais no Firebase Console após executar fluxos.
