/* =========================================================
   VIDE HUB — CENTRAL DE CRESCIMENTO & RASTREAMENTO V1
   Controller da view #view-dominios ("Central de Crescimento").
   Segue o mesmo padrão de injeção dos outros controllers
   (central-ia.js, crm360.js): db/context/firestore injetados
   por dashboard-app.js, nunca importa firebase-init.js direto.
   ========================================================= */

import {
    LIMITE_TRACKING_LINKS,
    PRESETS_UTM,
    agruparLeadsPorOrigem,
    calcularConversaoAproximada,
    calcularTempoMedioSegundos,
    construirUrlComUtm,
    filtrarLeadsPorPeriodo,
    somarMetricasPorDia,
    validarGa4MeasurementId,
    validarMetaPixelId,
    validarTiktokPixelId,
    validarTrackingLink
} from "./tracking-core-v1.js";

export function criarGrowthTrackingController({
    db,
    context,
    firestore,
    notify = () => {},
    logger = console,
    root = document,
    obterSlugAtual = () => ""
}) {
    const {
        collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
        query, where, limit, serverTimestamp, writeBatch
    } = firestore;

    const state = {
        loading: false,
        loaded: false,
        error: false,
        semPermissao: false,
        periodoDias: 7,
        metrica: null,
        leads: [],
        trackingConfig: null,
        trackingLinks: [],
        editandoLinkId: null,
        charts: { timeline: null, origem: null }
    };

    const byId = id => root.getElementById(id);

    function ownerUid() {
        return context.getStoreUid();
    }

    function urlPublicaAtual() {
        return root.getElementById("link-minha-loja")?.href || "";
    }

    // ===== Render: estados =====

    function renderEstado() {
        byId("growth-estado-carregando")?.classList.toggle("hidden", !state.loading);
        byId("growth-estado-erro")?.classList.toggle("hidden", !state.error);
        byId("growth-estado-sem-permissao")?.classList.toggle("hidden", !state.semPermissao);
        byId("growth-conteudo")?.classList.toggle(
            "hidden",
            state.loading || state.error || state.semPermissao || !state.loaded
        );
    }

    // ===== KPIs =====

    function renderKpis() {
        const porDia = state.metrica?.porDia || {};
        const somaPeriodo = somarMetricasPorDia(porDia, state.periodoDias);

        const usaTotais = !state.periodoDias;
        const sessoes = usaTotais ? (Number(state.metrica?.totalSessoes) || 0) : somaPeriodo.sessoes;
        const cliques = usaTotais ? (Number(state.metrica?.totalCliques) || 0) : somaPeriodo.cliques;
        const tempoTotal = usaTotais ? (Number(state.metrica?.totalTempoTela) || 0) : somaPeriodo.tempo;

        const leadsPeriodo = filtrarLeadsPorPeriodo(state.leads, state.periodoDias);
        const totalLeads = leadsPeriodo.length;

        const conversao = calcularConversaoAproximada(totalLeads, sessoes);
        const tempoMedio = calcularTempoMedioSegundos(tempoTotal, sessoes);

        setTexto("growth-kpi-sessoes", formatarNumero(sessoes));
        setTexto("growth-kpi-cliques", formatarNumero(cliques));
        setTexto("growth-kpi-leads", formatarNumero(totalLeads));
        setTexto(
            "growth-kpi-conversao",
            conversao === null ? "—" : conversao.toFixed(1) + "%"
        );
        setTexto(
            "growth-kpi-tempo",
            tempoMedio === null ? "—" : formatarDuracao(tempoMedio)
        );

        return { somaPeriodo, leadsPeriodo };
    }

    function formatarNumero(valor) {
        return new Intl.NumberFormat("pt-BR").format(Number(valor) || 0);
    }

    function formatarDuracao(segundos) {
        const total = Math.round(segundos);
        if (total < 60) return total + "s";
        const min = Math.floor(total / 60);
        const rest = total % 60;
        return min + "min" + (rest ? " " + rest + "s" : "");
    }

    function setTexto(id, texto) {
        const el = byId(id);
        if (el) el.textContent = texto;
    }

    // ===== Gráficos =====

    function renderGraficos({ somaPeriodo, leadsPeriodo }) {
        renderGraficoTimeline(somaPeriodo?.serie || []);
        renderGraficoOrigem(agruparLeadsPorOrigem(leadsPeriodo));
    }

    function corPrimaria() {
        return getComputedStyle(root.documentElement)
            .getPropertyValue("--sys-primaria").trim() || "#5B3DF5";
    }

    function corDestaque() {
        return getComputedStyle(root.documentElement)
            .getPropertyValue("--sys-destaque").trim() || "#00F2FE";
    }

    function renderGraficoTimeline(serie) {
        const canvas = byId("growth-chart-timeline");
        const vazio = byId("growth-chart-timeline-vazio");
        if (!canvas) return;

        state.charts.timeline?.destroy();
        state.charts.timeline = null;

        const temDados = serie.some(dia => dia.sessoes > 0);

        if (!temDados || typeof window.Chart !== "function") {
            canvas.classList.add("hidden");
            vazio?.classList.remove("hidden");
            return;
        }

        canvas.classList.remove("hidden");
        vazio?.classList.add("hidden");

        state.charts.timeline = new window.Chart(canvas.getContext("2d"), {
            type: "line",
            data: {
                labels: serie.map(dia => dia.data.slice(5)),
                datasets: [{
                    label: "Sessões",
                    data: serie.map(dia => dia.sessoes),
                    borderColor: corPrimaria(),
                    backgroundColor: "transparent",
                    tension: 0.35,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: "rgba(255,255,255,.4)", font: { size: 9 } }, grid: { display: false } },
                    y: { beginAtZero: true, ticks: { color: "rgba(255,255,255,.4)", font: { size: 9 }, precision: 0 }, grid: { color: "rgba(255,255,255,.05)" } }
                }
            }
        });
    }

    function renderGraficoOrigem(grupos) {
        const canvas = byId("growth-chart-origem");
        const vazio = byId("growth-chart-origem-vazio");
        if (!canvas) return;

        state.charts.origem?.destroy();
        state.charts.origem = null;

        if (!grupos.length || typeof window.Chart !== "function") {
            canvas.classList.add("hidden");
            vazio?.classList.remove("hidden");
            return;
        }

        canvas.classList.remove("hidden");
        vazio?.classList.add("hidden");

        const top = grupos.slice(0, 8);

        state.charts.origem = new window.Chart(canvas.getContext("2d"), {
            type: "bar",
            data: {
                labels: top.map(g => g.origem),
                datasets: [{
                    label: "Leads",
                    data: top.map(g => g.total),
                    backgroundColor: corDestaque()
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: "y",
                plugins: { legend: { display: false } },
                scales: {
                    x: { beginAtZero: true, ticks: { color: "rgba(255,255,255,.4)", font: { size: 9 }, precision: 0 }, grid: { color: "rgba(255,255,255,.05)" } },
                    y: { ticks: { color: "rgba(255,255,255,.55)", font: { size: 9 } }, grid: { display: false } }
                }
            }
        });
    }

    // ===== Construtor de UTM =====

    function coletarFormularioLink() {
        return {
            nome: byId("growth-link-nome")?.value || "",
            baseUrl: byId("growth-link-baseurl")?.value || "",
            source: byId("growth-link-source")?.value || "",
            medium: byId("growth-link-medium")?.value || "",
            campaign: byId("growth-link-campaign")?.value || "",
            content: byId("growth-link-content")?.value || "",
            term: byId("growth-link-term")?.value || ""
        };
    }

    function renderPresets() {
        const container = byId("growth-link-presets");
        if (!container) return;

        container.innerHTML = PRESETS_UTM.map(preset => `
            <button type="button" class="aura-growth-preset" data-growth-preset="${preset.id}">
                ${preset.nome}
            </button>
        `).join("");
    }

    function aplicarPreset(presetId) {
        const preset = PRESETS_UTM.find(p => p.id === presetId);
        if (!preset) return;

        if (preset.source) byId("growth-link-source").value = preset.source;
        if (preset.medium) byId("growth-link-medium").value = preset.medium;

        atualizarPreviewLink();
    }

    function atualizarPreviewLink() {
        const dados = coletarFormularioLink();
        const base = dados.baseUrl.trim() || urlPublicaAtual();
        const resultado = construirUrlComUtm({ ...dados, baseUrl: base });

        const previewEl = byId("growth-link-preview");
        const errosEl = byId("growth-link-erros");

        if (resultado.ok) {
            if (previewEl) previewEl.textContent = resultado.url;
            errosEl?.classList.add("hidden");
            return resultado.url;
        }

        if (previewEl) previewEl.textContent = "—";
        if (errosEl) {
            errosEl.textContent = resultado.erro;
            errosEl.classList.remove("hidden");
        }

        return null;
    }

    function limparFormularioLink() {
        ["nome", "baseurl", "source", "medium", "campaign", "content", "term"].forEach(campo => {
            const el = byId("growth-link-" + campo);
            if (el) el.value = "";
        });

        state.editandoLinkId = null;
        byId("growth-link-cancelar-edicao")?.classList.add("hidden");
        atualizarPreviewLink();
    }

    async function salvarLink() {
        if (!context.canEdit("configuracoes")) {
            notify("Você não tem permissão pra salvar campanhas.", "erro");
            return;
        }

        const dados = coletarFormularioLink();
        const baseUrl = dados.baseUrl.trim() || urlPublicaAtual();
        const validacao = validarTrackingLink({ ...dados, baseUrl });

        if (!validacao.ok) {
            const errosEl = byId("growth-link-erros");
            if (errosEl) {
                errosEl.textContent = validacao.erros.join(" ");
                errosEl.classList.remove("hidden");
            }
            return;
        }

        const finalUrlResultado = construirUrlComUtm({ ...dados, baseUrl });
        if (!finalUrlResultado.ok) return;

        if (!state.editandoLinkId && state.trackingLinks.length >= LIMITE_TRACKING_LINKS) {
            notify(`Limite de ${LIMITE_TRACKING_LINKS} campanhas salvas atingido.`, "erro");
            return;
        }

        const uid = ownerUid();
        const payload = {
            criadoPor: uid,
            nome: dados.nome.trim().slice(0, 80),
            baseUrl: baseUrl.slice(0, 500),
            source: dados.source.trim().slice(0, 120),
            medium: dados.medium.trim().slice(0, 120),
            campaign: dados.campaign.trim().slice(0, 120),
            content: dados.content.trim().slice(0, 120),
            term: dados.term.trim().slice(0, 120),
            finalUrl: finalUrlResultado.url,
            ativo: true,
            atualizadoEm: serverTimestamp()
        };

        try {
            if (state.editandoLinkId) {
                await updateDoc(doc(db, "tracking_links", state.editandoLinkId), payload);
            } else {
                payload.criadoEm = serverTimestamp();
                await setDoc(doc(collection(db, "tracking_links")), payload);
            }

            notify("Campanha salva.", "sucesso");
            limparFormularioLink();
            await carregarTrackingLinks();
            renderBiblioteca();
        } catch (erro) {
            logger.error("[Growth] Falha ao salvar tracking_link", erro);
            notify("Não foi possível salvar a campanha agora.", "erro");
        }
    }

    function editarLink(id) {
        const link = state.trackingLinks.find(l => l.id === id);
        if (!link) return;

        byId("growth-link-nome").value = link.nome || "";
        byId("growth-link-baseurl").value = link.baseUrl || "";
        byId("growth-link-source").value = link.source || "";
        byId("growth-link-medium").value = link.medium || "";
        byId("growth-link-campaign").value = link.campaign || "";
        byId("growth-link-content").value = link.content || "";
        byId("growth-link-term").value = link.term || "";

        state.editandoLinkId = id;
        byId("growth-link-cancelar-edicao")?.classList.remove("hidden");
        atualizarPreviewLink();
        byId("growth-link-nome")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    async function duplicarLink(id) {
        const link = state.trackingLinks.find(l => l.id === id);
        if (!link || !context.canEdit("configuracoes")) return;

        if (state.trackingLinks.length >= LIMITE_TRACKING_LINKS) {
            notify(`Limite de ${LIMITE_TRACKING_LINKS} campanhas salvas atingido.`, "erro");
            return;
        }

        try {
            await setDoc(doc(collection(db, "tracking_links")), {
                criadoPor: ownerUid(),
                nome: (link.nome || "Campanha").slice(0, 76) + " (cópia)",
                baseUrl: link.baseUrl,
                source: link.source,
                medium: link.medium || "",
                campaign: link.campaign,
                content: link.content || "",
                term: link.term || "",
                finalUrl: link.finalUrl,
                ativo: true,
                criadoEm: serverTimestamp(),
                atualizadoEm: serverTimestamp()
            });

            notify("Campanha duplicada.", "sucesso");
            await carregarTrackingLinks();
            renderBiblioteca();
        } catch (erro) {
            logger.error("[Growth] Falha ao duplicar tracking_link", erro);
            notify("Não foi possível duplicar a campanha.", "erro");
        }
    }

    async function alternarArquivadoLink(id) {
        const link = state.trackingLinks.find(l => l.id === id);
        if (!link || !context.canEdit("configuracoes")) return;

        try {
            await updateDoc(doc(db, "tracking_links", id), {
                ativo: !link.ativo,
                atualizadoEm: serverTimestamp()
            });

            await carregarTrackingLinks();
            renderBiblioteca();
        } catch (erro) {
            logger.error("[Growth] Falha ao arquivar/reativar tracking_link", erro);
            notify("Não foi possível atualizar a campanha.", "erro");
        }
    }

    async function excluirLink(id) {
        if (!context.canEdit("configuracoes")) return;
        if (!window.confirm("Excluir esta campanha? Essa ação não pode ser desfeita.")) return;

        try {
            await deleteDoc(doc(db, "tracking_links", id));
            notify("Campanha excluída.", "sucesso");
            await carregarTrackingLinks();
            renderBiblioteca();
        } catch (erro) {
            logger.error("[Growth] Falha ao excluir tracking_link", erro);
            notify("Não foi possível excluir a campanha.", "erro");
        }
    }

    function renderBiblioteca() {
        const lista = byId("growth-link-lista");
        const vazio = byId("growth-link-vazio");
        const contagem = byId("growth-link-contagem");

        if (contagem) {
            contagem.textContent = `${state.trackingLinks.length}/${LIMITE_TRACKING_LINKS}`;
        }

        if (!lista) return;

        if (!state.trackingLinks.length) {
            lista.innerHTML = "";
            vazio?.classList.remove("hidden");
            return;
        }

        vazio?.classList.add("hidden");

        lista.innerHTML = state.trackingLinks.map(link => `
            <div class="aura-growth-link-item${link.ativo ? "" : " is-arquivado"}" data-growth-link-id="${link.id}">
                <div class="aura-growth-link-item-copy">
                    <strong>${escaparHtml(link.nome || "Sem nome")}</strong>
                    <small>${escaparHtml(link.source || "")}${link.medium ? " · " + escaparHtml(link.medium) : ""}</small>
                    <code>${escaparHtml(link.finalUrl || "")}</code>
                </div>
                <div class="aura-growth-link-item-actions">
                    <button type="button" data-growth-link-copiar="${link.id}">Copiar</button>
                    <button type="button" data-growth-link-editar="${link.id}">Editar</button>
                    <button type="button" data-growth-link-duplicar="${link.id}">Duplicar</button>
                    <button type="button" data-growth-link-arquivar="${link.id}">${link.ativo ? "Arquivar" : "Reativar"}</button>
                    <button type="button" class="is-perigo" data-growth-link-excluir="${link.id}">Excluir</button>
                </div>
            </div>
        `).join("");
    }

    function escaparHtml(texto) {
        const div = root.createElement("div");
        div.textContent = String(texto ?? "");
        return div.innerHTML;
    }

    async function copiarTexto(texto) {
        try {
            await navigator.clipboard.writeText(texto);
            notify("Link copiado.", "sucesso");
        } catch {
            notify("Não foi possível copiar automaticamente — copie manualmente.", "erro");
        }
    }

    // ===== Pixels =====

    function renderPixels() {
        const config = state.trackingConfig || {};

        byId("growth-pixel-meta-id").value = config.metaPixel?.id || "";
        byId("growth-pixel-meta-ativo").checked = Boolean(config.metaPixel?.ativo);

        byId("growth-pixel-ga4-id").value = config.ga4?.measurementId || "";
        byId("growth-pixel-ga4-ativo").checked = Boolean(config.ga4?.ativo);

        byId("growth-pixel-tiktok-id").value = config.tiktokPixel?.id || "";
        byId("growth-pixel-tiktok-ativo").checked = Boolean(config.tiktokPixel?.ativo);

        byId("growth-consent-ativo").checked = Boolean(config.consentimento?.ativo);

        atualizarStatusPixels();
    }

    function atualizarStatusPixels() {
        const definicoes = [
            { chave: "meta", valor: byId("growth-pixel-meta-id")?.value, ativo: byId("growth-pixel-meta-ativo")?.checked, validar: validarMetaPixelId },
            { chave: "ga4", valor: byId("growth-pixel-ga4-id")?.value, ativo: byId("growth-pixel-ga4-ativo")?.checked, validar: validarGa4MeasurementId },
            { chave: "tiktok", valor: byId("growth-pixel-tiktok-id")?.value, ativo: byId("growth-pixel-tiktok-ativo")?.checked, validar: validarTiktokPixelId }
        ];

        definicoes.forEach(def => {
            const statusEl = byId(`growth-pixel-${def.chave}-status`);
            const erroEl = byId(`growth-pixel-${def.chave}-erro`);
            const valido = def.valor ? def.validar(def.valor) : null;

            if (erroEl) {
                erroEl.textContent = (def.valor && !valido) ? "Formato de ID inválido." : "";
            }

            if (!statusEl) return;

            let estado = "nao-configurado";
            let rotulo = "Não configurado";

            if (def.valor && valido && def.ativo) {
                estado = "ativo";
                rotulo = "Ativo";
            } else if (def.valor && valido && !def.ativo) {
                estado = "pronto";
                rotulo = "Pronto para publicar";
            } else if (def.valor && !valido) {
                estado = "atencao";
                rotulo = "Atenção";
            }

            statusEl.dataset.state = estado;
            statusEl.textContent = rotulo;
        });
    }

    async function salvarPixels() {
        if (!context.canEdit("configuracoes")) {
            notify("Você não tem permissão pra salvar essas configurações.", "erro");
            return;
        }

        const metaId = byId("growth-pixel-meta-id")?.value.trim() || "";
        const ga4Id = byId("growth-pixel-ga4-id")?.value.trim() || "";
        const tiktokId = byId("growth-pixel-tiktok-id")?.value.trim() || "";

        const metaValido = metaId ? validarMetaPixelId(metaId) : null;
        const ga4Valido = ga4Id ? validarGa4MeasurementId(ga4Id) : null;
        const tiktokValido = tiktokId ? validarTiktokPixelId(tiktokId) : null;

        if (metaId && !metaValido) return notify("ID do Meta Pixel inválido.", "erro");
        if (ga4Id && !ga4Valido) return notify("ID de métricas do GA4 inválido.", "erro");
        if (tiktokId && !tiktokValido) return notify("ID do TikTok Pixel inválido.", "erro");

        const metaAtivo = Boolean(byId("growth-pixel-meta-ativo")?.checked) && Boolean(metaValido);
        const ga4Ativo = Boolean(byId("growth-pixel-ga4-ativo")?.checked) && Boolean(ga4Valido);
        const tiktokAtivo = Boolean(byId("growth-pixel-tiktok-ativo")?.checked) && Boolean(tiktokValido);
        const consentimentoAtivo = Boolean(byId("growth-consent-ativo")?.checked);

        const uid = ownerUid();
        const jaExiste = Boolean(state.trackingConfig);

        const configPayload = {
            criadoPor: uid,
            metaPixel: { id: metaValido || "", ativo: metaAtivo },
            ga4: { measurementId: ga4Valido || "", ativo: ga4Ativo },
            tiktokPixel: { id: tiktokValido || "", ativo: tiktokAtivo },
            consentimento: { ativo: consentimentoAtivo, versao: 1 },
            atualizadoEm: serverTimestamp(),
            atualizadoPor: uid
        };

        if (!jaExiste) configPayload.criadoEm = serverTimestamp();

        const publicoPayload = {
            tracking: {
                metaPixelId: metaValido || "",
                metaPixelAtivo: metaAtivo,
                ga4MeasurementId: ga4Valido || "",
                ga4Ativo: ga4Ativo,
                tiktokPixelId: tiktokValido || "",
                tiktokAtivo: tiktokAtivo,
                consentimentoAtivo,
                consentimentoVersao: 1
            },
            atualizadoEm: serverTimestamp()
        };

        try {
            const slug = String(obterSlugAtual() || "").trim().toLowerCase() || null;

            if (slug && writeBatch) {
                const lote = writeBatch(db);
                lote.set(doc(db, "tracking_configs", uid), configPayload, { merge: false });
                lote.update(doc(db, "vitrines_publicas", slug), publicoPayload);
                await lote.commit();
            } else {
                await setDoc(doc(db, "tracking_configs", uid), configPayload);
            }

            state.trackingConfig = configPayload;
            notify("Pixels salvos e publicados.", "sucesso");
            setTexto("growth-pixels-salvo-em", "Salvo agora");
            atualizarStatusPixels();
            renderDiagnostico();
        } catch (erro) {
            logger.error("[Growth] Falha ao salvar tracking_config", erro);
            notify("Não foi possível salvar/publicar os pixels agora.", "erro");
        }
    }

    // ===== Diagnóstico =====

    function renderDiagnostico() {
        const container = byId("growth-diagnostico-lista");
        if (!container) return;

        const config = state.trackingConfig || {};

        const itens = [
            { nome: "Meta Pixel", id: config.metaPixel?.id, ativo: config.metaPixel?.ativo },
            { nome: "Google Analytics 4", id: config.ga4?.measurementId, ativo: config.ga4?.ativo },
            { nome: "TikTok Pixel", id: config.tiktokPixel?.id, ativo: config.tiktokPixel?.ativo }
        ];

        container.innerHTML = itens.map(item => {
            let estado = "nao-configurado";
            let rotulo = "Não configurado";

            if (item.id && item.ativo) {
                estado = "ativo";
                rotulo = "Ativo e publicado";
            } else if (item.id) {
                estado = "pronto";
                rotulo = "Pronto para publicar (desativado)";
            }

            return `
                <div class="aura-growth-diagnostico-item" data-state="${estado}">
                    <strong>${item.nome}</strong>
                    <span>${rotulo}</span>
                </div>
            `;
        }).join("");
    }

    // ===== Domínio =====

    function renderDominio() {
        setTexto("growth-dominio-atual", urlPublicaAtual().replace(/^https?:\/\//, "") || "—");

        const checklist = byId("growth-dominio-checklist");
        if (checklist) {
            checklist.innerHTML = [
                "Loja publicada e acessível",
                "HTTPS ativo (padrão em toda loja Vide Hub)",
                "Identidade visual configurada",
                "Domínio próprio (assistido, sob solicitação)"
            ].map(item => `<div class="aura-growth-checklist-item">${item}</div>`).join("");
        }
    }

    function simularDominio() {
        const valor = byId("growth-dominio-simulado")?.value.trim() || "";
        const status = byId("growth-dominio-simulado-status");
        if (!status) return;

        const formatoValido = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(valor);
        status.textContent = !valor
            ? ""
            : (formatoValido
                ? "Formato válido. A conexão real é assistida — use o botão abaixo."
                : "Formato de domínio inválido.");
    }

    // ===== Carregamento =====

    async function carregarTrackingLinks() {
        const uid = ownerUid();
        const snap = await getDocs(query(
            collection(db, "tracking_links"),
            where("criadoPor", "==", uid),
            limit(LIMITE_TRACKING_LINKS)
        ));

        state.trackingLinks = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (b.criadoEm?.toMillis?.() || 0) - (a.criadoEm?.toMillis?.() || 0));
    }

    async function load({ force = false } = {}) {
        if (state.loading) return;
        if (state.loaded && !force) return;

        if (!context.canView("configuracoes")) {
            state.semPermissao = true;
            renderEstado();
            return;
        }

        state.loading = true;
        state.error = false;
        state.semPermissao = false;
        renderEstado();

        try {
            const uid = ownerUid();

            const [metricaSnap, leadsSnap, configSnap] = await Promise.all([
                getDoc(doc(db, "metricas_vitrines", uid)),
                getDocs(query(collection(db, "leads"), where("criadoPor", "==", uid), limit(500))),
                getDoc(doc(db, "tracking_configs", uid))
            ]);

            state.metrica = metricaSnap.exists() ? metricaSnap.data() : null;
            state.leads = leadsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            state.trackingConfig = configSnap.exists() ? configSnap.data() : null;

            await carregarTrackingLinks();

            state.loaded = true;
            state.loading = false;
            renderTudo();
        } catch (erro) {
            logger.error("[Growth] Falha ao carregar Central de Crescimento", erro);
            state.loading = false;
            state.error = true;
            renderEstado();
        }
    }

    function renderTudo() {
        renderEstado();
        const dadosPeriodo = renderKpis();
        renderGraficos(dadosPeriodo);
        renderPresets();
        renderBiblioteca();
        renderPixels();
        renderDiagnostico();
        renderDominio();
        atualizarPreviewLink();
    }

    // ===== Eventos =====

    function bindEventos() {
        const view = byId("view-dominios");
        if (!view || view.dataset.growthEventosLigados === "true") return;
        view.dataset.growthEventosLigados = "true";

        view.querySelectorAll("[data-growth-period]").forEach(botao => {
            botao.addEventListener("click", () => {
                const valor = botao.dataset.growthPeriod;
                state.periodoDias = valor === "all" ? null : Number(valor);

                view.querySelectorAll("[data-growth-period]").forEach(b => {
                    b.classList.toggle("is-active", b === botao);
                });

                if (state.loaded) {
                    const dadosPeriodo = renderKpis();
                    renderGraficos(dadosPeriodo);
                }
            });
        });

        byId("growth-tentar-novamente")?.addEventListener("click", () => load({ force: true }));

        ["nome", "baseurl", "source", "medium", "campaign", "content", "term"].forEach(campo => {
            byId("growth-link-" + campo)?.addEventListener("input", atualizarPreviewLink);
        });

        byId("growth-link-presets")?.addEventListener("click", evento => {
            const botao = evento.target.closest("[data-growth-preset]");
            if (botao) aplicarPreset(botao.dataset.growthPreset);
        });

        byId("growth-link-copiar")?.addEventListener("click", () => {
            const url = atualizarPreviewLink();
            if (url) copiarTexto(url);
        });

        byId("growth-link-abrir")?.addEventListener("click", () => {
            const url = atualizarPreviewLink();
            if (url) window.open(url, "_blank", "noopener");
        });

        byId("growth-link-salvar")?.addEventListener("click", salvarLink);
        byId("growth-link-cancelar-edicao")?.addEventListener("click", limparFormularioLink);

        byId("growth-link-lista")?.addEventListener("click", evento => {
            const alvo = evento.target;

            const copiarId = alvo.closest("[data-growth-link-copiar]")?.dataset.growthLinkCopiar;
            if (copiarId) {
                const link = state.trackingLinks.find(l => l.id === copiarId);
                if (link) copiarTexto(link.finalUrl);
                return;
            }

            const editarId = alvo.closest("[data-growth-link-editar]")?.dataset.growthLinkEditar;
            if (editarId) return editarLink(editarId);

            const duplicarId = alvo.closest("[data-growth-link-duplicar]")?.dataset.growthLinkDuplicar;
            if (duplicarId) return duplicarLink(duplicarId);

            const arquivarId = alvo.closest("[data-growth-link-arquivar]")?.dataset.growthLinkArquivar;
            if (arquivarId) return alternarArquivadoLink(arquivarId);

            const excluirId = alvo.closest("[data-growth-link-excluir]")?.dataset.growthLinkExcluir;
            if (excluirId) return excluirLink(excluirId);
        });

        ["meta", "ga4", "tiktok"].forEach(chave => {
            byId(`growth-pixel-${chave}-id`)?.addEventListener("input", atualizarStatusPixels);
            byId(`growth-pixel-${chave}-ativo`)?.addEventListener("change", atualizarStatusPixels);
        });

        byId("growth-pixels-salvar")?.addEventListener("click", salvarPixels);
        byId("growth-diagnostico-executar")?.addEventListener("click", renderDiagnostico);
        byId("growth-dominio-simulado")?.addEventListener("input", simularDominio);

        byId("growth-dominio-preparar")?.addEventListener("click", () => {
            const checklist = [
                "Checklist de domínio próprio — Vide Hub",
                "- Loja publicada e acessível",
                "- HTTPS ativo",
                "- Identidade visual configurada",
                `- Endereço atual: ${urlPublicaAtual()}`,
                "- Próximo passo: falar com o suporte Vide Hub para conectar o domínio desejado."
            ].join("\n");

            copiarTexto(checklist);
        });
    }

    return { load, bindEventos, state };
}
