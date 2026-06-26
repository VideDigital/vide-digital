// Base de dados inicial persistente (Simulando banco de dados no navegador)
let produtos = JSON.parse(localStorage.getItem('vide_produtos')) || [
    {
        id: 1,
        nome: "teste",
        tipo: "digital",
        subtipo: "cursos",
        precoOriginal: "99,99",
        precoAtual: "12351",
        parcelamento: "Em até 12x flexível",
        imagemUrl: ""
    }
];

let filtroAtual = "todos";

// Inicializador do Sistema
document.addEventListener("DOMContentLoaded", () => {
    renderGrid();
});

// Exibir avisos sem pop-up nativo
function showNotification(message, isSuccess = true) {
    const box = document.getElementById('inline-feedback-box');
    if(!box) return;
    box.textContent = message;
    box.style.backgroundColor = isSuccess ? "#00D2DF" : "#EF4444";
    box.style.color = isSuccess ? "#000" : "#FFF";
    box.style.display = "block";
    setTimeout(() => { box.style.display = "none"; }, 3000);
}

// Alternar Abas da Barra Lateral Esquerda
function switchTab(tabId) {
    const sections = ['tab-visao-geral', 'tab-leads', 'tab-pixel', 'tab-perfil'];
    sections.forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });
    document.getElementById(`tab-${tabId}`).classList.remove('hidden');

    // Mudar visual do botão ativo
    const buttons = document.querySelectorAll('.nav-btn');
    buttons.forEach(btn => {
        btn.style.background = "transparent";
        btn.style.color = "#8E9AA8";
    });
    event.currentTarget.style.background = "rgba(0,210,223,0.1)";
    event.currentTarget.style.color = "#00D2DF";
}

// Abrir e fechar Modal de Produto
function toggleModal(open) {
    const modal = document.getElementById('product-modal');
    if(open) modal.classList.remove('hidden');
    else modal.classList.add('hidden');
}

// Salvar Perfil sem usar o alerta clássico da web
function saveProfileChanges() {
    const novoLink = document.getElementById('input-url-vitrine').value;
    // Lógica para salvar a url se necessário
    showNotification("Link da vitrine alterado com sucesso para a página atual!");
}

// Filtro Avançado Corrigido (Corrige o bug de sumir produtos)
function filterProducts(type) {
    filtroAtual = type;
    const tabs = document.querySelectorAll('.filter-tab');
    tabs.forEach(tab => {
        tab.style.background = "transparent";
        tab.style.color = "#8E9AA8";
    });
    event.currentTarget.style.background = "#161619";
    event.currentTarget.style.color = "#fff";
    renderGrid();
}

// Desenhar Grid na Tela
function renderGrid() {
    const grid = document.getElementById('products-grid');
    if(!grid) return;
    grid.innerHTML = "";

    // Filtra comparando sem espaços vazios ou bugs de caixa alta/baixa
    const listaFiltrada = produtos.filter(p => {
        if (filtroAtual === "todos") return true;
        return p.tipo.toLowerCase().trim() === filtroAtual.toLowerCase().trim();
    });

    document.getElementById('metric-count').textContent = produtos.length;

    if(listaFiltrada.length === 0) {
        grid.innerHTML = `<p style="color:#8E9AA8; grid-column: 1/-1; text-align:center; padding: 40px 0;">Nenhum produto encontrado nesta categoria.</p>`;
        return;
    }

    listaFiltrada.forEach(p => {
        const card = document.createElement('div');
        card.style = "background:#161619; padding:20px; border-radius:16px; border:1px solid rgba(255,255,255,0.02); display:flex; flex-direction:column; gap:12px;";
        
        const fallbackImg = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=400";
        
        card.innerHTML = `
            <div style="width:100%; height:120px; border-radius:10px; background: url('${p.imagemUrl || fallbackImg}') center/cover; background-color:#121214;"></div>
            <div>
                <span style="background:rgba(0,210,223,0.1); color:#00D2DF; font-size:0.7rem; font-weight:700; padding:4px 8px; border-radius:4px; text-transform:uppercase;">${p.tipo} - ${p.subtipo}</span>
                <h4 style="margin:8px 0 4px 0; font-size:1rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${p.nome}</h4>
                <p style="color:#8E9AA8; font-size:0.75rem; margin:0; text-decoration: line-through;">R$ ${p.precoOriginal || '0,00'}</p>
                <p style="color:#00D2DF; font-size:1.2rem; font-weight:700; margin:2px 0;">R$ ${p.precoAtual}</p>
                <p style="color:#8E9AA8; font-size:0.7rem; margin:0;"><i class="fa-solid fa-credit-card"></i> ${p.parcelamento}</p>
            </div>
            <div style="display:flex; gap:8px; margin-top:auto;">
                <button style="flex:1; background:rgba(255,255,255,0.05); color:#fff; border:none; padding:8px; border-radius:8px; font-size:0.8rem; font-weight:600; cursor:pointer;">Gerenciar Oferta</button>
                <button onclick="deleteProduct(${p.id})" style="background:rgba(239,68,68,0.1); color:#EF4444; border:none; padding:8px 12px; border-radius:8px; cursor:pointer;"><i class="fa-regular fa-trash-can"></i></button>
            </div>
        `;
        grid.appendChild(card);
    });
}

// Cadastrar Novo Produto via Formulário
document.getElementById('form-add-product').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const novoProd = {
        id: Date.now(),
        tipo: document.getElementById('product-type').value,
        subtipo: document.getElementById('product-subtype').value,
        nome: document.getElementById('product-name').value,
        precoOriginal: document.getElementById('product-price-old').value || "0,00",
        precoAtual: document.getElementById('product-price-new').value,
        parcelamento: document.getElementById('product-installments').value,
        imagemUrl: document.getElementById('product-img').value
    };

    produtos.push(novoProd);
    localStorage.setItem('vide_produtos', JSON.stringify(produtos));
    
    this.reset();
    toggleModal(false);
    renderGrid();
    showNotification("Novo produto cadastrado com sucesso!");
});

// Deletar Produto
function deleteProduct(id) {
    produtos = produtos.filter(p => p.id !== id);
    localStorage.setItem('vide_produtos', JSON.stringify(produtos));
    renderGrid();
    showNotification("Produto removido do catálogo.", false);
}
