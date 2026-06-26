import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, updateDoc, collection, addDoc, getDocs, query, where, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let usuarioAtualUid = null;
let fotoBase64Armazenada = ""; 
let filtroNichoAtual = "todos";
const urlParams = new URLSearchParams(window.location.search);
const lojaParamAtual = urlParams.get('loja');

// Trava e Máscara Monetária Automática nos inputs de preço
document.querySelectorAll('.numeric-mask').forEach(input => {
    input.addEventListener('input', function(e) {
        let value = e.target.value.replace(/\D/g, "");
        if (value === "") { e.target.value = ""; return; }
        value = (parseInt(value) / 100).toFixed(2);
        e.target.value = value.replace(".", ",");
    });
});

// Listener do Seletor de Parcelas
document.getElementById('prod-parc-select')?.addEventListener('change', function(e) {
    const container = document.getElementById('parc-custom-val-container');
    const input = document.getElementById('prod-parcelamento');
    if (e.target.value === "custom" || e.target.value.includes("x")) {
        container.style.display = "block";
        if (e.target.value !== "custom") {
            input.placeholder = `Ex: ${e.target.value} de R$ 9,90`;
        }
    } else {
        container.style.display = "none";
        input.value = "";
    }
});

// Controladores dos botões de CTA (Estilo image_2829bb.png)
document.querySelectorAll('.btn-cta-toggle').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.btn-cta-toggle').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        const tipo = this.getAttribute('data-type');
        document.getElementById('prod-tipo-botao').value = tipo;
        
        const label = document.getElementById('label-link-dinamico');
        const input = document.getElementById('prod-link');
        if (tipo === "whatsapp") {
            label.innerText = "Número do WhatsApp do Suporte (Com DDD)";
            input.placeholder = "Ex: 11999999999";
        } else {
            label.innerText = "Link Principal de Destino (Checkout / Página)";
            input.placeholder = "https://checkout.kiwify.com.br/...";
        }
    });
});

// Atualização de feedback visual para upload local de arquivos
document.getElementById('prod-file-upload')?.addEventListener('change', function(e) {
    const file = e.target.files[0];
    const textLabel = document.getElementById('upload-filename-text');
    if (file) {
        if (textLabel) textLabel.innerText = file.name;
        const reader = new FileReader();
        reader.onloadend = function() {
            fotoBase64Armazenada = reader.result;
        }
        reader.readAsDataURL(file);
    }
});

// Filtro de Nichos em tempo real (Estilo image_282c9f.png)
document.querySelectorAll('.niche-tab').forEach(tab => {
    tab.addEventListener('click', function() {
        document.querySelectorAll('.niche-tab').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        filtroNichoAtual = this.getAttribute('data-niche');
        if (usuarioAtualUid) carregarProdutosDoBanco(usuarioAtualUid);
    });
});

