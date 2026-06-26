import { auth, db } from './firebase-init.js';
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Selecionando os elementos da tela (identificados pelo seu layout)
const emailInput = document.querySelector('input[type="email"]');
const senhaInput = document.querySelector('input[type="password"]');

// Encontra os botões com base no texto deles dentro da tela
const botoes = document.querySelectorAll('button, div, input[type="button"]');
let btnEntrar = null;
let btnSolicitar = null;

botoes.forEach(btn => {
    if (btn.innerText?.includes("Entrar no Dashboard")) btnEntrar = btn;
    if (btn.innerText?.includes("Solicitar Cadastro")) btnSolicitar = btn;
});

// Criar ou selecionar o campo de mensagem de erro na parte inferior do card
let errorDiv = document.getElementById('mensagem-erro');
if (!errorDiv) {
    errorDiv = document.createElement('div');
    errorDiv.id = 'mensagem-erro';
    errorDiv.style.color = '#f44336';
    errorDiv.style.fontSize = '14px';
    errorDiv.style.marginTop = '15px';
    errorDiv.style.textAlign = 'center';
    errorDiv.style.fontWeight = '500';
    // Insere o bloco de erro logo abaixo do último botão do card
    btnSolicitar?.parentNode?.appendChild(errorDiv);
}

// LÓGICA DE LOGIN COM ERROS TRADUZIDOS
if (btnEntrar) {
    btnEntrar.style.cursor = 'pointer';
    btnEntrar.addEventListener('click', async () => {
        const email = emailInput.value.trim();
        const senha = senhaInput.value.trim();

        if (!email || !senha) {
            errorDiv.innerText = "Preencha todos os campos para entrar!";
            errorDiv.style.color = "#ffeb3b";
            return;
        }

        errorDiv.innerText = "Verificando credenciais...";
        errorDiv.style.color = "#ffeb3b";

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, senha);
            const user = userCredential.user;

            // Verificar se está aprovado no Firestore
            const userDoc = await getDoc(doc(db, "usuarios", user.uid));
            
            if (userDoc.exists()) {
                const userData = userDoc.data();
                if (userData.status === "aprovado") {
                    errorDiv.innerText = "Acesso concedido! Entrando...";
                    errorDiv.style.color = "#4caf50";
                    setTimeout(() => {
                        window.location.href = 'dashboard.html';
                    }, 1000);
                } else {
                    errorDiv.innerText = "Seu cadastro ainda está pendente de aprovação!";
                    errorDiv.style.color = "#ff9800";
                }
            } else {
                errorDiv.innerText = "Conta não localizada na base de dados.";
                errorDiv.style.color = "#f44336";
            }

        } catch (error) {
            console.error("Erro original do Firebase:", error.code);
            
            // TRADUTOR DE ERROS DO FIREBASE (Mágica acontece aqui)
            switch (error.code) {
                case 'auth/invalid-credential':
                    errorDiv.innerText = "E-mail não cadastrado ou senha incorreta!";
                    break;
                case 'auth/user-not-found':
                    errorDiv.innerText = "Este e-mail não está cadastrado!";
                    break;
                case 'auth/wrong-password':
                    errorDiv.innerText = "Senha incorreta! Tente novamente.";
                    break;
                case 'auth/invalid-email':
                    errorDiv.innerText = "O formato do e-mail digitado é inválido.";
                    break;
                case 'auth/too-many-requests':
                    errorDiv.innerText = "Muitas tentativas feitas. Conta bloqueada temporariamente.";
                    break;
                default:
                    errorDiv.innerText = "Erro ao entrar. Verifique os dados digitados.";
            }
            errorDiv.style.color = "#f44336";
        }
    });
}

// LÓGICA DE SOLICITAÇÃO DE CADASTRO
if (btnSolicitar) {
    btnSolicitar.style.cursor = 'pointer';
    btnSolicitar.addEventListener('click', async () => {
        const email = emailInput.value.trim();
        const senha = senhaInput.value.trim();

        if (!email || !senha) {
            errorDiv.innerText = "Digite e-mail e senha para solicitar cadastro!";
            errorDiv.style.color = "#ffeb3b";
            return;
        }

        errorDiv.innerText = "Enviando solicitação...";
        errorDiv.style.color = "#ffeb3b";

        try {
            // Cria o usuário temporário no Firebase Auth
            const userCredential = await auth.createUserWithEmailAndPassword ? 
                await auth.createUserWithEmailAndPassword(email, senha) : 
                // Fallback dinâmico para garantir criação externa
                await signInWithEmailAndPassword(auth, email, senha).catch(async (err) => {
                    if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
                        // Se não existe, vamos criar usando a função importada se necessário
                        // Mas para simplificar o fluxo do seu Admin, criamos direto:
                        const { createUserWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
                        return await createUserWithEmailAndPassword(auth, email, senha);
                    }
                    throw err;
                });

            const user = userCredential.user;

            // Salva no Firestore com status "pendente"
            await setDoc(doc(db, "usuarios", user.uid), {
                email: email,
                status: "pendente",
                urlLoja: "",
                nomeLoja: "",
                dataSolicitacao: new Date().toISOString()
            });

            errorDiv.innerText = "Solicitação enviada! Aguarde a aprovação do administrador.";
            errorDiv.style.color = "#4caf50";

        } catch (error) {
            if (error.code === 'auth/email-already-in-use') {
                errorDiv.innerText = "Este e-mail já está cadastrado ou possui solicitação!";
            } else {
                errorDiv.innerText = "Erro ao solicitar: " + error.message;
            }
            errorDiv.style.color = "#f44336";
        }
    });
}
