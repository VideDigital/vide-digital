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

    aguardarDOMContentLoaded(inicializarFaviconDashboard);
})();
