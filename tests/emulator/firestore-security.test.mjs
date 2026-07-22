import assert from "node:assert/strict";
import fs from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from "@firebase/rules-unit-testing";
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  or,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";

const PROJECT_ID = "demo-vide-hub";
let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync("firestore.rules", "utf8")
    }
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "usuarios", "ownerA"), { status: "aprovado", plano: "pro", nomeLoja: "A" });
    await setDoc(doc(db, "usuarios", "ownerB"), { status: "aprovado", plano: "pro", nomeLoja: "B" });
    await setDoc(doc(db, "funcionarios", "employeeRead"), {
      donoUID: "ownerA",
      status: "ativo",
      permissoes: { ver: ["produtos"], editar: [] }
    });
    await setDoc(doc(db, "funcionarios", "employeeEdit"), {
      donoUID: "ownerA",
      status: "ativo",
      permissoes: { ver: ["produtos"], editar: ["produtos"] }
    });
    await setDoc(doc(db, "funcionarios", "employeeInactive"), {
      donoUID: "ownerA",
      status: "inativo",
      permissoes: { ver: ["produtos"], editar: ["produtos"] }
    });
    await setDoc(doc(db, "funcionarios", "employeeIaRead"), {
      donoUID: "ownerA",
      status: "ativo",
      permissoes: { ver: ["central-ia"], editar: [] }
    });
    await setDoc(doc(db, "funcionarios", "employeeIaEdit"), {
      donoUID: "ownerA",
      status: "ativo",
      permissoes: { ver: ["central-ia"], editar: ["central-ia"] }
    });
    await setDoc(doc(db, "funcionarios", "employeeIaAlias"), {
      donoUID: "ownerA",
      status: "ativo",
      permissoes: { ver: ["gerenciar_ia"], editar: ["gerenciar_ia"] }
    });
    await setDoc(doc(db, "produtos", "prodA"), { criadoPor: "ownerA", statusProduto: "ativo", nome: "Produto A" });
    await setDoc(doc(db, "produtos", "prodPrivate"), { criadoPor: "ownerA", statusProduto: "rascunho", nome: "Produto Privado" });
    await setDoc(doc(db, "produtos", "prodB"), { criadoPor: "ownerB", statusProduto: "ativo", nome: "Produto B" });
    await setDoc(doc(db, "avaliacoes", "revPublished"), {
      produtoId: "prodA",
      criadoPor: "ownerA",
      nome: "Cliente Publicado",
      nota: 5,
      comentario: "Excelente atendimento.",
      status: "publicada",
      data: new Date("2026-07-21T10:00:00.000Z")
    });
    await setDoc(doc(db, "avaliacoes", "revNew"), {
      produtoId: "prodA",
      criadoPor: "ownerA",
      nome: "Cliente Novo",
      nota: 4,
      comentario: "Aguardando moderação.",
      status: "novo",
      data: new Date("2026-07-21T11:00:00.000Z")
    });
    await setDoc(doc(db, "avaliacoes", "revRejected"), {
      produtoId: "prodA",
      criadoPor: "ownerA",
      nome: "Cliente Rejeitado",
      nota: 2,
      comentario: "Não deve aparecer publicamente.",
      status: "rejeitada",
      data: new Date("2026-07-21T12:00:00.000Z")
    });
    await setDoc(doc(db, "vitrines_publicas", "loja-a"), { donoUID: "ownerA", emailDono: "ownerA", nomeLoja: "Loja A" });
    await setDoc(doc(db, "metricas_vitrines", "ownerA"), { totalCliques: 42, totalSessoes: 10 });
    await setDoc(doc(db, "metricas_produtos", "prodA"), { visualizacoes: 7, cliques: 3 });
    await setDoc(doc(db, "campanhas", "ownerA"), { ativa: true, orcamento: 500, canal: "meta" });
    await setDoc(doc(db, "config", "tema_sistema"), { primaria: "#5B3DF5" });
    await setDoc(doc(db, "config", "planos"), { starter: { produtos: 3 } });
    await setDoc(doc(db, "notificacoes", "notifTodos"), { titulo: "Broadcast", destinatarios: "todos" });
    await setDoc(doc(db, "notificacoes", "notifOwnerA"), { titulo: "Só ownerA", destinatarios: ["ownerA"] });
    await setDoc(doc(db, "notificacoes", "notifOwnerB"), { titulo: "Só ownerB", destinatarios: ["ownerB"] });
    await setDoc(doc(db, "configuracoes_ia", "ownerA"), {
      ativo: false,
      nomeAssistente: "Assistente Virtual",
      mensagemApresentacao: "Olá! Como posso ajudar?",
      idioma: "pt-BR",
      personalidade: "amigavel",
      tamanhoResposta: "media",
      instrucoes: "",
      canais: {
        lojaPublica: false,
        sugestoesFuncionarios: false,
        respostasAutomaticas: false,
        criacaoConteudo: false,
        whatsapp: false
      },
      modoRespostaAutomatica: "nunca",
      mensagemFallback: "Vou encaminhar sua pergunta para nossa equipe.",
      tenantId: "ownerA",
      lojaId: "ownerA",
      criadoPor: "ownerA",
      criadoEm: new Date("2026-07-21T10:00:00.000Z"),
      atualizadoPor: "ownerA",
      atualizadoEm: new Date("2026-07-21T10:00:00.000Z")
    });
  });
});

