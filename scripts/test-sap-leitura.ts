import assert from "node:assert/strict";
import { lerTrackerAuto } from "../src/lib/sap-auto";
import { MAPA_VAZAMENTOS, montarLeitura } from "../src/lib/sap-leitura";

assert.equal(MAPA_VAZAMENTOS.length, 20);
assert.deepEqual(MAPA_VAZAMENTOS.map((v) => v.codigo).sort(), Array.from({ length: 20 }, (_, i) => `V${i + 1}`).sort());

const plano = [
  { kpi: "resposta" as const, baseline: 130, meta: 10, conta_garantia: true, origem: "medido" as const, amostra: 50 },
  { kpi: "comparecimento" as const, baseline: 0.69, meta: 0.8, conta_garantia: true, origem: "medido" as const, amostra: 40 },
  { kpi: "conversao" as const, baseline: 0.31, meta: 0.38, conta_garantia: true, origem: "medido" as const, amostra: 20 },
  { kpi: "agendamento" as const, baseline: 0.3, meta: 0.4, conta_garantia: false, origem: "medido" as const, amostra: 80 },
];
const base = {
  tem_crm: true, tem_whatsapp: true, marcos_marcados: 5, marcos: ["qualificado", "agendado", "faltou", "compareceu", "fechou"],
  leads: 120, qualificados: 80, agendados: 34, compareceram: 28, faltaram: 6, fechados: 7, fechados_com_valor: 7, receita: 25480,
  com_origem: 118, linhas_completas: 116, investido: 4000, leads_plataforma: 70, leads_crm_meta: 66,
  resposta_conversas: 100, resposta_mediana_min: 4, resposta_ate_5min: 80,
  semanas: [{ semana: "2027-01-11", leads: 30, agendados: 9, compareceram: 7, fechados: 2, receita: 0 }, { semana: "2027-01-18", leads: 30, agendados: 8, compareceram: 7, fechados: 2, receita: 0 }],
};

// Exemplo do 08.05 (S13): resposta ok, comparecimento ok, conversão 25% contra meta de 38% → V11 com perda em R$.
const l = montarLeitura({ atual: lerTrackerAuto(base)!, plano, dia: 90, ticket: 3640, consultaPaga: true, score: 90 });
assert.equal(l.principal?.v.codigo, "V11");
assert.equal(l.principal?.perda?.etapa, "conversao");
assert.ok(Math.abs(l.principal!.perda!.tratamentos - (0.38 - 0.25) * 28) < 0.01);
assert.ok(l.principal!.perda!.reais! > 13000);
assert.match(l.mensagem!, /conversão, 25% contra meta de 38%/);
assert.equal(l.semanaPrograma, 13);
assert.equal(l.passos.length, 8);
assert.ok(!/R\$|desconto|garant/i.test(l.mensagem!.replace(/garantia/g, "")), "mensagem sem preço");

// Dado ruim vem antes de tudo (V15), e resposta vermelha antes de agendamento (V4 em vez de V6).
const ruim = montarLeitura({ atual: lerTrackerAuto({ ...base, com_origem: 40, linhas_completas: 40, resposta_mediana_min: 48 })!, plano, dia: 40, ticket: 3640, consultaPaga: true, score: null });
assert.equal(ruim.principal?.v.codigo, "V15");
assert.ok(ruim.outros.some((o) => o.v.codigo === "V4"));
assert.ok(!ruim.outros.some((o) => o.v.codigo === "V6"));

// Escala ao Fundador: 2 KPIs da garantia vermelhos em 2 janelas seguidas a partir da S9.
const vermelho = lerTrackerAuto({ ...base, resposta_mediana_min: 140, compareceram: 20, faltaram: 14, fechados: 5 })!;
const esc = montarLeitura({ atual: vermelho, anterior: vermelho, plano, dia: 63, ticket: 3640, consultaPaga: true, score: 70 });
assert.ok(esc.escalar.some((e) => /2 semanas seguidas/.test(e)));
assert.ok(esc.escalar.some((e) => /Score de Execução/.test(e)));

// Sem plano: passo 4 sem dado, ainda assim aponta o vazamento pela referência DC.
const semPlano = montarLeitura({ atual: lerTrackerAuto(base)!, plano: [], dia: null, ticket: null, consultaPaga: true, score: null });
assert.equal(semPlano.passos[3].status, "sem_dado");
assert.ok(semPlano.principal);
console.log("test-sap-leitura: ok");
