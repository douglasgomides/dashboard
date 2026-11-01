// Data real da venda, venda por pessoa e coorte honesta (migração 20261102120000). Sem rede: fetch simulado.
import assert from "node:assert/strict";
import { avisoStatusDesconhecido, normalizeOutcome, statusClintDesconhecido } from "../api/_lib/clint-sync";
import { lerTodasAsLinhas } from "../api/_lib/ler-paginas";
import { funilDoNegocio, runRdStationSync } from "../api/_lib/rdstation-sync";
import { AVISO_VENDA_POR_PESSOA, datasDaFonteCompletas, lerVendas, normalizarVendas } from "../src/lib/vendas-periodo";

// ---------- Dr. Sergio, outubro: 19 contatos novos e 147 cards ganhos de 80 pessoas (14 novas, 66 que já estavam no CRM).
const sergio = normalizarVendas({
  vendas_no_periodo: 147, vendas_coorte: 147, fechados_sem_resultado: 0, ultima_venda: "2026-10-31", eventos_desde: "2026-10-15",
  planilha_ultimo: null, pessoas_novas: 19, pessoas_novas_com_origem: 11, por_origem: [],
  pessoas_no_periodo: 80, pessoas_no_periodo_ja_no_crm: 66, pessoas_coorte: 80, ganhos_total: 1815, ganhos_com_data_da_fonte: 0,
  vendas_coorte_pessoas_novas: 14, vendas_coorte_ja_pacientes: 110, pessoas_coorte_ja_pacientes: 66,
  ganhos_agendamento_sem_valor: 0, ganhos_agendamento_sem_valor_coorte: 0, ganhos_prospeccao_sem_valor: 0,
})!;
const ls = lerVendas(147, sergio, "2026-10-01");
assert.equal(ls.base, "coorte");
assert.equal(ls.porPessoas, true);
assert.equal(ls.numero, 80, "número principal conta pessoas");
assert.equal(ls.jaPacientes, 66);
assert.equal(ls.cardsGanhos, 147);
assert.match(ls.frase, /80 pessoas com card criado no período já compraram/);
assert.match(ls.frase, /66 já eram pacientes ou já estavam no CRM antes do período/);
assert.match(ls.frase, /dos 19 contatos novos, 14 viraram venda/);
assert.match(ls.frase, /147 orçamentos ganhos no CRM/);
assert.ok(!/dos 19 contatos novos, 147/.test(ls.frase), ls.frase);
assert.equal(ls.aviso, AVISO_VENDA_POR_PESSOA);
assert.ok(!ls.frase.includes("—"));

// Taxa de contatos novos nunca passa de 100%: se a conta não fecha, a frase não fala em "dos N contatos novos".
const quebrado = lerVendas(0, { ...sergio, vendas_coorte_pessoas_novas: 25 }, "2026-10-01");
assert.ok(!/dos 19 contatos novos/.test(quebrado.frase), quebrado.frase);

// RPC anterior (sem os campos novos): 147 cards para 19 pessoas novas não vira "dos contatos, 147 já viraram venda".
const antigo = normalizarVendas({ vendas_no_periodo: 147, vendas_coorte: 147, fechados_sem_resultado: 0, ultima_venda: null, eventos_desde: "2026-10-15", planilha_ultimo: null, pessoas_novas: 19, pessoas_novas_com_origem: 0, por_origem: [] })!;
const la = lerVendas(147, antigo, "2026-10-01");
assert.equal(la.porPessoas, false);
assert.ok(!/já viraram venda/.test(la.frase), la.frase);
assert.match(la.frase, /147 cards criados no período estão ganhos, incluindo quem já era paciente/);
// ...e quando cabe, o texto antigo continua.
assert.match(lerVendas(5, { ...antigo, vendas_coorte: 5 }, "2026-10-01").frase, /dos contatos que entraram no período, 5 já viraram venda/);

// ---------- Dra. Marcelly, outubro: todo ganho tem won_at, então a régua é a data de fechamento mesmo antes do histórico.
const marcelly = normalizarVendas({
  vendas_no_periodo: 4, vendas_coorte: 3, fechados_sem_resultado: 0, ultima_venda: "2026-10-30", eventos_desde: "2026-10-15",
  planilha_ultimo: null, pessoas_novas: 876, pessoas_novas_com_origem: 500, por_origem: [],
  pessoas_no_periodo: 4, pessoas_no_periodo_ja_no_crm: 2, pessoas_coorte: 3, ganhos_total: 20, ganhos_com_data_da_fonte: 20,
  vendas_coorte_pessoas_novas: 2, vendas_coorte_ja_pacientes: 1, pessoas_coorte_ja_pacientes: 1,
  ganhos_agendamento_sem_valor: 4, ganhos_agendamento_sem_valor_coorte: 3, ganhos_prospeccao_sem_valor: 11,
})!;
assert.equal(datasDaFonteCompletas(marcelly), true);
const lm = lerVendas(17, marcelly, "2026-10-01");
assert.equal(lm.base, "evento");
assert.equal(lm.rotulo, "Pessoas que compraram no período");
assert.equal(lm.numero, 4);
assert.match(lm.frase, /^4 pessoas compraram no período; 2 já eram pacientes ou já estavam no CRM antes do período/);
assert.match(lm.frase, /4 ganhos sem valor em etapa de agendamento não contam como venda/);
assert.ok(!/orçamentos ganhos/.test(lm.frase), "cards = pessoas: não repete");
// Faltando data em algum ganho, volta a depender do histórico de eventos.
assert.equal(datasDaFonteCompletas({ ...marcelly, ganhos_com_data_da_fonte: 19 }), false);
assert.equal(lerVendas(17, { ...marcelly, ganhos_com_data_da_fonte: 19 }, "2026-10-01").base, "coorte");

