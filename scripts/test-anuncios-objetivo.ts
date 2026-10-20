// Teste do diagnóstico por objetivo e da central de decisão de verba com dado
// real (meta_ads_daily, 13/09 a 12/10/2026, somado por campanha em duas metades,
// ver scripts/fixtures/anuncios-3-clientes.json), mais um caso sintético para as
// regras de borda dos seis vereditos (Atrai mas não converte, Sem tração,
// Volume insuficiente, comparação com a conta toda).
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
  ORDEM_VEREDITO,
  ORDEM_SELOS,
  MIN_IMPRESSOES,
  MIN_GASTO,
  MIN_CAMPANHAS_REGUA,
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
  const antiga: Record<string, number> = {};
  const selos: Record<string, number> = {};
  for (const c of d.campanhas) {
    cont[c.vereditoOficial] = (cont[c.vereditoOficial] ?? 0) + 1;
    antiga[c.vereditoContaToda] = (antiga[c.vereditoContaToda] ?? 0) + 1;
    for (const s of c.selos) selos[s] = (selos[s] ?? 0) + 1;
  }
  console.log("  vereditos (no mesmo objetivo):", ORDEM_VEREDITO.filter((k) => cont[k]).map((k) => `${k}: ${cont[k]}`).join(" · "));
  console.log("  regra antiga (conta toda, pela conversa):", ORDEM_VEREDITO.filter((k) => antiga[k]).map((k) => `${k}: ${antiga[k]}`).join(" · "));
  console.log("  selos:", ORDEM_SELOS.filter((k) => selos[k]).map((k) => `${k}: ${selos[k]}`).join(" · ") || "nenhum");
  console.log(`  régua da conta: ${brl(d.reguaConta.custoPorConversa)} por conversa (${d.reguaConta.campanhas} campanhas) · alerta "sem resultado": ${brl(d.desperdicioSemResultado)} · "verba que não entregou" (Resumo): ${brl(d.desperdicio)}`);
  for (const c of d.campanhas.filter((c) => c.vereditoOficial !== "Manter" && c.vereditoOficial !== "Volume insuficiente").slice(0, 6))
    console.log(`   [${c.vereditoOficial}${c.selos.length ? ` + ${c.selos.join(", ")}` : ""} | conf. ${c.confianca} | risco ${c.risco.nivel}] ${c.campanha}: ${c.motivo}`);
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
  // Vereditos coerentes com as regras
  let foraDaRegra = 0;
  const fora = (msg: string) => {
    foraDaRegra++;
    console.log(`  ✗ ${nome}: ${msg}`);
  };
  for (const c of d.campanhas) {
    if (!ORDEM_VEREDITO.includes(c.vereditoOficial)) fora(`veredito fora dos seis (${c.vereditoOficial})`);
    const pouco = c.impressoes < MIN_IMPRESSOES || c.gasto < MIN_GASTO;
    if (pouco !== (c.vereditoOficial === "Volume insuficiente")) fora(`Volume insuficiente fora da regra 500 aparições / R$ 30 (${c.campanha})`);
    if (c.vereditoOficial === "Escalar" && !(c.vezesRegua != null && c.vezesRegua <= 0.6)) fora(`Escalar fora da regra (${c.campanha})`);
    if (c.vereditoOficial === "Cortar" && !(c.vezesRegua != null && c.vezesRegua >= 2)) fora(`Cortar fora da regra (${c.campanha})`);
    if (c.vereditoOficial === "Manter" && c.vezesRegua != null && !(c.vezesRegua > 0.6 && c.vezesRegua < 2)) fora(`Manter fora da faixa (${c.campanha})`);
    if ((c.vereditoOficial === "Atrai mas não converte" || c.vereditoOficial === "Sem tração") && c.resultadoNaRegua !== 0) fora(`sem resultado com resultado (${c.campanha})`);
    if (c.vereditoOficial === "Atrai mas não converte" && !c.atencaoBoa) fora(`Atrai sem atenção boa (${c.campanha})`);
    if (c.vereditoOficial === "Sem tração" && c.atencaoBoa) fora(`Sem tração com atenção boa (${c.campanha})`);
    // Régua: mesmo objetivo quando há 3+ campanhas com volume; senão, a conta toda (e o selo diz isso).
    const g = d.grupos.find((x) => x.grupo === c.grupo)!;
    if (c.julgadaPor === "objetivo" && (g.medianaCusto == null || g.campanhasComVolume < MIN_CAMPANHAS_REGUA)) fora(`julgada pelo objetivo sem régua (${c.campanha})`);
    if (c.julgadaPor === "conta" && !c.selos.includes("Comparada com a conta")) fora(`comparada com a conta sem o selo (${c.campanha})`);
    if (c.julgadaPor === "conta" && !/Comparada com a conta toda/.test(c.comparacao)) fora(`comparada com a conta sem a nota visível (${c.campanha})`);
    if (c.julgadaPor === "conta" && g.medianaCusto != null && c.grupo !== "outro" && !c.selos.includes("Resultado não medido")) fora(`objetivo com régua julgado pela conta (${c.campanha})`);
    if (c.julgadaPor === "objetivo" && c.regua !== g.medianaCusto) fora(`régua do veredito diferente da mostrada no objetivo (${c.campanha})`);
    if (c.julgadaPor === "conta" && c.regua !== d.reguaConta.custoPorConversa) fora(`régua do veredito diferente da régua da conta (${c.campanha})`);
    if (c.selos.includes("Criativo cansando") !== c.cansando) fora(`selo Criativo cansando fora da regra (${c.campanha})`);
    // Técnico (Resumo/Leitura) derivado do oficial.
    if (["Escalar", "Cortar", "Manter", "Volume insuficiente"].includes(c.vereditoOficial) && c.veredito !== c.vereditoOficial) fora(`veredito técnico diverge do oficial (${c.campanha})`);
  }
  check(foraDaRegra === 0, `${nome}: todo veredito segue a regra (seis rótulos, 0,6x/2x, 500 aparições/R$ 30, régua do objetivo ou da conta)`);
  const somaSem = d.campanhas.filter((c) => c.vereditoOficial === "Atrai mas não converte" || c.vereditoOficial === "Sem tração").reduce((s, c) => s + c.gasto, 0);
  check(Math.abs(somaSem - d.desperdicioSemResultado) < 0.01, `${nome}: alerta da tela = gasto de "Atrai mas não converte" + "Sem tração" (${brl(d.desperdicioSemResultado)})`);
  const somaRes = d.campanhas.filter((c) => c.veredito === "Cortar" || c.veredito === "Sem resultado").reduce((s, c) => s + c.gasto, 0);
  check(Math.abs(somaRes - d.desperdicio) < 0.01, `${nome}: "verba que não entregou" do Resumo = Cortar + sem resultado do objetivo (${brl(d.desperdicio)})`);
  check(d.grupos.every((g) => g.objetivosBrutos.length > 0), `${nome}: todo grupo traz o nome bruto do objetivo da Meta`);
  const textosPlano = plano.map((i) => `${i.titulo} ${i.acao?.texto ?? ""}`).join(" ");
  check(!/Escalar agora|Revisar criativo|Sem dados suficientes/.test(textosPlano), `${nome}: o plano usa os seis rótulos (sem "Escalar agora" etc.)`);
}
const lana = resultados["Lana Torres"];
check(conversaMaisBarata(lana) != null, "Lana: conversa de tráfego bem mais cara que de mensagem");
check(planoDeAcao(lana)[0]?.id === "anuncios-entre-objetivos", "Lana: a 1ª ação é a troca entre objetivos");
const ju = resultados["Dra. Juliana Paola"];
const blef = ju.campanhas.find((c) => c.campaign_id === "120251102433920047")!;
check(blef.grupo === "mensagem" && blef.risco.nivel === "alto", "Juliana: tráfego para WhatsApp (blefaroplastia) é julgado por conversa e tem risco alto (principal fonte de conversas)");
check(!planoDeAcao(ju).some((i) => /^(Pausar|Reduzir)[^,]*BLEFAROPLASTIA/i.test(i.acao?.texto ?? "")), "Juliana: o plano não corta a campanha que traz as conversas");
const keylon = resultados["Dr. Keylon Lucarelli"];
check(keylon.campanhas.some((c) => c.vereditoOficial === "Cortar" || c.selos.includes("Criativo cansando")), "Keylon: há ao menos uma campanha marcada 'Cortar' ou com criativo cansando");
// Lana: tem objetivo com poucas campanhas → comparadas com a conta toda, com a nota.
check(lana.campanhas.some((c) => c.julgadaPor === "conta"), "Lana: campanhas de objetivo com menos de 3 campanhas são comparadas com a conta toda");
check(lana.campanhas.some((c) => c.selos.includes("Resultado não medido")), "Lana: cadastro/venda sem resultado registrado ganha o selo 'Resultado não medido'");
// Correção mantida: tráfego com régua própria não é julgado pela conversa.
const trafLana = lana.campanhas.filter((c) => c.grupo === "trafego" && c.julgadaPor === "objetivo");
check(trafLana.length > 0 && trafLana.every((c) => c.vereditoOficial !== "Sem tração" || c.cliquesLink === 0), "Lana: campanha de tráfego com cliques não sai 'Sem tração' por falta de conversa");

