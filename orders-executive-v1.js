/* =========================================================
   VIDE HUB — PEDIDOS EXECUTIVOS V1
   Camada modular sobre orders-engine-v1.js.
   Não faz consultas nem gravações no Firebase. Observa e
   reorganiza somente #view-pedidos; toda ação real (salvar,
   trocar status, exportar etc.) continua acionando os
   controles/atributos reais do motor.
   ========================================================= */

(function prepararPedidosExecutivosVideHub() {
    "use strict";

    if (window.__videOrdersExecutiveV1) {
        return;
    }

    window.__videOrdersExecutiveV1 = true;

    var view = null;
    var content = null;
    var observer = null;
    var quadroAgendado = 0;
    var elementoAoAbrirDetalhe = null;

    var CAMPOS_DETALHE = [
        "aura-orders-v1-detail-status",
        "aura-orders-v1-detail-payment",
        "aura-orders-v1-detail-responsible",
        "aura-orders-v1-detail-due",
        "aura-orders-v1-detail-discount",
        "aura-orders-v1-detail-freight",
        "aura-orders-v1-detail-notes"
    ];

    var ATALHOS_HOJE = [
        { id: "new", rotulo: "Novos pedidos", tab: "all", status: "novo" },
        { id: "inProgress", rotulo: "Em andamento", tab: "kanban" },
        { id: "awaitingPayment", rotulo: "Aguardando pagamento", tab: "payments" },
        { id: "ready", rotulo: "Prontos p/ retirada ou envio", tab: "all", status: "pronto" },
        { id: "overdue", rotulo: "Prazo vencido", tab: "deliveries" },
        { id: "receivable", rotulo: "Valor a receber", tab: "payments", moeda: true }
    ];

    function obterElemento(id) {
        return document.getElementById(id);
    }

    function definirTexto(elemento, texto) {
        if (elemento && elemento.textContent !== texto) {
            elemento.textContent = texto;
        }
    }

    function formatarMoeda(valor) {
        var numero = Number(valor);
        if (!Number.isFinite(numero)) numero = 0;
        return numero.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL"
        });
    }

    function obterEngine() {
        return window.AuraOrdersV1 || null;
    }

    // ===== Central "Hoje" =====
    // Fica entre as abas e o conteúdo (fora de #aura-orders-v1-content),
    // então sobrevive aos re-renders do motor sem precisar ser reinserida
    // a cada troca de aba/filtro.
    function criarFaixaHoje() {
        if (obterElemento("orders-exec-today")) return;

        var tabs = view.querySelector(".aura-orders-v1-tabs");
        if (!tabs) return;

        var faixa = document.createElement("section");
        faixa.id = "orders-exec-today";
        faixa.className = "orders-exec-today";
        faixa.setAttribute("aria-label", "Central de hoje — o que precisa de atenção");

        faixa.innerHTML =
            '<div class="orders-exec-today-heading">' +
                "<small>Central de hoje</small>" +
                "<h2>O que precisa da sua atenção</h2>" +
            "</div>" +
            '<div class="orders-exec-today-chips" id="orders-exec-today-chips"></div>';

        var chips = faixa.querySelector("#orders-exec-today-chips");
        ATALHOS_HOJE.forEach(function(atalho) {
            var chip = document.createElement("button");
            chip.type = "button";
            chip.className = "orders-exec-today-chip";
            chip.dataset.execToday = atalho.id;
            chip.setAttribute(
                "aria-label",
                "Ver " + atalho.rotulo.toLowerCase()
            );
            chip.innerHTML =
                '<strong id="orders-exec-today-' + atalho.id + '">—</strong>' +
                "<span>" + atalho.rotulo + "</span>";
            chip.addEventListener("click", function() {
                acionarAtalhoHoje(atalho.id);
            });
            chips.appendChild(chip);
        });

        tabs.insertAdjacentElement("afterend", faixa);
    }

    function atualizarFaixaHoje() {
        var engine = obterEngine();
        var sinais = engine && typeof engine.getSignals === "function"
            ? engine.getSignals()
            : null;

        if (!sinais) return;

        definirTexto(obterElemento("orders-exec-today-new"), String(sinais.new));
        definirTexto(obterElemento("orders-exec-today-inProgress"), String(sinais.inProgress));
        definirTexto(obterElemento("orders-exec-today-awaitingPayment"), String(sinais.awaitingPayment));
        definirTexto(obterElemento("orders-exec-today-ready"), String(sinais.ready));
        definirTexto(obterElemento("orders-exec-today-overdue"), String(sinais.overdue));
        definirTexto(obterElemento("orders-exec-today-receivable"), formatarMoeda(sinais.receivable));

        var chipAtrasado = view.querySelector('[data-exec-today="overdue"]');
        chipAtrasado?.classList.toggle("is-alerta", sinais.overdue > 0);
    }

    function acionarAtalhoHoje(id) {
        var atalho = ATALHOS_HOJE.find(function(item) {
            return item.id === id;
        });

        if (!atalho || !view) return;

        var botaoTab = view.querySelector(
            '[data-orders-tab="' + atalho.tab + '"]'
        );

        botaoTab?.click();

        if (atalho.status) {
            window.requestAnimationFrame(function() {
                var select = obterElemento("aura-orders-v1-status");
                if (!select) return;
                select.value = atalho.status;
                select.dispatchEvent(new Event("change", { bubbles: true }));
            });
        }
    }

    // ===== Filtros: limpar, contador, estado ativo =====
    function melhorarFiltros() {
        var filtros = content.querySelector(".aura-orders-v1-filters");
        if (!filtros) return;

        if (filtros.dataset.execEnhanced !== "true") {
            filtros.dataset.execEnhanced = "true";

            var extra = document.createElement("div");
            extra.className = "orders-exec-filters-extra";
            extra.innerHTML =
                '<span class="orders-exec-filters-count" id="orders-exec-filters-count"></span>' +
                '<button type="button" class="orders-exec-filters-clear" id="orders-exec-filters-clear">Limpar filtros</button>';

            filtros.insertAdjacentElement("afterend", extra);

            obterElemento("orders-exec-filters-clear")?.addEventListener(
                "click",
                limparFiltros
            );
        }

        atualizarContadorEEstado();
    }

    function limparFiltros() {
        var busca = obterElemento("aura-orders-v1-search");
        var status = obterElemento("aura-orders-v1-status");
        var pagamento = obterElemento("aura-orders-v1-payment");
        var entrega = obterElemento("aura-orders-v1-delivery");

        if (busca && busca.value) {
            busca.value = "";
            busca.dispatchEvent(new Event("input", { bubbles: true }));
        }
        if (status && status.value !== "all") {
            status.value = "all";
            status.dispatchEvent(new Event("change", { bubbles: true }));
        }
        if (pagamento && pagamento.value !== "all") {
            pagamento.value = "all";
            pagamento.dispatchEvent(new Event("change", { bubbles: true }));
        }
        if (entrega && entrega.value !== "all") {
            entrega.value = "all";
            entrega.dispatchEvent(new Event("change", { bubbles: true }));
        }
    }

    function filtrosAtivos() {
        var busca = obterElemento("aura-orders-v1-search");
        var status = obterElemento("aura-orders-v1-status");
        var pagamento = obterElemento("aura-orders-v1-payment");
        var entrega = obterElemento("aura-orders-v1-delivery");

        return Boolean(
            (busca && busca.value.trim()) ||
            (status && status.value !== "all") ||
            (pagamento && pagamento.value !== "all") ||
            (entrega && entrega.value !== "all")
        );
    }

    function atualizarContadorEEstado() {
        var filtros = content.querySelector(".aura-orders-v1-filters");
        var contador = obterElemento("orders-exec-filters-count");
        if (!filtros) return;

        var quantidade = content.querySelectorAll("[data-open-order]").length;

        if (contador) {
            definirTexto(
                contador,
                quantidade === 1
                    ? "1 pedido encontrado"
                    : quantidade + " pedidos encontrados"
            );
        }

        var ativo = filtrosAtivos();
        filtros.classList.toggle("is-filtrando", ativo);

        var extra = filtros.nextElementSibling;
        if (extra && extra.classList.contains("orders-exec-filters-extra")) {
            extra.classList.toggle("is-filtrando", ativo);
        }
    }

    // ===== Lista responsiva (cards no celular) =====
    function construirCardDeLinha(linha) {
        var celulas = linha.children;
        var numero = celulas[0]?.querySelector("strong")?.textContent || "";
        var origem = celulas[0]?.querySelector("small")?.textContent || "";
        var cliente = celulas[1]?.querySelector("strong")?.textContent || "";
        var contato = celulas[1]?.querySelector("small")?.textContent || "";
        var total = celulas[3]?.querySelector("strong")?.textContent || "";
        var statusNode = celulas[4]?.querySelector(".aura-orders-v1-status");
        var pagamentoNode = celulas[5]?.querySelector(".aura-orders-v1-payment");
        var recebimento = celulas[6]?.querySelector("strong")?.textContent || "";
        var data = celulas[7]?.querySelector("strong")?.textContent || "";

        var card = document.createElement("article");
        card.className = "orders-exec-card";
        card.setAttribute("data-open-order", linha.getAttribute("data-open-order") || "");
        card.setAttribute("role", "button");
        card.setAttribute("tabindex", "0");
        card.setAttribute(
            "aria-label",
            "Abrir pedido " + numero + " de " + cliente
        );

        card.innerHTML =
            "<header><strong></strong><b></b></header>" +
            "<h3></h3>" +
            '<p class="orders-exec-card-contato"></p>' +
            '<div class="orders-exec-card-badges"></div>' +
            "<footer><span></span><span></span></footer>";

        card.querySelector("header strong").textContent = numero;
        card.querySelector("header b").textContent = total;
        card.querySelector("h3").textContent = cliente;
        card.querySelector(".orders-exec-card-contato").textContent = contato || origem;

        var badges = card.querySelector(".orders-exec-card-badges");
        if (statusNode) badges.appendChild(statusNode.cloneNode(true));
        if (pagamentoNode) badges.appendChild(pagamentoNode.cloneNode(true));

        var rodape = card.querySelectorAll("footer span");
        rodape[0].textContent = recebimento;
        rodape[1].textContent = data;

        card.addEventListener("keydown", function(evento) {
            if (evento.key === "Enter" || evento.key === " ") {
                evento.preventDefault();
                card.click();
            }
        });

        return card;
    }

    function melhorarListaResponsiva() {
        var wrap = content.querySelector(".aura-orders-v1-table-wrap");
        var listaExistente = content.querySelector(".orders-exec-cards");

        if (!wrap) {
            listaExistente?.remove();
            return;
        }

        var tabela = wrap.querySelector("table");
        var linhas = tabela
            ? Array.from(tabela.querySelectorAll("tbody tr[data-open-order]"))
            : [];

        var impressao = linhas
            .map(function(linha) {
                return (
                    linha.getAttribute("data-open-order") + ":" +
                    (linha.querySelector(".aura-orders-v1-status")?.dataset.status || "") + ":" +
                    (linha.querySelector(".aura-orders-v1-payment")?.dataset.payment || "")
                );
            })
            .join("|");

        var listaCards = listaExistente;
        if (!listaCards) {
            listaCards = document.createElement("div");
            listaCards.className = "orders-exec-cards";
            wrap.insertAdjacentElement("afterend", listaCards);
        }

        // Evita reconstruir (e disparar o observer de novo) quando nada
        // mudou desde a última passagem.
        if (listaCards.dataset.fingerprint === impressao) return;
        listaCards.dataset.fingerprint = impressao;

        listaCards.innerHTML = "";

        if (!linhas.length) {
            listaCards.innerHTML =
                '<p class="orders-exec-cards-empty">Nenhum pedido encontrado.</p>';
            return;
        }

        linhas.forEach(function(linha) {
            listaCards.appendChild(construirCardDeLinha(linha));
        });
    }

    // ===== Detalhe como painel/drawer =====
    // O backdrop é recriado a cada abertura como IRMÃO direto de
    // .aura-orders-v1-detail (mesmo pai, inserido logo antes dele) — não
    // como filho único de document.body. Ancestrais de #view-pedidos
    // (ex.: a animação de troca de aba em .view-section.active) podem
    // criar um stacking context próprio; um backdrop anexado direto ao
    // body ficava fora desse contexto e, dependendo do ancestral, podia
    // renderizar por cima do drawer mesmo com z-index menor — foi o que
    // bloqueou o clique real em "Salvar pedido" no primeiro run do
    // Quality Gate. Como irmãos do mesmo pai, a comparação de z-index
    // entre os dois é sempre direta, não importa o que os ancestrais
    // façam. O nó antigo já é descartado sozinho a cada render() do
    // motor (troca todo o conteúdo), então não precisa de limpeza manual.
    function criarBackdropJuntoDoDetalhe(detalhe) {
        var bd = document.createElement("div");
        bd.className = "orders-exec-backdrop";
        bd.setAttribute("aria-hidden", "true");
        bd.addEventListener("click", function() {
            content?.querySelector('[data-orders-action="back"]')?.click();
        });

        detalhe.parentElement?.insertBefore(bd, detalhe);
        return bd;
    }

    function definirEstadoDirty(detalhe, estado) {
        var badge = detalhe.querySelector(".orders-exec-dirty-badge");
        if (!badge) {
            badge = document.createElement("span");
            badge.className = "orders-exec-dirty-badge";
            var botaoSalvar = detalhe.querySelector('[data-orders-action="save"]');
            if (botaoSalvar) {
                botaoSalvar.insertAdjacentElement("beforebegin", badge);
            } else {
                detalhe.querySelector(".aura-orders-v1-detail-hero")?.appendChild(badge);
            }
        }

        badge.dataset.state = estado;
        badge.hidden = estado === "clean";
        badge.textContent =
            estado === "dirty"
                ? "Alterações não salvas"
                : estado === "saving"
                    ? "Salvando alterações..."
                    : "Tudo sincronizado";
    }

    function monitorarDirtyNoDetalhe(detalhe) {
        var botaoSalvar = detalhe.querySelector('[data-orders-action="save"]');
        if (!botaoSalvar) return; // somente leitura: nada para acompanhar

        var marcarSujo = function() {
            definirEstadoDirty(detalhe, "dirty");
        };

        CAMPOS_DETALHE.forEach(function(id) {
            var campo = obterElemento(id);
            if (!campo) return;
            campo.addEventListener("input", marcarSujo);
            campo.addEventListener("change", marcarSujo);
        });

        botaoSalvar.addEventListener("click", function() {
            definirEstadoDirty(detalhe, "saving");

            // O salvamento real é assíncrono (grava no Firestore e só
            // reflete quando o listener em tempo real re-renderiza o
            // detalhe). Se depois de um tempo razoável o mesmo nó ainda
            // estiver na tela, o motor já avisou o erro por toast — aqui
            // só devolve o selo ao estado "não salvo" em vez de deixá-lo
            // preso em "salvando".
            window.setTimeout(function() {
                if (content?.querySelector(".aura-orders-v1-detail") === detalhe) {
                    definirEstadoDirty(detalhe, "dirty");
                }
            }, 6000);
        });

        definirEstadoDirty(detalhe, "clean");
    }

    function abrirDrawerVisual(detalhe) {
        detalhe.classList.add("orders-exec-drawer");
        criarBackdropJuntoDoDetalhe(detalhe).classList.add("is-visivel");
        document.body.classList.add("orders-exec-drawer-open");

        var alvoFoco = detalhe.querySelector(".aura-orders-v1-back");
        if (!alvoFoco) {
            alvoFoco = detalhe;
            if (!alvoFoco.hasAttribute("tabindex")) {
                alvoFoco.setAttribute("tabindex", "-1");
            }
        }

        window.requestAnimationFrame(function() {
            alvoFoco?.focus();
        });

        monitorarDirtyNoDetalhe(detalhe);
    }

    function fecharDrawerVisual() {
        // O backdrop era irmão de .aura-orders-v1-detail dentro de
        // #aura-orders-v1-content — já foi removido junto quando o motor
        // substituiu o conteúdo (render()); só falta destravar o scroll
        // e devolver o foco.
        document.body.classList.remove("orders-exec-drawer-open");

        if (
            elementoAoAbrirDetalhe &&
            document.contains(elementoAoAbrirDetalhe) &&
            typeof elementoAoAbrirDetalhe.focus === "function"
        ) {
            elementoAoAbrirDetalhe.focus();
        }

        elementoAoAbrirDetalhe = null;
    }

    function melhorarDetalhe() {
        var detalhe = content.querySelector(".aura-orders-v1-detail");

        if (!detalhe) {
            fecharDrawerVisual();
            return;
        }

        if (detalhe.dataset.execEnhanced === "true") return;
        detalhe.dataset.execEnhanced = "true";

        abrirDrawerVisual(detalhe);
    }

    // ===== Laço principal =====
    function aplicarMelhorias() {
        view = obterElemento("view-pedidos");
        if (!view) return;

        content = obterElemento("aura-orders-v1-content");
        if (!content) return;

        view.classList.add("orders-executive-view");

        criarFaixaHoje();
        atualizarFaixaHoje();
        melhorarFiltros();
        melhorarListaResponsiva();
        melhorarDetalhe();
    }

    function agendarMelhorias() {
        window.cancelAnimationFrame(quadroAgendado);
        quadroAgendado = window.requestAnimationFrame(aplicarMelhorias);
    }

    function conectarObserver() {
        if (observer || !content) return;

        observer = new MutationObserver(agendarMelhorias);
        observer.observe(content, { childList: true, subtree: true });
    }

    function conectarEventosGlobais() {
        // Fase de captura: registra a origem do clique antes que o motor
        // troque o conteúdo pelo detalhe, para devolver o foco depois.
        document.addEventListener(
            "click",
            function(evento) {
                if (!view || !view.contains(evento.target)) return;
                var origem = evento.target.closest("[data-open-order]");
                if (origem) elementoAoAbrirDetalhe = origem;
            },
            true
        );

        document.addEventListener("keydown", function(evento) {
            if (evento.key !== "Escape") return;
            if (!content || !content.querySelector(".aura-orders-v1-detail")) return;
            content.querySelector('[data-orders-action="back"]')?.click();
        });
    }

    function iniciar() {
        var tentativas = 0;

        var intervalo = window.setInterval(function() {
            tentativas += 1;

            view = obterElemento("view-pedidos");
            content = obterElemento("aura-orders-v1-content");

            if (view && content) {
                window.clearInterval(intervalo);

                aplicarMelhorias();
                conectarObserver();
                conectarEventosGlobais();

                window.setTimeout(agendarMelhorias, 500);
                window.setTimeout(agendarMelhorias, 1500);

                return;
            }

            if (tentativas >= 40) {
                window.clearInterval(intervalo);
                console.warn(
                    "[Vide Hub] A área de Pedidos não foi encontrada."
                );
            }
        }, 150);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", iniciar, { once: true });
    } else {
        iniciar();
    }
})();
