import assert from "node:assert/strict";
import { montarRoi, resumoRoi, numerosDisponiveisRoi, passosOrigem, passosOrigemVendas, passosValor, situacaoAnuncios, situacaoCrm, NOTA_DEFASAGEM, AVISO_MUDANCA_ROI, type DadosRoi } from "../src/lib/roi";
import { LIMITES } from "../src/lib/limites";

const base: DadosRoi = {
  tem_anuncios: true, tem_crm: true, crm_provider: "kommo", rotulo_custo: "venda",
  investido: 1500, investido_aquisicao: 1000, investido_crescimento: 500, investido_estimado: 0,
  leads: 100, leads_com_origem: 95, ganhos: 20, ganhos_com_valor: 20, receita: 6000, ganho_identificavel: true, crm_compartilhado: false,
  ganhos_anuncio: 20, ganhos_anuncio_com_valor: 20, receita_anuncio: 6000, receita_por_origem: [{ origem: "Anúncio", ganhos: 20, receita: 6000 }],
  ganhos_com_canal: 20,
};

// ROI só com aquisição: (6000 − 1000) ÷ 1000 = 500%. O crescimento (500) fica de fora. Custo = 1000 ÷ 20.
const ok = montarRoi(base);
assert.equal(ok.calculavel, true);
assert.equal(ok.roi, 5);
assert.equal(ok.retornoPorReal, 6);
assert.equal(ok.custo, 50);
assert.equal(ok.fraseVendasAnuncio, null);
assert.equal(ok.investidoCrescimento, 500);
assert.equal(ok.investidoTotal, 1500);
assert.equal(ok.rotuloCusto, "Custo por venda");
assert.equal(ok.selo.nivel, "confiavel");
assert.equal(resumoRoi(ok), "+500%");
assert.equal(montarRoi({ ...base, rotulo_custo: "paciente" }).rotuloCusto, "Custo por paciente");

// Caso Doctor Creator antes da correção: todo o gasto dividia a receita. Com 5.518 investidos, 3.996 em aquisição e
// 3.046 de receita, o ROI sai de −45% para −24%.
const dc = montarRoi({ ...base, investido: 5518, investido_aquisicao: 3996, investido_crescimento: 1522, investido_estimado: 1700, leads: 334, leads_com_origem: 287, ganhos: 11, ganhos_com_valor: 11, receita: 3046, ganhos_anuncio: 11, ganhos_anuncio_com_valor: 11, receita_anuncio: 3046, ganhos_com_canal: 11 });
assert.equal(Math.round(dc.roi! * 100), -24);
// Parte do gasto separada por estimativa e 14% dos leads sem origem: Parcial, com os dois motivos.
assert.equal(dc.selo.nivel, "parcial");
assert.match(dc.selo.motivo, /sem origem/);
assert.match(dc.selo.motivo, /destino nem meta de otimização/);
assert.equal(dc.seloInvestimento.nivel, "parcial");
// 11 vendas de anúncio: o percentual sai (mínimo 5), mas sem confiança alta (pede 15).
assert.match(dc.selo.motivo, /sai de 11 vendas vindas de anúncio\. A confiança alta pede 15/);

// Origem abaixo do mínimo agora bloqueia: o retorno não aparece e diz por quê.
const semOrigem = montarRoi({ ...base, leads_com_origem: Math.round(LIMITES.roi.origemMinima * 100) - 1 });
assert.equal(semOrigem.calculavel, false);
assert.equal(semOrigem.selo.nivel, "ilegivel");
assert.match(semOrigem.motivoSemCalculo!, /^Não dá pra calcular o retorno porque falta: preencher a origem do lead/);
assert.match(semOrigem.itens.find((i) => i.id === "origem")!.detalhe!, /O mínimo para ler é 70%/);
// No limite exato ainda lê.
assert.equal(montarRoi({ ...base, leads_com_origem: 70 }).calculavel, true);

