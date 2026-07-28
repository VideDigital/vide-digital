import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    CONSENTIMENTO_VERSAO_ATUAL,
    LIMITE_TRACKING_LINKS,
    agruparLeadsPorOrigem,
    calcularConversaoAproximada,
    calcularTempoMedioSegundos,
    chaveConsentimento,
    consentimentoPermite,
    construirUrlComUtm,
    datasDoPeriodo,
    decidirCarregarAnalytics,
    decidirCarregarMarketing,
    eventoPermitido,
    filtrarLeadsPorPeriodo,
    mapearEventoParaPlataforma,
    normalizarConsentimento,
    normalizarUtmValor,
    removerCamposProibidos,
    somarMetricasPorDia,
    validarGa4MeasurementId,
    validarMetaPixelId,
    validarTiktokPixelId,
    validarTrackingLink
} from "../tracking-core-v1.js";

describe("normalizarUtmValor", () => {
    it("normaliza espaços, caixa e remove HTML", () => {
        assert.equal(normalizarUtmValor("  Instagram Bio  "), "instagram-bio");
        assert.equal(normalizarUtmValor("<script>alert(1)</script>Ads"), "alert(1)ads");
    });

    it("respeita o limite de tamanho", () => {
        assert.equal(normalizarUtmValor("a".repeat(200), 10).length, 10);
    });

    it("nunca quebra com valor vazio/indefinido", () => {
        assert.equal(normalizarUtmValor(undefined), "");
        assert.equal(normalizarUtmValor(null), "");
    });
});

describe("construirUrlComUtm", () => {
    it("constrói a URL com os parâmetros obrigatórios", () => {
        const resultado = construirUrlComUtm({
            baseUrl: "https://vide.digital/loja/teste",
            source: "Instagram",
            medium: "Bio",
            campaign: "Lançamento"
        });

        assert.equal(resultado.ok, true);
        assert.match(resultado.url, /utm_source=instagram/);
        assert.match(resultado.url, /utm_medium=bio/);
        assert.match(resultado.url, /utm_campaign=lan/);
    });

    it("preserva query string existente na base", () => {
        const resultado = construirUrlComUtm({
            baseUrl: "https://vide.digital/loja/teste?ref=abc",
            source: "google",
            campaign: "promo"
        });

        assert.equal(resultado.ok, true);
        assert.match(resultado.url, /ref=abc/);
    });

    it("faz encoding correto de content/term", () => {
        const resultado = construirUrlComUtm({
            baseUrl: "https://vide.digital",
            source: "meta",
            campaign: "promo",
            content: "banner topo",
            term: "tênis azul"
        });

        assert.equal(resultado.ok, true);
        assert.match(resultado.url, /utm_content=banner-topo/);
        assert.match(resultado.url, /utm_term=t.*nis-azul/);
    });

    it("rejeita URL inválida", () => {
        const resultado = construirUrlComUtm({
            baseUrl: "não é url",
            source: "meta",
            campaign: "promo"
        });

        assert.equal(resultado.ok, false);
    });

    it("rejeita esquema javascript:", () => {
        const resultado = construirUrlComUtm({
            baseUrl: "javascript:alert(1)",
            source: "meta",
            campaign: "promo"
        });

        assert.equal(resultado.ok, false);
    });

    it("exige source e campaign", () => {
        assert.equal(
            construirUrlComUtm({ baseUrl: "https://vide.digital", campaign: "x" }).ok,
            false
        );

        assert.equal(
            construirUrlComUtm({ baseUrl: "https://vide.digital", source: "x" }).ok,
            false
        );
    });
});

describe("validarTrackingLink", () => {
    it("aceita um link completo e válido", () => {
        const resultado = validarTrackingLink({
            nome: "Campanha de lançamento",
            baseUrl: "https://vide.digital/loja/teste",
            source: "instagram",
            campaign: "lancamento"
        });

        assert.equal(resultado.ok, true);
        assert.deepEqual(resultado.erros, []);
    });

    it("acumula todos os erros de uma vez", () => {
        const resultado = validarTrackingLink({});

        assert.equal(resultado.ok, false);
        assert.ok(resultado.erros.length >= 3);
    });
});

describe("limite de tracking links", () => {
    it("é 100", () => {
        assert.equal(LIMITE_TRACKING_LINKS, 100);
    });
});

