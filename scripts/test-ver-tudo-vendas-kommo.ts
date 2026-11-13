// As respostas dos blocos dos Detalhes de De onde vêm › Por origem (quick-ver-tudo-abas, 13/11/2026). Só dados fictícios.
// node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-ver-tudo-vendas-kommo.ts
import assert from "node:assert/strict";
import { checarCabeca, textoDaCabeca, type CabecaDoBloco } from "../src/lib/leitura/cabeca-do-bloco";
import { cabecaDaFatiaDeCadaOrigem, cabecaDaTabelaPorFonte, cabecaDasEtapas, cabecaDoProcedimento } from "../src/lib/leitura/ver-tudo-vendas-kommo";

const ok = (c: CabecaDoBloco, esperado: string) => {
  assert.deepEqual(checarCabeca(c), [], `cabeça válida: ${textoDaCabeca(c)}`);
  assert.equal(textoDaCabeca(c), esperado);
};

ok(cabecaDaFatiaDeCadaOrigem([{ rotulo: "Instagram", valor: 300 }, { rotulo: "Indicação", valor: 100 }, { rotulo: "Não informado", valor: 20 }]), '"Instagram" tem 71% dos leads do CRM.');
// "Outras origens" junta as pequenas: nunca vira "a maior origem".
ok(cabecaDaFatiaDeCadaOrigem([{ rotulo: "A", valor: 10 }, { rotulo: "Outras origens", valor: 90 }]), '"A" tem 10% dos leads do CRM.');
assert.equal(cabecaDaFatiaDeCadaOrigem([]).tipo, "falta");
// Nome longo demais: a frase sem o nome.
ok(cabecaDaFatiaDeCadaOrigem([{ rotulo: "x".repeat(80), valor: 5 }, { rotulo: "B", valor: 5 }]), "A maior origem tem 50% dos leads do CRM.");

ok(cabecaDaTabelaPorFonte({ origens: 9, noGrafico: 6, leadsForaDoGrafico: 25, fechados: 0 }), "3 origens não cabem no gráfico e somam 25 leads.");
ok(cabecaDaTabelaPorFonte({ origens: 7, noGrafico: 6, leadsForaDoGrafico: 4, fechados: 0 }), "1 origem não cabe no gráfico e soma 4 leads.");
ok(cabecaDaTabelaPorFonte({ origens: 3, noGrafico: 3, leadsForaDoGrafico: 0, fechados: 12 }), "12 cards foram fechados no CRM sem dizer se ganharam ou perderam.");
assert.equal(cabecaDaTabelaPorFonte({ origens: 3, noGrafico: 3, leadsForaDoGrafico: 0, fechados: 0 }).tipo, "falta");

ok(
  cabecaDoProcedimento([{ chave: "Botox", total: 40, ganhos: 12 }, { chave: "Peeling", total: 30, ganhos: 3 }, { chave: "Não informado", total: 90, ganhos: 50 }], "Não informado"),
  '"Botox" é o procedimento com mais ganhos: 12.',
);
ok(cabecaDoProcedimento([{ chave: "Botox", total: 40, ganhos: 0 }], "Não informado"), '"Botox" é o procedimento com mais leads: 40, nenhum com ganho.');
assert.equal(textoDaCabeca(cabecaDoProcedimento([{ chave: "Não informado", total: 90, ganhos: 50 }], "Não informado")), "Falta dado: o CRM não tem o tipo de procedimento preenchido nos cards");

ok(cabecaDasEtapas([{ pipeline: "Funil", etapa: "Novo contato", total: 120 }, { pipeline: "Funil", etapa: "Agendado", total: 30 }]), 'A etapa com mais cards é "Novo contato": 120 de 150.');
assert.equal(cabecaDasEtapas([]).tipo, "falta");

// Nenhuma frase compara a clínica com outras nem promete.
for (const c of [cabecaDaFatiaDeCadaOrigem([{ rotulo: "Instagram", valor: 3 }]), cabecaDasEtapas([{ pipeline: "p", etapa: "e", total: 3 }])]) {
  assert.doesNotMatch(textoDaCabeca(c), /clínicas|carteira|média|vai |deve /i);
}

console.log("test-ver-tudo-vendas-kommo: ok");
