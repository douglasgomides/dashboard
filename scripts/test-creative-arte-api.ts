import assert from "node:assert/strict";
import { Readable } from "node:stream";
import manual from "../api/sync/manual";
import type { VercelRequest, VercelResponse } from "../api/_lib/http-types";

const CLIENT = "11111111-1111-4111-8111-111111111111";
const ADAPTATION = "22222222-2222-4222-8222-222222222222";
const ART = "33333333-3333-4333-8333-333333333333";
const USER = "44444444-4444-4444-8444-444444444444";
const origin = "https://creative-arte.offline.invalid";
const originalFetch = globalThis.fetch, originalEnv = { ...process.env };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const path = `artes/${CLIENT}/${ADAPTATION}/2-fixture.png`;
let copy = "Teste";
let isAdmin = true, missingAdaptation = false, missingArt = false, failure = "", providerCalls = 0, calls = 0, cleaned = 0;
const saved: Record<string, unknown>[] = [], reviews: Record<string, unknown>[] = [];
const settlements: Record<string, unknown>[] = [];

async function invoke(body: Record<string, unknown>, token = "Bearer fictional-session") {
  const req = Object.assign(Readable.from([]), { method: "POST", query: {}, headers: { authorization: token }, body }) as unknown as VercelRequest;
  let status = 0;
  let result: any;
  const res = { setHeader() { return this; }, status(n: number) { status = n; return this; }, json(v: unknown) { result = v; return this; } } as unknown as VercelResponse;
  await manual(req, res);
  return { status, result };
}
const request = (extra: Record<string, unknown>) => ({ client_id: CLIENT, alvo: "creative_arte", ...extra });