// Caso Dra. Juliana Paola: 0% de origem, vendas sem valor. Passo a passo do FlwChat.
const juliana = montarRoi({ ...base, crm_provider: "flwchat", leads: 180, leads_com_origem: 0, ganhos: 6, ganhos_com_valor: 0, receita: 0, ganhos_com_canal: 6 });
assert.equal(juliana.calculavel, false);
assert.deepEqual(juliana.itens.filter((i) => !i.feito).map((i) => i.id), ["valor", "origem"]);
assert.match(juliana.itens.find((i) => i.id === "origem")!.passos.join(" "), /FlwChat.*etiqueta de origem/);
assert.equal(resumoRoi(juliana), "faltam 2 itens");

// Valor em poucas vendas: não calcula (a receita sairia menor).
assert.equal(montarRoi({ ...base, ganhos: 20, ganhos_com_valor: 14 }).calculavel, false);
// Valor acima do mínimo mas incompleto: lê, como Parcial.
const valorQuase = montarRoi({ ...base, ganhos: 20, ganhos_com_valor: 18, ganhos_anuncio: 20, ganhos_anuncio_com_valor: 18 });
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
assert.equal(resumoRoi(montarRoi({ ...base, receita: 500, receita_anuncio: 500 })), "-50%");

// Doctor Creator, outubro (auditoria de 30/10/2026): R$ 4.826 de 19 vendas, nenhuma de pessoa vinda de anúncio.
// Antes: ROI de +101%. Agora: não calcula e diz de onde veio a receita.
const dcOut = montarRoi({
  ...base, investido: 5303.55, investido_aquisicao: 2397.14, investido_crescimento: 2906.41, leads: 242, leads_com_origem: 200,
  ganhos: 19, ganhos_com_valor: 19, receita: 4826.22, ganhos_anuncio: 0, ganhos_anuncio_com_valor: 0, receita_anuncio: 0,
  receita_por_origem: [
    { origem: "Funil de compra, sem origem", ganhos: 14, receita: 3546 },
    { origem: "Base importada", ganhos: 2, receita: 832 },
    { origem: "Site", ganhos: 2, receita: 301 },
    { origem: "Disparo para lista", ganhos: 1, receita: 147 },
  ],
});
assert.equal(dcOut.calculavel, false);
assert.equal(dcOut.roi, null);
assert.equal(dcOut.receitaTotal, 4826.22);
assert.equal(dcOut.ganhosTotal, 19);
assert.match(dcOut.motivoSemCalculo!, /nenhuma das 19 vendas do período veio de pessoa com origem anúncio/);
assert.match(dcOut.motivoSemCalculo!, /funil de compra, sem origem \(14 vendas, R\$\s?3\.546\)/);
assert.ok(!/[—–]/.test(dcOut.motivoSemCalculo!));
// Parte das vendas veio de anúncio: o ROI usa só essa parte; a receita total fica ao lado.
const parte = montarRoi({ ...base, ganhos: 30, ganhos_com_valor: 30, receita: 9000, ganhos_anuncio: 5, ganhos_anuncio_com_valor: 5, receita_anuncio: 3000, ganhos_com_canal: 30 });
assert.equal(parte.calculavel, true);
assert.equal(parte.roi, 2);
assert.equal(parte.custo, 200);
assert.equal(parte.receitaTotal, 9000);
// Banco sem a separação: não usa a receita total como se fosse do anúncio.
const antigo = montarRoi({ ...base, ganhos_anuncio: null, ganhos_anuncio_com_valor: null, receita_anuncio: null, receita_por_origem: [] });
assert.equal(antigo.calculavel, false);
assert.match(antigo.motivoSemCalculo!, /separar a receita que veio dos anúncios/);

