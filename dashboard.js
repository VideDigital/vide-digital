import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let usuarioAtualUid = null;

// Função que exibe os links
function exibirLinks(slug) {
    const statusMsg = document.getElementById('status-msg');
    if (!statusMsg) return;
    statusMsg.innerHTML = `
        <div style="padding: 15px; border: 1px solid #333; border-left: 4px solid #00bcd4;">
            <p><strong>Link da Vitrine (Cliente):</strong><br> videdigital.github.io/vide-digital/?loja=${slug}</p>
            <p><strong>Link do Painel (Adm):</strong><br> videdigital.github.io/vide-digital/dashboard.html?loja=${slug}</p>
        </div>
    `;
}

// Navegação
document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        document.querySelectorAll('.app-section').forEach(s => s.classList.remove('active'));
        document.getElementById(item.getAttribute('data-target')).classList.add('active');
    });
});

// Salvar Slug
document.getElementById('btn-salvar-slug').addEventListener('click', async () => {
    const slug = document.getElementById('slug-input').value;
    if (!slug) return alert("Digite um slug!");
    await updateDoc(doc(db, "usuarios", usuarioAtualUid), { urlLoja: slug });
    exibirLinks(slug); // Chama a função para aparecer na hora!
    alert("Salvo!");
});

// Auth
onAuthStateChanged(auth, async (user) => {
    if (!user) return window.location.href = 'login.html';
    usuarioAtualUid = user.uid;
    const snap = await getDoc(doc(db, "usuarios", user.uid));
    if (snap.exists()) {
        const data = snap.data();
        if (data.urlLoja) {
            document.getElementById('slug-input').value = data.urlLoja;
            exibirLinks(data.urlLoja); // Carrega os links ao entrar
        }
    }
});

document.getElementById('btn-logout').onclick = () => signOut(auth).then(() => window.location.href = 'login.html');
