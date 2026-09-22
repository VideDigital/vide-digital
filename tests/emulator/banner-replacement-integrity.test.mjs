// BANNERS-ATOMIC-REPLACEMENT-INTEGRITY-001 — B1.
//
// banners_loja: banners principais da LOJA pública (não confundir com
// carrossel_banners, de Landing Pages/Studio). O fluxo de substituição
// (executarSalvamento(), dashboard-app.js) fazia: consultar os banners
// existentes do tenant, apagar todos, e SÓ DEPOIS criar o novo
// conjunto — duas fases sem relação atômica. Se a segunda fase falhasse
// no meio, o conjunto antigo já tinha sido apagado e o novo ficava
// parcial ou ausente: uma FALHA de salvamento podia, na prática, deixar
// a loja pública sem banner nenhum, mesmo o dono nunca tendo escolhido
// remover todos.
//
// Este arquivo primeiro REPRODUZ esse comportamento (BASELINE
// REPRODUCED) com uma cópia fiel da sequência antiga, e depois cobre a
// correção real (substituirBannersLoja(), banner-replacement-core.js —
// delete+set num único writeBatch, um único commit()) contra o
// comportamento exigido: sucesso leva ao conjunto novo completo, e
// qualquer falha (antes ou durante a persistência) deixa o conjunto
// antigo intacto — nunca vazio, nunca parcial, nunca misturado.
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
  query,
  setDoc,
  where,
  writeBatch
} from "firebase/firestore";
import { idBannerLoja, substituirBannersLoja } from "../../banner-replacement-core.js";

const PROJECT_ID = "demo-vide-hub-banners";
let testEnv;

function bannersDe(snap) {
  return snap.docs
    .map(d => d.data())
    .sort((a, b) => a.ordem - b.ordem);
}

async function listarBanners(db, donoUID) {
  const snap = await getDocs(query(collection(db, "banners_loja"), where("donoUID", "==", donoUID)));
  return bannersDe(snap);
}

// Cópia fiel da sequência antiga (dashboard-app.js, antes desta
// correção): consulta → apaga tudo → SÓ DEPOIS recria. Existe aqui só
// pra provar, de forma determinística, que ela perde dados sob falha —
// nunca é usada pelo produto.
async function substituirBannersLojaVulneravel(db, donoUID, listaBanners, { falharNoIndex } = {}) {
  const snapAntigos = await getDocs(query(collection(db, "banners_loja"), where("donoUID", "==", donoUID)));
  await Promise.all(snapAntigos.docs.map(d => deleteDoc(doc(db, "banners_loja", d.id))));
  await Promise.all(listaBanners.map((imagemB64, index) => {
    if (falharNoIndex === index) throw new Error("falha simulada de rede/quota no meio da recriação");
    return setDoc(doc(db, "banners_loja", `banner_${donoUID}_${index}`), { donoUID, imagemB64, ordem: index });
  }));
}

describe("BANNERS-ATOMIC-REPLACEMENT-INTEGRITY-001: baseline (código vulnerável antigo)", () => {
  it("BASELINE REPRODUCED — falha na recriação apaga o conjunto antigo sem deixar o novo completo", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "banners_loja", "banner_ownerA_0"), { donoUID: "ownerA", imagemB64: "A", ordem: 0 });
      await setDoc(doc(db, "banners_loja", "banner_ownerA_1"), { donoUID: "ownerA", imagemB64: "B", ordem: 1 });

      await assert.rejects(
        substituirBannersLojaVulneravel(db, "ownerA", ["C", "D"], { falharNoIndex: 1 }),
        /falha simulada/
      );

      const restantes = await listarBanners(db, "ownerA");
      // O bug real: nem A/B (apagados antes) nem C/D completos (a
      // criação de D falhou) — o conjunto final é parcial/vazio.
      assert.notDeepEqual(restantes.map(b => b.imagemB64).sort(), ["A", "B"].sort());
      assert.ok(restantes.length < 2, `esperado conjunto perdido/parcial, achou ${JSON.stringify(restantes)}`);
    });
  });
});

