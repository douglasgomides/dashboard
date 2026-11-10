---
last_mapped_commit: 4ec717342419efd81373da4bb35f675df4ba1429
last_mapped_at: 2026-11-06
---
# Technology Stack

**Analysis Date:** 2026-11-06

## Languages

**Primary:**
- TypeScript (strict mode) - Frontend SPA in `src/`, serverless HTTP handlers in `api/`, shared libraries in `api/_lib/`, operational scripts in `scripts/`, and the creative worker in `workers/creative/`. Config: `tsconfig.json` (target ES2022, `moduleResolution: Bundler`, path alias `@/*` -> `src/*`).
- TSX - React components and routes in `src/components/`, `src/features/`, `src/routes/`.

**Secondary:**
- SQL (PostgreSQL dialect) - Schema, RLS policies, and RPCs in `supabase/migrations/` (about 60 migration files, timestamped `YYYYMMDDHHMMSS_*.sql`), audits in `supabase/audits/`, and seeds in `supabase/seeds/`.
- TypeScript on Deno runtime - Supabase Edge Function `supabase/functions/mcp/index.ts` (imports `npm:@supabase/supabase-js@2.112.3`).
- JavaScript (ESM `.mjs`) - Helper scripts such as `scripts/check-secrets.mjs`, `scripts/generate-routes.mjs`, `scripts/run-tests.mjs`, `scripts/creative-worker-prepare.mjs`.
- Bash / shell - CI steps and DB helpers in `scripts/banco/` (for example `scripts/banco/aplicar.sh`, `scripts/banco/catalogo-json.sh`).
- CSS - Tailwind v4 utilities plus hand-written stylesheets: `src/styles.css`, `src/nexo.css`, `src/landing.css`, `src/sap-workspace.css`.

## Runtime

**Environment:**
- Node.js 22.x for the web app and CI - pinned by `.nvmrc` (`22`) and `package.json` `engines.node` (`22.x`).
- Node.js `>=22.12` for the creative worker - `workers/creative/package.json` `engines`.
- Node.js 24 in the worker container - `workers/creative/Dockerfile` base image `node:24-bookworm-slim`.
- Browser target: modern evergreen browsers (SPA built by Vite; Playwright tests run on Desktop Chrome).
- Deno (Supabase Edge Functions) - `supabase/functions/mcp/index.ts`.
- Vercel serverless functions - Node runtime with per-function `maxDuration` (300 s) in `vercel.json`.

**Package Manager:**
- npm
- Lockfiles: `package-lock.json` (root, present) and `workers/creative/package-lock.json` (worker, present).
- Install commands used in CI: `npm ci`, `npm ci --prefix workers/creative --ignore-scripts`.

## Frameworks

**Core:**
- React 19 (`react` / `react-dom` `^19.2.0`) - UI library, entry `src/main.tsx`.
- TanStack Router (`@tanstack/react-router` `^1.168.25`) - File-based routing in `src/routes/`, generated tree `src/routeTree.gen.ts` (generated, not hand-edited). Generator: `@tanstack/router-plugin` and `@tanstack/router-generator`. Auto code splitting enabled in `vite.config.ts`.
- TanStack Query (`@tanstack/react-query` `^5.83.0`) - Server state and data fetching on the client.
- Vercel serverless handlers - Plain request/response handlers in `api/**/*.ts`, deployed by `vercel.json` (rewrites route `/api/atendimento/*`, `/r/:slug` to `api/sync/manual.ts`).
- Supabase (PostgreSQL + Auth + Storage + Edge Functions) - Primary database and identity provider. Client in `src/integrations/supabase/client.ts`, server-side client in `src/integrations/supabase/client.server.ts`.

**Charts and documents:**
- Recharts (`recharts` `^2.15.4`) - Dashboard charts.
- `@react-pdf/renderer` (`^4.8.1`) - PDF report generation (for example, `RELATORIO_PDF_OUT` used in the Playwright service-delivery flow).
- `@resvg/resvg-js` (`2.6.2`) and `fontkit` (`2.0.4`) - Server-side SVG rasterization and font handling for generated creative images, used from `api/_lib/creative-compositor.ts` and related modules.
- `fflate` (`0.8.3`) - Compression utility.
- `franc-min` (`6.2.0`) - Language detection for text content.

**Validation and utilities:**
- Zod (`zod` `^4.6.7`) - Schema validation (also a dependency of the worker).
- `date-fns` (`^4.1.0`) - Date handling.
- `clsx` (`^2.1.1`) and `tailwind-merge` (`^3.5.0`) - Class name composition.
- `lucide-react` (`^0.575.0`) - Icons.

**Styling:**
- Tailwind CSS v4 (`tailwindcss` and `@tailwindcss/vite` `^4.3.3`) - Configured through the Vite plugin in `vite.config.ts`.

