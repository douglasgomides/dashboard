import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { fetchAllRows } from "../src/lib/pagination";
import { avatarExtension, MAX_AVATAR_BYTES } from "../src/lib/avatar";

const fixture = Array.from({ length: 2507 }, (_, index) => ({ id: String(index).padStart(5, "0"), date: "2026-10-01", spend: index % 7 }));
const requests: URL[] = [];
let failOffset: number | undefined;
let cap = 1000;
const db = createClient("https://offline.invalid", "test-publishable-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: async (input) => {
      const url = new URL(String(input));
      requests.push(url);
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? 0);
      if (offset === failOffset) return new Response(JSON.stringify({ code: "XX000", message: "simulated read failure" }), { status: 500, headers: { "content-type": "application/json" } });
      assert.equal(url.searchParams.get("client_id"), "eq.client-a", "every page must retain tenant filtering");
      assert.equal(url.searchParams.get("order"), "date.asc,id.asc", "unique tie-breaker makes equal-date pagination deterministic");
      return new Response(JSON.stringify(fixture.slice(offset, offset + Math.min(limit, cap))), { status: 200, headers: { "content-type": "application/json" } });
    },
  },
});
const read = () => fetchAllRows<{ id: string; date: string; spend: number }>((from, to) => db.from("daily_metrics").select("id,date,spend").eq("client_id", "client-a").order("date").order("id").range(from, to));

for (const serverCap of [1000, 137]) {
  cap = serverCap;
  requests.length = 0;
  const rows = await read();
  assert.deepEqual(rows, fixture, `all ${fixture.length} records survive the server cap of ${cap}`);
  assert.equal(new Set(rows.map((row) => row.id)).size, fixture.length);
  assert.equal(rows.reduce((total, row) => total + row.spend, 0), fixture.reduce((total, row) => total + row.spend, 0), "aggregate uses the complete dataset");
  assert.equal(Number(requests.at(-1)?.searchParams.get("offset")), fixture.length, "the last request proves completion even when the cap is smaller than requested");
}
cap = 1000;
failOffset = 1000;
await assert.rejects(read, (error: unknown) => (error as { message?: string }).message === "simulated read failure", "a failed page cannot become a successful partial total");

assert.equal(avatarExtension({ type: "image/jpeg", size: 100 }), "jpg");
assert.equal(avatarExtension({ type: "image/png", size: MAX_AVATAR_BYTES }), "png");
assert.equal(avatarExtension({ type: "image/webp", size: 100 }), "webp");
for (const file of [{ type: "image/svg+xml", size: 100 }, { type: "text/html", size: 100 }, { type: "image/png", size: 0 }, { type: "image/png", size: MAX_AVATAR_BYTES + 1 }]) {
  assert.throws(() => avatarExtension(file));
}
console.log("Domain regressions passed: HTTP pagination past 1000 records, server caps, tenant/order preservation, partial-read failures, and avatar validation.");
