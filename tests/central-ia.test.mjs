import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  CONFIG_IA_PADRAO,
  configuracaoIaTemAlteracoes,
  criarCentralIAController,
  criarPayloadConfiguracaoIA,
  normalizarConfiguracaoIA,
  validarConfiguracaoIA
} from "../central-ia.js";

const rootDir = path.resolve(import.meta.dirname, "..");
const dashboardHtml = fs.readFileSync(path.join(rootDir, "dashboard.html"), "utf8");
const dashboardApp = fs.readFileSync(path.join(rootDir, "dashboard-app.js"), "utf8");
const centralIaSource = fs.readFileSync(path.join(rootDir, "central-ia.js"), "utf8");
const centralIaCss = fs.readFileSync(path.join(rootDir, "central-ia.css"), "utf8");
const sidebarNavigation = fs.readFileSync(path.join(rootDir, "sidebar-navigation.js"), "utf8");
const firestoreRules = fs.readFileSync(path.join(rootDir, "firestore.rules"), "utf8");
const firebaseInit = fs.readFileSync(path.join(rootDir, "firebase-init.js"), "utf8");
const firebaseDeployWorkflow = fs.readFileSync(path.join(rootDir, ".github", "workflows", "firebase-deploy.yml"), "utf8");

function criarElementoFake(overrides = {}) {
  const classes = new Set();
  const attributes = new Map();
  const listeners = new Map();
  return {
    value: "",
    checked: false,
    disabled: false,
    hidden: false,
    textContent: "",
    dataset: {},
    classList: {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name),
      toggle(name, force) {
        const enabled = force === undefined ? !classes.has(name) : Boolean(force);
        if (enabled) classes.add(name);
        else classes.delete(name);
        return enabled;
      }
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
    ...overrides
  };
}

function criarDomFakeCentralIA() {
  const ids = [
    "central-ia-form", "ia-ativo", "ia-nome-assistente", "ia-mensagem-apresentacao",
    "ia-idioma", "ia-personalidade", "ia-tamanho-resposta", "ia-instrucoes",
    "ia-canal-lojaPublica", "ia-canal-sugestoesFuncionarios",
    "ia-canal-respostasAutomaticas", "ia-canal-criacaoConteudo", "ia-canal-whatsapp",
    "ia-modo-resposta", "ia-mensagem-fallback", "ia-resumo-nome",
    "ia-resumo-personalidade", "ia-resumo-idioma", "ia-resumo-resposta",
    "ia-resumo-status", "ia-resumo-canais", "ia-status-badge",
    "ia-contador-apresentacao", "ia-contador-instrucoes", "ia-contador-fallback",
    "ia-modo-resposta-dependencia", "ia-unsaved-status", "ia-salvar", "ia-loading",
    "ia-content", "ia-fieldset", "ia-readonly-notice", "ia-load-error",
    "ia-load-error-message", "ia-tentar-novamente"
  ];
  const elements = Object.fromEntries(ids.map(id => [id, criarElementoFake()]));
  const checkboxIds = [
    "ia-ativo", "ia-canal-lojaPublica", "ia-canal-sugestoesFuncionarios",
    "ia-canal-respostasAutomaticas", "ia-canal-criacaoConteudo", "ia-canal-whatsapp"
  ];
  const root = {
    getElementById: id => elements[id] || null,
    querySelector: () => null,
    querySelectorAll(selector) {
      if (selector === "#central-ia-form input[type=checkbox]") {
        return checkboxIds.map(id => elements[id]);
      }
      return [];
    }
  };
  return { root, elements };
}

test("Central de IA existe na view, menu reutilizado no mobile e Central de módulos", () => {
  assert.match(dashboardHtml, /<section id="view-central-ia"/);
  assert.match(dashboardHtml, /<button data-target="view-central-ia"/);
  assert.match(sidebarNavigation, /"view-central-ia"/);
  assert.match(dashboardApp, /Auto-fechar menu no mobile/);
  assert.match(dashboardHtml, /data-target="view-central-ia" data-module-permission="central-ia"/);
  assert.match(dashboardHtml, /19 módulos/);
});

