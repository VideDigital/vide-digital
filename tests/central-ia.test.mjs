import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  CONFIG_IA_PADRAO,
  configuracaoIaTemAlteracoes,
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
