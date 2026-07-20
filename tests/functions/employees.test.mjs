import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { capPermissionsToCaller } from "../../functions/src/employees/index.js";

describe("capPermissionsToCaller", () => {
  it("funcionário não concede permissão que ele mesmo não possui", () => {
    const employeeContext = {
      isAdmin: false,
      isOwner: false,
      permissions: { ver: ["funcionarios", "produtos"], editar: ["funcionarios"] }
    };
    const requested = {
      ver: ["funcionarios", "produtos", "campanhas", "configuracoes"],
      editar: ["funcionarios", "campanhas", "configuracoes"]
    };
    const result = capPermissionsToCaller(employeeContext, requested);
    assert.deepEqual(result.ver.sort(), ["funcionarios", "produtos"].sort());
    assert.deepEqual(result.editar.sort(), ["funcionarios"].sort());
  });

  it("owner e admin continuam podendo conceder qualquer permissão", () => {
    const requested = { ver: ["campanhas"], editar: ["campanhas"] };
    assert.deepEqual(capPermissionsToCaller({ isOwner: true }, requested), requested);
    assert.deepEqual(capPermissionsToCaller({ isAdmin: true }, requested), requested);
  });
});