test("busca do hub encontra todos os termos pedidos para a Central de IA", () => {
  const card = dashboardHtml.match(/<div class="aura-hub-card hidden" data-target="view-central-ia"[^>]+>/)?.[0] || "";
  for (const term of ["central de ia", "inteligência artificial", "inteligencia artificial", "assistente", "automação", "chatbot", "atendimento"]) {
    assert.ok(card.includes(term), `termo ausente: ${term}`);
  }
  assert.match(card, /role="button"/);
  assert.match(card, /tabindex="0"/);
  assert.match(card, /event\.key === 'Enter'/);
});

test("buscas do hub e da lateral preservam módulos ocultos por permissão", () => {
  assert.match(dashboardApp, /const modulo = normalizeModuleKey\([\s\S]*?data-module-permission/);
  assert.match(dashboardApp, /function podeVerModuloNoContexto[\s\S]*?!contexto\.initialized \|\| !contexto\.active[\s\S]*?VideHubContext\.canView\(modulo\)/);
  assert.match(dashboardApp, /!podeVer \|\| !correspondeBusca/);
  assert.match(sidebarNavigation, /!botao\.classList\.contains\("hidden"\)/);
  assert.match(sidebarNavigation, /window\.atualizarBuscaSidebarModulos = aplicarBusca/);
  assert.match(dashboardApp, /const termoBuscaHub = buscaHub\?\.value \?\? buscaHub\?\.textContent \?\? ""/);
  assert.match(dashboardApp, /window\.filtrarHubModulos\?\.\(termoBuscaHub\)/);
  assert.match(dashboardApp, /function atualizarElementosComPermissao[\s\S]*?window\.atualizarBuscaSidebarModulos\?\.\(\)/);
});

test("aliases da permissão são reconhecidos pelo frontend, Functions e Rules", () => {
  assert.match(firestoreRules, /function employeeHasModulePermission/);
  for (const alias of ["central_ia", "gerenciar_ia", "ia", "inteligencia-artificial"]) {
    assert.ok(firestoreRules.includes(`"${alias}" in permissions`));
  }
});

test("formulário contém os campos obrigatórios e controles acessíveis", () => {
  for (const id of [
    "ia-ativo", "ia-nome-assistente", "ia-mensagem-apresentacao", "ia-idioma",
    "ia-personalidade", "ia-tamanho-resposta", "ia-instrucoes",
    "ia-canal-lojaPublica", "ia-canal-sugestoesFuncionarios",
    "ia-canal-respostasAutomaticas", "ia-canal-criacaoConteudo",
    "ia-canal-whatsapp", "ia-modo-resposta", "ia-mensagem-fallback"
  ]) {
    assert.match(dashboardHtml, new RegExp(`id="${id}"`));
  }
  assert.match(dashboardHtml, /role="switch"/);
  assert.match(dashboardHtml, /aria-live="polite"/);
  assert.match(dashboardHtml, /<button type="button" class="central-ia-choice"/);
});

test("aviso de carregamento oferece nova tentativa pelo controlador", () => {
  assert.match(dashboardHtml, /id="ia-tentar-novamente"[^>]*>Tentar novamente<\/button>/);
  assert.match(dashboardApp, /getElementById\("ia-tentar-novamente"\)[\s\S]*?centralIAController\.load\(\{ force: true \}\)/);
});

test("deploy Spark usa o projeto do frontend, publica Rules antes de Storage/índices e nunca publica Functions", () => {
  assert.match(firebaseInit, /projectId:\s*"vide-digital-saas"/);
  assert.match(firebaseDeployWorkflow, /\$\{PROJECT_ID\}" != "vide-digital-saas"/);
  const rulesDeploy = firebaseDeployWorkflow.indexOf("--only firestore:rules");
  const storageDeploy = firebaseDeployWorkflow.indexOf("--only storage");
  const indexesDeploy = firebaseDeployWorkflow.indexOf("--only firestore:indexes");
  assert.ok(rulesDeploy >= 0);
  assert.ok(storageDeploy >= 0);
  assert.ok(indexesDeploy >= 0);
  assert.ok(rulesDeploy < storageDeploy);
  assert.ok(storageDeploy < indexesDeploy);
  // Decisão definitiva do plano Spark: nenhum deploy de Cloud Functions.
  assert.ok(!firebaseDeployWorkflow.includes("--only functions"));
  assert.ok(!firebaseDeployWorkflow.includes("gcloud functions"));
});

test("layout possui breakpoints para desktop, tablet e celulares de 360/390px", () => {
  assert.match(centralIaCss, /@media \(max-width: 1023px\)/);
  assert.match(centralIaCss, /@media \(max-width: 767px\)/);
  assert.match(centralIaCss, /@media \(max-width: 389px\)/);
  assert.match(centralIaCss, /grid-template-columns: minmax\(0, 1fr\) 320px/);
  assert.match(centralIaCss, /min-width: 0/);
});

test("valores padrão formam uma configuração válida", () => {
  const result = validarConfiguracaoIA(CONFIG_IA_PADRAO);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, {});
  assert.equal(result.config.idioma, "pt-BR");
  assert.equal(result.config.personalidade, "amigavel");
  assert.equal(result.config.tamanhoResposta, "media");
  assert.equal(result.config.modoRespostaAutomatica, "nunca");
});

test("normalização remove espaços externos sem alterar quebras de linha das instruções", () => {
  const normalized = normalizarConfiguracaoIA({
    ...CONFIG_IA_PADRAO,
    nomeAssistente: "  Luna  ",
    mensagemFallback: "  Encaminharei para a equipe.  ",
    instrucoes: "Linha 1\n\nLinha 2  "
  });
  assert.equal(normalized.nomeAssistente, "Luna");
  assert.equal(normalized.mensagemFallback, "Encaminharei para a equipe.");
  assert.equal(normalized.instrucoes, "Linha 1\n\nLinha 2  ");
});

test("nome fora do intervalo de 2 a 40 caracteres é rejeitado", () => {
  assert.equal(validarConfiguracaoIA({ ...CONFIG_IA_PADRAO, nomeAssistente: "A" }).valid, false);
  assert.equal(validarConfiguracaoIA({ ...CONFIG_IA_PADRAO, nomeAssistente: "x".repeat(41) }).valid, false);
  assert.equal(validarConfiguracaoIA({ ...CONFIG_IA_PADRAO, nomeAssistente: "   " }).valid, false);
});

test("limites de apresentação, instruções e fallback são validados", () => {
  assert.equal(validarConfiguracaoIA({ ...CONFIG_IA_PADRAO, mensagemApresentacao: "x".repeat(301) }).valid, false);
  assert.equal(validarConfiguracaoIA({ ...CONFIG_IA_PADRAO, instrucoes: "x".repeat(5001) }).valid, false);
  assert.equal(validarConfiguracaoIA({ ...CONFIG_IA_PADRAO, mensagemFallback: "" }).valid, false);
  assert.equal(validarConfiguracaoIA({ ...CONFIG_IA_PADRAO, mensagemFallback: "x".repeat(301) }).valid, false);
});

test("identificadores inválidos são normalizados para valores estáveis permitidos", () => {
  const normalized = normalizarConfiguracaoIA({
    ...CONFIG_IA_PADRAO,
    idioma: "qualquer",
    personalidade: "outra",
    tamanhoResposta: "gigante",
    modoRespostaAutomatica: "talvez"
  });
  assert.equal(normalized.idioma, CONFIG_IA_PADRAO.idioma);
  assert.equal(normalized.personalidade, CONFIG_IA_PADRAO.personalidade);
  assert.equal(normalized.tamanhoResposta, CONFIG_IA_PADRAO.tamanhoResposta);
  assert.equal(normalized.modoRespostaAutomatica, CONFIG_IA_PADRAO.modoRespostaAutomatica);
});

test("todos os canais normalizados são booleanos", () => {
  const normalized = normalizarConfiguracaoIA({ canais: {
    lojaPublica: 1,
    sugestoesFuncionarios: "true",
    respostasAutomaticas: true,
    criacaoConteudo: null,
    whatsapp: false
  }});
  assert.deepEqual(normalized.canais, {
    lojaPublica: false,
    sugestoesFuncionarios: false,
    respostasAutomaticas: true,
    criacaoConteudo: false,
    whatsapp: false
  });
});

test("ausência de documento é representada pelos padrões e dados existentes preenchem a configuração", () => {
  assert.deepEqual(normalizarConfiguracaoIA(undefined), normalizarConfiguracaoIA(CONFIG_IA_PADRAO));
  const loaded = normalizarConfiguracaoIA({ nomeAssistente: "Luna", canais: { whatsapp: true } });
  assert.equal(loaded.nomeAssistente, "Luna");
  assert.equal(loaded.canais.whatsapp, true);
  assert.equal(loaded.canais.lojaPublica, false);
});

test("payload usa somente a loja autenticada e ignora tenant enviado pelo formulário", () => {
  const timestamp = { sentinel: "server" };
  const payload = criarPayloadConfiguracaoIA(
    { ...CONFIG_IA_PADRAO, tenantId: "attacker", lojaId: "outra-loja" },
    { storeUid: "ownerA", authUid: "employeeEdit" },
    timestamp,
    false
  );
  assert.equal(payload.tenantId, "ownerA");
  assert.equal(payload.lojaId, "ownerA");
  assert.equal(payload.criadoPor, "employeeEdit");
  assert.equal(payload.atualizadoPor, "employeeEdit");
  assert.equal(payload.criadoEm, timestamp);
});

test("atualização preserva metadados de criação ao omiti-los do merge", () => {
  const payload = criarPayloadConfiguracaoIA(
    CONFIG_IA_PADRAO,
    { storeUid: "ownerA", authUid: "ownerA" },
    { sentinel: "server" },
    true
  );
  assert.equal(Object.hasOwn(payload, "criadoEm"), false);
  assert.equal(Object.hasOwn(payload, "criadoPor"), false);
});

test("proprietário carrega defaults de documento inexistente e consegue salvar", async () => {
  const { root, elements } = criarDomFakeCentralIA();
  const writes = [];
  const notifications = [];
  const timestamp = { sentinel: "server" };
  const context = {
    getSnapshot: () => ({
      initialized: true,
      active: true,
      storeUid: "ownerA",
      authUid: "ownerA",
      userType: "owner",
      isOwner: true
    }),
    canView: moduleKey => moduleKey === "central-ia",
    canEdit: moduleKey => moduleKey === "central-ia"
  };
  const firestore = {
    doc: (_db, collection, id) => ({ collection, id }),
    getDoc: async () => ({ exists: () => false, data: () => null }),
    setDoc: async (...args) => writes.push(args),
    serverTimestamp: () => timestamp
  };
  const controller = criarCentralIAController({
    db: {}, context, firestore, root,
    notify: (...args) => notifications.push(args),
    logger: { error() {} }
  });

  await controller.load();
  assert.equal(elements["ia-nome-assistente"].value, CONFIG_IA_PADRAO.nomeAssistente);
  assert.equal(elements["ia-fieldset"].disabled, false);

  elements["ia-nome-assistente"].value = "Luna";
  controller.updateState();
  assert.equal(elements["ia-salvar"].disabled, false);
  await controller.save();

  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0][0], { collection: "configuracoes_ia", id: "ownerA" });
  assert.equal(writes[0][1].nomeAssistente, "Luna");
  assert.equal(writes[0][1].tenantId, "ownerA");
  assert.equal(writes[0][1].lojaId, "ownerA");
  assert.equal(writes[0][1].criadoPor, "ownerA");
  assert.equal(writes[0][1].atualizadoPor, "ownerA");
  assert.equal(writes[0][1].criadoEm, timestamp);
  assert.equal(writes[0][1].atualizadoEm, timestamp);
  assert.deepEqual(writes[0][2], { merge: true });
  assert.deepEqual(notifications.at(-1), ["Configurações da IA salvas com sucesso.", "success"]);
  assert.equal(controller.getState().exists, true);
});