describe("validação de pixels", () => {
    it("Meta Pixel: só formato numérico razoável", () => {
        assert.equal(validarMetaPixelId("1234567890123"), "1234567890123");
        assert.equal(validarMetaPixelId("abc123"), null);
        assert.equal(validarMetaPixelId(""), null);
        assert.equal(validarMetaPixelId("<script>alert(1)</script>"), null);
    });

    it("GA4: exige G-XXXXXXXXXX e normaliza pra maiúscula", () => {
        assert.equal(validarGa4MeasurementId("g-abc123defg"), "G-ABC123DEFG");
        assert.equal(validarGa4MeasurementId("ABC123"), null);
        assert.equal(validarGa4MeasurementId("G-"), null);
    });

    it("TikTok: alfanumérico dentro do limite", () => {
        assert.equal(validarTiktokPixelId("ABCDEF1234567890"), "ABCDEF1234567890");
        assert.equal(validarTiktokPixelId("curto"), null);
        assert.equal(validarTiktokPixelId("com espaço aqui!!"), null);
    });
});

describe("consentimento", () => {
    it("gera uma chave por loja", () => {
        assert.equal(chaveConsentimento("minha-loja"), "videTrackingConsentV1:minha-loja");
        assert.notEqual(chaveConsentimento("loja-a"), chaveConsentimento("loja-b"));
    });

    it("normaliza um consentimento válido", () => {
        const bruto = JSON.stringify({
            version: CONSENTIMENTO_VERSAO_ATUAL,
            analytics: true,
            marketing: false,
            updatedAt: 123
        });

        const normalizado = normalizarConsentimento(bruto);

        assert.deepEqual(normalizado, {
            version: CONSENTIMENTO_VERSAO_ATUAL,
            analytics: true,
            marketing: false,
            updatedAt: 123
        });
    });

    it("descarta consentimento de versão antiga", () => {
        assert.equal(
            normalizarConsentimento(JSON.stringify({ version: 0, analytics: true })),
            null
        );
    });

    it("descarta valor corrompido/inválido", () => {
        assert.equal(normalizarConsentimento("{não é json"), null);
        assert.equal(normalizarConsentimento(null), null);
        assert.equal(normalizarConsentimento(undefined), null);
    });

    it("necessários sempre permitido, o resto depende do consentimento", () => {
        assert.equal(consentimentoPermite(null, "necessarios"), true);
        assert.equal(consentimentoPermite(null, "analytics"), false);
        assert.equal(
            consentimentoPermite({ analytics: true, marketing: false }, "analytics"),
            true
        );
        assert.equal(
            consentimentoPermite({ analytics: true, marketing: false }, "marketing"),
            false
        );
    });

    it("decide carregar analytics/marketing a partir do consentimento", () => {
        assert.equal(decidirCarregarAnalytics({ analytics: true }), true);
        assert.equal(decidirCarregarAnalytics(null), false);
        assert.equal(decidirCarregarMarketing({ marketing: true }), true);
        assert.equal(decidirCarregarMarketing({ marketing: false }), false);
    });
});

describe("eventos de rastreamento", () => {
    it("aceita só os eventos da whitelist", () => {
        assert.equal(eventoPermitido("page_view"), true);
        assert.equal(eventoPermitido("lead"), true);
        assert.equal(eventoPermitido("purchase"), false);
        assert.equal(eventoPermitido("qualquer_coisa"), false);
    });

    it("nunca disponibiliza mapeamento para purchase", () => {
        assert.equal(mapearEventoParaPlataforma("purchase", "meta"), null);
        assert.equal(mapearEventoParaPlataforma("purchase", "ga4"), null);
        assert.equal(mapearEventoParaPlataforma("purchase", "tiktok"), null);
    });

    it("mapeia eventos permitidos para cada plataforma", () => {
        assert.equal(mapearEventoParaPlataforma("lead", "meta"), "Lead");
        assert.equal(mapearEventoParaPlataforma("lead", "ga4"), "generate_lead");
        assert.equal(mapearEventoParaPlataforma("lead", "tiktok"), "SubmitForm");
        assert.equal(mapearEventoParaPlataforma("add_to_cart", "meta"), "AddToCart");
    });

    it("retorna null pra plataforma desconhecida", () => {
        assert.equal(mapearEventoParaPlataforma("lead", "bing"), null);
    });
});

describe("removerCamposProibidos (PII)", () => {
    it("remove todos os campos proibidos, preserva o resto", () => {
        const limpo = removerCamposProibidos({
            productId: "abc123",
            productName: "Camiseta",
            value: 99.9,
            currency: "BRL",
            nome: "João da Silva",
            telefone: "11999998888",
            email: "joao@example.com",
            observacoes: "cliente disse que..."
        });

        assert.deepEqual(limpo, {
            productId: "abc123",
            productName: "Camiseta",
            value: 99.9,
            currency: "BRL"
        });
    });

    it("nunca quebra com payload vazio/inválido", () => {
        assert.deepEqual(removerCamposProibidos(null), {});
        assert.deepEqual(removerCamposProibidos(undefined), {});
        assert.deepEqual(removerCamposProibidos({}), {});
    });
});

