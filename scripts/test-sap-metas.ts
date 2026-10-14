import assert from "node:assert/strict";
import { lerTrackerAuto } from "../src/lib/sap-auto";
import { avaliarGarantia, avaliarKpi, baselineDoTracker, janelaBaseline, janelaGarantia, proporMeta, quinzenas } from "../src/lib/sap-metas";

// 03.07: exemplo da Clínica Aurora (baseline → meta).
assert.equal(proporMeta("resposta", 130).meta, 65); // reduzir à metade
assert.equal(proporMeta("resposta", 4).conta_garantia, false); // já abaixo de 5 min: manter, sai da garantia
assert.equal(proporMeta("comparecimento", 0.69).meta, 0.79);
assert.equal(proporMeta("comparecimento", 0.8).meta, 0.85); // teto de 85%
assert.equal(proporMeta("conversao", 0.31).meta, 0.38);
assert.equal(proporMeta("agendamento", 0.3).meta, 0.4);
assert.equal(proporMeta("agendamento", 0.3).conta_garantia, false, "com consulta paga, agendamento não é KPI da garantia");
assert.equal(proporMeta("agendamento", 0.3, false).conta_garantia, true);
assert.equal(proporMeta("conversao", 0.55).conta_garantia, false);
assert.equal(proporMeta("custo_consulta", 300).meta, null);
assert.equal(proporMeta("receita_mensal", 43200).meta, null);

// 01.02 · "melhorou"
assert.equal(avaliarKpi({ kpi: "resposta", baseline: 130, meta: 65, atual: 100, amostra: 50, verbaEmDia: true }).resultado, "melhorou"); // caiu 23%
assert.equal(avaliarKpi({ kpi: "resposta", baseline: 130, meta: 65, atual: 120, amostra: 50, verbaEmDia: true }).resultado, "nao_melhorou");
assert.equal(avaliarKpi({ kpi: "resposta", baseline: 6, meta: 5, atual: 4.5, amostra: 50, verbaEmDia: true }).resultado, "melhorou");
assert.equal(avaliarKpi({ kpi: "comparecimento", baseline: 0.69, meta: 0.79, atual: 0.72, amostra: 25, verbaEmDia: true }).resultado, "nao_melhorou");
assert.equal(avaliarKpi({ kpi: "comparecimento", baseline: 0.78, meta: 0.85, atual: 0.8, amostra: 25, verbaEmDia: true }).resultado, "melhorou");
assert.equal(avaliarKpi({ kpi: "conversao", baseline: 0.31, meta: 0.38, atual: 0.38, amostra: 20, verbaEmDia: true }).resultado, "melhorou"); // bateu a meta
// amostra mínima
assert.equal(avaliarKpi({ kpi: "conversao", baseline: 0.31, meta: 0.38, atual: 0.6, amostra: 10, verbaEmDia: true }).resultado, "nao_melhorou");
assert.equal(avaliarKpi({ kpi: "conversao", baseline: 0.31, meta: 0.38, atual: 0.6, amostra: 10, verbaEmDia: false }).resultado, "nao_avaliavel");
assert.equal(avaliarKpi({ kpi: "conversao", baseline: null, meta: null, atual: 0.6, amostra: 30, verbaEmDia: true }).resultado, "sem_baseline");

// Janelas
assert.deepEqual(janelaBaseline("2026-11-09", "2026-12-01"), { de: "2026-10-10", ate: "2026-11-08" });
assert.deepEqual(janelaBaseline(null, "2026-10-15"), { de: "2026-09-15", ate: "2026-10-14" });
assert.deepEqual(janelaGarantia("2026-11-09", "2027-03-01"), { de: "2027-01-10", ate: "2027-02-06", previa: false });
assert.equal(janelaGarantia("2026-11-09", "2026-12-01").previa, true);
assert.equal(quinzenas("2026-11-09")[5].ate, "2027-02-07"); // D90 do exemplo

// Garantia completa
const atual = lerTrackerAuto({
  tem_crm: true, tem_whatsapp: true, marcos_marcados: 5, marcos: ["qualificado", "agendado", "faltou", "compareceu", "fechou"],
  leads: 120, qualificados: 60, agendados: 30, compareceram: 21, faltaram: 9, fechados: 6, fechados_com_valor: 6, receita: 30000,
  resposta_conversas: 80, resposta_mediana_min: 110,
})!;
const plano = [
  { kpi: "resposta" as const, baseline: 130, meta: 65, conta_garantia: true, origem: "medido" as const, amostra: 50 },
  { kpi: "comparecimento" as const, baseline: 0.69, meta: 0.79, conta_garantia: true, origem: "medido" as const, amostra: 40 },
  { kpi: "conversao" as const, baseline: 0.31, meta: 0.38, conta_garantia: true, origem: "medido" as const, amostra: 20 },
];
// resposta 110 (caiu 15%: não melhorou), comparecimento 70% (+1: não), conversão 29% (não)
const g = avaliarGarantia({ plano, atual, consultaPaga: true, verbaEmDia: true, score: 85 });
assert.equal(g.naoMelhoraram, 3);
assert.equal(g.aplica, true);
assert.equal(avaliarGarantia({ plano, atual, consultaPaga: true, verbaEmDia: true, score: 70 }).aplica, false);
assert.equal(avaliarGarantia({ plano, atual, consultaPaga: true, verbaEmDia: true, score: null }).aplica, null);

// Baseline a partir do tracker: receita vira mensal.
const b = baselineDoTracker(atual, 60);
assert.equal(b.find((x) => x.kpi === "receita_mensal")!.baseline, 15000);
assert.equal(b.find((x) => x.kpi === "resposta")!.origem, "medido");
console.log("test-sap-metas: ok");
