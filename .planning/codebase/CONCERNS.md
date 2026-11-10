---
last_mapped_commit: 4ec717342419efd81373da4bb35f675df4ba1429
last_mapped_at: 2026-11-06
---
# Codebase Concerns

**Analysis Date:** 2026-11-06

## Tech Debt

**Stray one-off scripts committed at the repository root:**
- Issue: Ad-hoc run scripts sit beside the product config with names like `_t1.ts`, `_run_graph.ts`, `_run_graph2.ts`, `_run_ads2.ts`, `run-ads2.ts`, `run-backfill.ts`, `run-clint2.ts`, `run-com.ts`, `run-conf.ts`, `run-dig.ts`, `run-one.ts`. Several are tiny (10–20 lines) and import from `api/_lib/*` directly, with service-role clients built from `process.env`.
- Files: `/_t1.ts`, `/_run_graph.ts`, `/_run_graph2.ts`, `/_run_ads2.ts`, `/run-ads2.ts`, `/run-backfill.ts`, `/run-clint2.ts`, `/run-com.ts`, `/run-conf.ts`, `/run-dig.ts`, `/run-one.ts`
- Impact: Root clutter, unclear ownership, and copies of production-sync logic that can drift from `api/_lib/*`. A reader cannot tell which are safe to run.
- Fix approach: Move the ones still needed into `scripts/` with a header comment (purpose, required env, dry-run behaviour) and delete the rest. Keep `scripts/check-secrets.mjs` as the gate.

**Oversized modules that mix responsibilities:**
- Issue: `api/sync/manual.ts` (1338 lines) is a single serverless handler that multiplexes many endpoints via query parameters (for example `?_central=canais`, `?r=:slug`, `client_id`). Other large files: `src/routes/_authenticated.$clientId.index.tsx` (1311), `src/lib/sap-data.ts` (1308), `src/lib/pdf-relatorio-completo.tsx` (1217), `api/_lib/agentes.ts` (1162), `src/lib/anuncios-objetivo.ts` (1145), `src/routes/_authenticated.$clientId.posts.tsx` (1121), `src/lib/hub-conteudo.ts` (1109), `src/routes/_authenticated.$clientId.ideias.tsx` (1086).
- Files: `api/sync/manual.ts`, `src/routes/_authenticated.$clientId.index.tsx`, `src/lib/sap-data.ts`, `src/lib/pdf-relatorio-completo.tsx`, `api/_lib/agentes.ts`, `src/lib/anuncios-objetivo.ts`
- Impact: Changes to one endpoint require reading a very large file; regressions are hard to isolate; code review cost is high.
- Fix approach: Split `api/sync/manual.ts` into one handler file per endpoint (Vercel routes by file) and keep shared guards in `api/_lib/`. Split route files so data loading lives in `src/lib/*` and presentation in `src/components/*`.

**Pervasive type escapes:**
- Issue: About 490 matches of `: any` or `as any` across `src/`, `api/`, and `workers/`. Several are in components (`src/components/databoard-inteligencia.tsx`, `src/components/crm-visoes.tsx`, `src/components/planejador-conteudo.tsx`, `src/components/receita-por-canal.tsx`, `src/components/conversas-whatsapp.tsx`, `src/components/auditoria-comercial.tsx`, and others) and in `src/features/creative-intelligence/workspace.tsx`.
- Files: see `grep -rln "as any" src api workers` — start with the list above.
- Impact: Shape changes in Supabase RPC results or API payloads are not caught at compile time. The generated `src/integrations/supabase/types.ts` (5796 lines) exists but is bypassed in these spots.
- Fix approach: Type RPC and API responses with the generated `Database` types or zod schemas (zod is already a dependency and used in 8 `api/` files). Add a lint rule (`@typescript-eslint/no-explicit-any`) as a warning first and ratchet down.

