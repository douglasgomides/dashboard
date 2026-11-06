---
last_mapped_commit: 4ec717342419efd81373da4bb35f675df4ba1429
last_mapped_at: 2026-11-06
---
# External Integrations

**Analysis Date:** 2026-11-06

## APIs & External Services

**Meta (Facebook, Instagram, Ads):**
- Meta Graph API (`https://graph.facebook.com/v26.0`, version centralized in `api/_lib/meta-graph-versao.ts`, overridable via `META_GRAPH_VERSION`).
  - Used by: `api/_lib/meta-graph-sync.ts`, `api/_lib/meta-ads-sync.ts`, `api/_lib/meta-ads-graph-sync.ts`, `api/_lib/meta-comments-sync.ts`, `api/_lib/instagram-sync.ts`, `api/_lib/meta-audiencia.ts`, `api/_lib/anuncios-acoes.ts`, `api/_lib/meta-token-validade.ts`, `api/_lib/meta-limite.ts`, `api/_lib/central-meta.ts`.
  - Handlers: `api/sync/meta-graph.ts`, `api/sync/meta-ads.ts`, `api/sync/meta-comments.ts`, `api/sync/instagram.ts`.
  - Auth: `META_ACCESS_TOKEN` (general reads), `META_ADS_TOKEN` (ads reads), `META_ADS_WRITE_TOKEN` (ads write actions), per-account tokens stored in the database (migration `supabase/migrations/20260909180000_token_meta_por_conta.sql`).
  - Pagination is restricted to `graph.facebook.com` by `graphPageUrl()` in `api/_lib/integration-http.ts`.
- Meta Marketing API rate limits are tracked in `api/_lib/meta-limite.ts`.
- Instagram Business account data is also read via Windsor (see Windsor below).
- Meta webhooks (Nexo / Central de Atendimento):
  - Endpoint: `POST/GET /api/atendimento/meta-webhook` (rewritten by `vercel.json` to `api/sync/manual.ts?_central=meta-webhook`), implemented in `api/_lib/central-webhook.ts`.
  - Verification: `hub.verify_token` checked against `NEXO_META_VERIFY_TOKEN`.
  - Payload authenticity: HMAC `x-hub-signature-256` checked against `NEXO_META_APP_SECRET`. Returns 503 when the secret is missing.
  - App identifier: `NEXO_META_APP_ID`.
- Meta Comments on Instagram: classification in `api/_lib/meta-comments-sync.ts`, `api/_lib/classificar-comentario` (see `scripts/test-classificar-comentario.ts`).

**Windsor.ai (analytics aggregator):**
- Endpoint host: `https://connectors.windsor.ai/` (Instagram and Facebook connectors; documented at `https://windsor.ai/api-documentation/`).
- Used by: Windsor response parser `api/_lib/windsor-resposta.ts`. The creative worker README states Windsor collection remains the source for historical metrics.
- Auth: `WINDSOR_API_KEY`.
- Also available as an MCP connector to the assistant (see MCP section).

**Kommo (amoCRM) - CRM and leads:**
- Per-account domain, validated to `*.kommo.com`, `*.amocrm.com`, or `*.amocrm.ru` by `integrationHost()` in `api/_lib/integration-http.ts`.
- Used by: `api/_lib/kommo-leads-sync.ts`, `api/_lib/kommo-contatos.ts`, `api/_lib/kommo-reconcile.ts`, `api/_lib/conversas-kommo.ts`, `api/_lib/kommo-webhook.ts`.
- Handlers: `api/sync/kommo-leads.ts`, `api/integrations/kommo/webhook.ts` (incoming webhook).
- Auth: `KOMMO_API_TOKEN` (bearer token). Rate limit honored at 7 requests per second per account (`ritmo` in `api/_lib/integration-http.ts`).
- Webhook: `api/integrations/kommo/webhook.ts` ingests events into the database (migration `20260825160000_kommo_webhook_ingest.sql`, raw capture in `20260825170000_crm_raw_events_capture.sql`).

