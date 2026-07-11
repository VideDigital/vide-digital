(function () {
  "use strict";

  const state = {
    undo: [],
    redo: [],
    versions: [],
    maxUndo: 80,
    maxVersions: 30,
    lastHash: "",
    timer: null,
    initialized: false
  };

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const getBlocks = () => Array.isArray(window.lpEditorBlocos) ? window.lpEditorBlocos : [];
  const getModal = () => document.getElementById("lp-editor-modal");

  function pageKey() {
    const slug = document.getElementById("lped-slug")?.value?.trim() || "sem-slug";
    const title = document.getElementById("lped-titulo")?.value?.trim() || "landing-page";
    return `aura_v4_history_${slug}_${title}`.replace(/[^a-z0-9_-]/gi, "_").slice(0, 150);
  }

  function hash(value) {
    try {
      const text = JSON.stringify(value);
      let result = 2166136261;
      for (let i = 0; i < text.length; i += 1) {
        result ^= text.charCodeAt(i);
        result = Math.imul(result, 16777619);
      }
      return String(result >>> 0);
    } catch (_) {
      return String(Date.now());
    }
  }

  function snapshot(label, kind) {
    return {
      id: `hist_v4_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      label: label || "Alteração",
      kind: kind || "action",
      createdAt: Date.now(),
      blocks: clone(getBlocks()),
      title: document.getElementById("lped-titulo")?.value || "",
      slug: document.getElementById("lped-slug")?.value || "",
      device: window.AuraStudioDeviceHotfix?.getCurrentDevice?.() || window.AuraStudioPro?.state?.device || "desktop"
    };
  }

  function persistRecovery() {
    try {
      localStorage.setItem(`${pageKey()}_recovery`, JSON.stringify(snapshot("Recuperação automática", "recovery")));
      localStorage.setItem(`${pageKey()}_versions`, JSON.stringify(state.versions.slice(0, state.maxVersions)));
    } catch (error) {
      console.warn("[Aura History V4] Não foi possível salvar recuperação local", error);
    }
  }

  function notify(label) {
    window.renderizarEditorBlocos?.();
    window.AuraStudioInspector?.render?.();
    window.AuraStudioMax?.renderLayers?.();
    window.AuraStudioPro?.markDirty?.();
    document.dispatchEvent(new CustomEvent("aura:studio-change", { detail: { source: "history-v4", label } }));
  }

  function applySnapshot(data, label) {
    if (!data || !Array.isArray(data.blocks)) return false;
    const blocks = getBlocks();
    blocks.splice(0, blocks.length, ...clone(data.blocks));
    if (document.getElementById("lped-titulo") && typeof data.title === "string") {
      document.getElementById("lped-titulo").value = data.title;
    }
    if (document.getElementById("lped-slug") && typeof data.slug === "string") {
      document.getElementById("lped-slug").value = data.slug;
    }
    state.lastHash = hash(blocks);
    notify(label || data.label || "Histórico restaurado");
    return true;
  }

  function checkpoint(label, options) {
    const opts = options || {};
    const current = snapshot(label || "Checkpoint", opts.kind || "action");
    const currentHash = hash(current.blocks);
    if (!opts.force && currentHash === state.lastHash) return null;

    state.undo.push(current);
    if (state.undo.length > state.maxUndo) state.undo.shift();
    state.redo.length = 0;
    state.lastHash = currentHash;

    if (opts.version) {
      state.versions.unshift(current);
      state.versions = state.versions.slice(0, state.maxVersions);
    }

    persistRecovery();
    document.dispatchEvent(new CustomEvent("aura:history-v4", { detail: { action: "checkpoint", snapshot: current } }));
    return current;
  }

  function undo() {
    if (state.undo.length < 2) {
      window.showToast?.("Não há outra ação V4 para desfazer.", "error");
      return false;
    }
    const current = state.undo.pop();
    state.redo.push(current);
    const target = state.undo[state.undo.length - 1];
    const ok = applySnapshot(target, `Desfeito: ${current.label}`);
    if (ok) window.showToast?.(`Desfeito: ${current.label}`);
    return ok;
  }

  function redo() {
    const target = state.redo.pop();
    if (!target) {
      window.showToast?.("Não há ação V4 para refazer.", "error");
      return false;
    }
    state.undo.push(target);
    const ok = applySnapshot(target, `Refeito: ${target.label}`);
    if (ok) window.showToast?.(`Refeito: ${target.label}`);
    return ok;
  }

  function createVersion(label) {
    const version = checkpoint(label || "Versão manual", { force: true, version: true, kind: "manual" });
    if (version) window.showToast?.("Versão V4 criada.");
    return version;
  }

  function restoreVersion(id) {
    const version = state.versions.find((item) => item.id === id);
    if (!version) return false;
    checkpoint("Antes de restaurar versão", { force: true, version: true, kind: "automatic" });
    const ok = applySnapshot(version, `Versão restaurada: ${version.label}`);
    if (ok) window.showToast?.("Versão restaurada.");
    return ok;
  }

  function loadStored() {
    try {
      const versions = JSON.parse(localStorage.getItem(`${pageKey()}_versions`) || "[]");
      state.versions = Array.isArray(versions) ? versions.slice(0, state.maxVersions) : [];
    } catch (_) {
      state.versions = [];
    }
  }

  function recoveryAvailable() {
    try {
      const data = JSON.parse(localStorage.getItem(`${pageKey()}_recovery`) || "null");
      if (!data || !Array.isArray(data.blocks)) return null;
      const savedHash = hash(data.blocks);
      const currentHash = hash(getBlocks());
      return savedHash !== currentHash ? data : null;
    } catch (_) {
      return null;
    }
  }

  function restoreRecovery() {
    const recovery = recoveryAvailable();
    if (!recovery) return false;
    checkpoint("Antes de recuperar rascunho", { force: true, version: true });
    const ok = applySnapshot(recovery, "Rascunho local recuperado");
    if (ok) window.showToast?.("Rascunho local recuperado.");
    return ok;
  }

  function discardRecovery() {
    localStorage.removeItem(`${pageKey()}_recovery`);
  }

  function scheduleRecovery() {
    clearTimeout(state.timer);
    state.timer = setTimeout(() => {
      persistRecovery();
    }, 900);
  }

  function editorOpen() {
    const modal = getModal();
    return modal && !modal.classList.contains("hidden");
  }

  function bind() {
    document.addEventListener("aura:studio-change", (event) => {
      if (event.detail?.source === "history-v4") return;
      scheduleRecovery();
    });

    document.addEventListener("keydown", (event) => {
      if (!editorOpen()) return;
      const target = event.target;
      const typing = target instanceof HTMLElement && (target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(target.tagName));
      if (typing) return;

      if ((event.ctrlKey || event.metaKey) && event.altKey && String(event.key || "").toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && String(event.key || "").toLowerCase() === "v") {
        event.preventDefault();
        createVersion("Versão manual V4");
      }
    });
  }

  function watchModal() {
    const modal = getModal();
    if (!modal) {
      setTimeout(watchModal, 180);
      return;
    }

    const onOpen = () => {
      if (modal.classList.contains("hidden")) return;
      loadStored();
      state.undo = [];
      state.redo = [];
      state.lastHash = "";
      checkpoint("Abertura do editor", { force: true });
    };

    new MutationObserver(onOpen).observe(modal, { attributes: true, attributeFilter: ["class"] });
    onOpen();
  }

  function init() {
    if (state.initialized) return;
    state.initialized = true;
    bind();
    watchModal();
    window.AuraHistoryV4 = {
      checkpoint,
      undo,
      redo,
      createVersion,
      restoreVersion,
      restoreRecovery,
      discardRecovery,
      recoveryAvailable,
      applySnapshot,
      persistRecovery,
      state
    };
    console.info("[Vide Aura History V4] Inicializado");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
