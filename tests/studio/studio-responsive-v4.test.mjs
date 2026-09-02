// LP-RESPONSIVE-V4-UNDEFINED-SAVE-HOTFIX
//
// Incidente real de produção: publicar/salvar uma Landing Page falhava com
// `FirebaseError: Function setDoc() called with invalid data. Unsupported
// field value: undefined (found in field
// design.responsiveV4.desktop.props.imagemLargura ...)`. Causa raiz:
// captureBlock() (studio-responsive-v4.js) sempre materializava as chaves
// `posicaoImagem`/`imagemLargura` em `props`, mesmo quando o bloco nunca
// teve esses valores — a CHAVE ficava no objeto com valor `undefined`, que
// o SDK do Firestore recusa. `payloadBlocoEditor()` (dashboard-app.js)
// grava `bloco.design` inteiro sem nenhuma sanitização profunda, então
// qualquer `undefined` produzido aqui derruba o Save inteiro da LP.
//
// Este arquivo carrega studio-responsive-v4.js de verdade via vm (mesmo
// padrão de tests/studio/shell-lifecycle.test.mjs) — não reimplementa a
// lógica do módulo, executa o arquivo real contra um DOM/window mínimos.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const rootDir = path.resolve(import.meta.dirname, "../..");
const code = fs.readFileSync(path.join(rootDir, "studio-responsive-v4.js"), "utf8");

class CustomEventStub {
    constructor(type, init) {
        this.type = type;
        this.detail = init?.detail;
    }
}

function createDocumentStub() {
    const listeners = new Map();
    return {
        readyState: "complete",
        addEventListener(type, fn) {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type).add(fn);
        },
        removeEventListener(type, fn) {
            listeners.get(type)?.delete(fn);
        },
        dispatchEvent(event) {
            listeners.get(event.type)?.forEach((fn) => fn(event));
            return true;
        }
    };
}

// Carrega uma instância nova e isolada do módulo real por teste (o arquivo
// é uma IIFE com estado de módulo próprio — cada teste precisa do seu).
function loadResponsiveV4() {
    const documentStub = createDocumentStub();
    const windowStub = {
        document: documentStub,
        console: { info() {}, warn() {}, error() {} },
        setTimeout,
        clearTimeout,
        CustomEvent: CustomEventStub,
        lpEditorBlocos: [],
        renderizarEditorBlocos: () => {},
        // Sem isto, wrapDeviceSwitcher() nunca acha o hotfix e watch() fica
        // reagendando setTimeout(watch, 160) pra sempre — mantém o processo
        // vivo indefinidamente num teste Node real (não é um efeito do
        // módulo em produção, onde AuraStudioDeviceHotfix sempre existe).
        AuraStudioDeviceHotfix: { setDevice() {} }
    };
    windowStub.window = windowStub;
    windowStub.globalThis = windowStub;

    const context = vm.createContext(windowStub);
    vm.runInContext(code, context, { filename: "studio-responsive-v4.js" });

    return {
        api: windowStub.AuraResponsiveV4,
        setBlocks(blocks) { windowStub.lpEditorBlocos = blocks; },
        getBlocks() { return windowStub.lpEditorBlocos; },
        dispatchStudioChange(detail) {
            documentStub.dispatchEvent({ type: "aura:studio-change", detail });
        }
    };
}

function blocoBase(overrides = {}) {
    return {
        id: "b1",
        x: 10, y: 20, largura: 600, altura: 220, zIndex: 1,
        design: {},
        props: {},
        ...overrides
    };
}

// Varredura recursiva: nenhuma chave do objeto produzido por captureBlock()
// pode mapear para `undefined`, em nenhum nível — cobre o item 21 da
// revisão adversarial exigida pela missão ("presença de undefined
// recursivo no objeto produzido"), não só os dois campos conhecidos.
function encontrarChavesUndefined(valor, caminho = "") {
    if (valor === null || typeof valor !== "object") return [];
    const achados = [];
    for (const [chave, item] of Object.entries(valor)) {
        const caminhoAtual = caminho ? `${caminho}.${chave}` : chave;
        if (item === undefined) achados.push(caminhoAtual);
        else achados.push(...encontrarChavesUndefined(item, caminhoAtual));
    }
    return achados;
}

