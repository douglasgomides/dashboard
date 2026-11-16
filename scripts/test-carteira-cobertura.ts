// Carteira com cobertura (debug numeros-nao-batem-fonte, 16/11/2026): dia sem linha ou com o número nulo nunca vira 0, e a variação
// contra os 30 dias anteriores só aparece com os dois lados medidos em todos os dias. Antes, "Chamaram" nulo no começo do período
// anterior somava 0 e inflava a variação.
// node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-carteira-cobertura.ts
import assert from "node:assert/strict";
import { comparavelNaCarteira, numerosDaCarteiraComCobertura, rotuloAgendaramDaCarteira } from "../src/lib/leitura/fatos-resultados";

const janelas = { iniAntes: "2026-09-17", fimAntes: "2026-10-16", iniAtual: "2026-10-17", fimAtual: "2026-11-15" };
const dia = (de: string, i: number) => new Date(Date.parse(`${de}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
const campos = ["mandaram_mensagem", "agendaram", "negociacao"];

const linhas = [
  // Clínica A: 30 dias inteiros nos dois lados; no anterior, "Chamaram" só começou a ser medido no 15º dia.
  ...Array.from({ length: 30 }, (_, i) => ({ client_id: "a", dia: dia(janelas.iniAtual, i), mandaram_mensagem: 10, agendaram: 1, negociacao: i })),
  ...Array.from({ length: 30 }, (_, i) => ({ client_id: "a", dia: dia(janelas.iniAntes, i), mandaram_mensagem: i < 14 ? null : 10, agendaram: 1, negociacao: 100 + i })),
  // Clínica B: faltam 3 dias de linha no período atual.
  ...Array.from({ length: 27 }, (_, i) => ({ client_id: "b", dia: dia(janelas.iniAtual, i), mandaram_mensagem: 2, agendaram: 0, negociacao: 1 })),
  ...Array.from({ length: 30 }, (_, i) => ({ client_id: "b", dia: dia(janelas.iniAntes, i), mandaram_mensagem: 2, agendaram: 0, negociacao: 1 })),
  // Clínica C: nunca mediu (todas as linhas nulas, como uma clínica sem CRM).
  ...Array.from({ length: 30 }, (_, i) => ({ client_id: "c", dia: dia(janelas.iniAtual, i), mandaram_mensagem: null, agendaram: null, negociacao: null })),
  // Fora das duas janelas: não entra.
  { client_id: "a", dia: "2026-11-16", mandaram_mensagem: 999, agendaram: 999, negociacao: 999 },
];

const m = numerosDaCarteiraComCobertura(linhas, janelas, campos);
const a = m.get("a")!;
assert.deepEqual(a.atual.mandaram_mensagem, { valor: 300, medidos: 30, de: 30, completo: true });
// O anterior soma só os 16 dias medidos e diz que são 16 de 30 (antes: 160 como se fossem 30 dias).
assert.deepEqual(a.antes.mandaram_mensagem, { valor: 160, medidos: 16, de: 30, completo: false });
assert.equal(comparavelNaCarteira(a.atual.mandaram_mensagem, a.antes.mandaram_mensagem), false, "lado anterior incompleto: sem variação");
assert.equal(comparavelNaCarteira(a.atual.agendaram, a.antes.agendaram), true);
// Fila: o último dia medido, nunca a soma.
assert.equal(a.atual.negociacao.valor, 29);
assert.equal(a.antes.negociacao.valor, 129);

const b = m.get("b")!;
assert.deepEqual(b.atual.mandaram_mensagem, { valor: 54, medidos: 27, de: 30, completo: true });
// 27 de 30 já passa da régua de 80% da Hoje, mas a Carteira não compara com um lado de 30 dias inteiros.
assert.equal(comparavelNaCarteira(b.atual.mandaram_mensagem, b.antes.mandaram_mensagem), false);
// Medido 0 em todos os dias é 0 de verdade (não é falta de dado).
assert.deepEqual(b.antes.agendaram, { valor: 0, medidos: 30, de: 30, completo: true });

const c = m.get("c")!;
assert.equal(c.atual.mandaram_mensagem.valor, null, "nunca medido é sem dado, não 0");
assert.equal(c.atual.mandaram_mensagem.medidos, 0);
assert.equal(c.antes.mandaram_mensagem.valor, null, "sem nenhuma linha no anterior: sem dado");
assert.equal(comparavelNaCarteira(c.atual.agendaram, c.antes.agendaram), false);

// G2 na Carteira (16/11/2026): o CRM da clínica não registra agendamento (função crm_agendamento_registrado). O número é o da
// conversa e o nome diz isso; sem a resposta do banco, o rótulo fica como antes.
assert.deepEqual(rotuloAgendaramDaCarteira(false).rotulo, "Agendaram pela conversa");
assert.match(rotuloAgendaramDaCarteira(false).titulo ?? "", /^O CRM não registra isso/);
assert.deepEqual(rotuloAgendaramDaCarteira(true), { rotulo: "Agendaram", titulo: null });
assert.deepEqual(rotuloAgendaramDaCarteira(undefined), { rotulo: "Agendaram", titulo: null }, "sem a função no banco, nada muda");
console.log("test-carteira-cobertura: ok");
