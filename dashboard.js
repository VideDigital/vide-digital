import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

console.log("[Minha Loja Vide] Inicializando painel SPA unificado.");

let usuarioAtualUid = null;
const urlParams = new URLSearchParams(window.location.search);
const lojaParamAtual = urlParams.get('loja');

// EXIBE OS LINKS GERADOS NA ABA DE PERFIL
function exibirLinksGeradosNoPerfil(slug) {
    const statusMsg = document.getElementById('status-msg');
    if (!statusMsg) return;
    statusMsg.innerHTML = `
        <div style="margin-top: 20px; padding: 15px; background-color: #161616; border: 1px solid #222; border-left: 4px solid #00bcd4; border-radius: 8px; text-align: left; box-sizing: border-box; width: 100%;">
            <p style="color: #4caf50; font-weight: bold; margin: 0 0 15px 0; font-size: 14px;">🎉 Link configurado com sucesso!</p>
            <div style="margin-bottom: 12px;">
                <span style="font-size: 11px; color: #888; display: block; font-weight: bold; margin-bottom: 4px;">🌐 LINK DA VITRINE (CLIENTES):</span>
                <a href="https://videdigital.github.io/vide-digital/?loja=${slug}" target="_blank" style="color: #00bcd4; font-size: 13px; text-decoration: none; font-weight: 500;">
                    videdigital.github.io/vide-digital/?loja=${slug}
                </a>
            </div>
            <div>
                <span style="font-size: 11px; color: #888; display: block; font-weight: bold; margin-bottom: 4px;">🔑 LINK ADMINISTRATIVO DO SEU PAINEL:</span>
                <a href="https://videdigital.github.io/vide-digital/dashboard.html?loja=${slug}" target="_blank" style="color: #ff9800; font-size: 13px; text-decoration: none; font-weight: 500;">
                    videdigital.github.io/vide-digital/dashboard.html?loja=${slug}
                </a>
            </div>
        </div>
    `;
}

// EXECUTA APÓS O CARREGAMENTO DA PÁGINA PARA TRAVAR OS BOTÕES
function inicializarNavegacaoEAbas() {
    console.log("[Minha Loja Vide] Ativando cliques do menu lateral...");
    const menuItems = document.querySelectorAll('.menu-item');
    const sections = document.querySelectorAll('.app-section');

    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetSectionId = item.getAttribute('data-target');
            console.log(`[Minha Loja Vide] Mudando para a aba: ${targetSectionId}`);

            // Remove classe ativa de todos os botões e adiciona no clicado
            menuItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            // Oculta todas as seções e mostra apenas a selecionada
            sections.forEach(sec => {
                if (sec.id === targetSectionId) {
                    sec.classList.add('active');
                } else {
                    sec.classList.remove('active');
                }
            });
        });
    });

    // Configuração dos botões de ação adicionais
    document.getElementById('btn-salvar-pixels')?.addEventListener('click', async () => {
        if (!usuarioAtualUid) return;
        const fb = document.getElementById('input-pixel-facebook').value.trim();
        const gg = document.getElementById('input-tag-google').value.trim();
        try {
            await updateDoc(doc(db, "usuarios", usuarioAtualUid), { pixelFacebook: fb, tagGoogle: gg });
            alert("Configurações de Pixel atualizadas com sucesso!");
        } catch (error) {
            alert("Erro ao salvar pixels: " + error.message);
        }
    });

    document.getElementById('btn-salvar-slug')?.addEventListener('click', async () => {
        const slugInput = document.getElementById('slug-input');
        if (!usuarioAtualUid || !slugInput) return;
        const novoSlug = slugInput.value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
        slugInput.value = novoSlug;

        if (!novoSlug) return;

        try {
            await updateDoc(doc(db, "usuarios", usuarioAtualUid), { urlLoja: novoSlug });
            const novaUrlAdmin = window.location.protocol + "//" + window.location.host + window.location.pathname + `?loja=${novoSlug}`;
            window.history.pushState({ path: novaUrlAdmin }, '', novaUrlAdmin);
            
            const btnMinhaLoja = document.getElementById('sb-minhaloja');
            if (btnMinhaLoja) btnMinhaLoja.setAttribute('href', `https://videdigital.github.io/vide-digital/?loja=${novoSlug}`);
            
            exibirLinksGeradosNoPerfil(novoSlug);
            alert("Link comercial atualizado com sucesso!");
        } catch (error) {
            console.error("Erro ao alterar link:", error);
        }
    });

    document.getElementById('btn-copiar-url')?.addEventListener('click', () => {
        const slugInput = document.getElementById('slug-input');
        if (!slugInput) return;
        const linkCompleto = `videdigital.github.io/vide-digital/?loja=${slugInput.value}`;
        navigator.clipboard.writeText(linkCompleto);
        alert("Link da loja copiado com sucesso!");
    });

    document.getElementById('btn-logout')?.addEventListener('click', () => {
        signOut(auth).then(() => { window.location.href = 'login.html'; });
    });
}

