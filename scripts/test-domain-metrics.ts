import assert from "node:assert/strict";
import { analyzeFollowers, analyzeGrowth } from "../src/lib/hub-conteudo";
import { postsImpulsionados, seguidoresPorSemana } from "../src/lib/seguidores-semana";
import { resolveDateRange } from "../src/lib/date-range";
import { completeInstagramPeriod } from "../src/lib/report-period";
import { buildRelatorioEnvio } from "../src/lib/relatorio-envio";

const partial = analyzeGrowth([
  { date: "2026-10-01", new_followers: null, unfollowers: 9 },
  { date: "2026-10-02", new_followers: 5, unfollowers: null },
  { date: "2026-10-03", new_followers: 10, unfollowers: 2 },
  { date: "2026-10-04", new_followers: 0, unfollowers: 0 },
  { date: "2026-10-09", new_followers: 100, unfollowers: 50 },
], "2026-10-01", "2026-10-10", "2026-10-10");
assert.equal(partial.days[0].novos, null, "unavailable gains are not measured zeros");
assert.equal(partial.days[0].liquido, null, "missing gains cannot imply a net loss");
assert.equal(partial.days[1].liquido, null);
assert.equal(partial.diasMedidos, 2, "only closed dates with both measurements enter comparable totals");
assert.equal(partial.novos, 10);
assert.equal(partial.saidas, 2);
assert.equal(partial.liquido, 8);
assert.equal(partial.novosTodosFechados, 15);
assert.equal(partial.diasSemGanhos, 1);
assert.equal(partial.diasSemSaida, 1);
assert.equal(partial.diasAbertos, 1);

const decreasing = analyzeFollowers(Array.from({ length: 5 }, (_, i) => ({ date: `2026-10-0${i + 1}`, followers_count: 5 - i })), "2026-10-01", "2026-10-05", "2026-10-05");
assert.equal(decreasing.projection.ok, true);
if (decreasing.projection.ok) {
  assert.equal(decreasing.projection.projected, 0, "declining linear projections cannot produce negative followers");
  assert.ok(decreasing.projection.line.every((point) => point.followers >= 0));
}

const noAdjacentTotal = seguidoresPorSemana([
  { date: "2026-09-27", followers_count: 100, new_followers: 1, unfollowers: 0 },
  { date: "2026-10-11", followers_count: 200, new_followers: 1, unfollowers: 0 },
  { date: "2026-10-18", followers_count: null, new_followers: 1, unfollowers: 0 },
  { date: "2026-10-25", followers_count: 300, new_followers: 1, unfollowers: 0 },
]);
assert.ok(noAdjacentTotal.every((week) => week.saldo === null), "a missing week or total cannot turn a multi-week change into one week's balance");

const campaigns = [{ campaign_id: "a", name: "Post do Instagram: Exemplo de legenda..." }];
const spend = [{ campaign_id: "a", date: "2026-10-01", spend: 10, impressions: 0, link_clicks: 0 }];
assert.equal(postsImpulsionados(campaigns, spend, [{ id: "future", caption: "Exemplo de legenda nova", posted_at: "2026-10-02T15:00:00Z", reach: 100 }])[0].post, null, "a future post cannot be attributed to an earlier campaign");
assert.equal(postsImpulsionados(campaigns, spend, [{ id: "brasil", caption: "Exemplo de legenda nova", posted_at: "2026-10-02T01:00:00Z", reach: 100 }])[0].post?.id, "brasil", "timestamps after UTC midnight still belong to the previous day in Brazil");

const nearMidnight = new Date("2026-10-18T01:30:00Z");
assert.deepEqual(resolveDateRange({ preset: "7d" }, nearMidnight), { start: "2026-10-11", end: "2026-10-17" });
assert.deepEqual(resolveDateRange({ preset: "mes_atual" }, new Date("2026-11-01T01:00:00Z")), { start: "2026-10-01", end: "2026-10-31" });
assert.deepEqual(resolveDateRange({ preset: "personalizado", from: "2099-01-01", to: "9998-12-31" }, nearMidnight), { start: "2026-10-17", end: "2026-10-17" }, "historical reports cap future input before querying or enumerating dates");

const clipped = { de: "2026-09-18", ate: "2026-10-17", recortado: true, alcance_unico: 123 };
assert.equal(completeInstagramPeriod(clipped, "2026-07-20", "2026-10-17"), null);
assert.equal(completeInstagramPeriod({ ...clipped, recortado: false }, "2026-07-20", "2026-10-17"), null, "different dates are incompatible even if the API omitted its clipped flag");
assert.equal(completeInstagramPeriod({ ...clipped, recortado: false }, "2026-09-18", "2026-10-17")?.alcance_unico, 123);
const report = buildRelatorioEnvio({
  clientName: "Clínica de teste",
  periodLabel: "90 dias",
  start: "2026-07-20",
  end: "2026-10-17",
  hoje: "2026-10-17",
  fontes: { tem_instagram: true, tem_anuncios: false, tem_crm: false, tem_atendimento: false },
  metrics: [{ date: "2026-10-01", reach: 500, followers_count: 100 }],
  posts: [], perguntas: [], ads: null, wts: null, crm: null,
  alcanceUnico: completeInstagramPeriod(clipped, "2026-07-20", "2026-10-17")?.alcance_unico,
});
assert.equal(report.alcanceUnico, null, "the exported report must not retain a unique reach for a different interval");
assert.match(report.conteudo.resumo.find((item) => item.id === "alcance")?.texto ?? "", /Somando o alcance de cada dia/);
assert.ok(!report.conteudo.resumo.some((item) => item.texto.includes("123 contas diferentes")));
console.log("Domain metric regressions passed: missing versus zero, closed-day coverage, weekly gaps, projections, campaign attribution, and Brazilian date boundaries.");
