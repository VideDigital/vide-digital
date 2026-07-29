"use strict";

// WhatsApp Oficial V1 — Webhook: única porta de entrada de eventos da
// Meta (Cloud API oficial). GET faz o handshake de verificação; POST
// recebe mensagens/status reais, sempre com assinatura validada. Nunca
// confia em wabaId/phone_number_id/wa_id/ownerUid vindos do payload sem
// resolver contra whatsapp_phone_routes — ver docs/WHATSAPP_OFICIAL.md.
//
// Responde rápido (ACK) e só then continua processando — webhooks lentos
// fazem a Meta considerar o endpoint com falha e desativar a subscrição.
const { onRequest } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { REGION, COLLECTIONS, WEBHOOK_EVENT_TTL_MS } = require("./constants");
const { WHATSAPP_APP_SECRET, WHATSAPP_WEBHOOK_VERIFY_TOKEN } = require("./secrets");
const {
  verificarHandshakeWebhook,
  verificarAssinaturaWebhook,
  extrairEventosDoPayload,
  normalizarWaId,
  waIdValido,
  safeWamid,
  hashContato,
  hashEventoWebhook,
  calcularExpiracaoJanela,
  podeAtualizarStatusMensagem,
  sanitizarErroParaLog
} = require("./validators");

const ALREADY_EXISTS_CODE = 6; // grpc status ALREADY_EXISTS (usado por doc.create())

// ---------- Decisões PURAS (sem Firestore) — testadas sem emulador em
// tests/functions/whatsapp-functions.test.mjs, mesmo padrão de
// computarEventoAuditoria em functions/src/audit/triggers.js. Recebem
// dados já lidos e devolvem só o que gravar; quem chama (funções abaixo)
// faz a leitura/escrita real e junta os valores de servidor (FieldValue).
function montarPlanoChatInbound({ ownerUid, waId, profileName, phoneNumberId, providerTimestamp, contatoExistente, clienteEncontradoId }) {
  const janelaAte = calcularExpiracaoJanela(providerTimestamp);

  if (contatoExistente?.chatId) {
    return {
      novoChat: false,
      chatId: contatoExistente.chatId,
      contactUpdate: { profileName: profileName || contatoExistente.profileName || "" },
      chatUpdate: {
        whatsappUltimaMensagemClienteEm: providerTimestamp,
        whatsappJanelaAtendimentoAte: janelaAte,
        whatsappProfileName: profileName || "",
        ultimaMensagem: "",
        status: "aguardando_equipe",
        statusAdmin: "pendente"
      }
    };
  }

  return {
    novoChat: true,
    chatCreate: {
      donoUID: ownerUid,
      emailDono: ownerUid,
      clienteNome: profileName || `WhatsApp ${waId.slice(-4)}`,
      canal: "whatsapp",
      status: "nova",
      statusAdmin: "pendente",
      naoLidasLoja: 1,
      naoLidasCliente: 0,
      whatsappPhoneNumberId: phoneNumberId,
      whatsappWaId: waId,
      whatsappProfileName: profileName || "",
      whatsappUltimaMensagemClienteEm: providerTimestamp,
      whatsappJanelaAtendimentoAte: janelaAte,
      whatsappConnectionOwnerUid: ownerUid,
      ...(clienteEncontradoId ? { clienteId: clienteEncontradoId } : {}),
      timestamp: Date.now()
    },
    contactCreate: { ownerUid, waId, profileName: profileName || "" }
  };
}

function montarMensagemInboundDoc(evento) {
  return {
    sender: "cliente",
    autorTipo: "cliente",
    canal: "whatsapp",
    direction: "inbound",
    provider: "meta_whatsapp_cloud",
    providerMessageId: evento.wamid,
    providerStatus: "received",
    providerTimestamp: evento.providerTimestamp,
    messageType: evento.messageType,
    ...(evento.replyToId ? { providerReplyToId: evento.replyToId } : {}),
    ...(evento.texto ? { texto: evento.texto } : {}),
    ...(evento.mediaMetadata ? { mediaMetadata: evento.mediaMetadata } : {}),
    timestamp: evento.providerTimestamp
  };
}

// Decide se/como aplicar um status recebido da Meta a uma mensagem já
// conhecida — nunca regride (delivered->sent, read->delivered), nunca
// cruza tenant, e só pede notificação de falha quando de fato aplica.
function decidirAtualizacaoStatus({ dadosAtuais, ownerUid, evento }) {
  if (!dadosAtuais) return { aplicar: false, motivo: "mensagem_desconhecida" };
  if (dadosAtuais.ownerUid !== ownerUid) return { aplicar: false, motivo: "tenant_diferente" };
  if (!podeAtualizarStatusMensagem(dadosAtuais.providerStatus, evento.providerStatus)) {
    return { aplicar: false, motivo: "regressao_ou_invalido" };
  }

  const mensagemAtualizacao = { providerStatus: evento.providerStatus };
  if (evento.providerStatus === "failed") {
    mensagemAtualizacao.failedCode = evento.codigoErro || "";
    mensagemAtualizacao.failedTitle = evento.tituloErroSeguro || "";
  }

  return {
    aplicar: true,
    providerStatus: evento.providerStatus,
    mensagemAtualizacao,
    notificarFalha: evento.providerStatus === "failed",
    chatId: dadosAtuais.chatId || "",
    messageId: dadosAtuais.messageId || ""
  };
}

