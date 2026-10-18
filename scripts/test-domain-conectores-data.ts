import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { lerMapaConexoes } from "../src/lib/conectores-data";

const id = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
const recent = new Date().toISOString();
const fixture: Record<string, Record<string, unknown>[]> = {
  clients: Array.from({ length: 1203 }, (_, n) => ({ id: id(n), name: `Clínica ${n}`, meta_ad_account_id: n === 3 ? "456" : null, wts_company_id: n === 1 ? "configured-account" : null })),
  crm_connections: [{ id: "a", client_id: id(0), provider: "kommo", active: false }, { id: "b", client_id: id(4), provider: "digisac", active: true }],
  instagram_accounts: [{ id: "a", client_id: id(0), sync_source: "meta_graph", active: false, ig_username: "disabled" }, { id: "b", client_id: id(1), sync_source: "windsor", active: true, ig_username: "configured" }],
  sync_status: [{ client_id: id(0), fonte: "atendimento", last_attempt_at: recent, last_success_at: recent, last_error: null }, { client_id: id(4), fonte: "crm", last_attempt_at: recent, last_success_at: recent, last_error: null }],
  shortio_links: Array.from({ length: 1205 }, (_, n) => ({ id: String(n), client_id: id(0), stats_em: n === 1204 ? recent : null })),
  client_ad_accounts: [{ client_id: id(0), ad_account_id: "123", active: true }, { client_id: id(2), ad_account_id: "disabled", active: false }, { client_id: id(3), ad_account_id: "456", active: true }],
};
const selects = new Map<string, string>();
let failTable: string | undefined;
const db = createClient("https://offline.invalid", "test-publishable-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: async (input) => {
    const url = new URL(String(input));
    const table = url.pathname.split("/").at(-1)!;
    if (table === failTable) return new Response(JSON.stringify({ message: "simulated source failure" }), { status: 500 });
    const select = url.searchParams.get("select") ?? "";
    assert.ok(select && !select.includes("*"));
    assert.ok(!/token|secret|password|api_key/.test(select), "connection inventory never selects credentials");
    selects.set(table, select);
    assert.ok(url.searchParams.get("order"), "each page has deterministic ordering");
    const from = Number(url.searchParams.get("offset") ?? 0);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 1000), 137);
    return new Response(JSON.stringify(fixture[table].slice(from, from + limit)), { status: 200, headers: { "content-type": "application/json" } });
  } },
});
const map = await lerMapaConexoes(db);
assert.equal(map.meta_ads.length, 1203, "clients beyond the first server page remain visible");
assert.equal(map.meta_ads.find((row) => row.clientId === id(0))?.estado, "sem_registro", "an active linked ad account connects even without a legacy primary account");
assert.equal(map.meta_ads.find((row) => row.clientId === id(2))?.estado, "nao_conectado", "a disabled account does not connect a client");
assert.equal(map.meta_ads.find((row) => row.clientId === id(3))?.detalhe, "conta 456", "the same account in both registries counts once");
assert.equal(map.wts.find((row) => row.clientId === id(0))?.estado, "nao_conectado", "an old sync status is not proof of an existing connection");
assert.equal(map.wts.find((row) => row.clientId === id(1))?.estado, "sem_registro", "a configured account is shown before its first sync");
assert.equal(map.meta_graph.find((row) => row.clientId === id(0))?.estado, "nao_conectado");
assert.equal(map.windsor.find((row) => row.clientId === id(1))?.detalhe, "@configured");
assert.equal(map.digisac.find((row) => row.clientId === id(4))?.estado, "conectado");
assert.equal(map.shortio.find((row) => row.clientId === id(0))?.detalhe, "1205 link(s)");
assert.equal(map.shortio.find((row) => row.clientId === id(0))?.ultimoSucesso, recent, "statistics on the last page determine freshness");
assert.deepEqual(map.google_ads, []);
assert.equal(selects.size, 6);
failTable = "client_ad_accounts";
await assert.rejects(() => lerMapaConexoes(db), (error: unknown) => (error as { message?: string }).message === "simulated source failure", "a failed source cannot silently become disconnected clients");
console.log("Connector data regressions passed: HTTP pagination, connection registrations, disabled accounts, freshness, and credential-free selects.");
