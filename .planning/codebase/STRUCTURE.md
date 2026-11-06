---
last_mapped_commit: 4ec717342419efd81373da4bb35f675df4ba1429
last_mapped_at: 2026-11-06
---
# Codebase Structure

**Analysis Date:** 2026-11-06

## Directory Layout

```
dashboard-gsd/
├── api/                    # Vercel serverless functions (HTTP entry points)
│   ├── _lib/               # Shared server services and integration runners (~73 files)
│   ├── _assets/creative/   # Static creative assets bundled into api/sync/manual.ts
│   ├── admin/              # create-user.ts, create-admin.ts (admin-only account creation)
│   ├── integrations/kommo/ # webhook.ts (Kommo lead webhook)
│   └── sync/               # Sync entry points (manual, meta-*, instagram, kommo-leads, clint, wts, backfill)
├── src/                    # React SPA
│   ├── routes/             # TanStack file routes (84 under _authenticated, plus public pages)
│   ├── components/         # Shared UI and module components (flat, ~130 files)
│   │   └── anuncios/       # Ads-specific components
│   ├── features/           # Self-contained feature folders
│   │   └── creative-intelligence/
│   ├── lib/                # Domain logic, data access, calculators, copy (~200 modules)
│   │   ├── sessoes/        # SAP session content (d60, kickoff-baseline, s2-s3, s4-s5, s6-d60-d90)
│   │   ├── config/         # recompra.ts
│   │   └── creative-intelligence/  # arte, contracts, delivery, discovery, performance, radar, theme
│   ├── hooks/              # use-auth, use-client-role, use-theme, use-resultado, etc.
│   ├── integrations/supabase/  # client.ts, client.server.ts, types.ts (generated DB types)
│   └── styles/             # Per-module CSS (databoard, crm-kanban, workspace-navigation, ...)
├── workers/creative/       # Standalone Node worker (own package.json, Dockerfile, README.md)
├── supabase/
│   ├── migrations/         # ~216 versioned SQL migrations (schema, RLS, grants, RPCs)
│   ├── functions/mcp/      # Deno edge function: read-only MCP server
│   ├── seeds/              # Seed SQL
│   ├── tests/              # SQL-level tests
│   ├── audits/             # preflight.sql and audit queries
│   └── seed_clients_fase1.example.sql
├── scripts/                # Build tooling, test runners, one-off jobs, fixtures
│   ├── test-*.ts           # ~150 regression scripts run by `npm test` via scripts/run-tests.mjs
│   ├── fixtures/           # Versioned fixtures for scripts tests
│   ├── banco/              # Database helper scripts
│   ├── alertas/            # Alert scripts
│   ├── contrato/           # Provider contract checks (`contrato:ao-vivo`)
│   ├── dados/              # Data helper scripts
│   └── generate-routes.mjs # Regenerates src/routeTree.gen.ts
├── tests/e2e/              # Playwright specs (navigation, permissions, accessibility)
├── docs/                   # Product, operations, QA, API and SAP documentation
│   ├── apis/  auditoria/  produto/  qa/  redesenho/  sap/
│   └── operations.md, engineering-review.md, notas-de-versao.md, operacao-verificavel.md
├── public/                 # Static assets served as-is (incl. product-previews/)
├── .github/workflows/      # quality.yml, banco.yml, alertas.yml, creative-worker.yml, crm-piloto.yml
├── .claude/                # Local agent tooling and GSD configuration (not product code)
├── .planning/              # Planning artifacts (this directory: .planning/codebase/)
├── dist/                   # Build output (gitignored)
├── index.html              # SPA HTML shell
├── vite.config.ts          # Vite + TanStack Router plugin + security headers
├── vercel.json             # Rewrites, function durations, security headers
├── tsconfig.json           # Path alias "@/*" → "src/*"; includes src, scripts, api, tests
├── eslint.config.js
├── playwright.config.ts
├── package.json            # Scripts: dev, build, check, test, routes:generate, ...
└── _run_*.ts, run-*.ts, _t1.ts   # Root-level ad-hoc runner scripts (one-off)
```

## Directory Purposes

