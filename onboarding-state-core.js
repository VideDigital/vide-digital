// Somente dados confirmados pelas leituras/salvamentos existentes.
export function criarEstadoImplantacao({ perfil = null, produtos = null, podeConfigurar = false, podeCriarProduto = false } = {}) {
    const texto = key => String(perfil?.[key] || '').trim();
    const telefone = key => texto(key).replace(/\D/g, '').length >= 10;
    const tarefas = [
        ['Identidade da loja', 'Defina o nome público da sua empresa.', 'identidade', 'perf-nome-loja', texto('nomeLoja').length >= 2, 0],
        ['Endereço da vitrine', 'Escolha o endereço público da loja.', 'identidade', 'perf-slug', texto('urlLoja').length >= 2, 0],
        ['WhatsApp comercial', 'Recomendado se você atende pelo WhatsApp. Pode configurar depois.', 'redes-sociais', 'perf-social-whatsapp-central', telefone('whatsappCentral') || telefone('whatsappChat'), 0],
        ['Primeiro produto', 'Cadastre uma oferta ativa se você utiliza o catálogo. Não bloqueia outros recursos.', 'novo-produto', '', produtos > 0, 1],
        ['Canal de conversão', 'Escolha carrinho ou chat conforme sua operação. O chat usa WhatsApp configurado.', perfil?.carrinhoAtivo ? 'chat-config' : 'carrinho-config', perfil?.carrinhoAtivo ? 'perf-chat-ativo' : 'perf-carrinho-ativo', perfil?.carrinhoAtivo === true || (perfil?.chatAtivo === true && telefone('whatsappChat')), 1],
        ['Apresentação principal', 'Personalize o título e a descrição da vitrine quando quiser.', 'identidade', 'perf-titulo', texto('tituloHero').length >= 2 && texto('subtituloHero').length >= 2, 2],
        ['Presença digital', 'Adicione suas redes sociais quando fizer sentido.', 'redes-sociais', 'perf-social-instagram', Boolean(texto('instagramUser') || texto('tiktokUser') || texto('youtubeUrl')), 2],
        ['Identidade visual', 'Personalize cores e tipografia. O visual padrão permite começar.', 'aparencia-cores', 'perf-cor-destaque', Boolean(texto('corDestaque') && texto('fonteVitrine')), 2]
    ].map(([titulo, descricao, acao, campo, concluida, grupo]) => ({ titulo, descricao, acao, campo, grupo,
        conhecida: acao === 'novo-produto' ? produtos !== null : perfil !== null,
        concluida: (acao === 'novo-produto' ? produtos !== null : perfil !== null) && concluida,
        permitida: acao === 'novo-produto' ? podeCriarProduto : podeConfigurar
    }));
    const grupos = ['Comece por aqui', 'Prepare suas vendas ou captação', 'Personalize depois'].map((titulo, indice) => {
        const itens = tarefas.filter(t => t.grupo === indice);
        return { titulo, itens, concluidas: itens.filter(t => t.concluida).length, total: itens.length };
    });
    const concluidas = tarefas.filter(t => t.concluida).length;
    return { tarefas, grupos, concluidas, percentual: Math.round(concluidas / tarefas.length * 100),
        proxima: tarefas.find(t => t.conhecida && !t.concluida && t.permitida) || null };
}

export function chavePreferenciaImplantacao(contexto) {
    if (!contexto?.initialized || !contexto.active || !contexto.authUid || !contexto.storeUid) return null;
    return 'videDashboardImplantacaoRecolhida_v2_' + encodeURIComponent(contexto.authUid) + '_' + encodeURIComponent(contexto.storeUid);
}
