(function () {
  "use strict";

  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));
  const clone = (value) => JSON.parse(JSON.stringify(value));

  const state = {
    initialized: false,
    selectedIds: new Set(),
    primaryId: null,
    activeTab: "blocks",
    panelOpen: false,
    search: "",
    category: "all",
    page: 1,
    perPage: 24,
    snap: localStorage.getItem("aura_v4_snap") !== "false",
    grid: localStorage.getItem("aura_v4_grid") !== "false",
    rulers: localStorage.getItem("aura_v4_rulers") !== "false",
    outlines: localStorage.getItem("aura_v4_outlines") === "true",
    gridSize: Number(localStorage.getItem("aura_v4_grid_size") || 8),
    guides: { vertical: [], horizontal: [] },
    marquee: null,
    transform: null,
    observer: null,
    panel: null,
    renderTimer: null,
    lastCanvasSignature: "",
    mobileTap: null,
    mobileInteractionEnabled: true,
    canvasAbortController: null,
    canvasElement: null,
    editorObserver: null
  };

  const ICONS = {
    canvas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="3"></rect><path d="M8 3v18"></path><path d="M3 8h18"></path><path d="M15 13h3v3h-3z"></path></svg>',
    blocks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="8" height="8" rx="2"></rect><rect x="13" y="3" width="8" height="5" rx="2"></rect><rect x="13" y="10" width="8" height="11" rx="2"></rect><rect x="3" y="13" width="8" height="8" rx="2"></rect></svg>',
    layout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 6h16"></path><path d="M4 12h10"></path><path d="M4 18h16"></path><path d="M18 9v6"></path></svg>',
    responsive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="13" height="10" rx="2"></rect><path d="M8 18h3"></path><path d="M9.5 14v4"></path><rect x="17" y="8" width="4" height="10" rx="1"></rect></svg>',
    components: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m12 3 4 4-4 4-4-4 4-4Z"></path><path d="m7 13 4 4-4 4-4-4 4-4Z"></path><path d="m17 13 4 4-4 4-4-4 4-4Z"></path></svg>',
    history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path><path d="M3 3v5h5"></path><path d="M12 7v5l3 2"></path></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21h-4v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3h4a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9A1.7 1.7 0 0 0 21 10v4a1.7 1.7 0 0 0-1.6 1Z"></path></svg>'
  };

  function getModal() {
    return document.getElementById("lp-editor-modal");
  }

  function getCanvas() {
    return document.getElementById("lped-preview-canvas");
  }

  function getFrame() {
    return document.getElementById("lped-browser-frame");
  }

  function getBlocks() {
    return Array.isArray(window.lpEditorBlocos) ? window.lpEditorBlocos : [];
  }

  function ensureIds() {
    getBlocks().forEach((block, index) => {
      if (!block.id) block.id = `lpb_v4_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 7)}`;
      block.design = block.design || {};
      block.design.v4 = block.design.v4 || {};
    });
  }

  function currentPageId() {
    const active = document.querySelector("#lped-barra-paginas button.bg-\\[\\#FF7A45\\]");
    const onclick = active?.getAttribute("onclick") || "";
    const match = onclick.match(/trocarPaginaLP\('([^']+)'\)/);
    if (match) return match[1];
    return getBlocks().find((block) => block?.paginaId)?.paginaId || null;
  }

  function pageEntries() {
    ensureIds();
    const all = getBlocks();
    const pageId = currentPageId();
    const hasPages = Boolean(pageId) && all.some((block) => block?.paginaId);
    return all
      .map((block, index) => ({ block, index }))
      .filter((entry) => !hasPages || !entry.block.paginaId || entry.block.paginaId === pageId);
  }

  function getSelectedBlocks() {
    return pageEntries().filter((entry) => state.selectedIds.has(entry.block.id));
  }

  function isEditorOpen() {
    const modal = getModal();
    return modal && !modal.classList.contains("hidden");
  }

  function isFreeMode() {
    const free = document.getElementById("lped-btn-modo-livre");
    const stacked = document.getElementById("lped-btn-modo-empilhado");
    if (free && stacked) {
      return free.className.includes("bg-[#FF7A45]") && !stacked.className.includes("bg-[#FF7A45]");
    }
    return pageEntries().some((entry) => entry.block.x !== undefined);
  }

  function isMobileShellActive() {
    return Boolean(window.AuraStudioPro?.isMobileShellActive?.());
  }

  function canReceiveCanvasEvents() {
    if (!isMobileShellActive()) return true;
    return state.mobileInteractionEnabled && window.AuraStudioPro?.getMobileView?.() === "preview";
  }

  function isInteractiveTarget(target) {
    return Boolean(target?.closest?.("button,a,input,select,textarea,label,[contenteditable='true'],[role='button']"));
  }

  function toast(message, type) {
    window.showToast?.(message, type);
  }

  function notifyChange(label) {
    window.renderizarEditorBlocos?.();
    window.AuraStudioPro?.markDirty?.();
    document.dispatchEvent(new CustomEvent("aura:studio-change", { detail: { source: "canvas-v4", label } }));
    scheduleDecorate();
  }

  function checkpoint(label) {
    window.AuraHistoryV4?.checkpoint?.(label, { force: true });
  }

  function typeLabel(type) {
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

  function blockTitle(block) {
    return block?.props?.titulo || block?.props?.logoTexto || block?.props?.textoCopyright || typeLabel(block?.tipo);
  }

  function syncLegacySelection(options) {
    const opts = options || {};
    ensureIds();
    const entries = pageEntries();
    const maxState = window.AuraStudioMax?.state;
    if (maxState?.selectedIds instanceof Set) {
      maxState.selectedIds.clear();
      state.selectedIds.forEach((id) => maxState.selectedIds.add(id));
    }

    const primary = entries.find((entry) => entry.block.id === state.primaryId) || getSelectedBlocks()[0];
    entries.forEach((entry) => {
      entry.block._colapsado = !primary || entry.block.id !== primary.block.id;
    });

    if (primary && !opts.skipInspector) {
      window.AuraStudioInspector?.select?.(primary.index, { renderList: false });
    }

    document.dispatchEvent(new CustomEvent("aura:studio-selection", {
      detail: {
        index: primary?.index ?? -1,
        ids: Array.from(state.selectedIds),
        source: opts.source || "canvas-v4",
        inspectorSynced: Boolean(primary && !opts.skipInspector)
      }
    }));

    renderSelectionMeta();
    scheduleDecorate();
  }

  function selectById(id, additive, range) {
    ensureIds();
    if (!additive && !range) state.selectedIds.clear();

    if (additive && state.selectedIds.has(id)) {
      state.selectedIds.delete(id);
      if (state.primaryId === id) state.primaryId = Array.from(state.selectedIds).pop() || null;
    } else {
      state.selectedIds.add(id);
      state.primaryId = id;
    }

    syncLegacySelection();
  }

  function selectIndex(index, options) {
    ensureIds();
    const block = getBlocks()[index];
    if (!block?.id) return false;
    state.selectedIds.clear();
    state.selectedIds.add(block.id);
    state.primaryId = block.id;
    syncLegacySelection({ source: options?.source || "canvas-v4" });
    return true;
  }

  function selectIndexes(indexes, additive) {
    if (!additive) state.selectedIds.clear();
    indexes.forEach((index) => {
      const block = getBlocks()[index];
      if (block?.id) state.selectedIds.add(block.id);
    });
    state.primaryId = Array.from(state.selectedIds).pop() || null;
    syncLegacySelection();
  }

  function clearSelection() {
    state.selectedIds.clear();
    state.primaryId = null;
    const maxState = window.AuraStudioMax?.state;
    if (maxState?.selectedIds instanceof Set) maxState.selectedIds.clear();
    renderSelectionMeta();
    scheduleDecorate();
  }

  function selectedIndexFromElement(element) {
    const handle = element?.closest?.("[data-bloco-index]");
    if (handle) return Number(handle.dataset.blocoIndex);
    const wrapper = element?.closest?.('[id^="lped-preview-bloco-"]');
    if (wrapper) return Number(wrapper.id.replace("lped-preview-bloco-", ""));
    const v4 = element?.closest?.("[data-v4-index]");
    return v4 ? Number(v4.dataset.v4Index) : -1;
  }

  function blockWrapper(index) {
    const stacked = document.getElementById(`lped-preview-bloco-${index}`);
    if (stacked) return stacked;
    const mover = getCanvas()?.querySelector(`.livre-mover[data-bloco-index="${index}"]`);
    return mover?.parentElement || null;
  }

  function decorateCanvas() {
    if (!isEditorOpen()) return;
    ensureIds();
    const canvas = getCanvas();
    if (!canvas) return;

    pageEntries().forEach((entry) => {
      const wrapper = blockWrapper(entry.index);
      if (!wrapper) return;
      wrapper.dataset.v4Index = String(entry.index);
      wrapper.dataset.v4Id = entry.block.id;
      wrapper.classList.add("aura-v4-block");
      wrapper.classList.toggle("is-v4-selected", state.selectedIds.has(entry.block.id));
      wrapper.classList.toggle("is-v4-locked", Boolean(entry.block._auraLocked || entry.block.design?.v4Locked));
      wrapper.classList.toggle("is-v4-hidden", entry.block.visivel === false);
      wrapper.classList.toggle("has-v4-component", Boolean(entry.block.design?.v4Component));
      wrapper.classList.toggle("has-v4-group", Boolean(entry.block.design?.v4GroupId));
      wrapper.style.setProperty("--aura-v4-rotation", `${Number(entry.block.design?.v4Rotation || 0)}deg`);
      wrapper.style.setProperty("--aura-v4-opacity", String(Number.isFinite(Number(entry.block.design?.v4Opacity)) ? Number(entry.block.design.v4Opacity) : 1));

      wrapper.querySelectorAll(":scope > .aura-v4-transform-handle, :scope > .aura-v4-block-label").forEach((node) => node.remove());
      if (state.selectedIds.has(entry.block.id)) {
        appendBlockLabel(wrapper, entry);
        if (isFreeMode() && entry.block.x !== undefined) appendTransformHandles(wrapper, entry);
      }
    });

    canvas.classList.toggle("aura-v4-grid-enabled", state.grid);
    canvas.classList.toggle("aura-v4-outline-enabled", state.outlines);
    canvas.style.setProperty("--aura-v4-grid-size", `${Math.max(2, state.gridSize)}px`);
    renderGuides();
    renderRulers();
  }

  function appendBlockLabel(wrapper, entry) {
    const label = document.createElement("div");
    label.className = "aura-v4-block-label";
    label.innerHTML = `<span>${typeLabel(entry.block.tipo)}</span><b>${entry.index + 1}</b>`;
    wrapper.appendChild(label);
  }

  function appendTransformHandles(wrapper, entry) {
    ["nw", "n", "ne", "e", "se", "s", "sw", "w"].forEach((direction) => {
      const handle = document.createElement("button");
      handle.type = "button";
      handle.className = `aura-v4-transform-handle is-${direction}`;
      handle.dataset.v4Handle = direction;
      handle.dataset.v4Index = String(entry.index);
      handle.setAttribute("aria-label", `Redimensionar ${direction}`);
      wrapper.appendChild(handle);
    });
    const rotate = document.createElement("button");
    rotate.type = "button";
    rotate.className = "aura-v4-transform-handle is-rotate";
    rotate.dataset.v4Handle = "rotate";
    rotate.dataset.v4Index = String(entry.index);
    rotate.setAttribute("aria-label", "Rotacionar bloco");
    rotate.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 11a8 8 0 1 0-2.3 5.7"></path><path d="M20 4v7h-7"></path></svg>';
    wrapper.appendChild(rotate);
  }

  function scheduleDecorate() {
    clearTimeout(state.renderTimer);
    state.renderTimer = setTimeout(decorateCanvas, 35);
  }

  function startTransform(event, handle) {
    const index = Number(handle.dataset.v4Index);
    const direction = handle.dataset.v4Handle;
    const block = getBlocks()[index];
    const wrapper = blockWrapper(index);
    if (!block || !wrapper || block._auraLocked || block.design?.v4Locked) return;

    event.preventDefault();
    event.stopPropagation();
    checkpoint(direction === "rotate" ? "Antes de rotacionar bloco" : "Antes de redimensionar bloco");

    const rect = wrapper.getBoundingClientRect();
    const scaleX = rect.width / Math.max(1, Number(block.largura || rect.width));
    const scaleY = rect.height / Math.max(1, Number(block.altura || rect.height));
    state.transform = {
      pointerId: event.pointerId,
      index,
      direction,
      startX: event.clientX,
      startY: event.clientY,
      x: Number(block.x || 0),
      y: Number(block.y || 0),
      width: Number(block.largura || rect.width),
      height: Number(block.altura || rect.height),
      rotation: Number(block.design?.v4Rotation || 0),
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
      scaleX: scaleX || 1,
      scaleY: scaleY || 1,
      wrapper,
      next: null
    };
    handle.setPointerCapture?.(event.pointerId);
  }

  function transformMove(event) {
    const data = state.transform;
    if (!data) return;
    const dx = (event.clientX - data.startX) / data.scaleX;
    const dy = (event.clientY - data.startY) / data.scaleY;
    const minimum = 40;

    if (data.direction === "rotate") {
      const startAngle = Math.atan2(data.startY - data.centerY, data.startX - data.centerX) * 180 / Math.PI;
      const currentAngle = Math.atan2(event.clientY - data.centerY, event.clientX - data.centerX) * 180 / Math.PI;
      let rotation = data.rotation + currentAngle - startAngle;
      if (event.shiftKey) rotation = Math.round(rotation / 15) * 15;
      data.next = { rotation: Math.round(rotation * 10) / 10 };
      data.wrapper.style.transform = `rotate(${data.next.rotation}deg)`;
      updateHUDTransform(data.next);
      return;
    }

    let x = data.x;
    let y = data.y;
    let width = data.width;
    let height = data.height;
    const direction = data.direction;

    if (direction.includes("e")) width = Math.max(minimum, data.width + dx);
    if (direction.includes("s")) height = Math.max(minimum, data.height + dy);
    if (direction.includes("w")) {
      width = Math.max(minimum, data.width - dx);
      x = data.x + (data.width - width);
    }
    if (direction.includes("n")) {
      height = Math.max(minimum, data.height - dy);
      y = data.y + (data.height - height);
    }

    if (event.shiftKey) {
      const ratio = data.width / Math.max(1, data.height);
      if (Math.abs(dx) > Math.abs(dy)) height = width / ratio;
      else width = height * ratio;
    }

    if (state.snap) {
      const grid = Math.max(1, state.gridSize);
      x = Math.round(x / grid) * grid;
      y = Math.round(y / grid) * grid;
      width = Math.round(width / grid) * grid;
      height = Math.round(height / grid) * grid;
    }

    data.next = {
      x: Math.max(0, Math.round(x)),
      y: Math.max(0, Math.round(y)),
      width: Math.max(minimum, Math.round(width)),
      height: Math.max(minimum, Math.round(height))
    };
    Object.assign(data.wrapper.style, {
      left: `${data.next.x}px`,
      top: `${data.next.y}px`,
      width: `${data.next.width}px`,
      height: `${data.next.height}px`
    });
    updateHUDTransform(data.next);
  }

  function finishTransform() {
    const data = state.transform;
    if (!data) return;
    const block = getBlocks()[data.index];
    if (block && data.next) {
      if (data.direction === "rotate") {
        block.design = block.design || {};
        block.design.v4Rotation = data.next.rotation;
      } else {
        block.x = data.next.x;
        block.y = data.next.y;
        block.largura = data.next.width;
        block.altura = data.next.height;
      }
      window.AuraResponsiveV4?.saveDevice?.(window.AuraResponsiveV4.currentDevice?.() || "desktop");
      notifyChange(data.direction === "rotate" ? "Bloco rotacionado" : "Bloco redimensionado");
    }
    state.transform = null;
    updateHUDTransform(null);
  }

  function updateHUDTransform(data) {
    const element = document.getElementById("aura-v4-transform-readout");
    if (!element) return;
    if (!data) {
      element.classList.add("hidden");
      return;
    }
    element.classList.remove("hidden");
    element.textContent = data.rotation !== undefined
      ? `${data.rotation}°`
      : `${data.width} × ${data.height} · X ${data.x} · Y ${data.y}`;
  }

  function startMarquee(event) {
    if (!isFreeMode() || event.button !== 0) return;
    const canvas = getCanvas();
    if (!canvas) return;
    const inner = canvas.firstElementChild;
    if (!inner || event.target !== inner) return;

    event.preventDefault();
    const rect = inner.getBoundingClientRect();
    const element = document.createElement("div");
    element.className = "aura-v4-marquee";
    inner.appendChild(element);
    state.marquee = {
      startX: event.clientX,
      startY: event.clientY,
      rect,
      element,
      additive: event.shiftKey
    };
    if (!event.shiftKey) clearSelection();
  }

  function marqueeMove(event) {
    const data = state.marquee;
    if (!data) return;
    const left = Math.min(data.startX, event.clientX) - data.rect.left;
    const top = Math.min(data.startY, event.clientY) - data.rect.top;
    const width = Math.abs(event.clientX - data.startX);
    const height = Math.abs(event.clientY - data.startY);
    Object.assign(data.element.style, {
      left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`
    });
  }

  function finishMarquee(event) {
    const data = state.marquee;
    if (!data) return;
    const selectionRect = {
      left: Math.min(data.startX, event.clientX),
      right: Math.max(data.startX, event.clientX),
      top: Math.min(data.startY, event.clientY),
      bottom: Math.max(data.startY, event.clientY)
    };
    const indexes = [];
    pageEntries().forEach((entry) => {
      const wrapper = blockWrapper(entry.index);
      if (!wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      const intersects = !(rect.right < selectionRect.left || rect.left > selectionRect.right || rect.bottom < selectionRect.top || rect.top > selectionRect.bottom);
      if (intersects) indexes.push(entry.index);
    });
    data.element.remove();
    state.marquee = null;
    selectIndexes(indexes, data.additive);
  }

  function onCanvasPointerDown(event) {
    if (!canReceiveCanvasEvents()) return;

    const transformHandle = event.target.closest?.("[data-v4-handle]");
    if (isMobileShellActive()) {
      if (isInteractiveTarget(event.target)) return;
      const mobileIndex = selectedIndexFromElement(event.target);
      if (mobileIndex >= 0) {
        state.mobileTap = {
          pointerId: event.pointerId,
          index: mobileIndex,
          x: event.clientX,
          y: event.clientY,
          t: performance.now(),
          moved: false
        };
      }
      return;
    }

    if (transformHandle) {
      startTransform(event, transformHandle);
      return;
    }

    const index = selectedIndexFromElement(event.target);
    if (index >= 0) {
      const block = getBlocks()[index];
      if (!block) return;
      if ((block._auraLocked || block.design?.v4Locked) && event.target.closest(".livre-mover")) {
        event.preventDefault();
        event.stopPropagation();
        toast("Este bloco está bloqueado.", "error");
        selectById(block.id, event.shiftKey);
        return;
      }
      selectById(block.id, event.shiftKey || event.ctrlKey || event.metaKey);
      return;
    }

    startMarquee(event);
  }

  function updateMobileTap(event) {
    const tap = state.mobileTap;
    if (!tap || tap.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 10) tap.moved = true;
  }

  function finishMobileTap(event) {
    const tap = state.mobileTap;
    if (!tap || tap.pointerId !== event.pointerId) return false;
    state.mobileTap = null;
    if (tap.moved || performance.now() - tap.t > 520) return false;
    event.preventDefault();
    event.stopPropagation();
    selectIndex(tap.index, { source: "preview" });
    return true;
  }

  function cancelMobileTap() {
    state.mobileTap = null;
  }

  function editBlockInline(entry) {
    const modal = document.getElementById("aura-v4-inline-editor");
    if (!modal || !entry) return;
    state.inlineIndex = entry.index;
    const props = entry.block.props || {};
    $("#aura-v4-inline-title", modal).value = props.titulo || props.logoTexto || "";
    $("#aura-v4-inline-subtitle", modal).value = props.subtitulo || props.conteudo || props.textoCopyright || "";
    $("#aura-v4-inline-button", modal).value = props.botaoTexto || props.textoBotao || "";
    $("#aura-v4-inline-link", modal).value = props.botaoLink || "";
    $("#aura-v4-inline-type", modal).textContent = typeLabel(entry.block.tipo);
    modal.classList.remove("hidden");
  }

  function saveInlineEdit() {
    const index = state.inlineIndex;
    const block = getBlocks()[index];
    const modal = document.getElementById("aura-v4-inline-editor");
    if (!block || !modal) return;
    checkpoint("Antes de editar conteúdo direto");
    block.props = block.props || {};
    const title = $("#aura-v4-inline-title", modal).value;
    const subtitle = $("#aura-v4-inline-subtitle", modal).value;
    const button = $("#aura-v4-inline-button", modal).value;
    const link = $("#aura-v4-inline-link", modal).value;

    if (Object.prototype.hasOwnProperty.call(block.props, "logoTexto")) block.props.logoTexto = title;
    else if (Object.prototype.hasOwnProperty.call(block.props, "titulo") || title) block.props.titulo = title;

    if (Object.prototype.hasOwnProperty.call(block.props, "conteudo")) block.props.conteudo = subtitle;
    else if (Object.prototype.hasOwnProperty.call(block.props, "textoCopyright")) block.props.textoCopyright = subtitle;
    else if (Object.prototype.hasOwnProperty.call(block.props, "subtitulo") || subtitle) block.props.subtitulo = subtitle;

    if (Object.prototype.hasOwnProperty.call(block.props, "textoBotao")) block.props.textoBotao = button;
    else if (Object.prototype.hasOwnProperty.call(block.props, "botaoTexto") || button) block.props.botaoTexto = button;
    if (Object.prototype.hasOwnProperty.call(block.props, "botaoLink") || link) block.props.botaoLink = link;

    modal.classList.add("hidden");
    notifyChange("Conteúdo editado diretamente");
  }

  function onCanvasDoubleClick(event) {
    const index = selectedIndexFromElement(event.target);
    if (index < 0) return;
    event.preventDefault();
    editBlockInline({ block: getBlocks()[index], index });
  }

  function align(mode) {
    const entries = getSelectedBlocks();
    if (!entries.length) return toast("Selecione blocos para alinhar.", "error");
    if (!isFreeMode()) return toast("Ative o modo Livre para alinhar.", "error");
    checkpoint(`Antes de alinhar: ${mode}`);

    const left = Math.min(...entries.map((entry) => Number(entry.block.x || 0)));
    const top = Math.min(...entries.map((entry) => Number(entry.block.y || 0)));
    const right = Math.max(...entries.map((entry) => Number(entry.block.x || 0) + Number(entry.block.largura || 600)));
    const bottom = Math.max(...entries.map((entry) => Number(entry.block.y || 0) + Number(entry.block.altura || 220)));
    const centerX = (left + right) / 2;
    const centerY = (top + bottom) / 2;

    entries.forEach((entry) => {
      const block = entry.block;
      const width = Number(block.largura || 600);
      const height = Number(block.altura || 220);
      if (mode === "left") block.x = left;
      if (mode === "center-x") block.x = Math.round(centerX - width / 2);
      if (mode === "right") block.x = Math.round(right - width);
      if (mode === "top") block.y = top;
      if (mode === "center-y") block.y = Math.round(centerY - height / 2);
      if (mode === "bottom") block.y = Math.round(bottom - height);
    });
    notifyChange(`Alinhamento ${mode}`);
  }

  function distribute(axis) {
    const entries = getSelectedBlocks();
    if (entries.length < 3) return toast("Selecione pelo menos três blocos.", "error");
    checkpoint(`Antes de distribuir ${axis}`);
    const sorted = [...entries].sort((a, b) => axis === "x"
      ? Number(a.block.x || 0) - Number(b.block.x || 0)
      : Number(a.block.y || 0) - Number(b.block.y || 0));

    const start = axis === "x" ? Number(sorted[0].block.x || 0) : Number(sorted[0].block.y || 0);
    const last = sorted[sorted.length - 1].block;
    const end = axis === "x"
      ? Number(last.x || 0) + Number(last.largura || 600)
      : Number(last.y || 0) + Number(last.altura || 220);
    const totalSize = sorted.reduce((sum, entry) => sum + Number(axis === "x" ? entry.block.largura || 600 : entry.block.altura || 220), 0);
    const gap = Math.max(0, (end - start - totalSize) / (sorted.length - 1));
    let cursor = start;
    sorted.forEach((entry) => {
      if (axis === "x") entry.block.x = Math.round(cursor);
      else entry.block.y = Math.round(cursor);
      cursor += Number(axis === "x" ? entry.block.largura || 600 : entry.block.altura || 220) + gap;
    });
    notifyChange(`Distribuição ${axis}`);
  }

  function autoLayout(mode, options) {
    const opts = options || {};
    const run = () => {
      const selected = getSelectedBlocks();
      const entries = selected.length ? selected : pageEntries().filter((entry) => entry.block.visivel !== false);
      if (!entries.length) return;
      checkpoint(`Antes do Auto Layout ${mode}`);
      const gap = Math.max(0, Number(opts.gap ?? 24));
      const padding = Math.max(0, Number(opts.padding ?? 24));
      const canvasWidth = Number(getFrame()?.dataset.device === "mobile" ? 390 : getFrame()?.dataset.device === "tablet" ? 768 : 1200);

      if (mode === "vertical") {
        let y = padding;
        entries.forEach((entry, position) => {
          const block = entry.block;
          block.x = padding;
          block.y = y;
          block.largura = Math.max(120, canvasWidth - padding * 2);
          block.altura = Number(block.altura || 220);
          block.zIndex = position + 1;
          block.design = block.design || {};
          block.design.v4AutoLayout = { mode, gap, padding, order: position };
          y += block.altura + gap;
        });
      }

      if (mode === "horizontal") {
        let x = padding;
        entries.forEach((entry, position) => {
          const block = entry.block;
          block.x = x;
          block.y = padding;
          block.largura = Number(block.largura || Math.max(180, (canvasWidth - padding * 2 - gap * (entries.length - 1)) / entries.length));
          block.altura = Number(block.altura || 220);
          block.zIndex = position + 1;
          block.design = block.design || {};
          block.design.v4AutoLayout = { mode, gap, padding, order: position };
          x += block.largura + gap;
        });
      }

      if (mode === "grid") {
        const columns = Math.max(1, Number(opts.columns || (canvasWidth < 500 ? 1 : canvasWidth < 900 ? 2 : 3)));
        const width = Math.max(120, (canvasWidth - padding * 2 - gap * (columns - 1)) / columns);
        let rowY = padding;
        let rowHeight = 0;
        entries.forEach((entry, position) => {
          const column = position % columns;
          if (column === 0 && position > 0) {
            rowY += rowHeight + gap;
            rowHeight = 0;
          }
          const block = entry.block;
          block.x = Math.round(padding + column * (width + gap));
          block.y = Math.round(rowY);
          block.largura = Math.round(width);
          block.altura = Number(block.altura || 220);
          block.zIndex = position + 1;
          rowHeight = Math.max(rowHeight, block.altura);
          block.design = block.design || {};
          block.design.v4AutoLayout = { mode, gap, padding, columns, order: position };
        });
      }

      window.AuraResponsiveV4?.saveDevice?.(window.AuraResponsiveV4.currentDevice?.() || "desktop");
      notifyChange(`Auto Layout ${mode}`);
    };

    if (!isFreeMode()) {
      window.alternarModoLayout?.("livre");
      setTimeout(run, 120);
    } else run();
  }

  function groupSelected() {
    const entries = getSelectedBlocks();
    if (entries.length < 2) return toast("Selecione pelo menos dois blocos.", "error");
    checkpoint("Antes de agrupar blocos");
    const groupId = `group_v4_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    entries.forEach((entry) => {
      entry.block.design = entry.block.design || {};
      entry.block.design.v4GroupId = groupId;
    });
    notifyChange("Blocos agrupados");
  }

  function ungroupSelected() {
    const entries = getSelectedBlocks();
    if (!entries.length) return;
    checkpoint("Antes de desagrupar blocos");
    entries.forEach((entry) => {
      if (entry.block.design) delete entry.block.design.v4GroupId;
    });
    notifyChange("Blocos desagrupados");
  }

  function selectGroup() {
    const primary = getSelectedBlocks()[0]?.block;
    const groupId = primary?.design?.v4GroupId;
    if (!groupId) return toast("O bloco selecionado não pertence a um grupo.", "error");
    state.selectedIds.clear();
    pageEntries().forEach((entry) => {
      if (entry.block.design?.v4GroupId === groupId) state.selectedIds.add(entry.block.id);
    });
    state.primaryId = primary.id;
    syncLegacySelection();
  }

  function toggleLock() {
    const entries = getSelectedBlocks();
    if (!entries.length) return;
    checkpoint("Antes de alterar bloqueio");
    const shouldLock = entries.some((entry) => !entry.block._auraLocked);
    entries.forEach((entry) => {
      entry.block._auraLocked = shouldLock;
      entry.block.design = entry.block.design || {};
      entry.block.design.v4Locked = shouldLock;
    });
    notifyChange(shouldLock ? "Blocos bloqueados" : "Blocos desbloqueados");
  }

  function toggleVisibility() {
    const entries = getSelectedBlocks();
    if (!entries.length) return;
    checkpoint("Antes de alterar visibilidade");
    const show = entries.some((entry) => entry.block.visivel === false);
    entries.forEach((entry) => { entry.block.visivel = show; });
    notifyChange(show ? "Blocos exibidos" : "Blocos ocultados");
  }

  function duplicateSelected() {
    const entries = getSelectedBlocks();
    if (!entries.length) return;
    checkpoint("Antes de duplicar blocos");
    const all = getBlocks();
    const newIds = [];
    entries.forEach((entry, offset) => {
      const item = clone(entry.block);
      item.id = `lpb_v4_dup_${Date.now()}_${offset}_${Math.random().toString(36).slice(2, 6)}`;
      item._colapsado = true;
      if (item.x !== undefined) {
        item.x = Number(item.x || 0) + 24;
        item.y = Number(item.y || 0) + 24;
        item.zIndex = Math.max(0, ...all.map((block) => Number(block.zIndex || 0))) + offset + 1;
      }
      if (item.design?.v4Component?.role === "master") delete item.design.v4Component;
      all.splice(entry.index + offset + 1, 0, item);
      newIds.push(item.id);
    });
    state.selectedIds = new Set(newIds);
    state.primaryId = newIds[0] || null;
    notifyChange("Blocos duplicados");
    syncLegacySelection({ skipInspector: true });
  }

  function deleteSelected() {
    const entries = getSelectedBlocks().sort((a, b) => b.index - a.index);
    if (!entries.length) return;
    const execute = () => {
      checkpoint("Antes de excluir blocos");
      entries.forEach((entry) => window.removerBlocoEditor?.(entry.index));
      clearSelection();
      toast(`${entries.length} bloco(s) excluído(s).`);
    };
    if (typeof window.abrirConfirmacao === "function") window.abrirConfirmacao(`Excluir ${entries.length} bloco(s)?`, execute);
    else if (window.confirm(`Excluir ${entries.length} bloco(s)?`)) execute();
  }

  function moveSelected(dx, dy) {
    const entries = getSelectedBlocks();
    if (!entries.length || !isFreeMode()) return;
    entries.forEach((entry) => {
      if (entry.block._auraLocked) return;
      entry.block.x = Math.max(0, Number(entry.block.x || 0) + dx);
      entry.block.y = Math.max(0, Number(entry.block.y || 0) + dy);
    });
    window.renderizarEditorBlocos?.();
    window.AuraStudioPro?.markDirty?.();
    scheduleDecorate();
  }

  function renderGuides() {
    const frame = getFrame();
    if (!frame) return;
    frame.querySelectorAll(":scope > .aura-v4-guide").forEach((guide) => guide.remove());
    if (!state.rulers) return;
    state.guides.vertical.forEach((position, index) => {
      const guide = document.createElement("div");
      guide.className = "aura-v4-guide is-vertical";
      guide.style.left = `${position}px`;
      guide.dataset.v4GuideAxis = "vertical";
      guide.dataset.v4GuideIndex = String(index);
      frame.appendChild(guide);
    });
    state.guides.horizontal.forEach((position, index) => {
      const guide = document.createElement("div");
      guide.className = "aura-v4-guide is-horizontal";
      guide.style.top = `${position}px`;
      guide.dataset.v4GuideAxis = "horizontal";
      guide.dataset.v4GuideIndex = String(index);
      frame.appendChild(guide);
    });
  }

  function tickHTML(length) {
    const step = length > 1000 ? 100 : 50;
    let html = "";
    for (let value = 0; value <= length; value += step) {
      html += `<span style="--p:${value}px"><b>${value}</b></span>`;
    }
    return html;
  }

  function renderRulers() {
    const horizontal = document.getElementById("aura-v4-ruler-x");
    const vertical = document.getElementById("aura-v4-ruler-y");
    const frame = getFrame();
    if (!horizontal || !vertical || !frame) return;
    horizontal.classList.toggle("hidden", !state.rulers);
    vertical.classList.toggle("hidden", !state.rulers);
    if (!state.rulers) return;
    const width = Number.parseFloat(frame.style.width) || frame.offsetWidth || 1200;
    const height = Math.max(600, getCanvas()?.scrollHeight || 600);
    horizontal.innerHTML = tickHTML(width);
    vertical.innerHTML = tickHTML(height);
  }

  function addGuide(axis, event) {
    const frame = getFrame();
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    const scaleX = rect.width / Math.max(1, Number.parseFloat(frame.style.width) || frame.offsetWidth);
    const position = axis === "vertical"
      ? Math.round((event.clientX - rect.left) / Math.max(scaleX, 0.001))
      : Math.round((event.clientY - rect.top) / Math.max(scaleX, 0.001));
    state.guides[axis].push(Math.max(0, position));
    renderGuides();
  }

  function clearGuides() {
    state.guides.vertical = [];
    state.guides.horizontal = [];
    renderGuides();
  }

  function injectLauncher() {
    const topbar = getModal()?.querySelector(":scope > .aura-lped-topbar");
    if (!topbar || document.getElementById("aura-v4-launcher")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.id = "aura-v4-launcher";
    button.className = "aura-v4-launcher";
    button.title = "Canvas V4 (Ctrl+Alt+C)";
    button.innerHTML = `${ICONS.canvas}<span><small>Motor</small><b>Canvas V4</b></span>`;
    button.addEventListener("click", () => openPanel("blocks"));
    const actions = topbar.querySelector(".flex.items-center.gap-2.shrink-0") || topbar.lastElementChild;
    if (actions) actions.insertBefore(button, actions.firstChild);
    else topbar.appendChild(button);
  }

  function injectToolbar() {
    const modal = getModal();
    if (!modal || document.getElementById("aura-v4-toolbar")) return;
    const toolbar = document.createElement("div");
    toolbar.id = "aura-v4-toolbar";
    toolbar.className = "aura-v4-toolbar";
    toolbar.innerHTML = `
      <button type="button" data-v4-tab="blocks" title="Biblioteca V4">${ICONS.blocks}<span>Blocos</span></button>
      <button type="button" data-v4-tab="layout" title="Layout e alinhamento">${ICONS.layout}<span>Layout</span></button>
      <button type="button" data-v4-tab="responsive" title="Responsividade">${ICONS.responsive}<span>Responsivo</span></button>
      <button type="button" data-v4-tab="components" title="Componentes">${ICONS.components}<span>Componentes</span></button>
      <button type="button" data-v4-tab="history" title="Histórico V4">${ICONS.history}<span>Histórico</span></button>
      <button type="button" data-v4-tab="canvas" title="Configurações do canvas">${ICONS.settings}<span>Canvas</span></button>
      <i></i>
      <button type="button" data-v4-action="duplicate" title="Duplicar seleção">Duplicar</button>
      <button type="button" data-v4-action="group" title="Agrupar seleção">Agrupar</button>
      <button type="button" data-v4-action="lock" title="Bloquear seleção">Bloquear</button>
      <button type="button" data-v4-action="delete" class="is-danger" title="Excluir seleção">Excluir</button>
      <strong id="aura-v4-selection-count">0 selecionados</strong>
    `;
    modal.appendChild(toolbar);
    $$('[data-v4-tab]', toolbar).forEach((button) => button.addEventListener("click", () => openPanel(button.dataset.v4Tab)));
    $$('[data-v4-action]', toolbar).forEach((button) => button.addEventListener("click", () => runAction(button.dataset.v4Action)));
  }

  function injectStageChrome() {
    const frame = getFrame();
    if (!frame || document.getElementById("aura-v4-ruler-x")) return;
    const stage = frame.parentElement;
    if (!stage) return;
    stage.classList.add("aura-v4-stage");
    const rulerX = document.createElement("div");
    rulerX.id = "aura-v4-ruler-x";
    rulerX.className = "aura-v4-ruler is-horizontal";
    const rulerY = document.createElement("div");
    rulerY.id = "aura-v4-ruler-y";
    rulerY.className = "aura-v4-ruler is-vertical";
    const corner = document.createElement("button");
    corner.id = "aura-v4-ruler-corner";
    corner.className = "aura-v4-ruler-corner";
    corner.title = "Limpar guias";
    corner.innerHTML = "×";
    stage.append(rulerX, rulerY, corner);
    rulerX.addEventListener("dblclick", (event) => addGuide("vertical", event));
    rulerY.addEventListener("dblclick", (event) => addGuide("horizontal", event));
    corner.addEventListener("click", clearGuides);

    const readout = document.createElement("div");
    readout.id = "aura-v4-transform-readout";
    readout.className = "aura-v4-transform-readout hidden";
    stage.appendChild(readout);
  }

  function injectInlineEditor() {
    const modal = getModal();
    if (!modal || document.getElementById("aura-v4-inline-editor")) return;
    const editor = document.createElement("div");
    editor.id = "aura-v4-inline-editor";
    editor.className = "aura-v4-inline-modal hidden";
    editor.innerHTML = `
      <div class="aura-v4-inline-backdrop" data-v4-inline-close></div>
      <section>
        <header><div><small>Edição direta</small><h3 id="aura-v4-inline-type">Bloco</h3></div><button type="button" data-v4-inline-close>×</button></header>
        <label><span>Título</span><input id="aura-v4-inline-title" type="text"></label>
        <label><span>Texto / descrição</span><textarea id="aura-v4-inline-subtitle" rows="5"></textarea></label>
        <div class="aura-v4-inline-grid">
          <label><span>Texto do botão</span><input id="aura-v4-inline-button" type="text"></label>
          <label><span>Link do botão</span><input id="aura-v4-inline-link" type="text"></label>
        </div>
        <footer><button type="button" data-v4-inline-close>Cancelar</button><button type="button" id="aura-v4-inline-save">Aplicar alterações</button></footer>
      </section>
    `;
    modal.appendChild(editor);
    $$('[data-v4-inline-close]', editor).forEach((button) => button.addEventListener("click", () => editor.classList.add("hidden")));
    $("#aura-v4-inline-save", editor).addEventListener("click", saveInlineEdit);
  }

  function tabButton(id, label, icon) {
    return `<button type="button" data-v4-panel-tab="${id}">${icon}<span>${label}</span></button>`;
  }

  function injectPanel() {
    const modal = getModal();
    if (!modal || document.getElementById("aura-v4-panel")) {
      state.panel = document.getElementById("aura-v4-panel");
      return;
    }
    const panel = document.createElement("div");
    panel.id = "aura-v4-panel";
    panel.className = "aura-v4-panel hidden";
    panel.innerHTML = `
      <div class="aura-v4-panel-backdrop" data-v4-panel-close></div>
      <section class="aura-v4-panel-shell">
        <header class="aura-v4-panel-header">
          <div><span>${ICONS.canvas}</span><div><small>Vide Aura Studio</small><h2>Canvas Profissional V4</h2><p>Biblioteca, precisão, responsividade e componentes.</p></div></div>
          <button type="button" data-v4-panel-close>×</button>
        </header>
        <div class="aura-v4-panel-body">
          <aside>
            ${tabButton("blocks", "Blocos V4", ICONS.blocks)}
            ${tabButton("layout", "Layout", ICONS.layout)}
            ${tabButton("responsive", "Responsividade", ICONS.responsive)}
            ${tabButton("components", "Componentes", ICONS.components)}
            ${tabButton("history", "Histórico", ICONS.history)}
            ${tabButton("canvas", "Canvas", ICONS.settings)}
          </aside>
          <main id="aura-v4-panel-content"></main>
        </div>
      </section>
    `;
    modal.appendChild(panel);
    state.panel = panel;
    $$('[data-v4-panel-close]', panel).forEach((button) => button.addEventListener("click", closePanel));
    $$('[data-v4-panel-tab]', panel).forEach((button) => button.addEventListener("click", () => setPanelTab(button.dataset.v4PanelTab)));
  }

  function openPanel(tab) {
    if (!state.panel) injectPanel();
    state.panelOpen = true;
    state.panel?.classList.remove("hidden");
    setPanelTab(tab || state.activeTab);
  }

  function closePanel() {
    state.panelOpen = false;
    state.panel?.classList.add("hidden");
  }

  function setPanelTab(tab) {
    state.activeTab = tab;
    $$('[data-v4-panel-tab]', state.panel).forEach((button) => button.classList.toggle("is-active", button.dataset.v4PanelTab === tab));
    renderPanelContent();
  }

  function panelContent() {
    return document.getElementById("aura-v4-panel-content");
  }

  function renderPanelContent() {
    const root = panelContent();
    if (!root) return;
    if (state.activeTab === "blocks") renderBlocksPanel(root);
    if (state.activeTab === "layout") renderLayoutPanel(root);
    if (state.activeTab === "responsive") renderResponsivePanel(root);
    if (state.activeTab === "components") renderComponentsPanel(root);
    if (state.activeTab === "history") renderHistoryPanel(root);
    if (state.activeTab === "canvas") renderCanvasPanel(root);
  }

  function panelHeading(eyebrow, title, text) {
    return `<div class="aura-v4-content-heading"><div><small>${eyebrow}</small><h3>${title}</h3><p>${text}</p></div><span id="aura-v4-content-meta"></span></div>`;
  }

  function libraryResults() {
    const items = Array.isArray(window.AURA_STUDIO_PRESETS) ? window.AURA_STUDIO_PRESETS : [];
    const term = state.search.trim().toLowerCase();
    return items.filter((item) => {
      const category = item.categoria || "Outros";
      const categoryOk = state.category === "all" || category === state.category;
      const haystack = [item.nome, item.categoria, item.objetivo, item.nicho, ...(item.tags || [])].join(" ").toLowerCase();
      return categoryOk && (!term || haystack.includes(term));
    });
  }

  function renderBlocksPanel(root) {
    const all = Array.isArray(window.AURA_STUDIO_PRESETS) ? window.AURA_STUDIO_PRESETS : [];
    const categories = Array.from(new Set(all.map((item) => item.categoria || "Outros"))).sort((a, b) => a.localeCompare(b, "pt-BR"));
    const results = libraryResults();
    const totalPages = Math.max(1, Math.ceil(results.length / state.perPage));
    state.page = Math.min(state.page, totalPages);
    const shown = results.slice((state.page - 1) * state.perPage, state.page * state.perPage);
    root.innerHTML = `
      ${panelHeading("Biblioteca expansível", "Blocos e páginas V4", "Modelos compatíveis com o editor e combinados por nicho, objetivo e estilo.")}
      <div class="aura-v4-library-tools">
        <label><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path></svg><input id="aura-v4-library-search" type="search" value="${escapeHTML(state.search)}" placeholder="Pesquisar bloco, nicho, objetivo ou estilo..."></label>
        <select id="aura-v4-library-category"><option value="all">Todas as categorias</option>${categories.map((category) => `<option value="${escapeHTML(category)}" ${state.category === category ? "selected" : ""}>${escapeHTML(category)}</option>`).join("")}</select>
      </div>
      <div class="aura-v4-library-stats"><span><b>${all.length}</b> modelos totais</span><span><b>${window.AuraBlocksV4?.generated?.length || 0}</b> adicionados no V4</span><span><b>${results.length}</b> resultados</span></div>
      <div class="aura-v4-library-grid">${shown.map((item) => `
        <article class="aura-v4-preset-card" style="--accent:${item.accent || "#7C3AED"}">
          <div class="aura-v4-preset-preview"><i></i><i></i><i></i><span>${item.tipo === "pagina" ? "Página" : "Seção"}</span></div>
          <div><small>${escapeHTML(item.categoria || "Modelo")}</small><h4>${escapeHTML(item.nome || "Sem nome")}</h4><p>${escapeHTML(item.objetivo || "Personalizável")} · ${(item.blocos || []).length} bloco(s)</p></div>
          <button type="button" data-v4-insert-preset="${escapeHTML(item.id)}">Inserir no canvas</button>
        </article>`).join("") || '<div class="aura-v4-empty"><strong>Nenhum modelo encontrado</strong><p>Tente outro termo ou categoria.</p></div>'}</div>
      <div class="aura-v4-pagination"><button type="button" data-v4-page="prev" ${state.page <= 1 ? "disabled" : ""}>Anterior</button><span>Página ${state.page} de ${totalPages}</span><button type="button" data-v4-page="next" ${state.page >= totalPages ? "disabled" : ""}>Próxima</button></div>
    `;
    $("#aura-v4-content-meta", root).textContent = `${results.length} encontrados`;
    $("#aura-v4-library-search", root).addEventListener("input", (event) => {
      state.search = event.target.value;
      state.page = 1;
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(() => renderBlocksPanel(root), 120);
    });
    $("#aura-v4-library-category", root).addEventListener("change", (event) => {
      state.category = event.target.value;
      state.page = 1;
      renderBlocksPanel(root);
    });
    $$('[data-v4-insert-preset]', root).forEach((button) => button.addEventListener("click", () => insertPreset(button.dataset.v4InsertPreset)));
    $$('[data-v4-page]', root).forEach((button) => button.addEventListener("click", () => {
      state.page += button.dataset.v4Page === "next" ? 1 : -1;
      renderBlocksPanel(root);
    }));
  }

  function insertPreset(id) {
    checkpoint("Antes de inserir modelo V4");
    if (window.AuraStudioPro?.insertPreset) {
      window.AuraStudioPro.insertPreset(id);
      closePanel();
      toast("Modelo V4 inserido.");
      return;
    }
    const preset = window.AuraBlocksV4?.find?.(id);
    if (!preset) return;
    getBlocks().push(...clone(preset.blocos || []));
    notifyChange("Modelo V4 inserido");
    closePanel();
  }

  function renderLayoutPanel(root) {
    const entries = getSelectedBlocks();
    root.innerHTML = `
      ${panelHeading("Precisão visual", "Layout e organização", "Alinhe, distribua, agrupe e organize blocos diretamente no canvas.")}
      <div class="aura-v4-selection-summary"><strong>${entries.length}</strong><div><b>bloco(s) selecionado(s)</b><span>${entries.map((entry) => typeLabel(entry.block.tipo)).slice(0, 4).join(" · ") || "Selecione blocos no canvas"}</span></div></div>
      <section class="aura-v4-control-section"><header><div><small>Alinhamento</small><h4>Posição precisa</h4></div></header><div class="aura-v4-icon-grid is-six">
        ${["left", "center-x", "right", "top", "center-y", "bottom"].map((mode) => `<button type="button" data-v4-align="${mode}">${mode.replace("center-x", "Centro H").replace("center-y", "Centro V").replace("left", "Esquerda").replace("right", "Direita").replace("top", "Topo").replace("bottom", "Base")}</button>`).join("")}
      </div><div class="aura-v4-inline-actions"><button type="button" data-v4-distribute="x">Distribuir horizontal</button><button type="button" data-v4-distribute="y">Distribuir vertical</button></div></section>
      <section class="aura-v4-control-section"><header><div><small>Auto Layout</small><h4>Organização automática</h4></div></header><div class="aura-v4-field-grid"><label><span>Espaçamento</span><input id="aura-v4-layout-gap" type="number" min="0" max="200" value="24"></label><label><span>Padding</span><input id="aura-v4-layout-padding" type="number" min="0" max="300" value="24"></label><label><span>Colunas</span><input id="aura-v4-layout-columns" type="number" min="1" max="8" value="3"></label></div><div class="aura-v4-inline-actions"><button type="button" data-v4-auto="vertical">Coluna</button><button type="button" data-v4-auto="horizontal">Linha</button><button type="button" data-v4-auto="grid">Grade</button></div></section>
      <section class="aura-v4-control-section"><header><div><small>Estrutura</small><h4>Grupos e camadas</h4></div></header><div class="aura-v4-inline-actions is-wrap"><button type="button" data-v4-action="group">Agrupar</button><button type="button" data-v4-action="select-group">Selecionar grupo</button><button type="button" data-v4-action="ungroup">Desagrupar</button><button type="button" data-v4-action="lock">Bloquear</button><button type="button" data-v4-action="visibility">Visibilidade</button><button type="button" data-v4-action="duplicate">Duplicar</button></div></section>
    `;
    $("#aura-v4-content-meta", root).textContent = isFreeMode() ? "Modo Livre" : "Ative o modo Livre";
    $$('[data-v4-align]', root).forEach((button) => button.addEventListener("click", () => align(button.dataset.v4Align)));
    $$('[data-v4-distribute]', root).forEach((button) => button.addEventListener("click", () => distribute(button.dataset.v4Distribute)));
    $$('[data-v4-auto]', root).forEach((button) => button.addEventListener("click", () => autoLayout(button.dataset.v4Auto, {
      gap: $("#aura-v4-layout-gap", root).value,
      padding: $("#aura-v4-layout-padding", root).value,
      columns: $("#aura-v4-layout-columns", root).value
    })));
    $$('[data-v4-action]', root).forEach((button) => button.addEventListener("click", () => runAction(button.dataset.v4Action)));
  }

  function renderResponsivePanel(root) {
    const device = window.AuraResponsiveV4?.currentDevice?.() || "desktop";
    const entries = getSelectedBlocks();
    const primary = entries[0];
    const data = primary ? window.AuraResponsiveV4?.getBlockDeviceState?.(primary.index, device) : null;
    root.innerHTML = `
      ${panelHeading("Breakpoints", "Responsividade profissional", "Crie ajustes próprios para desktop, tablet e celular sem perder a configuração principal.")}
      <div class="aura-v4-device-tabs">${["desktop", "tablet", "mobile"].map((item) => `<button type="button" data-v4-device="${item}" class="${device === item ? "is-active" : ""}">${item === "desktop" ? "Desktop" : item === "tablet" ? "Tablet" : "Celular"}</button>`).join("")}</div>
      <section class="aura-v4-control-section"><header><div><small>Transferência</small><h4>Copiar e restaurar configurações</h4></div></header><div class="aura-v4-inline-actions is-wrap"><button type="button" data-v4-copy="desktop:tablet">Desktop → Tablet</button><button type="button" data-v4-copy="tablet:mobile">Tablet → Celular</button><button type="button" data-v4-copy="desktop:mobile">Desktop → Celular</button><button type="button" data-v4-reset="${device}">Restaurar herança</button></div></section>
      <section class="aura-v4-control-section"><header><div><small>Seleção atual</small><h4>${entries.length ? `${entries.length} bloco(s)` : "Nenhum bloco selecionado"}</h4></div></header>
        ${primary ? `<div class="aura-v4-field-grid is-four"><label><span>X</span><input data-v4-responsive="geometry.x" type="number" value="${Number(data?.geometry?.x || 0)}"></label><label><span>Y</span><input data-v4-responsive="geometry.y" type="number" value="${Number(data?.geometry?.y || 0)}"></label><label><span>Largura</span><input data-v4-responsive="geometry.largura" type="number" value="${Number(data?.geometry?.largura || primary.block.largura || 600)}"></label><label><span>Altura</span><input data-v4-responsive="geometry.altura" type="number" value="${Number(data?.geometry?.altura || primary.block.altura || 220)}"></label></div><div class="aura-v4-field-grid"><label><span>Padding superior</span><input data-v4-responsive="design.paddingTop" type="number" value="${Number(data?.design?.paddingTop || primary.block.design?.paddingTop || 0)}"></label><label><span>Padding inferior</span><input data-v4-responsive="design.paddingBottom" type="number" value="${Number(data?.design?.paddingBottom || primary.block.design?.paddingBottom || 0)}"></label><label><span>Alinhamento</span><select data-v4-responsive="design.alinhamento"><option value="esquerda">Esquerda</option><option value="centro">Centro</option><option value="direita">Direita</option></select></label></div>` : '<div class="aura-v4-empty"><strong>Selecione um bloco</strong><p>Os controles responsivos serão exibidos aqui.</p></div>'}
      </section>
      <div class="aura-v4-info"><strong>Preparado para o Renderer V4</strong><p>As variações ficam salvas dentro do design do bloco. A etapa seguinte aplicará todas elas também na página pública.</p></div>
    `;
    $("#aura-v4-content-meta", root).textContent = device;
    const alignSelect = $('[data-v4-responsive="design.alinhamento"]', root);
    if (alignSelect) alignSelect.value = data?.design?.alinhamento || primary?.block?.design?.alinhamento || "esquerda";
    $$('[data-v4-device]', root).forEach((button) => button.addEventListener("click", () => {
      window.AuraStudioDeviceHotfix?.setDevice?.(button.dataset.v4Device);
      setTimeout(() => renderResponsivePanel(root), 80);
    }));
    $$('[data-v4-copy]', root).forEach((button) => button.addEventListener("click", () => {
      const [from, to] = button.dataset.v4Copy.split(":");
      window.AuraResponsiveV4?.copyDevice?.(from, to, true);
      renderResponsivePanel(root);
    }));
    $$('[data-v4-reset]', root).forEach((button) => button.addEventListener("click", () => {
      window.AuraResponsiveV4?.resetDevice?.(button.dataset.v4Reset, true);
      renderResponsivePanel(root);
    }));
    $$('[data-v4-responsive]', root).forEach((input) => input.addEventListener("change", () => {
      const value = input.tagName === "SELECT" ? input.value : Number(input.value);
      window.AuraResponsiveV4?.setProperty?.(entries.map((entry) => entry.index), input.dataset.v4Responsive, value, device);
    }));
  }

  function renderComponentsPanel(root) {
    const components = window.AuraComponentsV4?.list?.() || [];
    const selected = getSelectedBlocks();
    const selectedComponent = selected[0]?.block?.design?.v4Component;
    root.innerHTML = `
      ${panelHeading("Sistema reutilizável", "Componentes e instâncias", "Transforme grupos em componentes, insira instâncias e sincronize alterações.")}
      <div class="aura-v4-inline-actions"><button type="button" id="aura-v4-create-component">Criar da seleção</button>${selectedComponent ? `<button type="button" id="aura-v4-update-component">Atualizar componente</button><button type="button" id="aura-v4-detach-component">Desvincular</button>` : ""}</div>
      <div class="aura-v4-components-grid">${components.map((component) => `<article style="--accent:${component.accent || "#7C3AED"}"><span>${component.type === "group" ? `${component.blocks.length} blocos` : "1 bloco"}</span><h4>${escapeHTML(component.name)}</h4><p>Atualizado em ${new Date(component.updatedAt || component.createdAt).toLocaleDateString("pt-BR")}</p><div><button type="button" data-v4-component-insert="${component.id}">Inserir</button><button type="button" data-v4-component-remove="${component.id}">Excluir</button></div></article>`).join("") || '<div class="aura-v4-empty"><strong>Nenhum componente salvo</strong><p>Selecione blocos e crie uma estrutura reutilizável.</p></div>'}</div>
    `;
    $("#aura-v4-content-meta", root).textContent = `${components.length} componente(s)`;
    $("#aura-v4-create-component", root)?.addEventListener("click", () => {
      window.AuraComponentsV4?.createFromSelection?.();
      renderComponentsPanel(root);
    });
    $("#aura-v4-update-component", root)?.addEventListener("click", () => {
      if (selectedComponent?.componentId) window.AuraComponentsV4?.updateFromMaster?.(selectedComponent.componentId);
      renderComponentsPanel(root);
    });
    $("#aura-v4-detach-component", root)?.addEventListener("click", () => {
      window.AuraComponentsV4?.detachSelected?.();
      renderComponentsPanel(root);
    });
    $$('[data-v4-component-insert]', root).forEach((button) => button.addEventListener("click", () => {
      window.AuraComponentsV4?.insert?.(button.dataset.v4ComponentInsert);
      closePanel();
    }));
    $$('[data-v4-component-remove]', root).forEach((button) => button.addEventListener("click", () => {
      if (window.confirm("Excluir este componente salvo?")) {
        window.AuraComponentsV4?.remove?.(button.dataset.v4ComponentRemove);
        renderComponentsPanel(root);
      }
    }));
  }

  function renderHistoryPanel(root) {
    const history = window.AuraHistoryV4?.state;
    const versions = history?.versions || [];
    const recovery = window.AuraHistoryV4?.recoveryAvailable?.();
    root.innerHTML = `
      ${panelHeading("Segurança criativa", "Histórico e recuperação V4", "Checkpoints locais para alterações do canvas, componentes e responsividade.")}
      <div class="aura-v4-history-actions"><button type="button" id="aura-v4-history-undo">Desfazer V4</button><button type="button" id="aura-v4-history-redo">Refazer V4</button><button type="button" id="aura-v4-history-version">Criar versão</button>${recovery ? '<button type="button" id="aura-v4-history-recover">Recuperar rascunho</button>' : ""}</div>
      <div class="aura-v4-history-summary"><span><b>${history?.undo?.length || 0}</b> ações</span><span><b>${history?.redo?.length || 0}</b> para refazer</span><span><b>${versions.length}</b> versões</span></div>
      <div class="aura-v4-version-list">${versions.map((version) => `<article><span>${version.kind === "manual" ? "Manual" : "Automática"}</span><div><h4>${escapeHTML(version.label)}</h4><p>${new Date(version.createdAt).toLocaleString("pt-BR")} · ${version.blocks.length} bloco(s)</p></div><button type="button" data-v4-version-restore="${version.id}">Restaurar</button></article>`).join("") || '<div class="aura-v4-empty"><strong>Nenhuma versão criada</strong><p>Crie uma versão antes de mudanças importantes.</p></div>'}</div>
    `;
    $("#aura-v4-content-meta", root).textContent = "Armazenamento local";
    $("#aura-v4-history-undo", root)?.addEventListener("click", () => { window.AuraHistoryV4?.undo?.(); renderHistoryPanel(root); });
    $("#aura-v4-history-redo", root)?.addEventListener("click", () => { window.AuraHistoryV4?.redo?.(); renderHistoryPanel(root); });
    $("#aura-v4-history-version", root)?.addEventListener("click", () => { window.AuraHistoryV4?.createVersion?.(); renderHistoryPanel(root); });
    $("#aura-v4-history-recover", root)?.addEventListener("click", () => { window.AuraHistoryV4?.restoreRecovery?.(); renderHistoryPanel(root); });
    $$('[data-v4-version-restore]', root).forEach((button) => button.addEventListener("click", () => {
      window.AuraHistoryV4?.restoreVersion?.(button.dataset.v4VersionRestore);
      closePanel();
    }));
  }

  function renderCanvasPanel(root) {
    root.innerHTML = `
      ${panelHeading("Ambiente de criação", "Configurações do canvas", "Ajuste grade, snap, contornos, réguas e guias de precisão.")}
      <div class="aura-v4-toggle-list">
        ${toggleHTML("grid", "Grade visual", "Exibe uma malha de apoio no canvas.", state.grid)}
        ${toggleHTML("snap", "Encaixe na grade", "Redimensionamentos V4 respeitam o espaçamento definido.", state.snap)}
        ${toggleHTML("rulers", "Réguas e guias", "Exibe réguas; dê duplo clique para criar uma guia.", state.rulers)}
        ${toggleHTML("outlines", "Modo de contornos", "Destaca limites de todos os blocos.", state.outlines)}
      </div>
      <section class="aura-v4-control-section"><header><div><small>Grade</small><h4>Tamanho da unidade</h4></div></header><label class="aura-v4-range"><input id="aura-v4-grid-size" type="range" min="2" max="40" step="2" value="${state.gridSize}"><span id="aura-v4-grid-size-value">${state.gridSize}px</span></label></section>
      <section class="aura-v4-control-section"><header><div><small>Guias manuais</small><h4>Linhas de precisão</h4></div></header><p class="aura-v4-section-copy">Dê duplo clique na régua horizontal para criar uma guia vertical e na régua vertical para criar uma guia horizontal.</p><div class="aura-v4-inline-actions"><button type="button" id="aura-v4-clear-guides">Limpar guias</button><button type="button" id="aura-v4-fit-canvas">Ajustar canvas</button></div></section>
      <div class="aura-v4-shortcuts"><h4>Atalhos V4</h4><div><span><kbd>Ctrl</kbd><kbd>Alt</kbd><kbd>C</kbd> Abrir Canvas V4</span><span><kbd>Shift</kbd> Seleção múltipla</span><span><kbd>Alt</kbd><kbd>↑↓←→</kbd> Mover 10 px</span><span><kbd>Ctrl</kbd><kbd>Alt</kbd><kbd>Z</kbd> Desfazer V4</span><span><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>V</kbd> Criar versão</span></div></div>
    `;
    $("#aura-v4-content-meta", root).textContent = `${state.gridSize}px`;
    $$('[data-v4-toggle]', root).forEach((input) => input.addEventListener("change", () => {
      state[input.dataset.v4Toggle] = input.checked;
      localStorage.setItem(`aura_v4_${input.dataset.v4Toggle}`, String(input.checked));
      decorateCanvas();
    }));
    $("#aura-v4-grid-size", root).addEventListener("input", (event) => {
      state.gridSize = Number(event.target.value);
      localStorage.setItem("aura_v4_grid_size", String(state.gridSize));
      $("#aura-v4-grid-size-value", root).textContent = `${state.gridSize}px`;
      decorateCanvas();
    });
    $("#aura-v4-clear-guides", root).addEventListener("click", clearGuides);
    $("#aura-v4-fit-canvas", root).addEventListener("click", () => window.AuraStudioPro?.fitCanvas?.());
  }

  function toggleHTML(id, title, text, checked) {
    return `<label class="aura-v4-toggle-row"><div><b>${title}</b><span>${text}</span></div><input type="checkbox" data-v4-toggle="${id}" ${checked ? "checked" : ""}><i></i></label>`;
  }

  function renderSelectionMeta() {
    const count = state.selectedIds.size;
    const label = document.getElementById("aura-v4-selection-count");
    if (label) label.textContent = count === 1 ? "1 selecionado" : `${count} selecionados`;
    const toolbar = document.getElementById("aura-v4-toolbar");
    toolbar?.classList.toggle("has-selection", count > 0);
    if (state.panelOpen && ["layout", "responsive", "components"].includes(state.activeTab)) renderPanelContent();
  }

  function runAction(action) {
    if (action === "duplicate") duplicateSelected();
    if (action === "group") groupSelected();
    if (action === "ungroup") ungroupSelected();
    if (action === "select-group") selectGroup();
    if (action === "lock") toggleLock();
    if (action === "visibility") toggleVisibility();
    if (action === "delete") deleteSelected();
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function bindCanvas() {
    const canvas = getCanvas();
    if (!canvas) return;
    if (state.canvasElement === canvas && state.canvasAbortController) return;
    state.canvasAbortController?.abort();
    state.canvasAbortController = new AbortController();
    state.canvasElement = canvas;
    const { signal } = state.canvasAbortController;

    canvas.addEventListener("pointerdown", onCanvasPointerDown, { capture: true, signal });
    canvas.addEventListener("dblclick", onCanvasDoubleClick, { capture: true, signal });
    document.addEventListener("pointermove", (event) => {
      updateMobileTap(event);
      transformMove(event);
      marqueeMove(event);
    }, { signal });
    document.addEventListener("pointerup", (event) => {
      if (finishMobileTap(event)) return;
      if (state.transform) finishTransform();
      if (state.marquee) finishMarquee(event);
    }, { signal });
    document.addEventListener("pointercancel", cancelMobileTap, { signal });
  }

  function bindKeyboard() {
    document.addEventListener("keydown", (event) => {
      if (!isEditorOpen()) return;
      const target = event.target;
      const typing = target instanceof HTMLElement && (target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(target.tagName));
      if (typing) return;
      const key = String(event.key || "").toLowerCase();

      if ((event.ctrlKey || event.metaKey) && event.altKey && key === "c") {
        event.preventDefault();
        openPanel("blocks");
        return;
      }
      if (key === "escape") {
        if (state.panelOpen) closePanel();
        else clearSelection();
        return;
      }
      if ((key === "delete" || key === "backspace") && state.selectedIds.size) {
        event.preventDefault();
        deleteSelected();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && key === "d" && state.selectedIds.size) {
        event.preventDefault();
        duplicateSelected();
        return;
      }
      if (isFreeMode() && ["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(key) && state.selectedIds.size) {
        event.preventDefault();
        const amount = event.altKey || event.shiftKey ? 10 : 1;
        if (key === "arrowleft") moveSelected(-amount, 0);
        if (key === "arrowright") moveSelected(amount, 0);
        if (key === "arrowup") moveSelected(0, -amount);
        if (key === "arrowdown") moveSelected(0, amount);
      }
    });

    document.addEventListener("keyup", (event) => {
      const key = String(event.key || "").toLowerCase();
      if (isEditorOpen() && isFreeMode() && ["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(key) && state.selectedIds.size) {
        window.AuraResponsiveV4?.saveDevice?.(window.AuraResponsiveV4.currentDevice?.() || "desktop");
        document.dispatchEvent(new CustomEvent("aura:studio-change", { detail: { source: "canvas-v4", label: "Blocos movidos" } }));
      }
    });
  }

  function watchCanvas() {
    const canvas = getCanvas();
    if (!canvas) {
      setTimeout(watchCanvas, 160);
      return;
    }
    bindCanvas();
    if (state.observer) state.observer.disconnect();
    state.observer = new MutationObserver(scheduleDecorate);
    state.observer.observe(canvas, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class"] });
    scheduleDecorate();
  }

  function watchEditor() {
    const modal = getModal();
    if (!modal) {
      setTimeout(watchEditor, 180);
      return;
    }
    const handle = () => {
      if (modal.classList.contains("hidden")) return;
      setTimeout(() => {
        injectLauncher();
        injectToolbar();
        injectStageChrome();
        injectInlineEditor();
        injectPanel();
        watchCanvas();
        renderSelectionMeta();
        decorateCanvas();
      }, 100);
    };
    state.editorObserver = new MutationObserver(handle);
    state.editorObserver.observe(modal, { attributes: true, attributeFilter: ["class"] });
    handle();
  }

  function init() {
    if (state.initialized) return;
    if (!getModal() || !window.lpEditorBlocos || !window.AuraStudioPro) {
      setTimeout(init, 180);
      return;
    }
    state.initialized = true;
    injectLauncher();
    injectToolbar();
    injectStageChrome();
    injectInlineEditor();
    injectPanel();
    bindKeyboard();
    watchEditor();
    watchCanvas();

    document.addEventListener("aura:studio-change", scheduleDecorate);
    document.addEventListener("aura:responsive-v4", scheduleDecorate);
    document.addEventListener("aura:components-v4", () => {
      if (state.panelOpen && state.activeTab === "components") renderPanelContent();
    });

    window.AuraCanvasV4 = {
      open: openPanel,
      close: closePanel,
      setTab: setPanelTab,
      getSelectedBlocks,
      selectById,
      selectIndex,
      clearSelection,
      setMobileInteractionEnabled: (enabled) => {
        state.mobileInteractionEnabled = Boolean(enabled);
        if (!state.mobileInteractionEnabled) {
          cancelMobileTap();
          if (state.transform) finishTransform();
          if (state.marquee?.element) state.marquee.element.remove();
          state.marquee = null;
        }
      },
      getMobileDiagnostics: () => ({
        interactionEnabled: state.mobileInteractionEnabled,
        hasTap: Boolean(state.mobileTap),
        hasCanvasController: Boolean(state.canvasAbortController),
        canvasBound: Boolean(state.canvasElement)
      }),
      align,
      distribute,
      autoLayout,
      groupSelected,
      ungroupSelected,
      duplicateSelected,
      deleteSelected,
      decorateCanvas,
      state,
      version: "4.0.0-canvas"
    };

    console.info("[Vide Aura Canvas V4] Inicializado", {
      presets: window.AURA_STUDIO_PRESETS?.length || 0,
      version: "4.0.0-canvas"
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