describe("cálculos de KPI", () => {
    it("conversão aproximada: leads / sessões * 100", () => {
        assert.equal(calcularConversaoAproximada(10, 100), 10);
        assert.equal(calcularConversaoAproximada(1, 3).toFixed(2), "33.33");
    });

    it("conversão retorna null sem sessões", () => {
        assert.equal(calcularConversaoAproximada(5, 0), null);
        assert.equal(calcularConversaoAproximada(5, null), null);
    });

    it("tempo médio: totalTempoTela / totalSessoes", () => {
        assert.equal(calcularTempoMedioSegundos(600, 10), 60);
    });

    it("tempo médio retorna null sem sessões", () => {
        assert.equal(calcularTempoMedioSegundos(600, 0), null);
    });
});

describe("filtrarLeadsPorPeriodo", () => {
    const agora = Date.parse("2026-07-28T12:00:00Z");
    const leads = [
        { id: "recente", criadoEm: { seconds: Date.parse("2026-07-27T12:00:00Z") / 1000 } },
        { id: "20dias", criadoEm: { seconds: Date.parse("2026-07-08T12:00:00Z") / 1000 } },
        { id: "100dias", criadoEm: { seconds: Date.parse("2026-04-19T12:00:00Z") / 1000 } },
        { id: "sem-data" }
    ];

    it("filtra por 7 dias", () => {
        const resultado = filtrarLeadsPorPeriodo(leads, 7, agora);
        assert.deepEqual(resultado.map(l => l.id), ["recente"]);
    });

    it("filtra por 30 dias", () => {
        const resultado = filtrarLeadsPorPeriodo(leads, 30, agora);
        assert.deepEqual(resultado.map(l => l.id), ["recente", "20dias"]);
    });

    it("período nulo/0 retorna tudo (todo o período)", () => {
        assert.equal(filtrarLeadsPorPeriodo(leads, null, agora).length, 4);
        assert.equal(filtrarLeadsPorPeriodo(leads, 0, agora).length, 4);
    });
});

describe("datasDoPeriodo / somarMetricasPorDia", () => {
    const agora = Date.parse("2026-07-28T12:00:00Z");

    it("datasDoPeriodo(null) retorna null (todo o período)", () => {
        assert.equal(datasDoPeriodo(null, agora), null);
    });

    it("datasDoPeriodo(7) retorna 7 datas incluindo hoje", () => {
        const datas = datasDoPeriodo(7, agora);
        assert.equal(datas.length, 7);
        assert.equal(datas[0], "2026-07-28");
        assert.equal(datas[6], "2026-07-22");
    });

    it("soma só os dias dentro do período", () => {
        const porDia = {
            "2026-07-28": { sessoes: 10, cliques: 2, tempo: 300 },
            "2026-07-25": { sessoes: 5, cliques: 1, tempo: 100 },
            "2026-06-01": { sessoes: 999, cliques: 999, tempo: 999 }
        };

        const resultado = somarMetricasPorDia(porDia, 7, agora);

        assert.equal(resultado.sessoes, 15);
        assert.equal(resultado.cliques, 3);
        assert.equal(resultado.tempo, 400);
        assert.equal(resultado.serie.length, 7);
    });

    it("período nulo soma todos os dias presentes no mapa", () => {
        const porDia = {
            "2026-01-01": { sessoes: 1 },
            "2026-07-28": { sessoes: 2 }
        };

        const resultado = somarMetricasPorDia(porDia, null, agora);
        assert.equal(resultado.sessoes, 3);
    });

    it("nunca quebra com porDia ausente/vazio", () => {
        assert.deepEqual(somarMetricasPorDia(undefined, 7, agora).sessoes, 0);
        assert.deepEqual(somarMetricasPorDia({}, null, agora), { sessoes: 0, cliques: 0, tempo: 0, serie: [] });
    });
});

describe("agruparLeadsPorOrigem", () => {
    it("agrupa e ordena por total decrescente", () => {
        const leads = [
            { utmSource: "instagram" },
            { utmSource: "instagram" },
            { utmSource: "google" },
            {}
        ];

        assert.deepEqual(agruparLeadsPorOrigem(leads), [
            { origem: "instagram", total: 2 },
            { origem: "google", total: 1 },
            { origem: "Direto / outros", total: 1 }
        ]);
    });

    it("nunca quebra com lista vazia", () => {
        assert.deepEqual(agruparLeadsPorOrigem([]), []);
        assert.deepEqual(agruparLeadsPorOrigem(undefined), []);
    });
});