test("funcionário somente leitura carrega dados sem poder editar ou salvar", async () => {
  const { root, elements } = criarDomFakeCentralIA();
  const writes = [];
  const notifications = [];
  const context = {
    getSnapshot: () => ({
      initialized: true, active: true, storeUid: "ownerA", authUid: "employeeRead",
      userType: "employee", isEmployee: true
    }),
    canView: () => true,
    canEdit: () => false
  };
  const controller = criarCentralIAController({
    db: {}, context, root,
    firestore: {
      doc: (_db, collection, id) => ({ collection, id }),
      getDoc: async () => ({
        exists: () => true,
        data: () => ({ ...CONFIG_IA_PADRAO, nomeAssistente: "Luna" })
      }),
      setDoc: async (...args) => writes.push(args),
      serverTimestamp: () => ({})
    },
    notify: (...args) => notifications.push(args),
    logger: { error() {} }
  });

  await controller.load();
  assert.equal(elements["ia-nome-assistente"].value, "Luna");
  assert.equal(elements["ia-fieldset"].disabled, true);
  assert.equal(elements["ia-readonly-notice"].hidden, false);

  elements["ia-nome-assistente"].value = "Tentativa bloqueada";
  await controller.save();
  assert.equal(writes.length, 0);
  assert.deepEqual(notifications.at(-1), ["Você tem acesso somente leitura neste módulo.", "error"]);
});

