import { db } from './firebase-init.js';
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

console.log("[Vitrine Vide] Inicializando renderização pública de alta performance.");

const urlParams = new URLSearchParams(window.location.search);
const slugLoja = urlParams.get('loja');

function dispararPixelFacebook(id) {
    if (!id) return;
    const scriptBase = document.createElement('script');
    scriptBase.innerHTML = `
        !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
        n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
        document,'script','https://connect.facebook.net/en_US/fbevents.js');
        fbq('init', '${id}'); fbq('track', 'PageView');
    `;
    document.head.appendChild(scriptBase);
}

function dispararTagGoogle(id) {
    if (!id) return;
    const gScript = document.createElement('script');
    gScript.async = true;
    gScript.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
    document.head.appendChild(gScript);

    const gScriptInit = document.createElement('script');
    gScriptInit.innerHTML = `
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date()); gtag('config', '${id}');
    `;
    document.head.appendChild(gScriptInit);
}

async function montarVitrineComercial() {
    const loader = document.getElementById('loader');
    const txtLoader = document.getElementById('loader-text');
    const gridProdutos = document.getElementById('vitrine-produtos-grid');
    const headerTitulo = document.getElementById('store-name');

    if (!slugLoja) {
        if (txtLoader) txtLoader.innerHTML = "<span style='color:#f44336; font-weight:bold;'>Acesso Inválido!</span><br>Falta a tag da loja na URL.";
        return;
    }

    try {
        const qUsuario = query(collection(db, "usuarios"), where("urlLoja", "==", slugLoja));
        const userSnapshot = await getDocs(qUsuario);

        if (userSnapshot.empty) {
            if (txtLoader) txtLoader.innerHTML = "<span style='color:#f44336; font-weight:bold;'>Loja Não Encontrada!</span>";
            return;
        }

        const documentoUser = userSnapshot.docs[0];
        const dadosDono = documentoUser.data();
        const uidDonoDaLoja = documentoUser.id;

        document.title = `Vitrine Oficial - ${slugLoja}`;
        if (headerTitulo) headerTitulo.innerHTML = `${slugLoja} <span>Vitrine</span>`;

        if (dadosDono.pixelFacebook) dispararPixelFacebook(dadosDono.pixelFacebook);
        if (dadosDono.tagGoogle) dispararTagGoogle(dadosDono.tagGoogle);

        const qProdutos = query(collection(db, "produtos"), where("userId", "==", uidDonoDaLoja));
        const produtosSnapshot = await getDocs(qProdutos);

        if (produtosSnapshot.empty) {
            if (gridProdutos) gridProdutos.innerHTML = `<p style="grid-column:1/-1; text-align:center; color:#666; padding:60px 0;">Nenhum produto cadastrado.</p>`;
            if (loader) loader.style.display = 'none';
            return;
        }

        let construtorCards = "";
        produtosSnapshot.forEach((docProd) => {
            const prod = docProd.data();
            const fotoPronta = prod.imagem || 'https://via.placeholder.com/350x220';
            const textoDescricao = prod.descricao || '';
            
            let exibirParc = "";
            if (prod.parcelamento) {
                exibirParc = prod.parcelamento;
            } else if (prod.condicaoParcelas && prod.condicaoParcelas !== "Sem parcelamento") {
                exibirParc = `Em até ${prod.condicaoParcelas}`;
            }

            let linkBotaoFinal = prod.linkCompra || '#';
            let classeEstiloBotao = "btn-action btn-checkout";
            let textoInternoBotao = "Comprar Agora";

            if (prod.tipoBotao === "whatsapp") {
                classeEstiloBotao = "btn-action btn-whatsapp";
                textoInternoBotao = "Fale Conosco";
                const numeroTratado = prod.linkCompra.replace(/[^0-9]/g, '');
                linkBotaoFinal = `https://api.whatsapp.com/send?phone=${numeroTratado}&text=Olá! Gostaria de saber mais sobre o produto *${encodeURIComponent(prod.nome)}*.`;
            }

            construtorCards += `
                <div class="product-card">
                    <img src="${fotoPronta}" class="product-img">
                    <div class="product-info">
                        <h3 class="product-name">${prod.nome}</h3>
                        <p class="product-desc">${textoDescricao}</p>
                        <div class="product-price-container">
                            ${prod.precoDe ? `<p style="color:#555; text-decoration:line-through; font-size:13px; margin-bottom:2px;">R$ ${prod.precoDe}</p>` : ''}
                            <p class="product-price">R$ ${prod.preco}</p>
                            <p class="product-installment">${exibirParc}</p>
                        </div>
                        <a href="${linkBotaoFinal}" target="_blank" class="${classeEstiloBotao}">${textoInternoBotao}</a>
                    </div>
                </div>
            `;
        });

        if (gridProdutos) gridProdutos.innerHTML = construtorCards;
        if (loader) loader.style.display = 'none';

    } catch (erro) {
        console.error(erro);
        if (txtLoader) txtLoader.innerHTML = "<span style='color:#f44336;'>Erro de conexão com o banco.</span>";
    }
}

montarVitrineComercial();