after(async () => {
  await testEnv.cleanup();
});

function authed(uid, token = {}) {
  return testEnv.authenticatedContext(uid, token).firestore();
}

function anon() {
  return testEnv.unauthenticatedContext().firestore();
}

function avaliacaoValida(overrides = {}) {
  return {
    produtoId: "prodA",
    criadoPor: "ownerA",
    nome: "Cliente Real",
    nota: 5,
    comentario: "Gostei do produto.",
    status: "novo",
    data: serverTimestamp(),
    ...overrides
  };
}

function configuracaoIaValida(storeUid, authUid, overrides = {}) {
  return {
    ativo: false,
    nomeAssistente: "Assistente Virtual",
    mensagemApresentacao: "Olá! Como posso ajudar?",
    idioma: "pt-BR",
    personalidade: "amigavel",
    tamanhoResposta: "media",
    instrucoes: "",
    canais: {
      lojaPublica: false,
      sugestoesFuncionarios: false,
      respostasAutomaticas: false,
      criacaoConteudo: false,
      whatsapp: false
    },
    modoRespostaAutomatica: "nunca",
    mensagemFallback: "Vou encaminhar sua pergunta para nossa equipe.",
    tenantId: storeUid,
    lojaId: storeUid,
    criadoPor: authUid,
    criadoEm: serverTimestamp(),
    atualizadoPor: authUid,
    atualizadoEm: serverTimestamp(),
    ...overrides
  };
}

describe("usuarios", () => {
  it("owner cria cadastro pendente válido", async () => {
    await assertSucceeds(setDoc(doc(authed("newOwner"), "usuarios", "newOwner"), {
      identificador: "nova@example.com",
      nome: "Nova",
      email: "nova@example.com",
      nomeLoja: "Nova Loja",
      urlLoja: "nova-loja",
      status: "pendente",
      criadoEm: "2026-07-19T00:00:00.000Z"
    }));
  });

  it("owner não cria cadastro aprovado nem plano premium", async () => {
    await assertFails(setDoc(doc(authed("newOwner"), "usuarios", "newOwner"), {
      email: "nova@example.com",
      nomeLoja: "Nova Loja",
      urlLoja: "nova-loja",
      status: "aprovado",
      plano: "premium",
      criadoEm: "2026-07-19T00:00:00.000Z"
    }));
  });

  it("owner edita perfil mas não altera plano/status/features", async () => {
    await assertSucceeds(updateDoc(doc(authed("ownerA"), "usuarios", "ownerA"), { nomeLoja: "Loja A+" }));
    await assertFails(updateDoc(doc(authed("ownerA"), "usuarios", "ownerA"), { plano: "premium" }));
    await assertFails(updateDoc(doc(authed("ownerA"), "usuarios", "ownerA"), { status: "inativo" }));
    await assertFails(updateDoc(doc(authed("ownerA"), "usuarios", "ownerA"), { featuresManuais: ["*"] }));
  });
});

