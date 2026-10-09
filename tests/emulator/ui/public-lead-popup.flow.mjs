// Popup real extraído da loja, com transporte simulado e tracker/fingerprint reais.
// Sem Firebase, rede, Gemini ou escrita em produção; usado também pelo QG de UI.
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { chromium } from "playwright";

const source = (await readFile(new URL("../../../loja.html", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
const trackerSource = (await readFile(new URL("../../../lead-attempt-token-core.js", import.meta.url), "utf8")).replace(/export /g, "");
function between(start, end) {
    const a = source.indexOf(start), b = source.indexOf(end, a);
    assert.ok(a >= 0 && b > a, `Trecho real ausente: ${start}`);
    return source.slice(a, b);
}
const markup = between('    <!-- POP-UP CAPTURA DE LEAD -->', '    <!-- MODAL DE DETALHES DO PRODUTO -->');
const popupCode = between('        // Estado exclusivamente visual:', '        window.toggleChatWindow');
const captureCode = between('        async function capturarLeadPublico(payload)', '        function formatarDataAvaliacao');
const textHelpers = between('        function textoLeadPublico', '        function obterSessaoLeadPublico');
const a11y = between('        const focosAnterioresA11y', '        function obterUrlCanonicaLoja');
const closeCode = between('        window.fecharPopup = function()', '        // Estado exclusivamente visual:');
const styles = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1]).join("\n");

export async function checkPublicLeadPopup(browser) {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
        const context = await browser.newContext({ viewport });
        await context.route("**/*", route => route.abort());
        const page = await context.newPage();
        await page.route("http://popup.invalid/", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><html></html>" }));
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        try {
            async function reset(mode = "pending") {
                await page.goto("http://popup.invalid/");
                await page.setContent(`<style>${styles}
                    .hidden{display:none!important} #popup-captura{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:16px}
                    #popup-captura>div{width:100%;max-width:448px;padding:40px;box-sizing:border-box;background:var(--surface)}
                    #popup-captura input,#popup-enviar{box-sizing:border-box;width:100%;min-height:48px;padding:14px} .sr-only-accessible{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
                    #popup-captura [hidden]{display:none!important}
                </style><button id="return-focus">Catálogo</button>${markup}`);
                await page.addScriptTag({ content: `${trackerSource}
                    let nextToken=0; const leadAttemptTracker=createLeadAttemptTracker(()=>"token-"+(++nextToken));
                    const fingerprintTentativaLeadPublico=fingerprintLeadAttempt;
                    const LEAD_PUBLIC_SCHEMA_VERSION=2, lojaSlug="qa-local", tempoInicioSessao=Date.now();
                    const atribuicaoSessao=null, utmSourceCapturada="Loja", urlParams=new URLSearchParams();
                    const obterSessaoLeadPublico=()=>"local-session", normalizarSnapshotPedidoPublico=()=>null;
                    const trackCrescimento=()=>{};
                    ${textHelpers}
                    window.requests=[]; window.mode=${JSON.stringify(mode)};
                    const obterCreatePublicLeadCallable=()=>request=>{
                        window.requests.push(request);
                        return new Promise((resolve,reject)=>{
                            window.resolveCapture=()=>resolve({data:{ok:true,leadId:"fixture-local"}});
                            window.rejectCapture=(code="unavailable")=>{
                                const error=new Error("private Firebase token and stack must not leak");
                                error.code=code; reject(error);
                            };
                            window.invalidCapture=()=>resolve({data:{}});
                            if(window.mode==="success") window.resolveCapture();
                        });
                    };
                    ${captureCode}
                    ${a11y}
                    ${closeCode}
                    ${popupCode}
                    document.getElementById("return-focus").focus(); registrarFocoAnteriorA11y("popup");
                    const popup=document.getElementById("popup-captura"); popup.classList.remove("hidden"); popup.setAttribute("aria-hidden","false");
                    document.getElementById("popup-nome").focus();
                ` });
            }
            const name = page.locator("#popup-nome"), phone = page.locator("#popup-whatsapp");
            async function valid(n = "Pessoa QA") { await name.fill(n); await phone.fill("11999999999"); }
            const send = () => page.locator("#popup-enviar").click();
            const settle = () => page.waitForFunction(() => document.getElementById("popup-captura-form")?.getAttribute("aria-busy") !== "true");

            await reset();
            await send();
            assert.equal(await page.evaluate(() => requests.length), 0);
            assert.equal(await name.getAttribute("aria-invalid"), "true");
            assert.equal(await phone.getAttribute("aria-invalid"), "true");
            assert.equal(await name.getAttribute("aria-describedby"), "popup-nome-erro");
            assert.equal(await page.evaluate(() => document.activeElement.id), "popup-nome");
            assert.equal(await page.locator("#popup-nome-erro").textContent(), "Informe seu nome.");
            assert.equal(await page.locator("#popup-whatsapp-erro").textContent(), "Informe seu WhatsApp com DDD.");
            await name.fill("Pessoa QA");
            assert.equal(await name.getAttribute("aria-invalid"), "false");
            await phone.fill("123"); await send();
            assert.equal(await page.evaluate(() => document.activeElement.id), "popup-whatsapp");
            assert.equal(await page.locator("#popup-whatsapp-erro").textContent(), "Confira o número e informe o DDD.");
            await phone.fill("1199999999");
            assert.equal(await phone.getAttribute("aria-invalid"), "false");

            // Uma tentativa pendente: click + chamada programática síncrona não duplicam.
            await send();
            await page.evaluate(() => window.enviarLeadPopup());
            assert.equal(await page.evaluate(() => requests.length), 1);
            assert.equal(await page.locator("#popup-enviar").isDisabled(), true);
            assert.equal(await page.locator("#popup-enviar").textContent(), "Enviando...");
            assert.equal(await name.getAttribute("readonly"), "");
            assert.equal(await page.locator("#popup-captura-form").getAttribute("aria-busy"), "true");
            await page.evaluate(() => window.rejectCapture()); await settle();
            assert.equal(await phone.inputValue(), "1199999999");
            assert.equal(await name.inputValue(), "Pessoa QA");
            assert.equal(await page.locator("#popup-enviar").isEnabled(), true);
            assert.equal(await page.locator("#popup-envio-erro").getAttribute("role"), "alert");
            assert.match(await page.locator("#popup-envio-erro").textContent(), /Não conseguimos confirmar/);
            assert.doesNotMatch(await page.locator("#popup-envio-erro").textContent(), /private|Firebase|token|stack/);
            await page.waitForTimeout(50);
            assert.equal(await page.evaluate(() => requests.length), 1, "sem retry automático");
            await send();
            assert.deepEqual(await page.evaluate(() => requests.map(request => request.dedupeKey)), ["token-1", "token-1"]);
            await page.evaluate(() => window.rejectCapture("deadline-exceeded")); await settle();
            assert.match(await page.locator("#popup-envio-erro").textContent(), /Não conseguimos confirmar/);
            assert.equal(await name.inputValue(), "Pessoa QA", "timeout ambíguo preserva dados");
            await name.fill("Outra intenção QA"); await send();
            assert.equal(await page.evaluate(() => requests[2].dedupeKey), "token-2");
            await page.evaluate(() => window.resolveCapture());
            await page.waitForSelector("#popup-sucesso");
            assert.match(await page.locator("#popup-sucesso").textContent(), /A loja poderá entrar em contato/);
            assert.equal(await page.locator("#popup-captura").getAttribute("aria-labelledby"), "popup-captura-titulo");
            assert.equal(await page.evaluate(() => document.activeElement.id), "popup-captura-titulo");
            assert.equal(await page.evaluate(() => sessionStorage.getItem("popupFechado")), "1");
            assert.equal(await page.evaluate(() => leadAttemptTracker.peek(fingerprintTentativaLeadPublico(requests[2]))), null);
            await page.evaluate(() => window.enviarLeadPopup());
            assert.equal(await page.evaluate(() => requests.length), 3, "sucesso não permite reenviar o popup concluído");
            await page.getByRole("button", { name: "Continuar navegando" }).click();
            await page.waitForFunction(() => document.activeElement.id === "return-focus");

            // Resposta sem leadId não é sucesso; erro ambíguo preserva os controles.
            await reset(); await valid(); await send();
            await page.evaluate(() => window.invalidCapture()); await settle();
            assert.equal(await name.inputValue(), "Pessoa QA");
            assert.equal(await page.locator("#popup-envio-erro").isVisible(), true);
            assert.equal(await page.locator("#popup-sucesso").count(), 0);

            // Texto do visitante é literal: tags/caracteres nunca criam DOM executável.
            for (const text of ['<img src=x onerror="window.injected=true">', '< > & " \' QA']) {
                await reset("success"); await valid(text); await send();
                await page.waitForSelector("#popup-sucesso");
                assert.ok((await page.locator("#popup-sucesso").textContent()).includes(text));
                assert.equal(await page.locator("#popup-sucesso img, #popup-sucesso script").count(), 0);
                assert.equal(await page.evaluate(() => window.injected === true), false);
                assert.doesNotMatch(await page.locator("#popup-captura").textContent(), /Cupom enviado|desconto garantido|agora mesmo/);
            }

            await reset();
            const rect = await page.locator("#popup-captura > div").boundingBox();
            assert.ok(rect.x >= 0 && rect.x + rect.width <= viewport.width + 1);
            assert.ok(rect.y >= 0 && rect.y + rect.height <= viewport.height + 1);
            assert.equal(await page.locator("#popup-captura").getAttribute("role"), "dialog");
            assert.equal(await page.locator("#popup-captura").getAttribute("aria-modal"), "true");
            await page.locator("#popup-captura button[aria-label='Fechar']").focus();
            await page.keyboard.press("Shift+Tab");
            assert.equal(await page.evaluate(() => document.activeElement.id), "popup-enviar");
            await page.keyboard.press("Tab");
            assert.equal(await page.evaluate(() => document.activeElement.getAttribute("aria-label")), "Fechar");
            await page.keyboard.press("Escape");
            await page.waitForFunction(() => document.activeElement.id === "return-focus");
            assert.equal(await page.locator("#popup-captura").getAttribute("aria-hidden"), "true");
            await reset(); await valid(); await phone.press("Enter");
            assert.equal(await page.evaluate(() => requests.length), 1);
            await page.evaluate(() => window.rejectCapture()); await settle();
            for (const theme of ["light", "dark"]) {
                await page.evaluate(theme => document.documentElement.setAttribute("data-theme", theme), theme);
                const contrast = await page.locator("#popup-envio-erro").evaluate(element => {
                    const style = getComputedStyle(element);
                    const luminance = color => {
                        const rgb = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => {
                            const c = value / 255;
                            return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
                        });
                        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
                    };
                    const a = luminance(style.color), b = luminance(style.backgroundColor);
                    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
                });
                assert.ok(contrast >= 4.5, `contraste de erro ${theme}: ${contrast}`);
                if (process.env.POPUP_DIAGNOSTICS_DIR) {
                    await mkdir(process.env.POPUP_DIAGNOSTICS_DIR, { recursive: true });
                    await page.screenshot({ path: path.join(process.env.POPUP_DIAGNOSTICS_DIR, `popup-error-${viewport.width}-${theme}.png`) });
                }
            }
            // Fechar durante a tentativa não cancela nem destaca a Promise; sucesso tardio não rouba foco.
            await reset(); await valid(); await send(); await page.keyboard.press("Escape");
            await page.waitForFunction(() => document.activeElement.id === "return-focus");
            await page.evaluate(() => window.resolveCapture());
            await page.waitForSelector("#popup-sucesso", { state: "attached" });
            assert.equal(await page.evaluate(() => document.activeElement.id), "return-focus");
            assert.equal(await page.locator("#popup-captura").getAttribute("aria-hidden"), "true");
            assert.deepEqual(errors, [], "sem erro JavaScript no popup");
            console.log(`popup099 ${viewport.width}: validação, loading, erros, tokens, segurança, teclado e layout PASS`);
        } finally { await context.close(); }
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const browser = await chromium.launch();
    try { await checkPublicLeadPopup(browser); } finally { await browser.close(); }
}
