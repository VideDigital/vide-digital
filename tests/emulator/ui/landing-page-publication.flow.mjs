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

        // ===== Publicar: precisa ser atômico e usar o contrato corrigido =====
        await page.evaluate(
            (lpId) => window.alternarPublicacaoLP(lpId, true),
            LP_ID
        );

        const privadaAposPublicar = await db.collection("landing_pages").doc(LP_ID).get();
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
    } catch (erro) {
        falhou = true;
        await captureDiagnostics(page, "landing-page-publication", coletarErrosConsole(page)).catch(() => {});
        console.error("landing-page-publication.flow: FALHOU —", erro);
        await limparEstado(db, blocosValidos).catch(() => {});
    } finally {
        const errosReais = erros.filter((msg) => !ehErroDeRedeExterno(msg) && !/insufficient permissions|permission-denied/i.test(msg));
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
