import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const requiredFiles = [
    "core/vide-context.js",
    "docs/VIDE_CONTEXT_ARCHITECTURE.md",
    "docs/SECURITY_FINDINGS_PHASE_1.md",
    "docs/FIREBASE_SECURITY_AUDIT.md",
    "docs/WRITE_PERMISSION_AUDIT.md",
    "docs/RELEASE_CANDIDATE_AUDIT.md",
    "docs/RELEASE_CANDIDATE_TEST_PLAN.md",
    "docs/DEPLOYMENT_GUIDE.md",
    "docs/ROLLBACK_GUIDE.md",
    "docs/FIRESTORE_RULES_PLAN.md",
    "docs/STORAGE_RULES_PLAN.md",
    "docs/FIREBASE_SECURITY_MIGRATION_PLAN.md",
    "docs/CLOUD_FUNCTIONS_PLAN.md",
    "docs/FIREBASE_INDEXES_PLAN.md",
    "firebase/firestore.rules.proposed",
    "firebase/storage.rules.proposed",
    "tests/security-permission-harness.mjs",
    "tests/firestore-rules-test-plan.md",
    "tests/storage-rules-test-plan.md"
];

function read(file) {
    return fs.readFileSync(path.join(root, file), "utf8");
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const results = [
    "[INFO] release-candidate-harness is a document smoke test only.",
    "[INFO] It does not validate Firebase Rules, Auth, tenant isolation, Storage, Cloud Functions, or UI flows."
];

function check(name, fn) {
    try {
        fn();
        results.push(`[OK] ${name}`);
    } catch (error) {
        results.push(`[FAIL] ${name}: ${error.message}`);
        process.exitCode = 1;
    }
}

check("document smoke: required release candidate files exist", () => {
    for (const file of requiredFiles) {
        assert(fs.existsSync(path.join(root, file)), `${file} is missing`);
    }
});

check("static contract: dashboard app imports Vide Hub context", () => {
    const dashboardApp = read("dashboard-app.js");
    assert(
        dashboardApp.includes('from "./core/vide-context.js"'),
        "dashboard-app.js must import core/vide-context.js"
    );
    assert(
        dashboardApp.includes("usuarioUID = contextoVide.effectiveUid || user.uid"),
        "legacy usuarioUID must keep using effectiveUid"
    );
});

check("static contract: login and admin import centralized context", () => {
    assert(read("login.html").includes('from "./core/vide-context.js"'), "login.html missing context import");
    assert(read("admin.html").includes('from "./core/vide-context.js"'), "admin.html missing context import");
});

check("static contract: landing pages permission is separated from settings", () => {
    const core = read("core/vide-context.js");
    const app = read("dashboard-app.js");
    assert(core.includes('"landing-pages"'), "core missing landing-pages alias group");
    assert(app.includes('"view-landing-pages": "landing-pages"'), "navigation missing landing-pages mapping");
    assert(!app.includes('"view-landing-pages": "configuracoes"'), "landing pages must not map to configuracoes");
});

check("static contract: feature checks delegate to VidePlanService", () => {
    const app = read("dashboard-app.js");
    assert(app.includes("VidePlanService.isInitialized()"), "missing plan initialized gate");
    assert(app.includes("VidePlanService.hasFeature(feature)"), "missing VidePlanService delegation");
});

check("static contract: critical frontend write guard strings are present", () => {
    const app = read("dashboard-app.js");
    for (const guard of [
        'exigirEdicaoModulo("produtos")',
        'exigirEdicaoModulo("pedidos")',
        'exigirEdicaoModulo("leads")',
        'exigirEdicaoModulo("funcionarios")',
        'exigirEdicaoModulo("configuracoes")',
        'exigirEdicaoModulo("landing-pages")'
    ]) {
        assert(app.includes(guard), `${guard} missing`);
    }
});

check("document smoke: proposed and local testable rules are explicit artifacts", () => {
    assert(
        fs.existsSync(path.join(root, "firebase/firestore.rules.proposed")),
        "firestore proposal missing"
    );
    assert(
        fs.existsSync(path.join(root, "firebase/storage.rules.proposed")),
        "storage proposal missing"
    );
    assert(
        fs.existsSync(path.join(root, "firestore.rules")),
        "local testable firestore.rules missing"
    );
    assert(
        fs.existsSync(path.join(root, "storage.rules")),
        "local testable storage.rules missing"
    );
    assert(
        read("docs/DEPLOYMENT_GUIDE.md").includes("Não executar `firebase deploy` contra produção"),
        "deployment guide must keep production deploy blocked"
    );
});

check("document smoke: migration plan exists", () => {
    assert(
        fs.existsSync(path.join(root, "docs/FIREBASE_SECURITY_MIGRATION_PLAN.md")),
        "firebase security migration plan missing"
    );
});

process.stdout.write(`${results.join("\n")}\n`);
