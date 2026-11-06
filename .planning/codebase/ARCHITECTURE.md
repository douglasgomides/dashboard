---
last_mapped_commit: 4ec717342419efd81373da4bb35f675df4ba1429
last_mapped_at: 2026-11-06
---
<!-- refreshed: 2026-11-06 -->

# Architecture

**Analysis Date:** 2026-11-06

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────┐
│                 React SPA (Vite build, `src/`)                        │
│  TanStack Router file routes `src/routes/*` · TanStack Query          │
│  Components `src/components/*` · Domain logic `src/lib/*`             │
└───────────────┬──────────────────────────────┬───────────────────────┘
                │ supabase-js (anon key + JWT) │ fetch `/api/*` (session)
                ▼                              ▼
┌──────────────────────────────┐   ┌──────────────────────────────────┐
│ Supabase (Postgres + Auth +  │   │ Vercel Serverless Functions       │
│ Storage, RLS per client)     │◄──│ `api/sync/*`, `api/admin/*`,      │
│ `supabase/migrations/*`      │   │ `api/integrations/*` →            │
│ RPCs / SECURITY DEFINER fns  │   │ shared services `api/_lib/*`      │
└──────────────▲───────────────┘   └───────┬──────────────▲───────────┘
               │ service_role (bypass RLS)  │ HTTPS        │ webhooks
               │                            ▼              │
               │              External providers (Meta, Kommo, Clint,
               │              Digisac, WTS, RD Station, Short.io, Windsor,
               │              ClickUp, OpenAI/Anthropic, Google Sheets)
               │