**Clint CRM:**
- Base URL: `https://api.clint.digital/v1` (deals at `/v1/deals`, contacts at `/v1/contacts/`). Public docs: `https://clint-api.readme.io`.
- Used by: `api/_lib/clint-sync.ts`, `api/_lib/clint-tags.ts`, `api/_lib/conversas-clint.ts`; handler `api/sync/clint.ts`.
- Auth: `api-token` request header (`api/_lib/clint-sync.ts`), token supplied per clinic; no shared key is hard-coded.

**RD Station CRM:**
- Base URL: `https://crm.rdstation.com/api/v1` (deals at `/api/v1/deals`).
- Used by: `api/_lib/rdstation-sync.ts`. Token stored per client in `crm_connections.access_token`.
- Shared retry and rate limiting via `api/_lib/integration-http.ts`.

**WTS / FlwChat (WhatsApp conversations):**
- Base URL: `https://api.wts.chat` (session at `/chat/v1/session`, CRM panel card at `/crm/v1/panel/card`).
- Used by: `api/_lib/wts-sync.ts`, `api/_lib/flwchat-sync.ts`, `api/_lib/conversas-wts.ts`; handler `api/sync/wts.ts`.
- Auth: `WTS_API_TOKEN` sent as `Authorization: Bearer`.
- Related schema: `supabase/migrations/20260909180502_wts_atendimento.sql`, `20260909180530_wts_atendimento_rpcs.sql`.

**Digisac (WhatsApp / chat):**
- Per-account domain validated to `*.digisac.io` by `integrationHost()`.
- Used by: `api/_lib/digisac-sync.ts`, `api/_lib/conversas-digisac.ts`, contract tests `scripts/test-contrato-digisac.ts`.
- Auth: `Authorization: Bearer <token>`; the token is stored per client in `crm_connections.access_token`.

**Hubla (checkout and sales):**
- Inbound only. Sales events are posted to the app by an n8n workflow:
  `POST /api/sync/manual?checkout=hubla&client_id=<uuid>` authenticated with `SYNC_SECRET`.
- Implemented in `api/_lib/checkout-vendas.ts`; handler `api/sync/manual.ts`.
- Historical import script: `scripts/carga-hubla-passado.ts`.

**Short.io (link shortener):**
- Base URLs: `https://api.short.io` and `https://api-v2.short.io`.
- Used by: `api/_lib/shortio.ts`, `api/_lib/shortio-sync.ts`; redirect route `/r/:slug` rewritten to `api/sync/manual.ts?r=:slug` (`api/_lib/redirecionar.ts`).
- Auth: `SHORTIO_API_KEY`.
- Link base: `LINK_BASE_URL` (exposed to the browser as `VITE_LINK_BASE_URL`).

**ClickUp (task management):**
- Base URL: `https://api.clickup.com/api/v2/task/`.
- Used by: `api/_lib/agentes.ts` to link SAP clinic milestones (`sap_marco_vinculos.clickup_task_id`, `sap_clinicas.clickup_folder_id`) to ClickUp tasks. Auth: `CLICKUP_API_TOKEN`.
- Frontend links to tasks use `https://app.clickup.com/t/...`.

**Google Drive and Google Docs / Sheets:**
- Google Sheets for ad planning data: `api/_lib/ads-planilha-sync.ts` accepts only links that match `https://docs.google.com/spreadsheets/d/...`.
- Google Docs references in product and SAP content (`https://docs.google.com/document/d/...`) and Drive file links appear in documentation and seed data (`docs/`, `scripts/fixtures/`); not called as APIs.

**OpenAI:**
- Base URL: `https://api.openai.com/v1`.
  - `POST /v1/chat/completions` - text generation, classification, summaries (`api/_lib/ia.ts`, `api/_lib/texto-ia.ts`, `api/_lib/tema-classifier.ts`, `api/_lib/resumo-conversa.ts`, `api/_lib/sessao-ia.ts`, `api/_lib/atendente.ts`, `api/_lib/question-classifier.ts`).
  - `POST /v1/audio/transcriptions` - speech-to-text (`whisper-1`, `gpt-4o-mini-transcribe`) in `api/_lib/transcrever-reels.ts` and the worker.
  - `POST /v1/images/generations` - image generation (`gpt-image-1`) in `api/_lib/creative-arte.ts`.
