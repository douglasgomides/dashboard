import assert from "node:assert/strict";
import { montarRoi, resumoRoi, numerosDisponiveisRoi, passosOrigem, passosValor, situacaoAnuncios, situacaoCrm, NOTA_DEFASAGEM, type DadosRoi } from "../src/lib/roi";
import { LIMITES } from "../src/lib/limites";

const base: DadosRoi = {
  tem_anuncios: true, tem_crm: true, crm_provider: "kommo", rotulo_custo: "venda",
  investido: 1500, investido_aquisicao: 1000, investido_crescimento: 500, investido_estimado: 0,
  leads: 100, leads_com_origem: 95, ganhos: 4, ganhos_com_valor: 4, receita: 6000, ganho_identificavel: true, crm_compartilhado: false,
};

// ROI só com aquisição: (6000 − 1000) ÷ 1000 = 500%. O crescimento (500) fica de fora. Custo = 1000 ÷ 4.
const ok = montarRoi(base);
assert.equal(ok.calculavel, true);
assert.equal(ok.roi, 5);
assert.equal(ok.retornoPorReal, 6);
assert.equal(ok.custo, 250);
assert.equal(ok.investidoCrescimento, 500);
assert.equal(ok.investidoTotal, 1500);
assert.equal(ok.rotuloCusto, "Custo por venda");
assert.equal(ok.selo.nivel, "confiavel");
assert.equal(resumoRoi(ok), "+500%");
assert.equal(montarRoi({ ...base, rotulo_custo: "paciente" }).rotuloCusto, "Custo por paciente");

// Caso Doctor Creator antes da correção: todo o gasto dividia a receita. Com 5.518 investidos, 3.996 em aquisição e
// 3.046 de receita, o ROI sai de −45% para −24%.
const dc = montarRoi({ ...base, investido: 5518, investido_aquisicao: 3996, investido_crescimento: 1522, investido_estimado: 1700, leads: 334, leads_com_origem: 287, ganhos: 11, ganhos_com_valor: 11, receita: 3046 });
assert.equal(Math.round(dc.roi! * 100), -24);
// Parte do gasto separada por estimativa e 14% dos leads sem origem: Parcial, com os dois motivos.
assert.equal(dc.selo.nivel, "parcial");
assert.match(dc.selo.motivo, /sem origem/);
assert.match(dc.selo.motivo, /destino nem meta de otimização/);
assert.equal(dc.seloInvestimento.nivel, "parcial");

// Origem abaixo do mínimo agora bloqueia: o retorno não aparece e diz por quê.
const semOrigem = montarRoi({ ...base, leads_com_origem: Math.round(LIMITES.roi.origemMinima * 100) - 1 });
assert.equal(semOrigem.calculavel, false);
assert.equal(semOrigem.selo.nivel, "ilegivel");
assert.match(semOrigem.motivoSemCalculo!, /^Não dá pra calcular o retorno porque falta: preencher a origem do lead/);
assert.match(semOrigem.itens.find((i) => i.id === "origem")!.detalhe!, /O mínimo para ler é 70%/);
// No limite exato ainda lê.
assert.equal(montarRoi({ ...base, leads_com_origem: 70 }).calculavel, true);

// Caso Dra. Juliana Paola: 0% de origem, vendas sem valor. Passo a passo do FlwChat.
const juliana = montarRoi({ ...base, crm_provider: "flwchat", leads: 180, leads_com_origem: 0, ganhos: 6, ganhos_com_valor: 0, receita: 0 });
assert.equal(juliana.calculavel, false);
assert.deepEqual(juliana.itens.filter((i) => !i.feito).map((i) => i.id), ["valor", "origem"]);
assert.match(juliana.itens.find((i) => i.id === "origem")!.passos.join(" "), /FlwChat.*etiqueta de origem/);
assert.equal(resumoRoi(juliana), "faltam 2 itens");

