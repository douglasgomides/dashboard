// npx tsx scripts/test-metricas.ts — regressão das definições centrais (src/lib/metricas.ts)
import assert from "node:assert/strict";
import { custoPorConversaConta, custoPorConversaMensagem, fmtFracao, fmtTaxa, razao, seguidoresNoPeriodo } from "../src/lib/metricas";
import { confiancaPorPosts, podeConcluir } from "../src/lib/metricas";
import { computeMelhoresHorarios, computeFormatInsight } from "../src/lib/report-metrics";

// Caso real (Lana Torres, 90 dias): R$ 33.012,20 ÷ 977 = R$ 33,79 na conta toda.
const conta = custoPorConversaConta(33012.2, 977);
assert.equal(conta.estado, "medido");
assert.equal(Math.round(conta.valor! * 100) / 100, 33.79);
assert.equal(conta.escopo, "todas as campanhas");
// Campanhas de mensagem têm escopo próprio e não substituem o da conta.
const msg = custoPorConversaMensagem(1571.76, 112);
assert.equal(Math.round(msg.valor! * 100) / 100, 14.03);
assert.notEqual(msg.escopo, conta.escopo);
// Sem conversa: indisponível, não zero nem infinito.
assert.equal(custoPorConversaConta(500, 0).estado, "indisponivel");
assert.equal(custoPorConversaConta(500, 0).valor, null);
assert.equal(custoPorConversaConta(null, 10).estado, "indisponivel");
// Zero medido: numerador zero com denominador válido.
assert.equal(razao(0, 10, "x", "y").estado, "zero");

// Taxas pequenas não viram 0%.
assert.equal(fmtTaxa(2, 1365), "0,15%");
assert.equal(fmtTaxa(1, 5000), "<0,1%");
assert.equal(fmtTaxa(0, 100), "0%");
assert.equal(fmtTaxa(5, 0), "—");
assert.equal(fmtTaxa(null, 10), "—");
assert.equal(fmtTaxa(37, 100), "37%");
assert.equal(fmtTaxa(55, 1000), "5,5%");
assert.equal(fmtFracao(0.0015), "0,15%");
assert.equal(fmtFracao(null), "—");

// Seguidores: ganhos/saídas só com dias que têm os dois; saldo pelo total com sua própria cobertura.
const dias = [
  { date: "2026-09-01", followers_count: 1000, new_followers: null, unfollowers: null },
  { date: "2026-09-15", followers_count: 1050, new_followers: 10, unfollowers: null },
  { date: "2026-10-01", followers_count: 1100, new_followers: 20, unfollowers: 5 },
  { date: "2026-10-02", followers_count: 1110, new_followers: 15, unfollowers: 3 },
];
const s = seguidoresNoPeriodo(dias, "2026-09-01", "2026-10-02");
assert.equal(s.ganhos, 35); // só 01/10 e 02/10 têm os dois números
assert.equal(s.saidas, 8);
assert.equal(s.saldoGanhosSaidas, 27);
assert.equal(s.coberturaGanhos.diasComDado, 2);
assert.equal(s.saldoTotal, 110);
assert.equal(s.coberturaTotal.diasComDado, 4);
assert.equal(s.mesmaCobertura, false); // não dá para comparar 27 com 110
const vazio = seguidoresNoPeriodo([], "2026-10-01", "2026-10-07");
assert.equal(vazio.ganhos, null); // indisponível, não 0
assert.equal(vazio.saldoTotal, null);
console.log("test-metricas: ok");

// Regressão: os helpers das telas usam a mesma regra (antes "0%" ou "menos de 1%").
import("../src/lib/comercial").then(({ fmtPct }) => {
  assert.equal(fmtPct(2 / 1365), "0,15%");
  assert.equal(fmtPct(0), "0%");
  // Amostra mínima de posts: "melhor"/"pior" só com 8+; selo baixa (até 7), média (8–19), alta (20+).
{
  assert.equal(confiancaPorPosts(7), "baixa");
  assert.equal(confiancaPorPosts(8), "media");
  assert.equal(confiancaPorPosts(19), "media");
  assert.equal(confiancaPorPosts(20), "alta");
  assert.equal(podeConcluir(7), false);
  // "Quarta de manhã +834%" com 3 posts: vai para poucos dados, sem ranking.
  const post = (dia: string, hora: string, eng: number, format = "reels") => ({ posted_at: `${dia}T${hora}:00-03:00`, engagement: eng, format });
  const qua = ["2026-09-02", "2026-09-09", "2026-09-16"].map((d) => post(d, "09", 900));
  const outros = Array.from({ length: 8 }, (_, i) => post(`2026-09-0${(i % 3) + 4}`, "19", 100));
  const h = computeMelhoresHorarios([...qua, ...outros]);
  assert.ok(h.ranked.every((r) => r.count >= 8));
  assert.ok(h.poucosDados.some((r) => r.count === 3 && r.median === 900));
  // Formato com 3 posts não vira "melhor".
  assert.equal(computeFormatInsight([...qua.map((p) => ({ ...p, format: "image" })), ...outros]), null);
}

console.log("test-metricas (comercial): ok");
});
