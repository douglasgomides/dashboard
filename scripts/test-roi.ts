import assert from "node:assert/strict";
import { montarRoi, resumoRoi, type DadosRoi } from "../src/lib/roi";

const base: DadosRoi = { tem_anuncios: true, tem_crm: true, investido: 1000, leads: 100, leads_com_origem: 90, ganhos: 4, ganhos_com_valor: 4, receita: 6000, ganho_identificavel: true, crm_compartilhado: false };

// Dá para calcular: ROI = (6000 − 1000) ÷ 1000 = 500%; custo por paciente = 1000 ÷ 4.
const ok = montarRoi(base);
assert.equal(ok.calculavel, true);
assert.equal(ok.roi, 5);
assert.equal(ok.retornoPorReal, 6);
assert.equal(ok.custoPorPaciente, 250);
assert.equal(ok.pendentes, 0);
assert.equal(resumoRoi(ok), "+500%");

// Caso Dr. Sergio Maia: 2.805 leads, 0 ganhos, 0% com origem, nenhuma etapa de ganho.
const sergio = montarRoi({ ...base, leads: 2805, leads_com_origem: 0, ganhos: 0, ganhos_com_valor: 0, receita: 0, ganho_identificavel: false });
assert.equal(sergio.calculavel, false);
assert.equal(sergio.roi, null);
assert.deepEqual(sergio.itens.filter((i) => !i.feito).map((i) => i.id), ["etapas", "valor", "origem"]);
assert.match(sergio.itens.find((i) => i.id === "origem")!.detalhe!, /Hoje 0% dos leads/);
assert.equal(resumoRoi(sergio), "faltam 3 itens");

// Valor preenchido em poucas vendas: não calcula (a receita sairia menor).
const poucoValor = montarRoi({ ...base, ganhos: 10, ganhos_com_valor: 7 });
assert.equal(poucoValor.calculavel, false);
assert.equal(poucoValor.itens.find((i) => i.id === "valor")!.feito, false);

// Origem não bloqueia o ROI total: calcula e continua listada como pendente.
const semOrigem = montarRoi({ ...base, leads_com_origem: 10 });
assert.equal(semOrigem.calculavel, true);
assert.equal(semOrigem.pendentes, 1);
assert.equal(resumoRoi(semOrigem), "+500%");

// CRM compartilhado com outro cliente bloqueia (receita em dobro).
assert.equal(montarRoi({ ...base, crm_compartilhado: true }).calculavel, false);

// Sem CRM: só os itens de ligar fonte.
const semCrm = montarRoi({ ...base, tem_crm: false });
assert.deepEqual(semCrm.itens.map((i) => i.id), ["anuncios", "crm"]);
assert.equal(resumoRoi(semCrm), "faltam 1 item");

// Itens feitos, mas sem investimento no período.
const semGasto = montarRoi({ ...base, investido: 0 });
assert.equal(semGasto.calculavel, false);
assert.equal(semGasto.motivoSemCalculo, "Sem investimento em anúncios no período.");
assert.equal(resumoRoi(semGasto), "Sem investimento em anúncios no período.");

// ROI negativo.
assert.equal(resumoRoi(montarRoi({ ...base, receita: 500 })), "-50%");
console.log("test-roi: ok");