// Valor em poucas vendas: não calcula (a receita sairia menor).
assert.equal(montarRoi({ ...base, ganhos: 10, ganhos_com_valor: 7 }).calculavel, false);
// Valor acima do mínimo mas incompleto: lê, como Parcial.
const valorQuase = montarRoi({ ...base, ganhos: 10, ganhos_com_valor: 9 });
assert.equal(valorQuase.calculavel, true);
assert.equal(valorQuase.selo.nivel, "parcial");
assert.match(valorQuase.selo.motivo, /sem valor/);

// CRM compartilhado com outro cliente bloqueia (receita em dobro).
assert.equal(montarRoi({ ...base, crm_compartilhado: true }).calculavel, false);

// Sem CRM: só os itens de ligar fonte.
const semCrm = montarRoi({ ...base, tem_crm: false });
assert.deepEqual(semCrm.itens.map((i) => i.id), ["anuncios", "crm"]);
assert.equal(resumoRoi(semCrm), "faltam 1 item");

// Gasto só em crescimento: não há base para o retorno, e a frase diz isso.
const soCrescimento = montarRoi({ ...base, investido_aquisicao: 0, investido_crescimento: 1500 });
assert.equal(soCrescimento.calculavel, false);
assert.match(soCrescimento.motivoSemCalculo!, /todo o investimento do período foi em crescimento/);
assert.equal(resumoRoi(soCrescimento), "não dá pra ler");
// Sem gasto nenhum.
assert.match(montarRoi({ ...base, investido: 0, investido_aquisicao: 0, investido_crescimento: 0 }).motivoSemCalculo!, /não houve investimento/);
// Sem venda ganha.
assert.match(montarRoi({ ...base, ganhos: 0, ganhos_com_valor: 0, receita: 0 }).motivoSemCalculo!, /falta: preencher o valor/);

// ROI negativo.
assert.equal(resumoRoi(montarRoi({ ...base, receita: 500 })), "-50%");

// Passo a passo por CRM; o Digisac não registra venda e diz isso.
assert.match(passosValor("digisac").join(" "), /não registra venda/);
assert.match(passosOrigem("clint").join(" "), /Clint.*Origem/);
assert.ok(passosOrigem(null).length > 0);
// Textos da interface sem travessão.
for (const t of [NOTA_DEFASAGEM, ...ok.itens.flatMap((i) => [i.preciso, i.detalhe ?? "", ...i.passos]), dc.selo.motivo, juliana.motivoSemCalculo!]) {
  assert.ok(!/[—–]/.test(t), `travessão em: ${t}`);
}

// Os números conhecidos continuam legíveis sem inferir zeros de fontes ausentes ou de outro cliente.
assert.deepEqual(numerosDisponiveisRoi({ ...base, ganhos_com_valor: 0 }), { investido: 1000, investidoCrescimento: 500, leads: 100, ganhos: 4 });
assert.deepEqual(numerosDisponiveisRoi({ ...base, tem_crm: false, tem_anuncios: false }), { investido: null, investidoCrescimento: null, leads: null, ganhos: null });
// CRM compartilhado (IGM Palmas): os números aparecem, com o aviso; o ROI continua bloqueado.
assert.deepEqual(numerosDisponiveisRoi({ ...base, crm_compartilhado: true }), { investido: 1000, investidoCrescimento: 500, leads: 100, ganhos: 4 });
assert.equal(situacaoCrm({ ...base, crm_compartilhado: true, crm_compartilhado_com: ["Dr. Antonione (IGM Palmas)"] }), "CRM compartilhado com Dr. Antonione (IGM Palmas): mesmos números");
assert.equal(situacaoCrm(base), null);
// Anúncios: planilha conta como ligada; conta sem dado há mais de 3 dias aparece como parada, não como "não conectada".
assert.equal(situacaoAnuncios({ ...base, anuncios_planilha: true }), "Lançado à mão na planilha");
assert.equal(situacaoAnuncios({ ...base, anuncios_ate: "2026-10-21" }, "2026-10-29"), "Conta parada desde 21/10");
assert.equal(situacaoAnuncios({ ...base, tem_anuncios: false }), "Conta de anúncios não conectada");
assert.equal(numerosDisponiveisRoi({ ...base, ganho_identificavel: false }).ganhos, null);
console.log("test-roi: ok");
