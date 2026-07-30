// Revisão (multiconexão): testa resolverOuCriarChat (webhook.js) SEM
// Firestore Emulator — achado real da revisão: o mesmo cliente (mesmo
// wa_id) falando com dois números empresariais diferentes da mesma loja
// caía no MESMO chat, porque o contato era identificado só por
// ownerUid+wa_id, sem o número de origem. Estes testes provam que isso
// nunca mais acontece, e que contatos criados ANTES desta revisão
// continuam resolvendo pro mesmo chat de sempre (retrocompatibilidade).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import webhook from "../../functions/src/whatsapp/webhook.js";
import validators from "../../functions/src/whatsapp/validators.js";

const { resolverOuCriarChat } = webhook;
const { hashContato, hashContatoPorNumero } = validators;

// Fake mínimo — só o suficiente pra exercitar leitura/escrita de
// documento único (get/set com merge) e criação de doc com ID automático
// (collection().doc()), mesmo espírito de whatsapp-resolver.test.mjs.
// tentarVincularClienteCRM (busca em "clientes") sempre devolve vazio
// aqui — não é o que este teste audita.
function criarFakeDb(seed = {}) {
    const colecoes = JSON.parse(JSON.stringify(seed));
    let proximoId = 1;

    function docRef(caminho) {
        const [colecao, id] = caminho.split("/");
        return {
            id,
            async get() {
                const registro = colecoes[colecao]?.[id];
                return { exists: Boolean(registro), id, data: () => registro };
            },
            async set(valor, opcoes) {
                if (!colecoes[colecao]) colecoes[colecao] = {};
                const atual = colecoes[colecao][id] || {};
                colecoes[colecao][id] = opcoes?.merge ? { ...atual, ...valor } : { ...valor };
            }
        };
    }

    return {
        _colecoes: colecoes,
        doc(caminho) {
            return docRef(caminho);
        },
        collection(nomeColecao) {
            const query = {
                doc() {
                    const id = `auto-${proximoId++}`;
                    return docRef(`${nomeColecao}/${id}`);
                },
                where() {
                    return query;
                },
                limit() {
                    return query;
                },
                async get() {
                    return { empty: true, docs: [] };
                }
            };
            return query;
        }
    };
}

const OWNER = "owner-1";
const WA_ID = "5511999990000";

describe("whatsapp/webhook — resolverOuCriarChat (Fase revisão: colisão de chat entre números)", () => {
    it("mesmo cliente, mesmo owner, DUAS conexões diferentes -> dois chats independentes", async () => {
        const db = criarFakeDb();

        const chatId1 = await resolverOuCriarChat(db, {
            ownerUid: OWNER, waId: WA_ID, profileName: "Cliente", phoneNumberId: "P1",
            displayPhoneNumber: "5511900000001", connectionId: "conn-1", providerTimestamp: 1_700_000_000_000
        });
        const chatId2 = await resolverOuCriarChat(db, {
            ownerUid: OWNER, waId: WA_ID, profileName: "Cliente", phoneNumberId: "P2",
            displayPhoneNumber: "5511900000002", connectionId: "conn-2", providerTimestamp: 1_700_000_100_000
        });

        assert.notEqual(chatId1, chatId2, "números diferentes NUNCA podem colidir no mesmo chat");

        const contatoP1 = db._colecoes.whatsapp_contact_map[`${OWNER}_${hashContatoPorNumero(OWNER, "P1", WA_ID)}`];
        const contatoP2 = db._colecoes.whatsapp_contact_map[`${OWNER}_${hashContatoPorNumero(OWNER, "P2", WA_ID)}`];
        assert.equal(contatoP1.chatId, chatId1);
        assert.equal(contatoP2.chatId, chatId2);
    });

    it("segunda mensagem do MESMO cliente no MESMO número reaproveita o mesmo chat (nunca duplica)", async () => {
        const db = criarFakeDb();
        const chatId1 = await resolverOuCriarChat(db, {
            ownerUid: OWNER, waId: WA_ID, profileName: "Cliente", phoneNumberId: "P1",
            displayPhoneNumber: "5511900000001", connectionId: "conn-1", providerTimestamp: 1_700_000_000_000
        });
        const chatId2 = await resolverOuCriarChat(db, {
            ownerUid: OWNER, waId: WA_ID, profileName: "Cliente", phoneNumberId: "P1",
            displayPhoneNumber: "5511900000001", connectionId: "conn-1", providerTimestamp: 1_700_000_050_000
        });
        assert.equal(chatId1, chatId2);
    });

    it("compatibilidade: contato criado ANTES da revisão (hash antigo, sem phoneNumberId) continua resolvendo pro mesmo chat quando o número bate", async () => {
        const hashAntigo = hashContato(OWNER, WA_ID);
        const db = criarFakeDb({
            whatsapp_contact_map: {
                [`${OWNER}_${hashAntigo}`]: { ownerUid: OWNER, waId: WA_ID, chatId: "chat-legado-1" }
            },
            chats: {
                "chat-legado-1": { donoUID: OWNER, canal: "whatsapp", whatsappPhoneNumberId: "P1", whatsappWaId: WA_ID }
            }
        });

        const chatId = await resolverOuCriarChat(db, {
            ownerUid: OWNER, waId: WA_ID, profileName: "Cliente", phoneNumberId: "P1",
            displayPhoneNumber: "5511900000001", connectionId: "", providerTimestamp: 1_700_000_200_000
        });

        assert.equal(chatId, "chat-legado-1", "conversa legada continua no mesmo chat depois da revisão");
        // Self-heal: a próxima leitura já não precisa mais checar o chat.
        assert.equal(db._colecoes.whatsapp_contact_map[`${OWNER}_${hashAntigo}`].phoneNumberId, "P1");
    });

    it("achado real: contato legado (hash antigo) NUNCA é reaproveitado se a mensagem chegou por um número DIFERENTE", async () => {
        const hashAntigo = hashContato(OWNER, WA_ID);
        const db = criarFakeDb({
            whatsapp_contact_map: {
                [`${OWNER}_${hashAntigo}`]: { ownerUid: OWNER, waId: WA_ID, chatId: "chat-legado-1" }
            },
            chats: {
                "chat-legado-1": { donoUID: OWNER, canal: "whatsapp", whatsappPhoneNumberId: "P1", whatsappWaId: WA_ID }
            }
        });

        const chatIdNovo = await resolverOuCriarChat(db, {
            ownerUid: OWNER, waId: WA_ID, profileName: "Cliente", phoneNumberId: "P2",
            displayPhoneNumber: "5511900000002", connectionId: "conn-2", providerTimestamp: 1_700_000_300_000
        });

        assert.notEqual(chatIdNovo, "chat-legado-1", "número diferente nunca reaproveita o chat legado de outro número");
    });
});