// Sistema SPA de Abas Laterais
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
        </div>
    `;
}

async function carregarProdutosDoBanco(uid) {
    const container = document.getElementById('container-produtos-lista');
    const contador = document.getElementById('dash-qtd-produtos');
    if (!container) return;

    try {
        let q = query(collection(db, "produtos"), where("userId", "==", uid));
        if (filtroNichoAtual !== "todos") {
            q = query(collection(db, "produtos"), where("userId", "==", uid), where("nicho", "==", filtroNichoAtual));
        }
        
        const snap = await getDocs(q);
        if (snap.empty) {
            container.innerHTML = `<div style="color:#666; font-size:14px; padding:20px 0;">Nenhum produto encontrado nesta categoria.</div>`;
            if (contador && filtroNichoAtual === "todos") contador.innerText = "0";
            return;
        }

        if (contador && filtroNichoAtual === "todos") contador.innerText = snap.size;

        let html = `<div class="products-grid">`;
        snap.forEach((doc) => {
            const p = doc.data();
            const id = doc.id;
            const img = p.imagem || 'https://via.placeholder.com/150';
            const badgeClass = p.nicho === 'fisico' ? 'badge fisico' : 'badge digital';
            const badgeLabel = p.nicho === 'fisico' ? '📦 Físico' : '⚡ Digital';
            
            // Tratamento exibição parcelas
            let exibirParc = "";
            if (p.parcelamento) {
                exibirParc = p.parcelamento;
            } else if (p.condicaoParcelas && p.condicaoParcelas !== "Sem parcelamento") {
                exibirParc = p.condicaoParcelas;
            }

            html += `
                <div class="product-item-card">
                    <img src="${img}">
                    <span class="${badgeClass}">${badgeLabel}</span>
                    <h4>${p.nome}</h4>
                    <p class="price">R$ ${p.preco}</p>
                    <p style="color:#666; font-size:11px; margin-bottom:12px;">${exibirParc}</p>
                    <div class="product-actions">
                        <button class="btn-edit" data-id="${id}">📝 Gerenciar Oferta</button>
                        <button class="btn-delete" data-id="${id}">🗑️</button>
                    </div>
                </div>
            `;
        });
        html += `</div>`;
        container.innerHTML = html;

        document.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', () => abrirModalParaEdicao(btn.getAttribute('data-id')));
        });

        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (confirm("Remover este produto permanentemente?")) {
                    await deleteDoc(doc(db, "produtos", btn.getAttribute('data-id')));
                    carregarProdutosDoBanco(usuarioAtualUid);
                }
            });
        });

    } catch (e) { console.error(e); }
}

async function abrirModalParaEdicao(id) {
    const modal = document.getElementById('modal-produto');
    try {
        const snap = await getDoc(doc(db, "produtos", id));
        if (snap.exists()) {
            const p = snap.data();
            document.getElementById('modal-titulo').innerText = "📝 Editar Produto";
            document.getElementById('prod-id-edicao').value = id;
            document.getElementById('prod-niche-type').value = p.nicho || "digital";
            document.getElementById('prod-nome').value = p.nome || "";
            document.getElementById('prod-preco-de').value = p.precoDe || "";
            document.getElementById('prod-preco').value = p.preco || "";
            
            const condParc = p.condicaoParcelas || "Sem parcelamento";
            document.getElementById('prod-parc-select').value = condParc;
            if(condParc !== "Sem parcelamento") {
                document.getElementById('parc-custom-val-container').style.display = "block";
                document.getElementById('prod-parcelamento').value = p.parcelamento || "";
            } else {
                document.getElementById('parc-custom-val-container').style.display = "none";
            }

            document.getElementById('prod-descricao').value = p.descricao || "";
            document.getElementById('prod-img').value = p.imagem && !p.imagem.startsWith("data:") ? p.imagem : "";
            
            // Toggle do CTA
            const tBotao = p.tipoBotao || "checkout";
            document.getElementById('prod-tipo-botao').value = tBotao;
            document.querySelectorAll('.btn-cta-toggle').forEach(b => {
                b.classList.toggle('active', b.getAttribute('data-type') === tBotao);
            });

            document.getElementById('prod-link').value = p.linkCompra || "";
            document.getElementById('upload-filename-text').innerText = p.imagem && p.imagem.startsWith("data:") ? "Imagem local salva" : "Nenhum arquivo selecionado";
            fotoBase64Armazenada = p.imagem && p.imagem.startsWith("data:") ? p.imagem : "";
            
            modal.style.display = 'flex';
        }
    } catch (e) { console.error(e); }
}

function gerenciarModalProduto() {
    const modal = document.getElementById('modal-produto');
    
    document.getElementById('btn-abrir-modal-prod')?.addEventListener('click', () => {
        document.getElementById('modal-titulo').innerText = "📦 Cadastrar Novo Produto";
        document.getElementById('prod-id-edicao').value = "";
        document.getElementById('prod-nome').value = "";
        document.getElementById('prod-preco-de').value = "";
        document.getElementById('prod-preco').value = "";
        document.getElementById('prod-parc-select').value = "Sem parcelamento";
        document.getElementById('parc-custom-val-container').style.display = "none";
        document.getElementById('prod-parcelamento').value = "";
        document.getElementById('prod-descricao').value = "";
        document.getElementById('prod-img').value = "";
        document.getElementById('prod-link').value = "";
        document.getElementById('upload-filename-text').innerText = "Nenhum arquivo selecionado";
        fotoBase64Armazenada = "";
        modal.style.display = 'flex';
    });

    document.getElementById('btn-cancelar-prod')?.addEventListener('click', () => modal.style.display = 'none');

    document.getElementById('btn-salvar-prod-db')?.addEventListener('click', async () => {
        const idEdicao = document.getElementById('prod-id-edicao').value;
        const nicho = document.getElementById('prod-niche-type').value;
        const nome = document.getElementById('prod-nome').value.trim();
        const precoDe = document.getElementById('prod-preco-de').value.trim();
        const preco = document.getElementById('prod-preco').value.trim();
        const condicaoParcelas = document.getElementById('prod-parc-select').value;
        const parcelamento = document.getElementById('prod-parcelamento').value.trim();
        const descricao = document.getElementById('prod-descricao').value.trim();
        const urlImg = document.getElementById('prod-img').value.trim();
        const tipoBotao = document.getElementById('prod-tipo-botao').value;
        const linkCompra = document.getElementById('prod-link').value.trim();

        if (!nome || !preco) { alert("Nome e Preço Atual são campos obrigatórios."); return; }

        const dadosProduto = {
            userId: usuarioAtualUid,
            nicho, nome, precoDe, preco, condicaoParcelas, parcelamento, descricao, tipoBotao, linkCompra,
            imagem: fotoBase64Armazenada || urlImg,
            dataAlteracao: new Date().toISOString()
        };

        try {
            if (idEdicao) {
                await updateDoc(doc(db, "produtos", idEdicao), dadosProduto);
            } else {
                await addDoc(collection(db, "produtos"), dadosProduto);
            }
            modal.style.display = 'none';
            carregarProdutosDoBanco(usuarioAtualUid);
        } catch (e) { alert("Erro: " + e.message); }
    });
}

function configurarAcoesAdicionais() {
    document.getElementById('btn-salvar-pixels')?.addEventListener('click', async () => {
        await updateDoc(doc(db, "usuarios", usuarioAtualUid), {
            pixelFacebook: document.getElementById('input-pixel-facebook').value.trim(),
            tagGoogle: document.getElementById('input-tag-google').value.trim()
        });
        alert("Configurações salvas!");
    });

    document.getElementById('btn-salvar-slug')?.addEventListener('click', async () => {
        const novoSlug = document.getElementById('slug-input').value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
        await updateDoc(doc(db, "usuarios", usuarioAtualUid), { urlLoja: novoSlug });
        exibirLinksGeradosNoPerfil(novoSlug);
        alert("Link comercial atualizado!");
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
    } else { window.location.href = 'login.html'; }
});