**Testing:**
- Playwright (`@playwright/test` `1.64.1`) - End-to-end tests in `tests/e2e/*.spec.ts`. Config: `playwright.config.ts` (base URL `http://127.0.0.1:5198`, runs `npm run build` then `npm run preview` unless `PLAYWRIGHT_SKIP_BUILD=1`).
- `@axe-core/playwright` (`4.14.0`) - Accessibility assertions inside Playwright.
- `@electric-sql/pglite` (`^0.5.10`) - In-process PostgreSQL for local tests.
- Custom test runner - `scripts/run-tests.mjs` (invoked by `npm test`), with about 90 `scripts/test-*.ts` suites run through `tsx`.
- Interface verification - `scripts/verify-nexo-interface.mjs` (`npm run test:interface`).

**Build/Dev:**
- Vite (`vite` `^7.3.1`) - Dev server and bundler. Config: `vite.config.ts` (plugins: `vite-tsconfig-paths`, `@tailwindcss/vite`, `@tanstack/router-plugin/vite`, `@vitejs/plugin-react` `^5.0.4`). The security headers from `vercel.json` are mirrored onto Vite's dev and preview servers.
- TypeScript (`typescript` `^5.8.3`) - Type checking via `npm run typecheck` (`tsc --noEmit` after `routes:generate`).
- ESLint (`eslint` `^9.32.0`) with `@typescript-eslint/parser` `^8.71.2` and `eslint-plugin-react-hooks` `^5.2.0`. Config: `eslint.config.js` (flat config, rule set limited to syntax and control-flow errors).
- `tsx` (`^4.19.2`) - Runs TypeScript scripts directly (`scripts/*.ts`, `workers/creative/main.ts`).
- Supabase CLI (`supabase` `^2.30.0`) - Local stack and migrations tooling.

## Key Dependencies

**Critical:**
- `@supabase/supabase-js` (`^2.105.4`) - Database, Auth, and Storage client for the web app, API handlers, and worker. Client-side keys are read from `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; server handlers use `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- `ai` (`7.0.143`) and `@ai-sdk/openai` (`4.0.96`) - Vercel AI SDK used by the creative worker (`workers/creative/providers.ts`). Only in `workers/creative/package.json`.
- `tsx` - Required at runtime by the worker start script (`workers/creative`: `"start": "tsx main.ts"`).
- `ffmpeg-static` (`^5.3.0`) and `ffprobe-static` (`^3.1.0`) - Dev dependencies of the worker; the production container installs system `ffmpeg` and points `FFMPEG_PATH` / `FFPROBE_PATH` at it.

**Infrastructure:**
- `@tanstack/react-router` and `@tanstack/react-query` - App shell and data layer (see Frameworks).
- `@types/node` (`^22.16.5`), `@types/react` / `@types/react-dom` (`^19.2.0`), `@types/fontkit` (`2.0.9`) - Type definitions.
- `supabase` CLI package - Dev-only; used by the `banco.yml` workflow indirectly through scripts.

**Worker-only (`workers/creative/package.json`):**
- `@supabase/supabase-js` `^2.105.4`, `zod` `^4.6.7`, `tsx` `^4.19.2`, `ai` `7.0.143`, `@ai-sdk/openai` `4.0.96`.

## Configuration

