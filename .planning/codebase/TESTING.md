---
last_mapped_commit: 4ec717342419efd81373da4bb35f675df4ba1429
last_mapped_at: 2026-11-06
---
# Testing Patterns

**Analysis Date:** 2026-11-06

## Test Framework

**Runners:**
- Unit/contract-style checks: plain Node scripts using `node:assert/strict`, executed with `tsx` (`tsx` ^4.19 in `devDependencies`). There is no Jest or Vitest in the repo.
  - Runner: `scripts/run-tests.mjs` (executed by `npm test`).
  - Each `scripts/test-*.ts` is an independent process. The runner spawns `node --import ./scripts/test-network-guard.mjs --import tsx scripts/<file>` with a 120 s timeout per file and reports `PASS`/`FAIL`.
  - Config: no separate config file. The network guard is `scripts/test-network-guard.mjs`.
- End-to-end: `@playwright/test` 1.64.1.
  - Config: `playwright.config.ts`.
  - Accessibility checks: `@axe-core/playwright` 4.14.0.
- Database migration check: `scripts/test-migrations.ts` uses `@electric-sql/pglite` (in-process PostgreSQL) to apply every file in `supabase/migrations/` in order, creating stub `auth` and `storage` schemas, then asserts column privileges for `anon`/`authenticated` roles.

**Assertion Library:**
- `node:assert/strict` (`assert.equal`, `assert.deepEqual`, `assert.ok`). Playwright's `expect` for e2e.

**Run Commands:**

```bash
npm test                   # Run every scripts/test-*.ts through scripts/run-tests.mjs
npm run test:e2e           # Playwright (builds and previews on 127.0.0.1:5198 unless PLAYWRIGHT_SKIP_BUILD=1)
npm run test:migrations    # PGlite migration + privilege checks
npm run test:sync          # scripts/test-sync-persistence.ts
npm run test:interface     # scripts/verify-nexo-interface.mjs
npm run check              # secrets:check + lint + typecheck + test
npx playwright test tests/e2e/routes.spec.ts   # Single e2e spec
npx tsx scripts/test-sap-metas.ts              # Single unit script
```

Coverage: no coverage tool is configured. There is no `coverage` script.

## Test File Organization

**Location:**
- Unit-style tests are not co-located with source. They live in `scripts/` and import from `../src/...` or `../api/...` (e.g. `scripts/test-sap-metas.ts` imports `../src/lib/sap-metas`).
- E2E specs live in `tests/e2e/`, with shared helpers in `tests/e2e/fixtures.ts` and static data in `tests/e2e/creative-fixture.json`.
- Shared fixtures for scripts: `scripts/fixtures/`.

**Naming:**
- Script tests: `scripts/test-<dominio-em-portugues>.ts`, mirroring the `src/lib/` module name: `test-sap-metas.ts` ↔ `src/lib/sap-metas.ts`, `test-roi.ts` ↔ `src/lib/roi.ts`, `test-kommo-etapas.ts` ↔ `api/_lib/kommo-*`.
- E2E: `tests/e2e/<area>.spec.ts` (`crm-kanban.spec.ts`, `routes.spec.ts`, `numbers-first.spec.ts`).

**Structure (script test):**

```
scripts/
  test-<area>.ts          # one file, one process, top-level asserts, final console.log("test-<area>: ok")
  test-network-guard.mjs  # preloaded by the runner, blocks non-localhost fetch
  run-tests.mjs           # discovers test-*.ts and runs them sequentially
  fixtures/               # shared sample data
tests/e2e/
  fixtures.ts             # mockAccount(), client/session fixtures
  *.spec.ts               # Playwright specs
```

## Test Structure

**Suite Organization (script test):** Flat top-level assertions, grouped by comment headings that cite the scenario. Real example from `scripts/test-sap-metas.ts`:

```typescript
import assert from "node:assert/strict";
import { proporMeta, avaliarKpi, janelaBaseline } from "../src/lib/sap-metas";

// 03.07: exemplo da Clínica Aurora (baseline → meta).
assert.equal(proporMeta("resposta", 130).meta, 65); // reduzir à metade
assert.equal(proporMeta("custo_consulta", 300).meta, null);

// 01.02 · "melhorou"
assert.equal(avaliarKpi({ kpi: "resposta", baseline: 130, meta: 65, atual: 100, amostra: 50, verbaEmDia: true }).resultado, "melhorou");

console.log("test-sap-metas: ok");
```

Conventions visible in the scripts:
- Each script ends with `console.log("<name>: ok")`. A failing assertion throws, the process exits non-zero, and the runner reports `FAIL`.
- Inline comments on each assertion explain the business meaning in Portuguese.
- Use `assert.equal(...)` for scalars, `assert.deepEqual(...)` for objects and tuples, and the third argument as a message for non-obvious rules (`assert.equal(..., false, "com consulta paga, agendamento não é KPI da garantia")`).
- Scripts that talk to the database use a PGlite instance (`migrations` test) or fake fixtures; they must not call live tenants.

**Suite Organization (Playwright):**

```typescript
import { test, expect } from "@playwright/test";
import { mockAccount } from "./fixtures";

test("viewer is redirected out of admin and unassigned SAP", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await page.goto("/sap");
  await expect(page).toHaveURL(/\/login|\/hub/);
});
```

Each spec file contains flat `test(...)` blocks with descriptive names written as sentences in English or Portuguese (both are used).

**Patterns:**
- Setup: a fresh `BrowserContext` per test; the fixture injects a fake session in `localStorage` through `context.addInitScript`.
- Teardown: none required; Playwright disposes contexts.
- Assertion: `assert.*` for pure logic, `expect(locator)` for UI.

## Mocking

**Framework:** No mocking library. Mocks are hand-written:
- Playwright `context.route(...)` intercepts network calls.
- Supabase REST/Auth is faked at `http://localhost:9` (a deliberately dead origin). `mockAccount` fulfills `/auth/v1/*` and `/rest/v1/*` routes with fixture data.
- Dependency injection replaces modules where needed (`createAuthSessionController({ fetchIsAdmin, clearCache, publish })` in `src/lib/auth-session.ts`).

**Patterns (from `tests/e2e/fixtures.ts`):**

```typescript
export async function mockAccount(context: BrowserContext, profile: "admin" | "viewer" | "anonymous", options = {}) {
  await context.addInitScript(({ session, profile }) => {
    localStorage.removeItem("sb-localhost-auth-token");
    if (profile !== "anonymous") localStorage.setItem("sb-localhost-auth-token", JSON.stringify(session));
  }, { session, profile });

  await context.route("**/*", (route) => {
    // allow only local GETs (non-/api), abort everything else
  });
  await context.route("http://localhost:9/**", async (route) => { /* fulfill /auth/v1 and /rest/v1 */ });
}
```

**What to Mock:**
- All outbound network traffic in tests. `test-network-guard.mjs` throws `Network disabled in tests` for any non-localhost host, so a missed mock fails loudly rather than calling a real provider.
- Supabase Auth and REST in E2E (via `mockAccount`).
- Third-party APIs (Meta, Kommo, Clint, Digisac, RD Station, WTS, Windsor) are never called from tests; test their pure parsing and rules instead (for example `scripts/test-contrato-kommo.ts`, `scripts/test-contrato-meta-marketing.ts` use fixtures to assert contract shapes).

**What NOT to Mock:**
- Pure business rules in `src/lib/` and `api/_lib/`. These are tested directly with real inputs (e.g. `scripts/test-sap-metas.ts`).
- The database schema, when it matters for security: `scripts/test-migrations.ts` runs the real migration SQL in PGlite and checks `has_column_privilege` for tokens and secrets. Keep migrations testable this way.

## Fixtures and Factories