test("funcionário editor carrega e salva na loja vinculada", async () => {
  const { root, elements } = criarDomFakeCentralIA();
  const writes = [];
  const context = {
    getSnapshot: () => ({
      initialized: true, active: true, storeUid: "ownerA", authUid: "employeeEdit",
      userType: "employee", isEmployee: true
    }),
    canView: () => true,
    canEdit: () => true
  };
  const controller = criarCentralIAController({
    db: {}, context, root,
    firestore: {
      doc: (_db, collection, id) => ({ collection, id }),
      getDoc: async () => ({ exists: () => false, data: () => null }),
      setDoc: async (...args) => writes.push(args),
      serverTimestamp: () => ({ sentinel: "server" })
    },
    logger: { error() {} }
  });

  await controller.load();
  elements["ia-nome-assistente"].value = "Editora";
  await controller.save();

  assert.equal(elements["ia-fieldset"].disabled, false);
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0][0], { collection: "configuracoes_ia", id: "ownerA" });
  assert.equal(writes[0][1].criadoPor, "employeeEdit");
  assert.equal(writes[0][1].tenantId, "ownerA");
});

test("falha no carregamento mantém defaults coerentes e bloqueia edição", async () => {
  const { root, elements } = criarDomFakeCentralIA();
  const context = {
    getSnapshot: () => ({ initialized: true, active: true, storeUid: "ownerA", authUid: "ownerA" }),
    canView: () => true,
    canEdit: () => true
  };
  const controller = criarCentralIAController({
    db: {}, context, root,
    firestore: {
      doc: () => ({}),
      getDoc: async () => { throw new Error("offline"); },
      setDoc: async () => {},
      serverTimestamp: () => ({})
    },
    logger: { error() {} }
  });

  await controller.load();
  assert.equal(elements["ia-nome-assistente"].value, CONFIG_IA_PADRAO.nomeAssistente);
  assert.equal(elements["ia-fieldset"].disabled, true);
  assert.equal(elements["ia-load-error"].classList.contains("is-visible"), true);
  assert.equal(elements["ia-load-error-message"].textContent, "Não foi possível carregar as configurações. Tente novamente.");
  assert.equal(controller.getState().initialized, false);
  assert.equal(controller.getState().loadError, true);

  elements["ia-nome-assistente"].value = "Não pode salvar";
  controller.updateState();
  assert.equal(elements["ia-salvar"].disabled, true);
});

