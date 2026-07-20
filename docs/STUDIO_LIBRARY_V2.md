# Studio Library V2

Este documento descreve a Fase 2 da biblioteca visual do Vide Aura Studio. A implementação cria um catálogo unificado e uma nova interface de descoberta e inserção sem alterar Firebase, autenticação, tenant, URLs públicas ou o formato persistido dos blocos.

## Objetivo e limites

A Library V2 melhora a experiência de selecionar e inserir blocos com:

- catálogo unificado do Block Registry e dos 1.142 presets ativos;
- pesquisa instantânea sem distinção de acentos ou caixa;
- categorias e filtros combináveis;
- favoritos e recentes locais;
- cards maiores com origem, descrição e ações claras;
- preview seguro em desktop, tablet e mobile;
- inserção canônica e legada pelo mecanismo funcional existente;
- navegação por teclado e layout responsivo;
- paginação que limita o DOM a 48 cards por lote;
- fallback para a biblioteca anterior.

Esta fase não migra o renderer público efetivo de `index.html`, não muda o contrato salvo, não remove bibliotecas antigas e não publica mudanças.

## Arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `studio-library-v2-adapter.js` | Normalização, deduplicação, pesquisa, filtros, preferências, preview seguro e inserção. |
| `studio-canonical-renderers-v1.js` | Renderers e previews canônicos iniciais para seis tipos. |
| `studio-library-v2.js` | Interface, estado, acessibilidade, eventos delegados e fallback. |
| `studio-library-v2.css` | Layout isolado, cards, preview, responsividade e reduced motion. |
| `studio-loader.js` | Feature flag e carregamento opcional dos módulos V2. |
| `studio-block-registry.js` | Fallback legado quando um renderer canônico falha ou não retorna conteúdo. |
| `tests/studio/library-v2.test.mjs` | Cobertura automatizada da arquitetura e dos fluxos da biblioteca. |

O CSS só atua dentro de `.aura-library-v2`. Com a flag desligada, a interface anterior não recebe esses estilos.

## Ordem de carregamento

O loader mantém as bibliotecas históricas na ordem atual e carrega a V2 depois de `studio-library-clean-v53.js`:

1. Block Registry;
2. Library base, MAX, Ultimate e Blocks V4;
3. Studio Pro, Canvas e módulos atuais;
4. Library Clean V5.3;
5. renderers canônicos;
6. adapter da Library V2;
7. interface da Library V2.

Os três scripts novos são opcionais no loader. Falha de rede ou de carregamento em qualquer módulo V2 gera warning e deixa o Studio continuar pelo caminho anterior.

## Feature flag e rollback

A interface V2 só inicializa quando:

```js
window.AURA_STUDIO_LIBRARY_V2_ENABLED === true
```

O `studio-loader.js` ativa a flag por padrão para esta integração, apenas quando ela ainda não foi definida. Para rollback local, defina a flag explicitamente como `false` antes de chamar `carregarEditorLandingPages()`:

```js
window.AURA_STUDIO_LIBRARY_V2_ENABLED = false;
```

Com flag ausente ou falsa ao carregar o módulo isoladamente, a V2 não altera a API nem a interface. O módulo também guarda os nós originais do painel sem cloná-los. Se ocorrer erro durante a abertura, esses mesmos nós e listeners são restaurados e a função anterior de abertura é chamada.

O rollback completo do código consiste em reverter os commits da Fase 2. Não há migração de dados para desfazer.

## Catálogo unificado

`AuraStudioLibraryV2Adapter.createCatalog()` recebe:

- `AuraStudioBlockRegistry.list()` e `get()`;
- `window.AURA_STUDIO_PRESETS` após Library base, MAX, Ultimate e V4;
- blocos pessoais já expostos pelo Inspector.

O resultado usa um formato único:

```js
{
  key,
  id,
  type,
  kind,
  source,
  sourceLabel,
  sourceRefs,
  title,
  description,
  category,
  subcategory,
  tags,
  aliases,
  icon,
  thumbnail,
  version,
  capabilities,
  schema,
  experimental,
  deprecated,
  unsafe,
  mobileCompatible,
  searchableText,
  insertPayload
}
```

As chaves são namespaced:

- canônico: `canonical:<definition-id>`;
- preset: `preset:<source>:<preset-id>`.

Isso impede que favoritos de fontes diferentes sejam misturados quando os IDs brutos coincidem.

### Fontes

As origens visuais são:

- `canonical` — definições do Registry;
- `pro` — biblioteca base;
- `max` — presets MAX;
- `ultimate` — presets Ultimate;
- `v4` — presets V4;
- `personal` — blocos pessoais;
- `legacy` — origem explicitamente legada ou desconhecida.

Library Clean é uma camada de interface, não uma fonte adicional de presets. A V2 preserva seu catálogo subjacente e sua API como fallback.

