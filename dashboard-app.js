import { auth, db } from "./firebase-init.js";
import { VideHubContext, VidePlanService, normalizeModuleKey } from "./core/vide-context.js";
import { VideFunctions } from "./core/vide-functions.js";

// Se a página voltar da memória do navegador (botão Avançar/Voltar), força recarregar
// de verdade, pra sempre revalidar login/inatividade em vez de mostrar a versão congelada.
window.addEventListener("pageshow", function(event) {
    if (event.persisted) window.location.reload();
});

(async function carregarTemaSistemaCedo() {
    try {
        const snap = await getDoc(doc(db, "config", "tema_sistema"));
        if (!snap.exists()) return;
        const t = snap.data();
        const root = document.documentElement;
        if (t.primaria) root.style.setProperty("--sys-primaria", t.primaria);
        if (t.destaque) root.style.setProperty("--sys-destaque", t.destaque);
        if (t.fundo) root.style.setProperty("--sys-fundo", t.fundo);
        if (t.texto) root.style.setProperty("--sys-texto", t.texto);
    } catch(err) { console.error(err); }
})();
        import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
        import { collection, doc, getDoc, getDocs, setDoc, deleteDoc, query, where, or } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

        let usuarioEmail = "";
        let usuarioUID = "";
        let slugAtualSalvo = "";
        let tipoDestino = "checkout";
        let filtroLogistico = "todos";
        let planoAtualGlobal = "starter";
        let limiteProdutosGlobal = 3;
        let totalProdutosAtual = 0;
        let limiteRascunhosGlobal = 5;
        let totalRascunhosAtual = 0;
        let verRascunhos = false;
        let temFeature = feature => feature === "leads"; // fica atualizado de verdade assim que o plano carrega

        const produtosContainer = document.getElementById("produtos-container");
        const modal = document.getElementById("produto-modal");
        const form = document.getElementById("produto-form");
        const modalTitulo = document.getElementById("modal-titulo");
        const btnDeletar = document.getElementById("btn-deletar-produto");

        const tabCheckout = document.getElementById("tab-checkout");
        const tabWhatsapp = document.getElementById("tab-whatsapp");
        const wrapperCheckout = document.getElementById("wrapper-checkout");
        const wrapperWhatsapp = document.getElementById("wrapper-whatsapp");
        const inputCheckout = document.getElementById("prod-checkout");
        const inputWhatsapp = document.getElementById("prod-whatsapp");
        const inputImagemFile = document.getElementById("prod-imagem-file");
        const inputImagemBase64 = document.getElementById("prod-imagem-base64");

        // ENGINE INTELIGENTE DE DETECÇÃO DE CONTRASTE E BRILHO HEX
        function verificarContrasteFundo(hexColor) {
            const hex = hexColor.replace('#', '');
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);
            const brilho = (r * 299 + g * 587 + b * 114) / 1000;

            const bodyEl = document.getElementById("admin-body");
            if (brilho > 175) {
                bodyEl.classList.add("tema-claro");
            } else {
                bodyEl.classList.remove("tema-claro");
            }
        }

        // RESPONSIVIDADE MOBILE: TOGGLE SIDEBAR MENU
        document.getElementById("mobile-menu-toggle").addEventListener("click", () => {
            document.getElementById("sidebar-nav").classList.toggle("hidden");
            document.getElementById("box-atalho").classList.toggle("hidden");
            document.getElementById("box-logout").classList.toggle("hidden");
        });

        function ativarBannerModoMaster(nomeLoja) {
            document.getElementById("banner-master-nome-loja").innerText = nomeLoja;
            const banner = document.getElementById("banner-modo-master");
            banner.classList.remove("hidden");

            function ajustarEspacoBanner() {
                document.body.style.paddingTop = banner.offsetHeight + "px";
            }
            ajustarEspacoBanner();
            window.addEventListener("resize", ajustarEspacoBanner);
        }

        // =============================================
        // TROCAR DE LOJA (só disponível em Modo Master)
        // =============================================
        let _cacheClientesTrocarLoja = null;

        window.abrirTrocarLoja = async function() {
            document.getElementById("modal-trocar-loja").classList.remove("hidden");
            const box = document.getElementById("lista-trocar-loja");
            if (!_cacheClientesTrocarLoja) {
                try {
                    const snap = await getDocs(collection(db, "usuarios"));
                    _cacheClientesTrocarLoja = [];
                    snap.forEach(d => _cacheClientesTrocarLoja.push({ uid: d.id, ...d.data() }));
                } catch (err) {
                    console.error(err);
                    box.innerHTML = `<p class="text-xs text-red-400 text-center py-6">Erro ao carregar clientes.</p>`;
                    return;
                }
            }
            renderizarListaTrocarLoja(_cacheClientesTrocarLoja);
        };

        window.fecharTrocarLoja = function() {
            document.getElementById("modal-trocar-loja").classList.add("hidden");
        };

        function renderizarListaTrocarLoja(lista) {
            const box = document.getElementById("lista-trocar-loja");
            if (lista.length === 0) {
                box.innerHTML = `<p class="text-xs text-gray-500 text-center py-6">Nenhum cliente encontrado.</p>`;
                return;
            }
            box.innerHTML = lista.map(u => `
                <button onclick="window.location.href='dashboard.html?masterUID=${u.uid}'" class="w-full text-left flex items-center justify-between gap-3 p-3 rounded-xl border border-white/5 hover:border-amber-500/30 hover:bg-amber-500/5 transition-all">
                    <div class="min-w-0">
                        <p class="text-xs font-bold text-white truncate">${u.nomeLoja || u.nome || "Sem nome"}</p>
                        <p class="text-xs text-violet-300/70 truncate tracking-wide">${u.email || ""}</p>
                    </div>
                    <span class="text-[9px] font-bold px-2 py-0.5 rounded-md uppercase shrink-0 ${u.status === "aprovado" ? "bg-emerald-500/10 text-emerald-400" : "bg-gray-500/10 text-gray-400"}">${u.status || "pendente"}</span>
                </button>
            `).join("");
        }

        document.getElementById("busca-trocar-loja").addEventListener("input", (e) => {
            if (!_cacheClientesTrocarLoja) return;
            const termo = e.target.value.trim().toLowerCase();
            const filtrados = _cacheClientesTrocarLoja.filter(u =>
                (u.nomeLoja || "").toLowerCase().includes(termo) ||
                (u.nome || "").toLowerCase().includes(termo) ||
                (u.email || "").toLowerCase().includes(termo)
            );
            renderizarListaTrocarLoja(filtrados);
        });

        // =============================================
        // GUIA DO PLANO (conteúdo real, só das funções que já existem)
        // =============================================
        const NOMES_PLANO_GUIA = {
            starter: "Starter", basico: "Básico", essencial: "Essencial", negocio: "Negócio",
            profissional: "Profissional", avancado: "Avançado", pro: "Pro", proplus: "Pro+",
            agencia: "Agência", enterprise: "Enterprise", premium: "Premium"
        };

        const GUIA_CONTEUDO = [
            { chave: "hub", icone: "🏪", titulo: "Loja & Visão Geral",
              acessar: "Aba \"Visão Geral\", sempre no topo do menu.",
              usar: ["Clique em \"Adicionar Produto\" pra cadastrar um item novo.", "Edite cores, fontes e textos em \"Configurações da Loja\".", "Compartilhe o link da sua loja (vide.digital/seu-slug) nas redes."],
              dicas: ["Preencha todos os campos do produto (garantia, avaliação, frete grátis) — isso aumenta a confiança de quem visita.", "Use fotos nítidas e com boa luz; é o que mais influencia a decisão de compra."] },
            { chave: "popup", icone: "🎁", titulo: "Pop-up de Captura de Leads",
              acessar: "Ativa sozinho na loja, depois de 15 segundos ou quando o visitante tenta sair da página.",
              usar: ["Os contatos capturados aparecem na aba \"Leads (Capturas)\".", "Cada lead mostra de onde a pessoa veio (Meta Ads, Google, direto, etc.)."],
              dicas: ["Responda rápido — um lead esfria em poucas horas.", "Use os Templates de Mensagens pra agilizar o primeiro contato."] },
            { chave: "carrinho", icone: "🛒", titulo: "Carrinho de Compras",
              acessar: "Ative em Configurações da Loja → \"Carrinho de Compras\".",
              usar: ["Depois de ativar, marque \"Permitir adicionar ao Carrinho\" em cada produto que quiser incluir.", "O cliente monta o carrinho e fecha tudo de uma vez pelo seu WhatsApp."],
              dicas: ["Personalize a mensagem de abertura do pedido pra soar mais natural e com a sua cara."] },
            { chave: "chat", icone: "💬", titulo: "Chat ao Vivo",
              acessar: "Ative em Configurações da Loja → \"Chat ao Vivo\" e cadastre o número.",
              usar: ["Aparece como um balão flutuante na sua loja.", "Se ninguém responder em 30 segundos, o sistema já redireciona o cliente pro seu WhatsApp sozinho."],
              dicas: ["Mesmo com o redirecionamento automático, responder rápido no chat converte muito mais que perder o cliente pro WhatsApp frio."] },
            { chave: "templates", icone: "📋", titulo: "Templates de Mensagens",
              acessar: "Aba \"Templates\", no menu lateral.",
              usar: ["Crie mensagens prontas por categoria (vendas, suporte, follow-up, cobrança).", "Use {nome} dentro do texto — o sistema troca automaticamente pelo nome do lead."],
              dicas: ["Tenha pelo menos um template pra cada etapa da conversa: primeiro contato, follow-up de 24h, e fechamento."] },
            { chave: "cupons", icone: "🎟️", titulo: "Cupons Automáticos",
              acessar: "Dentro de cada produto, na hora de cadastrar/editar, ative \"Cupom de Desconto Automático\".",
              usar: ["O desconto aparece já aplicado na loja — o cliente não digita nenhum código.", "Dá pra colocar uma data de validade opcional."],
              dicas: ["Cupons com prazo curto (24-48h) criam mais urgência do que cupons sem data."] },
            { chave: "campanhas", icone: "⚡", titulo: "Campanhas & Ofertas Relâmpago",
              acessar: "Aba \"Campanhas\", no menu lateral.",
              usar: ["Configure título, texto e um contador regressivo.", "Aparece como pop-up pra quem visita sua loja enquanto estiver ativa."],
              dicas: ["Campanhas curtas (10 a 30 minutos) funcionam melhor pra gerar urgência real — campanhas muito longas perdem o efeito."] },
            { chave: "metricas", icone: "📊", titulo: "Métricas & Performance",
              acessar: "Aba \"Métricas\", no menu lateral.",
              usar: ["Acompanhe sessões, cliques, taxa de conversão e tempo médio na loja, com filtro de data.", "Veja quais produtos são mais vistos e mais clicados."],
              dicas: ["Se a conversão cair numa semana, olhe primeiro o preço e as fotos dos produtos mais vistos — geralmente é aí que está o problema."] },
            { chave: "csv", icone: "📥", titulo: "Exportar Leads (CSV)",
              acessar: "Aba \"Leads (Capturas)\" → botão \"📥 Exportar CSV\".",
              usar: ["Baixa todos os leads filtrados numa planilha."],
              dicas: ["Útil pra importar em ferramentas de disparo — mas sempre com cuidado pra não parecer spam."] },
            { chave: "temas", icone: "🎨", titulo: "Temas Prontos + Personalização",
              acessar: "Configurações da Loja → \"Controle de Aparência\".",
              usar: ["Escolha um dos temas prontos pra aplicar tudo de uma vez (cores + fonte).", "Depois é só ajustar qualquer cor individualmente antes de salvar."],
              dicas: ["Escolha um tema que combine com seu nicho — ex: Confeitaria Rosa pra doces, Barbearia Clássica pra barbearias."] },

{ chave: "leads", icone: "⚡", titulo: "Automação de Leads",

acessar: "Aba \"Automação de Leads\", no menu lateral.",

usar: ["Filtre leads por data, status, origem ou anotação.", "Selecione vários leads de uma vez pra mudar status, adicionar anotação em massa ou excluir permanentemente."],

dicas: ["Use os filtros pra separar leads \"Novo\" toda semana e priorizar quem ainda não foi contatado."] },

{ chave: "subcontas", icone: "🧑‍🤝‍🧑", titulo: "Funcionários",
acessar: "Aba \"Funcionários\", no menu lateral.",
usar: ["Adicione pessoas da sua equipe com acesso ao painel, definindo o que cada uma pode ver e fazer."],
dicas: ["Dê só as permissões que a pessoa realmente precisa pro trabalho dela — evita erro e mantém o controle."] },
{ chave: "lp", icone: "🖥️", titulo: "Landing Pages",
acessar: "Aba \"Landing Pages\", no menu lateral.",
usar: ["Clique em \"+ Nova LP\" pra criar uma pagina com titulo e endereco proprios.", "Publique quando estiver pronta pra gerar o link de verdade, ou deixe como rascunho enquanto ajusta."],
dicas: ["Use uma Landing Page focada numa unica oferta ou campanha — paginas com foco unico convertem mais que a loja inteira."] }
];

        const FEATURES_EM_BREVE_GUIA = [
            { chave: "chatbot", icone: "🤖", titulo: "Chatbot com Fluxo" },
            { chave: "ia", icone: "✨", titulo: "IA no Atendimento" },
            { chave: "avaliacoes", icone: "⭐", titulo: "Avaliações de Clientes" },
            { chave: "agenda", icone: "📅", titulo: "Agenda de Reservas" },
            { chave: "api", icone: "🔌", titulo: "API Própria" },
            { chave: "relatorios", icone: "📈", titulo: "Relatórios Avançados" },
            { chave: "dominio", icone: "🌐", titulo: "Domínio Próprio" }
        ];

        function obterIconeGuia(chave) {

            const icones = {

                hub: `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M3 10.5 12 4l9 6.5"></path>
                        <path d="M5 9.5V20h14V9.5"></path>
                        <path d="M9 20v-6h6v6"></path>
                    </svg>
                `,

                popup: `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <rect x="3" y="5" width="18" height="14" rx="3"></rect>
                        <path d="M8 9h8"></path>
                        <path d="M8 13h5"></path>
                    </svg>
                `,

                carrinho: `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M3 4h2l2 11h10l3-8H6"></path>
                        <circle cx="9" cy="19" r="1.5"></circle>
                        <circle cx="17" cy="19" r="1.5"></circle>
                    </svg>
                `,

                chat: `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M21 12a8 8 0 0 1-8 8H6l-4 2 1.4-4.2A8 8 0 1 1 21 12Z"></path>
                        <path d="M8 12h.01"></path>
                        <path d="M12 12h.01"></path>
                        <path d="M16 12h.01"></path>
                    </svg>
                `,

                templates: `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M6 3h9l3 3v15H6z"></path>
                        <path d="M14 3v4h4"></path>
                        <path d="M9 12h6"></path>
                        <path d="M9 16h6"></path>
                    </svg>
                `,

                cupons: `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M4 7a2 2 0 0 0 0 4v6h16v-6a2 2 0 0 0 0-4V4H4z"></path>
                        <path d="M12 7v2"></path>
                        <path d="M12 13v2"></path>
                    </svg>
                `,

                campanhas: `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M4 13V8l13-4v13L4 13Z"></path>
                        <path d="M8 13v6H5l-1-6"></path>
                        <path d="M19 8a3 3 0 0 1 0 5"></path>
                    </svg>
                `,

                metricas: `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M4 19V9"></path>
                        <path d="M10 19V5"></path>
                        <path d="M16 19v-7"></path>
                        <path d="M22 19V2"></path>
                    </svg>
                `,

                csv: `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M12 3v12"></path>
                        <path d="m7 10 5 5 5-5"></path>
                        <path d="M5 21h14"></path>
                    </svg>
                `,

                temas: `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 0-4H12a1.5 1.5 0 0 1 0-3h3a6 6 0 0 0 0-12h-3Z"></path>
                        <circle cx="7.5" cy="10" r=".7"></circle>
                        <circle cx="10" cy="7" r=".7"></circle>
                        <circle cx="14" cy="7" r=".7"></circle>
                    </svg>
                `,

                leads: `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M13 2 4 14h7l-1 8 10-13h-7z"></path>
                    </svg>
                `,

                subcontas: `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                        <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                `,

                lp: `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <rect x="3" y="4" width="18" height="13" rx="2"></rect>
                        <path d="M8 21h8"></path>
                        <path d="M12 17v4"></path>
                    </svg>
                `,

                chatbot: `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <rect x="4" y="7" width="16" height="12" rx="3"></rect>
                        <path d="M9 12h.01"></path>
                        <path d="M15 12h.01"></path>
                        <path d="M9 16h6"></path>
                        <path d="M12 3v4"></path>
                    </svg>
                `,

                ia: `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z"></path>
                        <path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"></path>
                    </svg>
                `,

                avaliacoes: `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"></path>
                    </svg>
                `,

                agenda: `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <rect x="3" y="5" width="18" height="16" rx="3"></rect>
                        <path d="M16 3v4"></path>
                        <path d="M8 3v4"></path>
                        <path d="M3 10h18"></path>
                    </svg>
                `,

                api: `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="m8 9-4 3 4 3"></path>
                        <path d="m16 9 4 3-4 3"></path>
                        <path d="m14 5-4 14"></path>
                    </svg>
                `,

                relatorios: `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M4 19V9"></path>
                        <path d="M10 19V5"></path>
                        <path d="M16 19v-7"></path>
                        <path d="M22 19V2"></path>
                    </svg>
                `,

                dominio: `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <circle cx="12" cy="12" r="9"></circle>
                        <path d="M3 12h18"></path>
                        <path d="M12 3a15 15 0 0 1 0 18"></path>
                        <path d="M12 3a15 15 0 0 0 0 18"></path>
                    </svg>
                `

            };

            return icones[chave] || `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <circle cx="12" cy="12" r="9"></circle>
                    <path d="M12 8v4"></path>
                    <path d="M12 16h.01"></path>
                </svg>
            `;

        }

        function renderizarGuiaDoPlano() {

            const nomePlano =
                NOMES_PLANO_GUIA[planoAtualGlobal] ||
                planoAtualGlobal ||
                "Plano atual";

            const nomeEl =
                document.getElementById("guia-nome-plano");

            if (nomeEl) {
                nomeEl.innerText = nomePlano;
            }

            const recursosLiberados =
                GUIA_CONTEUDO.filter(f => temFeature(f.chave)).length;

            const totalRecursos =
                GUIA_CONTEUDO.length;

            const percentualLiberado =
                totalRecursos > 0
                    ? Math.round((recursosLiberados / totalRecursos) * 100)
                    : 0;

            const liberadosEl =
                document.getElementById("guia-recursos-liberados");

            const totalEl =
                document.getElementById("guia-recursos-total");

            const progressoEl =
                document.getElementById("guia-progresso-plano");

            const emBreveCountEl =
                document.getElementById("guia-em-breve-count");

            if (liberadosEl) {
                liberadosEl.innerText = recursosLiberados;
            }

            if (totalEl) {
                totalEl.innerText = totalRecursos;
            }

            if (progressoEl) {
                progressoEl.style.width = `${percentualLiberado}%`;
            }

            if (emBreveCountEl) {
                emBreveCountEl.innerText = FEATURES_EM_BREVE_GUIA.length;
            }

            const box =
                document.getElementById("guia-conteudo");

            if (box) {

                box.innerHTML = GUIA_CONTEUDO.map(f => {

                    const liberado =
                        temFeature(f.chave);

                    if (!liberado) {

                        return `
                            <article class="glass-card aura-guide-feature-card is-locked">

                                <div class="aura-guide-feature-header">

                                    <span class="aura-guide-feature-icon">
                                        ${obterIconeGuia(f.chave)}
                                    </span>

                                    <div class="aura-guide-feature-title">

                                        <small>Recurso adicional</small>

                                        <h3>
                                            ${f.titulo}
                                        </h3>

                                    </div>

                                    <span class="aura-guide-feature-status">

                                        <svg viewBox="0 0 24 24"
                                             fill="none"
                                             stroke="currentColor">

                                            <rect x="5" y="10" width="14" height="11" rx="2"></rect>
                                            <path d="M8 10V7a4 4 0 0 1 8 0v3"></path>

                                        </svg>

                                        Planos superiores

                                    </span>

                                </div>

                                <p class="aura-guide-locked-message">
                                    Este recurso ainda não está disponível no seu plano atual.
                                </p>

                            </article>
                        `;

                    }

                    return `
                        <article class="glass-card aura-guide-feature-card is-available">

                            <div class="aura-guide-feature-header">

                                <span class="aura-guide-feature-icon">
                                    ${obterIconeGuia(f.chave)}
                                </span>

                                <div class="aura-guide-feature-title">

                                    <small>Recurso disponível</small>

                                    <h3>
                                        ${f.titulo}
                                    </h3>

                                </div>

                                <span class="aura-guide-feature-status">

                                    <i></i>

                                    Liberado no plano

                                </span>

                            </div>

                            <div class="aura-guide-feature-body">

                                <section class="aura-guide-instruction">

                                    <span class="aura-guide-instruction-icon">

                                        <svg viewBox="0 0 24 24"
                                             fill="none"
                                             stroke="currentColor">

                                            <path d="M4 12h14"></path>
                                            <path d="m13 7 5 5-5 5"></path>

                                        </svg>

                                    </span>

                                    <div>

                                        <strong>Como acessar</strong>

                                        <p>
                                            ${f.acessar}
                                        </p>

                                    </div>

                                </section>

                                <section class="aura-guide-instruction">

                                    <span class="aura-guide-instruction-icon">

                                        <svg viewBox="0 0 24 24"
                                             fill="none"
                                             stroke="currentColor">

                                            <path d="M9 11 12 14 22 4"></path>
                                            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>

                                        </svg>

                                    </span>

                                    <div>

                                        <strong>Como usar</strong>

                                        <ul>
                                            ${f.usar.map(u => `<li>${u}</li>`).join("")}
                                        </ul>

                                    </div>

                                </section>

                                <section class="aura-guide-tip">

                                    <span>

                                        <svg viewBox="0 0 24 24"
                                             fill="none"
                                             stroke="currentColor">

                                            <path d="M9 18h6"></path>
                                            <path d="M10 22h4"></path>
                                            <path d="M8.5 14.5A7 7 0 1 1 15.5 14.5C14.5 15.3 14 16 14 18h-4c0-2-.5-2.7-1.5-3.5Z"></path>

                                        </svg>

                                    </span>

                                    <div>

                                        <strong>Recomendação prática</strong>

                                        <ul>
                                            ${f.dicas.map(d => `<li>${d}</li>`).join("")}
                                        </ul>

                                    </div>

                                </section>

                            </div>

                        </article>
                    `;

                }).join("");

            }

            const boxEmBreve =
                document.getElementById("guia-em-breve");

            if (boxEmBreve) {

                boxEmBreve.innerHTML =
                    FEATURES_EM_BREVE_GUIA.map(f => `

                        <div class="aura-guide-coming-item">

                            <span class="aura-guide-coming-icon">
                                ${obterIconeGuia(f.chave)}
                            </span>

                            <div>

                                <strong>
                                    ${f.titulo}
                                </strong>

                                <span>
                                    Em desenvolvimento
                                </span>

                            </div>

                        </div>

                    `).join("");

            }

        }

        // =============================================
        // FUNCIONÁRIOS (Gestão de Acessos — Fase 1: cadastro + permissões)
        // =============================================
        const MODULOS_PERMISSAO = [
            { key: "produtos", label: "Produtos" },
            { key: "pedidos", label: "Pedidos" },
            { key: "leads", label: "Leads" },
            { key: "templates", label: "Templates" },
            { key: "campanhas", label: "Campanhas" },
            { key: "metricas", label: "Métricas" },
            { key: "configuracoes", label: "Configurações da Loja" },
            { key: "landing-pages", label: "Landing Pages / Studio" },
            { key: "funcionarios", label: "Funcionários" }
        ];

        async function carregarFuncionarios() {
            if (!usuarioUID) return;

            const box = document.getElementById("lista-funcionarios");
            if (!box) return;

            const totalElemento = document.getElementById("funcionario-total-count");
            const ativosElemento = document.getElementById("funcionario-active-count");
            const inativosElemento = document.getElementById("funcionario-inactive-count");

            try {
                const snap = await getDocs(
                    query(
                        collection(db, "funcionarios"),
                        where("donoUID", "==", usuarioUID)
                    )
                );

                let funcionarios = [];
                snap.forEach(d => funcionarios.push({ id: d.id, ...d.data() }));

                funcionarios.sort((a, b) => {
                    if (a.status === b.status) {
                        return (a.nome || "").localeCompare(b.nome || "", "pt-BR");
                    }

                    return a.status === "ativo" ? -1 : 1;
                });

                const ativos = funcionarios.filter(f => f.status === "ativo").length;
                const inativos = funcionarios.length - ativos;

                if (totalElemento) totalElemento.innerText = funcionarios.length;
                if (ativosElemento) ativosElemento.innerText = ativos;
                if (inativosElemento) inativosElemento.innerText = inativos;

                if (funcionarios.length === 0) {
                    box.innerHTML = `
                        <div class="aura-team-empty">
                            <span>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                                    <circle cx="9" cy="7" r="4"></circle>
                                    <path d="M19 8v6"></path>
                                    <path d="M16 11h6"></path>
                                </svg>
                            </span>

                            <strong>Nenhum funcionário cadastrado</strong>

                            <p>
                                Crie o primeiro acesso da sua equipe para começar a distribuir permissões.
                            </p>

                            <button onclick="abrirModalFuncionario()">
                                Adicionar funcionário
                            </button>
                        </div>
                    `;

                    return;
                }

                box.innerHTML = funcionarios.map(f => {
                    const permissoesVer = f.permissoes?.ver || [];
                    const permissoesEditar = f.permissoes?.editar || [];

                    const iniciais = (f.nome || "?")
                        .split(" ")
                        .filter(Boolean)
                        .slice(0, 2)
                        .map(parte => parte[0])
                        .join("")
                        .toUpperCase();

                    return `
                        <div class="aura-team-member ${f.status === "ativo" ? "is-active" : "is-inactive"}">

                            <div class="aura-team-member-profile">
                                <span class="aura-team-avatar">
                                    ${iniciais}
                                </span>

                                <div>
                                    <div class="aura-team-member-name">
                                        <strong>${f.nome || "Sem nome"}</strong>
                                        <span>${f.status === "ativo" ? "Ativo" : "Inativo"}</span>
                                    </div>

                                    <p>${f.email || "E-mail não informado"}</p>

                                    <small>
                                        ${f.cargo || "Cargo não informado"}
                                    </small>
                                </div>
                            </div>

                            <div class="aura-team-member-access">
                                <span>
                                    <strong>${permissoesVer.length}</strong>
                                    módulos visíveis
                                </span>

                                <span>
                                    <strong>${permissoesEditar.length}</strong>
                                    com edição
                                </span>
                            </div>

                            <div class="aura-team-member-actions">
                                <button
                                    onclick='abrirModalFuncionario(${JSON.stringify(f).replace(/'/g, "&apos;")})'
                                    class="aura-team-action-edit"
                                >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                        <path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z"></path>
                                        <path d="m13.5 6.5 4 4"></path>
                                    </svg>

                                    Editar
                                </button>

                                <button
                                    onclick="alternarStatusFuncionario('${f.id}', '${f.status}')"
                                    class="aura-team-action-status"
                                >
                                    ${f.status === "ativo" ? "Desativar" : "Ativar"}
                                </button>
                            </div>

                        </div>
                    `;
                }).join("");

            } catch (err) {
                console.error(err);

                if (totalElemento) totalElemento.innerText = "—";
                if (ativosElemento) ativosElemento.innerText = "—";
                if (inativosElemento) inativosElemento.innerText = "—";

                box.innerHTML = `
                    <div class="aura-team-error">
                        Não foi possível carregar os funcionários.
                    </div>
                `;
            }
        }

        function renderizarPermissoesGrid(permissoesAtuais) {
            const box = document.getElementById("funcionario-permissoes-grid");
            const ver = permissoesAtuais?.ver || [];
            const editar = permissoesAtuais?.editar || [];

            box.innerHTML = MODULOS_PERMISSAO.map(m => `
                <div class="aura-team-permission-row">

                    <span class="aura-team-permission-name">
                        ${m.label}
                    </span>

                    <div class="aura-team-permission-options">

                        <label>
                            <input
                                type="checkbox"
                                class="permissao-ver"
                                data-modulo="${m.key}"
                                ${ver.includes(m.key) ? "checked" : ""}
                            >

                            <span>Ver</span>
                        </label>

                        <label>
                            <input
                                type="checkbox"
                                class="permissao-editar"
                                data-modulo="${m.key}"
                                ${editar.includes(m.key) ? "checked" : ""}
                            >

                            <span>Editar</span>
                        </label>

                    </div>

                </div>
            `).join("");

            box.querySelectorAll(".permissao-editar").forEach(checkbox => {
                checkbox.addEventListener("change", () => {
                    if (!checkbox.checked) return;

                    const modulo = checkbox.getAttribute("data-modulo");

                    const permissaoVer = box.querySelector(
                        `.permissao-ver[data-modulo="${modulo}"]`
                    );

                    if (permissaoVer) {
                        permissaoVer.checked = true;
                    }
                });
            });
        }

        window.abrirModalFuncionario = function(funcionario) {
            document.getElementById("funcionario-modal").classList.remove("hidden");

            const inputSenha = document.getElementById("funcionario-senha");
            const botaoSenha = document.querySelector(".aura-team-password-toggle");

            if (inputSenha) {
                inputSenha.type = "password";
            }

            if (botaoSenha) {
                botaoSenha.classList.remove("is-visible");
                botaoSenha.setAttribute("aria-label", "Mostrar senha");
            }

            if (funcionario && funcionario.id) {
                document.getElementById("funcionario-modal-titulo").innerText = "Editar Funcionário";
                document.getElementById("funcionario-uid-edicao").value = funcionario.id;
                document.getElementById("funcionario-nome").value = funcionario.nome || "";
                document.getElementById("funcionario-email").value = funcionario.email || "";
                document.getElementById("funcionario-email").disabled = true;
                document.getElementById("funcionario-cargo").value = funcionario.cargo || "";
                document.getElementById("funcionario-senha-box").classList.add("hidden");
                renderizarPermissoesGrid(funcionario.permissoes);
            } else {
                document.getElementById("funcionario-modal-titulo").innerText = "Novo Funcionário";
                document.getElementById("funcionario-uid-edicao").value = "";
                document.getElementById("funcionario-nome").value = "";
                document.getElementById("funcionario-email").value = "";
                document.getElementById("funcionario-email").disabled = false;
                document.getElementById("funcionario-cargo").value = "";
                document.getElementById("funcionario-senha").value = "";
                document.getElementById("funcionario-senha-box").classList.remove("hidden");
                renderizarPermissoesGrid(null);
            }
        };

        window.fecharModalFuncionario = function() {
            document.getElementById("funcionario-modal").classList.add("hidden");
        };

        window.gerarSenhaAleatoria = function() {
            const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
            let senha = "";

            for (let i = 0; i < 10; i++) {
                senha += chars[Math.floor(Math.random() * chars.length)];
            }

            const input = document.getElementById("funcionario-senha");
            const botao = document.querySelector(".aura-team-password-toggle");

            input.value = senha;
            input.type = "text";

            if (botao) {
                botao.classList.add("is-visible");
                botao.setAttribute("aria-label", "Ocultar senha");
            }
        };

        window.alternarVisibilidadeSenhaFuncionario = function(botao) {
            const input = document.getElementById("funcionario-senha");

            if (!input) return;

            const mostrar = input.type === "password";

            input.type = mostrar ? "text" : "password";

            botao.classList.toggle("is-visible", mostrar);

            botao.setAttribute(
                "aria-label",
                mostrar ? "Ocultar senha" : "Mostrar senha"
            );
        };

        // Cria a conta de login do funcionário usando um app Firebase SECUNDÁRIO e temporário,
        // assim a sua própria sessão (dono da loja) nunca é afetada.
        window.salvarFuncionario = async function() {
            if (!exigirEdicaoModulo("funcionarios")) return;

            const uidEdicao = document.getElementById("funcionario-uid-edicao").value;
            const contextoAtual = VideHubContext.getSnapshot();
            if (contextoAtual.isEmployee && uidEdicao && uidEdicao === contextoAtual.authUid) {
                showToast("Você não pode alterar as próprias permissões.", "error");
                return;
            }

            const nome = document.getElementById("funcionario-nome").value.trim();
            const email = document.getElementById("funcionario-email").value.trim().toLowerCase();
            const cargo = document.getElementById("funcionario-cargo").value.trim();
            const ver = Array.from(document.querySelectorAll(".permissao-ver:checked")).map(cb => cb.getAttribute("data-modulo"));
            const editar = Array.from(document.querySelectorAll(".permissao-editar:checked")).map(cb => cb.getAttribute("data-modulo"));

            if (!nome || !email) {
                showToast("Preencha nome e e-mail.", "error");
                return;
            }

            try {
                if (uidEdicao) {
                    await VideFunctions.updateEmployee({
                        uid: uidEdicao,
                        nome,
                        cargo,
                        permissoes: { ver, editar }
                    });
                    showToast("Funcionário atualizado!");
                } else {
                    const senha = document.getElementById("funcionario-senha").value;
                    if (!senha || senha.length < 6) {
                        showToast("A senha precisa ter ao menos 6 caracteres.", "error");
                        return;
                    }
                    await VideFunctions.createEmployee({
                        nome,
                        email,
                        cargo,
                        password: senha,
                        permissoes: { ver, editar }
                    });
                    showToast("Funcionário cadastrado! Já pode fazer login.");
                }
                fecharModalFuncionario();
                carregarFuncionarios();
            } catch (err) {
                console.error(err);
                if (err.code === "auth/email-already-in-use") {
                    showToast("Esse e-mail já está em uso por outra conta.", "error");
                } else {
                    showToast("Erro ao salvar funcionário.", "error");
                }
            }
        };

        window.alternarStatusFuncionario = async function(uid, statusAtual) {
            if (!exigirEdicaoModulo("funcionarios")) return;

            const contextoAtual = VideHubContext.getSnapshot();
            if (contextoAtual.isEmployee && uid === contextoAtual.authUid) {
                showToast("Você não pode alterar o próprio status.", "error");
                return;
            }

            const novoStatus = statusAtual === "ativo" ? "inativo" : "ativo";
            try {
                if (novoStatus === "ativo") {
                    await VideFunctions.enableEmployee({ uid });
                } else {
                    await VideFunctions.disableEmployee({ uid });
                }
                showToast(novoStatus === "ativo" ? "Funcionário reativado!" : "Funcionário desativado.");
                carregarFuncionarios();
            } catch (err) {
                console.error(err);
                showToast("Erro ao atualizar.", "error");
            }
        };

        // GESTOR DE ABAS SPA REATIVAS
let modoEdicaoLayoutAtivo = false;
let blocoArrastando = null;
const ABAS_COM_EDITOR_LAYOUT = new Set([
    "view-dashboard",
    "view-campanhas",
    "view-pedidos",
    "view-metricas",
    "view-personalizacao"
]);

function estaEmDesktopParaEditorLayout() {
    return window.matchMedia("(min-width: 768px)").matches;
}

function existeSuperficieIncompativelAberta() {
    const seletores = [
        "#lead-painel:not(.hidden)",
        "#lead-painel-overlay:not(.hidden)",
        "#template-lead-modal:not(.hidden)",
        "#lp-modal:not(.hidden)",
        "#lp-editor-modal:not(.hidden)",
        "#produto-modal:not(.hidden)"
    ];

    return seletores.some(seletor => Boolean(document.querySelector(seletor)));
}

function atualizarLinksLojaPublica(slug) {
    const slugSeguro = String(slug || "").trim();
    const href = slugSeguro ? `loja.html?loja=${slugSeguro}` : "";

    [
        "link-minha-loja",
        "link-minha-loja-cockpit"
    ].forEach(id => {
        const link = document.getElementById(id);
        if (!link) return;

        if (href) {
            link.href = href;
            link.removeAttribute("aria-disabled");
            link.removeAttribute("tabindex");
            return;
        }

        link.removeAttribute("href");
        link.setAttribute("aria-disabled", "true");
        link.setAttribute("tabindex", "-1");
    });
}

// ===== Primeiros passos (guia de configuração inicial) =====
window.ocultarPrimeirosPassos = function() {
    try { if (usuarioUID) localStorage.setItem("primeirosPassosOcultos_" + usuarioUID, "1"); } catch (e) {}
    document.getElementById("primeiros-passos-container")?.classList.add("hidden");
};

window.renderizarPrimeirosPassos = async function() {
    const container = document.getElementById("primeiros-passos-container");
    if (!container || !usuarioUID) return;
    // Se o dono já dispensou, não mostra mais.
    try {
        if (localStorage.getItem("primeirosPassosOcultos_" + usuarioUID) === "1") {
            container.classList.add("hidden");
            return;
        }
    } catch (e) {}

    let temLoja = false, temProduto = false, temLP = false, lpPublicada = false;
    try {
        const perfilSnap = await getDoc(doc(db, "usuarios", usuarioUID));
        const perfil = perfilSnap.exists() ? perfilSnap.data() : {};
        temLoja = Boolean(perfil.nomeLoja && perfil.urlLoja);

        const prodSnap = await getDocs(query(collection(db, "produtos"), where("criadoPor", "==", usuarioUID)));
        temProduto = prodSnap.size > 0;

        const lpSnap = await getDocs(query(collection(db, "landing_pages"), where("donoUID", "==", usuarioUID)));
        temLP = lpSnap.size > 0;
        lpSnap.forEach(d => { if (d.data().publicado) lpPublicada = true; });
    } catch (err) {
        console.error("Primeiros passos: falha ao apurar estado:", err);
        container.classList.add("hidden");
        return;
    }

    const passos = [
        { feito: temLoja, titulo: "Configure sua loja", desc: "Defina nome, endereço e identidade da loja.", acao: "ativarAba('view-perfil')" },
        { feito: temProduto, titulo: "Adicione um produto", desc: "Cadastre pelo menos um item pra vender.", acao: "document.getElementById('btn-abrir-criacao')?.click()" },
        { feito: temLP, titulo: "Crie uma Landing Page", desc: "Monte uma página focada em conversão.", acao: "ativarAba('view-landing-pages')" },
        { feito: lpPublicada, titulo: "Publique uma página", desc: "Deixe uma Landing Page no ar pra receber visitas.", acao: "ativarAba('view-landing-pages')" }
    ];
    const concluidos = passos.filter(p => p.feito).length;
    const total = passos.length;

    // Tudo pronto: não precisa mais do guia.
    if (concluidos >= total) {
        container.classList.add("hidden");
        return;
    }

    const pct = Math.round((concluidos / total) * 100);
    const iconeCheck = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><path d="M20 6 9 17l-5-5"/></svg>';
    const iconeSeta = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M9 18l6-6-6-6"/></svg>';

    container.innerHTML = `
        <div class="aura-onboarding aura-enter">
            <div class="aura-onboarding-head">
                <div>
                    <p class="aura-onboarding-kicker">Primeiros passos</p>
                    <h3 class="aura-onboarding-title">Deixe sua operação pronta pra vender</h3>
                </div>
                <button type="button" class="aura-onboarding-dismiss" onclick="ocultarPrimeirosPassos()" title="Ocultar guia">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="m6 6 12 12"/><path d="M18 6 6 18"/></svg>
                </button>
            </div>
            <div class="aura-onboarding-progress">
                <div class="aura-onboarding-progress-bar"><span style="width:${pct}%"></span></div>
                <span class="aura-onboarding-progress-label">${concluidos} de ${total} concluídos</span>
            </div>
            <div class="aura-onboarding-steps">
                ${passos.map(p => `
                    <button type="button" class="aura-onboarding-step ${p.feito ? "is-feito" : ""}" onclick="${p.feito ? "" : p.acao}" ${p.feito ? "disabled" : ""}>
                        <span class="aura-onboarding-step-check">${p.feito ? iconeCheck : ""}</span>
                        <span class="aura-onboarding-step-texto">
                            <strong>${p.titulo}</strong>
                            <small>${p.desc}</small>
                        </span>
                        ${p.feito ? "" : `<span class="aura-onboarding-step-seta">${iconeSeta}</span>`}
                    </button>
                `).join("")}
            </div>
        </div>
    `;
    container.classList.remove("hidden");
};

// ===== KPIs do dashboard (números reais na central de comando) =====
// Preenche os três cartões do topo com dados reais: produtos ativos,
// Landing Pages no ar e total de visitas. Cada número degrada pra 0 sem
// quebrar caso a métrica ainda não exista (ou a regra não esteja no ar).
window.atualizarKpisDashboard = async function() {
    if (!usuarioUID) return;
    const elProd = document.getElementById("kpi-produtos-valor");
    const elLps = document.getElementById("kpi-lps-valor");
    const elLpsSub = document.getElementById("kpi-lps-sub");
    const elVis = document.getElementById("kpi-visitas-valor");
    if (!elProd && !elLps && !elVis) return;

    try {
        // Produtos ativos (não conta rascunhos).
        const prodSnap = await getDocs(query(collection(db, "produtos"), where("criadoPor", "==", usuarioUID)));
        let produtosAtivos = 0;
        prodSnap.forEach(d => { if (d.data().statusProduto !== "rascunho") produtosAtivos++; });
        if (elProd) elProd.innerText = produtosAtivos;

        // Landing Pages: quantas estão publicadas e o total.
        const lpSnap = await getDocs(query(collection(db, "landing_pages"), where("donoUID", "==", usuarioUID)));
        let lpsTotal = 0, lpsPublicadas = 0;
        const publicadas = [];
        lpSnap.forEach(d => {
            lpsTotal++;
            const dados = d.data();
            if (dados.publicado) { lpsPublicadas++; publicadas.push(dados); }
        });
        if (elLps) elLps.innerText = lpsPublicadas;
        if (elLpsSub) elLpsSub.innerText = lpsTotal > lpsPublicadas ? ` de ${lpsTotal}` : "";

        // Visitas: soma o totalVisualizacoes das métricas das LPs publicadas.
        // A métrica só existe depois que a página recebe acessos no ar, então
        // qualquer falha/ausência vira 0 sem travar o cartão.
        if (elVis) {
            if (!slugAtualSalvo || publicadas.length === 0) {
                elVis.innerText = "0";
            } else {
                const somas = await Promise.all(publicadas.map(async (lp) => {
                    try {
                        const docId = `${slugAtualSalvo}__${lp.pagina}`.toLowerCase();
                        const snap = await getDoc(doc(db, "metricas_landing_pages", docId));
                        return snap.exists() ? (snap.data().totalVisualizacoes || 0) : 0;
                    } catch (e) { return 0; }
                }));
                const total = somas.reduce((a, b) => a + b, 0);
                elVis.innerText = total.toLocaleString("pt-BR");
            }
        }
    } catch (err) {
        console.error("KPIs do dashboard: falha ao apurar:", err);
        // Nunca deixa o esqueleto girando pra sempre: se algo falhou, mostra
        // um traço nos indicadores que ainda não receberam valor.
        [elProd, elLps, elVis].forEach(el => {
            if (el && el.querySelector(".aura-skel")) el.innerText = "—";
        });
    }
};

// ===== Atividade recente (últimos leads e pedidos no dashboard) =====
// Descreve há quanto tempo algo aconteceu, em português e sem depender
// de biblioteca. Recebe timestamp em milissegundos.
function tempoRelativoBR(ms) {
    if (!ms) return "";
    const diff = Date.now() - ms;
    if (diff < 0) return "agora";
    const min = Math.floor(diff / 60000);
    if (min < 1) return "agora";
    if (min < 60) return `há ${min} min`;
    const horas = Math.floor(min / 60);
    if (horas < 24) return `há ${horas} h`;
    const dias = Math.floor(horas / 24);
    if (dias === 1) return "ontem";
    if (dias < 30) return `há ${dias} dias`;
    const meses = Math.floor(dias / 30);
    if (meses < 12) return `há ${meses} ${meses === 1 ? "mês" : "meses"}`;
    const anos = Math.floor(meses / 12);
    return `há ${anos} ${anos === 1 ? "ano" : "anos"}`;
}

// Monta o painel "Atividade recente" no topo do dashboard, unindo os
// últimos leads e pedidos numa linha do tempo. Some se o plano não tiver
// nem leads nem pedidos, ou se ainda não houver nenhuma atividade.
window.renderizarAtividadeRecente = async function() {
    const container = document.getElementById("atividade-recente-container");
    if (!container || !usuarioUID) return;

    const podeLeads = typeof temFeature !== "function" || temFeature("leads");
    const podePedidos = typeof temFeature !== "function" || temFeature("hub");
    if (!podeLeads && !podePedidos) {
        container.classList.add("hidden");
        return;
    }

    const itens = [];
    // Cada fonte é independente: se uma falhar (regra/permrmissão), a outra
    // ainda aparece. Buscamos tudo do dono e recortamos os mais recentes.
    try {
        if (podeLeads) {
            const leadSnap = await getDocs(query(collection(db, "leads"), where("criadoPor", "==", usuarioUID)));
            leadSnap.forEach(d => {
                const l = d.data();
                itens.push({
                    tipo: "lead",
                    quando: l.data || 0,
                    titulo: l.nome || "Novo contato",
                    detalhe: l.origem ? `Origem: ${l.origem}` : (l.whatsapp ? l.whatsapp : "Lead capturado"),
                    acao: "ativarAba('view-leads')"
                });
            });
        }
    } catch (e) { /* fonte de leads indisponível: ignora */ }

    try {
        if (podePedidos) {
            const pedSnap = await getDocs(query(collection(db, "pedidos"), where("criadoPor", "==", usuarioUID)));
            pedSnap.forEach(d => {
                const p = d.data();
                const valorTxt = (p.valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
                itens.push({
                    tipo: "pedido",
                    quando: p.data || 0,
                    titulo: p.cliente || "Novo pedido",
                    detalhe: `${valorTxt}${p.produtos ? " · " + p.produtos : ""}`,
                    status: p.status || "aguardando",
                    acao: "ativarAba('view-pedidos')"
                });
            });
        }
    } catch (e) { /* fonte de pedidos indisponível: ignora */ }

    if (itens.length === 0) {
        container.classList.add("hidden");
        return;
    }

    itens.sort((a, b) => (b.quando || 0) - (a.quando || 0));
    const recentes = itens.slice(0, 6);

    const iconeLead = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="12" cy="8" r="3.2"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>';
    const iconePedido = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>';
    const rotuloStatus = { aguardando: "Aguardando", confirmado: "Confirmado", pago: "Pago", cancelado: "Cancelado" };

    const linhas = recentes.map(it => {
        const ehLead = it.tipo === "lead";
        const badge = (!ehLead && it.status)
            ? `<span class="aura-activity-badge is-${it.status}">${rotuloStatus[it.status] || it.status}</span>`
            : "";
        return `
            <button type="button" class="aura-activity-row" onclick="${it.acao}">
                <span class="aura-activity-icon is-${it.tipo}">${ehLead ? iconeLead : iconePedido}</span>
                <span class="aura-activity-body">
                    <span class="aura-activity-top">
                        <strong>${escaparHtmlChat ? escaparHtmlChat(it.titulo) : it.titulo}</strong>
                        ${badge}
                    </span>
                    <small>${escaparHtmlChat ? escaparHtmlChat(it.detalhe) : it.detalhe}</small>
                </span>
                <span class="aura-activity-time">${tempoRelativoBR(it.quando)}</span>
            </button>
        `;
    }).join("");

    container.innerHTML = `
        <div class="aura-activity aura-enter">
            <div class="aura-activity-head">
                <div>
                    <p class="aura-activity-kicker">Atividade recente</p>
                    <h3 class="aura-activity-title">O que acabou de acontecer na sua operação</h3>
                </div>
            </div>
            <div class="aura-activity-list">${linhas}</div>
        </div>
    `;
    container.classList.remove("hidden");
};

// ===== Resumo da semana (gráfico dos últimos 7 dias no dashboard) =====
// Mostra, em barras, quantos leads e pedidos entraram por dia nos últimos
// 7 dias, mais os totais da semana e a receita (pedidos pagos). Gráfico
// feito só com CSS — nada de biblioteca externa/CDN, então funciona mesmo
// se algum script de fora falhar.
window.renderizarResumoSemana = async function() {
    const container = document.getElementById("resumo-semana-container");
    if (!container || !usuarioUID) return;

    const podeLeads = typeof temFeature !== "function" || temFeature("leads");
    const podePedidos = typeof temFeature !== "function" || temFeature("hub");
    if (!podeLeads && !podePedidos) {
        container.classList.add("hidden");
        return;
    }

    // 7 baldes de dia (de 6 dias atrás até hoje).
    const dias = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - i);
        const inicio = d.getTime();
        dias.push({
            inicio,
            fim: inicio + 86400000,
            label: d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""),
            leads: 0,
            pedidos: 0
        });
    }
    const janelaInicio = dias[0].inicio;

    let algumDado = false;
    let receita = 0;

    try {
        if (podeLeads) {
            const leadSnap = await getDocs(query(collection(db, "leads"), where("criadoPor", "==", usuarioUID)));
            if (leadSnap.size > 0) algumDado = true;
            leadSnap.forEach(docSnap => {
                const t = docSnap.data().data || 0;
                if (t < janelaInicio) return;
                const dia = dias.find(d => t >= d.inicio && t < d.fim);
                if (dia) dia.leads++;
            });
        }
    } catch (e) { /* leads indisponível */ }

    try {
        if (podePedidos) {
            const pedSnap = await getDocs(query(collection(db, "pedidos"), where("criadoPor", "==", usuarioUID)));
            if (pedSnap.size > 0) algumDado = true;
            pedSnap.forEach(docSnap => {
                const p = docSnap.data();
                const t = p.data || 0;
                if (t < janelaInicio) return;
                const dia = dias.find(d => t >= d.inicio && t < d.fim);
                if (dia) dia.pedidos++;
                if (p.status === "pago") receita += Number(p.valor || 0);
            });
        }
    } catch (e) { /* pedidos indisponível */ }

    // Conta ainda nova (nunca teve lead nem pedido): não mostra o gráfico.
    if (!algumDado) {
        container.classList.add("hidden");
        return;
    }

    const totalLeads = dias.reduce((s, d) => s + d.leads, 0);
    const totalPedidos = dias.reduce((s, d) => s + d.pedidos, 0);
    const maxVal = Math.max(1, ...dias.map(d => Math.max(d.leads, d.pedidos)));
    const alturaPct = v => (v <= 0 ? 0 : Math.max(8, Math.round((v / maxVal) * 100)));
    const receitaTxt = receita.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

    const colunas = dias.map(d => `
        <div class="aura-week-col">
            <div class="aura-week-bars">
                <span class="aura-week-bar is-leads" style="height:${alturaPct(d.leads)}%" title="${d.leads} lead(s)"></span>
                <span class="aura-week-bar is-pedidos" style="height:${alturaPct(d.pedidos)}%" title="${d.pedidos} pedido(s)"></span>
            </div>
            <span class="aura-week-day">${d.label}</span>
        </div>
    `).join("");

    container.innerHTML = `
        <div class="aura-week aura-enter">
            <div class="aura-week-head">
                <div>
                    <p class="aura-week-kicker">Últimos 7 dias</p>
                    <h3 class="aura-week-title">Resumo da semana</h3>
                </div>
                <div class="aura-week-legend">
                    <span><i class="aura-week-dot is-leads"></i>Leads</span>
                    <span><i class="aura-week-dot is-pedidos"></i>Pedidos</span>
                </div>
            </div>
            <div class="aura-week-stats">
                <div class="aura-week-stat">
                    <small>Leads na semana</small>
                    <strong>${totalLeads}</strong>
                </div>
                <div class="aura-week-stat">
                    <small>Pedidos na semana</small>
                    <strong>${totalPedidos}</strong>
                </div>
                <div class="aura-week-stat">
                    <small>Receita (pagos)</small>
                    <strong>${receitaTxt}</strong>
                </div>
            </div>
            <div class="aura-week-chart">${colunas}</div>
        </div>
    `;
    container.classList.remove("hidden");
};

// Leva o dono ao catálogo de produtos. O catálogo fica dentro da própria
// tela inicial (não existe aba "view-produtos"), então garantimos que o
// dashboard está ativo e rolamos até a grade de produtos.
window.irParaCatalogoProdutos = function() {
    if (typeof ativarAba === "function") ativarAba("view-dashboard");
    setTimeout(() => {
        document.getElementById("produtos-container")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 140);
};

// ===== Alertas / ações que precisam de atenção (dashboard) =====
// Diferente da "Atividade recente" (o que aconteceu), aqui mostramos o
// que precisa de uma ação do dono AGORA: pedidos aguardando confirmação
// e produtos com estoque baixo. Some quando não há nada pendente.
window.renderizarAlertasAtencao = async function() {
    const container = document.getElementById("alertas-atencao-container");
    if (!container || !usuarioUID) return;

    const chips = [];
    const podePedidos = typeof temFeature !== "function" || temFeature("hub");

    // Pedidos aguardando confirmação.
    if (podePedidos) {
        try {
            const pedSnap = await getDocs(query(collection(db, "pedidos"), where("criadoPor", "==", usuarioUID)));
            let aguardando = 0;
            pedSnap.forEach(d => { if ((d.data().status || "aguardando") === "aguardando") aguardando++; });
            if (aguardando > 0) {
                chips.push({
                    tom: "warning",
                    icone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
                    texto: `<strong>${aguardando}</strong> ${aguardando === 1 ? "pedido aguardando" : "pedidos aguardando"} confirmação`,
                    acao: "ativarAba('view-pedidos')"
                });
            }
        } catch (e) { /* pedidos indisponível: ignora */ }
    }

    // Produtos ativos com estoque baixo (até 5 unidades).
    try {
        const prodSnap = await getDocs(query(collection(db, "produtos"), where("criadoPor", "==", usuarioUID)));
        let estoqueBaixo = 0;
        prodSnap.forEach(d => {
            const p = d.data();
            if (p.statusProduto === "rascunho") return;
            const temEstoque = p.estoque !== "" && p.estoque !== undefined && p.estoque !== null;
            if (!temEstoque) return;
            const n = Number(p.estoque);
            if (Number.isFinite(n) && n <= 5) estoqueBaixo++;
        });
        if (estoqueBaixo > 0) {
            chips.push({
                tom: "danger",
                icone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>',
                texto: `<strong>${estoqueBaixo}</strong> ${estoqueBaixo === 1 ? "produto com estoque baixo" : "produtos com estoque baixo"}`,
                acao: "irParaCatalogoProdutos()"
            });
        }
    } catch (e) { /* produtos indisponível: ignora */ }

    if (chips.length === 0) {
        container.classList.add("hidden");
        return;
    }

    container.innerHTML = `
        <div class="aura-alerts aura-enter">
            <span class="aura-alerts-label">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><path d="M12 9v4"/><path d="M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg>
                Precisa da sua atenção
            </span>
            <div class="aura-alerts-chips">
                ${chips.map(c => `
                    <button type="button" class="aura-alert-chip is-${c.tom}" onclick="${c.acao}">
                        <span class="aura-alert-chip-icon">${c.icone}</span>
                        <span class="aura-alert-chip-text">${c.texto}</span>
                        <svg class="aura-alert-chip-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M9 18l6-6-6-6"/></svg>
                    </button>
                `).join("")}
            </div>
        </div>
    `;
    container.classList.remove("hidden");
};

// ===== Compartilhar (QR Code + link) =====
window._compartilharUrl = "";

// Desenha o QR num canvas e devolve PNG nítido (melhor que o GIF nativo
// da lib). Retorna null se a lib de QR não tiver carregado.
function gerarQrCodePng(url, tamanhoPx) {
    if (typeof qrcode !== "function") return null;
    try {
        const qr = qrcode(0, "M");
        qr.addData(url);
        qr.make();
        const count = qr.getModuleCount();
        const margem = 4;
        const total = count + margem * 2;
        const cell = Math.max(2, Math.floor((tamanhoPx || 640) / total));
        const size = cell * total;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = "#000000";
        for (let r = 0; r < count; r++) {
            for (let c = 0; c < count; c++) {
                if (qr.isDark(r, c)) ctx.fillRect((c + margem) * cell, (r + margem) * cell, cell, cell);
            }
        }
        return canvas.toDataURL("image/png");
    } catch (err) {
        console.error("Falha ao gerar QR:", err);
        return null;
    }
}

window.abrirCompartilhar = function(url, titulo) {
    if (!url) {
        showToast("Publique/configure isso primeiro pra ter um link.", "error");
        return;
    }
    window._compartilharUrl = url;
    document.getElementById("compartilhar-titulo").textContent = titulo || "Compartilhar";
    document.getElementById("compartilhar-url").textContent = url;

    const img = document.getElementById("compartilhar-qr-img");
    const indisponivel = document.getElementById("compartilhar-qr-indisponivel");
    const download = document.getElementById("compartilhar-download");
    const png = gerarQrCodePng(url, 640);
    if (png) {
        img.src = png;
        img.classList.remove("hidden");
        indisponivel?.classList.add("hidden");
        if (download) {
            download.href = png;
            const nome = (titulo || "loja").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "qrcode";
            download.setAttribute("download", "qrcode-" + nome + ".png");
            download.style.display = "";
        }
    } else {
        img.removeAttribute("src");
        img.classList.add("hidden");
        indisponivel?.classList.remove("hidden");
        if (download) download.style.display = "none";
    }
    document.getElementById("compartilhar-modal").classList.remove("hidden");
};

window.fecharCompartilhar = function() {
    document.getElementById("compartilhar-modal")?.classList.add("hidden");
};

window.abrirLinkCompartilhar = function() {
    if (window._compartilharUrl) window.open(window._compartilharUrl, "_blank", "noopener,noreferrer");
};

// Copia um texto pra área de transferência com fallback, dando retorno
// visual no botão (troca o rótulo e a classe .is-copiado por 2s).
async function copiarTextoComFeedback(texto, botao, rotuloCopiado) {
    const rotulo = botao?.querySelector("[data-copiar-texto]");
    const textoOriginal = rotulo?.textContent;
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(texto);
        } else {
            const tmp = document.createElement("textarea");
            tmp.value = texto;
            tmp.style.position = "fixed";
            tmp.style.opacity = "0";
            document.body.appendChild(tmp);
            tmp.select();
            document.execCommand("copy");
            document.body.removeChild(tmp);
        }
        botao?.classList.add("is-copiado");
        if (rotulo) rotulo.textContent = rotuloCopiado || "Copiado!";
        setTimeout(() => {
            botao?.classList.remove("is-copiado");
            if (rotulo && textoOriginal) rotulo.textContent = textoOriginal;
        }, 2000);
        return true;
    } catch (err) {
        console.error(err);
        showToast("Não consegui copiar. O link é: " + texto, "error");
        return false;
    }
}

window.copiarLinkCompartilhar = function(botao) {
    if (!window._compartilharUrl) return;
    copiarTextoComFeedback(window._compartilharUrl, botao, "Link copiado!");
};

window.abrirCompartilharLoja = function() {
    const url = obterLinkPublicoValido("link-minha-loja", "link-minha-loja-cockpit");
    const nome = (typeof nomeLojaAtual !== "undefined" && nomeLojaAtual) ? nomeLojaAtual : "Minha loja";
    window.abrirCompartilhar(url, nome);
};

window.abrirCompartilharLP = function(botao) {
    window.abrirCompartilhar(botao?.dataset?.shareUrl, botao?.dataset?.shareTitulo || "Landing Page");
};

window.copiarLinkLoja = async function(botao) {
    const url = obterLinkPublicoValido("link-minha-loja", "link-minha-loja-cockpit");
    if (!url) {
        showToast("Publique/configure sua loja primeiro pra ter um link.", "error");
        return;
    }
    const rotulo = botao?.querySelector("[data-copiar-texto]");
    const textoOriginal = rotulo?.textContent;
    const marcarCopiado = () => {
        botao?.classList.add("is-copiado");
        if (rotulo) rotulo.textContent = "Link copiado!";
        setTimeout(() => {
            botao?.classList.remove("is-copiado");
            if (rotulo && textoOriginal) rotulo.textContent = textoOriginal;
        }, 2000);
    };
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(url);
        } else {
            // Fallback pra contextos sem a API moderna de clipboard.
            const tmp = document.createElement("textarea");
            tmp.value = url;
            tmp.style.position = "fixed";
            tmp.style.opacity = "0";
            document.body.appendChild(tmp);
            tmp.select();
            document.execCommand("copy");
            document.body.removeChild(tmp);
        }
        marcarCopiado();
    } catch (err) {
        console.error(err);
        showToast("Não consegui copiar. O link é: " + url, "error");
    }
};

function obterLinkPublicoValido(...ids) {
    for (const id of ids) {
        const link = document.getElementById(id);
        const href = String(link?.getAttribute("href") || "").trim();

        if (
            !href ||
            href === "#" ||
            href.toLowerCase() === "javascript:void(0)"
        ) {
            continue;
        }

        try {
            return new URL(href, window.location.href).href;
        } catch (erro) {
            console.warn("Link publico invalido ignorado:", href);
        }
    }

    return "";
}

function atualizarVisibilidadeBarraEditorLayout(targetId) {
    const barra = document.getElementById("barra-editor-layout");
    const btnSalvar = document.getElementById("btn-salvar-layout");
    const btnRestaurar = document.getElementById("btn-restaurar-layout");
    const abaAtual =
        targetId ||
        document.querySelector(".view-section.active")?.id ||
        "";
    const secao = document.getElementById(abaAtual);
    const temBlocosEditaveis =
        Boolean(secao?.querySelector(".layout-block[data-block-id]"));
    const podeExibir =
        estaEmDesktopParaEditorLayout() &&
        ABAS_COM_EDITOR_LAYOUT.has(abaAtual) &&
        temBlocosEditaveis &&
        !existeSuperficieIncompativelAberta();

    if (!barra) return;

    barra.classList.toggle("hidden", !podeExibir);
    barra.classList.toggle("flex", podeExibir);

    if (!podeExibir && modoEdicaoLayoutAtivo) {
        modoEdicaoLayoutAtivo = false;
        aplicarEstadoModoEdicaoLayout();
    }

    if (!podeExibir) {
        btnSalvar?.classList.add("hidden");
        btnRestaurar?.classList.add("hidden");
    }
}

function fecharSuperficiesLeadsDashboard() {
    const ocultar = (id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.add("hidden");
        el.setAttribute("aria-hidden", "true");
    };

    ocultar("lead-painel");
    ocultar("lead-painel-overlay");
    ocultar("template-lead-modal");

    window._templatesLeadDisponiveis = [];

    try {
        window.AuraLeadsV5?.close?.({ restoreFocus: false });
    } catch (err) {
        console.warn("Nao foi possivel fechar o modal Leads V5.", err);
    }

    document.body?.classList.remove("aura-leads-v5-lock");
}

window.fecharSuperficiesLeadsDashboard = fecharSuperficiesLeadsDashboard;

function aplicarEstadoModoEdicaoLayout() {
    const btn = document.getElementById("btn-editar-layout");
    const btnSalvar = document.getElementById("btn-salvar-layout");
    const btnRestaurar = document.getElementById("btn-restaurar-layout");
    prepararBlocosLayoutEditaveis();
    document.querySelectorAll(".view-section.active .layout-block").forEach(el => {
        el.draggable = modoEdicaoLayoutAtivo;
        const oculto = el.classList.contains("layout-block-oculto");
        const obrigatorio =
            el.getAttribute("data-layout-obrigatorio") === "true";
        if (modoEdicaoLayoutAtivo) {
            el.classList.add("border-2", "border-dashed", "border-white/30");
            if (oculto && !obrigatorio) {
                el.hidden = false;
                el.classList.remove("hidden");
                el.style.opacity = "0.3";
            }
        } else {
            el.classList.remove("border-2", "border-dashed", "border-white/30");
            el.style.opacity = "";
            if (oculto && !obrigatorio) {
                el.hidden = true;
                el.classList.add("hidden");
            } else {
                el.hidden = false;
                el.classList.remove("hidden");
                el.classList.remove("layout-block-oculto");
            }
        }
        let controle = el.querySelector(".layout-block-controle");
        if (modoEdicaoLayoutAtivo && !controle) {
            controle = document.createElement("div");
            controle.className = "layout-block-controle flex items-center justify-between gap-2 mb-3 p-2 bg-black/40 rounded-lg cursor-move";
            controle.innerHTML = `<span class="text-xs font-bold text-white">⠿ ${el.getAttribute("data-block-nome")}</span><button type="button" class="btn-toggle-visibilidade-bloco text-xs font-bold text-gray-300 hover:text-white">${oculto ? "🚫 Oculto (clique p/ mostrar)" : "👁️ Ocultar"}</button>`;
            el.insertBefore(controle, el.firstChild);
            controle.querySelector(".btn-toggle-visibilidade-bloco").addEventListener("click", (ev) => {
                ev.stopPropagation();
                if (obrigatorio) {
                    showToast?.("Este bloco é obrigatório e não pode ser ocultado.", "error");
                    return;
                }
                const escondido = el.classList.toggle("layout-block-oculto");
                el.style.opacity = escondido ? "0.3" : "1";
                el.hidden = false;
                el.classList.remove("hidden");
                ev.target.innerText = escondido ? "🚫 Oculto (clique p/ mostrar)" : "👁️ Ocultar";
            });
        } else if (!modoEdicaoLayoutAtivo && controle) {
            controle.remove();
        }
    });
    if (btn) btn.innerText = modoEdicaoLayoutAtivo ? "✅ Concluir Edição" : "✏️ Editar Layout";
    if (btnSalvar) btnSalvar.classList.toggle("hidden", !modoEdicaoLayoutAtivo);
    if (btnRestaurar) btnRestaurar.classList.toggle("hidden", !modoEdicaoLayoutAtivo);
    atualizarVisibilidadeBarraEditorLayout();
}

window.alternarModoEdicaoLayout = function() {
    modoEdicaoLayoutAtivo = !modoEdicaoLayoutAtivo;
    aplicarEstadoModoEdicaoLayout();
};

window.restaurarLayoutOriginal = async function() {
    const abaAtivaId = document.querySelector(".view-section.active")?.id;
    if (!abaAtivaId) return;
    if (!exigirEdicaoModulo(moduloPermissaoPorAba(abaAtivaId))) return;

    abrirConfirmacao("Restaurar o layout original desta aba? Isso apaga a personalização salva dela.", async () => {
        if (!exigirEdicaoModulo(moduloPermissaoPorAba(abaAtivaId))) return;

        try {
            const docRef = doc(db, "usuarios", usuarioUID);
            const snapAtual = await getDoc(docRef);
            const todasAbas = (snapAtual.exists() && snapAtual.data().layoutPorAba) || {};
            delete todasAbas[abaAtivaId];
            await setDoc(docRef, { layoutPorAba: todasAbas }, { merge: true });
            showToast("Layout restaurado! Recarregando...");
            setTimeout(() => window.location.reload(), 1000);
        } catch(err) {
            console.error(err);
            showToast("Erro ao restaurar layout.", "error");
        }
    });
};
function prepararBlocosLayoutEditaveis(root = document) {
    const origem =
        root instanceof Element
            ? root
            : document;
    const blocos =
        origem.matches?.(".layout-block")
            ? [origem]
            : Array.from(origem.querySelectorAll(".layout-block"));

    blocos.forEach(el => {
        if (!estaEmDesktopParaEditorLayout()) {
            el.draggable = false;
            return;
        }

        el.draggable = modoEdicaoLayoutAtivo;

        if (el.dataset.layoutDragReady === "true") {
            return;
        }

        el.dataset.layoutDragReady = "true";

        el.addEventListener("dragstart", () => {
            if (
                !modoEdicaoLayoutAtivo ||
                !estaEmDesktopParaEditorLayout()
            ) {
                blocoArrastando = null;
                return;
            }

            blocoArrastando = el;
        });

        el.addEventListener("dragover", (e) => {
            e.preventDefault();
            if (
                !modoEdicaoLayoutAtivo ||
                !estaEmDesktopParaEditorLayout() ||
                !blocoArrastando ||
                blocoArrastando === el
            ) return;
            const rect = el.getBoundingClientRect();
            const meio = rect.top + rect.height / 2;
            if (e.clientY < meio) el.parentNode.insertBefore(blocoArrastando, el);
            else el.parentNode.insertBefore(blocoArrastando, el.nextSibling);
        });
    });
}

prepararBlocosLayoutEditaveis();

function aplicarLayoutSalvoDaAba(targetId) {
    const config = window._layoutPorAbaSalvo && window._layoutPorAbaSalvo[targetId];
    if (!Array.isArray(config) || config.length === 0) return;
    const secao = document.getElementById(targetId);
    if (!secao) return;
    config.forEach(item => {
        const el = secao.querySelector(`.layout-block[data-block-id="${item.id}"]`);
        if (!el) return;
        const blocoObrigatorio =
            el.getAttribute("data-layout-obrigatorio") === "true";

        const deveOcultar =
            item.visivel === false &&
            !blocoObrigatorio;

        el.classList.toggle("hidden", deveOcultar);
        el.classList.toggle("layout-block-oculto", deveOcultar);
        el.hidden = deveOcultar;

        if (blocoObrigatorio) {
            el.classList.remove("layout-block-oculto");
            el.style.display = "";
            el.hidden = false;
            el.classList.remove("hidden");
        }

        secao.appendChild(el);
    });

    prepararBlocosLayoutEditaveis(secao);
}

window.salvarLayoutVisaoGeral = async function() {
    if (!exigirEdicaoModulo(moduloPermissaoPorAba(document.querySelector(".view-section.active")?.id))) return;

    const abaAtivaId = document.querySelector(".view-section.active")?.id;
    if (!abaAtivaId) return;
    const ordem = Array.from(document.querySelectorAll(".view-section.active .layout-block")).map(el => ({
        id: el.getAttribute("data-block-id"),
        visivel: !el.classList.contains("layout-block-oculto")
    }));
    try {
        const docRef = doc(db, "usuarios", usuarioUID);
        const snapAtual = await getDoc(docRef);
        const todasAbas = (snapAtual.exists() && snapAtual.data().layoutPorAba) || {};
        todasAbas[abaAtivaId] = ordem;
        await setDoc(docRef, { layoutPorAba: todasAbas }, { merge: true });
        showToast("Layout salvo! Vai continuar assim toda vez que você entrar nessa aba.");
        modoEdicaoLayoutAtivo = false;
        aplicarEstadoModoEdicaoLayout();
    } catch(err) {
        console.error(err);
        showToast("Erro ao salvar layout.", "error");
    }
};

window.filtrarHubModulos = function(termo) {
    const valor = String(termo || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

    document
        .querySelectorAll("#grid-hub-modulos > div")
        .forEach(card => {
            const nome = String(
                card.getAttribute("data-nome") || ""
            ).toLowerCase();

            card.classList.toggle(
                "hidden",
                valor !== "" && !nome.includes(valor)
            );
        });
};

function limparBuscaHubModulos() {
    const campo =
        document.getElementById("busca-hub-modulos");

    if (!campo) return;

    campo.textContent = "";

    window.filtrarHubModulos("");
}

limparBuscaHubModulos();

window.addEventListener(
    "DOMContentLoaded",
    limparBuscaHubModulos
);

window.addEventListener("pageshow", () => {
    setTimeout(limparBuscaHubModulos, 50);
});

function ativarAba(targetId) {
    const contextoVideHub = VideHubContext.getSnapshot();
    if (!contextoVideHub.initialized) {
        showToast("Carregando suas permissões. Aguarde um instante.", "error");
        return false;
    }

    if (!podeVerAba(targetId)) {
        showToast("Você não tem permissão para acessar este módulo.", "error");
        return false;
    }

    if (modoEdicaoLayoutAtivo) {
        modoEdicaoLayoutAtivo = false;

        document.querySelectorAll(".layout-block").forEach(el => {
            el.draggable = false;
            el.classList.remove(
                "border-2",
                "border-dashed",
                "border-white/30"
            );

            const controleAntigo =
                el.querySelector(".layout-block-controle");

            if (controleAntigo) {
                controleAntigo.remove();
            }
        });

        const btnEditar =
            document.getElementById("btn-editar-layout");

        const btnSalvarAba =
            document.getElementById("btn-salvar-layout");

        const btnRestaurarAba =
            document.getElementById("btn-restaurar-layout");

        if (btnEditar) {
            // innerHTML (não innerText) pra manter o ícone SVG em vez do emoji
            // — antes esta linha re-injetava "✏️" ao sair do modo de edição.
            btnEditar.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg> Editar Layout desta Aba';
        }

        if (btnSalvarAba) {
            btnSalvarAba.classList.add("hidden");
        }

        if (btnRestaurarAba) {
            btnRestaurarAba.classList.add("hidden");
        }
    }

    if (targetId !== "view-leads") {
        fecharSuperficiesLeadsDashboard();
    }

const secaoAlvo =
    document.getElementById(targetId);

/* Não desativa a tela atual quando o destino não existe. */
if (!secaoAlvo) {
    console.warn(
        "Aba não encontrada:",
        targetId
    );

    return false;
}

document
    .querySelectorAll("#sidebar-nav button")
    .forEach(button =>
        button.classList.remove("active")
    );

const botaoAlvo =
    document.querySelector(
        `#sidebar-nav button[data-target="${targetId}"]`
    );

if (botaoAlvo) {
    botaoAlvo.classList.add("active");
}

document
    .querySelectorAll(".view-section")
    .forEach(section =>
        section.classList.remove("active")
    );

secaoAlvo.classList.add("active");
    aplicarLayoutSalvoDaAba(targetId);
    prepararBlocosLayoutEditaveis(secaoAlvo);
    atualizarVisibilidadeBarraEditorLayout(targetId);
    localStorage.setItem("abaAtivaDashboard", targetId);

if (
    targetId === "view-dashboard" &&
    typeof carregarCockpitReal === "function"
) {
    carregarCockpitReal();
}

if (targetId === "view-dashboard" && typeof window.renderizarPrimeirosPassos === "function") {
    window.renderizarPrimeirosPassos();
}

if (targetId === "view-dashboard" && typeof window.atualizarKpisDashboard === "function") {
    window.atualizarKpisDashboard();
}

if (targetId === "view-dashboard" && typeof window.renderizarAtividadeRecente === "function") {
    window.renderizarAtividadeRecente();
}

if (targetId === "view-dashboard" && typeof window.renderizarResumoSemana === "function") {
    window.renderizarResumoSemana();
}

if (targetId === "view-dashboard" && typeof window.renderizarAlertasAtencao === "function") {
    window.renderizarAlertasAtencao();
}

if (targetId === "view-metricas") {
        carregarMetricas(
            obterFiltroSelecionado(
                "filtro-metricas-dias",
                "filtro-metricas-de",
                "filtro-metricas-ate"
            )
        );
    }

    if (targetId === "view-pedidos") {
        carregarPedidos();
    }

    if (targetId === "view-leads") {
        carregarLeads();
    }

    if (targetId === "view-templates") {
        carregarTemplates();
    }

    if (targetId === "view-campanhas") {
        carregarCampanha();
        carregarHistoricoCampanhas(
            obterFiltroSelecionado(
                "filtro-campanha-dias",
                "filtro-campanha-de",
                "filtro-campanha-ate"
            )
        );
    }

    if (targetId === "view-notificacoes") {
        carregarNotificacoes();
    }

    if (targetId === "view-funcionarios") {
        carregarFuncionarios();
    }

    if (targetId === "view-automacao-leads") {
        carregarAutomacaoLeads();
    }

    if (targetId === "view-personalizacao") {
        carregarStatusPersonalizacao();
    }

    if (targetId === "view-guia") {
        renderizarGuiaDoPlano();
    }

    if (targetId === "view-landing-pages") {
        carregarLandingPages();
    }
}

window.ativarAba = ativarAba;

window.addEventListener("resize", () => {
    atualizarVisibilidadeBarraEditorLayout();
});

window.addEventListener("DOMContentLoaded", () => {
    atualizarVisibilidadeBarraEditorLayout();
});

/* =========================================================
   AURA COMMAND CENTER
   Navegação global e ações rápidas com Ctrl/Cmd + K.
   ========================================================= */

(function prepararAuraCommandCenter() {

    if (window.__auraCommandCenterReady) {
        return;
    }

    window.__auraCommandCenterReady = true;

    const iniciar = () => {

        if (
            document.getElementById(
                "aura-command-modal"
            )
        ) {
            return;
        }

        document.body.insertAdjacentHTML(
            "beforeend",
            `
                <div
                    id="aura-command-modal"
                    class="hidden aura-command-overlay"
                    aria-hidden="true"
                >

                    <div
                        class="aura-command-shell"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Central de comandos"
                    >

                        <div class="aura-command-search">

                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                            >
                                <circle
                                    cx="11"
                                    cy="11"
                                    r="7"
                                ></circle>

                                <path
                                    d="m20 20-4-4"
                                ></path>
                            </svg>

                            <input
                                type="text"
                                id="aura-command-input"
                                placeholder="Pesquisar módulo ou ação..."
                                autocomplete="off"
                                spellcheck="false"
                            >

                            <button
                                type="button"
                                id="aura-command-close"
                                aria-label="Fechar central"
                            >
                                ESC
                            </button>

                        </div>

                        <div class="aura-command-heading">

                            <div>
                                <small>
                                    Navegação inteligente
                                </small>

                                <strong>
                                    Central de comandos
                                </strong>
                            </div>

                            <span id="aura-command-count">
                                0 resultados
                            </span>

                        </div>

                        <div
                            id="aura-command-list"
                            class="aura-command-list"
                        ></div>

                        <div class="aura-command-footer">

                            <span>
                                <kbd>↑</kbd>
                                <kbd>↓</kbd>
                                Navegar
                            </span>

                            <span>
                                <kbd>Enter</kbd>
                                Abrir
                            </span>

                            <span>
                                <kbd>Esc</kbd>
                                Fechar
                            </span>

                        </div>

                    </div>

                </div>
            `
        );

        const modal =
            document.getElementById(
                "aura-command-modal"
            );

        const input =
            document.getElementById(
                "aura-command-input"
            );

        const lista =
            document.getElementById(
                "aura-command-list"
            );

        const contador =
            document.getElementById(
                "aura-command-count"
            );

        const fecharBotao =
            document.getElementById(
                "aura-command-close"
            );

        const itens = [

            {
                titulo: "Visão Geral",
                descricao: "Dashboard e central operacional",
                grupo: "Navegação",
                view: "view-dashboard",
                palavras: "inicio painel dashboard cockpit"
            },

            {
                titulo: "Produtos",
                descricao: "Catálogo, estoque e ofertas",
                grupo: "Navegação",
                view: "view-produtos",
                palavras: "produto catalogo oferta estoque"
            },

            {
                titulo: "Configurações da Loja",
                descricao: "Identidade, cores e vitrine",
                grupo: "Navegação",
                view: "view-perfil",
                palavras: "configuracao loja perfil cores visual"
            },

            {
                titulo: "Pixels e Domínio",
                descricao: "Integrações e endereço da loja",
                grupo: "Navegação",
                view: "view-dominios",
                palavras: "pixel dominio integracao url"
            },

            {
                titulo: "Leads",
                descricao: "Contatos e oportunidades",
                grupo: "Navegação",
                view: "view-leads",
                palavras: "lead contato cliente crm captura"
            },

            {
                titulo: "Automação de Leads",
                descricao: "Regras e jornadas comerciais",
                grupo: "Navegação",
                view: "view-automacao-leads",
                palavras: "automacao fluxo regra jornada"
            },

            {
                titulo: "Templates",
                descricao: "Mensagens prontas",
                grupo: "Navegação",
                view: "view-templates",
                palavras: "template mensagem whatsapp resposta"
            },

            {
                titulo: "Campanhas",
                descricao: "Ofertas e ações comerciais",
                grupo: "Navegação",
                view: "view-campanhas",
                palavras: "campanha marketing oferta promocao"
            },

            {
                titulo: "Landing Pages",
                descricao: "Páginas de conversão",
                grupo: "Navegação",
                view: "view-landing-pages",
                palavras: "landing page pagina conversao editor"
            },

            {
                titulo: "Pedidos",
                descricao: "Vendas e pagamentos",
                grupo: "Navegação",
                view: "view-pedidos",
                palavras: "pedido venda pagamento financeiro"
            },

            {
                titulo: "Métricas",
                descricao: "Resultados e desempenho",
                grupo: "Navegação",
                view: "view-metricas",
                palavras: "metrica relatorio resultado analytics"
            },

            {
                titulo: "Notificações",
                descricao: "Avisos da operação",
                grupo: "Navegação",
                view: "view-notificacoes",
                palavras: "notificacao aviso alerta"
            },

            {
                titulo: "Personalização Premium",
                descricao: "Aparência avançada do painel",
                grupo: "Navegação",
                view: "view-personalizacao",
                palavras: "personalizacao visual painel tema"
            },

            {
                titulo: "Guia do Plano",
                descricao: "Recursos disponíveis",
                grupo: "Navegação",
                view: "view-guia",
                palavras: "guia plano recurso ajuda"
            },

            {
                titulo: "Funcionários",
                descricao: "Equipe e permissões",
                grupo: "Navegação",
                view: "view-funcionarios",
                palavras: "funcionario equipe acesso permissao"
            },

            {
                titulo: "Cadastrar produto",
                descricao: "Criar uma nova oferta",
                grupo: "Ações rápidas",
                acao: "novo-produto",
                palavras: "novo criar cadastrar produto oferta"
            },

            {
                titulo: "Registrar pedido",
                descricao: "Adicionar uma nova venda",
                grupo: "Ações rápidas",
                acao: "novo-pedido",
                palavras: "novo criar registrar pedido venda"
            },

            {
                titulo: "Criar template",
                descricao: "Cadastrar uma mensagem pronta",
                grupo: "Ações rápidas",
                acao: "novo-template",
                palavras: "novo criar template mensagem"
            },

            {
                titulo: "Criar Landing Page",
                descricao: "Iniciar uma nova página",
                grupo: "Ações rápidas",
                acao: "nova-landing-page",
                palavras: "novo criar landing page pagina"
            }

        ];

        let resultados = [];
        let selecionado = 0;

        const normalizar = valor =>
            String(valor || "")
                .normalize("NFD")
                .replace(
                    /[\u0300-\u036f]/g,
                    ""
                )
                .toLowerCase()
                .trim();

        const abrirView = viewId => {

            const botaoMenu =
                document.querySelector(
                    `.nav-item[data-target="${viewId}"]`
                );

            if (botaoMenu) {
                botaoMenu.click();
                return;
            }

            if (
                typeof window.ativarAba ===
                "function"
            ) {
                window.ativarAba(viewId);
            }

        };

        const abrirDepois = (
            viewId,
            callback
        ) => {

            abrirView(viewId);

            setTimeout(() => {

                const view =
                    document.getElementById(
                        viewId
                    );

                if (
                    view &&
                    !view.classList.contains(
                        "active"
                    )
                ) {
                    return;
                }

                callback?.();

            }, 220);

        };

        const fechar = () => {

            modal.classList.add(
                "hidden"
            );

            modal.setAttribute(
                "aria-hidden",
                "true"
            );

            document.body.classList.remove(
                "aura-command-open"
            );

        };

        const executar = item => {

            if (!item) return;

            fechar();

            if (item.view) {
                abrirView(item.view);
                return;
            }

            const acoes = {

                "novo-produto": () => {

abrirDepois(
    "view-dashboard",
    () =>
        document
            .getElementById(
                "btn-abrir-criacao"
            )
            ?.click()
);

                },

                "novo-pedido": () => {

                    abrirDepois(
                        "view-pedidos",
                        () =>
                            window
                                .abrirModalPedido?.()
                    );

                },

                "novo-template": () => {

                    abrirDepois(
                        "view-templates",
                        () =>
                            window
                                .abrirModalTemplate?.()
                    );

                },

                "nova-landing-page": () => {

                    abrirDepois(
                        "view-landing-pages",
                        () =>
                            window
                                .abrirModalLP?.()
                    );

                }

            };

            acoes[item.acao]?.();

        };

        const atualizarSelecionado = () => {

            const botoes = [
                ...lista.querySelectorAll(
                    ".aura-command-item"
                )
            ];

            if (!botoes.length) {
                selecionado = 0;
                return;
            }

            selecionado =
                Math.max(
                    0,
                    Math.min(
                        selecionado,
                        botoes.length - 1
                    )
                );

            botoes.forEach(
                (botao, indice) => {

                    botao.classList.toggle(
                        "is-selected",
                        indice === selecionado
                    );

                }
            );

            botoes[selecionado]
                ?.scrollIntoView({
                    block: "nearest"
                });

        };

        const renderizar = termoOriginal => {

            const termo =
                normalizar(termoOriginal);

            resultados =
                itens.filter(item => {

                    if (
                        item.view &&
                        !document.getElementById(
                            item.view
                        )
                    ) {
                        return false;
                    }

                    const conteudo =
                        normalizar(
                            [
                                item.titulo,
                                item.descricao,
                                item.grupo,
                                item.palavras
                            ].join(" ")
                        );

                    return (
                        !termo ||
                        conteudo.includes(termo)
                    );

                });

            selecionado = 0;

            contador.textContent =
                resultados.length === 1
                    ? "1 resultado"
                    : `${resultados.length} resultados`;

            if (!resultados.length) {

                lista.innerHTML = `
                    <div class="aura-command-empty">

                        <strong>
                            Nenhum resultado encontrado
                        </strong>

                        <span>
                            Tente pesquisar outro módulo ou ação.
                        </span>

                    </div>
                `;

                return;

            }

            let grupoAtual = "";

            lista.innerHTML =
                resultados
                    .map((item, indice) => {

                        const cabecalho =
                            item.grupo !== grupoAtual
                                ? `
                                    <div class="aura-command-group">
                                        ${item.grupo}
                                    </div>
                                `
                                : "";

                        grupoAtual = item.grupo;

                        return `
                            ${cabecalho}

                            <button
                                type="button"
                                class="aura-command-item"
                                data-command-index="${indice}"
                                data-command-kind="${
                                    item.acao
                                        ? "action"
                                        : "navigation"
                                }"
                            >

                                <span class="aura-command-item-icon"></span>

                                <span class="aura-command-item-copy">

                                    <strong>
                                        ${item.titulo}
                                    </strong>

                                    <small>
                                        ${item.descricao}
                                    </small>

                                </span>

                                <span class="aura-command-item-badge">

                                    ${
                                        item.acao
                                            ? "Executar"
                                            : "Abrir"
                                    }

                                </span>

                            </button>
                        `;

                    })
                    .join("");

            atualizarSelecionado();

        };

        const abrir = () => {

            modal.classList.remove(
                "hidden"
            );

            modal.setAttribute(
                "aria-hidden",
                "false"
            );

            document.body.classList.add(
                "aura-command-open"
            );

            input.value = "";

            renderizar("");

            setTimeout(() => {
                input.focus();
            }, 50);

        };

        input.addEventListener(
            "input",
            () => {
                renderizar(input.value);
            }
        );

        input.addEventListener(
            "keydown",
            evento => {

                if (
                    evento.key ===
                    "ArrowDown"
                ) {

                    evento.preventDefault();

                    selecionado =
                        Math.min(
                            selecionado + 1,
                            resultados.length - 1
                        );

                    atualizarSelecionado();

                }

                if (
                    evento.key ===
                    "ArrowUp"
                ) {

                    evento.preventDefault();

                    selecionado =
                        Math.max(
                            selecionado - 1,
                            0
                        );

                    atualizarSelecionado();

                }

                if (
                    evento.key ===
                    "Enter"
                ) {

                    evento.preventDefault();

                    executar(
                        resultados[selecionado]
                    );

                }

            }
        );

        lista.addEventListener(
            "mousemove",
            evento => {

                const botao =
                    evento.target.closest(
                        ".aura-command-item"
                    );

                if (!botao) return;

                selecionado =
                    Number(
                        botao.dataset
                            .commandIndex
                    );

                atualizarSelecionado();

            }
        );

        lista.addEventListener(
            "click",
            evento => {

                const botao =
                    evento.target.closest(
                        ".aura-command-item"
                    );

                if (!botao) return;

                executar(
                    resultados[
                        Number(
                            botao.dataset
                                .commandIndex
                        )
                    ]
                );

            }
        );

        modal.addEventListener(
            "click",
            evento => {

                if (evento.target === modal) {
                    fechar();
                }

            }
        );

        fecharBotao.addEventListener(
            "click",
            fechar
        );

        document.addEventListener(
            "keydown",
            evento => {

                const teclaK =
                    String(evento?.key || "")
                        .toLowerCase() === "k";

                if (
                    teclaK &&
                    (
                        evento.ctrlKey ||
                        evento.metaKey
                    )
                ) {

                    evento.preventDefault();

                    if (
                        modal.classList.contains(
                            "hidden"
                        )
                    ) {
                        abrir();
                    } else {
                        fechar();
                    }

                    return;

                }

                if (
                    evento.key === "Escape" &&
                    !modal.classList.contains(
                        "hidden"
                    )
                ) {
                    fechar();
                }

            }
        );

        document
            .querySelector(
                ".aura-sidebar-search kbd"
            )
            ?.addEventListener(
                "click",
                abrir
            );

        window.abrirAuraCommandCenter =
            abrir;

        window.fecharAuraCommandCenter =
            fechar;

    };

    if (
        document.readyState ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            iniciar,
            { once: true }
        );

    } else {

        iniciar();

    }

})();

/* =========================================================
   ESTÚDIO DE CONFIGURAÇÕES DA LOJA
   Organiza os blocos existentes sem alterar IDs ou Firebase.
   ========================================================= */

function inicializarStudioConfiguracoes() {

    const view =
        document.getElementById("view-perfil");

    if (
        !view ||
        view.dataset.studioReady === "1"
    ) {
        return;
    }

    const blocos = [
        ...view.querySelectorAll(
            ":scope > .layout-block[data-block-id]"
        )
    ];

    if (!blocos.length) {
        return;
    }

    view.dataset.studioReady = "1";

    const descricoes = {

        identidade:
            "Logo, nome público, endereço e apresentação da loja",

        "banners-config":
            "Imagens promocionais exibidas na sua vitrine",

        "redes-sociais":
            "WhatsApp, Instagram, TikTok e YouTube",

        "links-destaque":
            "Atalhos personalizados para páginas externas",

        "carrinho-config":
            "Funcionamento e mensagem do carrinho de compras",

        "chat-config":
            "Canal de atendimento direto pelo WhatsApp",

        "layout-vitrine":
            "Organização inicial da sua loja pública",

        "aparencia-cores":
            "Cores, tipografia, cards e identidade visual",

        "links-utm":
            "Endereços preparados para campanhas e tráfego"

    };

    const normalizarTexto = valor =>
        String(valor || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim();

    const barra =
        document.createElement("div");

    barra.className =
        "aura-settings-studio";

    barra.innerHTML = `
        <div class="aura-settings-studio-top">

            <div class="aura-settings-studio-title">

                <span class="aura-settings-studio-icon">

                    <svg viewBox="0 0 24 24"
                         fill="none"
                         stroke="currentColor">

                        <path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z"></path>
                        <path d="m4 7 8 4 8-4"></path>
                        <path d="M12 11v10"></path>

                    </svg>

                </span>

                <div>

                    <small>
                        Painel de configuração
                    </small>

                    <strong>
                        Organize sua vitrine por etapas
                    </strong>

                </div>

            </div>

            <div class="aura-settings-studio-actions">

                <button
                    type="button"
                    data-settings-action="expandir"
                >
                    Expandir tudo
                </button>

                <button
                    type="button"
                    data-settings-action="recolher"
                >
                    Recolher tudo
                </button>

            </div>

        </div>

        <div class="aura-settings-studio-search">

            <svg viewBox="0 0 24 24"
                 fill="none"
                 stroke="currentColor">

                <circle cx="11" cy="11" r="7"></circle>
                <path d="m20 20-4-4"></path>

            </svg>

            <div
                class="aura-settings-search-editor"
                contenteditable="true"
                role="searchbox"
                spellcheck="false"
                data-placeholder="Pesquisar uma configuração..."
            ></div>

            <span data-settings-result-count>
                ${blocos.length} áreas
            </span>

        </div>

        <div
            class="aura-settings-studio-navigation"
            data-settings-navigation
        ></div>

        <div
            class="aura-settings-no-results hidden"
            data-settings-no-results
        >

            <svg viewBox="0 0 24 24"
                 fill="none"
                 stroke="currentColor">

                <circle cx="11" cy="11" r="7"></circle>
                <path d="m20 20-4-4"></path>

            </svg>

            <strong>
                Nenhuma configuração encontrada
            </strong>

            <span>
                Tente pesquisar usando outro termo.
            </span>

        </div>
    `;

    const cabecalho =
        view.querySelector(
            ".aura-store-settings-header"
        );

    if (cabecalho) {
        cabecalho.insertAdjacentElement(
            "afterend",
            barra
        );
    } else {
        view.prepend(barra);
    }

    const navegacao =
        barra.querySelector(
            "[data-settings-navigation]"
        );

    const contador =
        barra.querySelector(
            "[data-settings-result-count]"
        );

    const semResultados =
        barra.querySelector(
            "[data-settings-no-results]"
        );

    const pesquisa =
        barra.querySelector(
            ".aura-settings-search-editor"
        );

    const definirRecolhido = (
        bloco,
        recolhido
    ) => {

        const corpo =
            bloco.querySelector(
                ":scope > .aura-settings-panel-body"
            );

        const titulo =
            bloco.querySelector(
                ":scope > .aura-settings-panel-header"
            );

        bloco.classList.toggle(
            "is-collapsed",
            recolhido
        );

        if (corpo) {
            corpo.hidden = recolhido;
        }

        if (titulo) {
            titulo.setAttribute(
                "aria-expanded",
                String(!recolhido)
            );
        }

    };

    const ativarNavegacao = id => {

        navegacao
            .querySelectorAll(
                ".aura-settings-nav-button"
            )
            .forEach(botao => {

                botao.classList.toggle(
                    "is-active",
                    botao.dataset.settingsTarget === id
                );

            });

    };

    const abrirPainel = (
        bloco,
        rolar = true
    ) => {

        if (!bloco) {
            return;
        }

        definirRecolhido(
            bloco,
            false
        );

        ativarNavegacao(
            bloco.dataset.blockId
        );

        if (rolar) {

            setTimeout(() => {

                bloco.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });

            }, 60);

        }

    };

    blocos.forEach(
        (bloco, indice) => {

            const id =
                bloco.dataset.blockId;

            const nome =
                bloco.dataset.blockNome ||
                `Configuração ${indice + 1}`;

            const descricao =
                descricoes[id] ||
                "Ajustes da sua loja";

            bloco.classList.add(
                "aura-settings-panel"
            );

            bloco.dataset.settingsSearch =
                normalizarTexto(
                    `${nome} ${descricao} ${bloco.textContent}`
                );

            const titulo =
                [...bloco.children].find(
                    elemento =>
                        elemento.tagName === "H3"
                );

            if (!titulo) {
                return;
            }

            titulo.className =
                "aura-settings-panel-header";

            titulo.setAttribute(
                "role",
                "button"
            );

            titulo.setAttribute(
                "tabindex",
                "0"
            );

            titulo.setAttribute(
                "aria-expanded",
                indice === 0
                    ? "true"
                    : "false"
            );

            titulo.innerHTML = `

                <span class="aura-settings-panel-number">
                    ${String(indice + 1).padStart(2, "0")}
                </span>

                <span class="aura-settings-panel-heading">

                    <strong>
                        ${nome}
                    </strong>

                    <small>
                        ${descricao}
                    </small>

                </span>

                <span class="aura-settings-panel-state">
                    Configurar
                </span>

                <svg
                    class="aura-settings-panel-chevron"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                >
                    <path d="m6 9 6 6 6-6"></path>
                </svg>
            `;

            const corpo =
                document.createElement("div");

            corpo.className =
                "aura-settings-panel-body";

            [...bloco.children].forEach(
                elemento => {

                    if (
                        elemento !== titulo &&
                        !elemento.classList.contains(
                            "layout-block-controle"
                        )
                    ) {
                        corpo.appendChild(elemento);
                    }

                }
            );

            bloco.appendChild(corpo);

            titulo.addEventListener(
                "click",
                () => {

                    const estaRecolhido =
                        bloco.classList.contains(
                            "is-collapsed"
                        );

                    definirRecolhido(
                        bloco,
                        !estaRecolhido
                    );

                    ativarNavegacao(id);

                }
            );

            titulo.addEventListener(
                "keydown",
                evento => {

                    if (
                        evento.key !== "Enter" &&
                        evento.key !== " "
                    ) {
                        return;
                    }

                    evento.preventDefault();
                    titulo.click();

                }
            );

            const botaoNavegacao =
                document.createElement("button");

            botaoNavegacao.type =
                "button";

            botaoNavegacao.className =
                "aura-settings-nav-button";

            botaoNavegacao.dataset.settingsTarget =
                id;

            botaoNavegacao.innerHTML = `
                <span>
                    ${String(indice + 1).padStart(2, "0")}
                </span>

                ${nome}
            `;

            botaoNavegacao.addEventListener(
                "click",
                () => {

                    abrirPainel(
                        bloco,
                        true
                    );

                }
            );

            navegacao.appendChild(
                botaoNavegacao
            );

            definirRecolhido(
                bloco,
                indice !== 0
            );

        }
    );

    ativarNavegacao(
        blocos[0]?.dataset.blockId
    );

    barra
        .querySelector(
            '[data-settings-action="expandir"]'
        )
        ?.addEventListener(
            "click",
            () => {

                blocos.forEach(bloco => {
                    definirRecolhido(
                        bloco,
                        false
                    );
                });

            }
        );

    barra
        .querySelector(
            '[data-settings-action="recolher"]'
        )
        ?.addEventListener(
            "click",
            () => {

                blocos.forEach(bloco => {
                    definirRecolhido(
                        bloco,
                        true
                    );
                });

            }
        );

    pesquisa?.addEventListener(
        "keydown",
        evento => {

            if (evento.key === "Enter") {
                evento.preventDefault();
            }

        }
    );

    pesquisa?.addEventListener(
        "input",
        () => {

            const termo =
                normalizarTexto(
                    pesquisa.textContent
                );

            let encontrados = 0;

            blocos.forEach(bloco => {

                const corresponde =
                    !termo ||
                    bloco.dataset
                        .settingsSearch
                        .includes(termo);

                bloco.classList.toggle(
                    "aura-settings-hidden",
                    !corresponde
                );

                const botao =
                    navegacao.querySelector(
                        `[data-settings-target="${bloco.dataset.blockId}"]`
                    );

                botao?.classList.toggle(
                    "aura-settings-hidden",
                    !corresponde
                );

                if (corresponde) {

                    encontrados++;

                    if (termo) {
                        definirRecolhido(
                            bloco,
                            false
                        );
                    }

                }

            });

            if (contador) {

                contador.textContent =
                    encontrados === 1
                        ? "1 área"
                        : `${encontrados} áreas`;

            }

            semResultados?.classList.toggle(
                "hidden",
                encontrados !== 0
            );

        }
    );

}

if (document.readyState === "loading") {

    document.addEventListener(
        "DOMContentLoaded",
        inicializarStudioConfiguracoes,
        { once: true }
    );

} else {

    inicializarStudioConfiguracoes();

}
// =============================================
        // BLOQUEIO IMEDIATO DE PLANO (evita flash de conteúdo liberado)
        // =============================================
        // Bloqueia as abas pagas ANTES de qualquer chamada ao Firebase, pra nunca
        // existir uma janela de tempo em que elas apareçam liberadas por engano.
        const BLOQUEIOS_NAV = {
            "view-templates": "templates",
            "view-campanhas": "campanhas",
            "view-metricas": "metricas",
            "view-pedidos": "hub",
            "view-funcionarios": "subcontas",
            "view-landing-pages": "lp"
        };

        const PERMISSOES_NAV = {
            "view-produtos": "produtos",
            "view-pedidos": "pedidos",
            "view-leads": "leads",
            "view-automacao-leads": "leads",
            "view-templates": "templates",
            "view-campanhas": "campanhas",
            "view-metricas": "metricas",
            "view-personalizacao": "configuracoes",
            "view-funcionarios": "funcionarios",
            "view-landing-pages": "landing-pages"
        };

        function moduloPermissaoPorAba(targetId) {
            return normalizeModuleKey(PERMISSOES_NAV[targetId] || "");
        }

        function podeVerAba(targetId) {
            const contexto = VideHubContext.getSnapshot();
            if (!contexto.initialized) return false;
            const modulo = moduloPermissaoPorAba(targetId);
            return !modulo || VideHubContext.canView(modulo);
        }

        function podeEditarModulo(modulo) {
            const contexto = VideHubContext.getSnapshot();
            if (!contexto.initialized || !contexto.active) return false;
            const moduloNormalizado = normalizeModuleKey(modulo);
            return !moduloNormalizado || VideHubContext.canEdit(moduloNormalizado);
        }

        function exigirEdicaoModulo(modulo) {
            const contexto = VideHubContext.getSnapshot();
            if (!contexto.initialized) {
                showToast("Carregando suas permissões. Aguarde um instante.", "error");
                return false;
            }
            if (!contexto.active) {
                showToast("Sessão inválida. Entre novamente.", "error");
                return false;
            }
            if (podeEditarModulo(modulo)) return true;
            showToast("Você tem acesso somente leitura neste módulo.", "error");
            return false;
        }

        window._planoCarregado = false;

window._featureBloqueio = {};

const chaveCacheAlvo = new URLSearchParams(window.location.search).get("masterUID") || "own";
let featuresCache = [];
try { featuresCache = JSON.parse(localStorage.getItem("ultimoPlanoFeatures_" + chaveCacheAlvo) || "[]"); } catch(e) { featuresCache = []; }
document.querySelectorAll("#sidebar-nav button[data-target]").forEach(btn => {

const target = btn.getAttribute("data-target");

if (!BLOQUEIOS_NAV[target]) return;

if (featuresCache.includes(BLOQUEIOS_NAV[target])) return;

btn.classList.add("opacity-40");
            const badge = document.createElement("span");
            badge.className = "cadeado-badge";
            badge.setAttribute("data-tip", "Verificando seu plano...");
            badge.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>`;
            btn.appendChild(badge);
            btn.addEventListener("click", (e) => {
                if (!window._planoCarregado) {
                    e.stopImmediatePropagation();
                    showToast("Carregando suas permissões, aguarde um instante...", "error");
                    return;
                }
                const nomePlano = window._featureBloqueio[target];
                if (nomePlano) {
                    e.stopImmediatePropagation();
                    showToast(`Disponível a partir do plano ${nomePlano}.`, "error");
                    const secao = document.getElementById(target);
                    if (secao) secao.classList.remove("active");
                }
            }, true);
        });

        document.querySelectorAll("#sidebar-nav button").forEach(button => {
            button.addEventListener("click", () => {
                ativarAba(button.getAttribute("data-target"));

                // Auto-fechar menu no mobile após seleção
                if(window.innerWidth < 768) {
                    document.getElementById("sidebar-nav").classList.add("hidden");
                    document.getElementById("box-atalho").classList.add("hidden");
                    document.getElementById("box-logout").classList.add("hidden");
                }
            });
        });

        // A aba salva só é restaurada DEPOIS que o plano carregar e os cadeados
        // forem aplicados (ver dentro do onAuthStateChanged, mais abaixo).
        // Isso evita que uma aba bloqueada apareça por um instante antes do cadeado.
        window._abaSalva = localStorage.getItem("abaAtivaDashboard");

        // TOAST ENGINE — VIDE AURA OS
        function showToast(message, type = "success") {
            const container = document.getElementById("toast-container");

            if (!container) {
                return;
            }

            // "success" e "info" tinham título e cor próprios pensados na hora
            // de escrever esta função, mas só "success" ficou com checagem
            // própria — qualquer outro tipo (inclusive "info") caía direto no
            // estilo de erro ("Atenção necessária", vermelho), mesmo pra avisos
            // neutros como "Abrindo editor...".
            const estilosPorTipo = {
                success: { classe: "success", titulo: "Operação concluída" },
                info: { classe: "info", titulo: "Aviso" }
            };
            const estilo = estilosPorTipo[type] || { classe: "error", titulo: "Atenção necessária" };

            const toast = document.createElement("div");

            toast.className =
                `aura-toast aura-toast-${estilo.classe} pointer-events-auto`;

            const icones = {
                success: `
                    <svg viewBox="0 0 24 24"
                         fill="none"
                         stroke="currentColor">

                        <path stroke-linecap="round"
                              stroke-linejoin="round"
                              d="m5 12 4 4L19 6">
                        </path>

                    </svg>
                `,
                info: `
                    <svg viewBox="0 0 24 24"
                         fill="none"
                         stroke="currentColor">

                        <circle cx="12" cy="12" r="9"></circle>

                        <path stroke-linecap="round"
                              stroke-linejoin="round"
                              d="M12 11v5">
                        </path>

                        <path stroke-linecap="round"
                              stroke-linejoin="round"
                              d="M12 8h.01">
                        </path>

                    </svg>
                `,
                error: `
                    <svg viewBox="0 0 24 24"
                         fill="none"
                         stroke="currentColor">

                        <path stroke-linecap="round"
                              stroke-linejoin="round"
                              d="M12 8v5">
                        </path>

                        <path stroke-linecap="round"
                              stroke-linejoin="round"
                              d="M12 17h.01">
                        </path>

                        <path stroke-linecap="round"
                              stroke-linejoin="round"
                              d="M10.3 3.9 2.7 17a2 2 0 0 0 1.73 3h15.14a2 2 0 0 0 1.73-3L13.7 3.9a2 2 0 0 0-3.4 0Z">
                        </path>

                    </svg>
                `
            };
            const icone = icones[estilo.classe];

            toast.innerHTML = `
                <div class="aura-toast-icon">
                    ${icone}
                </div>

                <div class="aura-toast-content">

                    <p class="aura-toast-title no-contrast">
                        ${estilo.titulo}
                    </p>

                    <p class="aura-toast-message no-contrast"></p>

                </div>

                <button type="button"
                        class="aura-toast-close"
                        aria-label="Fechar mensagem">

                    <svg viewBox="0 0 24 24"
                         fill="none"
                         stroke="currentColor">

                        <path stroke-linecap="round"
                              stroke-linejoin="round"
                              d="m6 6 12 12M18 6 6 18">
                        </path>

                    </svg>

                </button>

                <div class="aura-toast-progress"></div>
            `;

            const mensagemElemento =
                toast.querySelector(".aura-toast-message");

            mensagemElemento.textContent = message;

            const removerToast = function() {
                if (toast.dataset.removendo === "true") {
                    return;
                }

                toast.dataset.removendo = "true";
                toast.classList.add("aura-toast-exit");

                setTimeout(function() {
                    toast.remove();
                }, 350);
            };

            toast
                .querySelector(".aura-toast-close")
                .addEventListener("click", removerToast);

            container.appendChild(toast);

            requestAnimationFrame(function() {
                toast.classList.add("aura-toast-visible");
            });

            setTimeout(removerToast, 4000);
        }

        // ELEMENTOS EM TEMPO REAL (MUDANÇA INSTANTÂNEA)
        const inputsReflexao = ['perf-nome-loja', 'perf-slug', 'perf-titulo', 'perf-subtitulo'];
        inputsReflexao.forEach(id => {
            document.getElementById(id).addEventListener('input', () => {
                const slugValue = document.getElementById("perf-slug").value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "");
                atualizarLinksLojaPublica(slugValue);

                document.getElementById("url-loja-preview").innerText = slugValue ? `vide.digital/${slugValue}` : "vide.digital/";

                document.getElementById("txt-preview-nome-loja").innerText =
                    document.getElementById("perf-nome-loja").value || "Visão Geral";
            });
        });

        // =============================================
        // TEMAS PRONTOS (aplica um pacote inteiro de cores + fonte de uma vez)
        // =============================================
        const TEMAS_PRONTOS = {
            dark_premium: {
                nome: "Dark Premium", icone: "⚫",
                admin: { fundo: "#030712", destaque: "#00f2fe", texto: "#e5e7eb", card: "#0d0d16" },
                vitrine: { fundo: "#030712", destaque: "#00f2fe", card: "#0c0c14", secundaria: "#4facfe", texto: "#e5e7eb", textoBotao: "#000000", borda: "#ffffff" },
                fonte: "Plus Jakarta Sans"
            },
            clean_white: {
                nome: "Clean White", icone: "⚪",
                admin: { fundo: "#f8fafc", destaque: "#2563eb", texto: "#0f172a", card: "#ffffff" },
                vitrine: { fundo: "#ffffff", destaque: "#2563eb", card: "#f8fafc", secundaria: "#60a5fa", texto: "#0f172a", textoBotao: "#ffffff", borda: "#0f172a" },
                fonte: "Inter"
            },
            neon: {
                nome: "Neon", icone: "🟣",
                admin: { fundo: "#0a0014", destaque: "#ff00e5", texto: "#f0e5ff", card: "#150022" },
                vitrine: { fundo: "#0a0014", destaque: "#ff00e5", card: "#150022", secundaria: "#00f2fe", texto: "#f0e5ff", textoBotao: "#000000", borda: "#ff00e5" },
                fonte: "Space Grotesk"
            },
            luxo_dourado: {
                nome: "Luxo Dourado", icone: "🟡",
                admin: { fundo: "#0a0a0a", destaque: "#d4af37", texto: "#f5f0e0", card: "#141414" },
                vitrine: { fundo: "#0a0a0a", destaque: "#d4af37", card: "#141414", secundaria: "#f0d878", texto: "#f5f0e0", textoBotao: "#000000", borda: "#d4af37" },
                fonte: "Cormorant Garamond"
            },
            rosa_elegante: {
                nome: "Rosa Elegante", icone: "🌸",
                admin: { fundo: "#1a0e14", destaque: "#ff6b9d", texto: "#f5e6ea", card: "#241219" },
                vitrine: { fundo: "#1a0e14", destaque: "#ff6b9d", card: "#241219", secundaria: "#ffb3c6", texto: "#f5e6ea", textoBotao: "#000000", borda: "#ff6b9d" },
                fonte: "Quicksand"
            },
            pastel_doce: {
                nome: "Pastel Doce", icone: "🧁",
                admin: { fundo: "#fffaf5", destaque: "#ff9eb5", texto: "#4a3b3b", card: "#ffffff" },
                vitrine: { fundo: "#fff8f0", destaque: "#ff9eb5", card: "#ffffff", secundaria: "#ffd166", texto: "#4a3b3b", textoBotao: "#ffffff", borda: "#ff9eb5" },
                fonte: "Nunito"
            },
            barbearia_classica: {
                nome: "Barbearia Clássica", icone: "💈",
                admin: { fundo: "#0f0c09", destaque: "#c9922f", texto: "#ede4d3", card: "#1a1410" },
                vitrine: { fundo: "#1a1410", destaque: "#c9922f", card: "#241c16", secundaria: "#8b5a2b", texto: "#ede4d3", textoBotao: "#000000", borda: "#c9922f" },
                fonte: "Oswald"
            },
            oceano: {
                nome: "Oceano", icone: "🌊",
                admin: { fundo: "#04191c", destaque: "#00d9c0", texto: "#dff7f5", card: "#0a2a2e" },
                vitrine: { fundo: "#04191c", destaque: "#00d9c0", card: "#0a2a2e", secundaria: "#4fd8e8", texto: "#dff7f5", textoBotao: "#000000", borda: "#00d9c0" },
                fonte: "Outfit"
            },
            sunset: {
                nome: "Sunset", icone: "🌅",
                admin: { fundo: "#1a0e0a", destaque: "#ff6b35", texto: "#fdeee5", card: "#26140f" },
                vitrine: { fundo: "#1a0e0a", destaque: "#ff6b35", card: "#26140f", secundaria: "#ffb84d", texto: "#fdeee5", textoBotao: "#000000", borda: "#ff6b35" },
                fonte: "DM Sans"
            },
            floresta: {
                nome: "Floresta", icone: "🌲",
                admin: { fundo: "#0c1712", destaque: "#6fae52", texto: "#e8f0e5", card: "#16241c" },
                vitrine: { fundo: "#0c1712", destaque: "#6fae52", card: "#16241c", secundaria: "#c9a227", texto: "#e8f0e5", textoBotao: "#000000", borda: "#6fae52" },
                fonte: "Merriweather"
            },
            menta_fresca: {
                nome: "Menta Fresca", icone: "🌿",
                admin: { fundo: "#f5fdfa", destaque: "#10b981", texto: "#0f2e24", card: "#ffffff" },
                vitrine: { fundo: "#f0faf7", destaque: "#10b981", card: "#ffffff", secundaria: "#6ee7b7", texto: "#0f2e24", textoBotao: "#ffffff", borda: "#10b981" },
                fonte: "Manrope"
            },
            vinho: {
                nome: "Vinho", icone: "🍷",
                admin: { fundo: "#180508", destaque: "#a4243b", texto: "#f2e0e3", card: "#240a10" },
                vitrine: { fundo: "#180508", destaque: "#a4243b", card: "#240a10", secundaria: "#d88c9a", texto: "#f2e0e3", textoBotao: "#ffffff", borda: "#a4243b" },
                fonte: "Playfair Display"
            },
            ceu_noturno: {
                nome: "Céu Noturno", icone: "🌌",
                admin: { fundo: "#060b18", destaque: "#5b8def", texto: "#e3e8f5", card: "#0d1526" },
                vitrine: { fundo: "#060b18", destaque: "#5b8def", card: "#0d1526", secundaria: "#b8c4e0", texto: "#e3e8f5", textoBotao: "#000000", borda: "#5b8def" },
                fonte: "Josefin Sans"
            },
            lavanda: {
                nome: "Lavanda", icone: "💜",
                admin: { fundo: "#14101c", destaque: "#a78bfa", texto: "#ede9f7", card: "#1e1830" },
                vitrine: { fundo: "#14101c", destaque: "#a78bfa", card: "#1e1830", secundaria: "#ddd6fe", texto: "#ede9f7", textoBotao: "#000000", borda: "#a78bfa" },
                fonte: "Montserrat"
            },
            industrial: {
                nome: "Industrial", icone: "🏁",
                admin: { fundo: "#0d0d0d", destaque: "#e63946", texto: "#e5e5e5", card: "#1a1a1a" },
                vitrine: { fundo: "#0d0d0d", destaque: "#e63946", card: "#1a1a1a", secundaria: "#8d8d8d", texto: "#e5e5e5", textoBotao: "#ffffff", borda: "#e63946" },
                fonte: "Roboto"
            },
            cafe: {
                nome: "Café", icone: "☕",
                admin: { fundo: "#170f0a", destaque: "#c17f45", texto: "#f0e2d0", card: "#221610" },
                vitrine: { fundo: "#170f0a", destaque: "#c17f45", card: "#221610", secundaria: "#e8c39e", texto: "#f0e2d0", textoBotao: "#000000", borda: "#c17f45" },
                fonte: "Poppins"
            },
            rosa_suave: {
                nome: "Rosa Suave", icone: "🌷",
                admin: { fundo: "#fff8fa", destaque: "#ec4899", texto: "#4a2530", card: "#ffffff" },
                vitrine: { fundo: "#fff5f8", destaque: "#ec4899", card: "#ffffff", secundaria: "#fbcfe8", texto: "#4a2530", textoBotao: "#ffffff", borda: "#ec4899" },
                fonte: "Quicksand"
            },
            confeitaria_rosa: {
                nome: "Confeitaria Rosa", icone: "🍰",
                admin: { fundo: "#fefaf6", destaque: "#e0729a", texto: "#5c3a2e", card: "#ffffff" },
                vitrine: { fundo: "#fef6f0", destaque: "#e0729a", card: "#ffffff", secundaria: "#f6c453", texto: "#5c3a2e", textoBotao: "#ffffff", borda: "#e0729a" },
                fonte: "Dancing Script"
            },
            branco_suave: {
                nome: "Branco Suave", icone: "🤍",
                admin: { fundo: "#fdfdfc", destaque: "#c9a0a5", texto: "#3a3230", card: "#ffffff" },
                vitrine: { fundo: "#fdfdfc", destaque: "#c9a0a5", card: "#ffffff", secundaria: "#e8d5d0", texto: "#3a3230", textoBotao: "#ffffff", borda: "#c9a0a5" },
                fonte: "Josefin Sans"
            },
            algodao_doce: {
                nome: "Algodão Doce", icone: "🍭",
                admin: { fundo: "#fdf9ff", destaque: "#d946ef", texto: "#453056", card: "#ffffff" },
                vitrine: { fundo: "#faf5ff", destaque: "#d946ef", card: "#ffffff", secundaria: "#a5b4fc", texto: "#453056", textoBotao: "#ffffff", borda: "#d946ef" },
                fonte: "Nunito"
            },
            merengue: {
                nome: "Merengue", icone: "🥐",
                admin: { fundo: "#fffefb", destaque: "#f2a65a", texto: "#5a4632", card: "#ffffff" },
                vitrine: { fundo: "#fffdf7", destaque: "#f2a65a", card: "#ffffff", secundaria: "#ffe8cc", texto: "#5a4632", textoBotao: "#ffffff", borda: "#f2a65a" },
                fonte: "Cormorant Garamond"
            }
        };

        function renderizarTemasProntos() {
            const box = document.getElementById("lista-temas-prontos");
            if (!box) return;
            box.innerHTML = Object.entries(TEMAS_PRONTOS).map(([key, t]) => `
                <button type="button" onclick="aplicarTemaPronto('${key}')" class="group text-left bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 hover:border-white/20 rounded-xl p-3 transition-all">
                    <div class="flex gap-1 mb-2">
                        <span class="h-5 w-5 rounded-full border border-white/10" style="background:${t.vitrine.fundo}"></span>
                        <span class="h-5 w-5 rounded-full border border-white/10" style="background:${t.vitrine.destaque}"></span>
                        <span class="h-5 w-5 rounded-full border border-white/10" style="background:${t.vitrine.secundaria}"></span>
                        <span class="h-5 w-5 rounded-full border border-white/10" style="background:${t.vitrine.card}"></span>
                    </div>
                    <p class="text-xs font-bold text-white">${t.icone} ${t.nome}</p>
                </button>
            `).join("");
        }
        renderizarTemasProntos();

        window.aplicarTemaPronto = function(key) {
            const t = TEMAS_PRONTOS[key];
            if (!t) return;
            const campos = {
                "perf-admin-cor-fundo": t.admin.fundo,
                "perf-admin-cor-destaque": t.admin.destaque,
                "perf-admin-cor-texto": t.admin.texto,
                "perf-admin-cor-card": t.admin.card,
                "perf-cor-fundo": t.vitrine.fundo,
                "perf-cor-destaque": t.vitrine.destaque,
                "perf-cor-card": t.vitrine.card,
                "perf-cor-secundaria": t.vitrine.secundaria,
                "perf-cor-texto": t.vitrine.texto,
                "perf-cor-texto-botao": t.vitrine.textoBotao,
                "perf-cor-borda": t.vitrine.borda
            };
            Object.entries(campos).forEach(([id, valor]) => {
                const input = document.getElementById(id);
                if (input) { input.value = valor; input.dispatchEvent(new Event("input")); }
            });
            document.getElementById("perf-fonte-vitrine").value = t.fonte;
            showToast(`Tema "${t.nome}" aplicado! Ajuste o que quiser e clique em Salvar.`);
        };

        // ESCUTADORES DE CORES PARA REFLETIR NA HORA NO ADMIN E CALCULAR CONTRASTE
                document.getElementById("perf-admin-cor-fundo").addEventListener("input", (e) => {
            document.documentElement.style.setProperty("--sys-fundo", e.target.value);
            document.getElementById("admin-body").style.backgroundColor = e.target.value;
            verificarContrasteFundo(e.target.value);
        });
        function aplicarCorDestaqueAdmin(cor) {
            document.documentElement.style.setProperty('--admin-accent', cor);
            document.documentElement.style.setProperty('--sys-destaque', cor);
            document.documentElement.style.setProperty('--sys-primaria', cor);
            const logoBox = document.getElementById("admin-logo-box");
            if (logoBox) logoBox.style.background = cor;
            const onlineDot = document.getElementById("admin-online-dot");
            if (onlineDot) onlineDot.style.backgroundColor = cor;
        }

        document.getElementById("perf-admin-cor-destaque").addEventListener("input", (e) => {
            aplicarCorDestaqueAdmin(e.target.value);
        });

document.getElementById("perf-admin-cor-texto").addEventListener("input", (e) => {
            document.documentElement.style.setProperty("--sys-texto", e.target.value);
            document.getElementById("admin-body").style.color = e.target.value;
        });
        document.getElementById("perf-admin-cor-card").addEventListener("input", (e) => {
            document.querySelectorAll(".glass-card").forEach(card => {
                card.style.backgroundColor = e.target.value;
            });
        });

        // =============================================
        // LANDING PAGES (7.6 - Fase B: tela de gestao)
        // =============================================
       async function carregarLandingPages() {
            const grid =
                document.getElementById("lps-grid");

            const totalElemento =
                document.getElementById("lp-total-count");

            const publicadasElemento =
                document.getElementById("lp-publicadas-count");

            const rascunhosElemento =
                document.getElementById("lp-rascunhos-count");

            if (!grid) return;

            try {
                const snap = await getDocs(
                    query(
                        collection(db, "landing_pages"),
                        where("donoUID", "==", usuarioUID)
                    )
                );

                let lps = [];

                snap.forEach(d => {
                    lps.push({
                        id: d.id,
                        ...d.data()
                    });
                });

                lps.sort(
                    (a, b) =>
                        (b.atualizadoEm || 0) -
                        (a.atualizadoEm || 0)
                );

                const total = lps.length;

                const publicadas =
                    lps.filter(lp => lp.publicado).length;

                const rascunhos =
                    total - publicadas;

                if (totalElemento) {
                    totalElemento.innerText = total;
                }

                if (publicadasElemento) {
                    publicadasElemento.innerText = publicadas;
                }

                if (rascunhosElemento) {
                    rascunhosElemento.innerText = rascunhos;
                }

                // Visualizações reais só existem pra LPs publicadas (o doc de
                // métrica nasce quando alguém acessa a página no ar). Busca em
                // paralelo, uma por LP -- se alguma falhar, não trava o card,
                // só deixa a contagem daquela LP como null (mostra "--").
                const visualizacoesPorId = {};
                await Promise.all(lps.filter(lp => lp.publicado).map(async (lp) => {
                    try {
                        const docIdMetrica = `${slugAtualSalvo}__${lp.pagina}`.toLowerCase();
                        const metricaSnap = await getDoc(doc(db, "metricas_landing_pages", docIdMetrica));
                        visualizacoesPorId[lp.id] = metricaSnap.exists() ? (metricaSnap.data().totalVisualizacoes || 0) : 0;
                    } catch (err) {
                        visualizacoesPorId[lp.id] = null;
                    }
                }));

                if (lps.length === 0) {
                    const destaques = [MODELOS_LP[0], MODELOS_LP[1], MODELOS_LP[6]];
                    const cartoesDestaque = destaques.map((modelo) => `
                        <button type="button" class="aura-lp-modelo-card" onclick="iniciarLPComModelo('${modelo.id}')">
                            <span class="aura-lp-modelo-dot" style="background:${modelo.cor}"></span>
                            <strong>${modelo.nome}</strong>
                            <small>${modelo.objetivo}</small>
                        </button>
                    `).join("");

                    grid.innerHTML = `
                        <div class="aura-lp-empty">

                            <span>

                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                    <rect x="4" y="3" width="16" height="18" rx="2"></rect>
                                    <path d="M8 8h8"></path>
                                    <path d="M8 12h8"></path>
                                    <path d="M8 16h5"></path>
                                </svg>

                            </span>

                            <strong>
                                Nenhuma Landing Page criada
                            </strong>

                            <p>
                                Comece com um modelo pronto ou crie do zero -- tudo continua editável depois.
                            </p>

                            <div class="aura-lp-empty-modelos">
                                ${cartoesDestaque}
                            </div>

                            <button onclick="abrirModalLP()">
                                Ou comece do zero
                            </button>

                        </div>
                    `;

                    return;
                }

                grid.innerHTML = lps.map(lp => {
                    const url =
                        `https://videdigital.github.io/vide-digital/${slugAtualSalvo}/${lp.pagina}`;

                    const dataFormatada =
                        lp.atualizadoEm
                            ? new Date(
                                lp.atualizadoEm
                            ).toLocaleDateString("pt-BR")
                            : "Data não informada";

                    const quantidadeBlocos =
                        Array.isArray(lp.ordemBlocos)
                            ? lp.ordemBlocos.length
                            : 0;

                    // Só mostramos a linha de visitas quando ela tem um número
                    // real: LP publicada E a leitura funcionou. Se a leitura
                    // falhar (ex.: a Cloud Function / regra de métricas ainda
                    // não foi publicada no Firebase), `visualizacoes` vem null
                    // e a linha simplesmente não aparece -- nada de "visitas
                    // indisponíveis" poluindo o card. Assim que o backend
                    // estiver no ar, a contagem acende sozinha sem mexer aqui.
                    const visualizacoes = visualizacoesPorId[lp.id];
                    const mostrarVisualizacoes = lp.publicado && typeof visualizacoes === "number";
                    const textoVisualizacoes = mostrarVisualizacoes
                        ? `${visualizacoes} ${visualizacoes === 1 ? "visualização" : "visualizações"}`
                        : "";

                    // Mini-preview: em vez de um ícone genérico igual em todo
                    // card, desenhamos uma "miniatura" da página -- uma faixa
                    // de topo (tipo o hero) e algumas linhas de conteúdo cuja
                    // quantidade reflete quantos blocos a página tem. Larguras
                    // variadas dão um ar de página real. Usa só o número de
                    // blocos que já temos em mãos, sem leitura extra.
                    const linhasPreview = Math.max(1, Math.min(quantidadeBlocos, 4));
                    const largurasPreview = ["92%", "70%", "84%", "58%"];
                    const preview = `
                        <span class="aura-lp-card-preview" aria-hidden="true">
                            <span class="aura-lp-card-preview-hero"></span>
                            ${Array.from({ length: linhasPreview }).map((_, i) =>
                                `<span class="aura-lp-card-preview-line" style="width:${largurasPreview[i % largurasPreview.length]}"></span>`
                            ).join("")}
                        </span>
                    `;

                    return `
                        <div class="glass-card aura-lp-card ${lp.publicado ? "is-published" : "is-draft"}">

                            <div class="aura-lp-card-top">

                                ${preview}

                                <span class="aura-lp-card-status">

                                    <i></i>

                                    ${lp.publicado ? "Publicada" : "Rascunho"}

                                </span>

                            </div>

                            <div class="aura-lp-card-content">

                                <h3>
                                    ${lp.titulo || "Landing Page sem título"}
                                </h3>

                                <div class="aura-lp-card-url">

                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                        <path d="M10.5 13.5a4 4 0 0 0 5.66 0l2.34-2.34a4 4 0 0 0-5.66-5.66l-1.34 1.34"></path>
                                        <path d="M13.5 10.5a4 4 0 0 0-5.66 0L5.5 12.84a4 4 0 0 0 5.66 5.66l1.34-1.34"></path>
                                    </svg>

                                    <span>
                                        /${lp.pagina}
                                    </span>

                                </div>

                            </div>

                            <div class="aura-lp-card-info">

                                <span>

                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                        <circle cx="12" cy="12" r="9"></circle>
                                        <path d="M12 7v5l3 2"></path>
                                    </svg>

                                    ${dataFormatada}

                                </span>

                                <span>

                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                        <path d="M12 3 3 8l9 5 9-5-9-5Z"></path>
                                        <path d="m3 12 9 5 9-5"></path>
                                    </svg>

                                    ${quantidadeBlocos} bloco(s)

                                </span>

                                ${mostrarVisualizacoes ? `
                                <button type="button" class="aura-lp-card-views" title="Ver tendência de visitas" data-metrica-doc-id="${`${slugAtualSalvo}__${lp.pagina}`.toLowerCase()}" data-lp-titulo="${escaparHtmlChat(lp.titulo || "Landing Page")}" onclick="abrirMetricasLP(this)">

                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                        <path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z"></path>
                                        <circle cx="12" cy="12" r="3"></circle>
                                    </svg>

                                    ${textoVisualizacoes}

                                </button>
                                ` : ``}

                            </div>

                            <div class="aura-lp-card-actions">

                                <button
                                    onclick="editarLP('${lp.id}')"
                                    class="aura-lp-edit-button"
                                >

                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                        <path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z"></path>
                                        <path d="m13.5 6.5 4 4"></path>
                                    </svg>

                                    Abrir editor

                                </button>

                                <button
                                    onclick="window.open('${url}', '_blank')"
                                    title="Abrir página"
                                    class="aura-lp-icon-button"
                                >

                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                        <path d="M14 5h5v5"></path>
                                        <path d="M10 14 19 5"></path>
                                        <path d="M19 13v6H5V5h6"></path>
                                    </svg>

                                </button>

                                <button
                                    onclick="alternarPublicacaoLP('${lp.id}', ${!lp.publicado})"
                                    title="${lp.publicado ? "Despublicar" : "Publicar"}"
                                    class="aura-lp-icon-button aura-lp-publish-button"
                                >

                                    ${
                                        lp.publicado
                                            ? `
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                    <circle cx="12" cy="12" r="9"></circle>
                                                    <path d="M9.5 9v6"></path>
                                                    <path d="M14.5 9v6"></path>
                                                </svg>
                                            `
                                            : `
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                    <circle cx="12" cy="12" r="9"></circle>
                                                    <path d="m10 8 6 4-6 4V8Z"></path>
                                                </svg>
                                            `
                                    }

                                </button>

                                ${lp.publicado ? `
                                <button
                                    onclick="abrirCompartilharLP(this)"
                                    data-share-url="${escaparHtmlChat(url)}"
                                    data-share-titulo="${escaparHtmlChat(lp.titulo || "Landing Page")}"
                                    title="Compartilhar / QR Code"
                                    class="aura-lp-icon-button"
                                >

                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                        <rect x="3" y="3" width="7" height="7" rx="1"></rect>
                                        <rect x="14" y="3" width="7" height="7" rx="1"></rect>
                                        <rect x="3" y="14" width="7" height="7" rx="1"></rect>
                                        <path d="M14 14h3v3"></path>
                                        <path d="M17 21h4v-4"></path>
                                        <path d="M14 21h.01"></path>
                                        <path d="M21 14v.01"></path>
                                    </svg>

                                </button>
                                ` : ``}

                                <button
                                    onclick="duplicarLP('${lp.id}')"
                                    title="Duplicar"
                                    class="aura-lp-icon-button"
                                >

                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                        <rect x="8" y="8" width="11" height="11" rx="2"></rect>
                                        <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"></path>
                                    </svg>

                                </button>

                                <button
                                    onclick="excluirLP('${lp.id}')"
                                    title="Excluir"
                                    class="aura-lp-icon-button aura-lp-delete-button"
                                >

                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                        <path d="M4 7h16"></path>
                                        <path d="M10 11v6"></path>
                                        <path d="M14 11v6"></path>
                                        <path d="m6 7 1 14h10l1-14"></path>
                                        <path d="M9 7V4h6v3"></path>
                                    </svg>

                                </button>

                            </div>

                        </div>
                    `;

                }).join("");

            } catch(err) {
                console.error(err);

                if (totalElemento) totalElemento.innerText = "—";
                if (publicadasElemento) publicadasElemento.innerText = "—";
                if (rascunhosElemento) rascunhosElemento.innerText = "—";

                grid.innerHTML = `
                    <div class="aura-lp-error">
                        Não foi possível carregar as Landing Pages.
                    </div>
                `;
            }
        }
        // Modelos prontos pra começar a Landing Page: só a vitrine (id, nome,
        // objetivo, cor) fica aqui, pra aparecer no modal de criação sem
        // precisar carregar o Studio inteiro (~600KB) ainda. Os blocos de
        // verdade de cada modelo continuam só em studio-library.js (pageKits)
        // e são inseridos via window.AuraStudioPro.insertPreset(id) depois que
        // o editor abre — os ids abaixo têm que bater com os de lá.
        const MODELOS_LP = [
            { id: "kit-vendas-premium", nome: "Página de vendas", objetivo: "Vender", cor: "#7C3AED" },
            { id: "kit-lancamento", nome: "Lançamento", objetivo: "Lançar", cor: "#A78BFA" },
            { id: "kit-evento", nome: "Evento", objetivo: "Inscrever", cor: "#2563EB" },
            { id: "kit-servicos", nome: "Serviços", objetivo: "Apresentar", cor: "#10B981" },
            { id: "kit-institucional", nome: "Institucional", objetivo: "Construir marca", cor: "#E5E7EB" },
            { id: "kit-catalogo", nome: "Catálogo de produtos", objetivo: "Vender", cor: "#E11D48" },
            { id: "kit-lead", nome: "Captação de leads", objetivo: "Captar", cor: "#D97706" },
            { id: "kit-whatsapp", nome: "Atendimento no WhatsApp", objetivo: "Atender", cor: "#22C55E" }
        ];
        let lpModeloEscolhido = null;

        function renderizarModelosLP() {
            const grid = document.getElementById("lp-modelos-grid");
            if (!grid) return;
            const cartaoEmBranco = `
                <button type="button" class="aura-lp-modelo-card is-active" data-modelo-id="" onclick="selecionarModeloLP('')">
                    <span class="aura-lp-modelo-dot" style="background:var(--aura-text-muted)">✎</span>
                    <strong>Em branco</strong>
                    <small>Comece do zero</small>
                </button>
            `;
            const cartoesModelos = MODELOS_LP.map((modelo) => `
                <button type="button" class="aura-lp-modelo-card" data-modelo-id="${modelo.id}" onclick="selecionarModeloLP('${modelo.id}')">
                    <span class="aura-lp-modelo-dot" style="background:${modelo.cor}"></span>
                    <strong>${modelo.nome}</strong>
                    <small>${modelo.objetivo}</small>
                </button>
            `).join("");
            grid.innerHTML = cartaoEmBranco + cartoesModelos;
        }

        window.selecionarModeloLP = function(id) {
            lpModeloEscolhido = id || null;
            document.querySelectorAll(".aura-lp-modelo-card").forEach((card) => {
                card.classList.toggle("is-active", card.dataset.modeloId === (id || ""));
            });
        };

        // Atalho pro estado vazio (nenhuma LP criada ainda): abre o modal já
        // com um modelo pré-selecionado, poupando o clique extra de escolher
        // de novo algo que a pessoa já escolheu na tela anterior.
        window.iniciarLPComModelo = function(modeloId) {
            abrirModalLP();
            if (modeloId) selecionarModeloLP(modeloId);
        };

        window.fecharMetricasLP = function() {
            document.getElementById("lp-metricas-modal")?.classList.add("hidden");
            window._lpMetricasChart?.destroy();
            window._lpMetricasChart = null;
        };

        window.abrirMetricasLP = async function(botao) {
            const docId = botao.dataset.metricaDocId;
            const titulo = botao.dataset.lpTitulo || "Landing Page";
            document.getElementById("lp-metricas-titulo").textContent = titulo;
            document.getElementById("lp-metricas-total-numero").textContent = "...";
            document.getElementById("lp-metricas-modal")?.classList.remove("hidden");

            try {
                const snap = await getDoc(doc(db, "metricas_landing_pages", docId));
                const dados = snap.exists() ? snap.data() : {};

                document.getElementById("lp-metricas-total-numero").textContent =
                    dados.totalVisualizacoes || 0;

                // A visita é gravada com porDia como mapa aninhado
                // ({ porDia: { "2026-07-21": { visualizacoes: N } } }), então
                // navegamos porDia[dia].visualizacoes.
                const porDiaLP = dados.porDia || {};
                const labels = [];
                const valores = [];
                for (let i = 13; i >= 0; i--) {
                    const dia = new Date();
                    dia.setDate(dia.getDate() - i);
                    const chave = dia.toISOString().slice(0, 10);
                    labels.push(dia.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }));
                    valores.push(porDiaLP[chave]?.visualizacoes || 0);
                }

                const canvas = document.getElementById("lp-metricas-chart");
                const vazio = document.getElementById("lp-metricas-vazio");
                const temAlgumaVisita = valores.some(v => v > 0);
                // O gráfico depende do Chart.js (CDN). Se ele não estiver
                // disponível, o número total ainda é útil sozinho -- então
                // caímos no mesmo estado "sem gráfico" em vez de quebrar.
                const podeDesenharGrafico = temAlgumaVisita && typeof Chart !== "undefined";

                window._lpMetricasChart?.destroy();
                window._lpMetricasChart = null;
                if (!podeDesenharGrafico) {
                    canvas.classList.add("hidden");
                    vazio?.classList.remove("hidden");
                    if (vazio) {
                        vazio.textContent = temAlgumaVisita
                            ? "Gráfico indisponível no momento, mas o total acima está correto."
                            : "Ainda sem visitas registradas nos últimos dias.";
                    }
                } else {
                    canvas.classList.remove("hidden");
                    vazio?.classList.add("hidden");
                    const estilos = getComputedStyle(document.documentElement);
                    const corPrimaria = estilos.getPropertyValue("--sys-primaria").trim() || "#5B3DF5";
                    window._lpMetricasChart = new Chart(canvas.getContext("2d"), {
                        type: "line",
                        data: {
                            labels,
                            datasets: [{
                                label: "Visualizações",
                                data: valores,
                                borderColor: corPrimaria,
                                backgroundColor: converterHexParaRgba(corPrimaria, 0.18),
                                borderWidth: 2,
                                fill: true,
                                tension: 0.35,
                                pointRadius: 0,
                                pointHoverRadius: 5
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { legend: { display: false } },
                            scales: {
                                x: { ticks: { color: "rgba(255,255,255,.4)", font: { size: 9 } }, grid: { display: false } },
                                y: { beginAtZero: true, ticks: { color: "rgba(255,255,255,.4)", font: { size: 9 }, precision: 0 }, grid: { color: "rgba(255,255,255,.05)" } }
                            }
                        }
                    });
                }
            } catch (err) {
                console.error(err);
                // Não sobrescreve o total (já mostrado acima) -- só sinaliza o
                // gráfico como indisponível pra não deixar a área quebrada.
                const vazio = document.getElementById("lp-metricas-vazio");
                document.getElementById("lp-metricas-chart")?.classList.add("hidden");
                if (vazio) {
                    vazio.classList.remove("hidden");
                    vazio.textContent = "Não foi possível carregar o gráfico agora.";
                }
            }
        };

        window.abrirModalLP = function() {
            document.getElementById("lp-modal-titulo").innerText =
                "Nova Landing Page";

            document.getElementById("lp-id-edicao").value = "";
            document.getElementById("lp-titulo").value = "";
            document.getElementById("lp-slug").value = "";
            lpModeloEscolhido = null;
            renderizarModelosLP();

            document
                .getElementById("lp-modal")
                .classList.remove("hidden");

            setTimeout(() => {
                document
                    .getElementById("lp-titulo")
                    ?.focus();
            }, 80);
        };

        window.fecharModalLP = function() {
            document
                .getElementById("lp-modal")
                .classList.add("hidden");

            document.getElementById("lp-id-edicao").value = "";
            document.getElementById("lp-titulo").value = "";
            document.getElementById("lp-slug").value = "";
        };
        let lpEditorId = null;
        let scriptsEditorJaCarregados = false;
        let lpEditorBlocos = [];
        window.lpEditorBlocos = lpEditorBlocos;
        window.renderizarEditorBlocos = function() { renderizarEditorBlocos(); };
        let lpEditorRemovidos = [];
        let lpEditorPublicado = false;
        let lpEditorSlugOriginal = "";
        let historicoEditor = [];
        let indiceHistorico = -1;
        let historicoDebounceTimer = null;
        const lpEditorShellState = {
            aberto: false,
            opener: null,
            abortController: null,
            bodyOverflowAnterior: "",
            htmlOverflowAnterior: "",
            scrollX: 0,
            scrollY: 0
        };

        function obterShellEditorLP() {
            return document.getElementById("lp-editor-modal");
        }

        function elementoFocavelEditorLP(elemento) {
            return elemento instanceof HTMLElement &&
                typeof elemento.focus === "function" &&
                !elemento.hasAttribute("disabled") &&
                elemento.getAttribute("aria-hidden") !== "true";
        }

        function esconderSuperficiesTransitivasEditorLP() {
            document.getElementById("lped-modal-renomear-pagina")?.classList.add("hidden");
            document.getElementById("lped-modal-excluir-pagina")?.classList.add("hidden");
            document.getElementById("lp-blocos-panel")?.classList.add("hidden");
            document.getElementById("lped-painel-camadas")?.classList.add("hidden");
            fecharMenuContexto();
        }

        function lidarComEscapeShellEditorLP(evento) {
            if (evento.key !== "Escape") return;

            const modal = obterShellEditorLP();
            if (!modal || modal.classList.contains("hidden")) return;

            evento.preventDefault();
            evento.stopImmediatePropagation();

            const modalRenomear = document.getElementById("lped-modal-renomear-pagina");
            if (modalRenomear && !modalRenomear.classList.contains("hidden")) {
                window.fecharModalRenomearPagina?.();
                return;
            }

            const modalExcluir = document.getElementById("lped-modal-excluir-pagina");
            if (modalExcluir && !modalExcluir.classList.contains("hidden")) {
                window.fecharModalExcluirPagina?.();
                return;
            }

            const painelBlocos = document.getElementById("lp-blocos-panel");
            if (painelBlocos && !painelBlocos.classList.contains("hidden")) {
                if (typeof window.fecharPainelBlocos === "function") window.fecharPainelBlocos();
                else painelBlocos.classList.add("hidden");
                return;
            }

            const painelCamadas = document.getElementById("lped-painel-camadas");
            if (painelCamadas && !painelCamadas.classList.contains("hidden")) {
                painelCamadas.classList.add("hidden");
                return;
            }

            // Auditoria e Comando são superfícies do Aura Studio Pro (carregado
            // sob demanda), então este arquivo não conhece suas funções de
            // fechar — só o estado visível (classe "hidden"). Sem isto, Esc
            // não achava nenhuma superfície conhecida aberta e fechava o
            // editor inteiro junto com o painel.
            const painelAuditoria = document.querySelector(".aura-studio-audit");
            if (painelAuditoria && !painelAuditoria.classList.contains("hidden")) {
                painelAuditoria.classList.add("hidden");
                return;
            }

            const painelComando = document.getElementById("aura-studio-command");
            if (painelComando && !painelComando.classList.contains("hidden")) {
                painelComando.classList.add("hidden");
                return;
            }

            const menuContexto = document.getElementById("lped-menu-contexto");
            if (menuContexto && !menuContexto.classList.contains("hidden")) {
                fecharMenuContexto();
                return;
            }

            if (blocosSelecionadosLivre.size > 0) {
                blocosSelecionadosLivre.clear();
                renderizarPreviewEditor();
                return;
            }

            fecharShellEditorLP("escape");
        }

        function abrirShellEditorLP(opcoes = {}) {
            const modal = obterShellEditorLP();
            if (!modal) return false;

            if (lpEditorShellState.aberto) {
                modal.classList.remove("hidden");
                modal.setAttribute("aria-hidden", "false");
                document.body.style.overflow = "hidden";
                document.documentElement.style.overflow = "hidden";
                return true;
            }

            lpEditorShellState.aberto = true;
            lpEditorShellState.opener = elementoFocavelEditorLP(opcoes.opener) ? opcoes.opener : document.activeElement;
            lpEditorShellState.bodyOverflowAnterior = document.body.style.overflow;
            lpEditorShellState.htmlOverflowAnterior = document.documentElement.style.overflow;
            lpEditorShellState.scrollX = window.scrollX || 0;
            lpEditorShellState.scrollY = window.scrollY || 0;
            lpEditorShellState.abortController = new AbortController();

            modal.classList.remove("hidden");
            modal.setAttribute("aria-hidden", "false");
            document.body.style.overflow = "hidden";
            document.documentElement.style.overflow = "hidden";
            setTimeout(() => {
                const shellAberto = !modal.classList.contains("hidden") &&
                    modal.getAttribute("aria-hidden") === "false";
                if (shellAberto && lpEditorShellState.aberto) {
                    document.body.style.overflow = "hidden";
                    document.documentElement.style.overflow = "hidden";
                }
            }, 0);

            document.addEventListener("keydown", lidarComEscapeShellEditorLP, {
                capture: true,
                signal: lpEditorShellState.abortController.signal
            });

            const btnFechar = modal.querySelector("[data-lp-editor-close]");
            if (btnFechar) {
                btnFechar.addEventListener("click", window.fecharEditorLP, {
                    signal: lpEditorShellState.abortController.signal
                });
                setTimeout(() => btnFechar.focus(), 0);
            }

            return true;
        }

        function fecharShellEditorLP(motivo = "manual") {
            const modal = obterShellEditorLP();
            if (!modal) return false;

            esconderSuperficiesTransitivasEditorLP();
            modal.classList.add("hidden");
            modal.setAttribute("aria-hidden", "true");

            if (lpEditorShellState.abortController) {
                lpEditorShellState.abortController.abort();
                lpEditorShellState.abortController = null;
            }

            document.body.style.overflow = lpEditorShellState.bodyOverflowAnterior || "";
            document.documentElement.style.overflow = lpEditorShellState.htmlOverflowAnterior || "";
            if (motivo !== "reload") {
                window.scrollTo(lpEditorShellState.scrollX || 0, lpEditorShellState.scrollY || 0);
            }

            const opener = lpEditorShellState.opener;
            lpEditorShellState.aberto = false;
            lpEditorShellState.opener = null;

            if (elementoFocavelEditorLP(opener) && opener.isConnected) {
                setTimeout(() => opener.focus(), 0);
            }

            carregarLandingPages();
            return true;
        }

        window.abrirShellEditorLP = abrirShellEditorLP;
        window.alternarPainelLateral = function() {
            const painel = document.getElementById("lped-painel-lateral");
            const btn = document.getElementById("lped-btn-colapsar-painel");
            const icone = document.getElementById("lped-icone-colapsar");
            const colapsado = painel.style.width === "0px";
            if (colapsado) {
                painel.style.width = "430px";
                painel.style.padding = "";
                painel.style.opacity = "1";
                painel.style.overflow = "auto";
                btn.style.left = "422px";
                icone.setAttribute("d", "M15 19l-7-7 7-7");
            } else {
                painel.style.width = "0px";
                painel.style.padding = "0px";
                painel.style.opacity = "0";
                painel.style.overflow = "hidden";
                btn.style.left = "4px";
                icone.setAttribute("d", "M9 5l7 7-7 7");
            }
        };
        let lpEditorModoLayout = "empilhado";
        window.alternarModoLayout = function(modo) {
            if (modo === "livre") {
                let yAcumulado = 20;
                lpEditorBlocos.forEach((b, i) => {
                    if (b.x === undefined) {
                        const elAtual = document.getElementById("lped-preview-bloco-" + i);
                        const alturaMedida = elAtual ? Math.max(150, elAtual.offsetHeight) : 300;
                        b.x = 20;
                        b.y = yAcumulado;
                        b.largura = 600;
                        b.altura = alturaMedida;
                        b.zIndex = i + 1;
                        yAcumulado += alturaMedida + 20;
                    }
                });
            }
            lpEditorModoLayout = modo;
            atualizarBotoesModoLayout();
            renderizarEditorBlocos();
            salvarHistoricoEditor();
        };
        function atualizarBotoesModoLayout() {
            const btnE = document.getElementById("lped-btn-modo-empilhado");
            const btnL = document.getElementById("lped-btn-modo-livre");
            if (!btnE || !btnL) return;
            btnE.className = "px-2.5 py-1.5 rounded-md text-[10px] font-bold transition-all " + (lpEditorModoLayout === "empilhado" ? "bg-[#FF7A45] text-white" : "text-gray-400 hover:text-white");
            btnL.className = "px-2.5 py-1.5 rounded-md text-[10px] font-bold transition-all " + (lpEditorModoLayout === "livre" ? "bg-[#FF7A45] text-white" : "text-gray-400 hover:text-white");
        }
function moverCamada(i, direcao) {
            const livres = lpEditorBlocos.map((b, idx) => ({ b, idx })).filter(x => x.b.x !== undefined && blocoNaPaginaAtual(x.b));
            livres.sort((a, c) => (a.b.zIndex || 0) - (c.b.zIndex || 0));
            const pos = livres.findIndex(x => x.idx === i);
            if (pos === -1) return;
            const novaPos = pos + direcao;
            if (novaPos < 0 || novaPos >= livres.length) return;
            const temp = livres[pos];
            livres[pos] = livres[novaPos];
            livres[novaPos] = temp;
            livres.forEach((x, ordem) => { x.b.zIndex = ordem + 1; });
            renderizarPreviewEditor();
            renderizarPainelCamadas();
            salvarHistoricoEditor();
        }
        window.trazerParaFrente = function(i) {
            moverCamada(i, 1);
        };
        window.enviarParaTras = function(i) {
            moverCamada(i, -1);
        };
        window.alternarPainelCamadas = function() {
            const painel = document.getElementById("lped-painel-camadas");
            if (!painel) return;
            painel.classList.toggle("hidden");
            if (!painel.classList.contains("hidden")) renderizarPainelCamadas();
        };
        function renderizarPainelCamadas() {
            const lista = document.getElementById("lped-camadas-lista");
            const painel = document.getElementById("lped-painel-camadas");
            if (!lista || !painel || painel.classList.contains("hidden")) return;
            if (lpEditorModoLayout !== "livre") {
                lista.innerHTML = '<p class="text-[10px] text-gray-500 text-center py-6 px-3">As camadas funcionam no modo Livre. Ative o modo Livre pra gerenciar a ordem dos blocos.</p>';
                return;
            }
const livres = lpEditorBlocos.map((b, idx) => ({ b, idx })).filter(x => x.b.x !== undefined && blocoNaPaginaAtual(x.b));
            livres.sort((a, c) => (c.b.zIndex || 0) - (a.b.zIndex || 0));
            if (livres.length === 0) {
                lista.innerHTML = '<p class="text-[10px] text-gray-500 text-center py-6 px-3">Nenhum bloco ainda.</p>';
                return;
            }
            lista.innerHTML = livres.map((x, pos) => {
                const selecionado = x.b._colapsado === false;
                const oculto = x.b.visivel === false;
                return `
                    <div onclick="selecionarBlocoCamada(${x.idx})" class="flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-all ${selecionado ? "bg-[#FF7A45]/15 border border-[#FF7A45]/40" : "hover:bg-white/5 border border-transparent"}">
                        <span class="text-[9px] text-gray-600 font-mono w-4 shrink-0">${livres.length - pos}</span>
                        <p class="text-[11px] font-bold truncate flex-1 ${oculto ? "text-gray-600 line-through" : "text-white"}">${nomeTipoBlocoEditor(x.b.tipo)}</p>
                        <button onclick="event.stopPropagation(); alternarVisibilidadeCamada(${x.idx})" title="${oculto ? "Mostrar" : "Ocultar"}" class="text-gray-500 hover:text-white shrink-0">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">${oculto ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path>' : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>'}</svg>
                        </button>
                        <button onclick="event.stopPropagation(); trazerParaFrente(${x.idx})" title="Subir camada" class="text-gray-500 hover:text-white text-[10px] px-1 shrink-0">&#9650;</button>
                        <button onclick="event.stopPropagation(); enviarParaTras(${x.idx})" title="Descer camada" class="text-gray-500 hover:text-white text-[10px] px-1 shrink-0">&#9660;</button>
                    </div>
                `;
            }).join("");
        }
        window.selecionarBlocoCamada = function(i) {
            lpEditorBlocos.forEach((b, j) => { b._colapsado = j !== i; });
            renderizarEditorBlocos();
            renderizarPainelCamadas();
            setTimeout(function() {
                const alvo = document.getElementById("lped-preview-bloco-" + i);
                if (alvo) alvo.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 60);
        };
window.alternarVisibilidadeCamada = function(i) {
            lpEditorBlocos[i].visivel = lpEditorBlocos[i].visivel === false;
            renderizarEditorBlocos();
            renderizarPainelCamadas();
            salvarHistoricoEditor();
        };
        let menuContextoIndice = null;
        function fecharMenuContexto() {
            const menu = document.getElementById("lped-menu-contexto");
            if (menu) menu.classList.add("hidden");
            menuContextoIndice = null;
        }
        function abrirMenuContexto(clientX, clientY, idx) {
            const menu = document.getElementById("lped-menu-contexto");
            if (!menu || !lpEditorBlocos[idx]) return;
            menuContextoIndice = idx;
            if (!blocosSelecionadosLivre.has(idx)) {
                blocosSelecionadosLivre.clear();
                blocosSelecionadosLivre.add(idx);
                renderizarPreviewEditor();
            }
            const qtd = blocosSelecionadosLivre.size;
            const oculto = lpEditorBlocos[idx].visivel === false;
            const itemCls = "w-full text-left px-3.5 py-2 text-[11px] font-bold text-gray-300 hover:bg-white/5 hover:text-white transition-all";
            menu.innerHTML = `
                <button onclick="menuCtxEditar()" class="${itemCls}">Editar conteudo</button>
                <button onclick="menuCtxDuplicar()" class="${itemCls}">Duplicar${qtd > 1 ? ` (${qtd})` : ""}</button>
                <div class="h-px bg-white/5 my-1"></div>
                <button onclick="menuCtxCamada(1)" class="${itemCls}">Subir camada</button>
                <button onclick="menuCtxCamada(-1)" class="${itemCls}">Descer camada</button>
                <button onclick="menuCtxOcultar()" class="${itemCls}">${oculto ? "Mostrar" : "Ocultar"}</button>
                <div class="h-px bg-white/5 my-1"></div>
                <button onclick="menuCtxExcluir()" class="w-full text-left px-3.5 py-2 text-[11px] font-bold text-red-400 hover:bg-red-500/10 transition-all">Excluir${qtd > 1 ? ` (${qtd})` : ""}</button>
            `;
            menu.classList.remove("hidden");
            menu.style.left = Math.min(clientX, window.innerWidth - 200) + "px";
            menu.style.top = Math.min(clientY, window.innerHeight - (menu.offsetHeight || 240) - 8) + "px";
        }
        window.menuCtxEditar = function() {
            const i = menuContextoIndice;
            fecharMenuContexto();
            if (i !== null) selecionarBlocoCamada(i);
        };
        window.menuCtxDuplicar = function() {
            const indices = Array.from(blocosSelecionadosLivre).sort((a, c) => a - c);
            fecharMenuContexto();
            if (indices.length === 0) return;
            let maxZ = Math.max(0, ...lpEditorBlocos.map(b => b.zIndex || 0));
            blocosSelecionadosLivre.clear();
            indices.forEach(i => {
                const original = lpEditorBlocos[i];
                if (!original) return;
                const copia = JSON.parse(JSON.stringify(original));
                copia.id = `lpb_${Date.now()}_${lpEditorBlocos.length}`;
                copia._colapsado = true;
                if (copia.x !== undefined) {
                    copia.x = Math.min(copia.x + 20, 1440 - (copia.largura || 600));
                    copia.y = (copia.y || 0) + 20;
                    maxZ++;
                    copia.zIndex = maxZ;
                }
                lpEditorBlocos.push(copia);
            });
            renderizarEditorBlocos();
            salvarHistoricoEditor();
        };
        window.menuCtxCamada = function(direcao) {
            const i = menuContextoIndice;
            fecharMenuContexto();
            if (i !== null) moverCamada(i, direcao);
        };
        window.menuCtxOcultar = function() {
            const i = menuContextoIndice;
            fecharMenuContexto();
            if (i !== null) alternarVisibilidadeCamada(i);
        };
        window.menuCtxExcluir = function() {
            const indices = Array.from(blocosSelecionadosLivre).sort((a, c) => c - a);
            fecharMenuContexto();
            if (indices.length === 0) return;
            indices.forEach(i => {
                const removido = lpEditorBlocos.splice(i, 1)[0];
                if (removido && removido.id) lpEditorRemovidos.push(removido.id);
            });
            blocosSelecionadosLivre.clear();
            renderizarEditorBlocos();
            salvarHistoricoEditor();
        };
        document.getElementById("lped-preview-canvas").addEventListener("contextmenu", function(e) {
            if (lpEditorModoLayout !== "livre") return;
            const handle = e.target.closest(".livre-mover, .resize-handle");
            if (!handle) { fecharMenuContexto(); return; }
            e.preventDefault();
            abrirMenuContexto(e.clientX, e.clientY, parseInt(handle.getAttribute("data-bloco-index")));
        });
document.addEventListener("mousedown", function(e) {
            const menu = document.getElementById("lped-menu-contexto");
            if (menu && !menu.classList.contains("hidden") && !e.target.closest("#lped-menu-contexto")) {
                fecharMenuContexto();
            }
        });
        window.trocarPaginaLP = function(id) {
            lpEditorPaginaAtual = id;
            blocosSelecionadosLivre.clear();
            renderizarBarraPaginas();
            renderizarEditorBlocos();
        };
        window.adicionarPaginaLP = function() {
            const nova = { id: `pg_${Date.now()}`, nome: `Pagina ${lpEditorPaginas.length + 1}` };
            lpEditorPaginas.push(nova);
            trocarPaginaLP(nova.id);
        };
        let paginaEmRenomeacao = null;
        window.renomearPaginaLP = function(id) {
            const pg = lpEditorPaginas.find(p => p.id === id);
            if (!pg) return;
            paginaEmRenomeacao = id;
            document.getElementById("lped-input-renomear-pagina").value = pg.nome;
            document.getElementById("lped-modal-renomear-pagina").classList.remove("hidden");
            setTimeout(() => document.getElementById("lped-input-renomear-pagina").select(), 50);
        };
        window.fecharModalRenomearPagina = function() {
            document.getElementById("lped-modal-renomear-pagina").classList.add("hidden");
            paginaEmRenomeacao = null;
        };
        window.confirmarRenomearPagina = function() {
            const pg = lpEditorPaginas.find(p => p.id === paginaEmRenomeacao);
            const nome = document.getElementById("lped-input-renomear-pagina").value.trim();
            if (pg && nome) { pg.nome = nome; renderizarBarraPaginas(); }
            fecharModalRenomearPagina();
        };
        document.getElementById("lped-input-renomear-pagina").addEventListener("keydown", function(e) {
            if (e.key === "Enter") confirmarRenomearPagina();
            else if (e.key === "Escape") fecharModalRenomearPagina();
        });
        let paginaEmExclusao = null;
        window.excluirPaginaLP = function(id) {
            if (lpEditorPaginas.length <= 1) { showToast("A LP precisa ter pelo menos uma pagina.", "error"); return; }
            const temBlocos = lpEditorBlocos.some(b => b.paginaId === id);
            if (!temBlocos) { executarExclusaoPagina(id); return; }
            paginaEmExclusao = id;
            document.getElementById("lped-modal-excluir-pagina").classList.remove("hidden");
        };
        window.fecharModalExcluirPagina = function() {
            document.getElementById("lped-modal-excluir-pagina").classList.add("hidden");
            paginaEmExclusao = null;
        };
        window.confirmarExcluirPagina = function() {
            const id = paginaEmExclusao;
            fecharModalExcluirPagina();
            if (id) executarExclusaoPagina(id);
        };
        function executarExclusaoPagina(id) {
            for (let i = lpEditorBlocos.length - 1; i >= 0; i--) {
                if (lpEditorBlocos[i].paginaId === id) {
                    const removido = lpEditorBlocos.splice(i, 1)[0];
                    if (removido && removido.id) lpEditorRemovidos.push(removido.id);
                }
            }
            lpEditorPaginas = lpEditorPaginas.filter(p => p.id !== id);
            if (lpEditorPaginaAtual === id) lpEditorPaginaAtual = lpEditorPaginas[0].id;
            blocosSelecionadosLivre.clear();
            renderizarBarraPaginas();
            renderizarEditorBlocos();
            salvarHistoricoEditor();
        }
        function renderizarBarraPaginas() {
            const barra = document.getElementById("lped-barra-paginas");
            if (!barra) return;
            barra.innerHTML = lpEditorPaginas.map(p => `
                <button onclick="trocarPaginaLP('${p.id}')" ondblclick="renomearPaginaLP('${p.id}')" title="Clique 2x pra renomear" class="shrink-0 inline-flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all ${p.id === lpEditorPaginaAtual ? "bg-[#FF7A45] text-white" : "bg-white/5 text-gray-400 hover:bg-white/10"}">
                    ${p.nome}${lpEditorPaginas.length > 1 ? `<span onclick="event.stopPropagation(); excluirPaginaLP('${p.id}')" title="Excluir pagina" class="opacity-60 hover:opacity-100 leading-none">&times;</span>` : ""}
                </button>
            `).join("") + `<button onclick="adicionarPaginaLP()" title="Adicionar pagina" class="shrink-0 text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white transition-all">+</button>`;
        }

        function clonarBlocosEditor() {
            return JSON.parse(JSON.stringify(lpEditorBlocos));
        }
        function salvarHistoricoEditor() {
            historicoEditor = historicoEditor.slice(0, indiceHistorico + 1);
            historicoEditor.push(clonarBlocosEditor());
            indiceHistorico = historicoEditor.length - 1;
            if (historicoEditor.length > 50) {
                historicoEditor.shift();
                indiceHistorico--;
            }
            atualizarBotoesHistoricoEditor();
        }
        function agendarHistoricoEditor() {
            clearTimeout(historicoDebounceTimer);
            historicoDebounceTimer = setTimeout(salvarHistoricoEditor, 800);
        }
        function atualizarBotoesHistoricoEditor() {
            const btnU = document.getElementById("lped-btn-desfazer");
            const btnR = document.getElementById("lped-btn-refazer");
            if (btnU) btnU.style.opacity = indiceHistorico <= 0 ? "0.3" : "1";
            if (btnR) btnR.style.opacity = (indiceHistorico >= historicoEditor.length - 1) ? "0.3" : "1";
        }
        window.desfazerEditor = function() {
            if (indiceHistorico <= 0) return;
            indiceHistorico--;
            lpEditorBlocos.length = 0;
            lpEditorBlocos.push(...JSON.parse(JSON.stringify(historicoEditor[indiceHistorico])));
            renderizarEditorBlocos();
            atualizarBotoesHistoricoEditor();
        };
        window.refazerEditor = function() {
            if (indiceHistorico >= historicoEditor.length - 1) return;
            indiceHistorico++;
            lpEditorBlocos.length = 0;
            lpEditorBlocos.push(...JSON.parse(JSON.stringify(historicoEditor[indiceHistorico])));
            renderizarEditorBlocos();
            atualizarBotoesHistoricoEditor();
        };
        document.addEventListener("keydown", function(e) {
            const modal = document.getElementById("lp-editor-modal");
            if (!modal || modal.classList.contains("hidden")) return;
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && String(e?.key || "").toLowerCase() === "z") {
                e.preventDefault();
                desfazerEditor();
} else if ((e.ctrlKey || e.metaKey) && (String(e?.key || "").toLowerCase() === "y" || (e.shiftKey && String(e?.key || "").toLowerCase() === "z"))) {
                e.preventDefault();
                refazerEditor();
} else if (e.altKey && (e.key === "1" || e.code === "Digit1")) {
                e.preventDefault();
                alternarPainelCamadas();
            } else if (e.key === "Escape" && blocosSelecionadosLivre.size > 0) {
                blocosSelecionadosLivre.clear();
                renderizarPreviewEditor();
            }
        });
        let dispositivoPreviewAtual = "desktop";
        window.alternarDispositivoPreview = function(disp) {
            dispositivoPreviewAtual = disp;
            const frame = document.getElementById("lped-browser-frame");
            if (disp === "mobile") {
                frame.classList.remove("max-w-4xl");
                frame.classList.add("max-w-[380px]");
            } else {
                frame.classList.remove("max-w-[380px]");
                frame.classList.add("max-w-4xl");
            }
            const btnD = document.getElementById("lped-btn-desktop");
            const btnM = document.getElementById("lped-btn-mobile");
            btnD.className = "p-1.5 rounded-md transition-all " + (disp === "desktop" ? "bg-[#FF7A45] text-white" : "text-gray-400 hover:text-white");
            btnM.className = "p-1.5 rounded-md transition-all " + (disp === "mobile" ? "bg-[#FF7A45] text-white" : "text-gray-400 hover:text-white");
        };
        window.atualizarUrlPreviewEditor = function() {
            const slug = document.getElementById("lped-slug").value.trim().toLowerCase() || "sua-pagina";
            document.getElementById("lped-url-preview").innerText = `videdigital.github.io/vide-digital/${slugAtualSalvo}/${slug}`;
        };
        function renderizarBlocoPreview(bloco, indiceBloco) {
            const d = bloco.design || {};
            const corFundo = d.corFundo || "";
            const imagemFundo = d.imagemFundoB64 || "";
            const corSobreposicao = d.corSobreposicao || "#000000";
            const opacidade = (d.opacidadeSobreposicao || 0) / 100;
            const corBotaoFundo = d.corBotaoFundo || "";
            const corBotaoBorda = d.corBotaoBorda || "";
            const corBotaoTexto = d.corBotaoTexto || "";
            const paddingTop = d.paddingTop !== undefined ? d.paddingTop : 64;
            const paddingBottom = d.paddingBottom !== undefined ? d.paddingBottom : 64;
            const alinhamento = d.alinhamento || "esquerda";
            const textAlignClasse = alinhamento === "centro" ? "text-center" : alinhamento === "direita" ? "text-right" : "text-left";
            const itemsClasse = alinhamento === "centro" ? "items-center" : alinhamento === "direita" ? "items-end" : "items-start";
            const justifyClasse = alinhamento === "centro" ? "justify-center" : alinhamento === "direita" ? "justify-end" : "justify-start";
            const estiloBotao = `${corBotaoFundo ? "background-color:" + corBotaoFundo + ";" : ""}${corBotaoBorda ? "border: 2px solid " + corBotaoBorda + ";" : ""}${corBotaoTexto ? "color:" + corBotaoTexto + ";" : ""}`;
            const classeBotao = `inline-block font-bold px-5 py-2.5 rounded-xl text-sm ${!corBotaoFundo ? "bg-white" : ""} ${!corBotaoTexto ? "text-black" : ""}`;
            const classeBotaoForm = `w-full font-bold py-2.5 rounded-xl text-sm text-center ${!corBotaoFundo ? "bg-white" : ""} ${!corBotaoTexto ? "text-black" : ""}`;
            const estiloFundo = imagemFundo
                ? `background-image: url('${imagemFundo}'); background-size: cover; background-position: center;`
                : (corFundo ? `background-color: ${corFundo};` : "");
            const overlayHtml = imagemFundo
                ? `<div style="position:absolute; inset:0; background-color:${corSobreposicao}; opacity:${opacidade};"></div>`
                : "";
            let conteudo = "";
            if (bloco.tipo === "texto_midia") {
                const estiloImgLargura = bloco.props.imagemLargura ? `width:${bloco.props.imagemLargura}px; max-width:100%;` : "width:100%;";
                conteudo = `
                    <div class="max-w-3xl mx-auto px-6 grid md:grid-cols-2 gap-6 ${itemsClasse}">
                        <div class="${bloco.props.posicaoImagem === "esquerda" ? "md:order-2" : ""} ${textAlignClasse}">
                            <h2 class="text-xl font-bold mb-2">${bloco.props.titulo || ""}</h2>
                            <p class="text-gray-300 text-sm mb-3">${bloco.props.subtitulo || ""}</p>
                            ${bloco.props.botaoTexto ? `<span style="${estiloBotao}" class="${classeBotao}">${bloco.props.botaoTexto}</span>` : ""}
                        </div>
                        <div class="${bloco.props.posicaoImagem === "esquerda" ? "md:order-1" : ""}">
                            ${bloco.props.imagemB64 ? `<div class="relative inline-block"><img src="${bloco.props.imagemB64}" style="${estiloImgLargura}" class="rounded-xl"><div class="resize-handle absolute -bottom-1 -right-1 w-3 h-3 bg-white border border-[#5B3DF5] rounded-sm cursor-nwse-resize" data-bloco-index="${indiceBloco}" data-modo-redimensionar="imagem-largura"></div></div>` : '<div class="w-full h-24 bg-white/5 rounded-xl"></div>'}
                        </div>
                    </div>`;
            } else if (bloco.tipo === "formulario_captura") {
                conteudo = `
                    <div class="max-w-sm mx-auto px-6 ${textAlignClasse}">
                        <h2 class="text-lg font-bold mb-3">${bloco.props.titulo || ""}</h2>
                        <div class="space-y-2 text-left">
                            ${(bloco.props.campos || []).map(campo => `<div class="w-full p-2.5 rounded-lg bg-white/5 border border-white/10 text-xs text-gray-500">${campo}</div>`).join("")}
                            <div style="${estiloBotao}" class="${classeBotaoForm}">${bloco.props.textoBotao || "Enviar"}</div>
                        </div>
                    </div>`;
            } else if (bloco.tipo === "faq") {
                const itens = bloco.props.itens || [];
                conteudo = `
                    <div class="max-w-2xl mx-auto px-6 ${textAlignClasse}">
                        ${bloco.props.titulo ? `<h2 class="text-xl font-bold mb-4">${bloco.props.titulo}</h2>` : ""}
                        <div class="space-y-2 text-left">${itens.map(item => `<div class="bg-white/5 border border-white/10 rounded-xl p-3"><p class="font-bold text-sm">${item.pergunta || ""}</p></div>`).join("")}</div>
                    </div>`;
            } else if (bloco.tipo === "galeria_imagens") {
                const imagens = bloco.props.imagens || [];
                conteudo = `
                    <div class="max-w-3xl mx-auto px-6 ${textAlignClasse}">
                        ${bloco.props.titulo ? `<h2 class="text-xl font-bold mb-4">${bloco.props.titulo}</h2>` : ""}
                        <div class="grid grid-cols-4 gap-2">${imagens.length === 0 ? '<p class="text-xs text-gray-500 col-span-4">Sem imagens ainda.</p>' : imagens.map(img => `<img src="${img}" class="w-full h-20 object-cover rounded-lg">`).join("")}</div>
                    </div>`;
            } else if (bloco.tipo === "lista_cards") {
                const cards = bloco.props.cards || [];
                conteudo = `
                    <div class="max-w-3xl mx-auto px-6 ${textAlignClasse}">
                        ${bloco.props.titulo ? `<h2 class="text-xl font-bold mb-4">${bloco.props.titulo}</h2>` : ""}
                        <div class="grid grid-cols-3 gap-2 text-left">${cards.map(c => `<div class="bg-white/5 border border-white/10 rounded-xl p-3"><p class="text-sm">${c.icone || ""} ${c.titulo || ""}</p></div>`).join("")}</div>
                    </div>`;
            } else if (bloco.tipo === "tabela_comparativo") {
                const linhas = bloco.props.linhas || [];
                conteudo = `
                    <div class="max-w-2xl mx-auto px-6 ${textAlignClasse}">
                        ${bloco.props.titulo ? `<h2 class="text-xl font-bold mb-4">${bloco.props.titulo}</h2>` : ""}
                        <table class="w-full text-xs text-left">
                            <tr class="border-b border-white/10"><th></th><th class="p-1">${bloco.props.coluna1 || ""}</th><th class="p-1">${bloco.props.coluna2 || ""}</th></tr>
                            ${linhas.map(l => `<tr class="border-b border-white/5"><td class="p-1 text-gray-400">${l.label || ""}</td><td class="p-1">${l.valor1 || ""}</td><td class="p-1">${l.valor2 || ""}</td></tr>`).join("")}
                        </table>
                    </div>`;
            } else if (bloco.tipo === "texto_rico") {
                const paragrafos = (bloco.props.conteudo || "").split(/\n\s*\n/).filter(p => p.trim());
                conteudo = `
                    <div class="max-w-2xl mx-auto px-6 ${textAlignClasse}">
                        ${bloco.props.titulo ? `<h2 class="text-xl font-bold mb-3">${bloco.props.titulo}</h2>` : ""}
                        <div class="text-gray-300 text-sm space-y-2">${paragrafos.map(p => `<p>${p}</p>`).join("")}</div>
                    </div>`;
} else if (bloco.tipo === "codigo_iframe") {
                conteudo = bloco.props.htmlCustom
                    ? `<div class="max-w-3xl mx-auto px-6"><iframe srcdoc="${(bloco.props.htmlCustom || "").replace(/"/g, "&quot;")}" style="width:100%; height:${bloco.props.altura || 400}px; border:0;" class="rounded-xl w-full bg-white"></iframe></div>`
                    : (bloco.props.url
                        ? `<div class="max-w-3xl mx-auto px-6"><div class="bg-white/5 border border-dashed border-white/20 rounded-xl p-6 text-center text-xs text-gray-500">Incorporado: ${bloco.props.url}</div></div>`
                        : `<div class="max-w-3xl mx-auto px-6"><p class="text-xs text-gray-500 text-center">Nenhuma URL definida ainda.</p></div>`);
            } else if (bloco.tipo === "carrossel_banners") {
                const banners = bloco.props.banners || [];
                conteudo = `<div class="max-w-3xl mx-auto px-6"><div class="flex gap-2 overflow-x-auto">${banners.length === 0 ? '<p class="text-xs text-gray-500">Sem banners ainda.</p>' : banners.map(b => `<img src="${b.imagemB64}" class="shrink-0 w-40 h-20 object-cover rounded-xl">`).join("")}</div></div>`;
            } else if (bloco.tipo === "carrossel_produtos") {
                const ids = bloco.props.produtosIds || [];
                const produtos = produtosDoUsuarioCache.filter(p => ids.includes(p.id));
                conteudo = `
                    <div class="max-w-3xl mx-auto px-6">
                        ${bloco.props.titulo ? `<h2 class="text-xl font-bold mb-4 ${textAlignClasse}">${bloco.props.titulo}</h2>` : ""}
                        <div class="flex gap-3 overflow-x-auto">
                            ${produtos.length === 0 ? '<p class="text-xs text-gray-500">Nenhum produto selecionado ainda.</p>' : produtos.map(p => `
                                <div class="shrink-0 w-28 bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                                    <div class="w-full h-16 bg-white/10"></div>
                                    <div class="p-2"><p class="text-[10px] font-bold truncate">${p.nome}</p><p class="text-[9px] text-gray-400">R$ ${p.preco}</p></div>
                                </div>
                            `).join("")}
                        </div>
                    </div>`;
            } else if (bloco.tipo === "carrossel_cards") {
                const cards = bloco.props.cards || [];
                const estilo = bloco.props.estiloImagem || "lado";
                conteudo = `
                    <div class="max-w-3xl mx-auto px-6">
                        ${bloco.props.titulo ? `<h2 class="text-xl font-bold mb-4 ${textAlignClasse}">${bloco.props.titulo}</h2>` : ""}
                        <div class="flex gap-3 overflow-x-auto">
                            ${cards.length === 0 ? '<p class="text-xs text-gray-500">Sem cards ainda.</p>' : cards.map(c => estilo === "fundo"
                                ? `<div class="shrink-0 w-32 h-32 rounded-xl relative overflow-hidden" style="${c.imagemB64 ? `background-image:url('${c.imagemB64}');background-size:cover;` : "background-color:#222;"}"><div class="absolute inset-0 bg-black/40"></div><p class="relative text-[10px] font-bold p-2 text-white">${c.titulo || ""}</p></div>`
                                : `<div class="shrink-0 w-28 bg-white/5 border border-white/10 rounded-xl overflow-hidden"><div class="w-full h-14 bg-white/10"></div><p class="text-[10px] font-bold p-2">${c.titulo || ""}</p></div>`
                            ).join("")}
                        </div>
                    </div>`;
            } else if (bloco.tipo === "navegacao") {
                const links = bloco.props.links || [];
                conteudo = `<div class="max-w-3xl mx-auto px-6 flex items-center justify-between"><span class="font-bold">${bloco.props.logoTexto || ""}</span><div class="flex gap-3 text-xs">${links.map(l => `<span>${l.label || ""}</span>`).join("")}</div></div>`;
            } else if (bloco.tipo === "rodape") {
                const links = bloco.props.links || [];
                conteudo = `<div class="max-w-3xl mx-auto px-6 flex items-center justify-between text-xs text-gray-400"><p>${bloco.props.textoCopyright || ""}</p><div class="flex gap-3">${links.map(l => `<span>${l.label || ""}</span>`).join("")}</div></div>`;
            } else if (bloco.tipo === "seletor_cores") {
                const opcoes = bloco.props.opcoes || [];
                conteudo = `
                    <div class="max-w-sm mx-auto px-6 ${textAlignClasse}">
                        ${bloco.props.titulo ? `<p class="font-bold text-sm mb-2">${bloco.props.titulo}</p>` : ""}
                        <div class="flex gap-2 ${justifyClasse}">${opcoes.map(op => `<div style="background-color:${op.hex || "#000"};" class="w-7 h-7 rounded-full border border-white/20"></div>`).join("")}</div>
                    </div>`;
            } else if (bloco.tipo === "breadcrumb") {
                const itens = bloco.props.itens || [];
                conteudo = `<div class="max-w-3xl mx-auto px-6 text-xs text-gray-400">${itens.map((item, idx) => `${idx > 0 ? '<span class="mx-1">/</span>' : ""}<span>${item.label || ""}</span>`).join("")}</div>`;
            } else if (bloco.tipo === "forma") {
                const largura = bloco.props.largura || 120;
                const altura = bloco.props.altura || 120;
                const corForma = bloco.props.cor || "#5B3DF5";
                let estiloForma = `width:${largura}px; background-color:${corForma};`;
                if (bloco.props.tipoForma === "circulo") estiloForma += `height:${altura}px; border-radius:50%;`;
                else if (bloco.props.tipoForma === "linha") estiloForma += `height:3px;`;
                else estiloForma += `height:${altura}px; border-radius:8px;`;
                conteudo = `<div class="flex ${justifyClasse} px-6"><div class="relative inline-block"><div style="${estiloForma}"></div><div class="resize-handle absolute -bottom-1 -right-1 w-3 h-3 bg-white border border-[#5B3DF5] rounded-sm cursor-nwse-resize" data-bloco-index="${indiceBloco}" data-modo-redimensionar="forma"></div></div></div>`;
            }
            const estiloTexto = d.corTexto ? `color:${d.corTexto};` : "";
            if (lpEditorModoLayout === "livre") {
                const x = bloco.x !== undefined ? bloco.x : 20;
                const y = bloco.y !== undefined ? bloco.y : 20;
                const largura = bloco.largura || 600;
                const altura = bloco.altura || 220;
                const zIndex = bloco.zIndex || 1;
const selecaoLivre = blocosSelecionadosLivre.has(indiceBloco) ? "outline:2px solid #FF7A45; outline-offset:2px;" : "";
                return `<div class="absolute rounded-lg overflow-hidden" style="left:${x}px; top:${y}px; width:${largura}px; height:${altura}px; z-index:${zIndex}; ${selecaoLivre} ${estiloFundo} ${estiloTexto}">
                    ${overlayHtml}
                    <div class="relative w-full h-full overflow-hidden" style="padding-top:${Math.min(paddingTop, 24)}px; padding-bottom:${Math.min(paddingBottom, 24)}px;">${conteudo}</div>
                    <div class="livre-mover absolute inset-0 cursor-move" data-bloco-index="${indiceBloco}" data-modo-redimensionar="mover-livre"></div>
                    <div class="resize-handle absolute -bottom-1 -right-1 w-3 h-3 bg-white border border-[#5B3DF5] rounded-sm cursor-nwse-resize" data-bloco-index="${indiceBloco}" data-modo-redimensionar="livre-tamanho" style="z-index:${zIndex + 1};"></div>
                </div>`;
            }
            return `<div class="relative" style="${estiloFundo} ${estiloTexto} padding-top:${paddingTop}px; padding-bottom:${paddingBottom}px;">
                ${overlayHtml}
                <div class="relative">${conteudo}</div>
            </div>`;
        }
        let guiasAlinhamentoAtivas = [];
        function calcularSnapping(x, y, largura, altura, indiceIgnorar, larguraCanvas) {
            const limiar = 6;
            let novoX = x, novoY = y;
            const guias = [];
            const centroCanvasX = larguraCanvas / 2;
            const centroXAtual = x + largura / 2;
            if (Math.abs(centroXAtual - centroCanvasX) < limiar) {
                novoX = centroCanvasX - largura / 2;
                guias.push({ tipo: "vertical", posicao: centroCanvasX });
            }
            lpEditorBlocos.forEach((outro, idx) => {
                if (idx === indiceIgnorar || outro.visivel === false || outro.x === undefined) return;
                const esquerda = novoX, direita = novoX + largura, centroX = novoX + largura / 2;
                const topo = y, baixo = y + altura, centroY = y + altura / 2;
                const oEsquerda = outro.x, oDireita = outro.x + (outro.largura || 600), oCentroX = outro.x + (outro.largura || 600) / 2;
                const oTopo = outro.y, oBaixo = outro.y + (outro.altura || 220), oCentroY = outro.y + (outro.altura || 220) / 2;
                if (Math.abs(esquerda - oEsquerda) < limiar) { novoX = oEsquerda; guias.push({ tipo: "vertical", posicao: oEsquerda }); }
                else if (Math.abs(direita - oDireita) < limiar) { novoX = oDireita - largura; guias.push({ tipo: "vertical", posicao: oDireita }); }
                else if (Math.abs(centroX - oCentroX) < limiar) { novoX = oCentroX - largura / 2; guias.push({ tipo: "vertical", posicao: oCentroX }); }
                if (Math.abs(topo - oTopo) < limiar) { novoY = oTopo; guias.push({ tipo: "horizontal", posicao: oTopo }); }
                else if (Math.abs(baixo - oBaixo) < limiar) { novoY = oBaixo - altura; guias.push({ tipo: "horizontal", posicao: oBaixo }); }
                else if (Math.abs(centroY - oCentroY) < limiar) { novoY = oCentroY - altura / 2; guias.push({ tipo: "horizontal", posicao: oCentroY }); }
            });
return { x: novoX, y: novoY, guias };
        }
        function calcularSnappingRedimensionar(x, y, largura, altura, indiceIgnorar, larguraCanvas) {
            const limiar = 6;
            let novaLargura = largura, novaAltura = altura;
            const guias = [];
            const direita = x + largura;
            const baixo = y + altura;
            const centroCanvasX = larguraCanvas / 2;
            if (Math.abs(direita - centroCanvasX) < limiar) { novaLargura = centroCanvasX - x; guias.push({ tipo: "vertical", posicao: centroCanvasX }); }
            else if (Math.abs(direita - larguraCanvas) < limiar) { novaLargura = larguraCanvas - x; guias.push({ tipo: "vertical", posicao: larguraCanvas }); }
            lpEditorBlocos.forEach((outro, idx) => {
                if (idx === indiceIgnorar || outro.visivel === false || outro.x === undefined) return;
                const oEsquerda = outro.x, oDireita = outro.x + (outro.largura || 600), oCentroX = outro.x + (outro.largura || 600) / 2;
                const oTopo = outro.y, oBaixo = outro.y + (outro.altura || 220), oCentroY = outro.y + (outro.altura || 220) / 2;
                if (Math.abs(direita - oEsquerda) < limiar) { novaLargura = oEsquerda - x; guias.push({ tipo: "vertical", posicao: oEsquerda }); }
                else if (Math.abs(direita - oDireita) < limiar) { novaLargura = oDireita - x; guias.push({ tipo: "vertical", posicao: oDireita }); }
                else if (Math.abs(direita - oCentroX) < limiar) { novaLargura = oCentroX - x; guias.push({ tipo: "vertical", posicao: oCentroX }); }
                if (Math.abs(baixo - oTopo) < limiar) { novaAltura = oTopo - y; guias.push({ tipo: "horizontal", posicao: oTopo }); }
                else if (Math.abs(baixo - oBaixo) < limiar) { novaAltura = oBaixo - y; guias.push({ tipo: "horizontal", posicao: oBaixo }); }
                else if (Math.abs(baixo - oCentroY) < limiar) { novaAltura = oCentroY - y; guias.push({ tipo: "horizontal", posicao: oCentroY }); }
            });
            return { largura: novaLargura, altura: novaAltura, guias };
        }
        function renderizarPreviewEditor() {
            const canvas = document.getElementById("lped-preview-canvas");
            if (!canvas) return;
const visiveis = lpEditorBlocos.map((b, idx) => ({ b, idx })).filter(x => x.b.visivel !== false && blocoNaPaginaAtual(x.b));
            if (visiveis.length === 0) {
                canvas.innerHTML = '<p class="text-center text-gray-500 text-xs p-16">Adicione um bloco pra ver a previa aqui.</p>';
                return;
            }
            if (lpEditorModoLayout === "livre") {
                document.getElementById("lped-browser-frame").style.width = "1440px";
                document.getElementById("lped-browser-frame").classList.remove("max-w-4xl");
                const alturaCanvas = Math.max(400, ...visiveis.map(x => (x.b.y || 20) + (x.b.altura || 220) + 40));
                const guiasHtml = guiasAlinhamentoAtivas.map(g => g.tipo === "vertical"
                    ? `<div class="absolute top-0 bottom-0 pointer-events-none" style="left:${g.posicao}px; width:1px; background:#FF7A45; z-index:9999;"></div>`
                    : `<div class="absolute left-0 right-0 pointer-events-none" style="top:${g.posicao}px; height:1px; background:#FF7A45; z-index:9999;"></div>`
                ).join("");
                canvas.innerHTML = `<div class="relative" style="height:${alturaCanvas}px; background:#0d0c1f;">${visiveis.map(x => renderizarBlocoPreview(x.b, x.idx)).join("")}${guiasHtml}</div>`;
                return;
            }
            canvas.innerHTML = visiveis.map(x => {
                const selecionado = x.b._colapsado === false;
                const anelSelecao = selecionado ? "box-shadow: inset 0 0 0 2px #FF7A45;" : "";
                return `<div id="lped-preview-bloco-${x.idx}" style="${anelSelecao}">${renderizarBlocoPreview(x.b, x.idx)}</div>`;
            }).join("");
        }
let redimensionandoElemento = null;
        let blocosSelecionadosLivre = new Set();
        let lpEditorPaginas = [];
        let lpEditorPaginaAtual = "";
        function blocoNaPaginaAtual(b) {
            if (lpEditorPaginas.length === 0) return true;
            const idValido = b.paginaId && lpEditorPaginas.some(p => p.id === b.paginaId) ? b.paginaId : lpEditorPaginas[0].id;
            return idValido === lpEditorPaginaAtual;
        }
document.getElementById("lped-preview-canvas").addEventListener("mousedown", function(e) {
            if (e.button === 2) return;
            const handle = e.target.closest(".resize-handle, .livre-mover");
            if (!handle) {
                if (lpEditorModoLayout === "livre" && blocosSelecionadosLivre.size > 0) {
                    blocosSelecionadosLivre.clear();
                    renderizarPreviewEditor();
                }
                return;
            }
            e.preventDefault();
            const idx = parseInt(handle.getAttribute("data-bloco-index"));
            const modo = handle.getAttribute("data-modo-redimensionar");
            if (modo === "mover-livre" && e.shiftKey) {
                if (blocosSelecionadosLivre.has(idx)) blocosSelecionadosLivre.delete(idx);
                else blocosSelecionadosLivre.add(idx);
                renderizarPreviewEditor();
                return;
            }
            if (modo === "mover-livre" && blocosSelecionadosLivre.size > 0 && !blocosSelecionadosLivre.has(idx)) {
                blocosSelecionadosLivre.clear();
                renderizarPreviewEditor();
            }
            redimensionandoElemento = {
                indiceBloco: idx,
                modo: modo,
                larguraInicial: lpEditorBlocos[idx].props.largura || 120,
                alturaInicial: lpEditorBlocos[idx].props.altura || 120,
                imagemLarguraInicial: lpEditorBlocos[idx].props.imagemLargura || 400,
                xInicial: lpEditorBlocos[idx].x !== undefined ? lpEditorBlocos[idx].x : 20,
                yInicial: lpEditorBlocos[idx].y !== undefined ? lpEditorBlocos[idx].y : 20,
                larguraLivreInicial: lpEditorBlocos[idx].largura || 600,
                alturaLivreInicial: lpEditorBlocos[idx].altura || 220,
                mouseXInicial: e.clientX,
                mouseYInicial: e.clientY,
                posicoesGrupo: (modo === "mover-livre" && blocosSelecionadosLivre.size > 1 && blocosSelecionadosLivre.has(idx))
                    ? Array.from(blocosSelecionadosLivre).map(j => ({ j, x: lpEditorBlocos[j].x !== undefined ? lpEditorBlocos[j].x : 20, y: lpEditorBlocos[j].y !== undefined ? lpEditorBlocos[j].y : 20 }))
                    : null
            };
        });
        document.addEventListener("mousemove", function(e) {
            if (!redimensionandoElemento) return;
            const dx = e.clientX - redimensionandoElemento.mouseXInicial;
            const dy = e.clientY - redimensionandoElemento.mouseYInicial;
            const bloco = lpEditorBlocos[redimensionandoElemento.indiceBloco];
            if (redimensionandoElemento.modo === "imagem-largura") {
                bloco.props.imagemLargura = Math.round(Math.max(60, redimensionandoElemento.imagemLarguraInicial + dx));
} else if (redimensionandoElemento.modo === "mover-livre") {
                const larguraCanvas = 1440;
                const grupo = redimensionandoElemento.posicoesGrupo;
                if (grupo && grupo.length > 1) {
                    grupo.forEach(p => {
                        const b2 = lpEditorBlocos[p.j];
                        if (!b2) return;
                        const larguraB2 = b2.largura || 600;
                        b2.x = Math.min(Math.max(0, Math.round(p.x + dx)), Math.max(0, larguraCanvas - larguraB2));
                        b2.y = Math.max(0, Math.round(p.y + dy));
                    });
                    guiasAlinhamentoAtivas = [];
                } else {
                    const xBruto = Math.round(Math.max(0, redimensionandoElemento.xInicial + dx));
                    const yBruto = Math.round(Math.max(0, redimensionandoElemento.yInicial + dy));
                    const resultado = calcularSnapping(xBruto, yBruto, bloco.largura || 600, bloco.altura || 220, redimensionandoElemento.indiceBloco, larguraCanvas);
                    const larguraBloco = bloco.largura || 600;
                    bloco.x = Math.min(Math.max(0, resultado.x), Math.max(0, larguraCanvas - larguraBloco));
                    bloco.y = resultado.y;
                    guiasAlinhamentoAtivas = resultado.guias;
                }
            } else if (redimensionandoElemento.modo === "livre-tamanho") {
                const larguraCanvas = 1440;
                const larguraBruta = Math.round(Math.max(80, redimensionandoElemento.larguraLivreInicial + dx));
                const alturaBruta = Math.round(Math.max(60, redimensionandoElemento.alturaLivreInicial + dy));
                const xAtual = bloco.x !== undefined ? bloco.x : 20;
                const yAtual = bloco.y !== undefined ? bloco.y : 20;
                const resultado = calcularSnappingRedimensionar(xAtual, yAtual, larguraBruta, alturaBruta, redimensionandoElemento.indiceBloco, larguraCanvas);
                bloco.largura = Math.round(Math.min(Math.max(80, resultado.largura), larguraCanvas - xAtual));
                bloco.altura = Math.round(Math.max(60, resultado.altura));
                guiasAlinhamentoAtivas = resultado.guias;
            } else {
                bloco.props.largura = Math.round(Math.max(20, redimensionandoElemento.larguraInicial + dx));
                if (bloco.props.tipoForma !== "linha") {
                    bloco.props.altura = Math.round(Math.max(20, redimensionandoElemento.alturaInicial + dy));
                }
            }
            renderizarPreviewEditor();
        });
        document.addEventListener("mouseup", function() {
            if (redimensionandoElemento) {
                redimensionandoElemento = null;
                guiasAlinhamentoAtivas = [];
                renderizarEditorBlocos();
                salvarHistoricoEditor();
            }
        });
        window.editarLP = async function(id) {
            const openerEditorLP = document.activeElement;
            if (!scriptsEditorJaCarregados) showToast("Abrindo editor...", "info");
            const snap = await getDoc(doc(db, "landing_pages", id));
            if (!snap.exists()) return;
            const lp = snap.data();
            lpEditorId = id;
            lpEditorPublicado = !!lp.publicado;
            lpEditorSlugOriginal = lp.pagina;
            lpEditorRemovidos = [];
            document.getElementById("lped-titulo").value = lp.titulo;
            document.getElementById("lped-slug").value = lp.pagina;
            atualizarBadgeStatusEditor();
            atualizarUrlPreviewEditor();
            alternarDispositivoPreview("desktop");
            lpEditorModoLayout = lp.modoLayout || "empilhado";
            lpEditorBlocos.length = 0;
for (const blocoId of (lp.ordemBlocos || [])) {
                const blocoSnap = await getDoc(doc(db, "landing_pages_blocos", blocoId));
                if (blocoSnap.exists()) {
                    lpEditorBlocos.push({ id: blocoId, ...blocoSnap.data() });
                }
            }
            lpEditorPaginas = (lp.paginas && lp.paginas.length > 0) ? lp.paginas : [{ id: "pg_1", nome: "Pagina 1" }];
            lpEditorPaginaAtual = lpEditorPaginas[0].id;
            lpEditorBlocos.forEach(b => { if (!b.paginaId) b.paginaId = lpEditorPaginas[0].id; });
            renderizarBarraPaginas();
            renderizarEditorBlocos();
            renderizarEditorBlocos();
            atualizarBotoesModoLayout();
            historicoEditor = [clonarBlocosEditor()];
            indiceHistorico = 0;
            atualizarBotoesHistoricoEditor();
            abrirShellEditorLP({ opener: openerEditorLP });
            carregarProdutosParaEditor();
            if (typeof window.carregarEditorLandingPages === "function") {
                window.carregarEditorLandingPages()
                    .then(() => { scriptsEditorJaCarregados = true; })
                    .catch((err) => console.error("[Editor LP] falha ao carregar recursos avançados:", err));
            }
        };
        document.getElementById("lped-blocos-lista").addEventListener("input", renderizarPreviewEditor);
        document.getElementById("lped-blocos-lista").addEventListener("change", renderizarPreviewEditor);
        document.getElementById("lped-blocos-lista").addEventListener("input", agendarHistoricoEditor);
        document.getElementById("lped-blocos-lista").addEventListener("change", agendarHistoricoEditor);
        function atualizarBadgeStatusEditor() {
            const badge = document.getElementById("lped-status-badge");
            const btnPub = document.getElementById("lped-btn-publicar");
            if (lpEditorPublicado) {
                badge.className = "text-[10px] px-2 py-1 rounded-md font-bold uppercase bg-emerald-500/10 text-emerald-400";
                badge.innerText = "Publicada";
                btnPub.innerText = "Despublicar";
            } else {
                badge.className = "text-[10px] px-2 py-1 rounded-md font-bold uppercase bg-gray-500/10 text-gray-400";
                badge.innerText = "Rascunho";
                btnPub.innerText = "Publicar";
            }
        }
        window.fecharEditorLP = function(evento) {
            evento?.preventDefault?.();
            return fecharShellEditorLP("manual");
        };
  function nomeTipoBlocoEditor(tipo) {
            const nomes = {
                texto_midia: "Texto e Mídia",
                formulario_captura: "Formulario",
                faq: "FAQ - Perguntas Frequentes",
                galeria_imagens: "Galeria de Imagens",
                lista_cards: "Lista de Cards",
                tabela_comparativo: "Tabela de Comparativo",
                texto_rico: "Texto Rico",
                codigo_iframe: "Codigo / iFrame",
                carrossel_banners: "Carrossel de Banners",
                carrossel_produtos: "Carrossel de Produtos",
                carrossel_cards: "Carrossel de Cards",
                navegacao: "Navegacao",
                rodape: "Rodape",
                seletor_cores: "Seletor de Cores",
                breadcrumb: "Breadcrumb",
                forma: "Forma"
            };
            return nomes[tipo] || tipo;
        }
        window.adicionarItemListaEditor = function(i, propName, itemPadrao) {
            if (!lpEditorBlocos[i].props[propName]) lpEditorBlocos[i].props[propName] = [];
            lpEditorBlocos[i].props[propName].push(itemPadrao);
            renderizarEditorBlocos();
        };
        window.removerItemListaEditor = function(i, propName, itemIndex) {
            lpEditorBlocos[i].props[propName].splice(itemIndex, 1);
            renderizarEditorBlocos();
        };
        window.uploadImagemGaleriaEditor = async function(i, inputEl) {
            const file = inputEl.files[0];
            if (!file) return;
            try {
                const b64 = await comprimirImagem(file, 1200, 0.7);
                if (!lpEditorBlocos[i].props.imagens) lpEditorBlocos[i].props.imagens = [];
                lpEditorBlocos[i].props.imagens.push(b64);
                renderizarEditorBlocos();
            } catch(err) {
                console.error(err);
                showToast("Erro ao processar imagem: " + err.message, "error");
            }
        };
        window.removerImagemGaleriaEditor = function(i, imgIndex) {
            lpEditorBlocos[i].props.imagens.splice(imgIndex, 1);
            renderizarEditorBlocos();
        };
        window.uploadImagemTextoMidiaEditor = async function(i, inputEl) {
            const file = inputEl.files[0];
            if (!file) return;
            try {
                const b64 = await comprimirImagem(file, 1200, 0.75);
                lpEditorBlocos[i].props.imagemB64 = b64;
                renderizarEditorBlocos();
                salvarHistoricoEditor();
            } catch(err) {
                console.error(err);
                showToast("Erro ao processar imagem: " + err.message, "error");
            }
        };
        window.removerImagemTextoMidiaEditor = function(i) {
            lpEditorBlocos[i].props.imagemB64 = "";
            renderizarEditorBlocos();
            salvarHistoricoEditor();
        };
        function garantirDesignPadrao(bloco) {
            if (!bloco.design) bloco.design = {};
            const d = bloco.design;
            if (d.corFundo === undefined) d.corFundo = "";
            if (d.imagemFundoB64 === undefined) d.imagemFundoB64 = "";
            if (d.corSobreposicao === undefined) d.corSobreposicao = "#000000";
            if (d.opacidadeSobreposicao === undefined) d.opacidadeSobreposicao = 0;
            if (d.corBotaoFundo === undefined) d.corBotaoFundo = "";
            if (d.corBotaoBorda === undefined) d.corBotaoBorda = "";
            if (d.corBotaoTexto === undefined) d.corBotaoTexto = "";
            if (d.corTexto === undefined) d.corTexto = "";
            if (d.paddingTop === undefined) d.paddingTop = 64;
            if (d.paddingBottom === undefined) d.paddingBottom = 64;
            if (d.alinhamento === undefined) d.alinhamento = "esquerda";
            if (d.visivelDesktop === undefined) d.visivelDesktop = true;
            if (d.visivelMobile === undefined) d.visivelMobile = true;
            if (d.idSecao === undefined) d.idSecao = "";
            if (d.priorizarImagem === undefined) d.priorizarImagem = false;
            if (!bloco._aba) bloco._aba = "conteudo";
            if (bloco._colapsado === undefined) bloco._colapsado = true;
        }
        window.trocarAbaBlocoEditor = function(i, aba) {
            lpEditorBlocos[i]._aba = aba;
            renderizarEditorBlocos();
        };
        window.uploadImagemFundoEditor = async function(i, inputEl) {
            const file = inputEl.files[0];
            if (!file) return;
            try {
                const b64 = await comprimirImagem(file, 1600, 0.75);
                lpEditorBlocos[i].design.imagemFundoB64 = b64;
                renderizarEditorBlocos();
            } catch(err) {
                console.error(err);
                showToast("Erro ao processar imagem: " + err.message, "error");
            }
        };
        window.removerImagemFundoEditor = function(i) {
            lpEditorBlocos[i].design.imagemFundoB64 = "";
            renderizarEditorBlocos();
        };
        function renderAbaConteudo(bloco, i) {
            if (bloco.tipo === "texto_midia") {
                return `
                    <div class="space-y-2 mt-3">
                        <input type="text" value="${(bloco.props.titulo || "").replace(/"/g, "&quot;")}" oninput="lpEditorBlocos[${i}].props.titulo = this.value" placeholder="Titulo" class="w-full glass-input rounded-lg p-2.5 text-xs text-white outline-none">
                        <textarea oninput="lpEditorBlocos[${i}].props.subtitulo = this.value" placeholder="Subtitulo" class="w-full glass-input rounded-lg p-2.5 text-xs text-white outline-none" rows="2">${bloco.props.subtitulo || ""}</textarea>
                        <div class="grid grid-cols-2 gap-2">
                            <input type="text" value="${(bloco.props.botaoTexto || "").replace(/"/g, "&quot;")}" oninput="lpEditorBlocos[${i}].props.botaoTexto = this.value" placeholder="Texto do botao" class="glass-input rounded-lg p-2.5 text-xs text-white outline-none">
                            <input type="text" value="${(bloco.props.botaoLink || "").replace(/"/g, "&quot;")}" oninput="lpEditorBlocos[${i}].props.botaoLink = this.value" placeholder="Link do botao" class="glass-input rounded-lg p-2.5 text-xs text-white outline-none">
                        </div>
                        <select onchange="lpEditorBlocos[${i}].props.posicaoImagem = this.value" class="w-full glass-input rounded-lg p-2.5 text-xs text-white outline-none">
                            <option value="direita" ${bloco.props.posicaoImagem !== "esquerda" ? "selected" : ""}>Imagem a direita</option>
                            <option value="esquerda" ${bloco.props.posicaoImagem === "esquerda" ? "selected" : ""}>Imagem a esquerda</option>
                        </select>
                        ${bloco.props.imagemB64 ? `
                            <div class="flex items-center gap-2">
                                <img src="${bloco.props.imagemB64}" class="h-12 w-20 object-cover rounded-lg border border-white/10">
                                <label class="bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[10px] font-bold px-3 py-2 rounded-lg cursor-pointer transition-all">
                                    Trocar imagem
                                    <input type="file" accept="image/*" class="hidden" onchange="uploadImagemTextoMidiaEditor(${i}, this)">
                                </label>
                                <button onclick="removerImagemTextoMidiaEditor(${i})" class="text-red-400 hover:text-red-300 text-[10px] font-bold">Remover</button>
                            </div>
                        ` : `
                            <label class="inline-block bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[10px] font-bold px-3 py-2 rounded-lg cursor-pointer transition-all">
                                Enviar imagem
                                <input type="file" accept="image/*" class="hidden" onchange="uploadImagemTextoMidiaEditor(${i}, this)">
                            </label>
                        `}
                    </div>
                `;
            } else if (bloco.tipo === "formulario_captura") {
                const camposAtuais = bloco.props.campos || [];
                return `
                    <div class="space-y-2 mt-3">
                        <input type="text" value="${(bloco.props.titulo || "").replace(/"/g, "&quot;")}" oninput="lpEditorBlocos[${i}].props.titulo = this.value" placeholder="Titulo do formulario" class="w-full glass-input rounded-lg p-2.5 text-xs text-white outline-none">
                        <div class="flex gap-3 flex-wrap">
                            ${["nome", "whatsapp", "email"].map(campo => `
                                <label class="flex items-center gap-1.5 text-xs text-gray-400">
                                    <input type="checkbox" ${camposAtuais.includes(campo) ? "checked" : ""} onchange="alternarCampoFormEditor(${i}, '${campo}', this.checked)">
                                    ${campo}
                                </label>
                            `).join("")}
                        </div>
                       <input type="text" value="${(bloco.props.textoBotao || "").replace(/"/g, "&quot;")}" oninput="lpEditorBlocos[${i}].props.textoBotao = this.value" placeholder="Texto do botao" class="w-full glass-input rounded-lg p-2.5 text-xs text-white outline-none">
                    </div>
                `;
            } else if (bloco.tipo === "faq") {
                const itens = bloco.props.itens || [];
                return `
                    <div class="space-y-2 mt-3">
                        <input type="text" value="${(bloco.props.titulo || "").replace(/"/g, "&quot;")}" oninput="lpEditorBlocos[${i}].props.titulo = this.value" placeholder="Titulo da secao" class="w-full glass-input rounded-lg p-2.5 text-xs text-white outline-none">
                        ${itens.map((item, j) => `
                            <div class="border border-white/5 rounded-lg p-2.5 space-y-1.5">
                                <div class="flex items-center justify-between">
                                    <span class="text-[9px] text-gray-500">Pergunta ${j + 1}</span>
                                    <button onclick="removerItemListaEditor(${i}, 'itens', ${j})" class="text-red-400 text-[9px] font-bold">Remover</button>
                                </div>
                                <input type="text" value="${(item.pergunta || "").replace(/"/g, "&quot;")}" oninput="lpEditorBlocos[${i}].props.itens[${j}].pergunta = this.value" placeholder="Pergunta" class="w-full glass-input rounded-lg p-2 text-xs text-white outline-none">
                                <textarea oninput="lpEditorBlocos[${i}].props.itens[${j}].resposta = this.value" placeholder="Resposta" rows="2" class="w-full glass-input rounded-lg p-2 text-xs text-white outline-none">${item.resposta || ""}</textarea>
                            </div>
                        `).join("")}
                        <button onclick="adicionarItemListaEditor(${i}, 'itens', {pergunta: '', resposta: ''})" class="text-[10px] font-bold text-gray-400 hover:text-white">+ Adicionar pergunta</button>
                    </div>
                `;
            } else if (bloco.tipo === "galeria_imagens") {
                const imagens = bloco.props.imagens || [];
                return `
                    <div class="space-y-2 mt-3">
                        <input type="text" value="${(bloco.props.titulo || "").replace(/"/g, "&quot;")}" oninput="lpEditorBlocos[${i}].props.titulo = this.value" placeholder="Titulo da galeria" class="w-full glass-input rounded-lg p-2.5 text-xs text-white outline-none">
                        <div class="grid grid-cols-4 gap-2">
                            ${imagens.map((img, j) => `
                                <div class="relative">
                                    <img src="${img}" class="w-full h-16 object-cover rounded-lg border border-white/10">
                                    <button onclick="removerImagemGaleriaEditor(${i}, ${j})" class="absolute top-0.5 right-0.5 bg-black/70 text-red-400 text-[9px] font-bold rounded px-1">X</button>
                                </div>
                            `).join("")}
                        </div>
                        <label class="inline-block bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[10px] font-bold px-3 py-2 rounded-lg cursor-pointer transition-all">
                            + Adicionar imagem
                            <input type="file" accept="image/*" class="hidden" onchange="uploadImagemGaleriaEditor(${i}, this)">
                        </label>
                    </div>
                `;
            } else if (bloco.tipo === "lista_cards") {
                const cards = bloco.props.cards || [];
                return `
                    <div class="space-y-2 mt-3">
                        <input type="text" value="${(bloco.props.titulo || "").replace(/"/g, "&quot;")}" oninput="lpEditorBlocos[${i}].props.titulo = this.value" placeholder="Titulo da secao" class="w-full glass-input rounded-lg p-2.5 text-xs text-white outline-none">
                        ${cards.map((card, j) => `
                            <div class="border border-white/5 rounded-lg p-2.5 space-y-1.5">
                                <div class="flex items-center justify-between">
                                    <span class="text-[9px] text-gray-500">Card ${j + 1}</span>
                                    <button onclick="removerItemListaEditor(${i}, 'cards', ${j})" class="text-red-400 text-[9px] font-bold">Remover</button>
                                </div>
                                <div class="grid grid-cols-3 gap-1.5">
                                    <input type="text" value="${(card.icone || "").replace(/"/g, "&quot;")}" oninput="lpEditorBlocos[${i}].props.cards[${j}].icone = this.value" placeholder="Emoji" class="glass-input rounded-lg p-2 text-xs text-white outline-none">
                                    <input type="text" value="${(card.titulo || "").replace(/"/g, "&quot;")}" oninput="lpEditorBlocos[${i}].props.cards[${j}].titulo = this.value" placeholder="Titulo" class="col-span-2 glass-input rounded-lg p-2 text-xs text-white outline-none">
                                </div>
                                <textarea oninput="lpEditorBlocos[${i}].props.cards[${j}].texto = this.value" placeholder="Texto" rows="2" class="w-full glass-input rounded-lg p-2 text-xs text-white outline-none">${card.texto || ""}</textarea>
                            </div>
                        `).join("")}
                        <button onclick="adicionarItemListaEditor(${i}, 'cards', {icone: '', titulo: '', texto: ''})" class="text-[10px] font-bold text-gray-400 hover:text-white">+ Adicionar card</button>
                    </div>
                `;
            } else if (bloco.tipo === "tabela_comparativo") {
                const linhas = bloco.props.linhas || [];
                return `
                    <div class="space-y-2 mt-3">
                        <input type="text" value="${(bloco.props.titulo || "").replace(/"/g, "&quot;")}" oninput="lpEditorBlocos[${i}].props.titulo = this.value" placeholder="Titulo da tabela" class="w-full glass-input rounded-lg p-2.5 text-xs text-white outline-none">
                        <div class="grid grid-cols-2 gap-2">
                            <input type="text" value="${(bloco.props.coluna1 || "").replace(/"/g, "&quot;")}" oninput="lpEditorBlocos[${i}].props.coluna1 = this.value" placeholder="Nome coluna 1" class="glass-input rounded-lg p-2 text-xs text-white outline-none">
                            <input type="text" value="${(bloco.props.coluna2 || "").replace(/"/g, "&quot;")}" oninput="lpEditorBlocos[${i}].props.coluna2 = this.value" placeholder="Nome coluna 2" class="glass-input rounded-lg p-2 text-xs text-white outline-none">
                        </div>
                        ${linhas.map((linha, j) => `
                            <div class="border border-white/5 rounded-lg p-2.5 space-y-1.5">
                                <div class="flex items-center justify-between">
                                    <span class="text-[9px] text-gray-500">Linha ${j + 1}</span>
                                    <button onclick="removerItemListaEditor(${i}, 'linhas', ${j})" class="text-red-400 text-[9px] font-bold">Remover</button>
                                </div>
                                <input type="text" value="${(linha.label || "").replace(/"/g, "&quot;")}" oninput="lpEditorBlocos[${i}].props.linhas[${j}].label = this.value" placeholder="Nome do recurso" class="w-full glass-input rounded-lg p-2 text-xs text-white outline-none">
                                <div class="grid grid-cols-2 gap-1.5">
                                    <input type="text" value="${(linha.valor1 || "").replace(/"/g, "&quot;")}" oninput="lpEditorBlocos[${i}].props.linhas[${j}].valor1 = this.value" placeholder="Valor coluna 1" class="glass-input rounded-lg p-2 text-xs text-white outline-none">
                                    <input type="text" value="${(linha.valor2 || "").replace(/"/g, "&quot;")}" oninput="lpEditorBlocos[${i}].props.linhas[${j}].valor2 = this.value" placeholder="Valor coluna 2" class="glass-input rounded-lg p-2 text-xs text-white outline-none">
                                </div>
                            </div>
                        `).join("")}
                        <button onclick="adicionarItemListaEditor(${i}, 'linhas', {label: '', valor1: '', valor2: ''})" class="text-[10px] font-bold text-gray-400 hover:text-white">+ Adicionar linha</button>
                    </div>
                `;
            } else if (bloco.tipo === "texto_rico") {
                return `
                    <div class="space-y-2 mt-3">
                        <input type="text" value="${(bloco.props.titulo || "").replace(/"/g, "&quot;")}" oninput="lpEditorBlocos[${i}].props.titulo = this.value" placeholder="Titulo (opcional)" class="w-full glass-input rounded-lg p-2.5 text-xs text-white outline-none">
                        <textarea oninput="lpEditorBlocos[${i}].props.conteudo = this.value" placeholder="Texto (deixe uma linha em branco entre paragrafos)" rows="6" class="w-full glass-input rounded-lg p-2.5 text-xs text-white outline-none">${bloco.props.conteudo || ""}</textarea>
                    </div>
                `;
            } else if (bloco.tipo === "codigo_iframe") {
                return `
                    <div class="space-y-2 mt-3">
                        <input type="text" value="${(bloco.props.url || "").replace(/"/g, "&quot;")}" oninput="lpEditorBlocos[${i}].props.url = this.value" placeholder="URL do conteudo (ex: video, mapa, formulario externo)" class="w-full glass-input rounded-lg p-2.5 text-xs text-white outline-none">
                        <div>
                            <label class="text-[9px] text-gray-500">Altura (px)</label>
                            <input type="number" min="100" value="${bloco.props.altura || 400}" oninput="lpEditorBlocos[${i}].props.altura = parseInt(this.value) || 400" class="w-full glass-input rounded-lg p-2 text-xs text-white outline-none">
                        </div>
                        <p class="text-[9px] text-gray-500">Ou cole um codigo HTML pronto (usado no lugar do link acima, se preenchido):</p>
                        <textarea oninput="lpEditorBlocos[${i}].props.htmlCustom = this.value" placeholder="Cole aqui o codigo HTML" class="w-full glass-input rounded-lg p-2.5 text-xs text-white outline-none font-mono" rows="4">${bloco.props.htmlCustom || ""}</textarea>
                    </div>
                `;
            } else if (bloco.tipo === "carrossel_banners") {
                const banners = bloco.props.banners || [];
                return `
                    <div class="space-y-2 mt-3">
                        ${banners.map((b, j) => `
                            <div class="border border-white/5 rounded-lg p-2.5 flex items-center gap-2">
                                <img src="${b.imagemB64}" class="w-16 h-10 object-cover rounded-lg border border-white/10">
                                <input type="text" value="${(b.link || "").replace(/"/g, "&quot;")}" oninput="lpEditorBlocos[${i}].props.banners[${j}].link = this.value" placeholder="Link (opcional)" class="flex-1 glass-input rounded-lg p-2 text-xs text-white outline-none">
                                <button onclick="removerItemListaEditor(${i}, 'banners', ${j})" class="text-red-400 text-[9px] font-bold">Remover</button>
                            </div>
                        `).join("")}
                        <label class="inline-block bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[10px] font-bold px-3 py-2 rounded-lg cursor-pointer transition-all">
                            + Adicionar banner
                            <input type="file" accept="image/*" class="hidden" onchange="uploadBannerCarrosselEditor(${i}, this)">
                        </label>
                    </div>
                `;
            } else if (bloco.tipo === "carrossel_produtos") {
                const selecionados = bloco.props.produtosIds || [];
                return `
                    <div class="space-y-2 mt-3">
                        <input type="text" value="${(bloco.props.titulo || "").replace(/"/g, "&quot;")}" oninput="lpEditorBlocos[${i}].props.titulo = this.value" placeholder="Titulo da secao" class="w-full glass-input rounded-lg p-2.5 text-xs text-white outline-none">
                        <p class="text-[9px] text-gray-500">Selecione os produtos:</p>
                        <div class="max-h-48 overflow-y-auto space-y-1.5 border border-white/5 rounded-lg p-2">
                            ${produtosDoUsuarioCache.length === 0 ? '<p class="text-[10px] text-gray-500 p-2">Nenhum produto ativo encontrado.</p>' : produtosDoUsuarioCache.map(p => `
                                <label class="flex items-center gap-2 text-xs text-gray-300 p-1.5 hover:bg-white/5 rounded-lg cursor-pointer">
                                    <input type="checkbox" ${selecionados.includes(p.id) ? "checked" : ""} onchange="alternarProdutoCarrosselEditor(${i}, '${p.id}', this.checked)">
                                    ${p.imagemB64 ? `<img src="${p.imagemB64}" class="w-8 h-8 object-cover rounded">` : ""}
                                    <span>${p.nome} - R$ ${p.preco}</span>
                                </label>
                            `).join("")}
                        </div>
                    </div>
                `;
            } else if (bloco.tipo === "carrossel_cards") {
                const cards = bloco.props.cards || [];
                return `
                    <div class="space-y-2 mt-3">
                        <input type="text" value="${(bloco.props.titulo || "").replace(/"/g, "&quot;")}" oninput="lpEditorBlocos[${i}].props.titulo = this.value" placeholder="Titulo da secao" class="w-full glass-input rounded-lg p-2.5 text-xs text-white outline-none">
                        <select onchange="lpEditorBlocos[${i}].props.estiloImagem = this.value" class="w-full glass-input rounded-lg p-2.5 text-xs text-white outline-none">
                            <option value="lado" ${bloco.props.estiloImagem !== "fundo" ? "selected" : ""}>Imagem ao lado</option>
                            <option value="fundo" ${bloco.props.estiloImagem === "fundo" ? "selected" : ""}>Imagem de fundo</option>
                        </select>
                        ${cards.map((card, j) => `
                            <div class="border border-white/5 rounded-lg p-2.5 space-y-1.5">
                                <div class="flex items-center justify-between">
                                    <span class="text-[9px] text-gray-500">Card ${j + 1}</span>
                                    <button onclick="removerItemListaEditor(${i}, 'cards', ${j})" class="text-red-400 text-[9px] font-bold">Remover</button>
                                </div>
                                ${card.imagemB64 ? `<img src="${card.imagemB64}" class="w-full h-16 object-cover rounded-lg">` : ""}
                                <label class="inline-block bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[9px] font-bold px-2 py-1.5 rounded-lg cursor-pointer">
                                    ${card.imagemB64 ? "Trocar imagem" : "Adicionar imagem"}
                                    <input type="file" accept="image/*" class="hidden" onchange="uploadImagemCardCarrosselEditor(${i}, ${j}, this)">
                                </label>
                                <input type="text" value="${(card.titulo || "").replace(/"/g, "&quot;")}" oninput="lpEditorBlocos[${i}].props.cards[${j}].titulo = this.value" placeholder="Titulo" class="w-full glass-input rounded-lg p-2 text-xs text-white outline-none">
                                <textarea oninput="lpEditorBlocos[${i}].props.cards[${j}].texto = this.value" placeholder="Texto" rows="2" class="w-full glass-input rounded-lg p-2 text-xs text-white outline-none">${card.texto || ""}</textarea>
                            </div>
                        `).join("")}
                        <button onclick="adicionarItemListaEditor(${i}, 'cards', {titulo: '', texto: '', imagemB64: ''})" class="text-[10px] font-bold text-gray-400 hover:text-white">+ Adicionar card</button>
                    </div>
                `;
            } else if (bloco.tipo === "navegacao") {
                const links = bloco.props.links || [];
                return `
                    <div class="space-y-2 mt-3">
                        <input type="text" value="${(bloco.props.logoTexto || "").replace(/"/g, "&quot;")}" oninput="lpEditorBlocos[${i}].props.logoTexto = this.value" placeholder="Texto do logo" class="w-full glass-input rounded-lg p-2.5 text-xs text-white outline-none">
                        ${links.map((link, j) => `
                            <div class="grid grid-cols-2 gap-1.5">
                                <input type="text" value="${(link.label || "").replace(/"/g, "&quot;")}" oninput="lpEditorBlocos[${i}].props.links[${j}].label = this.value" placeholder="Texto do link" class="glass-input rounded-lg p-2 text-xs text-white outline-none">
                                <div class="flex gap-1">
                                    <input type="text" value="${(link.href || "").replace(/"/g, "&quot;")}" oninput="lpEditorBlocos[${i}].props.links[${j}].href = this.value" placeholder="#link" class="flex-1 glass-input rounded-lg p-2 text-xs text-white outline-none">
                                    <button onclick="removerItemListaEditor(${i}, 'links', ${j})" class="text-red-400 text-[9px] font-bold px-1">X</button>
                                </div>
                            </div>
                        `).join("")}
                        <button onclick="adicionarItemListaEditor(${i}, 'links', {label: '', href: '#'})" class="text-[10px] font-bold text-gray-400 hover:text-white">+ Adicionar link</button>
                    </div>
                `;
            } else if (bloco.tipo === "rodape") {
                const links = bloco.props.links || [];
                return `
                    <div class="space-y-2 mt-3">
                        <input type="text" value="${(bloco.props.textoCopyright || "").replace(/"/g, "&quot;")}" oninput="lpEditorBlocos[${i}].props.textoCopyright = this.value" placeholder="Texto de copyright" class="w-full glass-input rounded-lg p-2.5 text-xs text-white outline-none">
                        ${links.map((link, j) => `
                            <div class="grid grid-cols-2 gap-1.5">
                                <input type="text" value="${(link.label || "").replace(/"/g, "&quot;")}" oninput="lpEditorBlocos[${i}].props.links[${j}].label = this.value" placeholder="Texto do link" class="glass-input rounded-lg p-2 text-xs text-white outline-none">
                                <div class="flex gap-1">
                                    <input type="text" value="${(link.href || "").replace(/"/g, "&quot;")}" oninput="lpEditorBlocos[${i}].props.links[${j}].href = this.value" placeholder="#link" class="flex-1 glass-input rounded-lg p-2 text-xs text-white outline-none">
                                    <button onclick="removerItemListaEditor(${i}, 'links', ${j})" class="text-red-400 text-[9px] font-bold px-1">X</button>
                                </div>
                            </div>
                        `).join("")}
                        <button onclick="adicionarItemListaEditor(${i}, 'links', {label: '', href: '#'})" class="text-[10px] font-bold text-gray-400 hover:text-white">+ Adicionar link</button>
                    </div>
                `;
            } else if (bloco.tipo === "seletor_cores") {
                const opcoes = bloco.props.opcoes || [];
                return `
                    <div class="space-y-2 mt-3">
                        <input type="text" value="${(bloco.props.titulo || "").replace(/"/g, "&quot;")}" oninput="lpEditorBlocos[${i}].props.titulo = this.value" placeholder="Titulo (ex: Escolha a cor)" class="w-full glass-input rounded-lg p-2.5 text-xs text-white outline-none">
                        ${opcoes.map((op, j) => `
                            <div class="flex items-center gap-2">
                                <input type="color" value="${op.hex || "#000000"}" oninput="lpEditorBlocos[${i}].props.opcoes[${j}].hex = this.value" class="h-8 w-8 rounded cursor-pointer bg-transparent border-0">
                                <input type="text" value="${(op.nome || "").replace(/"/g, "&quot;")}" oninput="lpEditorBlocos[${i}].props.opcoes[${j}].nome = this.value" placeholder="Nome da cor" class="flex-1 glass-input rounded-lg p-2 text-xs text-white outline-none">
                                <button onclick="removerItemListaEditor(${i}, 'opcoes', ${j})" class="text-red-400 text-[9px] font-bold px-1">X</button>
                            </div>
                        `).join("")}
                        <button onclick="adicionarItemListaEditor(${i}, 'opcoes', {nome: '', hex: '#000000'})" class="text-[10px] font-bold text-gray-400 hover:text-white">+ Adicionar cor</button>
                    </div>
                `;
            } else if (bloco.tipo === "breadcrumb") {
                const itens = bloco.props.itens || [];
                return `
                    <div class="space-y-2 mt-3">
                        ${itens.map((item, j) => `
                            <div class="grid grid-cols-2 gap-1.5">
                                <input type="text" value="${(item.label || "").replace(/"/g, "&quot;")}" oninput="lpEditorBlocos[${i}].props.itens[${j}].label = this.value" placeholder="Texto" class="glass-input rounded-lg p-2 text-xs text-white outline-none">
                                <div class="flex gap-1">
                                    <input type="text" value="${(item.href || "").replace(/"/g, "&quot;")}" oninput="lpEditorBlocos[${i}].props.itens[${j}].href = this.value" placeholder="#link" class="flex-1 glass-input rounded-lg p-2 text-xs text-white outline-none">
                                    <button onclick="removerItemListaEditor(${i}, 'itens', ${j})" class="text-red-400 text-[9px] font-bold px-1">X</button>
                                </div>
                            </div>
                        `).join("")}
                        <button onclick="adicionarItemListaEditor(${i}, 'itens', {label: '', href: '#'})" class="text-[10px] font-bold text-gray-400 hover:text-white">+ Adicionar item</button>
                    </div>
                `;
            } else if (bloco.tipo === "forma") {
                return `
                    <div class="space-y-2 mt-3">
                        <select onchange="lpEditorBlocos[${i}].props.tipoForma = this.value" class="w-full glass-input rounded-lg p-2.5 text-xs text-white outline-none">
                            <option value="retangulo" ${bloco.props.tipoForma !== "circulo" && bloco.props.tipoForma !== "linha" ? "selected" : ""}>Retangulo</option>
                            <option value="circulo" ${bloco.props.tipoForma === "circulo" ? "selected" : ""}>Circulo</option>
                            <option value="linha" ${bloco.props.tipoForma === "linha" ? "selected" : ""}>Linha</option>
                        </select>
                        <div class="grid grid-cols-2 gap-2">
                            <div>
                                <label class="text-[9px] text-gray-500">Largura (px)</label>
                                <input type="number" min="1" value="${bloco.props.largura || 120}" oninput="lpEditorBlocos[${i}].props.largura = parseInt(this.value) || 120" class="w-full glass-input rounded-lg p-2 text-xs text-white outline-none">
                            </div>
                            <div>
                                <label class="text-[9px] text-gray-500">Altura (px)</label>
                                <input type="number" min="1" value="${bloco.props.altura || 120}" oninput="lpEditorBlocos[${i}].props.altura = parseInt(this.value) || 120" class="w-full glass-input rounded-lg p-2 text-xs text-white outline-none">
                            </div>
                        </div>
                        <div>
                            <label class="text-[9px] text-gray-500">Cor</label>
                            <input type="color" value="${bloco.props.cor || "#5B3DF5"}" oninput="lpEditorBlocos[${i}].props.cor = this.value" class="h-8 w-full rounded cursor-pointer bg-transparent border-0">
                        </div>
                    </div>
                `;
            }
            return "";
        }
        let produtosDoUsuarioCache = [];
        async function carregarProdutosParaEditor() {
            try {
                const snap = await getDocs(query(collection(db, "produtos"), where("criadoPor", "==", usuarioUID)));
                produtosDoUsuarioCache = [];
                snap.forEach(d => {
                    const p = d.data();
                    if (p.statusProduto !== "rascunho") produtosDoUsuarioCache.push({ id: d.id, nome: p.nome, preco: p.preco, imagemB64: p.imagemB64 });
                });
                renderizarEditorBlocos();
            } catch(err) {
                console.error("Erro ao carregar produtos pro editor de LP:", err);
            }
        }
        window.alternarProdutoCarrosselEditor = function(i, prodId, marcado) {
            if (!lpEditorBlocos[i].props.produtosIds) lpEditorBlocos[i].props.produtosIds = [];
            const ids = lpEditorBlocos[i].props.produtosIds;
            if (marcado && !ids.includes(prodId)) ids.push(prodId);
            if (!marcado) lpEditorBlocos[i].props.produtosIds = ids.filter(x => x !== prodId);
        };
        window.uploadBannerCarrosselEditor = async function(i, inputEl) {
            const file = inputEl.files[0];
            if (!file) return;
            try {
                const b64 = await comprimirImagem(file, 1600, 0.75);
                if (!lpEditorBlocos[i].props.banners) lpEditorBlocos[i].props.banners = [];
                lpEditorBlocos[i].props.banners.push({ imagemB64: b64, link: "" });
                renderizarEditorBlocos();
            } catch(err) {
                console.error(err);
                showToast("Erro ao processar imagem: " + err.message, "error");
            }
        };
        window.uploadImagemCardCarrosselEditor = async function(i, cardIndex, inputEl) {
            const file = inputEl.files[0];
            if (!file) return;
            try {
                const b64 = await comprimirImagem(file, 1200, 0.7);
                lpEditorBlocos[i].props.cards[cardIndex].imagemB64 = b64;
                renderizarEditorBlocos();
            } catch(err) {
                console.error(err);
                showToast("Erro ao processar imagem: " + err.message, "error");
            }
        };
        function renderAbaDesign(bloco, i) {
            const d = bloco.design;
            return `
                <div class="space-y-4 mt-3">
                    <div>
                        <p class="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Plano de fundo</p>
                        <div class="flex items-center gap-2 mb-2">
                            <input type="color" value="${d.corFundo || "#14132B"}" oninput="lpEditorBlocos[${i}].design.corFundo = this.value" class="h-8 w-8 rounded cursor-pointer bg-transparent border-0">
                            <span class="text-[10px] text-gray-500">Cor de fundo (usada se nao tiver imagem)</span>
                        </div>
                        ${d.imagemFundoB64 ? `
                            <div class="flex items-center gap-2 mb-2">
                                <img src="${d.imagemFundoB64}" class="h-12 w-20 object-cover rounded-lg border border-white/10">
                                <button onclick="removerImagemFundoEditor(${i})" class="text-red-400 hover:text-red-300 text-[10px] font-bold">Remover imagem</button>
                            </div>
                        ` : `
                            <label class="inline-block bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[10px] font-bold px-3 py-2 rounded-lg cursor-pointer transition-all">
                                Enviar imagem de fundo
                                <input type="file" accept="image/*" class="hidden" onchange="uploadImagemFundoEditor(${i}, this)">
                            </label>
                        `}
                        <div class="grid grid-cols-2 gap-2 mt-2">
                            <div>
                                <label class="text-[9px] text-gray-500">Cor da sobreposicao</label>
                                <input type="color" value="${d.corSobreposicao}" oninput="lpEditorBlocos[${i}].design.corSobreposicao = this.value" class="h-8 w-full rounded cursor-pointer bg-transparent border-0">
                            </div>
                            <div>
                                <label class="text-[9px] text-gray-500">Opacidade (0-100)</label>
                                <input type="number" min="0" max="100" value="${d.opacidadeSobreposicao}" oninput="lpEditorBlocos[${i}].design.opacidadeSobreposicao = parseInt(this.value) || 0" class="w-full glass-input rounded-lg p-2 text-xs text-white outline-none">
                            </div>
                        </div>
                    </div>
                    <div>
                        <p class="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Cor dos botoes</p>
                        <div class="grid grid-cols-3 gap-2">
                            <div>
                                <label class="text-[9px] text-gray-500">Fundo</label>
                                <input type="color" value="${d.corBotaoFundo || "#FFFFFF"}" oninput="lpEditorBlocos[${i}].design.corBotaoFundo = this.value" class="h-8 w-full rounded cursor-pointer bg-transparent border-0">
                            </div>
                            <div>
                                <label class="text-[9px] text-gray-500">Borda</label>
                                <input type="color" value="${d.corBotaoBorda || "#FFFFFF"}" oninput="lpEditorBlocos[${i}].design.corBotaoBorda = this.value" class="h-8 w-full rounded cursor-pointer bg-transparent border-0">
                            </div>
                            <div>
                                <label class="text-[9px] text-gray-500">Texto</label>
                                <input type="color" value="${d.corBotaoTexto || "#000000"}" oninput="lpEditorBlocos[${i}].design.corBotaoTexto = this.value" class="h-8 w-full rounded cursor-pointer bg-transparent border-0">
                            </div>
                        </div>
                    </div>
                    <div>
                        <p class="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Cor do texto do bloco</p>
                        <input type="color" value="${d.corTexto || "#FFFFFF"}" oninput="lpEditorBlocos[${i}].design.corTexto = this.value" class="h-8 w-full rounded cursor-pointer bg-transparent border-0">
                    </div>
                    <div>
                        <p class="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Espacamento (padding em px)</p>
                        <div class="grid grid-cols-2 gap-2">
                            <div>
                                <label class="text-[9px] text-gray-500">Superior</label>
                                <input type="number" min="0" value="${d.paddingTop}" oninput="lpEditorBlocos[${i}].design.paddingTop = parseInt(this.value) || 0" class="w-full glass-input rounded-lg p-2 text-xs text-white outline-none">
                            </div>
                            <div>
                                <label class="text-[9px] text-gray-500">Inferior</label>
                                <input type="number" min="0" value="${d.paddingBottom}" oninput="lpEditorBlocos[${i}].design.paddingBottom = parseInt(this.value) || 0" class="w-full glass-input rounded-lg p-2 text-xs text-white outline-none">
                            </div>
                        </div>
                    </div>
<div>
                        <p class="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Alinhamento</p>
                        <div class="flex gap-2">
                            ${["esquerda", "centro", "direita"].map(op => `
                                <button onclick="lpEditorBlocos[${i}].design.alinhamento = '${op}'; renderizarEditorBlocos();" class="flex-1 text-[10px] font-bold py-2 rounded-lg transition-all ${d.alinhamento === op ? "bg-white text-black" : "bg-white/5 text-gray-400 hover:bg-white/10"}">${op}</button>
                            `).join("")}
                        </div>
                    </div>
                    <div>
                        <p class="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Animacao de entrada</p>
                        <select onchange="lpEditorBlocos[${i}].design.animacao = this.value" class="w-full glass-input rounded-lg p-2.5 text-xs text-white outline-none">
                            ${[["", "Nenhuma"], ["fade", "Aparecer (fade)"], ["subir", "Subir"], ["esquerda", "Vindo da esquerda"], ["direita", "Vindo da direita"], ["zoom", "Zoom"]].map(op => `<option value="${op[0]}" ${(d.animacao || "") === op[0] ? "selected" : ""}>${op[1]}</option>`).join("")}
                        </select>
                        <p class="text-[9px] text-gray-500 mt-1">O efeito acontece quando o bloco entra na tela do visitante (veja na pagina publicada ou na previa de rascunho).</p>
                    </div>
                </div>
            `;
        }
        function renderAbaAvancado(bloco, i) {
            const d = bloco.design;
            return `
                <div class="space-y-4 mt-3">
                    <div>
                        <p class="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Visibilidade</p>
                        <div class="space-y-2">
                            <label class="flex items-center gap-2 text-xs text-gray-300">
                                <input type="checkbox" ${d.visivelDesktop ? "checked" : ""} onchange="lpEditorBlocos[${i}].design.visivelDesktop = this.checked">
                                Exibir no Desktop
                            </label>
                            <label class="flex items-center gap-2 text-xs text-gray-300">
                                <input type="checkbox" ${d.visivelMobile ? "checked" : ""} onchange="lpEditorBlocos[${i}].design.visivelMobile = this.checked">
                                Exibir no Mobile
                            </label>
                        </div>
                    </div>
                    <div>
                        <label class="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">ID da Secao (opcional, pra links internos tipo #secao)</label>
                        <input type="text" value="${(d.idSecao || "").replace(/"/g, "&quot;")}" oninput="lpEditorBlocos[${i}].design.idSecao = this.value" placeholder="minha-secao" class="w-full glass-input rounded-lg p-2.5 text-xs text-white outline-none">
                    </div>
                    <label class="flex items-center gap-2 text-xs text-gray-300">
                        <input type="checkbox" ${d.priorizarImagem ? "checked" : ""} onchange="lpEditorBlocos[${i}].design.priorizarImagem = this.checked">
                        Priorizar carregamento de imagem (use so no 1o bloco da pagina)
                    </label>
                </div>
            `;
        }
        function nomeResumoBloco(bloco) {
            const p = bloco.props || {};
            const texto = p.titulo || p.textoCopyright || p.logoTexto || p.url || "";
            if (!texto) return "";
            return texto.length > 28 ? texto.slice(0, 28) + "..." : texto;
        }
        window.alternarColapsoBloco = function(i) {
            lpEditorBlocos[i]._colapsado = !lpEditorBlocos[i]._colapsado;
            renderizarEditorBlocos();
            if (!lpEditorBlocos[i]._colapsado) {
                setTimeout(function() {
                    const alvo = document.getElementById("lped-preview-bloco-" + i);
                    if (alvo) alvo.scrollIntoView({ behavior: "smooth", block: "start" });
                }, 60);
            }
        };
        function renderizarEditorBlocos() {
const box = document.getElementById("lped-blocos-lista");
            box.innerHTML = lpEditorBlocos.map((bloco, i) => ({ bloco, i })).filter(x => blocoNaPaginaAtual(x.bloco)).map(({ bloco, i }) => {
                garantirDesignPadrao(bloco);
                const aba = bloco._aba;
                const colapsado = bloco._colapsado;
                let corpoHtml = "";
                if (!colapsado) {
                    let paneHtml = "";
                    if (aba === "design") paneHtml = renderAbaDesign(bloco, i);
                    else if (aba === "avancado") paneHtml = renderAbaAvancado(bloco, i);
                    else paneHtml = renderAbaConteudo(bloco, i);
                    corpoHtml = `
                        <div class="flex gap-1 mt-3 border-b border-white/5 pb-2">
                            <button onclick="event.stopPropagation(); trocarAbaBlocoEditor(${i}, 'conteudo')" class="text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all ${aba === "conteudo" ? "bg-[#FF7A45] text-white" : "text-gray-500 hover:text-gray-300"}">Conteudo</button>
                            <button onclick="event.stopPropagation(); trocarAbaBlocoEditor(${i}, 'design')" class="text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all ${aba === "design" ? "bg-[#FF7A45] text-white" : "text-gray-500 hover:text-gray-300"}">Design</button>
                            <button onclick="event.stopPropagation(); trocarAbaBlocoEditor(${i}, 'avancado')" class="text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all ${aba === "avancado" ? "bg-[#FF7A45] text-white" : "text-gray-500 hover:text-gray-300"}">Avancado</button>
                        </div>
                        ${paneHtml}
                    `;
                }
                const resumo = nomeResumoBloco(bloco);
                return `
                    <div class="glass-card rounded-xl p-4 border border-white/5 border-l-2 ${colapsado ? "border-l-[#5B3DF5]/50 hover:border-l-[#5B3DF5]" : "border-l-[#FF7A45]"} transition-all" data-lped-block-index="${i}" data-aura-mobile-block-card ondragover="permitirSoltarBloco(event)" ondrop="soltarBloco(event, ${i})">
                        <div class="flex items-center justify-between cursor-pointer" data-aura-mobile-card-trigger onclick="if (window.AuraStudioPro?.isMobileShellActive?.()) return; alternarColapsoBloco(${i})">
                            <div class="flex items-center gap-2 min-w-0">
                                <span draggable="${window.AuraStudioPro?.isMobileShellActive?.() ? "false" : "true"}" data-aura-block-drag-handle ondragstart="event.stopPropagation(); iniciarArrastoBloco(event, ${i})" onclick="event.stopPropagation()" class="cursor-grab text-gray-500 hover:text-white select-none shrink-0" title="Arrastar pra reordenar">&#10021;</span>
                                <svg class="w-3.5 h-3.5 text-gray-500 shrink-0 transition-transform ${colapsado ? "" : "rotate-90"}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                                <p class="text-xs font-bold text-white truncate">${nomeTipoBlocoEditor(bloco.tipo)}${resumo ? ` <span class="text-gray-500 font-normal">- ${resumo}</span>` : ""}</p>
                            </div>
                            <div class="flex items-center gap-1 shrink-0">
                                <button type="button" onclick="event.stopPropagation(); window.AuraStudioPro?.moveMobileBlock(${i}, -1)" title="Mover para cima" class="aura-lped-mobile-reorder text-gray-400 hover:text-white text-xs px-1.5 py-1" ${i === 0 ? "disabled" : ""}>&#9650;</button>
                                <button type="button" onclick="event.stopPropagation(); window.AuraStudioPro?.moveMobileBlock(${i}, 1)" title="Mover para baixo" class="aura-lped-mobile-reorder text-gray-400 hover:text-white text-xs px-1.5 py-1" ${i === lpEditorBlocos.length - 1 ? "disabled" : ""}>&#9660;</button>
                                ${lpEditorModoLayout === "livre" ? `
                                    <button onclick="event.stopPropagation(); trazerParaFrente(${i})" title="Trazer pra frente" class="text-gray-400 hover:text-white text-xs px-1.5 py-1">&#9650;</button>
                                    <button onclick="event.stopPropagation(); enviarParaTras(${i})" title="Mandar pra tras" class="text-gray-400 hover:text-white text-xs px-1.5 py-1">&#9660;</button>
                                ` : ""}
                                <button onclick="event.stopPropagation(); removerBlocoEditor(${i})" class="text-red-400 hover:text-red-300 text-xs px-2 py-1">Excluir</button>
                            </div>
                        </div>
                        ${corpoHtml}
                    </div>
                `;
}).join("") || '<p class="text-xs text-gray-500 text-center py-8">Nenhum bloco ainda. Adicione um abaixo.</p>';
            renderizarPreviewEditor();
            renderizarPainelCamadas();
        }
        window.alternarCampoFormEditor = function(i, campo, marcado) {
            if (!lpEditorBlocos[i].props.campos) lpEditorBlocos[i].props.campos = [];
            const campos = lpEditorBlocos[i].props.campos;
            if (marcado && !campos.includes(campo)) campos.push(campo);
            if (!marcado) lpEditorBlocos[i].props.campos = campos.filter(c => c !== campo);
        };
        window.moverBlocoEditor = function(i, direcao) {
            const novoIndex = i + direcao;
            if (novoIndex < 0 || novoIndex >= lpEditorBlocos.length) return;
            const temp = lpEditorBlocos[i];
            lpEditorBlocos[i] = lpEditorBlocos[novoIndex];
            lpEditorBlocos[novoIndex] = temp;
            renderizarEditorBlocos();
        };
window.removerBlocoEditor = function(i) {
            blocosSelecionadosLivre.clear();
            const removido = lpEditorBlocos.splice(i, 1)[0];
            if (removido && removido.id) lpEditorRemovidos.push(removido.id);
            renderizarEditorBlocos();
            salvarHistoricoEditor();
        };
        window.dragSourceIndex = null;
        window.iniciarArrastoBloco = function(event, i) {
            if (window.AuraStudioPro?.isMobileShellActive?.() || window.matchMedia?.("(max-width: 767px)")?.matches) {
                event.preventDefault();
                window.dragSourceIndex = null;
                return;
            }
            window.dragSourceIndex = i;
            event.dataTransfer.effectAllowed = "move";
        };
        window.permitirSoltarBloco = function(event) {
            if (window.AuraStudioPro?.isMobileShellActive?.() || window.matchMedia?.("(max-width: 767px)")?.matches) return;
            event.preventDefault();
        };
        window.soltarBloco = function(event, i) {
            event.preventDefault();
            if (window.AuraStudioPro?.isMobileShellActive?.() || window.matchMedia?.("(max-width: 767px)")?.matches) return;
            const origem = window.dragSourceIndex;
            if (origem === null || origem === undefined || origem === i) return;
blocosSelecionadosLivre.clear();
            const item = lpEditorBlocos.splice(origem, 1)[0];
            lpEditorBlocos.splice(i, 0, item);
            window.dragSourceIndex = null;
            renderizarEditorBlocos();
            salvarHistoricoEditor();
        };
       const TIPOS_BLOCO_DISPONIVEIS = [
            { tipo: "texto_midia", nome: "Texto e Midia", miniatura: '<div class="w-full h-11 flex gap-1.5 items-center"><div class="flex-1 space-y-1"><div class="h-1.5 w-4/5 bg-white/30 rounded"></div><div class="h-1 w-full bg-white/15 rounded"></div><div class="h-1 w-3/5 bg-white/15 rounded"></div></div><div class="w-6 h-8 bg-[#5B3DF5]/40 rounded"></div></div>' },
            { tipo: "formulario_captura", nome: "Formulario", miniatura: '<div class="w-full h-11 space-y-1 flex flex-col justify-center"><div class="h-1.5 w-full bg-white/15 rounded-sm"></div><div class="h-1.5 w-full bg-white/15 rounded-sm"></div><div class="h-1.5 w-2/3 bg-[#FF7A45]/50 rounded-sm"></div></div>' },
            { tipo: "faq", nome: "FAQ - Perguntas Frequentes", miniatura: '<div class="w-full h-11 space-y-1.5 flex flex-col justify-center"><div class="h-2 w-full bg-white/15 rounded flex items-center justify-end pr-1"><div class="w-1 h-1 bg-white/40 rounded-full"></div></div><div class="h-2 w-full bg-white/15 rounded flex items-center justify-end pr-1"><div class="w-1 h-1 bg-white/40 rounded-full"></div></div><div class="h-2 w-full bg-white/10 rounded"></div></div>' },
            { tipo: "galeria_imagens", nome: "Galeria de Imagens", miniatura: '<div class="w-full h-11 grid grid-cols-4 gap-1"><div class="bg-white/20 rounded"></div><div class="bg-[#5B3DF5]/40 rounded"></div><div class="bg-white/20 rounded"></div><div class="bg-white/20 rounded"></div></div>' },
            { tipo: "lista_cards", nome: "Lista de Cards", miniatura: '<div class="w-full h-11 flex gap-1.5"><div class="flex-1 bg-white/10 rounded space-y-1 p-1"><div class="h-1.5 w-1.5 bg-[#FF7A45]/50 rounded-full"></div><div class="h-1 w-full bg-white/20 rounded"></div></div><div class="flex-1 bg-white/10 rounded space-y-1 p-1"><div class="h-1.5 w-1.5 bg-white/30 rounded-full"></div><div class="h-1 w-full bg-white/20 rounded"></div></div><div class="flex-1 bg-white/10 rounded space-y-1 p-1"><div class="h-1.5 w-1.5 bg-white/30 rounded-full"></div><div class="h-1 w-full bg-white/20 rounded"></div></div></div>' },
            { tipo: "tabela_comparativo", nome: "Tabela de Comparativo", miniatura: '<div class="w-full h-11 grid grid-rows-3 gap-1"><div class="grid grid-cols-3 gap-1"><div class="bg-white/25 rounded-sm"></div><div class="bg-white/15 rounded-sm"></div><div class="bg-white/15 rounded-sm"></div></div><div class="grid grid-cols-3 gap-1"><div class="bg-white/10 rounded-sm"></div><div class="bg-[#5B3DF5]/30 rounded-sm"></div><div class="bg-white/10 rounded-sm"></div></div><div class="grid grid-cols-3 gap-1"><div class="bg-white/10 rounded-sm"></div><div class="bg-[#5B3DF5]/30 rounded-sm"></div><div class="bg-white/10 rounded-sm"></div></div></div>' },
            { tipo: "texto_rico", nome: "Texto Rico", miniatura: '<div class="w-full h-11 space-y-1.5 flex flex-col justify-center"><div class="h-1 w-full bg-white/20 rounded"></div><div class="h-1 w-full bg-white/20 rounded"></div><div class="h-1 w-4/5 bg-white/20 rounded"></div><div class="h-1 w-full bg-white/20 rounded"></div></div>' },
            { tipo: "codigo_iframe", nome: "Codigo / iFrame", miniatura: '<div class="w-full h-11 bg-white/10 rounded flex items-center justify-center border border-dashed border-white/20"><span class="text-[9px] font-mono text-[#a996ff]">&lt;/&gt;</span></div>' },
            { tipo: "carrossel_banners", nome: "Carrossel de Banners", miniatura: '<div class="w-full h-11 flex items-center gap-1"><span class="text-white/30 text-xs">&lsaquo;</span><div class="flex-1 h-8 bg-[#5B3DF5]/30 rounded"></div><span class="text-white/30 text-xs">&rsaquo;</span></div>' },
            { tipo: "carrossel_produtos", nome: "Carrossel de Produtos", miniatura: '<div class="w-full h-11 flex items-center gap-1"><div class="flex-1 h-8 bg-white/15 rounded"></div><div class="flex-1 h-8 bg-[#FF7A45]/40 rounded"></div><div class="flex-1 h-8 bg-white/15 rounded"></div><span class="text-white/30 text-xs shrink-0">&rsaquo;</span></div>' },
            { tipo: "carrossel_cards", nome: "Carrossel de Cards", miniatura: '<div class="w-full h-11 flex items-center gap-1"><div class="flex-1 h-8 bg-white/15 rounded"></div><div class="flex-1 h-8 bg-[#5B3DF5]/40 rounded"></div><div class="flex-1 h-8 bg-white/15 rounded"></div><span class="text-white/30 text-xs shrink-0">&rsaquo;</span></div>' },
            { tipo: "navegacao", nome: "Navegacao", miniatura: '<div class="w-full h-11 flex items-center justify-between px-1 border-b border-white/15 pb-2"><div class="w-3 h-3 bg-[#FF7A45]/50 rounded-sm"></div><div class="flex gap-1.5"><div class="h-1 w-3 bg-white/25 rounded"></div><div class="h-1 w-3 bg-white/25 rounded"></div><div class="h-1 w-3 bg-white/25 rounded"></div></div></div>' },
            { tipo: "rodape", nome: "Rodape", miniatura: '<div class="w-full h-11 flex items-end justify-between px-1 border-t border-white/15 pt-2"><div class="h-1 w-8 bg-white/20 rounded"></div><div class="flex gap-1.5"><div class="h-1 w-3 bg-white/25 rounded"></div><div class="h-1 w-3 bg-white/25 rounded"></div></div></div>' },
            { tipo: "seletor_cores", nome: "Seletor de Cores", miniatura: '<div class="w-full h-11 flex items-center justify-center gap-1.5"><div class="w-3 h-3 rounded-full bg-white/70"></div><div class="w-3 h-3 rounded-full bg-[#5B3DF5]/70"></div><div class="w-3 h-3 rounded-full bg-[#FF7A45]/70"></div><div class="w-3 h-3 rounded-full bg-white/30"></div></div>' },
            { tipo: "breadcrumb", nome: "Breadcrumb", miniatura: '<div class="w-full h-11 flex items-center justify-center gap-1 text-[9px] text-white/40"><span>Inicio</span><span>&rsaquo;</span><span>Pagina</span><span>&rsaquo;</span><span class="text-white/70">Atual</span></div>' },
            { tipo: "forma", nome: "Forma", miniatura: '<div class="w-full h-11 flex items-center justify-center gap-2"><div class="w-6 h-6 rounded-full bg-[#5B3DF5]/50"></div><div class="w-6 h-6 rounded bg-[#FF7A45]/50"></div></div>' }
        ];
        window.abrirPainelBlocos = function() {
            document.getElementById("lp-blocos-busca").value = "";
            renderizarPainelBlocos();
            document.getElementById("lp-blocos-panel").classList.remove("hidden");
        };
        window.fecharPainelBlocos = function() {
            document.getElementById("lp-blocos-panel").classList.add("hidden");
        };
        window.renderizarPainelBlocos = function() {
            const termo = document.getElementById("lp-blocos-busca").value.trim().toLowerCase();
            const grid = document.getElementById("lp-blocos-grid");
            const filtrados = TIPOS_BLOCO_DISPONIVEIS.filter(t => t.nome.toLowerCase().includes(termo));
            grid.innerHTML = filtrados.map(t => `
                <button onclick="selecionarBlocoPanel('${t.tipo}')" class="group flex flex-col items-stretch gap-2 bg-white/5 hover:bg-[#5B3DF5]/10 border border-white/5 hover:border-[#5B3DF5]/40 rounded-xl p-3 text-center transition-all">
                    ${t.miniatura}
                    <span class="text-[10px] font-bold text-white leading-tight">${t.nome}</span>
                </button>
            `).join("") || '<p class="col-span-2 text-xs text-gray-500 text-center py-8">Nenhum bloco encontrado.</p>';
        };
        window.selecionarBlocoPanel = function(tipo) {
            fecharPainelBlocos();
            adicionarBlocoEditor(tipo);
        };
        window.adicionarBlocoEditor = function(tipo) {
            const novoId = `lpb_${Date.now()}_${lpEditorBlocos.length}`;
            let props = {};
            if (tipo === "texto_midia") {
                props = { titulo: "Novo titulo", subtitulo: "Nova descricao", botaoTexto: "Saiba mais", botaoLink: "#", posicaoImagem: "direita" };
            } else if (tipo === "formulario_captura") {
                props = { titulo: "Preencha seus dados", campos: ["nome", "whatsapp"], textoBotao: "Enviar" };
            } else if (tipo === "faq") {
                props = { titulo: "Perguntas Frequentes", itens: [{ pergunta: "Pergunta exemplo", resposta: "Resposta exemplo" }] };
            } else if (tipo === "galeria_imagens") {
                props = { titulo: "Galeria", imagens: [] };
            } else if (tipo === "lista_cards") {
                props = { titulo: "Nossos diferenciais", cards: [{ icone: "⭐", titulo: "Card exemplo", texto: "Descricao do card" }] };
            } else if (tipo === "tabela_comparativo") {
                props = { titulo: "Compare", coluna1: "Basico", coluna2: "Premium", linhas: [{ label: "Recurso exemplo", valor1: "Nao", valor2: "Sim" }] };
            } else if (tipo === "texto_rico") {
                props = { titulo: "", conteudo: "Escreva seu texto aqui." };
            } else if (tipo === "codigo_iframe") {
                props = { url: "", altura: 400 };
            } else if (tipo === "carrossel_banners") {
                props = { banners: [] };
            } else if (tipo === "carrossel_produtos") {
                props = { titulo: "Nossos produtos", produtosIds: [] };
            } else if (tipo === "carrossel_cards") {
                props = { titulo: "Confira", estiloImagem: "lado", cards: [] };
            } else if (tipo === "navegacao") {
                props = { logoTexto: "Sua Marca", links: [{ label: "Inicio", href: "#" }] };
            } else if (tipo === "rodape") {
                props = { textoCopyright: "© 2026 Sua Marca. Todos os direitos reservados.", links: [] };
            } else if (tipo === "seletor_cores") {
                props = { titulo: "Escolha a cor", opcoes: [{ nome: "Preto", hex: "#000000" }] };
            } else if (tipo === "breadcrumb") {
                props = { itens: [{ label: "Inicio", href: "#" }] };
            } else if (tipo === "forma") {
                props = { tipoForma: "retangulo", largura: 120, altura: 120, cor: "#5B3DF5" };
            }
const novoBloco = { id: novoId, tipo, visivel: true, paginaId: lpEditorPaginaAtual || "pg_1", props, design: {}, _aba: "conteudo", _colapsado: false };
            if (lpEditorModoLayout === "livre") {
                const maiorY = Math.max(0, ...lpEditorBlocos.map(b => (b.y || 0) + (b.altura || 220)));
                novoBloco.x = 20;
                novoBloco.y = maiorY + 20;
                novoBloco.largura = 600;
                novoBloco.altura = 220;
                novoBloco.zIndex = Math.max(0, ...lpEditorBlocos.map(b => b.zIndex || 0)) + 1;
            }
blocosSelecionadosLivre.clear();
            lpEditorBlocos.push(novoBloco);
            renderizarEditorBlocos();
            salvarHistoricoEditor();
        };
        window.salvarEditorLP = async function() {
            if (!exigirEdicaoModulo("landing-pages")) return;

            const titulo = document.getElementById("lped-titulo").value.trim();
            const slug = document.getElementById("lped-slug").value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "");
            if (!titulo || !slug) return showToast("Preencha titulo e endereco.", "error");
            const slugAnterior = lpEditorSlugOriginal;
            const slugMudou = slug !== slugAnterior;
            try {
                if (slugMudou) {
                    const existente = await getDocs(query(collection(db, "landing_pages"), where("donoUID", "==", usuarioUID), where("pagina", "==", slug)));
                    const usadoPorOutra = existente.docs.some(d => d.id !== lpEditorId);
                    if (usadoPorOutra) return showToast("Ja existe outra LP com esse endereco.", "error");
                }
                if (!exigirEdicaoModulo("landing-pages")) return;

                for (const blocoId of lpEditorRemovidos) {
                    await deleteDoc(doc(db, "landing_pages_blocos", blocoId));
                    await deleteDoc(doc(db, "landing_pages_blocos_publicas", blocoId));
                }
                lpEditorRemovidos = [];
                for (const bloco of lpEditorBlocos) {
await setDoc(doc(db, "landing_pages_blocos", bloco.id), {
                        lpId: lpEditorId, donoUID: usuarioUID, tipo: bloco.tipo,
                        paginaId: bloco.paginaId || null,
                        visivel: bloco.visivel !== false, props: bloco.props, design: bloco.design || {},
                        x: bloco.x !== undefined ? bloco.x : null,
                        y: bloco.y !== undefined ? bloco.y : null,
                        largura: bloco.largura !== undefined ? bloco.largura : null,
                        altura: bloco.altura !== undefined ? bloco.altura : null,
                        zIndex: bloco.zIndex !== undefined ? bloco.zIndex : null
                    });
                }
await setDoc(doc(db, "landing_pages", lpEditorId), {
                    titulo, pagina: slug,
                    modoLayout: lpEditorModoLayout,
                    paginas: lpEditorPaginas,
                    ordemBlocos: lpEditorBlocos.map(b => b.id),
                    atualizadoEm: Date.now()
                }, { merge: true });
                lpEditorSlugOriginal = slug;
                if (lpEditorPublicado) {
                    if (slugMudou) {
                        const docIdAntigo = `${slugAtualSalvo}__${slugAnterior}`.toLowerCase();
                        await deleteDoc(doc(db, "landing_pages_publicas", docIdAntigo));
                    }
                    const docIdPublico = `${slugAtualSalvo}__${slug}`.toLowerCase();
await setDoc(doc(db, "landing_pages_publicas", docIdPublico), {
                        titulo, publicado: true, donoUID: usuarioUID, modoLayout: lpEditorModoLayout, paginas: lpEditorPaginas, ordemBlocos: lpEditorBlocos.map(b => b.id)
                    });
                    for (const bloco of lpEditorBlocos) {
await setDoc(doc(db, "landing_pages_blocos_publicas", bloco.id), {
                            lpId: lpEditorId, donoUID: usuarioUID, tipo: bloco.tipo,
                            paginaId: bloco.paginaId || null,
                            visivel: bloco.visivel !== false, props: bloco.props, design: bloco.design || {},
                            x: bloco.x !== undefined ? bloco.x : null,
                            y: bloco.y !== undefined ? bloco.y : null,
                            largura: bloco.largura !== undefined ? bloco.largura : null,
                            altura: bloco.altura !== undefined ? bloco.altura : null,
                            zIndex: bloco.zIndex !== undefined ? bloco.zIndex : null
                        });
                    }
                }
                showToast("Landing Page salva.");
            } catch(err) {
                console.error(err);
                showToast("Erro ao salvar: " + err.message, "error");
            }
        };
        window.publicarEditorLP = async function() {
            if (!exigirEdicaoModulo("landing-pages")) return;

            await salvarEditorLP();
            lpEditorPublicado = !lpEditorPublicado;
            await alternarPublicacaoLP(lpEditorId, lpEditorPublicado);
            atualizarBadgeStatusEditor();
        };
window.abrirPreviewEditorLP = async function() {
    if (!lpEditorPublicado) {
        await salvarEditorLP();
        const url = `https://videdigital.github.io/vide-digital/${slugAtualSalvo}/${lpEditorSlugOriginal}?preview=1`;
        window.open(url, "_blank");
    } else {
        const url = `https://videdigital.github.io/vide-digital/${slugAtualSalvo}/${lpEditorSlugOriginal}`;
        window.open(url, "_blank");
    }
};
        window.salvarLP = async function() {
            if (!exigirEdicaoModulo("landing-pages")) return;

            const titulo = document.getElementById("lp-titulo").value.trim();
            const slug = document.getElementById("lp-slug").value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "");
            const idEdicao = document.getElementById("lp-id-edicao").value;
            if (!titulo || !slug) return showToast("Preencha titulo e endereco.", "error");
            try {
                if (idEdicao) {
                    await setDoc(doc(db, "landing_pages", idEdicao), {
                        titulo, pagina: slug, atualizadoEm: Date.now()
                    }, { merge: true });
                    showToast("Landing Page atualizada.");
                } else {
                    const existente = await getDocs(query(collection(db, "landing_pages"), where("donoUID", "==", usuarioUID), where("pagina", "==", slug)));
                    if (!existente.empty) return showToast("Ja existe uma LP com esse endereco.", "error");
                    if (!exigirEdicaoModulo("landing-pages")) return;

                    const novoId = `lp_${Date.now()}`;
                    const modeloEscolhido = lpModeloEscolhido;

                    if (modeloEscolhido) {
                        // Modelo pronto: a página nasce sem blocos aqui. Os blocos
                        // de verdade só existem depois que o editor carrega (studio-library.js),
                        // então em vez de duplicar aquele conteúdo, abrimos o editor
                        // dessa LP recém-criada e inserimos o modelo por lá.
                        await setDoc(doc(db, "landing_pages", novoId), {
                            donoUID: usuarioUID, titulo, pagina: slug, publicado: false,
                            ordemBlocos: [],
                            criadoEm: Date.now(), atualizadoEm: Date.now()
                        });
                    } else {
                        const bloco1Id = `lpb_${Date.now()}_1`;
                        const bloco2Id = `lpb_${Date.now()}_2`;
                        await setDoc(doc(db, "landing_pages", novoId), {
                            donoUID: usuarioUID, titulo, pagina: slug, publicado: false,
                            ordemBlocos: [bloco1Id, bloco2Id],
                            criadoEm: Date.now(), atualizadoEm: Date.now()
                        });
                        await setDoc(doc(db, "landing_pages_blocos", bloco1Id), {
                            lpId: novoId, donoUID: usuarioUID, tipo: "texto_midia", visivel: true,
                            props: { titulo: "Seu titulo aqui", subtitulo: "Sua descricao aqui", botaoTexto: "Quero comecar", botaoLink: "#", posicaoImagem: "direita" }
                        });
                        await setDoc(doc(db, "landing_pages_blocos", bloco2Id), {
                            lpId: novoId, donoUID: usuarioUID, tipo: "formulario_captura", visivel: true,
                            props: { titulo: "Garanta sua vaga", campos: ["nome", "whatsapp"], textoBotao: "Enviar" }
                        });
                    }
                    showToast("Landing Page criada! Ja da pra publicar.");
                    fecharModalLP();
                    carregarLandingPages();
                    if (modeloEscolhido) {
                        await aplicarModeloNaLP(novoId, modeloEscolhido);
                    }
                    return;
                }
                fecharModalLP();
                carregarLandingPages();
            } catch(err) {
                console.error(err);
                showToast("Erro ao salvar: " + err.message, "error");
            }
        };

        async function aplicarModeloNaLP(id, modeloId) {
            try {
                await editarLP(id);
                if (typeof window.carregarEditorLandingPages === "function") {
                    await window.carregarEditorLandingPages();
                }
                const antes = lpEditorBlocos.length;
                window.AuraStudioPro?.insertPreset?.(modeloId);
                if (lpEditorBlocos.length === antes) {
                    showToast("Não consegui aplicar o modelo, mas a página foi criada em branco.", "error");
                    return;
                }
                await salvarEditorLP();
            } catch (err) {
                console.error("[LP] falha ao aplicar modelo:", err);
                showToast("Não consegui aplicar o modelo, mas a página foi criada em branco.", "error");
            }
        }
        window.alternarPublicacaoLP = async function(id, publicarAgora) {
            if (!exigirEdicaoModulo("landing-pages")) return;

            try {
                const snap = await getDoc(doc(db, "landing_pages", id));
                if (!snap.exists()) return;
                const lp = snap.data();
                if (!exigirEdicaoModulo("landing-pages")) return;

                await setDoc(doc(db, "landing_pages", id), { publicado: publicarAgora, atualizadoEm: Date.now() }, { merge: true });
                const docIdPublico = `${slugAtualSalvo}__${lp.pagina}`.toLowerCase();
                if (publicarAgora) {
await setDoc(doc(db, "landing_pages_publicas", docIdPublico), {
                        titulo: lp.titulo, publicado: true, donoUID: usuarioUID, modoLayout: lp.modoLayout || "empilhado", paginas: lp.paginas || [], ordemBlocos: lp.ordemBlocos || []
                    });
                    for (const blocoId of (lp.ordemBlocos || [])) {
                        const blocoSnap = await getDoc(doc(db, "landing_pages_blocos", blocoId));
                        if (blocoSnap.exists()) {
                            await setDoc(doc(db, "landing_pages_blocos_publicas", blocoId), { ...blocoSnap.data(), donoUID: usuarioUID });
                        }
                    }
                    showToast("Landing Page publicada!");
                } else {
                    await deleteDoc(doc(db, "landing_pages_publicas", docIdPublico));
                    for (const blocoId of (lp.ordemBlocos || [])) {
                        await deleteDoc(doc(db, "landing_pages_blocos_publicas", blocoId));
                    }
                    showToast("Landing Page despublicada.");
                }
                carregarLandingPages();
            } catch(err) {
                console.error(err);
                showToast("Erro: " + err.message, "error");
            }
        };
window.duplicarLP = async function(id) {
            if (!exigirEdicaoModulo("landing-pages")) return;

            try {
                const snap = await getDoc(doc(db, "landing_pages", id));
                if (!snap.exists()) return;
                const lp = snap.data();
                const todas = await getDocs(query(collection(db, "landing_pages"), where("donoUID", "==", usuarioUID)));
                if (!exigirEdicaoModulo("landing-pages")) return;

                const slugsExistentes = [];
                todas.forEach(d => slugsExistentes.push(d.data().pagina));
                let base = (lp.pagina || "").replace(/\d+$/, "");
                if (!base) base = lp.pagina;
                let n = 1;
                while (slugsExistentes.includes(base + n)) n++;
                const novoSlug = base + n;
                const tituloBase = (lp.titulo || "").replace(/\s*\d+$/, "");
                const novoTitulo = tituloBase + " " + n;
                const novoId = `lp_${Date.now()}`;
                const novaOrdem = [];
                let i = 0;
                for (const blocoId of (lp.ordemBlocos || [])) {
                    const blocoSnap = await getDoc(doc(db, "landing_pages_blocos", blocoId));
                    if (!blocoSnap.exists()) continue;
                    i++;
                    const novoBlocoId = `lpb_${Date.now()}_${i}`;
                    await setDoc(doc(db, "landing_pages_blocos", novoBlocoId), { ...blocoSnap.data(), lpId: novoId, donoUID: usuarioUID });
                    novaOrdem.push(novoBlocoId);
                }
await setDoc(doc(db, "landing_pages", novoId), {
                    donoUID: usuarioUID, titulo: novoTitulo, pagina: novoSlug, publicado: false,
                    modoLayout: lp.modoLayout || "empilhado", paginas: lp.paginas || [], ordemBlocos: novaOrdem,
                    criadoEm: Date.now(), atualizadoEm: Date.now()
                });
                showToast(`Copia criada: ${novoTitulo} (/${novoSlug})`);
                carregarLandingPages();
            } catch(err) {
                console.error(err);
                showToast("Erro ao duplicar: " + err.message, "error");
            }
        };
        window.excluirLP = async function(id) {
            if (!exigirEdicaoModulo("landing-pages")) return;

            abrirConfirmacao("Excluir esta Landing Page? Essa acao nao pode ser desfeita.", async () => {
                if (!exigirEdicaoModulo("landing-pages")) return;

                try {
                    const snap = await getDoc(doc(db, "landing_pages", id));
                    if (snap.exists()) {
                        const lp = snap.data();
                        for (const blocoId of (lp.ordemBlocos || [])) {
                            await deleteDoc(doc(db, "landing_pages_blocos", blocoId));
                            await deleteDoc(doc(db, "landing_pages_blocos_publicas", blocoId));
                        }
                        const docIdPublico = `${slugAtualSalvo}__${lp.pagina}`.toLowerCase();
                        await deleteDoc(doc(db, "landing_pages_publicas", docIdPublico));
                    }
                    await deleteDoc(doc(db, "landing_pages", id));
                    showToast("Landing Page excluida.");
                    carregarLandingPages();
                } catch(err) {
                    console.error(err);
                    showToast("Erro: " + err.message, "error");
                }
            });
        };

// FORÇA CAMPOS DE WHATSAPP A ACEITAREM SOMENTE NÚMEROS
        function aplicarMascaraNumerica(id) {
            const campo = document.getElementById(id);
            if (campo) {
                campo.addEventListener("input", () => {
                    campo.value = campo.value.replace(/\D/g, "");
                });
            }
        }
        ["perf-social-whatsapp-central", "perf-social-whatsapp-chat", "prod-whatsapp", "personalizacao-whatsapp"].forEach(aplicarMascaraNumerica);

        // COMPRIME A IMAGEM NO NAVEGADOR ANTES DE VIRAR BASE64 (evita estourar o limite do Firestore)
        function comprimirImagem(file, maxLargura = 1200, qualidade = 0.75) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const img = new Image();
                    img.onload = () => {
                        let largura = img.width;
                        let altura = img.height;
                        if (largura > maxLargura) {
                            altura = Math.round((altura * maxLargura) / largura);
                            largura = maxLargura;
                        }
                        const canvas = document.createElement("canvas");
                        canvas.width = largura;
                        canvas.height = altura;
                        canvas.getContext("2d").drawImage(img, 0, 0, largura, altura);
                        resolve(canvas.toDataURL("image/jpeg", qualidade));
                    };
                    img.onerror = reject;
                    img.src = e.target.result;
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        }

        // UPLOAD DE IMAGENS EM BASE64 (produto)
        inputImagemFile.addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (file) {
                inputImagemBase64.value = await comprimirImagem(file, 1000, 0.75);
            }
        });

        // UPLOAD DA LOGOMARCA (esse listener não existia — por isso a foto nunca salvava)
        document.getElementById("input-foto-perfil").addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const comprimida = await comprimirImagem(file, 500, 0.8);
            document.getElementById("perfil-foto-base64").value = comprimida;
            document.getElementById("preview-foto-perfil").src = comprimida;
        });

        // GALERIA DE BANNERS (MÚLTIPLAS IMAGENS, UPLOAD DO DISPOSITIVO)
        let listaBanners = [];

        function renderizarGaleriaBanners() {
            const box = document.getElementById("banners-galeria-preview");
            box.innerHTML = "";
            listaBanners.forEach((src, index) => {
                const item = document.createElement("div");
                item.className = "relative group rounded-xl overflow-hidden border border-white/10 h-24";
                item.innerHTML = `
                    <img src="${src}" class="w-full h-full object-cover">
                    <button type="button" data-index="${index}" class="btn-remover-banner absolute top-1 right-1 bg-black/70 hover:bg-red-600 text-white text-[10px] font-bold h-6 w-6 rounded-full flex items-center justify-center transition-all">✕</button>
                `;
                box.appendChild(item);
            });

            document.querySelectorAll(".btn-remover-banner").forEach(btn => {
                btn.addEventListener("click", (e) => {
                    const idx = parseInt(e.target.getAttribute("data-index"));
                    listaBanners.splice(idx, 1);
                    renderizarGaleriaBanners();
                });
            });
        }

        document.getElementById("input-banners-upload").addEventListener("change", async (e) => {
            const arquivos = Array.from(e.target.files);
            for (const file of arquivos) {
                const comprimida = await comprimirImagem(file, 1200, 0.65);
                listaBanners.push(comprimida);
                renderizarGaleriaBanners();
            }
            e.target.value = "";
        });

        tabCheckout.addEventListener("click", () => alternarDestino("checkout"));
        tabWhatsapp.addEventListener("click", () => alternarDestino("whatsapp"));

        function alternarDestino(destino) {
            tipoDestino = destino;
            if(destino === "checkout") {
                tabCheckout.className = "py-2.5 text-xs font-semibold rounded-lg text-white bg-white/10 transition-all";
                tabWhatsapp.className = "py-2.5 text-xs font-semibold rounded-lg text-gray-400 transition-all";
                wrapperCheckout.classList.remove("hidden");
                wrapperWhatsapp.classList.add("hidden");
            } else {
                tabWhatsapp.className = "py-2.5 text-xs font-semibold rounded-lg text-white bg-white/10 transition-all";
                tabCheckout.className = "py-2.5 text-xs font-semibold rounded-lg text-gray-400 transition-all";
                wrapperWhatsapp.classList.remove("hidden");
                wrapperCheckout.classList.add("hidden");
            }
        }

        // =============================================
        // LOGOFF AUTOMÁTICO POR INATIVIDADE (PRIVACIDADE)
        // =============================================
        // Depois de X minutos sem nenhuma interação, a sessão é encerrada
        // automaticamente e o usuário precisa fazer login de novo.
        const MINUTOS_INATIVIDADE = 30;
        const TEMPO_INATIVIDADE_MS = MINUTOS_INATIVIDADE * 60 * 1000;
        let timerInatividade = null;
        let controleInatividadeAtivo = false;

        async function encerrarPorInatividade() {
            try {
                await signOut(auth);
            } catch (err) {
                console.error(err);
            }
            window.location.href = "login.html?motivo=inatividade";
        }

        function resetarTimerInatividade() {
            if (!controleInatividadeAtivo) return;
            clearTimeout(timerInatividade);
            timerInatividade = setTimeout(encerrarPorInatividade, TEMPO_INATIVIDADE_MS);
        }

        function iniciarControleInatividade() {
            if (controleInatividadeAtivo) return; // evita registrar os listeners mais de uma vez
            controleInatividadeAtivo = true;
            ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"].forEach(evento => {
                document.addEventListener(evento, resetarTimerInatividade, { passive: true });
            });
            resetarTimerInatividade();
        }

        // CARGA DO USUÁRIO E PERSISTÊNCIA DOS CAMPOS ORIGINAIS
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                const paramsURL = new URLSearchParams(window.location.search);
                const masterUIDAlvo = paramsURL.get("masterUID");
                const resultadoContexto = await VideHubContext.initialize({
                    authUser: user,
                    db,
                    masterUID: masterUIDAlvo
                });

                if (!resultadoContexto.allowed || !VideHubContext.isActive()) {
                    showToast(resultadoContexto.message || "Acesso nao autorizado.", "error");
                    await signOut(auth);
                    window.location.href = "login.html";
                    return;
                }

                const contextoVide = VideHubContext.getSnapshot();
                usuarioEmail = contextoVide.authEmail;
                usuarioUID = contextoVide.effectiveUid || user.uid;
                const emModoMaster = contextoVide.isMasterMode;

                // Mostra o atalho "Painel Master" para administradores, sem trocar a conta autenticada.
                if (contextoVide.isAdmin && !emModoMaster) {
                    const btnPainelMaster = document.getElementById("btn-painel-master");
                    if (btnPainelMaster) { btnPainelMaster.classList.remove("hidden"); btnPainelMaster.classList.add("flex"); }
                }

                // CARREGAR PLANO E APLICAR RESTRIÇÕES
                const userSnap2 = await getDoc(doc(db, "usuarios", usuarioUID));
                const dadosPlano = userSnap2.exists() ? userSnap2.data() : {};

                if (emModoMaster) ativarBannerModoMaster(dadosPlano.nomeLoja || dadosPlano.urlLoja || "loja sem nome");

                const slugAtualURL = dadosPlano.urlLoja || "";
                if (slugAtualURL) {
                    atualizarLinksLojaPublica(slugAtualURL);
                    document.getElementById("url-loja-preview").innerText = `vide.digital/${slugAtualURL}`;
                }

                const planoAtual = dadosPlano.plano || "starter";
                planoAtualGlobal = planoAtual;

                const LIMITES_PLANO = {
                    starter: 3, basico: 5, essencial: 10, negocio: 20, profissional: 35,
                    avancado: 50, pro: -1, proplus: -1, agencia: -1, enterprise: -1, premium: -1
                };
                const RASCUNHOS_LIMITE = {
                    starter: 5, basico: 10, essencial: 20, negocio: 40, profissional: 70,
                    avancado: 100, pro: -1, proplus: -1, agencia: -1, enterprise: -1, premium: -1
                };

                const FEATURES_PLANO = {
                    starter:      ["hub"],
                    basico:       ["hub", "popup"],
                    essencial:    ["hub", "popup", "carrinho", "chat"],
                    negocio:      ["hub", "popup", "carrinho", "chat", "templates", "cupons"],
                    profissional: ["hub", "popup", "carrinho", "chat", "templates", "cupons", "campanhas", "metricas", "csv"],
                    avancado:     ["hub", "popup", "carrinho", "chat", "templates", "cupons", "campanhas", "metricas", "csv", "lp1", "qrcode", "temas"],
                    pro:          ["hub", "popup", "carrinho", "chat", "templates", "cupons", "campanhas", "metricas", "csv", "lp", "qrcode", "temas", "chatbot"],
                    proplus:      ["hub", "popup", "carrinho", "chat", "templates", "cupons", "campanhas", "metricas", "csv", "lp", "qrcode", "temas", "chatbot", "ia", "avaliacoes", "agenda"],
                    agencia:      ["hub", "popup", "carrinho", "chat", "templates", "cupons", "campanhas", "metricas", "csv", "lp", "qrcode", "temas", "chatbot", "ia", "avaliacoes", "agenda", "mapamental", "subcontas"],
                    enterprise:   ["hub", "popup", "carrinho", "chat", "templates", "cupons", "campanhas", "metricas", "csv", "lp", "qrcode", "temas", "chatbot", "ia", "avaliacoes", "agenda", "mapamental", "subcontas", "api", "relatorios"],
                    premium:      ["hub", "popup", "carrinho", "chat", "templates", "cupons", "campanhas", "metricas", "csv", "lp", "qrcode", "temas", "chatbot", "ia", "avaliacoes", "agenda", "mapamental", "subcontas", "api", "relatorios", "dominio", "suporte_vip", "onboarding"]
                };
                const ORDEM_PLANOS = ["starter","basico","essencial","negocio","profissional","avancado","pro","proplus","agencia","enterprise","premium"];
                const planoNomes = {
                    starter: "Starter", basico: "Básico", essencial: "Essencial",
                    negocio: "Negócio", profissional: "Profissional", avancado: "Avançado",
                    pro: "Pro", proplus: "Pro+", agencia: "Agência",
                    enterprise: "Enterprise", premium: "Premium"
                };
                const bloqueios = BLOQUEIOS_NAV; // mesmo objeto usado no bloqueio provisório lá em cima

                // Padrão seguro: antes do plano real, não usar cache/localStorage como autorização.
                temFeature = feature => feature === "leads";

                try {
                    // Buscar config de planos do Firebase (ou usar os valores padrão do código)
                    const configSnap = await getDoc(doc(db, "config", "planos"));
                    const configPlanos = configSnap.exists() ? configSnap.data() : null;

                    function listaFeaturesDoPlano(p) {
                        const salvas = configPlanos?.[p]?.features;
                        return (Array.isArray(salvas) && salvas.length > 0) ? salvas : (FEATURES_PLANO[p] || []);
                    }

                    const featuresAtivas = listaFeaturesDoPlano(planoAtual);
                    // Se o admin já customizou manualmente as funções desse cliente (via
                    // "Gerenciar Cliente"), essa lista MANDA — substitui o que vem do plano.
                    const featuresManuais = Array.isArray(dadosPlano.featuresManuais) ? dadosPlano.featuresManuais : null;
                    const featuresEfetivas = featuresManuais !== null ? featuresManuais : featuresAtivas;
                    const limiteSalvo = configPlanos?.[planoAtual]?.produtos;
                    limiteProdutosGlobal = (typeof limiteSalvo === "number") ? limiteSalvo : (LIMITES_PLANO[planoAtual] ?? 3);

                    const limiteRascunhosSalvo = configPlanos?.[planoAtual]?.rascunhos;
                    limiteRascunhosGlobal = (typeof limiteRascunhosSalvo === "number") ? limiteRascunhosSalvo : (RASCUNHOS_LIMITE[planoAtual] ?? 5);

                    VidePlanService.setPlan(planoAtual, featuresEfetivas, {
                        produtos: limiteProdutosGlobal,
                        rascunhos: limiteRascunhosGlobal
                    });

                    temFeature = function(feature) {
                        if (feature === "leads") return true;
                        if (!VidePlanService.isInitialized()) return false;
                        return VidePlanService.hasFeature(feature);
                    };

                    try { localStorage.setItem("ultimoPlanoFeatures_" + usuarioUID, JSON.stringify(featuresEfetivas)); } catch(e) {}

                    function planoMinimoParaFeature(feature) {
                        for (const p of ORDEM_PLANOS) {
                            if (listaFeaturesDoPlano(p).includes(feature)) return p;
                        }
                        return null;
                    }

                    // CONFIRMA OU LIBERA O CADEADO (o bloqueio provisório já existe desde
                    // o início da página — aqui só atualizamos, nunca criamos clique novo)
                    document.querySelectorAll("#sidebar-nav button[data-target]").forEach(btn => {
                        const target = btn.getAttribute("data-target");
                        const feature = bloqueios[target];
                        const badgeExistente = btn.querySelector(".cadeado-badge");
                        const moduloPermissao = moduloPermissaoPorAba(target);

                        if (moduloPermissao && !VideHubContext.canView(moduloPermissao)) {
                            btn.classList.add("hidden");
                            return;
                        }

                        btn.classList.remove("hidden");

                        if (feature && !temFeature(feature)) {
                            const planoNecessario = planoMinimoParaFeature(feature);
                            const nomePlanoNecessario = planoNecessario ? planoNomes[planoNecessario] : "um plano superior";
                            window._featureBloqueio[target] = nomePlanoNecessario;
                            btn.classList.add("opacity-40");
                            if (badgeExistente) badgeExistente.setAttribute("data-tip", `Disponível no plano ${nomePlanoNecessario}`);
                        } else {
                            delete window._featureBloqueio[target];
                            btn.classList.remove("opacity-40");
                            if (badgeExistente) badgeExistente.remove();
                        }
                    });
                    window._planoCarregado = true;

                    // MOSTRAR BADGE DO PLANO NO SIDEBAR (sem duplicar em recargas)
                    const boxAtivo = document.getElementById("box-atalho");
                    if (boxAtivo) {
                        let badgePlano = boxAtivo.querySelector(".badge-plano-atual");
                        if (!badgePlano) {
                            badgePlano = document.createElement("div");
                            badgePlano.className = "badge-plano-atual mt-3 text-center text-[10px] font-black uppercase tracking-wider text-[#00f2fe] bg-[#00f2fe]/10 border border-[#00f2fe]/20 rounded-lg py-1.5";
                            boxAtivo.querySelector("div").appendChild(badgePlano);
                        }
                        badgePlano.innerText = "Plano " + (planoNomes[planoAtual] || planoAtual);
                    }
                } catch (erroPlano) {
                    console.error("[Vide Hub] Erro ao carregar plano/cadeados:", erroPlano);
                    showToast("ERRO PLANO: " + (erroPlano?.message || erroPlano), "error");
                    // Falha ao carregar o plano: libera tudo (fail-open) e limpa os cadeados provisórios
                    window._planoCarregado = true;
                    window._featureBloqueio = {};
                    document.querySelectorAll("#sidebar-nav button[data-target]").forEach(btn => {
                        btn.classList.remove("opacity-40");
                        const badgeExistente = btn.querySelector(".cadeado-badge");
                        if (badgeExistente) badgeExistente.remove();
                    });
                }

                const userSnap = userSnap2;
                if (userSnap.exists()) {
                    const dados = userSnap.data();

                    document.getElementById("perf-nome-loja").value = dados.nomeLoja || "";
                    document.getElementById("perf-slug").value = dados.urlLoja || "";
                    document.getElementById("perf-titulo").value = dados.tituloHero || "";
                    document.getElementById("perf-subtitulo").value = dados.subtituloHero || "";
                    document.getElementById("perf-social-whatsapp-central").value = dados.whatsappCentral || "";
                    document.getElementById("perf-social-instagram").value = dados.instagramUser || "";
                    document.getElementById("perf-social-tiktok").value = dados.tiktokUser || "";
                    document.getElementById("perf-social-youtube").value = dados.youtubeUrl || "";
                    document.getElementById("perf-link1-titulo").value = dados.link1Titulo || "";
                    document.getElementById("perf-link1-url").value = dados.link1Url || "";
                    document.getElementById("perf-link1-icone").value = chaveIconeLink(dados.link1Icone);
                    document.getElementById("perf-link2-titulo").value = dados.link2Titulo || "";
                    document.getElementById("perf-link2-url").value = dados.link2Url || "";
                    document.getElementById("perf-link2-icone").value = chaveIconeLink(dados.link2Icone);
                    document.getElementById("perf-aba-padrao").value = dados.abaPadrao || "fisicos";

                    // Número do Chat e Botão Ativo
                    document.getElementById("perf-social-whatsapp-chat").value = dados.whatsappChat || "";
                    document.getElementById("perf-chat-ativo").checked = dados.chatAtivo || false;
                    document.getElementById("perf-carrinho-ativo").checked = dados.carrinhoAtivo || false;
                    document.getElementById("perf-carrinho-mensagem").value = dados.carrinhoMensagem || "";

                    // Cores Cliente
                    document.getElementById("perf-cor-destaque").value = dados.corDestaque || "#00f2fe";
                    document.getElementById("perf-cor-fundo").value = dados.corFundo || "#030712";
                    document.getElementById("perf-cor-card").value = dados.corCard || "#0c0c14";
                    document.getElementById("perf-cor-secundaria").value = dados.corSecundaria || "#4facfe";
                    document.getElementById("perf-cor-texto").value = dados.corTexto || "#e5e7eb";
                    document.getElementById("perf-cor-texto-botao").value = dados.corTextoBotao || "#000000";
                    document.getElementById("perf-cor-borda").value = dados.corBorda || "#ffffff";
                    document.getElementById("perf-fonte-vitrine").value = dados.fonteVitrine || "Plus Jakarta Sans";

                    // Cores Admin
                    const bgAdminSalvo = dados.adminCorFundo || "#030712";
                    document.getElementById("perf-admin-cor-fundo").value = bgAdminSalvo;
                    document.getElementById("perf-admin-cor-destaque").value = dados.adminCorDestaque || "#00f2fe";
                    aplicarCorDestaqueAdmin(dados.adminCorDestaque || "#00f2fe");
                    document.getElementById("perf-admin-cor-texto").value = dados.adminCorTexto || "#e5e7eb";
                    document.getElementById("perf-admin-cor-card").value = dados.adminCorCard || "#0d0d16";

                    // Executar Correção de Contraste Imediato
                    document.documentElement.style.setProperty("--sys-fundo", bgAdminSalvo);
                    document.documentElement.style.setProperty("--sys-destaque", dados.adminCorDestaque || "#00f2fe");
                    document.documentElement.style.setProperty("--sys-primaria", dados.adminCorDestaque || "#00f2fe");
                    document.documentElement.style.setProperty("--sys-texto", dados.adminCorTexto || "#e5e7eb");
                    document.getElementById("admin-body").style.backgroundColor = bgAdminSalvo;
                    verificarContrasteFundo(bgAdminSalvo);

                    if (dados.fotoPerfilB64) {
                        document.getElementById("preview-foto-perfil").src = dados.fotoPerfilB64;
                        document.getElementById("perfil-foto-base64").value = dados.fotoPerfilB64;
                    }

                    if (Array.isArray(dados.layoutLojaPublica) && dados.layoutLojaPublica.length > 0) {
                        const nomesLP = { banners: "🖼️ Banners", hero: "🔎 Título, Busca e Categorias", produtos: "🛍️ Produtos" };
                        listaLayoutLoja = dados.layoutLojaPublica.map(item => ({ id: item.id, nome: nomesLP[item.id] || item.id, visivel: item.visivel !== false }));
                        renderizarLayoutLoja();
                    }

                    window._layoutPorAbaSalvo = dados.layoutPorAba || {};
                    aplicarLayoutSalvoDaAba(document.querySelector(".view-section.active")?.id);

listaBanners = [];
                    try {
                        const snapBanners = await getDocs(query(collection(db, "banners_loja"), where("donoUID", "==", usuarioUID)));
                        let bannersCarregados = [];
                        snapBanners.forEach(d => bannersCarregados.push(d.data()));
                        bannersCarregados.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
                        listaBanners = bannersCarregados.map(b => b.imagemB64);
                    } catch (e) { console.error("Erro ao carregar banners:", e); }
                    renderizarGaleriaBanners();

                    slugAtualSalvo = dados.urlLoja || "";
                    const slugAtual = dados.urlLoja || "";
                    atualizarLinksLojaPublica(slugAtual);
                    document.getElementById("url-loja-preview").innerText = slugAtual ? `vide.digital/${slugAtual}` : "vide.digital/";
                    document.getElementById("txt-preview-nome-loja").innerText = dados.nomeLoja || "Visão Geral";
                    try { localStorage.setItem("ultimoPerfilLoja_" + usuarioUID, JSON.stringify({ nomeLoja: dados.nomeLoja, urlLoja: slugAtual })); } catch(e) {}
                    // GERAR LINKS UTM POR ORIGEM
                    const slugUTM = dados.urlLoja || "";
                    if (slugUTM) {
                        const baseUrl = `https://videdigital.github.io/vide-digital/loja.html?loja=${slugUTM}`;
                        const origens = [
                            { label: "Meta Ads (Facebook)", icon: "🟣", cor: "text-indigo-400", utm: "meta" },
                            { label: "Google Ads", icon: "🔵", cor: "text-blue-400", utm: "google" },
                            { label: "TikTok Ads", icon: "🩷", cor: "text-pink-400", utm: "tiktok" },
                            { label: "Instagram Orgânico", icon: "📸", cor: "text-purple-400", utm: "instagram" },
                            { label: "WhatsApp / Link Direto", icon: "💬", cor: "text-emerald-400", utm: "direto" }
                        ];
                        const boxUTM = document.getElementById("box-links-utm");
                        if (boxUTM) {
                            boxUTM.innerHTML = origens.map(o => {
                                const link = `${baseUrl}&utm_source=${o.utm}`;
                                return `
                                    <div class="flex items-center gap-3 bg-white/[0.02] p-3 rounded-xl border border-white/5">
                                        <span class="text-base shrink-0">${o.icon}</span>
                                        <div class="flex-1 min-w-0">
                                            <p class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">${o.label}</p>
                                            <p class="text-[10px] ${o.cor} truncate mt-0.5 font-mono">${link}</p>
                                        </div>
                                        <button onclick="navigator.clipboard.writeText('${link}').then(() => showToast('Link copiado!'))" class="shrink-0 text-[10px] font-bold text-white bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-lg transition-all">Copiar</button>
                                    </div>
                                `;
                            }).join("");
                        }
                    }
                }

                // Restaura a aba salva SOMENTE agora, depois que os cadeados já foram aplicados
                let abaRestauradaAposAuth = false;
                if (window._abaSalva && document.getElementById(window._abaSalva)) {
                    const featureNecessaria = bloqueios[window._abaSalva];
                    if (!featureNecessaria || temFeature(featureNecessaria)) {
                        ativarAba(window._abaSalva);
                        abaRestauradaAposAuth = true;
                    } else {
                        // A aba salva está bloqueada no plano atual: volta para a Visão Geral
                        ativarAba("view-dashboard");
                        abaRestauradaAposAuth = true;
                        localStorage.setItem("abaAtivaDashboard", "view-dashboard");
                    }
                }

                // Liga o logoff automático por inatividade (proteção de privacidade)
                iniciarControleInatividade();

                carregarProdutos();
                if (
                    !abaRestauradaAposAuth &&
                    document.getElementById("view-dashboard")?.classList.contains("active")
                ) {
                    carregarCockpitReal();
                }
                if (typeof window.renderizarPrimeirosPassos === "function") {
                    window.renderizarPrimeirosPassos();
                }
                if (typeof window.atualizarKpisDashboard === "function") {
                    window.atualizarKpisDashboard();
                }
                if (typeof window.renderizarAtividadeRecente === "function") {
                    window.renderizarAtividadeRecente();
                }
                if (typeof window.renderizarResumoSemana === "function") {
                    window.renderizarResumoSemana();
                }
                if (typeof window.renderizarAlertasAtencao === "function") {
                    window.renderizarAlertasAtencao();
                }
                if (temFeature("leads")) carregarLeads();
                if (temFeature("hub")) carregarPedidos();
                if (temFeature("templates")) carregarTemplates();
                if (temFeature("campanhas")) carregarCampanha();
                carregarNotificacoes();
            } else {
                window.location.href = "login.html";
            }
        });

// RESTAURAR CORES PADRÃO DO PROJETO (SOMENTE VISUAL, PRECISA SALVAR DEPOIS)
        document.getElementById("btn-resetar-cores").addEventListener("click", () => {
            const coresPadrao = {
                "perf-admin-cor-fundo": "#030712",
                "perf-admin-cor-destaque": "#00f2fe",
                "perf-admin-cor-texto": "#e5e7eb",
                "perf-admin-cor-card": "#0d0d16",
                "perf-cor-fundo": "#030712",
                "perf-cor-destaque": "#00f2fe",
                "perf-cor-card": "#0c0c14",
                "perf-cor-secundaria": "#4facfe",
                "perf-cor-texto": "#e5e7eb",
                "perf-cor-texto-botao": "#000000",
                "perf-cor-borda": "#ffffff"
            };

            Object.keys(coresPadrao).forEach(id => {
                const input = document.getElementById(id);
                if (input) {
                    input.value = coresPadrao[id];
                    input.dispatchEvent(new Event("input"));
                }
            });

            document.getElementById("perf-fonte-vitrine").value = "Plus Jakarta Sans";

            showToast("Cores restauradas! Clique em Salvar Alterações para confirmar.");
        });

        let listaLayoutLoja = [
    { id: "banners", nome: "🖼️ Banners", visivel: true },
    { id: "hero", nome: "🔎 Título, Busca e Categorias", visivel: true },
    { id: "produtos", nome: "🛍️ Produtos", visivel: true }
];

function renderizarLayoutLoja() {
    const box = document.getElementById("lista-layout-loja");
    if (!box) return;
    box.innerHTML = listaLayoutLoja.map((b, i) => `
        <div class="flex items-center justify-between bg-white/[0.02] border border-white/5 rounded-xl p-3 cursor-move" draggable="true" data-index="${i}">
            <span class="text-xs font-bold text-white">⠿ ${b.nome}</span>
            <button type="button" class="btn-toggle-layout-loja text-xs font-bold text-gray-300 hover:text-white" data-index="${i}">${b.visivel ? "👁️ Visível" : "🚫 Oculto"}</button>
        </div>
    `).join("");

    let arrastandoLP = null;
    box.querySelectorAll("[draggable]").forEach(el => {
        el.addEventListener("dragstart", () => { arrastandoLP = parseInt(el.getAttribute("data-index")); });
        el.addEventListener("dragover", (e) => {
            e.preventDefault();
            const alvo = parseInt(el.getAttribute("data-index"));
            if (arrastandoLP === null || arrastandoLP === alvo) return;
            const item = listaLayoutLoja.splice(arrastandoLP, 1)[0];
            listaLayoutLoja.splice(alvo, 0, item);
            arrastandoLP = alvo;
            renderizarLayoutLoja();
        });
    });

    box.querySelectorAll(".btn-toggle-layout-loja").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.getAttribute("data-index"));
            listaLayoutLoja[idx].visivel = !listaLayoutLoja[idx].visivel;
            renderizarLayoutLoja();
        });
    });
}
renderizarLayoutLoja();

document.getElementById("btn-salvar-perfil").addEventListener("click", () => {
            abrirConfirmacao("Deseja salvar todas as alterações da sua vitrine?", executarSalvamento);
        });

        // MOTOR GENÉRICO DO MODAL DE CONFIRMAÇÃO (substitui window.confirm)
        function abrirConfirmacao(mensagem, callback) {
            document.getElementById("confirm-modal-texto").innerText = mensagem;
            document.getElementById("confirm-modal").classList.remove("hidden");

            const btnOk = document.getElementById("confirm-modal-ok");
            const btnCancelar = document.getElementById("confirm-modal-cancelar");

            const fechar = () => document.getElementById("confirm-modal").classList.add("hidden");

            const novoOk = btnOk.cloneNode(true);
            btnOk.parentNode.replaceChild(novoOk, btnOk);
            novoOk.addEventListener("click", () => { fechar(); callback(); });

            const novoCancelar = btnCancelar.cloneNode(true);
            btnCancelar.parentNode.replaceChild(novoCancelar, btnCancelar);
            novoCancelar.addEventListener("click", fechar);
        }

        // Monta o pacote completo de dados da loja (usado por todas as seções)
        function montarPayloadCompleto() {
            return {
                nomeLoja: document.getElementById("perf-nome-loja").value.trim(),
                urlLoja: document.getElementById("perf-slug").value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, ""),
                tituloHero: document.getElementById("perf-titulo").value.trim(),
                subtituloHero: document.getElementById("perf-subtitulo").value.trim(),
                whatsappCentral: document.getElementById("perf-social-whatsapp-central").value.trim(),
                instagramUser: document.getElementById("perf-social-instagram").value.trim(),
                tiktokUser: document.getElementById("perf-social-tiktok").value.trim(),
                youtubeUrl: document.getElementById("perf-social-youtube").value.trim(),
                link1Titulo: document.getElementById("perf-link1-titulo").value.trim(),
                link1Url: document.getElementById("perf-link1-url").value.trim(),
                link1Icone: document.getElementById("perf-link1-icone").value,
                link2Titulo: document.getElementById("perf-link2-titulo").value.trim(),
                link2Url: document.getElementById("perf-link2-url").value.trim(),
                link2Icone: document.getElementById("perf-link2-icone").value,
                abaPadrao: document.getElementById("perf-aba-padrao").value,
                whatsappChat: document.getElementById("perf-social-whatsapp-chat").value.trim(),
                chatAtivo: document.getElementById("perf-chat-ativo").checked,
                carrinhoAtivo: document.getElementById("perf-carrinho-ativo").checked,
                carrinhoMensagem: document.getElementById("perf-carrinho-mensagem").value.trim(),
                corDestaque: document.getElementById("perf-cor-destaque").value,
                corFundo: document.getElementById("perf-cor-fundo").value,
                corCard: document.getElementById("perf-cor-card").value,
                corSecundaria: document.getElementById("perf-cor-secundaria").value,
                corTexto: document.getElementById("perf-cor-texto").value,
                corTextoBotao: document.getElementById("perf-cor-texto-botao").value,
                corBorda: document.getElementById("perf-cor-borda").value,
                fonteVitrine: document.getElementById("perf-fonte-vitrine").value,
                adminCorDestaque: document.getElementById("perf-admin-cor-destaque").value,
                adminCorFundo: document.getElementById("perf-admin-cor-fundo").value,
                adminCorTexto: document.getElementById("perf-admin-cor-texto").value,
                adminCorCard: document.getElementById("perf-admin-cor-card").value,
                fotoPerfilB64: document.getElementById("perfil-foto-base64").value
            };
        }

        // Grava no Firestore (usuarios + vitrines_publicas) e cuida da troca de slug
        async function executarSalvamento() {
            if (!exigirEdicaoModulo("configuracoes")) return;

            const payloadPerfil = montarPayloadCompleto();
            if (!payloadPerfil.urlLoja) return showToast("Slug inválido.", "error");

            // Verifica se o slug já está em uso por OUTRA conta antes de salvar
            if (payloadPerfil.urlLoja !== slugAtualSalvo) {
                try {
                    const slugCheck = await getDoc(doc(db, "vitrines_publicas", payloadPerfil.urlLoja));
                    if (slugCheck.exists() && slugCheck.data().donoUID !== usuarioUID) {
                        showToast("Esse slug já está em uso. Escolha outro.", "error");
                        return;
                    }
                } catch (err) {
                    console.error(err);
                    showToast("Erro ao verificar disponibilidade do slug.", "error");
                    return;
                }
            }

            try {
                if (!exigirEdicaoModulo("configuracoes")) return;

                await setDoc(doc(db, "usuarios", usuarioUID), payloadPerfil, { merge: true });

                const slugAnteriorSalvo = slugAtualSalvo;

                await setDoc(doc(db, "vitrines_publicas", payloadPerfil.urlLoja), {
                    donoUID: usuarioUID,
                    emailDono: usuarioUID,
                    nomeLoja: payloadPerfil.nomeLoja,
                    tituloHero: payloadPerfil.tituloHero,
                    subtituloHero: payloadPerfil.subtituloHero,
                    whatsappCentral: payloadPerfil.whatsappCentral,
                    chatAtivo: payloadPerfil.chatAtivo,
                    carrinhoAtivo: payloadPerfil.carrinhoAtivo,
                    carrinhoMensagem: payloadPerfil.carrinhoMensagem,
                    corClientBrand: payloadPerfil.corDestaque,
                    corClientFundo: payloadPerfil.corFundo,
                    corClientCard: payloadPerfil.corCard,
                    corClientSecundaria: payloadPerfil.corSecundaria,
                    corClientTexto: payloadPerfil.corTexto,
                    corClientTextoBotao: payloadPerfil.corTextoBotao,
                    corClientBorda: payloadPerfil.corBorda,
                    fonteVitrine: payloadPerfil.fonteVitrine,
                    fotoPerfilB64: payloadPerfil.fotoPerfilB64,
                    link1Titulo: payloadPerfil.link1Titulo,
                    link1Url: payloadPerfil.link1Url,
                    link1Icone: payloadPerfil.link1Icone,
                    link2Titulo: payloadPerfil.link2Titulo,
                    link2Url: payloadPerfil.link2Url,
                    link2Icone: payloadPerfil.link2Icone,
                    layoutLojaPublica: listaLayoutLoja.map(b => ({ id: b.id, visivel: b.visivel }))
                }, { merge: true });

                if (slugAnteriorSalvo && slugAnteriorSalvo !== payloadPerfil.urlLoja) {
                    await deleteDoc(doc(db, "vitrines_publicas", slugAnteriorSalvo));
                }

                slugAtualSalvo = payloadPerfil.urlLoja;

                try {
                    const snapBannersAntigos = await getDocs(query(collection(db, "banners_loja"), where("donoUID", "==", usuarioUID)));
                    await Promise.all(snapBannersAntigos.docs.map(d => deleteDoc(doc(db, "banners_loja", d.id))));
                    await Promise.all(listaBanners.map((imagemB64, index) =>
                        setDoc(doc(db, "banners_loja", `banner_${usuarioUID}_${index}`), {
                            donoUID: usuarioUID,
                            imagemB64,
                            ordem: index
                        })
                    ));
                } catch (errBanners) {

console.error("Erro ao salvar banners:", errBanners);

showToast("Erro ao salvar banner: " + (errBanners.message || "verifique o tamanho da imagem"), "error");

throw errBanners;

}

                showToast("Configurações salvas e aplicadas!");
            } catch (err) {
                console.error(err);
                showToast("Erro ao salvar dados no Firebase.", "error");
            }
        }

        // CARREGAR E RENDERIZAR LEADS ENTERPRISE ORIGINAIS
        async function carregarLeads(filtroDataDias = 30, filtroStatus = "todos", filtroOrigem = "todos", filtroBusca = "") {
            const tableBody = document.getElementById("leads-table-body");
            const statTotal = document.getElementById("lead-total-count");
            const statWhats = document.getElementById("lead-whatsapp-count");
            const statCliques = document.getElementById("lead-clicks-count");
            const statTempo = document.getElementById("lead-time-count");
            if (!usuarioUID) return;
            try {
                // Esqueleto enquanto a lista de leads carrega.
                if (tableBody) {
                    tableBody.innerHTML = Array.from({ length: 5 }).map(() => `
                        <tr class="border-b border-white/5">
                            <td class="p-4" colspan="9"><span class="aura-skel aura-skel-cell"></span></td>
                        </tr>
                    `).join("");
                }
                const q = query(collection(db, "leads"), where("criadoPor", "==", usuarioUID));
                const querySnapshot = await getDocs(q);
                const agora = Date.now();
                const { inicio, fim, todos } = normalizarIntervalo(filtroDataDias);

                let leads = [];
                querySnapshot.forEach(docSnap => {
                    const d = docSnap.data();
                    const dataLead = d.data || agora;
                    if (!todos && (dataLead < inicio || dataLead > fim)) return;
                    leads.push({ id: docSnap.id, ...d });
                });

                leads.sort((a, b) => (b.data || 0) - (a.data || 0));
                if (filtroBusca) {
                    leads = leads.filter(l =>
                        (l.nome || "").toLowerCase().includes(filtroBusca) ||
                        (l.whatsapp || "").includes(filtroBusca)
                    );
                }

                let totalLeads = leads.length;
                let comWhats = leads.filter(l => l.whatsapp).length;
                let totalCliques = leads.reduce((s, l) => s + (l.cliques || 1), 0);
                let totalTempo = leads.reduce((s, l) => s + (l.tempoRetencao || 0), 0);

                if (statTotal) statTotal.innerText = totalLeads;
                if (statWhats) statWhats.innerText = comWhats;
                if (statCliques) statCliques.innerText = totalCliques;
                if (statTempo) statTempo.innerText = totalLeads > 0 ? Math.round(totalTempo / totalLeads) + "s" : "0s";
                const countOrigem = { meta: 0, google: 0, tiktok: 0, instagram: 0 };
                leads.forEach(l => {
                    const orig = (l.origem || "").toLowerCase();
                    if (orig.includes("meta") || orig.includes("facebook") || orig === "fb") countOrigem.meta++;
                    else if (orig.includes("google") || orig === "gl") countOrigem.google++;
                    else if (orig.includes("tiktok") || orig === "tk") countOrigem.tiktok++;
                    else if (orig.includes("instagram") || orig === "ig") countOrigem.instagram++;
                });
                const elMeta = document.getElementById("origem-meta-count");
                const elGoogle = document.getElementById("origem-google-count");
                const elTiktok = document.getElementById("origem-tiktok-count");
                const elInsta = document.getElementById("origem-insta-count");
                if (elMeta) elMeta.innerText = countOrigem.meta;
                if (elGoogle) elGoogle.innerText = countOrigem.google;
                if (elTiktok) elTiktok.innerText = countOrigem.tiktok;
                if (elInsta) elInsta.innerText = countOrigem.instagram;

window._leadsVisiveis =
    leads;

renderizarKanbanLeads();
renderizarAgendaLeads();

alternarVisualLeads(
                    window._modoVisualLeads ||
                    localStorage.getItem(
                        "visualLeadsPreferido"
                    ) ||
                    "tabela"
                );

                if (totalLeads === 0) {
                    tableBody.innerHTML = `
    <tr>
        <td colspan="10" class="aura-leads-empty-row">
            Nenhum lead encontrado com os filtros selecionados.
        </td>
    </tr>
`;
                    return;
                }

                const statusClasses = {
                    novo: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
                    contato: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
                    convertido: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
                    perdido: "bg-red-500/10 text-red-400 border border-red-500/20"
                };
                const statusLabels = { novo: "Novo", contato: "Em Contato", convertido: "Convertido", perdido: "Perdido" };
                const origemClasses = {
                    meta: "bg-indigo-500/10 text-indigo-400",
                    google: "bg-blue-500/10 text-blue-400",
                    tiktok: "bg-pink-500/10 text-pink-400",
                    instagram: "bg-purple-500/10 text-purple-400",
                    direto: "bg-gray-500/10 text-gray-400"
                };

                tableBody.innerHTML = leads.map(lead => `
                    <tr class="hover:bg-white/[0.02] transition-colors border-b border-white/5 cursor-pointer" onclick="abrirPainelLead(${JSON.stringify(lead).replace(/"/g, '&quot;')})">
                        <td class="p-4">
                            <div class="flex items-center gap-2.5">
                                <div class="h-7 w-7 rounded-full bg-gradient-to-tr from-[#00f2fe]/20 to-[#4facfe]/20 border border-white/10 flex items-center justify-center text-[10px] font-black text-[#00f2fe] shrink-0">
                                    ${(lead.nome || "?")[0].toUpperCase()}
                                </div>
                                <span class="font-bold text-white text-xs">${lead.nome || "Anônimo"}</span>
                            </div>
                        </td>
                        <td class="p-4 text-gray-400 text-xs">${lead.email || "—"}</td>
                        <td class="p-4 text-emerald-400 text-xs font-medium">${lead.whatsapp || "—"}</td>
                        <td class="p-4">
                            <span class="text-[10px] font-bold px-2 py-1 rounded-md ${origemClasses[lead.origem] || origemClasses.direto} uppercase">${lead.origem || "Direto"}</span>
                        </td>
                        <td class="p-4 text-center text-xs font-bold text-white">${lead.cliques || 1}</td>
                        <td class="p-4 text-center text-xs text-amber-400 font-medium">${lead.tempoRetencao || 0}s</td>
                        <td class="p-4 text-[#00f2fe] text-xs max-w-[120px] truncate">${lead.produtoInteresse || "—"}</td>
                        <td class="p-4">
                            <select onclick="event.stopPropagation()" onchange="atualizarStatusLead('${lead.id}', this.value)" class="bg-transparent text-[10px] font-bold rounded-md px-2 py-1 border cursor-pointer outline-none ${statusClasses[lead.statusLead || 'novo']}">
                                <option value="novo" ${(lead.statusLead || 'novo') === 'novo' ? 'selected' : ''}>Novo</option>
                                <option value="contato" ${lead.statusLead === 'contato' ? 'selected' : ''}>Em Contato</option>
                                <option value="convertido" ${lead.statusLead === 'convertido' ? 'selected' : ''}>Convertido</option>
                                <option value="perdido" ${lead.statusLead === 'perdido' ? 'selected' : ''}>Perdido</option>
                            </select>
                        </td>
                        <td class="p-4 text-gray-500 text-xs">${lead.data ? new Date(lead.data).toLocaleDateString("pt-BR") : "Hoje"}</td>
                        <td class="p-4">
                            <input type="text" value="${lead.anotacao || ''}" placeholder="Anotação..." onblur="salvarAnotacaoLead('${lead.id}', this.value)" class="bg-transparent border-b border-white/10 focus:border-[#00f2fe] text-xs text-gray-400 focus:text-white outline-none w-32 transition-all pb-0.5">
                        </td>
                    </tr>
                `).join("");

            } catch (err) {
                console.error("Erro leads:", err);
            }
        }

/* =========================================================
   LINHA DO TEMPO 360 DO LEAD
   ========================================================= */

window._historicoLeadAtual = [];
window._filtroHistoricoLead = "todos";
window._leadHistoricoBase = null;

window.registrarAtividadeLead =
async function(
    leadId,
    tipo,
    titulo,
    descricao = "",
    extras = {}
) {
    if (!exigirEdicaoModulo("leads")) return;

    if (!leadId || !usuarioUID) {
        return;
    }

    const agora =
        Date.now();

    const atividade = {

        id:
            `lat_${agora}_${Math.random()
                .toString(36)
                .slice(2, 8)}`,

        leadId,

        criadoPor:
            usuarioUID,

        autorUID:
            usuarioUID,

        autorEmail:
            usuarioEmail ||
            "Sistema",

        tipo:
            tipo || "sistema",

        titulo:
            titulo || "Atividade",

        descricao:
            String(
                descricao || ""
            ).slice(0, 500),

        data:
            agora,

        ...extras

    };

    try {

        const leadRef =
            doc(
                db,
                "leads",
                leadId
            );

        const leadSnap =
            await getDoc(
                leadRef
            );

        if (!leadSnap.exists()) {
            return;
        }

        const dadosLead =
            leadSnap.data();

        if (
            dadosLead.criadoPor &&
            dadosLead.criadoPor !==
                usuarioUID
        ) {
            throw new Error(
                "Lead pertence a outra conta."
            );
        }

        const historicoAtual =
            Array.isArray(
                dadosLead
                    .historicoAtividades
            )
                ? dadosLead
                    .historicoAtividades
                : [];

        const novoHistorico =
            [
                atividade,
                ...historicoAtual
            ].slice(0, 80);

        await setDoc(
            leadRef,
            {
                historicoAtividades:
                    novoHistorico,

                historicoAtualizadoEm:
                    agora
            },
            {
                merge: true
            }
        );

        const leadLocal =
            window._leadsVisiveis
                ?.find(
                    item =>
                        item.id === leadId
                );

        if (leadLocal) {

            leadLocal
                .historicoAtividades =
                    novoHistorico;

            leadLocal
                .historicoAtualizadoEm =
                    agora;

        }

        const leadAberto =
            document.getElementById(
                "lead-painel-id"
            )?.value;

        if (leadAberto === leadId) {

            await carregarHistoricoLead(
                leadId,
                false
            );

        }

    } catch (erro) {

        console.error(
            "Erro ao registrar atividade:",
            erro
        );

    }

};

window.carregarHistoricoLead =
async function(
    leadOuId,
    mostrarCarregamento = true
) {

    const lista =
        document.getElementById(
            "lead-activity-list"
        );

    if (!lista) {
        return;
    }

    const leadId =
        typeof leadOuId === "object"
            ? leadOuId?.id
            : leadOuId;

    if (!leadId) {
        return;
    }

    if (mostrarCarregamento) {

        lista.innerHTML = `
            <div class="aura-lead-timeline-loading">
                Carregando histórico...
            </div>
        `;

    }

    const obterTimestamp =
        valor => {

            if (!valor) {
                return 0;
            }

            if (
                typeof valor.toMillis ===
                "function"
            ) {
                return valor.toMillis();
            }

            if (
                typeof valor.seconds ===
                "number"
            ) {
                return valor.seconds * 1000;
            }

            const numero =
                Number(valor);

            if (
                Number.isFinite(numero)
            ) {
                return numero;
            }

            const convertido =
                new Date(valor)
                    .getTime();

            return Number.isNaN(
                convertido
            )
                ? 0
                : convertido;

        };

    try {

        const leadRef =
            doc(
                db,
                "leads",
                leadId
            );

        const leadSnap =
            await getDoc(
                leadRef
            );

        if (!leadSnap.exists()) {

            lista.innerHTML = `
                <div class="aura-lead-timeline-empty">
                    Lead não encontrado.
                </div>
            `;

            return;

        }

        const dadosLead =
            leadSnap.data();

        if (
            dadosLead.criadoPor &&
            dadosLead.criadoPor !==
                usuarioUID
        ) {
            throw new Error(
                "Lead pertence a outra conta."
            );
        }

        const leadBase = {
            id: leadSnap.id,
            ...dadosLead
        };

        window._leadHistoricoBase =
            leadBase;

        const atividades =
            Array.isArray(
                dadosLead
                    .historicoAtividades
            )
                ? dadosLead
                    .historicoAtividades
                    .map(
                        atividade => ({
                            ...atividade,
                            data:
                                obterTimestamp(
                                    atividade.data
                                )
                        })
                    )
                : [];

        const dataCaptura =
            obterTimestamp(
                dadosLead.data ||
                dadosLead.criadoEm
            );

        const jaTemCaptura =
            atividades.some(
                atividade =>
                    atividade.tipo ===
                    "captura"
            );

        if (
            dataCaptura &&
            !jaTemCaptura
        ) {

            atividades.push({

                id:
                    `captura_${leadId}`,

                leadId,

                criadoPor:
                    usuarioUID,

                tipo:
                    "captura",

                titulo:
                    "Lead capturado",

                descricao:
                    `Origem: ${
                        dadosLead.origem ||
                        "Direto"
                    }`,

                autorEmail:
                    "Sistema",

                data:
                    dataCaptura,

                sintetica:
                    true

            });

        }

        atividades.sort(
            (a, b) =>
                obterTimestamp(b.data) -
                obterTimestamp(a.data)
        );

        window._historicoLeadAtual =
            atividades;

        renderizarHistoricoLead();

    } catch (erro) {

        console.error(
            "Erro ao carregar histórico:",
            erro
        );

        lista.innerHTML = `
            <div class="aura-lead-timeline-empty">
                Não foi possível carregar o histórico.
            </div>
        `;

    }

};

window.filtrarHistoricoLead =
function(tipo, botao) {

    window._filtroHistoricoLead =
        tipo || "todos";

    document
        .querySelectorAll(
            ".aura-lead-history-filter"
        )
        .forEach(item =>
            item.classList.remove(
                "is-active"
            )
        );

    botao?.classList.add(
        "is-active"
    );

    renderizarHistoricoLead();

};

window.renderizarHistoricoLead =
function() {

    const lista =
        document.getElementById(
            "lead-activity-list"
        );

    if (!lista) {
        return;
    }

    const grupos = {

        status: [
            "status",
            "kanban"
        ],

        contato: [
            "contato",
            "anotacao",
            "followup"
        ],

        automacao: [
            "template",
            "automacao"
        ]

    };

    const filtro =
        window._filtroHistoricoLead ||
        "todos";

    const atividades =
        window._historicoLeadAtual
            .filter(atividade => {

                if (filtro === "todos") {
                    return true;
                }

                return (
                    grupos[filtro] || []
                ).includes(
                    atividade.tipo
                );

            });

    const escaparHTML = valor =>
        String(valor || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");

    const formatarData = valor => {

        const timestamp =
            Number(valor || 0);

        if (!timestamp) {
            return "Data não informada";
        }

        const data =
            new Date(timestamp);

        return data.toLocaleString(
            "pt-BR",
            {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
            }
        );

    };

    if (!atividades.length) {

        lista.innerHTML = `
            <div class="aura-lead-timeline-empty">
                Nenhuma atividade encontrada neste filtro.
            </div>
        `;

        return;

    }

    lista.innerHTML =
        atividades.map(
            atividade => `
                <article
                    class="aura-lead-timeline-item"
                    data-type="${
                        escaparHTML(
                            atividade.tipo ||
                            "sistema"
                        )
                    }"
                >

                    <span class="aura-lead-timeline-dot"></span>

                    <div class="aura-lead-timeline-content">

                        <div class="aura-lead-timeline-top">

                            <strong>
                                ${escaparHTML(
                                    atividade.titulo ||
                                    "Atividade"
                                )}
                            </strong>

                            <time>
                                ${formatarData(
                                    atividade.data
                                )}
                            </time>

                        </div>

                        ${
                            atividade.descricao
                                ? `
                                    <p>
                                        ${escaparHTML(
                                            atividade.descricao
                                        )}
                                    </p>
                                `
                                : ""
                        }

                        <small>
                            ${
                                atividade.autorEmail ===
                                "Sistema"
                                    ? "Sistema"
                                    : escaparHTML(
                                        atividade
                                            .autorEmail ||
                                        "Usuário"
                                    )
                            }
                        </small>

                    </div>

                </article>
            `
        ).join("");

};

function escaparHtmlChat(valor) {
    return String(valor ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Normaliza o ícone dos "Links Personalizados" para uma CHAVE estável
// (link, chat, entrega...). Lojas antigas salvaram o valor como emoji
// (🔗, 💬...); aqui mapeamos esses valores legados pra chave nova, pra o
// seletor selecionar a opção certa e o valor virar chave ao salvar de novo.
function chaveIconeLink(valor) {
    const legado = { "🔗": "link", "💬": "chat", "📦": "entrega", "🎁": "promo", "📱": "app", "⭐": "avaliacoes", "📍": "local" };
    const validas = ["link", "chat", "entrega", "promo", "app", "avaliacoes", "local"];
    if (!valor) return "link";
    if (legado[valor]) return legado[valor];
    return validas.includes(valor) ? valor : "link";
}

window.enviarRespostaChatLead = function(event) {
    event.preventDefault();
    const input = document.getElementById("lead-painel-chat-input");
    const chatId = window._leadPainelChatId;
    const texto = input?.value.trim();
    if (!texto || !chatId) return false;

    const chatBox = document.getElementById("lead-painel-chat");
    input.disabled = true;
    // Resposta gravada direto no banco (sem Cloud Function): mensagem
    // "admin" na subcoleção + atualização do resumo/status do chat. As
    // regras liberam porque quem escreve é o dono/funcionário do tenant.
    setDoc(doc(collection(db, "chats", chatId, "mensagens")), {
        texto,
        sender: "admin",
        timestamp: Date.now()
    })
        .then(() => setDoc(doc(db, "chats", chatId), {
            ultimaMensagem: texto,
            statusAdmin: "respondido",
            atualizadoEm: Date.now()
        }, { merge: true }))
        .then(() => {
            input.value = "";
            const bolha = document.createElement("div");
            bolha.className = "flex justify-end";
            bolha.innerHTML = `<div class="max-w-[80%] px-3 py-2 rounded-xl text-xs bg-blue-500/20 text-blue-300 rounded-tr-none">${escaparHtmlChat(texto)}</div>`;
            chatBox?.appendChild(bolha);
            if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
        })
        .catch((err) => {
            console.error(err);
            showToast("Não foi possível enviar a resposta agora. Tente de novo.", "error");
        })
        .finally(() => {
            input.disabled = false;
            input.focus();
        });
    return false;
};

window.abrirPainelLead = async function(lead) {
            document.getElementById("lead-painel-id").value = lead.id;
            document.getElementById("lead-painel-avatar").innerText = (lead.nome || "?")[0].toUpperCase();
            document.getElementById("lead-painel-nome").innerText = lead.nome || "Anônimo";
            document.getElementById("lead-painel-origem").innerText = lead.origem || "Direto";
            document.getElementById("lead-painel-whatsapp").value = lead.whatsapp || "";
document.getElementById("lead-painel-email").value = lead.email || "";
document.getElementById("lead-painel-interesse").value = lead.produtoInteresse || "";
            document.getElementById("lead-painel-tempo").innerText = (lead.tempoRetencao || 0) + "s";
            document.getElementById("lead-painel-data").innerText = lead.data ? new Date(lead.data).toLocaleDateString("pt-BR") : "Hoje";
document.getElementById("lead-painel-status").value =
    lead.statusLead || "novo";

document.getElementById("lead-painel-anotacao").value =
    lead.anotacao || "";

const followupData =
    document.getElementById(
        "lead-followup-data"
    );

const followupHora =
    document.getElementById(
        "lead-followup-hora"
    );

const followupPrioridade =
    document.getElementById(
        "lead-followup-prioridade"
    );

const followupMotivo =
    document.getElementById(
        "lead-followup-motivo"
    );

const followupResumo =
    document.getElementById(
        "lead-followup-resumo"
    );

let followupTimestamp =
    lead.proximoContatoEm || 0;

if (
    typeof followupTimestamp?.toMillis ===
    "function"
) {
    followupTimestamp =
        followupTimestamp.toMillis();
}

if (
    typeof followupTimestamp?.seconds ===
    "number"
) {
    followupTimestamp =
        followupTimestamp.seconds * 1000;
}

followupTimestamp =
    Number(followupTimestamp || 0);

if (followupTimestamp) {

    const dataFollowup =
        new Date(followupTimestamp);

    const dataLocal =
        new Date(
            dataFollowup.getTime() -
            dataFollowup.getTimezoneOffset() *
            60000
        )
        .toISOString();

    if (followupData) {
        followupData.value =
            dataLocal.slice(0, 10);
    }

    if (followupHora) {
        followupHora.value =
            dataLocal.slice(11, 16);
    }

    if (followupResumo) {

        followupResumo.textContent =
            `Agendado para ${
                dataFollowup.toLocaleDateString(
                    "pt-BR"
                )
            } às ${
                dataFollowup.toLocaleTimeString(
                    "pt-BR",
                    {
                        hour: "2-digit",
                        minute: "2-digit"
                    }
                )
            }`;

    }

} else {

    if (followupData) {
        followupData.value = "";
    }

    if (followupHora) {
        followupHora.value = "09:00";
    }

    if (followupResumo) {
        followupResumo.textContent =
            "Nenhum contato agendado.";
    }

}

if (followupPrioridade) {
    followupPrioridade.value =
        lead.prioridadeLead ||
        "normal";
}

if (followupMotivo) {
    followupMotivo.value =
        lead.motivoFollowup ||
        "";
}

window._leadHistoricoBase =
    lead;

void carregarHistoricoLead(
    lead
);

            const btnWhats = document.getElementById("lead-painel-whatsapp-btn");
            if (lead.whatsapp) {
                btnWhats.onclick = () => window.open("https://wa.me/55" + lead.whatsapp, "_blank");
                btnWhats.classList.remove("opacity-40", "cursor-not-allowed");
            } else {
                btnWhats.onclick = null;
                btnWhats.classList.add("opacity-40", "cursor-not-allowed");
            }
            const chatBox = document.getElementById("lead-painel-chat");
            const chatInput = document.getElementById("lead-painel-chat-input");
            chatBox.innerHTML = "<p class='text-gray-600 text-xs'>Buscando histórico...</p>";
            window._leadPainelChatId = null;
            if (chatInput) chatInput.disabled = true;
            try {
                // As regras do Firestore só liberam "list" em /chats quando a
                // própria query já restringe por donoUID (o campo que a regra
                // checa) -- sem isso, a query inteira era negada com
                // permission-denied, mesmo pro dono de verdade, e caía direto
                // no catch() lá embaixo mostrando "Sem histórico de chat.".
                const chats = await getDocs(query(collection(db, "chats"), where("donoUID", "==", usuarioUID), where("clienteNome", "==", lead.nome)));
                if (chats.empty) {
                    chatBox.innerHTML = "<p class='text-gray-600 text-xs'>Nenhum chat encontrado.</p>";
                } else {
                    // Responde sempre no chat mais recente do lead (o normal é
                    // ter só um; se houver vários, o mais novo é o relevante).
                    const chatMaisRecente = chats.docs.reduce((mais, atual) =>
                        (atual.data().timestamp || 0) > (mais.data().timestamp || 0) ? atual : mais
                    );
                    window._leadPainelChatId = chatMaisRecente.id;
                    if (chatInput) chatInput.disabled = false;

                    let msgs = [];
                    for (const c of chats.docs) {
                        const mSnap = await getDocs(collection(db, "chats", c.id, "mensagens"));
                        mSnap.forEach(m => msgs.push({ ...m.data() }));
                    }
                    msgs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
                    if (msgs.length === 0) {
                        chatBox.innerHTML = "<p class='text-gray-600 text-xs'>Nenhuma mensagem.</p>";
                    } else {
                        chatBox.innerHTML = msgs.map(m =>
                            "<div class='flex " + (m.sender === 'admin' ? "justify-end" : "justify-start") + "'>" +
                            "<div class='max-w-[80%] px-3 py-2 rounded-xl text-xs " + (m.sender === 'admin' ? "bg-blue-500/20 text-blue-300 rounded-tr-none" : "bg-red-500/10 text-red-300 rounded-tl-none border border-red-500/10") + "'>" +
                            escaparHtmlChat(m.texto) + "</div></div>"
                        ).join("");
                        chatBox.scrollTop = chatBox.scrollHeight;
                    }
                }
            } catch(e) {
                chatBox.innerHTML = "<p class='text-gray-600 text-xs'>Sem histórico de chat.</p>";
            }
            const painelLead = document.getElementById("lead-painel");
            const overlayLead = document.getElementById("lead-painel-overlay");
            painelLead?.classList.remove("hidden");
            painelLead?.setAttribute("aria-hidden", "false");
            overlayLead?.classList.remove("hidden");
            overlayLead?.setAttribute("aria-hidden", "false");
            atualizarVisibilidadeBarraEditorLayout();
        };
window.abrirTemplatesDoLead = async function() {

    const nomeElemento =
        document.getElementById("lead-painel-nome");

    const whatsappElemento =
        document.getElementById("lead-painel-whatsapp");

    const lista =
        document.getElementById("template-lead-lista");

    const modal =
        document.getElementById("template-lead-modal");

    const nomeDestino =
        document.getElementById("template-lead-nome");

    const whatsappStatus =
        document.getElementById("template-lead-whatsapp-status");

    const totalElemento =
        document.getElementById("template-lead-total");

    const nome =
        String(
            nomeElemento?.textContent || "Lead"
        ).trim() || "Lead";

    const whatsappOriginal =
        String(
            whatsappElemento?.value ||
            whatsappElemento?.textContent ||
            ""
        ).trim();

    const whatsappNumeros =
        whatsappOriginal.replace(/\D/g, "");

    const possuiWhatsApp =
        whatsappNumeros.length >= 10;

    const whatsappCompleto =
        possuiWhatsApp
            ? (
                whatsappNumeros.startsWith("55")
                    ? whatsappNumeros
                    : `55${whatsappNumeros}`
            )
            : "";

    if (nomeDestino) {
        nomeDestino.textContent = nome;
    }

    if (whatsappStatus) {

        whatsappStatus.textContent =
            possuiWhatsApp
                ? "WhatsApp disponível"
                : "Sem WhatsApp";

        whatsappStatus.classList.toggle(
            "is-available",
            possuiWhatsApp
        );

        whatsappStatus.classList.toggle(
            "is-unavailable",
            !possuiWhatsApp
        );

    }

    if (totalElemento) {
        totalElemento.textContent = "—";
    }

    lista.innerHTML = `
        <div class="aura-template-lead-loading">

            <span>

                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M21 12a9 9 0 1 1-3-6.7"></path>
                </svg>

            </span>

            <strong>Carregando templates</strong>

            <p>
                Aguarde enquanto buscamos suas mensagens.
            </p>

        </div>
    `;

    modal?.classList.remove("hidden");
    modal?.setAttribute("aria-hidden", "false");
    atualizarVisibilidadeBarraEditorLayout();

    try {

        const snap = await getDocs(
            query(
                collection(db, "templates"),
                where("criadoPor", "==", usuarioUID)
            )
        );

        if (snap.empty) {

            if (totalElemento) {
                totalElemento.textContent = "0";
            }

            lista.innerHTML = `
                <div class="aura-template-lead-empty">

                    <span>

                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path d="M4 5h16v12H8l-4 4V5Z"></path>
                            <path d="M8 9h8"></path>
                            <path d="M8 13h5"></path>
                        </svg>

                    </span>

                    <strong>
                        Nenhum template disponível
                    </strong>

                    <p>
                        Crie uma mensagem na área Templates antes de utilizá-la em um atendimento.
                    </p>

                </div>
            `;

            return;

        }

        const templates = [];

        snap.forEach(documento => {

            const dados =
                documento.data();

            templates.push({
                id: documento.id,
                ...dados,
                mensagemFinal: String(
                    dados.mensagem || ""
                ).replace(
                    /\{nome\}/g,
                    nome.toLowerCase() === "anônimo"
                        ? ""
                        : nome
                )
            });

        });

        templates.sort(
            (a, b) =>
                (b.criadoEm || 0) -
                (a.criadoEm || 0)
        );

        window._templatesLeadDisponiveis =
            templates;

        if (totalElemento) {
            totalElemento.textContent =
                templates.length;
        }

        const categorias = {

            geral: {
                label: "Geral",
                state: "general"
            },

            vendas: {
                label: "Vendas",
                state: "sales"
            },

            suporte: {
                label: "Suporte",
                state: "support"
            },

            followup: {
                label: "Follow-up",
                state: "followup"
            },

            cobranca: {
                label: "Cobrança",
                state: "billing"
            }

        };

        const escaparHTML = valor =>
            String(valor || "")
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");

        lista.innerHTML =
            templates.map((template, indice) => {

                const categoria =
                    categorias[template.categoria] ||
                    categorias.geral;

                const fluxo =
                    template.fluxo || {};

                const totalAcoesFluxo =
                    fluxo.ativo
                        ? 1 +
                          (
                              fluxo.statusLead &&
                              fluxo.statusLead !== "nenhum"
                                  ? 1
                                  : 0
                          ) +
                          (
                              Number(
                                  fluxo.followupDias || 0
                              ) > 0
                                  ? 1
                                  : 0
                          ) +
                          (
                              String(
                                  fluxo.anotacao || ""
                              ).trim()
                                  ? 1
                                  : 0
                          )
                        : 0;

                return `
                    <div
                        class="glass-card aura-template-lead-item"
                        data-category="${categoria.state}"
                    >

                        <div class="aura-template-lead-item-top">

                            <span class="aura-template-lead-item-icon">

                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                    <path d="M4 5h16v12H8l-4 4V5Z"></path>
                                    <path d="M8 9h8"></path>
                                    <path d="M8 13h5"></path>
                                </svg>

                            </span>

                            <span class="aura-template-lead-category">
                                ${categoria.label}
                            </span>

                        </div>

                        <div class="aura-template-lead-item-content">

                            <h4>
                                ${escaparHTML(
                                    template.titulo ||
                                    "Template sem título"
                                )}
                            </h4>

                            <p>
                                ${escaparHTML(
                                    template.mensagemFinal
                                )}
                            </p>

                            ${
                                totalAcoesFluxo > 0
                                    ? `
                                        <span class="aura-template-lead-flow">
                                            Fluxo ativo · ${totalAcoesFluxo} ação(ões)
                                        </span>
                                    `
                                    : ""
                            }

                        </div>

                        <div class="aura-template-lead-item-actions">

                            <button
                                type="button"
                                class="aura-template-lead-copy"
                                data-template-index="${indice}"
                            >

                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                    <rect x="8" y="8" width="11" height="11" rx="2"></rect>
                                    <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"></path>
                                </svg>

                                Copiar

                            </button>

                            ${
                                possuiWhatsApp
                                    ? `
                                        <button
                                            type="button"
                                            class="aura-template-lead-send"
                                            data-template-index="${indice}"
                                        >

                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                <path d="M5 4h3l2 5-2 1.5a14 14 0 0 0 5.5 5.5L15 14l5 2v3c0 1.1-.9 2-2 2C9.7 21 3 14.3 3 6c0-1.1.9-2 2-2Z"></path>
                                            </svg>

                                            Enviar

                                        </button>
                                    `
                                    : `
                                        <span class="aura-template-lead-no-contact">
                                            Cadastre o WhatsApp para enviar
                                        </span>
                                    `
                            }

                        </div>

                    </div>
                `;

            }).join("");

        lista
            .querySelectorAll(
                ".aura-template-lead-copy"
            )
            .forEach(botao => {

                botao.addEventListener(
                    "click",
                    async () => {

                        const indice =
                            Number(
                                botao.dataset.templateIndex
                            );

                        const template =
                            window
                                ._templatesLeadDisponiveis?.[
                                    indice
                                ];

                        if (!template) return;

                        try {

                            await navigator.clipboard.writeText(
                                template.mensagemFinal
                            );

                            showToast(
                                "Template copiado!"
                            );

                        } catch (erro) {

                            console.error(erro);

                            showToast(
                                "Não foi possível copiar.",
                                "error"
                            );

                        }

                    }
                );

            });

        window.executarFluxoTemplateNoLead =
        async function(template) {
            if (!exigirEdicaoModulo("leads")) return;

            const fluxo =
                template?.fluxo || {};

            const leadId =
                document.getElementById(
                    "lead-painel-id"
                )?.value;

            if (!leadId) {
                return;
            }

            const agora =
                Date.now();

            const leadLocal =
                window._leadsVisiveis
                    ?.find(
                        lead =>
                            lead.id === leadId
                    );

            const atualizacoes = {

                ultimoContatoEm:
                    agora,

                ultimoTemplateId:
                    template.id || "",

                ultimoTemplateTitulo:
                    template.titulo || "",

                fluxoTemplateExecutadoEm:
                    agora

            };

            if (
                fluxo.statusLead &&
                fluxo.statusLead !== "nenhum"
            ) {

                atualizacoes.statusLead =
                    fluxo.statusLead;

            }

            const followupDias =
                Number(
                    fluxo.followupDias || 0
                );

            if (followupDias > 0) {

                atualizacoes.proximoContatoEm =
                    agora +
                    followupDias *
                    24 *
                    60 *
                    60 *
                    1000;

                atualizacoes.prioridadeLead =
                    fluxo.prioridade ||
                    "normal";

                atualizacoes.motivoFollowup =
                    fluxo.anotacao ||
                    `Retorno após o template ${
                        template.titulo ||
                        "enviado"
                    }`;

            }

            const anotacaoAutomatica =
                String(
                    fluxo.anotacao || ""
                ).trim();

            if (anotacaoAutomatica) {

                const anotacaoAtual =
                    String(
                        document.getElementById(
                            "lead-painel-anotacao"
                        )?.value ||
                        leadLocal?.anotacao ||
                        ""
                    ).trim();

                atualizacoes.anotacao =
                    [
                        anotacaoAtual,
                        anotacaoAutomatica
                    ]
                    .filter(Boolean)
                    .join("\n\n");

            }

            await setDoc(
                doc(
                    db,
                    "leads",
                    leadId
                ),
                atualizacoes,
                {
                    merge: true
                }
            );

            if (leadLocal) {

                Object.assign(
                    leadLocal,
                    atualizacoes
                );

            }

            const acoesFluxo = [];

            if (atualizacoes.statusLead) {
                acoesFluxo.push(
                    `status: ${
                        atualizacoes.statusLead
                    }`
                );
            }

            if (
                atualizacoes.proximoContatoEm
            ) {
                acoesFluxo.push(
                    "follow-up agendado"
                );
            }

            if (atualizacoes.anotacao) {
                acoesFluxo.push(
                    "anotação adicionada"
                );
            }

            await registrarAtividadeLead(
                leadId,
                fluxo.ativo
                    ? "automacao"
                    : "template",

                fluxo.ativo
                    ? "Template com fluxo executado"
                    : "Template aberto no WhatsApp",

                `${
                    template.titulo ||
                    "Template sem título"
                }${
                    acoesFluxo.length
                        ? ` · ${
                            acoesFluxo.join(
                                " · "
                            )
                        }`
                        : ""
                }`
            );

            if (atualizacoes.statusLead) {

                const statusCampo =
                    document.getElementById(
                        "lead-painel-status"
                    );

                if (statusCampo) {

                    statusCampo.value =
                        atualizacoes.statusLead;

                }

            }

            if (atualizacoes.anotacao) {

                const anotacaoCampo =
                    document.getElementById(
                        "lead-painel-anotacao"
                    );

                if (anotacaoCampo) {

                    anotacaoCampo.value =
                        atualizacoes.anotacao;

                }

            }

            if (atualizacoes.proximoContatoEm) {

                const resumo =
                    document.getElementById(
                        "lead-followup-resumo"
                    );

                if (resumo) {

                    const data =
                        new Date(
                            atualizacoes
                                .proximoContatoEm
                        );

                    resumo.textContent =
                        `Agendado para ${
                            data.toLocaleDateString(
                                "pt-BR"
                            )
                        } às ${
                            data.toLocaleTimeString(
                                "pt-BR",
                                {
                                    hour: "2-digit",
                                    minute: "2-digit"
                                }
                            )
                        }`;

                }

            }

            window.renderizarKanbanLeads?.();
            window.renderizarAgendaLeads?.();

            showToast(
                "Fluxo do template aplicado ao lead!"
            );

        };

        lista
            .querySelectorAll(
                ".aura-template-lead-send"
            )
            .forEach(botao => {

                botao.addEventListener(
                    "click",
                    () => {

                        const indice =
                            Number(
                                botao.dataset.templateIndex
                            );

                        const template =
                            window
                                ._templatesLeadDisponiveis?.[
                                    indice
                                ];

                        if (
                            !template ||
                            !whatsappCompleto
                        ) {
                            return;
                        }

                        void executarFluxoTemplateNoLead(
                            template
                        ).catch(erro => {

                            console.error(
                                "Erro ao executar fluxo:",
                                erro
                            );

                            showToast(
                                "A mensagem foi aberta, mas o fluxo não pôde ser concluído.",
                                "error"
                            );

                        });

                        const url =
                            `https://wa.me/${whatsappCompleto}?text=${
                                encodeURIComponent(
                                    template.mensagemFinal
                                )
                            }`;

                        window.open(
                            url,
                            "_blank",
                            "noopener,noreferrer"
                        );

                    }
                );

            });

    } catch (erro) {

        console.error(erro);

        if (totalElemento) {
            totalElemento.textContent = "—";
        }

        lista.innerHTML = `
            <div class="aura-template-lead-error">

                Não foi possível carregar os templates.

            </div>
        `;

    }

};

window.fecharModalTemplatesLead = function() {

    const modal = document.getElementById("template-lead-modal");
    modal?.classList.add("hidden");
    modal?.setAttribute("aria-hidden", "true");

    window._templatesLeadDisponiveis = [];
    atualizarVisibilidadeBarraEditorLayout();

};
        window.fecharPainelLead = function() {
            fecharSuperficiesLeadsDashboard();
            atualizarVisibilidadeBarraEditorLayout();
        };
window.salvarAnotacaoLead =
async function(leadId, texto) {
    if (!exigirEdicaoModulo("leads")) return;

    try {

        await setDoc(
            doc(
                db,
                "leads",
                leadId
            ),
            {
                anotacao: texto,
                anotacaoAtualizadaEm:
                    Date.now()
            },
            {
                merge: true
            }
        );

        const leadLocal =
            window._leadsVisiveis
                ?.find(
                    item =>
                        item.id === leadId
                );

        if (leadLocal) {
            leadLocal.anotacao =
                texto;
        }

        await registrarAtividadeLead(
            leadId,
            "anotacao",
            "Anotação atualizada",
            texto
                ? texto.slice(0, 180)
                : "A anotação foi removida."
        );

        showToast(
            "Anotação salva!"
        );

    } catch (erro) {

        console.error(erro);

        showToast(
            "Erro ao salvar anotação.",
            "error"
        );

    }

};

window.salvarCampoLead =
async function(campo, valor) {
    if (!exigirEdicaoModulo("leads")) return;

    const leadId =
        document.getElementById(
            "lead-painel-id"
        )?.value;

    if (!leadId) {
        return;
    }

    const nomesCampos = {
        nome: "Nome",
        email: "E-mail",
        whatsapp: "WhatsApp",
        produtoInteresse: "Interesse"
    };

    try {

        await setDoc(
            doc(
                db,
                "leads",
                leadId
            ),
            {
                [campo]: valor,
                contatoAtualizadoEm:
                    Date.now()
            },
            {
                merge: true
            }
        );

        const leadLocal =
            window._leadsVisiveis
                ?.find(
                    item =>
                        item.id === leadId
                );

        if (leadLocal) {
            leadLocal[campo] =
                valor;
        }

        await registrarAtividadeLead(
            leadId,
            "contato",
            `${
                nomesCampos[campo] ||
                "Informação"
            } atualizado`,
            valor ||
            "Campo removido"
        );

        showToast(
            "Contato atualizado!"
        );

        if (
            typeof window
                .aplicarFiltrosLeads ===
            "function"
        ) {
            window
                .aplicarFiltrosLeads(
                    false
                );
        }

    } catch (erro) {

        console.error(erro);

        showToast(
            "Erro ao atualizar contato.",
            "error"
        );

    }

};

/* =========================================================
   PIPELINE KANBAN DE LEADS
   ========================================================= */

window._leadsVisiveis =
    window._leadsVisiveis || [];

window._modoVisualLeads =
    localStorage.getItem(
        "visualLeadsPreferido"
    ) || "tabela";

window.alternarVisualLeads = function(modo) {

    const tabela =
        document.getElementById(
            "leads-table-view"
        );

    const kanban =
        document.getElementById(
            "leads-kanban-board"
        );

    const agenda =
        document.getElementById(
            "leads-agenda-view"
        );

    const botaoTabela =
        document.getElementById(
            "btn-leads-table-view"
        );

    const botaoKanban =
        document.getElementById(
            "btn-leads-kanban-view"
        );

    const botaoAgenda =
        document.getElementById(
            "btn-leads-agenda-view"
        );

    const modoValido =
        ["tabela", "kanban", "agenda"]
            .includes(modo)
            ? modo
            : "tabela";

    window._modoVisualLeads =
        modoValido;

    localStorage.setItem(
        "visualLeadsPreferido",
        modoValido
    );

    tabela?.classList.toggle(
        "hidden",
        modoValido !== "tabela"
    );

    kanban?.classList.toggle(
        "hidden",
        modoValido !== "kanban"
    );

    agenda?.classList.toggle(
        "hidden",
        modoValido !== "agenda"
    );

    botaoTabela?.classList.toggle(
        "is-active",
        modoValido === "tabela"
    );

    botaoKanban?.classList.toggle(
        "is-active",
        modoValido === "kanban"
    );

    botaoAgenda?.classList.toggle(
        "is-active",
        modoValido === "agenda"
    );

    if (modoValido === "kanban") {
        renderizarKanbanLeads();
    }

    if (modoValido === "agenda") {
        renderizarAgendaLeads();
    }

};

function renderizarKanbanLeads() {

    const board =
        document.getElementById(
            "leads-kanban-board"
        );

    if (!board) return;

    const leads =
        Array.isArray(
            window._leadsVisiveis
        )
            ? window._leadsVisiveis
            : [];

    const escapar = valor =>
        String(valor || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");

    const formatarData = valor => {

        if (!valor) {
            return "Hoje";
        }

        if (
            typeof valor.toMillis ===
            "function"
        ) {
            valor = valor.toMillis();
        }

        if (
            typeof valor.seconds ===
            "number"
        ) {
            valor =
                valor.seconds * 1000;
        }

        const data =
            new Date(valor);

        if (
            Number.isNaN(
                data.getTime()
            )
        ) {
            return "Data não informada";
        }

        return data.toLocaleDateString(
            "pt-BR"
        );

    };

    const colunas = [

        {
            id: "novo",
            titulo: "Novos",
            descricao: "Aguardando atendimento"
        },

        {
            id: "contato",
            titulo: "Em contato",
            descricao: "Negociação em andamento"
        },

        {
            id: "convertido",
            titulo: "Convertidos",
            descricao: "Oportunidades concluídas"
        },

        {
            id: "perdido",
            titulo: "Perdidos",
            descricao: "Oportunidades encerradas"
        }

    ];

    const cardHTML = lead => {

        const nome =
            lead.nome || "Lead anônimo";

        const whatsapp =
            lead.whatsapp || "";

        const email =
            lead.email || "";

        const contato =
            whatsapp ||
            email ||
            "Contato não informado";

        const origem =
            lead.origem ||
            "Direto";

        const interesse =
            lead.produtoInteresse ||
            "Interesse não informado";

        const status =
            lead.statusLead ||
            "novo";

        return `
            <div
                class="aura-lead-kanban-card"
                draggable="true"
                role="button"
                tabindex="0"
                data-lead-id="${escapar(lead.id)}"
            >

                <div class="aura-lead-kanban-card-top">

                    <span class="aura-lead-kanban-avatar">
                        ${escapar(nome.charAt(0).toUpperCase())}
                    </span>

                    <span class="aura-lead-kanban-origin">
                        ${escapar(origem)}
                    </span>

                </div>

                <div class="aura-lead-kanban-content">

                    <strong>
                        ${escapar(nome)}
                    </strong>

                    <span>
                        ${escapar(contato)}
                    </span>

                </div>

                <div class="aura-lead-kanban-interest">

                    <small>Interesse</small>

                    <span>
                        ${escapar(interesse)}
                    </span>

                </div>

                <div class="aura-lead-kanban-footer">

                    <span>
                        ${formatarData(lead.data)}
                    </span>

                    <select
                        class="aura-lead-kanban-status"
                        data-lead-status="${escapar(lead.id)}"
                        aria-label="Alterar status do lead"
                    >
                        <option
                            value="novo"
                            ${status === "novo" ? "selected" : ""}
                        >
                            Novo
                        </option>

                        <option
                            value="contato"
                            ${status === "contato" ? "selected" : ""}
                        >
                            Em contato
                        </option>

                        <option
                            value="convertido"
                            ${status === "convertido" ? "selected" : ""}
                        >
                            Convertido
                        </option>

                        <option
                            value="perdido"
                            ${status === "perdido" ? "selected" : ""}
                        >
                            Perdido
                        </option>
                    </select>

                </div>

            </div>
        `;

    };

    board.innerHTML =
        colunas.map(coluna => {

            const leadsColuna =
                leads.filter(lead =>
                    (
                        lead.statusLead ||
                        "novo"
                    ) === coluna.id
                );

            return `
                <div
                    class="aura-lead-kanban-column"
                    data-kanban-status="${coluna.id}"
                >

                    <div class="aura-lead-kanban-column-header">

                        <div>

                            <span class="aura-lead-kanban-column-dot"></span>

                            <strong>
                                ${coluna.titulo}
                            </strong>

                        </div>

                        <span class="aura-lead-kanban-count">
                            ${leadsColuna.length}
                        </span>

                    </div>

                    <p class="aura-lead-kanban-column-description">
                        ${coluna.descricao}
                    </p>

                    <div class="aura-lead-kanban-list">

                        ${
                            leadsColuna.length
                                ? leadsColuna
                                    .map(cardHTML)
                                    .join("")
                                : `
                                    <div class="aura-lead-kanban-empty">
                                        Nenhum lead nesta etapa
                                    </div>
                                `
                        }

                    </div>

                </div>
            `;

        }).join("");

    board
        .querySelectorAll(
            ".aura-lead-kanban-card"
        )
        .forEach(card => {

            const leadId =
                card.dataset.leadId;

            card.addEventListener(
                "click",
                evento => {

                    if (
                        evento.target.closest(
                            "select"
                        )
                    ) {
                        return;
                    }

                    const lead =
                        window
                            ._leadsVisiveis
                            .find(
                                item =>
                                    item.id ===
                                    leadId
                            );

                    if (
                        lead &&
                        typeof abrirPainelLead ===
                        "function"
                    ) {
                        abrirPainelLead(lead);
                    }

                }
            );

            card.addEventListener(
                "keydown",
                evento => {

                    if (
                        evento.key !== "Enter" &&
                        evento.key !== " "
                    ) {
                        return;
                    }

                    evento.preventDefault();
                    card.click();

                }
            );

            card.addEventListener(
                "dragstart",
                evento => {

                    if (
                        evento.target.closest(
                            "select"
                        )
                    ) {
                        evento.preventDefault();
                        return;
                    }

                    evento.dataTransfer
                        .setData(
                            "text/plain",
                            leadId
                        );

                    evento.dataTransfer
                        .effectAllowed =
                        "move";

                    card.classList.add(
                        "is-dragging"
                    );

                }
            );

            card.addEventListener(
                "dragend",
                () => {

                    card.classList.remove(
                        "is-dragging"
                    );

                    board
                        .querySelectorAll(
                            ".aura-lead-kanban-column"
                        )
                        .forEach(coluna =>
                            coluna.classList.remove(
                                "is-drag-over"
                            )
                        );

                }
            );

        });

    board
        .querySelectorAll(
            ".aura-lead-kanban-status"
        )
        .forEach(select => {

            select.addEventListener(
                "click",
                evento =>
                    evento.stopPropagation()
            );

            select.addEventListener(
                "change",
                evento => {

                    evento.stopPropagation();

                    moverLeadKanban(
                        select.dataset.leadStatus,
                        select.value
                    );

                }
            );

        });

    board
        .querySelectorAll(
            ".aura-lead-kanban-column"
        )
        .forEach(coluna => {

            coluna.addEventListener(
                "dragover",
                evento => {

                    evento.preventDefault();

                    evento.dataTransfer
                        .dropEffect =
                        "move";

                    coluna.classList.add(
                        "is-drag-over"
                    );

                }
            );

            coluna.addEventListener(
                "dragleave",
                evento => {

                    if (
                        coluna.contains(
                            evento.relatedTarget
                        )
                    ) {
                        return;
                    }

                    coluna.classList.remove(
                        "is-drag-over"
                    );

                }
            );

            coluna.addEventListener(
                "drop",
                evento => {

                    evento.preventDefault();

                    coluna.classList.remove(
                        "is-drag-over"
                    );

                    const leadId =
                        evento.dataTransfer
                            .getData(
                                "text/plain"
                            );

                    const novoStatus =
                        coluna.dataset
                            .kanbanStatus;

                    if (
                        leadId &&
                        novoStatus
                    ) {
                        moverLeadKanban(
                            leadId,
                            novoStatus
                        );
                    }

                }
            );

        });

}

window.renderizarKanbanLeads =
    renderizarKanbanLeads;

/* =========================================================
   AGENDA COMERCIAL DE FOLLOW-UPS
   ========================================================= */

function obterTimestampFollowup(valor) {

    if (!valor) return 0;

    if (
        typeof valor.toMillis ===
        "function"
    ) {
        return valor.toMillis();
    }

    if (
        typeof valor.seconds ===
        "number"
    ) {
        return valor.seconds * 1000;
    }

    const numero =
        Number(valor);

    return Number.isFinite(numero)
        ? numero
        : 0;

}

function renderizarAgendaLeads() {

    const container =
        document.getElementById(
            "leads-agenda-view"
        );

    if (!container) return;

    const leads =
        Array.isArray(
            window._leadsVisiveis
        )
            ? window._leadsVisiveis
            : [];

    const escapar = valor =>
        String(valor || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");

    const inicioHoje =
        new Date();

    inicioHoje.setHours(
        0,
        0,
        0,
        0
    );

    const fimHoje =
        new Date(inicioHoje);

    fimHoje.setHours(
        23,
        59,
        59,
        999
    );

    const fimSeteDias =
        new Date(fimHoje);

    fimSeteDias.setDate(
        fimSeteDias.getDate() + 7
    );

    const prioridadePeso = {
        alta: 0,
        normal: 1,
        baixa: 2
    };

    const ordenar = lista =>
        [...lista].sort(
            (a, b) => {

                const dataA =
                    obterTimestampFollowup(
                        a.proximoContatoEm
                    );

                const dataB =
                    obterTimestampFollowup(
                        b.proximoContatoEm
                    );

                if (
                    Boolean(dataA) !==
                    Boolean(dataB)
                ) {
                    return dataA
                        ? -1
                        : 1;
                }

                if (dataA !== dataB) {
                    return dataA - dataB;
                }

                return (
                    prioridadePeso[
                        a.prioridadeLead ||
                        "normal"
                    ] -
                    prioridadePeso[
                        b.prioridadeLead ||
                        "normal"
                    ]
                );

            }
        );

    const grupos = [

        {
            id: "overdue",
            titulo: "Atrasados",
            descricao:
                "Contatos que já deveriam ter sido realizados",
            leads: leads.filter(lead => {

                const data =
                    obterTimestampFollowup(
                        lead.proximoContatoEm
                    );

                return (
                    data > 0 &&
                    data < inicioHoje.getTime()
                );

            })
        },

        {
            id: "today",
            titulo: "Hoje",
            descricao:
                "Follow-ups programados para o dia",
            leads: leads.filter(lead => {

                const data =
                    obterTimestampFollowup(
                        lead.proximoContatoEm
                    );

                return (
                    data >= inicioHoje.getTime() &&
                    data <= fimHoje.getTime()
                );

            })
        },

        {
            id: "week",
            titulo: "Próximos 7 dias",
            descricao:
                "Contatos agendados para esta semana",
            leads: leads.filter(lead => {

                const data =
                    obterTimestampFollowup(
                        lead.proximoContatoEm
                    );

                return (
                    data > fimHoje.getTime() &&
                    data <= fimSeteDias.getTime()
                );

            })
        },

        {
            id: "later",
            titulo: "Futuros",
            descricao:
                "Follow-ups agendados após sete dias",
            leads: leads.filter(lead => {

                const data =
                    obterTimestampFollowup(
                        lead.proximoContatoEm
                    );

                return (
                    data >
                    fimSeteDias.getTime()
                );

            })
        }

    ];

    const totalAgendados =
        grupos.reduce(
            (total, grupo) =>
                total + grupo.leads.length,
            0
        );

    const totalAtrasados =
        grupos[0].leads.length;

    const totalHoje =
        grupos[1].leads.length;

    const semAgendamento =
        leads.filter(
            lead =>
                !obterTimestampFollowup(
                    lead.proximoContatoEm
                )
        ).length;

    const formatarData = timestamp => {

        const data =
            new Date(timestamp);

        return {
            data:
                data.toLocaleDateString(
                    "pt-BR"
                ),

            hora:
                data.toLocaleTimeString(
                    "pt-BR",
                    {
                        hour: "2-digit",
                        minute: "2-digit"
                    }
                )
        };

    };

    const renderizarCard = lead => {

        const timestamp =
            obterTimestampFollowup(
                lead.proximoContatoEm
            );

        const horario =
            formatarData(timestamp);

        const prioridade =
            lead.prioridadeLead ||
            "normal";

        const whatsapp =
            String(
                lead.whatsapp || ""
            ).replace(/\D/g, "");

        return `
            <article
                class="aura-followup-card"
                data-priority="${prioridade}"
                onclick="abrirLeadDaAgenda('${escapar(lead.id)}')"
            >

                <div class="aura-followup-card-top">

                    <div class="aura-followup-person">

                        <span>
                            ${escapar(
                                (
                                    lead.nome ||
                                    "L"
                                )
                                .charAt(0)
                                .toUpperCase()
                            )}
                        </span>

                        <div>

                            <strong>
                                ${escapar(
                                    lead.nome ||
                                    "Lead anônimo"
                                )}
                            </strong>

                            <small>
                                ${escapar(
                                    lead.origem ||
                                    "Origem direta"
                                )}
                            </small>

                        </div>

                    </div>

                    <span
                        class="aura-followup-priority"
                    >
                        ${prioridade}
                    </span>

                </div>

                <div class="aura-followup-date">

                    <span>

                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <rect x="3" y="5" width="18" height="16" rx="3"></rect>
                            <path d="M16 3v4"></path>
                            <path d="M8 3v4"></path>
                            <path d="M3 10h18"></path>
                        </svg>

                        ${horario.data}

                    </span>

                    <strong>
                        ${horario.hora}
                    </strong>

                </div>

                <p>
                    ${escapar(
                        lead.motivoFollowup ||
                        "Motivo não informado."
                    )}
                </p>

                <div class="aura-followup-actions">

                    ${
                        whatsapp.length >= 10
                            ? `
                                <button
                                    type="button"
                                    onclick="event.stopPropagation(); abrirWhatsFollowup('${escapar(lead.id)}')"
                                    class="aura-followup-whatsapp"
                                >
                                    WhatsApp
                                </button>
                            `
                            : `
                                <span class="aura-followup-no-whatsapp">
                                    Sem WhatsApp
                                </span>
                            `
                    }

                    <button
                        type="button"
                        onclick="event.stopPropagation(); concluirFollowupLead('${escapar(lead.id)}')"
                        class="aura-followup-complete"
                    >
                        Concluir
                    </button>

                </div>

            </article>
        `;

    };

    const gruposHTML =
        grupos.map(grupo => {

            const leadsOrdenados =
                ordenar(grupo.leads);

            return `
                <section
                    class="aura-followup-group"
                    data-group="${grupo.id}"
                >

                    <header>

                        <div>

                            <span></span>

                            <div>
                                <strong>
                                    ${grupo.titulo}
                                </strong>

                                <small>
                                    ${grupo.descricao}
                                </small>
                            </div>

                        </div>

                        <b>
                            ${leadsOrdenados.length}
                        </b>

                    </header>

                    <div class="aura-followup-list">

                        ${
                            leadsOrdenados.length
                                ? leadsOrdenados
                                    .map(renderizarCard)
                                    .join("")
                                : `
                                    <div class="aura-followup-empty">
                                        Nenhum contato nesta etapa.
                                    </div>
                                `
                        }

                    </div>

                </section>
            `;

        }).join("");

    container.innerHTML = `

        <div class="aura-followup-summary-grid">

            <div data-state="all">
                <small>Total agendado</small>
                <strong>${totalAgendados}</strong>
                <span>Contatos futuros</span>
            </div>

            <div data-state="overdue">
                <small>Atrasados</small>
                <strong>${totalAtrasados}</strong>
                <span>Exigem atenção</span>
            </div>

            <div data-state="today">
                <small>Para hoje</small>
                <strong>${totalHoje}</strong>
                <span>Agenda do dia</span>
            </div>

            <div data-state="empty">
                <small>Sem agenda</small>
                <strong>${semAgendamento}</strong>
                <span>Leads sem próximo contato</span>
            </div>

        </div>

        <div class="aura-followup-groups">

            ${gruposHTML}

        </div>
    `;

}

window.renderizarAgendaLeads =
    renderizarAgendaLeads;

window.abrirLeadDaAgenda =
function(leadId) {

    const lead =
        window._leadsVisiveis
            ?.find(
                item =>
                    item.id === leadId
            );

    if (
        lead &&
        typeof window.abrirPainelLead ===
        "function"
    ) {
        window.abrirPainelLead(lead);
    }

};

window.abrirWhatsFollowup =
function(leadId) {

    const lead =
        window._leadsVisiveis
            ?.find(
                item =>
                    item.id === leadId
            );

    if (!lead) return;

    let numero =
        String(
            lead.whatsapp || ""
        ).replace(/\D/g, "");

    if (numero.length < 10) {
        return showToast(
            "Este lead não possui WhatsApp válido.",
            "error"
        );
    }

    if (!numero.startsWith("55")) {
        numero = `55${numero}`;
    }

    window.open(
        `https://wa.me/${numero}`,
        "_blank",
        "noopener,noreferrer"
    );

};

window.salvarFollowupLead =
async function() {
    if (!exigirEdicaoModulo("leads")) return;

    const leadId =
        document.getElementById(
            "lead-painel-id"
        )?.value;

    const data =
        document.getElementById(
            "lead-followup-data"
        )?.value;

    const hora =
        document.getElementById(
            "lead-followup-hora"
        )?.value || "09:00";

    const prioridade =
        document.getElementById(
            "lead-followup-prioridade"
        )?.value || "normal";

    const motivo =
        document.getElementById(
            "lead-followup-motivo"
        )?.value.trim() || "";

    if (!leadId) {
        return;
    }

    if (!data) {

        return showToast(
            "Escolha a data do próximo contato.",
            "error"
        );

    }

    const timestamp =
        new Date(
            `${data}T${hora}:00`
        ).getTime();

    if (
        !Number.isFinite(timestamp)
    ) {

        return showToast(
            "Data ou horário inválido.",
            "error"
        );

    }

    try {

        await setDoc(
            doc(
                db,
                "leads",
                leadId
            ),
            {
                proximoContatoEm:
                    timestamp,

                prioridadeLead:
                    prioridade,

                motivoFollowup:
                    motivo,

                followupAtualizadoEm:
                    Date.now()
            },
            {
                merge: true
            }
        );

        const lead =
            window._leadsVisiveis
                ?.find(
                    item =>
                        item.id === leadId
                );

        if (lead) {

            lead.proximoContatoEm =
                timestamp;

            lead.prioridadeLead =
                prioridade;

            lead.motivoFollowup =
                motivo;

        }

        const resumo =
            document.getElementById(
                "lead-followup-resumo"
            );

        const dataFormatada =
            new Date(timestamp);

        if (resumo) {

            resumo.textContent =
                `Agendado para ${
                    dataFormatada
                        .toLocaleDateString(
                            "pt-BR"
                        )
                } às ${
                    dataFormatada
                        .toLocaleTimeString(
                            "pt-BR",
                            {
                                hour: "2-digit",
                                minute: "2-digit"
                            }
                        )
                }`;

        }

        renderizarAgendaLeads();
        renderizarKanbanLeads();

        await registrarAtividadeLead(
            leadId,
            "followup",
            "Follow-up agendado",
            `${
                dataFormatada.toLocaleDateString(
                    "pt-BR"
                )
            } às ${
                dataFormatada.toLocaleTimeString(
                    "pt-BR",
                    {
                        hour: "2-digit",
                        minute: "2-digit"
                    }
                )
            } · Prioridade: ${
                prioridade
            }${
                motivo
                    ? ` · ${motivo}`
                    : ""
            }`
        );

        showToast(
            "Próximo contato agendado!"
        );

    } catch (erro) {

        console.error(erro);

        showToast(
            "Erro ao salvar o agendamento.",
            "error"
        );

    }

};

window.limparFollowupLead =
async function() {
    if (!exigirEdicaoModulo("leads")) return;

    const leadId =
        document.getElementById(
            "lead-painel-id"
        )?.value;

    if (!leadId) return;

    try {

        await setDoc(
            doc(
                db,
                "leads",
                leadId
            ),
            {
                proximoContatoEm:
                    null,

                motivoFollowup:
                    "",

                followupAtualizadoEm:
                    Date.now()
            },
            {
                merge: true
            }
        );

        const lead =
            window._leadsVisiveis
                ?.find(
                    item =>
                        item.id === leadId
                );

        if (lead) {

            lead.proximoContatoEm =
                null;

            lead.motivoFollowup =
                "";

        }

        const data =
            document.getElementById(
                "lead-followup-data"
            );

        const hora =
            document.getElementById(
                "lead-followup-hora"
            );

        const motivo =
            document.getElementById(
                "lead-followup-motivo"
            );

        const resumo =
            document.getElementById(
                "lead-followup-resumo"
            );

        if (data) data.value = "";
        if (hora) hora.value = "09:00";
        if (motivo) motivo.value = "";

        if (resumo) {
            resumo.textContent =
                "Nenhum contato agendado.";
        }

        renderizarAgendaLeads();

        showToast(
            "Agendamento removido."
        );

    } catch (erro) {

        console.error(erro);

        showToast(
            "Erro ao remover o agendamento.",
            "error"
        );

    }

};

window.concluirFollowupLead =
async function(leadId) {
    if (!exigirEdicaoModulo("leads")) return;

    const lead =
        window._leadsVisiveis
            ?.find(
                item =>
                    item.id === leadId
            );

    if (!lead) return;

    const agendamentoAnterior =
        lead.proximoContatoEm;

    lead.proximoContatoEm =
        null;

    renderizarAgendaLeads();

    try {

        await setDoc(
            doc(
                db,
                "leads",
                leadId
            ),
            {
                proximoContatoEm:
                    null,

                ultimoContatoEm:
                    Date.now(),

                followupConcluidoEm:
                    Date.now(),

                followupAtualizadoEm:
                    Date.now()
            },
            {
                merge: true
            }
        );

        await registrarAtividadeLead(
            leadId,
            "followup",
            "Follow-up concluído",
            "O contato comercial foi marcado como realizado."
        );

        showToast(
            "Follow-up concluído!"
        );

    } catch (erro) {

        console.error(erro);

        lead.proximoContatoEm =
            agendamentoAnterior;

        renderizarAgendaLeads();

        await registrarAtividadeLead(
            leadId,
            "followup",
            "Follow-up removido",
            "O próximo contato agendado foi cancelado."
        );

        showToast(
            "Agendamento removido."
        );

    }

};

window.moverLeadKanban =
async function(
    leadId,
    novoStatus
) {
    if (!exigirEdicaoModulo("leads")) return;

    const lead =
        window
            ._leadsVisiveis
            .find(
                item =>
                    item.id === leadId
            );

    if (!lead) return;

    const statusAnterior =
        lead.statusLead ||
        "novo";

    if (
        statusAnterior === novoStatus
    ) {
        return;
    }

    lead.statusLead =
        novoStatus;

    renderizarKanbanLeads();

    try {

        await setDoc(
            doc(
                db,
                "leads",
                leadId
            ),
            {
                statusLead: novoStatus,
                statusAtualizadoEm:
                    Date.now()
            },
            {
                merge: true
            }
        );

        const nomesStatus = {
            novo: "Novo",
            contato: "Em contato",
            convertido: "Convertido",
            perdido: "Perdido"
        };

        await registrarAtividadeLead(
            leadId,
            "kanban",
            "Lead movido no pipeline",
            `${
                nomesStatus[statusAnterior] ||
                statusAnterior
            } → ${
                nomesStatus[novoStatus] ||
                novoStatus
            }`
        );

        showToast(
            "Lead movido no pipeline!"
        );

        if (
            typeof window
                .aplicarFiltrosLeads ===
            "function"
        ) {
            window
                .aplicarFiltrosLeads(
                    false
                );
        }

    } catch (erro) {

        console.error(erro);

        lead.statusLead =
            statusAnterior;

        renderizarKanbanLeads();

        showToast(
            "Não foi possível mover o lead.",
            "error"
        );

    }

};

window.atualizarStatusLead =
async function(
    leadId,
    novoStatus
) {
    if (!exigirEdicaoModulo("leads")) return;

    try {

        await setDoc(
            doc(
                db,
                "leads",
                leadId
            ),
            {
                statusLead: novoStatus,
                statusAtualizadoEm:
                    Date.now()
            },
            {
                merge: true
            }
        );

        const leadLocal =
            window
                ._leadsVisiveis
                ?.find(
                    item =>
                        item.id === leadId
                );

        if (leadLocal) {
            leadLocal.statusLead =
                novoStatus;
        }

        renderizarKanbanLeads();

        const nomesStatus = {
            novo: "Novo",
            contato: "Em contato",
            convertido: "Convertido",
            perdido: "Perdido"
        };

        await registrarAtividadeLead(
            leadId,
            "status",
            "Status atualizado",
            nomesStatus[novoStatus] ||
            novoStatus
        );

        showToast(
            "Status atualizado!"
        );

        if (
            typeof window
                .aplicarFiltrosLeads ===
            "function"
        ) {
            window
                .aplicarFiltrosLeads(
                    false
                );
        }

    } catch (erro) {

        console.error(erro);

        showToast(
            "Erro ao atualizar o status.",
            "error"
        );

    }

};

setTimeout(() => {

    alternarVisualLeads(
        window._modoVisualLeads
    );

}, 100);

        // GESTÃO DO CATÁLOGO DE PRODUTOS
        function alternarVisualFiltro(botaoAtivo) {
            const botoesFiltro = {
                todos: document.getElementById("filtro-todos"),
                fisico: document.getElementById("filtro-fisicos"),
                digital: document.getElementById("filtro-digitais"),
                rascunhos: document.getElementById("filtro-rascunhos")
            };

            Object.entries(botoesFiltro).forEach(([nomeFiltro, botao]) => {
                if (!botao) {
                    return;
                }

                const estaAtivo = nomeFiltro === botaoAtivo;

                botao.classList.add("aura-product-filter");

                botao.classList.toggle("bg-white/5", estaAtivo);
                botao.classList.toggle("text-white", estaAtivo);
                botao.classList.toggle("border", estaAtivo);
                botao.classList.toggle("border-white/10", estaAtivo);

                botao.classList.toggle("text-gray-400", !estaAtivo);
                botao.classList.toggle("hover:text-white", !estaAtivo);
                botao.classList.toggle("border-transparent", !estaAtivo);
                botao.classList.toggle("bg-transparent", !estaAtivo);

                botao.setAttribute(
                    "aria-pressed",
                    estaAtivo ? "true" : "false"
                );
            });
        }

        document.getElementById("filtro-rascunhos").addEventListener("click", (e) => {

e.preventDefault();

verRascunhos = true;

alternarVisualFiltro('rascunhos');

carregarProdutos();

});

        document.getElementById("filtro-todos").addEventListener("click", (e) => {

e.preventDefault();

filtroLogistico = "todos";

verRascunhos = false;

alternarVisualFiltro('todos');

carregarProdutos();

});

        document.getElementById("filtro-fisicos").addEventListener("click", (e) => {
e.preventDefault();
filtroLogistico = "fisico";
verRascunhos = false;
alternarVisualFiltro('fisico');
carregarProdutos();

});

        document.getElementById("filtro-digitais").addEventListener("click", (e) => {
            e.preventDefault();
            filtroLogistico = "digital";
            verRascunhos = false;
            alternarVisualFiltro('digital');
            carregarProdutos();
        });


/* CENTRAL INTELIGENTE DE CATÁLOGO */
window._catalogoSelecionados = window._catalogoSelecionados || new Set();
window._catalogoSelecaoAtiva = false;
window._catalogoModoVisual = localStorage.getItem("catalogoModoVisual") || "grade";

function normalizarTextoCatalogo(valor) {
    return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function obterCardsCatalogo() {
    return [...document.querySelectorAll("#produtos-container .aura-commerce-card")];
}

function formatarMoedaCatalogo(valor) {
    return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

window.aplicarFerramentasCatalogo = function() {
    const container = document.getElementById("produtos-container");
    if (!container) return;
    const termo = normalizarTextoCatalogo(document.getElementById("catalogo-busca")?.value);
    const ordenacao = document.getElementById("catalogo-ordenacao")?.value || "recentes";
    const cards = obterCardsCatalogo();
    cards.forEach(card => {
        const conteudo = normalizarTextoCatalogo([card.dataset.nome, card.dataset.descricao, card.dataset.categoria, card.dataset.tipo].join(" "));
        card.classList.toggle("catalogo-filtrado-oculto", Boolean(termo) && !conteudo.includes(termo));
    });
    const compararTexto = (a,b) => String(a||"").localeCompare(String(b||""),"pt-BR",{sensitivity:"base"});
    cards.sort((a,b) => {
        if (ordenacao === "nome-asc") return compararTexto(a.dataset.nome,b.dataset.nome);
        if (ordenacao === "nome-desc") return compararTexto(b.dataset.nome,a.dataset.nome);
        if (ordenacao === "preco-desc") return Number(b.dataset.preco||0)-Number(a.dataset.preco||0);
        if (ordenacao === "preco-asc") return Number(a.dataset.preco||0)-Number(b.dataset.preco||0);
        if (ordenacao === "estoque-asc") {
            const ea=a.dataset.estoque===""?Number.MAX_SAFE_INTEGER:Number(a.dataset.estoque);
            const eb=b.dataset.estoque===""?Number.MAX_SAFE_INTEGER:Number(b.dataset.estoque);
            return ea-eb;
        }
        return Number(b.dataset.atualizado||0)-Number(a.dataset.atualizado||0);
    });
    cards.forEach(card => container.appendChild(card));
    window.atualizarResumoCatalogo();
};

window.atualizarResumoCatalogo = function() {
    const cards = obterCardsCatalogo().filter(card => !card.classList.contains("catalogo-filtrado-oculto"));
    const precos = cards.map(card => Number(card.dataset.preco||0)).filter(Number.isFinite);
    const precoMedio = precos.length ? precos.reduce((a,b)=>a+b,0)/precos.length : 0;
    const estoqueBaixo = cards.filter(card => card.dataset.estoque !== "" && Number.isFinite(Number(card.dataset.estoque)) && Number(card.dataset.estoque) <= 5).length;
    const comDesconto = cards.filter(card => Number(card.dataset.desconto||0)>0).length;
    const setText=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
    setText("catalogo-resumo-total",cards.length);
    setText("catalogo-resumo-preco",formatarMoedaCatalogo(precoMedio));
    setText("catalogo-resumo-estoque",estoqueBaixo);
    setText("catalogo-resumo-descontos",comDesconto);
    setText("catalogo-resultados-visiveis",cards.length===1?"1 produto visível":`${cards.length} produtos visíveis`);
    const busca=document.getElementById("catalogo-busca");
    document.getElementById("catalogo-limpar-busca")?.classList.toggle("is-visible",Boolean(busca?.value.trim()));
};

window.alternarVisualCatalogo = function(modo) {
    const final=modo==="lista"?"lista":"grade";
    window._catalogoModoVisual=final;
    localStorage.setItem("catalogoModoVisual",final);
    document.getElementById("produtos-container")?.classList.toggle("is-list-view",final==="lista");
    document.getElementById("catalogo-view-grid")?.classList.toggle("is-active",final==="grade");
    document.getElementById("catalogo-view-list")?.classList.toggle("is-active",final==="lista");
};

window.limparBuscaCatalogo = function() {
    const campo=document.getElementById("catalogo-busca");
    if(campo){campo.value="";campo.focus();}
    window.aplicarFerramentasCatalogo();
};

window.alternarSelecaoCatalogo = function() {
    window._catalogoSelecaoAtiva=!window._catalogoSelecaoAtiva;
    if(!window._catalogoSelecaoAtiva) window._catalogoSelecionados.clear();
    window.atualizarSelecaoCatalogo();
};

window.atualizarSelecaoCatalogo = function() {
    const container=document.getElementById("produtos-container");
    container?.classList.toggle("is-selection-mode",window._catalogoSelecaoAtiva);
    const toggle=document.getElementById("catalogo-selection-toggle");
    toggle?.classList.toggle("is-active",window._catalogoSelecaoAtiva);
    const texto=toggle?.querySelector("span");
    if(texto)texto.textContent=window._catalogoSelecaoAtiva?"Finalizar seleção":"Selecionar";
    obterCardsCatalogo().forEach(card=>{
        const selecionado=window._catalogoSelecionados.has(card.dataset.produtoId);
        card.classList.toggle("is-selected",selecionado);
        const checkbox=card.querySelector(".aura-catalog-card-checkbox");
        if(checkbox)checkbox.checked=selecionado;
    });
    const qtd=window._catalogoSelecionados.size;
    const contador=document.getElementById("catalogo-selecionados-count");
    if(contador)contador.textContent=qtd===1?"1 selecionado":`${qtd} selecionados`;
    const barra=document.getElementById("catalogo-bulk-bar");
    barra?.classList.toggle("hidden",!window._catalogoSelecaoAtiva);
    barra?.querySelectorAll(".aura-catalog-bulk-actions button:not(.aura-catalog-bulk-secondary):not(.aura-catalog-bulk-clear)").forEach(btn=>btn.disabled=qtd===0);
};

window.alternarProdutoSelecionado = function(id,selecionado) {
    selecionado?window._catalogoSelecionados.add(id):window._catalogoSelecionados.delete(id);
    window.atualizarSelecaoCatalogo();
};

window.selecionarProdutosVisiveis = function() {
    obterCardsCatalogo().filter(card=>!card.classList.contains("catalogo-filtrado-oculto")).forEach(card=>window._catalogoSelecionados.add(card.dataset.produtoId));
    window.atualizarSelecaoCatalogo();
};

window.limparSelecaoCatalogo = function() {
    window._catalogoSelecionados.clear();
    window.atualizarSelecaoCatalogo();
};

window.executarAcaoMassaCatalogo = async function(acao) {
    if (!exigirEdicaoModulo("produtos")) return;

    const ids=[...window._catalogoSelecionados];
    if(!ids.length){showToast("Selecione ao menos um produto.","error");return;}
    const cards=obterCardsCatalogo().filter(card=>window._catalogoSelecionados.has(card.dataset.produtoId));
    const executar=async()=>{
        if (!exigirEdicaoModulo("produtos")) return;

        try{
            if(acao==="publicar"){
                const qtd=cards.filter(card=>card.dataset.status==="rascunho").length;
                if(limiteProdutosGlobal!==-1&&totalProdutosAtual+qtd>limiteProdutosGlobal){showToast(`Seu plano permite até ${limiteProdutosGlobal} produtos ativos.`,"error");return;}
                await Promise.all(ids.map(id=>setDoc(doc(db,"produtos",id),{statusProduto:"ativo",atualizadoEm:new Date().toISOString()},{merge:true})));
                showToast(`${ids.length} produto(s) publicado(s)!`);
            }
            if(acao==="rascunho"){
                const qtd=cards.filter(card=>card.dataset.status!=="rascunho").length;
                if(limiteRascunhosGlobal!==-1&&totalRascunhosAtual+qtd>limiteRascunhosGlobal){showToast(`Seu plano permite até ${limiteRascunhosGlobal} rascunhos.`,"error");return;}
                await Promise.all(ids.map(id=>setDoc(doc(db,"produtos",id),{statusProduto:"rascunho",atualizadoEm:new Date().toISOString()},{merge:true})));
                showToast(`${ids.length} produto(s) movido(s) para rascunhos.`);
            }
            if(acao==="excluir"){
                await Promise.all(ids.map(id=>deleteDoc(doc(db,"produtos",id))));
                showToast(`${ids.length} produto(s) excluído(s).`);
            }
            window._catalogoSelecionados.clear();
            await carregarProdutos();
            window.atualizarSelecaoCatalogo();
        }catch(erro){console.error("Erro na ação em massa:",erro);showToast("Não foi possível concluir a ação.","error");}
    };
    if(acao==="excluir"){abrirConfirmacao(`Excluir permanentemente ${ids.length} produto(s)? Essa ação não pode ser desfeita.`,executar);return;}
    await executar();
};

window.sincronizarCatalogoAvancado = function() {
    window.alternarVisualCatalogo(window._catalogoModoVisual);
    window.atualizarSelecaoCatalogo();
    window.aplicarFerramentasCatalogo();
};

(function iniciarCatalogoAvancado(){
    const iniciar=()=>{
        const busca=document.getElementById("catalogo-busca");
        const ordem=document.getElementById("catalogo-ordenacao");
        let timer=null;
        busca?.addEventListener("input",()=>{clearTimeout(timer);timer=setTimeout(()=>window.aplicarFerramentasCatalogo(),90);});
        ordem?.addEventListener("change",()=>window.aplicarFerramentasCatalogo());
        window.alternarVisualCatalogo(window._catalogoModoVisual);
        window.atualizarSelecaoCatalogo();
    };
    if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",iniciar,{once:true});else iniciar();
})();

        async function carregarProdutos() {
            try {
                // Esqueleto enquanto o catálogo carrega (some assim que os
                // produtos reais chegam logo abaixo).
                if (produtosContainer) {
                    produtosContainer.innerHTML = Array.from({ length: 8 }).map(() => `
                        <div class="aura-skel-card">
                            <span class="aura-skel aura-skel-card-img"></span>
                            <span class="aura-skel aura-skel-line" style="width:75%"></span>
                            <span class="aura-skel aura-skel-line" style="width:45%"></span>
                        </div>
                    `).join("");
                }

                const q = query(
                    collection(db, "produtos"),
                    where("criadoPor", "==", usuarioUID)
                );

                const querySnapshot = await getDocs(q);

                produtosContainer.innerHTML = "";

                totalProdutosAtual = 0;
                totalRascunhosAtual = 0;

                let produtosFiltrados = [];

                querySnapshot.forEach(docSnap => {
                    const data = docSnap.data();

                    data.id = docSnap.id;

                    const ehRascunho =
                        data.statusProduto === "rascunho";

                    if (ehRascunho) {
                        totalRascunhosAtual++;
                    } else {
                        totalProdutosAtual++;
                    }

                    const statusBate =
                        verRascunhos
                            ? ehRascunho
                            : !ehRascunho;

                    const tipoBate =
                        filtroLogistico === "todos" ||
                        data.tipo === filtroLogistico;

                    if (statusBate && tipoBate) {
                        produtosFiltrados.push(data);
                    }
                });

document
    .getElementById("contador-produtos")
    .innerText = verRascunhos
        ? `${produtosFiltrados.length} Rascunho(s)`
        : `${produtosFiltrados.length} Ativo(s)`;

if (
    typeof renderizarCentralImplantacao ===
    "function"
) {
    renderizarCentralImplantacao();
}
                if (produtosFiltrados.length === 0) {
                    const tituloVazio = verRascunhos
                        ? "Nenhum rascunho encontrado"
                        : "Seu catálogo está vazio";

                    const textoVazio = verRascunhos
                        ? "Produtos salvos como rascunho aparecerão aqui."
                        : "Cadastre seu primeiro produto para começar a montar sua operação.";

                    produtosContainer.innerHTML = `
                        <div class="aura-products-empty col-span-full">

                            <div class="aura-products-empty-glow"></div>

                            <div class="aura-products-empty-icon">

                                <svg viewBox="0 0 24 24"
                                     fill="none"
                                     stroke="currentColor">

                                    <path d="m4 7 8-4 8 4-8 4-8-4Z"></path>

                                    <path d="m4 7 8 4 8-4v10l-8 4-8-4V7Z"></path>

                                    <path d="M12 11v10"></path>

                                </svg>

                            </div>

                            <p class="aura-products-empty-eyebrow">
                                Catálogo
                            </p>

                            <h4 class="aura-products-empty-title">
                                ${tituloVazio}
                            </h4>

                            <p class="aura-products-empty-description">
                                ${textoVazio}
                            </p>

                            <button type="button"
                                    class="aura-products-empty-action"
                                    onclick="document.getElementById('btn-abrir-criacao').click()">

                                <svg viewBox="0 0 24 24"
                                     fill="none"
                                     stroke="currentColor">

                                    <path d="M12 5v14M5 12h14"></path>

                                </svg>

                                <span>Adicionar produto</span>

                            </button>

                        </div>
                    `;

                    window._catalogoSelecionados.clear();
                    window.atualizarResumoCatalogo();
                    window.atualizarSelecaoCatalogo();

                    return;
                }

                produtosFiltrados.forEach((prod, indiceProduto) => {
                    const precoNumerico =
                        Number.parseFloat(prod.preco);

                    const precoFormatado =
                        Number.isFinite(precoNumerico)
                            ? precoNumerico.toLocaleString(
                                "pt-BR",
                                {
                                    style: "currency",
                                    currency: "BRL"
                                }
                            )
                            : "Preço não definido";

                    const precoDeNumerico =
                        Number.parseFloat(prod.precoDe);

                    const possuiPrecoDe =
                        Number.isFinite(precoDeNumerico) &&
                        Number.isFinite(precoNumerico) &&
                        precoDeNumerico > precoNumerico;

                    const precoDeFormatado =
                        possuiPrecoDe
                            ? precoDeNumerico.toLocaleString(
                                "pt-BR",
                                {
                                    style: "currency",
                                    currency: "BRL"
                                }
                            )
                            : "";

                    const descontoPercentual =
                        possuiPrecoDe
                            ? Math.round(
                                (
                                    (
                                        precoDeNumerico -
                                        precoNumerico
                                    ) /
                                    precoDeNumerico
                                ) * 100
                            )
                            : 0;

                    const imagemSrc =
                        prod.imagemB64 ||
                        "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='900' height='700' viewBox='0 0 900 700'><rect width='900' height='700' fill='%2309090f'/><path d='M360 285h180v130H360z' fill='none' stroke='%236b7280' stroke-width='12'/><circle cx='420' cy='335' r='24' fill='%236b7280'/><path d='m370 400 55-55 40 40 35-35 40 50' fill='none' stroke='%236b7280' stroke-width='12'/></svg>";

                    const ehDigital =
                        prod.tipo === "digital";

                    const ehRascunho =
                        prod.statusProduto === "rascunho";

                    const possuiEstoque =
                        prod.estoque !== "" &&
                        prod.estoque !== undefined &&
                        prod.estoque !== null;

                    const estoqueNumerico =
                        possuiEstoque
                            ? Number(prod.estoque)
                            : null;

                    const estoqueBaixo =
                        Number.isFinite(estoqueNumerico) &&
                        estoqueNumerico <= 5;

                    const possuiAvaliacao =
                        prod.avaliacao !== "" &&
                        prod.avaliacao !== undefined &&
                        prod.avaliacao !== null;

                    const statusClasse =
                        ehRascunho
                            ? "aura-commerce-status-draft"
                            : "aura-commerce-status-online";

                    const statusTexto =
                        ehRascunho
                            ? "Rascunho"
                            : "Publicado";

                    const tipoTexto =
                        ehDigital
                            ? "Produto digital"
                            : "Produto físico";

                    const tipoIcone =
                        ehDigital
                            ? `
                                <svg viewBox="0 0 24 24"
                                     fill="none"
                                     stroke="currentColor">

                                    <rect x="3"
                                          y="4"
                                          width="18"
                                          height="14"
                                          rx="2">
                                    </rect>

                                    <path d="M8 21h8M12 18v3"></path>

                                </svg>
                            `
                            : `
                                <svg viewBox="0 0 24 24"
                                     fill="none"
                                     stroke="currentColor">

                                    <path d="m4 7 8-4 8 4-8 4-8-4Z"></path>

                                    <path d="m4 7 8 4 8-4v10l-8 4-8-4V7Z"></path>

                                    <path d="M12 11v10"></path>

                                </svg>
                            `;

                    const card =
                        document.createElement("article");

                    card.className =
                        "aura-commerce-card";

                    card.dataset.produtoId = prod.id;
                    card.dataset.nome = prod.nome || "";
                    card.dataset.descricao = prod.descricao || "";
                    card.dataset.categoria = prod.subnicho || "Geral";
                    card.dataset.tipo = prod.tipo || "";
                    card.dataset.status = ehRascunho ? "rascunho" : "ativo";
                    card.dataset.preco = Number.isFinite(precoNumerico) ? String(precoNumerico) : "0";
                    card.dataset.desconto = String(descontoPercentual);
                    card.dataset.estoque = Number.isFinite(estoqueNumerico) ? String(estoqueNumerico) : "";
                    const atualizadoEmCatalogo = prod.atualizadoEm?.toMillis?.() || new Date(prod.atualizadoEm || prod.criadoEm || 0).getTime();
                    card.dataset.atualizado = Number.isFinite(atualizadoEmCatalogo) ? String(atualizadoEmCatalogo) : "0";

                    card.style.setProperty(
                        "--product-delay",
                        `${Math.min(indiceProduto * 55, 330)}ms`
                    );

                    card.innerHTML = `
                        <div class="aura-commerce-media">

                            <img src="${imagemSrc}"
                                 alt=""
                                 loading="lazy"
                                 class="aura-commerce-image">

                            <div class="aura-commerce-media-overlay"></div>

                            <div class="aura-commerce-topbar">

                                <span class="aura-commerce-status ${statusClasse}">

                                    <span class="aura-commerce-status-dot"></span>

                                    ${statusTexto}

                                </span>

                                <button type="button"
                                        class="aura-commerce-edit-button btn-gerenciar"
                                        data-id="${prod.id}"
                                        aria-label="Gerenciar ${prod.nome || "produto"}"
                                        title="Gerenciar produto">

                                    <svg viewBox="0 0 24 24"
                                         fill="none"
                                         stroke="currentColor">

                                        <path d="M12 20h9"></path>

                                        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z"></path>

                                    </svg>

                                </button>

                            </div>

                            <div class="aura-commerce-media-bottom">

                                <span class="aura-commerce-type">

                                    ${tipoIcone}

                                    ${tipoTexto}

                                </span>

                                ${
                                    descontoPercentual > 0
                                        ? `
                                            <span class="aura-commerce-discount">
                                                −${descontoPercentual}%
                                            </span>
                                        `
                                        : ""
                                }

                            </div>

                        </div>

                        <div class="aura-commerce-content">

                            <div class="aura-commerce-category-row">

                                <span class="aura-commerce-category">
                                    ${prod.subnicho || "Geral"}
                                </span>

                                ${
                                    prod.freteGratis
                                        ? `
                                            <span class="aura-commerce-free-shipping">
                                                Frete grátis
                                            </span>
                                        `
                                        : ""
                                }

                            </div>

                            <div class="aura-commerce-copy">

                                <h4 class="aura-commerce-title">
                                    ${prod.nome || "Produto sem nome"}
                                </h4>

                                <p class="aura-commerce-description">
                                    ${prod.descricao || "Nenhuma descrição adicionada a este produto."}
                                </p>

                            </div>

                            <div class="aura-commerce-information">

                                ${
                                    possuiAvaliacao
                                        ? `
                                            <div class="aura-commerce-info-item">

                                                <span class="aura-commerce-info-icon aura-commerce-info-rating">

                                                    <svg viewBox="0 0 24 24"
                                                         fill="none"
                                                         stroke="currentColor">

                                                        <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"></path>

                                                    </svg>

                                                </span>

                                                <span>

                                                    <small>Avaliação</small>

                                                    <strong>${prod.avaliacao}</strong>

                                                </span>

                                            </div>
                                        `
                                        : ""
                                }

                                ${
                                    possuiEstoque
                                        ? `
                                            <div class="aura-commerce-info-item ${estoqueBaixo ? "aura-commerce-stock-low" : ""}">

                                                <span class="aura-commerce-info-icon">

                                                    <svg viewBox="0 0 24 24"
                                                         fill="none"
                                                         stroke="currentColor">

                                                        <path d="m4 7 8-4 8 4-8 4-8-4Z"></path>

                                                        <path d="m4 7 8 4 8-4v10l-8 4-8-4V7Z"></path>

                                                    </svg>

                                                </span>

                                                <span>

                                                    <small>Estoque</small>

                                                    <strong>
                                                        ${prod.estoque} un.
                                                    </strong>

                                                </span>

                                            </div>
                                        `
                                        : ""
                                }

                                ${
                                    !possuiAvaliacao &&
                                    !possuiEstoque
                                        ? `
                                            <div class="aura-commerce-info-empty">

                                                <svg viewBox="0 0 24 24"
                                                     fill="none"
                                                     stroke="currentColor">

                                                    <path d="M5 12h14"></path>

                                                </svg>

                                                Sem informações adicionais

                                            </div>
                                        `
                                        : ""
                                }

                            </div>

                            <div class="aura-commerce-footer">

                                <div class="aura-commerce-price">

                                    ${
                                        possuiPrecoDe
                                            ? `
                                                <small>
                                                    ${precoDeFormatado}
                                                </small>
                                            `
                                            : `
                                                <small>
                                                    Preço atual
                                                </small>
                                            `
                                    }

                                    <strong>
                                        ${precoFormatado}
                                    </strong>

                                </div>

                                <button type="button"
                                        class="aura-commerce-manage btn-gerenciar"
                                        data-id="${prod.id}">

                                    <span>Gerenciar</span>

                                    <svg viewBox="0 0 24 24"
                                         fill="none"
                                         stroke="currentColor">

                                        <path d="M5 12h14"></path>

                                        <path d="m14 7 5 5-5 5"></path>

                                    </svg>

                                </button>

                            </div>

                        </div>
                    `;


const seletorCatalogo = document.createElement("label");
seletorCatalogo.className = "aura-catalog-card-selector";
seletorCatalogo.innerHTML = `
    <input type="checkbox" class="aura-catalog-card-checkbox" aria-label="Selecionar ${prod.nome || "produto"}">
    <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m7 12 3 3 7-7"></path></svg></span>
`;
seletorCatalogo.addEventListener("click", evento => evento.stopPropagation());
const checkboxCatalogo = seletorCatalogo.querySelector("input");
checkboxCatalogo?.addEventListener("change", () => window.alternarProdutoSelecionado(prod.id, checkboxCatalogo.checked));
card.prepend(seletorCatalogo);

produtosContainer.appendChild(card);
                });

                document
                    .querySelectorAll(".btn-gerenciar")
                    .forEach(btn => {
                        btn.addEventListener("click", event => {
                            const botao =
                                event.currentTarget;

                            abrirModalEdicao(
                                botao.getAttribute("data-id")
                            );
                        });
                    });

                window.sincronizarCatalogoAvancado();

            } catch (err) {
                console.error(err);

                produtosContainer.innerHTML = `
                    <div class="aura-products-error col-span-full">

                        <div class="aura-products-error-icon">

                            <svg viewBox="0 0 24 24"
                                 fill="none"
                                 stroke="currentColor">

                                <path d="M12 8v5"></path>

                                <path d="M12 17h.01"></path>

                                <path d="M10.3 3.9 2.7 17a2 2 0 0 0 1.73 3h15.14a2 2 0 0 0 1.73-3L13.7 3.9a2 2 0 0 0-3.4 0Z"></path>

                            </svg>

                        </div>

                        <div>

                            <h4>Não foi possível carregar os produtos</h4>

                            <p>Recarregue a página e tente novamente.</p>

                        </div>

                    </div>
                `;
            }
        }

        document.getElementById("btn-abrir-criacao").addEventListener("click", () => {
            form.reset();
            document.getElementById("form-id-produto").value = "";
            inputImagemBase64.value = "";
            document.getElementById("prod-rascunho").checked = verRascunhos;
            alternarDestino("checkout");
            modalTitulo.innerText = "Criar Novo Produto";
            btnDeletar.classList.add("hidden");
            modal.classList.remove("hidden");
        });

        async function abrirModalEdicao(id) {
            try {
                const docSnap = await getDoc(doc(db, "produtos", id));
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    document.getElementById("form-id-produto").value = id;
                    document.getElementById("prod-nome").value = data.nome;
                    document.getElementById("prod-preco").value = data.preco;
                    document.getElementById("prod-preco-de").value = data.precoDe || "";
                    document.getElementById("prod-vagas-tag").value = data.vagasTag || "";
                    document.getElementById("prod-badge-custom").value = data.badgeCustom || "";
                    document.getElementById("prod-tipo").value = data.tipo || "fisico";
                    document.getElementById("prod-subnicho").value = data.subnicho || "Outro";
                    document.getElementById("prod-descricao").value = data.descricao || "";
                    document.getElementById("prod-avaliacao").value = data.avaliacao || "";
                    document.getElementById("prod-garantia").value = data.garantiaDias || "";
                    document.getElementById("prod-estoque").value = data.estoque || "";
                    document.getElementById("prod-video-url").value = data.videoUrl || "";
                    document.getElementById("prod-selo-confianca").value = data.seloConfianca || "";
                    document.getElementById("prod-frete-gratis").checked = data.freteGratis || false;
                    const elCarrinho = document.getElementById("prod-carrinho-permitido");
                    if (elCarrinho) elCarrinho.checked = data.carrinhoPermitido || false;
                    document.getElementById("prod-cupom-ativo").checked = data.cupomAtivo || false;
                    document.getElementById("prod-cupom-codigo").value = data.cupomCodigo || "";
                    document.getElementById("prod-cupom-desconto").value = data.cupomDesconto || "";
                    document.getElementById("prod-cupom-validade").value = data.cupomValidade || "";
                    document.getElementById("prod-rascunho").checked = data.statusProduto === "rascunho";
                    inputImagemBase64.value = data.imagemB64 || "";

                    if(data.tipoDestino === "whatsapp") {
                        alternarDestino("whatsapp");
                        inputWhatsapp.value = data.destinoValue;
                    } else {
                        alternarDestino("checkout");
                        inputCheckout.value = data.destinoValue;
                    }
                    modalTitulo.innerText = "Gerenciar Oferta Ativa";
                    btnDeletar.classList.remove("hidden");
                    modal.classList.remove("hidden");
                }
            } catch (err) {
                console.error(err);
            }
        }

        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!exigirEdicaoModulo("produtos")) return;

            const id = document.getElementById("form-id-produto").value;
            const salvarComoRascunho = document.getElementById("prod-rascunho").checked;

            if (!id) {
                // Só checa limite pra produto NOVO — edição de um já existente não conta de novo
                if (salvarComoRascunho) {
                    if (limiteRascunhosGlobal !== -1 && totalRascunhosAtual >= limiteRascunhosGlobal) {
                        showToast(`Limite de ${limiteRascunhosGlobal} rascunhos do seu plano atingido.`, "error");
                        return;
                    }
                } else {
                    if (limiteProdutosGlobal !== -1 && totalProdutosAtual >= limiteProdutosGlobal) {
                        showToast(`Limite de ${limiteProdutosGlobal} produtos ativos do seu plano atingido. Faça upgrade ou salve como rascunho.`, "error");
                        return;
                    }
                }
            }
            const destinoFinalValue = (tipoDestino === "whatsapp") ? inputWhatsapp.value.trim() : inputCheckout.value.trim();

            const produtoPayload = {
                nome: document.getElementById("prod-nome").value.trim(),
                preco: parseFloat(document.getElementById("prod-preco").value),
                statusProduto: salvarComoRascunho ? "rascunho" : "ativo",
                precoDe: document.getElementById("prod-preco-de").value ? parseFloat(document.getElementById("prod-preco-de").value) : "",
                vagasTag: document.getElementById("prod-vagas-tag").value.trim(),
                badgeCustom: document.getElementById("prod-badge-custom").value.trim(),
                avaliacao: document.getElementById("prod-avaliacao").value ? parseFloat(document.getElementById("prod-avaliacao").value) : "",
                garantiaDias: document.getElementById("prod-garantia").value ? parseInt(document.getElementById("prod-garantia").value) : "",
                estoque: document.getElementById("prod-estoque").value ? parseInt(document.getElementById("prod-estoque").value) : "",
                videoUrl: document.getElementById("prod-video-url").value.trim(),
                seloConfianca: document.getElementById("prod-selo-confianca").value.trim(),
                freteGratis: document.getElementById("prod-frete-gratis").checked,
                carrinhoPermitido: document.getElementById("prod-carrinho-permitido") ? document.getElementById("prod-carrinho-permitido").checked : false,
                cupomAtivo: document.getElementById("prod-cupom-ativo").checked,
                cupomCodigo: document.getElementById("prod-cupom-codigo").value.trim(),
                cupomDesconto: document.getElementById("prod-cupom-desconto").value ? parseFloat(document.getElementById("prod-cupom-desconto").value) : "",
                cupomValidade: document.getElementById("prod-cupom-validade").value,
                tipo: document.getElementById("prod-tipo").value,
                subnicho: document.getElementById("prod-subnicho").value,
                imagemB64: inputImagemBase64.value,
                tipoDestino: tipoDestino,
                destinoValue: destinoFinalValue,
                descricao: document.getElementById("prod-descricao").value.trim(),
                criadoPor: usuarioUID,
                atualizadoEm: new Date().toISOString()
            };

            try {
                const docId = id || `prod_${Date.now()}`;
                await setDoc(doc(db, "produtos", docId), produtoPayload, { merge: true });
                modal.classList.add("hidden");
                carregarProdutos();
                showToast(id ? "Produto atualizado!" : (salvarComoRascunho ? "Rascunho salvo!" : "Produto publicado com sucesso!"));
            } catch (err) {
                console.error(err);
                showToast("Erro ao salvar produto.", "error");
            }
        });

        btnDeletar.addEventListener("click", () => {
    if (!exigirEdicaoModulo("produtos")) return;

    const id = document.getElementById("form-id-produto").value;
    if (id) {
        // Usa o seu modal bonito em vez do padrão do Google
        abrirConfirmacao("Tem certeza que deseja remover permanentemente este produto?", async () => {
            if (!exigirEdicaoModulo("produtos")) return;

            try {
                await deleteDoc(doc(db, "produtos", id));
                modal.classList.add("hidden");
                carregarProdutos();
                showToast("Produto excluído com sucesso.");
            } catch(err) {
                console.error(err);
                showToast("Erro ao excluir.", "error");
            }
        });
    }
});

// --- INICIALIZAR GRÁFICO AURA ANALYTICS ---
        function inicializarGrafico() {
            const canvas = document.getElementById("graficoVendas");

            if (!canvas || typeof Chart === "undefined") {
                return;
            }

            if (window.meuGrafico) {
                window.meuGrafico.destroy();
            }

            const estilosDocumento = getComputedStyle(document.documentElement);

            const corPrimaria =
                estilosDocumento.getPropertyValue("--sys-primaria").trim() ||
                "#5B3DF5";

            const corDestaque =
                estilosDocumento.getPropertyValue("--sys-destaque").trim() ||
                "#FF7A45";

            const temaClaro =
                document.body.classList.contains("tema-claro");

            const corTextoSecundario =
                temaClaro
                    ? "rgba(15, 23, 42, 0.48)"
                    : "rgba(255, 255, 255, 0.42)";

            const corGrade =
                temaClaro
                    ? "rgba(15, 23, 42, 0.055)"
                    : "rgba(255, 255, 255, 0.045)";

            const contexto = canvas.getContext("2d");

            const gradienteArea =
                contexto.createLinearGradient(
                    0,
                    0,
                    0,
                    canvas.parentElement?.clientHeight || 320
                );

            gradienteArea.addColorStop(
                0,
                converterHexParaRgba(corPrimaria, 0.34)
            );

            gradienteArea.addColorStop(
                0.55,
                converterHexParaRgba(corDestaque, 0.10)
            );

            gradienteArea.addColorStop(
                1,
                converterHexParaRgba(corPrimaria, 0)
            );

            const gradienteLinha =
                contexto.createLinearGradient(
                    0,
                    0,
                    canvas.parentElement?.clientWidth || 900,
                    0
                );

            gradienteLinha.addColorStop(0, corPrimaria);
            gradienteLinha.addColorStop(1, corDestaque);

            window.meuGrafico = new Chart(contexto, {
                type: "line",

                data: {
labels:
    window._dashboardChartLabels ||
    ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"],

                    datasets: [{
                        label: "Receita de pedidos pagos",

                        data:
    window._dashboardChartValores ||
    [0, 0, 0, 0, 0, 0, 0],

                        borderColor: gradienteLinha,
                        backgroundColor: gradienteArea,

                        borderWidth: 2.4,
                        fill: true,
                        tension: 0.42,

                        pointRadius: 0,
                        pointHoverRadius: 6,
                        pointHitRadius: 22,

                        pointBackgroundColor: corDestaque,
                        pointBorderColor:
                            temaClaro ? "#FFFFFF" : "#14132B",

                        pointBorderWidth: 3
                    }]
                },

                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        intersect: false,
                        mode: "index"
                    },

                    animation: {
                        duration: 950,
                        easing: "easeOutQuart"
                    },

                    layout: {
                        padding: {
                            top: 16,
                            right: 12,
                            bottom: 2,
                            left: 4
                        }
                    },

                    plugins: {
                        legend: {
                            display: false
                        },

                        tooltip: {
                            enabled: true,
                            displayColors: false,

                            backgroundColor:
                                temaClaro
                                    ? "rgba(255,255,255,.96)"
                                    : "rgba(15,13,36,.96)",

                            titleColor:
                                temaClaro
                                    ? "#0F172A"
                                    : "#FFFFFF",

                            bodyColor:
                                temaClaro
                                    ? "#475569"
                                    : "#B4B3C7",

                            borderColor:
                                converterHexParaRgba(corPrimaria, 0.28),

                            borderWidth: 1,
                            padding: 13,
                            cornerRadius: 12,

                            titleFont: {
                                family: "Sora",
                                size: 11,
                                weight: "700"
                            },

                            bodyFont: {
                                family: "Inter",
                                size: 11,
                                weight: "600"
                            },

                            callbacks: {
                                title: function(itens) {
                                    return itens[0]?.label || "";
                                },

                                label: function(contextoTooltip) {
                                    const valor =
                                        Number(
                                            contextoTooltip.parsed.y || 0
                                        );

                                    return valor.toLocaleString(
                                        "pt-BR",
                                        {
                                            style: "currency",
                                            currency: "BRL"
                                        }
                                    );
                                },

                                afterLabel: function() {
    return "Receita confirmada";
}
                            }
                        }
                    },

                    scales: {
                        x: {
                            border: {
                                display: false
                            },

                            grid: {
                                display: false
                            },

                            ticks: {
                                color: corTextoSecundario,

                                padding: 12,

                                font: {
                                    size: 10,
                                    family: "Inter",
                                    weight: "600"
                                }
                            }
                        },

                        y: {
                            beginAtZero: true,

                            border: {
                                display: false
                            },

                            grid: {
                                color: corGrade,
                                drawTicks: false
                            },

                            ticks: {
                                color: corTextoSecundario,

                                padding: 12,

                                maxTicksLimit: 5,

                                font: {
                                    size: 10,
                                    family: "Inter",
                                    weight: "600"
                                },

                                callback: function(valor) {
                                    if (valor >= 1000) {
                                        return "R$ " +
                                            (valor / 1000)
                                                .toFixed(1)
                                                .replace(".", ",") +
                                            "k";
                                    }

                                    return "R$ " + valor;
                                }
                            }
                        }
                    }
                }
            });
        }

        function converterHexParaRgba(cor, opacidade) {
            if (!cor) {
                return `rgba(91, 61, 245, ${opacidade})`;
            }

            if (cor.startsWith("rgb")) {
                const valores =
                    cor.match(/\d+(\.\d+)?/g);

                if (!valores || valores.length < 3) {
                    return cor;
                }

                return `rgba(${valores[0]}, ${valores[1]}, ${valores[2]}, ${opacidade})`;
            }

            let hexadecimal =
                cor.replace("#", "").trim();

            if (hexadecimal.length === 3) {
                hexadecimal =
                    hexadecimal
                        .split("")
                        .map(function(caractere) {
                            return caractere + caractere;
                        })
                        .join("");
            }

            if (hexadecimal.length !== 6) {
                return cor;
            }

            const vermelho =
                parseInt(hexadecimal.substring(0, 2), 16);

            const verde =
                parseInt(hexadecimal.substring(2, 4), 16);

            const azul =
                parseInt(hexadecimal.substring(4, 6), 16);

            return `rgba(${vermelho}, ${verde}, ${azul}, ${opacidade})`;
        }

        async function carregarCockpitReal() {

    if (!usuarioUID) {
        return;
    }

    const pegarElemento = id =>
        document.getElementById(id);

    const formatarMoeda = valor =>
        Number(valor || 0).toLocaleString(
            "pt-BR",
            {
                style: "currency",
                currency: "BRL"
            }
        );

    const obterTimestamp = valor => {

        if (valor?.toMillis) {
            return valor.toMillis();
        }

        const numero = Number(valor || 0);

        return Number.isFinite(numero)
            ? numero
            : 0;

    };

    try {
        const podeVerPedidos = VideHubContext.canView("pedidos");
        const podeVerLeads = VideHubContext.canView("leads");

        const resultados =
            await Promise.allSettled([

                podeVerPedidos
                    ? getDocs(
                        query(
                            collection(db, "pedidos"),
                            where("criadoPor", "==", usuarioUID)
                        )
                    )
                    : Promise.resolve(null),

                podeVerLeads
                    ? getDocs(
                        query(
                            collection(db, "leads"),
                            where("criadoPor", "==", usuarioUID)
                        )
                    )
                    : Promise.resolve(null)

            ]);

        const pedidos = [];
        const leads = [];

        if (podeVerPedidos && resultados[0].status === "fulfilled" && resultados[0].value) {

            resultados[0].value.forEach(
                documento => {

                    pedidos.push({
                        id: documento.id,
                        ...documento.data()
                    });

                }
            );

        }

        if (podeVerLeads && resultados[1].status === "fulfilled" && resultados[1].value) {

            resultados[1].value.forEach(
                documento => {

                    leads.push({
                        id: documento.id,
                        ...documento.data()
                    });

                }
            );

        }

        const pedidosPagos =
            pedidos.filter(
                pedido =>
                    pedido.status === "pago"
            );

        const receitaTotal =
            pedidosPagos.reduce(
                (total, pedido) =>
                    total +
                    Number(pedido.valor || 0),
                0
            );

        const inicioHoje =
            new Date();

        inicioHoje.setHours(0, 0, 0, 0);

        const receitaHoje =
            pedidosPagos
                .filter(
                    pedido =>
                        obterTimestamp(pedido.data) >=
                        inicioHoje.getTime()
                )
                .reduce(
                    (total, pedido) =>
                        total +
                        Number(pedido.valor || 0),
                    0
                );

        const dias = [];

        for (let indice = 6; indice >= 0; indice--) {

            const inicio =
                new Date();

            inicio.setHours(0, 0, 0, 0);
            inicio.setDate(
                inicio.getDate() - indice
            );

            const fim =
                new Date(inicio);

            fim.setHours(23, 59, 59, 999);

            let nome =
                inicio.toLocaleDateString(
                    "pt-BR",
                    {
                        weekday: "short"
                    }
                );

            nome =
                nome
                    .replace(".", "")
                    .replace(
                        /^./,
                        letra =>
                            letra.toUpperCase()
                    );

            dias.push({
                inicio: inicio.getTime(),
                fim: fim.getTime(),
                nome
            });

        }

        const valores =
            dias.map(dia => {

                return pedidosPagos
                    .filter(pedido => {

                        const dataPedido =
                            obterTimestamp(
                                pedido.data
                            );

                        return (
                            dataPedido >= dia.inicio &&
                            dataPedido <= dia.fim
                        );

                    })
                    .reduce(
                        (total, pedido) =>
                            total +
                            Number(pedido.valor || 0),
                        0
                    );

            });

        window._dashboardChartLabels =
            dias.map(dia => dia.nome);

        window._dashboardChartValores =
            valores;

        const receitaPeriodo =
            valores.reduce(
                (total, valor) =>
                    total + valor,
                0
            );

        const pedidosPeriodo =
            pedidosPagos.filter(pedido => {

                const dataPedido =
                    obterTimestamp(pedido.data);

                return (
                    dataPedido >= dias[0].inicio &&
                    dataPedido <= dias[6].fim
                );

            }).length;

        const maiorResultado =
            Math.max(0, ...valores);

        const indiceMaior =
            valores.indexOf(maiorResultado);

        const mediaDiaria =
            receitaPeriodo / 7;

        const totalLeads =
            leads.length;

        const convertidos =
            leads.filter(
                lead =>
                    lead.statusLead ===
                    "convertido"
            ).length;

        const conversao =
            totalLeads > 0
                ? Math.round(
                    convertidos /
                    totalLeads *
                    100
                )
                : 0;

        const primeiraMetade =
            valores
                .slice(0, 3)
                .reduce(
                    (total, valor) =>
                        total + valor,
                    0
                );

        const segundaMetade =
            valores
                .slice(4, 7)
                .reduce(
                    (total, valor) =>
                        total + valor,
                    0
                );

        let tendencia = "Estável";
        let tendenciaNota = "Sem variação relevante";
        let tendenciaCor = "";

        if (
            primeiraMetade === 0 &&
            segundaMetade === 0
        ) {

            tendencia = "Sem dados";
            tendenciaNota =
                "Nenhum pedido pago no período";

        } else if (
            segundaMetade >
            primeiraMetade
        ) {

            const crescimento =
                primeiraMetade > 0
                    ? Math.round(
                        (
                            segundaMetade -
                            primeiraMetade
                        ) /
                        primeiraMetade *
                        100
                    )
                    : 100;

            tendencia = "Positiva";
            tendenciaNota =
                `Crescimento de ${crescimento}%`;

            tendenciaCor = "#34D399";

        } else if (
            segundaMetade <
            primeiraMetade
        ) {

            const queda =
                primeiraMetade > 0
                    ? Math.round(
                        (
                            primeiraMetade -
                            segundaMetade
                        ) /
                        primeiraMetade *
                        100
                    )
                    : 0;

            tendencia = "Em queda";
            tendenciaNota =
                `Redução de ${queda}%`;

            tendenciaCor = "#F87171";

        }

        const receitaElemento =
            pegarElemento(
                "dashboard-receita-total"
            );

        const receitaHojeElemento =
            pegarElemento(
                "dashboard-receita-hoje"
            );

        const pedidosElemento =
            pegarElemento(
                "dashboard-pedidos-pagos"
            );

        const pedidosStatusElemento =
            pegarElemento(
                "dashboard-pedidos-status"
            );

        const conversaoElemento =
            pegarElemento(
                "dashboard-conversao-leads"
            );

        const leadsStatusElemento =
            pegarElemento(
                "dashboard-leads-status"
            );

        if (receitaElemento) {
            receitaElemento.textContent =
                podeVerPedidos ? formatarMoeda(receitaTotal) : "—";
        }

        if (receitaHojeElemento) {
            receitaHojeElemento.textContent =
                podeVerPedidos ? `Hoje: ${formatarMoeda(receitaHoje)}` : "Sem acesso a pedidos";
        }

        if (pedidosElemento) {
            pedidosElemento.textContent =
                podeVerPedidos ? pedidosPagos.length : "—";
        }

        if (pedidosStatusElemento) {
            pedidosStatusElemento.textContent =
                podeVerPedidos ? `${pedidosPagos.length} de ${pedidos.length}` : "Sem acesso";
        }

        if (conversaoElemento) {
            conversaoElemento.textContent =
                podeVerLeads ? `${conversao}%` : "—";
        }

        if (leadsStatusElemento) {
            leadsStatusElemento.textContent =
                podeVerLeads ? `${convertidos} convertido(s)` : "Sem acesso";
        }

        const maiorElemento =
            pegarElemento(
                "dashboard-maior-resultado"
            );

        const maiorDiaElemento =
            pegarElemento(
                "dashboard-maior-dia"
            );

        const mediaElemento =
            pegarElemento(
                "dashboard-media-diaria"
            );

        const tendenciaElemento =
            pegarElemento(
                "dashboard-tendencia"
            );

        const tendenciaNotaElemento =
            pegarElemento(
                "dashboard-tendencia-nota"
            );

        const pedidosPeriodoElemento =
            pegarElemento(
                "dashboard-pedidos-periodo"
            );

        if (maiorElemento) {
            maiorElemento.textContent =
                formatarMoeda(maiorResultado);
        }

        if (maiorDiaElemento) {

            maiorDiaElemento.textContent =
                maiorResultado > 0
                    ? dias[indiceMaior]?.nome ||
                      "Dia não informado"
                    : "Sem vendas pagas";

        }

        if (mediaElemento) {
            mediaElemento.textContent =
                formatarMoeda(mediaDiaria);
        }

        if (tendenciaElemento) {

            tendenciaElemento.textContent =
                tendencia;

            tendenciaElemento.style.color =
                tendenciaCor;

        }

        if (tendenciaNotaElemento) {
            tendenciaNotaElemento.textContent =
                tendenciaNota;
        }

        if (pedidosPeriodoElemento) {
            pedidosPeriodoElemento.textContent =
                pedidosPeriodo;
        }

        const maiorDia =
            Math.max(0, ...valores);

        const percentualHoje =
            maiorDia > 0
                ? Math.min(
                    100,
                    receitaHoje /
                    maiorDia *
                    100
                )
                : 0;

        const percentualPedidos =
            pedidos.length > 0
                ? Math.min(
                    100,
                    pedidosPagos.length /
                    pedidos.length *
                    100
                )
                : 0;

        const barraReceita =
            pegarElemento(
                "dashboard-receita-bar"
            );

        const barraPedidos =
            pegarElemento(
                "dashboard-pedidos-bar"
            );

        const barraLeads =
            pegarElemento(
                "dashboard-leads-bar"
            );

        if (barraReceita) {
            barraReceita.style.width =
                `${percentualHoje}%`;
        }

        if (barraPedidos) {
            barraPedidos.style.width =
                `${percentualPedidos}%`;
        }

        if (barraLeads) {
            barraLeads.style.width =
                `${Math.min(100, conversao)}%`;
        }

        const statusGrafico =
            pegarElemento(
                "dashboard-chart-status"
            );

        if (statusGrafico) {

            statusGrafico.textContent =
                `Atualizado às ${
                    new Date().toLocaleTimeString(
                        "pt-BR",
                        {
                            hour: "2-digit",
                            minute: "2-digit"
                        }
                    )
                }`;

        }

        inicializarGrafico();

renderizarCentralOperacional(
    pedidos,
    leads
);

renderizarCentralImplantacao();

    } catch (erro) {

        console.error(
            "Erro ao carregar cockpit:",
            erro
        );

        const statusGrafico =
            pegarElemento(
                "dashboard-chart-status"
            );

        if (statusGrafico) {
            statusGrafico.textContent =
                "Erro ao sincronizar";
        }

    }

}

/* =========================================================
   CENTRAL OPERACIONAL DO DASHBOARD
   Reutiliza pedidos e leads já carregados pelo cockpit.
   ========================================================= */

function renderizarCentralOperacional(
    pedidos = [],
    leads = []
) {

    const dashboard =
        document.getElementById("view-dashboard");

    if (!dashboard) return;

    let painel =
        document.getElementById(
            "dashboard-central-operacional"
        );

    if (!painel) {

        painel =
            document.createElement("div");

        painel.id =
            "dashboard-central-operacional";

        painel.className =
            "glass-card dashboard-ops layout-block";

        painel.dataset.blockId =
            "central-operacional";

        painel.dataset.blockNome =
            "Central Operacional";

        dashboard.appendChild(painel);

    }

    const escapar = valor =>
        String(valor || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");

    const obterTimestamp = objeto => {

        const possibilidades = [
            objeto?.data,
            objeto?.criadoEm,
            objeto?.atualizadoEm,
            objeto?.timestamp
        ];

        for (const valor of possibilidades) {

            if (!valor) continue;

            if (typeof valor.toMillis === "function") {
                return valor.toMillis();
            }

            if (
                typeof valor.seconds === "number"
            ) {
                return valor.seconds * 1000;
            }

            if (typeof valor === "number") {

                return valor < 100000000000
                    ? valor * 1000
                    : valor;

            }

            const dataConvertida =
                new Date(valor).getTime();

            if (!Number.isNaN(dataConvertida)) {
                return dataConvertida;
            }

        }

        return 0;

    };

    const formatarMoeda = valor =>
        Number(valor || 0).toLocaleString(
            "pt-BR",
            {
                style: "currency",
                currency: "BRL"
            }
        );

    const formatarTempo = timestamp => {

        if (!timestamp) {
            return "Data não informada";
        }

        const diferenca =
            Date.now() - timestamp;

        const minutos =
            Math.floor(diferenca / 60000);

        const horas =
            Math.floor(minutos / 60);

        const dias =
            Math.floor(horas / 24);

        if (minutos < 1) {
            return "Agora";
        }

        if (minutos < 60) {
            return `Há ${minutos} min`;
        }

        if (horas < 24) {
            return `Há ${horas}h`;
        }

        if (dias < 7) {
            return `Há ${dias} dia(s)`;
        }

        return new Date(timestamp)
            .toLocaleDateString("pt-BR");

    };

    const inicioHoje =
        new Date();

    inicioHoje.setHours(0, 0, 0, 0);

    const pedidosPendentes =
        pedidos.filter(pedido =>
            ["aguardando", "confirmado"].includes(
                String(
                    pedido.status || ""
                ).toLowerCase()
            )
        );

    const leadsNovos =
        leads.filter(lead => {

            const status =
                String(
                    lead.statusLead ||
                    lead.status ||
                    "novo"
                ).toLowerCase();

            return status === "novo";

        });

    const leadsSemWhatsApp =
        leads.filter(lead => {

            const numeros =
                String(
                    lead.whatsapp || ""
                ).replace(/\D/g, "");

            return numeros.length < 10;

        });

    const convertidosHoje =
        leads.filter(lead => {

            const status =
                String(
                    lead.statusLead ||
                    lead.status ||
                    ""
                ).toLowerCase();

            return (
                status === "convertido" &&
                obterTimestamp(lead) >=
                    inicioHoje.getTime()
            );

        });

    const atividades = [

        ...pedidos.map(pedido => ({

            tipo: "pedido",

            titulo:
                `Pedido de ${
                    pedido.cliente ||
                    "cliente não informado"
                }`,

            descricao:
                `${
                    pedido.produtos ||
                    "Produtos não informados"
                } · ${
                    formatarMoeda(
                        pedido.valor
                    )
                }`,

            status:
                pedido.status ||
                "aguardando",

            timestamp:
                obterTimestamp(pedido),

            destino:
                "pedidos"

        })),

        ...leads.map(lead => ({

            tipo: "lead",

            titulo:
                `${
                    lead.nome ||
                    "Novo lead"
                }`,

            descricao:
                `${
                    lead.origem ||
                    lead.utm_source ||
                    "Origem não informada"
                } · ${
                    lead.whatsapp ||
                    "Sem WhatsApp"
                }`,

            status:
                lead.statusLead ||
                lead.status ||
                "novo",

            timestamp:
                obterTimestamp(lead),

            destino:
                "leads"

        }))

    ]
        .sort(
            (a, b) =>
                b.timestamp -
                a.timestamp
        )
        .slice(0, 7);

    const statusLabels = {

        aguardando: "Aguardando",
        confirmado: "Confirmado",
        pago: "Pago",
        cancelado: "Cancelado",
        novo: "Novo",
        contato: "Em contato",
        convertido: "Convertido",
        perdido: "Perdido"

    };

    const renderizarAtividades =
        atividades.length
            ? atividades.map(atividade => {

                const status =
                    String(
                        atividade.status ||
                        ""
                    ).toLowerCase();

                return `
                    <button
                        type="button"
                        class="dashboard-ops-activity"
                        data-dashboard-action="${atividade.destino}"
                        data-type="${atividade.tipo}"
                    >

                        <span class="dashboard-ops-activity-dot"></span>

                        <span class="dashboard-ops-activity-copy">

                            <strong>
                                ${escapar(
                                    atividade.titulo
                                )}
                            </strong>

                            <small>
                                ${escapar(
                                    atividade.descricao
                                )}
                            </small>

                        </span>

                        <span class="dashboard-ops-activity-meta">

                            <b data-status="${status}">
                                ${
                                    statusLabels[status] ||
                                    escapar(status)
                                }
                            </b>

                            <small>
                                ${
                                    formatarTempo(
                                        atividade.timestamp
                                    )
                                }
                            </small>

                        </span>

                    </button>
                `;

            }).join("")
            : `
                <div class="dashboard-ops-empty">

                    <strong>
                        Nenhuma atividade registrada
                    </strong>

                    <span>
                        Pedidos e leads recentes aparecerão aqui.
                    </span>

                </div>
            `;

    painel.innerHTML = `

        <div class="dashboard-ops-header">

            <div class="dashboard-ops-title">

                <span class="dashboard-ops-title-icon">

                    <svg viewBox="0 0 24 24"
                         fill="none"
                         stroke="currentColor">

                        <path d="M4 19V9"></path>
                        <path d="M10 19V5"></path>
                        <path d="M16 19v-7"></path>
                        <path d="M22 19H2"></path>

                    </svg>

                </span>

                <div>

                    <small>
                        Visão operacional
                    </small>

                    <h3>
                        Central de decisões
                    </h3>

                    <p>
                        Pendências, movimentações recentes e atalhos da sua loja.
                    </p>

                </div>

            </div>

            <span class="dashboard-ops-live">

                <i></i>

                Dados sincronizados

            </span>

        </div>

        <div class="dashboard-ops-alerts">

            <button
                type="button"
                class="dashboard-ops-alert is-warning"
                data-dashboard-action="pedidos"
            >

                <span>Pedidos pendentes</span>

                <strong>
                    ${pedidosPendentes.length}
                </strong>

                <small>
                    Aguardando conclusão
                </small>

            </button>

            <button
                type="button"
                class="dashboard-ops-alert is-primary"
                data-dashboard-action="leads"
            >

                <span>Leads novos</span>

                <strong>
                    ${leadsNovos.length}
                </strong>

                <small>
                    Ainda não atendidos
                </small>

            </button>

            <button
                type="button"
                class="dashboard-ops-alert is-danger"
                data-dashboard-action="leads"
            >

                <span>Sem WhatsApp</span>

                <strong>
                    ${leadsSemWhatsApp.length}
                </strong>

                <small>
                    Contatos incompletos
                </small>

            </button>

            <button
                type="button"
                class="dashboard-ops-alert is-success"
                data-dashboard-action="leads"
            >

                <span>Conversões hoje</span>

                <strong>
                    ${convertidosHoje.length}
                </strong>

                <small>
                    Leads convertidos
                </small>

            </button>

        </div>

        <div class="dashboard-ops-grid">

            <div class="dashboard-ops-section">

                <div class="dashboard-ops-section-header">

                    <div>

                        <small>
                            Linha do tempo
                        </small>

                        <h4>
                            Atividades recentes
                        </h4>

                    </div>

                    <span>
                        ${atividades.length} registro(s)
                    </span>

                </div>

                <div class="dashboard-ops-activity-list">

                    ${renderizarAtividades}

                </div>

            </div>

            <div class="dashboard-ops-section">

                <div class="dashboard-ops-section-header">

                    <div>

                        <small>
                            Criação rápida
                        </small>

                        <h4>
                            Ações frequentes
                        </h4>

                    </div>

                </div>

                <div class="dashboard-ops-actions">

                    <button
                        type="button"
                        data-dashboard-action="novo-produto"
                    >

                        <span>+</span>

                        <div>
                            <strong>Novo produto</strong>
                            <small>Cadastrar oferta</small>
                        </div>

                    </button>

                    <button
                        type="button"
                        data-dashboard-action="novo-pedido"
                    >

                        <span>+</span>

                        <div>
                            <strong>Novo pedido</strong>
                            <small>Registrar venda</small>
                        </div>

                    </button>

                    <button
                        type="button"
                        data-dashboard-action="novo-template"
                    >

                        <span>+</span>

                        <div>
                            <strong>Novo template</strong>
                            <small>Criar mensagem</small>
                        </div>

                    </button>

                    <button
                        type="button"
                        data-dashboard-action="nova-lp"
                    >

                        <span>+</span>

                        <div>
                            <strong>Nova Landing Page</strong>
                            <small>Criar página</small>
                        </div>

                    </button>

                </div>

                <div class="dashboard-ops-summary">

                    <div>

                        <span>Total de pedidos</span>

                        <strong>
                            ${pedidos.length}
                        </strong>

                    </div>

                    <div>

                        <span>Total de leads</span>

                        <strong>
                            ${leads.length}
                        </strong>

                    </div>

                </div>

            </div>

        </div>
    `;

    painel.onclick = evento => {

        const botao =
            evento.target.closest(
                "[data-dashboard-action]"
            );

        if (!botao) return;

        const acao =
            botao.dataset.dashboardAction;

        const abrirModulo = (
            viewId,
            acaoDepois
        ) => {

            if (
                typeof window.ativarAba ===
                "function"
            ) {
                window.ativarAba(viewId);
            }

            if (!acaoDepois) return;

            setTimeout(() => {

                const view =
                    document.getElementById(
                        viewId
                    );

                if (
                    view &&
                    !view.classList.contains(
                        "active"
                    )
                ) {
                    return;
                }

                acaoDepois();

            }, 180);

        };

        const acoes = {

            pedidos: () =>
                abrirModulo(
                    "view-pedidos"
                ),

            leads: () =>
                abrirModulo(
                    "view-leads"
                ),

"novo-produto": () =>
    abrirModulo(
        "view-dashboard",
        () =>
            document
                .getElementById(
                    "btn-abrir-criacao"
                )
                ?.click()
    ),

            "novo-pedido": () =>
                abrirModulo(
                    "view-pedidos",
                    () =>
                        window
                            .abrirModalPedido?.()
                ),

            "novo-template": () =>
                abrirModulo(
                    "view-templates",
                    () =>
                        window
                            .abrirModalTemplate?.()
                ),

            "nova-lp": () =>
                abrirModulo(
                    "view-landing-pages",
                    () =>
                        window
                            .abrirModalLP?.()
                )

        };

        acoes[acao]?.();

    };

    prepararBlocosLayoutEditaveis(painel);

    // Reaplica a ordem salva agora que o bloco dinâmico já existe.
    if (
        typeof aplicarLayoutSalvoDaAba ===
        "function"
    ) {
        requestAnimationFrame(() => {
            aplicarLayoutSalvoDaAba(
                "view-dashboard"
            );
        });
    }

}

/* =========================================================
   CENTRAL DE IMPLANTAÇÃO DA LOJA
   Não realiza novas consultas ao Firebase.
   ========================================================= */

function renderizarCentralImplantacao() {

    const dashboard =
        document.getElementById("view-dashboard");

    if (!dashboard) return;

    let painel =
        document.getElementById(
            "dashboard-launch-center"
        );

    if (!painel) {

        painel =
            document.createElement("div");

        painel.id =
            "dashboard-launch-center";

        painel.className =
            "glass-card dashboard-launch layout-block";

        painel.dataset.blockId =
            "central-implantacao";

        painel.dataset.blockNome =
            "Central de Implantação";

        const centralOperacional =
            document.getElementById(
                "dashboard-central-operacional"
            );

        if (centralOperacional) {

            centralOperacional
                .insertAdjacentElement(
                    "afterend",
                    painel
                );

        } else {

            dashboard.appendChild(painel);

        }

    }

    const obterValor = id =>
        String(
            document.getElementById(id)?.value ||
            ""
        ).trim();

    const estaAtivo = id =>
        Boolean(
            document.getElementById(id)?.checked
        );

    const temWhatsApp = valor =>
        String(valor || "")
            .replace(/\D/g, "")
            .length >= 10;

    const nomeLoja =
        obterValor("perf-nome-loja");

    const slug =
        obterValor("perf-slug") ||
        slugAtualSalvo ||
        "";

    const titulo =
        obterValor("perf-titulo");

    const subtitulo =
        obterValor("perf-subtitulo");

    const whatsappCentral =
        obterValor(
            "perf-social-whatsapp-central"
        );

    const whatsappChat =
        obterValor(
            "perf-social-whatsapp-chat"
        );

    const instagram =
        obterValor(
            "perf-social-instagram"
        );

    const tiktok =
        obterValor(
            "perf-social-tiktok"
        );

    const youtube =
        obterValor(
            "perf-social-youtube"
        );

    const corPrincipal =
        obterValor(
            "perf-cor-destaque"
        );

    const fonte =
        obterValor(
            "perf-fonte-vitrine"
        );

    const tarefas = [

        {
            titulo: "Identidade da loja",
            descricao:
                "Defina o nome público da sua empresa.",
            concluida:
                nomeLoja.length >= 2,
            acao: "identidade",
            botao: "Configurar identidade"
        },

        {
            titulo: "Endereço da vitrine",
            descricao:
                "Escolha o endereço exclusivo da loja.",
            concluida:
                slug.length >= 2,
            acao: "identidade",
            botao: "Definir endereço"
        },

        {
            titulo: "Apresentação principal",
            descricao:
                "Adicione título e descrição na vitrine.",
            concluida:
                titulo.length >= 2 &&
                subtitulo.length >= 2,
            acao: "identidade",
            botao: "Editar apresentação"
        },

        {
            titulo: "WhatsApp comercial",
            descricao:
                "Cadastre um telefone válido para atendimento.",
            concluida:
                temWhatsApp(whatsappCentral) ||
                temWhatsApp(whatsappChat),
            acao: "redes-sociais",
            botao: "Configurar WhatsApp"
        },

        {
            titulo: "Primeiro produto",
            descricao:
                "Cadastre pelo menos uma oferta ativa.",
            concluida:
                Number(totalProdutosAtual || 0) > 0,
            acao: "novo-produto",
            botao: "Cadastrar produto"
        },

        {
            titulo: "Canal de conversão",
            descricao:
                "Ative o carrinho ou o chat da loja.",
            concluida:
                estaAtivo("perf-carrinho-ativo") ||
                estaAtivo("perf-chat-ativo"),
            acao:
                estaAtivo("perf-carrinho-ativo")
                    ? "chat-config"
                    : "carrinho-config",
            botao: "Configurar conversão"
        },

        {
            titulo: "Presença digital",
            descricao:
                "Conecte ao menos uma rede social.",
            concluida:
                Boolean(
                    instagram ||
                    tiktok ||
                    youtube
                ),
            acao: "redes-sociais",
            botao: "Adicionar rede social"
        },

        {
            titulo: "Identidade visual",
            descricao:
                "Defina cores e tipografia da vitrine.",
            concluida:
                Boolean(
                    corPrincipal &&
                    fonte
                ),
            acao: "aparencia-cores",
            botao: "Personalizar visual"
        }

    ];

    const concluidas =
        tarefas.filter(
            tarefa => tarefa.concluida
        ).length;

    const total =
        tarefas.length;

    const percentual =
        Math.round(
            concluidas /
            total *
            100
        );

    const primeiraPendente =
        tarefas.find(
            tarefa => !tarefa.concluida
        );

    const mensagemStatus =

        percentual === 100
            ? "Sua loja está pronta para operar"
            : percentual >= 75
                ? "Sua loja está quase pronta"
                : percentual >= 40
                    ? "Continue configurando sua operação"
                    : "Complete os primeiros passos";

    const tarefasHTML =
        tarefas.map(
            (tarefa, indice) => `

                <button
                    type="button"
                    class="dashboard-launch-task ${
                        tarefa.concluida
                            ? "is-complete"
                            : ""
                    }"
                    data-launch-action="${
                        tarefa.acao
                    }"
                >

                    <span class="dashboard-launch-task-status">

                        ${
                            tarefa.concluida
                                ? `
                                    <svg
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                    >
                                        <path d="m7 12 3 3 7-7"></path>
                                    </svg>
                                `
                                : String(
                                    indice + 1
                                ).padStart(2, "0")
                        }

                    </span>

                    <span class="dashboard-launch-task-copy">

                        <strong>
                            ${tarefa.titulo}
                        </strong>

                        <small>
                            ${tarefa.descricao}
                        </small>

                    </span>

                    <span class="dashboard-launch-task-action">

                        ${
                            tarefa.concluida
                                ? "Concluído"
                                : tarefa.botao
                        }

                    </span>

                </button>
            `
        ).join("");

    painel.innerHTML = `

        <div class="dashboard-launch-header">

            <div class="dashboard-launch-heading">

                <span class="dashboard-launch-heading-icon">

                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                    >
                        <path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z"></path>
                        <path d="m4 7 8 4 8-4"></path>
                        <path d="M12 11v10"></path>
                    </svg>

                </span>

                <div>

                    <small>
                        Preparação da operação
                    </small>

                    <h3>
                        Central de implantação
                    </h3>

                    <p>
                        Acompanhe o que falta para sua loja ficar completamente configurada.
                    </p>

                </div>

            </div>

            <div
                class="dashboard-launch-score"
                style="--launch-progress:${percentual * 3.6}deg"
            >

                <div>

                    <strong>
                        ${percentual}%
                    </strong>

                    <span>
                        concluído
                    </span>

                </div>

            </div>

        </div>

        <div class="dashboard-launch-summary">

            <div>

                <small>
                    Status da implantação
                </small>

                <strong>
                    ${mensagemStatus}
                </strong>

                <span>
                    ${concluidas} de ${total} etapas concluídas
                </span>

            </div>

            <div class="dashboard-launch-progress">

                <span
                    style="width:${percentual}%"
                ></span>

            </div>

        </div>

        <div class="dashboard-launch-tasks">

            ${tarefasHTML}

        </div>

        <div class="dashboard-launch-footer">

            <div>

                <strong>
                    ${
                        percentual === 100
                            ? "Configuração concluída"
                            : "Próxima etapa recomendada"
                    }
                </strong>

                <span>

                    ${
                        percentual === 100
                            ? "Revise sua vitrine pública antes de divulgar."
                            : primeiraPendente
                                ?.titulo ||
                              "Continue configurando sua loja."
                    }

                </span>

            </div>

            <div class="dashboard-launch-buttons">

                <button
                    type="button"
                    class="dashboard-launch-secondary"
                    data-launch-action="abrir-loja"
                    ${slug ? "" : "disabled"}
                >
                    Abrir loja
                </button>

                <button
                    type="button"
                    class="dashboard-launch-primary"
                    data-launch-action="${
                        primeiraPendente
                            ?.acao ||
                        "abrir-loja"
                    }"
                >

                    ${
                        percentual === 100
                            ? "Visualizar vitrine"
                            : "Continuar configuração"
                    }

                </button>

            </div>

        </div>
    `;

    painel.onclick = evento => {

        const botao =
            evento.target.closest(
                "[data-launch-action]"
            );

        if (!botao || botao.disabled) {
            return;
        }

        const acao =
            botao.dataset.launchAction;

        const abrirConfiguracao =
            blocoId => {

                window.ativarAba?.(
                    "view-perfil"
                );

                setTimeout(() => {

                    const botaoStudio =
                        document.querySelector(
                            `.aura-settings-nav-button[data-settings-target="${blocoId}"]`
                        );

                    if (botaoStudio) {

                        botaoStudio.click();
                        return;

                    }

                    const bloco =
                        document.querySelector(
                            `#view-perfil [data-block-id="${blocoId}"]`
                        );

                    bloco?.scrollIntoView({
                        behavior: "smooth",
                        block: "start"
                    });

                }, 220);

            };

        if (acao === "novo-produto") {

            window.ativarAba?.(
                "view-dashboard"
            );

            setTimeout(() => {

                document
                    .getElementById(
                        "btn-abrir-criacao"
                    )
                    ?.click();

            }, 180);

            return;

        }

        if (acao === "abrir-loja") {

            const hrefValido =
                obterLinkPublicoValido(
                    "link-minha-loja-cockpit",
                    "link-minha-loja"
                );

            if (hrefValido) {

                window.open(
                    hrefValido,
                    "_blank",
                    "noopener,noreferrer"
                );

            }

            return;

        }

        abrirConfiguracao(acao);

    };

    prepararBlocosLayoutEditaveis(painel);

    if (
        typeof aplicarLayoutSalvoDaAba ===
        "function"
    ) {

        requestAnimationFrame(() => {

            aplicarLayoutSalvoDaAba(
                "view-dashboard"
            );

        });

    }

}

window.renderizarCentralImplantacao =
    renderizarCentralImplantacao;

/* Atualização automática durante a configuração. */

(function prepararCentralImplantacao() {

    if (
        window.__centralImplantacaoAtiva
    ) {
        return;
    }

    window.__centralImplantacaoAtiva =
        true;

    let temporizador = null;

    const atualizar = () => {

        clearTimeout(temporizador);

        temporizador =
            setTimeout(
                renderizarCentralImplantacao,
                120
            );

    };

    const iniciar = () => {

        const perfil =
            document.getElementById(
                "view-perfil"
            );

        perfil?.addEventListener(
            "input",
            atualizar
        );

        perfil?.addEventListener(
            "change",
            atualizar
        );

        setTimeout(
            renderizarCentralImplantacao,
            400
        );

        setTimeout(
            renderizarCentralImplantacao,
            1200
        );

        setTimeout(
            renderizarCentralImplantacao,
            2400
        );

    };

    if (
        document.readyState ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            iniciar,
            { once: true }
        );

    } else {

        iniciar();

    }

})();

window.carregarCockpitReal =
    carregarCockpitReal;

// Renderização inicial segura
setTimeout(inicializarGrafico, 500);
        // =============================================
        // C1 — MÉTRICAS REAIS
        // =============================================
        // PEDIDOS
        // CAMPANHAS
        async function carregarCampanha() {
            if (!usuarioUID) return;
            try {
                const snap = await getDoc(doc(db, "campanhas", usuarioUID));
                if (snap.exists()) {
                    const d = snap.data();
                    document.getElementById("campanha-ativa").checked = d.ativa || false;
                    document.getElementById("campanha-titulo").value = d.titulo || "";
                    document.getElementById("campanha-texto").value = d.texto || "";
                    document.getElementById("campanha-tempo").value = d.tempo || 10;
                    document.getElementById("campanha-link").value = d.link || "";
                    document.getElementById("campanha-btn-texto").value = d.btnTexto || "";
const status = d.ativa
                        ? `Campanha ativa — "${d.titulo}"`
                        : "Campanha desativada.";

                    const statusBox =
                        document.getElementById("campanha-status-box");

                    statusBox.dataset.state =
                        d.ativa ? "ativa" : "inativa";

                    document.getElementById(
                        "campanha-status-texto"
                    ).innerText = status;
                }
            } catch(err) { console.error(err); }
        }

        window.salvarCampanha = async function() {
            if (!exigirEdicaoModulo("campanhas")) return;

            try {
                const payload = {
                    ativa: document.getElementById("campanha-ativa").checked,
                    titulo: document.getElementById("campanha-titulo").value.trim(),
                    texto: document.getElementById("campanha-texto").value.trim(),
                    tempo: parseInt(document.getElementById("campanha-tempo").value || 10),
                    link: document.getElementById("campanha-link").value.trim(),
                    btnTexto: document.getElementById("campanha-btn-texto").value.trim(),
                    atualizadoEm: Date.now()
                };
                await setDoc(doc(db, "campanhas", usuarioUID), payload);

                // Registra no histórico (não sobrescreve — cada save vira um registro novo)
                await setDoc(doc(db, "campanhas_historico", `camphist_${Date.now()}`), {
                    ...payload,
                    criadoPor: usuarioUID,
                    dataCriacao: Date.now()
                });

const status = payload.ativa
                    ? `Campanha ativa — "${payload.titulo}"`
                    : "Campanha desativada.";

                const statusBox =
                    document.getElementById("campanha-status-box");

                statusBox.dataset.state =
                    payload.ativa ? "ativa" : "inativa";

                document.getElementById(
                    "campanha-status-texto"
                ).innerText = status;
                showToast(payload.ativa ? "Campanha ativada na vitrine!" : "Campanha desativada.");
                carregarHistoricoCampanhas(obterFiltroSelecionado("filtro-campanha-dias", "filtro-campanha-de", "filtro-campanha-ate"));
            } catch(err) {
                showToast("Erro ao salvar campanha.", "error");
            }
        };

        async function carregarHistoricoCampanhas(filtroDataDias = 30) {
            if (!usuarioUID) return;
            const box = document.getElementById("campanhas-historico-lista");
            if (!box) return;
            try {
                const snap = await getDocs(query(collection(db, "campanhas_historico"), where("criadoPor", "==", usuarioUID)));
                let registros = [];
                snap.forEach(d => registros.push({ id: d.id, ...d.data() }));

                const { inicio, fim, todos } = normalizarIntervalo(filtroDataDias);
                if (!todos) {
                    registros = registros.filter(r => (r.dataCriacao || Date.now()) >= inicio && (r.dataCriacao || Date.now()) <= fim);
                }
                registros.sort((a, b) => (b.dataCriacao || 0) - (a.dataCriacao || 0));

                if (registros.length === 0) {
                    box.innerHTML = `<p class="text-xs text-gray-500">Nenhuma campanha salva nesse período.</p>`;
                    return;
                }

                box.innerHTML = registros.map(r => `
                    <div class="flex items-center justify-between bg-white/[0.02] border border-white/5 rounded-xl p-3">
                        <div class="min-w-0">
                            <p class="text-xs font-bold text-white truncate">${r.titulo || "(sem título)"}</p>
                            <p class="text-[10px] text-gray-500">${r.dataCriacao ? new Date(r.dataCriacao).toLocaleString("pt-BR") : "—"}</p>
                        </div>
                        <span class="text-[10px] font-bold px-2 py-1 rounded-md uppercase shrink-0 ${r.ativa ? 'bg-emerald-500/10 text-emerald-400' : 'bg-gray-500/10 text-gray-400'}">${r.ativa ? 'Ativada' : 'Desativada'}</span>
                    </div>
                `).join("");
            } catch(err) {
                console.error(err);
                box.innerHTML = `<p class="text-xs text-red-400">Erro ao carregar histórico (veja o console).</p>`;
            }
        }

        window.aplicarFiltroCampanhas = async function() {
            const filtro = obterFiltroSelecionado("filtro-campanha-dias", "filtro-campanha-de", "filtro-campanha-ate");
            await carregarHistoricoCampanhas(filtro);
            showToast("Filtro aplicado!");
        };
        // TEMPLATES
        async function carregarTemplates(filtroDataDias = 0) {
            if (!usuarioUID) return;

            const container =
                document.getElementById("templates-container");

            const totalElemento =
                document.getElementById("template-total-count");

            const vendasElemento =
                document.getElementById("template-vendas-count");

            const suporteElemento =
                document.getElementById("template-suporte-count");

            if (!container) return;

            try {
                const snap = await getDocs(
                    query(
                        collection(db, "templates"),
                        where("criadoPor", "==", usuarioUID)
                    )
                );

                let templates = [];

                snap.forEach(d => {
                    templates.push({
                        id: d.id,
                        ...d.data()
                    });
                });

                const { inicio, fim, todos } =
                    normalizarIntervalo(filtroDataDias);

                if (!todos) {
                    templates = templates.filter(t => {
                        const data = t.criadoEm || Date.now();

                        return data >= inicio && data <= fim;
                    });
                }

                templates.sort(
                    (a, b) =>
                        (b.criadoEm || 0) -
                        (a.criadoEm || 0)
                );

                const total = templates.length;

                const totalVendas =
                    templates.filter(
                        t => t.categoria === "vendas"
                    ).length;

                const totalSuporte =
                    templates.filter(
                        t => t.categoria === "suporte"
                    ).length;

                if (totalElemento) {
                    totalElemento.innerText = total;
                }

                if (vendasElemento) {
                    vendasElemento.innerText = totalVendas;
                }

                if (suporteElemento) {
                    suporteElemento.innerText = totalSuporte;
                }

                if (templates.length === 0) {
                    container.innerHTML = `
                        <div class="aura-templates-empty">

                            <span>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                    <path d="M4 5h16v12H8l-4 4V5Z"></path>
                                    <path d="M8 9h8"></path>
                                    <path d="M8 13h5"></path>
                                </svg>
                            </span>

                            <strong>
                                Nenhum template encontrado
                            </strong>

                            <p>
                                Crie uma mensagem ou altere o período selecionado.
                            </p>

                            <button onclick="abrirModalTemplate()">
                                Criar primeiro template
                            </button>

                        </div>
                    `;

                    return;
                }

                const categorias = {
                    geral: {
                        label: "Geral",
                        state: "general"
                    },

                    vendas: {
                        label: "Vendas",
                        state: "sales"
                    },

                    suporte: {
                        label: "Suporte",
                        state: "support"
                    },

                    followup: {
                        label: "Follow-up",
                        state: "followup"
                    },

                    cobranca: {
                        label: "Cobrança",
                        state: "billing"
                    }
                };

                container.innerHTML =
                    templates.map(t => {
                        const categoria =
                            categorias[t.categoria] ||
                            categorias.geral;

                        const dataFormatada =
                            t.criadoEm
                                ? new Date(
                                    t.criadoEm
                                ).toLocaleDateString("pt-BR")
                                : "Data não informada";

                        return `
                            <div
                                class="glass-card aura-template-card"
                                data-category="${categoria.state}"
                            >

                                <div class="aura-template-card-top">

                                    <span class="aura-template-card-icon">

                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                            <path d="M4 5h16v12H8l-4 4V5Z"></path>
                                            <path d="M8 9h8"></path>
                                            <path d="M8 13h5"></path>
                                        </svg>

                                    </span>

                                    <span class="aura-template-category">
                                        ${categoria.label}
                                    </span>

                                </div>

                                <div class="aura-template-card-content">

                                    <h3>
                                        ${t.titulo || "Template sem título"}
                                    </h3>

                                    <p>
                                        ${t.mensagem || ""}
                                    </p>

                                </div>

                                <div class="aura-template-card-meta">

                                    <span>

                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                            <circle cx="12" cy="12" r="9"></circle>
                                            <path d="M12 7v5l3 2"></path>
                                        </svg>

                                        ${dataFormatada}

                                    </span>

                                    <div class="aura-template-card-flags">

                                        ${
                                            (t.mensagem || "").includes("{nome}")
                                                ? `
                                                    <span class="aura-template-variable">
                                                        {nome}
                                                    </span>
                                                `
                                                : ""
                                        }

                                        ${
                                            t.fluxo?.ativo
                                                ? `
                                                    <span class="aura-template-flow-badge">
                                                        Fluxo ativo
                                                    </span>
                                                `
                                                : ""
                                        }

                                    </div>

                                </div>

                                <div class="aura-template-card-actions">

                                    <button
                                        onclick="copiarTemplate('${t.id}')"
                                        class="aura-template-copy-button"
                                    >

                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                            <rect x="8" y="8" width="11" height="11" rx="2"></rect>
                                            <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"></path>
                                        </svg>

                                        Copiar

                                    </button>

                                    <button
                                        onclick="editarTemplate('${t.id}')"
                                        class="aura-template-edit-button"
                                        aria-label="Editar template"
                                    >

                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                            <path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z"></path>
                                            <path d="m13.5 6.5 4 4"></path>
                                        </svg>

                                    </button>

                                    <button
                                        onclick="excluirTemplate('${t.id}')"
                                        class="aura-template-delete-button"
                                        aria-label="Excluir template"
                                    >

                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                            <path d="M4 7h16"></path>
                                            <path d="M10 11v6"></path>
                                            <path d="M14 11v6"></path>
                                            <path d="m6 7 1 14h10l1-14"></path>
                                            <path d="M9 7V4h6v3"></path>
                                        </svg>

                                    </button>

                                </div>

                            </div>
                        `;

                    }).join("");

            } catch (err) {
                console.error(err);

                if (totalElemento) totalElemento.innerText = "—";
                if (vendasElemento) vendasElemento.innerText = "—";
                if (suporteElemento) suporteElemento.innerText = "—";

                container.innerHTML = `
                    <div class="aura-templates-error">
                        Não foi possível carregar os templates.
                    </div>
                `;
            }
        }

window.atualizarEstadoFluxoTemplate =
function() {

    const ativo =
        document.getElementById(
            "tpl-fluxo-ativo"
        )?.checked;

    document
        .getElementById(
            "tpl-fluxo-config"
        )
        ?.classList.toggle(
            "hidden",
            !ativo
        );

};

window.limparFluxoTemplateForm =
function() {

    const ativo =
        document.getElementById(
            "tpl-fluxo-ativo"
        );

    const status =
        document.getElementById(
            "tpl-fluxo-status"
        );

    const followup =
        document.getElementById(
            "tpl-fluxo-followup"
        );

    const prioridade =
        document.getElementById(
            "tpl-fluxo-prioridade"
        );

    const anotacao =
        document.getElementById(
            "tpl-fluxo-anotacao"
        );

    if (ativo) ativo.checked = false;
    if (status) status.value = "nenhum";
    if (followup) followup.value = "0";
    if (prioridade) prioridade.value = "normal";
    if (anotacao) anotacao.value = "";

    atualizarEstadoFluxoTemplate();

};

window.abrirModalTemplate =
function() {

    document.getElementById(
        "tpl-id-edicao"
    ).value = "";

    document.getElementById(
        "tpl-titulo"
    ).value = "";

    document.getElementById(
        "tpl-mensagem"
    ).value = "";

    document.getElementById(
        "tpl-categoria"
    ).value = "geral";

    limparFluxoTemplateForm();

    const tituloModal =
        document.getElementById(
            "template-modal-titulo"
        );

    if (tituloModal) {
        tituloModal.innerText =
            "Novo template";
    }

    document
        .getElementById(
            "template-modal"
        )
        .classList.remove("hidden");

    setTimeout(() => {

        document
            .getElementById(
                "tpl-titulo"
            )
            ?.focus();

    }, 80);

};

window.fecharModalTemplate =
function() {

    document
        .getElementById(
            "template-modal"
        )
        .classList.add("hidden");

    document.getElementById(
        "tpl-id-edicao"
    ).value = "";

    document.getElementById(
        "tpl-titulo"
    ).value = "";

    document.getElementById(
        "tpl-mensagem"
    ).value = "";

    document.getElementById(
        "tpl-categoria"
    ).value = "geral";

    limparFluxoTemplateForm();

};

        window.aplicarFiltroTemplates = async function() {
            const filtro = obterFiltroSelecionado(
                "filtro-template-dias",
                "filtro-template-de",
                "filtro-template-ate"
            );

            await carregarTemplates(filtro);

            const total =
                document.querySelectorAll(
                    "#templates-container > .aura-template-card"
                ).length;

            showToast(
                `Filtro aplicado! ${total} template(s) encontrado(s).`
            );
        };

        window.copiarTemplate = async function(id) {
            try {
                const snap =
                    await getDoc(doc(db, "templates", id));

                if (!snap.exists()) return;

                await navigator.clipboard.writeText(
                    snap.data().mensagem || ""
                );

                showToast("Template copiado!");

            } catch (err) {
                console.error(err);
                showToast("Não foi possível copiar.", "error");
            }
        };

window.editarTemplate =
async function(id) {

    const snap =
        await getDoc(
            doc(
                db,
                "templates",
                id
            )
        );

    if (!snap.exists()) return;

    const template =
        snap.data();

    const fluxo =
        template.fluxo || {};

    document.getElementById(
        "tpl-titulo"
    ).value =
        template.titulo || "";

    document.getElementById(
        "tpl-mensagem"
    ).value =
        template.mensagem || "";

    document.getElementById(
        "tpl-categoria"
    ).value =
        template.categoria || "geral";

    document.getElementById(
        "tpl-id-edicao"
    ).value =
        id;

    document.getElementById(
        "tpl-fluxo-ativo"
    ).checked =
        Boolean(fluxo.ativo);

    document.getElementById(
        "tpl-fluxo-status"
    ).value =
        fluxo.statusLead ||
        "nenhum";

    document.getElementById(
        "tpl-fluxo-followup"
    ).value =
        String(
            fluxo.followupDias || 0
        );

    document.getElementById(
        "tpl-fluxo-prioridade"
    ).value =
        fluxo.prioridade ||
        "normal";

    document.getElementById(
        "tpl-fluxo-anotacao"
    ).value =
        fluxo.anotacao || "";

    atualizarEstadoFluxoTemplate();

    const tituloModal =
        document.getElementById(
            "template-modal-titulo"
        );

    if (tituloModal) {
        tituloModal.innerText =
            "Editar template";
    }

    document
        .getElementById(
            "template-modal"
        )
        .classList.remove("hidden");

};

        window.excluirTemplate = async function(id) {
            if (!exigirEdicaoModulo("templates")) return;

            abrirConfirmacao(
                "Excluir este template? Essa ação não pode ser desfeita.",
                async () => {
                    if (!exigirEdicaoModulo("templates")) return;

                    try {
                        await deleteDoc(
                            doc(db, "templates", id)
                        );

                        await carregarTemplates();

                        showToast("Template excluído.");

                    } catch (err) {
                        console.error(err);
                        showToast(
                            "Erro ao excluir o template.",
                            "error"
                        );
                    }
                }
            );
        };

window.salvarTemplate =
async function() {
    if (!exigirEdicaoModulo("templates")) return;

    const titulo =
        document
            .getElementById(
                "tpl-titulo"
            )
            .value
            .trim();

    const mensagem =
        document
            .getElementById(
                "tpl-mensagem"
            )
            .value
            .trim();

    const categoria =
        document.getElementById(
            "tpl-categoria"
        ).value;

    const idEdicao =
        document.getElementById(
            "tpl-id-edicao"
        ).value;

    const fluxoAtivo =
        document.getElementById(
            "tpl-fluxo-ativo"
        )?.checked || false;

    const fluxo = {

        ativo:
            fluxoAtivo,

        statusLead:
            document.getElementById(
                "tpl-fluxo-status"
            )?.value || "nenhum",

        followupDias:
            Number(
                document.getElementById(
                    "tpl-fluxo-followup"
                )?.value || 0
            ),

        prioridade:
            document.getElementById(
                "tpl-fluxo-prioridade"
            )?.value || "normal",

        anotacao:
            document.getElementById(
                "tpl-fluxo-anotacao"
            )?.value.trim() || ""

    };

    if (!titulo || !mensagem) {

        return showToast(
            "Preencha título e mensagem.",
            "error"
        );

    }

    try {

        const docId =
            idEdicao ||
            `tpl_${Date.now()}`;

        const dados = {

            titulo,
            mensagem,
            categoria,
            fluxo,

            criadoPor:
                usuarioUID,

            atualizadoEm:
                Date.now()

        };

        if (!idEdicao) {
            dados.criadoEm =
                Date.now();
        }

        await setDoc(
            doc(
                db,
                "templates",
                docId
            ),
            dados,
            {
                merge: true
            }
        );

        fecharModalTemplate();

        await carregarTemplates();

        showToast(
            fluxoAtivo
                ? "Template e fluxo salvos!"
                : "Template salvo!"
        );

    } catch (erro) {

        console.error(erro);

        showToast(
            "Erro ao salvar.",
            "error"
        );

    }

};

        
        window.abrirModalPedido = function() {

            const modal =
                document.getElementById("pedido-modal");

            const cliente =
                document.getElementById("ped-cliente");

            const produtos =
                document.getElementById("ped-produtos");

            const valor =
                document.getElementById("ped-valor");

            const status =
                document.getElementById("ped-status");

            const observacao =
                document.getElementById("ped-obs");

            if (cliente) cliente.value = "";
            if (produtos) produtos.value = "";
            if (valor) valor.value = "";
            if (status) status.value = "aguardando";
            if (observacao) observacao.value = "";

            modal?.classList.remove("hidden");

            setTimeout(() => {
                cliente?.focus();
            }, 80);

        };

        window.fecharModalPedido = function() {

            const modal =
                document.getElementById("pedido-modal");

            modal?.classList.add("hidden");

            const cliente =
                document.getElementById("ped-cliente");

            const produtos =
                document.getElementById("ped-produtos");

            const valor =
                document.getElementById("ped-valor");

            const status =
                document.getElementById("ped-status");

            const observacao =
                document.getElementById("ped-obs");

            if (cliente) cliente.value = "";
            if (produtos) produtos.value = "";
            if (valor) valor.value = "";
            if (status) status.value = "aguardando";
            if (observacao) observacao.value = "";

        };

        window.salvarPedido = async function() {
            if (!exigirEdicaoModulo("pedidos")) return;

            const cliente = document.getElementById("ped-cliente").value.trim();
            const produtos = document.getElementById("ped-produtos").value.trim();
            const valor = parseFloat(document.getElementById("ped-valor").value || 0);
            const status = document.getElementById("ped-status").value;
            const obs = document.getElementById("ped-obs").value.trim();
            if (!cliente || !produtos) return showToast("Preencha cliente e produto.", "error");
            try {
                await setDoc(doc(db, "pedidos", `ped_${Date.now()}`), {
                    cliente, produtos, valor, status, obs,
                    criadoPor: usuarioUID,
                    data: Date.now()
                });
                fecharModalPedido();
                carregarPedidos();
                showToast("Pedido registrado!");
            } catch(err) {
                showToast("Erro ao salvar.", "error");
            }
        };

        async function carregarPedidos(filtroDataDias = 30) {
            if (!usuarioUID) return;
            try {
                const q = query(collection(db, "pedidos"), where("criadoPor", "==", usuarioUID));
                const snap = await getDocs(q);
                let pedidos = [];
                snap.forEach(d => pedidos.push({ id: d.id, ...d.data() }));

                const { inicio, fim, todos } = normalizarIntervalo(filtroDataDias);
                if (!todos) {
                    pedidos = pedidos.filter(p => (p.data || Date.now()) >= inicio && (p.data || Date.now()) <= fim);
                }

                pedidos.sort((a, b) => (b.data || 0) - (a.data || 0));

                window._pedidosVisiveis =
                    pedidos;

                renderizarFluxoPedidos();

                alternarVisualPedidos(
                    window._modoVisualPedidos ||
                    localStorage.getItem(
                        "visualPedidosPreferido"
                    ) ||
                    "tabela"
                );

                const statusMap = { aguardando: "bg-amber-500/10 text-amber-400", confirmado: "bg-blue-500/10 text-blue-400", pago: "bg-emerald-500/10 text-emerald-400", cancelado: "bg-red-500/10 text-red-400" };
                const total = pedidos.length;
                const aguardando = pedidos.filter(p => p.status === "aguardando").length;
                const confirmados = pedidos.filter(p => p.status === "confirmado" || p.status === "pago").length;
                const receita = pedidos.filter(p => p.status === "pago").reduce((s, p) => s + (p.valor || 0), 0);

                const elTotal = document.getElementById("ped-total");
                const elAg = document.getElementById("ped-aguardando");
                const elConf = document.getElementById("ped-confirmados");
                const elRec = document.getElementById("ped-receita");
                if (elTotal) elTotal.innerText = total;
                if (elAg) elAg.innerText = aguardando;
                if (elConf) elConf.innerText = confirmados;
                if (elRec) elRec.innerText = receita.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

                const tbody = document.getElementById("pedidos-table-body");
                if (!tbody) return;
                if (pedidos.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="7" class="text-center p-12 text-gray-500">Nenhum pedido ainda.</td></tr>`;
                    return;
                }
                tbody.innerHTML = pedidos.map(p => `
                    <tr class="hover:bg-white/[0.01] transition-colors">
                        <td class="p-4 font-bold text-white">${p.cliente}</td>
                        <td class="p-4 text-gray-400 max-w-[160px] truncate">${p.produtos}</td>
                        <td class="p-4 text-emerald-400 font-bold">${(p.valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                        <td class="p-4">
                            <select onchange="atualizarStatusPedido('${p.id}', this.value)" class="bg-transparent text-[10px] font-bold rounded-md px-2 py-1 border cursor-pointer outline-none ${statusMap[p.status] || statusMap.aguardando}">
                                <option value="aguardando" ${p.status === 'aguardando' ? 'selected' : ''}>Aguardando</option>
                                <option value="confirmado" ${p.status === 'confirmado' ? 'selected' : ''}>Confirmado</option>
                                <option value="pago" ${p.status === 'pago' ? 'selected' : ''}>Pago</option>
                                <option value="cancelado" ${p.status === 'cancelado' ? 'selected' : ''}>Cancelado</option>
                            </select>
                        </td>
                        <td class="p-4 text-gray-500">${p.data ? new Date(p.data).toLocaleDateString("pt-BR") : "Hoje"}</td>
                        <td class="p-4 text-gray-400 max-w-[120px] truncate">${p.obs || "—"}</td>
                        <td class="p-4 text-right">
                            <button onclick="excluirPedido('${p.id}')" class="text-red-400 hover:text-red-300 text-xs transition-colors">Excluir</button>
                        </td>
                    </tr>
                `).join("");
            } catch(err) {
                console.error(err);
            }
        }

        /* =====================================================
           FLUXO KANBAN DE PEDIDOS
           ===================================================== */

        window._pedidosVisiveis =
            window._pedidosVisiveis || [];

        window._modoVisualPedidos =
            localStorage.getItem(
                "visualPedidosPreferido"
            ) || "tabela";

        window.alternarVisualPedidos = function(modo) {

            const modoFinal =
                modo === "fluxo"
                    ? "fluxo"
                    : "tabela";

            window._modoVisualPedidos =
                modoFinal;

            localStorage.setItem(
                "visualPedidosPreferido",
                modoFinal
            );

            document
                .getElementById("pedidos-table-view")
                ?.classList.toggle(
                    "hidden",
                    modoFinal !== "tabela"
                );

            document
                .getElementById("pedidos-flow-view")
                ?.classList.toggle(
                    "hidden",
                    modoFinal !== "fluxo"
                );

            document
                .getElementById("btn-pedidos-table-view")
                ?.classList.toggle(
                    "is-active",
                    modoFinal === "tabela"
                );

            document
                .getElementById("btn-pedidos-flow-view")
                ?.classList.toggle(
                    "is-active",
                    modoFinal === "fluxo"
                );

            if (modoFinal === "fluxo") {
                renderizarFluxoPedidos();
            }

        };

        function renderizarFluxoPedidos() {

            const board =
                document.getElementById(
                    "pedidos-flow-view"
                );

            if (!board) return;

            const pedidos =
                Array.isArray(
                    window._pedidosVisiveis
                )
                    ? window._pedidosVisiveis
                    : [];

            const escapar = valor =>
                String(valor || "")
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    .replace(/"/g, "&quot;")
                    .replace(/'/g, "&#039;");

            const formatarMoeda = valor =>
                Number(valor || 0)
                    .toLocaleString(
                        "pt-BR",
                        {
                            style: "currency",
                            currency: "BRL"
                        }
                    );

            const colunas = [
                {
                    id: "aguardando",
                    titulo: "Recebidos",
                    descricao: "Aguardando análise"
                },
                {
                    id: "confirmado",
                    titulo: "Confirmados",
                    descricao: "Pedido aprovado"
                },
                {
                    id: "pago",
                    titulo: "Pagos",
                    descricao: "Pagamento concluído"
                },
                {
                    id: "cancelado",
                    titulo: "Cancelados",
                    descricao: "Pedido encerrado"
                }
            ];

            board.innerHTML =
                colunas.map(coluna => {

                    const pedidosColuna =
                        pedidos.filter(
                            pedido =>
                                (
                                    pedido.status ||
                                    "aguardando"
                                ) === coluna.id
                        );

                    const valorColuna =
                        pedidosColuna.reduce(
                            (total, pedido) =>
                                total +
                                Number(
                                    pedido.valor || 0
                                ),
                            0
                        );

                    const cards =
                        pedidosColuna.length
                            ? pedidosColuna.map(pedido => {

                                const data =
                                    pedido.data
                                        ? new Date(
                                            Number(
                                                pedido.data
                                            )
                                        ).toLocaleDateString(
                                            "pt-BR"
                                        )
                                        : "Hoje";

                                return `
                                    <article
                                        class="aura-order-flow-card"
                                        data-status="${coluna.id}"
                                        data-pedido-id="${escapar(pedido.id)}"
                                        draggable="true"
                                        ondragstart="iniciarArrastePedido(event, '${pedido.id}')"
                                    >

                                        <div class="aura-order-flow-card-top">

                                            <span class="aura-order-flow-avatar">
                                                ${escapar(
                                                    (
                                                        pedido.cliente ||
                                                        "C"
                                                    )
                                                    .charAt(0)
                                                    .toUpperCase()
                                                )}
                                            </span>

                                            <span class="aura-order-flow-value">
                                                ${formatarMoeda(pedido.valor)}
                                            </span>

                                        </div>

                                        <div class="aura-order-flow-content">

                                            <strong>
                                                ${escapar(
                                                    pedido.cliente ||
                                                    "Cliente não informado"
                                                )}
                                            </strong>

                                            <span>
                                                ${escapar(
                                                    pedido.produtos ||
                                                    "Produto não informado"
                                                )}
                                            </span>

                                        </div>

                                        <p class="aura-order-flow-note">
                                            ${escapar(
                                                pedido.obs ||
                                                "Sem observações."
                                            )}
                                        </p>

                                        <div class="aura-order-flow-footer">

                                            <span>
                                                ${data}
                                            </span>

                                            <select
                                                onclick="event.stopPropagation()"
                                                onchange="moverPedidoFluxo('${pedido.id}', this.value)"
                                                aria-label="Alterar status do pedido"
                                            >
                                                <option value="aguardando" ${coluna.id === "aguardando" ? "selected" : ""}>
                                                    Aguardando
                                                </option>

                                                <option value="confirmado" ${coluna.id === "confirmado" ? "selected" : ""}>
                                                    Confirmado
                                                </option>

                                                <option value="pago" ${coluna.id === "pago" ? "selected" : ""}>
                                                    Pago
                                                </option>

                                                <option value="cancelado" ${coluna.id === "cancelado" ? "selected" : ""}>
                                                    Cancelado
                                                </option>
                                            </select>

                                            <button
                                                type="button"
                                                onclick="event.stopPropagation(); excluirPedido('${pedido.id}')"
                                                aria-label="Excluir pedido"
                                            >

                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                    <path d="M4 7h16"></path>
                                                    <path d="M10 11v6"></path>
                                                    <path d="M14 11v6"></path>
                                                    <path d="m6 7 1 14h10l1-14"></path>
                                                </svg>

                                            </button>

                                        </div>

                                    </article>
                                `;

                            }).join("")
                            : `
                                <div class="aura-order-flow-empty">
                                    Nenhum pedido nesta etapa.
                                </div>
                            `;

                    return `
                        <section
                            class="aura-order-flow-column"
                            data-flow-status="${coluna.id}"
                            ondragover="permitirDropPedido(event, this)"
                            ondragleave="this.classList.remove('is-drag-over')"
                            ondrop="soltarPedidoFluxo(event, '${coluna.id}', this)"
                        >

                            <header>

                                <div>

                                    <span></span>

                                    <div>
                                        <strong>${coluna.titulo}</strong>
                                        <small>${coluna.descricao}</small>
                                    </div>

                                </div>

                                <b>${pedidosColuna.length}</b>

                            </header>

                            <div class="aura-order-flow-total">
                                <span>Valor da etapa</span>
                                <strong>${formatarMoeda(valorColuna)}</strong>
                            </div>

                            <div class="aura-order-flow-list">
                                ${cards}
                            </div>

                        </section>
                    `;

                }).join("");

        }

        window.renderizarFluxoPedidos =
            renderizarFluxoPedidos;

        window.iniciarArrastePedido =
        function(evento, pedidoId) {

            evento.dataTransfer.setData(
                "text/plain",
                pedidoId
            );

            evento.dataTransfer.effectAllowed =
                "move";

            evento.currentTarget.classList.add(
                "is-dragging"
            );

        };

        window.permitirDropPedido =
        function(evento, coluna) {

            evento.preventDefault();

            evento.dataTransfer.dropEffect =
                "move";

            coluna.classList.add(
                "is-drag-over"
            );

        };

        window.soltarPedidoFluxo =
        function(evento, novoStatus, coluna) {

            evento.preventDefault();

            coluna.classList.remove(
                "is-drag-over"
            );

            const pedidoId =
                evento.dataTransfer.getData(
                    "text/plain"
                );

            document
                .querySelectorAll(
                    ".aura-order-flow-card"
                )
                .forEach(card =>
                    card.classList.remove(
                        "is-dragging"
                    )
                );

            if (pedidoId) {

                moverPedidoFluxo(
                    pedidoId,
                    novoStatus
                );

            }

        };

        window.moverPedidoFluxo =
        async function(
            pedidoId,
            novoStatus
        ) {
            if (!exigirEdicaoModulo("pedidos")) return;

            const pedido =
                window._pedidosVisiveis
                    ?.find(
                        item =>
                            item.id === pedidoId
                    );

            const statusAnterior =
                pedido?.status ||
                "aguardando";

            if (
                pedido &&
                statusAnterior === novoStatus
            ) {
                return;
            }

            if (pedido) {
                pedido.status = novoStatus;
                renderizarFluxoPedidos();
            }

            try {

                await setDoc(
                    doc(
                        db,
                        "pedidos",
                        pedidoId
                    ),
                    {
                        status: novoStatus,
                        statusAtualizadoEm:
                            Date.now()
                    },
                    {
                        merge: true
                    }
                );

                showToast(
                    "Status do pedido atualizado!"
                );

                carregarPedidos(
                    obterFiltroSelecionado(
                        "filtro-pedido-dias",
                        "filtro-pedido-de",
                        "filtro-pedido-ate"
                    )
                );

            } catch (erro) {

                console.error(erro);

                if (pedido) {
                    pedido.status =
                        statusAnterior;

                    renderizarFluxoPedidos();
                }

                showToast(
                    "Não foi possível atualizar o pedido.",
                    "error"
                );

            }

        };

        window.atualizarStatusPedido =
        function(pedidoId, novoStatus) {
            if (!exigirEdicaoModulo("pedidos")) return;

            return moverPedidoFluxo(
                pedidoId,
                novoStatus
            );

        };

        window.aplicarFiltroPedidos = async function() {
            const filtro = obterFiltroSelecionado("filtro-pedido-dias", "filtro-pedido-de", "filtro-pedido-ate");
            await carregarPedidos(filtro);
            const total = document.getElementById("ped-total")?.innerText || "0";
            showToast(`Filtro aplicado! ${total} pedido(s) encontrado(s).`);
        };

        window.excluirPedido = async function(pedidoId) {
    if (!exigirEdicaoModulo("pedidos")) return;

    abrirConfirmacao("Excluir este pedido? Essa ação não pode ser desfeita.", async () => {
        if (!exigirEdicaoModulo("pedidos")) return;

        try {
            await deleteDoc(doc(db, "pedidos", pedidoId));
            carregarPedidos();
            showToast("Pedido excluído.");
        } catch(err) { console.error(err); }
    });
};

        // =============================================
        // NOTIFICAÇÕES (recebidas do admin)
        // =============================================
        let _cacheNotificacoes = [];

        function obterAuthUidAtual() {
            return VideHubContext.getSnapshot().authUid || auth.currentUser?.uid || "";
        }

        function podeMarcarNotificacaoComoLida(notificacao) {
            if (!notificacao || !usuarioUID) return false;
            const destinatarios = notificacao.destinatarios;
            return destinatarios === "todos" ||
                (Array.isArray(destinatarios) && destinatarios.includes(usuarioUID));
        }

        async function carregarNotificacoes() {
            if (!usuarioUID) return;
            try {
                // Antes fazia getDocs(collection(db,"notificacoes")) sem filtro
                // e filtrava no cliente — o Firestore recusa list() sem filtro
                // pra quem não é admin backend, porque a regra depende de
                // resource.data. Cada ramo do or() abaixo espelha um ramo da
                // regra em firestore.rules (match /notificacoes/{id}).
                const q = query(
                    collection(db, "notificacoes"),
                    or(
                        where("destinatarios", "==", "todos"),
                        where("destinatarios", "array-contains", usuarioUID),
                        where("uid", "==", usuarioUID)
                    )
                );
                const snap = await getDocs(q);
                let lista = [];
                snap.forEach(d => {
                    const n = { id: d.id, ...d.data() };
                    const paraMim = n.destinatarios === "todos"
                        || (Array.isArray(n.destinatarios) && n.destinatarios.includes(usuarioUID))
                        || n.uid === usuarioUID;
                    if (paraMim) lista.push(n);
                });
                lista.sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
                _cacheNotificacoes = lista;

                atualizarBadgeNotificacoes();

                const box = document.getElementById("lista-notificacoes-cliente");
                if (!box) return;

if (lista.length === 0) {

                    box.innerHTML = `
                        <div class="aura-notifications-empty">

                            <span class="aura-notifications-empty-icon">

                                <svg viewBox="0 0 24 24"
                                     fill="none"
                                     stroke="currentColor">

                                    <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"></path>
                                    <path d="M10 21h4"></path>

                                </svg>

                            </span>

                            <strong>
                                Nenhuma notificação recebida
                            </strong>

                            <p>
                                Quando houver um novo aviso da Vide Hub, ele aparecerá nesta área.
                            </p>

                        </div>
                    `;

                    return;
                }

                box.innerHTML = lista.map(n => {

                    const lida =
                        (n.lidoPor || []).includes(obterAuthUidAtual());

                    const dataFormatada =
                        n.criadoEm
                            ? new Date(n.criadoEm).toLocaleString("pt-BR")
                            : "Data não informada";

                    return `
                        <div class="aura-notification-item ${lida ? "is-read" : "is-unread"}">

                            ${
                                n.foto
                                    ? `
                                        <img
                                            src="${n.foto}"
                                            alt=""
                                            class="aura-notification-media aura-notification-photo"
                                        >
                                    `
                                    : `
                                        <div class="aura-notification-media aura-notification-icon">

                                            <svg viewBox="0 0 24 24"
                                                 fill="none"
                                                 stroke="currentColor">

                                                <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"></path>
                                                <path d="M10 21h4"></path>

                                            </svg>

                                        </div>
                                    `
                            }

                            <div class="aura-notification-content">

                                <div class="aura-notification-title-row">

                                    <h3>
                                        ${n.titulo}
                                    </h3>

                                    ${
                                        !lida
                                            ? `
                                                <span class="aura-notification-new-badge">

                                                    <i></i>

                                                    Nova

                                                </span>
                                            `
                                            : `
                                                <span class="aura-notification-read-badge">

                                                    <svg viewBox="0 0 24 24"
                                                         fill="none"
                                                         stroke="currentColor">

                                                        <path d="m7 12 3 3 7-7"></path>

                                                    </svg>

                                                    Lida

                                                </span>
                                            `
                                    }

                                </div>

                                <p class="aura-notification-message">
                                    ${n.mensagem}
                                </p>

                                <div class="aura-notification-footer">

                                    <span class="aura-notification-date">

                                        <svg viewBox="0 0 24 24"
                                             fill="none"
                                             stroke="currentColor">

                                            <circle cx="12" cy="12" r="9"></circle>
                                            <path d="M12 7v5l3 2"></path>

                                        </svg>

                                        ${dataFormatada}

                                    </span>

                                    <span class="aura-notification-source">
                                        Vide Hub
                                    </span>

                                </div>

                            </div>

                            <label class="aura-notification-read-control">

                                <span>
                                    Marcar como lida
                                </span>

                                <input
                                    type="checkbox"
                                    ${lida ? "checked" : ""}
                                    onchange="marcarNotificacaoLida('${n.id}', this.checked)"
                                >

                                <span class="aura-notification-switch-track">
                                    <span></span>
                                </span>

                            </label>

                        </div>
                    `;

                }).join("");
            } catch (err) {
                console.error("Erro notificações:", err);
            }
        }

function atualizarBadgeNotificacoes() {

            const total =
                _cacheNotificacoes.length;

            const naoLidas =
                _cacheNotificacoes.filter(n =>
                    !(n.lidoPor || []).includes(obterAuthUidAtual())
                ).length;

            const lidas =
                total - naoLidas;

            const totalElemento =
                document.getElementById("notif-total-count");

            const naoLidasElemento =
                document.getElementById("notif-unread-count");

            const lidasElemento =
                document.getElementById("notif-read-count");

            if (totalElemento) {
                totalElemento.innerText = total;
            }

            if (naoLidasElemento) {
                naoLidasElemento.innerText = naoLidas;
            }

            if (lidasElemento) {
                lidasElemento.innerText = lidas;
            }

            const badge =
                document.getElementById("badge-notif-count");

            if (!badge) return;

            if (naoLidas > 0) {

                badge.innerText =
                    naoLidas > 99 ? "99+" : naoLidas;

                badge.classList.remove("hidden");
                badge.classList.add("flex");

            } else {

                badge.classList.add("hidden");
                badge.classList.remove("flex");

            }
        }

        window.marcarNotificacaoLida = async function(id, lida) {
            try {
                const notif = _cacheNotificacoes.find(n => n.id === id);
                if (!podeMarcarNotificacaoComoLida(notif)) return;
                const authUidLeitor = obterAuthUidAtual();
                if (!authUidLeitor) return;
                let lidoPor = Array.isArray(notif.lidoPor) ? [...notif.lidoPor] : [];
                if (lida && !lidoPor.includes(authUidLeitor)) lidoPor.push(authUidLeitor);
                if (!lida) lidoPor = lidoPor.filter(uid => uid !== authUidLeitor);

                await VideFunctions.markNotificationRead({ id, read: lida });
                notif.lidoPor = lidoPor;
                atualizarBadgeNotificacoes();
                carregarNotificacoes();
                renderizarListaNotifModal();
            } catch (err) {
                console.error(err);
                showToast("Erro ao atualizar notificação.", "error");
            }
        };

        // =============================================
        // SERVIÇO DE PERSONALIZAÇÃO PREMIUM
        // =============================================
const STATUS_PERSONALIZACAO_LABEL = {

            pendente: {
                texto: "Sua solicitação está na fila e será analisada pela nossa equipe.",
                label: "Pendente",
                state: "pending",
                icone: `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <circle cx="12" cy="12" r="9"></circle>
                        <path d="M12 7v5l3 2"></path>
                    </svg>
                `
            },

            em_andamento: {
                texto: "Nossa equipe está trabalhando nas configurações solicitadas.",
                label: "Em andamento",
                state: "progress",
                icone: `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M14.7 6.3a4 4 0 0 0-5 5L4 17v3h3l5.7-5.7a4 4 0 0 0 5-5l-3 3-3-3 3-3Z"></path>
                    </svg>
                `
            },

            concluido: {
                texto: "A personalização foi concluída. Confira as alterações realizadas na sua loja.",
                label: "Concluído",
                state: "completed",
                icone: `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <circle cx="12" cy="12" r="9"></circle>
                        <path d="m8 12 2.5 2.5L16 9"></path>
                    </svg>
                `
            },

            negado: {
                texto: "Não foi possível prosseguir com esta solicitação.",
                label: "Não aprovado",
                state: "rejected",
                icone: `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <circle cx="12" cy="12" r="9"></circle>
                        <path d="m9 9 6 6"></path>
                        <path d="m15 9-6 6"></path>
                    </svg>
                `
            }

        };

        async function carregarStatusPersonalizacao() {

            if (!usuarioUID) return;

            const statusBox =
                document.getElementById("personalizacao-status-box");

            const formBox =
                document.getElementById("personalizacao-form-box");

            const historicoBox =
                document.getElementById("personalizacao-historico-box");

            const historicoLista =
                document.getElementById("personalizacao-historico-lista");

            try {

                const snap = await getDocs(
                    query(
                        collection(db, "solicitacoes_customizacao"),
                        where("uid", "==", usuarioUID)
                    )
                );

                let pedidos = [];

                snap.forEach(d => {
                    pedidos.push({
                        id: d.id,
                        ...d.data()
                    });
                });

                pedidos.sort(
                    (a, b) =>
                        (b.criadoEm || 0) -
                        (a.criadoEm || 0)
                );

                const ativo = pedidos.find(
                    p =>
                        p.status === "pendente" ||
                        p.status === "em_andamento"
                );

                if (ativo) {

                    const info =
                        STATUS_PERSONALIZACAO_LABEL[ativo.status] ||
                        STATUS_PERSONALIZACAO_LABEL.pendente;

                    statusBox.dataset.state = info.state;

                    statusBox.innerHTML = `

                        <span class="aura-customization-status-icon">
                            ${info.icone}
                        </span>

                        <div class="aura-customization-status-content">

                            <span class="aura-customization-status-eyebrow">
                                Acompanhamento da solicitação
                            </span>

                            <h3>
                                Serviço ${info.label.toLowerCase()}
                            </h3>

                            <p>
                                ${info.texto}
                            </p>

                            <div class="aura-customization-status-description">

                                <small>Descrição enviada</small>

                                <span>
                                    ${ativo.descricao}
                                </span>

                            </div>

                        </div>

                        <span class="aura-customization-status-badge">

                            <i></i>

                            ${info.label}

                        </span>

                    `;

                    statusBox.classList.remove("hidden");
                    formBox.classList.add("hidden");

                } else {

                    statusBox.classList.add("hidden");
                    formBox.classList.remove("hidden");

                    delete statusBox.dataset.state;

                }

                if (pedidos.length > 0) {

                    historicoBox.classList.remove("hidden");

                    historicoLista.innerHTML =
                        pedidos.map(p => {

                            const info =
                                STATUS_PERSONALIZACAO_LABEL[p.status] ||
                                STATUS_PERSONALIZACAO_LABEL.pendente;

                            const dataFormatada =
                                p.criadoEm
                                    ? new Date(p.criadoEm).toLocaleString("pt-BR")
                                    : "Data não informada";

                            return `

                                <div class="aura-customization-history-item"
                                     data-state="${info.state}">

                                    <span class="aura-customization-history-icon">
                                        ${info.icone}
                                    </span>

                                    <div class="aura-customization-history-content">

                                        <p>
                                            ${p.descricao}
                                        </p>

                                        <span>

                                            <svg viewBox="0 0 24 24"
                                                 fill="none"
                                                 stroke="currentColor">

                                                <circle cx="12" cy="12" r="9"></circle>
                                                <path d="M12 7v5l3 2"></path>

                                            </svg>

                                            ${dataFormatada}

                                        </span>

                                    </div>

                                    <span class="aura-customization-history-status">

                                        <i></i>

                                        ${info.label}

                                    </span>

                                </div>

                            `;

                        }).join("");

                } else {

                    historicoBox.classList.add("hidden");
                    historicoLista.innerHTML = "";

                }

            } catch (err) {

                console.error(err);

            }

        }

        window.enviarSolicitacaoPersonalizacao = async function() {
            if (!exigirEdicaoModulo("configuracoes")) return;

            const descricao = document.getElementById("personalizacao-descricao").value.trim();
            const whatsapp = document.getElementById("personalizacao-whatsapp").value.trim();
            if (!descricao) {
                showToast("Conta pra gente o que você precisa.", "error");
                return;
            }
            if (!whatsapp || whatsapp.length < 10) {
                showToast("Informe um WhatsApp válido, com DDD.", "error");
                return;
            }
            try {
                await setDoc(doc(db, "solicitacoes_customizacao", `custom_${Date.now()}`), {
                    uid: usuarioUID,
                    email: usuarioEmail,
                    descricao,
                    whatsapp,
                    status: "pendente",
                    criadoEm: Date.now()
                });
                showToast("Solicitação enviada! Vamos entrar em contato em breve.");
                document.getElementById("personalizacao-descricao").value = "";
                document.getElementById("personalizacao-whatsapp").value = "";
                await carregarStatusPersonalizacao();
            } catch (err) {
                console.error(err);
                showToast("Erro ao enviar solicitação.", "error");
            }
        };

        // =============================================
        // MODAL CENTRAL DE NOTIFICAÇÕES (aberto pelo sino)
        // =============================================
        window.abrirNotifModal = async function() {
            await carregarNotificacoes(); // garante que o cache está atualizado
            document.getElementById("notif-modal-detalhe-view").classList.add("hidden");
            document.getElementById("notif-modal-lista-view").classList.remove("hidden");
            renderizarListaNotifModal();
            document.getElementById("notif-modal").classList.remove("hidden");
        };

        window.fecharNotifModal = function() {
            document.getElementById("notif-modal").classList.add("hidden");
        };

        function renderizarListaNotifModal() {
            const box = document.getElementById("notif-modal-lista");
            if (!box) return;
            if (_cacheNotificacoes.length === 0) {
                box.innerHTML = `<p class="text-xs text-gray-500 text-center py-8">Nenhuma notificação por aqui ainda.</p>`;
                return;
            }
            box.innerHTML = _cacheNotificacoes.map(n => {
                const lida = (n.lidoPor || []).includes(usuarioUID);
                return `
                    <button onclick="abrirDetalheNotifModal('${n.id}')" class="w-full text-left flex gap-3 items-start p-3 rounded-xl border border-white/5 hover:border-white/20 hover:bg-white/[0.03] transition-all ${lida ? "opacity-60" : ""}">
${n.foto ? `<img src="${n.foto}" class="h-11 w-11 rounded-lg object-cover shrink-0 border border-white/10">` : `
                            <div class="aura-notification-modal-icon">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                    <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"></path>
                                    <path d="M10 21h4"></path>
                                </svg>
                            </div>
                        `}
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2">
                                <p class="text-xs font-bold text-white truncate">${n.titulo}</p>
                                ${!lida ? `<span class="h-1.5 w-1.5 rounded-full bg-[#00f2fe] shrink-0"></span>` : ""}
                            </div>
                            <p class="text-[11px] text-gray-500 mt-0.5 line-clamp-1">${n.mensagem}</p>
                        </div>
                    </button>
                `;
            }).join("");
        }

        window.abrirDetalheNotifModal = function(id) {
            const n = _cacheNotificacoes.find(x => x.id === id);
            if (!n) return;
            const jaEstavaLida = (n.lidoPor || []).includes(usuarioUID);

            document.getElementById("notif-modal-detalhe-conteudo").innerHTML = `
                ${n.foto ? `<img src="${n.foto}" class="w-full max-h-64 object-cover rounded-xl mb-4 border border-white/10">` : ""}
                <h3 class="text-lg font-black text-white">${n.titulo}</h3>
                <p class="text-[11px] text-gray-600 mt-1">${n.criadoEm ? new Date(n.criadoEm).toLocaleString("pt-BR") : "—"}</p>
                <p class="text-sm text-gray-300 mt-4 leading-relaxed whitespace-pre-line">${n.mensagem}</p>
                <label class="flex items-center gap-2 mt-6 cursor-pointer text-xs text-gray-400">
                    <input type="checkbox" checked onchange="marcarNotificacaoLida('${n.id}', this.checked)" class="accent-[#00f2fe]">
                    Marcar como lida
                </label>
            `;

            document.getElementById("notif-modal-lista-view").classList.add("hidden");
            document.getElementById("notif-modal-detalhe-view").classList.remove("hidden");

            // Abrir o detalhe já marca como lida automaticamente (o checkbox permite desmarcar depois)
            if (!jaEstavaLida) marcarNotificacaoLida(id, true);
        };

        window.voltarListaNotifModal = function() {
            document.getElementById("notif-modal-detalhe-view").classList.add("hidden");
            document.getElementById("notif-modal-lista-view").classList.remove("hidden");
            renderizarListaNotifModal();
        };
        window.exportarLeadsCSV = function() {
            const rows = [["Nome","Email","WhatsApp","Origem","Cliques","Tempo","Interesse","Status","Data","Anotação"]];
            document.querySelectorAll("#leads-table-body tr").forEach(tr => {
                const cols = tr.querySelectorAll("td");
                if (cols.length < 9) return;
                const status = cols[7].querySelector("select")?.value || "";
                const anotacao = cols[9]?.querySelector("input")?.value || "";
                rows.push([
                    cols[0].innerText.trim(),
                    cols[1].innerText.trim(),
                    cols[2].innerText.trim(),
                    cols[3].innerText.trim(),
                    cols[4].innerText.trim(),
                    cols[5].innerText.trim(),
                    cols[6].innerText.trim(),
                    status,
                    cols[8].innerText.trim(),
                    anotacao
                ]);
            });
            const csv = rows.map(r => r.map(v => `"${v}"`).join(";")).join("\n");
            const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `leads_videhub_${new Date().toISOString().slice(0,10)}.csv`;
            a.click();
            showToast("Planilha exportada com sucesso!");
        };
        window.aplicarFiltrosLeads = async function(mostrarToast = true) {
    const filtro = obterFiltroSelecionado("filtro-lead-dias", "filtro-lead-de", "filtro-lead-ate");
    const status = document.getElementById("filtro-lead-status").value;
    const origem = document.getElementById("filtro-lead-origem").value;
    const busca = document.getElementById("busca-lead")?.value.toLowerCase() || "";
    await carregarLeads(filtro, status, origem, busca);
    if (mostrarToast) {
        const total = document.getElementById("lead-total-count")?.innerText || "0";
        showToast(`Filtro aplicado! ${total} lead(s) encontrado(s).`);
    }
};

        // =============================================
        // AUTOMAÇÃO DE LEADS (filtros avançados + ações em massa)
        // =============================================
        let _cacheAutomacaoLeads = [];
        let _selecionadosAutomacaoLeads = new Set();

        let _modoLixeira = false;

        async function carregarAutomacaoLeads() {
            if (!usuarioUID) return;
            try {
                const snap = await getDocs(query(collection(db, "leads"), where("criadoPor", "==", usuarioUID)));
                _cacheAutomacaoLeads = [];
                snap.forEach(d => _cacheAutomacaoLeads.push({ id: d.id, ...d.data() }));

                const produtosUnicos = [...new Set(_cacheAutomacaoLeads.map(l => l.produtoInteresse).filter(Boolean))];
                const selectProduto = document.getElementById("auto-lead-produto");
                if (selectProduto) {
                    selectProduto.innerHTML = `<option value="todos">Todos</option>` + produtosUnicos.map(p => `<option value="${p}">${p}</option>`).join("");
                }

                try {
                    const snapFunc = await getDocs(query(collection(db, "funcionarios"), where("donoUID", "==", usuarioUID)));
                    let funcionarios = [];
                    snapFunc.forEach(d => funcionarios.push({ id: d.id, ...d.data() }));
                    const selectFunc = document.getElementById("auto-lead-funcionario-atribuir");
                    if (selectFunc) {
                        selectFunc.innerHTML = `<option value="">Ninguém</option>` + funcionarios.map(f => `<option value="${f.id}">${f.nome}</option>`).join("");
                    }
                } catch (e) { /* não é crítico, ignora silenciosamente */ }

                if (_modoLixeira) {
                    const lixeira = _cacheAutomacaoLeads.filter(l => l.lixeira);
                    renderizarTabelaAutomacaoLeads(lixeira);
                    _selecionadosAutomacaoLeads.clear();
                    atualizarBarraAcoesAutomacao();
                } else {
                    aplicarFiltroAutomacaoLeads(false);
                }
            } catch (err) {
                console.error(err);
            }
        }

        window.alternarModoLixeira = function() {
            _modoLixeira = !_modoLixeira;
            const btn = document.getElementById("btn-toggle-lixeira");
            _selecionadosAutomacaoLeads.clear();
            if (_modoLixeira) {
                btn.classList.add("bg-red-500/10", "border-red-500/20", "text-red-400");
                btn.innerText = "← Voltar pra lista";
            } else {
                btn.classList.remove("bg-red-500/10", "border-red-500/20", "text-red-400");
                btn.innerText = "🗑️ Ver Lixeira";
            }
            carregarAutomacaoLeads();
        };

        window.aplicarFiltroAutomacaoLeads = function(mostrarToast = true) {
            if (_modoLixeira) {
                const lixeira = _cacheAutomacaoLeads.filter(l => l.lixeira);
                renderizarTabelaAutomacaoLeads(lixeira);
                return;
            }
            const filtroData = obterFiltroSelecionado("auto-lead-dias", "auto-lead-de", "auto-lead-ate");
            const { inicio, fim, todos } = normalizarIntervalo(filtroData);
            const origem = document.getElementById("auto-lead-origem").value;
            const status = document.getElementById("auto-lead-status").value;
            const produto = document.getElementById("auto-lead-produto").value;
            const whatsappFiltro = document.getElementById("auto-lead-whatsapp").value;
            const emailFiltro = document.getElementById("auto-lead-email").value;
            const anotacaoFiltro = document.getElementById("auto-lead-anotacao").value;
            const tempoMin = parseInt(document.getElementById("auto-lead-tempo-min").value) || 0;
            const cliquesMin = parseInt(document.getElementById("auto-lead-cliques-min").value) || 0;
            const busca = document.getElementById("auto-lead-busca").value.trim().toLowerCase();
            const incluirArquivados = document.getElementById("auto-lead-incluir-arquivados").checked;

            let filtrados = _cacheAutomacaoLeads.filter(l => {
                if (l.lixeira) return false;
                if (!incluirArquivados && l.arquivado) return false;
                const dataLead = l.data || Date.now();
                if (!todos && (dataLead < inicio || dataLead > fim)) return false;
                if (origem !== "todos" && (l.origem || "direto") !== origem) return false;
                if (status !== "todos" && (l.statusLead || "novo") !== status) return false;
                if (produto !== "todos" && l.produtoInteresse !== produto) return false;
                if (whatsappFiltro === "com" && !l.whatsapp) return false;
                if (whatsappFiltro === "sem" && l.whatsapp) return false;
                if (emailFiltro === "com" && !l.email) return false;
                if (emailFiltro === "sem" && l.email) return false;
                if (anotacaoFiltro === "com" && !l.anotacao) return false;
                if (anotacaoFiltro === "sem" && l.anotacao) return false;
                if ((l.tempoRetencao || 0) < tempoMin) return false;
                if ((l.cliques || 0) < cliquesMin) return false;
                if (busca) {
                    const alvo = `${l.nome || ""} ${l.whatsapp || ""} ${l.anotacao || ""}`.toLowerCase();
                    if (!alvo.includes(busca)) return false;
                }
                return true;
            });

            filtrados.sort((a, b) => (b.data || 0) - (a.data || 0));
            _selecionadosAutomacaoLeads.clear();
            renderizarTabelaAutomacaoLeads(filtrados);
            atualizarBarraAcoesAutomacao();
            if (mostrarToast) showToast(`Filtro aplicado! ${filtrados.length} lead(s) encontrado(s).`);
        };

        function renderizarTabelaAutomacaoLeads(lista) {
            const tbody = document.getElementById("auto-lead-table-body");
            const selecionarTodos = document.getElementById("auto-lead-selecionar-todos");

            if (selecionarTodos) selecionarTodos.checked = false;

            if (lista.length === 0) {
                tbody.innerHTML = `<tr><td colspan="10" class="aura-automation-empty-cell">${_modoLixeira ? "Lixeira vazia." : "Nenhum lead encontrado com esses filtros."}</td></tr>`;
                return;
            }

            const statusClasses = {
                novo: "aura-lead-status-new",
                contato: "aura-lead-status-contact",
                convertido: "aura-lead-status-converted",
                perdido: "aura-lead-status-lost"
            };

            tbody.innerHTML = lista.map(l => `
                <tr class="aura-automation-row ${l.arquivado ? "aura-automation-row-archived" : ""}">
                    <td class="aura-automation-select-column">
                        <label class="aura-table-checkbox">
                            <input type="checkbox" class="auto-lead-checkbox" data-id="${l.id}">
                            <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m5 12 4 4L19 6"></path></svg></span>
                        </label>
                    </td>
                    <td>
                        <div class="aura-lead-person">
                            <span class="aura-lead-avatar">${(l.nome || "A").trim().charAt(0).toUpperCase()}</span>
                            <div>
                                <strong>${l.nome || "Anônimo"}</strong>
                                <small>${l.arquivado ? "Arquivado" : "Lead ativo"}</small>
                            </div>
                            ${l.etiqueta ? `<span class="aura-lead-tag">${l.etiqueta}</span>` : ""}
                        </div>
                    </td>
                    <td><span class="aura-lead-email">${l.email || "—"}</span></td>
                    <td><span class="aura-lead-whatsapp">${l.whatsapp || "—"}</span></td>
                    <td><span class="aura-lead-origin">${l.origem || "direto"}</span></td>
                    <td><span class="aura-lead-interest" title="${l.produtoInteresse || ""}">${l.produtoInteresse || "—"}</span></td>
                    <td class="text-center"><span class="aura-lead-number">${l.cliques || 0}</span></td>
                    <td><span class="aura-lead-time">${l.tempoRetencao || 0}s</span></td>
                    <td><span class="aura-lead-status ${statusClasses[l.statusLead || "novo"]}">${l.statusLead || "novo"}</span></td>
                    <td><span class="aura-lead-date">${l.data ? new Date(l.data).toLocaleDateString("pt-BR") : "—"}</span></td>
                </tr>
            `).join("");

            document.querySelectorAll(".auto-lead-checkbox").forEach(cb => {
                cb.addEventListener("change", () => {
                    const id = cb.getAttribute("data-id");
                    if (cb.checked) _selecionadosAutomacaoLeads.add(id);
                    else _selecionadosAutomacaoLeads.delete(id);
                    atualizarBarraAcoesAutomacao();
                });
            });
        }

        function atualizarBarraAcoesAutomacao() {
            const barraNormal = document.getElementById("auto-lead-barra-acoes");
            const barraLixeira = document.getElementById("auto-lead-barra-lixeira");
            const total = _selecionadosAutomacaoLeads.size;
            if (_modoLixeira) {
                const contadorLixeira = document.getElementById("auto-lead-contador-lixeira");
                if (contadorLixeira) contadorLixeira.innerText = total;
                if (barraLixeira) barraLixeira.classList.toggle("hidden", total === 0);
                if (barraNormal) barraNormal.classList.add("hidden");
            } else {
                const contador = document.getElementById("auto-lead-contador-selecionados");
                if (contador) contador.innerText = total;
                if (barraNormal) barraNormal.classList.toggle("hidden", total === 0);
                if (barraLixeira) barraLixeira.classList.add("hidden");
            }
        }

        const btnSelecionarTodosAuto = document.getElementById("auto-lead-selecionar-todos");
        if (btnSelecionarTodosAuto) {
            btnSelecionarTodosAuto.addEventListener("change", (e) => {
                document.querySelectorAll(".auto-lead-checkbox").forEach(cb => {
                    cb.checked = e.target.checked;
                    const id = cb.getAttribute("data-id");
                    if (e.target.checked) _selecionadosAutomacaoLeads.add(id);
                    else _selecionadosAutomacaoLeads.delete(id);
                });
                atualizarBarraAcoesAutomacao();
            });
        }

        window.aplicarStatusEmMassa = async function() {
            if (!exigirEdicaoModulo("leads")) return;

            const novoStatus = document.getElementById("auto-lead-novo-status").value;
            const ids = Array.from(_selecionadosAutomacaoLeads);
            if (ids.length === 0) return;
            abrirConfirmacao(`Mudar o status de ${ids.length} lead(s) pra "${novoStatus}"?`, async () => {
                if (!exigirEdicaoModulo("leads")) return;

                try {
                    await Promise.all(ids.map(id => setDoc(doc(db, "leads", id), { statusLead: novoStatus }, { merge: true })));
                    showToast(`${ids.length} lead(s) atualizados!`);
                    carregarAutomacaoLeads();
                } catch (err) {
                    console.error(err);
                    showToast("Erro ao atualizar em massa.", "error");
                }
            });
        };

        window.aplicarAnotacaoEmMassa = async function() {
            if (!exigirEdicaoModulo("leads")) return;

            const texto = document.getElementById("auto-lead-anotacao-massa").value.trim();
            const ids = Array.from(_selecionadosAutomacaoLeads);
            if (!texto || ids.length === 0) {
                showToast("Digite uma anotação e selecione ao menos um lead.", "error");
                return;
            }
            try {
                await Promise.all(ids.map(id => setDoc(doc(db, "leads", id), { anotacao: texto }, { merge: true })));
                showToast(`Anotação aplicada em ${ids.length} lead(s)!`);
                document.getElementById("auto-lead-anotacao-massa").value = "";
                carregarAutomacaoLeads();
            } catch (err) {
                console.error(err);
                showToast("Erro ao anotar em massa.", "error");
            }
        };

        window.arquivarSelecionados = async function() {
            if (!exigirEdicaoModulo("leads")) return;

            const ids = Array.from(_selecionadosAutomacaoLeads);
            if (ids.length === 0) return;
            abrirConfirmacao(`Arquivar ${ids.length} lead(s)? Eles somem da lista principal, mas não são apagados.`, async () => {
                if (!exigirEdicaoModulo("leads")) return;

                try {
                    await Promise.all(ids.map(id => setDoc(doc(db, "leads", id), { arquivado: true }, { merge: true })));
                    showToast(`${ids.length} lead(s) arquivados!`);
                    carregarAutomacaoLeads();
                } catch (err) {
                    console.error(err);
                    showToast("Erro ao arquivar.", "error");
                }
            });
        };

        window.aplicarOrigemEmMassa = async function() {
            if (!exigirEdicaoModulo("leads")) return;

            const novaOrigem = document.getElementById("auto-lead-nova-origem").value;
            const ids = Array.from(_selecionadosAutomacaoLeads);
            if (ids.length === 0) return;
            abrirConfirmacao(`Trocar a origem de ${ids.length} lead(s) pra "${novaOrigem}"?`, async () => {
                if (!exigirEdicaoModulo("leads")) return;

                try {
                    await Promise.all(ids.map(id => setDoc(doc(db, "leads", id), { origem: novaOrigem }, { merge: true })));
                    showToast(`Origem atualizada em ${ids.length} lead(s)!`);
                    carregarAutomacaoLeads();
                } catch (err) {
                    console.error(err);
                    showToast("Erro ao trocar origem.", "error");
                }
            });
        };

        window.aplicarInteresseEmMassa = async function() {
            if (!exigirEdicaoModulo("leads")) return;

            const novoInteresse = document.getElementById("auto-lead-novo-interesse").value.trim();
            const ids = Array.from(_selecionadosAutomacaoLeads);
            if (!novoInteresse || ids.length === 0) {
                showToast("Digite o novo interesse e selecione ao menos um lead.", "error");
                return;
            }
            try {
                await Promise.all(ids.map(id => setDoc(doc(db, "leads", id), { produtoInteresse: novoInteresse }, { merge: true })));
                showToast(`Interesse atualizado em ${ids.length} lead(s)!`);
                document.getElementById("auto-lead-novo-interesse").value = "";
                carregarAutomacaoLeads();
            } catch (err) {
                console.error(err);
                showToast("Erro ao trocar interesse.", "error");
            }
        };

        window.aplicarFuncionarioEmMassa = async function() {
            if (!exigirEdicaoModulo("leads")) return;

            const funcUID = document.getElementById("auto-lead-funcionario-atribuir").value;
            const ids = Array.from(_selecionadosAutomacaoLeads);
            if (ids.length === 0) return;
            try {
                await Promise.all(ids.map(id => setDoc(doc(db, "leads", id), { funcionarioResponsavel: funcUID || null }, { merge: true })));
                showToast(`${ids.length} lead(s) atribuído(s)!`);
                carregarAutomacaoLeads();
            } catch (err) {
                console.error(err);
                showToast("Erro ao atribuir.", "error");
            }
        };

        window.aplicarEtiquetaEmMassa = async function() {
            if (!exigirEdicaoModulo("leads")) return;

            const etiqueta = document.getElementById("auto-lead-etiqueta-massa").value.trim();
            const ids = Array.from(_selecionadosAutomacaoLeads);
            if (!etiqueta || ids.length === 0) {
                showToast("Digite uma etiqueta e selecione ao menos um lead.", "error");
                return;
            }
            try {
                await Promise.all(ids.map(id => setDoc(doc(db, "leads", id), { etiqueta }, { merge: true })));
                showToast(`Etiqueta aplicada em ${ids.length} lead(s)!`);
                document.getElementById("auto-lead-etiqueta-massa").value = "";
                carregarAutomacaoLeads();
            } catch (err) {
                console.error(err);
                showToast("Erro ao etiquetar.", "error");
            }
        };

        window.aplicarLembreteEmMassa = async function() {
            if (!exigirEdicaoModulo("leads")) return;

            const dataLembrete = document.getElementById("auto-lead-lembrete-massa").value;
            const ids = Array.from(_selecionadosAutomacaoLeads);
            if (!dataLembrete || ids.length === 0) {
                showToast("Escolha uma data e selecione ao menos um lead.", "error");
                return;
            }
            try {
                await Promise.all(ids.map(id => setDoc(doc(db, "leads", id), { lembreteData: dataLembrete }, { merge: true })));
                showToast(`Lembrete definido em ${ids.length} lead(s)!`);
                carregarAutomacaoLeads();
            } catch (err) {
                console.error(err);
                showToast("Erro ao definir lembrete.", "error");
            }
        };

        window.copiarWhatsappsSelecionados = function() {
            const ids = Array.from(_selecionadosAutomacaoLeads);
            if (ids.length === 0) return;
            const whatsapps = _cacheAutomacaoLeads.filter(l => ids.includes(l.id)).map(l => l.whatsapp).filter(Boolean);
            if (whatsapps.length === 0) {
                showToast("Nenhum dos selecionados tem WhatsApp cadastrado.", "error");
                return;
            }
            navigator.clipboard.writeText(whatsapps.join("\n")).then(() => showToast(`${whatsapps.length} número(s) copiado(s)!`));
        };

        window.desarquivarSelecionados = async function() {
            if (!exigirEdicaoModulo("leads")) return;

            const ids = Array.from(_selecionadosAutomacaoLeads);
            if (ids.length === 0) return;
            try {
                await Promise.all(ids.map(id => setDoc(doc(db, "leads", id), { arquivado: false }, { merge: true })));
                showToast(`${ids.length} lead(s) desarquivados!`);
                carregarAutomacaoLeads();
            } catch (err) {
                console.error(err);
                showToast("Erro ao desarquivar.", "error");
            }
        };

        window.moverParaLixeiraSelecionados = async function() {
            if (!exigirEdicaoModulo("leads")) return;

            const ids = Array.from(_selecionadosAutomacaoLeads);
            if (ids.length === 0) return;
            abrirConfirmacao(`Mover ${ids.length} lead(s) pra lixeira? Dá pra restaurar depois, mas eles somem de todas as listas normais.`, async () => {
                if (!exigirEdicaoModulo("leads")) return;

                try {
                    await Promise.all(ids.map(id => setDoc(doc(db, "leads", id), { lixeira: true }, { merge: true })));
                    showToast(`${ids.length} lead(s) movidos pra lixeira.`);
                    carregarAutomacaoLeads();
                } catch (err) {
                    console.error(err);
                    showToast("Erro ao mover pra lixeira.", "error");
                }
            });
        };

        window.restaurarDaLixeira = async function() {
            if (!exigirEdicaoModulo("leads")) return;

            const ids = Array.from(_selecionadosAutomacaoLeads);
            if (ids.length === 0) return;
            try {
                await Promise.all(ids.map(id => setDoc(doc(db, "leads", id), { lixeira: false }, { merge: true })));
                showToast(`${ids.length} lead(s) restaurados!`);
                carregarAutomacaoLeads();
            } catch (err) {
                console.error(err);
                showToast("Erro ao restaurar.", "error");
            }
        };

        window.excluirPermanentemente = async function() {
            if (!exigirEdicaoModulo("leads")) return;

            const ids = Array.from(_selecionadosAutomacaoLeads);
            if (ids.length === 0) return;
            abrirConfirmacao(`Excluir ${ids.length} lead(s) PERMANENTEMENTE? Essa ação não pode ser desfeita.`, async () => {
                if (!exigirEdicaoModulo("leads")) return;

                try {
                    await Promise.all(ids.map(id => deleteDoc(doc(db, "leads", id))));
                    showToast(`${ids.length} lead(s) excluídos permanentemente.`);
                    carregarAutomacaoLeads();
                } catch (err) {
                    console.error(err);
                    showToast("Erro ao excluir.", "error");
                }
            });
        };

        window.exportarSelecionadosCSV = function() {
            const ids = Array.from(_selecionadosAutomacaoLeads);
            if (ids.length === 0) return;
            const selecionados = _cacheAutomacaoLeads.filter(l => ids.includes(l.id));
            const rows = [["Nome","Email","WhatsApp","Origem","Interesse","Cliques","Tempo","Status","Data","Anotação"]];
            selecionados.forEach(l => {
                rows.push([
                    l.nome || "", l.email || "", l.whatsapp || "", l.origem || "", l.produtoInteresse || "",
                    l.cliques || 0, l.tempoRetencao || 0, l.statusLead || "novo",
                    l.data ? new Date(l.data).toLocaleDateString("pt-BR") : "", l.anotacao || ""
                ]);
            });
            const csv = rows.map(r => r.map(v => `"${v}"`).join(";")).join("\n");
            const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `leads_selecionados_${new Date().toISOString().slice(0,10)}.csv`;
            a.click();
            showToast("Exportado!");
        };

        // =============================================
        // FILTRO DE DATA PERSONALIZADO (reutilizado em Leads, Pedidos, Templates, Métricas, Campanhas)
        // =============================================
        function configurarFiltroPersonalizado(idSelect, idBoxDatas) {
            const select = document.getElementById(idSelect);
            const box = document.getElementById(idBoxDatas);
            if (!select || !box) return;
            select.addEventListener("change", () => {
                box.classList.toggle("hidden", select.value !== "custom");
            });
        }

        function obterFiltroSelecionado(idSelect, idDe, idAte) {
            const valor = document.getElementById(idSelect).value;
            if (valor === "custom") {
                const de = document.getElementById(idDe).value;
                const ate = document.getElementById(idAte).value;
                return {
                    inicio: de ? new Date(de + "T00:00:00").getTime() : 0,
                    fim: ate ? new Date(ate + "T23:59:59").getTime() : Date.now()
                };
            }
            return parseInt(valor);
        }

        function normalizarIntervalo(filtro) {
            const agora = Date.now();
            if (filtro && typeof filtro === "object") {
                return { inicio: filtro.inicio || 0, fim: filtro.fim || agora, todos: !filtro.inicio };
            }
            const dias = filtro;
            return { inicio: dias === 0 ? 0 : agora - (dias * 24 * 60 * 60 * 1000), fim: agora, todos: dias === 0 };
        }

        // Impede escolher a data "até" antes da data "de" (e vice-versa)
        function ligarValidacaoIntervaloDatas(idDe, idAte) {
            const inputDe = document.getElementById(idDe);
            const inputAte = document.getElementById(idAte);
            if (!inputDe || !inputAte) return;
            inputDe.addEventListener("change", () => {
                inputAte.min = inputDe.value;
                if (inputAte.value && inputAte.value < inputDe.value) inputAte.value = inputDe.value;
            });
            inputAte.addEventListener("change", () => {
                inputDe.max = inputAte.value;
                if (inputDe.value && inputDe.value > inputAte.value) inputDe.value = inputAte.value;
            });
        }

        configurarFiltroPersonalizado("filtro-lead-dias", "filtro-lead-datas-custom");
        configurarFiltroPersonalizado("filtro-pedido-dias", "filtro-pedido-datas-custom");
        configurarFiltroPersonalizado("filtro-template-dias", "filtro-template-datas-custom");
        configurarFiltroPersonalizado("filtro-metricas-dias", "filtro-metricas-datas-custom");
        configurarFiltroPersonalizado("filtro-campanha-dias", "filtro-campanha-datas-custom");
        configurarFiltroPersonalizado("auto-lead-dias", "auto-lead-datas-custom");
        ligarValidacaoIntervaloDatas("filtro-lead-de", "filtro-lead-ate");
        ligarValidacaoIntervaloDatas("filtro-pedido-de", "filtro-pedido-ate");
        ligarValidacaoIntervaloDatas("filtro-template-de", "filtro-template-ate");
        ligarValidacaoIntervaloDatas("filtro-metricas-de", "filtro-metricas-ate");
        ligarValidacaoIntervaloDatas("filtro-campanha-de", "filtro-campanha-ate");
        ligarValidacaoIntervaloDatas("auto-lead-de", "auto-lead-ate");

        function formatarDataChave(d) {
            return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
        }


function obterTimestampMetrica(registro) {
    const valores = [
        registro?.data,
        registro?.criadoEm,
        registro?.timestamp,
        registro?.createdAt
    ];
    for (const valorOriginal of valores) {
        if (!valorOriginal) continue;
        if (typeof valorOriginal.toMillis === "function") return valorOriginal.toMillis();
        if (typeof valorOriginal.seconds === "number") return valorOriginal.seconds * 1000;
        if (typeof valorOriginal === "number") {
            return valorOriginal < 100000000000 ? valorOriginal * 1000 : valorOriginal;
        }
        const convertido = new Date(valorOriginal).getTime();
        if (!Number.isNaN(convertido)) return convertido;
    }
    return 0;
}

function normalizarValorMetrica(valor) {
    if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
    const texto = String(valor || "").trim();
    if (!texto) return 0;
    if (texto.includes(",")) {
        return Number(texto.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
    }
    return Number(texto.replace(/[^\d.-]/g, "")) || 0;
}

async function carregarFunilComercialMetricas(filtroDataDias, trafego = {}) {
    const definirTexto = (id, valor) => {
        const elemento = document.getElementById(id);
        if (elemento) elemento.textContent = valor;
    };
    const definirBarra = (id, valor, maiorValor) => {
        const elemento = document.getElementById(id);
        if (!elemento) return;
        const largura = valor > 0 ? Math.max(6, Math.min(100, valor / maiorValor * 100)) : 0;
        elemento.style.width = `${largura}%`;
    };
    const formatarMoeda = valor => Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const formatarTaxa = (origem, destino) => origem ? Number((destino / origem * 100).toFixed(1)) : 0;

    try {
        const intervalo = normalizarIntervalo(filtroDataDias);
        const [leadsSnapshot, pedidosSnapshot] = await Promise.all([
            getDocs(query(collection(db, "leads"), where("criadoPor", "==", usuarioUID))),
            getDocs(query(collection(db, "pedidos"), where("criadoPor", "==", usuarioUID)))
        ]);
        const leadsTodos = [];
        const pedidosTodos = [];
        leadsSnapshot.forEach(documento => leadsTodos.push({ id: documento.id, ...documento.data() }));
        pedidosSnapshot.forEach(documento => pedidosTodos.push({ id: documento.id, ...documento.data() }));
        const pertenceAoPeriodo = registro => {
            const timestamp = obterTimestampMetrica(registro);
            if (intervalo.todos) return true;
            if (!timestamp) return false;
            return timestamp >= intervalo.inicio && timestamp <= intervalo.fim;
        };
        const leads = leadsTodos.filter(pertenceAoPeriodo);
        const pedidos = pedidosTodos.filter(pertenceAoPeriodo);
        const convertidos = leads.filter(lead => String(lead.statusLead || lead.status || "").toLowerCase() === "convertido");
        const pedidosPagos = pedidos.filter(pedido => String(pedido.status || "").toLowerCase() === "pago");
        const receita = pedidosPagos.reduce((total, pedido) => total + normalizarValorMetrica(pedido.valor), 0);
        const sessoes = Number(trafego.sessoes || 0);
        const cliques = Number(trafego.cliques || 0);
        const totalLeads = leads.length;
        const totalConvertidos = convertidos.length;
        const totalPagos = pedidosPagos.length;
        const taxaSessaoClique = formatarTaxa(sessoes, cliques);
        const taxaCliqueLead = formatarTaxa(cliques, totalLeads);
        const taxaLeadConversao = formatarTaxa(totalLeads, totalConvertidos);
        const taxaConversaoPedido = formatarTaxa(totalConvertidos, totalPagos);
        const ticketMedio = totalPagos > 0 ? receita / totalPagos : 0;
        const origens = {};
        leads.forEach(lead => {
            const origem = String(lead.origem || lead.utm_source || "Direto").trim() || "Direto";
            origens[origem] = (origens[origem] || 0) + 1;
        });
        const origemPrincipal = Object.entries(origens).sort((a, b) => b[1] - a[1])[0] || null;

        definirTexto("met-funil-sessoes", sessoes.toLocaleString("pt-BR"));
        definirTexto("met-funil-cliques", cliques.toLocaleString("pt-BR"));
        definirTexto("met-funil-leads", totalLeads.toLocaleString("pt-BR"));
        definirTexto("met-funil-convertidos", totalConvertidos.toLocaleString("pt-BR"));
        definirTexto("met-funil-pagos", totalPagos.toLocaleString("pt-BR"));
        definirTexto("met-taxa-sessao-clique", `${taxaSessaoClique}% das sessões`);
        definirTexto("met-taxa-clique-lead", `${taxaCliqueLead}% dos cliques`);
        definirTexto("met-taxa-lead-conversao", `${taxaLeadConversao}% dos leads`);
        definirTexto("met-taxa-conversao-pedido", `${taxaConversaoPedido}% dos convertidos`);
        definirTexto("met-receita-periodo", formatarMoeda(receita));
        definirTexto("met-ticket-medio", formatarMoeda(ticketMedio));
        definirTexto("met-origem-principal", origemPrincipal ? origemPrincipal[0] : "Sem dados");
        definirTexto("met-origem-principal-total", origemPrincipal ? `${origemPrincipal[1]} lead(s) no período` : "Nenhum lead identificado");

        const valoresFunil = [sessoes, cliques, totalLeads, totalConvertidos, totalPagos];
        const maiorValor = Math.max(1, ...valoresFunil);
        definirBarra("met-funil-bar-sessoes", sessoes, maiorValor);
        definirBarra("met-funil-bar-cliques", cliques, maiorValor);
        definirBarra("met-funil-bar-leads", totalLeads, maiorValor);
        definirBarra("met-funil-bar-convertidos", totalConvertidos, maiorValor);
        definirBarra("met-funil-bar-pagos", totalPagos, maiorValor);

        let insightEstado = "neutral";
        let insightTitulo = "Funil aguardando movimentação";
        let insightTexto = "Assim que sua loja receber tráfego, o sistema identificará o principal ponto de melhoria.";
        if (sessoes > 0) {
            if (taxaSessaoClique < 10) {
                insightEstado = "warning";
                insightTitulo = "Poucos visitantes estão clicando";
                insightTexto = "Revise as imagens, preços, títulos e chamadas dos produtos para gerar mais interesse.";
            } else if (cliques > 0 && taxaCliqueLead < 10) {
                insightEstado = "warning";
                insightTitulo = "A captura de contatos pode melhorar";
                insightTexto = "Fortaleça os formulários, chamadas para WhatsApp e benefícios apresentados na vitrine.";
            } else if (totalLeads > 0 && taxaLeadConversao < 20) {
                insightEstado = "attention";
                insightTitulo = "Existem oportunidades sem conversão";
                insightTexto = "Use o Kanban, a Agenda e os fluxos de templates para acompanhar os leads com mais frequência.";
            } else if (totalConvertidos > 0 && taxaConversaoPedido < 30) {
                insightEstado = "attention";
                insightTitulo = "O fechamento dos pedidos pode avançar";
                insightTexto = "Confirme condições de pagamento e acompanhe os leads convertidos até o pedido ficar pago.";
            } else if (totalPagos > 0) {
                insightEstado = "success";
                insightTitulo = "Seu funil está gerando receita";
                insightTexto = "Continue acompanhando as principais origens e os produtos com maior intenção de compra.";
            }
        }
        const insightBox = document.getElementById("met-insight-box");
        if (insightBox) insightBox.dataset.state = insightEstado;
        definirTexto("met-insight-title", insightTitulo);
        definirTexto("met-insight-text", insightTexto);
        window._metricasComerciaisAtuais = {
            sessoes, cliques, leads: totalLeads, convertidos: totalConvertidos,
            pedidosPagos: totalPagos, receita, ticketMedio,
            origemPrincipal: origemPrincipal ? origemPrincipal[0] : "Sem dados",
            taxaSessaoClique, taxaCliqueLead, taxaLeadConversao, taxaConversaoPedido
        };
    } catch (erro) {
        console.error("Erro ao carregar funil comercial:", erro);
        definirTexto("met-insight-title", "Não foi possível montar o funil");
        definirTexto("met-insight-text", "Os indicadores gerais continuam disponíveis. Tente atualizar novamente.");
        const insightBox = document.getElementById("met-insight-box");
        if (insightBox) insightBox.dataset.state = "error";
    }
}

        async function carregarMetricas(filtroDataDias = 7) {
            if (!usuarioUID) return;
            try {
                // Busca métricas da vitrine
                const metSnap = await getDoc(doc(db, "metricas_vitrines", usuarioUID));
                const met = metSnap.exists() ? metSnap.data() : {};
                const porDia = met.porDia || {};
                const hoje = new Date();
                const chavesExistentes = Object.keys(porDia).sort();

                // Monta a lista de dias dentro do período selecionado
                let chavesFiltradas;
                if (filtroDataDias && typeof filtroDataDias === "object") {
                    const chaveDe = formatarDataChave(new Date(filtroDataDias.inicio));
                    const chaveAte = formatarDataChave(new Date(filtroDataDias.fim));
                    chavesFiltradas = chavesExistentes.filter(k => k >= chaveDe && k <= chaveAte);
                } else if (filtroDataDias === 0) {
                    chavesFiltradas = chavesExistentes;
                } else {
                    const limite = new Date(hoje);
                    limite.setDate(hoje.getDate() - (filtroDataDias - 1));
                    const limiteStr = formatarDataChave(limite);
                    chavesFiltradas = chavesExistentes.filter(k => k >= limiteStr);
                }

                let sessoes = 0, cliques = 0, tempoTotal = 0;
                chavesFiltradas.forEach(k => {
                    sessoes += porDia[k]?.sessoes || 0;
                    cliques += porDia[k]?.cliques || 0;
                    tempoTotal += porDia[k]?.tempo || 0;
                });

                // Contas antigas (antes dessa atualização) ainda não têm dado por dia salvo.
                // Nesse caso, cai de volta pro total acumulado geral pra não mostrar tudo zerado.
                const usandoFallbackAntigo = chavesExistentes.length === 0;
                if (usandoFallbackAntigo) {
                    sessoes = met.totalSessoes || 0;
                    cliques = met.totalCliques || 0;
                    tempoTotal = met.totalTempoTela || 0;
                }

                const conversao = sessoes > 0 ? ((cliques / sessoes) * 100).toFixed(1) : "0.0";
                const tempoMedio = sessoes > 0 ? Math.round(tempoTotal / sessoes) : 0;

                document.getElementById("met-sessoes").innerText = sessoes.toLocaleString("pt-BR");
                document.getElementById("met-cliques").innerText = cliques.toLocaleString("pt-BR");
                document.getElementById("met-conversao").innerText = conversao + "%";
                document.getElementById("met-tempo").innerText = tempoMedio + "s";

                await carregarFunilComercialMetricas(
                    filtroDataDias,
                    { sessoes, cliques }
                );

                // Top produtos mais vistos
                const prodSnaps = await getDocs(query(collection(db, "produtos"), where("criadoPor", "==", usuarioUID)));
                const prods = [];
                prodSnaps.forEach(d => prods.push({ id: d.id, ...d.data() }));

                // Busca visualizações de cada produto
                const prodsComViews = await Promise.all(prods.map(async p => {
                    const mSnap = await getDoc(doc(db, "metricas_produtos", p.id));
                    return { ...p, views: mSnap.exists() ? (mSnap.data().visualizacoes || 0) : 0 };
                }));

                const topViews = [...prodsComViews].sort((a, b) => b.views - a.views).slice(0, 5);
                const boxViews = document.getElementById("met-top-produtos");
                if (topViews.length === 0) {
                    boxViews.innerHTML = `<p class="text-xs text-gray-500">Nenhum dado ainda.</p>`;
                } else {
const maxViews = topViews[0].views || 1;

                    boxViews.innerHTML = topViews.map((p, i) => `
                        <div class="aura-metrics-ranking-row">

                            <div class="aura-metrics-ranking-info">

                                <span class="aura-metrics-rank">
                                    ${String(i + 1).padStart(2, "0")}
                                </span>

                                <span class="aura-metrics-product-name">
                                    ${p.nome}
                                </span>

                                <strong class="aura-metrics-product-value">
                                    ${p.views} visualizações
                                </strong>

                            </div>

                            <div class="aura-metrics-progress">

                                <span style="width: ${Math.round((p.views / maxViews) * 100)}%"></span>

                            </div>

                        </div>
                    `).join("") + `

                        <p class="aura-metrics-ranking-note">
                            Dados acumulados desde o início da operação.
                        </p>

                    `;
                }

                // Produtos mais clicados (do objeto produtosInteresse)
                const interesse = met.produtosInteresse || {};
                const topCliques = Object.entries(interesse)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5);

                const boxCliques = document.getElementById("met-produtos-clicados");
                if (topCliques.length === 0) {
                    boxCliques.innerHTML = `<p class="text-xs text-gray-500">Nenhum clique registrado ainda.</p>`;
                } else {
const maxCliques = topCliques[0][1] || 1;

                    boxCliques.innerHTML = topCliques.map(([nome, total], i) => `
                        <div class="aura-metrics-ranking-row aura-metrics-ranking-row-success">

                            <div class="aura-metrics-ranking-info">

                                <span class="aura-metrics-rank">
                                    ${String(i + 1).padStart(2, "0")}
                                </span>

                                <span class="aura-metrics-product-name">
                                    ${nome}
                                </span>

                                <strong class="aura-metrics-product-value">
                                    ${total} cliques
                                </strong>

                            </div>

                            <div class="aura-metrics-progress">

                                <span style="width: ${Math.round((total / maxCliques) * 100)}%"></span>

                            </div>

                        </div>
                    `).join("") + `

                        <p class="aura-metrics-ranking-note">
                            Dados acumulados desde o início da operação.
                        </p>

                    `;
                }

                // Gráfico de barras — agora com dados REAIS salvos por dia
                const diasSemana = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
                let listaDatasGrafico = [];
                if (filtroDataDias && typeof filtroDataDias === "object") {
                    listaDatasGrafico = chavesFiltradas.length > 0 ? chavesFiltradas : [formatarDataChave(hoje)];
                } else if (filtroDataDias === 0) {
                    listaDatasGrafico = chavesFiltradas.length > 0 ? chavesFiltradas : [formatarDataChave(hoje)];
                } else {
                    for (let i = filtroDataDias - 1; i >= 0; i--) {
                        const d = new Date(hoje);
                        d.setDate(hoje.getDate() - i);
                        listaDatasGrafico.push(formatarDataChave(d));
                    }
                }

                const labelsDias = listaDatasGrafico.map(chave => {
                    const d = new Date(chave + "T12:00:00");
                    return diasSemana[d.getDay()] + " " + String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0");
                });
                const cliquesPorDia = listaDatasGrafico.map(chave => porDia[chave]?.cliques || 0);

                const maxBarra = Math.max(...cliquesPorDia, 1);
                const grafico = document.getElementById("met-grafico-barras");
                const grafLabels = document.getElementById("met-grafico-labels");

grafico.innerHTML = cliquesPorDia.map((v) => `
                    <div class="aura-metrics-bar-column">

                        <span class="aura-metrics-bar-value">
                            ${v}
                        </span>

                        <div
                            class="aura-metrics-bar"
                            style="height: ${Math.round((v / maxBarra) * 100)}%; min-height: 3px;"
                        ></div>

                    </div>
                `).join("");

                grafLabels.innerHTML = labelsDias.map(l => `
                    <span class="aura-metrics-bar-label">
                        ${l}
                    </span>
                `).join("");

                if (usandoFallbackAntigo) {
                    document.getElementById("met-periodo").innerText = "Ainda sem histórico por dia (conta antiga)";
                } else if (listaDatasGrafico.length > 0) {
                    const primeira = new Date(listaDatasGrafico[0] + "T12:00:00");
                    document.getElementById("met-periodo").innerText =
                        `${primeira.toLocaleDateString("pt-BR")} — ${hoje.toLocaleDateString("pt-BR")}`;
                }

            } catch (err) {
                console.error("Erro métricas:", err);
            }
        }

        window.aplicarFiltroMetricas = async function() {
            const filtro = obterFiltroSelecionado("filtro-metricas-dias", "filtro-metricas-de", "filtro-metricas-ate");
            await carregarMetricas(filtro);
            showToast("Filtro aplicado!");
        };

        // Exportar relatório simples
        const btnExportarMet = document.getElementById("btn-exportar-metricas");
        if (btnExportarMet) btnExportarMet.addEventListener("click", () => {
            const sessoes = document.getElementById("met-sessoes").innerText;
            const cliques = document.getElementById("met-cliques").innerText;
            const conversao = document.getElementById("met-conversao").innerText;
            const tempo = document.getElementById("met-tempo").innerText;

            const comercial = window._metricasComerciaisAtuais || {};
            const moeda = valor => Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
            const texto =
                `RELATÓRIO DE MÉTRICAS — VIDE HUB\n` +
                `Gerado em: ${new Date().toLocaleString("pt-BR")}\n\n` +
                `TRÁFEGO\n` +
                `Sessões: ${sessoes}\n` +
                `Cliques: ${cliques}\n` +
                `Taxa de interação: ${conversao}\n` +
                `Tempo médio: ${tempo}\n\n` +
                `FUNIL COMERCIAL\n` +
                `Leads: ${comercial.leads || 0}\n` +
                `Convertidos: ${comercial.convertidos || 0}\n` +
                `Pedidos pagos: ${comercial.pedidosPagos || 0}\n` +
                `Receita: ${moeda(comercial.receita)}\n` +
                `Ticket médio: ${moeda(comercial.ticketMedio)}\n` +
                `Principal origem: ${comercial.origemPrincipal || "Sem dados"}\n\n` +
                `TAXAS ENTRE ETAPAS\n` +
                `Sessões para cliques: ${comercial.taxaSessaoClique || 0}%\n` +
                `Cliques para leads: ${comercial.taxaCliqueLead || 0}%\n` +
                `Leads para convertidos: ${comercial.taxaLeadConversao || 0}%\n` +
                `Convertidos para pedidos pagos: ${comercial.taxaConversaoPedido || 0}%\n`;

            const blob = new Blob([texto], { type: "text/plain" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `metricas_videhub_${new Date().toISOString().slice(0,10)}.txt`;
            a.click();
        });
        if (document.getElementById("modal-fechar")) document.getElementById("modal-fechar").addEventListener("click", () => modal.classList.add("hidden"));
        if (document.getElementById("modal-cancelar")) document.getElementById("modal-cancelar").addEventListener("click", () => modal.classList.add("hidden"));
        document.getElementById("btn-logout").addEventListener("click", () => {
            clearTimeout(timerInatividade);
            signOut(auth).then(() => window.location.href = "login.html");
        });