**`src/routes/`:**
- Purpose: One file per URL segment, using TanStack Router flat-file naming. A dot separates path segments; `$clientId` is a path param; `_authenticated` and `_authenticated.$clientId` are layout routes.
- Contains: `__root.tsx`, `_authenticated.tsx`, `_authenticated.$clientId.tsx`, `_authenticated.$clientId.<screen>.tsx`, `_authenticated.sap.$clientId.<screen>.tsx`, `_authenticated.admin.<screen>.tsx`, `_authenticated.sap.<page>.tsx`, `login.tsx`, `conhecer.tsx`, `qa.layout.tsx`.
- Key files: `src/routes/_authenticated.$clientId.tsx` (client shell and data loading), `src/routes/_authenticated.admin.tsx` (admin area), `src/routes/_authenticated.oauth.consent.tsx` (OAuth consent for MCP).

**`src/components/`:**
- Purpose: Flat directory of components. Naming is kebab-case, often named after the screen or metric (e.g., `receita-por-canal.tsx`, `funis-periodo.tsx`, `sap-tracker.tsx`).
- Contains: layout (`app-shell.tsx`, `workspace-ui.tsx`, `visual.tsx`), charts (`grafico.tsx`, `barras.tsx`, `mapa-de-calor.tsx`, `mapa-coropletico.tsx`), SAP components (`sap-*.tsx`, 31 files), status and freshness (`source-health.tsx`, `sync-freshness-badge.tsx`), and shared utilities (`botao-copiar.tsx`, `date-range-picker.tsx`).
- Key files: `src/components/app-shell.tsx`, `src/components/sync-button.tsx`, `src/components/date-range-picker.tsx`, `src/components/product-brand.tsx`.

**`src/lib/`:**
- Purpose: Everything that is not React rendering: data access, calculations, formatting, copy, and report generation.
- Naming: Domain-first kebab-case, with a `-data.ts` suffix for modules that query Supabase (`client-data.ts`, `sap-data.ts`, `agentes-data.ts`, `conectores-data.ts`, `crm-negocio-data.ts`, `crm-operacao-data.ts`, `admin-data.ts`, `brain-data.ts`, `client-data.ts`). Pure calculators use descriptive names (`funil-taxa.ts`, `roi.ts`, `cobertura.ts`, `resultado.ts`, `prova-resultado.ts`).
- Report generation: `pdf-report.tsx`, `pdf-relatorio-completo.tsx`, `pdf-manual-crm.tsx`, plus `relatorio-*.ts` and `hub-relatorio.ts`.
- Shared with server code: `rastreio.ts`, `negocio-proprio.ts`, `creative-intelligence/contracts.ts`.
- Tests: none inside `src/lib`; tests live in `scripts/test-*.ts`.

**`src/hooks/`:**
- Purpose: React hooks. Files are kebab-case, with a `use-` prefix.
- Key files: `use-auth.tsx` (session and user), `use-client-role.ts` (role of current user for `$clientId`), `use-theme.ts` (theme and `aplicarTemaSalvo`), `use-pacientes-periodo.ts`, `use-resultado.ts`, `use-resultados-diarios.ts`, `use-is-mobile.ts`.

**`src/integrations/supabase/`:**
- Purpose: Supabase client and generated types.
- Key files: `client.ts` (browser client; `persistSession: true`, `localStorage`), `client.server.ts` (server-side variant), `types.ts` (database types, do not edit by hand).

**`src/features/creative-intelligence/`:**
- Purpose: Feature module with its own data layer and views, imported by a route.
- Contents: `workspace.tsx` (entry), `radar-view.tsx`, `analysis-view.tsx`, `adaptation-view.tsx`, `data.ts` (fetches via `/api/...` and Supabase), `workspace.css`.
- Domain logic lives in `src/lib/creative-intelligence/` (`arte.ts`, `contracts.ts`, `delivery.ts`, `discovery.ts`, `performance.ts`, `radar.ts`, `theme.ts`).

**`src/styles/` and root CSS:**
- Purpose: Global and per-module styles. Root files: `src/styles.css` (base), `src/nexo.css` (Nexo product), `src/sap-workspace.css` (SAP), `src/landing.css` (public landing). Module CSS in `src/styles/` is imported from the components that use it.

**`api/sync/`:**
- Purpose: Route-level HTTP handlers. Each file is a Vercel function. Keep handlers thin; the logic goes to `api/_lib/`.
- Files: `manual.ts` (user-triggered dispatcher), `meta-ads.ts`, `meta-graph.ts`, `meta-comments.ts`, `instagram.ts`, `kommo-leads.ts`, `clint.ts`, `wts.ts`, `backfill-thumbnails.ts`.

