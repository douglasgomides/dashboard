import assert from "node:assert/strict";
import { Readable } from "node:stream";
import type { VercelRequest, VercelResponse } from "../api/_lib/http-types";
import { runMetaGraphSync } from "../api/_lib/meta-graph-sync";
import webhook from "../api/integrations/kommo/webhook";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
const originalError = console.error;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const dbError = () => json({ message: "simulated database failure", code: "XX000" }, 400);
const today = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const syncEnv = { accessToken: "fake-token", supabaseUrl: "https://review.supabase.co", supabaseServiceRoleKey: "fake-key", after: "old-cursor", maxPages: 1 };

async function testInstagram() {
  const posts = new Map<string, Record<string, unknown>>([
    ["one", { reach: 100, saved: 20, likes: 9, metrics_updated_at: "2026-01-01", profile_visits: 8 }],
    ["two", { reach: 200, saved: 40, metrics_updated_at: "2026-01-01", profile_visits: 12 }],
  ]);
  let state: Record<string, unknown> = { next_cursor: "old-cursor", backfill_done: false };
  let stateWrites = 0;
  let rejectInsights = true;
  let rejectPosts = false;
  let rejectState = false;
  let rejectDailyMetrics = false;
  let malformed = false;
  let finalPage = false;
  const batches: Record<string, unknown>[][] = [];
  const dailyMetrics = new Map<string, Record<string, unknown>>();
  let dailyWrites = 0;
  globalThis.fetch = async (input, init) => {
    const u = new URL(String(input));
    if (u.host === "review.supabase.co") {
      const table = u.pathname.split("/").at(-1)!;
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        if (table === "instagram_posts") {
          if (rejectPosts) return dbError();
          const rows: Record<string, unknown>[] = Array.isArray(body) ? body : [body];
          batches.push(rows);
          // Simula a união das colunas de um lote PostgREST: campo ausente vira null.
          const columns = new Set(rows.flatMap(Object.keys));
          for (const row of rows) {
            const patch = Object.fromEntries([...columns].map((k) => [k, row[k] ?? null]));
            posts.set(String(row.windsor_media_id), { ...posts.get(String(row.windsor_media_id)), ...patch });
          }
        } else if (table === "instagram_account_daily_metrics") {
          if (rejectDailyMetrics) return dbError();
          dailyWrites++;
          const rows: Record<string, unknown>[] = Array.isArray(body) ? body : [body];
          assert.equal(u.searchParams.get("on_conflict"), "instagram_account_id,date");
          for (const row of rows) {
            assert.equal(row.client_id, "client");
            assert.equal(row.instagram_account_id, "account");
            assert.match(String(row.date), /^\d{4}-\d{2}-\d{2}$/);
            dailyMetrics.set(String(row.date), { ...dailyMetrics.get(String(row.date)), ...row });
          }
        } else if (table === "instagram_backfill_state") {
          if (rejectState) return dbError();
          state = body; stateWrites++;
        } else throw new Error(`Unexpected write ${table}`);
        return json(null);
      }
      if (table === "instagram_accounts") return json([{ id: "account", client_id: "client", windsor_account_id: "ig" }]);
      if (table === "instagram_backfill_state") return json(state);
      if (table === "instagram_account_secrets") return json({ meta_access_token: "fake-token" });
      if (table === "instagram_account_daily_metrics" && u.searchParams.get("select") === "date") return json({ date: today });
      if (["instagram_posts", "instagram_account_daily_metrics"].includes(table)) return json([]);
      throw new Error(`Unexpected read ${table}`);
    }
    if (u.host !== "graph.facebook.com") throw new Error(`Unexpected host ${u.host}`);
    if (u.pathname.endsWith("/media")) return json({
      data: ["one", "two"].map((id) => ({ id, timestamp: "2026-10-01T12:00:00Z", media_type: "IMAGE" })),
      ...(finalPage ? {} : { paging: { next: "unused", cursors: { after: "next-cursor" } } }),
    });
    if (init?.method === "POST") {
      const batch = JSON.parse(new URLSearchParams(String(init.body)).get("batch")!);
      const extras = batch[0].relative_url.includes("profile_visits");
      return json(batch.map((_: unknown, i: number) => extras || rejectInsights && i === 1
        ? { code: 403, body: "{}" }
        : { code: 200, body: malformed ? "invalid json" : JSON.stringify({ data: [{ name: "reach", values: [{ value: 0 }] }, { name: "saved", values: [{ value: 5 }] }, { name: "likes", values: [] }] }) }));
    }
    if (u.pathname.endsWith("/stories")) return json({ data: [] });
    if (u.pathname.endsWith("/ig/insights")) {
      const metrics = u.searchParams.get("metric")!.split(",");
      if (metrics[0] === "follows_and_unfollows") return json({ data: [{
        name: "follows_and_unfollows",
        total_value: { breakdowns: [{ results: [
          { dimension_values: ["FOLLOWER"], value: 4 },
          { dimension_values: ["NON_FOLLOWER"], value: 1 },
        ] }] },
      }] });
      const values: Record<string, number> = { reach: 0, total_interactions: 12, likes: 6, comments: 1, saves: 3, shares: 2, profile_links_taps: 5 };
      return json({ data: metrics.map((name) => ({ name, total_value: { value: values[name] } })) });
    }
    return json({});
  };

  const first = (await runMetaGraphSync(syncEnv))[0];
  assert.ok(first.errors.some((e) => /insights two.*403/.test(e)));
  assert.equal(posts.get("one")!.reach, 0, "zero is a real metric");
  assert.equal(posts.get("one")!.likes, 9, "missing values must not become zero or null");
  assert.equal(posts.get("two")!.reach, 200, "failed insights must preserve the previous snapshot");
  assert.equal(posts.get("two")!.metrics_updated_at, "2026-01-01");
  assert.equal(posts.get("one")!.profile_visits, 8, "unavailable extra metrics must be preserved");
  assert.equal(posts.get("two")!.profile_visits, 12);
  assert.ok(batches.every((rows) => rows.every((r) => Object.keys(r).sort().join() === Object.keys(rows[0]).sort().join())), "mixed patches must use separate batches");
  assert.equal(stateWrites, 1, "unavailable insights must not block persisted historical posts");
  assert.equal(first.nextCursor, "next-cursor");
  assert.equal(first.done, false);

  rejectInsights = false; rejectPosts = true; finalPage = true;
  const failed = (await runMetaGraphSync(syncEnv))[0];
  assert.ok(failed.errors.some((e) => e.includes("simulated database failure")));
  assert.equal(stateWrites, 1, "failed final page must not mark backfill complete");
  assert.equal(failed.nextCursor, "old-cursor");
  assert.equal(failed.done, false);

  rejectPosts = false; malformed = true;
  const invalid = (await runMetaGraphSync(syncEnv))[0];
  assert.ok(invalid.errors.some((e) => e.includes("resposta inválida")));
  assert.equal(stateWrites, 2, "invalid insights preserve data but do not discard persisted metadata");

  malformed = false; rejectState = true;
  const stateFailure = (await runMetaGraphSync(syncEnv))[0];
  assert.equal(stateFailure.nextCursor, "old-cursor");
  assert.equal(stateFailure.done, false);
  rejectState = false;
  const recovered = (await runMetaGraphSync(syncEnv))[0];
  assert.deepEqual(recovered.errors, []);
  assert.equal(stateWrites, 3);
  assert.equal(state.backfill_done, true);
  assert.equal(recovered.done, true);
  assert.equal(recovered.nextCursor, null);
  assert.ok(dailyWrites > 0, "a sincronização deve persistir as métricas diárias da Graph");
  assert.equal(dailyMetrics.size, 7, "os sete dias fechados são relidos mesmo com dados recentes");
  for (const row of dailyMetrics.values()) {
    assert.equal(row.reach, 0, "alcance zero deve ser preservado também nas métricas diárias");
    assert.equal(row.saves, 3);
    assert.equal(row.new_followers, 4);
    assert.equal(row.unfollowers, 1);
  }
  const beforeDaily = structuredClone([...dailyMetrics]);
  rejectDailyMetrics = true;
  const dailyFailure = (await runMetaGraphSync(syncEnv))[0];
  assert.ok(dailyFailure.errors.some((error) => /métricas diárias pela Graph: simulated database failure/.test(error)), "falha ao gravar métricas diárias deve ser informada");
  assert.deepEqual([...dailyMetrics], beforeDaily, "falha ao gravar não deve alterar o último retrato das métricas");
}

