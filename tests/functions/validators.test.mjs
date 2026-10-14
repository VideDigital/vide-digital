import assert from "node:assert/strict";
import { describe, it } from "node:test";
import validators from "../../functions/src/shared/validators.js";

describe("function validators", () => {
  it("normalizes email and phone", () => {
    assert.equal(validators.normalizeEmail(" USER@Example.COM "), "user@example.com");
    assert.equal(validators.normalizePhone("+55 (11) 99999-0000"), "5511999990000");
  });

  it("sanitizes permissions to known modules and makes edit imply view", () => {
    const result = validators.sanitizePermissions({
      ver: ["produtos", "gerenciar_ia", "whatsapp", "unknown"],
      editar: ["leads", "produtos", "central_ia"]
    });
    assert.deepEqual(result.ver.sort(), ["central-ia", "leads", "produtos", "whatsapp"].sort());
    assert.deepEqual(result.editar.sort(), ["central-ia", "leads", "produtos"].sort());
  });

  it("preserva a permissão dedicada do WhatsApp ao salvar um funcionário", () => {
    const result = validators.sanitizePermissions({ editar: ["whatsapp"] });
    assert.deepEqual(result, { ver: ["whatsapp"], editar: ["whatsapp"] });
  });

  it("preserves every permission offered in the employee permissions UI", () => {
    const uiPermissionKeys = [
      "produtos", "pedidos", "leads", "atendimento", "templates", "crm",
      "campanhas", "metricas", "configuracoes", "central-ia", "ia-copilot",
      "landing-pages", "funcionarios", "whatsapp"
    ];
    const result = validators.sanitizePermissions({ editar: uiPermissionKeys });
    assert.deepEqual(result.editar.slice().sort(), uiPermissionKeys.slice().sort());
    assert.deepEqual(result.ver.slice().sort(), uiPermissionKeys.slice().sort());
  });

  it("retains dedicated CRM, attendance, copiloto and knowledge permissions on save", () => {
    const result = validators.sanitizePermissions({
      ver: ["atendimento", "crm", "base-conhecimento-ia", "ia-copilot"],
      editar: ["crm", "ia-copilot"]
    });
    assert.deepEqual(result.ver.slice().sort(), ["atendimento", "crm", "base-conhecimento-ia", "ia-copilot"].sort());
    assert.deepEqual(result.editar.slice().sort(), ["crm", "ia-copilot"].sort());
  });

  it("normalizes established server-side module aliases without merging independent grants", () => {
    const result = validators.sanitizePermissions({
      ver: ["conversas", "clientes", "copiloto", "knowledge-base", "inexistente"],
      editar: ["crm_360", "ia_copilot"]
    });
    assert.deepEqual(result.ver.slice().sort(), ["atendimento", "crm", "ia-copilot", "base-conhecimento-ia"].sort());
    assert.deepEqual(result.editar.slice().sort(), ["crm", "ia-copilot"].sort());
    assert.ok(!result.editar.includes("atendimento"), "copiloto não autoriza editar atendimento");
  });

  it("keeps public text bounded", () => {
    assert.equal(validators.publicText("  Olá   mundo  ", 20), "Olá mundo");
    assert.equal(validators.publicText("x".repeat(50), 10), "xxxxxxxxxx");
  });
});
