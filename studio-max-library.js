(function () {
  "use strict";

  const basePresets = Array.isArray(window.AURA_STUDIO_PRESETS)
    ? window.AURA_STUDIO_PRESETS
    : [];

  const existingIds = new Set(basePresets.map((item) => item && item.id).filter(Boolean));

  const palettes = [
    { id: "obsidian", name: "Obsidian", primary: "#7C3AED", accent: "#22D3EE", bg: "#080B14", soft: "#111827", text: "#F8FAFC" },
    { id: "velvet", name: "Velvet", primary: "#E11D48", accent: "#FB7185", bg: "#18070E", soft: "#2A0D18", text: "#FFF1F2" },
    { id: "emerald", name: "Emerald", primary: "#10B981", accent: "#84CC16", bg: "#06140E", soft: "#0C251A", text: "#ECFDF5" },
    { id: "cobalt", name: "Cobalt", primary: "#2563EB", accent: "#06B6D4", bg: "#06142C", soft: "#0C2345", text: "#EFF6FF" },
    { id: "amber", name: "Amber", primary: "#D97706", accent: "#FACC15", bg: "#171006", soft: "#2B1D08", text: "#FFFBEB" },
    { id: "graphite", name: "Graphite", primary: "#E5E7EB", accent: "#94A3B8", bg: "#09090B", soft: "#18181B", text: "#FAFAFA" },
    { id: "orchid", name: "Orchid", primary: "#A855F7", accent: "#F0ABFC", bg: "#12071E", soft: "#25103B", text: "#FAF5FF" },
    { id: "sunset", name: "Sunset", primary: "#F97316", accent: "#F43F5E", bg: "#180B08", soft: "#31120E", text: "#FFF7ED" },
    { id: "mint", name: "Mint", primary: "#14B8A6", accent: "#5EEAD4", bg: "#061513", soft: "#0B2925", text: "#F0FDFA" },
    { id: "royal", name: "Royal", primary: "#4F46E5", accent: "#8B5CF6", bg: "#0B0B20", soft: "#171638", text: "#EEF2FF" },
    { id: "sand", name: "Sand", primary: "#A16207", accent: "#EAB308", bg: "#17130C", soft: "#2B2517", text: "#FEFCE8" },
    { id: "ice", name: "Ice", primary: "#0284C7", accent: "#67E8F9", bg: "#06131B", soft: "#0B2735", text: "#F0F9FF" }
  ];

  const niches = [
    { id: "confeitaria", label: "Confeitaria", product: "seus doces", audience: "clientes que valorizam sabor e apresentação" },
    { id: "barbearia", label: "Barbearia", product: "seus serviços", audience: "homens que buscam estilo e cuidado" },
    { id: "beleza", label: "Beleza", product: "seus atendimentos", audience: "pessoas que desejam elevar a autoestima" },
    { id: "fitness", label: "Fitness", product: "seus programas", audience: "alunos que buscam evolução consistente" },
    { id: "restaurante", label: "Restaurante", product: "seu cardápio", audience: "clientes em busca de uma experiência marcante" },
    { id: "moda", label: "Moda", product: "suas coleções", audience: "clientes que desejam expressar personalidade" },
    { id: "servicos", label: "Serviços", product: "sua solução", audience: "clientes que precisam resolver um problema com segurança" },
    { id: "imobiliaria", label: "Imobiliária", product: "seus imóveis", audience: "pessoas prontas para encontrar o lugar ideal" },
    { id: "curso", label: "Curso Online", product: "seu método", audience: "alunos que querem aprender com clareza" },
    { id: "evento", label: "Evento", product: "seu evento", audience: "participantes em busca de uma experiência memorável" },
    { id: "igreja", label: "Igreja", product: "suas atividades", audience: "pessoas que desejam se conectar e participar" },
    { id: "tecnologia", label: "Tecnologia", product: "seu produto digital", audience: "equipes que buscam eficiência e inovação" },
    { id: "saude", label: "Saúde e Bem-estar", product: "seu atendimento", audience: "pessoas que priorizam qualidade de vida" },
    { id: "fotografia", label: "Fotografia", product: "seus ensaios", audience: "clientes que querem transformar momentos em memória" },
    { id: "arquitetura", label: "Arquitetura", product: "seus projetos", audience: "clientes que desejam espaços únicos e funcionais" },
    { id: "pet", label: "Pet", product: "seus produtos e serviços", audience: "tutores que cuidam dos animais como família" }
  ];

  const objectives = [
    { id: "vender", label: "Vender", cta: "Quero comprar", destination: "#oferta" },
    { id: "captar", label: "Captar leads", cta: "Quero saber mais", destination: "#contato" },
    { id: "agendar", label: "Agendar", cta: "Agendar agora", destination: "#agendamento" },
    { id: "apresentar", label: "Apresentar marca", cta: "Conhecer a marca", destination: "#sobre" },
    { id: "lancar", label: "Lançar", cta: "Entrar na lista", destination: "#inscricao" }
  ];

  const styleProfiles = [
    { id: "premium", label: "Premium", radius: 22, shadow: "strong", spacing: 88, align: "esquerda" },
    { id: "minimal", label: "Minimalista", radius: 8, shadow: "none", spacing: 72, align: "esquerda" },
    { id: "editorial", label: "Editorial", radius: 0, shadow: "soft", spacing: 104, align: "centro" },
    { id: "bold", label: "Impactante", radius: 28, shadow: "glow", spacing: 92, align: "centro" },
    { id: "clean", label: "Clean", radius: 16, shadow: "soft", spacing: 68, align: "esquerda" }
  ];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function design(palette, style, options) {
    const opts = options || {};
    return {
      corFundo: opts.bg || palette.bg,
      corTexto: opts.text || palette.text,
      corBotaoFundo: opts.button || palette.primary,
      corBotaoTexto: opts.buttonText || "#FFFFFF",
      corBotaoBorda: opts.buttonBorder || palette.primary,
      paddingTop: Number.isFinite(opts.paddingTop) ? opts.paddingTop : style.spacing,
      paddingBottom: Number.isFinite(opts.paddingBottom) ? opts.paddingBottom : style.spacing,
      alinhamento: opts.align || style.align,
      visivelDesktop: true,
      visivelMobile: true,
      priorizarImagem: Boolean(opts.priorizarImagem),
      raio: Number.isFinite(opts.radius) ? opts.radius : style.radius,
      sombra: opts.shadow || style.shadow,
      animacao: opts.animation || "fade-up",
      duracaoAnimacao: opts.duration || 650,
      idSecao: opts.idSecao || ""
    };
  }

  function block(tipo, props, palette, style, options) {
    return {
      tipo,
      visivel: true,
      props: props || {},
      design: design(palette, style, options),
      _aba: "conteudo",
      _colapsado: true
    };
  }

  function hero(niche, objective, palette, style, variant) {
    const titles = [
      `Uma nova forma de escolher ${niche.product}`,
      `${niche.label} com experiência realmente profissional`,
      `Transforme interesse em decisão com mais clareza`,
      `Tudo o que ${niche.audience} precisa encontrar`,
      `Uma apresentação à altura do valor da sua marca`
    ];
    return block("texto_midia", {
      titulo: titles[variant % titles.length],
      subtitulo: `Apresente sua proposta para ${niche.audience}, destaque os principais benefícios e conduza cada visitante para o próximo passo.`,
      botaoTexto: objective.cta,
      botaoLink: objective.destination,
      posicaoImagem: variant % 2 ? "esquerda" : "direita",
      imagemB64: ""
    }, palette, style, {
      bg: palette.bg,
      paddingTop: style.spacing + 20,
      paddingBottom: style.spacing + 20,
      align: variant % 3 === 2 ? "centro" : style.align,
      animation: variant % 2 ? "slide-right" : "fade-up",
      idSecao: "inicio",
      priorizarImagem: true
    });
  }

  function benefits(niche, palette, style, variant) {
    const cards = [
      { icone: "✦", titulo: "Experiência clara", texto: `Mostre ${niche.product} de forma organizada, objetiva e fácil de entender.` },
      { icone: "◆", titulo: "Confiança desde o início", texto: "Reforce diferenciais, qualidade e segurança antes do primeiro contato." },
      { icone: "↗", titulo: "Próximo passo simples", texto: "Leve o visitante para compra, formulário ou WhatsApp sem distrações." }
    ];
    if (variant % 2) cards.push({ icone: "✓", titulo: "Atendimento próximo", texto: "Crie uma jornada acolhedora e alinhada ao posicionamento da marca." });
    return block("lista_cards", {
      titulo: variant % 2 ? "Por que essa escolha faz sentido" : "Tudo pensado para facilitar sua decisão",
      cards
    }, palette, style, {
      bg: palette.soft,
      align: "centro",
      paddingTop: 64,
      paddingBottom: 64,
      idSecao: "beneficios"
    });
  }

  function proof(niche, palette, style, variant) {
    return block("carrossel_cards", {
      titulo: variant % 2 ? "Resultados que constroem confiança" : "O que nossos clientes destacam",
      estiloImagem: variant % 2 ? "topo" : "lado",
      cards: [
        { titulo: "Atendimento excelente", texto: "Tudo foi explicado com clareza e o processo ficou muito mais simples.", imagemB64: "", selo: "5.0" },
        { titulo: "Qualidade percebida", texto: `A apresentação de ${niche.product} transmite profissionalismo em cada detalhe.`, imagemB64: "", selo: "4.9" },
        { titulo: "Experiência acima do esperado", texto: "A combinação entre agilidade, cuidado e resultado fez toda a diferença.", imagemB64: "", selo: "5.0" }
      ]
    }, palette, style, {
      bg: palette.soft,
      align: "centro",
      paddingTop: 70,
      paddingBottom: 70,
      idSecao: "depoimentos"
    });
  }

  function offer(niche, objective, palette, style, variant) {
    return block("texto_midia", {
      titulo: variant % 2 ? "Uma condição especial para avançar agora" : `Dê o próximo passo com ${niche.product}`,
      subtitulo: "Reforce o valor da oferta, destaque o benefício mais importante e elimine a dúvida que impede a decisão.",
      botaoTexto: objective.cta,
      botaoLink: objective.destination,
      posicaoImagem: variant % 2 ? "direita" : "esquerda",
      imagemB64: ""
    }, palette, style, {
      bg: palette.primary,
      text: "#FFFFFF",
      button: "#FFFFFF",
      buttonText: palette.bg,
      buttonBorder: "#FFFFFF",
      align: "centro",
      paddingTop: 78,
      paddingBottom: 78,
      radius: style.radius,
      shadow: style.shadow,
      idSecao: "oferta"
    });
  }

  function process(niche, palette, style, variant) {
    return block("lista_cards", {
      titulo: variant % 2 ? "Como funciona na prática" : "Do interesse ao resultado em poucos passos",
      cards: [
        { icone: "01", titulo: "Escolha", texto: `Encontre a opção de ${niche.product} que combina com sua necessidade.` },
        { icone: "02", titulo: "Converse", texto: "Envie suas informações e receba orientação personalizada." },
        { icone: "03", titulo: "Avance", texto: "Confirme os detalhes e siga para a próxima etapa com segurança." }
      ]
    }, palette, style, {
      bg: palette.bg,
      align: "centro",
      paddingTop: 64,
      paddingBottom: 64,
      idSecao: "como-funciona"
    });
  }

  function faq(niche, palette, style, variant) {
    return block("faq", {
      titulo: variant % 2 ? "Dúvidas frequentes" : "Informações importantes antes de começar",
      itens: [
        { pergunta: "Como funciona o atendimento?", resposta: "Depois do contato, nossa equipe entende sua necessidade e apresenta o melhor caminho." },
        { pergunta: "Quais formas de pagamento estão disponíveis?", resposta: "As condições podem variar conforme a opção escolhida e serão apresentadas com transparência." },
        { pergunta: `Como escolher ${niche.product}?`, resposta: "Você pode explicar seu objetivo e receber orientação para tomar a melhor decisão." },
        { pergunta: "Em quanto tempo recebo retorno?", resposta: "O retorno normalmente acontece dentro do horário comercial pelo canal informado." }
      ]
    }, palette, style, {
      bg: palette.bg,
      align: "esquerda",
      paddingTop: 64,
      paddingBottom: 64,
      idSecao: "faq"
    });
  }

  function form(niche, objective, palette, style, variant) {
    const fieldSets = [
      ["nome", "whatsapp"],
      ["nome", "whatsapp", "email"],
      ["nome", "whatsapp", "produtoInteresse"]
    ];
    return block("formulario_captura", {
      titulo: objective.id === "agendar" ? "Solicite seu agendamento" : objective.id === "captar" ? "Receba mais informações" : "Fale com nossa equipe",
      campos: fieldSets[variant % fieldSets.length],
      textoBotao: objective.cta,
      statusInicial: "novo",
      prioridadeInicial: "normal"
    }, palette, style, {
      bg: palette.soft,
      align: "centro",
      paddingTop: 72,
      paddingBottom: 72,
      radius: Math.max(16, style.radius),
      idSecao: "contato"
    });
  }

  function products(niche, palette, style, variant) {
    return block("carrossel_produtos", {
      titulo: variant % 2 ? `${niche.label}: escolhas em destaque` : "Conheça nossas principais opções",
      produtosIds: []
    }, palette, style, {
      bg: palette.bg,
      align: "centro",
      paddingTop: 72,
      paddingBottom: 72,
      idSecao: "produtos"
    });
  }

  function gallery(niche, palette, style, variant) {
    return block("galeria_imagens", {
      titulo: variant % 2 ? "Detalhes que mostram nosso cuidado" : `Conheça mais sobre ${niche.product}`,
      imagens: []
    }, palette, style, {
      bg: palette.soft,
      align: "centro",
      paddingTop: 70,
      paddingBottom: 70,
      idSecao: "galeria"
    });
  }

  function richText(niche, palette, style, variant) {
    return block("texto_rico", {
      titulo: variant % 2 ? "Uma experiência criada com propósito" : `O cuidado por trás de ${niche.product}`,
      conteudo: `Cada detalhe foi pensado para atender ${niche.audience}. Use esta seção para contar sua história, explicar seu método e mostrar por que sua proposta é diferente.`
    }, palette, style, {
      bg: palette.bg,
      align: variant % 2 ? "centro" : "esquerda",
      paddingTop: 62,
      paddingBottom: 62,
      idSecao: "sobre"
    });
  }

  function comparison(niche, palette, style, variant) {
    return block("tabela_comparativo", {
      titulo: variant % 2 ? "Compare e escolha com clareza" : "Encontre a opção ideal",
      coluna1: "Essencial",
      coluna2: "Premium",
      linhas: [
        { titulo: "Atendimento personalizado", valor1: "✓", valor2: "✓" },
        { titulo: `Acesso completo a ${niche.product}`, valor1: "—", valor2: "✓" },
        { titulo: "Suporte prioritário", valor1: "—", valor2: "✓" },
        { titulo: "Condição especial", valor1: "✓", valor2: "✓" }
      ]
    }, palette, style, {
      bg: palette.soft,
      align: "centro",
      paddingTop: 70,
      paddingBottom: 70,
      idSecao: "comparacao"
    });
  }

  function footer(niche, palette, style) {
    return block("rodape", {
      logoTexto: niche.label,
      textoCopyright: `© ${new Date().getFullYear()} ${niche.label}. Todos os direitos reservados.`,
      links: [
        { texto: "Início", url: "#inicio" },
        { texto: "Sobre", url: "#sobre" },
        { texto: "Contato", url: "#contato" }
      ]
    }, palette, style, {
      bg: palette.soft,
      align: "centro",
      paddingTop: 46,
      paddingBottom: 46
    });
  }

  const familyBuilders = [
    { id: "heroes", label: "Heroes MAX", objective: "Converter", build: hero },
    { id: "benefits", label: "Benefícios MAX", objective: "Apresentar", build: benefits },
    { id: "proof", label: "Prova social MAX", objective: "Construir confiança", build: proof },
    { id: "offers", label: "Ofertas MAX", objective: "Vender", build: offer },
    { id: "process", label: "Processos MAX", objective: "Explicar", build: process },
    { id: "faq", label: "FAQ MAX", objective: "Reduzir objeções", build: faq },
    { id: "forms", label: "Formulários MAX", objective: "Captar", build: form },
    { id: "products", label: "Produtos MAX", objective: "Vender", build: products },
    { id: "gallery", label: "Galerias MAX", objective: "Apresentar", build: gallery },
    { id: "story", label: "Institucional MAX", objective: "Construir marca", build: richText },
    { id: "comparison", label: "Comparativos MAX", objective: "Converter", build: comparison }
  ];

  const generated = [];

  familyBuilders.forEach((family, familyIndex) => {
    niches.slice(0, 10).forEach((niche, nicheIndex) => {
      const palette = palettes[(familyIndex + nicheIndex) % palettes.length];
      const style = styleProfiles[(familyIndex + nicheIndex) % styleProfiles.length];
      const objective = objectives[(familyIndex + nicheIndex) % objectives.length];
      const variant = familyIndex + nicheIndex;
      let built;
      if (["heroes", "offers", "forms"].includes(family.id)) {
        built = family.build(niche, objective, palette, style, variant);
      } else {
        built = family.build(niche, palette, style, variant);
      }
      const id = `max-${family.id}-${niche.id}-${style.id}`;
      if (existingIds.has(id)) return;
      generated.push({
        id,
        nome: `${family.label} · ${niche.label}`,
        categoria: family.label,
        objetivo: family.objective,
        nicho: niche.id,
        estilo: style.id,
        tags: [family.id, niche.label, style.label, family.objective, "max"],
        accent: palette.primary,
        palette: clone(palette),
        tipo: "secao",
        blocos: [built]
      });
      existingIds.add(id);
    });
  });

  niches.forEach((niche, nicheIndex) => {
    objectives.forEach((objective, objectiveIndex) => {
      const palette = palettes[(nicheIndex + objectiveIndex) % palettes.length];
      const style = styleProfiles[(nicheIndex + objectiveIndex) % styleProfiles.length];
      const id = `max-page-${niche.id}-${objective.id}`;
      if (existingIds.has(id)) return;
      const variant = nicheIndex + objectiveIndex;
      const blocks = [
        hero(niche, objective, palette, style, variant),
        benefits(niche, palette, style, variant),
        richText(niche, palette, style, variant),
        objective.id === "vender" ? products(niche, palette, style, variant) : process(niche, palette, style, variant),
        gallery(niche, palette, style, variant),
        proof(niche, palette, style, variant),
        objective.id === "vender" ? offer(niche, objective, palette, style, variant) : form(niche, objective, palette, style, variant),
        comparison(niche, palette, style, variant),
        faq(niche, palette, style, variant),
        form(niche, objective, palette, style, variant + 1),
        footer(niche, palette, style)
      ];
      generated.push({
        id,
        nome: `${niche.label} · ${objective.label}`,
        categoria: "Páginas MAX",
        objetivo: objective.label,
        nicho: niche.id,
        estilo: style.id,
        tags: ["página completa", niche.label, objective.label, style.label, "max"],
        accent: palette.primary,
        palette: clone(palette),
        tipo: "pagina",
        blocos: blocks
      });
      existingIds.add(id);
    });
  });

  const unique = [...basePresets];
  generated.forEach((item) => {
    if (!unique.some((current) => current && current.id === item.id)) unique.push(item);
  });

  window.AURA_STUDIO_MAX_PALETTES = palettes;
  window.AURA_STUDIO_MAX_NICHES = niches;
  window.AURA_STUDIO_MAX_OBJECTIVES = objectives;
  window.AURA_STUDIO_MAX_STYLES = styleProfiles;
  window.AURA_STUDIO_PRESETS = unique;
  window.AURA_STUDIO_LIBRARY_VERSION = "2.0.0-max";

  document.dispatchEvent(new CustomEvent("aura:studio-library-expanded", {
    detail: {
      added: generated.length,
      total: unique.length,
      pages: generated.filter((item) => item.tipo === "pagina").length
    }
  }));

  console.info("[Vide Aura Studio MAX] Biblioteca expandida", {
    added: generated.length,
    total: unique.length
  });
})();
