import { db } from './firebase-init.js';
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

console.log("[Vitrine Vide] Inicializando renderização pública e motores de tráfego pago.");

const urlParams = new URLSearchParams(window.location.search);
const slugLoja = urlParams.get('loja');

// ==========================================
// INJEÇÃO DINÂMICA DE PIXELS (COMPLETO PARA ADS)
// ==========================================
function dispararPixelFacebook(id) {
    if (!id) return;
    console.log(`[Tráfego Pago] Facebook Pixel Detectado: ${id}. Injetando Script de PageView.`);
    const scriptBase = document.createElement('script');
    scriptBase.innerHTML = `
        !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
        n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
        document,'script','https://connect.facebook.net/en_US/fbevents.js');
        fbq('init', '${id}');
        fbq('track', 'PageView');
    `;
    document.head.appendChild(scriptBase);
}

function dispararTagGoogle(id) {
    if (!id) return;
    console.log(`[Tráfego Pago] Google Ads Tag Detectada: ${id}. Injetando Tag Global.`);
    const gScript = document.createElement('script');
    gScript.async = true;
    gScript.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
    document.head.appendChild(gScript);

    const gScriptInit = document.createElement('script');
    gScriptInit.innerHTML = `
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', '${id}');
    `;
    document.head.appendChild(gScriptInit);
}

// ==========================================
// CORE DE RENDERIZAÇÃO E CONSULTA DUPLA
// ==========================================
async function montarVitrineComercial() {
    const loader = document.getElementById('loader');
    const txtLoader = document.getElementById('loader-text');
    const gridProdutos = document.getElementById('vitrine-produtos-grid');
    const headerTitulo = document.getElementById('store-name');

    // Validação preventiva de URL
    if (!slugLoja) {
        if (txtLoader) {
            txtLoader.innerHTML = `<span style='color:#f44336; font-weight:bold;'>Acesso Inválido!</span><br>A URL de acesso precisa conter a tag da loja.<br>Exemplo: ?loja=nomedasualoja`;
        }
        return;
    }

    try {
        // PASSO 1: Descobrir o UID do usuário através do subdomínio (slug) recebido
        const qUsuario = query(collection(db, "usuarios"), where("urlLoja", "==", slugLoja));
        const userSnapshot = await getDocs(qUsuario);

        if (userSnapshot.empty) {
            if (txtLoader) {
                txtLoader.innerHTML = `<span style='color:#f44336; font-weight:bold;'>Loja Não Encontrada!</span><br>A vitrine comercial correspondente ao termo "${slugLoja}" não existe ou foi desativada.`;
            }
            return;
        }

        // Recupera credenciais e dados do dono da loja
        const documentoUser = userSnapshot.docs[0];
        const dadosDono = documentoUser.data();
        const uidDonoDaLoja = documentoUser.id;

        // Customiza o layout e o Título da Página com o nome do cliente
        document.title = `Vitrine Oficial - ${slugLoja}`;
        if (headerTitulo) {
            headerTitulo.innerHTML = `${slugLoja} <span>Vitrine</span>`;
        }

        // PASSO 2: Rodar os Rastreadores de Tráfego cadastrados no Perfil
        if (dadosDono.pixelFacebook) dispararPixelFacebook(dadosDono.pixelFacebook);
        if (dadosDono.tagGoogle) dispararTagGoogle(dadosDono.tagGoogle);

        // PASSO 3: Buscar na tabela de produtos tudo o que pertence a esse UID
        const qProdutos = query(collection(db, "produtos"), where("userId", "==", uidDonoDaLoja));
        const produtosSnapshot = await getDocs(qProdutos);

        if (produtosSnapshot.empty) {
            if (gridProdutos) {
                gridProdutos.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: #666; padding: 60px 0; font-size: 15px;">Nenhum produto em destaque ou disponível no momento nesta vitrine.</p>`;
            }
            if (loader) loader.style.display = 'none';
            return;
        }

        // PASSO 4: Montagem do HTML e injeção inteligente de Checkout ou WhatsApp
        let construtor Cards = "";
        produtosSnapshot.forEach((docProd) => {
            const prod = docProd.data();
            const fotoPronta = prod.imagem || 'https://via.placeholder.com/350x220';
            const textoDescricao = prod.descricao || 'Nenhuma descrição detalhada fornecida para este item.';
            const textoParcelas = prod.parcelamento || '';

            // Regra do Botão de Ação Dinâmico
            let linkBotaoFinal = prod.linkCompra || '#';
            let classeEstiloBotao = "btn-action btn-checkout";
            let textoInternoBotao = "Adquirir Agora";

            if (prod.tipoBotao === "whatsapp") {
                classeEstiloBotao = "btn-action btn-whatsapp";
                textoInternoBotao = "Chamar no WhatsApp";
                
                // Limpeza completa de caracteres do número para evitar quebras de Link da API
                const numeroTratado = prod.linkCompra.replace(/[^0-9]/g, '');
                linkBotaoFinal = `https://api.whatsapp.com/send?phone=${numeroTratado}&text=Olá! Estava navegando na sua vitrine e gostaria de tirar dúvidas sobre o produto *${encodeURIComponent(prod.nome)}*.`;
            }

            construtorCards += `
                <div class="product-card">
                    <img src="${fotoPronta}" class="product-img" alt="${prod.nome}">
                    <div class="product-info">
                        <h3 class="product-name">${prod.nome}</h3>
                        <p class="product-desc">${textoDescricao}</p>
                        <div class="product-price-container">
                            <p class="product-price">R$ ${prod.preco}</p>
                            <p class="product-installment">${textoParcelas}</p>
                        </div>
                        <a href="${linkBotaoFinal}" target="_blank" class="${classeEstiloBotao}">${textoInternoBotao}</a>
                    </div>
                </div>
            `;
        });

        if (gridProdutos) gridProdutos.innerHTML = construtorCards;

        // Fecha e esconde o Loader com sucesso
        if (loader) loader.style.display = 'none';

    } catch (erro) {
        console.error("[Vitrine] Erro fatal na compilação dos dados:", erro);
        if (txtLoader) {
            txtLoader.innerHTML = `<span style='color:#f44336; font-weight:bold;'>Erro de Conexão!</span><br>Houve uma falha na comunicação com o banco de dados do Firebase.`;
        }
    }
}

// Inicialização imediata ao carregar a página
montarVitrineComercial();