## Normalização e deduplicação

A normalização é data-only, idempotente e não modifica os objetos de origem.

Regras:

1. definições canônicas usam o `id` do Registry;
2. presets com ID usam `source + id`;
3. presets sem ID recebem uma assinatura determinística baseada em título, categoria, tipos e shape das propriedades;
4. duplicatas exatas da mesma fonte são mescladas;
5. tags, aliases e referências de origem são unidos;
6. itens com o mesmo ID em fontes diferentes permanecem separados;
7. títulos parecidos nunca são suficientes, sozinhos, para eliminar uma variação;
8. itens canônicos têm prioridade quando uma identidade canônica real colide.

Os tipos persistidos não são renomeados.

## Categorias

Categorias do Registry são reaproveitadas e nomes históricos recebem apresentação amigável. Exemplos:

- `Estrutura` → `Layout`;
- `Imagens` e `Vídeos` → `Mídia`;
- `Depoimentos` e `Avaliações` → `Prova social`;
- `Comparações` → `Comparativos`;
- `Páginas V4` → `Páginas completas`;
- `Seções V4` → `Seções completas`.

Categorias específicas que não exigem mapeamento continuam disponíveis. Nenhum valor persistido é alterado.

## Pesquisa e filtros

A pesquisa usa um índice `searchableText` preparado durante a normalização. Ela considera:

- título;
- descrição;
- categoria e subcategoria;
- tipo;
- tags e keywords;
- aliases;
- origem.

O texto é normalizado com NFD, sem acentos e em minúsculas. Todos os termos precisam existir no item, e a ordenação atribui pesos maiores a título exato, início do título, tipo e aliases. O debounce da interface é de 130 ms.

Filtros disponíveis:

- todos;
- sistema;
- canônicos;
- legados/presets;
- favoritos;
- recentes;
- experimentais;
- compatíveis com mobile;
- categoria.

Pesquisa, filtro e categoria podem ser combinados. Estados vazios explicam o motivo e podem sugerir categorias relacionadas.

## Favoritos e recentes

Nesta fase, ambos são preferências locais sem conteúdo sensível:

- `auraStudioLibraryV2:favorites:v1`;
- `auraStudioLibraryV2:recents:v1`.

Favoritos sobrevivem ao reload quando `localStorage` está disponível. Recentes:

- são registrados após inserção confirmada;
- mantêm o mais recente no início;
- eliminam duplicações;
- têm limite de 20 itens;
- podem ser limpos pela interface.

Leitura e escrita são protegidas por `try/catch`. Em private mode ou storage bloqueado, a sessão continua com memória local. Chaves inexistentes no catálogo são simplesmente ignoradas pelos filtros.

## Preview seguro

A prioridade é:

1. `previewRenderer` canônico funcional;
2. `renderer` canônico funcional no contexto de preview;
3. thumbnail com protocolo permitido;
4. preview estático tratado como texto;
5. placeholder visual da categoria.

Markup de preset não é executado. O adapter rejeita como preview confiável qualquer resultado contendo:

- `script`;
- `iframe`, `object` ou `embed`;
- handlers inline;
- `javascript:` ou `vbscript:`;
- `srcdoc`.

`codigo_iframe` e presets que o contenham mostram aviso e placeholder. Eles nunca são executados automaticamente na biblioteca.

Os previews canônicos são funções internas que escapam texto e atributos. A interface só usa seu HTML depois da validação de segurança do adapter.

## Inserção

Toda inserção passa por `insertLibraryItem(item)`.

### Presets

O adapter chama o `AuraStudioPro.insertPreset(presetId)` existente. Isso preserva:

- criação de IDs de instância;
- página atual;
- modo livre;
- seleção do primeiro bloco;
- dirty state;
- renderização do editor;
- feedback e scroll existentes.

### Itens canônicos

O adapter cria um preset transitório em memória com os defaults canônicos, chama o mesmo mecanismo funcional e remove o preset no `finally`. O preset transitório não é salvo e não muda `AURA_STUDIO_PRESETS` permanentemente.

Uma trava por item impede clique duplo e repetição dentro de 650 ms. Em erro, a trava é liberada e qualquer preset transitório é removido.

O formato dos blocos inseridos continua usando `tipo`, `props`, `design` e os campos atuais. Não há nova estrutura persistida.

## Renderers canônicos iniciais

