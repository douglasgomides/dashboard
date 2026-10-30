import assert from "node:assert/strict";
import { Readable } from "node:stream";
import manual from "../api/sync/manual";
import type { VercelRequest, VercelResponse } from "../api/_lib/http-types";
const CID = "11111111-1111-4111-8111-111111111111", ID = "22222222-2222-4222-8222-222222222222";
const fetchBefore = globalThis.fetch, env = { ...process.env };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
let exists = true, write: Record<string, unknown> | null = null;
async function invoke(body: Record<string, unknown>) {
  let status = 0, result: any;
  const req = Object.assign(Readable.from([]), { method: "POST", query: {}, body: { client_id: CID, alvo: "link_rastreado", ...body }, headers: { authorization: "Bearer fictional", "x-forwarded-host": "untrusted.invalid", host: "untrusted.invalid" } }) as unknown as VercelRequest;
  const res = { setHeader() { return this; }, status(s: number) { status = s; return this; }, json(v: unknown) { result = v; return this; } } as unknown as VercelResponse;
  await manual(req, res); return { status, result };
}
try {
  process.env.SUPABASE_URL = "https://links.offline.invalid"; process.env.SUPABASE_SERVICE_ROLE_KEY = "fictional";
  globalThis.fetch = async (input, init) => {
    const u = new URL(String(input)), method = init?.method ?? "GET";
    assert.equal(u.origin, "https://links.offline.invalid");
    if (u.pathname === "/auth/v1/user") return json({ id: ID });
    if (u.pathname.endsWith("/app_admins")) return json({ user_id: ID });
    assert.ok(u.pathname.endsWith("/links_rastreados"));
    if (method === "GET") {
      if (u.searchParams.has("or") || u.searchParams.has("codigo_ref")) return json([]);
      assert.equal(u.searchParams.get("client_id"), `eq.${CID}`);
      return json(exists ? { id: ID, slug: "qa-antigo", slugs_antigos: [] } : null);
    }
    write = JSON.parse(String(init?.body));
    if (method === "PATCH") assert.equal(u.searchParams.get("client_id"), `eq.${CID}`);
    return json(exists ? { id: ID } : null);
  };
  const create = await invoke({ tipo: "bio", titulo: "Fictício", slug: "qa-personalizado", destino_tipo: "site", site_url: "https://example.invalid" });
  assert.equal(create.result.ok, true); assert.equal((write as any).slug, "qa-personalizado");
  assert.equal(create.result.url, "https://dash.doctorcreator.com.br/r/qa-personalizado", "untrusted host headers never control the customer-facing URL");
  const renamed = await invoke({ acao: "renomear", id: ID, slug: "qa-novo" });
  assert.equal(renamed.result.ok, true); assert.deepEqual((write as any).slugs_antigos, ["qa-antigo"]);
  assert.equal((write as any).slug, "qa-novo");
  assert.equal((await invoke({ acao: "inativo", id: ID })).result.ok, true);
  exists = false;
  assert.equal((await invoke({ acao: "inativo", id: ID })).status, 404);
  assert.equal((await invoke({ acao: "renomear", id: ID, slug: "qa-novo" })).status, 404);
  assert.equal((await invoke({ acao: "inativo" })).status, 400);
  assert.equal((await invoke({ acao: "unknown", id: ID })).status, 400);
  console.log("Tracked links API: custom slug, rename with preserved alias, canonical host, zero-row mutation and input validation passed.");
} finally {
  globalThis.fetch = fetchBefore;
  for (const k of Object.keys(process.env)) if (!(k in env)) delete process.env[k]; Object.assign(process.env, env);
}
