import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import management from "../../functions/src/whatsapp/management.js";
import qr from "../../functions/src/whatsapp/qr.js";
import { criarMetaClient } from "../../functions/src/whatsapp/metaClient.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function fakeFetch(body = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => body };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

describe("WhatsApp management/QR — validação pura", () => {
  it("aceita somente connectionId delimitado", () => {
    assert.equal(management.safeConnectionId("wac_12345678"), "wac_12345678");
    assert.equal(management.safeConnectionId("../tenant"), "");
    assert.equal(management.safeConnectionId("x"), "");
  });

  it("aceita somente code seguro e URLs HTTPS", () => {
    assert.equal(qr.safeCode("ABCD_1234"), "ABCD_1234");
    assert.equal(qr.safeCode("../x"), "");
    assert.equal(qr.safeHttpsUrl("https://wa.me/message/ABCD"), "https://wa.me/message/ABCD");
    assert.equal(qr.safeHttpsUrl("javascript:alert(1)"), "");
    assert.equal(qr.safeHttpsUrl("http://example.com"), "");
  });

  it("resumo de QR nunca inclui owner, token ou metadados privados", () => {
    const summary = qr.safeQrSummary("waqr_1", {
      ownerUid: "owner-a", token: "EAAG", accessToken: "EAAG2", connectionId: "wac_1",
      label: "Balcão", message: "Olá", code: "ABCD1234",
      deepLinkUrl: "https://wa.me/message/ABCD1234", qrImageUrl: "javascript:bad", format: "SVG"
    });
    assert.deepEqual(Object.keys(summary).sort(), ["code", "connectionId", "deepLinkUrl", "format", "id", "label", "legacy", "message", "qrImageUrl", "updatedAt"].sort());
    assert.equal(JSON.stringify(summary).includes("EAAG"), false);
    assert.equal(summary.qrImageUrl, "");
  });
});

describe("WhatsApp Meta client — endpoints oficiais de Embedded Signup e QR", () => {
  it("troca o código no backend usando form-urlencoded sem pôr segredo na URL", async () => {
    const fetchImpl = fakeFetch({ access_token: "token-servidor", expires_in: 3600 });
    const client = criarMetaClient({ fetchImpl });
    const result = await client.exchangeEmbeddedSignupCode({ appId: "123", appSecret: "secret", code: "authorization-code" });
    assert.equal(result.accessToken, "token-servidor");
    const call = fetchImpl.calls[0];
    assert.equal(call.url.includes("secret"), false);
    assert.equal(call.options.headers["Content-Type"], "application/x-www-form-urlencoded");
    assert.match(call.options.body, /client_secret=secret/);
  });

  it("cria, atualiza e exclui QR pelo message_qrdls com operações separadas", async () => {
    const fetchImpl = fakeFetch({ code: "ABCD1234" });
    const client = criarMetaClient({ fetchImpl });
    await client.createMessageQrCode({ accessToken: "fake", phoneNumberId: "12345", message: "Olá", format: "PNG" });
    await client.updateMessageQrCode({ accessToken: "fake", phoneNumberId: "12345", code: "ABCD1234", message: "Oi" });
    await client.deleteMessageQrCode({ accessToken: "fake", phoneNumberId: "12345", code: "ABCD1234" });
    assert.equal(fetchImpl.calls.length, 3);
    assert.ok(fetchImpl.calls.every((call) => call.url.includes("/message_qrdls")));
    assert.equal(JSON.parse(fetchImpl.calls[0].options.body).generate_qr_image, "PNG");
    assert.equal(JSON.parse(fetchImpl.calls[1].options.body).code, "ABCD1234");
    assert.equal(fetchImpl.calls[2].options.method, "DELETE");
  });

  it("não repete automaticamente escritas QR com resultado remoto ambíguo", async () => {
    let calls = 0;
    const client = criarMetaClient({ fetchImpl: async () => {
      calls += 1;
      return { ok: false, status: 503, json: async () => ({ error: { type: "ServiceUnavailable" } }) };
    } });
    await assert.rejects(client.createMessageQrCode({
      accessToken: "fake",
      phoneNumberId: "12345",
      message: "Olá",
      format: "SVG"
    }));
    assert.equal(calls, 1);
  });

  it("compensação informa explicitamente sucesso ou pendência sem expor credenciais", async () => {
    const compensated = await qr.__test.compensateRemoteQr({ emulator: false, deleteRemote: async () => ({ success: true }) });
    const pending = await qr.__test.compensateRemoteQr({ emulator: false, deleteRemote: async () => { throw new Error("network"); } });
    assert.deepEqual(compensated, { compensated: true, status: "failed" });
    assert.deepEqual(pending, { compensated: false, status: "compensation_pending" });
    assert.ok(qr.__test.LOCK_TTL_MS >= 60_000, "TTL precisa superar com folga o timeout sem retry do Meta Client");
  });
});

describe("WhatsApp frontend — ausência de credenciais e integração não oficial", () => {
  const publicFiles = ["dashboard.html", "dashboard-app.js", "whatsapp-oficial-v1.js", "whatsapp-oficial-v1.css", "core/vide-functions.js"];
  const publicBundle = publicFiles.map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");

  it("não contém token Meta, segredo, Authorization ou referência ao Secret Manager", () => {
    for (const pattern of [/EAAG[A-Za-z0-9]/, /access_token/i, /app_secret/i, /tokenSecretResource/i, /Authorization:\s*Bearer/i]) {
      assert.equal(pattern.test(publicBundle), false, `Padrão sensível encontrado no frontend: ${pattern}`);
    }
  });

  it("não grava credencial em localStorage/sessionStorage e não pede IDs técnicos", () => {
    assert.equal(/(?:localStorage|sessionStorage)\.setItem\([^)]*(?:token|secret|waba|phone.?number.?id)/i.test(publicBundle), false);
    assert.equal(/<input[^>]*(?:access.?token|app.?secret|waba.?id|phone.?number.?id)/i.test(publicBundle), false);
  });

  it("não inclui bibliotecas ou termos de integração não oficial", () => {
    for (const forbidden of ["Baileys", "WPPConnect", "whatsapp-web.js", "Venom", "whatsapp web qr"]) {
      assert.equal(publicBundle.toLowerCase().includes(forbidden.toLowerCase()), false);
    }
  });
});
