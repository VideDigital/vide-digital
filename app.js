import { auth, db } from './firebase-init.js';
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

console.log("[Minha Loja Vide] Script app.js carregado.");

// Seleção de elementos da interface
const emailInput = document.querySelector('input[type="email"]');
const senhaInput = document.querySelector('input[type="password"]');

const botoes = document.querySelectorAll('button, div, input[type="button"]');
let btnEntrar = null;
let btnSolicitar = null;

botoes.forEach(btn => {
    if (btn.innerText?.includes("Entrar no Dashboard")) btnEntrar = btn;
    if (btn.innerText?.includes("Solicitar Cadastro")) btnSolicitar = btn;
});

let errorDiv = document.getElementById('mensagem-erro');
if (!errorDiv) {
    errorDiv = document.createElement('div');
    errorDiv.id = 'mensagem-erro';
    errorDiv.style = 'color: #f44336; font-size: 14px; margin-top: 15px; text-align: center; font-weight: 500;';
    btnSolicitar?.parentNode?.appendChild(errorDiv);
}

// 1. LÓGICA DE LOGIN (ENTRAR)
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

        errorDiv.innerText = "Autenticando credenciais...";
        errorDiv.style.color = "#ffeb3b";

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, senha);
            const user = userCredential.user;

            const userDoc = await getDoc(doc(db, "usuarios", user.uid));
            
            if (userDoc.exists()) {
                const userData = userDoc.data();
                
                if (userData.status === "aprovado") {
                    errorDiv.innerText = "Acesso autorizado! Carregando painel...";
                    errorDiv.style.color = "#4caf50";
                    
                    const slugLoja = userData.urlLoja || "";
                    
                    setTimeout(() => {
                        if (slugLoja) {
                            window.location.href = `dashboard.html?loja=${slugLoja}`;
                        } else {
                            window.location.href = 'dashboard.html';
                        }
                    }, 1000);
                } else {
                    errorDiv.innerText = "Seu cadastro está aguardando aprovação do administrador.";
                    errorDiv.style.color = "#ff9800";
                }
            } else {
                errorDiv.innerText = "Cadastro não encontrado no sistema.";
                errorDiv.style.color = "#f44336";
            }

        } catch (error) {
            console.error("Erro no Login:", error.code);
            if (error.code === 'auth/invalid-credential') {
                errorDiv.innerText = "E-mail ou senha incorretos!";
            } else {
                errorDiv.innerText = "Erro ao efetuar login. Verifique seus dados.";
            }
            errorDiv.style.color = "#f44336";
        }
    });
}

// 2. LÓGICA DE SOLICITAÇÃO DE NOVO CADASTRO
if (btnSolicitar) {
    btnSolicitar.style.cursor = 'pointer';
    btnSolicitar.addEventListener('click', async () => {
        const email = emailInput.value.trim();
        const senha = senhaInput.value.trim();

        if (!email || !senha) {
            errorDiv.innerText = "Insira e-mail e senha para solicitar cadastro!";
            errorDiv.style.color = "#ffeb3b";
            return;
        }

        errorDiv.innerText = "Enviando solicitação...";
        errorDiv.style.color = "#ffeb3b";

        try {
            const { createUserWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
            const userCredential = await createUserWithEmailAndPassword(auth, email, senha);
            const user = userCredential.user;

            await setDoc(doc(db, "usuarios", user.uid), {
                email: email,
                status: "pendente",
                urlLoja: "",
                nomeLoja: "",
                dataSolicitacao: new Date().toISOString()
            });

            errorDiv.innerText = "Solicitação enviada! Fale com o administrador para ser aprovado.";
            errorDiv.style.color = "#4caf50";

        } catch (error) {
            if (error.code === 'auth/email-already-in-use') {
                errorDiv.innerText = "Este e-mail já possui um cadastro ou solicitação ativa.";
            } else {
                errorDiv.innerText = "Erro ao solicitar: " + error.message;
            }
            errorDiv.style.color = "#f44336";
        }
    });
}
