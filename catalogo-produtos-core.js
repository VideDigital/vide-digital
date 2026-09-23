// Lógica pura da Central Inteligente de Catálogo (Produtos).
// Sem DOM, sem Firestore — só funções determinísticas, testáveis isoladamente.

export function normalizarTextoCatalogo(valor) {
    return String(valor || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

export function produtoCorrespondeBusca(campos, termoNormalizado) {
    if (!termoNormalizado) return true;
    const conteudo = normalizarTextoCatalogo(
        [campos?.nome, campos?.descricao, campos?.categoria, campos?.tipo].join(" ")
    );
    return conteudo.includes(termoNormalizado);
}

export function calcularResumoCatalogoDeCards(itens) {
    const lista = Array.isArray(itens) ? itens : [];
    const precos = lista
        .map(item => Number(item?.preco))
        .filter(valor => Number.isFinite(valor) && valor > 0);
    const precoMedio = precos.length ? precos.reduce((a, b) => a + b, 0) / precos.length : 0;
    const estoqueBaixo = lista.filter(item =>
        item?.estoque !== "" &&
        item?.estoque !== undefined &&
        item?.estoque !== null &&
        Number.isFinite(Number(item.estoque)) &&
        Number(item.estoque) <= 5
    ).length;
    const comDesconto = lista.filter(item => Number(item?.desconto || 0) > 0).length;

    return {
        total: lista.length,
        precoMedio,
        estoqueBaixo,
        comDesconto
    };
}

// Autofill silencioso do navegador/gerenciador de senhas: se o campo de busca
// contém exatamente o e-mail autenticado e o usuário nunca digitou nada de
// verdade, isso não é uma pesquisa real — nunca apagamos algo que o usuário
// realmente escreveu.
export function valorBuscaCatalogoEhAutofillIndevido({ valorAtual, emailAutenticado, houveDigitacaoHumana }) {
    if (houveDigitacaoHumana) return false;
    const valor = String(valorAtual || "").trim().toLowerCase();
    const email = String(emailAutenticado || "").trim().toLowerCase();
    if (!valor || !email) return false;
    return valor === email;
}

// Distingue "sem produtos cadastrados/no filtro" (decidido antes, com os
// dados crus do Firestore) de "há produtos, mas nenhum bate com a busca
// digitada" — só esse segundo caso é responsabilidade da Central Inteligente.
export function buscaCatalogoSemResultados({ totalCardsRenderizados, totalCardsVisiveis, termoBusca }) {
    return Boolean(
        totalCardsRenderizados > 0 &&
        totalCardsVisiveis === 0 &&
        String(termoBusca || "").trim()
    );
}

// A aba salva (localStorage) só é restaurada bem depois do login, quando o
// perfil/banners já carregaram dentro do mesmo onAuthStateChanged. Se algo
// já navegou explicitamente pra outra aba nesse meio-tempo (um clique real,
// ou um teste chamando ativarAba diretamente), essa navegação é sempre mais
// recente que a leitura de localStorage feita no boot — restaurar por cima
// dela reverteria uma ação explícita do usuário. "view-dashboard" é o único
// estado ativo estático do HTML antes de qualquer navegação (dashboard.html),
// então só é seguro restaurar a aba salva enquanto ele ainda for o ativo.
export function deveRestaurarAbaSalva(idAbaAtivaNoMomento) {
    return !idAbaAtivaNoMomento || idAbaAtivaNoMomento === "view-dashboard";
}

// Controla a ordem de resoluções concorrentes de um mesmo carregamento
// assíncrono (ex.: carregarProdutos disparado de novo por uma navegação
// rápida Produtos <-> Catálogo antes da consulta anterior terminar). Sem
// isso, uma resposta antiga que demorou mais pode chegar DEPOIS de uma mais
// nova e sobrescrever o resultado já correto na tela.
export function criarControladorDeCargaSequencial() {
    let sequenciaAtual = 0;
    return {
        iniciarNovaCarga() {
            sequenciaAtual += 1;
            return sequenciaAtual;
        },
        ehCargaMaisRecente(minhaSequencia) {
            return minhaSequencia === sequenciaAtual;
        }
    };
}