// ---- Travas de 31/10/2026: mínimo de vendas de anúncio e origem das vendas ----
// Doctor Creator, 90 dias (roi_periodo de 31/10/2026): 1 venda de anúncio de R$ 197, R$ 12.196,10 em aquisição,
// 17 de 176 vendas com canal conhecido. Antes: ROI de -98% e custo por venda de R$ 12.196. Agora: sem percentual,
// com a frase em R$ e a trava de origem das vendas pendente.
const dc90Dados: DadosRoi = {
  ...base, crm_provider: "clint", investido: 18807.94, investido_aquisicao: 12196.1, investido_crescimento: 6611.84, investido_estimado: 7967.54,
  leads: 954, leads_com_origem: 948, ganhos: 176, ganhos_com_valor: 168, receita: 36832.32,
  ganhos_anuncio: 1, ganhos_anuncio_com_valor: 1, receita_anuncio: 197, ganhos_com_canal: 17,
  receita_por_origem: [{ origem: "Funil de compra, sem origem", ganhos: 131, receita: 27916.43 }, { origem: "Anúncio", ganhos: 1, receita: 197 }],
};
const dc90 = montarRoi(dc90Dados);
assert.equal(dc90.calculavel, false);
assert.equal(dc90.roi, null);
assert.equal(dc90.custo, null);
assert.equal(dc90.selo.nivel, "ilegivel");
assert.match(dc90.fraseVendasAnuncio!, /^1 venda de anúncio, R\$\s?197, para R\$\s?12\.196 investidos em aquisição\.$/);
const itemVendas = dc90.itens.find((i) => i.id === "origem_vendas")!;
assert.equal(itemVendas.feito, false);
assert.match(itemVendas.detalhe!, /10% das vendas do período têm canal conhecido \(17 de 176\)\. O mínimo para ler é 70%/);
assert.match(dc90.motivoSemCalculo!, /falta: registrar a origem de quem comprou/);
assert.equal(resumoRoi(dc90), "faltam 1 item");
// Com a origem das vendas resolvida, 1 venda ainda não vira percentual: frase em R$ e o motivo da amostra.
const dc90Canal = montarRoi({ ...dc90Dados, ganhos_com_canal: 150 });
assert.equal(dc90Canal.calculavel, false);
assert.equal(dc90Canal.roi, null);
assert.match(dc90Canal.motivoSemCalculo!, /1 venda veio de anúncio no período, e o mínimo é 5/);
assert.match(dc90Canal.fraseVendasAnuncio!, /^1 venda de anúncio, R\$\s?197, para R\$\s?12\.196 investidos/);
assert.match(resumoRoi(dc90Canal), /^1 venda de anúncio, R\$\s?197$/);
// 2 vendas: plural na frase. 4 vendas: ainda sem percentual. 5: percentual, Parcial. 15: pode ser Confiável.
assert.match(montarRoi({ ...base, ganhos_anuncio: 2, ganhos_anuncio_com_valor: 2, receita_anuncio: 400 }).fraseVendasAnuncio!, /^2 vendas de anúncio, R\$\s?400, para R\$\s?1\.000 investidos/);
assert.equal(montarRoi({ ...base, ganhos_anuncio: LIMITES.roi.vendasAnuncioMinimas - 1, ganhos_anuncio_com_valor: 4 }).calculavel, false);
const cinco = montarRoi({ ...base, ganhos_anuncio: LIMITES.roi.vendasAnuncioMinimas, ganhos_anuncio_com_valor: 5 });
assert.equal(cinco.calculavel, true);
assert.equal(cinco.selo.nivel, "parcial");
assert.equal(cinco.fraseVendasAnuncio, null);
assert.equal(montarRoi({ ...base, ganhos_anuncio: LIMITES.roi.vendasAnuncioAlta - 1, ganhos_anuncio_com_valor: 14 }).selo.nivel, "parcial");
assert.equal(montarRoi({ ...base, ganhos_anuncio: LIMITES.roi.vendasAnuncioAlta, ganhos_anuncio_com_valor: 15 }).selo.nivel, "confiavel");
// Venda de anúncio sem valor: a frase diz "sem valor", não R$ 0.
assert.match(montarRoi({ ...base, ganhos_anuncio: 1, ganhos_anuncio_com_valor: 0, receita_anuncio: 0 }).fraseVendasAnuncio!, /^1 venda de anúncio, sem valor, para/);
// Sem investimento em aquisição não há frase de retorno (Dr. Sergio, 90 dias: 1 venda de anúncio, R$ 0 em aquisição).
const sergio90 = montarRoi({
  ...base, crm_provider: "flwchat", investido: 2480.7, investido_aquisicao: 0, investido_crescimento: 2480.7, investido_estimado: 90.88,
  leads: 62, leads_com_origem: 10, ganhos: 520, ganhos_com_valor: 346, receita: 723299.9, ganhos_anuncio: 1, ganhos_anuncio_com_valor: 1, receita_anuncio: 1200, ganhos_com_canal: 21,
});
assert.equal(sergio90.calculavel, false);
assert.equal(sergio90.fraseVendasAnuncio, null);
assert.deepEqual(sergio90.itens.filter((i) => !i.feito).map((i) => i.id), ["valor", "origem", "origem_vendas"]);
// Trava de origem das vendas no limite: 70% libera, um a menos bloqueia.
assert.equal(montarRoi({ ...base, ganhos_com_canal: 14 }).calculavel, true);
assert.equal(montarRoi({ ...base, ganhos_com_canal: 13 }).calculavel, false);
// Banco sem a conta de vendas com canal: não libera o retorno e diz por quê.
const semConta = montarRoi({ ...base, ganhos_com_canal: null });
assert.equal(semConta.calculavel, false);
assert.match(semConta.itens.find((i) => i.id === "origem_vendas")!.detalhe!, /ainda não separa as vendas por canal/);
assert.equal(montarRoi({ ...base, ganhos_com_canal: undefined }).calculavel, false);
assert.match(AVISO_MUDANCA_ROI, /^Mudou em 31\/10: /);
assert.match(passosOrigemVendas("clint").join(" "), /Clint/);