test("captureBlock: formulario_captura sem posicaoImagem/imagemLargura não possui essas chaves no resultado", () => {
    const { api } = loadResponsiveV4();
    const bloco = blocoBase({ tipo: "formulario_captura", props: { titulo: "Fale conosco", campos: ["nome", "whatsapp"] } });
    const capturado = api.captureBlock(bloco);
    assert.equal(Object.hasOwn(capturado.props, "posicaoImagem"), false, "posicaoImagem não deveria existir como chave");
    assert.equal(Object.hasOwn(capturado.props, "imagemLargura"), false, "imagemLargura não deveria existir como chave");
    assert.deepEqual(encontrarChavesUndefined(capturado), [], "captureBlock não pode produzir nenhuma chave com valor undefined");
});

test("captureBlock: texto_midia com posicaoImagem preenchido e imagemLargura ausente", () => {
    const { api } = loadResponsiveV4();
    const bloco = blocoBase({ tipo: "texto_midia", props: { titulo: "T", subtitulo: "S", posicaoImagem: "direita" } });
    const capturado = api.captureBlock(bloco);
    assert.equal(capturado.props.posicaoImagem, "direita", "posicaoImagem deveria ser preservado");
    assert.equal(Object.hasOwn(capturado.props, "imagemLargura"), false, "imagemLargura não deveria existir como chave — o bloco nunca teve esse valor");
    assert.deepEqual(encontrarChavesUndefined(capturado), []);
});

test("captureBlock: texto_midia com imagemLargura legítimo preserva o valor exato", () => {
    const { api } = loadResponsiveV4();
    const bloco = blocoBase({ tipo: "texto_midia", props: { titulo: "T", imagemLargura: 480 } });
    const capturado = api.captureBlock(bloco);
    assert.equal(capturado.props.imagemLargura, 480);
    assert.equal(Object.hasOwn(capturado.props, "posicaoImagem"), false);
});

test("captureBlock: valores semanticamente válidos (null, string vazia, zero) nunca são apagados", () => {
    const { api } = loadResponsiveV4();

    const blocoNull = blocoBase({ props: { posicaoImagem: null } });
    const capturadoNull = api.captureBlock(blocoNull);
    assert.equal(Object.hasOwn(capturadoNull.props, "posicaoImagem"), true, "null é um valor explícito — a chave precisa continuar presente");
    assert.equal(capturadoNull.props.posicaoImagem, null, "correção deve omitir SOMENTE undefined, nunca converter/apagar null");

    const blocoVazio = blocoBase({ props: { imagemLargura: "" } });
    const capturadoVazio = api.captureBlock(blocoVazio);
    assert.equal(Object.hasOwn(capturadoVazio.props, "imagemLargura"), true);
    assert.equal(capturadoVazio.props.imagemLargura, "");

    const blocoZero = blocoBase({ props: { imagemLargura: 0 } });
    const capturadoZero = api.captureBlock(blocoZero);
    assert.equal(Object.hasOwn(capturadoZero.props, "imagemLargura"), true);
    assert.equal(capturadoZero.props.imagemLargura, 0);

    const blocoImagemLarguraNull = blocoBase({ props: { imagemLargura: null } });
    const capturadoImagemLarguraNull = api.captureBlock(blocoImagemLarguraNull);
    assert.equal(Object.hasOwn(capturadoImagemLarguraNull.props, "imagemLargura"), true);
    assert.equal(capturadoImagemLarguraNull.props.imagemLargura, null);
});

