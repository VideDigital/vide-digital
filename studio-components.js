(function () {
  "use strict";

  const KEY = "aura_studio_components_v4";
  const state = {
    components: [],
    initialized: false
  };

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const blocks = () => Array.isArray(window.lpEditorBlocos) ? window.lpEditorBlocos : [];
  const uid = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY) || "[]");
      state.components = Array.isArray(data) ? data : [];
    } catch (_) {
      state.components = [];
    }
    return state.components;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state.components.slice(0, 120)));
    } catch (error) {
      console.warn("[Aura Components V4] Falha ao salvar componentes", error);
    }
    document.dispatchEvent(new CustomEvent("aura:components-v4", { detail: { total: state.components.length } }));
  }

  function selectedEntries() {
    return window.AuraCanvasV4?.getSelectedBlocks?.() || [];
  }

  function cleanDefinition(block, componentId, slot) {
    const item = clone(block);
    delete item.id;
    delete item.paginaId;
    delete item._colapsado;
    item.design = item.design || {};
    item.design.v4Component = {
      componentId,
      role: "definition",
      slot
    };
    return item;
  }

  function createFromSelection(name) {
    const entries = selectedEntries();
    if (!entries.length) {
      window.showToast?.("Selecione ao menos um bloco.", "error");
      return null;
    }

    const title = String(name || window.prompt("Nome do componente:", "Componente da marca") || "").trim();
    if (!title) return null;

    window.AuraHistoryV4?.checkpoint?.("Antes de criar componente", { force: true });
    const componentId = uid("cmp_v4");
    const definition = entries.map((entry, slot) => cleanDefinition(entry.block, componentId, slot));
    const component = {
      id: componentId,
      name: title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      type: definition.length > 1 ? "group" : "single",
      blocks: definition,
      accent: entries[0]?.block?.design?.corBotaoFundo || entries[0]?.block?.design?.corFundo || "#7C3AED"
    };

    state.components.unshift(component);
    state.components = state.components.slice(0, 120);

    entries.forEach((entry, slot) => {
      entry.block.design = entry.block.design || {};
      entry.block.design.v4Component = {
        componentId,
        role: "master",
        slot
      };
    });

    save();
    window.renderizarEditorBlocos?.();
    window.AuraStudioPro?.markDirty?.();
    window.showToast?.("Componente V4 criado.");
    return component;
  }

  function selectedPageId() {
    const entries = selectedEntries();
    if (entries.length) return entries[0].block.paginaId;
    return blocks().find((block) => block.paginaId)?.paginaId || null;
  }

  function insert(id) {
    const component = state.components.find((item) => item.id === id);
    if (!component) return false;
    window.AuraHistoryV4?.checkpoint?.(`Antes de inserir ${component.name}`, { force: true });

    const pageId = selectedPageId();
    const all = blocks();
    const maxY = Math.max(0, ...all.map((item) => Number(item.y || 0) + Number(item.altura || 220)));
    const maxZ = Math.max(0, ...all.map((item) => Number(item.zIndex || 0)));

    const inserted = component.blocks.map((definition, slot) => {
      const item = clone(definition);
      item.id = uid("lpb_cmp");
      item.paginaId = pageId;
      item._aba = "conteudo";
      item._colapsado = true;
      item.design = item.design || {};
      item.design.v4Component = {
        componentId: component.id,
        role: "instance",
        slot,
        instanceId: uid("inst")
      };
      if (all.some((block) => block.x !== undefined)) {
        item.x = Number(item.x || 20) + slot * 22;
        item.y = maxY + 30 + slot * 22;
        item.largura = Number(item.largura || 600);
        item.altura = Number(item.altura || 220);
        item.zIndex = maxZ + slot + 1;
      }
      return item;
    });

    all.push(...inserted);
    window.renderizarEditorBlocos?.();
    window.AuraStudioPro?.markDirty?.();
    document.dispatchEvent(new CustomEvent("aura:studio-change", { detail: { source: "components-v4", action: "insert", id } }));
    window.showToast?.("Instância do componente inserida.");
    return true;
  }

  function updateFromMaster(componentId) {
    const component = state.components.find((item) => item.id === componentId);
    if (!component) return false;
    const masters = blocks()
      .map((block, index) => ({ block, index }))
      .filter((entry) => entry.block.design?.v4Component?.componentId === componentId && entry.block.design?.v4Component?.role === "master")
      .sort((a, b) => Number(a.block.design.v4Component.slot || 0) - Number(b.block.design.v4Component.slot || 0));

    if (!masters.length) {
      window.showToast?.("O componente mestre não está nesta página.", "error");
      return false;
    }

    window.AuraHistoryV4?.checkpoint?.(`Antes de atualizar ${component.name}`, { force: true });
    component.blocks = masters.map((entry, slot) => cleanDefinition(entry.block, componentId, slot));
    component.updatedAt = Date.now();
    save();
    syncInstances(componentId);
    window.showToast?.("Componente e instâncias atualizados.");
    return true;
  }

  function syncInstances(componentId) {
    const component = state.components.find((item) => item.id === componentId);
    if (!component) return false;
    const all = blocks();
    let count = 0;

    all.forEach((instance) => {
      const metadata = instance.design?.v4Component;
      if (!metadata || metadata.componentId !== componentId || metadata.role !== "instance") return;
      const definition = component.blocks[Number(metadata.slot || 0)];
      if (!definition) return;

      const preserved = {
        id: instance.id,
        paginaId: instance.paginaId,
        x: instance.x,
        y: instance.y,
        largura: instance.largura,
        altura: instance.altura,
        zIndex: instance.zIndex,
        responsiveV4: clone(instance.design?.responsiveV4 || {}),
        instanceId: metadata.instanceId
      };

      const next = clone(definition);
      Object.keys(instance).forEach((key) => delete instance[key]);
      Object.assign(instance, next, {
        id: preserved.id,
        paginaId: preserved.paginaId,
        x: preserved.x,
        y: preserved.y,
        largura: preserved.largura,
        altura: preserved.altura,
        zIndex: preserved.zIndex,
        _colapsado: true
      });
      instance.design = instance.design || {};
      instance.design.responsiveV4 = preserved.responsiveV4;
      instance.design.v4Component = {
        componentId,
        role: "instance",
        slot: Number(metadata.slot || 0),
        instanceId: preserved.instanceId
      };
      count += 1;
    });

    if (count) {
      window.renderizarEditorBlocos?.();
      window.AuraStudioPro?.markDirty?.();
      document.dispatchEvent(new CustomEvent("aura:studio-change", { detail: { source: "components-v4", action: "sync", componentId, count } }));
    }
    return count;
  }

  function detachSelected() {
    const entries = selectedEntries();
    if (!entries.length) return 0;
    window.AuraHistoryV4?.checkpoint?.("Antes de desvincular componente", { force: true });
    let count = 0;
    entries.forEach((entry) => {
      if (entry.block.design?.v4Component) {
        delete entry.block.design.v4Component;
        count += 1;
      }
    });
    if (count) {
      window.renderizarEditorBlocos?.();
      window.AuraStudioPro?.markDirty?.();
      window.showToast?.(`${count} bloco(s) desvinculado(s).`);
    }
    return count;
  }

  function remove(id) {
    const index = state.components.findIndex((item) => item.id === id);
    if (index < 0) return false;
    state.components.splice(index, 1);
    save();
    return true;
  }

  function rename(id, name) {
    const component = state.components.find((item) => item.id === id);
    if (!component) return false;
    const value = String(name || "").trim();
    if (!value) return false;
    component.name = value;
    component.updatedAt = Date.now();
    save();
    return true;
  }

  function init() {
    if (state.initialized) return;
    state.initialized = true;
    load();
    window.AuraComponentsV4 = {
      state,
      list: () => state.components,
      load,
      save,
      createFromSelection,
      insert,
      updateFromMaster,
      syncInstances,
      detachSelected,
      remove,
      rename
    };
    console.info("[Vide Aura Components V4] Inicializado", { total: state.components.length });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