async function testWebhook() {
  process.env.SUPABASE_URL = syncEnv.supabaseUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = syncEnv.supabaseServiceRoleKey;
  const leads = new Map<string, Record<string, unknown>>([["123", { status_id: "142", pipeline_id: "pipeline", price: 500, outcome: "won", raw_payload: { custom_fields_values: [{ id: 1 }] } }]]);
  const rawEvents = new Map<string, unknown>();
  let failTable = "";
  let failRead = "";
  let unauthorized = false;
  let leadWrites = 0;
  globalThis.fetch = async (input, init) => {
    const u = new URL(String(input));
    if (u.host !== "review.supabase.co") throw new Error(`Unexpected host ${u.host}`);
    const table = u.pathname.split("/").at(-1)!;
    const method = init?.method ?? "GET";
    if (method === "GET") {
      if (failRead === table) return dbError();
      if (table === "crm_connections") return json(unauthorized ? null : { id: "connection", client_id: "client", provider: "kommo", webhook_secret: "secret", active: true });
      if (table === "crm_leads") return json(leads.get(u.searchParams.get("external_lead_id")!.slice(3)) ?? null);
    }
    if (table === failTable) return dbError();
    const body = JSON.parse(String(init?.body));
    if (table === "crm_leads") {
      leadWrites++;
      const id = method === "PATCH" ? u.searchParams.get("external_lead_id")!.slice(3) : body.external_lead_id;
      if (method !== "PATCH" || leads.has(id)) leads.set(id, { ...leads.get(id), ...body });
    } else if (table === "crm_raw_events") {
      assert.match(init?.headers ? new Headers(init.headers).get("prefer") ?? "" : "", /resolution=ignore-duplicates/);
      assert.match(body.id, /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/);
      if (!rawEvents.has(body.id)) rawEvents.set(body.id, body);
    } else throw new Error(`Unexpected table ${table}`);
    return json(null);
  };
  async function deliver(body: string) {
    const req = Object.assign(Readable.from([body]), { method: "POST", query: { connection_id: "connection", secret: "secret" }, headers: {} }) as unknown as VercelRequest;
    let status = 0;
    const res = { status(s: number) { status = s; return this; }, json() { return this; }, end() { return this; } } as unknown as VercelResponse;
    await webhook(req, res);
    return status;
  }
  const deletion = "leads[delete][0][id]=123";
  assert.equal(await deliver(deletion), 200);
  assert.ok(leads.get("123")!.removido_na_origem);
  assert.equal(leads.get("123")!.status_id, "142");
  assert.equal(leads.get("123")!.price, 500);
  assert.equal(leads.get("123")!.outcome, "won");
  assert.equal(await deliver(deletion), 200, "delete retry is safe");
  assert.equal(await deliver("leads[delete][0][id]=unknown"), 200);
  assert.equal(leads.has("unknown"), false, "unknown deletions must not create empty leads");

  const change = "leads[status][0][id]=123&leads[status][0][status_id]=143";
  assert.equal(await deliver(change), 200);
  assert.equal(leads.get("123")!.status_id, "143");
  assert.equal(leads.get("123")!.pipeline_id, "pipeline");
  assert.equal(leads.get("123")!.price, 500, "thin status payload preserves price");
  assert.equal(leads.get("123")!.outcome, "lost");
  assert.deepEqual((leads.get("123")!.raw_payload as any).custom_fields_values, [{ id: 1 }]);
  assert.equal(await deliver(change + "&leads[status][0][price]=0"), 200);
  assert.equal(leads.get("123")!.price, 0);

  for (const table of ["crm_connections", "crm_leads"]) {
    failRead = table;
    const before = leadWrites;
    assert.equal(await deliver(change), 503, `${table} read failure must request retry`);
    assert.equal(leadWrites, before);
  }
  failRead = ""; failTable = "crm_leads";
  assert.equal(await deliver(change), 503);
  assert.equal(await deliver(deletion), 503);
  failTable = "";

  const mixed = change + "&chat[message][id]=message-1";
  failTable = "crm_raw_events";
  assert.equal(await deliver(mixed), 503, "partial failure must request retry");
  failTable = "";
  assert.equal(await deliver(mixed), 200);
  assert.equal(await deliver(mixed), 200);
  assert.equal(rawEvents.size, 1, "raw event retries must not duplicate capture");
  unauthorized = true;
  assert.equal(await deliver(change), 404);
}

try {
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  console.error = () => {}; // falhas de banco são intencionais nos testes
  await testInstagram();
  await testWebhook();
  console.log("test-sync-persistence: ok (Instagram, cursores, exclusões, falhas e reenvios)");
} finally {
  globalThis.fetch = originalFetch;
  console.error = originalError;
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
}
