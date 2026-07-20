# Studio Block Registry

Este documento descreve a base canônica criada para organizar os blocos do Studio sem remover a biblioteca legada nem alterar contratos de publicação.

## Objetivo

O Studio historicamente dependia de arrays globais e bibliotecas incrementais para listar, procurar e renderizar blocos. A Fase 1 introduz um registro canônico único, idempotente e compatível com os blocos atuais.

O registro não redesenha o editor, não muda Firebase, não muda URLs públicas e não remove nenhum tipo legado. Ele apenas cria a fundação para inventário, validação, busca, migração e fallback controlado.

## Arquitetura

Arquivo principal:

- `studio-block-registry.js`

Globais expostos:

- `window.AuraStudioBlockRegistry`
- `window.BlockRegistry`
- `window.AURA_STUDIO_BLOCK_REGISTRY_VERSION`

O loader do Studio carrega o registro antes das bibliotecas antigas. O registro é uma dependência opcional: se `studio-block-registry.js` falhar, o loader emite warning claro e continua carregando Pro, MAX, Ultimate, V4 e demais módulos legados.

Quando `window.AURA_STUDIO_PRESETS` recebe presets legados, o adaptador registra tipos desconhecidos como entradas legadas sem substituir a lista existente.

## Contrato de definição

Cada bloco canônico deve ter, no mínimo:

```js
{
  id: "block.example",
  type: "example_type",
  version: 1,
  name: "Nome",
  category: "Conteúdo"
}
```

Campos opcionais suportados pela API atual:

- `description`
- `subcategory`
- `keywords`
- `aliases`
- `icon`
- `legacyTypes`
- `schema`
- `defaults`
- `capabilities`
- `responsiveConfig`
- `accessibilityConfig`
- `renderer`
- `previewRenderer`
- `validator`
- `migrationHandler`
- `experimental`
- `deprecated`
- `source`

`unsafeContent` não é um campo top-level no contrato atual. Quando um bloco representa conteúdo potencialmente perigoso, o risco deve ser sinalizado em `capabilities.unsafeContent`, como acontece com `codigo_iframe`.

## API pública

Principais métodos:

- `register(definition, options)`
- `get(idOrType)`
- `getById(id)`
- `getByType(type)`
- `has(idOrType)`
- `list(filters)`
- `listByCategory(category)`
- `search(query, options)`
- `validateDefinition(definition)`
- `validateInstance(block)`
- `resolveLegacyType(type)`
- `migrate(block)`
- `getVersion()`
- `getRenderer(type)`
- `render(block, context, legacyRenderer)`
- `registerLegacyPresets(presets, options)`
- `legacyPresets()`
- `installLegacyPresetAdapter()`
- `warnings()`

## Compatibilidade legada

O contrato antigo `window.AURA_STUDIO_PRESETS` continua existindo. O registro instala um adaptador por getter/setter:

1. bibliotecas antigas atribuem presets normalmente;
2. a lista continua disponível para os módulos que já a usam;
3. tipos ainda desconhecidos são cadastrados como `legacy.*`;
4. tipos canônicos existentes não são duplicados;
5. a ordem e a identidade do array legado não são modificadas pelo registro.

Nenhum bloco salvo precisa ser migrado automaticamente nesta fase.

## Renderers

Importante: "registro canônico" não significa "renderer canônico ativo".

Os blocos de sistema cadastrados nesta fase usam `renderer` em formato string, por exemplo `legacy:renderTextMedia`. Essas strings são referências descritivas para mapear o renderer legado correspondente.

`BlockRegistry.render()` não executa essas strings. O método só executa `renderer` quando ele é uma função real. Portanto, para os blocos atuais, o caminho funcional continua sendo o renderer legado.

A migração de renderers para funções reais ainda não foi realizada. Isso é um bloqueador para usar o registry como fonte real da biblioteca visual em uma próxima fase.

## Renderização pública

`lp-public-v4.js` tenta usar o registro apenas se ele estiver presente no contexto. Se o registro não existir, se o renderer for uma string `legacy:*`, ou se o registro não souber renderizar o tipo, o fluxo antigo por `switch` continua sendo usado.

Esse arquivo, porém, não é o renderer público efetivo carregado hoje. `lp-public-v4.js` é um renderer legado/planejado e atualmente não está conectado por nenhuma página HTML pública. A renderização pública real está em lógica inline dentro de `index.html`.

Assim, a alteração do PR #10 em `lp-public-v4.js` não afeta hoje as páginas públicas carregadas e não protege automaticamente o renderer público real. Qualquer migração futura deve primeiro unificar ou conectar explicitamente os caminhos `index.html` e `lp-public-v4.js`.

## Validação, defaults e migração

O registro valida definições antes de aceitá-las. Definições inválidas são rejeitadas sem remover entradas existentes.

`defaults` deve ser um objeto e normalmente contém:

```js
{
  tipo: "example_type",
  props: {},
  design: {}
}
```

`migrate(block)`:

- preserva campos desconhecidos;
- considera blocos sem versão como legado `0`;
- preenche `props` e `design` quando ausentes;
- aplica `migrationHandler` apenas quando a definição fornece essa função;
- grava a versão canônica no clone retornado.

## Aliases, warnings e erros

Aliases são normalizados sem acentos e em minúsculas para busca e resolução de tipos legados. Conflitos de alias entre tipos diferentes são rejeitados durante `register()`.

Erros de definição impedem o registro da entrada inválida, mas não removem definições existentes. Warnings são armazenados em `warnings()` para diagnóstico e também usados para situações não bloqueantes, como categoria desconhecida ou tipo de instância ainda sem definição canônica.

## Segurança

Nesta fase o registro não usa `eval`, `new Function`, execução dinâmica de strings ou publicação automática. Tipos com `capabilities.unsafeContent`, como `codigo_iframe`, continuam renderizados pelo fluxo legado e permanecem sinalizados para revisão futura.

## Testes

Suíte criada:

- `tests/studio/block-registry.test.mjs`

Ela cobre:

- resolução por id e tipo;
- rejeição de duplicatas;
- aliases e busca;
- validação de definição e instância;
- migração preservando dados;
- renderer com fallback legado;
- adaptador de presets;
- compatibilidade com bibliotecas ativas do Studio.

## Limitações desta fase

- O Inspector ainda não é gerado a partir do schema canônico.
- A biblioteca visual ainda usa os módulos ativos existentes.
- Os renderers canônicos ainda não foram migrados para funções reais.
- As referências `legacy:*` são apenas metadados descritivos.
- Usar o registro como fonte real da biblioteca visual depende de migrar ou adaptar os renderers.
- O renderer público efetivo ainda está em `index.html`; a unificação com `lp-public-v4.js` fica para fase posterior.
- A expansão massiva de blocos profissionais fica para fases futuras.
- Nenhum contrato de Firebase, publicação ou autenticação foi alterado.

## Próximas fases sugeridas

1. Migrar ou adaptar renderers `legacy:*` para funções reais e testáveis.
2. Usar o registro como fonte primária da biblioteca visual somente depois da migração dos renderers.
3. Gerar controles do Inspector a partir de `schema`.
4. Unificar o renderer público efetivo entre `index.html` e `lp-public-v4.js`.
5. Adicionar migração assistida por versão para blocos salvos.
6. Expandir a biblioteca profissional por categorias.
7. Criar testes visuais e de aceitação para o editor completo.