// ---------- Clint: status desconhecido continua "aberto", mas é avisado.
assert.equal(normalizeOutcome("ARCHIVED"), "open");
assert.equal(statusClintDesconhecido("archived"), "ARCHIVED");
for (const st of ["OPEN", "won", "Lost", "", "  ", null, undefined, 3]) assert.equal(statusClintDesconhecido(st), null);
assert.equal(avisoStatusDesconhecido(new Map()), null);
assert.match(avisoStatusDesconhecido(new Map([["ARCHIVED", 3], ["PAUSED", 1]]))!, /"ARCHIVED" em 3 negócios, "PAUSED" em 1 negócio/);

// ---------- Leitura do banco em páginas de 1.000 (o .limit(50_000) parava em 1.000 sem aviso).
const tabela = Array.from({ length: 2345 }, (_, i) => i);
const pedidos: [number, number][] = [];
const todas = await lerTodasAsLinhas(async (de, ate) => {
  pedidos.push([de, ate]);
  return { data: tabela.slice(de, Math.min(ate + 1, de + 1000)), error: null };
});
assert.equal(todas.length, 2345);
assert.deepEqual(pedidos, [[0, 999], [1000, 1999], [2000, 2999]]);
await assert.rejects(() => lerTodasAsLinhas(async () => ({ data: null, error: { message: "falhou" } })), /falhou/);

// ---------- RD: catálogo de funis que falha não apaga o funil dos negócios.
const cat = new Map([["s1", { id: "p1" }]]);
assert.equal(funilDoNegocio("s1", cat, new Map(), "pX"), "p1");
assert.equal(funilDoNegocio("s2", new Map(), new Map([["s2", "p2"]]), "pX"), "p2");
assert.equal(funilDoNegocio("s9", new Map(), new Map(), "pX"), "pX");
assert.equal(funilDoNegocio(null, new Map(), new Map(), null), "rdstation");

const originalFetch = globalThis.fetch;
const gravados: Record<string, any>[] = [];
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  if (url.hostname === "crm.rdstation.com") {
    if (url.pathname.endsWith("/deal_pipelines")) return new Response("indisponível", { status: 503 });
    return new Response(JSON.stringify({ deals: [{ _id: "d1", win: true, closed_at: "2026-10-20T10:00:00.000-03:00", created_at: "2026-09-01T10:00:00.000-03:00", deal_stage: { _id: "s1" } }, { _id: "d2", win: null, created_at: "2026-10-01T10:00:00.000-03:00", deal_stage: { _id: "s9" } }], has_more: false }), { status: 200 });
  }
  assert.equal(url.hostname, "review.supabase.co");
  const tabela = url.pathname.split("/").at(-1);
  if (init?.method === "POST") {
    if (tabela === "crm_leads") gravados.push(...JSON.parse(String(init.body)));
    return new Response(null, { status: 201 });
  }
  const json = (d: unknown) => new Response(JSON.stringify(d), { status: 200, headers: { "content-type": "application/json" } });
  if (tabela === "crm_connections") return json([{ id: "conn", client_id: "client", access_token: "fake-rd-token" }]);
  if (tabela === "crm_pipeline_statuses") return json([{ pipeline_id: "funil-salvo", status_id: "s1" }]);
  if (tabela === "crm_leads") return json([{ external_lead_id: "d2", pipeline_id: "funil-do-d2" }]);
  throw new Error(`tabela inesperada ${tabela}`);
};
try {
  const r = await runRdStationSync({ supabaseUrl: "https://review.supabase.co", supabaseServiceRoleKey: "fake-key", onlyClientId: "client" });
  assert.match(r[0].errors.join(), /deal_pipelines falhou \(503\)/);
  assert.deepEqual(gravados.map((l) => [l.external_lead_id, l.pipeline_id]), [["d1", "funil-salvo"], ["d2", "funil-do-d2"]]);
  assert.ok(gravados.every((l) => l.pipeline_id !== "rdstation"), "falha do catálogo não grava 'rdstation' por cima do funil");
  assert.equal(gravados[0].raw_payload.closed_at, "2026-10-20T10:00:00.000-03:00", "closed_at segue no raw_payload para o banco datar a venda");
} finally {
  globalThis.fetch = originalFetch;
}

console.log("test-data-real-da-venda: ok");
