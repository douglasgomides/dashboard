import assert from "node:assert/strict";
import { eventoParaMensagem, canalKommo, tipoKommo } from "../api/_lib/conversas-kommo";

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

console.log("ok conversas-kommo");