describe("tenant isolation", () => {
  it("owner não acessa produto privado de outro tenant", async () => {
    await assertFails(getDoc(doc(authed("ownerB"), "produtos", "prodPrivate")));
  });

  it("employee read-only lê, mas não escreve", async () => {
    await assertSucceeds(getDoc(doc(authed("employeeRead"), "produtos", "prodA")));
    await assertFails(updateDoc(doc(authed("employeeRead"), "produtos", "prodA"), { nome: "Novo" }));
  });

  it("employee sem acesso a 'configuracoes' ainda lê usuarios/{donoUID} pra logar", async () => {
    // employeeRead só tem ver:["produtos"] — login/contexto (core/vide-context.js)
    // lê usuarios/{donoUID} pra QUALQUER funcionário ativo, não é o módulo
    // "configuracoes". Gatear essa leitura pela permissão de configuracoes
    // impedia login de todo funcionário sem esse módulo específico.
    await assertSucceeds(getDoc(doc(authed("employeeRead"), "usuarios", "ownerA")));
    // continua não escrevendo o perfil, isso sim é config
    await assertFails(updateDoc(doc(authed("employeeRead"), "usuarios", "ownerA"), { nomeLoja: "Hack" }));
  });

  it("employee edit escreve sem trocar criadoPor", async () => {
    await assertSucceeds(updateDoc(doc(authed("employeeEdit"), "produtos", "prodA"), { nome: "Novo" }));
    await assertFails(updateDoc(doc(authed("employeeEdit"), "produtos", "prodA"), { criadoPor: "ownerB" }));
  });

  it("employee inativo bloqueado", async () => {
    await assertFails(getDoc(doc(authed("employeeInactive"), "produtos", "prodPrivate")));
  });
});

describe("configuracoes_ia: permissões e isolamento multi-tenant", () => {
  it("proprietário lê, cria e atualiza a configuração da própria loja", async () => {
    await assertSucceeds(getDoc(doc(authed("ownerA"), "configuracoes_ia", "ownerA")));
    await assertSucceeds(setDoc(
      doc(authed("ownerB"), "configuracoes_ia", "ownerB"),
      configuracaoIaValida("ownerB", "ownerB")
    ));
    await assertSucceeds(updateDoc(doc(authed("ownerA"), "configuracoes_ia", "ownerA"), {
      nomeAssistente: "Luna",
      atualizadoPor: "ownerA",
      atualizadoEm: serverTimestamp()
    }));
  });

  it("funcionário com Ver lê, mas não salva", async () => {
    await assertSucceeds(getDoc(doc(authed("employeeIaRead"), "configuracoes_ia", "ownerA")));
    await assertFails(updateDoc(doc(authed("employeeIaRead"), "configuracoes_ia", "ownerA"), {
      nomeAssistente: "Sem permissão",
      atualizadoPor: "employeeIaRead",
      atualizadoEm: serverTimestamp()
    }));
  });

  it("funcionário autorizado salva a configuração da loja vinculada", async () => {
    await assertSucceeds(updateDoc(doc(authed("employeeIaEdit"), "configuracoes_ia", "ownerA"), {
      nomeAssistente: "Assistente da equipe",
      atualizadoPor: "employeeIaEdit",
      atualizadoEm: serverTimestamp()
    }));
  });

  it("alias legado da permissão mantém leitura e edição no backend", async () => {
    const ref = doc(authed("employeeIaAlias"), "configuracoes_ia", "ownerA");
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(updateDoc(ref, {
      nomeAssistente: "Assistente compatível",
      atualizadoPor: "employeeIaAlias",
      atualizadoEm: serverTimestamp()
    }));
  });

  it("funcionário sem permissão não lê nem salva", async () => {
    await assertFails(getDoc(doc(authed("employeeRead"), "configuracoes_ia", "ownerA")));
    await assertFails(updateDoc(doc(authed("employeeRead"), "configuracoes_ia", "ownerA"), {
      nomeAssistente: "Tentativa",
      atualizadoPor: "employeeRead",
      atualizadoEm: serverTimestamp()
    }));
  });

  it("usuário de outra loja e visitante anônimo não acessam", async () => {
    await assertFails(getDoc(doc(authed("ownerB"), "configuracoes_ia", "ownerA")));
    await assertFails(updateDoc(doc(authed("ownerB"), "configuracoes_ia", "ownerA"), {
      nomeAssistente: "Outra loja",
      atualizadoPor: "ownerB",
      atualizadoEm: serverTimestamp()
    }));
    await assertFails(getDoc(doc(anon(), "configuracoes_ia", "ownerA")));
  });

  it("tenantId, lojaId e criadoPor não podem ser trocados", async () => {
    const ref = doc(authed("ownerA"), "configuracoes_ia", "ownerA");
    await assertFails(updateDoc(ref, { tenantId: "ownerB", atualizadoPor: "ownerA", atualizadoEm: serverTimestamp() }));
    await assertFails(updateDoc(ref, { lojaId: "ownerB", atualizadoPor: "ownerA", atualizadoEm: serverTimestamp() }));
    await assertFails(updateDoc(ref, { criadoPor: "employeeIaEdit", atualizadoPor: "ownerA", atualizadoEm: serverTimestamp() }));
  });

  it("regras rejeitam identificadores, limites e campos extras", async () => {
    const db = authed("ownerB");
    await assertFails(setDoc(doc(db, "configuracoes_ia", "ownerB"), configuracaoIaValida("ownerB", "ownerB", { idioma: "xx" })));
    await assertFails(setDoc(doc(db, "configuracoes_ia", "ownerB"), configuracaoIaValida("ownerB", "ownerB", { nomeAssistente: "x".repeat(41) })));
    await assertFails(setDoc(doc(db, "configuracoes_ia", "ownerB"), configuracaoIaValida("ownerB", "ownerB", { apiKey: "não permitido" })));
  });
});