test("permission-denied mostra mensagem segura e registra contexto sanitizado", async () => {
  const { root, elements } = criarDomFakeCentralIA();
  const logs = [];
  const context = {
    getSnapshot: () => ({
      initialized: true, active: true, storeUid: "ownerA", authUid: "ownerA",
      userType: "owner", isOwner: true
    }),
    canView: () => true,
    canEdit: () => true
  };
  const error = Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
  const controller = criarCentralIAController({
    db: {}, context, root,
    firestore: {
      doc: () => ({}),
      getDoc: async () => { throw error; },
      setDoc: async () => {},
      serverTimestamp: () => ({})
    },
    logger: { error: (...args) => logs.push(args) }
  });

  await controller.load();
  assert.equal(elements["ia-load-error-message"].textContent, "Sua conta não tem permissão para acessar esta configuração.");
  assert.equal(elements["ia-fieldset"].disabled, true);
  assert.equal(logs.length, 1);
  assert.deepEqual(logs[0][1], {
    code: "permission-denied",
    message: "Missing or insufficient permissions.",
    storeUid: "ownerA",
    authUid: "ownerA",
    context: {
      initialized: true, active: true, userType: "owner", isOwner: true,
      isEmployee: false, isAdmin: false, canView: true, canEdit: true
    },
    path: "configuracoes_ia/ownerA"
  });
});

