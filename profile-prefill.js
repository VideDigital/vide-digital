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
                z-index: 100;
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

            #vide-funil-loja-publica .vide-relatorio-toolbar {
                position: relative;
                z-index: 110;
                display: flex;
                align-items: flex-start;
                justify-content: flex-end;
                flex-wrap: wrap;
                gap: 10px;
                flex: 0 0 auto;
            }

            #vide-funil-loja-publica .vide-relatorio-exportacao {
                position: relative;
                z-index: 1;
            }

            #vide-funil-loja-publica .vide-relatorio-exportacao[open] {
                z-index: 120;
            }

            #vide-funil-loja-publica .vide-relatorio-exportacao summary {
                min-height: 42px;
                padding: 0 14px;
                border: 1px solid color-mix(in srgb, var(--sys-destaque, #00f2fe) 24%, rgba(255,255,255,.1));
                border-radius: 13px;
                background:
                    linear-gradient(
                        135deg,
                        color-mix(in srgb, var(--sys-destaque, #00f2fe) 11%, rgba(3,7,18,.78)),
                        rgba(3,7,18,.76)
                    );
                color: #fff;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                font-size: 10px;
                font-weight: 900;
                letter-spacing: .04em;
                list-style: none;
                cursor: pointer;
                user-select: none;
                white-space: nowrap;
                transition: border-color .2s ease, background .2s ease, transform .2s ease;
            }

            #vide-funil-loja-publica .vide-relatorio-exportacao summary::-webkit-details-marker {
                display: none;
            }

            #vide-funil-loja-publica .vide-relatorio-exportacao summary:hover {
                border-color: color-mix(in srgb, var(--sys-destaque, #00f2fe) 45%, rgba(255,255,255,.1));
                background:
                    linear-gradient(
                        135deg,
                        color-mix(in srgb, var(--sys-destaque, #00f2fe) 17%, rgba(3,7,18,.8)),
                        rgba(3,7,18,.78)
                    );
                transform: translateY(-1px);
            }

            #vide-funil-loja-publica .vide-relatorio-exportacao summary:focus-visible {
                outline: none;
                border-color: var(--sys-destaque, #00f2fe);
                box-shadow: 0 0 0 3px color-mix(in srgb, var(--sys-destaque, #00f2fe) 20%, transparent);
            }

            #vide-funil-loja-publica .vide-relatorio-exportacao summary svg {
                width: 15px;
                height: 15px;
                fill: none;
                stroke: currentColor;
                stroke-width: 1.9;
                stroke-linecap: round;
                stroke-linejoin: round;
            }

            #vide-funil-loja-publica .vide-relatorio-menu {
                position: absolute;
                top: calc(100% + 8px);
                right: 0;
                z-index: 1000;
                width: min(290px, calc(100vw - 32px));
                padding: 8px;
                border: 1px solid rgba(255,255,255,.1);
                border-radius: 16px;
                background: rgba(5,9,20,.98);
                box-shadow: 0 20px 50px rgba(0,0,0,.45);
                backdrop-filter: blur(18px);
            }

            #vide-funil-loja-publica .vide-relatorio-opcao {
                width: 100%;
                padding: 12px;
                border: 0;
                border-radius: 11px;
                background: transparent;
                color: #fff;
                display: grid;
                grid-template-columns: 34px minmax(0, 1fr);
                align-items: center;
                gap: 10px;
                text-align: left;
                cursor: pointer;
                transition: background .2s ease;
            }

            #vide-funil-loja-publica .vide-relatorio-opcao:hover,
            #vide-funil-loja-publica .vide-relatorio-opcao:focus-visible {
                outline: none;
                background: rgba(255,255,255,.065);
            }

            #vide-funil-loja-publica .vide-relatorio-opcao + .vide-relatorio-opcao {
                margin-top: 3px;
            }

            #vide-funil-loja-publica .vide-relatorio-opcao-icon {
                width: 34px;
                height: 34px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                border: 1px solid rgba(255,255,255,.08);
                border-radius: 10px;
                color: color-mix(in srgb, var(--sys-destaque, #00f2fe) 76%, white 24%);
                background: color-mix(in srgb, var(--sys-destaque, #00f2fe) 8%, transparent);
            }

            #vide-funil-loja-publica .vide-relatorio-opcao-icon svg {
                width: 16px;
                height: 16px;
                fill: none;
                stroke: currentColor;
                stroke-width: 1.8;
                stroke-linecap: round;
                stroke-linejoin: round;
            }

            #vide-funil-loja-publica .vide-relatorio-opcao strong {
                display: block;
                color: #fff;
                font-size: 10px;
                font-weight: 900;
            }

            #vide-funil-loja-publica .vide-relatorio-opcao small {
                display: block;
                margin-top: 3px;
                color: #7f8a9d;
                font-size: 8px;
                line-height: 1.45;
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

                #vide-funil-loja-publica .vide-relatorio-toolbar {
                    width: 100%;
                    justify-content: stretch;
                }

                #vide-funil-loja-publica .vide-relatorio-toolbar > label,
                #vide-funil-loja-publica .vide-relatorio-exportacao {
                    flex: 1 1 220px;
                }

                #vide-funil-periodo,
                #vide-funil-loja-publica .vide-relatorio-exportacao summary {
                    width: 100%;
                }

                #vide-funil-loja-publica .vide-relatorio-menu {
                    left: 0;
                    right: auto;
                    width: 100%;
                    min-width: 260px;
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
                <div class="vide-relatorio-toolbar">
                    <label>
                        <span class="sr-only">Período das métricas do funil</span>
                        <select id="vide-funil-periodo" aria-label="Período das métricas do funil">
                            <option value="7">Últimos 7 dias</option>
                            <option value="30" selected>Últimos 30 dias</option>
                            <option value="90">Últimos 90 dias</option>
                            <option value="0">Todo o período</option>
                        </select>
                    </label>

                    <details class="vide-relatorio-exportacao" id="vide-relatorio-exportacao">
                        <summary>
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M12 3v12"></path>
                                <path d="m7 10 5 5 5-5"></path>
                                <path d="M5 21h14"></path>
                            </svg>
                            Exportar relatório
                        </summary>
                        <div class="vide-relatorio-menu">
                            <button type="button" class="vide-relatorio-opcao" id="vide-relatorio-csv">
                                <span class="vide-relatorio-opcao-icon" aria-hidden="true">
                                    <svg viewBox="0 0 24 24">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                        <path d="M14 2v6h6"></path>
                                        <path d="M8 13h8"></path>
                                        <path d="M8 17h8"></path>
                                    </svg>
                                </span>
                                <span>
                                    <strong>Baixar CSV</strong>
                                    <small>Abre no Excel e no Google Planilhas.</small>
                                </span>
                            </button>

                            <button type="button" class="vide-relatorio-opcao" id="vide-relatorio-pdf">
                                <span class="vide-relatorio-opcao-icon" aria-hidden="true">
                                    <svg viewBox="0 0 24 24">
                                        <path d="M6 9V2h12v7"></path>
                                        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                                        <rect x="6" y="14" width="12" height="8"></rect>
                                    </svg>
                                </span>
                                <span>
                                    <strong>Imprimir ou salvar em PDF</strong>
                                    <small>Gera um relatório executivo pronto para compartilhar.</small>
                                </span>
                            </button>
                        </div>
                    </details>
                </div>
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

        document.getElementById("vide-relatorio-csv")?.addEventListener("click", async function() {
            fecharMenuExportacaoMetricas();
            await exportarRelatorioMetricasCsv();
        });

        document.getElementById("vide-relatorio-pdf")?.addEventListener("click", async function() {
            fecharMenuExportacaoMetricas();
            await abrirRelatorioMetricasImpressao();
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

    function fecharMenuExportacaoMetricas() {
        var menu = document.getElementById("vide-relatorio-exportacao");
        if (menu) menu.removeAttribute("open");
    }

    async function garantirDadosProdutosRelatorio() {
        if (
            metricasProdutosConexao &&
            !metricasProdutosCarregando &&
            metricasProdutosDados.length === 0
        ) {
            await carregarMetricasProdutos(true);
        }

        if (!metricasProdutosCarregando) return;

        await new Promise(function(resolve) {
            var tentativas = 0;
            var intervalo = setInterval(function() {
                tentativas += 1;
                if (!metricasProdutosCarregando || tentativas >= 40) {
                    clearInterval(intervalo);
                    resolve();
                }
            }, 100);
        });
    }

    function obterNomeLojaRelatorio() {
        var candidatos = [
            document.getElementById("txt-preview-nome-loja")?.textContent,
            document.querySelector("[data-store-name]")?.textContent,
            document.title
        ];

        var nome = candidatos.find(function(valor) {
            return String(valor || "").trim();
        });

        nome = String(nome || "Loja Vide Hub")
            .replace(/\s+/g, " ")
            .trim();

        return nome.slice(0, 120) || "Loja Vide Hub";
    }

    function obterPeriodoRelatorio() {
        var select = document.getElementById("vide-funil-periodo");
        var dias = Number(select?.value || 30);
        var rotulo = select?.selectedOptions?.[0]?.textContent?.trim();

        return {
            dias: Number.isFinite(dias) ? dias : 30,
            rotulo: rotulo || (dias === 0
                ? "Todo o período"
                : "Últimos " + dias + " dias")
        };
    }

    function obterDadosFunilRelatorio(dias) {
        var dados = dadosPeriodoMetricas(
            metricasFunilDados?.porDia || {},
            dias
        );

        if (dias === 0 && dados.sessoes === 0) {
            dados.sessoes = numeroMetrica(
                metricasFunilDados?.totalSessoes
            );
        }

        return dados;
    }

    function montarListaProdutosRelatorio(dias) {
        return metricasProdutosDados.map(function(item) {
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
            produto.diagnostico = diagnosticarProdutoMetrica(
                produto
            );

            return produto;
        });
    }

    function montarDadosRelatorioMetricas() {
        var periodo = obterPeriodoRelatorio();
        var funil = obterDadosFunilRelatorio(periodo.dias);
        var anterior = obterPeriodoAnteriorMetricas(
            metricasFunilDados?.porDia || {},
            periodo.dias
        );
        var diagnosticoFunil = gerarDiagnosticoFunil(
            funil,
            anterior,
            periodo.dias
        );
        var produtos = ordenarMetricasProdutos(
            montarListaProdutosRelatorio(periodo.dias),
            "pedidos"
        );

        var oportunidades = produtos
            .filter(function(item) {
                return item.diagnostico.prioridade >= 4;
            })
            .sort(function(a, b) {
                return b.diagnostico.prioridade -
                    a.diagnostico.prioridade ||
                    b.dadosPeriodo.visualizacoes -
                    a.dadosPeriodo.visualizacoes;
            })
            .slice(0, 5);

        if (oportunidades.length === 0) {
            oportunidades = produtos
                .filter(function(item) {
                    return item.diagnostico.level === "positive";
                })
                .slice(0, 5);
        }

        return {
            nomeLoja: obterNomeLojaRelatorio(),
            periodo: periodo,
            geradoEm: new Date(),
            funil: funil,
            diagnosticoFunil: diagnosticoFunil,
            produtos: produtos,
            oportunidades: oportunidades
        };
    }

    function normalizarNomeArquivoRelatorio(valor) {
        return String(valor || "loja")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 60) || "loja";
    }

    function escaparCampoCsv(valor) {
        var texto = String(valor ?? "");
        if (
            texto.includes(";") ||
            texto.includes('"') ||
            texto.includes("\n") ||
            texto.includes("\r")
        ) {
            return '"' + texto.replace(/"/g, '""') + '"';
        }
        return texto;
    }

    function linhaCsv(campos) {
        return campos.map(escaparCampoCsv).join(";");
    }

    function baixarArquivoRelatorio(conteudo, nomeArquivo, tipo) {
        var blob = new Blob([conteudo], {
            type: tipo || "text/plain;charset=utf-8"
        });
        var url = URL.createObjectURL(blob);
        var link = document.createElement("a");
        link.href = url;
        link.download = nomeArquivo;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(function() {
            URL.revokeObjectURL(url);
        }, 1500);
    }

    async function exportarRelatorioMetricasCsv() {
        await garantirDadosProdutosRelatorio();

        var relatorio = montarDadosRelatorioMetricas();
        var inteiro = new Intl.NumberFormat("pt-BR", {
            maximumFractionDigits: 0
        });
        var numeroDecimal = new Intl.NumberFormat("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        var linhas = [];
        var funil = relatorio.funil;
        var diagnostico = relatorio.diagnosticoFunil;

        linhas.push(linhaCsv([
            "RELATÓRIO DE MÉTRICAS",
            relatorio.nomeLoja
        ]));
        linhas.push(linhaCsv([
            "Período",
            relatorio.periodo.rotulo
        ]));
        linhas.push(linhaCsv([
            "Gerado em",
            relatorio.geradoEm.toLocaleString("pt-BR")
        ]));
        linhas.push("");

        linhas.push(linhaCsv(["RESUMO DO FUNIL"]));
        linhas.push(linhaCsv([
            "Indicador",
            "Quantidade / valor",
            "Taxa sobre visitas"
        ]));
        linhas.push(linhaCsv([
            "Visitas",
            inteiro.format(funil.sessoes),
            funil.sessoes ? "100%" : "0%"
        ]));
        linhas.push(linhaCsv([
            "Carrinhos abertos",
            inteiro.format(funil.carrinhosAbertos),
            formatarPercentualLivre(
                percentualNumero(
                    funil.carrinhosAbertos,
                    funil.sessoes
                )
            )
        ]));
        linhas.push(linhaCsv([
            "Itens adicionados",
            inteiro.format(funil.adicoesCarrinho),
            formatarPercentualLivre(
                percentualNumero(
                    funil.adicoesCarrinho,
                    funil.sessoes
                )
            )
        ]));
        linhas.push(linhaCsv([
            "Pedidos iniciados",
            inteiro.format(funil.checkoutsIniciados),
            formatarPercentualLivre(
                percentualNumero(
                    funil.checkoutsIniciados,
                    funil.sessoes
                )
            )
        ]));
        linhas.push(linhaCsv([
            "WhatsApp aberto",
            inteiro.format(funil.pedidosWhatsapp),
            formatarPercentualLivre(
                percentualNumero(
                    funil.pedidosWhatsapp,
                    funil.sessoes
                )
            )
        ]));
        linhas.push(linhaCsv([
            "Compartilhamentos",
            inteiro.format(funil.compartilhamentos),
            ""
        ]));
        linhas.push(linhaCsv([
            "Valor potencial",
            "R$ " + numeroDecimal.format(
                funil.valorPedidosWhatsapp
            ),
            ""
        ]));
        linhas.push("");

        linhas.push(linhaCsv(["DIAGNÓSTICO EXECUTIVO"]));
        linhas.push(linhaCsv([
            "Status",
            diagnostico.status
        ]));
        linhas.push(linhaCsv([
            "Principal ponto de atenção",
            diagnostico.gargaloTitulo
        ]));
        linhas.push(linhaCsv([
            "Análise",
            diagnostico.gargaloTexto
        ]));
        (diagnostico.recomendacoes || []).forEach(function(item, indice) {
            linhas.push(linhaCsv([
                "Recomendação " + (indice + 1),
                item
            ]));
        });
        linhas.push("");

        linhas.push(linhaCsv(["RANKING POR PRODUTO"]));
        linhas.push(linhaCsv([
            "Posição",
            "Produto",
            "Categoria",
            "Visualizações",
            "Detalhes",
            "Carrinho",
            "Checkout",
            "WhatsApp",
            "Conversão visita → WhatsApp",
            "Valor potencial",
            "Diagnóstico",
            "Recomendação"
        ]));

        if (relatorio.produtos.length === 0) {
            linhas.push(linhaCsv([
                "",
                "Nenhum produto cadastrado encontrado no período."
            ]));
        } else {
            relatorio.produtos.forEach(function(item, indice) {
                var dados = item.dadosPeriodo;
                linhas.push(linhaCsv([
                    indice + 1,
                    item.nome,
                    item.categoria,
                    inteiro.format(dados.visualizacoes),
                    inteiro.format(dados.detalhesAbertos),
                    inteiro.format(dados.adicoesCarrinho),
                    inteiro.format(dados.checkoutsIniciados),
                    inteiro.format(dados.pedidosWhatsapp),
                    formatarPercentualLivre(item.conversao),
                    "R$ " + numeroDecimal.format(
                        dados.valorPedidosWhatsapp
                    ),
                    item.diagnostico.label,
                    item.diagnostico.recomendacao
                ]));
            });
        }

        var dataArquivo = [
            relatorio.geradoEm.getFullYear(),
            String(relatorio.geradoEm.getMonth() + 1).padStart(2, "0"),
            String(relatorio.geradoEm.getDate()).padStart(2, "0")
        ].join("-");

        baixarArquivoRelatorio(
            "\uFEFF" + linhas.join("\r\n"),
            "relatorio-metricas-" +
                normalizarNomeArquivoRelatorio(relatorio.nomeLoja) +
                "-" +
                dataArquivo +
                ".csv",
            "text/csv;charset=utf-8"
        );
    }

    function escaparHtmlRelatorio(valor) {
        return String(valor ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function classeDiagnosticoRelatorio(level) {
        if (level === "positive") return "positive";
        if (level === "critical") return "critical";
        if (level === "attention") return "attention";
        return "neutral";
    }

    function montarHtmlRelatorioImpressao(relatorio) {
        var inteiro = new Intl.NumberFormat("pt-BR");
        var moeda = new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL"
        });
        var funil = relatorio.funil;
        var diagnostico = relatorio.diagnosticoFunil;
        var conversaoGeral = percentualNumero(
            funil.pedidosWhatsapp,
            funil.sessoes
        );
        var linhasProdutos = relatorio.produtos.map(function(item, indice) {
            var dados = item.dadosPeriodo;
            return `
                <tr>
                    <td>${indice + 1}</td>
                    <td>
                        <strong>${escaparHtmlRelatorio(item.nome)}</strong>
                        <small>${escaparHtmlRelatorio(item.categoria)}</small>
                    </td>
                    <td>${inteiro.format(dados.visualizacoes)}</td>
                    <td>${inteiro.format(dados.adicoesCarrinho)}</td>
                    <td>${inteiro.format(dados.checkoutsIniciados)}</td>
                    <td>${inteiro.format(dados.pedidosWhatsapp)}</td>
                    <td>${formatarPercentualLivre(item.conversao)}</td>
                    <td>${escaparHtmlRelatorio(moeda.format(dados.valorPedidosWhatsapp))}</td>
                    <td>
                        <span class="badge ${classeDiagnosticoRelatorio(item.diagnostico.level)}">
                            ${escaparHtmlRelatorio(item.diagnostico.label)}
                        </span>
                    </td>
                </tr>
            `;
        }).join("");

        if (!linhasProdutos) {
            linhasProdutos = `
                <tr>
                    <td colspan="9" class="empty">
                        Nenhum produto cadastrado foi encontrado.
                    </td>
                </tr>
            `;
        }

        var recomendacoes = (diagnostico.recomendacoes || [])
            .map(function(item) {
                return `<li>${escaparHtmlRelatorio(item)}</li>`;
            })
            .join("");

        var oportunidades = relatorio.oportunidades
            .map(function(item) {
                return `
                    <article class="opportunity">
                        <span class="badge ${classeDiagnosticoRelatorio(item.diagnostico.level)}">
                            ${escaparHtmlRelatorio(item.diagnostico.label)}
                        </span>
                        <strong>${escaparHtmlRelatorio(item.nome)}</strong>
                        <p>${escaparHtmlRelatorio(item.diagnostico.recomendacao)}</p>
                    </article>
                `;
            })
            .join("");

        if (!oportunidades) {
            oportunidades = `
                <article class="opportunity empty-card">
                    <strong>Aguardando mais interações</strong>
                    <p>As oportunidades por produto aparecerão quando houver volume suficiente.</p>
                </article>
            `;
        }

        return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Relatório de métricas — ${escaparHtmlRelatorio(relatorio.nomeLoja)}</title>
    <style>
        :root {
            color-scheme: light;
            font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            color: #172033;
            background: #eef2f7;
        }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            background: #eef2f7;
            color: #172033;
        }
        .print-actions {
            position: sticky;
            top: 0;
            z-index: 10;
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            padding: 12px max(18px, calc((100vw - 1180px) / 2));
            background: rgba(238,242,247,.94);
            border-bottom: 1px solid #dbe2ec;
            backdrop-filter: blur(12px);
        }
        .print-actions button {
            min-height: 40px;
            padding: 0 16px;
            border: 1px solid #cad4e2;
            border-radius: 10px;
            background: #fff;
            color: #172033;
            font: inherit;
            font-size: 12px;
            font-weight: 800;
            cursor: pointer;
        }
        .print-actions .primary {
            border-color: #172033;
            background: #172033;
            color: #fff;
        }
        .report {
            width: min(1180px, calc(100% - 36px));
            margin: 28px auto;
            padding: 42px;
            border: 1px solid #dbe2ec;
            border-radius: 24px;
            background: #fff;
            box-shadow: 0 24px 60px rgba(23,32,51,.1);
        }
        .header {
            display: flex;
            justify-content: space-between;
            gap: 24px;
            padding-bottom: 26px;
            border-bottom: 2px solid #172033;
        }
        .eyebrow {
            display: block;
            margin-bottom: 8px;
            color: #667085;
            font-size: 10px;
            font-weight: 900;
            letter-spacing: .18em;
            text-transform: uppercase;
        }
        h1 {
            margin: 0;
            font-size: 30px;
            line-height: 1.1;
            letter-spacing: -.04em;
        }
        .header p {
            margin: 8px 0 0;
            color: #667085;
            font-size: 12px;
        }
        .meta {
            min-width: 230px;
            text-align: right;
        }
        .meta strong,
        .meta span {
            display: block;
        }
        .meta strong {
            font-size: 13px;
        }
        .meta span {
            margin-top: 5px;
            color: #667085;
            font-size: 11px;
        }
        .section {
            margin-top: 30px;
        }
        .section-title {
            display: flex;
            align-items: flex-end;
            justify-content: space-between;
            gap: 18px;
            margin-bottom: 14px;
        }
        .section-title h2 {
            margin: 0;
            font-size: 17px;
            letter-spacing: -.02em;
        }
        .section-title span {
            color: #667085;
            font-size: 10px;
        }
        .cards {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 12px;
        }
        .card {
            min-height: 105px;
            padding: 16px;
            border: 1px solid #dbe2ec;
            border-radius: 14px;
            background: #f8fafc;
        }
        .card span {
            display: block;
            color: #667085;
            font-size: 9px;
            font-weight: 900;
            letter-spacing: .1em;
            text-transform: uppercase;
        }
        .card strong {
            display: block;
            margin-top: 14px;
            font-size: 24px;
            letter-spacing: -.04em;
        }
        .analysis {
            display: grid;
            grid-template-columns: minmax(0, .85fr) minmax(0, 1.15fr);
            gap: 14px;
        }
        .analysis article {
            padding: 18px;
            border: 1px solid #dbe2ec;
            border-radius: 14px;
        }
        .analysis h3 {
            margin: 9px 0 6px;
            font-size: 15px;
        }
        .analysis p,
        .analysis li {
            color: #536176;
            font-size: 11px;
            line-height: 1.6;
        }
        .analysis ul {
            margin: 10px 0 0;
            padding-left: 18px;
        }
        .opportunities {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 12px;
        }
        .opportunity {
            padding: 15px;
            border: 1px solid #dbe2ec;
            border-radius: 13px;
        }
        .opportunity strong {
            display: block;
            margin-top: 10px;
            font-size: 12px;
        }
        .opportunity p {
            margin: 6px 0 0;
            color: #536176;
            font-size: 10px;
            line-height: 1.55;
        }
        .badge {
            display: inline-flex;
            align-items: center;
            min-height: 23px;
            padding: 0 8px;
            border: 1px solid #dbe2ec;
            border-radius: 999px;
            background: #f8fafc;
            color: #536176;
            font-size: 8px;
            font-weight: 900;
            white-space: nowrap;
        }
        .badge.positive {
            border-color: #bbf7d0;
            background: #f0fdf4;
            color: #15803d;
        }
        .badge.attention {
            border-color: #fde68a;
            background: #fffbeb;
            color: #b45309;
        }
        .badge.critical {
            border-color: #fecdd3;
            background: #fff1f2;
            color: #be123c;
        }
        .table-wrap {
            overflow: hidden;
            border: 1px solid #dbe2ec;
            border-radius: 14px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 9px;
        }
        th {
            padding: 11px 9px;
            background: #f1f5f9;
            color: #536176;
            text-align: left;
            font-size: 8px;
            letter-spacing: .08em;
            text-transform: uppercase;
        }
        td {
            padding: 11px 9px;
            border-top: 1px solid #e6ebf2;
            vertical-align: middle;
        }
        td strong,
        td small {
            display: block;
        }
        td small {
            margin-top: 3px;
            color: #7b8799;
        }
        .empty {
            padding: 26px;
            color: #667085;
            text-align: center;
        }
        .footer {
            display: flex;
            justify-content: space-between;
            gap: 20px;
            margin-top: 30px;
            padding-top: 18px;
            border-top: 1px solid #dbe2ec;
            color: #7b8799;
            font-size: 9px;
        }
        @media (max-width: 820px) {
            .report { padding: 24px; }
            .header { flex-direction: column; }
            .meta { text-align: left; }
            .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            .analysis { grid-template-columns: 1fr; }
            .opportunities { grid-template-columns: 1fr; }
            .table-wrap { overflow-x: auto; }
            table { min-width: 850px; }
        }
        @media print {
            @page {
                size: A4 landscape;
                margin: 10mm;
            }
            body { background: #fff; }
            .print-actions { display: none !important; }
            .report {
                width: 100%;
                margin: 0;
                padding: 0;
                border: 0;
                border-radius: 0;
                box-shadow: none;
            }
            .section,
            .card,
            .analysis article,
            .opportunity {
                break-inside: avoid;
            }
            .table-wrap {
                overflow: visible;
            }
            table {
                font-size: 8px;
            }
        }
    </style>
</head>
<body>
    <div class="print-actions">
        <button type="button" onclick="window.close()">Fechar</button>
        <button type="button" class="primary" onclick="window.print()">Imprimir / salvar PDF</button>
    </div>

    <main class="report">
        <header class="header">
            <div>
                <span class="eyebrow">Vide Hub · Relatório executivo</span>
                <h1>${escaparHtmlRelatorio(relatorio.nomeLoja)}</h1>
                <p>Desempenho da loja pública e dos produtos.</p>
            </div>
            <div class="meta">
                <strong>${escaparHtmlRelatorio(relatorio.periodo.rotulo)}</strong>
                <span>Gerado em ${escaparHtmlRelatorio(relatorio.geradoEm.toLocaleString("pt-BR"))}</span>
            </div>
        </header>

        <section class="section">
            <div class="section-title">
                <h2>Resumo comercial</h2>
                <span>Indicadores do período selecionado</span>
            </div>
            <div class="cards">
                <article class="card">
                    <span>Visitas</span>
                    <strong>${inteiro.format(funil.sessoes)}</strong>
                </article>
                <article class="card">
                    <span>Pedidos no WhatsApp</span>
                    <strong>${inteiro.format(funil.pedidosWhatsapp)}</strong>
                </article>
                <article class="card">
                    <span>Conversão geral</span>
                    <strong>${formatarPercentualLivre(conversaoGeral)}</strong>
                </article>
                <article class="card">
                    <span>Valor potencial</span>
                    <strong>${escaparHtmlRelatorio(moeda.format(funil.valorPedidosWhatsapp))}</strong>
                </article>
                <article class="card">
                    <span>Carrinhos abertos</span>
                    <strong>${inteiro.format(funil.carrinhosAbertos)}</strong>
                </article>
                <article class="card">
                    <span>Itens adicionados</span>
                    <strong>${inteiro.format(funil.adicoesCarrinho)}</strong>
                </article>
                <article class="card">
                    <span>Pedidos iniciados</span>
                    <strong>${inteiro.format(funil.checkoutsIniciados)}</strong>
                </article>
                <article class="card">
                    <span>Compartilhamentos</span>
                    <strong>${inteiro.format(funil.compartilhamentos)}</strong>
                </article>
            </div>
        </section>

        <section class="section">
            <div class="section-title">
                <h2>Diagnóstico executivo</h2>
                <span>Análise automática do funil</span>
            </div>
            <div class="analysis">
                <article>
                    <span class="badge ${classeDiagnosticoRelatorio(diagnostico.nivel)}">
                        ${escaparHtmlRelatorio(diagnostico.status)}
                    </span>
                    <h3>${escaparHtmlRelatorio(diagnostico.gargaloTitulo)}</h3>
                    <p>${escaparHtmlRelatorio(diagnostico.gargaloTexto)}</p>
                </article>
                <article>
                    <span class="eyebrow">Ações recomendadas</span>
                    <ul>${recomendacoes || "<li>Continue acompanhando os indicadores e teste uma melhoria por vez.</li>"}</ul>
                </article>
            </div>
        </section>

        <section class="section">
            <div class="section-title">
                <h2>Oportunidades por produto</h2>
                <span>Prioridades identificadas automaticamente</span>
            </div>
            <div class="opportunities">${oportunidades}</div>
        </section>

        <section class="section">
            <div class="section-title">
                <h2>Ranking por produto</h2>
                <span>${inteiro.format(relatorio.produtos.length)} produtos analisados</span>
            </div>
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Produto</th>
                            <th>Visitas</th>
                            <th>Carrinho</th>
                            <th>Checkout</th>
                            <th>WhatsApp</th>
                            <th>Conversão</th>
                            <th>Valor</th>
                            <th>Diagnóstico</th>
                        </tr>
                    </thead>
                    <tbody>${linhasProdutos}</tbody>
                </table>
            </div>
        </section>

        <footer class="footer">
            <span>Relatório gerado pelo Vide Hub.</span>
            <span>Os valores representam potencial enviado ao WhatsApp, não pagamentos confirmados.</span>
        </footer>
    </main>
</body>
</html>`;
    }

    async function abrirRelatorioMetricasImpressao() {
        var janela = window.open("", "_blank");

        if (!janela) {
            alert(
                "O navegador bloqueou a abertura do relatório. Permita pop-ups e tente novamente."
            );
            return;
        }

        try {
            janela.document.open();
            janela.document.write(
                "<!DOCTYPE html><html><head><title>Preparando relatório...</title></head>" +
                "<body style='font-family:Arial,sans-serif;padding:32px;color:#172033'>" +
                "Preparando relatório executivo..." +
                "</body></html>"
            );
            janela.document.close();

            await garantirDadosProdutosRelatorio();
            var relatorio = montarDadosRelatorioMetricas();
            var html = montarHtmlRelatorioImpressao(relatorio);

            janela.document.open();
            janela.document.write(html);
            janela.document.close();
            janela.focus();
        } catch (erro) {
            console.error(
                "[Vide Hub] Não foi possível gerar o relatório:",
                erro
            );
            janela.document.open();
            janela.document.write(
                "<!DOCTYPE html><html><body style='font-family:Arial,sans-serif;padding:32px'>" +
                "<h1>Não foi possível gerar o relatório</h1>" +
                "<p>Feche esta aba e tente novamente.</p>" +
                "</body></html>"
            );
            janela.document.close();
        }
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

/* =========================================================
   VIDE HUB — AQUISIÇÃO REAL POR ORIGEM E CAMPANHA
   Adicionado como segundo IIFE para não alterar o funil atual.
   ========================================================= */
(function() {
    "use strict";

    var desinscreverAquisicao = null;
    var conexaoIniciada = false;

    function numeroAquisicao(valor) {
        var numero = Number(valor || 0);
        return Number.isFinite(numero) ? Math.max(0, numero) : 0;
    }

    function percentualAquisicao(parte, total) {
        parte = numeroAquisicao(parte);
        total = numeroAquisicao(total);
        if (!total) return 0;
        return Math.max(0, (parte / total) * 100);
    }

    function formatarPercentualAquisicao(valor) {
        return Number(valor || 0).toLocaleString("pt-BR", {
            minimumFractionDigits: Math.abs(Number(valor || 0)) < 10 ? 1 : 0,
            maximumFractionDigits: 1
        }) + "%";
    }

    function formatarInteiroAquisicao(valor) {
        return new Intl.NumberFormat("pt-BR").format(
            Math.round(numeroAquisicao(valor))
        );
    }

    function formatarMoedaAquisicao(valor) {
        return new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL"
        }).format(numeroAquisicao(valor));
    }

    function textoSeguroAquisicao(valor, fallback) {
        var texto = String(valor || "").replace(/\s+/g, " ").trim();
        return texto || fallback || "";
    }

    function siglaAquisicao(nome) {
        var partes = textoSeguroAquisicao(nome, "Origem")
            .split(" ")
            .filter(Boolean);

        if (partes.length === 1) {
            return partes[0].slice(0, 2).toUpperCase();
        }

        return (
            partes[0].slice(0, 1) +
            partes[1].slice(0, 1)
        ).toUpperCase();
    }

    function dadosItemAquisicao(item) {
        item = item || {};

        return {
            nome: textoSeguroAquisicao(item.nome, "Origem não identificada"),
            meio: textoSeguroAquisicao(item.meio, "Não informado"),
            origem: textoSeguroAquisicao(item.origem, "Não informada"),
            visitas: numeroAquisicao(item.visitas || item.sessoes),
            cliques: numeroAquisicao(item.cliques),
            carrinhos: numeroAquisicao(item.carrinhosAbertos),
            adicoes: numeroAquisicao(item.adicoesCarrinho),
            checkouts: numeroAquisicao(item.checkoutsIniciados),
            whatsapp: numeroAquisicao(item.pedidosWhatsapp),
            valor: numeroAquisicao(item.valorPedidosWhatsapp),
            compartilhamentos: numeroAquisicao(item.compartilhamentos)
        };
    }

    function criarEstilosAquisicao() {
        if (document.getElementById("vide-aquisicao-real-style")) return;

        var style = document.createElement("style");
        style.id = "vide-aquisicao-real-style";
        style.textContent = `
            #vide-aquisicao-real {
                position: relative;
                z-index: 1;
                margin-top: 18px;
                padding: 18px;
                overflow: hidden;
                border: 1px solid rgba(255,255,255,.075);
                border-radius: 20px;
                background:
                    radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--sys-destaque, #00f2fe) 10%, transparent), transparent 34%),
                    linear-gradient(145deg, rgba(8,14,28,.92), rgba(3,7,18,.78));
            }

            #vide-aquisicao-real * {
                box-sizing: border-box;
            }

            #vide-aquisicao-real .vide-aquisicao-header {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 16px;
                margin-bottom: 15px;
            }

            #vide-aquisicao-real .vide-aquisicao-title {
                display: flex;
                align-items: flex-start;
                gap: 11px;
                min-width: 0;
            }

            #vide-aquisicao-real .vide-aquisicao-icon {
                width: 40px;
                height: 40px;
                flex: 0 0 40px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                border: 1px solid color-mix(in srgb, var(--sys-destaque, #00f2fe) 24%, transparent);
                border-radius: 13px;
                color: color-mix(in srgb, var(--sys-destaque, #00f2fe) 82%, white 18%);
                background: color-mix(in srgb, var(--sys-destaque, #00f2fe) 8%, transparent);
            }

            #vide-aquisicao-real .vide-aquisicao-icon svg {
                width: 19px;
                height: 19px;
                fill: none;
                stroke: currentColor;
                stroke-width: 1.8;
                stroke-linecap: round;
                stroke-linejoin: round;
            }

            #vide-aquisicao-real .vide-aquisicao-title small {
                display: block;
                margin-bottom: 4px;
                color: #6b7280;
                font-size: 8px;
                font-weight: 900;
                letter-spacing: .16em;
                text-transform: uppercase;
            }

            #vide-aquisicao-real .vide-aquisicao-title h3 {
                margin: 0;
                color: #fff;
                font-size: 14px;
                font-weight: 900;
            }

            #vide-aquisicao-real .vide-aquisicao-title p {
                margin: 5px 0 0;
                color: #8b95a7;
                font-size: 10px;
                line-height: 1.55;
            }

            #vide-aquisicao-real .vide-aquisicao-status {
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

            #vide-aquisicao-real .vide-aquisicao-status::before {
                content: "";
                width: 7px;
                height: 7px;
                border-radius: 999px;
                background: #22c55e;
                box-shadow: 0 0 0 4px rgba(34,197,94,.1);
            }

            #vide-aquisicao-real .vide-aquisicao-resumo {
                display: grid;
                grid-template-columns: repeat(4, minmax(0, 1fr));
                gap: 10px;
                margin-bottom: 15px;
            }

            #vide-aquisicao-real .vide-aquisicao-kpi {
                min-width: 0;
                padding: 13px;
                border: 1px solid rgba(255,255,255,.065);
                border-radius: 14px;
                background: rgba(255,255,255,.027);
            }

            #vide-aquisicao-real .vide-aquisicao-kpi span {
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

            #vide-aquisicao-real .vide-aquisicao-kpi strong {
                display: block;
                overflow: hidden;
                margin-top: 8px;
                color: #fff;
                font-size: 15px;
                font-weight: 900;
                letter-spacing: -.025em;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            #vide-aquisicao-real .vide-aquisicao-kpi small {
                display: block;
                margin-top: 5px;
                color: #697386;
                font-size: 8px;
                line-height: 1.45;
            }

            #vide-aquisicao-real .vide-aquisicao-layout {
                display: grid;
                grid-template-columns: minmax(0, 1.05fr) minmax(340px, .95fr);
                gap: 14px;
            }

            #vide-aquisicao-real .vide-aquisicao-bloco {
                min-width: 0;
                padding: 15px;
                border: 1px solid rgba(255,255,255,.065);
                border-radius: 16px;
                background: rgba(3,7,18,.4);
            }

            #vide-aquisicao-real .vide-aquisicao-bloco-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                margin-bottom: 12px;
            }

            #vide-aquisicao-real .vide-aquisicao-bloco-header strong {
                color: #fff;
                font-size: 11px;
                font-weight: 900;
            }

            #vide-aquisicao-real .vide-aquisicao-bloco-header span {
                color: #6b7280;
                font-size: 8px;
                font-weight: 900;
                letter-spacing: .1em;
                text-transform: uppercase;
            }

            #vide-aquisicao-real .vide-origens-lista {
                display: grid;
                gap: 8px;
            }

            #vide-aquisicao-real .vide-origem-card {
                display: grid;
                grid-template-columns: 38px minmax(0, 1fr) auto;
                align-items: center;
                gap: 10px;
                min-width: 0;
                padding: 10px;
                border: 1px solid rgba(255,255,255,.055);
                border-radius: 13px;
                background: rgba(255,255,255,.024);
            }

            #vide-aquisicao-real .vide-origem-avatar {
                width: 38px;
                height: 38px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                border: 1px solid color-mix(in srgb, var(--sys-primaria, #6d5dfc) 32%, transparent);
                border-radius: 12px;
                color: #dbeafe;
                background: color-mix(in srgb, var(--sys-primaria, #6d5dfc) 13%, rgba(255,255,255,.02));
                font-size: 9px;
                font-weight: 900;
                letter-spacing: .04em;
            }

            #vide-aquisicao-real .vide-origem-info {
                min-width: 0;
            }

            #vide-aquisicao-real .vide-origem-info strong,
            #vide-aquisicao-real .vide-origem-info small {
                display: block;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            #vide-aquisicao-real .vide-origem-info strong {
                color: #f8fafc;
                font-size: 10px;
                font-weight: 900;
            }

            #vide-aquisicao-real .vide-origem-info small {
                margin-top: 4px;
                color: #6f7a8c;
                font-size: 8px;
            }

            #vide-aquisicao-real .vide-origem-resultados {
                display: grid;
                grid-template-columns: repeat(3, auto);
                align-items: center;
                gap: 12px;
                text-align: right;
            }

            #vide-aquisicao-real .vide-origem-metrica span,
            #vide-aquisicao-real .vide-origem-metrica strong {
                display: block;
            }

            #vide-aquisicao-real .vide-origem-metrica span {
                color: #687386;
                font-size: 7px;
                font-weight: 900;
                letter-spacing: .08em;
                text-transform: uppercase;
            }

            #vide-aquisicao-real .vide-origem-metrica strong {
                margin-top: 3px;
                color: #e5e7eb;
                font-size: 9px;
                font-weight: 900;
            }

            #vide-aquisicao-real .vide-campanhas-scroll {
                overflow-x: auto;
            }

            #vide-aquisicao-real .vide-campanhas-tabela {
                width: 100%;
                min-width: 590px;
                border-collapse: collapse;
            }

            #vide-aquisicao-real .vide-campanhas-tabela th {
                padding: 8px 7px;
                border-bottom: 1px solid rgba(255,255,255,.07);
                color: #657084;
                font-size: 7px;
                font-weight: 900;
                letter-spacing: .1em;
                text-align: left;
                text-transform: uppercase;
                white-space: nowrap;
            }

            #vide-aquisicao-real .vide-campanhas-tabela td {
                padding: 10px 7px;
                border-bottom: 1px solid rgba(255,255,255,.045);
                color: #cbd5e1;
                font-size: 8px;
                font-weight: 700;
                white-space: nowrap;
            }

            #vide-aquisicao-real .vide-campanhas-tabela tr:last-child td {
                border-bottom: 0;
            }

            #vide-aquisicao-real .vide-campanha-nome {
                max-width: 170px;
                overflow: hidden;
                color: #fff;
                font-weight: 900;
                text-overflow: ellipsis;
            }

            #vide-aquisicao-real .vide-aquisicao-empty {
                padding: 22px 15px;
                border: 1px dashed rgba(255,255,255,.08);
                border-radius: 13px;
                color: #667085;
                background: rgba(255,255,255,.015);
                font-size: 9px;
                line-height: 1.55;
                text-align: center;
            }

            #view-metricas .vide-origem-legada-oculta {
                display: none !important;
            }

            @media (max-width: 900px) {
                #vide-aquisicao-real .vide-aquisicao-resumo {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                }

                #vide-aquisicao-real .vide-aquisicao-layout {
                    grid-template-columns: 1fr;
                }
            }

            @media (max-width: 620px) {
                #vide-aquisicao-real {
                    padding: 15px;
                }

                #vide-aquisicao-real .vide-aquisicao-header {
                    flex-direction: column;
                }

                #vide-aquisicao-real .vide-aquisicao-status {
                    align-self: flex-start;
                }

                #vide-aquisicao-real .vide-aquisicao-resumo {
                    grid-template-columns: 1fr 1fr;
                }

                #vide-aquisicao-real .vide-origem-card {
                    grid-template-columns: 38px minmax(0, 1fr);
                }

                #vide-aquisicao-real .vide-origem-resultados {
                    grid-column: 1 / -1;
                    grid-template-columns: repeat(3, 1fr);
                    width: 100%;
                    padding-top: 9px;
                    border-top: 1px solid rgba(255,255,255,.05);
                    text-align: left;
                }
            }
        `;

        document.head.appendChild(style);
    }

    function ocultarOrigemLegada() {
        var view = document.getElementById("view-metricas");
        if (!view) return;

        var titulos = Array.from(
            view.querySelectorAll("h1, h2, h3, h4, strong")
        );

        var titulo = titulos.find(function(elemento) {
            if (elemento.closest("#vide-aquisicao-real")) return false;

            return textoSeguroAquisicao(elemento.textContent)
                .toLocaleLowerCase("pt-BR") === "origem de tráfego";
        });

        if (!titulo) return;

        var container = titulo.closest(
            ".glass-card, .layout-block, section, article"
        );

        if (
            container &&
            !container.closest("#vide-aquisicao-real") &&
            /Meta Ads/i.test(container.textContent || "") &&
            /Google/i.test(container.textContent || "") &&
            /TikTok/i.test(container.textContent || "") &&
            /Instagram/i.test(container.textContent || "")
        ) {
            container.classList.add("vide-origem-legada-oculta");
        }
    }

    function criarPainelAquisicao() {
        if (document.getElementById("vide-aquisicao-real")) return true;

        var funil = document.getElementById("vide-funil-loja-publica");
        if (!funil) return false;

        criarEstilosAquisicao();

        var painel = document.createElement("section");
        painel.id = "vide-aquisicao-real";
        painel.setAttribute(
            "aria-labelledby",
            "vide-aquisicao-real-titulo"
        );

        painel.innerHTML = `
            <div class="vide-aquisicao-header">
                <div class="vide-aquisicao-title">
                    <span class="vide-aquisicao-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="9"></circle>
                            <path d="M3 12h18"></path>
                            <path d="M12 3c2.5 2.7 3.8 5.7 3.8 9S14.5 18.3 12 21"></path>
                            <path d="M12 3C9.5 5.7 8.2 8.7 8.2 12S9.5 18.3 12 21"></path>
                        </svg>
                    </span>

                    <div>
                        <small>Aquisição de clientes</small>
                        <h3 id="vide-aquisicao-real-titulo">
                            Origem de tráfego e campanhas
                        </h3>
                        <p>
                            Identifique quais canais trazem visitas, pedidos e maior intenção de compra.
                        </p>
                    </div>
                </div>

                <span
                    class="vide-aquisicao-status"
                    id="vide-aquisicao-status"
                >
                    Carregando dados
                </span>
            </div>

            <div class="vide-aquisicao-resumo">
                <article class="vide-aquisicao-kpi">
                    <span>Principal origem</span>
                    <strong id="vide-aquisicao-principal">Sem dados</strong>
                    <small id="vide-aquisicao-principal-detalhe">
                        Aguardando visitas identificadas
                    </small>
                </article>

                <article class="vide-aquisicao-kpi">
                    <span>Visitas atribuídas</span>
                    <strong id="vide-aquisicao-visitas">0</strong>
                    <small>Todo o histórico identificado</small>
                </article>

                <article class="vide-aquisicao-kpi">
                    <span>WhatsApp por origem</span>
                    <strong id="vide-aquisicao-whatsapp">0</strong>
                    <small>Pedidos associados a um canal</small>
                </article>

                <article class="vide-aquisicao-kpi">
                    <span>Conversão atribuída</span>
                    <strong id="vide-aquisicao-conversao">0%</strong>
                    <small>Visita identificada → WhatsApp</small>
                </article>
            </div>

            <div class="vide-aquisicao-layout">
                <div class="vide-aquisicao-bloco">
                    <div class="vide-aquisicao-bloco-header">
                        <strong>Desempenho por origem</strong>
                        <span>Todo o período</span>
                    </div>

                    <div
                        class="vide-origens-lista"
                        id="vide-origens-lista"
                    >
                        <div class="vide-aquisicao-empty">
                            Carregando origens de tráfego...
                        </div>
                    </div>
                </div>

                <div class="vide-aquisicao-bloco">
                    <div class="vide-aquisicao-bloco-header">
                        <strong>Campanhas identificadas</strong>
                        <span id="vide-campanhas-total">0 campanhas</span>
                    </div>

                    <div
                        class="vide-campanhas-scroll"
                        id="vide-campanhas-container"
                    >
                        <div class="vide-aquisicao-empty">
                            Carregando campanhas...
                        </div>
                    </div>
                </div>
            </div>
        `;

        var produtos = funil.querySelector(
            ".vide-produtos-performance"
        );

        if (produtos) {
            funil.insertBefore(painel, produtos);
        } else {
            funil.appendChild(painel);
        }

        ocultarOrigemLegada();
        return true;
    }

    function atualizarTextoAquisicao(id, texto) {
        var elemento = document.getElementById(id);
        if (elemento) elemento.textContent = texto;
    }

    function criarMetricaOrigem(rotulo, valor) {
        var bloco = document.createElement("div");
        bloco.className = "vide-origem-metrica";

        var span = document.createElement("span");
        span.textContent = rotulo;

        var strong = document.createElement("strong");
        strong.textContent = valor;

        bloco.append(span, strong);
        return bloco;
    }

    function renderizarOrigensAquisicao(origens) {
        var lista = document.getElementById("vide-origens-lista");
        if (!lista) return;

        lista.replaceChildren();

        if (!origens.length) {
            var vazio = document.createElement("div");
            vazio.className = "vide-aquisicao-empty";
            vazio.textContent =
                "Ainda não existem visitas com origem identificada. " +
                "Use links com UTM ou divulgue a loja nas redes para começar a separar os canais.";
            lista.appendChild(vazio);
            return;
        }

        origens.slice(0, 8).forEach(function(item) {
            var card = document.createElement("article");
            card.className = "vide-origem-card";

            var avatar = document.createElement("span");
            avatar.className = "vide-origem-avatar";
            avatar.textContent = siglaAquisicao(item.nome);

            var info = document.createElement("div");
            info.className = "vide-origem-info";

            var nome = document.createElement("strong");
            nome.textContent = item.nome;

            var meio = document.createElement("small");
            meio.textContent =
                item.meio +
                " · " +
                formatarInteiroAquisicao(item.cliques) +
                " cliques";

            info.append(nome, meio);

            var resultados = document.createElement("div");
            resultados.className = "vide-origem-resultados";

            resultados.append(
                criarMetricaOrigem(
                    "Visitas",
                    formatarInteiroAquisicao(item.visitas)
                ),
                criarMetricaOrigem(
                    "WhatsApp",
                    formatarInteiroAquisicao(item.whatsapp)
                ),
                criarMetricaOrigem(
                    "Conversão",
                    formatarPercentualAquisicao(
                        percentualAquisicao(
                            item.whatsapp,
                            item.visitas
                        )
                    )
                )
            );

            card.append(avatar, info, resultados);
            lista.appendChild(card);
        });
    }

    function criarCelulaCampanha(texto, classe) {
        var td = document.createElement("td");
        td.textContent = texto;
        if (classe) td.className = classe;
        return td;
    }

    function renderizarCampanhasAquisicao(campanhas) {
        var container = document.getElementById(
            "vide-campanhas-container"
        );

        if (!container) return;

        atualizarTextoAquisicao(
            "vide-campanhas-total",
            campanhas.length +
                (campanhas.length === 1
                    ? " campanha"
                    : " campanhas")
        );

        container.replaceChildren();

        if (!campanhas.length) {
            var vazio = document.createElement("div");
            vazio.className = "vide-aquisicao-empty";
            vazio.textContent =
                "Nenhuma campanha UTM foi identificada ainda. " +
                "Acesse a loja usando utm_source, utm_medium e utm_campaign para acompanhar campanhas separadamente.";
            container.appendChild(vazio);
            return;
        }

        var tabela = document.createElement("table");
        tabela.className = "vide-campanhas-tabela";

        var thead = document.createElement("thead");
        var cabecalho = document.createElement("tr");

        [
            "Campanha",
            "Origem",
            "Visitas",
            "WhatsApp",
            "Conversão",
            "Valor potencial"
        ].forEach(function(rotulo) {
            var th = document.createElement("th");
            th.textContent = rotulo;
            cabecalho.appendChild(th);
        });

        thead.appendChild(cabecalho);

        var tbody = document.createElement("tbody");

        campanhas.slice(0, 10).forEach(function(item) {
            var linha = document.createElement("tr");

            linha.append(
                criarCelulaCampanha(
                    item.nome,
                    "vide-campanha-nome"
                ),
                criarCelulaCampanha(
                    item.origem + " · " + item.meio
                ),
                criarCelulaCampanha(
                    formatarInteiroAquisicao(item.visitas)
                ),
                criarCelulaCampanha(
                    formatarInteiroAquisicao(item.whatsapp)
                ),
                criarCelulaCampanha(
                    formatarPercentualAquisicao(
                        percentualAquisicao(
                            item.whatsapp,
                            item.visitas
                        )
                    )
                ),
                criarCelulaCampanha(
                    formatarMoedaAquisicao(item.valor)
                )
            );

            tbody.appendChild(linha);
        });

        tabela.append(thead, tbody);
        container.appendChild(tabela);
    }

    function renderizarAquisicao(dados) {
        dados = dados || {};

        var origens = Object.entries(dados.porOrigem || {})
            .map(function(par) {
                var item = dadosItemAquisicao(par[1]);
                item.chave = par[0];
                return item;
            })
            .filter(function(item) {
                return (
                    item.visitas > 0 ||
                    item.cliques > 0 ||
                    item.carrinhos > 0 ||
                    item.adicoes > 0 ||
                    item.checkouts > 0 ||
                    item.whatsapp > 0 ||
                    item.valor > 0
                );
            })
            .sort(function(a, b) {
                return (
                    b.visitas - a.visitas ||
                    b.whatsapp - a.whatsapp ||
                    b.valor - a.valor
                );
            });

        var campanhas = Object.entries(dados.porCampanha || {})
            .map(function(par) {
                var item = dadosItemAquisicao(par[1]);
                item.chave = par[0];
                item.nome = textoSeguroAquisicao(
                    par[1]?.nome,
                    "Campanha sem nome"
                );
                item.origem = textoSeguroAquisicao(
                    par[1]?.origem,
                    "Origem não informada"
                );
                return item;
            })
            .filter(function(item) {
                return (
                    item.visitas > 0 ||
                    item.cliques > 0 ||
                    item.checkouts > 0 ||
                    item.whatsapp > 0 ||
                    item.valor > 0
                );
            })
            .sort(function(a, b) {
                return (
                    b.whatsapp - a.whatsapp ||
                    b.visitas - a.visitas ||
                    b.valor - a.valor
                );
            });

        var totais = origens.reduce(
            function(total, item) {
                total.visitas += item.visitas;
                total.whatsapp += item.whatsapp;
                total.valor += item.valor;
                return total;
            },
            {
                visitas: 0,
                whatsapp: 0,
                valor: 0
            }
        );

        var principal = origens[0] || null;

        atualizarTextoAquisicao(
            "vide-aquisicao-principal",
            principal ? principal.nome : "Sem dados"
        );

        atualizarTextoAquisicao(
            "vide-aquisicao-principal-detalhe",
            principal
                ? formatarInteiroAquisicao(principal.visitas) +
                    (principal.visitas === 1
                        ? " visita identificada"
                        : " visitas identificadas")
                : "Aguardando visitas identificadas"
        );

        atualizarTextoAquisicao(
            "vide-aquisicao-visitas",
            formatarInteiroAquisicao(totais.visitas)
        );

        atualizarTextoAquisicao(
            "vide-aquisicao-whatsapp",
            formatarInteiroAquisicao(totais.whatsapp)
        );

        atualizarTextoAquisicao(
            "vide-aquisicao-conversao",
            formatarPercentualAquisicao(
                percentualAquisicao(
                    totais.whatsapp,
                    totais.visitas
                )
            )
        );

        atualizarTextoAquisicao(
            "vide-aquisicao-status",
            origens.length || campanhas.length
                ? "Dados sincronizados"
                : "Aguardando atribuição"
        );

        renderizarOrigensAquisicao(origens);
        renderizarCampanhasAquisicao(campanhas);
        ocultarOrigemLegada();
    }

    async function obterUsuarioAutenticado(authModulo, auth) {
        if (auth.currentUser) return auth.currentUser;

        return new Promise(function(resolve, reject) {
            var cancelar = authModulo.onAuthStateChanged(
                auth,
                function(usuario) {
                    cancelar();
                    if (usuario) {
                        resolve(usuario);
                    } else {
                        reject(
                            new Error(
                                "Sessão não autenticada."
                            )
                        );
                    }
                },
                function(erro) {
                    cancelar();
                    reject(erro);
                }
            );
        });
    }

    async function resolverTenantAquisicao(
        firebase,
        firestore,
        authModulo
    ) {
        var masterUid = new URLSearchParams(
            window.location.search
        ).get("masterUID");

        if (masterUid) {
            return String(masterUid).trim();
        }

        var usuario = await obterUsuarioAutenticado(
            authModulo,
            firebase.auth
        );

        try {
            var funcionarioSnap = await firestore.getDoc(
                firestore.doc(
                    firebase.db,
                    "funcionarios",
                    usuario.uid
                )
            );

            if (
                funcionarioSnap.exists() &&
                funcionarioSnap.data()?.donoUID
            ) {
                return String(
                    funcionarioSnap.data().donoUID
                ).trim();
            }
        } catch (erro) {
            console.warn(
                "[Vide Hub] Vínculo de funcionário não consultado:",
                erro?.message || erro
            );
        }

        return usuario.uid;
    }

    async function conectarAquisicao() {
        if (conexaoIniciada) return;
        if (!criarPainelAquisicao()) return;

        conexaoIniciada = true;

        var status = document.getElementById(
            "vide-aquisicao-status"
        );

        try {
            var modulos = await Promise.all([
                import("./firebase-init.js"),
                import(
                    "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
                ),
                import(
                    "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js"
                )
            ]);

            var firebase = modulos[0];
            var firestore = modulos[1];
            var authModulo = modulos[2];

            var tenantUid = await resolverTenantAquisicao(
                firebase,
                firestore,
                authModulo
            );

            if (!tenantUid) {
                throw new Error(
                    "Não foi possível identificar a loja ativa."
                );
            }

            if (typeof desinscreverAquisicao === "function") {
                desinscreverAquisicao();
            }

            desinscreverAquisicao = firestore.onSnapshot(
                firestore.doc(
                    firebase.db,
                    "metricas_vitrines",
                    tenantUid
                ),
                function(snapshot) {
                function(snapshot) {
                    var dadosAquisicao = snapshot.exists()
                        ? snapshot.data() || {}
                        : {};

                    window.__VIDE_METRICAS_VITRINE_DADOS__ =
                        dadosAquisicao;

                    var assinaturaAquisicao = JSON.stringify([
                        dadosAquisicao.porOrigem || {},
                        dadosAquisicao.porCampanha || {}
                    ]);

                    if (
                        window.__VIDE_AQUISICAO_ASSINATURA__ ===
                        assinaturaAquisicao
                    ) {
                        return;
                    }

                    window.__VIDE_AQUISICAO_ASSINATURA__ =
                        assinaturaAquisicao;

                    window.dispatchEvent(
                        new CustomEvent(
                            "vide:metricas-vitrine",
                            {
                                detail: dadosAquisicao
                            }
                        )
                    );

                    if (
                        window.__VIDE_AQUISICAO_FRAME__
                    ) {
                        cancelAnimationFrame(
                            window.__VIDE_AQUISICAO_FRAME__
                        );
                    }

                    window.__VIDE_AQUISICAO_FRAME__ =
                        requestAnimationFrame(function() {
                            renderizarAquisicao(
                                dadosAquisicao
                            );

                            window.__VIDE_AQUISICAO_FRAME__ =
                                null;
                        });
                },

                function(erro) {
                    console.error(
                        "[Vide Hub] Erro ao carregar aquisição:",
                        erro
                    );

                    if (status) {
                        status.textContent =
                            erro?.code === "permission-denied"
                                ? "Sem permissão"
                                : "Falha ao sincronizar";
                    }
                }
            );
        } catch (erro) {
            conexaoIniciada = false;

            console.error(
                "[Vide Hub] Erro ao iniciar aquisição:",
                erro
            );

            if (status) {
                status.textContent =
                    "Não foi possível carregar";
            }
        }
    }

    function inicializarAquisicaoDashboard() {
        var tentativas = 0;

        var intervalo = setInterval(function() {
            tentativas += 1;

            if (criarPainelAquisicao()) {
                clearInterval(intervalo);
                conectarAquisicao();
                return;
            }

            if (tentativas >= 60) {
                clearInterval(intervalo);
                console.warn(
                    "[Vide Hub] Área de métricas não encontrada para inserir aquisição."
                );
            }
        }, 180);
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            inicializarAquisicaoDashboard,
            { once: true }
        );
    } else {
        inicializarAquisicaoDashboard();
    }
})();

/* =========================================================
   VIDE HUB — GERADOR DE LINKS RASTREÁVEIS
   Complementa o painel de origem e campanhas.
   ========================================================= */
(function() {
    "use strict";

    var GERADOR_STORAGE_PREFIX = "videLinksCampanha_";
    var geradorInicializado = false;

    function textoGerador(valor) {
        return String(valor || "").replace(/\s+/g, " ").trim();
    }

    function normalizarUtm(valor) {
        return textoGerador(valor)
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "")
            .slice(0, 80);
    }

    function obterPerfilLocalGerador() {
        try {
            var chave =
                new URLSearchParams(window.location.search)
                    .get("masterUID") || "own";

            return JSON.parse(
                localStorage.getItem(
                    "ultimoPerfilLoja_" + chave
                ) || "null"
            );
        } catch (erro) {
            return null;
        }
    }

    function obterSlugGerador() {
        var candidatos = [
            document.getElementById("perf-slug")?.value,
            obterPerfilLocalGerador()?.urlLoja
        ];

        var links = [
            document.getElementById("link-minha-loja"),
            document.getElementById("link-minha-loja-cockpit")
        ];

        links.forEach(function(link) {
            if (!link) return;

            try {
                var url = new URL(
                    link.getAttribute("href") || link.href,
                    window.location.href
                );

                candidatos.push(
                    url.searchParams.get("loja")
                );
            } catch (erro) {
                return;
            }
        });

        return candidatos
            .map(normalizarUtm)
            .find(Boolean) || "";
    }

    function obterUrlBaseGerador() {
        var links = [
            document.getElementById("link-minha-loja"),
            document.getElementById("link-minha-loja-cockpit")
        ];

        for (var indice = 0; indice < links.length; indice++) {
            var link = links[indice];
            if (!link) continue;

            try {
                var href =
                    link.getAttribute("href") ||
                    link.href;

                if (
                    !href ||
                    href === "#" ||
                    href.startsWith("javascript:")
                ) {
                    continue;
                }

                var url = new URL(
                    href,
                    window.location.href
                );

                if (
                    url.pathname.includes("loja.html") &&
                    url.searchParams.get("loja")
                ) {
                    url.hash = "";
                    [
                        "utm_source",
                        "utm_medium",
                        "utm_campaign",
                        "utm_content",
                        "utm_term"
                    ].forEach(function(chave) {
                        url.searchParams.delete(chave);
                    });

                    return url;
                }
            } catch (erro) {
                continue;
            }
        }

        var slug = obterSlugGerador();
        if (!slug) return null;

        var fallback = new URL(
            "loja.html",
            window.location.href
        );

        fallback.searchParams.set("loja", slug);
        return fallback;
    }

    function chaveHistoricoGerador() {
        return (
            GERADOR_STORAGE_PREFIX +
            (obterSlugGerador() || "loja")
        );
    }

    function lerHistoricoGerador() {
        try {
            var dados = JSON.parse(
                localStorage.getItem(
                    chaveHistoricoGerador()
                ) || "[]"
            );

            return Array.isArray(dados)
                ? dados.slice(0, 8)
                : [];
        } catch (erro) {
            return [];
        }
    }

    function salvarHistoricoGerador(lista) {
        try {
            localStorage.setItem(
                chaveHistoricoGerador(),
                JSON.stringify(
                    lista.slice(0, 8)
                )
            );
        } catch (erro) {
            console.warn(
                "[Vide Hub] Não foi possível salvar o histórico de campanhas.",
                erro
            );
        }
    }

    function mensagemGerador(texto, estado) {
        var elemento = document.getElementById(
            "vide-gerador-status"
        );

        if (!elemento) return;

        elemento.textContent = texto;
        elemento.dataset.state = estado || "neutral";
    }

    async function copiarTextoGerador(texto) {
        if (
            navigator.clipboard &&
            window.isSecureContext
        ) {
            await navigator.clipboard.writeText(texto);
            return;
        }

        var area = document.createElement("textarea");
        area.value = texto;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();

        var copiado = document.execCommand("copy");
        area.remove();

        if (!copiado) {
            throw new Error(
                "O navegador bloqueou a cópia automática."
            );
        }
    }

    function configurarMeioPorOrigem() {
        var origem = document.getElementById(
            "vide-gerador-origem"
        );

        var meio = document.getElementById(
            "vide-gerador-meio"
        );

        if (!origem || !meio) return;

        var sugestoes = {
            instagram: "social",
            facebook: "social",
            tiktok: "social",
            youtube: "social",
            linkedin: "social",
            google: "cpc",
            whatsapp: "messaging",
            email: "email",
            qr_code: "qr_code",
            outro: "referral"
        };

        meio.value =
            sugestoes[origem.value] ||
            meio.value ||
            "social";

        var custom = document.getElementById(
            "vide-gerador-origem-custom"
        );

        if (custom) {
            custom.hidden = origem.value !== "outro";
            if (!custom.hidden) {
                custom.focus();
            }
        }
    }

    function obterDadosFormularioGerador() {
        var origemSelecionada =
            document.getElementById(
                "vide-gerador-origem"
            )?.value || "";

        var origem =
            origemSelecionada === "outro"
                ? document.getElementById(
                    "vide-gerador-origem-custom-input"
                )?.value
                : origemSelecionada;

        return {
            origem: normalizarUtm(origem),
            meio: normalizarUtm(
                document.getElementById(
                    "vide-gerador-meio"
                )?.value
            ),
            campanha: normalizarUtm(
                document.getElementById(
                    "vide-gerador-campanha"
                )?.value
            ),
            conteudo: normalizarUtm(
                document.getElementById(
                    "vide-gerador-conteudo"
                )?.value
            )
        };
    }

    function montarLinkGerador(silencioso) {
        var base = obterUrlBaseGerador();
        var dados = obterDadosFormularioGerador();
        var campo = document.getElementById(
            "vide-gerador-link"
        );

        if (!base) {
            if (!silencioso) {
                mensagemGerador(
                    "Salve o slug da loja antes de gerar o link.",
                    "error"
                );
            }
            if (campo) campo.value = "";
            return "";
        }

        if (
            !dados.origem ||
            !dados.meio ||
            !dados.campanha
        ) {
            if (!silencioso) {
                mensagemGerador(
                    "Preencha origem, meio e nome da campanha.",
                    "error"
                );
            }
            if (campo) campo.value = "";
            return "";
        }

        base.searchParams.set(
            "utm_source",
            dados.origem
        );

        base.searchParams.set(
            "utm_medium",
            dados.meio
        );

        base.searchParams.set(
            "utm_campaign",
            dados.campanha
        );

        if (dados.conteudo) {
            base.searchParams.set(
                "utm_content",
                dados.conteudo
            );
        } else {
            base.searchParams.delete(
                "utm_content"
            );
        }

        var link = base.toString();

        if (campo) {
            campo.value = link;
        }

        if (!silencioso) {
            mensagemGerador(
                "Link rastreável gerado.",
                "success"
            );
        }

        return link;
    }

    function registrarLinkGerador() {
        var link = montarLinkGerador(false);
        if (!link) return "";

        var dados = obterDadosFormularioGerador();
        var historico = lerHistoricoGerador();

        historico = historico.filter(
            function(item) {
                return item.link !== link;
            }
        );

        historico.unshift({
            link: link,
            origem: dados.origem,
            meio: dados.meio,
            campanha: dados.campanha,
            conteudo: dados.conteudo,
            criadoEm: Date.now()
        });

        salvarHistoricoGerador(historico);
        renderizarHistoricoGerador();

        return link;
    }

    function criarBotaoHistoricoGerador(
        rotulo,
        titulo,
        callback
    ) {
        var botao = document.createElement("button");
        botao.type = "button";
        botao.className =
            "vide-gerador-historico-acao";
        botao.textContent = rotulo;
        botao.title = titulo;
        botao.addEventListener("click", callback);
        return botao;
    }

    function renderizarHistoricoGerador() {
        var lista = document.getElementById(
            "vide-gerador-historico-lista"
        );

        var contador = document.getElementById(
            "vide-gerador-historico-total"
        );

        if (!lista) return;

        var historico = lerHistoricoGerador();
        lista.replaceChildren();

        if (contador) {
            contador.textContent =
                historico.length +
                (historico.length === 1
                    ? " link"
                    : " links");
        }

        if (!historico.length) {
            var vazio = document.createElement("div");
            vazio.className =
                "vide-gerador-historico-vazio";
            vazio.textContent =
                "Os últimos links gerados aparecerão aqui.";
            lista.appendChild(vazio);
            return;
        }

        historico.forEach(function(item, indice) {
            var card = document.createElement("article");
            card.className =
                "vide-gerador-historico-item";

            var copia = document.createElement("div");
            copia.className =
                "vide-gerador-historico-copia";

            var titulo = document.createElement("strong");
            titulo.textContent =
                item.campanha ||
                "Campanha sem nome";

            var meta = document.createElement("small");
            meta.textContent =
                (item.origem || "origem") +
                " · " +
                (item.meio || "meio");

            var url = document.createElement("span");
            url.textContent = item.link;
            url.title = item.link;

            copia.append(titulo, meta, url);

            var acoes = document.createElement("div");
            acoes.className =
                "vide-gerador-historico-acoes";

            acoes.append(
                criarBotaoHistoricoGerador(
                    "Copiar",
                    "Copiar link",
                    async function() {
                        try {
                            await copiarTextoGerador(
                                item.link
                            );

                            mensagemGerador(
                                "Link copiado.",
                                "success"
                            );
                        } catch (erro) {
                            mensagemGerador(
                                erro.message ||
                                    "Não foi possível copiar.",
                                "error"
                            );
                        }
                    }
                ),
                criarBotaoHistoricoGerador(
                    "Abrir",
                    "Abrir link em nova aba",
                    function() {
                        window.open(
                            item.link,
                            "_blank",
                            "noopener,noreferrer"
                        );
                    }
                ),
                criarBotaoHistoricoGerador(
                    "Excluir",
                    "Remover do histórico",
                    function() {
                        var atual =
                            lerHistoricoGerador();

                        atual.splice(indice, 1);
                        salvarHistoricoGerador(atual);
                        renderizarHistoricoGerador();

                        mensagemGerador(
                            "Link removido do histórico.",
                            "neutral"
                        );
                    }
                )
            );

            card.append(copia, acoes);
            lista.appendChild(card);
        });
    }

    function inserirEstilosGerador() {
        if (
            document.getElementById(
                "vide-gerador-campanhas-style"
            )
        ) {
            return;
        }

        var style = document.createElement("style");
        style.id = "vide-gerador-campanhas-style";

        style.textContent = `
            #vide-gerador-campanhas {
                margin-bottom: 15px;
                padding: 16px;
                border: 1px solid rgba(255,255,255,.07);
                border-radius: 17px;
                background:
                    linear-gradient(
                        135deg,
                        color-mix(in srgb, var(--sys-primaria, #6d5dfc) 8%, rgba(3,7,18,.52)),
                        rgba(3,7,18,.48)
                    );
            }

            #vide-gerador-campanhas * {
                box-sizing: border-box;
            }

            #vide-gerador-campanhas .vide-gerador-header {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 14px;
                margin-bottom: 14px;
            }

            #vide-gerador-campanhas .vide-gerador-titulo {
                display: flex;
                align-items: flex-start;
                gap: 10px;
                min-width: 0;
            }

            #vide-gerador-campanhas .vide-gerador-icone {
                width: 36px;
                height: 36px;
                flex: 0 0 36px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                border: 1px solid color-mix(in srgb, var(--sys-primaria, #6d5dfc) 28%, transparent);
                border-radius: 11px;
                color: #ddd6fe;
                background: color-mix(in srgb, var(--sys-primaria, #6d5dfc) 11%, transparent);
            }

            #vide-gerador-campanhas .vide-gerador-icone svg {
                width: 17px;
                height: 17px;
                fill: none;
                stroke: currentColor;
                stroke-width: 1.9;
                stroke-linecap: round;
                stroke-linejoin: round;
            }

            #vide-gerador-campanhas .vide-gerador-titulo small {
                display: block;
                margin-bottom: 3px;
                color: #6b7280;
                font-size: 7px;
                font-weight: 900;
                letter-spacing: .15em;
                text-transform: uppercase;
            }

            #vide-gerador-campanhas .vide-gerador-titulo strong {
                display: block;
                color: #fff;
                font-size: 12px;
                font-weight: 900;
            }

            #vide-gerador-campanhas .vide-gerador-titulo p {
                margin: 4px 0 0;
                color: #7d8798;
                font-size: 9px;
                line-height: 1.5;
            }

            #vide-gerador-campanhas .vide-gerador-status {
                flex: 0 0 auto;
                display: inline-flex;
                align-items: center;
                min-height: 28px;
                max-width: 240px;
                padding: 0 10px;
                overflow: hidden;
                border: 1px solid rgba(255,255,255,.08);
                border-radius: 999px;
                color: #94a3b8;
                background: rgba(255,255,255,.035);
                font-size: 8px;
                font-weight: 900;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            #vide-gerador-campanhas .vide-gerador-status[data-state="success"] {
                color: #86efac;
                border-color: rgba(34,197,94,.2);
                background: rgba(34,197,94,.06);
            }

            #vide-gerador-campanhas .vide-gerador-status[data-state="error"] {
                color: #fda4af;
                border-color: rgba(244,63,94,.2);
                background: rgba(244,63,94,.06);
            }

            #vide-gerador-campanhas .vide-gerador-form {
                display: grid;
                grid-template-columns: repeat(4, minmax(0, 1fr));
                gap: 10px;
            }

            #vide-gerador-campanhas .vide-gerador-campo {
                display: grid;
                gap: 6px;
                min-width: 0;
            }

            #vide-gerador-campanhas .vide-gerador-campo > span {
                color: #737e91;
                font-size: 7px;
                font-weight: 900;
                letter-spacing: .1em;
                text-transform: uppercase;
            }

            #vide-gerador-campanhas .vide-gerador-input {
                width: 100%;
                min-height: 39px;
                padding: 0 11px;
                border: 1px solid rgba(255,255,255,.075);
                border-radius: 11px;
                outline: 0;
                color: #f8fafc;
                background: rgba(0,0,0,.22);
                font: inherit;
                font-size: 9px;
                transition:
                    border-color .18s ease,
                    background .18s ease;
            }

            #vide-gerador-campanhas textarea.vide-gerador-input {
                min-height: 66px;
                padding-top: 10px;
                padding-bottom: 10px;
                resize: vertical;
                line-height: 1.45;
            }

            #vide-gerador-campanhas .vide-gerador-input:focus {
                border-color: color-mix(in srgb, var(--sys-destaque, #00f2fe) 42%, transparent);
                background: rgba(0,0,0,.34);
            }

            #vide-gerador-campanhas .vide-gerador-origem-custom {
                grid-column: span 1;
            }

            #vide-gerador-campanhas .vide-gerador-saida {
                display: grid;
                grid-template-columns: minmax(0, 1fr) auto;
                align-items: end;
                gap: 10px;
                margin-top: 10px;
            }

            #vide-gerador-campanhas .vide-gerador-acoes {
                display: flex;
                flex-wrap: wrap;
                gap: 7px;
            }

            #vide-gerador-campanhas .vide-gerador-botao {
                min-height: 38px;
                padding: 0 12px;
                border: 1px solid rgba(255,255,255,.08);
                border-radius: 11px;
                color: #d7deea;
                background: rgba(255,255,255,.045);
                font-size: 8px;
                font-weight: 900;
                cursor: pointer;
                transition:
                    transform .18s ease,
                    border-color .18s ease,
                    background .18s ease;
            }

            #vide-gerador-campanhas .vide-gerador-botao:hover {
                transform: translateY(-1px);
                border-color: rgba(255,255,255,.15);
                background: rgba(255,255,255,.075);
            }

            #vide-gerador-campanhas .vide-gerador-botao.is-primary {
                border-color: color-mix(in srgb, var(--sys-destaque, #00f2fe) 28%, transparent);
                color: #fff;
                background:
                    linear-gradient(
                        135deg,
                        var(--sys-primaria, #6d5dfc),
                        var(--sys-destaque, #00f2fe)
                    );
            }

            #vide-gerador-campanhas .vide-gerador-historico {
                margin-top: 13px;
                padding-top: 13px;
                border-top: 1px solid rgba(255,255,255,.06);
            }

            #vide-gerador-campanhas .vide-gerador-historico-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                margin-bottom: 9px;
            }

            #vide-gerador-campanhas .vide-gerador-historico-header strong {
                color: #fff;
                font-size: 9px;
                font-weight: 900;
            }

            #vide-gerador-campanhas .vide-gerador-historico-header span {
                color: #697386;
                font-size: 7px;
                font-weight: 900;
                letter-spacing: .1em;
                text-transform: uppercase;
            }

            #vide-gerador-campanhas .vide-gerador-historico-lista {
                display: grid;
                gap: 7px;
            }

            #vide-gerador-campanhas .vide-gerador-historico-item {
                display: grid;
                grid-template-columns: minmax(0, 1fr) auto;
                align-items: center;
                gap: 10px;
                padding: 9px 10px;
                border: 1px solid rgba(255,255,255,.05);
                border-radius: 11px;
                background: rgba(255,255,255,.022);
            }

            #vide-gerador-campanhas .vide-gerador-historico-copia {
                min-width: 0;
            }

            #vide-gerador-campanhas .vide-gerador-historico-copia strong,
            #vide-gerador-campanhas .vide-gerador-historico-copia small,
            #vide-gerador-campanhas .vide-gerador-historico-copia span {
                display: block;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            #vide-gerador-campanhas .vide-gerador-historico-copia strong {
                color: #f8fafc;
                font-size: 9px;
                font-weight: 900;
            }

            #vide-gerador-campanhas .vide-gerador-historico-copia small {
                margin-top: 3px;
                color: #7d8798;
                font-size: 7px;
            }

            #vide-gerador-campanhas .vide-gerador-historico-copia span {
                margin-top: 4px;
                color: #5f6a7c;
                font-size: 7px;
            }

            #vide-gerador-campanhas .vide-gerador-historico-acoes {
                display: flex;
                flex-wrap: wrap;
                justify-content: flex-end;
                gap: 5px;
            }

            #vide-gerador-campanhas .vide-gerador-historico-acao {
                min-height: 27px;
                padding: 0 8px;
                border: 1px solid rgba(255,255,255,.07);
                border-radius: 8px;
                color: #aeb8c7;
                background: rgba(255,255,255,.035);
                font-size: 7px;
                font-weight: 900;
                cursor: pointer;
            }

            #vide-gerador-campanhas .vide-gerador-historico-vazio {
                padding: 14px;
                border: 1px dashed rgba(255,255,255,.07);
                border-radius: 11px;
                color: #657084;
                font-size: 8px;
                text-align: center;
            }

            @media (max-width: 900px) {
                #vide-gerador-campanhas .vide-gerador-form {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                }

                #vide-gerador-campanhas .vide-gerador-saida {
                    grid-template-columns: 1fr;
                }
            }

            @media (max-width: 620px) {
                #vide-gerador-campanhas .vide-gerador-header {
                    flex-direction: column;
                }

                #vide-gerador-campanhas .vide-gerador-status {
                    align-self: flex-start;
                    max-width: 100%;
                }

                #vide-gerador-campanhas .vide-gerador-form {
                    grid-template-columns: 1fr;
                }

                #vide-gerador-campanhas .vide-gerador-historico-item {
                    grid-template-columns: 1fr;
                }

                #vide-gerador-campanhas .vide-gerador-historico-acoes {
                    justify-content: flex-start;
                }
            }
        `;

        document.head.appendChild(style);
    }

    function criarGeradorCampanhas() {
        if (
            document.getElementById(
                "vide-gerador-campanhas"
            )
        ) {
            return true;
        }

        var painel = document.getElementById(
            "vide-aquisicao-real"
        );

        var resumo = painel?.querySelector(
            ".vide-aquisicao-resumo"
        );

        if (!painel || !resumo) return false;

        inserirEstilosGerador();

        var gerador = document.createElement("section");
        gerador.id = "vide-gerador-campanhas";
        gerador.setAttribute(
            "aria-labelledby",
            "vide-gerador-titulo"
        );

        gerador.innerHTML = `
            <div class="vide-gerador-header">
                <div class="vide-gerador-titulo">
                    <span class="vide-gerador-icone" aria-hidden="true">
                        <svg viewBox="0 0 24 24">
                            <path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"></path>
                            <path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"></path>
                        </svg>
                    </span>

                    <div>
                        <small>Ferramenta de divulgação</small>
                        <strong id="vide-gerador-titulo">
                            Gerador de links rastreáveis
                        </strong>
                        <p>
                            Crie links com identificação de canal e campanha para descobrir de onde chegam as vendas.
                        </p>
                    </div>
                </div>

                <span
                    class="vide-gerador-status"
                    id="vide-gerador-status"
                    data-state="neutral"
                >
                    Preencha os campos
                </span>
            </div>

            <div class="vide-gerador-form">
                <label class="vide-gerador-campo">
                    <span>Origem</span>
                    <select
                        id="vide-gerador-origem"
                        class="vide-gerador-input"
                    >
                        <option value="instagram">Instagram</option>
                        <option value="facebook">Facebook</option>
                        <option value="tiktok">TikTok</option>
                        <option value="google">Google</option>
                        <option value="youtube">YouTube</option>
                        <option value="whatsapp">WhatsApp</option>
                        <option value="email">E-mail</option>
                        <option value="linkedin">LinkedIn</option>
                        <option value="qr_code">QR Code</option>
                        <option value="outro">Outra origem</option>
                    </select>
                </label>

                <label
                    class="vide-gerador-campo vide-gerador-origem-custom"
                    id="vide-gerador-origem-custom"
                    hidden
                >
                    <span>Nome da origem</span>
                    <input
                        type="text"
                        class="vide-gerador-input"
                        id="vide-gerador-origem-custom-input"
                        maxlength="80"
                        placeholder="Ex.: parceiro_local"
                    >
                </label>

                <label class="vide-gerador-campo">
                    <span>Meio</span>
                    <select
                        id="vide-gerador-meio"
                        class="vide-gerador-input"
                    >
                        <option value="social">Rede social</option>
                        <option value="paid_social">Anúncio em rede social</option>
                        <option value="cpc">Anúncio de busca / CPC</option>
                        <option value="organic">Busca orgânica</option>
                        <option value="messaging">Mensagem / WhatsApp</option>
                        <option value="email">E-mail</option>
                        <option value="qr_code">QR Code</option>
                        <option value="referral">Indicação / parceiro</option>
                    </select>
                </label>

                <label class="vide-gerador-campo">
                    <span>Nome da campanha</span>
                    <input
                        type="text"
                        class="vide-gerador-input"
                        id="vide-gerador-campanha"
                        maxlength="80"
                        placeholder="Ex.: lancamento_julho"
                    >
                </label>

                <label class="vide-gerador-campo">
                    <span>Conteúdo opcional</span>
                    <input
                        type="text"
                        class="vide-gerador-input"
                        id="vide-gerador-conteudo"
                        maxlength="80"
                        placeholder="Ex.: story_01"
                    >
                </label>
            </div>

            <div class="vide-gerador-saida">
                <label class="vide-gerador-campo">
                    <span>Link gerado</span>
                    <textarea
                        id="vide-gerador-link"
                        class="vide-gerador-input"
                        readonly
                        placeholder="O link rastreável aparecerá aqui."
                    ></textarea>
                </label>

                <div class="vide-gerador-acoes">
                    <button
                        type="button"
                        class="vide-gerador-botao is-primary"
                        id="vide-gerador-criar"
                    >
                        Gerar link
                    </button>

                    <button
                        type="button"
                        class="vide-gerador-botao"
                        id="vide-gerador-copiar"
                    >
                        Copiar
                    </button>

                    <button
                        type="button"
                        class="vide-gerador-botao"
                        id="vide-gerador-abrir"
                    >
                        Abrir
                    </button>

                    <button
                        type="button"
                        class="vide-gerador-botao"
                        id="vide-gerador-compartilhar"
                    >
                        Compartilhar
                    </button>
                </div>
            </div>

            <div class="vide-gerador-historico">
                <div class="vide-gerador-historico-header">
                    <strong>Links recentes</strong>
                    <span id="vide-gerador-historico-total">
                        0 links
                    </span>
                </div>

                <div
                    class="vide-gerador-historico-lista"
                    id="vide-gerador-historico-lista"
                ></div>
            </div>
        `;

        painel.insertBefore(gerador, resumo);
        return true;
    }

    function conectarEventosGerador() {
        if (geradorInicializado) return;
        if (!criarGeradorCampanhas()) return;

        geradorInicializado = true;

        var origem = document.getElementById(
            "vide-gerador-origem"
        );

        var custom = document.getElementById(
            "vide-gerador-origem-custom-input"
        );

        var meio = document.getElementById(
            "vide-gerador-meio"
        );

        var campanha = document.getElementById(
            "vide-gerador-campanha"
        );

        var conteudo = document.getElementById(
            "vide-gerador-conteudo"
        );

        origem?.addEventListener(
            "change",
            function() {
                configurarMeioPorOrigem();
                montarLinkGerador(true);
            }
        );

        [custom, meio, campanha, conteudo]
            .filter(Boolean)
            .forEach(function(campo) {
                campo.addEventListener(
                    "input",
                    function() {
                        montarLinkGerador(true);
                    }
                );

                campo.addEventListener(
                    "change",
                    function() {
                        montarLinkGerador(true);
                    }
                );
            });

        document.getElementById(
            "vide-gerador-criar"
        )?.addEventListener(
            "click",
            registrarLinkGerador
        );

        document.getElementById(
            "vide-gerador-copiar"
        )?.addEventListener(
            "click",
            async function() {
                var link =
                    document.getElementById(
                        "vide-gerador-link"
                    )?.value ||
                    registrarLinkGerador();

                if (!link) return;

                try {
                    await copiarTextoGerador(link);

                    mensagemGerador(
                        "Link copiado para a área de transferência.",
                        "success"
                    );
                } catch (erro) {
                    mensagemGerador(
                        erro.message ||
                            "Não foi possível copiar.",
                        "error"
                    );
                }
            }
        );

        document.getElementById(
            "vide-gerador-abrir"
        )?.addEventListener(
            "click",
            function() {
                var link =
                    document.getElementById(
                        "vide-gerador-link"
                    )?.value ||
                    registrarLinkGerador();

                if (!link) return;

                window.open(
                    link,
                    "_blank",
                    "noopener,noreferrer"
                );

                mensagemGerador(
                    "Link aberto em uma nova aba.",
                    "success"
                );
            }
        );

        document.getElementById(
            "vide-gerador-compartilhar"
        )?.addEventListener(
            "click",
            async function() {
                var link =
                    document.getElementById(
                        "vide-gerador-link"
                    )?.value ||
                    registrarLinkGerador();

                if (!link) return;

                try {
                    if (navigator.share) {
                        await navigator.share({
                            title: "Conheça nossa loja",
                            text: "Acesse nossa loja pelo link:",
                            url: link
                        });

                        mensagemGerador(
                            "Link compartilhado.",
                            "success"
                        );
                    } else {
                        await copiarTextoGerador(link);

                        mensagemGerador(
                            "Compartilhamento não disponível. Link copiado.",
                            "success"
                        );
                    }
                } catch (erro) {
                    if (erro?.name === "AbortError") {
                        mensagemGerador(
                            "Compartilhamento cancelado.",
                            "neutral"
                        );
                        return;
                    }

                    mensagemGerador(
                        "Não foi possível compartilhar o link.",
                        "error"
                    );
                }
            }
        );

        configurarMeioPorOrigem();
        renderizarHistoricoGerador();
    }

    function inicializarGeradorCampanhas() {
        var tentativas = 0;

        var intervalo = setInterval(function() {
            tentativas += 1;

            if (criarGeradorCampanhas()) {
                clearInterval(intervalo);
                conectarEventosGerador();
                return;
            }

            if (tentativas >= 80) {
                clearInterval(intervalo);

                console.warn(
                    "[Vide Hub] O painel de aquisição não foi encontrado para inserir o gerador de links."
                );
            }
        }, 180);
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            inicializarGeradorCampanhas,
            { once: true }
        );
    } else {
        inicializarGeradorCampanhas();
    }
})();

/* =========================================================
   VIDE HUB — DIAGNÓSTICO INTELIGENTE DE AQUISIÇÃO
   Analisa origens e campanhas já registradas.
   ========================================================= */
(function() {
    "use strict";

    var diagnosticoAquisicaoIniciado = false;
    var diagnosticoAquisicaoDesinscrever = null;

    function numeroDiagnosticoAquisicao(valor) {
        var numero = Number(valor || 0);
        return Number.isFinite(numero)
            ? Math.max(0, numero)
            : 0;
    }

    function percentualDiagnosticoAquisicao(parte, total) {
        parte = numeroDiagnosticoAquisicao(parte);
        total = numeroDiagnosticoAquisicao(total);

        if (!total) return 0;
        return Math.max(0, (parte / total) * 100);
    }

    function textoDiagnosticoAquisicao(valor, fallback) {
        var texto = String(valor || "")
            .replace(/\s+/g, " ")
            .trim();

        return texto || fallback || "";
    }

    function formatarInteiroDiagnosticoAquisicao(valor) {
        return new Intl.NumberFormat("pt-BR").format(
            Math.round(
                numeroDiagnosticoAquisicao(valor)
            )
        );
    }

    function formatarPercentualDiagnosticoAquisicao(valor) {
        var numero = numeroDiagnosticoAquisicao(valor);

        return numero.toLocaleString("pt-BR", {
            minimumFractionDigits:
                numero > 0 && numero < 10 ? 1 : 0,
            maximumFractionDigits: 1
        }) + "%";
    }

    function formatarMoedaDiagnosticoAquisicao(valor) {
        return new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL"
        }).format(
            numeroDiagnosticoAquisicao(valor)
        );
    }

    function prepararItemDiagnosticoAquisicao(
        chave,
        dados,
        tipo
    ) {
        dados = dados || {};

        var visitas = numeroDiagnosticoAquisicao(
            dados.visitas || dados.sessoes
        );

        var whatsapp = numeroDiagnosticoAquisicao(
            dados.pedidosWhatsapp
        );

        var checkouts = numeroDiagnosticoAquisicao(
            dados.checkoutsIniciados
        );

        var valor = numeroDiagnosticoAquisicao(
            dados.valorPedidosWhatsapp
        );

        return {
            chave: chave,
            tipo: tipo,
            nome: textoDiagnosticoAquisicao(
                dados.nome,
                tipo === "campanha"
                    ? "Campanha sem nome"
                    : "Origem não identificada"
            ),
            origem: textoDiagnosticoAquisicao(
                dados.origem,
                ""
            ),
            meio: textoDiagnosticoAquisicao(
                dados.meio,
                "Não informado"
            ),
            visitas: visitas,
            cliques: numeroDiagnosticoAquisicao(
                dados.cliques ||
                dados.cliquesProdutos
            ),
            carrinhos: numeroDiagnosticoAquisicao(
                dados.carrinhosAbertos
            ),
            adicoes: numeroDiagnosticoAquisicao(
                dados.adicoesCarrinho
            ),
            checkouts: checkouts,
            whatsapp: whatsapp,
            valor: valor,
            conversao: percentualDiagnosticoAquisicao(
                whatsapp,
                visitas
            ),
            conversaoCheckout:
                percentualDiagnosticoAquisicao(
                    whatsapp,
                    checkouts
                )
        };
    }

    function ordenarMaior(lista, campo) {
        return lista
            .slice()
            .sort(function(a, b) {
                return (
                    numeroDiagnosticoAquisicao(
                        b[campo]
                    ) -
                    numeroDiagnosticoAquisicao(
                        a[campo]
                    )
                );
            });
    }

    function obterMelhorConversao(lista) {
        var comAmostra = lista.filter(
            function(item) {
                return item.visitas >= 3;
            }
        );

        var base = comAmostra.length
            ? comAmostra
            : lista.filter(function(item) {
                return item.visitas > 0;
            });

        return base
            .slice()
            .sort(function(a, b) {
                return (
                    b.conversao - a.conversao ||
                    b.whatsapp - a.whatsapp ||
                    b.visitas - a.visitas
                );
            })[0] || null;
    }

    function criarRecomendacaoDiagnosticoAquisicao(
        nivel,
        titulo,
        texto,
        referencia
    ) {
        return {
            nivel: nivel,
            titulo: titulo,
            texto: texto,
            referencia: referencia || ""
        };
    }

    function analisarDadosDiagnosticoAquisicao(dados) {
        dados = dados || {};

        var origens = Object.entries(
            dados.porOrigem || {}
        )
            .map(function(par) {
                return prepararItemDiagnosticoAquisicao(
                    par[0],
                    par[1],
                    "origem"
                );
            })
            .filter(function(item) {
                return (
                    item.visitas > 0 ||
                    item.whatsapp > 0 ||
                    item.valor > 0 ||
                    item.checkouts > 0
                );
            });

        var campanhas = Object.entries(
            dados.porCampanha || {}
        )
            .map(function(par) {
                return prepararItemDiagnosticoAquisicao(
                    par[0],
                    par[1],
                    "campanha"
                );
            })
            .filter(function(item) {
                return (
                    item.visitas > 0 ||
                    item.whatsapp > 0 ||
                    item.valor > 0 ||
                    item.checkouts > 0
                );
            });

        var totais = origens.reduce(
            function(total, item) {
                total.visitas += item.visitas;
                total.whatsapp += item.whatsapp;
                total.checkouts += item.checkouts;
                total.valor += item.valor;
                return total;
            },
            {
                visitas: 0,
                whatsapp: 0,
                checkouts: 0,
                valor: 0
            }
        );

        totais.conversao =
            percentualDiagnosticoAquisicao(
                totais.whatsapp,
                totais.visitas
            );

        var melhorVolume =
            ordenarMaior(origens, "visitas")[0] ||
            null;

        var melhorConversao =
            obterMelhorConversao(origens);

        var maiorValor =
            ordenarMaior(origens, "valor")[0] ||
            null;

        var campanhaDestaque = campanhas
            .slice()
            .sort(function(a, b) {
                var scoreA =
                    a.whatsapp * 10000 +
                    a.valor * 10 +
                    a.conversao * 100 +
                    a.visitas;

                var scoreB =
                    b.whatsapp * 10000 +
                    b.valor * 10 +
                    b.conversao * 100 +
                    b.visitas;

                return scoreB - scoreA;
            })[0] || null;

        var recomendacoes = [];

        if (!origens.length) {
            recomendacoes.push(
                criarRecomendacaoDiagnosticoAquisicao(
                    "neutral",
                    "Gere os primeiros dados rastreáveis",
                    "Crie um link no Gerador de Links de Campanha, divulgue-o e faça um novo teste completo até o WhatsApp.",
                    "Sem dados de aquisição"
                )
            );
        }

        origens
            .filter(function(item) {
                return (
                    item.visitas >= 3 &&
                    item.whatsapp === 0
                );
            })
            .sort(function(a, b) {
                return b.visitas - a.visitas;
            })
            .slice(0, 2)
            .forEach(function(item) {
                recomendacoes.push(
                    criarRecomendacaoDiagnosticoAquisicao(
                        item.visitas >= 10
                            ? "critical"
                            : "attention",
                        "Tráfego sem conversão em " +
                            item.nome,
                        formatarInteiroDiagnosticoAquisicao(
                            item.visitas
                        ) +
                            " visitas chegaram por esse canal, mas nenhuma abriu o WhatsApp. Revise a oferta, o preço, as imagens e o botão principal da loja.",
                        item.nome
                    )
                );
            });

        origens
            .filter(function(item) {
                return (
                    item.checkouts >= 2 &&
                    item.conversaoCheckout < 50
                );
            })
            .sort(function(a, b) {
                return (
                    a.conversaoCheckout -
                    b.conversaoCheckout
                );
            })
            .slice(0, 2)
            .forEach(function(item) {
                recomendacoes.push(
                    criarRecomendacaoDiagnosticoAquisicao(
                        "attention",
                        "Abandono no final por " +
                            item.nome,
                        formatarInteiroDiagnosticoAquisicao(
                            item.checkouts
                        ) +
                            " pedidos foram iniciados, mas poucos chegaram ao WhatsApp. Simplifique os campos e deixe prazo, preço e entrega mais claros antes do formulário.",
                        item.nome
                    )
                );
            });

        campanhas
            .filter(function(item) {
                return (
                    item.visitas >= 3 &&
                    item.whatsapp === 0
                );
            })
            .sort(function(a, b) {
                return b.visitas - a.visitas;
            })
            .slice(0, 2)
            .forEach(function(item) {
                recomendacoes.push(
                    criarRecomendacaoDiagnosticoAquisicao(
                        item.visitas >= 10
                            ? "critical"
                            : "attention",
                        "Campanha sem resultado: " +
                            item.nome,
                        "A campanha recebeu " +
                            formatarInteiroDiagnosticoAquisicao(
                                item.visitas
                            ) +
                            " visitas e não gerou abertura do WhatsApp. Teste outro criativo, chamada ou público antes de aumentar o investimento.",
                        item.origem || item.meio
                    )
                );
            });

        if (
            melhorConversao &&
            melhorConversao.visitas >= 3 &&
            melhorConversao.conversao >= 5
        ) {
            recomendacoes.push(
                criarRecomendacaoDiagnosticoAquisicao(
                    "positive",
                    "Canal promissor: " +
                        melhorConversao.nome,
                    "Esse canal converte " +
                        formatarPercentualDiagnosticoAquisicao(
                            melhorConversao.conversao
                        ) +
                        " das visitas em abertura do WhatsApp. Replique o formato da campanha e acompanhe se a taxa permanece estável com mais tráfego.",
                    melhorConversao.meio
                )
            );
        }

        if (
            melhorVolume &&
            totais.visitas >= 10 &&
            melhorVolume.visitas /
                Math.max(totais.visitas, 1) >=
                0.7
        ) {
            recomendacoes.push(
                criarRecomendacaoDiagnosticoAquisicao(
                    "attention",
                    "Dependência elevada de um canal",
                    melhorVolume.nome +
                        " concentra " +
                        formatarPercentualDiagnosticoAquisicao(
                            percentualDiagnosticoAquisicao(
                                melhorVolume.visitas,
                                totais.visitas
                            )
                        ) +
                        " das visitas atribuídas. Teste ao menos uma segunda origem para reduzir o risco de queda repentina.",
                    melhorVolume.nome
                )
            );
        }

        if (
            campanhas.length === 0 &&
            origens.length > 0
        ) {
            recomendacoes.push(
                criarRecomendacaoDiagnosticoAquisicao(
                    "neutral",
                    "Separe as divulgações por campanha",
                    "As origens já estão sendo identificadas, mas ainda faltam campanhas específicas. Use nomes diferentes para stories, anúncios, parceiros e datas de promoção.",
                    "Gerador de links"
                )
            );
        }

        recomendacoes.sort(function(a, b) {
            var peso = {
                critical: 4,
                attention: 3,
                positive: 2,
                neutral: 1
            };

            return (
                (peso[b.nivel] || 0) -
                (peso[a.nivel] || 0)
            );
        });

        recomendacoes = recomendacoes.slice(0, 6);

        var nivelGeral = "neutral";
        var statusGeral = "Coletando dados";

        if (
            recomendacoes.some(function(item) {
                return item.nivel === "critical";
            })
        ) {
            nivelGeral = "critical";
            statusGeral = "Ação prioritária";
        } else if (
            recomendacoes.some(function(item) {
                return item.nivel === "attention";
            })
        ) {
            nivelGeral = "attention";
            statusGeral = "Pontos de atenção";
        } else if (
            origens.length > 0 &&
            totais.whatsapp > 0
        ) {
            nivelGeral = "positive";
            statusGeral = "Aquisição saudável";
        }

        return {
            origens: origens,
            campanhas: campanhas,
            totais: totais,
            melhorVolume: melhorVolume,
            melhorConversao: melhorConversao,
            maiorValor: maiorValor,
            campanhaDestaque: campanhaDestaque,
            recomendacoes: recomendacoes,
            nivelGeral: nivelGeral,
            statusGeral: statusGeral
        };
    }

    function inserirEstilosDiagnosticoAquisicao() {
        if (
            document.getElementById(
                "vide-diagnostico-aquisicao-style"
            )
        ) {
            return;
        }

        var style = document.createElement("style");
        style.id =
            "vide-diagnostico-aquisicao-style";

        style.textContent = `
            #vide-diagnostico-aquisicao {
                margin-top: 15px;
                padding: 16px;
                border: 1px solid rgba(255,255,255,.07);
                border-radius: 17px;
                background:
                    radial-gradient(
                        circle at 0 0,
                        color-mix(in srgb, var(--sys-primaria, #6d5dfc) 9%, transparent),
                        transparent 34%
                    ),
                    rgba(3,7,18,.45);
            }

            #vide-diagnostico-aquisicao * {
                box-sizing: border-box;
            }

            #vide-diagnostico-aquisicao .vide-diag-aquisicao-header {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 14px;
                margin-bottom: 14px;
            }

            #vide-diagnostico-aquisicao .vide-diag-aquisicao-title {
                display: flex;
                align-items: flex-start;
                gap: 10px;
                min-width: 0;
            }

            #vide-diagnostico-aquisicao .vide-diag-aquisicao-icon {
                width: 38px;
                height: 38px;
                flex: 0 0 38px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                border: 1px solid color-mix(in srgb, var(--sys-destaque, #00f2fe) 25%, transparent);
                border-radius: 12px;
                color: color-mix(in srgb, var(--sys-destaque, #00f2fe) 82%, white 18%);
                background: color-mix(in srgb, var(--sys-destaque, #00f2fe) 8%, transparent);
            }

            #vide-diagnostico-aquisicao .vide-diag-aquisicao-icon svg {
                width: 18px;
                height: 18px;
                fill: none;
                stroke: currentColor;
                stroke-width: 1.8;
                stroke-linecap: round;
                stroke-linejoin: round;
            }

            #vide-diagnostico-aquisicao .vide-diag-aquisicao-title small {
                display: block;
                margin-bottom: 3px;
                color: #697386;
                font-size: 7px;
                font-weight: 900;
                letter-spacing: .14em;
                text-transform: uppercase;
            }

            #vide-diagnostico-aquisicao .vide-diag-aquisicao-title strong {
                display: block;
                color: #fff;
                font-size: 12px;
                font-weight: 900;
            }

            #vide-diagnostico-aquisicao .vide-diag-aquisicao-title p {
                margin: 4px 0 0;
                color: #7c8798;
                font-size: 9px;
                line-height: 1.5;
            }

            #vide-diagnostico-aquisicao .vide-diag-aquisicao-status {
                flex: 0 0 auto;
                display: inline-flex;
                align-items: center;
                gap: 7px;
                min-height: 29px;
                padding: 0 10px;
                border: 1px solid rgba(255,255,255,.08);
                border-radius: 999px;
                color: #aeb8c7;
                background: rgba(255,255,255,.035);
                font-size: 8px;
                font-weight: 900;
                white-space: nowrap;
            }

            #vide-diagnostico-aquisicao .vide-diag-aquisicao-status::before {
                content: "";
                width: 7px;
                height: 7px;
                border-radius: 999px;
                background: #64748b;
            }

            #vide-diagnostico-aquisicao .vide-diag-aquisicao-status[data-level="positive"] {
                color: #86efac;
                border-color: rgba(34,197,94,.2);
                background: rgba(34,197,94,.06);
            }

            #vide-diagnostico-aquisicao .vide-diag-aquisicao-status[data-level="positive"]::before {
                background: #22c55e;
                box-shadow: 0 0 0 4px rgba(34,197,94,.09);
            }

            #vide-diagnostico-aquisicao .vide-diag-aquisicao-status[data-level="attention"] {
                color: #fde68a;
                border-color: rgba(245,158,11,.2);
                background: rgba(245,158,11,.06);
            }

            #vide-diagnostico-aquisicao .vide-diag-aquisicao-status[data-level="attention"]::before {
                background: #f59e0b;
                box-shadow: 0 0 0 4px rgba(245,158,11,.09);
            }

            #vide-diagnostico-aquisicao .vide-diag-aquisicao-status[data-level="critical"] {
                color: #fda4af;
                border-color: rgba(244,63,94,.2);
                background: rgba(244,63,94,.06);
            }

            #vide-diagnostico-aquisicao .vide-diag-aquisicao-status[data-level="critical"]::before {
                background: #f43f5e;
                box-shadow: 0 0 0 4px rgba(244,63,94,.09);
            }

            #vide-diagnostico-aquisicao .vide-diag-aquisicao-kpis {
                display: grid;
                grid-template-columns: repeat(4, minmax(0, 1fr));
                gap: 9px;
                margin-bottom: 13px;
            }

            #vide-diagnostico-aquisicao .vide-diag-aquisicao-kpi {
                min-width: 0;
                padding: 12px;
                border: 1px solid rgba(255,255,255,.055);
                border-radius: 13px;
                background: rgba(255,255,255,.022);
            }

            #vide-diagnostico-aquisicao .vide-diag-aquisicao-kpi span,
            #vide-diagnostico-aquisicao .vide-diag-aquisicao-kpi strong,
            #vide-diagnostico-aquisicao .vide-diag-aquisicao-kpi small {
                display: block;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            #vide-diagnostico-aquisicao .vide-diag-aquisicao-kpi span {
                color: #697386;
                font-size: 7px;
                font-weight: 900;
                letter-spacing: .09em;
                text-transform: uppercase;
                white-space: nowrap;
            }

            #vide-diagnostico-aquisicao .vide-diag-aquisicao-kpi strong {
                margin-top: 7px;
                color: #fff;
                font-size: 12px;
                font-weight: 900;
                white-space: nowrap;
            }

            #vide-diagnostico-aquisicao .vide-diag-aquisicao-kpi small {
                margin-top: 4px;
                min-height: 24px;
                color: #707b8e;
                font-size: 7px;
                line-height: 1.45;
            }

            #vide-diagnostico-aquisicao .vide-diag-aquisicao-lista {
                display: grid;
                gap: 8px;
            }

            #vide-diagnostico-aquisicao .vide-diag-aquisicao-item {
                display: grid;
                grid-template-columns: auto minmax(0, 1fr) auto;
                align-items: start;
                gap: 10px;
                padding: 11px;
                border: 1px solid rgba(255,255,255,.052);
                border-radius: 13px;
                background: rgba(255,255,255,.02);
            }

            #vide-diagnostico-aquisicao .vide-diag-aquisicao-marcador {
                width: 9px;
                height: 9px;
                margin-top: 3px;
                border-radius: 999px;
                background: #64748b;
            }

            #vide-diagnostico-aquisicao .vide-diag-aquisicao-item[data-level="positive"] .vide-diag-aquisicao-marcador {
                background: #22c55e;
                box-shadow: 0 0 0 4px rgba(34,197,94,.08);
            }

            #vide-diagnostico-aquisicao .vide-diag-aquisicao-item[data-level="attention"] .vide-diag-aquisicao-marcador {
                background: #f59e0b;
                box-shadow: 0 0 0 4px rgba(245,158,11,.08);
            }

            #vide-diagnostico-aquisicao .vide-diag-aquisicao-item[data-level="critical"] .vide-diag-aquisicao-marcador {
                background: #f43f5e;
                box-shadow: 0 0 0 4px rgba(244,63,94,.08);
            }

            #vide-diagnostico-aquisicao .vide-diag-aquisicao-copia {
                min-width: 0;
            }

            #vide-diagnostico-aquisicao .vide-diag-aquisicao-copia strong {
                display: block;
                color: #f8fafc;
                font-size: 9px;
                font-weight: 900;
            }

            #vide-diagnostico-aquisicao .vide-diag-aquisicao-copia p {
                margin: 4px 0 0;
                color: #7b8698;
                font-size: 8px;
                line-height: 1.55;
            }

            #vide-diagnostico-aquisicao .vide-diag-aquisicao-referencia {
                max-width: 130px;
                overflow: hidden;
                color: #697386;
                font-size: 7px;
                font-weight: 900;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            #vide-diagnostico-aquisicao .vide-diag-aquisicao-vazio {
                padding: 16px;
                border: 1px dashed rgba(255,255,255,.07);
                border-radius: 12px;
                color: #697386;
                font-size: 8px;
                line-height: 1.5;
                text-align: center;
            }

            @media (max-width: 900px) {
                #vide-diagnostico-aquisicao .vide-diag-aquisicao-kpis {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                }
            }

            @media (max-width: 620px) {
                #vide-diagnostico-aquisicao .vide-diag-aquisicao-header {
                    flex-direction: column;
                }

                #vide-diagnostico-aquisicao .vide-diag-aquisicao-status {
                    align-self: flex-start;
                }

                #vide-diagnostico-aquisicao .vide-diag-aquisicao-kpis {
                    grid-template-columns: 1fr 1fr;
                }

                #vide-diagnostico-aquisicao .vide-diag-aquisicao-item {
                    grid-template-columns: auto minmax(0, 1fr);
                }

                #vide-diagnostico-aquisicao .vide-diag-aquisicao-referencia {
                    grid-column: 2;
                    max-width: 100%;
                }
            }
        `;

        document.head.appendChild(style);
    }

    function criarPainelDiagnosticoAquisicao() {
        if (
            document.getElementById(
                "vide-diagnostico-aquisicao"
            )
        ) {
            return true;
        }

        var painel = document.getElementById(
            "vide-aquisicao-real"
        );

        var layout = painel?.querySelector(
            ".vide-aquisicao-layout"
        );

        if (!painel || !layout) return false;

        inserirEstilosDiagnosticoAquisicao();

        var diagnostico = document.createElement(
            "section"
        );

        diagnostico.id =
            "vide-diagnostico-aquisicao";

        diagnostico.setAttribute(
            "aria-labelledby",
            "vide-diag-aquisicao-titulo"
        );

        diagnostico.innerHTML = `
            <div class="vide-diag-aquisicao-header">
                <div class="vide-diag-aquisicao-title">
                    <span class="vide-diag-aquisicao-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24">
                            <path d="M4 19V9"></path>
                            <path d="M10 19V5"></path>
                            <path d="M16 19v-7"></path>
                            <path d="M22 19V3"></path>
                        </svg>
                    </span>

                    <div>
                        <small>Análise automática</small>
                        <strong id="vide-diag-aquisicao-titulo">
                            Diagnóstico de aquisição
                        </strong>
                        <p>
                            Descubra onde concentrar divulgação e quais campanhas precisam de ajuste.
                        </p>
                    </div>
                </div>

                <span
                    class="vide-diag-aquisicao-status"
                    id="vide-diag-aquisicao-status"
                    data-level="neutral"
                >
                    Coletando dados
                </span>
            </div>

            <div class="vide-diag-aquisicao-kpis">
                <article class="vide-diag-aquisicao-kpi">
                    <span>Maior volume</span>
                    <strong id="vide-diag-aquisicao-volume">
                        Sem dados
                    </strong>
                    <small id="vide-diag-aquisicao-volume-detalhe">
                        Aguardando visitas
                    </small>
                </article>

                <article class="vide-diag-aquisicao-kpi">
                    <span>Melhor conversão</span>
                    <strong id="vide-diag-aquisicao-conversao">
                        Sem dados
                    </strong>
                    <small id="vide-diag-aquisicao-conversao-detalhe">
                        Aguardando conversões
                    </small>
                </article>

                <article class="vide-diag-aquisicao-kpi">
                    <span>Maior valor potencial</span>
                    <strong id="vide-diag-aquisicao-valor">
                        Sem dados
                    </strong>
                    <small id="vide-diag-aquisicao-valor-detalhe">
                        Aguardando pedidos
                    </small>
                </article>

                <article class="vide-diag-aquisicao-kpi">
                    <span>Campanha destaque</span>
                    <strong id="vide-diag-aquisicao-campanha">
                        Sem dados
                    </strong>
                    <small id="vide-diag-aquisicao-campanha-detalhe">
                        Aguardando campanhas
                    </small>
                </article>
            </div>

            <div
                class="vide-diag-aquisicao-lista"
                id="vide-diag-aquisicao-lista"
            >
                <div class="vide-diag-aquisicao-vazio">
                    Analisando os canais e campanhas registrados...
                </div>
            </div>
        `;

        layout.insertAdjacentElement(
            "afterend",
            diagnostico
        );

        return true;
    }

    function atualizarTextoDiagnosticoAquisicao(
        id,
        texto
    ) {
        var elemento = document.getElementById(id);
        if (elemento) elemento.textContent = texto;
    }

    function renderizarRecomendacoesDiagnosticoAquisicao(
        recomendacoes
    ) {
        var lista = document.getElementById(
            "vide-diag-aquisicao-lista"
        );

        if (!lista) return;
        lista.replaceChildren();

        if (!recomendacoes.length) {
            var vazio = document.createElement("div");
            vazio.className =
                "vide-diag-aquisicao-vazio";
            vazio.textContent =
                "Nenhum ponto crítico foi identificado. Continue gerando tráfego rastreável para ampliar a análise.";
            lista.appendChild(vazio);
            return;
        }

        recomendacoes.forEach(function(item) {
            var card = document.createElement(
                "article"
            );

            card.className =
                "vide-diag-aquisicao-item";

            card.dataset.level =
                item.nivel || "neutral";

            var marcador = document.createElement(
                "span"
            );

            marcador.className =
                "vide-diag-aquisicao-marcador";

            marcador.setAttribute(
                "aria-hidden",
                "true"
            );

            var copia = document.createElement("div");
            copia.className =
                "vide-diag-aquisicao-copia";

            var titulo = document.createElement(
                "strong"
            );

            titulo.textContent = item.titulo;

            var texto = document.createElement("p");
            texto.textContent = item.texto;

            copia.append(titulo, texto);

            var referencia =
                document.createElement("span");

            referencia.className =
                "vide-diag-aquisicao-referencia";

            referencia.textContent =
                item.referencia || "";

            card.append(
                marcador,
                copia,
                referencia
            );

            lista.appendChild(card);
        });
    }

    function renderizarDiagnosticoAquisicao(dados) {
        var analise =
            analisarDadosDiagnosticoAquisicao(
                dados
            );

        var volume = analise.melhorVolume;
        var conversao =
            analise.melhorConversao;
        var valor = analise.maiorValor;
        var campanha =
            analise.campanhaDestaque;

        atualizarTextoDiagnosticoAquisicao(
            "vide-diag-aquisicao-volume",
            volume ? volume.nome : "Sem dados"
        );

        atualizarTextoDiagnosticoAquisicao(
            "vide-diag-aquisicao-volume-detalhe",
            volume
                ? formatarInteiroDiagnosticoAquisicao(
                    volume.visitas
                ) +
                    (volume.visitas === 1
                        ? " visita atribuída"
                        : " visitas atribuídas")
                : "Aguardando visitas"
        );

        atualizarTextoDiagnosticoAquisicao(
            "vide-diag-aquisicao-conversao",
            conversao
                ? conversao.nome
                : "Sem dados"
        );

        atualizarTextoDiagnosticoAquisicao(
            "vide-diag-aquisicao-conversao-detalhe",
            conversao
                ? formatarPercentualDiagnosticoAquisicao(
                    conversao.conversao
                ) +
                    " visita → WhatsApp"
                : "Aguardando conversões"
        );

        atualizarTextoDiagnosticoAquisicao(
            "vide-diag-aquisicao-valor",
            valor ? valor.nome : "Sem dados"
        );

        atualizarTextoDiagnosticoAquisicao(
            "vide-diag-aquisicao-valor-detalhe",
            valor
                ? formatarMoedaDiagnosticoAquisicao(
                    valor.valor
                ) +
                    " em intenção de compra"
                : "Aguardando pedidos"
        );

        atualizarTextoDiagnosticoAquisicao(
            "vide-diag-aquisicao-campanha",
            campanha
                ? campanha.nome
                : "Sem dados"
        );

        atualizarTextoDiagnosticoAquisicao(
            "vide-diag-aquisicao-campanha-detalhe",
            campanha
                ? formatarInteiroDiagnosticoAquisicao(
                    campanha.whatsapp
                ) +
                    " WhatsApp · " +
                    formatarPercentualDiagnosticoAquisicao(
                        campanha.conversao
                    )
                : "Aguardando campanhas"
        );

        var status = document.getElementById(
            "vide-diag-aquisicao-status"
        );

        if (status) {
            status.textContent =
                analise.statusGeral;

            status.dataset.level =
                analise.nivelGeral;
        }

        renderizarRecomendacoesDiagnosticoAquisicao(
            analise.recomendacoes
        );
    }

    async function obterUsuarioDiagnosticoAquisicao(
        authModulo,
        auth
    ) {
        if (auth.currentUser) {
            return auth.currentUser;
        }

        return new Promise(function(resolve, reject) {
            var cancelar =
                authModulo.onAuthStateChanged(
                    auth,
                    function(usuario) {
                        cancelar();

                        if (usuario) {
                            resolve(usuario);
                        } else {
                            reject(
                                new Error(
                                    "Sessão não autenticada."
                                )
                            );
                        }
                    },
                    function(erro) {
                        cancelar();
                        reject(erro);
                    }
                );
        });
    }

    async function resolverTenantDiagnosticoAquisicao(
        firebase,
        firestore,
        authModulo
    ) {
        var masterUid =
            new URLSearchParams(
                window.location.search
            ).get("masterUID");

        if (masterUid) {
            return String(masterUid).trim();
        }

        var usuario =
            await obterUsuarioDiagnosticoAquisicao(
                authModulo,
                firebase.auth
            );

        try {
            var funcionarioSnap =
                await firestore.getDoc(
                    firestore.doc(
                        firebase.db,
                        "funcionarios",
                        usuario.uid
                    )
                );

            if (
                funcionarioSnap.exists() &&
                funcionarioSnap.data()?.donoUID
            ) {
                return String(
                    funcionarioSnap.data().donoUID
                ).trim();
            }
        } catch (erro) {
            console.warn(
                "[Vide Hub] Vínculo do funcionário não consultado no diagnóstico de aquisição:",
                erro?.message || erro
            );
        }

        return usuario.uid;
    }

    function conectarDiagnosticoAquisicao() {
        if (diagnosticoAquisicaoIniciado) return;

        if (!criarPainelDiagnosticoAquisicao()) {
            return;
        }

        diagnosticoAquisicaoIniciado = true;

        var assinaturaAnterior = "";
        var frameDiagnostico = null;

        function aplicarDadosCompartilhados(dados) {
            dados = dados || {};

            var assinaturaAtual = JSON.stringify([
                dados.porOrigem || {},
                dados.porCampanha || {}
            ]);

            if (
                assinaturaAtual ===
                assinaturaAnterior
            ) {
                return;
            }

            assinaturaAnterior =
                assinaturaAtual;

            if (frameDiagnostico) {
                cancelAnimationFrame(
                    frameDiagnostico
                );
            }

            frameDiagnostico =
                requestAnimationFrame(function() {
                    renderizarDiagnosticoAquisicao(
                        dados
                    );

                    frameDiagnostico = null;
                });
        }

        window.addEventListener(
            "vide:metricas-vitrine",
            function(evento) {
                aplicarDadosCompartilhados(
                    evento.detail || {}
                );
            }
        );

        if (
            window.__VIDE_METRICAS_VITRINE_DADOS__
        ) {
            aplicarDadosCompartilhados(
                window.__VIDE_METRICAS_VITRINE_DADOS__
            );
        } else {
            aplicarDadosCompartilhados({});
        }
    }

        } catch (erro) {
            diagnosticoAquisicaoIniciado = false;

            console.error(
                "[Vide Hub] Erro ao iniciar diagnóstico de aquisição:",
                erro
            );

            var status = document.getElementById(
                "vide-diag-aquisicao-status"
            );

            if (status) {
                status.textContent =
                    "Não foi possível analisar";

                status.dataset.level =
                    "critical";
            }
        }
    }

    function inicializarDiagnosticoAquisicao() {
        var tentativas = 0;

        var intervalo = setInterval(function() {
            tentativas += 1;

            if (
                criarPainelDiagnosticoAquisicao()
            ) {
                clearInterval(intervalo);
                conectarDiagnosticoAquisicao();
                return;
            }

            if (tentativas >= 80) {
                clearInterval(intervalo);

                console.warn(
                    "[Vide Hub] O painel de aquisição não foi encontrado para inserir o diagnóstico."
                );
            }
        }, 180);
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            inicializarDiagnosticoAquisicao,
            { once: true }
        );
    } else {
        inicializarDiagnosticoAquisicao();
    }
})();

/* =========================================================
   VIDE HUB — OTIMIZAÇÃO VISUAL DA ABA MÉTRICAS
   Evita pintura e layout de blocos que estão fora da tela.
   ========================================================= */
(function() {
    "use strict";

    if (
        document.getElementById(
            "vide-metricas-performance-style"
        )
    ) {
        return;
    }

    var style = document.createElement("style");
    style.id = "vide-metricas-performance-style";

    style.textContent = `
        @supports (content-visibility: auto) {
            #vide-aquisicao-real {
                content-visibility: auto;
                contain-intrinsic-size: auto 1450px;
            }

            #vide-gerador-campanhas {
                content-visibility: auto;
                contain-intrinsic-size: auto 560px;
            }

            #vide-aquisicao-real > .vide-aquisicao-resumo {
                content-visibility: auto;
                contain-intrinsic-size: auto 150px;
            }

            #vide-aquisicao-real > .vide-aquisicao-layout {
                content-visibility: auto;
                contain-intrinsic-size: auto 440px;
            }

            #vide-diagnostico-aquisicao {
                content-visibility: auto;
                contain-intrinsic-size: auto 520px;
            }

            #vide-funil-loja-publica
                .vide-produtos-performance {
                content-visibility: auto;
                contain-intrinsic-size: auto 850px;
            }
        }

        #view-metricas .glass-card,
        #vide-funil-loja-publica,
        #vide-aquisicao-real,
        #vide-gerador-campanhas,
        #vide-diagnostico-aquisicao {
            -webkit-backdrop-filter: none !important;
            backdrop-filter: none !important;
        }

        #vide-aquisicao-real {
            background-color: rgba(6, 12, 25, .96) !important;
            background-image: none !important;
            box-shadow: none !important;
        }

        #vide-gerador-campanhas,
        #vide-diagnostico-aquisicao {
            background-color: rgba(5, 10, 22, .94) !important;
            background-image: none !important;
            box-shadow: none !important;
        }

        #vide-aquisicao-real .vide-aquisicao-kpi,
        #vide-aquisicao-real .vide-aquisicao-bloco,
        #vide-gerador-campanhas
            .vide-gerador-historico-item,
        #vide-diagnostico-aquisicao
            .vide-diag-aquisicao-kpi,
        #vide-diagnostico-aquisicao
            .vide-diag-aquisicao-item {
            box-shadow: none !important;
        }

        @media (max-width: 900px) {
            #vide-aquisicao-real,
            #vide-gerador-campanhas,
            #vide-diagnostico-aquisicao {
                border-radius: 15px;
            }
        }
    `;

    document.head.appendChild(style);
})();