test("captureBlock: block.props completamente ausente (undefined) não quebra e não produz chaves", () => {
    const { api } = loadResponsiveV4();
    const bloco = blocoBase({ tipo: "texto_midia" });
    delete bloco.props;
    assert.equal(bloco.props, undefined, "pré-condição: bloco sem props nenhum, não só vazio");

    const capturado = api.captureBlock(bloco);
    // Object.keys(...).length em vez de deepEqual contra um literal {} —
    // capturado.props foi criado DENTRO do contexto vm (outro realm), então
    // seu Object.prototype difere do {} desta closure externa; deepEqual
    // (assert/strict) compara identidade de protótipo e falsamente
    // reportaria diferença mesmo com conteúdo estruturalmente idêntico.
    assert.equal(Object.keys(capturado.props).length, 0, "sem block.props, o resultado deveria ser um objeto vazio, nunca lançar nem incluir chaves undefined");
    assert.deepEqual(encontrarChavesUndefined(capturado), []);
});

test("captureBlock: block.props = {} (vazio, mas presente) não produz chaves", () => {
    const { api } = loadResponsiveV4();
    const bloco = blocoBase({ tipo: "texto_midia", props: {} });
    const capturado = api.captureBlock(bloco);
    assert.equal(Object.keys(capturado.props).length, 0);
});

test("saveDevice: desktop/tablet/mobile materializam props sem nenhuma chave undefined", () => {
    const { api, setBlocks } = loadResponsiveV4();
    const bloco = blocoBase({ tipo: "formulario_captura", props: { titulo: "Fale conosco" } });
    setBlocks([bloco]);

    for (const device of ["desktop", "tablet", "mobile"]) {
        api.saveDevice(device);
        const store = bloco.design.responsiveV4[device];
        assert.ok(store, `saveDevice(${device}) deveria materializar o estado do dispositivo`);
        assert.equal(Object.hasOwn(store.props, "posicaoImagem"), false, `${device}: posicaoImagem não deveria existir`);
        assert.equal(Object.hasOwn(store.props, "imagemLargura"), false, `${device}: imagemLargura não deveria existir`);
        assert.deepEqual(encontrarChavesUndefined(store), [], `${device}: nenhuma chave undefined em nenhum nível`);
    }
});

test("saveDevice materializa TODOS os blocos, não só o bloco editado — reproduz o incidente real", () => {
    const { api, setBlocks } = loadResponsiveV4();
    const textoMidia = blocoBase({ id: "b1", tipo: "texto_midia", props: { titulo: "T", subtitulo: "S" } });
    const formulario = blocoBase({ id: "b2", tipo: "formulario_captura", props: { titulo: "Fale conosco" } });
    setBlocks([textoMidia, formulario]);

    api.saveDevice("desktop");

    for (const bloco of [textoMidia, formulario]) {
        const props = bloco.design.responsiveV4.desktop.props;
        assert.equal(Object.hasOwn(props, "posicaoImagem"), false, `${bloco.id}: posicaoImagem não deveria existir`);
        assert.equal(Object.hasOwn(props, "imagemLargura"), false, `${bloco.id}: imagemLargura não deveria existir`);
    }
});

test("aura:studio-change materializa responsiveV4 depois do debounce (~300ms), sem chaves undefined", async () => {
    const { setBlocks, dispatchStudioChange, getBlocks } = loadResponsiveV4();
    const bloco = blocoBase({ tipo: "texto_midia", props: { titulo: "T", subtitulo: "S" } });
    setBlocks([bloco]);

    assert.equal(bloco.design.responsiveV4, undefined, "antes do evento, responsiveV4 ainda não deveria existir");

    dispatchStudioChange({ source: "inspector" });

    // Debounce real do módulo é 300ms — espera um pouco além disso (sem
    // fake timers no projeto pra este módulo) em vez de aumentar/alterar o
    // próprio timer de produção.
    await new Promise((resolve) => setTimeout(resolve, 400));

    const blocoAtual = getBlocks()[0];
    assert.ok(blocoAtual.design.responsiveV4?.desktop, "saveDevice deveria ter rodado depois do debounce");
    assert.equal(Object.hasOwn(blocoAtual.design.responsiveV4.desktop.props, "posicaoImagem"), false);
    assert.equal(Object.hasOwn(blocoAtual.design.responsiveV4.desktop.props, "imagemLargura"), false);
});