// ---------- caso sintético: regras de borda ----------
// [metade, id, objetivo, gasto, impressões, cliques no link, conversas, leads, visitas, dias, nome]
const sint = montar([
  [1, "m1", "MESSAGES", 300, 20000, 200, 30, 0, 0, 10, "msg A"], // R$ 10/conversa
  [1, "m2", "MESSAGES", 300, 20000, 200, 20, 0, 0, 10, "msg B"], // R$ 15
  [1, "m3", "MESSAGES", 300, 20000, 200, 15, 0, 0, 10, "msg C"], // R$ 20 → típica R$ 15
  [1, "m4", "MESSAGES", 100, 10000, 300, 0, 0, 0, 10, "msg prende"], // 0 conversa, 3 cliques a cada 100 (típico 1)
  [1, "m5", "MESSAGES", 100, 10000, 20, 0, 0, 0, 10, "msg parada"], // 0 conversa, 0,2 a cada 100
  [1, "m6", "MESSAGES", 100, 10000, 100, 20, 0, 0, 10, "msg barata"], // R$ 5 ≤ 0,6x
  [1, "m7", "MESSAGES", 300, 10000, 100, 9, 0, 0, 10, "msg cara"], // R$ 33 ≥ 2x
  [1, "a1", "OUTCOME_AWARENESS", 200, 50000, 50, 0, 0, 0, 10, "alcance sozinho"], // objetivo com 1 campanha
  [1, "v1", "MESSAGES", 29.99, 5000, 50, 2, 0, 0, 3, "pouca verba"],
  [1, "v2", "MESSAGES", 100, 499, 5, 2, 0, 0, 3, "poucas aparições"],
]);
const s = (id: string) => sint.campanhas.find((c) => c.campaign_id === id)!;
console.log("\n=== Caso sintético");
for (const c of sint.campanhas) console.log(`  ${c.campanha.padEnd(18)} ${c.vereditoOficial.padEnd(24)} ${c.selos.join(", ")} | técnico: ${c.veredito}`);
check(s("m4").vereditoOficial === "Atrai mas não converte" && s("m4").selos.includes("Revisar público"), "sem resultado e clica acima do típico do objetivo → 'Atrai mas não converte' (+ selo Revisar público)");
check(s("m5").vereditoOficial === "Sem tração", "sem resultado e clica abaixo do típico → 'Sem tração'");
check(s("m6").vereditoOficial === "Escalar", "custo ≤ 0,6x a típica do objetivo → 'Escalar'");
check(s("m7").vereditoOficial === "Cortar", "custo ≥ 2x a típica do objetivo → 'Cortar'");
check(s("m2").vereditoOficial === "Manter", "custo entre 0,6x e 2x → 'Manter'");
check(s("v1").vereditoOficial === "Volume insuficiente" && s("v2").vereditoOficial === "Volume insuficiente", "menos de R$ 30 ou menos de 500 aparições → 'Volume insuficiente'");
const a1 = s("a1");
check(a1.julgadaPor === "conta" && a1.selos.includes("Comparada com a conta") && /comparada com a conta toda: poucas campanhas deste objetivo/i.test(a1.comparacao), "objetivo com menos de 3 campanhas → régua da conta toda, com a nota visível");
check(a1.vereditoOficial === a1.vereditoContaToda, "na régua da conta, o veredito é o da regra original");
check(a1.veredito === "Sem comparação", "alcance sem conversa, mas com aparições: não entra na 'verba que não entregou' do Resumo");
check(s("m4").veredito === "Sem resultado" && s("m5").veredito === "Sem resultado", "'Atrai mas não converte' e 'Sem tração' no próprio objetivo entram como 'Sem resultado' no Resumo");
check(Math.abs(sint.desperdicioSemResultado - (100 + 100 + 200)) < 0.01, "alerta da tela soma Atrai + Sem tração (inclui a de alcance comparada com a conta)");
check(Math.abs(sint.desperdicio - (100 + 100 + 300)) < 0.01, "'verba que não entregou' = Cortar + sem resultado do objetivo");
const planoS = planoDeAcao(sint);
check(planoS.some((i) => /msg cara|msg parada/.test(i.acao?.texto ?? "")), "o plano corta 'Cortar'/'Sem tração' do mesmo objetivo");
check(!planoS.some((i) => /^(Pausar|Reduzir)[^,]*alcance sozinho/.test(i.acao?.texto ?? "")), "o plano não pausa a de alcance que entregou aparições (só foi julgada pela conversa)");

