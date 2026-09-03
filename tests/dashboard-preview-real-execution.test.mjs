// PR72-FOLLOWUP-REMAINING-COLOR-SINKS-HARDENING — extrai e executa a
// implementação REAL de renderizarBlocoPreview() (dashboard-app.js,
// preview do editor básico) por texto, nunca reconstruída à mão — mesma
// técnica de tests/lp-renderer-real-execution.test.mjs (index.html) e
// tests/studio-ultimate-standalone-export-real.test.mjs (studio-ultimate.js).
//
// Cobre os sinks de "forma"/props.cor e "seletor_cores"/op.hex que a PR
// #72 não cobriu (aquela missão tratou só os 6 campos design.cor*).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { escapeHTML, escapeAttribute, escapeCSSString, safeCSSColor, safeImageURL } from "../lp-render-safety-core.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function carregarRenderizarBlocoPreviewReal() {
    const source = await readFile(path.join(REPO_ROOT, "dashboard-app.js"), "utf8");

    function extrairTrecho(inicioMarcador, fimMarcador) {
        const inicio = source.indexOf(inicioMarcador);
        assert.ok(inicio > -1, `não foi possível localizar "${inicioMarcador}" em dashboard-app.js`);
        const fim = source.indexOf(fimMarcador, inicio);
        assert.ok(fim > inicio, `não foi possível localizar o fim de "${inicioMarcador}" (procurando "${fimMarcador}")`);
        return source.slice(inicio, fim);
    }

    const funcaoSrc = extrairTrecho(
        "function renderizarBlocoPreview(bloco, indiceBloco) {",
        "\n        let guiasAlinhamentoAtivas = [];"
    );

    const fonteCompleta = `${funcaoSrc}\nreturn renderizarBlocoPreview;`;
    const factory = new Function(
        "escapeHTML", "escapeAttribute", "escapeCSSString", "safeCSSColor", "safeImageURL",
        "blocosSelecionadosLivre", "lpEditorModoLayout", "produtosDoUsuarioCache",
        fonteCompleta
    );
    return factory(
        escapeHTML, escapeAttribute, escapeCSSString, safeCSSColor, safeImageURL,
        new Set(), "empilhado", []
    );
}

describe("renderizarBlocoPreview() real (dashboard-app.js) — PR72-FOLLOWUP: sinks de cor restantes (props.cor/op.hex)", () => {
    it("forma: props.cor com ';' cru não injeta declaração CSS (bare CSS value)", async () => {
        const renderizarBlocoPreview = await carregarRenderizarBlocoPreviewReal();
        const payload = "#000000;position:fixed;inset:0;z-index:999999";
        const bloco = { tipo: "forma", design: {}, props: { largura: 120, altura: 120, cor: payload, tipoForma: "quadrado" } };
        const html = renderizarBlocoPreview(bloco, 0);
        assert.ok(!/(?:^|[;"])\s*position\s*:\s*fixed\s*(?:;|"|$)/i.test(html), `position:fixed não pode aparecer como declaração própria — produzido: ${html}`);
        assert.ok(!/z-index\s*:\s*999999/i.test(html), `z-index:999999 injetado não pode sobreviver — produzido: ${html}`);
        assert.ok(!html.includes(";position:fixed"), `payload cru não pode sobreviver como fragmento — produzido: ${html}`);
    });

    it("seletor_cores: op.hex com ';' cru não injeta declaração CSS (bare CSS value)", async () => {
        const renderizarBlocoPreview = await carregarRenderizarBlocoPreviewReal();
        const payload = "#000000;position:fixed;inset:0;z-index:999999";
        const bloco = { tipo: "seletor_cores", design: {}, props: { opcoes: [{ nome: "Teste", hex: payload }] } };
        const html = renderizarBlocoPreview(bloco, 0);
        assert.ok(!/(?:^|[;"])\s*position\s*:\s*fixed\s*(?:;|"|$)/i.test(html), `position:fixed não pode aparecer como declaração própria — produzido: ${html}`);
        assert.ok(!/z-index\s*:\s*999999/i.test(html), `z-index:999999 injetado não pode sobreviver — produzido: ${html}`);
    });

    it("forma: cor legítima (#5B3DF5) continua aplicada normalmente (compatibilidade)", async () => {
        const renderizarBlocoPreview = await carregarRenderizarBlocoPreviewReal();
        const bloco = { tipo: "forma", design: {}, props: { largura: 100, altura: 100, cor: "#5B3DF5", tipoForma: "circulo" } };
        const html = renderizarBlocoPreview(bloco, 0);
        assert.ok(html.includes("background-color:#5B3DF5;"), `cor legítima deveria continuar aplicada — produzido: ${html}`);
    });

    it("seletor_cores: cor legítima (#7C3AED) continua aplicada normalmente (compatibilidade)", async () => {
        const renderizarBlocoPreview = await carregarRenderizarBlocoPreviewReal();
        const bloco = { tipo: "seletor_cores", design: {}, props: { opcoes: [{ nome: "Roxo", hex: "#7C3AED" }] } };
        const html = renderizarBlocoPreview(bloco, 0);
        assert.ok(html.includes("background-color:#7C3AED;"), `cor legítima deveria continuar aplicada — produzido: ${html}`);
    });
});
