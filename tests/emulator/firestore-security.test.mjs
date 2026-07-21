import assert from "node:assert/strict";
import fs from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from "@firebase/rules-unit-testing";
import {
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

describe("admin claims", () => {
  it("claim videAdmin permite atualizar status; sem claim bloqueia", async () => {
    await assertFails(updateDoc(doc(authed("ownerA"), "usuarios", "ownerB"), { status: "aprovado" }));
    await assertSucceeds(updateDoc(doc(authed("admin", { videAdmin: true }), "usuarios", "ownerB"), { status: "inativo" }));
  });
});
