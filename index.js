<!DOCTYPE html>
<html lang="pt-br" class="h-full bg-[#03040B]">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>VideDigital | Autenticação do Ecossistema</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="style.css">
</head>
<body class="h-full flex items-center justify-center p-4 relative overflow-hidden">

    <div class="absolute top-[-20%] left-[-10%] h-[600px] w-[600px] rounded-full bg-[#00f2fe] blur-[140px] opacity-15 pointer-events-none"></div>
    <div class="absolute bottom-[-20%] right-[-10%] h-[600px] w-[600px] rounded-full bg-[#4facfe] blur-[140px] opacity-15 pointer-events-none"></div>

    <div class="w-full max-w-[460px] bg-gradient-to-b from-[rgba(12,13,26,0.6)] to-[rgba(6,7,15,0.9)] border border-white/5 p-10 rounded-[32px] space-y-8 relative z-10 backdrop-blur-xl">
        
        <div class="flex flex-col items-center text-center space-y-3">
            <div class="h-12 w-12 rounded-2xl bg-gradient-to-tr from-[#00f2fe] to-[#4facfe] flex items-center justify-center shadow-[0_0_30px_rgba(0,242,254,0.35)] relative group">
                <span class="text-black font-extrabold text-sm tracking-tighter">V</span>
            </div>
            <h1 class="text-xl font-bold text-white tracking-tight">Acesse seu Painel</h1>
            <p class="text-gray-400 text-xs">Entre com suas credenciais para gerenciar suas vitrines.</p>
        </div>

        <form id="login-form" class="space-y-5">
            <div class="space-y-1.5">
                <label class="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">E-mail Corporativo</label>
                <input type="email" required id="login-email" class="w-full bg-[#06060a]/80 border border-white/5 rounded-xl p-3.5 text-sm text-white outline-none focus:border-[#00f2fe] focus:shadow-[0_0_20px_rgba(0,242,254,0.1)] transition-all" placeholder="nome@empresa.com">
            </div>

            <div class="space-y-1.5">
                <div class="flex justify-between items-center">
                    <label class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Senha de Acesso</label>
                    <a href="#" class="text-[11px] text-[#00f2fe] hover:underline">Esqueceu a senha?</a>
                </div>
                <input type="password" required id="login-senha" class="w-full bg-[#06060a]/80 border border-white/5 rounded-xl p-3.5 text-sm text-white outline-none focus:border-[#00f2fe] focus:shadow-[0_0_20px_rgba(0,242,254,0.1)] transition-all" placeholder="••••••••">
            </div>

            <button type="submit" class="w-full py-4 bg-gradient-to-r from-[#00f2fe] to-[#4facfe] text-black font-black text-xs uppercase tracking-widest rounded-xl shadow-[0_4px_30px_rgba(0,242,254,0.2)] hover:scale-[1.01] transition-all">
                Autenticar Entrada
            </button>
        </form>

        <p class="text-center text-xs text-gray-500">Não tem uma conta? <a href="#" class="text-white font-semibold hover:underline">Criar Conta</a></p>
    </div>

    <script type="module">
        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
        import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

        // Configuração direta do seu banco SaaS homologado e ativo
        const firebaseConfig = {
            apiKey: "AIzaSyBON-cfEpnuQf496m9pnZJW24XoR_2nlwc",
            authDomain: "vide-digital-saas.firebaseapp.com",
            projectId: "vide-digital-saas",
            storageBucket: "vide-digital-saas.firebasestorage.app",
            messagingSenderId: "891590456336",
            appId: "1:891590456336:web:bd51ac50399465b886c695"
        };

        // Inicialização Local Controlada
        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);

        // Sistema Unificado de Notificações Internas (Que substitui o window.alert)
        function emitInlineFeedback(message, status = 'success') {
            let feedbackBox = document.getElementById('global-inline-feedback');
            if (!feedbackBox) {
                feedbackBox = document.createElement('div');
                feedbackBox.id = 'global-inline-feedback';
                Object.assign(feedbackBox.style, {
                    position: 'fixed',
                    bottom: '24px',
                    left: '24px',
                    padding: '14px 20px',
                    borderRadius: '10px',
                    color: '#FFF',
                    fontWeight: '600',
                    fontSize: '0.9rem',
                    zIndex: '99999',
                    transition: 'all 0.3s ease',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.4)'
                });
                document.body.appendChild(feedbackBox);
            }
            
            feedbackBox.style.backgroundColor = status === 'success' ? '#00D2DF' : '#EF4444';
            feedbackBox.style.color = status === 'success' ? '#000' : '#FFF';
            feedbackBox.textContent = message;
            feedbackBox.style.display = 'block';
            
            setTimeout(() => {
                feedbackBox.style.display = 'none';
            }, 3000);
        }

        // Monitoramento e Envio do Formulário de Login
        const form = document.getElementById("login-form");
        if (form) {
            form.addEventListener("submit", async (e) => {
                e.preventDefault();

                const email = document.getElementById("login-email").value;
                const senha = document.getElementById("login-senha").value;

                try {
                    await signInWithEmailAndPassword(auth, email, senha);
                    
                    // Dispara a sua notificação inline de sucesso antes do redirecionamento
                    emitInlineFeedback("Autenticado com sucesso! Redirecionando...", "success");
                    
                    setTimeout(() => {
                        window.location.href = "dashboard.html";
                    }, 1000);

                } catch (error) {
                    // Dispara a notificação de erro customizada na tela
                    emitInlineFeedback("Falha na autenticação. Verifique seus dados de acesso.", "error");
                    console.error("Erro Auth Gerado:", error.message);
                }
            });
        }
    </script>
</body>
</html>
