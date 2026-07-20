import { shouldUseVideEmulators, storage } from "../firebase-init.js";
import {
    getDownloadURL,
    ref,
    uploadBytes
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const DIGITAL_TYPES = new Set(["application/pdf"]);
const MAX_BYTES = Object.freeze({
    product: 5 * 1024 * 1024,
    profile: 2 * 1024 * 1024,
    banner: 6 * 1024 * 1024,
    landingPage: 5 * 1024 * 1024,
    digitalProduct: 50 * 1024 * 1024
});

function safeSegment(value) {
    return String(value || "").trim().replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120);
}

function validateFile(file, category) {
    if (!(file instanceof File || file instanceof Blob)) {
        throw new Error("Arquivo inválido.");
    }
    const max = MAX_BYTES[category];
    if (!max || file.size <= 0 || file.size > max) {
        throw new Error("Arquivo fora do limite permitido.");
    }
    const allowed = category === "digitalProduct" ? DIGITAL_TYPES : IMAGE_TYPES;
    if (!allowed.has(file.type)) {
        throw new Error("Tipo de arquivo não permitido.");
    }
}

function buildPath({ ownerUid, category, entityId, fileName }) {
    const owner = safeSegment(ownerUid);
    const entity = safeSegment(entityId || "default");
    const name = safeSegment(fileName || `${Date.now()}`);
    if (!owner) throw new Error("Tenant obrigatório para upload.");
    if (category === "product") return `stores/${owner}/products/${entity}/${name}`;
    if (category === "profile") return `stores/${owner}/profile/${name}`;
    if (category === "banner") return `stores/${owner}/banners/${name}`;
    if (category === "landingPage") return `stores/${owner}/landing-pages/${entity}/${name}`;
    if (category === "digitalProduct") return `stores/${owner}/digital-products/${entity}/${name}`;
    throw new Error("Categoria de upload inválida.");
}

export async function uploadVideFile({ ownerUid, category, entityId, file }) {
    validateFile(file, category);
    const path = buildPath({ ownerUid, category, entityId, fileName: file.name });
    const storageRef = ref(storage, path);
    const result = await uploadBytes(storageRef, file, { contentType: file.type });
    const url = await getDownloadURL(result.ref);
    return { path, url, contentType: file.type, size: file.size };
}

export const VideStorage = Object.freeze({ uploadVideFile });
