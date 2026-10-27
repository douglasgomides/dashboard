import assert from "node:assert/strict";
import { conclusoesOrcamentos, lerOrcamentosPorTipo, MIN_ITENS } from "../src/lib/orcamentos-tipo";

// Números no formato da RPC (como os do painel Orçamentos em 90 dias), com bigint vindo como texto.
const bruto = {
  itens: 815, cards_sem_procedimento: 0, pessoas: 232, pessoas_aprovadas: 213, valor_aprovado: 838399.9, valor_por_paciente: 4532,
  pessoas_com_consulta: 69, consulta_e_compra: 36, esfriados: 122,
  tipos: [
    { tipo: "Medicação", itens: "241", pessoas: 115, aprovados: 201, pessoas_aprovadas: 98, valor_aprovado: 347792, aprovados_sem_valor: 79, perdidos: 0, esfriados: 18, em_aberto: 22 },
    { tipo: "Programa ou clube", itens: 142, pessoas: 120, aprovados: 79, pessoas_aprovadas: 76, valor_aprovado: 205560, aprovados_sem_valor: 14, perdidos: 0, esfriados: 29, em_aberto: 34 },
    { tipo: "Exame", itens: 161, pessoas: 103, aprovados: 84, pessoas_aprovadas: 61, valor_aprovado: 57550, aprovados_sem_valor: 33, perdidos: 1, esfriados: 75, em_aberto: 40 },
  ],
  procedimentos: [{ procedimento: "CALORIMETRIA", tipo: "Exame", corrigido: false, itens: 30 }],
};
const d = lerOrcamentosPorTipo(bruto);
assert.ok(d);
assert.equal(d.tipos[0].itens, 241, "bigint em texto vira número");
assert.equal(d.procedimentos[0].corrigido, false);

const c = conclusoesOrcamentos(d);
assert.ok(c.some((t) => t.includes("815 itens") && t.includes("232 pacientes")), "itens x pacientes");
assert.ok(c.some((t) => t.includes("R$") && t.includes("4.532")), "valor por paciente");
assert.ok(c.some((t) => t.startsWith("Medicação responde por 57%")), "tipo dominante");
assert.ok(c.some((t) => t.includes("parados há mais de 60 dias")), "esfriou");
assert.ok(c.some((t) => t.includes("perto de 100%")), "perdido quase nunca marcado");
assert.ok(c.some((t) => t.includes("sem valor no card")), "aprovado sem valor");

// Amostra pequena não gera conclusão; resposta vazia não quebra.
assert.deepEqual(conclusoesOrcamentos({ ...d, itens: MIN_ITENS - 1 }), []);
assert.equal(lerOrcamentosPorTipo(null), null);
assert.equal(lerOrcamentosPorTipo({})?.tipos.length, 0);

// Uma pessoa por card e perdidos marcados: nada de alarme.
const limpo = lerOrcamentosPorTipo({ itens: 40, pessoas: 40, valor_por_paciente: null, esfriados: 0,
  tipos: [{ tipo: "Consulta", itens: 40, aprovados: 25, perdidos: 10, esfriados: 0, em_aberto: 5, aprovados_sem_valor: 0, valor_aprovado: 25000 }] })!;
assert.deepEqual(conclusoesOrcamentos(limpo), ["Consulta responde por 100% do valor aprovado. Médias que juntam todos os tipos ficam puxadas por ele."]);
console.log("orcamentos-tipo ok");
