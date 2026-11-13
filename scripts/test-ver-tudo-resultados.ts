// As respostas dos blocos do "Ver tudo" de Resultados da clínica e o gráfico por dia (quick-ver-tudo, 13/11/2026): UMA frase de até 90
// caracteres, com o número em destaque, tirada dos dados do próprio bloco; sem dado, "Falta dado". Só dados fictícios.
// node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-ver-tudo-resultados.ts
import assert from "node:assert/strict";
import { cabecaDaSerieDiaria, cabecaDoComparativo, checarCabeca, textoDaCabeca, type CabecaDoBloco } from "../src/lib/leitura/cabeca-do-bloco";
import { cabecaDasAnalises, cabecaDasExplicacoes, cabecaDoDinheiro, cabecaDoInstagramDoPeriodo, cabecaDoRetorno } from "../src/lib/leitura/ver-tudo-resultados";

const ok = (c: CabecaDoBloco, esperado: string) => {
  assert.deepEqual(checarCabeca(c), [], `cabeça válida: ${textoDaCabeca(c)}`);
  assert.equal(textoDaCabeca(c), esperado);
};

// ---------- gráfico por dia (genérico) ----------
const dia = (k: number) => new Date(Date.UTC(2026, 9, 5 + k, 12)).toISOString().slice(0, 10);
ok(cabecaDaSerieDiaria(Array.from({ length: 28 }, (_, k) => ({ dia: dia(k), valor: new Date(`${dia(k)}T12:00:00Z`).getUTCDay() === 3 ? 40 : 20 })), "contatos"), "Quarta é o dia com mais contatos: 40 em média.");
ok(cabecaDaSerieDiaria(Array.from({ length: 10 }, (_, k) => ({ dia: dia(k), valor: 30 })), "contatos"), "Os contatos vieram parecidos todo dia: 30 por dia, em média.");
ok(cabecaDaSerieDiaria(Array.from({ length: 10 }, (_, k) => ({ dia: dia(k), valor: 12 })), "conversas", "a"), "As conversas vieram parecidas todo dia: 12 por dia, em média.");
ok(cabecaDaSerieDiaria(Array.from({ length: 6 }, (_, k) => ({ dia: dia(k), valor: k === 3 ? 50 : 5 })), "contatos"), "O dia de mais contatos foi 08/10: 50.");
assert.equal(cabecaDaSerieDiaria([], "contatos").tipo, "falta");
// Dia sem medida é buraco, nunca zero: só dias medidos entram na média.
ok(cabecaDaSerieDiaria([...Array.from({ length: 5 }, (_, k) => ({ dia: dia(k), valor: 10 })), { dia: dia(5), valor: null }], "contatos"), "Os contatos vieram parecidos todo dia: 10 por dia, em média.");

// ---------- comparação com o período anterior (genérica) ----------
ok(cabecaDoComparativo([{ rotulo: "Custo por conversa", agora: 33, antes: 40, bomSobe: false }, { rotulo: "Gasto em anúncios", agora: 3000, antes: 3000, bomSobe: true }], 0.03), "Custo por conversa caiu 18% contra o período anterior.");
ok(cabecaDoComparativo([{ rotulo: "Gasto em anúncios", agora: 3000, antes: 3010, bomSobe: true }], 0.03), "Gasto em anúncios mudou menos de 3% contra o período anterior.");

// ---------- dinheiro ----------
ok(cabecaDoDinheiro({ faturamento: { valor: 18000, vendas: 9 }, investido: 3000 }), "9 vendas somaram R$ 18.000 no período.");
ok(cabecaDoDinheiro({ faturamento: null, investido: 4500 }), "R$ 4.500 investidos em anúncio de aquisição no período.");
assert.equal(textoDaCabeca(cabecaDoDinheiro({ faturamento: null, investido: null })), "Falta dado: nenhuma venda com valor neste período");

// ---------- análises, Instagram, retorno, explicações ----------
ok(cabecaDasAnalises({ titulo: "Período bom, com um ponto para corrigir", acoesDaSemana: 3 }), "Período bom, com um ponto para corrigir: 3 ações para esta semana.");
ok(cabecaDasAnalises({ titulo: null, acoesDaSemana: 1 }), "1 ação para esta semana.");
ok(cabecaDasAnalises({ titulo: null, acoesDaSemana: 0 }), "Nenhuma ação urgente esta semana.");
ok(cabecaDoInstagramDoPeriodo({ alcance: 35595, variacaoPct: -12, unico: false }), "35.595 de alcance, somando os dias: 12% abaixo do período anterior.");
ok(cabecaDoInstagramDoPeriodo({ alcance: 35595, variacaoPct: 1, unico: false }), "35.595 de alcance, somando os dias, igual ao período anterior.");
ok(cabecaDoInstagramDoPeriodo({ alcance: 20000, variacaoPct: null, unico: true }), "20.000 pessoas no período.");
assert.equal(cabecaDoInstagramDoPeriodo({ alcance: null, variacaoPct: null, unico: false }).tipo, "falta");
ok(cabecaDoRetorno({ calculavel: true, roi: 1.5, pendentes: 0, motivo: null }), "O retorno do investimento no período foi de +150%.");
ok(cabecaDoRetorno({ calculavel: false, roi: null, pendentes: 2, motivo: null }), "Para o retorno aparecer, faltam 2 itens.");
assert.equal(textoDaCabeca(cabecaDoRetorno({ calculavel: false, roi: null, pendentes: 0, motivo: "poucas vendas de anúncio" })), "Falta dado: poucas vendas de anúncio");
ok(cabecaDasExplicacoes({ total: 4, pedemAtencao: 2 }), "2 de 4 análises do período pedem atenção.");
assert.equal(cabecaDasExplicacoes({ total: 0, pedemAtencao: 0 }).tipo, "falta");

console.log("test-ver-tudo-resultados: ok");
