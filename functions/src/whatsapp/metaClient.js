"use strict";

// WhatsApp Oficial V1 — Meta Client: adapter PURO da Graph API (WhatsApp
// Cloud API). Nenhuma leitura de Firestore/Secret Manager aqui — recebe
// accessToken/phoneNumberId/wabaId já resolvidos por quem chama (send.js,
// webhook.js, templates.js). fetchImpl é injetável para os testes usarem
// um Meta fake — nunca a Graph API real em CI (ver
// tests/functions/whatsapp-functions.test.mjs). Usa fetch nativo, nunca
// um SDK abandonado. Ver docs/WHATSAPP_OFICIAL.md para a versão da API.
const { graphUrl, ERROR_CODES } = require("./constants");

const TIMEOUT_MS_PADRAO = 10000;
const MAX_TENTATIVAS = 2; // 1 tentativa original + até 2 retries
const BACKOFF_BASE_MS = 300;

function erroTipado(code, { providerStatus, metaErrorCode, metaErrorTitle, mensagem } = {}) {
  const erro = new Error(mensagem || "Erro ao comunicar com o WhatsApp.");
  erro.code = code;
  erro.providerStatus = Number.isFinite(providerStatus) ? providerStatus : null;
  // título curto vindo da própria Meta (ex.: "Invalid parameter") — nunca
  // o corpo completo da resposta, que pode conter dados do destinatário.
  erro.metaErrorCode = metaErrorCode ?? null;
  erro.metaErrorTitle = typeof metaErrorTitle === "string" ? metaErrorTitle.slice(0, 200) : null;
  return erro;
}

function aguardar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function statusRetentavel(status) {
  return status === undefined || status === null || status >= 500;
}

