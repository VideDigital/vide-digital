import { app, shouldUseVideEmulators } from "../firebase-init.js";
import {
    connectFunctionsEmulator,
    getFunctions,
    httpsCallable
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";

const REGION = "southamerica-east1";
const functionsInstance = getFunctions(app, REGION);

if (shouldUseVideEmulators() && !window.__videFunctionsEmulatorConnected) {
    connectFunctionsEmulator(functionsInstance, "127.0.0.1", 5001);
    window.__videFunctionsEmulatorConnected = true;
}

function normalizeFunctionError(error) {
    const message = error?.message || error?.details?.message || "Não foi possível concluir a operação.";
    const code = error?.code || "functions/unknown";
    return { code, message, original: error };
}

async function callFunction(name, payload = {}) {
    try {
        const callable = httpsCallable(functionsInstance, name);
        const result = await callable(payload);
        return result.data || { ok: true };
    } catch (error) {
        throw normalizeFunctionError(error);
    }
}

export const VideFunctions = Object.freeze({
    createEmployee: (payload) => callFunction("createEmployee", payload),
    updateEmployee: (payload) => callFunction("updateEmployee", payload),
    disableEmployee: (payload) => callFunction("disableEmployee", payload),
    enableEmployee: (payload) => callFunction("enableEmployee", payload),
    resetEmployeePassword: (payload) => callFunction("resetEmployeePassword", payload),
    createAdminMember: (payload) => callFunction("createAdminMember", payload),
    syncAdminClaims: (payload) => callFunction("syncAdminClaims", payload),
    adminUpdateStoreStatus: (payload) => callFunction("adminUpdateStoreStatus", payload),
    adminUpdatePlan: (payload) => callFunction("adminUpdatePlan", payload),
    createPublicLead: (payload) => callFunction("createPublicLead", payload),
    incrementPublicMetric: (payload) => callFunction("incrementPublicMetric", payload),
    createPublicChat: (payload) => callFunction("createPublicChat", payload),
    sendPublicChatMessage: (payload) => callFunction("sendPublicChatMessage", payload),
    markNotificationRead: (payload) => callFunction("markNotificationRead", payload),
    auditWrite: (payload) => callFunction("auditWrite", payload),
    sendAdminChatMessage: (payload) => callFunction("sendAdminChatMessage", payload)
});

export default VideFunctions;
