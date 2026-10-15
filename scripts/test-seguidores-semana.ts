import assert from "node:assert/strict";
import { inicioDaSemana, postsImpulsionados, prefixoDaCampanha, seguidoresPorSemana } from "../src/lib/seguidores-semana";

assert.equal(inicioDaSemana("2026-10-15"), "2026-10-12"); // quinta → segunda
assert.equal(inicioDaSemana("2026-10-12"), "2026-10-12");

const dias = [];
for (let i = 0; i < 14; i++) {
  const d = new Date("2026-09-28T12:00:00Z"); d.setUTCDate(d.getUTCDate() + i);
  dias.push({ date: d.toISOString().slice(0, 10), followers_count: 1000 + i * 10, new_followers: 15, unfollowers: i < 7 ? null : 5 });
}
const gasto = new Map([["2026-10-06", 100], ["2026-10-07", 50]]);
const s = seguidoresPorSemana(dias, gasto);
assert.equal(s.length, 2);
assert.equal(s[0].perderam, null, "sem dado da Meta não vira zero");
assert.equal(s[0].saldo, null, "primeira semana sem base");
assert.equal(s[1].novos, 105);
assert.equal(s[1].perderam, 35);
assert.equal(s[1].saldo, 70); // 1130 - 1060
assert.equal(s[1].gastoImpulsionamento, 150);

assert.equal(prefixoDaCampanha("Publicação do Instagram: Um dos sintomas da..."), "um dos sintomas da");
const posts = [
  { id: "a", caption: "Um dos sintomas da menopausa é...", posted_at: "2024-01-13T10:00:00Z", reach: 600 },
  { id: "b", caption: "Um dos sintomas da perimenopausa", posted_at: "2025-05-01T10:00:00Z", reach: 34000 },
  { id: "c", caption: "Um dos sintomas da tireoide", posted_at: "2026-12-01T10:00:00Z", reach: 10 },
];
const linhas = [
  { date: "2025-05-03", campaign_id: "X", spend: 30, impressions: 3000, link_clicks: 40 },
  { date: "2025-05-04", campaign_id: "X", spend: 20, impressions: 2000, link_clicks: 10 },
  { date: "2025-05-04", campaign_id: "Y", spend: 0, impressions: 0, link_clicks: 0 },
];
const imp = postsImpulsionados(
  [{ campaign_id: "X", name: "Publicação do Instagram: Um dos sintomas da..." }, { campaign_id: "Y", name: "Post do Instagram: Outro" }, { campaign_id: "Z", name: "[MSG] Campanha normal" }],
  linhas,
  posts,
);
assert.equal(imp.length, 1, "sem gasto e campanha normal ficam de fora");
assert.equal(imp[0].post?.id, "b", "post mais perto antes do primeiro gasto");
assert.equal(imp[0].gasto, 50);
assert.equal(imp[0].alcanceOrganico, 34000);
assert.equal(imp[0].custoPorMilImpressoes, 10);
console.log("test-seguidores-semana: ok");
