import assert from "node:assert/strict";
import { lerTrackerAuto, montarKpisSap, disponibilidadeVolumesSap } from "../src/lib/sap-auto";

// Caso real (Dra. Juliana Paola, 30 dias, sem marcos): KPIs que dependem de etapa não marcada não inventam número.
const juliana = lerTrackerAuto({
  leads: 223, marcos: [], receita: 0, tem_crm: true, faltaram: 0, fechados: 10, pensando: 0, perdidos: 0, agendados: 10,
  investido: 8594.13, com_origem: 0, compareceram: 10, nao_fecharam: 0, qualificados: 138, tem_whatsapp: true,
  leads_crm_meta: 0, marcos_marcados: 0, leads_plataforma: 161, linhas_completas: 0, resposta_ate_5min: 1,
  fechados_com_valor: 0, resposta_conversas: 23, perdidos_com_motivo: 0, resposta_mediana_min: 48.4, perdidos_motivo_medivel: 0,
})!;
const j = montarKpisSap(juliana);
const k = (id: string) => j.kpis.find((x) => x.id === id)!;
assert.equal(k("resposta").farol, "vermelho");
assert.equal(k("resposta").texto, "48 min");
assert.ok(!k("resposta").amostraPequena); // 23 conversas ≥ 20
assert.equal(k("comparecimento").valor, null, "sem etapa de comparecimento não inventa 100%");
assert.equal(k("conversao").valor, null);
assert.equal(k("custo_consulta").valor, null);
assert.match(k("agendamento").estimativa ?? "", /1ª etapa/);
assert.equal(k("receita").ehMeta, false);
assert.match(k("receita").falta ?? "", /valor/);
assert.equal(j.checagens[0].ok, false);
assert.match(j.checagens[0].falta ?? "", /origem/);
assert.equal(j.checagens[1].ok, false);
assert.match(j.pendencias[0], /Marcar o que cada etapa/);

// Clínica com marcos completos: tudo calculado.
const ok = lerTrackerAuto({
  tem_crm: true, tem_whatsapp: true, marcos_marcados: 6, marcos: ["qualificado", "desqualificado", "agendado", "faltou", "compareceu", "fechou"],
  leads: 120, qualificados: 80, agendados: 32, compareceram: 26, faltaram: 6, fechados: 11, fechados_com_valor: 11,
  receita: 55000, com_origem: 115, linhas_completas: 112, investido: 6000, leads_plataforma: 70, leads_crm_meta: 64,
  resposta_conversas: 90, resposta_mediana_min: 3.2, resposta_ate_5min: 70,
})!;
const o = montarKpisSap(ok);
const ko = (id: string) => o.kpis.find((x) => x.id === id)!;
assert.equal(ko("resposta").farol, "verde");
assert.equal(ko("agendamento").texto, "40%");
assert.equal(ko("agendamento").farol, "verde");
assert.equal(ko("comparecimento").texto, "81%");
assert.equal(ko("conversao").texto, "42%");
assert.equal(Math.round(ko("custo_consulta").valor!), 231);
assert.equal(o.checagens[0].ok, true); // 64 vs 70 = 8,6%
assert.equal(o.checagens[1].ok, true); // 112/120 = 93%
assert.equal(o.pendencias.length, 0);
assert.equal(lerTrackerAuto(null), null);
assert.ok(!j.funil.some((f) => f.id === "compareceram"), "sem etapa de consulta realizada, o funil não mostra consultas");
assert.ok(o.funil.some((f) => f.id === "compareceram"));
// Dado incompleto: compareceu marcado sem "faltou" não mostra 100% nem selo verde; receita sem valor e custo sem
// origem Meta também viram "Dado incompleto" com o que falta e onde resolver.
const parcial = montarKpisSap(lerTrackerAuto({
  tem_crm: true, tem_whatsapp: true, marcos_marcados: 2, marcos: ["agendado", "compareceu", "fechou"], leads: 50, qualificados: 40, agendados: 12,
  compareceram: 10, faltaram: 0, fechados: 4, fechados_com_valor: 1, receita: 3000, investido: 2000, leads_crm_meta: 0, leads_plataforma: 30,
})!);
const kp = (id: string) => parcial.kpis.find((x) => x.id === id)!;
assert.equal(kp("comparecimento").valor, null);
assert.equal(kp("comparecimento").texto, "Dado incompleto");
assert.equal(kp("comparecimento").farol, "cinza");
assert.equal(kp("comparecimento").incompleto?.resolver, "etapas");
assert.equal(kp("comparecimento").incompleto?.parcial, "100%");
assert.equal(kp("receita").valor, null);
assert.equal(kp("receita").incompleto?.resolver, "crm");
assert.equal(kp("custo_consulta").incompleto?.resolver, "rastreamento");
assert.equal(kp("conversao").incompleto, undefined);
console.log("test-sap-auto: ok");
// Sem fonte não são quatro zeros; etapa configurada com zero registros é uma medição válida.
assert.deepEqual(disponibilidadeVolumesSap(null), { leads: false, consultas: false, fechamentos: false, receita: false });
assert.deepEqual(disponibilidadeVolumesSap(lerTrackerAuto({ tem_crm: false })), { leads: false, consultas: false, fechamentos: false, receita: false });
assert.deepEqual(disponibilidadeVolumesSap(lerTrackerAuto({ tem_crm: true, marcos: ["compareceu", "fechou"], fechados: 0 })), { leads: true, consultas: true, fechamentos: true, receita: true });
assert.deepEqual(disponibilidadeVolumesSap(lerTrackerAuto({ tem_crm: true, marcos: [], fechados: 0 })), { leads: true, consultas: false, fechamentos: false, receita: false });
assert.equal(disponibilidadeVolumesSap(lerTrackerAuto({ tem_crm: true, fechados: 4, fechados_com_valor: 2 })).receita, false);
