# Studio Block Inventory

Este inventário mapeia os tipos de bloco ativos e a transição para o registro canônico.

## Tipos com renderer público conhecido

| Tipo persistido | Categoria canônica | Renderer legado | Status | Observações |
| --- | --- | --- | --- | --- |
| `texto_midia` | Hero | `renderTextMedia` | Canônico | Também representa hero, banner e texto com imagem. |
| `formulario_captura` | Formulários | `renderForm` | Canônico | Mantém contrato público de captação de leads. |
| `faq` | FAQ | `renderFAQ` | Canônico | Bloco estável de perguntas frequentes. |
| `galeria_imagens` | Galerias | `renderGallery` | Canônico | Atenção a mídia/base64 em fases futuras. |
| `lista_cards` | Conteúdo | `renderCardList` | Canônico | Usado para benefícios, serviços, etapas e recursos. |
| `tabela_comparativo` | Comparações | `renderComparison` | Canônico | Usado para planos e comparações. |
| `texto_rico` | Texto | `renderRichText` | Canônico | Requer atenção contínua a conteúdo rico. |
| `codigo_iframe` | Código | `renderIframe` | Experimental | Conteúdo potencialmente inseguro; não expandir sem política própria. |
| `carrossel_banners` | Imagens | `renderBannerCarousel` | Canônico | Carrossel visual de banners. |
| `carrossel_produtos` | Produtos | `renderProductCarousel` | Canônico | Depende de dados de produto/tenant. |
| `carrossel_cards` | Depoimentos | `renderCardCarousel` | Canônico | Usado para cards, prova social e depoimentos. |
| `navegacao` | Navegação | `renderNavigation` | Canônico | Requer validação de links. |
| `rodape` | Rodapés | `renderFooter` | Canônico | Requer validação de links e redes sociais. |
| `seletor_cores` | Utilidades | `renderColorSelector` | Experimental | Controle utilitário preservado. |
| `breadcrumb` | Navegação | `renderBreadcrumb` | Canônico | Estrutura simples de navegação contextual. |
| `forma` | Estrutura | `renderShape` | Canônico | Usado em layout livre e elementos decorativos. |

## Bibliotecas e fontes ativas

| Arquivo | Papel atual | Relação com o registro |
| --- | --- | --- |
| `studio-loader.js` | Orquestra o carregamento dos módulos do Studio. | Passa a carregar `studio-block-registry.js` antes das bibliotecas legadas. |
| `studio-library.js` | Biblioteca base legada. | Continua alimentando `AURA_STUDIO_PRESETS`; o adaptador registra tipos. |
| `studio-max-library.js` | Biblioteca expandida legada. | Continua compatível via adaptador. |
| `studio-ultimate-library.js` | Biblioteca avançada legada. | Continua compatível via adaptador. |
| `studio-blocks-v4.js` | Famílias e presets V4. | Continua compatível via adaptador. |
| `studio-pro.js` | Shell/editor ativo. | Ainda consome presets legados nesta fase. |
| `studio-inspector.js` | Inspector ativo. | Ainda usa lógica própria; schema canônico fica preparado para fase futura. |
| `studio-canvas-v4.js` | Canvas ativo. | Não muda nesta fase. |
| `lp-public-v4.js` | Renderer público. | Tenta registro se presente e cai no renderer legado. |

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
- Presets legados podem conter variações sem renderer público; por isso o fallback continua obrigatório.