**Lint suppressions:**
- Files: `src/components/plano-semana.tsx:76` (`react-hooks/exhaustive-deps` disabled on a `useEffect` that depends on `q.isSuccess`, `atual.length`, `podeEditar`). `src/routeTree.gen.ts` is blanket-disabled and generated, which is acceptable.
- Impact: The effect may run on stale closures or miss re-runs when the disabled dependencies change.
- Fix approach: Derive the value inside the effect or move the logic to an event handler, then remove the disable comment.

**Duplicated sync logic across providers:**
- Files: `api/_lib/meta-graph-sync.ts` (864), `api/_lib/meta-ads-sync.ts`, `api/_lib/meta-ads-graph-sync.ts`, `api/_lib/meta-comments-sync.ts`, `api/_lib/instagram-sync.ts`, `api/_lib/kommo-leads-sync.ts`, `api/_lib/kommo-reconcile.ts`, `api/_lib/clint-sync.ts`, `api/_lib/digisac-sync.ts`, `api/_lib/rdstation-sync.ts`, `api/_lib/shortio-sync.ts`, `api/_lib/flwchat-sync.ts`
- Issue: Each provider implements its own pagination, cursor, retry, and upsert loop. Comments in `api/_lib/meta-comments-sync.ts` and `api/_lib/kommo-leads-sync.ts` describe cursor-advance bugs that were fixed in one place and must be remembered for the others.
- Impact: Fixes like "do not advance the cursor when a page fails" have to be re-applied per provider.
- Fix approach: Extract a shared paginated-sync helper (cursor persistence, page-failure handling, observability events from `api/_lib/observability.ts`) and migrate providers one at a time behind the existing `scripts/test-*` contract tests.

**Migration history volume:**
- Issue: 216 SQL files in `supabase/migrations/`, several over 1000 lines (for example `supabase/migrations/20261105140000_perfil_da_clinica_telas_restantes.sql` at 1209 lines, `supabase/migrations/20261104100000_perfil_da_clinica.sql` at 1045 lines). Some migrations redefine functions that earlier migrations created.
- Impact: Hard to know the current definition of a function without replaying history. `scripts/banco` and `.github/workflows/banco.yml` rebuild schema from migrations to compare with production, which mitigates drift but not reading cost.
- Fix approach: Periodically squash or snapshot the schema (the conferência workflow can verify the squash), and document the authoritative definition location per function in `docs/`.

## Known Bugs

No confirmed open bugs were reproduced during this mapping. Behaviour that looks defect-prone:

- Symptom: Dates or timezone-sensitive metrics may differ between server (`api/_lib/*`) and client (`src/lib/*`).
- Files: `src/lib/report-metrics.ts`, `src/lib/top-conteudo.ts`, `api/_lib/dia-meta.ts`, `api/_lib/conferencia-ao-vivo.ts`
- Trigger: Reports that cross day boundaries in `America/Sao_Paulo` versus UTC.
- Workaround: Compare the same period in the Nexo view and the exported PDF (`src/lib/pdf-relatorio-completo.tsx`) before trusting a number.

## Security Considerations

