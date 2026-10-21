import assert from "node:assert/strict";
import { clintPrice, clintSource, runClintSync } from "../api/_lib/clint-sync";

const originalFetch = globalThis.fetch;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const leads: Record<string, any>[] = [];
const stages: Record<string, any>[] = [];
let malformedDeals = false;
let failWrite = false;
let providerError = false;
const calls: string[] = [];

assert.equal(clintSource({ fonte: " Pós-compra | perfil privado ", parameters_utm_source: "ig" }), "Pós-compra");
assert.equal(clintSource({ fonte: "  ", parameters_utm_source: "ig" }), "ig");
assert.equal(clintSource({ fonte: { arbitrary: true } }), null);
assert.equal(clintPrice("349.90"), 349.9);
assert.equal(clintPrice("0"), 0);
for (const value of [null, "", " ", "bad", "0x10", "Infinity", Infinity]) assert.equal(clintPrice(value), null);

globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  calls.push(url.pathname + url.search);
  if (url.hostname === "review.supabase.co") {
    const table = url.pathname.split("/").at(-1);
    if (init?.method === "POST") {
      if (failWrite) return json({ message: "simulated persistence failure" }, 400);
      (table === "crm_leads" ? leads : stages).push(...JSON.parse(String(init.body)));
      return new Response(null, { status: 201 });
    }
    assert.equal(table, "crm_connections");
    assert.equal(url.searchParams.get("client_id"), "eq.client");
    return json([{ id: "connection", client_id: "client", access_token: "fake-clint-token", config: { origins: ["allowed", "allowed"] } }]);
  }
  assert.equal(url.hostname, "api.clint.digital");
  assert.equal(new Headers(init?.headers).get("api-token"), "fake-clint-token");
  if (url.pathname === "/v1/origins") {
    if (url.searchParams.get("page") === "1") return json({ data: [{ id: "other-client", name: "Other", stages: [{ id: "private", label: "Private" }] }], hasNext: true });
    return json({ data: [{ id: "allowed", name: "Pipeline", stages: [{ id: "empty", label: "Agendados" }, { id: "new", label: "Nome atual" }] }], hasNext: false });
  }
  assert.equal(url.pathname, "/v1/deals");
  assert.equal(url.searchParams.get("origin_id"), "allowed");
  if (providerError) return new Response("Private contact and token", { status: 429 });
  if (malformedDeals) return json({ unexpected: [] });
  const deal = { id: "one", origin_id: "allowed", stage_id: "new", stage: "Nome antigo", value: "99.90", status: "WON", fields: { fonte: "Site" } };
  if (url.searchParams.get("page") === "1") return json({ data: [deal], hasNext: true });
  return json({ data: [deal, { id: "two", origin_id: "allowed", stage_id: "legacy", stage: "Etapa antiga", value: 0, status: "OPEN" }, { id: "leaked", origin_id: "other-client" }], hasNext: false });
};

const env = { supabaseUrl: "https://review.supabase.co", supabaseServiceRoleKey: "fake-key", onlyClientId: "client" };
try {
  let result = await runClintSync(env);
  assert.equal(result[0].negocios, 2, "deduplicate deals across pages before upsert");
  assert.equal(result[0].origens, 1);
  assert.match(result[0].errors.join(), /fora do funil/);
  assert.deepEqual(leads.map((l) => [l.external_lead_id, l.source, l.price, l.outcome]), [["one", "Site", 99.9, "won"], ["two", null, 0, "open"]]);
  assert.deepEqual(stages.map((s) => [s.status_id, s.status_name]), [["empty", "Agendados"], ["new", "Nome atual"], ["legacy", "Etapa antiga"]]);
  assert.ok(stages.every((s) => s.pipeline_id === "allowed"));
  assert.equal(calls.filter((p) => p.startsWith("/v1/deals?")).length, 2);

  malformedDeals = true;
  result = await runClintSync(env);
  assert.equal(result[0].negocios, 0);
  assert.match(result[0].errors.join(), /sem lista de negócios/);
  malformedDeals = false;
  failWrite = true;
  result = await runClintSync(env);
  assert.equal(result[0].negocios, 0, "failed writes must not count as synced");
  assert.match(result[0].errors.join(), /persistence failure/);
  failWrite = false;
  providerError = true;
  result = await runClintSync(env);
  assert.match(result[0].errors.join(), /429/);
  assert.ok(!JSON.stringify(result).includes("Private contact"));
  providerError = false;
  result = await runClintSync({ ...env, deadlineMs: Date.now() - 1 });
  assert.equal(result[0].negocios, 0);
  assert.match(result[0].errors.join(), /dados parciais/);
  console.log("Clint: sources, values, full stage catalog, pagination, tenant scope and failure reporting passed");
} finally {
  globalThis.fetch = originalFetch;
}