describe("public writes", () => {
  it("público lê vitrine e só escreve leads/métricas válidos", async () => {
    await assertSucceeds(getDoc(doc(anon(), "vitrines_publicas", "loja-a")));
    await assertFails(updateDoc(doc(anon(), "vitrines_publicas", "loja-a"), { donoUID: "attacker" }));
    await assertSucceeds(setDoc(doc(anon(), "leads", "leadX"), { criadoPor: "ownerA", status: "novo" }));
    await assertFails(setDoc(doc(anon(), "leads", "leadAdmin"), { criadoPor: "ownerA", status: "convertido" }));
    await assertSucceeds(setDoc(doc(anon(), "metricas_produtos", "prodA"), { visualizacoes: 1 }));
    await assertFails(setDoc(doc(anon(), "metricas_produtos", "prodA"), { visualizacoes: 1, criadoPor: "attacker" }));
    await assertFails(setDoc(doc(anon(), "chats", "chatX"), { donoUID: "ownerA" }));
  });
});

describe("avaliacoes de clientes", () => {
  it("visitante cria avaliação pública válida", async () => {
    await assertSucceeds(setDoc(doc(anon(), "avaliacoes", "revValid"), avaliacaoValida()));
  });

  it("visitante não cria avaliação para produto inexistente", async () => {
    await assertFails(setDoc(doc(anon(), "avaliacoes", "revMissingProduct"), avaliacaoValida({ produtoId: "missing" })));
  });

  it("visitante não cria avaliação para produto em rascunho", async () => {
    await assertFails(setDoc(doc(anon(), "avaliacoes", "revDraftProduct"), avaliacaoValida({ produtoId: "prodPrivate" })));
  });

  it("visitante não escolhe criadoPor diferente do dono do produto", async () => {
    await assertFails(setDoc(doc(anon(), "avaliacoes", "revWrongOwner"), avaliacaoValida({ criadoPor: "ownerB" })));
  });

  it("visitante não cria avaliação com nota menor que 1", async () => {
    await assertFails(setDoc(doc(anon(), "avaliacoes", "revLowRating"), avaliacaoValida({ nota: 0 })));
  });

  it("visitante não cria avaliação com nota maior que 5", async () => {
    await assertFails(setDoc(doc(anon(), "avaliacoes", "revHighRating"), avaliacaoValida({ nota: 6 })));
  });

  it("visitante não cria avaliação com nota decimal", async () => {
    await assertFails(setDoc(doc(anon(), "avaliacoes", "revDecimalRating"), avaliacaoValida({ nota: 4.5 })));
  });

  it("visitante não define status inicial diferente de novo", async () => {
    await assertFails(setDoc(doc(anon(), "avaliacoes", "revPublishedOnCreate"), avaliacaoValida({ status: "publicada" })));
  });

  it("visitante não envia campo administrativo adicional", async () => {
    await assertFails(setDoc(doc(anon(), "avaliacoes", "revAdminField"), avaliacaoValida({ moderadoPor: "ownerA" })));
  });

  it("visitante não cria comentário acima do limite", async () => {
    await assertFails(setDoc(doc(anon(), "avaliacoes", "revLongComment"), avaliacaoValida({ comentario: "x".repeat(1001) })));
  });

  it("visitante não edita avaliação depois de enviar", async () => {
    await assertFails(updateDoc(doc(anon(), "avaliacoes", "revNew"), { comentario: "alterado" }));
  });

  it("visitante não exclui avaliação depois de enviar", async () => {
    await assertFails(deleteDoc(doc(anon(), "avaliacoes", "revNew")));
  });

  it("visitante lê somente avaliações publicadas", async () => {
    await assertSucceeds(getDoc(doc(anon(), "avaliacoes", "revPublished")));
    await assertFails(getDoc(doc(anon(), "avaliacoes", "revNew")));
    await assertFails(getDoc(doc(anon(), "avaliacoes", "revRejected")));
  });

  it("consulta pública filtrada retorna somente avaliações publicadas", async () => {
    const snap = await assertSucceeds(getDocs(query(
      collection(anon(), "avaliacoes"),
      where("criadoPor", "==", "ownerA"),
      where("status", "==", "publicada")
    )));
    assert.deepEqual(snap.docs.map((d) => d.id), ["revPublished"]);
  });

  it("consulta pública sem filtro de status não lista avaliações", async () => {
    await assertFails(getDocs(query(
      collection(anon(), "avaliacoes"),
      where("criadoPor", "==", "ownerA")
    )));
  });

  it("proprietário correto lê avaliações da própria loja", async () => {
    await assertSucceeds(getDoc(doc(authed("ownerA"), "avaliacoes", "revNew")));
  });

  it("outro proprietário não modera avaliação alheia", async () => {
    await assertFails(updateDoc(doc(authed("ownerB"), "avaliacoes", "revNew"), {
      status: "publicada",
      moderadoPor: "ownerB",
      moderadoEm: serverTimestamp()
    }));
  });

  it("proprietário correto modera somente campos permitidos", async () => {
    await assertSucceeds(updateDoc(doc(authed("ownerA"), "avaliacoes", "revNew"), {
      status: "publicada",
      moderadoPor: "ownerA",
      moderadoEm: serverTimestamp()
    }));
    await assertFails(updateDoc(doc(authed("ownerA"), "avaliacoes", "revRejected"), {
      status: "publicada",
      comentario: "reescrito",
      moderadoPor: "ownerA",
      moderadoEm: serverTimestamp()
    }));
  });
});

