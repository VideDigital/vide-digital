import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, updateDoc, collection, addDoc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

console.log("[Minha Loja Vide] Iniciando sistema com correção de navegação.");

let usuarioAtualUid = null;
const urlParams = new URLSearchParams(window.location.search);
const lojaParamAtual = urlParams.get('loja');

// 1. NAVEGAÇÃO ENTRE ABAS
function ativarNavegacao() {
    const menuItems = document.querySelectorAll('.menu-item');
    const sections = document.querySelectorAll('.app-section');

    menuItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetSectionId = item.getAttribute('data-target');
            
            menuItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            sections.forEach(sec => {
                sec.style.display = (sec.id === targetSectionId) ? 'block' : 'none';
            });
        });
    });
}

// 2. MODAL DE PRODUTOS
function abrirModalNovoProduto() {
    let modal = document.getElementById('modal-produto');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-produto';
        modal.style = "position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background-color: rgba(0,0,0,0.9); z-index: 9999; display: flex; justify-content: center; align-items: center;";
        modal.innerHTML = `
            <div style="background: #121212; padding: 30px; border-radius: 12px; width: 400px; border: 1px solid #333;">
                <h3 style="color: #fff; margin-bottom: 20px;">Adicionar Produto</h3>
                <input type="text" id="p-nome" placeholder="Nome" style="width: 100%; padding: 10px; margin-bottom: 10px; background: #1a1a1a; border: 1px solid #333; color: #fff;">
                <input type="text" id="p-preco" placeholder="Preço" style="width: 100%; padding: 10px; margin-bottom: 10px; background: #1a1a1a; border: 1px solid #333; color: #fff;">
                <input type="text" id="p-img" placeholder="Link da Imagem" style="width: 100%; padding: 10px; margin-bottom: 20px; background: #1a1a1a; border: 1px solid #333; color: #fff;">
                <button id="salvar-prod" style="width: 100%; padding: 12px; background: #00bcd4; border: none; color: #fff; font-weight: bold; cursor: pointer;">SALVAR</button>
                <button id="fechar-modal" style="width: 100%; padding: 12px; background: #333; border: none; color: #fff; margin-top: 10px; cursor: pointer;">CANCELAR</button>
            </div>
        `;
        document.body.appendChild(modal);
        
        document.getElementById('fechar-modal').onclick = () => modal.style.display = 'none';
        document.getElementById('salvar-prod').onclick = async () => {
            const nome = document.getElementById('p-nome').value;
            await addDoc(collection(db, "produtos"), { userId: usuarioAtualUid, nome, preco: document.getElementById('p-preco').value, imagem: document.getElementById('p-img').value });
            modal.style.display = 'none';
            carregarProdutos(usuarioAtualUid);
        };
    }
    modal.style.display = 'flex';
}

// 3. CARREGAR PRODUTOS
async function carregarProdutos(uid) {
    const container = document.getElementById('container-produtos-lista');
    const q = query(collection(db, "produtos"), where("userId", "==", uid));
    const snap = await getDocs(q);
    container.innerHTML = "";
    snap.forEach(doc => {
        const p = doc.data();
        container.innerHTML += `<div style="padding: 10px; border: 1px solid #222; margin-bottom: 5px;">${p.nome} - R$ ${p.preco}</div>`;
    });
}

// 4. INICIALIZAÇÃO
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = 'login.html'; return; }
    usuarioAtualUid = user.uid;
    
    ativarNavegacao();
    
    // Botão Adicionar Produto (Vinculado via DOM direto)
    setTimeout(() => {
        document.querySelector('.btn-primary')?.addEventListener('click', abrirModalNovoProduto);
    }, 500);

    // Botões de Ação Perfil/Logout
    document.getElementById('btn-logout')?.addEventListener('click', () => signOut(auth).then(() => window.location.href = 'login.html'));
    
    carregarProdutos(usuarioAtualUid);
});
