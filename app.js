import { auth, db } from './firebase-init.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// 1. SOLICITAR CADASTRO (Cria a conta com status pendente)
document.getElementById('btn-cadastro').addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const senha = document.getElementById('senha').value;

    if (!email || !senha) {
        alert('Por favor, preencha todos os campos!');
        return;
    }

    try {
        // Cria o usuário no Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, senha);
        const user = userCredential.user;

        // Cria o registro dele no Firestore como PENDENTE
        await setDoc(doc(db, "usuarios", user.uid), {
            email: email,
            status: "pendente",
            nomeLoja: "",
            urlLoja: "",
            dataSolicitacao: new Date().toISOString()
        });

        alert('Solicitação de cadastro enviada! Aguarde a aprovação do administrador.');
    } catch (error) {
        alert('Erro ao solicitar cadastro: ' + error.message);
    }
});

// 2. FAZER LOGIN (Só entra se estiver aprovado)
document.getElementById('btn-login').addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const senha = document.getElementById('senha').value;

    if (!email || !senha) {
        alert('Por favor, preencha todos os campos!');
        return;
    }

    try {
        // Faz o login básico
        const userCredential = await signInWithEmailAndPassword(auth, email, senha);
        const user = userCredential.user;

        // Busca o documento dele no banco de dados para checar o status
        const userDoc = await getDoc(doc(db, "usuarios", user.uid));
        
        if (userDoc.exists()) {
            const userData = userDoc.data();
            
            if (userData.status === "aprovado") {
                alert('Login efetuado com sucesso! Redirecionando para o Dashboard...');
                // No futuro colocamos aqui: window.location.href = 'dashboard.html';
            } else {
                alert('Sua solicitação ainda está em análise. Aguarde a aprovação.');
            }
        } else {
            alert('Dados do usuário não encontrados no sistema.');
        }
    } catch (error) {
        alert('Erro ao fazer login: ' + error.message);
    }
});