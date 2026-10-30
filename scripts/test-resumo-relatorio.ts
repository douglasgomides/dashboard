// Auditoria de Resultados da clínica + Relatório do período (31/10/2026): os números da tela, do PDF e do texto do
// WhatsApp têm que bater, e as recomendações não podem culpar a equipe por limite da fonte.
// Rodar: npx tsx scripts/test-resumo-relatorio.ts
import assert from "node:assert/strict";
import { saldoSeguidores } from "../src/lib/metricas";
import { montarResultado } from "../src/lib/resultado";
import { buildRelatorioEnvio, type EnvioInput } from "../src/lib/relatorio-envio";
import { lerVendas, normalizarVendas } from "../src/lib/vendas-periodo";
import { computeFormatBreakdown, computeFormatInsight, computeMelhoresHorarios, taxaDoPost } from "../src/lib/report-metrics";

const START = "2026-10-01", END = "2026-10-30", HOJE = "2026-10-31";
const dias = Array.from({ length: 30 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);

// ---------- 1. Seguidores: um número só (saldo líquido) em tela, relatório e PDF
// Doctor Creator: total de 126.950 (01/10) a 131.766 (30/10); ganhos 7.819 e saídas 2.735 em 28 dias.
const diario = dias.map((date, i) => ({
  date,
  reach: 150_000,
  total_interactions: 6000,
  followers_count: i === 29 ? 131_766 : 126_950 + Math.round((4816 * i) / 29),
  new_followers: i < 28 ? (i === 0 ? 7819 - 279 * 27 : 279) : null,
  unfollowers: i < 28 ? (i === 0 ? 2735 - 97 * 27 : 97) : null,
}));
const sg = saldoSeguidores(diario, START, END);
assert.equal(sg.saldo, 4816);
assert.equal(sg.regua, "total");
assert.equal(sg.ganhos, 7819);
assert.equal(sg.saidas, 2735);
assert.match(sg.detalhe, /7\.819 começaram a seguir e 2\.735 deixaram de seguir/);
// Sem o total, o saldo vem de ganhos menos saídas (nunca do bruto).
const semTotal = saldoSeguidores(diario.map((d) => ({ ...d, followers_count: null })), START, END);
assert.equal(semTotal.saldo, 7819 - 2735);
assert.equal(semTotal.regua, "ganhos_saidas");
// Só ganhos, sem saídas nem total: não há saldo.
assert.equal(saldoSeguidores(diario.map((d) => ({ ...d, followers_count: null, unfollowers: null })), START, END).saldo, null);

const r = montarResultado({ start: START, end: END, hoje: HOJE, diario, posts: [], fontes: { tem_instagram: true } });
const cartao = r.metricas.find((m) => m.id === "seguidores")!;
assert.equal(cartao.rotulo, "Seguidores: saldo no período");
assert.equal(cartao.valor, "+4.816");
assert.ok(!r.resumo.join(" ").includes("7.819"), "o bruto não aparece como número do resumo");

const envioBase: EnvioInput = {
  clientName: "Clínica",
  periodLabel: "Outubro",
  start: START,
  end: END,
  hoje: HOJE,
  fontes: { tem_instagram: true, tem_anuncios: false, tem_crm: true, tem_atendimento: false },
  metrics: diario,
  posts: [],
  perguntas: [],
  ads: null,
  wts: null,
  crm: null,
};
const envio = buildRelatorioEnvio(envioBase);
assert.ok(envio.whatsapp.includes("+4.816"), envio.whatsapp);
assert.ok(!envio.whatsapp.includes("7.819"));

// ---------- 2. Interação: um nome e um formato só
const inter = r.metricas.find((m) => m.id === "interacao")!;
assert.equal(inter.rotulo, "Taxa de interação");
assert.match(inter.valor, /^\d+,\d%$/);

// ---------- 3. Veredito: "Período bom" só com sinal positivo
// Métrica "na média" (atenção) e nenhum ponto bom: antes saía "Período bom." (0 >= 0 * 1,5).
const mediano = montarResultado({
  start: START,
  end: END,
  hoje: HOJE,
  diario: dias.map((date) => ({ date, reach: 10_000, total_interactions: 300 })), // 3% = na média do mercado
  posts: [],
  fontes: { tem_instagram: true },
});
assert.equal(mediano.metricas.find((m) => m.id === "interacao")!.status, "atencao");
assert.ok(!/Período bom/.test(mediano.veredito.titulo), mediano.veredito.titulo);

// ---------- 4. Vendas: régua honesta e Marcella sem "marcar ganhos"
const marcella = normalizarVendas({
  vendas_no_periodo: 0, vendas_coorte: 0, fechados_sem_resultado: 80, ultima_venda: "2026-09-01", eventos_desde: "2026-10-15",
  planilha_ultimo: "2026-09-08", pessoas_novas: 204, pessoas_novas_com_origem: 1, por_origem: [],
})!;
const lm = lerVendas(0, marcella, START);
assert.equal(lm.numero, null);
assert.match(lm.indisponivel!, /fechou 80 cards sem dizer se virou venda/);
assert.match(lm.indisponivel!, /planilha de vendas não é atualizada desde 08\/09/);
assert.ok(!lm.indisponivel!.includes("—"));

const envioMarcella = buildRelatorioEnvio({
  ...envioBase,
  crm: { resumo: { novos: 204, ganhos: 0, perdidos: 0 }, diasComDado: dias, vendas: marcella },
});
const tudo = JSON.stringify(envioMarcella.conteudoCompleto) + envioMarcella.insights.map((i) => i.acao?.texto ?? "").join(" ");
assert.ok(!/Marcar no CRM/.test(tudo), "não manda a equipe marcar ganhos quando a fonte não informa resultado");
assert.ok(envioMarcella.limitacoes.some((l) => l.id === "crm-vendas-indisponivel"));

// Sem fonte que esconde o resultado, zero venda continua pedindo o registro.
const envioZero = buildRelatorioEnvio({
  ...envioBase,
  crm: { resumo: { novos: 204, ganhos: 0, perdidos: 0 }, diasComDado: dias, vendas: { ...marcella, fechados_sem_resultado: 0, planilha_ultimo: null } },
});
assert.ok(envioZero.insights.some((i) => i.id === "crm-ganhos"));

// Coorte x evento: antes do histórico de eventos cobrir o período, o rótulo é de coorte.
const dc = { ...marcella, vendas_no_periodo: 21, vendas_coorte: 54, fechados_sem_resultado: 0, planilha_ultimo: null };
const coorte = lerVendas(54, { ...dc, eventos_desde: "2026-10-15" }, "2026-09-01");
assert.equal(coorte.base, "coorte");
assert.equal(coorte.numero, 54);
assert.match(coorte.frase, /dos contatos que entraram no período, 54 já viraram venda/);
const evento = lerVendas(54, { ...dc, eventos_desde: "2026-08-01" }, "2026-09-01");
assert.equal(evento.base, "evento");
assert.equal(evento.numero, 21);
assert.match(evento.frase, /21 vendas fechadas no período/);
// O Resultado usa a mesma régua e não diz mais "de contatos novos ou antigos".
const rCrm = montarResultado({ start: "2026-09-01", end: "2026-09-30", hoje: HOJE, diario: [], posts: [], crm: { novos: 572, ganhos: 54, vendas: { ...dc, eventos_desde: "2026-10-15" } } });
const leads = rCrm.metricas.find((m) => m.id === "leads")!;
assert.match(leads.explicacao, /Dos contatos que entraram no período, 54 já viraram venda/);
assert.ok(!/novos ou antigos/.test(leads.explicacao + rCrm.resumo.join(" ")));
// Marcella no Resultado: ganhos = 0 não some do texto sem explicação.
const rMarcella = montarResultado({ start: START, end: END, hoje: HOJE, diario: [], posts: [], crm: { novos: 204, ganhos: 0, vendas: marcella } });
assert.match(rMarcella.resumo.join(" "), /Resultado de venda não disponível/);

// ---------- 5. Melhor formato e horário por taxa, não por engajamento absoluto
// Doctor Creator out/2026: estático com 14x mais alcance, mas taxa parecida com a do carrossel.
const post = (format: string, reach: number, engagement: number, i: number) => ({ format, reach, engagement, posted_at: `2026-10-${String((i % 28) + 1).padStart(2, "0")}T14:00:00Z` });
const posts = [
  ...Array.from({ length: 28 }, (_, i) => post("estatico", 39_950, Math.round(39_950 * 0.0463), i)),
  ...Array.from({ length: 92 }, (_, i) => post("carrossel", 2795, Math.round(2795 * 0.0427), i)),
  post("reels", 900, 60, 1),
];
const fi = computeFormatInsight(posts)!;
assert.equal(fi.empate, true, "taxas parecidas não viram 'formato mais forte'");
assert.ok(Math.abs(fi.best.median - 0.0463) < 0.001);
// Marcella: reels engaja menos em número absoluto, mas tem a maior taxa.
const pm = [
  ...Array.from({ length: 10 }, (_, i) => post("reels", 1800, 61, i)),
  ...Array.from({ length: 10 }, (_, i) => post("estatico", 7200, 232, i)),
  ...Array.from({ length: 10 }, (_, i) => post("carrossel", 5000, 58, i)),
];
const fm = computeFormatInsight(pm)!;
assert.equal(fm.best.format, "reels");
assert.equal(fm.worst.format, "carrossel");
assert.equal(fm.empate, false);
// Gráfico: formato com 1 post sai como amostra pequena.
const br = computeFormatBreakdown(posts);
assert.equal(br.find((f) => f.count === 1)!.amostraPequena, true);
assert.equal(br.find((f) => f.count === 92)!.amostraPequena, false);
// Horário: taxa mediana, sem depender do alcance.
const h = computeMelhoresHorarios(posts);
assert.ok(h.ranked.length > 0 && h.ranked.every((x) => x.median < 1), "mediana de horário é uma taxa (0 a 1)");
assert.equal(taxaDoPost({ engagement: 10, reach: 0 }), null);

// ---------- 6. Tempo até responder: a base é a dos atendimentos com espera medida
const rWts = montarResultado({ start: START, end: END, hoje: HOJE, diario: [], posts: [], wts: { atendimentos: 909, espera_cobertura: 659, espera_mediana_seg: 875 } });
assert.match(rWts.metricas.find((m) => m.id === "resposta")!.explicacao, /mediana de 659 atendimentos com espera medida, de 909/);

console.log("test-resumo-relatorio: ok");
