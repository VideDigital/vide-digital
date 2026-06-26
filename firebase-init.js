import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBON-cfEpnuQf496m9pnZJW24XoR_2nlwc",
  authDomain: "vide-digital-saas.firebaseapp.com",
  projectId: "vide-digital-saas",
  storageBucket: "vide-digital-saas.firebasestorage.app",
  messagingSenderId: "891590456336",
  appId: "1:891590456336:web:bd51ac50399465b886c695"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);

// Exporta os serviços para usar nos outros arquivos .js
export const auth = getAuth(app);
export const db = getFirestore(app);
