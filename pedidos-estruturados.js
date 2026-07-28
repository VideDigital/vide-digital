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

// ===== Edição Completa de Pedido Existente V1 =====
// Lógica pura do rascunho (draft) de edição — usada por orders-engine-v1.js.
// O draft nunca é fonte permanente: só existe enquanto a equipe edita um
// pedido já criado; ao salvar, o motor grava no mesmo caminho de sempre
// (persistOrder/writeBatch) e os listeners reconstroem state.orders.

export const LIMITES_EDICAO_PEDIDO = Object.freeze({
    clienteMax: 160,
    whatsappMax: 30,
    emailMax: 160,
    cepMax: 12,
    enderecoMax: 300,
    observacoesMax: 2000,
    produtosTextoMax: 2000
});

export const OPCOES_RECEBIMENTO_PEDIDO = Object.freeze(["retirada", "entrega", "não informado"]);

const REGEX_EMAIL_PEDIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Campos que compõem o rascunho editável — espelha exatamente o pedido
// normalizado pelo motor (mesmos nomes de `order` em orders-engine-v1.js),
// nunca um formato paralelo.
export function criarDraftPedido(order) {
    const items = Array.isArray(order?.items) ? order.items.map(item => ({ ...item })) : [];
    const productsText = String(order?.productsText || "");
    // Bug real encontrado no Quality Gate: começar sempre com
    // productsTextManual: false fazia normalizarDraftPedido() REGERAR o
    // texto a partir dos itens assim que a edição abria — mesmo sem o
    // usuário tocar em nada. Pedidos reais podem legitimamente ter um
    // texto customizado que diverge do que os itens gerariam sozinhos
    // (o próprio modal de novo pedido permite isso via
    // marcarPedidoCampoEditadoManual). Detectar essa divergência aqui e
    // já nascer "manual" nesse caso preserva o texto existente até o
    // usuário realmente editar algo — evita marcar "alterado" à toa.
    const productsTextManual = items.length > 0 && productsText !== resumoTextoItens(items);
    return {
        customer: String(order?.customer || ""),
        whatsapp: String(order?.whatsapp || ""),
        email: String(order?.email || ""),
        delivery: OPCOES_RECEBIMENTO_PEDIDO.includes(order?.delivery) ? order.delivery : "não informado",
        cep: String(order?.cep || ""),
        address: String(order?.address || ""),
        customerNotes: String(order?.customerNotes || ""),
        items,
        productsText,
        productsTextManual,
        subtotal: Number(order?.subtotal) || 0,
        discount: Math.max(0, Number(order?.discount) || 0),
        freight: Math.max(0, Number(order?.freight) || 0),
        total: Number(order?.total) || 0,
        status: String(order?.status || "novo"),
        payment: String(order?.payment || "pendente"),
        responsibleUid: String(order?.responsibleUid || ""),
        responsibleName: String(order?.responsibleName || ""),
        dueDate: Number(order?.dueDate) || 0,
        internalNotes: String(order?.internalNotes || "")
    };
}

// Gera o texto de "Produtos ou serviços" a partir dos itens — mesmo
// princípio de `marcarPedidoCampoEditadoManual` já usado no modal de novo
// pedido: depois que a equipe edita o texto manualmente, mudanças nos itens
// param de sobrescrever silenciosamente.
export function gerarProdutosTextoSemSobrescreverManual(draft) {
    if (draft?.productsTextManual) return String(draft?.productsText || "");
    if (Array.isArray(draft?.items) && draft.items.length) return resumoTextoItens(draft.items);
    return String(draft?.productsText || "");
}

export function calcularTotaisDraft(draft) {
    const subtotal = Array.isArray(draft?.items) && draft.items.length
        ? calcularValorItens(draft.items)
        : Math.max(0, Number(draft?.subtotal) || 0);
    const total = Math.max(0, subtotal - Math.max(0, Number(draft?.discount) || 0) + Math.max(0, Number(draft?.freight) || 0));
    return { subtotal, total };
}

