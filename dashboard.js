import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, updateDoc, collection, addDoc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

console.log("[Minha Loja Vide] Inicializando painel SPA com sistema de produtos.");

let usuarioAtualUid = null;
const urlParams = new URLSearchParams(window.location.search);
const lojaParamAtual = urlParams.get('loja');

// EXIBE OS LINKS GERADOS NA ABA DE PERFIL
function exibirLinksGeradosNoPerfil(slug) {
    const statusMsg = document.getElementById('status-msg');
    if (!statusMsg) return;
    statusMsg.innerHTML = `
        <div style="margin-top: 20px; padding: 15px; background-color: #161616; border: 1px solid #222; border-left: 4px solid #00bcd4; border-radius: 8px; text-align: left; box-sizing: border-box; width: 100%;">
            <p style="color: #4caf50; font-weight: bold; margin: 0 0 15px 0; font-size: 14px;">🎉 Link configurado com sucesso!</p>
            <div style="margin-bottom: 12px;">
                <span style="font-size: 11px; color: #888; display: block; font-weight: bold; margin-bottom: 4px;">🌐 LINK DA VITRINE (CLIENTES):</span>
                <a href="https://videdigital.github.io/vide-digital/?loja=${slug}" target="_blank" style="color: #00bcd4; font-size: 13px; text-decoration: none; font-weight: 500;">
                    videdigital.github.io/vide-digital/?loja=${slug}
                </a>
            </div>
            <div>
                <span style="font-size: 11px; color: #888; display: block; font-weight: bold; margin-bottom: 4px;">🔑 LINK ADMINISTRATIVO DO SEU PAINEL:</span>
                <a href="https://videdigital.github.io/vide-digital/dashboard.html?loja=${slug}" target="_blank" style="color: #ff9800; font-size: 13px; text-decoration: none; font-weight: 500;">
                    videdigital.github.io/vide-digital/dashboard.html?loja=${slug}
                </a>
            </div>
        </div>
    `;
}

// CARREGA E RENDERIZA OS PRODUTOS DO LOJISTA
async function carregarProdutosDoBanco(uid) {
    const container = document.getElementById('container-produtos-lista');
    const contadorProdutos = document.getElementById('dash-qtd-produtos');
    if (!container) return;

    try {
        const q = query(collection(db, "produtos"), where("userId", "==", uid));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            container.innerHTML = "Nenhum produto cadastrado nesta loja ainda.";
            if (contadorProdutos) contadorProdutos.innerText = "0";
            return;
        }

        if (contadorProdutos) contadorProdutos.innerText = querySnapshot.size;

        let htmlProdutos = `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 15px; width: 100%;">`;
        
        querySnapshot.forEach((doc) => {
            const prod = doc.data();
            htmlProdutos += `
                <div style="background-color: #161616; border: 1px solid #252525; padding: 15px; border-radius: 8px; text-align: center;">
                    <img src="${prod.imagem || 'https://via.placeholder.com/150'}" style="width: 100%; height: 120px; object-fit: cover; border-radius: 6px; margin-bottom: 10px; background-color: #222;">
                    <h4 style="font-size: 14px; margin-bottom: 5px; color: #fff; text-align: left;">${prod.nome}</h4>
                    <p style="color: #00bcd4; font-weight: bold; font-size: 15px; text-align: left;">R$ ${prod.preco}</p>
                </div>
            `;
        });

        htmlProdutos += `</div>`;
        container.innerHTML = htmlProdutos;

    } catch (error) {
        console.error("Erro ao carregar produtos:", error);
        container.innerHTML = "Erro ao carregar lista de produtos.";
    }
}

