// Substituição atômica dos banners principais da loja (coleção
// banners_loja) — extraído pra permitir testes reais contra o Firestore
// Emulator (mesmo padrão de lead-engine-core.js/catalogo-produtos-core.js/
// lead-attempt-token-core.js).
//
// BANNERS-ATOMIC-REPLACEMENT-INTEGRITY-001: o fluxo anterior (ainda
// dentro de executarSalvamento(), em dashboard-app.js) consultava os
// banners existentes, apagava todos (Promise.all de deleteDoc) e só
// DEPOIS criava o novo conjunto (Promise.all de setDoc) — duas fases
// sem relação atômica entre si. Se a segunda fase falhasse no meio
// (rede, quota, payload grande demais, Rules), o conjunto antigo já
// tinha sido apagado e o novo ficava parcial: a loja perdia banners sem
// o dono nunca ter escolhido isso.
//
// Corrigido reunindo delete+set num ÚNICO writeBatch: nada é enviado ao
// servidor até commit(), e commit() é tudo-ou-nada — se falhar (rede,
// Rules, payload), o servidor nunca viu nenhuma das mutações, e o
// conjunto antigo continua exatamente como estava. IDs são sempre
// derivados de donoUID (nunca de valor arbitrário vindo da UI) e a
// consulta que localiza o conjunto antigo é sempre filtrada por
// donoUID — nunca toca banners de outro tenant, e também limpa banners
// legados cujo ID não segue o padrão banner_${donoUID}_${index} (a
// consulta é por campo, não por prefixo de ID).
export function idBannerLoja(donoUID, index) {
    return `banner_${donoUID}_${index}`;
}

export async function substituirBannersLoja({ db, sdk, donoUID, listaBanners }) {
    const { collection, query, where, getDocs, doc, writeBatch } = sdk;

    const snapAntigos = await getDocs(query(collection(db, "banners_loja"), where("donoUID", "==", donoUID)));

    const batch = writeBatch(db);
    for (const docAntigo of snapAntigos.docs) {
        batch.delete(doc(db, "banners_loja", docAntigo.id));
    }
    listaBanners.forEach((imagemB64, index) => {
        batch.set(doc(db, "banners_loja", idBannerLoja(donoUID, index)), {
            donoUID,
            imagemB64,
            ordem: index
        });
    });

    await batch.commit();
}
