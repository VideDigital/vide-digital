(function () {
  "use strict";

  const DEVICES = ["desktop", "tablet", "mobile"];
  const state = {
    current: "desktop",
    wrapped: false,
    initialized: false,
    properties: [
      "x", "y", "largura", "altura", "zIndex"
    ],
    designProperties: [
      "paddingTop", "paddingBottom", "alinhamento", "raio", "sombra",
      "visivelDesktop", "visivelMobile", "priorizarImagem"
    ]
  };

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const blocks = () => Array.isArray(window.lpEditorBlocos) ? window.lpEditorBlocos : [];

  function currentDevice() {
    return window.AuraStudioDeviceHotfix?.getCurrentDevice?.()
      || window.AuraStudioPro?.state?.device
      || state.current
      || "desktop";
  }

  function ensureStore(block) {
    block.design = block.design || {};
    block.design.responsiveV4 = block.design.responsiveV4 || {};
    block.design.v4 = block.design.v4 || {};
    if (!block.design.responsiveV4.desktop) {
      block.design.responsiveV4.desktop = captureBlock(block);
    }
    return block.design.responsiveV4;
  }

  function captureBlock(block) {
    const geometry = {};
    state.properties.forEach((key) => {
      if (block[key] !== undefined && block[key] !== null) geometry[key] = block[key];
    });

    const design = {};
    state.designProperties.forEach((key) => {
      if (block.design?.[key] !== undefined) design[key] = block.design[key];
    });

    return {
      geometry,
      design,
      v4: clone(block.design?.v4 || {}),
      props: {
        posicaoImagem: block.props?.posicaoImagem,
        imagemLargura: block.props?.imagemLargura
      }
    };
  }

  function saveDevice(device) {
    const normalized = DEVICES.includes(device) ? device : "desktop";
    blocks().forEach((block) => {
      const store = ensureStore(block);
      store[normalized] = captureBlock(block);
    });
    return normalized;
  }

  function inheritedState(block, device) {
    const store = ensureStore(block);
    if (store[device]) return clone(store[device]);
    if (device === "mobile" && store.tablet) return clone(store.tablet);
    return clone(store.desktop || captureBlock(block));
  }

  function applyBlockState(block, data) {
    if (!data) return;
    Object.entries(data.geometry || {}).forEach(([key, value]) => {
      block[key] = value;
    });
    Object.entries(data.design || {}).forEach(([key, value]) => {
      block.design[key] = value;
    });
    block.design.v4 = { ...(block.design.v4 || {}), ...(data.v4 || {}) };
    block.props = block.props || {};
    if (data.props?.posicaoImagem !== undefined) block.props.posicaoImagem = data.props.posicaoImagem;
    if (data.props?.imagemLargura !== undefined) block.props.imagemLargura = data.props.imagemLargura;
  }

  function applyDevice(device, options) {
    const opts = options || {};
    const normalized = DEVICES.includes(device) ? device : "desktop";
    blocks().forEach((block) => applyBlockState(block, inheritedState(block, normalized)));
    state.current = normalized;
    if (!opts.skipRender) {
      window.renderizarEditorBlocos?.();
      window.AuraStudioInspector?.render?.();
      document.dispatchEvent(new CustomEvent("aura:responsive-v4", { detail: { device: normalized } }));
    }
    return normalized;
  }

  function switchDevice(device) {
    const previous = state.current || currentDevice();
    saveDevice(previous);
    applyDevice(device);
    return device;
  }

  function copyDevice(from, to, selectedOnly) {
    const selection = window.AuraCanvasV4?.getSelectedBlocks?.() || [];
    const targets = selectedOnly && selection.length ? selection.map((entry) => entry.block) : blocks();
    targets.forEach((block) => {
      const store = ensureStore(block);
      const source = store[from] || inheritedState(block, from);
      store[to] = clone(source);
    });
    if (to === state.current) applyDevice(to);
    window.AuraHistoryV4?.checkpoint?.(`Responsividade: ${from} para ${to}`, { force: true });
    window.showToast?.(`Configurações copiadas de ${from} para ${to}.`);
  }

  function resetDevice(device, selectedOnly) {
    const selection = window.AuraCanvasV4?.getSelectedBlocks?.() || [];
    const targets = selectedOnly && selection.length ? selection.map((entry) => entry.block) : blocks();
    targets.forEach((block) => {
      const store = ensureStore(block);
      if (device === "desktop") store.desktop = captureBlock(block);
      else delete store[device];
    });
    if (device === state.current) applyDevice(device);
    window.AuraHistoryV4?.checkpoint?.(`Responsividade restaurada: ${device}`, { force: true });
  }

  function setProperty(indexes, path, value, device) {
    const targetDevice = device || state.current || currentDevice();
    const indexList = Array.isArray(indexes) ? indexes : [indexes];
    indexList.forEach((index) => {
      const block = blocks()[index];
      if (!block) return;
      const store = ensureStore(block);
      const data = clone(store[targetDevice] || inheritedState(block, targetDevice));
      const parts = String(path).split(".");
      let cursor = data;
      parts.forEach((part, partIndex) => {
        if (partIndex === parts.length - 1) cursor[part] = value;
        else cursor = cursor[part] = cursor[part] || {};
      });
      store[targetDevice] = data;
      if (targetDevice === state.current) applyBlockState(block, data);
    });
    window.renderizarEditorBlocos?.();
    document.dispatchEvent(new CustomEvent("aura:studio-change", { detail: { source: "responsive-v4", path, device: targetDevice } }));
  }

  function getBlockDeviceState(index, device) {
    const block = blocks()[index];
    if (!block) return null;
    return inheritedState(block, device || state.current);
  }

  function wrapDeviceSwitcher() {
    const api = window.AuraStudioDeviceHotfix;
    if (!api || state.wrapped || typeof api.setDevice !== "function") return false;
    const original = api.setDevice.bind(api);
    api.setDevice = function (device) {
      const previous = state.current || currentDevice();
      saveDevice(previous);
      const result = original(device);
      setTimeout(() => applyDevice(device), 30);
      return result;
    };
    state.wrapped = true;
    state.current = currentDevice();
    return true;
  }

  function watch() {
    if (!wrapDeviceSwitcher()) setTimeout(watch, 160);
  }

  function init() {
    if (state.initialized) return;
    state.initialized = true;
    state.current = currentDevice();
    watch();
    document.addEventListener("aura:studio-change", (event) => {
      if (event.detail?.source === "responsive-v4") return;
      clearTimeout(state.saveTimer);
      state.saveTimer = setTimeout(() => saveDevice(state.current), 300);
    });
    window.AuraResponsiveV4 = {
      devices: DEVICES,
      state,
      currentDevice: () => state.current,
      captureBlock,
      saveDevice,
      applyDevice,
      switchDevice,
      copyDevice,
      resetDevice,
      setProperty,
      getBlockDeviceState,
      ensureStore
    };
    console.info("[Vide Aura Responsive V4] Inicializado");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
