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

O loader do Studio carrega o registro antes das bibliotecas antigas. Assim, quando `window.AURA_STUDIO_PRESETS` recebe presets legados, o adaptador registra os tipos desconhecidos como entradas legadas sem substituir a lista existente.

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

Campos opcionais suportados:

- `description`
- `subcategory`
- `keywords`
- `aliases`
- `icon`
- `legacyTypes`
- `schema`
- `defaults`
- `capabilities`
- `renderer`
- `preview`
- `validator`
- `migrationHandler`
- `experimental`
- `unsafeContent`
- `source`

## API pública

Principais métodos:

- `register(definition, options)`
- `get(idOrType)`
- `getById(id)`
- `getByType(type)`
- `has(idOrType)`
- `list(filter)`
- `listByCategory(category)`
- `search(query, options)`
- `validateDefinition(definition)`
- `validateInstance(block)`
- `resolveLegacyType(type)`
- `migrate(block)`
- `render(block, context, legacyRenderer)`
- `registerLegacyPresets(presets, source)`
- `legacyPresets()`
- `warnings()`

## Compatibilidade legada

O contrato antigo `window.AURA_STUDIO_PRESETS` continua existindo. O registro instala um adaptador por getter/setter:

1. bibliotecas antigas atribuem presets normalmente;
2. a lista continua disponível para os módulos que já a usam;
3. tipos ainda desconhecidos são cadastrados como `legacy.*`;
4. tipos canônicos existentes não são duplicados.

Nenhum bloco salvo precisa ser migrado automaticamente nesta fase.

## Renderização pública

`lp-public-v4.js` tenta usar o registro apenas se ele estiver presente no contexto. Se o registro não existir ou não souber renderizar o tipo, o fluxo antigo por `switch` continua sendo usado.

Essa integração é propositalmente conservadora para preservar publicação e renderer público.

## Validação e migração

O registro valida definições antes de aceitá-las. Definições inválidas são rejeitadas sem remover entradas existentes.

`migrate(block)`:

- preserva campos desconhecidos;
- considera blocos sem versão como legado `0`;
- preenche `props` e `design` quando ausentes;
- aplica `migrationHandler` apenas quando a definição fornece essa função;
- grava a versão canônica no clone retornado.

## Segurança

Nesta fase o registro não usa `eval`, `new Function`, execução dinâmica de strings ou publicação automática. Tipos marcados como `unsafeContent`, como `codigo_iframe`, continuam renderizados pelo fluxo legado e permanecem sinalizados para revisão futura.

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
- A expansão massiva de blocos profissionais fica para fases futuras.
- Nenhum contrato de Firebase, publicação ou autenticação foi alterado.

## Próximas fases sugeridas

1. Usar o registro como fonte primária da biblioteca visual.
2. Gerar controles do Inspector a partir de `schema`.
3. Adicionar migração assistida por versão para blocos salvos.
4. Expandir a biblioteca profissional por categorias.
5. Criar testes visuais e de aceitação para o editor completo.