// Normaliza o draft antes de validar/salvar: aplica limites, recalcula
// texto automático (respeitando edição manual) e recalcula subtotal/total
// a partir dos itens — nunca confia em número digitado à mão no total.
export function normalizarDraftPedido(draft) {
    const items = (Array.isArray(draft?.items) ? draft.items : []).slice(0, LIMITES_PEDIDO_ESTRUTURADO.itensMax);
    const base = { ...draft, items };
    const productsText = gerarProdutosTextoSemSobrescreverManual(base).slice(0, LIMITES_EDICAO_PEDIDO.produtosTextoMax);
    const { subtotal, total } = calcularTotaisDraft(base);
    return {
        ...draft,
        customer: String(draft?.customer || "").trim().slice(0, LIMITES_EDICAO_PEDIDO.clienteMax),
        whatsapp: String(draft?.whatsapp || "").trim().slice(0, LIMITES_EDICAO_PEDIDO.whatsappMax),
        email: String(draft?.email || "").trim().slice(0, LIMITES_EDICAO_PEDIDO.emailMax),
        delivery: OPCOES_RECEBIMENTO_PEDIDO.includes(draft?.delivery) ? draft.delivery : "não informado",
        cep: String(draft?.cep || "").trim().slice(0, LIMITES_EDICAO_PEDIDO.cepMax),
        address: String(draft?.address || "").trim().slice(0, LIMITES_EDICAO_PEDIDO.enderecoMax),
        customerNotes: String(draft?.customerNotes || "").trim().slice(0, LIMITES_EDICAO_PEDIDO.observacoesMax),
        internalNotes: String(draft?.internalNotes || "").trim().slice(0, LIMITES_EDICAO_PEDIDO.observacoesMax),
        items,
        productsText,
        subtotal,
        total,
        discount: Math.max(0, Number(draft?.discount) || 0),
        freight: Math.max(0, Number(draft?.freight) || 0),
        dueDate: Math.max(0, Number(draft?.dueDate) || 0)
    };
}

// Retorna "" quando válido, ou a primeira mensagem de erro encontrada —
// mesmo contrato de validarItemPedido/validarItensPedido.
export function validarDraftPedido(draft) {
    if (!draft || typeof draft !== "object") return "Dados do pedido inválidos.";
    const cliente = String(draft.customer || "").trim();
    if (!cliente) return "Informe o nome do cliente.";
    if (cliente.length > LIMITES_EDICAO_PEDIDO.clienteMax) return "Nome do cliente muito longo.";
    const whatsapp = String(draft.whatsapp || "").trim();
    if (whatsapp.length > LIMITES_EDICAO_PEDIDO.whatsappMax) return "WhatsApp muito longo.";
    if (whatsapp && whatsapp.replace(/\D/g, "").length < 8) return "WhatsApp inválido.";
    const email = String(draft.email || "").trim();
    if (email.length > LIMITES_EDICAO_PEDIDO.emailMax) return "E-mail muito longo.";
    if (email && !REGEX_EMAIL_PEDIDO.test(email)) return "E-mail inválido.";
    if (!OPCOES_RECEBIMENTO_PEDIDO.includes(draft.delivery)) return "Tipo de recebimento inválido.";
    if (String(draft.cep || "").length > LIMITES_EDICAO_PEDIDO.cepMax) return "CEP muito longo.";
    if (String(draft.address || "").length > LIMITES_EDICAO_PEDIDO.enderecoMax) return "Endereço muito longo.";
    if (String(draft.customerNotes || "").length > LIMITES_EDICAO_PEDIDO.observacoesMax) return "Observações do cliente muito longas.";
    if (String(draft.internalNotes || "").length > LIMITES_EDICAO_PEDIDO.observacoesMax) return "Observações internas muito longas.";
    const erroItens = validarItensPedido(draft.items);
    if (erroItens) return erroItens;
    const temItens = Array.isArray(draft.items) && draft.items.length > 0;
    const produtosTexto = String(draft.productsText || "").trim();
    if (!temItens && !produtosTexto) return "Descreva ao menos um produto.";
    if (produtosTexto.length > LIMITES_EDICAO_PEDIDO.produtosTextoMax) return "Texto de produtos muito longo.";
    if (Number(draft.discount) < 0) return "Desconto inválido.";
    if (Number(draft.freight) < 0) return "Frete inválido.";
    return "";
}

