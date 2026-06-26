import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    collection, query, where, onSnapshot, addDoc, 
    doc, getDoc, updateDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- 1. CONFIGURAÇÃO E ESTADO ---
let currentUser = null;

// Elementos da UI em cache para performance
const UI = {
    btns: document.querySelectorAll(".tab-btn"),
    tabs: document.querySelectorAll(".tab-content"),
    modal: document.getElementById("modal-produto"),
    formProd: document.getElementById("form-produto"),
    listaProdutos: document.getElementById("lista-produtos")
};

// --- 2. UTILITÁRIOS ---
function renderizarToast(mensagem, tipo = "sucesso") {
    const toast = document.createElement("div");
    toast.className = `fixed top-5 right-5 z-[9999] px-6 py-4 rounded-xl shadow-2xl border-l-4 flex items-center gap-3 bg-[#121214] ${tipo === 'sucesso' ? 'border-[#00f2fe]' : 'border-red-500'}`;
    toast.innerHTML = `<span>${tipo === 'sucesso' ? '✅' : '⚠️'}</span><p class="text-sm font-medium text-white">${mensagem}</p>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

function setBtnLoading(btn, isLoading, originalText) {
    if (isLoading) {
        btn.disabled = true;
        btn.innerHTML = `<span class="animate-pulse">Processando...</span>`;
    } else {
        btn.disabled = false;
        btn.innerText = originalText;
    }
}

// --- 3. GESTÃO DE PRODUTOS (REACTIVA) ---
function initProdutosTab(userId) {
    const q = query(collection(db, "produtos"), where("userId", "==", userId));
    
    // onSnapshot garante atualização em tempo real
    onSnapshot(q, (snapshot) => {
        UI.listaProdutos.innerHTML = "";
        if (snapshot.empty) {
            UI.listaProdutos.innerHTML = `<div class="col-span-full py-10 text-center text-gray-500">Nenhum produto cadastrado.</div>`;
            return;
        }

        snapshot.forEach((doc) => {
            const p = doc.data();
            UI.listaProdutos.innerHTML += `
                <div class="bg-[#121214] border border-[#27272a] p-6 rounded-2xl hover:border-[#27272a]/80 transition-all flex flex-col justify-between">
                    <div>
                        <h4 class="text-lg font-bold text-white">${p.nome}</h4>
                        <p class="text-xs text-gray-400 mt-2 line-clamp-2">${p.descricao}</p>
                        <p class="text-xl font-black mt-4 text-[#00f2fe]">R$ ${p.preco}</p>
                    </div>
                    <button onclick="window.open('${p.linkCheckout}', '_blank')" class="mt-6 w-full py-2.5 bg-[#18181b] hover:bg-[#27272a] text-white rounded-xl text-sm font-semibold transition">
                        Gerenciar Oferta
                    </button>
                </div>
            `;
        });
    });
}

// --- 4. GESTÃO DE PERFIL E TRACKING ---
async function carregarPerfil(userId) {
    try {
        const snap = await getDoc(doc(db, "usuarios", userId));
        if (snap.exists()) {
            const d = snap.data();
            // Preenche campos de perfil
            if(document.getElementById("perfil-slug")) document.getElementById("perfil-slug").value = d.slug || "";
            if(document.getElementById("perfil-nome-loja")) document.getElementById("perfil-nome-loja").value = d.nomeLoja || "";
            // Preenche campos de Tracking
            if(document.getElementById("pixel-meta")) document.getElementById("pixel-meta").value = d.pixelMeta || "";
            if(document.getElementById("pixel-google")) document.getElementById("pixel-google").value = d.pixelGoogle || "";
            if(document.getElementById("dominio-custom")) document.getElementById("dominio-custom").value = d.dominioCustom || "";
        }
    } catch (e) { console.error("Erro ao carregar perfil:", e); }
}

async function salvarConfiguracoes(userId, tipo) {
    try {
        if (tipo === 'perfil') {
            await updateDoc(doc(db, "usuarios", userId), {
                slug: document.getElementById("perfil-slug").value,
                nomeLoja: document.getElementById("perfil-nome-loja").value
            });
        } else {
            await updateDoc(doc(db, "usuarios", userId), {
                pixelMeta: document.getElementById("pixel-meta").value,
                pixelGoogle: document.getElementById("pixel-google").value,
                dominioCustom: document.getElementById("dominio-custom").value
            });
        }
        renderizarToast("Configurações salvas com sucesso!");
    } catch (e) {
        renderizarToast("Erro ao salvar.", "erro");
    }
}

// --- 5. INICIALIZAÇÃO E EVENTOS ---
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "login.html";
    } else {
        currentUser = user.uid;
        initProdutosTab(currentUser);
        carregarPerfil(currentUser);
        setupEventListeners();
    }
});

function setupEventListeners() {
    // Troca de Abas
    UI.btns.forEach(btn => {
        btn.addEventListener("click", () => {
            UI.btns.forEach(b => b.classList.remove("bg-[#18181b]", "text-white"));
            btn.classList.add("bg-[#18181b]", "text-white");
            UI.tabs.forEach(t => t.classList.add("hidden"));
            document.getElementById(`tab-${btn.dataset.tab}`).classList.remove("hidden");
        });
    });

    // Modais
    document.getElementById("open-modal-produto")?.addEventListener("click", () => UI.modal.classList.remove("hidden"));
    document.getElementById("close-modal-produto")?.addEventListener("click", () => UI.modal.classList.add("hidden"));

    // Form Produto
    UI.formProd.addEventListener("submit", async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        setBtnLoading(btn, true);
        
        try {
            await addDoc(collection(db, "produtos"), {
                userId: currentUser,
                nome: document.getElementById("prod-nome").value,
                descricao: document.getElementById("prod-descricao").value,
                preco: document.getElementById("prod-preco").value,
                linkCheckout: document.getElementById("prod-checkout").value,
                criadoEm: new Date().toISOString()
            });
            UI.modal.classList.add("hidden");
            UI.formProd.reset();
            renderizarToast("Produto cadastrado!");
        } catch(e) { renderizarToast("Erro ao cadastrar", "erro"); }
        finally { setBtnLoading(btn, false, "Salvar Produto"); }
    });

    // Botões de Salvar
    document.getElementById("btn-salvar-perfil")?.addEventListener("click", () => salvarConfiguracoes(currentUser, 'perfil'));
    document.getElementById("btn-salvar-tracking")?.addEventListener("click", () => salvarConfiguracoes(currentUser, 'tracking'));

    // Logout
    document.getElementById("btn-logout")?.addEventListener("click", () => signOut(auth));
}
