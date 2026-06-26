import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const slugInput = document.getElementById('slug-input');
const statusMsg = document.getElementById('status-msg');
let usuarioAtualUid = null;

// Captura parâmetros da URL atual
const urlParams = new URLSearchParams(window.location.search);
const lojaParamAtual = urlParams.get('loja');

// EXIBIDOR DE LINKS NA ABA DE PERFIL
function exibirLinksGerados(slug) {
    if (!statusMsg) return;
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

// ETAPA 2: MAGO DE CONFIGURAÇÃO DE SLUG (BLOQUEIA O VISUAL ATÉ DEFINIR O LINK)
function abrirMagoOnboarding() {
    const overlayExistente = document.getElementById('onboarding-screen');
    if (overlayExistente) return;

    const overlay = document.createElement('div');
    overlay.id = 'onboarding-screen';
    overlay.style = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background-color: #0b0b0b; z-index: 99999; display: flex;
        justify-content: center; align-items: center; font-family: 'Segoe UI', Tahoma, sans-serif;
    `;
    overlay.innerHTML = `
        <div style="background-color: #121212; border: 1px solid #222; padding: 40px; border-radius: 12px; width: 100%; max-width: 450px; box-shadow: 0 4px 25px rgba(0,0,0,0.8); box-sizing: border-box; text-align: center;">
            <div style="font-size: 26px; font-weight: bold; margin-bottom: 15px; color: #fff; letter-spacing: 1px;">🧬 Vide<span style="color: #00bcd4;">Digital</span></div>
            <h3 style="color: #4caf50; margin: 0 0 10px 0; font-size: 19px; font-weight: 600;">Seu acesso foi Aprovado! 🎉</h3>
            <p style="color: #aaa; font-size: 14px; margin-bottom: 25px; line-height: 1.5;">Parabéns! Sua conta foi ativada. Agora crie a URL exclusiva da sua loja para liberar o seu painel de controle:</p>
            
            <div style="text-align: left; margin-bottom: 25px;">
                <label style="display: block; font-size: 11px; color: #888; margin-bottom: 8px; font-weight: bold; letter-spacing: 0.5px;">URL DA SUA VITRINE VIRTUAL:</label>
                <div style="display: flex; align-items: center; background-color: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px; padding: 12px;">
                    <span style="color: #555; font-size: 14px; padding-right: 2px; user-select: none; font-weight: 500;">loja=</span>
                    <input type="text" id="onboarding-slug-input" placeholder="nomedasualoja" style="background: transparent; border: none; color: #fff; font-size: 14px; width: 100%; outline: none; padding: 0; font-weight: 500;">
                </div>
                <small id="onboarding-erro" style="color: #f44336; font-size: 12px; display: block; margin-top: 8px; font-weight: 500;"></small>
            </div>
            
            <button id="btn-ativar-loja" style="width: 100%; padding: 13px; border-radius: 8px; border: none; background-color: #00bcd4; color: #fff; font-size: 14px; font-weight: bold; cursor: pointer; transition: 0.2s;">Ativar Minha Loja e Abrir Painel</button>
        </div>
    `;
    document.body.appendChild(overlay);

    // Evento de Gravação do Slug Inicial no clique do Mago
    document.getElementById('btn-ativar-loja').addEventListener('click', async () => {
        const input = document.getElementById('onboarding-slug-input');
        const erroMsg = document.getElementById('onboarding-erro');
        const slugNova = input.value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
        
        input.value = slugNova;

        if (!slugNova) {
            erroMsg.innerText = "Por favor, defina um nome válido para seu link!";
            erroMsg.style.color = "#f44336";
            return;
        }

        erroMsg.innerText = "Montando infraestrutura da sua loja...";
        erroMsg.style.color = "#ffeb3b";

        try {
            // Salva de forma definitiva o link escolhido no banco
            await updateDoc(doc(db, "usuarios", usuarioAtualUid), {
                urlLoja: slugNova
            });

            // Destrói a tela de bloqueio e manda o usuário para o dashboard final com a URL parametrizada
            overlay.remove();
            window.location.href = `dashboard.html?loja=${slugNova}`;

        } catch (err) {
            erroMsg.innerText = "Erro ao configurar link: " + err.message;
            erroMsg.style.color = "#f44336";
        }
    });
}

// 1. PROTEGER A PÁGINA: Verifica login ativo do lojista
onAuthStateChanged(auth, async (user) => {
    if (user) {
        usuarioAtualUid = user.uid;
        carregarDadosUsuario(user.uid);
    } else {
        window.location.href = 'login.html';
    }
});

// 2. AVALIAÇÃO DE SEGURANÇA E PARAMETRIZAÇÃO MULTILOJAS
async function carregarDadosUsuario(uid) {
    try {
        const userDoc = await getDoc(doc(db, "usuarios", uid));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            const slugSalvo = userData.urlLoja || "";

            // Se o usuário está aprovado mas NÃO possui link criado, aciona o Mago imediatamente
            if (!slugSalvo) {
                abrirMagoOnboarding();
                return;
            }

            // Se ele já tem um link mas tentou entrar pela URL geral (/dashboard.html) sem parâmetro, corrige
            if (slugSalvo && lojaParamAtual !== slugSalvo) {
                window.location.href = `dashboard.html?loja=${slugSalvo}`;
                return;
            }

            // Preenche e exibe os dados salvos normais na aba de perfil interna
            if (slugInput) slugInput.value = slugSalvo;
            exibirLinksGerados(slugSalvo);
        }
    } catch (error) {
        console.error("Erro no carregamento do painel:", error);
    }
}

// 3. ALTERAÇÃO FUTURA DO SLUG (Dentro do perfil se ele quiser mudar)
if (slugInput) {
    document.getElementById('btn-salvar-slug')?.addEventListener('click', async () => {
        if (!usuarioAtualUid) return;

        const novoSlug = slugInput.value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
        slugInput.value = novoSlug;

        if (!novoSlug) {
            if (statusMsg) statusMsg.innerHTML = "<span style='color: #f44336; font-size: 14px;'>Por favor, digite um link válido!</span>";
            return;
        }

        if (statusMsg) statusMsg.innerHTML = "<span style='color: #ffeb3b; font-size: 14px;'>Salvando alteração na nuvem...</span>";

        try {
            await updateDoc(doc(db, "usuarios", usuarioAtualUid), {
                urlLoja: novoSlug
            });

            // Atualiza a URL do painel dinamicamente para o novo slug sem dar reload completo
            const novaUrlAdmin = window.location.protocol + "//" + window.location.host + window.location.pathname + `?loja=${novoSlug}`;
            window.history.pushState({ path: novaUrlAdmin }, '', novaUrlAdmin);

            exibirLinksGerados(novoSlug);

        } catch (error) {
            if (statusMsg) statusMsg.innerHTML = `<span style='color: #f44336; font-size: 14px;'>Erro ao salvar: ${error.message}</span>`;
        }
    });
}

// 4. COPIAR LINK DA VITRINE
document.getElementById('btn-copiar-url')?.addEventListener('click', () => {
    if (!slugInput) return;
    const linkCompleto = `videdigital.github.io/vide-digital/?loja=${slugInput.value}`;
    navigator.clipboard.writeText(linkCompleto);
    
    const avisoCopiado = document.createElement('div');
    avisoCopiado.innerText = "Link de cliente copiado! 📋";
    avisoCopiado.style.color = "#00bcd4";
    avisoCopiado.style.fontSize = "13px";
    avisoCopiado.style.marginTop = "8px";
    statusMsg?.appendChild(avisoCopiado);
    
    setTimeout(() => avisoCopiado.remove(), 2500);
});

// 5. BOTÃO DE LOGOUT
document.getElementById('btn-logout')?.addEventListener('click', () => {
    signOut(auth).then(() => {
        window.location.href = 'login.html';
    });
});
