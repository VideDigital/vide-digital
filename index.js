// Sistema Unificado de Notificações Internas (Substitui o window.alert)
function emitInlineFeedback(message, status = 'success') {
    // Procura por um container existente ou cria um dinamicamente na página
    let feedbackBox = document.getElementById('global-inline-feedback');
    if (!feedbackBox) {
        feedbackBox = document.createElement('div');
        feedbackBox.id = 'global-inline-feedback';
        // Estilização injetada em tempo de execução para garantir aplicação imediata
        Object.assign(feedbackBox.style, {
            position: 'fixed',
            bottom: '24px',
            left: '24px',
            padding: '14px 20px',
            borderRadius: '10px',
            color: '#FFF',
            fontWeight: '600',
            fontSize: '0.9rem',
            zIndex: '99999',
            transition: 'all 0.3s ease',
            boxShadow: '0 10px 25px rgba(0,0,0,0.4)'
        });
        document.body.appendChild(feedbackBox);
    }
    
    feedbackBox.style.backgroundColor = status === 'success' ? '#00D2DF' : '#EF4444';
    feedbackBox.style.color = status === 'success' ? '#000' : '#FFF';
    feedbackBox.textContent = message;
    feedbackBox.style.display = 'block';
    
    setTimeout(() => {
        feedbackBox.style.display = 'none';
    }, 3000);
}

// CORREÇÃO DO FILTRO: Função que renderiza a vitrine de produtos de forma segura
function renderProductsGrid(products, typeFilter) {
    const grid = document.getElementById("products-grid");
    const emptyState = document.getElementById("empty-state");
    if(!grid) return;
    
    grid.innerHTML = "";

    // Correção do Bug: Garante que "todos" exiba sem filtros, e limpa strings com toLowerCase()
    const filtered = products.filter(p => {
        if (!p.tipo) return false;
        if (typeFilter === "todos") return true; 
        return p.tipo.toLowerCase().trim() === typeFilter.toLowerCase().trim();
    });

    if (filtered.length === 0) {
        grid.classList.add("hidden");
        if(emptyState) emptyState.classList.remove("hidden");
        return;
    }

    if(emptyState) emptyState.classList.add("hidden");
    grid.classList.remove("hidden");

    filtered.forEach(p => {
        const card = document.createElement("div");
        card.className = "product-card";
        card.innerHTML = `
            <div class="product-image-wrapper">
                <img src="${p.imagemUrl || 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=500&q=80'}" alt="${p.nome}" class="product-image">
            </div>
            <div class="product-info">
                <h2 class="product-title">${p.nome}</h2>
                <div class="price-container">
                    <div class="old-price">R$ ${p.precoOriginal || '197,00'}</div>
                    <div class="current-price">R$ ${p.precoAtual}</div>
                    <div class="installment-text">${p.parcelamentoTexto || 'Em até 12x'}</div>
                </div>
                <a href="${p.linkDestino}" target="_blank" class="btn-cta">Acessar Agora</a>
            </div>
        `;
        grid.appendChild(card);
    });
}

// Exemplo prático de interceptação do botão salvar links/perfil:
function aoSalvarConfiguracoes() {
    // Código de salvamento aqui...
    
    // Substituído alert("Salvo!") por:
    emitInlineFeedback("Configurações atualizadas com sucesso na infraestrutura!", "success");
}
