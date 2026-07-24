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
        var tamanho = 192;
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

        var larguraImagem = imagem.naturalWidth || imagem.width;
        var alturaImagem = imagem.naturalHeight || imagem.height;
        var lado = Math.min(larguraImagem, alturaImagem);
        var origemX = (larguraImagem - lado) / 2;
        var origemY = (alturaImagem - lado) / 2;

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

        // Favicons não precisam da resolução de uma foto de perfil.
        // O alvo de 120 KB mantém o documento da vitrine muito abaixo
        // do limite do Firestore, mesmo quando já há logo e layout salvos.
        var limiteSeguro = 120000;
        var qualidades = [0.82, 0.72, 0.62, 0.52, 0.42];
        var resultado = "";

        for (var indice = 0; indice < qualidades.length; indice += 1) {
            resultado = canvas.toDataURL("image/webp", qualidades[indice]);

            if (
                resultado &&
                resultado !== "data:," &&
                resultado.length <= limiteSeguro
            ) {
                break;
            }
        }

        // Navegadores sem exportação WebP retornam outro tipo ou "data:,".
        // Nesse caso, usa PNG; em 192 × 192 normalmente continua pequeno.
        if (
            !resultado ||
            resultado === "data:," ||
            !resultado.startsWith("data:image/webp")
        ) {
            resultado = canvas.toDataURL("image/png");
        }

        if (!resultado || resultado === "data:,") {
            throw new Error("Não foi possível gerar o ícone da loja.");
        }

        if (resultado.length > limiteSeguro) {
            // Última redução automática para imagens fotográficas complexas.
            var canvasCompacto = document.createElement("canvas");
            canvasCompacto.width = 128;
            canvasCompacto.height = 128;

            var contextoCompacto = canvasCompacto.getContext("2d", {
                alpha: true
            });

            if (!contextoCompacto) {
                throw new Error("Seu navegador não conseguiu compactar o ícone.");
            }

            contextoCompacto.imageSmoothingEnabled = true;
            contextoCompacto.imageSmoothingQuality = "high";
            contextoCompacto.drawImage(canvas, 0, 0, 128, 128);

            resultado = canvasCompacto.toDataURL("image/webp", 0.52);
        }

        if (!resultado || resultado === "data:," || resultado.length > limiteSeguro) {
            throw new Error(
                "O ícone ainda ficou pesado após a compactação. Escolha uma imagem mais simples."
            );
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
            deleteField: modulos[1].deleteField,
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
            // A imagem fica somente na vitrine pública. Guardar a mesma
            // base64 também em usuarios/{uid} duplicava peso e podia fazer
            // ambos os documentos ultrapassarem o limite do Firestore.
            var payloadVitrine = {
                donoUID: contexto.storeUid,
                faviconB64: favicon,
                faviconUrl: "",
                faviconAtualizadoEm: firebase.serverTimestamp()
            };

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
                    payloadVitrine,
                    { merge: true }
                );

                // Remove uma eventual cópia pesada deixada por tentativas
                // anteriores. O carregamento do painel já busca a vitrine
                // pública quando o usuário não possui faviconB64 local.
                await firebase.setDoc(
                    firebase.doc(firebase.db, "usuarios", contexto.storeUid),
                    {
                        faviconB64: firebase.deleteField(),
                        faviconUrl: firebase.deleteField(),
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

            var codigoErro = String(erro?.code || "")
                .replace(/^firestore\//, "")
                .trim();

            var mensagemErro = String(erro?.message || "")
                .replace(/^FirebaseError:\s*/i, "")
                .trim();

            var resumoErro = codigoErro
                ? "Erro ao salvar o ícone (" + codigoErro + ")."
                : "Erro ao salvar o ícone.";

            atualizarStatus(
                resumoErro + (mensagemErro ? " Consulte o console para detalhes." : ""),
                "error"
            );

            criarToastFavicon(resumoErro, "error");
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
    var metricasProdutosDados = [];
    var metricasProdutosConexao = null;
    var metricasProdutosCarregando = false;
    var metricasProdutosAtualizacaoTimer = null;

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

            #vide-funil-loja-publica .vide-funil-diagnostico {
                position: relative;
                z-index: 1;
                margin-top: 18px;
                padding: 18px;
                border: 1px solid rgba(255,255,255,.075);
                border-radius: 20px;
                background:
                    linear-gradient(
                        135deg,
                        color-mix(in srgb, var(--sys-primaria, #6d5dfc) 8%, rgba(3,7,18,.48)),
                        rgba(3,7,18,.45)
                    );
            }

            #vide-funil-loja-publica .vide-funil-diagnostico-header {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 16px;
                margin-bottom: 15px;
            }

            #vide-funil-loja-publica .vide-funil-diagnostico-title {
                display: flex;
                align-items: flex-start;
                gap: 11px;
            }

            #vide-funil-loja-publica .vide-funil-diagnostico-icon {
                width: 38px;
                height: 38px;
                flex: 0 0 38px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                border: 1px solid color-mix(in srgb, var(--sys-destaque, #00f2fe) 24%, transparent);
                border-radius: 12px;
                color: color-mix(in srgb, var(--sys-destaque, #00f2fe) 80%, white 20%);
                background: color-mix(in srgb, var(--sys-destaque, #00f2fe) 8%, transparent);
            }

            #vide-funil-loja-publica .vide-funil-diagnostico-icon svg {
                width: 18px;
                height: 18px;
                fill: none;
                stroke: currentColor;
                stroke-width: 1.9;
                stroke-linecap: round;
                stroke-linejoin: round;
            }

            #vide-funil-loja-publica .vide-funil-diagnostico-title small {
                display: block;
                margin-bottom: 4px;
                color: #6b7280;
                font-size: 8px;
                font-weight: 900;
                letter-spacing: .16em;
                text-transform: uppercase;
            }

            #vide-funil-loja-publica .vide-funil-diagnostico-title strong {
                display: block;
                color: #fff;
                font-size: 13px;
                font-weight: 900;
            }

            #vide-funil-loja-publica .vide-funil-diagnostico-title p {
                margin: 4px 0 0;
                color: #8b95a7;
                font-size: 10px;
                line-height: 1.5;
            }

            #vide-funil-loja-publica .vide-funil-saude {
                flex: 0 0 auto;
                display: inline-flex;
                align-items: center;
                gap: 7px;
                min-height: 31px;
                padding: 0 11px;
                border: 1px solid rgba(255,255,255,.09);
                border-radius: 999px;
                color: #cbd5e1;
                background: rgba(255,255,255,.04);
                font-size: 9px;
                font-weight: 900;
                white-space: nowrap;
            }

            #vide-funil-loja-publica .vide-funil-saude::before {
                content: "";
                width: 7px;
                height: 7px;
                border-radius: 999px;
                background: #94a3b8;
                box-shadow: 0 0 0 4px rgba(148,163,184,.08);
            }

            #vide-funil-loja-publica .vide-funil-saude[data-level="positive"] {
                color: #86efac;
                border-color: rgba(34,197,94,.2);
                background: rgba(34,197,94,.065);
            }

            #vide-funil-loja-publica .vide-funil-saude[data-level="positive"]::before {
                background: #22c55e;
                box-shadow: 0 0 0 4px rgba(34,197,94,.1);
            }

            #vide-funil-loja-publica .vide-funil-saude[data-level="attention"] {
                color: #fcd34d;
                border-color: rgba(245,158,11,.2);
                background: rgba(245,158,11,.065);
            }

            #vide-funil-loja-publica .vide-funil-saude[data-level="attention"]::before {
                background: #f59e0b;
                box-shadow: 0 0 0 4px rgba(245,158,11,.1);
            }

            #vide-funil-loja-publica .vide-funil-saude[data-level="critical"] {
                color: #fda4af;
                border-color: rgba(244,63,94,.2);
                background: rgba(244,63,94,.065);
            }

            #vide-funil-loja-publica .vide-funil-saude[data-level="critical"]::before {
                background: #f43f5e;
                box-shadow: 0 0 0 4px rgba(244,63,94,.1);
            }

            #vide-funil-loja-publica .vide-funil-comparativos {
                display: grid;
                grid-template-columns: repeat(4, minmax(0, 1fr));
                gap: 10px;
                margin-bottom: 14px;
            }

            #vide-funil-loja-publica .vide-funil-comparativo {
                min-width: 0;
                padding: 12px;
                border: 1px solid rgba(255,255,255,.065);
                border-radius: 14px;
                background: rgba(255,255,255,.026);
            }

            #vide-funil-loja-publica .vide-funil-comparativo > span {
                display: block;
                overflow: hidden;
                color: #7f8a9d;
                font-size: 8px;
                font-weight: 900;
                letter-spacing: .1em;
                text-overflow: ellipsis;
                text-transform: uppercase;
                white-space: nowrap;
            }

            #vide-funil-loja-publica .vide-funil-comparativo strong {
                display: block;
                margin-top: 7px;
                color: #fff;
                font-size: 14px;
                font-weight: 900;
            }

            #vide-funil-loja-publica .vide-funil-variacao {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                margin-top: 5px;
                color: #94a3b8;
                font-size: 9px;
                font-weight: 800;
            }

            #vide-funil-loja-publica .vide-funil-variacao[data-direction="up"] {
                color: #4ade80;
            }

            #vide-funil-loja-publica .vide-funil-variacao[data-direction="down"] {
                color: #fb7185;
            }

            #vide-funil-loja-publica .vide-funil-variacao[data-direction="neutral"] {
                color: #94a3b8;
            }

            #vide-funil-loja-publica .vide-funil-analise-grid {
                display: grid;
                grid-template-columns: minmax(0, .82fr) minmax(0, 1.18fr);
                gap: 12px;
            }

            #vide-funil-loja-publica .vide-funil-gargalo,
            #vide-funil-loja-publica .vide-funil-recomendacoes {
                padding: 14px;
                border: 1px solid rgba(255,255,255,.065);
                border-radius: 15px;
                background: rgba(3,7,18,.3);
            }

            #vide-funil-loja-publica .vide-funil-analise-label {
                display: block;
                margin-bottom: 8px;
                color: #6b7280;
                font-size: 8px;
                font-weight: 900;
                letter-spacing: .14em;
                text-transform: uppercase;
            }

            #vide-funil-loja-publica .vide-funil-gargalo strong {
                display: block;
                color: #fff;
                font-size: 12px;
                line-height: 1.45;
                font-weight: 900;
            }

            #vide-funil-loja-publica .vide-funil-gargalo p {
                margin: 7px 0 0;
                color: #8792a5;
                font-size: 10px;
                line-height: 1.55;
            }

            #vide-funil-loja-publica .vide-funil-recomendacoes-lista {
                display: grid;
                gap: 8px;
                margin: 0;
                padding: 0;
                list-style: none;
            }

            #vide-funil-loja-publica .vide-funil-recomendacoes-lista li {
                position: relative;
                padding-left: 18px;
                color: #a8b1c0;
                font-size: 10px;
                line-height: 1.5;
            }

            #vide-funil-loja-publica .vide-funil-recomendacoes-lista li::before {
                content: "";
                position: absolute;
                top: .55em;
                left: 1px;
                width: 7px;
                height: 7px;
                border: 2px solid color-mix(in srgb, var(--sys-destaque, #00f2fe) 70%, white 30%);
                border-radius: 999px;
            }

            #vide-funil-loja-publica .vide-produtos-performance {
                position: relative;
                z-index: 1;
                margin-top: 18px;
                padding: 18px;
                border: 1px solid rgba(255,255,255,.075);
                border-radius: 20px;
                background:
                    radial-gradient(
                        620px 220px at 100% 0%,
                        color-mix(in srgb, var(--sys-primaria, #6d5dfc) 10%, transparent),
                        transparent 72%
                    ),
                    rgba(3,7,18,.34);
            }

            #vide-funil-loja-publica .vide-produtos-header {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 16px;
                margin-bottom: 15px;
            }

            #vide-funil-loja-publica .vide-produtos-header-copy {
                display: flex;
                align-items: flex-start;
                gap: 11px;
                min-width: 0;
            }

            #vide-funil-loja-publica .vide-produtos-header-icon {
                width: 38px;
                height: 38px;
                flex: 0 0 38px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                border: 1px solid color-mix(in srgb, var(--sys-primaria, #6d5dfc) 26%, transparent);
                border-radius: 12px;
                color: color-mix(in srgb, var(--sys-primaria, #6d5dfc) 72%, white 28%);
                background: color-mix(in srgb, var(--sys-primaria, #6d5dfc) 9%, transparent);
            }

            #vide-funil-loja-publica .vide-produtos-header-icon svg {
                width: 18px;
                height: 18px;
                fill: none;
                stroke: currentColor;
                stroke-width: 1.9;
                stroke-linecap: round;
                stroke-linejoin: round;
            }

            #vide-funil-loja-publica .vide-produtos-header small {
                display: block;
                margin-bottom: 4px;
                color: #6b7280;
                font-size: 8px;
                font-weight: 900;
                letter-spacing: .16em;
                text-transform: uppercase;
            }

            #vide-funil-loja-publica .vide-produtos-header h3 {
                margin: 0;
                color: #fff;
                font-size: 15px;
                line-height: 1.25;
                font-weight: 900;
                letter-spacing: -.015em;
            }

            #vide-funil-loja-publica .vide-produtos-header p {
                max-width: 660px;
                margin: 5px 0 0;
                color: #8490a3;
                font-size: 10px;
                line-height: 1.55;
            }

            #vide-funil-loja-publica .vide-produtos-refresh {
                min-height: 35px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 7px;
                flex: 0 0 auto;
                padding: 0 12px;
                border: 1px solid rgba(255,255,255,.1);
                border-radius: 11px;
                color: #cbd5e1;
                background: rgba(255,255,255,.045);
                font-size: 9px;
                font-weight: 900;
                cursor: pointer;
                transition: border-color .16s ease, background .16s ease, color .16s ease;
            }

            #vide-funil-loja-publica .vide-produtos-refresh:hover,
            #vide-funil-loja-publica .vide-produtos-refresh:focus-visible {
                border-color: color-mix(in srgb, var(--sys-primaria, #6d5dfc) 45%, transparent);
                color: #fff;
                background: color-mix(in srgb, var(--sys-primaria, #6d5dfc) 10%, rgba(255,255,255,.04));
                outline: none;
            }

            #vide-funil-loja-publica .vide-produtos-refresh[disabled] {
                opacity: .55;
                cursor: wait;
            }

            #vide-funil-loja-publica .vide-produtos-refresh svg {
                width: 14px;
                height: 14px;
                fill: none;
                stroke: currentColor;
                stroke-width: 2;
            }

            #vide-funil-loja-publica .vide-produtos-refresh.is-loading svg {
                animation: videProdutosSpin .8s linear infinite;
            }

            #vide-funil-loja-publica .vide-produtos-destaques {
                display: grid;
                grid-template-columns: repeat(4, minmax(0, 1fr));
                gap: 10px;
                margin-bottom: 14px;
            }

            #vide-funil-loja-publica .vide-produtos-destaque {
                min-width: 0;
                padding: 13px;
                border: 1px solid rgba(255,255,255,.065);
                border-radius: 15px;
                background: rgba(255,255,255,.027);
            }

            #vide-funil-loja-publica .vide-produtos-destaque > span {
                display: block;
                color: #707d91;
                font-size: 8px;
                font-weight: 900;
                letter-spacing: .1em;
                text-transform: uppercase;
            }

            #vide-funil-loja-publica .vide-produtos-destaque strong {
                display: block;
                overflow: hidden;
                margin-top: 7px;
                color: #fff;
                font-size: 12px;
                line-height: 1.35;
                font-weight: 900;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            #vide-funil-loja-publica .vide-produtos-destaque small {
                display: block;
                margin-top: 4px;
                color: #8792a5;
                font-size: 9px;
                line-height: 1.4;
            }

            #vide-funil-loja-publica .vide-produtos-oportunidades {
                margin-bottom: 14px;
                padding: 14px;
                border: 1px solid rgba(255,255,255,.065);
                border-radius: 15px;
                background: rgba(3,7,18,.3);
            }

            #vide-funil-loja-publica .vide-produtos-oportunidades-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                margin-bottom: 10px;
            }

            #vide-funil-loja-publica .vide-produtos-oportunidades-header strong {
                color: #dbe4f1;
                font-size: 10px;
                font-weight: 900;
                letter-spacing: .1em;
                text-transform: uppercase;
            }

            #vide-funil-loja-publica .vide-produtos-oportunidades-header span {
                color: #66748a;
                font-size: 9px;
                font-weight: 800;
            }

            #vide-funil-loja-publica .vide-produtos-oportunidades-lista {
                display: grid;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 8px;
            }

            #vide-funil-loja-publica .vide-produtos-oportunidade {
                min-width: 0;
                padding: 11px 12px;
                border: 1px solid rgba(255,255,255,.06);
                border-radius: 13px;
                background: rgba(255,255,255,.024);
            }

            #vide-funil-loja-publica .vide-produtos-oportunidade strong {
                display: block;
                overflow: hidden;
                color: #e5edf8;
                font-size: 10px;
                line-height: 1.35;
                font-weight: 900;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            #vide-funil-loja-publica .vide-produtos-oportunidade p {
                margin: 5px 0 0;
                color: #8792a5;
                font-size: 9px;
                line-height: 1.5;
            }

            #vide-funil-loja-publica .vide-produtos-toolbar {
                display: grid;
                grid-template-columns: minmax(180px, 1fr) minmax(170px, 220px);
                gap: 10px;
                margin-bottom: 12px;
            }

            #vide-funil-loja-publica .vide-produtos-search,
            #vide-funil-loja-publica .vide-produtos-sort {
                width: 100%;
                min-height: 39px;
                border: 1px solid rgba(255,255,255,.08);
                border-radius: 12px;
                outline: none;
                color: #dbe4f1;
                background: rgba(3,7,18,.52);
                font-size: 10px;
                font-weight: 750;
            }

            #vide-funil-loja-publica .vide-produtos-search {
                padding: 0 13px;
            }

            #vide-funil-loja-publica .vide-produtos-sort {
                padding: 0 34px 0 12px;
                cursor: pointer;
            }

            #vide-funil-loja-publica .vide-produtos-search:focus,
            #vide-funil-loja-publica .vide-produtos-sort:focus {
                border-color: color-mix(in srgb, var(--sys-primaria, #6d5dfc) 58%, transparent);
                box-shadow: 0 0 0 3px color-mix(in srgb, var(--sys-primaria, #6d5dfc) 10%, transparent);
            }

            #vide-funil-loja-publica .vide-produtos-tabela-shell {
                overflow-x: auto;
                border: 1px solid rgba(255,255,255,.065);
                border-radius: 15px;
                background: rgba(3,7,18,.24);
                scrollbar-width: thin;
                scrollbar-color: rgba(148,163,184,.28) transparent;
            }

            #vide-funil-loja-publica .vide-produtos-tabela {
                width: 100%;
                min-width: 920px;
                border-collapse: collapse;
            }

            #vide-funil-loja-publica .vide-produtos-tabela th {
                padding: 11px 10px;
                border-bottom: 1px solid rgba(255,255,255,.065);
                color: #647186;
                font-size: 8px;
                font-weight: 900;
                letter-spacing: .09em;
                text-align: right;
                text-transform: uppercase;
                white-space: nowrap;
            }

            #vide-funil-loja-publica .vide-produtos-tabela th:first-child {
                padding-left: 14px;
                text-align: left;
            }

            #vide-funil-loja-publica .vide-produtos-tabela td {
                padding: 11px 10px;
                border-bottom: 1px solid rgba(255,255,255,.045);
                color: #b6c1d2;
                font-size: 10px;
                font-weight: 750;
                text-align: right;
                white-space: nowrap;
            }

            #vide-funil-loja-publica .vide-produtos-tabela td:first-child {
                padding-left: 14px;
                text-align: left;
            }

            #vide-funil-loja-publica .vide-produtos-tabela tr:last-child td {
                border-bottom: 0;
            }

            #vide-funil-loja-publica .vide-produto-identidade {
                display: flex;
                align-items: center;
                gap: 10px;
                min-width: 210px;
            }

            #vide-funil-loja-publica .vide-produto-posicao {
                width: 28px;
                height: 28px;
                flex: 0 0 28px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                border: 1px solid rgba(255,255,255,.075);
                border-radius: 9px;
                color: #8290a6;
                background: rgba(255,255,255,.03);
                font-size: 9px;
                font-weight: 900;
            }

            #vide-funil-loja-publica .vide-produto-identidade strong {
                display: block;
                overflow: hidden;
                max-width: 190px;
                color: #eef3fb;
                font-size: 10px;
                line-height: 1.35;
                font-weight: 900;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            #vide-funil-loja-publica .vide-produto-identidade small {
                display: block;
                overflow: hidden;
                max-width: 190px;
                margin-top: 3px;
                color: #66748a;
                font-size: 8px;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            #vide-funil-loja-publica .vide-produto-conversao {
                color: #e5edf8;
                font-weight: 900;
            }

            #vide-funil-loja-publica .vide-produto-diagnostico {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                max-width: 150px;
                overflow: hidden;
                padding: 5px 8px;
                border: 1px solid rgba(148,163,184,.14);
                border-radius: 999px;
                color: #aeb9ca;
                background: rgba(148,163,184,.055);
                font-size: 8px;
                font-weight: 900;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            #vide-funil-loja-publica .vide-produto-diagnostico[data-level="positive"] {
                color: #86efac;
                border-color: rgba(34,197,94,.2);
                background: rgba(34,197,94,.065);
            }

            #vide-funil-loja-publica .vide-produto-diagnostico[data-level="attention"] {
                color: #fcd34d;
                border-color: rgba(245,158,11,.2);
                background: rgba(245,158,11,.065);
            }

            #vide-funil-loja-publica .vide-produto-diagnostico[data-level="critical"] {
                color: #fda4af;
                border-color: rgba(244,63,94,.2);
                background: rgba(244,63,94,.065);
            }

            #vide-funil-loja-publica .vide-produtos-empty {
                padding: 34px 18px;
                color: #78859a;
                text-align: center;
                font-size: 10px;
                line-height: 1.55;
            }

            #vide-funil-loja-publica .vide-produtos-status {
                margin: 10px 2px 0;
                color: #65738a;
                font-size: 9px;
                line-height: 1.5;
            }

            #vide-funil-loja-publica .vide-produtos-status[data-state="error"] {
                color: #fda4af;
            }

            @keyframes videProdutosSpin {
                to { transform: rotate(360deg); }
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

                #vide-funil-loja-publica .vide-funil-comparativos {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                }

                #vide-funil-loja-publica .vide-funil-analise-grid {
                    grid-template-columns: 1fr;
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

                #vide-funil-loja-publica .vide-funil-diagnostico {
                    padding: 15px;
                }

                #vide-funil-loja-publica .vide-funil-diagnostico-header {
                    flex-direction: column;
                }

                #vide-funil-loja-publica .vide-funil-saude {
                    align-self: flex-start;
                }

                #vide-funil-loja-publica .vide-funil-comparativos {
                    grid-template-columns: 1fr;
                }

                #vide-funil-loja-publica .vide-produtos-performance {
                    padding: 15px;
                }

                #vide-funil-loja-publica .vide-produtos-header {
                    flex-direction: column;
                }

                #vide-funil-loja-publica .vide-produtos-refresh {
                    align-self: flex-start;
                }

                #vide-funil-loja-publica .vide-produtos-destaques,
                #vide-funil-loja-publica .vide-produtos-oportunidades-lista,
                #vide-funil-loja-publica .vide-produtos-toolbar {
                    grid-template-columns: 1fr;
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

            <section
                class="vide-funil-diagnostico"
                id="vide-funil-diagnostico"
                aria-labelledby="vide-funil-diagnostico-titulo"
            >
                <div class="vide-funil-diagnostico-header">
                    <div class="vide-funil-diagnostico-title">
                        <span class="vide-funil-diagnostico-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24">
                                <path d="M4 19V9"></path>
                                <path d="M10 19V5"></path>
                                <path d="M16 19v-7"></path>
                                <path d="M22 19V3"></path>
                            </svg>
                        </span>
                        <div>
                            <small>Análise automática</small>
                            <strong id="vide-funil-diagnostico-titulo">
                                Diagnóstico comercial
                            </strong>
                            <p id="vide-funil-diagnostico-subtitulo">
                                Comparando o período selecionado com o período anterior.
                            </p>
                        </div>
                    </div>

                    <span
                        class="vide-funil-saude"
                        id="vide-funil-saude"
                        data-level="neutral"
                    >
                        Aguardando dados
                    </span>
                </div>

                <div class="vide-funil-comparativos">
                    <article class="vide-funil-comparativo">
                        <span>Visitas</span>
                        <strong id="vide-funil-comp-visitas">0</strong>
                        <small
                            class="vide-funil-variacao"
                            id="vide-funil-var-visitas"
                            data-direction="neutral"
                        >
                            Sem comparação
                        </small>
                    </article>

                    <article class="vide-funil-comparativo">
                        <span>WhatsApp</span>
                        <strong id="vide-funil-comp-pedidos">0</strong>
                        <small
                            class="vide-funil-variacao"
                            id="vide-funil-var-pedidos"
                            data-direction="neutral"
                        >
                            Sem comparação
                        </small>
                    </article>

                    <article class="vide-funil-comparativo">
                        <span>Conversão</span>
                        <strong id="vide-funil-comp-conversao">0%</strong>
                        <small
                            class="vide-funil-variacao"
                            id="vide-funil-var-conversao"
                            data-direction="neutral"
                        >
                            Sem comparação
                        </small>
                    </article>

                    <article class="vide-funil-comparativo">
                        <span>Valor potencial</span>
                        <strong id="vide-funil-comp-valor">R$ 0,00</strong>
                        <small
                            class="vide-funil-variacao"
                            id="vide-funil-var-valor"
                            data-direction="neutral"
                        >
                            Sem comparação
                        </small>
                    </article>
                </div>

                <div class="vide-funil-analise-grid">
                    <article class="vide-funil-gargalo">
                        <span class="vide-funil-analise-label">
                            Principal ponto de atenção
                        </span>
                        <strong id="vide-funil-gargalo-titulo">
                            Aguardando volume suficiente
                        </strong>
                        <p id="vide-funil-gargalo-texto">
                            O diagnóstico ficará mais preciso conforme novas visitas forem registradas.
                        </p>
                    </article>

                    <article class="vide-funil-recomendacoes">
                        <span class="vide-funil-analise-label">
                            Próximas ações recomendadas
                        </span>
                        <ul
                            class="vide-funil-recomendacoes-lista"
                            id="vide-funil-recomendacoes-lista"
                        >
                            <li>Divulgue a vitrine para começar a formar uma base de comparação.</li>
                        </ul>
                    </article>
                </div>
            </section>

            <section
                class="vide-produtos-performance"
                id="vide-produtos-performance"
                aria-labelledby="vide-produtos-titulo"
            >
                <div class="vide-produtos-header">
                    <div class="vide-produtos-header-copy">
                        <span class="vide-produtos-header-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24">
                                <path d="M4 7h16"></path>
                                <path d="M7 4v16"></path>
                                <path d="M4 12h16"></path>
                                <path d="M4 17h16"></path>
                            </svg>
                        </span>
                        <div>
                            <small>Desempenho individual</small>
                            <h3 id="vide-produtos-titulo">Ranking por produto</h3>
                            <p>
                                Veja quais produtos atraem atenção, avançam no carrinho e geram pedidos pelo WhatsApp no mesmo período selecionado acima.
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        class="vide-produtos-refresh"
                        id="vide-produtos-atualizar"
                        aria-label="Atualizar métricas dos produtos"
                    >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 5v4h4"></path>
                            <path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 19v-4h-4"></path>
                        </svg>
                        Atualizar
                    </button>
                </div>

                <div class="vide-produtos-destaques">
                    <article class="vide-produtos-destaque">
                        <span>Mais visualizado</span>
                        <strong id="vide-produto-top-visualizado">Sem dados</strong>
                        <small id="vide-produto-top-visualizado-valor">0 visualizações</small>
                    </article>
                    <article class="vide-produtos-destaque">
                        <span>Mais adicionado</span>
                        <strong id="vide-produto-top-carrinho">Sem dados</strong>
                        <small id="vide-produto-top-carrinho-valor">0 adições</small>
                    </article>
                    <article class="vide-produtos-destaque">
                        <span>Mais pedidos</span>
                        <strong id="vide-produto-top-pedidos">Sem dados</strong>
                        <small id="vide-produto-top-pedidos-valor">0 pedidos</small>
                    </article>
                    <article class="vide-produtos-destaque">
                        <span>Melhor conversão</span>
                        <strong id="vide-produto-top-conversao">Sem dados</strong>
                        <small id="vide-produto-top-conversao-valor">0%</small>
                    </article>
                </div>

                <div class="vide-produtos-oportunidades">
                    <div class="vide-produtos-oportunidades-header">
                        <strong>Oportunidades automáticas</strong>
                        <span id="vide-produtos-oportunidades-contagem">Aguardando dados</span>
                    </div>
                    <div
                        class="vide-produtos-oportunidades-lista"
                        id="vide-produtos-oportunidades-lista"
                    >
                        <article class="vide-produtos-oportunidade">
                            <strong>Coletando desempenho</strong>
                            <p>As recomendações aparecerão conforme os produtos receberem interações.</p>
                        </article>
                    </div>
                </div>

                <div class="vide-produtos-toolbar">
                    <input
                        type="search"
                        class="vide-produtos-search"
                        id="vide-produtos-busca"
                        placeholder="Buscar produto no ranking..."
                        autocomplete="off"
                        aria-label="Buscar produto no ranking"
                    >
                    <select
                        class="vide-produtos-sort"
                        id="vide-produtos-ordenacao"
                        aria-label="Ordenar ranking de produtos"
                    >
                        <option value="pedidos">Mais pedidos</option>
                        <option value="valor">Maior valor potencial</option>
                        <option value="carrinho">Mais adicionados</option>
                        <option value="visualizacoes">Mais visualizados</option>
                        <option value="conversao">Melhor conversão</option>
                        <option value="nome">Nome do produto</option>
                    </select>
                </div>

                <div class="vide-produtos-tabela-shell">
                    <table class="vide-produtos-tabela">
                        <thead>
                            <tr>
                                <th>Produto</th>
                                <th>Visitas</th>
                                <th>Detalhes</th>
                                <th>Carrinho</th>
                                <th>Checkout</th>
                                <th>WhatsApp</th>
                                <th>Conversão</th>
                                <th>Valor</th>
                                <th>Diagnóstico</th>
                            </tr>
                        </thead>
                        <tbody id="vide-produtos-tabela-corpo">
                            <tr>
                                <td colspan="9" class="vide-produtos-empty">
                                    Carregando produtos e métricas...
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <p
                    class="vide-produtos-status"
                    id="vide-produtos-status"
                    data-state="loading"
                    aria-live="polite"
                >
                    Carregando ranking por produto...
                </p>
            </section>

            <p id="vide-funil-status" data-state="loading" aria-live="polite">
                Carregando métricas da loja pública...
            </p>
        `;

        view.insertAdjacentElement("afterbegin", painel);

        document.getElementById("vide-funil-periodo")?.addEventListener("change", function() {
            renderizarMetricasFunil(metricasFunilDados);
            renderizarMetricasProdutos();
        });

        document.getElementById("vide-produtos-busca")?.addEventListener("input", function() {
            renderizarMetricasProdutos();
        });

        document.getElementById("vide-produtos-ordenacao")?.addEventListener("change", function() {
            renderizarMetricasProdutos();
        });

        document.getElementById("vide-produtos-atualizar")?.addEventListener("click", function() {
            carregarMetricasProdutos(true);
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

    function dadosIntervaloMetricas(porDia, inicio, fim) {
        var resultado = {
            sessoes: 0,
            carrinhosAbertos: 0,
            adicoesCarrinho: 0,
            checkoutsIniciados: 0,
            pedidosWhatsapp: 0,
            valorPedidosWhatsapp: 0,
            compartilhamentos: 0
        };

        if (!(inicio instanceof Date) || !(fim instanceof Date)) {
            return resultado;
        }

        var cursor = new Date(inicio);
        cursor.setHours(0, 0, 0, 0);

        var limite = new Date(fim);
        limite.setHours(0, 0, 0, 0);

        while (cursor <= limite) {
            var dadosDia = porDia?.[chaveDataLocal(cursor)] || {};

            resultado.sessoes += numeroMetrica(dadosDia.sessoes);
            resultado.carrinhosAbertos += numeroMetrica(dadosDia.carrinhosAbertos);
            resultado.adicoesCarrinho += numeroMetrica(dadosDia.adicoesCarrinho);
            resultado.checkoutsIniciados += numeroMetrica(dadosDia.checkoutsIniciados);
            resultado.pedidosWhatsapp += numeroMetrica(dadosDia.pedidosWhatsapp);
            resultado.valorPedidosWhatsapp += numeroMetrica(dadosDia.valorPedidosWhatsapp);
            resultado.compartilhamentos += numeroMetrica(dadosDia.compartilhamentos);

            cursor.setDate(cursor.getDate() + 1);
        }

        return resultado;
    }

    function obterPeriodoAnteriorMetricas(porDia, dias) {
        if (!dias || dias <= 0) return null;

        var fimAtual = new Date();
        fimAtual.setHours(0, 0, 0, 0);

        var inicioAtual = new Date(fimAtual);
        inicioAtual.setDate(inicioAtual.getDate() - (dias - 1));

        var fimAnterior = new Date(inicioAtual);
        fimAnterior.setDate(fimAnterior.getDate() - 1);

        var inicioAnterior = new Date(fimAnterior);
        inicioAnterior.setDate(inicioAnterior.getDate() - (dias - 1));

        return dadosIntervaloMetricas(
            porDia || {},
            inicioAnterior,
            fimAnterior
        );
    }

    function percentualNumero(parte, total) {
        if (!total || !parte) return 0;
        return Math.max(0, (Number(parte) / Number(total)) * 100);
    }

    function formatarPercentualLivre(valor) {
        var numero = Number(valor || 0);
        return numero.toLocaleString("pt-BR", {
            minimumFractionDigits: Math.abs(numero) < 10 ? 1 : 0,
            maximumFractionDigits: 1
        }) + "%";
    }

    function calcularVariacaoPercentual(atual, anterior) {
        atual = Number(atual || 0);
        anterior = Number(anterior || 0);

        if (anterior === 0) {
            if (atual === 0) {
                return {
                    texto: "Sem alteração",
                    direcao: "neutral",
                    valor: 0
                };
            }

            return {
                texto: "Novo no período",
                direcao: "up",
                valor: null
            };
        }

        var variacao = ((atual - anterior) / Math.abs(anterior)) * 100;
        var arredondada = Math.round(variacao * 10) / 10;

        if (Math.abs(arredondada) < 0.1) {
            return {
                texto: "Sem alteração",
                direcao: "neutral",
                valor: 0
            };
        }

        return {
            texto:
                (arredondada > 0 ? "↑ " : "↓ ") +
                formatarPercentualLivre(Math.abs(arredondada)) +
                " vs. período anterior",
            direcao: arredondada > 0 ? "up" : "down",
            valor: arredondada
        };
    }

    function calcularVariacaoPontosPercentuais(atual, anterior) {
        var diferenca = Number(atual || 0) - Number(anterior || 0);
        var arredondada = Math.round(diferenca * 10) / 10;

        if (Math.abs(arredondada) < 0.1) {
            return {
                texto: "Sem alteração",
                direcao: "neutral",
                valor: 0
            };
        }

        return {
            texto:
                (arredondada > 0 ? "↑ " : "↓ ") +
                Math.abs(arredondada).toLocaleString("pt-BR", {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1
                }) +
                " p.p.",
            direcao: arredondada > 0 ? "up" : "down",
            valor: arredondada
        };
    }

    function definirVariacaoMetrica(id, variacao, semComparacao) {
        var elemento = document.getElementById(id);
        if (!elemento) return;

        if (semComparacao) {
            elemento.textContent = "Todo o período";
            elemento.dataset.direction = "neutral";
            return;
        }

        elemento.textContent = variacao?.texto || "Sem comparação";
        elemento.dataset.direction = variacao?.direcao || "neutral";
    }

    function encontrarGargaloFunil(dados) {
        var etapas = [
            {
                origem: "Visitas",
                destino: "abertura do carrinho",
                anterior: dados.sessoes,
                atual: dados.carrinhosAbertos,
                acao:
                    "Revise fotos, preços, títulos e chamadas dos produtos. O visitante precisa entender rapidamente o valor da oferta."
            },
            {
                origem: "Carrinho",
                destino: "início do pedido",
                anterior: dados.carrinhosAbertos,
                atual: dados.checkoutsIniciados,
                acao:
                    "Simplifique o caminho até o pedido e deixe frete, prazo e condições comerciais visíveis antes da confirmação."
            },
            {
                origem: "Pedido iniciado",
                destino: "abertura do WhatsApp",
                anterior: dados.checkoutsIniciados,
                atual: dados.pedidosWhatsapp,
                acao:
                    "Reduza campos desnecessários, confira o número do WhatsApp e deixe claro que o envio não cobra automaticamente."
            }
        ];

        var candidatas = etapas
            .filter(function(etapa) {
                return etapa.anterior > 0;
            })
            .map(function(etapa) {
                var avancaram = Math.min(etapa.anterior, etapa.atual);
                var perdas = Math.max(0, etapa.anterior - avancaram);
                var perdaPercentual = etapa.anterior
                    ? (perdas / etapa.anterior) * 100
                    : 0;

                return {
                    ...etapa,
                    perdas: perdas,
                    perdaPercentual: perdaPercentual
                };
            })
            .sort(function(a, b) {
                return b.perdaPercentual - a.perdaPercentual;
            });

        return candidatas[0] || null;
    }

    function gerarDiagnosticoFunil(dados, anterior, dias) {
        var conversao = percentualNumero(
            dados.pedidosWhatsapp,
            dados.sessoes
        );

        var conversaoCarrinho = percentualNumero(
            dados.carrinhosAbertos,
            dados.sessoes
        );

        var conversaoCheckout = percentualNumero(
            dados.checkoutsIniciados,
            dados.carrinhosAbertos
        );

        var conversaoWhatsapp = percentualNumero(
            dados.pedidosWhatsapp,
            dados.checkoutsIniciados
        );

        var recomendacoes = [];
        var gargalo = encontrarGargaloFunil(dados);
        var nivel = "neutral";
        var status = "Dados iniciais";

        if (dados.sessoes === 0) {
            return {
                nivel: "neutral",
                status: "Sem visitas no período",
                gargaloTitulo: "Ainda não há tráfego para analisar",
                gargaloTexto:
                    "O período selecionado não possui sessões registradas. Assim que a vitrine receber acessos, o diagnóstico será atualizado automaticamente.",
                recomendacoes: [
                    "Divulgue o link da loja nos seus canais de atendimento e redes sociais.",
                    "Confirme em uma aba anônima se a vitrine abre normalmente.",
                    "Volte após acumular algumas visitas para comparar o avanço do funil."
                ]
            };
        }

        if (dados.sessoes < 10) {
            nivel = "neutral";
            status = "Amostra pequena";
            recomendacoes.push(
                "Acumule pelo menos 10 a 20 visitas antes de tomar decisões maiores com base na conversão."
            );
        } else if (conversao >= 5) {
            nivel = "positive";
            status = "Funil saudável";
        } else if (conversao >= 1.5) {
            nivel = "attention";
            status = "Pode melhorar";
        } else {
            nivel = "critical";
            status = "Atenção necessária";
        }

        if (conversaoCarrinho < 10 && dados.sessoes >= 10) {
            recomendacoes.push(
                "Destaque melhor os produtos: use fotos claras, preço visível e uma chamada objetiva para adicionar ao carrinho."
            );
        }

        if (
            dados.carrinhosAbertos >= 4 &&
            conversaoCheckout < 35
        ) {
            recomendacoes.push(
                "Muitos visitantes abrem o carrinho, mas não iniciam o pedido. Revise informações de prazo, entrega e o botão de continuar."
            );
        }

        if (
            dados.checkoutsIniciados >= 3 &&
            conversaoWhatsapp < 50
        ) {
            recomendacoes.push(
                "Há abandono no formulário final. Mantenha somente os campos essenciais e confira o WhatsApp comercial configurado."
            );
        }

        if (
            conversao >= 5 &&
            dados.sessoes >= 10
        ) {
            recomendacoes.push(
                "A conversão está positiva. O maior potencial agora é aumentar o tráfego qualificado para a vitrine."
            );
        }

        if (
            dados.compartilhamentos === 0 &&
            dados.sessoes >= 20
        ) {
            recomendacoes.push(
                "Incentive o compartilhamento da loja ou de produtos para ampliar o alcance orgânico."
            );
        }

        if (
            anterior &&
            anterior.sessoes > 0 &&
            dados.sessoes < anterior.sessoes * 0.7
        ) {
            recomendacoes.push(
                "As visitas caíram em relação ao período anterior. Reforce divulgação, campanhas e links nos canais que já geravam acesso."
            );
        }

        recomendacoes = Array.from(new Set(recomendacoes)).slice(0, 3);

        if (recomendacoes.length === 0) {
            recomendacoes.push(
                "Continue acompanhando o período e teste uma melhoria por vez para identificar o que realmente aumenta a conversão."
            );
        }

        var gargaloTitulo;
        var gargaloTexto;

        if (!gargalo || dados.sessoes < 3) {
            gargaloTitulo = "Volume ainda insuficiente para localizar um gargalo";
            gargaloTexto =
                "O funil já está sendo acompanhado, mas ainda há poucos eventos para apontar uma etapa com segurança.";
        } else {
            gargaloTitulo =
                gargalo.origem +
                " → " +
                gargalo.destino +
                ": " +
                formatarPercentualLivre(gargalo.perdaPercentual) +
                " não avançaram";

            gargaloTexto =
                gargalo.perdas.toLocaleString("pt-BR") +
                (gargalo.perdas === 1
                    ? " sessão deixou"
                    : " sessões deixaram") +
                " de avançar nessa etapa. " +
                gargalo.acao;
        }

        return {
            nivel: nivel,
            status: status,
            gargaloTitulo: gargaloTitulo,
            gargaloTexto: gargaloTexto,
            recomendacoes: recomendacoes
        };
    }

    function renderizarDiagnosticoFunil(
        dadosDocumento,
        dias,
        dadosAtuais,
        inteiro,
        moeda
    ) {
        var porDia = dadosDocumento?.porDia || {};
        var dadosAnteriores = obterPeriodoAnteriorMetricas(
            porDia,
            dias
        );

        var conversaoAtual = percentualNumero(
            dadosAtuais.pedidosWhatsapp,
            dadosAtuais.sessoes
        );

        var conversaoAnterior = dadosAnteriores
            ? percentualNumero(
                dadosAnteriores.pedidosWhatsapp,
                dadosAnteriores.sessoes
            )
            : 0;

        definirTextoMetrica(
            "vide-funil-comp-visitas",
            inteiro.format(dadosAtuais.sessoes)
        );

        definirTextoMetrica(
            "vide-funil-comp-pedidos",
            inteiro.format(dadosAtuais.pedidosWhatsapp)
        );

        definirTextoMetrica(
            "vide-funil-comp-conversao",
            formatarPercentualLivre(conversaoAtual)
        );

        definirTextoMetrica(
            "vide-funil-comp-valor",
            moeda.format(dadosAtuais.valorPedidosWhatsapp)
        );

        definirVariacaoMetrica(
            "vide-funil-var-visitas",
            calcularVariacaoPercentual(
                dadosAtuais.sessoes,
                dadosAnteriores?.sessoes
            ),
            dias === 0
        );

        definirVariacaoMetrica(
            "vide-funil-var-pedidos",
            calcularVariacaoPercentual(
                dadosAtuais.pedidosWhatsapp,
                dadosAnteriores?.pedidosWhatsapp
            ),
            dias === 0
        );

        definirVariacaoMetrica(
            "vide-funil-var-conversao",
            calcularVariacaoPontosPercentuais(
                conversaoAtual,
                conversaoAnterior
            ),
            dias === 0
        );

        definirVariacaoMetrica(
            "vide-funil-var-valor",
            calcularVariacaoPercentual(
                dadosAtuais.valorPedidosWhatsapp,
                dadosAnteriores?.valorPedidosWhatsapp
            ),
            dias === 0
        );

        var diagnostico = gerarDiagnosticoFunil(
            dadosAtuais,
            dadosAnteriores,
            dias
        );

        var saude = document.getElementById(
            "vide-funil-saude"
        );

        if (saude) {
            saude.dataset.level = diagnostico.nivel;
            saude.textContent = diagnostico.status;
        }

        definirTextoMetrica(
            "vide-funil-gargalo-titulo",
            diagnostico.gargaloTitulo
        );

        definirTextoMetrica(
            "vide-funil-gargalo-texto",
            diagnostico.gargaloTexto
        );

        var lista = document.getElementById(
            "vide-funil-recomendacoes-lista"
        );

        if (lista) {
            lista.replaceChildren();

            diagnostico.recomendacoes.forEach(function(texto) {
                var item = document.createElement("li");
                item.textContent = texto;
                lista.appendChild(item);
            });
        }

        definirTextoMetrica(
            "vide-funil-diagnostico-subtitulo",
            dias === 0
                ? "Análise consolidada de todo o histórico disponível."
                : "Comparação com os " +
                  dias +
                  " dias imediatamente anteriores."
        );
    }

    function estruturaMetricaProduto() {
        return {
            visualizacoes: 0,
            detalhesAbertos: 0,
            cliques: 0,
            adicoesCarrinho: 0,
            checkoutsIniciados: 0,
            pedidosWhatsapp: 0,
            valorPedidosWhatsapp: 0
        };
    }

    function somarMetricaProduto(destino, origem) {
        Object.keys(destino).forEach(function(chave) {
            destino[chave] += numeroMetrica(origem?.[chave]);
        });
        return destino;
    }

    function dadosPeriodoMetricaProduto(documento, dias) {
        documento = documento || {};
        var resultado = estruturaMetricaProduto();

        if (dias === 0) {
            Object.keys(resultado).forEach(function(chave) {
                resultado[chave] = numeroMetrica(documento[chave]);
            });

            var possuiTotais = Object.values(resultado).some(function(valor) {
                return valor > 0;
            });

            if (possuiTotais) return resultado;
        }

        var limite = null;
        if (dias > 0) {
            limite = new Date();
            limite.setHours(0, 0, 0, 0);
            limite.setDate(limite.getDate() - (dias - 1));
        }

        Object.entries(documento.porDia || {}).forEach(function(entrada) {
            var dataChave = entrada[0];
            var dadosDia = entrada[1] || {};

            if (limite) {
                var data = new Date(dataChave + "T00:00:00");
                if (Number.isNaN(data.getTime()) || data < limite) return;
            }

            somarMetricaProduto(resultado, dadosDia);
        });

        return resultado;
    }

    function nomeProdutoMetrica(produto) {
        return String(
            produto?.nome ||
            produto?.titulo ||
            produto?.nomeProduto ||
            "Produto sem nome"
        ).trim() || "Produto sem nome";
    }

    function categoriaProdutoMetrica(produto) {
        return String(
            produto?.nicho ||
            produto?.categoria ||
            produto?.tipo ||
            "Produto"
        ).trim() || "Produto";
    }

    function diagnosticarProdutoMetrica(item) {
        var dados = item.dadosPeriodo;
        var conversaoCarrinho = percentualNumero(
            dados.adicoesCarrinho,
            dados.visualizacoes
        );
        var conversaoCheckout = percentualNumero(
            dados.checkoutsIniciados,
            dados.adicoesCarrinho
        );
        var conversaoPedido = percentualNumero(
            dados.pedidosWhatsapp,
            dados.visualizacoes
        );
        var conversaoFinal = percentualNumero(
            dados.pedidosWhatsapp,
            dados.checkoutsIniciados
        );

        if (
            dados.visualizacoes === 0 &&
            dados.detalhesAbertos === 0 &&
            dados.adicoesCarrinho === 0 &&
            dados.pedidosWhatsapp === 0
        ) {
            return {
                level: "neutral",
                label: "Sem atividade",
                prioridade: 1,
                recomendacao:
                    "Divulgue este produto ou confirme se ele está visível e publicado na vitrine."
            };
        }

        if (
            dados.visualizacoes >= 10 &&
            conversaoCarrinho < 10
        ) {
            return {
                level: "critical",
                label: "Interesse sem carrinho",
                prioridade: 6,
                recomendacao:
                    "Há visualizações, mas poucas adições ao carrinho. Revise foto principal, preço, título e clareza da oferta."
            };
        }

        if (
            dados.adicoesCarrinho >= 3 &&
            conversaoCheckout < 40
        ) {
            return {
                level: "attention",
                label: "Abandono no carrinho",
                prioridade: 5,
                recomendacao:
                    "O produto entra no carrinho, mas não avança. Deixe prazo, entrega e condições comerciais mais claros."
            };
        }

        if (
            dados.checkoutsIniciados >= 2 &&
            conversaoFinal < 50
        ) {
            return {
                level: "attention",
                label: "Abandono final",
                prioridade: 5,
                recomendacao:
                    "O pedido é iniciado, mas não chega ao WhatsApp. Revise o formulário final e o número comercial configurado."
            };
        }

        if (
            dados.pedidosWhatsapp >= 1 &&
            conversaoPedido >= 5
        ) {
            return {
                level: "positive",
                label: "Boa conversão",
                prioridade: 2,
                recomendacao:
                    "Este produto converte bem. Dê mais destaque a ele e aumente o tráfego qualificado."
            };
        }

        if (dados.pedidosWhatsapp >= 1) {
            return {
                level: "positive",
                label: "Gerando pedidos",
                prioridade: 2,
                recomendacao:
                    "O produto já gera pedidos. Teste novos destaques, prova social ou uma oferta para elevar a conversão."
            };
        }

        if (dados.visualizacoes < 10) {
            return {
                level: "neutral",
                label: "Dados iniciais",
                prioridade: 1,
                recomendacao:
                    "Ainda há poucas interações para um diagnóstico confiável. Continue divulgando e acompanhe o período."
            };
        }

        return {
            level: "attention",
            label: "Baixa progressão",
            prioridade: 4,
            recomendacao:
                "O produto recebe atividade, mas ainda não gera pedidos. Reforce benefícios, confiança e chamada para ação."
        };
    }

    function ordenarMetricasProdutos(lista, criterio) {
        return lista.slice().sort(function(a, b) {
            var dadosA = a.dadosPeriodo;
            var dadosB = b.dadosPeriodo;

            if (criterio === "nome") {
                return a.nome.localeCompare(b.nome, "pt-BR", {
                    sensitivity: "base"
                });
            }

            if (criterio === "visualizacoes") {
                return dadosB.visualizacoes - dadosA.visualizacoes ||
                    dadosB.pedidosWhatsapp - dadosA.pedidosWhatsapp;
            }

            if (criterio === "carrinho") {
                return dadosB.adicoesCarrinho - dadosA.adicoesCarrinho ||
                    dadosB.visualizacoes - dadosA.visualizacoes;
            }

            if (criterio === "valor") {
                return dadosB.valorPedidosWhatsapp - dadosA.valorPedidosWhatsapp ||
                    dadosB.pedidosWhatsapp - dadosA.pedidosWhatsapp;
            }

            if (criterio === "conversao") {
                return b.conversao - a.conversao ||
                    dadosB.pedidosWhatsapp - dadosA.pedidosWhatsapp ||
                    dadosB.visualizacoes - dadosA.visualizacoes;
            }

            return dadosB.pedidosWhatsapp - dadosA.pedidosWhatsapp ||
                dadosB.valorPedidosWhatsapp - dadosA.valorPedidosWhatsapp ||
                dadosB.adicoesCarrinho - dadosA.adicoesCarrinho ||
                dadosB.visualizacoes - dadosA.visualizacoes;
        });
    }

    function encontrarDestaqueProduto(lista, campo, minimoVisualizacoes) {
        return lista
            .filter(function(item) {
                return !minimoVisualizacoes ||
                    item.dadosPeriodo.visualizacoes >= minimoVisualizacoes;
            })
            .slice()
            .sort(function(a, b) {
                if (campo === "conversao") {
                    return b.conversao - a.conversao ||
                        b.dadosPeriodo.pedidosWhatsapp - a.dadosPeriodo.pedidosWhatsapp;
                }
                return b.dadosPeriodo[campo] - a.dadosPeriodo[campo];
            })[0] || null;
    }

    function preencherDestaqueProduto(idNome, idValor, item, textoVazio, valor) {
        definirTextoMetrica(idNome, item ? item.nome : "Sem dados");
        definirTextoMetrica(idValor, item ? valor(item) : textoVazio);
    }

    function renderizarOportunidadesProdutos(lista) {
        var container = document.getElementById(
            "vide-produtos-oportunidades-lista"
        );
        var contagem = document.getElementById(
            "vide-produtos-oportunidades-contagem"
        );
        if (!container) return;

        var oportunidades = lista
            .filter(function(item) {
                return item.diagnostico.prioridade >= 4;
            })
            .sort(function(a, b) {
                return b.diagnostico.prioridade - a.diagnostico.prioridade ||
                    b.dadosPeriodo.visualizacoes - a.dadosPeriodo.visualizacoes;
            })
            .slice(0, 3);

        if (oportunidades.length === 0) {
            var positivos = lista
                .filter(function(item) {
                    return item.diagnostico.level === "positive";
                })
                .slice(0, 3);

            oportunidades = positivos;
        }

        container.replaceChildren();

        if (oportunidades.length === 0) {
            var vazio = document.createElement("article");
            vazio.className = "vide-produtos-oportunidade";
            vazio.innerHTML =
                "<strong>Aguardando mais interações</strong>" +
                "<p>As oportunidades aparecerão quando houver volume suficiente por produto.</p>";
            container.appendChild(vazio);
            if (contagem) contagem.textContent = "Sem alertas no período";
            return;
        }

        oportunidades.forEach(function(item) {
            var card = document.createElement("article");
            card.className = "vide-produtos-oportunidade";

            var nome = document.createElement("strong");
            nome.textContent = item.nome;

            var texto = document.createElement("p");
            texto.textContent = item.diagnostico.recomendacao;

            card.append(nome, texto);
            container.appendChild(card);
        });

        if (contagem) {
            contagem.textContent = oportunidades.length +
                (oportunidades.length === 1
                    ? " recomendação"
                    : " recomendações");
        }
    }

    function renderizarMetricasProdutos() {
        var corpo = document.getElementById("vide-produtos-tabela-corpo");
        if (!corpo) return;

        var dias = Number(
            document.getElementById("vide-funil-periodo")?.value || 30
        );
        var busca = String(
            document.getElementById("vide-produtos-busca")?.value || ""
        ).trim().toLocaleLowerCase("pt-BR");
        var criterio = String(
            document.getElementById("vide-produtos-ordenacao")?.value ||
            "pedidos"
        );

        var listaCompleta = metricasProdutosDados.map(function(item) {
            var dadosPeriodo = dadosPeriodoMetricaProduto(
                item.metricas,
                dias
            );
            var produto = {
                id: item.id,
                nome: nomeProdutoMetrica(item.produto),
                categoria: categoriaProdutoMetrica(item.produto),
                produto: item.produto,
                metricas: item.metricas,
                dadosPeriodo: dadosPeriodo
            };

            produto.conversao = percentualNumero(
                dadosPeriodo.pedidosWhatsapp,
                dadosPeriodo.visualizacoes
            );
            produto.diagnostico = diagnosticarProdutoMetrica(produto);
            return produto;
        });

        var listaFiltrada = listaCompleta.filter(function(item) {
            if (!busca) return true;
            return (
                item.nome + " " + item.categoria
            ).toLocaleLowerCase("pt-BR").includes(busca);
        });

        var lista = ordenarMetricasProdutos(listaFiltrada, criterio);
        var inteiro = new Intl.NumberFormat("pt-BR");
        var moeda = new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL"
        });

        var topVisualizado = encontrarDestaqueProduto(
            listaCompleta,
            "visualizacoes"
        );
        var topCarrinho = encontrarDestaqueProduto(
            listaCompleta,
            "adicoesCarrinho"
        );
        var topPedidos = encontrarDestaqueProduto(
            listaCompleta,
            "pedidosWhatsapp"
        );
        var topConversao = encontrarDestaqueProduto(
            listaCompleta,
            "conversao",
            3
        );

        preencherDestaqueProduto(
            "vide-produto-top-visualizado",
            "vide-produto-top-visualizado-valor",
            topVisualizado && topVisualizado.dadosPeriodo.visualizacoes > 0
                ? topVisualizado
                : null,
            "0 visualizações",
            function(item) {
                return inteiro.format(item.dadosPeriodo.visualizacoes) +
                    (item.dadosPeriodo.visualizacoes === 1
                        ? " visualização"
                        : " visualizações");
            }
        );

        preencherDestaqueProduto(
            "vide-produto-top-carrinho",
            "vide-produto-top-carrinho-valor",
            topCarrinho && topCarrinho.dadosPeriodo.adicoesCarrinho > 0
                ? topCarrinho
                : null,
            "0 adições",
            function(item) {
                return inteiro.format(item.dadosPeriodo.adicoesCarrinho) +
                    (item.dadosPeriodo.adicoesCarrinho === 1
                        ? " adição"
                        : " adições");
            }
        );

        preencherDestaqueProduto(
            "vide-produto-top-pedidos",
            "vide-produto-top-pedidos-valor",
            topPedidos && topPedidos.dadosPeriodo.pedidosWhatsapp > 0
                ? topPedidos
                : null,
            "0 pedidos",
            function(item) {
                return inteiro.format(item.dadosPeriodo.pedidosWhatsapp) +
                    (item.dadosPeriodo.pedidosWhatsapp === 1
                        ? " pedido"
                        : " pedidos");
            }
        );

        preencherDestaqueProduto(
            "vide-produto-top-conversao",
            "vide-produto-top-conversao-valor",
            topConversao && topConversao.conversao > 0
                ? topConversao
                : null,
            "0%",
            function(item) {
                return formatarPercentualLivre(item.conversao) +
                    " visita → WhatsApp";
            }
        );

        renderizarOportunidadesProdutos(listaCompleta);
        corpo.replaceChildren();

        if (lista.length === 0) {
            var linhaVazia = document.createElement("tr");
            var celulaVazia = document.createElement("td");
            celulaVazia.colSpan = 9;
            celulaVazia.className = "vide-produtos-empty";
            celulaVazia.textContent = metricasProdutosDados.length === 0
                ? "Nenhum produto cadastrado foi encontrado para esta loja."
                : "Nenhum produto corresponde à busca atual.";
            linhaVazia.appendChild(celulaVazia);
            corpo.appendChild(linhaVazia);
        } else {
            lista.forEach(function(item, indice) {
                var dados = item.dadosPeriodo;
                var linha = document.createElement("tr");

                var produtoCelula = document.createElement("td");
                var identidade = document.createElement("div");
                identidade.className = "vide-produto-identidade";

                var posicao = document.createElement("span");
                posicao.className = "vide-produto-posicao";
                posicao.textContent = String(indice + 1);

                var copia = document.createElement("div");
                var nome = document.createElement("strong");
                nome.textContent = item.nome;
                nome.title = item.nome;

                var categoria = document.createElement("small");
                categoria.textContent = item.categoria;

                copia.append(nome, categoria);
                identidade.append(posicao, copia);
                produtoCelula.appendChild(identidade);

                function celulaNumero(valor, classe) {
                    var celula = document.createElement("td");
                    if (classe) celula.className = classe;
                    celula.textContent = valor;
                    return celula;
                }

                var diagnosticoCelula = document.createElement("td");
                var diagnosticoBadge = document.createElement("span");
                diagnosticoBadge.className = "vide-produto-diagnostico";
                diagnosticoBadge.dataset.level = item.diagnostico.level;
                diagnosticoBadge.textContent = item.diagnostico.label;
                diagnosticoBadge.title = item.diagnostico.recomendacao;
                diagnosticoCelula.appendChild(diagnosticoBadge);

                linha.append(
                    produtoCelula,
                    celulaNumero(inteiro.format(dados.visualizacoes)),
                    celulaNumero(inteiro.format(dados.detalhesAbertos)),
                    celulaNumero(inteiro.format(dados.adicoesCarrinho)),
                    celulaNumero(inteiro.format(dados.checkoutsIniciados)),
                    celulaNumero(inteiro.format(dados.pedidosWhatsapp)),
                    celulaNumero(
                        formatarPercentualLivre(item.conversao),
                        "vide-produto-conversao"
                    ),
                    celulaNumero(moeda.format(dados.valorPedidosWhatsapp)),
                    diagnosticoCelula
                );

                corpo.appendChild(linha);
            });
        }

        var status = document.getElementById("vide-produtos-status");
        if (status && !metricasProdutosCarregando) {
            status.dataset.state = "ready";
            status.textContent =
                inteiro.format(lista.length) +
                (lista.length === 1 ? " produto exibido" : " produtos exibidos") +
                (dias === 0
                    ? " em todo o histórico disponível."
                    : " nos últimos " + dias + " dias.") +
                " Métricas anteriores à implantação podem não possuir todos os contadores.";
        }
    }

    async function carregarMetricasProdutos(forcar) {
        if (!metricasProdutosConexao || metricasProdutosCarregando) return;
        if (!forcar && metricasProdutosDados.length > 0) {
            renderizarMetricasProdutos();
            return;
        }

        var botao = document.getElementById("vide-produtos-atualizar");
        var status = document.getElementById("vide-produtos-status");
        metricasProdutosCarregando = true;

        if (botao) {
            botao.disabled = true;
            botao.classList.add("is-loading");
        }
        if (status) {
            status.dataset.state = "loading";
            status.textContent = "Atualizando produtos e indicadores...";
        }

        try {
            var conexao = metricasProdutosConexao;
            var firestore = conexao.firestore;
            var firebase = conexao.firebase;
            var tenantUid = conexao.tenantUid;

            var produtosSnapshot = await firestore.getDocs(
                firestore.query(
                    firestore.collection(firebase.db, "produtos"),
                    firestore.where("criadoPor", "==", tenantUid)
                )
            );

            var produtos = produtosSnapshot.docs.map(function(documento) {
                return {
                    id: documento.id,
                    produto: documento.data() || {}
                };
            });

            var metricas = await Promise.all(
                produtos.map(async function(item) {
                    try {
                        var snapshot = await firestore.getDoc(
                            firestore.doc(
                                firebase.db,
                                "metricas_produtos",
                                item.id
                            )
                        );
                        return snapshot.exists()
                            ? (snapshot.data() || {})
                            : {};
                    } catch (erro) {
                        console.warn(
                            "[Vide Hub] Métrica do produto não carregada:",
                            item.id,
                            erro?.message || erro
                        );
                        return {};
                    }
                })
            );

            metricasProdutosDados = produtos.map(function(item, indice) {
                return {
                    id: item.id,
                    produto: item.produto,
                    metricas: metricas[indice] || {}
                };
            });

            metricasProdutosCarregando = false;
            renderizarMetricasProdutos();
        } catch (erro) {
            console.error(
                "[Vide Hub] Erro ao carregar métricas por produto:",
                erro
            );
            if (status) {
                status.dataset.state = "error";
                status.textContent =
                    "Não foi possível carregar o ranking por produto agora.";
            }
        } finally {
            metricasProdutosCarregando = false;
            if (botao) {
                botao.disabled = false;
                botao.classList.remove("is-loading");
            }
        }
    }

    function agendarAtualizacaoMetricasProdutos() {
        clearTimeout(metricasProdutosAtualizacaoTimer);
        metricasProdutosAtualizacaoTimer = setTimeout(function() {
            carregarMetricasProdutos(true);
        }, 1200);
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

        renderizarDiagnosticoFunil(
            dadosDocumento,
            dias,
            dados,
            inteiro,
            moeda
        );

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

            metricasProdutosConexao = {
                tenantUid: tenantUid,
                firebase: firebase,
                firestore: firestore
            };

            if (typeof metricasFunilDesinscrever === "function") {
                metricasFunilDesinscrever();
            }

            metricasFunilDesinscrever = firestore.onSnapshot(
                firestore.doc(firebase.db, "metricas_vitrines", tenantUid),
                function(snapshot) {
                    metricasFunilDados = snapshot.exists() ? (snapshot.data() || {}) : {};
                    renderizarMetricasFunil(metricasFunilDados);
                    agendarAtualizacaoMetricasProdutos();
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
