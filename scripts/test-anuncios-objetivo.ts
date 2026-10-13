// Teste do diagnóstico por objetivo e da central de decisão de verba com dado
// real (meta_ads_daily, 13/09 a 12/10/2026, somado por campanha em duas metades,
// ver scripts/fixtures/anuncios-3-clientes.json).
// Rodar: npx tsx scripts/test-anuncios-objetivo.ts
import { readFileSync } from "node:fs";
import {
  diagnosticarAds,
  conversaMaisBarata,
  planoDeAcao,
  insightsDeAnuncios,
  limitacoesDeAnuncios,
  grupoDoObjetivo,
  GRUPOS,
  ORDEM_CATEGORIAS,
  type LinhaAds,
  type CampanhaCadastro,
} from "../src/lib/anuncios-objetivo";

// [metade, campaign_id, objective, gasto, impressoes, cliques_link, conversas, leads, visitas_pagina, dias_com_gasto, nome]
type Bruto = [number, string, string, number, number, number, number, number, number, number, string];
const START = "2026-09-13", END = "2026-10-12";
const fixture = JSON.parse(readFileSync(new URL("./fixtures/anuncios-3-clientes.json", import.meta.url), "utf8")) as Record<string, Bruto[] | string>;

// Cada metade vira `dias` linhas diárias iguais (a 1ª metade começa em 13/09, a 2ª em 27/09).
function montar(rows: Bruto[]) {
  const linhas: LinhaAds[] = [];
  const cad = new Map<string, CampanhaCadastro>();
  for (const [h, id, obj, g, i, lc, cv, ld, lpv, dias, nome] of rows) {
    const k = Math.max(1, dias);
    const inicio = new Date((h === 1 ? START : "2026-09-27") + "T12:00:00Z");
    for (let j = 0; j < k; j++) {
      const date = new Date(inicio.getTime() + j * 86400000).toISOString().slice(0, 10);
      linhas.push({ date, campaign_id: id, spend: g / k, impressions: i / k, link_clicks: lc / k, conversations: cv / k, leads: ld / k, landing_page_views: lpv / k });
    }
    cad.set(id, { campaign_id: id, name: nome || `${obj} …${id.slice(-4)}`, objective: obj });
  }
  return diagnosticarAds(linhas, [...cad.values()], START, END);
}

let falhas = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    falhas++;
    console.log(`  ✗ FALHOU: ${msg}`);
  } else console.log(`  ✓ ${msg}`);
}

const brl = (v: number | null) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const resultados: Record<string, ReturnType<typeof montar>> = {};
for (const nome of Object.keys(fixture).filter((k) => !k.startsWith("_"))) {
  const d = montar(fixture[nome] as Bruto[]);
  resultados[nome] = d;
  console.log(`\n=== ${nome}: ${brl(d.gasto)} investidos em ${d.campanhas.length} campanhas`);
  console.log(`custo por conversa (só campanhas de mensagem): ${brl(d.custoPorConversaMensagem)} em ${d.conversasMensagem} conversas; conversas de todas: ${d.conversas}`);
  for (const g of d.grupos)
    console.log(
      `  ${GRUPOS[g.grupo].nome.padEnd(28)} ${String(g.campanhas).padStart(2)} camp · ${brl(g.gasto).padStart(12)} (${((g.gasto / d.gasto) * 100).toFixed(0)}%) · custo/${GRUPOS[g.grupo].resultado} ${brl(g.custoPorResultado)} · típica ${brl(g.medianaCusto)} · conversas ${g.conversas} (${brl(g.custoPorConversa)})`,
    );
  const cont: Record<string, number> = {};
  for (const c of d.campanhas) cont[c.categoria] = (cont[c.categoria] ?? 0) + 1;
  console.log("  categorias:", ORDEM_CATEGORIAS.filter((k) => cont[k]).map((k) => `${k}: ${cont[k]}`).join(" · "));
  for (const c of d.campanhas.filter((c) => c.categoria !== "Manter" && c.categoria !== "Sem dados suficientes").slice(0, 6))
    console.log(`   [${c.categoria} | conf. ${c.confianca} | risco ${c.risco.nivel}] ${c.campanha}: ${c.motivo}`);
  const cmp = conversaMaisBarata(d);
  if (cmp) console.log(`  conversa mais barata: ${GRUPOS[cmp.barato.grupo].nome} ${brl(cmp.barato.custoPorConversa)} vs ${GRUPOS[cmp.caro.grupo].nome} ${brl(cmp.caro.custoPorConversa)} (${cmp.vezes?.toFixed(1) ?? "∞"}x)`);
  console.log("  >> Se eu tivesse que agir hoje:");
  planoDeAcao(d).forEach((i, k) => console.log(`   ${k + 1}. ${i.acao?.texto}\n      (${i.titulo} | ${i.confianca} | ${i.impactoTexto ?? "sem estimativa"})`));
  console.log(`  limitações: ${limitacoesDeAnuncios(d).map((l) => l.id).join(", ")}`);
}

