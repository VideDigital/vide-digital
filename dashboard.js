import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

console.log("[VideDigital] Script dashboard.js carregado com sucesso!");

const slugInput = document.getElementById('slug-input');
const statusMsg = document.getElementById('status-msg');
let usuarioAtualUid = null;

const urlParams = new URLSearchParams(window.location.search);
const lojaParamAtual = urlParams.get('loja');

// FUNÇÃO AUXILIAR: Desenha os links na aba Perfil
function exibirLinksGerados(slug) {
    if (!statusMsg) {
        console.warn("[VideDigital] Elemento 'status-msg' não encontrado para renderizar os links.");
        return;
    }
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

// ETAPA 2: MAGO DE CONFIGURAÇÃO DE SLUG
function abrirMagoOnboarding() {
    console.log("[VideDigital] Abrindo o Mago de Onboarding para criar o link...");
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
            
            <button id="btn-ativar-loja" style="width: 100%; padding: 13px; border-radius: 8px; border: none; background-color: #00bcd4; color: #fff; font-size: 14px; font-weight: bold; cursor: pointer;">Ativar Minha Loja e Abrir Painel</button>
        </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('btn-ativar-loja').addEventListener('click', async () => {
        const input = document.getElementById('onboarding-slug-input');
        const erroMsg = document.getElementById('onboarding-erro');
        const slugNova = input.value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
        
        input.value = slugNova;

        if (!slugNova) {
            erroMsg.innerText = "Por favor, defina um nome válido para seu link!";
            return;
        }

        erroMsg.innerText = "Gravando link no banco de dados...";
        erroMsg.style.color = "#ffeb3b";
        console.log(`[VideDigital] Tentando salvar o slug '${slugNova}' para o UID: ${usuarioAtualUid}`);

        try {
            await updateDoc(doc(db, "usuarios", usuarioAtualUid), {
                urlLoja: slugNova
            });
            console.log("[VideDigital] Slug salvo com sucesso no Firestore! Redirecionando...");
            overlay.remove();
            window.location.href = `dashboard.html?loja=${slugNova}`;

        } catch (err) {
            console.error("[VideDigital] Erro crítico ao salvar slug no Firestore:", err);
            erroMsg.innerText = "Erro ao salvar: " + err.message;
            erroMsg.style.color = "#f44336";
        }
    });
}

// 1. MONITORAMENTO DE AUTENTICAÇÃO
onAuthStateChanged(auth, async (user) => {
    if (user) {
        console.log("[VideDigital] Usuário detectado logado. UID:", user.uid);
        usuarioAtualUid = user.uid;
        carregarDadosUsuario(user.uid);
    } else {
        console.log("[VideDigital] Nenhum usuário logado. Voltando para login.html");
        window.location.href = 'login.html';
    }
});

// 2. VERIFICAÇÃO DE DADOS E CORREÇÃO DE PARAMETRIZAÇÃO
async function carregarDadosUsuario(uid) {
    try {
        console.log("[VideDigital] Buscando documento do usuário no Firestore...");
        const userDoc = await getDoc(doc(db, "usuarios", uid));
        
        if (userDoc.exists()) {
            const userData = userDoc.data();
            console.log("[VideDigital] Dados carregados do Firestore:", userData);
            
            const slugSalvo = userData.urlLoja || "";

            // Caso aprovado mas sem link configurado ainda
            if (!slugSalvo) {
                console.log("[VideDigital] Usuário aprovado, mas sem link cadastrado. Iniciando onboarding.");
                abrirMagoOnboarding();
                return;
            }

            // Caso tenha link mas acessou a URL crua sem o ?loja=slug
            if (slugSalvo && lojaParamAtual !== slugSalvo) {
                console.log(`[VideDigital] Redirecionando para rota parametrizada correta: ?loja=${slugSalvo}`);
                window.location.href = `dashboard.html?loja=${slugSalvo}`;
                return;
            }

            console.log("[VideDigital] Tudo certo! Usuário na rota correta da sua loja.");
            if (slugInput) slugInput.value = slugSalvo;
            exibirLinksGerados(slugSalvo);
        } else {
            console.warn("[VideDigital] Documento do usuário não existe na coleção 'usuarios'.");
        }
    } catch (error) {
        console.error("[VideDigital] Erro ao ler Firestore em carregarDadosUsuario:", error);
    }
}

// 3. ATUALIZAR LINK DENTRO DO PERFIL (SE JÁ EXISTIR O BOTÃO)
document.getElementById('btn-salvar-slug')?.addEventListener('click', async () => {
    if (!usuarioAtualUid || !slugInput) return;
    const novoSlug = slugInput.value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
    slugInput.value = novoSlug;

    if (!novoSlug) return;

    try {
        await updateDoc(doc(db, "usuarios", usuarioAtualUid), { urlLoja: novoSlug });
        const novaUrlAdmin = window.location.protocol + "//" + window.location.host + window.location.pathname + `?loja=${novoSlug}`;
        window.history.pushState({ path: novaUrlAdmin }, '', novaUrlAdmin);
        exibirLinksGerados(novoSlug);
    } catch (error) {
        console.error("[VideDigital] Erro ao editar slug no painel:", error);
    }
});

// 4. COPIAR LINK
document.getElementById('btn-copiar-url')?.addEventListener('click', () => {
    if (!slugInput) return;
    const linkCompleto = `videdigital.github.io/vide-digital/?loja=${slugInput.value}`;
    navigator.clipboard.writeText(linkCompleto);
    alert("Link copiado!");
});

// 5. LOGOUT
document.getElementById('btn-logout')?.addEventListener('click', () => {
    signOut(auth).then(() => { window.location.href = 'login.html'; });
});
