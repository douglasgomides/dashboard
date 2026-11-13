import assert from "node:assert/strict";
import { canaisDaResposta, canaisDosLeads, juntarCanais, runKommoLeadsSync, type KommoLead } from "../api/_lib/kommo-leads-sync";

// Nome do canal de entrada do Kommo (source_id do lead). Corpos inventados: ids e nomes fictícios.

// GET /api/v4/sources: nome em branco fica de fora; id que não é inteiro seguro também.
const fontes = {
  _embedded: {
    sources: [
      { id: 11, name: "Canal A", type: "whatsapp" },
      { id: 12, name: "  " },
      { id: "13", name: "id em texto" },
      { id: 14.5, name: "id quebrado" },
      { id: 15, name: " Canal C ", origin_code: "formulario" },
      { id: 16, name: "Canal D", type: 7 },
    ],
  },
};
assert.deepEqual(canaisDaResposta(fontes, "cx1"), [
  { crm_connection_id: "cx1", canal_id: "11", nome: "Canal A", tipo: "whatsapp" },
  { crm_connection_id: "cx1", canal_id: "15", nome: "Canal C", tipo: "formulario" },
  { crm_connection_id: "cx1", canal_id: "16", nome: "Canal D", tipo: null },
], "nome em branco e id inválido ficam de fora; nome aparado; tipo só texto");
assert.deepEqual(canaisDaResposta(fontes, "cx1")[0], { crm_connection_id: "cx1", canal_id: "11", nome: "Canal A", tipo: "whatsapp" });
assert.deepEqual(canaisDaResposta(null, "cx1"), []);
assert.deepEqual(canaisDaResposta({}, "cx1"), []);
assert.deepEqual(canaisDaResposta({ _embedded: { sources: [] } }, "cx1"), [], "lista vazia: nenhum nome, nunca um chute");
assert.deepEqual(canaisDaResposta({ _embedded: { sources: "x" } }, "cx1"), []);

// Leads pedidos com with=source: o nome vem em _embedded.source. Lead sem nome não gera linha.
const lead = (l: Partial<KommoLead> & { id: number }) => ({ status_id: 1, pipeline_id: 1, price: 0, ...l }) as KommoLead;
const leads = [
  lead({ id: 1, source_id: 21, _embedded: { source: { id: 21, name: "Canal B" } } }),
  lead({ id: 2, source_id: 22 }),
  lead({ id: 3, source_id: 23, _embedded: { source: null } }),
  lead({ id: 4, source_id: 24, _embedded: { source: { id: 24, name: "   " } } }),
  lead({ id: 5, source_id: 25, _embedded: { source: { id: 99, name: "outro canal" } } }),
  lead({ id: 6, _embedded: { source: { id: 26, name: "Canal E", type: "instagram" } } }),
  lead({ id: 7, source_id: 21, _embedded: { source: { id: 21, name: "Canal B repetido" } } }),
];
assert.deepEqual(canaisDosLeads(leads, "cx1"), [
  { crm_connection_id: "cx1", canal_id: "21", nome: "Canal B", tipo: null },
  { crm_connection_id: "cx1", canal_id: "26", nome: "Canal E", tipo: "instagram" },
], "sem nome, nome em branco ou id que não bate com o source_id do lead: nada");
assert.deepEqual(canaisDosLeads([lead({ id: 1, source_id: 21, _embedded: { source: { id: 21, name: "Canal B" } } }), lead({ id: 2, source_id: 22 })], "cx1"), [
  { crm_connection_id: "cx1", canal_id: "21", nome: "Canal B", tipo: null },
]);
assert.deepEqual(canaisDosLeads([], "cx1"), []);
assert.deepEqual(canaisDosLeads(null as unknown as KommoLead[], "cx1"), []);

// Os dois dão nome ao mesmo canal: vale o de /sources. Uma linha por canal_id.
const juntos = juntarCanais(
  [{ crm_connection_id: "cx1", canal_id: "11", nome: "Canal A", tipo: "whatsapp" }],
  [
    { crm_connection_id: "cx1", canal_id: "11", nome: "Nome pelo lead", tipo: null },
    { crm_connection_id: "cx1", canal_id: "21", nome: "Canal B", tipo: null },
  ],
);
assert.deepEqual(juntos, [
  { crm_connection_id: "cx1", canal_id: "11", nome: "Canal A", tipo: "whatsapp" },
  { crm_connection_id: "cx1", canal_id: "21", nome: "Canal B", tipo: null },
]);
assert.deepEqual(juntarCanais([], []), []);

