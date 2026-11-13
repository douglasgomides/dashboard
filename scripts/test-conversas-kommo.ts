import assert from "node:assert/strict";
import { eventoParaMensagem, canalKommo, tipoKommo, chavesConversaKommo, autorDaSaidaKommo, linhaDaMensagemKommo } from "../api/_lib/conversas-kommo";

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

// Autor: saída com created_by > 0 é uma pessoa da equipe ("Atendente"); 0 ou sem valor fica "Clínica" (a regra de
// robô por horário continua valendo para ela). O tipo não muda: o Kommo não entrega o texto de nenhuma saída.
assert.equal(autorDaSaidaKommo({ direcao: "saida", criadoPor: 123 }), "Atendente");
assert.equal(autorDaSaidaKommo({ direcao: "saida", criadoPor: 0 }), "Clínica");
assert.equal(autorDaSaidaKommo({ direcao: "saida", criadoPor: null }), "Clínica");
assert.equal(autorDaSaidaKommo({ direcao: "saida", criadoPor: -1 }), "Clínica", "só número positivo é pessoa");
assert.equal(autorDaSaidaKommo({ direcao: "entrada", criadoPor: 123 }), "Paciente");
assert.equal(autorDaSaidaKommo({ direcao: "entrada", criadoPor: 0 }), "Paciente");

const saidaGente = eventoParaMensagem({ ...ev, id: "ev2", type: "outgoing_chat_message", created_by: 456, value_after: [{ message: { id: "out1", origin: "waba", talk_id: 9 } }] })!;
assert.equal(saidaGente.criadoPor, 456);
assert.deepEqual(linhaDaMensagemKommo(saidaGente, "conv-1", "cli-1", undefined), {
  conversa_id: "conv-1", client_id: "cli-1", direcao: "saida", autor: "Atendente", texto: null,
  tipo: "kommo_sem_texto", enviada_em: saidaGente.enviadaEm, externo_id: "out1",
});
const saidaSemGente = eventoParaMensagem({ ...ev, type: "outgoing_chat_message", created_by: 0 })!;
const linhaSemGente = linhaDaMensagemKommo(saidaSemGente, "conv-1", "cli-1", undefined);
assert.equal(linhaSemGente.autor, "Clínica");
assert.equal(linhaSemGente.tipo, "kommo_sem_texto");
const semCampo = eventoParaMensagem({ type: "outgoing_chat_message", entity_id: 55, entity_type: "lead", created_at: 1760000000, value_after: [{ message: { id: "out2", talk_id: 9 } }] })!;
assert.equal(linhaDaMensagemKommo(semCampo, "conv-1", "cli-1", undefined).autor, "Clínica", "sem created_by fica Clínica");
// Texto do webhook só vale para a recebida: a saída fica sem texto mesmo se vier algo (o Kommo não manda o da clínica).
assert.equal(linhaDaMensagemKommo(saidaGente, "conv-1", "cli-1", { texto: "oi", tipo: "text" }).texto, null);
assert.equal(linhaDaMensagemKommo(saidaGente, "conv-1", "cli-1", { texto: "oi", tipo: "text" }).tipo, "kommo_sem_texto");

// Recebida: autor Paciente, texto e tipo do webhook quando existe; sem webhook, sem texto.
assert.deepEqual(linhaDaMensagemKommo(m, "conv-1", "cli-1", { texto: "quero marcar", tipo: "text" }), {
  conversa_id: "conv-1", client_id: "cli-1", direcao: "entrada", autor: "Paciente", texto: "quero marcar",
  tipo: "texto", enviada_em: m.enviadaEm, externo_id: "abc",
});
assert.equal(linhaDaMensagemKommo(m, "conv-1", "cli-1", { texto: null, tipo: "voice" }).tipo, "AUDIO");
assert.equal(linhaDaMensagemKommo(m, "conv-1", "cli-1", undefined).tipo, "kommo_sem_texto");
assert.equal(linhaDaMensagemKommo(m, "conv-1", "cli-1", undefined).texto, null);

console.log("ok conversas-kommo");