describe("cross-tenant leaks (P0)", () => {
  it("outra loja não lê métricas de vitrine alheias", async () => {
    await assertFails(getDoc(doc(authed("ownerB"), "metricas_vitrines", "ownerA")));
  });

  it("outra loja não lê métricas de produto alheias", async () => {
    await assertFails(getDoc(doc(authed("ownerB"), "metricas_produtos", "prodA")));
  });

  it("visitante anônimo não lê configuração de campanha", async () => {
    await assertFails(getDoc(doc(anon(), "campanhas", "ownerA")));
  });

  it("outra loja não lê configuração de campanha alheia", async () => {
    await assertFails(getDoc(doc(authed("ownerB"), "campanhas", "ownerA")));
  });

  it("dono e funcionário com permissão continuam lendo as próprias métricas/campanhas", async () => {
    await assertSucceeds(getDoc(doc(authed("ownerA"), "metricas_vitrines", "ownerA")));
    await assertSucceeds(getDoc(doc(authed("ownerA"), "metricas_produtos", "prodA")));
    await assertSucceeds(getDoc(doc(authed("ownerA"), "campanhas", "ownerA")));
  });
});

describe("config público vs. admin (login.html carrega tema antes de logar)", () => {
  it("visitante anônimo lê config/tema_sistema, mas não config/planos", async () => {
    await assertSucceeds(getDoc(doc(anon(), "config", "tema_sistema")));
    await assertFails(getDoc(doc(anon(), "config", "planos")));
  });

  it("visitante anônimo não escreve em config/tema_sistema", async () => {
    await assertFails(setDoc(doc(anon(), "config", "tema_sistema"), { primaria: "#000000" }));
  });
});

describe("notificacoes: list() filtrado (mesma query do dashboard-app.js)", () => {
  function notifQuery(db, uid) {
    return query(
      collection(db, "notificacoes"),
      or(
        where("destinatarios", "==", "todos"),
        where("destinatarios", "array-contains", uid),
        where("uid", "==", uid)
      )
    );
  }

  it("owner vê o broadcast e a notificação dirigida a ele, não a de outra loja", async () => {
    const snap = await getDocs(notifQuery(authed("ownerA"), "ownerA"));
    const ids = snap.docs.map((d) => d.id).sort();
    assert.deepEqual(ids, ["notifOwnerA", "notifTodos"]);
  });

  it("outra loja vê o broadcast, mas não a notificação alheia", async () => {
    const snap = await getDocs(notifQuery(authed("ownerB"), "ownerB"));
    const ids = snap.docs.map((d) => d.id).sort();
    assert.deepEqual(ids, ["notifOwnerB", "notifTodos"]);
  });

  it("admin lista tudo sem filtro (unchanged)", async () => {
    const snap = await getDocs(collection(authed("admin", { videAdmin: true }), "notificacoes"));
    assert.equal(snap.size, 3);
  });

  it("visitante anônimo não lista nada", async () => {
    await assertFails(getDocs(notifQuery(anon(), "ownerA")));
  });
});

