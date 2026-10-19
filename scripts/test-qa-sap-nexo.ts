import assert from "node:assert/strict";
import { calcularExecucao } from "../src/lib/sap-scores";
import { avaliarGarantia, type LinhaPlano } from "../src/lib/sap-metas";
import { lerTrackerAuto } from "../src/lib/sap-auto";
import { montarLeitura } from "../src/lib/sap-leitura";
import { cronogramaComDatas, diaUtilAnterior } from "../src/lib/sap-cronograma";
import { SESSOES, trilha } from "../src/lib/sap-sessoes";
import { normalizarTema } from "../src/lib/classificacao-post";
import { montarFunil, type FunilBanco } from "../src/lib/jornada-funil";
import { montarFunil as comercial, lerDiagnosticoRpc } from "../src/lib/comercial";
import { motivoDaLinha } from "../src/lib/motivos";
import { excecoes, type ExecucaoAgente } from "../src/lib/agentes-data";

for (const dia of [null, 0, 4]) {
  const score = calcularExecucao([], dia);
  assert.equal(score.atual, null);
  assert.doesNotMatch(score.habilita, /abaixo de 80|Avisar/);
}
assert.match(calcularExecucao([], 5).habilita, /abaixo de 80/);
const atual = lerTrackerAuto({ tem_crm: false, tem_whatsapp: false })!;
const plano: LinhaPlano[] = ["resposta", "comparecimento", "conversao"].map(kpi => ({ kpi: kpi as LinhaPlano["kpi"], baseline: null, meta: null, origem: null, amostra: null, conta_garantia: true }));
for (const score of [null, 70, 90]) {
  const g = avaliarGarantia({ plano, atual, consultaPaga: true, verbaEmDia: true, score });
  assert.equal(g.aplica, null);
  assert.match(g.texto, /não avaliável/);
  assert.doesNotMatch(g.texto, /melhoraram ou não entram|não se aplica/);
}
const leitura = montarLeitura({ atual, plano, dia: 4, ticket: null, consultaPaga: true, score: null });
assert.equal(leitura.dadosSuficientes, false);
assert.ok(leitura.passos.slice(6).every(p => p.status === "sem_dado"));
const crono = cronogramaComDatas("2026-10-15", [], "2026-10-19");
for (const passo of trilha(SESSOES, crono, "2026-10-19").passos) {
  assert.equal(passo.data, diaUtilAnterior(crono.find(i => i.n === passo.s.cronoN)!.dataAlvo));
}
assert.equal(crono.find(i => i.n === 9)!.dataUtil, "2026-10-23");
assert.equal(diaUtilAnterior("2026-11-02"), "2026-10-30");
for (const t of [null, "", " null ", "undefined", "NULO", "n/a"]) assert.equal(normalizarTema(t), null);
assert.equal(normalizarTema(" Saúde hormonal "), "Saúde hormonal");
const fontes = { tem_instagram:true, tem_comentarios:true, tem_whatsapp:true, tem_conversas:true, tem_crm:true, tem_etapa_agendamento:true, tem_venda_registrada:true, crm_provider:"flwchat" };
const bruto: FunilBanco = { alcance:1000, dias_alcance:30, interacoes:900, dias_interacoes:30, comentarios:782, comentaristas:0, conversas:30, leads:20, leads_com_etapa:20, agendados:7, vendas:7, receita:1000, dias_periodo:30, fontes };
const contagem = { leads:20, ganhos:7, ganhos_em_etapa_agenda:7, agendados:7 };
const d = lerDiagnosticoRpc({ periodo:contagem, base:contagem, etapas_consulta:0, etapas_parece_consulta:1 }, { whatsappConectado:true });
const f = montarFunil(bruto, comercial(d));
assert.equal(f.etapas[2].valor, null);
assert.equal(f.etapas[3].taxa, null);
assert.equal(f.etapas[6].valor, null);
assert.equal(f.etapas[6].taxa, null);
assert.ok(f.medidas < 7);
assert.equal(montarFunil(bruto, null).etapas[6].valor, null);
assert.equal(motivoDaLinha({ fonte:"crm", last_error:"sem subdomínio configurado", motivo:"Sem acesso ao CRM", motivo_dono:"manual" } as never)?.dono, "nos");
assert.equal(excecoes([{ id:"teste", estado:"aguardando", erro:"CLICKUP_API_TOKEN não configurado" } as ExecucaoAgente], [])[0].tipo, "configuracao");
console.log("test-qa-sap-nexo: ok");
