(function () {
  "use strict";

  const clone = (value) => JSON.parse(JSON.stringify(value));

  const niches = [
    { id: "confeitaria", label: "Confeitaria", singular: "produto artesanal", plural: "doces e experiências", audience: "clientes que valorizam sabor, apresentação e exclusividade", hero: "Transforme cada ocasião em uma lembrança inesquecível", proof: "Pedidos feitos com cuidado, acabamento profissional e atendimento próximo", cta: "Quero fazer meu pedido", benefits: ["Produção artesanal", "Personalização cuidadosa", "Atendimento próximo"] },
    { id: "barbearia", label: "Barbearia", singular: "atendimento premium", plural: "cortes e experiências", audience: "homens que querem estilo, praticidade e confiança", hero: "Seu estilo começa com um atendimento que entende você", proof: "Técnica, precisão e uma experiência pensada do início ao fim", cta: "Agendar meu horário", benefits: ["Profissionais especializados", "Ambiente confortável", "Horário reservado"] },
    { id: "beleza", label: "Beleza e Estética", singular: "procedimento", plural: "cuidados e resultados", audience: "pessoas que querem se sentir mais confiantes", hero: "Realce sua melhor versão com cuidado e técnica", proof: "Protocolos personalizados, atenção aos detalhes e acompanhamento próximo", cta: "Quero uma avaliação", benefits: ["Avaliação personalizada", "Protocolos seguros", "Acompanhamento próximo"] },
    { id: "fitness", label: "Fitness", singular: "programa", plural: "treinos e resultados", audience: "pessoas que buscam evolução com orientação", hero: "Treine com direção e transforme esforço em resultado", proof: "Método claro, acompanhamento e evolução que você consegue medir", cta: "Começar minha evolução", benefits: ["Plano direcionado", "Acompanhamento", "Evolução consistente"] },
    { id: "restaurante", label: "Restaurante", singular: "experiência gastronômica", plural: "sabores e momentos", audience: "pessoas que querem comer bem e viver bons momentos", hero: "Uma experiência gastronômica feita para ser lembrada", proof: "Ingredientes selecionados, apresentação cuidadosa e atendimento acolhedor", cta: "Fazer uma reserva", benefits: ["Ingredientes selecionados", "Ambiente acolhedor", "Atendimento atencioso"] },
    { id: "moda", label: "Moda", singular: "coleção", plural: "peças e estilos", audience: "pessoas que querem vestir identidade", hero: "Peças que acompanham seu estilo e valorizam quem você é", proof: "Curadoria, qualidade e combinações pensadas para o seu dia a dia", cta: "Conhecer a coleção", benefits: ["Curadoria exclusiva", "Qualidade nos detalhes", "Compra descomplicada"] },
    { id: "servicos", label: "Prestação de Serviços", singular: "serviço", plural: "soluções e resultados", audience: "clientes que precisam de uma solução confiável", hero: "A solução certa para transformar necessidade em resultado", proof: "Processo claro, execução responsável e comunicação em cada etapa", cta: "Solicitar orçamento", benefits: ["Diagnóstico claro", "Execução profissional", "Suporte próximo"] },
    { id: "imobiliaria", label: "Imobiliária", singular: "imóvel", plural: "oportunidades e conquistas", audience: "pessoas que querem comprar, vender ou alugar com segurança", hero: "Encontre o imóvel certo para o próximo capítulo da sua vida", proof: "Curadoria, transparência e acompanhamento em todas as etapas", cta: "Encontrar meu imóvel", benefits: ["Curadoria de imóveis", "Atendimento consultivo", "Negociação segura"] },
    { id: "curso", label: "Curso Online", singular: "treinamento", plural: "aulas e transformação", audience: "pessoas que querem aprender de forma prática", hero: "Aprenda um método claro e avance com confiança", proof: "Conteúdo organizado, aplicação prática e suporte para acelerar sua evolução", cta: "Quero começar agora", benefits: ["Método passo a passo", "Acesso prático", "Suporte ao aluno"] },
    { id: "evento", label: "Evento", singular: "evento", plural: "experiências e conexões", audience: "pessoas que querem viver uma experiência marcante", hero: "Um encontro criado para gerar conexão, aprendizado e memória", proof: "Programação organizada, experiência fluida e conteúdo relevante", cta: "Garantir minha inscrição", benefits: ["Programação relevante", "Experiência organizada", "Conexões valiosas"] },
    { id: "igreja", label: "Igreja e Ministério", singular: "encontro", plural: "cultos e comunhão", audience: "pessoas que buscam comunhão, propósito e crescimento", hero: "Um lugar para pertencer, crescer e viver propósito", proof: "Comunhão, ensino e cuidado em uma comunidade que caminha junto", cta: "Quero conhecer", benefits: ["Comunhão verdadeira", "Ensino bíblico", "Cuidado com pessoas"] },
    { id: "tecnologia", label: "Tecnologia e SaaS", singular: "plataforma", plural: "recursos e produtividade", audience: "equipes que querem operar melhor e crescer", hero: "Simplifique sua operação e transforme dados em decisões", proof: "Automação, visão centralizada e uma experiência criada para produtividade", cta: "Testar a plataforma", benefits: ["Operação centralizada", "Automação inteligente", "Dados em tempo real"] },
    { id: "saude", label: "Saúde", singular: "atendimento", plural: "cuidados e bem-estar", audience: "pessoas que procuram cuidado profissional", hero: "Cuidado profissional para viver com mais qualidade", proof: "Escuta, orientação e acompanhamento com responsabilidade", cta: "Agendar atendimento", benefits: ["Atendimento humanizado", "Orientação responsável", "Acompanhamento"] },
    { id: "fotografia", label: "Fotografia", singular: "ensaio", plural: "histórias e registros", audience: "pessoas que querem guardar momentos importantes", hero: "Transforme momentos em imagens que continuam contando sua história", proof: "Direção leve, olhar sensível e entrega com acabamento profissional", cta: "Quero meu ensaio", benefits: ["Direção durante o ensaio", "Olhar autoral", "Entrega profissional"] },
    { id: "arquitetura", label: "Arquitetura e Interiores", singular: "projeto", plural: "ambientes e possibilidades", audience: "pessoas que querem espaços funcionais e bonitos", hero: "Projetos que transformam espaços em experiências", proof: "Estratégia, estética e funcionalidade conectadas ao seu estilo de vida", cta: "Falar sobre meu projeto", benefits: ["Projeto personalizado", "Visão funcional", "Acompanhamento técnico"] },
    { id: "pet", label: "Pet", singular: "cuidado", plural: "serviços e bem-estar", audience: "tutores que querem o melhor para seus animais", hero: "Cuidado, carinho e segurança para quem faz parte da família", proof: "Atendimento atencioso, rotina segura e comunicação com o tutor", cta: "Agendar atendimento", benefits: ["Cuidado individual", "Ambiente seguro", "Comunicação com o tutor"] },
    { id: "advocacia", label: "Advocacia", singular: "orientação jurídica", plural: "soluções e segurança", audience: "pessoas e empresas que precisam de orientação clara", hero: "Estratégia jurídica com clareza, responsabilidade e proximidade", proof: "Análise cuidadosa, comunicação objetiva e condução responsável", cta: "Solicitar análise", benefits: ["Análise estratégica", "Comunicação clara", "Atuação responsável"] },
    { id: "educacao", label: "Educação", singular: "programa educacional", plural: "aprendizado e desenvolvimento", audience: "alunos e famílias que buscam evolução", hero: "Aprendizado com direção, acolhimento e resultado", proof: "Metodologia organizada, acompanhamento e desenvolvimento contínuo", cta: "Conhecer a proposta", benefits: ["Metodologia clara", "Acompanhamento", "Desenvolvimento integral"] },
    { id: "automotivo", label: "Automotivo", singular: "solução automotiva", plural: "veículos e serviços", audience: "pessoas que valorizam segurança e confiança", hero: "Seu próximo passo na estrada começa com uma escolha segura", proof: "Atendimento consultivo, transparência e suporte em cada etapa", cta: "Falar com um especialista", benefits: ["Atendimento consultivo", "Condições claras", "Suporte completo"] },
    { id: "marketing", label: "Marketing e Agência", singular: "estratégia", plural: "campanhas e crescimento", audience: "negócios que querem crescer com direção", hero: "Transforme presença digital em crescimento previsível", proof: "Estratégia, criatividade e acompanhamento orientado por dados", cta: "Quero uma estratégia", benefits: ["Planejamento estratégico", "Execução criativa", "Análise de resultados"] },
    { id: "consultoria", label: "Consultoria", singular: "diagnóstico", plural: "estratégias e decisões", audience: "gestores que precisam de clareza para avançar", hero: "Clareza para decidir, estratégia para crescer", proof: "Diagnóstico profundo, plano de ação e acompanhamento objetivo", cta: "Solicitar diagnóstico", benefits: ["Visão externa", "Plano de ação", "Acompanhamento"] },
    { id: "turismo", label: "Turismo e Viagens", singular: "experiência", plural: "destinos e memórias", audience: "pessoas que querem viajar com tranquilidade", hero: "Sua próxima grande memória começa com uma viagem bem planejada", proof: "Curadoria de destinos, organização e suporte do início ao fim", cta: "Planejar minha viagem", benefits: ["Roteiro personalizado", "Organização completa", "Suporte durante a viagem"] },
    { id: "musica", label: "Música", singular: "projeto musical", plural: "sons e experiências", audience: "pessoas que querem aprender, contratar ou acompanhar música", hero: "Música que conecta, inspira e transforma momentos", proof: "Experiência, sensibilidade e entrega profissional", cta: "Quero saber mais", benefits: ["Experiência musical", "Atendimento personalizado", "Entrega profissional"] },
    { id: "artesanato", label: "Artesanato", singular: "peça artesanal", plural: "peças e histórias", audience: "pessoas que valorizam exclusividade e cuidado", hero: "Peças únicas feitas com cuidado para contar histórias", proof: "Produção artesanal, personalização e atenção em cada detalhe", cta: "Conhecer as peças", benefits: ["Feito à mão", "Personalização", "Acabamento cuidadoso"] }
  ];

  const objectives = [
    { id: "vender", label: "Vender", cta: "Comprar agora", order: ["navigation", "hero", "benefits", "products", "proof", "offer", "guarantee", "faq", "form", "footer"] },
    { id: "captar", label: "Captar leads", cta: "Quero receber", order: ["navigation", "hero", "benefits", "proof", "form", "faq", "footer"] },
    { id: "agendar", label: "Agendar", cta: "Agendar agora", order: ["navigation", "hero", "benefits", "process", "proof", "form", "faq", "footer"] },
    { id: "apresentar", label: "Apresentar marca", cta: "Conhecer mais", order: ["navigation", "hero", "story", "benefits", "gallery", "proof", "contact", "footer"] },
    { id: "lancar", label: "Lançar", cta: "Entrar agora", order: ["navigation", "hero", "urgency", "benefits", "process", "proof", "offer", "form", "faq", "footer"] },
    { id: "evento", label: "Inscrever em evento", cta: "Garantir inscrição", order: ["navigation", "hero", "stats", "process", "proof", "offer", "form", "faq", "footer"] },
    { id: "whatsapp", label: "Gerar conversas", cta: "Chamar no WhatsApp", order: ["navigation", "hero", "benefits", "proof", "contact", "faq", "footer"] },
    { id: "orcamento", label: "Solicitar orçamento", cta: "Pedir orçamento", order: ["navigation", "hero", "benefits", "process", "proof", "comparison", "form", "faq", "footer"] }
  ];

  const styles = [
    { id: "obsidian", label: "Obsidian", primary: "#7C3AED", accent: "#22D3EE", bg: "#070A12", soft: "#101726", text: "#F8FAFC", radius: 22, shadow: "strong" },
    { id: "editorial", label: "Editorial", primary: "#111827", accent: "#B45309", bg: "#F8F5EE", soft: "#EFE8DC", text: "#111827", radius: 4, shadow: "none" },
    { id: "luxury", label: "Luxury", primary: "#C6A15B", accent: "#F5E7C6", bg: "#080706", soft: "#17130F", text: "#FFF9ED", radius: 12, shadow: "soft" },
    { id: "clean", label: "Clean", primary: "#2563EB", accent: "#0EA5E9", bg: "#F8FAFC", soft: "#EAF1FB", text: "#0F172A", radius: 18, shadow: "soft" },
    { id: "vibrant", label: "Vibrante", primary: "#F43F5E", accent: "#8B5CF6", bg: "#120A1B", soft: "#24102E", text: "#FFF7FB", radius: 26, shadow: "glow" },
    { id: "nature", label: "Nature", primary: "#15803D", accent: "#84CC16", bg: "#07140D", soft: "#10271A", text: "#F0FDF4", radius: 24, shadow: "soft" },
    { id: "sunset", label: "Sunset", primary: "#EA580C", accent: "#F59E0B", bg: "#1B0A05", soft: "#34150B", text: "#FFF7ED", radius: 28, shadow: "strong" },
    { id: "royal", label: "Royal", primary: "#1D4ED8", accent: "#EAB308", bg: "#071226", soft: "#0D2145", text: "#EFF6FF", radius: 16, shadow: "strong" },
    { id: "mono", label: "Monocromático", primary: "#E5E7EB", accent: "#9CA3AF", bg: "#09090B", soft: "#18181B", text: "#FAFAFA", radius: 14, shadow: "soft" },
    { id: "pastel", label: "Pastel", primary: "#A78BFA", accent: "#F9A8D4", bg: "#FFF7FB", soft: "#F3E8FF", text: "#3B2349", radius: 30, shadow: "soft" }
  ];

  const families = [
    { id: "navigation", label: "Cabeçalho" },
    { id: "hero", label: "Hero" },
    { id: "benefits", label: "Benefícios" },
    { id: "stats", label: "Números" },
    { id: "story", label: "História" },
    { id: "process", label: "Processo" },
    { id: "products", label: "Produtos" },
    { id: "gallery", label: "Galeria" },
    { id: "proof", label: "Prova social" },
    { id: "comparison", label: "Comparativo" },
    { id: "offer", label: "Oferta" },
    { id: "urgency", label: "Urgência" },
    { id: "guarantee", label: "Garantia" },
    { id: "form", label: "Formulário" },
    { id: "contact", label: "Contato" },
    { id: "faq", label: "FAQ" },
    { id: "rich", label: "Conteúdo rico" },
    { id: "footer", label: "Rodapé" }
  ];

  const id = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  function getNiche(value) {
    return niches.find((item) => item.id === value) || niches[0];
  }

  function getObjective(value) {
    return objectives.find((item) => item.id === value) || objectives[0];
  }

  function getStyle(value) {
    return styles.find((item) => item.id === value) || styles[0];
  }

  function design(style, options) {
    const opts = options || {};
    return {
      corFundo: opts.bg || style.bg,
      corTexto: opts.text || style.text,
      corBotaoFundo: opts.button || style.primary,
      corBotaoTexto: opts.buttonText || "#FFFFFF",
      corBotaoBorda: opts.buttonBorder || style.primary,
      paddingTop: Number.isFinite(opts.paddingTop) ? opts.paddingTop : 72,
      paddingBottom: Number.isFinite(opts.paddingBottom) ? opts.paddingBottom : 72,
      alinhamento: opts.align || "esquerda",
      visivelDesktop: opts.desktop !== false,
      visivelMobile: opts.mobile !== false,
      raio: Number.isFinite(opts.radius) ? opts.radius : style.radius,
      sombra: opts.shadow || style.shadow,
      animacao: opts.animation || "fade-up",
      duracaoAnimacao: Number.isFinite(opts.duration) ? opts.duration : 650,
      atrasoAnimacao: Number.isFinite(opts.delay) ? opts.delay : 0,
      idSecao: opts.sectionId || ""
    };
  }

  function block(type, props, style, options) {
    return {
      id: id("lpb_ultimate"),
      tipo: type,
      visivel: true,
      props: props || {},
      design: design(style, options),
      _aba: "conteudo",
      _colapsado: true,
      _auraUltimate: true
    };
  }

  function nav(niche, objective, style, variant) {
    return block("navegacao", {
      logoTexto: niche.label,
      links: [
        { label: "Início", href: "#inicio" },
        { label: variant % 2 ? "Diferenciais" : "Benefícios", href: "#beneficios" },
        { label: "Como funciona", href: "#processo" },
        { label: objective.cta, href: "#contato" }
      ]
    }, style, { bg: style.bg, paddingTop: 18, paddingBottom: 18, sectionId: "inicio", shadow: "soft" });
  }

  function hero(niche, objective, style, variant) {
    const titles = [
      niche.hero,
      `${niche.label}: uma experiência criada para gerar confiança e resultado`,
      `O próximo passo de quem procura ${niche.plural}`,
      `Mais clareza, mais valor e uma experiência que conduz à ação`
    ];
    return block("texto_midia", {
      titulo: titles[variant % titles.length],
      subtitulo: `Uma apresentação profissional para ${niche.audience}, com mensagem clara, proposta de valor forte e atendimento simples do primeiro contato ao próximo passo.`,
      botaoTexto: objective.cta || niche.cta,
      botaoLink: "#contato",
      posicaoImagem: variant % 2 ? "esquerda" : "direita",
      imagemB64: "",
      imagemAlt: `${niche.label} em destaque`
    }, style, { bg: style.bg, paddingTop: 104, paddingBottom: 104, align: variant % 3 === 0 ? "centro" : "esquerda", sectionId: "inicio", shadow: "strong", animation: variant % 2 ? "slide-right" : "fade-up" });
  }

  function benefits(niche, objective, style, variant) {
    const extra = ["Processo simples", "Comunicação clara", "Experiência premium"];
    const items = niche.benefits.map((title, index) => ({
      icone: ["◆", "✓", "↗"][index],
      titulo: title,
      texto: `${title} para tornar a experiência mais clara, segura e preparada para gerar resultado.`
    }));
    if (variant % 2) items.push({ icone: "✦", titulo: extra[variant % extra.length], texto: "Uma etapa adicional para aumentar valor percebido e reduzir objeções." });
    return block("lista_cards", { titulo: variant % 2 ? "O que torna essa experiência diferente" : "Tudo o que você precisa para avançar", cards: items }, style, { bg: style.soft, paddingTop: 72, paddingBottom: 72, align: "centro", sectionId: "beneficios", radius: style.radius });
  }

  function stats(niche, objective, style, variant) {
    const cards = [
      { icone: "98%", titulo: "Satisfação", texto: "Experiência construída para gerar confiança." },
      { icone: "24h", titulo: "Retorno", texto: "Contato rápido para manter o interesse ativo." },
      { icone: "+500", titulo: "Atendimentos", texto: "Uma operação preparada para acompanhar cada oportunidade." }
    ];
    if (variant % 2) cards[2] = { icone: "4.9", titulo: "Avaliação", texto: "Percepção positiva em cada ponto de contato." };
    return block("lista_cards", { titulo: "Resultados que ajudam a decidir", cards }, style, { bg: style.bg, paddingTop: 56, paddingBottom: 56, align: "centro", sectionId: "resultados" });
  }

  function story(niche, objective, style, variant) {
    return block("texto_midia", {
      titulo: variant % 2 ? "Uma história construída com propósito" : `Por que escolhemos trabalhar com ${niche.plural}`,
      subtitulo: `Acreditamos que ${niche.singular} deve unir qualidade, clareza e cuidado. Por isso, cada etapa foi pensada para que o cliente entenda o valor, se sinta seguro e avance com confiança.`,
      botaoTexto: "Conhecer nossa história",
      botaoLink: "#contato",
      posicaoImagem: variant % 2 ? "direita" : "esquerda",
      imagemB64: "",
      imagemAlt: `História da marca de ${niche.label}`
    }, style, { bg: style.soft, paddingTop: 84, paddingBottom: 84, sectionId: "historia", animation: "fade-up" });
  }

  function process(niche, objective, style, variant) {
    const cards = [
      { icone: "01", titulo: "Conte o que precisa", texto: "Compartilhe seu objetivo, contexto e principal necessidade." },
      { icone: "02", titulo: "Receba a orientação", texto: "Entenda a melhor opção e os próximos passos com clareza." },
      { icone: "03", titulo: "Avance com segurança", texto: "Confirme a solução e acompanhe cada etapa da entrega." }
    ];
    if (variant % 2) cards.push({ icone: "04", titulo: "Acompanhe o resultado", texto: "Mantenha contato e aproveite todo o valor da experiência." });
    return block("lista_cards", { titulo: "Como funciona", cards }, style, { bg: style.bg, paddingTop: 72, paddingBottom: 72, align: "centro", sectionId: "processo" });
  }

  function products(niche, objective, style, variant) {
    return block("carrossel_produtos", {
      titulo: variant % 2 ? "Escolhas em destaque" : `Conheça nossos ${niche.plural}`,
      produtosIds: []
    }, style, { bg: style.bg, paddingTop: 76, paddingBottom: 76, align: "centro", sectionId: "produtos" });
  }

  function gallery(niche, objective, style, variant) {
    return block("galeria_imagens", {
      titulo: variant % 2 ? "Veja de perto" : "Detalhes que fazem diferença",
      imagens: []
    }, style, { bg: style.soft, paddingTop: 68, paddingBottom: 68, align: "centro", sectionId: "galeria" });
  }

  function proof(niche, objective, style, variant) {
    const cards = [
      { titulo: "Experiência acima do esperado", texto: niche.proof, imagemB64: "", selo: "5.0" },
      { titulo: "Atendimento claro e próximo", texto: "Recebi orientação em cada etapa e me senti seguro para decidir.", imagemB64: "", selo: "4.9" },
      { titulo: "Resultado que vale a escolha", texto: "A entrega foi profissional, organizada e exatamente como combinado.", imagemB64: "", selo: "5.0" }
    ];
    return block("carrossel_cards", { titulo: variant % 2 ? "Quem viveu recomenda" : "Histórias de quem já escolheu", estiloImagem: variant % 2 ? "topo" : "lado", cards }, style, { bg: style.soft, paddingTop: 72, paddingBottom: 72, align: "centro", sectionId: "depoimentos", radius: style.radius });
  }

  function comparison(niche, objective, style, variant) {
    return block("tabela_comparativo", {
      titulo: variant % 2 ? "Compare as possibilidades" : "Escolha com mais clareza",
      coluna1: "Essencial",
      coluna2: "Completo",
      linhas: [
        { label: "Atendimento", valor1: "Padrão", valor2: "Prioritário" },
        { label: "Personalização", valor1: "Básica", valor2: "Avançada" },
        { label: "Acompanhamento", valor1: "Inicial", valor2: "Completo" },
        { label: "Suporte", valor1: "Comercial", valor2: "Estendido" }
      ]
    }, style, { bg: style.bg, paddingTop: 76, paddingBottom: 76, align: "centro", sectionId: "comparativo" });
  }

  function offer(niche, objective, style, variant) {
    return block("texto_midia", {
      titulo: variant % 2 ? "Uma condição criada para facilitar sua decisão" : "Dê o próximo passo com uma condição especial",
      subtitulo: `Apresente aqui o principal ganho, a condição comercial e o motivo para escolher agora seu ${niche.singular}.`,
      botaoTexto: objective.cta,
      botaoLink: "#contato",
      posicaoImagem: variant % 2 ? "esquerda" : "direita",
      imagemB64: "",
      imagemAlt: `Oferta de ${niche.label}`
    }, style, { bg: style.primary, text: "#FFFFFF", button: "#FFFFFF", buttonText: style.bg, buttonBorder: "#FFFFFF", paddingTop: 84, paddingBottom: 84, align: "centro", sectionId: "oferta", shadow: "strong", animation: "zoom-in" });
  }

  function urgency(niche, objective, style, variant) {
    return block("texto_rico", {
      titulo: variant % 2 ? "Condição disponível por tempo limitado" : "As próximas vagas podem encerrar em breve",
      conteudo: "Use esta seção para reforçar prazo, disponibilidade, agenda, lote, estoque ou qualquer condição real que ajude o visitante a tomar uma decisão sem adiar."
    }, style, { bg: style.accent, text: "#111827", paddingTop: 34, paddingBottom: 34, align: "centro", sectionId: "urgencia", animation: "pulse" });
  }

  function guarantee(niche, objective, style, variant) {
    return block("lista_cards", {
      titulo: variant % 2 ? "Uma escolha mais segura" : "Confiança em cada etapa",
      cards: [
        { icone: "◆", titulo: "Transparência", texto: "Condições apresentadas de forma clara antes da confirmação." },
        { icone: "✓", titulo: "Suporte", texto: "Orientação disponível para dúvidas e próximos passos." },
        { icone: "↗", titulo: "Compromisso", texto: "Acompanhamento responsável durante toda a experiência." }
      ]
    }, style, { bg: style.soft, paddingTop: 58, paddingBottom: 58, align: "centro", sectionId: "seguranca" });
  }

  function form(niche, objective, style, variant) {
    return block("formulario_captura", {
      titulo: variant % 2 ? "Receba uma orientação personalizada" : niche.cta,
      campos: variant % 3 === 0 ? ["nome", "whatsapp", "email"] : ["nome", "whatsapp"],
      textoBotao: objective.cta,
      _auraForm: { objetivo: objective.id, prioridade: objective.id === "vender" ? "alta" : "normal", origem: "landing-page" }
    }, style, { bg: style.soft, button: style.primary, buttonText: "#FFFFFF", paddingTop: 78, paddingBottom: 78, align: "centro", sectionId: "contato", radius: style.radius, shadow: "strong" });
  }

  function contact(niche, objective, style, variant) {
    return block("texto_midia", {
      titulo: variant % 2 ? "Converse com nossa equipe" : "Pronto para dar o próximo passo?",
      subtitulo: `Tire dúvidas, entenda as opções e descubra como nossos ${niche.plural} podem atender seu momento.`,
      botaoTexto: "Chamar no WhatsApp",
      botaoLink: "#contato",
      posicaoImagem: "direita",
      imagemB64: "",
      imagemAlt: `Atendimento de ${niche.label}`
    }, style, { bg: style.primary, text: "#FFFFFF", button: "#FFFFFF", buttonText: style.bg, paddingTop: 64, paddingBottom: 64, align: "centro", sectionId: "contato" });
  }

  function faq(niche, objective, style, variant) {
    const items = [
      { pergunta: "Como funciona o primeiro contato?", resposta: "Envie seus dados ou chame pelo canal indicado. A equipe entenderá sua necessidade e apresentará os próximos passos." },
      { pergunta: "Como recebo valores e condições?", resposta: "As condições são apresentadas conforme a opção escolhida, o nível de personalização e a necessidade informada." },
      { pergunta: "Em quanto tempo recebo retorno?", resposta: "O retorno acontece dentro do horário comercial, seguindo a ordem dos contatos recebidos." },
      { pergunta: "Posso tirar dúvidas antes de confirmar?", resposta: "Sim. O objetivo do atendimento é oferecer clareza para que você escolha com segurança." },
      { pergunta: `Esse ${niche.singular} pode ser personalizado?`, resposta: "As possibilidades de personalização podem ser apresentadas durante o atendimento." }
    ];
    return block("faq", { titulo: variant % 2 ? "Perguntas frequentes" : "Tudo o que você precisa saber", itens: items.slice(0, variant % 2 ? 5 : 4) }, style, { bg: style.bg, paddingTop: 72, paddingBottom: 72, sectionId: "faq" });
  }

  function rich(niche, objective, style, variant) {
    return block("texto_rico", {
      titulo: variant % 2 ? "Informações importantes" : `Mais sobre nossos ${niche.plural}`,
      conteudo: `Use este espaço para explicar detalhes, critérios, orientações, prazos ou informações que ajudam o visitante a entender melhor a proposta.\n\nOrganize o conteúdo em parágrafos curtos, destaque o que realmente importa e conduza a leitura até o próximo passo.`
    }, style, { bg: style.bg, paddingTop: 62, paddingBottom: 62, sectionId: "informacoes" });
  }

  function footer(niche, objective, style, variant) {
    return block("rodape", {
      textoCopyright: `© ${new Date().getFullYear()} ${niche.label}. Todos os direitos reservados.`,
      links: [
        { label: "Política de Privacidade", href: "#" },
        { label: "Termos de Uso", href: "#" },
        { label: "Contato", href: "#contato" }
      ]
    }, style, { bg: style.soft, paddingTop: 42, paddingBottom: 42, sectionId: "rodape" });
  }

  const builders = { navigation: nav, hero, benefits, stats, story, process, products, gallery, proof, comparison, offer, urgency, guarantee, form, contact, faq, rich, footer };

  function buildSection(familyId, config, variant) {
    const cfg = config || {};
    const niche = getNiche(cfg.niche);
    const objective = getObjective(cfg.objective);
    const style = getStyle(cfg.style);
    const builder = builders[familyId] || builders.hero;
    return clone(builder(niche, objective, style, Number(variant || 0)));
  }

  function buildPage(config) {
    const cfg = config || {};
    const objective = getObjective(cfg.objective);
    const sectionIds = Array.isArray(cfg.sections) && cfg.sections.length ? cfg.sections : objective.order;
    return sectionIds.map((familyId, index) => buildSection(familyId, cfg, Number(cfg.variant || 0) + index));
  }

  function buildPreset(familyId, nicheId, styleId, variant) {
    const niche = getNiche(nicheId);
    const style = getStyle(styleId);
    const family = families.find((item) => item.id === familyId) || families[0];
    return {
      id: `ultimate-${familyId}-${niche.id}-${style.id}-${variant}`,
      nome: `${family.label} · ${niche.label} · ${style.label}`,
      categoria: `Ultimate · ${family.label}`,
      objetivo: familyId === "form" ? "Captar" : familyId === "offer" ? "Vender" : "Construir página",
      tags: [family.label, niche.label, style.label, "ultimate"],
      accent: style.primary,
      tipo: "secao",
      nicho: niche.id,
      estilo: style.id,
      blocos: [buildSection(familyId, { niche: niche.id, objective: "vender", style: style.id }, variant)]
    };
  }

  function buildPagePreset(nicheId, objectiveId, styleId, variant) {
    const niche = getNiche(nicheId);
    const objective = getObjective(objectiveId);
    const style = getStyle(styleId);
    return {
      id: `ultimate-page-${niche.id}-${objective.id}-${style.id}-${variant}`,
      nome: `${objective.label} · ${niche.label} · ${style.label}`,
      categoria: "Ultimate · Páginas completas",
      objetivo: objective.label,
      tags: ["página completa", niche.label, objective.label, style.label, "ultimate"],
      accent: style.primary,
      tipo: "pagina",
      nicho: niche.id,
      estilo: style.id,
      blocos: buildPage({ niche: niche.id, objective: objective.id, style: style.id, variant })
    };
  }

  function curatedPresets() {
    const result = [];
    const selectedNiches = niches.slice(0, 16);
    const selectedStyles = styles.slice(0, 6);
    const selectedFamilies = families.filter((item) => !["rich", "urgency"].includes(item.id));

    selectedFamilies.forEach((family, familyIndex) => {
      selectedStyles.forEach((style, styleIndex) => {
        const niche = selectedNiches[(familyIndex + styleIndex) % selectedNiches.length];
        result.push(buildPreset(family.id, niche.id, style.id, (familyIndex + styleIndex) % 4));
      });
    });

    selectedNiches.forEach((niche, nicheIndex) => {
      objectives.slice(0, 6).forEach((objective, objectiveIndex) => {
        const style = styles[(nicheIndex + objectiveIndex) % styles.length];
        result.push(buildPagePreset(niche.id, objective.id, style.id, (nicheIndex + objectiveIndex) % 4));
      });
    });

    return result;
  }

  const generated = curatedPresets();
  const current = Array.isArray(window.AURA_STUDIO_PRESETS) ? window.AURA_STUDIO_PRESETS : [];
  const existingIds = new Set(current.map((item) => item.id));
  generated.forEach((preset) => {
    if (!existingIds.has(preset.id)) current.push(preset);
  });

  window.AURA_STUDIO_PRESETS = current;
  window.AURA_STUDIO_LIBRARY_VERSION = "3.0.0-ultimate";
  window.AuraUltimateLibrary = {
    niches,
    objectives,
    styles,
    families,
    getNiche,
    getObjective,
    getStyle,
    buildSection,
    buildPage,
    buildPreset,
    buildPagePreset,
    generatedCount: generated.length,
    estimatedCombinations: niches.length * objectives.length * styles.length * Math.pow(2, families.length - 4)
  };

  document.dispatchEvent(new CustomEvent("aura:studio-library-expanded", {
    detail: { source: "studio-ultimate-library", added: generated.length, total: current.length }
  }));

  console.info("[Vide Aura Studio Ultimate] Biblioteca expandida", {
    added: generated.length,
    total: current.length,
    niches: niches.length,
    objectives: objectives.length,
    styles: styles.length,
    families: families.length
  });
})();