describe("notificacoes: marcar como lida/não lida sem Cloud Function", () => {
  it("destinatário marca a própria notificação (broadcast) como lida", async () => {
    await assertSucceeds(updateDoc(doc(authed("ownerA"), "notificacoes", "notifTodos"), {
      lidoPor: arrayUnion("ownerA"),
      leituraAtualizadaEm: serverTimestamp()
    }));
    const snap = await getDoc(doc(authed("ownerA"), "notificacoes", "notifTodos"));
    assert.deepEqual(snap.data().lidoPor, ["ownerA"]);
  });

  it("destinatário desmarca a própria notificação depois de lida", async () => {
    await updateDoc(doc(authed("ownerA"), "notificacoes", "notifTodos"), { lidoPor: arrayUnion("ownerA") });
    await assertSucceeds(updateDoc(doc(authed("ownerA"), "notificacoes", "notifTodos"), {
      lidoPor: arrayRemove("ownerA"),
      leituraAtualizadaEm: serverTimestamp()
    }));
    const snap = await getDoc(doc(authed("ownerA"), "notificacoes", "notifTodos"));
    assert.deepEqual(snap.data().lidoPor ?? [], []);
  });

  it("não pode marcar o uid de outra pessoa como leitor", async () => {
    await assertFails(updateDoc(doc(authed("ownerA"), "notificacoes", "notifTodos"), {
      lidoPor: arrayUnion("ownerB")
    }));
  });

  it("não pode adicionar o próprio uid junto com o de outra pessoa na mesma escrita", async () => {
    await assertFails(setDoc(doc(authed("ownerA"), "notificacoes", "notifTodos"), {
      lidoPor: ["ownerA", "ownerB"]
    }, { merge: true }));
  });

  it("não pode tocar em outro campo além de lidoPor/leituraAtualizadaEm", async () => {
    await assertFails(updateDoc(doc(authed("ownerA"), "notificacoes", "notifTodos"), {
      lidoPor: arrayUnion("ownerA"),
      titulo: "Alterado"
    }));
  });

  it("quem não é destinatário não marca a notificação alheia como lida", async () => {
    await assertFails(updateDoc(doc(authed("ownerB"), "notificacoes", "notifOwnerA"), {
      lidoPor: arrayUnion("ownerB")
    }));
  });

  it("visitante anônimo não marca nada como lido", async () => {
    await assertFails(updateDoc(doc(anon(), "notificacoes", "notifTodos"), {
      lidoPor: arrayUnion("qualquer")
    }));
  });

  it("admin continua podendo editar a notificação livremente", async () => {
    await assertSucceeds(updateDoc(doc(authed("admin", { videAdmin: true }), "notificacoes", "notifTodos"), {
      titulo: "Editado pelo admin"
    }));
  });
});

describe("admin claims", () => {
  it("claim videAdmin permite atualizar status; sem claim bloqueia", async () => {
    await assertFails(updateDoc(doc(authed("ownerA"), "usuarios", "ownerB"), { status: "aprovado" }));
    await assertSucceeds(updateDoc(doc(authed("admin", { videAdmin: true }), "usuarios", "ownerB"), { status: "inativo" }));
  });
});

function conhecimentoValido(overrides = {}) {
  return {
    tenantId: "ownerA",
    lojaId: "ownerA",
    tipo: "faq",
    titulo: "Qual o prazo de entrega?",
    conteudo: "Enviamos em até 3 dias úteis.",
    resumo: "Prazo padrão.",
    tags: ["entrega"],
    prioridade: "normal",
    status: "ativo",
    ativo: true,
    criadoEm: serverTimestamp(),
    criadoPor: "ownerA",
    atualizadoEm: serverTimestamp(),
    atualizadoPor: "ownerA",
    ...overrides
  };
}