describe("BANNERS-ATOMIC-REPLACEMENT-INTEGRITY-001: substituirBannersLoja (correção atômica)", () => {
  const sdk = { collection, query, where, getDocs, doc, writeBatch };

  it("1) substituição normal A+B → C+D com sucesso", async () => {
    const db = testEnv.authenticatedContext("ownerA").firestore();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "banners_loja", "banner_ownerA_0"), { donoUID: "ownerA", imagemB64: "A", ordem: 0 });
      await setDoc(doc(context.firestore(), "banners_loja", "banner_ownerA_1"), { donoUID: "ownerA", imagemB64: "B", ordem: 1 });
    });

    await substituirBannersLoja({ db, sdk, donoUID: "ownerA", listaBanners: ["C", "D"] });

    const finais = await listarBanners(db, "ownerA");
    assert.deepEqual(finais.map(b => b.imagemB64), ["C", "D"]);
  });

  it("2) falha antes da persistência (erro ao montar o batch): A+B permanecem intactos, nada é enviado", async () => {
    const db = testEnv.authenticatedContext("ownerA").firestore();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "banners_loja", "banner_ownerA_0"), { donoUID: "ownerA", imagemB64: "A", ordem: 0 });
      await setDoc(doc(context.firestore(), "banners_loja", "banner_ownerA_1"), { donoUID: "ownerA", imagemB64: "B", ordem: 1 });
    });

    const sdkQueBrigaNoSegundoDoc = {
      ...sdk,
      doc: (...args) => {
        // Simula uma falha síncrona ao montar o batch (antes de
        // commit() existir) — nenhuma chamada de rede pode ter
        // acontecido ainda nesse ponto.
        if (args[2] === idBannerLoja("ownerA", 1)) throw new Error("falha simulada de preparação");
        return doc(...args);
      }
    };

    await assert.rejects(
      substituirBannersLoja({ db, sdk: sdkQueBrigaNoSegundoDoc, donoUID: "ownerA", listaBanners: ["C", "D"] }),
      /falha simulada de preparação/
    );

    const finais = await listarBanners(db, "ownerA");
    assert.deepEqual(finais.map(b => b.imagemB64).sort(), ["A", "B"]);
  });

  it("3+4) falha do commit (Rules rejeita) não gera falso sucesso: A+B permanecem, C/D não existem", async () => {
    const db = testEnv.authenticatedContext("ownerA").firestore();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "banners_loja", "banner_ownerA_0"), { donoUID: "ownerA", imagemB64: "A", ordem: 0 });
      await setDoc(doc(context.firestore(), "banners_loja", "banner_ownerA_1"), { donoUID: "ownerA", imagemB64: "B", ordem: 1 });
    });

    // Um dos dois novos banners tenta gravar com donoUID diferente do
    // dono autenticado — Rules recusa o commit INTEIRO (um batch é
    // validado como uma unidade), simulando uma falha real de
    // persistência no meio do novo conjunto.
    const sdkComPayloadInvalido = {
      ...sdk,
      writeBatch: (dbArg) => {
        const batch = writeBatch(dbArg);
        const originalSet = batch.set.bind(batch);
        batch.set = (ref, data) => originalSet(ref, ref.id === idBannerLoja("ownerA", 1) ? { ...data, donoUID: "ownerB" } : data);
        return batch;
      }
    };

    await assert.rejects(
      substituirBannersLoja({ db, sdk: sdkComPayloadInvalido, donoUID: "ownerA", listaBanners: ["C", "D"] })
    );

    const finais = await listarBanners(db, "ownerA");
    assert.deepEqual(finais.map(b => b.imagemB64).sort(), ["A", "B"], "falha do commit não pode ter apagado A/B nem criado C/D parcialmente");
  });

  it("5) zero banners intencional continua funcionando (esvaziar a galeria)", async () => {
    const db = testEnv.authenticatedContext("ownerA").firestore();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "banners_loja", "banner_ownerA_0"), { donoUID: "ownerA", imagemB64: "A", ordem: 0 });
    });

    await substituirBannersLoja({ db, sdk, donoUID: "ownerA", listaBanners: [] });

    assert.deepEqual(await listarBanners(db, "ownerA"), []);
  });

  it("6) retry após falha funciona sem duplicata", async () => {
    const db = testEnv.authenticatedContext("ownerA").firestore();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "banners_loja", "banner_ownerA_0"), { donoUID: "ownerA", imagemB64: "A", ordem: 0 });
    });

    const sdkQueBrigaUmaVez = {
      ...sdk,
      doc: (...args) => {
        if (args[2] === idBannerLoja("ownerA", 1)) throw new Error("falha simulada só na 1a tentativa");
        return doc(...args);
      }
    };
    await assert.rejects(substituirBannersLoja({ db, sdk: sdkQueBrigaUmaVez, donoUID: "ownerA", listaBanners: ["C", "D"] }));
    assert.deepEqual((await listarBanners(db, "ownerA")).map(b => b.imagemB64), ["A"]);

    // 2a tentativa: mesmo sdk real, mesma chamada — sem retry especial.
    await substituirBannersLoja({ db, sdk, donoUID: "ownerA", listaBanners: ["C", "D"] });

    const finais = await listarBanners(db, "ownerA");
    assert.deepEqual(finais.map(b => b.imagemB64), ["C", "D"]);
    assert.equal(finais.length, 2, "retry não pode duplicar documentos");
  });

  it("7) duas chamadas quase simultâneas (double-click) com o mesmo conjunto novo não corrompem nem duplicam", async () => {
    const db = testEnv.authenticatedContext("ownerA").firestore();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "banners_loja", "banner_ownerA_0"), { donoUID: "ownerA", imagemB64: "A", ordem: 0 });
      await setDoc(doc(context.firestore(), "banners_loja", "banner_ownerA_1"), { donoUID: "ownerA", imagemB64: "B", ordem: 1 });
    });

    await Promise.all([
      substituirBannersLoja({ db, sdk, donoUID: "ownerA", listaBanners: ["C", "D"] }),
      substituirBannersLoja({ db, sdk, donoUID: "ownerA", listaBanners: ["C", "D"] })
    ]);

    const finais = await listarBanners(db, "ownerA");
    assert.deepEqual(finais.map(b => b.imagemB64), ["C", "D"], "resultado final precisa ser exatamente o conjunto novo, sem mistura nem sobra do antigo");
    assert.equal(finais.length, 2, "concorrência local não pode duplicar documentos (IDs são determinísticos por índice)");
  });

  it("8) cross-tenant: substituir banners de B nunca altera/apaga banners de A", async () => {
    const dbA = testEnv.authenticatedContext("ownerA").firestore();
    const dbB = testEnv.authenticatedContext("ownerB").firestore();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "banners_loja", "banner_ownerA_0"), { donoUID: "ownerA", imagemB64: "A", ordem: 0 });
      await setDoc(doc(context.firestore(), "banners_loja", "banner_ownerB_0"), { donoUID: "ownerB", imagemB64: "X", ordem: 0 });
    });

    await substituirBannersLoja({ db: dbB, sdk, donoUID: "ownerB", listaBanners: ["Y", "Z"] });

    assert.deepEqual((await listarBanners(dbA, "ownerA")).map(b => b.imagemB64), ["A"], "banners de A não podem ter sido tocados pela substituição de B");
    assert.deepEqual((await listarBanners(dbA, "ownerB")).map(b => b.imagemB64), ["Y", "Z"]);

    // Prova adicional, ao nível de Rules: B não consegue gravar nem
    // apagar diretamente um documento de A.
    await assertFails(setDoc(doc(dbB, "banners_loja", "banner_ownerA_0"), { donoUID: "ownerA", imagemB64: "hack", ordem: 0 }));
    await assertFails(deleteDoc(doc(dbB, "banners_loja", "banner_ownerA_0")));
  });

  it("9) ordem final corresponde exatamente ao índice de cada banner", async () => {
    const db = testEnv.authenticatedContext("ownerA").firestore();
    await substituirBannersLoja({ db, sdk, donoUID: "ownerA", listaBanners: ["X", "Y", "Z"] });

    const snap = await getDocs(query(collection(db, "banners_loja"), where("donoUID", "==", "ownerA")));
    const porImagem = Object.fromEntries(snap.docs.map(d => [d.data().imagemB64, d.data().ordem]));
    assert.deepEqual(porImagem, { X: 0, Y: 1, Z: 2 });
  });

  it("10) banner legado (ID fora do padrão banner_${uid}_${index}) é encontrado e substituído normalmente", async () => {
    const db = testEnv.authenticatedContext("ownerA").firestore();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      // ID antigo/arbitrário — a consulta é por donoUID, não por
      // prefixo de ID, então precisa continuar encontrando isso.
      await setDoc(doc(context.firestore(), "banners_loja", "legacy-banner-xyz"), { donoUID: "ownerA", imagemB64: "LEGADO" });
    });

    await substituirBannersLoja({ db, sdk, donoUID: "ownerA", listaBanners: ["C"] });

    const finais = await listarBanners(db, "ownerA");
    assert.deepEqual(finais.map(b => b.imagemB64), ["C"]);
    assert.equal((await getDoc(doc(db, "banners_loja", "legacy-banner-xyz"))).exists(), false, "o documento legado precisa ter sido removido junto com o resto do conjunto antigo");
  });
});

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
});

after(async () => {
  await testEnv.cleanup();
});