**`api/_lib/`:**
- Purpose: Server-only modules. The leading underscore keeps Vercel from exposing them as routes.
- Naming: domain-first kebab-case. Integration pairs follow `<provider>-sync.ts` and `conversas-<provider>.ts` (e.g., `kommo-leads-sync.ts`, `conversas-kommo.ts`, `conversas-digisac.ts`).
- Key files: `observability.ts`, `sync-status.ts`, `request-validation.ts`, `http-types.ts`, `integration-http.ts`, `agentes.ts`, `copiloto.ts`, `ia.ts`.

**`supabase/migrations/`:**
- Purpose: Ordered SQL history. Files are timestamped or sequenced; some older files share numbers (per `README.md`, do not rename published migrations).
- Scope: tables, RLS policies, grants, SECURITY DEFINER RPCs (e.g., `buscar_pessoas`), views (`meta_ads_daily_v` with `security_invoker`), composite foreign keys.
- Verify before applying: `npx supabase migration list` then `npx supabase db push --include-all --dry-run` (`README.md`).

**`scripts/`:**
- Purpose: Automation and verification. Not imported by the app.
- Key files: `run-tests.mjs` (runs the `test-*.ts` suite), `check-secrets.mjs` (`secrets:check`), `generate-routes.mjs`, `sync-instagram.ts`, `rodar-testes.mjs`, `verify-nexo-interface.mjs`, `test-network-guard.mjs`.
- Fixtures: `scripts/fixtures/` (20 files) used by tests so they run from a clean clone.

**`tests/e2e/`:**
- Purpose: Playwright browser tests (navigation, permissions, accessibility with axe, auth profile, brain, central de atendimento, creative delivery).
- Config: `playwright.config.ts` at repo root.

**`workers/creative/`:**
- Purpose: Independent package for creative-intelligence processing. Own `package.json`, `package-lock.json`, `tsconfig.json`, and `Dockerfile`. Imports `src/lib/creative-intelligence/contracts.ts` via relative path.

**`supabase/functions/mcp/`:**
- Purpose: Deno edge function. Not part of the Node build; `protocolo.ts` holds the tool catalog.

**`.claude/`:**
- Purpose: Local Claude/GSD tooling (agents, commands, hooks, skills configuration). Not application code. Do not place product code here.

**`.planning/`:**
- Purpose: Planning and analysis artifacts. `.planning/codebase/` holds the codebase maps.

## Key File Locations

**Entry Points:**
- `index.html`: SPA HTML shell.
- `src/main.tsx`: React mount, env check, theme bootstrap.
- `src/router.tsx`: `getRouter()`.
- `api/sync/manual.ts`: primary authenticated API.
- `api/integrations/kommo/webhook.ts`: Kommo webhook.
- `workers/creative/main.ts`: creative worker.
- `supabase/functions/mcp/index.ts`: MCP function.

**Configuration:**
- `vite.config.ts`: build, plugins, dev and preview headers.
- `vercel.json`: rewrites, function `maxDuration`, security headers, `includeFiles` for creative assets.
- `tsconfig.json`: `@/*` alias to `src/*`.
- `eslint.config.js`: lint rules.
- `.nvmrc`: Node version reference (`package.json` engines `22.x`).
- `.env.example`: documented environment variables (never commit `.env*` values).

**Core Logic:**
- `src/lib/nav.ts`: navigation areas and visibility.
- `src/lib/client-data.ts`: client loading.
- `src/lib/date-range.ts`: date range parsing and resolution.
- `src/lib/pagination.ts`: `fetchAllRows`.
- `api/_lib/sync-status.ts`: sync checkpoints.
- `api/_lib/observability.ts`: request logging wrapper.

**Testing:**
- `scripts/test-*.ts`: domain and API regression tests.
- `scripts/run-tests.mjs`: test runner.
- `tests/e2e/*.spec.ts`: Playwright specs.
- `supabase/tests/`: SQL tests.

## Naming Conventions

**Files:**
- Routes: TanStack flat routes `_authenticated.$clientId.<screen>.tsx` (dots separate segments, `$` denotes params, `_` prefix denotes pathless layouts). Example: `src/routes/_authenticated.$clientId.crm-painel.tsx`.
- Components: kebab-case, no `index` barrels. Example: `src/components/sap-acessos-operacao.tsx`.
- Domain modules: kebab-case with Portuguese names. Example: `src/lib/comercial.ts`, `src/lib/fila-whatsapp.ts`.
- Data access: `<domain>-data.ts`. Example: `src/lib/sap-data.ts`.
- Tests: `scripts/test-<dominio>.ts` in kebab-case. Example: `scripts/test-funil-taxa.ts`.
- Server modules: `api/_lib/<provider|workflow>-<role>.ts`. Example: `api/_lib/meta-ads-graph-sync.ts`.
- Migrations: `supabase/migrations/<sequence>_<description>.sql` (see directory for exact pattern).