- Embeddings: `text-embedding-3-small` for semantic search over approved content.
- Models in use: `gpt-4.1`, `gpt-4.1-mini`, `gpt-4o-mini`, `gpt-4o-mini-transcribe`, `whisper-1`, `gpt-image-1`, `text-embedding-3-small`.
- Auth: `OPENAI_API_KEY`.
- Creative worker: uses `@ai-sdk/openai` via `workers/creative/providers.ts` (vision on images with `gpt-4.1-mini`, transcription with `whisper-1`).

**Anthropic (Claude):**
- Endpoint: `https://api.anthropic.com/v1/messages`.
- Used for agent and summary tasks through model overrides (`AGENTES_MODELO_CLAUDE`, `RESUMO_MODELO_CLAUDE`, `SESSAO_MODELO_CLAUDE`, `CLASSIFICADOR_MODELO_CLAUDE`, `SAP_PROMPT_MODELO_CLAUDE`) in `api/_lib/agentes.ts`, `api/_lib/ia.ts`, `api/_lib/sap-prompts.ts`.
- Models referenced: `claude-haiku-5-5`, `claude-sonnet-5-5`, `claude-haiku-4-5`, `claude-haiku-4-5-20251001`.
- Auth: `ANTHROPIC_API_KEY`.
- Contract test: `scripts/test-contrato-openai-anthropic.ts`.

**Apify (market research scraping):**
- Base URL: `https://api.apify.com`.
- Used by the creative worker for market radar (`workers/creative/` and `api/_lib/creative-*`). Enabled only when `APIFY_API_TOKEN` is present; TikTok actor gated by `CREATIVE_ENABLE_APIFY_TIKTOK`.
- Auth: `APIFY_API_TOKEN`.

**GitHub (workflow dispatch):**
- Base URL: `https://api.github.com/repos/<owner>/dashboard/actions/workflows/creative-worker.yml/dispatches`.
- Used to trigger the creative worker workflow on demand from the app.
- Auth: `GITHUB_DISPATCH_TOKEN`.

**Supabase Edge Function MCP server (assistant access):**
- Endpoint: `${SUPABASE_URL}/functions/v1/mcp` (`supabase/functions/mcp/index.ts`, client URL in `src/lib/mcp.ts`).
- Streamable HTTP JSON-RPC transport, read-only tools, OAuth 2.1 through Supabase Auth (PKCE). Discovery at `${SUPABASE_URL}/.well-known/oauth-authorization-server/auth/v1`.
- Every call is logged to the `mcp_chamadas` table; access is enforced by RLS through the caller's JWT.

## Data Storage

**Primary database:**
- Supabase-hosted PostgreSQL.
  - Client: `@supabase/supabase-js` (`src/integrations/supabase/client.ts` in the browser, `src/integrations/supabase/client.server.ts` and `api/_lib/*` on the server with the service role key).
  - Typed schema: `src/integrations/supabase/types.ts` (generated types, also copied into the worker Docker image).
  - Access control: Row Level Security policies and RPC functions defined in `supabase/migrations/` (for example `20260824190000_fix_rls_security_holes.sql`, `20260826040000_crm_funnel_rpc.sql`, `20260909220000_crm_reconciliacao.sql`). `SECURITY.md` states authorization must be enforced in the database and in service-role HTTP functions.
  - Schema management: migrations under `supabase/migrations/` are applied by `.github/workflows/banco.yml` (homolog first, then production behind the `producao` GitHub environment with required reviewers). Drift checks run through `scripts/banco/remontar.ts`, `scripts/banco/comparar.ts`, `scripts/banco/catalogo-json.sh`.
- Connection strings are provided to CI as secrets `SUPABASE_DB_URL_HOMOLOG` and `SUPABASE_DB_URL_PROD` (session pooler, password included). `psql` is installed on the runners.

**File storage:**
- Supabase Storage for private creative media and assets. Signed URLs last 5 minutes (per `workers/creative/README.md`).
- Bucket access protected by restrictive RLS policies; the worker uses the service role key.
- Local static assets: `api/_assets/creative/` (bundled into `api/sync/manual.ts` via `vercel.json` `includeFiles`), `public/` (`black/`, `product-previews/`, `privacidade-nexo.html`).

