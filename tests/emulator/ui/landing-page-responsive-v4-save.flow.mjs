// LP-RESPONSIVE-V4-UNDEFINED-SAVE-HOTFIX
//
// Reproduz o incidente real de produção contra o Firestore Emulator, com
// Rules reais, pelo caminho real do editor (window.editarLP, o Inspector
// real do Studio, window.salvarEditorLP) — nada de reimplementar a lógica
// aqui. Antes da correção, este teste falhava exatamente como em produção:
// `FirebaseError: Function setDoc() called with invalid data. Unsupported
// field value: undefined (found in field
// design.responsiveV4.desktop.props.imagemLargura ...)`.
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
const LP_ID = `lp_test_responsivev4_${SUFIXO}`;
const LP_SLUG = `lp-responsivev4-qa-${SUFIXO}`;

function adminDb() {
    if (!getApps().length) {
        initializeApp({ projectId: PROJECT_ID });
    }
    return getFirestore();
}

// Blocos deliberadamente SEM posicaoImagem/imagemLargura — é exatamente o
// formato de qualquer LP existente antes desta feature (nenhuma migração
// os adiciona), e formulario_captura nem sequer é um tipo que normalmente
// teria esses campos de imagem.
function blocoTextoMidia(id) {
    return {
        id, lpId: LP_ID, donoUID: STORE_UID, tipo: "texto_midia", paginaId: null, visivel: true,
        props: { titulo: "Bloco de texto", subtitulo: "Descrição original" },
        design: { corFundo: "#0f172a", corTexto: "#fff" },
        x: 20, y: 40, largura: 600, altura: 220, zIndex: 1
    };
}

function blocoFormularioCaptura(id) {
    return {
        id, lpId: LP_ID, donoUID: STORE_UID, tipo: "formulario_captura", paginaId: null, visivel: true,
        props: { titulo: "Fale conosco", campos: ["nome", "whatsapp"] },
        design: { corFundo: "#111827", corTexto: "#fff" },
        x: 20, y: 300, largura: 600, altura: 260, zIndex: 2
    };
}

