import assert from "node:assert/strict";
import { runBackfillThumbnails } from "../api/_lib/backfill-thumbnails.js";
import { createHubServer } from "../server/vps.js";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
const posts = [
  { id: "p-a", windsor_media_id: "media-a", instagram_account_id: "account-a" },
  { id: "p-b", windsor_media_id: "media-b", instagram_account_id: "account-b" },
  { id: "p-c", windsor_media_id: "media-c", instagram_account_id: "account-c" },
];
try {
  for (const fallback of ["", "legacy-default"]) {
    const calls: Array<{ token: string; media: string[] }> = [];
    let updates = 0;
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.hostname === "supabase.example.test") {
        if (url.pathname.endsWith("/instagram_account_secrets")) {
          assert.equal(url.searchParams.get("instagram_account_id"), "in.(account-a,account-b,account-c)");
          return Response.json([
            { instagram_account_id: "account-a", meta_access_token: "token-a" },
            { instagram_account_id: "account-b", meta_access_token: "token-b" },
          ]);
        }
        if (init?.method === "PATCH") { updates++; return new Response(null, { status: 204 }); }
        if (init?.method === "HEAD") return new Response(null, { headers: { "content-range": "0-0/1" } });
        return Response.json(posts);
      }
      assert.equal(url.hostname, "graph.facebook.com");
      const body = new URLSearchParams(String(init?.body));
      const batch = JSON.parse(body.get("batch") ?? "[]") as Array<{ relative_url: string }>;
      const media = batch.map((b) => b.relative_url.split("?")[0]);
      calls.push({ token: body.get("access_token") ?? "", media });
      return Response.json(batch.map(() => ({ code: 200, body: JSON.stringify({ thumbnail_url: "https://images.example.test/thumb.jpg" }) })));
    };
    const result = await runBackfillThumbnails({ accessToken: fallback, supabaseUrl: "https://supabase.example.test", supabaseServiceRoleKey: "test-service-role" });
    assert.deepEqual(calls, [
      { token: "token-a", media: ["media-a"] },
      { token: "token-b", media: ["media-b"] },
      ...(fallback ? [{ token: fallback, media: ["media-c"] }] : []),
    ]);
    assert.equal(updates, fallback ? 3 : 2);
    assert.equal(result.errors.length, fallback ? 0 : 1);
  }
  globalThis.fetch = originalFetch;
  process.env.SUPABASE_URL = "https://supabase.example.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
  process.env.SYNC_SECRET = "test-sync-secret";
  delete process.env.META_ACCESS_TOKEN;
  const server = createHubServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert(address && typeof address !== "string");
  try {
    for (const route of ["meta-graph", "meta-comments", "backfill-thumbnails"]) {
      const response: Response = await fetch(`http://127.0.0.1:${address.port}/api/sync/${route}`);
      assert.equal(response.status, 401, `${route} must enforce authentication without requiring a global Meta token`);
    }
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  console.info("META_ACCOUNT_CREDENTIALS_OK: account isolation, explicit legacy fallback, missing credential and API authentication");
} finally {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
}
