// WhatsApp Oficial V1 — Fase B: lógica PURA do preflight de produção
// (scripts/whatsapp-production-preflight.mjs). Nenhum I/O aqui (sem
// child_process, sem fetch, sem Admin SDK, sem gcloud) — só as decisões de
// classificação PASS/WARN/BLOCKED/FAIL e a formatação da tabela final,
// testáveis sem rede/credenciais. Mesmo padrão pure-function-first já
// usado em functions/src/whatsapp/{validators,send}.js.
//
// Contrato de segurança: nenhuma função aqui aceita ou devolve o VALOR de
// um segredo — só metadados (existe/não existe, quantidade de versões
// habilitadas, nomes de papel IAM). Quem violar isso quebra o propósito
// do preflight.

export const STATUS = Object.freeze({
  PASS: "PASS",
  WARN: "WARN",
  BLOCKED: "BLOCKED",
  FAIL: "FAIL"
});

const ORDEM_SEVERIDADE = { PASS: 0, WARN: 1, BLOCKED: 2, FAIL: 3 };

export function criarCheck(nome, status, detalhe) {
  if (!Object.values(STATUS).includes(status)) {
    throw new Error(`Status de check inválido: ${status}`);
  }
  return { nome: String(nome || ""), status, detalhe: String(detalhe || "") };
}

// ---------- LOCAL ----------

export function avaliarNodeVersion(versionString) {
  const major = Number(String(versionString || "").replace(/^v/, "").split(".")[0]);
  if (!Number.isFinite(major)) {
    return criarCheck("Node.js", STATUS.FAIL, "Não foi possível determinar a versão do Node.");
  }
  if (major < 22) {
    return criarCheck("Node.js", STATUS.FAIL, `Node ${major} detectado — o deploy exige Node 22 (firebase.json/functions/package.json).`);
  }
  if (major > 22) {
    return criarCheck("Node.js", STATUS.WARN, `Node ${major} detectado — o projeto fixa Node 22; versões mais novas podem funcionar, mas não são o runtime testado em CI.`);
  }
  return criarCheck("Node.js", STATUS.PASS, "Node 22 confirmado.");
}

export function avaliarComandoDisponivel(nomeFerramenta, disponivel, versaoOuMotivo) {
  if (disponivel) {
    return criarCheck(nomeFerramenta, STATUS.PASS, versaoOuMotivo || "disponível.");
  }
  return criarCheck(nomeFerramenta, STATUS.FAIL, versaoOuMotivo || "não encontrado no PATH.");
}

export function avaliarWorktreeLimpo(statusPorcelain) {
  const texto = String(statusPorcelain || "").trim();
  if (texto === "") {
    return criarCheck("Worktree git", STATUS.PASS, "Sem alterações não commitadas.");
  }
  const linhas = texto.split("\n").length;
  return criarCheck("Worktree git", STATUS.BLOCKED, `${linhas} arquivo(s) com alteração não commitada — nunca fazer deploy sobre estado sujo.`);
}

export function avaliarHeadEsperado(headAtual, headEsperado) {
  if (!headEsperado) {
    return criarCheck("HEAD do git", STATUS.WARN, `Nenhum HEAD esperado informado — HEAD atual: ${headAtual || "(desconhecido)"}.`);
  }
  if (String(headAtual) === String(headEsperado)) {
    return criarCheck("HEAD do git", STATUS.PASS, `HEAD confere com o esperado (${headEsperado}).`);
  }
  return criarCheck("HEAD do git", STATUS.BLOCKED, `HEAD atual (${headAtual || "?"}) diverge do esperado (${headEsperado}) — revisar antes de continuar.`);
}

export function avaliarAutenticacaoGoogle(contaAtiva) {
  if (contaAtiva) {
    return criarCheck("Autenticação Google (gcloud)", STATUS.PASS, `Conta ativa: ${contaAtiva}.`);
  }
  return criarCheck("Autenticação Google (gcloud)", STATUS.BLOCKED, "Nenhuma conta ativa — rode `gcloud auth login` antes do deploy.");
}

export function avaliarProjetoSelecionado(projetoAtual, projetoEsperado) {
  if (!projetoAtual) {
    return criarCheck("Projeto GCP selecionado", STATUS.BLOCKED, `Nenhum projeto selecionado — rode \`gcloud config set project ${projetoEsperado}\`.`);
  }
  if (projetoAtual !== projetoEsperado) {
    return criarCheck("Projeto GCP selecionado", STATUS.BLOCKED, `Projeto ativo é "${projetoAtual}", esperado "${projetoEsperado}" — nunca prosseguir com o projeto errado.`);
  }
  return criarCheck("Projeto GCP selecionado", STATUS.PASS, `Projeto confirmado: ${projetoEsperado}.`);
}

