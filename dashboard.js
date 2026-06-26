import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, updateDoc, collection, addDoc, getDocs, query, where, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let usuarioAtualUid = null;
let fotoBase64Armazenada = ""; 
const urlParams = new URLSearchParams(window.location.search);
const lojaParamAtual = urlParams.get('loja');

// Escuta upload local de foto e transforma em string Base64 compacta
document.getElementById('prod-file-upload')?.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onloadend = function() {
            fotoBase64Armazenada = reader.result;
            console.log("[Painel Vide] Imagem local carregada com sucesso.");
        }
        reader.readAsDataURL(file);
    }
});

// Sistema SPA de Abas
function gerenciarAbasPainel() {
    const menuItems = document.querySelectorAll('.menu-item');
    const sections = document.querySelectorAll('.app-section');
    menuItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const target = item.getAttribute('data-target');
            menuItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            sections.forEach(sec => {
                sec.style.display = (sec.id === target) ? 'block' : 'none';
            });
        });
    });
}

function exibirLinksGeradosNoPerfil(slug) {
    const statusMsg = document.getElementById('status-msg');
    if (!statusMsg) return;
    statusMsg.innerHTML = `
        <div style="margin-top: 25px; padding: 20px; background-color: #161616; border: 1px solid #222; border-left: 4px solid #00bcd4; border-radius: 8px;">
            <p style="color: #4caf50; font-weight: bold; margin-bottom: 15px;">🔮 Links da sua infraestrutura:</p>
            <div style="margin-bottom: 12px;">
                <span style="font-size:11px; color:#888; display:block; font-weight:bold;">🌐 LINK PÚBLICO DA VITRINE:</span>
                <a href="https://videdigital.github.io/vide-digital/?loja=${slug}" target="_blank" style="color:#00bcd4; font-size:13px; text-decoration:none;">
                    https://videdigital.github.io/vide-digital/?loja=${slug}
                </a>
            </div>
            <div>
                <span style="font-size:11px; color:#888; display:block; font-weight:bold;">🔑 LINK INTERNO ADMINISTRATIVO:</span>
                <a href="https://videdigital.github.io/vide-digital/dashboard.html?loja=${slug}" target="_blank" style="color:#ff9800; font-size:13px; text-decoration:none;">
                    https://videdigital.github.io/vide-digital/dashboard.html?loja=${slug}
                </a>
            </div>
        </div>
    `;
}

// Carregar e Listar com Ações CRUD
async function carregarProdutosDoBanco(uid) {
    const container = document.getElementById('container-produtos-lista');
    const contador = document.getElementById('dash-qtd-produtos');
    if (!container) return;

    try {
        const q = query(collection(db, "produtos"), where("userId", "==", uid));
        const snap = await getDocs(q);
        
        if (snap.empty) {
            container.innerHTML = `<div style="color:#666; font-size:14px; padding:20px 0;">Nenhum produto cadastrado nesta loja ainda.</div>`;
            if (contador) contador.innerText = "0";
            return;
        }

        if (contador) contador.innerText = snap.size;

        let html = `<div class="products-grid">`;
        snap.forEach((doc) => {
            const p = doc.data();
            const id = doc.id;
            const img = p.imagem || 'https://via.placeholder.com/150';
            const parc = p.parcelamento || '';

            html += `
                <div class="product-item-card">
                    <img src="${img}">
                    <h4>${p.nome}</h4>
                    <p class="price">R$ ${p.preco}</p>
                    <p class="installment">${parc}</p>
                    <div class="product-actions">
                        <button class="btn-edit" data-id="${id}">Editar</button>
                        <button class="btn-delete" data-id="${id}">Excluir</button>
                    </div>
                </div>
            `;
        });
        html += `</div>`;
        container.innerHTML = html;

        // Injeta os gatilhos dos botões dinâmicos de Editar e Deletar
         VincularAcoesProdutos();

    } catch (e) {
        console.error(e);
    }
}

function VincularAcoesProdutos() {
    document.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            abrirModalParaEdicao(id);
        });
    });

    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (confirm("Tem certeza que deseja apagar permanentemente este produto?")) {
                const id = btn.getAttribute('data-id');
                await deleteDoc(doc(db, "produtos", id));
                carregarProdutosDoBanco(usuarioAtualUid);
            }
        });
    });
}

// Abrir Modal em Modo Edição
async function abrirModalParaEdicao(id) {
    const modal = document.getElementById('modal-produto');
    try {
        const snap = await getDoc(doc(db, "produtos", id));
        if (snap.exists()) {
            const p = snap.data();
            document.getElementById('modal-titulo').innerText = "📝 Editar Produto";
            document.getElementById('prod-id-edicao').value = id;
            document.getElementById('prod-nome').value = p.nome || "";
            document.getElementById('prod-preco').value = p.preco || "";
            document.getElementById('prod-parcelamento').value = p.parcelamento || "";
            document.getElementById('prod-descricao').value = p.descricao || "";
            document.getElementById('prod-img').value = p.imagem && !p.imagem.startsWith("data:") ? p.imagem : "";
            document.getElementById('prod-tipo-botao').value = p.tipoBotao || "checkout";
            document.getElementById('prod-link').value = p.linkCompra || "";
            
            fotoBase64Armazenada = p.imagem && p.imagem.startsWith("data:") ? p.imagem : "";
            modal.style.display = 'flex';
        }
    } catch (e) { console.error(e); }
}