const atribuidoDepois = montar([
  [1, "com-veiculacao", "MESSAGES", 100, 1000, 100, 18, 0, 0, 1, "Veiculação no período"],
  [1, "atribuicao-posterior", "MESSAGES", 0, 0, 0, 1, 2, 3, 0, "Atribuição posterior"],
  [1, "sem-atividade", "MESSAGES", 0, 0, 0, 0, 0, 0, 0, "Sem atividade"],
]);
check(atribuidoDepois.conversas === 19 && atribuidoDepois.conversasMensagem === 19, "atribuição sem gasto ou impressões novos permanece no total de conversas");
check(atribuidoDepois.leads === 2 && atribuidoDepois.visitasPagina === 3, "demais resultados atribuídos também permanecem no resumo");
check(atribuidoDepois.campanhas.length === 2 && atribuidoDepois.gasto === 100 && atribuidoDepois.impressoes === 1000, "campanha sem sinal é descartada; atribuição preserva investimento e impressões corretos");
const posterior = atribuidoDepois.campanhas.find((c) => c.campaign_id === "atribuicao-posterior")!;
check(posterior.vereditoOficial === "Volume insuficiente", "atribuição sem veiculação não vira recomendação de escalar");

console.log(falhas ? `\n${falhas} verificação(ões) falharam` : "\nTodas as verificações passaram");
if (falhas) process.exit(1);
