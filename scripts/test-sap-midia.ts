import assert from "node:assert/strict";
import { regrasDeMidia } from "../src/lib/sap-midia";
import type { LinhaAds } from "../src/lib/anuncios-objetivo";

const dia = (i: number) => { const d = new Date("2026-10-14T12:00:00Z"); d.setUTCDate(d.getUTCDate() - i); return d.toISOString().slice(0, 10); };
const linhas: LinhaAds[] = [];
for (let i = 0; i < 14; i++) {
  const recente = i < 7;
  // A: cansando (CTR e conversas caem com a mesma verba). B: cara (2,5x custo-meta). C: barata.
  linhas.push({ date: dia(i), campaign_id: "A", spend: 100, impressions: 10000, link_clicks: recente ? 60 : 100, conversations: recente ? 5 : 10, leads: 0, landing_page_views: 0 });
  linhas.push({ date: dia(i), campaign_id: "B", spend: 100, impressions: 8000, link_clicks: 80, conversations: recente ? 1 : 1, leads: 0, landing_page_views: 0 });
  linhas.push({ date: dia(i), campaign_id: "C", spend: 50, impressions: 5000, link_clicks: 60, conversations: 4, leads: 0, landing_page_views: 0 });
}
const cad = [{ campaign_id: "A", name: "Bioestimulador vídeo", objective: "OUTCOME_ENGAGEMENT" }, { campaign_id: "B", name: "Flacidez", objective: "OUTCOME_ENGAGEMENT" }, { campaign_id: "C", name: "Avaliação", objective: "OUTCOME_ENGAGEMENT" }];
// Conta: 6.000 investidos, 20 consultas (R$ 300), 400 conversas → 1 consulta a cada 20 conversas.
// Meta de R$ 400 por consulta → custo-meta por conversa = 400 × 20/400 = R$ 20.
const r = regrasDeMidia({ linhas, cadastro: cad, ate: dia(0), conta4s: { investido: 6000, compareceram: 20, conversasPlataforma: 400 }, metaCustoConsulta: 400, rastreioSuspeito: false });
assert.equal(r.custoConsulta, 300);
assert.equal(r.custoMetaConversa, 20);
const de = (id: string, t: string) => r.alertas.find((a) => a.campaign_id === id && a.tipo === t);
assert.ok(de("A", "fadiga"), "A cansando");
assert.equal(de("A", "fadiga")!.codigo, "V3");
assert.ok(de("B", "pausa"), "B: R$ 100 por conversa > 2 × R$ 20");
assert.ok(de("C", "escala"), "C: R$ 12,50 por conversa < R$ 20");
assert.ok(!de("A", "escala"), "campanha cansando não recebe verba");
assert.equal(r.alertas[0].tipo, "pausa");
assert.ok(r.alertas.some((a) => a.tipo === "verba" && /dentro da meta/.test(a.titulo)));

// Rastreio suspeito: só a fadiga.
const s = regrasDeMidia({ linhas, cadastro: cad, ate: dia(0), conta4s: { investido: 6000, compareceram: 20, conversasPlataforma: 400 }, metaCustoConsulta: 400, rastreioSuspeito: true });
assert.ok(s.alertas.every((a) => a.tipo === "fadiga"));
// Sem meta: aviso para definir no D45, sem pausa/escala.
const sm = regrasDeMidia({ linhas, cadastro: cad, ate: dia(0), conta4s: { investido: 6000, compareceram: 20, conversasPlataforma: 400 }, metaCustoConsulta: null, rastreioSuspeito: false });
assert.ok(sm.alertas.some((a) => a.tipo === "verba" && /D45/.test(a.acao)));
assert.ok(!sm.alertas.some((a) => a.tipo === "pausa" || a.tipo === "escala"));
// Frequência (05.11): D com CTR caindo pouco (sem o salto de custo) mas frequência acima de 3.
const lf: LinhaAds[] = [];
for (let i = 0; i < 14; i++) lf.push({ date: dia(i), campaign_id: "D", spend: 80, impressions: 9000, link_clicks: i < 7 ? 85 : 90, conversations: 6, leads: 0, landing_page_views: 0, reach: i < 7 ? 2500 : 4000 });
const f = regrasDeMidia({ linhas: lf, cadastro: [{ campaign_id: "D", name: "Retargeting", objective: "OUTCOME_ENGAGEMENT" }], ate: dia(0), conta4s: null, metaCustoConsulta: null, rastreioSuspeito: false });
assert.ok(f.alertas.some((a) => a.campaign_id === "D" && a.tipo === "fadiga" && /Frequência/.test(a.detalhe)));
console.log("test-sap-midia: ok");
