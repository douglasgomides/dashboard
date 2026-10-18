import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import type { Session } from "@supabase/supabase-js";
import { QueryClient } from "@tanstack/react-query";
import { createAuthSessionController, safeLoginRedirect, type AuthState } from "../src/lib/auth-session";
import { isValidRangeDate, parseDateRangeSearch, resolveDateRange } from "../src/lib/date-range";

const session = (id: string) => ({ user: { id }, access_token: `token-${id}` } as Session);
const pending: { resolve: (value: boolean) => void; reject: (reason: Error) => void }[] = [];
const states: AuthState[] = [];
const cache = new QueryClient();
let clears = 0;
const controller = createAuthSessionController({
  fetchIsAdmin: () => new Promise<boolean>((resolve, reject) => pending.push({ resolve, reject })),
  clearCache: () => { clears += 1; cache.clear(); },
  publish: (state) => states.push(state),
});
controller.accept(session("admin-a"));
assert.equal(pending.length, 0, "permission reads must run after the auth notification returns");
await delay(10);
assert.equal(pending.length, 1);
cache.setQueryData(["admin-clients"], [{ name: "Privileged cached client" }]);
controller.accept(null);
pending[0].resolve(true);
await delay(0);
assert.equal(states.at(-1)?.user, null, "an old admin response cannot restore a signed-out session");
assert.equal(states.at(-1)?.isAdmin, false);
assert.equal(clears, 2, "login and logout both discard identity-dependent data");
assert.equal(cache.getQueryData(["admin-clients"]), undefined, "the real QueryClient no longer retains the previous session's data");

controller.accept(session("admin-a"));
await delay(10);
controller.accept(session("viewer-b"));
assert.equal(states.at(-1)?.isAdmin, false, "a new identity never inherits admin permissions");
assert.equal(states.at(-1)?.loading, true);
await delay(10);
pending[2].resolve(false);
await delay(0);
pending[1].resolve(true);
await delay(0);
assert.equal(states.at(-1)?.user?.id, "viewer-b");
assert.equal(states.at(-1)?.isAdmin, false, "out-of-order permission replies cannot overwrite the current identity");
const beforeRefresh = clears;
controller.accept(session("viewer-b"));
await delay(10);
assert.equal(clears, beforeRefresh, "refreshing the same identity keeps its cache");
pending[3].reject(new Error("offline"));
await delay(0);
assert.equal(states.at(-1)?.loading, false, "a rejected permission lookup does not leave the app loading forever");
assert.equal(states.at(-1)?.isAdmin, false);
controller.accept(session("admin-c"));
await delay(10);
const beforeDispose = states.length;
controller.dispose();
pending[4].resolve(true);
await delay(0);
controller.accept(null);
assert.equal(states.length, beforeDispose, "unmounted providers ignore pending work and new notifications");

const origin = "https://dashboard.example";
for (const invalid of ["https://evil.example", "//evil.example", "/\\evil.example", "/\t/evil.example", "/..//evil.example", "/a/..//evil.example", "/%2e%2e//evil.example", "/login", "/login?redirect=/", "/login/"]) {
  assert.equal(safeLoginRedirect(invalid, origin), null, `reject unsafe redirect ${JSON.stringify(invalid)}`);
}
assert.equal(safeLoginRedirect("/client/posts?preset=7d#ranking", origin), "/client/posts?preset=7d#ranking");
assert.equal(safeLoginRedirect(undefined, origin), null);

for (const invalid of ["2026-02-30", "2025-02-29", "2026-13-01", "2026-00-10", "2026-10-32", "0002-01-01", "9999-12-31", "2026-1-01", "invalid", undefined, ["2026-01-01"]]) {
  assert.equal(isValidRangeDate(invalid), false, `reject invalid calendar date ${JSON.stringify(invalid)}`);
}
assert.equal(isValidRangeDate("2024-02-29"), true);
assert.deepEqual(parseDateRangeSearch({ preset: ["7d"] }), { preset: "30d" });
assert.deepEqual(parseDateRangeSearch({ preset: "personalizado", from: "2026-10-17", to: "2026-10-01" }), { preset: "personalizado", from: "2026-10-01", to: "2026-10-17" });
assert.deepEqual(parseDateRangeSearch({ preset: "personalizado", from: "2026-02-30", to: "2026-10-17" }), { preset: "personalizado" });
assert.deepEqual(resolveDateRange({ preset: "personalizado", from: "2026-10-17", to: "2026-10-01" }), { start: "2026-10-01", end: "2026-10-17" });
const fallback = resolveDateRange({ preset: "personalizado", from: "invalid", to: "invalid" });
assert.equal((Date.parse(fallback.end) - Date.parse(fallback.start)) / 86400000 + 1, 30);
for (const [preset, days] of [["7d", 7], ["30d", 30], ["90d", 90], ["180d", 180], ["365d", 365]] as const) {
  const range = resolveDateRange({ preset });
  assert.equal((Date.parse(range.end) - Date.parse(range.start)) / 86400000 + 1, days);
}
console.log("UI session regressions passed: auth races, identity isolation, redirects, and date validation.");
