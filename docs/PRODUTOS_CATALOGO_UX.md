# Produtos e Catálogo no dashboard

As duas entradas usam a mesma coleção `produtos`, a mesma consulta por
`criadoPor`, os mesmos cards e a mesma permissão `produtos`. Não existe cópia de
dados nem segundo listener.

- **Produtos** é a visão operacional: criação, edição, filtros de físicos,
  digitais e rascunhos, seleção em massa e estoque. O reset já existente ao
  abrir Rascunhos é preservado.
- **Catálogo** é a visão analítica e somente leitura: KPIs da janela visível,
  busca, ordenação e apresentação em grade/lista. Controles de edição, seleção
  e ações em massa ficam ocultos nessa visão.
- O único `#produtos-workspace` é movido entre `#produtos-operational-mount` e
  `#catalogo-analytics-mount`. Os listeners são ligados uma vez e a navegação
  não cria consultas concorrentes permanentes.
- Ao abrir o Catálogo, o filtro operacional é salvo, a visão usa todos os
  produtos ativos e a busca começa vazia. Ao voltar para Produtos, o filtro
  operacional anterior é restaurado e a busca analítica não atravessa a troca
  de módulo.
- O campo de busca usa semântica de pesquisa (`type=search`, `role=searchbox`,
  `name=catalog_search_query`, `autocomplete=off`) e atributos de opt-out para
  gerenciadores conhecidos. A defesa em runtime também remove um e-mail
  autenticado preenchido indevidamente sem apagar uma busca digitada de verdade.

## Permissão

`view-produtos` e `view-catalogo` mapeiam para a permissão existente
`produtos`. Criar uma permissão separada exigiria migração de usuários e poderia
retirar acesso de contas existentes; por isso a separação desta etapa é de UX,
sem mudança de Rules, schema ou dados.
