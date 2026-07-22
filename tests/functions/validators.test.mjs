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
      ver: ["produtos", "central-ia", "unknown"],
      editar: ["leads", "produtos"]
    });
    assert.deepEqual(result.ver.sort(), ["central-ia", "leads", "produtos"].sort());
    assert.deepEqual(result.editar.sort(), ["leads", "produtos"].sort());
  });

  it("keeps public text bounded", () => {
    assert.equal(validators.publicText("  Olá   mundo  ", 20), "Olá mundo");
    assert.equal(validators.publicText("x".repeat(50), 10), "xxxxxxxxxx");
  });
});