┌──────────────┴───────────────┐   ┌──────────────────────────────────┐
│ Creative worker (Node, Docker)│   │ MCP edge function (Deno)         │
│ `workers/creative/*`          │   │ `supabase/functions/mcp/*`       │
│ polls `creative_workers` jobs │   │ read-only, user JWT (RLS applies)│
└──────────────────────────────┘   └──────────────────────────────────┘
```

Two products share this codebase and database: **Nexo** (marketing, sales, opportunities; default host) and **SAP** (Sistema de Aquisição de Pacientes; served on the `sap.` host). Host detection lives in `src/lib/marca.ts` (`ehEnderecoSap`), and `src/main.tsx` sets the document title from it.

## Pattern Overview

**Overall:** Client-only SPA with a thin serverless API layer, Supabase as the system of record, and row-level security as the primary authorization boundary. External-data ingestion runs as server functions triggered manually from the UI or on schedule (`.github/workflows/*.yml`, n8n, and Vercel functions with `maxDuration: 300`).

**Key Characteristics:**
- No SSR. `vite.config.ts` builds a static bundle; `vercel.json` rewrites every non-`/api/` path to `/index.html`.
- Reads go mostly straight from the browser to Supabase through `src/lib/*-data.ts` modules; RLS enforces per-client access (documented in `README.md`, "Acesso e segurança").
- Writes that touch third-party APIs, secrets, or multi-row integrity go through `api/*` handlers that validate the session and client permission before acting.
- Heavy domain logic is pure TypeScript in `src/lib/*.ts`. Several of these modules are imported by both the browser and the server (for example `api/sync/manual.ts` imports `src/lib/rastreio.js` and `src/lib/negocio-proprio.js`), so they must stay free of browser-only APIs.
- Database schema changes are versioned SQL in `supabase/migrations/` (about 216 files). Published migrations are not renamed.

## Layers

**Routing and Screens (`src/routes/`):**
- Purpose: URL structure, auth guards, client-scoped layouts, and screen components.
- Location: `src/routes/`
- Contains: `__root.tsx` (providers, 404/error components), `_authenticated.tsx` (auth guard, first-access redirect to `/bem-vindo`), `_authenticated.$clientId.tsx` (client layout: loads client, role, freshness, date range, and renders `AppShell`), and leaf routes such as `_authenticated.$clientId.vendas.tsx`. SAP routes sit under `_authenticated.sap.*` and `_authenticated.sap.$clientId.*`. Public routes: `login.tsx`, `reset-password.tsx`, `conhecer.tsx`, `sem-acesso.tsx`, `qa.layout.tsx`.
- Depends on: `src/hooks/*`, `src/lib/*-data.ts`, `src/components/*`, `src/integrations/supabase/client.ts`.
- Used by: TanStack Router via generated `src/routeTree.gen.ts`.

**Presentation (`src/components/`, `src/features/`, `src/styles/`):**
- Purpose: Reusable UI and feature views.
- Location: `src/components/` (about 130 flat files plus `src/components/anuncios/`), `src/features/creative-intelligence/` (self-contained feature with `workspace.tsx`, `radar-view.tsx`, `analysis-view.tsx`, `adaptation-view.tsx`, `data.ts`).
- Contains: `app-shell.tsx` (navigation shell), `sync-button.tsx`, `sap-*.tsx` (SAP screens), `pdf-*` renderers via `src/lib/pdf-*.tsx`.
- Depends on: `src/lib/*`, `src/hooks/*`, `lucide-react`, `recharts`.
- Used by: routes.

**Domain and Data Access (`src/lib/`):**
- Purpose: Business rules, metric calculations, query helpers, copy, and report builders.
- Location: `src/lib/` (about 200 modules; subfolders `src/lib/sessoes/`, `src/lib/config/`, `src/lib/creative-intelligence/`).
- Contains: data access modules named `*-data.ts` (e.g. `src/lib/client-data.ts`, `src/lib/sap-data.ts`, `src/lib/crm-operacao-data.ts`, `src/lib/admin-data.ts`), pure calculators (e.g. `src/lib/funil-taxa.ts`, `src/lib/roi.ts`, `src/lib/date-range.ts`), navigation config (`src/lib/nav.ts`), and SAP form definitions (`src/lib/sap-formularios*.ts`).
- Depends on: `src/integrations/supabase/*`, `src/lib/pagination.ts` (`fetchAllRows`).
- Used by: routes, components, and some `api/_lib/*` modules.

**Client Infrastructure (`src/integrations/supabase/`, `src/hooks/`):**
- Purpose: Supabase client, typed schema, session state, role resolution, theme.
- Location: `src/integrations/supabase/client.ts` (browser client, `localStorage` persistence), `client.server.ts` (server variant), `types.ts` (generated database types); `src/hooks/use-auth.tsx`, `src/hooks/use-client-role.ts`, `src/hooks/use-theme.ts`.
- Used by: nearly every route and data module.

**Serverless API (`api/`):**
- Purpose: Authenticated actions, scheduled and manual syncs, webhooks, and calls to paid AI or ad APIs that need secrets.
- Location: `api/sync/` (entry handlers), `api/admin/` (`create-user.ts`, `create-admin.ts`), `api/integrations/kommo/webhook.ts`, shared services in `api/_lib/`, static creative assets in `api/_assets/creative/`.
- Contains: `api/sync/manual.ts` (dispatcher for dozens of `_central`/action types, 30+ service imports, authenticated by user session with a 7-day window), `api/sync/meta-ads.ts`, `api/sync/meta-graph.ts`, `api/sync/instagram.ts`, `api/sync/kommo-leads.ts`, `api/sync/clint.ts`, `api/sync/wts.ts`, `api/sync/meta-comments.ts`, `api/sync/backfill-thumbnails.ts`.
- Depends on: `@supabase/supabase-js` with the service role key, `zod`, Node `crypto`, and `src/lib/*` for pure rules.
- Used by: the SPA (`fetch("/api/...")` in `src/components/sync-button.tsx`, `src/components/copiloto-secao.tsx`, `src/components/agentes-ia.tsx`, `src/features/creative-intelligence/data.ts`) and external callers (webhooks, n8n with `SYNC_SECRET`).

**Service Modules (`api/_lib/`):**
- Purpose: One module per integration or workflow. Each exports a `run*Sync` or handler function.
- Location: `api/_lib/` (about 73 files).
- Contains: sync runners (`meta-graph-sync.ts`, `instagram-sync.ts`, `kommo-leads-sync.ts`, `clint-sync.ts`, `wts-sync.ts`, `digisac-sync.ts`, `flwchat-sync.ts`, `rdstation-sync.ts`, `shortio-sync.ts`), AI services (`ia.ts`, `copiloto.ts`, `sap-gerar.ts`, `sessao-ia.ts`, `resumo-conversa.ts`, `agentes.ts`), cross-cutting helpers (`observability.ts`, `sync-status.ts`, `request-validation.ts`, `integration-http.ts`, `mascarar-pii.ts`, `http-types.ts`), and reliability/security helpers (`anuncios-protecao.ts`, `meta-limite.ts`, `meta-token-validade.ts`).
- Depends on: `api/_lib/observability.ts` (`withApiObservability` wraps handlers), `api/_lib/sync-status.ts` (`recordSyncStatus`, `lerDadosAte`).

**Background Worker (`workers/creative/`):**
- Purpose: Long-running processing of creative-intelligence jobs outside Vercel's time limits.
- Location: `workers/creative/main.ts`, `pipeline.ts`, `providers.ts`, `runtime.ts`, `intelligence.ts`; packaged by `workers/creative/Dockerfile`; scheduled by `.github/workflows/creative-worker.yml`.
- Contains: a polling loop that upserts into `creative_workers` (heartbeat) and claims jobs. Supports `--once`, `--drain` (12-minute drain window), and `--job=<uuid>`. Shares `src/lib/creative-intelligence/contracts.ts` (`PIPELINE_VERSION`, `CreativeJob`) with the frontend.
- Depends on: Supabase service role (`createAdmin` in `runtime.ts`), optional OpenAI key for vision.

**Edge Functions (`supabase/functions/`):**
- Purpose: MCP server exposing read-only tools to assistants.
- Location: `supabase/functions/mcp/index.ts` (transport and auth), `protocolo.ts` (tool catalog and JSON-RPC helpers).
- Contains: OAuth via Supabase Auth; each tool call is logged to `mcp_chamadas`. Uses the user's JWT, so RLS applies.

## Data Flow

### Primary Request Path (client screen load)

1. Browser loads `index.html` → `src/main.tsx` (checks env, sets title, applies saved theme, registers deploy-recovery for stale chunks) and mounts `RouterProvider` from `src/router.tsx`.
2. `src/routes/__root.tsx` wraps everything in `QueryClientProvider` and `AuthProvider` (`src/hooks/use-auth.tsx`).
3. `src/routes/_authenticated.tsx` `beforeLoad` calls `supabase.auth.getUser()`; no user → redirect to `/login` (or `/conhecer` for `/`). Users flagged `primeiro_acesso` go to `/bem-vindo`.
4. `src/routes/_authenticated.$clientId.tsx` loads the client via `getClient()` in `src/lib/client-data.ts` (explicit column list to avoid exposing `wts_api_token`), resolves the role with `src/hooks/use-client-role.ts`, parses the date range from search params (`src/lib/date-range.ts`), and renders `AppShell` (`src/components/app-shell.tsx`) with navigation from `src/lib/nav.ts`.
5. Leaf route queries data through `src/lib/*-data.ts` using `useQuery`. Large tables use `fetchAllRows` (`src/lib/pagination.ts`) to page through PostgREST limits.
6. Supabase RLS filters rows for the signed-in user's `client_members` role (`owner`, `strategist`, `viewer`).

### Manual Sync Path (dashboard button)

1. `src/components/sync-button.tsx` sends an authenticated request to `/api/sync/manual` with a `_central` or action parameter (see `vercel.json` rewrites for `/api/atendimento/*` and `/r/:slug`).
2. `api/sync/manual.ts` runs inside `withApiObservability` (`api/_lib/observability.ts`), validates the body with `manualRequestSchema` (`api/_lib/request-validation.ts`), checks the user's client membership and write permission, then dispatches to the matching `api/_lib/*-sync.ts` runner.
3. The runner calls the provider, writes rows with the service role, and records status through `recordSyncStatus` (`api/_lib/sync-status.ts`).
4. The UI reads fresh data from Supabase on the next query; `src/components/sync-freshness-badge.tsx` shows source freshness.

### Scheduled and Webhook Ingestion

1. Scheduled jobs call `api/sync/*.ts` endpoints with `SYNC_SECRET` (n8n, GitHub Actions in `.github/workflows/alertas.yml`, `banco.yml`, `crm-piloto.yml`).
2. Provider webhooks land in `api/integrations/kommo/webhook.ts` (secret in URL, idempotent raw events, HTTP 503 on persistence failure so Kommo retries) and `api/sync/manual.ts` (`meta-webhook` rewrite).
3. Creative jobs: UI enqueues a job row → `workers/creative/main.ts` claims it and runs `pipeline.ts` → results written back to Supabase → UI reads through `src/features/creative-intelligence/data.ts`.

### Agent and Copilot Flows

- Text-generation features (`api/_lib/copiloto.ts`, `api/_lib/resumo-conversa.ts`, `api/_lib/sap-gerar.ts` with prompts from `api/_lib/sap-prompts.ts`) are invoked through `api/sync/manual.ts` and return text to the UI. Provider keys stay server-side.

**State Management:**
- Server state: TanStack Query (`QueryClient` created in `src/router.tsx`; cleared on logout per the session coordinator described in `docs/engineering-review.md`).
- URL state: date range and view selectors through TanStack Router `validateSearch` (e.g. `parseDateRangeSearch`, `parseContentViewSearch`).
- Client-only UI state: React state and `localStorage` (theme, Supabase session).

## Key Abstractions

**Client (tenant):**
- Purpose: The unit of isolation. Each clinic is a row in `clients` with members in `client_members`.
- Examples: `src/routes/_authenticated.$clientId.tsx`, `src/lib/client-data.ts`, `api/_lib/*` (all sync runners take a client id).
- Pattern: Every table carries `client_id`. Composite foreign keys enforce same-client relations (per `docs/engineering-review.md`).

**Sync status and freshness:**
- Purpose: Tracks when each source last synchronized and whether data is complete.
- Examples: `api/_lib/sync-status.ts`, `src/lib/status-fonte.ts`, `src/lib/saude-fontes.ts`, `src/components/source-health.tsx`.
- Pattern: Runners persist a checkpoint only after writes succeed.

**Navigation descriptor:**
- Purpose: Declarative menu, visibility per role and per product.
- Examples: `src/lib/nav.ts` (`AREAS`, `AVANCADO`, `ROTAS_DO_CRM`, `areasVisiveis`).
- Pattern: Visibility functions compute tabs from role and enabled sources; routes still enforce access.

**SAP form engine:**
- Purpose: Structured onboarding and planning forms with prompts and scores.
- Examples: `src/lib/sap-formularios-base.ts` and `sap-formularios-g1.ts` through `g5.ts`, `src/lib/sap-scores.ts`, `src/lib/sap-prompts-tela.ts`, `src/components/sap-formulario.tsx`.
- Pattern: Declarative definitions consumed by generic components.

**Creative job contract:**
- Purpose: Shared shape between UI and worker.
- Examples: `src/lib/creative-intelligence/contracts.ts`, `workers/creative/pipeline.ts`.
- Pattern: Versioned by `PIPELINE_VERSION`.

## Entry Points

**Browser app:**
- Location: `index.html` → `src/main.tsx`
- Triggers: Page load of the SPA.
- Responsibilities: Environment check, theme bootstrap, router mount.

**Router:**
- Location: `src/router.tsx` (`getRouter`), `src/routeTree.gen.ts` (generated, gitignored; regenerate with `npm run routes:generate`).
- Triggers: Navigation.
- Responsibilities: Route matching, code splitting (`autoCodeSplitting: true` in `vite.config.ts`).

**Manual sync API:**
- Location: `api/sync/manual.ts`
- Triggers: `fetch` from the dashboard, and rewrites in `vercel.json` (`/api/atendimento/canais`, `/api/atendimento/meta-webhook`, `/r/:slug` for short links).
- Responsibilities: Authenticated dispatch to service runners; short-link redirect for `/r/:slug`.

**Scheduled sync APIs:**
- Location: `api/sync/meta-ads.ts`, `meta-graph.ts`, `meta-comments.ts`, `instagram.ts`, `kommo-leads.ts`, `clint.ts`, `wts.ts`, `backfill-thumbnails.ts`
- Triggers: n8n or GitHub Actions with `SYNC_SECRET`.
- Responsibilities: Provider pulls with 300-second max duration (`vercel.json`).

**Kommo webhook:**
- Location: `api/integrations/kommo/webhook.ts`
- Triggers: Kommo lead events.
- Responsibilities: Verify secret, persist raw events idempotently, return 2xx only after persistence.

**Creative worker:**
- Location: `workers/creative/main.ts`
- Triggers: `node` process (Docker image or scheduled workflow with `--drain`).
- Responsibilities: Heartbeat, job claim, pipeline execution.

**MCP function:**
- Location: `supabase/functions/mcp/index.ts`
- Triggers: MCP clients over Streamable HTTP.
- Responsibilities: Read-only tool calls under the caller's identity.

## Architectural Constraints

- **Threading:** Browser single-threaded React rendering; server handlers are per-request serverless functions (`maxDuration` 300 s for sync endpoints). The creative worker is a single Node process with an `AbortController` for shutdown (`workers/creative/main.ts`).
- **Global state:** `src/router.tsx` creates a fresh `QueryClient` per `getRouter()` call (called once in `src/main.tsx`). `src/main.tsx` sets `document.title` and window listeners at module load.
- **Environment split:** `VITE_*` variables are inlined into the browser bundle and may only contain the Supabase URL and publishable key (`README.md`). Service keys are read from `process.env` in `api/` and `workers/`.
- **Shared code boundary:** `src/lib/*` is imported by `api/*` and `workers/*`. Modules used on the server must not import React or browser globals. Example: `api/sync/manual.ts` imports `../../src/lib/rastreio.js`.
- **Generated code:** `src/routeTree.gen.ts` is produced by `scripts/generate-routes.mjs`; `typecheck` regenerates it first.
- **Circular imports:** Not detected in the sampled imports. Not verified exhaustively.

## Anti-Patterns

### Hand-editing the generated route tree

**What happens:** Changes made directly in `src/routeTree.gen.ts`.
**Why it's wrong:** The file is regenerated on `dev`, `build`, and `routes:generate`, and is gitignored, so edits are lost.
**Do this instead:** Add or rename files under `src/routes/` and run `npm run routes:generate` (`scripts/generate-routes.mjs`).

### Selecting all columns from `clients`

**What happens:** `select("*")` on `clients` in the browser.
**Why it's wrong:** The table holds integration tokens (`wts_api_token`). `src/lib/client-data.ts` documents that `select *` would deliver them to every member's browser.
**Do this instead:** Keep the explicit column list used by `getClient()` in `src/lib/client-data.ts`, and add new columns deliberately.

### Trusting the route guard for authorization

**What happens:** Gating only through `src/routes/_authenticated.$clientId.tsx` or `useClientRole`.
**Why it's wrong:** Route guards and role hooks only shape the UI. Data and writes must be protected by RLS and by the handler checks in `api/sync/manual.ts`, per `README.md`.
**Do this instead:** Put the check in the database policy or in the API handler, and treat the UI check as presentation only.

### Synchronous writes that report success before persistence

**What happens:** Webhook or sync handler returns 200 before the database write completes.
**Why it's wrong:** Providers stop retrying, and data is lost. `docs/engineering-review.md` records this as a fixed high-priority defect in the Kommo webhook.
**Do this instead:** Persist first, then respond. Return 5xx on storage errors (see `api/integrations/kommo/webhook.ts`).

## Error Handling

**Strategy:** Errors propagate to the nearest boundary. Front-end query errors show inline states; route-level errors use `ErrorComponent` in `src/routes/__root.tsx`. Server handlers return explicit status codes and never report partial batches as complete.

**Patterns:**
- Sync runners throw on incomplete pagination and keep the old checkpoint (`api/_lib/sync-status.ts`, `api/_lib/wts-sync.ts`).
- Data helpers throw Supabase errors (`if (error) throw error;` in `src/lib/client-data.ts`) and are caught by TanStack Query.
- Observability wrapper `withApiObservability` (`api/_lib/observability.ts`) logs each request.
- Deploy recovery: stale chunk loads trigger one reload via `src/lib/deploy-recovery.ts`.

## Cross-Cutting Concerns

**Logging:** Server-side through `api/_lib/observability.ts`. Client does not use a logging library. PII masking helper at `api/_lib/mascarar-pii.ts`.

**Validation:** `zod` schemas on server requests (`api/_lib/request-validation.ts`, `api/sync/manual.ts` agendamento schema). Date and ticket parsing in `src/lib/date-range.ts` and `src/lib/ticket.ts`.

**Authentication:** Supabase Auth in the browser (`src/integrations/supabase/client.ts`, `src/hooks/use-auth.tsx`). Server endpoints check the bearer session or the `SYNC_SECRET` for automation. Webhook secrets are compared with `timingSafeEqual`.

**Security headers:** Set in `vercel.json` and mirrored in `vite.config.ts` for dev and preview (CSP `form-action 'self'`, `frame-ancestors 'none'`, HSTS).

---

*Architecture analysis: 2026-11-06*
