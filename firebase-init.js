// firebase-init.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { connectFirestoreEmulator, getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { connectAuthEmulator, getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { connectStorageEmulator, getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

function shouldUseVideEmulators() {
    const params = new URLSearchParams(window.location.search);
    const explicit =
        window.VIDE_HUB_USE_EMULATORS === true ||
        params.get("useEmulator") === "true" ||
        localStorage.getItem("videUseEmulator") === "true";
    const safeHost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
    const useEmulators = explicit && safeHost;
    // login.html?useEmulator=true não é levado adiante pelos redirecionamentos
    // internos do app (dashboard.html, admin.html, ...), que navegam via
    // window.location.href sem preservar query string. Sem persistir aqui, só
    // a primeira página ficava no Emulator e as seguintes caíam de volta pro
    // Firebase real — perigoso justamente no cenário que essa flag existe pra
    // evitar (testar local achando que está isolado e na real não estar).
    if (useEmulators) {
        localStorage.setItem("videUseEmulator", "true");
    }
    return useEmulators;
}

const usingEmulators = shouldUseVideEmulators();

// Dados extraídos diretamente do seu console oficial (vide-digital-saas).
// Sob Emulator, o projectId TEM que ser o mesmo usado por
// scripts/seed-emulator.mjs e pelos scripts test:ui:*/test:frontend:emulator
// (`demo-vide-hub`) — connectFirestoreEmulator só redireciona o HOST, nunca
// o projectId. Usar "vide-digital-saas" aqui faria o app ler/escrever num
// namespace vazio dentro do mesmo Emulator, sem nenhum erro (documento
// simplesmente "não existe"), enquanto o seed escreveu tudo no namespace
// certo — bug real encontrado rodando a suíte de UI de ponta a ponta pela
// primeira vez (antes bloqueada por rede no ambiente de desenvolvimento).
const firebaseConfig = {
    apiKey: "AIzaSyBON-cfEpnuQf496m9pnZJW24XoR_2nlwc",
    authDomain: "vide-digital-saas.firebaseapp.com",
    projectId: usingEmulators ? "demo-vide-hub" : "vide-digital-saas",
    storageBucket: "vide-digital-saas.firebasestorage.app",
    messagingSenderId: "891590456336",
    appId: "1:891590456336:web:bd51ac50399465b886c695"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

if (usingEmulators && !window.__videCoreEmulatorsConnected) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectStorageEmulator(storage, "127.0.0.1", 9199);
    window.__videCoreEmulatorsConnected = true;
    console.warn("[Vide Hub] Conectado aos Firebase Emulators (Auth/Firestore/Storage) — dados locais, não é produção.");
}

export { app, db, auth, storage, firebaseConfig, shouldUseVideEmulators };
