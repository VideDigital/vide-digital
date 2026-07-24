(function() {
    "use strict";

    try {
        var chavePerfil = new URLSearchParams(window.location.search).get("masterUID") || "own";
        var perfil = JSON.parse(localStorage.getItem("ultimoPerfilLoja_" + chavePerfil) || "null");
        if (perfil) {
            var elTitulo = document.getElementById("txt-preview-nome-loja");
            var elUrlPreview = document.getElementById("url-loja-preview");
            var elLink = document.getElementById("link-minha-loja");
            var elLinkCockpit = document.getElementById("link-minha-loja-cockpit");

            if (elTitulo && perfil.nomeLoja) {
                elTitulo.innerText = perfil.nomeLoja;
            }

            if (elUrlPreview && perfil.urlLoja) {
                elUrlPreview.innerText = "vide.digital/" + perfil.urlLoja;
            }

            if (elLink && perfil.urlLoja) {
                elLink.href = "loja.html?loja=" + perfil.urlLoja;
            }

            if (elLinkCockpit && perfil.urlLoja) {
                elLinkCockpit.href = "loja.html?loja=" + perfil.urlLoja;
            }
        }
    } catch(e) {
        console.warn("[Vide Hub] Não foi possível restaurar o resumo local da loja.", e);
    }

    var FAVICON_PADRAO_VIDE = "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20512%20512%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%2264%22%20y1%3D%2248%22%20x2%3D%22448%22%20y2%3D%22464%22%20gradientUnits%3D%22userSpaceOnUse%22%3E%3Cstop%20stop-color%3D%22%23C026D3%22%2F%3E%3Cstop%20offset%3D%22.48%22%20stop-color%3D%22%237C3AED%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%232563EB%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22512%22%20height%3D%22512%22%20rx%3D%22112%22%20fill%3D%22%2307070A%22%2F%3E%3Crect%20x%3D%2218%22%20y%3D%2218%22%20width%3D%22476%22%20height%3D%22476%22%20rx%3D%2298%22%20fill%3D%22url%28%23g%29%22%2F%3E%3Cpath%20d%3D%22M112%20132h76l68%20190%2068-190h76L292%20392h-72L112%20132Z%22%20fill%3D%22%23fff%22%2F%3E%3Cpath%20d%3D%22M181%20132h58l17%2048%2017-48h58l-75%20199-75-199Z%22%20fill%3D%22%23fff%22%20opacity%3D%22.18%22%2F%3E%3C%2Fsvg%3E";

    var faviconAlterado = false;
    var faviconCarregado = false;
    var salvamentoEmAndamento = false;

    function aguardarDOMContentLoaded(callback) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", callback, { once: true });
            return;
        }
        callback();
    }

    function inserirEstilosFavicon() {
        if (document.getElementById("vide-favicon-dashboard-style")) return;

        var style = document.createElement("style");
        style.id = "vide-favicon-dashboard-style";
        style.textContent = `
            #config-favicon-loja .vide-favicon-preview-shell {
                position: relative;
                width: 80px;
                height: 80px;
                flex: 0 0 80px;
                border-radius: 22px;
                overflow: hidden;
                border: 1px solid rgba(255,255,255,.12);
                background:
                    linear-gradient(135deg, rgba(255,255,255,.08), rgba(255,255,255,.02)),
                    #07070a;
                box-shadow: 0 16px 36px rgba(0,0,0,.28);
                display: flex;
                align-items: center;
                justify-content: center;
            }

            #config-favicon-loja .vide-favicon-preview-shell::after {
                content: "ABA";
                position: absolute;
                right: 6px;
                bottom: 6px;
                padding: 3px 5px;
                border-radius: 6px;
                font-size: 7px;
                line-height: 1;
                font-weight: 900;
                letter-spacing: .12em;
                color: #fff;
                background: rgba(0,0,0,.72);
                border: 1px solid rgba(255,255,255,.12);
                pointer-events: none;
            }

            #preview-favicon-loja {
                width: 100%;
                height: 100%;
                object-fit: cover;
                display: block;
            }

            #label-favicon-loja {
                position: absolute;
                inset: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #fff;
                font-size: 9px;
                font-weight: 900;
                letter-spacing: .08em;
                background: rgba(0,0,0,.72);
                opacity: 0;
                cursor: pointer;
                transition: opacity .2s ease;
                z-index: 2;
            }

            #config-favicon-loja .vide-favicon-preview-shell:hover #label-favicon-loja,
            #label-favicon-loja:focus-visible {
                opacity: 1;
            }

            #config-favicon-loja .vide-favicon-actions {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                margin-top: 12px;
            }

            #config-favicon-loja .vide-favicon-button {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-height: 34px;
                padding: 8px 12px;
                border-radius: 10px;
                border: 1px solid rgba(255,255,255,.1);
                background: rgba(255,255,255,.045);
                color: #d1d5db;
                font-size: 10px;
                font-weight: 800;
                cursor: pointer;
                transition: background .2s ease, border-color .2s ease, color .2s ease;
            }

            #config-favicon-loja .vide-favicon-button:hover {
                background: rgba(255,255,255,.08);
                border-color: rgba(255,255,255,.18);
                color: #fff;
            }

            #favicon-loja-status[data-state="pending"] { color: #fbbf24; }
            #favicon-loja-status[data-state="saved"] { color: #34d399; }
            #favicon-loja-status[data-state="error"] { color: #f87171; }

            @media (max-width: 639px) {
                #config-favicon-loja .vide-favicon-preview-shell {
                    width: 88px;
                    height: 88px;
                    flex-basis: 88px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function criarCampoFavicon() {
        if (document.getElementById("config-favicon-loja")) {
            return true;
        }

        var inputFoto = document.getElementById("input-foto-perfil");
        if (!inputFoto) return false;

        var blocoFoto = inputFoto.closest(".flex.flex-col.sm\\:flex-row") || inputFoto.parentElement?.parentElement;
        if (!blocoFoto || !blocoFoto.parentElement) return false;

        inserirEstilosFavicon();

        var bloco = document.createElement("div");
        bloco.id = "config-favicon-loja";
        bloco.className = "flex flex-col sm:flex-row items-center gap-5 bg-white/[0.01] p-4 rounded-xl border border-white/5";
        bloco.innerHTML = `
            <div class="vide-favicon-preview-shell">
                <img id="preview-favicon-loja" src="${FAVICON_PADRAO_VIDE}" alt="Prévia do ícone da loja">
                <label id="label-favicon-loja" for="input-favicon-loja" tabindex="0">TROCAR</label>
                <input type="file" id="input-favicon-loja" accept="image/png,image/jpeg,image/webp" class="hidden">
            </div>
            <div class="text-center sm:text-left min-w-0">
                <div class="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                    <h4 class="text-sm font-bold text-white">Ícone da Loja / Favicon</h4>
                    <span class="text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-full border border-violet-400/20 bg-violet-400/10 text-violet-300">Separado do logo</span>
                </div>
                <p class="text-xs text-gray-400 mt-1 leading-relaxed">
                    Aparece na aba do navegador, nos favoritos e no atalho salvo no celular. Use uma arte quadrada; recomendado 512 × 512 px.
                </p>
                <p id="favicon-loja-status" class="text-[10px] text-gray-500 mt-2" data-state="idle">
                    Usando o ícone padrão do Vide Hub.
                </p>
                <div class="vide-favicon-actions">
                    <label for="input-favicon-loja" class="vide-favicon-button">Selecionar ícone</label>
                    <button type="button" id="btn-remover-favicon-loja" class="vide-favicon-button">Usar padrão Vide Hub</button>
                </div>
                <input type="hidden" id="perfil-favicon-base64" value="">
            </div>
        `;

        blocoFoto.insertAdjacentElement("afterend", bloco);
        return true;
    }

    function atualizarStatus(texto, estado) {
        var status = document.getElementById("favicon-loja-status");
        if (!status) return;
        status.textContent = texto;
        status.dataset.state = estado || "idle";
    }

    function aplicarPreviewFavicon(valor, estadoSalvo) {
        var preview = document.getElementById("preview-favicon-loja");
        var hidden = document.getElementById("perfil-favicon-base64");
        if (!preview || !hidden) return;

        var favicon = String(valor || "").trim() || FAVICON_PADRAO_VIDE;
        var usaPadrao = favicon === FAVICON_PADRAO_VIDE;
        preview.src = favicon;
        hidden.value = favicon;

        if (estadoSalvo) {
            atualizarStatus(
                usaPadrao
                    ? "Usando o ícone padrão do Vide Hub."
                    : "Ícone personalizado salvo nesta loja.",
                usaPadrao ? "idle" : "saved"
            );
        }
    }

    function arquivoParaImagem(file) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onerror = function() {
                reject(new Error("Não foi possível ler a imagem selecionada."));
            };
            reader.onload = function() {
                var imagem = new Image();
                imagem.onerror = function() {
                    reject(new Error("O arquivo selecionado não é uma imagem válida."));
                };
                imagem.onload = function() {
                    resolve(imagem);
                };
                imagem.src = reader.result;
            };
            reader.readAsDataURL(file);
        });
    }

    async function normalizarFavicon(file) {
        if (!file || !String(file.type || "").startsWith("image/")) {
            throw new Error("Selecione uma imagem PNG, JPG ou WebP.");
        }

        if (file.size > 5 * 1024 * 1024) {
            throw new Error("A imagem deve ter no máximo 5 MB.");
        }

        var imagem = await arquivoParaImagem(file);
        var tamanho = 512;
        var canvas = document.createElement("canvas");
        canvas.width = tamanho;
        canvas.height = tamanho;

        var contexto = canvas.getContext("2d", { alpha: true });
        if (!contexto) {
            throw new Error("Seu navegador não conseguiu preparar a imagem.");
        }

        contexto.clearRect(0, 0, tamanho, tamanho);
        contexto.imageSmoothingEnabled = true;
        contexto.imageSmoothingQuality = "high";

        var lado = Math.min(imagem.naturalWidth || imagem.width, imagem.naturalHeight || imagem.height);
        var origemX = ((imagem.naturalWidth || imagem.width) - lado) / 2;
        var origemY = ((imagem.naturalHeight || imagem.height) - lado) / 2;

        contexto.drawImage(
            imagem,
            origemX,
            origemY,
            lado,
            lado,
            0,
            0,
            tamanho,
            tamanho
        );

        var resultado = canvas.toDataURL("image/webp", 0.9);
        if (!resultado || resultado === "data:,") {
            resultado = canvas.toDataURL("image/png");
        }

        if (resultado.length > 700000) {
            resultado = canvas.toDataURL("image/webp", 0.78);
        }

        if (resultado.length > 850000) {
            throw new Error("O ícone ficou muito pesado. Escolha uma imagem mais simples.");
        }

        return resultado;
    }

    function esperarContextoVideHub() {
        return new Promise(function(resolve) {
            function lerContexto() {
                try {
                    var snapshot = window.VideHubContext?.getSnapshot?.();
                    if (snapshot?.initialized && snapshot?.active && snapshot?.storeUid) {
                        return snapshot;
                    }
                } catch (erro) {
                    console.warn("[Vide Hub] Contexto ainda não disponível para o favicon.", erro);
                }
                return null;
            }

            var imediato = lerContexto();
            if (imediato) {
                resolve(imediato);
                return;
            }

            var encerrado = false;
            var finalizar = function(valor) {
                if (encerrado) return;
                encerrado = true;
                window.removeEventListener("videhub:context-ready", aoContextoPronto);
                clearInterval(intervalo);
                clearTimeout(limite);
                resolve(valor || null);
            };

            var aoContextoPronto = function(evento) {
                var detalhe = evento?.detail;
                if (detalhe?.active && detalhe?.storeUid) {
                    finalizar(detalhe);
                    return;
                }
                finalizar(lerContexto());
            };

            window.addEventListener("videhub:context-ready", aoContextoPronto);

            var intervalo = setInterval(function() {
                var contexto = lerContexto();
                if (contexto) finalizar(contexto);
            }, 180);

            var limite = setTimeout(function() {
                finalizar(lerContexto());
            }, 7000);
        });
    }

    async function obterServicosFirebase() {
        var modulos = await Promise.all([
            import("./firebase-init.js"),
            import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js")
        ]);

        return {
            db: modulos[0].db,
            doc: modulos[1].doc,
            getDoc: modulos[1].getDoc,
            setDoc: modulos[1].setDoc,
            serverTimestamp: modulos[1].serverTimestamp
        };
    }

    async function carregarFaviconSalvo() {
        if (faviconCarregado) return;

        var contexto = await esperarContextoVideHub();
        if (!contexto?.storeUid) {
            atualizarStatus("Não foi possível identificar a loja para carregar o ícone.", "error");
            return;
        }

        try {
            var firebase = await obterServicosFirebase();
            var usuarioRef = firebase.doc(firebase.db, "usuarios", contexto.storeUid);
            var usuarioSnap = await firebase.getDoc(usuarioRef);
            var dadosUsuario = usuarioSnap.exists() ? usuarioSnap.data() : {};
            var favicon = dadosUsuario.faviconB64 || dadosUsuario.faviconUrl || "";

            if (!favicon && dadosUsuario.urlLoja) {
                var vitrineSnap = await firebase.getDoc(
                    firebase.doc(firebase.db, "vitrines_publicas", dadosUsuario.urlLoja)
                );
                if (vitrineSnap.exists()) {
                    var dadosVitrine = vitrineSnap.data();
                    favicon = dadosVitrine.faviconB64 || dadosVitrine.faviconUrl || "";
                }
            }

            aplicarPreviewFavicon(favicon || FAVICON_PADRAO_VIDE, true);
            // Lojas antigas ainda não possuem o campo separado. Mantemos o
            // padrão pronto para ser persistido no próximo "Salvar alterações".
            faviconAlterado = !favicon;
            faviconCarregado = true;
        } catch (erro) {
            console.error("[Vide Hub] Erro ao carregar favicon da loja:", erro);
            atualizarStatus("Não foi possível carregar o ícone salvo.", "error");
        }
    }

    function criarToastFavicon(mensagem, tipo) {
        if (typeof window.showToast === "function") {
            window.showToast(mensagem, tipo || "success");
            return;
        }

        var container = document.getElementById("toast-container");
        if (!container) return;

        var toast = document.createElement("div");
        toast.className = "pointer-events-auto rounded-xl border px-4 py-3 text-xs font-bold shadow-2xl backdrop-blur-xl transition-all";
        toast.style.background = tipo === "error" ? "rgba(127,29,29,.92)" : "rgba(6,78,59,.92)";
        toast.style.borderColor = tipo === "error" ? "rgba(248,113,113,.35)" : "rgba(52,211,153,.35)";
        toast.style.color = "#fff";
        toast.textContent = mensagem;
        container.appendChild(toast);
        setTimeout(function() {
            toast.remove();
        }, 3600);
    }

    async function salvarFaviconSeparado() {
        if (!faviconAlterado || salvamentoEmAndamento) return;

        var contexto = await esperarContextoVideHub();
        if (!contexto?.storeUid) {
            atualizarStatus("Não foi possível identificar a loja para salvar o ícone.", "error");
            return;
        }

        var slug = String(document.getElementById("perf-slug")?.value || "")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9-_]/g, "");

        if (!slug) {
            atualizarStatus("Salve um slug válido para publicar o ícone.", "error");
            return;
        }

        var hidden = document.getElementById("perfil-favicon-base64");
        var favicon = String(hidden?.value || FAVICON_PADRAO_VIDE).trim() || FAVICON_PADRAO_VIDE;

        salvamentoEmAndamento = true;
        atualizarStatus("Salvando o ícone da loja...", "pending");

        try {
            var firebase = await obterServicosFirebase();
            var payload = {
                faviconB64: favicon,
                faviconUrl: "",
                faviconAtualizadoEm: firebase.serverTimestamp()
            };

            await firebase.setDoc(
                firebase.doc(firebase.db, "usuarios", contexto.storeUid),
                payload,
                { merge: true }
            );

            // Só grava no documento público quando o slug já pertence à loja.
            // Isso impede que um slug duplicado receba o ícone da loja errada.
            var vitrineRef = firebase.doc(firebase.db, "vitrines_publicas", slug);
            var vitrineSnap = null;
            for (var tentativa = 0; tentativa < 8; tentativa += 1) {
                vitrineSnap = await firebase.getDoc(vitrineRef);
                if (vitrineSnap.exists()) break;
                await new Promise(function(resolve) { setTimeout(resolve, 300); });
            }

            if (vitrineSnap?.exists()) {
                var dadosVitrine = vitrineSnap.data() || {};
                if (String(dadosVitrine.donoUID || "") !== String(contexto.storeUid)) {
                    throw new Error("O endereço escolhido já pertence a outra loja.");
                }

                await firebase.setDoc(
                    vitrineRef,
                    {
                        donoUID: contexto.storeUid,
                        faviconB64: favicon,
                        faviconUrl: "",
                        faviconAtualizadoEm: firebase.serverTimestamp()
                    },
                    { merge: true }
                );
            } else {
                throw new Error("Publique primeiro as configurações da vitrine e tente novamente.");
            }

            faviconAlterado = false;
            faviconCarregado = true;
            var usaPadrao = favicon === FAVICON_PADRAO_VIDE;
            atualizarStatus(
                usaPadrao
                    ? "Ícone padrão do Vide Hub salvo e aplicado."
                    : "Ícone personalizado salvo e aplicado à vitrine.",
                "saved"
            );
            criarToastFavicon(
                usaPadrao
                    ? "Ícone padrão aplicado à loja."
                    : "Ícone da loja atualizado.",
                "success"
            );
        } catch (erro) {
            console.error("[Vide Hub] Erro ao salvar favicon separado:", erro);
            atualizarStatus("Erro ao salvar o ícone. Tente novamente.", "error");
            criarToastFavicon("Erro ao salvar o ícone da loja.", "error");
        } finally {
            salvamentoEmAndamento = false;
        }
    }

    function conectarEventosFavicon() {
        var input = document.getElementById("input-favicon-loja");
        var btnPadrao = document.getElementById("btn-remover-favicon-loja");
        var label = document.getElementById("label-favicon-loja");

        if (label) {
            label.addEventListener("keydown", function(evento) {
                if (evento.key === "Enter" || evento.key === " ") {
                    evento.preventDefault();
                    input?.click();
                }
            });
        }

        input?.addEventListener("change", async function(evento) {
            var file = evento.target.files?.[0];
            evento.target.value = "";
            if (!file) return;

            atualizarStatus("Preparando o ícone...", "pending");

            try {
                var favicon = await normalizarFavicon(file);
                aplicarPreviewFavicon(favicon, false);
                faviconAlterado = true;
                atualizarStatus("Novo ícone pronto. Clique em Salvar alterações.", "pending");
            } catch (erro) {
                console.error("[Vide Hub] Erro ao preparar favicon:", erro);
                atualizarStatus(erro.message || "Não foi possível preparar o ícone.", "error");
                criarToastFavicon(erro.message || "Imagem inválida.", "error");
            }
        });

        btnPadrao?.addEventListener("click", function() {
            aplicarPreviewFavicon(FAVICON_PADRAO_VIDE, false);
            faviconAlterado = true;
            atualizarStatus("Ícone padrão selecionado. Clique em Salvar alterações.", "pending");
        });

        document.addEventListener("click", function(evento) {
            var botaoConfirmar = evento.target.closest?.("#confirm-modal-ok");
            if (!botaoConfirmar || !faviconAlterado) return;

            var textoConfirmacao = String(
                document.getElementById("confirm-modal-texto")?.textContent || ""
            ).toLowerCase();

            if (!textoConfirmacao.includes("salvar") || !textoConfirmacao.includes("vitrine")) {
                return;
            }

            setTimeout(salvarFaviconSeparado, 350);
        });
    }

    function inicializarFaviconDashboard() {
        var tentativas = 0;
        var intervalo = setInterval(function() {
            tentativas += 1;

            if (criarCampoFavicon()) {
                clearInterval(intervalo);
                conectarEventosFavicon();
                carregarFaviconSalvo();
                return;
            }

            if (tentativas >= 40) {
                clearInterval(intervalo);
                console.warn("[Vide Hub] Campo de favicon não foi inserido: área de identidade não encontrada.");
            }
        }, 150);
    }


    // =========================================================
    // FUNIL DE MÉTRICAS DA LOJA PÚBLICA
    // Usa o mesmo documento metricas_vitrines/{tenantUid}.
    // As etapas novas ficam dentro de porDia para manter
    // compatibilidade com o contrato atual das Firestore Rules.
    // =========================================================
    var metricasFunilIniciadas = false;
    var metricasFunilDados = {};
    var metricasFunilDesinscrever = null;

    function inserirEstilosMetricasFunil() {
        if (document.getElementById("vide-funil-metricas-style")) return;

        var style = document.createElement("style");
        style.id = "vide-funil-metricas-style";
        style.textContent = `
            #vide-funil-loja-publica {
                position: relative;
                overflow: hidden;
                margin-bottom: 24px;
                padding: 24px;
                border-radius: 24px;
                border: 1px solid rgba(255,255,255,.08);
                background:
                    radial-gradient(circle at 12% 0%, color-mix(in srgb, var(--sys-primaria, #6d5dfc) 24%, transparent), transparent 34%),
                    radial-gradient(circle at 100% 20%, color-mix(in srgb, var(--sys-destaque, #00f2fe) 18%, transparent), transparent 32%),
                    linear-gradient(145deg, rgba(255,255,255,.055), rgba(255,255,255,.018));
                box-shadow: 0 24px 60px rgba(0,0,0,.22);
            }

            #vide-funil-loja-publica .vide-funil-header {
                position: relative;
                z-index: 1;
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 18px;
                margin-bottom: 20px;
            }

            #vide-funil-loja-publica .vide-funil-kicker {
                display: block;
                margin-bottom: 6px;
                color: color-mix(in srgb, var(--sys-destaque, #00f2fe) 78%, white 22%);
                font-size: 9px;
                font-weight: 900;
                letter-spacing: .22em;
                text-transform: uppercase;
            }

            #vide-funil-loja-publica h2 {
                margin: 0;
                color: #fff;
                font-size: clamp(18px, 2vw, 25px);
                font-weight: 900;
                letter-spacing: -.035em;
            }

            #vide-funil-loja-publica .vide-funil-description {
                max-width: 650px;
                margin: 7px 0 0;
                color: #9ca3af;
                font-size: 12px;
                line-height: 1.65;
            }

            #vide-funil-periodo {
                min-width: 155px;
                min-height: 42px;
                padding: 0 38px 0 14px;
                border: 1px solid rgba(255,255,255,.1);
                border-radius: 13px;
                background: rgba(3,7,18,.72);
                color: #fff;
                font-size: 11px;
                font-weight: 800;
                outline: none;
                cursor: pointer;
            }

            #vide-funil-periodo:focus-visible {
                border-color: var(--sys-destaque, #00f2fe);
                box-shadow: 0 0 0 3px color-mix(in srgb, var(--sys-destaque, #00f2fe) 20%, transparent);
            }

            #vide-funil-loja-publica .vide-funil-grid {
                position: relative;
                z-index: 1;
                display: grid;
                grid-template-columns: repeat(6, minmax(0, 1fr));
                gap: 12px;
            }

            #vide-funil-loja-publica .vide-funil-card {
                min-height: 132px;
                padding: 16px;
                border: 1px solid rgba(255,255,255,.075);
                border-radius: 18px;
                background: rgba(3,7,18,.48);
                display: flex;
                flex-direction: column;
                justify-content: space-between;
            }

            #vide-funil-loja-publica .vide-funil-card span {
                color: #9ca3af;
                font-size: 9px;
                font-weight: 900;
                letter-spacing: .14em;
                text-transform: uppercase;
            }

            #vide-funil-loja-publica .vide-funil-card strong {
                display: block;
                margin-top: 12px;
                color: #fff;
                font-size: clamp(22px, 2.3vw, 32px);
                line-height: 1;
                font-weight: 900;
                letter-spacing: -.05em;
            }

            #vide-funil-loja-publica .vide-funil-card small {
                display: block;
                margin-top: 9px;
                color: #6b7280;
                font-size: 10px;
                line-height: 1.45;
            }

            #vide-funil-loja-publica .vide-funil-card.is-highlight {
                border-color: color-mix(in srgb, var(--sys-destaque, #00f2fe) 30%, transparent);
                background: color-mix(in srgb, var(--sys-destaque, #00f2fe) 8%, rgba(3,7,18,.6));
            }

            #vide-funil-loja-publica .vide-funil-flow {
                position: relative;
                z-index: 1;
                display: grid;
                grid-template-columns: minmax(0, 1.35fr) minmax(280px, .65fr);
                gap: 18px;
                margin-top: 18px;
            }

            #vide-funil-loja-publica .vide-funil-bars,
            #vide-funil-loja-publica .vide-funil-summary {
                padding: 18px;
                border: 1px solid rgba(255,255,255,.07);
                border-radius: 18px;
                background: rgba(3,7,18,.38);
            }

            #vide-funil-loja-publica .vide-funil-section-title {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                margin-bottom: 14px;
            }

            #vide-funil-loja-publica .vide-funil-section-title strong {
                color: #fff;
                font-size: 12px;
                font-weight: 900;
            }

            #vide-funil-loja-publica .vide-funil-section-title span {
                color: #6b7280;
                font-size: 9px;
                font-weight: 800;
                text-transform: uppercase;
                letter-spacing: .12em;
            }

            #vide-funil-loja-publica .vide-funil-stage {
                display: grid;
                grid-template-columns: 128px minmax(0, 1fr) 58px;
                align-items: center;
                gap: 10px;
                margin-top: 11px;
            }

            #vide-funil-loja-publica .vide-funil-stage-label {
                color: #d1d5db;
                font-size: 10px;
                font-weight: 800;
            }

            #vide-funil-loja-publica .vide-funil-stage-track {
                height: 9px;
                overflow: hidden;
                border-radius: 999px;
                background: rgba(255,255,255,.055);
            }

            #vide-funil-loja-publica .vide-funil-stage-fill {
                width: 0;
                height: 100%;
                border-radius: inherit;
                background: linear-gradient(90deg, var(--sys-primaria, #6d5dfc), var(--sys-destaque, #00f2fe));
                transition: width .45s ease;
            }

            #vide-funil-loja-publica .vide-funil-stage-value {
                color: #fff;
                font-size: 10px;
                font-weight: 900;
                text-align: right;
            }

            #vide-funil-loja-publica .vide-funil-summary-list {
                display: grid;
                gap: 10px;
            }

            #vide-funil-loja-publica .vide-funil-summary-item {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                padding: 11px 12px;
                border-radius: 13px;
                background: rgba(255,255,255,.035);
            }

            #vide-funil-loja-publica .vide-funil-summary-item span {
                color: #9ca3af;
                font-size: 10px;
                font-weight: 700;
            }

            #vide-funil-loja-publica .vide-funil-summary-item strong {
                color: #fff;
                font-size: 12px;
                font-weight: 900;
            }

            #vide-funil-status {
                position: relative;
                z-index: 1;
                display: flex;
                align-items: center;
                gap: 7px;
                margin: 15px 0 0;
                color: #6b7280;
                font-size: 9px;
                font-weight: 700;
            }

            #vide-funil-status::before {
                content: "";
                width: 7px;
                height: 7px;
                border-radius: 999px;
                background: #34d399;
                box-shadow: 0 0 0 4px rgba(52,211,153,.08);
            }

            #vide-funil-status[data-state="loading"]::before {
                background: #fbbf24;
                box-shadow: 0 0 0 4px rgba(251,191,36,.08);
            }

            #vide-funil-status[data-state="error"]::before {
                background: #f87171;
                box-shadow: 0 0 0 4px rgba(248,113,113,.08);
            }

            @media (max-width: 1180px) {
                #vide-funil-loja-publica .vide-funil-grid {
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                }
            }

            @media (max-width: 820px) {
                #vide-funil-loja-publica {
                    padding: 20px;
                    border-radius: 20px;
                }

                #vide-funil-loja-publica .vide-funil-header,
                #vide-funil-loja-publica .vide-funil-flow {
                    grid-template-columns: 1fr;
                    flex-direction: column;
                }

                #vide-funil-periodo {
                    width: 100%;
                }

                #vide-funil-loja-publica .vide-funil-flow {
                    display: grid;
                }
            }

            @media (max-width: 620px) {
                #vide-funil-loja-publica .vide-funil-grid {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                }

                #vide-funil-loja-publica .vide-funil-card {
                    min-height: 120px;
                }

                #vide-funil-loja-publica .vide-funil-stage {
                    grid-template-columns: 100px minmax(0, 1fr) 48px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function criarPainelMetricasFunil() {
        if (document.getElementById("vide-funil-loja-publica")) return true;

        var view = document.getElementById("view-metricas");
        if (!view) return false;

        inserirEstilosMetricasFunil();

        var painel = document.createElement("section");
        painel.id = "vide-funil-loja-publica";
        painel.setAttribute("aria-labelledby", "vide-funil-titulo");
        painel.innerHTML = `
            <div class="vide-funil-header">
                <div>
                    <span class="vide-funil-kicker">Comportamento da vitrine</span>
                    <h2 id="vide-funil-titulo">Funil da loja pública</h2>
                    <p class="vide-funil-description">
                        Acompanhe quantas visitas avançam para o carrinho, iniciam o pedido e abrem o WhatsApp.
                        Cada etapa é contabilizada uma vez por sessão para evitar números inflados por cliques repetidos.
                    </p>
                </div>
                <label>
                    <span class="sr-only">Período das métricas do funil</span>
                    <select id="vide-funil-periodo" aria-label="Período das métricas do funil">
                        <option value="7">Últimos 7 dias</option>
                        <option value="30" selected>Últimos 30 dias</option>
                        <option value="90">Últimos 90 dias</option>
                        <option value="0">Todo o período</option>
                    </select>
                </label>
            </div>

            <div class="vide-funil-grid">
                <article class="vide-funil-card">
                    <span>Visitas</span>
                    <strong id="vide-funil-sessoes">0</strong>
                    <small>Sessões registradas na loja</small>
                </article>
                <article class="vide-funil-card">
                    <span>Carrinhos abertos</span>
                    <strong id="vide-funil-carrinhos">0</strong>
                    <small>Visitantes que abriram o carrinho</small>
                </article>
                <article class="vide-funil-card">
                    <span>Itens adicionados</span>
                    <strong id="vide-funil-adicoes">0</strong>
                    <small>Produtos diferentes adicionados por sessão</small>
                </article>
                <article class="vide-funil-card">
                    <span>Pedidos iniciados</span>
                    <strong id="vide-funil-checkouts">0</strong>
                    <small>Formulários pré-WhatsApp abertos</small>
                </article>
                <article class="vide-funil-card is-highlight">
                    <span>WhatsApp aberto</span>
                    <strong id="vide-funil-pedidos">0</strong>
                    <small>Pedidos enviados para o WhatsApp</small>
                </article>
                <article class="vide-funil-card">
                    <span>Compartilhamentos</span>
                    <strong id="vide-funil-compartilhamentos">0</strong>
                    <small>Compartilhamentos ou links copiados</small>
                </article>
            </div>

            <div class="vide-funil-flow">
                <div class="vide-funil-bars">
                    <div class="vide-funil-section-title">
                        <strong>Avanço no funil</strong>
                        <span>Percentual sobre visitas</span>
                    </div>

                    <div class="vide-funil-stage">
                        <span class="vide-funil-stage-label">Visitaram a loja</span>
                        <span class="vide-funil-stage-track"><i id="vide-funil-bar-sessoes" class="vide-funil-stage-fill"></i></span>
                        <strong id="vide-funil-pct-sessoes" class="vide-funil-stage-value">0%</strong>
                    </div>
                    <div class="vide-funil-stage">
                        <span class="vide-funil-stage-label">Abriram carrinho</span>
                        <span class="vide-funil-stage-track"><i id="vide-funil-bar-carrinhos" class="vide-funil-stage-fill"></i></span>
                        <strong id="vide-funil-pct-carrinhos" class="vide-funil-stage-value">0%</strong>
                    </div>
                    <div class="vide-funil-stage">
                        <span class="vide-funil-stage-label">Iniciaram pedido</span>
                        <span class="vide-funil-stage-track"><i id="vide-funil-bar-checkouts" class="vide-funil-stage-fill"></i></span>
                        <strong id="vide-funil-pct-checkouts" class="vide-funil-stage-value">0%</strong>
                    </div>
                    <div class="vide-funil-stage">
                        <span class="vide-funil-stage-label">Foram ao WhatsApp</span>
                        <span class="vide-funil-stage-track"><i id="vide-funil-bar-pedidos" class="vide-funil-stage-fill"></i></span>
                        <strong id="vide-funil-pct-pedidos" class="vide-funil-stage-value">0%</strong>
                    </div>
                </div>

                <div class="vide-funil-summary">
                    <div class="vide-funil-section-title">
                        <strong>Resumo comercial</strong>
                        <span>Intenção de compra</span>
                    </div>
                    <div class="vide-funil-summary-list">
                        <div class="vide-funil-summary-item">
                            <span>Conversão visita → WhatsApp</span>
                            <strong id="vide-funil-conversao">0%</strong>
                        </div>
                        <div class="vide-funil-summary-item">
                            <span>Checkout → WhatsApp</span>
                            <strong id="vide-funil-conversao-checkout">0%</strong>
                        </div>
                        <div class="vide-funil-summary-item">
                            <span>Valor potencial enviado</span>
                            <strong id="vide-funil-valor">R$ 0,00</strong>
                        </div>
                    </div>
                </div>
            </div>

            <p id="vide-funil-status" data-state="loading" aria-live="polite">
                Carregando métricas da loja pública...
            </p>
        `;

        view.insertAdjacentElement("afterbegin", painel);

        document.getElementById("vide-funil-periodo")?.addEventListener("change", function() {
            renderizarMetricasFunil(metricasFunilDados);
        });

        return true;
    }

    function numeroMetrica(valor) {
        var numero = Number(valor || 0);
        return Number.isFinite(numero) && numero > 0 ? numero : 0;
    }

    function chaveDataLocal(data) {
        return [
            data.getFullYear(),
            String(data.getMonth() + 1).padStart(2, "0"),
            String(data.getDate()).padStart(2, "0")
        ].join("-");
    }

    function dadosPeriodoMetricas(porDia, dias) {
        var resultado = {
            sessoes: 0,
            carrinhosAbertos: 0,
            adicoesCarrinho: 0,
            checkoutsIniciados: 0,
            pedidosWhatsapp: 0,
            valorPedidosWhatsapp: 0,
            compartilhamentos: 0
        };

        var limite = null;
        if (dias > 0) {
            limite = new Date();
            limite.setHours(0, 0, 0, 0);
            limite.setDate(limite.getDate() - (dias - 1));
        }

        Object.entries(porDia || {}).forEach(function(entrada) {
            var dataChave = entrada[0];
            var dadosDia = entrada[1] || {};
            if (limite) {
                var data = new Date(dataChave + "T00:00:00");
                if (Number.isNaN(data.getTime()) || data < limite) return;
            }

            resultado.sessoes += numeroMetrica(dadosDia.sessoes);
            resultado.carrinhosAbertos += numeroMetrica(dadosDia.carrinhosAbertos);
            resultado.adicoesCarrinho += numeroMetrica(dadosDia.adicoesCarrinho);
            resultado.checkoutsIniciados += numeroMetrica(dadosDia.checkoutsIniciados);
            resultado.pedidosWhatsapp += numeroMetrica(dadosDia.pedidosWhatsapp);
            resultado.valorPedidosWhatsapp += numeroMetrica(dadosDia.valorPedidosWhatsapp);
            resultado.compartilhamentos += numeroMetrica(dadosDia.compartilhamentos);
        });

        return resultado;
    }

    function formatarPercentual(parte, total) {
        if (!total || !parte) return "0%";
        var percentual = Math.min(100, Math.max(0, (parte / total) * 100));
        return percentual.toLocaleString("pt-BR", {
            minimumFractionDigits: percentual < 10 ? 1 : 0,
            maximumFractionDigits: 1
        }) + "%";
    }

    function larguraPercentual(parte, total) {
        if (!total || !parte) return 0;
        return Math.max(3, Math.min(100, (parte / total) * 100));
    }

    function definirTextoMetrica(id, valor) {
        var elemento = document.getElementById(id);
        if (elemento) elemento.textContent = valor;
    }

    function definirBarraMetrica(id, parte, total) {
        var barra = document.getElementById(id);
        if (barra) barra.style.width = larguraPercentual(parte, total) + "%";
    }

    function renderizarMetricasFunil(dadosDocumento) {
        if (!document.getElementById("vide-funil-loja-publica")) return;

        var dias = Number(document.getElementById("vide-funil-periodo")?.value || 30);
        var dados = dadosPeriodoMetricas(dadosDocumento?.porDia || {}, dias);

        // Documentos antigos podem ter totalSessoes sem histórico porDia.
        // O fallback só é usado em "Todo o período" para não misturar datas.
        if (dias === 0 && dados.sessoes === 0) {
            dados.sessoes = numeroMetrica(dadosDocumento?.totalSessoes);
        }

        var inteiro = new Intl.NumberFormat("pt-BR");
        var moeda = new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL"
        });

        definirTextoMetrica("vide-funil-sessoes", inteiro.format(dados.sessoes));
        definirTextoMetrica("vide-funil-carrinhos", inteiro.format(dados.carrinhosAbertos));
        definirTextoMetrica("vide-funil-adicoes", inteiro.format(dados.adicoesCarrinho));
        definirTextoMetrica("vide-funil-checkouts", inteiro.format(dados.checkoutsIniciados));
        definirTextoMetrica("vide-funil-pedidos", inteiro.format(dados.pedidosWhatsapp));
        definirTextoMetrica("vide-funil-compartilhamentos", inteiro.format(dados.compartilhamentos));
        definirTextoMetrica("vide-funil-valor", moeda.format(dados.valorPedidosWhatsapp));

        definirTextoMetrica("vide-funil-pct-sessoes", dados.sessoes ? "100%" : "0%");
        definirTextoMetrica("vide-funil-pct-carrinhos", formatarPercentual(dados.carrinhosAbertos, dados.sessoes));
        definirTextoMetrica("vide-funil-pct-checkouts", formatarPercentual(dados.checkoutsIniciados, dados.sessoes));
        definirTextoMetrica("vide-funil-pct-pedidos", formatarPercentual(dados.pedidosWhatsapp, dados.sessoes));
        definirTextoMetrica("vide-funil-conversao", formatarPercentual(dados.pedidosWhatsapp, dados.sessoes));
        definirTextoMetrica("vide-funil-conversao-checkout", formatarPercentual(dados.pedidosWhatsapp, dados.checkoutsIniciados));

        definirBarraMetrica("vide-funil-bar-sessoes", dados.sessoes, dados.sessoes);
        definirBarraMetrica("vide-funil-bar-carrinhos", dados.carrinhosAbertos, dados.sessoes);
        definirBarraMetrica("vide-funil-bar-checkouts", dados.checkoutsIniciados, dados.sessoes);
        definirBarraMetrica("vide-funil-bar-pedidos", dados.pedidosWhatsapp, dados.sessoes);

        var status = document.getElementById("vide-funil-status");
        if (status) {
            status.dataset.state = "ready";
            status.textContent = "Métricas atualizadas em tempo real. Os novos indicadores começam a contar após a publicação desta versão.";
        }
    }

    async function obterTenantMetricasFunil() {
        var contexto = window.VideHubContext;
        var uidContexto = contexto?.getStoreUid?.() || contexto?.getEffectiveUid?.();
        if (uidContexto) return uidContexto;

        await new Promise(function(resolve) {
            var finalizado = false;
            var concluir = function() {
                if (finalizado) return;
                finalizado = true;
                window.removeEventListener("videhub:context-ready", concluir);
                resolve();
            };
            window.addEventListener("videhub:context-ready", concluir, { once: true });
            setTimeout(concluir, 5000);
        });

        contexto = window.VideHubContext;
        uidContexto = contexto?.getStoreUid?.() || contexto?.getEffectiveUid?.();
        if (uidContexto) return uidContexto;

        var masterUID = new URLSearchParams(window.location.search).get("masterUID");
        if (masterUID) return masterUID;

        try {
            var firebase = await import("./firebase-init.js");
            if (firebase.auth?.currentUser?.uid) return firebase.auth.currentUser.uid;

            var authSdk = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
            return await new Promise(function(resolve) {
                var timeout = setTimeout(function() { resolve(""); }, 4000);
                var unsubscribe = authSdk.onAuthStateChanged(firebase.auth, function(usuario) {
                    clearTimeout(timeout);
                    unsubscribe();
                    resolve(usuario?.uid || "");
                });
            });
        } catch (erro) {
            console.warn("[Vide Hub] Não foi possível resolver o tenant das métricas.", erro);
            return "";
        }
    }

    async function conectarMetricasFunil() {
        if (metricasFunilIniciadas) return;
        metricasFunilIniciadas = true;

        var status = document.getElementById("vide-funil-status");

        try {
            if (window.VideHubContext?.initialized && !window.VideHubContext.canView?.("metricas")) {
                document.getElementById("vide-funil-loja-publica")?.remove();
                return;
            }

            var tenantUid = await obterTenantMetricasFunil();
            if (!tenantUid) {
                throw new Error("Loja não identificada.");
            }

            var modulos = await Promise.all([
                import("./firebase-init.js"),
                import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js")
            ]);
            var firebase = modulos[0];
            var firestore = modulos[1];

            if (typeof metricasFunilDesinscrever === "function") {
                metricasFunilDesinscrever();
            }

            metricasFunilDesinscrever = firestore.onSnapshot(
                firestore.doc(firebase.db, "metricas_vitrines", tenantUid),
                function(snapshot) {
                    metricasFunilDados = snapshot.exists() ? (snapshot.data() || {}) : {};
                    renderizarMetricasFunil(metricasFunilDados);
                },
                function(erro) {
                    console.error("[Vide Hub] Erro ao carregar funil público:", erro);
                    if (status) {
                        status.dataset.state = "error";
                        status.textContent = "Não foi possível carregar o funil agora.";
                    }
                }
            );
        } catch (erro) {
            console.error("[Vide Hub] Erro ao iniciar métricas do funil:", erro);
            if (status) {
                status.dataset.state = "error";
                status.textContent = "Não foi possível carregar o funil agora.";
            }
        }
    }

    function inicializarMetricasFunilDashboard() {
        var tentativas = 0;
        var intervalo = setInterval(function() {
            tentativas += 1;

            if (criarPainelMetricasFunil()) {
                clearInterval(intervalo);
                conectarMetricasFunil();
                return;
            }

            if (tentativas >= 60) {
                clearInterval(intervalo);
                console.warn("[Vide Hub] Área de métricas não encontrada para inserir o funil.");
            }
        }, 180);
    }

    aguardarDOMContentLoaded(inicializarFaviconDashboard);
    aguardarDOMContentLoaded(inicializarMetricasFunilDashboard);
})();