**Caching:**
- None detected as a separate service. HTTP responses from `/api/*` are sent with `Cache-Control: private, no-store, max-age=0` (`vercel.json`). Client-side caching is provided by TanStack Query.

## Authentication & Identity

**Auth provider:**
- Supabase Auth (email and password based sign-in; session persisted in `localStorage` with auto refresh, see `src/integrations/supabase/client.ts`).
  - Frontend routes guard authenticated areas under `src/routes/_authenticated*.tsx`.
  - Server endpoints verify the bearer JWT, or use the service role key for internal jobs.
  - Admin user provisioning: `api/admin/create-user.ts`, `api/admin/create-admin.ts` (service role).
  - OAuth 2.1 server provided by Supabase Auth for the MCP assistant integration (see MCP section above).
- Internal machine-to-machine authentication:
  - `SYNC_SECRET` (bearer) for scheduled sync actions called by n8n in `api/sync/manual.ts`. Comparison is constant-time (`timingSafeEqual` over SHA-256 digests). Restricted to actions that only generate suggestions for human review.
  - Meta webhooks use HMAC signatures (see Meta section).
  - Kommo webhook: `api/integrations/kommo/webhook.ts`.

## Monitoring & Observability

**Error tracking:**
- None detected (no Sentry, Datadog, or similar SDK in `package.json`).

**Logs and observability:**
- Application-level observability in `api/_lib/observability.ts` (structured logs and counters written from API handlers).
- Synchronization health in the `sync_status` table (queried by `api/_lib/sync-status.ts` and by the MCP server for `ultima_sincronizacao` and `dados_ate`).
- MCP call audit in the `mcp_chamadas` table.
- Production health checks run hourly from `.github/workflows/alertas.yml`, which runs `scripts/alertas/verificar.sql` through `psql` and opens or closes a GitHub issue labeled `alerta-producao` via `scripts/alertas/publicar.ts`.

## CI/CD & Deployment

**Hosting:**
- Vercel: static SPA from `dist/` and serverless functions from `api/`. Configuration: `vercel.json` (rewrites, headers, `maxDuration` 300 s on `api/sync/*`). Vercel ignore rules in `.vercelignore` exclude `workers/`, `work/`, `outputs/`, `dist`, and `.env*` from deploy.
- Supabase: database, Auth, Storage, and Edge Functions (`supabase/functions/mcp`).
- Creative worker: container image built from `workers/creative/Dockerfile` (not yet deployed to a provider per `workers/creative/README.md`).

**CI Pipeline (GitHub Actions, `.github/workflows/`):**
- `quality.yml` - On push to `claude/doctor-creator-hub-nixvw6`, on pull requests, and on manual dispatch. Runs npm audit, `npm run check` for the root and worker, build, Playwright E2E, and interface verification. Uploads evidence artifacts.
- `crm-piloto.yml` - On pull requests touching CRM paths. Runs CRM operation tests and Playwright specs for the Kanban.
- `banco.yml` - Database migration pipeline (see Data Storage). Uses `SUPABASE_DB_URL_HOMOLOG` and `SUPABASE_DB_URL_PROD`; production apply requires environment approval.
- `creative-worker.yml` - Schedule every 10 minutes between 06:00 and 21:00 Brasília time (`*/10 9-23 * * *` and `*/10 0 * * *` in UTC). Secrets: `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, optional `APIFY_API_TOKEN`; repository variable `CREATIVE_ENABLE_APIFY_TIKTOK`. Runs `scripts/creative-worker-prepare.mjs` and then the worker with `--once`.
- `alertas.yml` - Hourly production health check (`cron: "23 * * * *"`), secret `SUPABASE_DB_URL_PROD`.
- Scheduled and manual sync actions are triggered from n8n against `api/sync/manual.ts` (authenticated by `SYNC_SECRET`).

**GitHub Actions security:** Third-party actions are pinned to full commit SHAs (for example `actions/checkout@d23441a4...`, `actions/setup-node@24997072...`).

## Environment Configuration

**Required env vars for the web app (browser):**
- `VITE_SUPABASE_URL` - Supabase project URL.
- `VITE_SUPABASE_PUBLISHABLE_KEY` - Supabase publishable (anon) key.
- `VITE_LINK_BASE_URL` - Base URL for shortened links (optional for development).

**Required env vars for API handlers (Vercel):**
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (required by nearly all `api/` modules).
- `SYNC_SECRET` (n8n and scheduled sync authentication).
- Provider tokens for enabled connectors: `META_ACCESS_TOKEN`, `META_ADS_TOKEN`, `META_ADS_WRITE_TOKEN`, `KOMMO_API_TOKEN`, `WTS_API_TOKEN`, `CLICKUP_API_TOKEN`, `WINDSOR_API_KEY`, `SHORTIO_API_KEY`, `APIFY_API_TOKEN`, `GITHUB_DISPATCH_TOKEN`.
- Model providers: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`.
- Webhook verification: `NEXO_META_VERIFY_TOKEN`, `NEXO_META_APP_SECRET`, `NEXO_META_APP_ID`.
- Field encryption: `NEXO_CHANNELS_ENCRYPTION_KEY` (used in `api/_lib/central-canais.ts` to encrypt channel credentials).
- Optional: `META_GRAPH_VERSION` (default `v26.0`).

