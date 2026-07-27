// firebase-init.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    connectFirestoreEmulator,
    doc,
    getFirestore,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
    connectAuthEmulator,
    getAuth
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
    connectStorageEmulator,
    getStorage
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

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
    connectAuthEmulator(auth, "http://127.0.0.1:9099", {
        disableWarnings: true
    });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectStorageEmulator(storage, "127.0.0.1", 9199);
    window.__videCoreEmulatorsConnected = true;
    console.warn(
        "[Vide Hub] Conectado aos Firebase Emulators " +
        "(Auth/Firestore/Storage) — dados locais, não é produção."
    );
}

/* =========================================================
   VIDE HUB — FAVICON DINÂMICO DA LOJA
   ---------------------------------------------------------
   O favicon é salvo em vitrines_publicas/{slug}. Este runtime
   observa o documento público e aplica o ícone tanto em
   loja.html quanto no dashboard da loja.

   Ele substitui todos os links de ícone existentes, cria URLs
   novas para evitar cache antigo e também atualiza o ícone
   usado ao salvar um atalho no celular.
   ========================================================= */

const VIDE_FAVICON_PADRAO =
    "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20512%20512%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%2264%22%20y1%3D%2248%22%20x2%3D%22448%22%20y2%3D%22464%22%20gradientUnits%3D%22userSpaceOnUse%22%3E%3Cstop%20stop-color%3D%22%23C026D3%22%2F%3E%3Cstop%20offset%3D%22.48%22%20stop-color%3D%22%237C3AED%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%232563EB%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22512%22%20height%3D%22512%22%20rx%3D%22112%22%20fill%3D%22%2307070A%22%2F%3E%3Crect%20x%3D%2218%22%20y%3D%2218%22%20width%3D%22476%22%20height%3D%22476%22%20rx%3D%2298%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Cpath%20d%3D%22M112%20132h76l68%20190%2068-190h76L292%20392h-72L112%20132Z%22%20fill%3D%22%23fff%22%2F%3E%3Cpath%20d%3D%22M181%20132h58l17%2048%2017-48h58l-75%20199-75-199Z%22%20fill%3D%22%23fff%22%20opacity%3D%22.18%22%2F%3E%3C%2Fsvg%3E";

const VIDE_FAVICON_RUNTIME_KEY = "__videFaviconRuntimeV2";

function caminhoAtualEh(nomeArquivo) {
    const caminho = String(window.location.pathname || "")
        .toLowerCase()
        .replace(/\/+$/, "");

    return (
        caminho.endsWith("/" + nomeArquivo) ||
        caminho === nomeArquivo ||
        caminho.endsWith(nomeArquivo)
    );
}

function paginaUsaFaviconDaLoja() {
    return (
        caminhoAtualEh("dashboard.html") ||
        caminhoAtualEh("loja.html")
    );
}

function normalizarSlugFavicon(valor) {
    return String(valor || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, "")
        .slice(0, 160);
}

function valorFaviconValido(valor) {
    const texto = String(valor || "").trim();

    if (!texto) return "";

    if (
        texto.startsWith("data:image/") ||
        texto.startsWith("blob:") ||
        texto.startsWith("https://") ||
        texto.startsWith("http://") ||
        texto.startsWith("/")
    ) {
        return texto;
    }

    return "";
}