describe("base_conhecimento_ia: multi-tenant e validação", () => {
  it("dono cria item válido do próprio tenant", async () => {
    await assertSucceeds(setDoc(doc(authed("ownerA"), "base_conhecimento_ia", "kbOwnerA1"), conhecimentoValido()));
  });

  it("dono não cria item apontando para outro tenant", async () => {
    await assertFails(setDoc(doc(authed("ownerA"), "base_conhecimento_ia", "kbInvasao"), conhecimentoValido({
      tenantId: "ownerB",
      lojaId: "ownerB",
      criadoPor: "ownerA",
      atualizadoPor: "ownerA"
    })));
  });

  it("rejeita campos extras, enum inválido e conteúdo excessivo", async () => {
    await assertFails(setDoc(doc(authed("ownerA"), "base_conhecimento_ia", "kbExtra"), conhecimentoValido({ campoMalicioso: true })));
    await assertFails(setDoc(doc(authed("ownerA"), "base_conhecimento_ia", "kbEnum"), conhecimentoValido({ tipo: "outro" })));
    await assertFails(setDoc(doc(authed("ownerA"), "base_conhecimento_ia", "kbGrande"), conhecimentoValido({ conteudo: "x".repeat(8001) })));
  });

  it("rejeita timestamp manual e autoria falsa", async () => {
    await assertFails(setDoc(doc(authed("ownerA"), "base_conhecimento_ia", "kbTs"), conhecimentoValido({ criadoEm: new Date("2020-01-01") })));
    await assertFails(setDoc(doc(authed("ownerA"), "base_conhecimento_ia", "kbAutor"), conhecimentoValido({ criadoPor: "ownerB", atualizadoPor: "ownerB" })));
  });

  it("update preserva tenant/autoria; delete físico é bloqueado", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "base_conhecimento_ia", "kbFixo"), {
        ...conhecimentoValido(),
        criadoEm: new Date("2026-07-01T10:00:00.000Z"),
        atualizadoEm: new Date("2026-07-01T10:00:00.000Z")
      });
    });
    await assertSucceeds(setDoc(doc(authed("ownerA"), "base_conhecimento_ia", "kbFixo"), {
      ...conhecimentoValido(),
      criadoEm: new Date("2026-07-01T10:00:00.000Z"),
      titulo: "Prazo atualizado de entrega",
      status: "rascunho",
      ativo: false,
      atualizadoEm: serverTimestamp(),
      atualizadoPor: "ownerA"
    }));
    await assertFails(setDoc(doc(authed("ownerA"), "base_conhecimento_ia", "kbFixo"), {
      ...conhecimentoValido(),
      criadoEm: new Date("2026-07-01T10:00:00.000Z"),
      tenantId: "ownerB",
      lojaId: "ownerB"
    }));
    await assertFails(deleteDoc(doc(authed("ownerA"), "base_conhecimento_ia", "kbFixo")));
  });

  it("outro tenant, funcionário sem permissão e anônimo não leem", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "base_conhecimento_ia", "kbLeitura"), {
        ...conhecimentoValido(),
        criadoEm: new Date("2026-07-01T10:00:00.000Z"),
        atualizadoEm: new Date("2026-07-01T10:00:00.000Z")
      });
    });
    await assertSucceeds(getDoc(doc(authed("ownerA"), "base_conhecimento_ia", "kbLeitura")));
    await assertFails(getDoc(doc(authed("ownerB"), "base_conhecimento_ia", "kbLeitura")));
    await assertFails(getDoc(doc(authed("employeeRead"), "base_conhecimento_ia", "kbLeitura")));
    await assertFails(getDoc(doc(anon(), "base_conhecimento_ia", "kbLeitura")));
  });

  it("funcionário com permissão (inclusive alias) lê e edita; inativo não", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "funcionarios", "employeeKb"), {
        donoUID: "ownerA",
        status: "ativo",
        permissoes: { ver: ["base-conhecimento-ia"], editar: ["base-conhecimento-ia"] }
      });
      await setDoc(doc(db, "funcionarios", "employeeKbAlias"), {
        donoUID: "ownerA",
        status: "ativo",
        permissoes: { ver: ["conhecimento-ia"], editar: ["knowledge-base"] }
      });
      await setDoc(doc(db, "funcionarios", "employeeKbInativo"), {
        donoUID: "ownerA",
        status: "inativo",
        permissoes: { ver: ["base-conhecimento-ia"], editar: ["base-conhecimento-ia"] }
      });
      await setDoc(doc(db, "base_conhecimento_ia", "kbEquipe"), {
        ...conhecimentoValido(),
        criadoEm: new Date("2026-07-01T10:00:00.000Z"),
        atualizadoEm: new Date("2026-07-01T10:00:00.000Z")
      });
    });
    await assertSucceeds(getDoc(doc(authed("employeeKb"), "base_conhecimento_ia", "kbEquipe")));
    await assertSucceeds(getDoc(doc(authed("employeeKbAlias"), "base_conhecimento_ia", "kbEquipe")));
    await assertFails(getDoc(doc(authed("employeeKbInativo"), "base_conhecimento_ia", "kbEquipe")));
    await assertSucceeds(setDoc(doc(authed("employeeKb"), "base_conhecimento_ia", "kbNovoEquipe"), conhecimentoValido({
      criadoPor: "employeeKb",
      atualizadoPor: "employeeKb"
    })));
  });

  it("list() filtrado por tenant funciona; sem filtro não", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "base_conhecimento_ia", "kbListA"), {
        ...conhecimentoValido(),
        criadoEm: new Date("2026-07-01T10:00:00.000Z"),
        atualizadoEm: new Date("2026-07-01T10:00:00.000Z")
      });
    });
    await assertSucceeds(getDocs(query(
      collection(authed("ownerA"), "base_conhecimento_ia"),
      where("tenantId", "==", "ownerA")
    )));
    await assertFails(getDocs(collection(authed("ownerA"), "base_conhecimento_ia")));
  });
});

