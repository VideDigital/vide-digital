// Achado real em produção: publicar uma Landing Page em modo Livre falhava
// no primeiro bloco com "Missing or insufficient permissions." — Rules
// (publicLandingBlockFields()) não incluíam a geometria do modo Livre
// (x/y/largura/altura/zIndex/design). O fluxo de publicação também não era
// atômico: documento privado marcado publicado:true, documento público
// criado, e só parte (ou nenhum) dos blocos públicos — estado inconsistente
// real, limpo manualmente em produção antes desta correção.
//
// Este teste atravessa o caminho REAL de publicação (window.alternarPublicacaoLP,
// função exposta por dashboard-app.js, não reimplementada aqui) contra o
// Firestore Emulator real, com Rules reais — sem mock de Firestore/Rules.
import assert from "node:assert/strict";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
    captureDiagnostics,
    coletarErrosConsole,
    ehErroDeRedeExterno,
    launchBrowser,
    loginReal,
    startStaticServer
} from "./_helpers.mjs";

const PROJECT_ID = "demo-vide-hub";
const STORE_UID = "owner-pro";
const STORE_SLUG = "loja-pro-local";
const SUFIXO = Date.now();
const LP_ID = `lp_test_livre_${SUFIXO}`;
const LP_SLUG = `lp-livre-qa-${SUFIXO}`;
const DOC_ID_PUBLICO = `${STORE_SLUG}__${LP_SLUG}`.toLowerCase();

function adminDb() {
    if (!getApps().length) {
        initializeApp({ projectId: PROJECT_ID });
    }
    return getFirestore();
}

function blocoLivre(id, overrides = {}) {
    return {
        id,
        lpId: LP_ID,
        donoUID: STORE_UID,
        tipo: "texto_midia",
        paginaId: null,
        visivel: true,
        props: { titulo: `Bloco ${id}`, subtitulo: "Descrição real" },
        design: { corFundo: "#0f172a", corTexto: "#fff" },
        x: 20,
        y: 40,
        largura: 600,
        altura: 220,
        zIndex: 1,
        ...overrides
    };
}

async function seedLandingPageLivre(db, blocos) {
    await db.collection("landing_pages").doc(LP_ID).set({
        donoUID: STORE_UID,
        titulo: "LP Livre QA",
        pagina: LP_SLUG,
        publicado: false,
        modoLayout: "livre",
        paginas: [],
        ordemBlocos: blocos.map((b) => b.id),
        criadoEm: Date.now(),
        atualizadoEm: Date.now()
    });
    for (const bloco of blocos) {
        const { id, ...dados } = bloco;
        await db.collection("landing_pages_blocos").doc(id).set(dados);
    }
}

async function limparEstado(db, blocos) {
    await db.collection("landing_pages").doc(LP_ID).delete().catch(() => {});
    await db.collection("landing_pages_publicas").doc(DOC_ID_PUBLICO).delete().catch(() => {});
    for (const bloco of blocos) {
        await db.collection("landing_pages_blocos").doc(bloco.id).delete().catch(() => {});
        await db.collection("landing_pages_blocos_publicas").doc(bloco.id).delete().catch(() => {});
    }
}

// ============================================================
// Cenários da revisão da PR #57 (achados 1 a 4): salvarEditorLP() /
// publicarEditorLP() / alternarPublicacaoLP() agora devolvem sempre
// { ok, motivo? } — nenhuma das três pode deixar o Firestore e o estado
// local (lpEditorPublicado/badge/botão) incoerentes entre si numa falha.
// ============================================================

async function seedLpPublicada(db, { lpId, slug, blocos, modoLayout = "livre", titulo = "LP QA publicada" }) {
    const docIdPublico = `${STORE_SLUG}__${slug}`.toLowerCase();
    const ordemBlocos = blocos.map((b) => b.id);
    await db.collection("landing_pages").doc(lpId).set({
        donoUID: STORE_UID, titulo, pagina: slug, publicado: true,
        modoLayout, paginas: [], ordemBlocos,
        criadoEm: Date.now(), atualizadoEm: Date.now()
    });
    await db.collection("landing_pages_publicas").doc(docIdPublico).set({
        titulo, publicado: true, donoUID: STORE_UID, modoLayout, paginas: [], ordemBlocos
    });
    for (const bloco of blocos) {
        const { id, ...dados } = bloco;
        await db.collection("landing_pages_blocos").doc(id).set(dados);
        await db.collection("landing_pages_blocos_publicas").doc(id).set({ ...dados, donoUID: STORE_UID });
    }
    return docIdPublico;
}