**Test Data:**
- Inline literals are the dominant style. Realistic examples use the fictional clinic name used across the scripts ("Clínica Aurora", "Clínica de teste") and fixed UUIDs (`11111111-1111-4111-8111-111111111111`, `22222222-2222-4222-8222-222222222222`) defined in `tests/e2e/fixtures.ts`.
- E2E sample client: `client` object in `tests/e2e/fixtures.ts`, mirroring the `clients` table shape with snake_case keys.
- Larger datasets: JSON in `tests/e2e/creative-fixture.json` and `scripts/fixtures/`.

**Location:**
- `tests/e2e/fixtures.ts` (E2E helpers and sample rows).
- `scripts/fixtures/` (script tests).
- Keep fixtures free of real credentials. `.env.example` lists required variable names only.

## Coverage

**Requirements:** None enforced. No coverage threshold or coverage script exists.

**View Coverage:** Not configured. To measure, add a tool first; there is no existing command.

## Test Types

**Unit-style (script tests):**
- Scope: pure functions in `src/lib/` and `api/_lib/`, plus data-shaping for the connectors.
- Approach: direct imports, top-level asserts, one script per module area. Currently 175 `scripts/test-*.ts` files (the count is large; `npm test` runs all of them sequentially).

**Migration/schema tests:**
- `scripts/test-migrations.ts` and `scripts/test-db-security.ts` apply migrations and verify grants and RLS-related privileges.

**Integration-contract tests:**
- `scripts/test-contrato-*.ts` (Kommo, Clint, Digisac, Hubla, Windsor, Meta Marketing, Google Planilhas, RD Station, WTS/FlwChat, OpenAI/Anthropic) check request and response shapes against recorded fixtures. Live versions exist as `scripts/contrato/ao-vivo.ts` (`npm run contrato:ao-vivo`) and must be run deliberately, not in CI.

**E2E Tests:**
- Framework: Playwright (Desktop Chrome project, `workers: 1`, `fullyParallel: true`, `retries: 0`, `timeout: 60_000`).
- Web server: `npm run build && npm run preview` on port 5198, with fake `VITE_SUPABASE_URL=http://localhost:9`. Set `PLAYWRIGHT_SKIP_BUILD=1` to reuse an existing build.
- Coverage areas (from `tests/e2e/`): routing and auth guards (`routes.spec.ts`, `auth-profile.spec.ts`, `navigation-architecture.spec.ts`), CRM (`crm-kanban.spec.ts`), SAP workspace (`service-delivery.spec.ts`), creative delivery (`creative-delivery-flow.spec.ts`), reliability (`audit-reliability.spec.ts`), and layout quality (`product-design.spec.ts`, `numbers-first.spec.ts`).
- Accessibility: use `@axe-core/playwright` in specs that cover screens; keep touch targets aligned with the 44 px mobile rule in `src/components/date-range-picker.tsx`.

## Common Patterns

**Async testing (script):**

```typescript
const rows = await fetchFixture();
assert.deepEqual(rows.map((r) => r.status), ["ativo", "pausado"]);
```

Scripts run as top-level `await` under `tsx` (ESM).

**Async testing (Playwright):**

```typescript
await mockAccount(context, "admin");
await page.goto("/");
await expect(page.getByRole("heading", { name: /resumo/i })).toBeVisible();
```

**Error testing (script):**

```typescript
assert.throws(() => integrationHost("evil.example.com", "kommo"), /Domínio kommo inválido/);
```

Use `assert.throws` with a regex on the Portuguese message, as the production code throws it.

**Error testing (E2E):** Simulate provider failure by passing `{ failClients: true }` to `mockAccount` (option already exists), then assert the friendly message from `mensagemDeErro` is visible and no raw error text appears.

**Adding a test for a new rule:**
1. Put the rule in `src/lib/<area>.ts` or `api/_lib/<area>.ts` as a pure function.
2. Add `scripts/test-<area>.ts` with asserts and the closing `console.log`.
3. Confirm it passes with `npx tsx scripts/test-<area>.ts`, then `npm test`.
4. Only add a Playwright spec when the behavior depends on routing, auth, or rendered UI.

---

*Testing analysis: 2026-11-06*
