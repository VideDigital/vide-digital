(function () {
  "use strict";

  const state = {
    selectedIndex: -1,
    root: null,
    listObserver: null,
    previewObserver: null,
    personalKey: "auraStudioPersonalBlocksV1"
  };

  const escapeHTML = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  function getBlocks() {
    return Array.isArray(window.lpEditorBlocos) ? window.lpEditorBlocos : [];
  }

  function getSelectedBlock() {
    const blocks = getBlocks();
    if (state.selectedIndex >= 0 && blocks[state.selectedIndex]) {
      return { block: blocks[state.selectedIndex], index: state.selectedIndex };
    }

    const index = blocks.findIndex((block) => block && block._colapsado === false);
    if (index >= 0) {
      state.selectedIndex = index;
      return { block: blocks[index], index };
    }

    return { block: null, index: -1 };
  }

  function ensureDesign(block) {
    if (!block.design) block.design = {};
    const d = block.design;
    if (d.corFundo === undefined) d.corFundo = "";
    if (d.corTexto === undefined) d.corTexto = "";
    if (d.corBotaoFundo === undefined) d.corBotaoFundo = "";
    if (d.corBotaoTexto === undefined) d.corBotaoTexto = "";
    if (d.corBotaoBorda === undefined) d.corBotaoBorda = "";
    if (d.paddingTop === undefined) d.paddingTop = 64;
    if (d.paddingBottom === undefined) d.paddingBottom = 64;
    if (d.alinhamento === undefined) d.alinhamento = "esquerda";
    if (d.visivelDesktop === undefined) d.visivelDesktop = true;
    if (d.visivelMobile === undefined) d.visivelMobile = true;
    if (d.idSecao === undefined) d.idSecao = "";
    if (d.priorizarImagem === undefined) d.priorizarImagem = false;
    if (d.raio === undefined) d.raio = 0;
    if (d.sombra === undefined) d.sombra = "none";
    if (d.animacao === undefined) d.animacao = "none";
    if (d.duracaoAnimacao === undefined) d.duracaoAnimacao = 600;
  }

  function notifyChange() {
    if (typeof window.renderizarEditorBlocos === "function") {
      window.renderizarEditorBlocos();
    }

    const list = document.getElementById("lped-blocos-lista");
    if (list) list.dispatchEvent(new Event("input", { bubbles: true }));
    document.dispatchEvent(new CustomEvent("aura:studio-change"));
  }

  function updateField(path, value) {
    const selected = getSelectedBlock();
    if (!selected.block) return;

    const [scope, key] = path.split(".");
    if (scope === "design") {
      ensureDesign(selected.block);
      selected.block.design[key] = value;
    } else if (scope === "props") {
      if (!selected.block.props) selected.block.props = {};
      selected.block.props[key] = value;
    } else {
      selected.block[key] = value;
    }

    notifyChange();
    setTimeout(render, 40);
  }

  function renderEmpty() {
    state.root.innerHTML = `
      <div class="aura-studio-inspector-empty">
        <span class="aura-studio-inspector-empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="m12 3 8 4-8 4-8-4 8-4Z"></path>
            <path d="m4 12 8 4 8-4"></path>
            <path d="m4 17 8 4 8-4"></path>
          </svg>
        </span>
        <strong>Nenhum bloco selecionado</strong>
        <p>Selecione um bloco na lateral ou no canvas para editar propriedades avançadas.</p>
      </div>
    `;
  }

  function blockLabel(block) {
    const labels = {
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
    return labels[block?.tipo] || block?.tipo || "Bloco";
  }

  function selectedTitle(block) {
    return block?.props?.titulo || block?.props?.logoTexto || block?.props?.textoCopyright || blockLabel(block);
  }

  function controlColor(label, path, value, fallback) {
    const normalized = value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
    return `
      <label class="aura-studio-field aura-studio-color-field">
        <span>${label}</span>
        <div>
          <input type="color" data-studio-path="${path}" value="${normalized}">
          <input type="text" data-studio-path="${path}" value="${escapeHTML(value || "")}" placeholder="Automático">
        </div>
      </label>
    `;
  }

  function controlRange(label, path, value, min, max, unit) {
    return `
      <label class="aura-studio-field aura-studio-range-field">
        <span><b>${label}</b><em data-range-value="${path}">${escapeHTML(value)}${unit}</em></span>
        <input type="range" min="${min}" max="${max}" value="${Number(value)}" data-studio-path="${path}" data-studio-number="true" data-studio-unit="${unit}">
      </label>
    `;
  }

  function render() {
    if (!state.root) return;
    const selected = getSelectedBlock();
    if (!selected.block) {
      renderEmpty();
      return;
    }

    const block = selected.block;
    const index = selected.index;
    ensureDesign(block);
    if (!block.props) block.props = {};
    const d = block.design;
    const p = block.props;
    const hasTitle = Object.prototype.hasOwnProperty.call(p, "titulo");
    const hasSubtitle = Object.prototype.hasOwnProperty.call(p, "subtitulo");
    const freeMode = block.x !== undefined;

    state.root.innerHTML = `
      <div class="aura-studio-inspector-header">
        <div>
          <small>Inspetor profissional</small>
          <h3>${escapeHTML(blockLabel(block))}</h3>
          <p>${escapeHTML(selectedTitle(block))}</p>
        </div>
        <span>${String(index + 1).padStart(2, "0")}</span>
      </div>

      <div class="aura-studio-inspector-actions">
        <button type="button" data-studio-action="duplicate" title="Duplicar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="8" y="8" width="11" height="11" rx="2"></rect><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"></path></svg>
          Duplicar
        </button>
        <button type="button" data-studio-action="save-personal" title="Salvar na biblioteca">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 4h12l2 2v14H5V4Z"></path><path d="M8 4v6h8V4"></path><path d="M9 20v-6h6v6"></path></svg>
          Salvar bloco
        </button>
        <button type="button" data-studio-action="delete" class="is-danger" title="Excluir">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="m7 7 1 14h8l1-14"></path></svg>
        </button>
      </div>

      <section class="aura-studio-inspector-section is-open">
        <button type="button" class="aura-studio-section-toggle">
          <span>Conteúdo principal</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m6 9 6 6 6-6"></path></svg>
        </button>
        <div class="aura-studio-section-body">
          ${hasTitle ? `
            <label class="aura-studio-field">
              <span>Título</span>
              <input type="text" data-studio-path="props.titulo" value="${escapeHTML(p.titulo || "")}">
            </label>` : ""}
          ${hasSubtitle ? `
            <label class="aura-studio-field">
              <span>Descrição</span>
              <textarea rows="4" data-studio-path="props.subtitulo">${escapeHTML(p.subtitulo || "")}</textarea>
            </label>` : ""}
          <label class="aura-studio-field">
            <span>ID da seção</span>
            <input type="text" data-studio-path="design.idSecao" value="${escapeHTML(d.idSecao || "")}" placeholder="ex: beneficios">
          </label>
        </div>
      </section>

      <section class="aura-studio-inspector-section is-open">
        <button type="button" class="aura-studio-section-toggle">
          <span>Aparência</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m6 9 6 6 6-6"></path></svg>
        </button>
        <div class="aura-studio-section-body">
          <div class="aura-studio-field-grid">
            ${controlColor("Fundo", "design.corFundo", d.corFundo, "#111827")}
            ${controlColor("Texto", "design.corTexto", d.corTexto, "#FFFFFF")}
            ${controlColor("Botão", "design.corBotaoFundo", d.corBotaoFundo, "#5B3DF5")}
            ${controlColor("Texto do botão", "design.corBotaoTexto", d.corBotaoTexto, "#FFFFFF")}
          </div>
          <label class="aura-studio-field">
            <span>Alinhamento</span>
            <div class="aura-studio-segmented" data-studio-segment="design.alinhamento">
              <button type="button" data-value="esquerda" class="${d.alinhamento === "esquerda" ? "is-active" : ""}">Esquerda</button>
              <button type="button" data-value="centro" class="${d.alinhamento === "centro" ? "is-active" : ""}">Centro</button>
              <button type="button" data-value="direita" class="${d.alinhamento === "direita" ? "is-active" : ""}">Direita</button>
            </div>
          </label>
          ${controlRange("Espaço superior", "design.paddingTop", d.paddingTop, 0, 180, "px")}
          ${controlRange("Espaço inferior", "design.paddingBottom", d.paddingBottom, 0, 180, "px")}
          ${controlRange("Arredondamento", "design.raio", d.raio, 0, 48, "px")}
          <div class="aura-studio-field-grid">
            <label class="aura-studio-field">
              <span>Sombra</span>
              <select data-studio-path="design.sombra">
                <option value="none" ${d.sombra === "none" ? "selected" : ""}>Sem sombra</option>
                <option value="soft" ${d.sombra === "soft" ? "selected" : ""}>Suave</option>
                <option value="medium" ${d.sombra === "medium" ? "selected" : ""}>Média</option>
                <option value="strong" ${d.sombra === "strong" ? "selected" : ""}>Forte</option>
                <option value="glow" ${d.sombra === "glow" ? "selected" : ""}>Glow</option>
              </select>
            </label>
            <label class="aura-studio-field">
              <span>Animação</span>
              <select data-studio-path="design.animacao">
                <option value="none" ${d.animacao === "none" ? "selected" : ""}>Sem animação</option>
                <option value="fade-up" ${d.animacao === "fade-up" ? "selected" : ""}>Fade para cima</option>
                <option value="fade-in" ${d.animacao === "fade-in" ? "selected" : ""}>Aparecer</option>
                <option value="slide-left" ${d.animacao === "slide-left" ? "selected" : ""}>Da esquerda</option>
                <option value="slide-right" ${d.animacao === "slide-right" ? "selected" : ""}>Da direita</option>
                <option value="zoom-in" ${d.animacao === "zoom-in" ? "selected" : ""}>Zoom suave</option>
              </select>
            </label>
          </div>
          ${controlRange("Duração", "design.duracaoAnimacao", d.duracaoAnimacao, 150, 2000, "ms")}
        </div>
      </section>

      <section class="aura-studio-inspector-section ${freeMode ? "is-open" : ""}">
        <button type="button" class="aura-studio-section-toggle">
          <span>Posição e tamanho</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m6 9 6 6 6-6"></path></svg>
        </button>
        <div class="aura-studio-section-body">
          ${freeMode ? `
            <div class="aura-studio-field-grid is-four">
              <label class="aura-studio-field"><span>X</span><input type="number" data-studio-path="x" data-studio-number="true" value="${Number(block.x || 0)}"></label>
              <label class="aura-studio-field"><span>Y</span><input type="number" data-studio-path="y" data-studio-number="true" value="${Number(block.y || 0)}"></label>
              <label class="aura-studio-field"><span>Largura</span><input type="number" min="80" data-studio-path="largura" data-studio-number="true" value="${Number(block.largura || 600)}"></label>
              <label class="aura-studio-field"><span>Altura</span><input type="number" min="60" data-studio-path="altura" data-studio-number="true" value="${Number(block.altura || 220)}"></label>
            </div>
            <label class="aura-studio-field"><span>Camada</span><input type="number" min="1" data-studio-path="zIndex" data-studio-number="true" value="${Number(block.zIndex || 1)}"></label>
          ` : `<p class="aura-studio-inspector-note">Ative o modo Livre para controlar posição, tamanho e profundidade deste bloco.</p>`}
        </div>
      </section>

      <section class="aura-studio-inspector-section is-open">
        <button type="button" class="aura-studio-section-toggle">
          <span>Responsividade</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m6 9 6 6 6-6"></path></svg>
        </button>
        <div class="aura-studio-section-body">
          <label class="aura-studio-switch-row">
            <span><b>Exibir no desktop</b><small>Visível em telas maiores</small></span>
            <input type="checkbox" data-studio-path="design.visivelDesktop" ${d.visivelDesktop !== false ? "checked" : ""}>
            <i></i>
          </label>
          <label class="aura-studio-switch-row">
            <span><b>Exibir no celular</b><small>Visível no layout móvel</small></span>
            <input type="checkbox" data-studio-path="design.visivelMobile" ${d.visivelMobile !== false ? "checked" : ""}>
            <i></i>
          </label>
          <label class="aura-studio-switch-row">
            <span><b>Priorizar imagem</b><small>Imagem ganha destaque no mobile</small></span>
            <input type="checkbox" data-studio-path="design.priorizarImagem" ${d.priorizarImagem ? "checked" : ""}>
            <i></i>
          </label>
        </div>
      </section>

      <section class="aura-studio-inspector-section is-open">
        <button type="button" class="aura-studio-section-toggle">
          <span>Qualidade do bloco</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m6 9 6 6 6-6"></path></svg>
        </button>
        <div class="aura-studio-section-body">
          ${renderQuality(block)}
        </div>
      </section>
    `;

    bindControls();
  }

  function renderQuality(block) {
    const issues = [];
    const p = block.props || {};
    const d = block.design || {};

    if (Object.prototype.hasOwnProperty.call(p, "titulo") && !String(p.titulo || "").trim()) {
      issues.push("Adicione um título para facilitar a leitura.");
    }
    if (p.botaoTexto && (!p.botaoLink || p.botaoLink === "#")) {
      issues.push("Defina o destino do botão.");
    }
    if (block.tipo === "texto_midia" && !p.imagemB64) {
      issues.push("Adicione uma imagem ou use uma composição sem mídia.");
    }
    if ((d.paddingTop || 0) < 20 || (d.paddingBottom || 0) < 20) {
      issues.push("O espaçamento pode ficar apertado em telas pequenas.");
    }
    if (d.corFundo && d.corTexto && d.corFundo.toLowerCase() === d.corTexto.toLowerCase()) {
      issues.push("Fundo e texto usam a mesma cor.");
    }

    if (!issues.length) {
      return `<div class="aura-studio-quality is-good"><span>✓</span><div><strong>Bloco bem configurado</strong><p>Nenhum problema básico foi identificado.</p></div></div>`;
    }

    return issues.map((issue) => `<div class="aura-studio-quality is-warning"><span>!</span><div><strong>Atenção</strong><p>${escapeHTML(issue)}</p></div></div>`).join("");
  }

  function bindControls() {
    if (!state.root) return;

    state.root.querySelectorAll("[data-studio-path]").forEach((input) => {
      const handler = () => {
        const path = input.dataset.studioPath;
        let value;
        if (input.type === "checkbox") value = input.checked;
        else if (input.dataset.studioNumber === "true" || input.type === "range" || input.type === "number") value = Number(input.value);
        else value = input.value;

        const linked = state.root.querySelectorAll(`[data-studio-path="${CSS.escape(path)}"]`);
        linked.forEach((other) => {
          if (other === input || other.type === "color" && !/^#[0-9a-f]{6}$/i.test(String(value))) return;
          if (other.type === "checkbox") other.checked = Boolean(value);
          else other.value = value;
        });

        const rangeValue = state.root.querySelector(`[data-range-value="${CSS.escape(path)}"]`);
        if (rangeValue) rangeValue.textContent = `${value}${input.dataset.studioUnit || ""}`;
        updateField(path, value);
      };

      input.addEventListener(input.type === "range" || input.type === "color" ? "input" : "change", handler);
      if (["text", "textarea", "number"].includes(input.type) || input.tagName === "TEXTAREA") {
        input.addEventListener("input", handler);
      }
    });

    state.root.querySelectorAll("[data-studio-segment]").forEach((group) => {
      group.querySelectorAll("button[data-value]").forEach((button) => {
        button.addEventListener("click", () => {
          group.querySelectorAll("button").forEach((item) => item.classList.remove("is-active"));
          button.classList.add("is-active");
          updateField(group.dataset.studioSegment, button.dataset.value);
        });
      });
    });

    state.root.querySelectorAll(".aura-studio-section-toggle").forEach((button) => {
      button.addEventListener("click", () => button.closest(".aura-studio-inspector-section")?.classList.toggle("is-open"));
    });

    state.root.querySelectorAll("[data-studio-action]").forEach((button) => {
      button.addEventListener("click", () => runAction(button.dataset.studioAction));
    });
  }

  function runAction(action) {
    const selected = getSelectedBlock();
    if (!selected.block) return;
    const blocks = getBlocks();

    if (action === "duplicate") {
      const clone = JSON.parse(JSON.stringify(selected.block));
      clone.id = `lpb_${Date.now()}_${blocks.length}`;
      clone._colapsado = false;
      if (clone.x !== undefined) {
        clone.x = Number(clone.x || 0) + 24;
        clone.y = Number(clone.y || 0) + 24;
        clone.zIndex = Math.max(0, ...blocks.map((block) => Number(block.zIndex || 0))) + 1;
      }
      blocks.forEach((block) => { block._colapsado = true; });
      blocks.splice(selected.index + 1, 0, clone);
      state.selectedIndex = selected.index + 1;
      notifyChange();
      window.showToast?.("Bloco duplicado.");
      return;
    }

    if (action === "delete") {
      if (typeof window.removerBlocoEditor === "function") {
        window.removerBlocoEditor(selected.index);
        state.selectedIndex = -1;
        setTimeout(render, 50);
      }
      return;
    }

    if (action === "save-personal") {
      savePersonalBlock(selected.block);
    }
  }

  function savePersonalBlock(block) {
    const current = readPersonalBlocks();
    const name = window.prompt("Nome para este bloco:", selectedTitle(block));
    if (!name) return;
    const saved = {
      id: `personal-${Date.now()}`,
      nome: name.trim(),
      categoria: "Meus blocos",
      objetivo: "Reutilizar",
      tags: ["pessoal", blockLabel(block).toLowerCase()],
      accent: block.design?.corBotaoFundo || block.design?.corFundo || "#7C3AED",
      tipo: "pessoal",
      blocos: [JSON.parse(JSON.stringify(block))],
      criadoEm: Date.now()
    };
    saved.blocos[0]._colapsado = true;
    current.unshift(saved);
    localStorage.setItem(state.personalKey, JSON.stringify(current.slice(0, 80)));
    document.dispatchEvent(new CustomEvent("aura:personal-library-updated"));
    window.showToast?.("Bloco salvo em Meus blocos.");
  }

  function readPersonalBlocks() {
    try {
      const parsed = JSON.parse(localStorage.getItem(state.personalKey) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function select(index) {
    const blocks = getBlocks();
    if (!blocks[index]) return;
    state.selectedIndex = index;
    blocks.forEach((block, blockIndex) => { block._colapsado = blockIndex !== index; });
    if (typeof window.renderizarEditorBlocos === "function") window.renderizarEditorBlocos();
    setTimeout(render, 50);
  }

  function parseSelectionFromClick(event) {
    const trigger = event.target.closest("[onclick*='alternarColapsoBloco']");
    if (!trigger) return;
    const onclick = trigger.getAttribute("onclick") || "";
    const match = onclick.match(/alternarColapsoBloco\((\d+)\)/);
    if (!match) return;
    state.selectedIndex = Number(match[1]);
    setTimeout(render, 80);
  }

  function init() {
    const modal = document.getElementById("lp-editor-modal");
    if (!modal || state.root) return false;
    const workspace = modal.querySelector(":scope > .flex-1.flex.overflow-hidden.relative");
    if (!workspace) return false;

    state.root = document.createElement("aside");
    state.root.id = "aura-studio-inspector";
    state.root.className = "aura-studio-inspector";
    state.root.setAttribute("aria-label", "Inspetor de propriedades");
    workspace.appendChild(state.root);

    const list = document.getElementById("lped-blocos-lista");
    list?.addEventListener("click", parseSelectionFromClick);

    if (list) {
      state.listObserver = new MutationObserver(() => setTimeout(render, 30));
      state.listObserver.observe(list, { childList: true, subtree: true });
    }

    document.addEventListener("aura:studio-selection", (event) => {
      const index = Number(event.detail?.index);
      if (Number.isInteger(index)) select(index);
    });

    render();
    return true;
  }

  window.AuraStudioInspector = {
    init,
    render,
    select,
    getSelected: getSelectedBlock,
    readPersonalBlocks,
    savePersonalBlock
  };
})();
