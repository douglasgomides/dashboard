import assert from "node:assert/strict";
import { bloco, compararPeriodos, direcao, duracaoCurta, type SemanaProva } from "../src/lib/prova-resultado";

const s = (semana: string, comerciais: number, agendou: number, resp: number | null, respondidas: number, em5: number, inv: number): SemanaProva =>
  ({ semana, conversas: comerciais + 5, comerciais, agendou, resposta_mediana_s: resp, respondidas, resp_5min: em5, investimento: inv });
const linhas = [
  s("2026-08-24", 20, 4, 3600, 20, 4, 500), s("2026-08-31", 20, 4, 3600, 20, 4, 500), s("2026-09-07", 20, 4, 3600, 20, 4, 500), s("2026-09-14", 20, 4, 3600, 20, 4, 500),
  s("2026-09-21", 20, 8, 600, 20, 12, 500), s("2026-09-28", 20, 8, 600, 20, 12, 500), s("2026-10-05", 20, 8, 600, 20, 12, 500), s("2026-10-12", 20, 8, 600, 20, 12, 500),
  s("2026-10-19", 3, 3, 60, 3, 3, 100), // semana corrente: fora
];
const { atual, anterior } = compararPeriodos(linhas, "2026-10-21T12:00:00Z");
assert.equal(atual.semanas, 4);
assert.equal(atual.agendou, 32);
assert.equal(atual.taxa, 0.4);
assert.equal(anterior.taxa, 0.2);
assert.equal(atual.resposta_s, 600);
assert.equal(atual.em5, 0.6);
assert.equal(atual.custo_agendamento, 2000 / 32);
assert.equal(anterior.custo_agendamento, 2000 / 16);
assert.equal(direcao(atual.taxa, anterior.taxa), "melhor");
assert.equal(direcao(atual.resposta_s, anterior.resposta_s, true), "melhor");
assert.equal(direcao(atual.custo_agendamento, anterior.custo_agendamento, true), "melhor");
assert.equal(direcao(105, 100), "igual");
assert.equal(direcao(null, 1), "sem_dado");
assert.equal(bloco([s("2026-10-12", 5, 2, null, 0, 0, 0)]).taxa, null, "amostra pequena não vira taxa");
assert.equal(bloco([s("2026-10-12", 30, 2, null, 0, 0, 300)]).custo_agendamento, null, "menos de 3 agendamentos: sem custo");
assert.equal(duracaoCurta(5400), "1,5 h");
console.log("prova-resultado: ok");