// MAGO ONBOARDING (PRIMEIRA ATIVAÇÃO)
function abrirMagoOnboarding() {
    const overlayExistente = document.getElementById('onboarding-screen');
    if (overlayExistente) return;

    const overlay = document.createElement('div');
    overlay.id = 'onboarding-screen';
    overlay.style = "position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background-color: #0b0b0b; z-index: 99999; display: flex; justify-content: center; align-items: center;";
    overlay.innerHTML = `
        <div style="background-color: #121212; border: 1px solid #222; padding: 40px; border-radius: 12px; width: 100%; max-width: 450px; text-align: center; box-sizing: border-box;">
            <div style="font-size: 24px; font-weight: bold; margin-bottom: 15px; color: #fff;">Minha Loja <span style="color: #00bcd4;">Vide</span></div>
            <h3 style="color: #4caf50; margin: 0 0 10px 0; font-size: 18px;">Seu acesso foi Aprovado! 🎉</h3>
            <p style="color: #aaa; font-size: 14px; margin-bottom: 25px; line-height: 1.5;">Defina abaixo a URL exclusiva para os seus clientes acessarem a sua loja:</p>
            <div style="text-align: left; margin-bottom: 25px;">
                <label style="display: block; font-size: 11px; color: #888; margin-bottom: 8px; font-weight: bold;">NOME DO LINK COMERCIAL:</label>
                <div style="display: flex; align-items: center; background-color: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px; padding: 12px;">
                    <span style="color: #555; font-size: 14px; padding-right: 2px;">loja=</span>
                    <input type="text" id="onboarding-slug-input" placeholder="nomedasualoja" style="background: transparent; border: none; color: #fff; font-size: 14px; width: 100%; outline: none;">
                </div>
                <small id="onboarding-erro" style="color: #f44336; font-size: 12px; display: block; margin-top: 8px;"></small>
            </div>
            <button id="btn-ativar-loja" style="width: 100%; padding: 13px; border-radius: 8px; border: none; background-color: #00bcd4; color: #fff; font-size: 14px; font-weight: bold; cursor: pointer;">Criar Link e Liberar Painel</button>
        </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('btn-ativar-loja').addEventListener('click', async () => {
        const input = document.getElementById('onboarding-slug-input');
        const erroMsg = document.getElementById('onboarding-erro');
        const slugNova = input.value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');

        if (!slugNova) {
            erroMsg.innerText = "Insira um nome válido (apenas letras e números)!";
            return;
        }

        try {
            await updateDoc(doc(db, "usuarios", usuarioAtualUid), { urlLoja: slugNova });
            overlay.remove();
            window.location.href = `dashboard.html?loja=${slugNova}`;
        } catch (err) {
            erroMsg.innerText = "Erro ao registrar: " + err.message;
        }
    });
}

// MONITORAMENTO DA SESSÃO DO FIREBASE
onAuthStateChanged(auth, async (user) => {
    if (user) {
        usuarioAtualUid = user.uid;
        
        // Garante que os botões só comecem a escutar cliques após o HTML estar pronto
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () => {
                inicializarNavegacaoEAbas();
                verificarEAutenticarRota(user.uid);
            });
        } else {
            inicializarNavegacaoEAbas();
            verificarEAutenticarRota(user.uid);
        }
    } else {
        window.location.href = 'login.html';
    }
});

async function verificarEAutenticarRota(uid) {
    try {
        const userDoc = await getDoc(doc(db, "usuarios", uid));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            const slugSalvo = userData.urlLoja || "";

            if (!slugSalvo) {
                abrirMagoOnboarding();
                return;
            }

            if (slugSalvo && lojaParamAtual !== slugSalvo) {
                window.location.href = `dashboard.html?loja=${slugSalvo}`;
                return;
            }

            const btnMinhaLoja = document.getElementById('sb-minhaloja');
            if (btnMinhaLoja) btnMinhaLoja.setAttribute('href', `https://videdigital.github.io/vide-digital/?loja=${slugSalvo}`);
            
            const slugInput = document.getElementById('slug-input');
            if (slugInput) slugInput.value = slugSalvo;
            
            exibirLinksGeradosNoPerfil(slugSalvo);

            if (document.getElementById('input-pixel-facebook')) {
                document.getElementById('input-pixel-facebook').value = userData.pixelFacebook || "";
            }
            if (document.getElementById('input-tag-google')) {
                document.getElementById('input-tag-google').value = userData.tagGoogle || "";
            }
        }
    } catch (error) {
        console.error("Erro ao ler dados da sessão segura:", error);
    }
}
