// Cola do reporter central de erros do frontend com o navegador e com a
// Function reportFrontendError (VIDE-HUB-FRONTEND-ERROR-TELEMETRY-071).
// Regras de captura, sanitização, dedupe e limites: frontend-error-reporter-core.js.
//
// Uso:
// - módulos: import { installFrontendErrorTelemetry, reportFrontendError }
// - scripts clássicos: window.VideFrontendTelemetry?.report(erro, { category })
//
// Um único reporter por página (estado em window), mesmo que este módulo
// seja importado por vários outros. Nada aqui pode quebrar a página: todo
// caminho é try/catch e o envio é best-effort.
import { app, shouldUseVideEmulators } from "./firebase-init.js";
import {
    connectFunctionsEmulator,
    getFunctions,
    httpsCallable
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-functions.js";
import {
    createFrontendErrorReporter,
    installGlobalErrorHandlers,
    runWithErrorBoundary
} from "./frontend-error-reporter-core.js";

const REGION = "southamerica-east1";
const FUNCTION_NAME = "reportFrontendError";
const SEND_TIMEOUT_MS = 10000;

let callable = null;
function obterCallable() {
    if (callable) return callable;
    const functionsInstance = getFunctions(app, REGION);
    // Mesmo guard das demais páginas: conectar duas vezes na mesma instância
    // lança erro. Painel usa __videFunctionsEmulatorConnected
    // (core/vide-functions.js); páginas públicas usam
    // __videPublicFunctionsEmulatorConnected.
    if (shouldUseVideEmulators() &&
        !window.__videFunctionsEmulatorConnected &&
        !window.__videPublicFunctionsEmulatorConnected) {
        connectFunctionsEmulator(functionsInstance, "127.0.0.1", 5001);
        window.__videFunctionsEmulatorConnected = true;
        window.__videPublicFunctionsEmulatorConnected = true;
    }
    callable = httpsCallable(functionsInstance, FUNCTION_NAME, { timeout: SEND_TIMEOUT_MS });
    return callable;
}

function estadoDaPagina() {
    if (!window.__videFrontendTelemetry) {
        window.__videFrontendTelemetry = {
            reporter: createFrontendErrorReporter({
                send: (payload) => obterCallable()(payload),
                isOnline: () => navigator.onLine !== false,
                getRoute: () => window.location.pathname,
                // Versão estática do build (version.js, só no painel). Páginas
                // públicas não carregam version.js: release fica nulo.
                getRelease: () => (typeof window.VIDE_AURA_BUILD?.versao === "string" ? window.VIDE_AURA_BUILD.versao : null)
            }),
            installed: false
        };
    }
    return window.__videFrontendTelemetry;
}

export function reportFrontendError(error, { category, type = "operational" } = {}) {
    try {
        return estadoDaPagina().reporter.report(error, { type, category });
    } catch {
        return "error";
    }
}

// Fronteira de fluxo assíncrono: na falha mostra o estado de erro
// (onFailure) e reporta a categoria; nunca relança.
export function runWithFrontendErrorBoundary(fn, { category, onFailure } = {}) {
    let reporter = null;
    try {
        reporter = estadoDaPagina().reporter;
    } catch {
        reporter = null;
    }
    return runWithErrorBoundary(fn, { reporter, category, onFailure });
}

export function installFrontendErrorTelemetry() {
    try {
        const estado = estadoDaPagina();
        if (!estado.installed) {
            estado.installed = installGlobalErrorHandlers(window, estado.reporter) || estado.installed;
        }
        if (!window.VideFrontendTelemetry) {
            window.VideFrontendTelemetry = Object.freeze({ report: reportFrontendError });
        }
        return true;
    } catch {
        return false;
    }
}
