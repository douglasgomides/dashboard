// Tela Resultado montada com dado real da Lana Torres (Instagram + posts + anúncios + CRM).
// Rodar: npx tsx scripts/test-resultado.ts
import { montarResultado } from "../src/lib/resultado";
import { diagnosticarAds } from "../src/lib/anuncios-objetivo";
import { leads, ig, ads, posts, adsCampanhas } from "./fixtures/lana-2026-10";

const START = "2026-09-13", END = "2026-10-12";
// alcance diário real (2º valor do ig é interações; o alcance vem da mesma consulta)
const alcance: Record<string, number> = { "2026-09-13":61623,"2026-09-14":58056,"2026-09-15":67139,"2026-09-16":53382,"2026-09-17":47272,"2026-09-18":42881,"2026-09-19":39477,"2026-09-20":37724,"2026-09-21":30967,"2026-09-22":30734,"2026-09-23":35195,"2026-09-24":42662,"2026-09-25":95179,"2026-09-26":81621,"2026-09-27":67709,"2026-09-28":91403,"2026-09-29":132261,"2026-09-30":84931,"2026-10-01":52075,"2026-10-02":37995,"2026-10-03":36884,"2026-10-04":62354,"2026-10-05":32303,"2026-10-06":36768,"2026-10-07":33028,"2026-10-08":47120,"2026-10-09":39077,"2026-10-10":29260,"2026-10-11":30235,"2026-10-12":32332 };
const diag = diagnosticarAds(
  adsCampanhas.map(([h, id, , g, i, lc, cv, ld, lpv]) => ({ date: h === 1 ? START : END, campaign_id: id, spend: g, impressions: i, link_clicks: lc, conversations: cv, leads: ld, landing_page_views: lpv })),
  [...new Map(adsCampanhas.map(([, id, obj]) => [id, { campaign_id: id, name: `${obj} …${id.slice(-4)}`, objective: obj }])).values()],
  START, END,
);

function rodar(nome: string, hoje: string, extra: Partial<Parameters<typeof montarResultado>[0]> = {}) {
  const r = montarResultado({
    start: START, end: END, hoje,
    diario: ig.map(([date, total_interactions]) => ({ date, total_interactions, reach: alcance[date], new_followers: 180, followers_count: 128000 })),
    posts: posts.map(([posted_at, engagement, caption]) => ({ posted_at, engagement, caption, format: "reels" })),
    adsDiag: diag,
    adsPorDia: ads.map(([dia, gasto]) => ({ dia, gasto })),
    wts: { atendimentos: 640, espera_mediana_seg: 47 * 60, sem_roteamento: 20 },
    crm: { novos: 978, ganhos: 9 },
    leadsPorDia: leads.map(([dia, total]) => ({ dia, total })),
    fontes: { tem_instagram: true, tem_anuncios: true, tem_crm: true, tem_atendimento: true },
    ...extra,
  });
  console.log(`\n================ ${nome} ================`);
  for (const a of r.cobertura.alertas) console.log(`ALERTA [${a.tom}] ${a.texto}`);
  console.log(`\nRESUMO [${r.veredito.tom}] ${r.veredito.titulo}`);
  for (const t of r.resumo) console.log(`  • ${t}`);
  console.log(`\nPRÓXIMA AÇÃO: ${r.proximaAcao?.acao?.texto}  [botão: ${r.proximaAcao?.acao?.botao}]`);
  r.semana.filter((i) => i !== r.proximaAcao).forEach((i, k) => console.log(`  ${k + 2}. ${i.acao?.texto}`));
  console.log("\nMÉTRICAS");
  for (const m of r.metricas) console.log(`  ${m.rotulo.padEnd(24)} ${m.valor.padEnd(16)} ${m.status ?? "—"} ${m.statusTexto ?? ""} ${m.comparacao ?? ""}`);
  console.log("\nPOR QUE");
  for (const i of r.insights) console.log(`  [${i.tom}|${i.confianca}|${i.impacto}|${i.responsavel}] ${i.titulo}${i.risco ? `\n      risco: ${i.risco}` : ""}`);
  for (const l of r.limitacoes) console.log(`  LIMITAÇÃO: ${l.texto}`);
}

rodar("Lana, período fechado", "2026-10-14");
rodar("Lana, metade dos dias sem Instagram e hoje no período", "2026-10-12", {
  diario: ig.filter((_, i) => i % 2 === 0).map(([date, total_interactions]) => ({ date, total_interactions, reach: alcance[date] })),
});
rodar("Cliente só com Instagram, sem nada conectado", "2026-10-14", { adsDiag: null, adsPorDia: [], wts: null, crm: null, leadsPorDia: undefined, fontes: { tem_instagram: true, tem_anuncios: false, tem_crm: false, tem_atendimento: false } });