async function resolverOwnerUidPorPhoneNumberId(db, phoneNumberId) {
  if (!phoneNumberId) return "";
  const snap = await db.doc(`${COLLECTIONS.PHONE_ROUTES}/${phoneNumberId}`).get();
  if (!snap.exists) return "";
  const dados = snap.data() || {};
  if (dados.connectionStatus === "revoked") return "";
  return String(dados.ownerUid || "");
}

// Dedupe leve — a mesma reentrega de webhook da Meta (mesmo wamid/status,
// mesmo timestamp) não deve gerar duas passagens de processamento. Não é
// a proteção principal contra duplicidade de MENSAGEM (essa é o
// whatsapp_message_map, via .create() atômico) — é uma camada extra e
// barata pra evitar reprocessar o evento inteiro.
async function jaProcessado(db, chaveEvento) {
  const ref = db.doc(`${COLLECTIONS.WEBHOOK_EVENTS}/${chaveEvento}`);
  try {
    await ref.create({
      processedAt: FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + WEBHOOK_EVENT_TTL_MS)
    });
    return false;
  } catch (erro) {
    if (erro?.code === ALREADY_EXISTS_CODE) return true;
    throw erro;
  }
}

// Busca best-effort por um cliente do CRM 360 já cadastrado com este
// telefone, no mesmo tenant — mesma estratégia de crm360.js
// (resolverIdentidadeCliente/encontrarCorrespondencias): match único
// vincula, zero fica sem vínculo (candidato, nunca criado sozinho),
// múltiplos fica sem vínculo (decisão humana).
async function tentarVincularClienteCRM(db, ownerUid, waId) {
  try {
    const snap = await db.collection("clientes")
      .where("tenantId", "==", ownerUid)
      .where("telefoneNormalizado", "==", waId)
      .limit(3)
      .get();
    if (snap.size === 1) return snap.docs[0].id;
    return "";
  } catch {
    return "";
  }
}

async function resolverOuCriarChat(db, { ownerUid, waId, profileName, phoneNumberId, providerTimestamp }) {
  const contactHash = hashContato(ownerUid, waId);
  const contactRef = db.doc(`${COLLECTIONS.CONTACT_MAP}/${ownerUid}_${contactHash}`);
  const contactSnap = await contactRef.get();
  const contatoExistente = contactSnap.exists ? contactSnap.data() : null;
  const clienteEncontradoId = contatoExistente?.chatId ? "" : await tentarVincularClienteCRM(db, ownerUid, waId);

  const plano = montarPlanoChatInbound({ ownerUid, waId, profileName, phoneNumberId, providerTimestamp, contatoExistente, clienteEncontradoId });

  if (!plano.novoChat) {
    await contactRef.set({ ...plano.contactUpdate, lastSeenAt: FieldValue.serverTimestamp() }, { merge: true });
    await db.doc(`chats/${plano.chatId}`).set({
      ...plano.chatUpdate,
      naoLidasLoja: FieldValue.increment(1),
      atualizadoEm: FieldValue.serverTimestamp()
    }, { merge: true });
    return plano.chatId;
  }

  const chatRef = db.collection("chats").doc();
  await chatRef.set({
    ...plano.chatCreate,
    criadoEm: FieldValue.serverTimestamp(),
    atualizadoEm: FieldValue.serverTimestamp()
  });
  await contactRef.set({
    ...plano.contactCreate,
    contactHash,
    chatId: chatRef.id,
    firstSeenAt: FieldValue.serverTimestamp(),
    lastSeenAt: FieldValue.serverTimestamp()
  }, { merge: true });

  return chatRef.id;
}