// fetchImpl: assinatura compatível com fetch() nativo — permite injetar um
// fake determinístico nos testes (nunca chama a Graph API real em CI).
function criarMetaClient({ fetchImpl, timeoutMs = TIMEOUT_MS_PADRAO } = {}) {
  const fazerFetch = fetchImpl || globalThis.fetch;
  if (typeof fazerFetch !== "function") {
    throw new Error("metaClient requer um fetch disponível (nativo ou injetado via fetchImpl).");
  }

  async function chamarGraphApi(path, { method = "GET", accessToken, body, query } = {}) {
    let url = graphUrl(path);
    if (query && typeof query === "object") {
      const params = new URLSearchParams();
      for (const [chave, valor] of Object.entries(query)) {
        if (valor !== undefined && valor !== null && valor !== "") params.set(chave, String(valor));
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }

    let ultimoErro = null;
    for (let tentativa = 0; tentativa <= MAX_TENTATIVAS; tentativa += 1) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const resposta = await fazerFetch(url, {
          method,
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            // Token nunca aparece em log — só sai daqui dentro do header.
            Authorization: `Bearer ${accessToken}`
          },
          body: body !== undefined ? JSON.stringify(body) : undefined
        });
        clearTimeout(timeoutId);

        let corpo = null;
        try {
          corpo = await resposta.json();
        } catch {
          corpo = null;
        }

        if (resposta.ok) return corpo || {};

        const status = resposta.status;
        const metaErro = corpo?.error || {};

        if (status === 401 || status === 403) {
          throw erroTipado(ERROR_CODES.TOKEN_REVOKED, {
            providerStatus: status,
            metaErrorCode: metaErro.code,
            metaErrorTitle: metaErro.error_user_title || metaErro.type,
            mensagem: "Acesso ao WhatsApp negado ou token revogado."
          });
        }
        if (status === 429) {
          throw erroTipado(ERROR_CODES.RATE_LIMITED, {
            providerStatus: status,
            metaErrorCode: metaErro.code,
            mensagem: "A Meta limitou as requisições no momento."
          });
        }
        if (statusRetentavel(status) && tentativa < MAX_TENTATIVAS) {
          ultimoErro = erroTipado(ERROR_CODES.PROVIDER_UNAVAILABLE, { providerStatus: status });
          await aguardar(BACKOFF_BASE_MS * (tentativa + 1));
          continue;
        }
        if (statusRetentavel(status)) {
          throw erroTipado(ERROR_CODES.PROVIDER_UNAVAILABLE, {
            providerStatus: status,
            mensagem: "WhatsApp indisponível no momento."
          });
        }
        // 4xx definitivo que não é auth/rate-limit — nunca vale a pena
        // tentar de novo (destinatário/parâmetro/template inválido etc).
        throw erroTipado(ERROR_CODES.MESSAGE_FAILED, {
          providerStatus: status,
          metaErrorCode: metaErro.code,
          metaErrorTitle: metaErro.error_user_title || metaErro.type,
          mensagem: "A Meta rejeitou esta requisição."
        });
      } catch (erro) {
        clearTimeout(timeoutId);
        if (erro?.code) throw erro; // já é um erro tipado nosso — propaga
        if (tentativa < MAX_TENTATIVAS) {
          ultimoErro = erro;
          await aguardar(BACKOFF_BASE_MS * (tentativa + 1));
          continue;
        }
        const foiTimeout = erro?.name === "AbortError";
        throw erroTipado(ERROR_CODES.PROVIDER_UNAVAILABLE, {
          mensagem: foiTimeout ? "Tempo esgotado ao falar com o WhatsApp." : "Falha de rede ao falar com o WhatsApp."
        });
      }
    }
    throw ultimoErro || erroTipado(ERROR_CODES.PROVIDER_UNAVAILABLE, { mensagem: "WhatsApp indisponível." });
  }

  // O code do Embedded Signup só é trocado no backend. O App Secret vai
  // no corpo urlencoded da requisição e nunca compõe log, resposta pública
  // ou URL exibida ao cliente.
  async function exchangeEmbeddedSignupCode({ appId, appSecret, code }) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const body = new URLSearchParams({
        client_id: String(appId || ""),
        client_secret: String(appSecret || ""),
        code: String(code || "")
      });
      const response = await fazerFetch(graphUrl("oauth/access_token"), {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString()
      });
      let payload = null;
      try { payload = await response.json(); } catch { payload = null; }
      if (!response.ok || !payload?.access_token) {
        const metaError = payload?.error || {};
        throw erroTipado(response.status === 429 ? ERROR_CODES.RATE_LIMITED : ERROR_CODES.TOKEN_REVOKED, {
          providerStatus: response.status,
          metaErrorCode: metaError.code,
          metaErrorTitle: metaError.error_user_title || metaError.type,
          mensagem: "A autorização temporária da Meta não pôde ser confirmada."
        });
      }
      return {
        accessToken: String(payload.access_token),
        tokenType: String(payload.token_type || ""),
        expiresIn: Number(payload.expires_in || 0)
      };
    } catch (error) {
      if (error?.code) throw error;
      throw erroTipado(ERROR_CODES.PROVIDER_UNAVAILABLE, {
        mensagem: error?.name === "AbortError"
          ? "Tempo esgotado ao confirmar a autorização da Meta."
          : "Falha de rede ao confirmar a autorização da Meta."
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    exchangeEmbeddedSignupCode,
    async debugToken({ appId, appSecret, accessToken }) {
      return chamarGraphApi("debug_token", {
        accessToken: `${appId}|${appSecret}`,
        query: { input_token: accessToken }
      });
    },
    async getWaba({ accessToken, wabaId }) {
      return chamarGraphApi(`${wabaId}`, {
        accessToken,
        query: { fields: "id,name,currency,timezone_id,message_template_namespace" }
      });
    },
    async listPhoneNumbers({ accessToken, wabaId, after }) {
      return chamarGraphApi(`${wabaId}/phone_numbers`, {
        accessToken,
        query: {
          fields: "id,display_phone_number,verified_name,quality_rating,messaging_limit_tier,code_verification_status,status,name_status,platform_type",
          limit: 100,
          after
        }
      });
    },
    async validateConnection({ accessToken, phoneNumberId }) {
      return chamarGraphApi(`${phoneNumberId}`, {
        accessToken,
        query: { fields: "id,display_phone_number,verified_name,quality_rating" }
      });
    },
    async getPhoneNumber({ accessToken, phoneNumberId }) {
      return chamarGraphApi(`${phoneNumberId}`, {
        accessToken,
        query: { fields: "id,display_phone_number,verified_name,quality_rating,messaging_limit_tier" }
      });
    },
    async getBusinessProfile({ accessToken, phoneNumberId }) {
      return chamarGraphApi(`${phoneNumberId}/whatsapp_business_profile`, {
        accessToken,
        query: { fields: "about,address,description,email,profile_picture_url,websites,vertical" }
      });
    },
    async sendText({ accessToken, phoneNumberId, to, body, replyToId }) {
      const payload = { messaging_product: "whatsapp", to, type: "text", text: { body } };
      if (replyToId) payload.context = { message_id: replyToId };
      return chamarGraphApi(`${phoneNumberId}/messages`, { accessToken, method: "POST", body: payload });
    },
    async sendTemplate({ accessToken, phoneNumberId, to, templateName, languageCode, components }) {
      const payload = {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: languageCode },
          ...(Array.isArray(components) && components.length > 0 ? { components } : {})
        }
      };
      return chamarGraphApi(`${phoneNumberId}/messages`, { accessToken, method: "POST", body: payload });
    },
    async markRead({ accessToken, phoneNumberId, messageId }) {
      return chamarGraphApi(`${phoneNumberId}/messages`, {
        accessToken,
        method: "POST",
        body: { messaging_product: "whatsapp", status: "read", message_id: messageId }
      });
    },
    async listTemplates({ accessToken, wabaId, after }) {
      return chamarGraphApi(`${wabaId}/message_templates`, {
        accessToken,
        query: { fields: "id,name,language,category,status,quality_score,components", limit: 100, after }
      });
    },
    async subscribeWaba({ accessToken, wabaId }) {
      return chamarGraphApi(`${wabaId}/subscribed_apps`, { accessToken, method: "POST" });
    },
    async registerPhone({ accessToken, phoneNumberId, pin }) {
      return chamarGraphApi(`${phoneNumberId}/register`, {
        accessToken,
        method: "POST",
        body: { messaging_product: "whatsapp", pin: String(pin || "") }
      });
    },
    async listMessageQrCodes({ accessToken, phoneNumberId, code, format = "SVG" }) {
      return chamarGraphApi(`${phoneNumberId}/message_qrdls`, {
        accessToken,
        query: {
          fields: `code,prefilled_message,deep_link_url,qr_image_url.format(${format === "PNG" ? "PNG" : "SVG"})`,
          code
        }
      });
    },
    async createMessageQrCode({ accessToken, phoneNumberId, message, format = "SVG" }) {
      return chamarGraphApi(`${phoneNumberId}/message_qrdls`, {
        accessToken,
        method: "POST",
        body: { prefilled_message: message, generate_qr_image: format === "PNG" ? "PNG" : "SVG" }
      });
    },
    async updateMessageQrCode({ accessToken, phoneNumberId, code, message }) {
      return chamarGraphApi(`${phoneNumberId}/message_qrdls`, {
        accessToken,
        method: "POST",
        body: { code, prefilled_message: message }
      });
    },
    async deleteMessageQrCode({ accessToken, phoneNumberId, code }) {
      return chamarGraphApi(`${phoneNumberId}/message_qrdls/${code}`, { accessToken, method: "DELETE" });
    },
    async getMediaMetadata({ accessToken, mediaId }) {
      return chamarGraphApi(`${mediaId}`, { accessToken });
    }
  };
}

module.exports = { criarMetaClient };
