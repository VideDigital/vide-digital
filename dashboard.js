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

// 3. SALVAR O NOVO SLUG (Botão Aplicar) + ENVIAR TEXTO DE CONCLUÍDO PRO WHATSAPP
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

        // Altera o texto na tela avisando que a automação está abrindo o WhatsApp
        statusMsg.innerHTML = "Link atualizado com sucesso! 🎉<br><small style='color: #25d366; font-size: 12px;'>Abrindo WhatsApp com a mensagem de lançamento da loja...</small>";
        statusMsg.style.color = "#4caf50";

        // MENSAGEM COPIÁVEL DE ALTO IMPACTO PARA O DONO DA LOJA USAR
        const mensagemPronta = `🚀 *Sua vitrine virtual está concluída!*\n\nOlá! É com muita alegria que anuncio que a minha nova loja virtual na *Vide Digital* já está oficialmente no ar. Agora ficou muito mais fácil e rápido conferir todos os produtos e fazer seus pedidos diretamente por lá! 🛍️\n\n👉 *Acesse e confira todas as novidades por aqui:* \nhttps://videdigital.github.io/vide-digital/?loja=${novoSlug}\n\nBoas compras! Aguardo o seu pedido! 🎉`;

        // Transforma o texto em um link válido para o WhatsApp
        const urlWhatsApp = `https://api.whatsapp.com/send?text=${encodeURIComponent(mensagemPronta)}`;

        // Aguarda 1.5 segundos para o usuário ler o sucesso e abre o WhatsApp automaticamente
        setTimeout(() => {
            window.open(urlWhatsApp, '_blank');
        }, 1500);

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