async function processarMensagemInbound(db, ownerUid, evento) {
  const waId = normalizarWaId(evento.waId);
  if (!waIdValido(waId) || !evento.wamid) return;

  const safeId = safeWamid(evento.wamid);
  const messageMapRef = db.doc(`${COLLECTIONS.MESSAGE_MAP}/${safeId}`);
  try {
    await messageMapRef.create({
      ownerUid,
      direction: "inbound",
      providerStatus: "received",
      providerTimestamp: evento.providerTimestamp,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastStatusAt: FieldValue.serverTimestamp()
    });
  } catch (erro) {
    if (erro?.code === ALREADY_EXISTS_CODE) return; // reentrega — já processada
    throw erro;
  }

  const chatId = await resolverOuCriarChat(db, {
    ownerUid,
    waId,
    profileName: evento.profileName,
    phoneNumberId: evento.phoneNumberId,
    providerTimestamp: evento.providerTimestamp
  });

  const chatRef = db.doc(`chats/${chatId}`);
  const mensagemRef = await chatRef.collection("mensagens").add({
    ...montarMensagemInboundDoc(evento),
    criadoEm: FieldValue.serverTimestamp()
  });

  await chatRef.set({ ultimaMensagem: evento.texto || `[${evento.messageType}]` }, { merge: true });

  await chatRef.collection("eventos").add({
    tenantId: ownerUid,
    lojaId: ownerUid,
    chatId,
    tipo: "mensagem_cliente_recebida",
    categoria: "mensagem",
    autorUid: "",
    autorTipo: "cliente",
    origem: "cliente",
    criadoEm: FieldValue.serverTimestamp(),
    versaoSchema: 1
  });

  await messageMapRef.set({ chatId, messageId: mensagemRef.id, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

async function processarStatusOutbound(db, ownerUid, evento) {
  if (!evento.wamid || !evento.providerStatus) return;
  const safeId = safeWamid(evento.wamid);
  const messageMapRef = db.doc(`${COLLECTIONS.MESSAGE_MAP}/${safeId}`);
  const snap = await messageMapRef.get();
  const dadosAtuais = snap.exists ? snap.data() : null;

  const decisao = decidirAtualizacaoStatus({ dadosAtuais, ownerUid, evento });
  if (!decisao.aplicar) return;

  await messageMapRef.set({
    providerStatus: decisao.providerStatus,
    lastStatusAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  if (decisao.chatId && decisao.messageId) {
    const atualizacao = { ...decisao.mensagemAtualizacao };
    if (decisao.providerStatus === "failed") atualizacao.failedAt = FieldValue.serverTimestamp();
    await db.doc(`chats/${decisao.chatId}/mensagens/${decisao.messageId}`).set(atualizacao, { merge: true }).catch(() => {});
  }

  if (decisao.notificarFalha) {
    await db.collection("notificacoes").add({
      destinatarios: [ownerUid],
      titulo: "Falha ao enviar mensagem no WhatsApp",
      mensagem: "Uma mensagem do WhatsApp Oficial não pôde ser entregue. Veja a conversa na Central de Atendimento.",
      lidoPor: [],
      criadoEm: Date.now()
    }).catch(() => {});
  }
}

async function processarEventosWebhook(body) {
  const db = getFirestore();
  const eventos = extrairEventosDoPayload(body);

  for (const evento of eventos) {
    try {
      const ownerUid = await resolverOwnerUidPorPhoneNumberId(db, evento.phoneNumberId);
      if (!ownerUid) continue; // número não roteado a nenhum tenant conectado — descarta

      const chaveDedupe = hashEventoWebhook({
        ownerUid,
        eventType: evento.categoria,
        providerId: evento.wamid,
        providerTimestamp: evento.providerTimestamp
      });
      if (await jaProcessado(db, chaveDedupe)) continue;

      if (evento.categoria === "mensagem") {
        await processarMensagemInbound(db, ownerUid, evento);
      } else if (evento.categoria === "status") {
        await processarStatusOutbound(db, ownerUid, evento);
      }
    } catch (erro) {
      logger.error("whatsappWebhook: falha ao processar evento", sanitizarErroParaLog({
        code: erro?.code || "WHATSAPP_WEBHOOK_PROCESSING_ERROR",
        funcao: "processarEventosWebhook"
      }));
    }
  }
}

const whatsappWebhook = onRequest(
  { region: REGION, secrets: [WHATSAPP_APP_SECRET, WHATSAPP_WEBHOOK_VERIFY_TOKEN] },
  async (req, res) => {
    if (req.method === "GET") {
      const desafio = verificarHandshakeWebhook({
        mode: req.query["hub.mode"],
        token: req.query["hub.verify_token"],
        challenge: req.query["hub.challenge"]
      }, WHATSAPP_WEBHOOK_VERIFY_TOKEN.value());
      if (desafio === null) {
        res.status(403).send("Forbidden");
        return;
      }
      res.status(200).send(desafio);
      return;
    }

    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const assinaturaValida = verificarAssinaturaWebhook(
      req.rawBody,
      req.get("x-hub-signature-256"),
      WHATSAPP_APP_SECRET.value()
    );
    if (!assinaturaValida) {
      logger.warn("whatsappWebhook: assinatura inválida recebida");
      res.status(401).send("Invalid signature");
      return;
    }

    // ACK imediato — a Meta espera resposta rápida. O processamento real
    // continua depois, sem retornar antes de terminar (o runtime mantém a
    // instância viva até esta função async completar).
    res.status(200).send("EVENT_RECEIVED");

    try {
      await processarEventosWebhook(req.body);
    } catch (erro) {
      logger.error("whatsappWebhook: falha inesperada ao processar payload", sanitizarErroParaLog({
        code: erro?.code || "WHATSAPP_WEBHOOK_FATAL",
        funcao: "whatsappWebhook"
      }));
    }
  }
);

module.exports = {
  whatsappWebhook,
  processarEventosWebhook,
  montarPlanoChatInbound,
  montarMensagemInboundDoc,
  decidirAtualizacaoStatus
};
