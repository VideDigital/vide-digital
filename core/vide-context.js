import {
    collection,
    doc,
    getDoc,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export const VIDE_SUPER_ADMIN_EMAIL = "danielmarcelino549@gmail.com";

const DEFAULT_PLAN_LIMITS = Object.freeze({
    produtos: 3,
    rascunhos: 5
});

const DEFAULT_CONTEXT = Object.freeze({
    initialized: false,
    authUser: null,
    authUid: null,
    authEmail: "",
    effectiveUid: null,
    ownerUid: null,
    storeUid: null,
    targetUid: null,
    userType: "guest",
    isOwner: false,
    isEmployee: false,
    isAdmin: false,
    isMasterMode: false,
    employee: null,
    owner: null,
    plan: "starter",
    features: [],
    permissions: {
        view: [],
        edit: []
    },
    active: false,
    status: "guest"
});

let contextState = { ...DEFAULT_CONTEXT };
let planState = {
    plan: "starter",
    features: [],
    limits: { ...DEFAULT_PLAN_LIMITS }
};

function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
}

function normalizeArray(value) {
    return Array.isArray(value)
        ? value.map(item => String(item)).filter(Boolean)
        : [];
}

function clonePlain(value) {
    return value == null
        ? value
        : JSON.parse(JSON.stringify(value));
}

function publicUser(user) {
    if (!user) return null;
    return {
        uid: user.uid || null,
        email: user.email || "",
        displayName: user.displayName || "",
        photoURL: user.photoURL || ""
    };
}

function buildPermissions(employee) {
    const view = normalizeArray(employee?.permissoes?.ver);
    const edit = normalizeArray(employee?.permissoes?.editar);
    const mergedView = Array.from(new Set([...view, ...edit]));

    return {
        view: mergedView,
        edit
    };
}

export function isVideSuperAdminEmail(email) {
    return normalizeEmail(email) === VIDE_SUPER_ADMIN_EMAIL;
}

export async function getAdminMembership(db, authUser) {
    const email = normalizeEmail(authUser?.email);
    const uid = authUser?.uid || "";

    if (!email && !uid) return null;

    if (isVideSuperAdminEmail(email)) {
        return {
            id: "super-admin",
            email,
            uid,
            superAdmin: true,
            permissoes: ["*"]
        };
    }

    const snapEquipe = await getDocs(collection(db, "equipe_admin"));
    const match = snapEquipe.docs.find(item => {
        const data = item.data() || {};
        return (
            normalizeEmail(data.email) === email ||
            (uid && data.uid === uid)
        );
    });

    if (!match) return null;

    return {
        id: match.id,
        ...(match.data() || {}),
        superAdmin: false
    };
}

function denied(reason, message, extra = {}) {
    return {
        allowed: false,
        reason,
        message,
        context: {
            ...DEFAULT_CONTEXT,
            ...extra,
            initialized: true,
            status: reason
        }
    };
}

function allowed(context) {
    return {
        allowed: true,
        reason: "ok",
        message: "",
        context: {
            ...DEFAULT_CONTEXT,
            ...context,
            initialized: true,
            active: true,
            status: "active"
        }
    };
}

