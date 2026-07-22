// Pedidos Estruturados — evolui a coleção `pedidos` já existente (mesma
// usada pela Central de Pedidos e pelo CRM 360). Não cria uma segunda
// coleção: `cliente`/`produtos`(texto)/`valor`/`status`/`obs` continuam
// existindo exatamente como antes — `itens` é um campo NOVO e opcional
// que passa a acompanhar o pedido quando a equipe escolhe produtos reais
// do catálogo, em vez de (ou além de) digitar tudo em texto livre.
// Lógica pura aqui, testável sem DOM/Firestore; a integração com a UI
// mora em `dashboard-app.js` (Central de Pedidos) e `crm360.js` (resumo
// comercial), mesmo padrão de `templates-atendimento.js`.

export const LIMITES_PEDIDO_ESTRUTURADO = Object.freeze({
    itensMax: 20,
    quantidadeMax: 999,
    quantidadeMin: 1,
    nomeSnapshotMax: 160
});

// Um item é sempre um SNAPSHOT do produto no momento da escolha
// (nomeSnapshot/precoSnapshot) — nunca um "preço ao vivo" recalculado
// depois. Mesmo padrão já usado em `clientes.produtosInteresse`
// (CRM 360): o preço pode mudar no catálogo depois sem alterar pedidos
// já registrados.
export function validarItemPedido(item) {
    if (!item || typeof item !== "object") return "Item inválido.";
    if (!item.produtoId || typeof item.produtoId !== "string") return "Produto não identificado.";
    if (!item.nomeSnapshot || typeof item.nomeSnapshot !== "string") return "Item sem nome.";
    if (item.nomeSnapshot.length > LIMITES_PEDIDO_ESTRUTURADO.nomeSnapshotMax) return "Nome do item muito longo.";
    if (typeof item.precoSnapshot !== "number" || item.precoSnapshot < 0) return "Preço do item inválido.";
    const quantidade = Number(item.quantidade);
    if (!Number.isInteger(quantidade) || quantidade < LIMITES_PEDIDO_ESTRUTURADO.quantidadeMin || quantidade > LIMITES_PEDIDO_ESTRUTURADO.quantidadeMax) {
        return "Quantidade inválida.";
    }
    return "";
}

export function validarItensPedido(itens) {
    if (itens === undefined || itens === null) return "";
    if (!Array.isArray(itens)) return "Itens inválidos.";
    if (itens.length > LIMITES_PEDIDO_ESTRUTURADO.itensMax) {
        return `No máximo ${LIMITES_PEDIDO_ESTRUTURADO.itensMax} itens por pedido.`;
    }
    for (const item of itens) {
        const erro = validarItemPedido(item);
        if (erro) return erro;
    }
    return "";
}

export function calcularValorItens(itens) {
    return (itens || []).reduce((soma, item) => soma + (Number(item.precoSnapshot) || 0) * (Number(item.quantidade) || 0), 0);
}

// Gera o texto legível que preenche `pedidos.produtos` (o campo livre já
// exibido em toda a base — tabela, kanban, feed de atividades, resumo do
// CRM) a partir dos itens escolhidos, pra nenhuma tela precisar mudar.
// Sempre editável depois pela equipe — isto só é o ponto de partida.
export function resumoTextoItens(itens) {
    return (itens || [])
        .map(item => item.quantidade > 1 ? `${item.nomeSnapshot} x${item.quantidade}` : item.nomeSnapshot)
        .join(", ");
}

// Adiciona um produto do catálogo à lista de itens do pedido em edição —
// se o mesmo produtoId já estiver lá, soma a quantidade em vez de
// duplicar a linha (nunca dois itens iguais no mesmo pedido).
export function adicionarItemPedido(itensAtuais, produto, quantidade = 1) {
    const lista = [...(itensAtuais || [])];
    const qtd = Math.max(1, Math.min(LIMITES_PEDIDO_ESTRUTURADO.quantidadeMax, Math.round(Number(quantidade) || 1)));
    const existente = lista.findIndex(item => item.produtoId === produto?.id);
    if (existente >= 0) {
        lista[existente] = { ...lista[existente], quantidade: Math.min(LIMITES_PEDIDO_ESTRUTURADO.quantidadeMax, lista[existente].quantidade + qtd) };
        return lista;
    }
    if (lista.length >= LIMITES_PEDIDO_ESTRUTURADO.itensMax) return lista;
    lista.push({
        produtoId: produto.id,
        nomeSnapshot: String(produto.nome || "Produto").slice(0, LIMITES_PEDIDO_ESTRUTURADO.nomeSnapshotMax),
        precoSnapshot: Number(produto.preco) || 0,
        quantidade: qtd
    });
    return lista;
}

export function removerItemPedido(itensAtuais, produtoId) {
    return (itensAtuais || []).filter(item => item.produtoId !== produtoId);
}

export function atualizarQuantidadeItem(itensAtuais, produtoId, quantidade) {
    const qtd = Math.max(LIMITES_PEDIDO_ESTRUTURADO.quantidadeMin, Math.min(LIMITES_PEDIDO_ESTRUTURADO.quantidadeMax, Math.round(Number(quantidade) || 1)));
    return (itensAtuais || []).map(item => item.produtoId === produtoId ? { ...item, quantidade: qtd } : item);
}

// "Produtos mais comprados" precisos: agrupa por produtoId quando o
// pedido tem `itens` (dado estruturado real); pedidos antigos sem itens
// continuam contribuindo pelo texto livre de `produtos` (best-effort,
// como já era) — nunca descarta pedido nenhum, só usa o melhor dado
// disponível em cada um.
export function contarProdutosMaisComprados(pedidos, limite = 5) {
    const contagem = new Map();
    (pedidos || []).forEach(pedido => {
        if (Array.isArray(pedido.itens) && pedido.itens.length > 0) {
            pedido.itens.forEach(item => {
                const chave = `id:${item.produtoId}`;
                const atual = contagem.get(chave) || { nome: item.nomeSnapshot, total: 0, produtoId: item.produtoId, preciso: true };
                atual.total += Number(item.quantidade) || 1;
                contagem.set(chave, atual);
            });
            return;
        }
        String(pedido.produtos || "").split(",").map(s => s.trim()).filter(Boolean).forEach(nome => {
            const chave = `texto:${nome.toLowerCase()}`;
            const atual = contagem.get(chave) || { nome, total: 0, produtoId: null, preciso: false };
            atual.total += 1;
            contagem.set(chave, atual);
        });
    });
    return Array.from(contagem.values()).sort((a, b) => b.total - a.total).slice(0, Math.max(0, limite));
}

// Vínculo "produto de interesse -> pedido real" (Fase pedida na
// documentação do CRM 360): compara os produtoId dos itens do pedido
// contra a lista de produtosInteresse do cliente — retorna os que
// "converteram" (o cliente demonstrou interesse e depois comprou).
export function produtosInteresseConvertidos(produtosInteresse, itensPedido) {
    const idsComprados = new Set((itensPedido || []).map(item => item.produtoId));
    return (produtosInteresse || []).filter(interesse => idsComprados.has(interesse.produtoId));
}
