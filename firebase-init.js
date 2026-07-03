// firebase-init.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

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

export { db, auth, firebaseConfig };
