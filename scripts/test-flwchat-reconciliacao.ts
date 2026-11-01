// runFlwChatSync: cards que somem da lista (inclusive os substituídos) e a confirmação da trava de metade, com banco e
// API falsos. Nunca conecta a nada. Dados fictícios.
import assert from "node:assert/strict";
import { runFlwChatSync } from "../api/_lib/flwchat-sync";
import { definirDormirRetry } from "../api/_lib/integration-http";

definirDormirRetry(async () => {});
const origin = "https://review.supabase.co";
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const original = globalThis.fetch;

type Linha = { external_lead_id: string; removido_na_origem: string | null; substituido_por: string | null };

async function rodada(opts: { config: Record<string, unknown>; listados: string[]; abertosNoNexo: Linha[] }) {
  const fechados: string[] = [];
  const configs: Record<string, unknown>[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const metodo = init?.method ?? "GET";
    if (url.hostname === "api.wts.chat") {
      assert.equal(metodo, "GET");
      if (url.pathname === "/crm/v1/panel/p1") return json({ id: "p1", title: "Painel", steps: [{ id: "e1", title: "Em contato" }] });
      if (url.pathname === "/crm/v1/panel/card") return json({ items: opts.listados.map((id) => ({ id, title: `card ${id}`, stepId: "e1", createdAt: "2026-10-10T10:00:00Z" })), hasMorePages: false });
      throw new Error(`rota inesperada ${url.pathname}`);
    }
    assert.equal(url.origin, origin);
    const tabela = url.pathname.split("/").at(-1);
    if (tabela === "crm_connections" && metodo === "GET") return json([{ id: "cx", client_id: "cli", access_token: "tk-falso", config: opts.config }]);
    if (tabela === "crm_connections" && metodo === "PATCH") { configs.push(JSON.parse(String(init?.body)).config); return json(null); }
    if (tabela === "crm_etapa_resultado") return json([]);
    if (tabela === "crm_leads" && metodo === "POST") return json(null);
    if (tabela === "crm_leads" && metodo === "GET") {
      assert.equal(url.searchParams.get("removido_na_origem"), null, "o substituído também entra na conta dos abertos");
      return json(opts.abertosNoNexo);
    }
    if (tabela === "crm_leads" && metodo === "PATCH") {
      assert.equal(JSON.parse(String(init?.body)).outcome, "closed");
      fechados.push(...String(url.searchParams.get("external_lead_id")).replace(/^in\.\(|\)$/g, "").split(",").filter(Boolean));
      return json(null);
    }
    if (tabela === "crm_pipeline_statuses") return json(null);
    throw new Error(`tabela inesperada ${metodo} ${tabela}`);
  }) as typeof fetch;
  try {
    const [r] = await runFlwChatSync({ supabaseUrl: origin, supabaseServiceRoleKey: "fake-key" });
    return { r, fechados, configs };
  } finally {
    globalThis.fetch = original;
  }
}

async function main() {
  const aberto = (id: string, sub: string | null = null): Linha => ({ external_lead_id: id, removido_na_origem: sub ? "2026-10-27T21:58:26Z" : null, substituido_por: sub });

  // Substituído que sumiu da lista fecha; o removido por outro motivo não entra; o listado fica.
  const a = await rodada({
    config: { panel_ids: ["p1"], cards_por_item: true },
    listados: ["1", "2"],
    abertosNoNexo: [aberto("1"), aberto("2", "1"), aberto("3", "2"), { external_lead_id: "4", removido_na_origem: "2026-10-01T00:00:00Z", substituido_por: null }],
  });
  assert.deepEqual(a.r.errors, []);
  assert.deepEqual(a.fechados, ["3"]);
  assert.deepEqual(a.configs, [], "sem trava, nada a guardar na config");

  // Trava de metade: 30 abertos, só 10 listados. 1ª rodada anota (sem fechar) e guarda na config, sem perder o resto dela.
  const abertos = Array.from({ length: 30 }, (_, i) => aberto(`c${i}`));
  const listados = abertos.slice(0, 10).map((l) => l.external_lead_id);
  const b = await rodada({ config: { panel_ids: ["p1"], nome: "x" }, listados, abertosNoNexo: abertos });
  assert.deepEqual(b.fechados, []);
  assert.equal(b.configs.length, 1);
  const pend = (b.configs[0].ausentes_pendentes as Record<string, Record<string, string>>).p1;
  assert.equal(Object.keys(pend).length, 20);
  assert.equal(b.configs[0].nome, "x");
  assert.ok(b.r.avisos?.some((x) => x.includes("próxima rodada")));

  // 2ª rodada, uma hora depois, ainda fora da lista: fecha os 20 e limpa a espera.
  const umaHoraAntes = new Date(Date.now() - 60 * 60_000).toISOString();
  const c = await rodada({
    config: { panel_ids: ["p1"], nome: "x", ausentes_pendentes: { p1: Object.fromEntries(Object.keys(pend).map((k) => [k, umaHoraAntes])) } },
    listados, abertosNoNexo: abertos,
  });
  assert.equal(c.fechados.length, 20);
  assert.deepEqual(c.configs.map((x) => x.ausentes_pendentes), [{}]);
  console.log("test-flwchat-reconciliacao: ok");
}

main().catch((e) => { console.error(e); process.exit(1); });