// Gerenciamento e Escrita do Form de Produtos (Criar / Atualizar)
function gerenciarModalProduto() {
    const modal = document.getElementById('modal-produto');
    
    document.getElementById('btn-abrir-modal-prod')?.addEventListener('click', () => {
        document.getElementById('modal-titulo').innerText = "📦 Cadastrar Novo Produto";
        document.getElementById('prod-id-edicao').value = "";
        document.getElementById('prod-nome').value = "";
        document.getElementById('prod-preco').value = "";
        document.getElementById('prod-parcelamento').value = "";
        document.getElementById('prod-descricao').value = "";
        document.getElementById('prod-img').value = "";
        document.getElementById('prod-link').value = "";
        fotoBase64Armazenada = "";
        modal.style.display = 'flex';
    });

    document.getElementById('btn-cancelar-prod')?.addEventListener('click', () => modal.style.display = 'none');

    document.getElementById('btn-salvar-prod-db')?.addEventListener('click', async () => {
        const idEdicao = document.getElementById('prod-id-edicao').value;
        const nome = document.getElementById('prod-nome').value.trim();
        const preco = document.getElementById('prod-preco').value.trim();
        const parcelamento = document.getElementById('prod-parcelamento').value.trim();
        const descricao = document.getElementById('prod-descricao').value.trim();
        const urlImg = document.getElementById('prod-img').value.trim();
        const tipoBotao = document.getElementById('prod-tipo-botao').value;
        const linkCompra = document.getElementById('prod-link').value.trim();

        if (!nome || !preco) { alert("Nome e Preço são campos obrigatórios."); return; }

        // Decide se usa a foto que subiu do PC ou a URL digitada
        const imagemFinal = fotoBase64Armazenada || urlImg;

        const dadosProduto = {
            userId: usuarioAtualUid,
            nome, preco, parcelamento, descricao, tipoBotao, linkCompra,
            imagem: imagemFinal,
            dataAlteracao: new Date().toISOString()
        };

        try {
            if (idEdicao) {
                // Modo Atualizar Existente
                await updateDoc(doc(db, "produtos", idEdicao), dadosProduto);
            } else {
                // Modo Cadastrar Novo
                await addDoc(collection(db, "produtos"), dadosProduto);
            }
            modal.style.display = 'none';
            carregarProdutosDoBanco(usuarioAtualUid);
        } catch (e) { alert("Erro ao processar dados: " + e.message); }
    });
}

// Escuta de Ações Adicionais (Pixels e Slugs)
function configurarAcoesAdicionais() {
    document.getElementById('btn-salvar-pixels')?.addEventListener('click', async () => {
        const fb = document.getElementById('input-pixel-facebook').value.trim();
        const gg = document.getElementById('input-tag-google').value.trim();
        await updateDoc(doc(db, "usuarios", usuarioAtualUid), { pixelFacebook: fb, tagGoogle: gg });
        alert("Configurações de Pixel salvas!");
    });

    document.getElementById('btn-salvar-slug')?.addEventListener('click', async () => {
        const input = document.getElementById('slug-input');
        const novoSlug = input.value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
        if (!novoSlug) return;
        await updateDoc(doc(db, "usuarios", usuarioAtualUid), { urlLoja: novoSlug });
        exibirLinksGeradosNoPerfil(novoSlug);
        alert("Link comercial atualizado com sucesso!");
    });

    document.getElementById('btn-logout')?.addEventListener('click', () => {
        signOut(auth).then(() => { window.location.href = 'login.html'; });
    });
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        usuarioAtualUid = user.uid;
        gerenciarAbasPainel();
        gerenciarModalProduto();
        configurarAcoesAdicionais();
        
        const docSnap = await getDoc(doc(db, "usuarios", user.uid));
        if (docSnap.exists()) {
            const d = docSnap.data();
            const slug = d.urlLoja || "";
            if (slug && lojaParamAtual !== slug) {
                window.location.href = `dashboard.html?loja=${slug}`;
                return;
            }
            document.getElementById('slug-input').value = slug;
            document.getElementById('sb-minhaloja')?.setAttribute('href', `https://videdigital.github.io/vide-digital/?loja=${slug}`);
            document.getElementById('input-pixel-facebook').value = d.pixelFacebook || "";
            document.getElementById('input-tag-google').value = d.tagGoogle || "";
            
            exibirLinksGeradosNoPerfil(slug);
            carregarProdutosDoBanco(user.uid);
        }
    } else {
        window.location.href = 'login.html';
    }
});
