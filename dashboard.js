import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const slugInput = document.getElementById('slug-input');
const statusMsg = document.getElementById('status-msg');
let usuarioAtualUid = null;

// FUNÇÃO AUXILIAR: Gera e exibe o bloco com os links direto na tela do Perfil
function exibirLinksGerados(slug) {
    statusMsg.innerHTML = `
        <div style="margin-top: 20px; padding: 15px; background-color: #161616; border: 1px solid #222; border-left: 4px solid #00bcd4; border-radius: 8px; text-align: left; box-sizing: border-box; width: 100%;">
            <p style="color: #4caf50; font-weight: bold; margin: 0 0 15px 0; font-size: 14px; display: flex; align-items: center; gap: 6px;">
                🎉 Loja configurada com sucesso!
            </p>
            
            <div style="margin-bottom: 12px;">
                <span style="font-size: 11px; color: #888; display: block; font-weight: bold; letter-spacing: 0.5px; margin-bottom: 4px;">🌐 LINK DA VITRINE (CLIENTES):</span>
                <a href="https://videdigital.github.io/vide-digital/?loja=${slug}" target="_blank" style="color: #00bcd4; font-size: 13px; text-decoration: none; word-break: break-all; font-weight: 500;">
                    videdigital.github.io/vide-digital/?loja=${slug}
                </a>
            </div>
            
            <div>
                <span style="font-size: 11px; color: #888; display: block; font-weight: bold; letter-spacing: 0.5px; margin-bottom: 4px;">🔑 LINK ESPECÍFICO DE ADM (GERENCIAMENTO):</span>
                <a href="https://videdigital.github.io/vide-digital/dashboard.html?loja=${slug}" target="_blank" style="color: #ff9800; font-size: 13px; text-decoration: none; word-break: break-all; font-weight: 500;">
                    videdigital.github.io/vide-digital/dashboard.html?loja=${slug}
                </a>
            </div>
        </div>
    `;
}

// 1. PROTEGER A PÁGINA: Só deixa ficar aqui se estiver logado de verdade
onAuthStateChanged(auth, async (user) => {
    if (user) {
        usuarioAtualUid = user.uid;
        carregarDadosUsuario(user.uid);
    } else {
        window.location.href = 'login.html';
    }
});

// 2. BUSCAR O SLUG ATUAL NO FIRESTORE
async function carregarDadosUsuario(uid) {
    try {
        const userDoc = await getDoc(doc(db, "usuarios", uid));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            // Se já tiver uma URL cadastrada, preenche o campo e renderiza os links direto
            if (userData.urlLoja) {
                slugInput.value = userData.urlLoja;
                exibirLinksGerados(userData.urlLoja);
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
        statusMsg.innerHTML = "<span style='color: #f44336; font-size: 14px;'>Por favor, digite um link válido!</span>";
        return;
    }

    statusMsg.innerHTML = "<span style='color: #ffeb3b; font-size: 14px;'>Salvando alteração na nuvem...</span>";

    try {
        // Atualiza especificamente o campo urlLoja no Firestore
        await updateDoc(doc(db, "usuarios", usuarioAtualUid), {
            urlLoja: novoSlug
        });

        // Atualiza a interface com os novos links gerados em tempo real
        exibirLinksGerados(novoSlug);

    } catch (error) {
        statusMsg.innerHTML = `<span style='color: #f44336; font-size: 14px;'>Erro ao salvar: ${error.message}</span>`;
    }
});

// 4. COPIAR O LINK PARA A ÁREA DE TRANSFERÊNCIA (Botão Copiar Original)
document.getElementById('btn-copiar-url').addEventListener('click', () => {
    const linkCompleto = `videdigital.github.io/vide-digital/?loja=${slugInput.value}`;
    navigator.clipboard.writeText(linkCompleto);
    
    // Alerta temporário por cima do bloco de links para avisar que copiou
    const avisoCopiado = document.createElement('div');
    avisoCopiado.innerText = "Link de cliente copiado! 📋";
    avisoCopiado.style.color = "#00bcd4";
    avisoCopiado.style.fontSize = "13px";
    avisoCopiado.style.marginTop = "8px";
    statusMsg.appendChild(avisoCopiado);
    
    setTimeout(() => avisoCopiado.remove(), 2500);
});

// 5. BOTÃO DE LOGOUT (SAIR)
document.getElementById('btn-logout').addEventListener('click', () => {
    signOut(auth).then(() => {
        window.location.href = 'login.html';
    });
});
