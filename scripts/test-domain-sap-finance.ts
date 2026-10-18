import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { getGastoDiarioSap, getGastoSemanalSap } from "../src/lib/sap-data";

// Two dense campaign days cross the API's response cap. Distractors would make
// the totals wrong if a later page lost the client or reporting-period filter.
const rows = [
  ...Array.from({ length: 2507 }, (_, index) => ({ id: String(index).padStart(5, "0"), client_id: "client-a", date: index < 2000 ? "2026-10-06" : "2026-10-13", spend: index < 2000 ? 2 : 3 })),
  { id: "other-client", client_id: "client-b", date: "2026-10-06", spend: 999_999 },
  { id: "before-window", client_id: "client-a", date: "2026-09-30", spend: 999_999 },
  { id: "after-window", client_id: "client-a", date: "2026-10-15", spend: 999_999 },
];
const offsets: number[] = [];
let cap = 137;
let failOffset: number | undefined;
const reader = createClient("https://offline.invalid", "fake-publishable-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: async (input) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, "/rest/v1/meta_ads_daily");
    assert.equal(url.searchParams.get("client_id"), "eq.client-a");
    assert.deepEqual(url.searchParams.getAll("date"), ["gte.2026-10-01", "lte.2026-10-14"]);
    assert.equal(url.searchParams.get("order"), "date.asc,id.asc");
    const offset = Number(url.searchParams.get("offset") ?? 0);
    offsets.push(offset);
    if (offset === failOffset) return new Response(JSON.stringify({ message: "simulated missing financial page" }), { status: 400, headers: { "content-type": "application/json" } });
    const selected = rows.filter((row) => row.client_id === url.searchParams.get("client_id")?.slice(3)
      && url.searchParams.getAll("date").every((filter) => filter.startsWith("gte.") ? row.date >= filter.slice(4) : row.date <= filter.slice(4)))
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 1000), cap);
    return new Response(JSON.stringify(selected.slice(offset, offset + limit)), { status: 200, headers: { "content-type": "application/json" } });
  } },
});

for (cap of [137, 1000]) {
  for (const [read, expected] of [
    [getGastoDiarioSap, [["2026-10-06", 4000], ["2026-10-13", 1521]]],
    [getGastoSemanalSap, [["2026-10-05", 4000], ["2026-10-12", 1521]]],
  ] as const) {
    offsets.length = 0;
    const amounts = await read("client-a", "2026-10-01", "2026-10-14", reader);
    assert.deepEqual([...amounts], expected, `${read.name}: complete daily/weekly amounts with server cap ${cap}`);
    assert.equal([...amounts.values()].reduce((sum, value) => sum + value, 0), 5521);
    assert.equal(offsets.at(-1), 2507, "completion is proved by an empty page beyond all matching campaign records");
  }
}
cap = 137;
failOffset = 137;
for (const read of [getGastoDiarioSap, getGastoSemanalSap]) {
  await assert.rejects(() => read("client-a", "2026-10-01", "2026-10-14", reader), (error: unknown) => (error as { message?: string }).message === "simulated missing financial page", `${read.name}: a missing page cannot become a plausible partial spend total`);
}
console.log("SAP finance regressions passed: complete daily/weekly totals past 2507 records, server caps 137/1000, tenant/period filtering and intermediate-page failure.");