// ---------- VERSÃO DA GRAPH API ----------
//
// developers.facebook.com bloqueado neste ambiente (403 confirmado via
// WebFetch, ver docs/WHATSAPP_OFICIAL.md). Em 2026-07-29 a constante foi
// atualizada de v21.0 para v25.0 com confirmação DIRETA do usuário (fonte
// oficial Meta), corroborada pelo Meta Business SDK 25.0.0/25.0.1 — ver
// docs/WHATSAPP_OFICIAL.md para o histórico completo. Mesmo assim, este
// check continua SEMPRE BLOCKED por design: é um Gate Manual permanente,
// não um resultado de uma verificação pontual — a versão vigente da Meta
// pode mudar de novo a qualquer momento, então cada deploy real exige
// reconfirmação humana direta na fonte oficial, nunca um PASS automático.
export function avaliarVersaoGraphApi(versaoAtual) {
  return criarCheck(
    "Versão da Graph API (Gate Manual)",
    STATUS.BLOCKED,
    `Código usa ${versaoAtual}. developers.facebook.com bloqueado neste ambiente — não é possível confirmar automaticamente direto na fonte oficial a cada execução. ` +
      "OBRIGATÓRIO antes de qualquer deploy real: confirmar a versão vigente em " +
      "https://developers.facebook.com/docs/graph-api/changelog (ou fonte oficial equivalente) e, se necessário, atualizar SÓ a constante " +
      "WHATSAPP_GRAPH_VERSION em functions/src/whatsapp/constants.js."
  );
}

// ---------- FIREBASE/GCP (metadados, nunca valor) ----------

export function avaliarApisHabilitadas(apisNecessarias, apisHabilitadas) {
  const habilitadasSet = new Set(apisHabilitadas || []);
  const faltando = (apisNecessarias || []).filter((api) => !habilitadasSet.has(api));
  if (faltando.length === 0) {
    return criarCheck("APIs do Google Cloud habilitadas", STATUS.PASS, "Todas as APIs necessárias estão habilitadas.");
  }
  return criarCheck("APIs do Google Cloud habilitadas", STATUS.BLOCKED, `Faltando: ${faltando.join(", ")}.`);
}

// existe/versoesHabilitadas são só metadados — nunca o valor do secret.
export function avaliarSecretGlobal(nomeSecret, { existe, versoesHabilitadas } = {}) {
  if (!existe) {
    return criarCheck(`Secret global: ${nomeSecret}`, STATUS.BLOCKED, "Secret não existe no Secret Manager — criar antes do deploy (nunca com valor de exemplo).");
  }
  const quantidade = Number(versoesHabilitadas || 0);
  if (quantidade === 0) {
    return criarCheck(`Secret global: ${nomeSecret}`, STATUS.BLOCKED, "Secret existe, mas sem nenhuma versão habilitada.");
  }
  return criarCheck(`Secret global: ${nomeSecret}`, STATUS.PASS, `Existe, ${quantidade} versão(ões) habilitada(s). (Valor nunca lido por este script.)`);
}

// papeis: lista de strings tipo "roles/secretmanager.secretAccessor".
const PAPEIS_AMPLOS_DEMAIS = new Set([
  "roles/owner",
  "roles/editor",
  "roles/secretmanager.admin"
]);

export function avaliarPapeisIamRuntime(papeis) {
  const lista = Array.isArray(papeis) ? papeis : [];
  const temSecretAccessor = lista.includes("roles/secretmanager.secretAccessor");
  const papeisAmplos = lista.filter((p) => PAPEIS_AMPLOS_DEMAIS.has(p));

  if (!temSecretAccessor) {
    return criarCheck("IAM da service account de runtime", STATUS.BLOCKED, "Falta roles/secretmanager.secretAccessor nos secrets do WhatsApp.");
  }
  if (papeisAmplos.length > 0) {
    return criarCheck("IAM da service account de runtime", STATUS.WARN, `secretAccessor presente, mas também tem papel(éis) amplo(s) demais: ${papeisAmplos.join(", ")} — nunca usar Owner/Editor/Secret Manager Admin como solução.`);
  }
  return criarCheck("IAM da service account de runtime", STATUS.PASS, "roles/secretmanager.secretAccessor presente, sem papel administrativo amplo.");
}

