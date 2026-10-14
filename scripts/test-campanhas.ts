// npx tsx scripts/test-campanhas.ts
import assert from "node:assert/strict";
import { CALENDARIO, datasDoMes, potencial, sugerirCampanhas, taxaAgenda } from "../src/lib/campanhas";
import { checarLinguagemCFM } from "../src/lib/linguagem-cfm";

// Calendário: todo mês tem pelo menos uma data para qualquer especialidade? (mês sem data fica só com as campanhas de dado)
assert.ok(CALENDARIO.every((d) => d.mes >= 1 && d.mes <= 12));
const outGineco = datasDoMes(10, "Ginecologista — Menopausa");
assert.ok(outGineco.some((d) => d.id === "outubro-rosa"));
assert.ok(outGineco.some((d) => d.id === "menopausa"));
assert.ok(!datasDoMes(10, "Ginecologista").some((d) => d.id === "visao")); // visão é só oftalmo
assert.ok(datasDoMes(10, "Oftalmologista").some((d) => d.id === "visao"));
assert.ok(datasDoMes(11, "Dermatologia").find((d) => d.id === "black-friday")!.cuidado!.includes("CFM"));

const base = { tem_crm: true, abertos: 4000, parados_90d: 3088, parados_30_90d: 200, novos_parados_14d: 40, ganhos_ha_um_ano: 12, perdidos_180d: 50, leads_90d: 300, agendados_90d: 60, ganhos_90d: 10 };
assert.deepEqual(taxaAgenda(base), { taxa: 0.2, propria: true });
assert.equal(taxaAgenda(null).propria, false);
assert.equal(taxaAgenda({ ...base, leads_90d: 10 }).propria, false); // pouca base: usa a régua

const cs = sugerirCampanhas({ mes: 10, ano: 2026, especialidade: "Ginecologia", nomeMedico: "Dra. Juliana Paola", base, semResposta: 12, temaForte: { tema: "menopausa", formato: "Reels", alcanceMediano: 2000, salvamentoMediano: 30 }, ads: { custoPorConversa: 25, gastoDiaMedio: 40, melhorCampanha: "Consulta menopausa" } });
const por = Object.fromEntries(cs.map((c) => [c.id, c]));
// Ordem: atendimento sem resposta > ativação > reativação > retorno > anúncio > conteúdo
assert.deepEqual(cs.slice(0, 4).map((c) => c.id), ["sem-resposta", "ativacao", "reativacao", "retorno"]);
// Reativação em lote de 300, não a base inteira.
assert.equal(por.reativacao.projecao.publico, 300);
assert.equal(por.reativacao.projecao.resposta!.n, 18); // 6% de 300
assert.equal(por.reativacao.projecao.consultas, 4); // 18 × 20% (taxa própria)
assert.match(por.reativacao.projecao.regua, /deste cliente/);
assert.match(por.reativacao.mensagem!, /Juliana/);
// Anúncio: orçamento 40/dia × 30 = 1200; 1200/25 = 48 conversas; 15% = 7.
assert.equal(por.anuncio.projecao.custo, 1200);
assert.equal(por.anuncio.projecao.resposta!.n, 48);
assert.equal(por.anuncio.projecao.consultas, 7);
// Conteúdo das datas de outubro para ginecologia, com alcance de 3 posts.
assert.ok(por["data-outubro-rosa"]);
assert.equal(por["data-outubro-rosa"].projecao.publico, 6000);
// Nenhuma mensagem ou pauta fere a regra do CFM (preço, promoção, garantia).
for (const c of cs) {
  const r = checarLinguagemCFM([c.titulo, c.mensagem ?? "", ...c.passos].join(". "));
  assert.ok(r.ok, `CFM em ${c.id}: ${JSON.stringify(r.achados.map((a) => a.trecho))}`);
}
const p = potencial(cs);
assert.equal(p.custo, 1200);
assert.ok(p.consultas > 0);

// Sem CRM: reativação aparece como "falta dado", sem número inventado.
const semCrm = sugerirCampanhas({ mes: 12, ano: 2026, especialidade: null, nomeMedico: "Dr. X", base: null });
assert.equal(semCrm.find((c) => c.id === "reativacao")!.faltaDado !== undefined, true);
assert.equal(semCrm.find((c) => c.id === "reativacao")!.projecao.publico, null);
assert.ok(!semCrm.some((c) => c.id === "anuncio"));
assert.ok(semCrm.some((c) => c.id === "data-fim-de-ano"));
// Base pequena: sem campanha de reativação/ativação/retorno.
const pequena = sugerirCampanhas({ mes: 12, ano: 2026, especialidade: null, nomeMedico: "Dr. X", base: { ...base, parados_90d: 5, novos_parados_14d: 2, ganhos_ha_um_ano: 1 } });
assert.ok(!pequena.some((c) => ["reativacao", "ativacao", "retorno"].includes(c.id)));
console.log("test-campanhas: ok");
