# Studio Block Inventory

Este inventário mapeia os tipos de bloco ativos e a transição para o registro canônico.

## Tipos com renderer legado conhecido

Os tipos abaixo estão registrados como catálogo canônico, mas seus renderers ainda não são funções canônicas ativas. O campo `renderer` do registro usa referências descritivas em formato `legacy:*`.

`BlockRegistry.render()` não executa essas strings; ele só executa funções. Portanto, o renderer funcional continua sendo o caminho legado.

| Tipo persistido | Categoria canônica | Referência de renderer | Status | Observações |
| --- | --- | --- | --- | --- |
| `texto_midia` | Hero | `legacy:renderTextMedia` | Catálogo canônico / renderer legado | Também representa hero, banner e texto com imagem. |
| `formulario_captura` | Formulários | `legacy:renderForm` | Catálogo canônico / renderer legado | Mantém contrato público de captação de leads. |
| `faq` | FAQ | `legacy:renderFAQ` | Catálogo canônico / renderer legado | Bloco estável de perguntas frequentes. |
| `galeria_imagens` | Galerias | `legacy:renderGallery` | Catálogo canônico / renderer legado | Atenção a mídia/base64 em fases futuras. |
| `lista_cards` | Conteúdo | `legacy:renderCardList` | Catálogo canônico / renderer legado | Usado para benefícios, serviços, etapas e recursos. |
| `tabela_comparativo` | Comparações | `legacy:renderComparison` | Catálogo canônico / renderer legado | Usado para planos e comparações. |
| `texto_rico` | Texto | `legacy:renderRichText` | Catálogo canônico / renderer legado | Requer atenção contínua a conteúdo rico. |
| `codigo_iframe` | Código | `legacy:renderIframe` | Experimental / renderer legado | Conteúdo potencialmente inseguro via `capabilities.unsafeContent`; não expandir sem política própria. |
| `carrossel_banners` | Imagens | `legacy:renderBannerCarousel` | Catálogo canônico / renderer legado | Carrossel visual de banners. |
| `carrossel_produtos` | Produtos | `legacy:renderProductCarousel` | Catálogo canônico / renderer legado | Depende de dados de produto/tenant. |
| `carrossel_cards` | Depoimentos | `legacy:renderCardCarousel` | Catálogo canônico / renderer legado | Usado para cards, prova social e depoimentos. |
| `navegacao` | Navegação | `legacy:renderNavigation` | Catálogo canônico / renderer legado | Requer validação de links. |
| `rodape` | Rodapés | `legacy:renderFooter` | Catálogo canônico / renderer legado | Requer validação de links e redes sociais. |
| `seletor_cores` | Utilidades | `legacy:renderColorSelector` | Experimental / renderer legado | Controle utilitário preservado. |
| `breadcrumb` | Navegação | `legacy:renderBreadcrumb` | Catálogo canônico / renderer legado | Estrutura simples de navegação contextual. |
| `forma` | Estrutura | `legacy:renderShape` | Catálogo canônico / renderer legado | Usado em layout livre e elementos decorativos. |

## Bibliotecas e fontes ativas

| Arquivo | Papel atual | Relação com o registro |
| --- | --- | --- |
| `studio-loader.js` | Orquestra o carregamento dos módulos do Studio. | Carrega `studio-block-registry.js` primeiro, mas trata falha do registro como opcional. |
| `studio-library.js` | Biblioteca base legada. | Continua alimentando `AURA_STUDIO_PRESETS`; o adaptador registra tipos. |
| `studio-max-library.js` | Biblioteca expandida legada. | Continua compatível via adaptador. |
| `studio-ultimate-library.js` | Biblioteca avançada legada. | Continua compatível via adaptador. |
| `studio-blocks-v4.js` | Famílias e presets V4. | Continua compatível via adaptador. |
| `studio-pro.js` | Shell/editor ativo. | Ainda consome presets legados nesta fase. |
| `studio-inspector.js` | Inspector ativo. | Ainda usa lógica própria; schema canônico fica preparado para fase futura. |
| `studio-canvas-v4.js` | Canvas ativo. | Não muda nesta fase. |
| `lp-public-v4.js` | Renderer legado/planejado. | Tenta registro se presente e cai no renderer legado, mas não está carregado por HTML público atual. |
| `index.html` | Renderer público efetivo atual. | Mantém lógica inline de renderização pública; ainda não foi conectado ao registro canônico. |

## Situação do renderer público

`lp-public-v4.js` não é atualmente carregado pelas páginas HTML públicas. A alteração feita nele no PR #10 é uma preparação segura para um caminho legado/planejado, mas não altera o renderer público efetivo.

Hoje, `index.html` contém a lógica inline que renderiza as landing pages públicas. Antes de usar o registro como proteção ou fonte real do renderer público, uma fase futura precisa unificar ou conectar explicitamente `index.html` e `lp-public-v4.js`.

Não se deve assumir que o fallback implementado em `lp-public-v4.js` protege automaticamente o fluxo público atual.

## Famílias legadas mapeadas

As famílias abaixo aparecem em presets e bibliotecas como agrupamentos sem necessariamente serem tipos persistidos novos:

- `navigation` → `navegacao`
- `hero` e `banner` → `texto_midia`
- `benefits`, `services`, `features`, `process` → `lista_cards`
- `products` → `carrossel_produtos`
- `gallery` → `galeria_imagens`
- `proof`, `testimonials` → `carrossel_cards`
- `comparison` → `tabela_comparativo`
- `offer`, `urgency`, `guarantee` → normalmente `texto_midia`, `lista_cards` ou `carrossel_cards`
- `form` e `lead` → `formulario_captura`
- `contact` e `whatsapp` → atualmente composição de blocos existentes
- `faq` → `faq`
- `rich` → `texto_rico`
- `footer` → `rodape`

## Duplicidades e equivalências

Não houve renomeação de tipos persistidos nesta fase. A estratégia é aceitar aliases para busca e compatibilidade, mantendo os tipos salvos originais.

Equivalências principais:

- `hero`, `banner`, `texto-imagem` → `texto_midia`
- `form`, `formulario`, `captura` → `formulario_captura`
- `cards`, `features`, `beneficios`, `servicos` → `lista_cards`
- `produto`, `produtos`, `product-carousel` → `carrossel_produtos`
- `rich-text`, `artigo`, `conteudo` → `texto_rico`

## Riscos pendentes

- `codigo_iframe` exige política específica antes de qualquer expansão.
- `carrossel_produtos` depende de isolamento por tenant e dados dinâmicos.
- Inspector e biblioteca visual ainda precisam migrar gradualmente para o schema canônico.
- Renderers `legacy:*` ainda são metadados descritivos; a migração para funções reais é bloqueador para usar o registro como fonte real da biblioteca visual.
- O renderer público efetivo ainda está em `index.html`; a unificação com `lp-public-v4.js` é bloqueador para depender do registro no fluxo público.
- Presets legados podem conter variações sem renderer público; por isso o fallback continua obrigatório.
- O adaptador de presets ainda reprocessa o array em reatribuições completas. Isso não é bloqueador, mas pode ser otimizado em fase futura com cursor/identidade de presets processados.
