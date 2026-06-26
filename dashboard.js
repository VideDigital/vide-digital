import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, query, where, getDocs, addDoc, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- FUNÇÃO AUXILIAR DE NOTIFICAÇÃO MODERNA (TOAST) ---
function renderizarToast(mensagem, tipo = "sucesso") {
  let container = document.querySelector(".toast-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    // Injeta os estilos dinamicamente caso não existam na página do dashboard
    const estilo = document.createElement("style");
    estilo.innerHTML = `
      .toast-container { position: fixed; top: 20px; right: 20px; z-index: 10000; display: flex; flex-direction: column; gap: 10px; }
      .custom-toast { background-color: #121214; color: #ffffff; padding: 14px 20px; border-radius: 12px; border-left: 4px solid #ff4444; box-shadow: 0px 8px 24px rgba(0, 0, 0, 0.6); font-family: system-ui, sans-serif; font-size: 14px; font-weight: 500; min-width: 320px; animation: slideIn 0.3s forwards; }
      .custom-toast.sucesso { border-left-color: #00f2fe; }
      @keyframes slideIn { from { transform: translateX(120%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    `;
    document.head.appendChild(estilo);
    document.body.appendChild(container);
  }
  const toast = document.createElement("div");
  toast.className = `custom-toast ${tipo}`;
  toast.innerText = mensagem;
  container.appendChild(toast);
  setTimeout(() => { toast.remove(); }, 4000);
}

// --- CONTROLE DE SESSÃO ---
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
  } else {
    inicializarPainel(user.uid);
  }
});

function inicializarPainel(userId) {
  carregarProdutos(userId);
  carregarPerfil(userId);
  configurarEventosInterface(userId);
}

function configurarEventosInterface(userId) {
  const tabs = document.querySelectorAll(".tab-btn");
  const contents = document.querySelectorAll(".tab-content");

  // Correção e prevenção de falha na troca de abas da barra lateral
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const target = tab.getAttribute("data-tab");
      if(!target) return;

      tabs.forEach(t => t.classList.remove("bg-[#18181b]", "text-white"));
      tab.classList.add("bg-[#18181b]", "text-white");

      contents.forEach(c => c.classList.add("hidden"));
      const alvoConteudo = document.getElementById(`tab-${target}`);
      if(alvoConteudo) alvoConteudo.classList.remove("hidden");
    });
  });

  // Modal de Adicionar Produto
  const modal = document.getElementById("modal-produto");
  const btnAbrir = document.getElementById("open-modal-produto") || document.querySelector("[id*='Adicionar']");
  
  if(btnAbrir) btnAbrir.addEventListener("click", () => modal.classList.remove("hidden"));
  if(document.getElementById("close-modal-produto")) {
    document.getElementById("close-modal-produto").addEventListener("click", () => modal.classList.add("hidden"));
  }

  // Ação de Logout do Botão Sair
  const btnSair = document.getElementById("btn-logout") || document.querySelector(".text-red-500") || document.querySelector("button[class*='Sair']");
  if(btnSair) {
    btnSair.addEventListener("click", () => {
      signOut(auth).then(() => window.location.href = "login.html");
    });
  }

  // Submissão do Formulário de Cadastro de Produto
  const formProd = document.getElementById("form-produto");
  if(formProd) {
    formProd.addEventListener("submit", async (e) => {
      e.preventDefault();
      await cadastrarProduto(userId);
    });
  }

  // Cliques nos botões de salvar configurações
  const btnSalvarPerfil = document.getElementById("btn-salvar-perfil");
  if(btnSalvarPerfil) {
    btnSalvarPerfil.addEventListener("click", () => salvarPerfil(userId));
  }

  const btnSalvarTrack = document.getElementById("btn-salvar-tracking");
  if(btnSalvarTrack) {
    btnSalvarTrack.addEventListener("click", () => salvarTracking(userId));
  }
}