test("falha de rede mostra orientação de conexão sem liberar edição", async () => {
  const { root, elements } = criarDomFakeCentralIA();
  const context = {
    getSnapshot: () => ({ initialized: true, active: true, storeUid: "ownerA", authUid: "ownerA" }),
    canView: () => true,
    canEdit: () => true
  };
  const error = Object.assign(new Error("Backend unavailable"), { code: "unavailable" });
  const controller = criarCentralIAController({
    db: {}, context, root,
    firestore: {
      doc: () => ({}),
      getDoc: async () => { throw error; },
      setDoc: async () => {},
      serverTimestamp: () => ({})
    },
    logger: { error() {} }
  });

  await controller.load();
  assert.equal(elements["ia-load-error-message"].textContent, "Não foi possível conectar ao Firebase. Verifique sua conexão e tente novamente.");
  assert.equal(elements["ia-fieldset"].disabled, true);
});

test("nova tentativa mostra loading e desbloqueia somente após leitura bem-sucedida", async () => {
  const { root, elements } = criarDomFakeCentralIA();
  let attempts = 0;
  let resolveRetry;
  const context = {
    getSnapshot: () => ({ initialized: true, active: true, storeUid: "ownerA", authUid: "ownerA" }),
    canView: () => true,
    canEdit: () => true
  };
  const controller = criarCentralIAController({
    db: {}, context, root,
    firestore: {
      doc: () => ({}),
      getDoc: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("offline");
        return await new Promise(resolve => { resolveRetry = resolve; });
      },
      setDoc: async () => {},
      serverTimestamp: () => ({})
    },
    logger: { error() {} }
  });

  await controller.load();
  const retryPromise = controller.load({ force: true });
  await controller.load({ force: true });

  assert.equal(attempts, 2);
  assert.equal(elements["ia-loading"].classList.contains("hidden"), false);
  assert.equal(elements["ia-content"].classList.contains("hidden"), true);
  assert.equal(elements["ia-fieldset"].disabled, true);
  assert.equal(elements["ia-tentar-novamente"].disabled, true);
  assert.equal(elements["ia-load-error"].classList.contains("is-visible"), false);

  resolveRetry({ exists: () => false, data: () => null });
  await retryPromise;

  assert.equal(elements["ia-loading"].classList.contains("hidden"), true);
  assert.equal(elements["ia-content"].classList.contains("hidden"), false);
  assert.equal(elements["ia-fieldset"].disabled, false);
  assert.equal(elements["ia-tentar-novamente"].disabled, false);
  assert.equal(elements["ia-load-error"].classList.contains("is-visible"), false);
  assert.equal(controller.getState().initialized, true);
  assert.equal(controller.getState().loadError, false);
});

test("alterações não salvas ignoram apenas diferenças normalizadas", () => {
  assert.equal(configuracaoIaTemAlteracoes(
    { ...CONFIG_IA_PADRAO, nomeAssistente: " Assistente Virtual " },
    CONFIG_IA_PADRAO
  ), false);
  assert.equal(configuracaoIaTemAlteracoes(
    { ...CONFIG_IA_PADRAO, nomeAssistente: "Luna" },
    CONFIG_IA_PADRAO
  ), true);
});

test("salvamento exige permissão, usa timestamp do servidor e impede clique duplicado", () => {
  assert.match(centralIaSource, /if \(state\.saving\) return/);
  assert.match(centralIaSource, /context\.canEdit\("central-ia"\)/);
  assert.match(centralIaSource, /firestore\.serverTimestamp\(\)/);
  assert.match(centralIaSource, /firestore\.setDoc\(ref, payload, \{ merge: true \}\)/);
});

test("não existe integração com provedor externo nem campo de chave de IA", () => {
  assert.doesNotMatch(centralIaSource, /openai|anthropic|gemini|apiKey|fetch\s*\(/i);
  assert.doesNotMatch(dashboardHtml.match(/<section id="view-central-ia"[\s\S]*?<section id="view-notificacoes"/)?.[0] || "", /api[-_ ]?key|chave de api/i);
});
