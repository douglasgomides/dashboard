// Comparativo da conta de anúncios e "qualidade do lead" (auditoria de 30/10/2026).
// Rodar: npx tsx scripts/test-comparativo-anuncios.ts
import assert from "node:assert/strict";
import { leituraComparativo, mudancaDeObjetivo, resumirLado, type LadoComparativo } from "../src/lib/comparativo-anuncios";
import { AMOSTRA_MINIMA, custosQualidade, pessoas } from "../src/lib/qualidade-leads";
import type { CampanhaCadastro, LinhaAds } from "../src/lib/anuncios-objetivo";

// ---- Doctor Creator: setembro em tráfego, outubro em cadastro. A frase não pode culpar o criativo.
const linha = (date: string, campaign_id: string, spend: number, conversations: number, leads: number, link_clicks = 0): LinhaAds => ({
  date, campaign_id, spend, impressions: 1000, link_clicks, conversations, leads, landing_page_views: 0,
});
const cadastro: CampanhaCadastro[] = [
  { campaign_id: "trafego", name: "Tráfego", objective: "LINK_CLICKS" },
  { campaign_id: "cadastro", name: "Cadastro", objective: "OUTCOME_LEADS" },
];
const setembro = resumirLado([linha("2026-09-10", "trafego", 3240, 183, 0, 20000), linha("2026-09-11", "trafego", 1060, 12, 0, 5000)], cadastro);
const outubro = resumirLado([linha("2026-10-10", "trafego", 3486, 29, 0, 25000), linha("2026-10-11", "cadastro", 1817, 13, 74)], cadastro);
assert.equal(setembro.gasto, 4300);
assert.equal(outubro.leads, 74);
assert.equal(outubro.gastoPorGrupo.lead, 1817);
const mix = mudancaDeObjetivo(outubro, setembro);
assert.ok(mix, "34 pontos da verba foram para cadastro");
assert.equal(mix!.entrou?.grupo, "lead");
assert.equal(mix!.saiu?.grupo, "trafego");
const frase = leituraComparativo(outubro, setembro);
assert.match(frase, /^A verba mudou de objetivo: Tráfego \(cliques\) caiu de 100% para 66% do investimento e Cadastro \(leads\) subiu de 0% para 34%\./);
assert.match(frase, /Contatos \(conversas e cadastros\): 195 antes e 116 agora\./);
assert.doesNotMatch(frase, /criativo/);
assert.doesNotMatch(frase, /—/);

// ---- Mesma divisão da verba: aí sim a hipótese é o anúncio, comparando contatos.
const lado = (gasto: number, conversas: number, leads: number): LadoComparativo => ({ gasto, conversas, leads, gastoPorGrupo: { mensagem: gasto } });
assert.equal(mudancaDeObjetivo(lado(1200, 50, 0), lado(1000, 100, 0)), null);
assert.match(leituraComparativo(lado(1200, 50, 0), lado(1000, 100, 0)), /^O investimento subiu \+20% e as conversas caíram -50%, com a mesma divisão entre objetivos/);
assert.match(leituraComparativo(lado(1000, 80, 30), lado(1000, 100, 30)), /^Mesmo investimento \(0%\) e -15% nos contatos/);
assert.equal(leituraComparativo(lado(1000, 10, 0), null), "Sem gasto no período anterior para comparar.");
assert.equal(leituraComparativo(lado(1000, 10, 0), lado(0, 0, 0)), "Sem gasto no período anterior para comparar.");
assert.match(leituraComparativo(lado(800, 120, 0), lado(1000, 100, 0)), /a conta ficou mais eficiente/);

// ---- Qualidade do lead: Dra. Marcella, 14 conversas repartidas viram 0,9 pessoa. Sem amostra, sem custo e sem cor.
assert.equal(pessoas(0.9), 1);
assert.equal(pessoas(0.4), 0);
const marcella = [
  { campaign_id: "a", gasto: 297, base: 4.2, avancaram: 0.9, agendaram: 0.1, ganhos: 0 },
  { campaign_id: "b", gasto: 250, base: 3.1, avancaram: 0.7, agendaram: 0, ganhos: 0 },
];
const cm = custosQualidade(marcella, (l) => l.base);
assert.deepEqual([...cm.values()], [{ tipo: "amostra_pequena" }, { tipo: "amostra_pequena" }]);
// Com amostra: custo inteiro por pessoa e cor só com duas campanhas comparáveis.
const boas = [
  { campaign_id: "a", gasto: 600, base: 40, avancaram: 6, agendaram: 2, ganhos: 1 },
  { campaign_id: "b", gasto: 600, base: 30, avancaram: 3, agendaram: 1, ganhos: 0 },
  { campaign_id: "c", gasto: 300, base: 12, avancaram: 0, agendaram: 0, ganhos: 0 },
  { campaign_id: "d", gasto: 50, base: AMOSTRA_MINIMA - 1, avancaram: 5, agendaram: 0, ganhos: 0 },
];
const cb = custosQualidade(boas, (l) => l.base);
assert.deepEqual(cb.get("a"), { tipo: "custo", valor: 100, melhor: true });
assert.deepEqual(cb.get("b"), { tipo: "custo", valor: 200, melhor: false });
assert.deepEqual(cb.get("c"), { tipo: "nenhum_avancou" });
assert.deepEqual(cb.get("d"), { tipo: "amostra_pequena" }, "a mais barata, mas com amostra pequena: não vence");
const sozinha = custosQualidade([boas[0]], (l) => l.base);
assert.deepEqual(sozinha.get("a"), { tipo: "custo", valor: 100, melhor: false }, "uma campanha só não tem com quem comparar");
console.log("test-comparativo-anuncios: ok");