function tipoImagemFavicon(valor) {
    const texto = String(valor || "").toLowerCase();

    if (texto.startsWith("data:image/png")) return "image/png";
    if (texto.startsWith("data:image/jpeg")) return "image/jpeg";
    if (texto.startsWith("data:image/jpg")) return "image/jpeg";
    if (texto.startsWith("data:image/webp")) return "image/webp";
    if (texto.startsWith("data:image/svg+xml")) return "image/svg+xml";
    if (/\.png(?:$|[?#])/i.test(texto)) return "image/png";
    if (/\.jpe?g(?:$|[?#])/i.test(texto)) return "image/jpeg";
    if (/\.webp(?:$|[?#])/i.test(texto)) return "image/webp";
    if (/\.svg(?:$|[?#])/i.test(texto)) return "image/svg+xml";

    return "image/png";
}

function millisTimestampFavicon(valor) {
    if (valor?.toMillis) {
        return valor.toMillis();
    }

    if (valor instanceof Date) {
        return valor.getTime();
    }

    const numero = Number(valor || 0);
    return Number.isFinite(numero) ? numero : 0;
}

function nomeAplicacaoFavicon() {
    const titulo = String(document.title || "Vide Hub")
        .replace(/\s+/g, " ")
        .trim();

    return titulo || "Vide Hub";
}

function estadoFaviconRuntime() {
    if (!window[VIDE_FAVICON_RUNTIME_KEY]) {
        window[VIDE_FAVICON_RUNTIME_KEY] = {
            slug: "",
            assinatura: "",
            tokenAplicacao: 0,
            desinscrever: null,
            blobIcone: "",
            blobManifesto: "",
            temporizadorSlug: null,
            tentativasContexto: null,
            eventosConectados: false
        };
    }

    return window[VIDE_FAVICON_RUNTIME_KEY];
}

function revogarBlobDepois(url) {
    if (!url || !String(url).startsWith("blob:")) return;

    window.setTimeout(function() {
        try {
            URL.revokeObjectURL(url);
        } catch (erro) {
            // Revogação é apenas limpeza de memória.
        }
    }, 5000);
}

async function criarHrefFavicon(valor, versao) {
    const origem = valorFaviconValido(valor) || VIDE_FAVICON_PADRAO;

    if (origem.startsWith("data:image/")) {
        try {
            const resposta = await fetch(origem);
            const blob = await resposta.blob();

            if (blob.size > 0) {
                return {
                    href: URL.createObjectURL(blob),
                    tipo: blob.type || tipoImagemFavicon(origem),
                    temporario: true
                };
            }
        } catch (erro) {
            // O data URI direto continua sendo um fallback válido.
        }

        return {
            href: origem,
            tipo: tipoImagemFavicon(origem),
            temporario: false
        };
    }

    if (origem.startsWith("blob:")) {
        return {
            href: origem,
            tipo: tipoImagemFavicon(origem),
            temporario: false
        };
    }

    try {
        const url = new URL(origem, window.location.href);
        url.searchParams.set(
            "vide_favicon",
            String(versao || Date.now())
        );

        return {
            href: url.href,
            tipo: tipoImagemFavicon(origem),
            temporario: false
        };
    } catch (erro) {
        return {
            href: origem,
            tipo: tipoImagemFavicon(origem),
            temporario: false
        };
    }
}

function criarLinkFavicon(rel, href, tipo, tamanhos) {
    const link = document.createElement("link");

    link.rel = rel;
    link.href = href;
    link.dataset.videFaviconRuntime = "true";

    if (tipo && rel !== "apple-touch-icon") {
        link.type = tipo;
    }

    if (tamanhos) {
        link.sizes = tamanhos;
    }

    return link;
}

function substituirLinksFavicon(href, tipo) {
    document.querySelectorAll(
        'link[rel~="icon"], ' +
        'link[rel="shortcut icon"], ' +
        'link[rel="apple-touch-icon"]'
    ).forEach(function(link) {
        link.remove();
    });

    document.head.appendChild(
        criarLinkFavicon("icon", href, tipo, "any")
    );

    document.head.appendChild(
        criarLinkFavicon("shortcut icon", href, tipo, "")
    );

    document.head.appendChild(
        criarLinkFavicon("apple-touch-icon", href, "", "192x192")
    );
}

function substituirManifestoFavicon(href, tipo, runtime) {
    document.querySelectorAll(
        'link[rel="manifest"][data-vide-favicon-runtime="true"]'
    ).forEach(function(link) {
        link.remove();
    });

    const nome = nomeAplicacaoFavicon();
    const manifesto = {
        name: nome,
        short_name: nome.slice(0, 30),
        start_url:
            window.location.pathname +
            window.location.search,
        display: "standalone",
        background_color: "#07070a",
        theme_color: "#7C3AED",
        icons: [
            {
                src: href,
                sizes: "192x192",
                type: tipo || "image/png",
                purpose: "any"
            }
        ]
    };

    const blob = new Blob(
        [JSON.stringify(manifesto)],
        { type: "application/manifest+json" }
    );

    const manifestoUrl = URL.createObjectURL(blob);
    const anterior = runtime.blobManifesto;

    runtime.blobManifesto = manifestoUrl;

    const link = document.createElement("link");
    link.rel = "manifest";
    link.href = manifestoUrl;
    link.dataset.videFaviconRuntime = "true";
    document.head.appendChild(link);

    revogarBlobDepois(anterior);
}

async function aplicarFaviconDocumento(
    valor,
    versao,
    origem,
    slug
) {
    const runtime = estadoFaviconRuntime();
    const favicon =
        valorFaviconValido(valor) ||
        VIDE_FAVICON_PADRAO;

    const assinatura = [
        favicon,
        String(versao || ""),
        String(slug || "")
    ].join("|");

    if (runtime.assinatura === assinatura) {
        return;
    }

    runtime.assinatura = assinatura;
    runtime.tokenAplicacao += 1;

    const token = runtime.tokenAplicacao;
    const preparado = await criarHrefFavicon(
        favicon,
        versao
    );

    if (token !== runtime.tokenAplicacao) {
        if (preparado.temporario) {
            revogarBlobDepois(preparado.href);
        }
        return;
    }

    const blobAnterior = runtime.blobIcone;

    substituirLinksFavicon(
        preparado.href,
        preparado.tipo
    );

    substituirManifestoFavicon(
        preparado.href,
        preparado.tipo,
        runtime
    );

    runtime.blobIcone = preparado.temporario
        ? preparado.href
        : "";

    revogarBlobDepois(blobAnterior);

    window.dispatchEvent(
        new CustomEvent("videhub:favicon-aplicado", {
            detail: {
                slug: String(slug || ""),
                origem: origem || "runtime",
                personalizado:
                    favicon !== VIDE_FAVICON_PADRAO
            }
        })
    );
}

function versaoDocumentoFavicon(snapshot, dados) {
    return (
        millisTimestampFavicon(
            dados?.faviconAtualizadoEm
        ) ||
        millisTimestampFavicon(
            dados?.atualizadoEm
        ) ||
        millisTimestampFavicon(
            snapshot?.updateTime
        ) ||
        Date.now()
    );
}

function observarVitrineFavicon(slug) {
    const runtime = estadoFaviconRuntime();
    const slugSeguro = normalizarSlugFavicon(slug);

    if (
        runtime.slug === slugSeguro &&
        typeof runtime.desinscrever === "function"
    ) {
        return;
    }

    if (typeof runtime.desinscrever === "function") {
        runtime.desinscrever();
        runtime.desinscrever = null;
    }

    runtime.slug = slugSeguro;
    runtime.assinatura = "";

    if (!slugSeguro) {
        aplicarFaviconDocumento(
            VIDE_FAVICON_PADRAO,
            "padrao",
            "sem-slug",
            ""
        );
        return;
    }

    runtime.desinscrever = onSnapshot(
        doc(db, "vitrines_publicas", slugSeguro),
        function(snapshot) {
            const dados = snapshot.exists()
                ? snapshot.data() || {}
                : {};

            const favicon =
                dados.faviconB64 ||
                dados.faviconUrl ||
                VIDE_FAVICON_PADRAO;

            aplicarFaviconDocumento(
                favicon,
                versaoDocumentoFavicon(
                    snapshot,
                    dados
                ),
                snapshot.exists()
                    ? "vitrine-publica"
                    : "vitrine-ausente",
                slugSeguro
            );
        },
        function() {
            // O favicon não é recurso crítico. Em qualquer falha de leitura,
            // mantém o padrão sem gerar erro de console no Quality Gate.
            aplicarFaviconDocumento(
                VIDE_FAVICON_PADRAO,
                Date.now(),
                "fallback-leitura",
                slugSeguro
            );
        }
    );
}

function slugDaLojaPublica() {
    const parametros = new URLSearchParams(
        window.location.search
    );

    return normalizarSlugFavicon(
        parametros.get("loja") ||
        parametros.get("slug") ||
        ""
    );
}

function perfilLocalDashboard() {
    try {
        const parametros = new URLSearchParams(
            window.location.search
        );

        const chave =
            parametros.get("masterUID") ||
            "own";

        return JSON.parse(
            localStorage.getItem(
                "ultimoPerfilLoja_" + chave
            ) || "null"
        );
    } catch (erro) {
        return null;
    }
}

function slugDoContextoDashboard(detalheEvento) {
    let snapshot = detalheEvento || null;

    if (!snapshot) {
        try {
            snapshot =
                window.VideHubContext?.getSnapshot?.() ||
                null;
        } catch (erro) {
            snapshot = null;
        }
    }

    const inputSlug = document.getElementById(
        "perf-slug"
    );

    const perfilLocal = perfilLocalDashboard();

    return normalizarSlugFavicon(
        inputSlug?.value ||
        snapshot?.owner?.urlLoja ||
        perfilLocal?.urlLoja ||
        ""
    );
}

function agendarVinculoDashboard(detalheEvento) {
    const runtime = estadoFaviconRuntime();

    clearTimeout(runtime.temporizadorSlug);

    runtime.temporizadorSlug = window.setTimeout(
        function() {
            const slug = slugDoContextoDashboard(
                detalheEvento
            );

            if (slug) {
                observarVitrineFavicon(slug);
            }
        },
        120
    );
}

function conectarEventosDashboardFavicon() {
    const runtime = estadoFaviconRuntime();

    if (runtime.eventosConectados) return;
    runtime.eventosConectados = true;

    window.addEventListener(
        "videhub:context-ready",
        function(evento) {
            agendarVinculoDashboard(
                evento?.detail || null
            );
        }
    );

    document.addEventListener(
        "input",
        function(evento) {
            if (evento.target?.id === "perf-slug") {
                agendarVinculoDashboard();
            }
        },
        true
    );

    document.addEventListener(
        "change",
        function(evento) {
            if (evento.target?.id === "perf-slug") {
                agendarVinculoDashboard();
            }
        },
        true
    );

    window.addEventListener(
        "storage",
        function(evento) {
            if (
                String(evento.key || "")
                    .startsWith("ultimoPerfilLoja_")
            ) {
                agendarVinculoDashboard();
            }
        }
    );

    // O campo e o contexto podem ser montados depois do firebase-init.
    // A sondagem é curta e termina assim que encontra um slug válido.
    let tentativas = 0;

    runtime.tentativasContexto = window.setInterval(
        function() {
            tentativas += 1;

            const slug = slugDoContextoDashboard();

            if (slug) {
                window.clearInterval(
                    runtime.tentativasContexto
                );
                runtime.tentativasContexto = null;
                observarVitrineFavicon(slug);
                return;
            }

            if (tentativas >= 50) {
                window.clearInterval(
                    runtime.tentativasContexto
                );
                runtime.tentativasContexto = null;
            }
        },
        180
    );

    agendarVinculoDashboard();
}

function iniciarFaviconDaLoja() {
    if (!paginaUsaFaviconDaLoja()) return;

    if (caminhoAtualEh("loja.html")) {
        observarVitrineFavicon(
            slugDaLojaPublica()
        );
        return;
    }

    if (caminhoAtualEh("dashboard.html")) {
        conectarEventosDashboardFavicon();
    }
}

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        iniciarFaviconDaLoja,
        { once: true }
    );
} else {
    iniciarFaviconDaLoja();
}

export {
    app,
    db,
    auth,
    storage,
    firebaseConfig,
    shouldUseVideEmulators
};
