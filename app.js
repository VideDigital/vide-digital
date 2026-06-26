import { auth, db } from './firebase-init.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const msgElement = document.getElementById('mensagem');

// Função para mudar a mensagem e a cor na interface
function exibirMensagem(texto, tipo) {
    msgElement.innerText = texto;
    if (tipo === 'sucesso') {
        msgElement.style.color = '#4caf50'; // Verde comercial
    } else if (tipo === 'erro') {
        msgElement.style.color = '#f44336'; // Vermelho
    } else if (tipo === 'aviso') {
        msgElement.style.color = '#ffeb3b'; // Amarelo
    }
}

// 1. SOLICITAR CADASTRO
document.getElementById('btn-cadastro').addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const senha = document.getElementById('senha').value;

    if (!email || !senha) {
        exibirMensagem('Por favor, preencha todos os campos!', 'erro');
        return;
    }

    exibirMensagem('Processando solicitação...', 'aviso');

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, senha);
        const user = userCredential.user;

        await setDoc(doc(db, "usuarios", user.uid), {
            email: email,
            status: "pendente",
            nomeLoja: "",
            urlLoja: "",
            dataSolicitacao: new Date().toISOString()
        });

        exibirMensagem('Solicitação enviada! Aguarde a aprovação.', 'sucesso');
    } catch (error) {
        exibirMensagem('Erro ao solicitar: ' + error.message, 'erro');
    }
});

// 2. FAZER LOGIN (Redirecionamento ativado de verdade!)
document.getElementById('btn-login').addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const senha = document.getElementById('senha').value;

    if (!email || !senha) {
        exibirMensagem('Por favor, preencha todos os campos!', 'erro');
        return;
    }

    exibirMensagem('Verificando credenciais...', 'aviso');

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, senha);
        const user = userCredential.user;

        const userDoc = await getDoc(doc(db, "usuarios", user.uid));
        
        if (userDoc.exists()) {
            const userData = userDoc.data();
            
            if (userData.status === "aprovado") {
                exibirMensagem('Login efetuado! Redirecionando...', 'sucesso');
                
                // Ativa a mudança de página de forma limpa após 1.5 segundos
                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 1500);

            } else {
                exibirMensagem('Sua solicitação ainda está em análise. Aguarde.', 'aviso');
            }
        } else {
            exibirMensagem('Dados do usuário não encontrados.', 'erro');
        }
    } catch (error) {
        exibirMensagem('Erro ao entrar: ' + error.message, 'erro');
    }
});
