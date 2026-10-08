"use strict";

const MODEL = "gemini-3.8-flash";
const FALLBACK_MODEL = "gemini-3.5-flash-lite";
const FUNCTION_TIMEOUT_SECONDS = 90;
// Stay below the existing callable client's 70s deadline without a Pages change.
const REQUEST_TIMEOUT_MS = 65000;
const ATTEMPT_TIMEOUT_MS = 35000;
const FALLBACK_TIMEOUT_MS = 25000;
const MAX_ATTEMPTS = 2;
const TRANSIENT_HTTP = new Set([500, 502, 503]);

// Dependencies are injectable for deterministic tests; no provider SDK retries.
function createProvider({ fetch, logger, HttpsError, random = Math.random,
    now = Date.now, schedule = setTimeout, cancel = clearTimeout }) {
    const deadlines = new WeakMap();
    const attemptFields = new WeakMap();
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
        const deadline = now() + REQUEST_TIMEOUT_MS;
        let requestSignal;
        try { return await bounded(signal => {
            requestSignal = signal;
            deadlines.set(signal, deadline);
            return work(signal);
        }, REQUEST_TIMEOUT_MS); }
        catch (error) {
            if (error.kind !== "timeout") throw error;
            const fields = attemptFields.get(requestSignal)?.("timeout", null) ??
                { caminho, model: MODEL, kind: "timeout", durationMs: REQUEST_TIMEOUT_MS };
            logger.error("[IA de Negócio] Deadline da aplicação", new Error("AI_REQUEST_TIMEOUT"), fields);
            throw unavailable();
        }
    }
    function waitForRetry(milliseconds, signal) {
        return new Promise((resolve, reject) => {
            if (signal?.aborted) return reject(unavailable());
            const onAbort = () => { cancel(timer); reject(unavailable()); };
            const timer = schedule(() => {
                signal?.removeEventListener("abort", onAbort);
                resolve();
            }, milliseconds);
            signal?.addEventListener("abort", onAbort, { once: true });
        });
    }
    async function chamarGemini(payload, apiKey, caminho, signal) {
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            if (signal?.aborted) throw unavailable();
            const start = now();
            const stage = attempt === 1 ? "primary" : "fallback";
            const model = attempt === 1 ? MODEL : FALLBACK_MODEL;
            const remaining = (deadlines.get(signal) ?? Infinity) - start;
            if (remaining <= 0) throw unavailable();
            // Same authorized content and limits; Lite supports minimal thinking.
            const attemptPayload = stage === "primary" ? payload : {
                ...payload, generationConfig: { ...payload.generationConfig,
                    thinkingConfig: { thinkingLevel: "minimal" } }
            };
            const fields = (kind, status) => ({ model, attempt, stage, caminho, kind,
                geminiStatus: status ?? null, durationMs: Math.max(0, now() - start) });
            if (signal) attemptFields.set(signal, fields);
            let failure;
            try {
                const result = await bounded(async attemptSignal => {
                    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(attemptPayload), signal: attemptSignal
                    });
                    if (!response.ok) {
                        // Cancel the unused body; never read/log provider error content.
                        try { await response.body?.cancel(); } catch { /* no content logging */ }
                        return { failure: { kind: "http", status: response.status } };
                    }
                    // Body decoding is part of the attempt deadline too.
                    return { value: await response.json() };
                }, Math.min(stage === "primary" ? ATTEMPT_TIMEOUT_MS : FALLBACK_TIMEOUT_MS, remaining), signal);
                if (!result.failure) {
                    if (signal?.aborted) throw unavailable();
                    logger[stage === "fallback" ? "warn" : "info"]("[IA de Negócio] Gemini respondeu", fields("success", 200));
                    return result.value;
                }
                failure = result.failure;
            } catch (error) {
                failure = { kind: error.kind === "timeout" || error.name === "AbortError" ? "timeout" : error instanceof SyntaxError ? "response" : "network" };
            }
            // The outer deadline owns the one final log when it aborts this operation.
            if (signal?.aborted) throw unavailable();
            const transient = TRANSIENT_HTTP.has(failure.status) || ["network", "timeout"].includes(failure.kind);
            if (transient && attempt < MAX_ATTEMPTS) {
                logger.warn("[IA de Negócio] Tentativa transitória do Gemini", fields(failure.kind, failure.status));
                const delay = 250 * 2 ** (attempt - 1) + Math.floor(random() * 250);
                await waitForRetry(delay, signal);
                continue;
            }
            const marker = failure.kind === "http" ? `GEMINI_HTTP_ERROR: provedor respondeu HTTP ${failure.status}` : `GEMINI_${failure.kind.toUpperCase()}_ERROR`;
            logger.error("[IA de Negócio] Erro do Gemini", new Error(marker), fields(failure.kind, failure.status));
            if (failure.status === 429) throw new HttpsError("resource-exhausted", "O provedor de IA está sem créditos disponíveis no momento. Avise o administrador da plataforma.");
            if (failure.status === 404) throw new HttpsError("unavailable", `A IA não conseguiu responder agora (modelo "${model}" não encontrado pelo provedor). Avise o administrador da plataforma.`);
            if (failure.kind === "http") throw new HttpsError("unavailable", `A IA não conseguiu responder agora (status ${failure.status} do provedor). Tente novamente em instantes.`);
            throw unavailable();
        }
        throw unavailable();
    }
    return { chamarGemini, runWithDeadline };
}
module.exports = { createProvider, MODEL, FALLBACK_MODEL, FUNCTION_TIMEOUT_SECONDS, REQUEST_TIMEOUT_MS, ATTEMPT_TIMEOUT_MS, FALLBACK_TIMEOUT_MS, MAX_ATTEMPTS };