**Required env vars for the creative worker (`workers/creative`):**
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `CREATIVE_WORKER_ID`, `FFMPEG_PATH`, `FFPROBE_PATH`, optional `APIFY_API_TOKEN`, `CREATIVE_ENABLE_APIFY`, `CREATIVE_ENABLE_APIFY_TIKTOK`, `CREATIVE_ALLOW_PRODUCTION`, `CREATIVE_VISION_MODEL`, `CREATIVE_TRANSCRIPTION_MODEL`, cost tuning variables. Worker CLI flags: `--once`, `--job=<uuid>`, `--env=<file>`.

**Secrets location:**
- Local development: `.env.local` (git-ignored). Templates: `.env.example`, `workers/creative/.env.example`.
- CI: GitHub repository secrets and the `producao` environment (`Settings > Environments`) with required reviewers.
- Production runtime: Vercel project environment variables; Supabase project secrets for Edge Functions.
- `scripts/check-secrets.mjs` scans the repository for committed credentials as part of `npm run check`.

## Webhooks & Callbacks

**Incoming:**
- `POST /api/integrations/kommo/webhook` - Kommo CRM events (`api/integrations/kommo/webhook.ts`).
- `GET|POST /api/atendimento/meta-webhook` - Meta (Instagram / Messenger) webhook verification and events, signed with `x-hub-signature-256` (`api/_lib/central-webhook.ts`, routed via `vercel.json`).
- `GET /r/:slug` - Short link redirect (`api/_lib/redirecionar.ts`).
- `POST /api/sync/manual?checkout=hubla&client_id=<uuid>` - Hubla checkout sales from n8n (`SYNC_SECRET`).
- `POST /api/sync/manual?...` - Generic scheduled actions from n8n (`SYNC_SECRET`, restricted action list).
- `POST /functions/v1/mcp` - Supabase Edge Function for the assistant MCP server (OAuth bearer token).
- `api/atendimento/canais` - Channel listing rewrite to `api/sync/manual.ts?_central=canais`.

**Outgoing:**
- Outbound HTTP calls to all services listed above (Meta Graph, Windsor, Kommo, Clint, RD Station, WTS, Digisac, Short.io, ClickUp, OpenAI, Anthropic, Apify, GitHub API, Google Sheets).
- GitHub `workflow_dispatch` to `creative-worker.yml` via the GitHub API (`GITHUB_DISPATCH_TOKEN`).
- Email notifications: none detected in application code; the production alert workflow relies on GitHub issue notifications.
- WhatsApp deep links to `https://wa.me/` are generated for clinic contact buttons (not API calls).

## Assistant / MCP Connectors

The development assistant environment used with this repository is connected to additional external services through MCP. These are not runtime dependencies of the application but are referenced in operational workflows: Supabase, Vercel, Brevo (email), ClickUp, Notion, Gamma, Lovable, Windsor.ai, n8n, Clint, and Google Drive or Sheets connectors.

---

*Integration audit: 2026-11-06*
