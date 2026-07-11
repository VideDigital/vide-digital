(function () {
  "use strict";

  const DB_NAME = "videAuraStudioUltimate";
  const DB_VERSION = 1;
  const STORE = "mediaAssets";

  const state = {
    db: null,
    modal: null,
    assets: [],
    query: "",
    selectedAssetId: null,
    initialized: false
  };

  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => [...(root || document).querySelectorAll(selector)];
  const escapeHTML = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  function toast(message, type) {
    if (typeof window.showToast === "function") window.showToast(message, type);
    else console.info(`[Aura Assets] ${message}`);
  }

  function openDB() {
    if (state.db) return Promise.resolve(state.db);
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("createdAt", "createdAt", { unique: false });
          store.createIndex("name", "name", { unique: false });
        }
      };
      request.onsuccess = () => {
        state.db = request.result;
        resolve(state.db);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async function transaction(mode, action) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      let result;
      try {
        result = action(store);
      } catch (error) {
        reject(error);
        return;
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Transação cancelada"));
    });
  }

  async function listAssets() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).getAll();
      request.onsuccess = () => resolve((request.result || []).sort((a, b) => b.createdAt - a.createdAt));
      request.onerror = () => reject(request.error);
    });
  }

  async function putAsset(asset) {
    await transaction("readwrite", (store) => store.put(asset));
  }

  async function removeAsset(id) {
    await transaction("readwrite", (store) => store.delete(id));
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });
  }

  async function optimizeImage(file) {
    const original = await readFile(file);
    const image = await loadImage(original);
    const maxSide = 1800;
    const ratio = Math.min(1, maxSide / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * ratio));
    const height = Math.max(1, Math.round(image.height * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    let dataUrl = canvas.toDataURL("image/webp", 0.84);
    if (!dataUrl.startsWith("data:image/webp")) dataUrl = canvas.toDataURL("image/jpeg", 0.84);

    const thumbCanvas = document.createElement("canvas");
    const thumbRatio = Math.min(1, 420 / Math.max(width, height));
    thumbCanvas.width = Math.max(1, Math.round(width * thumbRatio));
    thumbCanvas.height = Math.max(1, Math.round(height * thumbRatio));
    thumbCanvas.getContext("2d").drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
    const thumbnail = thumbCanvas.toDataURL("image/webp", 0.72);

    return { dataUrl, thumbnail, width, height };
  }

  function formatBytes(bytes) {
    const value = Number(bytes || 0);
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  function getSelectedBlock() {
    return window.AuraStudioInspector?.getSelected?.() || { block: null, index: -1 };
  }

  function availableTargets(block) {
    if (!block) return [];
    const targets = [];
    if (block.tipo === "texto_midia") targets.push({ value: "main", label: "Imagem principal" });
    targets.push({ value: "background", label: "Imagem de fundo" });
    if (block.tipo === "galeria_imagens") targets.push({ value: "gallery-add", label: "Adicionar à galeria" });
    if (block.tipo === "carrossel_banners") targets.push({ value: "banner-add", label: "Adicionar ao carrossel" });
    if (block.tipo === "carrossel_cards") targets.push({ value: "card-first", label: "Imagem do primeiro card" });
    return targets;
  }

  function applyAssetToBlock(asset, targetValue) {
    const selected = getSelectedBlock();
    const block = selected.block;
    if (!block) {
      toast("Selecione um bloco no editor antes de aplicar uma imagem.", "error");
      return false;
    }

    const target = targetValue || availableTargets(block)[0]?.value || "background";
    block.props = block.props || {};
    block.design = block.design || {};

    if (target === "main") {
      block.props.imagemB64 = asset.dataUrl;
      block.props.imagemAlt = block.props.imagemAlt || asset.alt || asset.name.replace(/\.[^.]+$/, "");
    } else if (target === "background") {
      block.design.imagemFundoB64 = asset.dataUrl;
      block.design.priorizarImagem = block.design.priorizarImagem || false;
    } else if (target === "gallery-add") {
      if (!Array.isArray(block.props.imagens)) block.props.imagens = [];
      block.props.imagens.push(asset.dataUrl);
    } else if (target === "banner-add") {
      if (!Array.isArray(block.props.banners)) block.props.banners = [];
      block.props.banners.push(asset.dataUrl);
    } else if (target === "card-first") {
      if (!Array.isArray(block.props.cards)) block.props.cards = [];
      if (!block.props.cards[0]) block.props.cards.push({ titulo: "Novo card", texto: "", imagemB64: "" });
      block.props.cards[0].imagemB64 = asset.dataUrl;
    }

    window.renderizarEditorBlocos?.();
    document.dispatchEvent(new CustomEvent("aura:studio-change", { detail: { source: "ultimate-assets", label: "Imagem aplicada" } }));
    document.dispatchEvent(new CustomEvent("aura:studio-history-capture", { detail: { label: "Imagem da biblioteca aplicada" } }));
    toast("Imagem aplicada ao bloco selecionado.");
    return true;
  }

  function injectModal() {
    if (document.getElementById("aura-ultimate-assets")) {
      state.modal = document.getElementById("aura-ultimate-assets");
      return;
    }
    const modal = document.createElement("div");
    modal.id = "aura-ultimate-assets";
    modal.className = "aura-ultimate-modal hidden";
    modal.innerHTML = `
      <div class="aura-ultimate-backdrop" data-assets-close></div>
      <section class="aura-assets-shell" role="dialog" aria-modal="true" aria-labelledby="aura-assets-title">
        <header class="aura-ultimate-header">
          <div class="aura-ultimate-heading">
            <span class="aura-ultimate-heading-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="16" rx="3"></rect><circle cx="9" cy="10" r="2"></circle><path d="m4 18 5-5 4 4 3-3 4 4"></path></svg>
            </span>
            <div><small>Biblioteca local</small><h2 id="aura-assets-title">Central de mídia</h2><p>Reutilize imagens sem selecionar o mesmo arquivo várias vezes.</p></div>
          </div>
          <button type="button" class="aura-ultimate-icon-button" data-assets-close aria-label="Fechar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m6 6 12 12"></path><path d="M18 6 6 18"></path></svg>
          </button>
        </header>

        <div class="aura-assets-toolbar">
          <label class="aura-ultimate-primary-button aura-assets-upload">
            <input id="aura-assets-file" type="file" accept="image/*" multiple hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 16V4"></path><path d="m7 9 5-5 5 5"></path><path d="M5 20h14"></path></svg>
            Enviar imagens
          </label>
          <label class="aura-assets-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path></svg>
            <input id="aura-assets-search" type="search" placeholder="Pesquisar mídia...">
          </label>
          <span id="aura-assets-count" class="aura-assets-count">0 arquivos</span>
        </div>

        <div class="aura-assets-body">
          <div id="aura-assets-grid" class="aura-assets-grid"></div>
          <aside class="aura-assets-detail">
            <div id="aura-assets-empty-detail" class="aura-assets-empty-detail">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="4" y="4" width="16" height="16" rx="3"></rect><path d="m6 17 4-4 3 3 2-2 3 3"></path></svg>
              <strong>Selecione uma imagem</strong>
              <span>Veja detalhes e aplique ao bloco atual.</span>
            </div>
            <div id="aura-assets-selected-detail" class="hidden"></div>
          </aside>
        </div>
      </section>
    `;
    document.body.appendChild(modal);
    state.modal = modal;
    $$('[data-assets-close]', modal).forEach((button) => button.addEventListener("click", close));
    $("#aura-assets-file", modal)?.addEventListener("change", handleFiles);
    $("#aura-assets-search", modal)?.addEventListener("input", (event) => {
      state.query = event.target.value || "";
      render();
    });
  }

  async function handleFiles(event) {
    const files = [...(event.target.files || [])];
    if (!files.length) return;
    const valid = files.filter((file) => file.type.startsWith("image/") && file.size <= 15 * 1024 * 1024);
    if (!valid.length) {
      toast("Escolha imagens válidas com até 15 MB.", "error");
      return;
    }

    const upload = state.modal?.querySelector(".aura-assets-upload");
    upload?.classList.add("is-loading");
    try {
      for (const file of valid) {
        const optimized = await optimizeImage(file);
        await putAsset({
          id: `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          alt: file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "),
          type: file.type,
          originalSize: file.size,
          optimizedSize: Math.round((optimized.dataUrl.length * 3) / 4),
          width: optimized.width,
          height: optimized.height,
          dataUrl: optimized.dataUrl,
          thumbnail: optimized.thumbnail,
          createdAt: Date.now(),
          favorite: false
        });
      }
      toast(`${valid.length} imagem(ns) adicionada(s) à biblioteca.`);
      await refresh();
    } catch (error) {
      console.error("[Aura Assets] Falha ao processar imagens", error);
      toast("Não foi possível processar uma das imagens.", "error");
    } finally {
      upload?.classList.remove("is-loading");
      event.target.value = "";
    }
  }

  async function refresh() {
    state.assets = await listAssets();
    render();
  }

  function filteredAssets() {
    const query = state.query.trim().toLowerCase();
    if (!query) return state.assets;
    return state.assets.filter((asset) => `${asset.name} ${asset.alt}`.toLowerCase().includes(query));
  }

  function render() {
    const grid = document.getElementById("aura-assets-grid");
    if (!grid) return;
    const assets = filteredAssets();
    const count = document.getElementById("aura-assets-count");
    if (count) count.textContent = assets.length === 1 ? "1 arquivo" : `${assets.length} arquivos`;

    grid.innerHTML = assets.length ? assets.map((asset) => `
      <button type="button" class="aura-assets-card ${state.selectedAssetId === asset.id ? "is-selected" : ""}" data-asset-id="${escapeHTML(asset.id)}">
        <span class="aura-assets-thumb"><img src="${asset.thumbnail || asset.dataUrl}" alt="${escapeHTML(asset.alt || asset.name)}"></span>
        <span class="aura-assets-card-meta"><strong>${escapeHTML(asset.name)}</strong><small>${asset.width} × ${asset.height}</small></span>
        ${asset.favorite ? '<span class="aura-assets-favorite-mark">★</span>' : ""}
      </button>
    `).join("") : `
      <div class="aura-assets-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>
        <strong>Nenhuma mídia encontrada</strong>
        <span>Envie imagens para reutilizar em qualquer Landing Page neste navegador.</span>
      </div>
    `;

    $$('[data-asset-id]', grid).forEach((button) => button.addEventListener("click", () => {
      state.selectedAssetId = button.dataset.assetId;
      render();
      renderDetail();
    }));
    renderDetail();
  }

  function renderDetail() {
    const empty = document.getElementById("aura-assets-empty-detail");
    const detail = document.getElementById("aura-assets-selected-detail");
    const asset = state.assets.find((item) => item.id === state.selectedAssetId);
    if (!asset || !detail || !empty) {
      empty?.classList.remove("hidden");
      detail?.classList.add("hidden");
      return;
    }

    const selected = getSelectedBlock();
    const targets = availableTargets(selected.block);
    empty.classList.add("hidden");
    detail.classList.remove("hidden");
    detail.innerHTML = `
      <div class="aura-assets-preview"><img src="${asset.dataUrl}" alt="${escapeHTML(asset.alt || asset.name)}"></div>
      <div class="aura-assets-detail-copy">
        <small>Arquivo selecionado</small>
        <h3>${escapeHTML(asset.name)}</h3>
        <p>${asset.width} × ${asset.height} · ${formatBytes(asset.optimizedSize)}</p>
      </div>
      <label class="aura-assets-field"><span>Texto alternativo</span><input id="aura-assets-alt" value="${escapeHTML(asset.alt || "")}" maxlength="140"></label>
      <label class="aura-assets-field"><span>Aplicar em</span>
        <select id="aura-assets-target" ${targets.length ? "" : "disabled"}>
          ${targets.length ? targets.map((target) => `<option value="${target.value}">${escapeHTML(target.label)}</option>`).join("") : '<option value="background">Selecione um bloco no editor</option>'}
        </select>
      </label>
      <div class="aura-assets-detail-actions">
        <button type="button" class="aura-ultimate-secondary-button" id="aura-assets-favorite">${asset.favorite ? "Remover favorito" : "Favoritar"}</button>
        <button type="button" class="aura-ultimate-danger-button" id="aura-assets-delete">Excluir</button>
      </div>
      <button type="button" class="aura-ultimate-primary-button aura-assets-apply" id="aura-assets-apply" ${selected.block ? "" : "disabled"}>Aplicar ao bloco selecionado</button>
    `;

    document.getElementById("aura-assets-alt")?.addEventListener("change", async (event) => {
      asset.alt = event.target.value.trim();
      await putAsset(asset);
      await refresh();
    });
    document.getElementById("aura-assets-favorite")?.addEventListener("click", async () => {
      asset.favorite = !asset.favorite;
      await putAsset(asset);
      await refresh();
    });
    document.getElementById("aura-assets-delete")?.addEventListener("click", async () => {
      if (!window.confirm(`Excluir “${asset.name}” da biblioteca local?`)) return;
      await removeAsset(asset.id);
      state.selectedAssetId = null;
      await refresh();
    });
    document.getElementById("aura-assets-apply")?.addEventListener("click", () => {
      const target = document.getElementById("aura-assets-target")?.value;
      if (applyAssetToBlock(asset, target)) close();
    });
  }

  async function open() {
    injectModal();
    state.modal.classList.remove("hidden");
    try {
      await refresh();
    } catch (error) {
      console.error("[Aura Assets] Falha ao abrir biblioteca", error);
      toast("Não foi possível abrir a biblioteca de mídia.", "error");
    }
  }

  function close() {
    state.modal?.classList.add("hidden");
  }

  function init() {
    if (state.initialized) return;
    state.initialized = true;
    injectModal();
    window.AuraUltimateAssets = { open, close, refresh, applyAssetToBlock, state };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
