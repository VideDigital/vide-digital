import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, updateDoc, collection, addDoc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

console.log("[Minha Loja Vide] Inicializando arquitetura unificada de alta performance.");

let usuarioAtualUid = null;
const urlParams = new URLSearchParams(window.location.search);
const lojaParamAtual = urlParams.get('loja');

// ==========================================
// 1. SISTEMA PREMIUM DE NAVEGAÇÃO INTERNA (SPA)
// ==========================================
function gerenciarAbasPainel() {
    const menuItems = document.querySelectorAll('.menu-item');
    const sections = document.querySelectorAll('.app-section');

    menuItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetSectionId = item.getAttribute('data-target');

            // Troca o foco visual do menu
            menuItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            // Alterna a exibição das seções
            sections.forEach(sec => {
                if (sec.id === targetSectionId) {
                    sec.style.display = 'block';
                    sec.classList.add('active');
                } else {
                    sec.style.display = 'none';
                    sec.classList.remove('active');
                }
            });
        });
    });
}

// ==========================================
// 2. COMPONENTE DE RENDERIZAÇÃO DOS LINKS (ESTILO ORIGINAL)
// ==========================================
function exibirLinksGeradosNoPerfil(slug) {
    const statusMsg = document.getElementById('status-msg');
    if (!statusMsg) return;

    statusMsg.innerHTML = `
        <div style="margin-top: 25px; padding: 20px; background-color: #161616; border: 1px solid #222; border-left: 4px solid #00bcd4; border-radius: 8px; text-align: left;">
            <p style="color: #4caf50; font-weight: bold; margin: 0 0 15px 0; font-size: 14px; display: flex; align-items: center; gap: 6px;">🔮 Loja configurada com sucesso!</p>
            <div style="margin-bottom: 15px;">
                <span style="font-size: 11px; color: #888; display: block; font-weight: bold; margin-bottom: 4px; letter-spacing: 0.5px;">🌐 LINK DA VITRINE (CLIENTES):</span>
                <a href="https://videdigital.github.io/vide-digital/?loja=${slug}" target="_blank" style="color: #00bcd4; font-size: 14px; text-decoration: none; font-weight: 500; border-bottom: 1px dashed rgba(0,188,212,0.4); padding-bottom: 2px;">
                    https://videdigital.github.io/vide-digital/?loja=${slug}
                </a>
            </div>
            <div>
                <span style="font-size: 11px; color: #888; display: block; font-weight: bold; margin-bottom: 4px; letter-spacing: 0.5px;">🔑 LINK ESPECÍFICO DE ADM (GERENCIAMENTO):</span>
                <a href="https://videdigital.github.io/vide-digital/dashboard.html?loja=${slug}" target="_blank" style="color: #ff9800; font-size: 14px; text-decoration: none; font-weight: 500; border-bottom: 1px dashed rgba(255,152,0,0.4); padding-bottom: 2px;">
                    https://videdigital.github.io/vide-digital/dashboard.html?loja=${slug}
                </a>
            </div>
        </div>
    `;
}

// ==========================================
// 3. CARREGAMENTO E RENDERIZAÇÃO DE PRODUTOS
// ==========================================
async function carregarProdutosDoBanco(uid) {
    const container = document.getElementById('container-produtos-lista');
    const contadorProdutos = document.getElementById('dash-qtd-produtos');
    if (!container) return;

    try {
        const q = query(collection(db, "produtos"), where("userId", "==", uid));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            container.innerHTML = `<div style="color: #666; font-size: 14px; padding: 20px 0;">Nenhum produto cadastrado nesta loja ainda.</div>`;
            if (contadorProdutos) contadorProdutos.innerText = "0";
            return;
        }

        if (contadorProdutos) contadorProdutos.innerText = querySnapshot.size;

        let htmlProdutos = `<div class="products-grid">`;
        querySnapshot.forEach((doc) => {
            const prod = doc.data();
            const imagemValida = prod.imagem || 'https://via.placeholder.com/150';
            htmlProdutos += `
                <div class="product-item-card">
                    <img src="${imagemValida}" alt="${prod.nome}">
                    <h4>${prod.nome}</h4>
                    <p>R$ ${prod.preco}</p>
                </div>
            `;
        });
        htmlProdutos += `</div>`;
        container.innerHTML = htmlProdutos;

    } catch (error) {
        console.error("Erro ao processar catálogo:", error);
        container.innerHTML = `<div style="color: #f44336; font-size: 14px;">Erro ao carregar lista de produtos.</div>`;
    }
}

// ==========================================
// 4. CONTROLE DE MODAL FLUTUANTE (PRODUTOS)
// ==========================================
function gerenciarModalProduto() {
    const modal = document.getElementById('modal-produto');
    const btnAbrir = document.getElementById('btn-abrir-modal-prod');
    const btnCancelar = document.getElementById('btn-cancelar-prod');
    const btnSalvar = document.getElementById('btn-salvar-prod-db');

    if (!modal) return;

    btnAbrir?.addEventListener('click', () => modal.style.display = 'flex');
    btnCancelar?.addEventListener('click', () => modal.style.display = 'none');

    btnSalvar?.addEventListener('click', async () => {
        const nome = document.getElementById('prod-nome').value.trim();
        const preco = document.getElementById('prod-preco').value.trim();
        const imagem = document.getElementById('prod-img').value.trim();
        const linkCompra = document.getElementById('prod-link').value.trim();

        if (!nome || !preco) { 
            alert("Por favor, preencha o Nome e o Preço do produto!"); 
            return; 
        }

        try {
            await addDoc(collection(db, "produtos"), {
                userId: usuarioAtualUid,
                nome: nome,
                preco: preco,
                imagem: imagem,
                linkCompra: linkCompra,
                dataCadastro: new Date().toISOString()
            });
            
            modal.style.display = 'none';
            
            // Limpa o formulário
            document.getElementById('prod-nome').value = '';
            document.getElementById('prod-preco').value = '';
            document.getElementById('prod-img').value = '';
            document.getElementById('prod-link').value = '';

            // Recarrega a grade visual
            carregarProdutosDoBanco(usuarioAtualUid);
        } catch (error) {
            alert("Erro ao salvar produto no banco: " + error.message);
        }
    });
}