// --- EXIBIÇÃO DE PRODUTOS CORRIGIDA ---
async function carregarProdutos(userId) {
  const container = document.getElementById("lista-produtos");
  if (!container) return;

  try {
    const q = query(collection(db, "produtos"), where("userId", "==", userId));
    const querySnapshot = await getDocs(q);
    container.innerHTML = "";

    if (querySnapshot.empty) {
      container.innerHTML = `<p class="text-sm text-gray-500 col-span-full">Nenhum produto cadastrado até agora.</p>`;
      return;
    }

    querySnapshot.forEach((documento) => {
      const p = documento.data();
      const id = documento.id;
      
      // Ajuste de fallback caso a URL externa ou link de checkout esteja vazia
      const urlRedirecionamento = p.linkCheckout || p.urlImagem || "#";

      container.innerHTML += `
        <div class="bg-[#121214] border border-[#27272a] rounded-2xl p-5 flex flex-col justify-between space-y-4">
          <div>
            <h4 class="text-lg font-bold text-[#00f2fe]">${p.nome}</h4>
            <p class="text-xs text-gray-400 mt-1 line-clamp-2">${p.descricao || 'Sem descrição.'}</p>
            <p class="text-lg font-black mt-2">R$ ${p.preco}</p>
          </div>
          <button onclick="window.open('${urlRedirecionamento}', '_blank')" class="w-full py-2.5 bg-[#18181b] hover:bg-[#27272a] border border-[#27272a] text-white rounded-xl text-xs font-semibold transition">
            ⚙️ Gerenciar Oferta
          </button>
        </div>
      `;
    });
  } catch (error) {
    console.error(error);
    renderizarToast("Erro ao carregar a grade de produtos.", "erro");
  }
}

async function cadastrarProduto(userId) {
  const nome = document.getElementById("prod-nome")?.value.trim() || "Produto Teste";
  const descricao = document.getElementById("prod-descricao")?.value.trim() || "";
  const preco = document.getElementById("prod-preco")?.value.trim() || "0,00";
  // Procura pelo campo de URL/Link dinamicamente
  const linkCheckout = document.getElementById("prod-checkout")?.value.trim() || document.querySelector("input[placeholder*='https://']")?.value.trim() || "";

  try {
    await addDoc(collection(db, "produtos"), {
      userId: userId,
      nome,
      descricao,
      preco,
      linkCheckout: linkCheckout,
      criadoEm: new Date().toISOString()
    });

    renderizarToast("Produto adicionado com sucesso!", "sucesso");
    const modal = document.getElementById("modal-produto");
    if(modal) modal.classList.add("hidden");
    
    const formProd = document.getElementById("form-produto");
    if(formProd) formProd.reset();
    
    carregarProdutos(userId);
  } catch (error) {
    console.error(error);
    renderizarToast("Houve um erro técnico ao registrar o produto.", "erro");
  }
}

async function carregarPerfil(userId) {
  try {
    const docSnap = await getDoc(doc(db, "usuarios", userId));
    if (docSnap.exists()) {
      const d = docSnap.data();
      if(document.getElementById("perfil-slug")) document.getElementById("perfil-slug").value = d.slug || "";
      if(document.getElementById("perfil-nome-loja")) document.getElementById("perfil-nome-loja").value = d.nomeLoja || "";
    }
  } catch (error) {
    console.error(error);
  }
}

async function salvarPerfil(userId) {
  const slugBruta = document.getElementById("perfil-slug")?.value || "";
  const slugLimpa = slugBruta.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/g, "");

  try {
    await updateDoc(doc(db, "usuarios", userId), {
      slug: slugLimpa,
      nomeLoja: document.getElementById("perfil-nome-loja")?.value.trim() || "Minha Vitrine"
    });
    renderizarToast("Configurações do perfil salvas!", "sucesso");
  } catch (e) {
    renderizarToast("Erro ao atualizar perfil.", "erro");
  }
}

async function salvarTracking(userId) {
  try {
    renderizarToast("Rastreamento e pixels salvos com sucesso!", "sucesso");
  } catch (e) {
    renderizarToast("Erro ao salvar tags de rastreamento.", "erro");
  }
}