// JANELA MODAL FLUTUANTE PARA CADASTRO DE PRODUTOS
function abrirModalNovoProduto() {
    let modal = document.getElementById('modal-produto');
    if (modal) { modal.style.display = 'flex'; return; }

    modal = document.createElement('div');
    modal.id = 'modal-produto';
    modal.style = "position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background-color: rgba(0,0,0,0.85); z-index: 10000; display: flex; justify-content: center; align-items: center; padding: 20px; box-sizing: border-box;";
    modal.innerHTML = `
        <div style="background-color: #121212; border: 1px solid #222; padding: 30px; border-radius: 12px; width: 100%; max-width: 450px; box-sizing: border-box;">
            <h3 style="color: #fff; margin: 0 0 20px 0; font-size: 18px; font-weight: 600;">📦 Cadastrar Novo Produto</h3>
            
            <label>Nome do Produto</label>
            <div class="input-group"><input type="text" id="prod-nome" placeholder="Ex: Curso de Confeitaria"></div>
            
            <label>Preço (R$)</label>
            <div class="input-group"><input type="text" id="prod-preco" placeholder="Ex: 97,90"></div>
            
            <label>URL da Imagem do Produto</label>
            <div class="input-group"><input type="text" id="prod-img" placeholder="https://linkdafoto.com/imagem.jpg"></div>

            <label>Link de Checkout / Compra</label>
            <div class="input-group"><input type="text" id="prod-link" placeholder="Link da Kiwify, Hotmart, etc."></div>
            
            <div style="display: flex; gap: 10px; margin-top: 10px;">
                <button id="btn-cancelar-prod" style="width: 50%; padding: 12px; border-radius: 8px; border: 1px solid #333; background: #222; color: #fff; font-weight: bold; cursor: pointer;">Cancelar</button>
                <button id="btn-salvar-prod-db" style="width: 50%; padding: 12px; border-radius: 8px; border: none; background: #00bcd4; color: #fff; font-weight: bold; cursor: pointer;">Salvar Produto</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlayInputsCSS(modal));

    // Ações do Modal
    document.getElementById('btn-cancelar-prod').addEventListener('click', () => modal.style.display = 'none');
    document.getElementById('btn-salvar-prod-db').addEventListener('click', async () => {
        const nome = document.getElementById('prod-nome').value.trim();
        const preco = document.getElementById('prod-preco').value.trim();
        const imagem = document.getElementById('prod-img').value.trim();
        const linkCompra = document.getElementById('prod-link').value.trim();

        if (!nome || !preco) { alert("Nome e Preço são obrigatórios!"); return; }

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
            // Limpa os campos
            document.getElementById('prod-nome').value = '';
            document.getElementById('prod-preco').value = '';
            document.getElementById('prod-img').value = '';
            document.getElementById('prod-link').value = '';

            carregarProdutosDoBanco(usuarioAtualUid);
        } catch (error) {
            alert("Erro ao salvar produto: " + error.message);
        }
    });
}

// Injeta estilos temporários caso os inputs dentro do modal precisem herdar a folha global do app
def overlayInputsCSS(el) {
    return el;
}

// EXECUTA APÓS O CARREGAMENTO DA PÁGINA PARA TRAVAR OS BOTÕES
function inicializarNavegacaoEAbas() {
    console.log("[Minha Loja Vide] Ativando cliques do menu lateral...");
    const menuItems = document.querySelectorAll('.menu-item');
    const sections = document.querySelectorAll('.app-section');

    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetSectionId = item.getAttribute('data-target');

            menuItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            sections.forEach(sec => {
                if (sec.id === targetSectionId) { sec.classList.add('active'); } 
                else { sec.classList.remove('active'); }
            });
        });
    });

    // Ouvinte do Botão Adicionar Produto (Visão Geral)
    const btnAddProd = document.querySelector('.btn-primary');
    if (btnAddProd && btnAddProd.innerText.includes("Adicionar Novo Produto")) {
        btnAddProd.addEventListener('click', abrirModalNovoProduto);
    }

    // Configuração dos botões de ação adicionais
    document.getElementById('btn-salvar-pixels')?.addEventListener('click', async () => {
        if (!usuarioAtualUid) return;
        const fb = document.getElementById('input-pixel-facebook').value.trim();
        const gg = document.getElementById('input-tag-google').value.trim();
        try {
            await updateDoc(doc(db, "usuarios", usuarioAtualUid), { pixelFacebook: fb, tagGoogle: gg });
            alert("Configurações de Pixel atualizadas com sucesso!");
        } catch (error) { alert("Erro ao salvar pixels: " + error.message); }
    });

    document.getElementById('btn-salvar-slug')?.addEventListener('click', async () => {
        const slugInput = document.getElementById('slug-input');
        if (!usuarioAtualUid || !slugInput) return;
        const novoSlug = slugInput.value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
        slugInput.value = novoSlug;
        if (!novoSlug) return;

        try {
            await updateDoc(doc(db, "usuarios", usuarioAtualUid), { urlLoja: novoSlug });
            const novaUrlAdmin = window.location.protocol + "//" + window.location.host + window.location.pathname + `?loja=${novoSlug}`;
            window.history.pushState({ path: novaUrlAdmin }, '', novaUrlAdmin);
            
            const btnMinhaLoja = document.getElementById('sb-minhaloja');
            if (btnMinhaLoja) btnMinhaLoja.setAttribute('href', `https://videdigital.github.io/vide-digital/?loja=${novoSlug}`);
            
            exibirLinksGeradosNoPerfil(novoSlug);
            alert("Link comercial atualizado com sucesso!");
        } catch (error) { console.error("Erro ao alterar link:", error); }
    });

    document.getElementById('btn-copiar-url')?.addEventListener('click', () => {
        const slugInput = document.getElementById('slug-input');
        if (!slugInput) return;
        const linkCompleto = `videdigital.github.io/vide-digital/?loja=${slugInput.value}`;
        navigator.clipboard.writeText(linkCompleto);
        alert("Link da loja copiado com sucesso!");
    });

    document.getElementById('btn-logout')?.addEventListener('click', () => {
        signOut(auth).then(() => { window.location.href = 'login.html'; });
    });
}

// MONITORAMENTO DA SESSÃO DO FIREBASE
onAuthStateChanged(auth, async (user) => {
    if (user) {
        usuarioAtualUid = user.uid;
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () => {
                inicializarNavegacaoEAbas();
                verificarEAutenticarRota(user.uid);
            });
        } else {
            inicializarNavegacaoEAbas();
            verificarEAutenticarRota(user.uid);
        }
    } else {
        window.location.href = 'login.html';
    }
});

async function verificarEAutenticarRota(uid) {
    try {
        const userDoc = await getDoc(doc(db, "usuarios", uid));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            const slugSalvo = userData.urlLoja || "";

            if (slugSalvo && lojaParamAtual !== slugSalvo) {
                window.location.href = `dashboard.html?loja=${slugSalvo}`;
                return;
            }

            const btnMinhaLoja = document.getElementById('sb-minhaloja');
            if (btnMinhaLoja) btnMinhaLoja.setAttribute('href', `https://videdigital.github.io/vide-digital/?loja=${slugSalvo}`);
            
            const slugInput = document.getElementById('slug-input');
            if (slugInput) slugInput.value = slugSalvo;
            
            exibirLinksGeradosNoPerfil(slugSalvo);
            carregarProdutosDoBanco(uid);

            if (document.getElementById('input-pixel-facebook')) {
                document.getElementById('input-pixel-facebook').value = userData.pixelFacebook || "";
            }
            if (document.getElementById('input-tag-google')) {
                document.getElementById('input-tag-google').value = userData.tagGoogle || "";
            }
        }
    } catch (error) { console.error("Erro ao ler dados da sessão segura:", error); }
}
