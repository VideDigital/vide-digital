import { auth, db } from './firebase-init.js';
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Selecionando os elementos da tela de login
const emailInput = document.querySelector('input[type="email"]');
const senhaInput = document.querySelector('input[type="password"]');

// Encontra os botões dinamicamente com base no texto interno
const botoes = document.querySelectorAll('button, div, input[type="button"]');
let btnEntrar = null;
let btnSolicitar = null;

botoes.forEach(btn => {
    if (btn.innerText?.includes("Entrar no Dashboard")) btnEntrar = btn;
    if (btn.innerText?.includes("Solicitar Cadastro")) btnSolicitar = btn;
});

// Criação ou seleção do container de feedbacks/erros
let errorDiv = document.getElementById('mensagem-erro');
if (!errorDiv) {
    errorDiv = document.createElement('div');
    errorDiv.id = 'mensagem-erro';
    errorDiv.style.color = '#f44336';
    errorDiv.style.fontSize = '14px';
    errorDiv.style.marginTop = '15px';
    errorDiv.style.textAlign = 'center';
    errorDiv.style.fontWeight = '500';
    btnSolicitar?.parentNode?.appendChild(errorDiv);
}

// LÓGICA DE LOGIN
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

            // Busca os dados cadastrais e permissões no Firestore
            const userDoc = await getDoc(doc(db, "usuarios", user.uid));
            
            if (userDoc.exists()) {
                const userData = userDoc.data();
                
                // ETAPA 1: Verificar se o usuário está de fato aprovado pelo ADM
                if (userData.status === "aprovado") {
                    errorDiv.innerText = "Acesso autorizado! Carregando seu ambiente...";
                    errorDiv.style.color = "#4caf50";
                    
                    const slugLoja = userData.urlLoja || "";
                    
                    setTimeout(() => {
                        if (slugLoja) {
                            // Se já tiver slug configurado, vai direto pro seu gerenciador específico
                            window.location.href = `dashboard.html?loja=${slugLoja}`;
                        } else {
                            // Se não tiver slug, vai para o dashboard limpo onde o mago de ativação vai aparecer
                            window.location.href = 'dashboard.html';
                        }
                    }, 1000);
                } else {
                    errorDiv.innerText = "Seu cadastro ainda está pendente de aprovação do administrador!";
                    errorDiv.style.color = "#ff9800";
                }
            } else {
                errorDiv.innerText = "Conta não localizada na base de dados ativa.";
                errorDiv.style.color = "#f44336";
            }

        } catch (error) {
            console.error("Erro Firebase Login:", error.code);
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
                    errorDiv.innerText = "O formato do e-mail inserido é inválido.";
                    break;
                case 'auth/too-many-requests':
                    errorDiv.innerText = "Tentativas excessivas. Tente novamente mais tarde.";
                    break;
                default:
                    errorDiv.innerText = "Erro ao efetuar o login. Tente novamente.";
            }
            errorDiv.style.color = "#f44336";
        }
    });
}

// LÓGICA DE CRIAÇÃO/SOLICITAÇÃO DE CONTA NOVO MEMBRO
if (btnSolicitar) {
    btnSolicitar.style.cursor = 'pointer';
    btnSolicitar.addEventListener('click', async () => {
        const email = emailInput.value.trim();
        const senha = senhaInput.value.trim();

        if (!email || !senha) {
            errorDiv.innerText = "Preencha e-mail e senha para criar sua solicitação!";
            errorDiv.style.color = "#ffeb3b";
            return;
        }

        errorDiv.innerText = "Enviando proposta de acesso...";
        errorDiv.style.color = "#ffeb3b";

        try {
            const { createUserWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
            const userCredential = await createUserWithEmailAndPassword(auth, email, senha);
            const user = userCredential.user;

            // Salva o usuário no banco com status pendente e link vazio
            await setDoc(doc(db, "usuarios", user.uid), {
                email: email,
                status: "pendente",
                urlLoja: "",
                nomeLoja: "",
                dataSolicitacao: new Date().toISOString()
            });

            errorDiv.innerText = "Solicitação efetuada! Aguarde liberação do administrador.";
            errorDiv.style.color = "#4caf50";

        } catch (error) {
            if (error.code === 'auth/email-already-in-use') {
                errorDiv.innerText = "Este e-mail já está em uso ou possui solicitação!";
            } else {
                errorDiv.innerText = "Erro na solicitação: " + error.message;
            }
            errorDiv.style.color = "#f44336";
        }
    });
}