export async function resolveVideHubIdentity({
    authUser,
    db,
    masterUID = ""
} = {}) {
    const authUid = authUser?.uid || null;
    const authEmail = normalizeEmail(authUser?.email);
    const masterTarget = String(masterUID || "").trim();

    if (!authUid) {
        return denied("auth/missing-user", "Sessão inválida. Entre novamente.");
    }

    const base = {
        authUser: publicUser(authUser),
        authUid,
        authEmail
    };

    const adminMembership = await getAdminMembership(db, authUser);
    const isAdmin = Boolean(adminMembership);

    const ownerSnap = await getDoc(doc(db, "usuarios", authUid));

    if (isAdmin && masterTarget) {
        const targetSnap = await getDoc(doc(db, "usuarios", masterTarget));
        if (!targetSnap.exists()) {
            return denied("master/target-not-found", "A loja solicitada não foi encontrada.", {
                ...base,
                isAdmin: true,
                userType: "admin"
            });
        }

        const owner = { id: masterTarget, ...(targetSnap.data() || {}) };
        if (owner.status !== "aprovado") {
            return denied("master/target-inactive", "A loja solicitada não está ativa.", {
                ...base,
                isAdmin: true,
                userType: "admin",
                owner
            });
        }

        return allowed({
            ...base,
            effectiveUid: masterTarget,
            ownerUid: masterTarget,
            storeUid: masterTarget,
            targetUid: masterTarget,
            userType: "admin",
            isAdmin: true,
            isMasterMode: masterTarget !== authUid,
            owner,
            plan: owner.plano || "starter",
            features: normalizeArray(owner.featuresManuais)
        });
    }

    if (isAdmin && !masterTarget) {
        return allowed({
            ...base,
            effectiveUid: authUid,
            ownerUid: authUid,
            storeUid: authUid,
            userType: "admin",
            isAdmin: true
        });
    }

    if (ownerSnap.exists()) {
        const owner = { id: authUid, ...(ownerSnap.data() || {}) };
        if (owner.status !== "aprovado") {
            return denied(`owner/${owner.status || "inactive"}`, "Sua conta ainda não está liberada para acesso.", {
                ...base,
                owner,
                ownerUid: authUid,
                storeUid: authUid,
                effectiveUid: authUid,
                userType: "owner",
                isOwner: true
            });
        }

        return allowed({
            ...base,
            effectiveUid: authUid,
            ownerUid: authUid,
            storeUid: authUid,
            userType: "owner",
            isOwner: true,
            isAdmin,
            owner,
            plan: owner.plano || "starter",
            features: normalizeArray(owner.featuresManuais)
        });
    }

    const employeeSnap = await getDoc(doc(db, "funcionarios", authUid));
    if (!employeeSnap.exists()) {
        return denied("auth/profile-not-found", "Nenhuma conta encontrada. Verifique seu acesso com o responsável pela loja.", base);
    }

    if (masterTarget) {
        return denied("employee/master-denied", "Funcionários não podem acessar o modo Master.", base);
    }

    const employee = { id: authUid, ...(employeeSnap.data() || {}) };
    if (employee.status !== "ativo") {
        return denied("employee/inactive", "Seu acesso de funcionário está inativo. Fale com o responsável pela loja.", {
            ...base,
            employee,
            userType: "employee",
            isEmployee: true
        });
    }

    const donoUID = String(employee.donoUID || "").trim();
    if (!donoUID || donoUID === authUid) {
        return denied("employee/missing-owner", "Seu acesso não está vinculado a uma loja válida.", {
            ...base,
            employee,
            userType: "employee",
            isEmployee: true
        });
    }

    const employeeOwnerSnap = await getDoc(doc(db, "usuarios", donoUID));
    if (!employeeOwnerSnap.exists()) {
        return denied("employee/owner-not-found", "A loja vinculada ao seu acesso não foi encontrada.", {
            ...base,
            employee,
            userType: "employee",
            isEmployee: true
        });
    }

    const owner = { id: donoUID, ...(employeeOwnerSnap.data() || {}) };
    if (owner.status !== "aprovado") {
        return denied("employee/owner-inactive", "A loja vinculada ao seu acesso não está ativa.", {
            ...base,
            employee,
            owner,
            userType: "employee",
            isEmployee: true
        });
    }

    const permissions = buildPermissions(employee);
    return allowed({
        ...base,
        effectiveUid: donoUID,
        ownerUid: donoUID,
        storeUid: donoUID,
        userType: "employee",
        isEmployee: true,
        employee,
        owner,
        plan: owner.plano || "starter",
        features: normalizeArray(owner.featuresManuais),
        permissions
    });
}

function freezeSnapshot(state) {
    return Object.freeze(clonePlain(state));
}

export const VidePlanService = {
    setPlan(plan, features = [], limits = {}) {
        planState = {
            plan: plan || "starter",
            features: normalizeArray(features),
            limits: {
                ...DEFAULT_PLAN_LIMITS,
                ...(limits || {})
            }
        };
    },

    getPlan() {
        return planState.plan;
    },

    hasFeature(key) {
        if (!key) return true;
        return planState.features.includes(key);
    },

    getLimits() {
        return Object.freeze({ ...planState.limits });
    },

    getSnapshot() {
        return freezeSnapshot(planState);
    }
};

export const VideHubContext = {
    initialized: false,

    async initialize(options = {}) {
        const result = await resolveVideHubIdentity(options);
        contextState = result.context;
        this.initialized = true;

        window.dispatchEvent(new CustomEvent("videhub:context-ready", {
            detail: this.getSnapshot()
        }));

        return result;
    },

    reset() {
        contextState = { ...DEFAULT_CONTEXT };
        this.initialized = false;
        VidePlanService.setPlan("starter", [], DEFAULT_PLAN_LIMITS);
    },

    canView(moduleKey) {
        if (!moduleKey) return true;
        if (contextState.isAdmin || contextState.isOwner) return true;
        if (!contextState.isEmployee) return false;
        return contextState.permissions.view.includes(moduleKey) ||
            contextState.permissions.edit.includes(moduleKey);
    },

    canEdit(moduleKey) {
        if (!moduleKey) return true;
        if (contextState.isAdmin || contextState.isOwner) return true;
        if (!contextState.isEmployee) return false;
        return contextState.permissions.edit.includes(moduleKey);
    },

    hasFeature(featureKey) {
        if (contextState.isAdmin) return true;
        return VidePlanService.hasFeature(featureKey);
    },

    isActive() {
        return Boolean(contextState.active);
    },

    getOwnerUid() {
        return contextState.ownerUid;
    },

    getEffectiveUid() {
        return contextState.effectiveUid;
    },

    getStoreUid() {
        return contextState.storeUid;
    },

    getSnapshot() {
        return freezeSnapshot(contextState);
    }
};

window.VideHubContext = VideHubContext;
window.VidePlanService = VidePlanService;