| Tipo | Renderer real | Defaults | Schema | Preview | Fallback |
| --- | --- | --- | --- | --- | --- |
| `texto_midia` | `textMediaRenderer` | Hero com título, apoio e CTA | texto, mídia e link existentes | funcional | renderer legado |
| `faq` | `faqRenderer` | duas perguntas úteis | repeater de perguntas | funcional | renderer legado |
| `lista_cards` | `cardListRenderer` | três cards úteis | título e repeater | funcional | renderer legado |
| `galeria_imagens` | `galleryRenderer` | galeria vazia segura | título e lista de imagens | funcional | renderer legado |
| `formulario_captura` | `formRenderer` | nome, e-mail e WhatsApp | título, apoio, botão e campos | funcional, sem envio | renderer legado |
| `rodape` | `footerRenderer` | marca, copyright e links | marca, texto e repeater | funcional | renderer legado |

Os renderers retornam markup sem execução dinâmica, sanitizam URLs e escapam conteúdo. Eles validam a arquitetura no Studio, mas não iniciam a migração do renderer público real.

`BlockRegistry.render()` agora captura exceções ou retorno nulo do renderer canônico e chama o fallback legado quando fornecido.

## Compatibilidade

A Library V2 não remove nem reescreve:

- Studio Pro;
- MAX;
- Ultimate;
- Blocks V4;
- Library Clean;
- Canvas V4;
- `AURA_STUDIO_PRESETS`;
- tipos persistidos;
- salvar, reabrir, histórico ou publicação existentes.

Registry ausente produz catálogo somente de presets e mostra “Modo de compatibilidade”. Adapter ou UI ausentes mantêm a Library Clean/Pro. Renderer canônico com erro cai no renderer legado.

## Performance

Estratégias aplicadas:

- normalização memoizada por assinatura do catálogo;
- índice de busca calculado uma única vez por item;
- debounce de 130 ms;
- paginação incremental de 48 itens;
- no máximo 48 cards no primeiro lote;
- previews pesados somente sob demanda;
- imagens com lazy loading;
- um conjunto de listeners globais em captura e event delegation;
- `requestAnimationFrame` para agrupar renderizações;
- scroll interno e overscroll isolado.

Na suíte Node, criar o catálogo completo e pesquisar “produto” permanece abaixo do limite conservador de 1 segundo. O valor típico local fica perto de 120–140 ms, variando por máquina.

## Acessibilidade e responsividade

- foco inicial na pesquisa;
- foco devolvido ao acionador ao fechar;
- `Escape` fecha primeiro preview, depois drawer e por último biblioteca;
- `Enter` em um card insere o item;
- `Ctrl/Cmd + K` foca a pesquisa;
- `B` abre a biblioteca fora de campos de edição;
- botões com labels e `aria-pressed`;
- resultados e inserção anunciados por `aria-live`;
- foco visível;
- targets mínimos de 44 px no mobile;
- reduced motion respeitado;
- desktop com três colunas, tablet com duas/uma e mobile com uma;
- painel mobile em tela cheia e categorias em drawer.

## Testes automatizados

Arquivo: `tests/studio/library-v2.test.mjs`.

Cobertura:

- normalização do catálogo ativo;
- Registry ausente;
- deduplicação segura;
- busca parcial e sem acentos;
- filtros combináveis;
- favoritos e recentes;
- storage indisponível;
- preview seguro;
- bloqueio de iframe;
- inserção legada e canônica;
- clique duplo;
- limpeza após erro;
- seis renderers canônicos;
- fallback legado;
- ordem de `Escape`;
- feature flag estrita;
- performance e paginação;
- ausência de `eval` e `new Function`.

Comandos de validação:

```text
pnpm run check
pnpm run test:studio
pnpm run smoke:release
pnpm run test:all
git diff --check
```

## Roteiro visual

Validar em ambiente local/Emulator:

- desktop: 1366×768, 1440×900 e 1920×1080;
- tablet: 768×1024;
- mobile: 375×667, 390×844 e 430×932.

Fluxo:

1. autenticar no ambiente demo;
2. abrir Landing Pages e o Studio;
3. abrir Library V2;
4. pesquisar com e sem acentos;
5. trocar categoria e combinar filtros;
6. favoritar e recarregar;
7. abrir preview em três dispositivos;
8. inserir preset legado;
9. inserir bloco canônico;
10. salvar, fechar e reabrir;
11. confirmar recentes;
12. testar Registry ausente;
13. testar storage indisponível;
14. repetir abertura/fechamento por 20 ciclos;
15. verificar console, scroll, foco e ausência de overflow horizontal.

## Limitações e próximos passos

- Favoritos e recentes ainda são preferências locais do navegador, conforme o escopo desta fase.
- Somente seis tipos possuem renderer canônico real.
- Outros tipos continuam com referência `legacy:*`.
- O preview de presets legados é representativo e não executa o HTML do preset.
- A Library V2 não gera o Inspector a partir do schema.
- A Library V2 não muda drag and drop, autosave, undo/redo ou componentes globais.
- O renderer público efetivo continua inline em `index.html`.
- Migração pública exige uma fase separada, testes de paridade e política específica para conteúdo inseguro.
