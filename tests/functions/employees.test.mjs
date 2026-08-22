import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { capPermissionsToCaller, requireOwnerOrAdmin } from "../../functions/src/employees/index.js";

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

describe("requireOwnerOrAdmin — gestão de funcionários é owner/admin-only", () => {
  it("funcionário é bloqueado mesmo com permissão de editar 'funcionarios'", () => {
    // Achado da auditoria de beta: requireEdit(context, "funcionarios") sozinho
    // deixaria um funcionário com essa permissão chamar createEmployee/
    // updateEmployee/enableEmployee/disableEmployee direto (bypassando o
    // bloqueio que só existe na UI de dashboard-app.js). requireOwnerOrAdmin
    // fecha isso na própria Function, batendo com a política real do produto.
    assert.throws(
      () => requireOwnerOrAdmin({
        isOwner: false,
        isAdmin: false,
        permissions: { ver: ["funcionarios"], editar: ["funcionarios"] }
      }),
      /Apenas o dono da loja pode gerenciar funcionários/
    );
  });

  it("owner e admin passam", () => {
    assert.doesNotThrow(() => requireOwnerOrAdmin({ isOwner: true }));
    assert.doesNotThrow(() => requireOwnerOrAdmin({ isAdmin: true }));
  });

  it("usuário comum (nem owner, nem admin, nem funcionário) é bloqueado", () => {
    assert.throws(
      () => requireOwnerOrAdmin({ isOwner: false, isAdmin: false, permissions: { ver: [], editar: [] } }),
      /Apenas o dono da loja pode gerenciar funcionários/
    );
  });
});
