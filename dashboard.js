import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

console.log("[Minha Loja Vide] Script dashboard.js carregado com sucesso!");

const slugInput = document.getElementById('slug-input');
const statusMsg = document.getElementById('status-msg');
let usuarioAtualUid = null;

const urlParams = new URLSearchParams(window.location.search);
const lojaParamAtual = urlParams.get('loja');

// ATUALIZA OS BOTÕES DA SIDEBAR COM O PARÂMETRO DA LOJA ATUAL
function ajustarLinksSidebar(slug) {
    console.log(`[Minha Loja Vide] Injetando slug nos links da barra lateral: ${slug}`);

    const btnPerfil = document.getElementById('sb-perfil');
    const btnDashboard = document.getElementById('sb-dashboard');
    const btnDominios = document.getElementById('sb-dominios');
    const btnLeads = document.getElementById('sb-leads');
    const btnMinhaLoja = document.getElementById('sb-minhaloja');

    if (btnPerfil) btnPerfil.setAttribute('href', `perfil.html?loja=${slug}`);
    if (btnDashboard) btnDashboard.setAttribute('href', `dashboard.html?loja=${slug}`);
    if (btnDominios) btnDominios.setAttribute('href', `dominios.html?loja=${slug}`);
    if (btnLeads) btnLeads.setAttribute('href', `leads.html?loja=${slug}`);

    // Link público que abre a vitrine do cliente final no GitHub Pages
    if (btnMinhaLoja) {
        btnMinhaLoja.setAttribute('href', `https://videdigital.github.io/vide-digital/?loja=${slug}`);
    }
}

