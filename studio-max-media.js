(function () {
  "use strict";

  const state = {
    initialized: false,
    modal: null,
    canvas: null,
    context: null,
    image: null,
    target: null,
    rotation: 0,
    flipX: 1,
    flipY: 1,
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    brightness: 100,
    contrast: 100,
    saturation: 100,
    grayscale: 0,
    blur: 0,
    quality: 88,
    observer: null
  };

  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => [...(root || document).querySelectorAll(selector)];

  function getSelected() {
    return window.AuraStudioInspector?.getSelected?.() || { block: null, index: -1 };
  }

  function detectTarget(block) {
    if (!block) return null;
    if (block.props?.imagemB64) return { scope: "props", key: "imagemB64", label: "Imagem principal" };
    if (block.design?.imagemFundoB64) return { scope: "design", key: "imagemFundoB64", label: "Imagem de fundo" };
    if (Array.isArray(block.props?.imagens) && block.props.imagens[0]) return { scope: "gallery", key: 0, label: "Primeira imagem da galeria" };
    return null;
  }

  function targetValue(block, target) {
    if (!block || !target) return "";
    if (target.scope === "gallery") return block.props?.imagens?.[target.key] || "";
    return block[target.scope]?.[target.key] || "";
  }

  function setTargetValue(block, target, value) {
    if (!block || !target) return;
    if (target.scope === "gallery") {
      if (!Array.isArray(block.props.imagens)) block.props.imagens = [];
      block.props.imagens[target.key] = value;
      return;
    }
    if (!block[target.scope]) block[target.scope] = {};
    block[target.scope][target.key] = value;
  }

  function injectModal() {
    if (document.getElementById("aura-media-studio")) {
      state.modal = document.getElementById("aura-media-studio");
      state.canvas = document.getElementById("aura-media-canvas");
      state.context = state.canvas?.getContext("2d", { alpha: false });
      return;
    }

    const modal = document.createElement("div");
    modal.id = "aura-media-studio";
    modal.className = "aura-max-modal hidden";
    modal.innerHTML = `
      <div class="aura-max-modal-backdrop" data-media-close></div>
      <section class="aura-media-shell" role="dialog" aria-modal="true" aria-labelledby="aura-media-title">
        <header class="aura-max-panel-header">
          <div class="aura-max-panel-heading">
            <span class="aura-max-panel-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="16" rx="3"></rect><circle cx="9" cy="10" r="2"></circle><path d="m4 18 5-5 4 4 3-3 4 4"></path></svg>
            </span>
            <div><small>Studio de mídia</small><h2 id="aura-media-title">Edição profissional de imagem</h2><p id="aura-media-target-label">Imagem selecionada</p></div>
          </div>
          <button type="button" class="aura-max-icon-button" data-media-close aria-label="Fechar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m6 6 12 12"></path><path d="M18 6 6 18"></path></svg>
          </button>
        </header>

        <div class="aura-media-workspace">
          <div class="aura-media-stage-wrap">
            <div class="aura-media-stage">
              <canvas id="aura-media-canvas" width="1200" height="750"></canvas>
              <div class="aura-media-safe-area"></div>
            </div>
            <div class="aura-media-toolbar">
              <label class="aura-max-secondary-button">
                <input id="aura-media-file" type="file" accept="image/*" hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 16V4"></path><path d="m7 9 5-5 5 5"></path><path d="M5 20h14"></path></svg>
                Substituir imagem
              </label>
              <button type="button" class="aura-max-secondary-button" data-media-action="rotate-left">Girar −90°</button>
              <button type="button" class="aura-max-secondary-button" data-media-action="rotate-right">Girar +90°</button>
              <button type="button" class="aura-max-secondary-button" data-media-action="flip-x">Espelhar H</button>
              <button type="button" class="aura-max-secondary-button" data-media-action="flip-y">Espelhar V</button>
              <button type="button" class="aura-max-secondary-button" data-media-action="reset">Restaurar</button>
            </div>
          </div>

          <aside class="aura-media-controls">
            <div class="aura-media-control-section is-open">
              <button type="button" class="aura-media-section-toggle"><span>Enquadramento</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m6 9 6 6 6-6"></path></svg></button>
              <div class="aura-media-section-body">
                <label class="aura-media-range"><span><b>Zoom</b><em data-media-output="zoom">100%</em></span><input data-media-control="zoom" type="range" min="100" max="300" value="100"></label>
                <label class="aura-media-range"><span><b>Posição horizontal</b><em data-media-output="offsetX">0</em></span><input data-media-control="offsetX" type="range" min="-100" max="100" value="0"></label>
                <label class="aura-media-range"><span><b>Posição vertical</b><em data-media-output="offsetY">0</em></span><input data-media-control="offsetY" type="range" min="-100" max="100" value="0"></label>
              </div>
            </div>

            <div class="aura-media-control-section is-open">
              <button type="button" class="aura-media-section-toggle"><span>Ajustes</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m6 9 6 6 6-6"></path></svg></button>
              <div class="aura-media-section-body">
                <label class="aura-media-range"><span><b>Brilho</b><em data-media-output="brightness">100%</em></span><input data-media-control="brightness" type="range" min="0" max="200" value="100"></label>
                <label class="aura-media-range"><span><b>Contraste</b><em data-media-output="contrast">100%</em></span><input data-media-control="contrast" type="range" min="0" max="200" value="100"></label>
                <label class="aura-media-range"><span><b>Saturação</b><em data-media-output="saturation">100%</em></span><input data-media-control="saturation" type="range" min="0" max="200" value="100"></label>
                <label class="aura-media-range"><span><b>Preto e branco</b><em data-media-output="grayscale">0%</em></span><input data-media-control="grayscale" type="range" min="0" max="100" value="0"></label>
                <label class="aura-media-range"><span><b>Desfoque</b><em data-media-output="blur">0px</em></span><input data-media-control="blur" type="range" min="0" max="20" value="0"></label>
              </div>
            </div>

            <div class="aura-media-control-section is-open">
              <button type="button" class="aura-media-section-toggle"><span>Exportação</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m6 9 6 6 6-6"></path></svg></button>
              <div class="aura-media-section-body">
                <label class="aura-media-range"><span><b>Qualidade WebP</b><em data-media-output="quality">88%</em></span><input data-media-control="quality" type="range" min="45" max="100" value="88"></label>
                <p class="aura-media-help">A imagem será otimizada no navegador antes de ser colocada na Landing Page.</p>
              </div>
            </div>
          </aside>
        </div>

        <footer class="aura-max-panel-footer">
          <div><strong id="aura-media-size-label">1200 × 750</strong><span>Pré-visualização da saída</span></div>
          <div class="aura-max-footer-actions">
            <button type="button" class="aura-max-secondary-button" data-media-close>Cancelar</button>
            <button type="button" class="aura-max-primary-button" id="aura-media-apply">Aplicar imagem</button>
          </div>
        </footer>
      </section>
    `;
    document.body.appendChild(modal);
    state.modal = modal;
    state.canvas = document.getElementById("aura-media-canvas");
    state.context = state.canvas.getContext("2d", { alpha: false });

    $$('[data-media-close]', modal).forEach((button) => button.addEventListener("click", close));
    $$('.aura-media-section-toggle', modal).forEach((button) => button.addEventListener("click", () => button.closest('.aura-media-control-section')?.classList.toggle('is-open')));
    $$('[data-media-action]', modal).forEach((button) => button.addEventListener("click", () => runAction(button.dataset.mediaAction)));
    $$('[data-media-control]', modal).forEach((input) => input.addEventListener("input", () => updateControl(input)));
    $('#aura-media-file', modal)?.addEventListener('change', loadFile);
    $('#aura-media-apply', modal)?.addEventListener('click', apply);
  }

  function resetControls() {
    Object.assign(state, {
      rotation: 0,
      flipX: 1,
      flipY: 1,
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
      brightness: 100,
      contrast: 100,
      saturation: 100,
      grayscale: 0,
      blur: 0,
      quality: 88
    });
    const values = { zoom: 100, offsetX: 0, offsetY: 0, brightness: 100, contrast: 100, saturation: 100, grayscale: 0, blur: 0, quality: 88 };
    Object.entries(values).forEach(([key, value]) => {
      const input = state.modal?.querySelector(`[data-media-control="${key}"]`);
      if (input) input.value = value;
      updateOutput(key, value);
    });
  }

  function updateOutput(key, rawValue) {
    const output = state.modal?.querySelector(`[data-media-output="${key}"]`);
    if (!output) return;
    if (["zoom", "brightness", "contrast", "saturation", "grayscale", "quality"].includes(key)) output.textContent = `${rawValue}%`;
    else if (key === "blur") output.textContent = `${rawValue}px`;
    else output.textContent = rawValue;
  }

  function updateControl(input) {
    const key = input.dataset.mediaControl;
    const value = Number(input.value);
    if (key === "zoom") state.zoom = value / 100;
    else state[key] = value;
    updateOutput(key, value);
    render();
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });
  }

  async function open() {
    injectModal();
    const selected = getSelected();
    const target = detectTarget(selected.block);
    if (!selected.block || !target) {
      window.showToast?.("Selecione um bloco que tenha imagem.", "error");
      return;
    }
    const value = targetValue(selected.block, target);
    if (!value) {
      window.showToast?.("Este bloco ainda não possui imagem. Use Substituir imagem para escolher uma.", "error");
    }
    state.target = { block: selected.block, index: selected.index, target };
    resetControls();
    document.getElementById("aura-media-target-label").textContent = target.label;
    state.modal.classList.remove("hidden");
    try {
      if (value) state.image = await loadImage(value);
      else state.image = null;
      render();
    } catch (error) {
      console.error("[Aura Media] Erro ao abrir imagem", error);
      state.image = null;
      render();
    }
  }

  function close() {
    state.modal?.classList.add("hidden");
    state.image = null;
    state.target = null;
    const input = document.getElementById("aura-media-file");
    if (input) input.value = "";
  }

  async function loadFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      window.showToast?.("Escolha um arquivo de imagem válido.", "error");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      window.showToast?.("A imagem deve ter no máximo 12 MB.", "error");
      return;
    }
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    state.image = await loadImage(dataUrl);
    resetControls();
    render();
  }

  function runAction(action) {
    if (action === "rotate-left") state.rotation = (state.rotation - 90) % 360;
    if (action === "rotate-right") state.rotation = (state.rotation + 90) % 360;
    if (action === "flip-x") state.flipX *= -1;
    if (action === "flip-y") state.flipY *= -1;
    if (action === "reset") resetControls();
    render();
  }

  function drawPlaceholder(ctx, width, height) {
    ctx.fillStyle = "#0B1020";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(255,255,255,.12)";
    ctx.setLineDash([12, 12]);
    ctx.strokeRect(30, 30, width - 60, height - 60);
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255,255,255,.5)";
    ctx.font = "600 28px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Escolha uma imagem para começar", width / 2, height / 2);
  }

  function render() {
    if (!state.context || !state.canvas) return;
    const ctx = state.context;
    const width = state.canvas.width;
    const height = state.canvas.height;
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    if (!state.image) {
      drawPlaceholder(ctx, width, height);
      ctx.restore();
      return;
    }

    ctx.fillStyle = "#05070C";
    ctx.fillRect(0, 0, width, height);
    ctx.filter = `brightness(${state.brightness}%) contrast(${state.contrast}%) saturate(${state.saturation}%) grayscale(${state.grayscale}%) blur(${state.blur}px)`;
    ctx.translate(width / 2 + state.offsetX * 4, height / 2 + state.offsetY * 3);
    ctx.rotate(state.rotation * Math.PI / 180);
    ctx.scale(state.flipX, state.flipY);

    const rotated = Math.abs(state.rotation % 180) === 90;
    const sourceWidth = rotated ? state.image.height : state.image.width;
    const sourceHeight = rotated ? state.image.width : state.image.height;
    const cover = Math.max(width / sourceWidth, height / sourceHeight) * state.zoom;
    const drawWidth = state.image.width * cover;
    const drawHeight = state.image.height * cover;
    ctx.drawImage(state.image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    ctx.restore();
  }

  function canvasToOptimizedDataURL() {
    try {
      const webp = state.canvas.toDataURL("image/webp", state.quality / 100);
      if (webp.startsWith("data:image/webp")) return webp;
    } catch (_) {}
    return state.canvas.toDataURL("image/jpeg", state.quality / 100);
  }

  function apply() {
    if (!state.image || !state.target?.block) {
      window.showToast?.("Escolha uma imagem antes de aplicar.", "error");
      return;
    }
    render();
    const result = canvasToOptimizedDataURL();
    setTargetValue(state.target.block, state.target.target, result);
    window.renderizarEditorBlocos?.();
    document.dispatchEvent(new CustomEvent("aura:studio-change", { detail: { source: "media-studio" } }));
    document.dispatchEvent(new CustomEvent("aura:studio-history-capture", { detail: { label: "Imagem editada" } }));
    window.showToast?.("Imagem otimizada e aplicada.");
    close();
  }

  function injectInspectorButton() {
    const actions = document.querySelector("#aura-studio-inspector .aura-studio-inspector-actions");
    if (!actions) return;
    const selected = getSelected();
    const target = detectTarget(selected.block);
    let button = document.getElementById("aura-media-edit-button");
    if (!target) {
      button?.remove();
      return;
    }
    if (button) return;
    button = document.createElement("button");
    button.type = "button";
    button.id = "aura-media-edit-button";
    button.className = "aura-media-inspector-button";
    button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m4 20 5-1 10-10-4-4L5 15l-1 5Z"></path><path d="m13 7 4 4"></path></svg> Editar imagem`;
    button.addEventListener("click", open);
    actions.insertBefore(button, actions.lastElementChild);
  }

  function init() {
    if (state.initialized) return;
    const modal = document.getElementById("lp-editor-modal");
    if (!modal || !window.AuraStudioInspector) {
      setTimeout(init, 160);
      return;
    }
    state.initialized = true;
    injectModal();
    const inspector = document.getElementById("aura-studio-inspector");
    if (inspector) {
      state.observer = new MutationObserver(() => setTimeout(injectInspectorButton, 20));
      state.observer.observe(inspector, { childList: true, subtree: true });
    }
    document.addEventListener("aura:studio-selection", () => setTimeout(injectInspectorButton, 80));
    injectInspectorButton();
    window.AuraStudioMedia = { open, close, render };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