export function avaliarFunctionsPublicadas(nomesEsperados, nomesExistentes) {
  const esperadas = nomesEsperados || [];
  const total = esperadas.length;
  const nomeCheck = `${total} Functions do WhatsApp já publicadas`;
  const existentesSet = new Set(nomesExistentes || []);
  const jaPublicadas = esperadas.filter((nome) => existentesSet.has(nome));
  if (jaPublicadas.length === 0) {
    return criarCheck(nomeCheck, STATUS.WARN, "Nenhuma ainda publicada — esperado antes do primeiro deploy.");
  }
  if (jaPublicadas.length === total) {
    return criarCheck(nomeCheck, STATUS.PASS, `As ${total} Functions já estão publicadas (redeploy).`);
  }
  return criarCheck(nomeCheck, STATUS.WARN, `${jaPublicadas.length}/${total} já publicadas (${jaPublicadas.join(", ")}) — deploy parcial anterior?`);
}

// A missão é explícita: nunca declarar Rules publicadas só porque o
// arquivo existe no repositório. Sem uma chamada autenticada à Firebase
// Management API (fora do escopo deste preflight read-only simples),
// não há como confirmar com segurança o que está publicado — então este
// check é sempre um WARN informativo, nunca um PASS automático.
export function avaliarRulesPublicadas() {
  return criarCheck(
    "Firestore Rules do WhatsApp publicadas",
    STATUS.WARN,
    "Não é possível confirmar com segurança a partir deste script (exigiria a Firebase Management API) — " +
      "confirmar manualmente rodando \"Deploy Firebase Spark\" antes do deploy das Functions, mesmo que pareça já publicado."
  );
}

// resultadoConexao: { ok:true, verifiedName, displayPhoneNumber, qualityRating } | { ok:false, code }
export function avaliarConexaoMeta(resultadoConexao) {
  if (!resultadoConexao) {
    return criarCheck("Validação real com a Meta", STATUS.WARN, "Não executada nesta rodada (IDs/token não fornecidos) — opcional, mas recomendada antes do deploy.");
  }
  if (resultadoConexao.ok) {
    const nome = resultadoConexao.verifiedName || "(sem nome verificado)";
    const numero = resultadoConexao.displayPhoneNumber || "(número não retornado)";
    return criarCheck("Validação real com a Meta", STATUS.PASS, `Conexão validada: ${nome} — ${numero}.`);
  }
  return criarCheck("Validação real com a Meta", STATUS.FAIL, `Falha ao validar (${resultadoConexao.code || "erro desconhecido"}) — token/IDs incorretos ou a Meta está indisponível.`);
}

// ---------- Agregação e saída ----------

export function resumirResultados(checks) {
  const resumo = { PASS: 0, WARN: 0, BLOCKED: 0, FAIL: 0, total: (checks || []).length };
  for (const check of checks || []) {
    if (resumo[check.status] !== undefined) resumo[check.status] += 1;
  }
  return resumo;
}

// 0 = pronto; 1 = bloqueado; 2 = falha técnica — FAIL tem prioridade sobre
// BLOCKED porque significa que nem foi possível checar de verdade.
export function calcularCodigoSaida(checks) {
  const piorStatus = (checks || []).reduce((pior, check) => {
    return ORDEM_SEVERIDADE[check.status] > ORDEM_SEVERIDADE[pior] ? check.status : pior;
  }, STATUS.PASS);
  if (piorStatus === STATUS.FAIL) return 2;
  if (piorStatus === STATUS.BLOCKED) return 1;
  return 0;
}

// Nunca imprime nada que pareça segredo — os próprios checks já são
// construídos sem valor de segredo (só metadados), então formatar aqui é
// só apresentação. Mantido simples e sem dependência de terminal (sem
// cores ANSI) para funcionar igual em qualquer shell/CI.
export function formatarTabelaTexto(checks) {
  const linhas = (checks || []).map((check) => `[${check.status.padEnd(7)}] ${check.nome} — ${check.detalhe}`);
  const resumo = resumirResultados(checks);
  linhas.push("");
  linhas.push(`Resumo: ${resumo.PASS} PASS, ${resumo.WARN} WARN, ${resumo.BLOCKED} BLOCKED, ${resumo.FAIL} FAIL (${resumo.total} checks).`);
  return linhas.join("\n");
}
