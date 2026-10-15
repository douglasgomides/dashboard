import assert from "node:assert/strict";
import { lerVisoes, leituraDoEstoque } from "../src/lib/crm-visoes";

assert.equal(lerVisoes(null), null);

const v = lerVisoes({
  tem_crm: true,
  abertos: 100,
  coortes: [
    { semana: "2026-09-28", leads: 50, atendidos: 40, agendados: 10, ganhos: 2, perdidos: 5, abertos: 43 },
    { semana: "2026-10-05", leads: 12, atendidos: 6, agendados: 1, ganhos: 0, perdidos: 0, abertos: 12 },
  ],
  estoque: [
    { etapa: "Contato inicial", funil: "Comercial", entrada: true, consulta: false, total: 70, ate_3: 5, de_4_a_7: 5, de_8_a_30: 10, mais_30: 50 },
    { etapa: "Consulta agendada", funil: "Comercial", entrada: false, consulta: true, total: 30, ate_3: 10, de_4_a_7: 10, de_8_a_30: 0, mais_30: 10 },
  ],
  movimentos: [{ semana: "2026-10-12", mudancas: 8, agendaram: 3, ganhos: 1, perdas: 2, reabertos: 0, leads_mexidos: 7 }],
  eventos_desde: "2026-10-16T12:00:00Z",
})!;
assert.equal(v.coortes[0].taxaAgendamento, 0.2);
assert.equal(v.coortes[0].taxaAtendimento, 0.8);
assert.equal(v.coortes[1].pouca, true);
assert.equal(v.coortes[1].taxaAgendamento, null);
assert.equal(v.resumoEstoque.parados30, 60);
assert.equal(v.resumoEstoque.pctParados, 0.6);
assert.equal(v.resumoEstoque.naEntrada, 70);
assert.equal(v.resumoEstoque.naEntrada7, 60);
const l = leituraDoEstoque(v)!;
assert.match(l, /60% dos leads abertos/);
assert.match(l, /60 lead\(s\) estão na primeira etapa/);
assert.equal(v.movimentos[0].agendaram, 3);

const vazio = lerVisoes({ tem_crm: true, abertos: 0, coortes: [], estoque: [], movimentos: [], eventos_desde: null })!;
assert.equal(leituraDoEstoque(vazio), null);
console.log("ok crm-visoes");