// ==========================================
// 5. EVENTOS GERAIS DE PERSISTÊNCIA DE DADOS
// ==========================================
function configurarAcoesAdicionais() {
    // Salvar Pixels (Aba Domínios)
    document.getElementById('btn-salvar-pixels')?.addEventListener('click', async () => {
        if (!usuarioAtualUid) return;
        const fb = document.getElementById('input-pixel-facebook').value.trim();
        const gg = document.getElementById('input-tag-google').value.trim();

        try {
            await updateDoc(doc(db, "usuarios", usuarioAtualUid), { pixelFacebook: fb, tagGoogle: gg });
            alert("Pixels de rastreamento salvos com sucesso!");
        } catch (error) {
            alert("Erro ao salvar integrações: " + error.message);
        }
    });

    // Salvar Slug Manualmente (Aba Perfil)
    document.getElementById('btn-salvar-slug')?.addEventListener('click', async () => {
        const slugInput = document.getElementById('slug-input');
        if (!usuarioAtualUid || !slugInput) return;

        const novoSlug = slugInput.value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
        slugInput.value = novoSlug;

        if (!novoSlug) {
            alert("Insira um termo válido para o link!");
            return;
        }

        try {
            await updateDoc(doc(db, "usuarios", usuarioAtualUid), { urlLoja: novoSlug });
            
            // Atualiza a barra de navegação sem forçar recarregamento completo
            const novaUrlAdmin = window.location.protocol + "//" + window.location.host + window.location.pathname + `?loja=${novoSlug}`;
            window.history.pushState({ path: novaUrlAdmin }, '', novaUrlAdmin);
            
            const btnMinhaLoja = document.getElementById('sb-minhaloja');
            if (btnMinhaLoja) btnMinhaLoja.setAttribute('href', `https://videdigital.github.io/vide-digital/?loja=${novoSlug}`);
            
            exibirLinksGeradosNoPerfil(novoSlug);
            alert("Link da vitrine alterado com sucesso!");
        } catch (error) {
            alert("Falha ao salvar link comercial: " + error.message);
        }
    });

    // Copiar link para o Clipboard
    document.getElementById('btn-copiar-url')?.addEventListener('click', () => {
        const slugInput = document.getElementById('slug-input');
        if (!slugInput || !slugInput.value) return;
        const urlCompleta = `https://videdigital.github.io/vide-digital/?loja=${slugInput.value}`;
        navigator.clipboard.writeText(urlCompleta);
        alert("Link de vendas copiado para a área de transferência!");
    });

    // Deslogar
    document.getElementById('btn-logout')?.addEventListener('click', () => {
        signOut(auth).then(() => { window.location.href = 'login.html'; });
    });
}

// ==========================================
// 6. OBSERVER DE SEGURANÇA E FLUXO PRINCIPAL
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        usuarioAtualUid = user.uid;
        
        // Garante a ativação estável dos botões
        gerenciarAbasPainel();
        gerenciarModalProduto();
        configurarAcoesAdicionais();

        // Faz o carregamento seguro das credenciais do Firestore
        autenticarEConfigurarRota(user.uid);
    } else {
        window.location.href = 'login.html';
    }
});

async function autenticarEConfigurarRota(uid) {
    try {
        const userDoc = await getDoc(doc(db, "usuarios", uid));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            const slugSalvo = userData.urlLoja || "";

            // Se tentar acessar sem o parâmetro correto, força o redirecionamento seguro
            if (slugSalvo && lojaParamAtual !== slugSalvo) {
                window.location.href = `dashboard.html?loja=${slugSalvo}`;
                return;
            }

            // Injeta dados estruturados nos inputs
            const btnMinhaLoja = document.getElementById('sb-minhaloja');
            if (btnMinhaLoja) btnMinhaLoja.setAttribute('href', `https://videdigital.github.io/vide-digital/?loja=${slugSalvo}`);
            
            const slugInput = document.getElementById('slug-input');
            if (slugInput) slugInput.value = slugSalvo;

            if (document.getElementById('input-pixel-facebook')) {
                document.getElementById('input-pixel-facebook').value = userData.pixelFacebook || "";
            }
            if (document.getElementById('input-tag-google')) {
                document.getElementById('input-tag-google').value = userData.tagGoogle || "";
            }

            // Exibe caixas de link e faz a leitura do catálogo de produtos
            exibirLinksGeradosNoPerfil(slugSalvo);
            carregarProdutosDoBanco(uid);
        }
    } catch (error) {
        console.error("Erro crítico na barreira de autenticação de rota:", error);
    }
}