async function seedLp(db, blocos) {
    await db.collection("landing_pages").doc(LP_ID).set({
        donoUID: STORE_UID,
        titulo: "LP Responsive V4 QA",
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
    for (const bloco of blocos) {
        await db.collection("landing_pages_blocos").doc(bloco.id).delete().catch(() => {});
    }
}

async function main() {
    const { baseUrl, close } = await startStaticServer();
    const browser = await launchBrowser();
    let falhou = false;
    const db = adminDb();
    const blocos = [blocoTextoMidia(`${LP_ID}_b1`), blocoFormularioCaptura(`${LP_ID}_b2`)];

    const contexto = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await contexto.newPage();
    const erros = coletarErrosConsole(page);

    try {
        await seedLp(db, blocos);

        // ===== Regressão de LP legada: o seed não tem NENHUM
        // design.responsiveV4 — é exatamente o estado de qualquer bloco
        // criado antes desta feature existir (nada faz backfill). =====
        const seedB1 = await db.collection("landing_pages_blocos").doc(blocos[0].id).get();
        const seedB2 = await db.collection("landing_pages_blocos").doc(blocos[1].id).get();
        assert.equal(seedB1.data().design.responsiveV4, undefined, "seed (LP legada) não deveria já ter responsiveV4");
        assert.equal(seedB2.data().design.responsiveV4, undefined, "seed (LP legada) não deveria já ter responsiveV4");
        assert.equal(Object.hasOwn(seedB2.data().props, "imagemLargura"), false, "formulario_captura nunca teve imagemLargura — reproduz o formato real do incidente");

        await loginReal(page, baseUrl, { email: "owner.pro@local.test", senha: "Local123!pro" });
        await page.waitForFunction(
            (slug) => window.__videSlugAtualSalvo?.() === slug,
            STORE_SLUG,
            { timeout: 20000 }
        );

        // ===== Abre o editor real e espera o Studio (incluindo
        // AuraResponsiveV4, o Inspector e o Desktop Shell) terminar de
        // carregar — editarLP() dispara carregarEditorLandingPages() em
        // segundo plano, sem esperar por ele. =====
        await page.evaluate((lpId) => window.editarLP(lpId), LP_ID);
        await page.waitForFunction(
            () => typeof window.AuraResponsiveV4?.saveDevice === "function"
                && typeof window.AuraStudioInspector?.select === "function"
                && typeof window.VideLandingEditorShellV1?.setMode === "function",
            { timeout: 20000 }
        );

        assert.equal(
            (await page.evaluate(() => window.lpEditorBlocos?.length)),
            2,
            "editor deveria ter carregado os 2 blocos do seed"
        );

        // ===== Cenário real: editar um campo pelo Inspector real
        // (props.subtitulo do bloco texto_midia) dispara aura:studio-change
        // -> debounce -> saveDevice(), que materializa responsiveV4 pra
        // TODOS os blocos — inclusive o formulario_captura, nunca
        // selecionado. É assim que o incidente real aconteceu: a falha
        // apareceu num bloco que a pessoa nem estava editando.
        //
        // O Desktop Shell V1 (studio-desktop-shell-v1.js) começa em modo
        // "build" (lista de blocos) — nesse modo o Inspector fica com
        // display:none (studio-desktop-shell-v1.css). Um usuário real
        // clica na aba "Design" da barra de modos pra ver o Inspector;
        // aqui chamamos a mesma função pública real que esse clique
        // aciona (window.VideLandingEditorShellV1.setMode), sem
        // reimplementar a lógica de troca de modo. =====
        await page.evaluate(() => window.VideLandingEditorShellV1.setMode("design"));
        await page.evaluate(() => window.AuraStudioInspector.select(0));
        await page.waitForSelector('[data-studio-path="props.subtitulo"]', { state: "visible", timeout: 10000 });
        await page.fill('[data-studio-path="props.subtitulo"]', "Nova descrição via Inspector real");

        // Espera determinística pela materialização (debounce real de
        // 300ms do módulo) — poll por estado, não um sleep fixo.
        await page.waitForFunction(
            () => {
                const blocos = window.lpEditorBlocos || [];
                return blocos.length === 2 && blocos.every((b) => !!b.design?.responsiveV4?.desktop);
            },
            { timeout: 5000 }
        );

        const resultadoSalvar = await page.evaluate(() => window.salvarEditorLP());
        console.log("landing-page-responsive-v4-save.flow: resultado salvarEditorLP:", JSON.stringify(resultadoSalvar));
        assert.equal(
            resultadoSalvar?.ok,
            true,
            `salvarEditorLP() deveria suceder — motivo relatado: ${resultadoSalvar?.motivo || resultadoSalvar?.erro || "nenhum"}`
        );

        const depoisB1 = await db.collection("landing_pages_blocos").doc(blocos[0].id).get();
        const depoisB2 = await db.collection("landing_pages_blocos").doc(blocos[1].id).get();
        assert.equal(depoisB1.exists, true);
        assert.equal(depoisB2.exists, true);

        const propsB1 = depoisB1.data().design?.responsiveV4?.desktop?.props;
        assert.ok(propsB1, "texto_midia deveria ter design.responsiveV4.desktop.props persistido");
        assert.equal(Object.hasOwn(propsB1, "imagemLargura"), false, "texto_midia sem imagemLargura não deveria persistir essa chave");

        const propsB2 = depoisB2.data().design?.responsiveV4?.desktop?.props;
        assert.ok(propsB2, "formulario_captura deveria ter design.responsiveV4.desktop.props persistido (foi materializado junto, mesmo sem ter sido selecionado)");
        assert.equal(Object.hasOwn(propsB2, "imagemLargura"), false, "formulario_captura nunca teve imagemLargura — a chave não pode existir no documento salvo");
        assert.equal(Object.hasOwn(propsB2, "posicaoImagem"), false, "formulario_captura nunca teve posicaoImagem — a chave não pode existir no documento salvo");

        assert.equal(depoisB1.data().props.subtitulo, "Nova descrição via Inspector real", "a edição real feita pelo Inspector deveria ter sido persistida");

        console.log("landing-page-responsive-v4-save.flow: Save principal OK — responsiveV4 materializado nos 2 blocos, sem nenhuma chave undefined.");

        // ===== Reload/reabertura: o conteúdo salvo precisa sobreviver a
        // uma sessão nova do editor, sem exigir nenhuma migração. =====
        await page.reload({ waitUntil: "load" });
        await loginReal(page, baseUrl, { email: "owner.pro@local.test", senha: "Local123!pro" });
        await page.waitForFunction(
            (slug) => window.__videSlugAtualSalvo?.() === slug,
            STORE_SLUG,
            { timeout: 20000 }
        );

        const reabertura = await page.evaluate(async (lpId) => {
            await window.editarLP(lpId);
            const bloco = window.lpEditorBlocos?.[0];
            return {
                subtitulo: bloco?.props?.subtitulo,
                temResponsiveV4: !!bloco?.design?.responsiveV4
            };
        }, LP_ID);
        console.log("landing-page-responsive-v4-save.flow: reabertura:", JSON.stringify(reabertura));
        assert.equal(reabertura.subtitulo, "Nova descrição via Inspector real", "reabrir o editor deveria carregar o conteúdo persistido");
        assert.equal(reabertura.temResponsiveV4, true, "responsiveV4 persistido deveria continuar presente na reabertura");

        console.log("landing-page-responsive-v4-save.flow: reabertura OK — conteúdo persistido sobrevive a reload sem migração.");
    } catch (erro) {
        falhou = true;
        await captureDiagnostics(page, "landing-page-responsive-v4-save", coletarErrosConsole(page)).catch(() => {});
        console.error("landing-page-responsive-v4-save.flow: FALHOU —", erro);
    } finally {
        await limparEstado(db, blocos).catch(() => {});
        const errosReais = erros.filter((msg) => !ehErroDeRedeExterno(msg));
        if (errosReais.length > 0) {
            falhou = true;
            console.error("landing-page-responsive-v4-save.flow: erros de console inesperados:", errosReais);
        }
        await browser.close();
        await close();
    }

    if (falhou) {
        process.exitCode = 1;
    }
}

main();
