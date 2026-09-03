// PR72-FOLLOWUP-REMAINING-COLOR-SINKS-HARDENING — extrai e executa a
// implementação REAL de safeAccentColor() (studio-canvas-v4.js, script
// clássico/síncrono, sem import() dinâmico pro helper canônico) e prova
// que tem a MESMA semântica de safeCSSColor() (lp-render-safety-core.js):
// mesma allowlist #RRGGBB (case-insensitive), mesmo trim, fallback
// validado pela mesma regra, nunca eco de valor inválido. Evita divergência
// futura entre as duas implementações (política duplicada por necessidade
// arquitetural — script clássico —, nunca por escolha independente).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeCSSColor } from "../lp-render-safety-core.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function carregarSafeAccentColorReal() {
    const source = await readFile(path.join(REPO_ROOT, "studio-canvas-v4.js"), "utf8");
    const inicio = source.indexOf("const SAFE_ACCENT_COLOR = /^#[0-9a-f]{6}$/i;");
    assert.ok(inicio > -1, "não encontrei a constante SAFE_ACCENT_COLOR em studio-canvas-v4.js");
    const fim = source.indexOf("\n\n  function bindCanvas() {", inicio);
    assert.ok(fim > inicio, "não encontrei o fim de safeAccentColor() em studio-canvas-v4.js");
    const trecho = source.slice(inicio, fim);
    const factory = new Function(`${trecho}\nreturn safeAccentColor;`);
    return factory();
}

describe("safeAccentColor() real (studio-canvas-v4.js) — paridade com safeCSSColor() canônico (lp-render-safety-core.js)", () => {
    const casos = [
        ["#5b3df5", undefined],
        ["#5B3DF5", undefined],
        ["#a1B2c3", undefined],
        ["  #ffffff  ", undefined],
        ["red;position:fixed;inset:0;z-index:999999", undefined],
        ['red;background-image:url("https://example.invalid/pwn")', undefined],
        ["#fff", undefined],
        ["#ffffffff", undefined],
        ["red", undefined],
        ["currentColor", undefined],
        ["rgb(255,0,0)", undefined],
        ["var(--cor-perigosa)", undefined],
        ["5B3DF5", undefined],
        ["", undefined],
        [null, undefined],
        [undefined, undefined],
        ["red;position:fixed", "#000000"],
        [null, "#ffffff"],
        ["", "red;position:fixed;inset:0;z-index:999999"],
        [undefined, "javascript:alert(1)"],
        ["#123456", "#000000"],
        ["not-a-color", "also-not-a-color"],
        ['#000000"><img src=x onerror="window.__xss=1">', "#7C3AED"]
    ];

    for (const [value, fallback] of casos) {
        it(`safeAccentColor(${JSON.stringify(value)}, ${JSON.stringify(fallback)}) === safeCSSColor(...) canônico`, async () => {
            const safeAccentColor = await carregarSafeAccentColorReal();
            const esperado = safeCSSColor(value, fallback);
            const real = safeAccentColor(value, fallback);
            assert.equal(real, esperado, `divergência de paridade: safeAccentColor retornou ${JSON.stringify(real)}, safeCSSColor (canônico) retornou ${JSON.stringify(esperado)}`);
        });
    }
});
