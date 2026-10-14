// npx tsx scripts/test-jornada-funil.ts
import assert from "node:assert/strict";
import { montarFunil, type FunilBanco } from "../src/lib/jornada-funil";

const fontes = { tem_instagram: true, tem_comentarios: true, tem_whatsapp: true, tem_conversas: true, tem_crm: true, tem_etapa_agendamento: true, tem_venda_registrada: true, crm_provider: "kommo" };
const base: FunilBanco = { alcance: 100000, dias_alcance: 30, interacoes: 5000, dias_interacoes: 30, comentarios: 300, comentaristas: 200, conversas: 120, leads: 80, leads_com_etapa: 80, agendados: 20, vendas: 5, receita: 15000, dias_periodo: 30, fontes };

// Tudo ligado: 7 etapas medidas, taxas entre vizinhas, maior queda no comercial.
const f = montarFunil(base);
assert.equal(f.etapas.length, 7);
assert.deepEqual(f.etapas.map((e) => e.n), [1, 2, 3, 4, 5, 6, 7]);
assert.equal(f.medidas, 7);
assert.equal(f.etapas[3].taxa, 120 / 200);
assert.equal(f.etapas[6].taxa, 5 / 20);
assert.deepEqual(f.maiorQueda, { de: "lead", para: "agendamento", taxa: 0.25 });
// Comentário sempre "parcial": directs não entram.
assert.equal(f.etapas[2].estado, "parcial");

// Nada ligado: nenhuma etapa vira zero; todas dizem o que falta.
const vazio = montarFunil(null);
assert.ok(vazio.etapas.every((e) => e.valor === null && e.estado === "sem_integracao" && e.falta));
assert.equal(vazio.medidas, 0);
assert.equal(vazio.maiorQueda, null);

// Sem WhatsApp: conversa sem integração, e a taxa do lead não é calculada sobre ela.
const semWpp = montarFunil({ ...base, fontes: { ...fontes, tem_whatsapp: false } });
assert.equal(semWpp.etapas[3].estado, "sem_integracao");
assert.match(semWpp.etapas[3].falta!.integracao, /WhatsApp/);
assert.equal(semWpp.etapas[4].taxa, null);

// CRM sem etapa de agendamento e sem venda registrada: parcial com o dado que falta, não zero.
const crmCru = montarFunil({ ...base, fontes: { ...fontes, tem_etapa_agendamento: false, tem_venda_registrada: false } });
assert.equal(crmCru.etapas[5].valor, null);
assert.match(crmCru.etapas[5].falta!.dado, /agendada/);
assert.equal(crmCru.etapas[6].valor, null);
assert.match(crmCru.etapas[6].explicacao!, /não é registrada/);

// CRM ligado e zero lead de verdade: zero, com explicação.
const zero = montarFunil({ ...base, leads: 0, agendados: 0, vendas: 0 });
assert.equal(zero.etapas[4].estado, "zero");
assert.equal(zero.etapas[4].valor, 0);
assert.equal(zero.etapas[5].taxa, null); // não divide por zero

// Instagram ligado sem alcance no período: parcial apontando a Saúde das fontes.
const igParado = montarFunil({ ...base, dias_alcance: 0 });
assert.equal(igParado.etapas[0].estado, "parcial");
assert.match(igParado.etapas[0].falta!.onde, /Saúde das fontes/);
// Alcance com poucos dias: parcial com aviso.
assert.match(montarFunil({ ...base, dias_alcance: 10 }).etapas[0].explicacao!, /10 de 30 dias/);

console.log("test-jornada-funil: ok");
