import assert from "node:assert/strict";
import { describe, it } from "node:test";
// core/vide-context.js importa direto de um CDN (gstatic) e o Node não
// consegue resolver esse import fora do navegador — por isso o teste usa
// core/vide-module-aliases.js, o módulo puro que core/vide-context.js
// re-exporta (mesmíssima função, sem duplicação).
import { normalizeModuleKey } from "../core/vide-module-aliases.js";

describe("normalizeModuleKey — separação real entre crm e leads", () => {
    it("'crm' normaliza pra si mesmo — NUNCA pra 'leads'", () => {
        // Achado de auditoria (fase "navegação própria do CRM 360"): 'crm'
        // já era, nas Rules (firestore.rules, employeeHasModulePermission),
        // uma permissão própria e independente de 'leads'. O frontend
        // tratava 'crm' como alias de 'leads' — quem tivesse só permissão
        // de leads via alias ganhava acesso ao CRM 360 no client mesmo sem
        // as Rules permitirem a leitura real de `clientes`. Este teste
        // trava a correção: os dois nunca mais podem colapsar num só.
        assert.equal(normalizeModuleKey("crm"), "crm");
        assert.notEqual(normalizeModuleKey("crm"), normalizeModuleKey("leads"));
    });

    it("'leads' continua normalizando pra si mesmo", () => {
        assert.equal(normalizeModuleKey("leads"), "leads");
    });

    it("aliases de 'crm' espelham exatamente os mesmos reconhecidos nas Rules (firestore.rules, employeeHasModulePermission)", () => {
        for (const alias of ["clientes", "crm-360", "crm_360", "observacoes_clientes", "tags_clientes"]) {
            assert.equal(normalizeModuleKey(alias), "crm", alias);
        }
    });

    it("aliases de automação de leads continuam normalizando pra 'leads'", () => {
        for (const alias of ["automacao-leads", "automacao_leads", "automacaoLeads"]) {
            assert.equal(normalizeModuleKey(alias), "leads", alias);
        }
    });

    it("é case-insensitive e tolera espaço nas pontas", () => {
        assert.equal(normalizeModuleKey("CRM"), "crm");
        assert.equal(normalizeModuleKey("  crm  "), "crm");
    });

    it("chave desconhecida passa direto, sem virar string vazia nem lançar erro", () => {
        assert.equal(normalizeModuleKey("modulo-inventado"), "modulo-inventado");
    });

    it("vazio/nulo normaliza pra string vazia", () => {
        assert.equal(normalizeModuleKey(""), "");
        assert.equal(normalizeModuleKey(null), "");
        assert.equal(normalizeModuleKey(undefined), "");
    });
});
