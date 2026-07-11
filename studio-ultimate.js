(function () {
  "use strict";

  const SUPPORTED_TYPES = new Set([
    "texto_midia", "formulario_captura", "faq", "galeria_imagens", "lista_cards",
    "tabela_comparativo", "texto_rico", "codigo_iframe", "carrossel_banners",
    "carrossel_produtos", "carrossel_cards", "navegacao", "rodape", "seletor_cores",
    "breadcrumb", "forma"
  ]);

  const state = {
    initialized: false,
    modal: null,
    activeTab: "compose",
    composerMode: "replace",
    selectedSections: new Set(),
    formIndex: -1,
    lastAudit: null,
    observer: null,
    modalObserver: null
  };

  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => [...(root || document).querySelectorAll(selector)];
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const escapeHTML = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  function toast(message, type) {
    if (typeof window.showToast === "function") window.showToast(message, type);
    else console.info(`[Aura Ultimate] ${message}`);
  }

  function confirmAction(message, callback) {
    if (typeof window.abrirConfirmacao === "function") {
      window.abrirConfirmacao(message, callback);
      return;
    }
    if (window.confirm(message)) callback();
  }

  function getModal() {
    return document.getElementById("lp-editor-modal");
  }

  function getBlocks() {
    return Array.isArray(window.lpEditorBlocos) ? window.lpEditorBlocos : [];
  }

  function currentPageId() {
    const selected = document.querySelector("#lped-barra-paginas button.bg-\\[\\#FF7A45\\]");
    const onclick = selected?.getAttribute("onclick") || "";
    const match = onclick.match(/trocarPaginaLP\('([^']+)'\)/);
    if (match) return match[1];
    return getBlocks().find((block) => block?.paginaId)?.paginaId || "pg_1";
  }

  function currentPageEntries() {
    const pageId = currentPageId();
    const blocks = getBlocks();
    const hasPages = blocks.some((block) => block?.paginaId);
    return blocks
      .map((block, index) => ({ block, index }))
      .filter(({ block }) => !hasPages || !block?.paginaId || block.paginaId === pageId);
  }

  function selectedEntries() {
    const selectedIds = window.AuraStudioMax?.state?.selectedIds;
    if (selectedIds instanceof Set && selectedIds.size) {
      return currentPageEntries().filter(({ block }) => selectedIds.has(block.id));
    }
    const selected = window.AuraStudioInspector?.getSelected?.();
    if (selected?.block && Number.isInteger(selected.index)) return [{ block: selected.block, index: selected.index }];
    return [];
  }

  function notifyChange(label) {
    window.renderizarEditorBlocos?.();
    document.dispatchEvent(new CustomEvent("aura:studio-change", { detail: { source: "studio-ultimate", label } }));
    document.dispatchEvent(new CustomEvent("aura:studio-history-capture", { detail: { label: label || "Alteração Ultimate" } }));
    setTimeout(() => {
      renderContentOverview();
      renderDesignOverview();
      renderForms();
      renderDiagnostics();
    }, 80);
  }

  function createVersion(label) {
    window.AuraStudioMax?.createVersion?.(label || "Checkpoint Ultimate", "automatic");
  }

  function slugify(value) {
    return String(value || "secao")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "secao";
  }

  function blockLabel(block) {
    const map = {
      texto_midia: "Texto e mídia", formulario_captura: "Formulário", faq: "FAQ",
      galeria_imagens: "Galeria", lista_cards: "Lista de cards", tabela_comparativo: "Comparativo",
      texto_rico: "Texto rico", codigo_iframe: "Código / iFrame", carrossel_banners: "Banners",
      carrossel_produtos: "Produtos", carrossel_cards: "Cards", navegacao: "Navegação",
      rodape: "Rodapé", seletor_cores: "Seletor de cores", breadcrumb: "Breadcrumb", forma: "Forma"
    };
    return map[block?.tipo] || block?.tipo || "Bloco";
  }

  function blockTitle(block) {
    return block?.props?.titulo || block?.props?.logoTexto || block?.props?.textoCopyright || blockLabel(block);
  }

  function injectLauncher() {
    const topbar = getModal()?.querySelector(":scope > .aura-lped-topbar");
    if (!topbar || document.getElementById("aura-ultimate-launcher")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.id = "aura-ultimate-launcher";
    button.className = "aura-ultimate-launcher";
    button.title = "Studio Ultimate (Ctrl+Alt+U)";
    button.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m12 3 2.2 4.5L19 9.7l-3.5 3.4.8 4.9-4.3-2.3L7.7 18l.8-4.9L5 9.7l4.8-.7L12 3Z"></path><path d="M19 3v4"></path><path d="M17 5h4"></path></svg>
      <span>Studio Ultimate</span>
    `;
    button.addEventListener("click", () => open("compose"));
    const actions = topbar.querySelector(".flex.items-center.gap-2.shrink-0") || topbar.lastElementChild;
    if (actions) actions.insertBefore(button, actions.firstChild);
    else topbar.appendChild(button);
  }

  function injectQuickRail() {
    const modal = getModal();
    if (!modal || document.getElementById("aura-ultimate-rail")) return;
    const rail = document.createElement("div");
    rail.id = "aura-ultimate-rail";
    rail.className = "aura-ultimate-rail";
    rail.innerHTML = `
      <button type="button" data-ultimate-open="compose" title="Compor página"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 5h16v5H4z"></path><path d="M4 14h7v5H4z"></path><path d="M15 14h5v5h-5z"></path></svg></button>
      <button type="button" data-ultimate-open="content" title="Conteúdo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 5h14"></path><path d="M5 10h14"></path><path d="M5 15h9"></path><path d="M5 20h6"></path></svg></button>
      <button type="button" data-ultimate-open="design" title="Design"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9"></circle><path d="M12 3a9 9 0 0 0 0 18c1.7 0 2-1 1.2-2.2-.7-1-.1-2.3 1.1-2.3h2.2A4.5 4.5 0 0 0 21 12 9 9 0 0 0 12 3Z"></path><circle cx="8" cy="9" r="1"></circle><circle cx="12" cy="7" r="1"></circle><circle cx="16" cy="10" r="1"></circle></svg></button>
      <button type="button" data-ultimate-open="forms" title="Formulários"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="4" y="3" width="16" height="18" rx="2"></rect><path d="M8 8h8"></path><path d="M8 12h8"></path><path d="M8 16h5"></path></svg></button>
      <button type="button" data-ultimate-assets title="Mídia"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="16" rx="3"></rect><circle cx="9" cy="10" r="2"></circle><path d="m4 18 5-5 4 4 3-3 4 4"></path></svg></button>
      <button type="button" data-ultimate-open="export" title="Exportar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 4v11"></path><path d="m8 11 4 4 4-4"></path><path d="M5 20h14"></path></svg></button>
    `;
    modal.appendChild(rail);
    $$('[data-ultimate-open]', rail).forEach((button) => button.addEventListener("click", () => open(button.dataset.ultimateOpen)));
    $('[data-ultimate-assets]', rail)?.addEventListener("click", () => window.AuraUltimateAssets?.open?.());
  }

  function tabButton(id, label, icon) {
    return `<button type="button" class="aura-ultimate-tab" data-ultimate-tab="${id}">${icon}<span>${label}</span></button>`;
  }

  function injectModal() {
    if (document.getElementById("aura-ultimate-hub")) {
      state.modal = document.getElementById("aura-ultimate-hub");
      return;
    }
    const modal = document.createElement("div");
    modal.id = "aura-ultimate-hub";
    modal.className = "aura-ultimate-modal hidden";
    modal.innerHTML = `
      <div class="aura-ultimate-backdrop" data-ultimate-close></div>
      <section class="aura-ultimate-shell" role="dialog" aria-modal="true" aria-labelledby="aura-ultimate-title">
        <aside class="aura-ultimate-sidebar">
          <div class="aura-ultimate-brand">
            <span class="aura-ultimate-brand-mark">V</span>
            <div><small>Vide Aura</small><strong>Studio Ultimate</strong></div>
          </div>
          <nav class="aura-ultimate-tabs">
            ${tabButton("compose", "Composição", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 5h16v5H4z"></path><path d="M4 14h7v5H4z"></path><path d="M15 14h5v5h-5z"></path></svg>')}
            ${tabButton("content", "Conteúdo", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 5h14"></path><path d="M5 10h14"></path><path d="M5 15h9"></path><path d="M5 20h6"></path></svg>')}
            ${tabButton("design", "Design system", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9"></circle><path d="M12 3a9 9 0 0 0 0 18c1.7 0 2-1 1.2-2.2-.7-1-.1-2.3 1.1-2.3h2.2A4.5 4.5 0 0 0 21 12 9 9 0 0 0 12 3Z"></path></svg>')}
            ${tabButton("forms", "Formulários", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="4" y="3" width="16" height="18" rx="2"></rect><path d="M8 8h8"></path><path d="M8 12h8"></path><path d="M8 16h5"></path></svg>')}
            ${tabButton("assets", "Mídia", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="16" rx="3"></rect><circle cx="9" cy="10" r="2"></circle><path d="m4 18 5-5 4 4 3-3 4 4"></path></svg>')}
            ${tabButton("export", "Importar e exportar", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 4v11"></path><path d="m8 11 4 4 4-4"></path><path d="M5 20h14"></path></svg>')}
            ${tabButton("diagnostics", "Diagnóstico", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 19V9"></path><path d="M10 19V5"></path><path d="M16 19v-7"></path><path d="M22 19V3"></path></svg>')}
          </nav>
          <div class="aura-ultimate-sidebar-footer">
            <span id="aura-ultimate-library-count">Biblioteca expandida</span>
            <small>Ctrl + Alt + U</small>
          </div>
        </aside>

        <main class="aura-ultimate-main">
          <header class="aura-ultimate-header">
            <div class="aura-ultimate-heading">
              <span class="aura-ultimate-heading-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m12 3 2.2 4.5L19 9.7l-3.5 3.4.8 4.9-4.3-2.3L7.7 18l.8-4.9L5 9.7l4.8-.7L12 3Z"></path></svg></span>
              <div><small>Editor avançado</small><h2 id="aura-ultimate-title">Studio Ultimate</h2><p id="aura-ultimate-subtitle">Composição, conteúdo, design e qualidade em uma única central.</p></div>
            </div>
            <button type="button" class="aura-ultimate-icon-button" data-ultimate-close aria-label="Fechar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m6 6 12 12"></path><path d="M18 6 6 18"></path></svg></button>
          </header>
          <div class="aura-ultimate-content">
            <section class="aura-ultimate-panel" data-ultimate-panel="compose">${composeHTML()}</section>
            <section class="aura-ultimate-panel" data-ultimate-panel="content">${contentHTML()}</section>
            <section class="aura-ultimate-panel" data-ultimate-panel="design">${designHTML()}</section>
            <section class="aura-ultimate-panel" data-ultimate-panel="forms">${formsHTML()}</section>
            <section class="aura-ultimate-panel" data-ultimate-panel="assets">${assetsHTML()}</section>
            <section class="aura-ultimate-panel" data-ultimate-panel="export">${exportHTML()}</section>
            <section class="aura-ultimate-panel" data-ultimate-panel="diagnostics">${diagnosticsHTML()}</section>
          </div>
        </main>
      </section>
    `;
    document.body.appendChild(modal);
    state.modal = modal;
    bindModalEvents();
  }

  function composeHTML() {
    return `
      <div class="aura-ultimate-section-head"><div><small>Composição inteligente local</small><h3>Monte uma página completa</h3><p>Combine nicho, objetivo, direção visual e seções sem depender de IA externa.</p></div><span class="aura-ultimate-badge">Reversível por versões</span></div>
      <div class="aura-ultimate-compose-grid">
        <div class="aura-ultimate-card aura-ultimate-config-card">
          <div class="aura-ultimate-card-title"><strong>Direção do projeto</strong><span>1</span></div>
          <div class="aura-ultimate-field-grid">
            <label class="aura-ultimate-field"><span>Nicho</span><select id="aura-ultimate-niche"></select></label>
            <label class="aura-ultimate-field"><span>Objetivo</span><select id="aura-ultimate-objective"></select></label>
            <label class="aura-ultimate-field aura-ultimate-field-wide"><span>Estilo visual</span><select id="aura-ultimate-style"></select></label>
          </div>
          <div class="aura-ultimate-mode-switch">
            <button type="button" data-ultimate-mode="replace" class="is-active">Substituir página</button>
            <button type="button" data-ultimate-mode="append">Adicionar ao final</button>
          </div>
        </div>
        <div class="aura-ultimate-card aura-ultimate-section-card">
          <div class="aura-ultimate-card-title"><strong>Estrutura da página</strong><span>2</span></div>
          <div id="aura-ultimate-sections" class="aura-ultimate-section-list"></div>
          <div class="aura-ultimate-section-actions"><button type="button" id="aura-ultimate-select-recommended">Usar recomendação</button><button type="button" id="aura-ultimate-select-all">Selecionar tudo</button><button type="button" id="aura-ultimate-clear-sections">Limpar</button></div>
        </div>
        <div class="aura-ultimate-card aura-ultimate-preview-card">
          <div class="aura-ultimate-card-title"><strong>Prévia estrutural</strong><span>3</span></div>
          <div id="aura-ultimate-compose-preview"></div>
          <button type="button" class="aura-ultimate-primary-button aura-ultimate-generate" id="aura-ultimate-generate"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 3v18"></path><path d="M3 12h18"></path></svg>Gerar composição</button>
        </div>
      </div>
    `;
  }

  function contentHTML() {
    return `
      <div class="aura-ultimate-section-head"><div><small>Conteúdo centralizado</small><h3>Laboratório de conteúdo</h3><p>Localize textos, padronize CTAs, organize links e crie âncoras para a navegação.</p></div><span id="aura-ultimate-content-stats" class="aura-ultimate-badge">0 blocos</span></div>
      <div class="aura-ultimate-grid-2">
        <div class="aura-ultimate-card">
          <div class="aura-ultimate-card-title"><strong>Localizar e substituir</strong><span>Texto</span></div>
          <label class="aura-ultimate-field"><span>Localizar</span><input id="aura-ultimate-find" placeholder="Texto atual"></label>
          <label class="aura-ultimate-field"><span>Substituir por</span><input id="aura-ultimate-replace" placeholder="Novo texto"></label>
          <label class="aura-ultimate-check"><input id="aura-ultimate-case-sensitive" type="checkbox"><span>Diferenciar maiúsculas e minúsculas</span></label>
          <button type="button" class="aura-ultimate-primary-button" id="aura-ultimate-replace-action">Substituir em toda a página</button>
        </div>
        <div class="aura-ultimate-card">
          <div class="aura-ultimate-card-title"><strong>Padronização de CTA</strong><span>Ação</span></div>
          <label class="aura-ultimate-field"><span>Texto dos botões</span><input id="aura-ultimate-cta-text" placeholder="Ex: Quero começar"></label>
          <label class="aura-ultimate-field"><span>Link dos botões</span><input id="aura-ultimate-cta-link" placeholder="#contato ou https://..."></label>
          <div class="aura-ultimate-inline-actions"><button type="button" id="aura-ultimate-cta-text-apply">Aplicar texto</button><button type="button" id="aura-ultimate-cta-link-apply">Aplicar link</button></div>
          <p class="aura-ultimate-help">Afeta blocos que possuem botão ou envio de formulário.</p>
        </div>
      </div>
      <div class="aura-ultimate-card aura-ultimate-table-card">
        <div class="aura-ultimate-card-title"><strong>Mapa de CTAs e links</strong><button type="button" id="aura-ultimate-refresh-content">Atualizar</button></div>
        <div id="aura-ultimate-cta-list" class="aura-ultimate-table-list"></div>
      </div>
      <div class="aura-ultimate-card aura-ultimate-table-card">
        <div class="aura-ultimate-card-title"><strong>Âncoras da página</strong><button type="button" id="aura-ultimate-generate-anchors">Gerar âncoras ausentes</button></div>
        <div id="aura-ultimate-anchor-list" class="aura-ultimate-anchor-list"></div>
      </div>
    `;
  }

  function designHTML() {
    return `
      <div class="aura-ultimate-section-head"><div><small>Sistema visual</small><h3>Design system da página</h3><p>Aplique uma linguagem consistente em todos os blocos ou somente na seleção atual.</p></div><span id="aura-ultimate-design-target" class="aura-ultimate-badge">Página inteira</span></div>
      <div class="aura-ultimate-card">
        <div class="aura-ultimate-card-title"><strong>Direções visuais</strong><span>Paletas</span></div>
        <div id="aura-ultimate-style-grid" class="aura-ultimate-style-grid"></div>
      </div>
      <div class="aura-ultimate-grid-3">
        <div class="aura-ultimate-card">
          <div class="aura-ultimate-card-title"><strong>Ritmo</strong><span>Espaçamento</span></div>
          <label class="aura-ultimate-range"><span>Espaçamento vertical <b id="aura-ultimate-padding-value">72px</b></span><input id="aura-ultimate-padding" type="range" min="24" max="140" value="72"></label>
          <label class="aura-ultimate-field"><span>Alinhamento</span><select id="aura-ultimate-align"><option value="esquerda">Esquerda</option><option value="centro">Centro</option><option value="direita">Direita</option></select></label>
          <label class="aura-ultimate-field"><span>Posição de imagem</span><select id="aura-ultimate-image-position"><option value="keep">Manter atual</option><option value="direita">Direita</option><option value="esquerda">Esquerda</option></select></label>
        </div>
        <div class="aura-ultimate-card">
          <div class="aura-ultimate-card-title"><strong>Profundidade</strong><span>Forma</span></div>
          <label class="aura-ultimate-range"><span>Arredondamento <b id="aura-ultimate-radius-value">18px</b></span><input id="aura-ultimate-radius" type="range" min="0" max="48" value="18"></label>
          <label class="aura-ultimate-field"><span>Sombra</span><select id="aura-ultimate-shadow"><option value="none">Sem sombra</option><option value="soft">Suave</option><option value="strong">Forte</option><option value="glow">Glow</option></select></label>
          <label class="aura-ultimate-field"><span>Animação</span><select id="aura-ultimate-animation"><option value="none">Nenhuma</option><option value="fade-up">Fade up</option><option value="fade-in">Fade in</option><option value="slide-right">Slide right</option><option value="slide-left">Slide left</option><option value="zoom-in">Zoom</option></select></label>
        </div>
        <div class="aura-ultimate-card">
          <div class="aura-ultimate-card-title"><strong>Responsividade</strong><span>Visibilidade</span></div>
          <label class="aura-ultimate-check"><input id="aura-ultimate-desktop-visible" type="checkbox" checked><span>Exibir no desktop</span></label>
          <label class="aura-ultimate-check"><input id="aura-ultimate-mobile-visible" type="checkbox" checked><span>Exibir no celular</span></label>
          <label class="aura-ultimate-range"><span>Intervalo das animações <b id="aura-ultimate-stagger-value">90ms</b></span><input id="aura-ultimate-stagger" type="range" min="0" max="500" step="10" value="90"></label>
        </div>
      </div>
      <div class="aura-ultimate-action-row">
        <button type="button" class="aura-ultimate-secondary-button" id="aura-ultimate-copy-style">Copiar estilo selecionado</button>
        <button type="button" class="aura-ultimate-secondary-button" id="aura-ultimate-paste-style">Colar estilo</button>
        <button type="button" class="aura-ultimate-primary-button" id="aura-ultimate-apply-selected-design">Aplicar à seleção</button>
        <button type="button" class="aura-ultimate-primary-button" id="aura-ultimate-apply-page-design">Aplicar à página</button>
      </div>
    `;
  }

  function formsHTML() {
    return `
      <div class="aura-ultimate-section-head"><div><small>Captação e atendimento</small><h3>Construtor de formulários</h3><p>Crie formulários compatíveis com o editor atual e prepare o contexto operacional do lead.</p></div><button type="button" class="aura-ultimate-primary-button" id="aura-ultimate-new-form">Novo formulário</button></div>
      <div class="aura-ultimate-forms-layout">
        <div class="aura-ultimate-card aura-ultimate-form-list-card"><div class="aura-ultimate-card-title"><strong>Formulários da página</strong><span id="aura-ultimate-form-count">0</span></div><div id="aura-ultimate-form-list" class="aura-ultimate-form-list"></div></div>
        <div class="aura-ultimate-card aura-ultimate-form-editor-card"><div id="aura-ultimate-form-editor"></div></div>
      </div>
      <p class="aura-ultimate-notice">Status, prioridade e retorno ficam armazenados como preparação operacional. A execução automática completa depende do fluxo de atendimento conectado no projeto.</p>
    `;
  }

  function assetsHTML() {
    return `
      <div class="aura-ultimate-section-head"><div><small>Central de mídia local</small><h3>Biblioteca e edição de imagens</h3><p>Envie uma vez, reutilize em vários blocos e continue editando no Studio de Mídia.</p></div></div>
      <div class="aura-ultimate-feature-grid">
        <button type="button" class="aura-ultimate-feature-card" id="aura-ultimate-open-assets"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="16" rx="3"></rect><circle cx="9" cy="10" r="2"></circle><path d="m4 18 5-5 4 4 3-3 4 4"></path></svg><strong>Abrir biblioteca</strong><span>Organize e aplique imagens armazenadas neste navegador.</span></button>
        <button type="button" class="aura-ultimate-feature-card" id="aura-ultimate-open-media-editor"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m4 20 5-1 10-10-4-4L5 15l-1 5Z"></path><path d="m13 7 4 4"></path></svg><strong>Editar imagem selecionada</strong><span>Ajuste enquadramento, filtros, rotação e compressão.</span></button>
        <button type="button" class="aura-ultimate-feature-card" id="aura-ultimate-optimize-backgrounds"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 3v18"></path><path d="M3 12h18"></path><circle cx="12" cy="12" r="8"></circle></svg><strong>Revisar imagens da página</strong><span>Identifique imagens pesadas, ausentes ou sem descrição.</span></button>
      </div>
      <div id="aura-ultimate-image-report" class="aura-ultimate-card aura-ultimate-report-card"></div>
    `;
  }

  function exportHTML() {
    return `
      <div class="aura-ultimate-section-head"><div><small>Portabilidade</small><h3>Importar, exportar e fazer backup</h3><p>Leve a estrutura da página para outro navegador ou gere uma versão HTML independente.</p></div><span class="aura-ultimate-badge">Sem alterar o Firebase</span></div>
      <div class="aura-ultimate-feature-grid aura-ultimate-feature-grid-3">
        <button type="button" class="aura-ultimate-feature-card" id="aura-ultimate-export-page"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 4v11"></path><path d="m8 11 4 4 4-4"></path><path d="M5 20h14"></path></svg><strong>Exportar página JSON</strong><span>Baixe somente os blocos da página atual.</span></button>
        <button type="button" class="aura-ultimate-feature-card" id="aura-ultimate-export-project"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 4h16v16H4z"></path><path d="M8 8h8v8H8z"></path></svg><strong>Backup do projeto</strong><span>Baixe todas as páginas, blocos e configurações do editor.</span></button>
        <button type="button" class="aura-ultimate-feature-card" id="aura-ultimate-export-html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m8 8-4 4 4 4"></path><path d="m16 8 4 4-4 4"></path><path d="m14 4-4 16"></path></svg><strong>Exportar HTML independente</strong><span>Gere uma cópia visual estática para arquivo ou apresentação.</span></button>
        <label class="aura-ultimate-feature-card aura-ultimate-import-card"><input id="aura-ultimate-import-file" type="file" accept="application/json,.json" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 20V9"></path><path d="m8 13 4-4 4 4"></path><path d="M5 4h14"></path></svg><strong>Importar JSON</strong><span>Restaure uma página ou projeto exportado pelo Studio.</span></label>
        <button type="button" class="aura-ultimate-feature-card" id="aura-ultimate-copy-json"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="8" y="8" width="12" height="12" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg><strong>Copiar estrutura</strong><span>Copie o JSON da página para a área de transferência.</span></button>
        <button type="button" class="aura-ultimate-feature-card" id="aura-ultimate-copy-blocks"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 5h16v5H4z"></path><path d="M4 14h7v5H4z"></path><path d="M15 14h5v5h-5z"></path></svg><strong>Copiar blocos selecionados</strong><span>Crie um clipboard interno para colar em outra página.</span></button>
      </div>
      <div class="aura-ultimate-card aura-ultimate-shortcuts"><strong>Atalhos</strong><span>Ctrl+C / Ctrl+V: blocos selecionados</span><span>Ctrl+Shift+C / Ctrl+Shift+V: estilo</span><span>Ctrl+Alt+U: abrir Studio Ultimate</span></div>
    `;
  }

  function diagnosticsHTML() {
    return `
      <div class="aura-ultimate-section-head"><div><small>Qualidade antes de publicar</small><h3>Diagnóstico completo</h3><p>Revise estrutura, conversão, acessibilidade, imagens, links e responsividade.</p></div><button type="button" class="aura-ultimate-primary-button" id="aura-ultimate-run-audit">Executar auditoria</button></div>
      <div class="aura-ultimate-diagnostic-summary">
        <div class="aura-ultimate-score-ring" id="aura-ultimate-score-ring"><strong id="aura-ultimate-score">0</strong><span>/100</span></div>
        <div><small>Qualidade geral</small><h3 id="aura-ultimate-score-title">Aguardando análise</h3><p id="aura-ultimate-score-text">Execute a auditoria para identificar oportunidades de melhoria.</p></div>
        <button type="button" class="aura-ultimate-secondary-button" id="aura-ultimate-auto-fix">Corrigir automaticamente</button>
      </div>
      <div id="aura-ultimate-audit-metrics" class="aura-ultimate-audit-metrics"></div>
      <div id="aura-ultimate-issues" class="aura-ultimate-issues"></div>
    `;
  }

  function bindModalEvents() {
    $$('[data-ultimate-close]', state.modal).forEach((button) => button.addEventListener("click", close));
    $$('[data-ultimate-tab]', state.modal).forEach((button) => button.addEventListener("click", () => setTab(button.dataset.ultimateTab)));

    $('[data-ultimate-mode="replace"]', state.modal)?.addEventListener("click", () => setComposerMode("replace"));
    $('[data-ultimate-mode="append"]', state.modal)?.addEventListener("click", () => setComposerMode("append"));
    ["aura-ultimate-niche", "aura-ultimate-objective", "aura-ultimate-style"].forEach((id) => $("#" + id, state.modal)?.addEventListener("change", () => {
      if (id === "aura-ultimate-objective") selectRecommendedSections();
      renderComposerPreview();
    }));
    $("#aura-ultimate-select-recommended", state.modal)?.addEventListener("click", selectRecommendedSections);
    $("#aura-ultimate-select-all", state.modal)?.addEventListener("click", () => selectAllSections(true));
    $("#aura-ultimate-clear-sections", state.modal)?.addEventListener("click", () => selectAllSections(false));
    $("#aura-ultimate-generate", state.modal)?.addEventListener("click", generateComposition);

    $("#aura-ultimate-replace-action", state.modal)?.addEventListener("click", replaceContent);
    $("#aura-ultimate-cta-text-apply", state.modal)?.addEventListener("click", () => applyCTA("text"));
    $("#aura-ultimate-cta-link-apply", state.modal)?.addEventListener("click", () => applyCTA("link"));
    $("#aura-ultimate-refresh-content", state.modal)?.addEventListener("click", renderContentOverview);
    $("#aura-ultimate-generate-anchors", state.modal)?.addEventListener("click", generateAnchors);

    $("#aura-ultimate-padding", state.modal)?.addEventListener("input", (event) => $("#aura-ultimate-padding-value", state.modal).textContent = `${event.target.value}px`);
    $("#aura-ultimate-radius", state.modal)?.addEventListener("input", (event) => $("#aura-ultimate-radius-value", state.modal).textContent = `${event.target.value}px`);
    $("#aura-ultimate-stagger", state.modal)?.addEventListener("input", (event) => $("#aura-ultimate-stagger-value", state.modal).textContent = `${event.target.value}ms`);
    $("#aura-ultimate-copy-style", state.modal)?.addEventListener("click", copyStyle);
    $("#aura-ultimate-paste-style", state.modal)?.addEventListener("click", pasteStyle);
    $("#aura-ultimate-apply-selected-design", state.modal)?.addEventListener("click", () => applyDesign("selected"));
    $("#aura-ultimate-apply-page-design", state.modal)?.addEventListener("click", () => applyDesign("page"));

    $("#aura-ultimate-new-form", state.modal)?.addEventListener("click", createForm);

    $("#aura-ultimate-open-assets", state.modal)?.addEventListener("click", () => window.AuraUltimateAssets?.open?.());
    $("#aura-ultimate-open-media-editor", state.modal)?.addEventListener("click", () => window.AuraStudioMedia?.open?.());
    $("#aura-ultimate-optimize-backgrounds", state.modal)?.addEventListener("click", renderImageReport);

    $("#aura-ultimate-export-page", state.modal)?.addEventListener("click", exportCurrentPage);
    $("#aura-ultimate-export-project", state.modal)?.addEventListener("click", exportProject);
    $("#aura-ultimate-export-html", state.modal)?.addEventListener("click", exportStandaloneHTML);
    $("#aura-ultimate-import-file", state.modal)?.addEventListener("change", importJSON);
    $("#aura-ultimate-copy-json", state.modal)?.addEventListener("click", copyCurrentPageJSON);
    $("#aura-ultimate-copy-blocks", state.modal)?.addEventListener("click", copySelectedBlocks);

    $("#aura-ultimate-run-audit", state.modal)?.addEventListener("click", renderDiagnostics);
    $("#aura-ultimate-auto-fix", state.modal)?.addEventListener("click", autoFix);
  }

  function populateComposer() {
    const library = window.AuraUltimateLibrary;
    if (!library) return;
    const niche = $("#aura-ultimate-niche", state.modal);
    const objective = $("#aura-ultimate-objective", state.modal);
    const style = $("#aura-ultimate-style", state.modal);
    niche.innerHTML = library.niches.map((item) => `<option value="${item.id}">${escapeHTML(item.label)}</option>`).join("");
    objective.innerHTML = library.objectives.map((item) => `<option value="${item.id}">${escapeHTML(item.label)}</option>`).join("");
    style.innerHTML = library.styles.map((item) => `<option value="${item.id}">${escapeHTML(item.label)}</option>`).join("");
    const sections = $("#aura-ultimate-sections", state.modal);
    sections.innerHTML = library.families.map((item, index) => `
      <label class="aura-ultimate-section-option" data-section-id="${item.id}">
        <input type="checkbox" value="${item.id}">
        <span class="aura-ultimate-section-index">${String(index + 1).padStart(2, "0")}</span>
        <span>${escapeHTML(item.label)}</span>
      </label>
    `).join("");
    $$("input", sections).forEach((input) => input.addEventListener("change", () => {
      if (input.checked) state.selectedSections.add(input.value);
      else state.selectedSections.delete(input.value);
      renderComposerPreview();
    }));
    selectRecommendedSections();
    renderStyleGrid();
    const libraryCount = $("#aura-ultimate-library-count", state.modal);
    if (libraryCount) libraryCount.textContent = `${window.AURA_STUDIO_PRESETS?.length || 0} modelos + combinações dinâmicas`;
  }

  function setComposerMode(mode) {
    state.composerMode = mode === "append" ? "append" : "replace";
    $$('[data-ultimate-mode]', state.modal).forEach((button) => button.classList.toggle("is-active", button.dataset.ultimateMode === state.composerMode));
    renderComposerPreview();
  }

  function selectedComposerConfig() {
    return {
      niche: $("#aura-ultimate-niche", state.modal)?.value,
      objective: $("#aura-ultimate-objective", state.modal)?.value,
      style: $("#aura-ultimate-style", state.modal)?.value,
      sections: [...state.selectedSections]
    };
  }

  function selectRecommendedSections() {
    const library = window.AuraUltimateLibrary;
    const objective = library?.getObjective($("#aura-ultimate-objective", state.modal)?.value);
    state.selectedSections = new Set(objective?.order || []);
    syncSectionCheckboxes();
    renderComposerPreview();
  }

  function selectAllSections(checked) {
    const families = window.AuraUltimateLibrary?.families || [];
    state.selectedSections = checked ? new Set(families.map((item) => item.id)) : new Set();
    syncSectionCheckboxes();
    renderComposerPreview();
  }

  function syncSectionCheckboxes() {
    $$("#aura-ultimate-sections input", state.modal).forEach((input) => {
      input.checked = state.selectedSections.has(input.value);
      input.closest(".aura-ultimate-section-option")?.classList.toggle("is-active", input.checked);
    });
  }

  function renderComposerPreview() {
    const root = $("#aura-ultimate-compose-preview", state.modal);
    if (!root || !window.AuraUltimateLibrary) return;
    const config = selectedComposerConfig();
    const niche = window.AuraUltimateLibrary.getNiche(config.niche);
    const objective = window.AuraUltimateLibrary.getObjective(config.objective);
    const style = window.AuraUltimateLibrary.getStyle(config.style);
    const families = window.AuraUltimateLibrary.families.filter((item) => state.selectedSections.has(item.id));
    root.innerHTML = `
      <div class="aura-ultimate-compose-identity">
        <span style="--preview-primary:${style.primary};--preview-accent:${style.accent}"></span>
        <div><small>${escapeHTML(niche.label)} · ${escapeHTML(objective.label)}</small><strong>${escapeHTML(style.label)}</strong></div>
      </div>
      <div class="aura-ultimate-compose-sequence">
        ${families.length ? families.map((item, index) => `<div><b>${String(index + 1).padStart(2, "0")}</b><span>${escapeHTML(item.label)}</span></div>`).join("") : '<p>Nenhuma seção selecionada.</p>'}
      </div>
      <div class="aura-ultimate-compose-summary"><strong>${families.length} seções</strong><span>${state.composerMode === "replace" ? "Substituirá a página atual" : "Será adicionada ao final"}</span></div>
    `;
  }

  function insertGeneratedBlocks(blocks, replace) {
    const all = getBlocks();
    const pageId = currentPageId();
    const freeMode = document.getElementById("lped-btn-modo-livre")?.className.includes("bg-[#FF7A45]");
    if (replace) {
      for (let index = all.length - 1; index >= 0; index -= 1) {
        if (!all[index].paginaId || all[index].paginaId === pageId) all.splice(index, 1);
      }
    }
    let y = Math.max(0, ...all.map((block) => Number(block.y || 0) + Number(block.altura || 0))) + 24;
    const maxZ = Math.max(0, ...all.map((block) => Number(block.zIndex || 0)));
    blocks.forEach((template, index) => {
      const block = clone(template);
      block.id = `lpb_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 7)}`;
      block.paginaId = pageId;
      block._colapsado = index !== 0;
      block._aba = "conteudo";
      block.visivel = block.visivel !== false;
      if (freeMode) {
        block.x = 40 + (index % 2) * 24;
        block.y = y;
        block.largura = Number(block.largura || 780);
        block.altura = Number(block.altura || 280);
        block.zIndex = maxZ + index + 1;
        y += block.altura + 26;
      } else {
        delete block.x;
        delete block.y;
        delete block.largura;
        delete block.altura;
        delete block.zIndex;
      }
      all.push(block);
    });
  }

  function generateComposition() {
    const config = selectedComposerConfig();
    if (!config.sections.length) {
      toast("Selecione pelo menos uma seção.", "error");
      return;
    }
    const blocks = window.AuraUltimateLibrary?.buildPage(config) || [];
    if (!blocks.length) {
      toast("Não foi possível montar a composição.", "error");
      return;
    }
    const run = () => {
      createVersion("Antes da composição Ultimate");
      insertGeneratedBlocks(blocks, state.composerMode === "replace");
      notifyChange("Composição Ultimate gerada");
      window.AuraStudioMax?.createVersion?.("Composição Ultimate gerada", "automatic");
      toast(`${blocks.length} seções foram adicionadas.`);
      close();
    };
    if (state.composerMode === "replace" && currentPageEntries().length) {
      confirmAction("Substituir a página atual por esta composição? Uma versão de segurança será criada.", run);
    } else run();
  }

  function mutateStrings(value, finder, replacement, caseSensitive) {
    let changes = 0;
    const visit = (current) => {
      if (Array.isArray(current)) {
        current.forEach((item, index) => {
          if (typeof item === "string" && !item.startsWith("data:image/")) {
            const next = replaceString(item, finder, replacement, caseSensitive);
            if (next !== item) { current[index] = next; changes += 1; }
          } else if (item && typeof item === "object") visit(item);
        });
      } else if (current && typeof current === "object") {
        Object.keys(current).forEach((key) => {
          const item = current[key];
          if (typeof item === "string" && !item.startsWith("data:image/")) {
            const next = replaceString(item, finder, replacement, caseSensitive);
            if (next !== item) { current[key] = next; changes += 1; }
          } else if (item && typeof item === "object") visit(item);
        });
      }
    };
    visit(value);
    return changes;
  }

  function replaceString(text, finder, replacement, caseSensitive) {
    if (!finder) return text;
    if (caseSensitive) return text.split(finder).join(replacement);
    const escaped = finder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return text.replace(new RegExp(escaped, "gi"), replacement);
  }

  function replaceContent() {
    const finder = $("#aura-ultimate-find", state.modal)?.value || "";
    const replacement = $("#aura-ultimate-replace", state.modal)?.value || "";
    const caseSensitive = Boolean($("#aura-ultimate-case-sensitive", state.modal)?.checked);
    if (!finder) {
      toast("Digite o texto que deseja localizar.", "error");
      return;
    }
    createVersion("Antes de substituir conteúdo");
    let changes = 0;
    currentPageEntries().forEach(({ block }) => { changes += mutateStrings(block.props || {}, finder, replacement, caseSensitive); });
    if (!changes) {
      toast("Nenhuma ocorrência encontrada.", "error");
      return;
    }
    notifyChange("Conteúdo substituído");
    toast(`${changes} campo(s) atualizado(s).`);
  }

  function CTAEntries() {
    const result = [];
    currentPageEntries().forEach(({ block, index }) => {
      if (Object.prototype.hasOwnProperty.call(block.props || {}, "botaoTexto")) result.push({ block, index, textKey: "botaoTexto", linkKey: "botaoLink" });
      if (Object.prototype.hasOwnProperty.call(block.props || {}, "textoBotao")) result.push({ block, index, textKey: "textoBotao", linkKey: null });
    });
    return result;
  }

  function applyCTA(mode) {
    const value = mode === "text" ? $("#aura-ultimate-cta-text", state.modal)?.value.trim() : $("#aura-ultimate-cta-link", state.modal)?.value.trim();
    if (!value) {
      toast("Preencha o valor antes de aplicar.", "error");
      return;
    }
    const entries = CTAEntries();
    createVersion("Antes de padronizar CTAs");
    entries.forEach(({ block, textKey, linkKey }) => {
      if (mode === "text") block.props[textKey] = value;
      else if (linkKey) block.props[linkKey] = value;
    });
    notifyChange("CTAs padronizados");
    toast(`${entries.length} CTA(s) revisado(s).`);
  }

  function updateSingleCTA(index, text, link) {
    const block = getBlocks()[index];
    if (!block) return;
    if (Object.prototype.hasOwnProperty.call(block.props || {}, "botaoTexto")) {
      block.props.botaoTexto = text;
      block.props.botaoLink = link;
    } else if (Object.prototype.hasOwnProperty.call(block.props || {}, "textoBotao")) {
      block.props.textoBotao = text;
    }
    notifyChange("CTA atualizado");
  }

  function renderContentOverview() {
    if (!state.modal) return;
    const entries = currentPageEntries();
    const stats = $("#aura-ultimate-content-stats", state.modal);
    if (stats) stats.textContent = `${entries.length} blocos · ${CTAEntries().length} CTAs`;
    const CTAList = $("#aura-ultimate-cta-list", state.modal);
    if (CTAList) {
      const items = CTAEntries();
      CTAList.innerHTML = items.length ? items.map(({ block, index, textKey, linkKey }) => `
        <div class="aura-ultimate-table-row" data-cta-index="${index}">
          <span class="aura-ultimate-row-icon">${escapeHTML(blockLabel(block).slice(0, 1))}</span>
          <div><small>${escapeHTML(blockLabel(block))}</small><strong>${escapeHTML(blockTitle(block))}</strong></div>
          <input data-cta-text value="${escapeHTML(block.props[textKey] || "")}" aria-label="Texto do CTA">
          <input data-cta-link value="${escapeHTML(linkKey ? block.props[linkKey] || "" : "Envio do formulário")}" ${linkKey ? "" : "disabled"} aria-label="Link do CTA">
          <button type="button" data-cta-save>Salvar</button>
        </div>
      `).join("") : '<div class="aura-ultimate-empty">Nenhum CTA encontrado nesta página.</div>';
      $$('[data-cta-save]', CTAList).forEach((button) => button.addEventListener("click", () => {
        const row = button.closest("[data-cta-index]");
        updateSingleCTA(Number(row.dataset.ctaIndex), $("[data-cta-text]", row)?.value || "", $("[data-cta-link]", row)?.value || "");
      }));
    }

    const anchorList = $("#aura-ultimate-anchor-list", state.modal);
    if (anchorList) {
      anchorList.innerHTML = entries.length ? entries.map(({ block, index }, position) => `
        <div class="aura-ultimate-anchor-row">
          <b>${String(position + 1).padStart(2, "0")}</b>
          <div><strong>${escapeHTML(blockTitle(block))}</strong><small>${escapeHTML(blockLabel(block))}</small></div>
          <input value="${escapeHTML(block.design?.idSecao || "")}" placeholder="id-da-secao" data-anchor-index="${index}">
          <button type="button" data-anchor-focus="${index}">Ir</button>
        </div>
      `).join("") : '<div class="aura-ultimate-empty">Nenhuma seção na página atual.</div>';
      $$('[data-anchor-index]', anchorList).forEach((input) => input.addEventListener("change", () => {
        const block = getBlocks()[Number(input.dataset.anchorIndex)];
        if (!block) return;
        block.design = block.design || {};
        block.design.idSecao = slugify(input.value);
        input.value = block.design.idSecao;
        notifyChange("Âncora atualizada");
      }));
      $$('[data-anchor-focus]', anchorList).forEach((button) => button.addEventListener("click", () => {
        const index = Number(button.dataset.anchorFocus);
        window.AuraStudioInspector?.select?.(index);
        document.getElementById(`lped-preview-bloco-${index}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        close();
      }));
    }
  }

  function generateAnchors() {
    const used = new Set();
    let changed = 0;
    currentPageEntries().forEach(({ block }, position) => {
      block.design = block.design || {};
      let base = slugify(block.design.idSecao || blockTitle(block) || `${block.tipo}-${position + 1}`);
      let candidate = base;
      let suffix = 2;
      while (used.has(candidate)) candidate = `${base}-${suffix++}`;
      used.add(candidate);
      if (block.design.idSecao !== candidate) {
        block.design.idSecao = candidate;
        changed += 1;
      }
    });
    notifyChange("Âncoras organizadas");
    toast(`${changed} âncora(s) organizada(s).`);
  }

  function renderStyleGrid() {
    const root = $("#aura-ultimate-style-grid", state.modal);
    const styles = window.AuraUltimateLibrary?.styles || [];
    if (!root) return;
    root.innerHTML = styles.map((style, index) => `
      <button type="button" class="aura-ultimate-style-card ${index === 0 ? "is-active" : ""}" data-style-id="${style.id}">
        <span class="aura-ultimate-style-swatches"><i style="background:${style.bg}"></i><i style="background:${style.primary}"></i><i style="background:${style.accent}"></i><i style="background:${style.text}"></i></span>
        <strong>${escapeHTML(style.label)}</strong>
        <small>${style.radius}px · ${escapeHTML(style.shadow)}</small>
      </button>
    `).join("");
    $$('[data-style-id]', root).forEach((button) => button.addEventListener("click", () => {
      $$('[data-style-id]', root).forEach((item) => item.classList.toggle("is-active", item === button));
      const style = window.AuraUltimateLibrary.getStyle(button.dataset.styleId);
      $("#aura-ultimate-radius", state.modal).value = style.radius;
      $("#aura-ultimate-radius-value", state.modal).textContent = `${style.radius}px`;
      $("#aura-ultimate-shadow", state.modal).value = style.shadow;
    }));
  }

  function activeDesignStyle() {
    const id = $("#aura-ultimate-style-grid .is-active", state.modal)?.dataset.styleId;
    return window.AuraUltimateLibrary?.getStyle(id) || window.AuraUltimateLibrary?.styles?.[0];
  }

  function designTargets(mode) {
    if (mode === "selected") {
      const entries = selectedEntries();
      if (entries.length) return entries;
      toast("Selecione um ou mais blocos antes de aplicar.", "error");
      return [];
    }
    return currentPageEntries();
  }

  function applyDesign(mode) {
    const entries = designTargets(mode);
    if (!entries.length) return;
    const style = activeDesignStyle();
    const padding = Number($("#aura-ultimate-padding", state.modal)?.value || 72);
    const radius = Number($("#aura-ultimate-radius", state.modal)?.value || 18);
    const align = $("#aura-ultimate-align", state.modal)?.value || "esquerda";
    const imagePosition = $("#aura-ultimate-image-position", state.modal)?.value || "keep";
    const shadow = $("#aura-ultimate-shadow", state.modal)?.value || "soft";
    const animation = $("#aura-ultimate-animation", state.modal)?.value || "fade-up";
    const desktop = Boolean($("#aura-ultimate-desktop-visible", state.modal)?.checked);
    const mobile = Boolean($("#aura-ultimate-mobile-visible", state.modal)?.checked);
    const stagger = Number($("#aura-ultimate-stagger", state.modal)?.value || 0);
    createVersion(`Antes de aplicar design ${mode}`);
    entries.forEach(({ block }, index) => {
      block.design = block.design || {};
      const isAction = ["formulario_captura"].includes(block.tipo) || block.design.idSecao === "oferta";
      Object.assign(block.design, {
        corFundo: isAction ? style.primary : (index % 2 ? style.soft : style.bg),
        corTexto: isAction ? "#FFFFFF" : style.text,
        corBotaoFundo: isAction ? "#FFFFFF" : style.primary,
        corBotaoTexto: isAction ? style.bg : "#FFFFFF",
        corBotaoBorda: isAction ? "#FFFFFF" : style.accent,
        paddingTop: padding,
        paddingBottom: padding,
        alinhamento: align,
        raio: radius,
        sombra: shadow,
        animacao: animation,
        duracaoAnimacao: 650,
        atrasoAnimacao: index * stagger,
        visivelDesktop: desktop,
        visivelMobile: mobile
      });
      if (block.tipo === "texto_midia" && imagePosition !== "keep") block.props.posicaoImagem = imagePosition;
    });
    notifyChange(`Design aplicado em ${entries.length} blocos`);
    toast(`Design aplicado em ${entries.length} bloco(s).`);
  }

  function copyStyle() {
    const selected = window.AuraStudioInspector?.getSelected?.();
    if (!selected?.block) {
      toast("Selecione um bloco para copiar o estilo.", "error");
      return;
    }
    localStorage.setItem("auraUltimateStyleClipboard", JSON.stringify(selected.block.design || {}));
    toast("Estilo copiado.");
  }

  function pasteStyle() {
    let style;
    try { style = JSON.parse(localStorage.getItem("auraUltimateStyleClipboard") || "null"); } catch (_) { style = null; }
    if (!style) {
      toast("Nenhum estilo foi copiado.", "error");
      return;
    }
    const entries = selectedEntries();
    if (!entries.length) {
      toast("Selecione um bloco para colar o estilo.", "error");
      return;
    }
    entries.forEach(({ block }) => { block.design = clone(style); });
    notifyChange("Estilo colado");
    toast(`Estilo aplicado em ${entries.length} bloco(s).`);
  }

  function renderDesignOverview() {
    const target = $("#aura-ultimate-design-target", state.modal);
    if (!target) return;
    const count = selectedEntries().length;
    target.textContent = count ? `${count} selecionado(s)` : "Página inteira";
  }

  function formEntries() {
    return currentPageEntries().filter(({ block }) => block.tipo === "formulario_captura");
  }

  function createForm() {
    const block = window.AuraUltimateLibrary?.buildSection("form", {
      niche: $("#aura-ultimate-niche", state.modal)?.value || "servicos",
      objective: $("#aura-ultimate-objective", state.modal)?.value || "captar",
      style: $("#aura-ultimate-style", state.modal)?.value || "obsidian"
    }, formEntries().length);
    if (!block) return;
    insertGeneratedBlocks([block], false);
    notifyChange("Formulário criado");
    state.formIndex = currentPageEntries().filter(({ block: item }) => item.tipo === "formulario_captura").slice(-1)[0]?.index ?? -1;
    renderForms();
    toast("Novo formulário adicionado.");
  }

  function renderForms() {
    if (!state.modal) return;
    const forms = formEntries();
    const count = $("#aura-ultimate-form-count", state.modal);
    if (count) count.textContent = String(forms.length);
    if (!forms.some(({ index }) => index === state.formIndex)) state.formIndex = forms[0]?.index ?? -1;
    const list = $("#aura-ultimate-form-list", state.modal);
    if (list) {
      list.innerHTML = forms.length ? forms.map(({ block, index }, position) => `
        <button type="button" class="aura-ultimate-form-item ${state.formIndex === index ? "is-active" : ""}" data-form-index="${index}">
          <b>${String(position + 1).padStart(2, "0")}</b><span><strong>${escapeHTML(block.props?.titulo || "Formulário")}</strong><small>${(block.props?.campos || []).join(" · ") || "Sem campos"}</small></span>
        </button>
      `).join("") : '<div class="aura-ultimate-empty">Nenhum formulário nesta página.</div>';
      $$('[data-form-index]', list).forEach((button) => button.addEventListener("click", () => {
        state.formIndex = Number(button.dataset.formIndex);
        renderForms();
      }));
    }
    renderFormEditor();
  }

  function renderFormEditor() {
    const root = $("#aura-ultimate-form-editor", state.modal);
    if (!root) return;
    const block = getBlocks()[state.formIndex];
    if (!block || block.tipo !== "formulario_captura") {
      root.innerHTML = '<div class="aura-ultimate-empty aura-ultimate-form-empty">Crie ou selecione um formulário para editar.</div>';
      return;
    }
    const fields = Array.isArray(block.props.campos) ? block.props.campos : [];
    const meta = block.props._auraForm || {};
    root.innerHTML = `
      <div class="aura-ultimate-card-title"><strong>Configuração do formulário</strong><span>${escapeHTML(block.design?.idSecao || "sem âncora")}</span></div>
      <label class="aura-ultimate-field"><span>Título</span><input id="aura-ultimate-form-title" value="${escapeHTML(block.props.titulo || "")}"></label>
      <label class="aura-ultimate-field"><span>Texto do botão</span><input id="aura-ultimate-form-button" value="${escapeHTML(block.props.textoBotao || "Enviar")}"></label>
      <div class="aura-ultimate-form-fields"><span>Campos</span>
        ${["nome", "whatsapp", "email"].map((field) => `<label class="aura-ultimate-check"><input type="checkbox" data-form-field="${field}" ${fields.includes(field) ? "checked" : ""}><span>${field}</span></label>`).join("")}
      </div>
      <div class="aura-ultimate-field-grid">
        <label class="aura-ultimate-field"><span>Prioridade sugerida</span><select id="aura-ultimate-form-priority"><option value="baixa" ${meta.prioridade === "baixa" ? "selected" : ""}>Baixa</option><option value="normal" ${!meta.prioridade || meta.prioridade === "normal" ? "selected" : ""}>Normal</option><option value="alta" ${meta.prioridade === "alta" ? "selected" : ""}>Alta</option></select></label>
        <label class="aura-ultimate-field"><span>Status inicial sugerido</span><select id="aura-ultimate-form-status"><option value="novo" ${!meta.status || meta.status === "novo" ? "selected" : ""}>Novo</option><option value="contato" ${meta.status === "contato" ? "selected" : ""}>Em contato</option></select></label>
        <label class="aura-ultimate-field"><span>Retorno sugerido</span><select id="aura-ultimate-form-followup"><option value="0" ${!meta.followupDias ? "selected" : ""}>Não agendar</option><option value="1" ${Number(meta.followupDias) === 1 ? "selected" : ""}>1 dia</option><option value="3" ${Number(meta.followupDias) === 3 ? "selected" : ""}>3 dias</option><option value="7" ${Number(meta.followupDias) === 7 ? "selected" : ""}>7 dias</option></select></label>
        <label class="aura-ultimate-field"><span>Origem interna</span><input id="aura-ultimate-form-source" value="${escapeHTML(meta.origem || "landing-page")}"></label>
      </div>
      <div class="aura-ultimate-action-row"><button type="button" class="aura-ultimate-secondary-button" id="aura-ultimate-form-focus">Selecionar no editor</button><button type="button" class="aura-ultimate-primary-button" id="aura-ultimate-form-save">Salvar formulário</button></div>
    `;
    $("#aura-ultimate-form-focus", root)?.addEventListener("click", () => { window.AuraStudioInspector?.select?.(state.formIndex); close(); });
    $("#aura-ultimate-form-save", root)?.addEventListener("click", saveForm);
  }

  function saveForm() {
    const block = getBlocks()[state.formIndex];
    if (!block || block.tipo !== "formulario_captura") return;
    const fields = $$('[data-form-field]', state.modal).filter((input) => input.checked).map((input) => input.dataset.formField);
    if (!fields.length) {
      toast("Selecione pelo menos um campo.", "error");
      return;
    }
    block.props.titulo = $("#aura-ultimate-form-title", state.modal)?.value.trim() || "Preencha seus dados";
    block.props.textoBotao = $("#aura-ultimate-form-button", state.modal)?.value.trim() || "Enviar";
    block.props.campos = fields;
    block.props._auraForm = {
      prioridade: $("#aura-ultimate-form-priority", state.modal)?.value || "normal",
      status: $("#aura-ultimate-form-status", state.modal)?.value || "novo",
      followupDias: Number($("#aura-ultimate-form-followup", state.modal)?.value || 0),
      origem: $("#aura-ultimate-form-source", state.modal)?.value.trim() || "landing-page"
    };
    block.design = block.design || {};
    block.design.idSecao = block.design.idSecao || "contato";
    notifyChange("Formulário atualizado");
    toast("Formulário atualizado.");
  }

  function renderImageReport() {
    const root = $("#aura-ultimate-image-report", state.modal);
    if (!root) return;
    const issues = [];
    let imageCount = 0;
    currentPageEntries().forEach(({ block, index }) => {
      const main = block.props?.imagemB64;
      const background = block.design?.imagemFundoB64;
      const gallery = Array.isArray(block.props?.imagens) ? block.props.imagens : [];
      const banners = Array.isArray(block.props?.banners) ? block.props.banners : [];
      const all = [main, background, ...gallery, ...banners].filter(Boolean);
      imageCount += all.length;
      if (main && !block.props?.imagemAlt) issues.push({ index, text: `${blockTitle(block)} possui imagem principal sem texto alternativo.` });
      all.forEach((image) => {
        if (typeof image === "string" && image.length > 700000) issues.push({ index, text: `${blockTitle(block)} possui uma imagem grande armazenada no documento.` });
      });
    });
    root.innerHTML = `
      <div class="aura-ultimate-card-title"><strong>Relatório de mídia</strong><span>${imageCount} imagens</span></div>
      ${issues.length ? issues.map((issue) => `<button type="button" class="aura-ultimate-report-item" data-image-issue="${issue.index}"><span>!</span><strong>${escapeHTML(issue.text)}</strong><small>Selecionar bloco</small></button>`).join("") : '<div class="aura-ultimate-success-state">Nenhum problema evidente encontrado nas imagens atuais.</div>'}
    `;
    $$('[data-image-issue]', root).forEach((button) => button.addEventListener("click", () => {
      window.AuraStudioInspector?.select?.(Number(button.dataset.imageIssue));
      close();
    }));
  }

  function pagePayload() {
    return {
      schema: "vide-aura-studio-page",
      version: 3,
      exportedAt: new Date().toISOString(),
      title: document.getElementById("lped-titulo")?.value || "Landing Page",
      slug: document.getElementById("lped-slug")?.value || "landing-page",
      pageId: currentPageId(),
      blocks: clone(currentPageEntries().map(({ block }) => block))
    };
  }

  function projectPayload() {
    return {
      schema: "vide-aura-studio-project",
      version: 3,
      exportedAt: new Date().toISOString(),
      title: document.getElementById("lped-titulo")?.value || "Landing Page",
      slug: document.getElementById("lped-slug")?.value || "landing-page",
      blocks: clone(getBlocks())
    };
  }

  function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
    downloadBlob(blob, filename);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportCurrentPage() {
    const payload = pagePayload();
    downloadJSON(payload, `${slugify(payload.slug)}-pagina.json`);
    toast("Página exportada em JSON.");
  }

  function exportProject() {
    const payload = projectPayload();
    downloadJSON(payload, `${slugify(payload.slug)}-projeto-completo.json`);
    toast("Backup completo exportado.");
  }

  async function copyCurrentPageJSON() {
    const text = JSON.stringify(pagePayload(), null, 2);
    try {
      await navigator.clipboard.writeText(text);
      toast("Estrutura copiada.");
    } catch (_) {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      toast("Estrutura copiada.");
    }
  }

  function validateImportedBlocks(blocks) {
    if (!Array.isArray(blocks)) throw new Error("O arquivo não possui uma lista válida de blocos.");
    return blocks.filter((block) => block && typeof block === "object" && SUPPORTED_TYPES.has(block.tipo));
  }

  async function importJSON(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const blocks = validateImportedBlocks(data.blocks);
      if (!blocks.length) throw new Error("Nenhum bloco compatível foi encontrado.");
      const replace = window.confirm("Substituir os blocos da página atual? Clique em Cancelar para adicionar ao final.");
      createVersion("Antes da importação JSON");
      insertGeneratedBlocks(blocks, replace);
      if (replace && data.title && document.getElementById("lped-titulo")) document.getElementById("lped-titulo").value = data.title;
      notifyChange("JSON importado");
      toast(`${blocks.length} bloco(s) importado(s).`);
    } catch (error) {
      console.error("[Aura Ultimate] Erro de importação", error);
      toast(error.message || "Arquivo JSON inválido.", "error");
    } finally {
      event.target.value = "";
    }
  }

  function renderStandaloneBlock(block) {
    const design = block.design || {};
    const props = block.props || {};
    const sectionStyle = `background:${design.corFundo || "#0B1020"};color:${design.corTexto || "#F8FAFC"};padding:${Number(design.paddingTop ?? 64)}px 24px ${Number(design.paddingBottom ?? 64)}px;text-align:${design.alinhamento === "centro" ? "center" : design.alinhamento === "direita" ? "right" : "left"};`;
    const buttonStyle = `background:${design.corBotaoFundo || "#7C3AED"};color:${design.corBotaoTexto || "#FFFFFF"};border:1px solid ${design.corBotaoBorda || design.corBotaoFundo || "#7C3AED"};`;
    let content = "";
    if (block.tipo === "navegacao") {
      content = `<div class="nav"><strong>${escapeHTML(props.logoTexto || "Sua Marca")}</strong><div>${(props.links || []).map((link) => `<a href="${escapeHTML(link.href || "#")}">${escapeHTML(link.label || "Link")}</a>`).join("")}</div></div>`;
    } else if (block.tipo === "texto_midia") {
      content = `<div class="split ${props.posicaoImagem === "esquerda" ? "reverse" : ""}"><div><h2>${escapeHTML(props.titulo || "")}</h2><p>${escapeHTML(props.subtitulo || "")}</p>${props.botaoTexto ? `<a class="btn" style="${buttonStyle}" href="${escapeHTML(props.botaoLink || "#")}">${escapeHTML(props.botaoTexto)}</a>` : ""}</div><div>${props.imagemB64 ? `<img src="${props.imagemB64}" alt="${escapeHTML(props.imagemAlt || props.titulo || "Imagem")}">` : '<div class="placeholder"></div>'}</div></div>`;
    } else if (block.tipo === "lista_cards") {
      content = `<h2>${escapeHTML(props.titulo || "")}</h2><div class="cards">${(props.cards || []).map((card) => `<article><b>${escapeHTML(card.icone || "")}</b><h3>${escapeHTML(card.titulo || "")}</h3><p>${escapeHTML(card.texto || "")}</p></article>`).join("")}</div>`;
    } else if (block.tipo === "texto_rico") {
      content = `<div class="rich"><h2>${escapeHTML(props.titulo || "")}</h2>${String(props.conteudo || "").split(/\n\s*\n/).map((p) => `<p>${escapeHTML(p)}</p>`).join("")}</div>`;
    } else if (block.tipo === "faq") {
      content = `<div class="rich"><h2>${escapeHTML(props.titulo || "")}</h2>${(props.itens || []).map((item) => `<details><summary>${escapeHTML(item.pergunta || "")}</summary><p>${escapeHTML(item.resposta || "")}</p></details>`).join("")}</div>`;
    } else if (block.tipo === "formulario_captura") {
      content = `<form class="form" onsubmit="event.preventDefault();alert('Formulário demonstrativo. Conecte o envio no Vide Hub para receber os leads.');"><h2>${escapeHTML(props.titulo || "")}</h2>${(props.campos || []).map((field) => `<input required placeholder="${escapeHTML(field)}">`).join("")}<button class="btn" style="${buttonStyle}">${escapeHTML(props.textoBotao || "Enviar")}</button></form>`;
    } else if (block.tipo === "galeria_imagens") {
      content = `<h2>${escapeHTML(props.titulo || "")}</h2><div class="gallery">${(props.imagens || []).map((image) => `<img src="${image}" alt="Galeria">`).join("")}</div>`;
    } else if (block.tipo === "carrossel_cards") {
      content = `<h2>${escapeHTML(props.titulo || "")}</h2><div class="cards">${(props.cards || []).map((card) => `<article>${card.imagemB64 ? `<img src="${card.imagemB64}" alt="">` : ""}<h3>${escapeHTML(card.titulo || "")}</h3><p>${escapeHTML(card.texto || "")}</p></article>`).join("")}</div>`;
    } else if (block.tipo === "tabela_comparativo") {
      content = `<h2>${escapeHTML(props.titulo || "")}</h2><table><thead><tr><th></th><th>${escapeHTML(props.coluna1 || "")}</th><th>${escapeHTML(props.coluna2 || "")}</th></tr></thead><tbody>${(props.linhas || []).map((row) => `<tr><td>${escapeHTML(row.label || "")}</td><td>${escapeHTML(row.valor1 || "")}</td><td>${escapeHTML(row.valor2 || "")}</td></tr>`).join("")}</tbody></table>`;
    } else if (block.tipo === "carrossel_produtos") {
      content = `<h2>${escapeHTML(props.titulo || "Produtos")}</h2><div class="placeholder products">Produtos conectados ao catálogo do Vide Hub</div>`;
    } else if (block.tipo === "carrossel_banners") {
      content = `<div class="gallery">${(props.banners || []).map((image) => `<img src="${typeof image === "string" ? image : image.imagemB64 || ""}" alt="Banner">`).join("")}</div>`;
    } else if (block.tipo === "rodape") {
      content = `<footer><p>${escapeHTML(props.textoCopyright || "")}</p><div>${(props.links || []).map((link) => `<a href="${escapeHTML(link.href || "#")}">${escapeHTML(link.label || "Link")}</a>`).join("")}</div></footer>`;
    } else {
      content = `<div class="rich"><h2>${escapeHTML(blockTitle(block))}</h2><p>Bloco ${escapeHTML(blockLabel(block))}</p></div>`;
    }
    const background = design.imagemFundoB64 ? `background-image:linear-gradient(rgba(0,0,0,${Number(design.opacidadeSobreposicao || 35) / 100}),rgba(0,0,0,${Number(design.opacidadeSobreposicao || 35) / 100})),url('${design.imagemFundoB64}');background-size:cover;background-position:center;` : "";
    return `<section id="${escapeHTML(design.idSecao || "")}" style="${sectionStyle}${background}"><div class="container">${content}</div></section>`;
  }

  function standaloneHTMLDocument() {
    const payload = pagePayload();
    const blocksHTML = payload.blocks.filter((block) => block.visivel !== false).map(renderStandaloneBlock).join("\n");
    return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(payload.title)}</title>
<style>*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font-family:Inter,Arial,sans-serif;background:#070A12;color:#F8FAFC}a{text-decoration:none;color:inherit}.container{width:min(1120px,100%);margin:auto}.nav{display:flex;align-items:center;justify-content:space-between;gap:24px}.nav div{display:flex;gap:18px;flex-wrap:wrap}.split{display:grid;grid-template-columns:1.05fr .95fr;align-items:center;gap:48px}.split.reverse>div:first-child{order:2}.split img,.gallery img,.cards img{max-width:100%;border-radius:20px;display:block}.split h2,.rich h2,section>div>h2{font-size:clamp(32px,5vw,68px);line-height:1.02;margin:0 0 18px}.split p,.rich p,.cards p{line-height:1.7;opacity:.78}.btn{display:inline-flex;padding:14px 22px;border-radius:12px;font-weight:800;margin-top:18px}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.cards article,.form,details{padding:24px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);border-radius:18px}.gallery{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.gallery img{width:100%;height:220px;object-fit:cover}.form{max-width:520px;margin:auto}.form input{width:100%;padding:14px;border-radius:10px;border:1px solid rgba(255,255,255,.15);margin:7px 0;background:rgba(255,255,255,.08);color:inherit}.form button{width:100%}.placeholder{min-height:220px;border:1px dashed rgba(255,255,255,.2);display:grid;place-items:center;border-radius:18px;opacity:.65}table{width:100%;border-collapse:collapse}td,th{padding:14px;border-bottom:1px solid rgba(255,255,255,.12);text-align:left}details{margin:10px 0}summary{font-weight:800;cursor:pointer}footer{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap}footer div{display:flex;gap:16px}@media(max-width:760px){.split{grid-template-columns:1fr}.split.reverse>div:first-child{order:0}.cards{grid-template-columns:1fr}.gallery{grid-template-columns:1fr 1fr}.nav{align-items:flex-start;flex-direction:column}.nav div{gap:10px}section{padding-left:18px!important;padding-right:18px!important}}</style></head><body>${blocksHTML}</body></html>`;
  }

  function exportStandaloneHTML() {
    const html = standaloneHTMLDocument();
    downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), `${slugify(document.getElementById("lped-slug")?.value || "landing-page")}-standalone.html`);
    toast("HTML independente exportado.");
  }

  function copySelectedBlocks() {
    const entries = selectedEntries();
    if (!entries.length) {
      toast("Selecione um ou mais blocos.", "error");
      return;
    }
    localStorage.setItem("auraUltimateBlockClipboard", JSON.stringify(entries.map(({ block }) => clone(block))));
    toast(`${entries.length} bloco(s) copiado(s).`);
  }

  function pasteBlocks() {
    let blocks;
    try { blocks = JSON.parse(localStorage.getItem("auraUltimateBlockClipboard") || "null"); } catch (_) { blocks = null; }
    if (!Array.isArray(blocks) || !blocks.length) {
      toast("Nenhum bloco copiado.", "error");
      return;
    }
    insertGeneratedBlocks(blocks, false);
    notifyChange("Blocos colados");
    toast(`${blocks.length} bloco(s) colado(s).`);
  }

  function auditPage() {
    const entries = currentPageEntries();
    const issues = [];
    const metrics = { structure: 100, conversion: 100, accessibility: 100, media: 100, links: 100 };
    const title = document.getElementById("lped-titulo")?.value.trim();
    const slug = document.getElementById("lped-slug")?.value.trim();
    const types = entries.map(({ block }) => block.tipo);
    const anchors = new Map();

    const add = (category, severity, titleText, detail, index) => {
      issues.push({ category, severity, title: titleText, detail, index });
      const deductions = { high: 18, medium: 10, low: 5 };
      metrics[category] = Math.max(0, metrics[category] - deductions[severity]);
    };

    if (!title) add("structure", "high", "Título da Landing Page ausente", "Defina um título para identificar e publicar a página.");
    if (!slug) add("structure", "high", "Slug ausente", "Defina um endereço curto para a página.");
    if (!entries.length) add("structure", "high", "Página sem blocos", "Adicione uma composição ou pelo menos uma seção.");
    if (!types.includes("navegacao")) add("structure", "low", "Cabeçalho não encontrado", "Uma navegação pode facilitar o entendimento da página.");
    if (!types.includes("rodape")) add("structure", "medium", "Rodapé não encontrado", "Inclua informações finais, contato e links institucionais.");
    if (!CTAEntries().length) add("conversion", "high", "Página sem CTA", "Inclua pelo menos um botão ou formulário.");
    if (!types.includes("formulario_captura") && !CTAEntries().some(({ block }) => String(block.props?.botaoLink || "").includes("wa.me"))) add("conversion", "medium", "Sem captura ou WhatsApp", "Adicione um formulário ou uma ação clara de atendimento.");
    if (!types.includes("carrossel_cards") && !types.includes("lista_cards")) add("conversion", "low", "Pouca prova ou argumentação", "Use cards, benefícios ou depoimentos para reduzir objeções.");

    entries.forEach(({ block, index }, position) => {
      const sectionId = block.design?.idSecao;
      if (!sectionId) add("structure", "low", `Seção ${position + 1} sem âncora`, "Crie um ID para navegação interna.", index);
      else if (anchors.has(sectionId)) add("structure", "medium", `Âncora duplicada: #${sectionId}`, "IDs repetidos podem levar o visitante à seção errada.", index);
      else anchors.set(sectionId, index);

      if (block.tipo === "texto_midia") {
        if (!block.props?.titulo?.trim()) add("conversion", "medium", "Bloco principal sem título", "Inclua uma mensagem clara e objetiva.", index);
        if (block.props?.imagemB64 && !block.props?.imagemAlt?.trim()) add("accessibility", "medium", "Imagem sem texto alternativo", "Descreva a imagem para acessibilidade.", index);
        if (block.props?.botaoTexto && (!block.props?.botaoLink || block.props.botaoLink === "#")) add("links", "medium", `CTA “${block.props.botaoTexto}” sem destino`, "Informe uma âncora ou URL válida.", index);
      }
      if (block.tipo === "formulario_captura" && !(block.props?.campos || []).length) add("conversion", "high", "Formulário sem campos", "Selecione pelo menos nome ou WhatsApp.", index);
      const images = [block.props?.imagemB64, block.design?.imagemFundoB64, ...(block.props?.imagens || [])].filter(Boolean);
      images.forEach((image) => { if (typeof image === "string" && image.length > 700000) add("media", "medium", "Imagem muito pesada", "Edite e compacte a imagem no Studio de Mídia.", index); });
      if (block.design?.visivelDesktop === false && block.design?.visivelMobile === false) add("accessibility", "medium", "Bloco oculto em todos os dispositivos", "Ative pelo menos desktop ou celular.", index);
    });

    CTAEntries().forEach(({ block, index, linkKey }) => {
      if (linkKey) {
        const link = String(block.props?.[linkKey] || "");
        if (link.startsWith("#") && link.length > 1 && !anchors.has(link.slice(1))) add("links", "medium", `Link aponta para ${link}, mas a âncora não existe`, "Crie a âncora ou atualize o link.", index);
      }
    });

    const scores = Object.values(metrics);
    const overall = Math.max(0, Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length));
    return { issues, metrics, overall };
  }

  function renderDiagnostics() {
    if (!state.modal) return;
    const audit = auditPage();
    state.lastAudit = audit;
    const score = $("#aura-ultimate-score", state.modal);
    const ring = $("#aura-ultimate-score-ring", state.modal);
    const title = $("#aura-ultimate-score-title", state.modal);
    const text = $("#aura-ultimate-score-text", state.modal);
    if (score) score.textContent = String(audit.overall);
    if (ring) ring.style.setProperty("--score", audit.overall);
    if (title) title.textContent = audit.overall >= 90 ? "Excelente base para publicar" : audit.overall >= 75 ? "Boa página com ajustes importantes" : audit.overall >= 55 ? "A página precisa de revisão" : "Existem riscos antes da publicação";
    if (text) text.textContent = audit.issues.length ? `${audit.issues.length} ponto(s) precisam de atenção.` : "Nenhum problema relevante foi identificado.";

    const metricsRoot = $("#aura-ultimate-audit-metrics", state.modal);
    if (metricsRoot) {
      const labels = { structure: "Estrutura", conversion: "Conversão", accessibility: "Acessibilidade", media: "Mídia", links: "Links" };
      metricsRoot.innerHTML = Object.entries(audit.metrics).map(([key, value]) => `<div><small>${labels[key]}</small><strong>${value}</strong><span><i style="width:${value}%"></i></span></div>`).join("");
    }
    const issuesRoot = $("#aura-ultimate-issues", state.modal);
    if (issuesRoot) {
      issuesRoot.innerHTML = audit.issues.length ? audit.issues.map((issue) => `
        <button type="button" class="aura-ultimate-issue" data-issue-index="${Number.isInteger(issue.index) ? issue.index : ""}" data-severity="${issue.severity}">
          <span>${issue.severity === "high" ? "!" : issue.severity === "medium" ? "•" : "i"}</span>
          <div><strong>${escapeHTML(issue.title)}</strong><p>${escapeHTML(issue.detail)}</p></div>
          ${Number.isInteger(issue.index) ? "<small>Selecionar bloco</small>" : ""}
        </button>
      `).join("") : '<div class="aura-ultimate-success-state">A página passou em todos os testes do diagnóstico Ultimate.</div>';
      $$('[data-issue-index]', issuesRoot).forEach((button) => button.addEventListener("click", () => {
        const index = Number(button.dataset.issueIndex);
        if (!Number.isInteger(index)) return;
        window.AuraStudioInspector?.select?.(index);
        close();
      }));
    }
    return audit;
  }

  function autoFix() {
    const entries = currentPageEntries();
    if (!entries.length) {
      toast("Adicione blocos antes de corrigir.", "error");
      return;
    }
    createVersion("Antes da correção automática");
    const types = entries.map(({ block }) => block.tipo);
    let changes = 0;
    if (!types.includes("navegacao")) {
      const block = window.AuraUltimateLibrary?.buildSection("navigation", selectedComposerConfig(), 0);
      if (block) {
        const all = getBlocks();
        block.id = `lpb_${Date.now()}_nav_${Math.random().toString(36).slice(2, 6)}`;
        block.paginaId = currentPageId();
        const first = currentPageEntries()[0]?.index ?? 0;
        all.splice(first, 0, block);
        changes += 1;
      }
    }
    if (!types.includes("rodape")) {
      const block = window.AuraUltimateLibrary?.buildSection("footer", selectedComposerConfig(), 0);
      if (block) { insertGeneratedBlocks([block], false); changes += 1; }
    }
    currentPageEntries().forEach(({ block }, position) => {
      block.design = block.design || {};
      if (!block.design.idSecao) { block.design.idSecao = slugify(blockTitle(block) || `${block.tipo}-${position + 1}`); changes += 1; }
      if (block.tipo === "texto_midia") {
        if (!block.props.titulo?.trim()) { block.props.titulo = "Uma mensagem clara para apresentar sua proposta"; changes += 1; }
        if (block.props.imagemB64 && !block.props.imagemAlt?.trim()) { block.props.imagemAlt = block.props.titulo; changes += 1; }
        if (block.props.botaoTexto && (!block.props.botaoLink || block.props.botaoLink === "#")) { block.props.botaoLink = "#contato"; changes += 1; }
      }
      if (block.tipo === "formulario_captura" && !(block.props.campos || []).length) { block.props.campos = ["nome", "whatsapp"]; changes += 1; }
      if (block.design.visivelDesktop === false && block.design.visivelMobile === false) { block.design.visivelDesktop = true; changes += 1; }
    });
    generateAnchors();
    notifyChange("Correções automáticas aplicadas");
    toast(`${changes} correção(ões) aplicada(s).`);
    renderDiagnostics();
  }

  function setTab(tab) {
    state.activeTab = tab || "compose";
    $$('[data-ultimate-tab]', state.modal).forEach((button) => button.classList.toggle("is-active", button.dataset.ultimateTab === state.activeTab));
    $$('[data-ultimate-panel]', state.modal).forEach((panel) => panel.classList.toggle("is-active", panel.dataset.ultimatePanel === state.activeTab));
    const subtitles = {
      compose: "Monte páginas completas com combinações dinâmicas.", content: "Padronize mensagens, CTAs, links e âncoras.", design: "Crie consistência visual em toda a página.", forms: "Configure pontos de captura e contexto operacional.", assets: "Reutilize e otimize imagens no navegador.", export: "Faça backup, importe e leve sua estrutura.", diagnostics: "Revise qualidade e corrija problemas antes de publicar."
    };
    const subtitle = $("#aura-ultimate-subtitle", state.modal);
    if (subtitle) subtitle.textContent = subtitles[state.activeTab] || subtitles.compose;
    if (state.activeTab === "content") renderContentOverview();
    if (state.activeTab === "design") renderDesignOverview();
    if (state.activeTab === "forms") renderForms();
    if (state.activeTab === "assets") renderImageReport();
    if (state.activeTab === "diagnostics") renderDiagnostics();
  }

  function open(tab) {
    injectModal();
    state.modal.classList.remove("hidden");
    setTab(tab || state.activeTab);
    populateComposer();
    renderContentOverview();
    renderDesignOverview();
    renderForms();
    renderImageReport();
  }

  function close() {
    state.modal?.classList.add("hidden");
  }

  function bindKeyboard() {
    document.addEventListener("keydown", (event) => {
      const key = String(event.key || "").toLowerCase();
      const command = event.ctrlKey || event.metaKey;
      const target = event.target;
      const editing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;
      if (event.ctrlKey && event.altKey && key === "u") {
        event.preventDefault();
        open("compose");
        return;
      }
      if (!getModal() || getModal().classList.contains("hidden") || editing || !command) return;
      if (!event.shiftKey && key === "c") {
        const entries = selectedEntries();
        if (entries.length) { event.preventDefault(); copySelectedBlocks(); }
      } else if (!event.shiftKey && key === "v") {
        event.preventDefault();
        pasteBlocks();
      } else if (event.shiftKey && key === "c") {
        event.preventDefault();
        copyStyle();
      } else if (event.shiftKey && key === "v") {
        event.preventDefault();
        pasteStyle();
      }
    });
  }

  function watchEditor() {
    const modal = getModal();
    if (!modal) return;
    state.modalObserver = new MutationObserver(() => {
      if (!modal.classList.contains("hidden")) {
        injectLauncher();
        injectQuickRail();
      }
    });
    state.modalObserver.observe(modal, { attributes: true, attributeFilter: ["class"] });
    const list = document.getElementById("lped-blocos-lista");
    if (list) {
      state.observer = new MutationObserver(() => {
        if (!state.modal?.classList.contains("hidden")) {
          renderContentOverview();
          renderDesignOverview();
          renderForms();
        }
      });
      state.observer.observe(list, { childList: true, subtree: true });
    }
  }

  function init() {
    if (state.initialized) return;
    if (!getModal() || !window.AuraUltimateLibrary || !window.AuraStudioPro || !window.AuraStudioMax || !window.AuraStudioInspector) {
      setTimeout(init, 180);
      return;
    }
    state.initialized = true;
    injectModal();
    injectLauncher();
    injectQuickRail();
    populateComposer();
    setTab("compose");
    bindKeyboard();
    watchEditor();
    document.addEventListener("aura:studio-change", () => {
      renderContentOverview();
      renderDesignOverview();
      renderForms();
    });
    document.addEventListener("aura:studio-selection", () => {
      renderDesignOverview();
      renderForms();
    });
    window.AuraStudioUltimate = {
      open,
      close,
      setTab,
      generateComposition,
      exportCurrentPage,
      exportProject,
      exportStandaloneHTML,
      copySelectedBlocks,
      pasteBlocks,
      renderDiagnostics,
      autoFix,
      state,
      version: "3.0.0-ultimate"
    };
    console.info("[Vide Aura Studio Ultimate] Inicializado", {
      presets: window.AURA_STUDIO_PRESETS?.length || 0,
      dynamicCombinations: window.AuraUltimateLibrary?.estimatedCombinations || 0,
      version: "3.0.0-ultimate"
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
