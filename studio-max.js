(function () {
  "use strict";

  const state = {
    initialized: false,
    modalOpen: false,
    selectedIds: new Set(),
    layerQuery: "",
    versionLimit: 35,
    autoVersionLimit: 12,
    draftTimer: null,
    metaTimer: null,
    modalObserver: null,
    listObserver: null,
    lastHash: "",
    lastSavedHash: "",
    activePalette: "obsidian",
    themeRadius: 18,
    themeSpacing: 72,
    themeShadow: "soft",
    generatorMode: "replace",
    maxPanel: null
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

  function getModal() {
    return document.getElementById("lp-editor-modal");
  }

  function getBlocks() {
    return Array.isArray(window.lpEditorBlocos) ? window.lpEditorBlocos : [];
  }

  function ensureBlockIds() {
    getBlocks().forEach((block, index) => {
      if (!block.id) block.id = `lpb_max_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 7)}`;
    });
  }

  function currentPageId() {
    const selected = document.querySelector("#lped-barra-paginas button.bg-\\[\\#FF7A45\\]");
    const onclick = selected?.getAttribute("onclick") || "";
    const match = onclick.match(/trocarPaginaLP\('([^']+)'\)/);
    if (match) return match[1];
    return getBlocks().find((block) => block?.paginaId)?.paginaId || "pg_1";
  }

  function currentPageBlocks() {
    const blocks = getBlocks();
    const pageId = currentPageId();
    const hasPages = blocks.some((block) => block?.paginaId);
    return blocks
      .map((block, index) => ({ block, index }))
      .filter(({ block }) => !hasPages || !block?.paginaId || block.paginaId === pageId);
  }

  function selectedEntries() {
    ensureBlockIds();
    return currentPageBlocks().filter(({ block }) => state.selectedIds.has(block.id));
  }

  function selectedCount() {
    return selectedEntries().length;
  }

  function notifyChange(label) {
    window.renderizarEditorBlocos?.();
    document.getElementById("lped-blocos-lista")?.dispatchEvent(new Event("input", { bubbles: true }));
    document.dispatchEvent(new CustomEvent("aura:studio-change", { detail: { source: "studio-max", label } }));
    document.dispatchEvent(new CustomEvent("aura:studio-history-capture", { detail: { label: label || "Alteração" } }));
    scheduleMetaUpdate();
    setTimeout(() => {
      renderLayers();
      updateSelectionBar();
    }, 60);
  }

  function hashBlocks(blocks) {
    const text = JSON.stringify(blocks || []);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function pageIdentity() {
    const title = document.getElementById("lped-titulo")?.value || "landing-page";
    const slug = document.getElementById("lped-slug")?.value || "sem-slug";
    return `${slug.replace(/[^a-z0-9_-]/gi, "-")}:${currentPageId()}:${title.slice(0, 40)}`;
  }

  function storageKey(type) {
    return `auraStudioMax:${type}:${pageIdentity()}`;
  }

  function readJSON(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "null");
      return parsed ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn("[Aura Studio MAX] Não foi possível salvar no navegador", error);
      return false;
    }
  }

  function toast(message, type) {
    if (typeof window.showToast === "function") window.showToast(message, type);
    else console.info(`[Aura Studio MAX] ${message}`);
  }

  function confirmAction(message, callback) {
    if (typeof window.abrirConfirmacao === "function") {
      window.abrirConfirmacao(message, callback);
      return;
    }
    if (window.confirm(message)) callback();
  }

  function injectStylesLinkGuard() {
    if (document.querySelector('link[href$="studio-max.css"]')) return;
    console.warn("[Aura Studio MAX] studio-max.css não foi encontrado no HTML.");
  }

  function injectLauncher() {
    const topbar = getModal()?.querySelector(":scope > .aura-lped-topbar");
    if (!topbar || document.getElementById("aura-max-launcher")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.id = "aura-max-launcher";
    button.className = "aura-max-launcher";
    button.title = "Central MAX (Ctrl+Alt+M)";
    button.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m12 3 2.4 4.9L20 9l-4 3.9.9 5.6L12 16l-4.9 2.5.9-5.6L4 9l5.6-1.1L12 3Z"></path></svg>
      <span><small>Studio</small><b>MAX</b></span>
    `;
    button.addEventListener("click", openHub);
    const firstActions = topbar.querySelector(".flex.items-center.gap-2");
    if (firstActions) firstActions.appendChild(button);
    else topbar.appendChild(button);
  }

  function injectDock() {
    const modal = getModal();
    if (!modal || document.getElementById("aura-max-dock")) return;
    const dock = document.createElement("nav");
    dock.id = "aura-max-dock";
    dock.className = "aura-max-dock";
    dock.setAttribute("aria-label", "Ferramentas avançadas do Studio");
    dock.innerHTML = `
      <button type="button" data-max-open="generator" title="Gerador inteligente"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m12 3 1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3Z"></path><path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z"></path></svg><span>Gerar</span></button>
      <button type="button" data-max-open="theme" title="Tema global"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9"></circle><path d="M12 3a9 9 0 0 0 0 18c1.7 0 2.5-1.6 1.5-2.8-.8-1 .1-2.2 1.4-1.9 3.2.7 6.1-1.7 6.1-4.8A8.5 8.5 0 0 0 12 3Z"></path><circle cx="8" cy="9" r="1"></circle><circle cx="12" cy="7" r="1"></circle><circle cx="16" cy="9" r="1"></circle></svg><span>Tema</span></button>
      <button type="button" data-max-open="versions" title="Versões e recuperação"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path><path d="M3 3v5h5"></path><path d="M12 7v5l3 2"></path></svg><span>Versões</span></button>
      <button type="button" data-max-open="layers" title="Camadas profissionais"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m12 3 8 4-8 4-8-4 8-4Z"></path><path d="m4 12 8 4 8-4"></path><path d="m4 17 8 4 8-4"></path></svg><span>Camadas</span><b id="aura-max-selection-badge" class="hidden">0</b></button>
      <button type="button" data-max-open="media" title="Studio de mídia"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="16" rx="3"></rect><circle cx="9" cy="10" r="2"></circle><path d="m4 18 5-5 4 4 3-3 4 4"></path></svg><span>Mídia</span></button>
      <button type="button" data-max-open="audit" title="Auditoria da página"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 11 12 14 22 4"></path><path d="M21 12a9 9 0 1 1-5.3-8.2"></path></svg><span>Auditar</span></button>
    `;
    modal.appendChild(dock);
    $$('[data-max-open]', dock).forEach((button) => button.addEventListener("click", () => {
      const target = button.dataset.maxOpen;
      if (target === "media") window.AuraStudioMedia?.open?.();
      else if (target === "audit") window.AuraStudioPro?.openAudit?.();
      else openPanel(target);
    }));
  }

  function injectHub() {
    const modal = getModal();
    if (!modal || document.getElementById("aura-max-hub")) return;
    const hub = document.createElement("div");
    hub.id = "aura-max-hub";
    hub.className = "aura-max-modal hidden";
    hub.innerHTML = `
      <div class="aura-max-modal-backdrop" data-max-close="hub"></div>
      <section class="aura-max-hub-shell" role="dialog" aria-modal="true" aria-labelledby="aura-max-hub-title">
        <header class="aura-max-panel-header">
          <div class="aura-max-panel-heading"><span class="aura-max-panel-icon is-max"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m12 3 2.4 4.9L20 9l-4 3.9.9 5.6L12 16l-4.9 2.5.9-5.6L4 9l5.6-1.1L12 3Z"></path></svg></span><div><small>Vide Aura Studio</small><h2 id="aura-max-hub-title">Central MAX</h2><p>Criação, organização, qualidade e recuperação em um único lugar.</p></div></div>
          <button type="button" class="aura-max-icon-button" data-max-close="hub"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m6 6 12 12"></path><path d="M18 6 6 18"></path></svg></button>
        </header>
        <div class="aura-max-hub-hero">
          <div><small>Estado da página</small><strong id="aura-max-hub-page">Landing Page</strong><span id="aura-max-hub-summary">0 blocos · Tudo salvo</span></div>
          <div class="aura-max-hub-score"><span id="aura-max-hub-score">—</span><small>Qualidade</small></div>
        </div>
        <div class="aura-max-hub-grid">
          ${hubCard("generator", "Gerador inteligente", "Monte uma página completa por objetivo, nicho e estilo.", "spark")}
          ${hubCard("theme", "Tema global", "Aplique identidade visual consistente em todos os blocos.", "palette")}
          ${hubCard("layers", "Camadas profissionais", "Selecione, bloqueie, alinhe, distribua e agrupe seções.", "layers")}
          ${hubCard("versions", "Versões e recuperação", "Crie checkpoints, compare e restaure sem perder trabalho.", "history")}
          ${hubCard("media", "Studio de mídia", "Enquadre, ajuste, comprima e aplique imagens no navegador.", "image")}
          ${hubCard("audit", "Auditoria de qualidade", "Revise SEO, conversão, acessibilidade e estrutura.", "audit")}
        </div>
        <footer class="aura-max-hub-footer"><span><kbd>Ctrl</kbd><kbd>Alt</kbd><kbd>M</kbd> abre esta central</span><button type="button" class="aura-max-secondary-button" data-max-close="hub">Fechar</button></footer>
      </section>
    `;
    modal.appendChild(hub);
    $$('[data-max-close="hub"]', hub).forEach((button) => button.addEventListener("click", closeHub));
    $$('[data-hub-open]', hub).forEach((button) => button.addEventListener("click", () => {
      closeHub();
      const target = button.dataset.hubOpen;
      if (target === "media") window.AuraStudioMedia?.open?.();
      else if (target === "audit") window.AuraStudioPro?.openAudit?.();
      else openPanel(target);
    }));
  }

  function hubCard(id, title, text, icon) {
    const icons = {
      spark: '<path d="m12 3 1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3Z"></path><path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z"></path>',
      palette: '<circle cx="12" cy="12" r="9"></circle><path d="M12 3a9 9 0 0 0 0 18c1.7 0 2.5-1.6 1.5-2.8-.8-1 .1-2.2 1.4-1.9 3.2.7 6.1-1.7 6.1-4.8A8.5 8.5 0 0 0 12 3Z"></path>',
      layers: '<path d="m12 3 8 4-8 4-8-4 8-4Z"></path><path d="m4 12 8 4 8-4"></path><path d="m4 17 8 4 8-4"></path>',
      history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path><path d="M3 3v5h5"></path><path d="M12 7v5l3 2"></path>',
      image: '<rect x="3" y="4" width="18" height="16" rx="3"></rect><circle cx="9" cy="10" r="2"></circle><path d="m4 18 5-5 4 4 3-3 4 4"></path>',
      audit: '<path d="M9 11 12 14 22 4"></path><path d="M21 12a9 9 0 1 1-5.3-8.2"></path>'
    };
    return `<button type="button" class="aura-max-hub-card" data-hub-open="${id}"><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor">${icons[icon]}</svg></span><div><strong>${title}</strong><p>${text}</p></div><b>↗</b></button>`;
  }

  function injectPanels() {
    const modal = getModal();
    if (!modal || document.getElementById("aura-max-panel-generator")) return;
    modal.insertAdjacentHTML("beforeend", generatorPanelHTML());
    modal.insertAdjacentHTML("beforeend", themePanelHTML());
    modal.insertAdjacentHTML("beforeend", versionsPanelHTML());
    modal.insertAdjacentHTML("beforeend", layersPanelHTML());

    $$('.aura-max-side-panel [data-max-panel-close]', modal).forEach((button) => button.addEventListener("click", closePanels));
    document.getElementById("aura-max-generator-create")?.addEventListener("click", generatePage);
    $$('[data-generator-mode]').forEach((button) => button.addEventListener("click", () => {
      state.generatorMode = button.dataset.generatorMode;
      $$('[data-generator-mode]').forEach((item) => item.classList.toggle("is-active", item === button));
      updateGeneratorPreview();
    }));
    ["aura-max-generator-niche", "aura-max-generator-objective", "aura-max-generator-style"].forEach((id) => document.getElementById(id)?.addEventListener("change", updateGeneratorPreview));

    document.getElementById("aura-max-theme-apply")?.addEventListener("click", applyTheme);
    document.getElementById("aura-max-theme-primary")?.addEventListener("input", syncCustomTheme);
    document.getElementById("aura-max-theme-accent")?.addEventListener("input", syncCustomTheme);
    document.getElementById("aura-max-theme-bg")?.addEventListener("input", syncCustomTheme);
    document.getElementById("aura-max-theme-text")?.addEventListener("input", syncCustomTheme);
    document.getElementById("aura-max-theme-radius")?.addEventListener("input", (event) => { state.themeRadius = Number(event.target.value); document.getElementById("aura-max-theme-radius-value").textContent = `${state.themeRadius}px`; });
    document.getElementById("aura-max-theme-spacing")?.addEventListener("input", (event) => { state.themeSpacing = Number(event.target.value); document.getElementById("aura-max-theme-spacing-value").textContent = `${state.themeSpacing}px`; });
    document.getElementById("aura-max-theme-shadow")?.addEventListener("change", (event) => { state.themeShadow = event.target.value; });

    document.getElementById("aura-max-version-create")?.addEventListener("click", createManualVersion);
    document.getElementById("aura-max-version-name")?.addEventListener("keydown", (event) => { if (event.key === "Enter") createManualVersion(); });

    document.getElementById("aura-max-layer-search")?.addEventListener("input", (event) => { state.layerQuery = event.target.value; renderLayers(); });
    document.getElementById("aura-max-select-all")?.addEventListener("change", (event) => selectAllLayers(event.target.checked));
    $$('[data-max-bulk-action]').forEach((button) => button.addEventListener("click", () => runBulkAction(button.dataset.maxBulkAction)));
    $$('[data-max-align]').forEach((button) => button.addEventListener("click", () => alignSelected(button.dataset.maxAlign)));
  }

  function panelHeader(id, eyebrow, title, text) {
    return `<header class="aura-max-panel-header"><div class="aura-max-panel-heading"><span class="aura-max-panel-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m12 3 2.4 4.9L20 9l-4 3.9.9 5.6L12 16l-4.9 2.5.9-5.6L4 9l5.6-1.1L12 3Z"></path></svg></span><div><small>${eyebrow}</small><h2>${title}</h2><p>${text}</p></div></div><button type="button" class="aura-max-icon-button" data-max-panel-close="${id}" aria-label="Fechar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m6 6 12 12"></path><path d="M18 6 6 18"></path></svg></button></header>`;
  }

  function generatorPanelHTML() {
    return `<aside id="aura-max-panel-generator" class="aura-max-side-panel hidden" data-max-panel="generator">${panelHeader("generator", "Composição inteligente", "Gerador de Landing Page", "Monte uma estrutura completa usando blocos compatíveis com o seu editor.")}
      <div class="aura-max-panel-content">
        <div class="aura-max-field-grid">
          <label class="aura-max-field"><span>Nicho</span><select id="aura-max-generator-niche"></select></label>
          <label class="aura-max-field"><span>Objetivo</span><select id="aura-max-generator-objective"></select></label>
        </div>
        <label class="aura-max-field"><span>Direção visual</span><select id="aura-max-generator-style"></select></label>
        <div class="aura-max-segmented"><button type="button" class="is-active" data-generator-mode="replace">Substituir página</button><button type="button" data-generator-mode="append">Adicionar ao final</button></div>
        <div id="aura-max-generator-preview" class="aura-max-generator-preview"></div>
        <div class="aura-max-generator-note"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9"></circle><path d="M12 8h.01"></path><path d="M11 12h1v4h1"></path></svg><span>O gerador usa estruturas locais e não envia seus dados para serviços externos.</span></div>
      </div>
      <footer class="aura-max-panel-footer"><div><strong>Composição reversível</strong><span>Uma versão será criada antes da mudança.</span></div><button type="button" class="aura-max-primary-button" id="aura-max-generator-create">Gerar página completa</button></footer>
    </aside>`;
  }

  function themePanelHTML() {
    return `<aside id="aura-max-panel-theme" class="aura-max-side-panel hidden" data-max-panel="theme">${panelHeader("theme", "Identidade consistente", "Tema Global da Página", "Aplique cores, espaçamento, raios e profundidade em todos os blocos.")}
      <div class="aura-max-panel-content">
        <div id="aura-max-theme-palettes" class="aura-max-theme-palettes"></div>
        <section class="aura-max-subsection"><header><small>Paleta personalizada</small><strong>Cores da marca</strong></header><div class="aura-max-color-grid">
          <label><span>Primária</span><input id="aura-max-theme-primary" type="color" value="#7C3AED"></label>
          <label><span>Destaque</span><input id="aura-max-theme-accent" type="color" value="#22D3EE"></label>
          <label><span>Fundo</span><input id="aura-max-theme-bg" type="color" value="#080B14"></label>
          <label><span>Texto</span><input id="aura-max-theme-text" type="color" value="#F8FAFC"></label>
        </div></section>
        <section class="aura-max-subsection"><header><small>Sistema visual</small><strong>Forma e ritmo</strong></header>
          <label class="aura-max-range"><span><b>Arredondamento</b><em id="aura-max-theme-radius-value">18px</em></span><input id="aura-max-theme-radius" type="range" min="0" max="40" value="18"></label>
          <label class="aura-max-range"><span><b>Espaçamento vertical</b><em id="aura-max-theme-spacing-value">72px</em></span><input id="aura-max-theme-spacing" type="range" min="28" max="140" value="72"></label>
          <label class="aura-max-field"><span>Profundidade</span><select id="aura-max-theme-shadow"><option value="none">Sem sombra</option><option value="soft" selected>Suave</option><option value="medium">Média</option><option value="strong">Forte</option><option value="glow">Glow</option></select></label>
        </section>
      </div>
      <footer class="aura-max-panel-footer"><div><strong id="aura-max-theme-count">0 blocos</strong><span>Somente a página atual será alterada.</span></div><button type="button" class="aura-max-primary-button" id="aura-max-theme-apply">Aplicar tema global</button></footer>
    </aside>`;
  }

  function versionsPanelHTML() {
    return `<aside id="aura-max-panel-versions" class="aura-max-side-panel hidden" data-max-panel="versions">${panelHeader("versions", "Segurança criativa", "Versões e Recuperação", "Crie checkpoints e restaure qualquer estado local da página.")}
      <div class="aura-max-panel-content">
        <div class="aura-max-version-create"><input id="aura-max-version-name" type="text" placeholder="Ex: Antes de mudar o Hero"><button type="button" id="aura-max-version-create">Criar versão</button></div>
        <div class="aura-max-version-status"><span><i></i><b>Recuperação automática ativa</b></span><small>Rascunhos locais são atualizados enquanto você edita.</small></div>
        <div id="aura-max-versions-list" class="aura-max-versions-list"></div>
      </div>
      <footer class="aura-max-panel-footer"><div><strong id="aura-max-version-count">0 versões</strong><span>Armazenadas neste navegador.</span></div><button type="button" class="aura-max-secondary-button" data-max-panel-close="versions">Concluir</button></footer>
    </aside>`;
  }

  function layersPanelHTML() {
    return `<aside id="aura-max-panel-layers" class="aura-max-side-panel is-wide hidden" data-max-panel="layers">${panelHeader("layers", "Organização profissional", "Camadas MAX", "Gerencie várias seções sem perder o contexto da página.")}
      <div class="aura-max-layer-toolbar">
        <label class="aura-max-layer-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path></svg><input id="aura-max-layer-search" type="search" placeholder="Pesquisar camadas..."></label>
        <label class="aura-max-select-all"><input id="aura-max-select-all" type="checkbox"><span></span><b>Selecionar tudo</b></label>
      </div>
      <div id="aura-max-layer-list" class="aura-max-layer-list"></div>
      <div id="aura-max-layer-bulk" class="aura-max-layer-bulk hidden">
        <div class="aura-max-layer-bulk-head"><div><strong id="aura-max-layer-selected-count">0 selecionados</strong><span>Ações em lote</span></div><button type="button" data-max-bulk-action="clear">Limpar</button></div>
        <div class="aura-max-align-grid">
          <button type="button" data-max-align="left">Esquerda</button><button type="button" data-max-align="center-x">Centro H</button><button type="button" data-max-align="right">Direita</button>
          <button type="button" data-max-align="top">Topo</button><button type="button" data-max-align="center-y">Centro V</button><button type="button" data-max-align="bottom">Base</button>
          <button type="button" data-max-align="distribute-x">Distribuir H</button><button type="button" data-max-align="distribute-y">Distribuir V</button>
        </div>
        <div class="aura-max-bulk-grid"><button type="button" data-max-bulk-action="duplicate">Duplicar</button><button type="button" data-max-bulk-action="show">Mostrar</button><button type="button" data-max-bulk-action="hide">Ocultar</button><button type="button" data-max-bulk-action="lock">Bloquear</button><button type="button" data-max-bulk-action="component">Salvar componente</button><button type="button" class="is-danger" data-max-bulk-action="delete">Excluir</button></div>
      </div>
      <footer class="aura-max-panel-footer"><div><strong id="aura-max-layer-total">0 camadas</strong><span id="aura-max-layer-mode">Modo empilhado</span></div><button type="button" class="aura-max-secondary-button" data-max-panel-close="layers">Concluir</button></footer>
    </aside>`;
  }

  function injectRecoveryBar() {
    const modal = getModal();
    if (!modal || document.getElementById("aura-max-recovery")) return;
    const bar = document.createElement("div");
    bar.id = "aura-max-recovery";
    bar.className = "aura-max-recovery hidden";
    bar.innerHTML = `<div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path><path d="M3 3v5h5"></path></svg><span><strong>Rascunho local encontrado</strong><small id="aura-max-recovery-time">Alterações recuperáveis neste navegador.</small></span></div><div><button type="button" data-recovery-action="discard">Descartar</button><button type="button" data-recovery-action="restore">Restaurar</button></div>`;
    modal.appendChild(bar);
    $$('[data-recovery-action]', bar).forEach((button) => button.addEventListener("click", () => {
      if (button.dataset.recoveryAction === "restore") restoreDraft();
      else discardDraft();
    }));
  }

  function injectSelectionBar() {
    const modal = getModal();
    if (!modal || document.getElementById("aura-max-selection-bar")) return;
    const bar = document.createElement("div");
    bar.id = "aura-max-selection-bar";
    bar.className = "aura-max-selection-bar hidden";
    bar.innerHTML = `<div><span id="aura-max-selection-count">0</span><b>blocos selecionados</b></div><div><button type="button" data-max-align="left">Alinhar esquerda</button><button type="button" data-max-align="center-x">Centralizar</button><button type="button" data-max-bulk-action="duplicate">Duplicar</button><button type="button" data-max-bulk-action="component">Criar componente</button><button type="button" data-max-bulk-action="clear">Fechar</button></div>`;
    modal.appendChild(bar);
    $$('[data-max-bulk-action]', bar).forEach((button) => button.addEventListener("click", () => runBulkAction(button.dataset.maxBulkAction)));
    $$('[data-max-align]', bar).forEach((button) => button.addEventListener("click", () => alignSelected(button.dataset.maxAlign)));
  }

  function populateGenerator() {
    const niches = window.AURA_STUDIO_MAX_NICHES || [];
    const objectives = window.AURA_STUDIO_MAX_OBJECTIVES || [];
    const styles = window.AURA_STUDIO_MAX_STYLES || [];
    const nicheSelect = document.getElementById("aura-max-generator-niche");
    const objectiveSelect = document.getElementById("aura-max-generator-objective");
    const styleSelect = document.getElementById("aura-max-generator-style");
    if (nicheSelect) nicheSelect.innerHTML = niches.map((item) => `<option value="${escapeHTML(item.id)}">${escapeHTML(item.label)}</option>`).join("");
    if (objectiveSelect) objectiveSelect.innerHTML = objectives.map((item) => `<option value="${escapeHTML(item.id)}">${escapeHTML(item.label)}</option>`).join("");
    if (styleSelect) styleSelect.innerHTML = styles.map((item) => `<option value="${escapeHTML(item.id)}">${escapeHTML(item.label)}</option>`).join("");
    updateGeneratorPreview();
  }

  function selectedGeneratorPreset() {
    const niche = document.getElementById("aura-max-generator-niche")?.value;
    const objective = document.getElementById("aura-max-generator-objective")?.value;
    const style = document.getElementById("aura-max-generator-style")?.value;
    const presets = Array.isArray(window.AURA_STUDIO_PRESETS) ? window.AURA_STUDIO_PRESETS : [];
    return presets.find((item) => item.tipo === "pagina" && item.nicho === niche && item.id === `max-page-${niche}-${objective}`)
      || presets.find((item) => item.tipo === "pagina" && item.nicho === niche)
      || presets.find((item) => item.tipo === "pagina" && item.estilo === style)
      || presets.find((item) => item.tipo === "pagina");
  }

  function updateGeneratorPreview() {
    const root = document.getElementById("aura-max-generator-preview");
    if (!root) return;
    const preset = selectedGeneratorPreset();
    const blocks = preset?.blocos || [];
    const types = [...new Set(blocks.map((block) => block.tipo))];
    root.innerHTML = preset ? `<div class="aura-max-generator-preview-top"><span style="--preview-accent:${escapeHTML(preset.accent || "#7C3AED")}"></span><div><small>Composição selecionada</small><strong>${escapeHTML(preset.nome)}</strong><p>${blocks.length} seções compatíveis com o editor atual.</p></div></div><div class="aura-max-generator-tags">${types.slice(0, 8).map((type) => `<span>${escapeHTML(blockTypeLabel(type))}</span>`).join("")}</div><div class="aura-max-generator-mode-summary"><b>${state.generatorMode === "replace" ? "Substituirá" : "Será adicionada a"}</b> página atual</div>` : `<div class="aura-max-empty">Nenhuma composição compatível foi encontrada.</div>`;
  }

  function generatePage() {
    const preset = selectedGeneratorPreset();
    if (!preset) {
      toast("Não foi possível encontrar uma composição para essas opções.", "error");
      return;
    }
    const action = () => {
      createVersion(`Antes de gerar ${preset.nome}`, "automatic");
      if (state.generatorMode === "replace") {
        const pageId = currentPageId();
        const blocks = getBlocks();
        for (let index = blocks.length - 1; index >= 0; index -= 1) {
          const block = blocks[index];
          if (!block.paginaId || block.paginaId === pageId) blocks.splice(index, 1);
        }
      }
      window.AuraStudioPro?.insertPreset?.(preset.id);
      closePanels();
      setTimeout(() => {
        ensureBlockIds();
        createVersion(`Página gerada · ${preset.nome}`, "automatic");
        notifyChange("Página gerada");
      }, 180);
    };
    if (state.generatorMode === "replace" && currentPageBlocks().length) confirmAction("Substituir todos os blocos da página atual por esta composição? Uma versão de segurança será criada.", action);
    else action();
  }

  function renderThemePalettes() {
    const root = document.getElementById("aura-max-theme-palettes");
    if (!root) return;
    const palettes = window.AURA_STUDIO_MAX_PALETTES || [];
    root.innerHTML = palettes.map((palette) => `<button type="button" class="aura-max-theme-card ${state.activePalette === palette.id ? "is-active" : ""}" data-theme-id="${escapeHTML(palette.id)}"><span><i style="background:${escapeHTML(palette.primary)}"></i><i style="background:${escapeHTML(palette.accent)}"></i><i style="background:${escapeHTML(palette.bg)}"></i></span><strong>${escapeHTML(palette.name)}</strong><small>${escapeHTML(palette.id)}</small></button>`).join("");
    $$('[data-theme-id]', root).forEach((button) => button.addEventListener("click", () => selectPalette(button.dataset.themeId)));
    document.getElementById("aura-max-theme-count").textContent = `${currentPageBlocks().length} blocos`;
  }

  function selectPalette(id) {
    const palette = (window.AURA_STUDIO_MAX_PALETTES || []).find((item) => item.id === id);
    if (!palette) return;
    state.activePalette = id;
    document.getElementById("aura-max-theme-primary").value = palette.primary;
    document.getElementById("aura-max-theme-accent").value = palette.accent;
    document.getElementById("aura-max-theme-bg").value = palette.bg;
    document.getElementById("aura-max-theme-text").value = palette.text;
    renderThemePalettes();
  }

  function syncCustomTheme() {
    state.activePalette = "custom";
    renderThemePalettes();
  }

  function currentThemeValues() {
    return {
      primary: document.getElementById("aura-max-theme-primary")?.value || "#7C3AED",
      accent: document.getElementById("aura-max-theme-accent")?.value || "#22D3EE",
      bg: document.getElementById("aura-max-theme-bg")?.value || "#080B14",
      text: document.getElementById("aura-max-theme-text")?.value || "#F8FAFC"
    };
  }

  function mixHex(hex, percent) {
    const normalized = String(hex || "#000000").replace("#", "");
    const number = parseInt(normalized.padEnd(6, "0").slice(0, 6), 16);
    const amount = Math.round(2.55 * percent);
    const r = Math.max(0, Math.min(255, (number >> 16) + amount));
    const g = Math.max(0, Math.min(255, ((number >> 8) & 0x00ff) + amount));
    const b = Math.max(0, Math.min(255, (number & 0x0000ff) + amount));
    return `#${(0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1)}`;
  }

  function applyTheme() {
    const entries = currentPageBlocks();
    if (!entries.length) {
      toast("Adicione blocos antes de aplicar um tema.", "error");
      return;
    }
    createVersion("Antes de aplicar tema global", "automatic");
    const theme = currentThemeValues();
    const soft = mixHex(theme.bg, 7);
    entries.forEach(({ block }, position) => {
      if (!block.design) block.design = {};
      const design = block.design;
      const isOffer = block.tipo === "formulario_captura" || (block.props?.botaoTexto && position % 5 === 3);
      design.corFundo = isOffer ? theme.primary : (position % 2 ? soft : theme.bg);
      design.corTexto = isOffer ? "#FFFFFF" : theme.text;
      design.corBotaoFundo = isOffer ? "#FFFFFF" : theme.primary;
      design.corBotaoTexto = isOffer ? theme.bg : "#FFFFFF";
      design.corBotaoBorda = isOffer ? "#FFFFFF" : theme.accent;
      design.paddingTop = state.themeSpacing;
      design.paddingBottom = state.themeSpacing;
      design.raio = state.themeRadius;
      design.sombra = state.themeShadow;
      design.duracaoAnimacao = design.duracaoAnimacao || 650;
    });
    createVersion("Tema global aplicado", "automatic");
    notifyChange("Tema global aplicado");
    toast(`Tema aplicado em ${entries.length} blocos.`);
  }

  function snapshot(name, kind) {
    return {
      id: `ver_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: name || "Versão sem nome",
      kind: kind || "manual",
      createdAt: Date.now(),
      pageId: currentPageId(),
      title: document.getElementById("lped-titulo")?.value || "",
      slug: document.getElementById("lped-slug")?.value || "",
      blocks: clone(getBlocks()),
      hash: hashBlocks(getBlocks())
    };
  }

  function getVersions() {
    const versions = readJSON(storageKey("versions"), []);
    return Array.isArray(versions) ? versions : [];
  }

  function createVersion(name, kind) {
    const versions = getVersions();
    const version = snapshot(name, kind);
    if (versions[0]?.hash === version.hash && kind === "automatic") return versions[0];
    versions.unshift(version);
    const manual = versions.filter((item) => item.kind !== "automatic").slice(0, state.versionLimit);
    const automatic = versions.filter((item) => item.kind === "automatic").slice(0, state.autoVersionLimit);
    const ordered = [...manual, ...automatic].sort((a, b) => b.createdAt - a.createdAt);
    writeJSON(storageKey("versions"), ordered);
    renderVersions();
    return version;
  }

  function createManualVersion() {
    const input = document.getElementById("aura-max-version-name");
    const name = input?.value.trim() || `Versão de ${new Date().toLocaleString("pt-BR")}`;
    createVersion(name, "manual");
    if (input) input.value = "";
    toast("Versão criada neste navegador.");
  }

  function renderVersions() {
    const root = document.getElementById("aura-max-versions-list");
    if (!root) return;
    const versions = getVersions();
    document.getElementById("aura-max-version-count").textContent = versions.length === 1 ? "1 versão" : `${versions.length} versões`;
    root.innerHTML = versions.length ? versions.map((version, index) => {
      const date = new Date(version.createdAt);
      const count = Array.isArray(version.blocks) ? version.blocks.length : 0;
      return `<article class="aura-max-version-item"><span class="aura-max-version-line"></span><div class="aura-max-version-card"><header><div><small>${version.kind === "automatic" ? "Automática" : "Manual"}</small><strong>${escapeHTML(version.name)}</strong></div><time>${date.toLocaleString("pt-BR")}</time></header><p>${count} blocos · ${escapeHTML(version.slug || "sem slug")}</p><div><button type="button" data-version-compare="${escapeHTML(version.id)}">Comparar</button><button type="button" data-version-restore="${escapeHTML(version.id)}">Restaurar</button><button type="button" data-version-delete="${escapeHTML(version.id)}" class="is-danger">Excluir</button></div></div></article>`;
    }).join("") : `<div class="aura-max-empty"><strong>Nenhuma versão criada</strong><p>Crie um checkpoint antes de fazer alterações grandes.</p></div>`;
    $$('[data-version-restore]', root).forEach((button) => button.addEventListener("click", () => restoreVersion(button.dataset.versionRestore)));
    $$('[data-version-delete]', root).forEach((button) => button.addEventListener("click", () => deleteVersion(button.dataset.versionDelete)));
    $$('[data-version-compare]', root).forEach((button) => button.addEventListener("click", () => compareVersion(button.dataset.versionCompare)));
  }

  function restoreSnapshot(data, label) {
    if (!Array.isArray(data?.blocks)) return;
    const blocks = getBlocks();
    blocks.length = 0;
    blocks.push(...clone(data.blocks));
    if (data.title !== undefined && document.getElementById("lped-titulo")) document.getElementById("lped-titulo").value = data.title;
    if (data.slug !== undefined && document.getElementById("lped-slug")) document.getElementById("lped-slug").value = data.slug;
    state.selectedIds.clear();
    ensureBlockIds();
    notifyChange(label || "Versão restaurada");
  }

  function restoreVersion(id) {
    const version = getVersions().find((item) => item.id === id);
    if (!version) return;
    confirmAction(`Restaurar “${version.name}”? Uma cópia do estado atual será criada antes da restauração.`, () => {
      createVersion("Antes de restaurar versão", "automatic");
      restoreSnapshot(version, `Versão restaurada · ${version.name}`);
      toast("Versão restaurada.");
    });
  }

  function deleteVersion(id) {
    const versions = getVersions().filter((item) => item.id !== id);
    writeJSON(storageKey("versions"), versions);
    renderVersions();
  }

  function compareVersion(id) {
    const version = getVersions().find((item) => item.id === id);
    if (!version) return;
    const current = getBlocks();
    const previous = version.blocks || [];
    const currentTypes = countTypes(current);
    const previousTypes = countTypes(previous);
    const allTypes = [...new Set([...Object.keys(currentTypes), ...Object.keys(previousTypes)])];
    const differences = allTypes.map((type) => ({ type, current: currentTypes[type] || 0, previous: previousTypes[type] || 0 })).filter((item) => item.current !== item.previous);
    const message = differences.length
      ? differences.slice(0, 6).map((item) => `${blockTypeLabel(item.type)}: ${item.previous} → ${item.current}`).join("\n")
      : "A distribuição de tipos de bloco é igual. Textos, cores ou configurações internas ainda podem ser diferentes.";
    window.alert(`Comparação com “${version.name}”\n\nBlocos: ${previous.length} → ${current.length}\n\n${message}`);
  }

  function countTypes(blocks) {
    return (blocks || []).reduce((map, block) => {
      const type = block?.tipo || "desconhecido";
      map[type] = (map[type] || 0) + 1;
      return map;
    }, {});
  }

  function saveDraft() {
    if (!state.modalOpen) return;
    const blocks = getBlocks();
    const hash = hashBlocks(blocks);
    if (hash === state.lastHash) return;
    state.lastHash = hash;
    writeJSON(storageKey("draft"), {
      ...snapshot("Rascunho automático", "draft"),
      savedAt: Date.now()
    });
    updateHubMeta();
  }

  function checkDraft() {
    const draft = readJSON(storageKey("draft"), null);
    const bar = document.getElementById("aura-max-recovery");
    if (!draft || !Array.isArray(draft.blocks) || draft.hash === hashBlocks(getBlocks())) {
      bar?.classList.add("hidden");
      return;
    }
    const time = document.getElementById("aura-max-recovery-time");
    if (time) time.textContent = `Salvo em ${new Date(draft.savedAt || draft.createdAt).toLocaleString("pt-BR")}.`;
    bar?.classList.remove("hidden");
  }

  function restoreDraft() {
    const draft = readJSON(storageKey("draft"), null);
    if (!draft) return;
    createVersion("Antes de recuperar rascunho", "automatic");
    restoreSnapshot(draft, "Rascunho local recuperado");
    document.getElementById("aura-max-recovery")?.classList.add("hidden");
    toast("Rascunho local restaurado.");
  }

  function discardDraft() {
    localStorage.removeItem(storageKey("draft"));
    document.getElementById("aura-max-recovery")?.classList.add("hidden");
  }

  function clearDraftAfterSave() {
    localStorage.removeItem(storageKey("draft"));
    state.lastSavedHash = hashBlocks(getBlocks());
    state.lastHash = state.lastSavedHash;
    document.getElementById("aura-max-recovery")?.classList.add("hidden");
  }

  function wrapSave() {
    if (window.salvarEditorLP && !window.salvarEditorLP.__auraMaxWrapped) {
      const original = window.salvarEditorLP;
      const wrapped = async function (...args) {
        const result = await original.apply(this, args);
        clearDraftAfterSave();
        createVersion("Página salva", "automatic");
        return result;
      };
      wrapped.__auraMaxWrapped = true;
      window.salvarEditorLP = wrapped;
    }
    if (window.publicarEditorLP && !window.publicarEditorLP.__auraMaxWrapped) {
      const original = window.publicarEditorLP;
      const wrapped = async function (...args) {
        const result = await original.apply(this, args);
        clearDraftAfterSave();
        createVersion("Página publicada", "automatic");
        return result;
      };
      wrapped.__auraMaxWrapped = true;
      window.publicarEditorLP = wrapped;
    }
  }

  function renderLayers() {
    const root = document.getElementById("aura-max-layer-list");
    if (!root) return;
    ensureBlockIds();
    const query = state.layerQuery.toLowerCase().trim();
    let entries = currentPageBlocks();
    if (query) entries = entries.filter(({ block }) => `${blockTypeLabel(block.tipo)} ${block.props?.titulo || ""} ${block.props?.subtitulo || ""}`.toLowerCase().includes(query));
    root.innerHTML = entries.length ? entries.map(({ block, index }, position) => {
      const selected = state.selectedIds.has(block.id);
      const hidden = block.visivel === false;
      const locked = Boolean(block._auraLocked);
      return `<article class="aura-max-layer-row ${selected ? "is-selected" : ""} ${hidden ? "is-hidden" : ""}" data-layer-id="${escapeHTML(block.id)}"><label class="aura-max-layer-checkbox"><input type="checkbox" data-layer-select="${escapeHTML(block.id)}" ${selected ? "checked" : ""}><span></span></label><button type="button" class="aura-max-layer-main" data-layer-focus="${escapeHTML(block.id)}"><span class="aura-max-layer-index">${String(position + 1).padStart(2, "0")}</span><span class="aura-max-layer-copy"><strong>${escapeHTML(blockTypeLabel(block.tipo))}</strong><small>${escapeHTML(block.props?.titulo || block.props?.logoTexto || "Sem título")}</small></span></button><div class="aura-max-layer-actions"><button type="button" data-layer-action="lock" data-layer-id="${escapeHTML(block.id)}" title="${locked ? "Desbloquear" : "Bloquear"}" class="${locked ? "is-active" : ""}">${locked ? "●" : "○"}</button><button type="button" data-layer-action="visibility" data-layer-id="${escapeHTML(block.id)}" title="${hidden ? "Mostrar" : "Ocultar"}">${hidden ? "◌" : "◉"}</button><button type="button" data-layer-action="up" data-layer-id="${escapeHTML(block.id)}" title="Subir">↑</button><button type="button" data-layer-action="down" data-layer-id="${escapeHTML(block.id)}" title="Descer">↓</button></div></article>`;
    }).join("") : `<div class="aura-max-empty"><strong>Nenhuma camada encontrada</strong><p>Tente outro termo de pesquisa.</p></div>`;

    $$('[data-layer-select]', root).forEach((input) => input.addEventListener("change", () => toggleLayerSelection(input.dataset.layerSelect, input.checked)));
    $$('[data-layer-focus]', root).forEach((button) => button.addEventListener("click", () => focusLayer(button.dataset.layerFocus)));
    $$('[data-layer-action]', root).forEach((button) => button.addEventListener("click", () => layerAction(button.dataset.layerAction, button.dataset.layerId)));
    const total = currentPageBlocks().length;
    document.getElementById("aura-max-layer-total").textContent = total === 1 ? "1 camada" : `${total} camadas`;
    document.getElementById("aura-max-layer-mode").textContent = currentPageBlocks().some(({ block }) => block.x !== undefined) ? "Modo livre detectado" : "Modo empilhado";
    const selectAll = document.getElementById("aura-max-select-all");
    if (selectAll) {
      const selected = selectedCount();
      selectAll.checked = total > 0 && selected === total;
      selectAll.indeterminate = selected > 0 && selected < total;
    }
    updateSelectionBar();
  }

  function blockTypeLabel(type) {
    const map = {
      texto_midia: "Texto e mídia",
      formulario_captura: "Formulário",
      faq: "FAQ",
      galeria_imagens: "Galeria",
      lista_cards: "Lista de cards",
      tabela_comparativo: "Comparativo",
      texto_rico: "Texto rico",
      codigo_iframe: "Código / iFrame",
      carrossel_banners: "Banners",
      carrossel_produtos: "Produtos",
      carrossel_cards: "Carrossel de cards",
      navegacao: "Navegação",
      rodape: "Rodapé",
      seletor_cores: "Seletor de cores",
      breadcrumb: "Breadcrumb",
      forma: "Forma"
    };
    return map[type] || type || "Bloco";
  }

  function toggleLayerSelection(id, checked) {
    if (checked) state.selectedIds.add(id);
    else state.selectedIds.delete(id);
    renderLayers();
  }

  function selectAllLayers(checked) {
    if (checked) currentPageBlocks().forEach(({ block }) => state.selectedIds.add(block.id));
    else state.selectedIds.clear();
    renderLayers();
  }

  function focusLayer(id) {
    ensureBlockIds();
    const entry = currentPageBlocks().find(({ block }) => block.id === id);
    if (!entry) return;
    state.selectedIds.clear();
    state.selectedIds.add(id);
    window.AuraStudioInspector?.select?.(entry.index);
    document.getElementById(`lped-preview-bloco-${entry.index}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    renderLayers();
  }

  function layerAction(action, id) {
    const blocks = getBlocks();
    const index = blocks.findIndex((block) => block.id === id);
    if (index < 0) return;
    const block = blocks[index];
    if (action === "lock") {
      block._auraLocked = !block._auraLocked;
      toast(block._auraLocked ? "Camada bloqueada." : "Camada desbloqueada.");
      renderLayers();
      return;
    }
    if (action === "visibility") {
      block.visivel = block.visivel === false;
      notifyChange("Visibilidade alterada");
      return;
    }
    if (action === "up" || action === "down") {
      const direction = action === "up" ? -1 : 1;
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= blocks.length) return;
      const temp = blocks[index];
      blocks[index] = blocks[targetIndex];
      blocks[targetIndex] = temp;
      notifyChange("Camada reordenada");
    }
  }

  function updateSelectionBar() {
    const count = selectedCount();
    const bar = document.getElementById("aura-max-selection-bar");
    const bulk = document.getElementById("aura-max-layer-bulk");
    const badge = document.getElementById("aura-max-selection-badge");
    document.getElementById("aura-max-selection-count") && (document.getElementById("aura-max-selection-count").textContent = count);
    document.getElementById("aura-max-layer-selected-count") && (document.getElementById("aura-max-layer-selected-count").textContent = count === 1 ? "1 selecionado" : `${count} selecionados`);
    bar?.classList.toggle("hidden", count < 2);
    bulk?.classList.toggle("hidden", count === 0);
    if (badge) {
      badge.textContent = count;
      badge.classList.toggle("hidden", count === 0);
    }
  }

  function runBulkAction(action) {
    const entries = selectedEntries();
    if (action === "clear") {
      state.selectedIds.clear();
      renderLayers();
      return;
    }
    if (!entries.length) {
      toast("Selecione pelo menos uma camada.", "error");
      return;
    }
    if (action === "duplicate") {
      const blocks = getBlocks();
      const clones = entries.map(({ block }) => {
        const copy = clone(block);
        copy.id = `lpb_max_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        copy._colapsado = true;
        if (copy.x !== undefined) {
          copy.x = Number(copy.x || 0) + 24;
          copy.y = Number(copy.y || 0) + 24;
          copy.zIndex = Math.max(0, ...blocks.map((item) => Number(item.zIndex || 0))) + 1;
        }
        return copy;
      });
      const lastIndex = Math.max(...entries.map((entry) => entry.index));
      blocks.splice(lastIndex + 1, 0, ...clones);
      state.selectedIds = new Set(clones.map((item) => item.id));
      notifyChange("Blocos duplicados");
      return;
    }
    if (action === "show" || action === "hide") {
      entries.forEach(({ block }) => { block.visivel = action === "show"; });
      notifyChange(action === "show" ? "Blocos exibidos" : "Blocos ocultados");
      return;
    }
    if (action === "lock") {
      const shouldLock = entries.some(({ block }) => !block._auraLocked);
      entries.forEach(({ block }) => { block._auraLocked = shouldLock; });
      renderLayers();
      toast(shouldLock ? "Camadas bloqueadas." : "Camadas desbloqueadas.");
      return;
    }
    if (action === "component") {
      saveSelectionAsComponent(entries);
      return;
    }
    if (action === "delete") {
      confirmAction(`Excluir ${entries.length} bloco(s) selecionado(s)?`, () => {
        entries.sort((a, b) => b.index - a.index).forEach(({ index }) => {
          if (typeof window.removerBlocoEditor === "function") window.removerBlocoEditor(index);
          else getBlocks().splice(index, 1);
        });
        state.selectedIds.clear();
        notifyChange("Blocos excluídos");
      });
    }
  }

  function saveSelectionAsComponent(entries) {
    const name = window.prompt("Nome do componente:", "Componente personalizado");
    if (!name) return;
    const key = "auraStudioPersonalBlocksV1";
    const current = readJSON(key, []);
    const blocks = entries.map(({ block }) => {
      const copy = clone(block);
      delete copy.id;
      copy._colapsado = true;
      return copy;
    });
    const component = {
      id: `personal-group-${Date.now()}`,
      nome: name.trim(),
      categoria: "Meus componentes",
      objetivo: "Reutilizar",
      tags: ["componente", "grupo", `${blocks.length} blocos`],
      accent: blocks[0]?.design?.corBotaoFundo || blocks[0]?.design?.corFundo || "#7C3AED",
      tipo: "pessoal",
      blocos,
      criadoEm: Date.now()
    };
    const list = Array.isArray(current) ? current : [];
    list.unshift(component);
    writeJSON(key, list.slice(0, 100));
    document.dispatchEvent(new CustomEvent("aura:personal-library-updated"));
    toast("Componente salvo na Biblioteca Pro.");
  }

  function alignSelected(mode) {
    const entries = selectedEntries().filter(({ block }) => block.x !== undefined && !block._auraLocked);
    if (entries.length < 2) {
      toast("O alinhamento em lote exige ao menos dois blocos no modo Livre.", "error");
      return;
    }
    const left = Math.min(...entries.map(({ block }) => Number(block.x || 0)));
    const top = Math.min(...entries.map(({ block }) => Number(block.y || 0)));
    const right = Math.max(...entries.map(({ block }) => Number(block.x || 0) + Number(block.largura || 600)));
    const bottom = Math.max(...entries.map(({ block }) => Number(block.y || 0) + Number(block.altura || 220)));
    const centerX = (left + right) / 2;
    const centerY = (top + bottom) / 2;

    if (mode === "left") entries.forEach(({ block }) => { block.x = left; });
    if (mode === "right") entries.forEach(({ block }) => { block.x = right - Number(block.largura || 600); });
    if (mode === "center-x") entries.forEach(({ block }) => { block.x = centerX - Number(block.largura || 600) / 2; });
    if (mode === "top") entries.forEach(({ block }) => { block.y = top; });
    if (mode === "bottom") entries.forEach(({ block }) => { block.y = bottom - Number(block.altura || 220); });
    if (mode === "center-y") entries.forEach(({ block }) => { block.y = centerY - Number(block.altura || 220) / 2; });
    if (mode === "distribute-x") {
      const sorted = [...entries].sort((a, b) => Number(a.block.x || 0) - Number(b.block.x || 0));
      const totalWidth = sorted.reduce((sum, { block }) => sum + Number(block.largura || 600), 0);
      const gap = Math.max(0, (right - left - totalWidth) / (sorted.length - 1));
      let cursor = left;
      sorted.forEach(({ block }) => { block.x = cursor; cursor += Number(block.largura || 600) + gap; });
    }
    if (mode === "distribute-y") {
      const sorted = [...entries].sort((a, b) => Number(a.block.y || 0) - Number(b.block.y || 0));
      const totalHeight = sorted.reduce((sum, { block }) => sum + Number(block.altura || 220), 0);
      const gap = Math.max(0, (bottom - top - totalHeight) / (sorted.length - 1));
      let cursor = top;
      sorted.forEach(({ block }) => { block.y = cursor; cursor += Number(block.altura || 220) + gap; });
    }
    notifyChange("Blocos alinhados");
  }

  function openHub() {
    updateHubMeta();
    document.getElementById("aura-max-hub")?.classList.remove("hidden");
  }

  function closeHub() {
    document.getElementById("aura-max-hub")?.classList.add("hidden");
  }

  function openPanel(name) {
    closeHub();
    $$('.aura-max-side-panel').forEach((panel) => panel.classList.add("hidden"));
    const panel = document.querySelector(`[data-max-panel="${CSS.escape(name)}"]`);
    if (!panel) return;
    panel.classList.remove("hidden");
    if (name === "generator") {
      populateGenerator();
      updateGeneratorPreview();
    }
    if (name === "theme") renderThemePalettes();
    if (name === "versions") renderVersions();
    if (name === "layers") renderLayers();
  }

  function closePanels() {
    $$('.aura-max-side-panel').forEach((panel) => panel.classList.add("hidden"));
  }

  function updateHubMeta() {
    const blocks = currentPageBlocks();
    const page = document.getElementById("lped-titulo")?.value || "Landing Page";
    const quality = window.AuraStudioPro?.state?.lastAudit?.overall;
    document.getElementById("aura-max-hub-page") && (document.getElementById("aura-max-hub-page").textContent = page);
    document.getElementById("aura-max-hub-summary") && (document.getElementById("aura-max-hub-summary").textContent = `${blocks.length} blocos · ${state.lastHash === state.lastSavedHash ? "Tudo salvo" : "Alterações locais"}`);
    document.getElementById("aura-max-hub-score") && (document.getElementById("aura-max-hub-score").textContent = Number.isFinite(quality) ? quality : "—");
  }

  function scheduleMetaUpdate() {
    clearTimeout(state.metaTimer);
    state.metaTimer = setTimeout(updateHubMeta, 120);
  }

  function bindKeyboard() {
    document.addEventListener("keydown", (event) => {
      const modal = getModal();
      if (!modal || modal.classList.contains("hidden")) return;
      const target = event.target;
      const typing = target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      const key = String(event.key || "").toLowerCase();

      if ((event.ctrlKey || event.metaKey) && event.altKey && key === "m") {
        event.preventDefault();
        openHub();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.altKey && key === "g") {
        event.preventDefault();
        openPanel("generator");
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.altKey && key === "t") {
        event.preventDefault();
        openPanel("theme");
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.altKey && key === "v") {
        event.preventDefault();
        openPanel("versions");
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === "s") {
        event.preventDefault();
        createManualVersion();
        return;
      }
      if (event.key === "Escape") {
        closeHub();
        closePanels();
      }
      if (typing) return;
      if ((event.ctrlKey || event.metaKey) && key === "a" && document.querySelector('[data-max-panel="layers"]:not(.hidden)')) {
        event.preventDefault();
        selectAllLayers(true);
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedCount()) {
        event.preventDefault();
        runBulkAction("delete");
        return;
      }
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) && selectedCount()) {
        const entries = selectedEntries().filter(({ block }) => block.x !== undefined && !block._auraLocked);
        if (!entries.length) return;
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        entries.forEach(({ block }) => {
          if (event.key === "ArrowLeft") block.x = Number(block.x || 0) - step;
          if (event.key === "ArrowRight") block.x = Number(block.x || 0) + step;
          if (event.key === "ArrowUp") block.y = Number(block.y || 0) - step;
          if (event.key === "ArrowDown") block.y = Number(block.y || 0) + step;
        });
        notifyChange("Blocos movidos");
      }
    });
  }

  function watchModal() {
    const modal = getModal();
    if (!modal || state.modalObserver) return;
    state.modalObserver = new MutationObserver(() => {
      const open = !modal.classList.contains("hidden");
      if (open === state.modalOpen) return;
      state.modalOpen = open;
      if (open) {
        setTimeout(() => {
          ensureBlockIds();
          wrapSave();
          state.lastHash = hashBlocks(getBlocks());
          state.lastSavedHash = state.lastHash;
          checkDraft();
          renderLayers();
          renderThemePalettes();
          updateHubMeta();
          createVersion("Abertura do editor", "automatic");
        }, 260);
      } else {
        closeHub();
        closePanels();
        state.selectedIds.clear();
        updateSelectionBar();
      }
    });
    state.modalObserver.observe(modal, { attributes: true, attributeFilter: ["class"] });
  }

  function watchList() {
    const list = document.getElementById("lped-blocos-lista");
    if (!list || state.listObserver) return;
    let timer;
    state.listObserver = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        ensureBlockIds();
        state.selectedIds.forEach((id) => {
          if (!getBlocks().some((block) => block.id === id)) state.selectedIds.delete(id);
        });
        renderLayers();
        scheduleMetaUpdate();
      }, 80);
    });
    state.listObserver.observe(list, { childList: true, subtree: true });
  }

  function startAutosave() {
    clearInterval(state.draftTimer);
    state.draftTimer = setInterval(saveDraft, 6500);
    document.addEventListener("visibilitychange", () => { if (document.hidden) saveDraft(); });
  }

  function init() {
    if (state.initialized) return;
    const modal = getModal();
    if (!modal || !window.AuraStudioPro || !window.AuraStudioInspector || !window.lpEditorBlocos) {
      setTimeout(init, 160);
      return;
    }
    state.initialized = true;
    modal.classList.add("aura-studio-max");
    injectStylesLinkGuard();
    injectLauncher();
    injectDock();
    injectHub();
    injectPanels();
    injectRecoveryBar();
    injectSelectionBar();
    populateGenerator();
    renderThemePalettes();
    renderVersions();
    renderLayers();
    bindKeyboard();
    watchModal();
    watchList();
    startAutosave();
    wrapSave();

    document.addEventListener("aura:studio-change", () => {
      saveDraft();
      scheduleMetaUpdate();
    });
    document.addEventListener("aura:studio-library-expanded", () => populateGenerator());
    document.addEventListener("aura:personal-library-updated", () => scheduleMetaUpdate());

    window.AuraStudioMax = {
      openHub,
      openPanel,
      closePanels,
      createVersion,
      restoreDraft,
      saveDraft,
      renderLayers,
      selectAllLayers,
      applyTheme,
      generatePage,
      state
    };

    console.info("[Vide Aura Studio MAX] Inicializado", {
      presets: window.AURA_STUDIO_PRESETS?.length || 0,
      version: "2.0.0-max"
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