// Passo a passo por CRM; o Digisac não registra venda e diz isso.
assert.match(passosValor("digisac").join(" "), /não registra venda/);
assert.match(passosOrigem("clint").join(" "), /Clint.*Origem/);
assert.ok(passosOrigem(null).length > 0);
// Textos da interface sem travessão.
for (const t of [NOTA_DEFASAGEM, AVISO_MUDANCA_ROI, dc90.fraseVendasAnuncio!, dc90.motivoSemCalculo!, dc90Canal.motivoSemCalculo!, itemVendas.detalhe!, ...passosOrigemVendas("kommo"), ...passosOrigemVendas("digisac"), ...ok.itens.flatMap((i) => [i.preciso, i.detalhe ?? "", ...i.passos]), dc.selo.motivo, juliana.motivoSemCalculo!]) {
  assert.ok(!/[—–]/.test(t), `travessão em: ${t}`);
}

// Os números conhecidos continuam legíveis sem inferir zeros de fontes ausentes ou de outro cliente.
assert.deepEqual(numerosDisponiveisRoi({ ...base, ganhos_com_valor: 0 }), { investido: 1000, investidoCrescimento: 500, leads: 100, ganhos: 20 });
assert.deepEqual(numerosDisponiveisRoi({ ...base, tem_crm: false, tem_anuncios: false }), { investido: null, investidoCrescimento: null, leads: null, ganhos: null });
// CRM compartilhado (IGM Palmas): os números aparecem, com o aviso; o ROI continua bloqueado.
assert.deepEqual(numerosDisponiveisRoi({ ...base, crm_compartilhado: true }), { investido: 1000, investidoCrescimento: 500, leads: 100, ganhos: 20 });
assert.equal(situacaoCrm({ ...base, crm_compartilhado: true, crm_compartilhado_com: ["Dr. Antonione (IGM Palmas)"] }), "CRM compartilhado com Dr. Antonione (IGM Palmas): mesmos números");
assert.equal(situacaoCrm(base), null);
// Anúncios: planilha conta como ligada; conta sem dado há mais de 3 dias aparece como parada, não como "não conectada".
assert.equal(situacaoAnuncios({ ...base, anuncios_planilha: true }), "Lançado à mão na planilha");
assert.equal(situacaoAnuncios({ ...base, anuncios_ate: "2026-10-21" }, "2026-10-29"), "Conta parada desde 21/10");
assert.equal(situacaoAnuncios({ ...base, tem_anuncios: false }), "Conta de anúncios não conectada");
assert.equal(numerosDisponiveisRoi({ ...base, ganho_identificavel: false }).ganhos, null);
console.log("test-roi: ok");