async function limparLp(db, { lpId, slugs = [], blocos = [] }) {
    await db.collection("landing_pages").doc(lpId).delete().catch(() => {});
    for (const slug of slugs) {
        const docId = `${STORE_SLUG}__${slug}`.toLowerCase();
        await db.collection("landing_pages_publicas").doc(docId).delete().catch(() => {});
    }
    for (const bloco of blocos) {
        const id = bloco.id || bloco;
        await db.collection("landing_pages_blocos").doc(id).delete().catch(() => {});
        await db.collection("landing_pages_blocos_publicas").doc(id).delete().catch(() => {});
    }
}

async function main() {
    const { baseUrl, close } = await startStaticServer();
    const browser = await launchBrowser();
    let falhou = false;
    const db = adminDb();

    const blocosValidos = [
        blocoLivre(`${LP_ID}_b1`, { x: 20, y: 40, tipo: "texto_midia" }),
        blocoLivre(`${LP_ID}_b2`, { x: 40, y: 260, largura: 500, altura: 180, zIndex: 2, tipo: "faq" }),
        blocoLivre(`${LP_ID}_b3`, { x: 60, y: 500, largura: 400, altura: 150, zIndex: 3, tipo: "texto_rico" }),
        blocoLivre(`${LP_ID}_b4`, { x: null, y: null, largura: null, altura: null, zIndex: null, tipo: "rodape" })
    ];

    const contexto = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await contexto.newPage();
    const erros = coletarErrosConsole(page);

    try {
        await seedLandingPageLivre(db, blocosValidos);

        await loginReal(page, baseUrl, { email: "owner.pro@local.test", senha: "Local123!pro" });

        // loginReal() só garante que VideHubContext terminou de inicializar
        // (window.__videHubContextInitialized) — slugAtualSalvo, a variável
        // que alternarPublicacaoLP() usa pra montar o docId público
        // (`${slugAtualSalvo}__${lp.pagina}`), é atribuída bem depois, numa
        // etapa assíncrona posterior do mesmo callback onAuthStateChanged
        // (carregamento completo do perfil da loja). Achado real deste
        // teste: #url-loja-preview é escrito duas vezes, de forma
        // independente — uma leitura rápida do plano do usuário escreve o
        // mesmo texto ANTES de slugAtualSalvo ser atribuído de verdade —
        // então o texto do DOM sozinho não é um sinal confiável.
        // window.__videSlugAtualSalvo() (dashboard-app.js) expõe o valor
        // real da variável, sem ambiguidade.
        await page.waitForFunction(
            (slug) => window.__videSlugAtualSalvo?.() === slug,
            STORE_SLUG,
            { timeout: 20000 }
        );

        // ===== Publicar: precisa ser atômico e usar o contrato corrigido =====
        const resultadoEvaluate = await page.evaluate(
            async (lpId) => {
                try {
                    await window.alternarPublicacaoLP(lpId, true);
                    return { ok: true };
                } catch (erro) {
                    return { ok: false, mensagem: String(erro?.message || erro) };
                }
            },
            LP_ID
        );
        console.log("landing-page-publication.flow: resultado do evaluate (publicar):", JSON.stringify(resultadoEvaluate));

        const privadaAposPublicar = await db.collection("landing_pages").doc(LP_ID).get();
        console.log("landing-page-publication.flow: landing_pages/" + LP_ID + " após publicar:", JSON.stringify(privadaAposPublicar.data()));

        const todosPublicos = await db.collection("landing_pages_publicas").listDocuments();
        console.log("landing-page-publication.flow: ids em landing_pages_publicas:", JSON.stringify(todosPublicos.map((d) => d.id)));
        console.log("landing-page-publication.flow: DOC_ID_PUBLICO esperado:", DOC_ID_PUBLICO);

        assert.equal(privadaAposPublicar.data()?.publicado, true, "LP privada deveria ficar marcada como publicada");

        const publicaSnap = await db.collection("landing_pages_publicas").doc(DOC_ID_PUBLICO).get();
        assert.equal(publicaSnap.exists, true, "Documento público da LP deveria existir");
        assert.equal(publicaSnap.data().modoLayout, "livre", "modoLayout deveria ser preservado");
        assert.equal(publicaSnap.data().donoUID, STORE_UID);
        assert.deepEqual(
            [...publicaSnap.data().ordemBlocos].sort(),
            blocosValidos.map((b) => b.id).sort(),
            "ordemBlocos pública deveria conter todos os blocos"
        );

        for (const bloco of blocosValidos) {
            const blocoPublicoSnap = await db.collection("landing_pages_blocos_publicas").doc(bloco.id).get();
            assert.equal(blocoPublicoSnap.exists, true, `Bloco público ${bloco.id} deveria existir — TODOS os blocos precisam ser publicados atomicamente`);
            const dados = blocoPublicoSnap.data();
            assert.equal(dados.x, bloco.x, `x do bloco ${bloco.id} deveria ser preservado`);
            assert.equal(dados.y, bloco.y, `y do bloco ${bloco.id} deveria ser preservado`);
            assert.equal(dados.largura, bloco.largura, `largura do bloco ${bloco.id} deveria ser preservada`);
            assert.equal(dados.altura, bloco.altura, `altura do bloco ${bloco.id} deveria ser preservada`);
            assert.equal(dados.zIndex, bloco.zIndex, `zIndex do bloco ${bloco.id} deveria ser preservado`);
            assert.deepEqual(dados.design, bloco.design, `design do bloco ${bloco.id} deveria ser preservado`);
            assert.equal(dados.donoUID, STORE_UID);
        }

        console.log("landing-page-publication.flow: publicação em modo Livre OK — todos os blocos, geometria e design preservados.");

        // ===== Despublicar: não pode deixar órfão nenhum =====
        await page.evaluate(
            (lpId) => window.alternarPublicacaoLP(lpId, false),
            LP_ID
        );

        const privadaAposDespublicar = await db.collection("landing_pages").doc(LP_ID).get();
        assert.equal(privadaAposDespublicar.data()?.publicado, false, "LP privada deveria voltar a rascunho");

        const publicaAposDespublicar = await db.collection("landing_pages_publicas").doc(DOC_ID_PUBLICO).get();
        assert.equal(publicaAposDespublicar.exists, false, "Documento público não deveria sobrar após despublicar");

        for (const bloco of blocosValidos) {
            const blocoSnap = await db.collection("landing_pages_blocos_publicas").doc(bloco.id).get();
            assert.equal(blocoSnap.exists, false, `Bloco público ${bloco.id} não deveria sobrar (órfão) após despublicar`);
        }

        console.log("landing-page-publication.flow: despublicação OK — nenhum documento/bloco público órfão.");

        // ===== Consistência em falha: um bloco inválido não pode deixar
        // publicação parcial (nem sequer o documento público, nem os
        // outros blocos válidos, nem o status privado). =====
        const blocoInvalido = blocoLivre(`${LP_ID}_bad`, { tipo: "texto_midia" });
        blocoInvalido.campoNaoPermitido = "isto nunca deveria ser aceito";
        const blocosComInvalido = [...blocosValidos, blocoInvalido];
        await seedLandingPageLivre(db, blocosComInvalido);

        let falhouComoEsperado = false;
        try {
            await page.evaluate(
                (lpId) => window.alternarPublicacaoLP(lpId, true),
                LP_ID
            );
        } catch (erroPagina) {
            falhouComoEsperado = true;
        }

        // alternarPublicacaoLP captura o erro internamente (mostra toast),
        // então page.evaluate normalmente resolve sem lançar — a prova real
        // de "não publicou nada" é o estado no Firestore, não a exceção.
        const privadaAposFalha = await db.collection("landing_pages").doc(LP_ID).get();
        assert.equal(privadaAposFalha.data()?.publicado, false, "LP privada NÃO deveria ficar marcada como publicada se qualquer bloco do lote for rejeitado");

        const publicaAposFalha = await db.collection("landing_pages_publicas").doc(DOC_ID_PUBLICO).get();
        assert.equal(publicaAposFalha.exists, false, "Documento público NÃO deveria existir — o lote inteiro precisa ser rejeitado atomicamente");

        for (const bloco of blocosComInvalido) {
            const blocoSnap = await db.collection("landing_pages_blocos_publicas").doc(bloco.id).get();
            assert.equal(blocoSnap.exists, false, `Bloco público ${bloco.id} NÃO deveria existir — nem os blocos válidos do mesmo lote podem ficar persistidos`);
        }

        console.log(`landing-page-publication.flow: consistência em falha OK (evaluate throw=${falhouComoEsperado}) — lote inteiro rejeitado, nenhum estado parcial.`);

        await limparEstado(db, blocosComInvalido);

        // ===== Cenário 1: fluxo REAL do botão — window.publicarEditorLP(),
        // não só alternarPublicacaoLP — precisa manter o estado local
        // coerente com o Firestore quando a publicação falha. =====
        {
            const lpId = `lp_test_s1_${SUFIXO}`;
            const slug = `lp-qa-s1-${SUFIXO}`;
            const blocosS1 = [
                blocoLivre(`${lpId}_b1`, { lpId, x: 10, y: 10 }),
                blocoLivre(`${lpId}_b2`, { lpId, x: 20, y: 20, tipo: "faq" }),
                // Geometria inválida (x precisa ser number|null) só é barrada
                // pelas Rules na cópia PÚBLICA — a privada aceita qualquer
                // tipo. Isso força salvarEditorLP() (ramo ainda-não-publicada,
                // sem validação de tipo) a suceder e alternarPublicacaoLP()
                // (que copia os dados privados pro lote público) a falhar —
                // exatamente o ponto que Achado 1 corrigiu.
                blocoLivre(`${lpId}_bad`, { lpId, x: "invalido", tipo: "texto_midia" })
            ];
            try {
                await db.collection("landing_pages").doc(lpId).set({
                    donoUID: STORE_UID, titulo: "LP QA S1", pagina: slug, publicado: false,
                    modoLayout: "livre", paginas: [], ordemBlocos: blocosS1.map((b) => b.id),
                    criadoEm: Date.now(), atualizadoEm: Date.now()
                });
                for (const bloco of blocosS1) {
                    const { id, ...dados } = bloco;
                    await db.collection("landing_pages_blocos").doc(id).set(dados);
                }

                const resultado = await page.evaluate(async (lpId) => {
                    await window.editarLP(lpId);
                    const publicadoAntes = window.__videLpEditorPublicado?.();
                    const resultadoPublicar = await window.publicarEditorLP();
                    const badge = document.getElementById("lped-status-badge");
                    const botao = document.getElementById("lped-btn-publicar");
                    return {
                        publicadoAntes,
                        resultadoPublicar,
                        publicadoDepois: window.__videLpEditorPublicado?.(),
                        badgeTexto: badge ? badge.innerText : null,
                        botaoTexto: botao ? botao.innerText : null
                    };
                }, lpId);
                console.log("landing-page-publication.flow: cenário 1 (publicarEditorLP com falha):", JSON.stringify(resultado));

                assert.equal(resultado.publicadoAntes, false, "LP deveria começar como rascunho");
                assert.equal(resultado.resultadoPublicar?.ok, false, "publicarEditorLP() deveria reportar falha explicitamente, não esconder o erro");
                assert.equal(resultado.publicadoDepois, false, "lpEditorPublicado NÃO poderia virar true numa publicação que falhou");
                assert.match(resultado.badgeTexto || "", /rascunho/i, "badge deveria continuar RASCUNHO após falha");
                assert.match(resultado.botaoTexto || "", /publicar/i, "botão deveria continuar oferecendo Publicar (não Despublicar) após falha");

                const privadoS1 = await db.collection("landing_pages").doc(lpId).get();
                assert.equal(privadoS1.data()?.publicado, false, "Firestore privado NÃO deveria marcar publicado:true numa operação que falhou");

                const docIdPublicoS1 = `${STORE_SLUG}__${slug}`.toLowerCase();
                const publicoS1 = await db.collection("landing_pages_publicas").doc(docIdPublicoS1).get();
                assert.equal(publicoS1.exists, false, "Documento público NÃO deveria existir");

                for (const bloco of blocosS1) {
                    const blocoPublico = await db.collection("landing_pages_blocos_publicas").doc(bloco.id).get();
                    assert.equal(blocoPublico.exists, false, `Bloco público ${bloco.id} NÃO deveria existir`);
                }

                console.log("landing-page-publication.flow: cenário 1 OK — publicarEditorLP() não mentiu no estado local em falha.");
            } finally {
                await limparLp(db, { lpId, slugs: [slug], blocos: blocosS1 });
            }
        }

        // ===== Cenário 2: troca de slug de LP já publicada — sucesso =====
        {
            const lpId = `lp_test_s2_${SUFIXO}`;
            const slugA = `lp-qa-s2-a-${SUFIXO}`;
            const slugB = `lp-qa-s2-b-${SUFIXO}`;
            const blocosS2 = [
                blocoLivre(`${lpId}_b1`, { lpId, x: 5, y: 5 }),
                blocoLivre(`${lpId}_b2`, { lpId, x: 15, y: 200, tipo: "faq" }),
                blocoLivre(`${lpId}_b3`, { lpId, x: null, y: null, largura: null, altura: null, zIndex: null, tipo: "rodape" })
            ];
            try {
                await seedLpPublicada(db, { lpId, slug: slugA, blocos: blocosS2, titulo: "LP QA S2" });

                const resultado = await page.evaluate(async ({ lpId, novoSlug }) => {
                    await window.editarLP(lpId);
                    document.getElementById("lped-slug").value = novoSlug;
                    const resultadoSalvar = await window.salvarEditorLP();
                    return { resultadoSalvar, slugOriginalDepois: window.__videLpEditorSlugOriginal?.() };
                }, { lpId, novoSlug: slugB });
                console.log("landing-page-publication.flow: cenário 2 (troca de slug — sucesso):", JSON.stringify(resultado));

                assert.equal(resultado.resultadoSalvar?.ok, true, "salvarEditorLP() deveria confirmar sucesso");
                assert.equal(resultado.slugOriginalDepois, slugB, "lpEditorSlugOriginal deveria avançar pro novo slug só depois do commit confirmado");

                const privadoS2 = await db.collection("landing_pages").doc(lpId).get();
                assert.equal(privadoS2.data()?.pagina, slugB, "LP privada deveria apontar pro novo slug");

                const docIdAntigoS2 = `${STORE_SLUG}__${slugA}`.toLowerCase();
                const publicoAntigoS2 = await db.collection("landing_pages_publicas").doc(docIdAntigoS2).get();
                assert.equal(publicoAntigoS2.exists, false, "Documento público do slug antigo NÃO deveria sobrar (órfão)");

                const docIdNovoS2 = `${STORE_SLUG}__${slugB}`.toLowerCase();
                const publicoNovoS2 = await db.collection("landing_pages_publicas").doc(docIdNovoS2).get();
                assert.equal(publicoNovoS2.exists, true, "Documento público do novo slug deveria existir");
                assert.deepEqual([...publicoNovoS2.data().ordemBlocos].sort(), blocosS2.map((b) => b.id).sort());

                for (const bloco of blocosS2) {
                    const blocoPublico = await db.collection("landing_pages_blocos_publicas").doc(bloco.id).get();
                    assert.equal(blocoPublico.exists, true, `Bloco público ${bloco.id} deveria continuar existindo`);
                    const dados = blocoPublico.data();
                    assert.equal(dados.x, bloco.x);
                    assert.equal(dados.y, bloco.y);
                    assert.equal(dados.largura, bloco.largura);
                    assert.equal(dados.altura, bloco.altura);
                    assert.equal(dados.zIndex, bloco.zIndex);
                    assert.deepEqual(dados.design, bloco.design);
                }

                console.log("landing-page-publication.flow: cenário 2 OK — troca de slug publicada, sem órfãos, geometria preservada.");
            } finally {
                await limparLp(db, { lpId, slugs: [slugA, slugB], blocos: blocosS2 });
            }
        }

        // ===== Cenário 3: troca de slug de LP já publicada — falha não pode
        // deixar rastro parcial =====
        {
            const lpId = `lp_test_s3_${SUFIXO}`;
            const slugA = `lp-qa-s3-a-${SUFIXO}`;
            const slugB = `lp-qa-s3-b-${SUFIXO}`;
            const blocosS3 = [
                blocoLivre(`${lpId}_b1`, { lpId, x: 5, y: 5 }),
                blocoLivre(`${lpId}_b2`, { lpId, x: 15, y: 200, tipo: "faq" }),
                blocoLivre(`${lpId}_b3`, { lpId, x: 25, y: 400, tipo: "texto_rico" })
            ];
            try {
                await seedLpPublicada(db, { lpId, slug: slugA, blocos: blocosS3, titulo: "LP QA S3" });

                // Corrompe o bloco PRIVADO depois de já publicado (simula uma
                // escrita externa) — só a cópia pública valida geometria, então
                // o writeBatch inteiro (privado+público) precisa ser rejeitado.
                await db.collection("landing_pages_blocos").doc(blocosS3[2].id).update({ x: "invalido" });

                const resultado = await page.evaluate(async ({ lpId, novoSlug }) => {
                    await window.editarLP(lpId);
                    document.getElementById("lped-slug").value = novoSlug;
                    const resultadoSalvar = await window.salvarEditorLP();
                    return { resultadoSalvar, slugOriginalDepois: window.__videLpEditorSlugOriginal?.() };
                }, { lpId, novoSlug: slugB });
                console.log("landing-page-publication.flow: cenário 3 (troca de slug — falha):", JSON.stringify(resultado));

                assert.equal(resultado.resultadoSalvar?.ok, false, "salvarEditorLP() deveria reportar falha explicitamente");
                assert.equal(resultado.slugOriginalDepois, slugA, "lpEditorSlugOriginal NÃO poderia avançar numa troca de slug que falhou");

                const privadoS3 = await db.collection("landing_pages").doc(lpId).get();
                assert.equal(privadoS3.data()?.pagina, slugA, "LP privada deveria continuar no slug antigo");

                const docIdAntigoS3 = `${STORE_SLUG}__${slugA}`.toLowerCase();
                const publicoAntigoS3 = await db.collection("landing_pages_publicas").doc(docIdAntigoS3).get();
                assert.equal(publicoAntigoS3.exists, true, "Documento público do slug antigo deveria continuar íntegro");
                assert.deepEqual([...publicoAntigoS3.data().ordemBlocos].sort(), blocosS3.map((b) => b.id).sort());

                const docIdNovoS3 = `${STORE_SLUG}__${slugB}`.toLowerCase();
                const publicoNovoS3 = await db.collection("landing_pages_publicas").doc(docIdNovoS3).get();
                assert.equal(publicoNovoS3.exists, false, "Documento público do novo slug NÃO deveria ter sido criado");

                for (const bloco of blocosS3) {
                    const blocoPublico = await db.collection("landing_pages_blocos_publicas").doc(bloco.id).get();
                    assert.equal(blocoPublico.exists, true, `Bloco público antigo ${bloco.id} deveria continuar existindo`);
                }

                console.log("landing-page-publication.flow: cenário 3 OK — falha na troca de slug não deixou nenhum rastro parcial.");
            } finally {
                await limparLp(db, { lpId, slugs: [slugA, slugB], blocos: blocosS3 });
            }
        }

        // ===== Cenário 4: remoção de bloco de LP já publicada — falha não
        // pode apagar o bloco público antes da hora; sucesso remove dos dois
        // lados juntos =====
        {
            const lpId = `lp_test_s4_${SUFIXO}`;
            const slug = `lp-qa-s4-${SUFIXO}`;
            const c1 = blocoLivre(`${lpId}_c1`, { lpId, x: 5, y: 5 });
            const c2 = blocoLivre(`${lpId}_c2`, { lpId, x: 15, y: 200, tipo: "faq" });
            const c3 = blocoLivre(`${lpId}_c3`, { lpId, x: 25, y: 400, tipo: "texto_rico" });
            const blocosS4 = [c1, c2, c3];
            try {
                await seedLpPublicada(db, { lpId, slug, blocos: blocosS4, titulo: "LP QA S4" });
                const docIdPublicoS4 = `${STORE_SLUG}__${slug}`.toLowerCase();

                // ---- 4a: remoção do bloco c1 + falha (c3 corrompido) ----
                await db.collection("landing_pages_blocos").doc(c3.id).update({ x: "invalido" });

                const resultadoFalha = await page.evaluate(async ({ lpId, indiceRemover }) => {
                    await window.editarLP(lpId);
                    window.removerBlocoEditor(indiceRemover);
                    const resultadoSalvar = await window.salvarEditorLP();
                    return { resultadoSalvar };
                }, { lpId, indiceRemover: 0 });
                console.log("landing-page-publication.flow: cenário 4a (remoção + falha):", JSON.stringify(resultadoFalha));

                assert.equal(resultadoFalha.resultadoSalvar?.ok, false, "salvarEditorLP() deveria reportar falha explicitamente");

                const privadoAposFalha = await db.collection("landing_pages").doc(lpId).get();
                assert.deepEqual(
                    [...(privadoAposFalha.data()?.ordemBlocos || [])].sort(),
                    blocosS4.map((b) => b.id).sort(),
                    "ordemBlocos privada NÃO poderia mudar numa remoção que falhou"
                );

                const publicoAposFalha = await db.collection("landing_pages_publicas").doc(docIdPublicoS4).get();
                assert.equal(publicoAposFalha.exists, true, "Documento público antigo deveria continuar intacto");
                assert.deepEqual(
                    [...publicoAposFalha.data().ordemBlocos].sort(),
                    blocosS4.map((b) => b.id).sort(),
                    "ordemBlocos pública deveria continuar coerente (bloco removido não pode sumir antes da hora)"
                );

                for (const bloco of blocosS4) {
                    const blocoPublicoAposFalha = await db.collection("landing_pages_blocos_publicas").doc(bloco.id).get();
                    assert.equal(blocoPublicoAposFalha.exists, true, `Bloco público ${bloco.id} deveria AINDA existir — nenhuma alteração parcial pode ser confirmada`);
                }

                console.log("landing-page-publication.flow: cenário 4a OK — falha na remoção não apagou nada, nem o bloco público removido.");

                // ---- 4b: mesma remoção, agora com sucesso (corrupção desfeita) ----
                await db.collection("landing_pages_blocos").doc(c3.id).update({ x: c3.x });

                const resultadoSucesso = await page.evaluate(async ({ lpId, indiceRemover }) => {
                    await window.editarLP(lpId);
                    window.removerBlocoEditor(indiceRemover);
                    const resultadoSalvar = await window.salvarEditorLP();
                    return { resultadoSalvar };
                }, { lpId, indiceRemover: 0 });
                console.log("landing-page-publication.flow: cenário 4b (remoção + sucesso):", JSON.stringify(resultadoSucesso));

                assert.equal(resultadoSucesso.resultadoSalvar?.ok, true, "salvarEditorLP() deveria confirmar sucesso");

                const privadoAposSucesso = await db.collection("landing_pages").doc(lpId).get();
                assert.deepEqual(
                    [...(privadoAposSucesso.data()?.ordemBlocos || [])].sort(),
                    [c2.id, c3.id].sort(),
                    "ordemBlocos privada deveria perder c1"
                );

                const c1PrivadoAposSucesso = await db.collection("landing_pages_blocos").doc(c1.id).get();
                assert.equal(c1PrivadoAposSucesso.exists, false, "Bloco privado c1 deveria ter sido apagado");
                const c1PublicoAposSucesso = await db.collection("landing_pages_blocos_publicas").doc(c1.id).get();
                assert.equal(c1PublicoAposSucesso.exists, false, "Bloco público c1 deveria ter sido apagado JUNTO com o privado");

                const publicoAposSucesso = await db.collection("landing_pages_publicas").doc(docIdPublicoS4).get();
                assert.deepEqual([...publicoAposSucesso.data().ordemBlocos].sort(), [c2.id, c3.id].sort(), "ordemBlocos pública deveria refletir a remoção");

                console.log("landing-page-publication.flow: cenário 4b OK — remoção com sucesso apagou privado e público juntos.");
            } finally {
                await limparLp(db, { lpId, slugs: [slug], blocos: blocosS4 });
            }
        }

        // ===== Cenário 5: bloco referenciado mas ausente — publicação
        // precisa falhar limpo, sem publicar nem os blocos válidos =====
        {
            const lpId = `lp_test_s5_${SUFIXO}`;
            const slug = `lp-qa-s5-${SUFIXO}`;
            const validosS5 = [
                blocoLivre(`${lpId}_v1`, { lpId, x: 5, y: 5 }),
                blocoLivre(`${lpId}_v2`, { lpId, x: 15, y: 200, tipo: "faq" })
            ];
            const idInexistente = `${lpId}_fantasma`;
            try {
                await db.collection("landing_pages").doc(lpId).set({
                    donoUID: STORE_UID, titulo: "LP QA S5", pagina: slug, publicado: false,
                    modoLayout: "livre", paginas: [],
                    ordemBlocos: [validosS5[0].id, idInexistente, validosS5[1].id],
                    criadoEm: Date.now(), atualizadoEm: Date.now()
                });
                for (const bloco of validosS5) {
                    const { id, ...dados } = bloco;
                    await db.collection("landing_pages_blocos").doc(id).set(dados);
                }
                // idInexistente deliberadamente nunca tem documento em
                // landing_pages_blocos — simula referência quebrada.

                const resultadoEvaluate = await page.evaluate(
                    (lpId) => window.alternarPublicacaoLP(lpId, true),
                    lpId
                );
                console.log("landing-page-publication.flow: cenário 5 (bloco ausente):", JSON.stringify(resultadoEvaluate));

                assert.equal(resultadoEvaluate?.ok, false, "alternarPublicacaoLP() deveria recusar publicar com bloco ausente");
                assert.equal(resultadoEvaluate?.motivo, "bloco-ausente");

                const privadoS5 = await db.collection("landing_pages").doc(lpId).get();
                assert.equal(privadoS5.data()?.publicado, false, "LP privada NÃO poderia ficar marcada como publicada");

                const docIdPublicoS5 = `${STORE_SLUG}__${slug}`.toLowerCase();
                const publicoS5 = await db.collection("landing_pages_publicas").doc(docIdPublicoS5).get();
                assert.equal(publicoS5.exists, false, "Documento público NÃO deveria existir");

                for (const bloco of validosS5) {
                    const blocoPublico = await db.collection("landing_pages_blocos_publicas").doc(bloco.id).get();
                    assert.equal(blocoPublico.exists, false, `Bloco público válido ${bloco.id} NÃO poderia ter sido publicado — nenhum bloco do lote pode ir ao ar`);
                }

                console.log("landing-page-publication.flow: cenário 5 OK — publicação com bloco ausente falhou limpo, nada foi publicado.");
            } finally {
                await limparLp(db, { lpId, slugs: [slug], blocos: validosS5 });
            }
        }
    } catch (erro) {
        falhou = true;
        await captureDiagnostics(page, "landing-page-publication", coletarErrosConsole(page)).catch(() => {});
        console.error("landing-page-publication.flow: FALHOU —", erro);
        await limparEstado(db, blocosValidos).catch(() => {});
    } finally {
        // O teste de "consistência em falha" (bloco com campo inválido)
        // dispara um PERMISSION_DENIED real do Firestore de propósito — o
        // SDK sempre loga isso como console.error, mesmo já tratado pelo
        // try/catch do próprio page.evaluate. Achado real: o filtro
        // anterior só reconhecia "permission-denied" (hífen); o Firestore
        // Emulator loga exatamente "PERMISSION_DENIED" (underscore,
        // maiúsculo) — variação nunca coberta.
        const errosReais = erros.filter((msg) => !ehErroDeRedeExterno(msg) && !/insufficient permissions|permission[-_]denied/i.test(msg));
        if (errosReais.length > 0) {
            falhou = true;
            console.error("landing-page-publication.flow: erros de console inesperados:", errosReais);
        }
        await browser.close();
        await close();
    }

    if (falhou) {
        process.exitCode = 1;
    }
}

main();