function funcionarioValido(overrides = {}) {
  return {
    donoUID: "ownerA",
    nome: "Novo Funcionário",
    email: "novo@local.test",
    cargo: "Atendimento",
    status: "ativo",
    senhaTemporaria: true,
    permissoes: { ver: ["produtos"], editar: [] },
    criadoEm: serverTimestamp(),
    criadoPorAuthUid: "ownerA",
    ...overrides
  };
}

describe("funcionarios: gestão direta pelo dono (Spark)", () => {
  it("dono cria funcionário válido do próprio tenant", async () => {
    await assertSucceeds(setDoc(doc(authed("ownerA"), "funcionarios", "novoEmp1"), funcionarioValido()));
  });

  it("dono não cria funcionário apontando para outro tenant nem para si mesmo", async () => {
    await assertFails(setDoc(doc(authed("ownerA"), "funcionarios", "novoEmp2"), funcionarioValido({ donoUID: "ownerB" })));
    await assertFails(setDoc(doc(authed("ownerA"), "funcionarios", "ownerA"), funcionarioValido()));
  });

  it("rejeita status inicial diferente de ativo, campos extras e timestamp manual", async () => {
    await assertFails(setDoc(doc(authed("ownerA"), "funcionarios", "novoEmp3"), funcionarioValido({ status: "inativo" })));
    await assertFails(setDoc(doc(authed("ownerA"), "funcionarios", "novoEmp4"), funcionarioValido({ admin: true })));
    await assertFails(setDoc(doc(authed("ownerA"), "funcionarios", "novoEmp5"), funcionarioValido({ criadoEm: new Date("2020-01-01") })));
  });

  it("dono atualiza permissões/status; não muda o donoUID", async () => {
    await assertSucceeds(updateDoc(doc(authed("ownerA"), "funcionarios", "employeeRead"), {
      nome: "Leitor Renomeado",
      cargo: "Suporte",
      permissoes: { ver: ["produtos", "leads"], editar: [] },
      atualizadoEm: serverTimestamp(),
      atualizadoPorAuthUid: "ownerA"
    }));
    await assertSucceeds(updateDoc(doc(authed("ownerA"), "funcionarios", "employeeRead"), {
      status: "inativo",
      atualizadoEm: serverTimestamp(),
      atualizadoPorAuthUid: "ownerA"
    }));
    await assertFails(updateDoc(doc(authed("ownerA"), "funcionarios", "employeeRead"), {
      donoUID: "ownerB"
    }));
  });

  it("funcionário (mesmo com edição de funcionarios) e outro dono não gerenciam", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "funcionarios", "employeeGestor"), {
        donoUID: "ownerA",
        status: "ativo",
        permissoes: { ver: ["funcionarios"], editar: ["funcionarios"] }
      });
    });
    await assertFails(updateDoc(doc(authed("employeeGestor"), "funcionarios", "employeeRead"), {
      permissoes: { ver: ["produtos"], editar: ["produtos"] }
    }));
    await assertFails(updateDoc(doc(authed("ownerB"), "funcionarios", "employeeRead"), {
      status: "inativo",
      atualizadoEm: serverTimestamp(),
      atualizadoPorAuthUid: "ownerB"
    }));
    await assertFails(setDoc(doc(authed("employeeGestor"), "funcionarios", "novoDoGestor"), funcionarioValido({ criadoPorAuthUid: "employeeGestor" })));
  });

  it("funcionário não reativa a si mesmo nem edita as próprias permissões; delete bloqueado", async () => {
    await assertFails(updateDoc(doc(authed("employeeRead"), "funcionarios", "employeeRead"), {
      permissoes: { ver: ["produtos"], editar: ["produtos"] }
    }));
    await assertFails(deleteDoc(doc(authed("ownerA"), "funcionarios", "employeeRead")));
  });
});
