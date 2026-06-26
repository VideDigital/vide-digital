import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const slugInput = document.getElementById('slug-input');
const statusMsg = document.getElementById('status-msg');
let usuarioAtualUid = null;

// 1. PROTEGER A PÁGINA: Só deixa ficar aqui se estiver logado de verdade
onAuthStateChanged(auth, async (user) => {
    if (user) {
        usuarioAtualUid = user.uid;
        carregarDadosUsuario(user.uid);
    } else {
        // Se não estiver logado, chuta de volta para a nova página de login
        window.location.href = 'login.html';
    }
});

// 2. BUSCAR O SLUG ATUAL NO FIRESTORE
async function carregarDadosUsuario(uid) {
    try {
        const userDoc = await getDoc(doc(db, "usuarios", uid));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            // Coloca o valor de urlLoja que está salvo no banco dentro do input
            if (userData.urlLoja) {
                slugInput.value = userData.urlLoja;
            }
        }
    } catch (error) {
        console.error("Erro ao carregar dados:", error);
    }
}

// 3. SALVAR O NOVO SLUG (Botão Aplicar)
document.getElementById('btn-salvar-slug').addEventListener('click', async () => {
    if (!usuarioAtualUid) return;

    // Remove espaços e caracteres especiais para o link não quebrar
    const novoSlug = slugInput.value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
    slugInput.value = novoSlug;

    if (!novoSlug) {
        statusMsg.innerText = "Por favor, digite um link válido!";
        statusMsg.style.color = "#f44336";
        return;
    }

    statusMsg.innerText = "Salvando alteração...";
    statusMsg.style.color = "#ffeb3b";

    try {
        // Atualiza especificamente o campo urlLoja no Firestore
        await updateDoc(doc(db, "usuarios", usuarioAtualUid), {
            urlLoja: novoSlug
        });

        statusMsg.innerText = "Link atualizado com sucesso! 🎉";
        statusMsg.style.color = "#4caf50";
    } catch (error) {
        statusMsg.innerText = "Erro ao salvar: " + error.message;
        statusMsg.style.color = "#f44336";
    }
});

// 4. COPIAR O LINK PARA A ÁREA DE TRANSFERÊNCIA
document.getElementById('btn-copiar-url').addEventListener('click', () => {
    const linkCompleto = `videdigital.github.io/vide-digital/?loja=${slugInput.value}`;
    navigator.clipboard.writeText(linkCompleto);
    
    statusMsg.innerText = "Link completo copiado para a área de transferência! 📋";
    statusMsg.style.color = "#00bcd4";
});

// 5. BOTÃO DE LOGOUT (SAIR)
document.getElementById('btn-logout').addEventListener('click', () => {
    signOut(auth).then(() => {
        // Quando deslogar, vai direto para a tela de login correta
        window.location.href = 'login.html';
    });
});
