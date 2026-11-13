import assert from "node:assert/strict";
import { eventoParaMensagem, canalKommo, tipoKommo, chavesConversaKommo, autorDaSaidaKommo, linhaDaMensagemKommo, atendimentosAbertos } from "../api/_lib/conversas-kommo";

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

// Conversa gravada antes do agrupamento por lead (chave = id do talk): a mensagem desse talk continua nela, em vez
// de abrir "lead:<id>:<dia>" com as mesmas mensagens. Ids inventados.
const base = [
  { messageId: "a", leadId: "55", talkId: "9", enviadaEm: "2026-10-20T02:30:00Z" },
  { messageId: "b", leadId: "55", talkId: "10", enviadaEm: "2026-10-22T15:00:00Z" },
  { messageId: "c", leadId: "55", talkId: "11", enviadaEm: "2026-11-05T15:00:00Z" },
  { messageId: "d", leadId: null, talkId: "12", enviadaEm: "2026-10-22T15:00:00Z" },
];
const leg = chavesConversaKommo(base, new Map(), new Map([["9", "9"]]));
assert.equal(leg.get("a"), "9", "talk 9 já gravado com a chave antiga");
assert.equal(leg.get("b"), "lead:55:2026-10-22", "o talk 9 não abre nem estende o atendimento do lead");
assert.equal(leg.get("c"), "lead:55:2026-11-05");
assert.equal(leg.get("d"), "12");
const semLegadas = chavesConversaKommo(base, new Map());
assert.deepEqual([...chavesConversaKommo(base, new Map(), new Map())], [...semLegadas], "Map vazio = como hoje");
assert.equal(semLegadas.get("a"), "lead:55:2026-10-19");
assert.equal(semLegadas.get("b"), "lead:55:2026-10-19");
// Com limite: só a mensagem até a última já gravada na conversa antiga volta para ela; a nova, depois disso, segue o
// lead (senão a sincronização de toda hora levaria o atendimento novo para a conversa antiga e duplicaria a última hora).
const lim = chavesConversaKommo([
  { messageId: "v1", leadId: "55", talkId: "9", enviadaEm: "2026-09-01T12:00:00Z" },
  { messageId: "v2", leadId: "55", talkId: "9", enviadaEm: "2026-09-10T12:00:00Z" },
  { messageId: "n1", leadId: "55", talkId: "9", enviadaEm: "2026-11-02T12:00:00Z" },
], new Map(), new Map([["9", { externo_id: "9", ate: "2026-09-10T12:00:00+00:00" }]]));
assert.equal(lim.get("v1"), "9");
assert.equal(lim.get("v2"), "9", "mesmo instante em outro formato de data conta como já gravada");
assert.equal(lim.get("n1"), "lead:55:2026-11-02");

// Atendimento aberto de cada lead para uma janela: o mais recente que já tinha começado até o fim da janela.
// Reprocessar uma janela antiga não pode jogar a mensagem num atendimento posterior do mesmo lead (duplicaria).
const convs = [
  { lead: "55", externo_id: "lead:55:2026-10-31", iniciada_em: "2026-10-31T13:00:00+00:00", ultima_msg_em: "2026-11-02T18:00:00+00:00" },
  { lead: "55", externo_id: "lead:55:2026-11-10", iniciada_em: "2026-11-10T13:00:00+00:00", ultima_msg_em: "2026-11-12T18:00:00+00:00" },
  { lead: "77", externo_id: "lead:77:2026-11-11", iniciada_em: "2026-11-11T13:00:00+00:00", ultima_msg_em: null },
];
const agora = atendimentosAbertos(convs, Date.parse("2026-11-13T00:00:00Z"));
assert.equal(agora.get("55")?.externo_id, "lead:55:2026-11-10", "sincronização normal: o mais recente, como hoje");
assert.equal(agora.has("77"), false, "sem última mensagem não abre atendimento");
const antes = atendimentosAbertos(convs, Date.parse("2026-11-02T03:00:00Z"));
assert.equal(antes.get("55")?.externo_id, "lead:55:2026-10-31");
assert.equal(atendimentosAbertos(convs, Date.parse("2026-10-01T03:00:00Z")).size, 0, "antes de qualquer atendimento");
const re = chavesConversaKommo([{ messageId: "r1", leadId: "55", talkId: "20", enviadaEm: "2026-11-01T12:00:00Z" }], antes);
assert.equal(re.get("r1"), "lead:55:2026-10-31", "reprocesso: a mensagem volta para o atendimento em que já estava");

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
