"use strict";

const MODEL = "gemini-3.8-flash";
const FUNCTION_TIMEOUT_SECONDS = 60;
const REQUEST_TIMEOUT_MS = 50000;
const ATTEMPT_TIMEOUT_MS = 20000;
const MAX_ATTEMPTS = 2;
const TRANSIENT_HTTP = new Set([500, 502, 503]);

// Dependencies are injectable for deterministic tests; no provider SDK retries.
function createProvider({ fetch, logger, HttpsError, random = Math.random,
    now = Date.now, schedule = setTimeout, cancel = clearTimeout }) {
    const unavailable = () => new HttpsError("unavailable", "Não foi possível falar com a IA agora. Tente novamente em instantes.");
    function bounded(work, milliseconds, parent) {
        const controller = new AbortController();
        let timer, onAbort;
        const stopped = new Promise((_, reject) => {
            onAbort = () => { controller.abort(); reject(Object.assign(new Error("LOCAL_TIMEOUT"), { kind: "timeout" })); };
            if (parent?.aborted) onAbort();
            else {
                parent?.addEventListener("abort", onAbort, { once: true });
                timer = schedule(onAbort, milliseconds);
            }
        });
        return Promise.race([stopped, Promise.resolve().then(() => {
            if (controller.signal.aborted) throw Object.assign(new Error("LOCAL_TIMEOUT"), { kind: "timeout" });
            return work(controller.signal);
        })]).finally(() => { cancel(timer); parent?.removeEventListener("abort", onAbort); });
    }
    async function runWithDeadline(work, caminho) {
        try { return await bounded(work, REQUEST_TIMEOUT_MS); }
        catch (error) {
            if (error.kind !== "timeout") throw error;
            logger.error("[IA de Negócio] Deadline da aplicação", new Error("AI_REQUEST_TIMEOUT"), { caminho, model: MODEL, kind: "timeout", durationMs: REQUEST_TIMEOUT_MS });
            throw unavailable();
        }
    }
    async function chamarGemini(payload, apiKey, caminho, signal) {
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            if (signal?.aborted) throw unavailable();
            const start = now();
            let failure;
            try {
                const result = await bounded(async attemptSignal => {
                    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`, {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload), signal: attemptSignal
                    });
                    if (!response.ok) {
                        // Cancel the unused body; never read/log provider error content.
                        try { await response.body?.cancel(); } catch { /* no content logging */ }
                        return { failure: { kind: "http", status: response.status } };
                    }
                    // Body decoding is part of the attempt deadline too.
                    return { value: await response.json() };
                }, ATTEMPT_TIMEOUT_MS, signal);
                if (!result.failure) return result.value;
                failure = result.failure;
            } catch (error) {
                failure = { kind: error.kind === "timeout" || error.name === "AbortError" ? "timeout" : error instanceof SyntaxError ? "response" : "network" };
            }
            // The outer deadline owns the one final log when it aborts this operation.
            if (signal?.aborted) throw unavailable();
            const fields = { model: MODEL, attempt, caminho, kind: failure.kind,
                geminiStatus: failure.status ?? null, durationMs: Math.max(0, now() - start) };
            const transient = TRANSIENT_HTTP.has(failure.status) || ["network", "timeout"].includes(failure.kind);
            if (transient && attempt < MAX_ATTEMPTS) {
                logger.warn("[IA de Negócio] Tentativa transitória do Gemini", fields);
                const delay = 250 * 2 ** (attempt - 1) + Math.floor(random() * 250);
                await bounded(() => new Promise(resolve => schedule(resolve, delay)), delay + 1, signal).catch(() => { throw unavailable(); });
                continue;
            }
            const marker = failure.kind === "http" ? `GEMINI_HTTP_ERROR: provedor respondeu HTTP ${failure.status}` : `GEMINI_${failure.kind.toUpperCase()}_ERROR`;
            logger.error("[IA de Negócio] Erro do Gemini", new Error(marker), fields);
            if (failure.status === 429) throw new HttpsError("resource-exhausted", "O provedor de IA está sem créditos disponíveis no momento. Avise o administrador da plataforma.");
            if (failure.status === 404) throw new HttpsError("unavailable", `A IA não conseguiu responder agora (modelo "${MODEL}" não encontrado pelo provedor). Avise o administrador da plataforma.`);
            if (failure.kind === "http") throw new HttpsError("unavailable", `A IA não conseguiu responder agora (status ${failure.status} do provedor). Tente novamente em instantes.`);
            throw unavailable();
        }
        throw unavailable();
    }
    return { chamarGemini, runWithDeadline };
}
module.exports = { createProvider, MODEL, FUNCTION_TIMEOUT_SECONDS, REQUEST_TIMEOUT_MS, ATTEMPT_TIMEOUT_MS, MAX_ATTEMPTS };
