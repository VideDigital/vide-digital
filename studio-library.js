(function () {
  "use strict";

  const palettes = [
    { id: "aurora", name: "Aurora", primary: "#7C3AED", accent: "#22D3EE", bg: "#0B1020", text: "#F8FAFC", soft: "#111A32" },
    { id: "ember", name: "Ember", primary: "#F97316", accent: "#F43F5E", bg: "#170B0B", text: "#FFF7ED", soft: "#2A1114" },
    { id: "forest", name: "Forest", primary: "#10B981", accent: "#84CC16", bg: "#071611", text: "#ECFDF5", soft: "#0D251C" },
    { id: "ocean", name: "Ocean", primary: "#2563EB", accent: "#06B6D4", bg: "#07152B", text: "#EFF6FF", soft: "#0C2142" },
    { id: "rose", name: "Rose", primary: "#E11D48", accent: "#FB7185", bg: "#1A0810", text: "#FFF1F2", soft: "#32101C" },
    { id: "gold", name: "Gold", primary: "#D97706", accent: "#FACC15", bg: "#17120A", text: "#FFFBEB", soft: "#2C220D" },
    { id: "mono", name: "Mono", primary: "#E5E7EB", accent: "#94A3B8", bg: "#09090B", text: "#FAFAFA", soft: "#18181B" },
    { id: "lavender", name: "Lavender", primary: "#A78BFA", accent: "#F0ABFC", bg: "#120D22", text: "#FAF5FF", soft: "#24163B" }
  ];

  const icons = {
    sparkle: "✦",
    check: "✓",
    star: "★",
    bolt: "↗",
    shield: "◆",
    heart: "♥",
    clock: "◷",
    chart: "⌁"
  };

  function design(palette, options) {
    const opts = options || {};
    return {
      corFundo: opts.bg || palette.bg,
      corTexto: opts.text || palette.text,
      corBotaoFundo: opts.button || palette.primary,
      corBotaoTexto: opts.buttonText || "#FFFFFF",
      corBotaoBorda: opts.buttonBorder || palette.primary,
      paddingTop: Number.isFinite(opts.paddingTop) ? opts.paddingTop : 72,
      paddingBottom: Number.isFinite(opts.paddingBottom) ? opts.paddingBottom : 72,
      alinhamento: opts.align || "esquerda",
      visivelDesktop: true,
      visivelMobile: true,
      raio: opts.radius || 0,
      sombra: opts.shadow || "soft",
      animacao: opts.animation || "fade-up"
    };
  }

  function block(type, props, palette, options) {
    return {
      tipo: type,
      visivel: true,
      props: props || {},
      design: design(palette, options || {}),
      _aba: "conteudo",
      _colapsado: true
    };
  }

  function heroBlocks(p, variant) {
    const titles = [
      "Transforme visitas em clientes todos os dias",
      "A experiência premium que sua marca merece",
      "Sua próxima grande campanha começa aqui",
      "Uma página feita para vender mais",
      "Destaque sua oferta com clareza e impacto",
      "Crie confiança antes mesmo do primeiro contato",
      "Um lançamento impossível de ignorar",
      "Sua marca, sua história, seu melhor resultado"
    ];
    return [
      block("texto_midia", {
        titulo: titles[variant % titles.length],
        subtitulo: "Apresente sua proposta de valor com uma mensagem objetiva, visual forte e chamada para ação em destaque.",
        botaoTexto: variant % 2 ? "Quero começar" : "Conhecer agora",
        botaoLink: "#contato",
        posicaoImagem: variant % 2 ? "esquerda" : "direita"
      }, p, {
        bg: p.bg,
        align: variant % 3 === 0 ? "centro" : "esquerda",
        paddingTop: 92,
        paddingBottom: 92,
        animation: variant % 2 ? "slide-right" : "fade-up"
      })
    ];
  }

  function benefitBlocks(p, variant) {
    const sets = [
      ["Atendimento rápido", "Experiência profissional", "Resultados mensuráveis"],
      ["Mais organização", "Mais confiança", "Mais conversão"],
      ["Estratégia clara", "Execução eficiente", "Crescimento sustentável"],
      ["Design responsivo", "Conteúdo objetivo", "Ação simplificada"]
    ];
    const items = sets[variant % sets.length];
    return [
      block("lista_cards", {
        titulo: variant % 2 ? "Por que escolher nossa solução" : "Tudo o que você precisa em um só lugar",
        cards: items.map((title, index) => ({
          icone: [icons.sparkle, icons.shield, icons.chart][index],
          titulo: title,
          texto: "Uma estrutura pensada para facilitar decisões e acelerar o próximo passo do seu cliente."
        }))
      }, p, { bg: p.soft, align: "centro", paddingTop: 64, paddingBottom: 64, radius: 24 })
    ];
  }

  function offerBlocks(p, variant) {
    return [
      block("texto_midia", {
        titulo: variant % 2 ? "Condição especial por tempo limitado" : "A oportunidade certa para avançar agora",
        subtitulo: "Reforce o valor da oferta, mostre o principal benefício e conduza o visitante para a ação.",
        botaoTexto: variant % 3 === 0 ? "Garantir condição" : "Aproveitar oferta",
        botaoLink: "#pedido",
        posicaoImagem: variant % 2 ? "direita" : "esquerda"
      }, p, { bg: p.primary, text: "#FFFFFF", button: "#FFFFFF", buttonText: p.bg, buttonBorder: "#FFFFFF", paddingTop: 72, paddingBottom: 72, align: "centro", radius: 22, shadow: "strong" }),
      block("lista_cards", {
        titulo: "O que está incluso",
        cards: [
          { icone: icons.check, titulo: "Benefício principal", texto: "Explique em uma frase o ganho mais importante." },
          { icone: icons.check, titulo: "Bônus exclusivo", texto: "Adicione um diferencial para aumentar o valor percebido." },
          { icone: icons.shield, titulo: "Compra segura", texto: "Reforce garantia, suporte ou política de atendimento." }
        ]
      }, p, { bg: p.soft, align: "centro", paddingTop: 54, paddingBottom: 54 })
    ];
  }

  function productBlocks(p, variant) {
    return [
      block("carrossel_produtos", {
        titulo: variant % 2 ? "Produtos em destaque" : "Escolhas que combinam com você",
        produtosIds: []
      }, p, { bg: p.bg, align: "centro", paddingTop: 68, paddingBottom: 68 }),
      block("texto_rico", {
        titulo: "Compra simples e atendimento próximo",
        conteudo: "Escolha seu produto, tire dúvidas pelo WhatsApp e receba uma experiência de compra clara do início ao fim."
      }, p, { bg: p.soft, align: "centro", paddingTop: 34, paddingBottom: 34 })
    ];
  }

  function testimonialBlocks(p, variant) {
    const cards = [
      { titulo: "Experiência excelente", texto: "O processo foi simples, rápido e muito bem explicado." },
      { titulo: "Atendimento que faz diferença", texto: "Recebi suporte em todas as etapas e fiquei muito satisfeita." },
      { titulo: "Resultado acima do esperado", texto: "A solução entregou exatamente o que eu precisava." }
    ];
    return [
      block("carrossel_cards", {
        titulo: variant % 2 ? "O que nossos clientes dizem" : "Histórias reais de quem já escolheu",
        estiloImagem: variant % 2 ? "topo" : "lado",
        cards: cards.map((item, index) => ({
          titulo: item.titulo,
          texto: item.texto,
          imagemB64: "",
          selo: `${5 - (index % 2)}.0`
        }))
      }, p, { bg: p.soft, align: "centro", paddingTop: 64, paddingBottom: 64, radius: 22 })
    ];
  }

  function formBlocks(p, variant) {
    const fields = variant % 3 === 0 ? ["nome", "whatsapp", "email"] : ["nome", "whatsapp"];
    return [
      block("formulario_captura", {
        titulo: variant % 2 ? "Receba uma proposta personalizada" : "Fale com nossa equipe",
        campos: fields,
        textoBotao: variant % 2 ? "Solicitar proposta" : "Quero atendimento"
      }, p, { bg: p.soft, align: "centro", paddingTop: 72, paddingBottom: 72, button: p.primary, radius: 24, shadow: "soft" })
    ];
  }

  function faqBlocks(p, variant) {
    const items = [
      { pergunta: "Como funciona o atendimento?", resposta: "Após o envio do formulário, nossa equipe entra em contato para entender sua necessidade." },
      { pergunta: "Quais são as formas de pagamento?", resposta: "As condições disponíveis podem ser apresentadas de acordo com o produto ou serviço escolhido." },
      { pergunta: "Existe suporte após a compra?", resposta: "Sim. Você recebe orientação e acompanhamento conforme a modalidade contratada." },
      { pergunta: "Em quanto tempo recebo retorno?", resposta: "Normalmente respondemos dentro do horário comercial pelo canal informado." }
    ];
    return [
      block("faq", {
        titulo: variant % 2 ? "Dúvidas frequentes" : "Tudo o que você precisa saber",
        itens: items.slice(0, 3 + (variant % 2))
      }, p, { bg: p.bg, align: "esquerda", paddingTop: 64, paddingBottom: 64 })
    ];
  }

  function pricingBlocks(p, variant) {
    return [
      block("tabela_comparativo", {
        titulo: variant % 2 ? "Escolha o plano ideal" : "Compare as opções",
        coluna1: "Essencial",
        coluna2: "Premium",
        linhas: [
          { label: "Atendimento", valor1: "Padrão", valor2: "Prioritário" },
          { label: "Recursos", valor1: "Essenciais", valor2: "Completos" },
          { label: "Suporte", valor1: "Comercial", valor2: "Estendido" },
          { label: "Personalização", valor1: "Básica", valor2: "Avançada" }
        ]
      }, p, { bg: p.soft, align: "centro", paddingTop: 70, paddingBottom: 70, radius: 24 }),
      block("texto_midia", {
        titulo: "Precisa de uma condição personalizada?",
        subtitulo: "Converse com nossa equipe e encontre a melhor configuração para o seu momento.",
        botaoTexto: "Falar com especialista",
        botaoLink: "#contato",
        posicaoImagem: "direita"
      }, p, { bg: p.primary, text: "#FFFFFF", button: "#FFFFFF", buttonText: p.bg, align: "centro", paddingTop: 48, paddingBottom: 48 })
    ];
  }

  function institutionalBlocks(p, variant) {
    return [
      block("texto_midia", {
        titulo: variant % 2 ? "Uma marca construída com propósito" : "Nossa história começa com pessoas",
        subtitulo: "Conte a origem do negócio, os valores que orientam suas escolhas e o impacto que deseja gerar.",
        botaoTexto: "Conheça nossa história",
        botaoLink: "#historia",
        posicaoImagem: variant % 2 ? "esquerda" : "direita"
      }, p, { bg: p.bg, align: "esquerda", paddingTop: 78, paddingBottom: 78 }),
      block("lista_cards", {
        titulo: "O que nos move",
        cards: [
          { icone: icons.heart, titulo: "Cuidado", texto: "Cada detalhe é pensado para criar uma experiência melhor." },
          { icone: icons.shield, titulo: "Confiança", texto: "Transparência e responsabilidade em todas as etapas." },
          { icone: icons.sparkle, titulo: "Evolução", texto: "Melhoria constante para entregar mais valor." }
        ]
      }, p, { bg: p.soft, align: "centro", paddingTop: 56, paddingBottom: 56 })
    ];
  }

  function launchBlocks(p, variant) {
    return [
      block("texto_midia", {
        titulo: variant % 2 ? "Inscrições abertas para a nova turma" : "O próximo nível começa agora",
        subtitulo: "Apresente o lançamento, destaque a transformação e conduza o visitante para a lista de espera ou inscrição.",
        botaoTexto: variant % 2 ? "Quero me inscrever" : "Entrar na lista",
        botaoLink: "#inscricao",
        posicaoImagem: variant % 2 ? "direita" : "esquerda"
      }, p, { bg: p.bg, align: "centro", paddingTop: 100, paddingBottom: 100, animation: "zoom-in" }),
      block("lista_cards", {
        titulo: "O que você vai encontrar",
        cards: [
          { icone: "01", titulo: "Método", texto: "Uma sequência clara para avançar com segurança." },
          { icone: "02", titulo: "Prática", texto: "Aplicação direta para transformar conhecimento em resultado." },
          { icone: "03", titulo: "Suporte", texto: "Acompanhamento para manter o ritmo e superar dúvidas." }
        ]
      }, p, { bg: p.soft, align: "centro", paddingTop: 60, paddingBottom: 60 }),
      block("formulario_captura", {
        titulo: "Garanta seu lugar",
        campos: ["nome", "whatsapp", "email"],
        textoBotao: "Confirmar inscrição"
      }, p, { bg: p.primary, text: "#FFFFFF", button: "#FFFFFF", buttonText: p.bg, align: "centro", paddingTop: 64, paddingBottom: 64 })
    ];
  }

  function eventBlocks(p, variant) {
    return [
      block("texto_midia", {
        titulo: variant % 2 ? "Um encontro para gerar novas possibilidades" : "Reserve esta data",
        subtitulo: "Apresente o tema, data, local e principal benefício do evento em uma primeira dobra objetiva.",
        botaoTexto: "Garantir participação",
        botaoLink: "#inscricao",
        posicaoImagem: variant % 2 ? "esquerda" : "direita"
      }, p, { bg: p.bg, align: "centro", paddingTop: 90, paddingBottom: 90 }),
      block("lista_cards", {
        titulo: "Informações do evento",
        cards: [
          { icone: icons.clock, titulo: "Data e horário", texto: "Adicione a data e o período de realização." },
          { icone: icons.chart, titulo: "Programação", texto: "Apresente os principais momentos da experiência." },
          { icone: icons.shield, titulo: "Local", texto: "Informe endereço, formato online ou orientações de acesso." }
        ]
      }, p, { bg: p.soft, align: "centro", paddingTop: 52, paddingBottom: 52 }),
      block("formulario_captura", {
        titulo: "Faça sua inscrição",
        campos: ["nome", "whatsapp", "email"],
        textoBotao: "Confirmar presença"
      }, p, { bg: p.bg, align: "centro", paddingTop: 64, paddingBottom: 64 })
    ];
  }

  function navigationBlocks(p, variant) {
    return [
      block("navegacao", {
        logoTexto: variant % 2 ? "Sua Marca" : "VIDE",
        links: [
          { label: "Início", href: "#inicio" },
          { label: "Benefícios", href: "#beneficios" },
          { label: "Produtos", href: "#produtos" },
          { label: "Contato", href: "#contato" }
        ]
      }, p, { bg: p.bg, align: "esquerda", paddingTop: 24, paddingBottom: 24 })
    ];
  }

  function footerBlocks(p, variant) {
    return [
      block("rodape", {
        textoCopyright: `© ${new Date().getFullYear()} Sua Marca. Todos os direitos reservados.`,
        links: [
          { label: "Política de privacidade", href: "#" },
          { label: "Termos de uso", href: "#" },
          { label: "Contato", href: "#contato" }
        ]
      }, p, { bg: variant % 2 ? p.bg : p.soft, align: "esquerda", paddingTop: 44, paddingBottom: 44 })
    ];
  }

  function galleryBlocks(p, variant) {
    return [
      block("galeria_imagens", {
        titulo: variant % 2 ? "Projetos em destaque" : "Conheça alguns resultados",
        imagens: []
      }, p, { bg: p.bg, align: "centro", paddingTop: 70, paddingBottom: 70 }),
      block("texto_rico", {
        titulo: "Uma seleção feita para inspirar confiança",
        conteudo: "Adicione imagens reais, resultados, bastidores ou detalhes do seu trabalho para tornar a apresentação mais concreta."
      }, p, { bg: p.soft, align: "centro", paddingTop: 36, paddingBottom: 36 })
    ];
  }

  function processBlocks(p, variant) {
    return [
      block("lista_cards", {
        titulo: variant % 2 ? "Como funciona" : "Seu caminho em três etapas",
        cards: [
          { icone: "01", titulo: "Conte sua necessidade", texto: "Envie as informações principais para iniciarmos o atendimento." },
          { icone: "02", titulo: "Receba a orientação", texto: "Nossa equipe apresenta o melhor caminho e os próximos passos." },
          { icone: "03", titulo: "Avance com segurança", texto: "Acompanhe a execução com clareza e suporte." }
        ]
      }, p, { bg: p.soft, align: "centro", paddingTop: 68, paddingBottom: 68, radius: 24 })
    ];
  }

  function whatsappBlocks(p, variant) {
    return [
      block("texto_midia", {
        titulo: variant % 2 ? "Prefere falar agora?" : "Atendimento direto pelo WhatsApp",
        subtitulo: "Tire dúvidas, receba orientação e continue o atendimento no canal que você já usa todos os dias.",
        botaoTexto: "Abrir WhatsApp",
        botaoLink: "https://wa.me/5500000000000",
        posicaoImagem: variant % 2 ? "direita" : "esquerda"
      }, p, { bg: "#062A20", text: "#ECFDF5", button: "#22C55E", buttonText: "#052E16", buttonBorder: "#22C55E", align: "centro", paddingTop: 62, paddingBottom: 62, radius: 24 })
    ];
  }

  const families = [
    { id: "hero", name: "Hero", category: "Hero", objective: "Apresentar", tags: ["primeira dobra", "cta", "impacto"], create: heroBlocks },
    { id: "benefits", name: "Benefícios", category: "Benefícios", objective: "Convencer", tags: ["benefícios", "cards", "diferenciais"], create: benefitBlocks },
    { id: "offer", name: "Oferta", category: "Conversão", objective: "Vender", tags: ["oferta", "urgência", "cta"], create: offerBlocks },
    { id: "products", name: "Produtos", category: "Produtos", objective: "Vender", tags: ["produtos", "catálogo", "vitrine"], create: productBlocks },
    { id: "testimonials", name: "Depoimentos", category: "Prova social", objective: "Gerar confiança", tags: ["depoimentos", "avaliações", "confiança"], create: testimonialBlocks },
    { id: "forms", name: "Formulário", category: "Formulários", objective: "Captar", tags: ["lead", "formulário", "contato"], create: formBlocks },
    { id: "faq", name: "FAQ", category: "FAQ", objective: "Remover objeções", tags: ["faq", "dúvidas", "objeções"], create: faqBlocks },
    { id: "pricing", name: "Planos", category: "Preços", objective: "Comparar", tags: ["preços", "planos", "comparação"], create: pricingBlocks },
    { id: "institutional", name: "Institucional", category: "Institucional", objective: "Apresentar", tags: ["sobre", "história", "marca"], create: institutionalBlocks },
    { id: "launch", name: "Lançamento", category: "Lançamentos", objective: "Lançar", tags: ["lançamento", "lista de espera", "inscrição"], create: launchBlocks },
    { id: "event", name: "Evento", category: "Eventos", objective: "Inscrever", tags: ["evento", "agenda", "inscrição"], create: eventBlocks },
    { id: "navigation", name: "Navegação", category: "Navegação", objective: "Navegar", tags: ["header", "menu", "navegação"], create: navigationBlocks },
    { id: "footer", name: "Rodapé", category: "Rodapés", objective: "Finalizar", tags: ["rodapé", "links", "legal"], create: footerBlocks },
    { id: "gallery", name: "Galeria", category: "Galerias", objective: "Mostrar", tags: ["galeria", "portfólio", "imagens"], create: galleryBlocks },
    { id: "process", name: "Processo", category: "Processos", objective: "Explicar", tags: ["passos", "processo", "como funciona"], create: processBlocks },
    { id: "whatsapp", name: "WhatsApp", category: "WhatsApp", objective: "Atender", tags: ["whatsapp", "atendimento", "contato"], create: whatsappBlocks }
  ];

  const presets = [];

  families.forEach((family, familyIndex) => {
    palettes.forEach((palette, paletteIndex) => {
      const variant = familyIndex + paletteIndex;
      presets.push({
        id: `${family.id}-${palette.id}`,
        nome: `${family.name} · ${palette.name}`,
        categoria: family.category,
        objetivo: family.objective,
        tags: [...family.tags, palette.name.toLowerCase()],
        accent: palette.primary,
        palette,
        blocos: family.create(palette, variant),
        tipo: "secao"
      });
    });
  });

  const pageKits = [
    {
      id: "kit-vendas-premium",
      nome: "Página de vendas premium",
      categoria: "Páginas completas",
      objetivo: "Vender",
      tags: ["página completa", "vendas", "oferta"],
      accent: palettes[0].primary,
      tipo: "pagina",
      blocos: [
        ...navigationBlocks(palettes[0], 0),
        ...heroBlocks(palettes[0], 1),
        ...benefitBlocks(palettes[0], 2),
        ...productBlocks(palettes[0], 3),
        ...testimonialBlocks(palettes[0], 4),
        ...offerBlocks(palettes[0], 5),
        ...faqBlocks(palettes[0], 6),
        ...formBlocks(palettes[0], 7),
        ...footerBlocks(palettes[0], 0)
      ]
    },
    {
      id: "kit-lancamento",
      nome: "Página de lançamento",
      categoria: "Páginas completas",
      objetivo: "Lançar",
      tags: ["página completa", "lançamento", "inscrição"],
      accent: palettes[7].primary,
      tipo: "pagina",
      blocos: [
        ...navigationBlocks(palettes[7], 1),
        ...launchBlocks(palettes[7], 2),
        ...processBlocks(palettes[7], 3),
        ...testimonialBlocks(palettes[7], 4),
        ...faqBlocks(palettes[7], 5),
        ...footerBlocks(palettes[7], 1)
      ]
    },
    {
      id: "kit-evento",
      nome: "Página para evento",
      categoria: "Páginas completas",
      objetivo: "Inscrever",
      tags: ["página completa", "evento", "agenda"],
      accent: palettes[3].primary,
      tipo: "pagina",
      blocos: [
        ...navigationBlocks(palettes[3], 0),
        ...eventBlocks(palettes[3], 1),
        ...testimonialBlocks(palettes[3], 2),
        ...faqBlocks(palettes[3], 3),
        ...footerBlocks(palettes[3], 0)
      ]
    },
    {
      id: "kit-servicos",
      nome: "Página de serviços",
      categoria: "Páginas completas",
      objetivo: "Apresentar",
      tags: ["página completa", "serviços", "orçamento"],
      accent: palettes[2].primary,
      tipo: "pagina",
      blocos: [
        ...navigationBlocks(palettes[2], 1),
        ...heroBlocks(palettes[2], 2),
        ...benefitBlocks(palettes[2], 3),
        ...processBlocks(palettes[2], 4),
        ...galleryBlocks(palettes[2], 5),
        ...testimonialBlocks(palettes[2], 6),
        ...formBlocks(palettes[2], 7),
        ...footerBlocks(palettes[2], 1)
      ]
    },
    {
      id: "kit-institucional",
      nome: "Página institucional",
      categoria: "Páginas completas",
      objetivo: "Construir marca",
      tags: ["página completa", "institucional", "marca"],
      accent: palettes[6].primary,
      tipo: "pagina",
      blocos: [
        ...navigationBlocks(palettes[6], 0),
        ...institutionalBlocks(palettes[6], 1),
        ...benefitBlocks(palettes[6], 2),
        ...galleryBlocks(palettes[6], 3),
        ...testimonialBlocks(palettes[6], 4),
        ...whatsappBlocks(palettes[6], 5),
        ...footerBlocks(palettes[6], 0)
      ]
    },
    {
      id: "kit-catalogo",
      nome: "Catálogo de produtos",
      categoria: "Páginas completas",
      objetivo: "Vender",
      tags: ["página completa", "catálogo", "produtos"],
      accent: palettes[4].primary,
      tipo: "pagina",
      blocos: [
        ...navigationBlocks(palettes[4], 1),
        ...heroBlocks(palettes[4], 2),
        ...productBlocks(palettes[4], 3),
        ...offerBlocks(palettes[4], 4),
        ...testimonialBlocks(palettes[4], 5),
        ...faqBlocks(palettes[4], 6),
        ...footerBlocks(palettes[4], 1)
      ]
    },
    {
      id: "kit-lead",
      nome: "Captação de leads",
      categoria: "Páginas completas",
      objetivo: "Captar",
      tags: ["página completa", "lead", "formulário"],
      accent: palettes[5].primary,
      tipo: "pagina",
      blocos: [
        ...heroBlocks(palettes[5], 1),
        ...benefitBlocks(palettes[5], 2),
        ...formBlocks(palettes[5], 3),
        ...testimonialBlocks(palettes[5], 4),
        ...faqBlocks(palettes[5], 5),
        ...footerBlocks(palettes[5], 1)
      ]
    },
    {
      id: "kit-whatsapp",
      nome: "Atendimento pelo WhatsApp",
      categoria: "Páginas completas",
      objetivo: "Atender",
      tags: ["página completa", "whatsapp", "contato"],
      accent: "#22C55E",
      tipo: "pagina",
      blocos: [
        ...navigationBlocks(palettes[2], 0),
        ...heroBlocks(palettes[2], 1),
        ...benefitBlocks(palettes[2], 2),
        ...whatsappBlocks(palettes[2], 3),
        ...faqBlocks(palettes[2], 4),
        ...footerBlocks(palettes[2], 0)
      ]
    }
  ];

  window.AURA_STUDIO_PALETTES = palettes;
  window.AURA_STUDIO_PRESETS = [...pageKits, ...presets];
  window.AURA_STUDIO_LIBRARY_VERSION = "1.0.0";
})();
