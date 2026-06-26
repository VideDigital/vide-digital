import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let usuarioAtualUid = null;

// =========================================
// 1. RENDERIZAR O BOX VERDE BONITO
// =========================================
function exibirLinks(slug) {
    const statusMsg = document.getElementById('status-msg');
    if (!statusMsg) return;
    
    // Caixinha verde fiel ao seu print
    statusMsg.innerHTML = `
    <div style="padding: 15px; background-color: #161616; border: 1px solid #222; border-left: 4px solid #00bcd4; border-radius: 8px; text-align: left;">
        <p style="color: #4caf50; font-weight: bold; margin: 0 0 15px 0; font-size: 14px;">🎉 Loja configurada com sucesso!</p>
        
        <div style="margin-bottom: 12px;">
            <span style="font-size: 11px; color: #888; display: block; font-weight: bold; margin-bottom: 4px;">🌐 LINK DA VITRINE (CLIENTES):</span>
            <a href="https://videdigital.github.io/vide-digital/?loja=${slug}" target="_blank" style="color: #00bcd4; font-size: 13px; text-decoration: none; font-weight: 500;">
                videdigital.github.io/vide-digital/?loja=${slug}
            </a>
        </div>
        
        <div>
            <span style="font-size: 11px; color: #888; display: block; font-weight: bold; margin-bottom: 4px;">🔑 LINK DO PAINEL (ADM):</span>
            <a href="https://videdigital.github.io/vide-digital/dashboard.html?loja=${slug}" target="_blank" style="color: #ff9800; font-size: 13px; text-decoration: none; font-weight: 500;">
                videdigital.github.io/vide-digital/dashboard.html?loja=${slug}
            </a>
        </div>
    </div>`;

    // Atualiza botão lateral "Minha Loja"
    const btnMinhaLoja = document.getElementById('sb-minhaloja');
    if (btnMinhaLoja) btnMinhaLoja.setAttribute('href', `https://videdigital.github.io/vide-digital/?loja=${slug}`);
}

// =========================================
// 2. NAVEGAÇÃO ENTRE AS ABAS
// =========================================
document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        
        document.querySelectorAll('.app-section').forEach(s => s.classList.remove('active'));
        const targetId = item.getAttribute('data-target');
        document.getElementById(targetId).classList.add('active');
    });
});

// =========================================
// 3. SALVAR E COPIAR SLUG
// =========================================
document.getElementById('btn-salvar-slug')?.addEventListener('click', async () => {
    const slug = document.getElementById('slug-input').value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
    if (!slug) return alert("Por favor, digite um link válido.");
    
    document.getElementById('slug-input').value = slug;

    try {
        await updateDoc(doc(db, "usuarios", usuarioAtualUid), { urlLoja: slug });
        exibirLinks(slug);
    } catch (err) {
        alert("Erro ao salvar: " + err.message);
    }
});

document.getElementById('btn-copiar-url')?.addEventListener('click', () => {
    const slug = document.getElementById('slug-input').value;
    if (!slug) return alert("Configure seu link primeiro!");
    navigator.clipboard.writeText(`https://videdigital.github.io/vide-digital/?loja=${slug}`);
    alert("Link copiado para a área de transferência!");
});

// =========================================
// 4. AUTENTICAÇÃO INICIAL E LOGOUT
// =========================================
onAuthStateChanged(auth, async (user) => {
    if (!user) return window.location.href = 'login.html';
    usuarioAtualUid = user.uid;
    
    // Busca dados no Banco e preenche os campos
    const snap = await getDoc(doc(db, "usuarios", user.uid));
    if (snap.exists()) {
        const data = snap.data();
        if (data.urlLoja) {
            document.getElementById('slug-input').value = data.urlLoja;
            exibirLinks(data.urlLoja);
        }
        if (data.pixelFacebook) document.getElementById('input-pixel-facebook').value = data.pixelFacebook;
        if (data.tagGoogle) document.getElementById('input-tag-google').value = data.tagGoogle;
    }
});

// Sair
document.getElementById('btn-logout').onclick = () => signOut(auth).then(() => window.location.href = 'login.html');

// =========================================
// 5. SALVAR PIXELS E TAGS
// =========================================
document.getElementById('btn-salvar-pixels')?.addEventListener('click', async () => {
    const fb = document.getElementById('input-pixel-facebook').value.trim();
    const gg = document.getElementById('input-tag-google').value.trim();
    await updateDoc(doc(db, "usuarios", usuarioAtualUid), { pixelFacebook: fb, tagGoogle: gg });
    alert("Configurações salvas com sucesso!");
});
