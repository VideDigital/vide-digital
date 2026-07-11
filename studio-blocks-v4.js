(function () {
  "use strict";

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const uid = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const niches = [
    ["confeitaria", "Confeitaria", "Criações artesanais para momentos especiais", "Fazer meu pedido"],
    ["barbearia", "Barbearia", "Estilo, precisão e uma experiência premium", "Agendar horário"],
    ["beleza", "Beleza e Estética", "Cuidado profissional para realçar sua melhor versão", "Quero uma avaliação"],
    ["fitness", "Fitness", "Treino com direção para transformar esforço em resultado", "Começar agora"],
    ["restaurante", "Restaurante", "Sabores preparados para criar experiências memoráveis", "Fazer reserva"],
    ["moda", "Moda", "Peças que traduzem identidade, conforto e presença", "Conhecer coleção"],
    ["servicos", "Serviços", "Soluções profissionais para transformar necessidade em resultado", "Solicitar orçamento"],
    ["imobiliaria", "Imobiliária", "O imóvel certo para o próximo capítulo da sua vida", "Falar com especialista"],
    ["curso", "Curso Online", "Conhecimento prático para acelerar sua evolução", "Quero aprender"],
    ["evento", "Evento", "Uma experiência criada para conectar, ensinar e marcar", "Garantir inscrição"],
    ["igreja", "Igreja e Ministério", "Um lugar para pertencer, crescer e viver propósito", "Quero conhecer"],
    ["tecnologia", "Tecnologia e SaaS", "Simplifique sua operação e transforme dados em decisões", "Testar plataforma"],
    ["saude", "Saúde", "Atendimento humanizado com orientação e responsabilidade", "Agendar atendimento"],
    ["fotografia", "Fotografia", "Imagens que continuam contando sua história", "Quero meu ensaio"],
    ["arquitetura", "Arquitetura e Interiores", "Projetos que unem estética, função e identidade", "Falar sobre projeto"],
    ["pet", "Pet", "Cuidado, segurança e carinho para quem faz parte da família", "Agendar cuidado"],
    ["advocacia", "Advocacia", "Estratégia jurídica com clareza e responsabilidade", "Solicitar análise"],
    ["educacao", "Educação", "Aprendizado com direção, acolhimento e resultado", "Conhecer proposta"],
    ["automotivo", "Automotivo", "Segurança, confiança e atendimento consultivo", "Falar com especialista"],
    ["marketing", "Marketing e Agência", "Transforme presença digital em crescimento consistente", "Quero uma estratégia"],
    ["consultoria", "Consultoria", "Clareza para decidir e estratégia para avançar", "Solicitar diagnóstico"],
    ["turismo", "Turismo e Viagens", "Sua próxima grande memória começa com um bom planejamento", "Planejar viagem"],
    ["musica", "Música", "Experiências sonoras que conectam pessoas e momentos", "Quero saber mais"],
    ["artesanato", "Artesanato", "Peças únicas feitas com cuidado e significado", "Conhecer peças"]
  ].map(([id, label, hero, cta]) => ({ id, label, hero, cta }));

  const objectives = [
    { id: "vender", label: "Vender", cta: "Comprar agora", order: ["navigation", "hero", "benefits", "products", "proof", "offer", "guarantee", "faq", "form", "footer"] },
    { id: "captar", label: "Captar leads", cta: "Quero receber", order: ["navigation", "hero", "benefits", "proof", "form", "faq", "footer"] },
    { id: "agendar", label: "Agendar", cta: "Agendar agora", order: ["navigation", "hero", "benefits", "process", "proof", "form", "faq", "footer"] },
    { id: "apresentar", label: "Apresentar marca", cta: "Conhecer mais", order: ["navigation", "hero", "story", "benefits", "gallery", "proof", "contact", "footer"] },
    { id: "lancar", label: "Lançar", cta: "Entrar agora", order: ["navigation", "hero", "urgency", "benefits", "process", "proof", "offer", "form", "faq", "footer"] },
    { id: "evento", label: "Inscrever", cta: "Garantir inscrição", order: ["navigation", "hero", "stats", "process", "proof", "offer", "form", "faq", "footer"] },
    { id: "whatsapp", label: "Gerar conversas", cta: "Chamar no WhatsApp", order: ["navigation", "hero", "benefits", "proof", "contact", "faq", "footer"] },
    { id: "orcamento", label: "Pedir orçamento", cta: "Solicitar orçamento", order: ["navigation", "hero", "benefits", "process", "proof", "comparison", "form", "faq", "footer"] }
  ];

  const styles = [
    { id: "obsidian", label: "Obsidian", primary: "#7C3AED", accent: "#22D3EE", bg: "#070A12", soft: "#101726", text: "#F8FAFC", radius: 22, shadow: "strong" },
    { id: "editorial", label: "Editorial", primary: "#111827", accent: "#B45309", bg: "#F8F5EE", soft: "#EFE8DC", text: "#111827", radius: 6, shadow: "none" },
    { id: "clean", label: "Clean", primary: "#2563EB", accent: "#0EA5E9", bg: "#F8FAFC", soft: "#EAF1FB", text: "#0F172A", radius: 18, shadow: "soft" },
    { id: "luxury", label: "Luxury", primary: "#C6A15B", accent: "#F5E7C6", bg: "#080706", soft: "#17130F", text: "#FFF9ED", radius: 12, shadow: "soft" },
    { id: "vibrant", label: "Vibrante", primary: "#F43F5E", accent: "#8B5CF6", bg: "#120A1B", soft: "#24102E", text: "#FFF7FB", radius: 28, shadow: "glow" },
    { id: "nature", label: "Nature", primary: "#15803D", accent: "#84CC16", bg: "#07140D", soft: "#10271A", text: "#F0FDF4", radius: 24, shadow: "soft" }
  ];

  const families = [
    ["navigation", "Cabeçalhos"], ["hero", "Heros"], ["benefits", "Benefícios"],
    ["stats", "Números"], ["story", "História"], ["process", "Processos"],
    ["products", "Produtos"], ["gallery", "Galerias"], ["proof", "Prova social"],
    ["comparison", "Comparativos"], ["offer", "Ofertas"], ["urgency", "Urgência"],
    ["guarantee", "Garantias"], ["form", "Formulários"], ["contact", "Contato"],
    ["faq", "FAQ"], ["rich", "Conteúdo rico"], ["footer", "Rodapés"]
  ].map(([id, label]) => ({ id, label }));

  function design(style, overrides) {
    const value = overrides || {};
    return {
      corFundo: value.corFundo || style.bg,
      corTexto: value.corTexto || style.text,
      corBotaoFundo: value.corBotaoFundo || style.primary,
      corBotaoTexto: value.corBotaoTexto || "#FFFFFF",
      corBotaoBorda: value.corBotaoBorda || style.primary,
      paddingTop: Number.isFinite(value.paddingTop) ? value.paddingTop : 68,
      paddingBottom: Number.isFinite(value.paddingBottom) ? value.paddingBottom : 68,
      alinhamento: value.alinhamento || "esquerda",
      visivelDesktop: true,
      visivelMobile: true,
      raio: Number.isFinite(value.raio) ? value.raio : style.radius,
      sombra: value.sombra || style.shadow,
      animacao: value.animacao || "fade-up",
      duracaoAnimacao: value.duracaoAnimacao || 650,
      v4: {
        family: value.family || "section",
        maxWidth: value.maxWidth || 1180,
        layout: value.layout || "stack",
        gap: value.gap || 24
      }
    };
  }

  function block(tipo, props, style, overrides) {
    return {
      id: uid("lpb_v4"),
      tipo,
      visivel: true,
      props: props || {},
      design: design(style, overrides),
      _aba: "conteudo",
      _colapsado: true
    };
  }

  function cards(items) {
    return items.map((item, index) => ({
      icone: String(index + 1).padStart(2, "0"),
      titulo: item,
      texto: "Explique este ponto com clareza, benefício e uma mensagem orientada à decisão."
    }));
  }

  function buildSection(family, niche, objective, style, variant) {
    const cta = objective.cta || niche.cta;
    const align = variant % 3 === 0 ? "centro" : "esquerda";
    const imageSide = variant % 2 === 0 ? "direita" : "esquerda";
    const soft = variant % 2 === 0 ? style.bg : style.soft;

    switch (family) {
      case "navigation":
        return [block("navegacao", {
          logoTexto: niche.label,
          links: [
            { label: "Início", href: "#inicio" },
            { label: "Benefícios", href: "#beneficios" },
            { label: "Contato", href: "#contato" }
          ]
        }, style, { corFundo: style.bg, paddingTop: 20, paddingBottom: 20, family, layout: "row", gap: 18 })];

      case "hero":
        return [block("texto_midia", {
          titulo: niche.hero,
          subtitulo: `Uma apresentação ${style.label.toLowerCase()} criada para ${objective.label.toLowerCase()}, gerar confiança e conduzir o visitante ao próximo passo.`,
          botaoTexto: cta,
          botaoLink: objective.id === "whatsapp" ? "https://wa.me/" : "#contato",
          posicaoImagem: imageSide,
          imagemB64: ""
        }, style, { corFundo: style.bg, alinhamento: align, paddingTop: 96, paddingBottom: 96, family, layout: "split", maxWidth: 1240 })];

      case "benefits":
        return [block("lista_cards", {
          titulo: "Por que esta solução faz diferença",
          cards: cards(["Experiência profissional", "Processo claro", "Resultado percebido"])
        }, style, { corFundo: soft, alinhamento: "centro", family, layout: "grid", gap: 18 })];

      case "stats":
        return [block("lista_cards", {
          titulo: "Resultados que ajudam a decidir",
          cards: [
            { icone: "01", titulo: "Mais clareza", texto: "Informação organizada para reduzir dúvidas." },
            { icone: "02", titulo: "Mais confiança", texto: "Provas e diferenciais apresentados no momento certo." },
            { icone: "03", titulo: "Mais ação", texto: "Chamadas objetivas para facilitar a decisão." },
            { icone: "04", titulo: "Mais controle", texto: "Estrutura conectada à operação do negócio." }
          ]
        }, style, { corFundo: style.soft, alinhamento: "centro", family, layout: "grid", gap: 16 })];

      case "story":
        return [
          block("texto_midia", {
            titulo: `A história por trás de ${niche.label}`,
            subtitulo: "Apresente origem, propósito e valores de forma humana, profissional e memorável.",
            botaoTexto: "Conhecer nossa história",
            botaoLink: "#historia",
            posicaoImagem: imageSide,
            imagemB64: ""
          }, style, { corFundo: soft, alinhamento: "esquerda", family, layout: "split" }),
          block("texto_rico", {
            titulo: "Propósito que orienta cada escolha",
            conteudo: "Conte como o negócio nasceu, quais problemas decidiu resolver e por que os clientes podem confiar no trabalho realizado."
          }, style, { corFundo: style.bg, alinhamento: align, paddingTop: 42, paddingBottom: 42, family })
        ];

      case "process":
        return [block("lista_cards", {
          titulo: "Como funciona",
          cards: cards(["Entendimento da necessidade", "Definição da melhor solução", "Execução e acompanhamento", "Entrega e próximo passo"])
        }, style, { corFundo: style.bg, alinhamento: "centro", family, layout: "grid", gap: 20 })];

      case "products":
        return [
          block("carrossel_produtos", { titulo: "Escolhas em destaque", produtosIds: [] }, style, { corFundo: style.bg, alinhamento: "centro", family }),
          block("texto_rico", { titulo: "Compra simples e atendimento próximo", conteudo: "Selecione uma opção, tire dúvidas e avance com segurança pelo canal de atendimento disponível." }, style, { corFundo: style.soft, alinhamento: "centro", paddingTop: 36, paddingBottom: 36, family })
        ];

      case "gallery":
        return [block("galeria_imagens", { titulo: "Veja detalhes, resultados e experiências", imagens: [] }, style, { corFundo: soft, alinhamento: "centro", family, layout: "grid", gap: 12 })];

      case "proof":
        return [block("carrossel_cards", {
          titulo: "Experiências de quem já escolheu",
          estiloImagem: variant % 2 ? "lado" : "topo",
          cards: [
            { titulo: "Atendimento excelente", texto: "Processo simples, comunicação clara e ótima experiência.", imagemB64: "", selo: "5.0" },
            { titulo: "Resultado acima do esperado", texto: "A solução entregou exatamente o que eu precisava.", imagemB64: "", selo: "5.0" },
            { titulo: "Recomendaria novamente", texto: "Profissionalismo e cuidado em todas as etapas.", imagemB64: "", selo: "5.0" }
          ]
        }, style, { corFundo: style.soft, alinhamento: "centro", family })];

      case "comparison":
        return [block("tabela_comparativo", {
          titulo: "Compare e escolha com segurança",
          coluna1: "Padrão",
          coluna2: "Recomendado",
          linhas: [
            { label: "Atendimento", valor1: "Essencial", valor2: "Prioritário" },
            { label: "Personalização", valor1: "Básica", valor2: "Completa" },
            { label: "Acompanhamento", valor1: "Pontual", valor2: "Contínuo" },
            { label: "Experiência", valor1: "Objetiva", valor2: "Premium" }
          ]
        }, style, { corFundo: soft, alinhamento: "centro", family })];

      case "offer":
        return [block("texto_midia", {
          titulo: "Uma condição criada para facilitar sua decisão",
          subtitulo: "Mostre o valor principal, destaque o benefício e apresente a chamada para ação com clareza.",
          botaoTexto: cta,
          botaoLink: "#contato",
          posicaoImagem: imageSide,
          imagemB64: ""
        }, style, { corFundo: style.primary, corTexto: "#FFFFFF", corBotaoFundo: "#FFFFFF", corBotaoTexto: style.bg, alinhamento: "centro", family, sombra: "strong" })];

      case "urgency":
        return [block("texto_midia", {
          titulo: "A melhor condição está disponível agora",
          subtitulo: "Use urgência verdadeira: data de encerramento, vagas, agenda ou quantidade disponível.",
          botaoTexto: cta,
          botaoLink: "#contato",
          posicaoImagem: "direita"
        }, style, { corFundo: style.accent, corTexto: "#FFFFFF", corBotaoFundo: style.bg, corBotaoTexto: style.text, alinhamento: "centro", paddingTop: 48, paddingBottom: 48, family })];

      case "guarantee":
        return [block("lista_cards", {
          titulo: "Segurança para avançar",
          cards: cards(["Condições transparentes", "Atendimento disponível", "Orientação durante o processo"])
        }, style, { corFundo: style.soft, alinhamento: "centro", family })];

      case "form":
        return [block("formulario_captura", {
          titulo: objective.id === "agendar" ? "Solicite seu horário" : "Receba atendimento personalizado",
          campos: ["nome", "whatsapp", "email"],
          textoBotao: cta,
          origem: `lp-v4-${niche.id}`,
          prioridade: objective.id === "vender" ? "alta" : "normal"
        }, style, { corFundo: style.soft, alinhamento: "centro", family, maxWidth: 760, sombra: "soft" })];

      case "contact":
        return [block("texto_midia", {
          titulo: "Converse com nossa equipe",
          subtitulo: "Escolha o melhor canal, envie sua dúvida e receba uma orientação direcionada.",
          botaoTexto: "Abrir WhatsApp",
          botaoLink: "https://wa.me/",
          posicaoImagem: imageSide
        }, style, { corFundo: style.primary, corTexto: "#FFFFFF", corBotaoFundo: "#22C55E", alinhamento: "centro", family })];

      case "faq":
        return [block("faq", {
          titulo: "Perguntas frequentes",
          itens: [
            { pergunta: "Como funciona o atendimento?", resposta: "Após o contato, a equipe entende sua necessidade e orienta o melhor caminho." },
            { pergunta: "Quais são as condições disponíveis?", resposta: "As condições variam conforme a solução escolhida e serão apresentadas com transparência." },
            { pergunta: "Em quanto tempo recebo retorno?", resposta: "O retorno acontece pelo canal informado, normalmente dentro do horário comercial." },
            { pergunta: "Existe suporte depois da contratação?", resposta: "O acompanhamento depende da modalidade escolhida e será explicado antes da confirmação." }
          ]
        }, style, { corFundo: style.bg, alinhamento: "esquerda", family, maxWidth: 900 })];

      case "rich":
        return [block("texto_rico", {
          titulo: "Conteúdo que prepara o visitante para decidir",
          conteudo: "Use esta seção para explicar contexto, método, diferenciais, detalhes técnicos ou informações importantes sem perder clareza visual.\n\nOrganize o texto em parágrafos curtos e mantenha uma mensagem por bloco."
        }, style, { corFundo: soft, alinhamento: align, family, maxWidth: 840 })];

      case "footer":
        return [block("rodape", {
          textoCopyright: `© 2026 ${niche.label}. Todos os direitos reservados.`,
          links: [
            { label: "Política de privacidade", href: "#privacidade" },
            { label: "Termos", href: "#termos" },
            { label: "Contato", href: "#contato" }
          ]
        }, style, { corFundo: style.bg, paddingTop: 34, paddingBottom: 34, family, layout: "row" })];

      default:
        return [];
    }
  }

  function pagePreset(niche, objective, style, variant) {
    const blocks = objective.order.flatMap((family) => buildSection(family, niche, objective, style, variant));
    return {
      id: `v4-page-${niche.id}-${objective.id}-${style.id}`,
      nome: `${niche.label} · ${objective.label} · ${style.label}`,
      categoria: "Páginas V4",
      objetivo: objective.label,
      nicho: niche.id,
      estilo: style.id,
      tags: ["v4", "página completa", niche.label, objective.label, style.label],
      accent: style.primary,
      tipo: "pagina",
      blocos: blocks
    };
  }

  const base = Array.isArray(window.AURA_STUDIO_PRESETS) ? window.AURA_STUDIO_PRESETS : [];
  const ids = new Set(base.map((item) => item?.id).filter(Boolean));
  const generated = [];

  niches.forEach((niche, nicheIndex) => {
    families.forEach((family, familyIndex) => {
      const objective = objectives[(nicheIndex + familyIndex) % objectives.length];
      const style = styles[(nicheIndex * 2 + familyIndex) % styles.length];
      const id = `v4-section-${family.id}-${niche.id}-${style.id}`;
      if (ids.has(id)) return;
      generated.push({
        id,
        nome: `${family.label} · ${niche.label}`,
        categoria: family.label,
        objetivo: objective.label,
        nicho: niche.id,
        estilo: style.id,
        tags: ["v4", family.label, niche.label, objective.label, style.label],
        accent: style.primary,
        tipo: "secao",
        blocos: buildSection(family.id, niche, objective, style, nicheIndex + familyIndex)
      });
      ids.add(id);
    });
  });

  niches.forEach((niche, nicheIndex) => {
    objectives.forEach((objective, objectiveIndex) => {
      const style = styles[(nicheIndex + objectiveIndex) % styles.length];
      const preset = pagePreset(niche, objective, style, nicheIndex + objectiveIndex);
      if (ids.has(preset.id)) return;
      generated.push(preset);
      ids.add(preset.id);
    });
  });

  const all = [...base];
  generated.forEach((item) => {
    if (!all.some((current) => current?.id === item.id)) all.push(item);
  });

  window.AURA_STUDIO_PRESETS = all;
  window.AURA_STUDIO_LIBRARY_VERSION = "4.0.0-canvas";
  window.AuraBlocksV4 = {
    niches,
    objectives,
    styles,
    families,
    generated,
    total: all.length,
    buildSection: (familyId, config) => {
      const niche = niches.find((item) => item.id === config?.niche) || niches[0];
      const objective = objectives.find((item) => item.id === config?.objective) || objectives[0];
      const style = styles.find((item) => item.id === config?.style) || styles[0];
      return clone(buildSection(familyId, niche, objective, style, Number(config?.variant || 0)));
    },
    buildPage: (config) => {
      const niche = niches.find((item) => item.id === config?.niche) || niches[0];
      const objective = objectives.find((item) => item.id === config?.objective) || objectives[0];
      const style = styles.find((item) => item.id === config?.style) || styles[0];
      return clone(pagePreset(niche, objective, style, Number(config?.variant || 0)).blocos);
    },
    find: (id) => all.find((item) => item?.id === id) || null
  };

  document.dispatchEvent(new CustomEvent("aura:studio-library-expanded", {
    detail: {
      source: "canvas-v4",
      added: generated.length,
      total: all.length,
      pages: generated.filter((item) => item.tipo === "pagina").length,
      sections: generated.filter((item) => item.tipo === "secao").length
    }
  }));

  console.info("[Vide Aura Blocks V4] Biblioteca expandida", {
    added: generated.length,
    total: all.length,
    pages: generated.filter((item) => item.tipo === "pagina").length
  });
})();
