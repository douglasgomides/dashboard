import assert from "node:assert/strict";
import { eventoParaMensagem, canalKommo, tipoKommo, chavesConversaKommo } from "../api/_lib/conversas-kommo";

const ev = { type: "incoming_chat_message", entity_id: 55, entity_type: "lead", created_by: 0, created_at: 1760000000, value_after: [{ message: { id: "abc", origin: "waba", talk_id: 9 } }] };
const m = eventoParaMensagem(ev)!;
assert.equal(m.direcao, "entrada");
assert.equal(m.talkId, "9");
assert.equal(m.leadId, "55");
assert.equal(m.enviadaEm, new Date(1760000000 * 1000).toISOString());
assert.equal(eventoParaMensagem({ ...ev, type: "outgoing_chat_message" })!.direcao, "saida");
assert.equal(eventoParaMensagem({ ...ev, type: "lead_added" }), null);
assert.equal(eventoParaMensagem({ ...ev, value_after: [{ message: { id: "x" } }] }), null);
assert.equal(eventoParaMensagem({ ...ev, entity_type: "contact" })!.leadId, null);

assert.equal(canalKommo("waba"), "whatsapp");
assert.equal(canalKommo("instagram_business"), "instagram");
assert.equal(canalKommo(null), "chat");
assert.equal(tipoKommo("voice"), "AUDIO");
assert.equal(tipoKommo("text"), "texto");
assert.equal(tipoKommo(undefined), "texto");

// Conversa = atendimento do lead: continua com menos de 7 dias de intervalo; depois começa outra; sem lead, fica o talk.
const ch = chavesConversaKommo([
  { messageId: "a", leadId: "55", talkId: "9", enviadaEm: "2026-10-20T02:30:00Z" },
  { messageId: "b", leadId: "55", talkId: "10", enviadaEm: "2026-10-22T15:00:00Z" },
  { messageId: "c", leadId: "55", talkId: "11", enviadaEm: "2026-11-05T15:00:00Z" },
  { messageId: "d", leadId: null, talkId: "12", enviadaEm: "2026-10-22T15:00:00Z" },
  { messageId: "e", leadId: "77", talkId: "13", enviadaEm: "2026-10-22T15:00:00Z" },
], new Map([["77", { externo_id: "lead:77:2026-10-18", ultima_msg_em: "2026-10-20T10:00:00Z" }]]));
assert.equal(ch.get("a"), "lead:55:2026-10-19");
assert.equal(ch.get("b"), "lead:55:2026-10-19");
assert.equal(ch.get("c"), "lead:55:2026-11-05");
assert.equal(ch.get("d"), "12");
assert.equal(ch.get("e"), "lead:77:2026-10-18", "continua o atendimento já gravado");

console.log("ok conversas-kommo");