// EXIBE OS LINKS CONFIGURADOS DENTRO DO PAINEL (ABA PERFIL)
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
                <span style="font-size: 11px; color: #888; display: block; font-weight: bold; letter-spacing: 0.5px; margin-bottom: 4px;">🔑 LINK ADMINISTRATIVO DO SEU PAINEL:</span>
                <a href="https://videdigital.github.io/vide-digital/dashboard.html?loja=${slug}" target="_blank" style="color: #ff9800; font-size: 13px; text-decoration: none; word-break: break-all; font-weight: 500;">
                    videdigital.github.io/vide-digital/dashboard.html?loja=${slug}
                </a>
            </div>
        </div>
    `;
}

// MAGO DE CONFIGURAÇÃO DO SLUG (BLOQUEIO PÓS-APROVAÇÃO)
function abrirMagoOnboarding() {
    const overlayExistente = document.getElementById('onboarding-screen');
    if (overlayExistente) return;

    const overlay = document.createElement('div');
    overlay.id = 'onboarding-screen';
    overlay.style = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background-color: #0b0b0b; z-index: 99999; display: flex;
        justify-content: center; align-items: center; font-family: 'Segoe UI', sans-serif;
    `;
    overlay.innerHTML = `
        <div style="background-color: #121212; border: 1px solid #222; padding: 40px; border-radius: 12px; width: 100%; max-width: 450px; box-shadow: 0 4px 25px rgba(0,0,0,0.8); box-sizing: border-box; text-align: center;">
            <div style="font-size: 24px; font-weight: bold; margin-bottom: 15px; color: #fff; letter-spacing: 1px;">🧬 Minha Loja <span style="color: #00bcd4;">Vide</span></div>
            <h3 style="color: #4caf50; margin: 0 0 10px 0; font-size: 18px; font-weight: 600;">Seu acesso foi Aprovado! 🎉</h3>
            <p style="color: #aaa; font-size: 14px; margin-bottom: 25px; line-height: 1.5;">Para liberar o seu painel de gerenciamento, crie agora o link exclusivo que os seus clientes usarão para acessar seus produtos:</p>
            
            <div style="text-align: left; margin-bottom: 25px;">
                <label style="display: block; font-size: 11px; color: #888; margin-bottom: 8px; font-weight: bold; letter-spacing: 0.5px;">NOME DO LINK DA SUA LOJA:</label>
                <div style="display: flex; align-items: center; background-color: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px; padding: 12px;">
                    <span style="color: #555; font-size: 14px; padding-right: 2px; user-select: none; font-weight: 500;">loja=</span>
                    <input type="text" id="onboarding-slug-input" placeholder="nomedasualoja" style="background: transparent; border: none; color: #fff; font-size: 14px; width: 100%; outline: none; padding: 0; font-weight: 500;">
                </div>
                <small id="onboarding-erro" style="color: #f44336; font-size: 12px; display: block; margin-top: 8px; font-weight: 500;"></small>
            </div>
            
            <button id="btn-ativar-loja" style="width: 100%; padding: 13px; border-radius: 8px; border: none; background-color: #00bcd4; color: #fff; font-size: 14px; font-weight: bold; cursor: pointer;">Criar Link e Ativar Painel</button>
        </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('btn-ativar-loja').addEventListener('click', async () => {
        const input = document.getElementById('onboarding-slug-input');
        const erroMsg = document.getElementById('onboarding-erro');
        const slugNova = input.value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
        
        input.value = slugNova;

        if (!slugNova) {
            erroMsg.innerText = "Defina um nome válido (apenas letras e números)!";
            return;
        }

        erroMsg.innerText = "Criando o link da sua loja no banco...";
        erroMsg.style.color = "#ffeb3b";

        try {
            await updateDoc(doc(db, "usuarios", usuarioAtualUid), {
                urlLoja: slugNova
            });
            
            overlay.remove();
            window.location.href = `dashboard.html?loja=${slugNova}`;

        } catch (err) {
            erroMsg.innerText = "Erro ao registrar: " + err.message;
            erroMsg.style.color = "#f44336";
        }
    });
}

// 1. MONITORAMENTO DA SESSÃO DO LOJISTA
onAuthStateChanged(auth, async (user) => {
    if (user) {
        usuarioAtualUid = user.uid;
        carregarConfiguracoesPainel(user.uid);
    } else {
        window.location.href = 'login.html';
    }
});

// 2. CHECAGEM E ENGENHARIA MULTILOJAS DE REDIRECIONAMENTO
async function carregarConfiguracoesPainel(uid) {
    try {
        const userDoc = await getDoc(doc(db, "usuarios", uid));
        
        if (userDoc.exists()) {
            const userData = userDoc.data();
            const slugSalvo = userData.urlLoja || "";

            // Cenário A: Aprovado mas não cadastrou link ainda -> Abre o mago
            if (!slugSalvo) {
                abrirMagoOnboarding();
                return;
            }

            // Cenário B: Tentou acessar a rota crua sem parametrizar -> Redireciona para o link certo dele
            if (slugSalvo && lojaParamAtual !== slugSalvo) {
                window.location.href = `dashboard.html?loja=${slugSalvo}`;
                return;
            }

            // Cenário C: Tudo certo, usuário na rota correta -> Inicializa os botões
            ajustarLinksSidebar(slugSalvo);
            
            if (slugInput) slugInput.value = slugSalvo;
            exibirLinksGerados(slugSalvo);
        }
    } catch (error) {
        console.error("Erro ao ler dados da loja:", error);
    }
}

// 3. EDITAR SLUG DENTRO DA ABA DE PERFIL (SE PRECISAR MUDAR NO FUTURO)
document.getElementById('btn-salvar-slug')?.addEventListener('click', async () => {
    if (!usuarioAtualUid || !slugInput) return;
    const novoSlug = slugInput.value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
    slugInput.value = novoSlug;

    if (!novoSlug) return;

    try {
        await updateDoc(doc(db, "usuarios", usuarioAtualUid), { urlLoja: novoSlug });
        const novaUrlAdmin = window.location.protocol + "//" + window.location.host + window.location.pathname + `?loja=${novoSlug}`;
        window.history.pushState({ path: novaUrlAdmin }, '', novaUrlAdmin);
        
        ajustarLinksSidebar(novoSlug);
        exibirLinksGerados(novoSlug);
    } catch (error) {
        console.error("Erro ao alterar link:", error);
    }
});

// 4. COPIAR LINK DA VITRINE
document.getElementById('btn-copiar-url')?.addEventListener('click', () => {
    if (!slugInput) return;
    const linkCompleto = `videdigital.github.io/vide-digital/?loja=${slugInput.value}`;
    navigator.clipboard.writeText(linkCompleto);
    alert("Link da sua loja copiado para a área de transferência!");
});

// 5. EFETUAR LOGOUT
document.getElementById('btn-logout')?.addEventListener('click', () => {
    signOut(auth).then(() => { window.location.href = 'login.html'; });
});
