import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, query, where, getDocs, addDoc, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- VERIFICAÇÃO DE SEGURANÇA ATIVA ---
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

// --- FLUXO DE ABAS ---
function configurarEventosInterface(userId) {
  const tabs = document.querySelectorAll(".tab-btn");
  const contents = document.querySelectorAll(".tab-content");

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const target = tab.getAttribute("data-tab");

      tabs.forEach(t => t.classList.remove("bg-[#18181b]", "text-white"));
      tabs.forEach(t => t.classList.add("text-gray-400"));
      tab.classList.add("bg-[#18181b]", "text-white");

      contents.forEach(c => c.classList.add("hidden"));
      document.getElementById(`tab-${target}`).classList.remove("hidden");
    });
  });

  // CONTROLE DO MODAL DE PRODUTOS
  const modal = document.getElementById("modal-produto");
  document.getElementById("open-modal-produto").addEventListener("click", () => modal.classList.remove("hidden"));
  document.getElementById("close-modal-produto").addEventListener("click", () => modal.classList.add("hidden"));

  // LOGOUT
  document.getElementById("btn-logout").addEventListener("click", () => {
    signOut(auth).then(() => window.location.href = "login.html");
  });

  // LISTENER DO CADASTRO DE PRODUTO
  document.getElementById("form-produto").addEventListener("submit", async (e) => {
    e.preventDefault();
    await cadastrarProduto(userId);
  });

  // LISTENER DO SALVAMENTO DE TRACKING
  document.getElementById("btn-salvar-tracking").addEventListener("click", async () => {
    await salvarTracking(userId);
  });

  // LISTENER DO SALVAMENTO DE PERFIL
  document.getElementById("btn-salvar-perfil").addEventListener("click", async () => {
    await salvarPerfil(userId);
  });
}

// --- OPERAÇÕES DO FIRESTORE (TOTALMENTE MULTI-TENANT) ---

async function carregarProdutos(userId) {
  const container = document.getElementById("lista-produtos");
  if (!container) return;

  container.innerHTML = `<p class="text-sm text-gray-500 animate-pulse">Buscando seus produtos...</p>`;

  try {
    const q = query(collection(db, "produtos"), where("userId", "==", userId));
    const querySnapshot = await getDocs(q);
    container.innerHTML = "";

    if (querySnapshot.empty) {
      container.innerHTML = `<p class="text-sm text-gray-500 col-span-full">Nenhum produto cadastrado por você ainda.</p>`;
      return;
    }

    querySnapshot.forEach((documento) => {
      const p = documento.data();
      const id = documento.id;

      container.innerHTML += `
        <div class="bg-[#121214] border border-[#27272a] rounded-2xl p-5 flex flex-col justify-between space-y-4">
          <div>
            <h4 class="text-lg font-bold text-[#00f2fe]">${p.nome}</h4>
            <p class="text-xs text-gray-400 mt-1 line-clamp-3">${p.descricao || 'Sem descrição inserida.'}</p>
            <p class="text-lg font-black mt-2">R$ ${p.preco}</p>
          </div>
          <button onclick="window.open('${p.linkCheckout}', '_blank')" class="w-full py-2.5 bg-[#18181b] hover:bg-[#27272a] border border-[#27272a] text-white rounded-xl text-xs font-semibold transition">
            ⚙️ Gerenciar Oferta
          </button>
        </div>
      `;
    });
  } catch (error) {
    console.error(error);
    container.innerHTML = `<p class="text-sm text-red-400 col-span-full">Erro ao processar catálogo.</p>`;
  }
}

async function cadastrarProduto(userId) {
  const nome = document.getElementById("prod-nome").value.trim();
  const descricao = document.getElementById("prod-descricao").value.trim();
  const preco = document.getElementById("prod-preco").value.trim();
  const linkCheckout = document.getElementById("prod-checkout").value.trim();

  try {
    await addDoc(collection(db, "produtos"), {
      userId: userId,
      nome,
      descricao,
      preco,
      linkCheckout,
      criadoEm: new Date().toISOString()
    });

    alert("Produto adicionado com sucesso!");
    document.getElementById("modal-produto").classList.add("hidden");
    document.getElementById("form-produto").reset();
    carregarProdutos(userId);
  } catch (error) {
    console.error(error);
    alert("Houve um erro salvando a oferta.");
  }
}

