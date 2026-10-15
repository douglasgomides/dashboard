import assert from "node:assert/strict";
import { linhasKpis, planoPorQuinzena, statusKpiD90, variacaoKpi } from "../src/lib/sap-documentos";

// Exemplo do 08.07.
assert.equal(statusKpiD90("resposta", 47, 5, 3), "atingida");
assert.equal(statusKpiD90("comparecimento", 0.67, 0.8, 0.81), "atingida");
assert.equal(statusKpiD90("conversao", 0.26, 0.38, 0.35), "melhorou");
assert.equal(statusKpiD90("conversao", 0.26, 0.38, 0.26), "nao_melhorou");
assert.equal(statusKpiD90("custo_consulta", 340, 220, 200), "atingida");
assert.equal(statusKpiD90("resposta", 10, 5, 12), "nao_melhorou");
assert.equal(statusKpiD90("resposta", null, 5, 3), "sem_dado");
assert.equal(variacaoKpi("resposta", 47, 3), "44 min mais rápido");
assert.equal(variacaoKpi("comparecimento", 0.67, 0.81), "+14 pontos");

const l = linhasKpis(
  [{ kpi: "resposta", baseline: 47, meta: 5, conta_garantia: true, origem: "medido", amostra: 50 }, { kpi: "conversao", baseline: 0.26, meta: 0.38, conta_garantia: true, origem: "medido", amostra: 20 }],
  (k) => (k === "resposta" ? 3 : k === "conversao" ? 0.35 : null),
);
assert.deepEqual(l.map((x) => [x.kpi, x.status]), [["resposta", "atingida"], ["conversao", "melhorou"]]);

// Plano por quinzena a partir do cronograma: Q1 traz kickoff e Sessões 1 e 2 para a clínica; Q2 traz anúncios no ar para a DC.
const q = planoPorQuinzena("2026-11-09", [], "2026-11-10");
assert.equal(q.length, 6);
assert.ok(q[0].clinica.some((x) => /Kickoff/.test(x)));
assert.ok(q[0].clinica.some((x) => /Sessão 2/.test(x)));
assert.ok(q[1].dc.some((x) => /Anúncios no ar/.test(x)));
assert.equal(q[5].ate, "2027-02-07"); // D90 do exemplo do 03.07
console.log("ok sap-documentos");
