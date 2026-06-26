// Altera o ícone da aba (Favicon) usando a foto de perfil do próprio cliente
function applyDynamicFavicon(imageUrl) {
    if (!imageUrl) return;
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.getElementsByTagName('head')[0].appendChild(link);
    }
    link.href = imageUrl;
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("year-copy").textContent = new Date().getFullYear();

    // Banco de dados já configurado com suas informações reais da plataforma
    const meuPainelData = {
        nomePublico: "Vide Digital", 
        tituloHero: "Domine novas profissões e fature alto no mercado digital",
        fotoPerfilUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=150&q=80", 
        mostrarLogo: true,
        redesSociais: {
            whatsapp: "11992960466",
            instagram: "academyvide",
            tiktok: "vlz__in"
        },
        produtos: [
            {
                id: "p1",
                nome: "Curso de Barbearia Profissional do Zero",
                precoOriginal: "197,00",
                precoAtual: "99,99",
                tipo: "digital",
                imagemUrl: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=500&q=80",
                linkDestino: "https://pay.kiwify.com.br/",
                parcelamentoTexto: "Em até 12x de R$ 9,74"
            },
            {
                id: "p2",
                nome: "Curso de Macarons Gourmet - Do Zero ao Pro",
                precoOriginal: "297,00",
                precoAtual: "147,00",
                tipo: "digital",
                imagemUrl: "https://images.unsplash.com/photo-1569864358642-9d1684040f43?auto=format&fit=crop&w=500&q=80",
                linkDestino: "https://pay.kiwify.com.br/",
                parcelamentoTexto: "Em até 12x de R$ 14,32"
            },
            {
                id: "p3",
                nome: "Formação Completa Alongamento Natural de Unhas",
                precoOriginal: "147,00",
                precoAtual: "67,00",
                tipo: "digital",
                imagemUrl: "https://images.unsplash.com/photo-1604654894610-df4906b1850a?auto=format&fit=crop&w=500&q=80",
                linkDestino: "https://pay.kiwify.com.br/",
                parcelamentoTexto: "Em até 12x de R$ 6,54"
            }
        ]
    };

    // Inicialização da interface
    try {
        renderStoreFront(meuPainelData);
    } catch (err) {
        console.error("Erro ao renderizar:", err);
    } finally {
        // Remove a tela de carregamento de forma segura e fluida
        const loader = document.getElementById("loading-screen");
        if (loader) {
            loader.style.opacity = "0";
            setTimeout(() => loader.classList.add("hidden"), 400);
        }
        document.getElementById("store-wrapper").classList.remove("hidden");
    }
});

function renderStoreFront(data) {
    document.title = `${data.nomePublico} | Vitrine`;
    document.getElementById("store-title").textContent = data.nomePublico;
    document.getElementById("store-subtitle").textContent = data.tituloHero;

    // Foto de Perfil / Favicon Dinâmico
    const avatarWrapper = document.getElementById("store-avatar-wrapper");
    if (data.mostrarLogo && data.fotoPerfilUrl) {
        document.getElementById("store-logo").src = data.fotoPerfilUrl;
        applyDynamicFavicon(data.fotoPerfilUrl);
    } else {
        avatarWrapper.classList.add("hidden");
    }

    // Redes Sociais
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

    // Filtros de Categoria
    const btnFisicos = document.getElementById("btn-fisicos");
    const btnDigitais = document.getElementById("btn-digitais");

    renderProductsGrid(data.produtos, "digital");

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

function renderProductsGrid(products, typeFilter) {
    const grid = document.getElementById("products-grid");
    const emptyState = document.getElementById("empty-state");
    grid.innerHTML = "";

    const filtered = products.filter(p => p.tipo === typeFilter);

    if (filtered.length === 0) {
        grid.classList.add("hidden");
        emptyState.classList.remove("hidden");
        return;
    }

    grid.classList.remove("hidden");
    emptyState.classList.add("hidden");

    filtered.forEach(p => {
        const card = document.createElement("div");
        card.className = "product-card animate-fade-in";
        card.innerHTML = `
            <div class="product-image-wrapper">
                <img src="${p.imagemUrl}" alt="${p.nome}" class="product-image" loading="lazy">
            </div>
            <div class="product-info">
                <h2 class="product-title">${p.nome}</h2>
                <div class="price-container">
                    <div class="old-price">R$ ${p.precoOriginal}</div>
                    <div class="current-price">R$ ${p.precoAtual}</div>
                    <div class="installment-text">${p.parcelamentoTexto}</div>
                </div>
                <a href="${p.linkDestino}" target="_blank" class="btn-cta">
                    <i class="fa-solid fa-bolt"></i> Acessar Agora
                </a>
            </div>
        `;
        grid.appendChild(card);
    });
}