try {
  process.env.SUPABASE_URL = origin;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fictional-service-key";
  process.env.OPENAI_API_KEY = "fictional-image-key";
  globalThis.fetch = async (input, init) => {
    calls++;
    const u = new URL(String(input)), method = init?.method ?? "GET";
    if (u.origin === "https://api.openai.com") {
      assert.equal(u.pathname, "/v1/images/generations");
      assert.equal(method, "POST");
      assert.match(JSON.parse(String(init?.body)).prompt, /Slide 2 de 2/);
      providerCalls++;
      if (failure === "network") throw new Error("simulated unknown provider outcome");
      return failure === "provider" ? json({ error: { message: "fictional provider failure" } }, 403) : json({ data: [{ b64_json: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=" }], usage: { input_tokens: 100, output_tokens: 1000 } });
    }
    assert.equal(u.origin, origin, "no request may reach a real service during regression tests");
    if (u.pathname === "/auth/v1/user") return json({ id: USER });
    if (u.pathname.endsWith("/app_admins")) return json(isAdmin ? { user_id: USER } : null);
    if (u.pathname.endsWith("/client_members")) return json({ user_id: USER, role: "strategist" });
    if (u.pathname.endsWith("/rpc/creative_arte_reservar")) {
      const b = JSON.parse(String(init?.body));
      assert.equal(b.p_client_id, CLIENT); assert.equal(b.p_adaptation_id, ADAPTATION);
      assert.ok(b.p_valor_usd > 0.063);
      return failure === "reserve" ? json({ message: "Teto diário", code: "P0001" }, 400) : json(b.p_positions.map((position: number) => ({ id: `fictional-reservation-${position}`, position })));
    }
    if (u.pathname.endsWith("/rpc/creative_arte_finalizar")) {
      settlements.push(JSON.parse(String(init?.body)));
      return failure === "settlement" ? json({ message: "DB unavailable" }, 503) : json(true);
    }
    if (u.pathname === "/storage/v1/object/nexo-creative-private" && method === "DELETE") {
      assert.equal(JSON.parse(String(init?.body)).prefixes.length, 1); cleaned++;
      return json([]);
    }
    if (u.pathname.startsWith("/storage/v1/object/sign/")) {
      assert.deepEqual(JSON.parse(String(init?.body)), { expiresIn: 600, paths: [path] });
      return json([{ path, signedURL: `/object/sign/nexo-creative-private/${path}?token=fictional` }]);
    }
    if (u.pathname.startsWith("/storage/v1/object/nexo-creative-private/artes/")) {
      assert.equal(method, "POST");
      const png = Buffer.from(await new Response(init?.body).arrayBuffer());
      assert.equal(png.readUInt32BE(16), 1080, "stored image is typeset in final feed dimensions");
      assert.equal(png.readUInt32BE(20), 1350);
      assert.ok(u.pathname.includes(`/${CLIENT}/${ADAPTATION}/2-`));
      return failure === "storage" ? json({ message: "fictional upload failure" }, 400) : json({ Key: path });
    }
    const table = u.pathname.split("/").at(-1);
    if (method === "GET") {
      assert.equal(u.searchParams.get("client_id"), `eq.${CLIENT}`);
      if (table === "creative_adaptations") {
        assert.equal(u.searchParams.get("id"), `eq.${ADAPTATION}`, "adaptacao_id must survive request validation");
        return json(missingAdaptation ? null : { id: ADAPTATION, client_id: CLIENT, document: { theme: "Teste fictício", units: [1, 2].map((position) => ({ position, copy, image_brief: "Fundo abstrato", layout_brief: "Título", on_screen_text: "Teste", narrative_role: "exemplo" })) } });
      }
      if (table === "ia_execucoes") return json([]);
      if (table === "creative_artes") {
        assert.equal(u.searchParams.get("adaptation_id"), `eq.${ADAPTATION}`);
        return json([{ id: ART, position: 2, status: "rascunho", storage_path: path, criado_em: "2026-10-20T00:00:00Z" }]);
      }
    }
    if (table === "creative_artes" && method === "POST") {
      saved.push(JSON.parse(String(init?.body)));
      return failure === "record" ? json({ message: "fictional insert failure" }, 400) : json(null);
    }
    if (table === "creative_artes" && method === "PATCH") {
      assert.equal(u.searchParams.get("client_id"), `eq.${CLIENT}`);
      assert.equal(u.searchParams.get("id"), `eq.${ART}`, "arte_id must survive validation");
      reviews.push(JSON.parse(String(init?.body)));
      return json(missingArt ? null : [{ id: ART }]);
    }
    if (table === "ia_execucoes" && method === "POST") return json(null);
    throw new Error(`Unexpected request: ${method} ${u.pathname}`);
  };

  const listing = await invoke(request({ acao: "listar", adaptacao_id: ADAPTATION }));
  assert.equal(listing.status, 200, "the real image-listing payload must reach its handler");
  assert.equal(listing.result.ok, true);
  assert.equal(listing.result.artes[0].id, ART);
  assert.match(listing.result.artes[0].url, /token=fictional/);

  const generated = await invoke(request({ acao: "gerar", adaptacao_id: ADAPTATION, slides: [2] }));
  assert.deepEqual(generated, { status: 200, result: { alvo: "creative_arte", ok: true, geradas: 1, erros: [] } });
  assert.equal(providerCalls, 1, "refazer must retain the requested slide rather than charge for every slide");
  assert.equal(saved[0].position, 2);
  assert.equal(saved[0].adaptation_id, ADAPTATION);
  assert.equal(saved[0].custo_usd, 0.0405, "the paid cost includes the provider's input and output usage");
  assert.equal(settlements.at(-1)?.p_ok, true);
  for (const status of ["aprovada", "descartada"]) {
    assert.equal((await invoke(request({ acao: "revisar", arte_id: ART, status }))).result.ok, true);
    assert.equal(reviews.at(-1)?.status, status);
    assert.equal(reviews.at(-1)?.revisado_por, USER);
  }
  copy = "palavra ".repeat(200).trim();
  const beforeOverflow = providerCalls;
  assert.equal((await invoke(request({ acao: "gerar", adaptacao_id: ADAPTATION, slides: [2] }))).result.ok, false);
  assert.equal(providerCalls, beforeOverflow, "unreadable copy must fail before a paid request");
  copy = "Teste";
  const before = calls;
  for (const bad of [
    { acao: "listar" }, { acao: "gerar", adaptacao_id: "invalid" },
    { acao: "gerar", adaptacao_id: ADAPTATION, slides: [0] },
    { acao: "gerar", adaptacao_id: ADAPTATION, slides: ["2"] },
    { acao: "revisar", arte_id: ART }, { acao: "revisar", arte_id: ART, status: "published" },
    { acao: "unknown", adaptacao_id: ADAPTATION },
  ]) assert.equal((await invoke(request(bad))).status, 400);
  assert.equal(calls, before, "invalid image requests must fail before auth, storage or billing");
  assert.equal((await invoke(request({ acao: "listar", adaptacao_id: ADAPTATION }), "")).status, 401);
  isAdmin = false;
  assert.equal((await invoke(request({ acao: "gerar", adaptacao_id: ADAPTATION }))).status, 403);
  assert.equal(providerCalls, 1, "a clinic member cannot bypass the admin-only image gate");
  isAdmin = true; missingAdaptation = true;
  assert.match((await invoke(request({ acao: "gerar", adaptacao_id: ADAPTATION }))).result.erro, /não encontrada/);
  assert.equal(providerCalls, 1, "missing or foreign adaptations never call the paid provider");
  missingAdaptation = false;
  missingArt = true;
  assert.equal((await invoke(request({ acao: "revisar", arte_id: ART, status: "aprovada" }))).result.ok, false, "zero-row review is not a success");
  missingArt = false;
  failure = "reserve";
  const beforeReservation = providerCalls;
  assert.equal((await invoke(request({ acao: "gerar", adaptacao_id: ADAPTATION, slides: [2] }))).result.ok, false);
  assert.equal(providerCalls, beforeReservation, "a denied budget never calls the paid provider");
  for (const boundary of ["provider", "storage", "record", "network", "settlement"]) {
    failure = boundary;
    const r = await invoke(request({ acao: "gerar", adaptacao_id: ADAPTATION, slides: [2] }));
    assert.equal(r.result.geradas, 0, `failure at ${boundary} must never count a completed image`);
    assert.equal(r.result.erros.length, 1);
    const cost = Number(settlements.at(-1)?.p_custo_usd);
    assert.equal(cost === 0, boundary === "provider", "a paid or uncertain request keeps its cost even when persistence fails");
  }
  assert.equal(cleaned, 1, "a private file is cleaned up if its database record fails");
  console.log("ok creative-arte-api (payload real → autenticação → geração → arquivo privado → registro → URL assinada → revisão; falhas e isolamento)");
} finally {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
}