**Directories:**
- Lowercase, kebab-case where multiword (`creative-intelligence`, `sap-formularios`).
- Underscore prefix for non-routable server code: `api/_lib`, `api/_assets`.

**Code identifiers:**
- Mixed Portuguese and English. Domain terms (`cliente`, `funil`, `orcamento`, `conversa`, `reuniao`) are Portuguese. Infrastructure terms (`client_id`, `client_members`, `sync_status`) are English in the database schema.
- Route params use `$clientId`; the internal identifier is camelCase.

## Where to Add New Code

**New screen for an existing client:**
- Route: `src/routes/_authenticated.$clientId.<screen>.tsx`
- Screen components: `src/components/<screen>.tsx`
- Data access: `src/lib/<domain>-data.ts` (or extend the existing one)
- Navigation entry: add to `AREAS` or `AVANCADO` in `src/lib/nav.ts`
- Then run `npm run routes:generate` so `src/routeTree.gen.ts` updates.

**New SAP screen:**
- Route: `src/routes/_authenticated.sap.$clientId.<screen>.tsx`
- Component: `src/components/sap-<screen>.tsx`
- Shared SAP domain: `src/lib/sap-*.ts`; form definitions in `src/lib/sap-formularios-*.ts`.

**New metric or calculation:**
- Pure logic: `src/lib/<metric>.ts` (no React or browser APIs if the server will use it).
- Test: `scripts/test-<metric>.ts`, registered so `npm test` picks it up (see `scripts/run-tests.mjs`).

**New sync or integration:**
- Runner: `api/_lib/<provider>-sync.ts` exporting `run<Provider>Sync`.
- Entry point: `api/sync/<provider>.ts` (thin wrapper using `withApiObservability`) and, if user-triggered, a branch in `api/sync/manual.ts` validated through `api/_lib/request-validation.ts`.
- Status: call `recordSyncStatus` from `api/_lib/sync-status.ts`.
- Schedule: `.github/workflows/*.yml` or n8n with `SYNC_SECRET`.
- New function duration: add an entry under `functions` in `vercel.json` if it needs more than the default.

**New database table or policy:**
- Migration: new file in `supabase/migrations/`. Never edit a published migration.
- Types: regenerate `src/integrations/supabase/types.ts`.
- Regression: add a case to `scripts/test-db-security.ts` or `scripts/test-migrations.ts`.

**New background job:**
- Worker code: `workers/creative/` (follow `pipeline.ts` and `runtime.ts`).
- Shared contracts: `src/lib/creative-intelligence/contracts.ts`.

**New UI primitive:**
- `src/components/<name>.tsx`. Styles: `src/styles/<name>.css` if module-specific; global tokens go in `src/styles.css`.

**Utilities:**
- Browser and server shared: `src/lib/<name>.ts`.
- Server-only: `api/_lib/<name>.ts`.
- Browser-only helpers for a single feature: next to the feature in `src/features/<feature>/`.

## Special Directories

**`src/routeTree.gen.ts`:**
- Purpose: Generated route tree.
- Generated: Yes (by `scripts/generate-routes.mjs` and the Vite TanStack plugin).
- Committed: No (listed in `.gitignore`), although the file is present in the working tree.

**`dist/`:**
- Purpose: Production build output.
- Generated: Yes (`npm run build`).
- Committed: No (`.gitignore`).

**`node_modules/`:**
- Generated: Yes. Committed: No.

**`.tanstack/`:**
- Purpose: TanStack tooling cache.
- Committed: No (`.gitignore`).

**`api/_assets/creative/`:**
- Purpose: Static assets bundled with `api/sync/manual.ts` via `includeFiles` in `vercel.json`.
- Committed: Yes.

**`public/product-previews/`:**
- Purpose: Product preview images, generated by `scripts/capture-product-previews.mjs`.
- Committed: Yes.

**`supabase/.temp/`:**
- Purpose: Supabase CLI runtime metadata.
- Committed: No (`.gitignore`).

**`work/`, `test-results/`, `playwright-report/`:**
- Purpose: Local evidence, test output, and reports.
- Committed: No (`.gitignore`).

**Root-level `_run_*.ts`, `run-*.ts`, `_t1.ts`:**
- Purpose: Ad-hoc one-off runners. Not wired into `package.json` scripts. Prefer `scripts/` for new utilities.

---

*Structure analysis: 2026-11-06*