async function carregarPerfil(userId) {
  try {
    const docSnap = await getDoc(doc(db, "usuarios", userId));
    if (docSnap.exists()) {
      const d = docSnap.data();
      
      if(document.getElementById("perfil-slug")) document.getElementById("perfil-slug").value = d.slug || "";
      if(document.getElementById("perfil-nome-loja")) document.getElementById("perfil-nome-loja").value = d.nomeLoja || "";
      if(document.getElementById("perfil-hero")) document.getElementById("perfil-hero").value = d.hero || "";
      if(document.getElementById("perfil-subtitle")) document.getElementById("perfil-subtitle").value = d.subtitle || "";
      
      if(document.getElementById("social-whatsapp")) document.getElementById("social-whatsapp").value = d.whatsapp || "";
      if(document.getElementById("social-instagram")) document.getElementById("social-instagram").value = d.instagram || "";
      if(document.getElementById("social-tiktok")) document.getElementById("social-tiktok").value = d.tiktok || "";
      if(document.getElementById("social-youtube")) document.getElementById("social-youtube").value = d.youtube || "";

      if(document.getElementById("pixel-meta")) document.getElementById("pixel-meta").value = d.pixelFacebook || "";
      if(document.getElementById("pixel-google")) document.getElementById("pixel-google").value = d.googleAnalytics || "";
      if(document.getElementById("dominio-custom")) document.getElementById("dominio-custom").value = d.dominioPersonalizado || "";

      if(document.getElementById("cor-fundo")) document.getElementById("cor-fundo").value = d.corFundo || "#09090b";
      if(document.getElementById("cor-destaque")) document.getElementById("cor-destaque").value = d.corDestaque || "#00f2fe";
      if(document.getElementById("cor-cards")) document.getElementById("cor-cards").value = d.corCards || "#121214";
      if(document.getElementById("cor-texto")) document.getElementById("cor-texto").value = d.corTextoLoja || "#ffffff";
    }
  } catch (error) {
    console.error("Erro carregando configurações:", error);
  }
}

async function salvarPerfil(userId) {
  const slugBruta = document.getElementById("perfil-slug").value;
  const slugLimpa = slugBruta.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/g, "");

  const dadosAtualizados = {
    slug: slugLimpa,
    nomeLoja: document.getElementById("perfil-nome-loja").value.trim(),
    hero: document.getElementById("perfil-hero").value.trim(),
    subtitle: document.getElementById("perfil-subtitle").value.trim(),
    whatsapp: document.getElementById("social-whatsapp").value.trim(),
    instagram: document.getElementById("social-instagram").value.trim(),
    tiktok: document.getElementById("social-tiktok").value.trim(),
    youtube: document.getElementById("social-youtube").value.trim(),
    corFundo: document.getElementById("cor-fundo").value,
    corDestaque: document.getElementById("cor-destaque").value,
    corCards: document.getElementById("cor-cards").value,
    corTextoLoja: document.getElementById("cor-texto").value
  };

  try {
    await updateDoc(doc(db, "usuarios", userId), dadosAtualizados);
    alert("Perfil e personalizações salvas com sucesso!");
    document.getElementById("perfil-slug").value = slugLimpa;
  } catch (error) {
    console.error(error);
    alert("Erro ao gravar dados de estilização.");
  }
}

async function salvarTracking(userId) {
  try {
    await updateDoc(doc(db, "usuarios", userId), {
      pixelFacebook: document.getElementById("pixel-meta").value.trim(),
      googleAnalytics: document.getElementById("pixel-google").value.trim(),
      dominioPersonalizado: document.getElementById("dominio-custom").value.trim().toLowerCase()
    });
    alert("Scripts de conversão e domínio salvos!");
  } catch (error) {
    console.error(error);
    alert("Falha ao salvar rastreamento.");
  }
}