**Service-role key used across the API surface:**
- Risk: Several handlers build a Supabase client with `SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS. Examples: `api/admin/create-user.ts`, `api/admin/create-admin.ts`, `api/sync/manual.ts`, `api/sync/*.ts`, `src/integrations/supabase/client.server.ts`. A missing authorization check in any of these becomes a cross-clinic data exposure.
- Files: `api/admin/create-user.ts`, `api/admin/create-admin.ts`, `api/sync/manual.ts`, `src/integrations/supabase/client.server.ts`
- Current mitigation: `api/admin/create-user.ts` requires a Bearer token before using the service role. `api/sync/manual.ts` compares the machine token against `SYNC_SECRET` with `timingSafeEqual` and returns 500 if the secret is unset. `src/integrations/supabase/client.server.ts` has no importers in `src/`, so it is not bundled into the browser build.
- Recommendations: Add a test that fails if `client.server.ts` is imported from any `src/routes` or `src/components` file. Add a lint rule (`no-restricted-imports`) for it. Audit every `api/**/*.ts` handler that uses the service role for an explicit caller-to-client scope check, not only token presence.

**Sync endpoint authentication fallback:**
- Risk: `api/sync/manual.ts` accepts both machine (`SYNC_SECRET`) and user tokens. The machine branch at line ~162 only runs when `SYNC_SECRET` is set; the branch at line ~1314 returns 500 when `SYNC_SECRET` is missing, which is the safer behaviour. Two code paths with different failure modes are easy to break during refactoring.
- Files: `api/sync/manual.ts`, `api/sync/wts.ts`
- Current mitigation: Constant-time comparison of SHA-256 digests.
- Recommendations: Centralise the token check in one helper in `api/_lib/` and cover both branches in `scripts/test-api-security.ts`.

**SECURITY DEFINER functions without pinned search_path:**
- Risk: A `security definer` function without `set search_path` can be hijacked by objects created in a schema earlier in the caller's search path.
- Files: `supabase/migrations/20261001130000_seguranca_flw_e_tokens.sql`, `supabase/migrations/20261101130000_nao_medido_no_lugar_de_zero.sql` (no `search_path` string found in either file). Of about 140 migrations that declare `security definer`, these two were the only ones without a `search_path` match in this check. Later migrations may redefine the same functions; verify against the live definitions before acting.
- Current mitigation: `revoke all ... from anon, authenticated, public` on the protected tables in the first file.
- Recommendations: Confirm in production with `pg_proc.proconfig` whether `search_path` is set. If not, add `set search_path = ''` (or `public, pg_temp`) through a new migration and make `scripts/test-db-security.ts` assert it for every `security definer` function.

**Broad RLS policies:**
- Risk: Policies granting `using (true)` or insert `with check (true)` to `anon` or `authenticated` widen access beyond clinic scope.
- Files:
  - `supabase/migrations/20261023140000_reconcilia_producao.sql:28` — `onb_submissions` insert `to anon, authenticated with check (true)` (intended for onboarding forms; confirm the table holds no sensitive columns readable by others)
  - `supabase/migrations/20261014090000_custo_whatsapp.sql:22,34` — `whatsapp_precos` and `whatsapp_precos_atendimento` read for `authenticated` with `using (true)`
  - `supabase/migrations/20260824180000_inspiration_posts.sql:35` — `using (true)`
  - `supabase/migrations/20261023090000_creative_intelligence.sql:147` — restrictive storage fence for `anon` (good pattern; keep)
- Current mitigation: Policies on most client tables are scoped by clinic membership (see `scripts/test-db-security.ts`).
- Recommendations: Review each permissive policy against `scripts/test-db-security.ts` and add a case that proves an unrelated clinic cannot read the row.

**Personal and health data in the product:**
- Risk: The app handles patient-adjacent data (`src/lib/voz-do-paciente.ts`, `src/lib/sap-formularios-g1.ts` mentions LGPD art. 11, `api/_lib/mascarar-pii.ts`, WhatsApp/Digisac/Kommo conversation sync in `api/_lib/conversas-*.ts`). A leak in an export (`src/lib/relatorio-envio.ts`, `src/lib/pdf-relatorio-completo.tsx`) or an AI prompt (`api/_lib/ia.ts`, `api/_lib/agentes.ts`, `api/_lib/conteudo-ia.ts`) would be a regulatory incident.
- Current mitigation: `api/_lib/mascarar-pii.ts` masking helper; `scripts/check-secrets.mjs` scans tracked files for key formats.
- Recommendations: Route every outbound LLM call through the masking helper and add a test that feeds a fixture with phone numbers and full names. Confirm that PDF and share-link outputs exclude raw conversation text.

**Secret scanning is pattern-based only:**
- Risk: `scripts/check-secrets.mjs` detects private keys and a few token prefixes (GitHub, OpenAI/Anthropic `sk-`, AWS `AKIA`). It does not detect Supabase service-role JWTs, Meta access tokens, or Kommo/Digisac tokens.
- Files: `scripts/check-secrets.mjs`
- Current mitigation: Runs in `npm run check` and CI (`.github/workflows/quality.yml`).
- Recommendations: Add patterns for Supabase JWTs (`eyJ` with role `service_role`) and Meta `EAA` tokens, or adopt a dedicated scanner in CI.

**Environment file templates are tracked:**
- Files: `/.env.example`, `workers/creative/.env.example`. Both are templates; no real `.env` was found in the git index. Confirm `.gitignore` keeps `.env` and `.env.*` excluded (non-example).

**Public-facing QA route gated only by build flag:**
- Files: `src/routes/` QA route with `beforeLoad: () => { if (!import.meta.env.DEV) throw notFound(); }` and `component: () => (import.meta.env.DEV ? <QaLayout /> : null)`.
- Risk: Safe in production builds, but any change that removes the `DEV` check exposes internal QA tooling.
- Recommendations: Keep the check; add a Playwright assertion in `tests/e2e/routes.spec.ts` that the route returns 404 on the production build.

**Permissive CORS and headers are absent in API code:**
- No `Access-Control-Allow-Origin: *` found in `api/` or `workers/`. Webhook endpoints (`api/integrations/kommo/webhook.ts`, `api/_lib/central-webhook.ts`, `api/_lib/kommo-webhook.ts`) rely on HMAC or per-connection secrets, which is the right pattern. `vercel.json` sets `X-Frame-Options: DENY` and `nosniff` globally.

## Performance Bottlenecks

**Large synchronous sync jobs:**
- Problem: Sync handlers run up to 300 seconds (`vercel.json` `functions.maxDuration`) and page through provider APIs serially.
- Files: `api/sync/meta-graph.ts`, `api/sync/meta-comments.ts`, `api/sync/kommo-leads.ts`, `api/sync/clint.ts`, `api/sync/instagram.ts`, `api/sync/backfill-thumbnails.ts`
- Cause: Serial pagination with a time budget; large clinics can exceed the window and rely on cursors to resume.
- Improvement path: Keep cursor-based resume (already present in `api/_lib/meta-comments-sync.ts`), add per-run metrics through `api/_lib/observability.ts`, and bound per-run page counts explicitly.

**Heavy client bundle from PDF and charts:**
- Problem: `@react-pdf/renderer`, `@resvg/resvg-js`, `fontkit`, `recharts`, and `franc-min` are all dependencies of the client-facing app.
- Files: `package.json`, `src/lib/pdf-relatorio-completo.tsx`, `src/lib/relatorio-envio.ts`, `src/components/receita-por-canal.tsx`
- Cause: PDF generation is loaded eagerly on routes that do not export PDFs.
- Improvement path: Dynamically import PDF modules from the export action only; measure the route chunks with `vite build` output.

**Large generated type file:**
- `src/integrations/supabase/types.ts` (5796 lines) is loaded by the TypeScript server on every edit. Regenerate only when the schema changes and keep it out of hot-path reviews.

## Fragile Areas

**Sync cursors and reconciliation:**
- Files: `api/_lib/kommo-reconcile.ts`, `api/_lib/kommo-leads-sync.ts`, `api/_lib/meta-comments-sync.ts`, `api/_lib/conversas-kommo.ts`
- Why fragile: Comments in these files record bugs where one failed page discarded all progress, or where deleted remote ids were only detected by full scans. Behaviour depends on ordering guarantees from the provider.
- Safe modification: Change one provider at a time; run `scripts/test-kommo*.ts`, `scripts/test-conversas-kommo.ts`, and `scripts/test-meta-comments*.ts` (or the closest `scripts/test-*` match) before and after.
- Test coverage: Contract tests exist (`scripts/test-contrato-kommo.ts`, `scripts/test-contrato-meta-graph-instagram.ts`), but failure-mid-page paths are the ones most likely to be untested. Verify before relying on them.

**Central attendance and WhatsApp routing:**
- Files: `api/_lib/central-webhook.ts`, `api/_lib/central-meta.ts`, `api/_lib/central-canais.ts`, `api/_lib/conversas-wts.ts`, `api/_lib/conversas-digisac.ts`
- Why fragile: Multiple channels (Meta, Digisac, WTS/FlwChat, Kommo, Clint) feed one inbox. Routing errors send a patient's message to the wrong clinic.
- Safe modification: Keep the channel-to-client mapping in one table; test routing with `scripts/test-central-routing.ts` after any change.
- Test coverage: Routing has a dedicated test script; the webhook signature path is covered by `scripts/test-central-meta.ts`.

**Cross-clinic data model:**
- Files: `src/lib/client-data.ts` (980 lines), `src/routes/_authenticated.$clientId.*.tsx`, `src/hooks/`
- Why fragile: Every route takes `$clientId`. A query that omits the client filter returns cross-clinic data, and RLS is the only backstop for client-side queries.
- Safe modification: Always pass the client id through the shared query helpers in `src/lib/client-data.ts`; do not build raw Supabase queries in route files.
- Test coverage: `tests/e2e/navigation-architecture.spec.ts` and `tests/e2e/workspace-navigation.spec.ts` cover navigation; check that they assert data isolation, not only rendering.

**Money and ads math:**
- Files: `src/lib/report-metrics.ts` (baseline and variation rules, recent commit `fc94d66` sets a 30-sample minimum and 300% cap), `src/lib/top-conteudo.ts`, `src/lib/anuncios-objetivo.ts`, `api/_lib/anuncios-protecao.ts`, `api/_lib/anuncios-acoes.ts`
- Why fragile: Ad actions (pausing, budget changes) touch real spend through the Meta API. Threshold rules are duplicated across client and server code.
- Safe modification: Change thresholds in one module and import it from both sides; add a test to `scripts/test-anuncios-acoes.ts` for every new threshold.

**Creative worker prompt contract:**
- Files: `workers/creative/intelligence.ts` (prompt constraints around line 295), `workers/creative/pipeline.ts` (603 lines), `workers/creative/providers.ts`
- Why fragile: Output is consumed by the UI and by `api/_lib/creative-compositor.ts`. Prompt rules (for example "preserve slide count", "brain_keys allowed only") are enforced by instruction, not by schema validation in code.
- Safe modification: Validate model output with a zod schema before persisting; keep prompt and schema changes in one commit.

## Scaling Limits

**Single Vercel functions with 300-second limit:**
- Current capacity: 9 sync functions at `maxDuration: 300` (`vercel.json`).
- Limit: Clinics with large comment or lead histories may need more than one run to finish a backfill.
- Scaling path: Use the cursor pattern already present and schedule continuation runs via the GitHub workflows in `.github/workflows/alertas.yml` and `.github/workflows/banco.yml` (scheduled).

**Creative worker runs as a separate long-lived process:**
- Current capacity: One container from `workers/creative/Dockerfile`; worker id from `CREATIVE_WORKER_ID` or a random UUID per process (`workers/creative/main.ts`).
- Limit: Work claiming relies on database state; there is no visible concurrency cap beyond the database lock pattern.
- Scaling path: Confirm the claim query uses `for update skip locked` in the creative tables' RPCs, then scale replicas.

## Dependencies at Risk

**Packages behind latest (from `npm outdated`, 2026-11-06):**
- `@supabase/supabase-js`: 2.112.3 installed, 2.119.0 latest.
- `@tanstack/react-query`: 5.102.0 installed, 5.106.1 latest.
- `@react-pdf/renderer`: 4.8.1 installed, 4.9.0 latest.
- `@playwright/test`: 1.64.1 installed, 1.65.0 latest.
- `@electric-sql/pglite`: 0.5.10 installed, 0.5.15 latest.
- Risk: Minor and patch drift; none is abandoned. The `supabase-js` and `@tanstack/react-query` gaps are the most relevant to data correctness.
- Impact: Low individually; accumulates into large upgrades later.
- Migration plan: Bump in one dependency PR, run `npm run check` and `npm run test:e2e`.

**Pinned exact versions for some runtime packages:**
- `@resvg/resvg-js` 2.6.2, `fflate` 0.8.3, `fontkit` 2.0.4, `franc-min` 6.2.0 are exact pins in `package.json`. This is intentional for PDF output stability but means no security patches arrive automatically.

**Runtime version:**
- `.nvmrc` and `package.json` `engines` pin Node 22.x. Keep CI (`.github/workflows/quality.yml` uses `node-version-file: .nvmrc`) and Vercel aligned.

## Missing Critical Features

**No coverage reporting:**
- Problem: `package.json` has no coverage script and no coverage threshold. Tests are custom `scripts/test-*.ts` files (176 of them) run by `scripts/run-tests.mjs`, plus 18 Playwright specs in `tests/e2e/`.
- Blocks: Cannot tell which modules lack tests; regressions in untested `src/components/*` are invisible.

**No error tracking service in the frontend:**
- Problem: Observability is custom (`api/_lib/observability.ts`); no Sentry-like client error reporting was found in `src/`. Client exceptions are not collected.
- Blocks: Production UI errors are reported only when a user tells the team.

**Alerting depends on one secret:**
- Problem: `.github/workflows/alertas.yml` only runs its checks when `SUPABASE_DB_URL_PROD` is configured. Without it the job writes a warning to the step summary and exits green.
- Blocks: A missing secret silently disables production alerts. Consider failing the job, or opening an issue, when the secret is absent.

**CI workflows target a fixed branch name:**
- Problem: `.github/workflows/quality.yml`, `.github/workflows/banco.yml`, and related workflows trigger on `claude/doctor-creator-hub-nixvw6`, while the repository's main branch is `prod-fix` (per the workspace git status).
- Blocks: Work merged to `prod-fix` may not run the quality gate or database drift check on push.
- Fix approach: Confirm which branch deploys to production and update the `on.push.branches` filters to match.

## Test Coverage Gaps

**Frontend components and hooks:**
- What's not tested: Most of `src/components/*` and `src/hooks/*` have no unit-level tests; coverage comes only from Playwright specs.
- Files: `src/components/` (95 files), `src/hooks/` (7 files)
- Risk: Rendering regressions and wrong number formatting in dashboards go unnoticed unless an e2e spec covers that screen.
- Priority: Medium

**Live external APIs:**
- What's not tested: Provider behaviour against real APIs is covered by contract scripts (`scripts/test-contrato-*.ts`) that use recorded or fixture data; live runs are the separate `contrato:ao-vivo` script.
- Files: `scripts/contrato/ao-vivo.ts`, `scripts/test-contrato-*.ts`
- Risk: Provider API version changes (Meta Graph version is centralised in `api/_lib/meta-graph-versao.ts`) can break sync silently between live checks.
- Priority: High for Meta and Kommo

**Migrations applied to production:**
- What's not tested: The migration-apply workflow requires manual approval. Rollback procedures for individual migrations are not documented in the repository.
- Files: `supabase/migrations/`, `.github/workflows/banco.yml`, `scripts/test-migrations.ts`
- Risk: A bad `security definer` change or RLS policy cannot be reverted by replaying the repo.
- Priority: High

**Creative worker end-to-end:**
- What's not tested: `workers/creative/` has its own `npm run check` (run in CI) but no e2e run against the real pipeline in CI.
- Files: `workers/creative/pipeline.ts`, `workers/creative/main.ts`, `.github/workflows/creative-worker.yml`
- Risk: Prompt or provider changes produce invalid output that is only caught in production.
- Priority: Medium

---

*Concerns audit: 2026-11-06*