**Environment:**
- Variables are read from `process.env` on the server and from `import.meta.env` in the browser (only `VITE_`-prefixed names are exposed to Vite).
- Browser-exposed variables (only these are allowed to reach the client bundle, per `README.md`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_LINK_BASE_URL`.
- Server-side variables referenced in code (names only; values are never recorded here):
  - Supabase: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_ANON_KEY` (Edge Function).
  - AI providers: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`.
  - Meta: `META_ACCESS_TOKEN`, `META_ADS_TOKEN`, `META_ADS_WRITE_TOKEN`, `META_GRAPH_VERSION` (default `v26.0`), `META_GRAPH_API_VERSION`, `NEXO_META_APP_ID`, `NEXO_META_APP_SECRET`, `NEXO_META_VERIFY_TOKEN`.
  - CRM and messaging connectors: `KOMMO_API_TOKEN`, `WTS_API_TOKEN`, `CLICKUP_API_TOKEN`.
  - Analytics and link shortening: `WINDSOR_API_KEY`, `SHORTIO_API_KEY`, `LINK_BASE_URL`.
  - Scraping/research: `APIFY_API_TOKEN`.
  - Internal auth and encryption: `SYNC_SECRET`, `NEXO_CHANNELS_ENCRYPTION_KEY`.
  - CI dispatch: `GITHUB_DISPATCH_TOKEN`.
  - Model selection overrides: `AGENTES_MODELO`, `AGENTES_MODELO_CLAUDE`, `AGENTES_MODELO_FORTE`, `AGENTES_MODELO_CLAUDE_FORTE`, `CLASSIFICADOR_MODELO`, `CLASSIFICADOR_MODELO_CLAUDE`, `RESUMO_MODELO`, `RESUMO_MODELO_CLAUDE`, `SESSAO_MODELO`, `SESSAO_MODELO_CLAUDE`, `SAP_PROMPT_MODELO`, `SAP_PROMPT_MODELO_CLAUDE`, `TRANSCRICAO_MODELO`, `ARTE_MODELO`, `CREATIVE_VISION_MODEL`, `CREATIVE_TRANSCRIPTION_MODEL`.
  - Creative worker: `CREATIVE_ALLOW_PRODUCTION`, `CREATIVE_WORKER_ID`, `CREATIVE_ENABLE_APIFY`, `CREATIVE_ENABLE_APIFY_TIKTOK`, `CREATIVE_META_VERSION`, `CREATIVE_INPUT_USD_PER_MILLION`, `CREATIVE_OUTPUT_USD_PER_MILLION`, `FFMPEG_PATH`, `FFPROBE_PATH`, `ARTE_QUALIDADE`.
  - Playwright and tooling: `PLAYWRIGHT_CHANNEL`, `PLAYWRIGHT_SKIP_BUILD`, `INTERFACE_BASE_URL`, `INTERFACE_CASE`, `CAPTURE_BASE_URL`.
- Environment templates: `.env.example` at repo root and `workers/creative/.env.example` exist. Local env files (`.env*`) are git-ignored (`.gitignore`, `.dockerignore`, `.vercelignore`). Do not commit `.env.*` files.
- Documented setup: copy `.env.example` to `.env.local` and fill the Supabase URL and publishable key for a development project (`README.md`).

**Build:**
- `vite.config.ts` - SPA build; output directory `dist/` (contains `index.html`, `assets/`, `privacidade-nexo.html`, `product-previews/`).
- `tsconfig.json` - Includes `src`, `scripts`, `api`, `tests`, and root `*.config.ts`. `incremental` build info written to `node_modules/.cache/typecheck.tsbuildinfo`.
- `eslint.config.js` - Flat config; ignores `dist/`, `.tanstack/`, `src/routeTree.gen.ts`, `playwright-report/`, `test-results/`.
- `playwright.config.ts` - E2E configuration (single web server on port 5198, HTML and JSON reporters).
- `vercel.json` - Rewrites (SPA fallback to `/index.html`, API rewrites), per-function `maxDuration` (300 s for `api/sync/*`), `includeFiles` for `api/_assets/creative/**`, and global security headers (CSP `base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'`, HSTS, X-Frame-Options DENY, Permissions-Policy blocking camera, microphone, geolocation). `/api/*` responses are `Cache-Control: private, no-store`.
- `.nvmrc` - `22`.

**npm scripts (`package.json`):**
- `npm run dev` - Vite dev server.
- `npm run build` - Production build to `dist/`.
- `npm run preview` - Serve the built bundle.
- `npm run typecheck` - Generates routes then runs `tsc --noEmit`.
- `npm run lint` - ESLint over the repo.
- `npm test` - `scripts/run-tests.mjs`.
- `npm run test:e2e` - Playwright.
- `npm run check` - `secrets:check` (`scripts/check-secrets.mjs`) + lint + typecheck + tests.
- `npm run sync:instagram`, `npm run test:sync`, `npm run test:migrations`, `npm run contrato:ao-vivo` - Operational scripts run through `tsx`.

## Platform Requirements

**Development:**
- Node.js 22.12 or newer and npm (`README.md`).
- A Supabase development project providing `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. CI uses placeholder values pointing at `http://localhost:9`.
- Playwright Chromium for E2E (`npx playwright install --with-deps chromium`).
- For the creative worker: system FFmpeg and FFprobe (`ffmpeg` and `ffprobe` on PATH, or `FFMPEG_PATH` / `FFPROBE_PATH`).
- Docker is optional; `workers/creative/Dockerfile` builds from the repository root context.

**Production:**
- Frontend and HTTP handlers: Vercel (static SPA from `dist/` plus serverless functions from `api/`). Configuration in `vercel.json`. Production hostnames referenced in code include `dash.doctorcreator.com.br`, `nexo.doctorcreator.com.br`, and `sap.doctorcreator.com.br`.
- Database, Auth, Storage, and Edge Functions: Supabase (project ref referenced in `.github/workflows/creative-worker.yml`).
- Creative worker: long-running or one-shot Node process in a container (`workers/creative/Dockerfile`, `CMD ["node","--import","tsx","workers/creative/main.ts","--once"]`). Deployment target is not configured in the repository; the worker README states the permanent service has not yet been provisioned.
- Scheduled jobs: GitHub Actions (`.github/workflows/*.yml`) on `ubuntu-24.04` runners with Node from `.nvmrc`, plus `psql` (PostgreSQL client) for database checks.

---

*Stack analysis: 2026-11-06*
