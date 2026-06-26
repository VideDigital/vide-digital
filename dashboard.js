import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, updateDoc, collection, addDoc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let usuarioAtualUid = null;
const urlParams = new URLSearchParams(window.location.search);
const lojaParam = urlParams.get('loja');

// Navegação entre abas
document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        document.querySelectorAll('.app-section').forEach(s => s.classList.remove('active'));
        document.getElementById(item.getAttribute('data-target')).classList.add('active');
    });
});

// Carregar Dados e Proteger rota
onAuthStateChanged(auth, async (user) => {
    if (!user) return window.location.href = 'login.html';
    usuarioAtualUid = user.uid;

    const snap = await getDoc(doc(db, "usuarios", user.uid));
    if (snap.exists()) {
        const data = snap.data();
        if (data.urlLoja) {
            document.getElementById('slug-input').value = data.urlLoja;
            document.getElementById('sb-minhaloja').href = `https://videdigital.github.io/vide-digital/?loja=${data.urlLoja}`;
        }
    }
    carregarProdutos();
});

// Salvar Slug
document.getElementById('btn-salvar-slug').addEventListener('click', async () => {
    const slug = document.getElementById('slug-input').value.trim();
    await updateDoc(doc(db, "usuarios", usuarioAtualUid), { urlLoja: slug });
    alert("Salvo!");
    window.location.href = `dashboard.html?loja=${slug}`;
});

// Logout
document.getElementById('btn-logout').onclick = () => signOut(auth).then(() => window.location.href = 'login.html');
