// firebase-init.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { connectFirestoreEmulator, getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { connectAuthEmulator, getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { connectStorageEmulator, getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// Dados extraídos diretamente do seu console oficial (vide-digital-saas)
const firebaseConfig = {
    apiKey: "AIzaSyBON-cfEpnuQf496m9pnZJW24XoR_2nlwc",
    authDomain: "vide-digital-saas.firebaseapp.com",
    projectId: "vide-digital-saas",
    storageBucket: "vide-digital-saas.firebasestorage.app",
    messagingSenderId: "891590456336",
    appId: "1:891590456336:web:bd51ac50399465b886c695"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

function shouldUseVideEmulators() {
    const params = new URLSearchParams(window.location.search);
    const explicit =
        window.VIDE_HUB_USE_EMULATORS === true ||
        params.get("useEmulator") === "true" ||
        localStorage.getItem("videUseEmulator") === "true";
    const safeHost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
    return explicit && safeHost;
}

if (shouldUseVideEmulators() && !window.__videCoreEmulatorsConnected) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectStorageEmulator(storage, "127.0.0.1", 9199);
    window.__videCoreEmulatorsConnected = true;
    console.warn("[Vide Hub] Conectado aos Firebase Emulators (Auth/Firestore/Storage) — dados locais, não é produção.");
}

export { app, db, auth, storage, firebaseConfig, shouldUseVideEmulators };
