// Função Dinâmica para Alterar o Favicon da Aba com a Imagem do Cliente
function applyDynamicFavicon(imageUrl) {
    if (!imageUrl) return;
    
    let faviconLink = document.querySelector("link[rel~='icon']");
    if (!faviconLink) {
        faviconLink = document.createElement('link');
        faviconLink.rel = 'icon';
        document.getElementsByTagName('head')[0].appendChild(faviconLink);
    }
    faviconLink.href = imageUrl;
}

// Execução principal da Loja
document.addEventListener("DOMContentLoaded", async () => {
    // Configura o ano atual no rodapé automaticamente
    document.getElementById("year-copy").textContent = new Date().getFullYear();

    // 1. Extrair parâmetro da URL (?loja=slug)
    const params = new URLSearchParams(window.location.search);
    const storeSlug = params.get("loja");

    if (!storeSlug) {
        showErrorPage("Link inválido. Nenhuma loja foi especificada.");
        return;
    }

    try {
        // =========================================================================
        // EXEMPLO DE INTEGRAÇÃO COM SEU FIREBASE BASEADO NO SEU BANCO DE DADOS:
        // Substitua pelo mapeamento correto do seu Firestore ou Realtime Database.
        // =========================================================================
        
        /* const storeRef = doc(db, "lojas", storeSlug);
        const storeSnap = await getDoc(storeRef);
        const storeData = storeSnap.data();
        */

        // Simulando resposta do banco de dados coletando as variáveis do seu painel
        const mockDbFetch = {
            nomePublico: "Vide Digital", 
            tituloHero: "Explore nossos produtos e treinamentos digitais exclusivos",
            subtitulo: "A evolução do seu conhecimento começa aqui.",
            fotoPerfilUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=150&q=80", // Coloque o link real da imagem salva
            mostrarLogo: true,
            corDestaque: "#00D2DF",
            redesSociais: {
                whatsapp: "11992960466",
                instagram: "academyvide",
                tiktok: "vlz__in"
            },
            produtos: [
                {
                    id: "p1",
                    nome: "Pulverizador Snow Foam 3 em 1 - Pressão Borrifadora Premium",
                    precoOriginal: "99.99",
                    precoAtual: "76.62",
                    tipo: "fisico",
                    imagemUrl: "https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=500&q=80",
                    linkDestino: "https://meli.la/2d2c2jR",
                    parcelamentoTexto: "Em até 12x de R$ 7,65"
                }
            ]
        };

        // Renderiza os dados na tela
        renderStoreFront(mockDbFetch);

    } catch (error) {
        console.error("Erro geral na busca da infraestrutura da loja:", error);
        showErrorPage("Ocorreu um erro ao carregar os dados desta vitrine.");
    } finally {
        // FECHAMENTO BLINDADO: Garante que o loading feche sempre independente de sucesso ou erro
        const loader = document.getElementById("loading-screen");
        if (loader) {
            loader.style.opacity = "0";
            setTimeout(() => loader.classList.add("hidden"), 400);
        }
        document.getElementById("store-wrapper").classList.remove("hidden");
    }
});

// Função interna para construir a interface limpa
function renderStoreFront(data) {
    // Configura títulos e cabeçalho principal
    document.title = `${data.nomePublico} | Vitrine Oficial`;
    document.getElementById("store-title").textContent = data.nomePublico;
    document.getElementById("store-subtitle").textContent = data.tituloHero || data.subtitulo;
    document.getElementById("footer-store-name").textContent = data.nomePublico;

    // Gerenciamento Inteligente da Foto de Perfil
    const avatarWrapper = document.getElementById("store-avatar-wrapper");
    const logoImg = document.getElementById("store-logo");
    
    if (data.mostrarLogo && data.fotoPerfilUrl) {
        logoImg.src = data.fotoPerfilUrl;
        avatarWrapper.classList.remove("hidden");
        // IMPLEMENTAÇÃO SOLICITADA: Aplica a foto de perfil como ícone da aba do navegador
        applyDynamicFavicon(data.fotoPerfilUrl);
    } else {
        avatarWrapper.classList.add("hidden");
    }

    // Injeta Redes Sociais Dinâmicas
    const socialGrid = document.getElementById("social-links");
    socialGrid.innerHTML = "";
    
    if (data.redesSociais) {
        if (data.redesSociais.whatsapp) {
            socialGrid.innerHTML += `<a href="https://wa.me/${data.redesSociais.whatsapp}" target="_blank" class="social-icon"><i class="fa-brands fa-whatsapp"></i></a>`;
        }
        if (data.redesSociais.instagram) {
            socialGrid.innerHTML += `<a href="https://instagram.com/${data.redesSociais.instagram}" target="_blank" class="social-icon"><i class="fa-brands fa-instagram"></i></a>`;
        }
        if (data.redesSociais.tiktok) {
            socialGrid.innerHTML += `<a href="https://tiktok.com/@${data.redesSociais.tiktok}" target="_blank" class="social-icon"><i class="fa-brands fa-tiktok"></i></a>`;
        }
    }

    // Renderizar os Produtos na Grid
    renderProductsGrid(data.produtos, "fisico");

    // Lógica básica de Alternância de Abas (Físicos vs Digitais)
    const btnFisicos = document.getElementById("btn-fisicos");
    const btnDigitais = document.getElementById("btn-digitais");

    btnFisicos.addEventListener("click", () => {
        btnFisicos.classList.add("active");
        btnDigitais.classList.remove("active");
        renderProductsGrid(data.produtos, "fisico");
    });

    btnDigitais.addEventListener("click", () => {
        btnDigitais.classList.add("active");
        btnFisicos.classList.remove("active");
        renderProductsGrid(data.produtos, "digital");
    });
}

// Injetor de Cards na Grid Dinâmica
function renderProductsGrid(products, typeFilter) {
    const grid = document.getElementById("products-grid");
    const emptyState = document.getElementById("empty-state");
    grid.innerHTML = "";

    const filtered = products.filter(p => p.type === typeFilter || p.tipo === typeFilter);

    if (filtered.length === 0) {
        grid.classList.add("hidden");
        emptyState.classList.remove("hidden");
        return;
    }

    grid.classList.remove("hidden");
    emptyState.classList.add("hidden");

    filtered.forEach(product => {
        const precoDe = product.precoOriginal ? `<div class="old-price">R$ ${product.precoOriginal}</div>` : '';
        const textoParcelas = product.parcelamentoTexto ? `<div class="installment-text">${product.parcelamentoTexto}</div>` : '';

        const card = document.createElement("div");
        card.className = "product-card animate-fade-in";
        card.innerHTML = `
            <div class="product-image-wrapper">
                <img src="${product.imagemUrl}" alt="${product.nome}" class="product-image" loading="lazy">
            </div>
            <div class="product-info">
                <h2 class="product-title">${product.nome}</h2>
                <div class="price-container">
                    ${precoDe}
                    <div class="current-price">R$ ${product.precoAtual}</div>
                    ${textoParcelas}
                </div>
                <a href="${product.linkDestino}" target="_blank" class="btn-cta">
                    <i class="fa-solid fa-cart-shopping"></i> Comprar Agora
                </a>
            </div>
        `;
        grid.appendChild(card);
    });
}

// Fallback de exibição em caso de falhas críticas
function showErrorPage(message) {
    document.getElementById("loading-text").innerHTML = `<span style="color:#FF4B4B;font-weight:600;">Erro de Carregamento</span><br><br>${message}`;
}