export function atualizarPrecoItem(itensAtuais, produtoId, preco) {
    const valor = Math.max(0, Number(preco) || 0);
    return (itensAtuais || []).map(item => item.produtoId === produtoId ? { ...item, precoSnapshot: valor } : item);
}

// Grupos usados tanto para decidir se algo mudou (habilitar Salvar) quanto
// para o resumo do evento de histórico "Dados do pedido editados".
const GRUPOS_DIFF_PEDIDO = Object.freeze({
    cliente: ["customer", "whatsapp", "email"],
    recebimento: ["delivery", "cep", "address", "customerNotes"],
    itens: ["items", "productsText"],
    valores: ["discount", "freight"],
    prazo: ["dueDate"],
    gestao: ["status", "payment", "responsibleUid", "internalNotes"]
});

const ROTULOS_GRUPO_DIFF_PEDIDO = Object.freeze({
    cliente: "cliente",
    recebimento: "recebimento",
    itens: "itens",
    valores: "valores",
    prazo: "prazo",
    gestao: "gestão"
});

function itensDeParaIguais(a, b) {
    const listaA = Array.isArray(a) ? a : [];
    const listaB = Array.isArray(b) ? b : [];
    if (listaA.length !== listaB.length) return false;
    return listaA.every((item, index) => {
        const outro = listaB[index];
        return Boolean(outro)
            && item.produtoId === outro.produtoId
            && item.nomeSnapshot === outro.nomeSnapshot
            && Number(item.precoSnapshot) === Number(outro.precoSnapshot)
            && Number(item.quantidade) === Number(outro.quantidade);
    });
}

// Prazo previsto é um <input type="date"> — só o DIA importa. O motor
// reconstrói o timestamp a partir do valor do input com uma hora fixa
// (meio-dia, pra nunca escorregar de dia por causa de fuso horário/DST),
// mas o pedido original pode ter sido criado com outra hora fixa (o modal
// de novo pedido usa meia-noite) — comparar por milissegundo exato geraria
// "alterado" mesmo quando ninguém tocou no campo. Comparar só o dia
// (no fuso local, mesmo onde os dois timestamps foram gerados) evita esse
// falso positivo sem exigir que as duas telas usem a mesma hora fixa.
function diaCalendarioLocal(valorEmMs) {
    const numero = Number(valorEmMs) || 0;
    if (!numero) return "";
    const data = new Date(numero);
    return `${data.getFullYear()}-${data.getMonth()}-${data.getDate()}`;
}

function camposDeParaIguais(campo, valorOriginal, valorNovo) {
    if (campo === "items") return itensDeParaIguais(valorOriginal, valorNovo);
    if (campo === "dueDate") return diaCalendarioLocal(valorOriginal) === diaCalendarioLocal(valorNovo);
    if (typeof valorOriginal === "number" || typeof valorNovo === "number") {
        return (Number(valorOriginal) || 0) === (Number(valorNovo) || 0);
    }
    return String(valorOriginal ?? "").trim() === String(valorNovo ?? "").trim();
}

// Compara o pedido original (como veio do motor) com o draft normalizado —
// nunca compara objetos inteiros por referência, só os campos que a
// edição completa realmente pode alterar.
export function compararPedidoComDraft(pedidoOriginal, draft) {
    const grupos = {};
    let alterado = false;
    Object.entries(GRUPOS_DIFF_PEDIDO).forEach(([grupo, campos]) => {
        const mudou = campos.some(campo => !camposDeParaIguais(campo, pedidoOriginal?.[campo], draft?.[campo]));
        grupos[grupo] = mudou;
        if (mudou) alterado = true;
    });
    return { alterado, grupos };
}

// Resumo curto pro histórico — nunca inclui telefone, endereço ou
// observação completa, só os nomes dos grupos que mudaram.
export function resumirAlteracoesPedido(diff) {
    if (!diff || !diff.alterado) return "";
    return Object.keys(ROTULOS_GRUPO_DIFF_PEDIDO)
        .filter(grupo => diff.grupos?.[grupo])
        .map(grupo => ROTULOS_GRUPO_DIFF_PEDIDO[grupo])
        .join(", ");
}