console.log("\n=== Verificações");
// Regras do grupo
check(grupoDoObjetivo("LINK_CLICKS", 268, 963) === "mensagem", "tráfego com 268 conversas em 963 cliques é tráfego para o WhatsApp (régua: conversa)");
check(grupoDoObjetivo("LINK_CLICKS", 9, 7996) === "trafego", "tráfego com 9 conversas em 8 mil cliques segue como tráfego");

for (const [nome, d] of Object.entries(resultados)) {
  const plano = planoDeAcao(d);
  check(plano.length >= 1 && plano.length <= 3, `${nome}: plano tem de 1 a 3 ações (${plano.length})`);
  check(plano.every((i) => /R\$/.test(i.acao?.texto ?? "")), `${nome}: toda ação do plano traz valor em R$`);
  const ins = insightsDeAnuncios(d);
  check(ins.every((i) => i.area === "anuncios" && i.responsavel === "gestor_trafego"), `${nome}: insights com área "anuncios" e responsável gestor de tráfego`);
  const proibido = /mediana|\bCTR\b|\bCPM\b|\bCPC\b/;
  const textos = [...ins.flatMap((i) => [i.titulo, i.diagnostico, i.acao?.texto ?? ""]), ...d.campanhas.flatMap((c) => [c.motivo, c.acao, c.comparacao])];
  check(!textos.some((t) => proibido.test(t)), `${nome}: textos sem jargão (mediana, CTR, CPM, CPC)`);
  // Categorias coerentes com as regras
  for (const c of d.campanhas) {
    if (c.categoria === "Escalar agora" && !(c.vezesRegua != null && c.vezesRegua <= 0.6 && !c.cansando)) check(false, `${nome}: Escalar agora fora da regra (${c.campanha})`);
    if (c.categoria === "Cortar" && !(c.resultados === 0 || (c.vezesRegua ?? 0) >= 2)) check(false, `${nome}: Cortar fora da regra (${c.campanha})`);
  }
}
const lana = resultados["Lana Torres"];
check(conversaMaisBarata(lana) != null, "Lana: conversa de tráfego bem mais cara que de mensagem");
check(planoDeAcao(lana)[0]?.id === "anuncios-entre-objetivos", "Lana: a 1ª ação é a troca entre objetivos");
const ju = resultados["Dra. Juliana Paola"];
const blef = ju.campanhas.find((c) => c.campaign_id === "120251102433920047")!;
check(blef.grupo === "mensagem" && blef.risco.nivel === "alto", "Juliana: tráfego para WhatsApp (blefaroplastia) é julgado por conversa e tem risco alto (principal fonte de conversas)");
check(!planoDeAcao(ju).some((i) => /^(Pausar|Reduzir)[^,]*BLEFAROPLASTIA/i.test(i.acao?.texto ?? "")), "Juliana: o plano não corta a campanha que traz as conversas");
const keylon = resultados["Dr. Keylon Lucarelli"];
check(keylon.campanhas.some((c) => c.categoria === "Revisar criativo" || c.categoria === "Cortar"), "Keylon: há ao menos uma campanha para revisar ou cortar");

console.log(falhas ? `\n${falhas} verificação(ões) falharam` : "\nTodas as verificações passaram");
if (falhas) process.exit(1);
