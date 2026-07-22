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
    initialized: false,
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

const MODULE_ALIASES = Object.freeze({
    dashboard: ["dashboard", "cockpit"],
    produtos: ["produtos", "catalogo", "catálogo"],
    pedidos: ["pedidos", "hub"],
    leads: ["leads", "crm", "automacao-leads", "automacao_leads", "automacaoLeads"],
    templates: ["templates"],
    campanhas: ["campanhas"],
    metricas: ["metricas", "métricas"],
    configuracoes: ["configuracoes", "configurações", "personalizacao", "personalização"],
    "landing-pages": ["landing-pages", "landing_pages", "landingPages", "paginas", "páginas", "landing", "lp", "studio"],
    funcionarios: ["funcionarios", "funcionários", "subcontas", "equipe"],
    "central-ia": ["central-ia", "central_ia", "gerenciar_ia", "ia", "inteligencia-artificial"],
    "base-conhecimento-ia": ["base-conhecimento-ia", "base_conhecimento_ia", "conhecimento-ia", "conhecimento_ia", "knowledge-base", "base-ia"],
    atendimento: ["atendimento", "conversas", "atendimento_chat", "templates_atendimento"]
});

const MODULE_ALIAS_LOOKUP = Object.freeze(
    Object.entries(MODULE_ALIASES).reduce((acc, [canonical, aliases]) => {
        aliases.forEach(alias => {
            acc[String(alias).trim().toLowerCase()] = canonical;
        });
        acc[String(canonical).trim().toLowerCase()] = canonical;
        return acc;
    }, {})
);

export function normalizeModuleKey(moduleKey) {
    const key = String(moduleKey || "").trim();
    if (!key) return "";
    return MODULE_ALIAS_LOOKUP[key.toLowerCase()] || key;
}

function normalizeModuleArray(value) {
    return Array.from(new Set(normalizeArray(value).map(normalizeModuleKey).filter(Boolean)));
}

function clonePlain(value) {
    return value == null
        ? value
        : JSON.parse(JSON.stringify(value));
}

function deepFreeze(value, seen = new WeakSet()) {
    if (!value || typeof value !== "object" || seen.has(value)) return value;
    seen.add(value);
    Object.freeze(value);
    Object.keys(value).forEach(key => deepFreeze(value[key], seen));
    return value;
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
    const view = normalizeModuleArray(employee?.permissoes?.ver);
    const edit = normalizeModuleArray(employee?.permissoes?.editar);
    const mergedView = Array.from(new Set([...view, ...edit]));

    return {
        view: mergedView,
        edit
    };
}

export function isVideSuperAdminEmail(email) {
    return normalizeEmail(email) === VIDE_SUPER_ADMIN_EMAIL;
}

function isPermissionDenied(error) {
    return error?.code === "permission-denied" ||
        error?.code === "PERMISSION_DENIED";
}

async function safeGetDoc(docRef, { toleratePermissionDenied = false } = {}) {
    try {
        return await getDoc(docRef);
    } catch (error) {
        if (toleratePermissionDenied && isPermissionDenied(error)) {
            return null;
        }
        throw error;
    }
}

export async function getAdminMembership(db, authUser, options = {}) {
    const email = normalizeEmail(authUser?.email);
    const uid = authUser?.uid || "";
    const toleratePermissionDenied = Boolean(options.toleratePermissionDenied);

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

    let snapEquipe;
    try {
        snapEquipe = await getDocs(collection(db, "equipe_admin"));
    } catch (error) {
        if (toleratePermissionDenied && isPermissionDenied(error)) {
            return null;
        }
        throw error;
    }

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

    let adminMembership = null;

    if (isVideSuperAdminEmail(authEmail)) {
        adminMembership = await getAdminMembership(db, authUser);
    }

    const resolveAdmin = async () => {
        if (!adminMembership) {
            adminMembership = await getAdminMembership(db, authUser, {
                toleratePermissionDenied: true
            });
        }

        if (!adminMembership) return null;

        if (!masterTarget) {
            return allowed({
                ...base,
                effectiveUid: authUid,
                ownerUid: authUid,
                storeUid: authUid,
                userType: "admin",
                isAdmin: true
            });
        }

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
    };

    if (adminMembership) {
        const adminResult = await resolveAdmin();
        if (adminResult) return adminResult;
    }

    const ownerSnap = await safeGetDoc(
        doc(db, "usuarios", authUid),
        { toleratePermissionDenied: true }
    );

    if (ownerSnap?.exists()) {
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
            owner,
            plan: owner.plano || "starter",
            features: normalizeArray(owner.featuresManuais)
        });
    }

    const confirmedAdminResult = await resolveAdmin();
    if (confirmedAdminResult) return confirmedAdminResult;

    const employeeSnap = await safeGetDoc(
        doc(db, "funcionarios", authUid),
        { toleratePermissionDenied: true }
    );

    if (!ownerSnap && !employeeSnap) {
        return denied("auth/profile-permission-denied", "Não foi possível confirmar sua identidade com segurança. Tente novamente ou fale com o responsável pela loja.", base);
    }

    if (!employeeSnap?.exists()) {
        const adminResult = await resolveAdmin();
        if (adminResult) return adminResult;

        if (ownerSnap === null || employeeSnap === null) {
            return denied("auth/profile-permission-denied", "Não foi possível confirmar sua identidade com segurança. Tente novamente ou fale com o responsável pela loja.", base);
        }

        if (masterTarget) {
            return denied("master/not-admin", "Você não tem permissão para acessar o modo Master.", base);
        }

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
    return deepFreeze(clonePlain(state));
}

export const VidePlanService = {
    setPlan(plan, features = [], limits = {}) {
        planState = {
            initialized: true,
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

    isInitialized() {
        return Boolean(planState.initialized);
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
        planState.initialized = false;
    },

    canView(moduleKey) {
        const normalizedModule = normalizeModuleKey(moduleKey);
        if (!normalizedModule) return true;
        if (contextState.isAdmin || contextState.isOwner) return true;
        if (!contextState.isEmployee) return false;
        return contextState.permissions.view.includes(normalizedModule) ||
            contextState.permissions.edit.includes(normalizedModule);
    },

    canEdit(moduleKey) {
        const normalizedModule = normalizeModuleKey(moduleKey);
        if (!normalizedModule) return true;
        if (contextState.isAdmin || contextState.isOwner) return true;
        if (!contextState.isEmployee) return false;
        return contextState.permissions.edit.includes(normalizedModule);
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