// Sync inteiro com fetch falso (nada sai para a rede): grava os nomes, /sources vence, nada de origem.
const origem = "https://exemplo.supabase.co";
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });
const fetchOriginal = globalThis.fetch;
async function rodar(opcoes: { tabelaAusente?: boolean; erroBanco?: boolean; fontes?: number }) {
  const gravados: any[] = [];
  const tabelas: string[] = [];
  const pedidosWith: string[] = [];
  let paginasFontes = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.origin === origem) {
      const tabela = url.pathname.split("/").at(-1)!;
      tabelas.push(tabela);
      if (tabela === "crm_leads_sync_state" && init?.method !== "POST") return json({ next_page: 1, backfill_done: true });
      if (tabela === "crm_canais_kommo") {
        if (opcoes.tabelaAusente) return json({ code: "PGRST205", message: "Could not find the table 'public.crm_canais_kommo' in the schema cache" }, 404);
        if (opcoes.erroBanco) return json({ code: "XX000", message: "falha simulada" }, 400);
        gravados.push(...JSON.parse(String(init?.body)));
      }
      return json(null);
    }
    assert.equal(url.hostname, "exemplo.kommo.com");
    if (url.pathname.endsWith("loss_reasons")) return new Response(null, { status: 204 });
    if (url.pathname.endsWith("leads/pipelines")) return json({ _embedded: { pipelines: [] } });
    if (url.pathname.endsWith("/sources")) {
      paginasFontes++;
      if (opcoes.fontes === 204) return new Response(null, { status: 204 });
      if (opcoes.fontes === 500) return json({}, 500);
      const prox = opcoes.fontes === 99 ? { next: { href: "x" } } : {};
      return json({ _embedded: { sources: [{ id: 21, name: "Nome pela lista", type: "whatsapp" }] }, _links: prox });
    }
    pedidosWith.push(url.searchParams.get("with") ?? "");
    return json({ _embedded: { leads: [
      { id: 1, status_id: 1, pipeline_id: 1, price: 0, source_id: 21, _embedded: { source: { id: 21, name: "Nome pelo lead" } } },
      { id: 2, status_id: 1, pipeline_id: 1, price: 0, source_id: 22, _embedded: { source: { id: 22, name: "Canal F" } } },
      { id: 3, status_id: 1, pipeline_id: 1, price: 0, source_id: 23 },
    ] } });
  }) as typeof fetch;
  try {
    const r = await runKommoLeadsSync({ supabaseUrl: origem, supabaseServiceRoleKey: "chave-falsa", accessToken: "token-falso", kommoDomain: "exemplo.kommo.com", crmConnectionId: "cx1", clientId: "cli1", maxPages: 1 });
    return { r, gravados, tabelas, pedidosWith, paginasFontes };
  } finally {
    globalThis.fetch = fetchOriginal;
  }
}

{
  const { r, gravados, tabelas, pedidosWith } = await rodar({});
  assert.deepEqual(r.errors, []);
  assert.equal(r.leadsUpserted, 3, "os leads seguem iguais");
  assert.ok(pedidosWith.every((w) => w.split(",").includes("source") && w.split(",").includes("source_id")), "leads pedidos com with=source");
  assert.deepEqual(gravados.map(({ lido_em, ...c }) => { assert.ok(!Number.isNaN(Date.parse(lido_em))); return c; }), [
    { crm_connection_id: "cx1", canal_id: "21", nome: "Nome pela lista", tipo: "whatsapp" },
    { crm_connection_id: "cx1", canal_id: "22", nome: "Canal F", tipo: null },
  ], "um por canal, /sources vence, lead sem nome não gera linha");
  assert.ok(!tabelas.includes("crm_canais_origem"), "nenhuma origem gravada aqui");
}
{
  const { r } = await rodar({ tabelaAusente: true });
  assert.deepEqual(r.errors, [], "antes da migração a tabela não existe: pula sem marcar a fonte como falha");
  assert.equal(r.leadsUpserted, 3);
}
{
  const { r } = await rodar({ erroBanco: true });
  assert.deepEqual(r.errors, ["canais: falha simulada"], "outra falha do banco aparece, mas o sync segue");
  assert.equal(r.leadsUpserted, 3);
}
{
  const { r, gravados } = await rodar({ fontes: 204 });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(gravados.map((c) => [c.canal_id, c.nome]), [["21", "Nome pelo lead"], ["22", "Canal F"]], "204 em /sources: só o nome dos leads");
}
{
  const { r, gravados } = await rodar({ fontes: 500 });
  assert.deepEqual(r.errors, []);
  assert.equal(gravados.length, 2);
}
{
  const { paginasFontes } = await rodar({ fontes: 99 });
  assert.equal(paginasFontes, 10, "no máximo 10 páginas de /sources por rodada");
}

console.log("kommo canais ok");