test("aura:studio-change disparado pela própria responsive-v4 (source: responsive-v4) não reagenda o debounce", async () => {
    const { setBlocks, dispatchStudioChange, getBlocks } = loadResponsiveV4();
    const bloco = blocoBase({ tipo: "texto_midia", props: {} });
    setBlocks([bloco]);

    dispatchStudioChange({ source: "responsive-v4" });
    await new Promise((resolve) => setTimeout(resolve, 400));

    assert.equal(getBlocks()[0].design.responsiveV4, undefined, "eventos originados da própria responsive-v4 não deveriam disparar um novo save");
});

test("inheritedState: tablet sem estado próprio herda de desktop, preservando o contrato de props", () => {
    const { api, setBlocks } = loadResponsiveV4();
    const bloco = blocoBase({ tipo: "texto_midia", props: { titulo: "T", posicaoImagem: "esquerda" } });
    setBlocks([bloco]);

    api.saveDevice("desktop");
    const estadoHerdado = api.getBlockDeviceState(0, "tablet");
    assert.equal(estadoHerdado.props.posicaoImagem, "esquerda", "tablet deveria herdar de desktop quando não tem estado próprio");
    assert.equal(Object.hasOwn(estadoHerdado.props, "imagemLargura"), false);
});

test("applyDevice aplica de volta o estado herdado real (applyBlockState) sem introduzir chaves undefined", () => {
    const { api, setBlocks } = loadResponsiveV4();
    const bloco = blocoBase({ tipo: "texto_midia", props: { titulo: "T", posicaoImagem: "esquerda" } });
    setBlocks([bloco]);

    api.saveDevice("desktop");
    api.applyDevice("tablet", { skipRender: true });

    assert.equal(bloco.props.posicaoImagem, "esquerda", "applyBlockState deveria aplicar de volta o valor herdado real no bloco");
    assert.equal(Object.hasOwn(bloco.props, "imagemLargura"), false, "applyBlockState não deveria introduzir imagemLargura quando o estado capturado não tinha essa chave");
});

test("resetDevice(\"desktop\") recaptura via captureBlock — nunca preserva um valor antigo/inválido do estado anterior", () => {
    const { api, setBlocks } = loadResponsiveV4();
    const bloco = blocoBase({ tipo: "formulario_captura", props: { titulo: "Fale conosco" } });
    setBlocks([bloco]);

    api.saveDevice("desktop");
    // Simula um estado desktop antigo/manipulado com um valor que o bloco
    // real não tem — resetDevice("desktop") precisa sempre recapturar do
    // bloco real via captureBlock(), nunca preservar isso.
    bloco.design.responsiveV4.desktop.props.imagemLargura = "valor-antigo-invalido";

    api.resetDevice("desktop");

    const props = bloco.design.responsiveV4.desktop.props;
    assert.equal(Object.hasOwn(props, "imagemLargura"), false, "resetDevice deveria recapturar do bloco real (sem imagemLargura), não preservar o valor antigo");
});

test("copyDevice copia o estado herdado real (via captureBlock/inheritedState) sem introduzir chaves undefined", () => {
    const { api, setBlocks } = loadResponsiveV4();
    const bloco = blocoBase({ tipo: "texto_midia", props: { titulo: "T", posicaoImagem: "direita" } });
    setBlocks([bloco]);

    api.saveDevice("desktop");
    api.copyDevice("desktop", "tablet");

    const propsTablet = bloco.design.responsiveV4.tablet.props;
    assert.equal(propsTablet.posicaoImagem, "direita", "copyDevice deveria preservar o valor real");
    assert.equal(Object.hasOwn(propsTablet, "imagemLargura"), false, "copyDevice não deveria introduzir imagemLargura");
});
