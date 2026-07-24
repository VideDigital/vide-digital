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


    // =========================================================
    // NAVEGAÇÃO V2 — DOCK COMPACTO + CENTRAL DE COMANDOS
    // Implementado como camada progressiva para preservar o
    // dashboard, permissões, modo master e ações existentes.
    // =========================================================
    var comandoV2Aberto = false;
    var comandoV2IndiceAtivo = 0;
    var comandoV2Resultados = [];
    var comandoV2FocoAnterior = null;

    var COMANDO_V2_META = {
        "view-dashboard": {
            titulo: "Visão Geral",
            descricao: "Dashboard operacional, atalhos e resumo da loja",
            categoria: "Principal",
            palavras: "inicio home painel operação resultados"
        },
        "view-perfil": {
            titulo: "Configurações da Loja",
            descricao: "Identidade, aparência, redes sociais e dados públicos",
            categoria: "Loja",
            palavras: "perfil identidade cores vitrine favicon configurações"
        },
        "view-dominios": {
            titulo: "Pixels & Domínio",
            descricao: "Domínio próprio, integrações e rastreamento",
            categoria: "Loja",
            palavras: "pixel meta google domínio rastreamento analytics"
        },
        "view-leads": {
            titulo: "Leads",
            descricao: "Contatos capturados e oportunidades comerciais",
            categoria: "Vendas",
            palavras: "capturas contatos clientes oportunidades funil"
        },
        "view-automacao-leads": {
            titulo: "Automação de Leads",
            descricao: "Regras, fluxos e ações automáticas",
            categoria: "Vendas",
            palavras: "automação fluxo regra disparo follow-up"
        },
        "view-atendimento": {
            titulo: "Central de Atendimento",
            descricao: "Conversas, suporte e respostas aos clientes",
            categoria: "Relacionamento",
            palavras: "chat mensagens inbox suporte conversa whatsapp"
        },
        "view-crm360": {
            titulo: "CRM 360 do Cliente",
            descricao: "Cadastro, relacionamento e histórico completo",
            categoria: "Relacionamento",
            palavras: "crm clientes cadastro histórico relacionamento"
        },
        "view-central-ia": {
            titulo: "Central de IA",
            descricao: "Configuração da inteligência artificial da loja",
            categoria: "Inteligência",
            palavras: "ia inteligência artificial assistente automação"
        },
        "view-base-conhecimento": {
            titulo: "Base de Conhecimento",
            descricao: "FAQ, políticas e informações usadas pela IA",
            categoria: "Inteligência",
            palavras: "faq políticas manuais documentos conhecimento ia"
        },
        "view-templates": {
            titulo: "Templates",
            descricao: "Mensagens prontas para vendas e atendimento",
            categoria: "Relacionamento",
            palavras: "mensagens respostas prontas atalhos comunicação"
        },
        "view-campanhas": {
            titulo: "Campanhas",
            descricao: "Ofertas, comunicações e ações promocionais",
            categoria: "Marketing",
            palavras: "ofertas promoções campanhas contador marketing"
        },
        "view-landing-pages": {
            titulo: "Landing Pages",
            descricao: "Páginas personalizadas para campanhas e conversão",
            categoria: "Marketing",
            palavras: "landing page páginas editor conversão campanha"
        },
        "view-pedidos": {
            titulo: "Pedidos",
            descricao: "Acompanhamento comercial e status das vendas",
            categoria: "Vendas",
            palavras: "vendas checkout pagamento carrinho pedidos"
        },
        "view-avaliacoes": {
            titulo: "Avaliações",
            descricao: "Moderação dos depoimentos enviados por clientes",
            categoria: "Loja",
            palavras: "reviews estrelas comentários depoimentos confiança"
        },
        "view-metricas": {
            titulo: "Métricas",
            descricao: "Visitas, funil, conversões e desempenho da loja",
            categoria: "Análise",
            palavras: "analytics dados visitas conversão funil desempenho"
        },
        "view-notificacoes": {
            titulo: "Notificações",
            descricao: "Avisos e atualizações importantes da plataforma",
            categoria: "Sistema",
            palavras: "avisos alertas novidades atualizações"
        },
        "view-personalizacao": {
            titulo: "Personalização Premium",
            descricao: "Serviço especializado da equipe Vide Hub",
            categoria: "Loja",
            palavras: "design customização equipe serviço premium"
        },
        "view-guia": {
            titulo: "Guia do Plano",
            descricao: "Recursos disponíveis e instruções de uso",
            categoria: "Sistema",
            palavras: "ajuda tutorial plano recursos suporte"
        },
        "view-funcionarios": {
            titulo: "Funcionários",
            descricao: "Equipe, acessos e permissões da operação",
            categoria: "Gestão",
            palavras: "equipe usuários permissões colaboradores acessos"
        }
    };

    var COMANDO_V2_ORDEM_CATEGORIAS = [
        "Principal",
        "Loja",
        "Vendas",
        "Relacionamento",
        "Marketing",
        "Inteligência",
        "Análise",
        "Gestão",
        "Sistema",
        "Outros"
    ];

    function normalizarBuscaComandoV2(valor) {
        return String(valor || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();
    }

    function rotuloOriginalNavV2(botao) {
        var alvo = String(botao?.dataset?.target || "");
        if (COMANDO_V2_META[alvo]?.titulo) return COMANDO_V2_META[alvo].titulo;

        var aria = String(botao?.getAttribute("aria-label") || "")
            .replace(/^abrir\s+/i, "")
            .trim();
        if (aria) return aria;

        var clone = botao?.cloneNode(true);
        clone?.querySelectorAll("svg, .vide-dock-label, [aria-hidden='true']").forEach(function(el) {
            el.remove();
        });
        return String(clone?.textContent || alvo || "Módulo")
            .replace(/\s+/g, " ")
            .trim();
    }

    function inserirEstilosNavegacaoV2() {
        if (document.getElementById("vide-navigation-v2-style")) return;

        var style = document.createElement("style");
        style.id = "vide-navigation-v2-style";
        style.textContent = `
            :root {
                --vide-dock-width: 88px;
                --vide-dock-expanded: 292px;
                --vide-command-border: rgba(148,163,184,.16);
                --vide-command-surface: rgba(10,16,30,.97);
                --vide-command-card: rgba(255,255,255,.038);
            }

            @media (min-width: 768px) {
                body.vide-navigation-v2 {
                    --vide-sidebar-reserved: var(--vide-dock-width);
                }

                body.vide-navigation-v2 #admin-sidebar {
                    position: sticky !important;
                    top: 0;
                    width: var(--vide-dock-width) !important;
                    min-width: var(--vide-dock-width) !important;
                    max-width: var(--vide-dock-width) !important;
                    flex: 0 0 var(--vide-dock-width) !important;
                    height: 100vh !important;
                    padding: 12px !important;
                    overflow: visible !important;
                    isolation: isolate;
                    background: transparent !important;
                    border: 0 !important;
                    box-shadow: none !important;
                    z-index: 70 !important;
                }

                body.vide-navigation-v2 #admin-sidebar::before {
                    content: "";
                    position: absolute;
                    inset: 10px auto 10px 10px;
                    width: calc(var(--vide-dock-width) - 20px);
                    border-radius: 24px;
                    border: 1px solid rgba(148,163,184,.15);
                    background:
                        radial-gradient(circle at 18% 0%, color-mix(in srgb, var(--sys-primaria,#6d5dfc) 18%, transparent), transparent 30%),
                        linear-gradient(180deg, rgba(17,24,39,.985), rgba(3,7,18,.985));
                    box-shadow: 0 24px 70px rgba(0,0,0,.36);
                    transition: width .28s cubic-bezier(.2,.75,.2,1), box-shadow .28s ease;
                    pointer-events: none;
                    z-index: -1;
                }

                body.vide-navigation-v2 #admin-sidebar:hover::before,
                body.vide-navigation-v2 #admin-sidebar:focus-within::before {
                    width: calc(var(--vide-dock-expanded) - 20px);
                    box-shadow: 18px 28px 80px rgba(0,0,0,.48);
                }

                body.vide-navigation-v2 #admin-sidebar > * {
                    width: calc(var(--vide-dock-width) - 24px);
                    max-width: calc(var(--vide-dock-width) - 24px);
                    transition: width .28s cubic-bezier(.2,.75,.2,1), max-width .28s cubic-bezier(.2,.75,.2,1);
                }

                body.vide-navigation-v2 #admin-sidebar:hover > *,
                body.vide-navigation-v2 #admin-sidebar:focus-within > * {
                    width: calc(var(--vide-dock-expanded) - 24px);
                    max-width: calc(var(--vide-dock-expanded) - 24px);
                }

                body.vide-navigation-v2 #admin-sidebar .vide-dock-main {
                    display: flex;
                    flex-direction: column;
                    gap: 12px !important;
                    min-height: 0;
                    height: 100%;
                }

                body.vide-navigation-v2 #admin-sidebar .vide-dock-brand {
                    min-height: 58px;
                    padding: 7px !important;
                    margin: 0 !important;
                    border-radius: 18px !important;
                    overflow: hidden !important;
                    background: rgba(255,255,255,.035) !important;
                    border-color: rgba(255,255,255,.07) !important;
                    flex: 0 0 auto;
                }

                body.vide-navigation-v2 #admin-sidebar .vide-dock-brand #admin-logo-box {
                    width: 44px !important;
                    height: 44px !important;
                    min-width: 44px !important;
                    border-radius: 14px !important;
                    font-size: 16px !important;
                    box-shadow: 0 12px 28px color-mix(in srgb, var(--sys-primaria,#6d5dfc) 28%, transparent) !important;
                }

                body.vide-navigation-v2 #admin-sidebar .vide-dock-brand-copy {
                    opacity: 0;
                    visibility: hidden;
                    transform: translateX(-8px);
                    max-width: 0;
                    overflow: hidden;
                    white-space: nowrap;
                    transition: opacity .18s ease, transform .24s ease, max-width .28s ease, visibility .18s ease;
                }

                body.vide-navigation-v2 #admin-sidebar:hover .vide-dock-brand-copy,
                body.vide-navigation-v2 #admin-sidebar:focus-within .vide-dock-brand-copy {
                    opacity: 1;
                    visibility: visible;
                    transform: translateX(0);
                    max-width: 180px;
                }

                body.vide-navigation-v2 #admin-sidebar .vide-dock-workspace {
                    max-height: 0;
                    min-height: 0;
                    margin: 0 !important;
                    padding: 0 !important;
                    opacity: 0;
                    overflow: hidden;
                    border-width: 0 !important;
                    transform: translateY(-6px);
                    transition: max-height .26s ease, opacity .18s ease, padding .26s ease, transform .26s ease, border-width .2s ease;
                    flex: 0 0 auto;
                }

                body.vide-navigation-v2 #admin-sidebar:hover .vide-dock-workspace,
                body.vide-navigation-v2 #admin-sidebar:focus-within .vide-dock-workspace {
                    max-height: 150px;
                    padding: 14px !important;
                    opacity: 1;
                    border-width: 1px !important;
                    transform: translateY(0);
                }

                body.vide-navigation-v2 #sidebar-nav {
                    display: block !important;
                    flex: 1 1 auto !important;
                    min-height: 0 !important;
                    overflow-x: hidden !important;
                    overflow-y: auto !important;
                    padding: 0 2px 8px !important;
                    scrollbar-width: thin;
                    scrollbar-color: rgba(148,163,184,.26) transparent;
                }

                body.vide-navigation-v2 #sidebar-nav::-webkit-scrollbar {
                    width: 4px;
                }

                body.vide-navigation-v2 #sidebar-nav::-webkit-scrollbar-thumb {
                    background: rgba(148,163,184,.24);
                    border-radius: 999px;
                }

                body.vide-navigation-v2 .aura-sidebar-navigation-header {
                    min-height: 24px;
                    margin: 0 2px 8px !important;
                    padding: 0 8px !important;
                    overflow: hidden;
                }

                body.vide-navigation-v2 .aura-sidebar-navigation-header > div,
                body.vide-navigation-v2 .aura-sidebar-navigation-badge {
                    opacity: 0;
                    visibility: hidden;
                    transform: translateX(-8px);
                    transition: opacity .18s ease, transform .24s ease, visibility .18s ease;
                    white-space: nowrap;
                }

                body.vide-navigation-v2 #admin-sidebar:hover .aura-sidebar-navigation-header > div,
                body.vide-navigation-v2 #admin-sidebar:hover .aura-sidebar-navigation-badge,
                body.vide-navigation-v2 #admin-sidebar:focus-within .aura-sidebar-navigation-header > div,
                body.vide-navigation-v2 #admin-sidebar:focus-within .aura-sidebar-navigation-badge {
                    opacity: 1;
                    visibility: visible;
                    transform: translateX(0);
                }

                body.vide-navigation-v2 .aura-sidebar-navigation-header h3 {
                    font-size: 14px !important;
                    line-height: 1.2 !important;
                }

                body.vide-navigation-v2 .aura-sidebar-search {
                    position: relative;
                    min-height: 48px;
                    margin: 0 2px 10px !important;
                    padding: 0 14px !important;
                    display: flex !important;
                    align-items: center !important;
                    gap: 12px !important;
                    border-radius: 15px !important;
                    border: 1px solid rgba(148,163,184,.13) !important;
                    background: rgba(255,255,255,.035) !important;
                    cursor: pointer;
                    overflow: hidden;
                    transition: background .18s ease, border-color .18s ease, transform .18s ease;
                }

                body.vide-navigation-v2 .aura-sidebar-search:hover {
                    background: rgba(255,255,255,.065) !important;
                    border-color: color-mix(in srgb, var(--sys-destaque,#60a5fa) 38%, transparent) !important;
                }

                body.vide-navigation-v2 .aura-sidebar-search > svg {
                    width: 20px !important;
                    height: 20px !important;
                    min-width: 20px !important;
                    color: #94a3b8 !important;
                }

                body.vide-navigation-v2 .aura-sidebar-search-editor {
                    min-width: 165px;
                    width: 165px;
                    opacity: 0;
                    visibility: hidden;
                    pointer-events: none;
                    white-space: nowrap;
                    color: #e5e7eb !important;
                    font-size: 12px !important;
                    font-weight: 700 !important;
                    transform: translateX(-7px);
                    transition: opacity .18s ease, transform .24s ease, visibility .18s ease;
                }

                body.vide-navigation-v2 .aura-sidebar-search kbd {
                    opacity: 0;
                    visibility: hidden;
                    margin-left: auto;
                    transition: opacity .18s ease, visibility .18s ease;
                }

                body.vide-navigation-v2 #admin-sidebar:hover .aura-sidebar-search-editor,
                body.vide-navigation-v2 #admin-sidebar:hover .aura-sidebar-search kbd,
                body.vide-navigation-v2 #admin-sidebar:focus-within .aura-sidebar-search-editor,
                body.vide-navigation-v2 #admin-sidebar:focus-within .aura-sidebar-search kbd {
                    opacity: 1;
                    visibility: visible;
                    transform: translateX(0);
                }

                body.vide-navigation-v2 #sidebar-navigation-groups {
                    display: flex !important;
                    flex-direction: column !important;
                    gap: 5px !important;
                    padding: 0 !important;
                }

                body.vide-navigation-v2 #sidebar-navigation-groups .nav-item {
                    position: relative;
                    width: 100% !important;
                    min-height: 46px !important;
                    margin: 0 !important;
                    padding: 11px 13px !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: flex-start !important;
                    gap: 0 !important;
                    border-radius: 14px !important;
                    overflow: hidden !important;
                    white-space: nowrap;
                    border: 1px solid transparent !important;
                    background: transparent !important;
                    transition: background .18s ease, border-color .18s ease, color .18s ease, transform .18s ease !important;
                }

                body.vide-navigation-v2 #sidebar-navigation-groups .nav-item.hidden {
                    display: none !important;
                }

                body.vide-navigation-v2 #sidebar-navigation-groups .nav-item:hover {
                    background: rgba(255,255,255,.055) !important;
                    color: #fff !important;
                    border-color: rgba(148,163,184,.12) !important;
                    transform: translateX(1px);
                }

                body.vide-navigation-v2 #sidebar-navigation-groups .nav-item.active {
                    color: #fff !important;
                    background:
                        linear-gradient(90deg,
                            color-mix(in srgb, var(--sys-primaria,#6d5dfc) 24%, transparent),
                            color-mix(in srgb, var(--sys-destaque,#60a5fa) 10%, transparent)
                        ) !important;
                    border-color: color-mix(in srgb, var(--sys-destaque,#60a5fa) 25%, transparent) !important;
                    box-shadow: inset 3px 0 0 var(--sys-destaque,#60a5fa);
                }

                body.vide-navigation-v2 #sidebar-navigation-groups .nav-item > svg,
                body.vide-navigation-v2 #sidebar-navigation-groups .nav-item > .vide-dock-icon {
                    width: 20px !important;
                    height: 20px !important;
                    min-width: 20px !important;
                    flex: 0 0 20px !important;
                    margin: 0 !important;
                    color: currentColor;
                }

                body.vide-navigation-v2 .vide-dock-label {
                    display: block !important;
                    max-width: 0;
                    margin-left: 0;
                    opacity: 0;
                    visibility: hidden;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    color: inherit;
                    font-size: 12px;
                    line-height: 1.2;
                    font-weight: 700;
                    transform: translateX(-7px);
                    transition: max-width .28s ease, margin-left .28s ease, opacity .18s ease, transform .24s ease, visibility .18s ease;
                }

                body.vide-navigation-v2 #admin-sidebar:hover .vide-dock-label,
                body.vide-navigation-v2 #admin-sidebar:focus-within .vide-dock-label {
                    max-width: 205px;
                    margin-left: 12px;
                    opacity: 1;
                    visibility: visible;
                    transform: translateX(0);
                }

                body.vide-navigation-v2 #sidebar-navigation-empty {
                    display: none !important;
                }

                body.vide-navigation-v2 #box-atalho,
                body.vide-navigation-v2 #box-logout {
                    overflow: hidden !important;
                    flex: 0 0 auto;
                }

                body.vide-navigation-v2 #admin-sidebar:not(:hover):not(:focus-within) #box-atalho,
                body.vide-navigation-v2 #admin-sidebar:not(:hover):not(:focus-within) #box-logout {
                    max-height: 52px;
                }

                body.vide-navigation-v2 #admin-sidebar:not(:hover):not(:focus-within) #box-atalho *:not(svg):not(path),
                body.vide-navigation-v2 #admin-sidebar:not(:hover):not(:focus-within) #box-logout *:not(svg):not(path) {
                    text-overflow: clip;
                }
            }

            #vide-command-center-v2 {
                position: fixed;
                inset: 0;
                z-index: 10000;
                display: flex;
                align-items: flex-start;
                justify-content: center;
                padding: clamp(18px, 5vh, 58px) 18px 18px;
                opacity: 0;
                visibility: hidden;
                pointer-events: none;
                transition: opacity .18s ease, visibility .18s ease;
            }

            #vide-command-center-v2.is-open {
                opacity: 1;
                visibility: visible;
                pointer-events: auto;
            }

            #vide-command-center-v2 .vide-command-backdrop {
                position: absolute;
                inset: 0;
                background: rgba(2,6,23,.82);
                backdrop-filter: blur(16px);
                -webkit-backdrop-filter: blur(16px);
            }

            #vide-command-center-v2 .vide-command-panel {
                position: relative;
                width: min(960px, 100%);
                max-height: min(820px, calc(100vh - 76px));
                display: flex;
                flex-direction: column;
                overflow: hidden;
                border-radius: 26px;
                border: 1px solid var(--vide-command-border);
                background:
                    radial-gradient(circle at 10% 0%, color-mix(in srgb, var(--sys-primaria,#6d5dfc) 16%, transparent), transparent 30%),
                    radial-gradient(circle at 92% 8%, color-mix(in srgb, var(--sys-destaque,#60a5fa) 12%, transparent), transparent 28%),
                    var(--vide-command-surface);
                box-shadow: 0 34px 100px rgba(0,0,0,.58);
                transform: translateY(-12px) scale(.985);
                transition: transform .22s cubic-bezier(.2,.75,.2,1);
            }

            #vide-command-center-v2.is-open .vide-command-panel {
                transform: translateY(0) scale(1);
            }

            .vide-command-header {
                display: flex;
                align-items: center;
                gap: 14px;
                padding: 20px 22px 16px;
                border-bottom: 1px solid rgba(148,163,184,.11);
            }

            .vide-command-search-shell {
                min-width: 0;
                flex: 1;
                height: 54px;
                display: flex;
                align-items: center;
                gap: 13px;
                padding: 0 17px;
                border-radius: 17px;
                border: 1px solid rgba(148,163,184,.15);
                background: rgba(255,255,255,.045);
                box-shadow: inset 0 1px 0 rgba(255,255,255,.035);
            }

            .vide-command-search-shell > svg {
                width: 22px;
                height: 22px;
                min-width: 22px;
                color: var(--sys-destaque,#60a5fa);
            }

            #vide-command-search-v2 {
                width: 100%;
                height: 100%;
                border: 0;
                outline: 0;
                background: transparent;
                color: #f8fafc;
                font-size: 15px;
                font-weight: 700;
            }

            #vide-command-search-v2::placeholder {
                color: #64748b;
                font-weight: 600;
            }

            .vide-command-close {
                width: 46px;
                height: 46px;
                min-width: 46px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                border-radius: 14px;
                border: 1px solid rgba(148,163,184,.14);
                background: rgba(255,255,255,.04);
                color: #94a3b8;
                cursor: pointer;
                transition: background .18s ease, color .18s ease, border-color .18s ease;
            }

            .vide-command-close:hover {
                color: #fff;
                background: rgba(255,255,255,.08);
                border-color: rgba(148,163,184,.25);
            }

            .vide-command-close svg {
                width: 20px;
                height: 20px;
            }

            .vide-command-intro {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 18px;
                padding: 0 22px 17px;
                border-bottom: 1px solid rgba(148,163,184,.09);
            }

            .vide-command-intro-copy small {
                display: block;
                color: var(--sys-destaque,#60a5fa);
                font-size: 9px;
                font-weight: 900;
                letter-spacing: .18em;
                text-transform: uppercase;
            }

            .vide-command-intro-copy strong {
                display: block;
                margin-top: 5px;
                color: #fff;
                font-size: 17px;
                line-height: 1.2;
                font-weight: 900;
            }

            .vide-command-intro-copy span {
                display: block;
                margin-top: 4px;
                color: #94a3b8;
                font-size: 12px;
                line-height: 1.5;
            }

            #vide-command-count-v2 {
                flex: 0 0 auto;
                padding: 8px 11px;
                border-radius: 999px;
                border: 1px solid rgba(148,163,184,.13);
                background: rgba(255,255,255,.04);
                color: #cbd5e1;
                font-size: 10px;
                font-weight: 800;
            }

            #vide-command-results-v2 {
                flex: 1 1 auto;
                min-height: 240px;
                overflow-y: auto;
                padding: 18px 22px 24px;
                scrollbar-width: thin;
                scrollbar-color: rgba(148,163,184,.25) transparent;
            }

            #vide-command-results-v2::-webkit-scrollbar {
                width: 6px;
            }

            #vide-command-results-v2::-webkit-scrollbar-thumb {
                border-radius: 999px;
                background: rgba(148,163,184,.24);
            }

            .vide-command-group + .vide-command-group {
                margin-top: 22px;
            }

            .vide-command-group-title {
                display: flex;
                align-items: center;
                gap: 9px;
                margin: 0 2px 10px;
                color: #94a3b8;
                font-size: 10px;
                line-height: 1;
                font-weight: 900;
                letter-spacing: .16em;
                text-transform: uppercase;
            }

            .vide-command-group-title::before {
                content: "";
                width: 6px;
                height: 6px;
                border-radius: 999px;
                background: var(--sys-destaque,#60a5fa);
                box-shadow: 0 0 16px color-mix(in srgb, var(--sys-destaque,#60a5fa) 70%, transparent);
            }

            .vide-command-grid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 9px;
            }

            .vide-command-item {
                position: relative;
                min-height: 76px;
                display: grid;
                grid-template-columns: 46px minmax(0,1fr) auto;
                align-items: center;
                gap: 13px;
                padding: 12px 13px;
                text-align: left;
                border-radius: 17px;
                border: 1px solid rgba(148,163,184,.10);
                background: var(--vide-command-card);
                color: #cbd5e1;
                cursor: pointer;
                overflow: hidden;
                transition: transform .16s ease, background .16s ease, border-color .16s ease, box-shadow .16s ease;
            }

            .vide-command-item:hover,
            .vide-command-item.is-active {
                transform: translateY(-1px);
                color: #fff;
                border-color: color-mix(in srgb, var(--sys-destaque,#60a5fa) 38%, transparent);
                background:
                    linear-gradient(135deg,
                        color-mix(in srgb, var(--sys-primaria,#6d5dfc) 14%, rgba(255,255,255,.05)),
                        color-mix(in srgb, var(--sys-destaque,#60a5fa) 7%, rgba(255,255,255,.035))
                    );
                box-shadow: 0 12px 30px rgba(0,0,0,.2);
            }

            .vide-command-item-icon {
                width: 46px;
                height: 46px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                border-radius: 14px;
                border: 1px solid rgba(148,163,184,.13);
                background: rgba(255,255,255,.045);
                color: var(--sys-destaque,#60a5fa);
            }

            .vide-command-item-icon svg {
                width: 21px !important;
                height: 21px !important;
            }

            .vide-command-item-copy {
                min-width: 0;
            }

            .vide-command-item-copy strong {
                display: block;
                color: inherit;
                font-size: 13px;
                line-height: 1.25;
                font-weight: 850;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .vide-command-item-copy span {
                display: block;
                margin-top: 4px;
                color: #7f8da3;
                font-size: 10.5px;
                line-height: 1.35;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .vide-command-item-arrow {
                width: 30px;
                height: 30px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                border-radius: 10px;
                border: 1px solid rgba(148,163,184,.11);
                color: #64748b;
                transition: color .16s ease, transform .16s ease, background .16s ease;
            }

            .vide-command-item:hover .vide-command-item-arrow,
            .vide-command-item.is-active .vide-command-item-arrow {
                color: #fff;
                transform: translateX(2px);
                background: rgba(255,255,255,.06);
            }

            .vide-command-item-arrow svg {
                width: 15px;
                height: 15px;
            }

            .vide-command-empty {
                min-height: 260px;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                text-align: center;
                color: #64748b;
            }

            .vide-command-empty span {
                width: 56px;
                height: 56px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                margin-bottom: 14px;
                border-radius: 18px;
                border: 1px solid rgba(148,163,184,.12);
                background: rgba(255,255,255,.035);
            }

            .vide-command-empty svg {
                width: 24px;
                height: 24px;
            }

            .vide-command-empty strong {
                color: #cbd5e1;
                font-size: 14px;
            }

            .vide-command-empty p {
                margin-top: 5px;
                max-width: 360px;
                font-size: 11px;
                line-height: 1.5;
            }

            .vide-command-footer {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 16px;
                padding: 12px 22px;
                border-top: 1px solid rgba(148,163,184,.10);
                background: rgba(2,6,23,.42);
                color: #64748b;
                font-size: 10px;
            }

            .vide-command-footer-shortcuts {
                display: flex;
                align-items: center;
                flex-wrap: wrap;
                gap: 12px;
            }

            .vide-command-footer-shortcuts span {
                display: inline-flex;
                align-items: center;
                gap: 6px;
            }

            .vide-command-footer kbd {
                min-width: 24px;
                height: 24px;
                padding: 0 7px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                border-radius: 7px;
                border: 1px solid rgba(148,163,184,.14);
                background: rgba(255,255,255,.045);
                color: #cbd5e1;
                font-family: inherit;
                font-size: 9px;
                font-weight: 800;
                box-shadow: inset 0 -1px 0 rgba(255,255,255,.04);
            }

            #vide-command-mobile-trigger {
                display: none;
            }

            @media (max-width: 767px) {
                #vide-command-mobile-trigger {
                    width: 44px;
                    height: 44px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 14px;
                    border: 1px solid rgba(255,255,255,.10);
                    background: rgba(255,255,255,.05);
                    color: #fff;
                }

                #vide-command-mobile-trigger svg {
                    width: 19px;
                    height: 19px;
                }

                #vide-command-center-v2 {
                    align-items: stretch;
                    padding: 10px;
                }

                #vide-command-center-v2 .vide-command-panel {
                    width: 100%;
                    max-height: calc(100dvh - 20px);
                    border-radius: 22px;
                }

                .vide-command-header {
                    padding: 14px 14px 12px;
                    gap: 9px;
                }

                .vide-command-search-shell {
                    height: 50px;
                    padding: 0 13px;
                }

                #vide-command-search-v2 {
                    font-size: 16px;
                }

                .vide-command-close {
                    width: 44px;
                    height: 44px;
                    min-width: 44px;
                }

                .vide-command-intro {
                    align-items: flex-start;
                    padding: 0 14px 14px;
                }

                .vide-command-intro-copy span {
                    display: none;
                }

                #vide-command-results-v2 {
                    padding: 14px;
                }

                .vide-command-grid {
                    grid-template-columns: 1fr;
                }

                .vide-command-item {
                    min-height: 70px;
                    grid-template-columns: 42px minmax(0,1fr) auto;
                }

                .vide-command-item-icon {
                    width: 42px;
                    height: 42px;
                }

                .vide-command-footer {
                    padding: 10px 14px;
                }

                .vide-command-footer-shortcuts span:nth-child(2) {
                    display: none;
                }
            }

            @media (prefers-reduced-motion: reduce) {
                body.vide-navigation-v2 #admin-sidebar::before,
                body.vide-navigation-v2 #admin-sidebar > *,
                body.vide-navigation-v2 .vide-dock-label,
                #vide-command-center-v2,
                #vide-command-center-v2 .vide-command-panel,
                .vide-command-item {
                    transition-duration: .01ms !important;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function prepararMarcaDockV2(sidebar) {
        var logo = sidebar.querySelector("#admin-logo-box");
        if (!logo) return;

        var marca = logo.closest(".relative");
        if (marca) {
            marca.classList.add("vide-dock-brand");
            var linha = logo.parentElement;
            var copia = linha?.querySelector(":scope > div:not(#admin-logo-box)");
            if (copia) copia.classList.add("vide-dock-brand-copy");
        }

        var cards = Array.from(sidebar.querySelectorAll(".glass-card"));
        var workspace = cards.find(function(card) {
            return normalizarBuscaComandoV2(card.textContent).includes("minha empresa");
        });
        workspace?.classList.add("vide-dock-workspace");
    }

    function prepararRotulosDockV2(sidebar) {
        sidebar.querySelectorAll("#sidebar-navigation-groups .nav-item[data-target]").forEach(function(botao) {
            var alvo = botao.dataset.target;
            var titulo = rotuloOriginalNavV2(botao);
            botao.dataset.videLabel = titulo;
            botao.setAttribute("title", titulo);
            if (!botao.getAttribute("aria-label")) {
                botao.setAttribute("aria-label", "Abrir " + titulo);
            }

            var labelExistente = botao.querySelector(":scope > .vide-dock-label");
            if (!labelExistente) {
                var spansDiretos = Array.from(botao.children).filter(function(el) {
                    return el.tagName === "SPAN" && !el.querySelector("svg");
                });
                var spanComTexto = spansDiretos.find(function(el) {
                    return normalizarBuscaComandoV2(el.textContent) === normalizarBuscaComandoV2(titulo);
                });

                if (spanComTexto) {
                    labelExistente = spanComTexto;
                    labelExistente.classList.add("vide-dock-label");
                } else {
                    Array.from(botao.childNodes).forEach(function(no) {
                        if (no.nodeType === Node.TEXT_NODE && String(no.textContent || "").trim()) {
                            no.remove();
                        }
                    });
                    labelExistente = document.createElement("span");
                    labelExistente.className = "vide-dock-label";
                    labelExistente.textContent = titulo;
                    botao.appendChild(labelExistente);
                }
            }

            var icone = botao.querySelector(":scope > svg");
            if (icone) icone.classList.add("vide-dock-icon");

            var meta = COMANDO_V2_META[alvo];
            if (meta) {
                botao.dataset.videCategoria = meta.categoria;
                botao.dataset.videDescricao = meta.descricao;
            }
        });
    }

    function criarCommandCenterV2() {
        if (document.getElementById("vide-command-center-v2")) return;

        var overlay = document.createElement("div");
        overlay.id = "vide-command-center-v2";
        overlay.setAttribute("aria-hidden", "true");
        overlay.innerHTML = `
            <div class="vide-command-backdrop" data-vide-command-close></div>
            <section class="vide-command-panel"
                     role="dialog"
                     aria-modal="true"
                     aria-labelledby="vide-command-title-v2"
                     aria-describedby="vide-command-description-v2">
                <header class="vide-command-header">
                    <label class="vide-command-search-shell" for="vide-command-search-v2">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                            <circle cx="11" cy="11" r="7"></circle>
                            <path d="m20 20-3.8-3.8"></path>
                        </svg>
                        <input id="vide-command-search-v2"
                               type="search"
                               autocomplete="off"
                               spellcheck="false"
                               placeholder="Pesquisar módulo, ação ou recurso...">
                    </label>
                    <button type="button"
                            class="vide-command-close"
                            id="vide-command-close-v2"
                            aria-label="Fechar Central de Comandos"
                            title="Fechar">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                            <path d="M6 6l12 12M18 6 6 18"></path>
                        </svg>
                    </button>
                </header>

                <div class="vide-command-intro">
                    <div class="vide-command-intro-copy">
                        <small>Navegação inteligente</small>
                        <strong id="vide-command-title-v2">Central de Comandos</strong>
                        <span id="vide-command-description-v2">Encontre qualquer área do Vide Hub sem percorrer o menu lateral.</span>
                    </div>
                    <span id="vide-command-count-v2">0 módulos</span>
                </div>

                <div id="vide-command-results-v2" role="listbox" aria-label="Módulos disponíveis"></div>

                <footer class="vide-command-footer">
                    <div class="vide-command-footer-shortcuts">
                        <span><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
                        <span><kbd>Enter</kbd> abrir</span>
                        <span><kbd>Esc</kbd> fechar</span>
                    </div>
                    <span>Ctrl/⌘ + K</span>
                </footer>
            </section>
        `;
        document.body.appendChild(overlay);

        overlay.querySelector("[data-vide-command-close]")?.addEventListener("click", fecharCommandCenterV2);
        document.getElementById("vide-command-close-v2")?.addEventListener("click", fecharCommandCenterV2);
        document.getElementById("vide-command-search-v2")?.addEventListener("input", function(evento) {
            renderizarCommandCenterV2(evento.target.value);
        });
        document.getElementById("vide-command-search-v2")?.addEventListener("keydown", function(evento) {
            if (evento.key === "ArrowDown") {
                evento.preventDefault();
                moverSelecaoCommandCenterV2(1);
            } else if (evento.key === "ArrowUp") {
                evento.preventDefault();
                moverSelecaoCommandCenterV2(-1);
            } else if (evento.key === "Enter") {
                evento.preventDefault();
                ativarSelecionadoCommandCenterV2();
            }
        });
    }

    function moduloDisponivelCommandV2(botao) {
        if (!botao || botao.disabled) return false;
        if (botao.classList.contains("hidden")) return false;
        if (botao.getAttribute("aria-hidden") === "true") return false;
        return true;
    }

    function coletarModulosCommandCenterV2() {
        var botoes = Array.from(document.querySelectorAll("#sidebar-navigation-groups .nav-item[data-target]"));
        return botoes.filter(moduloDisponivelCommandV2).map(function(botao, indice) {
            var alvo = String(botao.dataset.target || "");
            var meta = COMANDO_V2_META[alvo] || {};
            var titulo = meta.titulo || botao.dataset.videLabel || rotuloOriginalNavV2(botao);
            var descricao = meta.descricao || botao.dataset.videDescricao || "Abrir módulo do dashboard";
            var categoria = meta.categoria || botao.dataset.videCategoria || "Outros";
            var icone = botao.querySelector(":scope > svg")?.outerHTML || `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <rect x="4" y="4" width="16" height="16" rx="4"></rect>
                    <path d="M9 12h6M12 9v6"></path>
                </svg>
            `;

            return {
                id: alvo || ("modulo-" + indice),
                alvo: alvo,
                titulo: titulo,
                descricao: descricao,
                categoria: categoria,
                palavras: meta.palavras || "",
                icone: icone,
                botaoOriginal: botao
            };
        });
    }

    function escaparHtmlCommandV2(valor) {
        return String(valor || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function renderizarCommandCenterV2(termo) {
        var container = document.getElementById("vide-command-results-v2");
        var contador = document.getElementById("vide-command-count-v2");
        if (!container || !contador) return;

        var busca = normalizarBuscaComandoV2(termo);
        var modulos = coletarModulosCommandCenterV2();
        var filtrados = modulos.filter(function(item) {
            if (!busca) return true;
            var base = normalizarBuscaComandoV2([
                item.titulo,
                item.descricao,
                item.categoria,
                item.palavras,
                item.alvo
            ].join(" "));
            return busca.split(" ").every(function(parte) {
                return base.includes(parte);
            });
        });

        filtrados.sort(function(a, b) {
            var categoriaA = COMANDO_V2_ORDEM_CATEGORIAS.indexOf(a.categoria);
            var categoriaB = COMANDO_V2_ORDEM_CATEGORIAS.indexOf(b.categoria);
            if (categoriaA === -1) categoriaA = 999;
            if (categoriaB === -1) categoriaB = 999;
            if (categoriaA !== categoriaB) return categoriaA - categoriaB;
            return a.titulo.localeCompare(b.titulo, "pt-BR");
        });

        comandoV2Resultados = filtrados;
        comandoV2IndiceAtivo = filtrados.length ? Math.min(comandoV2IndiceAtivo, filtrados.length - 1) : 0;
        contador.textContent = filtrados.length + (filtrados.length === 1 ? " módulo" : " módulos");

        if (!filtrados.length) {
            container.innerHTML = `
                <div class="vide-command-empty">
                    <span>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                            <circle cx="11" cy="11" r="7"></circle>
                            <path d="m20 20-3.8-3.8"></path>
                        </svg>
                    </span>
                    <strong>Nenhum módulo encontrado</strong>
                    <p>Tente buscar por outro nome, ação ou recurso da plataforma.</p>
                </div>
            `;
            return;
        }

        var grupos = {};
        filtrados.forEach(function(item, indice) {
            if (!grupos[item.categoria]) grupos[item.categoria] = [];
            grupos[item.categoria].push({ item: item, indice: indice });
        });

        container.innerHTML = COMANDO_V2_ORDEM_CATEGORIAS
            .filter(function(categoria) { return grupos[categoria]?.length; })
            .concat(Object.keys(grupos).filter(function(categoria) {
                return !COMANDO_V2_ORDEM_CATEGORIAS.includes(categoria);
            }))
            .map(function(categoria) {
                var itens = grupos[categoria] || [];
                return `
                    <section class="vide-command-group" aria-label="${escaparHtmlCommandV2(categoria)}">
                        <h3 class="vide-command-group-title">${escaparHtmlCommandV2(categoria)}</h3>
                        <div class="vide-command-grid">
                            ${itens.map(function(registro) {
                                var item = registro.item;
                                var ativo = registro.indice === comandoV2IndiceAtivo;
                                return `
                                    <button type="button"
                                            class="vide-command-item${ativo ? " is-active" : ""}"
                                            data-vide-command-index="${registro.indice}"
                                            role="option"
                                            aria-selected="${ativo ? "true" : "false"}">
                                        <span class="vide-command-item-icon">${item.icone}</span>
                                        <span class="vide-command-item-copy">
                                            <strong>${escaparHtmlCommandV2(item.titulo)}</strong>
                                            <span>${escaparHtmlCommandV2(item.descricao)}</span>
                                        </span>
                                        <span class="vide-command-item-arrow" aria-hidden="true">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <path d="m9 18 6-6-6-6"></path>
                                            </svg>
                                        </span>
                                    </button>
                                `;
                            }).join("")}
                        </div>
                    </section>
                `;
            }).join("");

        container.querySelectorAll("[data-vide-command-index]").forEach(function(botao) {
            botao.addEventListener("mouseenter", function() {
                selecionarIndiceCommandCenterV2(Number(botao.dataset.videCommandIndex), false);
            });
            botao.addEventListener("focus", function() {
                selecionarIndiceCommandCenterV2(Number(botao.dataset.videCommandIndex), false);
            });
            botao.addEventListener("click", function() {
                selecionarIndiceCommandCenterV2(Number(botao.dataset.videCommandIndex), false);
                ativarSelecionadoCommandCenterV2();
            });
        });

        atualizarSelecaoVisualCommandV2(false);
    }

    function atualizarSelecaoVisualCommandV2(rolar) {
        var botoes = Array.from(document.querySelectorAll("#vide-command-results-v2 [data-vide-command-index]"));
        botoes.forEach(function(botao) {
            var ativo = Number(botao.dataset.videCommandIndex) === comandoV2IndiceAtivo;
            botao.classList.toggle("is-active", ativo);
            botao.setAttribute("aria-selected", ativo ? "true" : "false");
            if (ativo && rolar) {
                botao.scrollIntoView({ block: "nearest", behavior: "smooth" });
            }
        });
    }

    function selecionarIndiceCommandCenterV2(indice, rolar) {
        if (!comandoV2Resultados.length) return;
        comandoV2IndiceAtivo = Math.max(0, Math.min(indice, comandoV2Resultados.length - 1));
        atualizarSelecaoVisualCommandV2(Boolean(rolar));
    }

    function moverSelecaoCommandCenterV2(direcao) {
        if (!comandoV2Resultados.length) return;
        var total = comandoV2Resultados.length;
        comandoV2IndiceAtivo = (comandoV2IndiceAtivo + direcao + total) % total;
        atualizarSelecaoVisualCommandV2(true);
    }

    function ativarSelecionadoCommandCenterV2() {
        var item = comandoV2Resultados[comandoV2IndiceAtivo];
        if (!item) return;

        fecharCommandCenterV2(false);

        requestAnimationFrame(function() {
            if (item.botaoOriginal && document.contains(item.botaoOriginal)) {
                item.botaoOriginal.click();
                item.botaoOriginal.focus?.({ preventScroll: true });
                return;
            }

            if (item.alvo && typeof window.ativarAba === "function") {
                window.ativarAba(item.alvo);
            }
        });
    }

    function abrirCommandCenterV2(origem) {
        criarCommandCenterV2();

        var overlay = document.getElementById("vide-command-center-v2");
        var input = document.getElementById("vide-command-search-v2");
        if (!overlay || !input) return;

        comandoV2FocoAnterior = origem || document.activeElement;
        comandoV2Aberto = true;
        comandoV2IndiceAtivo = 0;
        input.value = "";
        renderizarCommandCenterV2("");

        overlay.classList.add("is-open");
        overlay.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";

        requestAnimationFrame(function() {
            input.focus();
        });
    }

    function fecharCommandCenterV2(restaurarFoco) {
        var overlay = document.getElementById("vide-command-center-v2");
        if (!overlay || !comandoV2Aberto) return;

        comandoV2Aberto = false;
        overlay.classList.remove("is-open");
        overlay.setAttribute("aria-hidden", "true");
        document.body.style.overflow = "";

        if (restaurarFoco !== false && comandoV2FocoAnterior && document.contains(comandoV2FocoAnterior)) {
            requestAnimationFrame(function() {
                comandoV2FocoAnterior.focus?.({ preventScroll: true });
            });
        }
    }

    function tratarTecladoGlobalCommandV2(evento) {
        var atalho = (evento.ctrlKey || evento.metaKey) && String(evento.key).toLowerCase() === "k";
        if (atalho) {
            evento.preventDefault();
            evento.stopPropagation();
            evento.stopImmediatePropagation();
            if (comandoV2Aberto) {
                fecharCommandCenterV2();
            } else {
                abrirCommandCenterV2(document.activeElement);
            }
            return;
        }

        if (!comandoV2Aberto) return;

        if (evento.key === "Escape") {
            evento.preventDefault();
            evento.stopPropagation();
            evento.stopImmediatePropagation();
            fecharCommandCenterV2();
            return;
        }

        if (evento.key === "ArrowDown" && document.activeElement?.id !== "vide-command-search-v2") {
            evento.preventDefault();
            moverSelecaoCommandCenterV2(1);
            return;
        }

        if (evento.key === "ArrowUp" && document.activeElement?.id !== "vide-command-search-v2") {
            evento.preventDefault();
            moverSelecaoCommandCenterV2(-1);
            return;
        }

        if (evento.key === "Enter" && document.activeElement?.id !== "vide-command-search-v2") {
            var itemFocado = document.activeElement?.closest?.("[data-vide-command-index]");
            if (!itemFocado) {
                evento.preventDefault();
                ativarSelecionadoCommandCenterV2();
            }
            return;
        }

        if (evento.key === "Tab") {
            var painel = document.querySelector("#vide-command-center-v2 .vide-command-panel");
            var focaveis = Array.from(painel?.querySelectorAll(
                'input, button:not([disabled]), [tabindex]:not([tabindex="-1"])'
            ) || []).filter(function(el) {
                return el.offsetParent !== null;
            });

            if (!focaveis.length) return;
            var primeiro = focaveis[0];
            var ultimo = focaveis[focaveis.length - 1];

            if (evento.shiftKey && document.activeElement === primeiro) {
                evento.preventDefault();
                ultimo.focus();
            } else if (!evento.shiftKey && document.activeElement === ultimo) {
                evento.preventDefault();
                primeiro.focus();
            }
        }
    }

    function prepararBuscaDockV2(sidebar) {
        var busca = sidebar.querySelector(".aura-sidebar-search");
        var editor = sidebar.querySelector("#busca-sidebar-modulos");
        if (!busca) return;

        busca.setAttribute("role", "button");
        busca.setAttribute("tabindex", "0");
        busca.setAttribute("aria-label", "Abrir Central de Comandos");
        busca.setAttribute("title", "Central de Comandos — Ctrl ou Command + K");

        if (editor) {
            editor.setAttribute("contenteditable", "false");
            editor.removeAttribute("role");
            editor.removeAttribute("aria-label");
            editor.textContent = "Pesquisar módulos e ações";
            editor.setAttribute("aria-hidden", "true");
        }

        var kbd = busca.querySelector("kbd");
        if (kbd) kbd.textContent = "Ctrl K";

        busca.addEventListener("click", function(evento) {
            evento.preventDefault();
            abrirCommandCenterV2(busca);
        });
        busca.addEventListener("keydown", function(evento) {
            if (evento.key === "Enter" || evento.key === " ") {
                evento.preventDefault();
                abrirCommandCenterV2(busca);
            }
        });
    }

    function criarBotaoMobileCommandV2() {
        if (document.getElementById("vide-command-mobile-trigger")) return;

        var menu = document.getElementById("mobile-menu-toggle");
        if (!menu?.parentElement) return;

        var botao = document.createElement("button");
        botao.type = "button";
        botao.id = "vide-command-mobile-trigger";
        botao.setAttribute("aria-label", "Abrir Central de Comandos");
        botao.setAttribute("title", "Pesquisar módulos");
        botao.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <circle cx="11" cy="11" r="7"></circle>
                <path d="m20 20-3.8-3.8"></path>
            </svg>
        `;
        botao.addEventListener("click", function() {
            abrirCommandCenterV2(botao);
        });
        menu.insertAdjacentElement("beforebegin", botao);
    }

    function inicializarNavegacaoV2() {
        var tentativas = 0;
        var intervalo = setInterval(function() {
            tentativas += 1;
            var sidebar = document.getElementById("admin-sidebar");
            var nav = document.getElementById("sidebar-navigation-groups");

            if (sidebar && nav) {
                clearInterval(intervalo);
                inserirEstilosNavegacaoV2();
                document.body.classList.add("vide-navigation-v2");

                var main = sidebar.firstElementChild;
                main?.classList.add("vide-dock-main");

                prepararMarcaDockV2(sidebar);
                prepararRotulosDockV2(sidebar);
                prepararBuscaDockV2(sidebar);
                criarCommandCenterV2();
                criarBotaoMobileCommandV2();

                window.addEventListener("keydown", tratarTecladoGlobalCommandV2, true);

                var observador = new MutationObserver(function(mutacoes) {
                    var precisaAtualizar = mutacoes.some(function(mutacao) {
                        return mutacao.type === "attributes"
                            && (mutacao.attributeName === "class" || mutacao.attributeName === "aria-hidden");
                    });
                    if (precisaAtualizar && comandoV2Aberto) {
                        renderizarCommandCenterV2(document.getElementById("vide-command-search-v2")?.value || "");
                    }
                });
                observador.observe(nav, {
                    subtree: true,
                    attributes: true,
                    attributeFilter: ["class", "aria-hidden"]
                });
                return;
            }

            if (tentativas >= 60) {
                clearInterval(intervalo);
                console.warn("[Vide Hub] Navegação V2 não foi iniciada: sidebar não encontrada.");
            }
        }, 150);
    }


    aguardarDOMContentLoaded(inicializarFaviconDashboard);
    aguardarDOMContentLoaded(inicializarMetricasFunilDashboard);
    aguardarDOMContentLoaded(inicializarNavegacaoV2);
})();
